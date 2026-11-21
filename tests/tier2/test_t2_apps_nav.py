"""Tier 2 boundary, corner, and negative tests for userChrome, contextMenus, Custom Apps, Presets, Backup/Restore, and Quick Switcher (F9, F11, F12, F13, F14, F15)."""

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

DEFAULT_PINNED_IDS = [
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
]

UNPINNED_11_IDS = [
    "twitch",
    "chatgpt",
    "gemini",
    "claude",
    "perplexity",
    "soundcloud",
    "apple-music",
    "bluesky",
    "notion",
    "google-calendar",
    "google-keep",
]

ALL_21_IDS = DEFAULT_PINNED_IDS + UNPINNED_11_IDS


def _default_settings(**overrides: Any) -> dict[str, Any]:
    s: dict[str, Any] = {
        "theme": "warm-linen",
        "enabledMediaApps": list(DEFAULT_PINNED_IDS),
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
        "contextMenuEnabled": True,
        "contextMenuOpenBehavior": "sidebar",
        "quickSwitcherEnabled": True,
        "quickSwitcherShortcut": "Ctrl+K",
        "railPlayingIndicatorEnabled": True,
        "railQuickControlsEnabled": True,
        "globalShortcuts": {
            "popup": "Alt+Shift+F",
            "sidebar": "Alt+Shift+M",
            "popout": "Alt+Shift+W",
        },
        "appShortcuts": {},
    }
    s.update(overrides)
    return s


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


def _validate_css_snippet(css_text: str) -> tuple[bool, str]:
    """Validate CSS syntax balance and absence of injection/remote constructs."""
    if not isinstance(css_text, str) or len(css_text.strip()) <= 20:
        return False, "CSS snippet is empty or too short"
    if "{" not in css_text or "}" not in css_text:
        return False, "CSS snippet missing braces"
    low = css_text.lower()
    for bad in ("<script", "</style", "javascript:", "-moz-binding", "expression("):
        if bad in low:
            return False, f"Forbidden token in CSS snippet: {bad}"
    if re.search(r"(?:url\s*\(|@import)\s*['\"]?\s*https?://", css_text, re.IGNORECASE):
        return False, "Remote URL/import forbidden in userChrome.css snippet"

    brace_depth = 0
    paren_depth = 0
    in_comment = False
    quote_char = ""
    i = 0
    n = len(css_text)
    while i < n:
        ch = css_text[i]
        nxt = css_text[i + 1] if i + 1 < n else ""
        if in_comment:
            if ch == "*" and nxt == "/":
                in_comment = False
                i += 2
                continue
            i += 1
            continue
        if quote_char:
            if ch == "\\" and i + 1 < n:
                i += 2
                continue
            if ch == quote_char:
                quote_char = ""
            i += 1
            continue
        if ch == "/" and nxt == "*":
            in_comment = True
            i += 2
            continue
        if ch in ("'", '"'):
            quote_char = ch
            i += 1
            continue
        if ch == "{":
            brace_depth += 1
        elif ch == "}":
            brace_depth -= 1
            if brace_depth < 0:
                return False, "Unbalanced closing '}'"
        elif ch == "(":
            paren_depth += 1
        elif ch == ")":
            paren_depth -= 1
            if paren_depth < 0:
                return False, "Unbalanced closing ')'"
        i += 1

    if in_comment:
        return False, "Unclosed CSS comment"
    if quote_char:
        return False, "Unclosed CSS string quote"
    if brace_depth != 0:
        return False, f"Unbalanced braces (depth={brace_depth})"
    if paren_depth != 0:
        return False, f"Unbalanced parens (depth={paren_depth})"
    return True, "ok"


USERCHROME_JS_HELPERS = r"""
window.__t2UcHelpers = {
  isVis(el, win) {
    if (!el || el.hidden || el.classList.contains('hidden')) return false;
    const cs = (win || window).getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  },
  findSearch(doc, win) {
    const cands = [
      '#fh-settings-search',
      '[data-settings-search]',
      'input[type="search"][data-settings-filter]',
      '.fh-settings-search input',
      '#pm-media-apps-drawer input[type="search"]',
      '.opt-main input[type="search"]'
    ];
    for (const s of cands) {
      const el = doc.querySelector(s);
      if (el && this.isVis(el, win)) return el;
    }
    return null;
  },
  findCard(doc, win) {
    const cards = Array.from(doc.querySelectorAll('[data-userchrome], [data-fh-setting-item="1"], .fh-card, .pm-control-card, .opt-card, .fh-setting-card'));
    let best = null;
    let bestLen = Infinity;
    for (const el of cards) {
      if (!this.isVis(el, win)) continue;
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/userChrome\.css/i.test(txt) && /Copy/i.test(txt) && txt.length < bestLen) {
        best = el;
        bestLen = txt.length;
      }
    }
    return best;
  },
  async revealCard(doc, win) {
    let card = this.findCard(doc, win);
    if (card) return card;
    const tabs = Array.from(doc.querySelectorAll('[role="tab"], [data-category], [data-settings-tab], .opt-nav button, .fh-settings-nav button'));
    for (const t of tabs) {
      if (!this.isVis(t, win)) continue;
      t.click();
      await new Promise((r) => setTimeout(r, 40));
      card = this.findCard(doc, win);
      if (card) return card;
    }
    const search = this.findSearch(doc, win);
    if (search) {
      search.value = 'userChrome';
      search.dispatchEvent(new (win || window).Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
      card = this.findCard(doc, win);
      search.value = '';
      search.dispatchEvent(new (win || window).Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));
    }
    return card || this.findCard(doc, win);
  },
  async copyPreset(card, presetRegex, doc, win) {
    const presetEls = Array.from(card.querySelectorAll('button, [role="tab"], [role="radio"], [data-userchrome-preset], option, li, label, div'));
    let matchEl = null;
    let bestLen = Infinity;
    for (const el of presetEls) {
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (presetRegex.test(txt) && txt.length < bestLen) {
        matchEl = el;
        bestLen = txt.length;
      }
    }
    if (!matchEl) return { ok: false, reason: 'Preset not found: ' + presetRegex };
    if (matchEl.tagName === 'OPTION' && matchEl.parentElement && matchEl.parentElement.tagName === 'SELECT') {
      matchEl.parentElement.value = matchEl.value;
      matchEl.parentElement.dispatchEvent(new (win || window).Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));
    } else {
      const scope = matchEl.closest('[data-preset], .fh-userchrome-preset, .userchrome-preset, .fh-code-card, li, tr, div') || matchEl;
      const localCopy = Array.from(scope.querySelectorAll('button')).find((b) => b.hasAttribute('data-userchrome-copy') || /copy|copied/i.test(b.textContent || b.getAttribute('aria-label') || ''));
      if (localCopy && localCopy !== matchEl) {
        localCopy.click();
        await new Promise((r) => setTimeout(r, 50));
        return { ok: true };
      }
      matchEl.click();
      await new Promise((r) => setTimeout(r, 40));
      if (matchEl.hasAttribute('data-userchrome-copy') || /copy|copied/i.test(matchEl.textContent || '')) return { ok: true };
    }
    const copyBtns = Array.from(card.querySelectorAll('button')).filter((b) => b.hasAttribute('data-userchrome-copy') || /copy|copied/i.test(b.textContent || b.getAttribute('aria-label') || ''));
    if (copyBtns.length > 0) {
      copyBtns[0].click();
      await new Promise((r) => setTimeout(r, 50));
      return { ok: true };
    }
    return { ok: false, reason: 'Copy button not found for preset: ' + presetRegex };
  }
};
"""


