"""End-to-end test of the StructCalc web app in a real browser (Edge via Playwright), cheap to read: prints only a summary
and the failures. Screenshots of every step go to rea-lab/results/e2e-<time>/ (look at them only when a check fails).

usage (dev server running on :5180):  D:\\REA\\rea-lab\\.venv\\Scripts\\python.exe -X utf8 cli/e2e/run.py [--save]
  --save  store the current project results as the expected values (cli/e2e/expected.json); otherwise they are compared
What is checked
  A every workflow step of each test project at 1920×1080 light and 1366×768 dark: no error box, no NaN / undefined,
    no horizontal overflow, no console error; status numbers (beams / columns / footings passing, base load) vs expected
  B a new project built only through the UI: grid typed, columns + beams by the auto buttons, copy floor below, columns only,
    roof from the structure, analysis diagram, report figures, save → new → open (same results), new → restore (same results)
"""
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
BASE = "http://localhost:5180"
LAB = Path(r"D:\REA\rea-lab\results")
OUT = LAB / f"e2e-{datetime.now():%Y%m%d-%H%M%S}"
EXPECTED = Path(__file__).with_name("expected.json")
PROJECTS = [p for p in ["yasothon", "_ole"] if (ROOT / "web/public/projects" / f"{p}.json").exists()]
STEPS = ["ข้อมูลโครงการ", "กริด / ระดับชั้น", "โครงสร้าง", "พื้น", "บันได", "หลังคา", "น้ำหนักบรรทุก", "วิเคราะห์", "ออกแบบสมาชิก", "ฐานราก", "รายการคำนวณ"]
results, console_errors = [], []


def check(name, ok, detail=""):
    results.append({"name": name, "ok": bool(ok), "detail": detail})


def status(page):
    t = page.inner_text("body")
    m = re.search(r"คาน (\d+)/(\d+) ผ่าน\s+เสา (\d+)/(\d+) ผ่าน\s+ฐานราก (\d+)/(\d+)\s+แรงที่ฐานรวม ([\d.,]+) ตัน", t)
    return {"beams": f"{m[1]}/{m[2]}", "columns": f"{m[3]}/{m[4]}", "footings": f"{m[5]}/{m[6]}", "base_t": float(m[7].replace(",", ""))} if m else None


def wait_status(page, timeout=15):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = status(page)
        if s and s["beams"] != "0/0":
            return s
        page.wait_for_timeout(300)
    return status(page)


def step(page, label):
    page.click(f"aside button:has-text('{label}')")
    page.wait_for_timeout(700 if label != "รายการคำนวณ" else 6000)


def page_problems(page):
    return page.evaluate("""() => {
      const t = document.querySelector('main')?.innerText ?? document.body.innerText, r = [...document.querySelectorAll('.report')].map((x) => x.innerText).join(' ');
      const p = [];
      if (/เกิดข้อผิดพลาด/.test(t + r)) p.push('error box');
      const m = /\\bNaN\\b|undefined|Infinity/.exec(t + r); if (m) p.push('bad value: ' + (t + r).slice(Math.max(0, m.index - 60), m.index + 12).replace(/\\s+/g, ' '));
      if (document.documentElement.scrollWidth > innerWidth + 2) p.push(`horizontal overflow ${document.documentElement.scrollWidth}>${innerWidth}`);
      return p;
    }""")


def new_page(browser, w, h, dark=False):
    ctx = browser.new_context(viewport={"width": w, "height": h}, color_scheme="dark" if dark else "light", accept_downloads=True)
    # no native file dialogs in a test: Save As falls back to a download, Open to the file input
    ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; try { localStorage.setItem('structcalc.tour', '1'); } catch {}")
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and "[vite]" not in m.text and "/@fs/" not in m.text and console_errors.append(m.text[:200]))
    page.on("pageerror", lambda e: console_errors.append(f"pageerror: {str(e)[:200]}"))
    page.on("response", lambda r: r.status >= 400 and console_errors.append(f"HTTP {r.status} {r.url[:120]}"))
    return ctx, page


