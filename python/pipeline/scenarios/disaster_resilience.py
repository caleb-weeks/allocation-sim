"""Build the disaster-resilience demo scenario from FEMA's National Risk Index.

Each of 20 high-loss US counties becomes one "application": a proposal for a natural-hazard
mitigation program there (elevating or buying out flood-prone homes, wind retrofits and safe
rooms, seismic retrofits, wildfire hardening). The data sets the *scale* (expected annual loss)
and the *need* (social vulnerability, community resilience). The program economics are explicit,
adjustable assumptions — this scenario is an illustration, not funding advice.

Value is "dollars of expected losses avoided per $1,000 spent", grounded in the benefit-cost
ratios the National Institute of Building Sciences found for federally funded mitigation grants
(Natural Hazard Mitigation Saves: 2019 Report, Table 1): riverine flood 7:1, hurricane and
tornado wind 5:1, earthquake 3:1, wildland-urban interface fire 3:1, 6:1 overall.

Input: pipeline/data/disaster-resilience.csv (from pipeline.extract_disaster_resilience).
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

IN_CSV = Path(__file__).parent.parent / "data" / "disaster-resilience.csv"

# NIBS Mitigation Saves 2019, Table 1, "Federal grants" column: dollars saved per dollar spent.
# NRI v1.20 calls riverine flooding "inland flooding"; NIBS's wind grants cover hurricane and
# tornado wind. NIBS reports no federal-grant ratio for hurricane surge (coastal flooding) or for
# other NRI hazards, so the program only targets these five.
NIBS_GRANT_BCR = {"ifld": 7.0, "hrcn": 5.0, "trnd": 5.0, "erqk": 3.0, "wfir": 3.0}

# Curve shape: best projects first. Marginal value at (0, cap/2, cap) is these multiples of the
# county's average ratio; for a piecewise-linear curve the program-wide average is
# (1.6 + 2 * 1.0 + 0.4) / 4 = 1.0, i.e. exactly the NIBS ratio.
CURVE_MULTIPLES = (1.6, 1.0, 0.4)

ASSUMPTIONS = {
    "program_share_of_covered_eal": 0.005,
    "nibs_federal_grant_bcr": NIBS_GRANT_BCR,
    "curve_multiples_first_middle_last": list(CURVE_MULTIPLES),
    "note": (
        "Counties: the 20 with the highest total expected annual loss (EAL) in FEMA's National Risk "
        "Index v1.20 (Dec 2025), at most 2 per state, skipping any without vulnerability or "
        "resilience scores. "
        "Program size (cap): 0.5% of one year of the county's EAL from the hazards mitigated "
        "(inland flooding, hurricane, tornado, earthquake, wildfire), rounded to $10,000; an "
        "illustrative sizing, not a sourced cost estimate. "
        "Average return: each county's mix of those hazards, weighted by their dollar EAL, applied "
        "to the NIBS 2019 federal-grant benefit-cost ratios (flood 7:1, wind 5:1, earthquake 3:1, "
        "wildfire 3:1). Other hazards (coastal flooding, heat, drought, etc.) are left out because "
        "NIBS reports no grant ratio for them. "
        "Diminishing returns: best projects first, so the first dollar returns 1.6x the county "
        "average, the midpoint 1.0x and the last 0.4x, averaging to the NIBS ratio. "
        "Lens weights: Social vulnerability multiplies by NRI SoVI score / 50; Low resilience by "
        "(100 - NRI resilience score) / 50 (both scores are national percentiles, so a median "
        "county counts 1:1). EAL includes NRI's dollar value of expected deaths and injuries."
    ),
}

RECOMMENDERS = [
    {"id": "rec-losses", "name": "Losses avoided",
     "lens": "A dollar of loss is a dollar wherever it falls; fund the hazard mixes where mitigation returns the most."},
    {"id": "rec-vulnerability", "name": "Social vulnerability",
     "lens": "Weight avoided losses toward places whose residents are least able to absorb them (NRI social vulnerability)."},
    {"id": "rec-resilience", "name": "Low resilience",
     "lens": "Weight avoided losses toward communities with the least capacity to prepare and bounce back (NRI resilience)."},
]

FUNDERS = [
    {"id": "funder-bedrock", "name": "Bedrock Foundation", "budget": 30_000_000,
     "trust": {"rec-losses": 60, "rec-vulnerability": 25, "rec-resilience": 15}},
    {"id": "funder-harbor", "name": "Cornerstone Trust", "budget": 18_000_000,
     "trust": {"rec-losses": 20, "rec-vulnerability": 50, "rec-resilience": 30}},
]


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def money(v: float) -> str:
    return f"${v / 1e9:.1f}B" if v >= 1e9 else f"${v / 1e6:.0f}M"


def rating(r: str) -> str:
    return r[:1] + r[1:].lower()


def curve(m_avg: float, cap: int) -> dict:
    """Value per $1k: the best projects come first, so it falls from 1.6x to 0.4x the average."""
    first, middle, last = (round(m_avg * k, 2) for k in CURVE_MULTIPLES)
    return {"points": [{"x": 0, "m": first}, {"x": round(cap / 2), "m": middle}, {"x": cap, "m": last}]}


def build() -> dict:
    with IN_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    applications, curves = [], {r["id"]: {} for r in RECOMMENDERS}
    for r in rows:
        name = f"{r['county']} {r['county_type']}, {r['state_abbr']}"
        app_id = slug(name)
        eal = {h: int(r[f"eal_{h}"]) for h in NIBS_GRANT_BCR}
        covered = sum(eal.values())
        bcr = sum(eal[h] * b for h, b in NIBS_GRANT_BCR.items()) / covered
        cap = round(covered * ASSUMPTIONS["program_share_of_covered_eal"], -4)
        eal_total = int(r["eal_total"])
        sovi, resl = float(r["sovi_score"]), float(r["resl_score"])
        losses_per_k = 1000 * bcr

        applications.append({
            "id": app_id,
            "name": name,
            "cap": int(cap),
            "data": {
                "facts": [
                    {"label": "Expected annual loss", "value": money(eal_total)},
                    {"label": "Top hazard",
                     "value": f"{r['top_hazard']} ({int(r['top_hazard_eal']) / eal_total:.0%} of loss)"},
                    {"label": "Social vulnerability", "value": rating(r["sovi_rating"])},
                    {"label": "Community resilience", "value": rating(r["resl_rating"])},
                ],
                "county_fips": r["stcofips"],
                "state": r["state"],
                "population": int(r["population"]),
                "expected_annual_loss_usd": eal_total,
                "mitigated_hazards_eal_usd": covered,
                "average_benefit_cost_ratio": round(bcr, 3),
                "social_vulnerability_score": sovi,
                "community_resilience_score": resl,
            },
        })
        curves["rec-losses"][app_id] = curve(losses_per_k, int(cap))
        curves["rec-vulnerability"][app_id] = curve(losses_per_k * sovi / 50, int(cap))
        curves["rec-resilience"][app_id] = curve(losses_per_k * (100 - resl) / 50, int(cap))

    return {
        "id": "disaster-resilience",
        "title": "Disaster mitigation in 20 high-risk US counties",
        "summary": (
            "Natural-hazard mitigation programs in 20 US counties with high expected yearly disaster "
            "losses (at most two per state), from FEMA's National Risk Index. Returns follow the National Institute "
            "of Building Sciences' finding that federal mitigation grants save about $6 per $1. "
            "Program sizes and diminishing returns are illustrative assumptions."
        ),
        "valueUnit": "dollars of losses avoided per $1,000 (lens-weighted)",
        "sources": [
            {"name": "FEMA — National Risk Index v1.20 (December 2025), county table",
             "url": "https://www.fema.gov/about/openfema/data-sets/national-risk-index-data"},
            {"name": "National Institute of Building Sciences — Natural Hazard Mitigation Saves: 2019 Report",
             "url": "https://nibs.org/wp-content/uploads/2025/04/NIBS_MMC_MitigationSaves_2019.pdf"},
        ],
        "assumptions": ASSUMPTIONS,
        "applications": applications,
        "recommenders": RECOMMENDERS,
        "funders": FUNDERS,
        "curves": curves,
    }
