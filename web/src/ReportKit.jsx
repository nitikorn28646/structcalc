// Building blocks for the calculation reports (Thai-first, paginated by Paged.js when printing).
import { Previewer } from "pagedjs";
import { BRAND, loadBrand } from "./brand.js";

// @page rules and running header/footer; Tailwind classes in the report body come from the app stylesheet.
const PAGE_CSS = `
@page {
  size: A4; margin: 18mm 17mm 24mm 23mm; /* left 23 (binding) · right 17 · top 18 · bottom 24 (signature line) */
  @top-left { content: string(rp-project); font: 8pt Sarabun, sans-serif; color: #667085; border-bottom: 0.5pt solid #d0d5dd; }
  @top-center { content: string(rp-sec); font: 8pt Sarabun, sans-serif; color: #1f3a5f; border-bottom: 0.5pt solid #d0d5dd; }
  @top-right { content: "รายการคำนวณออกแบบโครงสร้าง (" string(rp-method) ")"; font: 8pt Sarabun, sans-serif; color: #667085; border-bottom: 0.5pt solid #d0d5dd; }
  @bottom-left { content: "โครงสร้างไทย · " string(rp-member); font: 7.5pt Sarabun, sans-serif; color: #98a2b3; vertical-align: top; padding-top: 3mm; width: 40mm; }
  /* every sheet signed by the engineer (user 2026-11-04) — one line (user: the registration number wrapped to a second line) */
  @bottom-center { content: element(rpSig); text-align: center; vertical-align: top; padding-top: 2mm; border-top: 0.6pt solid #98a2b3; }
  @bottom-right { content: "หน้า " counter(page) " / " counter(pages); font: 8pt Sarabun, sans-serif; color: #667085; vertical-align: top; padding-top: 3mm; width: 24mm; }
}
/* the cover: no running header / footer (it carries its own signature block) */
@page cover { margin: 14mm; @top-left { content: none; } @top-center { content: none; } @top-right { content: none; } @bottom-left { content: none; } @bottom-center { content: none; border: none; } @bottom-right { content: none; } }
.rp-cover { page: cover; break-after: page; }
/* the first chapter after the contents starts its own page (no break here: two breaks made an empty page) */
.rp-str-project { string-set: rp-project content(text); }
.rp-str-member { string-set: rp-member content(text); }
.rp-str-method { string-set: rp-method content(text); }
.rp-str-eng { string-set: rp-eng content(text); }
.rp-sig-run { position: running(rpSig); display: block !important; white-space: nowrap; font: 8pt Sarabun, sans-serif; color: #344054; }
.rp-sig-run img { display: inline-block; height: 9mm; vertical-align: middle; margin: -3mm 1mm 0; }
.rp-sec-name { string-set: rp-sec content(text); }
/* layout: every chapter on a new page; a heading stays with what follows; table heads repeat; rows / figures not cut */
.rp-chapter { break-before: page; }
.rp h2, .rp-sub, .rp-intro { break-after: avoid; }
.rp thead { display: table-header-group; }
.rp tr, .rp figure { break-inside: avoid; }
.rp-toc a::after { content: target-counter(attr(href url), page); float: right; }
.rp-pref::after { content: target-counter(attr(href url), page); }
.rp-toc a { display: block; border-bottom: 0.5pt dotted #98a2b3; }
`;

