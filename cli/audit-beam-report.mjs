// HTML report of the beam audit: node cli/audit-beam-report.mjs audit.json plates.json out.html
// Every span: program value | independent value | difference, with the equations written out with the numbers substituted.
import fs from "fs";
import { forceMethod, doubleInt } from "./indep-beam.mjs";
const [jf, pf, out] = process.argv.slice(2);
const J = JSON.parse(fs.readFileSync(jf)), P = pf && fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf))[0] : null;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const f = (v, k = 0) => (v == null || typeof v !== "number" || !Number.isFinite(v) ? "–" : v.toLocaleString("en-US", { minimumFractionDigits: k, maximumFractionDigits: k }));
const pct = (a, b) => (typeof a === "number" && typeof b === "number" && Math.abs(b) > 1e-9 ? `${(((a - b) / Math.abs(b)) * 100).toFixed(1)} %` : "–");
const SEV = { CRITICAL: "crit", HIGH: "high", MEDIUM: "med", LOW: "low", INFO: "info", UNVERIFIED: "unv" };

// curated findings (checked by hand against the numbers below; file:line = the code as audited, before any fix)
const FIND = [
  { id: "F1", sev: "CRITICAL", title: "เหล็กรับแรงอัดอยู่ใต้แกนสะเทิน (k < d′/d) แต่ผ่าน", where: "web/engine/beam.js:87–95 designSection · web/engine/floor.js:346 checkSpan",
    text: "เมื่อต้องเสริมเหล็กรับแรงอัด (M > Mc) และ d′/d > k หน่วยแรงเหล็กอัด fs′ = 2fs(k − d′/d)/(1 − k) ติดลบ → As′ ติดลบ → เหล็กบนที่ต้องการติดลบ → ผ่านเสมอ",
    num: "กรณี 33 GB 20×20 ช่วง 3 ม.: M = 592 กก.-ม. > Mc = 290 · d = 13.95, d′ = 4.20 → d′/d = 0.301 > k = 0.250 → fs′ = −232 กก./ซม.², As′ = −13.34 ซม.² → โปรแกรม \"ผ่าน\" · ตรวจหน้าตัดแตกร้าวจริงด้วยเหล็กที่ใส่: fc = M·kd/I = 59,175×5.60/4,638 = 71.5 กก./ซม.² > 65 (เกิน 10 %)",
    fix: "ใน checkSpan (wrapper — beam.js ห้ามแก้): mode doubly และ fsPrime ≤ 0 → ไม่ผ่าน \"หน้าตัดตื้นเกินไป ต้องเพิ่มความลึก\"; เพิ่มการตรวจหน่วยแรงจริงของหน้าตัดที่ใส่เหล็กแล้ว (fc ≤ 0.45f′c, fs ≤ fs allow) เป็นด่านสุดท้าย" },
  { id: "F2", sev: "CRITICAL", title: "ช่วงคานสั้นกว่า 4h (คานลึก): แรงเฉือนออกแบบเกือบเป็นศูนย์", where: "web/engine/floor.js:319–330 shearRange / vAtD",
    text: "ใช้แรงเฉือนที่ระยะ d จากทั้งสองปลายแม้ช่วงสั้นกว่า 4h (คานลึก) — ช่วงที่เหลือระหว่าง d กับ L − d อยู่กลางคานซึ่งแรงเฉือนใกล้ศูนย์ การตรวจแรงเฉือนจึงแทบไม่เกิดขึ้น",
    num: "กรณี 6 ช่วง 2.00 ม. h 1.00 ม. (น้ำหนักรวม 19,440 กก.): V ออกแบบของโปรแกรม = 0 กก. · แรงเฉือนที่จุดรองรับจริง 9,720 กก. · type อัตโนมัติ: 3,715 แทน 4,131 กก. ช่วงสั้นระหว่างเสาชิด (เช่น 1.0 ม.) ในบ้านจริงเข้ากรณีนี้",
    fix: "ช่วง < 4h (คานลึกตาม ACI) หรือ a0 + a1 > L/2: ใช้แรงเฉือนสูงสุดที่หน้าจุดรองรับ (หรือหน้าตัดวิกฤตที่ 0.15·ln ตามข้อกำหนดคานลึก) — ไม่ใช้ V ที่ d" },
  { id: "F3", sev: "HIGH", title: "ไม่ตรวจเหล็กปลอกขั้นต่ำเมื่อ V ≤ Vc", where: "web/engine/beam.js:130–139 (r.stirrup = AtotS === 0 ? label …)",
    text: "เมื่อไม่มีแรงบิดและ V ≤ Vc โปรแกรมไม่ตรวจทั้ง s ≤ d/2 และ Av ≥ Av,min — ACI 318 (ตั้งแต่ 318-71) และ ว.ส.ท. ฉบับ WSD ที่อิงตาม ACI กำหนดเหล็กปลอกขั้นต่ำเมื่อ V > Vc/2",
    num: "35 ช่วงที่ type อัตโนมัติเลือก RB6 @0.20 ในคานกว้าง 20 ซม.: Av = 2×0.283 = 0.566 ซม.² < 0.0015·b·s = 0.0015×20×20 = 0.600 ซม.² (หรือ 3.5·b·s/fy = 0.583) · กรณี 7, 26, 32: d/2 = 0.178 ม. < s = 0.20 ม. ด้วย",
    fix: "ถามผู้ใช้ก่อน: ยืนยันฉบับมาตรฐาน — ถ้าใช้กฎ V > Vc/2 ให้ตรวจ s ≤ d/2 และ Av,min ใน checkSpan เสมอ (ยกเว้นตามตัวเลือก stirrupExempt ที่มีอยู่แล้ว) · auto type จะเปลี่ยน RB6 @0.20 → @0.15" },
  { id: "F4", sev: "HIGH", title: "จุดตัดเหล็กเสริมล่าง (3L/5) ไม่ได้ตรวจ", where: "web/engine/floor.js:64 (ข้อกำหนด botX = 3L/5) · checkSpan ตรวจเฉพาะ M สูงสุดกลางช่วง",
    text: "เหล็กเสริมล่างพิเศษหยุดที่ L/5 จากหัวเสา แต่ไม่ได้ตรวจว่าเหล็กล่างที่วิ่งตลอดรับ M+ ตรงจุดนั้นได้ (และระยะฝังเลยจุดที่ไม่ต้องการ)",
    num: "14 ช่วงที่ผ่าน: M+ ที่ L/5 เกินกำลังเหล็กวิ่งตลอด 1.03–1.53 เท่า เช่น กรณี 14 [อัตโนมัติ] 1.51×, กรณี 22 [อัตโนมัติ] 1.53× (UDL ช่วงเดียว: M(L/5) = 0.64·Mmax)",
    fix: "ตรวจ M ตามแนวคาน (envelope) ที่จุดตัด + ระยะยื่น d หรือ 12db; ถ้าไม่พอ ยืดเหล็กเสริม (เช่น ถึง 0.1L) หรือเพิ่มเหล็กวิ่งตลอดใน auto type" },
  { id: "F5", sev: "HIGH", title: "เหล็กชั้นที่ 3 ล้นจนจัดไม่ได้ แต่ผ่าน", where: "web/engine/floor.js:294 barLayers (ชั้นที่ 3 รับที่เหลือทั้งหมด)",
    text: "ชั้นที่ 3 รับเหล็กที่เหลือทั้งหมดโดยไม่จำกัดจำนวน — designSection คำนวณระยะห่างได้ แต่ไม่มีการตรวจ",
    num: "กรณี 37 คาน 20×70 เหล็กล่าง 2-DB20 + 6-DB20: ต่อชั้นได้ 2 เส้น → ชั้น 3 มี 4 เส้น ระยะช่องว่าง 1.4 ซม. (< 2.5 ซม. และ < db 2.0) → โปรแกรม \"ผ่าน\" (type ที่ผู้ใช้กรอกเอง; auto จำกัด 2 ชั้นอยู่แล้ว)",
    fix: "ใน checkSpan: ชั้นใดเกินจำนวนต่อชั้น หรือเกิน 3 ชั้น → ไม่ผ่าน \"จัดเหล็กไม่ได้\"" },
  { id: "F6", sev: "MEDIUM", title: "แรงเฉือนที่ d อ่านจากจุดแบ่ง L/40 ถัดไป", where: "web/engine/floor.js:806–810 (41 จุดต่อ element) · 330 vAtD",
    text: "V ที่ d ใช้ค่าของจุดแบ่งแรกที่เลย d ไม่ใช่ที่ d พอดี",
    num: "กรณี 1 ช่วง 4 ม.: d = 0.355 → ใช้ V(0.40) = 2,227 แทน V(0.355) = 2,290 กก. (ต่ำ 2.7 %) · มากสุด 5.1 % (กรณี 37)",
    fix: "หา V ที่ d โดยตรงจากผลวิเคราะห์ (el.V(x)) แทนการอ่านจากตาราง" },
  { id: "F7", sev: "MEDIUM", title: "ระยะแอ่นใช้ 0.5·Ig คงที่ (ไม่ใช่ Ie ของ Branson)", where: "web/engine/floor.js:772 EI = Ec·0.5·Ig",
    text: "Ie ตาม ACI (Branson) ขึ้นกับ Mcr/Ma และ Icr — คานเหล็กน้อย/โมเมนต์สูงมี Ie < 0.5Ig",
    num: "Ig·0.5 / Ie = 0.5–1.83 · กรณี 10 (20×40 ช่วง 5 ม.): โปรแกรม 24.6 มม. → Branson 44.9 มม. (ยอมให้ 20.8 — ช่วงนี้ไม่ผ่านอยู่แล้ว) · ในชุดทดสอบนี้ไม่พบช่วงที่ผ่านด้วย 0.5Ig แต่ไม่ผ่านด้วย Branson",
    fix: "ใช้ Ie ของแต่ละช่วง (Branson, Icr จากเหล็กที่ใส่) หรือเลือกค่า 0.35Ig ที่ปลอดภัยกว่า — ให้ผู้ใช้เลือก" },
  { id: "F8", sev: "MEDIUM", title: "เหล็กรับแรงบิดต่ำกว่าสูตรท่อผนังบาง ACI 7–12 %", where: "web/engine/beam.js:115–123",
    text: "At/s = T/(x1·y1·fv) ใช้พื้นที่ภายในเหล็กปลอก x1·y1 แทน A0 = 0.85·Aoh (ถึงศูนย์กลางเหล็กปลอก) และ Al = T(x1 + y1)/(x1y1·fv)",
    num: "กรณี 12 (T = 2,229 กก.-ม. ตรงกันทั้งสองวิธี): At/s รวม 2 ขา 0.361 vs 0.387 ซม.²/ซม. · Al 19.6 vs 21.8 ซม.² · กรณี 11: 0.126 vs 0.135, 6.85 vs 7.59",
    fix: "UNVERIFIED ว่ามาตรฐาน WSD ฉบับที่ใช้กำหนดสูตรใด (ACI 318-71 แบบ skew-bending ให้ค่าต่างออกไป) — ยืนยันฉบับแล้วปรับใน wrapper" },
  { id: "F9", sev: "MEDIUM", title: "อะเสต่อเนื่อง: สมมติ EI เท่ากันตลอดแนว", where: "web/engine/roofMembers.js:363, 397 (solveBeam ไม่ส่ง EI)",
    text: "เมื่อเลือกหน้าตัดต่างกันในแนวเดียว โมเมนต์และระยะแอ่นคิดจาก EI เดียว",
    num: "บ้านยโสธร เส้น 3 A5 (125×50 ติด 150×50): δ โปรแกรม 0.206 ซม. vs EI จริงรายช่วง 0.241 ซม. (ต่ำ 15 %) · M+ 185 vs 195 กก.-ม. · ยังผ่าน (ยอมให้ 0.972)",
    fix: "ส่ง EI รายช่วงเข้า solveBeam และวนซ้ำเมื่อหน้าตัดเปลี่ยน" },
  { id: "F10", sev: "LOW", title: "การเลือก type อัตโนมัติประมาณระยะแอ่นโดยไม่คิดน้ำหนักคานที่เปลี่ยน", where: "web/engine/frame.js:238 checkEnv (δ × I เดิม / I ใหม่)",
    text: "ขั้นเลือก type ใช้การปรับ δ ด้วยอัตราส่วน I อย่างเดียว — น้ำหนักตัวเองของหน้าตัดใหญ่ขึ้นไม่ได้คิด แต่การวิเคราะห์รอบสุดท้ายคำนวณใหม่ทั้งหมด ผลสุดท้ายจึงถูกต้อง",
    num: "ไม่พบผลผิดในชุดทดสอบ", fix: "ไม่ต้องแก้ทันที" },
  { id: "F11", sev: "UNVERIFIED", title: "ขีดจำกัดแรงเฉือน 0.795√f′c และ 1.32√f′c เทียบกับ V − Vc", where: "web/engine/beam.js:101–105, 132–135",
    text: "โปรแกรม (และ Excel ต้นแบบ) เทียบ V − Vc กับ 0.795 / 1.32·√f′c·bd — ACI 318-63 WSD เขียนเป็นหน่วยแรงเฉือนรวม v (3√f′c, 5√f′c psi); ถ้ามาตรฐานที่ใช้หมายถึง v รวม ขีดจำกัดของโปรแกรมสูงกว่า ~22 %",
    num: "ยังไม่พบช่วงที่ผ่านในเขตนี้ในชุดทดสอบ", fix: "ตรวจตัวบท ว.ส.ท. ฉบับที่ใช้ แล้วตัดสินใจ" },
  { id: "F12", sev: "UNVERIFIED", title: "ไม่ได้ตรวจ: ระยะฝัง/ทาบ/ยึดเหล็ก (นอกจากคานยื่น) และความกว้างรอยร้าว", where: "ทั้งระบบคาน",
    text: "Development length, lap splice, anchorage ที่หัวเสา ไม่มีการคำนวณ ยกเว้นคานยื่น (floor.js span.detail)", num: "–", fix: "เพิ่มตาราง ld / ระยะทาบตามขนาดเหล็กในรายการคำนวณ" },
];
const VERIFIED = [
  ["M+ / M− (ต่อเนื่อง, จัดน้ำหนักจร, EI ต่างกัน, คานยื่น, แรงจุด)", "ตรงกับ force method อิสระ ≤ 1 % ทุกช่วง (กรณี 22 แรงจุด 3 จุด: M+ 7,890 vs 7,947 = 0.7 %)"],
  ["ระยะแอ่น (3δD + δL, 0.5Ig)", "ตรงกับ double integration ≤ 0.6 % และ moment-area (กลางช่วง) — รวม EI ต่างกัน (31), หลาย element (22), คานยื่น (7, 32), หลังแก้เครื่องหมายเมื่อ 2026-11-04"],
  ["As ต้องการ (singly / doubly) เมื่อ fs′ > 0", "ตรงกับสมการอิสระ ≤ 3 % (ต่างกันจาก d ที่จัดชั้นเหล็กต่างกันเล็กน้อย)"],
  ["T (แรงบิดสมดุลจากพื้นยื่น)", "T = (wL²/2)·L/2 ตรงกันทุกกรณี (778, 2,229, 314 กก.-ม.)"],
  ["หน่วยแรงจริงของหน้าตัดที่ผ่าน", "fc ≤ 0.45f′c และ fs ≤ 1,700 ทุกช่วงที่ผ่าน ยกเว้น F1"],
  ["หน้าตัดที่ไม่มีขนาดใดผ่าน", "auto ไม่เลือกและแจ้ง (กรณี 5, 15, 18, 20, 27, 30, 35) — ถูกต้อง"],
];

