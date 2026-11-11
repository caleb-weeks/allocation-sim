"""Build the global health demo scenario from GiveWell's funding gaps.

Each "application" is one funding gap GiveWell identified for a top charity,
by program and country (e.g. vitamin A supplementation in Cameroon by Helen
Keller International), capped at the size of that gap. The value of a dollar is
GiveWell's own cost-effectiveness estimate for the gap, in multiples of cash
transfers: 10x means GiveWell expects a dollar there to do ten times as much
good as a dollar given directly to a household in poverty via GiveDirectly.

GiveWell gives one estimate per gap. Here it is the *average* value over the
gap, with an illustrative within-gap decline (the first dollars go to the
best-targeted areas), so curves show diminishing returns while integrating to
exactly GiveWell's figure. Across gaps, value falls the way GiveWell's own
"cost-effectiveness by funding gap" table ranks where the next dollar should go. Two of the three recommender lenses adjust GiveWell's numbers with
explicit, illustrative factors (see ASSUMPTIONS) — they are not GiveWell's.

Input: pipeline/data/global-health.csv (from pipeline.extract_global_health).
"""

from __future__ import annotations

import csv
from pathlib import Path

IN_CSV = Path(__file__).parent.parent / "data" / "global-health.csv"

UNDER_REVIEW_WEIGHT = 0.5
WITHIN_GAP_SLOPE = 0.25  # first dollar at 1.25x GiveWell's estimate, last at 0.75x; average = estimate
NON_MORTALITY_WEIGHT = 0.25

ASSUMPTIONS = {
    "under_review_weight": UNDER_REVIEW_WEIGHT,
    "non_mortality_value_weight": NON_MORTALITY_WEIGHT,
    "within_gap_slope": WITHIN_GAP_SLOPE,
    "note": (
        "All cost-effectiveness numbers, funding-gap sizes, shares of value from averted deaths and "
        "costs per life saved are GiveWell's, from its 2021 cost-effectiveness workbook (funding gaps "
        "for 2021-2023); they are dated and not current GiveWell recommendations. Choices made here: "
        "(1) one application per funding gap, except Helen Keller's four Nigerian state gaps and SCI "
        "Foundation's four yearly tranches, which share one GiveWell estimate and are each combined "
        "into one application; (2) GiveWell gives one estimate per gap, so it is used as the average over the gap, "
        "with value falling linearly from 1.25x to 0.75x of it across the gap (best-targeted areas "
        "first) — the shape is illustrative, the average is GiveWell's; (3) GiveDirectly appears only with its $23.5M 'maintain rolling programs' gap, as "
        "the cash benchmark — its scale-up gaps ($432M) and a Sightsavers survey gap GiveWell only "
        "assesses qualitatively are left out; (4) the Evidence strength lens counts gaps GiveWell "
        "marks as still under investigation at 0.5x — an illustrative discount, not GiveWell's; "
        "(5) the Lives saved first lens keeps the share of value GiveWell attributes to averted "
        "deaths and counts the rest (income and development gains) at 0.25x, also illustrative; "
        "(6) the funders and their budgets are fictional."
    ),
}

RECOMMENDERS = [
    {"id": "rec-cost-effectiveness", "name": "Cost-effectiveness",
     "lens": "Takes GiveWell's cost-effectiveness estimate for each funding gap as is."},
    {"id": "rec-evidence", "name": "Evidence strength",
     "lens": "Full weight for gaps GiveWell calls sufficiently vetted; gaps GiveWell is still investigating count half."},
    {"id": "rec-lives", "name": "Lives saved first",
     "lens": "Counts value from averted deaths in full and value from income and development gains at one quarter."},
]

FUNDERS = [
    {"id": "funder-harbor", "name": "Harbor Health Fund", "budget": 32_000_000,
     "trust": {"rec-cost-effectiveness": 60, "rec-evidence": 30, "rec-lives": 10}},
    {"id": "funder-meridian", "name": "Meridian Family Foundation", "budget": 18_000_000,
     "trust": {"rec-cost-effectiveness": 20, "rec-evidence": 30, "rec-lives": 50}},
]

# (CEA sheet, CEA column) -> (application id, display name, program)
APPLICATIONS = {
    ("Helen Keller International", "Nigeria"): ("vas-nigeria-hki", "Vitamin A — Nigeria (4 states)", "Vitamin A supplementation"),
    ("Helen Keller International", "Cameroon"): ("vas-cameroon-hki", "Vitamin A — Cameroon", "Vitamin A supplementation"),
    ("Helen Keller International", "Kenya"): ("vas-kenya-hki", "Vitamin A — Kenya", "Vitamin A supplementation"),
    ("Malaria Consortium", "Burkina Faso"): ("smc-burkina-faso-mc", "Malaria SMC — Burkina Faso", "Seasonal malaria chemoprevention"),
    ("Malaria Consortium", "Nigeria"): ("smc-nigeria-mc", "Malaria SMC — Nigeria", "Seasonal malaria chemoprevention"),
    ("Malaria Consortium", "Togo"): ("smc-togo-mc", "Malaria SMC — Togo", "Seasonal malaria chemoprevention"),
    ("Malaria Consortium", "Chad"): ("smc-chad-mc", "Malaria SMC — Chad", "Seasonal malaria chemoprevention"),
    ("AMF", "DRC"): ("bednets-dr-congo-amf", "Bednets — DR Congo", "Insecticide-treated bednets"),
    ("New Incentives", "Overall"): ("vaccines-nigeria-ni", "Vaccine incentives — N. Nigeria", "Incentives for childhood vaccination"),
    ("Sightsavers", "Chad"): ("deworming-chad-sightsavers", "Deworming — Chad", "Deworming"),
    ("Sightsavers", "Senegal"): ("deworming-senegal-sightsavers", "Deworming — Senegal", "Deworming"),
    ("SCI Foundation", "Overall"): ("deworming-sci", "Deworming — multi-country (SCI)", "Deworming"),
    ("Deworm the World", "Lagos, Nigeria"): ("deworming-lagos-dtw", "Deworming — Lagos, Nigeria", "Deworming"),
    ("Deworm the World", "Pakistan"): ("deworming-pakistan-dtw", "Deworming — Pakistan", "Deworming"),
    ("GiveDirectly", "Overall"): ("cash-givedirectly", "Cash transfers — GiveDirectly", "Unconditional cash transfers"),
}


