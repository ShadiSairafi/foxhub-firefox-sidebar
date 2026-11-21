"""Real headless Firefox automation via Marionette (Python 3.12 stdlib only)."""

from __future__ import annotations

import atexit
import functools
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from typing import Any
from urllib.parse import unquote

DEFAULT_FIREFOX_PATH = r"C:\Program Files\Mozilla Firefox\firefox.exe"
STARTUP_TIMEOUT_S = 20.0
CMD_TIMEOUT_S = 15.0
QUIT_TIMEOUT_S = 5.0

_ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf"

SPECIAL_KEYS: dict[str, str] = {
    "control": "\ue009",
    "ctrl": "\ue009",
    "shift": "\ue008",
    "alt": "\ue00a",
    "meta": "\ue03d",
    "enter": "\ue007",
    "return": "\ue006",
    "escape": "\ue00c",
    "esc": "\ue00c",
    "backspace": "\ue003",
    "tab": "\ue004",
    "space": " ",
    "delete": "\ue017",
    "home": "\ue011",
    "end": "\ue010",
    "pageup": "\ue00e",
    "pagedown": "\ue00f",
    "arrowleft": "\ue012",
    "arrowup": "\ue013",
    "arrowright": "\ue014",
    "arrowdown": "\ue015",
}


class FirefoxHarnessError(RuntimeError):
    """Raised on harness lifecycle, transport, or script execution errors."""


class MarionetteError(FirefoxHarnessError):
    """Raised when Marionette returns a protocol error response."""

    def __init__(self, error_code: str, message: str, stacktrace: str = "") -> None:
        self.error_code = error_code
        self.message = message
        self.stacktrace = stacktrace
        detail = f"Marionette [{error_code}]: {message}"
        if stacktrace:
            detail += f"\n{stacktrace}"
        super().__init__(detail)


class MarionetteClient:
    """Minimal length-prefixed JSON Marionette v3 client over TCP."""

    def __init__(self) -> None:
        self._sock: socket.socket | None = None
        self._next_id = 1
        self._lock = threading.Lock()
        self._default_timeout = CMD_TIMEOUT_S

    @property
    def connected(self) -> bool:
        return self._sock is not None

    def connect(self, host: str, port: int, timeout: float = CMD_TIMEOUT_S) -> dict[str, Any]:
        self._default_timeout = timeout
        sock = socket.create_connection((host, port), timeout=timeout)
        sock.settimeout(timeout)
        self._sock = sock
        hello = self._recv_json()
        if not isinstance(hello, dict) or hello.get("marionetteProtocol") != 3:
            self.close()
            raise FirefoxHarnessError(f"Unexpected Marionette handshake: {hello!r}")
        return hello

    def set_default_timeout(self, timeout: float) -> None:
        self._default_timeout = timeout
        if self._sock is not None:
            self._sock.settimeout(timeout)

    def call(
        self,
        command: str,
        params: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> Any:
        if self._sock is None:
            raise FirefoxHarnessError("MarionetteClient is not connected")
        with self._lock:
            msgid = self._next_id
            self._next_id += 1
            payload = json.dumps([0, msgid, command, params or {}]).encode("utf-8")
            frame = f"{len(payload)}:".encode("ascii") + payload
            effective_timeout = self._default_timeout if timeout is None else timeout
            self._sock.settimeout(effective_timeout)
            try:
                self._sock.sendall(frame)
                resp = self._recv_json()
            finally:
                if self._sock is not None:
                    self._sock.settimeout(self._default_timeout)

        if not isinstance(resp, list) or len(resp) != 4 or resp[0] != 1:
            raise FirefoxHarnessError(f"Malformed Marionette response: {resp!r}")
        if resp[1] != msgid:
            raise FirefoxHarnessError(f"Marionette msgid mismatch: expected {msgid}, got {resp[1]}")
        err = resp[2]
        if err is not None:
            if isinstance(err, dict):
                raise MarionetteError(
                    str(err.get("error", "unknown")),
                    str(err.get("message", "")),
                    str(err.get("stacktrace", "")),
                )
            raise MarionetteError("unknown", str(err))
        return resp[3]

    def _recv_exact(self, n: int) -> bytes:
        assert self._sock is not None
        chunks: list[bytes] = []
        remaining = n
        while remaining > 0:
            chunk = self._sock.recv(remaining)
            if not chunk:
                raise FirefoxHarnessError("Marionette socket closed unexpectedly")
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

    def _recv_json(self) -> Any:
        assert self._sock is not None
        len_bytes = bytearray()
        while True:
            b = self._sock.recv(1)
            if not b:
                raise FirefoxHarnessError("Marionette socket closed while reading length")
            if b == b":":
                break
            if not b.isdigit() or len(len_bytes) >= 16:
                raise FirefoxHarnessError(f"Invalid Marionette length prefix: {bytes(len_bytes + b)!r}")
            len_bytes.extend(b)
        length = int(len_bytes.decode("ascii"))
        raw = self._recv_exact(length)
        return json.loads(raw.decode("utf-8"))

    def close(self) -> None:
        sock = self._sock
        self._sock = None
        if sock is not None:
            try:
                sock.close()
            except OSError:
                pass


def _kill_process_tree(pid: int) -> None:
    """Terminate a specific PID and its descendant process tree (never by image name)."""
    if pid <= 0:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(pid)],
            capture_output=True,
            text=True,
            timeout=10,
        )
    else:
        import signal

        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass


