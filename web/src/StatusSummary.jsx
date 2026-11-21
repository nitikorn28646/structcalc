// Project check status (review 2026-11-04: the report said "ผ่านทุกข้อ" while a wall plate failed). One place computes the status of
// every member of every category — roof, beams, columns, slabs, stairs, footings — as PASS / FAIL / NOT CHECKED / INCOMPLETE; the
// project result is FAIL when anything fails, INCOMPLETE when something could not be computed, else PASS. Used by the report book
// (summary chapter, criteria summary line) so that no summary can disagree with the member results.
import { Note, Sec, Sub } from "./ReportKit.jsx";
import { fmt } from "./beamModel.js";
import { designSlabs } from "../engine/slabDesign.js";
import { footingMarks } from "./FootingPlan.jsx";
import { calcAnchor, validateInput } from "./reportQA.js";

const ST = { PASS: ["ผ่าน", "#067647"], FAIL: ["ไม่ผ่าน", "#d92d20"], NC: ["ไม่ได้ตรวจ", "#667085"], INC: ["ไม่ครบ", "#b54708"], ACC: ["วิศวกรยอมรับ", "#b54708"] };
const roofUtil = (r) => Math.max(r.fb && r.Fb ? Math.abs(r.fb / r.Fb) : 0, r.d && r.dAllow ? r.d / r.dAllow : 0, r.dy && r.dyAllow ? r.dy / r.dyAllow : 0, r.ratio ?? 0);

