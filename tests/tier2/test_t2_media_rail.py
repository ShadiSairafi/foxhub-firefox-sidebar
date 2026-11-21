"""Tier 2 boundary, corner, and negative tests for Left-Rail Indicator, Mini Now Playing Bar, and v2.7.9 Stability (F8, F10, F17)."""

from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tests.lib import mock_helpers
from tests.lib.firefox_harness import HeadlessFirefox
from tests.lib.http_fixtures import FixtureServer

ERROR_TRAP_SNIPPET = (
    "if (!window.__t2Errors) {"
    "  window.__t2Errors = [];"
    "  window.addEventListener('error', (ev) => {"
    "    window.__t2Errors.push('error: ' + (ev && ev.message ? ev.message : String(ev)));"
    "  });"
    "  window.addEventListener('unhandledrejection', (ev) => {"
    "    const r = ev && ev.reason;"
    "    window.__t2Errors.push('rejection: ' + (r && r.message ? r.message : String(r)));"
    "  });"
    "}"
)

FETCH_GUARD_JS = (
    "const __origFetch = window.fetch ? window.fetch.bind(window) : null;\n"
    "window.fetch = function(input, init) {\n"
    "  const u = typeof input === 'string' ? input : (input && input.url ? input.url : '');\n"
    "  if (/^https?:\\/\\/(mail\\.google\\.com|gmail\\.googleapis\\.com|www\\.googleapis\\.com|accounts\\.google\\.com)\\b/i.test(u)) {\n"
    "    return Promise.resolve(new Response('', { status: 403, statusText: 'Mock Offline' }));\n"
    "  }\n"
    "  return __origFetch ? __origFetch(input, init) : Promise.reject(new Error('No fetch'));\n"
    "};\n"
)


def _default_settings(**overrides: Any) -> dict[str, Any]:
    s: dict[str, Any] = {
        "theme": "warm-linen",
        "enabledMediaApps": ["instagram", "spotify", "youtube", "soundcloud"],
        "customMediaApps": [],
        "persistenceMode": "selected",
        "persistentAppIds": ["spotify", "youtube"],
        "bgAudioAppIds": ["spotify", "youtube", "soundcloud"],
        "keepAudioPlayingWhenClosed": True,
        "tabAudioBehavior": "pause-resume",
        "autoPauseOnTabAudio": True,
        "miniNowPlayingEnabled": True,
        "miniNowPlayingPosition": "bottom",
        "miniNowPlayingCompact": False,
        "miniNowPlayingShowProgress": True,
        "miniNowPlayingAutoHidePaused": True,
        "railPlayingIndicatorEnabled": True,
        "railQuickControlsEnabled": True,
        "contextMenuEnabled": True,
        "quickSwitcherEnabled": True,
        "quickSwitcherShortcut": "Ctrl+K",
    }
    s.update(overrides)
    return s


def _default_get_state_payload(settings: dict[str, Any] | None = None, **extras: Any) -> dict[str, Any]:
    s = settings if settings is not None else _default_settings()
    payload: dict[str, Any] = {
        "state": {
            "accounts": [
                {
                    "email": "tester@example.com",
                    "name": "FoxHub Tester",
                    "unreadCount": 1,
                    "messages": [
                        {
                            "id": "msg-1",
                            "subject": "Welcome to FoxHub",
                            "senderName": "FoxHub Team",
                            "senderEmail": "hello@example.com",
                            "snippet": "Your local inbox is ready.",
                            "timestamp": 1700000000000,
                            "unread": True,
                            "starred": False,
                        }
                    ],
                }
            ],
            "totalUnread": 1,
            "sentMessages": [],
            "lastSyncAt": 1700000000000,
            "usingDemo": False,
            "syncError": None,
        },
        "settings": s,
        "snoozed": {},
        "audibleAppId": None,
        "nowPlaying": None,
        "sidebarOpenCount": 1,
        "isAutoPausedByTabAudio": False,
        "pendingShortcutAppId": "",
        "pendingContextUrl": None,
    }
    payload.update(extras)
    return payload


def _wrap_html_for_bridge(html_text: str, base_href: str, stub_fetch: bool = True) -> str:
    fetch_js = FETCH_GUARD_JS if stub_fetch else ""
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
        f"{fetch_js}"
        "</script>\n"
    )
    if re.search(r"<head\b[^>]*>", html_text, flags=re.IGNORECASE):
        return re.sub(
            r"(<head\b[^>]*>)",
            lambda m: m.group(1) + "\n" + bridge_head,
            html_text,
            count=1,
            flags=re.IGNORECASE,
        )
    return bridge_head + html_text


