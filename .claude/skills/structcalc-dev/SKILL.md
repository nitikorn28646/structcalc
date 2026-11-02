---
name: structcalc-dev
description: Rules and working procedure for developing StructCalc (Thai RC + steel-roof structural design web app). Use for ANY change in this repo — engine formulas, UI, reports, models, tests — so that every account / session develops in the same direction and to the same standard.
---

# StructCalc — shared development rules (all accounts)

Read `CLAUDE.md` first (architecture, data formats, status, what was built when). This skill is the **how**: the
procedure and the non-negotiables. When this file and a request conflict, ask the user.

## 1. Direction (agreed with the user)
- Product = **one project = one workflow**: 0 โครงการ → 1 กริด/ชั้น → 2 โครงสร้าง → 3 พื้น → 4 บันได → 5 หลังคา → 6 น้ำหนัก →
  7 วิเคราะห์ → 8 ออกแบบ → 9 ฐานราก → 10 รายการคำนวณ. Model bottom-up, analyse top-down. Single-member calculators stay
  under "เครื่องมือคำนวณเดี่ยว".
- Layout: workflow sidebar · centre 2D / 3D / split · inspector on the right · bottom drawer (tables, warnings) · status bar.
  New features go into the step where an engineer expects them — never a new free-floating page or a second menu.
- Roadmap order: **C** 3D rigid-joint frame + P-Delta (gravity first, compare with current results) → **B** wind / seismic /
  WSD combinations (slot: step 6 tab "ลม / แผ่นดินไหว / Combination") → Q4 curved beams. Update `CLAUDE.md` when this changes.

## 2. Non-negotiables
1. **Diff-tested formulas are frozen**: `engine/beam.js, slab.js, column.js, footing.js, roofDesign.js`. Reuse them; do not edit.
   If one truly must change → re-run the Excel diff on the Windows PC (rea-lab) and record the run (see `D:\REA\CLAUDE.md`).
2. Learn from the user's Excel by behaviour only — never copy its layout, text or VBA. Never commit the `.xlsm`.
3. **Results must not change silently.** UI / refactor work keeps `node cli/regress-yasothon.mjs` identical. An intended
   engine change: explain the difference, then `--save` the new baseline in the same commit.
4. Old project files must keep opening (migrate in `App.jsx mergeFrame` / `mergeRoof`; never drop fields users saved).
5. An analysis error must never blank the app (App `fres` try/catch → warning).
6. Real engineering results stay visible: a failing member shows **why** (e.g. tie spacing > 16db); do not hide or relax a
   code check to make the screen green. Simplifications (pinned continuous beams, chord for curves, …) are stated in code
   comments, CLAUDE.md and the report.
7. No `window.alert/confirm` (freezes the browser test tab) — inline notices only.
8. Reports: Thai-first, plain, professional; **no** "must be certified by a licensed engineer" sentence.

## 3. Procedure for every change
1. **Plan** — think the whole request through; for big UX or engine changes post a short plan and get the user's OK.
2. **Engine first** (pure JS in `web/engine`, testable in node), then UI.
3. **Tests** — add or extend a `cli/*-check.mjs` with closed-form or equilibrium checks for new engine behaviour.
   Gate before any commit:
   ```
   node cli/contbeam-check.mjs && node cli/floor-check.mjs && node cli/floor-loads-check.mjs && node cli/frame-check.mjs && node cli/frame3d-check.mjs && node cli/lateral-check.mjs && node cli/arc-check.mjs && node cli/regress-yasothon.mjs
   cd web && npx vite build
   ```
4. **Browser check** (dev server `structcalc-web`, http://localhost:5180): open
   `/?project=/projects/yasothon.json#work`, go through the steps you touched, check the console has no errors, and use a
   **separate tab** (the user may be working in the main one; back up localStorage `structcalc.frame` / `structcalc.roof`).
5. **Report** — if output changed: `python -X utf8 cli/pdf_export.py work out.pdf "http://localhost:5180/?project=/projects/yasothon.json"`.
6. **Hand-off** — update `CLAUDE.md` (what was built, data fields, results, next steps). Then commit (only when the user asks).

## 4. Code conventions
- Match the surrounding code: dense functional JS, short English comments explaining *why*, Thai only in UI / report text.
- Units: engine m, kg, kg-m (sections cm / ksc where the WSD engines use them); say the unit in the comment.
- Data lives in the project JSON (`frame`, `roof`, …) + localStorage; every new field needs a default and a migration.
- Every user edit goes through App `setFrame` / `setRoof` (project-wide undo). Components do not keep their own undo.
- Labels on the plan: short (tags), full text on hover; only the active step's labels.

## 5. Two accounts working on one repo
- Before starting: `git pull`, read `CLAUDE.md` + this skill, run the test gate (it must pass before you change anything).
- One branch per piece of work (`feature/<topic>`); merge to `main` only with the gate green. Do not work on the same files
  on both accounts at the same time — split by step / module.
- End of a session: gate green → update `CLAUDE.md` → commit → push, so the other account starts from the same state.
- Disagreements about direction are decided by the user and written into section 1 of this file.
