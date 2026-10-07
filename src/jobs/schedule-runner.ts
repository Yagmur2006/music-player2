import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import {
  categories,
  playbackState,
  scheduleExecutions,
  schedules,
  songs,
} from "@/db/schema";
import { serializeSong } from "@/server/songs-service";
import {
  getEnabledScheduleAt,
  getLatestEnabledScheduleAtOrBefore,
  isValidScheduleTime,
} from "@/server/schedule-service";
import type { SongDTO } from "@/lib/types";

const EXECUTION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ExecutionOutcome =
  | { kind: "EXECUTED"; executionId: string; categoryId: string | null; count: number }
  | { kind: "DUPLICATE" }
  | { kind: "NOT_FOUND" };

function executionContext(executionDate: string, scheduleTime: string): string {
  return `date=${executionDate} time=${scheduleTime} timezone=Asia/Tehran`;
}

/** Execute one enabled schedule for its local calendar date and HH:mm slot. */
export async function executeScheduleAt(
  executionDate: string,
  scheduleTime: string,
): Promise<ExecutionOutcome["kind"]> {
  if (!EXECUTION_DATE_PATTERN.test(executionDate) || !isValidScheduleTime(scheduleTime)) {
    throw new Error("Invalid schedule execution date or time");
  }

  await ensureBootstrap();
  const candidate = await getEnabledScheduleAt(scheduleTime);
  if (!candidate) return "NOT_FOUND";

  console.info(
    `[scheduler] schedule matched ${executionContext(executionDate, scheduleTime)} scheduleId=${candidate.id} categoryId=${candidate.categoryId}`,
  );

  try {
    const outcome = await db.transaction<ExecutionOutcome>(async (tx) => {
      // Lock and recheck the schedule so an admin edit/disable racing this exact
      // minute cannot execute a stale category or stale time.
      const [schedule] = await tx
        .select()
        .from(schedules)
        .where(
          and(
            eq(schedules.id, candidate.id),
            eq(schedules.time, scheduleTime),
            eq(schedules.enabled, true),
          ),
        )
        .for("update")
        .limit(1);
      if (!schedule) return { kind: "NOT_FOUND" };

      const [marker] = await tx
        .insert(scheduleExecutions)
        .values({
          executionDate,
          scheduleTime,
          scheduleId: schedule.id,
          categoryId: null,
        })
        .onConflictDoNothing({
          target: [scheduleExecutions.executionDate, scheduleExecutions.scheduleTime],
        })
        .returning({ id: scheduleExecutions.id });

      if (!marker) return { kind: "DUPLICATE" };

      console.info(
        `[schedule-runner] execution started ${executionContext(executionDate, scheduleTime)} scheduleId=${schedule.id} categoryId=${schedule.categoryId}`,
      );

      const [category] = await tx
        .select()
        .from(categories)
        .where(eq(categories.id, schedule.categoryId))
        .limit(1);
      if (!category) {
        console.error(
          `[scheduler] scheduled category is missing ${executionContext(executionDate, scheduleTime)} scheduleId=${schedule.id} categoryId=${schedule.categoryId}`,
        );
        await tx
          .insert(playbackState)
          .values({
            id: 1,
            executionId: marker.id,
            scheduleId: schedule.id,
            categoryId: null,
            categoryName: null,
            currentSongId: null,
            playlistSnapshot: [],
            currentIndex: 0,
            status: "IDLE",
            startedAt: null,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: playbackState.id,
            set: {
              executionId: marker.id,
              scheduleId: schedule.id,
              categoryId: null,
              categoryName: null,
              currentSongId: null,
              playlistSnapshot: [],
              currentIndex: 0,
              status: "IDLE",
              startedAt: null,
              updatedAt: new Date(),
            },
          });
        console.info(
          `[schedule-runner] playback state updated ${executionContext(executionDate, scheduleTime)} scheduleId=${schedule.id} categoryId=missing status=IDLE`,
        );
        return {
          kind: "EXECUTED",
          executionId: marker.id,
          categoryId: null,
          count: 0,
        };
      }

      const songRows = await tx
        .select()
        .from(songs)
        .where(eq(songs.categoryId, category.id))
        .orderBy(asc(songs.order), asc(songs.createdAt));
      const playlistSnapshot: SongDTO[] = songRows.map(serializeSong);

      console.info(
        `[schedule-runner] category loaded ${executionContext(executionDate, scheduleTime)} scheduleId=${schedule.id} categoryId=${category.id} songCount=${playlistSnapshot.length}`,
      );
      console.info(
        `[schedule-runner] playlist snapshot created ${executionContext(executionDate, scheduleTime)} scheduleId=${schedule.id} categoryId=${category.id} songCount=${playlistSnapshot.length}`,
      );

      await tx
        .update(scheduleExecutions)
        .set({ categoryId: category.id })
        .where(eq(scheduleExecutions.id, marker.id));

      if (playlistSnapshot.length === 0) {
        console.warn(
          `[scheduler] empty category ${executionContext(executionDate, scheduleTime)} scheduleId=${schedule.id} categoryId=${category.id}`,
        );
      }

      const now = new Date();
      const values = {
        executionId: marker.id,
        scheduleId: schedule.id,
        categoryId: category.id,
        categoryName: category.name,
        currentSongId: playlistSnapshot[0]?.id ?? null,
        playlistSnapshot,
        currentIndex: 0,
        status: playlistSnapshot.length > 0 ? ("PLAYING" as const) : ("IDLE" as const),
        startedAt: playlistSnapshot.length > 0 ? now : null,
        updatedAt: now,
      };

      await tx
        .insert(playbackState)
        .values({ id: 1, ...values })
        .onConflictDoUpdate({ target: playbackState.id, set: values });

      console.info(
        `[schedule-runner] playback state updated ${executionContext(executionDate, scheduleTime)} scheduleId=${schedule.id} categoryId=${category.id} status=${values.status}`,
      );
      return {
        kind: "EXECUTED",
        executionId: marker.id,
        categoryId: category.id,
        count: playlistSnapshot.length,
      };
    });

    if (outcome.kind === "DUPLICATE") {
      console.info(
        `[scheduler] duplicate execution prevented ${executionContext(executionDate, scheduleTime)} scheduleId=${candidate.id} categoryId=${candidate.categoryId}`,
      );
      return outcome.kind;
    }
    if (outcome.kind === "NOT_FOUND") return outcome.kind;

    console.info(
      `[schedule-runner] execution completed ${executionContext(executionDate, scheduleTime)} scheduleId=${candidate.id} categoryId=${outcome.categoryId ?? "missing"} executionId=${outcome.executionId} songCount=${outcome.count}`,
    );
    return outcome.kind;
  } catch (error) {
    console.error(
      `[schedule-runner] execution failed ${executionContext(executionDate, scheduleTime)} scheduleId=${candidate.id} categoryId=${candidate.categoryId}:`,
      error,
    );
    throw error;
  }
}

