"""Tier 1 happy-path tests for F8 (Left-Rail Indicator & Quick Controls), F10 (Mini Now Playing Bar), and F17 (v2.7.9 Stability Preservation)."""

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
            "soundcloud",
        ],
        "customMediaApps": custom_apps or [],
        "persistenceMode": "selected",
        "persistentAppIds": ["spotify", "soundcloud"],
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
                        "snippet": "Inbox check.",
                        "fullText": "Inbox body.",
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
            "TOGGLE_NOW_PLAYING_COMMAND": {"ok": True},
        }
    return seed


class TestT1MediaRail(unittest.TestCase):
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

    def _open_popup_ready(
        self,
        path: str = "/src/popup/popup.html?sidebar=1",
        width: int = 380,
        height: int = 680,
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
                if (
                  document.readyState === 'complete' &&
                  window.FoxHubPopup &&
                  rail &&
                  actions &&
                  rail.children.length > 0
                ) {
                  return { ok: true };
                }
                await new Promise((r) => setTimeout(r, 40));
              }
              return { ok: false, reason: 'Popup shell did not finish initial render' };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(ready["ok"], msg=ready.get("reason", ""))

    def _emit_bg_audio_status(
        self,
        audible_app_id: str | None,
        now_playing: dict | None,
        is_auto_paused: bool = False,
    ) -> None:
        res = self.fx.eval_async_js(
            """
            try {
              browser.runtime.onMessage._fire({
                type: 'BG_AUDIO_STATUS_CHANGED',
                audibleAppId: arguments[0],
                isAutoPausedByTabAudio: Boolean(arguments[2]),
                nowPlaying: arguments[1]
              });
              await new Promise((r) => setTimeout(r, 40));
              return { ok: true };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """,
            audible_app_id,
            now_playing,
            is_auto_paused,
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))

    def _probe_visible(self, selector: str) -> dict:
        res = self.fx.eval_js(
            """
            const el = document.querySelector(arguments[0]);
            if (!el) return { ok: false, reason: 'Missing element: ' + arguments[0] };
            const cs = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const visible = (
              !el.classList.contains('hidden') &&
              cs.display !== 'none' &&
              cs.visibility !== 'hidden' &&
              Number(cs.opacity) !== 0 &&
              r.width > 0 &&
              r.height > 0
            );
            return {
              ok: visible,
              reason: visible ? '' : ('Element not visible: ' + arguments[0] + ' rect=' + JSON.stringify(r))
            };
            """,
            selector,
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        return res

    def _boot_background_offline(
        self,
        settings_overrides: dict | None = None,
        tabs: list[dict] | None = None,
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
            "t1_mr_fetch_guard.js",
            OFFLINE_FETCH_GUARD_JS,
            content_type="application/javascript; charset=utf-8",
        )
        trap_url = self.server.register_fixture(
            "t1_mr_err_trap.js",
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
        bg_url = self.server.register_fixture("t1_mr_bg_offline.html", html)

        seed = _make_seed(settings_overrides=settings_overrides, with_message_responses=False)
        seed["manifest"] = self._read_manifest()
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
                  typeof window.__pmGetAudioDiagnostics === 'function'
                ) {
                  return { ok: true };
                }
                await new Promise((r) => setTimeout(r, 40));
              }
              return { ok: false, reason: 'Background did not finish offline boot within timeout' };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(boot["ok"], msg=boot.get("reason", ""))

    # ------------------------------------------------------------------
    # F8: Left-Rail Playing Indicator & Quick Controls (6 tests)
    # ------------------------------------------------------------------
    def test_t1_f8_equalizer_badge_renders_on_playing_music_rail_icon(self) -> None:
        self._open_popup_ready()
        self._emit_bg_audio_status(
            "spotify",
            {
                "appId": "spotify",
                "isPlaying": True,
                "muted": False,
                "title": "Midnight City",
                "artist": "M83",
                "currentTime": 42,
                "duration": 244,
                "canPrev": True,
                "canNext": True,
            },
        )

        probe = self.fx.eval_js(
            """
            const btn = document.querySelector('#pm-rail-apps-list [data-app-id="spotify"]');
            if (!btn) return { ok: false, reason: 'Spotify rail button missing' };
            const badge = btn.querySelector('.pm-rail-eq-badge');
            const bars = badge ? badge.querySelectorAll('.pm-rail-eq-bar') : [];
            const rect = badge ? badge.getBoundingClientRect() : null;
            return {
              ok: true,
              hasPlayingClass: btn.classList.contains('is-playing-audio'),
              hasBadge: Boolean(badge),
              barCount: bars.length,
              badgeWidth: rect ? rect.width : 0,
              badgeHeight: rect ? rect.height : 0
            };
            """
        )
        self.assertTrue(probe["ok"], msg=probe.get("reason", ""))
        self.assertTrue(probe["hasPlayingClass"], "Spotify rail item must get .is-playing-audio")
        self.assertTrue(probe["hasBadge"], "Spotify rail item must contain .pm-rail-eq-badge")
        self.assertEqual(probe["barCount"], 3, "Equalizer badge must render 3 animated bars")
        self.assertGreater(probe["badgeWidth"], 0)
        self.assertGreater(probe["badgeHeight"], 0)
        self._assert_no_js_errors("F8 equalizer badge render")

    def test_t1_f8_hover_tooltip_shows_track_title_and_artist_and_updates(self) -> None:
        self._open_popup_ready()
        self._emit_bg_audio_status(
            "spotify",
            {
                "appId": "spotify",
                "isPlaying": True,
                "muted": False,
                "title": "Midnight City",
                "artist": "M83",
                "currentTime": 18,
                "duration": 244,
            },
        )

        first = self.fx.eval_js(
            """
            const sp = document.querySelector('#pm-rail-apps-list [data-app-id="spotify"]');
            return sp ? { ok: true, title: sp.title || '', hasPlaying: sp.classList.contains('is-playing-audio') } : { ok: false };
            """
        )
        self.assertTrue(first["ok"])
        self.assertTrue(first["hasPlaying"])
        self.assertIn("Spotify", first["title"])
        self.assertIn("Midnight City", first["title"])
        self.assertIn("M83", first["title"])

        self._emit_bg_audio_status(
            None,
            {
                "appId": "spotify",
                "isPlaying": False,
                "muted": False,
                "title": "Midnight City",
                "artist": "M83",
                "currentTime": 18,
                "duration": 244,
            },
        )
        self._emit_bg_audio_status(
            "soundcloud",
            {
                "appId": "soundcloud",
                "isPlaying": True,
                "muted": False,
                "title": "Sunset Synth",
                "artist": "Neon Waves",
                "currentTime": 12,
                "duration": 180,
            },
        )

        second = self.fx.eval_js(
            """
            const sp = document.querySelector('#pm-rail-apps-list [data-app-id="spotify"]');
            const sc = document.querySelector('#pm-rail-apps-list [data-app-id="soundcloud"]');
            return {
              spPlaying: sp ? sp.classList.contains('is-playing-audio') : null,
              spTitle: sp ? sp.title : '',
              scPlaying: sc ? sc.classList.contains('is-playing-audio') : null,
              scTitle: sc ? sc.title : ''
            };
            """
        )
        self.assertFalse(second["spPlaying"], "Spotify indicator should clear when SoundCloud becomes active")
        self.assertTrue(second["scPlaying"], "SoundCloud should gain .is-playing-audio")
        self.assertIn("SoundCloud", second["scTitle"])
        self.assertIn("Sunset Synth", second["scTitle"])
        self.assertIn("Neon Waves", second["scTitle"])
        self._assert_no_js_errors("F8 hover tooltip update")

    def test_t1_f8_click_equalizer_badge_toggles_play_pause_without_opening_app(self) -> None:
        self._open_popup_ready()
        self._emit_bg_audio_status(
            "spotify",
            {
                "appId": "spotify",
                "isPlaying": True,
                "muted": False,
                "title": "Midnight City",
                "artist": "M83",
                "currentTime": 30,
                "duration": 200,
            },
        )
        badge_sel = '#pm-rail-apps-list [data-app-id="spotify"] .pm-rail-eq-badge'
        self._probe_visible(badge_sel)
        self.fx.eval_js(
            "document.querySelector(arguments[0]).scrollIntoView({ block: 'center' });",
            badge_sel,
        )
        mock_helpers.clear_calls(self.fx)
        self.fx.click(badge_sel)

        after = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 60));
              const calls = window.__webextMock.getCalls('runtime.sendMessage');
              const cmd = calls.find((c) => c.args && c.args[0] && c.args[0].type === 'TOGGLE_NOW_PLAYING_COMMAND');
              const mailList = document.getElementById('pm-email-list');
              const mediaWs = document.getElementById('pm-media-workspace');
              return {
                ok: true,
                cmd: cmd ? cmd.args[0] : null,
                mailVisible: Boolean(mailList && window.getComputedStyle(mailList).display !== 'none' && !mailList.closest('.hidden')),
                workspaceHidden: Boolean(!mediaWs || mediaWs.classList.contains('hidden') || mediaWs.classList.contains('pm-workspace-keepalive')),
                wsClass: mediaWs ? mediaWs.className : '',
                activeApp: window.FoxHubPopup?.state?.activeRailAppId || ''
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(after["ok"], msg=after.get("reason", ""))
        self.assertIsNotNone(after["cmd"], "Clicking equalizer badge must send TOGGLE_NOW_PLAYING_COMMAND")
        self.assertEqual(after["cmd"].get("appId"), "spotify")
        self.assertEqual(after["cmd"].get("command"), "play_pause")
        self.assertTrue(after["mailVisible"], "Email list should stay visible when clicking equalizer badge")
        self.assertTrue(
            after["workspaceHidden"],
            f"Media workspace must not open when clicking equalizer badge (wsClass={after['wsClass']!r}, activeApp={after['activeApp']!r})",
        )
        self.assertEqual(after["activeApp"], "pocketmail", "Active rail app must stay on pocketmail")
        self._assert_no_js_errors("F8 equalizer badge quick click")

    def test_t1_f8_middle_click_play_pause_and_shift_middle_click_mute_on_rail_icon(self) -> None:
        self._open_popup_ready()
        self._emit_bg_audio_status(
            "spotify",
            {
                "appId": "spotify",
                "isPlaying": True,
                "muted": False,
                "title": "Midnight City",
                "artist": "M83",
                "currentTime": 35,
                "duration": 200,
            },
        )
        btn_sel = '#pm-rail-apps-list [data-app-id="spotify"]'
        self._probe_visible(btn_sel)
        self.fx.eval_js("document.querySelector(arguments[0]).scrollIntoView({ block: 'center' });", btn_sel)

        mock_helpers.clear_calls(self.fx)
        self.fx.middle_click(btn_sel)

        mid_res = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 60));
              const calls = window.__webextMock.getCalls('runtime.sendMessage');
              const cmd = calls.find((c) => c.args && c.args[0] && c.args[0].type === 'TOGGLE_NOW_PLAYING_COMMAND');
              return { ok: true, cmd: cmd ? cmd.args[0] : null };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(mid_res["ok"], msg=mid_res.get("reason", ""))
        self.assertIsNotNone(mid_res["cmd"], "Middle-click on active music icon must send TOGGLE_NOW_PLAYING_COMMAND")
        self.assertEqual(mid_res["cmd"].get("appId"), "spotify")
        self.assertEqual(mid_res["cmd"].get("command"), "play_pause")

        mock_helpers.clear_calls(self.fx)
        shift_res = self.fx.eval_async_js(
            """
            try {
              const btn = document.querySelector(arguments[0]);
              if (!btn) return { ok: false, reason: 'Spotify rail button missing' };
              btn.dispatchEvent(new MouseEvent('auxclick', { button: 1, shiftKey: true, bubbles: true, cancelable: true }));
              await new Promise((r) => setTimeout(r, 60));
              const calls = window.__webextMock.getCalls('runtime.sendMessage');
              const cmd = calls.find((c) => c.args && c.args[0] && c.args[0].type === 'TOGGLE_NOW_PLAYING_COMMAND');
              return { ok: true, cmd: cmd ? cmd.args[0] : null };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """,
            btn_sel,
        )
        self.assertTrue(shift_res["ok"], msg=shift_res.get("reason", ""))
        self.assertIsNotNone(shift_res["cmd"], "Shift+Middle-click must send mute_toggle command")
        self.assertEqual(shift_res["cmd"].get("appId"), "spotify")
        self.assertEqual(shift_res["cmd"].get("command"), "mute_toggle")

        self._emit_bg_audio_status(
            "spotify",
            {
                "appId": "spotify",
                "isPlaying": True,
                "muted": True,
                "title": "Midnight City",
                "artist": "M83",
                "currentTime": 36,
                "duration": 200,
            },
        )
        muted_probe = self.fx.eval_js(
            """
            const btn = document.querySelector(arguments[0]);
            const bar = btn ? btn.querySelector('.pm-rail-eq-bar') : null;
            return {
              hasMutedClass: Boolean(btn && btn.classList.contains('is-playing-muted')),
              animState: bar ? window.getComputedStyle(bar).animationPlayState : null
            };
            """,
            btn_sel,
        )
        self.assertTrue(muted_probe["hasMutedClass"], "Muted music app must gain .is-playing-muted")
        self.assertEqual(muted_probe["animState"], "paused")
        self._assert_no_js_errors("F8 middle-click and mute state")

    def test_t1_f8_rail_context_menu_quick_pause_and_mute_controls(self) -> None:
        self._open_popup_ready()
        self._emit_bg_audio_status(
            "spotify",
            {
                "appId": "spotify",
                "isPlaying": True,
                "muted": False,
                "title": "Midnight City",
                "artist": "M83",
                "currentTime": 40,
                "duration": 200,
            },
        )
        btn_sel = '#pm-rail-apps-list [data-app-id="spotify"]'
        self._probe_visible(btn_sel)

        menu_probe = self.fx.eval_async_js(
            r"""
            try {
              const btn = document.querySelector(arguments[0]);
              const r = btn.getBoundingClientRect();
              btn.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true, cancelable: true, button: 2, clientX: r.left + 8, clientY: r.top + 8
              }));
              btn.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true, cancelable: true, button: 2, clientX: r.left + 8, clientY: r.top + 8
              }));
              await new Promise((r) => setTimeout(r, 40));
              const menu = document.getElementById('pm-rail-context-menu');
              if (!menu || menu.classList.contains('hidden')) {
                return { ok: false, reason: 'Rail context menu did not open' };
              }
              const items = Array.from(menu.querySelectorAll('button, [role="menuitem"], .pm-rail-ctx-item'));
              const muteBtn = items.find((el) => /mute/i.test(el.textContent || ''));
              const pauseBtn = items.find((el) => /pause audio|play \/ resume/i.test(el.textContent || ''));
              if (!muteBtn || !pauseBtn) {
                return { ok: false, reason: 'Missing pause or mute item in rail context menu: ' + items.map((i) => i.textContent).join(', ') };
              }
              muteBtn.setAttribute('data-t1-ctx-mute', '1');
              return { ok: true, itemTexts: items.map((i) => (i.textContent || '').trim()) };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """,
            btn_sel,
        )
        self.assertTrue(menu_probe["ok"], msg=menu_probe.get("reason", ""))
        self._probe_visible('[data-t1-ctx-mute="1"]')

        mock_helpers.clear_calls(self.fx)
        self.fx.click('[data-t1-ctx-mute="1"]')

        mute_cmd = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 50));
              const calls = window.__webextMock.getCalls('runtime.sendMessage');
              const cmd = calls.find((c) => c.args && c.args[0] && c.args[0].type === 'TOGGLE_NOW_PLAYING_COMMAND');
              return { ok: true, cmd: cmd ? cmd.args[0] : null };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(mute_cmd["ok"], msg=mute_cmd.get("reason", ""))
        self.assertIsNotNone(mute_cmd["cmd"])
        self.assertEqual(mute_cmd["cmd"].get("command"), "mute_toggle")

        reopen = self.fx.eval_async_js(
            r"""
            try {
              const btn = document.querySelector(arguments[0]);
              const r = btn.getBoundingClientRect();
              btn.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true, cancelable: true, button: 2, clientX: r.left + 8, clientY: r.top + 8
              }));
              btn.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true, cancelable: true, button: 2, clientX: r.left + 8, clientY: r.top + 8
              }));
              await new Promise((r) => setTimeout(r, 40));
              const menu = document.getElementById('pm-rail-context-menu');
              const items = menu ? Array.from(menu.querySelectorAll('button, [role="menuitem"], .pm-rail-ctx-item')) : [];
              const pauseBtn = items.find((el) => /pause audio|play \/ resume/i.test(el.textContent || ''));
              if (!pauseBtn) return { ok: false, reason: 'Pause Audio item missing on reopen' };
              pauseBtn.setAttribute('data-t1-ctx-pause', '1');
              return { ok: true };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """,
            btn_sel,
        )
        self.assertTrue(reopen["ok"], msg=reopen.get("reason", ""))
        self._probe_visible('[data-t1-ctx-pause="1"]')
        mock_helpers.clear_calls(self.fx)
        self.fx.click('[data-t1-ctx-pause="1"]')

        pause_cmd = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 50));
              const calls = window.__webextMock.getCalls('runtime.sendMessage');
              const cmd = calls.find((c) => c.args && c.args[0] && c.args[0].type === 'TOGGLE_NOW_PLAYING_COMMAND');
              return { ok: true, cmd: cmd ? cmd.args[0] : null };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(pause_cmd["ok"], msg=pause_cmd.get("reason", ""))
        self.assertIsNotNone(pause_cmd["cmd"])
        self.assertEqual(pause_cmd["cmd"].get("command"), "play_pause")
        self._assert_no_js_errors("F8 rail context menu quick controls")

    def test_t1_f8_popup_mode_open_sidebar_button_mirrors_playing_indicator(self) -> None:
        self._open_popup_ready(path="/src/popup/popup.html", width=560, height=580)
        self._emit_bg_audio_status(
            "spotify",
            {
                "appId": "spotify",
                "isPlaying": True,
                "muted": False,
                "title": "Midnight City",
                "artist": "M83",
                "currentTime": 25,
                "duration": 200,
            },
        )
        self._probe_visible("#rail-btn-open-sidebar")
        probe = self.fx.eval_js(
            """
            const btn = document.getElementById('rail-btn-open-sidebar');
            const badge = btn ? btn.querySelector('.pm-rail-eq-badge') : null;
            return {
              hasPlayingClass: Boolean(btn && btn.classList.contains('is-playing-audio')),
              hasBadge: Boolean(badge),
              title: btn ? (btn.title || '') : ''
            };
            """
        )
        self.assertTrue(probe["hasPlayingClass"], "Popup #rail-btn-open-sidebar must get .is-playing-audio")
        self.assertTrue(probe["hasBadge"], "Popup #rail-btn-open-sidebar must render .pm-rail-eq-badge")
        self.assertIn("Audio playing in Left Sidebar", probe["title"])
        self._assert_no_js_errors("F8 popup open-sidebar indicator")

    # ------------------------------------------------------------------
    # F10: Mini "Now Playing" Bar (6 tests)
    # ------------------------------------------------------------------
    def test_t1_f10_bar_visible_on_gmail_and_social_app_during_background_playback(self) -> None:
        self._open_popup_ready()
        self._emit_bg_audio_status(
            "spotify",
            {
                "appId": "spotify",
                "isPlaying": True,
                "muted": False,
                "title": "Midnight City",
                "artist": "M83",
                "currentTime": 45,
                "duration": 244,
                "canPrev": True,
                "canNext": True,
            },
        )

        self._probe_visible("#pm-mini-now-playing")
        gmail_probe = self.fx.eval_js(
            """
            return {
              title: (document.getElementById('pm-np-title') || {}).textContent || '',
              artist: (document.getElementById('pm-np-artist') || {}).textContent || ''
            };
            """
        )
        self.assertEqual(gmail_probe["title"].strip(), "Midnight City")
        self.assertEqual(gmail_probe["artist"].strip(), "M83")

        ig_sel = '#pm-rail-apps-list [data-app-id="instagram"]'
        self._probe_visible(ig_sel)
        self.fx.click(ig_sel)

        social_probe = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 80));
              const ws = document.getElementById('pm-media-workspace');
              const np = document.getElementById('pm-mini-now-playing');
              const r = np ? np.getBoundingClientRect() : null;
              return {
                ok: true,
                wsVisible: Boolean(ws && !ws.classList.contains('hidden')),
                npVisible: Boolean(np && !np.classList.contains('hidden') && r && r.width > 0 && r.height > 0),
                title: (document.getElementById('pm-np-title') || {}).textContent || ''
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(social_probe["ok"], msg=social_probe.get("reason", ""))
        self.assertTrue(social_probe["wsVisible"], "Instagram workspace should open")
        self.assertTrue(social_probe["npVisible"], "Mini Now Playing bar must remain visible on Instagram")
        self.assertEqual(social_probe["title"].strip(), "Midnight City")
        self._assert_no_js_errors("F10 bar visible on gmail and social app")

    def test_t1_f10_play_pause_prev_next_buttons_dispatch_commands(self) -> None:
        self._open_popup_ready()
        self._emit_bg_audio_status(
            "spotify",
            {
                "appId": "spotify",
                "isPlaying": True,
                "muted": False,
                "title": "Midnight City",
                "artist": "M83",
                "currentTime": 42,
                "duration": 244,
                "canPrev": True,
                "canNext": True,
            },
        )
        self._probe_visible("#pm-mini-now-playing")
        for btn_id in ("#pm-np-prev", "#pm-np-playpause", "#pm-np-next"):
            self._probe_visible(btn_id)

        state_before = self.fx.eval_js(
            "return document.getElementById('pm-np-playpause')?.dataset?.iconState || '';"
        )
        self.assertEqual(state_before, "pause")

        mock_helpers.clear_calls(self.fx)
        self.fx.click("#pm-np-prev")
        self.fx.click("#pm-np-next")
        self.fx.click("#pm-np-playpause")

        sent = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 80));
              const calls = window.__webextMock.getCalls('runtime.sendMessage');
              const cmds = calls
                .filter((c) => c.args && c.args[0] && c.args[0].type === 'TOGGLE_NOW_PLAYING_COMMAND')
                .map((c) => c.args[0]);
              return { ok: true, cmds };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(sent["ok"], msg=sent.get("reason", ""))
        self.assertEqual(
            [(c.get("appId"), c.get("command")) for c in sent["cmds"]],
            [("spotify", "prev"), ("spotify", "next"), ("spotify", "play_pause")],
        )
        self._assert_no_js_errors("F10 play/pause/prev/next buttons")

    def test_t1_f10_jump_to_player_opens_music_app_and_hides_bar(self) -> None:
        self._open_popup_ready()
        self._emit_bg_audio_status(
            "soundcloud",
            {
                "appId": "soundcloud",
                "isPlaying": True,
                "muted": False,
                "title": "Sunset Synth",
                "artist": "Neon Waves",
                "currentTime": 20,
                "duration": 180,
                "canPrev": True,
                "canNext": True,
            },
        )
        self._probe_visible("#pm-np-jump")
        self.fx.click("#pm-np-jump")

        after = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 100));
              const scBtn = document.querySelector('#pm-rail-apps-list [data-app-id="soundcloud"]');
              const ws = document.getElementById('pm-media-workspace');
              const np = document.getElementById('pm-mini-now-playing');
              return {
                ok: true,
                scActive: Boolean(scBtn && scBtn.classList.contains('active')),
                wsVisible: Boolean(ws && !ws.classList.contains('hidden')),
                npHidden: Boolean(np && np.classList.contains('hidden'))
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(after["ok"], msg=after.get("reason", ""))
        self.assertTrue(after["scActive"], "SoundCloud rail icon must become active after jump click")
        self.assertTrue(after["wsVisible"], "Media workspace must open after jump click")
        self.assertTrue(after["npHidden"], "Mini Now Playing bar should auto-hide while actively viewing player")
        self._assert_no_js_errors("F10 jump to player")

    def test_t1_f10_progress_bar_reflects_track_progress_and_show_progress_setting(self) -> None:
        seed = _make_seed({"miniNowPlayingShowProgress": True})
        self._open_popup_ready(seed=seed)
        self._emit_bg_audio_status(
            "spotify",
            {
                "appId": "spotify",
                "isPlaying": True,
                "muted": False,
                "title": "Midnight City",
                "artist": "M83",
                "currentTime": 60,
                "duration": 240,
            },
        )
        self._probe_visible("#pm-np-progress-track")
        width_str = self.fx.eval_js(
            "return document.getElementById('pm-np-progress-fill')?.style?.width || '';"
        )
        self.assertTrue(width_str.endswith("%"), f"Expected percentage width, got {width_str!r}")
        pct = float(width_str[:-1])
        self.assertGreaterEqual(pct, 24.0)
        self.assertLessEqual(pct, 26.5)

        updated_settings = dict(seed["storage"]["settings"], miniNowPlayingShowProgress=False)
        res = self.fx.eval_async_js(
            """
            try {
              browser.runtime.onMessage._fire({
                type: 'STATE_UPDATED',
                state: arguments[0],
                settings: arguments[1]
              });
              await new Promise((r) => setTimeout(r, 60));
              const track = document.getElementById('pm-np-progress-track');
              return { ok: true, hidden: Boolean(track && track.classList.contains('hidden')) };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """,
            seed["messageResponses"]["GET_STATE"]["state"],
            updated_settings,
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertTrue(res["hidden"], "Progress track should hide when miniNowPlayingShowProgress is false")
        self._assert_no_js_errors("F10 progress setting")

    def test_t1_f10_position_top_vs_bottom_and_compact_mode_settings(self) -> None:
        seed = _make_seed({"miniNowPlayingPosition": "bottom", "miniNowPlayingCompact": False})
        self._open_popup_ready(seed=seed)
        self._emit_bg_audio_status(
            "spotify",
            {
                "appId": "spotify",
                "isPlaying": True,
                "muted": False,
                "title": "Midnight City",
                "artist": "M83",
                "currentTime": 20,
                "duration": 200,
            },
        )
        self._probe_visible("#pm-mini-now-playing")
        bottom_probe = self.fx.eval_js(
            """
            const root = document.getElementById('pm-app-root');
            const bar = document.getElementById('pm-mini-now-playing');
            const header = document.querySelector('.pm-header');
            return {
              pos: root ? root.getAttribute('data-np-position') : null,
              compact: Boolean(bar && bar.classList.contains('is-compact')),
              barTop: bar ? bar.getBoundingClientRect().top : 0,
              headerBottom: header ? header.getBoundingClientRect().bottom : 0
            };
            """
        )
        self.assertEqual(bottom_probe["pos"], "bottom")
        self.assertFalse(bottom_probe["compact"])
        self.assertGreater(bottom_probe["barTop"], bottom_probe["headerBottom"])

        updated = dict(
            seed["storage"]["settings"],
            miniNowPlayingPosition="top",
            miniNowPlayingCompact=True,
        )
        top_probe = self.fx.eval_async_js(
            """
            try {
              browser.runtime.onMessage._fire({
                type: 'STATE_UPDATED',
                state: arguments[0],
                settings: arguments[1]
              });
              await new Promise((r) => setTimeout(r, 60));
              const root = document.getElementById('pm-app-root');
              const bar = document.getElementById('pm-mini-now-playing');
              const list = document.getElementById('pm-email-list');
              return {
                ok: true,
                pos: root ? root.getAttribute('data-np-position') : null,
                compact: Boolean(bar && bar.classList.contains('is-compact')),
                barTop: bar ? bar.getBoundingClientRect().top : 0,
                listTop: list ? list.getBoundingClientRect().top : 0
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """,
            seed["messageResponses"]["GET_STATE"]["state"],
            updated,
        )
        self.assertTrue(top_probe["ok"], msg=top_probe.get("reason", ""))
        self.assertEqual(top_probe["pos"], "top")
        self.assertTrue(top_probe["compact"])
        self.assertLess(top_probe["barTop"], top_probe["listTop"])
        self._assert_no_js_errors("F10 top/bottom and compact settings")

    def test_t1_f10_autohide_paused_setting_controls_paused_visibility(self) -> None:
        seed = _make_seed({"miniNowPlayingAutoHidePaused": True})
        self._open_popup_ready(seed=seed)
        self._emit_bg_audio_status(
            None,
            {
                "appId": "spotify",
                "isPlaying": False,
                "muted": False,
                "title": "Paused Track",
                "artist": "M83",
                "currentTime": 15,
                "duration": 200,
            },
        )
        hidden_when_paused = self.fx.eval_js(
            "return document.getElementById('pm-mini-now-playing')?.classList.contains('hidden');"
        )
        self.assertTrue(hidden_when_paused, "Paused track must hide bar when miniNowPlayingAutoHidePaused=true")

        updated = dict(seed["storage"]["settings"], miniNowPlayingAutoHidePaused=False)
        shown = self.fx.eval_async_js(
            """
            try {
              browser.runtime.onMessage._fire({
                type: 'STATE_UPDATED',
                state: arguments[0],
                settings: arguments[1]
              });
              await new Promise((r) => setTimeout(r, 60));
              const bar = document.getElementById('pm-mini-now-playing');
              const title = document.getElementById('pm-np-title');
              const btn = document.getElementById('pm-np-playpause');
              return {
                ok: true,
                hidden: Boolean(!bar || bar.classList.contains('hidden')),
                title: title ? title.textContent : '',
                iconState: btn ? (btn.dataset.iconState || '') : ''
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """,
            seed["messageResponses"]["GET_STATE"]["state"],
            updated,
        )
        self.assertTrue(shown["ok"], msg=shown.get("reason", ""))
        self.assertFalse(shown["hidden"], "Bar must appear when miniNowPlayingAutoHidePaused=false")
        self.assertEqual(shown["title"].strip(), "Paused Track")
        self.assertEqual(shown["iconState"], "play")
        self._assert_no_js_errors("F10 autohide paused setting")

    # ------------------------------------------------------------------
    # F17: v2.7.9 Stability Preservation: Keep-alive & Tab Audio (6 tests)
    # ------------------------------------------------------------------
    def test_t1_f17_spotify_and_soundcloud_keepalive_handoff_on_sidebar_close(self) -> None:
        self._boot_background_offline(
            settings_overrides={
                "persistenceMode": "eco",
                "keepAudioPlayingWhenClosed": True,
                "bgAudioAppIds": ["spotify", "youtube", "soundcloud"],
            }
        )
        sp_url = self.server.url_for("/mock/spotify?playing=1")
        sc_url = self.server.url_for("/mock/soundcloud?playing=1")

        res = self.fx.eval_async_js(
            """
            try {
              const bg = window.FoxHubBg;
              const alarm = await browser.alarms.get('foxhub-audio-keepalive');
              const hasKeepaliveCtx = Boolean(bg.state.bgWebAudioKeepaliveCtx);

              const port = browser.runtime.connect({ name: 'foxhub-sidebar-lifecycle' });
              await browser.runtime.sendMessage({
                type: 'UPDATE_PERSISTENT_SESSION',
                activeAppId: 'spotify',
                openPersistentAppIds: ['spotify'],
                appId: 'spotify',
                url: arguments[0],
                playback: { isPlaying: true, title: 'Midnight City', resumeUrl: arguments[0] }
              });
              port.disconnect();
              await new Promise((r) => setTimeout(r, 40));

              const spHandoff = await browser.runtime.sendMessage({
                type: 'SIDEBAR_CLOSED_HANDOFF',
                activeAppId: 'pocketmail',
                playingApps: [{ appId: 'spotify', url: arguments[0], title: 'Midnight City', isPlaying: true }]
              });
              const spPoolHas = bg.bgAudioPool.has('spotify');
              const spStopped = await browser.runtime.sendMessage({ type: 'STOP_BG_AUDIO_HANDOFF' });

              await browser.runtime.sendMessage({
                type: 'UPDATE_PERSISTENT_SESSION',
                activeAppId: 'soundcloud',
                openPersistentAppIds: ['soundcloud'],
                appId: 'soundcloud',
                url: arguments[1],
                playback: { isPlaying: true, title: 'Sunset Synth', resumeUrl: arguments[1] }
              });
              const scHandoff = await browser.runtime.sendMessage({
                type: 'SIDEBAR_CLOSED_HANDOFF',
                activeAppId: 'pocketmail',
                playingApps: [{ appId: 'soundcloud', url: arguments[1], title: 'Sunset Synth', isPlaying: true }]
              });
              const scPoolHas = bg.bgAudioPool.has('soundcloud');
              const scStopped = await browser.runtime.sendMessage({ type: 'STOP_BG_AUDIO_HANDOFF' });

              return {
                ok: true,
                hasAlarm: Boolean(alarm && alarm.name === 'foxhub-audio-keepalive'),
                hasKeepaliveCtx,
                spHandoff,
                spPoolHas,
                spStopped,
                scHandoff,
                scPoolHas,
                scStopped
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """,
            sp_url,
            sc_url,
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertTrue(res["hasAlarm"], "foxhub-audio-keepalive alarm must be registered")
        self.assertTrue(res["hasKeepaliveCtx"], "Silent WebAudio keep-alive context must be created")
        self.assertTrue(res["spHandoff"].get("ok"))
        self.assertTrue(res["spPoolHas"], "Spotify must spawn in bgAudioPool on sidebar close")
        self.assertTrue(
            any(a.get("appId") == "spotify" for a in (res["spStopped"].get("activeBgApps") or [])),
            "STOP_BG_AUDIO_HANDOFF must report active spotify app",
        )
        self.assertTrue(res["scHandoff"].get("ok"))
        self.assertTrue(res["scPoolHas"], "SoundCloud must spawn in bgAudioPool on sidebar close")
        self.assertTrue(
            any(a.get("appId") == "soundcloud" for a in (res["scStopped"].get("activeBgApps") or [])),
            "STOP_BG_AUDIO_HANDOFF must report active soundcloud app",
        )
        self._assert_no_js_errors("F17 spotify and soundcloud keepalive handoff")

    def test_t1_f17_widevine_eme_and_clear_mse_mirror_plus_diagnostics(self) -> None:
        self._boot_background_offline()

        res = self.fx.eval_async_js(
            """
            try {
              const bg = window.FoxHubBg;
              const port = browser.runtime.connect({ name: 'foxhub-sidebar-lifecycle' });
              await new Promise((r) => setTimeout(r, 30));
              await bg.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 1, 'sidebar');
              const sp = bg.bgSpEmePlayers.get('spotify');
              if (sp && sp.videoEl) {
                Object.defineProperty(sp.videoEl, 'paused', { value: false, writable: true, configurable: true });
                sp.videoEl.play = () => Promise.resolve();
                sp.videoEl.pause = () => {};
              }
              window.__pmHandleSpEmeBridge(
                'spotify',
                {
                  bridgeType: 'SYNC_TIME',
                  currentTime: 24,
                  paused: false,
                  trackTitle: 'Midnight City',
                  duration: 244
                },
                'sidebar'
              );
              window.__pmHandleSpEmeBridge(
                'spotify',
                {
                  bridgeType: 'VOLUME',
                  volume: 0.7,
                  muted: false
                },
                'sidebar'
              );
              await browser.runtime.sendMessage({
                type: 'UPDATE_PERSISTENT_SESSION',
                appId: 'spotify',
                url: 'https://open.spotify.com/track/1',
                playback: { isPlaying: true, title: 'Midnight City', artist: 'M83', currentTime: 24, duration: 244 }
              });

              window.__pmHandleSpEmeBridge(
                'youtube',
                {
                  bridgeType: 'MSE_INIT',
                  mime: 'audio/mp4; codecs="mp4a.40.2"',
                  msId: 2,
                  href: 'https://www.youtube.com/watch?v=test123'
                },
                'sidebar'
              );
              await new Promise((r) => setTimeout(r, 40));
              const yt = bg.bgSpEmePlayers.get('youtube');
              if (yt && yt.videoEl) {
                Object.defineProperty(yt.videoEl, 'paused', { value: false, writable: true, configurable: true });
                yt.videoEl.play = () => Promise.resolve();
                yt.videoEl.pause = () => {};
              }
              window.__pmHandleSpEmeBridge(
                'youtube',
                {
                  bridgeType: 'SYNC_TIME',
                  currentTime: 10,
                  paused: false,
                  trackTitle: 'Lofi Beats',
                  duration: 180,
                  href: 'https://www.youtube.com/watch?v=test123'
                },
                'sidebar'
              );

              const diagRes = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });
              const np = bg.getActiveNowPlayingState();
              return {
                ok: true,
                hasSp: bg.bgSpEmePlayers.has('spotify'),
                hasYt: bg.bgSpEmePlayers.has('youtube'),
                ytIsClear: Boolean(yt && yt.isClear),
                np,
                diagRes
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertTrue(res["hasSp"], "Spotify EME player entry must exist")
        self.assertTrue(res["hasYt"], "YouTube clear MSE player entry must exist")
        self.assertTrue(res["ytIsClear"], "YouTube entry must be flagged isClear=true")
        self.assertIsNotNone(res["np"], "getActiveNowPlayingState must return active metadata")
        diag = res["diagRes"].get("diagnostics", {})
        self.assertIn("activePlayers", diag)
        self.assertIn("keepalive", diag)
        self._assert_no_js_errors("F17 widevine/clear MSE mirror + diagnostics")

    def test_t1_f17_spurious_pause_suppression_keeps_spotify_playing(self) -> None:
        self._boot_background_offline()

        res = self.fx.eval_async_js(
            """
            try {
              const bg = window.FoxHubBg;
              const port = browser.runtime.connect({ name: 'foxhub-sidebar-lifecycle' });
              await new Promise((r) => setTimeout(r, 30));
              await bg.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 1, 'sidebar');
              const sp = bg.bgSpEmePlayers.get('spotify');
              let pausedState = false;
              Object.defineProperty(sp.videoEl, 'paused', {
                get: () => pausedState,
                configurable: true
              });
              Object.defineProperty(sp.videoEl, 'currentTime', {
                get: () => 5,
                set: () => {},
                configurable: true
              });
              sp.videoEl.play = () => { pausedState = false; return Promise.resolve(); };
              sp.videoEl.pause = () => { pausedState = true; };
              sp.sb = {
                buffered: {
                  length: 1,
                  start: () => 0,
                  end: () => 30
                }
              };
              sp.remotePaused = false;
              sp.explicitUserPause = false;

              window.__pmHandleSpEmeBridge(
                'spotify',
                {
                  bridgeType: 'SYNC_TIME',
                  currentTime: 5,
                  paused: true,
                  explicitPause: false,
                  autoPausedByTab: false,
                  spUiStillPlaying: true
                },
                'sidebar'
              );

              const diag = window.__pmGetAudioDiagnostics();
              return {
                ok: true,
                videoPaused: sp.videoEl.paused,
                remotePaused: sp.remotePaused,
                events: (diag && diag.recentEvents ? diag.recentEvents : []).map((e) => e.event || e.type || e.name || '')
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(res["ok"], msg=res.get("reason", ""))
        self.assertFalse(res["videoPaused"], "Spurious non-explicit pause must not pause Spotify mirror videoEl")
        self.assertFalse(res["remotePaused"], "Spurious pause must not mark sp.remotePaused=true")
        self.assertIn("ignore-transient-harmony-pause", res["events"])
        self._assert_no_js_errors("F17 spurious pause suppression")

    def test_t1_f17_tab_media_watcher_reports_normal_tab_audio_and_answers_check(self) -> None:
        fixture_html = (
            "<!doctype html><html><head><meta charset='utf-8'><title>Normal Tab Media</title>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            "<script src='/src/content/tab-media-watcher.js'></script>"
            "</head><body>"
            "<video id='tab-video'></video>"
            "<button id='btn-toggle-media' type='button'>Toggle</button>"
            "<script>"
            "(function(){"
            "  var v = document.getElementById('tab-video');"
            "  var playing = false;"
            "  Object.defineProperty(v, 'paused', { get: function(){ return !playing; }, configurable: true });"
            "  Object.defineProperty(v, 'mozHasAudio', { get: function(){ return true; }, configurable: true });"
            "  Object.defineProperty(v, 'duration', { get: function(){ return 120; }, configurable: true });"
            "  v.play = function(){ playing = true; v.dispatchEvent(new Event('play')); v.dispatchEvent(new Event('playing')); return Promise.resolve(); };"
            "  v.pause = function(){ playing = false; v.dispatchEvent(new Event('pause')); };"
            "  document.getElementById('btn-toggle-media').addEventListener('click', function(){"
            "    if (playing) v.pause(); else v.play().catch(function(){});"
            "  });"
            "})();"
            "</script></body></html>"
        )
        fixture_url = self.server.register_fixture("t1_f17_normal_tab.html", fixture_html)
        self.server.set_seed({})
        self.fx.navigate(fixture_url)
        self._install_error_trap()

        self._probe_visible("#btn-toggle-media")
        mock_helpers.clear_calls(self.fx)
        self.fx.click("#btn-toggle-media")

        playing_res = self.fx.eval_async_js(
            """
            try {
              const deadline = Date.now() + 2000;
              let sawPlaying = false;
              while (Date.now() < deadline) {
                const calls = window.__webextMock.getCalls('runtime.sendMessage');
                if (calls.some((c) => c.args && c.args[0] && c.args[0].type === 'EXTERNAL_TAB_MEDIA_PLAYING')) {
                  sawPlaying = true;
                  break;
                }
                await new Promise((r) => setTimeout(r, 30));
              }
              const check = await browser.runtime.sendMessage({ type: 'CHECK_TAB_HAS_ACTIVE_MEDIA' });
              return { ok: true, sawPlaying, check };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(playing_res["ok"], msg=playing_res.get("reason", ""))
        self.assertTrue(playing_res["sawPlaying"], "Playing video must emit EXTERNAL_TAB_MEDIA_PLAYING")
        self.assertEqual(playing_res["check"], {"hasActiveMedia": True})

        mock_helpers.clear_calls(self.fx)
        self.fx.click("#btn-toggle-media")

        stopped_res = self.fx.eval_async_js(
            """
            try {
              const deadline = Date.now() + 2000;
              let sawStopped = false;
              while (Date.now() < deadline) {
                const calls = window.__webextMock.getCalls('runtime.sendMessage');
                if (calls.some((c) => c.args && c.args[0] && c.args[0].type === 'EXTERNAL_TAB_MEDIA_STOPPED')) {
                  sawStopped = true;
                  break;
                }
                await new Promise((r) => setTimeout(r, 30));
              }
              const checkAfter = await browser.runtime.sendMessage({ type: 'CHECK_TAB_HAS_ACTIVE_MEDIA' });
              return { ok: true, sawStopped, checkAfter };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(stopped_res["ok"], msg=stopped_res.get("reason", ""))
        self.assertTrue(stopped_res["sawStopped"], "Pausing video must emit EXTERNAL_TAB_MEDIA_STOPPED")
        self.assertFalse(bool(stopped_res["checkAfter"] and stopped_res["checkAfter"].get("hasActiveMedia")))
        self._assert_no_js_errors("F17 tab-media-watcher normal tab audio")

    def test_t1_f17_external_tab_audio_autopauses_and_autoresumes_after_340ms(self) -> None:
        tabs = [
            {
                "id": 101,
                "windowId": 1,
                "active": True,
                "audible": False,
                "mutedInfo": {"muted": False},
                "url": "https://example.com/video",
                "title": "External Video",
            }
        ]
        self._boot_background_offline(
            settings_overrides={"tabAudioBehavior": "pause-resume", "autoPauseOnTabAudio": True},
            tabs=tabs,
        )

        setup_sp = self.fx.eval_async_js(
            """
            try {
              const bg = window.FoxHubBg;
              const port = browser.runtime.connect({ name: 'foxhub-sidebar-lifecycle' });
              await new Promise((r) => setTimeout(r, 30));
              await bg.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 1, 'sidebar');
              const sp = bg.bgSpEmePlayers.get('spotify');
              let pausedState = false;
              let mutedState = false;
              Object.defineProperty(sp.videoEl, 'paused', {
                get: () => pausedState,
                configurable: true
              });
              Object.defineProperty(sp.videoEl, 'muted', {
                get: () => mutedState,
                set: (v) => { mutedState = Boolean(v); },
                configurable: true
              });
              sp.videoEl.play = () => { pausedState = false; return Promise.resolve(); };
              sp.videoEl.pause = () => { pausedState = true; };
              sp.remotePaused = false;
              sp.explicitUserPause = false;
              await browser.runtime.sendMessage({
                type: 'UPDATE_PERSISTENT_SESSION',
                appId: 'spotify',
                url: 'https://open.spotify.com/track/1',
                playback: { isPlaying: true, title: 'Track 1', resumeUrl: 'https://open.spotify.com/track/1' }
              });
              return { ok: true };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(setup_sp["ok"], msg=setup_sp.get("reason", ""))

        mock_helpers.trigger_tab_updated(self.fx, 101, {"audible": True}, {"audible": True})
        paused_probe = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 120));
              const bg = window.FoxHubBg;
              const sp = bg.bgSpEmePlayers.get('spotify');
              const stored = await browser.storage.local.get('pmTabAudioTrigger');
              return {
                ok: true,
                isAutoPaused: Boolean(bg.tabAudio.isAutoPausedByTabAudio),
                videoPaused: Boolean(sp && sp.videoEl.paused),
                videoMuted: Boolean(sp && sp.videoEl.muted),
                trigger: stored.pmTabAudioTrigger || null
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(paused_probe["ok"], msg=paused_probe.get("reason", ""))
        self.assertTrue(paused_probe["isAutoPaused"])
        self.assertTrue(paused_probe["videoPaused"])
        self.assertTrue(paused_probe["videoMuted"])
        self.assertTrue(bool(paused_probe["trigger"] and paused_probe["trigger"].get("active")))

        mock_helpers.trigger_tab_updated(self.fx, 101, {"audible": False}, {"audible": False})
        resumed_probe = self.fx.eval_async_js(
            """
            try {
              const deadline = Date.now() + 1800;
              const bg = window.FoxHubBg;
              while (Date.now() < deadline) {
                if (!bg.tabAudio.isAutoPausedByTabAudio) break;
                await new Promise((r) => setTimeout(r, 40));
              }
              const sp = bg.bgSpEmePlayers.get('spotify');
              const diag = window.__pmGetAudioDiagnostics();
              return {
                ok: true,
                isAutoPaused: Boolean(bg.tabAudio.isAutoPausedByTabAudio),
                videoPaused: Boolean(sp && sp.videoEl.paused),
                videoMuted: Boolean(sp && sp.videoEl.muted),
                events: (diag && diag.recentEvents ? diag.recentEvents : []).map((e) => e.event || e.type || e.name || '')
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(resumed_probe["ok"], msg=resumed_probe.get("reason", ""))
        self.assertFalse(resumed_probe["isAutoPaused"], "Spotify must auto-resume after 340ms tab stop settle")
        self.assertFalse(resumed_probe["videoPaused"])
        self.assertFalse(resumed_probe["videoMuted"])
        self.assertIn("tab-audio-auto-pause", resumed_probe["events"])
        self.assertIn("tab-audio-auto-resume", resumed_probe["events"])
        self._assert_no_js_errors("F17 external tab auto-pause and auto-resume")

    def test_t1_f17_pause_only_mode_manual_override_and_wasapi_drain_ignore(self) -> None:
        tabs = [
            {
                "id": 102,
                "windowId": 1,
                "active": True,
                "audible": False,
                "mutedInfo": {"muted": False},
                "url": "https://example.com/stream",
                "title": "Stream Tab",
            }
        ]
        self._boot_background_offline(
            settings_overrides={"tabAudioBehavior": "pause-only", "autoPauseOnTabAudio": True},
            tabs=tabs,
        )

        setup_b = self.fx.eval_async_js(
            """
            try {
              const bg = window.FoxHubBg;
              const port = browser.runtime.connect({ name: 'foxhub-sidebar-lifecycle' });
              await new Promise((r) => setTimeout(r, 30));
              await bg.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 1, 'sidebar');
              const sp = bg.bgSpEmePlayers.get('spotify');
              window.__t1SpState = { paused: false, muted: false };
              Object.defineProperty(sp.videoEl, 'paused', {
                get: () => window.__t1SpState.paused,
                configurable: true
              });
              Object.defineProperty(sp.videoEl, 'muted', {
                get: () => window.__t1SpState.muted,
                set: (v) => { window.__t1SpState.muted = Boolean(v); },
                configurable: true
              });
              sp.videoEl.play = () => { window.__t1SpState.paused = false; return Promise.resolve(); };
              sp.videoEl.pause = () => { window.__t1SpState.paused = true; };
              sp.remotePaused = false;
              sp.explicitUserPause = false;
              await browser.runtime.sendMessage({
                type: 'UPDATE_PERSISTENT_SESSION',
                appId: 'spotify',
                url: 'https://open.spotify.com/track/2',
                playback: { isPlaying: true, title: 'Track 2', resumeUrl: 'https://open.spotify.com/track/2' }
              });
              return { ok: true };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(setup_b["ok"], msg=setup_b.get("reason", ""))

        # Part A: pause-only keeps Spotify stopped after tab stops
        mock_helpers.trigger_tab_updated(self.fx, 102, {"audible": True}, {"audible": True})
        self.fx.eval_async_js("await new Promise((r) => setTimeout(r, 120));")
        mock_helpers.trigger_tab_updated(self.fx, 102, {"audible": False}, {"audible": False})
        part_a = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 480));
              const bg = window.FoxHubBg;
              const sp = bg.bgSpEmePlayers.get('spotify');
              return {
                ok: true,
                isAutoPaused: Boolean(bg.tabAudio.isAutoPausedByTabAudio),
                videoPaused: Boolean(sp && sp.videoEl.paused)
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(part_a["ok"], msg=part_a.get("reason", ""))
        self.assertFalse(part_a["isAutoPaused"])
        self.assertTrue(part_a["videoPaused"], "pause-only mode must keep Spotify paused after tab stops")

        # Part B: switch to pause-resume, test manual override while tab audible + WASAPI drain ignore
        prep_b = self.fx.eval_async_js(
            """
            try {
              await browser.runtime.sendMessage({
                type: 'UPDATE_SETTINGS',
                settings: { tabAudioBehavior: 'pause-resume', autoPauseOnTabAudio: true }
              });
              const sp = window.FoxHubBg.bgSpEmePlayers.get('spotify');
              sp.explicitUserPause = false;
              sp.remotePaused = false;
              await sp.videoEl.play();
              return { ok: true };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(prep_b["ok"], msg=prep_b.get("reason", ""))

        mock_helpers.trigger_tab_updated(self.fx, 102, {"audible": True}, {"audible": True})
        override_res = self.fx.eval_async_js(
            """
            try {
              await new Promise((r) => setTimeout(r, 120));
              const bg = window.FoxHubBg;
              const pausedFirst = Boolean(bg.tabAudio.isAutoPausedByTabAudio);
              await browser.runtime.sendMessage({
                type: 'TOGGLE_NOW_PLAYING_COMMAND',
                appId: 'spotify',
                command: 'play_pause'
              });
              await new Promise((r) => setTimeout(r, 60));
              const sp = bg.bgSpEmePlayers.get('spotify');
              const diag = window.__pmGetAudioDiagnostics();
              return {
                ok: true,
                pausedFirst,
                manualOverride: Boolean(bg.tabAudio.manualOverrideWhileTabAudible),
                videoPausedAfterOverride: Boolean(sp && sp.videoEl.paused),
                events: (diag && diag.recentEvents ? diag.recentEvents : []).map((e) => e.event || e.type || e.name || '')
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(override_res["ok"], msg=override_res.get("reason", ""))
        self.assertTrue(override_res["pausedFirst"])
        self.assertTrue(override_res["manualOverride"])
        self.assertFalse(override_res["videoPausedAfterOverride"])
        self.assertIn("tab-manual-override", override_res["events"])

        # WASAPI drain window (< 20s): tab emits EXTERNAL_TAB_MEDIA_STOPPED and responds falsy to CHECK_TAB_HAS_ACTIVE_MEDIA while tab.audible stays true
        mock_helpers.set_tab_message_result(self.fx, 102, None)
        drain_res = self.fx.eval_async_js(
            """
            try {
              const bg = window.FoxHubBg;
              bg.tabAudio.manualOverrideWhileTabAudible = false;
              bg.tabAudio.audibleOverrideTabIds.clear();
              browser.runtime.onMessage._fire(
                { type: 'EXTERNAL_TAB_MEDIA_STOPPED' },
                { tab: { id: 102, windowId: 1, url: 'https://example.com/stream', audible: true } }
              );
              await new Promise((r) => setTimeout(r, 60));
              await bg.checkExternalTabAudioState();
              await new Promise((r) => setTimeout(r, 60));
              const sp = bg.bgSpEmePlayers.get('spotify');
              const diag = window.__pmGetAudioDiagnostics();
              return {
                ok: true,
                videoPausedDuringDrain: Boolean(sp && sp.videoEl.paused),
                events: (diag && diag.recentEvents ? diag.recentEvents : []).map((e) => e.event || e.type || e.name || '')
              };
            } catch (err) {
              return { ok: false, reason: String(err) };
            }
            """
        )
        self.assertTrue(drain_res["ok"], msg=drain_res.get("reason", ""))
        self.assertFalse(drain_res["videoPausedDuringDrain"], "Stale audible during 20s WASAPI drain must not re-pause Spotify")
        self.assertIn("tab-audible-drain-ignored", drain_res["events"])
        self._assert_no_js_errors("F17 pause-only, manual override, and WASAPI drain")


if __name__ == "__main__":
    unittest.main()