// items: { cat, id, where (chapter anchor), status, util, why }
export function projectStatus(frame, res, dz, roof = null) {
  const items = [], floors = frame.floors, FM = footingMarks(res.footings);
  if (dz) for (const row of dz.rows ?? []) {
    const list = row.members ?? [{ ...row, tag: null }];
    for (const m of list) {
      const bat = m.r?.section?.type === "BAT";
      items.push({ cat: "หลังคา", group: row.label, id: `${row.label}${m.tag ? ` ${m.tag}` : ""}`, where: "c-roof", calc: ["plate", "post"].includes(row.key) ? null : `R-${row.key ?? row.label}`, status: bat ? "NC" : !m.r ? "INC" : m.r.ok ? "PASS" : "FAIL",
        util: bat || !m.r ? null : roofUtil(m.r), why: bat ? "แปสำเร็จรูป — ใช้ตามตารางผู้ผลิต" : m.r && !m.r.ok ? `fb ${fmt(m.r.fb, 0)} / ${fmt(m.r.Fb, 0)} · Δ ${fmt(m.r.d ?? m.r.dy, 2)} / ${fmt(m.r.dAllow ?? m.r.dyAllow, 2)} ซม.` : "" });
    }
  }
  res.floors.forEach((an, k) => {
    for (const sp of an.spans) items.push({ cat: "คาน", id: `${floors[k].name} ช่วง ${sp.id} (${sp.typeName ?? sp.type?.name ?? "-"})`, where: "c-appendix", calc: sp.type ? `B-${sp.type.name}` : null, status: sp.check?.error ? "INC" : sp.ok ? "PASS" : "FAIL",
      util: sp.check?.util ?? null, why: sp.ok ? "" : sp.check?.error ?? "ดูเหตุผลในตารางช่วงคาน" });
    for (const row of designSlabs(an, frame.floors[k], frame.mat)) {
      const cat = row.kind === "ST" ? "บันได" : "พื้น", noDesign = !row.r && (row.kind === "PS" || row.kind === "GS" || /พาดข้าง|ยื่น/.test(row.note ?? ""));
      items.push({ cat, id: `${floors[k].name} ${row.name}`, where: `c-floor-${k}`, status: noDesign ? "NC" : !row.r ? "INC" : row.ok ? "PASS" : "FAIL", util: null, why: noDesign || !row.r ? row.note ?? "" : row.ok ? "" : "ดูตารางพื้น" });
    }
  });
  for (const c of res.columns) items.push({ cat: "เสา", calc: frame.colTypes?.[c.typeIdx] && c.lv ? `C-${frame.colTypes[c.typeIdx].name}-${c.lv.level}` : null, id: `${c.stack ?? `(${c.p?.[0]?.toFixed?.(2)}, ${c.p?.[1]?.toFixed?.(2)})`} ใต้ ${floors[c.floor]?.name}`, where: "c-columns",
    status: c.check?.error ? "INC" : c.ok ? "PASS" : "FAIL", util: c.check?.util ?? null, why: c.ok ? "" : c.check?.error ?? (c.check?.tension && !c.check.tension.ok ? "แรงดึงเกิน As·fs" : c.check?.fit?.ok === false ? "ช่องว่างเหล็กยืนน้อยเกิน" : c.check?.sOk === false ? "ระยะเหล็กปลอกเกินที่ยอมให้" : c.check?.slenderOk === false ? "เสาชะลูดเกิน (klu/r)" : "กำลังรับแรงไม่พอ") });
  // columns standing on beams (2026-11-21): the joint checks (width, bars in the beam cage, anchorage, bearing) are a column item of their own
  for (const r of res.planted ?? []) items.push({ cat: "เสา", id: `เสาตั้งบนคาน ${r.stack} (${floors[r.floor]?.name ?? r.floorName})`, where: "c-beams", calc: null,
    status: r.noBeam || !r.lv ? "INC" : r.ok ? "PASS" : "FAIL", util: r.beam ? Math.max(r.ldc / Math.max(r.avail, 1e-9), r.fbr / r.fAllow) : null, why: r.ok ? "" : r.why.join(" · ") });
  for (const f of res.footings) items.push({ cat: "ฐานราก", id: `${f.stack} (${FM.mark(f)})`, where: "c-footings", calc: `F-${FM.mark(f)}`, status: !f.r ? "INC" : f.ok ? "PASS" : "FAIL", util: f.util ?? null,
    why: !f.r ? f.error ?? "" : f.ok ? "" : f.r.qCornerOk === false ? "แรงดันดินที่มุม (โมเมนต์สองแกน) เกิน qa" : "ดูตารางฐานราก" });
  // wind / earthquake: storey drift per case; switched on but not analysed (continuous method, 3D frame failed) = INCOMPLETE
  const latOn = !!(frame.lateral?.wind?.on || frame.lateral?.seismic?.on);
  if (latOn && !res.lateral) items.push({ cat: "แรงด้านข้าง", id: "ลม / แผ่นดินไหว", where: "c-criteria", status: "INC", util: null, why: "เปิดแรงด้านข้างไว้แต่ไม่ได้วิเคราะห์ — ต้องใช้โครง 3 มิติ (แรงที่ใช้ออกแบบ = ค่ามากสุดของสองวิธี)" });
  for (const d of res.lateral?.drift ?? []) items.push({ cat: "แรงด้านข้าง", id: `ระยะเซ ${d.key} ${floors[d.floor]?.name ?? d.floor}`, where: "c-criteria", status: d.ok ? "PASS" : "FAIL", util: d.lim > 0 ? d.dd / d.lim : null,
    why: d.ok ? "" : `ระยะเซระหว่างชั้น ${(d.dd * 1000).toFixed(1)} > ${(d.lim * 1000).toFixed(1)} มม.` });
  for (const x of items) x.key = `${x.cat}|${x.id}`; // stable key of a member check (engineer decisions in project.report.fails)
  return summarize(items, validateInput(frame, roof));
}
// counts per category and the project result from a list of item statuses
function summarize(items, inputs, extra = {}) {
  const cats = ["หลังคา", "คาน", "เสา", "พื้น", "บันได", "ฐานราก", "แรงด้านข้าง"].map((cat) => {
    const l = items.filter((x) => x.cat === cat), n = (s) => l.filter((x) => x.status === s).length;
    return { cat, total: l.length, pass: n("PASS"), fail: n("FAIL"), nc: n("NC"), inc: n("INC"), acc: n("ACC"), status: n("FAIL") ? "FAIL" : n("INC") ? "INC" : l.length ? "PASS" : "NC" };
  }).filter((c) => c.total);
  const status = cats.some((c) => c.status === "FAIL") ? "FAIL" : cats.some((c) => c.status === "INC") ? "INC" : "PASS", nAcc = items.filter((x) => x.status === "ACC").length;
  const text = status === "PASS" ? (nAcc ? `ผ่านทุกรายการที่ตรวจ ยกเว้น ${nAcc} รายการที่วิศวกรพิจารณายอมรับ` : "ผ่านทุกรายการที่ตรวจ") : status === "FAIL" ? `ไม่ผ่าน ${items.filter((x) => x.status === "FAIL").length} รายการ — ต้องแก้ไขก่อนใช้` : "ข้อมูลไม่ครบบางรายการ";
  return { items, cats, status, inputs, fails: items.filter((x) => x.status === "FAIL"), accepted: items.filter((x) => x.status === "ACC"), text, ...extra };
}
// the engineer's decision per failing check (user 2026-11-16: the engineer is told first, then chooses — and carries the responsibility):
// "show" (default) = printed as ไม่ผ่าน · "accept" = printed as วิศวกรยอมรับ with the engineer's reason · "hide" = left out of the summary
// chapter. Only the summary is affected: no computed value changes, and member tables / sheets still print the real result.
// result words switched off for a group (project.report.marks, user 2026-11-17: "ซ่อนผ่าน/ไม่ผ่านอะเสแล้ว ทำไมบทสรุปยังขึ้นไม่ผ่าน") → that group's
// failing items default to "hide" in the summary too; an explicit decision by the engineer on the item still wins.
export const markOff = (marks, x) => !!marks && (marks[x.cat] === false || (x.group != null && marks[`${x.cat}|${x.group}`] === false));
export function effectiveFails(st, report) {
  const fails = { ...(report?.fails ?? {}) }, marks = report?.marks;
  for (const x of st?.items ?? []) if (x.status === "FAIL" && !fails[x.key] && markOff(marks, x)) fails[x.key] = { mode: "hide", auto: true };
  return fails;
}
export function applyDecisions(st, fails = {}) {
  if (!fails || !Object.keys(fails).length) return st;
  const items = [], hidden = [];
  for (const x of st.items) {
    const d = x.status === "FAIL" ? fails[x.key] : null;
    if (d?.mode === "hide") { hidden.push(x); continue; }
    items.push(d?.mode === "accept" ? { ...x, status: "ACC", why: `${x.why}${d.note ? ` — วิศวกรพิจารณา: ${d.note}` : " — วิศวกรพิจารณายอมรับ"}` } : x);
  }
  return summarize(items, st.inputs, { hidden, raw: st });
}

