"""Extract zero-dose children and vaccination coverage by country into a CSV.

Source: WHO/UNICEF Estimates of National Immunization Coverage (WUENIC), 2025
revision (estimates for calendar year 2025, released 15 July 2026), as published
on the WHO Immunization Data portal (https://immunizationdata.who.int/) through
its public xMart OData API. Retrieved 2026-11-11.

- Zero-dose children (IA2030 indicator IG2.1: surviving infants who did not
  receive a first dose of DTP-containing vaccine), from
  https://xmart-api-public.who.int/WIISE/MT_RI_IND_IA2030_LONG
- WUENIC coverage of DTP1, DTP3 and measles first dose (MCV1), from
  https://xmart-api-public.who.int/WIISE/MT_AD_COV_LONG

The two filtered API responses are saved under raw/childhood-vaccination/
(~75 KB together) so the CSV can be rebuilt offline. Re-download with --download.
The output CSV keeps only the TOP_N countries with the most zero-dose children.

    python -m pipeline.extract_childhood_vaccination              # from raw/
    python -m pipeline.extract_childhood_vaccination --download   # refresh raw/ first
"""

from __future__ import annotations

import csv
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
RAW_DIR = HERE / "raw" / "childhood-vaccination"
OUT_CSV = HERE / "data" / "childhood-vaccination.csv"

YEAR = 2025
TOP_N = 20
API = "https://xmart-api-public.who.int/WIISE/"

QUERIES = {
    "zero-dose-2025.json": ("MT_RI_IND_IA2030_LONG", {
        "$filter": f"INDICATOR eq 'ZERO_DOSE' and YEAR eq {YEAR}",
        "$select": "COUNTRY,COUNTRY_NAME,WHO_REGION,YEAR,VALUE_NUM",
    }),
    "wuenic-coverage-2025.json": ("MT_AD_COV_LONG", {
        "$filter": (f"COVERAGE_CATEGORY eq 'WUENIC' and GROUP eq 'COUNTRIES' and YEAR eq {YEAR} and "
                    "(ANTIGEN eq 'DTPCV1' or ANTIGEN eq 'DTPCV3' or ANTIGEN eq 'MCV1')"),
        "$select": "CODE,NAME,YEAR,ANTIGEN,COVERAGE",
    }),
}

COLUMNS = ["iso3", "country", "who_region", "year", "zero_dose", "dtp1_pct", "dtp3_pct", "mcv1_pct"]


def download() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for filename, (table, params) in QUERIES.items():
        url = API + table + "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
        with urllib.request.urlopen(url, timeout=120) as resp:
            payload = json.load(resp)
        # Drop the OData context line so re-downloads diff cleanly; one row per line.
        rows = sorted(payload["value"], key=lambda r: json.dumps(r, sort_keys=True))
        text = "[\n" + ",\n".join(json.dumps(r, ensure_ascii=False, sort_keys=True) for r in rows) + "\n]\n"
        (RAW_DIR / filename).write_text(text, encoding="utf-8")
        print(f"downloaded {len(rows)} rows to {(RAW_DIR / filename).relative_to(HERE.parent)}")


def parse() -> list[dict]:
    zero_dose = json.loads((RAW_DIR / "zero-dose-2025.json").read_text(encoding="utf-8"))
    coverage = json.loads((RAW_DIR / "wuenic-coverage-2025.json").read_text(encoding="utf-8"))

    cov: dict[str, dict[str, float]] = {}
    for r in coverage:
        if r["COVERAGE"] is not None:
            cov.setdefault(r["CODE"], {})[r["ANTIGEN"]] = float(r["COVERAGE"])

    rows = []
    for r in zero_dose:
        if r["VALUE_NUM"] is None:
            continue
        c = cov.get(r["COUNTRY"], {})
        if not all(k in c for k in ("DTPCV1", "DTPCV3", "MCV1")):
            continue
        rows.append({
            "iso3": r["COUNTRY"],
            "country": r["COUNTRY_NAME"],
            "who_region": r["WHO_REGION"],
            "year": int(r["YEAR"]),
            "zero_dose": int(round(r["VALUE_NUM"])),
            "dtp1_pct": round(c["DTPCV1"]),
            "dtp3_pct": round(c["DTPCV3"]),
            "mcv1_pct": round(c["MCV1"]),
        })
    rows.sort(key=lambda r: (-r["zero_dose"], r["iso3"]))
    for r in rows[:TOP_N]:
        # Sanity: zero-dose children are those missing DTP1, so DTP1 coverage can't be 100%,
        # and DTP3 can't exceed DTP1 (third dose implies the first).
        assert r["dtp1_pct"] < 100 and r["dtp3_pct"] <= r["dtp1_pct"], r
    return rows[:TOP_N]


def main() -> None:
    if "--download" in sys.argv or not all((RAW_DIR / f).exists() for f in QUERIES):
        download()
    rows = parse()
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} countries to {OUT_CSV.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
