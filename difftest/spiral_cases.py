"""Generate the spiral-column differential-test scenario (reference = Excel oracle, candidate = JS engine)."""
import copy
import json
from pathlib import Path

from cases import PY, ROOT, XLSM

HERE = Path(__file__).parent
BASE = {  # the workbook's own example
    "fcPrime": 240, "fy": 3000, "fys": 2400, "cover": 3, "L": 5, "D": 50, "Es": 2040000, "P": 15000, "Mx": 2000,
    "My": 2000, "nBars": 12, "sSpiral": 7, "frameCase": 2, "mainBar": "RB 25", "spiralBar": "RB 9",
    "beamTL": {"L": 450, "b": 20, "t": 40}, "beamTR": {"L": 450, "b": 20, "t": 40},
    "beamBL": {"L": 450, "b": 20, "t": 45}, "beamBR": {"L": 450, "b": 20, "t": 45},
    "colTop": {"L": 950, "D": 40}, "colThis": {"L": 950, "D": 35}, "colThisB": {"L": 950, "D": 40},
    "colBot": {"L": 950, "D": 35},
}


def v(**kw):
    c = copy.deepcopy(BASE)
    c.update(kw)
    return c


CASES = [
    ("example", BASE),
    ("axial", v(Mx=0, My=0, P=120000)),
    ("compression-bending", v(P=90000, Mx=2500, My=1500, mainBar="DB 20", nBars=8, fy=4000)),
    ("tension-ctrl", v(P=8000, Mx=4000, My=3000, mainBar="DB 20", nBars=8, fy=4000)),
    ("d40-db16", v(D=40, nBars=8, mainBar="DB 16", P=60000, Mx=1200, My=500, fcPrime=180, fy=4000, sSpiral=5)),
    ("d60-db25", v(D=60, nBars=10, mainBar="DB 25", P=180000, Mx=6000, My=3000, fcPrime=280, fy=5000)),
    ("rb12-spiral", v(spiralBar="RB 12", sSpiral=9, P=70000)),
    *[(f"slender-case{c}", v(L=7, D=40, nBars=8, mainBar="DB 20", P=50000, Mx=1500, My=1000, frameCase=c))
      for c in (1, 2, 3, 4, 5)],
]


def main():
    scen = {
        "name": "structcalc-spiral-wsd",
        "targets": {
            "reference": {"cmd": [PY, "-X", "utf8", str(ROOT / "oracle" / "excel_spiral.py"), XLSM]},
            "candidate": {"cmd": ["node", str(ROOT / "cli" / "column.mjs"), "spiral"]},
        },
        "cases": [{"id": i, "type": "cli", "args": [json.dumps(c)], "compare": ["stdout", "exit_code"], "timeout": 120}
                  for i, c in CASES],
    }
    out = HERE / "spiral.scenario.json"
    out.write_text(json.dumps(scen, ensure_ascii=False, indent=1), encoding="utf-8")
    print(out, len(CASES), "cases")


if __name__ == "__main__":
    main()
