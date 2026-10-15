"""Generate random scenarios plus reference answers for the TypeScript engine to replay.

    python -m reference.cross_check            # rewrite the fixture
    python -m reference.cross_check --check    # fail if the committed fixture is stale
"""

from __future__ import annotations

import json
import math
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


def first_difference(a, b, path: str = "$") -> str | None:
    """Where two JSON values differ, allowing last-bit float noise between platforms' NumPy builds."""
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        return None if math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9) else f"{path}: {a} != {b}"
    if type(a) is not type(b):
        return f"{path}: {type(a).__name__} != {type(b).__name__}"
    if isinstance(a, dict):
        if a.keys() != b.keys():
            return f"{path}: keys {sorted(a.keys() ^ b.keys())} differ"
        return next((d for k in a if (d := first_difference(a[k], b[k], f"{path}.{k}"))), None)
    if isinstance(a, list):
        if len(a) != len(b):
            return f"{path}: length {len(a)} != {len(b)}"
        return next((d for i, (x, y) in enumerate(zip(a, b)) if (d := first_difference(x, y, f"{path}[{i}]"))), None)
    return None if a == b else f"{path}: {a!r} != {b!r}"


def main() -> None:
    fixture = build()
    if "--check" in sys.argv:
        diff = first_difference(json.loads(FIXTURE.read_text()), fixture) if FIXTURE.exists() else "fixture missing"
        if diff:
            sys.exit(f"{FIXTURE} is stale ({diff}); run python -m reference.cross_check")
        print("cross-check fixture is up to date")
        return
    text = json.dumps(fixture, indent=1) + "\n"
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text)
    print(f"wrote {CASES} cases to {FIXTURE}")


if __name__ == "__main__":
    main()
