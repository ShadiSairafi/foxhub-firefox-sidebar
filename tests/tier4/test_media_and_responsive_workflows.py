"""Tier 4 Module 2: Background Playback, Tab-Audio Auto-Pause/Resume & Narrow Responsive Workflows (T4-02, T4-03, T4-06)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_TIER3_DIR = Path(__file__).resolve().parent.parent / "tier3"
if str(_TIER3_DIR) not in sys.path:
    sys.path.insert(0, str(_TIER3_DIR))

from _e2e_helpers import (
    DEFAULT_PINNED_APPS,
    FoxHubE2EBase,
    make_default_settings_seed,
    make_get_state_response,
)


class TestMediaAndResponsiveWorkflows(FoxHubE2EBase):
    """Real-world E2E scenarios 2, 3, and 6."""

    def test_t4_02_scenario_2_music_playback_while_triaging_gmail(self) -> None:
        """T4-02 (F8, F10, F17): Music playback while triaging Gmail (Now Playing + rail equalizer + quick controls + keep-alive)."""
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
            const bgWin = window.__bridge.bgWin;
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
            await new Promise((r) => setTimeout(r, 140));

            const mailBtn = uiDoc.getElementById('rail-btn-mail');
            if (mailBtn) mailBtn.click();
            const threadRow = uiDoc.querySelector('.pm-email-item, .mock-thread-row, [data-thread-id]');
            if (threadRow) threadRow.click();
            await new Promise((r) => setTimeout(r, 60));

            const spBtn = h.getRailAppItems(uiDoc).find((el) => h.inferRailAppId(el) === 'spotify')
              || uiDoc.querySelector('#pm-rail-apps-list [data-app-id="spotify"], #pm-rail-apps-list [data-id="spotify"]')
              || Array.from(uiDoc.querySelectorAll('#pm-rail-apps-list button, #pm-rail-apps-list [role="button"]'))
                   .find((el) => /spotify/i.test((el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + h.normText(el)));
            if (!spBtn) return { ok: false, reason: 'Missing Spotify rail button' };

            const eqChild = spBtn.querySelector('[class*="eq"], [class*="equalizer"], [class*="playing"], [data-playing="true"], [data-equalizer]');
            const hasEq = Boolean(
              spBtn.classList.contains('playing') ||
              spBtn.classList.contains('is-playing') ||
              spBtn.getAttribute('data-playing') === 'true' ||
              (eqChild && h.isVisible(eqChild))
            );
            const tooltipNodes = [spBtn, ...Array.from(spBtn.querySelectorAll('[title], [aria-label], [data-tooltip]'))];
            const tooltipText = tooltipNodes.map((n) => [
              n.getAttribute('title') || '',
              n.getAttribute('aria-label') || '',
              n.getAttribute('data-tooltip') || '',
            ].join(' ')).join(' ');

            const npBar = h.findNowPlayingBar(uiDoc);
            if (!npBar || !h.isVisible(npBar)) return { ok: false, reason: 'Mini Now Playing bar not visible while triaging Gmail' };
            const npText = h.normText(npBar);

            const nextBtn = h.findButtonByText(uiDoc, /Next|Skip/i, npBar)
              || npBar.querySelector('[data-cmd="next"], [aria-label*="Next" i]');
            const playPauseBtn = h.findButtonByText(uiDoc, /Play|Pause/i, npBar)
              || npBar.querySelector('[data-cmd="play_pause"], [aria-label*="Play" i], [aria-label*="Pause" i]');
            if (!nextBtn || !playPauseBtn) return { ok: false, reason: 'Missing Next or Play/Pause in Now Playing bar' };

            const readCmds = () => window.__webextMock
              .getCalls('runtime.sendMessage')
              .map((c) => c.args && c.args[0])
              .filter((m) => m && m.type === 'TOGGLE_NOW_PLAYING_COMMAND')
              .map((m) => m.command);

            window.__webextMock.clearCalls();
            nextBtn.click();
            await new Promise((r) => setTimeout(r, 40));
            playPauseBtn.click();
            await new Promise((r) => setTimeout(r, 60));
            const barCmds = readCmds();

            window.__webextMock.clearCalls();
            const auxTarget = spBtn.matches('button, [role="button"]')
              ? spBtn
              : (spBtn.querySelector('button, [role="button"]') || spBtn);
            auxTarget.dispatchEvent(new uiWin.MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
            await new Promise((r) => setTimeout(r, 80));
            const auxCmds = readCmds();

            // Handoff to background keep-alive on close
            await window.browser.runtime.sendMessage({
              type: 'SIDEBAR_CLOSED_HANDOFF',
              activeAppId: 'pocketmail',
              playingApps: [{ appId: 'spotify', url: 'https://open.spotify.com/track/midnight', title: 'Midnight City', isPlaying: true }],
            });
            const boot = bgWin.__pmGetSyncBootState ? bgWin.__pmGetSyncBootState() : null;

            return {
              ok: true,
              hasEq,
              tooltipText,
              npText,
              barCmds,
              auxCmds,
              activeBgIds: (boot && boot.activeBgApps ? boot.activeBgApps : []).map((a) => a.appId),
            };
            """
        )
        self.assertTrue(res.get("ok"), msg=str(res))
        self.assertTrue(res["hasEq"], msg="Left-rail Spotify icon must display playing equalizer")
        self.assertIn("Midnight City", res["tooltipText"])
        self.assertIn("Midnight City", res["npText"])
        self.assertIn("next", res["barCmds"])
        self.assertIn("play_pause", res["barCmds"])
        self.assertTrue(
            any(c in ("mute_toggle", "play_pause") for c in res["auxCmds"]),
            msg=f"Middle-clicking Spotify rail icon must dispatch quick control command, got auxCmds={res['auxCmds']}",
        )
        self.assertIn("spotify", res["activeBgIds"], msg="Spotify keep-alive must activate on sidebar close handoff")

    def test_t4_03_scenario_3_tab_audio_autopause_and_autoresume_external_youtube(self) -> None:
        """T4-03 (F1, F2, F17): External YouTube tab (tab-media-watcher.js) <-> background Spotify/SoundCloud auto-pause, 340ms auto-resume & manual override."""
        self.assert_repo_file("src/content/tab-media-watcher.js")

        # Step 1: Lightweight content watcher on normal page
        self.fx.navigate(self.server.url_for("/mock/normal-tab?playing=0&inject_content=/src/content/tab-media-watcher.js"))
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
        watcher = self.safe_eval_async(
            """
            const deadline = Date.now() + 1500;
            let types = [];
            while (Date.now() < deadline) {
              types = window.__webextMock
                .getCalls('runtime.sendMessage')
                .map((c) => c.args && c.args[0] && c.args[0].type)
                .filter(Boolean);
              if (types.includes('EXTERNAL_TAB_MEDIA_STOPPED')) return types;
              await new Promise((r) => setTimeout(r, 30));
            }
            return types;
            """
        )
        self.assertIn("EXTERNAL_TAB_MEDIA_PLAYING", watcher)
        self.assertIn("EXTERNAL_TAB_MEDIA_STOPPED", watcher)

        # Step 2..5: Full background auto-pause, 340ms auto-resume, and manual override
        yt_tab = {
            "id": 42,
            "windowId": 1,
            "active": True,
            "audible": False,
            "mutedInfo": {"muted": False},
            "url": "https://www.youtube.com/watch?v=xyz",
        }
        settings = make_default_settings_seed(
            tabAudioBehavior="pause-resume",
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
        )
        self.open_background(settings=settings, tabs=[yt_tab])

        res = self.safe_eval_async(
            """
            await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/track/1',
              playback: { isPlaying: true, title: 'Midnight City', currentTime: 15, duration: 244 },
            });
            await browser.runtime.sendMessage({
              type: 'SIDEBAR_CLOSED_HANDOFF',
              playingApps: [{ appId: 'spotify', url: 'https://open.spotify.com/track/1', title: 'Midnight City', isPlaying: true }],
            });

            const playingTab = { ...arguments[0], audible: true };
            await window.__webextMock.tabs.triggerUpdated(42, { audible: true }, { audible: true });
            window.__webextMock.configure({ senderTab: playingTab });
            await browser.runtime.sendMessage({ type: 'EXTERNAL_TAB_MEDIA_PLAYING' });
            await new Promise((r) => setTimeout(r, 100));
            const autoPaused = window.__pmGetSyncBootState().isAutoPausedByTabAudio;

            await window.__webextMock.tabs.triggerUpdated(42, { audible: false }, { audible: false });
            await browser.runtime.sendMessage({ type: 'EXTERNAL_TAB_MEDIA_STOPPED' });
            await new Promise((r) => setTimeout(r, 520));
            const autoResumedPausedFlag = window.__pmGetSyncBootState().isAutoPausedByTabAudio;

            // Trigger pause again, then manual override while tab 42 stays audible
            await window.__webextMock.tabs.triggerUpdated(42, { audible: true }, { audible: true });
            await browser.runtime.sendMessage({ type: 'EXTERNAL_TAB_MEDIA_PLAYING' });
            await new Promise((r) => setTimeout(r, 100));
            const pausedBeforeOverride = window.__pmGetSyncBootState().isAutoPausedByTabAudio;

            await browser.runtime.sendMessage({
              type: 'TOGGLE_NOW_PLAYING_COMMAND',
              appId: 'spotify',
              command: 'play_pause',
            });
            await new Promise((r) => setTimeout(r, 80));
            const pausedAfterOverride = window.__pmGetSyncBootState().isAutoPausedByTabAudio;

            const diagRes = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });
            const rawEvs = diagRes && diagRes.diagnostics
              ? (diagRes.diagnostics.recentEvents || diagRes.diagnostics.events || [])
              : [];
            const diagEvents = rawEvs.map((e) => e.event);

            return {
              autoPaused,
              autoResumedPausedFlag,
              pausedBeforeOverride,
              pausedAfterOverride,
              diagEvents,
            };
            """,
            yt_tab,
        )
        self.assertTrue(res["autoPaused"])
        self.assertFalse(res["autoResumedPausedFlag"])
        self.assertTrue(res["pausedBeforeOverride"])
        self.assertFalse(res["pausedAfterOverride"])
        self.assertIn("tab-audio-auto-pause", res["diagEvents"])
        self.assertIn("tab-audio-auto-resume", res["diagEvents"])
        self.assertIn("tab-manual-override", res["diagEvents"])

    def test_t4_06_scenario_6_narrow_sidebar_responsive_workflow(self) -> None:
        """T4-06 (F7, F10, F15): Narrow 320x640 sidebar workflow (... menu, zero overlap, Ctrl+K switcher, compact Now Playing)."""
        settings = make_default_settings_seed(
            enabledMediaApps=list(DEFAULT_PINNED_APPS) + ["soundcloud"],
            miniNowPlayingEnabled=True,
            miniNowPlayingCompact=True,
            quickSwitcherEnabled=True,
        )
        seed = self.build_base_seed(settings=settings, include_message_responses=True)
        seed["messageResponses"]["GET_STATE"] = make_get_state_response(
            settings,
            nowPlaying={
                "appId": "soundcloud",
                "appName": "SoundCloud",
                "isPlaying": True,
                "title": "Sunset Synth",
                "artist": "Neon Waves",
                "currentTime": 35,
                "duration": 195,
                "canPrev": True,
                "canNext": True,
            },
        )
        self.server.set_seed(seed)
        self.fx.navigate(self.server.url_for("/src/popup/popup.html?sidebar=1"))
        self.ensure_semantic_helpers()
        self.fx.set_viewport(320, 640)

        layout = self.safe_eval_async(
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

            const scrollWidth = document.documentElement.scrollWidth;
            const moreBtn = h.findOverflowButton(document);
            if (!moreBtn) return { ok: false, reason: 'Missing narrow-mode ... overflow menu button' };

            const header = document.querySelector('header');
            const npBar = h.findNowPlayingBar(document);
            if (!npBar || !h.isVisible(npBar)) {
              return { ok: false, reason: 'Compact Mini Now Playing bar not visible at 320x640' };
            }
            const npRect = h.getRect(npBar);
            const hdrRect = header ? h.getRect(header) : null;

            moreBtn.click();
            await new Promise((r) => setTimeout(r, 80));
            const menu = Array.from(document.querySelectorAll('[role="menu"], .pm-overflow-menu, .pm-more-menu, [data-overflow-popover]'))
              .find((el) => h.isVisible(el));
            if (!menu) {
              return { ok: false, reason: 'Clicking ... button did not open visible overflow menu' };
            }
            const menuRect = h.getRect(menu);
            moreBtn.click();
            await new Promise((r) => setTimeout(r, 50));

            return { ok: true, scrollWidth, npRect, hdrRect, menuRect };
            """
        )
        self.assertTrue(layout.get("ok"), msg=str(layout))
        self.assertLessEqual(layout["scrollWidth"], 320)
        self.assertGreater(layout["npRect"]["width"], 0)
        self.assertGreater(layout["npRect"]["height"], 0)
        self.assertGreaterEqual(layout["npRect"]["left"], 0)
        self.assertLessEqual(layout["npRect"]["right"], 320)
        self.assertLessEqual(layout["npRect"]["bottom"], 640)
        self.assertGreater(layout["menuRect"]["width"], 0)
        self.assertGreater(layout["menuRect"]["height"], 0)
        self.assertGreaterEqual(layout["menuRect"]["left"], 0)
        self.assertLessEqual(layout["menuRect"]["right"], 320)
        self.assertLessEqual(layout["menuRect"]["bottom"], 640)
        if layout["hdrRect"]:
            self.assertGreaterEqual(layout["npRect"]["top"], layout["hdrRect"]["bottom"] - 1)

        # Ctrl+K Quick Switcher at 320x640 -> filter & launch Spotify
        self.fx.press_shortcut("k", ctrl=True)
        qs_res = self.safe_eval_async(
            """
            await new Promise((r) => setTimeout(r, 80));
            const h = window.__foxhubTestHelpers;
            const qs = h.findQuickSwitcher(document);
            if (!qs) return { ok: false, reason: 'Ctrl+K Quick Switcher did not open at 320x640' };
            const qsRect = h.getRect(qs);
            const inp = qs.querySelector('input');
            if (!inp) return { ok: false, reason: 'Quick Switcher missing input' };
            h.setInputValue(inp, 'Spotify');
            await new Promise((r) => setTimeout(r, 60));
            if (!h.clickQuickSwitcherOption(qs, /spotify/i)) return { ok: false, reason: 'Quick Switcher did not list Spotify' };
            await new Promise((r) => setTimeout(r, 100));
            return { ok: true, qsRect, scrollWidth: document.documentElement.scrollWidth };
            """
        )
        self.assertTrue(qs_res.get("ok"), msg=str(qs_res))
        self.assertGreaterEqual(qs_res["qsRect"]["left"], 0)
        self.assertLessEqual(qs_res["qsRect"]["right"], 320)
        self.assertLessEqual(qs_res["scrollWidth"], 320)

    def test_t4_r1_spotify_bg_to_sidebar_reopen_continuity(self) -> None:
        """T4-R1: Background Spotify auto-advance + sidebar reopen preserves track/position & avoids stale /track/OLD URL."""
        settings = make_default_settings_seed(
            persistenceMode="selected",
            persistentAppIds=[],
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
        )
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=settings)

        # 1. Simulate Spotify playing 'Midnight City' on /track/old123, close sidebar -> bg auto-advances to 'Afterlife'
        prep = self.safe_eval_async(
            """
            const bgWin = window.__bridge.bgWin;
            const bg = bgWin.FoxHubBg;
            const oldTrackUrl = 'https://open.spotify.com/track/old123';
            await bgWin.browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              activeAppId: 'spotify',
              appId: 'spotify',
              url: oldTrackUrl,
              playback: {
                isPlaying: true,
                title: 'Midnight City',
                artist: 'M83',
                currentTime: 180,
                duration: 244,
                resumeUrl: oldTrackUrl
              }
            });
            await bgWin.browser.runtime.sendMessage({
              type: 'SIDEBAR_CLOSED_HANDOFF',
              activeAppId: 'spotify',
              savedUrls: { spotify: oldTrackUrl },
              playingApps: [{ appId: 'spotify', url: oldTrackUrl, title: 'Midnight City', isPlaying: true }]
            });
            await bg.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 50, 'bg');
            const sp = bg.bgSpEmePlayers.get('spotify');
            let _paused = false;
            Object.defineProperty(sp.videoEl, 'paused', { get: () => _paused, configurable: true });
            Object.defineProperty(sp.videoEl, 'currentTime', { get: () => 52.4, set: () => {}, configurable: true });
            sp.videoEl.pause = () => { _paused = true; };
            sp.videoEl.play = () => { _paused = false; return Promise.resolve(); };
            sp.sb = { buffered: { length: 1, start: () => 0, end: () => 90 } };

            // Background auto-advances to 'Afterlife' without mutating window.location.href (/track/old123)
            bgWin.__pmHandleSpEmeBridge('spotify', {
              bridgeType: 'SYNC_TIME',
              paused: false,
              currentTime: 52.4,
              duration: 210,
              trackTitle: 'Afterlife',
              artist: 'Arcade Fire',
              href: oldTrackUrl
            }, 'bg');

            const handoff = await bgWin.browser.runtime.sendMessage({ type: 'STOP_BG_AUDIO_HANDOFF' });
            return {
              handoffApp: (handoff.activeBgApps || []).find((a) => a.appId === 'spotify') || null
            };
            """
        )
        self.assertIsNotNone(prep["handoffApp"])
        self.assertEqual(prep["handoffApp"]["trackTitle"], "Afterlife")
        self.assertEqual(prep["handoffApp"]["urlTrackTitle"], "Midnight City")
        self.assertGreaterEqual(prep["handoffApp"]["currentTime"], 52)

        # 2. Simulate fresh sidebar reopen on uiWin: verify stale /track/old123 resolves to https://open.spotify.com/,
        #    while /playlist/my-list stays preserved, and AUTO_RESUME_PLAYBACK carries expectedTrackTitle: 'Afterlife'.
        reopen = self.safe_eval_async(
            """
            const uiWin = window.__bridge.uiWin;
            const P = uiWin.FoxHubPopup;
            P.state.bgNowPlayingState = { appId: 'spotify', title: 'Afterlife', currentTime: 52, duration: 210 };
            P.state.pendingTakeoverMeta.set('spotify', {
              trackTitle: 'Afterlife',
              artist: 'Arcade Fire',
              currentTime: 52,
              duration: 210,
              resumeUrl: 'https://open.spotify.com/track/old123',
              urlTrackTitle: 'Midnight City'
            });
            const resolvedStaleTrack = P.resolveSpotifyReopenUrl('https://open.spotify.com/track/old123');
            const resolvedMatchingTrack = P.resolveSpotifyReopenUrl('https://open.spotify.com/track/cur999');
            const resolvedPlaylist = P.resolveSpotifyReopenUrl('https://open.spotify.com/playlist/my-list');
            const autoResumePayload = P.buildAutoResumePayload('spotify');
            return {
              resolvedStaleTrack,
              resolvedMatchingTrack,
              resolvedPlaylist,
              autoResumePayload
            };
            """
        )
        self.assertEqual(reopen["resolvedStaleTrack"], "https://open.spotify.com/")
        self.assertEqual(reopen["resolvedMatchingTrack"], "https://open.spotify.com/track/cur999")
        self.assertEqual(reopen["resolvedPlaylist"], "https://open.spotify.com/playlist/my-list")
        self.assertEqual(reopen["autoResumePayload"]["expectedTrackTitle"], "Afterlife")
        self.assertEqual(reopen["autoResumePayload"]["expectedTime"], 52)

    def test_t4_r2_spotify_carousel_buttons_contained_and_clickable(self) -> None:
        """T4-R2: Spotify horizontal browsing carousel buttons stay inside viewport bounds, scroll horizontally on real clicks, and leave now-playing transport untouched."""
        url = self.server.url_for("/mock/spotify-carousel")
        carousels = (
            ("shelf", '[data-testid="recently-played-shelf"]'),
            ("gridChips", '[data-testid="home-chips-carousel"]'),
            ("navWrappedChips", '[data-testid="home-chips-nav-wrapped"]'),
            ("navDirectChips", '[data-testid="home-chips-nav-direct"]'),
        )
        for vw, vh in ((272, 640), (320, 640), (380, 700), (612, 700), (800, 700)):
            self.fx.set_viewport(vw, vh)
            self.fx.navigate(url)
            bounds = self.safe_eval_async(
                """
                await new Promise((r) => setTimeout(r, 60));
                const measureCarousel = (sel) => {
                  const root = document.querySelector(sel);
                  const prev = root.querySelector('[data-testid="carousel-previous-button"]');
                  const next = root.querySelector('[data-testid="carousel-next-button"]');
                  const scroller = root.querySelector('[data-testid="carousel-scroller"]');
                  return {
                    scrollerClientW: scroller.clientWidth,
                    scrollerScrollW: scroller.scrollWidth,
                    prevRect: prev.getBoundingClientRect().toJSON(),
                    nextRect: next.getBoundingClientRect().toJSON()
                  };
                };
                const skipBack = document.querySelector('[data-testid="now-playing-bar"] [data-testid="control-button-skip-back"]');
                const skipFwd = document.querySelector('[data-testid="now-playing-bar"] [data-testid="control-button-skip-forward"]');
                return {
                  innerWidth: window.innerWidth,
                  scrollWidth: document.documentElement.scrollWidth,
                  shelf: measureCarousel('[data-testid="recently-played-shelf"]'),
                  gridChips: measureCarousel('[data-testid="home-chips-carousel"]'),
                  navWrappedChips: measureCarousel('[data-testid="home-chips-nav-wrapped"]'),
                  navDirectChips: measureCarousel('[data-testid="home-chips-nav-direct"]'),
                  skipBackRect: skipBack.getBoundingClientRect().toJSON(),
                  skipFwdRect: skipFwd.getBoundingClientRect().toJSON()
                };
                """
            )
            self.assertLessEqual(
                bounds["scrollWidth"],
                bounds["innerWidth"],
                f"Horizontal overflow at {vw}x{vh}: scrollWidth={bounds['scrollWidth']} > innerWidth={bounds['innerWidth']}",
            )
            for cname, csel in carousels:
                cbounds = bounds[cname]
                self.assertGreater(
                    cbounds["scrollerScrollW"],
                    cbounds["scrollerClientW"],
                    f"{cname} scroller must remain horizontally scrollable at {vw}x{vh}",
                )
                for key in ("prevRect", "nextRect"):
                    rect = cbounds[key]
                    self.assertGreaterEqual(rect["left"], 0, f"{cname} {key} clipped on left at {vw}x{vh}: {rect}")
                    self.assertLessEqual(rect["right"], bounds["innerWidth"], f"{cname} {key} overflowed right at {vw}x{vh}: {rect}")
                    self.assertGreaterEqual(rect["width"], 28, f"{cname} {key} width too small at {vw}x{vh}: {rect}")
                    self.assertGreaterEqual(rect["height"], 28, f"{cname} {key} height too small at {vw}x{vh}: {rect}")

                # Real mouse clicks on carousel arrows must scroll carousel horizontally without affecting transport
                self.fx.click(f'{csel} [data-testid="carousel-next-button"]')
                after_next = self.fx.eval_js(
                    "return { scrollLeft: document.querySelector(arguments[0] + ' [data-testid=\"carousel-scroller\"]').scrollLeft, skips: window.__skipEvents };",
                    csel,
                )
                self.assertGreater(after_next["scrollLeft"], 0, f"Real click on {cname} carousel-next-button did not scroll at {vw}x{vh}")
                self.assertEqual(after_next["skips"], [])

                self.fx.click(f'{csel} [data-testid="carousel-previous-button"]')
                after_prev = self.fx.eval_js(
                    "return { scrollLeft: document.querySelector(arguments[0] + ' [data-testid=\"carousel-scroller\"]').scrollLeft, skips: window.__skipEvents };",
                    csel,
                )
                self.assertLess(after_prev["scrollLeft"], after_next["scrollLeft"], f"Real click on {cname} carousel-previous-button did not scroll back at {vw}x{vh}")
                self.assertEqual(after_prev["skips"], [])

            for key in ("skipBackRect", "skipFwdRect"):
                rect = bounds[key]
                self.assertGreaterEqual(rect["left"], 0, f"{key} clipped on left at {vw}x{vh}: {rect}")
                self.assertLessEqual(rect["right"], bounds["innerWidth"], f"{key} overflowed right at {vw}x{vh}: {rect}")
                self.assertGreater(rect["width"], 0)
                self.assertGreater(rect["height"], 0)

            # Real mouse clicks on now-playing transport buttons must trigger skip events without scrolling carousels
            self.fx.click('[data-testid="now-playing-bar"] [data-testid="control-button-skip-forward"]')
            self.fx.click('[data-testid="now-playing-bar"] [data-testid="control-button-skip-back"]')
            after_transport = self.fx.eval_js(
                "return { skips: window.__skipEvents };"
            )
            self.assertEqual(after_transport["skips"], ["next", "prev"])

        # Also verify RTL layout at 320x640 keeps carousel arrows within viewport bounds AND click-scrolls in RTL
        self.fx.set_viewport(320, 640)
        self.fx.navigate(self.server.url_for("/mock/spotify-carousel?rtl=1"))
        rtl_bounds = self.safe_eval_async(
            """
            await new Promise((r) => setTimeout(r, 60));
            const measureCarousel = (sel) => {
              const root = document.querySelector(sel);
              const prev = root.querySelector('[data-testid="carousel-previous-button"]');
              const next = root.querySelector('[data-testid="carousel-next-button"]');
              const scroller = root.querySelector('[data-testid="carousel-scroller"]');
              return {
                scrollerClientW: scroller.clientWidth,
                scrollerScrollW: scroller.scrollWidth,
                prevRect: prev.getBoundingClientRect().toJSON(),
                nextRect: next.getBoundingClientRect().toJSON()
              };
            };
            return {
              innerWidth: window.innerWidth,
              scrollWidth: document.documentElement.scrollWidth,
              shelf: measureCarousel('[data-testid="recently-played-shelf"]'),
              gridChips: measureCarousel('[data-testid="home-chips-carousel"]'),
              navWrappedChips: measureCarousel('[data-testid="home-chips-nav-wrapped"]'),
              navDirectChips: measureCarousel('[data-testid="home-chips-nav-direct"]')
            };
            """
        )
        self.assertLessEqual(rtl_bounds["scrollWidth"], rtl_bounds["innerWidth"])
        for cname, csel in carousels:
            cbounds = rtl_bounds[cname]
            self.assertGreater(cbounds["scrollerScrollW"], cbounds["scrollerClientW"])
            for key in ("prevRect", "nextRect"):
                rect = cbounds[key]
                self.assertGreaterEqual(rect["left"], 0, f"RTL {cname} {key} clipped left: {rect}")
                self.assertLessEqual(rect["right"], rtl_bounds["innerWidth"], f"RTL {cname} {key} overflowed right: {rect}")
                self.assertGreaterEqual(rect["width"], 28)
                self.assertGreaterEqual(rect["height"], 28)

            self.fx.click(f'{csel} [data-testid="carousel-next-button"]')
            rtl_after_next = self.fx.eval_js(
                "return document.querySelector(arguments[0] + ' [data-testid=\"carousel-scroller\"]').scrollLeft;",
                csel,
            )
            self.assertGreater(abs(rtl_after_next), 0, f"RTL real click on {cname} carousel-next-button did not scroll")

            self.fx.click(f'{csel} [data-testid="carousel-previous-button"]')
            rtl_after_prev = self.fx.eval_js(
                "return document.querySelector(arguments[0] + ' [data-testid=\"carousel-scroller\"]').scrollLeft;",
                csel,
            )
            self.assertLess(abs(rtl_after_prev), abs(rtl_after_next), f"RTL real click on {cname} carousel-previous-button did not scroll back")


if __name__ == "__main__":
    unittest.main()
