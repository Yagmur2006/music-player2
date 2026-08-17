"use client";

import { useState } from "react";
import { Check, FolderPlus, Pencil, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { Button, Field, Modal, inputClass } from "@/components/ui";
import { api } from "@/lib/client-api";
import { accentClasses, formatDurationLong } from "@/lib/format";
import { fa } from "@/lib/i18n";
import type { CategoryDTO } from "@/lib/types";

const ACCENTS = ["amber", "emerald", "violet", "sky", "rose", "teal"];

export function CategoryManager({
  open,
  onClose,
  categories,
  onChanged,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryDTO[];
  onChanged: () => Promise<void> | void;
  notify: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [accent, setAccent] = useState("amber");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.createCategory({
        name: name.trim(),
        description: description.trim() || undefined,
        accent,
      });
      setName("");
      setDescription("");
      await onChanged();
      notify(fa.playlistCreated, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : fa.errorGeneric, "error");
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id: string) => {
    if (!editName.trim()) return;
    setBusy(true);
    try {
      await api.updateCategory(id, { name: editName.trim() });
      setEditingId(null);
      await onChanged();
      notify(fa.playlistUpdated, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : fa.errorGeneric, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      const result = await api.deleteCategory(id);
      setConfirmId(null);
      await onChanged();
      notify(`${fa.playlistDeleted} (${result.deletedSongs} قطعه حذف شد)`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : fa.deleteFailed, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={fa.categoryTitle}
      subtitle={fa.categorySubtitle}
    >
      <div className="space-y-6">
        <div className="space-y-3 rounded-2xl border border-white/8 bg-black/25 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={fa.playlistName}>
              <input
                className={inputClass}
                value={name}
                placeholder="آخر شب"
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label={fa.description}>
              <input
                className={inputClass}
                value={description}
                placeholder="جاز آرام بعد از ساعت ۲۱"
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-white/40">{fa.color}</span>
            {ACCENTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAccent(value)}
                aria-label={`${fa.color} ${value}`}
                className={clsx(
                  "h-7 w-7 rounded-full border transition",
                  accentClasses(value).chip,
                  accent === value ? "ring-2 ring-white/70" : "opacity-70 hover:opacity-100",
                )}
              />
            ))}
          </div>
          <Button onClick={() => void create()} disabled={busy || !name.trim()}>
            <FolderPlus className="h-4 w-4" />
            {fa.create}
          </Button>
        </div>

        <div className="space-y-2">
          {categories.map((category) => {
            const accents = accentClasses(category.accent);
            return (
              <div
                key={category.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-black/25 p-3.5"
              >
                <span
                  data-ltr
                  className={clsx("rounded-full border px-3 py-1 text-xs", accents.chip)}
                >
                  {category.slug}
                </span>

                {editingId === category.id ? (
                  <input
                    className={clsx(inputClass, "flex-1")}
                    value={editName}
                    autoFocus
                    onChange={(event) => setEditName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void rename(category.id);
                      if (event.key === "Escape") setEditingId(null);
                    }}
                  />
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-cafe-ink">
                      {category.name}
                    </p>
                    <p className="truncate text-xs text-white/40">
                      {fa.songsCount(category.songCount)} ·{" "}
                      {formatDurationLong(category.totalDuration)}
                      {category.description ? ` · ${category.description}` : ""}
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-1">
                  {editingId === category.id ? (
                    <>
                      <button
                        type="button"
                        aria-label={fa.save}
                        onClick={() => void rename(category.id)}
                        className="rounded-lg p-2 text-emerald-300 transition hover:bg-white/5"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={fa.cancel}
                        onClick={() => setEditingId(null)}
                        className="rounded-lg p-2 text-white/40 transition hover:bg-white/5"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      aria-label={fa.edit}
                      onClick={() => {
                        setEditingId(category.id);
                        setEditName(category.name);
                      }}
                      className="rounded-lg p-2 text-white/45 transition hover:bg-white/5 hover:text-white"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}

                  {confirmId === category.id ? (
                    <Button
                      variant="danger"
                      onClick={() => void remove(category.id)}
                      disabled={busy}
                      className="!py-1.5 !text-xs"
                    >
                      تأیید حذف
                    </Button>
                  ) : (
                    <button
                      type="button"
                      aria-label={fa.deletePlaylist}
                      onClick={() => setConfirmId(category.id)}
                      className="rounded-lg p-2 text-white/45 transition hover:bg-white/5 hover:text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
