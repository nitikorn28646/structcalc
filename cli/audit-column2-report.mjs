// HTML report of column audit round 2: node cli/audit-column2-report.mjs a.json b.json ... out.html
import fs from "fs";
const args = process.argv.slice(2), outF = args.pop(), H = args.map((p) => JSON.parse(fs.readFileSync(p)));
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const f = (v, k = 2) => (v == null ? "–" : !Number.isFinite(v) ? "∞" : v >= 98 ? "R≤0" : v.toLocaleString("en-US", { minimumFractionDigits: k, maximumFractionDigits: k }));
const u = (v) => `<td class="n ${v > 1.005 ? "bad" : ""}">${f(v)}</td>`;
const NAME = { "web/public/projects/yasothon.json": "บ้านยโสธร (ตัวอย่าง)", "web/public/projects/_user.json": "บ้านคุณหนูเลียง (ไฟล์ผู้ใช้)" };
const nm = (h) => NAME[h.file.replace(/^public/, "web/public")] ?? h.file;
const css = `:root{--bg:#f5f7f6;--paper:#fff;--ink:#17221f;--mute:#5b6b66;--rule:#d7dfdc;--acc:#0f6b5c;--ok:#067647;--bad:#b42318;--warn:#9a5b00;--chip:#edf3f1;--f:"IBM Plex Sans Thai",system-ui,sans-serif;--m:"IBM Plex Mono",ui-monospace,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0f1513;--paper:#161e1b;--ink:#e4ece9;--mute:#9db0aa;--rule:#2a3632;--acc:#5fd0b8;--ok:#47cd89;--bad:#ff6b5e;--warn:#f0b54a;--chip:#1e2925;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0f1513;--paper:#161e1b;--ink:#e4ece9;--mute:#9db0aa;--rule:#2a3632;--acc:#5fd0b8;--ok:#47cd89;--bad:#ff6b5e;--warn:#f0b54a;--chip:#1e2925;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:15px/1.6 var(--f);margin:0}.wrap{max-width:1240px;margin:0 auto;padding-block:28px 64px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:22px}
h1{font-size:26px;margin:0;text-wrap:balance}h2{font-size:19px;margin:0 0 10px}h3{font-size:15px;margin:14px 0 6px}section{background:var(--paper);border:1px solid var(--rule);border-radius:8px;padding:18px 20px;min-width:0}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:12.5px;font-variant-numeric:tabular-nums}th,td{border-bottom:1px solid var(--rule);padding:4px 6px;text-align:left;vertical-align:top}th{color:var(--mute);font-weight:600;white-space:nowrap}
td.n{text-align:right;white-space:nowrap;font-family:var(--m);font-size:12px}.ok{color:var(--ok);font-weight:600}.bad{color:var(--bad);font-weight:600}.warn{color:var(--warn)}.k{color:var(--mute);font-size:13px}
.tiles{display:flex;flex-wrap:wrap;gap:10px}.tiles div{background:var(--chip);border-radius:6px;padding:8px 12px;min-width:140px}.tiles b{display:block;font:600 20px var(--m)}
th.g{text-align:center;border-bottom:2px solid var(--acc);color:var(--ink)}code{font-family:var(--m);font-size:12px;background:var(--chip);padding:1px 5px;border-radius:3px}li{margin:3px 0}details{border-top:1px solid var(--rule);padding:8px 0}summary{cursor:pointer;font-weight:600}`;
const cause = (r) => { const w = r.v.FD, out = [];
  if (w.detail.includes("kh/r > 100")) out.push(`k·Lu/r > 100 (k ${f(Math.max(r.kx, r.ky))}, ปลายบนไม่มีคานยึดในทิศนั้น) — ต้องวิเคราะห์อันดับสอง/เพิ่มขนาด`);
  else if (!w.strengthOk && r.sway && !r.v.FB.ok === false) out.push(`ชั้นนี้เซได้ (Q ${f(r.Q, 3)} > 0.05) → R = 1.07 − 0.008·k·Lu/r = ${f(w.R)} (k ${f(r.kx)} / ${f(r.ky)})`);
  else if (!w.strengthOk) out.push(`โมเมนต์จากโครง 3 มิติ Mx ${f(r.Mx, 0)} / My ${f(r.My, 0)} กก.-ม.${r.sway ? `, ชั้นเซได้ R ${f(w.R)}` : ""}`);
  out.push(...w.detail.filter((d) => d !== "kh/r > 100")); return out.join(" · "); };
