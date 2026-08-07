import { randomBytes } from "node:crypto";
import { Context, Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramWhitelist } from "@/db/schema";
import { ensureBootstrap, getSystemConfig, listCategoriesOrdered } from "@/db/bootstrap";
import { config } from "@/lib/config";
import { createSong } from "@/server/songs-service";
import { extensionOf } from "@/lib/storage";

type PendingUpload = {
  fileId: string;
  fileName: string;
  title: string | null;
  artist: string | null;
  duration: number | null;
  requestedBy: string;
  createdAt: number;
};

const PENDING_TTL_MS = 15 * 60 * 1000;
const pending = new Map<string, PendingUpload>();

function prunePending(): void {
  const now = Date.now();
  for (const [key, value] of pending.entries()) {
    if (now - value.createdAt > PENDING_TTL_MS) pending.delete(key);
  }
}

export type TelegramPermission = {
  allowed: boolean;
  reason: "WHITELIST" | "GUEST_UPLOAD_ENABLED" | "GUEST_UPLOAD_DISABLED";
};

/** Whitelist first, then the global guest-upload switch (admins of the web app bypass this). */
export async function resolveTelegramPermission(
  telegramId: string,
): Promise<TelegramPermission> {
  const [entry] = await db
    .select({ id: telegramWhitelist.id })
    .from(telegramWhitelist)
    .where(eq(telegramWhitelist.telegramId, telegramId))
    .limit(1);

  if (entry) return { allowed: true, reason: "WHITELIST" };

  const system = await getSystemConfig();
  return system.allowGuestUpload
    ? { allowed: true, reason: "GUEST_UPLOAD_ENABLED" }
    : { allowed: false, reason: "GUEST_UPLOAD_DISABLED" };
}

function displayName(from?: { username?: string; first_name?: string; id?: number }): string {
  if (!from) return "telegram";
  if (from.username) return `@${from.username}`;
  if (from.first_name) return from.first_name;
  return `tg:${from.id ?? "unknown"}`;
}

