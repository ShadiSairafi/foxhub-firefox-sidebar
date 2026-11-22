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


if __name__ == "__main__":
    unittest.main()
