import { readFileSync } from "node:fs";
import type { Curve } from "@allocation-sim/engine";

/** Scenario files produced by the Python pipeline (python -m pipeline.build_seed). */
export interface ScenarioTemplate {
  id: string;
  title: string;
  valueUnit: string;
  sources: { name: string; url: string }[];
  assumptions: Record<string, unknown>;
  applications: { id: string; name: string; cap: number; data: Record<string, unknown> }[];
  recommenders: { id: string; name: string; lens: string }[];
  funders: { id: string; name: string; budget: number; trust: Record<string, number> }[];
  curves: Record<string, Record<string, Curve>>;
}

const DATA_DIR = process.env.SCENARIO_DIR ? new URL(`file://${process.env.SCENARIO_DIR}/`) : new URL("../../../data/", import.meta.url);

export const TEMPLATE_IDS = ["guatemala-literacy"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export function loadTemplate(id: TemplateId): ScenarioTemplate {
  return JSON.parse(readFileSync(new URL(`${id}.json`, DATA_DIR), "utf8")) as ScenarioTemplate;
}