const house = (h) => {
  const R = h.rows, cnt = (k) => R.filter((r) => r.v[k].ok).length, n = R.length;
  const st = h.storeys.map((s) => `<tr><td>${esc(s.name)}</td><td class="n">${f(s.h)}</td><td class="n">${f(s.P, 0)}</td><td class="n">${f(s.Qx, 3)}</td><td class="n">${f(s.Qy, 3)}</td><td class="n">${f(s.QxS, 3)} / ${f(s.QyS, 3)}</td><td class="n">${f(s.QxP, 3)} / ${f(s.QyP, 3)}</td><td>${s.sway ? '<span class="bad">เซได้ (sway)</span>' : '<span class="ok">ยึดรั้ง (braced)</span>'}</td></tr>`).join("");
  const rows = R.map((r) => `<tr><td>${esc(r.id)}${r.free ? ' <span class="k">ปลายบนอิสระ</span>' : ""}${r.leanX || r.leanY ? ' <span class="k">เสาพิง</span>' : ""}</td><td>${esc(r.lv)}</td><td class="n">${f(r.Lu)}</td><td class="n">${f(r.Pacc, 0)}</td><td class="n">${f(r.N3, 0)}</td><td class="n">${f(r.Mx, 0)}</td><td class="n">${f(r.My, 0)}</td>
    <td class="n">${f(r.kx)} / ${f(r.ky)}</td>${u(r.prog.A.util)}${u(r.prog.F.util)}${u(r.v.AB.uB)}${u(r.v.AU.uB)}${u(r.v.FB.uB)}${u(r.v.FU.uB)}${u(r.v.FD.uX)}${u(r.v.FD.uY)}${u(r.v.FD.uB)}
    <td>${r.v.FD.ok ? '<span class="ok">ผ่าน</span>' : `<span class="bad">ไม่ผ่าน</span> <span class="k">${esc(cause(r))}</span>`}</td></tr>`).join("");
  const fails = R.filter((r) => !r.v.FD.ok || !r.v.AD.ok);
  const usdRows = [...R].sort((a, b) => b.usdS - a.usdS).slice(0, 10).map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(r.lv)}</td><td class="n">${f(r.usdB)}</td><td class="n">${f(r.ds)}</td><td class="n">${f(r.usdS)}</td></tr>`).join("");
  const df = R.map((r) => [r.prog.A.util - r.v.PA.uB, r.v.PF ? r.prog.F.util - r.v.PF.uB : 0]);
  return `<section><h2>${esc(nm(h))}</h2>
  <div class="tiles"><div>เสาทั้งหมด<b>${n}</b></div><div>Axial · Braced<b>${cnt("AB")}/${n}</b></div><div>Axial · Unbraced<b>${cnt("AU")}/${n}</b></div><div>Frame · Braced<b>${cnt("FB")}/${n}</b></div><div>Frame · Unbraced<b>${cnt("FU")}/${n}</b></div><div>Frame · ตาม Q (แนะนำ)<b>${cnt("FD")}/${n}</b></div><div>โปรแกรมตอนนี้ (axial)<b>${R.filter((r) => r.prog.A.ok).length}/${n}</b></div></div>
  <p class="k">ฐานราก ${h.baseFixity === "fixed" ? "ยึดแน่น" : "ยึดหมุน"} · แรงด้านข้าง ${h.latOn ? "เปิด" : "ปิด → ชุดผสมแรงมีแค่ D + L"} · ΣRz โครง 3 มิติ ${f(h.check.gravity3D / 1000, 1)} ตัน = น้ำหนักที่ใส่ ${f(h.check.load3D / 1000, 1)} ตัน · ΣP สะสมที่ฐาน ${f(h.check.accBase / 1000, 1)} ตัน (รวมกรณีจัดวางน้ำหนักจร + max ต่อเนื่อง/ช่วงเดียว)</p>
  <h3>1. ความมั่นคงรายชั้น (ยึดรั้งหรือเซได้)</h3><div class="tw"><table><thead><tr><th>ชั้น</th><th>lc ม.</th><th>ΣP (D+L) กก.</th><th>Qx</th><th>Qy</th><th>Q ที่น้ำหนักใช้งาน</th><th>Q ความแข็งโปรแกรม (0.5Ig, จุดที่เคลื่อนมากสุด)</th><th>ผล</th></tr></thead><tbody>${st}</tbody></table></div>
  <p class="k">Q = ΣPu·Δo/(Vus·lc) (ACI 318-11 10.10.5.2), ΣPu = 1.55 × ΣP ใช้งาน, Δo จากโครง 3 มิติอันดับหนึ่ง แรงทดสอบตามน้ำหนักแต่ละชั้น พื้นแข็งเกร็ง, 0.70Ig เสา / 0.35Ig คาน (10.10.4.1) · Q ≤ 0.05 = ยึดรั้ง (braced)</p>
  <h3>2. ผลรายเสา (WSD อิสระ, ค่า util ≤ 1 ผ่าน)</h3>
  <div class="tw"><table><thead><tr><th rowspan="2">เสา</th><th rowspan="2">หน้าตัด</th><th rowspan="2">Lu ม.</th><th rowspan="2">P สะสม</th><th rowspan="2">N 3 มิติ</th><th rowspan="2">Mx</th><th rowspan="2">My</th><th rowspan="2">k x / y (sway)</th><th class="g" colspan="2">โปรแกรม</th><th class="g" colspan="4">อิสระ WSD biaxial</th><th class="g" colspan="3">Frame ตาม Q</th><th rowspan="2">ผล / เหตุ</th></tr>
  <tr><th>Axial</th><th>Frame</th><th>A·B</th><th>A·U</th><th>F·B</th><th>F·U</th><th>แกน X</th><th>แกน Y</th><th>2 แกน</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="k">หน่วย กก., กก.-ม. · A = Axial (P สะสม + ระยะเยื้องศูนย์น้อยที่สุด max(2.5 ซม., 0.1t)) · F = Frame (P = max(สะสม, N 3 มิติ) + Mx, My 3 มิติ) · B = braced R = 1.32 − 0.006·Lu/r · U = unbraced R = 1.07 − 0.008·k·Lu/r (ACI 318-63 §915–916), r = 0.3t ทิศที่ดัด · แกน X = Mx + e min รอบ x · แกน Y = My + e min รอบ y · 2 แกน = ทั้งสองพร้อมกัน (e min ทีละแกน ค่ามากกว่า) · ฉบับ Frame ของโปรแกรมเลือก type เสาใหม่เอง (${R.filter((r) => r.secF && r.secF.replace(/\s+/g, "") !== r.lv.split(" RB")[0].replace(/\s+/g, "")).length} ต้น) ค่า "โปรแกรม Frame" จึงเป็นของหน้าตัดที่มันเลือก</p>
  <h3>3. เสาที่ไม่ผ่าน (Frame หรือ Axial ตาม Q)</h3>${fails.length ? `<ul>${fails.map((r) => `<li><b>${esc(r.id)}</b> ${esc(r.lv)} — Frame ${f(r.v.FD.uB)}${r.v.FD.ok ? " ผ่าน" : ""}, Axial ${f(r.v.AD.uB)}${r.v.AD.ok ? " ผ่าน" : ""} · ${esc(cause(r))}</li>`).join("")}</ul>` : '<p class="ok">ไม่มี</p>'}
  <h3>4. ตรวจโปรแกรมกับตัวตรวจอิสระ (หน้าตัดเดียวกัน แรงเดียวกัน กฎความชะลูดเดียวกับโปรแกรม)</h3>
  <p>util โปรแกรม − อิสระ: Axial ${f(Math.min(...df.map((x) => x[0])), 3)} ถึง +${f(Math.max(...df.map((x) => x[0])), 3)} · Frame ${f(Math.min(...df.map((x) => x[1])), 3)} ถึง +${f(Math.max(...df.map((x) => x[1])), 3)} · โปรแกรมผ่านแต่อิสระไม่ผ่าน: <b>${R.filter((r) => (r.prog.A.ok && !r.v.PA.strengthOk) || (r.prog.F.ok && r.v.PF && !r.v.PF.strengthOk)).length}</b></p>
  <h3>5. กำลังประลัย (แยกต่างหาก ไม่ใช้แทน WSD)</h3><p class="k">strain compatibility + Bresler, φ 0.65, 0.8Po, เทียบ 1.55P; กรณีเซ: โมเมนต์ × δs = 1/(1 − Q) (ACI 318-11 10.10.7.4) — 10 ต้นที่สูงสุด</p>
  <div class="tw"><table><thead><tr><th>เสา</th><th>หน้าตัด</th><th>1.55P/φPn (ไม่ขยาย)</th><th>δs</th><th>1.55P/φPn (ขยาย)</th></tr></thead><tbody>${usdRows}</tbody></table></div></section>`; };
const html = `<title>Column Audit 2</title><meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans+Thai:wght@400;600&display=swap"><style>${css}</style>
<div class="wrap"><header><div class="k">StructCalc · ตรวจเสารอบ 2 · 2026-11-05 · ไม่ได้แก้โค้ดโปรแกรม</div><h1>เสา: Axial / Frame × Braced / Unbraced และการตัดสินด้วยดัชนีเสถียรภาพ Q</h1></header>
<section><h2>สรุปและข้อเสนอ</h2>
<ul>
<li><b>ไม่ถือ Unbraced แบบเหมา</b> — ตัดสินรายชั้นด้วย Q (ACI 318-11 10.10.5.2) จากโครง 3 มิติ: Q ≤ 0.05 = braced, มากกว่า = sway แล้วใช้ k จาก ψ ปลายเสา (ไม่ใช่ k = 1)</li>
<li><b>ใช้ Frame (N, Mx, My 3 มิติ) ร่วมกับ Axial + e min</b> — ค่าออกแบบ = ค่าที่หนักกว่า (envelope) เพราะ Axial อย่างเดียวพลาดโมเมนต์ปลายเสามุม/ขอบ</li>
<li>${H.map((h) => `${esc(nm(h))}: Frame ตาม Q ผ่าน <b>${h.rows.filter((r) => r.v.FD.ok).length}/${h.rows.length}</b>`).join(" · ")}</li>
<li>บ้านยโสธร ชั้น 2 (สูง 3.6 ม., เสา 20×20, ฐานยึดหมุน) เป็น <b>sway</b> (Q 0.081 / 0.073; ที่น้ำหนักใช้งาน 0.052) → เสา 20×20 ช่วงนี้ไม่พอ ต้อง 25×25 หรือเพิ่มคานยึด/ผนังรับแรงเฉือน · ตอม่อมุม 30×30 ไม่ผ่านเมื่อใช้โมเมนต์ 3 มิติ</li>
<li>บ้านคุณหนูเลียง ทุกชั้น braced ตาม Q → ผ่านทุกต้น แต่เสาชั้นบน 19 ต้นไม่มีคานที่หัวเสา (รับโครงหลังคาเหล็ก): ถ้าหลังคาไม่มีค้ำยัน/ไดอะแฟรมจริง เสาเหล่านี้เป็นเสายื่น k ≈ 2.1, kLu/r ≈ 105 > 100 → ควรเป็น 25×25 หรือเพิ่มคานหัวเสา</li>
<li>ไม่มีเสาที่โปรแกรมผ่านแต่ตัวตรวจอิสระไม่ผ่านเมื่อใช้กฎเดียวกัน · กำลังประลัย (แยก) ไม่มีต้นใดเกิน 1 — ความต่างทั้งหมดมาจาก <b>สมมติฐาน</b> (braced/sway, k, โมเมนต์ 3 มิติ) ไม่ใช่สูตรคำนวณผิด</li>
</ul></section>
${H.map(house).join("")}
<section><h2>ความสอดคล้องของชุดผสมแรง WSD</h2><ul>
<li>ทั้งสองโครงการปิดแรงด้านข้าง → ชุดผสมแรงมีแค่ <b>D + L</b> (ไม่มีเสาที่ถูกตรวจด้วย combo อื่น) · เมื่อเปิดแรงลม/แผ่นดินไหว โปรแกรมตรวจเสาทุก combo แยกกัน (N, Mx, My จาก combo เดียวกัน) — สอดคล้อง</li>
<li>P สะสมรวมการจัดวางน้ำหนักจร (envelope) แต่ N, Mx, My 3 มิติ ใช้น้ำหนักจรเต็มทุกช่วง → ฉบับ Frame จับคู่ P สูงสุดกับ M ของน้ำหนักเต็ม: ปลอดภัยกว่า combo จริง แต่ <b>ไม่ใช่ combo เดียวกัน</b></li>
<li><b>ช่องว่าง:</b> โมเมนต์เสาภายในสูงสุดเกิดจากน้ำหนักจรลงช่วงเดียวข้างเดียว (pattern) — โครง 3 มิติตอนนี้ไม่มีกรณีนี้ → Mx, My ของเสาภายในอาจต่ำกว่าจริง (เสนอเพิ่มกรณี pattern ใน 3 มิติ)</li>
<li>เสาที่โครง 3 มิติให้แรงดึง: บ้านยโสธร 1 ต้น (ชั้น 2 @(3.50, 7.90) N = −1,726 กก.) แต่ P สะสม = แรงอัด → ยังไม่ได้ตรวจเหล็กรับแรงดึง (K6)</li></ul></section>
<section><h2>วิเคราะห์การแก้ K1–K6 (แก้ใน frame.js ได้จริงไหม)</h2><div class="tw"><table><thead><tr><th>ข้อ</th><th>ปัญหา</th><th>แก้ที่</th><th>ข้ามหรือซ้ำกับ column.js?</th><th>ผลต่อ 2 บ้านนี้</th></tr></thead><tbody>
<tr><td>K1</td><td>mode III ที่มีแต่ Mx → R′ = NaN → util 9 (ไม่ผ่านปลอม) แม้เสาไม่ชะลูด</td><td>frame.js: สลับแกน (Bx↔By, nx↔ny, Mx↔My) เมื่อ ey > ex</td><td>ไม่ข้าม — ทุกข้อใน tiedColumn ยังทำงาน แต่สลับแกนทำให้ K4 (r = 0.25·Bx) เปลี่ยนตาม และผลต้องสลับชื่อกลับในรายงาน</td><td>ไม่มี (ไม่มีต้น util 9)</td></tr>
<tr><td>K2</td><td>ex (จาก My, ลึก Bx) เทียบกับ ebx = ebf·(By − d′) — จับคู่ผิดแกน (มีผลเฉพาะเสาสี่เหลี่ยมผืนผ้า), R′ ใช้คู่เดียวกัน</td><td><b>column.js</b> (2 บรรทัด) — wrapper แก้ไม่ได้โดยไม่เขียนการเลือก mode ซ้ำ</td><td>ถ้าทำใน wrapper = คำนวณ mode/eb ซ้ำนอก tiedColumn (ซ้ำซ้อน, เสี่ยงไม่ตรงกัน)</td><td>ไม่มี (ทุกต้นจัตุรัส)</td></tr>
<tr><td>K3</td><td>e min รอบแกน x แกนเดียว</td><td>frame.js: เรียก tiedColumn 2 ครั้ง (e min รอบ x, รอบ y) เอาค่าแย่กว่า</td><td>ไม่ข้าม ไม่ซ้ำ (ตรวจครบทั้งสองครั้ง)</td><td>เสาจัตุรัสที่ M = 0 ผลเท่าเดิม; กับโมเมนต์ 3 มิติ util เพิ่มได้ถึง ~0.10</td></tr>
<tr><td>K4</td><td>r = 0.25·Bx (ควร 0.3·ด้านที่ดัด; ผืนผ้าใช้ด้านยาว = ไม่ปลอดภัย)</td><td>ดีที่สุด: frame.js คำนวณ R เอง (ตาม Q / k จาก ψ) แล้วส่ง P/R, M/R ให้ tiedColumn โดยปิดความชะลูดของมัน — หรือแก้ column.js 1 บรรทัด</td><td>ทาง wrapper = <b>แทนที่</b> (ไม่ซ้ำ) ส่วนความชะลูดของ column.js ต้องปิดให้ชัด มิฉะนั้นลด R สองรอบ; แต่ R′ ของ mode III ยังอยู่ใน column.js → ต้องย้ายมาด้วย</td><td>จัตุรัส: 0.25 ปลอดภัยกว่า 0.3 (klr สูงขึ้น 20 %)</td></tr>
<tr><td>K5</td><td>ไม่ตรวจระยะช่องว่างเหล็กยืนเสา</td><td>frame.js: ตรวจเพิ่ม max(1.5db, 4 ซม.)</td><td>ไม่ซ้ำ (column.js ไม่มีข้อนี้)</td><td>ไม่มีต้นที่ติด</td></tr>
<tr><td>K6</td><td>เสารับแรงดึง: P = max(P, 1) → ผ่าน</td><td>frame.js: P ≤ 0 → ตรวจ As·fs ≥ T แยก (fs 1,700)</td><td>ไม่ซ้ำ (tiedColumn ใช้ไม่ได้กับแรงดึง)</td><td>ยโสธร 1 ต้น (N3D −1.7 ตัน)</td></tr>
<tr><td>K9 ใหม่</td><td>ความชะลูดนับเมื่อ Lu/B > 15 เท่านั้น แล้วกระโดดไปสูตร unbraced (R 1 → 0.59 ที่ Lu/B 15 → 15.01) — ไม่ต่อเนื่อง, ≤ 15 เท่ากับ braced, > 15 เท่ากับ unbraced k = 1</td><td>มาจากแผ่น Excel (diff-test ผ่าน) → แก้ด้วยกฎ Q ใน wrapper (ข้อ K4)</td><td>—</td><td>ยโสธรชั้น 2 Lu 3.0/0.20 = 15 พอดี → โปรแกรมใช้ R = 1 ทั้งที่ชั้นนี้ sway</td></tr>
</tbody></table></div>
<p><b>ข้อเสนอการแก้ (รออนุมัติ):</b> K3, K5, K6 ใน frame.js ตรง ๆ · ความชะลูดทั้งหมด (K4, K9, การตัดสิน braced/sway ด้วย Q, k จาก ψ) ทำใน frame.js ชุดเดียว แล้วเรียก tiedColumn แบบไม่ชะลูด · K1, K2 แก้ใน column.js 3 บรรทัด (ไฟล์ frozen) แล้วรัน Excel diff เสาบน PC — เพราะทำใน wrapper ต้องเขียนการเลือก mode ซ้ำ</p></section>
<section><h2>สิ่งที่ต้องตรวจกับ Excel / ข้อกำหนดเพิ่ม</h2><ol>
<li>แผ่น Excel เสาเหลี่ยมผืนผ้า: ex เทียบ ebx หรือ eby (K2) — ถ้า Excel ก็จับคู่แบบนี้ = ข้อบกพร่องของ Excel ให้บันทึกไว้</li>
<li>Excel ที่ mode III มีแต่ Mx: ได้ #DIV/0! เหมือนกันหรือไม่ (K1)</li>
<li>Excel ใช้ r = 0.25·ด้านไหน และเกณฑ์ L/B > 15 (K4, K9)</li>
<li>Excel frame case 2 = 1.07 − 0.008·klu/r ใช้ k = 1 เสมอหรือให้ผู้ใช้ใส่ k</li>
<li>หลังแก้ column.js: รัน <code>difftest</code> tied column 16 กรณี + spiral 12 กรณีบน Windows (ต้องผ่านเท่าเดิม 12/16)</li>
<li>ข้อความ ว.ส.ท. (WSD) เรื่องเสาชะลูด: h′ ของสูตร unbraced เป็นความยาวประสิทธิผล (k·h) — อ้าง ACI 318-63 §916 <span class="warn">UNVERIFIED กับต้นฉบับ ว.ส.ท.</span></li>
<li>เกณฑ์ kLu/r ≤ 100: ACI 318-11 10.10.1 ไม่ได้ห้าม แต่ต้องวิเคราะห์อันดับสอง — โปรแกรมให้ไม่ผ่าน (ปลอดภัยกว่า)</li></ol></section></div>`;
fs.writeFileSync(outF, html); console.log("written", outF);
