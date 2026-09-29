import { AsyncLocalStorage } from 'node:async_hooks';
import { db, first, newId, sha256 } from './db';
import { assertSameOrigin, rateLimit } from './auth';
import { AppError, type Bootstrap } from './types';
import { demoSeason, demoTeams, demoPlayers, makeDemoFixtures, DEMO_SEASON_ID } from './seed';

const context = new AsyncLocalStorage<string>();
export const demoScope = () => context.getStore() ?? '';
export const withDemoScope = <T>(id: string, task: () => T): T => context.run(id, task);
export const demoKey = (key: string) => demoScope() ? `visitor:${demoScope()}:${key}` : key;
const SESSION_MS = 24 * 60 * 60 * 1000;
export type DemoSnapshot = Pick<Bootstrap, 'seasons'|'teams'|'players'|'fixtures'|'revision'>;
export const freshDemo = (): DemoSnapshot => ({ seasons: [demoSeason], teams: demoTeams, players: demoPlayers, fixtures: makeDemoFixtures(), revision: 1 });
export async function requireDemoSnapshot(id = demoScope()): Promise<DemoSnapshot> {
  const row = await first<{data: string}>('SELECT data FROM demo_sessions WHERE id=? AND expires_at>?', id, Date.now());
  if (!row) throw new AppError('Your demo has expired. Start a new demo to continue.', 401, 'DEMO_EXPIRED');
  return JSON.parse(row.data);
}
export function overlayDemo(base: Bootstrap, demo: DemoSnapshot): Bootstrap {
  const oldTeams = new Set(base.teams.filter(team => team.seasonId === DEMO_SEASON_ID).map(team => team.id));
  return { ...base, content: {...base.content, privacyText: base.content.privacyText.replace('and are visible to other visitors.', 'in your private browser demo session.')}, seasons: [...demo.seasons, ...base.seasons.filter(s => s.id !== DEMO_SEASON_ID)], teams: [...demo.teams, ...base.teams.filter(t => t.seasonId !== DEMO_SEASON_ID)], players: [...demo.players, ...base.players.filter(p => !oldTeams.has(p.teamId))], fixtures: [...demo.fixtures, ...base.fixtures.filter(f => f.seasonId !== DEMO_SEASON_ID)], revision: base.revision + demo.revision };
}
export async function visitorScope(request: Request): Promise<string | null> {
  const secret = request.headers.get('x-demo-token');
  if (!secret || !/^[a-f0-9-]{72}$/.test(secret)) return null;
  const id = await sha256(secret);
  return await first('SELECT id FROM demo_sessions WHERE id=? AND expires_at>?', id, Date.now()) ? id : null;
}
export async function runVisitorDemo<T>(request: Request, handler: (request: Request) => Promise<T>, mode: 'read'|'start'|'reset'|'write' = 'write'): Promise<T> {
  if (mode !== 'read') assertSameOrigin(request);
  let id = await visitorScope(request), secret = request.headers.get('x-demo-token') ?? '';
  if (mode === 'reset' || mode === 'start' && !id) {
    await rateLimit('demo:sessions:' + await sha256(request.headers.get('cf-connecting-ip') ?? 'local'), 30, 600);
    const oldId = id;
    // Rotate to a new session. Any in-flight old write is fenced by expires_at.
    secret = newId() + newId(); id = await sha256(secret);
    const database = db();
    await database.batch([
      database.prepare('INSERT INTO demo_sessions(id,data,version,expires_at) VALUES(?,?,0,?)').bind(id, JSON.stringify(freshDemo()), Date.now() + SESSION_MS),
      ...(oldId ? [database.prepare('UPDATE demo_sessions SET expires_at=0 WHERE id=?').bind(oldId)] : []),
    ]);
  }
  if (!id) throw new AppError('Start your own demo to continue.', 401, 'DEMO_EXPIRED');
  const headers = new Headers(request.headers); headers.set('x-demo-token', secret);
  // Construct by URL: the development adapter can supply a Request from another realm.
  const scopedRequest = new Request(request.url, { method: request.method, headers, ...(!['GET','HEAD'].includes(request.method) ? {body: await request.arrayBuffer()} : {}) });
  return withDemoScope(id, () => handler(scopedRequest));
}
