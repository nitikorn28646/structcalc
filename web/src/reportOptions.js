// What the calculation book prints (user 2026-11-16: "เลือกได้ว่าอยากให้ส่วนไหนโชว์ในรายการคำนวณ"). Choices only decide which parts are
// PRINTED: every number comes from the same single analysis as the screen (analyzeFrame / runRoof), nothing is recomputed or changed here.
// project.report = { preset, sec: { key: true|false }, fails: { itemKey: { mode: "show"|"accept"|"hide", note } } }

// chapters and their parts; a part is printed when its chapter and the part itself are on
export const REPORT_TREE = [
  ["project", "ข้อมูลโครงการ (ขอบเขต มาตรฐาน หน่วย)", [["project.revs", "ประวัติการแก้ไขเอกสาร"], ["project.control", "การควบคุมเอกสาร (รหัสข้อมูล)"]]],
  ["criteria", "เกณฑ์การออกแบบ วัสดุ และน้ำหนักบรรทุก", []],
  ["lateral", "แรงด้านข้างและชุดผสมแรง (เมื่อเปิดใช้)", []],
  ["plans", "ผังโครงสร้าง", []],
  ["analysis", "การวิเคราะห์โครงสร้าง (แรงปฏิกิริยาฐาน ระยะแอ่น)", []],
  ["roof", "โครงหลังคาเหล็ก", []],
  ["floors", "พื้นและน้ำหนักบรรทุกรายชั้น", [["floors.groups", "น้ำหนักแยกกลุ่มที่ลงคาน"], ["floors.walls", "ผนัง"], ["floors.other", "พื้นยื่น บันได น้ำหนักเส้น/จุด"], ["floors.slabs", "ออกแบบพื้นและบันได"]]],
  ["beams", "คาน — แผ่นคำนวณต่อ type (ช่วงวิกฤต)", []],
  ["columns", "เสา", [["columns.forces", "แผนภูมิ / ตาราง P ทุกต้น"], ["columns.all", "แรงในเสาทุกต้น P, Mx, My"], ["columns.sheets", "แผ่นคำนวณต่อ type (ต้นวิกฤต)"]]],
  ["footings", "ฐานราก", [["footings.table", "ตารางฐานรากทุกต้น"], ["footings.pressure", "แรงดันดินฐานแผ่ (แจกแจง)"], ["footings.bore", "เหล็กในเข็มเจาะ"], ["footings.sheets", "แผ่นคำนวณต่อแบบ"], ["footings.drawings", "รูปฐานรากต่อแบบ"]]],
  ["status", "สรุปผลการออกแบบ", [["status.fails", "รายการที่ไม่ผ่าน / วิศวกรยอมรับ"], ["status.critical", "ชิ้นส่วนวิกฤต 15 อันดับ"], ["status.nc", "รายการที่ไม่ได้ตรวจ"], ["status.inputs", "การตรวจข้อมูลนำเข้า"], ["status.scope", "ขอบเขตการตรวจสอบ"]]],
  ["schedules", "ตารางหน้าตัดและเหล็กเสริม", [["schedules.tables", "ตาราง type คาน / เสา / ฐานราก"], ["schedules.cant", "คานยื่น"], ["schedules.cut", "ระยะตัดเหล็กเสริมพิเศษ"], ["schedules.topFull", "ช่วงที่เหล็กบนยาวตลอด"], ["schedules.beamSec", "รูปตัดคาน"], ["schedules.colSec", "รูปตัดเสา"]]],
  ["appendix", "ภาคผนวก — แรงภายในคานทุกช่วง", [["appendix.tables", "ตารางทุกช่วง"], ["appendix.diagrams", "รูปน้ำหนัก / V / M ทุกแนว"]]],
];

const ALL = Object.fromEntries(REPORT_TREE.flatMap(([k, , subs]) => [[k, true], ...subs.map(([s]) => [s, true])]));
export const REPORT_PRESETS = {
  full: { name: "ฉบับเต็ม", sec: { ...ALL } },
  // permit set (user 2026-11-16: critical member per type, no all-member listings)
  permit: { name: "ฉบับยื่นขออนุญาต", sec: { ...ALL, appendix: false, "columns.all": false, "footings.table": true, "status.critical": true } },
  short: { name: "ฉบับย่อ", sec: { ...Object.fromEntries(Object.keys(ALL).map((k) => [k, false])), project: true, "project.revs": true, "project.control": true, criteria: true, plans: true, status: true, "status.fails": true, "status.scope": true, schedules: true, "schedules.tables": true, "schedules.beamSec": true, "schedules.colSec": true } },
};

// o(key): is this part printed? (a part needs its chapter on too)
export function reportOpt(report) {
  const sec = { ...REPORT_PRESETS.full.sec, ...(report?.preset && REPORT_PRESETS[report.preset] ? REPORT_PRESETS[report.preset].sec : {}), ...(report?.sec ?? {}) };
  return (key) => { const top = key.split(".")[0]; return sec[top] !== false && sec[key] !== false; };
}
export const reportPresetName = (report) => (report?.preset && report.preset !== "custom" ? REPORT_PRESETS[report.preset]?.name : report?.sec && Object.keys(report.sec).length ? "ฉบับกำหนดเอง" : REPORT_PRESETS.full.name) ?? REPORT_PRESETS.full.name;
