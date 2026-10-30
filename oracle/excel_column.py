"""Reference oracle for the 'Tied Columns' sheet. Usage: python excel_column.py <workbook.xlsm> '<input JSON>'
Read-only, macros disabled, never saved. Output format matches cli/column.mjs."""
import json
import sys

import win32com.client as w

from excel_beam import fmt
from excel_slab import IDX

OUT = {
    "LbRatio": "AF6", "slender": "P34", "fs": "E9", "Ec": "AF8", "n": "AF9", "m": "P15", "Fb": "P16", "Fa": "P17",
    "Ag": "E16", "Ast": "P14", "pg": "E14", "pgOk": "AJ49", "nBars": "BK18", "dPrime": "E23", "gBx": "E18",
    "gBy": "P18", "Pa": "P12", "Pas": "E13", "Pac": "P13", "Po": "E15", "Ix": "E19", "Iy": "P19", "ex": "E20",
    "ey": "P20", "eax": "E21", "eay": "P21", "ebx": "E22", "eby": "P22", "Msx": "E27", "Msy": "P27", "Pbx": "E30",
    "Pby": "P30", "Mbx": "E28", "Mby": "P28", "Max": "E29", "May": "P29", "Mox": "E26", "Moy": "P26", "mode": "Z49",
    "rTop": "Z41", "rBot": "AI41", "klr": "E33", "R": "E34", "Pd": "E12", "Mxd": "E31", "Myd": "P31", "fa": "E17",
    "fbx": "E25", "fby": "P25", "ratio": "AB50", "sTie": "AD19", "tieText": "AI17",
}
MODE = {"e < ea": "I", "ea ≤ e ≤ eb": "II", "e > eb": "III"}


def norm(k, v):
    if k == "slender":
        return "OK" if v == "Slender Columns" else "NG"
    if k == "pgOk":
        return "OK" if v == "Ok." else "NG"
    if k == "mode":
        return MODE.get(v, "NONE")
    if k == "ratio" and isinstance(v, str):
        return "-"
    if k == "tieText":
        return v[:-2].strip() if v.endswith("m.") else v
    return fmt(v)


def main():
    path, inp = sys.argv[1], json.loads(sys.argv[2])
    xl = w.DispatchEx("Excel.Application")
    xl.Visible = False
    xl.DisplayAlerts = False
    xl.AutomationSecurity = 3
    try:
        wb = xl.Workbooks.Open(path, UpdateLinks=0, ReadOnly=True)
        ws = wb.Worksheets("Tied Columns")
        xl.Calculation = -4135
        i = inp
        cells = {"E6": i["fcPrime"], "E7": i["fy"], "E8": i["fys"], "U6": i["cover"], "U7": i["L"], "U8": i["Bx"],
                 "U9": i["By"], "AF7": i["Es"], "E10": i["P"], "U10": i["Mx"], "AF10": i["My"], "AG13": i["nx"],
                 "AG14": i["ny"], "AL16": i["tieSets"], "AY4": i["frameCase"], "BE1": IDX[i["mainBar"]],
                 "BD1": IDX[i["tieBar"]]}
        for key, (Lc, bc, tc) in {"beamTL": ("E39", "H39", "J39"), "beamTR": ("E41", "H41", "J41"),
                                  "beamBL": ("O39", "R39", "T39"), "beamBR": ("O41", "R41", "T41")}.items():
            cells |= {Lc: i[key]["L"], bc: i[key]["b"], tc: i[key]["t"]}
        for key, (Lc, xc, yc) in {"colTop": ("V39", "Y39", "AB39"), "colThis": ("V40", "Y40", "AB40"),
                                  "colThisB": ("AE39", "AH39", "AK39"), "colBot": ("AE40", "AH40", "AK40")}.items():
            cells |= {Lc: i[key]["L"], xc: i[key]["bx"], yc: i[key]["by"]}
        for a, v in cells.items():
            ws.Range(a).Value = v
        xl.Calculation = -4105
        xl.Iteration = True  # the sheet's slenderness logic is circular (R ↔ eccentricity) but converges at once
        xl.CalculateFull()
        sys.stdout.write("\n".join(f"{k}={norm(k, ws.Range(a).Value)}" for k, a in OUT.items()) + "\n")
        wb.Close(False)
    finally:
        xl.Quit()


if __name__ == "__main__":
    main()
