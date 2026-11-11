import type { Metadata } from "next";
import { NewRoundForm } from "@/components/NewRoundForm";
import { getSamples } from "@/lib/samples";

export const metadata: Metadata = { title: "Start your own round" };

export default function NewRoundPage() {
  const samples = getSamples().map((s) => ({ id: s.id, title: s.title, valueUnit: s.valueUnit, applications: s.applications }));
  return <NewRoundForm samples={samples} />;
}
