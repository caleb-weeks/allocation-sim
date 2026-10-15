const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** $1.2M, $45K, $800. Rounds float dust (e.g. -5e-11) to zero. */
export function money(n: number): string {
  const v = Math.abs(n) < 0.5 ? 0 : n;
  return `${v < 0 ? "−" : ""}$${compact.format(Math.abs(v))}`;
}

export function moneyExact(n: number): string {
  return `$${whole.format(Math.abs(n) < 0.5 ? 0 : n)}`;
}

/** Signed money for deltas: +$12K / −$4K / $0. */
export function signedMoney(n: number): string {
  if (Math.abs(n) < 500) return "$0";
  return `${n > 0 ? "+" : "−"}$${compact.format(Math.abs(n))}`;
}

export function num(n: number, digits = 2): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export const ROLE_LABEL = { OWNER: "Owner", FUNDER: "Funder", RECOMMENDER: "Recommender", OBSERVER: "Observer" } as const;
