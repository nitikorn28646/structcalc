// Report editions check (user 2026-11-16: "ห้ามให้สูตรหรือการคำนวณเพี้ยน"): every edition of the calculation book (full / permit / short /
// random ticks / failing items accepted or left out) must print EXACTLY the numbers of the full edition in every chapter it prints —
// a chapter printed in part only holds a sub-multiset of the full chapter's numbers. Also: no NaN / undefined, contents numbered 1…n
// without gaps, the edition named on the cover. Usage: node cli/report-editions.cjs [project.json …] (dev server on :5180)
const { chromium } = require(process.env.PW ?? "playwright");
const projects = process.argv.slice(2).length ? process.argv.slice(2) : ["yasothon.json"];
const URL0 = "http://localhost:5180/?step=report&project=/projects/";
let bad = 0; const log = (ok, msg) => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };
const nums = (t) => (t.replace(/บท\s*\d+(\.\d+)?/g, "บท").match(/-?\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => x.replace(/,/g, ""));
const bag = (a) => a.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  await p.addInitScript(() => { try { localStorage.setItem("structcalc.tour", "1"); } catch {} });
  for (const pj of projects) {
    await p.goto(URL0 + pj + "#work"); await p.waitForFunction(() => !location.search.includes("project="), null, { timeout: 60000 }); await p.waitForTimeout(4000);
    // chapter texts without headings (chapter numbers move between editions) and without page refs
    const grab = () => p.evaluate(() => { const root = document.querySelector(".report-preview .report"), out = {};
      for (const s of root.querySelectorAll("[id^='c-']")) { const c = s.cloneNode(true); c.querySelectorAll("h2, .rp-toc, a.rp-pref").forEach((x) => x.remove()); out[s.id] = c.innerText.replace(/\d+\/\d+\/\d+ \d+:\d+/g, "‹เวลา›").replace(/กำลังสร้างภาพ 3D…/g, ""); }
      const toc = [...root.querySelectorAll(".rp-toc a")].map((a) => a.textContent.trim().split(/\s+/)[0]);
      return { out, toc, all: root.innerText, cover: root.innerText.slice(0, 2000) }; });
    const full = await grab();
    const check = async (name) => {
      const v = await grab(); let diffs = [];
      for (const [id, t] of Object.entries(v.out)) {
        const f = full.out[id]; if (f == null) { diffs.push(`${id}: not in full edition`); continue; }
        const fb = bag(nums(f)); for (const [x, n] of bag(nums(t))) if ((fb.get(x) ?? 0) < n) { const k = t.indexOf(x); diffs.push(`${id}: ${x} «${t.slice(Math.max(0, k - 40), k + 20)}»`); break; }
      }
      log(!diffs.length, `${pj} · ${name}: ${Object.keys(v.out).length} chapters, numbers ⊆ full edition ${diffs.slice(0, 3).join(" | ")}`);
      log(!/NaN|undefined|\[object Object\]/.test(v.all), `${pj} · ${name}: no NaN / undefined`);
      const tops = v.toc.filter((x) => /^\d+$/.test(x)).map(Number); log(tops.every((x, i) => x === i + 1), `${pj} · ${name}: contents 1…${tops.length} without gaps`);
      return v;
    };
    await check("ฉบับเต็ม");
    for (const ed of ["ฉบับยื่นขออนุญาต", "ฉบับย่อ"]) { await p.getByRole("button", { name: ed, exact: true }).click(); await p.waitForTimeout(2500); const v = await check(ed); log(v.cover.includes(ed), `${pj} · ${ed}: edition named on the cover`); }
    // random ticks (seeded): untick 4 boxes from the full edition, three times
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 3; k++) {
      await p.getByRole("button", { name: "ฉบับเต็ม", exact: true }).click(); await p.waitForTimeout(1500);
      const boxes = p.locator("input[type=checkbox]:not([disabled])"), n = await boxes.count(), picks = new Set();
      while (picks.size < Math.min(4, n)) picks.add(Math.floor(rnd() * n));
      for (const i of [...picks].sort((a, b) => b - a)) await boxes.nth(i).click();
      await p.waitForTimeout(2500); await check(`กำหนดเอง ${k + 1}`);
    }
    // failing checks: accept the first, leave out the second — member numbers must not change, summary must say so
    await p.getByRole("button", { name: "ฉบับเต็ม", exact: true }).click(); await p.waitForTimeout(1500);
    const sels = p.locator("select").filter({ hasText: "วิศวกรยอมรับ" }), nf = await sels.count();
    if (nf) {
      await sels.nth(0).selectOption("accept"); await p.waitForTimeout(800);
      await p.locator("input[placeholder^='เช่น ระยะแอ่น']").first().fill("ทดสอบ: วิศวกรพิจารณาแล้ว"); if (nf > 1) await sels.nth(1).selectOption("hide");
      await p.waitForTimeout(2500); const v = await grab();
      const same = Object.keys(full.out).filter((id) => id !== "c-status" && id !== "c-project" && id !== "c-criteria").every((id) => v.out[id] === full.out[id]);
      if (process.env.DIFF) for (const id of ["c-footings", "c-schedules"]) { const a = full.out[id].split("\n"), c = (v.out[id] ?? "").split("\n"); for (let i = 0; i < Math.max(a.length, c.length); i++) if (a[i] !== c[i]) { let j = 0; while (a[i][j] === c[i]?.[j]) j++; console.log(id, i, JSON.stringify(a[i].slice(Math.max(0, j - 60), j + 80)), "|", JSON.stringify((c[i] ?? "").slice(Math.max(0, j - 60), j + 80))); break; } }
      log(same, `${pj} · decisions: every member chapter identical to the full edition ${Object.keys(full.out).filter((id) => !["c-status", "c-project", "c-criteria"].includes(id) && v.out[id] !== full.out[id]).join(",")}`);
      log((v.out["c-status"] ?? "").includes("ทดสอบ: วิศวกรพิจารณาแล้ว"), `${pj} · decisions: accepted item printed with the engineer's reason`);
    } else log(true, `${pj} · decisions: no failing checks in this project (skipped)`);
    // leave the project as it was
    await p.getByRole("button", { name: "ฉบับเต็ม", exact: true }).click();
  }
  await b.close(); console.log(bad ? `FAIL ${bad}` : "ALL OK"); process.exit(bad ? 1 : 0);
})();
