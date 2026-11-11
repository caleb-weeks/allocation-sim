import { execSync } from "node:child_process";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { availableTemplates, demoRoundKey, loadTemplate } from "../src/templates.js";
import { agentFor, app, makeUser, resetDb } from "./helpers.js";

afterAll(() => prisma.$disconnect());

describe("creating a round", () => {
  beforeAll(async () => {
    await resetDb();
    await makeUser("Creator");
  });

  it("copies a sample's applications without its curves", async () => {
    const sample = availableTemplates()[0]!;
    const a = await agentFor("creator@test.local");
    const { body } = await a.post("/rounds").send({ title: "From a sample", template: sample }).expect(201);
    const round = await prisma.round.findUniqueOrThrow({ where: { id: body.id }, include: { applications: true, curves: true, memberships: true } });
    expect(round.applications).toHaveLength(loadTemplate(sample).applications.length);
    expect(round.curves).toHaveLength(0);
    expect(round.memberships.map((m) => m.role)).toEqual(["OWNER"]);
  });

  it("accepts the owner's own applications", async () => {
    const a = await agentFor("creator@test.local");
    const { body } = await a
      .post("/rounds")
      .send({ title: "Our grants", valueUnit: "students served per $1,000", applications: [{ name: "Tutoring", cap: 50_000 }, { name: "Tutoring!", cap: 20_000 }] })
      .expect(201);
    const round = await prisma.round.findUniqueOrThrow({ where: { id: body.id }, include: { applications: { orderBy: { cap: "desc" } } } });
    expect(round.valueUnit).toBe("students served per $1,000");
    expect(round.applications.map((x) => [x.key, x.name, x.cap])).toEqual([
      ["tutoring", "Tutoring", 50_000],
      ["tutoring-2", "Tutoring!", 20_000],
    ]);
  });

  it("rejects unknown samples, duplicate names and bad caps", async () => {
    const a = await agentFor("creator@test.local");
    await a.post("/rounds").send({ title: "x", template: "nope" }).expect(400);
    await a.post("/rounds").send({ title: "x", valueUnit: "u", applications: [{ name: "A", cap: 1 }, { name: "a", cap: 1 }] }).expect(400);
    await a.post("/rounds").send({ title: "x", valueUnit: "u", applications: [{ name: "A", cap: 0 }] }).expect(400);
    await a.post("/rounds").send({ title: "x", valueUnit: "u", applications: [] }).expect(400);
  });
});

describe("sample demo rounds", () => {
  beforeAll(async () => {
    await resetDb();
    execSync("npx tsx prisma/seed.ts", { stdio: "ignore", env: process.env });
  });

  it("seeds one demo round per sample, with the same personas in each", async () => {
    const samples = availableTemplates();
    const rounds = await prisma.round.findMany({ where: { key: { in: samples.map(demoRoundKey) } }, include: { memberships: true } });
    expect(rounds).toHaveLength(samples.length);
    const userSets = rounds.map((r) => r.memberships.map((m) => m.userId).sort().join());
    expect(new Set(userSets).size).toBe(1);
    expect(rounds[0]!.memberships).toHaveLength(7);
  });

  it("lists a sample's personas and its round, and signs in as one", async () => {
    const sample = availableTemplates()[0]!;
    const { body } = await request(app).get(`/auth/demo-personas?sample=${sample}`).expect(200);
    const t = loadTemplate(sample);
    expect(body.personas.filter((p: { role: string }) => p.role === "RECOMMENDER").map((p: { displayName: string }) => p.displayName).sort()).toEqual(
      t.recommenders.map((r) => r.name).sort(),
    );
    const agent = request.agent(app);
    await agent.post("/auth/demo").send({ email: body.personas[0].email }).expect(200);
    await agent.get(`/rounds/${body.roundId}`).expect(200);
    await request(app).get("/auth/demo-personas?sample=nope").expect(404);
  });

  it("doesn't let anyone change a demo round's membership", async () => {
    const sample = availableTemplates()[0]!;
    const { body } = await request(app).get(`/auth/demo-personas?sample=${sample}`).expect(200);
    const owner = request.agent(app);
    await owner.post("/auth/demo").send({ email: "owner@demo.local" }).expect(200);
    await owner.post(`/rounds/${body.roundId}/members`).send({ email: "creator@test.local", role: "OBSERVER", displayName: "x" }).expect(403);
  });
});
