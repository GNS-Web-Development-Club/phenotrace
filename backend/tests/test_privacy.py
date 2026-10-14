"""Privacy audit (CI guard).

PhenoTrace is local-only: patient VCFs never leave the machine and the runtime
performs no outbound network I/O. This test statically scans every module in the
runtime package and FAILS if any of them imports a network client library.

The single place a real build is *permitted* to fetch (the explicit
"download databases" action) would be listed in ALLOW — in v1 there is no network
code anywhere, so ALLOW is empty and the whole package must be clean.
"""
from __future__ import annotations

import ast
import pathlib

PKG = pathlib.Path(__file__).resolve().parents[1] / "phenotrace"

# Outbound/client network libraries. (Not the local ASGI server — uvicorn is only
# imported lazily inside main()/run and binds loopback; we scan our own modules.)
_NET_ROOTS = {
    "requests",
    "httpx",
    "aiohttp",
    "urllib3",
    "ftplib",
    "smtplib",
    "telnetlib",
    "socket",
    "websockets",
    "pycurl",
}

# Modules explicitly allowed to perform the user-initiated database download.
ALLOW: set[str] = set()


def _network_imports(path: pathlib.Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for n in node.names:
                root = n.name.split(".")[0]
                if root in _NET_ROOTS:
                    found.add(n.name)
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            root = mod.split(".")[0]
            if root in _NET_ROOTS or (root == "urllib" and "request" in mod):
                found.add(mod)
    return found


def test_no_network_code_in_runtime_path():
    offenders: dict[str, set[str]] = {}
    for p in PKG.rglob("*.py"):
        rel = p.relative_to(PKG).as_posix()
        if rel in ALLOW:
            continue
        net = _network_imports(p)
        if net:
            offenders[rel] = net
    assert not offenders, f"Network code reachable from runtime path: {offenders}"


def test_server_binds_loopback_only():
    from phenotrace.config import HOST
    from phenotrace.main import _LOOPBACK

    assert HOST in _LOOPBACK
    assert HOST in {"127.0.0.1", "localhost", "::1"}