def status(priority: str) -> str:
    p = priority.lower()
    if "sufficiently vetted" in p:
        return "Vetted"
    if "investigation" in p:
        return "Still under review"
    if "not currently highly prioritized" in p:
        return "Lower priority"
    raise ValueError(f"unrecognised GiveWell priority note: {priority!r}")


def gap_curve(m: float, cap: int) -> dict:
    """Linear decline across the gap whose average is exactly m."""
    return {"points": [{"x": 0, "m": round(m * (1 + WITHIN_GAP_SLOPE), 4)}, {"x": cap, "m": round(m * (1 - WITHIN_GAP_SLOPE), 4)}]}


def build() -> dict:
    with IN_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    groups: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        groups.setdefault((r["cea_sheet"], r["location"]), []).append(r)
    if set(groups) != set(APPLICATIONS):
        raise ValueError(f"CSV gaps don't match APPLICATIONS: {set(groups) ^ set(APPLICATIONS)}")

    applications, curves = [], {r["id"]: {} for r in RECOMMENDERS}
    for key, (app_id, name, program) in APPLICATIONS.items():
        gaps = groups[key]
        first = gaps[0]
        if len({(g["multiple_of_cash"], g["mortality_share"], g["givewell_priority"]) for g in gaps}) != 1:
            raise ValueError(f"{app_id}: combined gaps must share one GiveWell estimate")
        cap = sum(int(g["gap_total_usd"]) for g in gaps)
        multiple = float(first["multiple_of_cash"])
        mortality = float(first["mortality_share"])
        st = status(first["givewell_priority"])
        cpls = int(first["cost_per_life_saved_usd"]) if first["cost_per_life_saved_usd"] else None

        facts = [
            {"label": "GiveWell estimate", "value": f"{multiple:.1f}× cash"},
            {"label": "Charity", "value": first["charity"]},
            {"label": "Cost per life saved", "value": f"${cpls:,}" if cpls else "Not modeled (no mortality effect)"},
            {"label": "GiveWell status", "value": st},
        ]
        applications.append({
            "id": app_id,
            "name": name,
            "cap": cap,
            "data": {
                "facts": facts,
                "charity": first["charity"],
                "program": program,
                "givewell_gaps": [g["gap_name"] for g in gaps],
                "multiple_of_cash": multiple,
                "mortality_share": mortality,
                "cost_per_life_saved_usd": cpls,
                "deaths_averted_per_100k_usd": round(100_000 / cpls, 1) if cpls else None,
                "givewell_priority": first["givewell_priority"],
            },
        })
        evidence = 1.0 if st != "Still under review" else UNDER_REVIEW_WEIGHT
        lives = mortality + NON_MORTALITY_WEIGHT * (1 - mortality)
        curves["rec-cost-effectiveness"][app_id] = gap_curve(multiple, cap)
        curves["rec-evidence"][app_id] = gap_curve(multiple * evidence, cap)
        curves["rec-lives"][app_id] = gap_curve(multiple * lives, cap)

    return {
        "id": "global-health",
        "title": "Global health charities, by GiveWell funding gap",
        "summary": (
            "Top-charity funding gaps — bednets, malaria chemoprevention, vitamin A, vaccine incentives, "
            "deworming and cash — sized and valued with GiveWell's 2021 cost-effectiveness estimates "
            "(1× = a dollar of cash to GiveDirectly). Lens adjustments and funders are illustrative, not GiveWell's."
        ),
        "valueUnit": "value per $ in multiples of cash (GiveDirectly = 1×)",
        "sources": [
            {"name": "GiveWell — 2021 top-charity cost-effectiveness analysis (funding gaps 2021-2023)",
             "url": "https://docs.google.com/spreadsheets/d/1g_dfZa6xciKkMiiUPVAF02CQLSVHULFpjP5wN7FrpSI/edit"},
            {"name": "GiveWell — Cost-effectiveness models (current and past versions)",
             "url": "https://www.givewell.org/how-we-work/our-criteria/cost-effectiveness/cost-effectiveness-models"},
        ],
        "assumptions": ASSUMPTIONS,
        "applications": applications,
        "recommenders": RECOMMENDERS,
        "funders": FUNDERS,
        "curves": curves,
    }
