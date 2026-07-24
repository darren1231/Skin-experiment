CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`timezone` text DEFAULT 'Asia/Taipei' NOT NULL,
	`last_login_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `checkins` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
CREATE UNIQUE INDEX `checkins_user_date_idx` ON `checkins` (`user_id`,`entry_date`);--> statement-breakpoint
ALTER TABLE `face_photos` ADD `user_id` text REFERENCES users(id);