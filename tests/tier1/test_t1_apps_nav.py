"""Tier 1 happy-path tests for F9 (userChrome.css), F11 (contextMenus), F12 (Custom Apps Pro Controls), F13 (Built-in Presets + Gemini), F14 (Backup & Restore), and F15 (Quick Switcher)."""

from __future__ import annotations

from html.parser import HTMLParser
import json
from pathlib import Path
import sys
import time
import unittest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tests.lib import mock_helpers
from tests.lib.firefox_harness import HeadlessFirefox
from tests.lib.http_fixtures import FixtureServer


class _ScriptSrcParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.srcs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "script":
            for k, v in attrs:
                if k.lower() == "src" and v:
                    self.srcs.append(v.strip())


ERROR_TRAP_JS = (
    "if (!window.__t1Errors) {"
    "  window.__t1Errors = [];"
    "  window.addEventListener('error', (ev) => {"
    "    window.__t1Errors.push('error: ' + (ev && ev.message ? ev.message : String(ev)));"
    "  });"
    "  window.addEventListener('unhandledrejection', (ev) => {"
    "    const r = ev && ev.reason;"
    "    window.__t1Errors.push('rejection: ' + (r && r.message ? r.message : String(r)));"
    "  });"
    "}"
)

OFFLINE_FETCH_GUARD_JS = (
    "(function(){\n"
    "  const origFetch = window.fetch ? window.fetch.bind(window) : null;\n"
    "  window.fetch = function(input, init){\n"
    "    const u = typeof input === 'string' ? input : (input && input.url ? input.url : '');\n"
    "    if (/^https?:\\/\\//i.test(u) && !u.startsWith(window.location.origin)) {\n"
    "      return Promise.reject(new TypeError('Offline test harness blocked external fetch: ' + u));\n"
    "    }\n"
    "    return origFetch ? origFetch(input, init) : Promise.reject(new Error('No fetch'));\n"
    "  };\n"
    "})();\n"
)

DEFAULT_10_PINNED = [
    "instagram",
    "whatsapp",
    "discord",
    "telegram",
    "spotify",
    "youtube",
    "tiktok",
    "x",
    "messenger",
    "reddit",
]

UNPINNED_11_PRESETS = [
    "twitch",
    "chatgpt",
    "gemini",
    "claude",
    "perplexity",
    "soundcloud",
    "apple-music",
    "bluesky",
    "notion",
    "google-calendar",
    "google-keep",
]

ALL_21_BUILTIN_IDS = DEFAULT_10_PINNED + UNPINNED_11_PRESETS


def _make_seed(
    settings_overrides: dict | None = None,
    custom_apps: list | None = None,
    with_message_responses: bool = True,
) -> dict:
    now_ms = int(time.time() * 1000)
    settings = {
        "theme": "warm-linen",
        "demoMode": "on",
        "maxSessionSlots": 1,
        "enabledMediaApps": list(DEFAULT_10_PINNED),
        "customMediaApps": custom_apps or [],
        "persistenceMode": "selected",
        "persistentAppIds": [],
        "persistentOpenAppIds": [],
        "persistentLastActiveAppId": "pocketmail",
        "persistentSavedAppUrls": {},
        "keepAudioPlayingWhenClosed": True,
        "tabAudioBehavior": "pause-resume",
        "autoPauseOnTabAudio": True,
        "bgAudioAppIds": ["spotify", "youtube", "soundcloud"],
        "miniNowPlayingEnabled": True,
        "miniNowPlayingPosition": "bottom",
        "miniNowPlayingCompact": False,
        "miniNowPlayingShowProgress": True,
        "miniNowPlayingAutoHidePaused": True,
        "contextMenuEnabled": True,
        "contextMenuOpenBehavior": "sidebar",
        "quickSwitcherEnabled": True,
        "quickSwitcherShortcut": "Ctrl+K",
        "railPlayingIndicatorEnabled": True,
        "railQuickControlsEnabled": True,
        "settingsGearHintCount": 2,
        "globalShortcuts": {
            "popup": "Alt+Shift+F",
            "sidebar": "Alt+Shift+M",
            "popout": "Alt+Shift+W",
        },
        "appShortcuts": {},
    }
    if settings_overrides:
        settings.update(settings_overrides)

    state = {
        "accounts": [
            {
                "slot": 0,
                "email": "demo@gmail.com",
                "displayName": "Demo Inbox",
                "unreadCount": 1,
                "messages": [
                    {
                        "id": "msg-1",
                        "threadId": "thr-1",
                        "sender": "Alice <alice@example.com>",
                        "senderName": "Alice",
                        "senderEmail": "alice@example.com",
                        "subject": "Welcome to FoxHub",
                        "snippet": "Inbox test.",
                        "fullText": "Inbox test body.",
                        "dateMs": now_ms - 30000,
                        "unread": True,
                        "starred": False,
                        "accountSlot": 0,
                        "accountEmail": "demo@gmail.com",
                    }
                ],
            }
        ],
        "totalUnread": 1,
        "sentMessages": [],
        "lastSyncAt": now_ms,
        "usingDemo": True,
        "syncError": None,
        "settings": settings,
    }

    seed: dict = {"storage": {"settings": settings}}
    if with_message_responses:
        seed["messageResponses"] = {
            "GET_STATE": {
                "ok": True,
                "state": state,
                "settings": settings,
                "snoozed": {},
                "sidebarOpenCount": 1,
            },
            "SYNC_NOW": {"ok": True, "state": state, "settings": settings},
            "STOP_BG_AUDIO_HANDOFF": {
                "ok": True,
                "skipped": True,
                "settings": settings,
                "activeBgApps": [],
            },
            "UPDATE_SETTINGS": {"ok": True, "settings": settings, "state": state},
            "UPDATE_PERSISTENT_SESSION": {"ok": True},
            "UPDATE_KEYBOARD_SHORTCUTS": {"ok": True, "settings": settings},
        }
    return seed


def _wrap_html_for_bridge(html_text: str, base_href: str) -> str:
    bridge_head = (
        f'<base href="{base_href}">\n'
        "<script>\n"
        "window.__pageErrors = window.__pageErrors || [];\n"
        "window.addEventListener('error', (e) => { window.__pageErrors.push('error: ' + String(e.message || e.error || 'error')); });\n"
        "window.addEventListener('unhandledrejection', (e) => { window.__pageErrors.push('rejection: ' + String(e.reason || 'rejection')); });\n"
        "if (window.parent && window.parent !== window) {\n"
        "  if (window.parent.browser) window.browser = window.parent.browser;\n"
        "  if (window.parent.chrome) window.chrome = window.parent.chrome;\n"
        "  if (window.parent.__webextMock) window.__webextMock = window.parent.__webextMock;\n"
        "}\n"
        f"{OFFLINE_FETCH_GUARD_JS}"
        "</script>\n"
    )
    if "<head>" in html_text.lower():
        idx = html_text.lower().find("<head>")
        end_idx = idx + len("<head>")
        return html_text[:end_idx] + "\n" + bridge_head + html_text[end_idx:]
    return bridge_head + html_text


