// Excel-like table (AG Grid Community): click selects a cell, typing / double-click / Enter edits (as in Excel), tick rows, sort / filter, resize columns, and two things the free
// edition does not have, done here: paste a block copied from Excel / Sheets at the focused cell (Ctrl+V), and fill the focused
// column down over the ticked rows from the first ticked row (Ctrl+D). Every change goes out as one batch: onChange([{ id, field, value }]).
import { useMemo, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

// columns: { field, headerName, width, editable, type: "number" | "select" | "check", options: [[value, label]], fmt: (v, row) => text }
export function Grid({ rows, columns, onChange, onSelect, dark, height = "100%", getRowClass }) {
  const ref = useRef(null);
  const defs = useMemo(() => columns.map((c) => ({
    field: c.field, headerName: c.headerName, width: c.width, flex: c.width ? undefined : 1, minWidth: 60, sortable: true, filter: c.type !== "check", resizable: true,
    editable: c.editable ? (p) => (typeof c.editable === "function" ? c.editable(p.data) : true) : false,
    cellClass: (p) => [c.type === "number" ? "ag-right-aligned-cell tabular-nums" : "", c.editable && (typeof c.editable !== "function" || c.editable(p.data)) ? "sc-edit" : "sc-ro"].join(" "),
    ...(c.type === "number" ? { cellEditor: "agNumberCellEditor", valueParser: (p) => (p.newValue === "" || p.newValue == null ? null : Number(p.newValue)) } : {}),
    ...(c.type === "select" ? { cellEditor: "agSelectCellEditor", cellEditorParams: { values: c.options.map(([v]) => v) }, valueFormatter: (p) => c.options.find(([v]) => v === p.value)?.[1] ?? p.value ?? "" } : {}),
    ...(c.type === "check" ? { cellRenderer: "agCheckboxCellRenderer", cellEditor: "agCheckboxCellEditor" } : {}),
    ...(c.fmt ? { valueFormatter: (p) => c.fmt(p.value, p.data) } : {}),
  })), [columns]);
  const editableCols = (api) => api.getAllDisplayedColumns().filter((col) => { const d = col.getColDef(); return d.editable; });
  const coerce = (field, v) => { const c = columns.find((x) => x.field === field); return c?.type === "number" ? (v === "" ? null : Number(String(v).replace(/,/g, ""))) : c?.type === "check" ? /^(1|true|y|yes|x|✓)$/i.test(String(v).trim()) : v; };
  const onPaste = (e) => {
    const api = ref.current?.api, cell = api?.getFocusedCell();
    if (!api || !cell || api.getEditingCells().length) return; // typing inside an editor: the browser pastes into it
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const block = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((r) => r.split("\t"));
    const cols = api.getAllDisplayedColumns(), c0 = cols.findIndex((c) => c.getColId() === cell.column.getColId()), out = [];
    block.forEach((vals, i) => {
      const node = api.getDisplayedRowAtIndex(cell.rowIndex + i);
      if (!node) return;
      vals.forEach((v, j) => { const col = cols[c0 + j], d = col?.getColDef(); if (!col || !d.editable || (typeof d.editable === "function" && !d.editable({ data: node.data }))) return;
        out.push({ id: node.id, field: d.field, value: coerce(d.field, v) }); });
    });
    if (out.length) onChange(out);
  };
  const onKey = (e) => {
    const ev = e.event;
    if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== "d") return;
    ev.preventDefault();
    const api = e.api, field = e.colDef.field, sel = api.getSelectedNodes().sort((a, b) => a.rowIndex - b.rowIndex);
    if (sel.length < 2 || !editableCols(api).some((c) => c.getColDef().field === field)) return;
    const v = sel[0].data[field];
    onChange(sel.slice(1).map((n) => ({ id: n.id, field, value: v })));
  };
  return (
    <div className={`${dark ? "ag-theme-quartz-dark" : "ag-theme-quartz"} sc-grid`} style={{ height, width: "100%" }} onPaste={onPaste}>
      <AgGridReact ref={ref} rowData={rows} columnDefs={defs} getRowId={(p) => String(p.data.id)} rowHeight={30} headerHeight={32}
        rowSelection={{ mode: "multiRow", checkboxes: true, headerCheckbox: true, enableClickSelection: false }}
        stopEditingWhenCellsLoseFocus suppressMovableColumns getRowClass={getRowClass}
        onCellValueChanged={(p) => onChange([{ id: p.node.id, field: p.colDef.field, value: p.newValue }])}
        onSelectionChanged={(p) => onSelect?.(p.api.getSelectedNodes().map((n) => n.id))}
        onCellKeyDown={onKey} />
    </div>
  );
}
