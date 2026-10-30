"""Reference oracle for the 'Spiral columns' sheet. Usage: python excel_spiral.py <workbook.xlsm> '<input JSON>'
Read-only, macros disabled, never saved. Output format matches `cli/column.mjs spiral`."""
import json
import sys

import win32com.client as w

from excel_beam import fmt
from excel_slab import IDX

OUT = {
    "LdRatio": "U9", "slender": "AF6", "Ag": "P24", "Ast": "P13", "pg": "P14", "pgOk": "AJ48", "C": "E16",
    "dPrime": "E17", "Ds": "E18", "fs": "E9", "Ec": "AF8", "n": "AF9", "m": "P19", "Fb": "P21", "Fa": "P20",
    "Pac": "E13", "Pas": "E14", "Pa": "E15", "Po": "E23", "I": "E19", "Ms": "P15", "ea": "E20", "eb": "E21",
    "e": "E22", "Pb": "E24", "Ma": "P22", "Mb": "P23", "Mo": "P18", "mode": "Z48", "rTop": "AE33", "rBot": "AK33",
    "klr": "E27", "R": "E26", "Pd": "E12", "Mpd": "P12", "fa": "P16", "fb": "P17", "ratio": "AA49", "Dc": "AC15",
    "rhoS": "AC16", "sReq": "AC18", "sMax": "AJ18", "sReqOk": "AI18",
}
MODE = {"e < ea": "I", "ea ≤ e ≤ eb": "II", "e > eb": "III"}


def norm(k, v):
    if k == "slender":
        return "OK" if v == "Slender Columns" else "NG"
    if k == "pgOk":
        return "OK" if v == "Ok." else "NG"
    if k == "sReqOk":
        return "OK" if v == "≤" else "NG"
    if k == "mode":
        return MODE.get(v, "NONE")
    if k == "ratio" and isinstance(v, str):
        return "-"
    return fmt(v)


def main():
    path, inp = sys.argv[1], json.loads(sys.argv[2])
    xl = w.DispatchEx("Excel.Application")
    xl.Visible = False
    xl.DisplayAlerts = False
    xl.AutomationSecurity = 3
    try:
        wb = xl.Workbooks.Open(path, UpdateLinks=0, ReadOnly=True)
        ws = wb.Worksheets("Spiral columns")
        xl.Calculation = -4135
        i = inp
        cells = {"E6": i["fcPrime"], "E7": i["fy"], "E8": i["fys"], "U6": i["cover"], "U7": i["L"], "U8": i["D"],
                 "AF7": i["Es"], "E10": i["P"], "U10": i["Mx"], "AF10": i["My"], "AG13": i["nBars"],
                 "AC19": i["sSpiral"], "AY4": i["frameCase"], "BE1": IDX[i["mainBar"]], "BD1": IDX[i["spiralBar"]]}
        for key, (Lc, bc, tc) in {"beamTL": ("F31", "I31", "L31"), "beamTR": ("F33", "I33", "L33"),
                                  "beamBL": ("S31", "V31", "Y31"), "beamBR": ("S33", "V33", "Y33")}.items():
            cells |= {Lc: i[key]["L"], bc: i[key]["b"], tc: i[key]["t"]}
        for key, (Lc, dc) in {"colTop": ("AB31", "AE31"), "colThis": ("AB32", "AE32"),
                              "colThisB": ("AH31", "AK31"), "colBot": ("AH32", "AK32")}.items():
            cells |= {Lc: i[key]["L"], dc: i[key]["D"]}
        for a, v in cells.items():
            ws.Range(a).Value = v
        xl.Calculation = -4105
        xl.Iteration = True  # same circular slenderness logic as the tied-column sheet
        xl.CalculateFull()
        sys.stdout.write("\n".join(f"{k}={norm(k, ws.Range(a).Value)}" for k, a in OUT.items()) + "\n")
        wb.Close(False)
    finally:
        xl.Quit()


if __name__ == "__main__":
    main()
