// In-app help: a short guide bar per workflow step (collapsible, remembered per browser) and a first-run tour of the
// whole workflow with a link to the example house. Text only — no engine knowledge here.
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, HelpCircle, X } from "lucide-react";

// per step: what the step is for, what to do (in order), tips
export const HELP = {
  project: { what: "กรอกข้อมูลโครงการ วัสดุ และมาตรฐานที่ใช้ — ค่าเหล่านี้ใช้กับทุกขั้นถัดไปและพิมพ์ในหน้าแรกของรายการคำนวณ",
    do: ["กรอกชื่อโครงการ เจ้าของ สถานที่ ผู้คำนวณ", "เลือกว่าจะคิดแรงลม / แผ่นดินไหวหรือไม่ (การ์ด \"แรงด้านข้าง\")", "ตั้ง f'c คอนกรีต, ชั้นเหล็ก (SR24 / SD40), ระยะหุ้ม", "กด \"บันทึกโครงการ\" มุมขวาบนเป็นระยะ (ไฟล์ .json เปิดต่อได้ทุกเครื่อง)"],
    tips: ["ลองดูตัวอย่างได้จากปุ่ม ? → \"เปิดตัวอย่างบ้านยโสธร\""] },
  grid: { what: "กำหนดชั้นของอาคารจากล่างขึ้นบน (คานคอดิน → ชั้น 2 → คานหลังคา) ความสูงเสาใต้แต่ละชั้น และเส้นกริดตามแบบ",
    do: ["เพิ่ม / ลบชั้น ใส่ความสูงเสาใต้ชั้นนั้น (ม.)", "ใส่ระยะแกนกริด X / Y ตามแบบ (เช่น 3.5, 2.5, 4.5)", "ตั้งพื้นหนา วัสดุปูผิว น้ำหนักจรเริ่มต้นของชั้น"],
    tips: ["กริดไม่บังคับ — ปิดได้ที่ปุ่ม \"กริด\" แล้ววาดอิสระ", "นำเข้า DXF ได้ในขั้นที่ 2 (เสา/คานจาก layer)"] },
  frame: { what: "วาดเสาและคานของชั้นที่เลือก (เลือกชั้นที่หัวจอ) — สร้างจากชั้นล่างขึ้นบน",
    do: ["เครื่องมือ \"เสา\" คลิกจุดกริด/จุดตัด", "เครื่องมือ \"คาน\" คลิกต้น → ปลาย (ต่อเนื่องได้, Esc จบ, พิมพ์ความยาว + Enter)", "คลิกคานด้วยเครื่องมือ \"เลือก\" เพื่อกำหนด type (หรือปล่อย อัตโนมัติ)"],
    tips: ["ปลายคานวางบนคานอื่น = คานซอย · ปลายลอย = คานยื่น", "มุมคานที่ไม่มีเสาจะคิดเป็นมุมยึดแน่นในโครง 3 มิติ", "Ctrl+Z / Ctrl+Y ย้อน / ทำซ้ำ ได้ทั้งโครงการ"] },
  slab: { what: "กำหนดชนิดแผ่นพื้นที่เกิดจากคานล้อมรอบ และพื้นยื่น",
    do: ["คลิกแผ่นพื้น → เลือก S หล่อในที่ / PS พื้นสำเร็จ (เลือกทิศวาง) / GS พื้นบนดิน / ช่องเปิด", "ใส่ความหนา วัสดุปูผิว น้ำหนักจร (ถ้าต่างจากค่าชั้น)", "เครื่องมือ \"พื้นยื่น\" คลิกบนคานด้านที่จะยื่น แล้วแก้ระยะยื่น"],
    tips: ["พื้น S คำนวณสองทาง / ทางเดียวอัตโนมัติจากอัตราส่วนด้าน", "ผลออกแบบพื้นดูที่ขั้น 8 แท็บ \"พื้น / บันได\""] },
  stair: { what: "วางบันไดที่ชั้นที่ปลายบนของบันไดไปถึง ปลายล่างจะส่งน้ำหนักลงชั้นล่างให้เอง",
    do: ["วาดกรอบช่องบันได (คลิกมุม → มุมตรงข้าม)", "เลือกแบบ (พาดยาว / พาดข้าง / ยื่น / มีชานพัก) ทิศขึ้น ลูกตั้ง ลูกนอน ความหนา"],
    tips: ["ความหนาบันไดต้องผ่านเกณฑ์ความลึกขั้นต่ำ ไม่ผ่านจะขึ้นเหตุผลในขั้น 8"] },
  roof: { what: "ออกแบบหลังคาเหล็ก: วาดแปลนผนัง → รูปทรง → อะเส → โครงหลังคา → ออกแบบ แป จันทัน ตะเฆ่ อะเส",
    do: ["แท็บ \"วาดแปลน\": วาดผนังรอบอาคาร วางเสา อะเส", "แท็บ \"รูปทรง\": ความชัน ระยะชายคา ชนิดกระเบื้อง", "แท็บ \"ออกแบบ\": เลือกหน้าตัดหรือปล่อยอัตโนมัติ (ขั้นต่ำ C100×50×20×2.3)"],
    tips: ["แรงจากหลังคาลงเสา/คานชั้นบนสุดอัตโนมัติ (ขั้น 6 แท็บ \"น้ำหนักอื่น / หลังคา\")"] },
  loads: { what: "น้ำหนักที่ไม่ได้มาจากพื้น: ผนัง ราวกันตก น้ำหนักจุด และน้ำหนักจากหลังคา — แยกกลุ่ม DL / SDL / WALL / LL / SP",
    do: ["แท็บ \"ผนัง\": วาดผนังบนคาน (ลงคาน) หรือกลางพื้น (กระจายลงแผ่นพื้น) เลือกชนิด สูง % ช่องเปิด จำนวนชั้น (ผนังเบิ้ล)", "แท็บ \"น้ำหนักอื่น\": ราวกันตก (น้ำหนักเส้น) และน้ำหนักจุด", "แท็บ \"สรุปกลุ่มน้ำหนัก\": ตรวจรวมแต่ละกลุ่ม", "แท็บ \"ลม / แผ่นดินไหว / Combination\": ค่าความเร็วลม ค่าแผ่นดินไหว ชุดผสมแรง และผลการเซตัว"],
    tips: ["น้ำหนักจุดที่วางบนเสาจะลงเสาโดยตรง"] },
  analysis: { what: "ดูผลวิเคราะห์ทั้งอาคาร: คานต่อเนื่อง (จัดน้ำหนักจรแบบหมากรุก) และโครง 3 มิติจุดต่อแข็ง + P-Delta",
    do: ["คลิกแนวคานเพื่อดูรูปแรงเฉือน / โมเมนต์ ด้านล่าง", "แท็บ \"โครง 3 มิติ\": เทียบผลสองวิธี เลือกแรงที่ใช้ออกแบบ และชนิดฐานเสา (หมุด / ยึดแน่น)"],
    tips: ["ค่าเริ่มต้นออกแบบด้วยค่ามากสุดของสองวิธี", "ตัวยก ³ᴰ ในตาราง = ค่านั้นมาจากโครง 3 มิติ", "ทั้งสองวิธีผ่านการเทียบผลกับ PyNite (โปรแกรมวิเคราะห์โครงสร้างโอเพนซอร์ส)"] },
  design: { what: "ออกแบบคาน เสา พื้น บันได ตามวิธีหน่วยแรงใช้งาน (WSD) — สีแดง = ไม่ผ่าน พร้อมเหตุผล",
    do: ["แท็บ \"คาน\" / \"เสา\": ดูอัตราส่วนการใช้งานและเหตุผลที่ไม่ผ่าน", "แท็บ \"Type คาน\" / \"Type เสา\": เพิ่ม / แก้ type (ขนาด เหล็กเสริม ปลอก)", "คลิกสมาชิกเพื่อกำหนด type เอง หรือปล่อยอัตโนมัติ (เลือก type เบาสุดที่ผ่าน)"],
    tips: ["ถ้าไม่มี type ไหนผ่าน ให้เพิ่ม type ที่ใหญ่ขึ้น หรือเหล็กปลอกถี่ขึ้น", "เสาไม่ผ่านเพราะระยะปลอก > 16db → ลดระยะปลอก"] },
  footing: { what: "ฐานรากเสาเข็มจากแรงที่ฐานเสา (ค่ามากสุดของแรงสะสมและโครง 3 มิติ) รวมโมเมนต์ที่ฐาน",
    do: ["โปรแกรมเลือกเข็ม (I-18 / 22 / 26, รับปลอดภัย 18 ตัน/ต้น) จำนวนเข็ม ขนาดฐาน และเหล็กเสริมให้อัตโนมัติ", "ตรวจรายการฐานรากของแต่ละเสา สีแดง = ไม่ผ่าน"],
    tips: ["ฐานเข็ม 1–2 ต้นรับโมเมนต์ไม่ได้ จึงตั้งฐานเสาเป็นหมุดเป็นค่าเริ่มต้น"] },
  report: { what: "รายการคำนวณทั้งหลัง หลังคา → โครงสร้าง → ฐานราก พร้อมรูปแปลน ตาราง และขั้นตอนคำนวณ",
    do: ["ตรวจตัวอย่างในหน้านี้", "กด \"พิมพ์ / บันทึก PDF\" มุมขวาบน แล้วเลือก \"บันทึกเป็น PDF\""],
    tips: ["แก้ข้อมูลขั้นใดก็ได้ รายการคำนวณอัปเดตตามทันที"] },
};

