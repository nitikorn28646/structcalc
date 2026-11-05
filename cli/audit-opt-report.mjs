// HTML report of the optimisation audit: node cli/audit-opt-report.mjs opt.json [opt-after.json] out.html
import fs from "fs";
const [a, b, outF] = process.argv.slice(2).length === 3 ? process.argv.slice(2) : [process.argv[2], null, process.argv[3]];
const J = JSON.parse(fs.readFileSync(a)), J2 = b ? JSON.parse(fs.readFileSync(b)) : null;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const f = (v, k = 0) => (v == null || !Number.isFinite(v) ? "–" : v.toLocaleString("en-US", { minimumFractionDigits: k, maximumFractionDigits: k }));
const bh = (x) => `${Math.round(x.b * 100)}×${Math.round(x.h * 100)}`;
const bars = (t) => t ? `บน ${t.top}${t.topX ? `+${t.topX}` : ""} · ล่าง ${t.bot}${t.botX ? `+${t.botX}` : ""} · ${t.st}${t.stSets > 1 ? "×2" : ""} @${t.sSup}/${t.sMid}` : "";
const sum = (J) => { const bs = J.beams, cur = bs.reduce((s, x) => s + x.current.cost, 0), best = bs.reduce((s, x) => s + (x.best ? Math.min(x.best.cost, x.current.cost) : x.current.cost), 0);
  const smaller = bs.filter((x) => x.best && x.best.b * x.best.h < x.current.b * x.current.h - 1e-9), lessSteel = bs.filter((x) => x.best && x.best.kg < x.current.kg - 0.5), cheaper = bs.filter((x) => x.best && x.best.cost < x.current.cost - 1);
  return { n: bs.length, cur, best, extra: cur - best, smaller: smaller.length, lessSteel: lessSteel.length, cheaper: cheaper.length }; };
const S = sum(J), S2 = J2 ? sum(J2) : null;
const css = `:root{--bg:#f5f7f6;--paper:#fff;--ink:#17221f;--mute:#5b6b66;--rule:#d7dfdc;--acc:#0f6b5c;--ok:#067647;--bad:#b42318;--chip:#edf3f1;--f:"IBM Plex Sans Thai",system-ui,sans-serif;--m:"IBM Plex Mono",ui-monospace,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0f1513;--paper:#161e1b;--ink:#e4ece9;--mute:#9db0aa;--rule:#2a3632;--acc:#5fd0b8;--ok:#47cd89;--bad:#ff6b5e;--chip:#1e2925;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0f1513;--paper:#161e1b;--ink:#e4ece9;--mute:#9db0aa;--rule:#2a3632;--acc:#5fd0b8;--ok:#47cd89;--bad:#ff6b5e;--chip:#1e2925;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:15px/1.6 var(--f)}.wrap{max-width:1180px;margin:0 auto;padding-block:28px 64px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:24px}
h1{font-size:27px;margin:0;text-wrap:balance}h2{font-size:19px;margin:0 0 10px}h3{font-size:15px;margin:0}section{background:var(--paper);border:1px solid var(--rule);border-radius:8px;padding:18px 20px;min-width:0}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}th,td{border-bottom:1px solid var(--rule);padding:4px 7px;text-align:left;vertical-align:top}th{color:var(--mute);font-weight:600;white-space:nowrap}
td.n{text-align:right;white-space:nowrap;font-family:var(--m);font-size:12.5px}.ok{color:var(--ok);font-weight:600}.bad{color:var(--bad)}.k{color:var(--mute);font-size:13px}.best td{background:var(--chip)}
.tiles{display:flex;flex-wrap:wrap;gap:10px}.tiles div{background:var(--chip);border-radius:6px;padding:8px 12px;min-width:150px}.tiles b{display:block;font:600 21px var(--m)}
details{border-top:1px solid var(--rule);padding:8px 0}summary{cursor:pointer;font-weight:600}code{font-family:var(--m);font-size:12.5px;background:var(--chip);padding:1px 5px;border-radius:3px}`;
const beamBlock = (x) => {
  const rows = x.cands.map((c) => { const isBest = x.best && c.b === x.best.b && c.h === x.best.h;
    return `<tr class="${isBest ? "best" : ""}"><td>${bh(c)}</td><td class="n">${c.ok ? f(c.conc, 3) : "–"}</td><td class="n">${c.ok ? f(c.kg, 1) : "–"}</td><td class="n">${c.ok ? f(c.cost) : "–"}</td>
      <td>${c.ok ? '<span class="ok">ผ่าน</span>' : `<span class="bad">ไม่ผ่าน</span> — ${esc(c.why.join(", "))}${c.stage === "bars" ? " (ไม่มีชุดเหล็กในขอบเขต)" : " (หลังวิเคราะห์ใหม่)"}`}</td><td class="k">${c.ok ? esc(bars(c.t)) : ""}</td></tr>`; }).join("");
  const sv = x.best ? x.current.cost - x.best.cost : 0;
  return `<details><summary>${esc(x.floor)} ช่วง ${esc(x.span)} · ${esc(x.kind)} · L ${f(x.len, 2)} ม. · ${esc(x.tags.join(", "))} — ปัจจุบัน ${esc(x.current.type)} ${bh(x.current)} ฿${f(x.current.cost)} → ถูกที่สุด ${x.best ? `${bh(x.best)} ฿${f(x.best.cost)} (${sv > 0 ? "ลด" : "เพิ่ม"} ${f(Math.abs(sv))})` : "–"}</summary>
  <p class="k">ปัจจุบัน: ${esc(bars(x.current.t))} · คอนกรีต ${f(x.current.conc, 3)} ม.³ · แบบหล่อ ${f(x.current.form, 2)} ม.² · เหล็ก ${f(x.current.kg, 1)} กก.${x.current.ok ? "" : ` · <span class="bad">ไม่ผ่าน: ${esc(x.current.reasons.slice(0, 2).join(" | "))}</span>`}</p>
  <div class="tw"><table><thead><tr><th>b × h</th><th>คอนกรีต ม.³</th><th>เหล็ก กก.</th><th>ราคา ฿ *</th><th>ผล / เหตุที่ไม่ผ่าน</th><th>เหล็ก</th></tr></thead><tbody>${rows}</tbody></table></div></details>`; };
