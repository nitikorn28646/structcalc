// Load library (step 5, tab "น้ำหนักอื่น / หลังคา") in the PanelKit look (user 2026-11-19: panels must read the same): a section per kind,
// one row per item (● = the item the tool draws, name, value + unit), click a row → name / value / delete under it.
import { useState } from "react";
import { Plus, Ruler, Trash2 } from "lucide-react";
import { List, Note, Panel, PField, Pick, Row, Section, btnCls, inputCls, numCls } from "./PanelKit.jsx";

const KINDS = [["line", "แผ่ตามแนว", "กก./ม.", "เครื่องมือ ราว/น้ำหนักเส้น"], ["point", "แรงจุด", "กก.", "เครื่องมือ น้ำหนักจุด"], ["area", "ต่อพื้นที่", "กก./ม.²", "เครื่องมือ เพิ่มบนพื้น"]];

export default function LoadLibPanel({ loadLib, setLoadLib, libSel, setLibSel }) {
  const [open, setOpen] = useState(null);
  const put = (i, p) => setLoadLib(loadLib.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const add = (kind) => { const it = { id: `u${Date.now()}`, name: "รายการใหม่", kind, v: kind === "point" ? 500 : 100 }; setLoadLib([...loadLib, it]); setOpen(it.id); };
  return (
    <Panel title="คลังน้ำหนัก" icon={Ruler} hint={<>เลือกรายการ (<span className="text-[#b54708]">●</span>) → เลือกเครื่องมือทางซ้าย → คลิกบนแปลน · คลิกแถวเพื่อแก้</>}>
      {KINDS.map(([kind, label, unit, tool]) => (
        <Section key={kind} title={<span>{label} <span className="font-normal text-gray-400">({unit}) · {tool}</span></span>}
          action={<button onClick={() => add(kind)} className={btnCls}><Plus className="h-3.5 w-3.5" />เพิ่ม</button>}>
          <List>
            {loadLib.map((it, i) => it.kind === kind && (
              <Row key={it.id} open={open === it.id} onClick={() => setOpen(open === it.id ? null : it.id)} active={libSel === it.id}
                lead={<Pick on={libSel === it.id} onClick={() => setLibSel(libSel === it.id ? null : it.id)} title="ใช้รายการนี้กับเครื่องมือวาด" />}
                title={it.name} value={Number(it.v).toLocaleString("en-US")} unit={unit}>
                <div className="grid grid-cols-3 gap-2">
                  <PField label="ชื่อ" className="col-span-2"><input defaultValue={it.name} key={it.name} onBlur={(e) => put(i, { name: e.target.value.trim() || it.name })} className={inputCls} /></PField>
                  <PField label={unit}><input type="number" value={it.v} onChange={(e) => put(i, { v: Number(e.target.value) })} className={numCls} /></PField>
                </div>
                <div className="flex justify-end"><button onClick={() => { setLoadLib(loadLib.filter((_, j) => j !== i)); if (libSel === it.id) setLibSel(null); setOpen(null); }}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />ลบ</button></div>
              </Row>))}
          </List>
        </Section>))}
      <Note>บันทึกเป็นค่ามาตรฐานของคุณได้ที่ขั้น 0 (เกณฑ์การออกแบบ)</Note>
    </Panel>
  );
}
