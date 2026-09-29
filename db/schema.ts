import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const seasons = sqliteTable('seasons', { id: text('id').primaryKey(), data: text('data').notNull() });
export const teams = sqliteTable('teams', { id: text('id').primaryKey(), seasonId: text('season_id').notNull().references(() => seasons.id), data: text('data').notNull() });
export const players = sqliteTable('players', { id: text('id').primaryKey(), teamId: text('team_id').notNull().references(() => teams.id), data: text('data').notNull() });
export const fixtures = sqliteTable('fixtures', { id: text('id').primaryKey(), seasonId: text('season_id').notNull().references(() => seasons.id), homeTeamId: text('home_team_id').notNull().references(() => teams.id), awayTeamId: text('away_team_id').notNull().references(() => teams.id), version: integer('version').notNull().default(0), data: text('data').notNull() }, table => [index('fixtures_season_idx').on(table.seasonId)]);
export const kv = sqliteTable('kv', { key: text('key').primaryKey(), value: text('value').notNull() });
export const changes = sqliteTable('changes', { id: text('id').primaryKey(), kind: text('kind').notNull(), recordId: text('record_id').notNull(), actor: text('actor').notNull(), before: text('before_json'), after: text('after_json').notNull(), createdAt: text('created_at').notNull(), operationId: text('operation_id').unique() });
export const operations = sqliteTable('operations', { id: text('id').primaryKey(), fixtureId: text('fixture_id').notNull(), requestHash: text('request_hash').notNull(), result: text('result_json').notNull() });
export const sessions = sqliteTable('sessions', { tokenHash: text('token_hash').primaryKey(), expiresAt: integer('expires_at').notNull() });
export const rateLimits = sqliteTable('rate_limits', { key: text('key').primaryKey(), count: integer('count').notNull(), resetAt: integer('reset_at').notNull() });
export const enquiries = sqliteTable('enquiries', { id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull(), phone: text('phone').notNull().default(''), league: text('league').notNull().default(''), consent: integer('consent').notNull().default(0), message: text('message').notNull(), createdAt: text('created_at').notNull() });
export const messages = sqliteTable('messages', { id: text('id').primaryKey(), conversationId: text('conversationId').notNull(), sender: text('sender').notNull(), text: text('text').notNull(), createdAt: text('createdAt').notNull(), role: text('role').notNull() });
export const events = sqliteTable('events', { id: text('id').primaryKey(), type: text('type').notNull(), payload: text('payload').notNull(), createdAt: text('createdAt').notNull() });
export const usage = sqliteTable('usage', { month: text('month').primaryKey(), reserved: integer('reserved').notNull().default(0), spent: integer('spent').notNull().default(0) });
