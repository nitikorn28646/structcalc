import json, subprocess, sys
scen = json.load(open(sys.argv[2] if len(sys.argv) > 2 else "column.scenario.json", encoding="utf-8"))
case = next(c for c in scen["cases"] if c["id"] == sys.argv[1])
outs = [subprocess.run(scen["targets"][s]["cmd"] + case["args"], capture_output=True, text=True, encoding="utf-8", timeout=120)
        for s in ("reference", "candidate")]
for o in outs:
    if o.returncode: print("ERR", o.stderr[-800:])
a, b = (o.stdout.splitlines() for o in outs)
diff = [f"{x}  |  {y}" for x, y in zip(a, b) if x != y]
print(len(a), len(b), "diffs:", len(diff)); print("\n".join(diff))

