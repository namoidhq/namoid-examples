#!/usr/bin/env python3
"""Check the four things an MCP client checks, before you plug in a real client.

Run the server, then ``python scripts/verify.py``. Every line is one protocol
requirement, so a failure points at the exact step that is misconfigured.

    MCP_BASE_URL   where this process listens (default http://localhost:3005)
    NAMOID_ISSUER / NAMOID_MCP_RESOURCE   read from .env if not already set
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

import httpx

failures = 0


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        match = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)$", line)
        if not match:
            continue
        key, raw_value = match.groups()
        os.environ.setdefault(key, raw_value.strip().strip("\"'"))


def require_env(name: str) -> str:
    value = (os.environ.get(name) or "").strip()
    if not value:
        sys.exit(f"{name} is required. Copy .env.example to .env and fill it in.")
    return value


def check(label: str, run) -> None:
    global failures
    try:
        print(f"  ok    {label}\n        {run()}")
    except Exception as exc:  # noqa: BLE001 - a failed check is reported, not raised
        failures += 1
        print(f"  FAIL  {label}\n        {exc}")


def metadata_path(resource: str) -> str:
    """RFC 9728 inserts the well-known segment between authority and path."""
    path = urlsplit(resource).path
    suffix = "" if path in ("", "/") else path.rstrip("/")
    return f"/.well-known/oauth-protected-resource{suffix}"


def post_mcp(token: str | None = None) -> httpx.Response:
    headers = {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
    }
    if token:
        headers["authorization"] = f"Bearer {token}"
    return httpx.post(
        f"{BASE_URL}{MCP_PATH}",
        headers=headers,
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
        timeout=10.0,
    )


load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BASE_URL = (os.environ.get("MCP_BASE_URL") or "http://localhost:3005").rstrip("/")
ISSUER = require_env("NAMOID_ISSUER").rstrip("/")
RESOURCE = require_env("NAMOID_MCP_RESOURCE")
MCP_PATH = urlsplit(RESOURCE).path or "/"
METADATA_PATH = metadata_path(RESOURCE)


def check_server_running() -> str:
    # FastMCP has no unauthenticated health route, so the metadata document
    # doubles as the liveness probe.
    response = httpx.get(f"{BASE_URL}{METADATA_PATH}", timeout=10.0)
    if response.status_code != 200:
        raise RuntimeError(f"GET {METADATA_PATH} returned {response.status_code}")
    return BASE_URL


def check_discovery() -> str:
    url = f"{ISSUER}/.well-known/oauth-authorization-server"
    response = httpx.get(url, headers={"accept": "application/json"}, timeout=10.0)
    if response.status_code != 200:
        raise RuntimeError(f"GET {url} returned {response.status_code}")
    document = response.json()
    if document.get("issuer") != ISSUER:
        raise RuntimeError(f"issuer mismatch: expected {ISSUER}, document says {document.get('issuer')}")
    pkce = ",".join(document.get("code_challenge_methods_supported") or [])
    cimd = "yes" if document.get("client_id_metadata_document_supported") is True else "no"
    return f"{document['issuer']} (PKCE {pkce}, CIMD {cimd})"


def check_protected_resource_metadata() -> str:
    response = httpx.get(f"{BASE_URL}{METADATA_PATH}", timeout=10.0)
    if response.status_code != 200:
        raise RuntimeError(f"GET {METADATA_PATH} returned {response.status_code}")
    document = response.json()
    if document.get("resource") != RESOURCE:
        raise RuntimeError(f"metadata resource is {document.get('resource')}, expected {RESOURCE}")
    servers = document.get("authorization_servers") or []
    if ISSUER not in [str(server).rstrip("/") for server in servers]:
        raise RuntimeError(f"metadata does not list {ISSUER} as an authorization server")
    scopes = " ".join(document.get("scopes_supported") or [])
    return f"{document['resource']} -> {', '.join(str(s) for s in servers)} [{scopes}]"


def check_unauthenticated_challenge() -> str:
    response = post_mcp()
    if response.status_code != 401:
        raise RuntimeError(f"expected 401, received {response.status_code}")
    challenge = response.headers.get("www-authenticate", "")
    if not challenge.lower().startswith("bearer"):
        raise RuntimeError("WWW-Authenticate is missing or is not a Bearer challenge")
    if "resource_metadata=" not in challenge:
        raise RuntimeError("WWW-Authenticate does not point at resource_metadata")
    return challenge


def check_forged_token_rejected() -> str:
    response = post_mcp("not-a-real-token")
    if response.status_code != 401:
        raise RuntimeError(f"expected 401, received {response.status_code}")
    return response.headers.get("www-authenticate", "401 without a challenge header")


check("server is running", check_server_running)
check("NamoID discovery is reachable", check_discovery)
check("protected-resource metadata is published", check_protected_resource_metadata)
check("unauthenticated call returns a discovery challenge", check_unauthenticated_challenge)
check("a forged token is rejected", check_forged_token_rejected)

print("")
if failures:
    print(f"{failures} check(s) failed.")
    sys.exit(1)
print("All checks passed. The resource-server half of the flow is correct.")
print(f"Connect a client at {RESOURCE} using a preregistered Client ID or a")
print('Client ID Metadata Document — see "Connect an MCP client" in the README.')
