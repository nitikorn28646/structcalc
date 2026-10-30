"""Reference oracle: drive the original Beam sheet in Excel (macros disabled) with one section input.

Usage: python excel_beam.py <workbook.xlsm> '<section input JSON>'  → same key=value lines as cli/beam.mjs.
The workbook is opened read-only and never saved.
"""
import json
import sys
from decimal import ROUND_HALF_UP, Decimal

import win32com.client as w

TYPE = {"simple": 1, "one_end": 2, "both_ends": 3, "cantilever": 4}
BAR_IDX = {n: i + 2 for i, n in enumerate(
    ["RB 12", "RB 15", "RB 19", "RB 25", "DB 12", "DB 16", "DB 20", "DB 25", "DB 28", "DB 32"])}
STIR_IDX = {n: i + 1 for i, n in enumerate(["RB 6", "RB 9", "RB 12", "RB 15", "DB 10", "DB 12", "DB 16"])}
# (count cell main, count cell special, type cell main, type cell special) for layers 1..3
TOP = [("CI4", "CI5", "BD1", "BD4"), ("CI10", "CI11", "BD2", "BD5"), ("CI15", "CI16", "BD3", "BD6")]
BOT = [("CI22", "CI23", "BC3", "BC6"), ("CI28", "CI29", "BC2", "BC5"), ("CI34", "CI35", "BC1", "BC4")]

OUT = {
    "fc": "AG6", "fs": "AA7", "fsv": "AA8", "n": "AA9", "nOk": "AD9", "k": "AA10", "j": "AA11", "R": "AA12",
    "minDepth": "H14", "minDepthOk": "R14", "deepRatio": "H15", "deepLimit": "N15", "deepOk": "R15",
    "LbRatio": "H16", "dPrime": "X14", "d": "X15", "Mc": "X16", "mode": "AG16", "fsPrime": "X17",
    "M1": "AG14", "M2": "AG15", "As1": "X18", "As2": "AG18", "As": "X19", "AsPrime": "AG19", "AsMin": "X20",
    "AsMinOk": "AK20", "doublyCheck": "AB21", "Vc": "E18", "Vc1": "E19", "Vc2": "E20", "Vp": "E21",
    "VpOk": "N21", "AvS": "E22", "vb": "N24", "Ac": "N25", "AtS": "N26", "vt": "E27", "vtOk": "N27",
    "v": "E28", "vOk": "N28", "Ast": "E29", "AtotS": "Z24", "sMax": "Z25", "Amin": "Z26", "Aact": "Z27",
    "AminOk": "AG27", "stirrup": "AF29", "reqTop": "G32", "provTop": "K32", "reqBot": "G36", "provBot": "K36",
    "spacingTop": ["O32", "O33", "O34"], "spacingBot": ["O38", "O37", "O36"],
}
FLAGS = {"[Ok.]": "OK", "[Fail]": "NG", "[Fail!]": "NG", "[Steel beam]": "STEEL_BEAM",
         "Fail": "FAIL", "Check spacing": "CHECK_SPACING", "[Fail] Check fc'": "NG"}


def fmt(v):
    if isinstance(v, bool):
        return "NG" if v is False else "OK"
    if isinstance(v, int) and v < -2146820000:  # COM error code (#DIV/0!, #VALUE!, …)
        return "ERR"
    if isinstance(v, (int, float)):
        s = str(Decimal(v).quantize(Decimal("0.0001"), ROUND_HALF_UP))
        return "0.0000" if s == "-0.0000" else s
    if v is None:
        return "-"
    v = str(v).strip()
    if v in FLAGS:
        return FLAGS[v]
    if v.endswith("m.") and "@" in v:  # "1-RB 9 @ 0.1  m."
        return v[:-2].strip()
    return v


def main():
    path, inp = sys.argv[1], json.loads(sys.argv[2])
    xl = w.DispatchEx("Excel.Application")
    xl.Visible = False
    xl.DisplayAlerts = False
    xl.AutomationSecurity = 3
    try:
        wb = xl.Workbooks.Open(path, UpdateLinks=0, ReadOnly=True)
        ws, crit = wb.Worksheets("Beam"), wb.Worksheets("Design criteria")
        # Sheets are protected but every input cell is unlocked; F (fc/f'c) normally comes from the
        # locked criteria sheet, so it is fed through Beam!E8 only when it differs.
        xl.Calculation = -4135  # manual while writing inputs
        cells = {} if crit.Range("E9").Value == inp["F"] else {"E8": inp["F"]}
        cells |= {"AX4": TYPE[inp["type"]], "A1": 1 if inp.get("capFc", True) else 2,
                 "E7": inp["fcPrime"], "E9": inp["fy"], "E10": inp["fys"], "E11": inp["Es"],
                 "R6": inp["M"], "R7": inp["V"], "R8": inp["Mt"], "R9": inp["cover"],
                 "R10": inp["b"], "R11": inp["h"], "R12": inp["L"], "AI28": inp["s"],
                 "BI13": inp["stirrup"]["sets"], "BJ13": STIR_IDX[inp["stirrup"]["bar"]]}
        for face, layers in ((TOP, inp.get("top", [])), (BOT, inp.get("bottom", []))):
            for i, (cm, cs, tm, ts) in enumerate(face):
                lay = layers[i] if i < len(layers) else {}
                for cnt, typ, key in ((cm, tm, "main"), (cs, ts, "special")):
                    g = lay.get(key) or {}
                    n = g.get("n", 0)
                    cells[cnt] = n + 1
                    cells[typ] = BAR_IDX[g["bar"]] if n else 1
        for a, v in cells.items():
            ws.Range(a).Value = v
        xl.Calculation = -4105
        xl.CalculateFull()
        lines = []
        for k, a in OUT.items():
            if isinstance(a, list):
                lines.append(f"{k}=" + ",".join(fmt(ws.Range(x).Value) for x in a))
            else:
                lines.append(f"{k}={fmt(ws.Range(a).Value)}")
        sys.stdout.write("\n".join(lines) + "\n")
        wb.Close(False)
    finally:
        xl.Quit()


if __name__ == "__main__":
    main()
