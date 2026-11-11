"""Build the Guatemala literacy demo scenario from the CONALFA CSV.

Each of Guatemala's 22 departments becomes one "application": a proposal to
expand a youth and adult literacy program there. The data sets the *scale*
(how many people a program could reach) and the *need* (illiteracy rates).
The program economics are explicit, adjustable assumptions — this scenario is
an illustration, not funding advice.

Marginal values are in "learners reached per $1,000", optionally need-weighted.
Input: pipeline/data/conalfa-2023.csv (from pipeline.extract_conalfa).
"""

from __future__ import annotations

import csv
from pathlib import Path

IN_CSV = Path(__file__).parent.parent / "data" / "conalfa-2023.csv"

ASSUMPTIONS = {
    "cost_per_learner_usd": 100,
    "reach_fraction_per_round": 0.02,
    "hardest_to_reach_cost_multiple": 2.5,
    "note": (
        "Illustrative program economics, not sourced estimates: about $100 per learner who "
        "completes a course, a single round can enrol at most 2% of a department's "
        "illiterate population, and the last learners reached cost 2.5x the first."
    ),
}

FUNDERS = [
    {"id": "funder-north", "name": "North Star Fund", "budget": 1_000_000,
     "trust": {"rec-reach": 1, "rec-equity": 2, "rec-gender": 1}},
    {"id": "funder-river", "name": "River Trust", "budget": 500_000,
     "trust": {"rec-reach": 2, "rec-equity": 1, "rec-gender": 0.5}},
]

RECOMMENDERS = [
    {"id": "rec-reach", "name": "Reach", "lens": "Every learner counts the same; go where the most people can be reached."},
    {"id": "rec-equity", "name": "Equity", "lens": "Weight by how far a department's illiteracy rate is above the national rate."},
    {"id": "rec-gender", "name": "Gender gap", "lens": "Weight by female illiteracy, where gaps are largest."},
]


def slug(name: str) -> str:
    table = str.maketrans("áéíóúñ", "aeioun")
    return name.lower().translate(table).replace(" ", "-")


def declining_curve(m0: float, cap: float) -> dict:
    """Value per $1k starts at m0 and falls as the cheapest-to-reach learners are enrolled first."""
    end = m0 / ASSUMPTIONS["hardest_to_reach_cost_multiple"]
    mid = m0 - (m0 - end) * 0.35  # most of the drop comes late
    return {"points": [{"x": 0, "m": round(m0, 4)}, {"x": round(cap * 0.5), "m": round(mid, 4)}, {"x": round(cap), "m": round(end, 4)}]}


def build() -> dict:
    with IN_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    national_rate = sum(int(r["illiterate"]) for r in rows) / sum(int(r["population_15plus"]) for r in rows)
    national_female = sum(int(r["female_illiterate"]) for r in rows) / sum(int(r["female_population_15plus"]) for r in rows)
    learners_per_k = 1000 / ASSUMPTIONS["cost_per_learner_usd"]

    applications, curves = [], {r["id"]: {} for r in RECOMMENDERS}
    for r in rows:
        app_id = slug(r["department"])
        illiterate = int(r["illiterate"])
        cap = illiterate * ASSUMPTIONS["reach_fraction_per_round"] * ASSUMPTIONS["cost_per_learner_usd"]
        rate = float(r["illiterate_pct"]) / 100
        female_rate = float(r["female_illiterate_pct"]) / 100
        applications.append({
            "id": app_id,
            "name": r["department"],
            "cap": round(cap),
            "data": {
                "facts": [
                    {"label": "Illiterate, age 15+", "value": f"{illiterate:,}"},
                    {"label": "Illiteracy rate", "value": f"{rate * 100:.1f}%"},
                    {"label": "Female illiteracy rate", "value": f"{female_rate * 100:.1f}%"},
                ],
                "department": r["department"],
                "illiterate_15plus": illiterate,
                "illiteracy_rate": rate,
                "female_illiteracy_rate": female_rate,
                "population_15plus": int(r["population_15plus"]),
            },
        })
        curves["rec-reach"][app_id] = declining_curve(learners_per_k, cap)
        curves["rec-equity"][app_id] = declining_curve(learners_per_k * (rate / national_rate) ** 2, cap)
        curves["rec-gender"][app_id] = declining_curve(learners_per_k * (female_rate / national_female) ** 2, cap)

    return {
        "id": "guatemala-literacy",
        "title": "Guatemala literacy programs, by department",
        "summary": (
            "Youth and adult literacy programs in Guatemala's 22 departments, sized from CONALFA's 2023 "
            "projection of illiteracy by department and sex. Program costs are illustrative assumptions."
        ),
        "valueUnit": "learners reached per $1,000 (need-weighted)",
        "sources": [{
            "name": "CONALFA — Proyección de población alfabeta y analfabeta de 15 años y más, 2023",
            "url": "https://www.conalfa.edu.gt/data/proyeccion2023.pdf",
        }],
        "assumptions": ASSUMPTIONS,
        "applications": applications,
        "recommenders": RECOMMENDERS,
        "funders": FUNDERS,
        "curves": curves,
    }
