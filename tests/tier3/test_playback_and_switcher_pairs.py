"""Tier 3 Module 2: Now Playing, Rail Equalizer, Tab Audio & Quick Switcher Pairs (T3-06 .. T3-11)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from _e2e_helpers import (
    DEFAULT_PINNED_APPS,
    FoxHubE2EBase,
    make_default_settings_seed,
    make_get_state_response,
)


class TestPlaybackAndSwitcherPairs(FoxHubE2EBase):
    """Pairwise cross-feature tests for F5, F7, F8, F10, F13, F15, F17."""

    def test_t3_06_now_playing_bar_and_rail_equalizer_sync(self) -> None:
        """T3-06 (F8, F10): Mini Now Playing bar <-> Left-Rail Equalizer <-> Quick Controls."""
        settings = make_default_settings_seed(
            miniNowPlayingEnabled=True,
            railPlayingIndicatorEnabled=True,
            railQuickControlsEnabled=True,
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
        )
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=settings)

        res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const uiWin = window.__bridge.uiWin;
            const h = uiWin.__foxhubTestHelpers;

            await window.browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/track/midnight',
              playback: {
                isPlaying: true,
                title: 'Midnight City',
                artist: 'M83',
                currentTime: 42,
                duration: 244,
                canPrev: true,
                canNext: true,
              },
            });
            await new Promise((r) => setTimeout(r, 150));

            const railItem = h.getRailAppItems(uiDoc).find((el) => h.inferRailAppId(el) === 'spotify')
              || uiDoc.querySelector('#pm-rail-apps-list [data-app-id="spotify"], #pm-rail-apps-list [data-id="spotify"]')
              || Array.from(uiDoc.querySelectorAll('#pm-rail-apps-list button, #pm-rail-apps-list [role="button"]'))
                   .find((el) => /spotify/i.test((el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + h.normText(el)));
            if (!railItem) return { ok: false, reason: 'Missing Spotify button on left rail' };

            const eqChild = railItem.querySelector('[class*="eq"], [class*="equalizer"], [class*="playing"], [data-playing="true"], [data-equalizer]');
            const hasEqIndicator = Boolean(
              railItem.classList.contains('playing') ||
              railItem.classList.contains('is-playing') ||
              railItem.getAttribute('data-playing') === 'true' ||
              (eqChild && h.isVisible(eqChild))
            );

            const npBar = h.findNowPlayingBar(uiDoc);
            if (!npBar || !h.isVisible(npBar)) {
              return { ok: false, reason: 'Mini Now Playing bar is missing or hidden while Spotify is playing', hasEqIndicator };
            }
            const npText = h.normText(npBar);

            const playPauseBtn = h.findButtonByText(uiDoc, /Play|Pause/i, npBar)
              || npBar.querySelector('[data-cmd="play_pause"], [data-action="play_pause"], [aria-label*="Play" i], [aria-label*="Pause" i]');
            const nextBtn = h.findButtonByText(uiDoc, /Next|Skip/i, npBar)
              || npBar.querySelector('[data-cmd="next"], [data-action="next"], [aria-label*="Next" i]');
            if (!playPauseBtn || !nextBtn) {
              return { ok: false, reason: 'Missing Play/Pause or Next control inside Mini Now Playing bar' };
            }

            const readCmds = () => window.__webextMock
              .getCalls('runtime.sendMessage')
              .map((c) => c.args && c.args[0])
              .filter((m) => m && m.type === 'TOGGLE_NOW_PLAYING_COMMAND')
              .map((m) => m.command);

            window.__webextMock.clearCalls();
            nextBtn.click();
            await new Promise((r) => setTimeout(r, 50));
            playPauseBtn.click();
            await new Promise((r) => setTimeout(r, 60));
            const barCmds = readCmds();

            window.__webextMock.clearCalls();
            const auxTarget = railItem.matches('button, [role="button"]')
              ? railItem
              : (railItem.querySelector('button, [role="button"]') || railItem);
            auxTarget.dispatchEvent(new uiWin.MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
            await new Promise((r) => setTimeout(r, 80));
            const auxCmds = readCmds();

            return { ok: true, hasEqIndicator, npText, barCmds, auxCmds };
            """
        )
        self.assertTrue(res.get("ok"), msg=str(res))
        self.assertTrue(res["hasEqIndicator"], msg="Left-rail Spotify icon must show playing/equalizer indicator")
        self.assertIn("Midnight City", res["npText"])
        self.assertIn("next", res["barCmds"])
        self.assertIn("play_pause", res["barCmds"])
        self.assertTrue(
            any(c in ("mute_toggle", "play_pause") for c in res["auxCmds"]),
            msg=f"Middle-clicking rail Spotify icon should dispatch quick control command, got auxCmds={res['auxCmds']}",
        )

    def test_t3_07_rail_indicator_tooltip_and_tab_audio_autopause(self) -> None:
        """T3-07 (F8, F17): Left-rail playing tooltip & indicator <-> tab-audio auto-pause."""
        ext_tab = {
            "id": 99,
            "windowId": 1,
            "active": True,
            "audible": False,
            "mutedInfo": {"muted": False},
            "url": "https://www.youtube.com/watch?v=abc",
        }
        settings = make_default_settings_seed(
            enabledMediaApps=DEFAULT_PINNED_APPS + ["soundcloud"],
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
            tabAudioBehavior="pause-resume",
            railPlayingIndicatorEnabled=True,
        )
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=settings, tabs=[ext_tab])

        res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const bgWin = window.__bridge.bgWin;
            const h = window.__bridge.uiWin.__foxhubTestHelpers;

            await window.browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'soundcloud',
              url: 'https://soundcloud.com/neon/sunset-synth',
              playback: {
                isPlaying: true,
                title: 'Sunset Synth',
                artist: 'Neon Waves',
                currentTime: 10,
                duration: 195,
              },
            });
            await new Promise((r) => setTimeout(r, 150));

            const findScBtn = () => h.getRailAppItems(uiDoc).find((el) => h.inferRailAppId(el) === 'soundcloud')
              || uiDoc.querySelector('#pm-rail-apps-list [data-app-id="soundcloud"], #pm-rail-apps-list [data-id="soundcloud"]')
              || Array.from(uiDoc.querySelectorAll('#pm-rail-apps-list button, #pm-rail-apps-list [role="button"]'))
                   .find((el) => /soundcloud/i.test((el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + h.normText(el)));
            const hasActivePlayingIndicator = (btn) => {
              if (!btn) return false;
              if (
                btn.classList.contains('playing') ||
                btn.classList.contains('is-playing') ||
                btn.getAttribute('data-playing') === 'true'
              ) {
                return true;
              }
              const eqChild = btn.querySelector('[class*="eq"], [class*="equalizer"], [class*="playing"], [data-playing="true"], [data-equalizer]');
              return Boolean(eqChild && h.isVisible(eqChild));
            };

            const scBtn = findScBtn();
            if (!scBtn) return { ok: false, reason: 'Missing SoundCloud button on left rail' };

            const tooltipNodes = [scBtn, ...Array.from(scBtn.querySelectorAll('[title], [aria-label], [data-tooltip]'))];
            const tooltipBlob = [
              ...tooltipNodes.map((n) => [
                n.getAttribute('title') || '',
                n.getAttribute('aria-label') || '',
                n.getAttribute('data-tooltip') || '',
              ].join(' ')),
              h.normText(scBtn),
            ].join(' ');
            const hasTrackTooltip = /Sunset Synth/i.test(tooltipBlob);
            const playingBefore = hasActivePlayingIndicator(scBtn);

            // Simulate external YouTube tab playback starting & triggering auto-pause
            const playingTab = { ...arguments[0], audible: true };
            await window.__webextMock.tabs.triggerUpdated(99, { audible: true }, playingTab);
            window.__webextMock.configure({ senderTab: playingTab });
            await window.browser.runtime.sendMessage({ type: 'EXTERNAL_TAB_MEDIA_PLAYING' });
            await new Promise((r) => setTimeout(r, 160));

            const bootState = bgWin.__pmGetSyncBootState ? bgWin.__pmGetSyncBootState() : null;
            const scBtnAfter = findScBtn();
            const playingAfter = hasActivePlayingIndicator(scBtnAfter);

            return {
              ok: true,
              hasTrackTooltip,
              tooltipBlob,
              playingBefore,
              playingAfter,
              isAutoPausedByTabAudio: Boolean(bootState && bootState.isAutoPausedByTabAudio),
            };
            """,
            ext_tab,
        )
        self.assertTrue(res.get("ok"), msg=str(res))
        self.assertTrue(res["playingBefore"], msg="SoundCloud rail icon must show active playing state before auto-pause")
        self.assertTrue(
            res["hasTrackTooltip"],
            msg=f"SoundCloud rail icon hover tooltip/label must include active track 'Sunset Synth', got: {res['tooltipBlob']!r}",
        )
        self.assertTrue(res["isAutoPausedByTabAudio"], msg="Background must enter isAutoPausedByTabAudio state")
        self.assertFalse(res["playingAfter"], msg="SoundCloud rail icon must transition out of active playing state on auto-pause")

    def test_t3_08_bg_keepalive_and_now_playing_autohide_paused(self) -> None:
        """T3-08 (F10, F17): Background keep-alive <-> Mini Now Playing auto-hide when paused."""
        settings = make_default_settings_seed(
            miniNowPlayingEnabled=True,
            miniNowPlayingAutoHidePaused=True,
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
        )
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=settings)

        res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const h = window.__bridge.uiWin.__foxhubTestHelpers;

            await window.browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/track/midnight',
              playback: {
                isPlaying: true,
                title: 'Midnight City',
                artist: 'M83',
                currentTime: 25,
                duration: 244,
              },
            });
            await window.browser.runtime.sendMessage({
              type: 'SIDEBAR_CLOSED_HANDOFF',
              activeAppId: 'pocketmail',
              playingApps: [{ appId: 'spotify', url: 'https://open.spotify.com/track/midnight', title: 'Midnight City', isPlaying: true }],
            });
            await new Promise((r) => setTimeout(r, 150));

            const np1 = h.findNowPlayingBar(uiDoc);
            if (!np1 || !h.isVisible(np1)) {
              return { ok: false, reason: 'Now Playing bar not visible during background keep-alive playback' };
            }

            // Pause playback via TOGGLE_NOW_PLAYING_COMMAND with autoHidePaused=true
            await window.browser.runtime.sendMessage({
              type: 'TOGGLE_NOW_PLAYING_COMMAND',
              appId: 'spotify',
              command: 'play_pause',
            });
            await new Promise((r) => setTimeout(r, 140));
            const visibleWhenPausedAutoHide = Boolean(h.findNowPlayingBar(uiDoc) && h.isVisible(h.findNowPlayingBar(uiDoc)));

            // Disable autoHidePaused -> bar should become visible in paused state
            await window.browser.runtime.sendMessage({
              type: 'UPDATE_SETTINGS',
              settings: { miniNowPlayingAutoHidePaused: false },
            });
            await new Promise((r) => setTimeout(r, 140));
            const np3 = h.findNowPlayingBar(uiDoc);
            const visibleWhenAutoHideOff = Boolean(np3 && h.isVisible(np3));

            return { ok: true, visibleWhenPausedAutoHide, visibleWhenAutoHideOff };
            """
        )
        self.assertTrue(res.get("ok"), msg=str(res))
        self.assertFalse(res["visibleWhenPausedAutoHide"], msg="Now Playing bar must auto-hide when paused and miniNowPlayingAutoHidePaused=true")
        self.assertTrue(res["visibleWhenAutoHideOff"], msg="Now Playing bar must stay visible when paused and miniNowPlayingAutoHidePaused=false")

    def test_t3_09_narrow_sidebar_overflow_menu_compact_nowplaying_and_quick_switcher(self) -> None:
        """T3-09 (F7, F10, F15): Narrow 320x640 sidebar ... menu + compact Now Playing + Ctrl+K switcher."""
        settings = make_default_settings_seed(
            miniNowPlayingEnabled=True,
            miniNowPlayingCompact=True,
            quickSwitcherEnabled=True,
        )
        state_seed = self.build_base_seed(settings=settings, include_message_responses=True)
        state_seed["messageResponses"]["GET_STATE"] = make_get_state_response(
            settings,
            nowPlaying={
                "appId": "spotify",
                "appName": "Spotify",
                "isPlaying": True,
                "title": "Midnight City",
                "artist": "M83",
                "currentTime": 40,
                "duration": 244,
                "canPrev": True,
                "canNext": True,
            },
        )
        self.server.set_seed(state_seed)
        self.fx.navigate(self.server.url_for("/src/popup/popup.html?sidebar=1"))
        self.ensure_semantic_helpers()
        self.fx.set_viewport(320, 640)

        overflow_res = self.safe_eval_async(
            """
            const h = window.__foxhubTestHelpers;
            const deadline = Date.now() + 2000;
            while (Date.now() < deadline) {
              if (h.findRailRoot(document) && (h.findOverflowButton(document) || h.findNowPlayingBar(document))) {
                break;
              }
              await new Promise((r) => setTimeout(r, 25));
            }
            await new Promise((r) => setTimeout(r, 60));

            const overflowWidth = document.documentElement.scrollWidth;
            const moreBtn = h.findOverflowButton(document);
            if (!moreBtn) {
              return { ok: false, reason: 'Missing narrow-mode overflow (...) menu button in header', overflowWidth };
            }
            const btnRect = h.getRect(moreBtn);
            moreBtn.click();
            await new Promise((r) => setTimeout(r, 80));

            const menuPop = Array.from(document.querySelectorAll('[role="menu"], .pm-overflow-menu, .pm-more-menu, [data-overflow-popover]'))
              .find((el) => h.isVisible(el));
            const menuRect = menuPop ? h.getRect(menuPop) : null;
            const npBar = h.findNowPlayingBar(document);
            const npRect = npBar && h.isVisible(npBar) ? h.getRect(npBar) : null;

            moreBtn.click();
            await new Promise((r) => setTimeout(r, 50));
            return { ok: true, overflowWidth, btnRect, menuRect, npRect };
            """
        )
        self.assertTrue(overflow_res.get("ok"), msg=str(overflow_res))
        self.assertLessEqual(overflow_res["overflowWidth"], 320)
        self.assertIsNotNone(overflow_res["menuRect"], msg="Clicking ... overflow button must open visible menu")
        self.assertGreater(overflow_res["menuRect"]["width"], 0)
        self.assertGreater(overflow_res["menuRect"]["height"], 0)
        self.assertGreaterEqual(overflow_res["menuRect"]["left"], 0)
        self.assertLessEqual(overflow_res["menuRect"]["right"], 320)
        self.assertLessEqual(overflow_res["menuRect"]["bottom"], 640)
        self.assertIsNotNone(overflow_res["npRect"], msg="Compact Mini Now Playing bar must be visible at 320x640")
        self.assertGreater(overflow_res["npRect"]["width"], 0)
        self.assertGreater(overflow_res["npRect"]["height"], 0)
        self.assertGreaterEqual(overflow_res["npRect"]["left"], 0)
        self.assertLessEqual(overflow_res["npRect"]["right"], 320)
        self.assertLessEqual(overflow_res["npRect"]["bottom"], 640)

        # Trigger Ctrl+K Quick Switcher at 320x640
        self.fx.press_shortcut("k", ctrl=True)
        qs_res = self.safe_eval_async(
            """
            await new Promise((r) => setTimeout(r, 80));
            const h = window.__foxhubTestHelpers;
            const qs = h.findQuickSwitcher(document);
            if (!qs) return { ok: false, reason: 'Ctrl+K did not open Quick Switcher at 320x640' };
            return { ok: true, qsRect: h.getRect(qs), scrollWidth: document.documentElement.scrollWidth };
            """
        )
        self.assertTrue(qs_res.get("ok"), msg=str(qs_res))
        self.assertGreaterEqual(qs_res["qsRect"]["left"], 0)
        self.assertLessEqual(qs_res["qsRect"]["right"], 320)
        self.assertLessEqual(qs_res["scrollWidth"], 320)

    def test_t3_10_quick_switcher_night_mode_and_mute_sync(self) -> None:
        """T3-10 (F5, F15): Ctrl+K Quick Switcher Night Mode & Mute toggles <-> settings sync."""
        settings = make_default_settings_seed(
            theme="warm-linen",
            previousDayTheme="warm-linen",
            muteSiteNotifications=False,
            quickSwitcherEnabled=True,
        )
        self.open_ui_toplevel("src/popup/popup.html", "?sidebar=1", settings=settings)

        self.fx.press_shortcut("k", ctrl=True)
        res1 = self.safe_eval_async(
            """
            await new Promise((r) => setTimeout(r, 80));
            const h = window.__foxhubTestHelpers;
            const qs = h.findQuickSwitcher(document);
            if (!qs) return { ok: false, reason: 'Ctrl+K did not open Quick Switcher' };
            const inp = qs.querySelector('input');
            if (!inp) return { ok: false, reason: 'Quick Switcher missing search input' };
            h.setInputValue(inp, 'Night Mode');
            await new Promise((r) => setTimeout(r, 60));
            if (!h.clickQuickSwitcherOption(qs, /night/i)) return { ok: false, reason: 'Quick Switcher missing Night Mode action' };
            await new Promise((r) => setTimeout(r, 80));
            const st = await browser.storage.local.get('settings');
            return { ok: true, settings: st.settings || {} };
            """
        )
        self.assertTrue(res1.get("ok"), msg=str(res1))
        self.assertEqual(res1["settings"].get("theme"), "true-night")

        # Toggle Mute via Ctrl+K, then toggle Night Mode back off
        self.fx.press_shortcut("k", ctrl=True)
        res2 = self.safe_eval_async(
            """
            await new Promise((r) => setTimeout(r, 80));
            const h = window.__foxhubTestHelpers;
            const qs = h.findQuickSwitcher(document);
            if (!qs) return { ok: false, reason: 'Ctrl+K did not reopen for Mute' };
            const inp = qs.querySelector('input');
            h.setInputValue(inp, 'Mute');
            await new Promise((r) => setTimeout(r, 60));
            if (!h.clickQuickSwitcherOption(qs, /mute/i)) return { ok: false, reason: 'Quick Switcher missing Mute action' };
            await new Promise((r) => setTimeout(r, 80));
            const st = await browser.storage.local.get('settings');
            return { ok: true, settings: st.settings || {} };
            """
        )
        self.assertTrue(res2.get("ok"), msg=str(res2))
        self.assertTrue(
            bool(res2["settings"].get("muteSiteNotifications")) or bool(res2["settings"].get("muteAllNotifications")),
            msg=f"Mute command from Quick Switcher must update mute setting: {res2['settings']}",
        )

    def test_t3_11_quick_switcher_with_newly_enabled_presets_and_adhoc_url(self) -> None:
        """T3-11 (F13, F15): Ctrl+K Quick Switcher <-> newly enabled presets & ad-hoc URL launch."""
        settings = make_default_settings_seed(enabledMediaApps=list(DEFAULT_PINNED_APPS))
        self.open_ui_toplevel("src/popup/popup.html", "?sidebar=1", settings=settings)

        # Fresh defaults: claude must not appear in default empty-query pinned list, and before enabling
        # typing "Claude" either hides it or marks it explicitly 'Open app'/'Unpinned' (never 'Pinned')
        self.fx.press_shortcut("k", ctrl=True)
        res_before = self.safe_eval_async(
            """
            await new Promise((r) => setTimeout(r, 80));
            const h = window.__foxhubTestHelpers;
            const qs = h.findQuickSwitcher(document);
            if (!qs) return { ok: false, reason: 'Ctrl+K did not open Quick Switcher' };
            const defaultClaudeOpt = h.findQuickSwitcherOption(qs, /claude/i);
            const inp = qs.querySelector('input');
            h.setInputValue(inp, 'Claude');
            await new Promise((r) => setTimeout(r, 60));
            const claudeMatches = Array.from(qs.querySelectorAll('[role="option"], li, button, a'))
              .filter((el) => h.isVisible(el) && /claude/i.test(h.normText(el)));
            const claudeOpt = claudeMatches[0] || null;
            const claudeText = claudeOpt ? h.normText(claudeOpt) : '';
            return {
              ok: true,
              defaultClaudeVisible: Boolean(defaultClaudeOpt),
              claudeVisibleBeforePin: Boolean(claudeOpt),
              claudeText,
            };
            """
        )
        self.assertTrue(res_before.get("ok"), msg=str(res_before))
        self.assertFalse(
            res_before["defaultClaudeVisible"],
            msg="Unpinned Claude must not appear in default pinned Quick Switcher list",
        )
        if res_before["claudeVisibleBeforePin"]:
            txt = res_before["claudeText"]
            self.assertRegex(
                txt,
                r"(?i)\b(open\s*app|unpinned)\b",
                msg=f"Unpinned Claude surfaced on search must be tagged 'Open app'/'Unpinned', got: {txt!r}",
            )
            self.assertNotRegex(
                txt,
                r"(?i)\bpinned\b",
                msg=f"Unpinned Claude must never be tagged 'Pinned' before enabling, got: {txt!r}",
            )

        # Enable claude & gemini, reload, verify Claude searchable & launchable, plus ad-hoc URL & javascript: rejection
        settings_enabled = make_default_settings_seed(enabledMediaApps=list(DEFAULT_PINNED_APPS) + ["claude", "gemini"])
        self.open_ui_toplevel("src/popup/popup.html", "?sidebar=1", settings=settings_enabled)

        echo_url = self.server.url_for("/mock/echo")
        self.fx.press_shortcut("k", ctrl=True)
        res_after = self.safe_eval_async(
            """
            await new Promise((r) => setTimeout(r, 80));
            const h = window.__foxhubTestHelpers;
            const qs = h.findQuickSwitcher(document);
            if (!qs) return { ok: false, reason: 'Ctrl+K did not open after enabling presets' };
            const inp = qs.querySelector('input');
            h.setInputValue(inp, 'Claude');
            await new Promise((r) => setTimeout(r, 60));
            const claudeOpt = h.findQuickSwitcherOption(qs, /claude/i);
            if (!claudeOpt) return { ok: false, reason: 'Newly pinned Claude missing from Quick Switcher' };
            h.clickQuickSwitcherOption(qs, /claude/i);
            await new Promise((r) => setTimeout(r, 100));
            const claudeLaunched = Array.from(document.querySelectorAll('iframe')).some((f) => /claude\\.ai/i.test(f.src || ''))
              || Boolean(document.querySelector('[data-app-id="claude"].active, [data-id="claude"].active'));

            // Re-open Quick Switcher and test ad-hoc URL
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
            await new Promise((r) => setTimeout(r, 80));
            const qsAdhoc = h.findQuickSwitcher(document);
            if (!qsAdhoc) return { ok: false, reason: 'Ctrl+K did not reopen for ad-hoc URL' };
            const inpAdhoc = qsAdhoc.querySelector('input');
            h.setInputValue(inpAdhoc, arguments[0]);
            await new Promise((r) => setTimeout(r, 60));
            if (!h.clickQuickSwitcherOption(qsAdhoc, /open|mock\\/echo/i)) {
              inpAdhoc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            }
            await new Promise((r) => setTimeout(r, 120));
            const iframes = Array.from(document.querySelectorAll('iframe')).map((f) => f.src || '');

            // Test unsafe javascript: URL rejection
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
            await new Promise((r) => setTimeout(r, 60));
            const qs2 = h.findQuickSwitcher(document);
            if (qs2) {
              const inp2 = qs2.querySelector('input');
              h.setInputValue(inp2, 'javascript:alert(1)');
              inp2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
              await new Promise((r) => setTimeout(r, 60));
            }
            const jsFrames = Array.from(document.querySelectorAll('iframe')).filter((f) => /^javascript:/i.test(f.src || ''));
            return { ok: true, claudeLaunched, iframes, jsFrameCount: jsFrames.length };
            """,
            echo_url,
        )
        self.assertTrue(res_after.get("ok"), msg=str(res_after))
        self.assertTrue(res_after["claudeLaunched"], msg="Newly pinned Claude must be launchable from Quick Switcher")
        self.assertTrue(any("/mock/echo" in src for src in res_after["iframes"]), msg=f"Ad-hoc URL did not open in sidebar frame: {res_after['iframes']}")
        self.assertEqual(res_after["jsFrameCount"], 0)


if __name__ == "__main__":
    unittest.main()