def get_child_pids(parent_pid: int) -> list[int]:
    """Return all live descendant PIDs for a given parent PID."""
    if parent_pid <= 0:
        return []
    if os.name != "nt":
        return []
    ps_cmd = (
        "$p = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId; "
        f"$queue = New-Object System.Collections.Generic.Queue[int]; $queue.Enqueue({int(parent_pid)}); "
        "$seen = New-Object System.Collections.Generic.HashSet[int]; "
        "$res = New-Object System.Collections.Generic.List[int]; "
        "while ($queue.Count -gt 0) { "
        "  $cur = $queue.Dequeue(); "
        "  foreach ($row in $p) { "
        "    if ([int]$row.ParentProcessId -eq $cur) { "
        "      $cid = [int]$row.ProcessId; "
        "      if ($seen.Add($cid)) { $res.Add($cid); $queue.Enqueue($cid) } "
        "    } "
        "  } "
        "} "
        "if ($res.Count -eq 0) { '[]' } else { ConvertTo-Json @($res) -Compress }"
    )
    proc = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps_cmd],
        capture_output=True,
        text=True,
        timeout=10,
    )
    out = (proc.stdout or "").strip()
    if not out:
        return []
    try:
        parsed = json.loads(out)
        if isinstance(parsed, int):
            return [parsed]
        if isinstance(parsed, list):
            return [int(x) for x in parsed]
    except (ValueError, TypeError):
        return []
    return []


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _resolve_firefox_binary(explicit: str | Path | None = None) -> Path:
    candidate = explicit or os.environ.get("FOXHUB_FIREFOX_BIN") or DEFAULT_FIREFOX_PATH
    path = Path(candidate)
    if not path.is_file():
        raise FirefoxHarnessError(f"Firefox binary not found at: {path}")
    return path


