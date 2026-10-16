import "server-only";

import { and, asc, desc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { categories, schedules, type ScheduleRow } from "@/db/schema";
import type { ScheduleCategoryDTO, ScheduleDTO } from "@/lib/types";
import { badRequest, conflict, notFound } from "@/lib/http";

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ScheduleCategoryRow = {
  id: string;
  name: string;
  slug: string;
  accent: string;
};

export function isValidScheduleTime(value: unknown): value is string {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

function assertScheduleTime(value: unknown): asserts value is string {
  if (!isValidScheduleTime(value)) {
    throw badRequest("Time must be a valid 24-hour HH:mm value");
  }
}

function assertUuid(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw badRequest(`${field} must be a valid UUID`);
  }
}

function categoryDTO(row: ScheduleCategoryRow): ScheduleCategoryDTO {
  return { id: row.id, name: row.name, slug: row.slug, accent: row.accent };
}

function serializeSchedule(
  row: ScheduleRow,
  category: ScheduleCategoryRow,
): ScheduleDTO {
  return {
    id: row.id,
    time: row.time,
    categoryId: row.categoryId,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    category: categoryDTO(category),
  };
}

function isPostgresError(error: unknown, code: string): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === code,
  );
}

function mapWriteError(error: unknown): never {
  if (isPostgresError(error, "23505")) {
    throw conflict("A schedule already exists for this time");
  }
  if (isPostgresError(error, "23503")) {
    throw notFound("Category not found");
  }
  throw error;
}

async function getCategory(categoryId: string): Promise<ScheduleCategoryRow> {
  const [row] = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      accent: categories.accent,
    })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);

  if (!row) throw notFound("Category not found");
  return row;
}

export async function listSchedules(): Promise<ScheduleDTO[]> {
  const rows = await db
    .select({
      schedule: schedules,
      category: {
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        accent: categories.accent,
      },
    })
    .from(schedules)
    .leftJoin(categories, eq(schedules.categoryId, categories.id))
    .orderBy(asc(schedules.time));

  return rows.flatMap(({ schedule, category }) => {
    // The FK and DB time check normally make both branches impossible, but filter
    // corrupt rows instead of leaking invalid records through the admin API.
    if (!category || !isValidScheduleTime(schedule.time)) return [];
    return [serializeSchedule(schedule, category)];
  });
}

export async function getScheduleById(id: string): Promise<ScheduleDTO> {
  assertUuid(id, "id");
  const [row] = await db
    .select({
      schedule: schedules,
      category: {
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        accent: categories.accent,
      },
    })
    .from(schedules)
    .innerJoin(categories, eq(schedules.categoryId, categories.id))
    .where(eq(schedules.id, id))
    .limit(1);

  if (!row || !isValidScheduleTime(row.schedule.time)) throw notFound("Schedule not found");
  return serializeSchedule(row.schedule, row.category);
}

export async function createSchedule(input: {
  time: unknown;
  categoryId: unknown;
  enabled?: unknown;
}): Promise<ScheduleDTO> {
  assertScheduleTime(input.time);
  assertUuid(input.categoryId, "categoryId");
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
    throw badRequest("enabled must be a boolean");
  }

  const category = await getCategory(input.categoryId);
  try {
    const [row] = await db
      .insert(schedules)
      .values({
        time: input.time,
        categoryId: input.categoryId,
        enabled: input.enabled ?? true,
      })
      .returning();
    return serializeSchedule(row, category);
  } catch (error) {
    mapWriteError(error);
  }
}

export async function updateSchedule(
  id: string,
  input: { time?: unknown; categoryId?: unknown; enabled?: unknown },
): Promise<ScheduleDTO> {
  assertUuid(id, "id");
  const current = await getScheduleById(id);
  const patch: Partial<typeof schedules.$inferInsert> = { updatedAt: new Date() };
  let category: ScheduleCategoryRow = current.category;

  if (input.time !== undefined) {
    assertScheduleTime(input.time);
    patch.time = input.time;
  }
  if (input.categoryId !== undefined) {
    assertUuid(input.categoryId, "categoryId");
    category = await getCategory(input.categoryId);
    patch.categoryId = input.categoryId;
  }
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") throw badRequest("enabled must be a boolean");
    patch.enabled = input.enabled;
  }
  if (Object.keys(patch).length === 1) {
    throw badRequest("Provide time, categoryId, and/or enabled");
  }

  try {
    const [row] = await db
      .update(schedules)
      .set(patch)
      .where(eq(schedules.id, id))
      .returning();
    if (!row) throw notFound("Schedule not found");
    return serializeSchedule(row, category);
  } catch (error) {
    mapWriteError(error);
  }
}

export async function deleteSchedule(id: string): Promise<{ success: true }> {
  assertUuid(id, "id");
  const [row] = await db.delete(schedules).where(eq(schedules.id, id)).returning({ id: schedules.id });
  if (!row) throw notFound("Schedule not found");
  // playback_state.schedule_id uses ON DELETE SET NULL; deleting a schedule only
  // changes future runs and deliberately leaves the current playlist untouched.
  return { success: true };
}

/** Find the one enabled schedule due at an exact Tehran HH:mm value. */
export async function getEnabledScheduleAt(time: string): Promise<ScheduleRow | null> {
  if (!isValidScheduleTime(time)) return null;
  const [row] = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.time, time), eq(schedules.enabled, true)))
    .limit(1);
  return row ?? null;
}

/** The most recent enabled time passed today, used only during startup recovery. */
export async function getLatestEnabledScheduleAtOrBefore(
  time: string,
): Promise<ScheduleRow | null> {
  if (!isValidScheduleTime(time)) return null;
  const [row] = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.enabled, true), lte(schedules.time, time)))
    .orderBy(desc(schedules.time))
    .limit(1);
  return row ?? null;
}
