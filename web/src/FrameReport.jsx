// Thai calculation report for the RC frame drawn on plan: loads, slab panels, continuous beams, beam / column types, schedules.
import { Doc, Figure, Item, Note, Sec } from "./ReportKit.jsx";
import { fmt } from "./beamModel.js";
import Drawing from "./Drawing.jsx";
import { beamSectionModel, columnSectionModel, framePlanModel } from "./drawings.js";
import { SLAB_BARS } from "../engine/tables.js";
import { CONC, DEFAULT_WALL_TYPES, GROUPS, STAIR_KINDS, faceBars, parseBars, wallsOf } from "../engine/floor.js";
import { designSlabs } from "../engine/slabDesign.js";
import { analyzeFrame } from "../engine/frame.js";

const ksc = "กก./ซม.²";
const KIND_TH = { simple: "ช่วงเดียว", one_end: "ช่วงริม", both_ends: "ช่วงใน", cantilever: "คานยื่น" };
const th = "py-0.5 pr-2 font-semibold", td = "py-0.5 pr-2 tabular-nums";
const Table = ({ head, rows }) => (
  <table className="mt-1 w-full border-collapse text-[9pt]">
    <thead><tr className="border-b border-gray-300 text-left">{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-gray-100">{r.map((v, j) => <td key={j} className={td}>{v}</td>)}</tr>)}</tbody>
  </table>
);
const pass = (ok) => (ok ? "ผ่าน" : "ไม่ผ่าน");
const bars = (t) => [t.top, t.topX && `+ ${t.topX} (L/4)`].filter(Boolean).join(" ");

// one beam section check (mid-span or support) in steps
function BeamSection({ title, r, M, V, tensionTop }) {
  return (<>
    <p className="mt-2 font-semibold text-gray-800">{title}</p>
    <Item th="โมเมนต์ออกแบบ" f="M" v={fmt(M, 0)} u="กก.-ม." />
    <Item th="ความลึกประสิทธิผล" f="d" v={fmt(r.d, 2)} u="ซม." />
    <Item th="โมเมนต์ต้านทานของคอนกรีต" f="Mc = R·b·d²" v={fmt(r.Mc, 0)} u="กก.-ม." note={r.mode === "singly" ? "M < Mc → เสริมเหล็กรับแรงดึงอย่างเดียว" : "M > Mc → ต้องมีเหล็กรับแรงอัดด้วย"} />
    <Item th={`เหล็กรับแรงดึง (${tensionTop ? "บน" : "ล่าง"})`} f="As = M / (fs·j·d)" v={`${fmt(r.reqBot, 2)} ≤ ${fmt(r.provBot, 2)}`} u="ซม.²" ok={r.botOk} />
    {r.reqTop > 0 && <Item th={`เหล็กรับแรงอัด (${tensionTop ? "ล่าง" : "บน"})`} f="As' = M₂ / (fs'·(d − d'))" v={`${fmt(r.reqTop, 2)} ≤ ${fmt(r.provTop, 2)}`} u="ซม.²" ok={r.topOk} />}
    <Item th="แรงเฉือน / กำลังคอนกรีต" f="Vc = 0.29·√f'c·b·d" v={`${fmt(V, 0)} / ${fmt(r.Vc, 0)}`} u="กก." note={r.Vp > 0 ? `ส่วนเกิน V' = ${fmt(r.Vp, 0)} กก. ให้เหล็กปลอกรับ` : "คอนกรีตรับแรงเฉือนได้ ใช้เหล็กปลอกขั้นต่ำ"} ok={r.VpOk} />
    <Item th="เหล็กปลอก" f={r.AtotS === 0 ? "V ≤ Vc ใช้ระยะตามแบบ" : `s ≤ ${typeof r.sMax === "number" ? fmt(r.sMax, 2) : r.sMax} ม.`} v={r.stirrup === "CHECK_SPACING" ? "ระยะเกิน" : r.stirrup} ok={r.stirrup !== "CHECK_SPACING"} />
  </>);
}

export function FrameReport({ frame, project }) {
  const res = analyzeFrame(frame), { floors, beamTypes: types, colTypes, mat } = frame;
  const spans = res.floors.flatMap((a, k) => a.spans.map((s) => ({ ...s, floor: k })));
  const fc = Math.min(mat.F * mat.fcPrime, mat.capFc !== false ? 65 : Infinity);
  let n = 0;
  return (
    <div className="report">
      <Doc project={project} title="รายการคำนวณออกแบบคานและเสา คอนกรีตเสริมเหล็ก" subtitle="RC beams & columns from the framing plan — Working Stress Design (WSD)"
        memberLabel="โครงสร้าง" member={frame.frameNo}
        summary={[
          ["จำนวนชั้น (ระดับคาน)", `${floors.length} ระดับ`],
          ["คาน", `${spans.length} ช่วง · type ${[...new Set(spans.map((s) => types[s.typeIdx]?.name))].join(", ")}`],
          ["เสา", `${res.stacks.length} ต้น · type ${[...new Set(res.stacks.map((s) => colTypes[s.typeIdx]?.name))].join(", ")}`],
          ["แรงอัดเสาที่ฐานรวม", `${fmt(res.columns.filter((c) => c.floor === 0).reduce((s, c) => s + c.Pbot, 0) / 1000, 2)} ตัน`],
          ["ผลการตรวจสอบรวม", res.ok ? "ผ่านทุกข้อ" : `คานไม่ผ่าน ${spans.filter((s) => !s.ok).length} ช่วง · เสาไม่ผ่าน ${res.columns.filter((c) => !c.ok).length} ต้น/ชั้น`, res.ok],
        ]}>
        <Sec n={++n} th="ข้อมูลการออกแบบและน้ำหนักบรรทุก" en="Design data & loads"
          intro={`ใช้วิธีหน่วยแรงใช้งาน น้ำหนักบรรทุกคงที่รวมน้ำหนักบรรทุกจรโดยไม่คูณตัวคูณ ${res.analysis === "envelope"
            ? `แรงออกแบบ = ค่ามากสุดของ (ก) คานต่อเนื่องบนจุดรองรับแบบหมุน จัดน้ำหนักจรแบบหมากรุก และ (ข) โครง 3 มิติจุดต่อแข็งทั้งอาคาร (ฐานเสา${frame.baseFixity === "fixed" ? "ยึดแน่น" : "เป็นหมุด เพราะฐานเข็ม 1–2 ต้นรับโมเมนต์ไม่ได้"} ปลายคานซอยเป็นหมุด stiffness แตกร้าว คาน 0.5Ig เสา 0.7Ig รวม P-Delta) — เสาใช้โมเมนต์จากโครง 3 มิติทั้งสองแกนแต่ไม่น้อยกว่าระยะเยื้องศูนย์ขั้นต่ำ ความยาวเสาใช้ความสูงสุทธิ (หลังคานล่างถึงท้องคานบน)`
            : "คานคิดเป็นคานต่อเนื่องวางบนจุดรองรับแบบหมุน (เสาหรือคานที่รับ) จัดน้ำหนักจรแบบหมากรุก"}`}>
          <Item th="กำลังอัดคอนกรีต" f="f'c" v={fmt(mat.fcPrime, 0)} u={ksc} note={`fc = ${fmt(fc, 1)} ${ksc}${mat.capFc !== false && mat.F * mat.fcPrime > 65 ? " (ไม่เกิน 65 ตามกฎกระทรวง)" : ""}`} />
          <Item th="เหล็กเสริม" f="fy" v={fmt(mat.fy, 0)} u={ksc} note={`เหล็กปลอก fy = ${fmt(mat.fys, 0)} ${ksc} · คอนกรีตหุ้ม ${fmt(mat.cover, 1)} ซม.`} />
          <Item th="หน่วยน้ำหนักคอนกรีต" v={fmt(CONC, 0)} u="กก./ม.³" note={`ผนัง: ${(frame.wallTypes ?? DEFAULT_WALL_TYPES).map((t) => `${t.name} ${t.w}`).join(" · ")} กก./ม.²`} />
          <Item th="กลุ่มน้ำหนัก" v={Object.values(GROUPS).map((g) => g[0]).join(" · ")} note="แยกแสดงทุกชั้น · วิเคราะห์ทุกกลุ่มรวมกัน (น้ำหนักใช้งาน) · คำนวณจากชั้นบนลงล่าง" />
          <Table head={["ระดับ (ล่าง → บน)", "เสาใต้ชั้นสูง (ม.)", "พื้นหนา (ม.)", "ปูผิว", "จร", "รวม w (กก./ม.²)"]}
            rows={floors.map((f) => [f.name, fmt(f.h, 2), f.t ? fmt(f.t, 2) : "ไม่มีพื้น", fmt(f.finish, 0), fmt(f.live, 0), f.t ? fmt(CONC * f.t + f.finish + f.live, 0) : "-"])} />
        </Sec>

        {floors.map((f, k) => {
          const an = res.floors[k], wt = frame.wallTypes ?? DEFAULT_WALL_TYPES, walls = wallsOf(f), slabs = designSlabs(an, f, mat);
          return (
            <Sec key={k} n={++n} th={`แปลนและผลคาน — ${f.name}`} en={`Floor ${k + 1}: plan, slab panels, continuous beams`}
              intro="แผ่นพื้นหาจากช่องที่คานล้อมรอบ พื้นสองทาง (L/S ≤ 2) ถ่ายน้ำหนักลงคานเป็นรูปสามเหลี่ยม/คางหมูตามเส้น 45° ค่าสูงสุด wS/2 พื้นทางเดียวลงคานด้านยาว wS/2 รวมน้ำหนักผนังบนคานและน้ำหนักคานเอง คานซอยวิเคราะห์ก่อนแล้วส่งแรงปฏิกิริยาเป็นน้ำหนักจุดให้คานที่รับ">
              <Figure caption={`แปลนคาน-เสา ${f.name} — สีตาม type คาน`}>
                <Drawing model={framePlanModel(f, an, types, res.columns.filter((c) => c.floor === k))} className="mx-auto h-[110mm]" fontSize={9} width={640} />
              </Figure>
              <p className="mt-2 font-semibold text-gray-800">น้ำหนักแยกกลุ่มที่ลงคานชั้นนี้</p>
              <Table head={["กลุ่ม", ...Object.values(GROUPS).map((g) => g[0]), "รวม"]} rows={[["ตัน", ...Object.keys(GROUPS).map((g) => fmt((an.groups[g] ?? 0) / 1000, 2)), fmt(Object.values(an.groups).reduce((a, b) => a + b, 0) / 1000, 2)]]} />
              {an.panels.length > 0 && <Table head={["แผ่น", "ชนิด", "S × L (ม.)", "หนา (ม.)", "DL", "SDL", "ผนัง", "LL", "พิเศษ", "รวม (กก./ม.²)"]}
                rows={an.panels.map((p, i) => [`P${i + 1}`, p.open ? "ช่องเปิด" : p.stairWell ? "ช่องบันได" : p.st === "GS" ? "GS บนดิน" : p.st === "PS" ? `PS วางแนว ${p.dir === "x" ? "X" : "Y"}` : p.kind === "twoway" ? "S สองทาง" : p.kind === "oneway" ? "S ทางเดียว" : "S อื่นๆ",
                  p.S ? `${fmt(p.S, 2)} × ${fmt(p.L, 2)}` : "-", fmt(p.t, 2), ...["DL", "SDL", "WALL", "LL", "SP"].map((g) => fmt(p.g[g] ?? 0, 0)), fmt(p.w, 0)])} />}
              {walls.length > 0 && (<><p className="mt-2 font-semibold text-gray-800">ผนัง</p>
                <Table head={["ผนัง", "ชนิด", "สูง (ม.)", "ช่องเปิด", "ชั้น", "ยาว (ม.)", "กก./ม.", "ลงที่"]}
                  rows={walls.map((w, i) => { const r = an.walls[i]; return [i + 1, (wt.find((x) => x.id === w.kind) ?? wt[0]).name, fmt(w.h, 2), `${w.open ?? 0}%`, (w.layers ?? 1) > 1 ? "เบิ้ล" : "เดี่ยว", fmt(r.len, 2), fmt(r.q, 0), r.on.length ? `คานแนว ${r.on.map((o) => o.line + 1).join(", ")}` : r.panel ? "แผ่นพื้น (กระจาย)" : r.ground ? "พื้นบนดิน" : "-"]; })} /></>)}
              {(an.cants.length > 0 || an.stairs.length > 0 || (f.lineLoads ?? []).length > 0 || (f.pointLoads ?? []).length > 0) && (<><p className="mt-2 font-semibold text-gray-800">พื้นยื่น บันได และน้ำหนักอื่น</p>
                <Table head={["รายการ", "รายละเอียด", "น้ำหนัก", "ลงที่"]} rows={[
                  ...an.cants.map((c, i) => [`พื้นยื่น ${i + 1}`, `ยื่น ${fmt(c.L, 2)} ม. หนา ${fmt(c.t, 2)} ม.`, `${fmt(c.w, 0)} กก./ม.²`, "คานริม (+ แรงบิด wL²/2)"]),
                  ...an.stairs.map((st, i) => [`บันได ${i + 1}`, `${STAIR_KINDS[st.kind]} · ช่วง ${fmt(st.Lr, 2)} × กว้าง ${fmt(st.B, 2)} ม. · ${fmt((st.th * 180) / Math.PI, 1)}°`, `${fmt(st.w, 0)} กก./ม.² (${fmt((st.total.DL + st.total.SDL + st.total.LL) / 1000, 2)} ตัน)`,
                    st.kind === "long" ? "คานปลายบน (ชั้นนี้) / ปลายล่าง (ชั้นล่าง)" : st.kind === "landing" ? "คานต้น/ปลายบันได + คานชานพัก" : st.kind === "cant" ? "คานด้านข้าง (+ แรงบิด)" : "คาน/ผนังสองข้าง"]),
                  ...(f.lineLoads ?? []).map((l, i) => [l.name || `น้ำหนักเส้น ${i + 1}`, `ยาว ${fmt(Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]), 2)} ม.`, `${fmt(l.q, 0)} กก./ม.`, ({ cant: "ปลายพื้นยื่น → คานริม", beam: "คาน", panel: "แผ่นพื้น" })[an.lineLoads[i]?.on] ?? "-"]),
                  ...(f.pointLoads ?? []).map((q, i) => [q.name || `น้ำหนักจุด ${i + 1}`, `(${fmt(q.p[0], 2)}, ${fmt(q.p[1], 2)})`, `${fmt(q.P, 0)} กก.`, ({ beam: "คาน", panel: "แผ่นพื้น" })[an.pointLoads[i]?.on] ?? "-"]),
                ]} /></>)}
              {slabs.length > 0 && (<><p className="mt-2 font-semibold text-gray-800">ออกแบบพื้นและบันได (โมดูลพื้น WSD)</p>
                <Table head={["แผ่น", "ชนิด", "ช่วง (ม.)", "ขอบต่อเนื่อง", "M สูงสุด (กก.-ม./ม.)", "เหล็กเสริม", "ผล"]}
                  rows={slabs.map((x) => [x.name, x.way ?? ({ C: "พื้นยื่น", ST: "บันได", PS: "PS", GS: "GS" })[x.kind] ?? x.kind, x.S ? `${fmt(x.S, 2)} × ${fmt(x.L, 2)}` : x.L ? fmt(x.L, 2) : "-",
                    x.cont !== undefined ? `${x.cont} ด้าน${x.case ? ` (กรณี ${x.case})` : ""}` : "-", x.r ? fmt(x.r.M ?? Math.max(...x.r.MS), 0) : "-", x.text ?? x.note, x.r ? pass(x.ok) : "-"])} /></>)}
              <Table head={["ช่วง", "ยาว (ม.)", "ชนิด", "Type", "M+ (กก.-ม.)", "M− (กก.-ม.)", "V (กก.)", "T (กก.-ม.)", "ใช้", "ผล"]}
                rows={an.spans.map((s) => { const m = (k) => (s.src?.[k] === "3D" ? " ³ᴰ" : ""); return [s.id, fmt(s.len, 2), KIND_TH[s.kind], types[s.typeIdx]?.name, fmt(s.Mpos, 0) + m("Mpos"), fmt(s.Mneg, 0) + m("Mneg"), fmt(s.V, 0) + m("V"), fmt(s.Mt ?? 0, 0), `${fmt(s.check.util * 100, 0)}%`, pass(s.ok)]; })} />
              {res.analysis === "envelope" && <Note>³ᴰ = ค่าจากโครง 3 มิติมากกว่าคานต่อเนื่อง (ใช้ค่านี้ออกแบบ)</Note>}
              {an.warnings.map((w) => <Note key={w}>{w}</Note>)}
            </Sec>
          );
        })}

        <Sec n={++n} th="การตรวจสอบ type คาน (ช่วงวิกฤต)" en="Beam types — governing span"
          intro="แต่ละ type แสดงการคำนวณของช่วงที่ใช้งานสูงสุด ตรวจหน้าตัดกลางคาน (โมเมนต์บวก) และหัวเสา (โมเมนต์ลบ เหล็กบนรับแรงดึง) ตามโมดูลออกแบบคาน">
          {types.map((t, i) => {
            const list = spans.filter((s) => s.typeIdx === i);
            if (!list.length) return null;
            const g = list.reduce((a, s) => (s.check.util > a.check.util ? s : a));
            return (
              <div key={i} className="mb-3">
                <p className="mt-2 font-semibold text-gray-800">{t.name} — {fmt(t.b * 100, 0)}×{fmt(t.h * 100, 0)} ซม. · ช่วงวิกฤต {floors[g.floor].name} {g.id} ยาว {fmt(g.len, 2)} ม. ({KIND_TH[g.kind]}) · ใช้ {list.length} ช่วง</p>
                {g.check.mid && <BeamSection title="กลางคาน (เหล็กล่างรับแรงดึง)" r={g.check.mid} M={g.Mpos} V={g.V} />}
                {g.check.sup && <BeamSection title="หัวเสา (เหล็กบนรับแรงดึง)" r={g.check.sup} M={g.Mneg} V={g.V} tensionTop />}
                {g.check.error && <Note>{g.check.error}</Note>}
              </div>
            );
          })}
        </Sec>

        <Sec n={++n} th="เสา" en="Columns"
          intro="แรงอัดเสาสะสมจากชั้นบนลงล่าง: แรงปฏิกิริยาคานทุกชั้นเหนือขึ้นไปรวมน้ำหนักเสาเอง เสาที่ไม่มีเสารองรับถ่ายแรงเป็นน้ำหนักจุดลงคานชั้นล่าง ตรวจตามโมดูลออกแบบเสา (WSD) ที่ระยะเยื้องศูนย์ขั้นต่ำ max(2.5 ซม., 0.1 × ด้านแคบ) โครงไม่เซ k = 1 และระยะปลอกไม่เกิน 16 เท่าเหล็กยืน / 48 เท่าเหล็กปลอก / ด้านแคบ">
          <Table head={["เสา (X, Y)", "Type", ...floors.map((f) => `ใต้ ${f.name} P (ตัน)`)]}
            rows={res.stacks.map((st) => [st.key, colTypes[st.typeIdx]?.name, ...floors.map((f, k) => { const c = st.list.find((x) => x.floor === k); return c ? `${fmt(c.Pbot / 1000, 2)} · ${c.lv.Bx}×${c.lv.By} · ${c.ok ? "ผ่าน" : "ไม่ผ่าน"}` : "—"; })])} />
          {colTypes.map((t, i) => t.levels.map((lv, j) => {
            const list = res.columns.filter((c) => c.typeIdx === i && c.lv === lv);
            if (!list.length) return null;
            const c = list.reduce((a, x) => (x.Pbot > a.Pbot ? x : a)), r = c.check.r;
            return (
              <div key={`${i}-${j}`} className="mb-2">
                <p className="mt-2 font-semibold text-gray-800">{t.name} {lv.level} — {lv.Bx}×{lv.By} ซม. {lv.n}-{lv.mainBar} ปลอก {lv.tieBar} @{fmt(lv.s, 2)} ม. · ต้นวิกฤต {c.stack} ใต้ {floors[c.floor].name}</p>
                {r ? (<>
                  <Item th="แรงอัด (รวมน้ำหนักเสา)" f="P" v={fmt(c.Pd ?? c.Pbot, 0)} u="กก." note={`ความสูงชั้น ${fmt(c.L, 2)} ม. · สูงสุทธิ lu ${fmt(c.Lu ?? c.L, 2)} ม. (หักคานลึก ${fmt(c.dTop ?? 0, 2)} ม.) · น้ำหนักเสา ${fmt(c.W, 0)} กก.`} />
                  {c.M3 && <Item th="โมเมนต์จากโครง 3 มิติ" f="Mx / My" v={`${fmt(c.M3.Mx, 0)} / ${fmt(c.M3.My, 0)}`} u="กก.-ม." note="ใช้ไม่น้อยกว่าโมเมนต์จากระยะเยื้องศูนย์ขั้นต่ำ" />}
                  <Item th="อัตราส่วนเหล็ก" f="pg = Ast/Ag" v={`${fmt(r.pg, 2)}%`} ok={r.pgOk} note={`Ast ${fmt(r.Ast, 2)} ซม.² · Ag ${fmt(r.Ag, 0)} ซม.²`} />
                  <Item th="ระยะเยื้องศูนย์ขั้นต่ำ" f="e = max(2.5, 0.1t)" v={fmt(c.check.e, 2)} u="ซม." note={`M = ${fmt(((c.Pd ?? c.Pbot) * c.check.e) / 100, 0)} กก.-ม.`} />
                  <Item th="กรณีควบคุม" v={r.mode === "I" ? "แรงอัดควบคุม" : r.mode === "II" ? "แรงอัดร่วมแรงดัด" : "แรงดึงควบคุม"} note={r.slender ? `เสาชะลูด R = ${fmt(r.R, 3)}` : "เสาสั้น"} />
                  <Item th={r.mode === "I" ? "แรงอัด / กำลังรับแรงอัด" : "อัตราส่วนหน่วยแรง"} f={r.mode === "I" ? "P ≤ Pa" : "fa/Fa + fb/Fb ≤ 1"} v={r.mode === "I" ? `${fmt(r.Pd, 0)} ≤ ${fmt(r.Pa, 0)}` : fmt(r.ratio, 3)} ok={r.ok} />
                  <Item th="ระยะเหล็กปลอก" f="s ≤ min(16db, 48dt, t)" v={`${fmt(lv.s * 100, 1)} ≤ ${fmt(r.sTie, 1)}`} u="ซม." ok={c.check.sOk} />
                </>) : <Note>{c.check.error}</Note>}
              </div>
            );
          }))}
        </Sec>

        <Sec n={++n} th="ฐานราก" en="Pile caps"
          intro={`แรงที่ฐานเสา (รวมน้ำหนักเสาทุกชั้น) ลงฐานรากเสาเข็มตอก ยาว ${(frame.footing?.pileL ?? 6)} ม. รับน้ำหนักปลอดภัย ${fmt((frame.footing?.Psafe ?? 18000) / 1000, 0)} ตัน/ต้น ตามแบบ ตรวจด้วยโมดูลฐานราก (เสาเข็ม ฐานหนา ${fmt(frame.footing?.t ?? 0.4, 2)} ม.) เลือกจำนวนและขนาดเข็มที่น้อยที่สุดที่ผ่านทุกข้อ แรงลงเสาใช้ค่ามากกว่าระหว่างคานต่อเนื่องกับคานช่วงเดี่ยว (ไม่ให้เสาที่ถูกยกรับแรงน้อยเกินจริง)`}>
          <Table head={["เสา (X, Y)", "P ฐานเสา (ตัน)", "M ฐานเสา x / y (กก.-ม.)", "เข็ม", "ฐานราก Bx × By (ม.)", "แรงต่อเข็ม / ปลอดภัย (ตัน)", "เหล็กเสริม", "ผล"]}
            rows={res.footings.map((f) => [f.stack, fmt(f.P / 1000, 2), `${fmt(f.Mx ?? 0, 0)} / ${fmt(f.My ?? 0, 0)}`, `${f.n} × ${f.pile}`, f.r ? `${fmt(f.r.Bx, 2)} × ${fmt(f.r.By, 2)}` : "-",
              f.r ? `${fmt(f.r.Ptmax / 1000, 2)} / ${fmt(f.r.Pallow / 1000, 2)}` : "-", f.r ? [f.r.longText, f.r.shortText].filter(Boolean).join(" · ") : f.error, pass(f.ok)])} />
          <Note>สรุป: ฐานเข็ม 1 ต้น {res.footings.filter((f) => f.n === 1).length} ฐาน · 2 ต้น {res.footings.filter((f) => f.n === 2).length} ฐาน · 3 ต้นขึ้นไป {res.footings.filter((f) => f.n >= 3).length} ฐาน · แรงรวมที่ฐาน {fmt(res.footings.reduce((a, f) => a + f.P, 0) / 1000, 1)} ตัน</Note>
        </Sec>

        <Sec n={++n} th="ตาราง type คานและเสา" en="Beam & column schedules" intro="ขนาดและเหล็กเสริมที่ใช้ ความยาวคานรวมวัดตามแนวศูนย์กลาง ยังไม่รวมระยะทาบและเศษเหล็ก">
          <Table head={["Type", "b × h (ซม.)", "เหล็กบน (+ เสริมหัวเสา L/4)", "เหล็กล่าง (+ เสริมกลางคาน 3L/5)", "ปลอก หัวเสา / กลาง", "จำนวน", "ยาวรวม (ม.)"]}
            rows={types.map((t, i) => { const l = spans.filter((s) => s.typeIdx === i); return [t.name, `${fmt(t.b * 100, 0)} × ${fmt(t.h * 100, 0)}`, bars(t), [t.bot, t.botX && `+ ${t.botX}`].filter(Boolean).join(" "),
              `${t.st} @${fmt(t.sSup, 2)} / @${fmt(t.sMid, 2)}`, `${l.length} ช่วง`, fmt(l.reduce((s, x) => s + x.len, 0), 2)]; })} />
          <Table head={["Type", "ระดับ", "ขนาด (ซม.)", "เหล็กยืน", "ปลอก", "จำนวน"]}
            rows={colTypes.flatMap((t, i) => t.levels.map((lv) => [t.name, lv.level, `${lv.Bx} × ${lv.By}`, `${lv.n}-${lv.mainBar}`, `${lv.tieBar} @${fmt(lv.s, 2)}`, `${res.columns.filter((c) => c.typeIdx === i && c.lv === lv).length} ต้น`]))} />
          {/* reinforcement sections of every beam type (support / mid-span) and column level in use */}
          <p className="mt-3 font-semibold text-gray-800">รูปตัดเหล็กเสริมคาน (ซ้าย: ช่วงหัวเสา · ขวา: ช่วงกลางคาน)</p>
          <div className="grid grid-cols-4 gap-2">
            {types.filter((_, i) => spans.some((sp) => sp.typeIdx === i)).flatMap((t) => {
              const L = (main, special) => [{ ...(parseBars(main) ? { main: parseBars(main) } : {}), ...(parseBars(special) ? { special: parseBars(special) } : {}) }, {}, {}];
              return [["หัวเสา", L(t.top, t.topX), L(t.bot)], ["กลางคาน", L(t.top), L(t.bot, t.botX)]].map(([where, top, bottom]) => (
                <Figure key={`${t.name}${where}`} caption={`${t.name} ${where} · ${t.st} @${fmt(where === "หัวเสา" ? t.sSup : t.sMid, 2)}`}>
                  <Drawing model={beamSectionModel({ b: t.b, h: t.h, cover: mat.cover, stirrupBar: t.st, top, bottom })} className="mx-auto h-[38mm]" fontSize={8} width={150} />
                </Figure>
              ));
            })}
          </div>
          <p className="mt-3 font-semibold text-gray-800">รูปตัดเหล็กเสริมเสา</p>
          <div className="grid grid-cols-4 gap-2">
            {colTypes.flatMap((t, i) => t.levels.filter((lv) => res.columns.some((c) => c.typeIdx === i && c.lv === lv)).map((lv) => { const [nx, ny] = faceBars(lv.n);
              return (
                <Figure key={`${t.name}${lv.level}`} caption={`${t.name} ${lv.level} · ${lv.n}-${lv.mainBar} · ${lv.tieBar} @${fmt(lv.s, 2)}`}>
                  <Drawing model={columnSectionModel({ Bx: lv.Bx, By: lv.By, cover: mat.cover, tieD: SLAB_BARS[lv.tieBar]?.d ?? 0.6, barD: SLAB_BARS[lv.mainBar]?.d ?? 1.2, nx, ny })} className="mx-auto h-[38mm]" fontSize={8} width={150} />
                </Figure>
              ); }))}
          </div>
        </Sec>
      </Doc>
    </div>
  );
}
