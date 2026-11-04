"""Generate the analysis differential-test scenarios: reference = PyNite (open-source FEA, oracle/pynite_*.py),
candidate = our engines (cli/frame3d-solve.mjs = engine/frame3d.js, cli/contbeam-solve.mjs = engine/contBeam.js).
Models come from `node cli/frame3d-export.mjs` (difftest/frame3d/*.json). Tolerance: linear 0.01 % (rounding only);
P-Delta 0.5 % (both iterate the geometric stiffness, PyNite to convergence, ours 4 passes)."""
import json
from pathlib import Path

from cases import PY, ROOT

HERE = Path(__file__).parent
FRAMES = ["portal-fixed", "box-pinned-secondary", "box-fixed-secondary", "two-storey-lateral", "two-storey-pdelta", "yasothon-linear", "yasothon-pdelta", "arc-beam", "stair-landing-beam"]
BEAMS = ["contbeam-hand", "contbeam-yasothon"]


def case(name):
    tol = {"abs_tol": 0.5, "rel_tol": 0.005 if "pdelta" in name else 0.0001}
    return {"id": name, "type": "cli", "args": [str(HERE / "frame3d" / f"{name}.json")], "compare": ["stdout", "exit_code"], "tolerance": tol, "timeout": 600}


def write(fname, title, oracle, cand, names):
    scen = {"name": title,
            "targets": {"reference": {"cmd": [PY, "-X", "utf8", str(ROOT / "oracle" / oracle)]}, "candidate": {"cmd": ["node", str(ROOT / "cli" / cand)]}},
            "cases": [case(n) for n in names]}
    out = HERE / fname
    out.write_text(json.dumps(scen, ensure_ascii=False, indent=1), encoding="utf-8")
    print(out, len(names), "cases")


if __name__ == "__main__":
    write("frame3d.scenario.json", "structcalc-frame3d-vs-pynite", "pynite_frame.py", "frame3d-solve.mjs", FRAMES)
    write("contbeam.scenario.json", "structcalc-contbeam-vs-pynite", "pynite_beam.py", "contbeam-solve.mjs", BEAMS)