async function downloadTelegramFile(bot: Telegraf, fileId: string): Promise<Buffer> {
  const link = await bot.telegram.getFileLink(fileId);
  const response = await fetch(link.href);
  if (!response.ok) {
    throw new Error(`Telegram file download failed with status ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function buildBot(token: string): Telegraf {
  const bot = new Telegraf(token, {
    telegram: { apiRoot:"https://telegram-proxy.yagmur-fazli99.workers.dev/ "},
    handlerTimeout: 120_000,
  });

  bot.catch((error, ctx) => {
    // Never crash the process: the web app must stay 100% operational offline.
    console.error(
      `[telegram] handler error for update ${ctx.updateType}:`,
      error instanceof Error ? error.message : error,
    );
  });

  bot.start(async (ctx) => {
    await ensureBootstrap();
    await ctx.reply(
      [
        `☕️ Welcome to the cafe music sync bot (@${config.telegram.botUsername}).`,
        "",
        "Send or forward an audio file (MP3/M4A/WAV/FLAC) and I will ask which",
        "playlist it belongs to, then publish it straight to the cafe player.",
        "",
        "Commands: /list — playlists · /whoami — your Telegram ID · /help",
      ].join("\n"),
    );
  });

  bot.help(async (ctx) => {
    await ctx.reply(
      [
        "How to add music:",
        "1. Send me an audio file or forward one from any chat.",
        "2. Tap the playlist button I show you.",
        "3. I store the file on the cafe server and add it to the end of that playlist.",
        "",
        "If uploads are locked, ask an admin to whitelist your Telegram ID (/whoami)",
        "or to enable guest uploads in the web dashboard.",
      ].join("\n"),
    );
  });

  bot.command("whoami", async (ctx) => {
    const id = String(ctx.from?.id ?? "unknown");
    const permission = await resolveTelegramPermission(id).catch(() => null);
    await ctx.reply(
      [
        `Your Telegram ID: ${id}`,
        permission
          ? permission.allowed
            ? `Upload access: ✅ granted (${permission.reason.toLowerCase().replace(/_/g, " ")})`
            : "Upload access: ⛔️ locked — ask an admin to whitelist you"
          : "Upload access: unknown (database unreachable)",
      ].join("\n"),
    );
  });

  bot.command("list", async (ctx) => {
    await ensureBootstrap();
    const categories = await listCategoriesOrdered();
    if (categories.length === 0) {
      await ctx.reply("No playlists exist yet. Create one in the web dashboard first.");
      return;
    }
    await ctx.reply(
      ["🎚 Playlists:", ...categories.map((c, i) => `${i + 1}. ${c.name} (${c.slug})`)].join(
        "\n",
      ),
    );
  });

  const handleIncomingAudio = async (
    ctx: Context,
    file: {
      file_id: string;
      file_name?: string;
      mime_type?: string;
      title?: string;
      performer?: string;
      duration?: number;
    },
  ) => {
    await ensureBootstrap();
    const telegramId = String(ctx.from?.id ?? "");
    const permission = await resolveTelegramPermission(telegramId);

    if (!permission.allowed) {
      await ctx.reply(
        "⛔️ Uploads are currently locked. Ask a cafe admin to whitelist your ID " +
          `(${telegramId}) or enable guest uploads in the dashboard.`,
      );
      return;
    }

    const fallbackName = file.file_name ?? `${file.title ?? "telegram-track"}.mp3`;
    const ext = extensionOf(fallbackName);
    const fileName = ext ? fallbackName : `${fallbackName}.mp3`;

    const categories = await listCategoriesOrdered();
    if (categories.length === 0) {
      await ctx.reply("No playlists exist yet. Create one in the web dashboard first.");
      return;
    }

    prunePending();
    const key = randomBytes(4).toString("hex");
    pending.set(key, {
      fileId: file.file_id,
      fileName,
      title: file.title ?? null,
      artist: file.performer ?? null,
      duration: file.duration ?? null,
      requestedBy: displayName(ctx.from),
      createdAt: Date.now(),
    });

    await ctx.reply(
      `🎧 "${file.title ?? fileName}" received. Which playlist should it join?`,
      Markup.inlineKeyboard(
        categories.map((category) => [
          Markup.button.callback(`▶︎ ${category.name}`, `pick:${key}:${category.id}`),
        ]),
      ),
    );
  };

  bot.on(message("audio"), async (ctx) => {
    await handleIncomingAudio(ctx, ctx.message.audio);
  });

  bot.on(message("voice"), async (ctx) => {
    await handleIncomingAudio(ctx, {
      file_id: ctx.message.voice.file_id,
      file_name: `voice-note-${Date.now()}.ogg`,
      mime_type: ctx.message.voice.mime_type,
      duration: ctx.message.voice.duration,
    });
  });

  bot.on(message("document"), async (ctx) => {
    const doc = ctx.message.document;
    const looksAudio =
      (doc.mime_type ?? "").startsWith("audio/") ||
      [".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac", ".opus"].includes(
        extensionOf(doc.file_name ?? ""),
      );
    if (!looksAudio) {
      await ctx.reply("That file is not an audio track — send MP3, M4A, WAV, FLAC or OGG.");
      return;
    }
    await handleIncomingAudio(ctx, {
      file_id: doc.file_id,
      file_name: doc.file_name,
      mime_type: doc.mime_type,
    });
  });

  bot.action(/^pick:([a-f0-9]{8}):([0-9a-fA-F-]{36})$/, async (ctx) => {
    const key = ctx.match[1];
    const categoryId = ctx.match[2];
    await ctx.answerCbQuery("Downloading…").catch(() => undefined);

    const job = pending.get(key);
    if (!job) {
      await ctx.editMessageText("⏳ That upload expired. Please send the file again.");
      return;
    }

    try {
      await ensureBootstrap();
      const permission = await resolveTelegramPermission(String(ctx.from?.id ?? ""));
      if (!permission.allowed) {
        await ctx.editMessageText("⛔️ Uploads were locked before this file was saved.");
        pending.delete(key);
        return;
      }

      const buffer = await downloadTelegramFile(bot, job.fileId);
      const song = await createSong({
        buffer,
        originalName: job.fileName,
        categoryId,
        uploadedBy: job.requestedBy,
        source: "TELEGRAM",
        title: job.title,
        artist: job.artist,
        durationHint: job.duration,
      });
      pending.delete(key);

      const categories = await listCategoriesOrdered();
      const category = categories.find((c) => c.id === categoryId);
      await ctx.editMessageText(
        [
          "✅ Added to the cafe player.",
          `🎵 ${song.title} — ${song.artist}`,
          `🗂 Playlist: ${category?.name ?? "Unknown"} (position #${song.order + 1})`,
          `⏱ Duration: ${Math.floor(song.duration / 60)}:${String(song.duration % 60).padStart(2, "0")}`,
        ].join("\n"),
      );
    } catch (error) {
      console.error("[telegram] upload failed:", error);
      await ctx
        .editMessageText(
          `⚠️ Upload failed: ${error instanceof Error ? error.message : "unknown error"}`,
        )
        .catch(() => undefined);
    }
  });

  bot.on(message("text"), async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    await ctx.reply("Send me an audio file to add it to a cafe playlist. /help for details.");
  });

  return bot;
}

let cachedBot: Telegraf | null = null;

/** Returns the shared bot instance, or null when no token is configured. */
export function getBot(): Telegraf | null {
  if (!config.telegram.token) return null;
  if (!cachedBot) {
    cachedBot = buildBot(config.telegram.token);
  }
  return cachedBot;
}

/** Lightweight reachability probe used by the admin panel (intranet-safe). */
export async function probeTelegram(timeoutMs = 4000): Promise<{
  reachable: boolean;
  message: string;
  botUsername: string;
}> {
  const bot = getBot();
  if (!bot) {
    return {
      reachable: false,
      message: "TELEGRAM_BOT_TOKEN is not configured — bot disabled, web app unaffected.",
      botUsername: config.telegram.botUsername,
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${config.telegram.apiRoot}/bot${config.telegram.token}/getMe`,
      { signal: controller.signal, cache: "no-store" },
    );
    const payload = (await response.json()) as {
      ok: boolean;
      result?: { username?: string };
      description?: string;
    };
    if (!payload.ok) {
      return {
        reachable: false,
        message: payload.description ?? "Telegram rejected the token.",
        botUsername: config.telegram.botUsername,
      };
    }
    return {
      reachable: true,
      message: "Connected to Telegram API.",
      botUsername: payload.result?.username ?? config.telegram.botUsername,
    };
  } catch (error) {
    return {
      reachable: false,
      message:
        error instanceof Error && error.name === "AbortError"
          ? "Telegram API unreachable (timeout). Local playback continues normally."
          : `Telegram API unreachable: ${error instanceof Error ? error.message : "network error"}`,
      botUsername: config.telegram.botUsername,
    };
  } finally {
    clearTimeout(timer);
  }
}
