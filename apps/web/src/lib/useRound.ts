"use client";

import type { ClientToServerEvents, Presence, RoundView, ServerToClientEvents } from "@allocation-sim/api/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Socket, io } from "socket.io-client";
import { API_URL, ApiError, api } from "./api";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

export type Connection = "connecting" | "live" | "offline";

/**
 * A round's state, kept live over Socket.IO. The server pushes a fresh view
 * (already filtered for this member's role) whenever anything changes.
 */
export function useRound(roundId: string) {
  const [view, setView] = useState<RoundView | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [presence, setPresence] = useState<Presence["people"]>([]);
  const [connection, setConnection] = useState<Connection>("connecting");
  const socketRef = useRef<Client | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<RoundView>(`/rounds/${roundId}`)
      .then((v) => !cancelled && setView(v))
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { status: e.status, message: e.message } : { status: 0, message: "Couldn't reach the server" }));

    const socket: Client = io(API_URL, { withCredentials: true, transports: ["websocket", "polling"] });
    socketRef.current = socket;
    const join = () => {
      socket.emit("round:join", roundId, (res) => {
        if (res.ok) setConnection("live");
      });
    };
    socket.on("connect", join);
    socket.on("disconnect", () => setConnection("offline"));
    socket.on("connect_error", () => setConnection("offline"));
    socket.on("round:state", (v) => {
      if (v.round.id === roundId) setView(v);
    });
    socket.on("round:removed", (msg) => {
      if (msg.roundId === roundId) setError({ status: 404, message: "You're no longer a member of this round." });
    });
    socket.on("presence", (p) => {
      if (p.roundId === roundId) setPresence(p.people);
    });
    return () => {
      cancelled = true;
      socket.emit("round:leave", roundId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roundId]);

  const focus = useCallback(
    (applicationId: string | null) => socketRef.current?.emit("presence:focus", { roundId, applicationId }),
    [roundId],
  );

  return { view, error, presence, connection, focus };
}
