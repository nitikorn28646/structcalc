"""Generate the wall-footing differential-test scenario (reference = Excel 'Wall footings', candidate = engine/wallFooting.js)."""
import copy
import json
from pathlib import Path

from cases import PY, ROOT, XLSM

HERE = Path(__file__).parent
BASE = {  # the workbook's own example
    "fcPrime": 240, "F": 0.45, "capFc": True, "fy": 3000, "Es": 2040000, "cover": 4, "t": 0.2, "B": 1.5, "Df": 0.5, "P": 10000, "M": 50,
    "qa": 8000, "gamma": 1600, "bw": 0.2, "longBar": "DB 12", "shortBar": "RB 9", "dowelBar": "DB 12", "sLong": 0.2, "sShort": 0.3, "dowelN": 4,
}


def v(**kw):
    c = copy.deepcopy(BASE)
    c.update(kw)
    return c


CASES = [
    ("example", BASE),
    ("no-moment", v(M=0, P=12000, B=1.2)),
    ("wide-heavy", v(P=25000, B=2.5, t=0.35, M=800, longBar="DB 16", sLong=0.15, qa=12000)),
    ("sr24", v(fy=2400, longBar="RB 12", shortBar="RB 9", dowelBar="RB 12", P=8000)),
    ("sd40", v(fy=4000, F=0.45, fcPrime=280, P=18000, B=1.8, t=0.25)),
    ("thin-fail", v(t=0.15, P=20000, B=1.0, qa=30000)),
    ("big-moment", v(M=2500, P=9000, B=1.6, t=0.3)),
    ("uncapped", v(capFc=False, fcPrime=320, P=30000, B=2.0, t=0.4, longBar="DB 20", sLong=0.2, shortBar="DB 12", sShort=0.25)),
]


def main():
    scen = {
        "name": "structcalc-wallfooting-wsd",
        "targets": {
            "reference": {"cmd": [PY, "-X", "utf8", str(ROOT / "oracle" / "excel_wallfooting.py"), XLSM]},
            "candidate": {"cmd": ["node", str(ROOT / "cli" / "footing.mjs"), "wall"]},
        },
        "cases": [{"id": i, "type": "cli", "args": [json.dumps(c)], "compare": ["stdout", "exit_code"], "timeout": 120} for i, c in CASES],
    }
    out = HERE / "wallfooting.scenario.json"
    out.write_text(json.dumps(scen, ensure_ascii=False, indent=1), encoding="utf-8")
    print(out, len(CASES), "cases")


if __name__ == "__main__":
    main()
