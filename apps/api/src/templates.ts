import { existsSync, readFileSync } from "node:fs";
import type { Curve } from "@allocation-sim/engine";

/** Sample scenario files produced by the Python pipeline (python -m pipeline.build_seed). */
export interface ScenarioTemplate {
  id: string;
  title: string;
  summary: string;
  valueUnit: string;
  sources: { name: string; url: string }[];
  assumptions: Record<string, unknown>;
  applications: { id: string; name: string; cap: number; data: Record<string, unknown> }[];
  recommenders: { id: string; name: string; lens: string }[];
  funders: { id: string; name: string; budget: number; trust: Record<string, number> }[];
  curves: Record<string, Record<string, Curve>>;
}

const DATA_DIR = process.env.SCENARIO_DIR ? new URL(`file://${process.env.SCENARIO_DIR}/`) : new URL("../../../data/", import.meta.url);

/** Samples in the order the landing page shows them. Each needs a data/<id>.json. */
export const TEMPLATE_IDS = [
  "global-health",
  "open-source-infrastructure",
  "disaster-resilience",
  "childhood-vaccination",
  "guatemala-literacy",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const isTemplateId = (id: string): id is TemplateId => (TEMPLATE_IDS as readonly string[]).includes(id);

/** Samples whose data file exists (all of them in a complete checkout). */
export function availableTemplates(): TemplateId[] {
  return TEMPLATE_IDS.filter((id) => existsSync(new URL(`${id}.json`, DATA_DIR)));
}

export function loadTemplate(id: TemplateId): ScenarioTemplate {
  return JSON.parse(readFileSync(new URL(`${id}.json`, DATA_DIR), "utf8")) as ScenarioTemplate;
}

/** Each sample has one shared demo round, keyed by the sample id. */
export const demoRoundKey = (id: TemplateId) => `demo-${id}`;
export const isDemoRoundKey = (key: string | null | undefined) => !!key && key.startsWith("demo-");