const css = `
:root{--bg:#f6f7f9;--paper:#ffffff;--ink:#16202e;--mute:#5d6a7c;--rule:#d9dee6;--accent:#1d4e89;--crit:#b42318;--high:#c4320a;--med:#b54708;--low:#475467;--ok:#067647;--unv:#6941c6;--chip:#eef2f7;
--f-body:"IBM Plex Sans Thai","Sarabun",system-ui,sans-serif;--f-mono:"IBM Plex Mono",ui-monospace,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0f141b;--paper:#161d27;--ink:#e6ebf2;--mute:#9aa6b8;--rule:#2a3442;--accent:#7fb0ef;--crit:#ff6b5e;--high:#ff8a4c;--med:#f5b14c;--low:#a7b3c4;--ok:#47cd89;--unv:#b69cff;--chip:#1f2835;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0f141b;--paper:#161d27;--ink:#e6ebf2;--mute:#9aa6b8;--rule:#2a3442;--accent:#7fb0ef;--crit:#ff6b5e;--high:#ff8a4c;--med:#f5b14c;--low:#a7b3c4;--ok:#47cd89;--unv:#b69cff;--chip:#1f2835;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:15px/1.6 var(--f-body)}
.wrap{max-width:1180px;margin:0 auto;padding-block:28px 64px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:28px}
h1{font-size:28px;line-height:1.25;margin:0;text-wrap:balance}h2{font-size:20px;margin:0 0 10px;text-wrap:balance}h3{font-size:16px;margin:0}
.meta{color:var(--mute);font-size:13px}.lead{max-width:72ch;margin:6px 0 0}
section{background:var(--paper);border:1px solid var(--rule);border-radius:8px;padding:18px 20px;min-width:0}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid var(--rule);padding:5px 8px;text-align:left;vertical-align:top}th{color:var(--mute);font-weight:600;white-space:nowrap}
td.n{text-align:right;white-space:nowrap;font-family:var(--f-mono);font-size:12.5px}
.sev{display:inline-block;font:600 11px/1.6 var(--f-mono);letter-spacing:.04em;padding:0 7px;border-radius:4px;border:1px solid currentColor}
.crit{color:var(--crit)}.high{color:var(--high)}.med{color:var(--med)}.low{color:var(--low)}.info{color:var(--mute)}.unv{color:var(--unv)}.okc{color:var(--ok)}
.counts{display:flex;flex-wrap:wrap;gap:10px}.counts div{background:var(--chip);border-radius:6px;padding:8px 12px;min-width:110px}.counts b{display:block;font-size:22px;font-family:var(--f-mono)}
.find{border-top:1px solid var(--rule);padding:12px 0;display:grid;gap:4px}.find:first-of-type{border-top:0}
.find code,.eq code{font-family:var(--f-mono);font-size:12.5px;background:var(--chip);padding:1px 5px;border-radius:3px;word-break:break-word}
.k{color:var(--mute);font-size:13px}
details{border-top:1px solid var(--rule);padding:8px 0}details>summary{cursor:pointer;font-weight:600;list-style:none;display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}
details>summary::-webkit-details-marker{display:none}details>summary::before{content:"▸";color:var(--mute)}details[open]>summary::before{content:"▾"}
.eq{font-family:var(--f-mono);font-size:12.5px;line-height:1.75;display:grid;gap:2px;margin:8px 0 4px;min-width:0}
.eq div{word-break:break-word}.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px 24px}
.pass{color:var(--ok);font-weight:600}.fail{color:var(--crit);font-weight:600}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}`;

