"""Reference of the 3D frame differential test: solve a difftest/frame3d/*.json model with PyNite (open-source 3D frame
FEA, pip PyNiteFEA) and print the same tokens as cli/frame3d-solve.mjs.

Independent of engine/frame3d.js except the inputs: geometry, supports, loads, and the cracked section properties and
end releases written by cli/frame3d-export.mjs. Our axes (x, y, z up) map to PyNite's (X = x, Y = z up, Z = -y);
beams bend in the vertical plane about PyNite local z, so our Iy (vertical plane) is PyNite Iz.
usage: python -X utf8 oracle/pynite_frame.py <model.json>
"""
import json
import sys

import numpy as np
from Pynite import FEModel3D


def to_pn(v):  # our (x, y, z) -> PyNite (X, Y, Z)
    return [v[0], v[2], -v[1]]


def from_pn(v):  # PyNite (X, Y, Z) -> our (x, y, z)
    return [v[0], -v[2], v[1]]


def fmt(v, d=1):
    return f"{0.0 if abs(v) < 0.5 * 10 ** -d else v:.{d}f}"


def main(path):
    m = json.load(open(path, encoding="utf-8"))
    fe = FEModel3D()
    E = m["E"]
    for i, n in enumerate(m["nodes"]):
        X, Y, Z = to_pn([n["x"], n["y"], n["z"]])
        fe.add_node(f"N{i}", X, Y, Z)
        if n.get("fixed"):
            fe.def_support(f"N{i}", True, True, True, True, True, True)
        elif n.get("pinned"):
            fe.def_support(f"N{i}", True, True, True, False, False, False)
        if not n.get("fixed"):  # as engine/frame3d.js: a 1e-3 kg-m/rad spring keeps joints of only pinned ends from spinning
            for d in ("RX", "RY", "RZ"):
                fe.def_support_spring(f"N{i}", d, 1e-3)
    for k, e in enumerate(m["members"]):
        s = e["sec"]
        fe.add_material(f"C{k}", E, s["G"], 0.2, 0)
        fe.add_section(f"S{k}", s["A"], s["Iz"], s["Iy"], s["J"])  # swap: our local y/z are PyNite's z/y
        fe.add_member(f"M{k}", f"N{e['i']}", f"N{e['j']}", f"C{k}", f"S{k}")
        rel = set(e.get("rel", []))
        if rel:
            fe.def_releases(f"M{k}", *[d in rel for d in range(12)])
        for ld in e.get("loads", []):
            if "P" in ld:
                fe.add_member_pt_load(f"M{k}", "FY", -ld["P"], ld["at"])
            else:
                fe.add_member_dist_load(f"M{k}", "FY", -ld["wa"], -ld["wb"], ld["a"], ld["b"])
        T = sum(e.get("torque", []))
        if T:
            L = np.linalg.norm(np.subtract(*[[m["nodes"][e[q]][c] for c in "xyz"] for q in ("j", "i")]))
            fe.add_member_pt_load(f"M{k}", "Mx", T, L / 2)
    for ld in m.get("nodeLoads", []):
        fe.add_node_load(f"N{ld['n']}", "FY", -ld["P"])
    for ld in m.get("lateral", []):
        Fx, Fy = ld["F"]
        X, _, Z = to_pn([Fx, Fy, 0])
        if X:
            fe.add_node_load(f"N{ld['n']}", "FX", X)
        if Z:
            fe.add_node_load(f"N{ld['n']}", "FZ", Z)
    if m.get("pDelta"):
        fe.add_load_combo("Combo 1", {"Case 1": 1.0})
        fe.analyze_PDelta(check_stability=False)
    else:
        fe.analyze_linear(check_stability=False)
    c = "Combo 1"
    out = []
    for i, n in enumerate(m["nodes"]):
        nd = fe.nodes[f"N{i}"]
        if n.get("fixed") or n.get("pinned"):
            F = from_pn([nd.RxnFX[c], nd.RxnFY[c], nd.RxnFZ[c]])
            M = from_pn([nd.RxnMX[c], nd.RxnMY[c], nd.RxnMZ[c]])
            out.append(f"R{i} " + " ".join(fmt(v) for v in F + M))
    for i in range(len(m["nodes"])):
        nd = fe.nodes[f"N{i}"]
        out.append(f"U{i} " + " ".join(fmt(v * 1000, 3) for v in from_pn([nd.DX[c], nd.DY[c], nd.DZ[c]])))
    for k, e in enumerate(m["members"]):
        mb = fe.members[f"M{k}"]
        f = np.asarray(mb.f(c)).flatten()
        T = np.asarray(mb.T())[:3, :3]
        g = []
        for b in range(4):
            g += from_pn(T.T @ f[b * 3:b * 3 + 3])
        out.append(f"F{k} " + " ".join(fmt(v) for v in g))
        if e["kind"] == "beam":
            L = mb.L()
            Ms = [mb.moment("Mz", L * i / 20, c) for i in range(21)]
            # PyNite Mz for a member along +x with y up is positive hogging -> our sagging + = -Mz
            Ms = [-v for v in Ms]
            out.append(f"M{k} {fmt(max(0, *Ms))} {fmt(min(0, *Ms))}")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1])
