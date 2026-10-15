import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { type Socket, io as connect } from "socket.io-client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import type { ClientToServerEvents, RoundView, ServerToClientEvents } from "../src/protocol.js";
import { attachRealtime } from "../src/realtime.js";
import { PASSWORD, app, makeRound, resetDb } from "./helpers.js";
import request from "supertest";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: Server;
let realtime: ReturnType<typeof attachRealtime>;
let url: string;
let r: Awaited<ReturnType<typeof makeRound>>;
const clients: Client[] = [];

beforeAll(async () => {
  server = createServer(app);
  realtime = attachRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await realtime.drain();
  realtime.close();
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  r = await makeRound();
});
afterEach(() => {
  clients.splice(0).forEach((c) => c.disconnect());
});

async function cookieFor(email: string) {
  const res = await request(server).post("/auth/login").send({ email, password: PASSWORD }).expect(200);
  return String(res.headers["set-cookie"]).split(";")[0]!;
}

function client(cookie?: string): Client {
  const c: Client = connect(url, { transports: ["websocket"], extraHeaders: cookie ? { cookie } : {}, forceNew: true });
  clients.push(c);
  return c;
}

const next = <E extends keyof ServerToClientEvents>(c: Client, event: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve) => c.once(event, resolve as never));

describe("realtime", () => {
  it("rejects handshakes without a session", async () => {
    const c = client();
    const err = await new Promise<Error>((resolve) => c.on("connect_error", resolve));
    expect(err.message).toBe("unauthorized");
  });

  it("won't let a non-member join a round", async () => {
    const c = client(await cookieFor(r.users.outsider.email));
    const res = await c.emitWithAck("round:join", r.round.id);
    expect(res).toEqual({ ok: false, error: "not found" });
  });

  it("pushes each member a view filtered for their role", async () => {
    const observer = client(await cookieFor(r.users.observer.email));
    const recB = client(await cookieFor(r.users.recB.email));
    const firstObs = next(observer, "round:state");
    const firstB = next(recB, "round:state");
    expect(await observer.emitWithAck("round:join", r.round.id)).toEqual({ ok: true });
    expect(await recB.emitWithAck("round:join", r.round.id)).toEqual({ ok: true });
    await Promise.all([firstObs, firstB]);

    // B shares their draft; both get a fresh push.
    const obsUpdate = next(observer, "round:state");
    const bUpdate = next(recB, "round:state");
    const agent = request.agent(server);
    await agent.post("/auth/login").send({ email: r.users.recB.email, password: PASSWORD });
    await agent.post(`/rounds/${r.round.id}/curves/${r.apps.two.id}/share`).send({ shared: true }).expect(200);

    const [o, b] = (await Promise.all([obsUpdate, bUpdate])) as [RoundView, RoundView];
    expect(o.curves).toHaveLength(0); // observers never receive curves
    expect(b.curves.find((c) => c.recommenderId === r.members.recB.id)!.isShared).toBe(true);
    expect(o.allocations.roundRobin.grants[r.apps.two.id]).toBe(b.allocations.roundRobin.grants[r.apps.two.id]);
  });

  it("stops pushing to someone removed from the round", async () => {
    const obs = client(await cookieFor(r.users.observer.email));
    const first = next(obs, "round:state");
    await obs.emitWithAck("round:join", r.round.id);
    await first;

    const removed = next(obs, "round:removed");
    const owner = request.agent(server);
    await owner.post("/auth/login").send({ email: r.users.owner.email, password: PASSWORD });
    await owner.delete(`/rounds/${r.round.id}/members/${r.members.observer.id}`).expect(204);
    expect(await removed).toEqual({ roundId: r.round.id });
  });

  it("shares presence with everyone in the round", async () => {
    const a = client(await cookieFor(r.users.recA.email));
    const b = client(await cookieFor(r.users.recB.email));
    await a.emitWithAck("round:join", r.round.id);
    await b.emitWithAck("round:join", r.round.id);
    const seen = new Promise((resolve) =>
      b.on("presence", (p) => {
        if (p.people.some((x) => x.focus === r.apps.one.id)) resolve(p);
      }),
    );
    a.emit("presence:focus", { roundId: r.round.id, applicationId: r.apps.one.id });
    await expect(seen).resolves.toBeTruthy();
  });
});
