"""Reference oracle for the 'Wall footings' sheet (F = the workbook's own: "Design criteria" is protected, cases use 0.45) (strip footing per metre of wall). Usage: python excel_wallfooting.py <workbook.xlsm> '<input JSON>'
Read-only, macros disabled, never saved. Output format matches `node cli/footing.mjs wall`."""
import json
import sys

import win32com.client as w

from excel_beam import fmt
from excel_slab import IDX

OUT = {
    "fc": "AI6", "fs": "AB7", "n": "AB8", "k": "AB9", "j": "AB10", "R": "AB11", "qmax": "F20", "qmin": "F21", "qnMax": "F22", "qnMin": "R22",
    "qFace": "AU11", "M": "AF16", "V": "AF17", "d": "P25", "d2": "P24", "dReq": "AE25", "vc": "P26", "v": "AE26", "nMain": "AJ33",
    "AsMin": "AI29", "AsReq": "AD30", "AsProv": "AJ30", "uMax": "K30", "u": "S30", "perimReq": "K31", "perim": "S31", "anc": "K32",
    "ancAvail": "S32", "nTemp": "AJ34", "AsTempMin": "AI31", "AsTemp": "AJ32", "uaD": "K36", "uD": "S36", "perimReqD": "K37",
    "perimD": "S37", "ancD": "K38", "ancUseD": "S38", "bearing": "AH14",
}


def main():
    path, i = sys.argv[1], json.loads(sys.argv[2])
    xl = w.DispatchEx("Excel.Application")
    xl.Visible = False
    xl.DisplayAlerts = False
    xl.AutomationSecurity = 3
    try:
        wb = xl.Workbooks.Open(path, UpdateLinks=0, ReadOnly=True)
        ws = wb.Worksheets("Wall footings")
        xl.Calculation = -4135
        cells = {"A1": 1 if i.get("capFc", True) else 2, "E6": i["fcPrime"], "E7": i["fy"], "E9": i["Es"], "R6": i["cover"], "R7": i["t"],
                 "R8": i["B"], "R10": i["Df"], "R11": i["P"], "R13": i["M"], "AB12": i["qa"], "AB13": i["gamma"], "E13": i["bw"],
                 "BE1": IDX[i["longBar"]], "BD1": IDX[i["shortBar"]], "BE19": IDX[i["dowelBar"]], "AG33": i["sLong"], "AG34": i["sShort"], "AA36": i["dowelN"]}
        for a, v in cells.items():
            ws.Range(a).Value = v
        xl.Calculation = -4105
        xl.CalculateFull()
        sys.stdout.write("\n".join(f"{k}={fmt(ws.Range(a).Value)}" for k, a in OUT.items()) + "\n")
        wb.Close(False)
    finally:
        xl.Quit()


if __name__ == "__main__":
    main()
