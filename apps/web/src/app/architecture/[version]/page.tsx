import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArchitectureView } from "../_lib/ArchitectureView";
import { LATEST, isVersion, versionIds, versions } from "../_lib/versions";

export const dynamicParams = false;

export function generateStaticParams() {
  return versionIds.map((version) => ({ version }));
}

type Props = { params: Promise<{ version: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { version } = await params;
  if (!isVersion(version)) return {};
  return {
    title: `Architecture ${version} · ${versions[version].name}`,
    description: `How the allocation simulator was built and hosted in ${version} (${versions[version].period}).`,
    alternates: version === LATEST ? { canonical: "/architecture" } : undefined,
  };
}

export default async function ArchitectureVersion({ params }: Props) {
  const { version } = await params;
  if (!isVersion(version)) notFound();
  return <ArchitectureView version={version} />;
}
