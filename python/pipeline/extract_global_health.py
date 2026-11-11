"""Extract GiveWell's funding gaps and cost-effectiveness estimates into a CSV.

Source: GiveWell, top-charity cost-effectiveness analysis (CEA) workbook, 2021
edition (it supersedes the "2020 CEA version 2" it cites, and its funding gaps
cover 2021-2023). Public Google Sheet, retrieved 2026-11-11:
https://docs.google.com/spreadsheets/d/1g_dfZa6xciKkMiiUPVAF02CQLSVHULFpjP5wN7FrpSI/edit
GiveWell's index of current and past CEAs:
https://www.givewell.org/how-we-work/our-criteria/cost-effectiveness/cost-effectiveness-models

What we read:
- "Cost-effectiveness by funding gap": one row per funding gap GiveWell identified
  (charity x country or tranche), with the gap size by year (USD millions), the
  final cost-effectiveness in multiples of cash transfers, and GiveWell's
  prioritization note.
- Each charity's CEA sheet (AMF, Malaria Consortium, ...), in the column that gap
  uses: the final multiple (cross-checked against the gap sheet), the share of
  value that comes from averted deaths, and cost per life saved (where modeled).

Rows left out: the Sightsavers Nigeria survey gap (GiveWell assesses it only
qualitatively, no estimate) and GiveDirectly's "scale" and "expand" gaps
($432M combined, far past the app's $50M cap per application). GiveDirectly's
"maintain rolling programs" gap stays as the cash benchmark.

The workbook is ~560 KB, so it isn't committed; this script downloads it as
.xlsx via Google Sheets' export URL (or reads a local copy you pass) and only
uses the standard library. The extracted CSV is committed.

    python -m pipeline.extract_global_health                 # download
    python -m pipeline.extract_global_health path/to/book.xlsx
"""

from __future__ import annotations

import csv
import io
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

HERE = Path(__file__).parent
OUT_CSV = HERE / "data" / "global-health.csv"
SHEET_ID = "1g_dfZa6xciKkMiiUPVAF02CQLSVHULFpjP5wN7FrpSI"
EXPORT_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
GAP_SHEET = "Cost-effectiveness by funding g"  # Sheets truncates tab names to 31 chars

CE_FINAL = "Cost-effectiveness in multiples of cash"  # last such row = after leverage/funging
MORTALITY_SHARE = "Percent of total units of value generated from mortality reduction"
COST_PER_LIFE = "Cost per life saved, after downside adjustments, adjustments for exclu"

FIELDS = [
    "charity", "cea_sheet", "gap_id", "location", "gap_name", "gap_2021_usd", "gap_2022_usd",
    "gap_2023_usd", "gap_total_usd", "multiple_of_cash", "mortality_share", "cost_per_life_saved_usd",
    "givewell_priority",
]


class Workbook:
    def __init__(self, data: bytes):
        self.z = zipfile.ZipFile(io.BytesIO(data))
        self.strings = [
            "".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t"))
            for si in ET.fromstring(self.z.read("xl/sharedStrings.xml")).findall("m:si", NS)
        ]
        rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(self.z.read("xl/_rels/workbook.xml.rels"))}
        self.paths = {
            s.get("name"): "xl/" + rels[s.get(f"{{{NS['r']}}}id")].removeprefix("/xl/")
            for s in ET.fromstring(self.z.read("xl/workbook.xml")).find("m:sheets", NS)
        }

    def rows(self, sheet: str) -> list[dict[str, str]]:
        """Rows as {column letter: cached value}, skipping empty cells."""
        out = []
        for row in ET.fromstring(self.z.read(self.paths[sheet])).iter(f"{{{NS['m']}}}row"):
            cells = {}
            for c in row.findall("m:c", NS):
                v = c.find("m:v", NS)
                if v is None or v.text is None:
                    continue
                col = re.match(r"[A-Z]+", c.get("r")).group(0)
                cells[col] = self.strings[int(v.text)] if c.get("t") == "s" else v.text
            out.append(cells)
        return out


def cea_values(rows: list[dict[str, str]], location: str) -> dict[str, float | None]:
    header = rows[0]
    col = next((k for k, v in header.items() if k != "A" and v == location), None)
    if col is None:
        raise ValueError(f"CEA column {location!r} not found in {list(header.values())}")
    labelled = [r for r in rows if r.get("A")]
    finals = [r for r in labelled if r["A"].startswith(CE_FINAL) and col in r]
    shares = [float(r[col]) for r in labelled if r["A"].startswith(MORTALITY_SHARE) and col in r]
    life = [r for r in labelled if r["A"].startswith(COST_PER_LIFE) and col in r]
    return {
        "multiple": float(finals[-1][col]),
        # Deworming and cash CEAs model no deaths averted, so they have no share rows: 0.
        "mortality_share": sum(shares),
        "cost_per_life": float(life[-1][col]) if life else None,
    }


def millions(v: str) -> int:
    return 0 if v in ("-", "", None) else round(float(v) * 1_000_000)


def extract(book: Workbook) -> list[dict]:
    out = []
    for r in book.rows(GAP_SHEET)[2:]:
        if r.get("H") != "OK" or "D" not in r:  # funding-gap rows carry a duplicate check
            continue
        if r.get("P", "").lower().startswith("assess qualitatively"):
            continue
        if r["B"] == "GiveDirectly" and float(r["D"]) > 1:
            continue
        cea = cea_values(book.rows(r["B"]), r["E"])
        multiple = float(r["P"])
        if abs(cea["multiple"] - multiple) > 1e-6:
            raise ValueError(f"{r['G']}: CEA sheet says {cea['multiple']}, gap sheet says {multiple}")
        years = [millions(r.get(c)) for c in "IJK"]
        total = millions(r["L"])
        assert abs(sum(years) - total) <= 2, r["G"]
        out.append({
            "charity": r["A"], "cea_sheet": r["B"], "gap_id": int(float(r["D"])), "location": r["E"],
            "gap_name": r["F"], "gap_2021_usd": years[0], "gap_2022_usd": years[1], "gap_2023_usd": years[2],
            "gap_total_usd": total, "multiple_of_cash": round(multiple, 4),
            "mortality_share": round(cea["mortality_share"], 4),
            "cost_per_life_saved_usd": "" if cea["cost_per_life"] is None else round(cea["cost_per_life"]),
            "givewell_priority": r["Q"],
        })
    return out


def main() -> None:
    if len(sys.argv) > 1:
        data = Path(sys.argv[1]).read_bytes()
    else:
        with urllib.request.urlopen(EXPORT_URL, timeout=60) as resp:
            data = resp.read()
    rows = extract(Workbook(data))
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} funding gaps to {OUT_CSV.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
