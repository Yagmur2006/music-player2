/**
 * Next.js server bootstrap hook.
 *
 * Arms the local Telegram standby responder and the daily music scheduler when
 * the long-lived Node.js server starts. Both services have their own global
 * singleton guards so Next.js development reloads cannot duplicate workers.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { initTelegramRuntime } = await import("@/server/telegram/runtime");
    initTelegramRuntime();
  } catch (error) {
    // Never block the web app because of Telegram.
    console.warn(
      "[instrumentation] telegram standby not armed:",
      error instanceof Error ? error.message : error,
    );
  }

  try {
    const { initializeDailyScheduler } = await import("@/jobs/scheduler");
    initializeDailyScheduler();
  } catch (error) {
    // Do not crash Next.js if cron initialization itself fails.
    console.error(
      "[instrumentation] daily scheduler not started:",
      error instanceof Error ? error.message : error,
    );
  }
}
