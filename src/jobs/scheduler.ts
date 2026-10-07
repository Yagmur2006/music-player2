import "server-only";

import cron, { type ScheduledTask } from "node-cron";
import { executeScheduleAt, recoverPlaybackOnStartup } from "@/jobs/schedule-runner";

export const SCHEDULER_TIMEZONE = "Asia/Tehran";
const CRON_EXPRESSION = "* * * * *";

const tehranFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: SCHEDULER_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type TehranDateTime = { date: string; time: string };

type SchedulerGlobal = typeof globalThis & {
  __dailyMusicSchedulerTask?: ScheduledTask;
  __dailyMusicSchedulerRecovery?: Promise<void>;
};

const globalForScheduler = globalThis as SchedulerGlobal;

/** Convert a real instant to the explicit Tehran calendar date and HH:mm slot. */
export function getTehranDateTime(at = new Date()): TehranDateTime {
  const parts = tehranFormatter.formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

async function runCurrentMinute(): Promise<void> {
  const { date, time } = getTehranDateTime();
  await executeScheduleAt(date, time);
}

/**
 * One process-wide node-cron task. The database execution key is a second guard
 * for races between this task, startup recovery, or multiple local processes.
 */
export function initializeDailyScheduler(): void {
  if (globalForScheduler.__dailyMusicSchedulerTask) return;

  const task = cron.schedule(
    CRON_EXPRESSION,
    async () => {
      try {
        await runCurrentMinute();
      } catch (error) {
        // Keep the Next.js process alive; the next cron minute and startup recovery
        // can continue even if PostgreSQL is briefly unavailable.
        console.error(
          "[scheduler] minute execution failed:",
          error instanceof Error ? error.message : error,
        );
      }
    },
    {
      timezone: SCHEDULER_TIMEZONE,
      noOverlap: true,
      name: "daily-music-scheduler",
    },
  );

  // Assign synchronously before starting recovery: Next.js instrumentation and
  // development hot reloads can call register() more than once in one process.
  globalForScheduler.__dailyMusicSchedulerTask = task;
  console.info(
    `[scheduler] started expression=${CRON_EXPRESSION} timezone=${SCHEDULER_TIMEZONE}`,
  );

  if (!globalForScheduler.__dailyMusicSchedulerRecovery) {
    const now = getTehranDateTime();
    globalForScheduler.__dailyMusicSchedulerRecovery = recoverPlaybackOnStartup(
      now.date,
      now.time,
    )
      .catch((error) => {
        // Instrumentation is best-effort. Cron remains registered and will retry
        // database work on its next minute tick.
        console.error(
          `[scheduler] startup recovery failed date=${now.date} time=${now.time} timezone=${SCHEDULER_TIMEZONE}:`,
          error instanceof Error ? error.message : error,
        );
      })
      .finally(() => {
        globalForScheduler.__dailyMusicSchedulerRecovery = undefined;
      });
  }
}
