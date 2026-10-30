"""Generate the stair differential-test scenario (reference = Excel oracle 'Stair1', candidate = JS engine)."""
import copy
import json
from pathlib import Path

from cases import PY, ROOT, XLSM

HERE = Path(__file__).parent
BASE = {  # the workbook's own example
    "fcPrime": 140, "F": 0.45, "capFc": True, "fy": 2400, "Es": 2040000, "cover": 2, "unitWeight": 2400,
    "t": 0.2, "L": 2.85, "tread": 0.25, "riser": 0.2, "width": 1.25, "extra": 120, "live": 200,
    "mainBar": "DB 12", "tempBar": "RB 9",
}


def v(**kw):
    c = copy.deepcopy(BASE)
    c.update(kw)
    return c


CASES = [
    ("example", BASE),
    ("residential", v(t=0.15, L=3.0, tread=0.27, riser=0.17, live=300, fcPrime=180, mainBar="DB 12", tempBar="RB 6")),
    ("steep", v(tread=0.22, riser=0.2, L=2.4, t=0.13)),
    ("long-sd30", v(L=4.2, t=0.17, fy=3000, mainBar="DB 16", live=400)),
    ("sd40", v(fy=4000, fcPrime=240, L=3.6, t=0.15, mainBar="DB 12", tempBar="DB 10")),
    ("rb-bars", v(fy=2400, mainBar="RB 12", tempBar="RB 6", t=0.12, L=2.5)),
    ("thin-fail", v(t=0.1, L=4.0, live=500)),
]


def main():
    scen = {
        "name": "structcalc-stair-wsd",
        "targets": {
            "reference": {"cmd": [PY, "-X", "utf8", str(ROOT / "oracle" / "excel_slab.py"), XLSM]},
            "candidate": {"cmd": ["node", str(ROOT / "cli" / "slab.mjs")]},
        },
        "cases": [{"id": i, "type": "cli", "args": ["stair", json.dumps(c)], "compare": ["stdout", "exit_code"],
                   "timeout": 120} for i, c in CASES],
    }
    out = HERE / "stair.scenario.json"
    out.write_text(json.dumps(scen, ensure_ascii=False, indent=1), encoding="utf-8")
    print(out, len(CASES), "cases")


if __name__ == "__main__":
    main()
