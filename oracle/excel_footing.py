"""Reference oracle for the 'spread footings' sheet. Usage: python excel_footing.py <workbook.xlsm> '<input JSON>'
Read-only, macros disabled, never saved. Output format matches cli/footing.mjs."""
import json
import sys

import win32com.client as w

from excel_beam import fmt
from excel_slab import IDX

OUT = {
    "fc": "AI6", "fs": "AB7", "n": "AB8", "k": "AB9", "j": "AB10", "R": "AB11", "qmaxY": "F16", "qminY": "F17",
    "qmaxX": "F20", "qminX": "F21", "qnMaxY": "F18", "qnMinY": "R18", "qnMaxX": "F22", "qnMinX": "R22",
    "dLong": "P25", "dShort": "P24", "Myy": "AF16", "V1yy": "AF17", "V2yy": "AF18", "Mxx": "AF20", "V1xx": "AF21",
    "V2xx": "AF22", "perimeter": "AU16", "dReqX": "X25", "dReqY": "AE25", "dOk": "AL25", "vc": "P26", "vX": "X26",
    "vY": "AE26", "vcp": "P27", "vpX": "X27", "vpY": "AE27", "uaL": "K29", "uL": "S29", "perimReqL": "K30",
    "perimL": "S30", "AsMinL": "AI29", "AsReqL": "AD30", "AsProvL": "AJ30", "AsOkL": "AL29", "uaS": "K31",
    "uS": "S31", "perimReqS": "K32", "perimS": "S32", "AsMinS": "AI31", "AsReqS": "AD32", "AsProvS": "AJ32",
    "AsOkS": "AL31", "ancL": "K33", "ancAvailL": "S33", "ancS": "K34", "ancAvailS": "S34", "nLong": "AJ33",
    "nShort": "AJ34", "uaD": "K36", "uD": "S36", "perimReqD": "K37", "perimD": "S37", "ancD": "K38",
    "ancUseD": "S38", "bearing": "AH14",
}


def norm(v):
    if v == "Ok.":
        return "OK"
    if v == "Fail":
        return "NG"
    return fmt(v)


def main():
    path, i = sys.argv[1], json.loads(sys.argv[2])
    xl = w.DispatchEx("Excel.Application")
    xl.Visible = False
    xl.DisplayAlerts = False
    xl.AutomationSecurity = 3
    try:
        wb = xl.Workbooks.Open(path, UpdateLinks=0, ReadOnly=True)
        ws = wb.Worksheets("spread footings")
        xl.Calculation = -4135
        cells = {"A1": 1 if i.get("capFc", True) else 2, "E6": i["fcPrime"], "E7": i["fy"], "E9": i["Es"],
                 "R6": i["cover"], "R7": i["t"], "R8": i["Bx"], "R9": i["By"], "R10": i["Df"], "R11": i["P"],
                 "R12": i["Mx"], "R13": i["My"], "AB12": i["qa"], "AB13": i["gamma"],
                 "AY4": 2 if i["pier"] == "circle" else 1, "D13": i["bx"], "D14": i["by"], "J13": i["D"],
                 "BE1": IDX[i["longBar"]], "BD1": IDX[i["shortBar"]], "BE19": IDX[i["dowelBar"]],
                 "AG33": i["sLong"], "AG34": i["sShort"], "AA36": i["dowelN"]}
        for a, v in cells.items():
            ws.Range(a).Value = v
        xl.Calculation = -4105
        xl.CalculateFull()
        sys.stdout.write("\n".join(f"{k}={norm(ws.Range(a).Value)}" for k, a in OUT.items()) + "\n")
        wb.Close(False)
    finally:
        xl.Quit()


if __name__ == "__main__":
    main()
