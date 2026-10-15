/**
 * Every permission decision in the API goes through `can`. Express routes and
 * Socket.IO handlers both call it, so the HTTP and realtime paths can't drift
 * apart. It's a pure function of the caller's membership and the target, which
 * keeps it trivially unit-testable.
 */
import type { Role } from "./db.js";

export interface Actor {
  membershipId: string;
  role: Role;
}

export type Action =
  | { type: "round:view" }
  | { type: "round:viewAudit" }
  | { type: "curve:view"; authorId: string; isShared: boolean }
  | { type: "curve:edit"; authorId: string }
  | { type: "trust:view"; funderId: string }
  | { type: "trust:edit"; funderId: string }
  | { type: "allocation:view" }
  | { type: "snapshot:create" }
  | { type: "members:manage" }
  | { type: "presence:send" };

export function can(actor: Actor, action: Action): boolean {
  const { role, membershipId } = actor;
  switch (action.type) {
    case "round:view":
    case "allocation:view":
    case "presence:send":
      return true; // any member of the round
    case "round:viewAudit":
      return role === "OWNER";
    case "curve:view":
      // Your own drafts are yours. Shared curves are visible to everyone who
      // takes part in the decision; observers only see results.
      if (action.authorId === membershipId) return true;
      return action.isShared && role !== "OBSERVER";
    case "curve:edit":
      return role === "RECOMMENDER" && action.authorId === membershipId;
    case "trust:view":
      return role === "OWNER" || action.funderId === membershipId;
    case "trust:edit":
      return role === "FUNDER" && action.funderId === membershipId;
    case "snapshot:create":
      return role === "OWNER" || role === "FUNDER";
    case "members:manage":
      return role === "OWNER";
  }
}
