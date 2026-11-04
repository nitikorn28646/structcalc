// Building blocks for the calculation reports (Thai-first, paginated by Paged.js when printing).
import { Previewer } from "pagedjs";
import { BRAND, loadBrand } from "./brand.js";

// @page rules and running header/footer; Tailwind classes in the report body come from the app stylesheet.
const PAGE_CSS = `
@page {
  size: A4; margin: 18mm 14mm 26mm 14mm;
  @top-left { content: string(rp-project); font: 8pt Sarabun, sans-serif; color: #667085; }
  @top-center { content: string(rp-sec); font: 8pt Sarabun, sans-serif; color: #344054; }
  @top-right { content: "รายการคำนวณออกแบบโครงสร้าง (" string(rp-method) ")"; font: 8pt Sarabun, sans-serif; color: #667085; }
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
    const css = [...document.styleSheets].map((sh) => { try { return `<style>${[...sh.cssRules].map((r) => r.cssText).join("\n")}</style>`; } catch { return sh.href ? `<link rel="stylesheet" href="${sh.href}">` : ""; } }).join("\n");
    const html = `<!doctype html><html lang="th" class="printing"><head><meta charset="utf-8"><title>${document.title.replace(/</g, "")}</title>${css}</head><body>${root.outerHTML}`
      + `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},600)})<\/script></body></html>`;
    done();
    return html;
  }
  if (dialog) window.print();
  else document.title += " [paged]"; // ?print: leave the paged preview open (used for headless PDF export)
}

export const Chip = ({ ok, children }) => (
  <span className={`inline-block rounded-full px-2 py-[1px] text-[8.5pt] font-semibold ${ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
    {children ?? (ok ? "ผ่าน" : "ไม่ผ่าน")}
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
      <div className="mb-3 rounded-lg bg-[#465fff] px-4 py-3 text-[#fff]">
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
        <div className="mb-4 break-inside-avoid rounded-lg border border-[#c7d2fe] bg-[#eef2ff] px-4 py-2.5">
          <div className="mb-1 font-semibold text-[#3641f5]">สรุปผลการออกแบบ</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[9.5pt]">
            {summary.map(([k, v, ok]) => (
              <div key={k} className="flex justify-between gap-2 border-b border-[#dde3ff] py-0.5">
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
    <div className="mb-4 break-inside-avoid rounded-lg border border-[#c7d2fe] bg-[#eef2ff] px-4 py-2.5">
      <div className="mb-1 font-semibold text-[#3641f5]">สรุปผลการออกแบบ</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[9.5pt]">
        {summary.map(([k, v, ok]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-[#dde3ff] py-0.5">
            <span className="text-[#475467]">{k}</span>
            <span className="flex items-center gap-1.5 font-semibold">{v}{ok !== undefined && <Chip ok={ok} />}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// chapter = starts a new printed page (default); id = anchor for the table of contents
export function Sec({ n, th, en, intro, children, id, chapter = true }) {
  return (
    <section id={id} className={`mb-4 ${chapter ? "rp-chapter" : ""}`}>
      <h2 className="mb-1 flex items-baseline gap-2 border-b-2 border-[#465fff] pb-0.5 break-after-avoid">
        <span className="rounded bg-[#465fff] px-1.5 text-[9pt] font-semibold text-[#fff]">{typeof n === "number" ? `ขั้นที่ ${n}` : n}</span>
        <span className="rp-sec-name text-[11.5pt] font-semibold">{th}</span>
        {en && <span className="text-[8.5pt] text-[#98a2b3]">{en}</span>}
      </h2>
      {intro && <p className="rp-intro mb-1.5 text-[9pt] text-[#475467] break-after-avoid">{intro}</p>}
      {children}
    </section>
  );
}
// sub-heading kept on the page of the table / figure after it
export const Sub = ({ children, className = "" }) => <p className={`rp-sub mt-2 font-semibold text-gray-800 ${className}`}>{children}</p>;

// the signature line printed in the footer of every page (Paged.js running element; hidden on screen): the engineer's uploaded
// signature image when there is one (logo → เจ้าของโปรแกรม), else the dotted line
export function SigRun({ project }) {
  const sig = loadBrand().sig;
  return <div className="rp-sig-run hidden">ลงชื่อ {sig ? <img src={sig} alt="" /> : ".................................."} ({project.engineer || "........................................"}) วิศวกรผู้คำนวณ{project.license ? ` ทะเบียน ${project.license}` : ""}</div>;
}
// formal cover page (user 2026-11-04): title, project data, standards, engineer signature block
export function Cover({ project, title = "รายการคำนวณออกแบบโครงสร้าง", subtitle, items = [], standards = [] }) {
  const rows = [["โครงการ", project.name], ["เจ้าของโครงการ", project.owner], ["สถานที่ก่อสร้าง", project.location], ...items, ["วันที่", project.date]].filter(([, v]) => v);
  return (
    <div className="rp-cover flex min-h-[265mm] flex-col border-[1.5pt] border-double border-[#1d2939] p-[10mm] text-center">
      <div className="text-[10pt] tracking-[0.3em] text-[#475467]">STRUCTURAL CALCULATION</div>
      <div className="mt-[22mm] text-[24pt] font-semibold leading-tight text-[#1d2939]">{title}</div>
      {subtitle && <div className="mt-2 text-[12pt] text-[#475467]">{subtitle}</div>}
      <div className="mx-auto mt-[16mm] h-[1.2pt] w-[60%] bg-[#1d2939]" />
      <table className="mx-auto mt-[12mm] w-[80%] text-left text-[12pt]"><tbody>
        {rows.map(([k, v]) => <tr key={k}><td className="w-[38%] py-1.5 align-top text-[#475467]">{k}</td><td className="py-1.5 font-semibold text-[#1d2939]">{v}</td></tr>)}
      </tbody></table>
      {standards.length > 0 && <div className="mx-auto mt-[12mm] w-[80%] text-left text-[9.5pt] text-[#475467]">
        <div className="mb-1 font-semibold text-[#344054]">มาตรฐานและกฎหมายที่ใช้</div>
        <ol className="list-decimal pl-5">{standards.map((x) => <li key={x}>{x}</li>)}</ol></div>}
      <div className="mt-auto grid grid-cols-2 gap-[10mm] pt-[12mm] text-[11pt]">
        <div className="self-end text-left text-[9pt] text-[#667085]"><div className="mb-1 font-semibold text-[#344054]">จัดทำด้วยโปรแกรม {BRAND.full}</div>รายการคำนวณนี้ลงนามโดยวิศวกรผู้คำนวณทุกแผ่น</div>
        <div>
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
      <h2 className="mb-3 border-b-2 border-[#465fff] pb-1 text-[14pt] font-semibold">สารบัญ</h2>
      <div className="rp-toc text-[11pt] leading-[2]">{items.map((x) => <div key={x.id}><a href={`#${x.id}`} className="text-[#1d2939] no-underline">{x.n}  {x.th}</a></div>)}</div>
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
  <div className="my-1.5 break-inside-avoid rounded-md border-l-4 border-[#fdb022] bg-[#fffaeb] px-3 py-1.5 text-[9pt] text-[#7a2e0e]">{children}</div>
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
