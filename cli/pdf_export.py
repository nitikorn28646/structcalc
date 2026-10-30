"""Export a module's calculation report to PDF via headless Edge + DevTools protocol (waits for Paged.js).

Usage: python pdf_export.py <module: beam|slab|column> <out.pdf> [base_url]
"""
import base64
import json
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = 9333


def main():
    mod, out = sys.argv[1], sys.argv[2]
    base = sys.argv[3] if len(sys.argv) > 3 else "http://localhost:5180/"
    prof = tempfile.mkdtemp(prefix="edge-pdf-")
    proc = subprocess.Popen([EDGE, "--headless=new", "--disable-gpu", f"--remote-debugging-port={PORT}",
                             f"--user-data-dir={prof}", "about:blank"])
    try:
        for _ in range(50):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json"))
                ws_url = next(t["webSocketDebuggerUrl"] for t in tabs if t["type"] == "page")
                break
            except Exception:
                time.sleep(0.2)
        ws = websocket.create_connection(ws_url, timeout=60)
        seq = iter(range(1, 10**6))

        def call(method, **params):
            i = next(seq)
            ws.send(json.dumps({"id": i, "method": method, "params": params}))
            while True:
                m = json.loads(ws.recv())
                if m.get("id") == i:
                    return m.get("result", {})

        call("Page.enable")
        call("Page.navigate", url=f"{base}?print#{mod}")
        for _ in range(120):  # Paged.js marks the title when done
            t = call("Runtime.evaluate", expression="document.title")["result"].get("value", "")
            if "[paged]" in t:
                break
            time.sleep(0.25)
        pages = call("Runtime.evaluate", expression="document.querySelectorAll('.pagedjs_page').length")["result"]["value"]
        pdf = call("Page.printToPDF", printBackground=True, preferCSSPageSize=True, marginTop=0, marginBottom=0,
                   marginLeft=0, marginRight=0)
        open(out, "wb").write(base64.b64decode(pdf["data"]))
        print(out, "paged pages:", pages)
    finally:
        proc.kill()


if __name__ == "__main__":
    main()
