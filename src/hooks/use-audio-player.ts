"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { SongDTO } from "@/lib/types";
import { en } from "@/lib/i18n";

export type RepeatMode = "OFF" | "ALL" | "ONE";

/** Non-repeating Fisher–Yates shuffle. */
export function fisherYates<T>(input: T[]): T[] {
  const items = [...input];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export type PlayerState = {
  currentSong: SongDTO | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  isBuffering: boolean;
  error: string | null;
  queue: SongDTO[];
  isScheduled: boolean;
};

type PendingScheduledPlaylist = {
  executionId: string;
  songs: SongDTO[];
  startIndex: number;
  onStart: () => void;
};

export function useAudioPlayer(
  initialPlaylist: SongDTO[],
  audioRef: RefObject<HTMLAudioElement | null>,
) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentSongFallback, setCurrentSongFallback] = useState<SongDTO | null>(null);
  const [queue, setQueueState] = useState<SongDTO[]>(initialPlaylist);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("ALL");
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);

  const queueRef = useRef(initialPlaylist);
  const playAttemptRef = useRef(0);
  const isScheduledRef = useRef(false);
  const scheduledSongIdsRef = useRef(new Set<string>());
  const pendingScheduledPlaylistRef = useRef<PendingScheduledPlaylist | null>(null);

  const updateQueue = useCallback((songs: SongDTO[]) => {
    queueRef.current = songs;
    setQueueState(songs);
  }, []);

  const currentSong = useMemo(() => {
    const fromQueue = queue.find((song) => song.id === currentId);
    if (fromQueue) return fromQueue;
    if (currentId && currentSongFallback?.id === currentId) return currentSongFallback;
    return null;
  }, [queue, currentId, currentSongFallback]);

  const setQueue = useCallback((songs: SongDTO[]) => updateQueue(songs), [updateQueue]);

  const queueScheduledPlaylist = useCallback(
    (
      executionId: string,
      songs: SongDTO[],
      startIndex: number,
      onStart: () => void,
    ) => {
      pendingScheduledPlaylistRef.current = {
        executionId,
        songs,
        startIndex,
        onStart,
      };
    },
    [],
  );

  const clearPendingScheduledPlaylist = useCallback((executionId?: string) => {
    const pending = pendingScheduledPlaylistRef.current;
    if (!executionId || pending?.executionId === executionId) {
      pendingScheduledPlaylistRef.current = null;
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setIsBuffering(false);
    };
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => {
      setIsBuffering(false);
      setIsPlaying(true);
      setError(null);
    };
    const onPause = () => setIsPlaying(false);
    const onErr = () => {
      setIsBuffering(false);
      setIsPlaying(false);
      setError(en.playbackError);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onLoaded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onErr);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onLoaded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onErr);
    };
  }, [audioRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
    audio.muted = muted;
  }, [audioRef, volume, muted]);

  const orderedIds = useMemo(() => {
    const ids = queue.map((song) => song.id);
    return shuffle ? fisherYates(ids) : ids;
  }, [shuffle, queue]);

  const loadAndPlay = useCallback(
    async (song: SongDTO, autoplay = true) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.dataset.songId !== song.id) {
        audio.src = song.url;
        audio.dataset.songId = song.id;
        audio.load();
        setCurrentTime(0);
        setDuration(song.duration || 0);
      }
      // Do not mutate currentId/currentSong until playback actually starts.
      if (!autoplay) {
        // Keep src loaded but do not mark as active yet.
        return;
      }

      const attempt = ++playAttemptRef.current;
      try {
        setIsBuffering(true);
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          // If the play promise rejects it will be handled below.
          await playPromise;
        }

        // If another play attempt started after this one, abort committing state.
        if (playAttemptRef.current !== attempt) {
          // A newer play was requested; don't override the active track state.
          return;
        }

        setCurrentId(song.id);
        setCurrentSongFallback(song);
        setError(null);
        setIsBuffering(false);
        setIsPlaying(true);
      } catch (err) {
        // Ensure audio is stopped and do not auto-advance the index.
        try {
          audio.pause();
        } catch {}
        setIsBuffering(false);
        setIsPlaying(false);
        if ((err as DOMException)?.name !== "AbortError") {
          console.error("[player] playback failed:", err);
          setError(en.playbackError);
        }
      }
    },
    [audioRef],
  );

  const startScheduledPlaylist = useCallback(
    (songs: SongDTO[], startIndex = 0) => {
      playAttemptRef.current += 1;
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        try {
          audio.currentTime = 0;
        } catch {
          /* source metadata may not be ready yet */
        }
      }

      pendingScheduledPlaylistRef.current = null;
      scheduledSongIdsRef.current = new Set(songs.map((song) => song.id));
      isScheduledRef.current = true;
      setIsScheduled(true);
      setShuffle(false);
      setRepeat("OFF");
      updateQueue(songs);
      setIsPlaying(false);
      setCurrentTime(0);
      setError(null);

      const index = Math.max(0, Math.min(Math.trunc(startIndex), songs.length - 1));
      const song = songs[index];
      if (!song) {
        setCurrentId(null);
        setCurrentSongFallback(null);
        setDuration(0);
        setIsBuffering(false);
        return;
      }

      setCurrentSongFallback(song);
      setCurrentId(song.id);
      setDuration(song.duration || 0);
      setIsBuffering(true);
      void loadAndPlay(song, true);
    },
    [audioRef, loadAndPlay, updateQueue],
  );

  const playScheduledTrack = useCallback(
    (remoteSong: SongDTO) => {
      if (!isScheduledRef.current || !scheduledSongIdsRef.current.has(remoteSong.id)) return;
      const song = queueRef.current.find((entry) => entry.id === remoteSong.id) ?? remoteSong;

      playAttemptRef.current += 1;
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        try {
          audio.currentTime = 0;
        } catch {
          /* source metadata may not be ready yet */
        }
      }
      setCurrentSongFallback(song);
      setCurrentId(song.id);
      setCurrentTime(0);
      setDuration(song.duration || 0);
      setIsPlaying(false);
      setIsBuffering(true);
      void loadAndPlay(song, true);
    },
    [audioRef, loadAndPlay],
  );

  const stopScheduledPlaylist = useCallback(() => {
    pendingScheduledPlaylistRef.current = null;
    scheduledSongIdsRef.current.clear();
    playAttemptRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      delete audio.dataset.songId;
      audio.load();
    }

    isScheduledRef.current = false;
    setIsScheduled(false);
    updateQueue([]);
    setCurrentId(null);
    setCurrentSongFallback(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setIsBuffering(false);
    setError(null);
    setShuffle(false);
    setRepeat("ALL");
  }, [audioRef, updateQueue]);

  const playTrack = useCallback(
    (song?: SongDTO) => {
      if (!song || song.id === currentId) return;
      if (isScheduledRef.current && !scheduledSongIdsRef.current.has(song.id)) {
        // The player remains fully controllable. Songs outside the scheduled
        // snapshot become ordinary local playback instead of being forced back
        // to the server-owned category on the next poll.
        isScheduledRef.current = false;
        scheduledSongIdsRef.current.clear();
        setIsScheduled(false);
      }
      // Cancel any pending automated transitions or previous play attempts.
      playAttemptRef.current += 1;
      void loadAndPlay(song, true);
    },
    [currentId, loadAndPlay],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;

    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    // Starting playback from an already-loaded source: ensure state is only
    // updated when play actually begins, and keep play attempts cancelable.
    const attempt = ++playAttemptRef.current;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          if (playAttemptRef.current !== attempt) return;
          setIsPlaying(true);
          setError(null);
          // If currentId wasn't set (e.g. autoplay blocked earlier), sync it
          // with the actually loaded source.
          if (!currentId && audio.dataset.songId) {
            setCurrentId(audio.dataset.songId);
            // Queue-backed songs resolve from currentId on the next render.
          }
        })
        .catch((err) => {
          console.warn("Playback error:", err);
        });
    }
  }, [audioRef, currentSong, currentId]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, [audioRef]);

  const toggle = useCallback(
    (song?: SongDTO) => {
      if (song && song.id !== currentId) {
        playTrack(song);
        return;
      }
      if (currentSong) {
        togglePlay();
      }
    },
    [currentId, currentSong, playTrack, togglePlay],
  );

  const step = useCallback(
    (direction: 1 | -1, userInitiated = true) => {
      const ids = orderedIds;
      if (ids.length === 0) return;
      // Use the actual audio element's loaded source id first to avoid
      // index drift when state hasn't been committed yet.
      const audio = audioRef.current;
      const activeId = audio?.dataset.songId ?? currentId ?? currentSongFallback?.id ?? null;
      const index = activeId ? ids.indexOf(activeId) : -1;

      if (!userInitiated && repeat === "ONE" && currentId) {
        const same = queueRef.current.find((song) => song.id === currentId);
        if (same) {
          const audio = audioRef.current;
          if (audio) {
            audio.currentTime = 0;
            void audio.play().catch(() => undefined);
          }
          return;
        }
      }

      let nextIndex = index + direction;
      if (nextIndex >= ids.length) {
        if (!userInitiated && repeat === "OFF") {
          if (isScheduledRef.current) {
            playAttemptRef.current += 1;
            audio?.pause();
            setCurrentId(null);
            setCurrentSongFallback(null);
            setIsPlaying(false);
            setCurrentTime(0);
            setDuration(0);
            setIsBuffering(false);
          } else {
            pause();
          }
          return;
        }
        nextIndex = 0;
      }
      if (nextIndex < 0) nextIndex = ids.length - 1;

      const nextId = ids[nextIndex];
      const nextSong = queueRef.current.find((song) => song.id === nextId);
      if (nextSong) {
        // Cancel any concurrent play attempts before auto-advancing.
        if (userInitiated) playAttemptRef.current += 1;
        void loadAndPlay(nextSong, true);
      }
    },
    [currentId, currentSongFallback, loadAndPlay, orderedIds, pause, repeat, audioRef],
  );

  const next = useCallback(() => step(1, true), [step]);
  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    // Cancel pending automated transitions when user explicitly moves.
    playAttemptRef.current += 1;
    step(-1, true);
  }, [step, audioRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      const pending = pendingScheduledPlaylistRef.current;
      if (pending) {
        pendingScheduledPlaylistRef.current = null;
        pending.onStart();
        if (pending.songs.length === 0) return;
        startScheduledPlaylist(pending.songs, pending.startIndex);
        return;
      }
      // When the element naturally ends, advance using the live audio dataset
      // to compute the next track and start it.
      step(1, false);
    };
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [audioRef, startScheduledPlaylist, step]);

  const seek = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const safe = Math.max(0, Math.min(seconds, audio.duration || seconds));
      audio.currentTime = safe;
      setCurrentTime(safe);
    },
    [audioRef],
  );

  const setVolume = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    setVolumeState(clamped);
    if (clamped > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((prev) => !prev), []);
  const toggleShuffle = useCallback(() => setShuffle((prev) => !prev), []);
  const cycleRepeat = useCallback(() => {
    setRepeat((prev) => (prev === "OFF" ? "ALL" : prev === "ALL" ? "ONE" : "OFF"));
  }, []);

  const state: PlayerState = {
    currentSong,
    isPlaying,
    currentTime,
    duration: duration || currentSong?.duration || 0,
    volume,
    muted,
    shuffle,
    repeat,
    isBuffering,
    error,
    queue,
    isScheduled,
  };

  return {
    state,
    playTrack,
    pause,
    toggle,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    setQueue,
    queueScheduledPlaylist,
    clearPendingScheduledPlaylist,
    startScheduledPlaylist,
    playScheduledTrack,
    stopScheduledPlaylist,
  };
}
