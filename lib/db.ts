import { env } from 'cloudflare:workers';

export interface DbResult<T = unknown> { results?: T[]; success: boolean; meta: { changes?: number; [key: string]: unknown } }
export interface Statement { bind(...values: unknown[]): Statement; first<T = Record<string, unknown>>(column?: string): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<DbResult<T>>; run(): Promise<DbResult> }
export interface Database { prepare(query: string): Statement; batch<T = unknown>(statements: Statement[]): Promise<DbResult<T>[]> }
export type RuntimeEnv = { DB: Database; ADMIN_PASSWORD?: string; OPENAI_API_KEY?: string; MCP_TOKEN?: string; [key: string]: unknown };
export function runtimeEnv(): RuntimeEnv { return env as unknown as RuntimeEnv; }
export function db(): Database { const value = runtimeEnv().DB; if (!value) throw new Error('D1 DB binding is missing.'); return value; }
export async function all<T>(sql: string, ...values: unknown[]): Promise<T[]> { const result = await db().prepare(sql).bind(...values).all<T>(); return result.results ?? []; }
export async function first<T>(sql: string, ...values: unknown[]): Promise<T | null> { return db().prepare(sql).bind(...values).first<T>(); }
export async function run(sql: string, ...values: unknown[]) { return db().prepare(sql).bind(...values).run(); }
export async function ensureSeed() { return (await import('./seed')).ensureSeed(); }
export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export function parseData<T>(rows: { data: string }[]): T[] { return rows.map(row => JSON.parse(row.data) as T); }
export async function sha256(value: string): Promise<string> { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join(''); }
export function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`; return JSON.stringify(value); }
