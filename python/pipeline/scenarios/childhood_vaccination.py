"""Build the childhood-vaccination demo scenario from the WUENIC zero-dose CSV.

Each of the 20 countries with the most "zero-dose" children in 2025 (surviving
infants who received no DTP1, the usual proxy for no routine vaccines at all)
becomes one "application": a proposal for outreach that finds and vaccinates
those children. The data sets the *scale* (zero-dose children per country) and
the *need* signals (DTP3 and measles MCV1 coverage). Program costs are explicit,
adjustable assumptions — this scenario is an illustration, not funding advice.

Marginal values are in "zero-dose children reached per $1,000", weighted by each
recommender's lens. Input: pipeline/data/childhood-vaccination.csv (from
pipeline.extract_childhood_vaccination).
"""

from __future__ import annotations

import csv
from pathlib import Path

IN_CSV = Path(__file__).parent.parent / "data" / "childhood-vaccination.csv"

ASSUMPTIONS = {
    "cost_per_child_first_usd": 50,
    "hardest_to_reach_cost_multiple": 2.5,
    "reach_fraction_per_round": 0.10,
    "reach_scale_exponent": 0.25,
    "need_weight_exponent": 2,
    "note": (
        "Illustrative program economics, not quoted costs. (1) The first zero-dose children a program "
        "reaches cost about $50 each and the hardest-to-reach cost 2.5x that (about $125); this brackets "
        "the $52-$129 per zero-dose child reached that a 2025 Ethiopia costing study (Afar and Somali "
        "regions) found for routine outreach and mobile health teams, though costs vary widely by "
        "setting and strategy. (2) Each country's cap is the budget to reach 10% of its 2025 zero-dose "
        "children at the first-child cost of $50; because later children cost more, a fully funded "
        "round reaches somewhat fewer. (3) Value per dollar falls along each curve as the easiest "
        "children are found first, with most of the drop late in the round. (4) Lens weights are "
        "recommender judgments, not data: Reach scales value by (zero-dose count / median count)^0.25, "
        "on the view that large concentrations of unreached children let fixed outreach costs go "
        "further; Coverage gap scales by (DTP3 gap / mean DTP3 gap)^2; Outbreak risk scales by "
        "(MCV1 gap / mean MCV1 gap)^2, where a gap is 100% minus coverage. (5) Countries are the 20 "
        "with the most zero-dose children in WUENIC 2025; coverage is WUENIC's national estimate, "
        "rounded to whole percent."
    ),
}

RECOMMENDERS = [
    {"id": "rec-reach", "name": "Reach",
     "lens": "Every child counts the same; go where the most zero-dose children are."},
    {"id": "rec-coverage-gap", "name": "Coverage gap",
     "lens": "Weight toward countries with the lowest DTP3 coverage, where routine systems are weakest."},
    {"id": "rec-outbreak", "name": "Outbreak risk",
     "lens": "Weight toward the lowest measles (MCV1) coverage, where outbreaks are most likely."},
]

FUNDERS = [
    {"id": "funder-meridian", "name": "Beacon Child Health Fund", "budget": 15_000_000,
     "trust": {"rec-reach": 60, "rec-coverage-gap": 30, "rec-outbreak": 40}},
    {"id": "funder-harbor", "name": "Northwind Foundation", "budget": 10_000_000,
     "trust": {"rec-reach": 20, "rec-coverage-gap": 50, "rec-outbreak": 70}},
]

# Short display names for WHO's official country names.
SHORT_NAMES = {
    "COD": "DR Congo",
    "TZA": "Tanzania",
    "VEN": "Venezuela",
}


def slug(name: str) -> str:
    return "".join(c if c.isalnum() else "-" for c in name.lower()).strip("-").replace("--", "-")


def compact(n: int) -> str:
    return f"{n / 1e6:.2f}M" if n >= 1_000_000 else f"{round(n / 1000):,}k"


def declining_curve(m0: float, cap: int) -> dict:
    """Value per $1k starts at m0 and falls as the easiest-to-find children are reached first."""
    end = m0 / ASSUMPTIONS["hardest_to_reach_cost_multiple"]
    mid = m0 - (m0 - end) * 0.35  # most of the drop comes late
    return {"points": [{"x": 0, "m": round(m0, 4)}, {"x": round(cap * 0.5), "m": round(mid, 4)}, {"x": cap, "m": round(end, 4)}]}


