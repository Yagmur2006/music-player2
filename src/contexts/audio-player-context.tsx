"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PlayerDock } from "@/components/player-dock";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { api } from "@/lib/client-api";
import type { ReactNode } from "react";
import type { PlaybackDTO, SongDTO } from "@/lib/types";
import type { PlayerState } from "@/hooks/use-audio-player";

type AudioPlayerContextValue = {
  state: PlayerState;
  scheduledCategoryId: string | null;
  scheduledExecutionId: string | null;
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

type PendingProgress = { executionId: string; currentIndex: number };

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

function hasSameSongIds(left: SongDTO[], right: SongDTO[]): boolean {
  if (left.length !== right.length) return false;
  const ids = new Set(left.map((song) => song.id));
  return ids.size === left.length && right.every((song) => ids.has(song.id));
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const player = useAudioPlayer([], audioRef);
  const playerState = player.state;
  const {
    clearPendingScheduledPlaylist,
    cycleRepeat: cyclePlayerRepeat,
    next: playerNext,
    pause: pausePlayer,
    playScheduledTrack,
    playTrack: playPlayerTrack,
    previous: playerPrevious,
    queueScheduledPlaylist,
    seek: seekPlayer,
    setQueue: setPlayerQueue,
    setVolume: setPlayerVolume,
    startScheduledPlaylist,
    stopScheduledPlaylist,
    toggleMute: togglePlayerMute,
    togglePlay: togglePlayerPlay,
    toggleShuffle: togglePlayerShuffle,
  } = player;
  const [categoryName, setCategoryName] = useState("Library");
  const [scheduledCategoryId, setScheduledCategoryId] = useState<string | null>(null);
  const [scheduledExecutionId, setScheduledExecutionId] = useState<string | null>(null);

  const playerStateRef = useRef(playerState);
  useEffect(() => {
    playerStateRef.current = playerState;
  }, [playerState]);

  const activeExecutionIdRef = useRef<string | null>(null);
  const pendingExecutionIdRef = useRef<string | null>(null);
  const detachedExecutionIdRef = useRef<string | null>(null);
  const remotePlaylistRef = useRef<SongDTO[]>([]);
  const seenPlaybackIdentityRef = useRef<string | null>(null);
  const lastReportedProgressRef = useRef<string | null>(null);
  const progressRequestInFlightRef = useRef(false);
  const queuedProgressRef = useRef<PendingProgress | null>(null);
  const completionPendingRef = useRef(false);
  const lastSyncErrorAtRef = useRef(0);
  const lastUserControlAtRef = useRef(0);

  const reportProgress = useCallback(
    async function sendProgress(executionId: string, currentIndex: number): Promise<void> {
      if (progressRequestInFlightRef.current) {
        queuedProgressRef.current = { executionId, currentIndex };
        return;
      }

      progressRequestInFlightRef.current = true;
      try {
        await api.reportPlaybackProgress(executionId, currentIndex);
      } catch (error) {
        lastReportedProgressRef.current = null;
        const now = Date.now();
        if (now - lastSyncErrorAtRef.current > 15_000) {
          lastSyncErrorAtRef.current = now;
          console.warn(
            "[player] could not sync scheduled playback progress:",
            error instanceof Error ? error.message : error,
          );
        }
      } finally {
        progressRequestInFlightRef.current = false;
        const queued = queuedProgressRef.current;
        queuedProgressRef.current = null;
        if (queued && queued.executionId === activeExecutionIdRef.current) {
          void sendProgress(queued.executionId, queued.currentIndex);
        }
      }
    },
    [],
  );

  const markRemoteExecutionActive = useCallback(
    (remote: PlaybackDTO) => {
      if (!remote.executionId || remote.playlist.length === 0) return;
      clearPendingScheduledPlaylist();
      pendingExecutionIdRef.current = null;
      activeExecutionIdRef.current = remote.executionId;
      detachedExecutionIdRef.current = null;
      completionPendingRef.current = false;
      remotePlaylistRef.current = remote.playlist;
      setScheduledCategoryId(remote.category?.id ?? null);
      setScheduledExecutionId(remote.executionId);
      setCategoryName(remote.category?.name ?? "Library");
    },
    [clearPendingScheduledPlaylist],
  );

  const startRemoteExecution = useCallback(
    (remote: PlaybackDTO) => {
      if (!remote.executionId || remote.playlist.length === 0) return;
      markRemoteExecutionActive(remote);
      startScheduledPlaylist(remote.playlist, remote.currentIndex);
    },
    [markRemoteExecutionActive, startScheduledPlaylist],
  );

  const deferRemoteExecution = useCallback(
    (remote: PlaybackDTO) => {
      if (!remote.executionId) return;
      const executionId = remote.executionId;
      const emptyPlaylist = remote.status === "IDLE" || remote.playlist.length === 0;

      activeExecutionIdRef.current = null;
      pendingExecutionIdRef.current = executionId;
      detachedExecutionIdRef.current = null;
      completionPendingRef.current = false;
      remotePlaylistRef.current = remote.playlist;
      setScheduledCategoryId(remote.category?.id ?? null);
      setScheduledExecutionId(remote.executionId);
      setCategoryName(remote.category?.name ?? "Library");

      queueScheduledPlaylist(executionId, remote.playlist, remote.currentIndex, () => {
        if (pendingExecutionIdRef.current !== executionId) return;
        pendingExecutionIdRef.current = null;
        if (emptyPlaylist) {
          activeExecutionIdRef.current = null;
          setScheduledCategoryId(null);
          setScheduledExecutionId(null);
          stopScheduledPlaylist();
          return;
        }
        // The audio hook starts this queued snapshot immediately after the
        // current track's ended event returns. Only promote the server identity
        // here so the same playlist isn't started twice.
        markRemoteExecutionActive(remote);
      });
    },
    [markRemoteExecutionActive, queueScheduledPlaylist, stopScheduledPlaylist],
  );

  /** Read server playback state every 1.5 seconds without interrupting the active track. */
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
          const previousExecutionId = activeExecutionIdRef.current;
          seenPlaybackIdentityRef.current = identity;
          lastReportedProgressRef.current = null;
          queuedProgressRef.current = null;
          completionPendingRef.current = false;

          if (remote.executionId && remote.status === "PLAYING" && remote.playlist.length > 0) {
            remotePlaylistRef.current = remote.playlist;
            if (local.currentSong) {
              // Arm the new immutable snapshot. The current song finishes naturally;
              // its ended event starts this queue at the first (or latest) server index.
              deferRemoteExecution(remote);
            } else {
              startRemoteExecution(remote);
            }
          } else if (remote.executionId && remote.status === "IDLE") {
            remotePlaylistRef.current = [];
            if (local.currentSong) {
              deferRemoteExecution(remote);
            } else {
              clearPendingScheduledPlaylist();
              pendingExecutionIdRef.current = null;
              activeExecutionIdRef.current = null;
              setScheduledCategoryId(null);
              setScheduledExecutionId(null);
              if (local.isScheduled) stopScheduledPlaylist();
            }
          } else {
            clearPendingScheduledPlaylist();
            pendingExecutionIdRef.current = null;
            activeExecutionIdRef.current = null;
            detachedExecutionIdRef.current = null;
            remotePlaylistRef.current = [];
            setScheduledCategoryId(null);
            setScheduledExecutionId(null);
            if (local.isScheduled && previousExecutionId) stopScheduledPlaylist();
          }
          return;
        }

        if (remote.executionId && remote.status === "PLAYING" && remote.playlist.length > 0) {
          remotePlaylistRef.current = remote.playlist;

          if (pendingExecutionIdRef.current === remote.executionId) {
            if (local.currentSong) {
              // Keep updating the queued start index while another player reports progress.
              deferRemoteExecution(remote);
              return;
            }
            pendingExecutionIdRef.current = null;
            clearPendingScheduledPlaylist(remote.executionId);
            startRemoteExecution(remote);
            return;
          }

          if (detachedExecutionIdRef.current === remote.executionId) return;

          if (
            activeExecutionIdRef.current === remote.executionId &&
            !local.isScheduled
          ) {
            detachedExecutionIdRef.current = remote.executionId;
            return;
          }

          if (activeExecutionIdRef.current !== remote.executionId) {
            if (local.currentSong) deferRemoteExecution(remote);
            else startRemoteExecution(remote);
            return;
          }

          if (
            !hasSameSongIds(local.queue, remote.playlist) ||
            (local.currentSong && !remote.playlist.some((song) => song.id === local.currentSong?.id))
          ) {
            // A user selected a track/queue outside this schedule. Keep that choice
            // local rather than polling the scheduled snapshot over it.
            detachedExecutionIdRef.current = remote.executionId;
            return;
          }

          if (completionPendingRef.current) {
            if (!progressRequestInFlightRef.current && remote.playlist.length > 0) {
              reportProgress(remote.executionId, remote.playlist.length);
            }
            return;
          }

          if (!local.currentSong) return;
          if (local.currentSong.id === remote.currentSong?.id) return;
          if (progressRequestInFlightRef.current) return;

          const localIndex = remote.playlist.findIndex((song) => song.id === local.currentSong?.id);
          if (localIndex < 0) {
            detachedExecutionIdRef.current = remote.executionId;
          } else if (Date.now() - lastUserControlAtRef.current < 3_000) {
            // Prefer an explicit local Next/Previous/track selection during the
            // brief window before its progress update reaches the database.
            reportProgress(remote.executionId, localIndex);
          } else if (remote.currentSong) {
            playScheduledTrack(remote.currentSong);
          }
          return;
        }

        if (remote.executionId && remote.status === "IDLE") {
          if (pendingExecutionIdRef.current === remote.executionId) {
            if (local.currentSong) deferRemoteExecution(remote);
            else {
              pendingExecutionIdRef.current = null;
              clearPendingScheduledPlaylist(remote.executionId);
              activeExecutionIdRef.current = null;
              setScheduledCategoryId(null);
              setScheduledExecutionId(null);
              if (local.isScheduled) stopScheduledPlaylist();
            }
            return;
          }

          if (
            activeExecutionIdRef.current === remote.executionId &&
            local.isScheduled
          ) {
            activeExecutionIdRef.current = null;
            completionPendingRef.current = false;
            lastReportedProgressRef.current = null;
            setScheduledCategoryId(null);
            setScheduledExecutionId(null);
            stopScheduledPlaylist();
          }
          return;
        }

        if (remote.executionId && remote.status === "WAITING") {
          if (pendingExecutionIdRef.current === remote.executionId) {
            pendingExecutionIdRef.current = null;
            clearPendingScheduledPlaylist(remote.executionId);
            setScheduledCategoryId(null);
            setScheduledExecutionId(null);
            return;
          }
          if (
            activeExecutionIdRef.current === remote.executionId &&
            local.isScheduled
          ) {
            activeExecutionIdRef.current = null;
            completionPendingRef.current = false;
            lastReportedProgressRef.current = null;
            setScheduledCategoryId(null);
            setScheduledExecutionId(null);
            stopScheduledPlaylist();
          }
          return;
        }

        if (
          !remote.executionId &&
          remote.status === "WAITING" &&
          activeExecutionIdRef.current &&
          local.isScheduled
        ) {
          clearPendingScheduledPlaylist();
          activeExecutionIdRef.current = null;
          pendingExecutionIdRef.current = null;
          detachedExecutionIdRef.current = null;
          completionPendingRef.current = false;
          setScheduledCategoryId(null);
          setScheduledExecutionId(null);
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
    clearPendingScheduledPlaylist,
    deferRemoteExecution,
    playScheduledTrack,
    reportProgress,
    startRemoteExecution,
    stopScheduledPlaylist,
  ]);

  // Persist song changes and natural playlist completion, never audio time updates.
  useEffect(() => {
    const executionId = activeExecutionIdRef.current;
    if (
      !executionId ||
      !playerState.isScheduled ||
      detachedExecutionIdRef.current === executionId
    ) {
      return;
    }

    if (playerState.currentSong) {
      const currentIndex = remotePlaylistRef.current.findIndex(
        (song) => song.id === playerState.currentSong?.id,
      );
      if (currentIndex < 0) return;
      const key = `${executionId}:PLAYING:${currentIndex}`;
      if (lastReportedProgressRef.current === key) return;
      lastReportedProgressRef.current = key;
      reportProgress(executionId, currentIndex);
      return;
    }

    if (remotePlaylistRef.current.length === 0) return;
    completionPendingRef.current = true;
    const currentIndex = remotePlaylistRef.current.length;
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

  const markUserControl = useCallback(() => {
    lastUserControlAtRef.current = Date.now();
  }, []);
  const shouldMarkLocalPlaybackControl = useCallback(
    () => {
      if (playerStateRef.current.isScheduled) markUserControl();
    },
    [markUserControl],
  );

  const playTrack = useCallback(
    (song?: SongDTO) => {
      shouldMarkLocalPlaybackControl();
      playPlayerTrack(song);
    },
    [playPlayerTrack, shouldMarkLocalPlaybackControl],
  );
  const pause = useCallback(() => {
    shouldMarkLocalPlaybackControl();
    pausePlayer();
  }, [pausePlayer, shouldMarkLocalPlaybackControl]);
  const togglePlay = useCallback(() => {
    shouldMarkLocalPlaybackControl();
    togglePlayerPlay();
  }, [togglePlayerPlay, shouldMarkLocalPlaybackControl]);
  const next = useCallback(() => {
    shouldMarkLocalPlaybackControl();
    playerNext();
  }, [playerNext, shouldMarkLocalPlaybackControl]);
  const previous = useCallback(() => {
    shouldMarkLocalPlaybackControl();
    playerPrevious();
  }, [playerPrevious, shouldMarkLocalPlaybackControl]);
  const seek = useCallback(
    (seconds: number) => {
      shouldMarkLocalPlaybackControl();
      seekPlayer(seconds);
    },
    [seekPlayer, shouldMarkLocalPlaybackControl],
  );
  const toggleShuffle = useCallback(() => {
    shouldMarkLocalPlaybackControl();
    togglePlayerShuffle();
  }, [togglePlayerShuffle, shouldMarkLocalPlaybackControl]);
  const cycleRepeat = useCallback(() => {
    shouldMarkLocalPlaybackControl();
    cyclePlayerRepeat();
  }, [cyclePlayerRepeat, shouldMarkLocalPlaybackControl]);
  const setQueue = useCallback(
    (songs: SongDTO[]) => {
      shouldMarkLocalPlaybackControl();
      setPlayerQueue(songs);
    },
    [setPlayerQueue, shouldMarkLocalPlaybackControl],
  );
  const toggle = useCallback(
    (song?: SongDTO) => {
      if (song && song.id !== playerStateRef.current.currentSong?.id) {
        playTrack(song);
        return;
      }
      togglePlay();
    },
    [playTrack, togglePlay],
  );

  const value = useMemo<AudioPlayerContextValue>(
    () => ({
      state: playerState,
      scheduledCategoryId,
      scheduledExecutionId,
      play: playTrack,
      pause,
      playTrack,
      pauseTrack: pause,
      toggle,
      togglePlay,
      next,
      previous,
      seek,
      setVolume: setPlayerVolume,
      toggleMute: togglePlayerMute,
      toggleShuffle,
      cycleRepeat,
      setQueue,
      setCategoryName,
    }),
    [
      playerState,
      setPlayerVolume,
      togglePlayerMute,
      scheduledCategoryId,
      scheduledExecutionId,
      playTrack,
      pause,
      toggle,
      togglePlay,
      next,
      previous,
      seek,
      toggleShuffle,
      cycleRepeat,
      setQueue,
    ],
  );

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="metadata" className="hidden" />
      <PlayerDock
        state={playerState}
        onToggle={togglePlay}
        onNext={next}
        onPrevious={previous}
        onSeek={seek}
        onVolume={setPlayerVolume}
        onToggleMute={togglePlayerMute}
        onToggleShuffle={toggleShuffle}
        onCycleRepeat={cycleRepeat}
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
