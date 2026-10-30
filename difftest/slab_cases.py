"""Generate the slab differential-test scenario (reference = Excel oracle, candidate = JS engine)."""
import copy
import json
from pathlib import Path

from cases import PY, ROOT, XLSM

HERE = Path(__file__).parent
MAT = {"fcPrime": 140, "F": 0.45, "capFc": True, "fy": 2400, "Es": 2040000, "cover": 2, "unitWeight": 2400}
ONE = {**MAT, "support": "simple", "t": 0.1, "L": 1.3, "extra": 120, "live": 200, "mainBar": "RB 9", "tempBar": "RB 9"}
CAN = {**MAT, "t": 0.1, "L": 0.4, "P": 100, "a": 1, "extra": 50, "live": 100, "mainBar": "RB 9", "tempBar": "RB 9"}
TWO = {**MAT, "case": 5, "t": 0.1, "S": 1.7, "L": 3.3, "extra": 120, "live": 200, "shortBar": "RB 9", "longBar": "RB 9"}


def v(base, **kw):
    c = copy.deepcopy(base)
    c.update(kw)
    return c


CASES = [
    ("one-example", "oneway", ONE),
    ("one-one-end", "oneway", v(ONE, support="one_end", L=3, live=300)),
    ("one-both-ends-db12", "oneway", v(ONE, support="both_ends", L=3.5, t=0.12, fy=4000, mainBar="DB 12", tempBar="RB 9", fcPrime=180)),
    ("one-sd30-thin-fail", "oneway", v(ONE, fy=3000, L=4, t=0.08, live=400, mainBar="DB 10")),
    ("one-cap-off", "oneway", v(ONE, fcPrime=180, capFc=False, L=2.5)),
    ("can-example", "cantilever", CAN),
    ("can-long", "cantilever", v(CAN, L=1.5, t=0.15, P=300, a=1.5, live=300, mainBar="DB 12", fy=4000)),
    ("can-rb12", "cantilever", v(CAN, L=1.0, t=0.12, P=0, a=0, mainBar="RB 12", tempBar="RB 6")),
    ("two-example", "twoway", TWO),
    *[(f"two-case{c}-m{m}", "twoway", v(TWO, case=c, S=round(4 * m, 2), L=4, t=0.12, live=300))
      for c in (1, 2, 3, 4, 5) for m in (0.55, 0.73, 0.9, 1.0)],
    ("two-db12-sd40", "twoway", v(TWO, case=3, S=4, L=5, t=0.13, fy=4000, fcPrime=180, shortBar="DB 12", longBar="DB 10")),
    ("two-very-long", "twoway", v(TWO, case=2, S=2, L=6, t=0.1)),
]


def main():
    scen = {
        "name": "structcalc-slab-wsd",
        "targets": {
            "reference": {"cmd": [PY, "-X", "utf8", str(ROOT / "oracle" / "excel_slab.py"), XLSM]},
            "candidate": {"cmd": ["node", str(ROOT / "cli" / "slab.mjs")]},
        },
        "cases": [{"id": i, "type": "cli", "args": [k, json.dumps(c)], "compare": ["stdout", "exit_code"],
                   "timeout": 120} for i, k, c in CASES],
    }
    out = HERE / "slab.scenario.json"
    out.write_text(json.dumps(scen, ensure_ascii=False, indent=1), encoding="utf-8")
    print(out, len(CASES), "cases")


if __name__ == "__main__":
    main()
