import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  timezone: text("timezone").notNull().default("Asia/Taipei"),
  lastLoginAt: text("last_login_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const checkins = sqliteTable("checkins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").references(() => users.id),
  ownerEmail: text("owner_email").notNull(),
  entryDate: text("entry_date").notNull(),
  metrics: text("metrics").notNull(),
  sleep: integer("sleep").notNull().default(0),
  stress: integer("stress").notNull().default(0),
  note: text("note").notNull().default(""),
  wholeRoutine: text("whole_routine").notNull().default(""),
  leftRoutine: text("left_routine").notNull().default(""),
  rightRoutine: text("right_routine").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("checkins_owner_date_idx").on(table.ownerEmail, table.entryDate),
  uniqueIndex("checkins_user_date_idx").on(table.userId, table.entryDate),
]);

export const facePhotos = sqliteTable("face_photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").references(() => users.id),
  ownerEmail: text("owner_email").notNull(),
  entryDate: text("entry_date").notNull(),
  angle: text("angle").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const trackingProjects = sqliteTable("tracking_projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  enableFaceAngleGuidance: integer("enable_face_angle_guidance", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("tracking_projects_user_idx").on(table.userId),
]);

export const projectPhotos = sqliteTable("project_photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id),
  projectId: text("project_id").notNull().references(() => trackingProjects.id),
  storageKey: text("storage_key").notNull(),
  contentType: text("content_type").notNull(),
  capturedDate: text("captured_date").notNull(),
  capturedTime: text("captured_time"),
  capturedAt: text("captured_at"),
  captureTimeKnown: integer("capture_time_known", { mode: "boolean" }).notNull().default(true),
  captureTimeSource: text("capture_time_source").notNull().default("manual"),
  uploadedAt: text("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  photoSource: text("photo_source").notNull(),
  note: text("note").notNull().default(""),
  legacyFacePhotoId: integer("legacy_face_photo_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("project_photos_user_project_idx").on(table.userId, table.projectId),
  index("project_photos_user_captured_idx").on(table.userId, table.capturedDate, table.capturedAt),
  uniqueIndex("project_photos_legacy_photo_idx").on(table.legacyFacePhotoId),
]);