// Paginate the hidden report into #print-root, print, then clean up.
export async function printReport({ dialog = true, standalone = false } = {}) {
  // every report block of the hidden print area (the workflow prints roof + structure); not the on-screen preview in <main>
  // 3D figures (WebGL canvases, preserveDrawingBuffer) become pictures — the paged copy is made from HTML text
  const still = (e) => { const c = e.cloneNode(true), a = [...e.querySelectorAll("canvas")], b = [...c.querySelectorAll("canvas")];
    a.forEach((cv, i) => { try { const img = Object.assign(document.createElement("img"), { src: cv.toDataURL("image/png") }); img.style.width = "100%"; img.style.height = "100%"; img.style.objectFit = "contain"; b[i]?.replaceWith(img); } catch { b[i]?.remove(); } });
    return c.innerHTML; };
  const blocks = [...document.querySelectorAll(".report")].filter((e) => !e.closest("main")), src = { innerHTML: blocks.map(still).join("") };
  let root = document.getElementById("print-root");
  if (!root) {
    root = Object.assign(document.createElement("div"), { id: "print-root" });
    document.body.appendChild(root);
  }
  root.innerHTML = "";
  document.documentElement.classList.add("printing");
  const done = () => {
    document.documentElement.classList.remove("printing");
    root.innerHTML = "";
    document.querySelectorAll("style[data-pagedjs-inserted-styles]").forEach((s) => s.remove());
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  await new Previewer().preview(src.innerHTML, [{ "report.css": PAGE_CSS }], root);
  // standalone: the paged book as one self-contained HTML file (user 2026-11-04: printing did nothing inside the claude.ai frame —
  // its sandbox blocks window.print). Styles are inlined (cross-origin sheets, e.g. Google Fonts, stay as links); opened, it prints itself.
  if (standalone) {
    const css = [...document.styleSheets].map((sh) => { try { const abs = (t) => t.replace(/url\((["']?)(?!data:|blob:|https?:)([^)"']+)\1\)/g, (m, q, u) => `url("${new URL(u, sh.href || location.href).href}")`);
      return `<style>${abs([...sh.cssRules].map((r) => r.cssText).join("\n"))}</style>`; } catch { return sh.href ? `<link rel="stylesheet" href="${sh.href}">` : ""; } }).join("\n");
    // Paged.js keeps an empty running string (header / footer text) as a lone quote — fine live, but written out as a style
    // attribute it swallows the next declarations (the saved book showed "--pagedjs-string…" in its headers): close such strings
    for (const pg of root.querySelectorAll(".pagedjs_page")) {
      const decl = [...pg.style].map((k) => { let v = pg.style.getPropertyValue(k).trim(); if (k.startsWith("--") && ((v.match(/"/g) ?? []).length % 2)) v += '"'; return `${k}: ${v}`; });
      pg.setAttribute("style", decl.join("; "));
    }
    const html = `<!doctype html><html lang="th" class="printing"><head><meta charset="utf-8"><title>${document.title.replace(/</g, "")}</title>${css}</head><body>${root.outerHTML}`
      + `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},600)})<\/script></body></html>`;
    done();
    return html;
  }
  if (dialog) window.print();
  else document.title += " [paged]"; // ?print: leave the paged preview open (used for headless PDF export)
}

export const Chip = ({ ok, children }) => (
  <span className={`inline-block text-[8.5pt] font-semibold ${ok ? "text-[#067647]" : "text-[#b42318]"}`}>
    {children ?? (ok ? "✓ ผ่าน" : "✕ ไม่ผ่าน")}
  </span>
);

const WSD_STD = "วิธีหน่วยแรงใช้งาน (WSD) ตาม ว.ส.ท. / ACI 318";
// bare: inside the whole-project book (cover / contents come from WorkReport): no title block, no info table, no end signature
export function Doc({ project, title, subtitle, memberLabel, member, summary, method = "WSD", standard = WSD_STD, children, bare = false }) {
  const info = [["โครงการ", project.name], ["เจ้าของโครงการ", project.owner || "-"], ["สถานที่ก่อสร้าง", project.location || "-"],
    ["วิศวกรผู้คำนวณ", `${project.engineer || "-"} ${project.license ? `(${project.license})` : ""}`],
    [memberLabel, project.floor ? `${member} · ชั้น ${project.floor}` : member], ["วันที่", project.date]];
  return (
    <div className="rp text-[10pt] leading-[1.55] text-[#1d2939]">
      <span className="rp-str-project hidden">{project.name}</span>
      <span className="rp-str-member hidden">{`${memberLabel} ${member}`}</span>
      <span className="rp-str-method hidden">{method}</span>
      <SigRun project={project} />
      <span className="rp-str-eng hidden">{`(${project.engineer || "........................................"}) วิศวกรผู้คำนวณ${project.license ? ` ทะเบียน ${project.license}` : ""}`}</span>
      {bare ? <>{children}</> : <>
      <div className="mb-3 border-b-[1.5pt] border-[#1f3a5f] pb-2 text-[#1f3a5f]">
        <div className="text-[14pt] font-semibold leading-tight">{title}</div>
        <div className="text-[9pt] opacity-90">{subtitle}</div>
      </div>
      <table className="mb-3 w-full border-collapse text-[9pt]">
        <tbody>
          {[0, 2, 4].map((i) => (
            <tr key={i}>
              {[info[i], info[i + 1]].map(([k, v]) => (
                <td key={k} className="w-1/2 border border-[#d0d5dd] px-2 py-1"><span className="text-[#667085]">{k} : </span>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {summary && (
        <div className="mb-4 break-inside-avoid rounded-lg border-l-[3pt] border-[#1f3a5f] bg-[#f5f6f8] px-4 py-2.5">
          <div className="mb-1 font-semibold text-[#1f3a5f]">สรุปผลการออกแบบ</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[9.5pt]">
            {summary.map(([k, v, ok]) => (
              <div key={k} className="flex justify-between gap-2 border-b border-[#e4e7ec] py-0.5">
                <span className="text-[#475467]">{k}</span>
                <span className="flex items-center gap-1.5 font-semibold">{v}{ok !== undefined && <Chip ok={ok} />}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {children}
      <Signature project={project} standard={standard} />
      </>}
    </div>
  );
}
// bare reports put this inside their first chapter (a box before a chapter break stood alone on a page)
export function SummaryBox({ summary }) {
  return (
    <div className="mb-4 break-inside-avoid rounded-lg border-l-[3pt] border-[#1f3a5f] bg-[#f5f6f8] px-4 py-2.5">
      <div className="mb-1 font-semibold text-[#1f3a5f]">สรุปผลการออกแบบ</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[9.5pt]">
        {summary.map(([k, v, ok]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-[#e4e7ec] py-0.5">
            <span className="text-[#475467]">{k}</span>
            <span className="flex items-center gap-1.5 font-semibold">{v}{ok !== undefined && <Chip ok={ok} />}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// chapter = starts a new printed page (default); id = anchor for the table of contents
export function Sec({ n, th, en, intro, children, id, chapter = true, pre = null }) {
  // Minimal engineering style (user 2026-11-04): chapter number + title in navy over a thin rule, no filled boxes
  const big = chapter && (typeof n === "number" || /^\d+$/.test(String(n ?? "")));
  return (
    <section id={id} className={`mb-4 ${chapter ? "rp-chapter" : ""}`}>
      {pre && <h2 className="mb-2 flex items-baseline gap-3 border-b-[1pt] border-[#1f3a5f] pb-1 text-[#1f3a5f]"><span className="text-[18pt] font-semibold">{pre.n}</span><span className="text-[16pt] font-semibold">{pre.th}</span>{pre.en && <span className="ml-auto text-[8.5pt] uppercase tracking-wide text-[#98a2b3]">{pre.en}</span>}</h2>}
      <h2 className={`mb-1.5 flex items-baseline gap-3 border-b-[1pt] border-[#1f3a5f] pb-1 break-after-avoid text-[#1f3a5f]`}>
        {n != null && <span className={`${big ? "text-[18pt]" : "text-[12pt]"} font-semibold tabular-nums`}>{n}</span>}
        <span className={`rp-sec-name ${big ? "text-[16pt]" : "text-[13pt]"} font-semibold`}>{th}</span>
        {en && <span className="ml-auto text-[8.5pt] font-normal uppercase tracking-wide text-[#98a2b3]">{en}</span>}
      </h2>
      {intro && <p className="rp-intro mb-2 text-[9.5pt] text-[#475467] break-after-avoid">{intro}</p>}
      {children}
    </section>
  );
}
// sub-heading kept on the page of the table / figure after it
export const Sub = ({ children, className = "" }) => <p className={`rp-sub mt-3 mb-0.5 text-[12pt] font-semibold text-[#1f3a5f] ${className}`}>{children}</p>;

// the signature line printed in the footer of every page (Paged.js running element; hidden on screen): the engineer's uploaded
// signature image when there is one (logo → เจ้าของโปรแกรม), else the dotted line
export function SigRun({ project }) {
  const sig = loadBrand().sig;
  return <div className="rp-sig-run hidden">ลงชื่อ {sig ? <img src={sig} alt="" /> : ".................................."} ({project.engineer || "........................................"}) วิศวกรผู้คำนวณ{project.license ? ` ทะเบียน ${project.license}` : ""}</div>;
}
// formal cover page (user 2026-11-04): title, project data, standards, engineer signature block
// formal cover (user 2026-11-04, "Minimal Engineering — navy / white / light gray"): navy band with a faint structural-grid line
// drawing, title, project data without boxes, standards, signature block; no colours beyond navy and grays
export function Cover({ project, title = "รายการคำนวณออกแบบโครงสร้าง", subtitle, items = [], standards = [], docNo, rev }) {
  const rows = [["โครงการ", project.name], ["เจ้าของโครงการ", project.owner], ["สถานที่ก่อสร้าง", project.location], ...items, ["วันที่", project.date]].filter(([, v]) => v);
  const NAVY = "#1f3a5f", grid = [];
  for (let i = 0; i <= 12; i++) grid.push(<line key={`v${i}`} x1={20 + i * 15} y1={18} x2={20 + i * 15} y2={70} />);
  for (let j = 0; j <= 3; j++) grid.push(<line key={`h${j}`} x1={20} y1={18 + j * 17.3} x2={200} y2={18 + j * 17.3} />);
  return (
    <div className="rp-cover flex min-h-[265mm] flex-col text-[#1d2939]">
      <div className="relative -mx-[2mm] overflow-hidden px-[12mm] pb-[10mm] pt-[12mm] text-[#fff]" style={{ background: NAVY }}>
        <svg viewBox="0 0 220 80" className="absolute right-0 top-0 h-full w-[70%] opacity-[0.18]" fill="none" stroke="#fff" strokeWidth="0.35">{grid}
          <path d="M20 18 L110 2 L200 18" strokeWidth="0.6" /><path d="M35 18 L110 4.7 M185 18 L110 4.7" /></svg>
        <div className="relative text-[9pt] tracking-[0.35em] opacity-80">STRUCTURAL CALCULATION REPORT</div>
        <div className="relative mt-[14mm] text-[26pt] font-semibold leading-tight">{title}</div>
        {subtitle && <div className="relative mt-1 text-[12pt] opacity-90">{subtitle}</div>}
      </div>
      <table className="mt-[14mm] w-full text-left text-[12pt]"><tbody>
        {rows.map(([k, v]) => <tr key={k} className="border-b border-[#e4e7ec]"><td className="w-[34%] py-2 align-top text-[10.5pt] text-[#667085]">{k}</td><td className="py-2 font-semibold">{v}</td></tr>)}
      </tbody></table>
      {standards.length > 0 && <div className="mt-[10mm] text-left text-[9.5pt] text-[#475467]">
        <div className="mb-1 text-[10pt] font-semibold" style={{ color: NAVY }}>มาตรฐานและกฎหมายที่ใช้</div>
        <ol className="list-decimal pl-5">{standards.map((x) => <li key={x}>{x}</li>)}</ol></div>}
      <div className="mt-auto grid grid-cols-2 gap-[10mm] border-t border-[#d0d5dd] pt-[8mm] text-[11pt]">
        <div className="self-end text-left text-[9pt] text-[#667085]">
          {docNo && <div>เลขที่เอกสาร {docNo}</div>}{rev != null && <div>ฉบับแก้ไขที่ {rev}</div>}
          <div className="mt-1 font-semibold text-[#344054]">จัดทำด้วยโปรแกรม {BRAND.full}</div>รายการคำนวณนี้ลงนามโดยวิศวกรผู้คำนวณทุกแผ่น</div>
        <div className="text-center">
          <div className="mb-1">ลงชื่อ {loadBrand().sig ? <img src={loadBrand().sig} alt="" className="inline-block h-[14mm] align-bottom" /> : "..................................................................."}</div>
          <div>( {project.engineer || "..................................................."} )</div>
          <div className="text-[10pt] text-[#475467]">วิศวกรผู้คำนวณ{project.license ? ` · ทะเบียน ${project.license}` : ""}</div>
        </div>
      </div>
    </div>
  );
}
// table of contents with page numbers (Paged.js target-counter); items [{ id, n, th }]
export function Toc({ items }) {
  return (
    <div className="rp-toc-page">
      <h2 className="mb-4 border-b-[1pt] border-[#1f3a5f] pb-1 text-[18pt] font-semibold text-[#1f3a5f]">สารบัญ <span className="ml-2 text-[9pt] font-normal uppercase tracking-wide text-[#98a2b3]">Contents</span></h2>
      <div className="rp-toc text-[11pt] leading-[2.1]">{items.map((x) => <div key={`${x.id}-${x.n}`} className={x.sub ? "pl-7 text-[10pt]" : ""}><a href={`#${x.id}`} className="text-[#1d2939] no-underline"><span className="inline-block w-9 font-semibold text-[#1f3a5f]">{x.n}</span>{x.th}</a></div>)}</div>
    </div>
  );
}

// One calculation line: Thai label, formula, value + unit, pass chip, and an optional plain-language note.
export function Item({ th, f, v, u, ok, note }) {
  return (
    <div className="break-inside-avoid border-b border-[#eaecf0] py-[3px]">
      <div className="grid grid-cols-[38%_30%_22%_10%] items-baseline gap-1">
        <span>{th}</span>
        <span className="font-mono text-[8.5pt] text-[#475467]">{f}</span>
        <span className="text-right font-semibold tabular-nums">{v} <span className="font-normal text-[#667085]">{u}</span></span>
        <span className="text-right">{ok !== undefined && <Chip ok={ok} />}</span>
      </div>
      {note && <div className="pl-3 text-[8.5pt] text-[#667085]">↳ {note}</div>}
    </div>
  );
}

export const Note = ({ children }) => (
  <div className="my-1.5 break-inside-avoid border-l-[2pt] border-[#98a2b3] bg-[#f5f6f8] px-3 py-1.5 text-[9pt] text-[#344054]">{children}</div>
);

export const Figure = ({ caption, children }) => (
  <figure className="my-2 break-inside-avoid text-center">
    {children}
    <figcaption className="mt-0.5 text-[8.5pt] text-[#667085]">{caption}</figcaption>
  </figure>
);

function Signature({ project, standard }) {
  return (
    <div className="mt-6 grid break-inside-avoid grid-cols-2 gap-6 text-center text-[9.5pt]">
      <div className="rounded-lg border border-[#d0d5dd] p-3 text-left text-[8.5pt] text-[#667085]">
        มาตรฐานอ้างอิง: {standard} และกฎกระทรวงกำหนดการออกแบบโครงสร้างอาคาร พ.ศ. 2566
      </div>
      <div className="pt-6">
        ลงชื่อ ......................................................<br />
        ({project.engineer || "                                        "})<br />
        วิศวกรผู้คำนวณ {project.license && `เลขทะเบียน ${project.license}`}
      </div>
    </div>
  );
}

// ── Standard member check sheet (user 2026-11-04, "every calculation page the same 6 parts") ─────────────────────────────────────
// 1 member information · 2 design input · 3 analysis results · 4 design equations (symbolic, then substituted) · 5 verification
// (demand vs allowable, ratio) · 6 final result (governing ratio on a bar, PASS / FAIL). id = calculation ID printed on the sheet and
// used as the anchor of cross references. kv rows: [label, value, unit]; eqs: [label, symbolic, substituted, value, unit];
// checks: [label, demand, capacity, unit, ok, ratio?] (ratio defaults to demand / capacity).
const NAVY = "#1f3a5f";
const Part = ({ k, th, en, children }) => (
  <div className="mt-1.5 break-inside-avoid">
    <div className="flex items-baseline gap-2 text-[8.5pt] font-semibold text-[#1f3a5f]"><span className="tabular-nums">{k}</span><span>{th}</span><span className="font-normal uppercase tracking-wide text-[#98a2b3]">{en}</span></div>
    {children}
  </div>
);
const KV = ({ rows }) => (
  <div className="grid grid-cols-2 gap-x-6 text-[9pt]">{rows.filter(Boolean).map(([k, v, u], i) => (
    <div key={i} className="flex justify-between gap-2 border-b border-[#eaecf0] py-[2px]"><span className="text-[#667085]">{k}</span><span className="font-semibold tabular-nums">{v}{u ? <span className="font-normal text-[#667085]"> {u}</span> : null}</span></div>))}</div>
);
export const num = (v, d = 2) => (typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : v ?? "-");
export function UtilBar({ u, ok }) {
  const p = Math.max(0, Math.min(1.25, u ?? 0)), col = ok ? NAVY : "#b42318";
  return (
    <svg viewBox="0 0 200 14" className="h-[5mm] w-[62mm]">
      <rect x="0" y="3" width="160" height="8" fill="#eaecf0" />
      <rect x="0" y="3" width={Math.min(160, p * 128)} height="8" fill={col} />
      <line x1="128" y1="0" x2="128" y2="14" stroke="#344054" strokeWidth="0.8" />
      <text x="0" y="14" fontSize="0" />
      <text x="166" y="11" fontSize="9" fill="#344054">{num((u ?? 0) * 100, 1)}%</text>
    </svg>
  );
}
export function CheckSheet({ id, title, sub, info = [], input = [], forces = [], eqs = [], checks = [], note, figure }) {
  const rat = checks.map((c) => (c.length > 5 ? c[5] : typeof c[1] === "number" && typeof c[2] === "number" && c[2] !== 0 ? Math.abs(c[1] / c[2]) : null));
  const valid = rat.map((r, i) => (r == null ? -1 : r)), gi = valid.length ? valid.indexOf(Math.max(...valid)) : -1;
  const u = gi >= 0 ? rat[gi] : null, ok = checks.every((c) => c[4] !== false);
  return (
    <div id={id ? `calc-${id}` : undefined} className="rp-sheet mb-4 border-t-[1.5pt] border-[#1f3a5f] pt-1">
      <div className="flex items-baseline gap-3 break-after-avoid">
        <span className="text-[12pt] font-semibold text-[#1f3a5f]">{title}</span>
        {sub && <span className="text-[9pt] text-[#475467]">{sub}</span>}
        {id && <span className="ml-auto font-mono text-[8pt] text-[#667085]">CALC ID {id}</span>}
      </div>
      <div className={figure ? "grid grid-cols-[1fr_46mm] gap-3" : ""}>
        <div>
          {info.length > 0 && <Part k="1" th="ข้อมูลชิ้นส่วน" en="Member information"><KV rows={info} /></Part>}
          {input.length > 0 && <Part k="2" th="ข้อมูลออกแบบ" en="Design input"><KV rows={input} /></Part>}
          {forces.length > 0 && <Part k="3" th="แรงภายในจากการวิเคราะห์" en="Analysis results"><KV rows={forces} /></Part>}
        </div>
        {figure && <div className="self-start pt-3">{figure}</div>}
      </div>
      {eqs.length > 0 && <Part k="4" th="สมการออกแบบและการแทนค่า" en="Design equations">
        <table className="w-full border-collapse text-[9pt]"><tbody>{eqs.filter(Boolean).map(([th, f, sb, v, un], i) => (
          <tr key={i} className="border-b border-[#eaecf0]"><td className="w-[27%] py-[2px] pr-2 text-[#344054]">{th}</td><td className="w-[27%] pr-2 font-mono text-[8.5pt] text-[#1f3a5f]">{f}</td>
            <td className="pr-2 font-mono text-[8.5pt] text-[#475467]">{sb}</td><td className="w-[16%] whitespace-nowrap text-right font-semibold tabular-nums">= {v} <span className="font-normal text-[#667085]">{un}</span></td></tr>))}</tbody></table>
      </Part>}
      {checks.length > 0 && <Part k="5" th="ตรวจสอบกับค่าที่ยอมให้" en="Design verification">
        <table className="w-full border-collapse text-[9pt]"><thead><tr className="border-b border-[#d0d5dd] text-left text-[8pt] text-[#667085]"><th className="py-[2px] font-normal">รายการ</th><th className="text-right font-normal">ค่าที่เกิดขึ้น</th><th className="text-right font-normal">ค่าที่ยอมให้</th><th className="pl-2 font-normal">หน่วย</th><th className="text-right font-normal">อัตราส่วน</th><th className="text-right font-normal">ผล</th></tr></thead>
          <tbody>{checks.map(([th, d, c, un, okc], i) => (
            <tr key={i} className={`border-b border-[#eaecf0] ${i === gi ? "font-semibold" : ""}`}><td className="py-[2px] pr-2">{th}</td><td className="text-right tabular-nums">{typeof d === "number" ? num(d, Math.abs(d) >= 100 ? 0 : 2) : d}</td>
              <td className="text-right tabular-nums">{typeof c === "number" ? num(c, Math.abs(c) >= 100 ? 0 : 2) : c}</td><td className="pl-2 text-[#667085]">{un}</td>
              <td className="text-right tabular-nums">{rat[i] != null ? `${num(rat[i] * 100, 1)}%` : "-"}</td><td className="text-right"><Chip ok={okc !== false} /></td></tr>))}</tbody></table>
      </Part>}
      <Part k="6" th="ผลการตรวจสอบ" en="Final result">
        <div className="flex items-center gap-4 border-b border-[#eaecf0] py-1">
          <span className={`text-[12pt] font-semibold ${ok ? "text-[#067647]" : "text-[#b42318]"}`}>{ok ? "PASS · ผ่าน" : "FAIL · ไม่ผ่าน"}</span>
          {u != null && <UtilBar u={u} ok={ok} />}
          {gi >= 0 && <span className="text-[8.5pt] text-[#667085]">ควบคุมโดย: {checks[gi][0]}</span>}
        </div>
        {note && <div className="mt-0.5 text-[8.5pt] text-[#667085]">{note}</div>}
      </Part>
    </div>
  );
}