const Badge = ({ s }) => <b style={{ color: ST[s][1] }}>{ST[s][0]}</b>;
const PageRef = ({ to, calc }) => <a className="rp-pref text-[#667085]" href={`#${calc ? calcAnchor(calc) : to}`}>{calc ? `${calc} · หน้า ` : "หน้า "}</a>;
const th = "py-0.5 pr-2 font-semibold", td = "py-0.5 pr-2 align-top";

// what this book does not check (said plainly instead of left out)
const NOT_CHECKED = [
  "เหล็กขึ้นรูปเย็น (C-Lip): ตรวจหน่วยแรงดัด fb ≤ 0.6Fy และระยะแอ่น — ยังไม่ได้ตรวจการโก่งเดาะเฉพาะที่ / distortional / การโก่งเดาะด้านข้าง (LTB) ตามมาตรฐานเหล็กขึ้นรูปเย็น",
  "จุดต่อเหล็ก (รอยเชื่อม สกรู สลัก) แผ่นเหล็กฐานเสาเหล็ก (base plate) และสลักยึด (anchor bolt) แรงถอนจากลมยก",
  "การทรุดตัวของฐานราก และกำลังรับน้ำหนักของเสาเข็มจากข้อมูลดิน — ใช้น้ำหนักปลอดภัยต่อต้นที่กำหนด",
  "ความกว้างรอยร้าวของคอนกรีต และระยะทาบเหล็ก (ระบุตามแบบมาตรฐาน)",
];

