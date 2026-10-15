"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type User, api } from "@/lib/api";
import { AUTH_EVENT, announceAuthChange } from "@/lib/session";

export function UserMenu() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const router = useRouter();

  useEffect(() => {
    const load = () =>
      api<{ user: User | null }>("/auth/me")
        .then((r) => setUser(r.user))
        .catch(() => setUser(null));
    load();
    window.addEventListener(AUTH_EVENT, load);
    return () => window.removeEventListener(AUTH_EVENT, load);
  }, []);

  if (user === undefined) return null;
  if (!user) {
    return (
      <Link href="/login" className="text-sm text-ink-2 hover:text-ink">
        Sign in
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-ink-2 sm:inline">{user.name}</span>
      <button
        type="button"
        className="text-ink-2 underline-offset-2 hover:text-ink hover:underline"
        onClick={async () => {
          await api("/auth/logout", { method: "POST" });
          announceAuthChange();
          router.push("/");
        }}
      >
        Sign out
      </button>
    </div>
  );
}
