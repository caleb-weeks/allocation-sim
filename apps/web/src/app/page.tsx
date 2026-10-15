import Link from "next/link";
import { DemoPicker } from "@/components/DemoPicker";

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="max-w-3xl space-y-4 pt-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Decide together how to split a budget.</h1>
        <p className="text-lg text-ink-2">
          Recommenders draw how much each extra dollar to each program is worth to them. Funders choose how much to trust
          each recommender. The simulator turns that into an allocation, live, and shows what would change without any
          one voice.
        </p>
        <p className="text-ink-2">
          The demo uses 2023 literacy data for Guatemala&apos;s 22 departments from CONALFA. The program costs are
          illustrative assumptions.{" "}
          <Link href="/how-it-works" className="underline underline-offset-2 hover:text-ink">
            How the math works
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Try it as…</h2>
          <p className="text-sm text-ink-2">
            One click, no account. Everyone shares one demo round, and it resets every night. Open two roles in two
            browsers to watch changes sync.
          </p>
        </div>
        <DemoPicker />
      </section>

      <section className="text-sm text-ink-2">
        <Link href="/register" className="underline underline-offset-2 hover:text-ink">
          Create an account
        </Link>{" "}
        to start your own round and invite people into it.
      </section>
    </div>
  );
}
