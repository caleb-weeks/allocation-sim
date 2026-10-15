import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import type { RoundView } from "../src/protocol.js";
import { agentFor, app, makeRound, resetDb } from "./helpers.js";

let r: Awaited<ReturnType<typeof makeRound>>;

beforeEach(async () => {
  await resetDb();
  r = await makeRound();
});
afterAll(() => prisma.$disconnect());

const view = async (email: string) => (await (await agentFor(email)).get(`/rounds/${r.round.id}`).expect(200)).body as RoundView;

describe("authentication", () => {
  it("requires a session", async () => {
    await request(app).get("/rounds").expect(401);
  });

  it("rejects wrong passwords without revealing which emails exist", async () => {
    const bad = await request(app).post("/auth/login").send({ email: r.users.owner.email, password: "wrong password!" }).expect(401);
    const unknown = await request(app).post("/auth/login").send({ email: "nobody@test.local", password: "wrong password!" }).expect(401);
    expect(bad.body.error).toBe(unknown.body.error);
  });

  it("stores only a hash of the session token", async () => {
    const res = await request(app).post("/auth/login").send({ email: r.users.owner.email, password: "correct horse battery" }).expect(200);
    const token = String(res.headers["set-cookie"]).match(/sid=([^;]+)/)![1]!;
    expect(res.headers["set-cookie"]![0]).toMatch(/HttpOnly/);
    expect(await prisma.authSession.findUnique({ where: { id: token } })).toBeNull();
  });

  it("rejects state changes from other origins", async () => {
    await request(app).post("/auth/login").set("Origin", "https://evil.example").send({}).expect(403);
  });
});

describe("visibility by role", () => {
  it("hides rounds from non-members with a 404", async () => {
    const outsider = await agentFor(r.users.outsider.email);
    await outsider.get(`/rounds/${r.round.id}`).expect(404);
  });

  it("observers see results but no curves or trust", async () => {
    const v = await view(r.users.observer.email);
    expect(v.curves).toHaveLength(0);
    expect(v.trust).toHaveLength(0);
    expect(v.allocations.roundRobin.grants[r.apps.one.id]).toBeGreaterThan(0);
  });

  it("recommenders see shared curves and their own drafts, never others' drafts", async () => {
    const a = await view(r.users.recA.email);
    expect(a.curves.map((c) => c.recommenderId)).toEqual([r.members.recA.id, r.members.recA.id]);
    const b = await view(r.users.recB.email);
    expect(b.curves.filter((c) => !c.isShared).map((c) => c.recommenderId)).toEqual([r.members.recB.id]);
    expect(b.curves).toHaveLength(3);
  });

  it("funders see only their own trust weights; owners see all", async () => {
    expect((await view(r.users.funder.email)).trust).toHaveLength(2);
    expect((await view(r.users.recA.email)).trust).toHaveLength(0);
    expect((await view(r.users.owner.email)).trust).toHaveLength(2);
  });
});

describe("curves", () => {
  it("drafts don't count toward the official allocation until shared", async () => {
    const before = (await view(r.users.owner.email)).allocations.roundRobin.grants;
    // B's draft values app two at 5, but it's private, so B's half of the budget has nowhere to go yet.
    expect(before[r.apps.two.id]).toBeLessThan(50_000);

    const b = await agentFor(r.users.recB.email);
    await b.post(`/rounds/${r.round.id}/curves/${r.apps.two.id}/share`).send({ shared: true }).expect(200);
    const after = (await view(r.users.owner.email)).allocations.roundRobin.grants;
    expect(after[r.apps.two.id]).toBeGreaterThan(before[r.apps.two.id]!);
  });

  it("only recommenders can edit, and only their own curves", async () => {
    const funder = await agentFor(r.users.funder.email);
    await funder.put(`/rounds/${r.round.id}/curves/${r.apps.one.id}`).send({ points: [{ x: 0, m: 1 }] }).expect(403);

    const a = await agentFor(r.users.recA.email);
    await a.put(`/rounds/${r.round.id}/curves/${r.apps.one.id}`).send({ points: [{ x: 0, m: 3 }, { x: 10_000, m: 1 }] }).expect(200);
    // The route edits the caller's own curve; B's curve is untouched.
    const bCurve = await prisma.curve.findFirst({ where: { recommenderId: r.members.recB.id } });
    expect(bCurve!.points).toEqual([{ x: 0, m: 5 }]);
  });

  it("rejects curves that increase", async () => {
    const a = await agentFor(r.users.recA.email);
    const res = await a.put(`/rounds/${r.round.id}/curves/${r.apps.one.id}`).send({ points: [{ x: 0, m: 1 }, { x: 10, m: 2 }] }).expect(400);
    expect(res.body.error).toMatch(/non-increasing/);
  });

  it("the database rejects invalid curves even if the API is bypassed", async () => {
    await expect(
      prisma.curve.update({
        where: { recommenderId_applicationId: { recommenderId: r.members.recA.id, applicationId: r.apps.one.id } },
        data: { points: [{ x: 0, m: 1 }, { x: 10, m: 2 }] },
      }),
    ).rejects.toThrow(/Curve_points_valid/);
  });

  it("detects concurrent edits with optimistic versioning", async () => {
    const a = await agentFor(r.users.recA.email);
    const url = `/rounds/${r.round.id}/curves/${r.apps.one.id}`;
    await a.put(url).send({ points: [{ x: 0, m: 3 }], expectedVersion: 1 }).expect(200);
    const res = await a.put(url).send({ points: [{ x: 0, m: 4 }], expectedVersion: 1 }).expect(409);
    expect(res.body.currentVersion).toBe(2);
  });
});

