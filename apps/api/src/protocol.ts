/**
 * Wire types shared by the API and the web app. Kept free of Prisma and
 * server-only imports so the web app can import it as types.
 */
import type { AllocationResult, CurvePoint } from "@allocation-sim/engine";

export type Role = "OWNER" | "FUNDER" | "RECOMMENDER" | "OBSERVER";
export type Method = "roundRobin" | "pooled";

export interface RoundView {
  round: {
    id: string;
    key: string | null;
    title: string;
    valueUnit: string;
    sources: unknown;
    assumptions: unknown;
  };
  me: { membershipId: string; role: Role; displayName: string };
  members: { id: string; role: Role; displayName: string; userName: string; budget: number | null; lens: string | null }[];
  applications: { id: string; key: string; name: string; cap: number; data: unknown }[];
  /** Only the curves this member may see: their own (drafts included) plus shared ones, unless they're an observer. */
  curves: {
    id: string;
    recommenderId: string;
    applicationId: string;
    points: CurvePoint[];
    isShared: boolean;
    version: number;
    updatedAt: string | Date;
  }[];
  /** Only the trust rows this member may see (their own as a funder; all of them as owner). */
  trust: { funderId: string; recommenderId: string; weight: number }[];
  /** Dollars each recommender directs. Enough to preview allocations locally without seeing trust. */
  pools: Record<string, number>;
  /** Round-robin step used for official results. */
  step: number;
  /** Official results, computed from shared curves only. */
  allocations: Record<Method, AllocationResult>;
  permissions: { viewAudit: boolean; createSnapshot: boolean; manageMembers: boolean };
}

export interface Presence {
  roundId: string;
  people: { membershipId: string; name: string; focus: string | null }[];
}

export interface ServerToClientEvents {
  "round:state": (view: RoundView) => void;
  "round:removed": (msg: { roundId: string }) => void;
  presence: (msg: Presence) => void;
}

export interface ClientToServerEvents {
  "round:join": (roundId: string, ack: (res: { ok: boolean; error?: string }) => void) => void;
  "round:leave": (roundId: string) => void;
  "presence:focus": (msg: { roundId: string; applicationId: string | null }) => void;
}
