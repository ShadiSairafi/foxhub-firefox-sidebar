"""Tier 2 boundary, corner, and negative tests for Unified Settings, Fluent Settings UI, and Header Declutter (F5, F6, F7)."""

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

from tests.lib.amo_lint import lint_extension
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


def _default_get_state_seed() -> dict[str, Any]:
    return {
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
        "settings": {
            "theme": "warm-linen",
            "enabledMediaApps": ["instagram", "whatsapp", "spotify", "youtube"],
            "customMediaApps": [],
            "miniNowPlayingEnabled": True,
            "contextMenuEnabled": True,
            "quickSwitcherEnabled": True,
            "railPlayingIndicatorEnabled": True,
            "railQuickControlsEnabled": True,
        },
        "snoozed": {},
    }


class TestT2SettingsUI(unittest.TestCase):
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
        self.fx.reset_to_blank()
        seed_state = _default_get_state_seed()
        self.server.set_seed(
            {
                "storage": {"settings": seed_state["settings"]},
                "messageResponses": {
                    "GET_STATE": seed_state,
                    "UPDATE_SETTINGS": {"ok": True, "settings": seed_state["settings"]},
                    "GET_AUDIO_DIAGNOSTICS": {
                        "ok": True,
                        "diagnostics": {
                            "version": "2.8.0",
                            "generatedAt": "2026-11-19T16:00:00.000Z",
                            "audibleAppId": None,
                            "bgAudioPoolIds": [],
                            "recentEvents": [],
                        },
                    },
                    "CLEAR_AUDIO_DIAGNOSTICS": {
                        "ok": True,
                        "diagnostics": {"version": "2.8.0", "recentEvents": []},
                    },
                    "GET_KEYBOARD_SHORTCUTS": {
                        "ok": True,
                        "commands": [],
                        "globalShortcuts": {
                            "popup": "Alt+Shift+F",
                            "sidebar": "Alt+Shift+M",
                            "popout": "Alt+Shift+W",
                        },
                        "appShortcuts": {},
                        "appShortcutOpenMode": "sidebar",
                        "quickSwitcherEnabled": True,
                        "quickSwitcherShortcut": "Ctrl+K",
                    },
                },
            }
        )

    # ------------------------------------------------------------------
    # Defensive Helpers
    # ------------------------------------------------------------------

    def _install_error_trap(self) -> None:
        self.fx.eval_js(ERROR_TRAP_SNIPPET)

    def _assert_no_js_errors(self, context: str) -> None:
        errs = self.fx.eval_js("return Array.isArray(window.__t2Errors) ? window.__t2Errors : [];")
        self.assertEqual(errs, [], f"Uncaught JS errors in {context}: {errs}")

    def _load_schema_harness(self) -> None:
        schema_path = REPO_ROOT / "src" / "shared" / "settings-schema.js"
        self.assertTrue(schema_path.is_file(), f"Missing unified schema module: {schema_path}")
        url = self.server.register_fixture(
            "t2_schema_harness.html",
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            "<script src='/src/shared/settings-schema.js'></script>"
            "</head><body><div>Schema Harness</div></body></html>",
        )
        self.fx.navigate(url)
        self._install_error_trap()
        has_schema = self.fx.eval_js(
            "return Boolean(window.FoxHubSettingsSchema && typeof window.FoxHubSettingsSchema.normalizeSettings === 'function');"
        )
        self.assertTrue(has_schema, "window.FoxHubSettingsSchema.normalizeSettings must be defined")

    def _open_popup_settings(self, width: int = 440, height: int = 700) -> dict[str, Any]:
        self.fx.navigate(self.server.url_for("/src/popup/popup.html?sidebar=1"))
        self.fx.set_viewport(width, height)
        self._install_error_trap()
        info = self.fx.eval_async_js(
            """
            await new Promise((r) => setTimeout(r, 140));
            const settingsTrigger =
              document.getElementById('rail-btn-sidebar-settings') ||
              document.getElementById('btn-open-full-settings-drawer') ||
              document.getElementById('btn-settings');
            if (settingsTrigger) {
              settingsTrigger.click();
              await new Promise((r) => setTimeout(r, 80));
            }
            const fullBtn = document.getElementById('btn-open-full-settings-drawer');
            if (fullBtn && !fullBtn.classList.contains('hidden')) {
              const drawer = document.getElementById('pm-media-apps-drawer');
              if (drawer && !drawer.querySelector('#fh-settings-search, [data-settings-search], #pm-unified-settings-root, #opt-unified-settings-root, #fh-settings-root, .fh-settings-root, [data-settings-root]')) {
                fullBtn.click();
                await new Promise((r) => setTimeout(r, 80));
              }
            }
            const searchEl = document.querySelector(
              '#fh-settings-search, [data-settings-search], input[type="search"][data-settings-filter], .fh-settings-search input, #pm-media-apps-drawer input[type="search"]'
            );
            const rootEl = document.querySelector(
              '#pm-unified-settings-root, #opt-unified-settings-root, #fh-settings-root, .fh-settings-root, [data-settings-root]'
            );
            return {
              hasUnifiedUiGlobal: Boolean(window.FoxHubSettingsUI),
              hasRoot: Boolean(rootEl),
              hasSearch: Boolean(searchEl)
            };
            """
        )
        return info if isinstance(info, dict) else {}

    def _open_options_page(self, width: int = 1200, height: int = 800) -> dict[str, Any]:
        self.fx.navigate(self.server.url_for("/src/options/options.html"))
        self.fx.set_viewport(width, height)
        self._install_error_trap()
        info = self.fx.eval_async_js(
            """
            await new Promise((r) => setTimeout(r, 140));
            const searchEl = document.querySelector(
              '#fh-settings-search, [data-settings-search], input[type="search"][data-settings-filter], .fh-settings-search input, .opt-main input[type="search"]'
            );
            const rootEl = document.querySelector(
              '#pm-unified-settings-root, #opt-unified-settings-root, #fh-settings-root, .fh-settings-root, [data-settings-root]'
            );
            return {
              hasUnifiedUiGlobal: Boolean(window.FoxHubSettingsUI),
              hasRoot: Boolean(rootEl),
              hasSearch: Boolean(searchEl)
            };
            """
        )
        return info if isinstance(info, dict) else {}

    def _find_unified_search_selector(self) -> str | None:
        sel = self.fx.eval_js(
            """
            const candidates = [
              '#fh-settings-search',
              '[data-settings-search]',
              'input[type="search"][data-settings-filter]',
              '.fh-settings-search input',
              '#pm-media-apps-drawer input[type="search"]',
              '.opt-main input[type="search"]'
            ];
            for (const c of candidates) {
              const el = document.querySelector(c);
              if (el) {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) return c;
              }
            }
            return null;
            """
        )
        return sel if isinstance(sel, str) else None

    def _find_more_menu_button_selector(self) -> str | None:
        sel = self.fx.eval_js(
            """
            const actions = document.querySelector('.pm-header-actions');
            if (!actions) return null;
            const candidates = [
              '.pm-header-actions #btn-header-more',
              '.pm-header-actions .pm-header-more-btn',
              '.pm-header-actions button[aria-haspopup="menu"]',
              '.pm-header-actions button[data-more-menu]',
              '.pm-header-actions button[aria-label*="More" i]',
              '.pm-header-actions button[title*="More" i]'
            ];
            for (const c of candidates) {
              const el = document.querySelector(c);
              if (el) return c;
            }
            const btns = Array.from(actions.querySelectorAll('button'));
            for (let i = 0; i < btns.length; i++) {
              const txt = (btns[i].textContent || '').trim();
              if (txt === '⋯' || txt === '...' || txt === '⋮') {
                btns[i].setAttribute('data-t2-more-trigger', '1');
                return '.pm-header-actions button[data-t2-more-trigger="1"]';
              }
            }
            return null;
            """
        )
        return sel if isinstance(sel, str) else None

    # ==================================================================
    # F5: Unified Settings Source of Truth & Cleanup (6 tests)
    # ==================================================================

    def test_t2_f5_normalize_null_undefined_primitives_and_prototype_pollution(self) -> None:
        self._load_schema_harness()
        res = self.fx.eval_js(
            """
            const S = window.FoxHubSettingsSchema;
            const badInputs = [null, undefined, [], '', 42, true];
            const badResults = badInputs.map((v) => S.normalizeSettings(v));
            const defKeys = Object.keys(S.DEFAULT_SETTINGS).sort();

            // Mutating returned array must not mutate DEFAULT_SETTINGS
            badResults[0].enabledMediaApps.push('injected_test');
            const defaultAppsUntouched = !S.DEFAULT_SETTINGS.enabledMediaApps.includes('injected_test');

            // Prototype pollution attempt via JSON.parse
            const evilPayload = JSON.parse(
              '{"__proto__":{"polluted":"yes"},"constructor":{"polluted2":"yes"},"prototype":{"polluted3":"yes"},"unknownFoo":123,"theme":"true-night"}'
            );
            const normEvil = S.normalizeSettings(evilPayload);
            const importUnknown = S.validateImportPayload({ theme: 'true-night', unknownFoo: 123 });
            const patchEvil = JSON.parse('{"__proto__":{"pollutedPatch":true}}');
            const cur = S.normalizeSettings({ theme: 'warm-linen' });
            const afterPatch = S.normalizeSettingsPatch(patchEvil, cur);

            return {
              allKeysMatch: badResults.every((r) => JSON.stringify(Object.keys(r).sort()) === JSON.stringify(defKeys)),
              defaultAppsUntouched,
              polluted: ({}).polluted,
              polluted2: Object.prototype.polluted2,
              polluted3: Object.prototype.polluted3,
              pollutedPatch: ({}).pollutedPatch,
              normEvilTheme: normEvil.theme,
              importOk: Boolean(importUnknown && importUnknown.ok),
              importHasUnknownFoo: Boolean(
                importUnknown && importUnknown.settings &&
                Object.prototype.hasOwnProperty.call(importUnknown.settings, 'unknownFoo')
              ),
              hasOwnProto: Object.prototype.hasOwnProperty.call(normEvil, '__proto__'),
              hasOwnCtor: Object.prototype.hasOwnProperty.call(normEvil, 'constructor'),
              hasOwnPrototype: Object.prototype.hasOwnProperty.call(normEvil, 'prototype'),
              afterPatchTheme: afterPatch.theme
            };
            """
        )
        self.assertTrue(res["allKeysMatch"], "Non-object inputs must return full DEFAULT_SETTINGS shape")
        self.assertTrue(res["defaultAppsUntouched"], "Mutating normalized array must not mutate DEFAULT_SETTINGS")
        self.assertIsNone(res["polluted"])
        self.assertIsNone(res["polluted2"])
        self.assertIsNone(res["polluted3"])
        self.assertIsNone(res["pollutedPatch"])
        self.assertEqual(res["normEvilTheme"], "true-night")
        self.assertTrue(res["importOk"])
        self.assertFalse(res["importHasUnknownFoo"], "validateImportPayload must ignore/strip unknown keys")
        self.assertFalse(res["hasOwnProto"])
        self.assertFalse(res["hasOwnCtor"])
        self.assertFalse(res["hasOwnPrototype"])
        self.assertEqual(res["afterPatchTheme"], "warm-linen")
        self._assert_no_js_errors("test_t2_f5_normalize_null_undefined_primitives_and_prototype_pollution")

    def test_t2_f5_normalize_out_of_range_numbers_and_boundary_clamping(self) -> None:
        self._load_schema_harness()
        res = self.fx.eval_js(
            """
            const S = window.FoxHubSettingsSchema;
            const ranges = S.NUMBER_RANGES;
            const defs = S.DEFAULT_SETTINGS;
            const results = {};

            for (const [key, [min, max]] of Object.entries(ranges)) {
              const atMin = S.normalizeSettings({ [key]: min })[key];
              const atMax = S.normalizeSettings({ [key]: max })[key];
              const belowMin = S.normalizeSettings({ [key]: min - 999 })[key];
              const aboveMax = S.normalizeSettings({ [key]: max + 999999 })[key];
              const withNaN = S.normalizeSettings({ [key]: Number.NaN })[key];
              const withInf = S.normalizeSettings({ [key]: Number.POSITIVE_INFINITY })[key];
              const withNegInf = S.normalizeSettings({ [key]: Number.NEGATIVE_INFINITY })[key];
              const withStr = S.normalizeSettings({ [key]: '50' })[key];
              const withNull = S.normalizeSettings({ [key]: null })[key];
              results[key] = {
                min,
                max,
                def: defs[key],
                atMin,
                atMax,
                belowMin,
                aboveMax,
                withNaN,
                withInf,
                withNegInf,
                withStr,
                withNull
              };
            }
            return results;
            """
        )
        self.assertGreater(len(res), 10, "Expected NUMBER_RANGES keys to be populated")
        for key, item in res.items():
            self.assertEqual(item["atMin"], item["min"], f"{key} exact min altered")
            self.assertEqual(item["atMax"], item["max"], f"{key} exact max altered")
            self.assertEqual(item["belowMin"], item["min"], f"{key} below-min did not clamp to min")
            self.assertEqual(item["aboveMax"], item["max"], f"{key} above-max did not clamp to max")
            self.assertEqual(item["withNaN"], item["def"], f"{key} NaN did not fall back to default")
            self.assertEqual(item["withInf"], item["def"], f"{key} Infinity did not fall back to default")
            self.assertEqual(item["withNegInf"], item["def"], f"{key} -Infinity did not fall back to default")
            self.assertEqual(item["withStr"], item["def"], f"{key} string did not fall back to default")
            self.assertEqual(item["withNull"], item["def"], f"{key} null did not fall back to default")
        self._assert_no_js_errors("test_t2_f5_normalize_out_of_range_numbers_and_boundary_clamping")

    def test_t2_f5_normalize_invalid_enums_and_hex_colors(self) -> None:
        self._load_schema_harness()
        res = self.fx.eval_js(
            """
            const S = window.FoxHubSettingsSchema;
            const defs = S.DEFAULT_SETTINGS;

            const badEnumInput = {
              topBarAutoHideMigratedV1: true,
              persistenceDefaultOffMigratedV4: true,
              theme: 'INVALID_THEME',
              wallpaper: '',
              soundId: 'PocketMail',
              mediaTopBarMode: 'HOVER',
              persistenceMode: 123,
              sidebarOpenMode: null,
              tabAudioBehavior: 'bad',
              videoLoadbarStyle: 'neon-bad',
              videoLoadbarSize: 'giant',
              appShortcutOpenMode: 'tab',
              miniNowPlayingPosition: 'left',
              contextMenuOpenBehavior: 'window'
            };
            const badEnumOut = S.normalizeSettings(badEnumInput);

            const validEdgeOut = S.normalizeSettings({
              topBarAutoHideMigratedV1: true,
              persistenceDefaultOffMigratedV4: true,
              mediaTopBarMode: 'disabled',
              persistenceMode: 'eco',
              sidebarOpenMode: 'window',
              contextMenuOpenBehavior: 'popout'
            });

            const badColors = S.normalizeSettings({
              gradientColor1: 'red',
              gradientColor2: '#12',
              customGradient1: '#GGGGGG',
              customGradient2: 'rgb(0,0,0)',
              videoLoadbarColor: '#123456; color:red'
            });

            const validColors = S.normalizeSettings({
              gradientColor1: '#abc',
              customGradient2: '#11223380',
              videoLoadbarColor: '#1A2b3C'
            });

            const cur = S.normalizeSettings({ gradientColor1: '#AAAAAA', customGradient1: '#AAAAAA' });
            const patched = S.normalizeSettingsPatch({ gradientColor1: '#123456' }, cur);

            return {
              defs,
              badEnumOut,
              validEdgeOut,
              badColors,
              validColors,
              patched
            };
            """
        )
        defs = res["defs"]
        bad = res["badEnumOut"]
        for k in (
            "theme",
            "wallpaper",
            "soundId",
            "mediaTopBarMode",
            "persistenceMode",
            "sidebarOpenMode",
            "tabAudioBehavior",
            "videoLoadbarStyle",
            "videoLoadbarSize",
            "appShortcutOpenMode",
            "miniNowPlayingPosition",
            "contextMenuOpenBehavior",
        ):
            self.assertEqual(bad[k], defs[k], f"Invalid enum for {k} did not reset to default")

        edge = res["validEdgeOut"]
        self.assertEqual(edge["mediaTopBarMode"], "disabled")
        self.assertEqual(edge["persistenceMode"], "eco")
        self.assertEqual(edge["sidebarOpenMode"], "window")
        self.assertEqual(edge["contextMenuOpenBehavior"], "popout")

        bad_c = res["badColors"]
        self.assertEqual(bad_c["gradientColor1"], defs["gradientColor1"])
        self.assertEqual(bad_c["gradientColor2"], defs["gradientColor2"])
        self.assertEqual(bad_c["videoLoadbarColor"], defs["videoLoadbarColor"])

        val_c = res["validColors"]
        self.assertEqual(val_c["gradientColor1"], "#abc")
        self.assertEqual(val_c["customGradient1"], "#abc")
        self.assertEqual(val_c["gradientColor2"], "#11223380")
        self.assertEqual(val_c["customGradient2"], "#11223380")
        self.assertEqual(val_c["videoLoadbarColor"], "#1A2b3C")

        self.assertEqual(res["patched"]["gradientColor1"], "#123456")
        self.assertEqual(res["patched"]["customGradient1"], "#123456")
        self._assert_no_js_errors("test_t2_f5_normalize_invalid_enums_and_hex_colors")

    def test_t2_f5_autohide_topbar_derivation_and_legacy_migration(self) -> None:
        self._load_schema_harness()
        res = self.fx.eval_js(
            """
            const S = window.FoxHubSettingsSchema;
            const flags = { topBarAutoHideMigratedV1: true, persistenceDefaultOffMigratedV4: true };

            const cPinned = S.normalizeSettings({ ...flags, mediaTopBarMode: 'pinned' });
            const cHover = S.normalizeSettings({ ...flags, mediaTopBarMode: 'hover' });
            const cDisabled = S.normalizeSettings({ ...flags, mediaTopBarMode: 'disabled' });
            const cAutoFalse = S.normalizeSettings({ ...flags, autoHideMediaTopBar: false });
            const cAutoTrue = S.normalizeSettings({ ...flags, autoHideMediaTopBar: true });
            const cConflict = S.normalizeSettings({ ...flags, mediaTopBarMode: 'pinned', autoHideMediaTopBar: true });

            const p1 = S.normalizeSettingsPatch({ mediaTopBarMode: 'hover' }, cPinned);
            const p2 = S.normalizeSettingsPatch({ mediaTopBarMode: 'disabled' }, p1);
            const p3 = S.normalizeSettingsPatch({ autoHideMediaTopBar: false }, p2);

            const legacyEco = S.normalizeSettings({ ...flags, mediaPersistenceMode: 'none' });

            const legacy279 = S.normalizeSettings({
              mediaPersistenceMode: 'all',
              lastActiveAppId: 'spotify',
              savedAppSessions: { spotify: 'https://open.spotify.com/track/1' },
              savedOpenPersistentApps: ['spotify'],
              bgAudioAppIds: ['spotify', 'youtube'],
              bgAudioAppIdsMigratedV1: true,
              socialAppNotifySounds: false
            });

            return {
              cPinned: [cPinned.mediaTopBarMode, cPinned.autoHideMediaTopBar],
              cHover: [cHover.mediaTopBarMode, cHover.autoHideMediaTopBar],
              cDisabled: [cDisabled.mediaTopBarMode, cDisabled.autoHideMediaTopBar],
              cAutoFalse: [cAutoFalse.mediaTopBarMode, cAutoFalse.autoHideMediaTopBar],
              cAutoTrue: [cAutoTrue.mediaTopBarMode, cAutoTrue.autoHideMediaTopBar],
              cConflict: [cConflict.mediaTopBarMode, cConflict.autoHideMediaTopBar],
              p1: [p1.mediaTopBarMode, p1.autoHideMediaTopBar],
              p2: [p2.mediaTopBarMode, p2.autoHideMediaTopBar],
              p3: [p3.mediaTopBarMode, p3.autoHideMediaTopBar],
              legacyEcoMode: legacyEco.persistenceMode,
              legacy279
            };
            """
        )
        self.assertEqual(res["cPinned"], ["pinned", False])
        self.assertEqual(res["cHover"], ["hover", True])
        self.assertEqual(res["cDisabled"], ["disabled", True])
        self.assertEqual(res["cAutoFalse"], ["pinned", False])
        self.assertEqual(res["cAutoTrue"], ["hover", True])
        self.assertEqual(res["cConflict"], ["pinned", False])
        self.assertEqual(res["p1"], ["hover", True])
        self.assertEqual(res["p2"], ["disabled", True])
        self.assertEqual(res["p3"], ["pinned", False])
        self.assertEqual(res["legacyEcoMode"], "eco")

        leg = res["legacy279"]
        for legacy_key in ("mediaPersistenceMode", "lastActiveAppId", "savedAppSessions", "savedOpenPersistentApps"):
            self.assertNotIn(legacy_key, leg, f"Legacy key {legacy_key} must be stripped")
        self.assertEqual(leg.get("persistentLastActiveAppId"), "spotify")
        self.assertEqual((leg.get("persistentSavedAppUrls") or {}).get("spotify"), "https://open.spotify.com/track/1")
        self.assertEqual(leg.get("persistentOpenAppIds"), ["spotify"])
        self.assertIn("soundcloud", leg.get("bgAudioAppIds") or [])
        self.assertTrue(leg.get("muteSiteNotifications"))
        self.assertFalse(leg.get("socialAppNotifySounds"))
        self.assertTrue(leg.get("topBarAutoHideMigratedV1"))
        self.assertTrue(leg.get("persistenceDefaultOffMigratedV4"))
        self.assertTrue(leg.get("bgAudioAppIdsSoundCloudMigratedV2"))
        self._assert_no_js_errors("test_t2_f5_autohide_topbar_derivation_and_legacy_migration")

    def test_t2_f5_simultaneous_drawer_and_options_writes_converge(self) -> None:
        # Part A: Verify background concurrent UPDATE_SETTINGS convergence
        # Clear canned messageResponses from setUp() so UPDATE_SETTINGS hits real bg-router.js
        self.server.clear_seed()
        bg_html = REPO_ROOT / "src" / "background" / "background.html"
        self.assertTrue(bg_html.is_file(), f"Missing {bg_html}")
        raw_srcs = re.findall(r'<script\s+src=["\']([^"\']+)["\']', bg_html.read_text(encoding="utf-8"), re.IGNORECASE)
        script_tags = []
        for src in raw_srcs:
            resolved = "/src/" + src[3:] if src.startswith("../") else ("/src/background/" + src if not src.startswith("/") else src)
            script_tags.append(f'<script src="{resolved}"></script>')
        guard_url = self.server.register_fixture(
            "t2_f5_fetch_guard.js",
            "const __origFetch = window.fetch ? window.fetch.bind(window) : null;\n"
            "window.fetch = function(input, init) {\n"
            "  const u = typeof input === 'string' ? input : (input && input.url ? input.url : '');\n"
            "  if (/^https?:\\/\\/(mail\\.google\\.com|www\\.googleapis\\.com|accounts\\.google\\.com)\\b/i.test(u)) {\n"
            "    return Promise.resolve(new Response('', { status: 403, statusText: 'Mock Offline' }));\n"
            "  }\n"
            "  return __origFetch ? __origFetch(input, init) : Promise.reject(new Error('No fetch'));\n"
            "};\n",
            content_type="application/javascript; charset=utf-8",
        )
        bg_url = self.server.register_fixture(
            "t2_f5_bg_harness.html",
            "<!doctype html><html><head><meta charset='utf-8'><title>BG Harness</title>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            f"<script src='{guard_url}'></script>"
            "</head><body>"
            + "".join(script_tags)
            + "</body></html>",
        )
        self.fx.navigate(bg_url)
        self._install_error_trap()
        conv = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline) {
              if (window.FoxHubBg && window.FoxHubBg.state && window.FoxHubBg.state.cachedState.lastSyncAt > 0) break;
              await new Promise((r) => setTimeout(r, 25));
            }
            window.__webextMock.clearCalls();
            const [r1, r2] = await Promise.all([
              browser.runtime.sendMessage({
                type: 'UPDATE_SETTINGS',
                settings: {
                  theme: 'midnight-velvet',
                  mediaTopBarMode: 'pinned',
                  gradientColor1: '#112233',
                  miniNowPlayingCompact: true
                }
              }),
              browser.runtime.sendMessage({
                type: 'UPDATE_SETTINGS',
                settings: {
                  persistenceMode: 'eco',
                  pollIntervalSeconds: 90,
                  customGradient2: '#445566',
                  contextMenuEnabled: false
                }
              })
            ]);
            await new Promise((r) => setTimeout(r, 50));
            const stored = await browser.storage.local.get('settings');
            const calls = window.__webextMock.getCalls('runtime.sendMessage');
            const hasBroadcast = calls.some((c) => c && c.args && c.args[0] && c.args[0].type === 'STATE_UPDATED');
            return {
              r1Ok: Boolean(r1 && r1.ok),
              r2Ok: Boolean(r2 && r2.ok),
              bgSettings: window.FoxHubBg.state.currentSettings,
              storedSettings: stored.settings,
              hasBroadcast
            };
            """
        )
        self.assertIsInstance(conv, dict, f"Expected dict response from BG convergence test, got {conv!r}")
        self.assertTrue(conv["r1Ok"])
        self.assertTrue(conv["r2Ok"])
        self.assertTrue(conv["hasBroadcast"])
        for label, s in (("bgSettings", conv["bgSettings"]), ("storedSettings", conv["storedSettings"])):
            self.assertIsInstance(s, dict, f"{label} missing")
            self.assertEqual(s.get("theme"), "midnight-velvet")
            self.assertEqual(s.get("mediaTopBarMode"), "pinned")
            self.assertFalse(s.get("autoHideMediaTopBar"))
            self.assertEqual(s.get("gradientColor1"), "#112233")
            self.assertEqual(s.get("customGradient1"), "#112233")
            self.assertEqual(s.get("gradientColor2"), "#445566")
            self.assertEqual(s.get("customGradient2"), "#445566")
            self.assertTrue(s.get("miniNowPlayingCompact"))
            self.assertEqual(s.get("persistenceMode"), "eco")
            self.assertEqual(s.get("pollIntervalSeconds"), 90)
            self.assertFalse(s.get("contextMenuEnabled"))
        self._assert_no_js_errors("test_t2_f5_simultaneous_drawer_and_options_writes_converge")

        # Part B: Verify both popup.html and options.html load the unified settings-schema + settings-ui modules
        settings_ui_js = REPO_ROOT / "src" / "shared" / "settings-ui.js"
        self.assertTrue(settings_ui_js.is_file(), f"Missing unified settings UI component: {settings_ui_js}")
        for page_rel in ("src/popup/popup.html", "src/options/options.html"):
            page_path = REPO_ROOT / page_rel
            self.assertTrue(page_path.is_file(), f"Missing {page_path}")
            txt = page_path.read_text(encoding="utf-8")
            self.assertIn("settings-schema.js", txt, f"{page_rel} must load shared settings-schema.js")
            self.assertIn("settings-ui.js", txt, f"{page_rel} must load shared settings-ui.js")

    def test_t2_f5_zero_pocketmail_branding_in_ui_html_and_live_dom(self) -> None:
        rep = lint_extension(REPO_ROOT, check_firefox_js=False)
        branding_errs = [e for e in rep["errors"] if e["rule"].startswith("branding.pocketmail_")]
        self.assertEqual(branding_errs, [], f"Static PocketMail branding violations found: {branding_errs}")

        for page_url in ("/src/popup/popup.html?sidebar=1", "/src/options/options.html"):
            self.fx.navigate(self.server.url_for(page_url))
            self._install_error_trap()
            hits = self.fx.eval_async_js(
                """
                await new Promise((r) => setTimeout(r, 140));
                const findings = [];
                if (document.title && /pocketmail/i.test(document.title)) {
                  findings.push('document.title: ' + document.title);
                }
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                let node;
                while ((node = walker.nextNode())) {
                  const pTag = node.parentElement ? node.parentElement.tagName : '';
                  if (pTag === 'SCRIPT' || pTag === 'STYLE') continue;
                  const val = (node.nodeValue || '').trim();
                  if (val && /pocketmail/i.test(val)) {
                    findings.push('text: ' + val.slice(0, 120));
                  }
                }
                const attrs = ['title', 'aria-label', 'placeholder', 'alt', 'label'];
                document.querySelectorAll('*').forEach((el) => {
                  for (const a of attrs) {
                    const av = el.getAttribute(a);
                    if (av && /pocketmail/i.test(av)) {
                      findings.push(el.tagName + '[' + a + ']=' + av);
                    }
                  }
                });
                return findings;
                """
            )
            self.assertEqual(hits, [], f"Live DOM user-facing PocketMail occurrences on {page_url}: {hits}")
            self._assert_no_js_errors(f"test_t2_f5_zero_pocketmail_branding({page_url})")

    # ==================================================================
    # F6: Fluent Unified Settings UI Overhaul (6 tests)
    # ==================================================================

    def test_t2_f6_live_search_empty_and_whitespace_only_queries(self) -> None:
        for surface, opener in (
            ("popup_sidebar", lambda: self._open_popup_settings(420, 700)),
            ("options", lambda: self._open_options_page(1200, 800)),
        ):
            info = opener()
            self.assertTrue(info.get("hasRoot"), f"{surface}: Unified settings root not found")
            search_sel = self._find_unified_search_selector()
            self.assertIsNotNone(search_sel, f"{surface}: Unified settings live search input not found")

            counts = self.fx.eval_async_js(
                """
                const sel = arguments[0];
                const input = document.querySelector(sel);
                const root = document.querySelector('#pm-unified-settings-root, #opt-unified-settings-root, #fh-settings-root, .fh-settings-root, [data-settings-root]') || document.body;
                const getSettingItems = () => root.querySelectorAll('[data-setting-key], [data-setting-item], [data-fh-setting-item], .fh-setting-row, .fh-setting-card, .fh-card, .fh-diag-details');
                const getVisibleRows = () => {
                  const items = getSettingItems();
                  let visible = 0;
                  items.forEach((el) => {
                    const st = window.getComputedStyle(el);
                    const r = el.getBoundingClientRect();
                    if (st.display !== 'none' && st.visibility !== 'hidden' && r.height > 0 && !el.hidden) {
                      visible += 1;
                    }
                  });
                  return visible;
                };
                const setQuery = async (val) => {
                  input.value = val;
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('search', { bubbles: true }));
                  await new Promise((r) => setTimeout(r, 60));
                  return getVisibleRows();
                };
                const totalInDom = getSettingItems().length;
                const initialVisible = getVisibleRows();
                const filtered = await setQuery('Now Playing');
                const emptyAfter = await setQuery('');
                const spacesOnly = await setQuery('   ');
                const tabsNewline = await setQuery('\\t  \\n');
                return { totalInDom, initialVisible, filtered, emptyAfter, spacesOnly, tabsNewline };
                """,
                search_sel,
            )
            self.assertGreater(counts["totalInDom"], 5, f"{surface}: Expected > 5 unified setting items in DOM, got {counts}")
            self.assertGreater(counts["initialVisible"], 0, f"{surface}: Expected > 0 initially visible setting items, got {counts}")
            self.assertGreater(counts["filtered"], 0, f"{surface}: 'Now Playing' filter matched 0 items")
            self.assertLess(counts["filtered"], counts["totalInDom"], f"{surface}: 'Now Playing' did not narrow settings")
            self.assertEqual(counts["emptyAfter"], counts["initialVisible"], f"{surface}: Clearing query did not restore initial visible items")
            self.assertEqual(counts["spacesOnly"], counts["initialVisible"], f"{surface}: Spaces-only query must behave like empty")
            self.assertEqual(counts["tabsNewline"], counts["initialVisible"], f"{surface}: Whitespace query must behave like empty")
            self._assert_no_js_errors(f"test_t2_f6_live_search_empty_and_whitespace_only_queries({surface})")

    def test_t2_f6_live_search_no_match_empty_state_and_recovery(self) -> None:
        for surface, opener in (
            ("popup_sidebar", lambda: self._open_popup_settings(420, 700)),
            ("options", lambda: self._open_options_page(1200, 800)),
        ):
            info = opener()
            self.assertTrue(info.get("hasRoot"), f"{surface}: Unified settings root not found")
            search_sel = self._find_unified_search_selector()
            self.assertIsNotNone(search_sel, f"{surface}: Unified settings live search input not found")

            res = self.fx.eval_async_js(
                """
                const sel = arguments[0];
                const input = document.querySelector(sel);
                const root = document.querySelector('#pm-unified-settings-root, #opt-unified-settings-root, #fh-settings-root, .fh-settings-root, [data-settings-root]') || document.body;
                const countVisible = () => {
                  const items = root.querySelectorAll('[data-setting-key], [data-setting-item], [data-fh-setting-item], .fh-setting-row, .fh-setting-card, .fh-card, .fh-diag-details');
                  let visible = 0;
                  items.forEach((el) => {
                    const st = window.getComputedStyle(el);
                    const r = el.getBoundingClientRect();
                    if (st.display !== 'none' && st.visibility !== 'hidden' && r.height > 0 && !el.hidden) visible += 1;
                  });
                  return visible;
                };
                const getEmptyState = () => {
                  const emptyEl = root.querySelector('[data-settings-empty], .fh-settings-empty, .fh-search-empty, .fh-empty-state');
                  if (!emptyEl) return null;
                  const st = window.getComputedStyle(emptyEl);
                  const r = emptyEl.getBoundingClientRect();
                  return {
                    visible: st.display !== 'none' && st.visibility !== 'hidden' && r.height > 0 && !emptyEl.hidden,
                    text: (emptyEl.textContent || '').trim()
                  };
                };

                const before = countVisible();
                input.value = '__nonexistent_foxhub_xyz_98765__';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise((r) => setTimeout(r, 60));
                const duringCount = countVisible();
                const duringEmpty = getEmptyState();

                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise((r) => setTimeout(r, 60));
                const afterCount = countVisible();
                const afterEmpty = getEmptyState();

                return { before, duringCount, duringEmpty, afterCount, afterEmpty };
                """,
                search_sel,
            )
            self.assertGreater(res["before"], 0)
            self.assertEqual(res["duringCount"], 0, f"{surface}: Expected 0 visible settings on no-match query")
            self.assertIsNotNone(res["duringEmpty"], f"{surface}: Expected explicit empty-state element on no-match")
            self.assertTrue(res["duringEmpty"]["visible"], f"{surface}: Empty-state banner must be visible")
            self.assertTrue(len(res["duringEmpty"]["text"]) > 0, f"{surface}: Empty-state banner must have text")
            self.assertEqual(res["afterCount"], res["before"], f"{surface}: Clearing query must restore all settings")
            if res["afterEmpty"] is not None:
                self.assertFalse(res["afterEmpty"]["visible"], f"{surface}: Empty-state must hide after clearing query")
            self._assert_no_js_errors(f"test_t2_f6_live_search_no_match_empty_state_and_recovery({surface})")

    def test_t2_f6_live_search_special_regex_characters_no_crash(self) -> None:
        info = self._open_options_page(1200, 800)
        self.assertTrue(info.get("hasRoot"), "options: Unified settings root not found")
        search_sel = self._find_unified_search_selector()
        self.assertIsNotNone(search_sel, "options: Unified settings live search input not found")

        res = self.fx.eval_async_js(
            """
            const sel = arguments[0];
            const input = document.querySelector(sel);
            const root = document.querySelector('#pm-unified-settings-root, #opt-unified-settings-root, #fh-settings-root, .fh-settings-root, [data-settings-root]') || document.body;
            const queries = ['.*+?[]()', '\\\\d+[a-z]{2,}', '(audio|mute)^$', '[', '\\\\', '^$'];
            for (const q of queries) {
              input.value = q;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              await new Promise((r) => setTimeout(r, 25));
            }
            input.value = 'mute';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise((r) => setTimeout(r, 50));
            const items = root.querySelectorAll('[data-setting-key], [data-setting-item], [data-fh-setting-item], .fh-setting-row, .fh-setting-card, .fh-card, .fh-diag-details');
            let visibleMute = 0;
            items.forEach((el) => {
              const st = window.getComputedStyle(el);
              if (st.display !== 'none' && el.getBoundingClientRect().height > 0 && !el.hidden) visibleMute += 1;
            });
            return { visibleMute };
            """,
            search_sel,
        )
        self.assertGreater(res["visibleMute"], 0, "Expected 'mute' search to recover after regex meta-char queries")
        self._assert_no_js_errors("test_t2_f6_live_search_special_regex_characters_no_crash")

    def test_t2_f6_rapid_category_switching_consistency(self) -> None:
        for surface, opener in (
            ("popup_sidebar", lambda: self._open_popup_settings(440, 700)),
            ("options", lambda: self._open_options_page(1200, 800)),
        ):
            info = opener()
            self.assertTrue(info.get("hasRoot"), f"{surface}: Unified settings root not found")

            res = self.fx.eval_async_js(
                """
                const root = document.querySelector('#pm-unified-settings-root, #opt-unified-settings-root, #fh-settings-root, .fh-settings-root, [data-settings-root]') || document.body;
                const navBtns = Array.from(
                  root.querySelectorAll('[data-settings-category], [data-category], .fh-settings-nav-btn, [role="tab"]')
                );
                if (navBtns.length < 4) {
                  return { ready: false, navCount: navBtns.length };
                }
                for (let round = 0; round < 2; round++) {
                  for (let i = 0; i < navBtns.length; i++) navBtns[i].click();
                  for (let i = navBtns.length - 1; i >= 0; i--) navBtns[i].click();
                }
                const targetBtn = navBtns[navBtns.length - 1];
                targetBtn.click();
                await new Promise((r) => setTimeout(r, 40));

                const activeBtns = navBtns.filter(
                  (b) => b.classList.contains('active') || b.getAttribute('aria-selected') === 'true'
                );
                const panels = Array.from(
                  root.querySelectorAll('[data-settings-panel], .fh-settings-panel, [role="tabpanel"]')
                );
                const visiblePanels = panels.filter((p) => {
                  const st = window.getComputedStyle(p);
                  return st.display !== 'none' && !p.hidden && !p.classList.contains('hidden');
                });
                const textAll = (root.textContent || '').toLowerCase();
                return {
                  ready: true,
                  navCount: navBtns.length,
                  activeCount: activeBtns.length,
                  lastIsActive: activeBtns.length === 1 && activeBtns[0] === targetBtn,
                  visiblePanelCount: visiblePanels.length,
                  hasNowPlaying: textAll.includes('now playing'),
                  hasContextMenu: textAll.includes('context menu') || textAll.includes('right-click'),
                  hasQuickSwitcher: textAll.includes('quick switcher') || textAll.includes('ctrl+k'),
                  hasUserChrome: textAll.includes('userchrome'),
                  hasBackup: textAll.includes('export') && textAll.includes('import')
                };
                """
            )
            self.assertTrue(res.get("ready"), f"{surface}: Expected >= 4 settings category tabs, got {res}")
            self.assertEqual(res["activeCount"], 1, f"{surface}: Exactly 1 category tab must stay active")
            self.assertTrue(res["lastIsActive"], f"{surface}: Last clicked category must be active")
            if res["visiblePanelCount"] > 0:
                self.assertEqual(res["visiblePanelCount"], 1, f"{surface}: Only 1 category panel should be visible")
            self.assertTrue(res["hasNowPlaying"], f"{surface}: Missing Mini Now Playing settings")
            self.assertTrue(res["hasContextMenu"], f"{surface}: Missing Context Menu settings")
            self.assertTrue(res["hasQuickSwitcher"], f"{surface}: Missing Quick Switcher settings")
            self.assertTrue(res["hasUserChrome"], f"{surface}: Missing userChrome.css generator section")
            self.assertTrue(res["hasBackup"], f"{surface}: Missing Settings Export/Import controls")
            self._assert_no_js_errors(f"test_t2_f6_rapid_category_switching_consistency({surface})")

    def test_t2_f6_advanced_diagnostics_accordion_collapsed_and_large_buffer(self) -> None:
        info = self._open_popup_settings(440, 700)
        self.assertTrue(info.get("hasRoot"), "Unified settings root not found")

        res = self.fx.eval_async_js(
            """
            const root = document.querySelector('#pm-unified-settings-root, #opt-unified-settings-root, #fh-settings-root, .fh-settings-root, [data-settings-root]') || document.body;
            const toggle = root.querySelector(
              'details[data-diagnostics] > summary, [data-diagnostics-toggle], #btn-toggle-audio-log, summary.fh-diag-summary'
            );
            const detailsEl = toggle && toggle.closest ? toggle.closest('details') : null;
            const logPanel = root.querySelector(
              '[data-diagnostics-log], #fh-audio-diagnostics-log, #pm-live-audio-log-panel'
            );
            if (!toggle || !logPanel) {
              return { found: false };
            }
            const initiallyCollapsed = detailsEl
              ? !detailsEl.open
              : (logPanel.classList.contains('hidden') || window.getComputedStyle(logPanel).display === 'none');

            // Edge A: empty buffer
            toggle.click();
            await new Promise((r) => setTimeout(r, 60));
            const openedA = detailsEl
              ? detailsEl.open
              : (!logPanel.classList.contains('hidden') && window.getComputedStyle(logPanel).display !== 'none');

            // Edge B: 600 large XSS entries
            const bigEvents = [];
            const longUrl = 'https://open.spotify.com/track/' + 'a'.repeat(180);
            for (let i = 0; i < 600; i++) {
              bigEvents.push({
                ts: 1700000000000 + i,
                iso: '2026-11-19T16:00:00.000Z',
                event: '<img src=x onerror=alert(1)><script>window.__xss=1</script>evt-' + i,
                url: longUrl
              });
            }
            window.__webextMock.runtime.setMessageResponses({
              GET_AUDIO_DIAGNOSTICS: {
                ok: true,
                diagnostics: { version: '2.8.0', recentEvents: bigEvents, events: bigEvents, log: bigEvents }
              }
            });
            // Collapse and re-open to refresh diagnostics with large payload
            toggle.click();
            await new Promise((r) => setTimeout(r, 40));
            toggle.click();
            await new Promise((r) => setTimeout(r, 80));

            return {
              found: true,
              initiallyCollapsed,
              openedA,
              xssGlobal: window.__xss,
              scriptTagsInLog: logPanel.querySelectorAll('script, img').length,
              overflowOk: document.documentElement.scrollWidth <= window.innerWidth + 1
            };
            """
        )
        self.assertTrue(res.get("found"), "Advanced Diagnostics accordion/log panel not found in unified Settings UI")
        self.assertTrue(res["initiallyCollapsed"], "Advanced Diagnostics must be collapsed by default")
        self.assertTrue(res["openedA"], "Advanced Diagnostics must open when toggled")
        self.assertIsNone(res["xssGlobal"], "XSS script inside diagnostics payload executed")
        self.assertEqual(res["scriptTagsInLog"], 0, "Diagnostics log must not inject raw HTML elements")
        self.assertTrue(res["overflowOk"], "Large diagnostics buffer caused horizontal overflow")
        self._assert_no_js_errors("test_t2_f6_advanced_diagnostics_accordion_collapsed_and_large_buffer")

    def test_t2_f6_extreme_viewports_320x640_and_1200x800_zero_overflow(self) -> None:
        for surface, opener_fn in (
            ("popup_sidebar", lambda w, h: self._open_popup_settings(w, h)),
            ("options", lambda w, h: self._open_options_page(w, h)),
        ):
            for w, h in ((320, 640), (1200, 800)):
                info = opener_fn(w, h)
                self.assertTrue(info.get("hasRoot"), f"{surface}@{w}x{h}: Unified settings root not found")

                layout = self.fx.eval_js(
                    """
                    const vw = window.innerWidth;
                    const scrollW = document.documentElement.scrollWidth;
                    const root = document.querySelector('#pm-unified-settings-root, #opt-unified-settings-root, #fh-settings-root, .fh-settings-root, [data-settings-root]') || document.body;
                    const outOfBounds = [];
                    root.querySelectorAll('button, input, select, textarea').forEach((el) => {
                      const st = window.getComputedStyle(el);
                      if (st.display === 'none' || st.visibility === 'hidden' || el.hidden) return;
                      const r = el.getBoundingClientRect();
                      if (r.width === 0 && r.height === 0) return;
                      if (r.width <= 0 || r.height <= 0 || r.left < -1 || r.right > vw + 1) {
                        outOfBounds.push({
                          tag: el.tagName,
                          id: el.id || '',
                          left: Math.round(r.left),
                          right: Math.round(r.right),
                          vw
                        });
                      }
                    });
                    const navBtns = Array.from(
                      root.querySelectorAll('[data-settings-category], [data-category], .fh-settings-nav-btn, [role="tab"]')
                    ).filter((el) => {
                      const st = window.getComputedStyle(el);
                      const r = el.getBoundingClientRect();
                      return st.display !== 'none' && r.width > 0 && r.height > 0;
                    });
                    const overlaps = [];
                    for (let i = 0; i < navBtns.length; i++) {
                      const a = navBtns[i].getBoundingClientRect();
                      for (let j = i + 1; j < navBtns.length; j++) {
                        const b = navBtns[j].getBoundingClientRect();
                        const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
                        const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
                        if (ix > 1 && iy > 1) {
                          overlaps.push([i, j, Math.round(ix), Math.round(iy)]);
                        }
                      }
                    }
                    return { vw, scrollW, outOfBounds, overlaps };
                    """
                )
                self.assertLessEqual(
                    layout["scrollW"],
                    layout["vw"] + 1,
                    f"{surface}@{w}x{h}: Horizontal overflow scrollWidth={layout['scrollW']} > innerWidth={layout['vw']}",
                )
                self.assertEqual(
                    layout["outOfBounds"],
                    [],
                    f"{surface}@{w}x{h}: Controls clipped/out-of-bounds: {layout['outOfBounds'][:5]}",
                )
                self.assertEqual(
                    layout["overlaps"],
                    [],
                    f"{surface}@{w}x{h}: Category navigation buttons overlap: {layout['overlaps']}",
                )
                self._assert_no_js_errors(f"test_t2_f6_extreme_viewports({surface}@{w}x{h})")

    # ==================================================================
    # F7: Decluttered Header & Narrow-Mode ⋯ Menu (6 tests)
    # ==================================================================

    def test_t2_f7_header_actions_omits_four_removed_buttons_even_hidden(self) -> None:
        for query in ("", "?sidebar=1"):
            self.fx.navigate(self.server.url_for(f"/src/popup/popup.html{query}"))
            self._install_error_trap()
            res = self.fx.eval_async_js(
                """
                await new Promise((r) => setTimeout(r, 120));
                const actions = document.querySelector('.pm-header-actions');
                const rail = document.getElementById('pm-opera-rail');
                if (!actions || !rail) return { ready: false };

                const forbiddenIds = ['btn-open-sidebar', 'btn-night-mode', 'btn-dnd', 'btn-settings'];
                const presentForbiddenIds = forbiddenIds.filter((id) => Boolean(actions.querySelector('#' + id)));

                const badActionLabels = [];
                actions.querySelectorAll('button').forEach((btn) => {
                  const lbl = ((btn.getAttribute('title') || '') + ' ' + (btn.getAttribute('aria-label') || '')).toLowerCase();
                  if (/open.*sidebar|night mode|mute notifications|open full settings/.test(lbl)) {
                    badActionLabels.push({ id: btn.id, lbl });
                  }
                });

                const railRequiredIds = [
                  'rail-btn-open-sidebar',
                  'rail-btn-night-mode',
                  'rail-btn-mute-notifs',
                  'rail-btn-sidebar-settings'
                ];
                const missingRailIds = railRequiredIds.filter((id) => !rail.querySelector('#' + id));

                return {
                  ready: true,
                  presentForbiddenIds,
                  badActionLabels,
                  missingRailIds
                };
                """
            )
            self.assertTrue(res.get("ready"), f"Missing .pm-header-actions or #pm-opera-rail on popup.html{query}")
            self.assertEqual(
                res["presentForbiddenIds"],
                [],
                f"Duplicated rail buttons still inside .pm-header-actions{query}: {res['presentForbiddenIds']}",
            )
            self.assertEqual(
                res["badActionLabels"],
                [],
                f"Removed rail actions still present in .pm-header-actions{query}: {res['badActionLabels']}",
            )
            self.assertEqual(
                res["missingRailIds"],
                [],
                f"Left rail missing required buttons on popup.html{query}: {res['missingRailIds']}",
            )
            self._assert_no_js_errors(f"test_t2_f7_header_actions_omits_four_removed_buttons({query})")

    def test_t2_f7_more_menu_breakpoint_widths_319_320_480_1200(self) -> None:
        self.fx.navigate(self.server.url_for("/src/popup/popup.html?sidebar=1"))
        self._install_error_trap()
        self.fx.eval_async_js("await new Promise((r) => setTimeout(r, 120));")

        more_sel = self._find_more_menu_button_selector()
        self.assertIsNotNone(more_sel, "Expected a ⋯ overflow menu trigger inside .pm-header-actions")

        widths = (319, 320, 480, 1200, 320, 319)
        for w in widths:
            h = 640 if w <= 320 else 800
            self.fx.set_viewport(w, h)
            probe = self.fx.eval_async_js(
                """
                await new Promise((r) => setTimeout(r, 40));
                const btn = document.querySelector(arguments[0]);
                if (!btn) return { found: false };
                const st = window.getComputedStyle(btn);
                const r = btn.getBoundingClientRect();
                return {
                  found: true,
                  visible: st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0,
                  vw: window.innerWidth,
                  scrollW: document.documentElement.scrollWidth
                };
                """,
                more_sel,
            )
            self.assertTrue(probe["found"], f"⋯ trigger missing at width {w}")
            self.assertLessEqual(
                probe["scrollW"],
                probe["vw"] + 1,
                f"Horizontal overflow at width {w}: scrollW={probe['scrollW']} > vw={probe['vw']}",
            )
            if w <= 320:
                self.assertTrue(probe["visible"], f"⋯ trigger must be visible in narrow sidebar width {w}px")

        self._assert_no_js_errors("test_t2_f7_more_menu_breakpoint_widths_319_320_480_1200")

    def test_t2_f7_more_menu_escape_and_outside_click_dismissal(self) -> None:
        self.fx.navigate(self.server.url_for("/src/popup/popup.html?sidebar=1"))
        self.fx.set_viewport(320, 640)
        self._install_error_trap()
        self.fx.eval_async_js("await new Promise((r) => setTimeout(r, 120));")

        more_sel = self._find_more_menu_button_selector()
        self.assertIsNotNone(more_sel, "Expected a ⋯ overflow menu trigger inside .pm-header-actions")
        btn_rect = self.fx.get_bounding_rect(more_sel)
        self.assertIsNotNone(btn_rect)
        self.assertGreater(btn_rect["width"], 0, "⋯ trigger must be visible at 320x640")

        def _is_menu_open() -> bool:
            return bool(
                self.fx.eval_js(
                    """
                    const pop = document.querySelector(
                      '#pm-header-more-menu, .pm-header-more-menu, .pm-header-actions [role="menu"], [data-more-menu-popover]'
                    );
                    if (!pop) return false;
                    const st = window.getComputedStyle(pop);
                    const r = pop.getBoundingClientRect();
                    return !pop.hidden && !pop.classList.contains('hidden') && st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
                    """
                )
            )

        # 1. Open -> Escape closes
        self.fx.click(more_sel)
        self.assertTrue(_is_menu_open(), "⋯ menu popover did not open on click")
        self.fx.press_shortcut("escape")
        self.fx.eval_async_js("await new Promise((r) => setTimeout(r, 40));")
        self.assertFalse(_is_menu_open(), "⋯ menu popover did not close on Escape")

        # 2. Reopen -> Outside click closes
        self.fx.click(more_sel)
        self.assertTrue(_is_menu_open(), "⋯ menu popover did not reopen")
        title_rect = self.fx.get_bounding_rect(".pm-brand-title")
        self.assertIsNotNone(title_rect)
        self.fx.click(".pm-brand-title")
        self.fx.eval_async_js("await new Promise((r) => setTimeout(r, 40));")
        self.assertFalse(_is_menu_open(), "⋯ menu popover did not close on outside click")

        # 3. Reopen -> Toggle button closes
        self.fx.click(more_sel)
        self.assertTrue(_is_menu_open(), "⋯ menu popover did not reopen before toggle close")
        self.fx.click(more_sel)
        self.fx.eval_async_js("await new Promise((r) => setTimeout(r, 40));")
        self.assertFalse(_is_menu_open(), "⋯ menu popover did not close on second trigger click")
        self._assert_no_js_errors("test_t2_f7_more_menu_escape_and_outside_click_dismissal")

    def test_t2_f7_more_menu_keyboard_navigation_and_activation(self) -> None:
        self.fx.navigate(self.server.url_for("/src/popup/popup.html?sidebar=1"))
        self.fx.set_viewport(320, 640)
        self._install_error_trap()
        self.fx.eval_async_js("await new Promise((r) => setTimeout(r, 120));")

        more_sel = self._find_more_menu_button_selector()
        self.assertIsNotNone(more_sel, "Expected a ⋯ overflow menu trigger inside .pm-header-actions")
        btn_rect = self.fx.get_bounding_rect(more_sel)
        self.assertIsNotNone(btn_rect)
        self.assertGreater(btn_rect["width"], 0, "⋯ trigger must be visible at 320x640")

        # Focus trigger & press Enter
        self.fx.eval_js("document.querySelector(arguments[0]).focus();", more_sel)
        self.fx.press_shortcut("enter")
        self.fx.eval_async_js("await new Promise((r) => setTimeout(r, 50));")

        opened = self.fx.eval_js(
            """
            const pop = document.querySelector(
              '#pm-header-more-menu, .pm-header-more-menu, .pm-header-actions [role="menu"], [data-more-menu-popover]'
            );
            if (!pop) return { open: false, items: 0 };
            const st = window.getComputedStyle(pop);
            const r = pop.getBoundingClientRect();
            const items = Array.from(pop.querySelectorAll('button, [role="menuitem"]')).filter((el) => {
              const ist = window.getComputedStyle(el);
              return ist.display !== 'none' && !el.hidden && el.getBoundingClientRect().height > 0;
            });
            return {
              open: !pop.hidden && !pop.classList.contains('hidden') && st.display !== 'none' && r.height > 0,
              items: items.length
            };
            """
        )
        self.assertTrue(opened["open"], "Enter on focused ⋯ trigger must open the overflow menu")
        self.assertGreaterEqual(opened["items"], 2, "⋯ menu must expose >= 2 visible menu items")

        self.fx.press_shortcut("arrowdown")
        self.fx.press_shortcut("arrowdown")
        self.fx.press_shortcut("arrowup")
        focus_info = self.fx.eval_js(
            """
            const pop = document.querySelector(
              '#pm-header-more-menu, .pm-header-more-menu, .pm-header-actions [role="menu"], [data-more-menu-popover]'
            );
            const act = document.activeElement;
            return {
              insideMenu: Boolean(pop && act && pop.contains(act)),
              tag: act ? act.tagName : null
            };
            """
        )
        self.assertTrue(focus_info["insideMenu"], f"Arrow keys must navigate focus inside ⋯ menu: {focus_info}")

        self.fx.press_shortcut("escape")
        self.fx.eval_async_js("await new Promise((r) => setTimeout(r, 40));")
        self._assert_no_js_errors("test_t2_f7_more_menu_keyboard_navigation_and_activation")

    def test_t2_f7_header_and_more_menu_bounding_rects_within_viewport(self) -> None:
        self.fx.navigate(self.server.url_for("/src/popup/popup.html?sidebar=1"))
        self._install_error_trap()
        self.fx.eval_async_js("await new Promise((r) => setTimeout(r, 120));")

        more_sel = self._find_more_menu_button_selector()
        self.assertIsNotNone(more_sel, "Expected a ⋯ overflow menu trigger inside .pm-header-actions")

        for w, h in ((319, 640), (320, 640), (480, 800), (1200, 800)):
            self.fx.set_viewport(w, h)
            if w <= 320:
                rect = self.fx.get_bounding_rect(more_sel)
                self.assertIsNotNone(rect)
                self.assertGreater(rect["width"], 0)
                self.fx.click(more_sel)

            report = self.fx.eval_async_js(
                """
                await new Promise((r) => setTimeout(r, 40));
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const brand = document.querySelector('.pm-brand');
                const actions = document.querySelector('.pm-header-actions');
                const header = document.querySelector('.pm-header');
                if (!brand || !actions || !header) return { ready: false };

                const br = brand.getBoundingClientRect();
                const ar = actions.getBoundingClientRect();
                const badRects = [];
                const checkRect = (label, r) => {
                  if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1 || r.width <= 0 || r.height <= 0) {
                    badRects.push({
                      label,
                      left: Math.round(r.left),
                      top: Math.round(r.top),
                      right: Math.round(r.right),
                      bottom: Math.round(r.bottom),
                      vw,
                      vh
                    });
                  }
                };
                checkRect('.pm-header', header.getBoundingClientRect());
                checkRect('.pm-brand', br);
                checkRect('.pm-header-actions', ar);
                actions.querySelectorAll('button').forEach((btn, idx) => {
                  const st = window.getComputedStyle(btn);
                  if (st.display === 'none' || st.visibility === 'hidden' || btn.hidden) return;
                  const r = btn.getBoundingClientRect();
                  if (r.width === 0 && r.height === 0) return;
                  checkRect('btn:' + (btn.id || idx), r);
                });
                const pop = document.querySelector(
                  '#pm-header-more-menu, .pm-header-more-menu, .pm-header-actions [role="menu"], [data-more-menu-popover]'
                );
                if (pop && !pop.hidden && !pop.classList.contains('hidden') && window.getComputedStyle(pop).display !== 'none') {
                  checkRect('more-popover', pop.getBoundingClientRect());
                }
                return {
                  ready: true,
                  brandOverlapsActions: br.right > ar.left + 1,
                  badRects
                };
                """
            )
            self.assertTrue(report.get("ready"))
            self.assertFalse(report["brandOverlapsActions"], f"Brand overlaps actions at {w}x{h}")
            self.assertEqual(report["badRects"], [], f"Out-of-viewport header/menu rects at {w}x{h}: {report['badRects']}")
            if w <= 320:
                self.fx.press_shortcut("escape")

        self._assert_no_js_errors("test_t2_f7_header_and_more_menu_bounding_rects_within_viewport")

    def test_t2_f7_more_menu_rapid_toggle_and_view_switching_cleanup(self) -> None:
        self.fx.navigate(self.server.url_for("/src/popup/popup.html?sidebar=1"))
        self.fx.set_viewport(320, 640)
        self._install_error_trap()
        self.fx.eval_async_js("await new Promise((r) => setTimeout(r, 120));")

        more_sel = self._find_more_menu_button_selector()
        self.assertIsNotNone(more_sel, "Expected a ⋯ overflow menu trigger inside .pm-header-actions")
        btn_rect = self.fx.get_bounding_rect(more_sel)
        self.assertIsNotNone(btn_rect)
        self.assertGreater(btn_rect["width"], 0)

        res = self.fx.eval_async_js(
            """
            const btn = document.querySelector(arguments[0]);
            for (let i = 0; i < 6; i++) {
              btn.click();
            }
            btn.click(); // leave open
            await new Promise((r) => setTimeout(r, 40));

            const pop = document.querySelector(
              '#pm-header-more-menu, .pm-header-more-menu, .pm-header-actions [role="menu"], [data-more-menu-popover]'
            );
            const openBeforeSwitch = Boolean(
              pop && !pop.hidden && !pop.classList.contains('hidden') &&
              window.getComputedStyle(pop).display !== 'none' && pop.getBoundingClientRect().height > 0
            );

            const composeBtn = document.getElementById('btn-compose') || document.getElementById('rail-btn-manage-apps');
            if (composeBtn) composeBtn.click();
            await new Promise((r) => setTimeout(r, 60));

            const openAfterSwitch = Boolean(
              pop && !pop.hidden && !pop.classList.contains('hidden') &&
              window.getComputedStyle(pop).display !== 'none' && pop.getBoundingClientRect().height > 0
            );
            return { openBeforeSwitch, openAfterSwitch };
            """,
            more_sel,
        )
        self.assertTrue(res["openBeforeSwitch"], "⋯ menu must be open after rapid odd clicks")
        self.assertFalse(res["openAfterSwitch"], "⋯ menu must close automatically when switching views/drawers")
        self._assert_no_js_errors("test_t2_f7_more_menu_rapid_toggle_and_view_switching_cleanup")


if __name__ == "__main__":
    unittest.main()
