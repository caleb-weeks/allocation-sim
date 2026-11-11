import type { Metadata } from "next";
import { ArchitectureView } from "./_lib/ArchitectureView";
import { LATEST } from "./_lib/versions";

export const metadata: Metadata = {
  title: "Architecture",
  description: "Where each part of the allocation simulator runs, how data moves through it, how the hosting has changed, and a glossary of its terms.",
};

/** /architecture always shows the current version; /architecture/vN keeps each version at a stable link. */
export default function Architecture() {
  return <ArchitectureView version={LATEST} />;
}
