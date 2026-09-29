import { all, canonical, db, ensureSeed, first, newId, now, run, sha256 } from './db';
import { getBootstrap, updateFixture } from './league';
import { rateLimit } from './auth';
import { DEMO_SEASON_ID, demoPlayers, demoSeason, demoTeams, makeDemoFixtures } from './seed';
import { AppError, type Content, type Fixture, type FixturePatch, type Player, type Season, type Team } from './types';
import { validateFixture } from './league-model';

type Kind = 'season' | 'team' | 'player' | 'fixture' | 'content';
type JsonRecord = Record<string, unknown>;
const tables = { season: 'seasons', team: 'teams', player: 'players', fixture: 'fixtures' } as const;
function string(value: unknown, label: string, max = 200, required = true): asserts value is string { if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new AppError(`${label} is required and must be under ${max} characters.`); }
function identifier(value: unknown): asserts value is string { string(value, 'ID', 100); if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new AppError('IDs may contain only letters, numbers, hyphens and underscores.'); }
function imageUrl(value: unknown): void { if (value === undefined || value === '') return; string(value, 'Image URL', 2000); if (!(value.startsWith('/') && !value.startsWith('//')) && !/^https:\/\//i.test(value)) throw new AppError('Images must use a site path or HTTPS URL.'); }
function externalUrl(value: unknown): void { if (value === '') return; string(value, 'Link', 2000); if (!/^https:\/\//i.test(value)) throw new AppError('Social links must use HTTPS.'); }
function validateContent(record: JsonRecord): Content {
  for (const key of ['heroTitle', 'heroIntro', 'heroMore', 'heroImage', 'instagram', 'youtube', 'venue', 'venueAddress', 'contactIntro', 'privacyText']) string(record[key], key, key === 'privacyText' ? 10000 : 4000, false);
  imageUrl(record.heroImage); externalUrl(record.instagram); externalUrl(record.youtube);
  if (!Array.isArray(record.gallery) || record.gallery.length > 100) throw new AppError('Gallery must contain up to 100 image paths.');
  record.gallery.forEach(imageUrl);
  if (!Array.isArray(record.benefits) || record.benefits.length > 12) throw new AppError('Use up to 12 benefit cards.');
  for (const item of record.benefits) { if (!item || typeof item !== 'object') throw new AppError('Invalid benefit card.'); string(item.title, 'Benefit title', 200); string(item.body, 'Benefit description', 4000, false); imageUrl(item.image); }
  if (!Array.isArray(record.stats) || record.stats.length > 12) throw new AppError('Use up to 12 statistics.');
  for (const item of record.stats) { if (!item || typeof item !== 'object') throw new AppError('Invalid statistic.'); string(item.label, 'Statistic label', 200); string(item.value, 'Statistic value', 200); }
  return record as unknown as Content;
}

export async function adminState() {
  const bootstrap = await getBootstrap();
  const [enquiries, changes, usage] = await Promise.all([
    all<{ id: string; name: string; email: string; phone: string; league: string; consent: number; message: string; created_at: string }>('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 500'),
    all<{ id: string; kind: string; record_id: string; actor: string; before_json: string | null; after_json: string; created_at: string }>('SELECT * FROM changes ORDER BY created_at DESC LIMIT 200'),
    all<{ month: string; reserved: number; spent: number }>('SELECT * FROM usage ORDER BY month DESC LIMIT 12'),
  ]);
  return { bootstrap, enquiries: enquiries.map(({ created_at, consent, ...row }) => ({ ...row, consent: Boolean(consent), createdAt: created_at })), changes: changes.map(row => ({ id: row.id, kind: row.kind, recordId: row.record_id, actor: row.actor, before: row.before_json ? JSON.parse(row.before_json) : null, after: JSON.parse(row.after_json), createdAt: row.created_at })), usage };
}

export async function saveRecord(kind: Kind, record: unknown, expectedVersion?: number, actor = 'admin'): Promise<unknown> {
  if (!['season', 'team', 'player', 'fixture', 'content'].includes(kind)) throw new AppError('Unknown record type.');
  if (!record || typeof record !== 'object' || Array.isArray(record) || JSON.stringify(record).length > 100000) throw new AppError('Provide a valid record.');
  const input = record as JsonRecord;
  if (kind !== 'content') identifier(input.id);
  const state = await getBootstrap();
  const id = kind === 'content' ? 'content' : input.id as string;
  const prior = kind === 'content' ? { data: JSON.stringify(state.content) } : await first<{ data: string }>(`SELECT data FROM ${tables[kind]} WHERE id=?`, id);
  const previous = prior ? JSON.parse(prior.data) : null;
  let validated: unknown;
  if (kind === 'season') {
    string(input.name, 'Season name');
    if (!['tuesday', 'saturday'].includes(input.league as string) || typeof input.demo !== 'boolean') throw new AppError('Choose a valid league and demo setting.');
    if (previous && previous.demo !== input.demo) throw new AppError('An existing season cannot switch between demo and archive.');
    if (input.demo && id !== DEMO_SEASON_ID) throw new AppError('Only the dedicated fictional season can be a demo.');
    const rules = input.rules as Season['rules'];
    if (!rules || ![rules.win, rules.draw, rules.shootout].every(value => Number.isInteger(value) && value >= 0 && value <= 10)) throw new AppError('Scoring points must be whole numbers from 0 to 10.');
    validated = { id, name: input.name, league: input.league, demo: input.demo, rules };
  } else if (kind === 'team') {
    string(input.name, 'Team name'); string(input.shortName, 'Short name', 16);
    if (typeof input.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(input.color)) throw new AppError('Use a six-digit hex colour.');
    if (!state.seasons.some(season => season.id === input.seasonId)) throw new AppError('Choose a valid season.');
    if (previous && previous.seasonId !== input.seasonId && state.fixtures.some(fixture => fixture.homeTeamId === id || fixture.awayTeamId === id)) throw new AppError('A team with fixtures cannot move to another season.');
    imageUrl(input.photo); imageUrl(input.badge);
    validated = { id, seasonId: input.seasonId, name: input.name, shortName: input.shortName, color: input.color, ...(input.photo ? { photo: input.photo } : {}), ...(input.badge ? { badge: input.badge } : {}) };
  } else if (kind === 'player') {
    string(input.name, 'Player name');
    if (!state.teams.some(team => team.id === input.teamId)) throw new AppError('Choose a valid team.');
    if (!Array.isArray(input.aliases) || input.aliases.length > 30 || !input.aliases.every(alias => typeof alias === 'string' && alias.length > 0 && alias.length <= 100)) throw new AppError('Enter up to 30 short aliases.');
    if (previous && previous.teamId !== input.teamId && state.fixtures.some(fixture => [...fixture.homeScorers, ...fixture.awayScorers].some(scorer => scorer.playerId === id))) throw new AppError('A player with recorded goals cannot move teams. Create a new season player record.');
    imageUrl(input.photo); if (input.position !== undefined) string(input.position, 'Position', 100, false);
    validated = { id, teamId: input.teamId, name: input.name, aliases: [...new Set(input.aliases)], ...(input.photo ? { photo: input.photo } : {}), ...(input.position ? { position: input.position } : {}) };
  } else if (kind === 'fixture') {
    const { id: ignoredId, version: ignoredVersion, ...patch } = input;
    if (previous) return updateFixture(id, patch as FixturePatch, expectedVersion ?? Number(input.version), actor, `admin:${newId()}`);
    const blank = { ...input, version: -1 } as unknown as Fixture;
    validated = validateFixture(blank, patch as FixturePatch, state);
  } else validated = validateContent(input);
  const data = JSON.stringify(validated), database = db();
  let statement;
  if (kind === 'content') statement = database.prepare('UPDATE kv SET value=? WHERE key=? AND value=?').bind(data, 'content', prior?.data);
  else if (previous) {
    if (kind === 'team') statement = database.prepare('UPDATE teams SET season_id=?,data=? WHERE id=? AND data=?').bind((validated as Team).seasonId, data, id, prior?.data);
    else if (kind === 'player') statement = database.prepare('UPDATE players SET team_id=?,data=? WHERE id=? AND data=?').bind((validated as Player).teamId, data, id, prior?.data);
    else statement = database.prepare('UPDATE seasons SET data=? WHERE id=? AND data=?').bind(data, id, prior?.data);
  } else {
    if (kind === 'season') statement = database.prepare('INSERT OR IGNORE INTO seasons(id,data) VALUES(?,?)').bind(id, data);
    else if (kind === 'team') statement = database.prepare('INSERT OR IGNORE INTO teams(id,season_id,data) VALUES(?,?,?)').bind(id, (validated as Team).seasonId, data);
    else if (kind === 'player') statement = database.prepare('INSERT OR IGNORE INTO players(id,team_id,data) VALUES(?,?,?)').bind(id, (validated as Player).teamId, data);
    else { const match = validated as Fixture; statement = database.prepare('INSERT OR IGNORE INTO fixtures(id,season_id,home_team_id,away_team_id,version,data) VALUES(?,?,?,?,?,?)').bind(id, match.seasonId, match.homeTeamId, match.awayTeamId, match.version, data); }
  }
  const result = await database.batch([statement, database.prepare('INSERT INTO changes(id,kind,record_id,actor,before_json,after_json,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()>0').bind(newId(), kind, id, actor, prior?.data ?? null, data, now()), database.prepare("UPDATE kv SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT) WHERE key='revision' AND changes()>0")]);
  if (!result[0].meta.changes) throw new AppError('This record changed while you were editing. Refresh and try again.', 409, 'STALE_VERSION');
  return validated;
}

export async function undoChange(id: string, actor = 'admin') {
  const change = await first<{ kind: string; record_id: string; before_json: string | null; after_json: string }>('SELECT kind,record_id,before_json,after_json FROM changes WHERE id=?', id);
  if (!change || change.kind !== 'fixture' || !change.before_json) throw new AppError('Only existing match corrections can be undone.');
  const current = await first<{ data: string }>('SELECT data FROM fixtures WHERE id=?', change.record_id);
  if (!current || canonical(JSON.parse(current.data)) !== canonical(JSON.parse(change.after_json))) throw new AppError('This match has changed since that correction. Edit its current result instead.', 409, 'STALE_VERSION');
  const { id: _id, version: _version, ...before } = JSON.parse(change.before_json) as Fixture;
  return updateFixture(change.record_id, before, (JSON.parse(current.data) as Fixture).version, `${actor}:undo`, `undo:${id}`);
}

export async function resetDemo(actor = 'admin') {
  await ensureSeed();
  const database = db(), token = newId(), busy = JSON.stringify({ token, expiresAt: Date.now() + 60000 });
  const acquired = await database.prepare("INSERT INTO kv(key,value) VALUES('demo:busy',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(json_extract(value,'$.expiresAt') AS INTEGER)<=?").bind(busy, Date.now()).run();
  if (!acquired.meta.changes) throw new AppError('Wait for the current demo message to finish before resetting.', 409, 'DEMO_BUSY');
  try {
    const fixtures = makeDemoFixtures(), state = await getBootstrap();
    const statements = [
      database.prepare('DELETE FROM operations WHERE fixture_id IN (SELECT id FROM fixtures WHERE season_id=?)').bind(DEMO_SEASON_ID),
      database.prepare('DELETE FROM fixtures WHERE season_id=?').bind(DEMO_SEASON_ID),
      database.prepare('DELETE FROM players WHERE team_id IN (SELECT id FROM teams WHERE season_id=?)').bind(DEMO_SEASON_ID),
      database.prepare('DELETE FROM teams WHERE season_id=?').bind(DEMO_SEASON_ID),
      database.prepare('UPDATE seasons SET data=? WHERE id=?').bind(JSON.stringify(demoSeason), DEMO_SEASON_ID),
      ...demoTeams.map(team => database.prepare('INSERT INTO teams(id,season_id,data) VALUES(?,?,?)').bind(team.id, team.seasonId, JSON.stringify(team))),
      ...demoPlayers.map(player => database.prepare('INSERT INTO players(id,team_id,data) VALUES(?,?,?)').bind(player.id, player.teamId, JSON.stringify(player))),
      ...fixtures.map(fixture => database.prepare('INSERT INTO fixtures(id,season_id,home_team_id,away_team_id,version,data) VALUES(?,?,?,?,?,?)').bind(fixture.id, fixture.seasonId, fixture.homeTeamId, fixture.awayTeamId, fixture.version, JSON.stringify(fixture))),
      database.prepare('DELETE FROM messages WHERE conversationId=?').bind('queens-pork-demo'),
      database.prepare("DELETE FROM events WHERE session_id='' AND type IN ('demo','ai','tool')"),
      database.prepare("DELETE FROM kv WHERE key IN ('demo:lock','demo:sequence','demo:conversation','demo:presentation')"),
      database.prepare("DELETE FROM kv WHERE key LIKE 'demo:message:%'"),
      database.prepare("UPDATE kv SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT) WHERE key='revision'"),
      database.prepare('INSERT INTO changes(id,kind,record_id,actor,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)').bind(newId(), 'reset', DEMO_SEASON_ID, actor, JSON.stringify({ fixtures: state.fixtures.filter(f => f.seasonId === DEMO_SEASON_ID) }), JSON.stringify({ fixtures }), now()),
      database.prepare("DELETE FROM kv WHERE key='demo:busy' AND value=?").bind(busy),
    ];
    await database.batch(statements);
    return { ok: true };
  } catch (error) { await run("DELETE FROM kv WHERE key='demo:busy' AND value=?", busy); throw error; }
}

export async function submitEnquiry(input: { name: string; email: string; phone?: string; league?: string; consent?: boolean; website?: string; message?: string }, ip = 'unknown') {
  if (input.website) return { ok: true };
  string(input.name, 'Name', 160); string(input.email, 'Email', 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new AppError('Enter a valid email address.');
  if (input.consent !== true) throw new AppError('Please agree to being contacted about your enquiry.');
  string(input.phone ?? '', 'Phone', 60, false); string(input.message ?? '', 'Message', 4000, false);
  if (!['', 'tuesday', 'saturday', 'both', 'Tuesday', 'Saturday', 'Both'].includes(input.league ?? '')) throw new AppError('Choose Tuesday, Saturday or both leagues.');
  await rateLimit(`enquiry:${await sha256(ip)}`, 5, 3600);
  const id = newId();
  await run('INSERT INTO enquiries(id,name,email,phone,league,consent,message,created_at) VALUES(?,?,?,?,?,?,?,?)', id, input.name.trim(), input.email.trim(), input.phone?.trim() ?? '', input.league ?? '', 1, input.message?.trim() ?? '', now());
  return { ok: true, id };
}
