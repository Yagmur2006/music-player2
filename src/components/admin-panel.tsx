"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react";
import clsx from "clsx";
import { Button, Field, Modal, Switch, inputClass } from "@/components/ui";
import { api } from "@/lib/client-api";
import type {
  SessionUserDTO,
  SystemConfigDTO,
  TelegramStatusDTO,
} from "@/lib/types";

export function AdminPanel({
  open,
  onClose,
  config,
  onConfigChange,
  user,
  onUserChange,
  notify,
  stats,
}: {
  open: boolean;
  onClose: () => void;
  config: SystemConfigDTO;
  onConfigChange: (next: SystemConfigDTO) => void;
  user: SessionUserDTO;
  onUserChange: (next: SessionUserDTO) => void;
  notify: (message: string, tone?: "success" | "error" | "info") => void;
  stats: { songCount: number; categoryCount: number };
}) {
  const [telegram, setTelegram] = useState<TelegramStatusDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [telegramId, setTelegramId] = useState("");
  const [label, setLabel] = useState("");
  const [cafeName, setCafeName] = useState(config.cafeName);
  const [profileUsername, setProfileUsername] = useState(user.username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  const loadTelegram = useCallback(async () => {
    setLoading(true);
    try {
      setTelegram(await api.telegramStatus());
    } catch (error) {
      notify(error instanceof Error ? error.message : "Bot status unavailable", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (open) void loadTelegram();
  }, [open, loadTelegram]);

  useEffect(() => setCafeName(config.cafeName), [config.cafeName]);
  useEffect(() => setProfileUsername(user.username), [user.username]);

  const toggleGuestUpload = async (next: boolean) => {
    try {
      const updated = await api.updateConfig({ allowGuestUpload: next });
      onConfigChange(updated);
      notify(next ? "Guest uploads enabled" : "Guest uploads locked", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Update failed", "error");
    }
  };

  const saveName = async () => {
    if (!cafeName.trim() || cafeName === config.cafeName) return;
    try {
      const updated = await api.updateConfig({ cafeName: cafeName.trim() });
      onConfigChange(updated);
      notify("Cafe name updated", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Update failed", "error");
    }
  };

  const saveProfile = async () => {
    if (!currentPassword) {
      notify("Enter your current password to change account details", "error");
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      notify("New password confirmation does not match", "error");
      return;
    }
    if (newPassword && newPassword.length < 8) {
      notify("New password must be at least 8 characters", "error");
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
      notify("Admin account updated — your session has been renewed", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Account update failed", "error");
    } finally {
      setProfileBusy(false);
    }
  };

  const addContact = async () => {
    if (!telegramId.trim()) return;
    try {
      const result = await api.addTelegramContact(telegramId.trim(), label.trim() || "Staff");
      setTelegram((prev) => (prev ? { ...prev, whitelist: result.whitelist } : prev));
      setTelegramId("");
      setLabel("");
      notify("Telegram ID whitelisted", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not whitelist ID", "error");
    }
  };

  const removeContact = async (id: string) => {
    try {
      const result = await api.removeTelegramContact(id);
      setTelegram((prev) => (prev ? { ...prev, whitelist: result.whitelist } : prev));
      notify("Removed from whitelist", "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not remove", "error");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Admin control room"
      subtitle="Access control, system switches and the Telegram ingest bridge."
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

        <Switch
          checked={config.allowGuestUpload}
          onChange={(next) => void toggleGuestUpload(next)}
          label="Allow guest uploads"
          description="When on, signed-in GUEST accounts and non-whitelisted Telegram users can add tracks. Admins always can."
        />

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Cafe display name">
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
            Save
          </Button>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/8 bg-black/25 p-4">
          <div className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-amber-300" />
            <div>
              <p className="text-sm font-medium text-cafe-ink">Admin account</p>
              <p className="text-xs text-white/45">
                Change your login. Current password is always required.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Username">
              <input
                className={inputClass}
                value={profileUsername}
                autoComplete="username"
                onChange={(event) => setProfileUsername(event.target.value)}
              />
            </Field>
            <Field label="Current password">
              <input
                className={inputClass}
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                placeholder="Required to save"
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
            <Field label="New password" hint="Leave blank to keep your current password.">
              <input
                className={inputClass}
                type="password"
                value={newPassword}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </Field>
            <Field label="Confirm new password">
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
            {profileBusy ? "Updating account…" : "Update account"}
          </Button>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/8 bg-black/25 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-sky-300" />
              <div>
                <p className="text-sm font-medium text-cafe-ink">
                  Telegram sync bot
                  {telegram?.botUsername ? (
                    <span className="ml-1 text-white/40">@{telegram.botUsername}</span>
                  ) : null}
                </p>
                <p className="text-xs text-white/45">{telegram?.message ?? "Checking…"}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadTelegram()}
              aria-label="Refresh bot status"
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10"
            >
              <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
            </button>
          </div>

          <div
            className={clsx(
              "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs",
              telegram?.reachable
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                : "border-amber-400/25 bg-amber-500/10 text-amber-200",
            )}
          >
            {telegram?.reachable ? (
              <Wifi className="h-4 w-4" />
            ) : (
              <WifiOff className="h-4 w-4" />
            )}
            {telegram?.configured
              ? telegram.reachable
                ? "Bot online — forward an MP3 to publish it into a playlist."
                : "Telegram unreachable (intranet cut-off). Local playback and uploads keep working."
              : "Set TELEGRAM_BOT_TOKEN in .env, then run `npm run bot` (long polling) or point the webhook at /api/telegram/webhook."}
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              className={inputClass}
              placeholder="Telegram numeric ID"
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
              Whitelist
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
                    aria-label="Remove from whitelist"
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
                No whitelisted IDs yet — users can run /whoami in the bot to find theirs.
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
