"""Generate the 4-pile cap differential-test scenario (reference = Excel '4 pile' sheet, candidate = JS engine)."""
import copy
import json
from pathlib import Path

from cases import PY, ROOT, XLSM

HERE = Path(__file__).parent
BASE = {  # the workbook's own example
    "n": 4, "fcPrime": 240, "F": 0.45, "capFc": False, "fy": 3000, "Es": 2040000, "cover": 5, "t": 0.45, "Df": 1.5,
    "P": 75000, "Mx": 5000, "My": 15000, "sx": 0.9, "sy": 0.9, "gamma": 1600, "pier": "rect", "bx": 0.4, "by": 0.4,
    "D": 0.2, "pile": "S-30", "pileL": 24, "fcPile": 350, "Ptest": 35000,
    "longBar": "DB 16", "shortBar": "DB 16", "dowelBar": "DB 20", "sLong": 0.1, "sShort": 0.1, "dowelN": 12,
}


def v(**kw):
    c = copy.deepcopy(BASE)
    c.update(kw)
    return c


CASES = [
    ("example", BASE),
    ("axial", v(Mx=0, My=0, P=100000)),
    ("no-test-load", v(Ptest=0, pileL=18)),
    ("short-pile", v(Ptest=0, pileL=6, pile="S-22", sx=0.75, sy=0.75)),
    ("i-pile", v(pile="I-26", sx=0.8, sy=0.8, P=60000, Mx=1000, My=2000)),
    ("bored", v(pile="Ø0.50", sx=1.5, sy=1.5, t=0.7, P=200000, Ptest=0, longBar="DB 20", shortBar="DB 20", sLong=0.15, sShort=0.15)),
    ("rect-spacing", v(sx=1.2, sy=0.9, P=90000)),
    ("thin-fail", v(t=0.3, P=120000)),
    ("pile8", v(n=8, sx=1.0, sy=1.0, P=180000, Mx=6000, My=9000, t=0.7, longBar="DB 20", shortBar="DB 20", sLong=0.15, sShort=0.15)),
    ("pile6", v(n=6, sx=0.9, sy=0.9, P=130000, Mx=4000, My=6000, t=0.6, longBar="DB 20", shortBar="DB 20", sLong=0.15, sShort=0.15)),
    ("pile5", v(n=5, sx=0.65, sy=0.65, P=120000, Mx=3000, My=5000, t=0.6, longBar="DB 20", shortBar="DB 20", sLong=0.15, sShort=0.15)),
    ("pile7", v(n=7, sx=1.0, sy=0.9, P=170000, Mx=4000, My=7000, t=0.7, longBar="DB 20", shortBar="DB 20", sLong=0.15, sShort=0.15)),
    ("pile9", v(n=9, sx=1.0, sy=1.0, P=220000, Mx=6000, My=6000, t=0.8, longBar="DB 20", shortBar="DB 20", sLong=0.15, sShort=0.15)),
    ("pile2", v(n=2, sx=1.2, sy=0, capWidth=0.8, P=60000, Mx=0, My=3000, t=0.6, longBar="DB 20", shortBar="DB 12", sLong=0.09, sShort=0.15, dowelN=6)),
    ("pile1", v(n=1, capWidth=0.8, P=25000, Mx=0, My=0, t=0.6, pileL=8, Ptest=20000, longBar="DB 12", sLong=0.085)),
    ("sd40-capped", v(fy=4000, capFc=True, fcPrime=180, longBar="DB 12", shortBar="DB 12", sLong=0.12, sShort=0.12)),
]


def main():
    scen = {
        "name": "structcalc-pilecap4-wsd",
        "targets": {
            "reference": {"cmd": [PY, "-X", "utf8", str(ROOT / "oracle" / "excel_pilecap.py"), XLSM]},
            "candidate": {"cmd": ["node", str(ROOT / "cli" / "footing.mjs"), "pilecap"]},
        },
        "cases": [{"id": i, "type": "cli", "args": [json.dumps(c)], "compare": ["stdout", "exit_code"], "timeout": 120}
                  for i, c in CASES],
    }
    out = HERE / "pilecap.scenario.json"
    out.write_text(json.dumps(scen, ensure_ascii=False, indent=1), encoding="utf-8")
    print(out, len(CASES), "cases")


if __name__ == "__main__":
    main()



