"""Infrastructure smoke suite (--tier infra) verifying runner, AMO linter, headless Firefox, HTTP fixtures, and WebExtension mocks."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tests.lib import mock_helpers
from tests.lib.amo_lint import lint_extension
from tests.lib.firefox_harness import HeadlessFirefox, get_child_pids
from tests.lib.http_fixtures import FixtureServer


def _write_valid_fixture(root: Path) -> None:
    (root / "src" / "popup").mkdir(parents=True, exist_ok=True)
    (root / "src" / "background").mkdir(parents=True, exist_ok=True)
    (root / "icons").mkdir(parents=True, exist_ok=True)
    (root / "icons" / "icon-48.png").write_bytes(b"\x89PNG\r\n\x1a\n")

    manifest = {
        "manifest_version": 2,
        "name": "FoxHub Fixture",
        "short_name": "FoxHub",
        "version": "2.8.0",
        "icons": {"48": "icons/icon-48.png"},
        "browser_action": {"default_popup": "src/popup/popup.html", "default_title": "FoxHub"},
        "sidebar_action": {"default_panel": "src/popup/popup.html?sidebar=1", "default_title": "FoxHub"},
        "background": {"page": "src/background/background.html"},
        "permissions": ["storage", "tabs", "contextMenus", "<all_urls>"],
        "content_security_policy": "script-src 'self'; object-src 'self'",
        "browser_specific_settings": {
            "gecko": {
                "id": "pocketmail-local@workspace.local",
                "strict_min_version": "142.0",
            }
        },
    }
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (root / "src" / "popup" / "popup.html").write_text(
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<link rel='dns-prefetch' href='https://open.spotify.com'>"
        "<link rel='stylesheet' href='popup.css'>"
        "<title>FoxHub</title></head>"
        "<body><div id='app'>FoxHub Ready</div>"
        "<script src='popup.js'></script></body></html>",
        encoding="utf-8",
    )
    (root / "src" / "popup" / "popup.css").write_text(
        "/* valid comment */\nbody { margin: 0; color: #111; }\n",
        encoding="utf-8",
    )
    (root / "src" / "popup" / "popup.js").write_text(
        "// comment mentioning innerHTML and eval(x) must not be flagged\n"
        "const FRAME_TOKEN = 'pocketmail-media-frame';\n"
        "const el = document.createElement('div');\n"
        "el.textContent = 'Hello FoxHub';\n",
        encoding="utf-8",
    )
    (root / "src" / "background" / "background.html").write_text(
        "<!doctype html><html><head><meta charset='utf-8'><title>FoxHub BG</title></head>"
        "<body><script src='bg.js'></script></body></html>",
        encoding="utf-8",
    )
    (root / "src" / "background" / "bg.js").write_text(
        "/* block comment with innerHTML */\nconst ok = true;\n",
        encoding="utf-8",
    )


class TestInfraSmoke(unittest.TestCase):
    server: FixtureServer
    fx: HeadlessFirefox

    @classmethod
    def setUpClass(cls) -> None:
        cls.server = FixtureServer(REPO_ROOT).start()
        cls.fx = HeadlessFirefox().start()

    @classmethod
    def tearDownClass(cls) -> None:
        try:
            cls.fx.close()
        finally:
            cls.server.stop()

    def setUp(self) -> None:
        self.server.clear_seed()
        self.server.clear_requests()
        self.server.clear_telemetry()
        self.fx.reset_to_blank()

    def test_infra_runner_cli_smoke(self) -> None:
        with tempfile.TemporaryDirectory(prefix="foxhub_runner_") as tmp:
            json_out = Path(tmp) / "smoke_report.json"
            proc = subprocess.run(
                [
                    sys.executable,
                    str(REPO_ROOT / "tests" / "run_tests.py"),
                    "--tier",
                    "infra",
                    "--filter",
                    "test_infra_amo_lint_valid",
                    "--json",
                    str(json_out),
                ],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                timeout=60,
            )
            self.assertEqual(proc.returncode, 0, msg=proc.stdout + "\n" + proc.stderr)
            self.assertTrue(json_out.is_file())
            report = json.loads(json_out.read_text(encoding="utf-8"))
            self.assertEqual(report["exit_code"], 0)
            self.assertEqual(report["summary"]["total"], 1)
            self.assertEqual(report["summary"]["passed"], 1)
            self.assertEqual(report["summary"]["failed"], 0)
            self.assertEqual(report["summary"]["errors"], 0)
            self.assertEqual(report["tests"][0]["status"], "PASS")

    def test_infra_amo_lint_valid(self) -> None:
        with tempfile.TemporaryDirectory(prefix="foxhub_valid_") as tmp:
            root = Path(tmp)
            _write_valid_fixture(root)
            report = lint_extension(root, check_firefox_js=True, firefox_harness=self.fx)
            self.assertTrue(report["ok"], msg=f"Unexpected lint errors: {report['errors']}")
            self.assertEqual(report["errors"], [])
            self.assertEqual(report["stats"]["firefox_js_checked"], 2)

    def test_infra_amo_lint_invalid_fixtures(self) -> None:
        # 1. innerHTML assignment
        with tempfile.TemporaryDirectory(prefix="foxhub_bad_inner_") as tmp:
            root = Path(tmp)
            _write_valid_fixture(root)
            (root / "src" / "popup" / "popup.js").write_text("el.innerHTML = '<b>x</b>';\n", encoding="utf-8")
            rep = lint_extension(root, check_firefox_js=False)
            self.assertFalse(rep["ok"])
            self.assertTrue(any(e["rule"] == "js.unsafe_dom.innerHTML" for e in rep["errors"]))

        # 2. eval( and new Function(
        with tempfile.TemporaryDirectory(prefix="foxhub_bad_eval_") as tmp:
            root = Path(tmp)
            _write_valid_fixture(root)
            (root / "src" / "popup" / "popup.js").write_text("eval('1+1');\nconst fn = new Function('return 1');\n", encoding="utf-8")
            rep = lint_extension(root, check_firefox_js=False)
            self.assertFalse(rep["ok"])
            rules = {e["rule"] for e in rep["errors"]}
            self.assertIn("js.unsafe_eval.eval", rules)
            self.assertIn("js.unsafe_eval.new_Function", rules)

        # 3. remote <script src="https://...">
        with tempfile.TemporaryDirectory(prefix="foxhub_bad_remote_") as tmp:
            root = Path(tmp)
            _write_valid_fixture(root)
            (root / "src" / "popup" / "popup.html").write_text(
                "<!doctype html><html><head><meta charset='utf-8'></head>"
                "<body><script src='https://example.com/a.js'></script></body></html>",
                encoding="utf-8",
            )
            rep = lint_extension(root, check_firefox_js=False)
            self.assertFalse(rep["ok"])
            self.assertTrue(any(e["rule"] == "html.remote_script" for e in rep["errors"]))

        # 4. user-facing "PocketMail" UI string
        with tempfile.TemporaryDirectory(prefix="foxhub_bad_brand_") as tmp:
            root = Path(tmp)
            _write_valid_fixture(root)
            (root / "src" / "popup" / "popup.html").write_text(
                "<!doctype html><html><head><meta charset='utf-8'><title>PocketMail</title></head>"
                "<body><p>Welcome to PocketMail</p><script src='popup.js'></script></body></html>",
                encoding="utf-8",
            )
            (root / "src" / "popup" / "popup.js").write_text("const label = 'Open PocketMail Settings';\n", encoding="utf-8")
            rep = lint_extension(root, check_firefox_js=False)
            self.assertFalse(rep["ok"])
            rules = {e["rule"] for e in rep["errors"]}
            self.assertIn("branding.pocketmail_html", rules)
            self.assertIn("branding.pocketmail_ui_string", rules)

        # 5. invalid MV2 manifest (manifest_version: 3)
        with tempfile.TemporaryDirectory(prefix="foxhub_bad_manifest_") as tmp:
            root = Path(tmp)
            _write_valid_fixture(root)
            m = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
            m["manifest_version"] = 3
            (root / "manifest.json").write_text(json.dumps(m), encoding="utf-8")
            rep = lint_extension(root, check_firefox_js=False)
            self.assertFalse(rep["ok"])
            self.assertTrue(any(e["rule"] == "manifest.version_mv2" for e in rep["errors"]))

        # 6. JS syntax error verified in real Firefox
        with tempfile.TemporaryDirectory(prefix="foxhub_bad_syntax_") as tmp:
            root = Path(tmp)
            _write_valid_fixture(root)
            (root / "src" / "popup" / "popup.js").write_text("const x = ;\n", encoding="utf-8")
            rep = lint_extension(root, check_firefox_js=True, firefox_harness=self.fx)
            self.assertFalse(rep["ok"])
            self.assertTrue(any(e["rule"] == "js.syntax.firefox" for e in rep["errors"]))

        # 7. invalid CSS
        with tempfile.TemporaryDirectory(prefix="foxhub_bad_css_") as tmp:
            root = Path(tmp)
            _write_valid_fixture(root)
            (root / "src" / "popup" / "popup.css").write_text("body { color: red; ", encoding="utf-8")
            rep = lint_extension(root, check_firefox_js=False)
            self.assertFalse(rep["ok"])
            self.assertTrue(any(e["rule"] == "css.syntax.unclosed_brace" for e in rep["errors"]))

    def test_infra_firefox_dom_viewport_events_cleanup(self) -> None:
        fixture_html = """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Viewport & Events Fixture</title>
  <style>
    html, body { margin: 0; padding: 0; }
    #box { width: 100%; height: 60px; background: #222; color: #fff; }
    @media (max-width: 400px) { #box { height: 120px; } }
  </style>
</head>
<body>
  <div id="box">Box</div>
  <button id="btn" type="button">Click Me</button>
  <script>
    window.__events = [];
    document.getElementById("btn").addEventListener("click", () => window.__events.push("click"));
    document.getElementById("btn").addEventListener("auxclick", (e) => window.__events.push("aux:" + e.button));
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === "k") {
        window.__events.push("ctrl+k");
      }
    });
  </script>