const spanBlock = (r) => {
  const t = r.t, b = t.b * 100, h = t.h * 100, sq = Math.sqrt(240), M = r.kind === "cantilever" ? r.Mneg[1] : r.Mpos[1], st = r.kind === "cantilever" ? r.stS : r.stM, ra = r.kind === "cantilever" ? r.rS : r.rM;
  const d = r.kind === "cantilever" ? r.dSupI : r.dMidI, k = r.k, j = k ? 1 - k / 3 : null, R = k ? 0.5 * r.fc * k * j : null, Mc = R ? (R * b * d * d) / 100 : null;
  const verdictP = r.ok ? '<span class="pass">ผ่าน</span>' : '<span class="fail">ไม่ผ่าน</span>', verdictI = r.indepOk ? '<span class="pass">ผ่าน</span>' : '<span class="fail">ไม่ผ่าน</span>';
  const why = []; if (!r.shearOk) why.push(r.V[1] > r.Vc ? "แรงเฉือนเกินกำลัง" : "เหล็กปลอกขั้นต่ำ (V > Vc/2): s ≤ d/2 / Av ≥ 0.0015bs");
  if (st && (st.fc > r.fc * 1.02 || st.fs > r.fs * 1.02)) why.push(`หน่วยแรงจริงเกิน (fc ${f(st.fc, 1)} / fs ${f(st.fs, 0)})`); if (ra && !ra.singly && !(ra.fsp > 0)) why.push("fs′ ≤ 0 (k < d′/d)");
  if (r.cutBot) why.push(`จุดตัดเหล็กล่าง ${f(r.cutBot, 2)}×`); if (r.cutTop) why.push(`จุดตัดเหล็กบน ${f(r.cutTop, 2)}×`); if (!r.fit[3]) why.push(`จัดเหล็กไม่ได้ (${r.fit[1]})`);
  const sv = r.sUsed, Vs = (2 * ({ "RB 6": 0.283, "RB 9": 0.636, "DB 10": 0.785 }[t.st] ?? 0.283) * r.fv * r.dSupI) / (sv * 100);
  return `<details><summary><span>${esc(r.span)} · ${esc(r.kind)} · ${b}×${h} · บน ${esc(t.top)}${t.topX ? ` + ${esc(t.topX)}` : ""} · ล่าง ${esc(t.bot)}${t.botX ? ` + ${esc(t.botX)}` : ""} · ${esc(t.st)} @${t.sSup}/${t.sMid}</span><span class="k">โปรแกรม ${verdictP} · ตรวจอิสระ ${verdictI}${why.length ? ` — ${esc(why.join(" · "))}` : ""}</span></summary>
  <div class="tw"><table><thead><tr><th>ค่า</th><th>โปรแกรม</th><th>อิสระ</th><th>ต่าง</th><th>วิธีอิสระ</th></tr></thead><tbody>
  <tr><td>M+ (กก.-ม.)</td><td class="n">${f(r.Mpos[0])}</td><td class="n">${f(r.Mpos[1])}</td><td class="n">${pct(r.Mpos[0], r.Mpos[1])}</td><td>force method + จัดน้ำหนักจรรายช่วง</td></tr>
  <tr><td>M− (กก.-ม.)</td><td class="n">${f(r.Mneg[0])}</td><td class="n">${f(r.Mneg[1])}</td><td class="n">${pct(r.Mneg[0], r.Mneg[1])}</td><td>ที่หัวเสา (คานยื่น: ทั้งช่วง)</td></tr>
  <tr><td>V ที่ d (กก.)</td><td class="n">${f(r.pVd)}</td><td class="n">${f(r.V[1])}</td><td class="n">${pct(r.pVd, r.V[1])}</td><td>dV/dx ของ M envelope ที่ x = d (d = h − c − 1.5)</td></tr>
  <tr><td>T (กก.-ม.)</td><td class="n">${f(r.pMt)}</td><td class="n">${f(r.myT)}</td><td class="n">${r.myT ? pct(r.pMt, r.myT) : "–"}</td><td>(wLc²/2)·L/2</td></tr>
  <tr><td>d (ซม.)</td><td class="n">${f(r.d[0], 2)}</td><td class="n">${f(r.d[1], 2)}</td><td class="n">${pct(r.d[0], r.d[1])}</td><td>h − ระยะถึงศูนย์ถ่วงเหล็ก (จัดชั้นเอง)</td></tr>
  <tr><td>As ต้องการ (ซม.²)</td><td class="n">${typeof r.AsReq[0] === "number" ? f(r.AsReq[0], 2) : esc(r.AsReq[0] ?? "–")}</td><td class="n">${f(r.AsReq[1], 2)}</td><td class="n">${pct(r.AsReq[0], r.AsReq[1])}</td><td>รวมเหล็กรับบิด Al/2</td></tr>
  <tr><td>As ใส่ (ซม.²)</td><td class="n">${f(r.AsProv[0], 2)}</td><td class="n">${f(r.AsProv[1], 2)}</td><td class="n">${pct(r.AsProv[0], r.AsProv[1])}</td><td>ด้านรับแรงดึง</td></tr>
  <tr><td>Ma ของหน้าตัด (กก.-ม.) ≈ φMn ของ WSD</td><td class="n">–</td><td class="n">${f(r.kind === "cantilever" ? r.MaSup : r.MaMid)}</td><td class="n">${f(M / (r.kind === "cantilever" ? r.MaSup : r.MaMid), 2)}×</td><td>min(fc,allow·I/kd, fs,allow·I/(n(d−kd)))</td></tr>
  <tr><td>Vc + Vs (กก.) ≈ φVn ของ WSD</td><td class="n">–</td><td class="n">${f(r.Vc + Vs)}</td><td class="n">${f(r.V[1] / (r.Vc + Vs), 2)}×</td><td>0.29√f′c·bd + Av·fv·d/s</td></tr>
  <tr><td>δ รวม 3δD + δL (มม.)</td><td class="n">${f(r.defl[0] * 1000, 2)}</td><td class="n">${f(r.defl[1] * 1000, 2)}</td><td class="n">${pct(r.defl[0], r.defl[1])}</td><td>double integration (moment-area กลางช่วง ${f(r.defl[2] != null ? r.defl[2] * 1000 : null, 2)})</td></tr>
  <tr><td>δ ด้วย Ie Branson (มม.)</td><td class="n">–</td><td class="n">${f(r.defl[0] * r.branson * 1000, 2)}</td><td class="n">${f(r.branson, 2)}×</td><td>0.5Ig / Ie</td></tr>
  </tbody></table></div>
  <div class="eq">
   <div>fc = min(0.45·240, 65) = ${f(r.fc, 1)} · fs = ${f(r.fs)} · fv = ${f(r.fv)} · n = Es/Ec = 2,040,000/(15,100√240) = ${f(r.n, 2)}</div>
   ${k ? `<div>k = n·fc/(n·fc + fs) = ${f(r.n, 2)}×${f(r.fc, 1)}/(${f(r.n, 2)}×${f(r.fc, 1)} + ${f(r.fs)}) = ${f(k, 3)} · j = 1 − k/3 = ${f(j, 3)} · R = ½·fc·k·j = ${f(R, 2)}</div>
   <div>Mc = R·b·d² = ${f(R, 2)}×${b}×${f(d, 2)}² /100 = ${f(Mc)} กก.-ม. → M ${M <= Mc ? "≤" : ">"} Mc → ${M <= Mc ? "เหล็กรับแรงดึงอย่างเดียว" : "เสริมเหล็กรับแรงอัด"}</div>
   <div>${ra?.singly ? `As = M/(fs·j·d) = ${f(M * 100)}/(${f(r.fs)}×${f(j, 3)}×${f(d, 2)}) = ${f((M * 100) / (r.fs * j * d), 2)} ซม.²` : ra ? `As = Mc/(fs·j·d) + (M − Mc)/(fs(d − d′)) = ${f(ra.As - r.Al / 2, 2)} ซม.² · fs′ = 2fs(k − d′/d)/(1 − k) = ${f(ra.fsp, 0)} → As′ = ${Number.isFinite(ra.Asp) ? f(ra.Asp - r.Al / 2, 2) : "∞ (fs′ ≤ 0)"} ซม.²` : ""}${r.Al ? ` · + Al/2 = ${f(r.Al / 2, 2)} (บิด)` : ""}</div>` : ""}
   ${st ? `<div>หน้าตัดแตกร้าว (เหล็กที่ใส่, As′ คิด 2n − 1): kd = ${f(st.kd, 2)} ซม. · Icr = ${f(st.I)} ซม.⁴ · fc = M·kd/I = ${f(st.fc, 1)} ${st.fc <= r.fc * 1.02 ? "≤" : ">"} ${f(r.fc, 1)} · fs = n·M(d − kd)/I = ${f(st.fs)} ${st.fs <= r.fs * 1.02 ? "≤" : ">"} ${f(r.fs)}</div>` : ""}
   <div>Vc = 0.29√f′c·b·d = 0.29×${f(sq, 2)}×${b}×${f(r.dSupI, 2)} = ${f(r.Vc)} · V = ${f(r.V[1])} ${r.V[1] > r.Vc ? `> Vc → s ≤ Av·fv·d/(V − Vc) = ${f(r.sReq, 3)} ม.` : r.V[1] > r.Vc / 2 ? "อยู่ระหว่าง Vc/2 กับ Vc → เหล็กปลอกขั้นต่ำ" : "≤ Vc/2"}</div>
   <div>s ≤ ${f(r.sLim, 3)} ม. (d/2) · Av,min: s ≤ Av/(0.0015·b) = ${f(r.sMinA, 3)} ม. · ใช้ s = ${sv} ม.</div>
   ${r.myT ? `<div>บิด: Aoh = (b − 2c − ds)(h − 2c − ds), A0 = 0.85·Aoh = ${f(r.A0)} ซม.² · At/s (2 ขา) = T/(A0·fv) = ${f(2 * r.At1, 4)} (โปรแกรม ${f(r.pAtS, 4)}) · Al = (At/s)·ph = ${f(r.Al, 2)} (โปรแกรม 4·Ast = ${f(4 * r.pAst, 2)}) ซม.²</div>` : ""}
   <div>Branson: Mcr = 2√f′c·Ig/(h/2) = ${f(r.Mcr)} กก.-ม. · Ma = ${f(r.Ma)} · Ie = (Mcr/Ma)³Ig + [1 − (Mcr/Ma)³]Icr = ${f(r.Ie)} ซม.⁴ (Ig ${f(r.Ig)}, Icr ${f(r.Icr)})</div>
  </div></details>`;
};

