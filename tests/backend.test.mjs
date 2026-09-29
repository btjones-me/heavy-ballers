import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

let api, database, temporary;
before(async () => {
  database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  for (const name of (await readdir('drizzle')).filter(name => name.endsWith('.sql')).sort()) database.exec(await readFile(join('drizzle', name), 'utf8'));
  // Run the application's exact D1 statements against SQLite, including rollback.
  function prepared(sql, values = []) {
    return {
      bind: (...next) => prepared(sql, next),
      first: async column => { const row = database.prepare(sql).get(...values) ?? null; return column && row ? row[column] : row; },
      all: async () => ({ success: true, results: database.prepare(sql).all(...values), meta: { changes: 0 } }),
      run: async () => { const result = database.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
      sql, values,
    };
  }
  const db = { prepare: prepared, async batch(statements) {
    database.exec('BEGIN');
    try {
      const result = statements.map(statement => {
        const query = database.prepare(statement.sql);
        if (/^\s*(SELECT|WITH|PRAGMA)/i.test(statement.sql)) return { success: true, results: query.all(...statement.values), meta: { changes: 0 } };
        const result = query.run(...statement.values); return { success: true, results: [], meta: { changes: Number(result.changes) } };
      });
      database.exec('COMMIT'); return result;
    } catch (error) { database.exec('ROLLBACK'); throw error; }
  } };
  globalThis.__HB_TEST_ENV = { DB: db, ADMIN_PASSWORD: 'test-only-password', MCP_TOKEN: 'test-only-mcp-token', OPENAI_API_KEY: 'test-key-not-real', APP_ORIGIN: 'https://ballers.test' };
  temporary = await mkdtemp(join(tmpdir(), 'heavy-ballers-tests-'));
  const outfile = join(temporary, 'backend.mjs');
  await build({ stdin: { contents: `export * from './lib/league'; export * from './lib/admin-service'; export * from './lib/auth'; export * from './lib/mcp'; export * from './lib/agent'; export * from './lib/report-guard';`, resolveDir: process.cwd() }, bundle: true, outfile, platform: 'node', format: 'esm', plugins: [{ name: 'test-cloudflare-binding', setup(build) { build.onResolve({ filter: /^cloudflare:workers$/ }, args => ({ path: args.path, namespace: 'test-runtime' })); build.onLoad({ filter: /.*/, namespace: 'test-runtime' }, () => ({ contents: 'export const env = globalThis.__HB_TEST_ENV;' })); } }] });
  api = await import(pathToFileURL(outfile).href);
});
after(async () => { database?.close(); if (temporary) await rm(temporary, { recursive: true }); delete globalThis.__HB_TEST_ENV; });

test('seed has 12 rounds, six complete, consistent demo scorers and a clean round seven', async () => {
  const state = await api.getBootstrap();
  const fixtures = state.fixtures.filter(match => match.seasonId === 'tuesday-demo-s2');
  assert.equal(fixtures.length, 24);
  assert.equal(fixtures.filter(match => match.homeScore !== null).length, 12);
  for (const fixture of fixtures.filter(match => match.homeScore !== null)) {
    assert.equal(fixture.homeScorers.reduce((sum, scorer) => sum + scorer.goals, 0), fixture.homeScore);
    assert.equal(fixture.awayScorers.reduce((sum, scorer) => sum + scorer.goals, 0), fixture.awayScore);
  }
  const next = fixtures.find(match => match.id === 'demo-gw7-1');
  assert.equal(next.homeTeamId, 'qpr'); assert.equal(next.awayTeamId, 'net'); assert.equal(next.homeScore, null);
  assert.ok(state.seasons.some(season => season.league === 'saturday'));
});

test('league points include shootout bonus but goalscorer rankings never include penalties', async () => {
  const state = await api.getBootstrap(), match = state.fixtures.find(match => match.id === 'demo-gw7-1');
  const fixture = { ...match, homeScore: 4, awayScore: 2, shootoutWinnerId: 'net', homeScorers: [{ playerId: 'qpr-alfie', goals: 4 }], awayScorers: [{ playerId: 'net-leo', goals: 2 }] };
  const teams = state.teams.filter(team => ['qpr', 'net'].includes(team.id));
  let rows = api.calculateStandings(teams, [fixture]);
  assert.equal(rows.find(team => team.teamId === 'qpr').points, 3);
  assert.equal(rows.find(team => team.teamId === 'net').points, 1);
  assert.equal(rows.find(team => team.teamId === 'qpr').goalDifference, 2);
  assert.deepEqual(api.calculateGoalscorers(state.players, [fixture]).map(row => row.goals), [4, 2]);
  rows = api.calculateStandings(teams, [{ ...fixture, homeScore: 2, awayScore: 2 }]);
  assert.equal(rows.find(team => team.teamId === 'qpr').points, 1);
  assert.equal(rows.find(team => team.teamId === 'net').points, 2);
  rows = api.calculateStandings(teams, [{ ...fixture, shootoutWinnerId: null }]);
  assert.equal(rows.find(team => team.teamId === 'net').points, 0);
});

test('fragmented reports preserve previous fields, record audit, deduplicate and reject stale updates', async () => {
  const first = await api.updateFixture('demo-gw7-1', { homeScore: 4, awayScore: 2 }, 0, 'test-agent', 'test:first');
  assert.equal(first.version, 1); assert.deepEqual(first.homeScorers, []);
  assert.deepEqual(await api.updateFixture('demo-gw7-1', { homeScore: 4, awayScore: 2 }, 0, 'test-agent', 'test:first'), first);
  await assert.rejects(api.updateFixture('demo-gw7-1', { homeScore: 3, awayScore: 2 }, 0, 'test-agent', 'test:first'), { code: 'IDEMPOTENCY_CONFLICT' });
  await assert.rejects(api.updateFixture('demo-gw7-1', { shootoutWinnerId: 'net' }, 0, 'test-agent', 'test:stale'), { code: 'STALE_VERSION' });
  const second = await api.updateFixture('demo-gw7-1', { homeScorers: [{ playerId: 'qpr-alfie', goals: 2 }] }, 1, 'test-agent', 'test:second');
  assert.equal(second.homeScore, 4); assert.equal(second.awayScore, 2);
  const third = await api.updateFixture('demo-gw7-1', { homeScorers: [{ playerId: 'qpr-alfie', goals: 2 }, { playerId: 'qpr-sam', goals: 1 }, { playerId: 'qpr-ben', goals: 1 }], awayScorers: [{ playerId: 'net-leo', goals: 1 }, { playerId: 'net-jamie', goals: 1 }], shootoutWinnerId: 'net' }, 2, 'test-agent', 'test:third');
  assert.equal(third.version, 3);
  const admin = await api.adminState();
  assert.equal(admin.changes.filter(change => change.actor === 'test-agent').length, 3);
  assert.equal(admin.bootstrap.revision, 4);
});

test('rejects invalid scorers, excess goals, incomplete scores and invalid shootout teams without any writes', async () => {
  const before = await api.getBootstrap();
  for (const patch of [{ homeScorers: [{ playerId: 'net-leo', goals: 1 }] }, { homeScorers: [{ playerId: 'qpr-alfie', goals: 5 }] }, { homeScore: null }, { shootoutWinnerId: 'paris' }, { homeTeamId: 'net' }, { homeScorers: [{ playerId: 'qpr-alfie', goals: 1 }, { playerId: 'qpr-alfie', goals: 1 }] }]) {
    await assert.rejects(api.updateFixture('demo-gw7-1', patch, 3, 'invalid-agent', crypto.randomUUID()));
  }
  assert.equal((await api.getBootstrap()).revision, before.revision);
});

test('two simultaneous writers produce one result and one stale conflict', async () => {
  const results = await Promise.allSettled([
    api.updateFixture('demo-gw7-1', { shootoutWinnerId: 'qpr' }, 3, 'writer-a', 'race:a'),
    api.updateFixture('demo-gw7-1', { shootoutWinnerId: null }, 3, 'writer-b', 'race:b'),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'STALE_VERSION');
});

test('an existing result correction can be undone, but an obsolete correction cannot', async () => {
  const admin = await api.adminState();
  const latest = admin.changes.find(change => change.actor === 'writer-a' || change.actor === 'writer-b');
  const restored = await api.undoChange(latest.id);
  assert.equal(restored.shootoutWinnerId, 'net'); assert.equal(restored.version, 5);
  await assert.rejects(api.undoChange(admin.changes.find(change => change.actor === 'test-agent').id), { code: 'STALE_VERSION' });
});

test('admin records validate relationships and contact enquiries persist with consent', async () => {
  const state = await api.getBootstrap();
  const qpr = state.teams.find(team => team.id === 'qpr');
  await api.saveRecord('team', { ...qpr, name: 'Queens Pork Rangers Updated' });
  assert.equal((await api.getBootstrap()).teams.find(team => team.id === 'qpr').name, 'Queens Pork Rangers Updated');
  await assert.rejects(api.saveRecord('team', { ...qpr, seasonId: state.seasons.find(season => !season.demo).id }));
  await assert.rejects(api.saveRecord('content', { ...state.content, instagram: 'javascript:alert(1)' }));
  await assert.rejects(api.submitEnquiry({ name: 'Visitor', email: 'visitor@example.test', consent: false }));
  await api.submitEnquiry({ name: 'Visitor', email: 'visitor@example.test', phone: '', league: 'tuesday', consent: true, message: 'Interested in joining' }, 'test-ip');
  assert.equal((await api.adminState()).enquiries[0].message, 'Interested in joining');
});

test('admin authentication uses a session cookie, same-origin checks and login throttling', async () => {
  const request = (password, origin = 'https://ballers.test', ip = 'login-test') => new Request('https://ballers.test/api/admin/login', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify({ password }) });
  await assert.rejects(api.login(request('test-only-password', 'https://evil.test')), { code: 'INVALID_ORIGIN' });
  await assert.rejects(api.login(request('bad')), { code: 'INVALID_PASSWORD' });
  const result = await api.login(request('test-only-password'));
  const cookie = result.headers.get('set-cookie');
  assert.ok(cookie.includes('HttpOnly')); assert.ok(cookie.includes('SameSite=Strict')); assert.ok(cookie.includes('Secure'));
  const authed = new Request('https://ballers.test/api/admin/state', { headers: { cookie } });
  assert.equal(await api.isAdmin(authed), true);
  await assert.rejects(api.requireAdmin(new Request(authed.url, { method: 'POST', headers: { cookie, origin: 'https://evil.test' } })), { code: 'INVALID_ORIGIN' });
  await api.logout(new Request('https://ballers.test/api/admin/logout', { method: 'POST', headers: { cookie, origin: 'https://ballers.test' } }));
  assert.equal(await api.isAdmin(authed), false);
  for (let i = 0; i < 8; i++) await assert.rejects(api.login(request('bad', 'https://ballers.test', 'blocked-ip')), { code: 'INVALID_PASSWORD' });
  await assert.rejects(api.login(request('test-only-password', 'https://ballers.test', 'blocked-ip')), { code: 'RATE_LIMITED' });
});

test('demo reset preserves archived records, contact enquiries and the spent budget', async () => {
  const before = await api.getBootstrap();
  database.prepare('INSERT INTO usage(month,spent,reserved) VALUES(?,?,?)').run('2026-09', 123000, 1000);
  await api.resetDemo();
  const after = await api.getBootstrap();
  assert.deepEqual(after.fixtures.filter(match => match.seasonId !== 'tuesday-demo-s2'), before.fixtures.filter(match => match.seasonId !== 'tuesday-demo-s2'));
  assert.equal(after.fixtures.find(match => match.id === 'demo-gw7-1').homeScore, null);
  assert.equal(after.teams.find(team => team.id === 'qpr').name, 'Queens Pork Rangers');
  const admin = await api.adminState();
  assert.equal(admin.enquiries.length, 1); assert.equal(admin.usage[0].spent, 123000); assert.equal(admin.usage[0].reserved, 1000);
});

test('failed audit insertion rolls back the fixture, operation record and revision together', async () => {
  const before = await api.getBootstrap();
  database.exec("CREATE TRIGGER reject_test_audit BEFORE INSERT ON changes WHEN NEW.actor='audit-failure-test' BEGIN SELECT RAISE(ABORT,'simulated audit outage'); END");
  await assert.rejects(api.updateFixture('demo-gw7-1', { homeScore: 1, awayScore: 0 }, 0, 'audit-failure-test', 'rollback:1'), /simulated audit outage/);
  database.exec('DROP TRIGGER reject_test_audit');
  const after = await api.getBootstrap();
  assert.equal(after.revision, before.revision);
  assert.equal(after.fixtures.find(match => match.id === 'demo-gw7-1').homeScore, null);
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM operations WHERE id=?').get('rollback:1').total, 0);
});

test('MCP requires separate credentials, negotiates protocol, exposes tools and rejects archive writes', async () => {
  const request = (method, params, token = 'test-only-mcp-token', id = 1) => new Request('https://ballers.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
  assert.equal((await api.handleMcp(request('tools/list', {}, 'wrong-token'))).status, 401);
  const initialized = await (await api.handleMcp(request('initialize', { protocolVersion: '2025-03-26', clientInfo: { name: 'test', version: '1' }, capabilities: {} }))).json();
  assert.equal(initialized.result.protocolVersion, '2025-03-26');
  const tools = await (await api.handleMcp(request('tools/list', {}))).json();
  assert.equal(tools.result.tools.length, 4);
  const found = await (await api.handleMcp(request('tools/call', { name: 'find_fixtures', arguments: { fixtureId: 'demo-gw7-1' } }))).json();
  assert.equal(found.result.structuredContent.fixtures.length, 1);
  const state = await api.getBootstrap(), archive = state.fixtures.find(match => match.seasonId !== 'tuesday-demo-s2');
  const refused = await (await api.handleMcp(request('tools/call', { name: 'update_match_report', arguments: { fixtureId: archive.id, expectedVersion: 0, operationId: 'mcp:archive', patch: { homeScore: 4, awayScore: 2 } } }))).json();
  assert.equal(refused.result.isError, true);
  const changed = await (await api.handleMcp(request('tools/call', { name: 'update_match_report', arguments: { fixtureId: 'demo-gw7-1', expectedVersion: 0, operationId: 'mcp:demo', patch: { homeScore: 4, awayScore: 2 } } }))).json();
  assert.equal(changed.result.isError, false);
  assert.equal(changed.result.structuredContent.fixture.homeScore, 4);
  assert.equal((await api.getBootstrap()).fixtures.find(match => match.id === 'demo-gw7-1').version, 1);
});

const demoRequest = (action, token, body = {}) => new Request(`https://ballers.test/api/demo/${action}`, { method: 'POST', headers: { origin: 'https://ballers.test', 'content-type': 'application/json', ...(token ? { 'x-demo-token': token } : {}) }, body: JSON.stringify(body) });
const chatMessage = (messageId, text = 'We won 4–2') => ({ messageId, text, conversationId: 'queens-pork-demo', fixtureId: 'demo-gw7-1', senderId: 'ben', timestamp: new Date().toISOString() });
const providerResult = output => Response.json({ output, usage: { input_tokens: 100, output_tokens: 20 } });
const providerText = () => providerResult([{ type: 'message', content: [{ type: 'output_text', text: 'Result received.' }] }]);
async function withProvider(handler, task, onRpc = () => {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const target = new URL(url);
    if (target.origin === 'https://ballers.test' && target.pathname === '/api/mcp') { onRpc(JSON.parse(options.body)); return api.handleMcp(new Request(url, options)); }
    assert.equal(target.href, 'https://api.openai.com/v1/responses');
    return handler(JSON.parse(options.body));
  };
  try { await task(); } finally { globalThis.fetch = original; }
}
function setUsage(spent = 0, reserved = 0) { database.prepare('INSERT INTO usage(month,spent,reserved) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET spent=excluded.spent,reserved=excluded.reserved').run(new Date().toISOString().slice(0, 7), spent, reserved); }
function getUsage() { return database.prepare('SELECT spent,reserved FROM usage WHERE month=?').get(new Date().toISOString().slice(0, 7)); }

test('agent tool loop calls HTTP MCP, persists a result and reconciles cost once for duplicate messages', async () => {
  await api.resetDemo(); setUsage();
  const started = await api.startDemo(demoRequest('start'));
  assert.equal(started.owner, true); assert.equal(started.messages.length, 1);
  await assert.rejects(api.startDemo(demoRequest('start')), { code: 'DEMO_TAKEN' });
  let calls = 0;
  await withProvider(() => {
    calls++;
    if (calls === 1) return providerResult([{ type: 'function_call', call_id: 'read-match', name: 'get_match_report', arguments: JSON.stringify({ fixtureId: 'demo-gw7-1' }) }]);
    if (calls === 2) return providerResult([{ type: 'function_call', call_id: 'write-match', name: 'update_match_report', arguments: JSON.stringify({ fixtureId: 'demo-gw7-1', expectedVersion: 0, operationId: 'will-be-overridden', patch: { homeScore: 4, awayScore: 2 } }) }]);
    return providerText();
  }, async () => {
    const message = chatMessage('agent-flow-0001');
    await api.receiveMessage(demoRequest('message', started.token, message));
    assert.equal((await api.receiveMessage(demoRequest('message', started.token, message))).duplicate, true);
  });
  assert.equal(calls, 3); assert.equal(getUsage().reserved, 0); assert.equal(getUsage().spent, 390);
  assert.equal((await api.getBootstrap()).fixtures.find(match => match.id === 'demo-gw7-1').homeScore, 4);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM messages WHERE id=?').get('agent-flow-0001').n, 1);
});

test('uncertain provider failure charges reservation and same-message retry can finish without duplicating chat', async () => {
  await api.resetDemo(); setUsage();
  const started = await api.startDemo(demoRequest('start'));
  const message = chatMessage('agent-retry-0001');
  await withProvider(() => { throw new TypeError('simulated network loss'); }, async () => { await assert.rejects(api.receiveMessage(demoRequest('message', started.token, message)), /simulated network loss/); });
  assert.equal(getUsage().spent, 125000); assert.equal(getUsage().reserved, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM kv WHERE key='demo:busy'").get().n, 0);
  await withProvider(providerText, async () => { await api.receiveMessage(demoRequest('message', started.token, message)); });
  assert.equal(getUsage().spent, 125130);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM messages WHERE id=?').get(message.messageId).n, 1);
  assert.equal(database.prepare('SELECT value FROM kv WHERE key=?').get(`demo:message:${message.messageId}`).value, 'done');
});

test('pending duplicate is busy, admin reset cannot interrupt an active message, and lease is released afterwards', async () => {
  await api.resetDemo(); setUsage();
  const started = await api.startDemo(demoRequest('start')), message = chatMessage('agent-pending-0001');
  let entered, release;
  const atProvider = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  await withProvider(async () => { entered(); await held; return providerText(); }, async () => {
    const pending = api.receiveMessage(demoRequest('message', started.token, message));
    await atProvider;
    await assert.rejects(api.receiveMessage(demoRequest('message', started.token, message)), { code: 'DEMO_BUSY' });
    await assert.rejects(api.resetDemo(), { code: 'DEMO_BUSY' });
    release(); await pending;
  });
  assert.equal(getUsage().spent, 130); assert.equal(getUsage().reserved, 0);
});

test('monthly cap refuses provider work before spending and known rejection does not charge the full reserve', async () => {
  await api.resetDemo(); setUsage(4_900_000);
  const started = await api.startDemo(demoRequest('start'));
  let providerCalls = 0;
  await withProvider(() => { providerCalls++; return providerText(); }, async () => {
    await assert.rejects(api.receiveMessage(demoRequest('message', started.token, chatMessage('agent-budget-0001'))), { code: 'AI_BUDGET' });
  });
  assert.equal(providerCalls, 0); assert.equal(getUsage().spent, 4_900_000); assert.equal(getUsage().reserved, 0);
  setUsage();
  await withProvider(() => new Response('not exposed', { status: 429 }), async () => {
    await assert.rejects(api.receiveMessage(demoRequest('message', started.token, chatMessage('agent-429-0001'))), { code: 'AI_UNAVAILABLE' });
  });
  assert.equal(getUsage().spent, 0); assert.equal(getUsage().reserved, 0);
  const status = database.prepare("SELECT payload FROM events WHERE type='ai' AND payload LIKE '%providerStatus%'").get();
  assert.equal(JSON.parse(status.payload).providerStatus, 429); assert.ok(!status.payload.includes('not exposed'));
});

test('deterministic guard rejects the observed uncertain score and invented Dave-to-Ollie mapping before MCP writes', async () => {
  await api.resetDemo(); setUsage();
  database.prepare("DELETE FROM rate_limits WHERE key LIKE 'demo:%'").run();
  await api.updateFixture('demo-gw7-1', { homeScore: 4, awayScore: 2, homeScorers: [{ playerId: 'qpr-alfie', goals: 2 }, { playerId: 'qpr-sam', goals: 1 }, { playerId: 'qpr-ben', goals: 1 }], awayScorers: [{ playerId: 'net-leo', goals: 1 }, { playerId: 'net-jamie', goals: 1 }], shootoutWinnerId: 'net' }, 0, 'test-setup', 'guard:setup');
  const started = await api.startDemo(demoRequest('start'));
  let writeCalls = 0;
  const track = request => { if (request.method === 'tools/call' && request.params.name === 'update_match_report') writeCalls++; };
  const propose = patch => { let sent = false; return () => { if (sent) return providerText(); sent = true; return providerResult([{ type: 'function_call', call_id: 'proposed-update', name: 'update_match_report', arguments: JSON.stringify({ fixtureId: 'demo-gw7-1', expectedVersion: 1, operationId: 'model-id', patch }) }]); }; };
  await withProvider(propose({ homeScore: 5, awayScore: 2 }), async () => { await api.receiveMessage(demoRequest('message', started.token, chatMessage('guard-uncertain-0001', 'I think the score was 5-2.'))); }, track);
  let state = await api.getBootstrap(), match = state.fixtures.find(match => match.id === 'demo-gw7-1');
  assert.equal(writeCalls, 0); assert.equal(match.homeScore, 4); assert.equal(match.version, 1);
  const latest = database.prepare("SELECT text FROM messages WHERE role='assistant' ORDER BY createdAt DESC,id DESC LIMIT 1").get();
  assert.match(latest.text, /Is 5–2 a correction/);
  await withProvider(propose({ homeScorers: [...match.homeScorers, { playerId: 'qpr-ollie', goals: 1 }] }), async () => { await api.receiveMessage(demoRequest('message', started.token, chatMessage('guard-dave-0001', 'Dave scored one of our goals.'))); }, track);
  state = await api.getBootstrap(); match = state.fixtures.find(match => match.id === 'demo-gw7-1');
  assert.equal(writeCalls, 0); assert.equal(match.version, 1); assert.ok(!match.homeScorers.some(scorer => scorer.playerId === 'qpr-ollie'));
  assert.ok(database.prepare("SELECT text FROM messages WHERE text LIKE 'I can’t match that scorer%'").get());
  await withProvider(propose({ homeScore: 5, awayScore: 2 }), async () => { await api.receiveMessage(demoRequest('message', started.token, chatMessage('guard-correct-0001', 'Correction: the correct score was 5-2.'))); }, track);
  assert.equal(writeCalls, 1); assert.equal((await api.getBootstrap()).fixtures.find(match => match.id === 'demo-gw7-1').homeScore, 5);
});

test('guard grounds initial scores, scorer aliases and pronouns, and shootout winners without trusting assistant text', async () => {
  await api.resetDemo(); setUsage();
  const report = await api.callMcpTool('get_match_report', { fixtureId: 'demo-gw7-1' });
  const ben = text => ({ text, senderName: 'Ben J', teamId: 'qpr' });
  assert.equal(api.guardMatchReport(report, { homeScore: 4, awayScore: 2 }, ben('We won!')).code, 'SCORE_NOT_GROUNDED');
  assert.equal(api.guardMatchReport(report, { homeScore: 2, awayScore: 4 }, ben('We won 4–2')).code, 'SCORE_TEAM_MISMATCH');
  assert.equal(api.guardMatchReport(report, { homeScore: 4, awayScore: 2 }, ben('We won 4–2')).ok, true);
  assert.equal(api.guardMatchReport(report, { homeScorers: [{ playerId: 'qpr-alfie', goals: 2 }] }, ben('Alfie got two')).ok, true);
  assert.equal(api.guardMatchReport(report, { homeScorers: [{ playerId: 'qpr-alfie', goals: 2 }] }, ben('Alfieville got two')).code, 'SCORER_NOT_GROUNDED');
  assert.equal(api.guardMatchReport(report, { homeScorers: [{ playerId: 'qpr-ben', goals: 1 }] }, ben('I scored one')).ok, true);
  const ambiguous = { ...report, awaySquad: [...report.awaySquad, { id: 'net-alfie', teamId: 'net', name: 'Alfie X', aliases: ['Alfie'] }] };
  assert.equal(api.guardMatchReport(ambiguous, { homeScorers: [{ playerId: 'qpr-alfie', goals: 2 }] }, ben('Alfie got two')).code, 'SCORER_NOT_GROUNDED');
  assert.equal(api.guardMatchReport(report, { shootoutWinnerId: 'net' }, ben('NetSix won the shootout')).ok, true);
  assert.equal(api.guardMatchReport(report, { shootoutWinnerId: 'qpr' }, ben('We won the shootout')).ok, true);
  assert.equal(api.guardMatchReport(report, { shootoutWinnerId: 'net' }, ben('We won the shootout')).code, 'SHOOTOUT_NOT_GROUNDED');
  assert.equal(api.guardMatchReport(report, { shootoutWinnerId: 'net' }, ben('NetSix lost the shootout')).code, 'SHOOTOUT_NOT_GROUNDED');
  const started = await api.startDemo(demoRequest('start'));
  let writes = 0;
  await withProvider(() => providerResult([{ type: 'function_call', call_id: 'invented-score', name: 'update_match_report', arguments: JSON.stringify({ fixtureId: 'demo-gw7-1', expectedVersion: 0, operationId: 'model', patch: { homeScore: 4, awayScore: 2 } }) }]), async () => { await api.receiveMessage(demoRequest('message', started.token, chatMessage('guard-no-score-0001', 'We won!'))); }, request => { if (request.params?.name === 'update_match_report') writes++; });
  assert.equal(writes, 0); assert.equal((await api.getBootstrap()).fixtures.find(match => match.id === 'demo-gw7-1').homeScore, null);
});

test('configurable models require positive finite costs and reserve their bounded worst-case spend', async () => {
  await api.resetDemo(); setUsage();
  const env = globalThis.__HB_TEST_ENV;
  env.OPENAI_MODEL = 'configured-model';
  const started = await api.startDemo(demoRequest('start'));
  let calls = 0;
  try {
    await withProvider(() => { calls++; return providerText(); }, async () => {
      await assert.rejects(api.receiveMessage(demoRequest('message', started.token, chatMessage('model-invalid-0001'))), { code: 'INVALID_COST_PROFILE' });
      env.OPENAI_INPUT_MICRO_GBP_PER_TOKEN = '-1'; env.OPENAI_OUTPUT_MICRO_GBP_PER_TOKEN = 'Infinity';
      await assert.rejects(api.receiveMessage(demoRequest('message', started.token, chatMessage('model-invalid-0002'))), { code: 'INVALID_COST_PROFILE' });
    });
    assert.equal(calls, 0); assert.equal(getUsage().spent, 0);
    env.OPENAI_INPUT_MICRO_GBP_PER_TOKEN = '3'; env.OPENAI_OUTPUT_MICRO_GBP_PER_TOKEN = '12';
    await withProvider(() => { throw new TypeError('uncertain custom model call'); }, async () => { await assert.rejects(api.receiveMessage(demoRequest('message', started.token, chatMessage('model-valid-0001'))), /uncertain custom model/); });
    assert.equal(getUsage().spent, 518400); assert.equal(getUsage().reserved, 0);
  } finally { delete env.OPENAI_MODEL; delete env.OPENAI_INPUT_MICRO_GBP_PER_TOKEN; delete env.OPENAI_OUTPUT_MICRO_GBP_PER_TOKEN; }
});

test('model repairs a player ID used as shootout winner before any write is dispatched', async () => {
  await api.resetDemo(); setUsage();
  database.prepare("DELETE FROM rate_limits WHERE key LIKE 'demo:%'").run();
  await api.updateFixture('demo-gw7-1', { homeScore: 4, awayScore: 2 }, 0, 'test-setup', 'shootout:setup');
  const started = await api.startDemo(demoRequest('start'));
  let calls = 0;
  const writes = [];
  await withProvider(request => {
    calls++;
    if (calls === 1) return providerResult([{ type: 'function_call', call_id: 'wrong-id', name: 'update_match_report', arguments: JSON.stringify({ fixtureId: 'demo-gw7-1', expectedVersion: 1, operationId: 'model', patch: { shootoutWinnerId: 'net-nathan' } }) }]);
    if (calls === 2) {
      assert.match(request.input.at(-1).output, /TEAM ID: qpr/);
      return providerResult([{ type: 'function_call', call_id: 'right-id', name: 'update_match_report', arguments: JSON.stringify({ fixtureId: 'demo-gw7-1', expectedVersion: 1, operationId: 'model', patch: { shootoutWinnerId: 'net' } }) }]);
    }
    return providerText();
  }, async () => { await api.receiveMessage(demoRequest('message', started.token, chatMessage('shootout-repair-0001', 'NetSix won the penalty shootout.'))); }, request => { if (request.params?.name === 'update_match_report') writes.push(request.params.arguments.patch.shootoutWinnerId); });
  assert.deepEqual(writes, ['net']);
  const state = await api.demoState(new Request('https://ballers.test/api/demo/state'));
  assert.equal(state.match.shootoutWinnerName, 'NetSix and Chill');
  assert.equal(state.match.homePoints, 3); assert.equal(state.match.awayPoints, 1);
});

test('Sites identity is accepted only on reserved MCP route; service alias always requires its own token', async () => {
  const request = (path, headers, params) => new Request(`https://ballers.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params }) });
  const identity = { 'oai-authenticated-user-id': 'site-scoped-test-user' };
  const read = { name: 'get_squad', arguments: { teamId: 'net' } };
  assert.equal((await api.handleMcp(request('/api/mcp', identity, read))).status, 401);
  assert.equal((await api.handleMcp(request('/api/mcp', { ...identity, authorization: 'Bearer wrong-token' }, read))).status, 401);
  const authenticatedRead = await (await api.handleMcp(request('/mcp', identity, read))).json();
  assert.equal(authenticatedRead.result.isError, false); assert.equal(authenticatedRead.result.structuredContent.team.id, 'net');
  const serviceRead = await (await api.handleMcp(request('/api/mcp', { authorization: 'Bearer test-only-mcp-token' }, read))).json();
  assert.equal(serviceRead.result.isError, false);
  const write = { name: 'update_match_report', arguments: { fixtureId: 'demo-gw7-2', expectedVersion: 0, operationId: 'platform:test:write', patch: { homeScore: 1, awayScore: 1 } } };
  const updated = await (await api.handleMcp(request('/mcp', identity, write))).json();
  assert.equal(updated.result.isError, false); assert.equal(updated.result.structuredContent.fixture.homeScore, 1);
  const archive = (await api.getBootstrap()).fixtures.find(fixture => fixture.seasonId !== 'tuesday-demo-s2');
  write.arguments.fixtureId = archive.id; write.arguments.operationId = 'platform:test:archive';
  const refused = await (await api.handleMcp(request('/mcp', identity, write))).json();
  assert.equal(refused.result.isError, true);
});