const KEY = "structcalc.help";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } };

// guide bar under the header of a workflow step: one line by default, opened state remembered per step (false = opened)
export function StepGuide({ step, index }) {
  const [st, setSt] = useState(load), h = HELP[step];
  if (!h) return null;
  const open = st[step] === false, toggle = () => { const v = { ...st, [step]: open }; setSt(v); save(v); };
  return (
    <div className="border-b border-brand-100 bg-brand-50/60 px-4 text-[12px] text-gray-700 md:px-5">
      <button onClick={toggle} className="flex w-full items-center gap-2 py-1.5 text-left">
        <BookOpen className="h-3.5 w-3.5 shrink-0 text-brand-500" />
        <span className="font-medium text-brand-600">ขั้นที่ {index}:</span><span className="truncate">{h.what}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-gray-400">{open ? <>ซ่อน<ChevronUp className="h-3.5 w-3.5" /></> : <>วิธีใช้<ChevronDown className="h-3.5 w-3.5" /></>}</span>
      </button>
      {open && <div className="grid gap-x-6 pb-2 md:grid-cols-[1.4fr_1fr]">
        <ol className="list-decimal space-y-0.5 pl-5">{h.do.map((t, i) => <li key={i}>{t}</li>)}</ol>
        <ul className="space-y-0.5 text-gray-500">{h.tips.map((t, i) => <li key={i}>💡 {t}</li>)}</ul>
      </div>}
    </div>
  );
}

