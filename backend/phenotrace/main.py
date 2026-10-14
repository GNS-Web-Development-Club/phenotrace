"""FastAPI application entry point.

Serves the API and (in production) the built React SPA, bound strictly to
loopback. There is a hard assertion against binding to a non-loopback host —
patient data must never be reachable off-machine.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.routes import router
from .config import HOST, PORT, frontend_dist

_LOOPBACK = {"127.0.0.1", "localhost", "::1"}


def create_app() -> FastAPI:
    app = FastAPI(title="PhenoTrace", version="0.1.0")

    # Dev convenience: the Vite dev server (5173) calls the API on 8765.
    # In production the SPA is same-origin (served below) so CORS is moot.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)

    dist = frontend_dist()
    if dist.exists():
        # html=True -> serves index.html at "/" and for client-side routes.
        app.mount("/", StaticFiles(directory=str(dist), html=True), name="spa")

    return app


app = create_app()


def main() -> None:
    import uvicorn

    if HOST not in _LOOPBACK:
        raise RuntimeError(
            f"Refusing to bind to non-loopback host {HOST!r}: PhenoTrace is local-only."
        )
    uvicorn.run(app, host=HOST, port=PORT)


if __name__ == "__main__":
    main()
