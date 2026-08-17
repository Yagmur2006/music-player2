"use client";

import { useState } from "react";
import { KeyRound, LogIn, ShieldCheck } from "lucide-react";
import { Button, Field, Modal, inputClass } from "@/components/ui";
import { api } from "@/lib/client-api";
import { fa } from "@/lib/i18n";
import type { SessionUserDTO } from "@/lib/types";

export function LoginModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: SessionUserDTO) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.login(username.trim(), password);
      onSuccess(result.user);
      setUsername("");
      setPassword("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : fa.loginFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={fa.loginTitle}
      subtitle={fa.loginSubtitle}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label={fa.username}>
          <input
            className={inputClass}
            value={username}
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value)}
            placeholder="admin"
          />
        </Field>
        <Field label={fa.password}>
          <input
            className={inputClass}
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </Field>

        {error ? (
          <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={busy || !username || !password} className="w-full">
          <LogIn className="h-4 w-4" />
          {busy ? fa.signingIn : fa.signIn}
        </Button>

        <div className="space-y-2 rounded-2xl border border-white/8 bg-black/25 p-4 text-xs text-white/50">
          <p className="flex items-center gap-2 font-medium text-white/70">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-300" />
            حساب‌های پیش‌فرض محلی (در محیط واقعی تغییر دهید)
          </p>
          <p className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5" />
            <span data-ltr>admin / cafe1404</span> — دسترسی کامل
          </p>
          <p className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5" />
            <span data-ltr>barista / guest1404</span> — نقش مهمان
          </p>
        </div>
      </form>
    </Modal>
  );
}
