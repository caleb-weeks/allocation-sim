"""Extract CONALFA's 2023 literacy projection table into a CSV.

Source: CONALFA, "Proyección de población alfabeta y analfabeta de 15 años y más
según departamento, por sexo, año 2023" (prepared 2023-12-28 from INE's 2018
census and population projections, UNESCO UIS GALP model).
https://www.conalfa.edu.gt/data/proyeccion2023.pdf

Requires poppler's `pdftotext` on PATH. The extracted CSV is committed, so the
seed build and CI don't need poppler.

    python -m pipeline.extract_conalfa
"""

from __future__ import annotations

import csv
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
RAW_PDF = HERE / "raw" / "conalfa-proyeccion2023.pdf"
OUT_CSV = HERE / "data" / "conalfa-2023.csv"

DEPARTMENTS = [
    "Guatemala", "El Progreso", "Sacatepéquez", "Chimaltenango", "Escuintla", "Santa Rosa",
    "Sololá", "Totonicapán", "Quetzaltenango", "Suchitepéquez", "Retalhuleu", "San Marcos",
    "Huehuetenango", "Quiché", "Baja Verapaz", "Alta Verapaz", "Petén", "Izabal", "Zacapa",
    "Chiquimula", "Jalapa", "Jutiapa",
]

COLUMNS = [
    "literate", "literate_pct", "illiterate", "illiterate_pct", "population_15plus",
    "male_literate", "male_literate_pct", "male_illiterate", "male_illiterate_pct", "male_population_15plus",
    "female_literate", "female_literate_pct", "female_illiterate", "female_illiterate_pct", "female_population_15plus",
]


def parse(text: str) -> list[dict[str, str | float | int]]:
    rows = []
    for name in DEPARTMENTS:
        line = next((l for l in text.splitlines() if l.strip().startswith(name + " ")), None)
        if line is None:
            raise ValueError(f"department {name!r} not found in PDF text")
        numbers = re.findall(r"[\d,]+(?:\.\d+)?", line[len(line) - len(line.lstrip()) + len(name):])
        if len(numbers) != len(COLUMNS):
            raise ValueError(f"{name}: expected {len(COLUMNS)} numbers, got {len(numbers)}: {numbers}")
        row: dict[str, str | float | int] = {"department": name}
        for col, raw in zip(COLUMNS, numbers):
            value = raw.replace(",", "")
            row[col] = float(value) if col.endswith("_pct") else int(value)
        # Cross-check the table's own arithmetic.
        assert row["literate"] + row["illiterate"] == row["population_15plus"], name
        assert row["male_illiterate"] + row["female_illiterate"] == row["illiterate"], name
        rows.append(row)
    return rows


def main() -> None:
    text = subprocess.run(["pdftotext", "-layout", str(RAW_PDF), "-"], check=True, capture_output=True, text=True).stdout
    rows = parse(text)
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["department", *COLUMNS])
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} departments to {OUT_CSV.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
