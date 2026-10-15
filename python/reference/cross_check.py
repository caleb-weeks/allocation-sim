"""Generate random scenarios plus reference answers for the TypeScript engine to replay.

    python -m reference.cross_check            # rewrite the fixture
    python -m reference.cross_check --check    # fail if the committed fixture is stale
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

from reference.solvers import pooled, round_robin

FIXTURE = Path(__file__).resolve().parents[2] / "packages" / "engine" / "test" / "fixtures" / "cross-check.json"
SEED = 20261013
CASES = 40
STEP = 500.0


def random_curve(rng: random.Random) -> dict:
    m = round(rng.uniform(0.5, 10), 3)
    x = 0
    points = [{"x": 0, "m": m}]
    for _ in range(rng.randint(0, 4)):
        x += rng.randint(1, 40) * 1000
        m = round(m * rng.uniform(0, 1), 3)
        points.append({"x": x, "m": m})
    if rng.random() < 0.5:
        points.append({"x": x + rng.randint(1, 20) * 1000, "m": 0})
    return {"points": points}


def random_scenario(rng: random.Random) -> dict:
    apps = [{"id": f"a{i}", "name": f"App {i}", "cap": rng.randint(5, 150) * 1000} for i in range(rng.randint(2, 7))]
    recs = [{"id": f"r{i}", "name": f"Rec {i}"} for i in range(rng.randint(1, 3))]
    funders = [
        {
            "id": f"f{i}",
            "name": f"Funder {i}",
            "budget": rng.randint(10, 400) * 1000,
            "trust": {r["id"]: rng.choice([0, 0.5, 1, 2, 3]) for r in recs},
        }
        for i in range(rng.randint(1, 2))
    ]
    curves = {r["id"]: {a["id"]: random_curve(rng) for a in apps if rng.random() < 0.85} for r in recs}
    return {"applications": apps, "recommenders": recs, "funders": funders, "curves": curves}


def build() -> dict:
    rng = random.Random(SEED)
    cases = []
    for _ in range(CASES):
        s = random_scenario(rng)
        cases.append({"scenario": s, "step": STEP, "expected": {"roundRobin": round_robin(s, STEP), "pooled": pooled(s)}})
    return {"generatedBy": "python -m reference.cross_check", "seed": SEED, "cases": cases}


def main() -> None:
    text = json.dumps(build(), indent=1) + "\n"
    if "--check" in sys.argv:
        if not FIXTURE.exists() or FIXTURE.read_text() != text:
            sys.exit(f"{FIXTURE} is stale; run python -m reference.cross_check")
        print("cross-check fixture is up to date")
        return
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text)
    print(f"wrote {CASES} cases to {FIXTURE}")


if __name__ == "__main__":
    main()
