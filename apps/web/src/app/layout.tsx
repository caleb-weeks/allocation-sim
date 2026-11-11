import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ServerWaking } from "@/components/ServerWaking";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Allocation Simulator", template: "%s · Allocation Simulator" },
  description: "Allocate a shared budget across many evaluators' marginal value curves, live and together.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

// Apply a saved theme before first paint so there's no flash.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <ServerWaking />
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Allocation Simulator
            </Link>
            <nav className="flex gap-4 text-sm text-ink-2">
              <Link href="/rounds" className="hover:text-ink">
                Rounds
              </Link>
              <Link href="/how-it-works" className="hover:text-ink">
                How it works
              </Link>
              <Link href="/architecture" className="hover:text-ink">
                Architecture
              </Link>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <UserMenu />
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
