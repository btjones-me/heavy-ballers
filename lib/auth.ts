import { db, first, now, run, runtimeEnv, sha256 } from './db';
import { AppError } from './types';

const COOKIE = 'hb_admin';
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) throw new AppError('This request must come from this website.', 403, 'INVALID_ORIGIN');
}
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const statement = db().prepare('INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count,reset_at').bind(key, nowSeconds + windowSeconds, nowSeconds, nowSeconds);
  const value = await statement.first<{ count: number; reset_at: number }>();
  if (!value || value.count > limit) throw new AppError('Too many attempts. Please try again later.', 429, 'RATE_LIMITED');
}
function tokenFrom(request: Request): string | null {
  const match = request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-zA-Z0-9-]+)(?:;|$)`));
  return match?.[1] ?? null;
}
export async function isAdmin(request: Request): Promise<boolean> {
  const token = tokenFrom(request); if (!token) return false;
  const value = await first<{ expires_at: number }>('SELECT expires_at FROM sessions WHERE token_hash=?', await sha256(token));
  return Boolean(value && value.expires_at > Date.now());
}
export async function requireAdmin(request: Request): Promise<void> {
  if (!await isAdmin(request)) throw new AppError('Please sign in to the admin portal.', 401, 'UNAUTHENTICATED');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) assertSameOrigin(request);
}
export async function login(request: Request): Promise<Response> {
  assertSameOrigin(request);
  await rateLimit(`login:${request.headers.get('cf-connecting-ip') ?? 'local'}`, 8, 900);
  const body = await request.json() as { password?: unknown };
  if (typeof body.password !== 'string' || body.password.length > 256) throw new AppError('Enter your admin password.');
  const configured = runtimeEnv().ADMIN_PASSWORD;
  if (!configured) throw new AppError('Admin access is not configured.', 503, 'ADMIN_NOT_CONFIGURED');
  const givenHash = await sha256(body.password), expectedHash = await sha256(configured);
  let difference = 0; for (let index = 0; index < givenHash.length; index++) difference |= givenHash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  if (difference !== 0) throw new AppError('Incorrect password.', 401, 'INVALID_PASSWORD');
  const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const oldToken = tokenFrom(request);
  const database = db();
  const statements = [database.prepare('INSERT INTO sessions(token_hash,expires_at) VALUES(?,?)').bind(await sha256(token), Date.now() + 12 * 60 * 60 * 1000)];
  if (oldToken) statements.push(database.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(oldToken)));
  statements.push(database.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(Date.now()));
  await database.batch(statements);
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`, 'Cache-Control': 'no-store' } });
}
export async function logout(request: Request): Promise<Response> {
  assertSameOrigin(request);
  const token = tokenFrom(request); if (token) await run('DELETE FROM sessions WHERE token_hash=?', await sha256(token));
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`, 'Cache-Control': 'no-store' } });
}