class TestT2MediaRail(unittest.TestCase):
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
        self.server.clear_telemetry()
        self.fx.navigate(self.server.url_for("/mock/echo"))
        self.fx.eval_js("try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}")
        self.fx.reset_to_blank()
        self.server.clear_requests()

    # ------------------------------------------------------------------
    # Recipes & Defensive Helpers
    # ------------------------------------------------------------------

    def _install_error_trap(self) -> None:
        self.fx.eval_js(ERROR_TRAP_SNIPPET)

    def _assert_no_js_errors(self, context: str) -> None:
        errs = self.fx.eval_js("return Array.isArray(window.__t2Errors) ? window.__t2Errors : [];")
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
        self.assertEqual(errs, [], f"Uncaught bridge child frame errors in {context}: {errs}")

    def _manifest_dict(self) -> dict[str, Any]:
        manifest_path = REPO_ROOT / "manifest.json"
        self.assertTrue(manifest_path.is_file(), f"Missing manifest.json at {manifest_path}")
        return json.loads(manifest_path.read_text(encoding="utf-8"))

    def _boot_background_offline(
        self,
        settings: dict[str, Any] | None = None,
        tabs: list[dict[str, Any]] | None = None,
    ) -> None:
        bg_html = REPO_ROOT / "src" / "background" / "background.html"
        self.assertTrue(bg_html.is_file(), f"Missing {bg_html}")
        html_text = bg_html.read_text(encoding="utf-8")
        raw_srcs = re.findall(r'<script\s+src=["\']([^"\']+)["\']', html_text, re.IGNORECASE)
        self.assertGreater(len(raw_srcs), 0, "background.html must declare script tags")

        script_tags: list[str] = []
        for src in raw_srcs:
            if src.startswith("../"):
                resolved = "/src/" + src[3:]
            elif src.startswith("/"):
                resolved = src
            else:
                resolved = "/src/background/" + src
            script_tags.append(f'<script src="{resolved}"></script>')

        guard_url = self.server.register_fixture(
            "t2_mr_fetch_guard.js",
            FETCH_GUARD_JS,
            content_type="application/javascript; charset=utf-8",
        )
        trap_url = self.server.register_fixture(
            "t2_mr_err_trap.js",
            ERROR_TRAP_SNIPPET,
            content_type="application/javascript; charset=utf-8",
        )
        bg_doc = (
            "<!doctype html><html><head><meta charset='utf-8'><title>FoxHub BG Harness</title>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            f"<script src='{guard_url}'></script>"
            f"<script src='{trap_url}'></script>"
            "</head><body>"
            + "".join(script_tags)
            + "</body></html>"
        )
        bg_url = self.server.register_fixture("t2_mr_bg_harness.html", bg_doc)

        s = settings if settings is not None else _default_settings()
        seed: dict[str, Any] = {
            "manifest": self._manifest_dict(),
            "storage": {"settings": s},
        }
        if tabs is not None:
            seed["tabs"] = tabs
        self.server.set_seed(seed)
        self.fx.navigate(bg_url)
        self._install_error_trap()

        ready = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline) {
              const bg = window.FoxHubBg;
              if (
                bg &&
                bg.state &&
                bg.state.currentSettings &&
                typeof window.__pmGetSyncBootState === 'function' &&
                bg.state.cachedState &&
                bg.state.cachedState.lastSyncAt > 0
              ) {
                const st = await browser.runtime.sendMessage({ type: 'GET_STATE' }).catch(() => null);
                if (st && st.settings) return true;
              }
              await new Promise((r) => setTimeout(r, 25));
            }
            return false;
            """
        )
        self.assertTrue(ready, "Offline background.html harness failed to initialize FoxHubBg")

    def _open_bridged_popup(
        self,
        settings: dict[str, Any] | None = None,
        width: int = 440,
        height: int = 700,
    ) -> None:
        bg_path = REPO_ROOT / "src" / "background" / "background.html"
        ui_path = REPO_ROOT / "src" / "popup" / "popup.html"
        self.assertTrue(bg_path.is_file(), f"Missing {bg_path}")
        self.assertTrue(ui_path.is_file(), f"Missing {ui_path}")

        bg_wrapped = _wrap_html_for_bridge(
            bg_path.read_text(encoding="utf-8"),
            self.server.url_for("/src/background/"),
            stub_fetch=True,
        )
        ui_wrapped = _wrap_html_for_bridge(
            ui_path.read_text(encoding="utf-8"),
            self.server.url_for("/src/popup/"),
            stub_fetch=True,
        )
        bg_url = self.server.register_fixture("t2_mr_bridge_bg.html", bg_wrapped)
        ui_url = self.server.register_fixture("t2_mr_bridge_ui.html", ui_wrapped) + "?sidebar=1"

        host_html = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>FoxHub Media Rail Bridge</title>
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
    window.__mrBridgeReady = false;
    window.__mrBridgeBoot = (async function () {{
      const bg = document.createElement('iframe');
      bg.id = 'bg-frame';
      bg.src = {json.dumps(bg_url)};
      document.body.appendChild(bg);
      await new Promise((resolve) => bg.addEventListener('load', resolve, {{ once: true }}));
      window.__webextMock.configure({{ backgroundPage: bg.contentWindow }});
      const bgDeadline = Date.now() + 2500;
      while (Date.now() < bgDeadline) {{
        if (typeof bg.contentWindow.__pmGetSyncBootState === 'function') {{
          const s = await window.browser.runtime.sendMessage({{ type: 'GET_STATE' }}).catch(() => null);
          if (s && s.settings) break;
        }}
        await new Promise((r) => setTimeout(r, 20));
      }}
      const ui = document.createElement('iframe');
      ui.id = 'ui-frame';
      ui.src = {json.dumps(ui_url)};
      document.body.appendChild(ui);
      await new Promise((resolve) => ui.addEventListener('load', resolve, {{ once: true }}));
      const uiDeadline = Date.now() + 2500;
      while (Date.now() < uiDeadline) {{
        const doc = ui.contentDocument;
        if (doc && doc.querySelector('#pm-rail-apps-list [data-app-id], #pm-rail-apps-list .pm-rail-item')) break;
        await new Promise((r) => setTimeout(r, 25));
      }}
      await new Promise((r) => setTimeout(r, 80));
      window.__mrBridgeReady = true;
    }})();
  </script>
</body>
</html>"""
        host_url = self.server.register_fixture("t2_mr_bridge_host.html", host_html)

        s = settings if settings is not None else _default_settings()
        self.server.set_seed(
            {
                "manifest": self._manifest_dict(),
                "storage": {"settings": s},
            }
        )
        self.fx.navigate(host_url)
        self.fx.set_viewport(width, height)
        self._install_error_trap()
        ready = self.fx.eval_async_js(
            "await window.__mrBridgeBoot; return Boolean(window.__mrBridgeReady);"
        )
        self.assertTrue(ready, "Bridged background + popup failed to boot")

    def _open_popup_toplevel(
        self,
        settings: dict[str, Any] | None = None,
        now_playing: dict[str, Any] | None = None,
        audible_app_id: str | None = None,
        width: int = 440,
        height: int = 700,
    ) -> None:
        s = settings if settings is not None else _default_settings()
        state_payload = _default_get_state_payload(
            s,
            nowPlaying=now_playing,
            audibleAppId=audible_app_id,
        )
        self.server.set_seed(
            {
                "manifest": self._manifest_dict(),
                "storage": {"settings": s},
                "messageResponses": {
                    "GET_STATE": state_payload,
                    "UPDATE_SETTINGS": {"ok": True, "settings": s},
                    "STOP_BG_AUDIO_HANDOFF": {"ok": True, "skipped": True, "settings": s},
                    "TOGGLE_NOW_PLAYING_COMMAND": {"ok": True, "nowPlaying": now_playing},
                },
            }
        )
        self.fx.navigate(self.server.url_for("/src/popup/popup.html?sidebar=1"))
        self.fx.set_viewport(width, height)
        self._install_error_trap()
        ready = self.fx.eval_async_js(
            """
            window.__t2MsgLog = [];
            window.__t2Settings = arguments[0];
            window.__t2NowPlaying = arguments[1];
            window.__t2AudibleAppId = arguments[2];
            window.__webextMock.runtime.setMessageHandler((msg) => {
              window.__t2MsgLog.push(msg);
              if (!msg || !msg.type) return undefined;
              if (msg.type === 'GET_STATE') {
                return {
                  state: { accounts: [], totalUnread: 0, sentMessages: [], lastSyncAt: Date.now(), usingDemo: false, syncError: null },
                  settings: window.__t2Settings,
                  snoozed: {},
                  audibleAppId: window.__t2AudibleAppId,
                  nowPlaying: window.__t2NowPlaying,
                  sidebarOpenCount: 1,
                  isAutoPausedByTabAudio: false,
                };
              }
              if (msg.type === 'UPDATE_SETTINGS') {
                window.__t2Settings = { ...window.__t2Settings, ...(msg.settings || {}) };
                return { ok: true, settings: window.__t2Settings };
              }
              if (msg.type === 'TOGGLE_NOW_PLAYING_COMMAND') {
                return { ok: true, appId: msg.appId, command: msg.command, nowPlaying: window.__t2NowPlaying };
              }
              if (msg.type === 'STOP_BG_AUDIO_HANDOFF') {
                return { ok: true, skipped: true, settings: window.__t2Settings };
              }
              if (msg.type === 'STATE_UPDATED' || msg.type === 'BG_AUDIO_STATUS_CHANGED') {
                return undefined;
              }
              return { ok: true };
            });
            const deadline = Date.now() + 2500;
            while (Date.now() < deadline) {
              if (document.querySelector('#pm-rail-apps-list .pm-rail-item, #pm-rail-apps-list [data-app-id]')) {
                await new Promise((r) => setTimeout(r, 80));
                return true;
              }
              await new Promise((r) => setTimeout(r, 25));
            }
            return false;
            """,
            s,
            now_playing,
            audible_app_id,
        )
        self.assertTrue(ready, "Top-level popup.html failed to render rail items")

    def _register_moz_audio_tab_fixture(self) -> str:
        watcher_path = REPO_ROOT / "src" / "content" / "tab-media-watcher.js"
        self.assertTrue(watcher_path.is_file(), f"Missing M2 lightweight watcher: {watcher_path}")
        html = """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>MozHasAudio Tab Fixture</title>
  <script src="/__test__/mock_seed.js"></script>
  <script src="/__test__/webext_mock.js"></script>
  <script src="/src/content/tab-media-watcher.js"></script>
</head>
<body>
  <video id="aud-video"></video>
  <video id="silent-video"></video>
  <script>
    function configureMockVideo(id, hasAudio) {
      const el = document.getElementById(id);
      let _paused = true;
      let _muted = false;
      let _volume = 1.0;
      Object.defineProperty(el, 'mozHasAudio', { get: () => hasAudio, configurable: true });
      Object.defineProperty(el, 'paused', { get: () => _paused, configurable: true });
      Object.defineProperty(el, 'muted', {
        get: () => _muted,
        set: (v) => { _muted = Boolean(v); },
        configurable: true,
      });
      Object.defineProperty(el, 'volume', {
        get: () => _volume,
        set: (v) => { _volume = Number(v); },
        configurable: true,
      });
      Object.defineProperty(el, 'readyState', { get: () => 4, configurable: true });
      Object.defineProperty(el, 'duration', { get: () => 180, configurable: true });
      el.play = function () {
        _paused = false;
        el.dispatchEvent(new Event('play'));
        el.dispatchEvent(new Event('playing'));
        return Promise.resolve();
      };
      el.pause = function () {
        _paused = true;
        el.dispatchEvent(new Event('pause'));
      };
    }
    configureMockVideo('aud-video', true);
    configureMockVideo('silent-video', false);
  </script>
</body>
</html>"""
        return self.server.register_fixture("t2_mr_tab_audio_fixture.html", html)

    # ==================================================================
    # F8: Left-Rail Playing Indicator & Quick Controls (6 tests)
    # ==================================================================

    def test_t2_f8_indicator_cleared_on_pause_and_non_music_app_switch(self) -> None:
        self._open_bridged_popup(_default_settings(railPlayingIndicatorEnabled=True))
        res = self.fx.eval_async_js(
            """
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const eqCssUrl = uiDoc.querySelector('link[href*="popup.css"], style');

            const isPlayingBtn = (btn) => {
              if (!btn) return false;
              const hasClass =
                btn.classList.contains('is-playing') ||
                btn.classList.contains('playing') ||
                btn.classList.contains('is-playing-audio') ||
                btn.getAttribute('data-playing') === 'true';
              const hasEq = Boolean(
                btn.querySelector('[class*="eq"], [class*="equalizer"], [data-playing-indicator]')
              );
              const badge = btn.querySelector('.pm-rail-playing-badge');
              const badgeVis = badge ? window.getComputedStyle(badge).display !== 'none' : false;
              return Boolean(hasClass || hasEq || badgeVis);
            };
            const getPlayingIds = () =>
              Array.from(uiDoc.querySelectorAll('#pm-rail-apps-list [data-app-id], #pm-rail-apps-list .pm-rail-item'))
                .filter((el) => isPlayingBtn(el))
                .map((el) => el.getAttribute('data-app-id') || '');

            const initialPlaying = getPlayingIds();

            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/track/1',
              playback: {
                isPlaying: true,
                title: 'Midnight City',
                artist: 'M83',
                duration: 244,
                resumeUrl: 'https://open.spotify.com/track/1'
              }
            });
            await new Promise((r) => setTimeout(r, 120));
            const afterStartPlaying = getPlayingIds();

            const igBtn = uiDoc.querySelector('#pm-rail-apps-list [data-app-id="instagram"]');
            if (igBtn) igBtn.click();
            await new Promise((r) => setTimeout(r, 80));
            const afterIgSwitch = getPlayingIds();

            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/track/1',
              playback: {
                isPlaying: false,
                title: 'Midnight City',
                artist: 'M83',
                duration: 244,
                resumeUrl: 'https://open.spotify.com/track/1'
              }
            });
            await new Promise((r) => setTimeout(r, 120));
            const afterExplicitPause = getPlayingIds();

            // Also verify resume + TOGGLE_NOW_PLAYING_COMMAND play_pause clears indicator
            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/track/1',
              playback: {
                isPlaying: true,
                title: 'Midnight City',
                resumeUrl: 'https://open.spotify.com/track/1'
              }
            });
            await new Promise((r) => setTimeout(r, 100));
            await browser.runtime.sendMessage({
              type: 'TOGGLE_NOW_PLAYING_COMMAND',
              appId: 'spotify',
              command: 'play_pause'
            });
            await new Promise((r) => setTimeout(r, 120));
            const afterCmdPause = getPlayingIds();

            return {
              hasEqMarkup: Boolean(uiDoc.querySelector('#pm-rail-apps-list [class*="eq"], #pm-rail-apps-list [class*="equalizer"], #pm-rail-apps-list [data-playing-indicator]')) || Boolean(uiWin.FoxHubPopup),
              initialPlaying,
              afterStartPlaying,
              afterIgSwitch,
              afterExplicitPause,
              afterCmdPause
            };
            """
        )
        self.assertEqual(res["initialPlaying"], [], f"Expected no playing indicator initially: {res}")
        self.assertEqual(res["afterStartPlaying"], ["spotify"], f"Expected spotify playing indicator: {res}")
        self.assertEqual(res["afterIgSwitch"], ["spotify"], f"Switching to instagram must keep spotify indicator only: {res}")
        self.assertEqual(res["afterExplicitPause"], [], f"Pause must clear rail playing indicator: {res}")
        self.assertEqual(res["afterCmdPause"], [], f"TOGGLE_NOW_PLAYING_COMMAND pause must clear rail playing indicator: {res}")
        self._assert_no_bridge_errors("test_t2_f8_indicator_cleared_on_pause_and_non_music_app_switch")

    def test_t2_f8_xss_and_long_track_title_tooltip_escaping(self) -> None:
        self._open_bridged_popup(_default_settings(railPlayingIndicatorEnabled=True))
        xss_title = '<img src=x onerror="window.__xssRail=1"><script>window.__xssRail=2</script> & "quote" ' + ("L" * 180)
        res = self.fx.eval_async_js(
            """
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const payloadTitle = arguments[0];
            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/track/xss',
              playback: {
                isPlaying: true,
                title: payloadTitle,
                artist: '<b>Evil</b> & Artist',
                resumeUrl: 'https://open.spotify.com/track/xss'
              }
            });
            await new Promise((r) => setTimeout(r, 140));
            const btn = uiDoc.querySelector('#pm-rail-apps-list [data-app-id="spotify"]');
            if (!btn) return { ok: false, reason: 'Missing spotify rail button' };
            btn.dispatchEvent(new uiWin.MouseEvent('mouseenter', { bubbles: true }));
            btn.dispatchEvent(new uiWin.MouseEvent('mouseover', { bubbles: true }));
            btn.dispatchEvent(new uiWin.FocusEvent('focus', { bubbles: true }));
            await new Promise((r) => setTimeout(r, 60));

            const rail = uiDoc.getElementById('pm-opera-rail') || uiDoc.body;
            const tooltipNode = uiDoc.querySelector('[role="tooltip"], .pm-rail-tooltip, .fh-rail-tooltip, [data-rail-tooltip]');
            const titleAttr = btn.getAttribute('title') || '';
            const ariaAttr = btn.getAttribute('aria-label') || '';
            const dataTip = btn.getAttribute('data-tooltip') || '';
            const tipText = tooltipNode ? (tooltipNode.textContent || '') : '';
            const combined = [titleAttr, ariaAttr, dataTip, tipText].join(' ');
            const badNodes = rail.querySelectorAll('script, img[onerror]').length + (tooltipNode ? tooltipNode.querySelectorAll('script, img[onerror]').length : 0);
            const rect = btn.getBoundingClientRect();
            return {
              ok: true,
              xssTop: window.__xssRail ?? null,
              xssUi: uiWin.__xssRail ?? null,
              badNodes,
              combined,
              hasTrackInMeta: combined.includes('<img') || combined.includes('LLLLLL'),
              scrollWidth: uiDoc.documentElement.scrollWidth,
              innerWidth: uiWin.innerWidth,
              btnWidth: rect.width
            };
            """,
            xss_title,
        )
        self.assertTrue(res.get("ok"), res)
        self.assertIsNone(res["xssTop"])
        self.assertIsNone(res["xssUi"])
        self.assertEqual(res["badNodes"], 0, f"XSS HTML nodes injected in rail/tooltip: {res}")
        self.assertTrue(
            res["hasTrackInMeta"],
            f"Expected hover/track tooltip or aria-label to include literal track title safely, got: {res['combined']!r}",
        )
        self.assertLessEqual(res["scrollWidth"], res["innerWidth"] + 1, f"Long tooltip caused overflow: {res}")
        self.assertLessEqual(res["btnWidth"], 64, f"Rail item width expanded past rail column: {res}")
        self._assert_no_bridge_errors("test_t2_f8_xss_and_long_track_title_tooltip_escaping")

    def test_t2_f8_rapid_play_pause_mute_toggle_consistency(self) -> None:
        self._open_bridged_popup(_default_settings(railPlayingIndicatorEnabled=True, railQuickControlsEnabled=True))
        res = self.fx.eval_async_js(
            """
            const bgWin = document.getElementById('bg-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const isPlayingBtn = (btn) => Boolean(
              btn && (
                btn.classList.contains('is-playing') ||
                btn.classList.contains('playing') ||
                btn.classList.contains('is-playing-audio') ||
                btn.getAttribute('data-playing') === 'true' ||
                btn.querySelector('[class*="eq"], [class*="equalizer"], [data-playing-indicator]') ||
                (btn.querySelector('.pm-rail-playing-badge') && window.getComputedStyle(btn.querySelector('.pm-rail-playing-badge')).display !== 'none')
              )
            );
            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/track/burst',
              playback: {
                isPlaying: true,
                title: 'Burst Track',
                resumeUrl: 'https://open.spotify.com/track/burst'
              }
            });
            await new Promise((r) => setTimeout(r, 80));

            // 3x play_pause (odd -> paused) + 2x mute_toggle (even -> unmuted)
            await Promise.all([
              browser.runtime.sendMessage({ type: 'TOGGLE_NOW_PLAYING_COMMAND', appId: 'spotify', command: 'play_pause' }),
              browser.runtime.sendMessage({ type: 'TOGGLE_NOW_PLAYING_COMMAND', appId: 'spotify', command: 'mute_toggle' }),
              browser.runtime.sendMessage({ type: 'TOGGLE_NOW_PLAYING_COMMAND', appId: 'spotify', command: 'play_pause' }),
              browser.runtime.sendMessage({ type: 'TOGGLE_NOW_PLAYING_COMMAND', appId: 'spotify', command: 'mute_toggle' }),
              browser.runtime.sendMessage({ type: 'TOGGLE_NOW_PLAYING_COMMAND', appId: 'spotify', command: 'play_pause' }),
            ]);
            await new Promise((r) => setTimeout(r, 150));
            const st1 = bgWin.FoxHubBg.getActiveNowPlayingState();
            const ind1 = isPlayingBtn(uiDoc.querySelector('#pm-rail-apps-list [data-app-id="spotify"]'));

            // 1x play_pause (resumes) + 1x mute_toggle (mutes)
            await Promise.all([
              browser.runtime.sendMessage({ type: 'TOGGLE_NOW_PLAYING_COMMAND', appId: 'spotify', command: 'play_pause' }),
              browser.runtime.sendMessage({ type: 'TOGGLE_NOW_PLAYING_COMMAND', appId: 'spotify', command: 'mute_toggle' }),
            ]);
            await new Promise((r) => setTimeout(r, 150));
            const st2 = bgWin.FoxHubBg.getActiveNowPlayingState();
            const spBtn2 = uiDoc.querySelector('#pm-rail-apps-list [data-app-id="spotify"]');
            const ind2 = isPlayingBtn(spBtn2);
            const mutedAttr2 = Boolean(
              spBtn2 && (
                spBtn2.classList.contains('is-muted') ||
                spBtn2.classList.contains('muted') ||
                spBtn2.getAttribute('data-muted') === 'true' ||
                /muted/i.test((spBtn2.getAttribute('aria-label') || '') + ' ' + (spBtn2.getAttribute('title') || ''))
              )
            );
            return { st1, ind1, st2, ind2, mutedAttr2 };
            """
        )
        self.assertIsNotNone(res["st1"])
        self.assertFalse(res["st1"]["isPlaying"], f"Expected paused after 3 toggles: {res['st1']}")
        self.assertFalse(res["st1"]["muted"], f"Expected unmuted after 2 toggles: {res['st1']}")
        self.assertFalse(res["ind1"], "Rail indicator must be cleared when paused")

        self.assertIsNotNone(res["st2"])
        self.assertTrue(res["st2"]["isPlaying"], f"Expected playing after resume toggle: {res['st2']}")
        self.assertTrue(res["st2"]["muted"], f"Expected muted after mute toggle: {res['st2']}")
        self.assertTrue(res["ind2"] or res["mutedAttr2"], f"Rail button did not converge after resume+mute: {res}")
        self._assert_no_bridge_errors("test_t2_f8_rapid_play_pause_mute_toggle_consistency")

    def test_t2_f8_middle_click_vs_primary_click_disambiguation(self) -> None:
        self._open_popup_toplevel(
            settings=_default_settings(railPlayingIndicatorEnabled=True, railQuickControlsEnabled=True),
            now_playing={
                "appId": "spotify",
                "appName": "Spotify",
                "isPlaying": True,
                "muted": False,
                "title": "Midnight City",
                "artist": "M83",
                "currentTime": 12,
                "duration": 244,
            },
            audible_app_id="spotify",
            width=440,
            height=700,
        )
        pre = self.fx.eval_js(
            """
            const btn = document.querySelector('#pm-rail-apps-list [data-app-id="spotify"]');
            if (!btn) return { exists: false };
            const r = btn.getBoundingClientRect();
            const isPlaying = Boolean(
              btn.classList.contains('is-playing') ||
              btn.classList.contains('playing') ||
              btn.classList.contains('is-playing-audio') ||
              btn.getAttribute('data-playing') === 'true' ||
              btn.querySelector('[class*="eq"], [class*="equalizer"], [data-playing-indicator]') ||
              (btn.querySelector('.pm-rail-playing-badge') && window.getComputedStyle(btn.querySelector('.pm-rail-playing-badge')).display !== 'none')
            );
            const mailBtn = document.getElementById('rail-btn-mail');
            if (mailBtn) mailBtn.click();
            window.__t2MsgLog = [];
            return {
              exists: true,
              width: r.width,
              height: r.height,
              isPlaying,
              mailActive: Boolean(mailBtn && mailBtn.classList.contains('active')),
            };
            """
        )
        self.assertTrue(pre.get("exists") and pre["width"] > 0 and pre["height"] > 0, f"Missing Spotify rail button: {pre}")
        self.assertTrue(pre.get("isPlaying"), f"Spotify rail button must show playing state before middle-click: {pre}")

        self.fx.middle_click('#pm-rail-apps-list [data-app-id="spotify"]')
        after_mid = self.fx.eval_async_js(
            """
            await new Promise((r) => setTimeout(r, 80));
            const mailBtn = document.getElementById('rail-btn-mail');
            const ws = document.getElementById('pm-media-workspace');
            const cmds = (window.__t2MsgLog || []).filter((m) => m && m.type === 'TOGGLE_NOW_PLAYING_COMMAND');
            window.__t2MsgLog = [];
            return {
              cmds,
              mailActive: Boolean(mailBtn && mailBtn.classList.contains('active')),
              wsHidden: Boolean(!ws || ws.classList.contains('hidden')),
            };
            """
        )
        self.assertGreaterEqual(len(after_mid["cmds"]), 1, f"Middle-click must dispatch TOGGLE_NOW_PLAYING_COMMAND: {after_mid}")
        self.assertEqual(after_mid["cmds"][0].get("appId"), "spotify")
        self.assertIn(after_mid["cmds"][0].get("command"), ("play_pause", "mute_toggle"))
        self.assertTrue(after_mid["mailActive"], "Middle-click quick control must NOT switch away from Mail view")
        self.assertTrue(after_mid["wsHidden"], "Middle-click quick control must NOT open media workspace")

        self.fx.click('#pm-rail-apps-list [data-app-id="spotify"]')
        after_left = self.fx.eval_async_js(
            """
            await new Promise((r) => setTimeout(r, 80));
            const spBtn = document.querySelector('#pm-rail-apps-list [data-app-id="spotify"]');
            const ws = document.getElementById('pm-media-workspace');
            const cmds = (window.__t2MsgLog || []).filter((m) => m && m.type === 'TOGGLE_NOW_PLAYING_COMMAND');
            return {
              cmds,
              spActive: Boolean(spBtn && spBtn.classList.contains('active')),
              wsVisible: Boolean(ws && !ws.classList.contains('hidden')),
            };
            """
        )
        self.assertEqual(after_left["cmds"], [], f"Primary left-click must navigate, not send quick-control command: {after_left}")
        self.assertTrue(after_left["spActive"], "Primary click must activate Spotify rail item")
        self.assertTrue(after_left["wsVisible"], "Primary click must open media workspace")
        self._assert_no_js_errors("test_t2_f8_middle_click_vs_primary_click_disambiguation")

    def test_t2_f8_disabled_rail_indicator_and_quick_controls_settings(self) -> None:
        self._open_popup_toplevel(
            settings=_default_settings(railPlayingIndicatorEnabled=False, railQuickControlsEnabled=False),
            now_playing={
                "appId": "spotify",
                "appName": "Spotify",
                "isPlaying": True,
                "muted": False,
                "title": "Midnight City",
                "artist": "M83",
            },
            audible_app_id="spotify",
            width=440,
            height=700,
        )
        off_state = self.fx.eval_js(
            """
            const btn = document.querySelector('#pm-rail-apps-list [data-app-id="spotify"]');
            if (!btn) return { exists: false };
            const r = btn.getBoundingClientRect();
            const hasInd = Boolean(
              btn.classList.contains('is-playing') ||
              btn.classList.contains('playing') ||
              btn.classList.contains('is-playing-audio') ||
              btn.getAttribute('data-playing') === 'true' ||
              btn.querySelector('[class*="eq"], [class*="equalizer"], [data-playing-indicator]') ||
              (btn.querySelector('.pm-rail-playing-badge') && window.getComputedStyle(btn.querySelector('.pm-rail-playing-badge')).display !== 'none')
            );
            window.__t2MsgLog = [];
            return { exists: true, width: r.width, height: r.height, hasInd };
            """
        )
        self.assertTrue(off_state.get("exists") and off_state["width"] > 0, f"Missing Spotify rail button: {off_state}")
        self.assertFalse(off_state["hasInd"], f"Playing indicator must stay hidden when railPlayingIndicatorEnabled=false: {off_state}")

        self.fx.middle_click('#pm-rail-apps-list [data-app-id="spotify"]')
        after_mid = self.fx.eval_async_js(
            """
            await new Promise((r) => setTimeout(r, 80));
            return (window.__t2MsgLog || []).filter((m) => m && m.type === 'TOGGLE_NOW_PLAYING_COMMAND');
            """
        )
        self.assertEqual(after_mid, [], f"Quick controls must be no-op when railQuickControlsEnabled=false: {after_mid}")

        on_state = self.fx.eval_async_js(
            """
            const nextSettings = { ...window.__t2Settings, railPlayingIndicatorEnabled: true };
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: nextSettings });
            await browser.runtime.sendMessage({ type: 'STATE_UPDATED', settings: nextSettings });
            await browser.runtime.sendMessage({
              type: 'BG_AUDIO_STATUS_CHANGED',
              audibleAppId: 'spotify',
              nowPlaying: window.__t2NowPlaying
            });
            await new Promise((r) => setTimeout(r, 100));
            const btn = document.querySelector('#pm-rail-apps-list [data-app-id="spotify"]');
            const hasInd = Boolean(
              btn && (
                btn.classList.contains('is-playing') ||
                btn.classList.contains('playing') ||
                btn.classList.contains('is-playing-audio') ||
                btn.getAttribute('data-playing') === 'true' ||
                btn.querySelector('[class*="eq"], [class*="equalizer"], [data-playing-indicator]') ||
                (btn.querySelector('.pm-rail-playing-badge') && window.getComputedStyle(btn.querySelector('.pm-rail-playing-badge')).display !== 'none')
              )
            );
            return { hasInd };
            """
        )
        self.assertTrue(on_state["hasInd"], "Re-enabling railPlayingIndicatorEnabled must reveal the Spotify indicator")
        self._assert_no_js_errors("test_t2_f8_disabled_rail_indicator_and_quick_controls_settings")

    def test_t2_f8_missing_metadata_unknown_appid_and_rapid_app_switching(self) -> None:
        self._open_bridged_popup(_default_settings(railPlayingIndicatorEnabled=True))
        res = self.fx.eval_async_js(
            """
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const isPlayingBtn = (btn) => Boolean(
              btn && (
                btn.classList.contains('is-playing') ||
                btn.classList.contains('playing') ||
                btn.classList.contains('is-playing-audio') ||
                btn.getAttribute('data-playing') === 'true' ||
                btn.querySelector('[class*="eq"], [class*="equalizer"], [data-playing-indicator]') ||
                (btn.querySelector('.pm-rail-playing-badge') && window.getComputedStyle(btn.querySelector('.pm-rail-playing-badge')).display !== 'none')
              )
            );

            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/',
              playback: {
                isPlaying: true,
                title: '',
                artist: '',
                artworkUrl: null,
                resumeUrl: 'https://open.spotify.com/'
              }
            });
            await new Promise((r) => setTimeout(r, 100));
            const spBtn = uiDoc.querySelector('#pm-rail-apps-list [data-app-id="spotify"]');
            const spMeta = spBtn
              ? [spBtn.getAttribute('title') || '', spBtn.getAttribute('aria-label') || '', spBtn.getAttribute('data-tooltip') || ''].join(' ')
              : '';

            // Fire unknown player status event
            await browser.runtime.sendMessage({
              type: 'BG_AUDIO_STATUS_CHANGED',
              audibleAppId: 'unknown-player-999',
              nowPlaying: { appId: 'unknown-player-999', isPlaying: true, title: 'Ghost' }
            });
            await new Promise((r) => setTimeout(r, 80));
            const bogusCount = uiDoc.querySelectorAll('#pm-rail-apps-list [data-app-id="unknown-player-999"]').length;

            // Rapidly switch active player across spotify -> soundcloud -> youtube
            await Promise.all([
              browser.runtime.sendMessage({ type: 'UPDATE_PERSISTENT_SESSION', appId: 'spotify', url: 'https://open.spotify.com/', playback: { isPlaying: true, title: 'S1', resumeUrl: 'https://open.spotify.com/' } }),
              browser.runtime.sendMessage({ type: 'UPDATE_PERSISTENT_SESSION', appId: 'soundcloud', url: 'https://soundcloud.com/x', playback: { isPlaying: true, title: 'S2', resumeUrl: 'https://soundcloud.com/x' } }),
              browser.runtime.sendMessage({ type: 'UPDATE_PERSISTENT_SESSION', appId: 'youtube', url: 'https://music.youtube.com/watch?v=1', playback: { isPlaying: true, title: 'S3', resumeUrl: 'https://music.youtube.com/watch?v=1' } }),
            ]);
            await new Promise((r) => setTimeout(r, 150));
            const activeIds = Array.from(uiDoc.querySelectorAll('#pm-rail-apps-list [data-app-id], #pm-rail-apps-list .pm-rail-item'))
              .filter((el) => isPlayingBtn(el))
              .map((el) => el.getAttribute('data-app-id') || '');

            return { spMeta, bogusCount, activeIds };
            """
        )
        self.assertIn("spotify", res["spMeta"].lower(), f"Missing fallback app name in rail metadata: {res['spMeta']!r}")
        self.assertNotIn("undefined", res["spMeta"].lower())
        self.assertNotIn("null", res["spMeta"].lower())
        self.assertEqual(res["bogusCount"], 0, "Unknown appId must not create a bogus rail button")
        self.assertEqual(res["activeIds"], ["youtube"], f"Expected only latest player 'youtube' active on rail: {res}")
        self._assert_no_bridge_errors("test_t2_f8_missing_metadata_unknown_appid_and_rapid_app_switching")

    # ==================================================================
    # F10: Mini "Now Playing" Bar (6 tests)
    # ==================================================================

    def test_t2_f10_hidden_on_active_player_view_visible_on_gmail_and_social(self) -> None:
        self._open_bridged_popup(_default_settings(miniNowPlayingEnabled=True))
        res = self.fx.eval_async_js(
            """
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const findNpBar = () => {
              const sels = ['#pm-mini-now-playing', '#pm-now-playing-bar', '#foxhub-now-playing', '[data-now-playing]', '[aria-label*="Now Playing" i]', '[role="region"][aria-label*="Playing" i]'];
              for (const s of sels) {
                for (const el of uiDoc.querySelectorAll(s)) {
                  if (el.matches('input, select, textarea, button, label') || el.closest('#pm-settings-mount, #pm-media-apps-drawer')) continue;
                  return el;
                }
              }
              return null;
            };
            const isVis = (el) => {
              if (!el || el.hidden || el.classList.contains('hidden')) return false;
              const cs = uiWin.getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) return false;
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            };

            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/track/1',
              playback: {
                isPlaying: true,
                title: 'Midnight City',
                artist: 'M83',
                duration: 244,
                currentTime: 25,
                resumeUrl: 'https://open.spotify.com/track/1'
              }
            });
            await new Promise((r) => setTimeout(r, 140));

            const bar1 = findNpBar();
            if (!bar1) return { hasBar: false };

            const visOnMail = isVis(bar1);
            const textOnMail = (bar1.textContent || '').trim();

            const igBtn = uiDoc.querySelector('#pm-rail-apps-list [data-app-id="instagram"]');
            if (igBtn) igBtn.click();
            await new Promise((r) => setTimeout(r, 90));
            const visOnSocial = isVis(findNpBar());

            const spBtn = uiDoc.querySelector('#pm-rail-apps-list [data-app-id="spotify"]');
            if (spBtn) spBtn.click();
            await new Promise((r) => setTimeout(r, 90));
            const visOnSpotify = isVis(findNpBar());

            const mailBtn = uiDoc.getElementById('rail-btn-mail');
            if (mailBtn) mailBtn.click();
            await new Promise((r) => setTimeout(r, 90));
            const visBackMail = isVis(findNpBar());

            return { hasBar: true, visOnMail, textOnMail, visOnSocial, visOnSpotify, visBackMail };
            """
        )
        self.assertTrue(res.get("hasBar"), "Mini Now Playing bar element not rendered during background Spotify playback")
        self.assertTrue(res["visOnMail"], "Mini Now Playing bar must be visible on Gmail view")
        self.assertIn("Midnight City", res["textOnMail"])
        self.assertTrue(res["visOnSocial"], "Mini Now Playing bar must stay visible on non-player social view (Instagram)")
        self.assertFalse(res["visOnSpotify"], "Mini Now Playing bar must hide when viewing the active player (Spotify) itself")
        self.assertTrue(res["visBackMail"], "Mini Now Playing bar must reappear when returning to Mail view")
        self._assert_no_bridge_errors("test_t2_f10_hidden_on_active_player_view_visible_on_gmail_and_social")

    def test_t2_f10_auto_hide_paused_true_vs_false_and_empty_state(self) -> None:
        self._open_bridged_popup(_default_settings(miniNowPlayingEnabled=True, miniNowPlayingAutoHidePaused=True))
        res = self.fx.eval_async_js(
            """
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const findNpBar = () => {
              const sels = ['#pm-mini-now-playing', '#pm-now-playing-bar', '#foxhub-now-playing', '[data-now-playing]', '[aria-label*="Now Playing" i]', '[role="region"][aria-label*="Playing" i]'];
              for (const s of sels) {
                for (const el of uiDoc.querySelectorAll(s)) {
                  if (el.matches('input, select, textarea, button, label') || el.closest('#pm-settings-mount, #pm-media-apps-drawer')) continue;
                  return el;
                }
              }
              return null;
            };
            const isVis = (el) => {
              if (!el || el.hidden || el.classList.contains('hidden')) return false;
              const cs = uiWin.getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) return false;
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            };

            // Empty state: even with autoHidePaused: false, no track => stay hidden
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { miniNowPlayingAutoHidePaused: false } });
            await new Promise((r) => setTimeout(r, 80));
            const visEmpty = isVis(findNpBar());

            // Enable autoHidePaused and start playing
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { miniNowPlayingAutoHidePaused: true } });
            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/track/1',
              playback: {
                isPlaying: true,
                title: 'Dawn Chorus',
                artist: 'Boards',
                resumeUrl: 'https://open.spotify.com/track/1'
              }
            });
            await new Promise((r) => setTimeout(r, 120));
            const bar = findNpBar();
            if (!bar) return { hasBar: false, visEmpty };
            const visPlaying = isVis(bar);

            // Pause via command -> must auto-hide
            await browser.runtime.sendMessage({ type: 'TOGGLE_NOW_PLAYING_COMMAND', appId: 'spotify', command: 'play_pause' });
            await new Promise((r) => setTimeout(r, 120));
            const visPausedAutoHideTrue = isVis(findNpBar());

            // Disable autoHidePaused while paused -> must reappear
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { miniNowPlayingAutoHidePaused: false } });
            await new Promise((r) => setTimeout(r, 120));
            const visPausedAutoHideFalse = isVis(findNpBar());

            // Re-enable autoHidePaused while paused -> must hide again
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { miniNowPlayingAutoHidePaused: true } });
            await new Promise((r) => setTimeout(r, 120));
            const visPausedAutoHideTrueAgain = isVis(findNpBar());

            return {
              hasBar: true,
              visEmpty,
              visPlaying,
              visPausedAutoHideTrue,
              visPausedAutoHideFalse,
              visPausedAutoHideTrueAgain
            };
            """
        )
        self.assertFalse(res["visEmpty"], "Empty playback state must not show a blank Now Playing bar")
        self.assertTrue(res.get("hasBar"), "Mini Now Playing bar was never rendered")
        self.assertTrue(res["visPlaying"])
        self.assertFalse(res["visPausedAutoHideTrue"], "Paused bar must auto-hide when miniNowPlayingAutoHidePaused=true")
        self.assertTrue(res["visPausedAutoHideFalse"], "Paused bar must stay visible when miniNowPlayingAutoHidePaused=false")
        self.assertFalse(res["visPausedAutoHideTrueAgain"], "Re-enabling miniNowPlayingAutoHidePaused must hide paused bar")
        self._assert_no_bridge_errors("test_t2_f10_auto_hide_paused_true_vs_false_and_empty_state")

    def test_t2_f10_disabled_setting_hides_bar_during_active_playback(self) -> None:
        self._open_bridged_popup(_default_settings(miniNowPlayingEnabled=False, railPlayingIndicatorEnabled=True))
        res = self.fx.eval_async_js(
            """
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const findNpBar = () => {
              const sels = ['#pm-mini-now-playing', '#pm-now-playing-bar', '#foxhub-now-playing', '[data-now-playing]', '[aria-label*="Now Playing" i]', '[role="region"][aria-label*="Playing" i]'];
              for (const s of sels) {
                for (const el of uiDoc.querySelectorAll(s)) {
                  if (el.matches('input, select, textarea, button, label') || el.closest('#pm-settings-mount, #pm-media-apps-drawer')) continue;
                  return el;
                }
              }
              return null;
            };
            const isVis = (el) => {
              if (!el || el.hidden || el.classList.contains('hidden')) return false;
              const cs = uiWin.getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) return false;
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            };
            const isRailPlaying = () => {
              const btn = uiDoc.querySelector('#pm-rail-apps-list [data-app-id="spotify"]');
              return Boolean(btn && (
                btn.classList.contains('is-playing') ||
                btn.classList.contains('playing') ||
                btn.classList.contains('is-playing-audio') ||
                btn.getAttribute('data-playing') === 'true' ||
                btn.querySelector('[class*="eq"], [class*="equalizer"], [data-playing-indicator]') ||
                (btn.querySelector('.pm-rail-playing-badge') && uiWin.getComputedStyle(btn.querySelector('.pm-rail-playing-badge')).display !== 'none')
              ));
            };

            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/track/1',
              playback: {
                isPlaying: true,
                title: 'Midnight City',
                resumeUrl: 'https://open.spotify.com/track/1'
              }
            });
            await new Promise((r) => setTimeout(r, 120));
            const visDisabled = isVis(findNpBar());
            const railPlayingWhileBarOff = isRailPlaying();

            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { miniNowPlayingEnabled: true } });
            await new Promise((r) => setTimeout(r, 120));
            const visEnabled = isVis(findNpBar());

            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { miniNowPlayingEnabled: false } });
            await new Promise((r) => setTimeout(r, 120));
            const visDisabledAgain = isVis(findNpBar());

            return { visDisabled, railPlayingWhileBarOff, visEnabled, visDisabledAgain };
            """
        )
        self.assertFalse(res["visDisabled"], "Mini Now Playing bar must be hidden when miniNowPlayingEnabled=false")
        self.assertTrue(res["railPlayingWhileBarOff"], "Left-rail indicator must still work when Now Playing bar is disabled")
        self.assertTrue(res["visEnabled"], "Enabling miniNowPlayingEnabled must display the Now Playing bar")
        self.assertFalse(res["visDisabledAgain"], "Disabling miniNowPlayingEnabled must hide the Now Playing bar immediately")
        self._assert_no_bridge_errors("test_t2_f10_disabled_setting_hides_bar_during_active_playback")

    def test_t2_f10_position_compact_progress_and_xss_metadata_edge_cases(self) -> None:
        self._open_bridged_popup(_default_settings(miniNowPlayingEnabled=True), width=320, height=640)
        res = self.fx.eval_async_js(
            """
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const findNpBar = () => {
              const sels = ['#pm-mini-now-playing', '#pm-now-playing-bar', '#foxhub-now-playing', '[data-now-playing]', '[aria-label*="Now Playing" i]', '[role="region"][aria-label*="Playing" i]'];
              for (const s of sels) {
                for (const el of uiDoc.querySelectorAll(s)) {
                  if (el.matches('input, select, textarea, button, label') || el.closest('#pm-settings-mount, #pm-media-apps-drawer')) continue;
                  return el;
                }
              }
              return null;
            };
            const isVis = (el) => {
              if (!el || el.hidden || el.classList.contains('hidden')) return false;
              const cs = uiWin.getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) return false;
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            };

            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/track/edge',
              playback: {
                isPlaying: true,
                title: '<img src=x onerror="window.__xssNP=1"><script>window.__xssNP=2<\\/script>ZeroDur',
                artist: '<b>Artist</b>',
                artworkUrl: 'javascript:alert(1)',
                currentTime: 0,
                duration: 0,
                resumeUrl: 'https://open.spotify.com/track/edge'
              }
            });
            await new Promise((r) => setTimeout(r, 140));

            const bar = findNpBar();
            if (!bar) return { hasBar: false };

            const xssTop = window.__xssNP ?? null;
            const xssUi = uiWin.__xssNP ?? null;
            const badElCount = bar.querySelectorAll('script, img[onerror], img[src^="javascript:"]').length;
            const barText = bar.textContent || '';
            const hasNaNOrInf = /NaN|Infinity/i.test(barText);

            // Position: top vs bottom
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { miniNowPlayingPosition: 'top' } });
            await new Promise((r) => setTimeout(r, 100));
            const rectTop = bar.getBoundingClientRect().toJSON();
            const swTop = uiDoc.documentElement.scrollWidth;

            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { miniNowPlayingPosition: 'bottom' } });
            await new Promise((r) => setTimeout(r, 100));
            const rectBottom = bar.getBoundingClientRect().toJSON();
            const swBottom = uiDoc.documentElement.scrollWidth;

            // Compact true vs false
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { miniNowPlayingCompact: false } });
            await new Promise((r) => setTimeout(r, 90));
            const hNormal = bar.getBoundingClientRect().height;

            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { miniNowPlayingCompact: true } });
            await new Promise((r) => setTimeout(r, 90));
            const hCompact = bar.getBoundingClientRect().height;
            const rectCompact = bar.getBoundingClientRect().toJSON();

            // Progress show true vs false with 100/200
            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/track/edge',
              playback: {
                isPlaying: true,
                title: 'Halfway',
                currentTime: 100,
                duration: 200,
                resumeUrl: 'https://open.spotify.com/track/edge'
              }
            });
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { miniNowPlayingShowProgress: false } });
            await new Promise((r) => setTimeout(r, 90));
            const progOffEl = bar.querySelector('[role="progressbar"], progress, [data-np-progress], [class*="progress"]');
            const progOffVis = isVis(progOffEl);

            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { miniNowPlayingShowProgress: true } });
            await new Promise((r) => setTimeout(r, 90));
            const progOnEl = bar.querySelector('[role="progressbar"], progress, [data-np-progress], [class*="progress"]');
            const progOnVis = isVis(progOnEl);

            return {
              hasBar: true,
              xssTop,
              xssUi,
              badElCount,
              hasLiteralXssText: barText.includes('<img') && barText.includes('ZeroDur'),
              hasNaNOrInf,
              rectTop,
              rectBottom,
              swTop,
              swBottom,
              hNormal,
              hCompact,
              rectCompact,
              progOffVis,
              progOnVis
            };
            """
        )
        self.assertTrue(res.get("hasBar"), "Mini Now Playing bar missing")
        self.assertIsNone(res["xssTop"])
        self.assertIsNone(res["xssUi"])
        self.assertEqual(res["badElCount"], 0, f"Unsafe HTML/javascript: img injected in Now Playing bar: {res}")
        self.assertTrue(res["hasLiteralXssText"], "Metadata must be escaped literally via textContent")
        self.assertFalse(res["hasNaNOrInf"], "0/0 duration must never display NaN or Infinity")
        self.assertLess(res["rectTop"]["top"], res["rectBottom"]["top"], f"Top position must render higher than bottom: {res}")
        self.assertLessEqual(res["swTop"], 321)
        self.assertLessEqual(res["swBottom"], 321)
        self.assertGreaterEqual(res["rectBottom"]["left"], 0)
        self.assertLessEqual(res["rectBottom"]["right"], 321)
        self.assertLess(res["hCompact"], res["hNormal"], "Compact mode must strictly reduce bar height")
        self.assertLessEqual(res["rectCompact"]["right"], 321)
        self.assertFalse(res["progOffVis"], "Progress indicator must hide when miniNowPlayingShowProgress=false")
        self.assertTrue(res["progOnVis"], "Progress indicator must show when miniNowPlayingShowProgress=true")
        self._assert_no_bridge_errors("test_t2_f10_position_compact_progress_and_xss_metadata_edge_cases")

    def test_t2_f10_disabled_can_prev_and_can_next_button_bounds(self) -> None:
        self._open_bridged_popup(_default_settings(miniNowPlayingEnabled=True))
        res = self.fx.eval_async_js(
            """
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const findNpBar = () => {
              const sels = ['#pm-mini-now-playing', '#pm-now-playing-bar', '#foxhub-now-playing', '[data-now-playing]', '[aria-label*="Now Playing" i]', '[role="region"][aria-label*="Playing" i]'];
              for (const s of sels) {
                for (const el of uiDoc.querySelectorAll(s)) {
                  if (el.matches('input, select, textarea, button, label') || el.closest('#pm-settings-mount, #pm-media-apps-drawer')) continue;
                  return el;
                }
              }
              return null;
            };
            const findBtn = (bar, regex) => Array.from(bar.querySelectorAll('button, [role="button"]')).find((b) => {
              const meta = [b.id || '', b.className || '', b.getAttribute('data-command') || '', b.getAttribute('data-action') || '', b.getAttribute('aria-label') || '', b.getAttribute('title') || '', b.textContent || ''].join(' ');
              return regex.test(meta);
            });
            const isDisabled = (btn) => Boolean(btn && (btn.disabled === true || btn.getAttribute('aria-disabled') === 'true'));

            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/episode/live',
              playback: {
                isPlaying: true,
                title: 'Live Stream',
                canPrev: false,
                canNext: false,
                resumeUrl: 'https://open.spotify.com/episode/live'
              }
            });
            await new Promise((r) => setTimeout(r, 140));
            const bar = findNpBar();
            if (!bar) return { hasBar: false };

            const prevBtn = findBtn(bar, /prev|previous|back/i);
            const nextBtn = findBtn(bar, /next|skip|forward/i);
            if (!prevBtn || !nextBtn) return { hasBar: true, hasButtons: false };

            const prevDis1 = isDisabled(prevBtn);
            const nextDis1 = isDisabled(nextBtn);

            window.__webextMock.clearCalls();
            prevBtn.click();
            nextBtn.click();
            await new Promise((r) => setTimeout(r, 80));
            const cmds1 = window.__webextMock.getCalls('runtime.sendMessage')
              .map((c) => c && c.args && c.args[0])
              .filter((m) => m && m.type === 'TOGGLE_NOW_PLAYING_COMMAND' && (m.command === 'prev' || m.command === 'next'));

            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/episode/live',
              playback: {
                isPlaying: true,
                title: 'Track 2',
                canPrev: false,
                canNext: true,
                resumeUrl: 'https://open.spotify.com/episode/live'
              }
            });
            await new Promise((r) => setTimeout(r, 120));
            const prevDis2 = isDisabled(prevBtn);
            const nextDis2 = isDisabled(nextBtn);

            window.__webextMock.clearCalls();
            prevBtn.click();
            nextBtn.click();
            await new Promise((r) => setTimeout(r, 80));
            const cmds2 = window.__webextMock.getCalls('runtime.sendMessage')
              .map((c) => c && c.args && c.args[0])
              .filter((m) => m && m.type === 'TOGGLE_NOW_PLAYING_COMMAND' && (m.command === 'prev' || m.command === 'next'));

            return { hasBar: true, hasButtons: true, prevDis1, nextDis1, cmds1, prevDis2, nextDis2, cmds2 };
            """
        )
        self.assertTrue(res.get("hasBar"), "Mini Now Playing bar missing")
        self.assertTrue(res.get("hasButtons"), "Prev/Next buttons missing in Mini Now Playing bar")
        self.assertTrue(res["prevDis1"], "Prev button must be disabled when canPrev=false")
        self.assertTrue(res["nextDis1"], "Next button must be disabled when canNext=false")
        self.assertEqual(res["cmds1"], [], "Disabled Prev/Next buttons must not dispatch commands")
        self.assertTrue(res["prevDis2"], "Prev must remain disabled when canPrev=false")
        self.assertFalse(res["nextDis2"], "Next must become enabled when canNext=true")
        self.assertEqual([c.get("command") for c in res["cmds2"]], ["next"], f"Expected only 'next' command: {res['cmds2']}")
        self._assert_no_bridge_errors("test_t2_f10_disabled_can_prev_and_can_next_button_bounds")

    def test_t2_f10_soundcloud_ytm_jump_to_player_and_current_time_clamping(self) -> None:
        self._open_bridged_popup(_default_settings(miniNowPlayingEnabled=True, miniNowPlayingShowProgress=True))
        res = self.fx.eval_async_js(
            """
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const findNpBar = () => {
              const sels = ['#pm-mini-now-playing', '#pm-now-playing-bar', '#foxhub-now-playing', '[data-now-playing]', '[aria-label*="Now Playing" i]', '[role="region"][aria-label*="Playing" i]'];
              for (const s of sels) {
                for (const el of uiDoc.querySelectorAll(s)) {
                  if (el.matches('input, select, textarea, button, label') || el.closest('#pm-settings-mount, #pm-media-apps-drawer')) continue;
                  return el;
                }
              }
              return null;
            };
            const isVis = (el) => {
              if (!el || el.hidden || el.classList.contains('hidden')) return false;
              const cs = uiWin.getComputedStyle(el);
              return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
            };

            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'soundcloud',
              url: 'https://soundcloud.com/neon/sunset-synth',
              playback: {
                isPlaying: true,
                title: 'Sunset Synth',
                artist: 'Neon Waves',
                currentTime: 500,
                duration: 195,
                resumeUrl: 'https://soundcloud.com/neon/sunset-synth'
              }
            });
            await new Promise((r) => setTimeout(r, 140));
            const bar = findNpBar();
            if (!bar) return { hasBar: false };

            const scTitleInBar = (bar.textContent || '').includes('Sunset Synth');
            const barRect = bar.getBoundingClientRect();
            const progEl = bar.querySelector('[role="progressbar"], progress, [data-np-progress], [class*="progress"]');
            const fillEl = bar.querySelector('[class*="progress-fill"], [class*="progress-bar"], [data-np-progress-fill]') || progEl;
            const fillRect = fillEl ? fillEl.getBoundingClientRect() : null;
            const fillWidthPct = fillEl && fillEl.style && fillEl.style.width && fillEl.style.width.endsWith('%')
              ? parseFloat(fillEl.style.width)
              : null;
            const ariaNow = progEl && progEl.getAttribute('aria-valuenow') !== null
              ? parseFloat(progEl.getAttribute('aria-valuenow'))
              : null;
            const ariaMax = progEl && progEl.getAttribute('aria-valuemax') !== null
              ? parseFloat(progEl.getAttribute('aria-valuemax'))
              : null;

            const jumpTarget = bar.querySelector('#pm-np-jump, [data-np-jump], [data-action="jump"], [class*="title"], [class*="info"]') || bar;
            jumpTarget.click();
            await new Promise((r) => setTimeout(r, 120));

            const scActive = Boolean(uiDoc.querySelector('#pm-rail-apps-list [data-app-id="soundcloud"].active'));
            const wsOpen = Boolean(uiDoc.getElementById('pm-media-workspace') && !uiDoc.getElementById('pm-media-workspace').classList.contains('hidden'));
            const barHiddenOnSc = !isVis(findNpBar());

            // Return to Mail and switch playback to YouTube Music
            const mailBtn = uiDoc.getElementById('rail-btn-mail');
            if (mailBtn) mailBtn.click();
            await new Promise((r) => setTimeout(r, 80));
            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'youtube',
              url: 'https://music.youtube.com/watch?v=abc',
              playback: {
                isPlaying: true,
                title: 'Lofi Beats',
                artist: 'Study Girl',
                currentTime: 30,
                duration: 180,
                resumeUrl: 'https://music.youtube.com/watch?v=abc'
              }
            });
            await new Promise((r) => setTimeout(r, 140));
            const barTextYtm = (findNpBar() && findNpBar().textContent) || '';
            const jump2 = findNpBar().querySelector('#pm-np-jump, [data-np-jump], [data-action="jump"], [class*="title"], [class*="info"]') || findNpBar();
            jump2.click();
            await new Promise((r) => setTimeout(r, 120));
            const ytActive = Boolean(uiDoc.querySelector('#pm-rail-apps-list [data-app-id="youtube"].active'));

            return {
              hasBar: true,
              scTitleInBar,
              barRight: barRect.right,
              fillRight: fillRect ? fillRect.right : barRect.right,
              fillWidthPct,
              ariaNow,
              ariaMax,
              scActive,
              wsOpen,
              barHiddenOnSc,
              barTextYtm,
              ytActive
            };
            """
        )
        self.assertTrue(res.get("hasBar"), "Mini Now Playing bar missing")
        self.assertTrue(res["scTitleInBar"])
        self.assertLessEqual(res["fillRight"], res["barRight"] + 1.5, "Progress fill overflowed past Now Playing bar")
        if res["fillWidthPct"] is not None:
            self.assertLessEqual(res["fillWidthPct"], 100.0, "Progress width percentage exceeded 100%")
        if res["ariaNow"] is not None and res["ariaMax"] is not None:
            self.assertLessEqual(res["ariaNow"], res["ariaMax"], "aria-valuenow exceeded aria-valuemax")
        self.assertTrue(res["scActive"], "Jump-to-player must activate SoundCloud rail button")
        self.assertTrue(res["wsOpen"], "Jump-to-player must open media workspace")
        self.assertTrue(res["barHiddenOnSc"], "Now Playing bar must hide after jumping to SoundCloud")
        self.assertIn("Lofi Beats", res["barTextYtm"])
        self.assertTrue(res["ytActive"], "Jump-to-player must activate YouTube rail button")
        self._assert_no_bridge_errors("test_t2_f10_soundcloud_ytm_jump_to_player_and_current_time_clamping")

    # ==================================================================
    # F17: v2.7.9 Stability Preservation (6 tests)
    # ==================================================================

    def test_t2_f17_spotify_soundcloud_bg_keepalive_survives_muted_hidden_close(self) -> None:
        self._boot_background_offline(
            _default_settings(
                persistenceMode="eco",
                keepAudioPlayingWhenClosed=True,
                bgAudioAppIds=["spotify", "youtube", "soundcloud"],
            )
        )
        sc_url = self.server.url_for("/mock/soundcloud")
        sp_url = self.server.url_for("/mock/spotify")
        res = self.fx.eval_async_js(
            """
            const scUrl = arguments[0];
            const spUrl = arguments[1];
            const bg = window.FoxHubBg;
            const port = browser.runtime.connect({ name: 'foxhub-sidebar-lifecycle' });
            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'soundcloud',
              url: scUrl,
              playback: { isPlaying: true, title: 'Sunset Synth', resumeUrl: scUrl }
            });
            port.disconnect();
            await browser.runtime.sendMessage({
              type: 'SIDEBAR_CLOSED_HANDOFF',
              activeAppId: 'pocketmail',
              playingApps: [{ appId: 'soundcloud', url: scUrl, title: 'Sunset Synth', isPlaying: true }]
            });
            await new Promise((r) => setTimeout(r, 60));

            const scInPool = bg.bgAudioPool.has('soundcloud');
            const scSyncApps = (window.__pmGetSyncBootState().activeBgApps || []).slice();

            window.__webextMock.alarms.trigger('foxhub-audio-keepalive');
            await new Promise((r) => setTimeout(r, 40));
            const diag1 = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });

            // Now test Spotify keep-alive + spurious pause suppression
            await browser.runtime.sendMessage({
              type: 'SIDEBAR_CLOSED_HANDOFF',
              activeAppId: 'pocketmail',
              playingApps: [{ appId: 'spotify', url: spUrl, title: 'Midnight City', isPlaying: true }]
            });
            await bg.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 1, 'bg');
            const sp = bg.bgSpEmePlayers.get('spotify');
            let _paused = false;
            Object.defineProperty(sp.videoEl, 'paused', { get: () => _paused, configurable: true });
            sp.videoEl.pause = () => { _paused = true; };
            sp.videoEl.play = () => { _paused = false; return Promise.resolve(); };

            window.__pmHandleSpEmeBridge(
              'spotify',
              { bridgeType: 'SYNC_TIME', paused: true, explicitPause: false, spUiStillPlaying: true, currentTime: 5 },
              'bg'
            );
            const spStillUnpaused = sp.videoEl.paused === false;
            const diag2 = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });
            const diag2Events = ((diag2 && diag2.diagnostics && diag2.diagnostics.recentEvents) || []).map((e) => e.event);

            // Turning keepAudioPlayingWhenClosed=false must stop background keep-alive
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { keepAudioPlayingWhenClosed: false } });
            await browser.runtime.sendMessage({
              type: 'SIDEBAR_CLOSED_HANDOFF',
              activeAppId: 'pocketmail',
              playingApps: [{ appId: 'spotify', url: spUrl, title: 'Midnight City', isPlaying: true }]
            });
            const afterDisableApps = window.__pmGetSyncBootState().activeBgApps || [];

            return {
              scInPool,
              scSyncApps,
              wakePulseCount: diag1?.diagnostics?.keepalive?.alarmWakePulseCount || 0,
              diag1Events: (diag1?.diagnostics?.recentEvents || []).map((e) => e.event),
              spStillUnpaused,
              diag2Events,
              afterDisableApps
            };
            """,
            sc_url,
            sp_url,
        )
        self.assertTrue(res["scInPool"], "SoundCloud must enter bgAudioPool even when persistenceMode=eco")
        self.assertIn("soundcloud", [a.get("appId") if isinstance(a, dict) else a for a in res["scSyncApps"]])
        self.assertGreaterEqual(res["wakePulseCount"], 1)
        self.assertIn("bg-alarm-wake-pulse", res["diag1Events"])
        self.assertTrue(res["spStillUnpaused"], "Spurious Spotify pause must NOT pause sp.videoEl")
        self.assertTrue(
            "suppress-spurious-bg-pause" in res["diag2Events"] or "ignore-transient-harmony-pause" in res["diag2Events"],
            f"Expected spurious pause suppression event in diagnostics: {res['diag2Events']}",
        )
        self.assertEqual(res["afterDisableApps"], [], "keepAudioPlayingWhenClosed=false must clear bg keep-alive")
        self._assert_no_js_errors("test_t2_f17_spotify_soundcloud_bg_keepalive_survives_muted_hidden_close")

    def test_t2_f17_genuine_user_pause_not_suppressed_by_spurious_pause_guard(self) -> None:
        self._boot_background_offline(_default_settings(bgAudioAppIds=["spotify", "youtube", "soundcloud"]))
        sp_url = self.server.url_for("/mock/spotify")
        res = self.fx.eval_async_js(
            """
            const spUrl = arguments[0];
            const bg = window.FoxHubBg;
            await bg.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 10, 'sidebar');
            const sp = bg.bgSpEmePlayers.get('spotify');
            let _paused = true;
            Object.defineProperty(sp.videoEl, 'paused', { get: () => _paused, configurable: true });
            sp.videoEl.pause = () => { _paused = true; };
            sp.videoEl.play = () => { _paused = false; return Promise.resolve(); };

            window.__pmHandleSpEmeBridge(
              'spotify',
              { bridgeType: 'SYNC_TIME', paused: false, currentTime: 15, duration: 240, trackTitle: 'Midnight City', href: spUrl },
              'sidebar'
            );
            const playingState = bg.getActiveNowPlayingState();

            // Path A: explicitPause: true
            window.__pmHandleSpEmeBridge(
              'spotify',
              { bridgeType: 'SYNC_TIME', paused: true, explicitPause: true, spUiStillPlaying: false, currentTime: 15 },
              'sidebar'
            );
            const pathA = {
              explicitUserPause: sp.explicitUserPause,
              videoPaused: sp.videoEl.paused,
              isPlaying: bg.getActiveNowPlayingState()?.isPlaying
            };

            // Path B: resume then click Pause + STOP_PLAYBACK explicitStop
            window.__pmHandleSpEmeBridge(
              'spotify',
              { bridgeType: 'SYNC_TIME', paused: false, currentTime: 16, duration: 240, trackTitle: 'Midnight City', href: spUrl },
              'sidebar'
            );
            await browser.runtime.sendMessage({ type: 'PM_SP_SIDEBAR_PLAYPAUSE_CLICK', appId: 'spotify', aria: 'Pause' });
            window.__pmHandleSpEmeBridge('spotify', { bridgeType: 'STOP_PLAYBACK', explicitStop: true }, 'sidebar');
            await browser.runtime.sendMessage({ type: 'SIDEBAR_CLOSED_HANDOFF', activeAppId: 'pocketmail', playingApps: [] });
            const diag = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });
            const events = (diag?.diagnostics?.recentEvents || []).map((e) => e.event);

            return {
              playingOk: Boolean(playingState && playingState.isPlaying),
              pathA,
              explicitUserPauseB: sp.explicitUserPause,
              remotePausedB: sp.remotePaused,
              bgPoolHasSpotify: bg.bgAudioPool.has('spotify'),
              events
            };
            """,
            sp_url,
        )
        self.assertTrue(res["playingOk"])
        self.assertTrue(res["pathA"]["explicitUserPause"])
        self.assertTrue(res["pathA"]["videoPaused"])
        self.assertFalse(res["pathA"]["isPlaying"])
        self.assertTrue(res["explicitUserPauseB"])
        self.assertTrue(res["remotePausedB"])
        self.assertIn("stop-playback", res["events"])
        self.assertFalse(res["bgPoolHasSpotify"], "Explicit stop must not respawn Spotify bg keep-alive on close")
        self._assert_no_js_errors("test_t2_f17_genuine_user_pause_not_suppressed_by_spurious_pause_guard")

    def test_t2_f17_tab_audio_autopause_with_mozhasaudio_true_and_false_boundaries(self) -> None:
        # Part A: Content watcher tab-media-watcher.js with mozHasAudio true vs false
        fixture_url = self._register_moz_audio_tab_fixture()
        self.server.set_seed(
            {
                "manifest": self._manifest_dict(),
                "senderTab": {"id": 55, "windowId": 1, "url": fixture_url, "audible": False},
            }
        )
        self.fx.navigate(fixture_url)
        self._install_error_trap()

        part_a = self.fx.eval_async_js(
            """
            const sendTabCheck = () => browser.runtime.sendMessage({ type: 'CHECK_TAB_HAS_ACTIVE_MEDIA' }).catch(() => null);

            // 1. Silent video (mozHasAudio: false)
            window.__webextMock.clearCalls();
            await document.getElementById('silent-video').play();
            await new Promise((r) => setTimeout(r, 80));
            const silentMsgs = window.__webextMock.getCalls('runtime.sendMessage')
              .map((c) => c.args && c.args[0])
              .filter((m) => m && m.type === 'EXTERNAL_TAB_MEDIA_PLAYING');
            const silentCheck = await sendTabCheck();

            // 2. Audible video while muted=true, then unmuted with volume=0
            const aud = document.getElementById('aud-video');
            aud.muted = true;
            window.__webextMock.clearCalls();
            await aud.play();
            await new Promise((r) => setTimeout(r, 60));
            const mutedMsgs = window.__webextMock.getCalls('runtime.sendMessage')
              .map((c) => c.args && c.args[0])
              .filter((m) => m && m.type === 'EXTERNAL_TAB_MEDIA_PLAYING');

            aud.pause();
            aud.muted = false;
            aud.volume = 0;
            window.__webextMock.clearCalls();
            await aud.play();
            await new Promise((r) => setTimeout(r, 60));
            const volZeroMsgs = window.__webextMock.getCalls('runtime.sendMessage')
              .map((c) => c.args && c.args[0])
              .filter((m) => m && m.type === 'EXTERNAL_TAB_MEDIA_PLAYING');

            // 3. Unmuted with volume=0.8 and mozHasAudio=true
            aud.pause();
            aud.volume = 0.8;
            window.__webextMock.clearCalls();
            await aud.play();
            await new Promise((r) => setTimeout(r, 80));
            const audMsgs = window.__webextMock.getCalls('runtime.sendMessage')
              .map((c) => c.args && c.args[0])
              .filter((m) => m && m.type === 'EXTERNAL_TAB_MEDIA_PLAYING');
            const audCheck = await sendTabCheck();

            return { silentMsgs, silentCheck, mutedMsgs, volZeroMsgs, audMsgs, audCheck };
            """
        )
        self.assertEqual(part_a["silentMsgs"], [], "mozHasAudio=false video must NOT trigger EXTERNAL_TAB_MEDIA_PLAYING")
        self.assertFalse(bool(part_a["silentCheck"] and part_a["silentCheck"].get("hasActiveMedia")))
        self.assertEqual(part_a["mutedMsgs"], [], "Muted video must NOT trigger EXTERNAL_TAB_MEDIA_PLAYING")
        self.assertEqual(part_a["volZeroMsgs"], [], "Zero-volume video must NOT trigger EXTERNAL_TAB_MEDIA_PLAYING")
        self.assertGreaterEqual(len(part_a["audMsgs"]), 1, "Audible mozHasAudio=true video must send EXTERNAL_TAB_MEDIA_PLAYING")
        self.assertTrue(bool(part_a["audCheck"] and part_a["audCheck"].get("hasActiveMedia")))
        self._assert_no_js_errors("test_t2_f17_tab_audio_autopause_partA")

        # Part B: Background auto-pause boundaries (muted tab, moz-extension tab, audible tab, tabAudioBehavior='off')
        self.fx.reset_to_blank()
        self.server.clear_seed()
        tabs = [
            {"id": 55, "windowId": 1, "active": True, "audible": False, "mutedInfo": {"muted": False}, "url": "https://example.com/watch"},
            {"id": 56, "windowId": 1, "active": False, "audible": True, "mutedInfo": {"muted": True}, "url": "https://example.com/muted"},
            {"id": 57, "windowId": 1, "active": False, "audible": True, "mutedInfo": {"muted": False}, "url": "moz-extension://ext/popup.html"},
        ]
        self._boot_background_offline(_default_settings(tabAudioBehavior="pause-resume"), tabs=tabs)
        part_b = self.fx.eval_async_js(
            """
            const bg = window.FoxHubBg;
            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/track/1',
              playback: { isPlaying: true, title: 'Track 1', resumeUrl: 'https://open.spotify.com/track/1' }
            });
            await bg.checkExternalTabAudioState();
            const pausedMutedOnly = bg.tabAudio.isAutoPausedByTabAudio;

            await window.__webextMock.tabs.triggerUpdated(55, { audible: true }, { audible: true });
            await new Promise((r) => setTimeout(r, 80));
            const pausedExternal = bg.tabAudio.isAutoPausedByTabAudio;
            const stor = await browser.storage.local.get('pmTabAudioTrigger');
            const diag = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });
            const events = (diag?.diagnostics?.recentEvents || []).map((e) => e.event);

            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { tabAudioBehavior: 'off' } });
            await new Promise((r) => setTimeout(r, 80));
            const pausedWhenOff = bg.tabAudio.isAutoPausedByTabAudio;

            return { pausedMutedOnly, pausedExternal, storTrigger: stor.pmTabAudioTrigger, events, pausedWhenOff };
            """
        )
        self.assertFalse(part_b["pausedMutedOnly"], "Muted and moz-extension tabs must NOT trigger auto-pause")
        self.assertTrue(part_b["pausedExternal"], "Audible unmuted external tab must trigger auto-pause")
        self.assertTrue(bool(part_b["storTrigger"] and part_b["storTrigger"].get("active")))
        self.assertIn("tab-audio-auto-pause", part_b["events"])
        self.assertFalse(part_b["pausedWhenOff"], "Switching tabAudioBehavior='off' must release auto-pause")
        self._assert_no_js_errors("test_t2_f17_tab_audio_autopause_partB")

    def test_t2_f17_autoresume_honors_4200ms_hold_and_340ms_settle_debounce(self) -> None:
        tabs = [
            {"id": 60, "windowId": 1, "active": True, "audible": False, "mutedInfo": {"muted": False}, "url": "https://example.com/vid"},
        ]
        self._boot_background_offline(_default_settings(tabAudioBehavior="pause-resume"), tabs=tabs)
        res = self.fx.eval_async_js(
            """
            const bg = window.FoxHubBg;
            const spUrl = arguments[0];
            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: spUrl,
              playback: { isPlaying: true, title: 'Track 60', resumeUrl: spUrl }
            });

            // Trigger external tab 60 audible
            await window.__webextMock.tabs.triggerUpdated(60, { audible: true }, { audible: true });
            await new Promise((r) => setTimeout(r, 50));
            const paused1 = bg.tabAudio.isAutoPausedByTabAudio;

            // Stop tab 60 -> check before 340ms debounce expires
            await window.__webextMock.tabs.triggerUpdated(60, { audible: false }, { audible: false });
            await new Promise((r) => setTimeout(r, 120));
            const stillPausedAt120 = bg.tabAudio.isAutoPausedByTabAudio;

            // Become audible again before 340ms -> cancels scheduled resume
            await window.__webextMock.tabs.triggerUpdated(60, { audible: true }, { audible: true });
            await new Promise((r) => setTimeout(r, 320));
            const stillPausedAfterCancel = bg.tabAudio.isAutoPausedByTabAudio;
            const diagCancel = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });
            const cancelEvents = (diagCancel?.diagnostics?.recentEvents || []).map((e) => e.event);

            // Now stop cleanly and wait > 340ms
            await window.__webextMock.tabs.triggerUpdated(60, { audible: false }, { audible: false });
            await new Promise((r) => setTimeout(r, 480));
            const resumedAfterDebounce = !bg.tabAudio.isAutoPausedByTabAudio;
            const diagResume = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });
            const resumeEvents = (diagResume?.diagnostics?.recentEvents || []).map((e) => e.event);

            // 4.2s silent-tab hold cap boundary
            await window.__webextMock.tabs.triggerUpdated(60, { audible: true }, { audible: true });
            await new Promise((r) => setTimeout(r, 40));
            const pausedBeforeHold = bg.tabAudio.isAutoPausedByTabAudio;
            // Seed tab 60 audible=false WITHOUT triggerUpdated, while content check reports active media
            window.__webextMock.tabs.seed([{ id: 60, windowId: 1, active: true, audible: false, mutedInfo: { muted: false }, url: 'https://example.com/vid' }]);
            window.__webextMock.tabs.setTabMessageResult(60, { hasActiveMedia: true });
            await bg.checkExternalTabAudioState();
            await new Promise((r) => setTimeout(r, 900));
            const pausedDuringHold = bg.tabAudio.isAutoPausedByTabAudio;
            const holdDiag = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });
            const holdTabIds = ((holdDiag?.diagnostics?.tabAudioHoldDown?.silentTabHolds) || []).map((h) => h.tabId);

            // Wait up to 5.4s for 4200ms hold cap + 340ms resume
            const holdDeadline = Date.now() + 5400;
            while (Date.now() < holdDeadline && bg.tabAudio.isAutoPausedByTabAudio) {
              await new Promise((r) => setTimeout(r, 150));
            }
            const resumedAfterHoldCap = !bg.tabAudio.isAutoPausedByTabAudio;
            const diagHoldEnd = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });
            const holdEndEvents = (diagHoldEnd?.diagnostics?.recentEvents || []).map((e) => e.event);

            // pause-only boundary
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { tabAudioBehavior: 'pause-only' } });
            await window.__webextMock.tabs.triggerUpdated(60, { audible: true }, { audible: true });
            await new Promise((r) => setTimeout(r, 50));
            const pausedPauseOnly = bg.tabAudio.isAutoPausedByTabAudio;
            const resumeCountBefore = holdEndEvents.filter((e) => e === 'tab-audio-auto-resume').length;
            await window.__webextMock.tabs.triggerUpdated(60, { audible: false }, { audible: false });
            await new Promise((r) => setTimeout(r, 480));
            const storPauseOnly = await browser.storage.local.get('pmTabAudioTrigger');
            const diagPO = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });
            const poEvents = (diagPO?.diagnostics?.recentEvents || []).map((e) => e.event);
            const resumeCountAfter = poEvents.filter((e) => e === 'tab-audio-auto-resume').length;

            return {
              paused1,
              stillPausedAt120,
              stillPausedAfterCancel,
              cancelEvents,
              resumedAfterDebounce,
              resumeEvents,
              pausedBeforeHold,
              pausedDuringHold,
              holdTabIds,
              resumedAfterHoldCap,
              holdEndEvents,
              pausedPauseOnly,
              stayStoppedFlag: Boolean(storPauseOnly.pmTabAudioTrigger && storPauseOnly.pmTabAudioTrigger.stayStopped),
              autoPausedAfterPO: bg.tabAudio.isAutoPausedByTabAudio,
              resumeDeltaPO: resumeCountAfter - resumeCountBefore
            };
            """,
            self.server.url_for("/mock/spotify"),
            timeout_ms=15000,
        )
        self.assertTrue(res["paused1"])
        self.assertTrue(res["stillPausedAt120"], "Must NOT resume before 340ms settle debounce")
        self.assertTrue(res["stillPausedAfterCancel"], "Re-audible tab within 340ms must cancel resume")
        self.assertIn("tab-resume-cancelled", res["cancelEvents"])
        self.assertTrue(res["resumedAfterDebounce"], "Must auto-resume after 340ms silence")
        self.assertIn("tab-audio-auto-resume", res["resumeEvents"])
        self.assertTrue(res["pausedBeforeHold"])
        self.assertTrue(res["pausedDuringHold"], "Active silent media must hold pause up to 4200ms")
        self.assertIn(60, res["holdTabIds"])
        self.assertTrue(res["resumedAfterHoldCap"], "Silent-tab hold cap (>4200ms) must expire and resume")
        self.assertIn("tab-hold-expired", res["holdEndEvents"])
        self.assertTrue(res["pausedPauseOnly"])
        self.assertTrue(res["stayStoppedFlag"], "pause-only mode must set stayStopped=true when tab stops")
        self.assertFalse(res["autoPausedAfterPO"])
        self.assertEqual(res["resumeDeltaPO"], 0, "pause-only mode must never log tab-audio-auto-resume")
        self._assert_no_js_errors("test_t2_f17_autoresume_honors_4200ms_hold_and_340ms_settle_debounce")

    def test_t2_f17_rapid_external_tab_mute_close_navigation_cleanup(self) -> None:
        tabs = [
            {"id": 71, "windowId": 1, "active": False, "audible": False, "mutedInfo": {"muted": False}, "url": "https://example.org/a"},
            {"id": 72, "windowId": 1, "active": False, "audible": False, "mutedInfo": {"muted": False}, "url": "https://example.org/b"},
            {"id": 73, "windowId": 1, "active": False, "audible": False, "mutedInfo": {"muted": False}, "url": "https://example.org/c"},
        ]
        self._boot_background_offline(_default_settings(tabAudioBehavior="pause-resume"), tabs=tabs)
        res = self.fx.eval_async_js(
            """
            const bg = window.FoxHubBg;
            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: arguments[0],
              playback: { isPlaying: true, title: 'Cleanup Track', resumeUrl: arguments[0] }
            });

            // 1. Tab 71 becomes audible then navigates
            await window.__webextMock.tabs.triggerUpdated(71, { audible: true }, { audible: true });
            const pausedAfter71 = bg.tabAudio.isAutoPausedByTabAudio;
            await window.__webextMock.tabs.triggerUpdated(
              71,
              { status: 'loading', url: 'https://example.org/other' },
              { audible: false, url: 'https://example.org/other' }
            );
            await bg.checkExternalTabAudioState();

            // 2. Tab 72 becomes audible then immediately muted
            await window.__webextMock.tabs.triggerUpdated(72, { audible: true }, { audible: true });
            await window.__webextMock.tabs.triggerUpdated(72, { mutedInfo: { muted: true } }, { mutedInfo: { muted: true } });

            // 3. Tab 73 becomes audible then immediately closed
            await window.__webextMock.tabs.triggerUpdated(73, { audible: true }, { audible: true });
            await window.__webextMock.tabs.triggerRemoved(73);

            await new Promise((r) => setTimeout(r, 620));
            const diag = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });
            const np = bg.getActiveNowPlayingState();

            return {
              pausedAfter71,
              knownIds: diag?.diagnostics?.tabAudioHoldDown?.knownActiveMediaTabIds || [],
              overrideIds: diag?.diagnostics?.tabAudioHoldDown?.audibleOverrideTabIds || [],
              isAutoPaused: bg.tabAudio.isAutoPausedByTabAudio,
              npPlaying: Boolean(np && np.isPlaying)
            };
            """,
            self.server.url_for("/mock/spotify"),
        )
        self.assertTrue(res["pausedAfter71"])
        self.assertEqual(res["knownIds"], [], f"Stale tab IDs leaked in knownActiveMediaTabIds: {res['knownIds']}")
        self.assertEqual(res["overrideIds"], [], f"Stale tab IDs leaked in audibleOverrideTabIds: {res['overrideIds']}")
        self.assertFalse(res["isAutoPaused"], "Audio must resume after all external tabs navigate/mute/close")
        self.assertTrue(res["npPlaying"], "Spotify nowPlaying.isPlaying must recover to true")
        self._assert_no_js_errors("test_t2_f17_rapid_external_tab_mute_close_navigation_cleanup")

    def test_t2_f17_widevine_and_clear_mse_mirror_plus_offline_fetch_guard(self) -> None:
        tabs = [
            {"id": 80, "windowId": 1, "active": False, "audible": False, "mutedInfo": {"muted": False}, "url": "https://example.com/80"},
        ]
        self._boot_background_offline(_default_settings(tabAudioBehavior="pause-resume"), tabs=tabs)
        res = self.fx.eval_async_js(
            """
            const bg = window.FoxHubBg;
            const bootSyncAt = bg.state.cachedState.lastSyncAt;

            // Clear MSE mirror (YouTube)
            window.__pmHandleSpEmeBridge('youtube', { bridgeType: 'BRIDGE_HELLO' }, 'bg');
            window.__pmHandleSpEmeBridge('youtube', { bridgeType: 'MSE_INIT', msId: 100, mime: 'audio/mp4; codecs="mp4a.40.2"' }, 'bg');
            window.__pmHandleSpEmeBridge(
              'youtube',
              { bridgeType: 'SYNC_TIME', paused: false, currentTime: 12.5, duration: 180, trackTitle: 'Clear Stream', href: 'https://www.youtube.com/watch?v=clear1' },
              'bg'
            );
            const diagClear = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });
            const ytPlayer = diagClear?.diagnostics?.activePlayers?.youtube || null;

            await browser.runtime.sendMessage({ type: 'STOP_SINGLE_BG_AUDIO_APP', appId: 'youtube', clearPlaybackState: true });
            const diagAfterStopYt = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });

            // Enforce tab-audio auto-pause via external tab 80
            await window.__webextMock.tabs.triggerUpdated(80, { audible: true }, { audible: true });
            await new Promise((r) => setTimeout(r, 60));

            // Widevine EME mirror (Spotify) with malformed + valid inputs during enforced auto-pause
            window.__pmHandleSpEmeBridge('spotify', { bridgeType: 'MSE_INIT', msId: 200, mime: 'audio/mp4; codecs="mp4a.40.2"' }, 'bg');
            window.__pmHandleSpEmeBridge('spotify', { bridgeType: 'GEN_REQ', sessionId: 's1', initDataType: 'cenc', initData: null }, 'bg');
            window.__pmHandleSpEmeBridge('spotify', { bridgeType: 'GEN_REQ', sessionId: 's2', initDataType: 'cenc', initData: new Uint8Array([1, 2, 3, 4]) }, 'bg');
            window.__pmHandleSpEmeBridge('spotify', { bridgeType: 'SERVER_CERT', cert: new Uint8Array([9, 8, 7]) }, 'bg');
            window.__pmHandleSpEmeBridge('spotify', { bridgeType: 'LIC_AUTH', url: 'https://127.0.0.1/lic' }, 'bg');
            window.__pmHandleSpEmeBridge('spotify', { bridgeType: 'SYNC_TIME', paused: false, currentTime: 5, duration: 200, trackTitle: 'Widevine Track' }, 'bg');

            const diagEme = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });
            const spPlayer = diagEme?.diagnostics?.activePlayers?.spotify || null;

            await browser.runtime.sendMessage({ type: 'STOP_ALL_BG_AUDIO_APPS' });
            const diagAllStopped = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });

            return {
              bootSyncAt,
              ytPlayer,
              ytRemoved: !diagAfterStopYt?.diagnostics?.activePlayers?.youtube && !(diagAfterStopYt?.diagnostics?.bgAudioPoolIds || []).includes('youtube'),
              spPlayer,
              finalPlayers: Object.keys(diagAllStopped?.diagnostics?.activePlayers || {}),
              finalPool: diagAllStopped?.diagnostics?.bgAudioPoolIds || []
            };
            """
        )
        self.assertGreater(res["bootSyncAt"], 0, "Offline background fetch guard must allow clean Gmail sync boot")
        self.assertIsNotNone(res["ytPlayer"], "Clear MSE mirror must create youtube activePlayer")
        self.assertEqual(res["ytPlayer"].get("sourceType"), "bg")
        self.assertEqual(res["ytPlayer"].get("trackTitle"), "Clear Stream")
        self.assertTrue(res["ytRemoved"], "STOP_SINGLE_BG_AUDIO_APP must clear youtube player")
        self.assertIsNotNone(res["spPlayer"], "Widevine EME mirror must create spotify activePlayer")
        self.assertTrue(res["spPlayer"].get("paused"), "Active tab-audio auto-pause must keep EME videoEl paused")
        self.assertTrue(res["spPlayer"].get("muted"), "Active tab-audio auto-pause must keep EME videoEl muted")
        self.assertEqual(res["finalPlayers"], [], "STOP_ALL_BG_AUDIO_APPS must clear all active players")
        self.assertEqual(res["finalPool"], [], "STOP_ALL_BG_AUDIO_APPS must clear bgAudioPoolIds")
        self._assert_no_js_errors("test_t2_f17_widevine_and_clear_mse_mirror_plus_offline_fetch_guard")

    # ==================================================================
    # R1: Spotify Background-to-Sidebar Song & Position Continuity
    # ==================================================================

    def test_t2_r1_spotify_reopen_no_home_clobber_guarded_promote_and_seek_ack(self) -> None:
        # Part A & B: Real content modules (frame-context, media-mirror, optimizers/spotify, lifecycle-router)
        child_html = (
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            "<script>"
            "window.__t2Errors = [];"
            "window.addEventListener('error', (e) => window.__t2Errors.push(e.message || 'err'));"
            "window.wrappedJSObject = window;"
            "window.exportFunction = function(fn, target, opts) {"
            "  if (opts && opts.defineAs && target) target[opts.defineAs] = fn;"
            "  return fn;"
            "};"
            "window.cloneInto = function(obj) { return obj; };"
            "window.__homeCardClicks = 0;"
            "window.__spToggleClicks = 0;"
            "window.__seektoCalls = [];"
            "window.__progBarClicks = 0;"
            "window.__r1PortMsgs = [];"
            "const origConnect = browser.runtime.connect.bind(browser.runtime);"
            "browser.runtime.connect = function(info) {"
            "  const p = origConnect(info);"
            "  const origPost = p.postMessage.bind(p);"
            "  p.postMessage = function(m) { window.__r1PortMsgs.push(m); return origPost(m); };"
            "  return p;"
            "};"
            "</script></head><body>"
            "<main>"
            "  <div data-testid='shortcut-item'>"
            "    <button id='home-card-play' data-testid='play-button' aria-label='Play Wrong Home Mix'>Play Home</button>"
            "  </div>"
            "</main>"
            "<div id='player-mount'></div>"
            "<script type='module'>"
            "import { initFrameContext } from '/src/content/core/frame-context.js';"
            "import { installMediaMirrorHooks } from '/src/content/core/media-mirror.js';"
            "import { initOptimizer } from '/src/content/optimizers/spotify.js';"
            "import { initLifecycleRouter } from '/src/content/core/lifecycle-router.js';"
            "document.getElementById('home-card-play').addEventListener('click', () => { window.__homeCardClicks++; });"
            "const origHasHost = String.prototype.endsWith;"
            "const ctx = initFrameContext({ cleanWindowName: 'pm-media-frame-spotify', isFoxHubMediaFrame: true, isFoxHubContext: true, isBgAudioFrame: false, isStandbyBgFrame: false });"
            "ctx.host = 'open.spotify.com';"
            "ctx.hasHost = (s) => s === 'spotify.com';"
            "ctx.isMirrorAudioHost = true;"
            "ctx.appMeta = { appId: 'spotify', cssSlug: 'spotify', optimizerFile: 'spotify.js', isKnownBuiltInHost: true };"
            "const opt = initOptimizer(ctx);"
            "installMediaMirrorHooks(ctx, opt);"
            "initLifecycleRouter(ctx, opt);"
            "window.__r1Ctx = ctx;"
            "window.__r1Opt = opt;"
            "window.__r1Done = true;"
            "</script></body></html>"
        )
        child_url = self.server.register_fixture("t2_r1_spotify_child.html", child_html)
        host_html = (
            "<!doctype html><html><head><meta charset='utf-8'><script>"
            "window.__r1ParentMsgs = [];"
            "window.addEventListener('message', (e) => {"
            "  if (e && e.data && e.data.source === 'pocketmail-media-frame') window.__r1ParentMsgs.push(e.data);"
            "});"
            "</script></head><body>"
            f"<iframe id='sp-frame' name='pm-media-frame-spotify' src='{child_url}' style='width:380px;height:600px;'></iframe>"
            "</body></html>"
        )
        host_url = self.server.register_fixture("t2_r1_spotify_host.html", host_html)
        self.server.set_seed({"manifest": self._manifest_dict()})
        self.fx.navigate(host_url)

        part_ab = self.fx.eval_async_js(
            """
            const frame = document.getElementById('sp-frame');
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline) {
              if (frame.contentWindow && frame.contentWindow.__r1Done) break;
              await new Promise((r) => setTimeout(r, 25));
            }
            const cw = frame.contentWindow;
            const cdoc = frame.contentDocument;
            const ctx = cw.__r1Ctx;
            const opt = cw.__r1Opt;

            // 1. Trigger AUTO_RESUME_PLAYBACK BEFORE player bar mounts -> must NOT click Home card!
            cw.__pmHandleMediaFrameCommand({
              target: 'pocketmail-media-frame',
              cmd: 'AUTO_RESUME_PLAYBACK',
              expectedTrackTitle: 'Expected Song',
              expectedTime: 45
            });
            await new Promise((r) => setTimeout(r, 280));
            const homeClicksBeforeMount = cw.__homeCardClicks;

            // 2. Mount player bar with MISMATCHED track ('Wrong Song') and aria-label='Play' -> must NOT click spToggle!
            const mount = cdoc.getElementById('player-mount');
            const titleEl = cdoc.createElement('a');
            titleEl.setAttribute('data-testid', 'context-item-info-title');
            titleEl.textContent = 'Wrong Song';
            const durEl = cdoc.createElement('div');
            durEl.setAttribute('data-testid', 'playback-duration');
            durEl.textContent = '3:33';
            const toggleBtn = cdoc.createElement('button');
            toggleBtn.setAttribute('data-testid', 'control-button-playpause');
            toggleBtn.setAttribute('aria-label', 'Play');
            toggleBtn.addEventListener('click', () => { cw.__spToggleClicks++; });
            mount.appendChild(titleEl);
            mount.appendChild(durEl);
            mount.appendChild(toggleBtn);

            opt.handleSidebarAutoResume();
            await new Promise((r) => setTimeout(r, 120));
            const clicksOnMismatch = cw.__spToggleClicks;
            const takeoverMismatchRes = cw.__pmEnsureSpotifyLocalTakeover(false);

            // 3. Hydrate matching track with aria-label='Pause' (active on BG Connect device) -> must NOT click Play/Pause or Home!
            titleEl.textContent = 'Expected Song';
            toggleBtn.setAttribute('aria-label', 'Pause');
            opt.adjustPlaybackState({ isPlaying: false, currentTime: 0 });
            opt.handleSidebarAutoResume();
            await new Promise((r) => setTimeout(r, 120));
            const clicksOnRemotePlaying = cw.__spToggleClicks;
            const homeClicksFinal = cw.__homeCardClicks;

            // 4. SEEK_ACK accuracy: no seekto and no progBar width > 20 -> executed: false
            cw.__r1PortMsgs.length = 0;
            cw.__pmHandleMediaFrameCommand({ target: 'pocketmail-media-frame', cmd: 'SEEK_SP_MEDIA', currentTime: 45, forceHarmonySeek: true });
            await new Promise((r) => setTimeout(r, 40));
            const ackUnhydrated = cw.__r1PortMsgs.filter((m) => m.bridgeType === 'SEEK_ACK').pop();

            // 5. Add progBar with width 0 (collapsed) -> still executed: false
            const progBar = cdoc.createElement('div');
            progBar.setAttribute('data-testid', 'playback-progressbar');
            progBar.style.width = '0px';
            progBar.style.height = '10px';
            progBar.addEventListener('click', () => { cw.__progBarClicks++; });
            mount.appendChild(progBar);
            cw.__pmHandleMediaFrameCommand({ target: 'pocketmail-media-frame', cmd: 'SEEK_SP_MEDIA', currentTime: 45, forceHarmonySeek: true });
            await new Promise((r) => setTimeout(r, 40));
            const ackZeroWidth = cw.__r1PortMsgs.filter((m) => m.bridgeType === 'SEEK_ACK').pop();

            // 6. Expand progBar width > 20 -> executed: true & click dispatched
            progBar.style.width = '220px';
            cw.__pmHandleMediaFrameCommand({ target: 'pocketmail-media-frame', cmd: 'SEEK_SP_MEDIA', currentTime: 45, forceHarmonySeek: true });
            await new Promise((r) => setTimeout(r, 40));
            const ackProgBar = cw.__r1PortMsgs.filter((m) => m.bridgeType === 'SEEK_ACK').pop();

            // 7. Register mediaSession.seekto -> executed: true & seekto invoked
            cw.navigator.mediaSession.setActionHandler('seekto', (arg) => { cw.__seektoCalls.push(arg); });
            cw.__pmHandleMediaFrameCommand({ target: 'pocketmail-media-frame', cmd: 'SEEK_SP_MEDIA', currentTime: 62, forceHarmonySeek: true });
            await new Promise((r) => setTimeout(r, 40));
            const ackSeekto = cw.__r1PortMsgs.filter((m) => m.bridgeType === 'SEEK_ACK').pop();

            return {
              errs: cw.__t2Errors || [],
              homeClicksBeforeMount,
              clicksOnMismatch,
              takeoverMismatchRes,
              clicksOnRemotePlaying,
              homeClicksFinal,
              ackUnhydrated: ackUnhydrated ? ackUnhydrated.executed : null,
              ackZeroWidth: ackZeroWidth ? ackZeroWidth.executed : null,
              ackProgBar: ackProgBar ? ackProgBar.executed : null,
              progBarClicks: cw.__progBarClicks,
              ackSeekto: ackSeekto ? ackSeekto.executed : null,
              seektoCalls: cw.__seektoCalls
            };
            """
        )
        self.assertEqual(part_ab["errs"], [])
        self.assertEqual(part_ab["homeClicksBeforeMount"], 0, "Must NEVER click Home card before player bar mounts")
        self.assertEqual(part_ab["clicksOnMismatch"], 0, "Must NOT click Play on mismatched track")
        self.assertEqual(part_ab["takeoverMismatchRes"], "track-mismatch")
        self.assertEqual(part_ab["clicksOnRemotePlaying"], 0, "Must NOT click Pause when Connect already shows playing")
        self.assertEqual(part_ab["homeClicksFinal"], 0, "Must NEVER click Home card during reopen takeover")
        self.assertIs(part_ab["ackUnhydrated"], False, "SEEK_ACK must report executed: false when unhydrated")
        self.assertIs(part_ab["ackZeroWidth"], False, "SEEK_ACK must report executed: false when progBar width <= 20")
        self.assertIs(part_ab["ackProgBar"], True, "SEEK_ACK must report executed: true when progBar width > 20")
        self.assertEqual(part_ab["progBarClicks"], 1)
        self.assertIs(part_ab["ackSeekto"], True, "SEEK_ACK must report executed: true when seekto handler exists")
        self.assertEqual(len(part_ab["seektoCalls"]), 1)

        # Part C: Guarded checkAndPromoteStagingSpPlayer & SEEK_ACK retry budget in background engine
        self.fx.reset_to_blank()
        self.server.clear_seed()
        self._boot_background_offline(_default_settings(bgAudioAppIds=["spotify", "youtube", "soundcloud"]))
        sp_url = self.server.url_for("/mock/spotify")
        part_c = self.fx.eval_async_js(
            """
            const spUrl = arguments[0];
            const bg = window.FoxHubBg;
            await browser.runtime.sendMessage({
              type: 'SIDEBAR_CLOSED_HANDOFF',
              activeAppId: 'spotify',
              playingApps: [{ appId: 'spotify', url: spUrl, title: 'Midnight City', isPlaying: true }]
            });
            await bg.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 100, 'bg');
            const activeSp = bg.bgSpEmePlayers.get('spotify');
            activeSp.trackTitle = 'Midnight City';
            activeSp.trackDuration = 244;
            let _paused = false;
            Object.defineProperty(activeSp.videoEl, 'paused', { get: () => _paused, configurable: true });
            Object.defineProperty(activeSp.videoEl, 'currentTime', { get: () => 45, set: () => {}, configurable: true });
            activeSp.videoEl.pause = () => { _paused = true; };
            activeSp.videoEl.play = () => { _paused = false; return Promise.resolve(); };
            activeSp.sb = { buffered: { length: 1, start: () => 0, end: () => 60 } };

            const takeoverRes = await browser.runtime.sendMessage({ type: 'SIDEBAR_SP_TAKEOVER_BEGIN', appId: 'spotify' });
            const stagingSp = bg.bgStagingSpPlayers.get('spotify');
            stagingSp.hasLicense = true;
            stagingSp.licensedAt = Date.now();
            stagingSp.trackTitle = 'Wrong Home Card Song';
            stagingSp.sb = { buffered: { length: 1, start: () => 0, end: () => 10 } };

            // Mismatched track during automatic reopen MUST be blocked!
            window.__pmHandleSpEmeBridge('spotify', {
              bridgeType: 'SYNC_TIME',
              paused: false,
              currentTime: 2,
              trackTitle: 'Wrong Home Card Song'
            }, 'sidebar');
            const blockedActiveTitle = bg.bgSpEmePlayers.get('spotify')?.trackTitle;
            const bgPoolStillAlive = bg.bgAudioPool.has('spotify');

            // Unhydrated SEEK_ACK { executed: false } must not burn seekAttempts
            stagingSp.seekAttempts = 2;
            stagingSp.lastSeekSentAt = Date.now();
            window.__pmHandleSpEmeBridge('spotify', { bridgeType: 'SEEK_ACK', executed: false }, 'sidebar');
            const attemptsAfterFalseAck = stagingSp.seekAttempts;

            // Explicit user play intent in sidebar allows track change promotion
            window.__pmHandleSpEmeBridge('spotify', { bridgeType: 'USER_PLAY_INTENT' }, 'sidebar');
            const afterIntentTitle = bg.bgSpEmePlayers.get('spotify')?.trackTitle;

            // Case/whitespace-normalized track comparison in promoteStagingSpPlayer preserves liveCt
            const promotedActive = bg.bgSpEmePlayers.get('spotify');
            let _p2 = false;
            Object.defineProperty(promotedActive.videoEl, 'paused', { get: () => _p2, configurable: true });
            Object.defineProperty(promotedActive.videoEl, 'currentTime', { get: () => 52, set: () => {}, configurable: true });
            promotedActive.sb = { buffered: { length: 1, start: () => 0, end: () => 70 } };
            await bg.ensureStagingSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 0, 'sidebar');
            const stagingNorm = bg.bgStagingSpPlayers.get('spotify');
            stagingNorm.hasLicense = true;
            stagingNorm.licensedAt = Date.now();
            stagingNorm.trackTitle = '  wrong home card song  ';
            stagingNorm.sb = { buffered: { length: 1, start: () => 0, end: () => 70 } };
            bg.promoteStagingSpPlayer('spotify', true);
            const normTargetTime = bg.bgSpEmePlayers.get('spotify')?.targetTime;

            const diag = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });
            const events = (diag?.diagnostics?.recentEvents || []).map((e) => e.event);
            return {
              takeoverRes,
              blockedActiveTitle,
              bgPoolStillAlive,
              attemptsAfterFalseAck,
              afterIntentTitle,
              normTargetTime,
              events
            };
            """,
            sp_url,
        )
        self.assertTrue(part_c["takeoverRes"].get("resume"))
        self.assertEqual(part_c["takeoverRes"].get("trackTitle"), "Midnight City")
        self.assertIn("urlTrackTitle", part_c["takeoverRes"], "SIDEBAR_SP_TAKEOVER_BEGIN must reuse buildBgTakeoverMeta")
        self.assertEqual(part_c["blockedActiveTitle"], "Midnight City", "Automatic reopen must NOT promote mismatched staging track")
        self.assertTrue(part_c["bgPoolStillAlive"], "Automatic reopen mismatch must NOT kill pm-bg-audio-spotify")
        self.assertEqual(part_c["attemptsAfterFalseAck"], 1, "SEEK_ACK false must refund attempt for retry")
        self.assertEqual(part_c["afterIntentTitle"], "Wrong Home Card Song", "Explicit USER_PLAY_INTENT must allow track switch")
        self.assertEqual(part_c["normTargetTime"], 52, "Normalized track title in promoteStagingSpPlayer must preserve liveCt")
        self.assertIn("block-mismatched-staging-promote", part_c["events"])
        self._assert_no_js_errors("test_t2_r1_spotify_reopen_no_home_clobber_guarded_promote_and_seek_ack")

        # Part D: Verify _spharmony_device_id isolation in bg audio frame vs sidebar frame
        bg_dev_html = (
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            "<script>"
            "window.wrappedJSObject = window;"
            "window.exportFunction = function(fn, target, opts) {"
            "  if (opts && opts.defineAs && target) target[opts.defineAs] = fn;"
            "  return fn;"
            "};"
            "window.cloneInto = function(obj) { return obj; };"
            "</script></head><body>"
            "<script type='module'>"
            "import { initFrameContext } from '/src/content/core/frame-context.js';"
            "import { installMediaMirrorHooks } from '/src/content/core/media-mirror.js';"
            "window.localStorage.setItem('_spharmony_device_id', 'sidebar_dev_123');"
            "const ctx = initFrameContext({ cleanWindowName: 'pm-bg-audio-spotify', isFoxHubMediaFrame: true, isFoxHubContext: true, isBgAudioFrame: true, isStandbyBgFrame: false });"
            "ctx.host = 'open.spotify.com';"
            "ctx.hasHost = (s) => s === 'spotify.com';"
            "ctx.isMirrorAudioHost = true;"
            "installMediaMirrorHooks(ctx, null);"
            "const initialBgRead = window.localStorage.getItem('_spharmony_device_id');"
            "window.localStorage.setItem('_spharmony_device_id', 'bg_dev_456');"
            "const bgAfterWrite = window.localStorage.getItem('_spharmony_device_id');"
            "const bgConnect = window.__pmGetSpotifyConnectState();"
            "const sessionStored = window.sessionStorage.getItem('__pm_bg_spharmony_device_id');"
            "window.__devIsoResult = { initialBgRead, bgAfterWrite, sessionStored, bgConnect };"
            "</script></body></html>"
        )
        bg_dev_url = self.server.register_fixture("t2_r1_bg_dev_iso.html", bg_dev_html)
        self.fx.reset_to_blank()
        self.server.set_seed({"manifest": self._manifest_dict()})
        self.fx.navigate(bg_dev_url)
        iso = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 2000;
            while (Date.now() < deadline && !window.__devIsoResult) {
              await new Promise((r) => setTimeout(r, 25));
            }
            const r = window.__devIsoResult;
            // Read raw localStorage via a fresh non-intercepted Storage or check sessionStorage vs connect state
            return r;
            """
        )
        self.assertIsNotNone(iso)
        self.assertIsNone(iso["initialBgRead"], "BG frame must not inherit sidebar _spharmony_device_id")
        self.assertEqual(iso["bgAfterWrite"], "bg_dev_456")
        self.assertEqual(iso["sessionStored"], "bg_dev_456")
        self.assertEqual(iso["bgConnect"]["deviceId"], "bg_dev_456")
        # Navigate to a clean same-origin page to confirm real localStorage._spharmony_device_id stayed 'sidebar_dev_123'
        clean_url = self.server.register_fixture("t2_r1_clean_ls.html", "<!doctype html><html><body>ok</body></html>")
        self.fx.navigate(clean_url)
        sidebar_ls = self.fx.eval_js("return window.localStorage.getItem('_spharmony_device_id');")
        self.assertEqual(sidebar_ls, "sidebar_dev_123", "BG frame write must NOT clobber sidebar localStorage._spharmony_device_id")

        # Part E: Real Firefox MV2 Addon:Install Xray wrapper boundary verification (distinct window.localStorage vs wrappedJSObject.localStorage)
        xray_child_url = self.server.register_fixture(
            "t2_r1_real_xray_child.html",
            "<!doctype html><html><head><meta charset='utf-8'></head><body>xray-child</body></html>",
        )
        xray_host_url = self.server.register_fixture(
            "t2_r1_real_xray_host.html",
            (
                "<!doctype html><html><head><meta charset='utf-8'></head><body>"
                "<iframe id='sb-sp' name='pm-media-frame-spotify' src='http://open.spotify.com/__test__/fixture/t2_r1_real_xray_child.html'></iframe>"
                "<iframe id='bg-sp' name='pm-bg-audio-spotify' src='http://open.spotify.com/__test__/fixture/t2_r1_real_xray_child.html'></iframe>"
                "</body></html>"
            ),
        )
        self.assertIsNotNone(xray_child_url)
        self.assertIsNotNone(xray_host_url)
        self.fx.reset_to_blank()
        addon_id = None
        try:
            install_res = self.fx.client.call("Addon:Install", {"path": str(REPO_ROOT), "temporary": True})
            addon_id = (
                (install_res.get("value") or install_res.get("id"))
                if isinstance(install_res, dict)
                else install_res
            )
            self.assertTrue(addon_id, f"Addon:Install failed: {install_res!r}")

            self.fx._set_context("chrome")
            try:
                self.fx.client.call(
                    "WebDriver:ExecuteScript",
                    {
                        "script": (
                            "const port = arguments[0];\n"
                            "const pac = 'data:text/javascript,' + encodeURIComponent(\n"
                            "  'function FindProxyForURL(url, host) { return host === \"open.spotify.com\" ? \"PROXY 127.0.0.1:' + port + '\" : \"DIRECT\"; }'\n"
                            ");\n"
                            "Services.prefs.setIntPref('network.proxy.type', 2);\n"
                            "Services.prefs.setCharPref('network.proxy.autoconfig_url', pac);"
                        ),
                        "args": [int(self.server.port)],
                    },
                )
            finally:
                self.fx._set_context("content")

            self.fx.navigate("http://open.spotify.com/__test__/fixture/t2_r1_real_xray_host.html")
            xray_probe = self.fx.eval_async_js(
                """
                const sb = document.getElementById('sb-sp');
                const bg = document.getElementById('bg-sp');
                const deadline = Date.now() + 5000;
                while (Date.now() < deadline) {
                  const sbReady = Boolean(sb?.contentWindow?.__pmSpHookInstalled);
                  const bgReady = Boolean(bg?.contentWindow?.__pmSpHookInstalled);
                  if (sbReady && bgReady) break;
                  await new Promise((r) => setTimeout(r, 30));
                }
                const sbWin = sb.contentWindow;
                const bgWin = bg.contentWindow;
                if (!sbWin.__pmSpHookInstalled || !bgWin.__pmSpHookInstalled) {
                  return { ready: false, sbHook: Boolean(sbWin.__pmSpHookInstalled), bgHook: Boolean(bgWin.__pmSpHookInstalled) };
                }

                sbWin.localStorage.setItem('_spharmony_device_id', 'sidebar_real_dev_001');
                sbWin.localStorage.setItem('normal_sp_key', 'keep_normal_val');

                const bgInitialRead = bgWin.localStorage.getItem('_spharmony_device_id');
                const bgNormalRead = bgWin.localStorage.getItem('normal_sp_key');
                bgWin.localStorage.setItem('_spharmony_device_id', 'bg_real_dev_999');
                const bgSessionStored = bgWin.sessionStorage.getItem('__pm_bg_spharmony_device_id');
                const bgReadAfterWrite = bgWin.localStorage.getItem('_spharmony_device_id');
                const bgConnect = bgWin.__pmGetSpotifyConnectState();
                const sbAfterBgWrite = sbWin.localStorage.getItem('_spharmony_device_id');

                bgWin.localStorage.removeItem('_spharmony_device_id');
                const bgAfterRemove = bgWin.localStorage.getItem('_spharmony_device_id');
                const sbAfterBgRemove = sbWin.localStorage.getItem('_spharmony_device_id');

                return {
                  ready: true,
                  bgInitialRead,
                  bgNormalRead,
                  bgSessionStored,
                  bgReadAfterWrite,
                  bgConnectDeviceId: bgConnect ? bgConnect.deviceId : null,
                  sbAfterBgWrite,
                  bgAfterRemove,
                  sbAfterBgRemove
                };
                """,
                timeout_ms=10000,
            )
            self.assertTrue(xray_probe.get("ready"), f"Real MV2 content script failed to install hooks: {xray_probe}")
            self.assertIsNone(xray_probe["bgInitialRead"], "Real Xray: BG frame must not read sidebar _spharmony_device_id")
            self.assertEqual(xray_probe["bgNormalRead"], "keep_normal_val", "Real Xray: non-isolated keys must pass through")
            self.assertEqual(xray_probe["bgSessionStored"], "bg_real_dev_999")
            self.assertEqual(xray_probe["bgReadAfterWrite"], "bg_real_dev_999")
            self.assertEqual(xray_probe["bgConnectDeviceId"], "bg_real_dev_999")
            self.assertEqual(xray_probe["sbAfterBgWrite"], "sidebar_real_dev_001")
            self.assertIsNone(xray_probe["bgAfterRemove"])
            self.assertEqual(xray_probe["sbAfterBgRemove"], "sidebar_real_dev_001", "Real Xray: BG removeItem must not delete sidebar _spharmony_device_id")
        finally:
            try:
                self.fx.navigate("about:blank")
            except Exception:
                pass
            try:
                self.fx._set_context("chrome")
                self.fx.client.call(
                    "WebDriver:ExecuteScript",
                    {
                        "script": (
                            "Services.prefs.clearUserPref('network.proxy.type');\n"
                            "Services.prefs.clearUserPref('network.proxy.autoconfig_url');"
                        ),
                        "args": [],
                    },
                )
            except Exception:
                pass
            finally:
                self.fx._set_context("content")
            if addon_id:
                try:
                    self.fx.client.call("Addon:Uninstall", {"id": addon_id})
                except Exception:
                    pass


if __name__ == "__main__":
    unittest.main()
