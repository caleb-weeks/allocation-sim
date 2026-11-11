/**
 * (Re)create one shared demo round per sample scenario (data/*.json).
 * Safe to run repeatedly; the nightly GitHub Actions workflow (demo-reset.yml) uses it to wipe visitors' changes.
 *
 * The same seven demo personas belong to every demo round: each sample's two funders and three
 * recommenders map onto the persona slots in order, with the sample's names as display names.
 *
 *   pnpm --filter @allocation-sim/api demo:reset
 */
import { prisma } from "../src/db.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import { type ScenarioTemplate, type TemplateId, availableTemplates, demoRoundKey, isDemoRoundKey, loadTemplate } from "../src/templates.js";

type Slot = "owner" | "funder-1" | "funder-2" | "recommender-1" | "recommender-2" | "recommender-3" | "observer";

const personas: { slot: Slot; email: string; name: string }[] = [
  { slot: "owner", email: "owner@demo.local", name: "Olivia (demo owner)" },
  { slot: "funder-1", email: "funder-1@demo.local", name: "Farah (demo funder)" },
  { slot: "funder-2", email: "funder-2@demo.local", name: "Felix (demo funder)" },
  { slot: "recommender-1", email: "recommender-1@demo.local", name: "Rosa (demo recommender)" },
  { slot: "recommender-2", email: "recommender-2@demo.local", name: "Ravi (demo recommender)" },
  { slot: "recommender-3", email: "recommender-3@demo.local", name: "Remy (demo recommender)" },
  { slot: "observer", email: "observer@demo.local", name: "Oscar (demo observer)" },
];

async function seedSample(id: TemplateId, t: ScenarioTemplate, users: Map<Slot, string>) {
  const key = demoRoundKey(id);
  await prisma.$transaction(
    async (tx) => {
      await tx.round.deleteMany({ where: { key } });
      const round = await tx.round.create({
        data: {
          key,
          title: `${t.title} (shared demo)`,
          valueUnit: t.valueUnit,
          sources: t.sources,
          assumptions: t.assumptions as Prisma.InputJsonObject,
        },
      });

      const appIds = new Map<string, string>();
      for (const a of t.applications) {
        const created = await tx.application.create({
          data: { roundId: round.id, key: a.id, name: a.name, cap: a.cap, data: a.data as Prisma.InputJsonObject },
        });
        appIds.set(a.id, created.id);
      }

      // Template funder/recommender ids → membership ids, assigning persona slots in order.
      const memberIds = new Map<string, string>();
      const member = (slot: Slot, data: Omit<Prisma.MembershipUncheckedCreateInput, "roundId" | "userId">) =>
        tx.membership.create({ data: { roundId: round.id, userId: users.get(slot)!, ...data } });

      await member("owner", { role: "OWNER", displayName: "Olivia" });
      for (const [i, f] of t.funders.entries()) {
        const m = await member(`funder-${i + 1}` as Slot, { role: "FUNDER", displayName: f.name, budget: f.budget });
        memberIds.set(f.id, m.id);
      }
      for (const [i, r] of t.recommenders.entries()) {
        const m = await member(`recommender-${i + 1}` as Slot, { role: "RECOMMENDER", displayName: r.name, lens: r.lens });
        memberIds.set(r.id, m.id);
      }
      await member("observer", { role: "OBSERVER", displayName: "Oscar" });

      await tx.curve.createMany({
        data: Object.entries(t.curves).flatMap(([recId, byApp]) =>
          Object.entries(byApp).map(([appId, curve]) => ({
            roundId: round.id,
            recommenderId: memberIds.get(recId)!,
            applicationId: appIds.get(appId)!,
            points: curve.points as unknown as Prisma.InputJsonArray,
            isShared: true,
          })),
        ),
      });
      await tx.trust.createMany({
        data: t.funders.flatMap((f) =>
          Object.entries(f.trust).map(([recId, weight]) => ({ funderId: memberIds.get(f.id)!, recommenderId: memberIds.get(recId)!, weight })),
        ),
      });
    },
    { timeout: 30_000 },
  );
}

async function main() {
  const samples = availableTemplates();
  const templates = samples.map((id) => [id, loadTemplate(id)] as const);
  for (const [id, t] of templates) {
    if (t.funders.length > 2 || t.recommenders.length > 3) throw new Error(`${id}: demo personas cover 2 funders and 3 recommenders`);
  }

  const users = new Map<Slot, string>();
  for (const p of personas) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      create: { email: p.email, name: p.name, isDemo: true },
      update: { name: p.name, isDemo: true },
    });
    users.set(p.slot, user.id);
  }

  for (const [id, t] of templates) await seedSample(id, t, users);

  // Drop demo rounds for samples that no longer exist, and demo users from older persona schemes.
  const keep = new Set<string>(samples.map(demoRoundKey));
  const stale = (await prisma.round.findMany({ where: { key: { startsWith: "demo-" } }, select: { id: true, key: true } })).filter(
    (r) => isDemoRoundKey(r.key) && !keep.has(r.key!),
  );
  await prisma.round.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
  await prisma.user.deleteMany({ where: { isDemo: true, email: { notIn: personas.map((p) => p.email) } } });

  console.log(`reset ${templates.length} demo round(s): ${samples.join(", ")}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
