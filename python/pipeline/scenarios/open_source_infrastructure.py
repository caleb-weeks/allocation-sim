"""Build the open-source infrastructure demo scenario from a Debian/OSV/GitHub snapshot.

Each "application" is security and maintenance funding for one widely depended-on open-source
project (curl, OpenSSL, zlib, XZ Utils, ...), in the spirit of Alpha-Omega, Germany's Sovereign
Tech Agency and the lessons of the 2024 xz-utils backdoor. The data (2026-11-11 snapshot) sets
how much of the ecosystem depends on each project, how often it has needed security fixes, and
how few people actively maintain it. Costs and funding needs are explicit, adjustable
assumptions; no project asked for this money and this is not funding advice.

Marginal values are in "maintainer-weeks of security work per $10,000", scaled by each
recommender's view of how much a week of work on that project matters (1.0 = a project at the
set's median on that recommender's measure).
Input: pipeline/data/open-source-infrastructure.csv (from pipeline.extract_open_source).
"""

from __future__ import annotations

import csv
from pathlib import Path
from statistics import median

IN_CSV = Path(__file__).parent.parent / "data" / "open-source-infrastructure.csv"

ASSUMPTIONS = {
    "maintainer_year_usd": 200_000,
    "audit_usd": 100_000,
    "cap_rule": "audit + maintainer-years = max(1, sqrt(MB of code on GitHub)), rounded to $10k",
    "urgency_multiples": [2.0, 1.4, 0.8, 0.4],
    "urgency_breakpoints": [0, 0.25, 0.6, 1.0],
    "note": (
        "Projects and data are real (Debian 13 package index, OSV.dev and GitHub, retrieved "
        "2026-11-11); costs and needs are illustrative, and no project asked for this money. "
        "A maintainer-year costs $200,000 fully loaded, so $10,000 buys 2.6 maintainer-weeks. "
        "Each project's cap is one $100,000 security audit plus max(1, sqrt(MB of source code)) "
        "maintainer-years, so bigger codebases can absorb more but not proportionally more. "
        "The first quarter of the cap (audit, fuzzing, urgent fixes) is worth 2x a routine week, "
        "falling to 1.4x at 25%, 0.8x at 60% and 0.4x at the cap. "
        "Reach is direct dependents among Debian packages, which undercounts tools (OpenSSH, sudo) "
        "and code used mainly via npm/PyPI/Maven. Security exposure counts CVEs Debian tracked "
        "against the project since 2016-11-11, which partly reflects how carefully a project "
        "files CVEs (curl files many), not only how buggy it is. Core contributors are people "
        "with 12+ non-merge, non-bot commits on the default branch from 2025-11-11 to 2026-11-11; "
        "mirrors (libxml2, GnuPG, SQLite) and multiple identities make this approximate. "
        "Lens weights: Reach = sqrt(dependents / median); Security exposure = sqrt(CVEs / median) "
        "x (dependents / median)^0.25; Maintainer fragility = sqrt(dependents / median) x "
        "sqrt(top author share / median) / sqrt(core contributors). Funders are fictional."
    ),
}

RECOMMENDERS = [
    {"id": "rec-reach", "name": "Reach",
     "lens": "Fund what the most software depends on: weight by how many Debian packages depend on the project directly."},
    {"id": "rec-security", "name": "Security exposure",
     "lens": "Fund where vulnerabilities keep turning up: weight by CVEs in the last 10 years, nudged up by how widely the code is deployed."},
    {"id": "rec-fragility", "name": "Maintainer fragility",
     "lens": "The xz lesson: weight by importance per active maintainer, highest where one person writes most of the code."},
]

FUNDERS = [
    {"id": "funder-keystone", "name": "Keystone Commons Fund", "budget": 3_000_000,
     "trust": {"rec-reach": 40, "rec-security": 60, "rec-fragility": 20}},
    {"id": "funder-lattice", "name": "Lattice Software Trust", "budget": 1_500_000,
     "trust": {"rec-reach": 20, "rec-security": 20, "rec-fragility": 80}},
]


