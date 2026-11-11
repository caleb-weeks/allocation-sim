// The hosting versions the architecture page documents. Add a version here, then a matching
// _versions/vN.tsx (its architecture diagram, ship sequence and hosting text) and glossary entry.

export type ArchVersionId = "v1" | "v2";

export type ArchVersionMeta = {
  id: ArchVersionId;
  name: string;
  period: string;
  cost: string;
  /** The repository as it was for this version. */
  codeHref: string;
  codeLabel: string;
};

export const LATEST: ArchVersionId = "v2";

export const versions: Record<ArchVersionId, ArchVersionMeta> = {
  v1: {
    id: "v1",
    name: "One GCP VM",
    period: "Nov 3 – Nov 11, 2026",
    cost: "≈ $3.60/month",
    codeHref: "https://github.com/caleb-weeks/allocation-sim/tree/infra-v1",
    codeLabel: "tag infra-v1",
  },
  v2: {
    id: "v2",
    name: "Render + Neon",
    period: "Since Nov 11, 2026",
    cost: "$0/month",
    codeHref: "https://github.com/caleb-weeks/allocation-sim",
    codeLabel: "main",
  },
};

export const versionIds = Object.keys(versions) as ArchVersionId[];

export const isVersion = (v: string): v is ArchVersionId => v in versions;
