import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, playbackState, schedules, songs } from "@/db/schema";
import type { PlaybackDTO, PlaybackStatus, SongDTO } from "@/lib/types";
import { badRequest } from "@/lib/http";

export async function ensurePlaybackStateRow(): Promise<void> {
  await db.insert(playbackState).values({ id: 1 }).onConflictDoNothing({ target: playbackState.id });
}

export async function getPlaybackState(): Promise<PlaybackDTO> {
  await ensurePlaybackStateRow();
  const [row] = await db
    .select({
      state: playbackState,
      schedule: { id: schedules.id, time: schedules.time },
      category: {
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        accent: categories.accent,
      },
    })
    .from(playbackState)
    .leftJoin(schedules, eq(playbackState.scheduleId, schedules.id))
    .leftJoin(categories, eq(playbackState.categoryId, categories.id))
    .where(eq(playbackState.id, 1))
    .limit(1);

  if (!row) {
    throw new Error("Playback state row could not be initialized");
  }

  const playlist = Array.isArray(row.state.playlistSnapshot)
    ? (row.state.playlistSnapshot as SongDTO[])
    : [];
  const currentIndex = Math.min(Math.max(0, row.state.currentIndex), playlist.length);
  const status: PlaybackStatus =
    row.state.status === "PLAYING" && playlist.length > 0 && currentIndex < playlist.length
      ? "PLAYING"
      : row.state.status === "IDLE"
        ? "IDLE"
        : "WAITING";
  const currentSong = status === "PLAYING" ? playlist[currentIndex] ?? null : null;
  const categoryName = row.state.categoryName ?? row.category?.name ?? null;

  return {
    status,
    executionId: row.state.executionId,
    scheduleId: row.state.scheduleId,
    schedule: row.schedule?.id ? { id: row.schedule.id, time: row.schedule.time } : null,
    category: categoryName
      ? {
          id: row.state.categoryId,
          name: categoryName,
          slug: row.state.categoryId ? row.category?.slug ?? null : null,
          accent: row.state.categoryId ? row.category?.accent ?? null : null,
        }
      : null,
    playlist,
    currentSong,
    currentIndex,
    startedAt: row.state.startedAt?.toISOString() ?? null,
    updatedAt: row.state.updatedAt.toISOString(),
  };
}

/**
 * The browser can only report progress for the immutable playlist execution the
 * server created. This endpoint cannot select a category, replace the snapshot,
 * or start a schedule; it only persists the current index / natural completion.
 */
export async function reportPlaybackProgress(input: {
  executionId: string;
  currentIndex: number;
}): Promise<{ success: true; updated: boolean }> {
  if (!Number.isInteger(input.currentIndex) || input.currentIndex < 0) {
    throw badRequest("currentIndex must be a non-negative integer");
  }

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(playbackState)
      .where(eq(playbackState.id, 1))
      .for("update")
      .limit(1);

    if (
      !current ||
      current.executionId !== input.executionId ||
      current.status !== "PLAYING"
    ) {
      // Ignore stale reports from a tab whose scheduled playlist was replaced.
      return { success: true, updated: false };
    }

    const playlist = Array.isArray(current.playlistSnapshot)
      ? (current.playlistSnapshot as SongDTO[])
      : [];
    if (input.currentIndex > playlist.length) {
      throw badRequest("currentIndex is outside the scheduled playlist");
    }
    if (input.currentIndex < current.currentIndex) {
      // Several public player tabs may be open. Never let a slower tab rewind the
      // durable server index after another tab has already advanced the playlist.
      return { success: true, updated: false };
    }
    if (input.currentIndex === current.currentIndex) {
      return { success: true, updated: false };
    }

    const completed = input.currentIndex === playlist.length;
    const requestedSongId = completed ? null : playlist[input.currentIndex]?.id ?? null;
    const [existingSong] = requestedSongId
      ? await tx
          .select({ id: songs.id })
          .from(songs)
          .where(eq(songs.id, requestedSongId))
          .limit(1)
      : [];
    await tx
      .update(playbackState)
      .set({
        currentIndex: input.currentIndex,
        currentSongId: existingSong?.id ?? null,
        status: completed ? "WAITING" : "PLAYING",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(playbackState.id, 1),
          eq(playbackState.executionId, input.executionId),
          eq(playbackState.status, "PLAYING"),
        ),
      );

    return { success: true, updated: true };
  });
}
