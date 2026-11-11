import type { ReactNode } from "react";

/** The parts of the architecture page that differ between versions (hosting, and which samples exist). */
export type HostingContent = {
  apiSummary: string;
  architectureIntro: string;
  architectureSvg: string;
  pipelineSvg: string;
  pipelineCaption: ReactNode;
  /** <Note> items appended after the shared "one process, two protocols" note. */
  notes: ReactNode;
  shipSvg: string;
  shipCaption: ReactNode;
};
