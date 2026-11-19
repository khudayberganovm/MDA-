#!/usr/bin/env python3
"""MOTION AI ops MCP server (Streamable HTTP, JSON responses, stdlib only).

Exposed through Caddy at https://<domain>/ops/<MCP_SECRET>. Anyone with that URL
can use these tools, so they are deliberately narrow: no arbitrary shell, env
values are never returned, and only whitelisted env keys can be changed.
"""
import json
import os
import re
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEPLOY_ENV = ROOT / "deploy" / ".env"
APP_ENV = ROOT / ".env.prod"
DEPLOY_LOG = Path.home() / "deploy.log"
COMPOSE = ["docker", "compose", "-f", str(ROOT / "deploy" / "docker-compose.aws.yml")]
SERVICES = ("app", "caddy")
PORT = int(os.environ.get("OPS_MCP_PORT", "8090"))

EDITABLE_KEYS = {
    "BOT_TOKEN", "ADMIN_IDS", "ADMIN_CHAT_ID", "SUPPORT_USERNAME", "REVISIONS_PER_ORDER",
    "PAYME_MERCHANT_ID", "PAYME_KEY", "PAYME_TEST",
    "CLICK_SERVICE_ID", "CLICK_MERCHANT_ID", "CLICK_SECRET_KEY",
    "MANUAL_PAY_INFO",
}
SECRET_LIKE = re.compile(r"KEY|TOKEN|SECRET")


def read_env(path: Path) -> dict:
    out = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip()
    return out


SECRET = read_env(DEPLOY_ENV).get("MCP_SECRET", "")
if len(SECRET) < 32:
    raise SystemExit("MCP_SECRET missing or too short in deploy/.env")


def run(cmd, timeout=60) -> str:
    try:
        p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
        return (p.stdout + p.stderr).strip() or f"(exit {p.returncode}, no output)"
    except subprocess.TimeoutExpired:
        return f"timeout after {timeout}s"


def tail(path: Path, n: int) -> str:
    if not path.exists():
        return "(no log yet)"
    return "\n".join(path.read_text(errors="replace").splitlines()[-n:])


# ---- tools ---------------------------------------------------------------

def t_status(_):
    return "\n\n".join([
        "## containers\n" + run(COMPOSE + ["ps", "--format", "{{.Service}}\t{{.Status}}"]),
        "## deployed commit\n" + run(["git", "log", "-1", "--format=%h %s (%cr)"]),
        "## memory\n" + run(["free", "-h"]),
        "## disk\n" + run(["df", "-h", "/"]),
        "## url\nhttps://" + read_env(DEPLOY_ENV).get("DOMAIN", "?"),
    ])


def t_logs(a):
    svc = a.get("service", "app")
    if svc not in SERVICES:
        raise ValueError(f"service must be one of {SERVICES}")
    lines = max(1, min(int(a.get("lines", 100)), 1000))
    out = run(COMPOSE + ["logs", "--no-color", "--tail", str(lines), svc])
    if a.get("grep"):
        rx = re.compile(a["grep"], re.I)
        out = "\n".join(l for l in out.splitlines() if rx.search(l)) or "(no matching lines)"
    return out


