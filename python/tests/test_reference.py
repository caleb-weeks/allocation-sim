import math

import numpy as np
from hypothesis import given, settings
from hypothesis import strategies as st

from pipeline.extract_conalfa import parse
from reference.solvers import Curve, pooled, round_robin, water_fill


@st.composite
def curves(draw):
    m = draw(st.floats(0, 10))
    xs, ms = [0.0], [m]
    for _ in range(draw(st.integers(0, 5))):
        xs.append(xs[-1] + draw(st.floats(1, 50_000)))
        m *= 1 - draw(st.floats(0, 1))
        ms.append(m)
    if draw(st.booleans()):
        xs.append(xs[-1] + 1000)
        ms.append(0.0)
    return Curve(np.array(xs), np.array(ms))


items_st = st.lists(st.tuples(curves(), st.floats(1000, 200_000)), min_size=1, max_size=8)


def test_simple_pair():
    a = Curve(np.array([0.0, 100.0]), np.array([10.0, 0.0]))
    b = Curve(np.array([0.0, 60.0]), np.array([6.0, 0.0]))
    r = water_fill([("a", a, 1e9), ("b", b, 1e9)], 60)
    assert math.isclose(r["grants"]["a"], 50, rel_tol=1e-9)
    assert math.isclose(r["grants"]["b"], 10, rel_tol=1e-9)
    assert math.isclose(r["lambda"], 5, rel_tol=1e-9)


def test_flat_ties_split_evenly():
    flat = Curve(np.array([0.0, 100.0, 101.0]), np.array([1.0, 1.0, 0.0]))
    r = water_fill([("a", flat, 1e9), ("b", flat, 1e9)], 50)
    assert math.isclose(r["grants"]["a"], 25) and math.isclose(r["grants"]["b"], 25)


def test_total_value_is_area():
    ramp = Curve(np.array([0.0, 100.0]), np.array([4.0, 0.0]))
    assert ramp.total_value(100) == 200
    assert ramp.total_value(50) == 150
    assert Curve(np.array([0.0]), np.array([3.0])).total_value(10) == 30


@given(items_st, st.floats(0, 1_000_000))
@settings(max_examples=200)
def test_water_fill_kkt(raw, budget):
    items = [(f"i{k}", c, cap) for k, (c, cap) in enumerate(raw)]
    r = water_fill(items, budget)
    assert math.isclose(sum(r["grants"].values()) + r["unallocated"], budget, rel_tol=1e-6, abs_tol=1e-6)
    for i, c, cap in items:
        g = r["grants"][i]
        assert -1e-9 <= g <= cap + 1e-6
        if g < cap - 1e-3:
            assert c.marginal(g + 1e-3) <= r["lambda"] + 1e-6
        if g > 1e-3:
            assert c.marginal(g - 1e-3) >= r["lambda"] - 1e-6


def test_round_robin_and_pooled_disagree():
    s = {
        "applications": [{"id": "a", "cap": 100}, {"id": "b", "cap": 100}],
        "recommenders": [{"id": "r1"}, {"id": "r2"}],
        "funders": [{"id": "f", "budget": 100, "trust": {"r1": 1, "r2": 1}}],
        "curves": {
            "r1": {"a": {"points": [{"x": 0, "m": 10}]}},
            "r2": {"a": {"points": [{"x": 0, "m": 1}]}, "b": {"points": [{"x": 0, "m": 2}]}},
        },
    }
    assert round_robin(s, step=1) == {"a": 50, "b": 50}
    assert math.isclose(pooled(s)["a"], 100)


def test_conalfa_parser_checks_totals():
    line = "Guatemala               2,549,946     94.60       145,681       5.40      2,695,627      1,228,757     96.45      45,269        3.55     1,274,026      1,321,189   92.94   100,412      7.06     1,421,601"
    text = "\n".join(line.replace("Guatemala", name, 1) for name in [
        "Guatemala", "El Progreso", "Sacatepéquez", "Chimaltenango", "Escuintla", "Santa Rosa", "Sololá",
        "Totonicapán", "Quetzaltenango", "Suchitepéquez", "Retalhuleu", "San Marcos", "Huehuetenango", "Quiché",
        "Baja Verapaz", "Alta Verapaz", "Petén", "Izabal", "Zacapa", "Chiquimula", "Jalapa", "Jutiapa",
    ])
    rows = parse(text)
    assert len(rows) == 22
    assert rows[0]["illiterate"] == 145_681 and rows[0]["female_illiterate_pct"] == 7.06
