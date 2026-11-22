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

    def test_t5_12_r1_volume_and_mute_persistence_across_reopen_refresh_recreate_and_ui_sync(self) -> None:
        """
        R1 regression suite:
          1. Settings schema & backup round-trip preserve mediaVolumeMap safely (clamped [0, 1], prototype-safe).
          2. Background engine persists user 0.4 volume & mute across player recreation, promotions,
             tab-audio auto-pause/resume, and rejects un-gestured or bg VOLUME { volume: 1.0 } overwrites,
             pushing authoritative 0.4 back down on BRIDGE_HELLO / spurious VOLUME.
          3. Reopened Mini Now Playing seeds from persisted 0.4 volume & lastNonZeroVolume on mute/unmute.
          4. Content media-mirror blocks programmatic el.volume = 1.0 (even right after Play click),
             only emits VOLUME { userInitiated: true } on volume-control gestures, syncs Spotify UI slider,
             and preserves YouTube intentional mute across yt-player-volume boot cleanup.
        """
        persisted_seed = make_default_settings_seed(
            miniNowPlayingEnabled=True,
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
            mediaVolumeMap={
                "spotify": {"volume": 0.4, "muted": False, "lastNonZeroVolume": 0.4},
                "youtube": {"volume": 0.35, "muted": True, "lastNonZeroVolume": 0.35},
            },
        )
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=persisted_seed)

        res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const bgWin = window.__bridge.bgWin;
            const bg = bgWin.FoxHubBg;
            const schema = bgWin.FoxHubSettingsSchema;

            // 1. Schema normalization & export/import
            const polluted = Object.create(null);
            polluted.spotify = { volume: 1.7, muted: false, lastNonZeroVolume: -0.5 };
            polluted['__proto__'] = { volume: 0.1 };
            const norm = schema.normalizeSettings({ mediaVolumeMap: polluted });
            const exported = schema.buildSettingsExportPayload({
              ...norm,
              mediaVolumeMap: { spotify: { volume: 0.4, muted: true, lastNonZeroVolume: 0.4 } }
            });
            const imported = schema.validateAndSanitizeImportPayload(exported);

            // 2. Seed background Spotify player & mock bridge ports
            const bgMsgs = [];
            const sbMsgs = [];
            bg.emeBridgePorts.set('bg:spotify', { postMessage: (m) => bgMsgs.push(m) });
            bg.emeBridgePorts.set('sidebar:spotify', { postMessage: (m) => sbMsgs.push(m) });
            const makeVid = () => ({
              paused: false, ended: false, muted: false, volume: 1.0, playbackRate: 1.0, readyState: 4, currentTime: 40,
              play() { this.paused = false; return Promise.resolve(); },
              pause() { this.paused = true; },
              removeAttribute() {}, load() {}, remove() {}, addEventListener() {}, removeEventListener() {}
            });
            await bg.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 10, 'bg');
            const sp1 = bg.bgSpEmePlayers.get('spotify');
            sp1.videoEl = makeVid();
            sp1.videoEl.volume = sp1.desiredVolume;
            sp1.sb = { buffered: { length: 1, start: () => 0, end: () => 80 } };
            const seededVol = sp1.desiredVolume;

            // Reject programmatic 1.0 from bg AND un-gestured sidebar, pushing 0.4 back down!
            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'VOLUME', volume: 1.0, muted: false }, 'bg');
            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'VOLUME', volume: 1.0, muted: false }, 'sidebar');
            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'BRIDGE_HELLO' }, 'sidebar');
            const volAfterSpurious = sp1.desiredVolume;
            const pushedDownCount = sbMsgs.filter(
              (m) => m && m.cmd === 'PM_MEDIA_CONTROL' && m.command === 'set_volume' && Math.abs(m.volume - 0.4) < 0.01
            ).length;

            // Genuine userInitiated volume change -> updates and persists
            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'VOLUME', volume: 0.45, muted: false, userInitiated: true }, 'sidebar');
            const persistedAfterGesture = bg.state.currentSettings.mediaVolumeMap.spotify.volume;
            // Restore back to 0.4 via Now Playing command
            await window.browser.runtime.sendMessage({
              type: 'TOGGLE_NOW_PLAYING_COMMAND',
              appId: 'spotify',
              command: 'set_volume',
              volume: 0.4,
              muted: false
            });

            // Promote next-track player -> must keep 0.4
            await bg.ensureNextSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 11, 'bg');
            const nx = bg.bgNextSpPlayers.get('spotify');
            nx.hasLicense = true;
            nx.videoEl = makeVid();
            nx.sb = { buffered: { length: 1, start: () => 0, end: () => 30 } };
            bg.promoteNextSpPlayer('spotify', 0);
            const sp2 = bg.bgSpEmePlayers.get('spotify');
            const volAfterPromoteNext = sp2.desiredVolume;

            // Tab-audio auto-pause sets videoEl.muted=true transiently -> getActiveNowPlayingState must keep muted: false!
            bg.pauseAllForTabAudioAutoPause(false);
            const npDuringTabAutoPause = bg.getActiveNowPlayingState();
            bg.resumeAllFromTabAudioAutoPause();
            const volAfterTabResume = sp2.videoEl.volume;

            // Mute -> unmute via Mini Now Playing bar after reopen -> must restore 0.4 (NOT 0.8 or 1.0)!
            await window.browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/',
              playback: { isPlaying: true, title: 'Persist Song', artist: 'Artist', currentTime: 25, duration: 200 }
            });
            await new Promise((r) => setTimeout(r, 120));
            const slider = uiDoc.getElementById('pm-np-vol-slider');
            const volBtn = uiDoc.getElementById('pm-np-vol-btn');
            const initialSliderVal = slider ? slider.getAttribute('aria-valuenow') : '';
            volBtn.click();
            await new Promise((r) => setTimeout(r, 90));
            const mutedNow = sp2.desiredMuted;
            volBtn.click();
            await new Promise((r) => setTimeout(r, 90));
            const unmutedVol = sp2.desiredVolume;

            return {
              normVol: norm.mediaVolumeMap.spotify.volume,
              hasProto: Object.prototype.hasOwnProperty.call(norm.mediaVolumeMap, '__proto__'),
              importedOk: imported.ok,
              importedSp: imported.settings?.mediaVolumeMap?.spotify,
              seededVol,
              volAfterSpurious,
              pushedDownCount,
              persistedAfterGesture,
              volAfterPromoteNext,
              tabAutoPausePhysicalMuted: sp2.videoEl.muted,
              npMutedDuringTabPause: npDuringTabAutoPause ? npDuringTabAutoPause.muted : null,
              volAfterTabResume,
              initialSliderVal,
              mutedNow,
              unmutedVol
            };
            """
        )

        self.assertAlmostEqual(res["normVol"], 1.0, delta=0.01)
        self.assertFalse(res["hasProto"])
        self.assertTrue(res["importedOk"])
        self.assertAlmostEqual(res["importedSp"]["volume"], 0.4, delta=0.01)
        self.assertTrue(res["importedSp"]["muted"])
        self.assertAlmostEqual(res["seededVol"], 0.4, delta=0.01)
        self.assertAlmostEqual(res["volAfterSpurious"], 0.4, delta=0.01)
        self.assertGreaterEqual(res["pushedDownCount"], 2, "Must push saved 0.4 volume down on spurious VOLUME and BRIDGE_HELLO")
        self.assertAlmostEqual(res["persistedAfterGesture"], 0.45, delta=0.01)
        self.assertAlmostEqual(res["volAfterPromoteNext"], 0.4, delta=0.01)
        self.assertIs(res["npMutedDuringTabPause"], False, "Transient tab auto-pause must NOT report user-muted")
        self.assertAlmostEqual(res["volAfterTabResume"], 0.4, delta=0.01)
        self.assertEqual(res["initialSliderVal"], "40", "Mini Now Playing must seed 40% from persisted settings")
        self.assertTrue(res["mutedNow"])
        self.assertAlmostEqual(res["unmutedVol"], 0.4, delta=0.01, msg="Unmuting after reopen must restore 0.4")

        # Content-layer media-mirror test: Play click vs volume-control gesture + UI slider sync + YT mute guard
        mirror_html = (
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            "<script>"
            "window.__portMsgs = [];"
            "const origConnect = browser.runtime.connect.bind(browser.runtime);"
            "browser.runtime.connect = function(info) {"
            "  const p = origConnect(info);"
            "  const origPost = p.postMessage.bind(p);"
            "  p.postMessage = function(m) { window.__portMsgs.push(m); return origPost(m); };"
            "  return p;"
            "};"
            "window.wrappedJSObject = window;"
            "window.exportFunction = function(fn, target, opts) {"
            "  if (opts && opts.defineAs && target) target[opts.defineAs] = fn;"
            "  return fn;"
            "};"
            "window.cloneInto = function(obj) { return obj; };"
            "</script></head><body>"
            "<button id='play-btn' data-testid='control-button-playpause' aria-label='Play'>Play</button>"
            "<div data-testid='volume-bar'><input id='sp-vol-range' type='range' min='0' max='100' value='100'>"
            "<div id='sp-vol-prog' data-testid='progress-bar'></div></div>"
            "<script type='module'>"
            "import { initFrameContext } from '/src/content/core/frame-context.js';"
            "import { installMediaMirrorHooks } from '/src/content/core/media-mirror.js';"
            "try {"
            "  await browser.storage.local.set({ settings: { mediaVolumeMap: { spotify: { volume: 0.4, muted: false, lastNonZeroVolume: 0.4 } } } });"
            "  const ctx = initFrameContext({ cleanWindowName: 'pm-media-frame-spotify', isFoxHubMediaFrame: true, isFoxHubContext: true, isBgAudioFrame: false, isStandbyBgFrame: false });"
            "  ctx.host = 'open.spotify.com';"
            "  ctx.hasHost = (s) => s === 'spotify.com';"
            "  ctx.isMirrorAudioHost = true;"
            "  installMediaMirrorHooks(ctx, null);"
            "  await new Promise((r) => setTimeout(r, 80));"
            "  const v = document.createElement('video');"
            "  let volChangeEvents = 0;"
            "  v.addEventListener('volumechange', () => { volChangeEvents++; });"
            "  v.play().catch(() => {});"
            "  const afterHookEmitCount = window.__portMsgs.filter((m) => m.bridgeType === 'VOLUME').length;"
            "  window.__testMirrorState = { v, afterHookEmitCount, getVolChanges: () => volChangeEvents };"
            "} catch (e) { window.__testMirrorErr = String(e); }"
            "</script></body></html>"
        )
        m_url = self.server.register_fixture("t5_12_r1_mirror.html", mirror_html)
        self.fx.reset_to_blank()
        self.fx.navigate(m_url)
        ready = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline && !window.__testMirrorState && !window.__testMirrorErr) {
              await new Promise((r) => setTimeout(r, 25));
            }
            return { ready: Boolean(window.__testMirrorState), err: window.__testMirrorErr || null };
            """
        )
        self.assertTrue(ready["ready"], msg=str(ready.get("err")))
        # Trusted click on Play button (general gesture) then Spotify sets v.volume = 1.0 -> MUST be blocked!
        self.fx.click("#play-btn")
        play_res = self.fx.eval_js(
            """
            const st = window.__testMirrorState;
            st.v.volume = 1.0;
            st.v.muted = true;
            return {
              afterHookEmitCount: st.afterHookEmitCount,
              volAfterPlayClickAssign: st.v.volume,
              mutedAfterPlayClickAssign: st.v.muted,
              emitAfterPlayClick: window.__portMsgs.filter((m) => m.bridgeType === 'VOLUME').length
            };
            """
        )
        # Trusted click on volume slider -> MUST accept 0.65 & emit VOLUME { userInitiated: true }
        self.fx.click("#sp-vol-range")
        m_res = self.fx.eval_async_js(
            """
            const st = window.__testMirrorState;
            st.v.volume = 0.65;
            const volAfterSliderGesture = st.v.volume;
            const volBridgeMsgs = window.__portMsgs.filter((m) => m.bridgeType === 'VOLUME');
            // Wait past the 1500ms anti-drag guard before verifying Mini Now Playing -> Spotify UI sync
            await new Promise((r) => setTimeout(r, 1550));
            window.__pmSetMirrorVolume(0.4, false);
            return {
              volAfterSliderGesture,
              volBridgeMsgs,
              rangeValAfterSync: document.getElementById('sp-vol-range').value,
              progTransform: document.getElementById('sp-vol-prog').style.getPropertyValue('--progress-bar-transform'),
              volChangeEvents: st.getVolChanges()
            };
            """
        )
        self.assertEqual(play_res["afterHookEmitCount"], 0, "hookMusicElement must NOT emit un-gestured VOLUME on init")
        self.assertAlmostEqual(play_res["volAfterPlayClickAssign"], 0.4, delta=0.01, msg="Play click must NOT authorize programmatic el.volume = 1.0")
        self.assertFalse(play_res["mutedAfterPlayClickAssign"], "Play click must NOT authorize programmatic el.muted = true")
        self.assertEqual(play_res["emitAfterPlayClick"], 0)
        self.assertAlmostEqual(m_res["volAfterSliderGesture"], 0.65, delta=0.01)
        self.assertEqual(len(m_res["volBridgeMsgs"]), 1)
        self.assertTrue(m_res["volBridgeMsgs"][0].get("userInitiated"))
        self.assertAlmostEqual(m_res["volBridgeMsgs"][0].get("volume"), 0.65, delta=0.01)
        self.assertEqual(m_res["rangeValAfterSync"], "40")
        self.assertEqual(m_res["progTransform"], "40%")
        self.assertGreaterEqual(m_res["volChangeEvents"], 1)

    def test_t5_13_r2_forward_timestamp_continuity_reload_connect_and_app_switch(self) -> None:
        """
        R2 regression suite:
          1. Fractional timestamps + handedOffAt preserved in handoff metadata; unbuffered staging promotion
             aligns forward (minContinueCt) instead of jumping 1-2s backward.
          2. In-sidebar reload (SIDEBAR_FRAME_RELOAD_PREPARE) routes reloaded msId into staging with minContinueCt
             instead of promoting bgNextSpPlayers at 0:00.
          3. abortSidebarSpTakeover forces ACTIVATE_BG_SPOTIFY_HANDOFF Connect re-claim even while activeSp is draining,
             and startBackgroundAudioKeepAlive preserves warm buffers on close.
          4. media-mirror observes dealer.spotify.com WebSocket active_device_id in real time.
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
            const bgPortMsgs = [];
            const sbPortMsgs = [];
            bg.emeBridgePorts.set('bg:spotify', { postMessage: (m) => bgPortMsgs.push(m) });
            bg.emeBridgePorts.set('sidebar:spotify', { postMessage: (m) => sbPortMsgs.push(m) });

            const makeVid = (ct = 47.6) => ({
              paused: false, ended: false, muted: false, volume: 1.0, playbackRate: 1.0, readyState: 4, currentTime: ct,
              play() { this.paused = false; return Promise.resolve(); },
              pause() { this.paused = true; },
              removeAttribute() {}, load() {}, remove() {}, addEventListener() {}, removeEventListener() {}
            });

            // 1. Fractional handoff + unbuffered staging promotion forward alignment
            const bgFrame = bgWin.document.createElement('iframe');
            bgFrame.name = 'pm-bg-audio-spotify';
            bgWin.document.body.appendChild(bgFrame);
            bg.bgAudioPool.set('spotify', { frame: bgFrame, url: 'https://open.spotify.com/', title: 'Track One' });
            await bg.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 10, 'bg');
            const sp = bg.bgSpEmePlayers.get('spotify');
            sp.trackTitle = 'Track One';
            sp.trackDuration = 200;
            sp.videoEl = makeVid(47.6);
            sp.sb = { buffered: { length: 1, start: () => 20, end: () => 65 } };

            const tk = await window.browser.runtime.sendMessage({ type: 'SIDEBAR_SP_TAKEOVER_BEGIN', appId: 'spotify' });
            const st = bg.bgStagingSpPlayers.get('spotify');
            st.hasLicense = true;
            st.licensedAt = Date.now();
            st.trackTitle = 'Track One';
            // Staging only buffered 0..10 (unbuffered at 47.6)
            st.sb = { buffered: { length: 1, start: () => 0, end: () => 10 } };
            bg.promoteStagingSpPlayer('spotify', true);
            const promotedSp = bg.bgSpEmePlayers.get('spotify');
            const promotedState = {
              tkCurrentTime: tk.currentTime,
              hasHandedOffAt: Boolean(tk.handedOffAt),
              targetTime: promotedSp.targetTime,
              minContinueCt: promotedSp.minContinueCt,
              pendingSeekTarget: promotedSp.pendingSeekTarget,
              seekCmds: sbPortMsgs.filter((m) => m && m.cmd === 'SEEK_SP_MEDIA')
            };

            // 2. In-sidebar reload protection: reload at 60.5s must NOT route msId=99 into bgNextSpPlayers & jump to 0.5s!
            promotedSp.sourceType = 'sidebar';
            promotedSp.msId = 50;
            promotedSp.videoEl = makeVid(60.5);
            promotedSp.sb = { buffered: { length: 1, start: () => 40, end: () => 85 } };
            await window.browser.runtime.sendMessage({ type: 'SIDEBAR_FRAME_RELOAD_PREPARE', appId: 'spotify' });
            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'MSE_INIT', msId: 99, mime: 'audio/mp4; codecs="mp4a.40.2"' }, 'sidebar');
            bgWin.__pmHandleSpEmeBridge('spotify', {
              bridgeType: 'SYNC_TIME', msId: 99, paused: false, currentTime: 0.5, duration: 200, trackTitle: 'Track One'
            }, 'sidebar');
            const reloadState = {
              hasNextSp: bg.bgNextSpPlayers.has('spotify'),
              hasStagingSp: bg.bgStagingSpPlayers.has('spotify'),
              activeMsId: bg.bgSpEmePlayers.get('spotify')?.msId,
              activeCt: bg.bgSpEmePlayers.get('spotify')?.videoEl?.currentTime,
              stagingMinContinue: bg.bgStagingSpPlayers.get('spotify')?.minContinueCt
            };

            // 3. abortSidebarSpTakeover forces Connect reclaim on bg:spotify even when activeSp is still playing (!paused)
            bg.bgAudioPool.set('spotify', { frame: bgFrame, url: 'https://open.spotify.com/', title: 'Track One' });
            promotedSp.sourceType = 'bg';
            promotedSp.awaitingBgFrameHandoff = true;
            promotedSp.handoffSource = 'sidebar';
            bgPortMsgs.length = 0;
            bg.abortSidebarSpTakeover('spotify');
            const reclaimMsgs = bgPortMsgs.filter((m) => m && m.cmd === 'ACTIVATE_BG_SPOTIFY_HANDOFF');

            // startBackgroundAudioKeepAlive preserves warm buffer even if remotePaused flipped transiently
            promotedSp.remotePaused = true;
            promotedSp.explicitUserPause = false;
            promotedSp.lastPlayedAt = Date.now() - 10000;
            bg.bgAudioPool.delete('spotify');
            bg.startBackgroundAudioKeepAlive('spotify', 'https://open.spotify.com/', 'Track One');
            const keptWarm = bg.bgSpEmePlayers.get('spotify') === promotedSp && !promotedSp.disposed;

            return { promotedState, reloadState, reclaimCount: reclaimMsgs.length, keptWarm };
            """
        )

        self.assertAlmostEqual(res["promotedState"]["tkCurrentTime"], 47.6, delta=0.15)
        self.assertTrue(res["promotedState"]["hasHandedOffAt"])
        self.assertGreaterEqual(res["promotedState"]["targetTime"], 47.5)
        self.assertGreaterEqual(res["promotedState"]["minContinueCt"], 47.5)
        self.assertGreaterEqual(res["promotedState"]["pendingSeekTarget"], 47.5)
        self.assertGreaterEqual(len(res["promotedState"]["seekCmds"]), 1)

        self.assertFalse(res["reloadState"]["hasNextSp"], "In-sidebar reload must NOT route into bgNextSpPlayers")
        self.assertTrue(res["reloadState"]["hasStagingSp"], "In-sidebar reload must route into staging")
        self.assertEqual(res["reloadState"]["activeMsId"], 50, "Active player must remain until staging aligns forward")
        self.assertAlmostEqual(res["reloadState"]["activeCt"], 60.5, delta=0.1)
        self.assertGreaterEqual(res["reloadState"]["stagingMinContinue"], 60.0)

        self.assertGreaterEqual(res["reclaimCount"], 1, "abortSidebarSpTakeover must reclaim Connect even while activeSp drains")
        self.assertTrue(res["keptWarm"], "startBackgroundAudioKeepAlive must preserve warm non-explicit-pause buffer")

        # 4. dealer.spotify.com WebSocket active_device_id tracking
        ws_html = (
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            "<script>"
            "window.__wsListeners = {};"
            "window.WebSocket = function(url) {"
            "  this.url = url; this.readyState = 1;"
            "  this.addEventListener = (t, fn) => { (window.__wsListeners[t] = window.__wsListeners[t] || []).push(fn); };"
            "  this.close = () => {};"
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
            "const ctx = initFrameContext({ cleanWindowName: 'pm-media-frame-spotify', isFoxHubMediaFrame: true, isFoxHubContext: true, isBgAudioFrame: false, isStandbyBgFrame: false });"
            "ctx.host = 'open.spotify.com';"
            "ctx.hasHost = (s) => s === 'spotify.com';"
            "ctx.isMirrorAudioHost = true;"
            "installMediaMirrorHooks(ctx, null);"
            "const ws = new window.WebSocket('wss://dealer.spotify.com/?access_token=abc');"
            "(window.__wsListeners['message'] || []).forEach((fn) => fn({ data: JSON.stringify({ payloads: [{ cluster: { active_device_id: 'bg_ws_dev_42' } }] }) }));"
            "window.__wsConnect = window.__pmGetSpotifyConnectState();"
            "</script></body></html>"
        )
        ws_url = self.server.register_fixture("t5_13_ws_dealer.html", ws_html)
        self.fx.reset_to_blank()
        self.fx.navigate(ws_url)
        ws_res = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline && !window.__wsConnect) {
              await new Promise((r) => setTimeout(r, 25));
            }
            return window.__wsConnect;
            """
        )
        self.assertEqual(ws_res["activeDeviceId"], "bg_ws_dev_42")

    def test_t5_14_r3_background_silence_eme_retry_eviction_and_css_antithrottling(self) -> None:
        """
        R3 regression suite:
          1. Spurious SYNC_TIME pause at bufRunway <= 0.4s after 12s MUST NOT set sp.remotePaused = true.
          2. recentGenReqs survives > 120000ms (10m < 30m TTL) and processSpInstanceGenReqs retries HTTP 503 -> 200.
          3. promoteNextSpPlayer refuses unlicensed nextSp while activeSp plays.
          4. QuotaExceededError cutEnd never evicts >= currentTime - 2 and re-unshifts item.
          5. WASAPI 20s-30s drain dead zone (24s) ignores non-active tab drain.
          6. Inactive .pm-media-frame uses off-screen visible CSS (not visibility: hidden) to prevent throttling.
        """
        settings = make_default_settings_seed(
            keepAudioPlayingWhenClosed=True,
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
        )
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=settings)

        res = self.safe_eval_async(
            """
            const uiWin = window.__bridge.uiWin;
            const uiDoc = window.__bridge.uiDoc;
            const bgWin = window.__bridge.bgWin;
            const bg = bgWin.FoxHubBg;
            const P = uiWin.FoxHubPopup;

            // 1. Spurious remotePaused ordering when bufRunway <= 0.4s after 12s
            await bg.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 20, 'bg');
            const sp = bg.bgSpEmePlayers.get('spotify');
            sp.hasLicense = true;
            sp.lastPlayedAt = Date.now() - 15000;
            sp.createdAt = Date.now() - 25000;
            sp.remotePaused = false;
            sp.videoEl = {
              paused: false, ended: false, muted: false, volume: 0.5, playbackRate: 1.0, readyState: 4, currentTime: 95.0,
              play() { this.paused = false; return Promise.resolve(); },
              pause() { this.paused = true; },
              removeAttribute() {}, load() {}, remove() {}, addEventListener() {}, removeEventListener() {}
            };
            sp.sb = { buffered: { length: 1, start: () => 80, end: () => 95.2 } };
            bgWin.__pmHandleSpEmeBridge('spotify', {
              bridgeType: 'SYNC_TIME', paused: true, explicitPause: false, spUiStillPlaying: true, currentTime: 95.0
            }, 'bg');
            const spuriousPauseState = {
              remotePaused: sp.remotePaused,
              videoPaused: sp.videoEl.paused,
              audibleId: bg.getAudibleBgAudioAppId()
            };

            // 2. recentGenReqs 10-minute survival (> 120000ms) + license retry 503 -> 200
            bg.bgSpCachedMeta.set('spotify', {
              licAuth: { url: 'https://mock.sp/lic', headers: { authorization: 'Bearer x' } },
              recentGenReqs: [{
                initDataType: 'cenc',
                initData: new bgWin.Uint8Array([10, 20, 30]).buffer,
                sig: 'cenc:10,20,30',
                ts: Date.now() - 600000
              }]
            });
            await bg.ensureNextSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 21, 'bg');
            const nx = bg.bgNextSpPlayers.get('spotify');
            const seededCountAfter10m = nx.pendingGenReqs.length + nx.processedInitDataKeys.size;

            // Unlicensed nextSp must NOT promote while activeSp plays
            const promotedUnlicensed = bg.promoteNextSpPlayer('spotify', 0);
            const nextStillKept = bg.bgNextSpPlayers.has('spotify');

            // Retry test: mock fetch returning 503 then 200
            const origFetch = bgWin.fetch;
            let licAttempts = 0;
            bgWin.fetch = () => {
              licAttempts++;
              if (licAttempts === 1) return Promise.resolve({ ok: false, status: 503 });
              return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new bgWin.ArrayBuffer(4)) });
            };
            let sessUpdates = 0;
            nx.mk = {
              createSession() {
                const listeners = {};
                return {
                  addEventListener: (t, fn) => { listeners[t] = fn; },
                  generateRequest: () => {
                    if (listeners.message) listeners.message({ message: new bgWin.ArrayBuffer(4) });
                    return Promise.resolve();
                  },
                  update: () => { sessUpdates++; return Promise.resolve(); },
                  close: () => Promise.resolve()
                };
              }
            };
            nx.hasLicense = false;
            nx.processedInitDataKeys.clear();
            nx.pendingGenReqs = [{ initDataType: 'cenc', initData: new bgWin.Uint8Array([5, 6, 7]).buffer }];
            // Trigger via LIC_AUTH and wait for 450ms exponential retry
            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'LIC_AUTH', url: 'https://mock.sp/lic', headers: { authorization: 'Bearer y' } }, 'bg');
            await new Promise((r) => setTimeout(r, 700));
            bgWin.fetch = origFetch;
            const licRecovered = Boolean(nx.hasLicense && licAttempts >= 2 && sessUpdates >= 1);

            // 3. QuotaExceededError cutEnd safety: ct=3.0, buffered 0..10 -> cutEnd <= 1.0 (never > ct - 2)
            let removedRange = null;
            const quotaSp = {
              appId: 'spotify', disposed: false, queue: [{ type: 'append', chunk: new bgWin.ArrayBuffer(8) }],
              videoEl: { currentTime: 3.0 },
              sb: {
                updating: false,
                buffered: { length: 1, start: () => 0, end: () => 10 },
                appendBuffer() { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; },
                remove(s, e) { removedRange = [s, e]; }
              }
            };
            // Invoke drain via MSE_CHUNK? Simpler: check via bgSpEmePlayers queue drain on updateend or direct handle
            // Attach a mock sb directly on sp and push a chunk via handleSpEmeBridgeMessage
            sp.msId = 20;
            sp.originSource = 'bg';
            sp.videoEl.currentTime = 3.0;
            sp.sb = quotaSp.sb;
            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'MSE_CHUNK', msId: 20, chunk: new bgWin.ArrayBuffer(8) }, 'bg');

            // 4. WASAPI 24s drain dead zone check (20s..30s)
            bg.tabAudio.recentlyStoppedMediaTabMap.set(105, Date.now() - 24000);
            const origQuery = bgWin.browser.tabs.query;
            const origSendTab = bgWin.browser.tabs.sendMessage;
            bgWin.browser.tabs.query = () => Promise.resolve([{ id: 105, audible: true, url: 'https://example.com', mutedInfo: { muted: false } }]);
            bgWin.browser.tabs.sendMessage = () => Promise.resolve({ hasActiveMedia: false });
            await bg.checkExternalTabAudioState();
            bgWin.browser.tabs.query = origQuery;
            bgWin.browser.tabs.sendMessage = origSendTab;
            const autoPausedAt24s = bg.tabAudio.isAutoPausedByTabAudio;

            // 5. CSS anti-throttling check on .pm-media-frame (active vs inactive)
            const ytApp = P.getAppsApi().getAppById('youtube', P.state.appSettings);
            const igApp = P.getAppsApi().getAppById('instagram', P.state.appSettings);
            P.openMediaWorkspace(ytApp);
            await new Promise((r) => setTimeout(r, 80));
            P.openMediaWorkspace(igApp);
            const igFrame = P.state.mediaFramePool.get('instagram')?.frame;
            const cssDeadline = Date.now() + 1000;
            while (Date.now() < cssDeadline && igFrame && uiWin.getComputedStyle(igFrame).opacity !== '1') {
              await new Promise((r) => setTimeout(r, 30));
            }
            const ytFrame = P.state.mediaFramePool.get('youtube')?.frame;
            const ytCs = ytFrame ? uiWin.getComputedStyle(ytFrame) : null;
            const igCs = igFrame ? uiWin.getComputedStyle(igFrame) : null;

            return {
              spuriousPauseState,
              seededCountAfter10m,
              promotedUnlicensed,
              nextStillKept,
              licRecovered,
              removedRange,
              queueReunshifted: sp.queue.length >= 1,
              autoPausedAt24s,
              inactiveCss: ytCs ? { vis: ytCs.visibility, left: ytCs.left, pe: ytCs.pointerEvents } : null,
              activeCss: igCs ? { vis: igCs.visibility, left: igCs.left, pe: igCs.pointerEvents, op: igCs.opacity } : null
            };
            """
        )

        self.assertFalse(res["spuriousPauseState"]["remotePaused"], "Spurious pause must NOT set sp.remotePaused = true")
        self.assertFalse(res["spuriousPauseState"]["videoPaused"])
        self.assertEqual(res["spuriousPauseState"]["audibleId"], "spotify")
        self.assertGreaterEqual(res["seededCountAfter10m"], 1, "recentGenReqs must survive 10 minutes (< 30m TTL)")
        self.assertFalse(res["promotedUnlicensed"], "Unlicensed nextSp must NOT promote while activeSp plays")
        self.assertTrue(res["nextStillKept"])
        self.assertTrue(res["licRecovered"], "EME license 503 must retry with backoff and recover")
        self.assertIsNotNone(res["removedRange"])
        self.assertLessEqual(res["removedRange"][1], 1.01, "QuotaExceededError cutEnd must never exceed currentTime - 2")
        self.assertTrue(res["queueReunshifted"])
        self.assertFalse(res["autoPausedAt24s"], "24s WASAPI drain inside 20s-30s must be ignored")
        self.assertEqual(res["inactiveCss"]["vis"], "visible", "Inactive media frame must NOT use visibility: hidden")
        self.assertEqual(res["inactiveCss"]["left"], "-9999px")
        self.assertEqual(res["inactiveCss"]["pe"], "none")
        self.assertEqual(res["activeCss"]["vis"], "visible")
        self.assertEqual(res["activeCss"]["left"], "0px")
        self.assertEqual(res["activeCss"]["pe"], "auto")
        self.assertEqual(res["activeCss"]["op"], "1")

    def test_t5_15_iteration2_verifier_defect_regressions(self) -> None:
        """
        Regression suite for all 8 Iteration 1 verifier defects:
          1. Cross-app lastNonZeroVolume isolation in Mini Now Playing (Spotify 0.7 -> muted YouTube 0.35).
          2. Late-created non-mirror <audio> (SoundCloud) applies persisted 0.4 volume instead of 1.0,
             while respecting trusted in-page slider gestures and handleBgAutoResume when already playing.
          3. PM_MEDIA_CONTROL preserves INAUDIBLE_VOLUME (1e-5) capture silence when bgAudioMseBridgeStarted=true.
          4. handleNowPlayingCommand(appId, 'mute_toggle') restores lastNonZeroVolume when volume=0 & !muted.
          5. USER_PLAY_INTENT from sidebar keeps awaitingBgFrameHandoff=true, avoids mis-arming retireBgWhenBuffered,
             routes sidebar MSE_INIT/MSE_CHUNK until staging promotes, and does not promote backward at 2312.
          6. promoteStagingSpPlayer retains pendingSeekTarget at readyState===0, avoids play() at 0s when unbuffered,
             and buildAutoResumePayload compensates elapsed handedOffAt latency.
          7. processSpInstanceGenReqs with synchronous CDM message + !auth exits cleanly without hanging and recovers on LIC_AUTH.
          8. #btn-media-reload promotes on activeSp buffer exhaustion and protects slow reloads (>15s).
        """
        settings = make_default_settings_seed(
            miniNowPlayingEnabled=True,
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
            mediaVolumeMap={
                "spotify": {"volume": 0.7, "muted": False, "lastNonZeroVolume": 0.7},
                "youtube": {"volume": 0.35, "muted": True, "lastNonZeroVolume": 0.35},
                "soundcloud": {"volume": 0.4, "muted": False, "lastNonZeroVolume": 0.4},
            },
        )
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=settings)

        res = self.safe_eval_async(
            """
            const uiWin = window.__bridge.uiWin;
            const uiDoc = window.__bridge.uiDoc;
            const bgWin = window.__bridge.bgWin;
            const bg = bgWin.FoxHubBg;
            const P = uiWin.FoxHubPopup;

            // 1. Cross-app lastNonZeroVolume isolation
            await window.browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/',
              playback: { isPlaying: true, title: 'Sp Song', artist: 'A', currentTime: 10, duration: 180, volume: 0.7, muted: false, lastNonZeroVolume: 0.7 }
            });
            await new Promise((r) => setTimeout(r, 80));
            // Switch Now Playing to muted YouTube (0.35)
            await window.browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/',
              playback: { isPlaying: false, title: 'Sp Song', artist: 'A', currentTime: 10, duration: 180, volume: 0.7, muted: false, lastNonZeroVolume: 0.7 }
            });
            await window.browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'youtube',
              url: 'https://www.youtube.com/watch?v=abc',
              playback: { isPlaying: true, title: 'YT Vid', artist: 'B', currentTime: 20, duration: 200, volume: 0, muted: true, lastNonZeroVolume: 0.35 }
            });
            await new Promise((r) => setTimeout(r, 100));
            uiDoc.getElementById('pm-np-vol-btn').click();
            await new Promise((r) => setTimeout(r, 100));
            const ytVolAfterUnmute = bg.state.currentSettings.mediaVolumeMap?.youtube?.volume;
            const ytMutedAfterUnmute = bg.state.currentSettings.mediaVolumeMap?.youtube?.muted;

            // 4. mute_toggle when desiredVolume === 0 && !desiredMuted
            await bg.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 10, 'bg');
            const spZero = bg.bgSpEmePlayers.get('spotify');
            spZero.desiredVolume = 0;
            spZero.desiredMuted = false;
            spZero.lastNonZeroVolume = 0.65;
            spZero.videoEl = {
              paused: false, ended: false, muted: false, volume: 0, playbackRate: 1.0, readyState: 4, currentTime: 20,
              play() { this.paused = false; return Promise.resolve(); },
              pause() { this.paused = true; },
              removeAttribute() {}, load() {}, remove() {}, addEventListener() {}, removeEventListener() {}
            };
            const muteToggleRes = bg.handleNowPlayingCommand('spotify', 'mute_toggle');

            // 5a. USER_PLAY_INTENT from sidebar while bgAudioPool.has('spotify') & unbuffered
            const bgFrame = bgWin.document.createElement('iframe');
            bgFrame.name = 'pm-bg-audio-spotify';
            bgWin.document.body.appendChild(bgFrame);
            bg.bgAudioPool.set('spotify', { frame: bgFrame, url: 'https://open.spotify.com/', title: 'Intent Track' });
            spZero.msId = 100;
            spZero.sourceType = 'bg';
            spZero.trackTitle = 'Intent Track';
            spZero.trackDuration = 200;
            spZero.hasLicense = true;
            spZero.videoEl.currentTime = 40;
            spZero.sb = { buffered: { length: 1, start: () => 20, end: () => 80 } };
            bg.bgStagingSpPlayers.delete('spotify');

            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'USER_PLAY_INTENT' }, 'sidebar');
            const afterIntentUnbuf = {
              awaiting: spZero.awaitingBgFrameHandoff,
              handoffSource: spZero.handoffSource,
              retireBgWhenBuffered: spZero.retireBgWhenBuffered,
              bgPoolKept: bg.bgAudioPool.has('spotify')
            };
            // Sidebar sends MSE_INIT + MSE_CHUNK -> MUST NOT be dropped!
            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'MSE_INIT', msId: 200, mime: 'audio/mp4; codecs="mp4a.40.2"' }, 'sidebar');
            const sbSt = bg.bgStagingSpPlayers.get('spotify');
            if (sbSt && sbSt.mkReadyPromise) await sbSt.mkReadyPromise;
            sbSt.hasLicense = true;
            sbSt.licensedAt = Date.now();
            sbSt.trackTitle = 'Intent Track';
            sbSt.videoEl = {
              paused: true, ended: false, muted: true, volume: 0, playbackRate: 1.0, readyState: 4, currentTime: 0,
              play() { this.paused = false; return Promise.resolve(); },
              pause() { this.paused = true; },
              removeAttribute() {}, load() {}, remove() {}, addEventListener() {}, removeEventListener() {}
            };
            sbSt.sb = { buffered: { length: 1, start: () => 35, end: () => 50 } };
            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'MSE_CHUNK', msId: 200, chunk: new bgWin.Uint8Array([1, 2, 3, 4]).buffer }, 'sidebar');
            const sbChunkKept = sbSt.queue.length >= 1;
            bg.checkAndPromoteStagingSpPlayer('spotify');
            const afterIntentPromote = {
              activeSource: bg.bgSpEmePlayers.get('spotify')?.sourceType,
              activeMsId: bg.bgSpEmePlayers.get('spotify')?.msId,
              bgPoolRetired: !bg.bgAudioPool.has('spotify'),
              hasStagingLeft: bg.bgStagingSpPlayers.has('spotify')
            };

            // 5b. USER_PLAY_INTENT when staging already buffered [0..10] (minContinueCt 47.6) while active at 62.0 -> no backward promotion
            const active62 = bg.bgSpEmePlayers.get('spotify');
            active62.sourceType = 'bg';
            active62.msId = 205;
            active62.trackTitle = 'Track 62';
            active62.videoEl.currentTime = 62.0;
            active62.videoEl.paused = false;
            active62.sb = { buffered: { length: 1, start: () => 40, end: () => 90 } };
            await bg.ensureStagingSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 206, 'sidebar');
            const stEarly = bg.bgStagingSpPlayers.get('spotify');
            stEarly.hasLicense = true;
            stEarly.licensedAt = Date.now();
            stEarly.trackTitle = 'Track 62';
            stEarly.minContinueCt = 47.6;
            stEarly.sb = { buffered: { length: 1, start: () => 0, end: () => 10 } };
            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'USER_PLAY_INTENT' }, 'sidebar');
            const noBackwardJumpOnIntent = {
              activeStill205: bg.bgSpEmePlayers.get('spotify')?.msId === 205,
              stagingMinContinue: stEarly.minContinueCt
            };

            // 6a. promoteStagingSpPlayer: unbuffered does NOT call play() at 0s
            const playCallsUnbuf = [];
            stEarly.videoEl = {
              paused: true, ended: false, muted: true, volume: 0, playbackRate: 1.0, readyState: 4, currentTime: 0,
              play() { playCallsUnbuf.push(this.currentTime); this.paused = false; return Promise.resolve(); },
              pause() { this.paused = true; },
              removeAttribute() {}, load() {}, remove() {}, addEventListener() {}, removeEventListener() {}
            };
            bg.promoteStagingSpPlayer('spotify', true);
            const unbufPlayCallsCount = playCallsUnbuf.length;

            // 6b. promoteStagingSpPlayer: readyState === 0 retains pendingSeekTarget and applies on readyState = 4
            const activeRs = bg.bgSpEmePlayers.get('spotify');
            activeRs.videoEl.currentTime = 47.6;
            await bg.ensureStagingSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 207, 'sidebar');
            const stRs0 = bg.bgStagingSpPlayers.get('spotify');
            stRs0.hasLicense = true;
            stRs0.licensedAt = Date.now();
            stRs0.trackTitle = 'Track 62';
            stRs0.sb = { buffered: { length: 1, start: () => 45, end: () => 55 } };
            let rs0Val = 0;
            let rs0Ct = 0;
            const rs0PlayCalls = [];
            stRs0.videoEl = {
              paused: true, ended: false, muted: true, volume: 0, playbackRate: 1.0,
              get readyState() { return rs0Val; },
              get currentTime() { return rs0Ct; },
              set currentTime(val) { if (rs0Val >= 1) rs0Ct = val; },
              play() { rs0PlayCalls.push(rs0Ct); this.paused = false; return Promise.resolve(); },
              pause() { this.paused = true; },
              removeAttribute() {}, load() {}, remove() {}, addEventListener() {}, removeEventListener() {}
            };
            bg.promoteStagingSpPlayer('spotify', true);
            const pendingAtRs0 = stRs0.pendingSeekTarget;
            const playsAtRs0 = rs0PlayCalls.length;
            rs0Val = 4;
            // Trigger sync via SYNC_TIME
            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'SYNC_TIME', msId: 207, paused: false, currentTime: 47.6, duration: 200 }, 'sidebar');
            const ctAfterRs4 = stRs0.videoEl.currentTime;
            const pendingAfterRs4 = stRs0.pendingSeekTarget;

            // 6c. handedOffAt latency compensation in buildAutoResumePayload
            P.state.isAutoPausedByExternalTab = false;
            P.state.pendingTakeoverMeta.set('spotify', {
              trackTitle: 'Latency Song',
              artist: 'Artist',
              currentTime: 47.6,
              duration: 200,
              resumeUrl: 'https://open.spotify.com/',
              handedOffAt: Date.now() - 4500
            });
            const compensatedTime = P.buildAutoResumePayload('spotify').expectedTime;

            // 7. processSpInstanceGenReqs with synchronous CDM message + !auth
            bg.bgSpCachedMeta.delete('spotify');
            const origFetch = bgWin.fetch;
            let syncLicCalls = 0;
            bgWin.fetch = () => {
              syncLicCalls++;
              return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new bgWin.ArrayBuffer(4)) });
            };
            let syncUpdates = 0;
            const genSp = bg.bgSpEmePlayers.get('spotify');
            genSp.hasLicense = false;
            genSp.licAuth = { url: 'https://mock.sp/lic', headers: { authorization: 'Bearer a' } };
            genSp.processedInitDataKeys.clear();
            genSp.pendingGenReqs = [{ initDataType: 'cenc', initData: new bgWin.Uint8Array([9, 9, 9]).buffer }];
            genSp.mk = {
              createSession() {
                const listeners = {};
                return {
                  addEventListener: (t, fn) => { listeners[t] = fn; },
                  generateRequest: () => {
                    // Clear auth right before synchronous message fires!
                    genSp.licAuth = null;
                    if (listeners.message) listeners.message({ message: new bgWin.ArrayBuffer(4) });
                    return Promise.resolve();
                  },
                  update: () => { syncUpdates++; return Promise.resolve(); },
                  close: () => Promise.resolve()
                };
              }
            };
            // Must return promptly without infinite loop!
            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'GEN_REQ', initDataType: 'cenc', initData: new bgWin.Uint8Array([9, 9, 9]).buffer }, 'sidebar');
            const queuedAfterNoAuth = genSp.pendingGenReqs.length;
            // Restore normal generateRequest and send LIC_AUTH -> must recover cleanly
            genSp.mk = {
              createSession() {
                const listeners = {};
                return {
                  addEventListener: (t, fn) => { listeners[t] = fn; },
                  generateRequest: () => {
                    if (listeners.message) listeners.message({ message: new bgWin.ArrayBuffer(4) });
                    return Promise.resolve();
                  },
                  update: () => { syncUpdates++; return Promise.resolve(); },
                  close: () => Promise.resolve()
                };
              }
            };
            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'LIC_AUTH', url: 'https://mock.sp/lic', headers: { authorization: 'Bearer b' } }, 'sidebar');
            await new Promise((r) => setTimeout(r, 100));
            bgWin.fetch = origFetch;
            const recoveredAfterLicAuth = Boolean(genSp.hasLicense && syncUpdates >= 1 && syncLicCalls >= 1);

            // 8a. #btn-media-reload buffer exhaustion promotion
            bg.bgAudioPool.delete('spotify');
            genSp.sourceType = 'sidebar';
            genSp.msId = 300;
            genSp.trackTitle = 'Reload Track';
            genSp.videoEl = {
              paused: false, ended: false, muted: false, volume: 0.7, playbackRate: 1.0, readyState: 4, currentTime: 84.9,
              play() { this.paused = false; return Promise.resolve(); },
              pause() { this.paused = true; },
              removeAttribute() {}, load() {}, remove() {}, addEventListener() {}, removeEventListener() {}
            };
            genSp.sb = { buffered: { length: 1, start: () => 50, end: () => 85.0 } };
            await bg.ensureStagingSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 301, 'sidebar');
            const stExhaust = bg.bgStagingSpPlayers.get('spotify');
            stExhaust.hasLicense = true;
            stExhaust.licensedAt = Date.now() - 12000;
            stExhaust.trackTitle = 'Reload Track';
            stExhaust.minContinueCt = 84.9;
            stExhaust.sb = { buffered: { length: 1, start: () => 0, end: () => 8 } };
            bg.checkAndPromoteStagingSpPlayer('spotify');
            const promotedOnBufExhaust = bg.bgSpEmePlayers.get('spotify')?.msId === 301;

            // 8b. Slow reload (>15s) protection
            const slowActive = bg.bgSpEmePlayers.get('spotify');
            slowActive.msId = 400;
            slowActive.sourceType = 'sidebar';
            slowActive.videoEl.currentTime = 72.5;
            slowActive.sb = { buffered: { length: 1, start: () => 50, end: () => 95 } };
            await window.browser.runtime.sendMessage({ type: 'SIDEBAR_FRAME_RELOAD_PREPARE', appId: 'spotify' });
            slowActive.reloadingSidebarFrameAt = Date.now() - 18000;
            slowActive.handoffStartedAt = Date.now() - 18000;
            const slowSt = bg.bgStagingSpPlayers.get('spotify');
            if (slowSt) slowSt.sb = null;
            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'MSE_INIT', msId: 499, mime: 'audio/mp4; codecs="mp4a.40.2"' }, 'sidebar');
            const slowReloadProtected = {
              activeStill400: bg.bgSpEmePlayers.get('spotify')?.msId === 400,
              stagingMsId: bg.bgStagingSpPlayers.get('spotify')?.msId,
              stagingMinContinue: bg.bgStagingSpPlayers.get('spotify')?.minContinueCt
            };

            return {
              ytVolAfterUnmute,
              ytMutedAfterUnmute,
              muteToggleRes,
              afterIntentUnbuf,
              sbChunkKept,
              afterIntentPromote,
              noBackwardJumpOnIntent,
              unbufPlayCallsCount,
              pendingAtRs0,
              playsAtRs0,
              ctAfterRs4,
              pendingAfterRs4,
              compensatedTime,
              queuedAfterNoAuth,
              recoveredAfterLicAuth,
              promotedOnBufExhaust,
              slowReloadProtected
            };
            """
        )

        self.assertAlmostEqual(res["ytVolAfterUnmute"], 0.35, delta=0.01, msg="YouTube must unmute to 0.35, NOT leaked Spotify 0.7")
        self.assertFalse(res["ytMutedAfterUnmute"])
        self.assertFalse(res["muteToggleRes"]["muted"], "mute_toggle at 0 & !muted must unmute")
        self.assertAlmostEqual(res["muteToggleRes"]["volume"], 0.65, delta=0.01)

        self.assertTrue(res["afterIntentUnbuf"]["awaiting"], "USER_PLAY_INTENT must keep awaitingBgFrameHandoff=true")
        self.assertEqual(res["afterIntentUnbuf"]["handoffSource"], "sidebar")
        self.assertFalse(res["afterIntentUnbuf"]["retireBgWhenBuffered"], "Must NOT arm retireBgWhenBuffered on bg player")
        self.assertTrue(res["afterIntentUnbuf"]["bgPoolKept"])
        self.assertTrue(res["sbChunkKept"], "Sidebar MSE_CHUNK must NOT be dropped after USER_PLAY_INTENT")
        self.assertEqual(res["afterIntentPromote"]["activeSource"], "sidebar")
        self.assertEqual(res["afterIntentPromote"]["activeMsId"], 200)
        self.assertTrue(res["afterIntentPromote"]["bgPoolRetired"])
        self.assertFalse(res["afterIntentPromote"]["hasStagingLeft"])

        self.assertTrue(res["noBackwardJumpOnIntent"]["activeStill205"], "Unaligned [0..10] staging must NOT promote backward over 62.0s")
        self.assertGreaterEqual(res["noBackwardJumpOnIntent"]["stagingMinContinue"], 62.0)

        self.assertEqual(res["unbufPlayCallsCount"], 0, "Unbuffered promotion must NOT call play() at 0s")
        self.assertAlmostEqual(res["pendingAtRs0"], 47.6, delta=0.1, msg="readyState===0 must retain pendingSeekTarget")
        self.assertEqual(res["playsAtRs0"], 0)
        self.assertAlmostEqual(res["ctAfterRs4"], 47.6, delta=0.1, msg="Must apply seek once readyState becomes 4")
        self.assertEqual(res["pendingAfterRs4"], 0)
        self.assertGreaterEqual(res["compensatedTime"], 51.5, msg="handedOffAt elapsed latency must be compensated")

        self.assertGreaterEqual(res["queuedAfterNoAuth"], 1)
        self.assertTrue(res["recoveredAfterLicAuth"])
        self.assertTrue(res["promotedOnBufExhaust"], "Buffer-exhausted activeSp must allow timed-out reload staging promotion")
        self.assertTrue(res["slowReloadProtected"]["activeStill400"], "Slow reload (>15s) must NOT overwrite activeSp at 0s")
        self.assertEqual(res["slowReloadProtected"]["stagingMsId"], 499)
        self.assertGreaterEqual(res["slowReloadProtected"]["stagingMinContinue"], 72.0)

        # 2 & 3. Non-mirror SoundCloud late-created <audio> boot volume + in-page gesture + capture silence guard
        sc_html = (
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
            "<div class='volume'><input id='sc-vol-slider' type='range' min='0' max='100' value='40'></div>"
            "<script type='module'>"
            "import { initFrameContext } from '/src/content/core/frame-context.js';"
            "import { installNonMirrorAudioTracker } from '/src/content/core/media-mirror.js';"
            "import { initOptimizer } from '/src/content/optimizers/soundcloud.js';"
            "import { initLifecycleRouter } from '/src/content/core/lifecycle-router.js';"
            "try {"
            "  await browser.storage.local.set({ settings: { mediaVolumeMap: { soundcloud: { volume: 0.4, muted: false, lastNonZeroVolume: 0.4 } } } });"
            "  const ctx = initFrameContext({ cleanWindowName: 'pm-media-frame-soundcloud', isFoxHubMediaFrame: true, isFoxHubContext: true, isBgAudioFrame: false, isStandbyBgFrame: false });"
            "  ctx.host = 'soundcloud.com';"
            "  ctx.hasHost = (s) => s === 'soundcloud.com';"
            "  ctx.isMirrorAudioHost = false;"
            "  ctx.appMeta = { appId: 'soundcloud', cssSlug: 'soundcloud', optimizerFile: 'soundcloud.js', isKnownBuiltInHost: true };"
            "  const opt = initOptimizer(ctx);"
            "  installNonMirrorAudioTracker(ctx);"
            "  initLifecycleRouter(ctx, opt);"
            "  const deadline = Date.now() + 2000;"
            "  while (Date.now() < deadline && !ctx.state.hasPersistedVolume) { await new Promise((r) => setTimeout(r, 20)); }"
            "  const lateAudio = document.createElement('audio');"
            "  lateAudio.volume = 1.0;"
            "  lateAudio.muted = false;"
            "  document.body.appendChild(lateAudio);"
            "  lateAudio.play().catch(() => {});"
            "  const volRightAfterLatePlay = lateAudio.volume;"
            "  lateAudio.volume = 1.0;"
            "  lateAudio.dispatchEvent(new Event('volumechange'));"
            "  const volAfterProgrammaticReset = lateAudio.volume;"
            "  ctx.state.bgAudioMseBridgeStarted = true;"
            "  lateAudio.volume = ctx.INAUDIBLE_VOLUME;"
            "  lateAudio.muted = false;"
            "  window.__pmHandleMediaFrameCommand({ target: 'pocketmail-media-frame', cmd: 'PM_MEDIA_CONTROL', command: 'set_volume', volume: 0.55, muted: false });"
            "  window.__pmHandleMediaFrameCommand({ target: 'pocketmail-media-frame', cmd: 'PM_MEDIA_CONTROL', command: 'mute_toggle', muted: true });"
            "  const capVol = lateAudio.volume;"
            "  const capMuted = lateAudio.muted;"
            "  const desiredAfterCap = { vol: ctx.state.desiredVolume, muted: ctx.state.desiredMuted };"
            "  ctx.state.bgAudioMseBridgeStarted = false;"
            "  ctx.state.desiredVolume = 0.4;"
            "  ctx.state.desiredMuted = false;"
            "  lateAudio.volume = 1.0;"
            "  opt.handleBgAutoResume(ctx, { isPlaying: true }, lateAudio, { curAutoplayPolicy: 'allowed' });"
            "  const volAfterAutoResume = lateAudio.volume;"
            "  window.__scRes = { ctx, lateAudio, volRightAfterLatePlay, volAfterProgrammaticReset, capVol, capMuted, desiredAfterCap, volAfterAutoResume };"
            "} catch (e) { window.__scErr = String(e); }"
            "</script></body></html>"
        )
        sc_url = self.server.register_fixture("t5_15_sc_nonmirror.html", sc_html)
        self.fx.reset_to_blank()
        self.fx.navigate(sc_url)
        sc_ready = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline && !window.__scRes && !window.__scErr) {
              await new Promise((r) => setTimeout(r, 25));
            }
            return window.__scRes ? {
              ok: true,
              volRightAfterLatePlay: window.__scRes.volRightAfterLatePlay,
              volAfterProgrammaticReset: window.__scRes.volAfterProgrammaticReset,
              capVol: window.__scRes.capVol,
              capMuted: window.__scRes.capMuted,
              desiredAfterCap: window.__scRes.desiredAfterCap,
              volAfterAutoResume: window.__scRes.volAfterAutoResume
            } : { ok: false, err: window.__scErr || 'timeout' };
            """
        )
        self.assertTrue(sc_ready["ok"], msg=str(sc_ready.get("err")))
        self.assertAlmostEqual(sc_ready["volRightAfterLatePlay"], 0.4, delta=0.01, msg="Late <audio> must apply persisted 0.4")
        self.assertAlmostEqual(sc_ready["volAfterProgrammaticReset"], 0.4, delta=0.01, msg="Programmatic 1.0 reset must revert to 0.4")
        self.assertAlmostEqual(sc_ready["capVol"], 1e-5, delta=1e-6, msg="Capture silence must stay 1e-5 during PM_MEDIA_CONTROL")
        self.assertFalse(sc_ready["capMuted"], msg="Capture <audio> must stay unmuted during PM_MEDIA_CONTROL")
        self.assertAlmostEqual(sc_ready["desiredAfterCap"]["vol"], 0.55, delta=0.01)
        self.assertTrue(sc_ready["desiredAfterCap"]["muted"])
        self.assertAlmostEqual(sc_ready["volAfterAutoResume"], 0.4, delta=0.01)

        # Trusted in-page volume slider gesture on SoundCloud -> respected cleanly
        self.fx.click("#sc-vol-slider")
        inpage_res = self.fx.eval_js(
            """
            const r = window.__scRes;
            r.lateAudio.volume = 0.75;
            r.lateAudio.dispatchEvent(new Event('volumechange'));
            return { vol: r.lateAudio.volume, desiredVol: r.ctx.state.desiredVolume };
            """
        )
        self.assertAlmostEqual(inpage_res["vol"], 0.75, delta=0.01)
        self.assertAlmostEqual(inpage_res["desiredVol"], 0.75, delta=0.01)

    def test_t5_16_iteration3_edge_case_regressions(self) -> None:
        """
        Regression suite for Iteration 3 defects:
          1. USER_PLAY_INTENT with bg.bgAudioPool.has('spotify')===true and unaligned [0..10] or unlicensed
             sidebar staging keeps bgAudioPool alive and activeSp.awaitingBgFrameHandoff===true.
          2. 0.01 (1%) volume mute_toggle mutes cleanly instead of unmuting.
          3. __pmGetSyncBootState() includes handedOffAt for playing bgAudioPool apps.
          4. Detached new Audio() (isConnected===false) in SoundCloud non-mirror tracker reverts
             un-gestured 1.0 resets (native volumechange) back to 0.4.
          5. Trusted in-page non-mirror slider gesture (0.75) emits PM_NON_MIRROR_VOLUME_CHANGED,
             persists to settings.mediaVolumeMap.soundcloud via bg-router/bg-audio-engine,
             and survives unrelated browser.storage.local { theme: 'true-night' } updates without reverting to 0.4.
        """
        settings = make_default_settings_seed(
            miniNowPlayingEnabled=True,
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
            mediaVolumeMap={
                "spotify": {"volume": 0.01, "muted": False, "lastNonZeroVolume": 0.01},
                "soundcloud": {"volume": 0.4, "muted": False, "lastNonZeroVolume": 0.4},
            },
        )
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=settings)

        bg_res = self.safe_eval_async(
            """
            const uiWin = window.__bridge.uiWin;
            const bgWin = window.__bridge.bgWin;
            const bg = bgWin.FoxHubBg;
            const P = uiWin.FoxHubPopup;

            // 1. USER_PLAY_INTENT with bgAudioPool.has('spotify') === true & unaligned [0..10] staging
            await bg.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 600, 'bg');
            const bgFrame = bgWin.document.createElement('iframe');
            bgFrame.name = 'pm-bg-audio-spotify';
            bgWin.document.body.appendChild(bgFrame);
            bg.bgAudioPool.set('spotify', { frame: bgFrame, url: 'https://open.spotify.com/', title: 'Track 62' });

            const active62 = bg.bgSpEmePlayers.get('spotify');
            active62.sourceType = 'bg';
            active62.msId = 600;
            active62.hasLicense = true;
            active62.trackTitle = 'Track 62';
            active62.trackDuration = 210;
            active62.explicitUserPause = false;
            active62.remotePaused = false;
            active62.videoEl = {
              paused: false, ended: false, muted: false, volume: 0.5, playbackRate: 1.0, readyState: 4, currentTime: 62.0,
              play() { this.paused = false; return Promise.resolve(); },
              pause() { this.paused = true; },
              removeAttribute() {}, load() {}, remove() {}, addEventListener() {}, removeEventListener() {}
            };
            active62.sb = { buffered: { length: 1, start: () => 40, end: () => 95 } };

            await bg.ensureStagingSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 601, 'sidebar');
            const stUnaligned = bg.bgStagingSpPlayers.get('spotify');
            stUnaligned.hasLicense = true;
            stUnaligned.licensedAt = Date.now();
            stUnaligned.trackTitle = 'Track 62';
            stUnaligned.minContinueCt = 47.6;
            stUnaligned.sb = { buffered: { length: 1, start: () => 0, end: () => 10 } };

            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'USER_PLAY_INTENT' }, 'sidebar');
            const unalignedIntentRes = {
              bgPoolKept: bg.bgAudioPool.has('spotify'),
              awaiting: active62.awaitingBgFrameHandoff,
              activeStill600: bg.bgSpEmePlayers.get('spotify')?.msId === 600,
              stagingExplicitIntent: Boolean(stUnaligned.explicitSidebarPlayIntent),
              stagingMinContinue: stUnaligned.minContinueCt
            };

            // Also check unlicensed buffered [60..65] staging while bgAudioPool.has('spotify') === true
            stUnaligned.hasLicense = false;
            stUnaligned.sb = { buffered: { length: 1, start: () => 60, end: () => 65 } };
            bgWin.__pmHandleSpEmeBridge('spotify', { bridgeType: 'USER_PLAY_INTENT' }, 'sidebar');
            const unlicensedIntentRes = {
              bgPoolKept: bg.bgAudioPool.has('spotify'),
              awaiting: active62.awaitingBgFrameHandoff,
              activeStill600: bg.bgSpEmePlayers.get('spotify')?.msId === 600
            };

            // 3. __pmGetSyncBootState() includes handedOffAt for active bgAudioPool entries
            const bootState = bgWin.__pmGetSyncBootState();
            const spBootEntry = (bootState.activeBgApps || []).find((a) => a.appId === 'spotify') || null;
            const syncBootHasHandedOffAt = Boolean(spBootEntry && typeof spBootEntry.handedOffAt === 'number' && spBootEntry.handedOffAt > 0);

            // 2. 0.01 (1%) volume mute_toggle mutes cleanly instead of unmuting
            active62.desiredVolume = 0.01;
            active62.desiredMuted = false;
            active62.lastNonZeroVolume = 0.01;
            active62.videoEl.volume = 0.01;
            active62.videoEl.muted = false;
            const mute1PctRes = bg.handleNowPlayingCommand('spotify', 'mute_toggle');

            // 5b. Background persistence for PM_NON_MIRROR_VOLUME_CHANGED
            const nonMirrorRes = await window.browser.runtime.sendMessage({
              type: 'PM_NON_MIRROR_VOLUME_CHANGED',
              appId: 'soundcloud',
              volume: 0.75,
              muted: false
            });
            const storedAfterNonMirror = (await window.browser.storage.local.get('settings'))?.settings?.mediaVolumeMap?.soundcloud;
            P.handleAudioWindowMessage(
              { data: { source: 'pocketmail-media-frame', type: 'PM_NON_MIRROR_VOLUME_CHANGED', appId: 'soundcloud', volume: 0.75, muted: false } },
              { appId: 'soundcloud' }
            );
            const uiSavedSc = P.state.appSettings?.mediaVolumeMap?.soundcloud;

            return {
              unalignedIntentRes,
              unlicensedIntentRes,
              syncBootHasHandedOffAt,
              mute1PctRes,
              nonMirrorRes,
              storedAfterNonMirror,
              uiSavedSc
            };
            """
        )

        self.assertTrue(bg_res["unalignedIntentRes"]["bgPoolKept"], "USER_PLAY_INTENT must keep bgAudioPool when sidebar staging [0..10] is unaligned")
        self.assertTrue(bg_res["unalignedIntentRes"]["awaiting"], "USER_PLAY_INTENT must keep awaitingBgFrameHandoff=true when unpromoted")
        self.assertTrue(bg_res["unalignedIntentRes"]["activeStill600"])
        self.assertTrue(bg_res["unalignedIntentRes"]["stagingExplicitIntent"])
        self.assertGreaterEqual(bg_res["unalignedIntentRes"]["stagingMinContinue"], 62.0)

        self.assertTrue(bg_res["unlicensedIntentRes"]["bgPoolKept"], "USER_PLAY_INTENT must keep bgAudioPool when buffered staging lacks license")
        self.assertTrue(bg_res["unlicensedIntentRes"]["awaiting"])
        self.assertTrue(bg_res["unlicensedIntentRes"]["activeStill600"])

        self.assertTrue(bg_res["syncBootHasHandedOffAt"], "__pmGetSyncBootState() must include handedOffAt for playing bgAudioPool apps")
        self.assertTrue(bg_res["mute1PctRes"]["ok"])
        self.assertTrue(bg_res["mute1PctRes"]["muted"], "0.01 (1%) volume mute_toggle must mute cleanly instead of unmuting")

        self.assertTrue(bg_res["nonMirrorRes"]["ok"])
        self.assertAlmostEqual(bg_res["storedAfterNonMirror"]["volume"], 0.75, delta=0.01)
        self.assertFalse(bg_res["storedAfterNonMirror"]["muted"])
        self.assertAlmostEqual(bg_res["uiSavedSc"]["volume"], 0.75, delta=0.01)

        # 4 & 5a. Detached new Audio() + attached in-page gesture + unrelated storage.onChanged survival
        sc_html = (
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
            "window.__capturedRuntimeMsgs = [];"
            "window.__capturedParentMsgs = [];"
            "window.addEventListener('message', (ev) => { if (ev.data) window.__capturedParentMsgs.push(ev.data); });"
            "</script></head><body>"
            "<div class='volume'><input id='sc-vol-slider' type='range' min='0' max='100' value='40'></div>"
            "<script type='module'>"
            "import { initFrameContext } from '/src/content/core/frame-context.js';"
            "import { installNonMirrorAudioTracker } from '/src/content/core/media-mirror.js';"
            "import { initOptimizer } from '/src/content/optimizers/soundcloud.js';"
            "import { initLifecycleRouter } from '/src/content/core/lifecycle-router.js';"
            "try {"
            "  browser.runtime.onMessage.addListener((msg) => { window.__capturedRuntimeMsgs.push(msg); });"
            "  await browser.storage.local.set({ settings: { theme: 'warm-linen', mediaVolumeMap: { soundcloud: { volume: 0.4, muted: false, lastNonZeroVolume: 0.4 } } } });"
            "  const ctx = initFrameContext({ cleanWindowName: 'pm-media-frame-soundcloud', isFoxHubMediaFrame: true, isFoxHubContext: true, isBgAudioFrame: false, isStandbyBgFrame: false });"
            "  ctx.realTopWin = window;"
            "  ctx.isTopFrame = false;"
            "  ctx.host = 'soundcloud.com';"
            "  ctx.hasHost = (s) => s === 'soundcloud.com';"
            "  ctx.isMirrorAudioHost = false;"
            "  ctx.appMeta = { appId: 'soundcloud', cssSlug: 'soundcloud', optimizerFile: 'soundcloud.js', isKnownBuiltInHost: true };"
            "  const opt = initOptimizer(ctx);"
            "  installNonMirrorAudioTracker(ctx);"
            "  initLifecycleRouter(ctx, opt);"
            "  const deadline = Date.now() + 2000;"
            "  while (Date.now() < deadline && !ctx.state.hasPersistedVolume) { await new Promise((r) => setTimeout(r, 20)); }"
            "  const detAudio = new Audio();"
            "  detAudio.play().catch(() => {});"
            "  await new Promise((r) => setTimeout(r, 40));"
            "  const detVolAfterPlay = detAudio.volume;"
            "  const detIsConnected = detAudio.isConnected;"
            "  detAudio.volume = 1.0;"
            "  await new Promise((r) => setTimeout(r, 120));"
            "  const detVolAfterNativeReset = detAudio.volume;"
            "  const detCreateEl = document.createElement('audio');"
            "  detCreateEl.play().catch(() => {});"
            "  detCreateEl.volume = 1.0;"
            "  detCreateEl.dispatchEvent(new Event('volumechange'));"
            "  const detCreateElVolAfterReset = detCreateEl.volume;"
            "  window.__scIter3 = { ctx, detAudio, detVolAfterPlay, detIsConnected, detVolAfterNativeReset, detCreateElVolAfterReset };"
            "} catch (e) { window.__scIter3Err = String(e); }"
            "</script></body></html>"
        )
        sc_url = self.server.register_fixture("t5_16_sc_detached.html", sc_html)
        self.fx.reset_to_blank()
        self.fx.navigate(sc_url)
        det_res = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline && !window.__scIter3 && !window.__scIter3Err) {
              await new Promise((r) => setTimeout(r, 25));
            }
            const r = window.__scIter3;
            return r ? {
              ok: true,
              detIsConnected: r.detIsConnected,
              detVolAfterPlay: r.detVolAfterPlay,
              detVolAfterNativeReset: r.detVolAfterNativeReset,
              detCreateElVolAfterReset: r.detCreateElVolAfterReset
            } : { ok: false, err: window.__scIter3Err || 'timeout' };
            """
        )
        self.assertTrue(det_res["ok"], msg=str(det_res.get("err")))
        self.assertFalse(det_res["detIsConnected"], "Detached Audio() must NOT be connected to DOM")
        self.assertAlmostEqual(det_res["detVolAfterPlay"], 0.4, delta=0.01)
        self.assertAlmostEqual(det_res["detVolAfterNativeReset"], 0.4, delta=0.01, msg="Detached new Audio() native 1.0 reset must revert to 0.4")
        self.assertAlmostEqual(det_res["detCreateElVolAfterReset"], 0.4, delta=0.01, msg="Detached document.createElement('audio') reset must revert to 0.4")

        # Click #sc-vol-slider -> set detAudio.volume = 0.75 -> verify emission AND survival across unrelated storage change
        self.fx.click("#sc-vol-slider")
        slider_res = self.fx.eval_async_js(
            """
            const r = window.__scIter3;
            r.detAudio.volume = 0.75;
            await new Promise((res) => setTimeout(res, 120));
            const volRightAfterSlider = r.detAudio.volume;
            const desiredRightAfterSlider = r.ctx.state.desiredVolume;
            const runtimeVolMsgs = (window.__capturedRuntimeMsgs || []).filter((m) => m && m.type === 'PM_NON_MIRROR_VOLUME_CHANGED');
            const parentVolMsgs = (window.__capturedParentMsgs || []).filter((m) => m && m.type === 'PM_NON_MIRROR_VOLUME_CHANGED');
            const curSettings = (await browser.storage.local.get('settings')).settings || {};
            await browser.storage.local.set({ settings: { ...curSettings, theme: 'true-night' } });
            await new Promise((res) => setTimeout(res, 80));
            return {
              volRightAfterSlider,
              desiredRightAfterSlider,
              runtimeVolMsgs,
              parentVolMsgs,
              volAfterUnrelatedStorage: r.detAudio.volume,
              desiredAfterUnrelatedStorage: r.ctx.state.desiredVolume,
              userAdjustedFlag: Boolean(r.ctx.state.userAdjustedInPageVolume)
            };
            """
        )
        self.assertAlmostEqual(slider_res["volRightAfterSlider"], 0.75, delta=0.01)
        self.assertAlmostEqual(slider_res["desiredRightAfterSlider"], 0.75, delta=0.01)
        self.assertGreaterEqual(len(slider_res["runtimeVolMsgs"]), 1, "Trusted in-page slider change must emit PM_NON_MIRROR_VOLUME_CHANGED via runtime.sendMessage")
        self.assertAlmostEqual(slider_res["runtimeVolMsgs"][-1]["volume"], 0.75, delta=0.01)
        self.assertEqual(slider_res["runtimeVolMsgs"][-1]["appId"], "soundcloud")
        self.assertGreaterEqual(len(slider_res["parentVolMsgs"]), 1, "Trusted in-page slider change must notify parent")
        self.assertAlmostEqual(slider_res["volAfterUnrelatedStorage"], 0.75, delta=0.01, msg="Unrelated settings change must NOT revert in-page volume to 0.4")
        self.assertAlmostEqual(slider_res["desiredAfterUnrelatedStorage"], 0.75, delta=0.01)
        self.assertTrue(slider_res["userAdjustedFlag"])

    def test_t5_17_iteration4_verifier_regressions(self) -> None:
        """
        Regression suite for Iteration 4 defects:
          (a) 300ms transient 503 EME outage respects >= 380ms exponential backoff before retry #1
              and recovers with hasLicense === true.
          (b) 0.01 (1%) volume lastNonZeroVolume survives boot normalization and #pm-np-vol-btn
              mute -> unmute restores 0.01 (never 1.0).
          (c) Mini Now Playing slider drag flushes storage.local immediately (<= 150ms) AND
              subsequent in-page non-mirror volume change within < 1000ms immediately updates
              #pm-np-vol-slider[aria-valuenow].
          (d) Non-scrub backward SYNC_TIME with forceSeek: true, isExplicitUserScrub: false
              clamps forward instead of rewinding videoEl.currentTime.
        """
        settings = make_default_settings_seed(
            miniNowPlayingEnabled=True,
            bgAudioAppIds=["spotify", "youtube", "soundcloud"],
            mediaVolumeMap={
                "spotify": {"volume": 0.01, "muted": False, "lastNonZeroVolume": 0.01},
                "soundcloud": {"volume": 0.85, "muted": False, "lastNonZeroVolume": 0.85},
            },
        )
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=settings)

        res = self.safe_eval_async(
            """
            const uiWin = window.__bridge.uiWin;
            const uiDoc = window.__bridge.uiDoc;
            const bgWin = window.__bridge.bgWin;
            const bg = bgWin.FoxHubBg;
            const P = uiWin.FoxHubPopup;

            // (b1) Boot normalization must preserve 0.01 lastNonZeroVolume
            const bootSpotifyMap = { ...(bg.state.currentSettings.mediaVolumeMap?.spotify || {}) };

            // Seed active Spotify player at 0.01 and test #pm-np-vol-btn mute -> unmute
            await bg.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 700, 'bg');
            const sp = bg.bgSpEmePlayers.get('spotify');
            sp.hasLicense = true;
            sp.trackTitle = 'Quiet Song';
            sp.trackDuration = 200;
            sp.remotePaused = false;
            sp.explicitUserPause = false;
            sp.videoEl = {
              paused: false, ended: false, muted: false, volume: 0.01, playbackRate: 1.0, readyState: 4, currentTime: 123.75,
              play() { this.paused = false; return Promise.resolve(); },
              pause() { this.paused = true; },
              removeAttribute() {}, load() {}, remove() {}, addEventListener() {}, removeEventListener() {}
            };
            sp.sb = { buffered: { length: 1, start: () => 115, end: () => 145 } };

            await window.browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/',
              playback: {
                isPlaying: true,
                title: 'Quiet Song',
                artist: 'Artist',
                currentTime: 123.75,
                duration: 200,
                volume: 0.01,
                muted: false,
                lastNonZeroVolume: 0.01
              }
            });
            await new Promise((r) => setTimeout(r, 100));

            const slider = uiDoc.getElementById('pm-np-vol-slider');
            const volBtn = uiDoc.getElementById('pm-np-vol-btn');
            const initialAriaNow = slider.getAttribute('aria-valuenow');

            // (b2) Mute via #pm-np-vol-btn then unmute via #pm-np-vol-btn -> must restore 0.01 (never 1.0)
            volBtn.click();
            await new Promise((r) => setTimeout(r, 100));
            const afterBtnMute = {
              spMuted: sp.desiredMuted,
              ariaNow: slider.getAttribute('aria-valuenow'),
              map: { ...(bg.state.currentSettings.mediaVolumeMap?.spotify || {}) }
            };

            volBtn.click();
            await new Promise((r) => setTimeout(r, 100));
            const afterBtnUnmute = {
              spMuted: sp.desiredMuted,
              spVol: sp.desiredVolume,
              vidVol: sp.videoEl.volume,
              ariaNow: slider.getAttribute('aria-valuenow'),
              map: { ...(bg.state.currentSettings.mediaVolumeMap?.spotify || {}) }
            };

            // (d) Non-scrub backward SYNC_TIME with forceSeek: true, isExplicitUserScrub: false MUST clamp forward
            bg.bgAudioDiagLog.length = 0;
            bgWin.__pmHandleSpEmeBridge('spotify', {
              bridgeType: 'SYNC_TIME',
              msId: 700,
              paused: false,
              currentTime: 121.5,
              forceSeek: true,
              isExplicitUserScrub: false
            }, 'bg');
            const ctAfterNonScrubBackward = sp.videoEl.currentTime;
            const clampDiagLogged = bg.bgAudioDiagLog.some((e) => e && e.event === 'clamp-backward-seek-target');

            // Explicit user scrub backward MUST still seek
            bgWin.__pmHandleSpEmeBridge('spotify', {
              bridgeType: 'SYNC_TIME',
              msId: 700,
              paused: false,
              currentTime: 118.0,
              forceSeek: true,
              isExplicitUserScrub: true
            }, 'bg');
            const ctAfterExplicitScrub = sp.videoEl.currentTime;

            // (c) Mini Now Playing slider drag -> immediate storage.local flush (<= 150ms)
            //     + in-page non-mirror volume change within < 1000ms immediately updates #pm-np-vol-slider
            await window.browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/',
              playback: { isPlaying: false, title: 'Quiet Song', artist: 'Artist', currentTime: 118, duration: 200 }
            });
            sp.videoEl.paused = true;
            sp.remotePaused = true;
            await window.browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'soundcloud',
              url: 'https://soundcloud.com/',
              playback: {
                isPlaying: true,
                title: 'SC Track',
                artist: 'SC Artist',
                currentTime: 25,
                duration: 180,
                volume: 0.85,
                muted: false,
                lastNonZeroVolume: 0.85
              }
            });
            await new Promise((r) => setTimeout(r, 100));

            const rect = slider.getBoundingClientRect();
            const x30 = rect.left + rect.width * 0.30;
            const yMid = rect.top + rect.height / 2;
            const dragStartTs = Date.now();
            slider.dispatchEvent(new uiWin.PointerEvent('pointerdown', {
              bubbles: true, cancelable: true, clientX: x30, clientY: yMid, button: 0, pointerId: 1, pointerType: 'mouse'
            }));
            slider.dispatchEvent(new uiWin.PointerEvent('pointerup', {
              bubbles: true, cancelable: true, clientX: x30, clientY: yMid, button: 0, pointerId: 1, pointerType: 'mouse'
            }));
            await new Promise((r) => setTimeout(r, 120));
            const storedAfterMiniDrag = (await window.browser.storage.local.get('settings'))?.settings?.mediaVolumeMap?.soundcloud;
            const ariaAfterMiniDrag = slider.getAttribute('aria-valuenow');

            // Within < 1000ms of drag, simulate in-page non-mirror slider adjustment to 0.65
            await window.browser.runtime.sendMessage({
              type: 'PM_NON_MIRROR_VOLUME_CHANGED',
              appId: 'soundcloud',
              volume: 0.65,
              muted: false
            });
            P.handleAudioWindowMessage(
              { data: { source: 'pocketmail-media-frame', type: 'PM_NON_MIRROR_VOLUME_CHANGED', appId: 'soundcloud', volume: 0.65, muted: false } },
              { appId: 'soundcloud' }
            );
            const elapsedSinceDragMs = Date.now() - dragStartTs;
            const ariaImmediateAfterInPage = slider.getAttribute('aria-valuenow');

            // (a) 300ms transient 503 EME outage respects >= 380ms exponential backoff before retry #1 and recovers
            bg.bgSpCachedMeta.delete('spotify');
            await bg.ensureNextSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 701, 'bg');
            const nx = bg.bgNextSpPlayers.get('spotify');
            const origFetch = bgWin.fetch;
            const fetchTimes = [];
            let outageStart = 0;
            bgWin.fetch = () => {
              const now = Date.now();
              if (!outageStart) outageStart = now;
              fetchTimes.push(now);
              if (now - outageStart < 300) {
                return Promise.resolve({ ok: false, status: 503 });
              }
              return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new bgWin.ArrayBuffer(4)) });
            };
            let sessUpdates = 0;
            nx.mk = {
              createSession() {
                const listeners = {};
                return {
                  addEventListener: (t, fn) => { listeners[t] = fn; },
                  generateRequest: () => {
                    // Fire message synchronously before generateRequest resolves (the exact while-loop race!)
                    if (listeners.message) listeners.message({ message: new bgWin.ArrayBuffer(4) });
                    return Promise.resolve();
                  },
                  update: () => { sessUpdates++; return Promise.resolve(); },
                  close: () => Promise.resolve()
                };
              }
            };
            nx.hasLicense = false;
            nx.processedInitDataKeys.clear();
            nx.pendingGenReqs = [{ initDataType: 'cenc', initData: new bgWin.Uint8Array([4, 5, 6]).buffer }];
            bgWin.__pmHandleSpEmeBridge('spotify', {
              bridgeType: 'LIC_AUTH',
              url: 'https://mock.sp/lic',
              headers: { authorization: 'Bearer z' }
            }, 'bg');
            await new Promise((r) => setTimeout(r, 950));
            bgWin.fetch = origFetch;
            const backoffRes = {
              attempts: fetchTimes.length,
              gap1Ms: fetchTimes.length >= 2 ? fetchTimes[1] - fetchTimes[0] : -1,
              hasLicense: Boolean(nx.hasLicense),
              sessUpdates
            };

            return {
              bootSpotifyMap,
              initialAriaNow,
              afterBtnMute,
              afterBtnUnmute,
              ctAfterNonScrubBackward,
              clampDiagLogged,
              ctAfterExplicitScrub,
              storedAfterMiniDrag,
              ariaAfterMiniDrag,
              elapsedSinceDragMs,
              ariaImmediateAfterInPage,
              backoffRes
            };
            """
        )

        # (b) 0.01 preservation & mute -> unmute restore
        self.assertAlmostEqual(res["bootSpotifyMap"]["volume"], 0.01, delta=0.001)
        self.assertAlmostEqual(res["bootSpotifyMap"]["lastNonZeroVolume"], 0.01, delta=0.001, msg="Boot normalization must preserve 0.01 lastNonZeroVolume")
        self.assertEqual(res["initialAriaNow"], "1")
        self.assertTrue(res["afterBtnMute"]["spMuted"])
        self.assertEqual(res["afterBtnMute"]["ariaNow"], "0")
        self.assertAlmostEqual(res["afterBtnMute"]["map"]["lastNonZeroVolume"], 0.01, delta=0.001)
        self.assertFalse(res["afterBtnUnmute"]["spMuted"])
        self.assertAlmostEqual(res["afterBtnUnmute"]["spVol"], 0.01, delta=0.001, msg="#pm-np-vol-btn unmute must restore 0.01, never 1.0")
        self.assertAlmostEqual(res["afterBtnUnmute"]["vidVol"], 0.01, delta=0.001)
        self.assertEqual(res["afterBtnUnmute"]["ariaNow"], "1")
        self.assertAlmostEqual(res["afterBtnUnmute"]["map"]["lastNonZeroVolume"], 0.01, delta=0.001)

        # (d) forceSeek backward clamp
        self.assertAlmostEqual(res["ctAfterNonScrubBackward"], 123.75, delta=0.01, msg="Non-scrub backward forceSeek must clamp forward")
        self.assertTrue(res["clampDiagLogged"], "clamp-backward-seek-target diagnostic must be emitted")
        self.assertAlmostEqual(res["ctAfterExplicitScrub"], 118.0, delta=0.01, msg="Explicit user scrub backward must still seek")

        # (c) Mini NP drag immediate flush + optimistic lock cleared on in-page change
        self.assertAlmostEqual(res["storedAfterMiniDrag"]["volume"], 0.30, delta=0.06, msg="Mini Now Playing drag must flush storage.local immediately (<= 150ms)")
        self.assertLess(res["elapsedSinceDragMs"], 1000, "In-page change assertion must run within the 1000ms optimistic window")
        self.assertEqual(res["ariaImmediateAfterInPage"], "65", "In-page PM_NON_MIRROR_VOLUME_CHANGED within <1000ms must immediately update #pm-np-vol-slider")

        # (a) EME 300ms transient 503 backoff
        self.assertGreaterEqual(res["backoffRes"]["attempts"], 2)
        self.assertLess(res["backoffRes"]["attempts"], 7, "Retries must NOT exhaust in a 0ms spin loop")
        self.assertGreaterEqual(res["backoffRes"]["gap1Ms"], 380, "Retry #1 must wait >= 380ms exponential backoff")
        self.assertTrue(res["backoffRes"]["hasLicense"], "EME must recover with hasLicense === true after 300ms 503 outage")
        self.assertGreaterEqual(res["backoffRes"]["sessUpdates"], 1)

    def test_t5_18_instagram_profile_reel_modal_scrubber_anchors_bottom_immediately(self) -> None:
        """Instagram profile reel modal scrubber must anchor to the full ._aatk modal container bottom immediately, never at a pre-metadata 150px video height across the top half."""
        fixture_html = (
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<style>"
            "body{margin:0;background:#111;height:800px;overflow:hidden;}"
            "div[role='dialog']{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;}"
            "article{width:340px;background:#000;}"
            "._aatk{position:relative;width:340px;height:560px;background:#000;overflow:hidden;}"
            "._aatk img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}"
            "._aatk video{display:block;width:340px;height:150px;}"
            "</style></head><body>"
            "<div role='dialog'><article><div class='_aatk'>"
            "<div id='no-sound-pill' style='position:absolute;top:0;left:50%;height:28px;width:150px;'><span>Video Has No Sound</span></div>"
            "<button id='native-no-audio' style='position:absolute;bottom:8px;right:8px;' aria-label='Video has no audio'><svg aria-label='Video has no audio'></svg></button>"
            "<img alt='poster'/>"
            "<video id='reel-v'></video>"
            "</div></article></div>"
            "<script type='module'>"
            "import { initScrubberLoadbar } from '/src/content/core/scrubber-loadbar.js';"
            "window.__nativeNoAudioClicks = 0;"
            "document.getElementById('native-no-audio').addEventListener('click', () => { window.__nativeNoAudioClicks++; });"
            "const ctx = { initialSyncAccent: '#ff3366', isBgAudioFrame: false, isStandbyBgFrame: false, hasHost: (h) => h === 'instagram.com' };"
            "initScrubberLoadbar(ctx);"
            "window.dispatchEvent(new Event('resize'));"
            "await new Promise((r) => setTimeout(r, 460));"
            "const muteBtn = document.querySelector('button[data-pm-ig-modal-mute=\"1\"]');"
            "if (muteBtn) muteBtn.click();"
            "await new Promise((r) => setTimeout(r, 50));"
            "const bar = document.getElementById('pm-universal-reel-scrubber');"
            "const pill = document.getElementById('no-sound-pill');"
            "const box = document.querySelector('._aatk').getBoundingClientRect();"
            "const vid = document.getElementById('reel-v').getBoundingClientRect();"
            "const barRect = bar ? bar.getBoundingClientRect() : null;"
            "window.__igModalScrubberRes = {"
            "  visible: Boolean(bar && bar.style.display === 'flex'),"
            "  boxBottom: Math.round(box.bottom),"
            "  vidBottom: Math.round(vid.bottom),"
            "  barTop: barRect ? Math.round(barRect.top) : -1,"
            "  barBottom: barRect ? Math.round(barRect.bottom) : -1,"
            "  noSoundPillHidden: Boolean(pill && window.getComputedStyle(pill).display === 'none'),"
            "  nativeNoAudioClicks: window.__nativeNoAudioClicks"
            "};"
            "</script></body></html>"
        )
        url = self.server.register_fixture("t5_18_ig_modal_scrubber.html", fixture_html)
        self.fx.reset_to_blank()
        self.fx.set_viewport(420, 800)
        self.fx.navigate(url)
        res = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 4000;
            while (Date.now() < deadline && !window.__igModalScrubberRes) {
              await new Promise((r) => setTimeout(r, 25));
            }
            return window.__igModalScrubberRes;
            """
        )
        self.assertIsNotNone(res)
        self.assertTrue(res["visible"], "Scrubber must render immediately for Instagram profile reel dialog")
        self.assertLess(res["vidBottom"], res["boxBottom"] - 300, "Pre-metadata video height should be < half the modal box")
        self.assertAlmostEqual(
            res["barBottom"],
            res["boxBottom"],
            delta=3,
            msg=f"Scrubber must anchor to modal box bottom ({res['boxBottom']}), NOT pre-metadata video bottom ({res['vidBottom']})"
        )
        self.assertTrue(res["noSoundPillHidden"], "False 'Video Has No Sound' overlay pill must be hidden when video has audio")
        self.assertEqual(res["nativeNoAudioClicks"], 0, "Custom mute toggle must NOT click native 'Video has no audio' button")


if __name__ == "__main__":
    unittest.main()
