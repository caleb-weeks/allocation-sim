"""Build every sample scenario into data/<id>.json.

Each module in pipeline/scenarios exposes build() -> dict. Outputs are validated (pipeline.validate)
and written deterministically, so CI can check that the committed files are current.

    python -m pipeline.build_seed                 # rewrite all data/*.json
    python -m pipeline.build_seed global_health   # just one scenario module
    python -m pipeline.build_seed --check         # fail if any committed file is stale
"""

from __future__ import annotations

import importlib
import json
import pkgutil
import sys
from pathlib import Path

from pipeline import scenarios
from pipeline.validate import validate

OUT_DIR = Path(__file__).parent.parent.parent / "data"


def scenario_modules() -> list[str]:
    return sorted(m.name for m in pkgutil.iter_modules(scenarios.__path__) if not m.name.startswith("_"))


def main() -> None:
    check = "--check" in sys.argv
    wanted = [a for a in sys.argv[1:] if not a.startswith("--")] or scenario_modules()
    stale = []
    for name in wanted:
        scenario = importlib.import_module(f"pipeline.scenarios.{name}").build()
        validate(scenario)
        out = OUT_DIR / f"{scenario['id']}.json"
        text = json.dumps(scenario, indent=2, ensure_ascii=False) + "\n"
        if check:
            if not out.exists() or out.read_text(encoding="utf-8") != text:
                stale.append(out.name)
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
        print(f"wrote {out.name}: {len(scenario['applications'])} applications")
    if stale:
        sys.exit(f"stale scenario files: {', '.join(stale)}; run python -m pipeline.build_seed")
    if check:
        print(f"{len(wanted)} scenario file(s) up to date")


if __name__ == "__main__":
    main()
