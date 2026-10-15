# Allocation Simulator

Split a shared budget across many evaluators' judgments, live and together.

Recommenders draw **marginal value curves**: how much each extra dollar to each
program is worth to them. Funders decide how much to **trust** each
recommender. The simulator turns that into grants with two algorithms (an
S-process-style round-robin and exact water-filling), shows where they
disagree, and answers "what if we didn't have this recommender?". Everyone in a
round sees changes in real time, and each person sees only what their role
allows.

The demo scenario uses CONALFA's 2023 literacy data for Guatemala's 22
departments. The program costs are explicit, illustrative assumptions.

- **Live demo:** _TBD (one-click demo personas, no signup)_
- **The math:** [docs/math.md](docs/math.md)

## What's in here

```
packages/engine   TypeScript allocation engine: curves, round-robin, water-filling, counterfactuals
apps/api          Express + Socket.IO + Prisma/Postgres: auth, roles, audit log, realtime
apps/web          Next.js + Tailwind: curve editor, allocation charts, live preview
python/pipeline   Source data → scenario (CONALFA PDF → CSV → data/guatemala-literacy.json)
python/reference  Independent NumPy implementation that the TS engine is cross-checked against
infra/            GCP VM provisioning, systemd, Caddy, deploy/backup/demo-reset scripts
docs/math.md      The model, both algorithms, convergence results, and how it's tested
```

## Design notes

**Correctness of the math.** Property-based tests (fast-check, Hypothesis)
check budget conservation, caps, optimality (KKT) conditions, monotonicity, and
convergence. A second, independent Python implementation generates fixtures the
TypeScript engine must match. See [docs/math.md §6](docs/math.md#6-how-the-implementation-is-checked).

**Roles and access control.** Each round has Owners, Funders, Recommenders, and
Observers. One pure function, `can(actor, action)` in
[`apps/api/src/authz.ts`](apps/api/src/authz.ts), makes every permission
decision for both the HTTP routes and the Socket.IO events, and a matrix test
covers every role × action.

- A recommender's curves stay **private drafts** until shared, and only shared
  curves count toward results.
- **Trust weights** are visible only to their funder and the owner. Others get
  per-recommender totals, which turn out to be enough to preview allocations
  exactly ([docs/math.md §7](docs/math.md#7-preview-without-leaking-trust)).
- **Observers** see results, never curves.
- Realtime pushes are **re-filtered per socket on every change**. Someone
  removed from a round stops receiving updates immediately.
- Non-members get 404s, not 403s, so round ids can't be probed.

**Data integrity.**
- Every mutation and its **audit event** are written in one transaction.
- **Role changes** delete the old role's curves and trust in the same transaction.
- A Postgres **`CHECK` constraint** validates curve shape even if the API is bypassed.
- **Optimistic versioning** turns concurrent curve edits into a 409 instead of a silent overwrite.

**Security basics.**
- Passwords are hashed with argon2id.
- Session tokens are 256-bit random values, stored only as SHA-256 hashes and sent as `HttpOnly`, `SameSite=Lax` cookies.
- Unsafe methods require an allowed `Origin` header.
- Auth endpoints are rate-limited.
- Sentry is configured *not* to collect bodies, cookies, or user info.

## Running locally

Requires Node 22, Python 3.12+, and Postgres.

```bash
npm install -g pnpm@10   # or prefix each pnpm command with `npx pnpm@10`
pnpm install

# database
createdb allocation_sim && createdb allocation_sim_test
cp apps/api/.env.example apps/api/.env          # set DATABASE_URL
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @allocation-sim/engine build
pnpm --filter @allocation-sim/api exec prisma migrate deploy
pnpm --filter @allocation-sim/api demo:reset    # seed the demo round

pnpm dev:api    # http://localhost:4000
pnpm dev:web    # http://localhost:3000
```

Tests:

```bash
pnpm test                                   # engine, API (uses allocation_sim_test), web
cd python && python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q
.venv/bin/python -m reference.cross_check --check
```

Rebuilding the data (needs poppler's `pdftotext`):

```bash
cd python
.venv/bin/python -m pipeline.extract_conalfa   # PDF → pipeline/data/conalfa-2023.csv
.venv/bin/python -m pipeline.build_seed        # CSV → data/guatemala-literacy.json
.venv/bin/python -m reference.cross_check      # regenerate engine fixtures if solvers change
```

## Deployment

- **Web:** Vercel, via its GitLab integration. Root directory `apps/web`; set `NEXT_PUBLIC_API_URL`.
- **API:** a GCP e2-micro VM (free tier) running Node under systemd behind Caddy (automatic TLS), with Postgres on the same VM.
  - `infra/gcp/provision.sh` creates the VM.
  - `infra/vm/setup.sh` bootstraps it.
  - GitLab CI's manual `deploy-api` job runs `infra/vm/deploy.sh` over SSH (pull, build, migrate, restart, health check).
- **Cron:**
  - nightly `pg_dump` with 14-day retention, and the dump is verified readable;
  - nightly demo reset.
- **Cookies:** serve the web app at `example.org` and the API at `api.example.org`, and set `COOKIE_DOMAIN=.example.org` so the session cookie is same-site.

## Data and attribution

Literacy figures: CONALFA, *Proyección de población alfabeta y analfabeta de 15
años y más según departamento, por sexo, año 2023*, based on INE's 2018 census
and projections. The cost-per-learner, reach-per-round, and cost-escalation
figures are illustrative assumptions, labeled as such in the app. Nothing here
is funding advice or affiliated with any organization named.

The allocation mechanism is modeled on the public description of the Survival
and Flourishing Fund's S-process. This is an independent implementation.
