// Sample projects, read from the repo's data/*.json at build time (server components only), so the
// landing and sample pages are static and don't wait on the API waking up.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Display order. Keep in sync with TEMPLATE_IDS in apps/api/src/templates.ts. */
const SAMPLE_IDS = [
  "global-health",
  "open-source-infrastructure",
  "disaster-resilience",
  "childhood-vaccination",
  "guatemala-literacy",
] as const;

export type SampleId = (typeof SAMPLE_IDS)[number];

interface ScenarioFile {
  id: string;
  title: string;
  summary: string;
  valueUnit: string;
  sources: { name: string; url: string }[];
  assumptions: { note?: string };
  applications: { id: string; name: string; cap: number }[];
  recommenders: { id: string; name: string; lens: string }[];
  funders: { id: string; name: string; budget: number }[];
}

export interface Sample {
  id: SampleId;
  title: string;
  summary: string;
  valueUnit: string;
  sources: { name: string; url: string }[];
  assumptionsNote: string | null;
  applications: { name: string; cap: number }[];
  recommenders: { name: string; lens: string }[];
  funders: { name: string; budget: number }[];
  totalCaps: number;
  totalBudget: number;
}

// next build and next dev both run from apps/web.
const DATA_DIR = path.join(process.cwd(), "..", "..", "data");

function load(id: SampleId): Sample | null {
  const file = path.join(DATA_DIR, `${id}.json`);
  if (!existsSync(file)) return null;
  const s = JSON.parse(readFileSync(file, "utf8")) as ScenarioFile;
  return {
    id,
    title: s.title,
    summary: s.summary,
    valueUnit: s.valueUnit,
    sources: s.sources,
    assumptionsNote: s.assumptions.note ?? null,
    applications: s.applications.map((a) => ({ name: a.name, cap: a.cap })),
    recommenders: s.recommenders.map((r) => ({ name: r.name, lens: r.lens })),
    funders: s.funders.map((f) => ({ name: f.name, budget: f.budget })),
    totalCaps: s.applications.reduce((n, a) => n + a.cap, 0),
    totalBudget: s.funders.reduce((n, f) => n + f.budget, 0),
  };
}

export function getSamples(): Sample[] {
  return SAMPLE_IDS.map(load).filter((s): s is Sample => s !== null);
}

export function getSample(id: string): Sample | null {
  return (SAMPLE_IDS as readonly string[]).includes(id) ? load(id as SampleId) : null;
}
