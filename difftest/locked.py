import sys
import win32com.client as w

sys.path.insert(0, r"D:\REA\structcalc\oracle")
xl = w.DispatchEx("Excel.Application"); xl.Visible = False; xl.DisplayAlerts = False; xl.AutomationSecurity = 3
try:
    wb = xl.Workbooks.Open(sys.argv[1], UpdateLinks=0, ReadOnly=True)
    ws, crit = wb.Worksheets("Beam"), wb.Worksheets("Design criteria")
    cells = ["AX4", "A1", "E7", "E9", "E10", "E11", "R6", "R7", "R8", "R9", "R10", "R11", "R12", "AI28", "BI13", "BJ13",
             "CI4", "CI5", "CI10", "CI11", "CI15", "CI16", "CI22", "CI23", "CI28", "CI29", "CI34", "CI35",
             "BC1", "BC2", "BC3", "BC4", "BC5", "BC6", "BD1", "BD2", "BD3", "BD4", "BD5", "BD6"]
    print("criteria protected:", crit.ProtectContents, "E9 locked:", crit.Range("E9").Locked)
    print("locked:", [c for c in cells if ws.Range(c).Locked])
    print("controls:", ws.Shapes.Count, [(s.Name, s.ControlFormat.LinkedCell) for s in ws.Shapes if s.Type == 8][:30])
    wb.Close(False)
finally:
    xl.Quit()
