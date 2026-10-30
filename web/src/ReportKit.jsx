// Building blocks for the calculation reports (Thai-first, paginated by Paged.js when printing).
import { Previewer } from "pagedjs";

// @page rules and running header/footer; Tailwind classes in the report body come from the app stylesheet.
const PAGE_CSS = `
@page {
  size: A4; margin: 18mm 14mm 18mm 14mm;
  @top-left { content: string(rp-project); font: 8pt Sarabun, sans-serif; color: #667085; }
  @top-right { content: "รายการคำนวณออกแบบโครงสร้าง (" string(rp-method) ")"; font: 8pt Sarabun, sans-serif; color: #667085; }
  @bottom-left { content: "StructCalc · " string(rp-member); font: 8pt Sarabun, sans-serif; color: #98a2b3; }
  @bottom-right { content: "หน้า " counter(page) " / " counter(pages); font: 8pt Sarabun, sans-serif; color: #667085; }
}
.rp-str-project { string-set: rp-project content(text); }
.rp-str-member { string-set: rp-member content(text); }
.rp-str-method { string-set: rp-method content(text); }
`;

// Paginate the hidden report into #print-root, print, then clean up.
export async function printReport({ dialog = true } = {}) {
  const src = document.querySelector(".report");
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
  if (dialog) window.print();
  else document.title += " [paged]"; // ?print: leave the paged preview open (used for headless PDF export)
}

export const Chip = ({ ok, children }) => (
  <span className={`inline-block rounded-full px-2 py-[1px] text-[8.5pt] font-semibold ${ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
    {children ?? (ok ? "ผ่าน" : "ไม่ผ่าน")}
  </span>
);

const WSD_STD = "วิธีหน่วยแรงใช้งาน (WSD) ตาม ว.ส.ท. / ACI 318";
export function Doc({ project, title, subtitle, memberLabel, member, summary, method = "WSD", standard = WSD_STD, children }) {
  const info = [["โครงการ", project.name], ["เจ้าของโครงการ", project.owner || "-"], ["สถานที่ก่อสร้าง", project.location || "-"],
    ["วิศวกรผู้คำนวณ", `${project.engineer || "-"} ${project.license ? `(${project.license})` : ""}`],
    [memberLabel, `${member} · ชั้น ${project.floor}`], ["วันที่", project.date]];
  return (
    <div className="rp text-[10pt] leading-[1.55] text-[#1d2939]">
      <span className="rp-str-project hidden">{project.name}</span>
      <span className="rp-str-member hidden">{`${memberLabel} ${member}`}</span>
      <span className="rp-str-method hidden">{method}</span>
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
    </div>
  );
}

export function Sec({ n, th, en, intro, children }) {
  return (
    <section className="mb-4">
      <h2 className="mb-1 flex items-baseline gap-2 border-b-2 border-[#465fff] pb-0.5 break-after-avoid">
        <span className="rounded bg-[#465fff] px-1.5 text-[9pt] font-semibold text-[#fff]">ขั้นที่ {n}</span>
        <span className="text-[11.5pt] font-semibold">{th}</span>
        {en && <span className="text-[8.5pt] text-[#98a2b3]">{en}</span>}
      </h2>
      {intro && <p className="mb-1.5 text-[9pt] text-[#475467] break-after-avoid">{intro}</p>}
      {children}
    </section>
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
