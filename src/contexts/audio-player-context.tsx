"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PlayerDock } from "@/components/player-dock";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { api } from "@/lib/client-api";
import type { ReactNode } from "react";
import type { SongDTO } from "@/lib/types";
import type { PlayerState } from "@/hooks/use-audio-player";

type AudioPlayerContextValue = {
  state: PlayerState;
  play: (song?: SongDTO) => void;
  pause: () => void;
  playTrack: (song?: SongDTO) => void;
  pauseTrack: () => void;
  toggle: (song?: SongDTO) => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setQueue: (songs: SongDTO[]) => void;
  setCategoryName: (name: string) => void;
};

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

function playbackIdentity(snapshot: {
  executionId: string | null;
  scheduleId: string | null;
  playlist: SongDTO[];
}): string {
  const songSnapshot = snapshot.playlist.map((song) => [
    song.id,
    song.title,
    song.artist,
    song.duration,
    song.order,
    song.url,
  ]);
  return `${snapshot.executionId ?? snapshot.scheduleId ?? "none"}:${JSON.stringify(songSnapshot)}`;
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const player = useAudioPlayer([], audioRef);
  const playerState = player.state;
  const {
    startScheduledPlaylist,
    playScheduledTrack,
    stopScheduledPlaylist,
  } = player;
  const [categoryName, setCategoryName] = useState("Library");

  const playerStateRef = useRef(playerState);
  useEffect(() => {
    playerStateRef.current = playerState;
  }, [playerState]);
  const activeExecutionIdRef = useRef<string | null>(null);
  const seenPlaybackIdentityRef = useRef<string | null>(null);
  const lastReportedProgressRef = useRef<string | null>(null);
  const progressRequestInFlightRef = useRef(false);
  const completionPendingRef = useRef(false);
  const lastSyncErrorAtRef = useRef(0);

  const reportProgress = useCallback((executionId: string, currentIndex: number) => {
    if (progressRequestInFlightRef.current) return;
    progressRequestInFlightRef.current = true;
    void api
      .reportPlaybackProgress(executionId, currentIndex)
      .catch((error) => {
        lastReportedProgressRef.current = null;
        const now = Date.now();
        if (now - lastSyncErrorAtRef.current > 15_000) {
          lastSyncErrorAtRef.current = now;
          console.warn(
            "[player] could not sync scheduled playback progress:",
            error instanceof Error ? error.message : error,
          );
        }
      })
      .finally(() => {
        progressRequestInFlightRef.current = false;
      });
  }, []);

  /** Read the server-owned playlist every 1.5 seconds; never create a second player. */
  useEffect(() => {
    let disposed = false;
    let pollInFlight = false;

    const syncPlayback = async () => {
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        const remote = await api.playback();
        if (disposed) return;

        const identity = playbackIdentity(remote);
        const local = playerStateRef.current;
        const newSnapshot = identity !== seenPlaybackIdentityRef.current;

        if (newSnapshot) {
          seenPlaybackIdentityRef.current = identity;
          lastReportedProgressRef.current = null;
          completionPendingRef.current = false;

          if (remote.executionId && remote.status === "PLAYING" && remote.playlist.length > 0) {
            activeExecutionIdRef.current = remote.executionId;
            setCategoryName(remote.category?.name ?? "Library");
            startScheduledPlaylist(remote.playlist, remote.currentIndex);
          } else if (remote.executionId && remote.status === "IDLE") {
            // An empty scheduled category still replaces/stops the previous audio.
            activeExecutionIdRef.current = null;
            stopScheduledPlaylist();
            if (remote.category?.name) setCategoryName(remote.category.name);
          } else {
            activeExecutionIdRef.current = null;
            if (local.isScheduled) stopScheduledPlaylist();
          }
          return;
        }

        if (remote.executionId && remote.status === "PLAYING" && remote.playlist.length > 0) {
          if (
            activeExecutionIdRef.current !== remote.executionId ||
            !local.isScheduled
          ) {
            activeExecutionIdRef.current = remote.executionId;
            completionPendingRef.current = false;
            setCategoryName(remote.category?.name ?? "Library");
            startScheduledPlaylist(remote.playlist, remote.currentIndex);
            return;
          }

          if (completionPendingRef.current) {
            if (!progressRequestInFlightRef.current && local.queue.length > 0) {
              reportProgress(remote.executionId, local.queue.length);
            }
            return;
          }

          const localIndex = local.currentSong
            ? local.queue.findIndex((song) => song.id === local.currentSong?.id)
            : -1;
          if (localIndex > remote.currentIndex && localIndex >= 0) {
            // This client has just ended a track; do not rewind to a stale poll
            // while its monotonic progress report is still being persisted.
            if (!progressRequestInFlightRef.current) {
              reportProgress(remote.executionId, localIndex);
            }
          } else if (
            localIndex !== remote.currentIndex &&
            !progressRequestInFlightRef.current
          ) {
            playScheduledTrack(remote.currentIndex);
          }
          return;
        }

        if (
          remote.executionId &&
          activeExecutionIdRef.current === remote.executionId &&
          local.isScheduled
        ) {
          // WAITING is persisted when the last track ends. IDLE covers controlled
          // empty-category cases. Both stop this execution without restarting it.
          activeExecutionIdRef.current = null;
          completionPendingRef.current = false;
          lastReportedProgressRef.current = null;
          stopScheduledPlaylist();
        } else if (
          !remote.executionId &&
          remote.status === "WAITING" &&
          activeExecutionIdRef.current &&
          local.isScheduled
        ) {
          // Startup recovery with no schedule passed today clears stale playback.
          activeExecutionIdRef.current = null;
          completionPendingRef.current = false;
          stopScheduledPlaylist();
        }
      } catch (error) {
        const now = Date.now();
        if (now - lastSyncErrorAtRef.current > 15_000) {
          lastSyncErrorAtRef.current = now;
          console.warn(
            "[player] could not sync server playback state:",
            error instanceof Error ? error.message : error,
          );
        }
      } finally {
        pollInFlight = false;
      }
    };

    void syncPlayback();
    const timer = window.setInterval(() => void syncPlayback(), 1500);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [
    playScheduledTrack,
    startScheduledPlaylist,
    stopScheduledPlaylist,
    reportProgress,
  ]);

  // Report only track transitions / playlist completion, never audio time updates.
  useEffect(() => {
    const executionId = activeExecutionIdRef.current;
    if (!executionId || !playerState.isScheduled) return;

    if (playerState.currentSong) {
      const currentIndex = playerState.queue.findIndex(
        (song) => song.id === playerState.currentSong?.id,
      );
      if (currentIndex < 0) return;
      const key = `${executionId}:PLAYING:${currentIndex}`;
      if (lastReportedProgressRef.current === key) return;
      lastReportedProgressRef.current = key;
      reportProgress(executionId, currentIndex);
      return;
    }

    if (playerState.queue.length === 0) return;
    completionPendingRef.current = true;
    const currentIndex = playerState.queue.length;
    const key = `${executionId}:WAITING:${currentIndex}`;
    if (lastReportedProgressRef.current === key) return;
    lastReportedProgressRef.current = key;
    reportProgress(executionId, currentIndex);
  }, [
    playerState.currentSong,
    playerState.isScheduled,
    playerState.queue,
    reportProgress,
  ]);

  const value = useMemo(
    () => ({
      state: player.state,
      play: player.playTrack,
      pause: player.pause,
      playTrack: player.playTrack,
      pauseTrack: player.pause,
      toggle: player.toggle,
      togglePlay: player.togglePlay,
      next: player.next,
      previous: player.previous,
      seek: player.seek,
      setVolume: player.setVolume,
      toggleMute: player.toggleMute,
      toggleShuffle: player.toggleShuffle,
      cycleRepeat: player.cycleRepeat,
      setQueue: player.setQueue,
      setCategoryName,
    }),
    [player],
  );

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="metadata" className="hidden" />
      <PlayerDock
        state={player.state}
        onToggle={player.togglePlay}
        onNext={player.next}
        onPrevious={player.previous}
        onSeek={player.seek}
        onVolume={player.setVolume}
        onToggleMute={player.toggleMute}
        onToggleShuffle={player.toggleShuffle}
        onCycleRepeat={player.cycleRepeat}
        categoryName={categoryName}
      />
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayerContext() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error("useAudioPlayerContext must be used within AudioPlayerProvider");
  }
  return context;
}