describe("trust and counterfactuals", () => {
  it("only funders set trust, and only their own", async () => {
    const a = await agentFor(r.users.recA.email);
    await a.put(`/rounds/${r.round.id}/trust/${r.members.recA.id}`).send({ weight: 50 }).expect(403);
    const f = await agentFor(r.users.funder.email);
    await f.put(`/rounds/${r.round.id}/trust/${r.members.recA.id}`).send({ weight: 3 }).expect(200);
    const t = await prisma.trust.findUnique({ where: { funderId_recommenderId: { funderId: r.members.funder.id, recommenderId: r.members.recA.id } } });
    expect(t!.weight).toBe(3);
  });

  it("computes the allocation without a given recommender", async () => {
    const o = await agentFor(r.users.observer.email);
    const res = await o.get(`/rounds/${r.round.id}/allocation`).query({ exclude: r.members.recB.id }).expect(200);
    // With only A, the whole $100k follows A's curves: app one (m=2) to its cap, the rest to app two.
    expect(res.body.grants[r.apps.one.id]).toBe(80_000);
    expect(res.body.grants[r.apps.two.id]).toBe(20_000);
    await o.get(`/rounds/${r.round.id}/allocation`).query({ exclude: "not-a-recommender" }).expect(400);
  });
});

describe("membership management and audit", () => {
  it("owners add members; others can't", async () => {
    const f = await agentFor(r.users.funder.email);
    await f.post(`/rounds/${r.round.id}/members`).send({ email: r.users.outsider.email, role: "OBSERVER", displayName: "New" }).expect(403);
    const o = await agentFor(r.users.owner.email);
    await o.post(`/rounds/${r.round.id}/members`).send({ email: r.users.outsider.email, role: "OBSERVER", displayName: "New" }).expect(201);
    await o.post(`/rounds/${r.round.id}/members`).send({ email: r.users.outsider.email, role: "OBSERVER", displayName: "New" }).expect(409);
  });

  it("changing a recommender's role removes their curves in the same transaction", async () => {
    const o = await agentFor(r.users.owner.email);
    await o.patch(`/rounds/${r.round.id}/members/${r.members.recA.id}`).send({ role: "OBSERVER" }).expect(200);
    expect(await prisma.curve.count({ where: { recommenderId: r.members.recA.id } })).toBe(0);
    expect(await prisma.trust.count({ where: { recommenderId: r.members.recA.id } })).toBe(0);
  });

  it("owners can't demote or remove themselves", async () => {
    const o = await agentFor(r.users.owner.email);
    await o.patch(`/rounds/${r.round.id}/members/${r.members.owner.id}`).send({ role: "FUNDER" }).expect(400);
    await o.delete(`/rounds/${r.round.id}/members/${r.members.owner.id}`).expect(400);
  });

  it("records an audit trail only owners can read", async () => {
    const f = await agentFor(r.users.funder.email);
    await f.put(`/rounds/${r.round.id}/trust/${r.members.recB.id}`).send({ weight: 2 }).expect(200);
    await f.get(`/rounds/${r.round.id}/audit`).expect(403);
    const o = await agentFor(r.users.owner.email);
    const res = await o.get(`/rounds/${r.round.id}/audit`).expect(200);
    expect(res.body.events.map((e: { action: string }) => e.action)).toContain("trust.update");
  });
});
