// Glossary for the architecture page. Most terms are the same in every hosting version; the
// hosting group and two definitions that mention where things run differ between v1 and v2.
import type { ArchVersionId } from "./versions";

type Term = [term: string, definition: string, where: string | null];
export type GlossaryGroup = { id: string; title: string; terms: Term[] };

type VersionTerms = {
  demoReset: Term;
  migration: Term;
  hosting: Term[];
  demoData: Term[];
  /** Replacements for shared terms whose examples quote this version's demo data. */
  overrides?: Term[];
};

const byVersion: Record<ArchVersionId, VersionTerms> = {
  v1: {
    demoReset: ["Demo reset", "Rebuilds the demo round from the scenario file, undoing visitors' edits. Runs nightly at 03:30 on the server.", "pnpm demo:reset"],
    migration: ["Migration", "A versioned SQL file that changes the database schema. prisma migrate deploy applies any new ones on every deploy.", "prisma/migrations"],
    hosting: [
      ["Vercel", "Hosts the Next.js web app at allocation.calebweeks.com on the free Hobby plan, rebuilding on every push to main.", null],
      ["e2-micro", "Google Cloud's smallest VM, part of its free tier. Runs the API, Caddy and Postgres. The only charge is about $3.60/month for its public IPv4 address.", "infra/gcp/provision.sh"],
      ["Caddy", "The web server in front of the API. It gets and renews the HTTPS certificate from Let's Encrypt automatically and forwards requests to Node on port 4000.", "infra/vm/Caddyfile"],
      ["systemd", "Linux's service manager. Keeps the API running, restarts it if it crashes, and limits what it can touch on disk.", "infra/vm/allocation-api.service"],
      ["cron", "Runs scheduled jobs on the VM: a database backup at 03:15 and the demo reset at 03:30.", "infra/vm/allocation.cron"],
      ["pg_dump", "Postgres's backup tool. The nightly job keeps 14 dumps and checks each one is readable.", "infra/vm/backup.sh"],
      ["deploy.sh", "Updates the API on the VM: pull main, install, build, migrate, restart, then wait up to 20 seconds for the health check.", "infra/vm/deploy.sh"],
      ["Health check", "GET /health on the API, which returns {\"ok\":true} when the server is up.", "app.ts"],
      ["GitHub Actions", "Runs CI on every push (typecheck, engine and web tests, Python tests, API tests against a real Postgres) and the manual Deploy API workflow.", ".github/workflows"],
      ["DNS records", "At Hover: allocation is a CNAME pointing to Vercel; api is an A record pointing to the VM's static IP, 34.29.103.145.", null],
      ["Static IP", "A reserved public address that survives VM restarts, so the api DNS record never goes stale.", "provision.sh"],
    ],
    demoData: [
      ["CONALFA", "Guatemala's National Literacy Committee. Its 2023 projection, based on the 2018 census, gives literate and illiterate population aged 15 and over by department and sex.", "python/pipeline/raw"],
      ["Department", "One of Guatemala's 22 top-level administrative regions, such as Alta Verapaz or Quiché.", null],
      ["Illiteracy rate", "The share of people aged 15 and over who can't read and write. The Equity and Gender gap lenses weight curves by how far a department's rate is above the national rate.", null],
      ["Program assumptions", "The illustrative economics behind the demo, not sourced estimates: about $100 per learner, at most 2% of a department's illiterate population reached per round, and the last learners costing 2.5× the first.", "ASSUMPTIONS in build_seed.py"],
    ],
  },
  v2: {
    demoReset: ["Demo reset", "Rebuilds every sample's demo round from its scenario file, undoing visitors' edits. Runs nightly at 03:30 UTC from GitHub Actions.", ".github/workflows/demo-reset.yml"],
    migration: ["Migration", "A versioned SQL file that changes the database schema. prisma migrate deploy applies any new ones at the end of every Render build.", "prisma/migrations"],
    hosting: [
      ["Render", "Hosts the API on its free plan: it builds from main once CI passes, terminates HTTPS for api.calebweeks.com, and runs one Node process. It sleeps after 15 minutes without traffic.", "render.yaml"],
      ["Blueprint", "Render's configuration-as-code file. render.yaml declares the service, its build and start commands, health check, custom domain and environment variables.", "render.yaml"],
      ["Cold start", "The wait, up to about a minute, while a sleeping free instance starts again. Every page pings /health on load, which starts the wake-up early, and shows a \"Waking up the demo server\" notice if it's slow.", "ServerWaking.tsx"],
      ["Neon", "Hosts Postgres 17 on its free plan. The database suspends after 5 minutes idle and resumes on the next query, adding about a second. It keeps 6 hours of history for point-in-time restore.", null],
      ["Vercel", "Hosts the Next.js web app at allocation.calebweeks.com on the free Hobby plan, rebuilding on every push to main.", null],
      ["Health check", "GET /health on the API, which returns {\"ok\":true} when the server is up.", "app.ts"],
      ["GitHub Actions", "Runs CI on every push (typecheck, engine and web tests, Python tests, API tests against a real Postgres) and the nightly demo reset.", ".github/workflows"],
      ["DNS records", "At Hover: allocation is a CNAME pointing to Vercel, and api is a CNAME pointing to the Render service.", null],
    ],
    demoData: [
      ["Sample project", "One of the ready-made scenarios on the landing page, each built from public data with three recommenders who see it differently: GiveWell global health, open-source infrastructure, US disaster mitigation, childhood vaccination, and Guatemala literacy.", "data/*.json"],
      ["Scenario file", "A sample's applications, caps, curves, recommenders and funders as JSON, written by the Python pipeline and read by both the seed script and the web app's build.", "python -m pipeline.build_seed"],
      ["Scenario validator", "Checks every sample against what the app needs: valid curves (the database's rules), one persona per role slot, a budget that can't fund everything, and lenses whose top picks differ.", "python/pipeline/validate.py"],
      ["Persona slot", "Each sample's two funders and three recommenders map, in order, onto the same seven demo users, so one sign-in works across every sample's demo round.", "prisma/seed.ts"],
      ["Multiple of cash", "GiveWell's unit: 10× means a dollar there does ten times the good of a dollar given directly to a household through GiveDirectly. The global health sample uses GiveWell's 2021 estimates.", "global_health.py"],
      ["Funding gap", "How much more a charity's program could use, as GiveWell assessed it. It's the cap for each global health application.", "global-health.csv"],
      ["Direct dependents", "How many Debian packages name a project in their Depends field. The open-source sample's Reach lens uses it; it undercounts code used through npm or PyPI and transitive use.", "open-source-infrastructure.csv"],
      ["Maintainer fragility", "The open-source sample's lens for the xz-utils lesson: important projects that depend on very few active people, from one year of GitHub commits.", "open_source_infrastructure.py"],
      ["Expected annual loss", "FEMA's National Risk Index estimate of a county's average yearly losses from natural hazards, in dollars. It sizes each county's program in the disaster sample.", "disaster_resilience.py"],
      ["Benefit–cost ratio", "Dollars of future losses avoided per dollar of mitigation. The disaster sample uses the National Institute of Building Sciences' figures for federal grants (about 6:1 overall).", "disaster_resilience.py"],
      ["Zero-dose children", "Children who received no routine vaccines, measured as missing the first diphtheria-tetanus-pertussis dose (DTP1). WHO/UNICEF counted 13.5 million in 2025.", "childhood_vaccination.py"],
      ["DTP3 and MCV1 coverage", "The share of infants who got all three DTP doses, and their first measles dose. Low DTP3 signals a weak routine system; low MCV1 signals outbreak risk.", "childhood-vaccination.csv"],
      ["CONALFA", "Guatemala's National Literacy Committee. Its 2023 projection of illiteracy by department and sex, extracted from a PDF, is the source for the original sample.", "python/pipeline/raw"],
    ],
    overrides: [
      ["Application", "Anything that can receive a grant: a charity's program in one country, an open-source project, a county's mitigation program, or whatever an owner lists in their own round.", "Application table"],
      ["Cap", "The most an application can usefully absorb: GiveWell's funding gap in the global health sample, an explicit illustrative assumption in the others, or the owner's figure in their own round.", "Application.cap"],
      ["Value, V(x)", "The total value of granting x: the area under the marginal value curve up to x. Each sample has its own unit, such as multiples of cash or zero-dose children reached per $1,000.", "totalValue() in curve.ts"],
      ["Lens", "A recommender's stated point of view. Every sample has three that disagree, such as Reach, Coverage gap and Outbreak risk in the vaccination sample.", "Membership.lens"],
      ["Funder", "A person with a budget who decides how much to trust each recommender. Each sample has two, with fictional names.", "role FUNDER"],
      ["Pool (Pᵣ)", "The total a recommender directs, summed over every funder's delegation to them.", "poolsByRecommender() in state.ts"],
      ["Step (Δ)", "The dollars placed per round-robin turn: the budget ÷ 2,000, rounded to $100 (for example $25,000 for a $50M budget). Smaller steps get closer to the exact optimum.", "stepFor() in state.ts"],
      ["Round", "One allocation exercise: a set of applications plus the people taking part. Each sample has one shared demo round; signed-in users create their own.", "Round table"],
      ["Owner", "Runs the round. Sees all shared curves, every funder's trust, and the activity log, and can manage members (except in the demo rounds).", "role OWNER"],
      ["Demo persona", "One of the seven one-click sign-ins on a sample's page. The same seven users belong to every sample's demo round, in different roles' names.", "prisma/seed.ts"],
    ],
  },
};