/**
 * Recovery is intentionally limited to today's latest enabled time that has
 * passed. If it was already executed, the unique marker preserves its current
 * (possibly completed/WAITING) state instead of restarting the playlist.
 */
export async function recoverPlaybackOnStartup(
  executionDate: string,
  currentTime: string,
): Promise<void> {
  await ensureBootstrap();
  const latest = await getLatestEnabledScheduleAtOrBefore(currentTime);
  if (!latest) {
    const now = new Date();
    await db
      .insert(playbackState)
      .values({
        id: 1,
        executionId: null,
        scheduleId: null,
        categoryId: null,
        categoryName: null,
        currentSongId: null,
        playlistSnapshot: [],
        currentIndex: 0,
        status: "WAITING",
        startedAt: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: playbackState.id,
        set: {
          executionId: null,
          scheduleId: null,
          categoryId: null,
          categoryName: null,
          currentSongId: null,
          playlistSnapshot: [],
          currentIndex: 0,
          status: "WAITING",
          startedAt: null,
          updatedAt: now,
        },
      });
    console.info(
      `[scheduler] startup recovery found no previous schedule ${executionContext(executionDate, currentTime)}`,
    );
    return;
  }

  console.info(
    `[scheduler] startup recovery selected ${executionContext(executionDate, latest.time)} scheduleId=${latest.id} categoryId=${latest.categoryId}`,
  );
  await executeScheduleAt(executionDate, latest.time);
}
