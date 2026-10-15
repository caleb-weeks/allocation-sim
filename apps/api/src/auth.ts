import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "./db.js";
import { env } from "./env.js";

export const SESSION_COOKIE = "sid";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isDemo: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const tokenId = (token: string) => createHash("sha256").update(token).digest("hex");

export const hashPassword = (password: string) => hash(password);
export const verifyPassword = (passwordHash: string, password: string) => verify(passwordHash, password);

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (key && !(key in out)) out[key] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function createSession(res: Response, userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.authSession.create({ data: { id: tokenId(token), userId, expiresAt } });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    domain: env.cookieDomain,
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) await prisma.authSession.deleteMany({ where: { id: tokenId(token) } });
  res.clearCookie(SESSION_COOKIE, { domain: env.cookieDomain, path: "/" });
}

/** Resolve a session cookie to a user. Shared by Express and the Socket.IO handshake. */
export async function userFromCookieHeader(cookieHeader: string | undefined): Promise<SessionUser | null> {
  const token = parseCookies(cookieHeader)[SESSION_COOKIE];
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { id: tokenId(token) },
    include: { user: { select: { id: true, email: true, name: true, isDemo: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export async function loadUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.user = (await userFromCookieHeader(req.headers.cookie)) ?? undefined;
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  next();
}

/**
 * CSRF defense in depth on top of SameSite=Lax cookies: state-changing
 * requests must come from an allowed web origin.
 */
export function checkOrigin(req: Request, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !env.webOrigins.includes(origin)) {
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }
  next();
}
