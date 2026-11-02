"""Reference of the continuous-beam differential test: solve each line of a difftest/frame3d/contbeam-*.json file with
PyNite (beam along X, Y up, pins at the supports) and print the same tokens as cli/contbeam-solve.mjs.
usage: python -X utf8 oracle/pynite_beam.py <lines.json>
"""
import json
import sys

from Pynite import FEModel3D


def fmt(v, d=1):
    return f"{0.0 if abs(v) < 0.5 * 10 ** -d else v:.{d}f}"


def solve(k, ln, out):
    x, sup, EI = ln["x"], ln["sup"], ln.get("EI") or [1] * (len(ln["x"]) - 1)
    fe = FEModel3D()
    fe.add_material("E", 1.0, 1.0, 0.2, 0)
    for i, v in enumerate(x):
        fe.add_node(f"N{i}", v, 0, 0)
        fe.def_support(f"N{i}", i == 0, bool(sup[i]), True, True, True, False)
    for e in range(len(x) - 1):
        fe.add_section(f"S{e}", 1e6, 1.0, EI[e], 1.0)
        fe.add_member(f"M{e}", f"N{e}", f"N{e + 1}", "E", f"S{e}")
    for ld in ln["loads"]:
        if "P" in ld:
            node = next((i for i, v in enumerate(x) if abs(v - ld["at"]) < 1e-9), None)
            if node is not None:
                fe.add_node_load(f"N{node}", "FY", -ld["P"])
            else:
                e = next(e for e in range(len(x) - 1) if x[e] < ld["at"] < x[e + 1])
                fe.add_member_pt_load(f"M{e}", "Fy", -ld["P"], ld["at"] - x[e])
            continue
        w = lambda t: ld["wa"] + (ld["wb"] - ld["wa"]) * (t - ld["a"]) / ((ld["b"] - ld["a"]) or 1)
        for e in range(len(x) - 1):
            a, b = max(ld["a"], x[e]), min(ld["b"], x[e + 1])
            if b - a > 1e-9:
                fe.add_member_dist_load(f"M{e}", "Fy", -w(a), -w(b), a - x[e], b - x[e])
    try:
        fe.analyze_linear()
    except Exception:
        out.append(f"L{k} error")
        return
    c = "Combo 1"
    out.append(f"L{k}R " + " ".join(fmt(fe.nodes[f"N{i}"].RxnFY[c]) for i in range(len(x))))
    out.append(f"L{k}D " + " ".join(fmt(-fe.nodes[f"N{i}"].DY[c] * 1000, 3) for i in range(len(x))))
    for e in range(len(x) - 1):
        mb = fe.members[f"M{e}"]
        L = mb.L()
        out.append(f"L{k}E{e} " + " ".join(fmt(-mb.moment("Mz", L * i / 10, c)) for i in range(11)))


def main(path):
    out = []
    for k, ln in enumerate(json.load(open(path, encoding="utf-8"))):
        solve(k, ln, out)
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1])
