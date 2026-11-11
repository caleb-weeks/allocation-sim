import { InvalidCurveError, validateCurve } from "@allocation-sim/engine";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { requireUser } from "../auth.js";
import { type Action, can } from "../authz.js";
import { prisma } from "../db.js";
import { notifyRoundChanged } from "../events.js";
import { Prisma } from "../generated/prisma/client.js";
import { allocate, compute, loadRound, viewFor } from "../state.js";
import { availableTemplates, isDemoRoundKey, isTemplateId, loadTemplate } from "../templates.js";

export const roundsRouter = Router();
roundsRouter.use(requireUser);

const ROLES = ["OWNER", "FUNDER", "RECOMMENDER", "OBSERVER"] as const;

type Tx = Prisma.TransactionClient;

function audit(tx: Tx, roundId: string, actorId: string, action: string, target: string | null, detail: object = {}) {
  return tx.auditEvent.create({ data: { roundId, actorId, action, target, detail: detail as Prisma.InputJsonObject } });
}

/**
 * Load the caller's membership in :roundId and check `action`. Non-members get
 * a 404 (not 403) so round ids can't be probed; members lacking permission get 403.
 */
async function authorize(req: Request, res: Response, action: Action | ((membershipId: string) => Action)) {
  const roundId = String(req.params.roundId);
  const membership = await prisma.membership.findUnique({ where: { roundId_userId: { roundId, userId: req.user!.id } } });
  if (!membership) {
    res.status(404).json({ error: "Round not found" });
    return null;
  }
  const resolved = typeof action === "function" ? action(membership.id) : action;
  if (!can({ membershipId: membership.id, role: membership.role }, resolved)) {
    res.status(403).json({ error: "You don't have permission to do that" });
    return null;
  }
  return membership;
}

function param(req: Request, name: string): string {
  return String(req.params[name]);
}

roundsRouter.get("/", async (req, res) => {
  const memberships = await prisma.membership.findMany({
    where: { userId: req.user!.id },
    include: { round: { select: { id: true, title: true, key: true, createdAt: true } } },
    orderBy: { round: { createdAt: "desc" } },
  });
  res.json({
    rounds: memberships.map((m) => ({ ...m.round, role: m.role, displayName: m.displayName })),
    templates: availableTemplates(),
  });
});

const title = z.string().trim().min(1).max(120);

/** Either copy a sample's applications, or bring your own list. */
const newRound = z.union([
  z.object({ title, template: z.string().refine(isTemplateId, "Unknown sample") }),
  z.object({
    title,
    valueUnit: z.string().trim().min(1).max(60),
    applications: z
      .array(z.object({ name: z.string().trim().min(1).max(80), cap: z.number().int().min(1).max(1_000_000_000) }))
      .min(1)
      .max(50)
      .refine((apps) => new Set(apps.map((a) => a.name.toLowerCase())).size === apps.length, "Application names must be unique"),
  }),
]);

