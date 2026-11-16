// Step-by-step tasks of the project workflow (user 2026-11-16: "ผู้ใช้ใหม่ไม่รู้ว่าต้องทำอะไร 1 2 3"). Every task is ticked from the project
// data itself (no manual ticking): done = true / false, or null = optional (shown, never blocks). go = where the task is done
// ({ step, sub, tool, roof }) — the checklist bar sends it as a "structcalc:go" window event the pages listen to.
const has = (a) => (a?.length ?? 0) > 0;

// steps that need a drawn structure: nothing in them counts as done before there are beams (an empty project ticked nothing)
const NEEDS_MODEL = ["loads", "analysis", "design", "footing", "report"];
export function stepTasks(step, ctx) {
  const t = rawTasks(step, ctx), model = (ctx.frame?.floors ?? []).some((f) => (f.beams?.length ?? 0) > 0);
  if (model) return t;
  return t.map((x) => (NEEDS_MODEL.includes(step) || x.id === "2.5" ? { ...x, done: x.done === null && step !== "frame" ? null : false, hint: "ยังไม่มีเสา / คาน — ทำขั้น 2 ก่อน" } : x));
}
function rawTasks(step, { frame, roof, project, res, dz = null, slabsOk = null }) {
  const fl = frame?.floors ?? [], an = res?.floors ?? [];
  const floorsMissing = (fn) => fl.map((f, k) => (fn(f, k) ? null : f.name)).filter(Boolean);
  const list = (names) => (names.length ? `ยังไม่ครบ: ${names.slice(0, 4).join(", ")}${names.length > 4 ? ` … (${names.length})` : ""}` : "");
  const T = (id, label, done, hint = "", go = {}) => ({ id, label, done, hint, go: { step, ...go } });
  switch (step) {
    case "project": return [
      T("0.1", "ชื่อโครงการ เจ้าของ วิศวกร", !!(project?.name && project?.engineer), "ปุ่ม ข้อมูลโครงการ ด้านบน", { dialog: "project" }),
      T("0.2", "วัสดุ f′c fy ระยะหุ้ม (ตรวจค่าเริ่มต้น)", !!frame?.mat?.fcPrime, "การ์ด เกณฑ์การออกแบบ"),
      T("0.3", "เลือกว่าคิดแรงลม / แผ่นดินไหวหรือไม่", !!frame?.lateral?.asked, "การ์ด แรงด้านข้าง"),
    ];
    case "grid": return [
      T("1.1", "จำนวนชั้นและความสูงแต่ละชั้น", fl.length > 0 && fl.every((f) => f.h > 0), "ตารางระดับชั้น"),
      T("1.2", "ระยะกริดแกน X / Y (หรือนำเข้า DXF)", fl.some((f) => has(f.grid?.dx) && has(f.grid?.dy)), "ช่องระยะกริด"),
    ];
    case "frame": {
      const noCol = floorsMissing((f) => has(f.columns)), noBeam = floorsMissing((f) => has(f.beams));
      const panelsOk = an.every((a) => (a.panels ?? []).every((p) => p.open || p.stairWell || p.t > 0));
      return [
        T("2.1", "วางเสาทุกชั้น", !noCol.length, list(noCol), { tool: "column" }),
        T("2.2", "วางคานทุกชั้น (คานหลัก + คานซอย)", !noBeam.length, list(noBeam), { tool: "beam" }),
        T("2.3", "พื้นทุกช่อง: ชนิด S / PS / GS และความหนา", has(an) && an.some((a) => has(a.panels)) && panelsOk, "คลิกแผ่นพื้นบนแปลน หรือตาราง แผ่นพื้นทั้งชั้น"),
        T("2.4", "พื้นยื่น", fl.some((f) => has(f.cants)) ? true : null, "เครื่องมือ พื้นยื่น", { tool: "cant" }),
        T("2.5", "ไม่มีคำเตือนโครงสร้าง (มุมไม่มีเสา คานลอย …)", !has(res?.warnings), res?.warnings?.length ? `${res.warnings.length} คำเตือน — ดูแท็บคำเตือนด้านขวา` : ""),
      ];
    }
    case "stair": return [T("3.1", "วาดช่องบันไดและเลือกแบบ", fl.some((f) => has(f.stairs)) ? true : null, "วาดบนชั้นที่บันไดเริ่มขึ้น", { tool: "stair" }),
      T("3.2", "ขนาดบันไดผ่านเกณฑ์ (จัดอัตโนมัติได้)", fl.some((f) => has(f.stairs)) ? an.every((a) => (a.stairs ?? []).every((s) => s.ok !== false)) : null, "คลิกบันได → จัดขนาดบันไดอัตโนมัติ")];
    case "roof": {
      const on = (roof?.pts?.length ?? 0) >= 3;
      return [
        T("4.1", "ดึงเสาและแปลนอาคารมาที่หลังคา", has(roof?.columns) || has(roof?.guide?.outline) ? true : on ? null : false, "ปุ่ม นำเข้าเสา + แปลนจากโครงสร้าง", { roof: "draw" }),
        T("4.2", "ขอบหลังคา / รูปทรง (ปั้นหยา จั่ว)", on, "แท็บ วาดแปลน / รูปทรง", { roof: "shape" }),
        T("4.3", "วัสดุมุงและน้ำหนัก (ตรวจค่าเริ่มต้น)", null, "แท็บ น้ำหนัก / วัสดุมุง", { roof: "loads" }),
        T("4.4", "อะเส / ดั้ง ครบ (ไม่มีดั้งลอย)", on && dz ? !has(dz.loose) : null, "แท็บ อะเส", { roof: "plate" }),
        T("4.5", "ส่งน้ำหนักหลังคาลงโครงสร้าง", on ? !!frame?.roofLink?.on : null, "การ์ด หลังคา → โครงสร้าง ด้านบน"),
      ];
    }
    case "loads": {
      const noLoad = floorsMissing((f) => f.finish != null && f.live != null);
      return [
        T("5.1", "น้ำหนักปูพื้น / จร ทุกชั้น (Load Cases)", !noLoad.length, list(noLoad), { sub: "cases" }),
        T("5.2", "ผนังบนคาน / บนพื้น", fl.some((f) => has(f.walls)) ? true : null, "แท็บ ผนัง", { sub: "wall", tool: "wall" }),
        T("5.3", "น้ำหนักเส้น / จุดอื่น (ราว ถังน้ำ …)", fl.some((f) => has(f.lineLoads) || has(f.pointLoads)) ? true : null, "แท็บ น้ำหนักอื่น", { sub: "other" }),
      ];
    }
    case "analysis": return [
      T("6.1", "วิเคราะห์สำเร็จ (คานต่อเนื่อง + โครง 3 มิติ)", !!res && !res.error && (frame?.analysis === "continuous" || !!res.frame3d), res?.frame3dError ?? "", { sub: "frame3d" }),
      T("6.2", "ตรวจแรงภายในคาน / เสา", has(res?.floors) ? true : null, "แท็บ แรงภายในคาน · แรงในเสา", { sub: "cont" }),
    ];
    case "design": {
      const nb = an.reduce((s, a) => s + a.spans.filter((x) => !x.ok).length, 0), nc = (res?.columns ?? []).filter((c) => !c.ok).length;
      return [
        T("7.1", "Type คาน (จัดอัตโนมัติได้) — คานผ่านทุกช่วง", has(an) && nb === 0, nb ? `ไม่ผ่าน ${nb} ช่วง` : "", { sub: "types" }),
        T("7.2", "Type เสา — เสาผ่านทุกต้น", has(res?.columns) && nc === 0, nc ? `ไม่ผ่าน ${nc} ต้น` : "", { sub: "ctypes" }),
        T("7.3", "พื้นและบันไดผ่านเกณฑ์", slabsOk, slabsOk === false ? "มีแผ่นพื้น / บันไดไม่ผ่าน" : "แท็บ พื้น / บันได", { sub: "slabs" }),
      ];
    }
    case "footing": {
      const n = (res?.footings ?? []).filter((f) => !f.ok).length;
      return [T("8.1", "ดิน / น้ำหนักปลอดภัยเสาเข็ม", !!(frame?.soil || frame?.pileLoads) || null, "การ์ด ดิน · ตารางเสาเข็ม"),
        T("8.2", "ฐานรากผ่านทุกต้น (ปุ่ม ปรับอัตโนมัติ ต่อฐาน)", has(res?.footings) && n === 0, n ? `ไม่ผ่าน ${n} ฐาน` : "")];
    }
    case "report": {
      const fails = (res?.floors ?? []).reduce((s, a) => s + a.spans.filter((x) => !x.ok).length, 0) + (res?.columns ?? []).filter((c) => !c.ok).length + (res?.footings ?? []).filter((f) => !f.ok).length;
      return [T("9.1", "เลือกฉบับ / เนื้อหารายการคำนวณ", project?.report?.preset ? true : null, "แผง เนื้อหารายการคำนวณ"),
        T("9.2", "ตัดสินใจรายการที่ไม่ผ่าน", fails ? Object.keys(project?.report?.fails ?? {}).length > 0 || null : true, fails ? "ดูตารางรายการที่ไม่ผ่านในแผง" : ""),
        T("9.3", "พิมพ์ / บันทึก PDF", null, "ปุ่ม พิมพ์ / บันทึก PDF มุมขวาบน")];
    }
    default: return [];
  }
}

// status of a whole step for the sidebar: "done" (every required task done) | "warn" (a required task failed after data exists) | "todo"
export function stepState(step, ctx) {
  const t = stepTasks(step, ctx).filter((x) => x.done !== null);
  if (!t.length) return "todo";
  if (t.every((x) => x.done)) return "done";
  return ["design", "footing", "frame"].includes(step) && t.some((x) => x.done === false && /ไม่ผ่าน|คำเตือน/.test(x.hint)) ? "warn" : "todo";
}
