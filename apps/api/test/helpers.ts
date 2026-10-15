import { execSync } from "node:child_process";
import request from "supertest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth.js";
import { prisma } from "../src/db.js";
import type { Role } from "../src/protocol.js";

export const app = createApp();
export const PASSWORD = "correct horse battery";

let migrated = false;

/** Apply migrations once, then wipe every table between tests. */
export async function resetDb() {
  if (!migrated) {
    execSync("npx prisma migrate deploy", { stdio: "ignore", env: process.env });
    migrated = true;
  }
  await prisma.$executeRawUnsafe(
    `TRUNCATE "AuditEvent", "Snapshot", "Trust", "Curve", "Application", "Membership", "Round", "AuthSession", "User" CASCADE`,
  );
}

export async function makeUser(name: string) {
  return prisma.user.create({
    data: { email: `${name.toLowerCase()}@test.local`, name, passwordHash: await hashPassword(PASSWORD) },
  });
}

/** A logged-in supertest agent (keeps the session cookie). */
export async function agentFor(email: string) {
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email, password: PASSWORD }).expect(200);
  return agent;
}

/**
 * A small round: two applications, an owner, a funder ($100k), two
 * recommenders, and an observer. Recommender A has shared curves; B has a
 * private draft on app 1.
 */
export async function makeRound() {
  const [owner, funder, recA, recB, observer, outsider] = await Promise.all(
    ["Owner", "Funder", "RecA", "RecB", "Observer", "Outsider"].map(makeUser),
  );
  const round = await prisma.round.create({ data: { title: "Test round", valueUnit: "value" } });
  const [app1, app2] = await Promise.all([
    prisma.application.create({ data: { roundId: round.id, key: "one", name: "One", cap: 80_000 } }),
    prisma.application.create({ data: { roundId: round.id, key: "two", name: "Two", cap: 80_000 } }),
  ]);
  const member = (userId: string, role: Role, extra: object = {}) =>
    prisma.membership.create({ data: { roundId: round.id, userId, role, displayName: role, ...extra } });
  const m = {
    owner: await member(owner!.id, "OWNER"),
    funder: await member(funder!.id, "FUNDER", { budget: 100_000 }),
    recA: await member(recA!.id, "RECOMMENDER"),
    recB: await member(recB!.id, "RECOMMENDER"),
    observer: await member(observer!.id, "OBSERVER"),
  };
  await prisma.trust.createMany({
    data: [
      { funderId: m.funder.id, recommenderId: m.recA.id, weight: 1 },
      { funderId: m.funder.id, recommenderId: m.recB.id, weight: 1 },
    ],
  });
  const flat = (m: number) => ({ points: [{ x: 0, m }] });
  await prisma.curve.createMany({
    data: [
      { roundId: round.id, recommenderId: m.recA.id, applicationId: app1!.id, points: flat(2).points, isShared: true },
      { roundId: round.id, recommenderId: m.recA.id, applicationId: app2!.id, points: flat(1).points, isShared: true },
      { roundId: round.id, recommenderId: m.recB.id, applicationId: app2!.id, points: flat(5).points, isShared: false },
    ],
  });
  return {
    round,
    apps: { one: app1!, two: app2! },
    members: m,
    users: { owner: owner!, funder: funder!, recA: recA!, recB: recB!, observer: observer!, outsider: outsider! },
  };
}
