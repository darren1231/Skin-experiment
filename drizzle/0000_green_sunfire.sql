CREATE TABLE `checkins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`entry_date` text NOT NULL,
	`metrics` text NOT NULL,
	`sleep` integer DEFAULT 0 NOT NULL,
	`stress` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`whole_routine` text DEFAULT '' NOT NULL,
	`left_routine` text DEFAULT '' NOT NULL,
	`right_routine` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkins_owner_date_idx` ON `checkins` (`owner_email`,`entry_date`);--> statement-breakpoint
CREATE TABLE `face_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`entry_date` text NOT NULL,
	`angle` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
