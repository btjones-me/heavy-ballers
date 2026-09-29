import { demoScope, requireDemoSnapshot, overlayDemo } from './demo-session';
import { all, canonical, db, ensureSeed, first, newId, now, parseData, sha256 } from './db';
import { AppError, type Bootstrap, type Content, type Fixture, type FixturePatch, type Player, type Season, type Team } from './types';
import { validateFixture } from './league-model';
export { calculateStandings, calculateGoalscorers, validateFixture } from './league-model';

export async function getBootstrap(): Promise<Bootstrap> {
  await ensureSeed();
  // One D1 batch gives a consistent snapshot while demo writes are happening.
  const statements = ['SELECT data FROM seasons ORDER BY id', 'SELECT data FROM teams ORDER BY id', 'SELECT data FROM players ORDER BY id', 'SELECT data FROM fixtures ORDER BY id', "SELECT key,value FROM kv WHERE key IN ('content','revision')"];
  const result = await db().batch(statements.map(sql => db().prepare(sql)));
  const settings = (result[4].results ?? []) as { key: string; value: string }[];
  const base: Bootstrap = { seasons: parseData<Season>((result[0].results ?? []) as { data: string }[]), teams: parseData<Team>((result[1].results ?? []) as { data: string }[]), players: parseData<Player>((result[2].results ?? []) as { data: string }[]), fixtures: parseData<Fixture>((result[3].results ?? []) as { data: string }[]), content: JSON.parse(settings.find(row => row.key === 'content')?.value ?? '{}') as Content, revision: Number(settings.find(row => row.key === 'revision')?.value ?? '0') };
  return demoScope() ? overlayDemo(base, await requireDemoSnapshot()) : base;
}

export async function updateFixture(id: string, patch: FixturePatch, expectedVersion: number, actor: string, operationId: string): Promise<Fixture> {
  if (!operationId || operationId.length > 160) throw new AppError('A unique operation identifier is required.');
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new AppError('A valid expected match version is required.');
  await ensureSeed();
  const scope = demoScope();
  if (scope) operationId = 'private:' + await sha256(scope + ':' + operationId);
  const requestHash = await sha256(canonical({ id, patch, expectedVersion, actor }));
  async function priorResult() {
    const prior = await first<{ request_hash: string; result_json: string }>('SELECT request_hash,result_json FROM operations WHERE id=?', operationId);
    if (!prior) return null;
    if (prior.request_hash !== requestHash) throw new AppError('This operation identifier was already used for a different update.', 409, 'IDEMPOTENCY_CONFLICT');
    return JSON.parse(prior.result_json) as Fixture;
  }
  const prior = await priorResult(); if (prior) return prior;
  const privateSnapshot = scope ? await requireDemoSnapshot() : null;
  const state = await getBootstrap();
  const current = state.fixtures.find(fixture => fixture.id === id);
  if (!current) throw new AppError('Match not found.', 404, 'NOT_FOUND');
  if (scope && !privateSnapshot!.fixtures.some(f => f.id === id)) throw new AppError('Only your fictional demo season can be updated.', 403, 'DEMO_SCOPE');
  if (current.version !== expectedVersion) throw new AppError('This match changed. Refresh it before saving.', 409, 'STALE_VERSION');
  const next = validateFixture(current, patch, state);
  const serialized = JSON.stringify(next), changedAt = now(), database = db();
  try {
    const result = await database.batch(scope ? [
      database.prepare("UPDATE demo_sessions SET data=json_set(data,'$.fixtures',json(?),'$.revision',json_extract(data,'$.revision')+1),version=version+1 WHERE id=? AND expires_at>? AND version=?").bind(JSON.stringify(state.fixtures.filter(f => f.seasonId === current.seasonId).map(f => f.id === id ? next : f)), scope, Date.now(), privateSnapshot!.revision - 1),
      database.prepare('INSERT INTO changes(id,kind,record_id,actor,before_json,after_json,created_at,operation_id) SELECT ?,?,?,?,?,?,?,? WHERE changes()>0').bind(newId(), 'demo-fixture', `visitor:${scope}:${id}`, 'private-demo', JSON.stringify(current), serialized, changedAt, operationId),
      database.prepare('INSERT INTO operations(id,fixture_id,request_hash,result_json) SELECT ?,?,?,? WHERE changes()>0').bind(operationId, `visitor:${scope}:${id}`, requestHash, serialized),
    ] : [
      database.prepare('UPDATE fixtures SET season_id=?, home_team_id=?,away_team_id=?,version=?,data=? WHERE id=? AND version=?').bind(next.seasonId, next.homeTeamId, next.awayTeamId, next.version, serialized, id, expectedVersion),
      database.prepare('INSERT INTO changes(id,kind,record_id,actor,before_json,after_json,created_at,operation_id) SELECT ?,?,?,?,?,?,?,? WHERE changes()>0').bind(newId(), 'fixture', id, actor, JSON.stringify(current), serialized, changedAt, operationId),
      database.prepare('INSERT INTO operations(id,fixture_id,request_hash,result_json) SELECT ?,?,?,? WHERE changes()>0').bind(operationId, id, requestHash, serialized),
      database.prepare("UPDATE kv SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT) WHERE key='revision' AND changes()>0"),
    ]);
    if (!result[0].meta.changes) { const concurrent = await priorResult(); if (concurrent) return concurrent; throw new AppError('Another report changed this match. Refresh it before saving.', 409, 'STALE_VERSION'); }
    return next;
  } catch (error) { const concurrent = await priorResult(); if (concurrent) return concurrent; throw error; }
}
