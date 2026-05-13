import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  date,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const members = pgTable("members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#82837A"),
  role: text("role"),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  summary: text("summary").notNull().default(""),
  company: text("company"),
  dueDate: date("due_date"),
  color: text("color").notNull().default("#38537B"),
  status: text("status").notNull().default("active"),
  plannedMemberIds: jsonb("planned_member_ids").$type<number[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  aiSeed: jsonb("ai_seed").$type<{
    summary: string;
    dueDate?: string;
    plannedMemberIds: number[];
    model?: string;
  } | null>(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  assigneeMemberId: integer("assignee_member_id").references(() => members.id, {
    onDelete: "set null",
  }),
  weekIso: text("week_iso").notNull(),
  done: boolean("done").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
  estimatedHours: numeric("estimated_hours", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workload = pgTable(
  "workload",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    weekIso: text("week_iso").notNull(),
    plannedHours: numeric("planned_hours", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    memberWeekUnique: uniqueIndex("workload_member_week_unique").on(t.memberId, t.weekIso),
  }),
);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  label: text("label"),
});

export type Member = typeof members.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Workload = typeof workload.$inferSelect;
export type Session = typeof sessions.$inferSelect;
