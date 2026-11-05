"""Generate the tied-column differential-test scenario (reference = Excel oracle, candidate = JS engine)."""
import copy
import json
from pathlib import Path

from cases import PY, ROOT, XLSM

HERE = Path(__file__).parent
BASE = {  # the workbook's own example
    "fcPrime": 140, "fy": 3000, "fys": 2400, "cover": 2.5, "L": 3, "Bx": 20, "By": 20, "Es": 2040000,
    "P": 20000, "Mx": 500, "My": 0, "nx": 6, "ny": 4, "tieSets": 1, "frameCase": 2, "mainBar": "DB 16", "tieBar": "RB 6",
    "beamTL": {"L": 450, "b": 20, "t": 40}, "beamTR": {"L": 450, "b": 20, "t": 40},
    "beamBL": {"L": 450, "b": 20, "t": 45}, "beamBR": {"L": 450, "b": 20, "t": 45},
    "colTop": {"L": 700, "bx": 45, "by": 45}, "colThis": {"L": 400, "bx": 45, "by": 45},
    "colThisB": {"L": 700, "bx": 45, "by": 45}, "colBot": {"L": 150, "bx": 45, "by": 45},
}


def v(**kw):
    c = copy.deepcopy(BASE)
    c.update(kw)
    return c


CASES = [
    ("example", BASE),
    ("axial-only", v(Mx=0, My=0, P=30000)),
    ("biaxial-II", v(Mx=400, My=300, P=25000, Bx=25, By=25, nx=4, ny=4, mainBar="DB 12")),
    ("tension-ctrl-x", v(My=2500, Mx=300, P=6000, Bx=25, By=30, nx=6, ny=4, fy=4000, fcPrime=180)),
    ("tension-ctrl-y", v(Mx=2500, My=300, P=6000, Bx=30, By=25, nx=4, ny=6, fy=4000, fcPrime=180)),
    ("big-section", v(Bx=40, By=40, nx=8, ny=8, mainBar="DB 20", tieBar="RB 9", P=90000, Mx=3000, My=1500,
                      fcPrime=240, fy=4000)),
    ("rect-30x50", v(Bx=30, By=50, nx=6, ny=6, mainBar="DB 16", P=60000, Mx=4000, My=800, tieSets=2)),
    ("low-steel", v(Bx=30, By=30, nx=4, ny=4, mainBar="DB 12", P=40000, Mx=600, My=200)),
    *[(f"slender-case{c}", v(L=4.5, Bx=25, By=25, nx=4, ny=4, P=25000, Mx=700, My=500, frameCase=c))
      for c in (1, 2, 3, 4, 5)],
    ("slender-case1-axial", v(L=4.5, Bx=25, By=25, nx=4, ny=4, P=25000, Mx=0, My=0, frameCase=1)),
    ("slender-tension", v(L=4.0, Bx=25, By=25, nx=4, ny=4, P=5000, Mx=200, My=2000, frameCase=3, fy=4000)),
    ("sd50-db25", v(Bx=35, By=35, nx=4, ny=4, mainBar="DB 25", fy=5000, fcPrime=280, P=70000, Mx=2500, My=1000)),
    # column audit WP1 (2026-11-05): expected Excel defects, the program does NOT replicate them —
    # K2 axis pairing (narrow 20x50, My about the weak axis: the sheet compares ex with the By-depth limits → mode I, the program mode II)
    ("k2-rect-20x50-my", v(Bx=20, By=50, nx=4, ny=8, fy=4000, fcPrime=180, P=20000, Mx=100, My=1000)),
    # K1 tension-controlled slender column with Mx only: the sheet's R' = f(ebx/ex) with ex = 0 (#DIV/0! expected), the program uses ey/eby
    ("k1-mx-only-slender", v(L=4.5, Bx=25, By=25, nx=4, ny=4, P=4000, Mx=1800, My=0, frameCase=2, fy=4000)),
]


def main():
    scen = {
        "name": "structcalc-column-wsd",
        "targets": {
            "reference": {"cmd": [PY, "-X", "utf8", str(ROOT / "oracle" / "excel_column.py"), XLSM]},
            "candidate": {"cmd": ["node", str(ROOT / "cli" / "column.mjs")]},
        },
        "cases": [{"id": i, "type": "cli", "args": [json.dumps(c)], "compare": ["stdout", "exit_code"], "timeout": 120}
                  for i, c in CASES],
    }
    out = HERE / "column.scenario.json"
    out.write_text(json.dumps(scen, ensure_ascii=False, indent=1), encoding="utf-8")
    print(out, len(CASES), "cases")


if __name__ == "__main__":
    main()
