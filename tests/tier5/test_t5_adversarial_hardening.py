"""Tier 5 Adversarial Hardening Suite: WCAG Contrast, CSS/URL Injection Defense, Hostile Carousel DOM & Input Fuzzing."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_TIER3_DIR = Path(__file__).resolve().parent.parent / "tier3"
if str(_TIER3_DIR) not in sys.path:
    sys.path.insert(0, str(_TIER3_DIR))

from _e2e_helpers import (
    FoxHubE2EBase,
    make_default_settings_seed,
)


def _srgb_channel(c: float) -> float:
    v = c / 255.0
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4


def _parse_rgb(css_color: str) -> tuple[int, int, int]:
    s = css_color.strip()
    if s.startswith("rgb(") and s.endswith(")"):
        parts = [int(float(x.strip())) for x in s[4:-1].split(",")[:3]]
        return parts[0], parts[1], parts[2]
    if s.startswith("rgba(") and s.endswith(")"):
        parts = [int(float(x.strip())) for x in s[5:-1].split(",")[:3]]
        return parts[0], parts[1], parts[2]
    raise ValueError(f"Unsupported computed CSS color format: {css_color}")


def _wcag_contrast(fg_css: str, bg_css: str) -> float:
    r1, g1, b1 = _parse_rgb(fg_css)
    r2, g2, b2 = _parse_rgb(bg_css)
    l1 = 0.2126 * _srgb_channel(r1) + 0.7152 * _srgb_channel(g1) + 0.0722 * _srgb_channel(b1)
    l2 = 0.2126 * _srgb_channel(r2) + 0.7152 * _srgb_channel(g2) + 0.0722 * _srgb_channel(b2)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


class TestTier5AdversarialHardening(FoxHubE2EBase):
    """White-box adversarial hardening & WCAG/security regression tests."""

    def test_t5_01_dark_theme_pill_hover_and_focus_wcag_contrast(self) -> None:
        """All dark themes' Standard, OTP, and Danger pills achieve >= 4.5:1 WCAG AA contrast on hover and focus."""
        self.fx.set_viewport(560, 700)
        dark_themes = ("cozy-espresso", "midnight-velvet", "true-night")

        for theme_id in ("warm-linen",) + dark_themes:
            settings = make_default_settings_seed(
                theme=theme_id,
                cardActionsMode="always",
                demoMode="on",
            )
            self.open_ui_toplevel("src/popup/popup.html", "?sidebar=1", settings=settings)

            measured = self.safe_eval_async(
                """
                const P = window.FoxHubPopup;
                P.state.selectedAccountEmail = 'ALL';
                P.state.activeFilter = 'all';
                P.state.appState = {
                  ...(P.state.appState || {}),
                  accounts: [
                    {
                      email: 'user@gmail.com',
                      label: 'Personal',
                      color: '#D95032',
                      unreadCount: 1,
                      messages: [
                        {
                          id: 't5-otp-msg-1',
                          accountEmail: 'user@gmail.com',
                          senderName: 'Security',
                          senderEmail: 'no-reply@example.com',
                          subject: 'Verification code: 849201',
                          snippet: 'Your verification code is 849201. Do not share.',
                          timestamp: Date.now(),
                          unread: true,
                          starred: false,
                          otpCode: '849201',
                        },
                      ],
                    },
                  ],
                };
                P.renderEmailList();
                await new Promise((r) => setTimeout(r, 60));

                const otpBtn = document.querySelector('.pm-action-pill-otp');
                const dngBtn = document.querySelector('.pm-action-pill-danger');
                const stdBtn = Array.from(document.querySelectorAll('.pm-action-pill')).find(
                  (b) => !b.classList.contains('pm-action-pill-otp') && !b.classList.contains('pm-action-pill-danger')
                );
                if (!otpBtn || !dngBtn || !stdBtn) {
                  throw new Error('Missing rendered action pills: ' + JSON.stringify({
                    otp: Boolean(otpBtn), dng: Boolean(dngBtn), std: Boolean(stdBtn)
                  }));
                }
                stdBtn.id = 't5-pill-std';
                otpBtn.id = 't5-pill-otp';
                dngBtn.id = 't5-pill-danger';
                const rectOf = (el) => {
                  el.scrollIntoView({ block: 'center', behavior: 'instant' });
                  const r = el.getBoundingClientRect();
                  return {
                    x: Math.round(r.left + r.width / 2),
                    y: Math.round(r.top + r.height / 2),
                  };
                };
                return {
                  colorScheme: document.documentElement.getAttribute('data-color-scheme'),
                  theme: document.documentElement.getAttribute('data-theme'),
                  std: rectOf(stdBtn),
                  otp: rectOf(otpBtn),
                  danger: rectOf(dngBtn),
                };
                """
            )

            for pill_key, pill_id in (("std", "t5-pill-std"), ("otp", "t5-pill-otp"), ("danger", "t5-pill-danger")):
                pt = measured[pill_key]
                self.fx.client.call(
                    "WebDriver:PerformActions",
                    {
                        "actions": [
                            {
                                "type": "pointer",
                                "id": "mouse",
                                "parameters": {"pointerType": "mouse"},
                                "actions": [
                                    {"type": "pointerMove", "duration": 20, "x": pt["x"], "y": pt["y"]},
                                ],
                            }
                        ]
                    },
                )
                styles = self.safe_eval_async(
                    """
                    const pillId = arguments[0];
                    await new Promise((r) => setTimeout(r, 260));
                    const el = document.getElementById(pillId);
                    el.focus({ focusVisible: true });
                    await new Promise((r) => setTimeout(r, 50));
                    const cs = window.getComputedStyle(el);
                    const r = el.getBoundingClientRect();
                    return {
                      bg: cs.backgroundColor,
                      fg: cs.color,
                      outlineColor: cs.outlineColor,
                      outlineWidth: cs.outlineWidth,
                      hover: el.matches(':hover'),
                      focusVis: el.matches(':focus-visible'),
                      connected: el.isConnected,
                      rect: { w: r.width, h: r.height, x: r.left, y: r.top },
                    };
                    """,
                    pill_id,
                )
                self.fx.client.call("WebDriver:ReleaseActions", {})
                self.assertTrue(
                    styles.get("hover") and styles.get("fg") and styles.get("bg"),
                    f"Pill not hovered or missing computed styles for {theme_id}/{pill_key}: {styles}, pt={pt}",
                )
                text_cr = _wcag_contrast(styles["fg"], styles["bg"])
                min_ratio = 4.5 if theme_id in dark_themes else 3.5
                self.assertGreaterEqual(
                    text_cr,
                    min_ratio,
                    f"Theme={theme_id} pill={pill_key} hover text contrast {text_cr:.2f}:1 < {min_ratio}:1 ({styles})",
                )
                outline_cr = _wcag_contrast(styles["outlineColor"], styles["bg"])
                self.assertGreaterEqual(
                    outline_cr,
                    min_ratio,
                    f"Theme={theme_id} pill={pill_key} hover focus outline contrast {outline_cr:.2f}:1 < {min_ratio}:1 ({styles})",
                )

    def test_t5_02_custom_wallpaper_css_breakout_and_unsafe_scheme_blocked(self) -> None:
        """Custom wallpaper URLs escape quotes/backslashes and block unsafe schemes in themes.js."""
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1")

        res = self.safe_eval_async(
            """
            const uiWin = window.__bridge.uiWin;
            const uiDoc = window.__bridge.uiDoc;
            const themesApi = uiWin.PocketMailThemes;
            const bgLayer = uiDoc.getElementById('pm-wallpaper-layer');

            // 1. Unsafe scheme javascript: must be rejected
            themesApi.applyThemeAndWallpaper(
              uiDoc,
              { theme: 'warm-linen', wallpaper: 'custom', customWallpaperData: 'javascript:alert(1)' }
            );
            const jsBg = bgLayer.style.backgroundImage;

            // 2. Unsafe file: scheme must be rejected
            themesApi.applyThemeAndWallpaper(
              uiDoc,
              { theme: 'warm-linen', wallpaper: 'custom', customWallpaperData: 'file:///C:/Windows/win.ini' }
            );
            const fileBg = bgLayer.style.backgroundImage;

            // 3. Newline/control-char CSS injection must be rejected
            themesApi.applyThemeAndWallpaper(
              uiDoc,
              { theme: 'warm-linen', wallpaper: 'custom', customWallpaperData: 'https://example.com/a.png\\nbackground-color:red' }
            );
            const nlBg = bgLayer.style.backgroundImage;

            // 4. Quote-breakout payload must NOT break out of url("...") or alter backgroundColor
            bgLayer.style.backgroundColor = '';
            themesApi.applyThemeAndWallpaper(
              uiDoc,
              {
                theme: 'warm-linen',
                wallpaper: 'custom',
                wallpaperOpacity: 0.77,
                customWallpaperData: 'https://example.com/x.png");background-color:rgb(1,2,3);--p:url("',
              }
            );
            const breakoutBg = bgLayer.style.backgroundImage;
            const breakoutColor = bgLayer.style.backgroundColor;

            // 5. Raw data:image/svg+xml with double quotes must escape and apply cleanly
            themesApi.applyThemeAndWallpaper(
              uiDoc,
              {
                theme: 'warm-linen',
                wallpaper: 'custom',
                customWallpaperData: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>',
              }
            );
            const svgBg = bgLayer.style.backgroundImage;

            return { jsBg, fileBg, nlBg, breakoutBg, breakoutColor, svgBg };
            """
        )

        self.assertEqual(res["jsBg"], "none")
        self.assertEqual(res["fileBg"], "none")
        self.assertEqual(res["nlBg"], "none")
        self.assertEqual(res["breakoutColor"], "")
        self.assertTrue(res["breakoutBg"].startswith('url("https://example.com/x.png'))
        self.assertTrue(res["svgBg"].startswith('url("data:image/svg+xml,'))

    def test_t5_03_bg_router_blocks_unsafe_url_schemes_in_navigate_and_companion(self) -> None:
        """SIDEBAR_NAVIGATE_APP and OPEN_COMPANION_WINDOW reject non-http(s)/non-extension URLs."""
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1")

        res = self.safe_eval_async(
            """
            const badUrls = [
              'javascript:alert(1)',
              'file:///etc/passwd',
              'about:config',
              'data:text/html,<h1>evil</h1>',
              'vbscript:msgbox(1)',
            ];
            const navResults = [];
            const winResults = [];

            const beforeCalls = {
              setPanel: window.__webextMock.getCalls('sidebarAction.setPanel').length,
              winCreate: window.__webextMock.getCalls('windows.create').length,
            };

            for (const u of badUrls) {
              navResults.push(await window.browser.runtime.sendMessage({ type: 'SIDEBAR_NAVIGATE_APP', url: u }));
              winResults.push(await window.browser.runtime.sendMessage({ type: 'OPEN_COMPANION_WINDOW', url: u }));
            }

            const afterBadCalls = {
              setPanel: window.__webextMock.getCalls('sidebarAction.setPanel').length,
              winCreate: window.__webextMock.getCalls('windows.create').length,
            };

            const goodNav = await window.browser.runtime.sendMessage({
              type: 'SIDEBAR_NAVIGATE_APP',
              url: 'https://open.spotify.com/',
            });
            const goodWin = await window.browser.runtime.sendMessage({
              type: 'OPEN_COMPANION_WINDOW',
              url: window.browser.runtime.getURL('src/popup/popup.html?popout=1'),
            });

            return { navResults, winResults, beforeCalls, afterBadCalls, goodNav, goodWin };
            """
        )

        for r in res["navResults"]:
            self.assertFalse(r.get("ok"), f"Expected unsafe SIDEBAR_NAVIGATE_APP to fail, got {r}")
        for r in res["winResults"]:
            self.assertFalse(r.get("ok"), f"Expected unsafe OPEN_COMPANION_WINDOW to fail, got {r}")
        self.assertEqual(res["afterBadCalls"]["setPanel"], res["beforeCalls"]["setPanel"])
        self.assertEqual(res["afterBadCalls"]["winCreate"], res["beforeCalls"]["winCreate"])
        self.assertTrue(res["goodNav"].get("ok"))
        self.assertTrue(res["goodWin"].get("ok"))

    def test_t5_04_spotify_carousel_hostile_semantic_and_flex_variants(self) -> None:
        """Hostile <header>/<li> direct scroller parents and flex:0 0 auto siblings remain contained & clickable."""
        for vw in (272, 320):
            self.fx.set_viewport(vw, 640)
            self.fx.navigate(self.server.url_for("/mock/spotify-carousel"))
            res = self.safe_eval_async(
                """
                await new Promise((r) => setTimeout(r, 60));
                const main = document.querySelector('[data-testid="main-view"]') || document.body;

                const makeCarousel = (wrapperTag, overlayTag, id, extraWrapperStyle) => {
                  const wrap = document.createElement(wrapperTag);
                  wrap.setAttribute('data-testid', id);
                  if (extraWrapperStyle) wrap.style.cssText = extraWrapperStyle;

                  const scroller = document.createElement('div');
                  scroller.setAttribute('data-testid', 'carousel-scroller');
                  const track = document.createElement('div');
                  track.setAttribute('role', 'presentation');
                  track.style.cssText = 'display:flex;gap:12px;width:960px;';
                  for (let i = 0; i < 8; i++) {
                    const card = document.createElement('div');
                    card.style.cssText = 'flex:0 0 110px;height:80px;background:#282828;border-radius:8px;';
                    card.textContent = 'Track ' + (i + 1);
                    track.appendChild(card);
                  }
                  scroller.appendChild(track);
                  wrap.appendChild(scroller);

                  const ov = document.createElement(overlayTag);
                  ov.style.cssText = 'position:absolute;left:-44px;right:-44px;top:0;bottom:0;opacity:0;';
                  const prev = document.createElement('button');
                  prev.type = 'button';
                  prev.setAttribute('data-testid', 'carousel-previous-button');
                  prev.textContent = '<';
                  prev.addEventListener('click', () => { scroller.scrollLeft = Math.max(0, scroller.scrollLeft - 140); });
                  const next = document.createElement('button');
                  next.type = 'button';
                  next.setAttribute('data-testid', 'carousel-next-button');
                  next.textContent = '>';
                  next.addEventListener('click', () => { scroller.scrollLeft += 140; });
                  ov.appendChild(prev);
                  ov.appendChild(next);
                  wrap.appendChild(ov);
                  return wrap;
                };

                // Variant 3: flex: 0 0 auto direct scroller parent beside a "Show all" sibling
                const flexRow = document.createElement('div');
                flexRow.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;max-width:100%;';
                flexRow.appendChild(makeCarousel('div', 'div', 't5-flex-noshrink-carousel', 'flex:0 0 auto;margin:0 -36px;'));
                const showAll = document.createElement('span');
                showAll.style.cssText = 'flex:0 0 auto;font-size:11px;white-space:nowrap;';
                showAll.textContent = 'Show all';
                flexRow.appendChild(showAll);
                main.prepend(flexRow);

                // Variant 2: <li> direct scroller parent inside <ul>
                const ul = document.createElement('ul');
                ul.style.cssText = 'list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr;';
                ul.appendChild(makeCarousel('li', 'div', 't5-li-carousel', 'margin:0 -40px;'));
                main.prepend(ul);

                // Variant 1: <header> direct scroller parent + <header> chevron overlay child
                main.prepend(makeCarousel('header', 'header', 't5-header-carousel', 'margin:0 -40px;'));

                await new Promise((r) => setTimeout(r, 60));

                const measure = (id) => {
                  const root = document.querySelector(`[data-testid="${id}"]`);
                  const prev = root.querySelector('[data-testid="carousel-previous-button"]');
                  const next = root.querySelector('[data-testid="carousel-next-button"]');
                  const scroller = root.querySelector('[data-testid="carousel-scroller"]');
                  return {
                    scrollerClientW: scroller.clientWidth,
                    scrollerScrollW: scroller.scrollWidth,
                    prevRect: prev.getBoundingClientRect().toJSON(),
                    nextRect: next.getBoundingClientRect().toJSON(),
                  };
                };

                return {
                  innerWidth: window.innerWidth,
                  scrollWidth: document.documentElement.scrollWidth,
                  headerCar: measure('t5-header-carousel'),
                  liCar: measure('t5-li-carousel'),
                  flexCar: measure('t5-flex-noshrink-carousel'),
                };
                """
            )
            self.assertLessEqual(res["scrollWidth"], res["innerWidth"], f"Hostile overflow at {vw}px: {res}")
            for name, cid in (
                ("headerCar", "t5-header-carousel"),
                ("liCar", "t5-li-carousel"),
                ("flexCar", "t5-flex-noshrink-carousel"),
            ):
                m = res[name]
                self.assertGreater(m["scrollerScrollW"], m["scrollerClientW"])
                for key in ("prevRect", "nextRect"):
                    r = m[key]
                    self.assertGreaterEqual(r["left"], 0, f"{name} {key} clipped left at {vw}px: {r}")
                    self.assertLessEqual(r["right"], res["innerWidth"], f"{name} {key} overflowed right at {vw}px: {r}")
                self.fx.eval_js(
                    "document.querySelector(arguments[0]).scrollIntoView({ block: 'center', behavior: 'instant' });",
                    f'[data-testid="{cid}"]',
                )
                self.fx.click(f'[data-testid="{cid}"] [data-testid="carousel-next-button"]')
                sl = self.fx.eval_js(
                    "return document.querySelector(arguments[0] + ' [data-testid=\"carousel-scroller\"]').scrollLeft;",
                    f'[data-testid="{cid}"]',
                )
                self.assertGreater(sl, 0, f"Hostile variant {name} next button did not scroll at {vw}px")

    def test_t5_05_quick_switcher_and_backup_adversarial_fuzzing(self) -> None:
        """Adversarial URL schemes in Quick Switcher and malformed/deep/polluting Backup payloads are rejected safely."""
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1")

        res = self.safe_eval_async(
            """
            const uiWin = window.__bridge.uiWin;
            const uiDoc = window.__bridge.uiDoc;
            const schema = uiWin.FoxHubSettingsSchema;

            // 1. Deeply nested JSON (>64 levels) must be rejected without stack overflow
            let deep = { theme: 'true-night' };
            for (let i = 0; i < 80; i++) deep = { nested: deep };
            const deepRes = schema.validateImportPayload({
              schema: 'foxhub-settings-backup',
              schemaVersion: 1,
              settings: { accountConfigs: deep },
            });

            // 2. Non-finite numbers (NaN / Infinity) must be rejected
            const nanRes = schema.validateImportPayload({
              schema: 'foxhub-settings-backup',
              schemaVersion: 1,
              settings: { soundVolume: Number.NaN },
            });
            const infRes = schema.validateImportPayload({
              schema: 'foxhub-settings-backup',
              schemaVersion: 1,
              settings: { pollIntervalSeconds: Number.POSITIVE_INFINITY },
            });

            // 3. Unsafe customMediaApps entries must be rejected
            const badCustomUrl = schema.validateImportPayload({
              schema: 'foxhub-settings-backup',
              schemaVersion: 1,
              settings: { customMediaApps: [{ name: 'Evil', url: 'javascript:alert(1)' }] },
            });
            const badCustomIcon = schema.validateImportPayload({
              schema: 'foxhub-settings-backup',
              schemaVersion: 1,
              settings: { customMediaApps: [{ name: 'Ok', url: 'https://example.com', iconUrl: 'data:text/html,<svg>' }] },
            });

            // 4. Prototype pollution check across raw JSON string
            const protoRes = schema.validateImportPayload(
              '{"schema":"foxhub-settings-backup","schemaVersion":1,"settings":{"__proto__":{"t5Polluted":true},"theme":"true-night"}}'
            );
            const polluted = Boolean(({}).t5Polluted);

            // 5. Quick Switcher adversarial scheme fuzzing
            uiWin.FoxHubPopup.openQuickSwitcher();
            const inp = uiDoc.getElementById('pm-qs-input');
            const fuzzInputs = [
              'javascript:alert(1)',
              'JAVASCRIPT:alert(1)',
              'java\\tscript:alert(1)',
              'vbscript:msgbox(1)',
              'file:///C:/Windows/win.ini',
              'about:debugging',
              'moz-extension://fake-id/page.html',
              'foo.bar:javascript:1',
              '//evil.example/path',
            ];
            let openedAdhocCount = 0;
            const origOpenUrl = uiWin.FoxHubPopup.openUrlInWorkspace;
            uiWin.FoxHubPopup.openUrlInWorkspace = (...args) => {
              openedAdhocCount += 1;
              return origOpenUrl.apply(uiWin.FoxHubPopup, args);
            };
            const qsWebUrlTags = [];
            for (const q of fuzzInputs) {
              inp.value = q;
              inp.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
              const tags = Array.from(uiDoc.querySelectorAll('#pm-qs-results .pm-qs-item-tag')).map((el) => el.textContent);
              qsWebUrlTags.push({ q, hasWebUrl: tags.includes('Web URL') });
            }
            uiWin.FoxHubPopup.openUrlInWorkspace = origOpenUrl;
            uiWin.FoxHubPopup.closeQuickSwitcher();

            return {
              deepOk: deepRes.ok,
              nanOk: nanRes.ok,
              infOk: infRes.ok,
              badCustomUrlOk: badCustomUrl.ok,
              badCustomIconOk: badCustomIcon.ok,
              protoOk: protoRes.ok,
              polluted,
              openedAdhocCount,
              qsWebUrlTags,
            };
            """
        )

        self.assertFalse(res["deepOk"])
        self.assertFalse(res["nanOk"])
        self.assertFalse(res["infOk"])
        self.assertFalse(res["badCustomUrlOk"])
        self.assertFalse(res["badCustomIconOk"])
        self.assertFalse(res["protoOk"])
        self.assertFalse(res["polluted"])
        self.assertEqual(res["openedAdhocCount"], 0)
        for entry in res["qsWebUrlTags"]:
            self.assertFalse(entry["hasWebUrl"], f"Adversarial Quick Switcher input offered Web URL: {entry}")

    def test_t5_06_now_playing_bar_interactive_seek_scrubber_and_bg_seek(self) -> None:
        """Mini Now Playing progress bar supports click/drag/keyboard scrubbing and routes seek to bg & sidebar frames."""
        settings = make_default_settings_seed(
            miniNowPlayingEnabled=True,
            miniNowPlayingShowProgress=True,
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
        )
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=settings)

        res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const uiWin = window.__bridge.uiWin;
            const bgWin = window.__bridge.bgWin;
            const bg = bgWin.FoxHubBg;

            // Seed an active Spotify playback state (200s track at 120s) + mock bridge ports to inspect SEEK_SP_MEDIA
            const postedBgPort = [];
            const postedSbPort = [];
            bg.emeBridgePorts.set('bg:spotify', { postMessage: (m) => postedBgPort.push(m) });
            bg.emeBridgePorts.set('sidebar:spotify', { postMessage: (m) => postedSbPort.push(m) });

            const fakeVideo = bgWin.document.createElement('video');
            bg.bgSpEmePlayers.set('spotify', {
              id: 901,
              appId: 'spotify',
              isClear: false,
              isStaging: false,
              disposed: false,
              sourceType: 'bg',
              videoEl: fakeVideo,
              sb: null,
              trackDuration: 200,
              trackTitle: 'Mortal Reminder',
              targetTime: 120,
              maxObservedCt: 120,
              desiredVolume: 1.0,
              desiredMuted: false,
              remotePaused: false,
              explicitUserPause: false,
            });

            await window.browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/',
              playback: {
                isPlaying: true,
                title: 'Mortal Reminder',
                artist: 'Pentakill, Jorn',
                currentTime: 120,
                duration: 200,
                canPrev: true,
                canNext: true,
              },
            });
            await new Promise((r) => setTimeout(r, 120));

            const bar = uiDoc.getElementById('pm-mini-now-playing');
            const bodyEl = bar.querySelector('.pm-np-body');
            const track = uiDoc.getElementById('pm-np-progress-track');
            const fill = uiDoc.getElementById('pm-np-progress-fill');
            const thumb = uiDoc.getElementById('pm-np-progress-thumb');
            const rect = track.getBoundingClientRect();
            const bodyRect = bodyEl.getBoundingClientRect();
            const thumbOpacityIdle = uiWin.getComputedStyle(thumb).opacity;

            // 1. Click/scrub backward to 25% (~50s) using pointerdown + pointerup
            const targetX = rect.left + rect.width * 0.25;
            const targetY = rect.top + rect.height / 2;
            track.dispatchEvent(new uiWin.PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: targetX, clientY: targetY, button: 0, pointerId: 1, pointerType: 'mouse' }));
            const scrubbingDuringDrag = track.classList.contains('is-scrubbing');
            track.dispatchEvent(new uiWin.PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: targetX, clientY: targetY, button: 0, pointerId: 1, pointerType: 'mouse' }));
            await new Promise((r) => setTimeout(r, 120));

            const afterDragSp = bg.bgSpEmePlayers.get('spotify');
            const dragState = {
              barVisible: !bar.classList.contains('hidden'),
              atTopBreakLine: rect.top <= bodyRect.top + 1,
              thumbOpacityIdle,
              role: track.getAttribute('role'),
              seekable: track.getAttribute('data-seekable'),
              scrubbingDuringDrag,
              scrubbingAfterUp: track.classList.contains('is-scrubbing'),
              fillWidthAfterDrag: fill.style.width,
              spTargetTime: afterDragSp.targetTime,
              spIsExplicitUserScrub: afterDragSp.isExplicitUserScrub,
              spPendingSeekIsUserScrub: afterDragSp.pendingSeekIsUserScrub,
              liveCt: bg.liveMediaPlaybackState.get('spotify')?.currentTime,
              bgPortSeeks: postedBgPort.filter((m) => m && m.cmd === 'SEEK_SP_MEDIA'),
              sbPortSeeks: postedSbPort.filter((m) => m && m.cmd === 'SEEK_SP_MEDIA'),
            };

            // 2. Keyboard ArrowRight (+5s)
            track.dispatchEvent(new uiWin.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
            await new Promise((r) => setTimeout(r, 80));
            const afterKeyTarget = bg.bgSpEmePlayers.get('spotify').targetTime;

            return { dragState, afterKeyTarget };
            """
        )

        ds = res["dragState"]
        self.assertTrue(ds["barVisible"])
        self.assertTrue(ds["atTopBreakLine"], "Interactive progress scrubber must sit at the top break line")
        self.assertEqual(ds["thumbOpacityIdle"], "1", "Scrubber knob must be clearly visible even before hover")
        self.assertEqual(ds["role"], "slider")
        self.assertEqual(ds["seekable"], "1")
        self.assertTrue(ds["scrubbingDuringDrag"])
        self.assertFalse(ds["scrubbingAfterUp"])
        self.assertAlmostEqual(ds["spTargetTime"], 50.0, delta=3.0)
        self.assertTrue(ds["spIsExplicitUserScrub"])
        self.assertTrue(ds["spPendingSeekIsUserScrub"])
        self.assertGreaterEqual(len(ds["bgPortSeeks"]), 1)
        self.assertTrue(ds["bgPortSeeks"][0].get("isUserScrub"))
        self.assertGreaterEqual(len(ds["sbPortSeeks"]), 1)
        self.assertGreater(res["afterKeyTarget"], ds["spTargetTime"] + 3.0)

    def test_t5_07_switch_app_mid_spotify_reopen_aborts_takeover_without_muting_bg(self) -> None:
        """Switching to another app before Spotify finishes reopening aborts sidebar takeover cleanly without muting or blocking bg track transitions."""
        settings = make_default_settings_seed(
            keepAudioPlayingWhenClosed=True,
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
        )
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=settings)

        res = self.safe_eval_async(
            """
            const uiWin = window.__bridge.uiWin;
            const bgWin = window.__bridge.bgWin;
            const P = uiWin.FoxHubPopup;
            const bg = bgWin.FoxHubBg;

            // Simulate active background Spotify player playing 'Mortal Reminder'
            const bgFrame = bgWin.document.createElement('iframe');
            bg.bgAudioPool.set('spotify', { frame: bgFrame, url: 'https://open.spotify.com/', title: 'Mortal Reminder' });

            const bgVideo = bgWin.document.createElement('video');
            bgVideo.muted = false;
            bgVideo.volume = 1.0;
            const activeSp = {
              id: 910,
              appId: 'spotify',
              msId: 10,
              isClear: false,
              isStaging: false,
              disposed: false,
              sourceType: 'bg',
              awaitingBgFrameHandoff: false,
              handoffSource: 'bg',
              handoffStartedAt: 0,
              videoEl: bgVideo,
              sb: null,
              trackDuration: 213,
              trackTitle: 'Mortal Reminder',
              targetTime: 140,
              desiredVolume: 1.0,
              desiredMuted: false,
              remotePaused: false,
              explicitUserPause: false,
              queue: [],
              pendingGenReqs: [],
              processedInitDataKeys: new Set(),
            };
            bg.bgSpEmePlayers.set('spotify', activeSp);
            bg.liveMediaPlaybackState.set('spotify', bg.normalizePlaybackMeta('spotify', {
              isPlaying: true,
              title: 'Mortal Reminder',
              artist: 'Pentakill, Jorn',
              currentTime: 140,
              duration: 213,
              resumeUrl: 'https://open.spotify.com/'
            }));

            // 1. Sidebar begins Spotify reopen takeover
            const spApp = P.getAppsApi().getAppById('spotify', P.state.appSettings);
            P.openMediaWorkspace(spApp);
            await new Promise((r) => setTimeout(r, 120));

            const midTakeoverState = {
              awaitingBeforeSwitch: activeSp.awaitingBgFrameHandoff,
              handoffSourceBeforeSwitch: activeSp.handoffSource,
              hasStagingBeforeSwitch: bg.bgStagingSpPlayers.has('spotify'),
              inPendingSet: P.state.pendingSidebarAudioTakeoverSet.has('spotify'),
              hasSidebarSpFrame: P.state.mediaFramePool.has('spotify'),
            };

            // Verify booting sidebar VOLUME { muted: true } cannot mute bg player mid-handoff
            bg.handleSpEmeBridgeMessage('spotify', { bridgeType: 'VOLUME', muted: true, volume: 0 }, 'sidebar');
            const bgMutedAfterBootingVol = activeSp.desiredMuted || activeSp.videoEl.muted;

            // 2. BEFORE Spotify sidebar finishes syncing, user switches to Instagram!
            const igApp = P.getAppsApi().getAppById('instagram', P.state.appSettings);
            P.openMediaWorkspace(igApp);
            await new Promise((r) => setTimeout(r, 140));

            const afterSwitchState = {
              activeRailAppId: P.state.activeRailAppId,
              inPendingSet: P.state.pendingSidebarAudioTakeoverSet.has('spotify'),
              inBgMasterSet: P.state.bgMasterAudioSet.has('spotify'),
              hasSidebarSpFrame: P.state.mediaFramePool.has('spotify'),
              bgPoolStillAlive: bg.bgAudioPool.has('spotify'),
              hasStagingAfterSwitch: bg.bgStagingSpPlayers.has('spotify'),
              awaitingAfterSwitch: activeSp.awaitingBgFrameHandoff,
              handoffSourceAfterSwitch: activeSp.handoffSource,
              bgMutedAfterSwitch: activeSp.videoEl.muted,
              bgDesiredMutedAfterSwitch: activeSp.desiredMuted,
            };

            // 3. Background Spotify advances to next track (new msId=11) -> MUST NOT be dropped!
            bg.handleSpEmeBridgeMessage('spotify', { bridgeType: 'MSE_INIT', msId: 11, mime: 'audio/mp4; codecs="mp4a.40.2"' }, 'bg');
            const activeSpAfterNextTrack = bg.bgSpEmePlayers.get('spotify');
            const nextPreloadOrUpdated =
              (activeSpAfterNextTrack && activeSpAfterNextTrack.msId === 11) ||
              bg.bgNextSpPlayers.has('spotify');

            return {
              midTakeoverState,
              bgMutedAfterBootingVol,
              afterSwitchState,
              nextPreloadOrUpdated,
            };
            """
        )

        self.assertTrue(res["midTakeoverState"]["awaitingBeforeSwitch"])
        self.assertEqual(res["midTakeoverState"]["handoffSourceBeforeSwitch"], "sidebar")
        self.assertTrue(res["midTakeoverState"]["hasStagingBeforeSwitch"])
        self.assertFalse(res["bgMutedAfterBootingVol"], "Booting sidebar iframe must not mute audible bg player")
        aft = res["afterSwitchState"]
        self.assertEqual(aft["activeRailAppId"], "instagram")
        self.assertFalse(aft["inPendingSet"])
        self.assertTrue(aft["inBgMasterSet"])
        self.assertFalse(aft["hasSidebarSpFrame"], "Aborted half-booted Spotify sidebar iframe must be removed")
        self.assertTrue(aft["bgPoolStillAlive"], "Background Spotify audio host must stay alive")
        self.assertFalse(aft["hasStagingAfterSwitch"], "Sidebar staging player must be disposed on abort")
        self.assertFalse(aft["awaitingAfterSwitch"], "awaitingBgFrameHandoff must clear on abort")
        self.assertEqual(aft["handoffSourceAfterSwitch"], "bg")
        self.assertFalse(aft["bgMutedAfterSwitch"])
        self.assertFalse(aft["bgDesiredMutedAfterSwitch"])
        self.assertTrue(res["nextPreloadOrUpdated"], "Next track MSE_INIT from bg must not be dropped after abort")

    def test_t5_08_selected_app_priority_bg_spotify_never_pauses_instagram_reel(self) -> None:
        """Background Spotify heartbeats never auto-pause selected Instagram Reels, and audible Reels cleanly pause Spotify."""
        settings = make_default_settings_seed(
            keepAudioPlayingWhenClosed=True,
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
        )
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=settings)

        res = self.safe_eval_async(
            """
            const uiWin = window.__bridge.uiWin;
            const bgWin = window.__bridge.bgWin;
            const P = uiWin.FoxHubPopup;
            const bg = bgWin.FoxHubBg;

            // Open Instagram (selected app) and mock its contentWindow.postMessage to catch any PAUSE_LOCAL_MEDIA
            const igApp = P.getAppsApi().getAppById('instagram', P.state.appSettings);
            P.openMediaWorkspace(igApp);
            await new Promise((r) => setTimeout(r, 80));

            const igEntry = P.state.mediaFramePool.get('instagram');
            const igPostedMsgs = [];
            Object.defineProperty(igEntry, 'frame', {
              value: {
                classList: igEntry.frame.classList,
                remove: () => {},
                contentWindow: { postMessage: (msg) => igPostedMsgs.push(msg) },
              },
              configurable: true,
            });

            // Setup background Spotify currently playing
            const spVideo = bgWin.document.createElement('video');
            let spPauseCount = 0;
            Object.defineProperty(spVideo, 'paused', { get: () => spPauseCount > 0, configurable: true });
            spVideo.pause = () => { spPauseCount += 1; };
            const spObj = {
              id: 920,
              appId: 'spotify',
              isClear: false,
              isStaging: false,
              disposed: false,
              sourceType: 'bg',
              videoEl: spVideo,
              sb: null,
              trackDuration: 210,
              trackTitle: 'Lightbringer (Acoustic)',
              desiredVolume: 1.0,
              desiredMuted: false,
              remotePaused: false,
              explicitUserPause: false,
            };
            bg.bgSpEmePlayers.set('spotify', spObj);
            const spPortMsgs = [];
            const spBgFrameMsgs = [];
            bg.emeBridgePorts.set('bg:spotify', { postMessage: (m) => spPortMsgs.push(m) });
            bg.bgAudioPool.set('spotify', {
              frame: { contentWindow: { postMessage: (m) => spBgFrameMsgs.push(m) }, remove: () => {} },
              url: 'https://open.spotify.com/',
              title: 'Lightbringer (Acoustic)',
            });
            bg.liveMediaPlaybackState.set('spotify', bg.normalizePlaybackMeta('spotify', {
              isPlaying: true,
              title: 'Lightbringer (Acoustic)',
              artist: 'Pentakill, Jorn',
              currentTime: 25,
              duration: 210,
            }));
            P.state.bgMasterAudioSet.add('spotify');
            P.state.currentAudibleBgAppId = 'spotify';
            P.state.framePlaybackStates.set('spotify', { isPlaying: true, title: 'Lightbringer (Acoustic)', updatedAt: Date.now() });

            // 1. Background Spotify fires routine SYNC_TIME & PM_FRAME_PLAYBACK_STATE while Instagram is selected
            P.handleAudioWindowMessage(
              { data: { type: 'PM_SP_EME_BRIDGE', bridgeType: 'SYNC_TIME', paused: false, currentTime: 26, flatFrameName: 'pm-media-frame-spotify', alreadyRoutedToBg: true } },
              null
            );
            P.handleAudioWindowMessage(
              { data: { type: 'PM_FRAME_PLAYBACK_STATE', isPlaying: true, currentTime: 26, duration: 210, title: 'Lightbringer (Acoustic)', flatFrameName: 'pm-media-frame-spotify' } },
              null
            );
            await new Promise((r) => setTimeout(r, 80));

            const igPausedByBgSpotify = igPostedMsgs.filter((m) => m && m.cmd === 'PAUSE_LOCAL_MEDIA').length;

            // 2. Now user plays an audible Reel inside the SELECTED app (Instagram) -> must pause Spotify cleanly!
            P.handleAudioWindowMessage(
              { data: { type: 'PM_FRAME_PLAYBACK_STATE', isPlaying: true, currentTime: 2, duration: 15, title: 'Instagram Reel', flatFrameName: 'pm-media-frame-instagram' } },
              igEntry
            );
            await new Promise((r) => setTimeout(r, 120));

            // 3. Stale in-flight SYNC_TIME { paused: false } from Spotify 50ms later must NOT resurrect Spotify!
            bg.handleSpEmeBridgeMessage('spotify', { bridgeType: 'SYNC_TIME', paused: false, currentTime: 27, duration: 210 }, 'bg');
            await new Promise((r) => setTimeout(r, 60));

            const igPausedAfterOwnPlay = igPostedMsgs.filter((m) => m && m.cmd === 'PAUSE_LOCAL_MEDIA').length;

            return {
              igPausedByBgSpotify,
              igPausedAfterOwnPlay,
              spPauseCount,
              spExplicitUserPause: spObj.explicitUserPause,
              spRemotePaused: spObj.remotePaused,
              spLivePlaying: bg.liveMediaPlaybackState.get('spotify')?.isPlaying,
              spPortPauseCmds: spPortMsgs.filter((m) => m && m.cmd === 'PAUSE_LOCAL_MEDIA').length,
              spDuplicateBgFramePauses: spBgFrameMsgs.filter((m) => m && m.cmd === 'PAUSE_LOCAL_MEDIA').length,
            };
            """
        )

        self.assertEqual(res["igPausedByBgSpotify"], 0, "Background Spotify SYNC_TIME must NEVER pause selected Instagram Reel")
        self.assertEqual(res["igPausedAfterOwnPlay"], 0, "Selected Instagram Reel must remain unpaused")
        self.assertGreaterEqual(res["spPauseCount"], 1, "Audible selected Instagram Reel must cleanly pause Spotify")
        self.assertTrue(res["spExplicitUserPause"])
        self.assertTrue(res["spRemotePaused"], "Stale in-flight SYNC_TIME must not resurrect paused Spotify")
        self.assertFalse(res["spLivePlaying"])
        self.assertEqual(res["spPortPauseCmds"], 1, "Exactly one PAUSE_LOCAL_MEDIA should be delivered over bg port")
        self.assertEqual(res["spDuplicateBgFramePauses"], 0, "Must not double-post PAUSE_LOCAL_MEDIA to bg frame when port delivered")

    def test_t5_09_now_playing_stays_visible_when_paused_with_paused_only_close_button(self) -> None:
        """Mini Now Playing bar stays visible on pause by default, shows X close button ONLY when paused, and reappears on resume."""
        settings = make_default_settings_seed(
            miniNowPlayingEnabled=True,
            miniNowPlayingAutoHidePaused=False,
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
        )
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=settings)

        res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const bgWin = window.__bridge.bgWin;
            const schema = bgWin.FoxHubSettingsSchema;

            // Verify schema default and one-shot migration for existing v2.8.0 profiles
            const defaultAutoHide = schema.DEFAULT_SETTINGS.miniNowPlayingAutoHidePaused;
            const migratedProfile = schema.normalizeSettings({
              topBarAutoHideMigratedV1: true,
              persistenceDefaultOffMigratedV4: true,
              miniNowPlayingAutoHidePaused: true,
            });

            // 1. Start Spotify playing -> bar visible, X close button MUST be hidden while playing
            await window.browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/',
              playback: {
                isPlaying: true,
                title: 'White Iverson',
                artist: 'Post Malone',
                currentTime: 64,
                duration: 256,
              },
            });
            await new Promise((r) => setTimeout(r, 120));

            const bar = uiDoc.getElementById('pm-mini-now-playing');
            const closeBtn = uiDoc.getElementById('pm-np-close');
            const playBtn = uiDoc.getElementById('pm-np-playpause');

            const whilePlaying = {
              barVisible: !bar.classList.contains('hidden'),
              closeHidden: closeBtn.classList.contains('hidden'),
              iconState: playBtn.dataset.iconState,
            };

            // 2. Click pause -> bar MUST stay visible, play icon shown, X close button MUST appear
            playBtn.click();
            await new Promise((r) => setTimeout(r, 140));
            const whilePaused = {
              barVisible: !bar.classList.contains('hidden'),
              closeHidden: closeBtn.classList.contains('hidden'),
              iconState: playBtn.dataset.iconState,
            };

            // 3. Click X close button -> bar hides cleanly
            closeBtn.click();
            await new Promise((r) => setTimeout(r, 60));
            const afterClose = {
              barVisible: !bar.classList.contains('hidden'),
            };

            // 4. Resume playback -> bar automatically reappears and X close button hides again!
            await window.browser.runtime.sendMessage({
              type: 'TOGGLE_NOW_PLAYING_COMMAND',
              appId: 'spotify',
              command: 'play_pause',
            });
            await new Promise((r) => setTimeout(r, 140));
            const afterResume = {
              barVisible: !bar.classList.contains('hidden'),
              closeHidden: closeBtn.classList.contains('hidden'),
              iconState: playBtn.dataset.iconState,
            };

            return {
              defaultAutoHide,
              migratedAutoHide: migratedProfile.miniNowPlayingAutoHidePaused,
              migratedFlag: migratedProfile.miniNowPlayingKeepPausedMigratedV1,
              whilePlaying,
              whilePaused,
              afterClose,
              afterResume,
            };
            """
        )

        self.assertFalse(res["defaultAutoHide"], "Default miniNowPlayingAutoHidePaused must be false")
        self.assertFalse(res["migratedAutoHide"], "Existing v2.8.0 profiles must migrate miniNowPlayingAutoHidePaused to false")
        self.assertTrue(res["migratedFlag"])
        self.assertTrue(res["whilePlaying"]["barVisible"])
        self.assertTrue(res["whilePlaying"]["closeHidden"], "Close X button must be hidden while playing")
        self.assertEqual(res["whilePlaying"]["iconState"], "pause")
        self.assertTrue(res["whilePaused"]["barVisible"], "Bar must STAY visible when paused")
        self.assertFalse(res["whilePaused"]["closeHidden"], "Close X button must appear when paused")
        self.assertEqual(res["whilePaused"]["iconState"], "play")
        self.assertFalse(res["afterClose"]["barVisible"], "Clicking X close button must hide the paused bar")
        self.assertTrue(res["afterResume"]["barVisible"], "Resuming playback must bring the bar back")
        self.assertTrue(res["afterResume"]["closeHidden"], "Close X button must hide again once playing")
        self.assertEqual(res["afterResume"]["iconState"], "pause")

    def test_t5_10_now_playing_volume_slider_mute_restore_and_narrow_zero_overflow(self) -> None:
        """Mini Now Playing volume slider controls bg volume, speaker button mutes/restores previous level, and fits narrow 320px sidebars cleanly."""
        settings = make_default_settings_seed(
            miniNowPlayingEnabled=True,
            miniNowPlayingAutoHidePaused=False,
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
        )
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=settings)

        res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const uiWin = window.__bridge.uiWin;
            const bgWin = window.__bridge.bgWin;
            const bg = bgWin.FoxHubBg;

            const postedPort = [];
            bg.emeBridgePorts.set('bg:spotify', { postMessage: (m) => postedPort.push(m) });
            const fakeVideo = bgWin.document.createElement('video');
            fakeVideo.volume = 1.0;
            fakeVideo.muted = false;
            bg.bgSpEmePlayers.set('spotify', {
              id: 950,
              appId: 'spotify',
              isClear: false,
              isStaging: false,
              disposed: false,
              sourceType: 'bg',
              videoEl: fakeVideo,
              sb: null,
              trackDuration: 256,
              trackTitle: 'White Iverson',
              desiredVolume: 1.0,
              desiredMuted: false,
              remotePaused: false,
              explicitUserPause: false,
            });

            await window.browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/',
              playback: {
                isPlaying: true,
                title: 'White Iverson',
                artist: 'Post Malone',
                currentTime: 64,
                duration: 256,
                volume: 1.0,
                muted: false,
              },
            });
            await new Promise((r) => setTimeout(r, 120));

            const slider = uiDoc.getElementById('pm-np-vol-slider');
            const volBtn = uiDoc.getElementById('pm-np-vol-btn');
            const rect = slider.getBoundingClientRect();

            // 1. Click/drag slider to 40%
            const x40 = rect.left + rect.width * 0.4;
            const yMid = rect.top + rect.height / 2;
            slider.dispatchEvent(new uiWin.PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x40, clientY: yMid, button: 0, pointerId: 1, pointerType: 'mouse' }));
            slider.dispatchEvent(new uiWin.PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: x40, clientY: yMid, button: 0, pointerId: 1, pointerType: 'mouse' }));
            await new Promise((r) => setTimeout(r, 120));

            const sp = bg.bgSpEmePlayers.get('spotify');
            const afterDrag = {
              spVol: sp.desiredVolume,
              vidVol: fakeVideo.volume,
              spMuted: sp.desiredMuted,
              iconState: volBtn.dataset.iconState,
              ariaNow: slider.getAttribute('aria-valuenow'),
              portVolCmds: postedPort.filter((m) => m && m.cmd === 'PM_MEDIA_CONTROL' && m.command === 'set_volume'),
            };

            // 2. Click speaker button -> mutes to 0
            volBtn.click();
            await new Promise((r) => setTimeout(r, 100));
            const afterMute = {
              spVol: sp.desiredVolume,
              spMuted: sp.desiredMuted,
              vidMuted: fakeVideo.muted,
              iconState: volBtn.dataset.iconState,
              ariaNow: slider.getAttribute('aria-valuenow'),
            };

            // 3. Click speaker button again -> restores previous ~40% volume!
            volBtn.click();
            await new Promise((r) => setTimeout(r, 100));
            const afterUnmute = {
              spVol: sp.desiredVolume,
              spMuted: sp.desiredMuted,
              vidMuted: fakeVideo.muted,
              iconState: volBtn.dataset.iconState,
            };

            // 4. Keyboard End -> 100%
            slider.dispatchEvent(new uiWin.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
            await new Promise((r) => setTimeout(r, 80));
            const afterEndKey = sp.desiredVolume;

            return { afterDrag, afterMute, afterUnmute, afterEndKey };
            """
        )

        self.assertAlmostEqual(res["afterDrag"]["spVol"], 0.4, delta=0.06)
        self.assertAlmostEqual(res["afterDrag"]["vidVol"], 0.4, delta=0.06)
        self.assertFalse(res["afterDrag"]["spMuted"])
        self.assertEqual(res["afterDrag"]["iconState"], "vol-low")
        self.assertGreaterEqual(len(res["afterDrag"]["portVolCmds"]), 1)

        self.assertTrue(res["afterMute"]["spMuted"])
        self.assertTrue(res["afterMute"]["vidMuted"])
        self.assertEqual(res["afterMute"]["iconState"], "vol-muted")
        self.assertEqual(res["afterMute"]["ariaNow"], "0")

        self.assertFalse(res["afterUnmute"]["spMuted"])
        self.assertFalse(res["afterUnmute"]["vidMuted"])
        self.assertAlmostEqual(res["afterUnmute"]["spVol"], 0.4, delta=0.06)
        self.assertEqual(res["afterUnmute"]["iconState"], "vol-low")

        self.assertAlmostEqual(res["afterEndKey"], 1.0, delta=0.02)

    def test_t5_11_spotify_close_reopen_never_mutes_or_drops_next_track(self):
        """
        Regression test for close -> reopen silence ("muted itself" while Spotify
        shows "Playing on Web Player (Firefox)" on next track / mid-handoff):
          1. While sidebar takeover is pending (handoffSource='sidebar') and sidebar
             is still in Connect remote-control mode, bg's next-track MSE_INIT,
             GEN_REQ, and MSE_CHUNK MUST NOT be dropped; bg transitions cleanly
             from Track 1 to Track 2 unmuted at full volume.
          2. Spurious VOLUME { muted: true, volume: 0 } from hidden bg iframe MUST
             NOT mute an audible player.
          3. Closing the sidebar while bgAudioPool still holds a connected bg iframe
             MUST clear stale sidebar handoff state (abortSidebarSpTakeover) and keep
             bg playing unmuted.
          4. Fast close -> reopen MUST dispose a mismatched-sourceType staging player
             and MUST NOT drop bg chunks whose msId is lower than the old sidebar msId.
          5. Natural track advance when activeSp has ended MUST NOT be blocked by
             block-mismatched-staging-promote.
          6. __pmEnsureSpotifyLocalTakeover(true) falls back to PUT /v1/me/player
             when connect-state/v1/connect/transfer fails.
        """
        settings = make_default_settings_seed(
            keepAudioPlayingWhenClosed=True,
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
        )
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=settings)
        res = self.safe_eval_async(
            """
            const bgWin = window.__bridge.bgWin;
            const bg = bgWin.FoxHubBg;
            const makeFakeVideo = (ct = 250, ended = false) => ({
              paused: false,
              ended,
              muted: false,
              volume: 1.0,
              playbackRate: 1.0,
              readyState: 4,
              currentTime: ct,
              play() { this.paused = false; return Promise.resolve(); },
              pause() { this.paused = true; },
              removeAttribute() {},
              load() {},
              remove() {},
              addEventListener() {},
              removeEventListener() {}
            });

            // === Part 1: Track transition on bg during pending sidebar takeover ===
            const bgFrame = bgWin.document.createElement('iframe');
            bgFrame.name = 'pm-bg-audio-spotify';
            bgWin.document.body.appendChild(bgFrame);
            bg.bgAudioPool.set('spotify', { frame: bgFrame, url: 'https://open.spotify.com/', title: 'White Iverson' });

            const vid1 = makeFakeVideo(254, false);
            bg.bgSpEmePlayers.set('spotify', {
              id: 501,
              appId: 'spotify',
              msId: 100,
              originSource: 'bg',
              sourceType: 'bg',
              disposed: false,
              isStaging: false,
              isNextPreload: false,
              hasLicense: true,
              trackTitle: 'White Iverson',
              trackDuration: 256,
              desiredVolume: 1.0,
              desiredMuted: false,
              remotePaused: false,
              explicitUserPause: false,
              awaitingBgFrameHandoff: false,
              handoffSource: 'bg',
              handoffStartedAt: 0,
              videoEl: vid1,
              sb: { buffered: { length: 1, start: () => 0, end: () => 256 } },
              queue: [],
              pendingGenReqs: [],
              processedInitDataKeys: new Set()
            });

            // Reopen sidebar -> SIDEBAR_SP_TAKEOVER_BEGIN sets handoffSource='sidebar'
            const takeoverRes = await window.browser.runtime.sendMessage({
              type: 'SIDEBAR_SP_TAKEOVER_BEGIN',
              appId: 'spotify'
            });

            // While sidebar stays silent in Connect remote-control mode, Track 1 advances
            // to Track 2 ("Till I Collapse", msId=101) on bg!
            bgWin.__pmHandleSpEmeBridge('spotify', {
              bridgeType: 'MSE_INIT',
              mime: 'audio/mp4; codecs="mp4a.40.2"',
              msId: 101
            }, 'bg');
            const initData = new bgWin.Uint8Array([1, 2, 3, 4]).buffer;
            bgWin.__pmHandleSpEmeBridge('spotify', {
              bridgeType: 'GEN_REQ',
              initDataType: 'cenc',
              initData
            }, 'bg');
            const initChunk = new bgWin.Uint8Array([9, 8, 7, 6]).buffer;
            bgWin.__pmHandleSpEmeBridge('spotify', {
              bridgeType: 'MSE_CHUNK',
              mime: 'audio/mp4; codecs="mp4a.40.2"',
              msId: 101,
              chunk: initChunk,
              timestampOffset: 0
            }, 'bg');

            const nxBeforePromote = bg.bgNextSpPlayers.get('spotify');
            const nxCaptured = {
              exists: Boolean(nxBeforePromote && !nxBeforePromote.disposed),
              msId: nxBeforePromote ? nxBeforePromote.msId : 0,
              queueLen: nxBeforePromote ? nxBeforePromote.queue.length : 0,
              genReqsLen: nxBeforePromote ? nxBeforePromote.pendingGenReqs.length : 0
            };

            // Track 2 begins playing on bg (SYNC_TIME msId=101)
            if (nxBeforePromote) {
              nxBeforePromote.hasLicense = true;
              nxBeforePromote.videoEl = makeFakeVideo(0, false);
              nxBeforePromote.videoEl.muted = true;
              nxBeforePromote.videoEl.volume = 0;
              nxBeforePromote.sb = { buffered: { length: 1, start: () => 0, end: () => 30 } };
            }
            bgWin.__pmHandleSpEmeBridge('spotify', {
              bridgeType: 'SYNC_TIME',
              msId: 101,
              paused: false,
              currentTime: 7,
              duration: 297,
              trackTitle: 'Till I Collapse',
              artist: 'Eminem, Nate Dogg'
            }, 'bg');

            const spAfterNext = bg.bgSpEmePlayers.get('spotify');
            const part1 = {
              takeoverResume: Boolean(takeoverRes && takeoverRes.resume),
              nxCaptured,
              activeMsId: spAfterNext ? spAfterNext.msId : 0,
              activeTitle: spAfterNext ? spAfterNext.trackTitle : '',
              muted: spAfterNext && spAfterNext.videoEl ? spAfterNext.videoEl.muted : true,
              volume: spAfterNext && spAfterNext.videoEl ? spAfterNext.videoEl.volume : 0,
              desiredMuted: spAfterNext ? spAfterNext.desiredMuted : true,
              desiredVolume: spAfterNext ? spAfterNext.desiredVolume : 0,
              stillAwaitingSidebar: Boolean(spAfterNext && spAfterNext.awaitingBgFrameHandoff && spAfterNext.handoffSource === 'sidebar')
            };

            // === Part 2: Spurious hidden-bg VOLUME { muted: true, volume: 0 } must be ignored ===
            bgWin.__pmHandleSpEmeBridge('spotify', {
              bridgeType: 'VOLUME',
              volume: 0,
              muted: true
            }, 'bg');
            const part2 = {
              muted: spAfterNext.videoEl.muted,
              volume: spAfterNext.videoEl.volume,
              desiredMuted: spAfterNext.desiredMuted,
              desiredVolume: spAfterNext.desiredVolume
            };

            // === Part 3: Re-closing sidebar while bg frame is still connected clears stale sidebar handoff ===
            bg.startBackgroundAudioKeepAlive('spotify', 'https://open.spotify.com/', 'Till I Collapse');
            const spAfterReclose = bg.bgSpEmePlayers.get('spotify');
            const part3 = {
              hasStaging: bg.bgStagingSpPlayers.has('spotify'),
              awaiting: Boolean(spAfterReclose && spAfterReclose.awaitingBgFrameHandoff),
              handoffSource: spAfterReclose ? spAfterReclose.handoffSource : '',
              muted: spAfterReclose && spAfterReclose.videoEl ? spAfterReclose.videoEl.muted : true,
              volume: spAfterReclose && spAfterReclose.videoEl ? spAfterReclose.videoEl.volume : 0
            };

            // === Part 4: Fast close -> reopen: mismatched staging sourceType disposed + lower bg msId accepted ===
            const warmVid = makeFakeVideo(90, false);
            bg.bgSpEmePlayers.set('spotify', {
              id: 502,
              appId: 'spotify',
              msId: 500,
              originSource: 'sidebar',
              sourceType: 'bg',
              disposed: false,
              isStaging: false,
              isNextPreload: false,
              hasLicense: true,
              trackTitle: 'White Iverson',
              trackDuration: 256,
              desiredVolume: 0.85,
              desiredMuted: false,
              remotePaused: false,
              explicitUserPause: false,
              awaitingBgFrameHandoff: true,
              handoffSource: 'sidebar',
              handoffStartedAt: Date.now(),
              videoEl: warmVid,
              sb: { buffered: { length: 1, start: () => 80, end: () => 110 } },
              queue: [],
              pendingGenReqs: [],
              processedInitDataKeys: new Set()
            });
            bg.ensureStagingSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 0, 'bg');
            const oldBgSt = bg.bgStagingSpPlayers.get('spotify');
            bg.ensureStagingSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 0, 'sidebar');
            const newSbSt = bg.bgStagingSpPlayers.get('spotify');

            // Fresh bg iframe boots with msId=1 (< old sidebar msId=500)
            bgWin.__pmHandleSpEmeBridge('spotify', {
              bridgeType: 'MSE_CHUNK',
              mime: 'audio/mp4; codecs="mp4a.40.2"',
              msId: 1,
              chunk: new bgWin.Uint8Array([4, 5, 6, 7]).buffer,
              timestampOffset: 0
            }, 'bg');
            const bgFreshNx = bg.bgNextSpPlayers.get('spotify');
            const part4 = {
              oldBgStDisposed: Boolean(oldBgSt && oldBgSt.disposed),
              newSbStOrigin: newSbSt ? newSbSt.originSource : '',
              bgLowerMsIdAccepted: Boolean(bgFreshNx && !bgFreshNx.disposed && bgFreshNx.msId === 1 && bgFreshNx.queue.length >= 1)
            };

            // === Part 5: Ended activeSp MUST allow ready next-track stagingSp promotion ===
            const endedVid = makeFakeVideo(256, true);
            endedVid.paused = true;
            bg.bgNextSpPlayers.delete('spotify');
            bg.bgSpEmePlayers.set('spotify', {
              id: 503,
              appId: 'spotify',
              msId: 200,
              originSource: 'bg',
              sourceType: 'bg',
              disposed: false,
              isStaging: false,
              isNextPreload: false,
              hasLicense: true,
              trackTitle: 'White Iverson',
              trackDuration: 256,
              desiredVolume: 0.9,
              desiredMuted: false,
              remotePaused: false,
              explicitUserPause: false,
              awaitingBgFrameHandoff: true,
              handoffSource: 'sidebar',
              handoffStartedAt: Date.now(),
              videoEl: endedVid,
              sb: { buffered: { length: 1, start: () => 230, end: () => 256 } },
              queue: [],
              pendingGenReqs: [],
              processedInitDataKeys: new Set()
            });
            bg.bgStagingSpPlayers.set('spotify', {
              id: 504,
              appId: 'spotify',
              msId: 201,
              originSource: 'sidebar',
              sourceType: 'sidebar',
              disposed: false,
              isStaging: true,
              isNextPreload: false,
              hasLicense: true,
              licensedAt: Date.now(),
              trackTitle: 'Till I Collapse',
              trackDuration: 297,
              desiredVolume: 1.0,
              desiredMuted: false,
              explicitSidebarPlayIntent: false,
              videoEl: makeFakeVideo(0, false),
              sb: { buffered: { length: 1, start: () => 0, end: () => 18 } },
              queue: [],
              pendingGenReqs: [],
              processedInitDataKeys: new Set()
            });
            bg.checkAndPromoteStagingSpPlayer('spotify');
            const spAfterEndedPromote = bg.bgSpEmePlayers.get('spotify');
            const part5 = {
              promotedTitle: spAfterEndedPromote ? spAfterEndedPromote.trackTitle : '',
              promotedSource: spAfterEndedPromote ? spAfterEndedPromote.sourceType : '',
              muted: spAfterEndedPromote && spAfterEndedPromote.videoEl ? spAfterEndedPromote.videoEl.muted : true,
              volume: spAfterEndedPromote && spAfterEndedPromote.videoEl ? spAfterEndedPromote.videoEl.volume : 0
            };

            return { part1, part2, part3, part4, part5 };
            """
        )

        self.assertTrue(res["part1"]["takeoverResume"])
        self.assertTrue(res["part1"]["nxCaptured"]["exists"], "bg next-track MSE_INIT must NOT be dropped during pending sidebar takeover")
        self.assertEqual(res["part1"]["nxCaptured"]["msId"], 101)
        self.assertGreaterEqual(res["part1"]["nxCaptured"]["queueLen"], 1, "bg next-track MSE_CHUNK init segment must NOT be dropped")
        self.assertGreaterEqual(res["part1"]["nxCaptured"]["genReqsLen"], 1, "bg next-track GEN_REQ must NOT be dropped")
        self.assertEqual(res["part1"]["activeMsId"], 101)
        self.assertEqual(res["part1"]["activeTitle"], "Till I Collapse")
        self.assertFalse(res["part1"]["muted"], "Promoted bg next track must be unmuted")
        self.assertAlmostEqual(res["part1"]["volume"], 1.0, delta=0.01)
        self.assertTrue(res["part1"]["stillAwaitingSidebar"], "Pending sidebar handoff must remain ready to promote")

        self.assertFalse(res["part2"]["muted"], "Spurious hidden-bg mute must be ignored")
        self.assertAlmostEqual(res["part2"]["volume"], 1.0, delta=0.01)

        self.assertFalse(res["part3"]["hasStaging"], "Re-closing sidebar must dispose stale sidebar staging player")
        self.assertFalse(res["part3"]["awaiting"], "Re-closing sidebar must clear stale awaitingBgFrameHandoff")
        self.assertEqual(res["part3"]["handoffSource"], "bg")
        self.assertFalse(res["part3"]["muted"])
        self.assertAlmostEqual(res["part3"]["volume"], 1.0, delta=0.01)

        self.assertTrue(res["part4"]["oldBgStDisposed"], "Switching staging sourceType must dispose old staging instance")
        self.assertEqual(res["part4"]["newSbStOrigin"], "sidebar")
        self.assertTrue(res["part4"]["bgLowerMsIdAccepted"], "Fresh bg iframe with lower msId must NOT be dropped by old sidebar msId")

        self.assertEqual(res["part5"]["promotedTitle"], "Till I Collapse")
        self.assertEqual(res["part5"]["promotedSource"], "sidebar")
        self.assertFalse(res["part5"]["muted"])
        self.assertAlmostEqual(res["part5"]["volume"], 0.9, delta=0.01)

        # === Part 6: Verify media-mirror Connect Web API fallback (PUT /v1/me/player) ===
        fallback_html = (
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            "<script>"
            "window.__fetchCalls = [];"
            "window.fetch = function(url, opts) {"
            "  window.__fetchCalls.push({ url: String(url), method: (opts && opts.method) || 'GET', body: opts && opts.body });"
            "  if (String(url).includes('/connect-state/v1/connect/transfer/')) {"
            "    return Promise.resolve({ ok: false, status: 404, clone: () => ({ json: () => Promise.resolve({}) }) });"
            "  }"
            "  return Promise.resolve({ ok: true, status: 204, clone: () => ({ json: () => Promise.resolve({ active_device_id: 'bg_dev_999' }) }) });"
            "};"
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
            "window.localStorage.setItem('_spharmony_device_id', 'sidebar_dev_777');"
            "const ctx = initFrameContext({ cleanWindowName: 'pm-media-frame-spotify', isFoxHubMediaFrame: true, isFoxHubContext: true, isBgAudioFrame: false, isStandbyBgFrame: false });"
            "ctx.host = 'open.spotify.com';"
            "ctx.hasHost = (s) => s === 'spotify.com';"
            "ctx.isMirrorAudioHost = true;"
            "installMediaMirrorHooks(ctx, null);"
            "await window.fetch('https://spclient.wg.spotify.com/connect-state/v1/devices/hobs_sidebar_dev_777', { headers: { authorization: 'Bearer tok_test_123' } });"
            "await new Promise((r) => setTimeout(r, 30));"
            "window.__takeoverResult = window.__pmEnsureSpotifyLocalTakeover(true);"
            "await new Promise((r) => setTimeout(r, 60));"
            "window.__fallbackDone = true;"
            "</script></body></html>"
        )
        fb_url = self.server.register_fixture("t5_11_sp_connect_fallback.html", fallback_html)
        self.fx.reset_to_blank()
        self.fx.navigate(fb_url)
        fb_res = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 4000;
            while (Date.now() < deadline && !window.__fallbackDone) {
              await new Promise((r) => setTimeout(r, 25));
            }
            return { result: window.__takeoverResult, calls: window.__fetchCalls };
            """
        )
        self.assertEqual(fb_res["result"], "transferred")
        transfer_calls = [c for c in fb_res["calls"] if "/connect-state/v1/connect/transfer/" in c["url"]]
        web_api_calls = [c for c in fb_res["calls"] if "api.spotify.com/v1/me/player" in c["url"]]
        self.assertGreaterEqual(len(transfer_calls), 1, "Must try spclient.wg.spotify.com connect-state transfer first")
        self.assertTrue(transfer_calls[0]["url"].startswith("https://spclient.wg.spotify.com/"))
        self.assertGreaterEqual(len(web_api_calls), 1, "Must fall back to PUT https://api.spotify.com/v1/me/player on 404")
        self.assertEqual(web_api_calls[0]["method"], "PUT")
        self.assertIn("sidebar_dev_777", str(web_api_calls[0]["body"]))


if __name__ == "__main__":
    unittest.main()