const html = `<title>Beam Cost Audit</title><meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans+Thai:wght@400;600&display=swap"><style>${css}</style>
<div class="wrap"><header><div class="k">StructCalc · บ้านยโสธร · ตรวจความประหยัดของการเลือก type คานอัตโนมัติ (k = ${J.K} type)</div><h1>หน้าตัดคานที่ถูกที่สุดที่ยังผ่านทุกข้อ</h1></header>
<section><h2>สรุป</h2><div class="tiles"><div>คานที่ตรวจ<b>${S.n}</b></div><div>ลด b×h ได้<b>${S.smaller} (${f((100 * S.smaller) / S.n)}%)</b></div><div>ลดเหล็กได้<b>${S.lessSteel} (${f((100 * S.lessSteel) / S.n)}%)</b></div><div>ราคาปัจจุบัน *<b>฿${f(S.cur)}</b></div><div>ราคาถูกสุดที่ผ่าน *<b>฿${f(S.best)}</b></div><div>ส่วนเกิน *<b>฿${f(S.extra)} (${f((100 * S.extra) / S.cur, 1)}%)</b></div></div>
${S2 ? `<p>หลังแก้ algorithm: ราคา ฿${f(S2.cur)} (เดิม ฿${f(S.cur)}) · ส่วนเกินที่เหลือเทียบหน้าตัดถูกสุด ฿${f(S2.extra)} (${f((100 * S2.extra) / S2.cur, 1)}%) · ลด b×h ได้อีก ${S2.smaller} / ${S2.n}</p>` : ""}
<p class="k">* ราคาใช้ราคาจัดอันดับที่มีในโปรแกรม (คอนกรีต 2,500 ฿/ม.³, เหล็ก 28 ฿/กก., แบบหล่อ 350 ฿/ม.²) — ไม่ใช่ราคาตลาด · ปริมาณ: เหล็กวิ่งตลอดยาวเต็ม, เหล็กเสริมตามระยะตัด (sp.cut), เหล็กปลอกตามโซน; ไม่รวมระยะทาบ/งอขอ · แบบหล่อ (b + 2h)·L ไม่หักความหนาพื้น</p></section>
<section><h2>รายละเอียดรายคาน</h2><p class="k">ทุกขนาด b × h: หาชุดเหล็กที่ถูกที่สุดด้วยตัวค้นหาเหล็กของโปรแกรม (DB12/DB16/DB20) แล้ววิเคราะห์ทั้งอาคารใหม่ด้วยหน้าตัดนั้น (น้ำหนักตัวเอง, EI, โมเมนต์, แรงเฉือน, แรงบิด, ระยะแอ่น, แรงลงเสา) และทุกช่วงของคานนั้นต้องผ่าน</p>${J.beams.map(beamBlock).join("")}</section></div>`;
fs.writeFileSync(outF, html); console.log("written", outF);
