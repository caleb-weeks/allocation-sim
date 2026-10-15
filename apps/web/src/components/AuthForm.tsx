"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api } from "@/lib/api";
import { announceAuthChange } from "@/lib/session";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      await api(`/auth/${mode}`, {
        method: "POST",
        body: Object.fromEntries(["email", "password", ...(mode === "register" ? ["name"] : [])].map((k) => [k, form.get(k)])),
      });
      announceAuthChange();
      router.push("/rounds");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't reach the server");
      setBusy(false);
    }
  }

  const input = "w-full rounded-md border border-border bg-surface px-3 py-2";
  return (
    <form action={submit} className="mx-auto max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6">
      <h1 className="text-xl font-semibold">{mode === "login" ? "Sign in" : "Create an account"}</h1>
      {mode === "register" && (
        <label className="block space-y-1 text-sm">
          <span>Name</span>
          <input name="name" required maxLength={80} autoComplete="name" className={input} />
        </label>
      )}
      <label className="block space-y-1 text-sm">
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" className={input} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className={input}
        />
        {mode === "register" && <span className="text-xs text-muted">At least 10 characters.</span>}
      </label>
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-button px-3 py-2 font-medium text-button-ink disabled:opacity-60"
      >
        {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
      <p className="text-center text-sm text-ink-2">
        {mode === "login" ? (
          <>
            New here? <Link href="/register" className="underline underline-offset-2">Create an account</Link> or{" "}
            <Link href="/" className="underline underline-offset-2">try the demo</Link>.
          </>
        ) : (
          <>
            Have an account? <Link href="/login" className="underline underline-offset-2">Sign in</Link>.
          </>
        )}
      </p>
    </form>
  );
}