def t_redeploy(_):
    subprocess.Popen(
        ["/bin/bash", "-c", f"{ROOT}/deploy/update.sh --force >> {DEPLOY_LOG} 2>&1"],
        cwd=ROOT, start_new_session=True,
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return "Redeploy started (git pull origin/main + docker build, about 2-5 min). Check progress with deploy_log."


def t_deploy_log(a):
    return tail(DEPLOY_LOG, max(1, min(int(a.get("lines", 60)), 500)))


def t_restart(a):
    svc = a.get("service", "app")
    if svc not in SERVICES:
        raise ValueError(f"service must be one of {SERVICES}")
    return run(COMPOSE + ["restart", svc], timeout=120) or "restarted"


def t_env_status(_):
    env = read_env(APP_ENV)
    rows = []
    for k, v in env.items():
        shown = ("set" if v else "EMPTY") if SECRET_LIKE.search(k) else (v or "EMPTY")
        rows.append(f"{k}={shown}")
    return "\n".join(rows)


def t_set_env(a):
    updates = a.get("values") or {}
    if not isinstance(updates, dict) or not updates:
        raise ValueError("values must be a non-empty object {KEY: value}")
    for k, v in updates.items():
        if k not in EDITABLE_KEYS:
            raise ValueError(f"{k} is not editable. Allowed: {sorted(EDITABLE_KEYS)}")
        if not isinstance(v, str) or "\n" in v or "\r" in v:
            raise ValueError(f"{k}: value must be a single-line string")
    lines = APP_ENV.read_text().splitlines() if APP_ENV.exists() else []
    seen = set()
    for i, line in enumerate(lines):
        k = line.split("=", 1)[0].strip()
        if k in updates:
            lines[i] = f"{k}={updates[k]}"
            seen.add(k)
    lines += [f"{k}={v}" for k, v in updates.items() if k not in seen]
    APP_ENV.write_text("\n".join(lines) + "\n")
    os.chmod(APP_ENV, 0o600)
    out = run(COMPOSE + ["up", "-d", "app"], timeout=180)
    return f"Updated: {', '.join(updates)}. App container recreated.\n{out}"


TOOLS = {
    "status": (t_status, "Server and MOTION AI status: containers, deployed git commit, RAM, disk, public URL.",
               {"type": "object", "properties": {}}),
    "logs": (t_logs, "Recent logs of a service (app = api+bot+worker, caddy = HTTPS proxy).",
             {"type": "object", "properties": {
                 "service": {"type": "string", "enum": list(SERVICES), "default": "app"},
                 "lines": {"type": "integer", "default": 100, "maximum": 1000},
                 "grep": {"type": "string", "description": "Optional regex filter (case-insensitive)"}}}),
    "redeploy": (t_redeploy, "Force git pull of origin/main and rebuild/restart now (normally automatic within 1 min of a push to main).",
                 {"type": "object", "properties": {}}),
    "deploy_log": (t_deploy_log, "Tail of the auto-deploy log (build output, deployed commits).",
                   {"type": "object", "properties": {"lines": {"type": "integer", "default": 60}}}),
    "restart": (t_restart, "Restart a service without rebuilding.",
                {"type": "object", "properties": {"service": {"type": "string", "enum": list(SERVICES), "default": "app"}}}),
    "env_status": (t_env_status, "List app settings in .env.prod. Secret values are shown only as set/EMPTY.",
                   {"type": "object", "properties": {}}),
    "set_env": (t_set_env, "Set app settings (BOT_TOKEN, ADMIN_IDS, ADMIN_CHAT_ID, SUPPORT_USERNAME, payment settings) and recreate the app container.",
                {"type": "object", "required": ["values"], "properties": {
                    "values": {"type": "object", "additionalProperties": {"type": "string"},
                               "description": "Map of KEY to new value, e.g. {\"ADMIN_IDS\": \"123456789\"}"}}}),
}


def handle_rpc(msg):
    mid, method, params = msg.get("id"), msg.get("method", ""), msg.get("params") or {}
    if mid is None:  # notification
        return None
    try:
        if method == "initialize":
            result = {
                "protocolVersion": params.get("protocolVersion", "2025-06-18"),
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "motion-ai-ops", "version": "1.0.0"},
                "instructions": "Operate the MOTION AI Telegram bot server on AWS EC2. "
                                "Code deploys automatically within ~1 minute of a push to main of khudayberganovm/MDA-.",
            }
        elif method == "ping":
            result = {}
        elif method == "tools/list":
            result = {"tools": [{"name": n, "description": d, "inputSchema": s} for n, (_, d, s) in TOOLS.items()]}
        elif method == "tools/call":
            name = params.get("name")
            if name not in TOOLS:
                return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32602, "message": f"unknown tool {name}"}}
            try:
                text, err = TOOLS[name][0](params.get("arguments") or {}), False
            except Exception as e:  # tool-level error
                text, err = f"Error: {e}", True
            result = {"content": [{"type": "text", "text": text[-60000:]}], "isError": err}
        else:
            return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": f"method not found: {method}"}}
        return {"jsonrpc": "2.0", "id": mid, "result": result}
    except Exception as e:
        return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32603, "message": str(e)}}


class Handler(BaseHTTPRequestHandler):
    def _authorized(self):
        return self.path.split("?")[0].rstrip("/") == f"/ops/{SECRET}"

    def _send(self, code, body=None):
        data = json.dumps(body).encode() if body is not None else b""
        self.send_response(code)
        if body is not None:
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if not self._authorized():
            return self._send(404, {"error": "not found"})
        try:
            msg = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"null")
        except ValueError:
            return self._send(400, {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "parse error"}})
        if isinstance(msg, list):
            out = [r for r in (handle_rpc(m) for m in msg) if r]
            return self._send(200, out) if out else self._send(202)
        r = handle_rpc(msg if isinstance(msg, dict) else {})
        return self._send(200, r) if r else self._send(202)

    def do_GET(self):
        self._send(405 if self._authorized() else 404)

    def do_DELETE(self):
        self._send(200 if self._authorized() else 404)

    def log_message(self, fmt, *args):  # keep the secret path out of journald
        print(f"{self.command} {self.address_string()} -> {args[1] if len(args) > 1 else ''}", flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
