import type { ReactNode } from "react";

/** The parts of the architecture page that depend on where things are hosted. */
export type HostingContent = {
  apiSummary: string;
  architectureIntro: string;
  architectureSvg: string;
  /** <Note> items appended after the shared "one process, two protocols" note. */
  notes: ReactNode;
  shipSvg: string;
  shipCaption: ReactNode;
};
