---
name: structcalc-ui-test
description: Hands-on test of the StructCalc web app the way an engineer uses it — build a house from an empty project by clicking in a real browser, step 0 → 10, and log every problem. Use before a release, after any UI change, or when the user asks to "try / test / audit the program".
---

# StructCalc — hands-on UI test (any AI / any account)

**Cheapest first (user: save tokens):** run the automated browser test before any hand test —
`D:\REAea-lab\.venv\Scripts\python.exe -X utf8 cli/e2e/run.py` (dev server on :5180; Playwright drives the installed Edge, ~2 min,
prints one summary line + only the failures; screenshots in rea-lab/results/e2e-*/; `--save` after an intended result change).
It covers every step of each test project (1920 light + 1366 dark: error box, NaN/undefined/Infinity, horizontal overflow, console,
HTTP errors, status numbers vs cli/e2e/expected.json) and a new project built through the UI (grid, auto columns/beams, copy floor,
roof from structure, diagrams, report, save → new → open, restore). Use the hand test below only for what a script cannot judge
(is it confusing? is something missing?) — small screenshots, batched actions.

Read `CLAUDE.md` and `.claude/skills/structcalc-dev/SKILL.md` first. This skill is the **test procedure**; the release plan is
`docs/release-plan.md`; every finding goes into `docs/test-log.md` (append, newest on top, never delete).

## Rules
- Test in a real browser by **clicking and typing** like a user (Chrome via Claude in Chrome when the user asks for Chrome; else the
  built-in browser). Scripts (`javascript_tool`) only to read state / confirm a result — never to do the user's clicks for them.
- Start from **โครงการใหม่** (empty project), not from the Yasothon example. Back up nothing — a new project is the test.
- One finding = one line in `docs/test-log.md`: date · step · what you did · what happened · expected · severity (บล็อก / สำคัญ / เล็ก) ·
  fixed in commit … (or "open").
- After fixing: re-run the step that failed **and** the whole test once more (fixes break other steps).
- Screen sizes: 1920×1080 and 1366×768; light and dark theme. Console must have no errors (`read_console_messages`, onlyErrors).
- Never use `window.alert/confirm` in fixes (freezes the test tab).

## Script (a small 2-storey house, 2 bays × 2 bays, one cantilever balcony)
0. **โครงการใหม่** → ข้อมูลโครงการ: name, owner, engineer · materials · choose lateral loads (wind yes / earthquake no).
1. **กริด / ระดับชั้น**: grid X 4, 4 · Y 3.5, 4 · floors คานคอดิน 0.8 / ชั้น 2 3.2 / คานหลังคา 3.0.
2. **โครงสร้าง**: floor by floor bottom → top: columns on all grid nodes (button or clicks), beams on all grid lines, one secondary beam,
   one cantilever beam 1.2 m, one curved beam (¼ circle); set one beam type by hand; Ctrl+Z / Ctrl+Y once each.
3. **พื้น**: each panel kind S / PS (direction) / GS; one open panel (stair well); one cantilever slab.
4. **บันได**: one stair with a landing.
5. **หลังคา**: draw the wall outline, columns, plates, hip roof; link the roof loads to the top floor.
6. **น้ำหนักบรรทุก**: walls on beams and on a slab, a double wall; a railing line load; a point load; check the group summary;
   wind inputs → floor forces and drift table appear.
7. **วิเคราะห์**: beam force diagram for several lines (dropdown and clicking a beam); column forces tab; method comparison tab.
8. **ออกแบบ**: beams / columns / slabs tabs; make one member fail and read the reason; add a type that fixes it.
9. **ฐานราก**: results for every column.
10. **รายการคำนวณ**: preview, then print / save PDF; every section present, no "NaN", figures render.
11. **ไฟล์**: บันทึก (Ctrl+S) → โครงการใหม่ → เปิด the saved file → results identical; บันทึกเป็น… a second name; reload the page → work still there.

## What to look for (not only bugs)
- Can a first-time user find the next action without reading code? Is the step guide bar enough?
- Missing tools (copy floor, move many, mirror, measure, numeric input, delete many, DXF), missing inputs that the Excel had
  (e.g. footing choices), confusing words, numbers without units, tables too wide, things that need too many clicks.
- Results that look wrong to an engineer (signs, magnitudes, a member passing that obviously should not).

## Report to the user
Thai, short: what was tested, findings table (open / fixed), what needs their decision, next step.
