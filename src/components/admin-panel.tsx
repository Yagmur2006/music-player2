"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  CalendarClock,
  CheckCircle2,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Save,
  Send,
  Trash2,
  UserRound,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import clsx from "clsx";
import { Button, Field, Modal, Switch, inputClass } from "@/components/ui";
import { api } from "@/lib/client-api";
import { en, scheduleFa } from "@/lib/i18n";
import type {
  BotRuntimeDTO,
  CategoryDTO,
  ScheduleDTO,
  SessionUserDTO,
  SystemConfigDTO,
  TelegramStatusDTO,
} from "@/lib/types";

function scheduleErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("already exists")) return scheduleFa.duplicate;
    if (message.includes("category") && message.includes("not found")) {
      return scheduleFa.categoryMissing;
    }
    if (message.includes("time")) return scheduleFa.invalidTime;
  }
  return scheduleFa.error;
}

export function AdminPanel({
  open,
  onClose,
  config,
  onConfigChange,
  user,
  onUserChange,
  notify,
  stats,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  config: SystemConfigDTO;
  onConfigChange: (next: SystemConfigDTO) => void;
  user: SessionUserDTO;
  onUserChange: (next: SessionUserDTO) => void;
  notify: (message: string, tone?: "success" | "error" | "info") => void;
  stats: { songCount: number; categoryCount: number };
  categories: CategoryDTO[];
}) {
  const [telegram, setTelegram] = useState<TelegramStatusDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [botRuntime, setBotRuntime] = useState<BotRuntimeDTO | null>(null);
  const [botBusy, setBotBusy] = useState(false);
  /** Green / red banner shown right under the connect button. */
  const [botBanner, setBotBanner] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);
  const [telegramId, setTelegramId] = useState("");
  const [label, setLabel] = useState("");
  const [cafeName, setCafeName] = useState(config.cafeName);
  const [profileUsername, setProfileUsername] = useState(user.username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleDTO[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleCategoryId, setScheduleCategoryId] = useState(categories[0]?.id ?? "");
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [confirmScheduleDeleteId, setConfirmScheduleDeleteId] = useState<string | null>(null);

  const loadSchedules = useCallback(async () => {
    setSchedulesLoading(true);
    try {
      setSchedules(await api.schedules());
    } catch (error) {
      notify(scheduleErrorMessage(error), "error");
    } finally {
      setSchedulesLoading(false);
    }
  }, [notify]);

  const loadTelegram = useCallback(async () => {
    setLoading(true);
    try {
      setTelegram(await api.telegramStatus());
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadBotRuntime = useCallback(async () => {
    try {
      setBotRuntime(await api.botRuntime());
    } catch {
      /* status is best-effort; the button stays usable */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void loadTelegram();
      void loadBotRuntime();
      void loadSchedules();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, loadTelegram, loadBotRuntime, loadSchedules]);

  /**
   * The one-click bot launcher (requirement #3): does exactly what `npm run bot`
   * does, but inside the running web server, and reports the outcome as a green
   * or red banner instead of terminal output.
   */
  const connectBot = useCallback(async () => {
    setBotBusy(true);
    setBotBanner(null);
    try {
      const result = await api.setBotRuntime("start");
      setBotRuntime(result);
      if (result.active) {
        setBotBanner({ tone: "success", text: result.message });
        notify(en.telegramConnectedBanner, "success");
      } else {
        setBotBanner({ tone: "error", text: result.message });
        notify(en.telegramFailedBanner, "error");
      }
      void loadTelegram();
    } catch (error) {
      const text = error instanceof Error ? error.message : en.telegramFailedBanner;
      setBotBanner({ tone: "error", text });
      notify(text, "error");
    } finally {
      setBotBusy(false);
    }
  }, [notify, loadTelegram]);

  const disconnectBot = useCallback(async () => {
    setBotBusy(true);
    try {
      const result = await api.setBotRuntime("stop");
      setBotRuntime(result);
      setBotBanner(null);
      notify(result.message, "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    } finally {
      setBotBusy(false);
    }
  }, [notify]);

  const toggleGuestUpload = async (next: boolean) => {
    try {
      const updated = await api.updateConfig({ allowGuestUpload: next });
      onConfigChange(updated);
      notify(next ? "Guest uploads enabled" : "Guest uploads locked", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    }
  };

  const saveName = async () => {
    if (!cafeName.trim() || cafeName === config.cafeName) return;
    try {
      const updated = await api.updateConfig({ cafeName: cafeName.trim() });
      onConfigChange(updated);
      notify(en.settingsSaved, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    }
  };

  const saveProfile = async () => {
    if (!currentPassword) {
      notify(en.currentPassword, "error");
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      notify(en.passwordsMismatch, "error");
      return;
    }
    if (newPassword && newPassword.length < 8) {
      notify(en.passwordTooShort, "error");
      return;
    }

    setProfileBusy(true);
    try {
      const result = await api.updateProfile({
        username: profileUsername.trim(),
        currentPassword,
        newPassword: newPassword || undefined,
      });
      onUserChange(result.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify(en.profileUpdated, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    } finally {
      setProfileBusy(false);
    }
  };

  const addContact = async () => {
    if (!telegramId.trim()) return;
    try {
      const result = await api.addTelegramContact(
        telegramId.trim(),
        label.trim() || "Staff",
      );
      setTelegram((prev) => (prev ? { ...prev, whitelist: result.whitelist } : prev));
      setTelegramId("");
      setLabel("");
      notify(en.whitelistAdded, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    }
  };

  const removeContact = async (id: string) => {
    try {
      const result = await api.removeTelegramContact(id);
      setTelegram((prev) => (prev ? { ...prev, whitelist: result.whitelist } : prev));
      notify(en.whitelistRemoved, "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    }
  };

  const resetScheduleEditor = () => {
    setEditingScheduleId(null);
    setScheduleTime("");
    setScheduleCategoryId(categories[0]?.id ?? "");
    setConfirmScheduleDeleteId(null);
  };

  const saveSchedule = async () => {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(scheduleTime)) {
      notify(scheduleFa.invalidTime, "error");
      return;
    }
    if (!scheduleCategoryId) {
      notify(scheduleFa.categoryRequired, "error");
      return;
    }

    setScheduleBusy(true);
    try {
      if (editingScheduleId) {
        await api.updateSchedule(editingScheduleId, {
          time: scheduleTime,
          categoryId: scheduleCategoryId,
        });
      } else {
        await api.createSchedule({ time: scheduleTime, categoryId: scheduleCategoryId });
      }
      await loadSchedules();
      notify(editingScheduleId ? scheduleFa.updated : scheduleFa.added, "success");
      resetScheduleEditor();
    } catch (error) {
      notify(scheduleErrorMessage(error), "error");
    } finally {
      setScheduleBusy(false);
    }
  };

  const editSchedule = (schedule: ScheduleDTO) => {
    setEditingScheduleId(schedule.id);
    setScheduleTime(schedule.time);
    setScheduleCategoryId(schedule.categoryId);
    setConfirmScheduleDeleteId(null);
  };

  const toggleSchedule = async (schedule: ScheduleDTO, enabled: boolean) => {
    setScheduleBusy(true);
    try {
      const updated = await api.updateSchedule(schedule.id, { enabled });
      setSchedules((current) =>
        current
          .map((item) => (item.id === updated.id ? updated : item))
          .sort((a, b) => a.time.localeCompare(b.time)),
      );
      notify(enabled ? scheduleFa.enabled : scheduleFa.disabled, "success");
    } catch (error) {
      notify(scheduleErrorMessage(error), "error");
    } finally {
      setScheduleBusy(false);
    }
  };

  const removeSchedule = async (id: string) => {
    setScheduleBusy(true);
    try {
      await api.deleteSchedule(id);
      setSchedules((current) => current.filter((schedule) => schedule.id !== id));
      if (editingScheduleId === id) resetScheduleEditor();
      setConfirmScheduleDeleteId(null);
      notify(scheduleFa.deleted, "success");
    } catch (error) {
      notify(scheduleErrorMessage(error), "error");
    } finally {
      setScheduleBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={en.adminTitle}
      subtitle={en.adminSubtitle}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Tracks", value: stats.songCount },
            { label: "Playlists", value: stats.categoryCount },
            { label: "Storage", value: "Local disk" },
            { label: "Cloud deps", value: "Zero" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-white/8 bg-black/25 p-3.5"
            >
              <p className="text-[11px] uppercase tracking-wider text-white/40">
                {item.label}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-cafe-ink">{item.value}</p>
            </div>
          ))}
        </div>

        <section
          dir="rtl"
          lang="fa"
          className="space-y-4 rounded-2xl border border-white/8 bg-black/25 p-4 text-right"
        >
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <h3 className="text-sm font-semibold text-cafe-ink">{scheduleFa.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-white/45">
                {scheduleFa.description}
              </p>
              <p className="mt-1 text-[11px] text-amber-200/65">{scheduleFa.timezone}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-white/35">
                {scheduleFa.lockedHint}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr_auto] sm:items-end">
            <Field label={scheduleFa.time} rtl>
              <input
                className={inputClass}
                type="time"
                step={60}
                dir="ltr"
                required
                value={scheduleTime}
                onChange={(event) => setScheduleTime(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveSchedule();
                }}
              />
            </Field>
            <Field label={scheduleFa.category} rtl>
              <select
                className={inputClass}
                value={scheduleCategoryId}
                required
                onChange={(event) => setScheduleCategoryId(event.target.value)}
              >
                <option value="">{scheduleFa.chooseCategory}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex gap-2">
              <Button
                onClick={() => void saveSchedule()}
                disabled={scheduleBusy || categories.length === 0}
              >
                {scheduleBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingScheduleId ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editingScheduleId ? scheduleFa.save : scheduleFa.add}
              </Button>
              {editingScheduleId ? (
                <Button variant="ghost" onClick={resetScheduleEditor} disabled={scheduleBusy}>
                  {scheduleFa.cancel}
                </Button>
              ) : null}
            </div>
          </div>

          {categories.length === 0 ? (
            <p className="text-xs text-amber-100/70">{scheduleFa.noCategories}</p>
          ) : null}

          <div className="space-y-2">
            {schedulesLoading ? (
              <div className="flex items-center gap-2 py-3 text-xs text-white/45">
                <Loader2 className="h-4 w-4 animate-spin" />
                {scheduleFa.loading}
              </div>
            ) : schedules.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-white/40">
                {scheduleFa.empty}
              </p>
            ) : (
              schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-black/30 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold text-cafe-ink">
                      <span className="rounded-lg bg-white/5 px-2.5 py-1 font-mono tabular-nums text-amber-200" dir="ltr">
                        {schedule.time}
                      </span>
                      <span className="truncate">{schedule.category.name}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/50">
                      {schedule.enabled ? scheduleFa.enabled : scheduleFa.disabled}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={schedule.enabled}
                      aria-label={`${schedule.time} ${schedule.enabled ? scheduleFa.enabled : scheduleFa.disabled}`}
                      disabled={scheduleBusy}
                      onClick={() => void toggleSchedule(schedule, !schedule.enabled)}
                      className={clsx(
                        "relative h-7 w-12 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50",
                        schedule.enabled ? "bg-emerald-500/80" : "bg-white/12",
                      )}
                    >
                      <span
                        className={clsx(
                          "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
                          schedule.enabled ? "right-1" : "right-6",
                        )}
                      />
                    </button>
                    <button
                      type="button"
                      aria-label={scheduleFa.edit}
                      title={scheduleFa.edit}
                      onClick={() => editSchedule(schedule)}
                      className="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {confirmScheduleDeleteId === schedule.id ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="danger"
                          onClick={() => void removeSchedule(schedule.id)}
                          disabled={scheduleBusy}
                          className="!px-2.5 !py-2 !text-xs"
                        >
                          {scheduleFa.deleteConfirm}
                        </Button>
                        <button
                          type="button"
                          aria-label={scheduleFa.cancelDelete}
                          onClick={() => setConfirmScheduleDeleteId(null)}
                          className="rounded-lg p-2 text-white/45 hover:bg-white/5"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label={scheduleFa.delete}
                        title={scheduleFa.delete}
                        onClick={() => setConfirmScheduleDeleteId(schedule.id)}
                        className="rounded-lg p-2 text-white/45 transition hover:bg-white/5 hover:text-rose-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <Switch
          checked={config.allowGuestUpload}
          onChange={(next) => void toggleGuestUpload(next)}
          label={en.allowGuestUpload}
          description={en.allowGuestUploadHint}
        />

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label={en.cafeName}>
            <input
              className={inputClass}
              value={cafeName}
              onChange={(event) => setCafeName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveName();
              }}
            />
          </Field>
          <Button variant="ghost" onClick={() => void saveName()}>
            {en.save}
          </Button>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/8 bg-black/25 p-4">
          <div className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-amber-300" />
            <div>
              <p className="text-sm font-medium text-cafe-ink">{en.credentials}</p>
              <p className="text-xs text-white/45">
                Change your login. Current password is always required.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={en.username}>
              <input
                className={inputClass}
                value={profileUsername}
                autoComplete="username"
                onChange={(event) => setProfileUsername(event.target.value)}
              />
            </Field>
            <Field label={en.currentPassword}>
              <input
                className={inputClass}
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                placeholder="Required to save"
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
            <Field label={en.newPassword} hint="Leave blank to keep your current password.">
              <input
                className={inputClass}
                type="password"
                value={newPassword}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </Field>
            <Field label={en.confirmPassword}>
              <input
                className={inputClass}
                type="password"
                value={confirmPassword}
                autoComplete="new-password"
                placeholder="Repeat new password"
                onChange={(event) => setConfirmPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveProfile();
                }}
              />
            </Field>
          </div>

          <Button
            variant="ghost"
            onClick={() => void saveProfile()}
            disabled={profileBusy || !currentPassword || !profileUsername.trim()}
          >
            {newPassword ? <KeyRound className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {profileBusy ? en.loading : en.updateProfile}
          </Button>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/8 bg-black/25 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-sky-300" />
              <div>
                <p className="text-sm font-medium text-cafe-ink">
                  {en.telegramSection}
                  {telegram?.botUsername ? (
                    <span className="ml-1 text-white/40">@{telegram.botUsername}</span>
                  ) : null}
                </p>
                <p className="text-xs text-white/45">
                  {botRuntime?.message ?? telegram?.message ?? en.loading}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadTelegram()}
              aria-label={en.refresh}
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10"
            >
              <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
            </button>
          </div>

          {/* One-click bot launcher — replaces running `npm run bot` in a terminal. */}
          <div className="space-y-2.5 rounded-xl border border-white/8 bg-black/25 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                    botRuntime?.active
                      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                      : "border-white/12 bg-white/5 text-white/55",
                  )}
                >
                  {botRuntime?.active ? (
                    <Wifi className="h-3.5 w-3.5" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5" />
                  )}
                  {botRuntime?.configured
                    ? botRuntime.active
                      ? en.telegramActive
                      : en.telegramInactive
                    : en.telegramNotConfigured}
                </span>
                <span className="text-white/40">{en.telegramHint}</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => void connectBot()}
                  disabled={botBusy || !botRuntime?.configured || botRuntime?.active}
                  title={en.telegramConnect}
                >
                  {botBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Power className="h-4 w-4" />
                  )}
                  {botBusy ? en.telegramConnecting : en.telegramConnect}
                </Button>

                {botRuntime?.active ? (
                  <Button
                    variant="ghost"
                    onClick={() => void disconnectBot()}
                    disabled={botBusy}
                    title={en.telegramDisconnect}
                    className="!px-3"
                  >
                    <PowerOff className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Green on success, red on failure — the requested feedback. */}
            {botBanner ? (
              <p
                role="status"
                aria-live="polite"
                className={clsx(
                  "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed",
                  botBanner.tone === "success"
                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                    : "border-rose-400/40 bg-rose-500/15 text-rose-100",
                )}
              >
                {botBanner.tone === "success" ? (
                  <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="mt-px h-4 w-4 shrink-0" />
                )}
                {botBanner.text}
              </p>
            ) : botRuntime && !botRuntime.active && botRuntime.configured ? (
              <p className="flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                <WifiOff className="h-4 w-4 shrink-0" />
                {en.telegramStandby}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              className={inputClass}
              placeholder={en.telegramId}
              value={telegramId}
              inputMode="numeric"
              onChange={(event) => setTelegramId(event.target.value.replace(/\D/g, ""))}
            />
            <input
              className={inputClass}
              placeholder="Label (e.g. Sara — barista)"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <Button variant="ghost" onClick={() => void addContact()}>
              <Plus className="h-4 w-4" />
              {en.addToWhitelist}
            </Button>
          </div>

          <div className="space-y-2">
            {telegram && telegram.whitelist.length > 0 ? (
              telegram.whitelist.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-cafe-ink">{contact.label}</p>
                    <p className="text-xs text-white/40">ID {contact.telegramId}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={en.remove}
                    onClick={() => void removeContact(contact.id)}
                    className="rounded-lg p-2 text-white/40 transition hover:bg-white/5 hover:text-rose-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            ) : (
              <p className="flex items-center gap-2 text-xs text-white/40">
                <Send className="h-3.5 w-3.5" />
                {en.whitelistEmpty} users can run /whoami in the bot to find theirs.
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