const byCase = new Map(); for (const r of J.rows) { if (!byCase.has(r.case)) byCase.set(r.case, []); byCase.get(r.case).push(r); }
const cnt = (s) => FIND.filter((x) => x.sev === s).length;
const passRows = J.rows.filter((r) => r.ok), badPass = passRows.filter((r) => !r.indepOk);
const summaryRows = [...byCase].map(([name, rs]) => `<tr><td>${esc(name)}</td>${(() => { const r = rs.reduce((a, x) => (Math.max(x.Mpos[1], x.Mneg[1]) > Math.max(a.Mpos[1], a.Mneg[1]) ? x : a));
  return `<td>${r.sec}</td><td class="n">${f(Math.max(r.Mpos[0], r.Mneg[0]))} / ${f(Math.max(r.Mpos[1], r.Mneg[1]))}</td><td class="n">${f(r.pVd)} / ${f(r.V[1])}</td><td class="n">${f(r.pMt)} / ${f(r.myT)}</td>
  <td class="n">${typeof r.AsReq[0] === "number" ? f(r.AsReq[0], 2) : "NG"} / ${f(r.AsReq[1], 2)}</td><td class="n">${f(r.AsProv[1], 2)}</td><td class="n">${f(r.kind === "cantilever" ? r.MaSup : r.MaMid)}</td><td class="n">${f(r.Vc + 0)}</td>
  <td class="n">${f(r.defl[0] * 1000, 1)} / ${f(r.defl[1] * 1000, 1)}</td><td>${rs.every((x) => x.ok) ? '<span class="pass">ผ่าน</span>' : '<span class="fail">ไม่ผ่าน</span>'} / ${rs.every((x) => x.indepOk) ? '<span class="pass">ผ่าน</span>' : '<span class="fail">ไม่ผ่าน</span>'}</td>
  <td class="n">${pct(Math.max(r.Mpos[0], r.Mneg[0]), Math.max(r.Mpos[1], r.Mneg[1]))}</td>`; })()}</tr>`).join("");

