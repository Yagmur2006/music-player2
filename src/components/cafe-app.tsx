"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Coffee,
  LogIn,
  LogOut,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UploadCloud,
  UserRound,
} from "lucide-react";
import clsx from "clsx";
import { PlayerDock } from "@/components/player-dock";
import { PlaylistBoard } from "@/components/playlist-board";
import { LoginModal } from "@/components/login-modal";
import { UploadModal } from "@/components/upload-modal";
import { CategoryManager } from "@/components/category-manager";
import { AdminPanel } from "@/components/admin-panel";
import { Button, Toaster, inputClass, type Toast } from "@/components/ui";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { api, getStoredToken, setStoredToken } from "@/lib/client-api";
import { accentClasses, formatDurationLong } from "@/lib/format";
import type {
  CategoryDTO,
  SessionUserDTO,
  SongDTO,
  SystemConfigDTO,
} from "@/lib/types";

export function CafeApp({
  initialUser,
  initialCategories,
  initialCategoryId,
  initialSongs,
  initialConfig,
}: {
  initialUser: SessionUserDTO | null;
  initialCategories: CategoryDTO[];
  initialCategoryId: string;
  initialSongs: SongDTO[];
  initialConfig: SystemConfigDTO;
}) {
  const [user, setUser] = useState<SessionUserDTO | null>(initialUser);
  const [categories, setCategories] = useState<CategoryDTO[]>(initialCategories);
  const [activeCategoryId, setActiveCategoryId] = useState(initialCategoryId);
  const [songs, setSongs] = useState<SongDTO[]>(initialSongs);
  const [config, setConfig] = useState<SystemConfigDTO>(initialConfig);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [query, setQuery] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [loginOpen, setLoginOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const isAdmin = user?.role === "ADMIN";
  const canUpload = Boolean(user && (isAdmin || config.allowGuestUpload));

  const notify = useCallback(
    (message: string, tone: Toast["tone"] = "info") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 4200);
    },
    [],
  );

  const dismissToast = useCallback(
    (id: number) => setToasts((prev) => prev.filter((toast) => toast.id !== id)),
    [],
  );

  const visibleSongs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return songs;
    return songs.filter(
      (song) =>
        song.title.toLowerCase().includes(needle) ||
        song.artist.toLowerCase().includes(needle),
    );
  }, [songs, query]);

  const player = useAudioPlayer(songs);
  const activeCategory = categories.find((category) => category.id === activeCategoryId);

  const refreshCategories = useCallback(async () => {
    try {
      const next = await api.categories();
      setCategories(next);
      if (next.length > 0 && !next.some((category) => category.id === activeCategoryId)) {
        setActiveCategoryId(next[0].id);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load playlists", "error");
    }
  }, [activeCategoryId, notify]);

  const lastKnownSongCountRef = useRef(initialSongs.length);

  const loadSongs = useCallback(
    async (categoryId: string, silent = false) => {
      if (!categoryId) {
        setSongs([]);
        lastKnownSongCountRef.current = 0;
        return;
      }
      if (!silent) {
        setLoadingSongs(true);
      }
      try {
        const nextSongs = await api.songs(categoryId);
        setSongs(nextSongs);
        lastKnownSongCountRef.current = nextSongs.length;
      } catch (error) {
        notify(error instanceof Error ? error.message : "Could not load tracks", "error");
      } finally {
        if (!silent) {
          setLoadingSongs(false);
        }
      }
    },
    [notify],
  );

  const refreshSongsIfNeeded = useCallback(
    async (categoryId: string) => {
      if (!categoryId) return;

      try {
        const snapshot = await api.songsSnapshot(categoryId);
        const hasNewData = snapshot.stats.songCount > lastKnownSongCountRef.current;
        if (!hasNewData) return;
        await loadSongs(categoryId, true);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Could not check for music updates", "error");
      }
    },
    [loadSongs, notify],
  );

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!hydrated) {
      setHydrated(true);
      return;
    }
    void loadSongs(activeCategoryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategoryId]);

  useEffect(() => {
    if (!activeCategoryId) return;
    const interval = window.setInterval(() => {
      void refreshSongsIfNeeded(activeCategoryId);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [activeCategoryId, refreshSongsIfNeeded]);

  // Restore the session from the stored Bearer token when the cookie is unavailable
  // (e.g. the app is embedded in a cross-site iframe that blocks third-party cookies).
  useEffect(() => {
    if (initialUser || !getStoredToken()) return;
    let cancelled = false;
    void api
      .me()
      .then((result) => {
        if (!cancelled && result.user) setUser(result.user);
        if (!cancelled && !result.user) setStoredToken(null);
      })
      .catch(() => setStoredToken(null));
    return () => {
      cancelled = true;
    };
  }, [initialUser]);

  const handleReorder = async (ordered: SongDTO[]) => {
    const previous = songs;
    const withOrder = ordered.map((song, index) => ({ ...song, order: index }));
    setSongs(withOrder);
    try {
      await api.reorder(
        activeCategoryId,
        withOrder.map((song) => ({ id: song.id, order: song.order })),
      );
      notify("Playlist order saved", "success");
    } catch (error) {
      setSongs(previous);
      notify(error instanceof Error ? error.message : "Reorder failed", "error");
    }
  };

  const handleDelete = async (song: SongDTO) => {
    const previous = songs;
    setSongs((prev) => prev.filter((entry) => entry.id !== song.id));
    try {
      await api.deleteSong(song.id);
      notify(`Removed "${song.title}"`, "success");
      void refreshCategories();
    } catch (error) {
      setSongs(previous);
      notify(error instanceof Error ? error.message : "Delete failed", "error");
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
      setUser(null);
      notify("Signed out", "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Logout failed", "error");
    }
  };

  const totalTracks = categories.reduce((sum, category) => sum + category.songCount, 0);

  return (
    <div className="relative z-10 min-h-screen pb-44">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-cafe-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/30 to-cafe-800">
              <Coffee className="h-5 w-5 text-amber-200" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-cafe-ink">
                {config.cafeName}
              </h1>
              <p className="truncate text-[11px] text-white/40">
                Self-hosted audio · {totalTracks} tracks · {categories.length} playlists
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canUpload ? (
              <Button onClick={() => setUploadOpen(true)} className="!px-3 sm:!px-4">
                <UploadCloud className="h-4 w-4" />
                <span className="hidden sm:inline">Upload</span>
              </Button>
            ) : null}

            {isAdmin ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setCategoryOpen(true)}
                  className="!px-3"
                  title="Manage playlists"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden md:inline">Playlists</span>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setAdminOpen(true)}
                  className="!px-3"
                  title="Admin control room"
                >
                  <Settings2 className="h-4 w-4" />
                  <span className="hidden md:inline">Admin</span>
                </Button>
              </>
            ) : null}

            {user ? (
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    "hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs sm:flex",
                    isAdmin
                      ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
                      : "border-white/12 bg-white/5 text-white/60",
                  )}
                >
                  {isAdmin ? (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  ) : (
                    <UserRound className="h-3.5 w-3.5" />
                  )}
                  {user.username}
                </span>
                <Button
                  variant="ghost"
                  onClick={() => void handleLogout()}
                  className="!px-3"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setLoginOpen(true)} className="!px-3">
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Staff</span>
              </Button>
            )}
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => {
              const accents = accentClasses(category.accent);
              const active = category.id === activeCategoryId;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategoryId(category.id)}
                  className={clsx(
                    "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition",
                    active
                      ? `${accents.chip} ring-1 ${accents.ring}`
                      : "border-white/8 bg-white/[0.03] text-white/55 hover:bg-white/[0.07] hover:text-white",
                  )}
                >
                  {category.name}
                  <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] tabular-nums">
                    {category.songCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <section className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/8 bg-gradient-to-br from-white/[0.05] to-transparent p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-amber-300/70">
              Now curating
            </p>
            <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight text-cafe-ink">
              {activeCategory?.name ?? "No playlist"}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-white/45">
              {activeCategory?.description ??
                "Create a playlist to start shaping the room's atmosphere."}
            </p>
            <p className="mt-2 text-xs text-white/35">
              {songs.length} tracks ·{" "}
              {formatDurationLong(songs.reduce((sum, song) => sum + song.duration, 0))}
              {isAdmin ? " · drag the handles to reorder" : ""}
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              className={clsx(inputClass, "pl-9")}
              placeholder="Search this playlist"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </section>

        {!user ? (
          <p className="mb-4 rounded-2xl border border-white/8 bg-black/25 px-4 py-3 text-xs text-white/45">
            Browsing as a guest — playback is open to everyone.{" "}
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="text-amber-300 underline-offset-2 hover:underline"
            >
              Sign in
            </button>{" "}
            to upload{config.allowGuestUpload ? "" : " (admins only right now)"} or manage the
            library.
          </p>
        ) : null}

        <PlaylistBoard
          songs={visibleSongs}
          currentSongId={player.state.currentSong?.id ?? null}
          isPlaying={player.state.isPlaying}
          user={user}
          loading={loadingSongs}
          onSelect={(song) => player.toggle(song)}
          onReorder={(ordered) => void handleReorder(ordered)}
          onDelete={(song) => void handleDelete(song)}
        />
      </main>

      <PlayerDock
        state={player.state}
        onToggle={() => player.toggle()}
        onNext={player.next}
        onPrevious={player.previous}
        onSeek={player.seek}
        onVolume={player.setVolume}
        onToggleMute={player.toggleMute}
        onToggleShuffle={player.toggleShuffle}
        onCycleRepeat={player.cycleRepeat}
        categoryName={activeCategory?.name ?? "Library"}
      />

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={(nextUser) => {
          setUser(nextUser);
          notify(`Welcome back, ${nextUser.username}`, "success");
          void refreshCategories();
        }}
      />

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        categories={categories}
        defaultCategoryId={activeCategoryId}
        onUploaded={(song) => {
          if (song.categoryId === activeCategoryId) {
            setSongs((prev) => [...prev, song]);
          }
          void refreshCategories();
          notify(`"${song.title}" added`, "success");
        }}
      />

      <CategoryManager
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        categories={categories}
        notify={notify}
        onChanged={async () => {
          await refreshCategories();
          await loadSongs(activeCategoryId);
        }}
      />

      {user?.role === "ADMIN" ? (
        <AdminPanel
          open={adminOpen}
          onClose={() => setAdminOpen(false)}
          config={config}
          onConfigChange={setConfig}
          user={user}
          onUserChange={setUser}
          notify={notify}
          stats={{ songCount: totalTracks, categoryCount: categories.length }}
        />
      ) : null}

      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
