"""Reference oracle for the '4 pile' cap sheet. Usage: python excel_pilecap.py <workbook.xlsm> '<input JSON>'
Read-only, macros disabled, never saved. Output format matches `cli/footing.mjs pilecap`."""
import json
import sys

import win32com.client as w

from excel_beam import fmt
from excel_slab import IDX

PILE_CODE = {k: i + 1 for i, k in enumerate(
    ["I-18", "I-22", "I-26", "I-30", "I-35", "I-40", "S-16", "S-18", "S-22", "S-26", "S-30", "S-35", "S-40", "SO-40",
     "SO-525", "HP-15", "Ø0.35", "Ø0.40", "Ø0.50", "Ø0.60", "Ø0.80", "Ø1.00"])}
OUT = {
    "Bx": "R8", "By": "R9", "Ptmax": "U20", "Ptnet": "W17", "P1": "AG18", "P2": "AG19", "Pf": "AG20", "Pallow": "J20",
    "Myy": "AG21", "Mxx": "N21", "V1x": "N22", "V1y": "AG22", "V2x": "N23", "V2y": "AG23", "dLong": "P25",
    "dShort": "P24", "dReqX": "X25", "dReqY": "AE25", "vX": "X26", "vY": "AE26", "vpX": "X27", "vpY": "AE27",
    "vppX": "X28", "vppY": "AE28", "perimeter": "AV53", "pilePerim": "AZ87", "AsMinL": "AI30", "AsReqL": "AD31",
    "AsProvL": "AJ31", "AsMinS": "AI32", "AsReqS": "AD33", "AsProvS": "AJ33", "uaL": "K30", "uL": "S30",
    "perimReqL": "K31", "perimL": "S31", "uS": "S32", "perimReqS": "K33", "perimS": "S33", "ancL": "K34",
    "ancAvailL": "S34", "ancS": "K35", "ancAvailS": "S35", "nLong": "AJ34", "nShort": "AJ35", "uD": "S37",
    "perimReqD": "K38", "perimD": "S38", "ancD": "K39", "ancUseD": "S39", "bearing": "AB15",
}


# 5/7/9-pile sheets: the analysis block sits one row lower and the depth cells are swapped
SHIFTED = {**OUT, "Ptmax": "U21", "Ptnet": "W18", "P1": "AG19", "P2": "AG20", "Pf": "AG21", "Pallow": "J21",
           "Myy": "AG22", "Mxx": "N22", "V1x": "N23", "V1y": "AG23", "V2x": "N24", "V2y": "AG24", "dLong": "P26",
           "dShort": "P25", "dReqX": "X26", "dReqY": "AE26", "vX": "X27", "vY": "AE27", "vpX": None, "vpY": None,
           "vppX": "X28", "vppY": "AE28"}


_NA2 = ["dShort", "Mxx", "V1y", "V2y", "dReqX", "vX", "vpX", "vppY", "uS", "perimReqS", "perimS", "ancS", "ancAvailS"]
TWO = {**OUT, **{k: None for k in _NA2}, "vpY": "X27", "vppX": "X28", "pilePerim": "AZ59", "ancL": "K32",
       "ancAvailL": "S32", "nShort": "AJ36", "uD": "S34", "perimReqD": "K35", "perimD": "S35", "ancD": "K36",
       "ancUseD": "S36"}
ONE = {"Bx": "R8", "By": "R9", "Ptmax": "U23", "P1": "AG21", "P2": "AG22", "Pf": "AG23", "Pallow": "J23",
       "AsReqL": "F18", "AsProvL": "S18", "nLong": "AJ17"}


def main():
    path, i = sys.argv[1], json.loads(sys.argv[2])
    xl = w.DispatchEx("Excel.Application")
    xl.Visible = False
    xl.DisplayAlerts = False
    xl.AutomationSecurity = 3
    try:
        wb = xl.Workbooks.Open(path, UpdateLinks=0, ReadOnly=True)
        n = i["n"]
        ws = wb.Worksheets("1 Pile" if n == 1 else f"{n} pile")
        xl.Calculation = -4135
        if n == 1:
            cells = {"A1": 1 if i.get("capFc", True) else 2, "E6": i["fcPrime"], "E7": i["fy"], "R6": i["cover"],
                     "R7": i["t"], "R8": i["capWidth"], "R9": i["capWidth"], "R10": i["Df"], "R11": i["P"],
                     "AB12": i["gamma"], "W21": i["pileL"], "W22": i["fcPile"], "AN23": i["Ptest"],
                     "AS63": PILE_CODE[i["pile"]], "BE1": IDX[i["longBar"]], "AF17": i["sLong"]}
            for a, v in cells.items():
                ws.Range(a).Value = v
            xl.Calculation = -4105
            xl.CalculateFull()
            sys.stdout.write("\n".join(f"{k}={fmt(ws.Range(a).Value)}" for k, a in ONE.items()) + "\n")
            wb.Close(False)
            return
        cells = {"A1": 1 if i.get("capFc", True) else 2, "E6": i["fcPrime"], "E7": i["fy"], "E9": i["Es"],
                 "R6": i["cover"], "R7": i["t"], "R10": i["Df"], "R11": i["P"], "R12": i["Mx"], "R13": i["My"],
                 "AB12": i["sx"], "AB13": i["sy"], "AB14": i["gamma"], "AY4": 2 if i["pier"] == "circle" else 1,
                 "D13": i["bx"], "D14": i["by"], "J13": i["D"], "W19" if i["n"] in (5, 7, 9) else "W18": i["pileL"], "W20" if i["n"] in (5, 7, 9) else "W19": i["fcPile"],
                 "AN20": i["Ptest"], "AS92": PILE_CODE[i["pile"]], "BE1": IDX[i["longBar"]],
                 "BD1": IDX[i["shortBar"]], "BE19": IDX[i["dowelBar"]], "AG34": i["sLong"], "AG35": i["sShort"],
                 "AA37": i["dowelN"]}
        if n == 2:  # input cells that differ on the 2-pile sheet
            del cells["AS92"], cells["AA37"], cells["AG35"], cells["AB13"], cells["R12"]  # no y-axis inputs there
            cells |= {"AS64": PILE_CODE[i["pile"]], "B38": i["dowelN"], "AG36": i["sShort"], "R9": i["capWidth"]}
        locked = [a for a in cells if ws.Range(a).Locked]
        if locked:
            sys.exit(f"locked input cells on this sheet: {locked}")
        for a, v in cells.items():
            ws.Range(a).Value = v
        xl.Calculation = -4105
        xl.CalculateFull()
        cmap = SHIFTED if n in (5, 7, 9) else TWO if n == 2 else OUT
        sys.stdout.write("\n".join(f"{k}={fmt(ws.Range(a).Value) if a else '-'}" for k, a in cmap.items()) + "\n")
        wb.Close(False)
    finally:
        xl.Quit()


if __name__ == "__main__":
    main()


