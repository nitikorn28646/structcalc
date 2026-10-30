"""Run one scenario case through both sides with a timeout (debug helper)."""
import json
import subprocess
import sys
import time

scen = json.load(open(sys.argv[1], encoding="utf-8"))
case = next(c for c in scen["cases"] if c["id"] == sys.argv[2])
for side in ("reference", "candidate"):
    t = time.time()
    try:
        p = subprocess.run(scen["targets"][side]["cmd"] + case["args"], capture_output=True, text=True,
                           encoding="utf-8", timeout=90)
        print(f"--- {side} rc={p.returncode} {time.time() - t:.1f}s\n{p.stdout[:400]}{p.stderr[-600:]}")
    except subprocess.TimeoutExpired:
        print(f"--- {side} TIMEOUT")
