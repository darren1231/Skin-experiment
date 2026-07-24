import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