function slug(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "application";
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}-${i}`;
  taken.add(key);
  return key;
}

/** Start a new round, from a sample's applications or the caller's own; the creator becomes its owner. */
roundsRouter.post("/", async (req, res) => {
  if (req.user!.isDemo) return void res.status(403).json({ error: "Demo personas can't create rounds; create an account instead" });
  const body = newRound.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Invalid round", issues: body.error.issues });

  const fromTemplate = "template" in body.data && isTemplateId(body.data.template) ? loadTemplate(body.data.template) : null;
  const taken = new Set<string>();
  const source = fromTemplate
    ? {
        valueUnit: fromTemplate.valueUnit,
        sources: fromTemplate.sources,
        assumptions: fromTemplate.assumptions as Prisma.InputJsonObject,
        applications: fromTemplate.applications.map((a) => ({ key: a.id, name: a.name, cap: a.cap, data: a.data as Prisma.InputJsonObject })),
      }
    : {
        valueUnit: "valueUnit" in body.data ? body.data.valueUnit : "",
        sources: [],
        assumptions: {},
        applications: ("applications" in body.data ? body.data.applications : []).map((a) => ({ key: slug(a.name, taken), name: a.name, cap: a.cap, data: {} })),
      };

  const round = await prisma.$transaction(async (tx) => {
    const round = await tx.round.create({
      data: {
        title: body.data.title,
        valueUnit: source.valueUnit,
        sources: source.sources,
        assumptions: source.assumptions,
        applications: { create: source.applications },
        memberships: { create: { userId: req.user!.id, role: "OWNER", displayName: req.user!.name } },
      },
    });
    await audit(tx, round.id, req.user!.id, "round.create", round.id, fromTemplate ? { template: fromTemplate.id } : { applications: source.applications.length });
    return round;
  });
  res.status(201).json({ id: round.id });
});

roundsRouter.get("/:roundId", async (req, res) => {
  const membership = await authorize(req, res, { type: "round:view" });
  if (!membership) return;
  const round = (await loadRound(membership.roundId))!;
  res.json(viewFor(round, await compute(round), membership.id));
});

/** Official allocation, optionally as a counterfactual without one recommender. */
roundsRouter.get("/:roundId/allocation", async (req, res) => {
  const membership = await authorize(req, res, { type: "allocation:view" });
  if (!membership) return;
  const q = z
    .object({ method: z.enum(["roundRobin", "pooled"]).default("roundRobin"), exclude: z.string().optional() })
    .safeParse(req.query);
  if (!q.success) return void res.status(400).json({ error: "Invalid query" });
  const round = (await loadRound(membership.roundId))!;
  const { scenario } = await compute(round);
  if (q.data.exclude && !scenario.recommenders.some((r) => r.id === q.data.exclude)) {
    return void res.status(400).json({ error: "exclude must be a recommender in this round" });
  }
  res.json(allocate(scenario, q.data.method, q.data.exclude));
});

const pointsSchema = z
  .array(z.object({ x: z.number().finite().min(0).max(1e10), m: z.number().finite().min(0).max(1e6) }).strict())
  .min(1)
  .max(50);

roundsRouter.put("/:roundId/curves/:applicationId", async (req, res) => {
  const membership = await authorize(req, res, (me) => ({ type: "curve:edit", authorId: me }));
  if (!membership) return;
  const roundId = membership.roundId;
  const body = z.object({ points: pointsSchema, expectedVersion: z.number().int().positive().optional() }).safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Invalid curve", issues: body.error.issues });
  try {
    validateCurve({ points: body.data.points });
  } catch (err) {
    if (err instanceof InvalidCurveError) return void res.status(400).json({ error: err.message });
    throw err;
  }
  const application = await prisma.application.findFirst({ where: { id: param(req, "applicationId"), roundId } });
  if (!application) return void res.status(404).json({ error: "Application not found" });

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.curve.findUnique({
      where: { recommenderId_applicationId: { recommenderId: membership.id, applicationId: application.id } },
    });
    if (body.data.expectedVersion !== undefined && existing && existing.version !== body.data.expectedVersion) {
      return { conflict: existing.version };
    }
    const curve = existing
      ? await tx.curve.update({ where: { id: existing.id }, data: { points: body.data.points, version: { increment: 1 } } })
      : await tx.curve.create({ data: { roundId, recommenderId: membership.id, applicationId: application.id, points: body.data.points } });
    await audit(tx, roundId, req.user!.id, "curve.update", application.id, { version: curve.version, shared: curve.isShared });
    return { curve };
  });
  if ("conflict" in result) {
    return void res.status(409).json({ error: "This curve changed since you loaded it", currentVersion: result.conflict });
  }
  // Everyone gets a fresh view; viewFor decides whether this curve is in it.
  notifyRoundChanged(roundId);
  res.json({ id: result.curve!.id, version: result.curve!.version, isShared: result.curve!.isShared });
});

roundsRouter.post("/:roundId/curves/:applicationId/share", async (req, res) => {
  const membership = await authorize(req, res, (me) => ({ type: "curve:edit", authorId: me }));
  if (!membership) return;
  const roundId = membership.roundId;
  const body = z.object({ shared: z.boolean() }).safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Invalid request" });
  const curve = await prisma.curve.findFirst({
    where: { roundId, recommenderId: membership.id, applicationId: param(req, "applicationId") },
  });
  if (!curve) return void res.status(404).json({ error: "Draw a curve before sharing it" });
  await prisma.$transaction(async (tx) => {
    await tx.curve.update({ where: { id: curve.id }, data: { isShared: body.data.shared } });
    await audit(tx, roundId, req.user!.id, body.data.shared ? "curve.share" : "curve.unshare", curve.applicationId);
  });
  notifyRoundChanged(roundId);
  res.json({ isShared: body.data.shared });
});

roundsRouter.put("/:roundId/trust/:recommenderId", async (req, res) => {
  const membership = await authorize(req, res, (me) => ({ type: "trust:edit", funderId: me }));
  if (!membership) return;
  const roundId = membership.roundId;
  const body = z.object({ weight: z.number().finite().min(0).max(100) }).safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Weight must be between 0 and 100" });
  const recommender = await prisma.membership.findFirst({
    where: { id: param(req, "recommenderId"), roundId, role: "RECOMMENDER" },
  });
  if (!recommender) return void res.status(404).json({ error: "Recommender not found" });
  await prisma.$transaction(async (tx) => {
    await tx.trust.upsert({
      where: { funderId_recommenderId: { funderId: membership.id, recommenderId: recommender.id } },
      create: { funderId: membership.id, recommenderId: recommender.id, weight: body.data.weight },
      update: { weight: body.data.weight },
    });
    await audit(tx, roundId, req.user!.id, "trust.update", recommender.id, { weight: body.data.weight });
  });
  notifyRoundChanged(roundId);
  res.json({ weight: body.data.weight });
});

roundsRouter.get("/:roundId/snapshots", async (req, res) => {
  const membership = await authorize(req, res, { type: "allocation:view" });
  if (!membership) return;
  const snapshots = await prisma.snapshot.findMany({ where: { roundId: membership.roundId }, orderBy: { createdAt: "desc" } });
  res.json({ snapshots });
});

roundsRouter.post("/:roundId/snapshots", async (req, res) => {
  const membership = await authorize(req, res, { type: "snapshot:create" });
  if (!membership) return;
  const body = z
    .object({ label: z.string().trim().min(1).max(120), method: z.enum(["roundRobin", "pooled"]) })
    .safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Invalid snapshot" });
  const round = (await loadRound(membership.roundId))!;
  const { allocations } = await compute(round);
  const snapshot = await prisma.$transaction(async (tx) => {
    const snapshot = await tx.snapshot.create({
      data: {
        roundId: round.id,
        createdById: req.user!.id,
        label: body.data.label,
        method: body.data.method,
        result: allocations[body.data.method] as unknown as Prisma.InputJsonObject,
      },
    });
    await audit(tx, round.id, req.user!.id, "snapshot.create", snapshot.id, { label: body.data.label });
    return snapshot;
  });
  res.status(201).json(snapshot);
});

roundsRouter.get("/:roundId/audit", async (req, res) => {
  const membership = await authorize(req, res, { type: "round:viewAudit" });
  if (!membership) return;
  const events = await prisma.auditEvent.findMany({
    where: { roundId: membership.roundId },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ events });
});

// ---- Membership management (owners only; the shared demo round is locked) ----

const memberFields = z.object({
  role: z.enum(ROLES),
  displayName: z.string().trim().min(1).max(80),
  budget: z.number().int().min(0).max(1e10).nullable().optional(),
  lens: z.string().trim().max(200).nullable().optional(),
});

async function authorizeMembers(req: Request, res: Response) {
  const membership = await authorize(req, res, { type: "members:manage" });
  if (!membership) return null;
  const round = await prisma.round.findUnique({ where: { id: membership.roundId } });
  if (isDemoRoundKey(round?.key)) {
    res.status(403).json({ error: "Membership in the shared demo round can't be changed" });
    return null;
  }
  return membership;
}

roundsRouter.post("/:roundId/members", async (req, res) => {
  const owner = await authorizeMembers(req, res);
  if (!owner) return;
  const body = memberFields.extend({ email: z.email() }).safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Invalid member", issues: body.error.issues });
  const user = await prisma.user.findUnique({ where: { email: body.data.email.toLowerCase() } });
  if (!user || user.isDemo) return void res.status(404).json({ error: "No account with that email; ask them to sign up first" });
  try {
    const member = await prisma.$transaction(async (tx) => {
      const member = await tx.membership.create({
        data: {
          roundId: owner.roundId,
          userId: user.id,
          role: body.data.role,
          displayName: body.data.displayName,
          budget: body.data.role === "FUNDER" ? (body.data.budget ?? 0) : null,
          lens: body.data.role === "RECOMMENDER" ? (body.data.lens ?? null) : null,
        },
      });
      await audit(tx, owner.roundId, req.user!.id, "member.add", member.id, { role: member.role, email: user.email });
      return member;
    });
    notifyRoundChanged(owner.roundId);
    res.status(201).json({ id: member.id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return void res.status(409).json({ error: "That person is already in this round" });
    }
    throw err;
  }
});

roundsRouter.patch("/:roundId/members/:memberId", async (req, res) => {
  const owner = await authorizeMembers(req, res);
  if (!owner) return;
  const body = memberFields.partial().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Invalid member", issues: body.error.issues });
  const member = await prisma.membership.findFirst({ where: { id: param(req, "memberId"), roundId: owner.roundId } });
  if (!member) return void res.status(404).json({ error: "Member not found" });
  if (member.id === owner.id && body.data.role && body.data.role !== "OWNER") {
    return void res.status(400).json({ error: "Owners can't demote themselves" });
  }
  const role = body.data.role ?? member.role;
  await prisma.$transaction(async (tx) => {
    // Inputs that belong to a role go away with it, in the same transaction.
    if (role !== member.role) {
      if (member.role === "FUNDER") await tx.trust.deleteMany({ where: { funderId: member.id } });
      if (member.role === "RECOMMENDER") {
        await tx.curve.deleteMany({ where: { recommenderId: member.id } });
        await tx.trust.deleteMany({ where: { recommenderId: member.id } });
      }
    }
    await tx.membership.update({
      where: { id: member.id },
      data: {
        role,
        displayName: body.data.displayName ?? member.displayName,
        budget: role === "FUNDER" ? (body.data.budget ?? member.budget ?? 0) : null,
        lens: role === "RECOMMENDER" ? (body.data.lens !== undefined ? body.data.lens : member.lens) : null,
      },
    });
    await audit(tx, owner.roundId, req.user!.id, "member.update", member.id, { from: member.role, to: role });
  });
  notifyRoundChanged(owner.roundId);
  res.json({ ok: true });
});

roundsRouter.delete("/:roundId/members/:memberId", async (req, res) => {
  const owner = await authorizeMembers(req, res);
  if (!owner) return;
  const member = await prisma.membership.findFirst({ where: { id: param(req, "memberId"), roundId: owner.roundId } });
  if (!member) return void res.status(404).json({ error: "Member not found" });
  if (member.id === owner.id) return void res.status(400).json({ error: "Owners can't remove themselves" });
  await prisma.$transaction(async (tx) => {
    await tx.membership.delete({ where: { id: member.id } }); // curves and trust cascade
    await audit(tx, owner.roundId, req.user!.id, "member.remove", member.id, { role: member.role });
  });
  notifyRoundChanged(owner.roundId);
  res.status(204).end();
});
