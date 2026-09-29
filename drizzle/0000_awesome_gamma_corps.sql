CREATE TABLE `changes` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`record_id` text NOT NULL,
	`actor` text NOT NULL,
	`before_json` text,
	`after_json` text NOT NULL,
	`created_at` text NOT NULL,
	`operation_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `changes_operation_id_unique` ON `changes` (`operation_id`);--> statement-breakpoint
CREATE TABLE `enquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`league` text DEFAULT '' NOT NULL,
	`consent` integer DEFAULT 0 NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fixtures` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`home_team_id` text NOT NULL,
	`away_team_id` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`home_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`away_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fixtures_season_idx` ON `fixtures` (`season_id`);--> statement-breakpoint
CREATE TABLE `kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversationId` text NOT NULL,
	`sender` text NOT NULL,
	`text` text NOT NULL,
	`createdAt` text NOT NULL,
	`role` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`fixture_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`result_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `usage` (
	`month` text PRIMARY KEY NOT NULL,
	`reserved` integer DEFAULT 0 NOT NULL,
	`spent` integer DEFAULT 0 NOT NULL
);
