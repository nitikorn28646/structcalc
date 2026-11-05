// Member check sheets in the standard 6 parts (ReportKit CheckSheet) for the report book: RC beam types (governing span, mid-span +
// support), column type levels (governing column), footing types and steel roof members. Values come straight from the engine
// results (beam.js / column.js / footing.js / roofDesign.js outputs) — nothing is recomputed here except the substituted text.
// Units (one system for the whole book): force กก. (kgf) · moment กก.-ม. · stress กก./ซม.² · steel area ซม.² · length ม. / ซม. ·
// deflection มม. · distributed load กก./ม. · area load กก./ม.²
import { CheckSheet, num } from "./ReportKit.jsx";
import { BeamDetail, ColumnDetail } from "./Details.jsx";
import { stLabel } from "../engine/floor.js";

const n0 = (v) => num(v, 0), n2 = (v) => num(v, 2), n3 = (v) => num(v, 3);
const KIND = { simple: "ช่วงเดี่ยว", one_end: "ต่อเนื่องปลายเดียว", both_ends: "ต่อเนื่องสองปลาย", cantilever: "คานยื่น" };

// one face (mid-span or support) of a beam: equations and checks from designSection
function beamFace(tag, r, M, V, tensionTop, b, fcp) {
  const face = tensionTop ? "บน" : "ล่าง";
  const eqs = [
    [`${tag}: ความลึกประสิทธิผล`, "d = h − c − dₛ − d_b/2", "", n2(r.d), "ซม."],
    [`${tag}: โมเมนต์ต้านทานคอนกรีต`, "Mc = R·b·d²", `${n2(r.R)} × ${n0(b)} × ${n2(r.d)}² / 100`, n0(r.Mc), "กก.-ม."],
    r.mode === "singly"
      ? [`${tag}: เหล็กรับแรงดึง (${face})`, "As = M / (fs·j·d)", `${n0(M)} × 100 / (${n0(r.fs)} × ${n3(r.j)} × ${n2(r.d)})`, n2(r.As), "ซม.²"]
      : [`${tag}: เหล็กรับแรงดึง (${face}) M > Mc`, "As = Mc/(fs·j·d) + M₂/(fs·(d − d′))", `M₂ = ${n0(M)} − ${n0(r.Mc)} = ${n0(r.M2)}`, n2(r.As), "ซม.²"],
    r.AsPrime > 0 && [`${tag}: เหล็กรับแรงอัด`, "As′ = M₂ / (fs′·(d − d′))", `${n0(r.M2)} × 100 / (${n0(r.fsPrime)} × (${n2(r.d)} − ${n2(r.dPrime)}))`, n2(r.AsPrime), "ซม.²"],
    r.Ast > 0 && [`${tag}: เหล็กยืนรับแรงบิด`, "2·Ast", "", n2(2 * r.Ast), "ซม.²"],
    [`${tag}: กำลังเฉือนคอนกรีต`, "Vc = 0.29·√f′c·b·d", `0.29 × √${n0(fcp)} × ${n0(b)} × ${n2(r.d)}`, n0(r.Vc), "กก."],
  ];
  const checks = [
    [`${tag}: As (${face}) ต้องการ ≤ ที่ใส่`, r.reqBot, r.provBot, "ซม.²", r.botOk],
    r.reqTop > 0 && [`${tag}: As (${tensionTop ? "ล่าง" : "บน"}) ต้องการ ≤ ที่ใส่`, r.reqTop, r.provTop, "ซม.²", r.topOk],
    r.AsMin > 0 && [`${tag}: As ≥ As,min`, r.AsMin, r.provBot, "ซม.²", r.AsMinOk !== false, r.provBot ? r.AsMin / r.provBot : null],
    [`${tag}: V′ = V − Vc ≤ Vc2 (เหล็กปลอกรับ)`, Math.max(0, V - r.Vc), r.Vc2, "กก.", r.VpOk],
    typeof r.sMax === "number" && r.AtotS > 0 && [`${tag}: ระยะเหล็กปลอก ≤ s,max`, r.stirrup === "CHECK_SPACING" ? "เกิน" : "ตามแบบ", r.sMax, "ม.", r.stirrup !== "CHECK_SPACING", null],
    r.vt > 0 && [`${tag}: หน่วยแรงบิด vt ≤ vc1`, r.vt, r.vc1, "กก./ซม.²", r.vtOk],
  ].filter(Boolean);
  return { eqs: eqs.filter(Boolean), checks };
}

