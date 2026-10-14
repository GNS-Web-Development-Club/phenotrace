#!/usr/bin/env python
"""PhenoTrace launcher.

Runs the local backend (which also serves the built SPA) on loopback, and by
default opens it in your browser. Build the frontend first:

    npm --prefix frontend run build
    python run.py                 # opens http://127.0.0.1:8765/
    python run.py --no-browser
    python run.py --window        # native window via pywebview, if installed
"""
from __future__ import annotations

import os
import sys
import threading
import time
import webbrowser

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from phenotrace.config import HOST, PORT, frontend_dist  # noqa: E402
from phenotrace.main import app  # noqa: E402

URL = f"http://{HOST}:{PORT}/"


def _serve() -> None:
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


def main() -> None:
    if not frontend_dist().exists():
        print(
            "warning: frontend not built — serving API only.\n"
            "         run `npm --prefix frontend run build` for the full UI.\n"
        )

    if "--window" in sys.argv:
        try:
            import webview  # type: ignore
        except ImportError:
            print("pywebview not installed (`pip install pywebview`); falling back to browser.")
        else:
            threading.Thread(target=_serve, daemon=True).start()
            time.sleep(1.0)
            webview.create_window("PhenoTrace", URL, width=1200, height=900)
            webview.start()
            return

    if "--no-browser" not in sys.argv:
        threading.Thread(
            target=lambda: (time.sleep(1.2), webbrowser.open(URL)), daemon=True
        ).start()

    _serve()


if __name__ == "__main__":
    main()
