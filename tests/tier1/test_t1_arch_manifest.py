"""Tier 1 happy-path tests for F1, F2, F3, F4, and F16 (Architecture, Manifest & AMO Compliance)."""

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
from tests.lib.amo_lint import _lex_js, lint_extension
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


def _default_popup_seed(server: FixtureServer, settings_overrides: dict | None = None, custom_apps: list | None = None) -> dict:
    now_ms = int(time.time() * 1000)
    settings = {
        "theme": "warm-linen",
        "wallpaper": "watercolor-hills",
        "demoMode": "on",
        "maxSessionSlots": 1,
        "enabledMediaApps": [
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
        ],
        "customMediaApps": custom_apps or [],
        "persistenceMode": "selected",
        "persistentAppIds": [],
        "persistentOpenAppIds": [],
        "persistentLastActiveAppId": "pocketmail",
        "persistentSavedAppUrls": {},
        "keepAudioPlayingWhenClosed": True,
        "tabAudioBehavior": "pause-resume",
        "bgAudioAppIds": ["spotify", "youtube", "soundcloud"],
        "miniNowPlayingEnabled": True,
        "quickSwitcherEnabled": True,
        "quickSwitcherShortcut": "Ctrl+K",
        "contextMenuEnabled": True,
        "railPlayingIndicatorEnabled": True,
        "railQuickControlsEnabled": True,
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
                        "id": "msg-f4-1",
                        "threadId": "thr-f4-1",
                        "sender": "GitHub <noreply@github.com>",
                        "senderName": "GitHub",
                        "senderEmail": "noreply@github.com",
                        "subject": "Your verification code is 482910",
                        "snippet": "Use code 482910 to verify your sign-in.",
                        "fullText": "Your verification code is 482910.",
                        "dateMs": now_ms - 60000,
                        "unread": True,
                        "starred": False,
                        "otpCode": "482910",
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
    }

    return {
        "storage": {"settings": settings},
        "messageResponses": {
            "GET_STATE": {"ok": True, "state": state, "settings": settings, "snoozed": {}, "sidebarOpenCount": 1},
            "SYNC_NOW": {"ok": True, "state": state, "settings": settings},
            "STOP_BG_AUDIO_HANDOFF": {"ok": True, "skipped": True, "settings": settings, "activeBgApps": []},
            "UPDATE_SETTINGS": {"ok": True, "settings": settings, "state": state},
            "UPDATE_PERSISTENT_SESSION": {"ok": True},
        },
    }


