/**
 * (Re)create the shared demo round from the Guatemala literacy template.
 * Safe to run repeatedly; the nightly GitHub Actions workflow (demo-reset.yml) uses it to wipe visitors' changes.
 *
 *   pnpm --filter @allocation-sim/api demo:reset
 */
import { prisma } from "../src/db.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import { DEMO_ROUND_KEY } from "../src/state.js";
import { loadTemplate } from "../src/templates.js";

const t = loadTemplate("guatemala-literacy");

const personas = [
  { email: "owner@demo.local", name: "Olivia (demo owner)", role: "OWNER" as const, displayName: "Round owner" },
  ...t.funders.map((f) => ({
    email: `${f.id}@demo.local`,
    name: `${f.name} (demo)`,
    role: "FUNDER" as const,
    displayName: f.name,
    templateId: f.id,
  })),
  ...t.recommenders.map((r) => ({
    email: `${r.id}@demo.local`,
    name: `${r.name} recommender (demo)`,
    role: "RECOMMENDER" as const,
    displayName: r.name,
    templateId: r.id,
    lens: r.lens,
  })),
  { email: "observer@demo.local", name: "Oscar (demo observer)", role: "OBSERVER" as const, displayName: "Observer" },
];

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.round.deleteMany({ where: { key: DEMO_ROUND_KEY } });
    const round = await tx.round.create({
      data: {
        key: DEMO_ROUND_KEY,
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

    const memberIds = new Map<string, string>();
    for (const p of personas) {
      const user = await tx.user.upsert({
        where: { email: p.email },
        create: { email: p.email, name: p.name, isDemo: true },
        update: { name: p.name, isDemo: true },
      });
      const funder = p.role === "FUNDER" ? t.funders.find((f) => f.id === ("templateId" in p ? p.templateId : "")) : undefined;
      const member = await tx.membership.create({
        data: {
          roundId: round.id,
          userId: user.id,
          role: p.role,
          displayName: p.displayName,
          budget: funder?.budget ?? null,
          lens: "lens" in p ? p.lens : null,
        },
      });
      if ("templateId" in p) memberIds.set(p.templateId, member.id);
    }

    for (const [recTemplateId, byApp] of Object.entries(t.curves)) {
      for (const [appTemplateId, curve] of Object.entries(byApp)) {
        await tx.curve.create({
          data: {
            roundId: round.id,
            recommenderId: memberIds.get(recTemplateId)!,
            applicationId: appIds.get(appTemplateId)!,
            points: curve.points as unknown as Prisma.InputJsonArray,
            isShared: true,
          },
        });
      }
    }

    for (const f of t.funders) {
      for (const [recTemplateId, weight] of Object.entries(f.trust)) {
        await tx.trust.create({
          data: { funderId: memberIds.get(f.id)!, recommenderId: memberIds.get(recTemplateId)!, weight },
        });
      }
    }
  }, { timeout: 30_000 });
  console.log(`demo round ${DEMO_ROUND_KEY} reset with ${personas.length} personas`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