class HeadlessFirefox:
    """Headless Firefox automation harness using isolated profiles and Marionette."""

    _active_pids: set[int] = set()
    _registry_lock = threading.Lock()
    _atexit_registered = False

    def __init__(
        self,
        firefox_path: str | Path | None = None,
        startup_timeout: float = STARTUP_TIMEOUT_S,
        cmd_timeout: float = CMD_TIMEOUT_S,
    ) -> None:
        self._firefox_path = _resolve_firefox_binary(firefox_path)
        self._startup_timeout = float(startup_timeout)
        self._cmd_timeout = float(cmd_timeout)
        self.profile_dir: Path | None = None
        self.marionette_port: int | None = None
        self.proc: subprocess.Popen[bytes] | None = None
        self._stderr_path: Path | None = None
        self._stderr_file: Any = None
        self.client = MarionetteClient()
        self.session_id: str | None = None
        self._context = "content"
        self._closed = False
        self._register_atexit()

    @classmethod
    def _register_atexit(cls) -> None:
        with cls._registry_lock:
            if not cls._atexit_registered:
                atexit.register(cls._cleanup_active_pids)
                cls._atexit_registered = True

    @classmethod
    def _cleanup_active_pids(cls) -> None:
        with cls._registry_lock:
            pids = list(cls._active_pids)
            cls._active_pids.clear()
        for pid in pids:
            try:
                _kill_process_tree(pid)
            except Exception:
                pass

    @property
    def pid(self) -> int | None:
        return self.proc.pid if self.proc is not None else None

    def __enter__(self) -> "HeadlessFirefox":
        return self.start()

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self.close()

    def start(self) -> "HeadlessFirefox":
        if self.proc is not None:
            return self
        self._closed = False
        self.profile_dir = Path(tempfile.mkdtemp(prefix="foxhub_fx_"))
        self.marionette_port = _find_free_port()
        self._write_user_js(self.profile_dir, self.marionette_port)

        env = os.environ.copy()
        env["MOZ_REMOTE_ALLOW_SYSTEM_ACCESS"] = "1"
        env["MOZ_NO_REMOTE"] = "1"

        cmd = [
            str(self._firefox_path),
            "-headless",
            "-no-remote",
            "-profile",
            str(self.profile_dir),
            "--marionette",
        ]
        self._stderr_path = self.profile_dir / "firefox_stderr.log"
        self._stderr_file = open(self._stderr_path, "wb")
        try:
            self.proc = subprocess.Popen(
                cmd,
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=self._stderr_file,
            )
        except Exception:
            self._close_stderr_file()
            raise
        with self._registry_lock:
            self._active_pids.add(self.proc.pid)

        deadline = time.monotonic() + self._startup_timeout
        last_err: Exception | None = None
        while time.monotonic() < deadline:
            rc = self.proc.poll()
            if rc is not None:
                stderr_out = self._read_stderr_tail()
                self.close()
                raise FirefoxHarnessError(
                    f"Firefox exited prematurely with code {rc}: "
                    f"{stderr_out.decode('utf-8', errors='replace').strip()}"
                )
            remaining = deadline - time.monotonic()
            conn_timeout = min(self._cmd_timeout, max(0.05, remaining))
            try:
                self.client.connect("127.0.0.1", self.marionette_port, timeout=conn_timeout)
                self.client.set_default_timeout(self._cmd_timeout)
                break
            except OSError as exc:
                last_err = exc
                if time.monotonic() >= deadline:
                    break
                time.sleep(0.05)
        else:
            self.close()
            raise FirefoxHarnessError(
                f"Timed out waiting {self._startup_timeout}s for Marionette on port "
                f"{self.marionette_port}: {last_err}"
            )
        if not self.client.connected:
            self.close()
            raise FirefoxHarnessError(
                f"Timed out waiting {self._startup_timeout}s for Marionette on port "
                f"{self.marionette_port}: {last_err}"
            )

        try:
            sess = self.client.call("WebDriver:NewSession", {})
            self.session_id = sess.get("sessionId") if isinstance(sess, dict) else None
            self._context = "content"
        except Exception:
            self.close()
            raise
        return self

    @staticmethod
    def _write_user_js(profile_dir: Path, marionette_port: int) -> None:
        prefs = [
            f'user_pref("marionette.port", {int(marionette_port)});',
            'user_pref("browser.startup.page", 0);',
            'user_pref("browser.startup.homepage", "about:blank");',
            'user_pref("startup.homepage_welcome_url", "");',
            'user_pref("startup.homepage_welcome_url.additional", "");',
            'user_pref("browser.shell.checkDefaultBrowser", false);',
            'user_pref("media.autoplay.default", 0);',
            'user_pref("media.autoplay.blocking_policy", 0);',
            'user_pref("app.update.enabled", false);',
            'user_pref("app.update.auto", false);',
            'user_pref("toolkit.telemetry.enabled", false);',
            'user_pref("toolkit.telemetry.unified", false);',
            'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
            'user_pref("network.captive-portal-service.enabled", false);',
            'user_pref("browser.tabs.warnOnClose", false);',
            'user_pref("browser.sessionstore.resume_from_crash", false);',
            'user_pref("dom.disable_open_during_load", false);',
        ]
        (profile_dir / "user.js").write_text("\n".join(prefs) + "\n", encoding="utf-8")

    def _set_context(self, ctx: str) -> None:
        if ctx not in ("content", "chrome"):
            raise ValueError(f"Invalid Marionette context: {ctx}")
        if self._context != ctx:
            self.client.call("Marionette:SetContext", {"value": ctx})
            self._context = ctx

    def navigate(self, url: str) -> None:
        self._set_context("content")
        self.client.call("WebDriver:Navigate", {"url": str(url)})

    def eval_js(self, script: str, *args: Any) -> Any:
        self._set_context("content")
        res = self.client.call(
            "WebDriver:ExecuteScript",
            {"script": script, "args": list(args)},
        )
        return res.get("value") if isinstance(res, dict) else res

    evaluate_js = eval_js

    def eval_async_js(self, async_body: str, *args: Any, timeout_ms: int = 10000) -> Any:
        self._set_context("content")
        self.client.call("WebDriver:SetTimeouts", {"script": int(timeout_ms)})
        wrapped = (
            "const __done = arguments[arguments.length - 1];\n"
            "const __userArgs = Array.prototype.slice.call(arguments, 0, -1);\n"
            "try {\n"
            "  const __fn = async function() {\n"
            f"{async_body}\n"
            "  };\n"
            "  Promise.resolve(__fn.apply(this, __userArgs)).then(\n"
            "    (val) => __done({ __foxhub_ok: true, value: val === undefined ? null : val }),\n"
            "    (err) => __done({\n"
            "      __foxhub_ok: false,\n"
            "      error: String(err && err.message ? err.message : err),\n"
            "      name: err && err.name ? String(err.name) : 'Error',\n"
            "      stack: err && err.stack ? String(err.stack) : ''\n"
            "    })\n"
            "  );\n"
            "} catch (e) {\n"
            "  __done({ __foxhub_ok: false, error: String(e), name: e && e.name ? String(e.name) : 'Error' });\n"
            "}"
        )
        res = self.client.call(
            "WebDriver:ExecuteAsyncScript",
            {"script": wrapped, "args": list(args)},
            timeout=max(self._cmd_timeout, (timeout_ms / 1000.0) + 5.0),
        )
        val = res.get("value") if isinstance(res, dict) else res
        if isinstance(val, dict) and val.get("__foxhub_ok") is False:
            raise FirefoxHarnessError(
                f"Async JS {val.get('name', 'Error')}: {val.get('error')}\n{val.get('stack', '')}".rstrip()
            )
        if isinstance(val, dict) and val.get("__foxhub_ok") is True:
            return val.get("value")
        return val

    def set_viewport(self, width: int, height: int) -> dict[str, int]:
        w = int(width)
        h = int(height)
        self._set_context("content")
        self.client.call(
            "WebDriver:SetWindowRect",
            {"width": max(w + 40, 600), "height": max(h + 140, 400)},
        )
        self._set_context("chrome")
        try:
            chrome_script = (
                "const w = arguments[0], h = arguments[1];\n"
                "const win = Services.wm.getMostRecentWindow('navigator:browser');\n"
                "if (!win || !win.gBrowser || !win.gBrowser.selectedBrowser) {\n"
                "  return { ok: false, error: 'selectedBrowser unavailable' };\n"
                "}\n"
                "const b = win.gBrowser.selectedBrowser;\n"
                "b.style.setProperty('flex', 'none', 'important');\n"
                "b.style.setProperty('width', w + 'px', 'important');\n"
                "b.style.setProperty('min-width', w + 'px', 'important');\n"
                "b.style.setProperty('max-width', w + 'px', 'important');\n"
                "b.style.setProperty('height', h + 'px', 'important');\n"
                "b.style.setProperty('min-height', h + 'px', 'important');\n"
                "b.style.setProperty('max-height', h + 'px', 'important');\n"
                "const r = b.getBoundingClientRect();\n"
                "return { ok: true, width: r.width, height: r.height };"
            )
            chrome_res = self.client.call(
                "WebDriver:ExecuteScript",
                {"script": chrome_script, "args": [w, h]},
            )
            cval = chrome_res.get("value") if isinstance(chrome_res, dict) else chrome_res
            if isinstance(cval, dict) and cval.get("ok") is False:
                raise FirefoxHarnessError(f"Failed to set chrome viewport: {cval}")
        finally:
            self._set_context("content")
        dims = self.eval_async_js(
            "const targetW = arguments[0], targetH = arguments[1];\n"
            "if (window.innerWidth === targetW && window.innerHeight === targetH) {\n"
            "  return { width: window.innerWidth, height: window.innerHeight };\n"
            "}\n"
            "return await new Promise((resolve) => {\n"
            "  const deadline = performance.now() + 2000;\n"
            "  function check() {\n"
            "    if ((window.innerWidth === targetW && window.innerHeight === targetH) || performance.now() >= deadline) {\n"
            "      window.removeEventListener('resize', check);\n"
            "      resolve({ width: window.innerWidth, height: window.innerHeight });\n"
            "      return;\n"
            "    }\n"
            "    requestAnimationFrame(check);\n"
            "  }\n"
            "  window.addEventListener('resize', check);\n"
            "  requestAnimationFrame(check);\n"
            "});",
            w,
            h,
            timeout_ms=5000,
        )
        return {"width": int(dims["width"]), "height": int(dims["height"])}

    def reset_viewport(self) -> None:
        self._set_context("chrome")
        try:
            chrome_script = (
                "const win = Services.wm.getMostRecentWindow('navigator:browser');\n"
                "const b = win && win.gBrowser && win.gBrowser.selectedBrowser;\n"
                "if (!b) return false;\n"
                "for (const prop of ['flex', 'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height']) {\n"
                "  b.style.removeProperty(prop);\n"
                "}\n"
                "return true;"
            )
            self.client.call("WebDriver:ExecuteScript", {"script": chrome_script, "args": []})
        finally:
            self._set_context("content")

    def reset_to_blank(self) -> None:
        self.reset_viewport()
        self.navigate("about:blank")

    def find_element(self, css_selector: str) -> str:
        self._set_context("content")
        res = self.client.call(
            "WebDriver:FindElement",
            {"using": "css selector", "value": css_selector},
        )
        val = res.get("value") if isinstance(res, dict) else res
        if not isinstance(val, dict) or _ELEMENT_KEY not in val:
            raise FirefoxHarnessError(f"Element not found or malformed response for {css_selector!r}: {res!r}")
        return str(val[_ELEMENT_KEY])

    def click(self, css_selector: str) -> None:
        elem_id = self.find_element(css_selector)
        self.client.call("WebDriver:ElementClick", {"id": elem_id})

    def middle_click(self, css_selector: str) -> None:
        elem_id = self.find_element(css_selector)
        actions = [
            {
                "type": "pointer",
                "id": "mouse",
                "parameters": {"pointerType": "mouse"},
                "actions": [
                    {
                        "type": "pointerMove",
                        "duration": 0,
                        "origin": {_ELEMENT_KEY: elem_id},
                        "x": 0,
                        "y": 0,
                    },
                    {"type": "pointerDown", "button": 1},
                    {"type": "pointerUp", "button": 1},
                ],
            }
        ]
        self.client.call("WebDriver:PerformActions", {"actions": actions})
        self.client.call("WebDriver:ReleaseActions", {})

    def press_shortcut(
        self,
        key: str,
        ctrl: bool = False,
        shift: bool = False,
        alt: bool = False,
    ) -> None:
        self._set_context("content")
        resolved_key = SPECIAL_KEYS.get(key.lower(), key) if len(key) > 1 else key
        mods: list[str] = []
        if ctrl:
            mods.append(SPECIAL_KEYS["control"])
        if shift:
            mods.append(SPECIAL_KEYS["shift"])
        if alt:
            mods.append(SPECIAL_KEYS["alt"])

        key_actions: list[dict[str, str]] = []
        for mod in mods:
            key_actions.append({"type": "keyDown", "value": mod})
        key_actions.append({"type": "keyDown", "value": resolved_key})
        key_actions.append({"type": "keyUp", "value": resolved_key})
        for mod in reversed(mods):
            key_actions.append({"type": "keyUp", "value": mod})

        self.client.call(
            "WebDriver:PerformActions",
            {"actions": [{"type": "key", "id": "keyboard", "actions": key_actions}]},
        )
        self.client.call("WebDriver:ReleaseActions", {})

    def type_text(self, css_selector: str, text: str, clear: bool = True) -> None:
        elem_id = self.find_element(css_selector)
        if clear:
            self.client.call("WebDriver:ElementClear", {"id": elem_id})
        self.client.call("WebDriver:ElementSendKeys", {"id": elem_id, "text": text})

    def get_bounding_rect(self, css_selector: str) -> dict[str, Any] | None:
        return self.eval_js(
            "const el = document.querySelector(arguments[0]); return el ? el.getBoundingClientRect().toJSON() : null;",
            css_selector,
        )

    def get_computed_style(self, css_selector: str, props: list[str]) -> dict[str, str] | None:
        return self.eval_js(
            "const el = document.querySelector(arguments[0]);\n"
            "if (!el) return null;\n"
            "const cs = window.getComputedStyle(el);\n"
            "const out = {};\n"
            "for (const p of arguments[1]) out[p] = cs.getPropertyValue(p);\n"
            "return out;",
            css_selector,
            list(props),
        )

    def check_js_syntax(self, file_paths: list[Path | str]) -> list[dict[str, Any]]:
        """Compile JS files via SpiderMonkey ChromeUtils.compileScript (with ES module fallback)."""
        resolved_paths = [Path(p).resolve() for p in file_paths]
        results: list[dict[str, Any]] = []
        module_candidates: list[tuple[int, Path]] = []

        self._set_context("chrome")
        try:
            self.client.call("WebDriver:SetTimeouts", {"script": 15000})
            chrome_async = (
                "const __done = arguments[arguments.length - 1];\n"
                "const uris = arguments[0];\n"
                "(async function() {\n"
                "  const out = [];\n"
                "  for (const uri of uris) {\n"
                "    try {\n"
                "      await ChromeUtils.compileScript(uri, { hasReturnValue: false });\n"
                "      out.push({ ok: true, error: null, line: null, column: null });\n"
                "    } catch (err) {\n"
                "      out.push({\n"
                "        ok: false,\n"
                "        name: err && err.name ? String(err.name) : 'Error',\n"
                "        error: err && err.message ? String(err.message) : String(err),\n"
                "        line: typeof err?.lineNumber === 'number' ? err.lineNumber : null,\n"
                "        column: typeof err?.columnNumber === 'number' ? err.columnNumber : null\n"
                "      });\n"
                "    }\n"
                "  }\n"
                "  return out;\n"
                "})().then(__done, (e) => __done({ __err: String(e) }));"
            )
            uris = [p.as_uri() for p in resolved_paths]
            raw = self.client.call(
                "WebDriver:ExecuteAsyncScript",
                {"script": chrome_async, "args": [uris]},
            )
            val = raw.get("value") if isinstance(raw, dict) else raw
            if isinstance(val, dict) and "__err" in val:
                raise FirefoxHarnessError(f"ChromeUtils.compileScript batch failed: {val['__err']}")
            if not isinstance(val, list) or len(val) != len(resolved_paths):
                raise FirefoxHarnessError(f"Unexpected compileScript result: {val!r}")

            for idx, (path, entry) in enumerate(zip(resolved_paths, val)):
                msg = str(entry.get("error") or "")
                is_esm_err = (
                    not entry.get("ok")
                    and (
                        "import declarations may only appear at top level of a module" in msg
                        or "export declarations may only appear at top level of a module" in msg
                        or "import.meta may only appear in a module" in msg
                    )
                )
                if is_esm_err:
                    module_candidates.append((idx, path))
                results.append(
                    {
                        "path": str(path),
                        "ok": bool(entry.get("ok")),
                        "error": entry.get("error"),
                        "line": entry.get("line"),
                        "column": entry.get("column"),
                        "is_module": False,
                    }
                )
        finally:
            self._set_context("content")

        if module_candidates:
            self._verify_es_modules(module_candidates, results)

        return results

    def _close_stderr_file(self) -> None:
        fh = self._stderr_file
        self._stderr_file = None
        if fh is not None:
            try:
                fh.flush()
            except OSError:
                pass
            try:
                fh.close()
            except OSError:
                pass

    def _read_stderr_tail(self, max_bytes: int = 4096) -> bytes:
        self._close_stderr_file()
        if self._stderr_path is None or not self._stderr_path.is_file():
            return b""
        try:
            data = self._stderr_path.read_bytes()
            return data[-max_bytes:]
        except OSError:
            return b""

    def _verify_es_modules(
        self,
        candidates: list[tuple[int, Path]],
        results: list[dict[str, Any]],
    ) -> None:
        cand_roots = {str(idx): path.parent.resolve() for idx, path in candidates}

        class _ModuleHandler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802
                clean = unquote(self.path.split("?", 1)[0]).lstrip("/")
                if clean == "blank.html":
                    body = b"<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>"
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                if clean.startswith("m/"):
                    parts = clean.split("/", 2)
                    if len(parts) == 3:
                        idx_str, subpath = parts[1], parts[2]
                        base_dir = cand_roots.get(idx_str)
                        if base_dir is not None and subpath:
                            target = (base_dir / subpath).resolve()
                            if target.is_relative_to(base_dir) and target.is_file():
                                data = target.read_bytes()
                                ctype = "application/json; charset=utf-8" if target.suffix.lower() == ".json" else "text/javascript; charset=utf-8"
                                self.send_response(200)
                                self.send_header("Content-Type", ctype)
                                self.send_header("Content-Length", str(len(data)))
                                self.end_headers()
                                self.wfile.write(data)
                                return
                self.send_response(404)
                self.end_headers()

            def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
                pass

        srv = ThreadingHTTPServer(("127.0.0.1", 0), _ModuleHandler)
        t = threading.Thread(target=srv.serve_forever, daemon=True)
        t.start()
        try:
            port = srv.server_address[1]
            for idx, path in candidates:
                self.navigate(f"http://127.0.0.1:{port}/blank.html")
                res = self.eval_async_js(
                    "const modUrl = arguments[0];\n"
                    "return await new Promise((resolve) => {\n"
                    "  let settled = false;\n"
                    "  let syntaxFailed = false;\n"
                    "  function finish(payload) {\n"
                    "    if (settled) return;\n"
                    "    settled = true;\n"
                    "    window.removeEventListener('error', onErr);\n"
                    "    resolve(payload);\n"
                    "  }\n"
                    "  function onErr(ev) {\n"
                    "    const errObj = ev && ev.error;\n"
                    "    const errMsg = ev && typeof ev.message === 'string' ? ev.message : '';\n"
                    "    const isSyntax =\n"
                    "      (errObj && (errObj instanceof window.SyntaxError || errObj.name === 'SyntaxError')) ||\n"
                    "      errMsg.startsWith('SyntaxError');\n"
                    "    if (isSyntax) {\n"
                    "      syntaxFailed = true;\n"
                    "      const msg = errObj && errObj.message ? String(errObj.message) : errMsg;\n"
                    "      finish({ ok: false, error: msg, line: ev.lineno || null, column: ev.colno || null });\n"
                    "    }\n"
                    "  }\n"
                    "  window.addEventListener('error', onErr);\n"
                    "  const s = document.createElement('script');\n"
                    "  s.type = 'module';\n"
                    "  s.src = modUrl;\n"
                    "  s.addEventListener('load', () => {\n"
                    "    if (syntaxFailed) return;\n"
                    "    finish({ ok: true, error: null, line: null, column: null });\n"
                    "  });\n"
                    "  s.addEventListener('error', () => {\n"
                    "    finish({ ok: false, error: 'Failed to load ES module', line: null, column: null });\n"
                    "  });\n"
                    "  document.head.appendChild(s);\n"
                    "});",
                    f"http://127.0.0.1:{port}/m/{idx}/{path.name}",
                )
                results[idx]["ok"] = bool(res.get("ok"))
                results[idx]["error"] = res.get("error")
                results[idx]["line"] = res.get("line")
                results[idx]["column"] = res.get("column")
                results[idx]["is_module"] = True
        finally:
            srv.shutdown()
            srv.server_close()
            t.join(timeout=2.0)

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        proc = self.proc
        pid = proc.pid if proc is not None else None

        if self.client.connected:
            try:
                self.client.call("Marionette:Quit", {}, timeout=3.0)
            except Exception:
                pass
        self.client.close()

        if proc is not None:
            try:
                proc.wait(timeout=QUIT_TIMEOUT_S)
            except subprocess.TimeoutExpired:
                if pid is not None:
                    _kill_process_tree(pid)
                try:
                    proc.wait(timeout=3.0)
                except Exception:
                    pass
            except Exception:
                if pid is not None:
                    _kill_process_tree(pid)
            self.proc = None

        self._close_stderr_file()

        if pid is not None:
            with self._registry_lock:
                self._active_pids.discard(pid)

        if self.profile_dir is not None and self.profile_dir.exists():
            for _ in range(20):
                try:
                    shutil.rmtree(self.profile_dir)
                    break
                except OSError:
                    time.sleep(0.05)
            self.profile_dir = None
        self._stderr_path = None


FirefoxHarness = HeadlessFirefox