def test_projects(browser, expected, save):
    got = {}
    for proj in PROJECTS:
        for w, h, dark in [(1920, 1080, False), (1366, 768, True)]:
            tag = f"{proj}@{w}{'-dark' if dark else ''}"
            ctx, page = new_page(browser, w, h, dark)
            n0 = len(console_errors)
            page.goto(f"{BASE}/?project=/projects/{proj}.json&step=project#work")
            s = wait_status(page)
            check(f"{tag}: opens", s is not None, "no status bar")
            if w == 1920:
                got[proj] = s
            for i, label in enumerate(STEPS):
                step(page, label)
                probs = page_problems(page)
                check(f"{tag}: step {i} {label}", not probs, ", ".join(probs))
                page.screenshot(path=str(OUT / f"{tag}-{i:02d}.png"))
                if label == "วิเคราะห์":
                    check(f"{tag}: force diagram shown", page.locator("svg[viewBox='0 0 680 300']").count() > 0)
                if label == "รายการคำนวณ":
                    figs = page.locator(".report figure").count()
                    check(f"{tag}: report figures", figs > 20, f"{figs} figures")
            check(f"{tag}: console clean", len(console_errors) == n0, "; ".join(dict.fromkeys(console_errors[n0:]).keys()))
            ctx.close()
    for proj, s in got.items():
        if save:
            expected[proj] = s
        elif proj in expected:
            check(f"{proj}: results = expected", s == expected[proj], f"got {s} expected {expected[proj]}")
    return got


