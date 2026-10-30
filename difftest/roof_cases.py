"""Generate the steel-roof differential-test scenario (purlin, rafter, hip/valley, ridge/pole plate)."""
import json
from pathlib import Path

from cases import PY, ROOT, XLSM

HERE = Path(__file__).parent
STEEL = {"grade": "Fe-24", "E": 2100000}
PURLIN = {**STEEL, "type": "C", "name": "100x50x20x2.3", "roofing": 7, "selfW": 4.06, "live": 30, "wind": 50, "extra": 15,
          "rise": 1, "width": 6, "s": 1, "D": 1, "sagRows": 1, "rodFy": 2400}
RAFTER = {**STEEL, "type": "C", "name": "100x50x20x2.3", "roofing": 50, "purlinW": 1, "live": 50, "wind": 60, "extra": 15,
          "selfW": 4.06, "rise": 1, "overhang": 1, "run": 3, "D": 1, "s": 1}
HIP = {**STEEL, "type": "C", "name": "125x50x20x2.3", "selfW": 4.06, "transfer": 300, "rise": 1.8, "overhang": 1, "run": 2.15, "count": 2}
RIDGE = {**STEEL, "type": "C", "name": "125x50x20x2.3", "selfW": 4.51, "transfer": 300, "L": 3, "count": 2}

CASES = [
    ("purlin-example", "purlin", PURLIN),
    ("purlin-no-sag", "purlin", {**PURLIN, "sagRows": 0}),
    ("purlin-no-wind", "purlin", {**PURLIN, "wind": 0, "sagRows": 0, "D": 1.2}),
    ("purlin-sag2-tile", "purlin", {**PURLIN, "roofing": 50, "s": 0.8, "D": 1.5, "sagRows": 2, "rise": 2.5, "width": 8, "name": "125x50x20x2.3"}),
    ("purlin-shs-fe30", "purlin", {**PURLIN, "type": "SHS", "name": "50x50x2.3", "grade": "Fe-30", "sagRows": 0, "D": 1.1}),
    ("purlin-rhs-sag3", "purlin", {**PURLIN, "type": "RHS", "name": "75x45x2.3", "sagRows": 3, "D": 2.0, "wind": 80}),
    ("rafter-example", "rafter", RAFTER),
    ("rafter-no-wind", "rafter", {**RAFTER, "wind": 0}),
    ("rafter-long", "rafter", {**RAFTER, "rise": 2.2, "run": 4.5, "overhang": 0.8, "D": 1.2, "s": 0.9, "name": "150x50x20x2.3"}),
    ("rafter-rhs", "rafter", {**RAFTER, "type": "RHS", "name": "100x50x2.3", "roofing": 15, "rise": 1.5, "run": 3.5, "overhang": 0.6}),
    ("hip-example", "hip", HIP),
    ("hip-single", "hip", {**HIP, "count": 1, "transfer": 180}),
    ("valley-example", "valley", {**HIP, "overhang": 1.1, "run": 3.14}),
    ("valley-rhs", "valley", {**HIP, "type": "RHS", "name": "150x50x3.2", "count": 1, "rise": 2.4, "run": 4, "overhang": 0.7}),
    ("ridge-example", "ridge", RIDGE),
    ("ridge-single", "ridge", {**RIDGE, "count": 1, "L": 2.5, "transfer": 220}),
    ("plate-example", "plate", {**RIDGE, "selfW": 4.96, "transfer": 140, "L": 5, "name": "150x50x20x2.3"}),
    ("purlin-channel", "purlin", {**PURLIN, "type": "CH", "name": "100x50x5x7.5", "sagRows": 0, "D": 3.0}),
    ("ridge-channel", "ridge", {**RIDGE, "type": "CH", "name": "150x75x6.5x10", "count": 1, "L": 5}),
    ("plate-shs", "plate", {**RIDGE, "type": "SHS", "name": "100x100x3.2", "count": 1, "L": 4, "transfer": 250}),
]


def main():
    scen = {
        "name": "structcalc-roof-asd",
        "targets": {
            "reference": {"cmd": [PY, "-X", "utf8", str(ROOT / "oracle" / "excel_roof.py"), XLSM]},
            "candidate": {"cmd": ["node", str(ROOT / "cli" / "roof.mjs")]},
        },
        "cases": [{"id": i, "type": "cli", "args": [k, json.dumps(c)], "compare": ["stdout", "exit_code"], "timeout": 120}
                  for i, k, c in CASES],
    }
    out = HERE / "roof.scenario.json"
    out.write_text(json.dumps(scen, ensure_ascii=False, indent=1), encoding="utf-8")
    print(out, len(CASES), "cases")


if __name__ == "__main__":
    main()