</body>
</html>"""
        url = self.server.register_fixture("dom_events.html", fixture_html)

        isolated_pid: int | None = None
        with HeadlessFirefox() as iso_fx:
            isolated_pid = iso_fx.pid
            self.assertIsNotNone(isolated_pid)
            iso_fx.navigate(url)

            vp_wide = iso_fx.set_viewport(1200, 800)
            self.assertEqual(vp_wide, {"width": 1200, "height": 800})
            rect_wide = iso_fx.get_bounding_rect("#box")
            self.assertEqual(round(rect_wide["width"]), 1200)
            self.assertEqual(round(rect_wide["height"]), 60)

            vp_narrow = iso_fx.set_viewport(320, 640)
            self.assertEqual(vp_narrow, {"width": 320, "height": 640})
            rect_narrow = iso_fx.get_bounding_rect("#box")
            self.assertEqual(round(rect_narrow["width"]), 320)
            self.assertEqual(round(rect_narrow["height"]), 120)

            iso_fx.click("#btn")
            iso_fx.middle_click("#btn")
            iso_fx.press_shortcut("k", ctrl=True)
            events = iso_fx.eval_js("return window.__events;")
            self.assertIn("click", events)
            self.assertIn("aux:1", events)
            self.assertIn("ctrl+k", events)

        assert isolated_pid is not None
        self.assertEqual(get_child_pids(isolated_pid), [])
        if os.name == "nt":
            ps = subprocess.run(
                ["tasklist", "/FI", f"PID eq {isolated_pid}", "/NH"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            self.assertNotIn(str(isolated_pid), ps.stdout)

    def test_infra_mock_storage_and_onchanged(self) -> None:
        url = self.server.register_fixture("blank_storage.html", "<!doctype html><html><head></head><body></body></html>")
        self.fx.navigate(url)
        mock_helpers.inject_mock(self.fx)

        res = self.fx.eval_async_js(
            """
            const changesLog = [];
            browser.storage.onChanged.addListener((changes, area) => {
              changesLog.push({ changes, area });
            });
            await browser.storage.local.set({ theme: 'dark', volume: 80 });
            await browser.storage.local.set({ volume: 50 });
            const gotObj = await browser.storage.local.get({ theme: 'light', missingKey: 'fallback' });
            await browser.storage.local.remove('theme');
            const afterRemove = await browser.storage.local.get(null);
            await browser.storage.local.clear();
            const afterClear = await browser.storage.local.get(null);
            const chromeCbVal = await new Promise((resolve) => {
              chrome.storage.local.set({ viaChrome: 42 }, () => {
                chrome.storage.local.get(['viaChrome'], (items) => {
                  resolve({ items, lastErr: chrome.runtime.lastError });
                });
              });
            });
            return { changesLog, gotObj, afterRemove, afterClear, chromeCbVal };
            """
        )
        self.assertEqual(res["gotObj"], {"theme": "dark", "missingKey": "fallback"})
        self.assertEqual(res["afterRemove"], {"volume": 50})
        self.assertEqual(res["afterClear"], {})
        self.assertEqual(res["changesLog"][0]["area"], "local")
        self.assertEqual(res["changesLog"][0]["changes"]["theme"], {"newValue": "dark"})
        self.assertEqual(res["changesLog"][1]["changes"]["volume"], {"oldValue": 80, "newValue": 50})
        self.assertEqual(res["changesLog"][2]["changes"]["theme"], {"oldValue": "dark"})
        self.assertEqual(res["chromeCbVal"]["items"], {"viaChrome": 42})
        self.assertIsNone(res["chromeCbVal"]["lastErr"])

    def test_infra_mock_runtime_messaging_ports(self) -> None:
        url = self.server.register_fixture("blank_runtime.html", "<!doctype html><html><head></head><body></body></html>")
        self.fx.navigate(url)
        mock_helpers.inject_mock(
            self.fx,
            manifest={"manifest_version": 2, "name": "FoxHub", "version": "2.8.0"},
            base_url=self.server.base_url + "/",
        )

        res = self.fx.eval_async_js(
            """
            window.__webextMock.configure({ backgroundPage: { __pmPing: () => 'pong' } });
            browser.runtime.onMessage.addListener((msg) => {
              if (msg.type === 'PROMISE_ECHO') return Promise.resolve({ ok: true, echo: msg.val });
            });
            browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
              if (msg.type === 'ASYNC_CB') {
                setTimeout(() => sendResponse({ ok: true, via: 'cb' }), 10);
                return true;
              }
            });

            const r1 = await browser.runtime.sendMessage({ type: 'PROMISE_ECHO', val: 7 });
            const r2 = await browser.runtime.sendMessage({ type: 'ASYNC_CB' });

            const portMsgs = [];
            let serverDisconnected = false;
            browser.runtime.onConnect.addListener((serverPort) => {
              serverPort.onMessage.addListener((m) => {
                portMsgs.push('server:' + m.hello);
                serverPort.postMessage({ reply: m.hello + '!' });
              });
              serverPort.onDisconnect.addListener(() => {
                serverDisconnected = true;
              });
            });

            const clientPort = browser.runtime.connect({ name: 'foxhub-sidebar-lifecycle' });
            const clientReply = await new Promise((resolve) => {
              clientPort.onMessage.addListener((m) => resolve(m.reply));
              clientPort.postMessage({ hello: 'world' });
            });
            clientPort.disconnect();
            await new Promise((r) => setTimeout(r, 15));

            return {
              r1,
              r2,
              portMsgs,
              clientReply,
              serverDisconnected,
              manifestVer: browser.runtime.getManifest().version,
              popupUrl: browser.runtime.getURL('src/popup/popup.html'),
              bgPing: browser.extension.getBackgroundPage().__pmPing(),
            };
            """
        )
        self.assertEqual(res["r1"], {"ok": True, "echo": 7})
        self.assertEqual(res["r2"], {"ok": True, "via": "cb"})
        self.assertEqual(res["portMsgs"], ["server:world"])
        self.assertEqual(res["clientReply"], "world!")
        self.assertTrue(res["serverDisconnected"])
        self.assertEqual(res["manifestVer"], "2.8.0")
        self.assertEqual(res["popupUrl"], self.server.base_url + "/src/popup/popup.html")
        self.assertEqual(res["bgPing"], "pong")

    def test_infra_mock_context_menus_and_commands(self) -> None:
        url = self.server.register_fixture("blank_menus.html", "<!doctype html><html><head></head><body></body></html>")
        self.fx.navigate(url)
        mock_helpers.inject_mock(self.fx)

        self.fx.eval_async_js(
            """
            window.__menuClicks = [];
            window.__cmdEvents = [];
            browser.contextMenus.onClicked.addListener((info, tab) => {
              window.__menuClicks.push({ id: info.menuItemId, linkUrl: info.linkUrl, tabId: tab.id });
            });
            browser.commands.onCommand.addListener((cmd) => window.__cmdEvents.push(cmd));

            browser.contextMenus.create({ id: 'open-link-foxhub', title: 'Open Link in FoxHub', contexts: ['link'] });
            await browser.contextMenus.update('open-link-foxhub', { title: 'Open in FoxHub Sidebar' });
            await browser.commands.update({ name: 'open-foxhub-popout', shortcut: 'Ctrl+Alt+P' });
            """
        )

        menus = mock_helpers.get_context_menus(self.fx)
        self.assertEqual(len(menus), 1)
        self.assertEqual(menus[0]["title"], "Open in FoxHub Sidebar")

        mock_helpers.trigger_context_menu_click(self.fx, "open-link-foxhub", link_url="https://example.com/article")
        mock_helpers.trigger_command(self.fx, "open-foxhub-popout")

        res = self.fx.eval_async_js(
            """
            const cmdsAfterUpdate = await browser.commands.getAll();
            await browser.commands.reset('open-foxhub-popout');
            const cmdsAfterReset = await browser.commands.getAll();
            await browser.contextMenus.remove('open-link-foxhub');
            const afterRemove = window.__webextMock.contextMenus.list();
            browser.contextMenus.create({ id: 'temp-1', title: 'Temp' });
            await browser.contextMenus.removeAll();
            const afterRemoveAll = window.__webextMock.contextMenus.list();
            return {
              clicks: window.__menuClicks,
              cmds: window.__cmdEvents,
              cmdsAfterUpdate,
              cmdsAfterReset,
              afterRemove,
              afterRemoveAll,
            };
            """
        )
        self.assertEqual(res["clicks"], [{"id": "open-link-foxhub", "linkUrl": "https://example.com/article", "tabId": 1}])
        self.assertEqual(res["cmds"], ["open-foxhub-popout"])
        pop_upd = [c for c in res["cmdsAfterUpdate"] if c["name"] == "open-foxhub-popout"][0]
        pop_rst = [c for c in res["cmdsAfterReset"] if c["name"] == "open-foxhub-popout"][0]
        self.assertEqual(pop_upd["shortcut"], "Ctrl+Alt+P")
        self.assertEqual(pop_rst["shortcut"], "")
        self.assertEqual(res["afterRemove"], [])
        self.assertEqual(res["afterRemoveAll"], [])

    def test_infra_mock_webrequest_headers_and_ua(self) -> None:
        url = self.server.register_fixture("blank_wr.html", "<!doctype html><html><head></head><body></body></html>")
        self.fx.navigate(url)
        mock_helpers.inject_mock(self.fx)

        self.fx.eval_js(
            """
            browser.webRequest.onBeforeSendHeaders.addListener(
              async (details) => {
                const headers = details.requestHeaders.filter((h) => h.name.toLowerCase() !== 'user-agent');
                headers.push({ name: 'User-Agent', value: 'MobileFoxHub/2.8' });
                return { requestHeaders: headers };
              },
              { urls: ['https://custom.example.com/*'], types: ['sub_frame'] },
              ['blocking', 'requestHeaders']
            );
            browser.webRequest.onHeadersReceived.addListener(
              (details) => ({
                responseHeaders: details.responseHeaders.filter(
                  (h) => h.name.toLowerCase() !== 'x-frame-options'
                ),
              }),
              { urls: ['<all_urls>'], types: ['sub_frame'] },
              ['blocking', 'responseHeaders']
            );
            browser.webRequest.onBeforeRequest.addListener(
              (details) => (details.url.includes('blocked=1') ? { cancel: true } : {}),
              { urls: ['<all_urls>'] },
              ['blocking']
            );
            """
        )

        send_res = mock_helpers.trigger_before_send_headers(
            self.fx,
            "https://custom.example.com/app",
            request_headers=[{"name": "User-Agent", "value": "Desktop"}, {"name": "Cookie", "value": "a=1"}],
            tab_id=-1,
        )
        ua_vals = [h["value"] for h in send_res["requestHeaders"] if h["name"] == "User-Agent"]
        self.assertEqual(ua_vals, ["MobileFoxHub/2.8"])

        recv_res = mock_helpers.trigger_headers_received(
            self.fx,
            "https://custom.example.com/app",
            response_headers=[{"name": "X-Frame-Options", "value": "DENY"}, {"name": "Content-Type", "value": "text/html"}],
        )
        self.assertEqual([h["name"] for h in recv_res["responseHeaders"]], ["Content-Type"])

        cancel_res = mock_helpers.trigger_before_request(self.fx, "https://custom.example.com/ad?blocked=1")
        self.assertTrue(cancel_res["cancel"])

    def test_infra_mock_tabs_windows_sidebar_cookies(self) -> None:
        url = self.server.register_fixture("blank_misc.html", "<!doctype html><html><head></head><body></body></html>")
        self.fx.navigate(url)
        mock_helpers.inject_mock(self.fx)

        mock_helpers.seed_tabs(
            self.fx,
            [
                {"id": 10, "windowId": 1, "active": True, "audible": True, "mutedInfo": {"muted": False}, "url": "https://www.youtube.com/watch?v=1"},
                {"id": 11, "windowId": 1, "active": False, "audible": False, "mutedInfo": {"muted": False}, "url": "https://example.org/"},
            ],
        )
        mock_helpers.set_tab_message_result(self.fx, 10, {"paused": True})

        res = self.fx.eval_async_js(
            """
            const log = [];
            browser.tabs.onUpdated.addListener((id, info) => log.push({ ev: 'tabUpd', id, info }));
            browser.tabs.onActivated.addListener((info) => log.push({ ev: 'tabAct', info }));
            browser.tabs.onRemoved.addListener((id) => log.push({ ev: 'tabRem', id }));
            browser.cookies.onChanged.addListener((c) => log.push({ ev: 'cookie', removed: c.removed, name: c.cookie.name }));

            const audible = await browser.tabs.query({ audible: true });
            const msgRes = await browser.tabs.sendMessage(10, { type: 'PAUSE_MEDIA' });
            const createdTab = await browser.tabs.create({ url: 'https://open.spotify.com/', active: false });
            await browser.tabs.update(createdTab.id, { title: 'Spotify' });
            await browser.tabs.remove(createdTab.id);

            const popWin = await browser.windows.create({ url: 'src/popup/popup.html', type: 'popup', width: 420, height: 700 });
            await browser.windows.update(popWin.id, { focused: true });
            await browser.windows.remove(popWin.id);

            await browser.sidebarAction.open();
            const open1 = await browser.sidebarAction.isOpen({});
            await browser.sidebarAction.toggle();
            const open2 = await browser.sidebarAction.isOpen({});
            await browser.sidebarAction.setPanel({ panel: 'src/popup/popup.html?sidebar=1&app=gmail' });
            const panel = await browser.sidebarAction.getPanel({});
            await browser.sidebarAction.setTitle({ title: 'FoxHub Sidebar' });

            await browser.browserAction.setBadgeText({ text: '3' });
            await browser.browserAction.setBadgeBackgroundColor({ color: '#ef4444' });

            await browser.cookies.set({ url: 'https://mail.google.com/mail', name: 'SID', value: 'xyz', secure: true });
            const cookies = await browser.cookies.getAll({ domain: 'mail.google.com' });
            await browser.cookies.remove({ url: 'https://mail.google.com/mail', name: 'SID' });

            const spy = window.__webextMock.installClipboardSpy();
            await navigator.clipboard.writeText('userChrome-snippet');

            return {
              audibleIds: audible.map((t) => t.id),
              msgRes,
              open1,
              open2,
              panel,
              sidebar: window.__webextMock.sidebarAction.getState(),
              badge: window.__webextMock.browserAction.getState(),
              cookiesCount: cookies.length,
              copiedText: spy.getText(),
              log,
            };
            """
        )
        self.assertEqual(res["audibleIds"], [10])
        self.assertEqual(res["msgRes"], {"paused": True})
        self.assertTrue(res["open1"])
        self.assertFalse(res["open2"])
        self.assertEqual(res["panel"], "src/popup/popup.html?sidebar=1&app=gmail")
        self.assertEqual(res["sidebar"]["title"], "FoxHub Sidebar")
        self.assertEqual(res["badge"]["badgeText"], "3")
        self.assertEqual(res["cookiesCount"], 1)
        self.assertEqual(res["copiedText"], "userChrome-snippet")
        events = [e["ev"] for e in res["log"]]
        self.assertIn("tabUpd", events)
        self.assertIn("tabRem", events)
        self.assertIn("cookie", events)

    def test_infra_http_fixtures_routes(self) -> None:
        import urllib.request

        with urllib.request.urlopen(self.server.url_for("/__test__/health"), timeout=5) as resp:
            self.assertEqual(resp.status, 200)
            self.assertEqual(json.loads(resp.read().decode("utf-8")), {"ok": True})

        with urllib.request.urlopen(self.server.url_for("/mock/gmail/feed"), timeout=5) as resp:
            self.assertEqual(resp.status, 200)
            self.assertIn("<fullcount>2</fullcount>", resp.read().decode("utf-8"))

        self.server.clear_requests()
        self.fx.navigate(self.server.url_for("/mock/spotify?playing=1"))
        sp_info = self.fx.eval_js(
            "const a = document.querySelector('audio');\n"
            "const t = document.querySelector('[data-testid=\"context-item-info-title\"]');\n"
            "return { paused: a ? a.paused : null, title: t ? t.textContent : null };"
        )
        self.assertFalse(sp_info["paused"])
        self.assertEqual(sp_info["title"], "Midnight City")

        self.fx.navigate(self.server.url_for("/mock/custom/notion-test?mode=mobile"))
        echo_text = self.fx.eval_js("return document.getElementById('echo-query').textContent;")
        self.assertEqual(echo_text, "mode=mobile")

        reqs = self.server.get_requests(path_prefix="/mock/")
        self.assertGreaterEqual(len(reqs), 2)
        self.assertIn("user-agent", reqs[0]["headers"])

    def test_infra_firefox_esm_and_import_meta(self) -> None:
        with tempfile.TemporaryDirectory(prefix="foxhub_esm_") as tmp:
            root = Path(tmp)
            ok_mod = root / "esm_ok.mjs"
            bad_mod = root / "esm_bad.mjs"
            bad_mod2 = root / "esm_bad2.mjs"
            meta_mod = root / "import_meta.js"
            dep_ok = root / "dep_ok.js"
            entry_ok = root / "entry_ok.mjs"
            dep_bad = root / "dep_bad.js"
            entry_bad_dep = root / "entry_bad_dep.mjs"

            ok_mod.write_text("export const x = 1;\n", encoding="utf-8")
            bad_mod.write_text("export const = ;\n", encoding="utf-8")
            bad_mod2.write_text("export const x = 1;\nconst y = {;\n", encoding="utf-8")
            meta_mod.write_text("const u = import.meta.url;\n", encoding="utf-8")
            dep_ok.write_text("export const v = 42;\n", encoding="utf-8")
            entry_ok.write_text("import { v } from './dep_ok.js';\nexport const out = v;\n", encoding="utf-8")
            dep_bad.write_text("export const = ;\n", encoding="utf-8")
            entry_bad_dep.write_text("import { v } from './dep_bad.js';\nexport const out = v;\n", encoding="utf-8")

            res = self.fx.check_js_syntax(
                [ok_mod, bad_mod, bad_mod2, meta_mod, entry_ok, entry_bad_dep]
            )
            by_name = {Path(r["path"]).name: r for r in res}

            self.assertTrue(by_name["esm_ok.mjs"]["ok"])
            self.assertTrue(by_name["esm_ok.mjs"]["is_module"])

            self.assertFalse(by_name["esm_bad.mjs"]["ok"])
            self.assertTrue(by_name["esm_bad.mjs"]["is_module"])

            self.assertFalse(by_name["esm_bad2.mjs"]["ok"])
            self.assertTrue(by_name["esm_bad2.mjs"]["is_module"])

            self.assertTrue(by_name["import_meta.js"]["ok"])
            self.assertTrue(by_name["import_meta.js"]["is_module"])

            self.assertTrue(by_name["entry_ok.mjs"]["ok"])
            self.assertTrue(by_name["entry_ok.mjs"]["is_module"])

            self.assertFalse(by_name["entry_bad_dep.mjs"]["ok"])
            self.assertTrue(by_name["entry_bad_dep.mjs"]["is_module"])

    def test_infra_http_fixtures_path_containment(self) -> None:
        import http.client

        for bad_path in (
            "/src/../.git/config",
            "/src/../tests/run_tests.py",
            "/src/%2e%2e/tests/run_tests.py",
            "/icons/../manifest.json",
            "/src/..%5Ctests%5Crun_tests.py",
        ):
            conn = http.client.HTTPConnection("127.0.0.1", self.server.port, timeout=5)
            try:
                conn.request("GET", bad_path)
                resp = conn.getresponse()
                resp.read()
                self.assertEqual(resp.status, 404, msg=f"Expected 404 for {bad_path}, got {resp.status}")
            finally:
                conn.close()

        conn = http.client.HTTPConnection("127.0.0.1", self.server.port, timeout=5)
        try:
            conn.request("GET", "/manifest.json")
            resp = conn.getresponse()
            resp.read()
            self.assertEqual(resp.status, 200)
        finally:
            conn.close()

        conn = http.client.HTTPConnection("127.0.0.1", self.server.port, timeout=5)
        try:
            conn.request("POST", "/__test__/telemetry", body=b"", headers={"Content-Length": "invalid"})
            resp = conn.getresponse()
            resp.read()
            self.assertEqual(resp.status, 400)
        finally:
            conn.close()

    def test_infra_amo_lint_direct_cli_and_hardened_bypasses(self) -> None:
        with tempfile.TemporaryDirectory(prefix="foxhub_cli_valid_") as tmp:
            root = Path(tmp)
            _write_valid_fixture(root)
            proc = subprocess.run(
                [sys.executable, str(REPO_ROOT / "tests" / "lib" / "amo_lint.py"), str(root)],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                timeout=60,
            )
            self.assertEqual(proc.returncode, 0, msg=proc.stdout + "\n" + proc.stderr)
            self.assertIn("AMO Lint: PASS", proc.stdout)

            mod_proc = subprocess.run(
                [sys.executable, "-m", "tests.lib.amo_lint", str(root), "--no-firefox"],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(mod_proc.returncode, 0, msg=mod_proc.stdout + "\n" + mod_proc.stderr)
            self.assertNotIn("RuntimeWarning", mod_proc.stderr)

        # Hardened bypass patterns must be caught; clean division must not false-positive
        bypass_cases = [
            ("setTimeout(\"alert(1)\", 10);\n", "js.unsafe_eval.string_timer"),
            ("setInterval('bar()', 10);\n", "js.unsafe_eval.string_timer"),
            ("setTimeout(`baz()`, 10);\n", "js.unsafe_eval.string_timer"),
            ("if (cond) /'/.test(y); eval(z);\n", "js.unsafe_eval.eval"),
            ("window?.eval('1');\n", "js.unsafe_eval.global_eval"),
            ("(0, eval)('1');\n", "js.unsafe_eval.indirect_eval"),
            ("const s = document.createElement(`script`); s.setAttribute('src', '//evil.test/x.js');\n", "js.remote_code.dynamic_script"),
        ]
        for js_code, expected_rule in bypass_cases:
            with tempfile.TemporaryDirectory(prefix="foxhub_bypass_") as tmp:
                root = Path(tmp)
                _write_valid_fixture(root)
                (root / "src" / "popup" / "popup.js").write_text(js_code, encoding="utf-8")
                rep = lint_extension(root, check_firefox_js=False)
                self.assertFalse(rep["ok"], msg=f"Expected failure for {js_code!r}")
                rules = {e["rule"] for e in rep["errors"]}
                self.assertIn(expected_rule, rules, msg=f"Missing {expected_rule} in {rules} for {js_code!r}")

        with tempfile.TemporaryDirectory(prefix="foxhub_html_uri_") as tmp:
            root = Path(tmp)
            _write_valid_fixture(root)
            (root / "src" / "popup" / "popup.html").write_text(
                "<!doctype html><html><head><meta charset='utf-8'></head>"
                "<body><a href='java&#x09;script:alert(1)'>x</a><script src='popup.js'></script></body></html>",
                encoding="utf-8",
            )
            rep = lint_extension(root, check_firefox_js=False)
            self.assertFalse(rep["ok"])
            self.assertIn("html.javascript_uri", {e["rule"] for e in rep["errors"]})

        with tempfile.TemporaryDirectory(prefix="foxhub_div_ok_") as tmp:
            root = Path(tmp)
            _write_valid_fixture(root)
            (root / "src" / "popup" / "popup.js").write_text("const q = (a + b) / c;\nconst ok = q + 1;\n", encoding="utf-8")
            rep = lint_extension(root, check_firefox_js=False)
            self.assertTrue(rep["ok"], msg=f"Unexpected errors on valid division: {rep['errors']}")

    def test_infra_runner_discovery_without_init_and_filter(self) -> None:
        import shutil

        with tempfile.TemporaryDirectory(prefix="foxhub_noinit_") as tmp:
            tmp_root = Path(tmp)
            tmp_tests = tmp_root / "tests"
            tmp_tier1 = tmp_tests / "tier1"
            tmp_tier1.mkdir(parents=True)
            shutil.copy2(REPO_ROOT / "tests" / "run_tests.py", tmp_tests / "run_tests.py")

            (tmp_tier1 / "test_sample.py").write_text(
                "import unittest\n"
                "class TestSample(unittest.TestCase):\n"
                "    def test_ok(self):\n"
                "        self.assertEqual(1 + 1, 2)\n",
                encoding="utf-8",
            )
            (tmp_tier1 / "test_broken_import.py").write_text(
                "import nonexistent_module_foxhub_xyz_999\n",
                encoding="utf-8",
            )

            # Filtered run for test_sample must pass and exclude unrelated broken import
            json_filtered = tmp_root / "filtered.json"
            p_filt = subprocess.run(
                [
                    sys.executable,
                    str(tmp_tests / "run_tests.py"),
                    "--tier",
                    "1",
                    "--filter",
                    "test_sample",
                    "--json",
                    str(json_filtered),
                ],
                cwd=str(tmp_root),
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(p_filt.returncode, 0, msg=p_filt.stdout + "\n" + p_filt.stderr)
            rep_filt = json.loads(json_filtered.read_text(encoding="utf-8"))
            self.assertEqual(rep_filt["summary"]["total"], 1)
            self.assertEqual(rep_filt["summary"]["passed"], 1)
            self.assertTrue(rep_filt["tests"][0]["id"].startswith("tier1.test_sample."))

            # Unfiltered run must report 1 pass + 1 import error cleanly
            p_all = subprocess.run(
                [sys.executable, str(tmp_tests / "run_tests.py"), "--tier", "1"],
                cwd=str(tmp_root),
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(p_all.returncode, 1, msg=p_all.stdout + "\n" + p_all.stderr)
            self.assertIn("PASS: 1 | FAIL: 0 | ERROR: 1", p_all.stdout)

    def test_infra_mock_edge_cases_iter2(self) -> None:
        url = self.server.register_fixture("blank_iter2.html", "<!doctype html><html><head></head><body></body></html>")
        self.fx.navigate(url)
        mock_helpers.inject_mock(self.fx)

        res = self.fx.eval_async_js(
            """
            // 1. Port postMessage() before immediate disconnect()
            const received = [];
            let disconnectedFired = false;
            browser.runtime.onConnect.addListener((serverPort) => {
              serverPort.onMessage.addListener((m) => received.push(m));
              serverPort.onDisconnect.addListener(() => {
                disconnectedFired = true;
              });
            });
            const cp = browser.runtime.connect({ name: 'immediate-close' });
            cp.postMessage({ seq: 1 });
            cp.disconnect();
            let postAfterDisconnectThrew = false;
            try {
              cp.postMessage({ seq: 2 });
            } catch (_e) {
              postAfterDisconnectThrew = true;
            }
            await new Promise((r) => setTimeout(r, 20));

            // 2. storage.local.set({ k: undefined })
            const chg = [];
            browser.storage.onChanged.addListener((c) => chg.push(c));
            await browser.storage.local.set({ undefKey: undefined });
            const chgLenAfterUndef = chg.length;
            const gotUndef = await browser.storage.local.get({ undefKey: 'defaultVal', missingKey: 'default2' });

            // 3. chrome.runtime.lastError strictly scoped to callback
            const errInCb = await new Promise((resolve) => {
              chrome.tabs.get(99999, () => {
                resolve(chrome.runtime.lastError ? chrome.runtime.lastError.message : null);
              });
            });
            const errAfterCb = chrome.runtime.lastError;
            await browser.storage.local.set({ cleanKey: 1 });
            const errAfterBrowserCall = chrome.runtime.lastError;

            // 4. Async command & contextMenu & tab listener setup
            window.__slowCmdDone = false;
            browser.commands.onCommand.addListener(async () => {
              await new Promise((r) => setTimeout(r, 35));
              window.__slowCmdDone = true;
            });
            window.__slowMenuDone = false;
            browser.contextMenus.create({ id: 'slow-menu', title: 'Slow' });
            browser.contextMenus.onClicked.addListener(async () => {
              await new Promise((r) => setTimeout(r, 25));
              window.__slowMenuDone = true;
            });
            window.__slowTabDone = false;
            browser.tabs.onUpdated.addListener(async () => {
              await new Promise((r) => setTimeout(r, 25));
              window.__slowTabDone = true;
            });

            // 5. webRequest filter.tabId === -1 strictness
            window.__wrTabHits = [];
            browser.webRequest.onBeforeRequest.addListener(
              (details) => { window.__wrTabHits.push(details.tabId); return {}; },
              { urls: ['https://tabfilter.test/*'], tabId: -1 },
              ['blocking']
            );

            return {
              received,
              disconnectedFired,
              postAfterDisconnectThrew,
              chgLen: chgLenAfterUndef,
              gotUndef,
              errInCb,
              errAfterCb,
              errAfterBrowserCall,
            };
            """
        )
        self.assertEqual(res["received"], [{"seq": 1}])
        self.assertTrue(res["disconnectedFired"])
        self.assertTrue(res["postAfterDisconnectThrew"])
        self.assertEqual(res["chgLen"], 0)
        self.assertEqual(res["gotUndef"], {"undefKey": "defaultVal", "missingKey": "default2"})
        self.assertIn("99999", res["errInCb"])
        self.assertIsNone(res["errAfterCb"])
        self.assertIsNone(res["errAfterBrowserCall"])

        mock_helpers.trigger_command(self.fx, "open-foxhub-popout")
        mock_helpers.trigger_context_menu_click(self.fx, "slow-menu", link_url="https://example.com/")
        mock_helpers.trigger_tab_updated(self.fx, 1, {"title": "Updated"})
        async_done = self.fx.eval_js(
            "return { cmd: window.__slowCmdDone, menu: window.__slowMenuDone, tab: window.__slowTabDone };"
        )
        self.assertEqual(async_done, {"cmd": True, "menu": True, "tab": True})

        mock_helpers.trigger_before_request(self.fx, "https://tabfilter.test/a", tab_id=5)
        mock_helpers.trigger_before_request(self.fx, "https://tabfilter.test/b", tab_id=-1)
        tab_hits = self.fx.eval_js("return window.__wrTabHits;")
        self.assertEqual(tab_hits, [-1])


if __name__ == "__main__":
    unittest.main()
