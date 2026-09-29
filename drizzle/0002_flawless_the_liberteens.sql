CREATE INDEX `events_session_time_idx` ON `events` (`session_id`,`createdAt`);--> statement-breakpoint
CREATE INDEX `messages_conversation_time_idx` ON `messages` (`conversationId`,`createdAt`);