def curve(weight: float, cap: int) -> dict:
    """Maintainer-weeks per $10k: urgent work first, routine maintenance last."""
    base = 10_000 / (ASSUMPTIONS["maintainer_year_usd"] / 52)
    return {"points": [
        {"x": round(cap * b), "m": round(base * weight * u, 4)}
        for b, u in zip(ASSUMPTIONS["urgency_breakpoints"], ASSUMPTIONS["urgency_multiples"])
    ]}


def build() -> dict:
    with IN_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    med_deps = median(int(r["debian_dependents"]) for r in rows)
    med_cves = median(int(r["cves_10y"]) for r in rows)
    med_share = median(float(r["top_author_share"]) for r in rows)

    applications, curves = [], {r["id"]: {} for r in RECOMMENDERS}
    for r in rows:
        deps, cves = int(r["debian_dependents"]), int(r["cves_10y"])
        core = max(1, int(r["core_contributors_12mo"]))
        share = float(r["top_author_share"])
        years = max(1.0, float(r["code_mb"]) ** 0.5)
        cap = round((ASSUMPTIONS["audit_usd"] + years * ASSUMPTIONS["maintainer_year_usd"]) / 10_000) * 10_000

        reach = (deps / med_deps) ** 0.5
        security = (cves / med_cves) ** 0.5 * (deps / med_deps) ** 0.25
        fragility = reach * (share / med_share) ** 0.5 / core ** 0.5

        applications.append({
            "id": r["id"],
            "name": r["name"],
            "cap": cap,
            "data": {
                "facts": [
                    {"label": "Debian packages depending on it", "value": f"{deps:,}"},
                    {"label": "CVEs tracked by Debian (10 yr)", "value": f"{cves:,}"},
                    {"label": "Core contributors (12 mo)", "value": str(int(r["core_contributors_12mo"]))},
                    {"label": "Top author's share of commits", "value": f"{share * 100:.0f}%"},
                ],
                "githubRepo": r["github_repo"],
                "debianSource": r["debian_source"],
                "debianDependents": deps,
                "cves10y": cves,
                "cvesAll": int(r["cves_all"]),
                "commits12mo": int(r["commits_12mo"]),
                "authors12mo": int(r["authors_12mo"]),
                "coreContributors12mo": int(r["core_contributors_12mo"]),
                "topAuthorShare": share,
                "codeMb": float(r["code_mb"]),
            },
        })
        curves["rec-reach"][r["id"]] = curve(reach, cap)
        curves["rec-security"][r["id"]] = curve(security, cap)
        curves["rec-fragility"][r["id"]] = curve(fragility, cap)

    return {
        "id": "open-source-infrastructure",
        "title": "Critical open-source infrastructure",
        "summary": (
            "Security and maintenance funding for 18 open-source projects much of the internet runs on, "
            "from curl and OpenSSL to zlib and XZ Utils, using Debian dependents, OSV.dev CVE history and "
            "GitHub maintainer activity as of November 2026. The projects are real; funding needs and "
            "costs are illustrative, and no project asked for this money."
        ),
        "valueUnit": "maintainer-weeks of security work per $10,000",
        "sources": [
            {"name": "Debian 13 (trixie) main/amd64 package index",
             "url": "https://deb.debian.org/debian/dists/trixie/main/binary-amd64/Packages.xz"},
            {"name": "OSV.dev vulnerability database (Debian ecosystem)", "url": "https://osv.dev/"},
            {"name": "GitHub REST API: repository commits and languages",
             "url": "https://docs.github.com/en/rest/commits/commits"},
        ],
        "assumptions": ASSUMPTIONS,
        "applications": applications,
        "recommenders": RECOMMENDERS,
        "funders": FUNDERS,
        "curves": curves,
    }
