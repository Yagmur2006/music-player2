"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SongDTO } from "@/lib/types";

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
};

export function useAudioPlayer(playlist: SongDTO[]) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("ALL");
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shuffleOrder, setShuffleOrder] = useState<string[]>([]);

  const playlistRef = useRef(playlist);
  playlistRef.current = playlist;

  const currentSong = useMemo(
    () => playlist.find((song) => song.id === currentId) ?? null,
    [playlist, currentId],
  );

  // Lazily create a single <audio> element for the whole session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "metadata";
      audioRef.current = audio;
    }
    const audio = audioRef.current;

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
      setError("Playback failed — the audio file may be missing on the server.");
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
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
    audio.muted = muted;
  }, [volume, muted]);

  // Rebuild the shuffle bag whenever shuffle turns on or the playlist changes.
  useEffect(() => {
    if (!shuffle) {
      setShuffleOrder([]);
      return;
    }
    const ids = playlist.map((song) => song.id);
    const shuffled = fisherYates(ids);
    if (currentId && shuffled.includes(currentId)) {
      setShuffleOrder([currentId, ...shuffled.filter((id) => id !== currentId)]);
    } else {
      setShuffleOrder(shuffled);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffle, playlist.map((s) => s.id).join("|")]);

  const orderedIds = useMemo(() => {
    if (shuffle && shuffleOrder.length > 0) {
      const valid = new Set(playlist.map((song) => song.id));
      return shuffleOrder.filter((id) => valid.has(id));
    }
    return playlist.map((song) => song.id);
  }, [shuffle, shuffleOrder, playlist]);

  const loadAndPlay = useCallback(async (song: SongDTO, autoplay = true) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.dataset.songId !== song.id) {
      audio.src = song.url;
      audio.dataset.songId = song.id;
      audio.load();
      setCurrentTime(0);
      setDuration(song.duration || 0);
    }
    setCurrentId(song.id);
    setError(null);
    if (!autoplay) return;
    try {
      setIsBuffering(true);
      await audio.play();
    } catch (err) {
      setIsBuffering(false);
      if ((err as DOMException)?.name !== "AbortError") {
        setError("Tap play to start audio (browser autoplay policy).");
      }
    }
  }, []);

  const play = useCallback(
    (song?: SongDTO) => {
      const target = song ?? currentSong ?? playlistRef.current[0] ?? null;
      if (!target) return;
      void loadAndPlay(target, true);
    },
    [currentSong, loadAndPlay],
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(
    (song?: SongDTO) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (song && song.id !== currentId) {
        void loadAndPlay(song, true);
        return;
      }
      if (audio.paused) {
        play();
      } else {
        pause();
      }
    },
    [currentId, loadAndPlay, pause, play],
  );

  const step = useCallback(
    (direction: 1 | -1, userInitiated = true) => {
      const ids = orderedIds;
      if (ids.length === 0) return;
      const index = currentId ? ids.indexOf(currentId) : -1;

      if (!userInitiated && repeat === "ONE" && currentId) {
        const same = playlistRef.current.find((song) => song.id === currentId);
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
        if (repeat === "OFF" && !userInitiated) {
          pause();
          return;
        }
        nextIndex = 0;
      }
      if (nextIndex < 0) nextIndex = ids.length - 1;

      const nextId = ids[nextIndex];
      const nextSong = playlistRef.current.find((song) => song.id === nextId);
      if (nextSong) void loadAndPlay(nextSong, true);
    },
    [currentId, loadAndPlay, orderedIds, pause, repeat],
  );

  const next = useCallback(() => step(1, true), [step]);
  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    step(-1, true);
  }, [step]);

  // Auto-advance handling depends on the latest repeat/shuffle state.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => step(1, false);
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [step]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const safe = Math.max(0, Math.min(seconds, audio.duration || seconds));
    audio.currentTime = safe;
    setCurrentTime(safe);
  }, []);

  const setVolume = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    setVolumeState(clamped);
    if (clamped > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((prev) => !prev), []);
  const toggleShuffle = useCallback(() => setShuffle((prev) => !prev), []);
  const cycleRepeat = useCallback(
    () => setRepeat((prev) => (prev === "OFF" ? "ALL" : prev === "ALL" ? "ONE" : "OFF")),
    [],
  );

  // If the active song disappears (deleted / category switch), stop cleanly.
  useEffect(() => {
    if (currentId && !playlist.some((song) => song.id === currentId)) {
      const audio = audioRef.current;
      if (audio && audio.dataset.songId === currentId) {
        audio.pause();
        audio.removeAttribute("src");
        delete audio.dataset.songId;
      }
      setCurrentId(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [playlist, currentId]);

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
    queue: playlist,
  };

  return {
    state,
    play,
    pause,
    toggle,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
  };
}
