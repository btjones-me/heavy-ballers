import { withDemoScope, requireDemoSnapshot } from './demo-session';
import { runtimeEnv, sha256 } from './db';
import { getBootstrap, updateFixture } from './league';
import { DEMO_SEASON_ID } from './seed';
import { AppError, type FixturePatch } from './types';

const scorerSchema = { type: 'array', maxItems: 100, items: { type: 'object', properties: { playerId: { type: 'string' }, goals: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['playerId', 'goals'], additionalProperties: false } };
export const MCP_TOOLS = [
  { name: 'find_fixtures', description: 'Find fictional Tuesday Season 2 fixtures. Use team IDs or round to identify a match. Returns current match versions. The demonstration agent cannot access other seasons.', inputSchema: { type: 'object', properties: { teamId: { type: 'string' }, round: { type: 'integer', minimum: 1 }, fixtureId: { type: 'string' } }, additionalProperties: false }, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: 'get_squad', description: 'Read a fictional team roster including player IDs and aliases. Resolve a named scorer to one unique roster member; ask for clarification instead of guessing ambiguous names.', inputSchema: { type: 'object', properties: { teamId: { type: 'string' } }, required: ['teamId'], additionalProperties: false }, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: 'get_match_report', description: 'Read a fictional match, both teams, squads, current score, scorers, shootout winner and version before updating its report.', inputSchema: { type: 'object', properties: { fixtureId: { type: 'string' } }, required: ['fixtureId'], additionalProperties: false }, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: 'update_match_report', description: 'Save only unambiguous match facts from the chat. A shootout awards one league point and never adds match goals. Omitted fields preserve previous values. Scorer arrays replace that side’s complete currently known list, so include earlier confirmed scorers. Partial scorer totals are allowed but cannot exceed the match score. Supply both scores together. If the score conflicts with an earlier report, ask for confirmation before changing it. Use the latest version and a stable unique operationId for retries.', inputSchema: { type: 'object', properties: { fixtureId: { type: 'string' }, expectedVersion: { type: 'integer', minimum: 0 }, operationId: { type: 'string', minLength: 1, maxLength: 160 }, patch: { type: 'object', minProperties: 1, properties: { homeScore: { type: ['integer', 'null'], minimum: 0, maximum: 100 }, awayScore: { type: ['integer', 'null'], minimum: 0, maximum: 100 }, homeScorers: scorerSchema, awayScorers: scorerSchema, shootoutWinnerId: { type: ['string', 'null'], enum: ['qpr', 'paris', 'net', 'borussia', null], description: 'Winning TEAM id, never a player id. For Queens versus NetSix use qpr or net. Null means not yet known.' } }, additionalProperties: false } }, required: ['fixtureId', 'expectedVersion', 'operationId', 'patch'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
];

function string(value: unknown, field: string): asserts value is string { if (typeof value !== 'string' || !value || value.length > 160) throw new AppError(`A valid ${field} is required.`); }
function object(value: unknown): asserts value is Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('Tool arguments must be an object.'); }
export async function callMcpTool(name: string, args: Record<string, unknown>) {
  object(args);
  const tool = MCP_TOOLS.find(tool => tool.name === name);
  if (!tool) throw new AppError('Unknown tool.');
  const allowedArgs = Object.keys(tool.inputSchema.properties);
  if (Object.keys(args).some(key => !allowedArgs.includes(key))) throw new AppError('Unknown tool argument.');
  const state = await getBootstrap();
  const fixtures = state.fixtures.filter(fixture => fixture.seasonId === DEMO_SEASON_ID);
  const teams = state.teams.filter(team => team.seasonId === DEMO_SEASON_ID);
  if (name === 'find_fixtures') {
    if (args.teamId !== undefined) { string(args.teamId, 'teamId'); if (!teams.some(team => team.id === args.teamId)) throw new AppError('Team not found in the demo season.', 404); }
    if (args.round !== undefined && (!Number.isInteger(args.round) || Number(args.round) < 1)) throw new AppError('Round must be a positive whole number.');
    if (args.fixtureId !== undefined) string(args.fixtureId, 'fixtureId');
    return { fixtures: fixtures.filter(fixture => (!args.teamId || [fixture.homeTeamId, fixture.awayTeamId].includes(args.teamId as string)) && (!args.round || fixture.round === args.round) && (!args.fixtureId || fixture.id === args.fixtureId)), teams, season: state.seasons.find(season => season.id === DEMO_SEASON_ID) };
  }
  if (name === 'get_squad') {
    string(args.teamId, 'teamId');
    const team = teams.find(team => team.id === args.teamId);
    if (!team) throw new AppError('Team not found in the demo season.', 404);
    return { team, players: state.players.filter(player => player.teamId === team.id) };
  }
  string(args.fixtureId, 'fixtureId');
  const fixture = fixtures.find(fixture => fixture.id === args.fixtureId);
  if (!fixture) throw new AppError('Match not found in the demo season.', 404);
  if (name === 'get_match_report') return { fixture, homeTeam: teams.find(team => team.id === fixture.homeTeamId), awayTeam: teams.find(team => team.id === fixture.awayTeamId), homeSquad: state.players.filter(player => player.teamId === fixture.homeTeamId), awaySquad: state.players.filter(player => player.teamId === fixture.awayTeamId) };
  string(args.operationId, 'operationId');
  if (!Number.isInteger(args.expectedVersion) || Number(args.expectedVersion) < 0) throw new AppError('A valid expectedVersion is required.');
  object(args.patch);
  if (!Object.keys(args.patch).length || Object.keys(args.patch).some(key => !['homeScore', 'awayScore', 'homeScorers', 'awayScorers', 'shootoutWinnerId'].includes(key))) throw new AppError('Only scores, scorers and shootout winner can be updated.');
  const updated = await updateFixture(fixture.id, args.patch as FixturePatch, Number(args.expectedVersion), 'mcp-agent', args.operationId);
  return { fixture: updated, saved: true };
}

type RpcId = string | number | null;
function rpc(id: RpcId, result: unknown, status = 200) { return Response.json({ jsonrpc: '2.0', id, result }, { status, headers: { 'Cache-Control': 'no-store' } }); }
function rpcError(id: RpcId, code: number, message: string, status = 200) { return Response.json({ jsonrpc: '2.0', id, error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } }); }
export async function handleMcp(request: Request): Promise<Response> {
  // Sites authenticates its reserved /mcp route and supplies this trusted header.
  // The service alias must always verify our separate credential; identity
  // headers on that ordinary API route are never treated as authentication.
  const platformAuthenticated = new URL(request.url).pathname === '/mcp' && Boolean(request.headers.get('oai-authenticated-user-id')?.trim());
  if (!platformAuthenticated) {
    const configured = runtimeEnv().MCP_TOKEN;
    if (!configured) return rpcError(null, -32000, 'MCP service is not configured.', 503);
    const supplied = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!supplied || supplied.length > 1000) return new Response('Bearer authorization required.', { status: 401, headers: { 'WWW-Authenticate': 'Bearer', 'Cache-Control': 'no-store' } });
    const [actual, expected] = await Promise.all([sha256(supplied), sha256(configured)]);
    let difference = 0; for (let index = 0; index < actual.length; index++) difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
    if (difference) return new Response('Invalid MCP credential.', { status: 401, headers: { 'WWW-Authenticate': 'Bearer', 'Cache-Control': 'no-store' } });
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return rpcError(null, -32000, 'Invalid origin.', 403);
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  if (!request.headers.get('content-type')?.includes('application/json')) return rpcError(null, -32600, 'Content-Type must be application/json.', 415);
  if (Number(request.headers.get('content-length') ?? 0) > 32768) return rpcError(null, -32600, 'Request is too large.', 413);
  let message: { jsonrpc?: unknown; method?: unknown; params?: unknown; id?: unknown };
  try { const body = await request.text(); if (body.length > 32768) return rpcError(null, -32600, 'Request is too large.', 413); message = JSON.parse(body); }
  catch { return rpcError(null, -32700, 'Invalid JSON.', 400); }
  if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || (message.id !== undefined && message.id !== null && typeof message.id !== 'string' && typeof message.id !== 'number')) return rpcError(null, -32600, 'Invalid JSON-RPC request.', 400);
  const id = message.id as RpcId;
  if (message.id === undefined) return new Response(null, { status: 202 });
  const params = message.params as Record<string, unknown> | undefined;
  if (message.method === 'initialize') {
    const supported = ['2025-03-26', '2025-06-18', '2025-11-25'];
    const version = typeof params?.protocolVersion === 'string' && supported.includes(params.protocolVersion) ? params.protocolVersion : '2025-11-25';
    return rpc(id, { protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'heavy-ballers-league', version: '1.0.0' }, instructions: 'Manage only fictional Tuesday Season 2 data. Preserve unknown facts, resolve names using squads, and ask for clarification when reports conflict.' });
  }
  if (message.method === 'ping') return rpc(id, {});
  if (message.method === 'tools/list') return rpc(id, { tools: MCP_TOOLS });
  if (message.method !== 'tools/call') return rpcError(id, -32601, 'Method not found.');
  if (!params || typeof params.name !== 'string') return rpcError(id, -32602, 'A tool name is required.');
  if (!MCP_TOOLS.some(tool => tool.name === params.name)) return rpcError(id, -32602, 'Unknown tool.');
  try {
    const scope = request.headers.get('x-demo-session');
    if (scope && (platformAuthenticated || !/^[a-f0-9]{64}$/.test(scope))) throw new AppError('Invalid private demo context.',403);
    if (scope) await requireDemoSnapshot(scope);
    const result = await withDemoScope(scope ?? '', () => callMcpTool(params.name as string, params.arguments as Record<string, unknown> ?? {})); return rpc(id, { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: false }); }
  catch (error) { const known = error instanceof AppError; return rpc(id, { content: [{ type: 'text', text: known ? error.message : 'The match service is temporarily unavailable. Please retry.' }], isError: true, ...(known ? { structuredContent: { error: error.code, message: error.message } } : {}) }); }
}