export function BeamTypeSheet({ t, g, count, floorName, mat }) {
  const b = t.b * 100, fcp = mat.fcBeam ?? mat.fcPrime, c = g.check, d = g.defl;
  const mid = c.mid ? beamFace("กลางคาน", c.mid, g.Mpos, g.V, false, b, fcp) : { eqs: [], checks: [] };
  const sup = c.sup ? beamFace("หัวเสา", c.sup, g.Mneg, g.V, true, b, fcp) : { eqs: [], checks: [] };
  const r0 = c.mid ?? c.sup ?? {};
  const defl = d && [["ระยะแอ่นรวม 3·δD + δL ≤ L/" + (mat.deflTotal ?? 240), d.dT * 1000, d.limT * 1000, "มม.", d.dT <= d.limT + 1e-9], ["ระยะแอ่นจากน้ำหนักจร δL ≤ L/" + (mat.deflLive ?? 360), d.dL * 1000, d.limL * 1000, "มม.", d.dL <= d.limL + 1e-9]];
  return (
    <CheckSheet id={`B-${t.name}`} title={`การตรวจสอบคาน — ${t.name}${g.kind === "cantilever" ? "A" : ""}`} sub={`${num(b, 0)} × ${num(t.h * 100, 0)} ซม. · ช่วงวิกฤต ${floorName} ${g.id}`}
      info={[["Type", t.name], ["หน้าตัด b × h", `${num(b, 0)} × ${num(t.h * 100, 0)}`, "ซม."], ["ช่วงวิกฤต", `${floorName} ${g.id}`], ["ยาวช่วง", n2(g.len), "ม."], ["ลักษณะช่วง", KIND[g.kind] ?? g.kind], ["ใช้ type นี้", `${count} ช่วง`],
        ["เหล็กบน", [t.top, t.topX && `+ ${t.topX}`].filter(Boolean).join(" ")], ["เหล็กล่าง", [t.bot, t.botX && `+ ${t.botX}`].filter(Boolean).join(" ")], ["เหล็กปลอก", `${stLabel(t)} @${n2(t.sSup)} / @${n2(t.sMid)}`, "ม."]]}
      input={[["f′c", n0(fcp), "กก./ซม.²"], ["fc ยอมให้", n0(r0.fc), "กก./ซม.²"], ["fy / fs", `${n0(mat.fy ?? 4000)} / ${n0(r0.fs)}`, "กก./ซม.²"], ["n = Es/Ec", n2(r0.n)], ["k · j", `${n3(r0.k)} · ${n3(r0.j)}`], ["R", n2(r0.R), "กก./ซม.²"],
        ["ระยะหุ้ม", n2(mat.cover ?? 3), "ซม."]]}
      forces={[["M+ (กลางช่วง)", n0(g.Mpos), "กก.-ม."], ["M− (หัวเสา)", n0(g.Mneg), "กก.-ม."], ["V ออกแบบ" + (g.vAtD ? " (ที่ระยะ d)" : ""), n0(g.V), "กก."],
        ["T (แรงบิด)", n0(c.MtUse ?? g.Mt ?? 0), "กก.-ม."], g.src && ["แหล่งแรง", g.src === "3D" ? "โครง 3 มิติ" : g.src === "LAT" ? "ชุดผสมแรงด้านข้าง" : "คานต่อเนื่อง"]]}
      eqs={[["ค่าคงที่หน้าตัด", "k = 1/(1 + fs/(n·fc)), j = 1 − k/3, R = ½·fc·k·j", "", `R = ${n2(r0.R)}`, "กก./ซม.²"], ...mid.eqs, ...sup.eqs]}
      checks={[...mid.checks, ...sup.checks, ...(defl ?? [])]}
      note={c.error ?? (g.kind === "cantilever" ? "คานยื่น: เหล็กบนยาวตลอดคานยื่น งอขอที่ปลาย และฝากเข้าช่วงหลัง" : undefined)}
      figure={<div className="grid gap-1">{[["sup", g.kind === "cantilever" ? "โคนคานยื่น" : "ปลายคาน (หัวเสา)", t.sSup], ["mid", g.kind === "cantilever" ? "ปลายคานยื่น" : "กลางคาน", t.sMid]].map(([at, cap, sp]) => (
        <div key={at} className="text-center"><BeamDetail t={t} mat={mat} at={at} className="h-[36mm] w-full" /><div className="text-[7.5pt] text-[#667085]">{cap} · ปลอก @{n2(sp)}</div></div>))}</div>} />
  );
}

