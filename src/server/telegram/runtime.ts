import { getBot, probeTelegram } from "@/server/telegram/bot";
import { config } from "@/lib/config";

/**
 * In-process Telegram supervisor.
 *
 * State machine (strict):
 *
 *   OFF      — default state on server boot and after disconnect/error.
 *              ZERO Telegram network activity happens in this state.
 *
 *   STARTING — transient state while the admin's "connect" click is being processed
 *              (getMe probe + bot.launch()).
 *
 *   ACTIVE   — the real Telegraf bot is polling and accepting music uploads.
 *
 *   ERROR    — a connection attempt failed, or an active bot lost its connection.
 *              No automatic retry and no background listener of any kind.
 *
 * There is intentionally NO standby/background listener mode. Before the admin
 * presses the connect button, this module must never call any Telegram API method.
 */

export type BotMode = "OFF" | "STARTING" | "ACTIVE" | "ERROR";

export type BotRuntimeStatus = {
  /** Current supervisor mode. */
  mode: BotMode;
  /** True only when the real bot is accepting music. */
  active: boolean;
  /** Whether TELEGRAM_BOT_TOKEN is present at all. */
  configured: boolean;
  botUsername: string;
  /** Persian, user-facing status line rendered in the admin panel. */
  message: string;
  /** ISO timestamp of the moment the real bot came online. */
  startedAt: string | null;
};

type RuntimeState = {
  mode: BotMode;
  message: string;
  startedAt: number | null;
  botUsername: string;
};

/**
 * Kept on globalThis so Next.js dev-mode hot reloads (which re-evaluate modules)
 * cannot leave a second poller running against the same token.
 */
const globalForBot = globalThis as typeof globalThis & {
  __cafeTelegramRuntime?: RuntimeState;
};

function state(): RuntimeState {
  globalForBot.__cafeTelegramRuntime ??= {
    mode: "OFF",
    message: config.telegram.token
      ? "ربات غیرفعال است. برای اتصال روی دکمهٔ «اتصال ربات تلگرام» کلیک کنید."
      : "توکن ربات تلگرام تنظیم نشده است؛ بخش موسیقی سایت مستقل از ربات کار می‌کند.",
    startedAt: null,
    botUsername: config.telegram.botUsername,
  };
  return globalForBot.__cafeTelegramRuntime;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Called once by `src/instrumentation.ts` when the Next.js server boots.
 *
 * This function performs ZERO Telegram network requests. It only ensures the
 * in-memory state object exists and is set to OFF. It must never start polling,
 * never probe Telegram, and never create any kind of background listener.
 */
export function initTelegramRuntime(): void {
  const current = state();
  // Never resume a previous ACTIVE/STARTING session across a restart: the admin
  // must explicitly press the button again after every server boot.
  current.mode = "OFF";
  current.startedAt = null;
  current.message = config.telegram.token
    ? "ربات غیرفعال است. برای اتصال روی دکمهٔ «اتصال ربات تلگرام» کلیک کنید."
    : "توکن ربات تلگرام تنظیم نشده است؛ بخش موسیقی سایت مستقل از ربات کار می‌کند.";
}

/**
 * The button handler — the in-app equivalent of `npm run bot`.
 * Resolves only after we know whether the connection actually succeeded, so the UI can
 * show the green or the red banner immediately.
 *
 * This is the ONLY function in the codebase allowed to call bot.launch().
 */
export async function startBotRuntime(): Promise<BotRuntimeStatus> {
  const current = state();

  if (!config.telegram.token) {
    current.mode = "OFF";
    current.message =
      "توکن ربات تلگرام روی سرور تنظیم نشده است. لطفاً با پشتیبانی فنی تماس بگیرید.";
    return snapshot();
  }

  if (current.mode === "ACTIVE") {
    current.message = "ربات از قبل متصل است؛ می‌توانید موسیقی ارسال کنید.";
    return snapshot();
  }

  if (current.mode === "STARTING") {
    current.message = "درخواست اتصال قبلی در حال پردازش است…";
    return snapshot();
  }

  const bot = getBot();
  if (!bot) {
    current.mode = "ERROR";
    current.message = "ساخت نمونهٔ ربات ممکن نشد. توکن تلگرام را بررسی کنید.";
    return snapshot();
  }

  current.mode = "STARTING";
  current.message = "در حال اتصال به تلگرام…";

  // Reachability first: this is the single getMe request allowed by the spec,
  // and only happens because the admin pressed the button.
  const probe = await probeTelegram(8000);
  if (!probe.reachable) {
    current.mode = "ERROR";
    current.startedAt = null;
    current.message =
      "اتصال برقرار نشد — لطفاً اتصال اینترنت سرور را بررسی کنید و دوباره تلاش کنید.";
    return snapshot();
  }

  current.botUsername = probe.botUsername;

  try {
    // `launch()` resolves only when the bot stops, so it must not be awaited here.
    void bot
      .launch({ dropPendingUpdates: false })
      .then(() => {
        // Telegraf resolved this because .stop() was called (admin disconnect) or
        // the process is shutting down. Either way we go to OFF, never standby.
        const live = state();
        if (live.mode === "ACTIVE" || live.mode === "STARTING") {
          live.mode = "OFF";
          live.startedAt = null;
          live.message = "ربات متوقف شد.";
        }
      })
      .catch((error: unknown) => {
        // The active bot lost its connection. Go straight to ERROR, no retry,
        // no standby, no automatic reconnect.
        const live = state();
        live.mode = "ERROR";
        live.startedAt = null;
        live.message =
          "اتصال قطع شد — لطفاً اتصال اینترنت را بررسی کنید و دوباره روی دکمهٔ اتصال کلیک کنید.";
        console.error(
          "[telegram] polling stopped with an error:",
          error instanceof Error ? error.message : error,
        );
      });

    // Give telegraf a moment to fail fast (409 conflict, revoked token, DNS, …).
    await sleep(1200);

    if (state().mode === "ERROR") return snapshot();

    current.mode = "ACTIVE";
    current.startedAt = Date.now();
    current.message = `ربات متصل شد. اکنون می‌توانید در @${current.botUsername} موسیقی ارسال کنید.`;
    return snapshot();
  } catch (error) {
    current.mode = "ERROR";
    current.startedAt = null;
    current.message =
      "اتصال برقرار نشد — لطفاً اتصال اینترنت سرور را بررسی کنید و دوباره تلاش کنید.";
    console.error(
      "[telegram] activation failed:",
      error instanceof Error ? error.message : error,
    );
    return snapshot();
  }
}

/** Stops the real bot and returns to a fully inactive OFF state. No standby, no retry. */
export async function stopBotRuntime(): Promise<BotRuntimeStatus> {
  const current = state();
  const bot = getBot();

  if ((current.mode === "ACTIVE" || current.mode === "STARTING") && bot) {
    try {
      bot.stop("web-ui-stop");
    } catch (error) {
      console.warn(
        "[telegram] stop() reported:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  current.mode = "OFF";
  current.startedAt = null;
  current.message = config.telegram.token
    ? "ربات قطع شد. برای اتصال دوباره، روی دکمهٔ اتصال کلیک کنید."
    : "توکن ربات تلگرام تنظیم نشده است.";

  return snapshot();
}

export function snapshot(): BotRuntimeStatus {
  const current = state();
  return {
    mode: current.mode,
    active: current.mode === "ACTIVE",
    configured: Boolean(config.telegram.token),
    botUsername: current.botUsername,
    message: current.message,
    startedAt: current.startedAt ? new Date(current.startedAt).toISOString() : null,
  };
}