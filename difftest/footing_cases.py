"""Generate the spread-footing differential-test scenario (reference = Excel oracle, candidate = JS engine)."""
import copy
import json
from pathlib import Path

from cases import PY, ROOT, XLSM

HERE = Path(__file__).parent
BASE = {  # the workbook's own example
    "fcPrime": 240, "F": 0.45, "capFc": True, "fy": 3000, "Es": 2040000, "cover": 5, "t": 0.2, "Bx": 1.4, "By": 1.4,
    "Df": 1, "P": 15000, "Mx": 100, "My": 180, "qa": 10000, "gamma": 1600, "pier": "rect", "bx": 0.2, "by": 0.2,
    "D": 0.2, "longBar": "DB 12", "shortBar": "DB 12", "dowelBar": "DB 12", "sLong": 0.15, "sShort": 0.15, "dowelN": 8,
}


def v(**kw):
    c = copy.deepcopy(BASE)
    c.update(kw)
    return c


CASES = [
    ("example", BASE),
    ("axial-only", v(Mx=0, My=0, P=25000, Bx=1.6, By=1.6, t=0.3)),
    ("rect-footing", v(Bx=2.0, By=1.5, P=40000, Mx=800, My=1500, t=0.35, longBar="DB 16", sLong=0.2)),
    ("circle-pier", v(pier="circle", D=0.3, P=30000, Bx=1.8, By=1.8, t=0.3)),
    ("sr24", v(fy=2400, longBar="RB 15", shortBar="RB 15", dowelBar="RB 15", P=12000)),
    ("heavy-thick", v(P=120000, Bx=3.0, By=3.0, t=0.6, bx=0.4, by=0.4, longBar="DB 20", shortBar="DB 20",
                      sLong=0.15, sShort=0.15, fcPrime=280, fy=4000, qa=15000, Mx=2000, My=3000)),
    ("uplift-edge", v(P=8000, Mx=2500, My=200)),
    ("over-pressure", v(P=40000, Bx=1.2, By=1.2)),
]


def main():
    scen = {
        "name": "structcalc-footing-wsd",
        "targets": {
            "reference": {"cmd": [PY, "-X", "utf8", str(ROOT / "oracle" / "excel_footing.py"), XLSM]},
            "candidate": {"cmd": ["node", str(ROOT / "cli" / "footing.mjs")]},
        },
        "cases": [{"id": i, "type": "cli", "args": [json.dumps(c)], "compare": ["stdout", "exit_code"], "timeout": 120}
                  for i, c in CASES],
    }
    out = HERE / "footing.scenario.json"
    out.write_text(json.dumps(scen, ensure_ascii=False, indent=1), encoding="utf-8")
    print(out, len(CASES), "cases")


if __name__ == "__main__":
    main()