export function glossaryFor(version: ArchVersionId): GlossaryGroup[] {
  const { demoReset: DEMO_RESET, migration: MIGRATION, hosting: HOSTING, demoData: DEMO_DATA, overrides = [] } = byVersion[version];
  const replaced = new Map(overrides.map((t) => [t[0], t]));
  const groups: GlossaryGroup[] = [
  {
    id: "g-model",
    title: "The allocation model",
    terms: [
      ["S-process", "The Survival and Flourishing Fund's grant mechanism: recommenders describe how much they value each application, funders decide how much to trust each recommender, and an algorithm turns that into grants. This app is an independent implementation built from the public description.", "docs/math.md"],
      ["Application", "Anything that can receive a grant. In the demo, each of Guatemala's 22 departments is one application: a proposed literacy program there.", "Application table"],
      ["Cap", "The most an application can usefully absorb. In the demo it's 2% of the department's illiterate population times $100 per learner.", "python/pipeline/build_seed.py"],
      ["Marginal value curve", "For one recommender and one application, how much the next dollar is worth once x dollars have been granted. Written m(x). It never goes up as x grows, which is how the model encodes diminishing returns.", "packages/engine/src/curve.ts"],
      ["Control points", "The (x, m) pairs a recommender drags to shape a curve. The curve is a straight line between points, starts at x = 0, and holds its last value after the final point.", "CurveEditor.tsx"],
      ["Value, V(x)", "The total value of granting x: the area under the marginal value curve up to x. In the demo the unit is learners reached per $1,000, need-weighted.", "totalValue() in curve.ts"],
      ["Diminishing returns", "Each extra dollar to the same place does a little less good than the one before. Mathematically, V is concave. Both algorithms rely on this property.", null],
      ["Recommender", "A person who evaluates the applications by drawing a marginal value curve for each one.", "role RECOMMENDER"],
      ["Lens", "A recommender's stated point of view. The demo has three: Reach (every learner counts the same), Equity (weight by how far a department's illiteracy rate is above the national rate) and Gender gap (weight by female illiteracy).", "Membership.lens"],
      ["Funder", "A person with a budget who decides how much to trust each recommender. The demo has North Star ($1M) and River ($500K).", "role FUNDER"],
      ["Trust weight", "How much one funder defers to one recommender, from 0 to 100. Only relative sizes matter: trusting two recommenders 1 and 2 splits the budget one-third and two-thirds.", "Trust table"],
      ["Delegation", "How a funder's budget is split among recommenders, in proportion to trust: D = B · w / Σw.", "delegation() in model.ts"],
      ["Pool (Pᵣ)", "The total a recommender directs, summed over every funder's delegation to them. In the demo: Reach $536K, Equity $643K, Gender gap $321K.", "poolsByRecommender() in state.ts"],
      ["Round-robin", "The S-process-style method. Recommenders take turns, each placing one step of money wherever they value the next dollar most, given what everyone has granted so far. A recommender stops when their pool is spent or nothing has positive value to them.", "roundRobin() in solvers.ts"],
      ["Step (Δ)", "The dollars placed per round-robin turn. The app uses the budget ÷ 2,000, rounded to $100 ($800 in the demo). Smaller steps get closer to the exact optimum.", "stepFor() in state.ts"],
      ["Pooled", "The alternative method. It blends all recommenders' curves into one, weighted by pool size, and finds the single best split of the whole budget.", "pooled() in solvers.ts"],
      ["Water-filling", "How the pooled method finds that split. Money flows to whichever application has the highest marginal value, until every funded application sits at the same level, like water settling.", "waterFill() in solvers.ts"],
      ["Water level (λ)", "The shared marginal value at which water-filling stops. Applications valued above λ are funded up to the point where their curve drops to λ, or to their cap.", null],
      ["Bisection", "How the TypeScript engine finds λ: repeatedly halve the range of possible levels until the funded total matches the budget. The Python reference solves it exactly instead.", null],
      ["Tie (flat segment)", "When a curve is flat exactly at the water level, many allocations are equally good. The solver splits the remaining dollars across tied stretches in proportion to their length.", null],
      ["KKT conditions", "The textbook conditions that prove an allocation is optimal for a concave objective with a budget. The property tests check that water-filling's output satisfies them.", "solvers.test.ts"],
      ["Convergence", "With one recommender, round-robin's total value approaches the pooled optimum as the step shrinks, and the gap shrinks with the square of the step: a 10× smaller step gives about a 100× smaller gap.", "docs/math.md §4"],
      ["Counterfactual", "The \"What if we didn't have…\" control: rerun the allocation without one recommender, with their funders' trust spread over the rest. It shows how much each person's judgment actually changes the outcome.", "withoutRecommender() in model.ts"],
      ["Unallocated", "Money left over because no curve values more funding anywhere. It stays with the funders.", null],
    ],
  },
  {
    id: "g-app",
    title: "In the app",
    terms: [
      ["Round", "One allocation exercise: a set of applications plus the people taking part. The demo has one shared round.", "Round table"],
      ["Membership", "A person's place in a round: their role, display name, and budget (for funders) or lens (for recommenders). Permissions come from the membership, not the user account.", "Membership table"],
      ["Owner", "Runs the round. Sees all shared curves, every funder's trust, and the activity log, and can manage members (except in the demo).", "role OWNER"],
      ["Observer", "Sees results and pool totals only, never anyone's curves or trust.", "role OBSERVER"],
      ["Draft curve", "A curve its author has saved but not shared. Only the author sees it, and it doesn't count toward the official result.", "Curve.isShared = false"],
      ["Shared curve", "A curve its author has published to the round. Funders, the owner and other recommenders can see it, and it counts toward the official result.", "POST …/share"],
      ["Official result", "The allocation the server computes from shared curves and real trust weights. Everyone sees the same grants.", "compute() in state.ts"],
      ["Preview", "A result the browser computes while you drag a curve or a trust slider, before anything is saved. Labeled \"Previewing your change\".", "apps/web/src/lib/preview.ts"],
      ["Synthetic funder", "The trick that makes previews exact without revealing trust: the browser invents one funder per recommender holding exactly that recommender's pool. Grants depend on trust only through the pools, so the result is identical.", "scenarioFromView()"],
      ["Snapshot (Saved results)", "A labeled copy of the current result, so a group can compare before and after a discussion. Owners and funders can save them.", "Snapshot table"],
      ["Audit event (Activity)", "A record of who changed what, written in the same database transaction as the change itself. Owners see it as Activity.", "AuditEvent table"],
      ["Presence", "Who is in the round right now, and which application each person is looking at (their focus).", "presence event"],
      ["Demo persona", "One of the seven one-click sign-ins on the landing page, each a member of the demo round with a different role.", "prisma/seed.ts"],
      DEMO_RESET,
    ],
  },
  {
    id: "g-code",
    title: "In the code",
    terms: [
      ["Engine", "The allocation math as a TypeScript package with no dependencies. The API uses it for official results and the browser bundles it for previews.", "packages/engine"],
      ["Scenario", "The engine's input: applications with caps, recommenders, funders with budgets and trust, and curves.", "model.ts"],
      ["RoundView", "Everything one member is allowed to see about a round, built for them by viewFor(). It's sent both as the REST response and over the socket.", "apps/api/src/protocol.ts"],
      ["viewFor()", "Builds a RoundView for one member, filtering curves and trust through can(). It runs once per connected member on every change.", "state.ts"],
      ["can()", "The single function that makes every permission decision, for both REST routes and socket events. It takes an actor (membership and role) and an action.", "apps/api/src/authz.ts"],
      ["Action", "One thing someone might try to do, such as curve:edit or trust:view, often with a target such as the curve's author.", "authz.ts"],
      ["authorize()", "The route helper that looks up the caller's membership and calls can(). Non-members get 404 rather than 403, so round ids can't be probed.", "routes/rounds.ts"],
      ["Optimistic versioning", "Each curve has a version number. A save sends the version it started from (expectedVersion); if someone saved in between, the server returns 409 instead of overwriting their work.", "PUT …/curves/:applicationId"],
      ["CHECK constraint", "A rule enforced by Postgres itself. curve_points_valid rejects malformed curves even if a code path skips the API's validation.", "prisma/migrations/*_init"],
      ["Session cookie (sid)", "A random 256-bit token, stored in the database only as its SHA-256 hash. The cookie is HttpOnly (scripts can't read it), Secure (HTTPS only), SameSite=Lax, host-only on api.calebweeks.com, and lasts 14 days.", "auth.ts"],
      ["Origin check", "Requests that change data must carry an Origin header naming the web app, which blocks forms on other sites from acting as you.", "checkOrigin() in auth.ts"],
      ["Room", "A Socket.IO channel per round (round:<id>). Joining requires membership; pushes go to everyone in the room, each with their own view.", "realtime.ts"],
      ["round:state", "The socket event that carries a fresh RoundView after any change. Others: round:join, round:leave, round:removed, presence, presence:focus.", "protocol.ts"],
      ["Property-based test", "A test that generates thousands of random inputs and checks a rule that must always hold, such as \"grants plus unallocated equals the budget\". Uses fast-check in TypeScript and Hypothesis in Python.", "packages/engine/test"],
      ["Python reference", "A second, independent implementation of the math using NumPy, which solves water-filling exactly. It exists to catch bugs in the TypeScript engine.", "python/reference/solvers.py"],
      ["Cross-check fixture", "40 random scenarios plus the Python reference's answers. The TypeScript engine must reproduce every answer to within a millionth of the budget.", "packages/engine/test/fixtures/cross-check.json"],
      ["Prisma", "The database toolkit: the schema file, generated TypeScript client, and migrations. Pinned to 7.10.", "apps/api/prisma"],
      MIGRATION,
      ["pnpm workspace", "One repository holding several packages (engine, api, web) that depend on each other, installed together.", "pnpm-workspace.yaml"],
    ],
  },
  {
    id: "g-infra",
    title: "Hosting and operations",
    terms: HOSTING,
  },
  {
    id: "g-data",
    title: "The demo data",
    terms: DEMO_DATA,
  },
];
  return groups.map((g) => ({ ...g, terms: g.terms.map((t) => replaced.get(t[0]) ?? t) }));
}
