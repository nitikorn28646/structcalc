"""Generate the beam differential-test scenario (reference = Excel oracle, candidate = JS engine)."""
import copy
import json
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
XLSM = r"D:\001_NITIKORN WONGSRILA\011_รายการคำนวน\RC Design WSD & Steel roof Design ASD(New) ไผ่ ขอนเเก่น .xlsm"
PY = r"D:\REA\rea-lab\.venv\Scripts\python.exe"

BASE = {  # the workbook's own example (beam B6)
    "type": "both_ends", "fcPrime": 140, "F": 0.45, "capFc": True, "fy": 3000, "fys": 2400, "Es": 2040000,
    "cover": 2.5, "b": 0.2, "h": 0.5, "L": 5, "M": 4500, "V": 9000, "Mt": 50, "s": 0.1,
    "stirrup": {"bar": "RB 9", "sets": 1},
    "top": [{"main": {"n": 2, "bar": "DB 16"}, "special": {"n": 1, "bar": "DB 16"}}],
    "bottom": [{"main": {"n": 2, "bar": "DB 16"}, "special": {"n": 1, "bar": "DB 16"}},
               {"special": {"n": 2, "bar": "DB 16"}}],
}


def var(id_, **kw):
    c = copy.deepcopy(BASE)
    c.update(kw)
    return id_, c


CASES = [
    var("b6-example"),
    var("singly-low-moment", M=2000, V=4000, Mt=0),
    var("simple-span", type="simple", M=3000, L=4.5, V=3500),
    var("one-end", type="one_end", M=5200, V=7000, Mt=120, s=0.15),
    var("cantilever", type="cantilever", M=2500, L=1.5, V=4000, h=0.4),
    # F (fc/f'c) is a locked cell in the reference workbook, so only F=0.45 can be exercised.
    var("fy4000", fy=4000, fcPrime=180, M=6000),
    var("fy5000", fy=5000, fcPrime=240, M=7000, V=12000),
    var("fc-cap-off", fcPrime=180, capFc=False, M=6500),
    var("fc-cap-on", fcPrime=180, M=6500),
    var("high-shear", V=16000, s=0.1),
    var("shear-too-high", V=30000),
    var("wide-deep", b=0.3, h=0.8, L=7, M=15000, V=14000, Mt=300,
        stirrup={"bar": "RB 12", "sets": 2}, s=0.15,
        top=[{"main": {"n": 3, "bar": "DB 20"}}],
        bottom=[{"main": {"n": 3, "bar": "DB 20"}, "special": {"n": 1, "bar": "DB 25"}},
                {"main": {"n": 2, "bar": "DB 20"}}]),
    var("narrow-beam", b=0.15, L=5, h=0.45, M=2500, V=3000),
    var("deep-check-fail", type="one_end", h=0.9, L=2, M=3000),
    var("spacing-too-wide", s=0.35, V=3000, M=2000),
    var("three-layers", M=9000, V=9000,
        bottom=[{"main": {"n": 2, "bar": "DB 20"}}, {"main": {"n": 2, "bar": "DB 16"}},
                {"main": {"n": 2, "bar": "DB 12"}}]),
    var("rb-bars", fy=2400, fys=2400, M=2500, V=3000,
        top=[{"main": {"n": 2, "bar": "RB 15"}}], bottom=[{"main": {"n": 3, "bar": "RB 19"}}],
        stirrup={"bar": "RB 6", "sets": 1}),
    var("db10-stirrup-2sets", stirrup={"bar": "DB 10", "sets": 2}, s=0.2, V=6000),
]


def main():
    scen = {
        "name": "structcalc-beam-wsd",
        "targets": {
            "reference": {"cmd": [PY, "-X", "utf8", str(ROOT / "oracle" / "excel_beam.py"), XLSM]},
            "candidate": {"cmd": ["node", str(ROOT / "cli" / "beam.mjs")]},
        },
        "cases": [{"id": i, "type": "cli", "args": [json.dumps(c)], "compare": ["stdout", "exit_code"],
                   "timeout": 120} for i, c in CASES],
    }
    out = HERE / "beam.scenario.json"
    out.write_text(json.dumps(scen, ensure_ascii=False, indent=1), encoding="utf-8")
    print(out, len(CASES), "cases")


if __name__ == "__main__":
    main()