export function ColumnLevelSheet({ t, lv, c, floorName, mat, method }) {
  const r = c.check.r ?? {}, P = c.Pd ?? c.Pbot, e = c.check.e ?? 0, fcp = mat.fcCol ?? mat.fcPrime;
  const ax = r.mode === "I";
  return (
    <CheckSheet id={`C-${t.name}-${lv.level}`} title={`การตรวจสอบเสา — ${t.name} ${lv.level}`} sub={`${lv.Bx} × ${lv.By} ซม. · ต้นวิกฤต ${c.stack} ใต้ ${floorName}`}
      info={[["Type / ระดับ", `${t.name} · ${lv.level}`], ["หน้าตัด", `${lv.Bx} × ${lv.By}`, "ซม."], ["ต้นวิกฤต", `${c.stack} ใต้ ${floorName}`], ["ความสูงชั้น", n2(c.L), "ม."], ["สูงสุทธิ lu", n2(c.Lu ?? c.L), "ม."],
        ["เหล็กยืน", `${lv.n}-${lv.mainBar}`], ["ปลอก", `${lv.tieBar} @${n2(lv.s)}`, "ม."]]}
      input={[["f′c", n0(fcp), "กก./ซม.²"], ["fy", n0(mat.fy ?? 4000), "กก./ซม.²"], ["ระยะหุ้ม", n2(mat.coverCol ?? mat.cover ?? 3), "ซม."], ["k (ความยาวประสิทธิผล)", c.check.slender?.dirs ? c.check.slender.dirs.map((d) => `${d.ax}: ${n2(d.k)}`).join(" · ") : "1.0"], c.check.slender?.Q != null && ["ดัชนีเสถียรภาพชั้น Q", `${n3(c.check.slender.Q)} → ${c.check.slender.sway ? "เซได้ (sway)" : "ยึดรั้ง (non-sway)"}`], ["วิธีหาแรง", method === "frame" ? "P + Mx, My จากโครง 3 มิติ" : "P สะสม + e ขั้นต่ำ"]]}
      forces={[["P ออกแบบ", n0(P), "กก."], ["Mx (3D)", n0(c.f3?.Mx ?? 0), "กก.-ม."], ["My (3D)", n0(c.f3?.My ?? 0), "กก.-ม."], ["e ขั้นต่ำ", n2(e), "ซม."], ["M จาก e ขั้นต่ำ", n0((P * e) / 100), "กก.-ม."],
        c.check.combo && c.check.combo !== "D+L" && ["ชุดผสมแรงที่ควบคุม", c.check.combo]]}
      eqs={[["พื้นที่หน้าตัด / เหล็ก", "Ag = Bx·By, ρg = Ast/Ag", `${lv.Bx} × ${lv.By} · ${n2(r.Ast)} / ${n0(r.Ag)}`, `${n2(r.pg)} %`, ""],
        ["ความชะลูด", "k·lu/r", "", n2(r.klr), ""], r.slender && ["ตัวคูณลดกำลัง (เสาชะลูด)", c.check.slender?.sway ? "R = 1.07 − 0.008·k·lu/r (sway)" : c.check.slender ? "R = 1.32 − 0.006·lu/r (non-sway) ≤ R เกณฑ์เดิม" : "R = 1.07 − 0.008·k·lu/r", c.check.slender ? `R ใหม่ ${n3(c.check.slender.Rnew)} · เดิม ${n3(c.check.slender.Rold)}` : `1.07 − 0.008 × ${n2(r.klr)}`, n3(r.R), ""],
        ["กำลังรับแรงอัดตามแกน", "Pa = 0.85·Ag·(0.25·f′c + fs·ρg)", "", n0(r.Pa), "กก."],
        !ax && ["หน่วยแรงอัด / ดัด", "fa = P/Ag, fb = M/S", "", `${n2(r.fa)} / ${n2(Math.max(r.fbx ?? 0, r.fby ?? 0))}`, "กก./ซม.²"]]}
      checks={[ax ? ["แรงอัด P ≤ Pa", P, r.Pa, "กก.", r.ok] : ["fa/Fa + fbx/Fb + fby/Fb ≤ 1", r.ratio, 1, "", r.ok],
        ["อัตราส่วนเหล็ก 1 % ≤ ρg ≤ 8 %", r.pg, 8, "%", r.pgOk, null], ["k·lu/r ≤ 100", r.klr, 100, "", c.check.slenderOk !== false],
        ["ระยะปลอก ≤ min(16d_b, 48dₜ, ด้านแคบ)", lv.s * 100, r.sTie, "ซม.", c.check.sOk],
        c.check.fit && ["ระยะช่องว่างเหล็กยืน ≥ max(1.5d_b, 4 ซม.) (ACI 318-11 7.6.3)", c.check.fit.clear, c.check.fit.clearReq, "ซม.", c.check.fit.ok, null],
        c.check.tension && ["แรงดึง T ≤ As·fs", c.check.tension.T, c.check.tension.cap, "กก.", c.check.tension.ok]].filter(Boolean)}
      note={c.check.slender ? `${c.check.slender.basis} · e ขั้นต่ำตรวจทั้งสองแกน (ควบคุม: แกน ${c.check.eminAxis ?? "x"})` : undefined}
      figure={<ColumnDetail lv={lv} cover={mat.coverCol ?? mat.cover ?? 3} className="h-[40mm] w-full" />} />
  );
}