// wall plates
let plateHtml = "";
if (P) { const rows = []; for (const ln of P.lines) { const ms = ln.tags.map((t) => P.members.find((m) => m.tag === t)), xs = ln.x.filter((_, i) => ln.sup[i]), L = ln.x.at(-1);
  const EIs = ms.map((m) => (P.E * m.Ix * m.count) / 1e4), EIat = (x) => EIs[Math.max(0, ln.x.findIndex((v, i) => i > 0 && x <= v + 1e-9) - 1)], loads = ln.loads.map((l) => (l.P !== undefined ? { at: l.at, P: l.P } : { a: l.a, b: l.b, w: l.wa }));
  const fm = forceMethod(L, xs, EIat, loads), v = doubleInt(fm, xs), fu = forceMethod(L, xs, () => EIs[0], loads), vu = doubleInt(fu, xs), hh = fm.h;
  ms.forEach((m, j) => { const k0 = Math.round(ln.x[j] / hh), k1 = Math.round(ln.x[j + 1] / hh), seg = (a) => a.slice(k0, k1 + 1), d1 = Math.max(...seg(v).map(Math.abs)) * 100, du = Math.max(...seg(vu).map(Math.abs)) * 100;
    rows.push(`<tr><td>${esc(ln.label)} ${m.tag}</td><td>${esc(m.name)} ×${m.count}</td><td class="n">${f(ln.x[j + 1] - ln.x[j], 2)}</td><td class="n">${f(m.Mpos)} / ${f(Math.max(0, ...seg(fm.M)))}</td><td class="n">${f(m.Mneg)} / ${f(Math.max(0, ...seg(fm.M).map((x) => -x)))}</td><td class="n">${f(m.d, 3)}</td><td class="n">${f(du, 3)}</td><td class="n">${f(d1, 3)}</td><td class="n">${pct(m.d, d1)}</td><td class="n">${f(m.dAllow, 3)}</td></tr>`); }); }
  plateHtml = `<section id="plates"><h2>อะเสต่อเนื่อง (ตรวจแยกจากคาน) — บ้านยโสธร</h2><p class="k">แต่ละเส้นอะเสแก้ใหม่ด้วย force method อิสระ โดยใช้ EI = E·Ix·จำนวนตัว ของหน้าตัดแต่ละช่วง และแบบ EI เดียว (สมมติฐานของโปรแกรม) น้ำหนัก: จันทัน + น้ำหนักตัวเอง + แรงจุดดั้ง/ตุ๊กตา</p>
  <div class="tw"><table><thead><tr><th>ช่วง</th><th>หน้าตัด</th><th>L (ม.)</th><th>M+ โปรแกรม / อิสระ</th><th>M− โปรแกรม / อิสระ</th><th>δ โปรแกรม (ซม.)</th><th>δ อิสระ EI เดียว</th><th>δ อิสระ EI รายช่วง</th><th>ต่าง</th><th>ยอมให้</th></tr></thead><tbody>${rows.join("")}</tbody></table></div></section>`; }

