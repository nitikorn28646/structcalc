"""Reference oracle for the slab sheets (One-way / Cantilever / Two-way) of the original workbook.

Usage: python excel_slab.py <workbook.xlsm> <oneway|cantilever|twoway> '<input JSON>'
Read-only, macros disabled, never saved. Output format matches cli/slab.mjs.
"""
import json
import sys

import win32com.client as w

from excel_beam import fmt

BARS = ["RB 6", "RB 9", "RB 12", "RB 15", "RB 19", "RB 25", "DB 10", "DB 12", "DB 16", "DB 20", "DB 25", "DB 28", "DB 32"]
IDX = {n: i + 2 for i, n in enumerate(BARS)}
SUPPORT = {"simple": 1, "one_end": 2, "both_ends": 3}

COMMON_OUT = {"fc": "AJ8", "fs": "AC9", "n": "AC10", "nOk": "AG10", "k": "AC11", "j": "AC12", "R": "AC13",
              "selfWeight": "R10", "w": "R13", "M": "AC6", "V": "AC7", "minT": "I15", "minTOk": "R15", "d": "N16",
              "dReq": "I16", "dOk": "R16", "As": "AC16", "sMain": "AC17", "Vc": "E18", "VcOk": "R18", "Mc": "E19",
              "McOk": "R19", "AsTemp": "AC19", "sTemp": "AC20", "reaction": "L22"}

SPEC = {
    "oneway": {
        "sheet": "One-way slaps",
        "inputs": lambda i: {"E6": i["fcPrime"], "R6": i["cover"], "E7": i["fy"], "R7": i["t"], "R8": i["L"],
                             "E9": i["Es"], "R9": i["unitWeight"], "R11": i["extra"], "R12": i["live"],
                             "AY4": SUPPORT[i["support"]], "BE1": IDX[i["mainBar"]], "BD1": IDX[i["tempBar"]]},
        "out": {**COMMON_OUT, "Vbond": "AC22", "barsPerM": "AC23", "u": "AC24", "uOk": "AL24", "uAllow": "AC25",
                "mainText": "AX18", "tempText": "AX19"},
    },
    "cantilever": {
        "sheet": "Cantilever slaps",
        "inputs": lambda i: {"E6": i["fcPrime"], "R6": i["cover"], "E7": i["fy"], "R7": i["t"], "R8": i["L"],
                             "E9": i["Es"], "R9": i["unitWeight"], "I11": i["P"], "R11": i["extra"], "I12": i["a"],
                             "R12": i["live"], "BF1": IDX[i["mainBar"]], "BE1": IDX[i["tempBar"]]},
        "out": {**COMMON_OUT, "Vbond": "AC7", "barsPerM": "AC22", "u": "AC23", "uOk": "AL23", "uAllow": "AC24",
                "mainText": "AY17", "tempText": "AY18"},
    },
    "stair": {
        "sheet": "Stair1",
        "inputs": lambda i: {"E6": i["fcPrime"], "R6": i["cover"], "E7": i["fy"], "R7": i["t"], "R8": i["L"],
                             "E9": i["Es"], "R9": i["unitWeight"], "R11": i["extra"], "R12": i["live"],
                             "E11": i["tread"], "E12": i["riser"], "E13": i["width"],
                             "BE1": IDX[i["mainBar"]], "BD1": IDX[i["tempBar"]]},
        "out": {**COMMON_OUT, "Vbond": "AC22", "barsPerM": "AC23", "u": "AC24", "uOk": "AL24", "uAllow": "AC25",
                "mainText": "AX18", "tempText": "AX19"},
    },
    "twoway": {
        "sheet": "Two-way slaps",
        "inputs": lambda i: {"E6": i["fcPrime"], "R6": i["cover"], "E7": i["fy"], "R7": i["t"], "R8": i["unitWeight"],
                             "E9": i["Es"], "R10": i["extra"], "R11": i["live"], "E12": i["S"], "E13": i["L"],
                             "AY4": i["case"], "BE1": IDX[i["shortBar"]], "BD1": IDX[i["longBar"]]},
        "out": {"fc": "AJ6", "fs": "AC7", "n": "AC8", "nOk": "AG8", "k": "AC9", "j": "AC10", "R": "AC11",
                "selfWeight": "R9", "w": "R12", "m": "R13", "minT": "I15", "minTOk": "R15", "dS": "N16", "dL": "BM6",
                "MS": ["CP75", "CQ75", "CR75"], "ML": ["CS75", "CT75", "CU75"], "dReq": "I16", "dOk": "R16",
                "McS": "H18", "McL": "H19", "McSOk": "U18", "McLOk": "U19",
                "AsS": ["CP77", "CQ77", "CR77"], "AsL": ["CS77", "CT77", "CU77"],
                "sS": ["CP78", "CQ78", "CR78"], "sL": ["CS78", "CT78", "CU78"], "sShort": "BE4", "sLong": "BE8",
                "loadShortSide": "K22", "loadLongSide": "K23", "shortText": "BC15", "longText": "BC16"},
    },
}


def fmt_slab(v):
    if isinstance(v, str):
        v = v.strip()
        if v == "":
            return "-"
        if "@" in v:  # "RB 9 @ 0.3 m.  (Main rebars.)" → "RB 9 @ 0.3"
            return v.split(" m.")[0].strip()
    return fmt(v)


def main():
    path, kind, inp = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
    spec = SPEC[kind]
    xl = w.DispatchEx("Excel.Application")
    xl.Visible = False
    xl.DisplayAlerts = False
    xl.AutomationSecurity = 3
    try:
        wb = xl.Workbooks.Open(path, UpdateLinks=0, ReadOnly=True)
        ws = wb.Worksheets(spec["sheet"])
        xl.Calculation = -4135
        cells = spec["inputs"](inp)
        cells["A1"] = 1 if inp.get("capFc", True) else 2
        for a, v in cells.items():
            ws.Range(a).Value = v
        xl.Calculation = -4105
        xl.CalculateFull()
        lines = []
        for k, a in spec["out"].items():
            val = ",".join(fmt_slab(ws.Range(x).Value) for x in a) if isinstance(a, list) else fmt_slab(ws.Range(a).Value)
            lines.append(f"{k}={val}")
        sys.stdout.write("\n".join(lines) + "\n")
        wb.Close(False)
    finally:
        xl.Quit()


if __name__ == "__main__":
    main()

