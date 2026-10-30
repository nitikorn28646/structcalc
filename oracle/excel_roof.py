"""Reference oracle for the steel roof sheets. Usage: python excel_roof.py <workbook.xlsm> <kind> '<input JSON>'
kind: purlin | rafter | hip | valley | ridge | plate. Read-only, macros disabled, never saved. Output matches cli/roof.mjs."""
import json
import sys

import win32com.client as w

from excel_beam import fmt

TYPE = {"C": 1, "SHS": 2, "RHS": 3, "CH": 5}
SHEET = {"purlin": "Purlin", "rafter": "Rafter", "hip": "Hip rafter", "valley": "Valley rafter", "ridge": "Ridge", "plate": "Pole-pate"}


def cells_for(kind, i):
    c = {"AR2": TYPE[i["type"]], "G21": i["grade"], "G22": i["E"]}
    if kind == "purlin":
        c.update({"AD27": i["name"], "S21": i["roofing"], "S22": i["selfW"], "S23": i["live"], "S24": i["wind"], "S25": i["extra"],
                  "AE21": i["rise"], "AE22": i["width"], "AE23": i["s"], "AE24": i["D"], "G25": "Yes" if i["sagRows"] else "No",
                  "AE37": max(i["sagRows"], 1), "G39": i["rodFy"]})
    elif kind == "rafter":
        c.update({"AD35": i["name"], "S21": i["roofing"], "S22": i["purlinW"], "S23": i["live"], "S24": i["wind"], "S25": i["extra"],
                  "S26": i["selfW"], "AE21": i["rise"], "AE22": i["overhang"], "AE23": i["run"], "AE24": i["D"], "AE25": i["s"]})
    elif kind in ("hip", "valley"):
        c.update({"AD35": i["name"], "S21": i["selfW"], "S22": i["transfer"], "AE21": i["rise"], "AE23": i["overhang"],
                  "AE24": i["run"], "G38": i["count"]})
    else:
        c.update({"AD35": i["name"], "S21": i["selfW"], "S22": i["transfer"], "AE22": i["L"], "G35": i["count"]})
    return c


OUT = {
    "purlin": {"theta": "G27", "Wg": "AE25", "Wx": "G28", "Wy": "G29", "Mx": "S27", "My": "S28", "SxReq": "S29", "dyAllow": "G30",
               "dy": "S30", "dxAllow": "G31", "dx": "S31", "fb": "G32", "reaction": "Z42", "T": "AS17", "AsReq": "AE38"},
    "rafter": {"theta": "G35", "Wg": "G26", "w": "G25", "Wx": "G36", "Mspan": "AS43", "Mcant": "AS44", "Mx": "S35", "My": "S36",
               "SxReq": "S37", "fb": "G39", "x1": "G43", "dSpan": "AT48", "dAllow": "G38", "Rwall": "AS39", "Rridge": "AS38"},
    "hip": {"theta": "G35", "w": "G36", "Mspan": "AS43", "Mcant": "AS44", "Mx": "S35", "SxReq": "S36", "x1": "G43", "dSpan": "AT48",
            "dAllow": "G37", "Rmax": "G44", "Rmin": "S44"},
    "beam": {"w": "G36", "Mx": "S35", "SxReq": "S36", "dAllow": "G37", "d": "S37", "R": "AS39"},
}


def main():
    path, kind, i = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
    group = {"valley": "hip", "ridge": "beam", "plate": "beam"}.get(kind, kind)
    xl = w.DispatchEx("Excel.Application")
    xl.Visible = False
    xl.DisplayAlerts = False
    xl.AutomationSecurity = 3
    try:
        wb = xl.Workbooks.Open(path, UpdateLinks=0, ReadOnly=True)
        ws = wb.Worksheets(SHEET[kind])
        cells = cells_for(kind, i)
        locked = [a for a in cells if ws.ProtectContents and ws.Range(a).Locked]
        if locked:
            sys.exit(f"locked input cells on {SHEET[kind]}: {locked}")
        xl.Calculation = -4135
        for a, v in cells.items():
            ws.Range(a).Value = v
        xl.Calculation = -4105
        xl.CalculateFull()
        skip = set()
        if kind == "purlin":
            # with sag rods the sheet divides Sy by the number of rod spans (not a section property): not compared
            skip = {"fb"} if i["sagRows"] else {"T", "AsReq"}
        sys.stdout.write("\n".join(f"{k}={'-' if k in skip else fmt(ws.Range(a).Value)}" for k, a in OUT[group].items()) + "\n")
        wb.Close(False)
    finally:
        xl.Quit()


if __name__ == "__main__":
    main()