class TestT1ArchManifest(unittest.TestCase):
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

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _read_manifest(self) -> dict:
        manifest_path = REPO_ROOT / "manifest.json"
        self.assertTrue(manifest_path.is_file(), "manifest.json must exist at repository root")
        return json.loads(manifest_path.read_text(encoding="utf-8"))

    def _extract_html_script_srcs(self, html_path: Path) -> list[str]:
        self.assertTrue(html_path.is_file(), f"HTML file missing: {html_path}")
        parser = _ScriptSrcParser()
        parser.feed(html_path.read_text(encoding="utf-8"))
        return parser.srcs

    def _navigate_background_offline(self, seed: dict) -> None:
        bg_html = REPO_ROOT / "src" / "background" / "background.html"
        srcs = self._extract_html_script_srcs(bg_html)
        script_tags = []
        for rel in srcs:
            resolved = (bg_html.parent / rel).resolve()
            self.assertTrue(resolved.is_file(), f"background.html script missing: {rel}")
            web_path = "/" + resolved.relative_to(REPO_ROOT).as_posix()
            script_tags.append(f'<script src="{web_path}"></script>')

        guard_js = (
            "(function(){\n"
            "  const origFetch = window.fetch.bind(window);\n"
            "  window.fetch = function(input, init){\n"
            "    const u = typeof input === 'string' ? input : (input && input.url ? input.url : '');\n"
            "    if (/^https?:\\/\\//i.test(u) && !u.startsWith(window.location.origin)) {\n"
            "      return Promise.reject(new TypeError('Offline test harness blocked external fetch: ' + u));\n"
            "    }\n"
            "    return origFetch(input, init);\n"
            "  };\n"
            "})();\n"
        )
        guard_url = self.server.register_fixture("bg_net_guard.js", guard_js, content_type="application/javascript; charset=utf-8")
        html = (
            "<!doctype html><html><head><meta charset='utf-8'><title>FoxHub BG Test</title>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            f"<script src='{guard_url}'></script>"
            "</head><body>\n"
            + "\n".join(script_tags)
            + "\n</body></html>"
        )
        bg_url = self.server.register_fixture("bg_offline_harness.html", html)
        self.server.set_seed(seed)
        self.fx.navigate(bg_url)

    def _poll_bg_boot(self, timeout_ms: int = 5000) -> dict:
        res = self.fx.eval_async_js(
            """
            const timeoutMs = arguments[0];
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
              if (
                window.FoxHubBg &&
                window.FoxHubBg.state &&
                window.FoxHubBg.state.cachedState &&
                Number(window.FoxHubBg.state.cachedState.lastSyncAt) > 0
              ) {
                return { ok: true, lastSyncAt: window.FoxHubBg.state.cachedState.lastSyncAt };
              }
              await new Promise((r) => setTimeout(r, 40));
            }
            return {
              ok: false,
              reason: window.FoxHubBg
                ? 'Background did not finish initial sync within timeout'
                : 'window.FoxHubBg not defined'
            };
            """,
            timeout_ms,
        )
        if not isinstance(res, dict):
            return {"ok": False, "reason": f"Unexpected eval_async_js result: {res!r}"}
        return res

    # ------------------------------------------------------------------
    # F1: Manifest v2.8.0 & Content Injection Split (5 tests)
    # ------------------------------------------------------------------
    def test_f1_manifest_mv2_version_bumped_and_branding(self) -> None:
        manifest = self._read_manifest()
        self.assertEqual(manifest.get("manifest_version"), 2)
        ver = str(manifest.get("version", ""))
        self.assertRegex(ver, r"^\d+\.\d+\.\d+$", f"Invalid version string: {ver!r}")
        ver_tuple = tuple(int(p) for p in ver.split("."))
        self.assertGreater(ver_tuple, (2, 7, 9), f"Expected version > 2.7.9, got {ver}")

        name = str(manifest.get("name", ""))
        short_name = str(manifest.get("short_name", ""))
        desc = str(manifest.get("description", ""))
        self.assertIn("foxhub", name.lower())
        self.assertIn("foxhub", short_name.lower())
        self.assertNotIn("pocketmail", name.lower())
        self.assertNotIn("pocketmail", short_name.lower())
        self.assertNotIn("pocketmail", desc.lower())

    def test_f1_manifest_context_menus_and_core_permissions(self) -> None:
        manifest = self._read_manifest()
        perms = manifest.get("permissions")
        self.assertIsInstance(perms, list)
        required = [
            "contextMenus",
            "storage",
            "tabs",
            "cookies",
            "notifications",
            "alarms",
            "identity",
            "webRequest",
            "webRequestBlocking",
            "<all_urls>",
        ]
        for perm in required:
            self.assertIn(perm, perms, f"Missing required permission: {perm}")

    def test_f1_manifest_gecko_id_and_entry_pages_intact(self) -> None:
        manifest = self._read_manifest()
        gecko = manifest.get("browser_specific_settings", {}).get("gecko", {})
        self.assertEqual(gecko.get("id"), "pocketmail-local@workspace.local")

        self.assertEqual(manifest.get("browser_action", {}).get("default_popup"), "src/popup/popup.html")
        self.assertEqual(manifest.get("sidebar_action", {}).get("default_panel"), "src/popup/popup.html?sidebar=1")
        self.assertEqual(manifest.get("background", {}).get("page"), "src/background/background.html")
        self.assertEqual(manifest.get("options_ui", {}).get("page"), "src/options/options.html")

        for rel in [
            manifest["browser_action"]["default_popup"],
            manifest["sidebar_action"]["default_panel"],
            manifest["background"]["page"],
            manifest["options_ui"]["page"],
        ]:
            clean_rel = rel.split("?", 1)[0]
            self.assertTrue((REPO_ROOT / clean_rel).is_file(), f"Missing manifest entry page: {clean_rel}")

    def test_f1_manifest_content_scripts_lightweight_tab_watcher_only(self) -> None:
        manifest = self._read_manifest()
        content_scripts = manifest.get("content_scripts")
        self.assertIsInstance(content_scripts, list)
        self.assertGreater(len(content_scripts), 0, "content_scripts must be non-empty")

        found_http_entry = False
        for entry in content_scripts:
            matches = entry.get("matches", [])
            if "http://*/*" in matches and "https://*/*" in matches:
                found_http_entry = True
                self.assertEqual(entry.get("run_at"), "document_start")
                self.assertTrue(entry.get("all_frames") is True)
            self.assertEqual(
                entry.get("js"),
                ["src/content/tab-media-watcher.js"],
                f"Expected only lightweight tab-media-watcher.js in content_scripts, got {entry.get('js')!r}",
            )
            self.assertEqual(
                entry.get("css", []),
                [],
                f"Expected no heavy CSS in general content_scripts, got {entry.get('css')!r}",
            )
        self.assertTrue(found_http_entry, "Expected a content_scripts entry matching both http://*/* and https://*/*")

    def test_f1_tab_watcher_size_and_context_restriction(self) -> None:
        manifest = self._read_manifest()
        watcher_path = REPO_ROOT / "src" / "content" / "tab-media-watcher.js"
        self.assertTrue(watcher_path.is_file(), "Missing src/content/tab-media-watcher.js")
        raw_bytes = watcher_path.read_bytes()
        self.assertGreaterEqual(len(raw_bytes), 200, "tab-media-watcher.js unexpectedly tiny")
        self.assertLessEqual(len(raw_bytes), 10240, f"tab-media-watcher.js too large: {len(raw_bytes)} bytes")

        source = raw_bytes.decode("utf-8")
        self.assertNotIn("media-frame-optimizer", source)

        if "web_accessible_resources" in manifest:
            war = manifest["web_accessible_resources"]
            self.assertIsInstance(war, list)
            self.assertGreater(len(war), 0)
            for item in war:
                self.assertIsInstance(item, str)
                rel_item = item.lstrip("/")
                self.assertTrue(len(rel_item) > 0, f"Empty WAR entry: {item!r}")
                if "*" in rel_item or "?" in rel_item:
                    matches = list(REPO_ROOT.glob(rel_item))
                    self.assertGreater(len(matches), 0, f"WAR glob matched no files: {item}")
                else:
                    self.assertTrue((REPO_ROOT / rel_item).is_file(), f"WAR file missing: {item}")

    # ------------------------------------------------------------------
    # F2: Split media-frame-optimizer.js (5 tests)
    # ------------------------------------------------------------------
    def test_f2_monolithic_media_frame_optimizer_removed(self) -> None:
        monolith = REPO_ROOT / "src" / "shared" / "media-frame-optimizer.js"
        self.assertFalse(monolith.exists(), "Monolithic src/shared/media-frame-optimizer.js must be removed")

        manifest = self._read_manifest()
        self.assertNotIn("media-frame-optimizer.js", json.dumps(manifest))

        for html_file in (REPO_ROOT / "src").rglob("*.html"):
            srcs = self._extract_html_script_srcs(html_file)
            for s in srcs:
                self.assertNotIn("media-frame-optimizer.js", s, f"Stale reference in {html_file}")

    def test_f2_modular_content_directory_structure(self) -> None:
        watcher = REPO_ROOT / "src" / "content" / "tab-media-watcher.js"
        core_dir = REPO_ROOT / "src" / "content" / "core"
        css_dir = REPO_ROOT / "src" / "content" / "css"
        opt_dir = REPO_ROOT / "src" / "content" / "optimizers"

        self.assertTrue(watcher.is_file(), "Missing src/content/tab-media-watcher.js")
        self.assertTrue(core_dir.is_dir(), "Missing src/content/core/")
        self.assertTrue(css_dir.is_dir(), "Missing src/content/css/")
        self.assertTrue(opt_dir.is_dir(), "Missing src/content/optimizers/")

        core_js = list(core_dir.glob("*.js"))
        self.assertGreaterEqual(len(core_js), 3, f"Expected >= 3 core modules, got {len(core_js)}")

        self.assertTrue((css_dir / "base.css").is_file(), "Missing src/content/css/base.css")
        css_files = list(css_dir.glob("*.css"))
        self.assertGreaterEqual(len(css_files), 5, f"Expected >= 5 css files, got {len(css_files)}")

        opt_js = list(opt_dir.glob("*.js"))
        self.assertGreaterEqual(len(opt_js), 10, f"Expected >= 10 optimizer modules, got {len(opt_js)}")
        for required_opt in ["spotify.js", "youtube.js", "instagram.js", "soundcloud.js", "gemini.js", "claude.js", "perplexity.js"]:
            self.assertTrue((opt_dir / required_opt).is_file(), f"Missing optimizer module: {required_opt}")

    def test_f2_content_scripts_spidermonkey_syntax_clean(self) -> None:
        content_dir = REPO_ROOT / "src" / "content"
        self.assertTrue(content_dir.is_dir(), "Missing src/content/ directory")
        js_files = sorted(content_dir.rglob("*.js"))
        self.assertGreaterEqual(len(js_files), 14, f"Expected >= 14 JS files under src/content/, found {len(js_files)}")

        results = self.fx.check_js_syntax(js_files)
        self.assertEqual(len(results), len(js_files))
        failures = [r for r in results if not r["ok"]]
        self.assertEqual(
            failures,
            [],
            f"SpiderMonkey syntax failures: {[(f['path'], f['line'], f['error']) for f in failures]}",
        )

    def test_f2_normal_tab_load_lightweight_no_sidebar_dom_pollution(self) -> None:
        watcher = REPO_ROOT / "src" / "content" / "tab-media-watcher.js"
        self.assertTrue(watcher.is_file(), "Missing src/content/tab-media-watcher.js")

        self.server.set_seed({})
        self.fx.navigate(
            self.server.url_for("/mock/normal-tab?inject_content=/src/content/tab-media-watcher.js&playing=0")
        )
        res = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline && document.readyState !== 'complete') {
              await new Promise((r) => setTimeout(r, 25));
            }
            return {
              ready: document.readyState === 'complete',
              hasVideo: Boolean(document.getElementById('tab-video')),
              pollutedNodes: document.querySelectorAll('style[id*="pm"], style[id*="foxhub"], [id^="pm-"], [id^="foxhub-"]').length,
              frameFlag: window.sessionStorage.getItem('__pm_foxhub_frame')
            };
            """
        )
        self.assertTrue(res["ready"])
        self.assertTrue(res["hasVideo"])
        self.assertEqual(res["pollutedNodes"], 0)
        self.assertIsNone(res["frameFlag"])

    def test_f2_normal_tab_watcher_detects_play_pause_and_active_query(self) -> None:
        watcher = REPO_ROOT / "src" / "content" / "tab-media-watcher.js"
        self.assertTrue(watcher.is_file(), "Missing src/content/tab-media-watcher.js")

        self.server.set_seed({})
        self.fx.navigate(
            self.server.url_for("/mock/normal-tab?inject_content=/src/content/tab-media-watcher.js&playing=0")
        )
        ready = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline) {
              if (document.readyState === 'complete' && document.getElementById('btn-toggle-media')) {
                return { ok: true };
              }
              await new Promise((r) => setTimeout(r, 25));
            }
            return { ok: false, reason: 'normal-tab fixture did not become ready' };
            """
        )
        self.assertTrue(ready["ok"], msg=ready.get("reason", ""))

        self.fx.eval_js(
            """
            const v = document.getElementById('tab-video');
            if (v && v.mozHasAudio === false) {
              Object.defineProperty(v, 'mozHasAudio', { get: () => true, configurable: true });
            }
            """
        )

        mock_helpers.clear_calls(self.fx)
        self.fx.click("#btn-toggle-media")

        playing_seen = self.fx.eval_async_js(
            """
            const video = document.getElementById('tab-video');
            if (!video || video.paused) {
              return { ok: false, reason: 'Normal tab video did not enter !paused state after clicking #btn-toggle-media' };
            }
            const hasPlayingMsg = () => {
              const calls = window.__webextMock.getCalls('runtime.sendMessage');
              return calls.some((c) => c.args && c.args[0] && c.args[0].type === 'EXTERNAL_TAB_MEDIA_PLAYING');
            };
            const firstDeadline = Date.now() + 300;
            while (Date.now() < firstDeadline) {
              if (hasPlayingMsg()) return { ok: true };
              await new Promise((r) => setTimeout(r, 30));
            }
            // /mock/normal-tab dispatches 'play' without 'playing'; emit standard HTMLMediaElement 'playing' if needed
            video.dispatchEvent(new Event('playing', { bubbles: false }));
            const deadline = Date.now() + 1700;
            while (Date.now() < deadline) {
              if (hasPlayingMsg()) return { ok: true };
              await new Promise((r) => setTimeout(r, 30));
            }
            return { ok: false, reason: 'EXTERNAL_TAB_MEDIA_PLAYING not emitted after media play' };
            """
        )
        self.assertTrue(playing_seen["ok"], msg=playing_seen.get("reason", ""))

        active_res = self.fx.eval_async_js(
            """
            try {
              const res = await browser.runtime.sendMessage({ type: 'CHECK_TAB_HAS_ACTIVE_MEDIA' });
              return { ok: true, res };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(active_res["ok"], msg=active_res.get("reason", ""))
        self.assertEqual(active_res.get("res"), {"hasActiveMedia": True})

        mock_helpers.clear_calls(self.fx)
        self.fx.click("#btn-toggle-media")

        stopped_seen = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 2000;
            while (Date.now() < deadline) {
              const calls = window.__webextMock.getCalls('runtime.sendMessage');
              if (calls.some((c) => c.args && c.args[0] && c.args[0].type === 'EXTERNAL_TAB_MEDIA_STOPPED')) {
                return { ok: true };
              }
              await new Promise((r) => setTimeout(r, 30));
            }
            return { ok: false, reason: 'EXTERNAL_TAB_MEDIA_STOPPED not emitted after media pause' };
            """
        )
        self.assertTrue(stopped_seen["ok"], msg=stopped_seen.get("reason", ""))

    # ------------------------------------------------------------------
    # F3: Split background.js (5 tests)
    # ------------------------------------------------------------------
    def test_f3_monolithic_background_removed_and_html_loads_modules(self) -> None:
        monolith = REPO_ROOT / "src" / "background" / "background.js"
        self.assertFalse(monolith.exists(), "Monolithic src/background/background.js must be removed")

        bg_html = REPO_ROOT / "src" / "background" / "background.html"
        srcs = self._extract_html_script_srcs(bg_html)
        self.assertGreater(len(srcs), 0)

        for rel in srcs:
            resolved = (bg_html.parent / rel).resolve()
            self.assertTrue(resolved.is_file(), f"background.html script missing: {rel}")

        expected_bg_modules = [
            "bg-state.js",
            "bg-gmail-sync.js",
            "bg-webrequest-cookies.js",
            "bg-audio-engine.js",
            "bg-tab-audio-watcher.js",
            "bg-shortcuts-context.js",
            "bg-router.js",
        ]
        basenames = [Path(s).name for s in srcs]
        bg_only = [name for name in basenames if name.startswith("bg-")]
        for mod in expected_bg_modules:
            self.assertIn(mod, bg_only, f"Missing module in background.html: {mod}")
        self.assertEqual(bg_only[0], "bg-state.js", "bg-state.js must load first among bg-* modules")
        self.assertEqual(bg_only[-1], "bg-router.js", "bg-router.js must load last among bg-* modules")

    def test_f3_background_scripts_spidermonkey_syntax_clean(self) -> None:
        bg_dir = REPO_ROOT / "src" / "background"
        bg_html = bg_dir / "background.html"
        srcs = self._extract_html_script_srcs(bg_html)
        resolved = [(bg_dir / s).resolve() for s in srcs]
        all_files = sorted({*bg_dir.glob("*.js"), *resolved})
        self.assertGreaterEqual(len(all_files), 12)

        results = self.fx.check_js_syntax(all_files)
        self.assertEqual(len(results), len(all_files))
        failures = [r for r in results if not r["ok"]]
        self.assertEqual(
            failures,
            [],
            f"Background JS syntax failures: {[(f['path'], f['line'], f['error']) for f in failures]}",
        )

    def test_f3_background_boots_foxhub_bg_namespace_and_pm_hooks(self) -> None:
        self._navigate_background_offline({"storage": {"settings": {"maxSessionSlots": 1, "demoMode": "on"}}})
        boot = self._poll_bg_boot()
        self.assertTrue(boot["ok"], msg=boot.get("reason", ""))

        probe = self.fx.eval_js(
            """
            const bg = window.FoxHubBg || {};
            const requiredExports = [
              'loadStorage',
              'syncAllAccounts',
              'handleMessageAction',
              'startBackgroundAudioKeepAlive',
              'checkExternalTabAudioState',
              'syncContextMenusFromSettings',
              'broadcastStateUpdated'
            ];
            const requiredHooks = [
              '__pmHandleSpEmeBridge',
              '__pmConsumePendingShortcutApp',
              '__pmConsumePendingContextUrl',
              '__pmGetSyncBootState',
              '__pmGetAudioDiagnostics',
              '__pmGetStandbyPoolIds'
            ];
            return {
              exports: Object.fromEntries(requiredExports.map((k) => [k, typeof bg[k]])),
              hooks: Object.fromEntries(requiredHooks.map((k) => [k, typeof window[k]])),
              onMessageListeners: Boolean(browser.runtime?.onMessage?.hasListeners?.()),
              onConnectListeners: Boolean(browser.runtime?.onConnect?.hasListeners?.())
            };
            """
        )
        for name, typ in probe["exports"].items():
            self.assertEqual(typ, "function", f"FoxHubBg.{name} must be a function")
        for name, typ in probe["hooks"].items():
            self.assertEqual(typ, "function", f"window.{name} must be a function")
        self.assertTrue(probe["onMessageListeners"])
        self.assertTrue(probe["onConnectListeners"])

    def test_f3_background_dynamic_manifest_version_no_stale_279(self) -> None:
        bg_dir = REPO_ROOT / "src" / "background"
        self.assertTrue(bg_dir.is_dir())
        for js_file in sorted(bg_dir.glob("*.js")):
            lexed = _lex_js(js_file.read_text(encoding="utf-8"))
            self.assertNotIn("2.7.9", lexed.code_with_strings, f"Stale 2.7.9 found in {js_file.name}")

        self._navigate_background_offline(
            {
                "manifest": {"manifest_version": 2, "name": "FoxHub", "version": "2.8.9"},
                "storage": {"settings": {"maxSessionSlots": 1, "demoMode": "on"}},
            }
        )
        boot = self._poll_bg_boot()
        self.assertTrue(boot["ok"], msg=boot.get("reason", ""))

        export_res = self.fx.eval_async_js(
            """
            try {
              const res = await browser.runtime.sendMessage({ type: 'EXPORT_SETTINGS' });
              return { ok: true, res };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(export_res["ok"], msg=export_res.get("reason", ""))
        self.assertTrue(export_res["res"]["ok"])
        self.assertEqual(export_res["res"]["payload"]["appVersion"], "2.8.9")

    def test_f3_background_session_messages_and_clear_state_updated(self) -> None:
        self._navigate_background_offline(
            {
                "storage": {
                    "settings": {
                        "maxSessionSlots": 1,
                        "demoMode": "on",
                        "persistenceDefaultOffMigratedV4": True,
                        "persistenceMode": "selected",
                        "persistentAppIds": ["spotify", "youtube"],
                    }
                }
            }
        )
        boot = self._poll_bg_boot()
        self.assertTrue(boot["ok"], msg=boot.get("reason", ""))

        res = self.fx.eval_async_js(
            """
            window.__webextMock.clearCalls();
            const r1 = await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              activeAppId: 'spotify',
              openPersistentAppIds: ['spotify'],
              appId: 'spotify',
              url: 'https://open.spotify.com/album/1'
            });
            const s1 = await browser.runtime.sendMessage({ type: 'GET_STATE' });

            const port = browser.runtime.connect({ name: 'foxhub-sidebar-lifecycle' });
            port.postMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              activeAppId: 'youtube',
              openPersistentAppIds: ['spotify', 'youtube']
            });
            await new Promise((r) => setTimeout(r, 40));
            const s2 = await browser.runtime.sendMessage({ type: 'GET_STATE' });

            window.__webextMock.clearCalls();
            const cleared = await browser.runtime.sendMessage({ type: 'CLEAR_PERSISTENT_SESSIONS' });
            await new Promise((r) => setTimeout(r, 30));
            const msgCalls = window.__webextMock.getCalls('runtime.sendMessage');
            port.disconnect();

            return { r1, s1, s2, cleared, msgCalls };
            """
        )
        self.assertEqual(res["r1"], {"ok": True})
        self.assertEqual(res["s1"]["settings"]["persistentLastActiveAppId"], "spotify")
        self.assertEqual(res["s1"]["settings"]["persistentOpenAppIds"], ["spotify"])
        self.assertEqual(
            res["s1"]["settings"]["persistentSavedAppUrls"].get("spotify"),
            "https://open.spotify.com/album/1",
        )
        self.assertEqual(res["s2"]["settings"]["persistentLastActiveAppId"], "youtube")
        self.assertTrue(res["cleared"]["ok"])
        self.assertEqual(res["cleared"]["settings"]["persistentLastActiveAppId"], "pocketmail")
        self.assertEqual(res["cleared"]["settings"]["persistentOpenAppIds"], [])
        self.assertEqual(res["cleared"]["settings"]["persistentSavedAppUrls"], {})
        self.assertTrue(
            any(
                c.get("args") and isinstance(c["args"][0], dict) and c["args"][0].get("type") == "STATE_UPDATED"
                for c in res["msgCalls"]
            ),
            "CLEAR_PERSISTENT_SESSIONS must broadcast STATE_UPDATED",
        )

    # ------------------------------------------------------------------
    # F4: Split popup.js (5 tests)
    # ------------------------------------------------------------------
    def test_f4_monolithic_popup_removed_and_html_loads_modules(self) -> None:
        monolith = REPO_ROOT / "src" / "popup" / "popup.js"
        self.assertFalse(monolith.exists(), "Monolithic src/popup/popup.js must be removed")

        popup_html = REPO_ROOT / "src" / "popup" / "popup.html"
        srcs = self._extract_html_script_srcs(popup_html)
        self.assertNotIn("popup.js", [Path(s).name for s in srcs], "popup.html must not load monolithic popup.js")

        popup_local = [s for s in srcs if not s.startswith("../")]
        self.assertGreaterEqual(len(popup_local), 6, f"Expected >= 6 popup modules loaded, got {popup_local}")

        basenames = [Path(s).name for s in popup_local]
        for required in ["mail-view.js", "media-workspace.js", "theme-studio.js", "audio-controller.js"]:
            self.assertIn(required, basenames, f"Missing expected popup module in popup.html: {required}")

        for rel in srcs:
            resolved = (popup_html.parent / rel).resolve()
            self.assertTrue(resolved.is_file(), f"popup.html referenced script missing: {rel}")

    def test_f4_popup_scripts_spidermonkey_syntax_clean(self) -> None:
        popup_dir = REPO_ROOT / "src" / "popup"
        self.assertFalse((popup_dir / "popup.js").exists(), "Monolithic src/popup/popup.js must be removed")
        popup_js_files = sorted(popup_dir.glob("*.js"))
        self.assertGreaterEqual(len(popup_js_files), 6, f"Expected >= 6 JS files in src/popup/, got {len(popup_js_files)}")

        results = self.fx.check_js_syntax(popup_js_files)
        self.assertEqual(len(results), len(popup_js_files))
        failures = [r for r in results if not r["ok"]]
        self.assertEqual(
            failures,
            [],
            f"Popup JS syntax failures: {[(f['path'], f['line'], f['error']) for f in failures]}",
        )

    def test_f4_popup_boots_foxhub_popup_namespace(self) -> None:
        self.assertFalse((REPO_ROOT / "src" / "popup" / "popup.js").exists(), "Monolithic popup.js must be removed")
        self.server.set_seed(_default_popup_seed(self.server))
        self.fx.navigate(self.server.url_for("/src/popup/popup.html?sidebar=1"))

        probe = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 4000;
            while (Date.now() < deadline) {
              const list = document.getElementById('pm-email-list');
              if (window.FoxHubPopup && list && list.children.length > 0) {
                return {
                  ok: true,
                  isObject: typeof window.FoxHubPopup === 'object' && window.FoxHubPopup !== null,
                  keyCount: Object.keys(window.FoxHubPopup).length
                };
              }
              await new Promise((r) => setTimeout(r, 40));
            }
            return {
              ok: false,
              reason: window.FoxHubPopup
                ? 'Popup email list did not populate'
                : 'window.FoxHubPopup namespace not defined'
            };
            """
        )
        self.assertTrue(probe["ok"], msg=probe.get("reason", ""))
        self.assertTrue(probe["isObject"])
        self.assertGreaterEqual(probe["keyCount"], 5)

    def test_f4_popup_mail_view_and_theme_studio_boot(self) -> None:
        self.assertFalse((REPO_ROOT / "src" / "popup" / "popup.js").exists(), "Monolithic popup.js must be removed")
        self.server.set_seed(_default_popup_seed(self.server))

        # 1. Narrow sidebar mode (?sidebar=1 at 360x640): secondary header buttons are decluttered into #btn-header-more -> #btn-more-themes
        self.fx.set_viewport(360, 640)
        try:
            self.fx.navigate(self.server.url_for("/src/popup/popup.html?sidebar=1"))
            ready = self.fx.eval_async_js(
                """
                window.__f4Errors = [];
                window.addEventListener('error', (e) => window.__f4Errors.push(String(e.message || e.error || 'error')));
                window.addEventListener('unhandledrejection', (e) => window.__f4Errors.push(String(e.reason || 'rejection')));
                const isVisible = (el) => {
                  if (!el) return false;
                  const cs = window.getComputedStyle(el);
                  const r = el.getBoundingClientRect();
                  return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
                };
                const deadline = Date.now() + 4000;
                while (Date.now() < deadline) {
                  const list = document.getElementById('pm-email-list');
                  const acc = document.getElementById('pm-accounts-bar');
                  if (list && list.children.length > 0 && acc && acc.children.length > 0) {
                    const moreBtn = document.getElementById('btn-header-more');
                    return {
                      ok: true,
                      emailText: list.textContent || '',
                      accCount: acc.children.length,
                      hasMoreBtn: Boolean(moreBtn),
                      moreBtnVisible: isVisible(moreBtn),
                      themeBtnHiddenInSidebar: !isVisible(document.getElementById('btn-backgrounds'))
                    };
                  }
                  await new Promise((r) => setTimeout(r, 40));
                }
                return { ok: false, reason: 'Mail view or accounts bar did not render' };
                """
            )
            self.assertTrue(ready["ok"], msg=ready.get("reason", ""))
            self.assertIn("482910", ready["emailText"])
            self.assertGreaterEqual(ready["accCount"], 1)
            self.assertTrue(ready["hasMoreBtn"], "Expected #btn-header-more in narrow sidebar mode")
            self.assertTrue(ready["moreBtnVisible"], "Expected #btn-header-more to be visible in narrow sidebar mode")
            self.assertTrue(ready["themeBtnHiddenInSidebar"], "Expected #btn-backgrounds to be decluttered from narrow sidebar header")

            self.fx.click("#btn-header-more")
            more_themes_visible = self.fx.eval_js(
                """
                const btn = document.getElementById('btn-more-themes');
                if (!btn) return false;
                const cs = window.getComputedStyle(btn);
                const r = btn.getBoundingClientRect();
                return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
                """
            )
            self.assertTrue(more_themes_visible, "Expected #btn-more-themes inside ⋯ menu in narrow sidebar mode")
            self.fx.click("#btn-more-themes")
            theme_probe = self.fx.eval_js(
                """
                const drawer = document.getElementById('pm-theme-drawer');
                const grid = document.getElementById('pm-theme-grid');
                return {
                  drawerExists: Boolean(drawer),
                  drawerOpen: Boolean(drawer && !drawer.classList.contains('hidden')),
                  themeCount: grid ? grid.children.length : 0,
                  errors: window.__f4Errors || []
                };
                """
            )
            self.assertTrue(theme_probe["drawerExists"])
            self.assertTrue(theme_probe["drawerOpen"])
            self.assertGreaterEqual(theme_probe["themeCount"], 10)
            self.assertEqual(theme_probe["errors"], [])

            # 2. Popup mode (560x600): direct #btn-backgrounds button is visible and opens Theme Studio
            self.fx.set_viewport(560, 600)
            self.fx.navigate(self.server.url_for("/src/popup/popup.html"))
            popup_ready = self.fx.eval_async_js(
                """
                window.__f4Errors = [];
                window.addEventListener('error', (e) => window.__f4Errors.push(String(e.message || e.error || 'error')));
                window.addEventListener('unhandledrejection', (e) => window.__f4Errors.push(String(e.reason || 'rejection')));
                const isVisible = (el) => {
                  if (!el) return false;
                  const cs = window.getComputedStyle(el);
                  const r = el.getBoundingClientRect();
                  return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
                };
                const deadline = Date.now() + 4000;
                while (Date.now() < deadline) {
                  const list = document.getElementById('pm-email-list');
                  const themeBtn = document.getElementById('btn-backgrounds');
                  if (list && list.children.length > 0 && isVisible(themeBtn)) {
                    return { ok: true };
                  }
                  await new Promise((r) => setTimeout(r, 40));
                }
                return { ok: false, reason: '#btn-backgrounds not visible in popup mode (560x600)' };
                """
            )
            self.assertTrue(popup_ready["ok"], msg=popup_ready.get("reason", ""))
            self.fx.click("#btn-backgrounds")
            popup_theme = self.fx.eval_js(
                """
                const drawer = document.getElementById('pm-theme-drawer');
                const grid = document.getElementById('pm-theme-grid');
                return {
                  drawerOpen: Boolean(drawer && !drawer.classList.contains('hidden')),
                  themeCount: grid ? grid.children.length : 0,
                  errors: window.__f4Errors || []
                };
                """
            )
            self.assertTrue(popup_theme["drawerOpen"])
            self.assertGreaterEqual(popup_theme["themeCount"], 10)
            self.assertEqual(popup_theme["errors"], [])
        finally:
            self.fx.set_viewport(1200, 800)

    def test_f4_popup_media_workspace_and_audio_controller_boot(self) -> None:
        self.assertFalse((REPO_ROOT / "src" / "popup" / "popup.js").exists(), "Monolithic popup.js must be removed")
        custom_apps = [
            {
                "id": "custom-0",
                "name": "Local Spotify",
                "url": self.server.url_for("/mock/spotify"),
                "color": "#1DB954",
                "enabled": True,
                "userAgentMode": "default",
            }
        ]
        self.server.set_seed(
            _default_popup_seed(
                self.server,
                settings_overrides={"enabledMediaApps": ["spotify"], "keepAudioPlayingWhenClosed": True},
                custom_apps=custom_apps,
            )
        )
        self.fx.navigate(self.server.url_for("/src/popup/popup.html?sidebar=1"))

        ready = self.fx.eval_async_js(
            """
            window.__f4Errors = [];
            window.addEventListener('error', (e) => window.__f4Errors.push(String(e.message || e.error || 'error')));
            window.addEventListener('unhandledrejection', (e) => window.__f4Errors.push(String(e.reason || 'rejection')));
            const isVisible = (el) => {
              if (!el) return false;
              const cs = window.getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
            };
            const deadline = Date.now() + 4000;
            while (Date.now() < deadline) {
              const btn = document.querySelector('#pm-rail-apps-list [data-app-id="custom-0"]');
              const muteBtn = document.getElementById('rail-btn-mute-notifs');
              if (isVisible(btn) && isVisible(muteBtn)) {
                return { ok: true };
              }
              await new Promise((r) => setTimeout(r, 40));
            }
            return { ok: false, reason: 'Custom app rail button or mute button not visible/rendered' };
            """
        )
        self.assertTrue(ready["ok"], msg=ready.get("reason", ""))

        self.fx.click('#pm-rail-apps-list [data-app-id="custom-0"]')
        media_probe = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline) {
              const ws = document.getElementById('pm-media-workspace');
              const title = document.getElementById('media-active-title');
              const iframe = document.querySelector('#pm-media-frame-pool iframe');
              if (ws && !ws.classList.contains('hidden') && title && iframe) {
                return {
                  ok: true,
                  titleText: (title.textContent || '').trim(),
                  iframeSrc: iframe.getAttribute('src') || ''
                };
              }
              await new Promise((r) => setTimeout(r, 40));
            }
            return { ok: false, reason: 'Media workspace or iframe did not activate' };
            """
        )
        self.assertTrue(media_probe["ok"], msg=media_probe.get("reason", ""))
        self.assertEqual(media_probe["titleText"], "Local Spotify")
        self.assertIn("/mock/spotify", media_probe["iframeSrc"])

        mute_visible = self.fx.eval_js(
            """
            const muteBtn = document.getElementById('rail-btn-mute-notifs');
            if (!muteBtn) return false;
            const cs = window.getComputedStyle(muteBtn);
            const r = muteBtn.getBoundingClientRect();
            return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
            """
        )
        self.assertTrue(mute_visible, "Expected #rail-btn-mute-notifs to be visible before clicking")
        self.fx.click("#rail-btn-mute-notifs")
        audio_probe = self.fx.eval_async_js(
            """
            const pop = document.getElementById('pm-mute-popover');
            try {
              browser.runtime.onMessage._fire({
                type: 'BG_AUDIO_STATUS_CHANGED',
                audibleAppId: 'spotify',
                isAutoPausedByTabAudio: false,
                nowPlaying: { appId: 'spotify', isPlaying: true, title: 'Track 1', artist: 'Artist' }
              });
            } catch (err) {
              window.__f4Errors.push(String(err));
            }
            await new Promise((r) => setTimeout(r, 50));
            return {
              popoverOpen: Boolean(pop && !pop.classList.contains('hidden')),
              errors: window.__f4Errors || []
            };
            """
        )
        self.assertTrue(audio_probe["popoverOpen"])
        self.assertEqual(audio_probe["errors"], [])

    # ------------------------------------------------------------------
    # F16: AMO Compliance (Zero Unsafe DOM / Zero Build) (6 tests)
    # ------------------------------------------------------------------
    def test_f16_amo_lint_passes_with_zero_errors(self) -> None:
        report = lint_extension(REPO_ROOT, check_firefox_js=True, firefox_harness=self.fx)
        self.assertGreaterEqual(report["stats"]["js_files"], 1)
        self.assertGreaterEqual(report["stats"]["html_files"], 1)
        self.assertGreaterEqual(report["stats"]["css_files"], 1)

        err_summary = [f"{e['rule']} ({e['file']}:{e.get('line')}): {e['message']}" for e in report["errors"]]
        for check_key in ["manifest", "html", "js_static", "css", "branding", "firefox_js_parse"]:
            self.assertTrue(report["checks"][check_key], msg=f"AMO check '{check_key}' failed: {err_summary}")
        self.assertTrue(report["ok"], msg=f"AMO lint errors: {err_summary}")
        self.assertEqual(report["errors"], [])

    def test_f16_zero_unsafe_dom_or_eval_across_all_js_and_html(self) -> None:
        report = lint_extension(REPO_ROOT, check_firefox_js=False)
        self.assertTrue(report["checks"]["js_static"], msg=f"js_static failed: {report['errors']}")
        self.assertTrue(report["checks"]["html"], msg=f"html failed: {report['errors']}")

        forbidden_prefixes = (
            "js.unsafe_dom.",
            "js.unsafe_eval.",
            "html.inline_script",
            "html.inline_event_handler",
            "html.javascript_uri",
        )
        bad = [e for e in report["errors"] if str(e.get("rule", "")).startswith(forbidden_prefixes)]
        self.assertEqual(bad, [], msg=f"Unsafe DOM/eval/HTML findings: {bad}")

        gmail_client = REPO_ROOT / "src" / "shared" / "gmail-client.js"
        sender_icons = REPO_ROOT / "src" / "shared" / "sender-icons.js"
        self.assertTrue(gmail_client.is_file())
        self.assertTrue(sender_icons.is_file())
        for path in [gmail_client, sender_icons]:
            lexed = _lex_js(path.read_text(encoding="utf-8"))
            for sink in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write"):
                self.assertNotIn(sink, lexed.code_no_strings, f"{sink} found in {path.name}")

    def test_f16_zero_build_step_and_unminified_sources(self) -> None:
        forbidden_build_artifacts = [
            "package.json",
            "package-lock.json",
            "yarn.lock",
            "pnpm-lock.yaml",
            "webpack.config.js",
            "webpack.config.cjs",
            "vite.config.js",
            "rollup.config.js",
            "tsconfig.json",
            "babel.config.json",
            ".babelrc",
            "esbuild.config.js",
            "gulpfile.js",
            "Gruntfile.js",
            "Makefile",
            "node_modules",
        ]
        for name in forbidden_build_artifacts:
            self.assertFalse((REPO_ROOT / name).exists(), f"Build artifact must not exist: {name}")

        manifest_path = REPO_ROOT / "manifest.json"
        self.assertTrue(manifest_path.is_file())
        manifest_text = manifest_path.read_text(encoding="utf-8")
        for bundle_token in ("dist/", "build/", ".min.js", ".min.css", ".bundle.js"):
            self.assertNotIn(bundle_token, manifest_text, f"Bundle token {bundle_token!r} in manifest.json")

        src_dir = REPO_ROOT / "src"
        self.assertTrue(src_dir.is_dir())
        for path in sorted(src_dir.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in {".js", ".mjs", ".css", ".html"}:
                continue
            text = path.read_text(encoding="utf-8")
            if path.suffix.lower() == ".html":
                for bundle_token in ("dist/", "build/", ".min.js", ".min.css", ".bundle.js"):
                    self.assertNotIn(bundle_token, text, f"Bundle token {bundle_token!r} in {path}")
            self.assertNotIn("//# sourceMappingURL=", text, f"Source map reference in {path}")
            self.assertNotIn("__webpack_require__", text, f"Webpack runtime in {path}")
            self.assertNotIn("webpackJsonp", text, f"Webpack runtime in {path}")
            lines = text.splitlines()
            if len(text.encode("utf-8")) > 200:
                self.assertGreaterEqual(len(lines), 2, f"Single-line minified file suspected: {path}")
            if lines:
                avg_len = sum(len(ln) for ln in lines) / len(lines)
                self.assertLessEqual(avg_len, 160.0, f"Excessive avg line length ({avg_len:.1f}) in {path}")

    def test_f16_spidermonkey_compiles_all_extension_js(self) -> None:
        src_dir = REPO_ROOT / "src"
        self.assertTrue(src_dir.is_dir())
        js_files = sorted([p for p in src_dir.rglob("*") if p.is_file() and p.suffix.lower() in {".js", ".mjs"}])
        self.assertGreater(len(js_files), 0)

        results = self.fx.check_js_syntax(js_files)
        self.assertEqual(len(results), len(js_files))
        failures = [r for r in results if not r["ok"]]
        self.assertEqual(
            failures,
            [],
            f"SpiderMonkey syntax failures: {[(f['path'], f['line'], f['column'], f['error']) for f in failures]}",
        )

        for html_rel in ["src/popup/popup.html", "src/options/options.html"]:
            html_path = REPO_ROOT / html_rel
            srcs = self._extract_html_script_srcs(html_path)
            for s in srcs:
                self.assertTrue((html_path.parent / s).resolve().is_file(), f"Missing script {s} in {html_rel}")

    def test_f16_zero_external_telemetry_and_remote_code(self) -> None:
        manifest = self._read_manifest()
        gecko = manifest.get("browser_specific_settings", {}).get("gecko", {})
        self.assertEqual(gecko.get("data_collection_permissions", {}).get("required"), ["none"])

        csp = manifest.get("content_security_policy")
        if csp is not None:
            csp_low = str(csp).lower()
            for bad_csp in ("'unsafe-eval'", "'unsafe-inline'", "http://", "https://", "ws://", "wss://", "*"):
                self.assertNotIn(bad_csp, csp_low, f"Forbidden CSP token {bad_csp!r}")

        report = lint_extension(REPO_ROOT, check_firefox_js=False)
        remote_errors = [
            e for e in report["errors"] if str(e.get("rule", "")).startswith(("html.remote_", "js.remote_", "css.remote_"))
        ]
        self.assertEqual(remote_errors, [], msg=f"Remote code findings: {remote_errors}")

        telemetry_hosts = (
            "google-analytics.com",
            "googletagmanager.com",
            "sentry.io",
            "mixpanel.com",
            "amplitude.com",
            "segment.io",
            "posthog.com",
            "plausible.io",
        )
        for path in sorted((REPO_ROOT / "src").rglob("*")):
            if not path.is_file():
                continue
            if path.suffix.lower() in {".js", ".mjs"}:
                raw = path.read_text(encoding="utf-8")
                lexed = _lex_js(raw)
                self.assertNotIn("sendBeacon", lexed.code_no_strings, f"navigator.sendBeacon found in {path}")
                low = raw.lower()
                for host in telemetry_hosts:
                    self.assertNotIn(host, low, f"Telemetry host {host} found in {path}")
            elif path.suffix.lower() in {".html", ".htm"}:
                low = path.read_text(encoding="utf-8").lower()
                for host in telemetry_hosts:
                    self.assertNotIn(host, low, f"Telemetry host {host} found in {path}")

        self.server.set_seed(_default_popup_seed(self.server))
        self.server.clear_requests()
        self.server.clear_telemetry()
        self.fx.navigate(self.server.url_for("/src/options/options.html"))
        ready = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline && document.readyState !== 'complete') {
              await new Promise((r) => setTimeout(r, 25));
            }
            return document.readyState === 'complete';
            """
        )
        self.assertTrue(ready)
        self.assertEqual(self.server.get_telemetry(), [])
        for req in self.server.get_requests():
            self.assertTrue(
                req["path"].startswith(("/src/", "/icons/", "/__test__/")),
                f"Unexpected non-local request on extension page boot: {req['path']}",
            )

    def test_f16_userchrome_css_strictly_optional_at_runtime(self) -> None:
        manifest = self._read_manifest()
        self.assertNotIn("userchrome", json.dumps(manifest).lower())
        perms = manifest.get("permissions", [])
        self.assertNotIn("nativeMessaging", perms)

        self.assertFalse((self.fx.profile_dir / "chrome" / "userChrome.css").exists())
        self.server.set_seed(_default_popup_seed(self.server))

        for rel in ["/src/popup/popup.html?sidebar=1", "/src/options/options.html"]:
            self.fx.navigate(self.server.url_for(rel))
            state = self.fx.eval_async_js(
                """
                const deadline = Date.now() + 3000;
                while (Date.now() < deadline && document.readyState !== 'complete') {
                  await new Promise((r) => setTimeout(r, 25));
                }
                return {
                  ready: document.readyState === 'complete',
                  childCount: document.body ? document.body.children.length : 0
                };
                """
            )
            self.assertTrue(state["ready"], f"Page did not reach readyState=complete: {rel}")
            self.assertGreater(state["childCount"], 0, f"Empty body for {rel}")


if __name__ == "__main__":
    unittest.main()
