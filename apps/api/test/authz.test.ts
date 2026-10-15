import { describe, expect, it } from "vitest";
import { type Action, type Actor, can } from "../src/authz.js";

const me = "me";
const other = "other";
const roles = ["OWNER", "FUNDER", "RECOMMENDER", "OBSERVER"] as const;

// Expected permissions for every role. `self` targets the actor's own
// membership, `other` someone else's.
const matrix: { action: Action; allowed: Record<(typeof roles)[number], boolean> }[] = [
  { action: { type: "round:view" }, allowed: { OWNER: true, FUNDER: true, RECOMMENDER: true, OBSERVER: true } },
  { action: { type: "allocation:view" }, allowed: { OWNER: true, FUNDER: true, RECOMMENDER: true, OBSERVER: true } },
  { action: { type: "round:viewAudit" }, allowed: { OWNER: true, FUNDER: false, RECOMMENDER: false, OBSERVER: false } },
  { action: { type: "members:manage" }, allowed: { OWNER: true, FUNDER: false, RECOMMENDER: false, OBSERVER: false } },
  { action: { type: "snapshot:create" }, allowed: { OWNER: true, FUNDER: true, RECOMMENDER: false, OBSERVER: false } },
  // Curves
  { action: { type: "curve:view", authorId: me, isShared: false }, allowed: { OWNER: true, FUNDER: true, RECOMMENDER: true, OBSERVER: true } },
  { action: { type: "curve:view", authorId: other, isShared: false }, allowed: { OWNER: false, FUNDER: false, RECOMMENDER: false, OBSERVER: false } },
  { action: { type: "curve:view", authorId: other, isShared: true }, allowed: { OWNER: true, FUNDER: true, RECOMMENDER: true, OBSERVER: false } },
  { action: { type: "curve:edit", authorId: me }, allowed: { OWNER: false, FUNDER: false, RECOMMENDER: true, OBSERVER: false } },
  { action: { type: "curve:edit", authorId: other }, allowed: { OWNER: false, FUNDER: false, RECOMMENDER: false, OBSERVER: false } },
  // Trust
  { action: { type: "trust:view", funderId: me }, allowed: { OWNER: true, FUNDER: true, RECOMMENDER: true, OBSERVER: true } },
  { action: { type: "trust:view", funderId: other }, allowed: { OWNER: true, FUNDER: false, RECOMMENDER: false, OBSERVER: false } },
  { action: { type: "trust:edit", funderId: me }, allowed: { OWNER: false, FUNDER: true, RECOMMENDER: false, OBSERVER: false } },
  { action: { type: "trust:edit", funderId: other }, allowed: { OWNER: false, FUNDER: false, RECOMMENDER: false, OBSERVER: false } },
];

describe("authorization matrix", () => {
  for (const { action, allowed } of matrix) {
    for (const role of roles) {
      const target = "authorId" in action ? action.authorId : "funderId" in action ? action.funderId : "";
      it(`${role} ${allowed[role] ? "can" : "cannot"} ${action.type}${target ? ` (${target === me ? "own" : "other's"})` : ""}${"isShared" in action ? (action.isShared ? " shared" : " draft") : ""}`, () => {
        const actor: Actor = { membershipId: me, role };
        expect(can(actor, action)).toBe(allowed[role]);
      });
    }
  }
});
