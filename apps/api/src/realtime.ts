import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { type SessionUser, userFromCookieHeader } from "./auth.js";
import { can } from "./authz.js";
import { prisma } from "./db.js";
import { env } from "./env.js";
import { roundEvents } from "./events.js";
import type { ClientToServerEvents, ServerToClientEvents } from "./protocol.js";
import { compute, loadRound, viewFor } from "./state.js";

interface SocketData {
  user: SessionUser;
  /** roundId -> membershipId for rounds this socket has joined. */
  rounds: Map<string, string>;
  /** roundId -> application the user is looking at. */
  focus: Map<string, string | null>;
}

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const room = (roundId: string) => `round:${roundId}`;

export function attachRealtime(httpServer: HttpServer): AppServer & { drain: () => Promise<void> } {
  const io: AppServer = new Server(httpServer, {
    cors: { origin: env.webOrigins, credentials: true },
  });

  // Work still running after a reply (pushes, presence) is tracked so shutdown can wait for it.
  const inFlight = new Set<Promise<void>>();
  function track(work: Promise<void>) {
    const p: Promise<void> = work.catch((err) => console.error("realtime task failed", err)).finally(() => inFlight.delete(p));
    inFlight.add(p);
  }

  // Authenticate the handshake with the same session cookie the REST API uses.
  io.use(async (socket, next) => {
    const user = await userFromCookieHeader(socket.handshake.headers.cookie).catch(() => null);
    if (!user) return next(new Error("unauthorized"));
    socket.data = { user, rounds: new Map(), focus: new Map() };
    next();
  });

  async function broadcastPresence(roundId: string) {
    const sockets = await io.in(room(roundId)).fetchSockets();
    const byMember = new Map<string, { membershipId: string; name: string; focus: string | null }>();
    for (const s of sockets) {
      const membershipId = s.data.rounds.get(roundId);
      if (!membershipId) continue;
      byMember.set(membershipId, { membershipId, name: s.data.user.name, focus: s.data.focus.get(roundId) ?? null });
    }
    io.to(room(roundId)).emit("presence", { roundId, people: [...byMember.values()] });
  }

  /** Push each socket in the room the view its *current* membership allows. */
  async function publish(roundId: string) {
    const round = await loadRound(roundId);
    const sockets = await io.in(room(roundId)).fetchSockets();
    if (!round) {
      for (const s of sockets) s.leave(room(roundId));
      return;
    }
    const computed = await compute(round);
    for (const s of sockets) {
      // Re-check membership on every push: someone removed from the round, or
      // whose role changed, must not keep receiving their old view.
      const membership = round.memberships.find((m) => m.userId === s.data.user.id);
      if (!membership) {
        s.data.rounds.delete(roundId);
        s.leave(room(roundId));
        s.emit("round:removed", { roundId });
        continue;
      }
      s.data.rounds.set(roundId, membership.id);
      s.emit("round:state", viewFor(round, computed, membership.id)!);
    }
  }

  const onChanged = (roundId: string) => track(publish(roundId));
  roundEvents.on("changed", onChanged);
  httpServer.on("close", () => roundEvents.off("changed", onChanged));

  io.on("connection", (socket: AppSocket) => {
    // Payloads come from untrusted clients: check their shape at runtime too.
    socket.on("round:join", async (roundId, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      if (typeof roundId !== "string") return reply({ ok: false, error: "bad round id" });
      const membership = await prisma.membership.findUnique({
        where: { roundId_userId: { roundId, userId: socket.data.user.id } },
      });
      if (!membership || !can({ membershipId: membership.id, role: membership.role }, { type: "round:view" })) {
        return reply({ ok: false, error: "not found" });
      }
      socket.data.rounds.set(roundId, membership.id);
      await socket.join(room(roundId));
      reply({ ok: true });
      track(
        (async () => {
          const round = await loadRound(roundId);
          if (round) socket.emit("round:state", viewFor(round, await compute(round), membership.id)!);
          await broadcastPresence(roundId);
        })(),
      );
    });

    socket.on("round:leave", async (roundId) => {
      if (typeof roundId !== "string") return;
      socket.data.rounds.delete(roundId);
      await socket.leave(room(roundId));
      await broadcastPresence(roundId);
    });

    socket.on("presence:focus", async (msg) => {
      const roundId = msg?.roundId;
      if (typeof roundId !== "string") return;
      const membershipId = socket.data.rounds.get(roundId);
      if (!membershipId) return; // must have joined (and been authorized) first
      const membership = await prisma.membership.findUnique({ where: { id: membershipId } });
      if (!membership || !can({ membershipId, role: membership.role }, { type: "presence:send" })) return;
      socket.data.focus.set(roundId, typeof msg.applicationId === "string" ? msg.applicationId : null);
      await broadcastPresence(roundId);
    });

    socket.on("disconnecting", () => {
      const rounds = [...socket.data.rounds.keys()];
      setImmediate(() => rounds.forEach((r) => track(broadcastPresence(r))));
    });
  });

  return Object.assign(io, {
    /** Resolves once pushes already in progress have finished (graceful shutdown, tests). */
    drain: () => Promise.all([...inFlight]).then(() => undefined),
  });
}
