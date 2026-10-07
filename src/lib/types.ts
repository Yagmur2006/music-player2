export type Role = "ADMIN" | "GUEST";

export type SessionUserDTO = {
  id: string;
  username: string;
  role: Role;
};

export type CategoryDTO = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  accent: string;
  order: number;
  songCount: number;
  totalDuration: number;
  createdAt: string;
};

export type SongDTO = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  order: number;
  categoryId: string;
  source: "WEB" | "TELEGRAM" | "SEED";
  uploadedBy: string;
  sizeBytes: number;
  mimeType: string;
  url: string;
  createdAt: string;
};

export type ScheduleCategoryDTO = {
  id: string;
  name: string;
  slug: string;
  accent: string;
};

export type ScheduleDTO = {
  id: string;
  time: string;
  categoryId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  category: ScheduleCategoryDTO;
};

export type PlaybackStatus = "IDLE" | "PLAYING" | "WAITING";

export type PlaybackCategoryDTO = {
  id: string | null;
  name: string;
  slug: string | null;
  accent: string | null;
};

export type PlaybackDTO = {
  status: PlaybackStatus;
  executionId: string | null;
  scheduleId: string | null;
  schedule: { id: string; time: string } | null;
  category: PlaybackCategoryDTO | null;
  playlist: SongDTO[];
  currentSong: SongDTO | null;
  currentIndex: number;
  startedAt: string | null;
  updatedAt: string;
};

export type SystemConfigDTO = {
  allowGuestUpload: boolean;
  cafeName: string;
  updatedAt: string;
};

export type TelegramContactDTO = {
  id: string;
  telegramId: string;
  label: string;
  createdAt: string;
};

export type TelegramStatusDTO = {
  configured: boolean;
  botUsername: string;
  reachable: boolean | null;
  message: string;
  whitelist: TelegramContactDTO[];
};

export type ReorderPayload = {
  categoryId: string;
  songOrders: { id: string; order: number }[];
};

/** Supervisor state for the in-app Telegram bot runner (the admin-panel button). */
export type BotMode = "OFF" | "STANDBY" | "STARTING" | "ACTIVE" | "ERROR";

export type BotRuntimeDTO = {
  mode: BotMode;
  active: boolean;
  standby: boolean;
  configured: boolean;
  botUsername: string;
  message: string;
  startedAt: string | null;
};