const html = `<title>Beam Design Audit</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans+Thai:wght@400;600&display=swap">
<style>${css}</style>
<div class="wrap">
<header><div class="meta">StructCalc · ตรวจสอบระบบออกแบบคาน คสล. และการเลือกหน้าตัดอัตโนมัติ · 2026-11-04 · ยังไม่ได้แก้โค้ด (รอบรายงาน)</div>
<h1>ผลตรวจสอบอิสระ: ออกแบบคานและเลือกหน้าตัดอัตโนมัติ</h1>
<p class="lead">37 กรณี × 2 แบบ (type ที่กำหนด / type ที่โปรแกรมเลือกเอง) = ${J.rows.length} ช่วงคาน · ตัวตรวจอิสระ <code>cli/audit-beam.mjs</code> + <code>cli/indep-beam.mjs</code> ไม่เรียกฟังก์ชันคำนวณหรือวิเคราะห์ของโปรแกรม (ตารางเหล็ก, การจัดชั้น, force method, หน่วยแรงหน้าตัดแตกร้าว, Branson เขียนใหม่ทั้งหมด) · โปรแกรมผ่าน ${passRows.length} ช่วง · ในนั้นตรวจอิสระไม่ผ่าน ${badPass.length} ช่วง</p></header>
<section><h2>มาตรฐานที่โปรแกรมใช้จริง</h2><p>วิธีหน่วยแรงใช้งาน (WSD) ตาม ว.ส.ท. / ACI 318 (WSD) และกฎกระทรวง 2566: fc = 0.45f′c ≤ 65 กก./ซม.², fs = 1,700 (SD40), fv = 1,200 (SR24), n = Es/Ec, Ec = 15,100√f′c, น้ำหนักไม่คูณตัวคูณ (D + L, จัดน้ำหนักจรรายช่วง)
หัวข้อของวิธีกำลัง (USD) — Mu, φ, a, c, Mn, tension/compression-controlled — <b>ไม่มีในโปรแกรม</b> จึงตรวจด้วยตัวเทียบของ WSD: M ใช้งาน, k·d (แกนสะเทิน), j·d (แขนโมเมนต์), Ma = โมเมนต์ที่ยอมให้ของหน้าตัดที่ใส่เหล็ก (แทน φMn) และ Vc + Vs (แทน φVn)</p></section>
<section><h2>สรุปข้อค้นพบ</h2><div class="counts">${["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNVERIFIED"].map((s) => `<div><span class="sev ${SEV[s]}">${s}</span><b>${cnt(s)}</b></div>`).join("")}</div>
${FIND.map((x) => `<div class="find"><h3><span class="sev ${SEV[x.sev]}">${x.sev}</span> ${x.id} · ${esc(x.title)}</h3><div class="k"><code>${esc(x.where)}</code></div><div>${esc(x.text)}</div><div><b>ตัวเลข:</b> ${esc(x.num)}</div><div><b>เสนอแก้:</b> ${esc(x.fix)}</div></div>`).join("")}</section>
<section><h2>ส่วนที่ยืนยันว่าถูกต้อง</h2><div class="tw"><table><tbody>${VERIFIED.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}</tbody></table></div></section>
<section><h2>ตารางรวมรายกรณี (ช่วงที่โมเมนต์สูงสุดของแต่ละกรณี · โปรแกรม / อิสระ)</h2><div class="tw"><table><thead><tr><th>กรณี</th><th>หน้าตัด</th><th>M (กก.-ม.)</th><th>V ที่ d (กก.)</th><th>T (กก.-ม.)</th><th>As ต้องการ (ซม.²)</th><th>As ใส่</th><th>Ma ≈ φMn</th><th>Vc</th><th>δ (มม.)</th><th>ผล</th><th>ต่าง M</th></tr></thead><tbody>${summaryRows}</tbody></table></div></section>
<section><h2>รายละเอียดทุกช่วง พร้อมสมการ</h2><p class="k">คลิกที่ช่วงเพื่อดูตาราง โปรแกรม | อิสระ | ต่าง และสมการที่แทนค่าแล้ว</p>
${[...byCase].map(([name, rs]) => `<div><h3 style="margin-top:14px">${esc(name)}</h3>${rs.map(spanBlock).join("")}</div>`).join("")}</section>
${plateHtml}
<section><h2>วิธีตรวจอิสระ</h2><div class="grid2"><div class="eq">
<div>วิเคราะห์: force method — โครงหลัก = คานพาดสองปลาย (+ ยื่น), ตัวไม่ทราบค่า = แรงปฏิกิริยาที่เสากลาง</div><div>δi0 = ∫M0·mi/EI dx, fij = ∫mi·mj/EI dx, Σfij·Rj = δi0 (4,000 ช่วงย่อย)</div><div>envelope: ตายตัวทั้งคาน + จรรายช่วง (บวก/ลบ แยก)</div><div>ระยะแอ่น: v = ∬M/EI, v = 0 ที่จุดรองรับ · moment-area: δ = (x/L)·tB/A − tx/A</div></div>
<div class="eq"><div>หน้าตัดแตกร้าว: b(kd)²/2 + (2n − 1)As′(kd − d′) = nAs(d − kd)</div><div>I = b(kd)³/3 + (2n − 1)As′(kd − d′)² + nAs(d − kd)²</div><div>fc = M·kd/I, fs = n·M(d − kd)/I</div><div>Branson: Ie = (Mcr/Ma)³Ig + [1 − (Mcr/Ma)³]Icr, fr = 2√f′c</div><div>บิด: At/s = T/(2·A0·fv), A0 = 0.85Aoh, Al = (At/s)·ph</div></div></div></section>
</div>`;
fs.writeFileSync(out, html);
console.log("written", out, (html.length / 1024).toFixed(0), "kB");