export function StatusChapter({ st, n, o = () => true }) {
  const crit = st.items.filter((x) => x.util != null && x.util < 8.99 && x.status !== "NC").sort((a, b) => b.util - a.util).slice(0, 15);
  return (
    <Sec id="c-status" n={n} th="สรุปผลการออกแบบ" en="Design summary"
      intro="นับจากผลตรวจของทุกชิ้นส่วนในเล่ม: ผ่าน · ไม่ผ่าน · ไม่ได้ตรวจ (ใช้ตารางผู้ผลิต / ไม่อยู่ในขอบเขต) · ไม่ครบ (คำนวณไม่ได้ ข้อมูลขาด) — ถ้ามีรายการไม่ผ่านแม้รายการเดียว ผลรวมเป็น “ไม่ผ่าน”">
      <div className="mb-2 rounded-lg border-2 px-3 py-2 text-[11pt] font-semibold" style={{ borderColor: ST[st.status][1], color: ST[st.status][1] }}>ผลการตรวจสอบรวมของโครงการ: {st.text}</div>
      <table className="w-full border-collapse text-[9pt]"><thead><tr className="border-b border-gray-300 text-left">{["หมวด", "ตรวจทั้งหมด", "ผ่าน", "ไม่ผ่าน", ...(st.accepted?.length ? ["วิศวกรยอมรับ"] : []), "ไม่ได้ตรวจ", "ไม่ครบ", "สถานะ"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>{st.cats.map((c) => <tr key={c.cat} className="border-b border-gray-100">{[c.cat, c.total, c.pass, c.fail, ...(st.accepted?.length ? [c.acc] : []), c.nc, c.inc].map((v, j) => <td key={j} className={td}>{v}</td>)}<td className={td}><Badge s={c.status} /></td></tr>)}</tbody></table>
      {o("status.fails") && st.fails.length > 0 && (<><Sub>รายการที่ไม่ผ่าน — ต้องแก้ไข</Sub>
        <table className="w-full border-collapse text-[9pt]"><thead><tr className="border-b border-gray-300 text-left">{["หมวด", "ชิ้นส่วน", "สาเหตุ", "อัตราใช้", "ดู"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>{st.fails.map((x, i) => <tr key={i} className="border-b border-gray-100"><td className={td}>{x.cat}</td><td className={td}>{x.id}</td><td className={td}>{x.why}</td><td className={td}>{x.util != null && x.util < 8.99 ? `${fmt(x.util * 100, 0)} %` : "-"}</td><td className={td}><PageRef to={x.where} calc={x.calc} /></td></tr>)}</tbody></table></>)}
      {o("status.fails") && st.accepted?.length > 0 && (<><Sub>รายการที่ไม่ผ่านเกณฑ์ แต่วิศวกรผู้คำนวณพิจารณายอมรับ</Sub>
        <table className="w-full border-collapse text-[9pt]"><thead><tr className="border-b border-gray-300 text-left">{["หมวด", "ชิ้นส่วน", "ผลตรวจ / เหตุผลของวิศวกร", "อัตราใช้"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>{st.accepted.map((x, i) => <tr key={i} className="border-b border-gray-100"><td className={td}>{x.cat}</td><td className={td}>{x.id}</td><td className={td}>{x.why}</td><td className={td}>{x.util != null && x.util < 8.99 ? `${fmt(x.util * 100, 0)} %` : "-"}</td></tr>)}</tbody></table>
        <Note>ผลคำนวณของรายการเหล่านี้ไม่ได้เปลี่ยน (ตารางและแผ่นคำนวณของชิ้นส่วนยังแสดงค่าจริง) — วิศวกรผู้คำนวณเป็นผู้พิจารณาและรับรองการยอมรับ</Note></>)}
      {o("status.critical") && <Sub>ชิ้นส่วนวิกฤต — อัตราการใช้กำลังสูงสุด 15 อันดับ</Sub>}
      {o("status.critical") && <table className="w-full border-collapse text-[9pt]"><thead><tr className="border-b border-gray-300 text-left">{["หมวด", "ชิ้นส่วน", "อัตราใช้ (ค่าที่ควบคุม / ค่าที่ยอมให้)", "ผล", "ดู"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>{crit.map((x, i) => <tr key={i} className="border-b border-gray-100"><td className={td}>{x.cat}</td><td className={td}>{x.id}</td><td className={td}>{fmt(x.util * 100, 0)} %</td><td className={td}><Badge s={x.status} /></td><td className={td}><PageRef to={x.where} calc={x.calc} /></td></tr>)}</tbody></table>}
      {o("status.nc") && st.items.some((x) => x.status === "NC") && (<><Sub>รายการที่ไม่ได้ตรวจในเล่มนี้</Sub>
        <ul className="list-disc pl-5 text-[9pt]">{[...new Map(st.items.filter((x) => x.status === "NC").map((x) => [`${x.cat}|${x.why}`, x])).values()].map((x, i) => <li key={i}>{x.cat}: {x.why} ({st.items.filter((y) => y.status === "NC" && y.cat === x.cat && y.why === x.why).length} รายการ)</li>)}</ul></>)}
      {o("status.inputs") && <Sub>การตรวจข้อมูลนำเข้า</Sub>}
      {!o("status.inputs") ? null : st.inputs.length ? <table className="w-full border-collapse text-[9pt]"><thead><tr className="border-b border-gray-300 text-left">{["ระดับ", "ส่วน", "รายการ"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>{st.inputs.map((x, i) => <tr key={i} className="border-b border-gray-100"><td className={td}><b style={{ color: x.lvl === "error" ? "#b42318" : "#b54708" }}>{x.lvl === "error" ? "ผิดปกติ" : "ควรตรวจ"}</b></td><td className={td}>{x.where}</td><td className={td}>{x.text}</td></tr>)}</tbody></table>
        : <p className="text-[9pt] text-[#067647]">ไม่พบค่าที่ผิดปกติ (ค่าศูนย์ ค่านอกช่วงปกติ หรือหน่วยที่อาจกรอกผิด เช่น MPa / kN / ตัน แทน กก.)</p>}
      {o("status.scope") && <><Sub>ขอบเขตการตรวจสอบ — สิ่งที่รายการคำนวณนี้ไม่ได้ครอบคลุม</Sub>
      <ul className="list-disc pl-5 text-[9pt]">{NOT_CHECKED.map((t) => <li key={t}>{t}</li>)}</ul></>}
      <Note>อัตราใช้ = ค่าที่ควบคุมการออกแบบหารด้วยค่าที่ยอมให้ (หน่วยแรง ระยะแอ่น เหล็กเสริม แรงอัด แรงดันดิน / แรงต่อเข็ม) ของชิ้นส่วนนั้น</Note>
    </Sec>
  );
}