class TestT2AppsNav(unittest.TestCase):
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

    # ------------------------------------------------------------------
    # Helpers
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
        self.assertEqual(errs, [], f"Uncaught bridge errors in {context}: {errs}")

    def _manifest_dict(self) -> dict[str, Any]:
        manifest_path = REPO_ROOT / "manifest.json"
        self.assertTrue(manifest_path.is_file(), f"Missing {manifest_path}")
        return json.loads(manifest_path.read_text(encoding="utf-8"))

    def _manifest_commands(self) -> list[dict[str, str]]:
        manifest = self._manifest_dict()
        cmds = []
        for name, info in (manifest.get("commands") or {}).items():
            if not isinstance(info, dict):
                continue
            sk = info.get("suggested_key") or {}
            cmds.append(
                {
                    "name": str(name),
                    "description": str(info.get("description") or ""),
                    "shortcut": str(sk.get("default") or ""),
                }
            )
        return cmds

    def _boot_background_offline(
        self,
        settings: dict[str, Any] | None = None,
        tabs: list[dict[str, Any]] | None = None,
        raw_storage: dict[str, Any] | None = None,
    ) -> None:
        bg_html = REPO_ROOT / "src" / "background" / "background.html"
        self.assertTrue(bg_html.is_file(), f"Missing {bg_html}")
        html_text = bg_html.read_text(encoding="utf-8")
        raw_srcs = re.findall(r'<script\s+src=["\']([^"\']+)["\']', html_text, re.IGNORECASE)
        self.assertGreater(len(raw_srcs), 0)

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
            "t2_an_fetch_guard.js",
            FETCH_GUARD_JS,
            content_type="application/javascript; charset=utf-8",
        )
        trap_url = self.server.register_fixture(
            "t2_an_err_trap.js",
            ERROR_TRAP_SNIPPET,
            content_type="application/javascript; charset=utf-8",
        )
        bg_doc = (
            "<!doctype html><html><head><meta charset='utf-8'><title>BG Harness</title>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            f"<script src='{guard_url}'></script>"
            f"<script src='{trap_url}'></script>"
            "</head><body>"
            + "".join(script_tags)
            + "</body></html>"
        )
        bg_url = self.server.register_fixture("t2_an_bg_harness.html", bg_doc)

        storage_seed = raw_storage if raw_storage is not None else {"settings": (settings if settings is not None else _default_settings())}
        seed: dict[str, Any] = {
            "manifest": self._manifest_dict(),
            "commands": self._manifest_commands(),
            "storage": storage_seed,
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
        self.assertTrue(ready, "Offline background.html harness failed to initialize")

    def _open_bridged_app(
        self,
        ui_rel_path: str = "src/popup/popup.html",
        ui_query: str = "?sidebar=1",
        settings: dict[str, Any] | None = None,
        raw_storage: dict[str, Any] | None = None,
        width: int = 460,
        height: int = 740,
    ) -> None:
        bg_path = REPO_ROOT / "src" / "background" / "background.html"
        ui_path = REPO_ROOT / ui_rel_path
        self.assertTrue(bg_path.is_file(), f"Missing {bg_path}")
        self.assertTrue(ui_path.is_file(), f"Missing {ui_path}")

        ui_dir = "/" + "/".join(Path(ui_rel_path).parts[:-1]) + "/"
        bg_wrapped = _wrap_html_for_bridge(bg_path.read_text(encoding="utf-8"), self.server.url_for("/src/background/"))
        ui_wrapped = _wrap_html_for_bridge(ui_path.read_text(encoding="utf-8"), self.server.url_for(ui_dir))
        bg_url = self.server.register_fixture("t2_an_bridge_bg.html", bg_wrapped)
        ui_url = self.server.register_fixture("t2_an_bridge_ui.html", ui_wrapped) + (ui_query or "")

        host_html = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>FoxHub Bridge</title>
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
    window.__anBridgeReady = false;
    window.__anBridgeBoot = (async function () {{
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
      await new Promise((r) => setTimeout(r, 150));
      window.__anBridgeReady = true;
    }})();
  </script>
</body>
</html>"""
        host_url = self.server.register_fixture("t2_an_bridge_host.html", host_html)

        storage_seed = raw_storage if raw_storage is not None else {"settings": (settings if settings is not None else _default_settings())}
        self.server.set_seed(
            {
                "manifest": self._manifest_dict(),
                "commands": self._manifest_commands(),
                "storage": storage_seed,
            }
        )
        self.fx.navigate(host_url)
        self.fx.set_viewport(width, height)
        self._install_error_trap()
        ready = self.fx.eval_async_js("await window.__anBridgeBoot; return Boolean(window.__anBridgeReady);")
        self.assertTrue(ready, f"Bridged {ui_rel_path} failed to boot")

    def _open_options_direct(self, settings: dict[str, Any] | None = None, width: int = 1200, height: int = 800) -> None:
        s = settings if settings is not None else _default_settings()
        self.server.set_seed(
            {
                "manifest": self._manifest_dict(),
                "commands": self._manifest_commands(),
                "storage": {"settings": s},
                "messageResponses": {
                    "GET_STATE": {"state": {"accounts": [], "totalUnread": 0}, "settings": s, "snoozed": {}},
                    "UPDATE_SETTINGS": {"ok": True, "settings": s},
                    "GET_AUDIO_DIAGNOSTICS": {"ok": True, "diagnostics": {"recentEvents": []}},
                    "GET_KEYBOARD_SHORTCUTS": {
                        "ok": True,
                        "commands": self._manifest_commands(),
                        "globalShortcuts": s.get("globalShortcuts", {}),
                        "appShortcuts": s.get("appShortcuts", {}),
                        "quickSwitcherEnabled": s.get("quickSwitcherEnabled", True),
                        "quickSwitcherShortcut": s.get("quickSwitcherShortcut", "Ctrl+K"),
                    },
                },
            }
        )
        self.fx.navigate(self.server.url_for("/src/options/options.html"))
        self.fx.set_viewport(width, height)
        self._install_error_trap()
        self.fx.eval_async_js("await new Promise((r) => setTimeout(r, 140));")

    def _open_popup_toplevel(
        self,
        settings: dict[str, Any] | None = None,
        width: int = 440,
        height: int = 700,
    ) -> None:
        s = settings if settings is not None else _default_settings()
        self.server.set_seed(
            {
                "manifest": self._manifest_dict(),
                "commands": self._manifest_commands(),
                "storage": {"settings": s},
                "messageResponses": {
                    "GET_STATE": {
                        "state": {"accounts": [], "totalUnread": 0, "sentMessages": [], "lastSyncAt": 1700000000000},
                        "settings": s,
                        "snoozed": {},
                    },
                    "UPDATE_SETTINGS": {"ok": True, "settings": s},
                    "STOP_BG_AUDIO_HANDOFF": {"ok": True, "skipped": True, "settings": s},
                },
            }
        )
        self.fx.navigate(self.server.url_for("/src/popup/popup.html?sidebar=1"))
        self.fx.set_viewport(width, height)
        self._install_error_trap()
        ok = self.fx.eval_async_js(
            """
            window.__t2Settings = arguments[0];
            window.__webextMock.runtime.setMessageHandler((msg) => {
              if (!msg || !msg.type) return undefined;
              if (msg.type === 'GET_STATE') {
                return { state: { accounts: [], totalUnread: 0, sentMessages: [], lastSyncAt: Date.now() }, settings: window.__t2Settings, snoozed: {} };
              }
              if (msg.type === 'UPDATE_SETTINGS') {
                window.__t2Settings = { ...window.__t2Settings, ...(msg.settings || {}) };
                browser.storage.local.set({ settings: window.__t2Settings });
                return { ok: true, settings: window.__t2Settings };
              }
              if (msg.type === 'STOP_BG_AUDIO_HANDOFF') return { ok: true, skipped: true, settings: window.__t2Settings };
              if (msg.type === 'STATE_UPDATED') return undefined;
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
        )
        self.assertTrue(ok, "Top-level popup failed to render rail")

    def _open_settings_inside_bridged_popup(self) -> None:
        opened = self.fx.eval_async_js(
            """
            const doc = document.getElementById('ui-frame').contentDocument;
            const trigger =
              doc.getElementById('rail-btn-sidebar-settings') ||
              doc.getElementById('btn-open-full-settings-drawer') ||
              doc.getElementById('btn-settings');
            if (!trigger) return false;
            trigger.click();
            await new Promise((r) => setTimeout(r, 100));
            const fullBtn = doc.getElementById('btn-open-full-settings-drawer');
            if (fullBtn && !fullBtn.classList.contains('hidden')) {
              const drawer = doc.getElementById('pm-media-apps-drawer');
              if (drawer && !drawer.querySelector('#fh-settings-search, [data-settings-search], #pm-unified-settings-root, #fh-settings-root, .fh-settings-root, [data-settings-root]')) {
                fullBtn.click();
                await new Promise((r) => setTimeout(r, 100));
              }
            }
            return true;
            """
        )
        self.assertTrue(opened, "Could not open settings drawer inside popup")

    def _assert_settings_ui_exists(self) -> None:
        p = REPO_ROOT / "src" / "shared" / "settings-ui.js"
        self.assertTrue(p.is_file(), f"Missing M3 unified settings component: {p}")

    # ==================================================================
    # F9: Optional userChrome.css Companion Generator (6 tests)
    # ==================================================================

    def test_t2_f9_presets_valid_css_balanced_braces_and_no_injection(self) -> None:
        self._assert_settings_ui_exists()
        self._open_options_direct()
        res = self.fx.eval_async_js(
            USERCHROME_JS_HELPERS
            + r"""
            const spy = window.__webextMock.installClipboardSpy();
            const card = await window.__t2UcHelpers.revealCard(document, window);
            if (!card) return { hasCard: false };
            const presets = [/Hide sidebar header/i, /Hover[- ]to[- ]expand/i, /Rounded(?:\s+Floating)?\s+sidebar/i];
            const snippets = [];
            for (const rx of presets) {
              const step = await window.__t2UcHelpers.copyPreset(card, rx, document, window);
              if (!step.ok) return { hasCard: true, error: step.reason };
              const txt = spy.getText();
              const styleEl = document.createElement('style');
              styleEl.textContent = txt;
              document.head.appendChild(styleEl);
              const ruleCount = styleEl.sheet ? styleEl.sheet.cssRules.length : 0;
              styleEl.remove();
              snippets.push({ text: txt, ruleCount });
            }
            return { hasCard: true, snippets };
            """
        )
        self.assertTrue(res.get("hasCard"), f"userChrome.css card not found in options.html: {res}")
        self.assertNotIn("error", res, f"Preset copy failed: {res.get('error')}")
        texts = [item["text"] for item in res["snippets"]]
        self.assertEqual(len(set(texts)), 3, "All 3 userChrome.css presets must produce distinct CSS")
        for idx, item in enumerate(res["snippets"]):
            ok, reason = _validate_css_snippet(item["text"])
            self.assertTrue(ok, f"Preset {idx + 1} invalid CSS ({reason}): {item['text']!r}")
            self.assertGreaterEqual(item["ruleCount"], 1, f"Preset {idx + 1} produced 0 parsed CSS rules in Firefox")
        self._assert_no_js_errors("test_t2_f9_presets_valid_css_balanced_braces_and_no_injection")

    def test_t2_f9_strictly_optional_zero_userchrome_boot_and_operation(self) -> None:
        manifest = self._manifest_dict()
        manifest_str = json.dumps(manifest).lower()
        self.assertNotIn("userchrome", manifest_str)
        self.assertNotIn("nativemessaging", manifest.get("permissions", []))

        profile_userchrome = self.fx.profile_dir / "chrome" / "userChrome.css"
        self.assertFalse(profile_userchrome.exists(), "Test profile must not require userChrome.css")

        # Boot popup & options with empty storage
        self.server.set_seed(
            {
                "manifest": manifest,
                "storage": {},
                "messageResponses": {
                    "GET_STATE": {"state": {"accounts": [], "totalUnread": 0}, "settings": _default_settings(), "snoozed": {}},
                    "STOP_BG_AUDIO_HANDOFF": {"ok": True, "skipped": True, "settings": _default_settings()},
                },
            }
        )
        self.fx.navigate(self.server.url_for("/src/popup/popup.html?sidebar=1"))
        self._install_error_trap()
        rail_count = self.fx.eval_async_js(
            "await new Promise((r) => setTimeout(r, 140)); return document.querySelectorAll('#pm-rail-apps-list [data-app-id], #pm-rail-apps-list .pm-rail-item').length;"
        )
        self.assertGreaterEqual(rail_count, 10, "Popup must operate cleanly with zero userChrome.css and empty storage")
        self._assert_no_js_errors("test_t2_f9_strictly_optional_popup")

        self._assert_settings_ui_exists()
        self.fx.navigate(self.server.url_for("/src/options/options.html"))
        self._install_error_trap()
        opt_info = self.fx.eval_async_js(
            USERCHROME_JS_HELPERS
            + """
            await new Promise((r) => setTimeout(r, 140));
            const card = await window.__t2UcHelpers.revealCard(document, window);
            return {
              hasCard: Boolean(card),
              cardText: card ? (card.textContent || '') : ''
            };
            """
        )
        self.assertTrue(opt_info["hasCard"], "userChrome.css card missing on options.html")
        self.assertRegex(opt_info["cardText"], re.compile(r"optional", re.IGNORECASE), "userChrome.css card must explicitly state it is optional")
        self._assert_no_js_errors("test_t2_f9_strictly_optional_options")

    def test_t2_f9_clipboard_copy_fallback_when_writeText_rejects_or_unavailable(self) -> None:
        self._assert_settings_ui_exists()
        self._open_options_direct()
        res = self.fx.eval_async_js(
            USERCHROME_JS_HELPERS
            + r"""
            const spy = window.__webextMock.installClipboardSpy();
            const card = await window.__t2UcHelpers.revealCard(document, window);
            if (!card) return { hasCard: false };

            // Case A: navigator.clipboard.writeText rejects
            Object.defineProperty(navigator, 'clipboard', {
              configurable: true,
              value: { writeText: () => Promise.reject(new Error('Clipboard denied')) }
            });
            const s1 = await window.__t2UcHelpers.copyPreset(card, /Hide sidebar header/i, document, window);
            await new Promise((r) => setTimeout(r, 80));
            const histAfterReject = spy.getHistory().filter((h) => h.via === 'execCommand' && h.text.includes('{'));
            const previewA = Array.from(card.querySelectorAll('textarea, pre, code')).map((el) => el.value || el.textContent || '').join('\\n');

            // Case B: navigator.clipboard completely undefined
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
            const s2 = await window.__t2UcHelpers.copyPreset(card, /Rounded(?:\s+Floating)?\s+sidebar/i, document, window);
            await new Promise((r) => setTimeout(r, 80));
            const histAfterUndef = spy.getHistory().filter((h) => h.via === 'execCommand' && h.text.includes('{'));
            const previewB = Array.from(card.querySelectorAll('textarea, pre, code')).map((el) => el.value || el.textContent || '').join('\\n');

            return {
              hasCard: true,
              s1,
              s2,
              execCssA: histAfterReject.length > 0 ? histAfterReject[histAfterReject.length - 1].text : '',
              execCssB: histAfterUndef.length > 0 ? histAfterUndef[histAfterUndef.length - 1].text : '',
              previewA,
              previewB
            };
            """
        )
        self.assertTrue(res.get("hasCard"), "userChrome.css card not found")
        self.assertTrue(res["s1"].get("ok"), res["s1"])
        self.assertTrue(res["s2"].get("ok"), res["s2"])
        cap_a = res["execCssA"] or res["previewA"]
        cap_b = res["execCssB"] or res["previewB"]
        self.assertTrue("{" in cap_a and "}" in cap_a, f"Fallback failed when clipboard.writeText rejected: {res}")
        self.assertTrue("{" in cap_b and "}" in cap_b, f"Fallback failed when navigator.clipboard unavailable: {res}")
        self.assertNotEqual(cap_a, cap_b, "Fallback must copy/display the new preset rather than stale CSS")
        self._assert_no_js_errors("test_t2_f9_clipboard_copy_fallback_when_writeText_rejects_or_unavailable")

    def test_t2_f9_preset_switching_without_stale_text(self) -> None:
        self._assert_settings_ui_exists()
        self._open_options_direct()
        res = self.fx.eval_async_js(
            USERCHROME_JS_HELPERS
            + r"""
            const spy = window.__webextMock.installClipboardSpy();
            const card = await window.__t2UcHelpers.revealCard(document, window);
            if (!card) return { hasCard: false };
            const getPreview = () => {
              const all = Array.from(card.querySelectorAll('textarea, pre'));
              if (all.length >= 3) return '';
              const p = all[0] || card.querySelector('code');
              return p ? (p.value || p.textContent || '') : '';
            };
            const previewCount = card.querySelectorAll('textarea, pre').length;

            await window.__t2UcHelpers.copyPreset(card, /Hide sidebar header/i, document, window);
            const c1 = spy.getText();
            const p1 = getPreview();

            await window.__t2UcHelpers.copyPreset(card, /Hover[- ]to[- ]expand/i, document, window);
            const c2 = spy.getText();
            const p2 = getPreview();

            await window.__t2UcHelpers.copyPreset(card, /Rounded(?:\s+Floating)?\s+sidebar/i, document, window);
            const c3 = spy.getText();
            const p3 = getPreview();

            await window.__t2UcHelpers.copyPreset(card, /Hide sidebar header/i, document, window);
            const c1Again = spy.getText();
            const p1Again = getPreview();

            return { hasCard: true, c1, c2, c3, c1Again, p1, p2, p3, p1Again, previewCount };
            """
        )
        self.assertTrue(res.get("hasCard"), "userChrome.css card not found")
        self.assertEqual(len({res["c1"], res["c2"], res["c3"]}), 3, "Each preset must yield unique CSS")
        self.assertEqual(res["c1Again"], res["c1"], "Re-selecting preset 1 must return exact initial CSS")
        if res["p1"] or res["p2"] or res["p3"]:
            self.assertEqual(len({res["p1"], res["p2"], res["p3"]}), 3, "Preview text must update without stale rules")
            self.assertEqual(res["p1Again"], res["p1"])
        self._assert_no_js_errors("test_t2_f9_preset_switching_without_stale_text")

    def test_t2_f9_zero_pocketmail_branding_in_snippets_and_card_ui(self) -> None:
        self._assert_settings_ui_exists()
        # Surface 1: options.html
        self._open_options_direct()
        opt_res = self.fx.eval_async_js(
            USERCHROME_JS_HELPERS
            + r"""
            const spy = window.__webextMock.installClipboardSpy();
            const card = await window.__t2UcHelpers.revealCard(document, window);
            if (!card) return { hasCard: false };
            const attrs = [];
            card.querySelectorAll('*').forEach((el) => {
              ['title', 'aria-label'].forEach((a) => { const v = el.getAttribute(a); if (v) attrs.push(v); });
            });
            const snippets = [];
            for (const rx of [/Hide sidebar header/i, /Hover[- ]to[- ]expand/i, /Rounded(?:\s+Floating)?\s+sidebar/i]) {
              await window.__t2UcHelpers.copyPreset(card, rx, document, window);
              snippets.push(spy.getText());
            }
            return { hasCard: true, text: card.textContent || '', attrs: attrs.join(' '), snippets };
            """
        )
        self.assertTrue(opt_res.get("hasCard"), "userChrome.css card missing in options.html")
        gecko_sb_rx = re.compile(r"pocketmail-local(?:_workspace_local-sidebar-action|@workspace\.local)", re.IGNORECASE)
        self.assertNotRegex(gecko_sb_rx.sub("", opt_res["text"]), re.compile(r"pocketmail", re.IGNORECASE))
        self.assertNotRegex(opt_res["attrs"], re.compile(r"pocketmail", re.IGNORECASE))
        for snip in opt_res["snippets"]:
            cleaned_snip = gecko_sb_rx.sub("", snip)
            self.assertNotRegex(cleaned_snip, re.compile(r"pocketmail", re.IGNORECASE))
        self._assert_no_js_errors("test_t2_f9_zero_pocketmail_options")

        # Surface 2: popup.html Settings drawer
        self._open_bridged_app("src/popup/popup.html", "?sidebar=1", width=440, height=700)
        self._open_settings_inside_bridged_popup()
        pop_res = self.fx.eval_async_js(
            USERCHROME_JS_HELPERS
            + """
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const card = await window.__t2UcHelpers.revealCard(uiDoc, uiWin);
            if (!card) return { hasCard: false };
            return { hasCard: true, text: card.textContent || '' };
            """
        )
        self.assertTrue(pop_res.get("hasCard"), "userChrome.css card missing in popup settings drawer")
        self.assertNotRegex(gecko_sb_rx.sub("", pop_res["text"]), re.compile(r"pocketmail", re.IGNORECASE))
        self._assert_no_bridge_errors("test_t2_f9_zero_pocketmail_popup")

    def test_t2_f9_parity_and_search_filter_across_popup_and_options(self) -> None:
        self._assert_settings_ui_exists()
        # Options surface
        self._open_options_direct(width=1200, height=800)
        opt_res = self.fx.eval_async_js(
            USERCHROME_JS_HELPERS
            + r"""
            const spy = window.__webextMock.installClipboardSpy();
            const search = window.__t2UcHelpers.findSearch(document, window);
            if (!search) return { hasSearch: false };
            const initialCard = await window.__t2UcHelpers.revealCard(document, window);
            if (!initialCard) return { hasSearch: true, hasCard: false };
            const setQ = async (q) => {
              search.value = q;
              search.dispatchEvent(new Event('input', { bubbles: true }));
              await new Promise((r) => setTimeout(r, 60));
              return Boolean(window.__t2UcHelpers.findCard(document, window));
            };
            const visUc = await setQ('userChrome');
            const visSb = await setQ('sidebar');
            const visNo = await setQ('zxqv_nomatch_999');
            const visClr = await setQ('');
            const card = window.__t2UcHelpers.findCard(document, window) || await window.__t2UcHelpers.revealCard(document, window);
            if (!card) return { hasSearch: true, hasCard: false };
            const snips = [];
            for (const rx of [/Hide sidebar header/i, /Hover[- ]to[- ]expand/i, /Rounded(?:\s+Floating)?\s+sidebar/i]) {
              await window.__t2UcHelpers.copyPreset(card, rx, document, window);
              snips.push(spy.getText());
            }
            return { hasSearch: true, hasCard: true, visUc, visSb, visNo, visClr, snips };
            """
        )
        self.assertTrue(opt_res.get("hasSearch"), "Unified settings search missing in options.html")
        self.assertTrue(opt_res.get("hasCard"), "userChrome.css card missing in options.html")
        self.assertTrue(opt_res["visUc"])
        self.assertTrue(opt_res["visSb"])
        self.assertFalse(opt_res["visNo"])
        self.assertTrue(opt_res["visClr"])
        self._assert_no_js_errors("test_t2_f9_parity_options")

        # Narrow popup surface (360x680)
        self._open_popup_toplevel(width=360, height=680)
        pop_res = self.fx.eval_async_js(
            USERCHROME_JS_HELPERS
            + r"""
            const trigger = document.getElementById('rail-btn-sidebar-settings') || document.getElementById('btn-open-full-settings-drawer');
            if (trigger) { trigger.click(); await new Promise((r) => setTimeout(r, 100)); }
            const fullBtn = document.getElementById('btn-open-full-settings-drawer');
            if (fullBtn && !fullBtn.classList.contains('hidden')) { fullBtn.click(); await new Promise((r) => setTimeout(r, 100)); }
            const spy = window.__webextMock.installClipboardSpy();
            const search = window.__t2UcHelpers.findSearch(document, window);
            if (!search) return { hasSearch: false };
            const initialCard = await window.__t2UcHelpers.revealCard(document, window);
            if (!initialCard) return { hasSearch: true, hasCard: false };
            const setQ = async (q) => {
              search.value = q;
              search.dispatchEvent(new Event('input', { bubbles: true }));
              await new Promise((r) => setTimeout(r, 60));
              return Boolean(window.__t2UcHelpers.findCard(document, window));
            };
            const visUc = await setQ('userChrome');
            const visSb = await setQ('sidebar');
            const visNo = await setQ('zxqv_nomatch_999');
            const visClr = await setQ('');
            const card = window.__t2UcHelpers.findCard(document, window) || await window.__t2UcHelpers.revealCard(document, window);
            if (!card) return { hasSearch: true, hasCard: false };
            const snips = [];
            for (const rx of [/Hide sidebar header/i, /Hover[- ]to[- ]expand/i, /Rounded(?:\s+Floating)?\s+sidebar/i]) {
              await window.__t2UcHelpers.copyPreset(card, rx, document, window);
              snips.push(spy.getText());
            }
            return {
              hasSearch: true,
              hasCard: true,
              visUc,
              visSb,
              visNo,
              visClr,
              snips,
              scrollWidth: document.documentElement.scrollWidth,
              innerWidth: window.innerWidth
            };
            """
        )
        self.assertTrue(pop_res.get("hasSearch"), "Unified settings search missing in popup drawer")
        self.assertTrue(pop_res.get("hasCard"), "userChrome.css card missing in popup drawer")
        self.assertTrue(pop_res["visUc"])
        self.assertTrue(pop_res["visSb"])
        self.assertFalse(pop_res["visNo"])
        self.assertTrue(pop_res["visClr"])
        self.assertEqual(pop_res["snips"], opt_res["snips"], "userChrome.css snippets must have 1:1 parity across popup & options")
        self.assertLessEqual(pop_res["scrollWidth"], pop_res["innerWidth"] + 1)
        self._assert_no_js_errors("test_t2_f9_parity_popup")

    # ==================================================================
    # F11: Right-Click contextMenus ("Open in FoxHub") (6 tests)
    # ==================================================================

    def test_t2_f11_dynamic_context_menu_registration_on_toggle_and_import(self) -> None:
        self._boot_background_offline(_default_settings(contextMenuEnabled=True))
        items = mock_helpers.get_context_menus(self.fx)
        self.assertEqual({m["id"] for m in items}, {"foxhub-open-page", "foxhub-open-link"})
        for m in items:
            pats = m.get("documentUrlPatterns") or m.get("targetUrlPatterns") or []
            self.assertEqual(set(pats), {"http://*/*", "https://*/*"})

        res = self.fx.eval_async_js(
            """
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { contextMenuEnabled: false } });
            const afterOff = window.__webextMock.contextMenus.list();

            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { contextMenuEnabled: true } });
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { contextMenuEnabled: true } });
            const afterDoubleOn = window.__webextMock.contextMenus.list();

            const exp = await browser.runtime.sendMessage({ type: 'EXPORT_SETTINGS' });
            const pFalse = JSON.parse(JSON.stringify(exp.payload));
            pFalse.settings.contextMenuEnabled = false;
            await browser.runtime.sendMessage({ type: 'IMPORT_SETTINGS', payload: pFalse });
            const afterImportFalse = window.__webextMock.contextMenus.list();

            const pTrue = JSON.parse(JSON.stringify(exp.payload));
            pTrue.settings.contextMenuEnabled = true;
            await browser.runtime.sendMessage({ type: 'IMPORT_SETTINGS', payload: pTrue });
            const afterImportTrue = window.__webextMock.contextMenus.list();

            return { afterOff, afterDoubleOn, afterImportFalse, afterImportTrue };
            """
        )
        self.assertEqual(res["afterOff"], [])
        self.assertEqual({m["id"] for m in res["afterDoubleOn"]}, {"foxhub-open-page", "foxhub-open-link"})
        self.assertEqual(res["afterImportFalse"], [])
        self.assertEqual({m["id"] for m in res["afterImportTrue"]}, {"foxhub-open-page", "foxhub-open-link"})
        self._assert_no_js_errors("test_t2_f11_dynamic_context_menu_registration_on_toggle_and_import")

    def test_t2_f11_rejects_unsafe_url_schemes_from_context_menu_and_message(self) -> None:
        self._boot_background_offline(_default_settings(contextMenuEnabled=True))
        unsafe_urls = [
            "javascript:alert(1)",
            "data:text/html,<script>1</script>",
            "about:config",
            "file:///C:/Windows/win.ini",
            "vbscript:x",
            "",
            "   ",
        ]
        res = self.fx.eval_async_js(
            """
            const badUrls = arguments[0];
            const out = [];
            for (const u of badUrls) {
              window.__webextMock.clearCalls();
              window.__webextMock.contextMenus.triggerClick({ menuItemId: 'foxhub-open-link', linkUrl: u }, { id: 1, url: 'https://safe.test/' });
              window.__webextMock.contextMenus.triggerClick({ menuItemId: 'foxhub-open-page', pageUrl: u }, { id: 1, url: u });
              const r1 = await browser.runtime.sendMessage({ type: 'OPEN_URL_IN_SIDEBAR', url: u });
              const r2 = await browser.runtime.sendMessage({ type: 'OPEN_APP_FROM_CONTEXT_MENU', url: u });
              const sbCalls = window.__webextMock.getCalls('sidebarAction.open');
              const winCalls = window.__webextMock.getCalls('windows.create');
              const broadcasts = window.__webextMock.getCalls('runtime.sendMessage')
                .map((c) => c.args && c.args[0])
                .filter((m) => m && m.type === 'OPEN_URL_IN_SIDEBAR' && m.fromBackground);
              out.push({
                url: u,
                r1Ok: Boolean(r1 && r1.ok),
                r2Ok: Boolean(r2 && r2.ok),
                pending: window.__pmGetSyncBootState().pendingContextUrl,
                sbCount: sbCalls.length,
                winCount: winCalls.length,
                bcastCount: broadcasts.length
              });
            }
            return out;
            """,
            unsafe_urls,
        )
        for row in res:
            self.assertFalse(row["r1Ok"], f"OPEN_URL_IN_SIDEBAR accepted unsafe URL: {row}")
            self.assertFalse(row["r2Ok"], f"OPEN_APP_FROM_CONTEXT_MENU accepted unsafe URL: {row}")
            self.assertIsNone(row["pending"], f"Unsafe URL leaked into pendingContextUrl: {row}")
            self.assertEqual(row["sbCount"], 0)
            self.assertEqual(row["winCount"], 0)
            self.assertEqual(row["bcastCount"], 0)
        self._assert_no_js_errors("test_t2_f11_rejects_unsafe_url_schemes_from_context_menu_and_message")

    def test_t2_f11_pending_context_url_fallback_when_sidebar_booting_and_ttl_expiry(self) -> None:
        # Part A: Background pendingContextUrl contract, one-shot consume, and 10s TTL expiry
        self._boot_background_offline(_default_settings(contextMenuEnabled=True, contextMenuOpenBehavior="sidebar"))
        part_a = self.fx.eval_async_js(
            """
            window.__webextMock.contextMenus.triggerClick(
              { menuItemId: 'foxhub-open-link', linkUrl: 'https://example.org/article?a=1#top' },
              { id: 2, url: 'https://parent.test/' }
            );
            await new Promise((r) => setTimeout(r, 40));
            const st = await browser.runtime.sendMessage({ type: 'GET_STATE' });
            const syncBefore = window.__pmGetSyncBootState().pendingContextUrl;
            const consumed1 = window.__pmConsumePendingContextUrl();
            const consumed2 = window.__pmConsumePendingContextUrl();

            // Re-seed and test CONSUME_PENDING_CONTEXT_URL message
            window.__webextMock.contextMenus.triggerClick(
              { menuItemId: 'foxhub-open-page', pageUrl: 'https://example.org/two' },
              { id: 2, url: 'https://example.org/two' }
            );
            await browser.runtime.sendMessage({ type: 'CONSUME_PENDING_CONTEXT_URL' });
            const afterMsgConsume = window.__pmGetSyncBootState().pendingContextUrl;

            // Re-seed and backdate ts by 15s (> 10s TTL)
            window.__webextMock.contextMenus.triggerClick(
              { menuItemId: 'foxhub-open-page', pageUrl: 'https://example.org/expired' },
              { id: 2, url: 'https://example.org/expired' }
            );
            window.FoxHubBg.state.pendingContextUrl.ts = Date.now() - 15000;
            const afterExpiry = window.__pmGetSyncBootState().pendingContextUrl;

            return {
              getStatePending: st.pendingContextUrl,
              syncBefore,
              consumed1,
              consumed2,
              afterMsgConsume,
              afterExpiry
            };
            """
        )
        self.assertEqual(part_a["getStatePending"]["url"], "https://example.org/article?a=1#top")
        self.assertEqual(part_a["syncBefore"]["url"], "https://example.org/article?a=1#top")
        self.assertEqual(part_a["consumed1"]["url"], "https://example.org/article?a=1#top")
        self.assertIsNone(part_a["consumed2"])
        self.assertIsNone(part_a["afterMsgConsume"])
        self.assertIsNone(part_a["afterExpiry"])
        self._assert_no_js_errors("test_t2_f11_pending_context_url_partA")

        # Part B: Popup startup consumes pendingContextUrl and opens local URL in #pm-media-frame-pool
        self.fx.reset_to_blank()
        self.server.clear_seed()
        target_url = self.server.url_for("/mock/custom/ctxlaunch?ref=cm")
        bg_path = REPO_ROOT / "src" / "background" / "background.html"
        ui_path = REPO_ROOT / "src" / "popup" / "popup.html"
        bg_wrapped = _wrap_html_for_bridge(bg_path.read_text(encoding="utf-8"), self.server.url_for("/src/background/"))
        ui_wrapped = _wrap_html_for_bridge(ui_path.read_text(encoding="utf-8"), self.server.url_for("/src/popup/"))
        bg_url = self.server.register_fixture("t2_f11_bg.html", bg_wrapped)
        ui_url = self.server.register_fixture("t2_f11_ui.html", ui_wrapped) + "?sidebar=1"

        host_html = f"""<!doctype html>
<html><head><meta charset="utf-8"><script src="/__test__/mock_seed.js"></script><script src="/__test__/webext_mock.js"></script></head>
<body><script>
window.__f11Boot = (async function () {{
  const bg = document.createElement('iframe');
  bg.id = 'bg-frame';
  bg.src = {json.dumps(bg_url)};
  document.body.appendChild(bg);
  await new Promise((r) => bg.addEventListener('load', r, {{ once: true }}));
  window.__webextMock.configure({{ backgroundPage: bg.contentWindow }});
  while (typeof bg.contentWindow.__pmGetSyncBootState !== 'function') await new Promise((r) => setTimeout(r, 20));
  window.__webextMock.contextMenus.triggerClick({{ menuItemId: 'foxhub-open-link', linkUrl: {json.dumps(target_url)} }}, {{ id: 9, url: 'https://parent.test/' }});
  const ui = document.createElement('iframe');
  ui.id = 'ui-frame';
  ui.src = {json.dumps(ui_url)};
  document.body.appendChild(ui);
  await new Promise((r) => ui.addEventListener('load', r, {{ once: true }}));
  await new Promise((r) => setTimeout(r, 200));
  const doc = ui.contentDocument;
  const frames = Array.from(doc.querySelectorAll('#pm-media-frame-pool iframe, iframe.pm-media-frame')).map((f) => f.src || f.getAttribute('src') || '');
  const wsOpen = Boolean(doc.getElementById('pm-media-workspace') && !doc.getElementById('pm-media-workspace').classList.contains('hidden'));
  const remaining = bg.contentWindow.__pmGetSyncBootState().pendingContextUrl;
  return {{ frames, wsOpen, remaining }};
}})();
</script></body></html>"""
        host_url = self.server.register_fixture("t2_f11_host.html", host_html)
        self.server.set_seed({"manifest": self._manifest_dict(), "storage": {"settings": _default_settings(contextMenuEnabled=True)}})
        self.fx.navigate(host_url)
        self._install_error_trap()
        part_b = self.fx.eval_async_js("return await window.__f11Boot;")
        self.assertTrue(part_b["wsOpen"], f"Popup startup must open media workspace for pendingContextUrl: {part_b}")
        self.assertTrue(any("/mock/custom/ctxlaunch" in s for s in part_b["frames"]), f"Expected pendingContextUrl iframe in pool: {part_b['frames']}")
        self.assertIsNone(part_b["remaining"], "pendingContextUrl must be consumed once popup boots")
        self._assert_no_bridge_errors("test_t2_f11_pending_context_url_partB")

    def test_t2_f11_open_behavior_sidebar_vs_popout_and_closed_sidebar_fallback(self) -> None:
        self._boot_background_offline(_default_settings(contextMenuEnabled=True, contextMenuOpenBehavior="sidebar"))
        res = self.fx.eval_async_js(
            """
            window.__webextMock.clearCalls();
            window.__webextMock.contextMenus.triggerClick(
              { menuItemId: 'foxhub-open-page', pageUrl: 'https://news.example.com/' },
              { id: 1, url: 'https://news.example.com/' }
            );
            await new Promise((r) => setTimeout(r, 50));
            const sb1 = window.__webextMock.getCalls('sidebarAction.open').length;
            const wc1 = window.__webextMock.getCalls('windows.create').length;

            // Switch to popout
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { contextMenuOpenBehavior: 'popout' } });
            window.__webextMock.clearCalls();
            window.__webextMock.contextMenus.triggerClick(
              { menuItemId: 'foxhub-open-link', linkUrl: 'https://docs.example.com/guide' },
              { id: 1, url: 'https://news.example.com/' }
            );
            await new Promise((r) => setTimeout(r, 50));
            const wc2Calls = window.__webextMock.getCalls('windows.create');
            const createdWinId = window.__webextMock.windows.dump().slice(-1)[0]?.id;

            // Register companion window ID and click again -> must focus existing companion
            window.FoxHubBg.companionWindowIds.add(createdWinId);
            window.__webextMock.clearCalls();
            window.__webextMock.contextMenus.triggerClick(
              { menuItemId: 'foxhub-open-link', linkUrl: 'https://docs.example.com/guide2' },
              { id: 1, url: 'https://news.example.com/' }
            );
            await new Promise((r) => setTimeout(r, 50));
            const wu3 = window.__webextMock.getCalls('windows.update');

            // Switch back to sidebar, clear companion windows, make sidebarAction.open reject -> fallback to windows.create
            window.FoxHubBg.companionWindowIds.clear();
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { contextMenuOpenBehavior: 'sidebar' } });
            browser.sidebarAction.open = () => Promise.reject(new Error('No user gesture'));
            window.__webextMock.clearCalls();
            window.__webextMock.contextMenus.triggerClick(
              { menuItemId: 'foxhub-open-page', pageUrl: 'https://fallback.example.com/' },
              { id: 1, url: 'https://fallback.example.com/' }
            );
            await new Promise((r) => setTimeout(r, 60));
            const wc4 = window.__webextMock.getCalls('windows.create');

            return { sb1, wc1, wc2Calls, wu3, wc4 };
            """
        )
        self.assertGreaterEqual(res["sb1"], 1)
        self.assertEqual(res["wc1"], 0)
        self.assertGreaterEqual(len(res["wc2Calls"]), 1)
        win_url = res["wc2Calls"][0]["args"][0].get("url", "")
        self.assertIn("src/popup/popup.html?popout=1&url=", win_url)
        self.assertGreaterEqual(len(res["wu3"]), 1)
        self.assertTrue(res["wu3"][0]["args"][1].get("focused"))
        self.assertGreaterEqual(len(res["wc4"]), 1, "Rejected sidebarAction.open with closed sidebar must fall back to popout window")
        self._assert_no_js_errors("test_t2_f11_open_behavior_sidebar_vs_popout_and_closed_sidebar_fallback")

    def test_t2_f11_rapid_successive_context_menu_updates_overwrite_cleanly(self) -> None:
        self._boot_background_offline(_default_settings(contextMenuEnabled=True))
        res = self.fx.eval_async_js(
            """
            window.__webextMock.clearCalls();
            for (let i = 1; i <= 5; i++) {
              window.__webextMock.contextMenus.triggerClick(
                { menuItemId: 'foxhub-open-link', linkUrl: 'https://site' + i + '.test/' + i },
                { id: 1, url: 'https://host.test/' }
              );
            }
            await new Promise((r) => setTimeout(r, 40));
            const latestBeforeConsume = window.__pmGetSyncBootState().pendingContextUrl;
            const bcasts = window.__webextMock.getCalls('runtime.sendMessage')
              .map((c) => c.args && c.args[0])
              .filter((m) => m && m.type === 'OPEN_URL_IN_SIDEBAR' && m.fromBackground);
            const c1 = window.__pmConsumePendingContextUrl();
            const c2 = window.__pmConsumePendingContextUrl();

            // Valid click followed by unsafe click must not clobber valid pendingContextUrl
            window.__webextMock.contextMenus.triggerClick(
              { menuItemId: 'foxhub-open-link', linkUrl: 'https://site5.test/5' },
              { id: 1, url: 'https://host.test/' }
            );
            window.__webextMock.contextMenus.triggerClick(
              { menuItemId: 'foxhub-open-link', linkUrl: 'javascript:void(0)' },
              { id: 1, url: 'https://host.test/' }
            );
            const afterUnsafe = window.__pmGetSyncBootState().pendingContextUrl;

            return { latestBeforeConsume, lastBcast: bcasts[bcasts.length - 1], c1, c2, afterUnsafe };
            """
        )
        self.assertEqual(res["latestBeforeConsume"]["url"], "https://site5.test/5")
        self.assertEqual(res["lastBcast"]["url"], "https://site5.test/5")
        self.assertEqual(res["c1"]["url"], "https://site5.test/5")
        self.assertIsNone(res["c2"])
        self.assertEqual(res["afterUnsafe"]["url"], "https://site5.test/5")
        self._assert_no_js_errors("test_t2_f11_rapid_successive_context_menu_updates_overwrite_cleanly")

    def test_t2_f11_link_vs_page_url_precedence_tab_fallback_and_unknown_menu_id(self) -> None:
        self._boot_background_offline(_default_settings(contextMenuEnabled=True))
        res = self.fx.eval_async_js(
            """
            // A: foxhub-open-link prefers linkUrl over pageUrl
            window.__webextMock.contextMenus.triggerClick(
              { menuItemId: 'foxhub-open-link', linkUrl: 'https://link.test/a', pageUrl: 'https://page.test/b' },
              { id: 9, url: 'https://tab.test/c' }
            );
            const a = window.__pmConsumePendingContextUrl();

            // B: unsafe linkUrl must NOT fall back to safe pageUrl
            window.__webextMock.contextMenus.triggerClick(
              { menuItemId: 'foxhub-open-link', linkUrl: 'javascript:1', pageUrl: 'https://page.test/b' },
              { id: 9, url: 'https://tab.test/c' }
            );
            const b = window.__pmGetSyncBootState().pendingContextUrl;

            // C: foxhub-open-page without pageUrl falls back to tab.url
            window.__webextMock.contextMenus.triggerClick(
              { menuItemId: 'foxhub-open-page' },
              { id: 9, url: 'https://tab.test/p' }
            );
            const c = window.__pmConsumePendingContextUrl();

            // D: unknown menuItemId ignored
            window.__webextMock.contextMenus.triggerClick(
              { menuItemId: 'other-ext', linkUrl: 'https://other.test/' },
              { id: 9, url: 'https://tab.test/p' }
            );
            const d = window.__pmGetSyncBootState().pendingContextUrl;

            return { a, b, c, d };
            """
        )
        self.assertEqual(res["a"]["url"], "https://link.test/a")
        self.assertIsNone(res["b"])
        self.assertEqual(res["c"]["url"], "https://tab.test/p")
        self.assertIsNone(res["d"])
        self._assert_no_js_errors("test_t2_f11_link_vs_page_url_precedence_tab_fallback_and_unknown_menu_id")

    # ==================================================================
    # F12: Pro Controls for Custom Websites (6 tests)
    # ==================================================================

    def test_t2_f12_rejects_invalid_and_unsafe_custom_app_urls(self) -> None:
        # Part A: Schema & MediaApps catalog validation
        url = self.server.register_fixture(
            "t2_f12_schema_url.html",
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            "<script src='/src/shared/media-apps.js'></script>"
            "<script src='/src/shared/settings-schema.js'></script>"
            "</head><body></body></html>",
        )
        self.fx.navigate(url)
        self._install_error_trap()
        part_a = self.fx.eval_js(
            """
            const badUrls = ['javascript:alert(1)', 'file:///C:/a', 'data:text/html,1', 'about:blank', '', '   ', 'example.com', 'not a url'];
            const normApps = window.FoxHubSettingsSchema.normalizeSettings({
              customMediaApps: badUrls.map((u, i) => ({ id: 'bad-' + i, name: 'Bad', url: u, color: '#112233' }))
            }).customMediaApps;
            const mapped = window.FoxHubMediaApps.mapCustomApps({
              customMediaApps: badUrls.map((u, i) => ({ id: 'bad-' + i, name: 'Bad', url: u, color: '#112233' }))
            });
            const impResults = badUrls.map((u) =>
              window.FoxHubSettingsSchema.validateImportPayload({
                customMediaApps: [{ id: 'bad', name: 'Bad', url: u, color: '#112233', enabled: true, userAgentMode: 'default' }]
              }).ok
            );
            return { normCount: normApps.length, mappedCount: mapped.length, impResults };
            """
        )
        self.assertEqual(part_a["normCount"], 0, "normalizeSettings must drop unsafe/invalid customMediaApps URLs")
        self.assertEqual(part_a["mappedCount"], 0, "mapCustomApps must reject unsafe/invalid URLs")
        self.assertFalse(any(part_a["impResults"]), f"validateImportPayload must reject every bad URL: {part_a['impResults']}")
        self._assert_no_js_errors("test_t2_f12_rejects_invalid_urls_partA")

        # Part B: UI Add & Pro Edit modal rejection
        self.fx.reset_to_blank()
        self._open_bridged_app(
            settings=_default_settings(
                customMediaApps=[
                    {"id": "custom-1", "name": "ValidApp", "url": "https://valid.example.test/", "color": "#112233", "enabled": True, "userAgentMode": "default"}
                ]
            )
        )
        self._open_settings_inside_bridged_popup()
        part_b = self.fx.eval_async_js(
            """
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const appsTab = Array.from(uiDoc.querySelectorAll('[role="tab"], [data-category], [data-settings-tab], .fh-settings-nav button'))
              .find((t) => /apps/i.test(t.textContent || t.getAttribute('data-category') || ''));
            if (appsTab) { appsTab.click(); await new Promise((r) => setTimeout(r, 60)); }

            const nameIn = uiDoc.getElementById('input-custom-app-name') || uiDoc.getElementById('pm-custom-app-name') || uiDoc.querySelector('input[data-custom-add-name]');
            const urlIn = uiDoc.getElementById('input-custom-app-url') || uiDoc.getElementById('pm-custom-app-url') || uiDoc.querySelector('input[data-custom-add-url]');
            const addBtn = uiDoc.getElementById('btn-add-custom-app') || uiDoc.getElementById('pm-custom-app-add-btn') || uiDoc.querySelector('button[data-custom-add-submit]');
            if (!nameIn || !urlIn || !addBtn) return { hasAddForm: false };

            for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', '', 'not a url']) {
              nameIn.value = 'BadTest';
              urlIn.value = bad;
              urlIn.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
              addBtn.click();
              await new Promise((r) => setTimeout(r, 40));
            }
            const afterAdd = (await browser.storage.local.get('settings')).settings.customMediaApps || [];

            // Also verify Pro Edit modal exists and rejects invalid URL edit
            const editBtn = Array.from(uiDoc.querySelectorAll('#pm-custom-apps-list button, [data-custom-apps] button'))
              .find((b) => /^edit$/i.test((b.textContent || b.getAttribute('aria-label') || '').trim()));
            if (!editBtn) return { hasAddForm: true, hasEditBtn: false, afterAdd };
            editBtn.click();
            await new Promise((r) => setTimeout(r, 80));
            const modal = Array.from(uiDoc.querySelectorAll('[role="dialog"], .pm-modal, .fh-modal'))
              .find((el) => !el.classList.contains('hidden') && el.getBoundingClientRect().width > 0);
            if (!modal) return { hasAddForm: true, hasEditBtn: true, hasModal: false, afterAdd };
            const mUrl = modal.querySelector('input[type="url"], input[name="url"], [data-field="url"]');
            const saveBtn = Array.from(modal.querySelectorAll('button')).find((b) => /save|apply|update/i.test(b.textContent || ''));
            if (!mUrl || !saveBtn) return { hasAddForm: true, hasEditBtn: true, hasModal: true, hasFields: false, afterAdd };
            mUrl.value = 'javascript:alert(9)';
            mUrl.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
            saveBtn.click();
            await new Promise((r) => setTimeout(r, 80));
            const afterEdit = (await browser.storage.local.get('settings')).settings.customMediaApps || [];
            return { hasAddForm: true, hasEditBtn: true, hasModal: true, hasFields: true, afterAdd, afterEdit };
            """
        )
        self.assertTrue(part_b.get("hasAddForm"), f"Custom app add form missing: {part_b}")
        self.assertEqual(len(part_b["afterAdd"]), 1, f"Unsafe URLs must not be added/coerced into customMediaApps: {part_b['afterAdd']}")
        self.assertTrue(part_b.get("hasEditBtn"), "Pro Edit button missing on custom app row")
        self.assertTrue(part_b.get("hasModal"), "Pro Edit modal did not open")
        self.assertTrue(part_b.get("hasFields"), "Pro Edit modal missing URL/Save controls")
        self.assertEqual(part_b["afterEdit"][0]["url"], "https://valid.example.test/", "Unsafe edit must not overwrite valid stored URL")
        self._assert_no_bridge_errors("test_t2_f12_rejects_invalid_urls_partB")

    def test_t2_f12_empty_whitespace_overlong_name_and_invalid_hex_color_validation(self) -> None:
        url = self.server.register_fixture(
            "t2_f12_schema_name_color.html",
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            "<script src='/src/shared/media-apps.js'></script>"
            "<script src='/src/shared/settings-schema.js'></script>"
            "</head><body></body></html>",
        )
        self.fx.navigate(url)
        self._install_error_trap()
        part_a = self.fx.eval_js(
            """
            const S = window.FoxHubSettingsSchema;
            const longName = 'A'.repeat(120);
            const normEmpty = S.normalizeSettings({ customMediaApps: [{ id: 'c1', name: '', url: 'https://a.test/' }] }).customMediaApps[0];
            const normWs = S.normalizeSettings({ customMediaApps: [{ id: 'c2', name: '  \\t ', url: 'https://b.test/' }] }).customMediaApps[0];
            const normLong = S.normalizeSettings({ customMediaApps: [{ id: 'c3', name: longName, url: 'https://c.test/' }] }).customMediaApps[0];
            const badColors = ['red', '#12', '#GGGGGG', 'rgb(0,0,0)', '#112233;color:red'];
            const normColors = badColors.map((col) => S.normalizeSettings({ customMediaApps: [{ id: 'c', name: 'X', url: 'https://x.test/', color: col }] }).customMediaApps[0].color);
            const impColors = badColors.map((col) => S.validateImportPayload({ customMediaApps: [{ id: 'c', name: 'X', url: 'https://x.test/', color: col }] }).ok);
            const mappedEmpty = window.FoxHubMediaApps.mapCustomApps({
              customMediaApps: [{ id: 'm1', name: '', url: 'https://m.test/', color: 'not-hex' }]
            })[0];
            return { normEmpty, normWs, normLongLen: normLong.name.length, normColors, impColors, mappedEmpty };
            """
        )
        self.assertEqual(part_a["normEmpty"]["name"], "Custom App")
        self.assertEqual(part_a["normWs"]["name"], "Custom App")
        self.assertLessEqual(part_a["normLongLen"], 60)
        for col in part_a["normColors"]:
            self.assertRegex(col, re.compile(r"^#[0-9a-f]{3,8}$", re.IGNORECASE))
        self.assertFalse(any(part_a["impColors"]), "validateImportPayload must reject invalid hex colors")
        self.assertEqual(part_a["mappedEmpty"]["name"], "Custom App")
        self.assertRegex(part_a["mappedEmpty"]["color"], re.compile(r"^#[0-9a-f]{6}$", re.IGNORECASE))
        self._assert_no_js_errors("test_t2_f12_name_color_partA")

        # Part B: Pro Edit modal UI
        self.fx.reset_to_blank()
        self._open_bridged_app(
            settings=_default_settings(
                customMediaApps=[
                    {"id": "custom-1", "name": "OrigName", "url": "https://orig.example.test/", "color": "#112233", "enabled": True, "userAgentMode": "default"}
                ]
            )
        )
        self._open_settings_inside_bridged_popup()
        part_b = self.fx.eval_async_js(
            """
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const appsTab = Array.from(uiDoc.querySelectorAll('[role="tab"], [data-category], [data-settings-tab], .fh-settings-nav button'))
              .find((t) => /apps/i.test(t.textContent || t.getAttribute('data-category') || ''));
            if (appsTab) { appsTab.click(); await new Promise((r) => setTimeout(r, 60)); }
            const editBtn = Array.from(uiDoc.querySelectorAll('#pm-custom-apps-list button, [data-custom-apps] button'))
              .find((b) => /^edit$/i.test((b.textContent || b.getAttribute('aria-label') || '').trim()));
            if (!editBtn) return { hasEditBtn: false };
            editBtn.click();
            await new Promise((r) => setTimeout(r, 80));
            const modal = Array.from(uiDoc.querySelectorAll('[role="dialog"], .pm-modal, .fh-modal'))
              .find((el) => !el.classList.contains('hidden') && el.getBoundingClientRect().width > 0);
            if (!modal) return { hasEditBtn: true, hasModal: false };

            const nameEl = modal.querySelector('input[name="name"], [data-field="name"], input[type="text"]');
            const colorEl = modal.querySelector('input[type="color"], input[name="color"], [data-field="color"]');
            const saveBtn = Array.from(modal.querySelectorAll('button')).find((b) => /save|apply|update/i.test(b.textContent || ''));
            if (!nameEl || !colorEl || !saveBtn) return { hasEditBtn: true, hasModal: true, hasFields: false };

            nameEl.value = '   ';
            nameEl.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
            colorEl.value = '#aa44bb';
            colorEl.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
            saveBtn.click();
            await new Promise((r) => setTimeout(r, 80));
            const saved = (await browser.storage.local.get('settings')).settings.customMediaApps[0];
            return { hasEditBtn: true, hasModal: true, hasFields: true, saved };
            """
        )
        self.assertTrue(part_b.get("hasEditBtn"), "Pro Edit button missing")
        self.assertTrue(part_b.get("hasModal"), "Pro Edit modal missing")
        self.assertTrue(part_b.get("hasFields"), "Pro Edit modal missing name/color/save fields")
        self.assertTrue(bool(part_b["saved"]["name"].strip()), f"Whitespace-only name must not be saved: {part_b['saved']}")
        self._assert_no_bridge_errors("test_t2_f12_name_color_partB")

    def test_t2_f12_webrequest_ua_override_scoped_exclusively_to_foxhub_frames(self) -> None:
        custom_apps = [
            {"id": "c-mob", "name": "Mob", "url": "https://app-mob.example.test/home", "color": "#111111", "enabled": True, "userAgentMode": "mobile"},
            {"id": "c-desk", "name": "Desk", "url": "https://app-desk.example.test/", "color": "#222222", "enabled": True, "userAgentMode": "desktop"},
            {"id": "c-def", "name": "Def", "url": "https://app-def.example.test/", "color": "#333333", "enabled": True, "userAgentMode": "default"},
            {"id": "c-dis", "name": "Dis", "url": "https://app-dis.example.test/", "color": "#444444", "enabled": False, "userAgentMode": "mobile"},
        ]
        self._boot_background_offline(_default_settings(customMediaApps=custom_apps))
        res = self.fx.eval_async_js(
            """
            const extOrigin = new URL(browser.runtime.getURL('')).origin;
            const callH = (url, headers, type, tabId, originUrl) =>
              window.__webextMock.webRequest.triggerBeforeSendHeaders({
                url,
                type: type || 'sub_frame',
                tabId,
                originUrl,
                requestHeaders: headers
              });
            const uaOf = (r) => (r.requestHeaders.find((h) => h.name.toLowerCase() === 'user-agent') || {}).value || '';

            const mobSub = await callH('https://m.app-mob.example.test/feed', [{ name: 'User-Agent', value: 'OrigUA' }], 'sub_frame', -1, extOrigin + '/src/popup/popup.html');
            const mobEmpty = await callH('https://app-mob.example.test/api', [], 'xmlhttprequest', -1, extOrigin + '/src/popup/popup.html');
            const deskSub = await callH('https://app-desk.example.test/', [{ name: 'User-Agent', value: 'OrigUA' }], 'sub_frame', -1, extOrigin + '/src/popup/popup.html');
            const defSub = await callH('https://app-def.example.test/', [{ name: 'User-Agent', value: 'OrigUA' }], 'sub_frame', -1, extOrigin + '/src/popup/popup.html');
            const disSub = await callH('https://app-dis.example.test/', [{ name: 'User-Agent', value: 'OrigUA' }], 'sub_frame', -1, extOrigin + '/src/popup/popup.html');

            // Companion window
            await browser.runtime.sendMessage({ type: 'OPEN_COMPANION_WINDOW', url: 'https://app-mob.example.test/home', title: 'Mob' });
            const compWin = window.__webextMock.windows.dump().slice(-1)[0];
            const compTabId = compWin && compWin.tabs && compWin.tabs[0] ? compWin.tabs[0].id : 999;
            const compRes = await callH('https://app-mob.example.test/home', [{ name: 'User-Agent', value: 'OrigUA' }], 'sub_frame', compTabId, extOrigin + '/src/popup/popup.html');

            // Normal tabs MUST remain untouched
            const normalMain = await callH('https://app-mob.example.test/', [{ name: 'User-Agent', value: 'OrigUA' }], 'main_frame', 5, 'https://app-mob.example.test/');
            const normalSub = await callH('https://app-mob.example.test/embed', [{ name: 'User-Agent', value: 'OrigUA' }], 'sub_frame', 5, 'https://app-mob.example.test/');

            return {
              mobUa: uaOf(mobSub),
              mobEmptyUa: uaOf(mobEmpty),
              deskUa: uaOf(deskSub),
              defUa: uaOf(defSub),
              disUa: uaOf(disSub),
              compUa: uaOf(compRes),
              normalMainUa: uaOf(normalMain),
              normalSubUa: uaOf(normalSub)
            };
            """
        )
        self.assertIn("Android 14; Mobile", res["mobUa"])
        self.assertIn("Android 14; Mobile", res["mobEmptyUa"])
        self.assertIn("Windows NT 10.0; Win64; x64", res["deskUa"])
        self.assertEqual(res["defUa"], "OrigUA")
        self.assertEqual(res["disUa"], "OrigUA")
        self.assertIn("Android 14; Mobile", res["compUa"])
        self.assertEqual(res["normalMainUa"], "OrigUA")
        self.assertEqual(res["normalSubUa"], "OrigUA")
        self._assert_no_js_errors("test_t2_f12_webrequest_ua_override_scoped_exclusively_to_foxhub_frames")

    def test_t2_f12_custom_icon_url_and_upload_validation_vs_safe_data_image(self) -> None:
        url = self.server.register_fixture(
            "t2_f12_schema_icon.html",
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            "<script src='/src/shared/media-apps.js'></script>"
            "<script src='/src/shared/settings-schema.js'></script>"
            "</head><body></body></html>",
        )
        self.fx.navigate(url)
        self._install_error_trap()
        part_a = self.fx.eval_js(
            """
            const S = window.FoxHubSettingsSchema;
            const badIcons = [
              'javascript:alert(1)',
              'data:text/html,<script>1<\\/script>',
              'data:text/javascript,1',
              'file:///icon.png',
              'data:image/png;base64,' + 'A'.repeat(8 * 1024 * 1024 + 32)
            ];
            const goodIcons = [
              'https://cdn.example.test/icon.png',
              'data:image/png;base64,iVBORw0KGgo=',
              'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>'
            ];
            const impBad = badIcons.map((ic) => S.validateImportPayload({ customMediaApps: [{ id: 'c', name: 'X', url: 'https://x.test/', iconUrl: ic }] }).ok);
            const impGood = goodIcons.map((ic) => S.validateImportPayload({ customMediaApps: [{ id: 'c', name: 'X', url: 'https://x.test/', iconUrl: ic }] }).ok);
            const mappedBad = window.FoxHubMediaApps.mapCustomApps({
              customMediaApps: badIcons.map((ic, i) => ({ id: 'b' + i, name: 'B', url: 'https://b.test/', iconUrl: ic }))
            });
            const iconEl = window.FoxHubMediaApps.createAppSvgIcon('g1', 20, [{ id: 'g1', name: 'G', url: 'https://g.test/', iconUrl: 'https://cdn.example.test/icon.png' }]);
            return {
              impBad,
              impGood,
              badSavedIcons: mappedBad.map((a) => a.iconUrl),
              iconImgSrc: iconEl && iconEl.querySelector('img') ? iconEl.querySelector('img').src : ''
            };
            """
        )
        self.assertFalse(any(part_a["impBad"]), f"Unsafe/oversized icons must fail import validation: {part_a['impBad']}")
        self.assertTrue(all(part_a["impGood"]), f"Valid icons failed import validation: {part_a['impGood']}")
        self.assertTrue(all(v == "" for v in part_a["badSavedIcons"]), f"Unsafe icons leaked through mapCustomApps: {part_a['badSavedIcons']}")
        self.assertEqual(part_a["iconImgSrc"], "https://cdn.example.test/icon.png")
        self._assert_no_js_errors("test_t2_f12_icon_partA")

        # Part B: UI Pro Edit modal iconUrl & file upload validation
        self.fx.reset_to_blank()
        self._open_bridged_app(
            settings=_default_settings(
                customMediaApps=[
                    {
                        "id": "custom-1",
                        "name": "IconApp",
                        "url": "https://icon.example.test/",
                        "iconUrl": "https://icon.example.test/initial.png",
                        "color": "#112233",
                        "enabled": True,
                        "userAgentMode": "default",
                    }
                ]
            )
        )
        self._open_settings_inside_bridged_popup()
        part_b = self.fx.eval_async_js(
            """
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const appsTab = Array.from(uiDoc.querySelectorAll('[role="tab"], [data-category], [data-settings-tab], .fh-settings-nav button'))
              .find((t) => /apps/i.test(t.textContent || t.getAttribute('data-category') || ''));
            if (appsTab) { appsTab.click(); await new Promise((r) => setTimeout(r, 60)); }
            const openEditModal = async () => {
              const editBtn = Array.from(uiDoc.querySelectorAll('#pm-custom-apps-list button, [data-custom-apps] button'))
                .find((b) => /^edit$/i.test((b.textContent || b.getAttribute('aria-label') || '').trim()));
              if (!editBtn) return null;
              editBtn.click();
              await new Promise((r) => setTimeout(r, 80));
              const modal = Array.from(uiDoc.querySelectorAll('[role="dialog"], .pm-modal, .fh-modal'))
                .find((el) => !el.classList.contains('hidden') && el.getBoundingClientRect().width > 0);
              if (!modal) return { modal: null };
              const iconIn = modal.querySelector('input[name="iconUrl"], [data-field="iconUrl"], input[placeholder*="icon" i]');
              const fileIn = modal.querySelector('input[type="file"]');
              const saveBtn = Array.from(modal.querySelectorAll('button')).find((b) => /save|apply|update/i.test(b.textContent || ''));
              return { modal, iconIn, fileIn, saveBtn };
            };
            let ctx = await openEditModal();
            if (!ctx) return { hasEditBtn: false };
            if (!ctx.modal) return { hasEditBtn: true, hasModal: false };
            if (!ctx.iconIn || !ctx.saveBtn) return { hasEditBtn: true, hasModal: true, hasFields: false };

            ctx.iconIn.value = 'javascript:alert(1)';
            ctx.iconIn.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
            ctx.saveBtn.click();
            await new Promise((r) => setTimeout(r, 80));
            const afterJs = (await browser.storage.local.get('settings')).settings.customMediaApps[0].iconUrl || '';

            if (!ctx.modal.isConnected) {
              ctx = await openEditModal();
            }
            if (ctx && ctx.fileIn) {
              const dt = new uiWin.DataTransfer();
              dt.items.add(new uiWin.File(['<h1>bad</h1>'], 'bad.html', { type: 'text/html' }));
              ctx.fileIn.files = dt.files;
              ctx.fileIn.dispatchEvent(new uiWin.Event('change', { bubbles: true }));
              await new Promise((r) => setTimeout(r, 80));
            }

            if (ctx && ctx.iconIn && ctx.saveBtn) {
              ctx.iconIn.value = 'data:image/png;base64,iVBORw0KGgo=';
              ctx.iconIn.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
              ctx.saveBtn.click();
              await new Promise((r) => setTimeout(r, 80));
            }
            const afterGood = (await browser.storage.local.get('settings')).settings.customMediaApps[0].iconUrl || '';

            return { hasEditBtn: true, hasModal: true, hasFields: true, afterJs, afterGood };
            """
        )
        self.assertTrue(part_b.get("hasEditBtn"), "Pro Edit button missing")
        self.assertTrue(part_b.get("hasModal"), "Pro Edit modal missing")
        self.assertTrue(part_b.get("hasFields"), "Pro Edit modal missing iconUrl/Save fields")
        self.assertFalse(
            part_b["afterJs"].strip().lower().startswith(("javascript:", "data:text/html", "vbscript:", "file:")),
            f"Unsafe javascript: iconUrl must not be saved, got: {part_b['afterJs']!r}",
        )
        self.assertEqual(part_b["afterGood"], "data:image/png;base64,iVBORw0KGgo=")
        self._assert_no_bridge_errors("test_t2_f12_icon_partB")

    def test_t2_f12_editing_custom_app_preserves_id_and_updates_rail_without_duplication(self) -> None:
        icon_url = self.server.url_for("/icons/icon-48.png")
        self._open_bridged_app(
            settings=_default_settings(
                customMediaApps=[
                    {"id": "custom-one", "name": "Alpha", "url": "https://alpha.example.test/", "color": "#111111", "enabled": True, "userAgentMode": "default"},
                    {"id": "custom-two", "name": "Beta", "url": "https://beta.example.test/", "color": "#222222", "enabled": True, "userAgentMode": "desktop"},
                ]
            )
        )
        self._open_settings_inside_bridged_popup()
        res = self.fx.eval_async_js(
            r"""
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const appsTab = Array.from(uiDoc.querySelectorAll('[role="tab"], [data-category], [data-settings-tab], .fh-settings-nav button'))
              .find((t) => /apps/i.test(t.textContent || t.getAttribute('data-category') || ''));
            if (appsTab) { appsTab.click(); await new Promise((r) => setTimeout(r, 60)); }
            const editBtns = Array.from(uiDoc.querySelectorAll('#pm-custom-apps-list button, [data-custom-apps] button'))
              .filter((b) => /^edit$/i.test((b.textContent || b.getAttribute('aria-label') || '').trim()));
            if (editBtns.length < 1) return { hasEditBtn: false };
            editBtns[0].click();
            await new Promise((r) => setTimeout(r, 80));
            const modal = Array.from(uiDoc.querySelectorAll('[role="dialog"], .pm-modal, .fh-modal'))
              .find((el) => !el.classList.contains('hidden') && el.getBoundingClientRect().width > 0);
            if (!modal) return { hasEditBtn: true, hasModal: false };

            const nameIn = modal.querySelector('input[name="name"], [data-field="name"], input[type="text"]');
            const colorIn = modal.querySelector('input[type="color"], input[name="color"], [data-field="color"]');
            const iconIn = modal.querySelector('input[name="iconUrl"], [data-field="iconUrl"], input[placeholder*="icon" i]');
            const uaSel = modal.querySelector('select[name="userAgentMode"], select[data-field="userAgentMode"], select');
            const uaMobileBtn = modal.querySelector('[data-ua-mode="mobile"]');
            const saveBtn = Array.from(modal.querySelectorAll('button')).find((b) => /save|apply|update/i.test(b.textContent || ''));
            if (!nameIn || !colorIn || !iconIn || (!uaSel && !uaMobileBtn) || !saveBtn) return { hasEditBtn: true, hasModal: true, hasFields: false };

            nameIn.value = 'Alpha Pro';
            nameIn.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
            colorIn.value = '#0ea5e9';
            colorIn.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
            iconIn.value = arguments[0];
            iconIn.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
            if (uaSel) {
              uaSel.value = 'mobile';
              uaSel.dispatchEvent(new uiWin.Event('change', { bubbles: true }));
            } else if (uaMobileBtn) {
              uaMobileBtn.click();
            }
            saveBtn.click();
            await new Promise((r) => setTimeout(r, 120));

            const customApps = (await browser.storage.local.get('settings')).settings.customMediaApps || [];
            const railAlphaCount = Array.from(uiDoc.querySelectorAll('#pm-rail-apps-list [data-app-id]'))
              .filter((el) => el.getAttribute('data-app-id') === 'custom-one').length;
            const railAlphaMeta = (uiDoc.querySelector('#pm-rail-apps-list [data-app-id="custom-one"]')?.getAttribute('title') || '') +
              ' ' + (uiDoc.querySelector('#pm-rail-apps-list [data-app-id="custom-one"]')?.getAttribute('aria-label') || '');

            const extOrigin = new URL(browser.runtime.getURL('')).origin;
            const wr = await window.__webextMock.webRequest.triggerBeforeSendHeaders({
              url: 'https://alpha.example.test/page',
              type: 'sub_frame',
              tabId: -1,
              originUrl: extOrigin + '/src/popup/popup.html',
              requestHeaders: [{ name: 'User-Agent', value: 'OrigUA' }]
            });
            const ua = (wr.requestHeaders.find((h) => h.name.toLowerCase() === 'user-agent') || {}).value || '';

            return { hasEditBtn: true, hasModal: true, hasFields: true, customApps, railAlphaCount, railAlphaMeta, ua };
            """,
            icon_url,
        )
        self.assertTrue(res.get("hasEditBtn"), "Pro Edit button missing")
        self.assertTrue(res.get("hasModal"), "Pro Edit modal missing")
        self.assertTrue(res.get("hasFields"), "Pro Edit modal missing fields")
        apps = res["customApps"]
        self.assertEqual(len(apps), 2)
        self.assertEqual(apps[0]["id"], "custom-one")
        self.assertEqual(apps[0]["name"], "Alpha Pro")
        self.assertEqual(apps[0]["color"].lower(), "#0ea5e9")
        self.assertEqual(apps[0]["iconUrl"], icon_url)
        self.assertEqual(apps[0]["userAgentMode"], "mobile")
        self.assertEqual(apps[1]["id"], "custom-two")
        self.assertEqual(apps[1]["name"], "Beta")
        self.assertEqual(res["railAlphaCount"], 1, "Editing custom app must update rail in-place without duplication")
        self.assertIn("Alpha Pro", res["railAlphaMeta"])
        self.assertIn("Android 14; Mobile", res["ua"])
        self._assert_no_bridge_errors("test_t2_f12_editing_custom_app_preserves_id_and_updates_rail_without_duplication")

    def test_t2_f12_deleting_custom_app_clears_ua_override_rail_and_escapes_xss_name(self) -> None:
        xss_name = '<img src=x onerror=window.__xssCustom=1> & "App"'
        self._open_bridged_app(
            settings=_default_settings(
                customMediaApps=[
                    {"id": "custom-xss", "name": xss_name, "url": "https://xss.example.test/", "color": "#333333", "enabled": True, "userAgentMode": "default"},
                    {"id": "custom-del", "name": "DeleteMe", "url": "https://del.example.test/", "color": "#444444", "enabled": True, "userAgentMode": "mobile"},
                ]
            )
        )
        self._open_settings_inside_bridged_popup()
        res = self.fx.eval_async_js(
            r"""
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const appsTab = Array.from(uiDoc.querySelectorAll('[role="tab"], [data-category], [data-settings-tab], .fh-settings-nav button'))
              .find((t) => /apps/i.test(t.textContent || t.getAttribute('data-category') || ''));
            if (appsTab) { appsTab.click(); await new Promise((r) => setTimeout(r, 60)); }
            const xssTop = window.__xssCustom ?? null;
            const xssUi = uiWin.__xssCustom ?? null;
            const badImgs = uiDoc.querySelectorAll('img[src="x"], img[onerror]').length;

            // Find Delete/Remove button for custom-del
            const delRow = Array.from(uiDoc.querySelectorAll('#pm-custom-apps-list > *, [data-custom-app-id="custom-del"], [data-custom-apps] > *'))
              .find((el) => (el.textContent || '').includes('DeleteMe') || el.getAttribute('data-custom-app-id') === 'custom-del');
            if (!delRow) return { hasRow: false, xssTop, xssUi, badImgs };
            const delBtn = Array.from(delRow.querySelectorAll('button')).find((b) => /remove|delete/i.test(b.textContent || b.getAttribute('aria-label') || ''));
            if (!delBtn) return { hasRow: true, hasDelBtn: false, xssTop, xssUi, badImgs };
            delBtn.click();
            await new Promise((r) => setTimeout(r, 120));

            const remaining = (await browser.storage.local.get('settings')).settings.customMediaApps || [];
            const railHasDel = Boolean(uiDoc.querySelector('#pm-rail-apps-list [data-app-id="custom-del"]'));

            const extOrigin = new URL(browser.runtime.getURL('')).origin;
            const wr = await window.__webextMock.webRequest.triggerBeforeSendHeaders({
              url: 'https://del.example.test/page',
              type: 'sub_frame',
              tabId: -1,
              originUrl: extOrigin + '/src/popup/popup.html',
              requestHeaders: [{ name: 'User-Agent', value: 'OrigUA' }]
            });
            const ua = (wr.requestHeaders.find((h) => h.name.toLowerCase() === 'user-agent') || {}).value || '';
            return { hasRow: true, hasDelBtn: true, xssTop, xssUi, badImgs, remaining, railHasDel, ua };
            """
        )
        self.assertIsNone(res["xssTop"])
        self.assertIsNone(res["xssUi"])
        self.assertEqual(res["badImgs"], 0)
        self.assertTrue(res.get("hasRow") and res.get("hasDelBtn"), f"Missing custom app row or delete button: {res}")
        self.assertEqual([a["id"] for a in res["remaining"]], ["custom-xss"])
        self.assertFalse(res["railHasDel"], "Deleted custom app must be removed from left rail")
        self.assertEqual(res["ua"], "OrigUA", "Deleted custom app must no longer override User-Agent")
        self._assert_no_bridge_errors("test_t2_f12_deleting_custom_app_clears_ua_override_rail_and_escapes_xss_name")

    # ==================================================================
    # F13: Expanded Built-In App Presets (+ Gemini preserved) (6 tests)
    # ==================================================================

    def test_t2_f13_fresh_install_default_pinned_and_11_unpinned_hidden(self) -> None:
        self.assertTrue((REPO_ROOT / "src" / "shared" / "media-apps.js").is_file())
        self.assertTrue((REPO_ROOT / "src" / "shared" / "settings-schema.js").is_file())

        self._open_bridged_app("src/popup/popup.html", "?sidebar=1", raw_storage={})
        res = self.fx.eval_js(
            """
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const M = uiWin.FoxHubMediaApps;
            const S = uiWin.FoxHubSettingsSchema;
            const railIds = Array.from(uiDoc.querySelectorAll('#pm-rail-apps-list [data-app-id], #pm-rail-apps-list [data-id]'))
              .map((el) => el.getAttribute('data-app-id') || el.getAttribute('data-id') || '');
            return {
              defEnabled: M.DEFAULT_ENABLED_APP_IDS,
              schemaDefEnabled: S.DEFAULT_SETTINGS.enabledMediaApps,
              allIds: M.BUILTIN_MEDIA_APPS.map((a) => a.id),
              activeEmptyObj: M.getActiveMediaApps({}).map((a) => a.id),
              activeEmptyArr: M.getActiveMediaApps({ enabledMediaApps: [] }).map((a) => a.id),
              activeUnknownPlusClaude: M.getActiveMediaApps({ enabledMediaApps: ['nonexistent-id', 'claude'] }).map((a) => a.id),
              railIds
            };
            """
        )
        self.assertEqual(res["defEnabled"], DEFAULT_PINNED_IDS)
        self.assertEqual(res["schemaDefEnabled"], DEFAULT_PINNED_IDS)
        self.assertEqual(set(res["allIds"]), set(ALL_21_IDS))
        self.assertEqual(res["activeEmptyObj"], DEFAULT_PINNED_IDS)
        self.assertEqual(res["activeEmptyArr"], [])
        self.assertEqual(res["activeUnknownPlusClaude"], ["claude"])
        self.assertEqual(res["railIds"], DEFAULT_PINNED_IDS)
        for uid in UNPINNED_11_IDS:
            self.assertNotIn(uid, res["railIds"], f"Unpinned preset {uid} must be hidden on fresh install")
        self._assert_no_bridge_errors("test_t2_f13_fresh_install_default_pinned_and_11_unpinned_hidden")

    def test_t2_f13_settings_enable_disable_preserves_gemini_and_chatgpt(self) -> None:
        init_apps = DEFAULT_PINNED_IDS + ["gemini", "chatgpt"]
        self._open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=_default_settings(enabledMediaApps=init_apps))
        res = self.fx.eval_async_js(
            """
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const getRailIds = () =>
              Array.from(uiDoc.querySelectorAll('#pm-rail-apps-list [data-app-id]')).map((e) => e.getAttribute('data-app-id'));
            const r0 = getRailIds();

            const step2Apps = r0.concat(['claude', 'soundcloud']);
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { enabledMediaApps: step2Apps } });
            await new Promise((r) => setTimeout(r, 120));
            const r1 = getRailIds();
            const s1 = (await browser.storage.local.get('settings')).settings.enabledMediaApps;

            const step3Apps = step2Apps.filter((id) => id !== 'claude' && id !== 'instagram');
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { enabledMediaApps: step3Apps } });
            await new Promise((r) => setTimeout(r, 120));
            const r2 = getRailIds();
            return { r0, r1, s1, r2 };
            """
        )
        self.assertIn("gemini", res["r0"])
        self.assertIn("chatgpt", res["r0"])
        self.assertEqual(len(res["r1"]), 14)
        self.assertIn("claude", res["r1"])
        self.assertIn("soundcloud", res["r1"])
        self.assertIn("claude", res["s1"])
        self.assertEqual(len(res["r2"]), 12)
        self.assertNotIn("claude", res["r2"])
        self.assertNotIn("instagram", res["r2"])
        self.assertIn("gemini", res["r2"])
        self.assertIn("chatgpt", res["r2"])
        self.assertIn("soundcloud", res["r2"])
        self._assert_no_bridge_errors("test_t2_f13_settings_enable_disable_preserves_gemini_and_chatgpt")

    def test_t2_f13_detect_app_by_url_subdomains_paths_spoofs_and_schemes(self) -> None:
        url = self.server.register_fixture(
            "t2_f13_detect_url.html",
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            "<script src='/src/shared/media-apps.js'></script>"
            "</head><body></body></html>",
        )
        self.fx.navigate(url)
        self._install_error_trap()
        positives = [
            ("https://claude.ai/chat/123?model=sonnet#end", "claude"),
            ("https://console.anthropic.com/workbench", "claude"),
            ("https://claude.ai./", "claude"),
            ("https://www.perplexity.ai/search?q=a%20b", "perplexity"),
            ("https://a-v2.sndcdn.com/track.mp3", "soundcloud"),
            ("https://music.apple.com/us/album/x/1?i=2", "apple-music"),
            ("https://staging.bsky.app/profile/did:plc:1", "bluesky"),
            ("https://team.notion.site/Page-1", "notion"),
            ("http://calendar.google.com/calendar/r/week", "google-calendar"),
            ("https://keep.google.com/#reminders", "google-keep"),
            ("https://gemini.google.com/app?hl=en", "gemini"),
            ("https://platform.openai.com/docs", "chatgpt"),
            ("claude.ai/projects", "claude"),
        ]
        negatives = [
            "https://evil-claude.com/",
            "https://claude.ai.evil.com/",
            "https://notperplexity.ai/",
            "https://mail.google.com/",
            "https://www.google.com/",
            "https://www.apple.com/",
            "https://evil-bsky.app/",
            "https://notion.so.attacker.test/",
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "about:blank",
            "file:///C:/a.html",
            "ftp://claude.ai/",
            "",
            "   ",
            None,
            12345,
        ]
        res = self.fx.eval_js(
            """
            const M = window.FoxHubMediaApps;
            const pos = arguments[0].map(([u]) => {
              const found = M.detectAppByUrl(u, {});
              return found ? found.id : null;
            });
            const neg = arguments[1].map((u) => {
              const found = M.detectAppByUrl(u, {});
              return found ? found.id : null;
            });
            return { pos, neg };
            """,
            positives,
            negatives,
        )
        for (inp, exp), got in zip(positives, res["pos"]):
            self.assertEqual(got, exp, f"detectAppByUrl({inp!r}) returned {got!r}, expected {exp!r}")
        for inp, got in zip(negatives, res["neg"]):
            self.assertIsNone(got, f"detectAppByUrl({inp!r}) must return null, got {got!r}")
        self._assert_no_js_errors("test_t2_f13_detect_app_by_url_subdomains_paths_spoofs_and_schemes")

    def test_t2_f13_all_builtin_svg_icons_createElementNS_zero_innerHTML(self) -> None:
        rep = lint_extension(REPO_ROOT, check_firefox_js=False)
        dom_errs = [
            e
            for e in rep["errors"]
            if e.get("file") == "src/shared/media-apps.js" and e.get("rule", "").startswith(("unsafe_dom", "unsafe_eval"))
        ]
        self.assertEqual(dom_errs, [], f"Static unsafe DOM/eval findings in media-apps.js: {dom_errs}")

        url = self.server.register_fixture(
            "t2_f13_svg_icons.html",
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            "<script src='/src/shared/media-apps.js'></script>"
            "</head><body></body></html>",
        )
        self.fx.navigate(url)
        self._install_error_trap()
        res = self.fx.eval_js(
            """
            const M = window.FoxHubMediaApps;
            const ids = M.BUILTIN_MEDIA_APPS.map((a) => a.id).concat(['foxhub', '__unknown_app__']);
            const out = {};
            for (const id of ids) {
              const svg = M.createAppSvgIcon(id, 22);
              const children = Array.from(svg.children || []);
              const descendants = Array.from(svg.querySelectorAll('*'));
              const badNs = descendants.some((el) => el.namespaceURI !== 'http://www.w3.org/2000/svg');
              const badTag = descendants.some((el) => /^(script|foreignobject)$/i.test(el.tagName));
              const badAttr = descendants.some((el) => Array.from(el.attributes).some((a) => /^on/i.test(a.name)));
              out[id] = {
                tag: svg.tagName.toLowerCase(),
                ns: svg.namespaceURI,
                viewBox: svg.getAttribute('viewBox'),
                width: svg.getAttribute('width'),
                height: svg.getAttribute('height'),
                childTags: children.map((c) => c.tagName.toLowerCase()),
                badNs,
                badTag,
                badAttr
              };
            }
            return out;
            """
        )
        fallback_sig = res["__unknown_app__"]["childTags"]
        self.assertEqual(fallback_sig, ["circle", "line", "path"])
        for app_id in ALL_21_IDS + ["foxhub"]:
            info = res[app_id]
            self.assertEqual(info["tag"], "svg", f"{app_id} icon is not <svg>")
            self.assertEqual(info["ns"], "http://www.w3.org/2000/svg")
            self.assertEqual(info["viewBox"], "0 0 24 24")
            self.assertEqual(info["width"], "22")
            self.assertEqual(info["height"], "22")
            self.assertGreaterEqual(len(info["childTags"]), 1)
            self.assertFalse(info["badNs"] or info["badTag"] or info["badAttr"], f"Unsafe SVG element in {app_id}: {info}")
            if app_id in ALL_21_IDS:
                self.assertNotEqual(info["childTags"], fallback_sig, f"{app_id} fell back to generic globe icon")
        self._assert_no_js_errors("test_t2_f13_all_builtin_svg_icons_createElementNS_zero_innerHTML")

    def test_t2_f13_soundcloud_apple_music_gemini_optimizers_handle_empty_dom(self) -> None:
        required_files = [
            "src/content/core/frame-context.js",
            "src/content/core/lifecycle-router.js",
        ]
        for app_id in ("soundcloud", "apple-music", "gemini"):
            required_files.append(f"src/content/optimizers/{app_id}.js")
            required_files.append(f"src/content/css/{app_id}.css")
        for rel in required_files:
            self.assertTrue((REPO_ROOT / rel).is_file(), f"Missing M2 deliverable: {rel}")

        lint_rep = lint_extension(REPO_ROOT, check_firefox_js=False)
        for app_id in ("soundcloud", "apple-music", "gemini"):
            css_rel = f"src/content/css/{app_id}.css"
            css_text = (REPO_ROOT / css_rel).read_text(encoding="utf-8")
            self.assertGreater(len(css_text.strip()), 0, f"{css_rel} must be non-empty")
            css_errs = [e for e in lint_rep["errors"] if e.get("file") == css_rel]
            self.assertEqual(css_errs, [], f"AMO lint CSS errors in {css_rel}: {css_errs}")

            child_url = self.server.register_fixture(
                f"t2_f13_empty_{app_id}.html",
                f"""<!doctype html><html><head><meta charset='utf-8'>
                <script src='/__test__/mock_seed.js'></script>
                <script src='/__test__/webext_mock.js'></script>
                <script>
                  window.__childErrors = [];
                  window.addEventListener('error', (e) => window.__childErrors.push(String(e.message || 'error')));
                  window.addEventListener('unhandledrejection', (e) => window.__childErrors.push(String(e.reason || 'rejection')));
                </script>
                <script src='/src/shared/media-apps.js'></script>
                <script type='module'>
                  import {{ initFrameContext }} from '/src/content/core/frame-context.js';
                  import {{ initLifecycleRouter }} from '/src/content/core/lifecycle-router.js';
                  import {{ initOptimizer }} from '/src/content/optimizers/{app_id}.js';
                  try {{
                    const ctx = initFrameContext({{
                      cleanWindowName: 'pm-media-frame-{app_id}',
                      isFoxHubMediaFrame: true,
                      isFoxHubContext: true
                    }});
                    const opt = initOptimizer(ctx);
                    initLifecycleRouter(ctx, opt);
                    if (opt && typeof opt.syncDarkDom === 'function') {{
                      opt.syncDarkDom(true);
                      opt.syncDarkDom(false);
                    }}
                    if (opt && typeof opt.isVisuallyPainted === 'function') {{
                      opt.isVisuallyPainted();
                    }}
                  }} catch (err) {{
                    window.__childErrors.push(String(err && err.message ? err.message : err));
                  }} finally {{
                    window.__optReady = true;
                  }}
                </script>
                </head><body><div id='empty-root'></div></body></html>""",
            )
            host_url = self.server.register_fixture(
                f"t2_f13_host_{app_id}.html",
                f"<!doctype html><html><head><meta charset='utf-8'></head><body>"
                f"<iframe id='opt-frame' name='pm-media-frame-{app_id}' src='{child_url}'></iframe>"
                f"</body></html>",
            )
            self.fx.navigate(host_url)
            self._install_error_trap()
            child_errs = self.fx.eval_async_js(
                """
                const f = document.getElementById('opt-frame');
                await new Promise((r) => {
                  if (f.contentDocument && f.contentDocument.readyState === 'complete') return r();
                  f.addEventListener('load', r, { once: true });
                });
                const dl = Date.now() + 2000;
                while (!f.contentWindow.__optReady && Date.now() < dl) {
                  await new Promise((r) => setTimeout(r, 20));
                }
                await new Promise((r) => setTimeout(r, 80));
                f.contentWindow.postMessage({ target: 'pocketmail-media-frame', cmd: 'APPLY_APP_THEME', themeMode: 'true-night' }, '*');
                f.contentWindow.postMessage({ target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' }, '*');
                await new Promise((r) => setTimeout(r, 120));
                return f.contentWindow.__childErrors || [];
                """
            )
            self.assertEqual(child_errs, [], f"Uncaught errors in empty-DOM optimizer for {app_id}: {child_errs}")
            self._assert_no_js_errors(f"test_t2_f13_empty_dom({app_id})")

    def test_t2_f13_fresh_install_settings_ui_lists_all_unpinned_presets_for_toggling(self) -> None:
        self._assert_settings_ui_exists()
        self._open_bridged_app("src/popup/popup.html", "?sidebar=1", raw_storage={})
        self._open_settings_inside_bridged_popup()
        res = self.fx.eval_async_js(
            r"""
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const appsTab = Array.from(uiDoc.querySelectorAll('[role="tab"], [data-category], [data-settings-tab], .fh-settings-nav button'))
              .find((t) => /apps|media/i.test(t.textContent || t.getAttribute('data-category') || ''));
            if (appsTab) {
              appsTab.click();
              await new Promise((r) => setTimeout(r, 60));
            }
            const settingsText = (uiDoc.getElementById('pm-media-apps-drawer') || uiDoc.body).textContent || '';
            const togglePreset = async (id, labelRx) => {
              const direct = uiDoc.querySelector(`[data-app-id="${id}"] input[type="checkbox"], [data-app-toggle="${id}"], [data-setting-key="enabledMediaApps"] [data-app-id="${id}"]`);
              if (direct) {
                direct.click();
                await new Promise((r) => setTimeout(r, 60));
                return true;
              }
              const card = Array.from(uiDoc.querySelectorAll('#pm-media-apps-drawer [data-app-id], #pm-media-apps-drawer label, #pm-media-apps-drawer .fh-app-toggle, #pm-media-apps-drawer .pm-app-toggle-card'))
                .find((el) => labelRx.test(el.textContent || el.getAttribute('data-app-id') || ''));
              if (!card) return false;
              const inp = card.querySelector('input[type="checkbox"], button') || card;
              inp.click();
              await new Promise((r) => setTimeout(r, 60));
              return true;
            };
            const toggledClaude = await togglePreset('claude', /claude/i);
            const toggledKeep = await togglePreset('google-keep', /google\s*keep/i);
            await new Promise((r) => setTimeout(r, 120));
            const stor = (await browser.storage.local.get('settings')).settings.enabledMediaApps || [];
            const claudeRailSvg = Boolean(uiDoc.querySelector('#pm-rail-apps-list [data-app-id="claude"] svg'));
            const keepRailSvg = Boolean(uiDoc.querySelector('#pm-rail-apps-list [data-app-id="google-keep"] svg'));
            return { settingsText, toggledClaude, toggledKeep, stor, claudeRailSvg, keepRailSvg };
            """
        )
        for label in ("Claude", "Perplexity", "SoundCloud", "Apple Music", "Bluesky", "Notion", "Google Calendar", "Google Keep", "Gemini", "ChatGPT", "Twitch"):
            self.assertIn(label.lower(), res["settingsText"].lower(), f"Missing preset '{label}' in Settings UI")
        self.assertTrue(res["toggledClaude"] and res["toggledKeep"], "Failed to toggle Claude / Google Keep in Settings UI")
        self.assertIn("claude", res["stor"])
        self.assertIn("google-keep", res["stor"])
        self.assertTrue(res["claudeRailSvg"])
        self.assertTrue(res["keepRailSvg"])
        self._assert_no_bridge_errors("test_t2_f13_fresh_install_settings_ui_lists_all_unpinned_presets_for_toggling")

    # ==================================================================
    # F14: Settings Backup & Restore (6 tests)
    # ==================================================================

    def test_t2_f14_reject_malformed_truncated_empty_and_non_object_json(self) -> None:
        self._boot_background_offline(_default_settings())
        bad_json_inputs = [
            "",
            "   \t\n",
            '{"schema":"foxhub-settings-backup","settings":{"theme":',
            "{bad:json}",
            "[]",
            "123",
            "null",
            "true",
            '"str"',
            "{}",
            '{"unknownKey":42}',
            '{"schema":"foxhub-settings-backup","schemaVersion":1,"settings":{}}',
        ]
        res = self.fx.eval_async_js(
            """
            const S = window.FoxHubSettingsSchema;
            const jsonResults = [];
            for (const raw of arguments[0]) {
              const sRes = S.validateImportPayload(raw);
              const mRes = await browser.runtime.sendMessage({ type: 'IMPORT_SETTINGS', json: raw });
              jsonResults.push({ raw, sOk: Boolean(sRes && sRes.ok), sErr: String(sRes?.error || ''), mOk: Boolean(mRes && mRes.ok), mErr: String(mRes?.error || '') });
            }
            const nonObjPayloads = [];
            for (const p of [[], null, 123]) {
              const r = await browser.runtime.sendMessage({ type: 'IMPORT_SETTINGS', payload: p });
              nonObjPayloads.push({ ok: Boolean(r && r.ok), err: String(r?.error || '') });
            }
            return { jsonResults, nonObjPayloads };
            """,
            bad_json_inputs,
        )
        for item in res["jsonResults"]:
            self.assertFalse(item["sOk"], f"validateImportPayload accepted malformed input {item['raw']!r}")
            self.assertTrue(len(item["sErr"]) > 0)
            self.assertFalse(item["mOk"], f"IMPORT_SETTINGS accepted malformed input {item['raw']!r}")
            self.assertTrue(len(item["mErr"]) > 0)
        for item in res["nonObjPayloads"]:
            self.assertFalse(item["ok"])
            self.assertTrue(len(item["err"]) > 0)
        self._assert_no_js_errors("test_t2_f14_reject_malformed_truncated_empty_and_non_object_json")

    def test_t2_f14_reject_prototype_pollution_and_deep_nesting(self) -> None:
        self._boot_background_offline(_default_settings())
        proto_jsons = [
            '{"__proto__":{"polluted":"yes"},"theme":"true-night"}',
            '{"settings":{"__proto__":{"polluted":"yes"},"theme":"true-night"}}',
            '{"settings":{"constructor":{"prototype":{"pwned":true}},"theme":"true-night"}}',
            '{"settings":{"appShortcuts":{"prototype":{"bad":1}},"theme":"true-night"}}',
            '{"settings":{"customMediaApps":[{"name":"A","url":"https://a.test/","__proto__":{"polluted":"yes"}}]}}',
        ]
        res = self.fx.eval_async_js(
            """
            const S = window.FoxHubSettingsSchema;
            const protoResults = [];
            for (const raw of arguments[0]) {
              const sRes = S.validateImportPayload(raw);
              const mRes = await browser.runtime.sendMessage({ type: 'IMPORT_SETTINGS', json: raw });
              protoResults.push({ sOk: Boolean(sRes && sRes.ok), mOk: Boolean(mRes && mRes.ok) });
            }
            let deep = { theme: 'true-night' };
            for (let i = 0; i < 72; i++) deep = { nested: deep };
            const deepSchema = S.validateImportPayload({ schema: 'foxhub-settings-backup', schemaVersion: 1, settings: deep });
            const deepMsg = await browser.runtime.sendMessage({ type: 'IMPORT_SETTINGS', payload: { schema: 'foxhub-settings-backup', schemaVersion: 1, settings: deep } });
            return {
              protoResults,
              deepSchemaOk: Boolean(deepSchema && deepSchema.ok),
              deepMsgOk: Boolean(deepMsg && deepMsg.ok),
              polluted: ({}).polluted ?? null,
              pwned: ({}).pwned ?? null,
              bad: Object.prototype.bad ?? null
            };
            """,
            proto_jsons,
        )
        for row in res["protoResults"]:
            self.assertFalse(row["sOk"])
            self.assertFalse(row["mOk"])
        self.assertFalse(res["deepSchemaOk"])
        self.assertFalse(res["deepMsgOk"])
        self.assertIsNone(res["polluted"])
        self.assertIsNone(res["pwned"])
        self.assertIsNone(res["bad"])
        self._assert_no_js_errors("test_t2_f14_reject_prototype_pollution_and_deep_nesting")

    def test_t2_f14_reject_invalid_custom_apps_and_out_of_range_values_preserving_storage(self) -> None:
        baseline = _default_settings(
            theme="nordic-fjord",
            soundVolume=0.4,
            pollIntervalSeconds=60,
            customMediaApps=[
                {"id": "custom-keep", "name": "KeepMe", "url": "https://keepme.example/", "color": "#112233", "enabled": True, "userAgentMode": "desktop"}
            ],
        )
        self._boot_background_offline(baseline)
        bad_payloads = [
            {"customMediaApps": [{"id": "x", "name": "Bad", "url": "javascript:alert(1)", "color": "#112233"}]},
            {"customMediaApps": [{"id": "x", "name": "Long", "url": "https://example.com/" + ("a" * 2040), "color": "#112233"}]},
            {"customMediaApps": [{"id": "x", "name": "Icon", "url": "https://example.com/", "iconUrl": "data:text/html,<script>alert(1)</script>"}]},
            {"customMediaApps": [{"id": "x", "name": "Col", "url": "https://example.com/", "color": "not-hex"}]},
            {"customMediaApps": [{"id": "x", "name": "UA", "url": "https://example.com/", "userAgentMode": "tablet"}]},
            {"customMediaApps": "not-an-array"},
            {"pollIntervalSeconds": 5},
            {"pollIntervalSeconds": 9999},
            {"soundVolume": -0.2},
            {"soundVolume": 1.5},
            {"maxSessionSlots": 99},
            {"ttsRate": 5.0},
            {"theme": "nonexistent-theme"},
            {"contextMenuOpenBehavior": "window"},
            {"quickSwitcherShortcut": "BadKey"},
        ]
        res = self.fx.eval_async_js(
            """
            const results = [];
            for (const p of arguments[0]) {
              const r = await browser.runtime.sendMessage({ type: 'IMPORT_SETTINGS', payload: p });
              results.push({ ok: Boolean(r && r.ok), error: String(r?.error || '') });
            }
            const stored = (await browser.storage.local.get('settings')).settings;
            const st = await browser.runtime.sendMessage({ type: 'GET_STATE' });
            return { results, stored, getStateSettings: st.settings };
            """,
            bad_payloads,
        )
        for row in res["results"]:
            self.assertFalse(row["ok"], f"Invalid import payload unexpectedly succeeded: {row}")
            self.assertTrue(len(row["error"]) > 0)
        for label, s in (("stored", res["stored"]), ("GET_STATE", res["getStateSettings"])):
            self.assertEqual(s["theme"], "nordic-fjord", label)
            self.assertEqual(s["soundVolume"], 0.4, label)
            self.assertEqual(s["pollIntervalSeconds"], 60, label)
            self.assertEqual(s["customMediaApps"][0]["name"], "KeepMe", label)
        self._assert_no_js_errors("test_t2_f14_reject_invalid_custom_apps_and_out_of_range_values_preserving_storage")

    def test_t2_f14_roundtrip_export_clear_import_preserves_full_config(self) -> None:
        rich = _default_settings(
            enabledMediaApps=DEFAULT_PINNED_IDS + ["claude", "soundcloud", "gemini"],
            mediaAppsOrder=["soundcloud", "claude", "spotify"],
            customMediaApps=[
                {"id": "custom-1", "name": "MyWiki", "url": "https://wiki.example.test/", "color": "#0EA5E9", "iconUrl": "https://wiki.example.test/i.png", "enabled": True, "userAgentMode": "mobile"}
            ],
            theme="midnight-velvet",
            wallpaper="custom-gradient",
            gradientColor1="#123456",
            gradientColor2="#abcdef",
            customGradient1="#123456",
            customGradient2="#abcdef",
            soundId="zen-bowl",
            soundVolume=0.35,
            keepAudioPlayingWhenClosed=False,
            tabAudioBehavior="pause-only",
            bgAudioAppIds=["soundcloud", "apple-music"],
            bgAudioAppIdsMigratedV1=True,
            bgAudioAppIdsSoundCloudMigratedV2=True,
            globalShortcuts={"popup": "Alt+Shift+Q", "sidebar": "Alt+Shift+S", "popout": "Alt+Shift+D"},
            appShortcuts={"claude": "Alt+Shift+C", "custom-1": "Alt+Shift+W"},
            quickSwitcherEnabled=False,
            quickSwitcherShortcut="Ctrl+Shift+K",
            contextMenuEnabled=False,
            oauthAccounts=[{"email": "keep@gmail.com", "accessToken": "tok"}],
            dndUntil=1893456000000,
        )
        self._boot_background_offline(rich)
        manifest_ver = self._manifest_dict()["version"]
        res = self.fx.eval_async_js(
            """
            const exp = await browser.runtime.sendMessage({ type: 'EXPORT_SETTINGS' });
            await browser.runtime.sendMessage({
              type: 'UPDATE_SETTINGS',
              settings: {
                theme: 'warm-linen',
                soundVolume: 0.9,
                enabledMediaApps: ['instagram'],
                customMediaApps: [],
                quickSwitcherEnabled: true,
                contextMenuEnabled: true
              }
            });
            const imp = await browser.runtime.sendMessage({ type: 'IMPORT_SETTINGS', json: JSON.stringify(exp.payload) });
            const st = await browser.runtime.sendMessage({ type: 'GET_STATE' });
            const stored = (await browser.storage.local.get('settings')).settings;
            const cmds = await browser.commands.getAll();
            const menus = window.__webextMock.contextMenus.list();
            return { exp, imp, stateSettings: st.settings, stored, cmds, menus };
            """
        )
        p = res["exp"]["payload"]
        self.assertEqual(p["schema"], "foxhub-settings-backup")
        self.assertEqual(p["schemaVersion"], 1)
        self.assertEqual(p["appVersion"], manifest_ver)
        self.assertNotIn("oauthAccounts", p["settings"])
        self.assertNotIn("dndUntil", p["settings"])
        self.assertTrue(res["imp"]["ok"])

        for s in (res["stateSettings"], res["stored"]):
            self.assertEqual(s["theme"], "midnight-velvet")
            self.assertEqual(s["wallpaper"], "custom-gradient")
            self.assertEqual(s["gradientColor1"], "#123456")
            self.assertEqual(s["gradientColor2"], "#abcdef")
            self.assertEqual(s["soundId"], "zen-bowl")
            self.assertEqual(s["soundVolume"], 0.35)
            self.assertFalse(s["keepAudioPlayingWhenClosed"])
            self.assertEqual(s["tabAudioBehavior"], "pause-only")
            self.assertEqual(s["bgAudioAppIds"], ["soundcloud", "apple-music"])
            self.assertIn("claude", s["enabledMediaApps"])
            self.assertIn("soundcloud", s["enabledMediaApps"])
            self.assertIn("gemini", s["enabledMediaApps"])
            self.assertEqual(s["mediaAppsOrder"], ["soundcloud", "claude", "spotify"])
            self.assertEqual(s["customMediaApps"][0]["userAgentMode"], "mobile")
            self.assertEqual(s["appShortcuts"]["claude"], "Alt+Shift+C")
            self.assertFalse(s["quickSwitcherEnabled"])
            self.assertEqual(s["quickSwitcherShortcut"], "Ctrl+Shift+K")
            self.assertFalse(s["contextMenuEnabled"])
            self.assertEqual(s["oauthAccounts"][0]["email"], "keep@gmail.com")
        self.assertEqual(res["menus"], [], "Disabled contextMenuEnabled must resync contextMenus on import")
        self._assert_no_js_errors("test_t2_f14_roundtrip_export_clear_import_preserves_full_config")

    def test_t2_f14_import_settings_atomic_rollback_no_partial_overwrite(self) -> None:
        state_a = _default_settings(
            theme="cozy-espresso",
            pollIntervalSeconds=120,
            enabledMediaApps=["spotify", "claude"],
            contextMenuEnabled=True,
            appShortcuts={"claude": "Alt+Shift+C"},
            customMediaApps=[
                {"id": "c1", "name": "Orig", "url": "https://orig.test/", "color": "#223344", "enabled": True, "userAgentMode": "desktop"}
            ],
        )
        self._boot_background_offline(state_a)
        res = self.fx.eval_async_js(
            """
            const snapBefore = {
              stored: (await browser.storage.local.get('settings')).settings,
              sync: window.__pmGetSyncBootState().settings,
              cmds: await browser.commands.getAll(),
              menus: window.__webextMock.contextMenus.list()
            };
            const r1 = await browser.runtime.sendMessage({
              type: 'IMPORT_SETTINGS',
              payload: {
                theme: 'true-night',
                pollIntervalSeconds: 300,
                enabledMediaApps: ['youtube'],
                contextMenuEnabled: false,
                customMediaApps: [
                  { id: 'ok', name: 'Ok', url: 'https://ok.test/', color: '#112233', enabled: true, userAgentMode: 'default' },
                  { id: 'evil', name: 'Evil', url: 'javascript:alert(1)', color: '#112233', enabled: true, userAgentMode: 'default' }
                ]
              }
            });
            const r2 = await browser.runtime.sendMessage({
              type: 'IMPORT_SETTINGS',
              payload: {
                theme: 'true-night',
                pollIntervalSeconds: 300,
                contextMenuEnabled: false,
                appShortcuts: { claude: 'InvalidOnlyKey' }
              }
            });
            const snapAfter = {
              stored: (await browser.storage.local.get('settings')).settings,
              sync: window.__pmGetSyncBootState().settings,
              cmds: await browser.commands.getAll(),
              menus: window.__webextMock.contextMenus.list()
            };
            return { r1, r2, snapBefore, snapAfter };
            """
        )
        self.assertFalse(res["r1"]["ok"])
        self.assertFalse(res["r2"]["ok"])
        self.assertEqual(res["snapAfter"]["stored"], res["snapBefore"]["stored"])
        self.assertEqual(res["snapAfter"]["sync"], res["snapBefore"]["sync"])
        self.assertEqual(res["snapAfter"]["cmds"], res["snapBefore"]["cmds"])
        self.assertEqual(res["snapAfter"]["menus"], res["snapBefore"]["menus"])
        self._assert_no_js_errors("test_t2_f14_import_settings_atomic_rollback_no_partial_overwrite")

    def test_t2_f14_schema_version_mismatch_and_settings_ui_import_error_feedback(self) -> None:
        self._boot_background_offline(_default_settings(theme="nordic-fjord"))
        bad_envelopes = [
            {"schema": "wrong", "schemaVersion": 1, "settings": {"theme": "true-night"}},
            {"schema": "foxhub-settings-backup", "schemaVersion": 2, "settings": {"theme": "true-night"}},
            {"schema": "foxhub-settings-backup", "schemaVersion": "1", "settings": {"theme": "true-night"}},
            {"schema": "foxhub-settings-backup", "schemaVersion": 1, "settings": []},
        ]
        part_a = self.fx.eval_async_js(
            """
            const out = [];
            for (const env of arguments[0]) {
              out.push(await browser.runtime.sendMessage({ type: 'IMPORT_SETTINGS', payload: env }));
            }
            return out;
            """,
            bad_envelopes,
        )
        for r in part_a:
            self.assertFalse(r["ok"])
        self._assert_no_js_errors("test_t2_f14_schema_mismatch_partA")

        self._assert_settings_ui_exists()
        self.fx.reset_to_blank()
        self._open_bridged_app("src/options/options.html", "", settings=_default_settings(theme="nordic-fjord"), width=1200, height=800)
        part_b = self.fx.eval_async_js(
            """
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const tabs = Array.from(uiDoc.querySelectorAll('[role="tab"], [data-category], [data-settings-tab], .opt-nav button, .fh-settings-nav button'));
            for (const t of tabs) {
              if (/backup|data|import|advanced/i.test(t.textContent || '')) { t.click(); await new Promise((r) => setTimeout(r, 50)); }
            }
            const importInput = uiDoc.querySelector('textarea[data-import], textarea[id*="import" i], input[data-import], textarea');
            const importBtn = Array.from(uiDoc.querySelectorAll('button')).find((b) => /import.*backup|import.*settings|restore/i.test(b.textContent || ''));
            if (!importInput || !importBtn) return { hasImportUi: false };

            importInput.value = '{broken json';
            importInput.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
            importBtn.click();
            await new Promise((r) => setTimeout(r, 120));
            const statusText = (uiDoc.querySelector('[data-import-status], [role="alert"], .fh-import-status, .fh-toast, .pm-toast')?.textContent || uiDoc.body.textContent || '');
            const storedTheme = (await browser.storage.local.get('settings')).settings.theme;
            return { hasImportUi: true, statusText, storedTheme };
            """
        )
        self.assertTrue(part_b.get("hasImportUi"), "Backup/Restore import input/button missing in unified settings UI")
        self.assertRegex(part_b["statusText"], re.compile(r"invalid|error|fail|malformed|json", re.IGNORECASE))
        self.assertEqual(part_b["storedTheme"], "nordic-fjord")
        self._assert_no_bridge_errors("test_t2_f14_schema_mismatch_partB")

    # ==================================================================
    # F15: Quick Switcher (Ctrl+K) (6 tests)
    # ==================================================================

    def test_t2_f15_quick_switcher_disabled_ignores_ctrl_k_and_relay(self) -> None:
        self._open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=_default_settings(quickSwitcherEnabled=False))
        res = self.fx.eval_async_js(
            r"""
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const findQs = () => {
              const sels = ['#pm-quick-switcher', '#foxhub-quick-switcher', '[data-quick-switcher]', '[role="dialog"][aria-label*="Switcher" i]'];
              for (const s of sels) {
                const el = uiDoc.querySelector(s);
                if (el && !el.classList.contains('hidden') && uiWin.getComputedStyle(el).display !== 'none') return el;
              }
              return null;
            };
            const fireCtrlK = () => {
              uiDoc.dispatchEvent(new uiWin.KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true }));
            };

            fireCtrlK();
            uiWin.postMessage({ source: 'pocketmail-media-frame', type: 'PM_QUICK_SWITCHER_TOGGLE' }, '*');
            await browser.runtime.sendMessage({ type: 'PM_QUICK_SWITCHER_TOGGLE' });
            await new Promise((r) => setTimeout(r, 90));
            const openWhileDisabled = Boolean(findQs());

            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { quickSwitcherEnabled: true } });
            await new Promise((r) => setTimeout(r, 90));
            fireCtrlK();
            await new Promise((r) => setTimeout(r, 90));
            const openAfterEnable = Boolean(findQs());

            return { openWhileDisabled, openAfterEnable };
            """
        )
        self.assertFalse(res["openWhileDisabled"], "Quick Switcher must NOT open when quickSwitcherEnabled=false")
        self.assertTrue(res["openAfterEnable"], "Quick Switcher must open on Ctrl+K after quickSwitcherEnabled=true")
        self._assert_no_bridge_errors("test_t2_f15_quick_switcher_disabled_ignores_ctrl_k_and_relay")

    def test_t2_f15_non_url_zero_match_search_and_recovery(self) -> None:
        self._open_popup_toplevel(_default_settings(quickSwitcherEnabled=True))
        self.fx.press_shortcut("k", ctrl=True)
        res = self.fx.eval_async_js(
            r"""
            await new Promise((r) => setTimeout(r, 90));
            const findQs = () => {
              const sels = ['#pm-quick-switcher', '#foxhub-quick-switcher', '[data-quick-switcher]', '[role="dialog"][aria-label*="Switcher" i]'];
              for (const s of sels) {
                const el = document.querySelector(s);
                if (el && !el.classList.contains('hidden') && window.getComputedStyle(el).display !== 'none') return el;
              }
              return null;
            };
            const qs = findQs();
            if (!qs) return { hasQs: false };
            const inp = qs.querySelector('input[type="text"], input[type="search"], input:not([type])');
            if (!inp) return { hasQs: true, hasInput: false };

            const countOpts = () => Array.from(qs.querySelectorAll('[role="option"], button, li'))
              .filter((el) => window.getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0).length;

            const initCount = countOpts();
            inp.value = 'zzznomatchfoxhub999';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise((r) => setTimeout(r, 60));
            const zeroCount = countOpts();
            const hasEmptyNotice = /no\s*(match|result|found|item)/i.test(qs.textContent || '') || Boolean(qs.querySelector('[data-empty], .empty, .qs-empty'));

            inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
            await new Promise((r) => setTimeout(r, 60));
            const framesCreated = document.querySelectorAll('#pm-media-frame-pool iframe').length;

            inp.value = 'Spotify';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise((r) => setTimeout(r, 60));
            const recoveredCount = countOpts();

            return { hasQs: true, hasInput: true, initCount, zeroCount, hasEmptyNotice, framesCreated, recoveredCount };
            """
        )
        self.assertTrue(res.get("hasQs"), "Quick Switcher did not open on Ctrl+K")
        self.assertTrue(res.get("hasInput"), "Quick Switcher search input missing")
        self.assertGreater(res["initCount"], 0)
        self.assertEqual(res["zeroCount"], 0, "Non-URL zero-match query must produce 0 option rows")
        self.assertTrue(res["hasEmptyNotice"] or res["zeroCount"] == 0)
        self.assertEqual(res["framesCreated"], 0, "Pressing Enter on zero-match non-URL must not open an iframe")
        self.assertGreaterEqual(res["recoveredCount"], 1, "Typing 'Spotify' must recover matching option")
        self._assert_no_js_errors("test_t2_f15_non_url_zero_match_search_and_recovery")

    def test_t2_f15_unsafe_urls_rejected_vs_valid_adhoc_url_opens_in_sidebar(self) -> None:
        self._open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=_default_settings(quickSwitcherEnabled=True))
        adhoc_url = self.server.url_for("/mock/custom/adhoc?tab=1")
        res = self.fx.eval_async_js(
            r"""
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            uiDoc.dispatchEvent(new uiWin.KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true }));
            await new Promise((r) => setTimeout(r, 90));
            const qs = uiDoc.querySelector('#pm-quick-switcher, #foxhub-quick-switcher, [data-quick-switcher], [role="dialog"][aria-label*="Switcher" i]');
            if (!qs || qs.classList.contains('hidden')) return { hasQs: false };
            const inp = qs.querySelector('input[type="text"], input[type="search"], input:not([type])');
            if (!inp) return { hasQs: true, hasInput: false };

            const unsafe = ['javascript:alert(1)', 'data:text/html,<script>window.__qsXss=1<\/script>', 'vbscript:msgbox(1)', 'file:///C:/Windows/win.ini', 'http://'];
            for (const u of unsafe) {
              inp.value = u;
              inp.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
              inp.dispatchEvent(new uiWin.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
              await new Promise((r) => setTimeout(r, 40));
            }
            const badFrames = Array.from(uiDoc.querySelectorAll('iframe')).filter((f) => /^(javascript|data|vbscript|file):/i.test(f.getAttribute('src') || ''));

            // Valid local ad-hoc URL
            inp.value = arguments[0];
            inp.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
            await new Promise((r) => setTimeout(r, 50));
            const openOpt = Array.from(qs.querySelectorAll('[role="option"], button, li')).find((el) => /open/i.test(el.textContent || '') || (el.textContent || '').includes('adhoc'));
            if (openOpt) openOpt.click();
            else inp.dispatchEvent(new uiWin.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
            await new Promise((r) => setTimeout(r, 150));

            const qsStillOpen = Boolean(
              uiDoc.querySelector('#pm-quick-switcher, #foxhub-quick-switcher, [data-quick-switcher], [role="dialog"][aria-label*="Switcher" i]') &&
              !qs.classList.contains('hidden') &&
              uiWin.getComputedStyle(qs).display !== 'none'
            );
            const wsOpen = Boolean(uiDoc.getElementById('pm-media-workspace') && !uiDoc.getElementById('pm-media-workspace').classList.contains('hidden'));
            const frameSrcs = Array.from(uiDoc.querySelectorAll('#pm-media-frame-pool iframe')).map((f) => f.src || f.getAttribute('src') || '');

            return {
              hasQs: true,
              hasInput: true,
              xssTop: window.__qsXss ?? null,
              xssUi: uiWin.__qsXss ?? null,
              badFrameCount: badFrames.length,
              qsStillOpen,
              wsOpen,
              frameSrcs
            };
            """,
            adhoc_url,
        )
        self.assertTrue(res.get("hasQs"), "Quick Switcher dialog missing")
        self.assertTrue(res.get("hasInput"), "Quick Switcher input missing")
        self.assertIsNone(res["xssTop"])
        self.assertIsNone(res["xssUi"])
        self.assertEqual(res["badFrameCount"], 0)
        self.assertFalse(res["qsStillOpen"], "Quick Switcher must close after launching ad-hoc URL")
        self.assertTrue(res["wsOpen"], "Ad-hoc URL must open #pm-media-workspace")
        self.assertTrue(any("/mock/custom/adhoc" in s for s in res["frameSrcs"]), f"Expected adhoc iframe src in pool: {res['frameSrcs']}")
        self._assert_no_bridge_errors("test_t2_f15_unsafe_urls_rejected_vs_valid_adhoc_url_opens_in_sidebar")

    def test_t2_f15_iframe_pm_quick_switcher_toggle_relay_ignores_untrusted_sources(self) -> None:
        self.assertTrue((REPO_ROOT / "src" / "content" / "core" / "lifecycle-router.js").is_file(), "Missing M2 src/content/core/lifecycle-router.js")
        self.assertTrue((REPO_ROOT / "src" / "content" / "core" / "frame-context.js").is_file(), "Missing M2 src/content/core/frame-context.js")

        relay_url = self.server.url_for("/mock/custom/relay")
        self._open_bridged_app(
            "src/popup/popup.html",
            "?sidebar=1",
            settings=_default_settings(
                quickSwitcherEnabled=True,
                customMediaApps=[
                    {"id": "custom-relay", "name": "RelayApp", "url": relay_url, "color": "#123456", "enabled": True, "userAgentMode": "default"}
                ],
            ),
        )
        res = self.fx.eval_async_js(
            r"""
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const isQsOpen = () => {
              const el = uiDoc.querySelector('#pm-quick-switcher, #foxhub-quick-switcher, [data-quick-switcher], [role="dialog"][aria-label*="Switcher" i]');
              return Boolean(el && !el.classList.contains('hidden') && uiWin.getComputedStyle(el).display !== 'none');
            };

            const relayBtn = uiDoc.querySelector('#pm-rail-apps-list [data-app-id="custom-relay"]');
            if (!relayBtn) return { hasRelayBtn: false };
            relayBtn.click();
            await new Promise((r) => setTimeout(r, 140));
            const pooled = uiDoc.querySelector('#pm-media-frame-pool iframe[name="pm-media-frame-custom-relay"], #pm-media-frame-pool iframe[data-app-id="custom-relay"]');
            if (!pooled) return { hasRelayBtn: true, hasPooledFrame: false };
            if (!pooled.contentDocument || pooled.contentDocument.readyState !== 'complete') {
              await new Promise((r) => pooled.addEventListener('load', r, { once: true }));
            }

            const untrusted = uiDoc.createElement('iframe');
            untrusted.id = 'untrusted-ad';
            untrusted.name = 'thirdparty-ad';
            untrusted.src = arguments[0];
            uiDoc.body.appendChild(untrusted);
            await new Promise((r) => untrusted.addEventListener('load', r, { once: true }));

            const postFromFrame = (frameEl, msg) => {
              const doc = frameEl.contentDocument;
              const s = doc.createElement('script');
              s.textContent = 'window.parent.postMessage(' + JSON.stringify(msg) + ', "*");';
              (doc.body || doc.documentElement).appendChild(s);
              s.remove();
            };

            // Spoofed postMessages must be ignored
            uiWin.postMessage({ type: 'PM_QUICK_SWITCHER_TOGGLE' }, '*');
            uiWin.postMessage({ source: 'evil-origin', type: 'PM_QUICK_SWITCHER_TOGGLE' }, '*');
            postFromFrame(untrusted, {
              source: 'pocketmail-media-frame',
              flatFrameName: 'pm-media-frame-spotify',
              type: 'PM_QUICK_SWITCHER_TOGGLE'
            });
            await new Promise((r) => setTimeout(r, 100));
            const openAfterSpoofs = isQsOpen();

            // Trusted relay from pooled FoxHub iframe
            postFromFrame(pooled, {
              source: 'pocketmail-media-frame',
              flatFrameName: pooled.name || 'pm-media-frame-custom-relay',
              type: 'PM_QUICK_SWITCHER_TOGGLE'
            });
            await new Promise((r) => setTimeout(r, 200));
            const openAfterTrusted = isQsOpen();

            postFromFrame(pooled, {
              source: 'pocketmail-media-frame',
              flatFrameName: pooled.name || 'pm-media-frame-custom-relay',
              type: 'PM_QUICK_SWITCHER_TOGGLE'
            });
            await new Promise((r) => setTimeout(r, 120));
            const openAfterSecondToggle = isQsOpen();

            return {
              hasRelayBtn: true,
              hasPooledFrame: true,
              openAfterSpoofs,
              openAfterTrusted,
              openAfterSecondToggle
            };
            """,
            self.server.url_for("/mock/echo"),
        )
        self.assertTrue(res.get("hasRelayBtn"), "Custom relay rail button missing")
        self.assertTrue(res.get("hasPooledFrame"), "Pooled iframe missing")
        self.assertFalse(res["openAfterSpoofs"], "Untrusted/spoofed postMessage must NOT toggle Quick Switcher")
        self.assertTrue(res["openAfterTrusted"], "Trusted pooled iframe relay must open Quick Switcher")
        self.assertFalse(res["openAfterSecondToggle"], "Second trusted relay must toggle Quick Switcher closed")
        self._assert_no_bridge_errors("test_t2_f15_iframe_pm_quick_switcher_toggle_relay_ignores_untrusted_sources")

    def test_t2_f15_escape_outside_click_and_arrow_keyboard_bounds(self) -> None:
        self._open_popup_toplevel(_default_settings(quickSwitcherEnabled=True))
        self.fx.press_shortcut("k", ctrl=True)
        init = self.fx.eval_async_js(
            """
            await new Promise((r) => setTimeout(r, 90));
            const qs = document.querySelector('#pm-quick-switcher, #foxhub-quick-switcher, [data-quick-switcher], [role="dialog"][aria-label*="Switcher" i]');
            if (!qs || qs.classList.contains('hidden') || window.getComputedStyle(qs).display === 'none') return { open: false };
            const opts = Array.from(qs.querySelectorAll('[role="option"], button, li'))
              .filter((el) => window.getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0);
            return { open: true, count: opts.length };
            """
        )
        self.assertTrue(init.get("open"), "Quick Switcher did not open on Ctrl+K")
        self.assertGreaterEqual(init["count"], 2)

        # Arrow bounds: ArrowUp at start, ArrowDown past end, ArrowUp back past start
        self.fx.press_shortcut("arrowup")
        for _ in range(init["count"] + 4):
            self.fx.press_shortcut("arrowdown")
        for _ in range(init["count"] + 4):
            self.fx.press_shortcut("arrowup")

        bounds = self.fx.eval_js(
            """
            const qs = document.querySelector('#pm-quick-switcher, #foxhub-quick-switcher, [data-quick-switcher], [role="dialog"][aria-label*="Switcher" i]');
            if (!qs) return { open: false };
            const active = qs.querySelectorAll('[aria-selected="true"], .active, .selected, .is-active');
            return { open: true, activeCount: active.length };
            """
        )
        self.assertTrue(bounds["open"])
        self.assertLessEqual(bounds["activeCount"], 1)

        # Escape dismisses
        self.fx.press_shortcut("escape")
        after_esc = self.fx.eval_async_js(
            """
            await new Promise((r) => setTimeout(r, 80));
            const qs = document.querySelector('#pm-quick-switcher, #foxhub-quick-switcher, [data-quick-switcher], [role="dialog"][aria-label*="Switcher" i]');
            return Boolean(qs && !qs.classList.contains('hidden') && window.getComputedStyle(qs).display !== 'none');
            """
        )
        self.assertFalse(after_esc, "Escape must close Quick Switcher")

        # Re-open and click outside (brand header) -> dismisses
        self.fx.press_shortcut("k", ctrl=True)
        outside_res = self.fx.eval_async_js(
            """
            await new Promise((r) => setTimeout(r, 80));
            const qs = document.querySelector('#pm-quick-switcher, #foxhub-quick-switcher, [data-quick-switcher], [role="dialog"][aria-label*="Switcher" i]');
            if (!qs || qs.classList.contains('hidden')) return { reopened: false };
            const outside = qs.querySelector('#pm-qs-backdrop, .pm-qs-backdrop, [data-quick-switcher-backdrop]') ||
              qs.closest('.pm-quick-switcher-backdrop, .fh-qs-backdrop, [data-quick-switcher-backdrop]') ||
              document.querySelector('.pm-brand-title') ||
              document.body;
            outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            outside.click();
            await new Promise((r) => setTimeout(r, 80));
            const stillOpen = !qs.classList.contains('hidden') && window.getComputedStyle(qs).display !== 'none';
            return { reopened: true, stillOpen };
            """
        )
        self.assertTrue(outside_res.get("reopened"))
        self.assertFalse(outside_res["stillOpen"], "Clicking outside/backdrop must close Quick Switcher")

        # Rapid double Ctrl+K -> toggles open then closed, <= 1 dialog in DOM
        self.fx.press_shortcut("k", ctrl=True)
        self.fx.press_shortcut("k", ctrl=True)
        dbl = self.fx.eval_async_js(
            """
            await new Promise((r) => setTimeout(r, 90));
            const all = document.querySelectorAll('#pm-quick-switcher, #foxhub-quick-switcher, [data-quick-switcher], [role="dialog"][aria-label*="Switcher" i]');
            const vis = Array.from(all).filter((el) => !el.classList.contains('hidden') && window.getComputedStyle(el).display !== 'none');
            return { domCount: all.length, visCount: vis.length };
            """
        )
        self.assertLessEqual(dbl["domCount"], 1)
        self.assertEqual(dbl["visCount"], 0)
        self._assert_no_js_errors("test_t2_f15_escape_outside_click_and_arrow_keyboard_bounds")

    def test_t2_f15_xss_query_escaping_custom_shortcut_and_quick_actions(self) -> None:
        self._open_bridged_app(
            "src/popup/popup.html",
            "?sidebar=1",
            settings=_default_settings(theme="warm-linen", muteSiteNotifications=False, quickSwitcherEnabled=True),
        )
        res = self.fx.eval_async_js(
            r"""
            const uiWin = document.getElementById('ui-frame').contentWindow;
            const uiDoc = document.getElementById('ui-frame').contentDocument;
            const findQs = () => {
              const el = uiDoc.querySelector('#pm-quick-switcher, #foxhub-quick-switcher, [data-quick-switcher], [role="dialog"][aria-label*="Switcher" i]');
              return el && !el.classList.contains('hidden') && uiWin.getComputedStyle(el).display !== 'none' ? el : null;
            };
            const pressKey = (key, shift) => {
              uiDoc.dispatchEvent(new uiWin.KeyboardEvent('keydown', {
                key,
                code: 'KeyK',
                ctrlKey: true,
                shiftKey: Boolean(shift),
                bubbles: true,
                cancelable: true
              }));
            };

            pressKey('k', false);
            await new Promise((r) => setTimeout(r, 90));
            let qs = findQs();
            if (!qs) return { hasQs: false };
            let inp = qs.querySelector('input[type="text"], input[type="search"], input:not([type])');
            if (!inp) return { hasQs: true, hasInput: false };

            // 1. XSS query escaping
            inp.value = '<img src=x onerror="window.__qsXss2=1"><svg onload="window.__qsXss2=2">test';
            inp.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
            await new Promise((r) => setTimeout(r, 60));
            const badNodes = qs.querySelectorAll('img, script').length;

            // 2. Night Mode quick action
            inp.value = 'Night Mode';
            inp.dispatchEvent(new uiWin.Event('input', { bubbles: true }));
            await new Promise((r) => setTimeout(r, 60));
            const nightOpt = Array.from(qs.querySelectorAll('[role="option"], button, li')).find((el) => /night\s*mode/i.test(el.textContent || ''));
            if (!nightOpt) return { hasQs: true, hasInput: true, hasNightOpt: false };
            nightOpt.click();
            await new Promise((r) => setTimeout(r, 120));
            const themeAfter = (await browser.storage.local.get('settings')).settings.theme;

            // 3. Re-open & Mute quick action
            if (!findQs()) { pressKey('k', false); await new Promise((r) => setTimeout(r, 90)); }
            qs = findQs();
            inp = qs && qs.querySelector('input[type="text"], input[type="search"], input:not([type])');
            const muteOpt = qs && (inp.value = 'Mute', inp.dispatchEvent(new uiWin.Event('input', { bubbles: true })), await new Promise((r) => setTimeout(r, 60)), Array.from(qs.querySelectorAll('[role="option"], button, li')).find((el) => /mute/i.test(el.textContent || '')));
            if (!muteOpt) return { hasQs: true, hasInput: true, hasNightOpt: true, hasMuteOpt: false };
            muteOpt.click();
            await new Promise((r) => setTimeout(r, 120));
            const sAfterMute = (await browser.storage.local.get('settings')).settings;
            const mutedNow = Boolean(sAfterMute.muteSiteNotifications || sAfterMute.muteAllNotifications);

            // 4. Custom quickSwitcherShortcut: Ctrl+Shift+K
            if (findQs()) {
              uiDoc.dispatchEvent(new uiWin.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
              await new Promise((r) => setTimeout(r, 60));
            }
            await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { quickSwitcherShortcut: 'Ctrl+Shift+K' } });
            await new Promise((r) => setTimeout(r, 100));

            pressKey('k', false);
            await new Promise((r) => setTimeout(r, 80));
            const openedOnOld = Boolean(findQs());

            pressKey('K', true);
            await new Promise((r) => setTimeout(r, 80));
            const openedOnNew = Boolean(findQs());

            return {
              hasQs: true,
              hasInput: true,
              hasNightOpt: true,
              hasMuteOpt: true,
              xssTop: window.__qsXss2 ?? null,
              xssUi: uiWin.__qsXss2 ?? null,
              badNodes,
              themeAfter,
              mutedNow,
              openedOnOld,
              openedOnNew
            };
            """
        )
        self.assertTrue(res.get("hasQs"), "Quick Switcher dialog missing")
        self.assertTrue(res.get("hasInput"), "Quick Switcher input missing")
        self.assertTrue(res.get("hasNightOpt"), "Night Mode quick action missing")
        self.assertTrue(res.get("hasMuteOpt"), "Mute quick action missing")
        self.assertIsNone(res["xssTop"])
        self.assertIsNone(res["xssUi"])
        self.assertEqual(res["badNodes"], 0)
        self.assertEqual(res["themeAfter"], "true-night")
        self.assertTrue(res["mutedNow"])
        self.assertFalse(res["openedOnOld"], "Old Ctrl+K must not trigger after changing quickSwitcherShortcut to Ctrl+Shift+K")
        self.assertTrue(res["openedOnNew"], "New Ctrl+Shift+K shortcut must open Quick Switcher")
        self._assert_no_bridge_errors("test_t2_f15_xss_query_escaping_custom_shortcut_and_quick_actions")


if __name__ == "__main__":
    unittest.main()