def build() -> dict:
    with IN_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    counts = sorted(int(r["zero_dose"]) for r in rows)
    median = (counts[len(counts) // 2 - 1] + counts[len(counts) // 2]) / 2 if len(counts) % 2 == 0 else counts[len(counts) // 2]
    mean_dtp3_gap = sum(100 - int(r["dtp3_pct"]) for r in rows) / len(rows)
    mean_mcv1_gap = sum(100 - int(r["mcv1_pct"]) for r in rows) / len(rows)
    children_per_k = 1000 / ASSUMPTIONS["cost_per_child_first_usd"]
    k = ASSUMPTIONS["need_weight_exponent"]

    applications, curves = [], {r["id"]: {} for r in RECOMMENDERS}
    for r in rows:
        country = SHORT_NAMES.get(r["iso3"], r["country"])
        app_id = slug(country)
        zero_dose = int(r["zero_dose"])
        dtp1, dtp3, mcv1 = int(r["dtp1_pct"]), int(r["dtp3_pct"]), int(r["mcv1_pct"])
        cap = round(zero_dose * ASSUMPTIONS["reach_fraction_per_round"] * ASSUMPTIONS["cost_per_child_first_usd"])
        applications.append({
            "id": app_id,
            "name": country,
            "cap": cap,
            "data": {
                "facts": [
                    {"label": f"Zero-dose children ({r['year']})", "value": compact(zero_dose)},
                    {"label": "DTP1 coverage", "value": f"{dtp1}%"},
                    {"label": "DTP3 coverage", "value": f"{dtp3}%"},
                    {"label": "Measles (MCV1) coverage", "value": f"{mcv1}%"},
                ],
                "country": r["country"],
                "iso3": r["iso3"],
                "whoRegion": r["who_region"],
                "year": int(r["year"]),
                "zeroDoseChildren": zero_dose,
                "dtp1Coverage": dtp1 / 100,
                "dtp3Coverage": dtp3 / 100,
                "mcv1Coverage": mcv1 / 100,
            },
        })
        reach_w = (zero_dose / median) ** ASSUMPTIONS["reach_scale_exponent"]
        curves["rec-reach"][app_id] = declining_curve(children_per_k * reach_w, cap)
        curves["rec-coverage-gap"][app_id] = declining_curve(children_per_k * ((100 - dtp3) / mean_dtp3_gap) ** k, cap)
        curves["rec-outbreak"][app_id] = declining_curve(children_per_k * ((100 - mcv1) / mean_mcv1_gap) ** k, cap)

    return {
        "id": "childhood-vaccination",
        "title": "Reaching zero-dose children, by country",
        "summary": (
            "Outreach to find and vaccinate \"zero-dose\" children, who got no routine vaccines, in the 20 "
            "countries where most of them live. Sized from WHO/UNICEF's 2025 national immunization coverage "
            "estimates (WUENIC): zero-dose counts, DTP3 and measles coverage. Program costs are illustrative "
            "assumptions."
        ),
        "valueUnit": "zero-dose children reached per $1,000 (lens-weighted)",
        "sources": [
            {"name": "WHO/UNICEF Estimates of National Immunization Coverage (WUENIC), 2025 revision — WHO Immunization Data portal",
             "url": "https://immunizationdata.who.int/"},
            {"name": "WHO — WUENIC overview and methods",
             "url": "https://www.who.int/teams/immunization-vaccines-and-biologicals/immunization-analysis-and-insights/global-monitoring/immunization-coverage/who-unicef-estimates-of-national-immunization-coverage"},
            {"name": "Immunization Economics — Ethiopia study of delivery cost per zero-dose child reached (2025)",
             "url": "https://immunizationeconomics.org/recent-activity/2025/11/26/ethiopia-study-finds-delivery-cost-per-zero-dose-child-reached-as-low-as-6-65/"},
        ],
        "assumptions": ASSUMPTIONS,
        "applications": applications,
        "recommenders": RECOMMENDERS,
        "funders": FUNDERS,
        "curves": curves,
    }
