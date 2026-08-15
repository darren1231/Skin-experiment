CREATE TABLE `project_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`captured_date` text NOT NULL,
	`captured_time` text,
	`captured_at` text,
	`capture_time_known` integer DEFAULT true NOT NULL,
	`capture_time_source` text DEFAULT 'manual' NOT NULL,
	`uploaded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`photo_source` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`legacy_face_photo_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `tracking_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `project_photos_user_project_idx` ON `project_photos` (`user_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `project_photos_user_captured_idx` ON `project_photos` (`user_id`,`captured_date`,`captured_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_photos_legacy_photo_idx` ON `project_photos` (`legacy_face_photo_id`);--> statement-breakpoint
CREATE TABLE `tracking_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`enable_face_angle_guidance` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tracking_projects_user_idx` ON `tracking_projects` (`user_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `tracking_projects` (
	`id`, `user_id`, `name`, `description`, `enable_face_angle_guidance`, `created_at`, `updated_at`
)
SELECT DISTINCT
	'legacy-face-' || `users`.`id`,
	`users`.`id`,
	'臉部肌膚追蹤',
	'由原有臉部照片自動建立',
	1,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP
FROM `users`
INNER JOIN `face_photos`
	ON `face_photos`.`user_id` = `users`.`id`
	OR (`face_photos`.`user_id` IS NULL AND `face_photos`.`owner_email` = `users`.`email`);
--> statement-breakpoint
INSERT OR IGNORE INTO `project_photos` (
	`user_id`, `project_id`, `storage_key`, `content_type`,
	`captured_date`, `captured_time`, `captured_at`,
	`capture_time_known`, `capture_time_source`, `uploaded_at`,
	`photo_source`, `note`, `legacy_face_photo_id`, `created_at`, `updated_at`
)
SELECT
	`users`.`id`,
	'legacy-face-' || `users`.`id`,
	`face_photos`.`object_key`,
	`face_photos`.`content_type`,
	`face_photos`.`entry_date`,
	NULL,
	NULL,
	0,
	'legacy_date_only',
	`face_photos`.`created_at`,
	'historical_import',
	'舊資料角度：' || `face_photos`.`angle` || '；原始資料沒有可靠拍攝時間',
	`face_photos`.`id`,
	`face_photos`.`created_at`,
	`face_photos`.`created_at`
FROM `face_photos`
INNER JOIN `users`
	ON `face_photos`.`user_id` = `users`.`id`
	OR (`face_photos`.`user_id` IS NULL AND `face_photos`.`owner_email` = `users`.`email`);