class TestT1AppsNav(unittest.TestCase):
    server: FixtureServer
    fx: HeadlessFirefox

    @classmethod
    def setUpClass(cls) -> None:
        cls.server = FixtureServer(REPO_ROOT).start()
        try:
            cls.fx = HeadlessFirefox().start()
        except Exception:
            cls.server.stop()
            raise

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
        self.fx.navigate(self.server.url_for("/mock/echo"))
        self.fx.eval_js("try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}")
        self.fx.reset_to_blank()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _read_manifest(self) -> dict:
        manifest_path = REPO_ROOT / "manifest.json"
        self.assertTrue(manifest_path.is_file(), "manifest.json missing")
        return json.loads(manifest_path.read_text(encoding="utf-8"))

    def _manifest_commands(self) -> list[dict]:
        manifest = self._read_manifest()
        cmds = manifest.get("commands") or {}
        out = []
        for name, cfg in cmds.items():
            out.append({
                "name": name,
                "description": (cfg or {}).get("description", ""),
                "shortcut": ((cfg or {}).get("suggested_key") or {}).get("default", ""),
            })
        return out

    def _extract_html_script_srcs(self, html_path: Path) -> list[str]:
        self.assertTrue(html_path.is_file(), f"HTML file missing: {html_path}")
        parser = _ScriptSrcParser()
        parser.feed(html_path.read_text(encoding="utf-8"))
        return parser.srcs

    def _install_error_trap(self) -> None:
        self.fx.eval_js(ERROR_TRAP_JS)

    def _assert_no_js_errors(self, context: str) -> None:
        errs = self.fx.eval_js("return Array.isArray(window.__t1Errors) ? window.__t1Errors : [];")
        self.assertEqual(errs, [], f"Uncaught JS errors in {context}: {errs}")

    def _assert_no_bridge_errors(self, context: str) -> None:
        self._assert_no_js_errors(context)
        errs = self.fx.eval_js(
            """
            const out = [];
            const bg = document.getElementById('bg-frame');
            const ui = document.getElementById('ui-frame');
            if (bg && bg.contentWindow && Array.isArray(bg.contentWindow.__pageErrors)) {
              bg.contentWindow.__pageErrors.forEach((e) => out.push('bg: ' + e));
            }
            if (ui && ui.contentWindow && Array.isArray(ui.contentWindow.__pageErrors)) {
              ui.contentWindow.__pageErrors.forEach((e) => out.push('ui: ' + e));
            }
            return out;
            """
        )
        self.assertEqual(errs, [], f"Uncaught child frame JS errors in {context}: {errs}")

    def _probe_visible(self, selector: str) -> None:
        res = self.fx.eval_js(
            """
            const el = document.querySelector(arguments[0]);
            if (!el) return { ok: false, reason: 'Missing element: ' + arguments[0] };
            const cs = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const vis = (
              !el.classList.contains('hidden') &&
              cs.display !== 'none' &&
              cs.visibility !== 'hidden' &&
              Number(cs.opacity) !== 0 &&
              r.width > 0 &&
              r.height > 0
            );
            return { ok: vis, reason: vis ? '' : 'Element hidden or zero-sized: ' + arguments[0] };
            """,
            selector,
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))

    def _register_shared_fixture(self, name: str, script_paths: list[str], extra_body: str = "") -> str:
        scripts = "\n".join(f'<script src="{p}"></script>' for p in script_paths)
        html = (
            "<!doctype html><html><head><meta charset='utf-8'><title>Shared Harness</title>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            f"{scripts}"
            "</head><body>"
            f"{extra_body}"
            "</body></html>"
        )
        return self.server.register_fixture(name, html)

    def _open_popup_ready(
        self,
        path: str = "/src/popup/popup.html?sidebar=1",
        width: int = 440,
        height: int = 720,
        seed: dict | None = None,
    ) -> None:
        self.fx.set_viewport(width, height)
        self.server.set_seed(seed if seed is not None else _make_seed())
        self.fx.navigate(self.server.url_for(path))
        self._install_error_trap()
        ready = self.fx.eval_async_js(
            """
            try {
              const deadline = Date.now() + 4500;
              while (Date.now() < deadline) {
                const rail = document.getElementById('pm-rail-apps-list');
                const actions = document.querySelector('.pm-header-actions');
                if (document.readyState === 'complete' && window.FoxHubPopup && rail && actions && rail.children.length > 0) {
                  return { ok: true };
                }
                await new Promise((r) => setTimeout(r, 40));
              }
              return { ok: false, reason: 'Popup did not finish initial render' };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(ready["ok"], msg=ready.get("reason", ""))

    def _open_options_ready(
        self,
        width: int = 1200,
        height: int = 800,
        seed: dict | None = None,
    ) -> None:
        self.fx.set_viewport(width, height)
        self.server.set_seed(seed if seed is not None else _make_seed())
        self.fx.navigate(self.server.url_for("/src/options/options.html"))
        self._install_error_trap()
        ready = self.fx.eval_async_js(
            """
            try {
              const deadline = Date.now() + 4500;
              while (Date.now() < deadline) {
                const root = document.querySelector('[data-foxhub-settings-root], .fh-settings-root');
                if (document.readyState === 'complete' && root && root.children.length > 0) {
                  return { ok: true };
                }
                await new Promise((r) => setTimeout(r, 40));
              }
              return { ok: false, reason: 'Options page did not render unified settings root' };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(ready["ok"], msg=ready.get("reason", ""))

    def _boot_background_offline(
        self,
        settings_overrides: dict | None = None,
        tabs: list[dict] | None = None,
        raw_storage: dict | None = None,
    ) -> None:
        bg_html = REPO_ROOT / "src" / "background" / "background.html"
        srcs = self._extract_html_script_srcs(bg_html)
        script_tags: list[str] = []
        for rel in srcs:
            resolved = (bg_html.parent / rel).resolve()
            self.assertTrue(resolved.is_file(), f"background.html script missing: {rel}")
            web_path = "/" + resolved.relative_to(REPO_ROOT).as_posix()
            script_tags.append(f'<script src="{web_path}"></script>')

        guard_url = self.server.register_fixture(
            "t1_an_fetch_guard.js",
            OFFLINE_FETCH_GUARD_JS,
            content_type="application/javascript; charset=utf-8",
        )
        trap_url = self.server.register_fixture(
            "t1_an_err_trap.js",
            ERROR_TRAP_JS,
            content_type="application/javascript; charset=utf-8",
        )
        html = (
            "<!doctype html><html><head><meta charset='utf-8'><title>FoxHub BG Offline</title>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            f"<script src='{guard_url}'></script>"
            f"<script src='{trap_url}'></script>"
            "</head><body>\n"
            + "\n".join(script_tags)
            + "\n</body></html>"
        )
        bg_url = self.server.register_fixture("t1_an_bg_offline.html", html)

        seed = _make_seed(settings_overrides=settings_overrides, with_message_responses=False)
        seed["manifest"] = self._read_manifest()
        seed["commands"] = self._manifest_commands()
        if raw_storage is not None:
            seed["storage"] = raw_storage
        if tabs is not None:
            seed["tabs"] = tabs
        self.server.set_seed(seed)
        self.fx.navigate(bg_url)

        boot = self.fx.eval_async_js(
            """
            try {
              const deadline = Date.now() + 5000;
              while (Date.now() < deadline) {
                const bg = window.FoxHubBg;
                if (
                  bg &&
                  bg.state &&
                  bg.state.cachedState &&
                  Number(bg.state.cachedState.lastSyncAt) > 0 &&
                  typeof window.__pmGetSyncBootState === 'function'
                ) {
                  return { ok: true };
                }
                await new Promise((r) => setTimeout(r, 40));
              }
              return { ok: false, reason: 'Background offline harness did not finish boot' };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(boot["ok"], msg=boot.get("reason", ""))

    def _open_bridged_popup(
        self,
        settings_overrides: dict | None = None,
        raw_storage: dict | None = None,
        width: int = 460,
        height: int = 740,
    ) -> None:
        bg_path = REPO_ROOT / "src" / "background" / "background.html"
        ui_path = REPO_ROOT / "src" / "popup" / "popup.html"
        self.assertTrue(bg_path.is_file())
        self.assertTrue(ui_path.is_file())

        bg_wrapped = _wrap_html_for_bridge(bg_path.read_text(encoding="utf-8"), self.server.url_for("/src/background/"))
        ui_wrapped = _wrap_html_for_bridge(ui_path.read_text(encoding="utf-8"), self.server.url_for("/src/popup/"))
        bg_url = self.server.register_fixture("t1_an_bridge_bg.html", bg_wrapped)
        ui_url = self.server.register_fixture("t1_an_bridge_ui.html", ui_wrapped) + "?sidebar=1"

        host_html = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>FoxHub Bridged Test</title>
  <script src="/__test__/mock_seed.js"></script>
  <script src="/__test__/webext_mock.js"></script>
  <style>
    html, body {{ margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }}
    #bg-frame {{ position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; border: 0; }}
    #ui-frame {{ width: 100vw; height: 100vh; border: 0; display: block; }}
  </style>
</head>
<body>
  <script>
    window.__anBridgeReady = false;
    window.__anBridgeBoot = (async function () {{
      const bg = document.createElement('iframe');
      bg.id = 'bg-frame';
      bg.src = {json.dumps(bg_url)};
      document.body.appendChild(bg);
      await new Promise((resolve) => bg.addEventListener('load', resolve, {{ once: true }}));
      window.__webextMock.configure({{ backgroundPage: bg.contentWindow }});
      const bgDeadline = Date.now() + 3000;
      while (Date.now() < bgDeadline) {{
        const b = bg.contentWindow.FoxHubBg;
        if (b && b.state && b.state.cachedState && Number(b.state.cachedState.lastSyncAt) > 0) {{
          break;
        }}
        await new Promise((r) => setTimeout(r, 25));
      }}
      const ui = document.createElement('iframe');
      ui.id = 'ui-frame';
      ui.src = {json.dumps(ui_url)};
      document.body.appendChild(ui);
      await new Promise((resolve) => ui.addEventListener('load', resolve, {{ once: true }}));
      const uiDeadline = Date.now() + 3000;
      while (Date.now() < uiDeadline) {{
        const doc = ui.contentDocument;
        if (doc && doc.querySelector('#pm-rail-apps-list [data-app-id]')) break;
        await new Promise((r) => setTimeout(r, 25));
      }}
      await new Promise((r) => setTimeout(r, 80));
      window.__anBridgeReady = true;
    }})();
  </script>
</body>
</html>"""
        host_url = self.server.register_fixture("t1_an_bridge_host.html", host_html)

        seed = _make_seed(settings_overrides=settings_overrides, with_message_responses=False)
        seed["manifest"] = self._read_manifest()
        seed["commands"] = self._manifest_commands()
        if raw_storage is not None:
            seed["storage"] = raw_storage
        self.server.set_seed(seed)
        self.fx.set_viewport(width, height)
        self.fx.navigate(host_url)
        self._install_error_trap()
        ready = self.fx.eval_async_js(
            """
            try {
              await window.__anBridgeBoot;
              return { ok: Boolean(window.__anBridgeReady) };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(ready["ok"], msg=ready.get("reason", "Bridged popup failed to boot"))

    def _open_settings_drawer_toplevel(self) -> None:
        self._probe_visible("#rail-btn-sidebar-settings")
        self.fx.click("#rail-btn-sidebar-settings")
        opened = self.fx.eval_async_js(
            """
            try {
              const deadline = Date.now() + 2500;
              while (Date.now() < deadline) {
                const drawer = document.getElementById('pm-media-apps-drawer');
                const root = document.querySelector('#pm-settings-mount [data-foxhub-settings-root], #pm-settings-mount .fh-settings-root');
                if (drawer && !drawer.classList.contains('hidden') && root) {
                  return { ok: true };
                }
                await new Promise((r) => setTimeout(r, 40));
              }
              return { ok: false, reason: 'Settings drawer did not open' };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(opened["ok"], msg=opened.get("reason", ""))

    # ------------------------------------------------------------------
    # F9: Optional userChrome.css Companion Generator (5 tests)
    # ------------------------------------------------------------------
    def test_t1_f9_userchrome_card_renders_optional_badge_and_three_presets_in_drawer_and_options(self) -> None:
        # 1. Popup Settings Drawer
        self._open_popup_ready()
        self._open_settings_drawer_toplevel()
        drawer_probe = self.fx.eval_async_js(
            r"""
            try {
              const backupBtn = document.querySelector('[data-fh-cat="backup"], [data-settings-cat="backup"], [data-category="backup"], [data-cat="backup"]');
              if (backupBtn) backupBtn.click();
              await new Promise((r) => setTimeout(r, 80));
              const card = Array.from(document.querySelectorAll('#pm-settings-mount .fh-setting-card, #pm-settings-mount section, #pm-settings-mount div'))
                .find((el) => /userChrome\.css/i.test(el.textContent || '') && el.querySelectorAll('[data-userchrome-copy]').length >= 3);
              if (!card) return { ok: false, reason: 'userChrome.css card not found in popup drawer' };
              const pres = Array.from(card.querySelectorAll('pre, code')).map((n) => (n.textContent || '').trim()).filter((t) => t.length > 20);
              return {
                ok: true,
                text: card.textContent || '',
                copyCount: card.querySelectorAll('[data-userchrome-copy]').length,
                preCount: pres.length
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(drawer_probe["ok"], msg=drawer_probe.get("reason", ""))
        self.assertRegex(drawer_probe["text"], r"(?i)optional")
        self.assertIn("Hide Sidebar Header", drawer_probe["text"])
        self.assertIn("Hover-to-Expand", drawer_probe["text"])
        self.assertIn("Rounded", drawer_probe["text"])
        self.assertGreaterEqual(drawer_probe["copyCount"], 3)
        self.assertGreaterEqual(drawer_probe["preCount"], 3)
        self._assert_no_js_errors("F9 drawer")

        # 2. Options Page
        self._open_options_ready()
        options_probe = self.fx.eval_async_js(
            r"""
            try {
              const backupBtn = document.querySelector('[data-fh-cat="backup"], [data-settings-cat="backup"], [data-category="backup"], [data-cat="backup"]');
              if (backupBtn) backupBtn.click();
              await new Promise((r) => setTimeout(r, 80));
              const card = Array.from(document.querySelectorAll('.fh-setting-card, section, div'))
                .find((el) => /userChrome\.css/i.test(el.textContent || '') && el.querySelectorAll('[data-userchrome-copy]').length >= 3);
              if (!card) return { ok: false, reason: 'userChrome.css card not found on options.html' };
              return {
                ok: true,
                text: card.textContent || '',
                copyCount: card.querySelectorAll('[data-userchrome-copy]').length
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(options_probe["ok"], msg=options_probe.get("reason", ""))
        self.assertRegex(options_probe["text"], r"(?i)optional")
        self.assertGreaterEqual(options_probe["copyCount"], 3)
        self._assert_no_js_errors("F9 options")

    def test_t1_f9_copy_individual_presets_writes_valid_css_to_clipboard(self) -> None:
        self._open_popup_ready()
        self._open_settings_drawer_toplevel()

        setup = self.fx.eval_async_js(
            """
            try {
              window.__clipSpy = window.__webextMock.installClipboardSpy();
              const backupBtn = document.querySelector('[data-fh-cat="backup"], [data-settings-cat="backup"], [data-category="backup"], [data-cat="backup"]');
              if (backupBtn) backupBtn.click();
              await new Promise((r) => setTimeout(r, 80));
              const btns = Array.from(document.querySelectorAll('[data-userchrome-copy]'))
                .filter((b) => b.getAttribute('data-userchrome-copy') !== 'all');
              if (btns.length < 3) return { ok: false, reason: 'Expected 3 preset copy buttons, found ' + btns.length };
              btns.forEach((b, i) => b.setAttribute('data-t1-uc-btn', String(i)));
              return { ok: true, count: btns.length };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(setup["ok"], msg=setup.get("reason", ""))

        copied_snippets: list[str] = []
        for idx in range(3):
            sel = f'[data-t1-uc-btn="{idx}"]'
            self.fx.eval_js("document.querySelector(arguments[0]).scrollIntoView({ block: 'center' });", sel)
            self._probe_visible(sel)
            self.fx.click(sel)
            res = self.fx.eval_async_js(
                """
                try {
                  await new Promise((r) => setTimeout(r, 50));
                  return { ok: true, text: window.__clipSpy.getText() };
                } catch (err) {
                  return { ok: false, reason: String(err) };
                }
                """
            )
            self.assertTrue(res["ok"], msg=res.get("reason", ""))
            css_text = res["text"]
            self.assertIn("#sidebar-box", css_text)
            self.assertEqual(css_text.count("{"), css_text.count("}"), f"Unbalanced braces in preset {idx}")
            self.assertGreater(len(css_text.strip()), 25)
            copied_snippets.append(css_text)

        self.assertEqual(len(set(copied_snippets)), 3, "All 3 userChrome presets must copy distinct CSS")
        self._assert_no_js_errors("F9 copy individual presets")

    def test_t1_f9_copy_all_presets_combined_button(self) -> None:
        self._open_popup_ready()
        self._open_settings_drawer_toplevel()

        prep = self.fx.eval_async_js(
            """
            try {
              window.__clipSpy = window.__webextMock.installClipboardSpy();
              const backupBtn = document.querySelector('[data-fh-cat="backup"], [data-settings-cat="backup"], [data-category="backup"], [data-cat="backup"]');
              if (backupBtn) backupBtn.click();
              await new Promise((r) => setTimeout(r, 80));
              const allBtn = document.querySelector('[data-userchrome-copy="all"]') ||
                Array.from(document.querySelectorAll('#pm-settings-mount button')).find((b) => /copy all/i.test(b.textContent || ''));
              if (!allBtn) return { ok: false, reason: 'Copy All presets button missing' };
              allBtn.setAttribute('data-t1-uc-all', '1');
              allBtn.scrollIntoView({ block: 'center' });
              return { ok: true };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(prep["ok"], msg=prep.get("reason", ""))
        self._probe_visible('[data-t1-uc-all="1"]')
        self.fx.click('[data-t1-uc-all="1"]')

        check = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 50));
              const css = window.__clipSpy.getText();
              const st = document.createElement('style');
              st.textContent = css;
              document.head.appendChild(st);
              const ruleCount = st.sheet ? st.sheet.cssRules.length : 0;
              st.remove();
              return { ok: true, css, ruleCount };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(check["ok"], msg=check.get("reason", ""))
        self.assertIn("Hide Sidebar Header", check["css"])
        self.assertIn("Hover-to-Expand", check["css"])
        self.assertIn("Rounded", check["css"])
        self.assertGreaterEqual(check["ruleCount"], 3)
        self._assert_no_js_errors("F9 copy all combined")

    def test_t1_f9_search_filter_surfaces_userchrome_card(self) -> None:
        self._open_popup_ready()
        self._open_settings_drawer_toplevel()

        search_probe = self.fx.eval_js(
            """
            const inp = Array.from(document.querySelectorAll('#pm-settings-mount input[type="search"], #pm-settings-mount input[type="text"]'))
              .find((i) => /search|filter/i.test((i.placeholder || '') + ' ' + (i.getAttribute('aria-label') || '')));
            if (!inp) return { ok: false, reason: 'Unified settings search input not found' };
            inp.setAttribute('data-t1-settings-search', '1');
            return { ok: true };
            """
        )
        self.assertTrue(search_probe["ok"], msg=search_probe.get("reason", ""))
        self._probe_visible('[data-t1-settings-search="1"]')
        self.fx.type_text('[data-t1-settings-search="1"]', "userChrome")

        found = self.fx.eval_async_js(
            r"""
            try {
              await new Promise((r) => setTimeout(r, 80));
              const card = Array.from(document.querySelectorAll('#pm-settings-mount .fh-setting-card, #pm-settings-mount section, #pm-settings-mount div'))
                .find((el) => {
                  if (!/userChrome\.css/i.test(el.textContent || '')) return false;
                  const cs = window.getComputedStyle(el);
                  const r = el.getBoundingClientRect();
                  return cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 20;
                });
              return { ok: Boolean(card) };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(found["ok"], "Typing 'userChrome' in settings search must surface userChrome.css card")
        self._assert_no_js_errors("F9 search filter")

    def test_t1_f9_extension_and_settings_operate_normally_without_userchrome(self) -> None:
        manifest = self._read_manifest()
        perms = manifest.get("permissions", [])
        self.assertNotIn("nativeMessaging", perms)
        self.assertFalse((REPO_ROOT / "userChrome.css").exists())

        self._open_popup_ready()
        probe = self.fx.eval_js(
            """
            const railItems = document.querySelectorAll('#pm-rail-apps-list [data-app-id]');
            const mailList = document.getElementById('pm-email-list');
            return {
              railCount: railItems.length,
              mailVisible: Boolean(mailList && mailList.children.length > 0)
            };
            """
        )
        self.assertGreaterEqual(probe["railCount"], 10)
        self.assertTrue(probe["mailVisible"])
        self._assert_no_js_errors("F9 operates normally without userChrome")

    # ------------------------------------------------------------------
    # F11: Right-Click contextMenus ("Open in FoxHub") (5 tests)
    # ------------------------------------------------------------------
    def test_t1_f11_background_registers_page_and_link_context_menus_on_startup(self) -> None:
        self._boot_background_offline(settings_overrides={"contextMenuEnabled": True})
        menus = mock_helpers.get_context_menus(self.fx)
        by_id = {m.get("id"): m for m in menus}
        self.assertIn("foxhub-open-page", by_id)
        self.assertIn("foxhub-open-link", by_id)
        self.assertEqual(by_id["foxhub-open-page"].get("contexts"), ["page"])
        self.assertEqual(by_id["foxhub-open-link"].get("contexts"), ["link"])
        self.assertEqual(by_id["foxhub-open-page"].get("documentUrlPatterns"), ["http://*/*", "https://*/*"])
        self.assertEqual(by_id["foxhub-open-link"].get("targetUrlPatterns"), ["http://*/*", "https://*/*"])
        self._assert_no_js_errors("F11 context menu registration")

    def test_t1_f11_context_menu_toggle_updates_registration_live(self) -> None:
        self._boot_background_offline(settings_overrides={"contextMenuEnabled": True})
        self.assertEqual(len(mock_helpers.get_context_menus(self.fx)), 2)

        off_res = self.fx.eval_async_js(
            """
            try {
              const r = await browser.runtime.sendMessage({
                type: 'UPDATE_SETTINGS',
                settings: { contextMenuEnabled: false }
              });
              await new Promise((res) => setTimeout(res, 40));
              return { ok: true, r };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(off_res["ok"], msg=off_res.get("reason", ""))
        self.assertEqual(mock_helpers.get_context_menus(self.fx), [])

        on_res = self.fx.eval_async_js(
            """
            try {
              const r = await browser.runtime.sendMessage({
                type: 'UPDATE_SETTINGS',
                settings: { contextMenuEnabled: true }
              });
              await new Promise((res) => setTimeout(res, 40));
              return { ok: true, r };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(on_res["ok"], msg=on_res.get("reason", ""))
        ids = {m.get("id") for m in mock_helpers.get_context_menus(self.fx)}
        self.assertEqual(ids, {"foxhub-open-page", "foxhub-open-link"})
        self._assert_no_js_errors("F11 context menu live toggle")

    def test_t1_f11_clicking_link_and_page_menu_items_opens_sidebar_and_sets_pending_url(self) -> None:
        self._boot_background_offline(
            settings_overrides={"contextMenuEnabled": True, "contextMenuOpenBehavior": "sidebar"}
        )
        mock_helpers.clear_calls(self.fx)
        mock_helpers.trigger_context_menu_click(
            self.fx,
            "foxhub-open-link",
            link_url="https://example.org/link",
            page_url="https://example.org/host",
        )
        link_probe = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 40));
              const sidebarCalls = window.__webextMock.getCalls('sidebarAction.open');
              const msgCalls = window.__webextMock.getCalls('runtime.sendMessage')
                .map((c) => c.args && c.args[0])
                .filter((m) => m && m.type === 'OPEN_URL_IN_SIDEBAR');
              const bootState = window.__pmGetSyncBootState();
              const stateRes = await browser.runtime.sendMessage({ type: 'GET_STATE' });
              return { ok: true, sidebarCalls, msgCalls, bootState, stateRes };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(link_probe["ok"], msg=link_probe.get("reason", ""))
        self.assertGreaterEqual(len(link_probe["sidebarCalls"]), 1)
        self.assertTrue(any(m.get("url") == "https://example.org/link" for m in link_probe["msgCalls"]))
        self.assertEqual(
            (link_probe["bootState"].get("pendingContextUrl") or {}).get("url"),
            "https://example.org/link",
        )
        self.assertEqual(
            (link_probe["stateRes"].get("pendingContextUrl") or {}).get("url"),
            "https://example.org/link",
        )

        mock_helpers.clear_calls(self.fx)
        mock_helpers.trigger_context_menu_click(
            self.fx,
            "foxhub-open-page",
            page_url="https://example.org/page",
        )
        page_probe = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 40));
              const bootState = window.__pmGetSyncBootState();
              return { ok: true, bootState };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(page_probe["ok"], msg=page_probe.get("reason", ""))
        self.assertEqual(
            (page_probe["bootState"].get("pendingContextUrl") or {}).get("url"),
            "https://example.org/page",
        )
        self._assert_no_js_errors("F11 context menu link and page click")

    def test_t1_f11_popout_behavior_opens_companion_window_with_encoded_url(self) -> None:
        self._boot_background_offline(
            settings_overrides={"contextMenuEnabled": True, "contextMenuOpenBehavior": "popout"}
        )
        mock_helpers.clear_calls(self.fx)
        mock_helpers.trigger_context_menu_click(
            self.fx,
            "foxhub-open-link",
            link_url="https://example.org/pop?a=1",
        )
        probe = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 50));
              const winCalls = window.__webextMock.getCalls('windows.create');
              return { ok: true, winCalls };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(probe["ok"], msg=probe.get("reason", ""))
        self.assertGreaterEqual(len(probe["winCalls"]), 1)
        created_url = (probe["winCalls"][-1].get("args") or [{}])[0].get("url", "")
        self.assertIn("src/popup/popup.html?popout=1", created_url)
        self.assertIn("url=https%3A%2F%2Fexample.org%2Fpop%3Fa%3D1", created_url)
        self._assert_no_js_errors("F11 popout context menu")

    def test_t1_f11_popup_workspace_loads_context_url_into_frame_pool(self) -> None:
        target_url = self.server.url_for("/mock/custom/ctxtest")
        bg_path = REPO_ROOT / "src" / "background" / "background.html"
        ui_path = REPO_ROOT / "src" / "popup" / "popup.html"
        self.assertTrue(bg_path.is_file())
        self.assertTrue(ui_path.is_file())

        bg_wrapped = _wrap_html_for_bridge(bg_path.read_text(encoding="utf-8"), self.server.url_for("/src/background/"))
        ui_wrapped = _wrap_html_for_bridge(ui_path.read_text(encoding="utf-8"), self.server.url_for("/src/popup/"))
        bg_url = self.server.register_fixture("t1_an_f11_bg.html", bg_wrapped)
        ui_url = self.server.register_fixture("t1_an_f11_ui.html", ui_wrapped) + "?sidebar=1"

        host_html = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>FoxHub F11 Bridge</title>
  <script src="/__test__/mock_seed.js"></script>
  <script src="/__test__/webext_mock.js"></script>
  <style>
    html, body {{ margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }}
    #bg-frame {{ position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; border: 0; }}
    #ui-frame {{ width: 100vw; height: 100vh; border: 0; display: block; }}
  </style>
</head>
<body>
  <script>
    window.__f11Run = (async function () {{
      const bg = document.createElement('iframe');
      bg.id = 'bg-frame';
      bg.src = {json.dumps(bg_url)};
      document.body.appendChild(bg);
      await new Promise((r) => bg.addEventListener('load', r, {{ once: true }}));
      window.__webextMock.configure({{ backgroundPage: bg.contentWindow }});
      const bgDeadline = Date.now() + 3000;
      while (Date.now() < bgDeadline) {{
        const b = bg.contentWindow.FoxHubBg;
        if (b && b.state && b.state.cachedState && Number(b.state.cachedState.lastSyncAt) > 0) break;
        await new Promise((r) => setTimeout(r, 25));
      }}
      await window.__webextMock.contextMenus.triggerClick(
        {{ menuItemId: 'foxhub-open-link', linkUrl: {json.dumps(target_url)}, pageUrl: {json.dumps(target_url)} }},
        {{ id: 2, url: 'https://parent.test/' }}
      );
      const ui = document.createElement('iframe');
      ui.id = 'ui-frame';
      ui.src = {json.dumps(ui_url)};
      document.body.appendChild(ui);
      await new Promise((r) => ui.addEventListener('load', r, {{ once: true }}));
      const uiDeadline = Date.now() + 3000;
      while (Date.now() < uiDeadline) {{
        const doc = ui.contentDocument;
        const ws = doc && doc.getElementById('pm-media-workspace');
        const matched = doc && Array.from(doc.querySelectorAll('#pm-media-frame-pool iframe'))
          .find((f) => (f.src || f.getAttribute('src') || '').includes('/mock/custom/ctxtest'));
        if (ws && !ws.classList.contains('hidden') && matched) {{
          return {{
            ok: true,
            frameSrc: matched.src || matched.getAttribute('src') || '',
            pendingLeft: bg.contentWindow.__pmGetSyncBootState().pendingContextUrl
          }};
        }}
        await new Promise((r) => setTimeout(r, 40));
      }}
      return {{ ok: false, reason: 'Workspace did not load context URL into frame pool' }};
    }})();
  </script>
</body>
</html>"""
        host_url = self.server.register_fixture("t1_an_f11_host.html", host_html)
        seed = _make_seed(
            settings_overrides={"contextMenuEnabled": True, "contextMenuOpenBehavior": "sidebar"},
            with_message_responses=False,
        )
        seed["manifest"] = self._read_manifest()
        seed["commands"] = self._manifest_commands()
        self.server.set_seed(seed)
        self.fx.set_viewport(460, 740)
        self.fx.navigate(host_url)
        self._install_error_trap()

        res = self.fx.eval_async_js(
            """
            try {
              return await window.__f11Run;
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertIn("/mock/custom/ctxtest", res["frameSrc"])
        self.assertIsNone(res["pendingLeft"], "pendingContextUrl should be consumed once loaded")
        self._assert_no_bridge_errors("F11 popup workspace context URL")

    # ------------------------------------------------------------------
    # F12: Pro Controls for Custom Websites (6 tests)
    # ------------------------------------------------------------------
    def test_t1_f12_create_custom_app_via_settings_drawer_pins_to_left_rail(self) -> None:
        self._open_bridged_popup()
        linear_url = self.server.url_for("/mock/custom/linear")

        res = self.fx.eval_async_js(
            """
            try {
              const uiWin = document.getElementById('ui-frame').contentWindow;
              const uiDoc = document.getElementById('ui-frame').contentDocument;
              uiDoc.getElementById('rail-btn-sidebar-settings')?.click();
              await new Promise((r) => setTimeout(r, 100));
              const appsBtn = uiDoc.querySelector('[data-fh-cat="apps"], [data-settings-cat="apps"], [data-category="apps"], [data-cat="apps"]');
              if (appsBtn) appsBtn.click();
              await new Promise((r) => setTimeout(r, 80));

              const nameInp = uiDoc.getElementById('input-custom-app-name');
              const urlInp = uiDoc.getElementById('input-custom-app-url');
              const colorInp = uiDoc.getElementById('input-custom-app-color');
              const uaSel = (urlInp && urlInp.parentElement ? urlInp.parentElement.querySelector('select') : null) ||
                uiDoc.querySelector('#input-custom-app-ua, select[data-custom-ua], [data-fh-custom-ua]');
              const addBtn = uiDoc.getElementById('btn-add-custom-app');
              if (!nameInp || !urlInp || !addBtn) {
                return { ok: false, reason: 'Custom app creation inputs missing in settings drawer' };
              }
              nameInp.value = 'Linear';
              nameInp.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
              urlInp.value = arguments[0];
              urlInp.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
              if (colorInp) {
                colorInp.value = '#5e6ad2';
                colorInp.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
              }
              if (uaSel) {
                uaSel.value = 'mobile';
                uaSel.dispatchEvent(new uiWin.Event('change', { bubbles: true }));
              }
              addBtn.click();
              await new Promise((r) => setTimeout(r, 250));

              const stored = await browser.storage.local.get('settings');
              const customs = stored.settings?.customMediaApps || [];
              const railBtn = uiDoc.querySelector('#pm-rail-apps-list [data-app-id^="custom-"]');
              return { ok: true, customs, hasRailBtn: Boolean(railBtn) };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """,
            linear_url,
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertTrue(res["hasRailBtn"], "New custom app must pin to #pm-rail-apps-list")
        self.assertEqual(len(res["customs"]), 1)
        self.assertEqual(res["customs"][0]["name"], "Linear")
        self.assertEqual(res["customs"][0]["userAgentMode"], "mobile")
        self._assert_no_bridge_errors("F12 create custom app")

    def test_t1_f12_pro_edit_modal_updates_name_color_icon_url_and_ua_mode(self) -> None:
        mysite_url = self.server.url_for("/mock/custom/mysite")
        icon_url = self.server.url_for("/icons/icon-32.png")
        self._open_bridged_popup(
            settings_overrides={
                "customMediaApps": [
                    {
                        "id": "custom-0",
                        "name": "MySite",
                        "url": mysite_url,
                        "color": "#112233",
                        "iconUrl": "",
                        "enabled": True,
                        "userAgentMode": "default",
                    }
                ]
            }
        )

        res = self.fx.eval_async_js(
            """
            try {
              const uiWin = document.getElementById('ui-frame').contentWindow;
              const uiDoc = document.getElementById('ui-frame').contentDocument;
              uiDoc.getElementById('rail-btn-sidebar-settings')?.click();
              await new Promise((r) => setTimeout(r, 100));
              const appsBtn = uiDoc.querySelector('[data-fh-cat="apps"], [data-settings-cat="apps"], [data-category="apps"], [data-cat="apps"]');
              if (appsBtn) appsBtn.click();
              await new Promise((r) => setTimeout(r, 80));

              const list = uiDoc.getElementById('pm-custom-apps-list');
              const editBtn = list ? Array.from(list.querySelectorAll('button')).find((b) => /edit/i.test(b.textContent || '')) : null;
              if (!editBtn) return { ok: false, reason: 'Edit button missing for custom app' };
              editBtn.click();
              await new Promise((r) => setTimeout(r, 80));

              const modal = uiDoc.getElementById('pm-custom-app-edit-modal');
              if (!modal || modal.classList.contains('hidden')) {
                return { ok: false, reason: 'Custom app edit modal did not open' };
              }
              const nameInp = modal.querySelector('input[type="text"], #pm-edit-app-name');
              const urlInp = modal.querySelector('input[type="url"], #pm-edit-app-url');
              const colorInp = modal.querySelector('input[type="color"], #pm-edit-app-color');
              const iconInp = Array.from(modal.querySelectorAll('input')).find((i) =>
                /icon/i.test((i.id || '') + ' ' + (i.placeholder || '') + ' ' + (i.getAttribute('aria-label') || ''))
              );
              const desktopPill = modal.querySelector('[data-ua-mode="desktop"]');
              const saveBtn = Array.from(modal.querySelectorAll('button')).find((b) => /save/i.test(b.textContent || ''));
              if (!nameInp || !desktopPill || !saveBtn) {
                return { ok: false, reason: 'Edit modal fields missing' };
              }
              nameInp.value = 'MySite Pro';
              nameInp.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
              if (urlInp) {
                urlInp.value = arguments[0];
                urlInp.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
              }
              if (colorInp) {
                colorInp.value = '#228844';
                colorInp.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
              }
              if (iconInp) {
                iconInp.value = arguments[1];
                iconInp.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
              }
              desktopPill.click();
              saveBtn.click();
              await new Promise((r) => setTimeout(r, 250));

              const stored = await browser.storage.local.get('settings');
              const rowText = (uiDoc.getElementById('pm-custom-apps-list')?.textContent || '');
              return { ok: true, updated: stored.settings?.customMediaApps?.[0] || null, rowText };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """,
            mysite_url,
            icon_url,
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertIsNotNone(res["updated"])
        self.assertEqual(res["updated"]["name"], "MySite Pro")
        self.assertEqual(res["updated"]["color"].lower(), "#228844")
        self.assertEqual(res["updated"]["iconUrl"], icon_url)
        self.assertEqual(res["updated"]["userAgentMode"], "desktop")
        self.assertIn("MySite Pro", res["rowText"])
        self.assertIn("Desktop UA", res["rowText"])
        self._assert_no_bridge_errors("F12 pro edit modal")

    def test_t1_f12_custom_app_icon_upload_persists_data_url(self) -> None:
        url = self._register_shared_fixture(
            "t1_f12_icon_dataurl.html",
            ["/src/shared/settings-schema.js", "/src/shared/media-apps.js"],
            "<div id='icon-host'></div>",
        )
        self.server.set_seed({})
        self.fx.navigate(url)
        self._install_error_trap()

        data_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        res = self.fx.eval_js(
            """
            const schema = window.FoxHubSettingsSchema;
            const apps = window.FoxHubMediaApps;
            const normalized = schema.normalizeSettings({
              customMediaApps: [{
                id: 'custom-0',
                name: 'Uploaded',
                url: 'https://uploaded.example.test/',
                color: '#336699',
                iconUrl: arguments[0],
                enabled: true,
                userAgentMode: 'mobile'
              }]
            });
            const mapped = apps.mapCustomApps(normalized);
            const iconEl = apps.createAppSvgIcon('custom-0', 18, mapped);
            document.getElementById('icon-host').appendChild(iconEl);
            const img = iconEl.tagName === 'IMG' ? iconEl : iconEl.querySelector('img');
            return {
              normIcon: normalized.customMediaApps[0].iconUrl,
              mappedIcon: mapped[0].iconUrl,
              imgSrc: img ? img.getAttribute('src') : null
            };
            """,
            data_url,
        )
        self.assertEqual(res["normIcon"], data_url)
        self.assertEqual(res["mappedIcon"], data_url)
        self.assertEqual(res["imgSrc"], data_url)
        self._assert_no_js_errors("F12 custom icon data URL")

    def test_t1_f12_webrequest_applies_mobile_and_desktop_ua_for_foxhub_frames(self) -> None:
        customs = [
            {
                "id": "custom-0",
                "name": "MobileSite",
                "url": "https://mobile-site.example.test/",
                "color": "#111111",
                "enabled": True,
                "userAgentMode": "mobile",
            },
            {
                "id": "custom-1",
                "name": "DesktopSite",
                "url": "https://desktop-site.example.test/",
                "color": "#222222",
                "enabled": True,
                "userAgentMode": "desktop",
            },
        ]
        self._boot_background_offline(settings_overrides={"customMediaApps": customs})
        ext_origin = self.server.base_url
        popup_origin_url = f"{ext_origin}/src/popup/popup.html?sidebar=1"
        base_headers = [{"name": "User-Agent", "value": "OriginalTestAgent/1.0"}]

        mob_res = mock_helpers.trigger_before_send_headers(
            self.fx,
            "https://mobile-site.example.test/home",
            request_headers=base_headers,
            req_type="sub_frame",
            tab_id=-1,
            origin_url=popup_origin_url,
            document_url=popup_origin_url,
        )
        mob_ua = next(
            (h["value"] for h in (mob_res.get("requestHeaders") or []) if h.get("name", "").lower() == "user-agent"),
            "",
        )
        self.assertIn("Android", mob_ua)
        self.assertIn("Mobile", mob_ua)

        desk_res = mock_helpers.trigger_before_send_headers(
            self.fx,
            "https://desktop-site.example.test/app",
            request_headers=base_headers,
            req_type="sub_frame",
            tab_id=-1,
            origin_url=popup_origin_url,
            document_url=popup_origin_url,
        )
        desk_ua = next(
            (h["value"] for h in (desk_res.get("requestHeaders") or []) if h.get("name", "").lower() == "user-agent"),
            "",
        )
        self.assertIn("Windows NT", desk_ua)
        self.assertNotIn("Android", desk_ua)

        ext_res = mock_helpers.trigger_before_send_headers(
            self.fx,
            "https://mobile-site.example.test/home",
            request_headers=base_headers,
            req_type="main_frame",
            tab_id=5,
            origin_url="https://other.example.test/",
            document_url="https://other.example.test/",
        )
        ext_headers = ext_res.get("requestHeaders") if isinstance(ext_res, dict) else None
        if ext_headers:
            ext_ua = next((h["value"] for h in ext_headers if h.get("name", "").lower() == "user-agent"), "")
            self.assertEqual(ext_ua, "OriginalTestAgent/1.0")
        self._assert_no_js_errors("F12 webRequest UA override")

    def test_t1_f12_custom_app_workspace_shows_ua_badge_and_reloads_on_edit(self) -> None:
        ua_url = self.server.url_for("/mock/custom/uaapp")
        self._open_bridged_popup(
            settings_overrides={
                "customMediaApps": [
                    {
                        "id": "custom-0",
                        "name": "UAApp",
                        "url": ua_url,
                        "color": "#5533AA",
                        "iconUrl": "",
                        "enabled": True,
                        "userAgentMode": "mobile",
                    }
                ]
            }
        )

        res = self.fx.eval_async_js(
            """
            try {
              const uiDoc = document.getElementById('ui-frame').contentDocument;
              const btn = uiDoc.querySelector('#pm-rail-apps-list [data-app-id="custom-0"]');
              if (!btn) return { ok: false, reason: 'Custom app rail button missing' };
              btn.click();
              await new Promise((r) => setTimeout(r, 120));

              const badge1 = uiDoc.getElementById('media-ua-badge');
              const frame1 = uiDoc.querySelector('#pm-media-frame-pool iframe[data-app-id="custom-0"]');
              const badge1Text = badge1 ? badge1.textContent.trim() : '';
              const badge1Hidden = Boolean(!badge1 || badge1.classList.contains('hidden'));
              const frame1Name = frame1 ? frame1.name : '';

              // Edit UA mode to desktop via settings drawer
              uiDoc.getElementById('rail-btn-sidebar-settings')?.click();
              await new Promise((r) => setTimeout(r, 80));
              const appsBtn = uiDoc.querySelector('[data-fh-cat="apps"], [data-settings-cat="apps"], [data-category="apps"], [data-cat="apps"]');
              if (appsBtn) appsBtn.click();
              await new Promise((r) => setTimeout(r, 80));

              const editBtn = Array.from(uiDoc.querySelectorAll('#pm-custom-apps-list button'))
                .find((b) => /edit/i.test(b.textContent || ''));
              if (!editBtn) return { ok: false, reason: 'Edit button missing' };
              editBtn.click();
              await new Promise((r) => setTimeout(r, 60));

              const modal = uiDoc.getElementById('pm-custom-app-edit-modal');
              const deskPill = modal ? modal.querySelector('[data-ua-mode="desktop"]') : null;
              const saveBtn = modal ? Array.from(modal.querySelectorAll('button')).find((b) => /save/i.test(b.textContent || '')) : null;
              if (!deskPill || !saveBtn) return { ok: false, reason: 'Desktop pill or save button missing' };
              deskPill.click();
              saveBtn.click();
              await new Promise((r) => setTimeout(r, 180));

              const frame2 = uiDoc.querySelector('#pm-media-frame-pool iframe[data-app-id="custom-0"]');
              return {
                ok: true,
                badge1Text,
                badge1Hidden,
                frame1Name,
                frame2Name: frame2 ? frame2.name : '',
                badge2Text: uiDoc.getElementById('media-ua-badge')?.textContent?.trim() || ''
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertFalse(res["badge1Hidden"], "#media-ua-badge must be visible for Mobile UA custom app")
        self.assertEqual(res["badge1Text"], "Mobile UA")
        self.assertIn("__pmua=mobile", res["frame1Name"])
        self.assertIn("__pmua=desktop", res["frame2Name"])
        self._assert_no_bridge_errors("F12 workspace UA badge and reload")

    def test_t1_f12_remove_custom_app_cleans_settings_and_rail(self) -> None:
        self._open_bridged_popup(
            settings_overrides={
                "customMediaApps": [
                    {
                        "id": "custom-0",
                        "name": "TempSite",
                        "url": self.server.url_for("/mock/custom/temp"),
                        "color": "#AA2244",
                        "iconUrl": "",
                        "enabled": True,
                        "userAgentMode": "default",
                    }
                ]
            }
        )

        res = self.fx.eval_async_js(
            """
            try {
              const uiDoc = document.getElementById('ui-frame').contentDocument;
              const hadRailBefore = Boolean(uiDoc.querySelector('#pm-rail-apps-list [data-app-id="custom-0"]'));
              uiDoc.getElementById('rail-btn-sidebar-settings')?.click();
              await new Promise((r) => setTimeout(r, 80));
              const appsBtn = uiDoc.querySelector('[data-fh-cat="apps"], [data-settings-cat="apps"], [data-category="apps"], [data-cat="apps"]');
              if (appsBtn) appsBtn.click();
              await new Promise((r) => setTimeout(r, 80));

              const remBtn = Array.from(uiDoc.querySelectorAll('#pm-custom-apps-list button'))
                .find((b) => /remove|delete/i.test(b.textContent || ''));
              if (!remBtn) return { ok: false, reason: 'Remove button missing for custom app' };
              remBtn.click();
              await new Promise((r) => setTimeout(r, 200));

              const stored = await browser.storage.local.get('settings');
              const hasRailAfter = Boolean(uiDoc.querySelector('#pm-rail-apps-list [data-app-id="custom-0"]'));
              return {
                ok: true,
                hadRailBefore,
                hasRailAfter,
                customCount: (stored.settings?.customMediaApps || []).length
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertTrue(res["hadRailBefore"])
        self.assertFalse(res["hasRailAfter"])
        self.assertEqual(res["customCount"], 0)
        self._assert_no_bridge_errors("F12 remove custom app")

    # ------------------------------------------------------------------
    # F13: Expanded Built-In App Presets (+ Gemini preserved) (5 tests)
    # ------------------------------------------------------------------
    def test_t1_f13_catalog_contains_all_21_builtin_apps_including_gemini_and_new_8(self) -> None:
        url = self._register_shared_fixture(
            "t1_f13_catalog.html",
            ["/src/shared/media-apps.js", "/src/shared/settings-schema.js"],
        )
        self.server.set_seed({})
        self.fx.navigate(url)
        self._install_error_trap()

        res = self.fx.eval_js(
            """
            const api = window.FoxHubMediaApps;
            const schema = window.FoxHubSettingsSchema;
            if (!api || !schema) return { ok: false, reason: 'Shared API missing' };
            const byId = Object.fromEntries(api.BUILTIN_MEDIA_APPS.map((a) => [a.id, a]));
            return {
              ok: true,
              aliasOk: window.PocketMailMediaApps === api,
              ids: api.BUILTIN_MEDIA_APPS.map((a) => a.id),
              defaultEnabled: api.DEFAULT_ENABLED_APP_IDS,
              schemaDefaultEnabled: schema.DEFAULT_SETTINGS.enabledMediaApps,
              gemini: byId['gemini'] || null,
              soundcloud: byId['soundcloud'] || null,
              appleMusic: byId['apple-music'] || null
            };
            """
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertTrue(res["aliasOk"])
        self.assertEqual(set(res["ids"]), set(ALL_21_BUILTIN_IDS))
        self.assertEqual(len(res["ids"]), 21)
        self.assertEqual(res["defaultEnabled"], DEFAULT_10_PINNED)
        self.assertEqual(res["schemaDefaultEnabled"], DEFAULT_10_PINNED)
        self.assertIsNotNone(res["gemini"])
        self.assertEqual(res["gemini"]["defaultUrl"], "https://gemini.google.com/app")
        self.assertTrue(res["soundcloud"]["bgAudioSupported"])
        self._assert_no_js_errors("F13 catalog 21 presets")

    def test_t1_f13_fresh_install_keeps_extra_presets_unpinned_and_hidden_from_rail(self) -> None:
        self._open_bridged_popup(raw_storage={})
        probe = self.fx.eval_js(
            """
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const ids = Array.from(uiDoc.querySelectorAll('#pm-rail-apps-list [data-app-id]'))
              .map((el) => el.getAttribute('data-app-id'));
            return { ids };
            """
        )
        self.assertEqual(set(probe["ids"]), set(DEFAULT_10_PINNED))
        for hidden_id in UNPINNED_11_PRESETS:
            self.assertNotIn(hidden_id, probe["ids"], f"Extra preset {hidden_id} must be unpinned on fresh install")
        self._assert_no_bridge_errors("F13 fresh install hidden presets")

    def test_t1_f13_all_21_builtin_apps_render_valid_createElementNS_svg_icons(self) -> None:
        url = self._register_shared_fixture(
            "t1_f13_svg_icons.html",
            ["/src/shared/media-apps.js"],
            "<div id='svg-host'></div>",
        )
        self.server.set_seed({})
        self.fx.navigate(url)
        self._install_error_trap()

        res = self.fx.eval_js(
            """
            const api = window.FoxHubMediaApps;
            const host = document.getElementById('svg-host');
            const out = [];
            for (const id of [...arguments[0], 'pocketmail']) {
              const svg = api.createAppSvgIcon(id, 18);
              host.appendChild(svg);
              const r = svg.getBoundingClientRect();
              out.push({
                id,
                tag: svg.tagName.toLowerCase(),
                ns: svg.namespaceURI,
                viewBox: svg.getAttribute('viewBox'),
                childCount: svg.children.length,
                w: r.width,
                h: r.height
              });
            }
            return out;
            """,
            ALL_21_BUILTIN_IDS,
        )
        self.assertEqual(len(res), 22)
        for item in res:
            self.assertEqual(item["tag"], "svg", f"Expected svg element for {item['id']}")
            self.assertEqual(item["ns"], "http://www.w3.org/2000/svg")
            self.assertEqual(item["viewBox"], "0 0 24 24")
            self.assertGreaterEqual(item["childCount"], 1, f"SVG for {item['id']} must have shape children")
            self.assertGreater(item["w"], 0)
            self.assertGreater(item["h"], 0)
        self._assert_no_js_errors("F13 createElementNS SVG icons")

    def test_t1_f13_enable_new_presets_in_settings_pins_to_rail_and_opens_workspace(self) -> None:
        self._open_bridged_popup(raw_storage={})

        res = self.fx.eval_async_js(
            """
            try {
              const uiDoc = document.getElementById('ui-frame').contentDocument;
              uiDoc.getElementById('rail-btn-sidebar-settings')?.click();
              await new Promise((r) => setTimeout(r, 100));
              const appsBtn = uiDoc.querySelector('[data-fh-cat="apps"], [data-settings-cat="apps"], [data-category="apps"], [data-cat="apps"]');
              if (appsBtn) appsBtn.click();
              await new Promise((r) => setTimeout(r, 80));

              const findAppPinBtn = (appId, nameRx) => {
                const row = uiDoc.querySelector(`[data-app-row="${appId}"], [data-builtin-app="${appId}"]`) ||
                  Array.from(uiDoc.querySelectorAll('#pm-settings-mount [data-app-id], #pm-settings-mount .fh-app-row, #pm-settings-mount .pm-app-manage-row'))
                    .find((el) => nameRx.test(el.textContent || ''));
                if (!row) return null;
                return row.querySelector('button[data-pin-toggle], button') || row;
              };

              const catalogText = uiDoc.getElementById('pm-settings-mount')?.textContent || '';
              const claudeBtn = findAppPinBtn('claude', /Claude/);
              if (!claudeBtn) {
                return { ok: false, reason: 'Claude pin button missing in settings catalog' };
              }
              claudeBtn.click();
              const waitClaude = Date.now() + 2000;
              while (Date.now() < waitClaude && !uiDoc.querySelector('#pm-rail-apps-list [data-app-id="claude"]')) {
                await new Promise((r) => setTimeout(r, 30));
              }
              await new Promise((r) => setTimeout(r, 60));

              const geminiBtn = findAppPinBtn('gemini', /Gemini/);
              if (!geminiBtn) {
                return { ok: false, reason: 'Gemini pin button missing in settings catalog' };
              }
              geminiBtn.click();
              const waitGemini = Date.now() + 2000;
              while (Date.now() < waitGemini && !uiDoc.querySelector('#pm-rail-apps-list [data-app-id="gemini"]')) {
                await new Promise((r) => setTimeout(r, 30));
              }

              const railIds = Array.from(uiDoc.querySelectorAll('#pm-rail-apps-list [data-app-id]'))
                .map((el) => el.getAttribute('data-app-id'));
              const claudeRail = uiDoc.querySelector('#pm-rail-apps-list [data-app-id="claude"]');
              if (!claudeRail) return { ok: false, reason: 'Claude did not pin to left rail', railIds };
              claudeRail.click();
              await new Promise((r) => setTimeout(r, 100));

              const ws = uiDoc.getElementById('pm-media-workspace');
              const activeTitle = uiDoc.getElementById('media-active-title')?.textContent?.trim() || '';
              return {
                ok: true,
                catalogText,
                railIds,
                wsOpen: Boolean(ws && !ws.classList.contains('hidden')),
                activeTitle
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        for expected_name in ("Claude", "Perplexity", "Gemini", "SoundCloud", "Apple Music", "Bluesky", "Notion"):
            self.assertIn(expected_name, res["catalogText"])
        self.assertIn("claude", res["railIds"])
        self.assertIn("gemini", res["railIds"])
        self.assertTrue(res["wsOpen"])
        self.assertEqual(res["activeTitle"], "Claude")
        self._assert_no_bridge_errors("F13 pin new presets in settings")

    def test_t1_f13_detect_app_by_url_resolves_new_presets_and_gemini(self) -> None:
        url = self._register_shared_fixture("t1_f13_detect.html", ["/src/shared/media-apps.js"])
        self.server.set_seed({})
        self.fx.navigate(url)
        self._install_error_trap()

        cases = [
            ("https://claude.ai/chat/123", "claude"),
            ("https://www.perplexity.ai/search?q=hi", "perplexity"),
            ("https://soundcloud.com/discover", "soundcloud"),
            ("https://music.apple.com/us/browse", "apple-music"),
            ("https://bsky.app/profile/test", "bluesky"),
            ("https://www.notion.so/workspace", "notion"),
            ("https://calendar.google.com/calendar/u/0/r", "google-calendar"),
            ("https://keep.google.com/u/0/", "google-keep"),
            ("https://gemini.google.com/app", "gemini"),
            ("https://chatgpt.com/", "chatgpt"),
        ]
        res = self.fx.eval_js(
            """
            const api = window.FoxHubMediaApps;
            return arguments[0].map(([u]) => {
              const app = api.detectAppByUrl(u, {});
              return app ? app.id : null;
            });
            """,
            cases,
        )
        self.assertEqual(res, [expected for _, expected in cases])
        self._assert_no_js_errors("F13 detectAppByUrl")

    # ------------------------------------------------------------------
    # F14: Settings Backup & Restore (5 tests)
    # ------------------------------------------------------------------
    def test_t1_f14_export_payload_schema_and_sensitive_ephemeral_key_omission(self) -> None:
        self._boot_background_offline(
            settings_overrides={
                "theme": "true-night",
                "soundId": "warm-bell",
                "enabledMediaApps": ["spotify", "claude", "gemini"],
                "customMediaApps": [
                    {
                        "id": "custom-0",
                        "name": "MyTool",
                        "url": "https://tool.example.test/",
                        "color": "#445566",
                        "enabled": True,
                        "userAgentMode": "mobile",
                    }
                ],
                "globalShortcuts": {"popup": "Alt+Shift+P", "sidebar": "Alt+Shift+M", "popout": "Alt+Shift+W"},
                "appShortcuts": {"spotify": "Alt+Shift+S"},
                "oauthAccounts": [{"email": "secret@gmail.com", "refreshToken": "topsecret"}],
                "dndUntil": int(time.time() * 1000) + 60000,
                "persistentSavedAppUrls": {"spotify": "https://open.spotify.com/track/1"},
            }
        )

        res = self.fx.eval_async_js(
            """
            try {
              const exp = await browser.runtime.sendMessage({ type: 'EXPORT_SETTINGS' });
              return { ok: true, exp };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        exp = res["exp"]
        self.assertTrue(exp["ok"])
        payload = exp["payload"]
        self.assertEqual(payload["schema"], "foxhub-settings-backup")
        self.assertEqual(payload["schemaVersion"], 1)
        s = payload["settings"]
        self.assertEqual(s["theme"], "true-night")
        self.assertEqual(s["soundId"], "warm-bell")
        self.assertEqual(s["enabledMediaApps"], ["spotify", "claude", "gemini"])
        self.assertEqual(s["customMediaApps"][0]["name"], "MyTool")
        self.assertEqual(s["appShortcuts"], {"spotify": "Alt+Shift+S"})
        for omitted in ("oauthAccounts", "dndUntil", "persistentSavedAppUrls"):
            self.assertNotIn(omitted, s, f"Sensitive/ephemeral key {omitted} must be omitted from export")
        self._assert_no_js_errors("F14 export payload schema")

    def test_t1_f14_import_settings_restores_all_categories_and_preserves_oauth(self) -> None:
        self._boot_background_offline(
            settings_overrides={
                "theme": "soft-sage",
                "soundId": "bamboo-pop",
                "enabledMediaApps": ["spotify", "claude"],
                "bgAudioAppIds": ["spotify", "soundcloud"],
                "quickSwitcherShortcut": "Ctrl+Shift+K",
                "globalShortcuts": {"popup": "Alt+Shift+F", "sidebar": "Alt+Shift+M", "popout": "Alt+Shift+W"},
                "appShortcuts": {"claude": "Alt+Shift+C"},
                "oauthAccounts": [{"email": "keepme@gmail.com", "refreshToken": "keep-token"}],
            }
        )

        res = self.fx.eval_async_js(
            """
            try {
              const exp = await browser.runtime.sendMessage({ type: 'EXPORT_SETTINGS' });
              const backupJson = JSON.stringify(exp.payload);

              // Mutate settings to different values
              await browser.runtime.sendMessage({
                type: 'UPDATE_SETTINGS',
                settings: {
                  theme: 'warm-linen',
                  soundId: 'marimba',
                  enabledMediaApps: ['instagram'],
                  quickSwitcherShortcut: 'Ctrl+K',
                  contextMenuEnabled: false
                }
              });
              window.__webextMock.clearCalls();

              const imp = await browser.runtime.sendMessage({
                type: 'IMPORT_SETTINGS',
                json: backupJson
              });
              await new Promise((r) => setTimeout(r, 60));
              const stateAfter = await browser.runtime.sendMessage({ type: 'GET_STATE' });
              const msgCalls = window.__webextMock.getCalls('runtime.sendMessage')
                .map((c) => c.args && c.args[0])
                .filter((m) => m && m.type === 'STATE_UPDATED');
              const menus = window.__webextMock.contextMenus.list();
              return { ok: true, imp, stateAfter, broadcastCount: msgCalls.length, menus };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertTrue(res["imp"]["ok"])
        restored = res["stateAfter"]["settings"]
        self.assertEqual(restored["theme"], "soft-sage")
        self.assertEqual(restored["soundId"], "bamboo-pop")
        self.assertEqual(restored["enabledMediaApps"], ["spotify", "claude"])
        self.assertEqual(restored["quickSwitcherShortcut"], "Ctrl+Shift+K")
        self.assertEqual(restored["appShortcuts"], {"claude": "Alt+Shift+C"})
        self.assertEqual(restored["oauthAccounts"][0]["email"], "keepme@gmail.com")
        self.assertGreaterEqual(res["broadcastCount"], 1)
        self.assertEqual(len(res["menus"]), 2, "contextMenus must re-sync on import")
        self._assert_no_js_errors("F14 import restores settings")

    def test_t1_f14_validate_import_payload_rejects_malformed_and_unsafe_inputs_cleanly(self) -> None:
        url = self._register_shared_fixture("t1_f14_validate.html", ["/src/shared/settings-schema.js"])
        self.server.set_seed({})
        self.fx.navigate(url)
        self._install_error_trap()

        res = self.fx.eval_js(
            """
            const s = window.FoxHubSettingsSchema;
            return {
              badJson: s.validateImportPayload('{bad'),
              badSchema: s.validateImportPayload(JSON.stringify({ schema: 'other', schemaVersion: 1, settings: {} })),
              badRange: s.validateImportPayload(JSON.stringify({ schema: 'foxhub-settings-backup', schemaVersion: 1, settings: { pollIntervalSeconds: 1 } })),
              badUrl: s.validateImportPayload(JSON.stringify({
                schema: 'foxhub-settings-backup',
                schemaVersion: 1,
                settings: { customMediaApps: [{ id: 'c0', name: 'X', url: 'javascript:alert(1)' }] }
              })),
              protoPollute: s.validateImportPayload('{"schema":"foxhub-settings-backup","schemaVersion":1,"settings":{"__proto__":{"polluted":true},"theme":"true-night"}}'),
              polluted: ({}).polluted === true
            };
            """
        )
        for key in ("badJson", "badSchema", "badRange", "badUrl", "protoPollute"):
            self.assertFalse(res[key]["ok"], f"Expected {key} to fail validation")
            self.assertIsInstance(res[key].get("error"), str)
            self.assertGreater(len(res[key]["error"]), 0)
        self.assertFalse(res["polluted"])
        self._assert_no_js_errors("F14 validateImportPayload rejections")

    def test_t1_f14_settings_ui_export_copy_and_paste_restore_roundtrip(self) -> None:
        self._open_bridged_popup(settings_overrides={"theme": "midnight-velvet", "contextMenuEnabled": True})

        res = self.fx.eval_async_js(
            """
            try {
              const uiWin = document.getElementById('ui-frame').contentWindow;
              const uiDoc = document.getElementById('ui-frame').contentDocument;
              let capturedCopyText = '';
              try {
                Object.defineProperty(uiWin.navigator, 'clipboard', {
                  value: {
                    writeText: (t) => { capturedCopyText = String(t); return Promise.resolve(); },
                    readText: () => Promise.resolve(capturedCopyText)
                  },
                  configurable: true
                });
              } catch (_) {}
              const origExec = uiDoc.execCommand ? uiDoc.execCommand.bind(uiDoc) : null;
              uiDoc.execCommand = (cmd, showUI, val) => {
                if (String(cmd).toLowerCase() === 'copy') {
                  const active = uiDoc.activeElement;
                  const sel = uiWin.getSelection ? String(uiWin.getSelection()) : '';
                  capturedCopyText = sel || (active && typeof active.value === 'string' ? active.value : capturedCopyText);
                  return true;
                }
                return origExec ? origExec(cmd, showUI, val) : false;
              };

              uiDoc.getElementById('rail-btn-sidebar-settings')?.click();
              await new Promise((r) => setTimeout(r, 100));
              const backupBtn = uiDoc.querySelector('[data-fh-cat="backup"], [data-settings-cat="backup"], [data-category="backup"], [data-cat="backup"]');
              if (backupBtn) backupBtn.click();
              await new Promise((r) => setTimeout(r, 80));

              const copyBtn = Array.from(uiDoc.querySelectorAll('#pm-settings-mount button'))
                .find((b) => /copy backup json/i.test(b.textContent || ''));
              const textarea = uiDoc.querySelector('#pm-settings-mount textarea');
              const restoreBtn = Array.from(uiDoc.querySelectorAll('#pm-settings-mount button'))
                .find((b) => /restore backup/i.test(b.textContent || ''));
              if (!copyBtn || !textarea || !restoreBtn) {
                return { ok: false, reason: 'Backup/Restore UI controls missing' };
              }

              copyBtn.click();
              await new Promise((r) => setTimeout(r, 150));
              const copiedJson = capturedCopyText;
              if (!copiedJson || !copiedJson.includes('foxhub-settings-backup')) {
                return { ok: false, reason: 'Copy Backup JSON did not write backup payload to clipboard: ' + copiedJson };
              }

              // Mutate theme & contextMenuEnabled via background
              await browser.runtime.sendMessage({
                type: 'UPDATE_SETTINGS',
                settings: { theme: 'warm-linen', contextMenuEnabled: false }
              });
              await new Promise((r) => setTimeout(r, 80));

              textarea.value = copiedJson;
              textarea.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
              restoreBtn.click();
              await new Promise((r) => setTimeout(r, 200));

              const banner = uiDoc.querySelector('#pm-settings-mount .fh-status-banner.is-ok');
              const stored = await browser.storage.local.get('settings');
              return {
                ok: true,
                hasOkBanner: Boolean(banner),
                theme: stored.settings?.theme,
                ctxEnabled: stored.settings?.contextMenuEnabled
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertTrue(res["hasOkBanner"], "Expected .fh-status-banner.is-ok after valid restore")
        self.assertEqual(res["theme"], "midnight-velvet")
        self.assertTrue(res["ctxEnabled"])
        self._assert_no_bridge_errors("F14 UI export/copy/restore roundtrip")

    def test_t1_f14_settings_ui_import_displays_error_banner_on_invalid_json(self) -> None:
        self._open_bridged_popup(settings_overrides={"theme": "warm-linen"})

        res = self.fx.eval_async_js(
            """
            try {
              const uiWin = document.getElementById('ui-frame').contentWindow;
              const uiDoc = document.getElementById('ui-frame').contentDocument;
              uiDoc.getElementById('rail-btn-sidebar-settings')?.click();
              await new Promise((r) => setTimeout(r, 100));
              const backupBtn = uiDoc.querySelector('[data-fh-cat="backup"], [data-settings-cat="backup"], [data-category="backup"], [data-cat="backup"]');
              if (backupBtn) backupBtn.click();
              await new Promise((r) => setTimeout(r, 80));

              const textarea = uiDoc.querySelector('#pm-settings-mount textarea');
              const restoreBtn = Array.from(uiDoc.querySelectorAll('#pm-settings-mount button'))
                .find((b) => /restore backup/i.test(b.textContent || ''));
              if (!textarea || !restoreBtn) return { ok: false, reason: 'Restore controls missing' };

              textarea.value = 'not valid json';
              textarea.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
              restoreBtn.click();
              await new Promise((r) => setTimeout(r, 120));

              const errBanner = uiDoc.querySelector('#pm-settings-mount .fh-status-banner.is-err');
              const stored = await browser.storage.local.get('settings');
              return {
                ok: true,
                hasErrBanner: Boolean(errBanner),
                errText: errBanner ? errBanner.textContent : '',
                themeAfter: stored.settings?.theme
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertTrue(res["hasErrBanner"], "Expected .fh-status-banner.is-err on invalid JSON restore")
        self.assertGreater(len(res["errText"].strip()), 0)
        self.assertEqual(res["themeAfter"], "warm-linen")
        self._assert_no_bridge_errors("F14 UI invalid JSON error banner")

    # ------------------------------------------------------------------
    # F15: Quick Switcher (Ctrl+K) (6 tests)
    # ------------------------------------------------------------------
    def test_t1_f15_ctrl_k_opens_and_escape_closes_quick_switcher(self) -> None:
        self._open_popup_ready()
        initial_hidden = self.fx.eval_js(
            "return Boolean(document.getElementById('pm-quick-switcher')?.classList.contains('hidden'));"
        )
        self.assertTrue(initial_hidden)

        self.fx.press_shortcut("k", ctrl=True)
        opened = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 90));
              const qs = document.getElementById('pm-quick-switcher');
              const inp = document.getElementById('pm-qs-input');
              const opts = document.querySelectorAll('#pm-qs-results [role="option"]');
              return {
                ok: Boolean(qs && !qs.classList.contains('hidden') && window.getComputedStyle(qs).display !== 'none'),
                focused: document.activeElement === inp,
                optCount: opts.length
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(opened["ok"], msg=opened.get("reason", "Quick Switcher did not open on Ctrl+K"))
        self.assertTrue(opened["focused"], "#pm-qs-input should be focused when Quick Switcher opens")
        self.assertGreater(opened["optCount"], 0)

        self.fx.press_shortcut("escape")
        closed = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 80));
              return { ok: Boolean(document.getElementById('pm-quick-switcher')?.classList.contains('hidden')) };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(closed["ok"], "Escape must close Quick Switcher")
        self._assert_no_js_errors("F15 ctrl+k open and escape close")

    def test_t1_f15_search_filters_pinned_and_unpinned_apps_and_enter_switches_app(self) -> None:
        self._open_popup_ready()
        self.fx.press_shortcut("k", ctrl=True)
        self.fx.eval_async_js("await new Promise((r) => setTimeout(r, 80));")
        self._probe_visible("#pm-qs-input")

        self.fx.type_text("#pm-qs-input", "Claude")
        claude_match = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 60));
              const opts = Array.from(document.querySelectorAll('#pm-qs-results [role="option"]'));
              return { ok: opts.some((o) => /Claude/i.test(o.textContent || '')) };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(claude_match["ok"], "Typing 'Claude' must match unpinned Claude preset")

        self.fx.press_shortcut("enter")
        after_claude = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 120));
              const qs = document.getElementById('pm-quick-switcher');
              const ws = document.getElementById('pm-media-workspace');
              return {
                ok: true,
                qsHidden: Boolean(qs && qs.classList.contains('hidden')),
                wsOpen: Boolean(ws && !ws.classList.contains('hidden')),
                title: document.getElementById('media-active-title')?.textContent?.trim() || ''
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(after_claude["ok"], msg=after_claude.get("reason", ""))
        self.assertTrue(after_claude["qsHidden"])
        self.assertTrue(after_claude["wsOpen"])
        self.assertEqual(after_claude["title"], "Claude")

        # Also test pinned app 'Spotify'
        self.fx.press_shortcut("k", ctrl=True)
        self.fx.eval_async_js("await new Promise((r) => setTimeout(r, 80));")
        self._probe_visible("#pm-qs-input")
        self.fx.type_text("#pm-qs-input", "Spotify")
        self.fx.press_shortcut("enter")
        after_sp = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 120));
              return {
                ok: true,
                activeApp: window.FoxHubPopup?.state?.activeRailAppId || '',
                title: document.getElementById('media-active-title')?.textContent?.trim() || ''
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(after_sp["ok"], msg=after_sp.get("reason", ""))
        self.assertEqual(after_sp["activeApp"], "spotify")
        self.assertEqual(after_sp["title"], "Spotify")
        self._assert_no_js_errors("F15 search and switch pinned/unpinned apps")

    def test_t1_f15_adhoc_url_entry_launches_workspace_iframe(self) -> None:
        self._open_popup_ready()
        adhoc_url = self.server.url_for("/mock/custom/qslaunch")

        self.fx.press_shortcut("k", ctrl=True)
        self.fx.eval_async_js("await new Promise((r) => setTimeout(r, 80));")
        self._probe_visible("#pm-qs-input")
        self.fx.type_text("#pm-qs-input", adhoc_url)

        has_opt = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 60));
              const opts = Array.from(document.querySelectorAll('#pm-qs-results [role="option"]'));
              return { ok: opts.some((o) => /Open URL/i.test(o.textContent || '')) };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(has_opt["ok"], "Ad-hoc URL query must offer 'Open URL in Sidebar' option")

        self.fx.press_shortcut("enter")
        launched = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 150));
              const ws = document.getElementById('pm-media-workspace');
              const frames = Array.from(document.querySelectorAll('#pm-media-frame-pool iframe'));
              return {
                ok: true,
                wsOpen: Boolean(ws && !ws.classList.contains('hidden')),
                srcs: frames.map((f) => f.src || f.getAttribute('src') || '')
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(launched["ok"], msg=launched.get("reason", ""))
        self.assertTrue(launched["wsOpen"])
        self.assertTrue(any("/mock/custom/qslaunch" in s for s in launched["srcs"]))
        self._assert_no_js_errors("F15 ad-hoc URL launch")

    def test_t1_f15_keyboard_navigation_and_quick_commands_toggle_night_mode_and_mute(self) -> None:
        self._open_bridged_popup(settings_overrides={"theme": "warm-linen", "muteSiteNotifications": False})

        res = self.fx.eval_async_js(
            """
            try {
              const uiWin = document.getElementById('ui-frame').contentWindow;
              const uiDoc = document.getElementById('ui-frame').contentDocument;
              const openQs = async () => {
                uiDoc.dispatchEvent(new uiWin.KeyboardEvent('keydown', {
                  key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true
                }));
                await new Promise((r) => setTimeout(r, 90));
              };

              await openQs();
              const inp = uiDoc.getElementById('pm-qs-input');
              if (!inp) return { ok: false, reason: 'Quick switcher input missing' };
              inp.value = 'True Night';
              inp.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
              await new Promise((r) => setTimeout(r, 60));
              inp.dispatchEvent(new uiWin.KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
              inp.dispatchEvent(new uiWin.KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true }));
              inp.dispatchEvent(new uiWin.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
              await new Promise((r) => setTimeout(r, 150));
              const afterNight = (await browser.storage.local.get('settings')).settings;

              await openQs();
              const inp2 = uiDoc.getElementById('pm-qs-input');
              inp2.value = 'Mute All';
              inp2.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
              await new Promise((r) => setTimeout(r, 60));
              inp2.dispatchEvent(new uiWin.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
              await new Promise((r) => setTimeout(r, 150));
              const afterMute = (await browser.storage.local.get('settings')).settings;

              return {
                ok: true,
                theme: afterNight?.theme,
                muteEmail: afterMute?.muteEmailNotifications,
                muteSites: afterMute?.muteSiteNotifications
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertEqual(res["theme"], "true-night")
        self.assertTrue(res["muteEmail"])
        self.assertTrue(res["muteSites"])
        self._assert_no_bridge_errors("F15 quick commands night mode and mute")

    def test_t1_f15_iframe_ctrl_k_relay_toggles_quick_switcher(self) -> None:
        self.assertTrue((REPO_ROOT / "src" / "content" / "core" / "lifecycle-router.js").is_file())
        relay_url = self.server.url_for("/mock/custom/relaytest")
        self._open_bridged_popup(
            settings_overrides={
                "quickSwitcherEnabled": True,
                "customMediaApps": [
                    {
                        "id": "custom-relay",
                        "name": "RelayTest",
                        "url": relay_url,
                        "color": "#334455",
                        "enabled": True,
                        "userAgentMode": "default",
                    }
                ],
            }
        )

        res = self.fx.eval_async_js(
            """
            try {
              const uiWin = document.getElementById('ui-frame').contentWindow;
              const uiDoc = document.getElementById('ui-frame').contentDocument;
              const btn = uiDoc.querySelector('#pm-rail-apps-list [data-app-id="custom-relay"]');
              if (!btn) return { ok: false, reason: 'RelayTest rail button missing' };
              btn.click();
              await new Promise((r) => setTimeout(r, 150));

              const pooled = uiDoc.querySelector('#pm-media-frame-pool iframe[data-app-id="custom-relay"]');
              if (!pooled) return { ok: false, reason: 'Pooled iframe missing' };
              if (!pooled.contentDocument || pooled.contentDocument.readyState !== 'complete') {
                await new Promise((r) => pooled.addEventListener('load', r, { once: true }));
              }

              const doc = pooled.contentDocument;
              const s = doc.createElement('script');
              s.textContent = "window.parent.postMessage({ source: 'pocketmail-media-frame', type: 'PM_QUICK_SWITCHER_TOGGLE', flatFrameName: window.name }, '*');";
              (doc.body || doc.documentElement).appendChild(s);
              s.remove();

              await new Promise((r) => setTimeout(r, 120));
              const qs = uiDoc.getElementById('pm-quick-switcher');
              return {
                ok: true,
                qsOpen: Boolean(qs && !qs.classList.contains('hidden') && uiWin.getComputedStyle(qs).display !== 'none')
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertTrue(res["qsOpen"], "Trusted iframe PM_QUICK_SWITCHER_TOGGLE relay must open Quick Switcher")
        self._assert_no_bridge_errors("F15 iframe Ctrl+K relay")

    def test_t1_f15_disable_and_custom_shortcut_settings_respected(self) -> None:
        self._open_popup_ready(seed=_make_seed({"quickSwitcherEnabled": False, "quickSwitcherShortcut": "Ctrl+K"}))
        self.fx.press_shortcut("k", ctrl=True)
        disabled_probe = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 80));
              return { hidden: Boolean(document.getElementById('pm-quick-switcher')?.classList.contains('hidden')) };
            } catch (err) {
              return { hidden: false };
            }
            """
        )
        self.assertTrue(disabled_probe["hidden"], "Quick Switcher must stay hidden when quickSwitcherEnabled=false")

        self.setUp()
        self._open_popup_ready(
            seed=_make_seed({"quickSwitcherEnabled": True, "quickSwitcherShortcut": "Ctrl+Shift+K"})
        )
        self.fx.press_shortcut("k", ctrl=True)
        wrong_key_probe = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 80));
              return { hidden: Boolean(document.getElementById('pm-quick-switcher')?.classList.contains('hidden')) };
            } catch (err) {
              return { hidden: false };
            }
            """
        )
        self.assertTrue(wrong_key_probe["hidden"], "Default Ctrl+K must not open when shortcut is Ctrl+Shift+K")

        self.fx.press_shortcut("k", ctrl=True, shift=True)
        custom_key_probe = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 90));
              const qs = document.getElementById('pm-quick-switcher');
              return { open: Boolean(qs && !qs.classList.contains('hidden')) };
            } catch (err) {
              return { open: false };
            }
            """
        )
        self.assertTrue(custom_key_probe["open"], "Custom shortcut Ctrl+Shift+K must open Quick Switcher")
        self._assert_no_js_errors("F15 disable and custom shortcut settings")


if __name__ == "__main__":
    unittest.main()