def test_new_project(browser, expected, save):
    ctx, page = new_page(browser, 1600, 900)
    n0 = len(console_errors)
    page.goto(f"{BASE}/?step=project#work")
    page.wait_for_timeout(1500)
    page.click("button[title^='โครงการใหม่']")
    page.wait_for_timeout(500)
    if page.locator("button:has-text('ทิ้งและเริ่มใหม่')").count():
        page.click("button:has-text('ทิ้งและเริ่มใหม่')")
    step(page, "กริด / ระดับชั้น")
    for label, val in [("แกน X", "4 3.5 4"), ("แกน Y", "3 4")]:
        box = page.locator(f"label:has-text('{label}') input")
        box.fill(val)
        box.press("Enter")
    step(page, "โครงสร้าง")
    floors = page.locator("header select option").all_inner_texts()
    sel = page.locator("header select")
    sel.select_option(index=0)
    page.click("button:has-text('เสาทุกโหนด')")
    page.click("button:has-text('คานตามกริด')")
    sel.select_option(index=1)
    page.click("button:has-text('คัดลอกชั้นล่าง')")
    if len(floors) > 2:
        sel.select_option(index=len(floors) - 1)
        page.click("button:has-text('เฉพาะเสา')")
    check("new: undo available after edits", page.locator("button[title^='ย้อนกลับ']").is_enabled())
    s = wait_status(page)
    check("new: model built from the UI", s and s["columns"].split("/")[1] != "0", str(s))
    step(page, "หลังคา")
    page.wait_for_timeout(1500)
    page.click("button:has-text('ใช้แปลนจากโครงสร้าง')")
    page.wait_for_timeout(5000)
    check("new: roof from structure", "หลังคาจากแปลนโครงสร้าง" in page.inner_text("header"), page.inner_text("header")[:200])
    card = page.locator("text=หลังคา → เสา").first.locator("xpath=..").inner_text()
    check("new: roof loads reach the columns", "ตัน ลง" in card, card[:160])
    step(page, "ออกแบบสมาชิก")
    s1 = wait_status(page)
    if save:
        expected["new"] = s1
    elif "new" in expected:
        check("new: results = expected", s1 == expected["new"], f"got {s1} expected {expected['new']}")
    page.locator("header select").select_option(index=1)  # a floor with slabs
    page.wait_for_timeout(600)
    for sub, what in [("พื้น / บันได", "input[type=number]"), ("ฐานราก", "text=เพิ่ม type ฐานราก")]:
        page.click(f"main button:has-text('{sub}')")
        page.wait_for_timeout(600)
        check(f"new: step 8 tab {sub} editable", page.locator(what).count() > 0 and not page_problems(page), ", ".join(page_problems(page)))
    page.click("text=เพิ่ม type ฐานราก")
    page.locator("main table").nth(1).locator("select").first.select_option(index=1)
    page.wait_for_timeout(1500)
    check("new: footing type picked", "F1" in page.inner_text("main"), "")
    check("new: footing drawings", page.locator("main figure svg").count() > 0)
    for sub in ["Type คาน", "Type เสา"]:
        page.click(f"main button:has-text('{sub}')")
        page.wait_for_timeout(800)
        check(f"new: {sub} section drawings", page.locator("main svg").count() > 3 and not page_problems(page), ", ".join(page_problems(page)))
    page.click("main button:has-text('ฐานราก')")
    page.wait_for_timeout(600)
    page.locator("button[title='ลบ type']").first.click()  # back to the built-in options (s1 was measured without types)
    page.wait_for_timeout(1500)
    page.locator("main table").nth(1).locator("select").first.select_option(index=0)  # back to auto (the saved file is compared with s1)
    page.wait_for_timeout(1500)
    step(page, "วิเคราะห์")
    check("new: force diagram", page.locator("svg[viewBox='0 0 680 300']").count() > 0)
    step(page, "รายการคำนวณ")
    check("new: report renders", not page_problems(page) and page.locator(".report figure").count() > 5, ", ".join(page_problems(page)))
    # save (download) → new → open the file → same results
    with page.expect_download() as dl:
        page.click("button:has-text('บันทึกเป็น')")
    f = OUT / "new-project.json"
    dl.value.save_as(f)
    check("new: save writes a project file", json.loads(f.read_text(encoding="utf-8")).get("app") == "StructCalc")
    page.click("button[title^='โครงการใหม่']")
    page.wait_for_timeout(800)
    step(page, "ออกแบบสมาชิก")
    check("new: New empties the model", (status(page) or {}).get("beams") in (None, "0/0"), str(status(page)))
    with page.expect_file_chooser() as fc:
        page.click("button[title^='เปิดไฟล์โครงการ']")
    fc.value.set_files(str(f))
    page.wait_for_timeout(1500)
    s2 = wait_status(page)
    check("new: open file gives the same results", s2 == s1, f"{s2} vs {s1}")
    # restore after New
    page.click("button[title^='โครงการใหม่']")
    page.wait_for_timeout(800)
    page.click("button:has-text('กู้คืน')")
    page.wait_for_timeout(1500)
    s3 = wait_status(page)
    check("new: restore after New", s3 == s1, f"{s3} vs {s1}")
    check("new: console clean", len(console_errors) == n0, "; ".join(dict.fromkeys(console_errors[n0:]).keys()))
    page.screenshot(path=str(OUT / "new-final.png"))
    ctx.close()


def main():
    save = "--save" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    expected = json.loads(EXPECTED.read_text(encoding="utf-8")) if EXPECTED.exists() else {}
    t0 = time.time()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        for fn in (test_projects, test_new_project):
            try:
                fn(browser, expected, save)
            except Exception as e:  # a harness failure is reported, not hidden
                check(f"{fn.__name__} crashed", False, str(e).splitlines()[0][:300])
        browser.close()
    if save:
        EXPECTED.write_text(json.dumps(expected, ensure_ascii=False, indent=1), encoding="utf-8")
    bad = [r for r in results if not r["ok"]]
    summary = {"kind": "e2e", "time": datetime.now().isoformat(timespec="seconds"), "dir": str(OUT), "checks": len(results), "failed": len(bad), "seconds": round(time.time() - t0)}
    (OUT / "summary.json").write_text(json.dumps({**summary, "results": results}, ensure_ascii=False, indent=1), encoding="utf-8")
    with open(LAB / "history.jsonl", "a", encoding="utf-8") as h:
        h.write(json.dumps(summary, ensure_ascii=False) + "\n")
    print(f"E2E {len(results) - len(bad)}/{len(results)} passed in {summary['seconds']} s · {OUT}")
    for r in bad:
        print(f"  FAIL {r['name']}: {r['detail']}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
