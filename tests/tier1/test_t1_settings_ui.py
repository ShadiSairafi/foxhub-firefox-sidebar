"""Tier 1 happy-path tests for F5, F6, and F7 (Unified Settings, UI Overhaul & Header Declutter)."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import re
import sys
import time
import unittest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tests.lib.amo_lint import lint_extension
from tests.lib.firefox_harness import HeadlessFirefox
from tests.lib.http_fixtures import FixtureServer


class _BgScriptSrcParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.srcs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "script":
            for k, v in attrs:
                if k.lower() == "src" and v:
                    self.srcs.append(v.strip())


def _make_full_seed(settings_overrides: dict | None = None) -> dict:
    now_ms = int(time.time() * 1000)
    settings = {
        "theme": "warm-linen",
        "wallpaper": "watercolor-hills",
        "wallpaperOpacity": 0.95,
        "wallpaperBlur": 0,
        "wallpaperFit": "cover",
        "gradientColor1": "#FAD6A5",
        "gradientColor2": "#E8A598",
        "customGradient1": "#FAD6A5",
        "customGradient2": "#E8A598",
        "gradientAngle": 135,
        "cardStyle": "glassmorphism",
        "cardOpacity": 0.62,
        "cardBlur": 16,
        "cardRadius": 15,
        "cardDensity": "cozy",
        "cardActionsMode": "always",
        "avatarShape": "squircle",
        "showLeftAccent": True,
        "tabStyle": "glass-pills",
        "fontStyle": "editorial",
        "ambientEffect": "sunbeams",
        "popupWidth": 560,
        "popupHeight": 600,
        "autoFitEmail": True,
        "badgeCountMode": "feed",
        "pollIntervalSeconds": 30,
        "demoMode": "on",
        "maxSessionSlots": 1,
        "maxEmailsPerAccount": 15,
        "accountConfigs": {},
        "oauthAccounts": [],
        "soundId": "marimba",
        "soundVolume": 0.75,
        "desktopNotifications": True,
        "voiceNotifications": False,
        "muteEmailNotifications": False,
        "muteSiteNotifications": False,
        "socialAppNotifySounds": True,
        "ttsRate": 1.0,
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
        "mediaAppsOrder": [],
        "customMediaApps": [],
        "sidebarOpenMode": "auto",
        "socialAppThemeMode": "native",
        "hideMediaBottomBar": False,
        "mediaTopBarMode": "hover",
        "autoHideMediaTopBar": True,
        "persistenceMode": "selected",
        "persistentAppIds": [],
        "persistentOpenAppIds": [],
        "persistentLastActiveAppId": "pocketmail",
        "persistentSavedAppUrls": {},
        "keepAudioPlayingWhenClosed": True,
        "tabAudioBehavior": "pause-resume",
        "autoPauseOnTabAudio": True,
        "bgAudioAppIds": ["spotify", "youtube", "soundcloud"],
        "customVideoLoadbar": True,
        "videoLoadbarStyle": "sunset",
        "videoLoadbarColor": "#FF3366",
        "videoLoadbarSize": "normal",
        "globalShortcuts": {
            "popup": "Alt+Shift+F",
            "sidebar": "Alt+Shift+M",
            "popout": "Alt+Shift+W",
        },
        "appShortcuts": {},
        "appShortcutOpenMode": "sidebar",
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
                        "snippet": "Test inbox message.",
                        "fullText": "Test inbox message body.",
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
    }

    return {
        "storage": {"settings": settings},
        "messageResponses": {
            "GET_STATE": {"ok": True, "state": state, "settings": settings, "snoozed": {}, "sidebarOpenCount": 1},
            "SYNC_NOW": {"ok": True, "state": state, "settings": settings},
            "STOP_BG_AUDIO_HANDOFF": {"ok": True, "skipped": True, "settings": settings, "activeBgApps": []},
            "UPDATE_SETTINGS": {"ok": True, "settings": settings, "state": state},
        },
    }


class TestT1SettingsUI(unittest.TestCase):
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
    def _navigate_background_offline(self, seed: dict) -> None:
        bg_html = REPO_ROOT / "src" / "background" / "background.html"
        self.assertTrue(bg_html.is_file(), "Missing src/background/background.html")
        parser = _BgScriptSrcParser()
        parser.feed(bg_html.read_text(encoding="utf-8"))
        script_tags = []
        for rel in parser.srcs:
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

    def _register_schema_fixture(self) -> str:
        html = (
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            "<script src='/src/shared/settings-schema.js'></script>"
            "</head><body><div id='root'></div></body></html>"
        )
        return self.server.register_fixture("schema_harness.html", html)

    def _open_popup_ready(self, path: str = "/src/popup/popup.html?sidebar=1", width: int = 320, height: int = 640, seed: dict | None = None) -> None:
        self.fx.set_viewport(width, height)
        self.server.set_seed(seed if seed is not None else _make_full_seed())
        self.fx.navigate(self.server.url_for(path))
        ready = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 4000;
            while (Date.now() < deadline) {
              const rail = document.getElementById('pm-rail-apps-list');
              const actions = document.querySelector('.pm-header-actions');
              if (document.readyState === 'complete' && rail && actions && rail.children.length > 0) {
                return { ok: true };
              }
              await new Promise((r) => setTimeout(r, 40));
            }
            return { ok: false, reason: 'Popup shell did not finish initial render' };
            """
        )
        self.assertTrue(ready["ok"], msg=ready.get("reason", ""))

    def _open_options_ready(self, width: int = 1200, height: int = 800, seed: dict | None = None) -> None:
        self.fx.set_viewport(width, height)
        self.server.set_seed(seed if seed is not None else _make_full_seed())
        self.fx.navigate(self.server.url_for("/src/options/options.html"))
        ready = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 4000;
            while (Date.now() < deadline) {
              if (document.readyState === 'complete' && document.body && document.body.children.length > 0) {
                const calls = window.__webextMock ? window.__webextMock.getCalls('runtime.sendMessage') : [];
                if (calls.some((c) => c.args && c.args[0] && c.args[0].type === 'GET_STATE')) {
                  return { ok: true };
                }
              }
              await new Promise((r) => setTimeout(r, 40));
            }
            return { ok: false, reason: 'Options page did not finish initial GET_STATE boot' };
            """
        )
        self.assertTrue(ready["ok"], msg=ready.get("reason", ""))

    def _open_sidebar_settings_drawer(self) -> str:
        btn_ok = self.fx.eval_js(
            """
            const btn = document.getElementById('rail-btn-sidebar-settings');
            if (!btn) return { ok: false, reason: 'Missing #rail-btn-sidebar-settings' };
            const cs = window.getComputedStyle(btn);
            const r = btn.getBoundingClientRect();
            return {
              ok: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0,
              reason: 'Settings rail button is hidden or has zero size'
            };
            """
        )
        self.assertTrue(btn_ok["ok"], msg=btn_ok.get("reason", ""))
        self.fx.click("#rail-btn-sidebar-settings")

        opened = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 2500;
            while (Date.now() < deadline) {
              const candidates = [
                '#pm-settings-drawer',
                '#pm-media-apps-drawer',
                '[data-foxhub-settings-root]',
                '.fh-settings-root'
              ];
              for (const sel of candidates) {
                const el = document.querySelector(sel);
                if (!el) continue;
                const cs = window.getComputedStyle(el);
                const r = el.getBoundingClientRect();
                if (!el.classList.contains('hidden') && cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 20) {
                  el.setAttribute('data-t1-settings-root', '1');
                  return { ok: true, selector: '[data-t1-settings-root="1"]' };
                }
              }
              await new Promise((r) => setTimeout(r, 40));
            }
            return { ok: false, reason: 'Sidebar settings drawer did not open' };
            """
        )
        self.assertTrue(opened["ok"], msg=opened.get("reason", ""))
        return opened["selector"]

    def _resolve_options_settings_root(self) -> str:
        res = self.fx.eval_js(
            """
            const candidates = [
              '.opt-layout',
              '[data-foxhub-settings-root]',
              '.fh-settings-root',
              'main.opt-main',
              'main'
            ];
            for (const sel of candidates) {
              const el = document.querySelector(sel);
              if (!el) continue;
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) {
                el.setAttribute('data-t1-settings-root', '1');
                return { ok: true, selector: '[data-t1-settings-root="1"]' };
              }
            }
            return { ok: false, reason: 'No visible settings container found on options.html' };
            """
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        return res["selector"]

    def _assert_no_settings_overflow_or_overlap(self, root_sel: str, surface_name: str) -> None:
        report = self.fx.eval_js(
            """
            const root = document.querySelector(arguments[0]);
            if (!root) return { ok: false, reason: 'Settings root missing' };
            const vw = window.innerWidth;
            const docOverflow = document.documentElement.scrollWidth > vw + 1;
            const controls = Array.from(root.querySelectorAll('button, input, select, summary, [role="tab"]')).filter((el) => {
              const cs = window.getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            });
            const clipped = [];
            for (const el of controls) {
              const r = el.getBoundingClientRect();
              if (r.left < -2 || r.right > vw + 2) {
                clipped.push({ text: (el.textContent || el.id || el.tagName).trim().slice(0, 40), left: r.left, right: r.right, vw });
              }
            }
            const overlaps = [];
            const cards = Array.from(root.querySelectorAll('.fh-setting-card, .fh-setting-row, .pm-control-card, .opt-card'));
            for (const card of cards) {
              const cs = window.getComputedStyle(card);
              if (cs.display === 'none' || cs.visibility === 'hidden') continue;
              const btns = Array.from(card.querySelectorAll('button, input[type="checkbox"], select')).filter((el) => {
                const s = window.getComputedStyle(el);
                const r = el.getBoundingClientRect();
                return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 2 && r.height > 2;
              });
              for (let i = 0; i < btns.length; i++) {
                for (let j = i + 1; j < btns.length; j++) {
                  const a = btns[i].getBoundingClientRect();
                  const b = btns[j].getBoundingClientRect();
                  const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
                  const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
                  if (ix > 2 && iy > 2) {
                    overlaps.push({ a: btns[i].id || btns[i].tagName, b: btns[j].id || btns[j].tagName, ix, iy });
                  }
                }
              }
            }
            return { ok: true, docOverflow, scrollWidth: document.documentElement.scrollWidth, vw, controlCount: controls.length, clipped, overlaps };
            """,
            root_sel,
        )
        self.assertTrue(report["ok"], msg=report.get("reason", ""))
        self.assertFalse(
            report["docOverflow"],
            f"{surface_name} horizontal overflow: scrollWidth={report['scrollWidth']} > vw={report['vw']}",
        )
        self.assertGreater(report["controlCount"], 0, f"{surface_name} rendered zero visible controls")
        self.assertEqual(report["clipped"], [], f"{surface_name} clipped controls: {report['clipped']}")
        self.assertEqual(report["overlaps"], [], f"{surface_name} overlapping controls: {report['overlaps']}")

    # ------------------------------------------------------------------
    # F5: Unified Settings Source of Truth & Cleanup (6 tests)
    # ------------------------------------------------------------------
    def test_f5_schema_single_source_of_truth_and_defaults(self) -> None:
        schema_path = REPO_ROOT / "src" / "shared" / "settings-schema.js"
        self.assertTrue(schema_path.is_file(), "Missing src/shared/settings-schema.js")

        url = self._register_schema_fixture()
        self.server.set_seed({})
        self.fx.navigate(url)

        res = self.fx.eval_js(
            """
            const s = window.FoxHubSettingsSchema;
            if (!s) return { ok: false, reason: 'window.FoxHubSettingsSchema missing' };
            return {
              ok: true,
              hasAlias: window.PocketMailSettingsSchema === s,
              defaults: s.DEFAULT_SETTINGS,
              themeKeys: s.THEME_OR_LAYOUT_KEYS
            };
            """
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertTrue(res["hasAlias"])
        d = res["defaults"]
        for key in [
            "miniNowPlayingEnabled",
            "miniNowPlayingPosition",
            "miniNowPlayingCompact",
            "miniNowPlayingShowProgress",
            "miniNowPlayingAutoHidePaused",
            "contextMenuEnabled",
            "contextMenuOpenBehavior",
            "quickSwitcherEnabled",
            "quickSwitcherShortcut",
            "railPlayingIndicatorEnabled",
            "railQuickControlsEnabled",
            "gradientColor1",
            "gradientColor2",
        ]:
            self.assertIn(key, d, f"Missing DEFAULT_SETTINGS key: {key}")
        self.assertEqual(d["persistenceMode"], "selected")
        self.assertEqual(d["tabAudioBehavior"], "pause-resume")
        self.assertEqual(d["bgAudioAppIds"], ["spotify", "youtube", "soundcloud"])
        self.assertIn("gradientColor1", res["themeKeys"])
        self.assertIn("gradientColor2", res["themeKeys"])

    def test_f5_normalize_settings_bidirectional_sync_and_legacy_cleanup(self) -> None:
        self.assertTrue((REPO_ROOT / "src" / "shared" / "settings-schema.js").is_file())
        url = self._register_schema_fixture()
        self.server.set_seed({})
        self.fx.navigate(url)

        res = self.fx.eval_js(
            """
            const s = window.FoxHubSettingsSchema;
            const n1 = s.normalizeSettings({
              topBarAutoHideMigratedV1: true,
              persistenceDefaultOffMigratedV4: true,
              bgAudioAppIdsMigratedV1: true,
              bgAudioAppIdsSoundCloudMigratedV2: true,
              mediaTopBarMode: 'pinned',
              gradientColor1: '#112233',
              customGradient2: '#445566',
              tabAudioBehavior: 'off',
              muteSiteNotifications: true,
              mediaPersistenceMode: 'none',
              lastActiveAppId: 'spotify',
              savedAppSessions: { spotify: 'https://open.spotify.com/' },
              savedOpenPersistentApps: ['spotify']
            });
            const p1 = s.normalizeSettingsPatch(
              { autoHideMediaTopBar: false, autoPauseOnTabAudio: false, socialAppNotifySounds: false },
              s.DEFAULT_SETTINGS
            );
            return { n1, p1 };
            """
        )
        n1 = res["n1"]
        self.assertFalse(n1["autoHideMediaTopBar"])
        self.assertEqual(n1["customGradient1"], "#112233")
        self.assertEqual(n1["gradientColor2"], "#445566")
        self.assertFalse(n1["autoPauseOnTabAudio"])
        self.assertFalse(n1["socialAppNotifySounds"])
        self.assertEqual(n1["persistenceMode"], "eco")
        for legacy_key in ("mediaPersistenceMode", "lastActiveAppId", "savedAppSessions", "savedOpenPersistentApps"):
            self.assertNotIn(legacy_key, n1, f"Legacy key {legacy_key} should be stripped")

        p1 = res["p1"]
        self.assertEqual(p1["mediaTopBarMode"], "pinned")
        self.assertEqual(p1["tabAudioBehavior"], "off")
        self.assertTrue(p1["muteSiteNotifications"])

    def test_f5_popup_and_options_load_shared_settings_schema(self) -> None:
        self.assertTrue((REPO_ROOT / "src" / "shared" / "settings-schema.js").is_file())
        self.assertTrue((REPO_ROOT / "src" / "shared" / "settings-ui.js").is_file(), "Missing src/shared/settings-ui.js")

        self._open_popup_ready("/src/popup/popup.html?sidebar=1", 320, 640)
        popup_schema = self.fx.eval_js(
            "return window.FoxHubSettingsSchema ? Object.keys(window.FoxHubSettingsSchema.DEFAULT_SETTINGS).sort() : null;"
        )
        self.assertIsNotNone(popup_schema, "popup.html must load window.FoxHubSettingsSchema")

        self._open_options_ready(1200, 800)
        options_schema = self.fx.eval_js(
            "return window.FoxHubSettingsSchema ? Object.keys(window.FoxHubSettingsSchema.DEFAULT_SETTINGS).sort() : null;"
        )
        self.assertIsNotNone(options_schema, "options.html must load window.FoxHubSettingsSchema")
        self.assertEqual(popup_schema, options_schema)

    def test_f5_shared_storage_and_settings_sync_between_sidebar_and_options(self) -> None:
        self.assertTrue((REPO_ROOT / "src" / "shared" / "settings-ui.js").is_file(), "Missing src/shared/settings-ui.js")

        initial_seed = _make_full_seed({"miniNowPlayingEnabled": True})
        self._open_popup_ready("/src/popup/popup.html?sidebar=1", 320, 640, seed=initial_seed)
        root_sel = self._open_sidebar_settings_drawer()

        target = self.fx.eval_async_js(
            """
            const root = document.querySelector(arguments[0]);
            if (!root) return { ok: false, reason: 'Settings drawer root missing' };

            const isElVisible = (el) => {
              if (!el) return false;
              const cs = window.getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            };

            const resolveClickable = (ctrl) => {
              if (!ctrl) return null;
              if (ctrl.tagName === 'INPUT') {
                const switchLbl = ctrl.closest('label.fh-switch, label.pm-switch, label.opt-switch');
                if (isElVisible(switchLbl)) return switchLbl;
                const sw = ctrl.closest('.fh-switch, .pm-switch, .opt-switch, [role="switch"]');
                const lbl = ctrl.closest('label') || (ctrl.id ? document.querySelector(`label[for="${CSS.escape(ctrl.id)}"]`) : null);
                if (ctrl.type === 'checkbox') {
                  if (isElVisible(sw) && sw.tagName === 'LABEL') return sw;
                  if (isElVisible(lbl)) return lbl;
                  if (isElVisible(sw)) return sw;
                }
                if (isElVisible(ctrl)) return ctrl;
                if (isElVisible(lbl)) return lbl;
                if (isElVisible(sw)) return sw;
                return null;
              }
              return isElVisible(ctrl) ? ctrl : null;
            };

            const getCtrlText = (c) => {
              const cardOrRow = c.closest('.fh-setting-row, .fh-setting-card, .fh-card, .fh-settings-card, .opt-card, .opt-shortcut-item, .pm-control-card, [data-setting-item], [data-setting-key]');
              const lbl = c.closest('label') || (c.id ? root.querySelector(`label[for="${CSS.escape(c.id)}"]`) : null);
              const fallbackDiv = (!cardOrRow && !lbl) ? c.closest('div') : null;
              return [
                cardOrRow ? cardOrRow.textContent : '',
                lbl ? lbl.textContent : '',
                fallbackDiv ? fallbackDiv.textContent : '',
                c.getAttribute('aria-label') || ''
              ].join(' ');
            };

            const findCtrl = () => {
              const byAttr = root.querySelector(
                '[data-setting-key="miniNowPlayingEnabled"] input[type="checkbox"], input[data-setting-key="miniNowPlayingEnabled"], button[role="switch"][data-setting-key="miniNowPlayingEnabled"]'
              );
              if (byAttr) return byAttr;
              const candidates = Array.from(root.querySelectorAll('input[type="checkbox"], button[role="switch"]'));
              return candidates.find((c) => /mini.*now playing|now playing bar/i.test(getCtrlText(c))) || null;
            };

            let el = findCtrl();
            let clickTarget = resolveClickable(el);

            if (!clickTarget) {
              const catBtns = Array.from(root.querySelectorAll(
                '[data-settings-cat], [data-category], [data-cat], .fh-cat-btn, .fh-nav-btn, nav button, [role="tablist"] [role="tab"]'
              )).filter(isElVisible);
              for (const btn of catBtns) {
                btn.click();
                await new Promise((r) => setTimeout(r, 40));
                el = findCtrl();
                clickTarget = resolveClickable(el);
                if (clickTarget) break;
              }
            }

            if (!clickTarget) {
              const searchInp = Array.from(root.querySelectorAll('input[type="search"], input[type="text"]')).find((inp) => {
                if (inp.id === 'pm-search-input' || !isElVisible(inp)) return false;
                const ph = (inp.getAttribute('placeholder') || '').toLowerCase();
                const al = (inp.getAttribute('aria-label') || '').toLowerCase();
                return inp.type === 'search' || ph.includes('search') || ph.includes('filter') || al.includes('search');
              });
              if (searchInp) {
                searchInp.value = 'Now Playing';
                searchInp.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise((r) => setTimeout(r, 80));
                el = findCtrl();
                clickTarget = resolveClickable(el);
              }
            }

            if (!el) return { ok: false, reason: 'No unified miniNowPlayingEnabled control found in sidebar settings' };
            if (!clickTarget) return { ok: false, reason: 'Target miniNowPlayingEnabled control is hidden or has zero bounding box' };

            clickTarget.scrollIntoView({ block: 'center' });
            await new Promise((r) => setTimeout(r, 20));
            if (!isElVisible(clickTarget)) {
              return { ok: false, reason: 'Target miniNowPlayingEnabled clickable element not visible after scroll' };
            }
            clickTarget.setAttribute('data-t1-sync-ctrl', '1');
            const checkedBefore = el.tagName === 'INPUT'
              ? Boolean(el.checked)
              : (el.getAttribute('aria-checked') === 'true');
            return { ok: true, checkedBefore };
            """,
            root_sel,
        )
        self.assertTrue(target["ok"], msg=target.get("reason", ""))
        self.fx.eval_js("window.__webextMock.clearCalls();")
        self.fx.click('[data-t1-sync-ctrl="1"]')

        sent = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 2000;
            while (Date.now() < deadline) {
              const calls = window.__webextMock.getCalls('runtime.sendMessage');
              const upd = calls.find((c) => c.args && c.args[0] && c.args[0].type === 'UPDATE_SETTINGS');
              if (upd) return { ok: true, payload: upd.args[0] };
              await new Promise((r) => setTimeout(r, 30));
            }
            return { ok: false, reason: 'Toggling setting in sidebar drawer did not send UPDATE_SETTINGS' };
            """
        )
        self.assertTrue(sent["ok"], msg=sent.get("reason", ""))
        self.assertIn("miniNowPlayingEnabled", sent["payload"].get("settings", {}))
        new_val = bool(sent["payload"]["settings"]["miniNowPlayingEnabled"])
        self.assertNotEqual(new_val, target["checkedBefore"])

        synced_seed = _make_full_seed({"miniNowPlayingEnabled": new_val})
        self._open_options_ready(1200, 800, seed=synced_seed)
        opt_root_sel = self._resolve_options_settings_root()
        opt_probe = self.fx.eval_async_js(
            """
            const expected = arguments[0];
            const settingsPayload = arguments[1];
            const statePayload = arguments[2];
            const scope = document.querySelector(arguments[3]) || document;

            const isElVisible = (el) => {
              if (!el) return false;
              const cs = window.getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            };

            const getCtrlText = (c) => {
              const cardOrRow = c.closest('.fh-setting-row, .fh-setting-card, .fh-card, .fh-settings-card, .opt-card, .opt-shortcut-item, .pm-control-card, [data-setting-item], [data-setting-key]');
              const lbl = c.closest('label') || (c.id ? scope.querySelector(`label[for="${CSS.escape(c.id)}"]`) : null);
              const fallbackDiv = (!cardOrRow && !lbl) ? c.closest('div') : null;
              return [
                cardOrRow ? cardOrRow.textContent : '',
                lbl ? lbl.textContent : '',
                fallbackDiv ? fallbackDiv.textContent : '',
                c.getAttribute('aria-label') || ''
              ].join(' ');
            };

            const findCtrl = () => {
              const byAttr = scope.querySelector(
                '[data-setting-key="miniNowPlayingEnabled"] input[type="checkbox"], input[data-setting-key="miniNowPlayingEnabled"], button[role="switch"][data-setting-key="miniNowPlayingEnabled"]'
              );
              if (byAttr) return byAttr;
              const candidates = Array.from(scope.querySelectorAll('input[type="checkbox"], button[role="switch"]'));
              return candidates.find((c) => /mini.*now playing|now playing bar/i.test(getCtrlText(c))) || null;
            };

            const isCtrlOrWrapperVisible = (ctrl) => {
              if (!ctrl) return false;
              if (isElVisible(ctrl) || isElVisible(ctrl.closest('label'))) return true;
              const forLbl = ctrl.id ? document.querySelector(`label[for="${CSS.escape(ctrl.id)}"]`) : null;
              if (isElVisible(forLbl)) return true;
              return isElVisible(ctrl.closest('[role="switch"], .fh-switch, .pm-switch, .opt-switch'));
            };

            const revealCtrl = async () => {
              let ctrl = findCtrl();
              if (isCtrlOrWrapperVisible(ctrl)) return ctrl;
              const catBtns = Array.from(document.querySelectorAll(
                '[data-settings-cat], [data-category], [data-cat], .fh-cat-btn, .fh-nav-btn, nav button, [role="tablist"] [role="tab"]'
              )).filter(isElVisible);
              for (const btn of catBtns) {
                btn.click();
                await new Promise((r) => setTimeout(r, 40));
                ctrl = findCtrl();
                if (isCtrlOrWrapperVisible(ctrl)) return ctrl;
              }
              return findCtrl();
            };

            const readChecked = (ctrl) => (
              ctrl.tagName === 'INPUT'
                ? Boolean(ctrl.checked)
                : (ctrl.getAttribute('aria-checked') === 'true')
            );

            const el = await revealCtrl();
            if (!el) return { ok: false, reason: 'Matching miniNowPlayingEnabled control missing on options.html' };
            const initialChecked = readChecked(el);
            if (initialChecked !== expected) {
              return { ok: false, reason: `Expected options control=${expected}, got ${initialChecked}` };
            }
            const updatedSettings = Object.assign({}, settingsPayload, { miniNowPlayingEnabled: !expected });
            browser.runtime.onMessage._fire({
              type: 'STATE_UPDATED',
              state: statePayload,
              settings: updatedSettings
            });
            await new Promise((r) => setTimeout(r, 80));
            const liveEl = await revealCtrl();
            const afterChecked = liveEl ? readChecked(liveEl) : null;
            return { ok: Boolean(liveEl) && afterChecked === !expected, afterChecked, expectedAfter: !expected, reason: 'options.html did not live-update on STATE_UPDATED' };
            """,
            new_val,
            synced_seed["storage"]["settings"],
            synced_seed["messageResponses"]["GET_STATE"]["state"],
            opt_root_sel,
        )
        self.assertTrue(opt_probe["ok"], msg=opt_probe.get("reason", ""))

    def test_f5_background_router_persists_canonical_settings_to_storage(self) -> None:
        self._navigate_background_offline({"storage": {"settings": {"demoMode": "on", "maxSessionSlots": 1}}})

        boot = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 5000;
            while (Date.now() < deadline) {
              if (window.FoxHubBg && window.FoxHubBg.state && window.FoxHubBg.state.cachedState && Number(window.FoxHubBg.state.cachedState.lastSyncAt) > 0) {
                return { ok: true };
              }
              await new Promise((r) => setTimeout(r, 40));
            }
            return { ok: false, reason: 'Background did not finish boot' };
            """
        )
        self.assertIsInstance(boot, dict)
        self.assertTrue(boot["ok"], msg=boot.get("reason", ""))

        res = self.fx.eval_async_js(
            """
            const upd = await browser.runtime.sendMessage({
              type: 'UPDATE_SETTINGS',
              settings: {
                gradientColor1: '#123456',
                mediaTopBarMode: 'pinned',
                tabAudioBehavior: 'pause-only',
                miniNowPlayingEnabled: false
              }
            });
            await new Promise((r) => setTimeout(r, 320));
            const stored = await browser.storage.local.get('settings');
            const stateRes = await browser.runtime.sendMessage({ type: 'GET_STATE' });
            return { upd, storedSettings: stored.settings, stateSettings: stateRes.settings };
            """
        )
        self.assertTrue(res["upd"]["ok"])
        for s in (res["storedSettings"], res["stateSettings"]):
            self.assertEqual(s["gradientColor1"], "#123456")
            self.assertEqual(s["customGradient1"], "#123456")
            self.assertEqual(s["mediaTopBarMode"], "pinned")
            self.assertFalse(s["autoHideMediaTopBar"])
            self.assertEqual(s["tabAudioBehavior"], "pause-only")
            self.assertTrue(s["autoPauseOnTabAudio"])
            self.assertFalse(s["miniNowPlayingEnabled"])

    def test_f5_zero_user_facing_pocketmail_in_ui_and_html(self) -> None:
        report = lint_extension(REPO_ROOT, check_firefox_js=False)
        branding_errors = [
            e
            for e in report["errors"]
            if e.get("rule") in {"branding.pocketmail_html", "branding.pocketmail_ui_string"}
        ]
        self.assertEqual(branding_errors, [], msg=f"PocketMail branding errors: {branding_errors}")

        for page_url, w, h in [
            ("/src/popup/popup.html?sidebar=1", 320, 640),
            ("/src/options/options.html", 1200, 800),
        ]:
            if "popup" in page_url:
                self._open_popup_ready(page_url, w, h)
            else:
                self._open_options_ready(w, h)
            hits = self.fx.eval_js(
                """
                const out = [];
                if (/pocketmail/i.test(document.title || '')) {
                  out.push({ kind: 'title', text: document.title });
                }
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                let node;
                while ((node = walker.nextNode())) {
                  const parentTag = node.parentElement ? node.parentElement.tagName : '';
                  if (parentTag === 'SCRIPT' || parentTag === 'STYLE') continue;
                  const txt = (node.nodeValue || '').trim();
                  if (txt && /pocketmail/i.test(txt)) {
                    out.push({ kind: 'text', text: txt.slice(0, 100) });
                  }
                }
                for (const el of document.querySelectorAll('[title], [aria-label], [placeholder], [alt]')) {
                  for (const attr of ['title', 'aria-label', 'placeholder', 'alt']) {
                    const val = el.getAttribute(attr);
                    if (val && /pocketmail/i.test(val)) {
                      out.push({ kind: attr, text: val.slice(0, 100) });
                    }
                  }
                }
                return out;
                """
            )
            self.assertEqual(hits, [], msg=f"Found user-facing 'PocketMail' in {page_url}: {hits}")

    # ------------------------------------------------------------------
    # F6: Fluent Unified Settings UI Overhaul (6 tests)
    # ------------------------------------------------------------------
    def test_f6_unified_settings_ui_asset_and_categorized_navigation_both_surfaces(self) -> None:
        self.assertTrue((REPO_ROOT / "src" / "shared" / "settings-ui.js").is_file(), "Missing src/shared/settings-ui.js")
        self.assertTrue((REPO_ROOT / "src" / "shared" / "settings-ui.css").is_file(), "Missing src/shared/settings-ui.css")

        for surface in ("sidebar", "options"):
            if surface == "sidebar":
                self._open_popup_ready("/src/popup/popup.html?sidebar=1", 320, 640)
                root_sel = self._open_sidebar_settings_drawer()
            else:
                self._open_options_ready(1200, 800)
                root_sel = self._resolve_options_settings_root()

            nav_probe = self.fx.eval_js(
                """
                const root = document.querySelector(arguments[0]);
                const btns = Array.from(root.querySelectorAll(
                  '[data-settings-cat], [data-category], [data-cat], .fh-cat-btn, .fh-nav-btn, nav button, [role="tablist"] [role="tab"]'
                )).filter((el) => {
                  const cs = window.getComputedStyle(el);
                  const r = el.getBoundingClientRect();
                  return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
                });
                if (btns.length < 4) {
                  return { ok: false, count: btns.length, reason: `Expected >= 4 settings category buttons on ${arguments[1]}, found ${btns.length}` };
                }
                const target = btns.find((b) => !b.classList.contains('active') && b.getAttribute('aria-selected') !== 'true') || btns[1];
                target.setAttribute('data-t1-cat-target', '1');
                return {
                  ok: true,
                  count: btns.length,
                  targetLabel: (target.textContent || '').trim(),
                  beforeHtmlLen: root.innerText.trim().length
                };
                """,
                root_sel,
                surface,
            )
            self.assertTrue(nav_probe["ok"], msg=nav_probe.get("reason", ""))
            self.fx.click('[data-t1-cat-target="1"]')

            after = self.fx.eval_js(
                """
                const b = document.querySelector('[data-t1-cat-target="1"]');
                return {
                  isActive: Boolean(b && (b.classList.contains('active') || b.getAttribute('aria-selected') === 'true' || b.getAttribute('data-active') === 'true'))
                };
                """
            )
            self.assertTrue(after["isActive"], f"Clicking category '{nav_probe['targetLabel']}' on {surface} did not activate it")

    def test_f6_live_search_filter_across_settings_in_sidebar_and_options(self) -> None:
        self.assertTrue((REPO_ROOT / "src" / "shared" / "settings-ui.js").is_file(), "Missing src/shared/settings-ui.js")

        for surface in ("sidebar", "options"):
            if surface == "sidebar":
                self._open_popup_ready("/src/popup/popup.html?sidebar=1", 320, 640)
                root_sel = self._open_sidebar_settings_drawer()
            else:
                self._open_options_ready(1200, 800)
                root_sel = self._resolve_options_settings_root()

            search_probe = self.fx.eval_js(
                """
                const root = document.querySelector(arguments[0]);
                const CARD_SEL = '.fh-setting-card, .fh-setting-row, .fh-card, .fh-settings-card, [data-setting-item], [data-setting-key], .opt-card, .opt-shortcut-item, .pm-control-card';
                const inputs = Array.from(root.querySelectorAll('input[type="search"], input[type="text"]')).filter((el) => {
                  if (el.id === 'pm-search-input') return false;
                  const cs = window.getComputedStyle(el);
                  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
                  const ph = (el.getAttribute('placeholder') || '').toLowerCase();
                  const al = (el.getAttribute('aria-label') || '').toLowerCase();
                  const r = el.getBoundingClientRect();
                  return r.width > 0 && r.height > 0 && (el.type === 'search' || ph.includes('search') || ph.includes('filter') || al.includes('search'));
                });
                if (inputs.length === 0) {
                  return { ok: false, reason: `Missing visible settings search input on ${arguments[1]}` };
                }
                inputs[0].setAttribute('data-t1-settings-search', '1');
                const items = Array.from(root.querySelectorAll(CARD_SEL)).filter((c) => {
                  if (c.parentElement && c.parentElement.closest(CARD_SEL)) return false;
                  const cs = window.getComputedStyle(c);
                  const r = c.getBoundingClientRect();
                  return cs.display !== 'none' && cs.visibility !== 'hidden' && !c.classList.contains('hidden') && r.height > 0 && r.width > 0;
                });
                return { ok: true, initialVisibleCount: items.length };
                """,
                root_sel,
                surface,
            )
            self.assertTrue(search_probe["ok"], msg=search_probe.get("reason", ""))

            filter_js = """
                await new Promise((r) => setTimeout(r, 80));
                const root = document.querySelector(arguments[0]);
                const CARD_SEL = '.fh-setting-card, .fh-setting-row, .fh-card, .fh-settings-card, [data-setting-item], [data-setting-key], .opt-card, .opt-shortcut-item, .pm-control-card';
                const getVisibleText = (node) => {
                  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
                  let out = '';
                  let txtNode;
                  while ((txtNode = walker.nextNode())) {
                    let hidden = false;
                    let cur = txtNode.parentElement;
                    while (cur && cur !== node.parentElement) {
                      const cs = window.getComputedStyle(cur);
                      if (cur.tagName === 'SCRIPT' || cur.tagName === 'STYLE' || cs.display === 'none' || cs.visibility === 'hidden' || cur.classList.contains('hidden')) {
                        hidden = true;
                        break;
                      }
                      cur = cur.parentElement;
                    }
                    if (!hidden) out += ' ' + (txtNode.nodeValue || '');
                  }
                  return out;
                };
                const visibleCards = Array.from(root.querySelectorAll(CARD_SEL)).filter((c) => {
                  if (c.parentElement && c.parentElement.closest(CARD_SEL)) return false;
                  const cs = window.getComputedStyle(c);
                  const r = c.getBoundingClientRect();
                  return cs.display !== 'none' && cs.visibility !== 'hidden' && !c.classList.contains('hidden') && r.height > 0 && r.width > 0;
                });
                const texts = visibleCards.map(getVisibleText);
                const hasNowPlaying = texts.some((t) => /now playing/i.test(t));
                const hasWallpaper = texts.some((t) => /watercolor|sunbeams|wallpaper/i.test(t));
                return { count: visibleCards.length, hasNowPlaying, hasWallpaper };
            """

            self.fx.type_text('[data-t1-settings-search="1"]', "Now Playing", clear=True)
            filtered_np = self.fx.eval_async_js(filter_js, root_sel)
            self.assertTrue(filtered_np["hasNowPlaying"], f"Search 'Now Playing' did not surface Now Playing setting on {surface}")
            self.assertFalse(filtered_np["hasWallpaper"], f"Search 'Now Playing' left unrelated wallpaper card visible on {surface}")

            # Second cross-category query to catch no-op search on tabbed UIs
            self.fx.type_text('[data-t1-settings-search="1"]', "Wallpaper", clear=True)
            filtered_wp = self.fx.eval_async_js(filter_js, root_sel)
            self.assertTrue(filtered_wp["hasWallpaper"], f"Search 'Wallpaper' did not surface Wallpaper setting on {surface}")
            self.assertFalse(filtered_wp["hasNowPlaying"], f"Search 'Wallpaper' left unrelated Now Playing card visible on {surface}")

            self.fx.click('[data-t1-settings-search="1"]')
            self.fx.press_shortcut("a", ctrl=True)
            self.fx.press_shortcut("backspace")
            restored = self.fx.eval_async_js(
                """
                const inp = document.querySelector('[data-t1-settings-search="1"]');
                if (inp && inp.value) {
                  inp.value = '';
                  inp.dispatchEvent(new Event('input', { bubbles: true }));
                }
                await new Promise((r) => setTimeout(r, 80));
                const root = document.querySelector(arguments[0]);
                const CARD_SEL = '.fh-setting-card, .fh-setting-row, .fh-card, .fh-settings-card, [data-setting-item], [data-setting-key], .opt-card, .opt-shortcut-item, .pm-control-card';
                const visibleCards = Array.from(root.querySelectorAll(CARD_SEL)).filter((c) => {
                  if (c.parentElement && c.parentElement.closest(CARD_SEL)) return false;
                  const cs = window.getComputedStyle(c);
                  const r = c.getBoundingClientRect();
                  return cs.display !== 'none' && cs.visibility !== 'hidden' && !c.classList.contains('hidden') && r.height > 0 && r.width > 0;
                });
                return visibleCards.length;
                """,
                root_sel,
            )
            self.assertGreaterEqual(restored, search_probe["initialVisibleCount"], f"Clearing search did not restore cards on {surface}")

    def test_f6_advanced_diagnostics_collapsed_by_default_and_expandable(self) -> None:
        self.assertTrue((REPO_ROOT / "src" / "shared" / "settings-ui.js").is_file(), "Missing src/shared/settings-ui.js")

        for surface in ("sidebar", "options"):
            if surface == "sidebar":
                self._open_popup_ready("/src/popup/popup.html?sidebar=1", 320, 640)
                root_sel = self._open_sidebar_settings_drawer()
            else:
                self._open_options_ready(1200, 800)
                root_sel = self._resolve_options_settings_root()

            diag = self.fx.eval_async_js(
                """
                const root = document.querySelector(arguments[0]);
                const surface = arguments[1];
                const isElVisible = (el) => {
                  if (!el) return false;
                  const cs = window.getComputedStyle(el);
                  if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
                  const r = el.getBoundingClientRect();
                  return r.width > 0 && r.height > 0;
                };
                const findToggle = () => {
                  const triggers = Array.from(root.querySelectorAll('details > summary, button[aria-expanded], [data-diagnostics-toggle]'));
                  return triggers.find((el) => /diagnostics|widevine|mse/i.test(el.textContent || '')) || null;
                };

                let toggle = findToggle();
                if (!isElVisible(toggle)) {
                  const catBtns = Array.from(root.querySelectorAll(
                    '[data-settings-cat], [data-category], [data-cat], .fh-cat-btn, .fh-nav-btn, nav button, [role="tablist"] [role="tab"]'
                  )).filter(isElVisible);
                  for (const btn of catBtns) {
                    btn.click();
                    await new Promise((r) => setTimeout(r, 40));
                    const cand = findToggle();
                    if (isElVisible(cand)) { toggle = cand; break; }
                  }
                }
                if (!isElVisible(toggle)) {
                  const searchInp = Array.from(root.querySelectorAll('input[type="search"], input[type="text"]')).find((inp) => {
                    if (inp.id === 'pm-search-input' || !isElVisible(inp)) return false;
                    const ph = (inp.getAttribute('placeholder') || '').toLowerCase();
                    const al = (inp.getAttribute('aria-label') || '').toLowerCase();
                    return inp.type === 'search' || ph.includes('search') || ph.includes('filter') || al.includes('search');
                  });
                  if (searchInp) {
                    searchInp.value = 'Diagnostics';
                    searchInp.dispatchEvent(new Event('input', { bubbles: true }));
                    await new Promise((r) => setTimeout(r, 80));
                    const cand = findToggle();
                    if (isElVisible(cand)) toggle = cand;
                  }
                }
                if (!toggle) {
                  return { ok: false, reason: `Missing Advanced Diagnostics collapsible control on ${surface}` };
                }
                toggle.scrollIntoView({ block: 'center' });
                await new Promise((r) => setTimeout(r, 20));
                if (!isElVisible(toggle)) {
                  return { ok: false, reason: `Advanced Diagnostics toggle not visible on ${surface}` };
                }
                toggle.setAttribute('data-t1-diag-toggle', '1');
                const details = toggle.closest('details');
                const panel = details
                  ? details.querySelector('.fh-diagnostics-body, #pm-live-audio-log-panel, pre, [data-diagnostics-panel], div')
                  : document.getElementById(toggle.getAttribute('aria-controls') || '') || toggle.nextElementSibling;
                const panelRect = panel ? panel.getBoundingClientRect() : { height: 0 };
                const panelCs = panel ? window.getComputedStyle(panel) : null;
                const toggleRect = toggle.getBoundingClientRect();
                const dcs = details ? window.getComputedStyle(details) : null;
                const padBorder = dcs
                  ? (parseFloat(dcs.paddingTop) || 0)
                    + (parseFloat(dcs.paddingBottom) || 0)
                    + (parseFloat(dcs.borderTopWidth) || 0)
                    + (parseFloat(dcs.borderBottomWidth) || 0)
                  : 0;
                const panelCollapsed = details
                  ? (!details.open && details.getBoundingClientRect().height <= toggleRect.height + padBorder + 12)
                  : (!panel || !panelCs || panelCs.display === 'none' || panelCs.visibility === 'hidden' || panel.classList.contains('hidden') || panelRect.height === 0);
                const isOpen = details ? Boolean(details.open) : toggle.getAttribute('aria-expanded') === 'true';
                return { ok: true, isOpen, initialHeight: panelRect.height, panelCollapsed };
                """,
                root_sel,
                surface,
            )
            self.assertTrue(diag["ok"], msg=diag.get("reason", ""))
            self.assertFalse(diag["isOpen"], f"Advanced Diagnostics should be collapsed by default on {surface}")
            self.assertTrue(diag["panelCollapsed"], f"Advanced Diagnostics panel should be hidden/zero-height by default on {surface}")

            self.fx.click('[data-t1-diag-toggle="1"]')
            expanded = self.fx.eval_js(
                """
                const toggle = document.querySelector('[data-t1-diag-toggle="1"]');
                const details = toggle.closest('details');
                const panel = details
                  ? details.querySelector('.fh-diagnostics-body, #pm-live-audio-log-panel, pre, [data-diagnostics-panel], div')
                  : document.getElementById(toggle.getAttribute('aria-controls') || '') || toggle.nextElementSibling;
                const isOpen = details ? Boolean(details.open) : toggle.getAttribute('aria-expanded') === 'true';
                return {
                  isOpen,
                  panelHeight: panel ? panel.getBoundingClientRect().height : 0
                };
                """
            )
            self.assertTrue(expanded["isOpen"], f"Advanced Diagnostics did not expand on {surface}")
            self.assertGreater(expanded["panelHeight"], 0, f"Expanded diagnostics panel has zero height on {surface}")

    def test_f6_dedicated_controls_for_new_features_and_persistence_dispatch(self) -> None:
        self.assertTrue((REPO_ROOT / "src" / "shared" / "settings-ui.js").is_file(), "Missing src/shared/settings-ui.js")

        expected_keywords = [
            ("Now Playing", r"now playing"),
            ("Context Menu", r"context menu|open.*in foxhub|right-?click"),
            ("Quick Switcher", r"quick switcher|ctrl\+k"),
            ("Left-Rail Playing Indicator", r"playing indicator|equalizer|rail quick"),
            ("userChrome.css Generator", r"userchrome"),
            ("Backup & Restore", r"backup|export.*settings|restore"),
        ]
        for surface in ("options", "sidebar"):
            if surface == "sidebar":
                self._open_popup_ready("/src/popup/popup.html?sidebar=1", 320, 640)
                root_sel = self._open_sidebar_settings_drawer()
            else:
                self._open_options_ready(1200, 800)
                root_sel = self._resolve_options_settings_root()

            text = self.fx.eval_async_js(
                """
                const root = document.querySelector(arguments[0]);
                if (!root) return '';
                const chunks = [(root.textContent || '').toLowerCase()];
                const catBtns = Array.from(root.querySelectorAll(
                  '[data-settings-cat], [data-category], [data-cat], .fh-cat-btn, .fh-nav-btn, nav button, [role="tablist"] [role="tab"]'
                )).filter((el) => {
                  const cs = window.getComputedStyle(el);
                  const r = el.getBoundingClientRect();
                  return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
                });
                const initialActive = catBtns.find((b) => b.classList.contains('active') || b.getAttribute('aria-selected') === 'true' || b.getAttribute('data-active') === 'true');
                for (const btn of catBtns) {
                  btn.click();
                  await new Promise((r) => setTimeout(r, 35));
                  chunks.push((root.textContent || '').toLowerCase());
                }
                if (initialActive) {
                  initialActive.click();
                  await new Promise((r) => setTimeout(r, 30));
                }
                return chunks.join('\\n');
                """,
                root_sel,
            )
            for label, pattern in expected_keywords:
                self.assertRegex(text, re.compile(pattern, re.I), f"Missing '{label}' settings section/control on {surface}")

        # Verify changing a new feature toggle dispatches UPDATE_SETTINGS with canonical key
        toggle_probe = self.fx.eval_async_js(
            """
            const root = document.querySelector(arguments[0]);
            if (!root) return { ok: false, reason: 'Settings drawer root missing' };

            const isElVisible = (el) => {
              if (!el) return false;
              const cs = window.getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            };

            const resolveClickable = (ctrl) => {
              if (!ctrl) return null;
              if (ctrl.tagName === 'INPUT') {
                const switchLbl = ctrl.closest('label.fh-switch, label.pm-switch, label.opt-switch');
                if (isElVisible(switchLbl)) return switchLbl;
                const sw = ctrl.closest('.fh-switch, .pm-switch, .opt-switch, [role="switch"]');
                const lbl = ctrl.closest('label') || (ctrl.id ? document.querySelector(`label[for="${CSS.escape(ctrl.id)}"]`) : null);
                if (ctrl.type === 'checkbox') {
                  if (isElVisible(sw) && sw.tagName === 'LABEL') return sw;
                  if (isElVisible(lbl)) return lbl;
                  if (isElVisible(sw)) return sw;
                }
                if (isElVisible(ctrl)) return ctrl;
                if (isElVisible(lbl)) return lbl;
                if (isElVisible(sw)) return sw;
                return null;
              }
              return isElVisible(ctrl) ? ctrl : null;
            };

            const getCtrlText = (c) => {
              const cardOrRow = c.closest('.fh-setting-row, .fh-setting-card, .fh-card, .fh-settings-card, .opt-card, .opt-shortcut-item, .pm-control-card, [data-setting-item], [data-setting-key]');
              const lbl = c.closest('label') || (c.id ? root.querySelector(`label[for="${CSS.escape(c.id)}"]`) : null);
              const fallbackDiv = (!cardOrRow && !lbl) ? c.closest('div') : null;
              return [
                cardOrRow ? cardOrRow.textContent : '',
                lbl ? lbl.textContent : '',
                fallbackDiv ? fallbackDiv.textContent : '',
                c.getAttribute('aria-label') || ''
              ].join(' ');
            };

            const findToggle = () => {
              const byAttr = root.querySelector(
                '[data-setting-key="contextMenuEnabled"] input[type="checkbox"], input[data-setting-key="contextMenuEnabled"], button[role="switch"][data-setting-key="contextMenuEnabled"], [data-setting-key="miniNowPlayingEnabled"] input[type="checkbox"], input[data-setting-key="miniNowPlayingEnabled"], button[role="switch"][data-setting-key="miniNowPlayingEnabled"]'
              );
              if (byAttr) {
                const attrKey = byAttr.getAttribute('data-setting-key') || byAttr.closest('[data-setting-key]')?.getAttribute('data-setting-key');
                return { ctrl: byAttr, key: attrKey };
              }
              const candidates = Array.from(root.querySelectorAll('input[type="checkbox"], button[role="switch"]'));
              for (const c of candidates) {
                const txt = getCtrlText(c);
                if (/context menu|open.*in foxhub/i.test(txt)) {
                  const key = c.getAttribute('data-setting-key') || c.closest('[data-setting-key]')?.getAttribute('data-setting-key') || 'contextMenuEnabled';
                  return { ctrl: c, key };
                }
                if (/mini.*now playing|now playing bar/i.test(txt)) {
                  const key = c.getAttribute('data-setting-key') || c.closest('[data-setting-key]')?.getAttribute('data-setting-key') || 'miniNowPlayingEnabled';
                  return { ctrl: c, key };
                }
              }
              return null;
            };

            let found = findToggle();
            let clickTarget = found ? resolveClickable(found.ctrl) : null;

            if (!clickTarget) {
              const catBtns = Array.from(root.querySelectorAll(
                '[data-settings-cat], [data-category], [data-cat], .fh-cat-btn, .fh-nav-btn, nav button, [role="tablist"] [role="tab"]'
              )).filter(isElVisible);
              for (const btn of catBtns) {
                btn.click();
                await new Promise((r) => setTimeout(r, 40));
                found = findToggle();
                clickTarget = found ? resolveClickable(found.ctrl) : null;
                if (clickTarget) break;
              }
            }

            if (!clickTarget) {
              const searchInp = Array.from(root.querySelectorAll('input[type="search"], input[type="text"]')).find((inp) => {
                if (inp.id === 'pm-search-input' || !isElVisible(inp)) return false;
                const ph = (inp.getAttribute('placeholder') || '').toLowerCase();
                const al = (inp.getAttribute('aria-label') || '').toLowerCase();
                return inp.type === 'search' || ph.includes('search') || ph.includes('filter') || al.includes('search');
              });
              if (searchInp) {
                for (const q of ['Context Menu', 'Now Playing']) {
                  searchInp.value = q;
                  searchInp.dispatchEvent(new Event('input', { bubbles: true }));
                  await new Promise((r) => setTimeout(r, 80));
                  found = findToggle();
                  clickTarget = found ? resolveClickable(found.ctrl) : null;
                  if (clickTarget) break;
                }
              }
            }

            if (!found || !found.ctrl) return { ok: false, reason: 'Missing toggle for new feature (contextMenuEnabled / miniNowPlayingEnabled)' };
            if (!clickTarget) return { ok: false, reason: `Found toggle (${found.key}) but clickable target is hidden or zero-size` };

            clickTarget.scrollIntoView({ block: 'center' });
            await new Promise((r) => setTimeout(r, 20));
            if (!isElVisible(clickTarget)) {
              return { ok: false, reason: `Toggle (${found.key}) clickable target not visible after scroll` };
            }
            clickTarget.setAttribute('data-t1-new-feat-toggle', '1');
            return { ok: true, key: found.key };
            """,
            root_sel,
        )
        self.assertTrue(toggle_probe["ok"], msg=toggle_probe.get("reason", ""))
        self.fx.eval_js("window.__webextMock.clearCalls();")
        self.fx.click('[data-t1-new-feat-toggle="1"]')
        sent = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 2000;
            while (Date.now() < deadline) {
              const calls = window.__webextMock.getCalls('runtime.sendMessage');
              const upd = calls.find((c) => c.args && c.args[0] && c.args[0].type === 'UPDATE_SETTINGS');
              if (upd) return { ok: true, settings: upd.args[0].settings || {} };
              await new Promise((r) => setTimeout(r, 30));
            }
            return { ok: false, reason: 'No UPDATE_SETTINGS sent after toggling new feature control' };
            """
        )
        self.assertTrue(sent["ok"], msg=sent.get("reason", ""))
        self.assertIn(toggle_probe["key"], sent["settings"])

    def test_f6_dedicated_controls_for_existing_features_present(self) -> None:
        self.assertTrue((REPO_ROOT / "src" / "shared" / "settings-ui.js").is_file(), "Missing src/shared/settings-ui.js")

        existing_keywords = [
            ("Background Audio / Tab Auto-Pause", r"background audio|tab.*audio|pause.*resume"),
            ("Persistent App Memory", r"persistent|session.*memory|eco"),
            ("Keyboard Shortcuts", r"shortcut|hotkey"),
            ("Themes & Wallpaper", r"theme|wallpaper"),
            ("Custom Video Loadbar", r"loadbar"),
            ("Custom Websites", r"custom.*website|custom.*app|add.*website"),
        ]
        for surface in ("sidebar", "options"):
            if surface == "sidebar":
                self._open_popup_ready("/src/popup/popup.html?sidebar=1", 320, 640)
                root_sel = self._open_sidebar_settings_drawer()
            else:
                self._open_options_ready(1200, 800)
                root_sel = self._resolve_options_settings_root()

            text = self.fx.eval_async_js(
                """
                const root = document.querySelector(arguments[0]);
                if (!root) return '';
                const chunks = [(root.textContent || '').toLowerCase()];
                const catBtns = Array.from(root.querySelectorAll(
                  '[data-settings-cat], [data-category], [data-cat], .fh-cat-btn, .fh-nav-btn, nav button, [role="tablist"] [role="tab"]'
                )).filter((el) => {
                  const cs = window.getComputedStyle(el);
                  const r = el.getBoundingClientRect();
                  return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
                });
                const initialActive = catBtns.find((b) => b.classList.contains('active') || b.getAttribute('aria-selected') === 'true' || b.getAttribute('data-active') === 'true');
                for (const btn of catBtns) {
                  btn.click();
                  await new Promise((r) => setTimeout(r, 35));
                  chunks.push((root.textContent || '').toLowerCase());
                }
                if (initialActive) {
                  initialActive.click();
                  await new Promise((r) => setTimeout(r, 30));
                }
                return chunks.join('\\n');
                """,
                root_sel,
            )
            for label, pattern in existing_keywords:
                self.assertRegex(text, re.compile(pattern, re.I), f"Missing '{label}' controls on {surface}")

    def test_f6_settings_ui_modern_cards_and_no_overflow_at_narrow_and_wide(self) -> None:
        self.assertTrue((REPO_ROOT / "src" / "shared" / "settings-ui.js").is_file(), "Missing src/shared/settings-ui.js")
        self.assertTrue((REPO_ROOT / "src" / "shared" / "settings-ui.css").is_file(), "Missing src/shared/settings-ui.css")

        self._open_popup_ready("/src/popup/popup.html?sidebar=1", 320, 640)
        sb_root = self._open_sidebar_settings_drawer()
        self._assert_no_settings_overflow_or_overlap(sb_root, "sidebar_320x640")

        self._open_options_ready(1200, 800)
        opt_root = self._resolve_options_settings_root()
        self._assert_no_settings_overflow_or_overlap(opt_root, "options_1200x800")

    # ------------------------------------------------------------------
    # F7: Decluttered Header & Narrow-Mode ⋯ Menu (6 tests)
    # ------------------------------------------------------------------
    def test_f7_header_actions_omits_four_duplicated_rail_buttons(self) -> None:
        for path, w, h in [("/src/popup/popup.html", 560, 600), ("/src/popup/popup.html?sidebar=1", 320, 640)]:
            self._open_popup_ready(path, w, h)
            res = self.fx.eval_js(
                """
                const actions = document.querySelector('.pm-header-actions');
                if (!actions) return { ok: false, reason: 'Missing .pm-header-actions' };
                const forbiddenIds = ['btn-open-sidebar', 'btn-night-mode', 'btn-dnd', 'btn-settings'];
                const foundIds = forbiddenIds.filter((id) => Boolean(actions.querySelector('#' + id)));
                const dupLabels = [];
                for (const btn of actions.querySelectorAll('button')) {
                  const meta = [btn.id, btn.title, btn.getAttribute('aria-label'), btn.textContent].join(' ').toLowerCase();
                  if (/open.*sidebar|night mode|mute.*notif|\\bdnd\\b|open.*settings|\\bsettings\\b/.test(meta)) {
                    dupLabels.push({ id: btn.id, title: btn.title });
                  }
                }
                return { ok: true, foundIds, dupLabels };
                """
            )
            self.assertTrue(res["ok"], msg=res.get("reason", ""))
            self.assertEqual(res["foundIds"], [], f"Duplicated rail button IDs still in .pm-header-actions ({path}): {res['foundIds']}")
            self.assertEqual(res["dupLabels"], [], f"Duplicated rail buttons still in .pm-header-actions ({path}): {res['dupLabels']}")

    def test_f7_left_rail_retains_canonical_rail_buttons(self) -> None:
        for path, w, h in [("/src/popup/popup.html?sidebar=1", 320, 640), ("/src/popup/popup.html", 560, 600)]:
            self._open_popup_ready(path, w, h)
            res = self.fx.eval_js(
                """
                const rail = document.getElementById('pm-opera-rail');
                if (!rail) return { ok: false, reason: 'Missing #pm-opera-rail' };
                const ids = [
                  'rail-btn-mail',
                  'rail-btn-mute-notifs',
                  'rail-btn-night-mode',
                  'rail-btn-manage-apps',
                  'rail-btn-sidebar-settings'
                ];
                const missing = [];
                const invisible = [];
                for (const id of ids) {
                  const el = document.getElementById(id);
                  if (!el) { missing.push(id); continue; }
                  const r = el.getBoundingClientRect();
                  if (r.width <= 0 || r.height <= 0) invisible.push(id);
                }
                return { ok: true, missing, invisible };
                """
            )
            self.assertTrue(res["ok"], msg=res.get("reason", ""))
            self.assertEqual(res["missing"], [], f"Missing rail buttons ({path}): {res['missing']}")
            self.assertEqual(res["invisible"], [], f"Zero-size rail buttons ({path}): {res['invisible']}")

    def test_f7_narrow_sidebar_groups_secondary_controls_into_overflow_menu(self) -> None:
        self._open_popup_ready("/src/popup/popup.html?sidebar=1", 320, 640)
        probe = self.fx.eval_js(
            """
            const actions = document.querySelector('.pm-header-actions');
            if (!actions) return { ok: false, reason: 'Missing .pm-header-actions' };
            const visibleDirectBtns = Array.from(actions.children).filter((el) => {
              if (el.tagName !== 'BUTTON') return false;
              const cs = window.getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
            });
            const allActionBtns = Array.from(actions.querySelectorAll('button')).filter((el) => {
              const cs = window.getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[role="menu"], .pm-header-overflow-menu, .pm-overflow-menu, #pm-header-more-menu');
            });
            const overflowBtn = allActionBtns.find((b) => {
              if (b.id === 'btn-dnd') return false;
              const txt = (b.textContent || '').trim();
              const meta = [b.id, b.title, b.getAttribute('aria-label'), b.className].join(' ').toLowerCase();
              const hp = (b.getAttribute('aria-haspopup') || '').toLowerCase();
              return txt === '⋯' || txt === '...' || txt === '•••' || hp === 'menu' || hp === 'true' || /more|overflow/.test(meta);
            });
            if (!overflowBtn) {
              return { ok: false, reason: 'Missing visible ⋯ overflow menu trigger in .pm-header-actions at 320x640' };
            }
            overflowBtn.setAttribute('data-t1-overflow-btn', '1');
            return {
              ok: true,
              directVisibleCount: Math.max(visibleDirectBtns.length, allActionBtns.length)
            };
            """
        )
        self.assertTrue(probe["ok"], msg=probe.get("reason", ""))
        self.assertLessEqual(probe["directVisibleCount"], 2, f"Expected <= 2 directly visible header buttons in narrow mode, got {probe['directVisibleCount']}")

        self.fx.click('[data-t1-overflow-btn="1"]')
        menu_probe = self.fx.eval_js(
            """
            const menus = Array.from(document.querySelectorAll('[role="menu"], .pm-header-overflow-menu, .pm-overflow-menu, #pm-header-more-menu')).filter((m) => {
              const cs = window.getComputedStyle(m);
              const r = m.getBoundingClientRect();
              return !m.classList.contains('hidden') && cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 0;
            });
            if (menus.length === 0) return { ok: false, reason: 'Overflow menu did not become visible after clicking ⋯' };
            const items = Array.from(menus[0].querySelectorAll('button, [role="menuitem"]')).map((i) => (i.textContent || i.title || '').trim().toLowerCase());
            return { ok: true, items };
            """
        )
        self.assertTrue(menu_probe["ok"], msg=menu_probe.get("reason", ""))
        self.assertGreaterEqual(len(menu_probe["items"]), 2)

    def test_f7_overflow_menu_opens_closes_cleanly_and_executes_action(self) -> None:
        self._open_popup_ready("/src/popup/popup.html?sidebar=1", 320, 640)
        btn_probe = self.fx.eval_js(
            """
            const actions = document.querySelector('.pm-header-actions');
            const btns = actions ? Array.from(actions.querySelectorAll('button')) : [];
            const overflowBtn = btns.find((b) => {
              if (b.id === 'btn-dnd') return false;
              const cs = window.getComputedStyle(b);
              const r = b.getBoundingClientRect();
              if (cs.display === 'none' || cs.visibility === 'hidden' || r.width <= 0 || r.height <= 0) return false;
              const txt = (b.textContent || '').trim();
              const meta = [b.id, b.title, b.getAttribute('aria-label'), b.className].join(' ').toLowerCase();
              const hp = (b.getAttribute('aria-haspopup') || '').toLowerCase();
              return txt === '⋯' || txt === '...' || txt === '•••' || hp === 'menu' || hp === 'true' || /more|overflow/.test(meta);
            });
            if (!overflowBtn) return { ok: false, reason: 'Missing ⋯ overflow trigger button' };
            overflowBtn.setAttribute('data-t1-overflow-btn', '1');
            return { ok: true };
            """
        )
        self.assertTrue(btn_probe["ok"], msg=btn_probe.get("reason", ""))

        self.fx.click('[data-t1-overflow-btn="1"]')
        open_check = self.fx.eval_js(
            """
            const menu = Array.from(document.querySelectorAll('[role="menu"], .pm-header-overflow-menu, .pm-overflow-menu, #pm-header-more-menu')).find((m) => {
              const cs = window.getComputedStyle(m);
              return !m.classList.contains('hidden') && cs.display !== 'none' && m.getBoundingClientRect().height > 0;
            });
            if (!menu) return { ok: false, reason: 'Overflow menu did not open' };
            menu.setAttribute('data-t1-overflow-menu', '1');
            return { ok: true };
            """
        )
        self.assertTrue(open_check["ok"], msg=open_check.get("reason", ""))

        self.fx.press_shortcut("escape")
        closed_check = self.fx.eval_async_js(
            """
            await new Promise((r) => setTimeout(r, 60));
            const menu = document.querySelector('[data-t1-overflow-menu="1"]');
            if (!menu) return true;
            const cs = window.getComputedStyle(menu);
            return menu.classList.contains('hidden') || cs.display === 'none' || menu.getBoundingClientRect().height === 0;
            """
        )
        self.assertTrue(closed_check, "Overflow menu did not close on Escape")

        # Reopen and trigger Themes/Backgrounds action
        btn_revisible = self.fx.eval_js(
            """
            const btn = document.querySelector('[data-t1-overflow-btn="1"]');
            if (!btn) return false;
            const cs = window.getComputedStyle(btn);
            const r = btn.getBoundingClientRect();
            return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
            """
        )
        self.assertTrue(btn_revisible, "Overflow trigger button became invisible before reopening")
        self.fx.click('[data-t1-overflow-btn="1"]')
        theme_item = self.fx.eval_js(
            """
            const menu = document.querySelector('[data-t1-overflow-menu="1"]');
            const item = menu ? Array.from(menu.querySelectorAll('button, [role="menuitem"]')).find((el) => /theme|background/i.test((el.textContent || el.title || ''))) : null;
            if (!item) return { ok: false, reason: 'No Themes/Backgrounds action found inside overflow menu' };
            item.scrollIntoView({ block: 'nearest' });
            const cs = window.getComputedStyle(item);
            const r = item.getBoundingClientRect();
            if (cs.display === 'none' || cs.visibility === 'hidden' || r.width <= 0 || r.height <= 0) {
              return { ok: false, reason: 'Themes/Backgrounds overflow menu item is hidden or has zero size' };
            }
            item.setAttribute('data-t1-overflow-theme', '1');
            return { ok: true };
            """
        )
        self.assertTrue(theme_item["ok"], msg=theme_item.get("reason", ""))
        self.fx.click('[data-t1-overflow-theme="1"]')

        after_action = self.fx.eval_js(
            """
            const drawer = document.getElementById('pm-theme-drawer');
            const menu = document.querySelector('[data-t1-overflow-menu="1"]');
            const menuClosed = !menu || menu.classList.contains('hidden') || window.getComputedStyle(menu).display === 'none' || menu.getBoundingClientRect().height === 0;
            return {
              themeDrawerOpen: Boolean(drawer && !drawer.classList.contains('hidden') && drawer.getBoundingClientRect().width > 0),
              menuClosed
            };
            """
        )
        self.assertTrue(after_action["themeDrawerOpen"], "Clicking Themes in overflow menu did not open #pm-theme-drawer")
        self.assertTrue(after_action["menuClosed"], "Overflow menu did not close after executing action")

    def test_f7_zero_clipped_or_overlapping_controls_at_320x640(self) -> None:
        self._open_popup_ready("/src/popup/popup.html?sidebar=1", 320, 640)
        res = self.fx.eval_js(
            """
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const scrollWidth = document.documentElement.scrollWidth;
            const brand = document.querySelector('.pm-brand');
            const actions = document.querySelector('.pm-header-actions');
            const rail = document.getElementById('pm-opera-rail');
            if (!brand || !actions || !rail) return { ok: false, reason: 'Missing header/rail elements' };

            const headerControls = Array.from(document.querySelectorAll('.pm-header button, #pm-opera-rail button')).filter((el) => {
              const cs = window.getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
            });
            const clipped = [];
            for (const el of headerControls) {
              const r = el.getBoundingClientRect();
              if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) {
                clipped.push({ id: el.id || el.className, left: r.left, right: r.right, top: r.top, bottom: r.bottom });
              }
            }
            const br = brand.getBoundingClientRect();
            const ar = actions.getBoundingClientRect();
            const brandActionOverlap = Math.max(0, Math.min(br.right, ar.right) - Math.max(br.left, ar.left)) > 2
              && Math.max(0, Math.min(br.bottom, ar.bottom) - Math.max(br.top, ar.top)) > 2;

            const actBtns = Array.from(actions.querySelectorAll('button')).filter((el) => {
              const cs = window.getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
            });
            const btnOverlaps = [];
            for (let i = 0; i < actBtns.length; i++) {
              for (let j = i + 1; j < actBtns.length; j++) {
                const a = actBtns[i].getBoundingClientRect();
                const b = actBtns[j].getBoundingClientRect();
                const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
                const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
                if (ix > 1 && iy > 1) btnOverlaps.push([actBtns[i].id, actBtns[j].id]);
              }
            }
            const overflowBtn = actBtns.find((b) => {
              if (b.id === 'btn-dnd') return false;
              const txt = (b.textContent || '').trim();
              const meta = [b.id, b.title, b.getAttribute('aria-label'), b.className].join(' ').toLowerCase();
              const hp = (b.getAttribute('aria-haspopup') || '').toLowerCase();
              return txt === '⋯' || txt === '...' || txt === '•••' || hp === 'menu' || hp === 'true' || /more|overflow/.test(meta);
            });
            if (overflowBtn) overflowBtn.setAttribute('data-t1-overflow-btn', '1');
            return {
              ok: true,
              scrollWidth,
              vw,
              clipped,
              brandActionOverlap,
              btnOverlaps,
              hasOverflowBtn: Boolean(overflowBtn)
            };
            """
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertLessEqual(res["scrollWidth"], 321)
        self.assertEqual(res["clipped"], [], msg=f"Clipped controls at 320x640: {res['clipped']}")
        self.assertFalse(res["brandActionOverlap"], "Brand and header-actions overlap at 320x640")
        self.assertEqual(res["btnOverlaps"], [], msg=f"Overlapping action buttons at 320x640: {res['btnOverlaps']}")
        self.assertTrue(res["hasOverflowBtn"], "Expected ⋯ overflow menu button at 320x640")

        self.fx.click('[data-t1-overflow-btn="1"]')
        menu_bounds = self.fx.eval_js(
            """
            const menu = Array.from(document.querySelectorAll('[role="menu"], .pm-header-overflow-menu, .pm-overflow-menu, #pm-header-more-menu')).find((m) => {
              const cs = window.getComputedStyle(m);
              return !m.classList.contains('hidden') && cs.display !== 'none' && m.getBoundingClientRect().height > 0;
            });
            if (!menu) return { ok: false, reason: 'Overflow menu did not open' };
            const r = menu.getBoundingClientRect();
            return { ok: r.left >= -1 && r.right <= 321 && r.top >= -1 && r.bottom <= 641, rect: r.toJSON() };
            """
        )
        self.assertTrue(menu_bounds["ok"], msg=f"Overflow menu out of 320x640 viewport bounds: {menu_bounds}")

    def test_f7_zero_clipped_or_overlapping_controls_at_1200x800(self) -> None:
        for path in ("/src/popup/popup.html?popout=1", "/src/popup/popup.html?sidebar=1"):
            self._open_popup_ready(path, 1200, 800)
            res = self.fx.eval_js(
                """
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const scrollWidth = document.documentElement.scrollWidth;
                const actions = document.querySelector('.pm-header-actions');
                if (!actions) return { ok: false, reason: 'Missing .pm-header-actions' };
                const forbiddenIds = ['btn-open-sidebar', 'btn-night-mode', 'btn-dnd', 'btn-settings'];
                const foundDupIds = forbiddenIds.filter((id) => Boolean(actions.querySelector('#' + id)));

                const controls = Array.from(document.querySelectorAll('.pm-header button, #pm-opera-rail button')).filter((el) => {
                  const cs = window.getComputedStyle(el);
                  const r = el.getBoundingClientRect();
                  return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
                });
                const clipped = [];
                for (const el of controls) {
                  const r = el.getBoundingClientRect();
                  if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) {
                    clipped.push({ id: el.id || el.className, rect: r.toJSON() });
                  }
                }
                const actBtns = Array.from(actions.querySelectorAll('button')).filter((el) => {
                  const cs = window.getComputedStyle(el);
                  const r = el.getBoundingClientRect();
                  return cs.display !== 'none' && r.width > 0 && r.height > 0;
                });
                const overlaps = [];
                for (let i = 0; i < actBtns.length; i++) {
                  for (let j = i + 1; j < actBtns.length; j++) {
                    const a = actBtns[i].getBoundingClientRect();
                    const b = actBtns[j].getBoundingClientRect();
                    const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
                    const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
                    if (ix > 1 && iy > 1) overlaps.push([actBtns[i].id, actBtns[j].id]);
                  }
                }
                return { ok: true, scrollWidth, foundDupIds, clipped, overlaps, controlCount: controls.length };
                """
            )
            self.assertTrue(res["ok"], msg=res.get("reason", ""))
            self.assertLessEqual(res["scrollWidth"], 1201)
            self.assertEqual(res["foundDupIds"], [], f"Duplicated rail buttons present at 1200x800 ({path}): {res['foundDupIds']}")
            self.assertGreater(res["controlCount"], 0)
            self.assertEqual(res["clipped"], [], f"Clipped controls at 1200x800 ({path}): {res['clipped']}")
            self.assertEqual(res["overlaps"], [], f"Overlapping controls at 1200x800 ({path}): {res['overlaps']}")


if __name__ == "__main__":
    unittest.main()