export function FootingSheet({ f, mark, count }) {
  const r = f.r, inp = f.inp, sp = f.kind === "spread";
  const vX = Math.max(r.vX ?? 0, r.vY ?? 0), vp = Math.max(r.vpX ?? 0, r.vpY ?? 0);
  return (
    <CheckSheet id={`F-${mark}`} title={`การตรวจสอบฐานราก — ${mark}`} sub={sp ? `ฐานแผ่ ${n2(r.Bx)} × ${n2(r.By)} × ${n2(inp.t)} ม.` : `ฐานเข็ม ${f.n} × ${f.pile} · ${n2(r.Bx)} × ${n2(r.By)} × ${n2(inp.t)} ม.`}
      info={[["แบบ", mark], ["ชนิด", sp ? "ฐานแผ่" : `เสาเข็ม ${f.n} ต้น ${f.pile}`], ["ขนาด Bx × By × t", `${n2(r.Bx)} × ${n2(r.By)} × ${n2(inp.t)}`, "ม."], ["ลึก Df", n2(inp.Df), "ม."], ["ตอม่อ", `${num(inp.bx * 100, 0)} × ${num(inp.by * 100, 0)}`, "ซม."],
        ["เหล็กแนวยาว", r.longText], ["เหล็กแนวสั้น", r.shortText], ["ใช้แบบนี้", `${count} ฐาน`], ["ฐานวิกฤต", f.stack]]}
      input={[["f′c", n0(inp.fcPrime), "กก./ซม.²"], ["fc · fs", `${n0(r.fc)} · ${n0(r.fs)}`, "กก./ซม.²"], ["ระยะหุ้ม", n2(inp.cover), "ซม."],
        sp ? ["qa ดิน", n2(inp.qa / 1000), "ตัน/ม.²"] : ["น้ำหนักปลอดภัย/ต้น", n2(r.Pallow / 1000), "ตัน"], sp && ["γ ดิน", n0(inp.gamma), "กก./ม.³"]]}
      forces={[["P ฐานเสา", n0(f.P), "กก."], ["Mx / My", `${n0(f.Mx ?? 0)} / ${n0(f.My ?? 0)}`, "กก.-ม."], ["ชุดแรง", f.combo ?? "D+L"]]}
      eqs={[sp && ["แรงดันดิน (รวมน้ำหนักฐาน + ดิน)", "q = (P + Wf + Ws)/A", r.gross != null ? `(${n0(f.P)} + ${n0(r.Wf)} + ${n0(r.Ws)}) / ${n2(r.A)}` : "", r.gross != null ? n0(r.gross) : "-", "กก./ม.²"],
        sp && r.gross != null && ["แรงดันดินที่มุม (สองแกน)", "q + 6Mx/(Bx·By²) + 6My/(By·Bx²)", `${n0(r.gross)} + ${n0(r.mY)} + ${n0(r.mX)}`, n0(r.qCorner), "กก./ม.²"],
        !sp && ["แรงต่อเข็มสูงสุด", "P/n + M·x/Σx² + น้ำหนักฐาน", "", n0(r.Ptmax), "กก."],
        ["ความลึกที่ต้องการ", "d = √(M/(R·b))", "", `${n2(Math.max(r.dReqX ?? 0, r.dReqY ?? 0))} / ${n2(Math.min(r.dLong ?? 0, r.dShort ?? 0))}`, "ซม."],
        ["แรงเฉือนทางเดียว", "v = V/(b·d) ≤ vc = 0.29√f′c", "", `${n2(vX)} / ${n2(r.vc)}`, "กก./ซม.²"],
        ["แรงเฉือนทะลุ", "vp = V/(b₀·d) ≤ vcp = 0.53√f′c", "", `${n2(vp)} / ${n2(r.vcp)}`, "กก./ซม.²"],
        sp && r.vpFull != null && ["แรงเฉือนทะลุ (แรงเต็มนอกหน้าตัดวิกฤต)", "v = (P − qn·(bx+d)(by+d)) / (b₀·d)", `(${n0(f.P)} − …) / (${n0(r.b0Full)} × ${n2(r.dPunch)})`, `${n2(r.vpFull)} / ${n2(r.vcp)}`, "กก./ซม.²"]].filter(Boolean)}
      checks={[sp ? ["แรงดันดินสูงสุด (มุมฐาน) ≤ qa", r.qCorner ?? Math.max(r.qmaxX, r.qmaxY), inp.qa, "กก./ม.²", r.qOk && r.qCornerOk !== false] : ["แรงต่อเข็ม ≤ น้ำหนักปลอดภัย", r.Ptmax, r.Pallow, "กก.", r.pileOk],
        ["ความลึก d ต้องการ ≤ ที่มี", Math.max(r.dReqX ?? 0, r.dReqY ?? 0), Math.min(r.dLong ?? 0, r.dShort ?? 0), "ซม.", r.dOk], ["แรงเฉือนทางเดียว", vX, r.vc, "กก./ซม.²", r.vOk], ["แรงเฉือนทะลุ", vp, r.vcp, "กก./ซม.²", r.vpOk], ...(sp && r.vpFull != null ? [["แรงเฉือนทะลุ (แรงเต็ม)", r.vpFull, r.vcp, "กก./ซม.²", r.vpFullOk]] : []),
        ["เหล็กแนวยาว As ต้องการ ≤ ที่ใส่", Math.max(r.AsReqL ?? 0, r.AsMinL ?? 0), r.AsProvL, "ซม.²", r.AsOkL], ["เหล็กแนวสั้น As ต้องการ ≤ ที่ใส่", Math.max(r.AsReqS ?? 0, r.AsMinS ?? 0), r.AsProvS, "ซม.²", r.AsOkS],
        r.bearing != null && ["หน่วยแรงแบกทาน", r.bearing, r.fnb1, "กก./ซม.²", r.bearingOk]].filter(Boolean)}
      note={!f.ok && f.r?.limOk === false ? "เกินขีดจำกัดการใช้ดิน / เข็มที่กำหนด" : undefined} />
  );
}

