import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { createSession, destroySession, hashPassword, verifyPassword } from "../auth.js";
import { prisma } from "../db.js";
import { DEMO_ROUND_KEY } from "../state.js";

export const authRouter = Router();

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });

const credentials = z.object({
  email: z.email().max(254).transform((e) => e.toLowerCase()),
  password: z.string().min(10).max(200),
});

authRouter.get("/me", (req, res) => {
  res.json({ user: req.user ?? null });
});

authRouter.post("/register", limiter, async (req, res) => {
  const body = credentials.extend({ name: z.string().trim().min(1).max(80) }).safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Invalid registration", issues: body.error.issues });
  const existing = await prisma.user.findUnique({ where: { email: body.data.email } });
  if (existing) return void res.status(409).json({ error: "An account with that email already exists" });
  const user = await prisma.user.create({
    data: { email: body.data.email, name: body.data.name, passwordHash: await hashPassword(body.data.password) },
  });
  await createSession(res, user.id);
  res.status(201).json({ user: { id: user.id, email: user.email, name: user.name, isDemo: false } });
});

authRouter.post("/login", limiter, async (req, res) => {
  const body = credentials.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Invalid email or password" });
  const user = await prisma.user.findUnique({ where: { email: body.data.email } });
  // Same message either way, so the endpoint doesn't reveal which emails exist.
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, body.data.password))) {
    return void res.status(401).json({ error: "Invalid email or password" });
  }
  await createSession(res, user.id);
  res.json({ user: { id: user.id, email: user.email, name: user.name, isDemo: user.isDemo } });
});

authRouter.post("/logout", async (req, res) => {
  await destroySession(req, res);
  res.status(204).end();
});

/** The demo round's personas, so visitors can try each role without an account. */
authRouter.get("/demo-personas", async (_req, res) => {
  const round = await prisma.round.findUnique({
    where: { key: DEMO_ROUND_KEY },
    include: { memberships: { include: { user: true }, orderBy: [{ role: "asc" }, { displayName: "asc" }] } },
  });
  res.json({
    personas: (round?.memberships ?? [])
      .filter((m) => m.user.isDemo)
      .map((m) => ({ email: m.user.email, name: m.user.name, role: m.role, displayName: m.displayName, lens: m.lens })),
  });
});

authRouter.post("/demo", limiter, async (req, res) => {
  const body = z.object({ email: z.email() }).safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Pick a demo persona" });
  const user = await prisma.user.findUnique({ where: { email: body.data.email.toLowerCase() } });
  if (!user?.isDemo) return void res.status(404).json({ error: "Unknown demo persona" });
  await createSession(res, user.id);
  res.json({ user: { id: user.id, email: user.email, name: user.name, isDemo: true } });
});
