"""Tier 3 Module 4: Architecture Split, Content Injection, Relay & AMO Compliance Pairs (T3-17 .. T3-20)."""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from _e2e_helpers import FoxHubE2EBase, load_manifest_json, make_default_settings_seed
from tests.lib.amo_lint import lint_extension


class TestArchitectureSplitAndAMOPairs(FoxHubE2EBase):
    """Pairwise cross-feature tests for F1, F2, F3, F4, F15, F16, F17."""

    def test_t3_17_content_injection_split_and_tab_audio_autopause_resume(self) -> None:
        """T3-17 (F1, F2, F17): Lightweight tab-media-watcher.js split <-> tab-audio auto-pause & auto-resume."""
        manifest = load_manifest_json(self.PROJECT_ROOT)
        cs_list = manifest.get("content_scripts") or []
        self.assertGreaterEqual(len(cs_list), 1, msg="manifest.json missing content_scripts")
        self.assertEqual(
            cs_list[0].get("js"),
            ["src/content/tab-media-watcher.js"],
            msg=f"General tabs must inject ONLY src/content/tab-media-watcher.js, got: {cs_list[0].get('js')}",
        )
        watcher_path = self.assert_repo_file("src/content/tab-media-watcher.js")
        self.assertLessEqual(
            watcher_path.stat().st_size,
            8192,
            msg=f"tab-media-watcher.js must remain lightweight (<=8KB), got {watcher_path.stat().st_size}B",
        )

        # Verify tab-media-watcher.js emits EXTERNAL_TAB_MEDIA_PLAYING/STOPPED on normal tab without heavy sidebar DOM
        normal_url = self.server.url_for("/mock/normal-tab?playing=0&inject_content=/src/content/tab-media-watcher.js")
        self.fx.navigate(normal_url)
        self.assert_element_visible("#btn-toggle-media")
        self.fx.click("#btn-toggle-media")
        playing_seen = self.safe_eval_async(
            """
            const deadline = Date.now() + 1500;
            while (Date.now() < deadline) {
              const types = window.__webextMock
                .getCalls('runtime.sendMessage')
                .map((c) => c.args && c.args[0] && c.args[0].type)
                .filter(Boolean);
              if (types.includes('EXTERNAL_TAB_MEDIA_PLAYING')) return true;
              await new Promise((r) => setTimeout(r, 30));
            }
            return false;
            """
        )
        self.assertTrue(playing_seen, msg="Expected EXTERNAL_TAB_MEDIA_PLAYING after starting normal-tab video")
        self.fx.click("#btn-toggle-media")
        watcher_res = self.safe_eval_async(
            """
            const deadline = Date.now() + 1500;
            let types = [];
            while (Date.now() < deadline) {
              const calls = window.__webextMock.getCalls('runtime.sendMessage').map((c) => c.args && c.args[0]);
              types = calls.map((m) => m && m.type).filter(Boolean);
              if (types.includes('EXTERNAL_TAB_MEDIA_STOPPED')) break;
              await new Promise((r) => setTimeout(r, 30));
            }
            const heavyDom = Boolean(
              document.getElementById('pm-media-top-bar') ||
              document.getElementById('pm-video-loadbar') ||
              document.getElementById('pm-opera-rail')
            );
            return {
              types,
              heavyDom,
            };
            """
        )
        self.assertFalse(watcher_res["heavyDom"], msg="Normal tab must not receive FoxHub sidebar DOM/UI injections")
        self.assertIn("EXTERNAL_TAB_MEDIA_PLAYING", watcher_res["types"])
        self.assertIn("EXTERNAL_TAB_MEDIA_STOPPED", watcher_res["types"])

        # Verify background auto-pause and 340ms auto-resume on external tab playback
        ext_tab = {
            "id": 10,
            "windowId": 1,
            "active": True,
            "audible": True,
            "mutedInfo": {"muted": False},
            "url": "https://example.com/video",
        }
        settings = make_default_settings_seed(
            tabAudioBehavior="pause-resume",
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
        )
        self.open_background(settings=settings, tabs=[ext_tab])

        bg_res = self.safe_eval_async(
            """
            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/track/1',
              playback: { isPlaying: true, title: 'Track 1', currentTime: 10, duration: 200 },
            });
            await browser.runtime.sendMessage({
              type: 'SIDEBAR_CLOSED_HANDOFF',
              playingApps: [{ appId: 'spotify', url: 'https://open.spotify.com/track/1', title: 'Track 1', isPlaying: true }],
            });

            window.__webextMock.configure({ senderTab: arguments[0] });
            await browser.runtime.sendMessage({ type: 'EXTERNAL_TAB_MEDIA_PLAYING' });
            await new Promise((r) => setTimeout(r, 120));
            const pausedState = window.__pmGetSyncBootState();

            await window.__webextMock.tabs.triggerUpdated(10, { audible: false }, { audible: false });
            await browser.runtime.sendMessage({ type: 'EXTERNAL_TAB_MEDIA_STOPPED' });
            await new Promise((r) => setTimeout(r, 520));
            const resumedState = window.__pmGetSyncBootState();

            return {
              paused: pausedState.isAutoPausedByTabAudio,
              resumedStillPaused: resumedState.isAutoPausedByTabAudio,
            };
            """,
            ext_tab,
        )
        self.assertTrue(bg_res["paused"], msg="Background audio must auto-pause on EXTERNAL_TAB_MEDIA_PLAYING")
        self.assertFalse(bg_res["resumedStillPaused"], msg="Background audio must auto-resume after 340ms settle debounce")

    def test_t3_18_split_background_bundle_and_modular_content_optimizers(self) -> None:
        """T3-18 (F1, F2, F3): Split background GET_FRAME_OPT_BUNDLE <-> modular src/content/{core,css,optimizers}."""
        self.assert_repo_dir("src/content/core")
        self.assert_repo_dir("src/content/css")
        self.assert_repo_dir("src/content/optimizers")
        self.assertFalse(
            (self.PROJECT_ROOT / "src/shared/media-frame-optimizer.js").exists(),
            msg="Monolithic src/shared/media-frame-optimizer.js must be split and removed",
        )

        self.open_background()
        target_apps = [
            "spotify",
            "soundcloud",
            "gemini",
            "claude",
            "perplexity",
            "notion",
            "bluesky",
            "apple-music",
            "google-calendar",
            "google-keep",
        ]
        bundles = self.safe_eval_async(
            """
            const out = [];
            for (const appId of arguments[0]) {
              out.push(await browser.runtime.sendMessage({ type: 'GET_FRAME_OPT_BUNDLE', appId }));
            }
            return out;
            """,
            target_apps,
        )
        for app_id, b in zip(target_apps, bundles):
            self.assertTrue(b.get("ok"), msg=f"GET_FRAME_OPT_BUNDLE failed for {app_id}: {b}")
            self.assertEqual(b.get("appId"), app_id)
            opt_path = b.get("optimizerPath") or ""
            css_path = b.get("cssPath") or ""
            self.assertTrue(opt_path, msg=f"Missing optimizerPath for {app_id}")
            self.assert_repo_file(opt_path)
            if css_path:
                self.assert_repo_file(css_path)

        content_js = sorted((self.PROJECT_ROOT / "src/content").rglob("*.js"))
        self.assertGreater(len(content_js), 1, msg="Expected modular JS files under src/content/")
        syntax_res = self.fx.check_js_syntax(content_js)
        bad = [r for r in syntax_res if not r.get("ok")]
        self.assertEqual(bad, [], msg=f"Firefox SpiderMonkey syntax errors in src/content: {bad}")

    def test_t3_19_split_background_and_split_popup_ctrlk_relay_and_session_clear(self) -> None:
        """T3-19 (F3, F4, F15): Split popup/*.js <-> split background Ctrl+K relay & CLEAR_PERSISTENT_SESSIONS."""
        self.assert_repo_file("src/shared/settings-ui.js")
        popup_html = self.assert_repo_file("src/popup/popup.html").read_text(encoding="utf-8")
        script_srcs = re.findall(r'<script\s+[^>]*src=["\']([^"\']+)["\']', popup_html, flags=re.IGNORECASE)
        self.assertFalse(
            any(s.strip() == "popup.js" or s.strip().endswith("/popup.js") for s in script_srcs),
            msg=f"popup.html must load modular popup scripts rather than monolithic popup.js: {script_srcs}",
        )
        popup_scripts = [s for s in script_srcs if not s.startswith("../shared/")]
        self.assertGreaterEqual(len(popup_scripts), 4, msg=f"Expected modular src/popup/*.js scripts, got: {script_srcs}")

        resolved_js = []
        for s in script_srcs:
            p = (self.PROJECT_ROOT / "src/popup" / s).resolve()
            self.assertTrue(p.is_file(), msg=f"popup.html references missing script: {s}")
            resolved_js.append(p)
        bad = [r for r in self.fx.check_js_syntax(resolved_js) if not r.get("ok")]
        self.assertEqual(bad, [], msg=f"Popup script syntax errors: {bad}")

        settings = make_default_settings_seed(
            persistentOpenAppIds=["spotify"],
            persistentSavedAppUrls={"spotify": "https://open.spotify.com/search"},
            persistentLastActiveAppId="spotify",
        )
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=settings)

        res = self.safe_eval_async(
            """
            const uiWin = window.__bridge.uiWin;
            const uiDoc = window.__bridge.uiDoc;
            const h = uiWin.__foxhubTestHelpers;

            uiWin.postMessage({ source: 'pocketmail-media-frame', type: 'PM_QUICK_SWITCHER_TOGGLE' }, '*');
            await new Promise((r) => setTimeout(r, 100));
            const qsOpened = Boolean(h.findQuickSwitcher(uiDoc));

            const clearRes = await window.browser.runtime.sendMessage({ type: 'CLEAR_PERSISTENT_SESSIONS' });
            const after = await window.browser.runtime.sendMessage({ type: 'GET_STATE' });
            return { qsOpened, clearRes, afterSettings: after.settings };
            """
        )
        self.assertTrue(res["qsOpened"], msg="PM_QUICK_SWITCHER_TOGGLE postMessage relay must open Quick Switcher")
        self.assertTrue(res["clearRes"].get("ok"))
        self.assertEqual(res["afterSettings"].get("persistentOpenAppIds"), [])
        self.assertEqual(res["afterSettings"].get("persistentSavedAppUrls"), {})
        self.assertEqual(res["afterSettings"].get("persistentLastActiveAppId"), "pocketmail")

    def test_t3_20_full_modular_codebase_amo_lint_and_spidermonkey_syntax(self) -> None:
        """T3-20 (F1, F2, F3, F4, F16): Full AMO lint, MV2 manifest >2.7.9, modular scripts & SpiderMonkey parse."""
        manifest = load_manifest_json(self.PROJECT_ROOT)
        self.assertEqual(manifest.get("manifest_version"), 2)
        ver_parts = tuple(int(p) for p in str(manifest.get("version", "0.0.0")).split("."))
        self.assertGreater(ver_parts, (2, 7, 9), msg=f"Manifest version must exceed 2.7.9, got {manifest.get('version')}")
        self.assertIn("contextMenus", manifest.get("permissions") or [])

        # Both background.html and popup.html must be modularized
        popup_html = self.assert_repo_file("src/popup/popup.html").read_text(encoding="utf-8")
        popup_srcs = re.findall(r'<script\s+[^>]*src=["\']([^"\']+)["\']', popup_html, flags=re.IGNORECASE)
        self.assertFalse(
            any(s.strip() == "popup.js" for s in popup_srcs),
            msg="Monolithic popup.js must be split into focused modules",
        )
        bg_html = self.assert_repo_file("src/background/background.html").read_text(encoding="utf-8")
        bg_srcs = re.findall(r'<script\s+[^>]*src=["\']([^"\']+)["\']', bg_html, flags=re.IGNORECASE)
        self.assertFalse(
            any(s.strip() == "background.js" for s in bg_srcs),
            msg="Monolithic background.js must be split into focused modules",
        )

        report = lint_extension(
            self.PROJECT_ROOT,
            check_firefox_js=True,
            firefox_harness=self.fx,
            check_split_budget=True,
        )
        self.assertGreater(report["stats"]["firefox_js_checked"], 0)
        self.assertTrue(
            report["ok"],
            msg=f"AMO lint failed with {len(report['errors'])} errors: {report['errors']}",
        )


if __name__ == "__main__":
    unittest.main()