// steel roof member (one group or one span): bending + deflection (+ axial for posts)
export function RoofSheet({ id, title, x, secText, f }) {
  const r = x.r, k = x.count > 1 ? 2 : 1, s = r.section ?? {}, dd = r.d ?? r.dy, da = r.dAllow ?? r.dyAllow;
  const axial = r.fa != null && r.Fa != null;
  return (
    <CheckSheet id={id} title={title} sub={secText}
      info={[["หน้าตัด", secText], ["จำนวน", k === 2 ? "คู่ (2C)" : "เดี่ยว"], ["ช่วง / ยาว", n2(x.span ?? r.L ?? r.Ld), "ม."], ["Ix · Sx (ต่อชิ้น)", `${n2(s.Ix)} · ${n2(s.Sx)}`, "ซม.⁴ · ซม.³"], ["น้ำหนัก", n2(s.w), "กก./ม."]]}
      input={[["Fy", n0(r.Fb ? r.Fb / 0.6 : 2400), "กก./ซม.²"], ["Fb = 0.6Fy", n0(r.Fb), "กก./ซม.²"], ["E", "2,040,000", "กก./ซม.²"], r.mode && ["การรองรับ", r.mode === "cont" ? "คานต่อเนื่อง" : r.mode === "beam" ? "วางบนคาน คสล." : "ช่วงเดี่ยว"]]}
      forces={[r.w != null && ["น้ำหนักแผ่ w", n0(r.w), "กก./ม."], ["M ออกแบบ", n0(r.Mx ?? r.M), "กก.-ม."], r.Mpos != null && ["M+ / M−", `${n0(r.Mpos)} / ${n0(r.Mneg)}`, "กก.-ม."], r.P && ["แรงจุดรวม", n0(r.P), "กก."], axial && ["แรงอัด", n0(r.Pd ?? r.P), "กก."]]}
      eqs={[["หน่วยแรงดัด", f ?? `fb = M / (${k === 2 ? "2·" : ""}Sx)`, f ? (r.My ? `Mx ${n0(r.Mx)} · My ${n0(r.My)} กก.-ม. · Sx ${n2(s.Sx)} · Sy ${n2(s.Sy)}` : "") : `${n0(r.Mx ?? r.M)} × 100 / (${k === 2 ? "2 × " : ""}${n2(s.Sx)})`, n0(r.fb), "กก./ซม.²"],
        ["ระยะแอ่น", r.cont ? "จากคานต่อเนื่อง (∫M/EI)" : "δ = 5wL⁴/(384EI) + แรงจุด", "", num((dd ?? 0) * 10, 1), "มม."], axial && ["หน่วยแรงอัด", "fa = P/A", "", n2(r.fa), "กก./ซม.²"]].filter(Boolean)}
      checks={[["หน่วยแรงดัด fb ≤ Fb", r.fb, r.Fb, "กก./ซม.²", r.fb <= r.Fb + 1e-9], dd != null && ["ระยะแอ่น δ ≤ ที่ยอมให้", dd * 10, da * 10, "มม.", dd <= da + 1e-9],
        axial && ["หน่วยแรงอัด fa ≤ Fa", r.fa, r.Fa, "กก./ซม.²", r.fa <= r.Fa + 1e-9]].filter(Boolean)} />
  );
}
