import json, subprocess, re, sys
def run(cmd): p = subprocess.run(cmd, capture_output=True, text=True, timeout=900); return p.stdout, p.returncode
def toks(s): return re.findall(r"[^\s=]+", s)
for scen in sys.argv[1:]:
    sc = json.load(open(scen, encoding="utf-8")); ok_all = 0
    ref = sc["targets"]["reference"]["cmd"]; can = sc["targets"]["candidate"]["cmd"]
    fix = lambda c: [("python3" if "python" in x.lower() and x.endswith(".exe") else x.replace("D:\\REA\\structcalc\\", "/home/user/structcalc/").replace("\\", "/")) for x in c if x not in ("-X", "utf8")]
    for c in sc["cases"]:
        args = [a.replace("D:\\REA\\structcalc\\", "/home/user/structcalc/").replace("\\", "/") for a in c["args"]]
        a, ea = run(fix(ref) + args); b, eb = run(fix(can) + args)
        at, bt = toks(a), toks(b); tol = c.get("tolerance", {}); abs_t, rel_t = tol.get("abs_tol", 0), tol.get("rel_tol", 0)
        bad = [] if len(at) == len(bt) else [f"token count {len(at)} vs {len(bt)}"]
        worst = 0
        for x, y in zip(at, bt):
            try:
                fx, fy = float(x), float(y); d = abs(fx - fy)
                if d > abs_t + rel_t * max(abs(fx), abs(fy)): bad.append(f"{x}≠{y}")
                if max(abs(fx), abs(fy)) > 1: worst = max(worst, d / max(abs(fx), abs(fy)))
            except ValueError:
                if x != y: bad.append(f"{x}≠{y}")
        ok = not bad and ea == eb; ok_all += ok
        print(f"{'ok  ' if ok else 'FAIL'} {c['id']}  max rel diff {worst*100:.3f} %  {' '.join(bad[:4])}")
    print(f"== {sc['name']}: {ok_all}/{len(sc['cases'])}")
