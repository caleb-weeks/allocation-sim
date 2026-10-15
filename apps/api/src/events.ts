import { EventEmitter } from "node:events";

/** Routes announce changes here; the realtime layer pushes fresh, per-member state. */
export const roundEvents = new EventEmitter();

export function notifyRoundChanged(roundId: string): void {
  roundEvents.emit("changed", roundId);
}
