"""Checks a scenario dict against what the app, the database and the demo need.

The curve rules mirror the database's curve_points_valid CHECK and the engine's validateCurve:
first point at x = 0, x strictly increasing, m >= 0 and non-increasing. The rest keep samples
usable as demos: three recommenders and two funders (one demo persona each), a budget that
can't fund everything, and lenses that actually disagree about what matters most.
"""

from __future__ import annotations

import re

SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


class ScenarioError(ValueError):
    pass


def _check(cond: bool, msg: str) -> None:
    if not cond:
        raise ScenarioError(msg)


def top_apps(curves: dict, n: int = 5) -> list[str]:
    return [a for a, _ in sorted(curves.items(), key=lambda kv: (-kv[1]["points"][0]["m"], kv[0]))[:n]]


def validate(s: dict) -> None:
    _check(SLUG.match(s.get("id", "")) is not None, "id must be a lowercase slug")
    for key, limit in (("title", 70), ("valueUnit", 60), ("summary", 400)):
        _check(isinstance(s.get(key), str) and 0 < len(s[key]) <= limit, f"{key} must be 1-{limit} characters")
    _check(isinstance(s.get("sources"), list) and len(s["sources"]) >= 1, "at least one source")
    for src in s["sources"]:
        _check(src.get("name") and str(src.get("url", "")).startswith("https://"), f"source needs a name and https url: {src}")
    _check(isinstance(s.get("assumptions"), dict) and isinstance(s["assumptions"].get("note"), str), "assumptions.note is required")

    apps = s.get("applications", [])
    _check(8 <= len(apps) <= 25, f"8-25 applications, got {len(apps)}")
    ids = [a["id"] for a in apps]
    _check(len(set(ids)) == len(ids) and all(SLUG.match(i) for i in ids), "application ids must be unique slugs")
    for a in apps:
        _check(isinstance(a.get("name"), str) and 0 < len(a["name"]) <= 60, f"{a['id']}: name must be 1-60 characters")
        _check(isinstance(a.get("cap"), int) and 0 < a["cap"] <= 50_000_000, f"{a['id']}: cap must be an int in (0, 50M]")
        facts = a.get("data", {}).get("facts")
        _check(isinstance(facts, list) and 1 <= len(facts) <= 4, f"{a['id']}: data.facts needs 1-4 items")
        for f in facts:
            _check(isinstance(f.get("label"), str) and isinstance(f.get("value"), str), f"{a['id']}: facts are {{label, value}} strings")

    recs = s.get("recommenders", [])
    _check(len(recs) == 3, "exactly 3 recommenders (one demo persona each)")
    rec_ids = {r["id"] for r in recs}
    for r in recs:
        _check(r.get("name") and len(r["name"]) <= 24 and r.get("lens") and len(r["lens"]) <= 160, f"{r.get('id')}: name <= 24, lens 1-160 chars")

    funders = s.get("funders", [])
    _check(len(funders) == 2, "exactly 2 funders (one demo persona each)")
    for f in funders:
        _check(isinstance(f.get("budget"), int) and f["budget"] > 0, f"{f['id']}: budget must be a positive int")
        _check(set(f.get("trust", {})) == rec_ids, f"{f['id']}: trust must cover exactly the recommenders")
        _check(all(0 <= w <= 100 for w in f["trust"].values()) and sum(f["trust"].values()) > 0, f"{f['id']}: trust weights in [0, 100], not all 0")

    total_caps = sum(a["cap"] for a in apps)
    budget = sum(f["budget"] for f in funders)
    _check(0.25 <= budget / total_caps <= 0.7, f"total budget should be 25-70% of total caps, is {budget / total_caps:.0%}")

    curves = s.get("curves", {})
    _check(set(curves) == rec_ids, "curves must be keyed by every recommender id")
    caps = {a["id"]: a["cap"] for a in apps}
    for rid, by_app in curves.items():
        _check(set(by_app) == set(caps), f"{rid}: needs a curve for every application")
        for aid, curve in by_app.items():
            pts = curve.get("points", [])
            where = f"curve {rid}/{aid}"
            _check(2 <= len(pts) <= 6, f"{where}: 2-6 points")
            _check(pts[0]["x"] == 0, f"{where}: first point at x = 0")
            _check(pts[-1]["x"] == caps[aid], f"{where}: last point at the cap")
            for p, q in zip(pts, pts[1:]):
                _check(q["x"] > p["x"], f"{where}: x strictly increasing")
                _check(q["m"] <= p["m"], f"{where}: m non-increasing")
            _check(all(p["m"] >= 0 for p in pts), f"{where}: m >= 0")
            _check(pts[0]["m"] > 0, f"{where}: first dollar must have positive value")

    tops = [set(top_apps(curves[r["id"]])) for r in recs]
    _check(len({frozenset(t) for t in tops}) >= 2, "recommenders' top-5 applications are identical; lenses must disagree")