// overview of the whole workflow (shadcn Dialog); shown on the first visit and from the ? button
export function Tour({ steps, onClose, onGo }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <div className="flex items-center gap-2"><HelpCircle className="h-5 w-5 text-brand-500" />
          <DialogTitle className="text-lg">วิธีใช้ StructCalc</DialogTitle></div>
        <p className="mb-4 text-sm text-gray-600">ทำตามขั้นที่แถบซ้ายจากบนลงล่าง: สร้างโมเดลจากชั้นล่างขึ้นบน โปรแกรมคำนวณจากบนลงล่าง (หลังคา → คาน → เสา → ฐานราก) ให้เองทุกครั้งที่แก้ข้อมูล
          ทุกขั้นมีแถบ "วิธีใช้" ใต้หัวจอ และชี้เมาส์ที่เครื่องมือวาดเพื่อดูคำอธิบาย</p>
        <ol className="grid gap-2 text-[13px] md:grid-cols-2">
          {steps.map(([key, label], i) => (
            <li key={key}><button onClick={() => onGo(key)} className="w-full rounded-lg p-2 text-left ring-1 ring-gray-200 hover:bg-gray-50">
              <span className="font-medium text-gray-800">{i}. {label}</span><span className="block text-[12px] text-gray-500">{HELP[key]?.what}</span></button></li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href="?project=/projects/yasothon.json#work" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-[#fff] hover:bg-brand-600">เปิดตัวอย่างบ้านยโสธร (2 ชั้น)</a>
          <button onClick={() => onGo("project")} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">เริ่มโครงการของฉัน</button>
        </div>
        <p className="mt-3 text-[11px] text-gray-400">ตัวอย่างจะแทนข้อมูลที่เปิดอยู่ — บันทึกโครงการของคุณก่อน (ปุ่ม "บันทึกโครงการ")</p>
      </DialogContent>
    </Dialog>
  );
}

export const tourSeen = () => { try { return localStorage.getItem("structcalc.tour") === "1"; } catch { return true; } };
export const markTourSeen = () => { try { localStorage.setItem("structcalc.tour", "1"); } catch { /* ignore */ } };
