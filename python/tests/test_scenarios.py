"""Every committed sample scenario satisfies the contract in pipeline.validate."""

import json
from pathlib import Path

import pytest

from pipeline.validate import validate

DATA = Path(__file__).parent.parent.parent / "data"


@pytest.mark.parametrize("path", sorted(DATA.glob("*.json")), ids=lambda p: p.stem)
def test_scenario_is_valid(path):
    validate(json.loads(path.read_text(encoding="utf-8")))
