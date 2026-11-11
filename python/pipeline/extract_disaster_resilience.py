"""Extract the counties used by the disaster-resilience scenario from FEMA's National Risk Index.

Source: FEMA, National Risk Index (NRI) v1.20, "December 2025" release, county-level table
("All Counties — Table Format"), listed on OpenFEMA:
https://www.fema.gov/about/openfema/data-sets/national-risk-index-data
    download:   https://www.fema.gov/about/reports-and-data/openfema/nri/v120/NRI_Table_Counties.zip
    dictionary: https://fema.maps.arcgis.com/sharing/rest/content/items/4b9db412e99542029b3c37c37ad714bb/data
Retrieved 2026-11-11. (The old hazards.fema.gov/nri site now redirects to FEMA's Resilience
Analysis and Planning Tool; the NRI web app is retired but the data lives on via OpenFEMA.)

The zip (~25 MB, ~25 MB CSV inside) is NOT committed. By default this script downloads it to a
temporary directory with curl (on PATH) and deletes it afterwards; pass --zip PATH to reuse a copy you downloaded:

    curl -L -o /tmp/NRI_Table_Counties.zip \\
        https://www.fema.gov/about/reports-and-data/openfema/nri/v120/NRI_Table_Counties.zip
    python -m pipeline.extract_disaster_resilience --zip /tmp/NRI_Table_Counties.zip

Selection rule (data-driven, so it is reproducible): rank counties by total expected annual loss
(EAL_VALT, all 18 hazards, dollars per year), skip any county without a Social Vulnerability or
Community Resilience score, allow at most MAX_PER_STATE counties per state (otherwise the list is
mostly California), and keep the first N_COUNTIES.

Output: pipeline/data/disaster-resilience.csv (committed), one row per selected county.
"""

from __future__ import annotations

import argparse
import csv
import io
import subprocess
import tempfile
import zipfile
from pathlib import Path

HERE = Path(__file__).parent
OUT_CSV = HERE / "data" / "disaster-resilience.csv"

URL = "https://www.fema.gov/about/reports-and-data/openfema/nri/v120/NRI_Table_Counties.zip"
MEMBER = "NRI_Table_Counties.csv"
EXPECTED_VERSION = "December 2025"

N_COUNTIES = 20
MAX_PER_STATE = 2

# NRI hazard prefixes -> display names (from NRI_HazardInfo.csv in the same zip).
HAZARDS = {
    "AVLN": "Avalanche", "CFLD": "Coastal flooding", "CWAV": "Cold wave", "DRGT": "Drought",
    "ERQK": "Earthquake", "HAIL": "Hail", "HWAV": "Heat wave", "HRCN": "Hurricane",
    "ISTM": "Ice storm", "IFLD": "Inland flooding", "LNDS": "Landslide", "LTNG": "Lightning",
    "SWND": "Strong wind", "TRND": "Tornado", "TSUN": "Tsunami", "VLCN": "Volcanic activity",
    "WFIR": "Wildfire", "WNTW": "Winter weather",
}

# Per-hazard EAL kept in the CSV: the hazards the NIBS "Mitigation Saves" federal-grant study
# reports a benefit-cost ratio for (riverine flood, hurricane and tornado wind, earthquake, fire).
KEPT_HAZARDS = ["IFLD", "HRCN", "TRND", "ERQK", "WFIR"]

COLUMNS = [
    "stcofips", "county", "county_type", "state", "state_abbr", "population",
    "eal_total", *[f"eal_{h.lower()}" for h in KEPT_HAZARDS],
    "top_hazard", "top_hazard_eal",
    "sovi_score", "sovi_rating", "resl_score", "resl_rating", "nri_version",
]


def num(v: str) -> float:
    return float(v) if v not in ("", None) else 0.0


def select(rows: list[dict]) -> list[dict]:
    rows = [r for r in rows if r["SOVI_SCORE"] and r["RESL_SCORE"]]
    rows.sort(key=lambda r: (-num(r["EAL_VALT"]), r["STCOFIPS"]))
    per_state: dict[str, int] = {}
    out = []
    for r in rows:
        st = r["STATEABBRV"]
        if per_state.get(st, 0) >= MAX_PER_STATE:
            continue
        per_state[st] = per_state.get(st, 0) + 1
        out.append(r)
        if len(out) == N_COUNTIES:
            break
    return out


def tidy(r: dict) -> dict:
    if r["NRI_VER"] != EXPECTED_VERSION:
        raise ValueError(f"unexpected NRI version {r['NRI_VER']!r}")
    top = max(HAZARDS, key=lambda h: num(r[f"{h}_EALT"]))
    row = {
        "stcofips": r["STCOFIPS"],
        "county": r["COUNTY"],
        "county_type": r["COUNTYTYPE"],
        "state": r["STATE"],
        "state_abbr": r["STATEABBRV"],
        "population": int(num(r["POPULATION"])),
        "eal_total": round(num(r["EAL_VALT"])),
        **{f"eal_{h.lower()}": round(num(r[f"{h}_EALT"])) for h in KEPT_HAZARDS},
        "top_hazard": HAZARDS[top],
        "top_hazard_eal": round(num(r[f"{top}_EALT"])),
        "sovi_score": round(num(r["SOVI_SCORE"]), 2),
        "sovi_rating": r["SOVI_RATNG"],
        "resl_score": round(num(r["RESL_SCORE"]), 2),
        "resl_rating": r["RESL_RATNG"],
        "nri_version": r["NRI_VER"],
    }
    return row


def read_zip(path: Path) -> list[dict]:
    with zipfile.ZipFile(path) as z, z.open(MEMBER) as f:
        return list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--zip", type=Path, help="already-downloaded NRI_Table_Counties.zip")
    args = ap.parse_args()

    if args.zip:
        rows = read_zip(args.zip)
    else:
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "NRI_Table_Counties.zip"
            print(f"downloading {URL}")
            # curl, not urllib: fema.gov answers Python's default client with 403.
            subprocess.run(["curl", "-sSfL", "-o", str(dest), URL], check=True)
            rows = read_zip(dest)

    selected = [tidy(r) for r in select(rows)]
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(selected)
    print(f"wrote {len(selected)} of {len(rows)} counties to {OUT_CSV.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
