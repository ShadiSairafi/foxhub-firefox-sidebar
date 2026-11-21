"""Tier 2 boundary, corner, and negative tests for Architecture, Manifest, Splits, and AMO Compliance (F1, F2, F3, F4, F16)."""

from __future__ import annotations

import json
import re
import sys
import tempfile
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


def _write_valid_probe_extension(root: Path) -> None:
    """Create a minimal valid MV2 extension skeleton inside a temporary directory."""
    (root / "src" / "popup").mkdir(parents=True, exist_ok=True)
    (root / "src" / "background").mkdir(parents=True, exist_ok=True)
    (root / "src" / "content").mkdir(parents=True, exist_ok=True)
    (root / "icons").mkdir(parents=True, exist_ok=True)
    (root / "icons" / "icon-48.png").write_bytes(b"\x89PNG\r\n\x1a\n")

    manifest = {
        "manifest_version": 2,
        "name": "FoxHub Probe",
        "short_name": "FoxHub",
        "version": "2.8.0",
        "description": "Local FoxHub probe extension.",
        "author": "FoxHub",
        "icons": {"48": "icons/icon-48.png"},
        "browser_action": {"default_popup": "src/popup/popup.html", "default_title": "FoxHub"},
        "sidebar_action": {"default_panel": "src/popup/popup.html?sidebar=1", "default_title": "FoxHub"},
        "background": {"page": "src/background/background.html"},
        "content_scripts": [
            {
                "matches": ["https://*/*", "http://*/*"],
                "js": ["src/content/tab-media-watcher.js"],
                "run_at": "document_start",
                "all_frames": True,
            }
        ],
        "permissions": ["storage", "tabs", "contextMenus", "<all_urls>"],
        "content_security_policy": "script-src 'self'; object-src 'self'",
        "browser_specific_settings": {
            "gecko": {
                "id": "pocketmail-local@workspace.local",
                "strict_min_version": "142.0",
            }
        },
    }
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (root / "src" / "popup" / "popup.html").write_text(
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<link rel='stylesheet' href='popup.css'>"
        "<title>FoxHub</title></head>"
        "<body><div id='app'>FoxHub Ready</div>"
        "<script src='popup.js'></script></body></html>",
        encoding="utf-8",
    )
    (root / "src" / "popup" / "popup.css").write_text("body { margin: 0; }\n", encoding="utf-8")
    (root / "src" / "popup" / "popup.js").write_text("const ok = true;\n", encoding="utf-8")
    (root / "src" / "background" / "background.html").write_text(
        "<!doctype html><html><head><meta charset='utf-8'><title>FoxHub BG</title></head>"
        "<body><script src='bg.js'></script></body></html>",
        encoding="utf-8",
    )
    (root / "src" / "background" / "bg.js").write_text("const bgOk = true;\n", encoding="utf-8")
    (root / "src" / "content" / "tab-media-watcher.js").write_text(
        "(function(){ 'use strict'; })();\n", encoding="utf-8"
    )


class TestT2ArchManifest(unittest.TestCase):
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
    # Helpers (zero-ERROR defensive guards)
    # ------------------------------------------------------------------

    def _read_manifest(self) -> dict[str, Any]:
        manifest_path = REPO_ROOT / "manifest.json"
        self.assertTrue(manifest_path.is_file(), f"Missing manifest.json at {manifest_path}")
        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception as exc:
            self.fail(f"manifest.json is not valid JSON: {exc}")
        self.assertIsInstance(data, dict, "manifest.json root must be a JSON object")
        return data

    def _install_error_trap(self) -> None:
        self.fx.eval_js(ERROR_TRAP_SNIPPET)

    def _assert_no_page_errors(self, context: str) -> None:
        errs = self.fx.eval_js("return Array.isArray(window.__t2Errors) ? window.__t2Errors : [];")
        self.assertEqual(errs, [], f"Uncaught JS errors in {context}: {errs}")

    def _boot_background_page(self, seed: dict[str, Any] | None = None) -> None:
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

        # Stub live network fetches to mail.google.com / googleapis.com so Firefox
        # never pops a 401 Basic Auth prompt during offline headless test runs.
        fetch_guard_js = (
            "const __origFetch = window.fetch ? window.fetch.bind(window) : null;\n"
            "window.fetch = function(input, init) {\n"
            "  const u = typeof input === 'string' ? input : (input && input.url ? input.url : '');\n"
            "  if (/^https?:\\/\\/(mail\\.google\\.com|www\\.googleapis\\.com|accounts\\.google\\.com)\\b/i.test(u)) {\n"
            "    return Promise.resolve(new Response('', { status: 403, statusText: 'Mock Offline' }));\n"
            "  }\n"
            "  return __origFetch ? __origFetch(input, init) : Promise.reject(new Error('No fetch'));\n"
            "};\n"
        )
        guard_url = self.server.register_fixture(
            "t2_bg_fetch_guard.js",
            fetch_guard_js,
            content_type="application/javascript; charset=utf-8",
        )
        bg_fixture_doc = (
            "<!doctype html><html><head><meta charset='utf-8'><title>FoxHub BG Harness</title>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            f"<script src='{guard_url}'></script>"
            "</head><body>"
            + "".join(script_tags)
            + "</body></html>"
        )
        bg_fixture_url = self.server.register_fixture("t2_bg_harness.html", bg_fixture_doc)

        if seed is not None:
            self.server.set_seed(seed)
        self.fx.navigate(bg_fixture_url)
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
                return true;
              }
              await new Promise((r) => setTimeout(r, 25));
            }
            return Boolean(window.FoxHubBg && window.FoxHubBg.state);
            """
        )
        self.assertTrue(ready, "background.html failed to initialize window.FoxHubBg")

    def _register_error_collecting_fixture(
        self,
        name: str,
        head_scripts: list[str],
        body_html: str = "",
        module_code: str = "",
    ) -> str:
        scripts_html = "".join(f'<script src="{src}"></script>' for src in head_scripts)
        trap_script_body = (
            "window.__t2Errors = [];"
            "window.__t2ModuleDone = false;"
            "window.addEventListener('error', function(e){"
            "  window.__t2Errors.push('error: ' + (e && e.message ? e.message : String(e)));"
            "});"
            "window.addEventListener('unhandledrejection', function(e){"
            "  var r = e && e.reason;"
            "  window.__t2Errors.push('rejection: ' + (r && r.message ? r.message : String(r)));"
            "});"
        )
        trap_url = self.server.register_fixture(
            f"{name}_trap.js",
            trap_script_body,
            content_type="application/javascript; charset=utf-8",
        )
        mod_tag = ""
        if module_code:
            mod_url = self.server.register_fixture(
                f"{name}_mod.js",
                module_code,
                content_type="application/javascript; charset=utf-8",
            )
            mod_tag = f"<script type='module' src='{mod_url}'></script>"
        doc = (
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            f"<script src='{trap_url}'></script>"
            f"{scripts_html}"
            f"{mod_tag}"
            "</head><body>"
            f"{body_html}"
            "</body></html>"
        )
        return self.server.register_fixture(name, doc)

    # ==================================================================
    # F1: Manifest v2.8.0 & Content Injection Split (6 tests)
    # ==================================================================

    def test_f1_tab_media_watcher_size_ceiling(self) -> None:
        watcher = REPO_ROOT / "src" / "content" / "tab-media-watcher.js"
        self.assertTrue(watcher.is_file(), f"Expected lightweight watcher at {watcher}")
        size = watcher.stat().st_size
        self.assertGreater(size, 0, "tab-media-watcher.js must not be empty")
        self.assertLessEqual(size, 8192, f"tab-media-watcher.js ({size} B) exceeds 8192 B hard ceiling")

        report = lint_extension(
            REPO_ROOT,
            check_firefox_js=False,
            check_split_budget=True,
            tab_watcher_max_bytes=8192,
        )
        split_errors = [
            e for e in report["errors"] if e["rule"] in ("arch.split_budget", "arch.missing_tab_watcher")
        ]
        self.assertEqual(split_errors, [], f"Split budget lint errors: {split_errors}")

    def test_f1_normal_http_content_scripts_exclude_heavy_assets(self) -> None:
        manifest = self._read_manifest()
        cs_list = manifest.get("content_scripts")
        self.assertIsInstance(cs_list, list, "manifest.json must declare content_scripts list")
        self.assertGreater(len(cs_list), 0, "content_scripts must not be empty")

        general_entries = []
        for entry in cs_list:
            if not isinstance(entry, dict):
                continue
            matches = entry.get("matches") or []
            if any(m in ("<all_urls>", "http://*/*", "https://*/*") for m in matches):
                general_entries.append(entry)

        self.assertGreater(len(general_entries), 0, "Expected content_scripts entry for http/https tabs")
        for idx, entry in enumerate(general_entries):
            self.assertEqual(
                entry.get("js"),
                ["src/content/tab-media-watcher.js"],
                f"General content_scripts[{idx}] must inject ONLY src/content/tab-media-watcher.js",
            )
            self.assertEqual(
                entry.get("css", []),
                [],
                f"General content_scripts[{idx}] must inject zero sidebar CSS into normal tabs",
            )
            self.assertEqual(
                entry.get("run_at"),
                "document_start",
                f"General content_scripts[{idx}] must run at document_start",
            )

    def test_f1_non_http_schemes_and_tab_id_minus_one_boundary(self) -> None:
        watcher = REPO_ROOT / "src" / "content" / "tab-media-watcher.js"
        self.assertTrue(watcher.is_file(), f"Expected split watcher at {watcher}")

        self._boot_background_page()
        res = self.fx.eval_async_js(
            """
            const bg = window.FoxHubBg;
            const extOrigin = browser.runtime.getURL('');
            const extBlank = bg.isExternalBrowserTab({ id: 1, url: 'about:blank' });
            const extFile = bg.isExternalBrowserTab({ id: 2, url: 'file:///C:/test.mp4' });
            const extMoz = bg.isExternalBrowserTab({ id: 3, url: 'moz-extension://foxhub-test-uuid/src/popup/popup.html', audible: true });
            const extMuted = bg.isExternalBrowserTab({ id: 4, url: 'https://www.youtube.com/', mutedInfo: { muted: true }, audible: true });
            const extNormal = bg.isExternalBrowserTab({ id: 5, url: 'https://www.youtube.com/watch?v=1', audible: true });

            const sidebarReq = await window.__webextMock.webRequest.triggerBeforeSendHeaders({
              url: 'https://www.instagram.com/direct/inbox/',
              type: 'sub_frame',
              tabId: -1,
              frameId: 1,
              parentFrameId: 0,
              originUrl: extOrigin + 'src/popup/popup.html',
              documentUrl: extOrigin + 'src/popup/popup.html',
              requestHeaders: [
                { name: 'Sec-Fetch-Dest', value: 'iframe' },
                { name: 'Sec-Fetch-Mode', value: 'cors' }
              ]
            });

            const normalTabReq = await window.__webextMock.webRequest.triggerBeforeSendHeaders({
              url: 'https://www.instagram.com/direct/inbox/',
              type: 'main_frame',
              tabId: 42,
              frameId: 0,
              parentFrameId: -1,
              originUrl: 'https://example.com/',
              documentUrl: 'https://example.com/',
              requestHeaders: [
                { name: 'Sec-Fetch-Dest', value: 'document' },
                { name: 'Sec-Fetch-Mode', value: 'navigate' }
              ]
            });

            return {
              extBlank,
              extFile,
              extMoz,
              extMuted,
              extNormal,
              sidebarHeaders: sidebarReq.requestHeaders,
              normalModified: Boolean(normalTabReq.modified),
              normalHeaders: normalTabReq.requestHeaders
            };
            """
        )
        self.assertFalse(res["extMoz"], "moz-extension:// tab must not be treated as external browser tab")
        self.assertFalse(res["extMuted"], "Muted tab must not be treated as external active audio tab")
        self.assertTrue(res["extNormal"], "Normal http(s) tab must be treated as external browser tab")
        self.assertIsInstance(res["extBlank"], bool)
        self.assertIsInstance(res["extFile"], bool)

        sidebar_hdrs = {h["name"].lower(): h["value"] for h in res["sidebarHeaders"]}
        self.assertEqual(sidebar_hdrs.get("sec-fetch-dest"), "document")
        self.assertEqual(sidebar_hdrs.get("sec-fetch-mode"), "navigate")
        self.assertFalse(res["normalModified"], "Normal tabId=42 request must not be modified by FoxHub webRequest")
        self._assert_no_page_errors("test_f1_non_http_schemes_and_tab_id_minus_one_boundary")

    def test_f1_manifest_permissions_and_version_negative_boundaries(self) -> None:
        manifest = self._read_manifest()
        self.assertEqual(manifest.get("manifest_version"), 2, "Extension must remain MV2")
        version_str = manifest.get("version", "")
        self.assertRegex(version_str, r"^\d+\.\d+\.\d+(?:\.\d+)?$", f"Invalid version: {version_str!r}")
        ver_tuple = tuple(int(p) for p in version_str.split("."))
        self.assertGreater(ver_tuple, (2, 7, 9), f"Manifest version {version_str} must be > 2.7.9")
        perms = manifest.get("permissions") or []
        self.assertIn("contextMenus", perms, "manifest.json must include contextMenus permission")

        # Synthetic negative probes inside isolated temp directories
        cases = [
            ("unknown_perm", lambda m: m["permissions"].append("madeUpPermission"), "manifest.permission_unknown"),
            ("high_risk_perm", lambda m: m["permissions"].append("debugger"), "manifest.permission_disallowed"),
            ("bad_ver_short", lambda m: m.__setitem__("version", "2.8"), "manifest.invalid_version"),
            ("bad_ver_beta", lambda m: m.__setitem__("version", "2.8.0-beta"), "manifest.invalid_version"),
            ("missing_perms", lambda m: m.pop("permissions", None), "manifest.missing_key"),
            ("mv3_disallowed", lambda m: m.__setitem__("manifest_version", 3), "manifest.version_mv2"),
        ]
        for label, mutator, expected_rule in cases:
            with tempfile.TemporaryDirectory(prefix=f"foxhub_mprobe_{label}_") as tmp:
                root = Path(tmp)
                _write_valid_probe_extension(root)
                m_path = root / "manifest.json"
                m_data = json.loads(m_path.read_text(encoding="utf-8"))
                mutator(m_data)
                m_path.write_text(json.dumps(m_data), encoding="utf-8")
                rep = lint_extension(root, check_firefox_js=False)
                self.assertFalse(rep["ok"], f"Negative probe {label} unexpectedly passed lint")
                self.assertTrue(
                    any(e["rule"] == expected_rule for e in rep["errors"]),
                    f"Probe {label} expected rule {expected_rule}, got {rep['errors']}",
                )

    def test_f1_web_accessible_resources_boundaries(self) -> None:
        war_probes = [
            (["../secret.js"], "manifest.war_traversal"),
            (["tests/*"], "manifest.war_sensitive"),
            ([".git/config"], "manifest.war_sensitive"),
            ([""], "manifest.war_invalid"),
            (["src/content/nonexistent/*.js"], "manifest.war_missing"),
        ]
        for idx, (war_list, expected_rule) in enumerate(war_probes):
            with tempfile.TemporaryDirectory(prefix=f"foxhub_war_{idx}_") as tmp:
                root = Path(tmp)
                _write_valid_probe_extension(root)
                m_path = root / "manifest.json"
                m_data = json.loads(m_path.read_text(encoding="utf-8"))
                m_data["web_accessible_resources"] = war_list
                m_path.write_text(json.dumps(m_data), encoding="utf-8")
                rep = lint_extension(root, check_firefox_js=False)
                self.assertFalse(rep["ok"], f"WAR probe {war_list!r} should fail lint")
                self.assertTrue(
                    any(e["rule"] == expected_rule for e in rep["errors"]),
                    f"WAR probe {war_list!r} expected {expected_rule}, got {rep['errors']}",
                )

        # Actual repo manifest WAR sanity check (if declared)
        manifest = self._read_manifest()
        actual_war = manifest.get("web_accessible_resources") or []
        self.assertIsInstance(actual_war, list)
        for entry in actual_war:
            self.assertIsInstance(entry, str)
            clean = entry.strip().lstrip("/")
            self.assertTrue(clean, "web_accessible_resources entries must be non-empty")
            self.assertNotIn("..", Path(clean).parts, f"WAR traversal disallowed: {entry}")
            self.assertFalse(clean.startswith(("tests", ".git")), f"WAR sensitive path disallowed: {entry}")
            matches = [m for m in REPO_ROOT.glob(clean) if m.is_file()]
            self.assertGreater(len(matches), 0, f"Actual manifest WAR entry matched 0 files: {entry}")

    def test_f1_tab_media_watcher_zero_dom_css_footprint(self) -> None:
        watcher = REPO_ROOT / "src" / "content" / "tab-media-watcher.js"
        self.assertTrue(watcher.is_file(), f"Missing lightweight watcher: {watcher}")

        fixture_html = (
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<title>Normal Web Page (Local Fixture)</title>"
            "</head><body>"
            "<h1>Normal HTTP Tab</h1>"
            "<video id='tab-video'></video>"
            "<audio id='tab-audio'></audio>"
            "<script>"
            "(function () {"
            "  var v = document.getElementById('tab-video');"
            "  var isPlaying = true;"
            "  Object.defineProperty(v, 'paused', { get: function () { return !isPlaying; }, configurable: true });"
            "  Object.defineProperty(v, 'duration', { get: function () { return 120; }, configurable: true });"
            "  Object.defineProperty(v, 'mozHasAudio', { get: function () { return true; }, configurable: true });"
            "  v.play = function () { isPlaying = true; v.dispatchEvent(new Event('play')); return Promise.resolve(); };"
            "  v.pause = function () { isPlaying = false; v.dispatchEvent(new Event('pause')); };"
            "})();"
            "</script>"
            "<script src='/__test__/mock_seed.js'></script>"
            "<script src='/__test__/webext_mock.js'></script>"
            "<script src='/src/content/tab-media-watcher.js'></script>"
            "</body></html>"
        )
        tab_url = self.server.register_fixture("t2_f1_normal_tab.html", fixture_html)
        self.fx.navigate(tab_url)
        self._install_error_trap()
        probe = self.fx.eval_async_js(
            """
            const sheetCount = document.styleSheets ? document.styleSheets.length : -1;
            const styleTagCount = document.querySelectorAll('style').length;
            const pmNodes = document.querySelectorAll('[id^="pm-"], [id^="foxhub-"], [class*="pm-"]').length;
            const frameFlag = window.sessionStorage.getItem('__pm_foxhub_frame');
            const v = document.getElementById('tab-video');
            let activeReply = null;
            let pausedReply = null;
            if (window.__webextMock && window.browser && browser.runtime) {
              activeReply = await browser.runtime.sendMessage({ type: 'CHECK_TAB_HAS_ACTIVE_MEDIA' });
              if (v) v.pause();
              pausedReply = await browser.runtime.sendMessage({ type: 'CHECK_TAB_HAS_ACTIVE_MEDIA' });
            }
            return { sheetCount, styleTagCount, pmNodes, frameFlag, activeReply, pausedReply };
            """
        )
        self.assertEqual(probe["sheetCount"], 0, "tab-media-watcher.js must inject zero stylesheets")
        self.assertEqual(probe["styleTagCount"], 0, "tab-media-watcher.js must inject zero <style> elements")
        self.assertEqual(probe["pmNodes"], 0, "tab-media-watcher.js must inject zero FoxHub DOM nodes")
        self.assertIsNone(probe["frameFlag"], "Normal tab must not set __pm_foxhub_frame")
        self.assertIsInstance(probe["activeReply"], dict)
        self.assertTrue(probe["activeReply"].get("hasActiveMedia"), "Playing tab should report hasActiveMedia: true")
        self.assertFalse(
            bool(probe["pausedReply"] and probe["pausedReply"].get("hasActiveMedia")),
            "Paused tab must not report active media",
        )
        self._assert_no_page_errors("test_f1_tab_media_watcher_zero_dom_css_footprint")

    # ==================================================================
    # F2: Split media-frame-optimizer.js Boundaries (6 tests)
    # ==================================================================

    def test_f2_unknown_host_in_frame_context(self) -> None:
        frame_ctx = REPO_ROOT / "src" / "content" / "core" / "frame-context.js"
        self.assertTrue(frame_ctx.is_file(), f"Missing split module: {frame_ctx}")

        scripts = ["/src/content/tab-media-watcher.js"]
        if (REPO_ROOT / "src" / "shared" / "media-apps.js").is_file():
            scripts.insert(0, "/src/shared/media-apps.js")

        module_code = (
            "import { initFrameContext } from '/src/content/core/frame-context.js';\n"
            "try {\n"
            "  const ctx = initFrameContext();\n"
            "  window.__t2Ctx = {\n"
            "    isFoxHubContext: ctx && ctx.isFoxHubContext,\n"
            "    appId: ctx && ctx.appMeta ? ctx.appMeta.appId : null,\n"
            "    cssSlug: ctx && ctx.appMeta ? ctx.appMeta.cssSlug : null,\n"
            "    isKnownBuiltInHost: ctx && ctx.appMeta ? ctx.appMeta.isKnownBuiltInHost : null\n"
            "  };\n"
            "} catch (e) {\n"
            "  window.__t2Errors.push('module: ' + (e && e.message ? e.message : String(e)));\n"
            "} finally {\n"
            "  window.__t2ModuleDone = true;\n"
            "}\n"
        )
        child_url = self._register_error_collecting_fixture(
            "t2_f2_unknown_host_child.html",
            scripts,
            body_html="<div id='host-probe'>Unknown Host Frame</div>",
            module_code=module_code,
        )
        host_doc = (
            "<!doctype html><html><head><meta charset='utf-8'></head><body>"
            f"<iframe id='custom-frame' name='pm-media-frame-custom-99' src='{child_url}'></iframe>"
            "</body></html>"
        )
        host_url = self.server.register_fixture("t2_f2_unknown_host_host.html", host_doc)
        self.fx.navigate(host_url)
        try:
            res = self.fx.eval_async_js(
                """
                const deadline = Date.now() + 3000;
                const frame = document.getElementById('custom-frame');
                while (Date.now() < deadline) {
                  try {
                    const cw = frame && frame.contentWindow;
                    if (cw && cw.document && cw.document.readyState === 'complete' && cw.__t2ModuleDone) {
                      const baseLink = cw.document.getElementById('pm-frame-base-css');
                      const appLink = cw.document.getElementById('pm-frame-app-css');
                      if (baseLink && appLink) {
                        const ctx = cw.__t2Ctx || {};
                        return {
                          errors: cw.__t2Errors || [],
                          hasCtx: Boolean(cw.__t2Ctx),
                          isFoxHubContext: ctx.isFoxHubContext,
                          appId: ctx.appId,
                          cssSlug: ctx.cssSlug,
                          isKnownBuiltInHost: ctx.isKnownBuiltInHost,
                          hasBaseCss: Boolean(baseLink && baseLink.href.includes('base.css')),
                          hasCustomCss: Boolean(appLink && appLink.href.includes('custom.css')),
                          winName: cw.name
                        };
                      }
                    }
                  } catch (_) {}
                  await new Promise((r) => setTimeout(r, 25));
                }
                const cw = frame && frame.contentWindow;
                return cw ? {
                  errors: cw.__t2Errors || [],
                  hasCtx: Boolean(cw.__t2Ctx),
                  isFoxHubContext: cw.__t2Ctx ? cw.__t2Ctx.isFoxHubContext : null,
                  appId: cw.__t2Ctx ? cw.__t2Ctx.appId : null,
                  cssSlug: cw.__t2Ctx ? cw.__t2Ctx.cssSlug : null,
                  isKnownBuiltInHost: cw.__t2Ctx ? cw.__t2Ctx.isKnownBuiltInHost : null,
                  hasBaseCss: Boolean(cw.document && cw.document.getElementById('pm-frame-base-css')),
                  hasCustomCss: Boolean(cw.document && cw.document.getElementById('pm-frame-app-css')),
                  winName: cw.name
                } : null;
                """
            )
            self.assertIsNotNone(res, "Unknown host iframe failed to load")
            self.assertEqual(res["winName"], "pm-media-frame-custom-99")
            self.assertEqual(res["errors"], [], f"Unknown host threw errors in frame-context.js: {res['errors']}")
            self.assertTrue(res["hasCtx"], "initFrameContext() must return context state")
            self.assertIs(
                res["isFoxHubContext"],
                True,
                "Unknown host inside pm-media-frame-custom-99 iframe must resolve isFoxHubContext === true",
            )
            self.assertIs(res["isKnownBuiltInHost"], False)
            self.assertEqual(res["cssSlug"], "custom")
            self.assertEqual(res["appId"], "custom-99")
            self.assertTrue(res["hasBaseCss"], "pm-media-frame-custom-99 must inject base.css")
            self.assertTrue(res["hasCustomCss"], "Unknown host inside FoxHub frame must inject custom.css")
        finally:
            self.fx.eval_js("try { window.sessionStorage.clear(); } catch (_) {}")

    def test_f2_missing_optimizer_fallback(self) -> None:
        lifecycle = REPO_ROOT / "src" / "content" / "core" / "lifecycle-router.js"
        self.assertTrue(lifecycle.is_file(), f"Missing split module: {lifecycle}")
        frame_ctx = REPO_ROOT / "src" / "content" / "core" / "frame-context.js"
        self.assertTrue(frame_ctx.is_file(), f"Missing split module: {frame_ctx}")

        self._boot_background_page()
        bundle = self.fx.eval_async_js(
            """
            const unknownApp = await browser.runtime.sendMessage({
              type: 'GET_FRAME_OPT_BUNDLE',
              appId: 'nonexistent_app_xyz',
              url: 'https://example.invalid/'
            });
            const emptyUrl = await browser.runtime.sendMessage({
              type: 'GET_FRAME_OPT_BUNDLE',
              url: ''
            });
            const traversal = await browser.runtime.sendMessage({
              type: 'GET_FRAME_OPT_BUNDLE',
              appId: '../../etc/passwd'
            });
            return { unknownApp, emptyUrl, traversal };
            """
        )
        self.assertIsInstance(bundle["unknownApp"], dict)
        self.assertTrue(bundle["unknownApp"].get("ok"))
        self.assertIsInstance(bundle["emptyUrl"], dict)
        self.assertTrue(bundle["emptyUrl"].get("ok"))
        self.assertEqual(bundle["emptyUrl"].get("appId"), "")
        self.assertEqual(bundle["emptyUrl"].get("cssPath"), "src/content/css/base.css")
        self.assertIsInstance(bundle["traversal"], dict)
        self.assertNotIn("..", bundle["traversal"].get("appId", ""))
        self.assertNotIn("/", bundle["traversal"].get("appId", ""))
        self._assert_no_page_errors("test_f2_missing_optimizer_fallback")

        # Boot frame-bootstrap.js inside a FoxHub frame where detectFrameApp resolves a non-empty
        # optimizerFile ('spotify.js'), rewrite browser.runtime.getURL('optimizers/...') to a
        # nonexistent module, and verify bootstrapFoxHubFrame catches the dynamic import rejection
        # and still initializes lifecycle routing with zero uncaught JS errors.
        self.server.clear_seed()
        self.fx.reset_to_blank()
        frame_scripts = ["/src/content/tab-media-watcher.js"]
        if (REPO_ROOT / "src" / "shared" / "media-apps.js").is_file():
            frame_scripts.insert(0, "/src/shared/media-apps.js")
        module_code = (
            "const origGetURL = browser.runtime.getURL.bind(browser.runtime);\n"
            "const optimizerGetUrlCalls = [];\n"
            "browser.runtime.getURL = (p) => {\n"
            "  const s = String(p || '');\n"
            "  if (s.includes('optimizers/')) {\n"
            "    optimizerGetUrlCalls.push(s);\n"
            "    return origGetURL('src/content/optimizers/nonexistent.js');\n"
            "  }\n"
            "  return origGetURL(p);\n"
            "};\n"
            "const origEndsWith = String.prototype.endsWith;\n"
            "String.prototype.endsWith = function(search, pos) {\n"
            "  if (String(this) === '127.0.0.1' && search === '.spotify.com') return true;\n"
            "  return origEndsWith.call(this, search, pos);\n"
            "};\n"
            "try {\n"
            "  const bootMod = await import('/src/content/core/frame-bootstrap.js?missing=1');\n"
            "  await bootMod.bootstrapFoxHubFrame({ cleanWindowName: 'pm-media-frame-spotify', isFoxHubMediaFrame: true, isFoxHubContext: true });\n"
            "  window.__t2MissingOptState = {\n"
            "    optimizerGetUrlCalls,\n"
            "    routerOk: true\n"
            "  };\n"
            "} catch (e) {\n"
            "  window.__t2Errors.push('module: ' + (e && e.message ? e.message : String(e)));\n"
            "} finally {\n"
            "  String.prototype.endsWith = origEndsWith;\n"
            "  window.__t2ModuleDone = true;\n"
            "}\n"
        )
        child_url = self._register_error_collecting_fixture(
            "t2_f2_missing_opt_child.html",
            frame_scripts,
            body_html="<div id='missing-opt-probe'>Missing Optimizer Frame</div>",
            module_code=module_code,
        )
        host_doc = (
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<script>"
            "window.__t2ParentMsgs = [];"
            "window.addEventListener('message', function(e) {"
            "  if (e && e.data && e.data.source === 'pocketmail-media-frame') {"
            "    window.__t2ParentMsgs.push(e.data.type);"
            "  }"
            "});"
            "</script></head><body>"
            f"<iframe id='opt-frame' name='pm-media-frame-spotify' src='{child_url}'></iframe>"
            "</body></html>"
        )
        host_url = self.server.register_fixture("t2_f2_missing_opt_host.html", host_doc)
        self.fx.navigate(host_url)
        try:
            frame_res = self.fx.eval_async_js(
                """
                const deadline = Date.now() + 3000;
                const frame = document.getElementById('opt-frame');
                while (Date.now() < deadline) {
                  try {
                    const cw = frame && frame.contentWindow;
                    if (cw && cw.document && cw.document.readyState === 'complete' && cw.__t2ModuleDone) {
                      await new Promise((r) => setTimeout(r, 120));
                      return {
                        errs: cw.__t2Errors || [],
                        state: cw.__t2MissingOptState || null,
                        parentMsgs: window.__t2ParentMsgs || []
                      };
                    }
                  } catch (_) {}
                  await new Promise((r) => setTimeout(r, 25));
                }
                return null;
                """
            )
            self.assertIsNotNone(frame_res, "Missing-optimizer iframe failed to load")
            self.assertEqual(
                frame_res["errs"],
                [],
                f"frame-bootstrap.js threw uncaught errors on nonexistent optimizer import: {frame_res['errs']}",
            )
            self.assertIsNotNone(frame_res["state"])
            self.assertTrue(
                any("optimizers/" in p for p in frame_res["state"]["optimizerGetUrlCalls"]),
                f"Expected browser.runtime.getURL to be called for optimizers/, got {frame_res['state']}",
            )
            self.assertTrue(frame_res["state"]["routerOk"])
            self.assertTrue(
                any(t in ("PM_FRAME_START", "PM_FRAME_DOM_READY") for t in frame_res["parentMsgs"]),
                f"Expected lifecycle postMessage to parent, got {frame_res['parentMsgs']}",
            )
        finally:
            self.fx.eval_js("try { window.sessionStorage.clear(); } catch (_) {}")

    def test_f2_is_foxhub_context_true_vs_false_boundaries(self) -> None:
        frame_ctx = REPO_ROOT / "src" / "content" / "core" / "frame-context.js"
        self.assertTrue(frame_ctx.is_file(), f"Missing split module: {frame_ctx}")

        # Clear any prior sessionStorage on the FixtureServer origin before loading normal_url
        clear_url = self.server.register_fixture("t2_f2_clear_ss.html", "<!doctype html><html><body></body></html>")
        self.fx.navigate(clear_url)
        self.fx.eval_js("try { window.sessionStorage.clear(); } catch (_) {}")

        ctx_probe_module = (
            "import { initFrameContext } from '/src/content/core/frame-context.js';\n"
            "try {\n"
            "  const ctx = initFrameContext();\n"
            "  window.__t2Ctx = { isFoxHubContext: ctx && ctx.isFoxHubContext };\n"
            "} catch (e) {\n"
            "  window.__t2Errors.push('module: ' + (e && e.message ? e.message : String(e)));\n"
            "} finally {\n"
            "  window.__t2ModuleDone = true;\n"
            "}\n"
        )

        # Top-level normal page must NOT set FoxHub context flag or inject sidebar CSS
        normal_url = self._register_error_collecting_fixture(
            "t2_f2_normal_top.html",
            ["/src/content/tab-media-watcher.js"],
            body_html="<div>Normal Tab</div>",
            module_code=ctx_probe_module,
        )
        self.fx.navigate(normal_url)
        top_state = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 2500;
            while (Date.now() < deadline && !window.__t2ModuleDone) {
              await new Promise((r) => setTimeout(r, 20));
            }
            await new Promise((r) => setTimeout(r, 80));
            const ctx = window.__t2Ctx || null;
            return {
              done: Boolean(window.__t2ModuleDone),
              flag: window.sessionStorage.getItem('__pm_foxhub_frame'),
              hasCtx: Boolean(ctx),
              isFoxHubContext: ctx && 'isFoxHubContext' in ctx ? ctx.isFoxHubContext : null,
              cssCount: document.querySelectorAll('style[id^="pm-"], link[href*="src/content/css/"]').length,
              errs: window.__t2Errors || []
            };
            """
        )
        self.assertTrue(top_state["done"])
        self.assertEqual(top_state["errs"], [])
        self.assertTrue(top_state["hasCtx"], "initFrameContext() must return context on top-level page")
        self.assertIs(top_state["isFoxHubContext"], False, "Normal top-level page must have isFoxHubContext === false")
        self.assertIsNone(top_state["flag"], "Normal top-level page must not set __pm_foxhub_frame")
        self.assertEqual(top_state["cssCount"], 0, "Normal top-level page must receive zero sidebar CSS")

        # Direct FoxHub child iframe vs grandchild third-party iframe
        grandchild_url = self._register_error_collecting_fixture(
            "t2_f2_grandchild.html",
            ["/src/content/tab-media-watcher.js"],
            body_html="<div>Third Party Ad</div>",
            module_code=ctx_probe_module,
        )
        child_url = self._register_error_collecting_fixture(
            "t2_f2_child.html",
            ["/src/content/tab-media-watcher.js"],
            body_html=f"<iframe id='ad-frame' name='thirdparty-ad' src='{grandchild_url}'></iframe>",
            module_code=ctx_probe_module,
        )
        host_doc = (
            "<!doctype html><html><head><meta charset='utf-8'></head><body>"
            f"<iframe id='media-frame' name='pm-media-frame-spotify' src='{child_url}'></iframe>"
            "</body></html>"
        )
        host_url = self.server.register_fixture("t2_f2_host.html", host_doc)
        self.fx.navigate(host_url)
        try:
            iframe_res = self.fx.eval_async_js(
                """
                const deadline = Date.now() + 3000;
                const child = document.getElementById('media-frame');
                while (Date.now() < deadline) {
                  try {
                    const cw = child && child.contentWindow;
                    const gc = cw && cw.document && cw.document.getElementById('ad-frame');
                    if (cw && cw.document && cw.document.readyState === 'complete' && cw.__t2ModuleDone &&
                        gc && gc.contentWindow && gc.contentWindow.document.readyState === 'complete' && gc.contentWindow.__t2ModuleDone) {
                      await new Promise((r) => setTimeout(r, 80));
                      const gcw = gc.contentWindow;
                      const childCtx = cw.__t2Ctx || null;
                      const gcCtx = gcw.__t2Ctx || null;
                      return {
                        childFlag: cw.sessionStorage.getItem('__pm_foxhub_frame'),
                        childHasCtx: Boolean(childCtx),
                        childIsFoxHub: childCtx && 'isFoxHubContext' in childCtx ? childCtx.isFoxHubContext : null,
                        childHasBaseCss: Boolean(cw.document.getElementById('pm-frame-base-css')),
                        gcHasCtx: Boolean(gcCtx),
                        gcIsFoxHub: gcCtx && 'isFoxHubContext' in gcCtx ? gcCtx.isFoxHubContext : null,
                        gcCssCount: gcw.document.querySelectorAll('style[id^="pm-"], link[href*="src/content/css/"]').length,
                        childErrs: cw.__t2Errors || [],
                        gcErrs: gcw.__t2Errors || []
                      };
                    }
                  } catch (_) {}
                  await new Promise((r) => setTimeout(r, 25));
                }
                return null;
                """
            )
            self.assertIsNotNone(iframe_res, "Child/grandchild iframes failed to load")
            self.assertEqual(iframe_res["childErrs"], [])
            self.assertEqual(iframe_res["gcErrs"], [])
            self.assertTrue(iframe_res["childHasCtx"], "Child iframe must resolve initFrameContext()")
            self.assertIs(iframe_res["childIsFoxHub"], True, "pm-media-frame-spotify iframe must have isFoxHubContext === true")
            self.assertEqual(iframe_res["childFlag"], "1", "pm-media-frame-spotify iframe must mark FoxHub context")
            self.assertTrue(iframe_res["childHasBaseCss"], "pm-media-frame-spotify iframe must inject base CSS")
            self.assertTrue(iframe_res["gcHasCtx"], "Grandchild iframe must resolve initFrameContext()")
            self.assertIs(
                iframe_res["gcIsFoxHub"],
                False,
                "Grandchild third-party iframe (name='thirdparty-ad') must have isFoxHubContext === false",
            )
            self.assertEqual(iframe_res["gcCssCount"], 0, "Grandchild third-party iframe must receive zero sidebar CSS")
        finally:
            self.fx.eval_js("try { window.sessionStorage.clear(); } catch (_) {}")

    def test_f2_duplicate_document_start_load_idempotence(self) -> None:
        watcher = REPO_ROOT / "src" / "content" / "tab-media-watcher.js"
        frame_ctx = REPO_ROOT / "src" / "content" / "core" / "frame-context.js"
        self.assertTrue(watcher.is_file(), f"Missing {watcher}")
        self.assertTrue(frame_ctx.is_file(), f"Missing {frame_ctx}")

        module_code = (
            "try {\n"
            "  const m1 = await import('/src/content/core/frame-context.js?dup=1');\n"
            "  const m2 = await import('/src/content/core/frame-context.js?dup=2');\n"
            "  const b1 = await import('/src/content/core/frame-bootstrap.js');\n"
            "  const c1 = m1.initFrameContext();\n"
            "  const c2 = m2.initFrameContext();\n"
            "  await b1.bootstrapFoxHubFrame();\n"
            "  await b1.bootstrapFoxHubFrame();\n"
            "  window.__t2DupOk = Boolean(c1 && c2 && c1.isFoxHubContext === false && c2.isFoxHubContext === false);\n"
            "} catch (e) {\n"
            "  window.__t2Errors.push('module: ' + (e && e.message ? e.message : String(e)));\n"
            "} finally {\n"
            "  window.__t2ModuleDone = true;\n"
            "}\n"
        )
        dup_url = self._register_error_collecting_fixture(
            "t2_f2_dup_load.html",
            [
                "/src/content/tab-media-watcher.js",
                "/src/content/tab-media-watcher.js",
            ],
            body_html="<video id='v' muted></video>",
            module_code=module_code,
        )
        self.fx.navigate(dup_url)
        res = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 2500;
            while (Date.now() < deadline && !window.__t2ModuleDone) {
              await new Promise((r) => setTimeout(r, 20));
            }
            const v = document.getElementById('v');
            if (v) {
              v.dispatchEvent(new Event('playing'));
              v.dispatchEvent(new Event('pause'));
            }
            return {
              done: Boolean(window.__t2ModuleDone),
              dupOk: Boolean(window.__t2DupOk),
              errors: window.__t2Errors || []
            };
            """
        )
        self.assertTrue(res["done"])
        self.assertTrue(res["dupOk"])
        self.assertEqual(res["errors"], [], f"Duplicate script injection threw errors: {res['errors']}")

    def test_f2_heavy_css_scope_isolation_and_monolith_retired(self) -> None:
        monolith = REPO_ROOT / "src" / "shared" / "media-frame-optimizer.js"
        self.assertFalse(monolith.exists(), f"Monolithic {monolith} must be retired/removed after M2 split")

        base_css = REPO_ROOT / "src" / "content" / "css" / "base.css"
        self.assertTrue(base_css.is_file(), f"Missing base content CSS: {base_css}")
        self.assertGreater(base_css.stat().st_size, 0, "src/content/css/base.css must not be empty")

        css_dir = REPO_ROOT / "src" / "content" / "css"
        opt_dir = REPO_ROOT / "src" / "content" / "optimizers"
        self.assertTrue(css_dir.is_dir(), f"Missing CSS directory: {css_dir}")
        self.assertTrue(opt_dir.is_dir(), f"Missing optimizers directory: {opt_dir}")

        per_app_css = [p for p in css_dir.glob("*.css") if p.name != "base.css"]
        per_app_opt = list(opt_dir.glob("*.js"))
        self.assertGreaterEqual(len(per_app_css), 14, f"Expected >= 14 per-app CSS files, found {len(per_app_css)}")
        self.assertGreaterEqual(len(per_app_opt), 14, f"Expected >= 14 per-app optimizer files, found {len(per_app_opt)}")

        manifest = self._read_manifest()
        manifest_text = json.dumps(manifest)
        self.assertNotIn("media-frame-optimizer.js", manifest_text)
        for cs in manifest.get("content_scripts") or []:
            for css_ref in cs.get("css") or []:
                self.assertNotIn("src/content/css/", css_ref)

    def test_f2_google_account_widget_iframe_boundary(self) -> None:
        frame_ctx = REPO_ROOT / "src" / "content" / "core" / "frame-context.js"
        self.assertTrue(frame_ctx.is_file(), f"Missing split module: {frame_ctx}")

        scripts = ["/src/content/tab-media-watcher.js"]
        module_code = (
            "import { initFrameContext } from '/src/content/core/frame-context.js';\n"
            "import { bootstrapFoxHubFrame } from '/src/content/core/frame-bootstrap.js';\n"
            "try {\n"
            "  const ctx = initFrameContext();\n"
            "  await bootstrapFoxHubFrame();\n"
            "  window.__t2Ctx = { isFoxHubContext: ctx && ctx.isFoxHubContext };\n"
            "} catch (e) {\n"
            "  window.__t2Errors.push('module: ' + (e && e.message ? e.message : String(e)));\n"
            "} finally {\n"
            "  window.__t2ModuleDone = true;\n"
            "}\n"
        )

        # Part 1: Pre-seed sessionStorage on same origin and verify top-level page (window.top === window.self, empty name)
        # still resolves isFoxHubContext === false and injects zero sidebar CSS.
        url = self._register_error_collecting_fixture(
            "t2_f2_top_isolation.html",
            scripts,
            body_html="<div>Top Level Page</div>",
            module_code=module_code,
        )
        self.fx.navigate(url)
        try:
            res = self.fx.eval_async_js(
                """
                const deadline = Date.now() + 2500;
                while (Date.now() < deadline && !window.__t2ModuleDone) {
                  await new Promise((r) => setTimeout(r, 20));
                }
                window.sessionStorage.setItem('__pm_foxhub_frame', '1');
                return { errors: window.__t2Errors || [] };
                """
            )
            self.assertEqual(res["errors"], [])
            self.fx.navigate(url)
            res2 = self.fx.eval_async_js(
                """
                const deadline = Date.now() + 2500;
                while (Date.now() < deadline && !window.__t2ModuleDone) {
                  await new Promise((r) => setTimeout(r, 20));
                }
                await new Promise((r) => setTimeout(r, 80));
                const ctx = window.__t2Ctx || null;
                const styles = document.querySelectorAll('style[id^="pm-"], link[href*="src/content/css/"]').length;
                return {
                  done: Boolean(window.__t2ModuleDone),
                  hasCtx: Boolean(ctx),
                  isFoxHubContext: ctx && 'isFoxHubContext' in ctx ? ctx.isFoxHubContext : null,
                  styles,
                  errors: window.__t2Errors || []
                };
                """
            )
            self.assertTrue(res2["done"])
            self.assertEqual(res2["errors"], [])
            self.assertTrue(res2["hasCtx"], "initFrameContext() must return context on top-level page")
            self.assertIs(
                res2["isFoxHubContext"],
                False,
                "Top-level non-FoxHub page must resolve isFoxHubContext === false even with pre-seeded sessionStorage",
            )
            self.assertEqual(res2["styles"], 0, "Top-level non-FoxHub tab must never receive sidebar CSS")

            # Part 2: Nested non-FoxHub widget iframe (even when sessionStorage.__pm_foxhub_frame === '1' is set on origin)
            # must NOT elevate to isFoxHubContext === true.
            widget_url = self._register_error_collecting_fixture(
                "t2_f2_nested_widget.html",
                scripts,
                body_html="<div>Embedded Account Widget</div>",
                module_code=module_code,
            )
            wrapper_url = self._register_error_collecting_fixture(
                "t2_f2_widget_wrapper.html",
                scripts,
                body_html=f"<iframe id='widget-frame' name='google-account-widget' src='{widget_url}'></iframe>",
                module_code=module_code,
            )
            host_doc = (
                "<!doctype html><html><head><meta charset='utf-8'></head><body>"
                f"<iframe id='outer-frame' name='outer-non-foxhub' src='{wrapper_url}'></iframe>"
                "</body></html>"
            )
            host_url = self.server.register_fixture("t2_f2_widget_host.html", host_doc)
            self.fx.navigate(host_url)
            nested_res = self.fx.eval_async_js(
                """
                const deadline = Date.now() + 3000;
                const outer = document.getElementById('outer-frame');
                while (Date.now() < deadline) {
                  try {
                    const ow = outer && outer.contentWindow;
                    const wf = ow && ow.document && ow.document.getElementById('widget-frame');
                    if (ow && ow.document && ow.document.readyState === 'complete' &&
                        wf && wf.contentWindow && wf.contentWindow.document.readyState === 'complete' && wf.contentWindow.__t2ModuleDone) {
                      await new Promise((r) => setTimeout(r, 80));
                      const ww = wf.contentWindow;
                      const wCtx = ww.__t2Ctx || null;
                      const wStyles = ww.document.querySelectorAll('style[id^="pm-"], link[href*="src/content/css/"]').length;
                      return {
                        hasCtx: Boolean(wCtx),
                        isFoxHubContext: wCtx && 'isFoxHubContext' in wCtx ? wCtx.isFoxHubContext : null,
                        styles: wStyles,
                        errors: ww.__t2Errors || []
                      };
                    }
                  } catch (_) {}
                  await new Promise((r) => setTimeout(r, 25));
                }
                return null;
                """
            )
            self.assertIsNotNone(nested_res, "Nested widget iframe failed to load")
            self.assertEqual(nested_res["errors"], [])
            self.assertTrue(nested_res["hasCtx"], "Nested widget iframe must resolve initFrameContext()")
            self.assertIs(
                nested_res["isFoxHubContext"],
                False,
                "Nested non-FoxHub widget iframe must never elevate to isFoxHubContext === true",
            )
            self.assertEqual(nested_res["styles"], 0, "Nested non-FoxHub widget iframe must receive zero sidebar CSS")
        finally:
            self.fx.eval_js("try { window.sessionStorage.clear(); } catch (_) {}")

    # ==================================================================
    # F3: Split background.js Boundaries (6 tests)
    # ==================================================================

    def test_f3_unknown_and_malformed_runtime_messages(self) -> None:
        self._boot_background_page()
        res = self.fx.eval_async_js(
            """
            const payloads = [
              null,
              undefined,
              123,
              {},
              { type: '' },
              { type: 'UNKNOWN_XYZ' },
              { type: 'OPEN_APP_FROM_CONTEXT_MENU' },
              { type: 'GET_FRAME_OPT_BUNDLE', appId: '../../etc/passwd' }
            ];
            const out = [];
            for (const p of payloads) {
              out.push(await browser.runtime.sendMessage(p));
            }
            return out;
            """
        )
        self.assertEqual(len(res), 8)
        for idx in range(7):
            self.assertIsInstance(res[idx], dict, f"Payload {idx} returned non-dict: {res[idx]!r}")
            self.assertFalse(res[idx].get("ok"), f"Malformed/unknown payload {idx} must return ok: false")

        bundle_resp = res[7]
        self.assertIsInstance(bundle_resp, dict)
        self.assertTrue(bundle_resp.get("ok"))
        self.assertEqual(bundle_resp.get("appId"), "etcpasswd")
        self.assertNotIn("..", bundle_resp.get("optimizerPath", ""))
        self._assert_no_page_errors("test_f3_unknown_and_malformed_runtime_messages")

    def test_f3_clear_persistent_sessions_and_update_session_edges(self) -> None:
        router_path = REPO_ROOT / "src" / "background" / "bg-router.js"
        self.assertTrue(router_path.is_file(), f"Missing {router_path}")
        router_src = router_path.read_text(encoding="utf-8")
        occurrences = len(re.findall(r"case\s+['\"]UPDATE_PERSISTENT_SESSION['\"]\s*:", router_src))
        self.assertEqual(occurrences, 1, f"Expected exactly 1 UPDATE_PERSISTENT_SESSION case, found {occurrences}")

        seed = {
            "storage": {
                "settings": {
                    "persistenceMode": "selected",
                    "persistentAppIds": ["spotify"],
                    "persistentLastActiveAppId": "spotify",
                    "persistentOpenAppIds": ["spotify"],
                    "persistentSavedAppUrls": {"spotify": "https://open.spotify.com/album/1"},
                    "topBarAutoHideMigratedV1": True,
                    "persistenceDefaultOffMigratedV4": True,
                    "bgAudioAppIdsMigratedV1": True,
                    "bgAudioAppIdsSoundCloudMigratedV2": True,
                }
            }
        }
        self._boot_background_page(seed)
        res = self.fx.eval_async_js(
            """
            const deadline = Date.now() + 2000;
            while (Date.now() < deadline) {
              if (window.FoxHubBg.state.currentSettings.persistentLastActiveAppId === 'spotify') break;
              await new Promise((r) => setTimeout(r, 20));
            }
            window.__webextMock.clearCalls();

            const upd = await browser.runtime.sendMessage({
              type: 'UPDATE_PERSISTENT_SESSION',
              appId: 'spotify',
              url: 'https://open.spotify.com/?pm_boot=1'
            });
            const urlAfterBootProbe = window.FoxHubBg.state.currentSettings.persistentSavedAppUrls.spotify;

            const clr = await browser.runtime.sendMessage({ type: 'CLEAR_PERSISTENT_SESSIONS' });
            await new Promise((r) => setTimeout(r, 50));
            const stored = await browser.storage.local.get('settings');
            const calls = window.__webextMock.getCalls('runtime.sendMessage');
            const broadcasted = calls.some((c) => c && c.args && c.args[0] && c.args[0].type === 'STATE_UPDATED');

            return { upd, urlAfterBootProbe, clr, storedSettings: stored.settings, broadcasted };
            """
        )
        self.assertTrue(res["upd"].get("ok"))
        self.assertEqual(
            res["urlAfterBootProbe"],
            "https://open.spotify.com/album/1",
            "UPDATE_PERSISTENT_SESSION must ignore URLs containing pm_boot=1",
        )
        self.assertTrue(res["clr"].get("ok"))
        clr_s = res["clr"].get("settings") or {}
        self.assertEqual(clr_s.get("persistentLastActiveAppId"), "pocketmail")
        self.assertEqual(clr_s.get("persistentOpenAppIds"), [])
        self.assertEqual(clr_s.get("persistentSavedAppUrls"), {})
        self.assertEqual((res["storedSettings"] or {}).get("persistentOpenAppIds"), [])
        self.assertTrue(res["broadcasted"], "CLEAR_PERSISTENT_SESSIONS must broadcast STATE_UPDATED")
        self._assert_no_page_errors("test_f3_clear_persistent_sessions_and_update_session_edges")

    def test_f3_corrupt_and_missing_storage_initialization(self) -> None:
        # Case A: empty storage
        self._boot_background_page({"storage": {}})
        empty_res = self.fx.eval_js(
            """
            const bg = window.FoxHubBg;
            return {
              theme: bg.state.currentSettings.theme,
              appsIsArr: Array.isArray(bg.state.currentSettings.enabledMediaApps),
              appsLen: (bg.state.currentSettings.enabledMediaApps || []).length,
              overlayVer: bg.state.localOverlay.overlayVersion
            };
            """
        )
        self.assertEqual(empty_res["theme"], "warm-linen")
        self.assertTrue(empty_res["appsIsArr"])
        self.assertGreater(empty_res["appsLen"], 0)
        self.assertEqual(empty_res["overlayVer"], 2)
        self._assert_no_page_errors("test_f3_corrupt_and_missing_storage_initialization(empty)")

        # Case B: corrupt storage + v1 localOverlay
        self.server.clear_seed()
        self.fx.reset_to_blank()
        corrupt_seed = {
            "storage": {
                "settings": {
                    "theme": "bad-999",
                    "pollIntervalSeconds": -99,
                    "enabledMediaApps": "bad",
                    "topBarAutoHideMigratedV1": True,
                    "persistenceDefaultOffMigratedV4": True,
                    "bgAudioAppIdsMigratedV1": True,
                    "bgAudioAppIdsSoundCloudMigratedV2": True,
                },
                "localOverlay": {
                    "overlayVersion": 1,
                    "readIds": {"m1": 1},
                    "sentMessages": "not-array",
                },
                "cachedState": None,
            }
        }
        self._boot_background_page(corrupt_seed)
        corrupt_res = self.fx.eval_async_js(
            """
            await new Promise((r) => setTimeout(r, 60));
            const bg = window.FoxHubBg;
            return {
              theme: bg.state.currentSettings.theme,
              poll: bg.state.currentSettings.pollIntervalSeconds,
              apps: bg.state.currentSettings.enabledMediaApps,
              overlay: bg.state.localOverlay,
              cachedState: bg.state.cachedState
            };
            """
        )
        self.assertEqual(corrupt_res["theme"], "warm-linen")
        self.assertEqual(corrupt_res["poll"], 15, "Negative pollIntervalSeconds must clamp to 15")
        self.assertIsInstance(corrupt_res["apps"], list)
        self.assertGreater(len(corrupt_res["apps"]), 0)
        self.assertEqual(corrupt_res["overlay"].get("overlayVersion"), 2)
        self.assertEqual(corrupt_res["overlay"].get("readIds"), {})
        self.assertEqual(corrupt_res["overlay"].get("sentMessages"), [])
        self.assertIsInstance(corrupt_res["cachedState"], dict)
        self._assert_no_page_errors("test_f3_corrupt_and_missing_storage_initialization(corrupt)")

    def test_f3_disconnected_port_cleanup_and_count_floor(self) -> None:
        self._boot_background_page()
        res = self.fx.eval_async_js(
            """
            const bg = window.FoxHubBg;
            const emePort = browser.runtime.connect({ name: 'foxhub-eme-bridge' });
            const sidebarPort = browser.runtime.connect({ name: 'foxhub-sidebar-lifecycle' });
            const popupPort = browser.runtime.connect({ name: 'foxhub-popup-lifecycle' });
            const unknownPort = browser.runtime.connect({ name: 'unknown-port' });

            emePort.postMessage({
              type: 'PM_SP_EME_BRIDGE',
              flatFrameName: 'pm-media-frame-spotify',
              bridgeType: 'BRIDGE_HELLO'
            });
            await new Promise((r) => setTimeout(r, 40));

            const midHasEme = bg.emeBridgePorts.has('sidebar:spotify');
            const midSidebarCount = bg.state.sidebarPortCount;
            const midPopupCount = bg.state.popupPortCount;

            emePort.disconnect();
            emePort.disconnect();
            sidebarPort.disconnect();
            sidebarPort.disconnect();
            popupPort.disconnect();
            popupPort.disconnect();
            unknownPort.disconnect();
            await new Promise((r) => setTimeout(r, 40));

            return {
              midHasEme,
              midSidebarCount,
              midPopupCount,
              afterHasEme: bg.emeBridgePorts.has('sidebar:spotify'),
              afterSidebarCount: bg.state.sidebarPortCount,
              afterPopupCount: bg.state.popupPortCount
            };
            """
        )
        self.assertTrue(res["midHasEme"], "EME bridge port should register sidebar:spotify on BRIDGE_HELLO")
        self.assertEqual(res["midSidebarCount"], 1)
        self.assertEqual(res["midPopupCount"], 1)
        self.assertFalse(res["afterHasEme"], "Disconnected EME port must be removed from emeBridgePorts")
        self.assertEqual(res["afterSidebarCount"], 0, "sidebarPortCount must return to 0 and never go negative")
        self.assertEqual(res["afterPopupCount"], 0, "popupPortCount must return to 0 and never go negative")
        self._assert_no_page_errors("test_f3_disconnected_port_cleanup_and_count_floor")

    def test_f3_dynamic_manifest_version_and_missing_optional_fields(self) -> None:
        self._boot_background_page({"manifest": {"version": "2.9.9", "name": "FoxHub", "manifest_version": 2}})
        res = self.fx.eval_async_js(
            """
            const exp1 = await browser.runtime.sendMessage({ type: 'EXPORT_SETTINGS' });
            browser.runtime.getManifest = () => undefined;
            const exp2 = await browser.runtime.sendMessage({ type: 'EXPORT_SETTINGS' });
            const updEmpty = await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS' });
            return { exp1, exp2, updEmpty };
            """
        )
        self.assertTrue(res["exp1"].get("ok"))
        self.assertEqual((res["exp1"].get("payload") or {}).get("appVersion"), "2.9.9")
        self.assertTrue(res["exp2"].get("ok"), "EXPORT_SETTINGS must fall back cleanly if getManifest returns undefined")
        self.assertTrue((res["exp2"].get("payload") or {}).get("appVersion"))
        self.assertTrue(res["updEmpty"].get("ok"), "UPDATE_SETTINGS with omitted settings must resolve ok: true")
        self._assert_no_page_errors("test_f3_dynamic_manifest_version_and_missing_optional_fields")

    def test_f3_background_split_module_integrity_and_hooks(self) -> None:
        bg_dir = REPO_ROOT / "src" / "background"
        self.assertFalse((bg_dir / "background.js").exists(), "Monolithic src/background/background.js must not exist")

        expected_modules = [
            "bg-state.js",
            "bg-gmail-sync.js",
            "bg-webrequest-cookies.js",
            "bg-audio-engine.js",
            "bg-tab-audio-watcher.js",
            "bg-shortcuts-context.js",
            "bg-router.js",
        ]
        bg_html = bg_dir / "background.html"
        self.assertTrue(bg_html.is_file(), f"Missing {bg_html}")
        html_text = bg_html.read_text(encoding="utf-8")
        for mod in expected_modules:
            self.assertTrue((bg_dir / mod).is_file(), f"Missing background module: {mod}")
            self.assertIn(mod, html_text, f"background.html does not load {mod}")

        self._boot_background_page()
        hooks = self.fx.eval_js(
            """
            return {
              hasBg: typeof window.FoxHubBg === 'object' && window.FoxHubBg !== null,
              consumeShortcut: typeof window.__pmConsumePendingShortcutApp,
              consumeContext: typeof window.__pmConsumePendingContextUrl,
              syncBoot: typeof window.__pmGetSyncBootState,
              emeBridge: typeof window.__pmHandleSpEmeBridge,
              audioDiag: typeof window.__pmGetAudioDiagnostics,
              standbyIds: typeof window.__pmGetStandbyPoolIds
            };
            """
        )
        self.assertTrue(hooks["hasBg"])
        for key in ("consumeShortcut", "consumeContext", "syncBoot", "emeBridge", "audioDiag", "standbyIds"):
            self.assertEqual(hooks[key], "function", f"Expected synchronous background hook {key} to be a function")
        self._assert_no_page_errors("test_f3_background_split_module_integrity_and_hooks")

    # ==================================================================
    # F4: Split popup.js Boundaries (6 tests)
    # ==================================================================

    def test_f4_popup_split_modules_exist_and_monolith_retired(self) -> None:
        popup_dir = REPO_ROOT / "src" / "popup"
        self.assertFalse((popup_dir / "popup.js").exists(), "Monolithic src/popup/popup.js must be retired/removed")

        expected_modules = [
            "popup-utils.js",
            "mail-view.js",
            "email-reader.js",
            "compose-drawer.js",
            "theme-studio.js",
            "media-workspace.js",
            "audio-controller.js",
            "left-rail.js",
            "quick-switcher.js",
            "now-playing-bar.js",
            "popup-main.js",
        ]
        popup_html = popup_dir / "popup.html"
        self.assertTrue(popup_html.is_file(), f"Missing {popup_html}")
        html_text = popup_html.read_text(encoding="utf-8")
        for mod in expected_modules:
            self.assertTrue((popup_dir / mod).is_file(), f"Missing popup split module: src/popup/{mod}")
            self.assertIn(mod, html_text, f"popup.html must reference {mod}")

        self.fx.navigate(self.server.url_for("/src/popup/popup.html"))
        self._install_error_trap()
        res = self.fx.eval_async_js(
            """
            await new Promise((r) => setTimeout(r, 120));
            return {
              hasNs: typeof window.FoxHubPopup === 'object' && window.FoxHubPopup !== null,
              errors: window.__t2Errors || []
            };
            """
        )
        self.assertTrue(res["hasNs"], "window.FoxHubPopup namespace must initialize on popup.html")
        self.assertEqual(res["errors"], [], f"popup.html boot errors: {res['errors']}")

    def test_f4_empty_and_corrupt_storage_boot(self) -> None:
        popup_dir = REPO_ROOT / "src" / "popup"
        self.assertFalse((popup_dir / "popup.js").exists(), "src/popup/popup.js must be split into modular scripts")

        self.server.set_seed({"storage": {}, "messageResponses": {"GET_STATE": None}})
        self.fx.navigate(self.server.url_for("/src/popup/popup.html"))
        self._install_error_trap()
        res = self.fx.eval_async_js(
            """
            await new Promise((r) => setTimeout(r, 150));
            return {
              hasPopupNs: typeof window.FoxHubPopup === 'object' && window.FoxHubPopup !== null,
              emailList: Boolean(document.getElementById('pm-email-list')),
              railApps: Boolean(document.getElementById('pm-rail-apps-list')),
              errors: window.__t2Errors || []
            };
            """
        )
        self.assertTrue(res["hasPopupNs"], "window.FoxHubPopup must initialize even on corrupt/null GET_STATE")
        self.assertTrue(res["emailList"])
        self.assertTrue(res["railApps"])
        self.assertEqual(res["errors"], [], f"Corrupt/null GET_STATE boot errors: {res['errors']}")

    def test_f4_offline_error_gmail_sync_ui_resilience(self) -> None:
        popup_dir = REPO_ROOT / "src" / "popup"
        self.assertFalse((popup_dir / "popup.js").exists(), "src/popup/popup.js must be split into modular scripts")

        offline_payload = {
            "state": {
                "accounts": [],
                "totalUnread": 0,
                "sentMessages": [],
                "lastSyncAt": 1700000000000,
                "usingDemo": False,
                "syncError": "NetworkError: Offline <script>alert(1)</script>",
            },
            "settings": {},
            "snoozed": {},
        }
        self.server.set_seed({"storage": {}, "messageResponses": {"GET_STATE": offline_payload, "SYNC_NOW": offline_payload}})
        self.fx.navigate(self.server.url_for("/src/popup/popup.html"))
        self._install_error_trap()
        rect = self.fx.get_bounding_rect("#btn-refresh")
        self.assertIsNotNone(rect, "Expected #btn-refresh in popup.html")
        self.assertGreater(rect["width"], 0)
        self.fx.click("#btn-refresh")

        res = self.fx.eval_async_js(
            """
            await new Promise((r) => setTimeout(r, 120));
            const sub = document.getElementById('pm-status-subtitle');
            const list = document.getElementById('pm-email-list');
            const injectedScripts = (list ? list.querySelectorAll('script').length : 0) +
                                    (sub ? sub.querySelectorAll('script').length : 0);
            return {
              injectedScripts,
              hasSettingsBtn: Boolean(document.getElementById('rail-btn-sidebar-settings')),
              errors: window.__t2Errors || []
            };
            """
        )
        self.assertEqual(res["injectedScripts"], 0, "Sync error text must never inject <script> elements")
        self.assertTrue(res["hasSettingsBtn"])
        self.assertEqual(res["errors"], [])

    def test_f4_rapid_view_switching_before_iframe_load(self) -> None:
        popup_dir = REPO_ROOT / "src" / "popup"
        self.assertFalse((popup_dir / "popup.js").exists(), "src/popup/popup.js must be split into modular scripts")

        state_payload = {
            "state": {"accounts": [], "totalUnread": 0, "sentMessages": [], "lastSyncAt": 1700000000000, "usingDemo": True},
            "settings": {"enabledMediaApps": ["instagram", "spotify", "youtube"], "sidebarOpenMode": "embedded"},
            "snoozed": {},
        }
        self.server.set_seed({"storage": {"settings": state_payload["settings"]}, "messageResponses": {"GET_STATE": state_payload}})
        self.fx.navigate(self.server.url_for("/src/popup/popup.html?sidebar=1"))
        self._install_error_trap()
        res = self.fx.eval_async_js(
            """
            await new Promise((r) => setTimeout(r, 150));
            const mailBtn = document.getElementById('rail-btn-mail');
            const appBtns = Array.from(document.querySelectorAll('#pm-rail-apps-list .pm-rail-item'));
            if (appBtns.length < 2 || !mailBtn) {
              return { ready: false, count: appBtns.length };
            }
            appBtns[0].click();
            await new Promise((r) => setTimeout(r, 15));
            appBtns[1].click();
            await new Promise((r) => setTimeout(r, 15));
            mailBtn.click();
            await new Promise((r) => setTimeout(r, 50));

            const ws = document.getElementById('pm-media-workspace');
            const wsHiddenWhenMail = ws ? (ws.classList.contains('hidden') || ws.classList.contains('pm-workspace-keepalive')) : null;
            const mailActive = mailBtn.classList.contains('active');
            const activeApps = appBtns.filter((b) => b.classList.contains('active')).length;

            appBtns[0].click();
            await new Promise((r) => setTimeout(r, 50));
            const wsVisibleWhenApp = ws ? (!ws.classList.contains('hidden') && !ws.classList.contains('pm-workspace-keepalive')) : false;

            return {
              ready: true,
              wsHiddenWhenMail,
              mailActive,
              activeApps,
              wsVisibleWhenApp,
              errors: window.__t2Errors || []
            };
            """
        )
        self.assertTrue(res.get("ready"), f"Expected >= 2 rail app buttons in #pm-rail-apps-list: {res}")
        self.assertTrue(res["wsHiddenWhenMail"], "#pm-media-workspace must be hidden when Mail is active")
        self.assertTrue(res["mailActive"], "#rail-btn-mail must have .active when selected")
        self.assertEqual(res["activeApps"], 0, "No rail app should stay .active when Mail is active")
        self.assertTrue(res["wsVisibleWhenApp"], "#pm-media-workspace must become visible when app clicked")
        self.assertEqual(res["errors"], [])

    def test_f4_empty_and_malformed_custom_apps_list(self) -> None:
        popup_dir = REPO_ROOT / "src" / "popup"
        self.assertFalse((popup_dir / "popup.js").exists(), "src/popup/popup.js must be split into modular scripts")

        bad_settings = {
            "enabledMediaApps": [],
            "customMediaApps": [None, {}, {"name": "", "url": "javascript:alert(1)"}],
        }
        self.server.set_seed(
            {
                "storage": {"settings": bad_settings},
                "messageResponses": {
                    "GET_STATE": {"state": {"accounts": [], "totalUnread": 0, "sentMessages": []}, "settings": bad_settings, "snoozed": {}}
                },
            }
        )
        self.fx.navigate(self.server.url_for("/src/popup/popup.html"))
        self._install_error_trap()
        res = self.fx.eval_async_js(
            """
            await new Promise((r) => setTimeout(r, 150));
            const railList = document.getElementById('pm-rail-apps-list');
            const buttons = railList ? Array.from(railList.querySelectorAll('button')) : [];
            const hasJsUrl = railList ? /javascript:/i.test(railList.innerHTML || '') : false;
            return {
              btnCount: buttons.length,
              hasJsUrl,
              hasEmailList: Boolean(document.getElementById('pm-email-list')),
              errors: window.__t2Errors || []
            };
            """
        )
        self.assertEqual(res["btnCount"], 0, "Malformed/empty apps must produce 0 rail buttons")
        self.assertFalse(res["hasJsUrl"], "javascript: URL must never be rendered in rail apps")
        self.assertTrue(res["hasEmailList"])
        self.assertEqual(res["errors"], [])

    def test_f4_duplicate_script_load_and_missing_global_guard(self) -> None:
        utils_path = REPO_ROOT / "src" / "popup" / "popup-utils.js"
        self.assertTrue(utils_path.is_file(), f"Missing split popup utility module: {utils_path}")

        dup_url = self._register_error_collecting_fixture(
            "t2_f4_dup_utils.html",
            ["/src/popup/popup-utils.js", "/src/popup/popup-utils.js"],
            body_html="<div id='pm-toast'></div>",
        )
        self.fx.navigate(dup_url)
        res = self.fx.eval_js(
            """
            return {
              hasPopupNs: typeof window.FoxHubPopup === 'object' && window.FoxHubPopup !== null,
              errors: window.__t2Errors || []
            };
            """
        )
        self.assertEqual(res["errors"], [], f"Double-loading popup-utils.js threw errors: {res['errors']}")
        self.assertTrue(res["hasPopupNs"], "window.FoxHubPopup must remain intact after double load")

    # ==================================================================
    # F16: AMO Compliance Boundaries (6 tests)
    # ==================================================================

    def test_f16_repo_amo_release_gate(self) -> None:
        report = lint_extension(REPO_ROOT, check_firefox_js=True, firefox_harness=self.fx)
        self.assertTrue(
            report["ok"],
            f"Repository AMO release gate failed with {len(report['errors'])} error(s): {report['errors']}",
        )
        self.assertEqual(report["errors"], [])

    def test_f16_synthetic_unsafe_eval_and_timer_probes(self) -> None:
        unsafe_probes = [
            ("eval_optional", "eval?.('1');", "js.unsafe_eval.eval"),
            ("indirect_eval", "(0, eval)('1');", "js.unsafe_eval.indirect_eval"),
            ("window_eval", "window.eval('1');", "js.unsafe_eval.global_eval"),
            ("new_function", "const f = new Function('a', 'return a');", "js.unsafe_eval.new_Function"),
            ("function_call", "const g = Function('return 1')();", "js.unsafe_eval.Function_call"),
            ("timeout_str", "setTimeout(\"doThing()\", 5);", "js.unsafe_eval.string_timer"),
            ("interval_tpl", "setInterval(`tick()`, 5);", "js.unsafe_eval.string_timer"),
        ]
        for label, code, expected_rule in unsafe_probes:
            with tempfile.TemporaryDirectory(prefix=f"foxhub_eval_{label}_") as tmp:
                root = Path(tmp)
                _write_valid_probe_extension(root)
                (root / "src" / "popup" / "popup.js").write_text(code + "\n", encoding="utf-8")
                rep = lint_extension(root, check_firefox_js=False)
                self.assertFalse(rep["ok"], f"Unsafe probe {label} unexpectedly passed")
                self.assertTrue(
                    any(e["rule"] == expected_rule for e in rep["errors"]),
                    f"Probe {label} expected {expected_rule}, got {rep['errors']}",
                )

        # Safe comments and function callbacks must pass
        with tempfile.TemporaryDirectory(prefix="foxhub_eval_safe_") as tmp:
            root = Path(tmp)
            _write_valid_probe_extension(root)
            (root / "src" / "popup" / "popup.js").write_text(
                "// eval('not executed'); new Function('a', 'return a');\n"
                "setTimeout(() => { return 1; }, 5);\n",
                encoding="utf-8",
            )
            rep = lint_extension(root, check_firefox_js=False)
            self.assertTrue(rep["ok"], f"Safe JS probe failed unexpectedly: {rep['errors']}")

    def test_f16_synthetic_unsafe_dom_and_bracket_bypasses(self) -> None:
        unsafe_dom_probes = [
            ("innerHTML", "document.body.innerHTML = '<b>x</b>';", "js.unsafe_dom.innerHTML"),
            ("outerHTML", "el.outerHTML = '<div>x</div>';", "js.unsafe_dom.outerHTML"),
            ("insertAdjacentHTML", "el.insertAdjacentHTML('beforeend', '<p>x</p>');", "js.unsafe_dom.insertAdjacentHTML"),
            ("document_write", "document.write('<span>x</span>');", "js.unsafe_dom.document_write"),
            ("document_writeln", "document.writeln('<span>x</span>');", "js.unsafe_dom.document_write"),
            ("bracket_inner", "el['innerHTML'] = 'x';", "js.unsafe_dom.bracket_bypass"),
            ("bracket_outer", 'el["outerHTML"] = "x";', "js.unsafe_dom.bracket_bypass"),
            ("bracket_adj", "el[`insertAdjacentHTML`]('beforeend', 'x');", "js.unsafe_dom.bracket_bypass"),
            ("bracket_hex", "el['\\x69nnerHTML'] = 'x';", "js.unsafe_dom.bracket_bypass"),
            ("bracket_uni", "el['\\u0069nnerHTML'] = 'x';", "js.unsafe_dom.bracket_bypass"),
            ("bracket_concat_inner", "el['inner' + 'HTML'] = 'x';", "js.unsafe_dom.bracket_bypass"),
            ("bracket_concat_outer", "el['outer' + 'HTML'] = 'x';", "js.unsafe_dom.bracket_bypass"),
            ("bracket_concat_adj", "el['insertAdjacent' + 'HTML']('beforeend', 'x');", "js.unsafe_dom.bracket_bypass"),
            ("bracket_tpl_empty_interp", "el[`inner${''}HTML`] = 'x';", "js.unsafe_dom.bracket_bypass"),
            ("ident_uni_escape", "el.\\u0069nnerHTML = 'x';", "js.unsafe_dom.innerHTML"),
            ("doc_write_bracket_hex", "document['\\x77rite']('x');", "js.unsafe_dom.document_write"),
            ("doc_write_bracket_concat", "document['wri' + 'te']('x');", "js.unsafe_dom.document_write"),
            ("bracket_line_cont_concat", "el['inner\\\n' + 'HTML'] = 'x';", "js.unsafe_dom.bracket_bypass"),
            ("doc_write_line_cont_concat", "document['wri\\\n' + 'te']('x');", "js.unsafe_dom.document_write"),
        ]
        for label, code, expected_rule in unsafe_dom_probes:
            with tempfile.TemporaryDirectory(prefix=f"foxhub_dom_{label}_") as tmp:
                root = Path(tmp)
                _write_valid_probe_extension(root)
                (root / "src" / "popup" / "popup.js").write_text(code + "\n", encoding="utf-8")
                rep = lint_extension(root, check_firefox_js=False)
                self.assertFalse(rep["ok"], f"Unsafe DOM probe {label} unexpectedly passed")
                self.assertTrue(
                    any(e["rule"] == expected_rule for e in rep["errors"]),
                    f"Probe {label} expected {expected_rule}, got {rep['errors']}",
                )

        # Safe DOM APIs must pass
        with tempfile.TemporaryDirectory(prefix="foxhub_dom_safe_") as tmp:
            root = Path(tmp)
            _write_valid_probe_extension(root)
            (root / "src" / "popup" / "popup.js").write_text(
                "const d = document.createElement('div');\n"
                "const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');\n"
                "d.textContent = 'Safe text';\n"
                "d.appendChild(svg);\n",
                encoding="utf-8",
            )
            rep = lint_extension(root, check_firefox_js=False)
            self.assertTrue(rep["ok"], f"Safe DOM probe failed: {rep['errors']}")

    def test_f16_synthetic_html_inline_js_uri_and_remote_probes(self) -> None:
        html_probes = [
            ("inline_script", "<script>console.log(1);</script>", "html.inline_script"),
            ("inline_body", "<script src='popup.js'>console.log(1);</script>", "html.inline_script_body"),
            ("remote_script", "<script src='https://cdn.example/x.js'></script>", "html.remote_script"),
            ("remote_link", "<link rel='stylesheet' href='//cdn.example/a.css'>", "html.remote_link"),
            ("inline_onclick", "<button onclick='doStuff()'>Go</button>", "html.inline_event_handler"),
            ("obfuscated_js_uri", "<a href='&#x6a;ava&#x09;script:alert(1)'>Bad</a>", "html.javascript_uri"),
        ]
        for label, snippet, expected_rule in html_probes:
            with tempfile.TemporaryDirectory(prefix=f"foxhub_html_{label}_") as tmp:
                root = Path(tmp)
                _write_valid_probe_extension(root)
                (root / "src" / "popup" / "popup.html").write_text(
                    "<!doctype html><html><head><meta charset='utf-8'><title>FoxHub</title></head>"
                    f"<body>{snippet}</body></html>",
                    encoding="utf-8",
                )
                rep = lint_extension(root, check_firefox_js=False)
                self.assertFalse(rep["ok"], f"HTML probe {label} unexpectedly passed")
                self.assertTrue(
                    any(e["rule"] == expected_rule for e in rep["errors"]),
                    f"HTML probe {label} expected {expected_rule}, got {rep['errors']}",
                )

    def test_f16_synthetic_pocketmail_branding_vs_internal_allowlist(self) -> None:
        # User-facing PocketMail strings MUST fail
        branding_probes = [
            ("html_text", lambda r: (r / "src" / "popup" / "popup.html").write_text(
                "<!doctype html><html><head><title>FoxHub</title></head><body><p>Welcome to PocketMail</p></body></html>",
                encoding="utf-8",
            ), "branding.pocketmail_html"),
            ("html_attr", lambda r: (r / "src" / "popup" / "popup.html").write_text(
                "<!doctype html><html><head><title>FoxHub</title></head><body><button title='Open PocketMail'>Go</button></body></html>",
                encoding="utf-8",
            ), "branding.pocketmail_html"),
            ("js_string", lambda r: (r / "src" / "popup" / "popup.js").write_text(
                "const label = 'PocketMail Inbox';\n", encoding="utf-8"
            ), "branding.pocketmail_ui_string"),
            ("manifest_desc", lambda r: (r / "manifest.json").write_text(
                json.dumps({
                    **json.loads((r / "manifest.json").read_text(encoding="utf-8")),
                    "description": "PocketMail extension",
                }),
                encoding="utf-8",
            ), "branding.pocketmail_manifest"),
        ]
        for label, mutator, expected_rule in branding_probes:
            with tempfile.TemporaryDirectory(prefix=f"foxhub_brand_{label}_") as tmp:
                root = Path(tmp)
                _write_valid_probe_extension(root)
                mutator(root)
                rep = lint_extension(root, check_firefox_js=False)
                self.assertFalse(rep["ok"], f"Branding probe {label} unexpectedly passed")
                self.assertTrue(
                    any(e["rule"] == expected_rule for e in rep["errors"]),
                    f"Branding probe {label} expected {expected_rule}, got {rep['errors']}",
                )

        # Preserved internal allowlist tokens MUST pass (including gecko.id-derived sidebarcommand selector
        # with both unescaped and escaped quotes)
        with tempfile.TemporaryDirectory(prefix="foxhub_brand_allow_") as tmp:
            root = Path(tmp)
            _write_valid_probe_extension(root)
            (root / "src" / "popup" / "popup.js").write_text(
                "const FRAME = 'pocketmail-media-frame';\n"
                "const ACT = 'SIDEBAR_NAVIGATE_POCKETMAIL';\n"
                "const BTN = 'btn-sc-app-pocketmail';\n"
                "const APP = 'pocketmail';\n"
                "const UC = '#sidebar-box[sidebarcommand=\"pocketmail-local_workspace_local-sidebar-action\"] { width: 320px; }';\n"
                'const UC_ESC = "#sidebar-box[sidebarcommand=\\"pocketmail-local_workspace_local-sidebar-action\\"] {}";\n'
                "const UC_ESC_SQ = '#sidebar-box[sidebarcommand=\\'pocketmail-local_workspace_local-sidebar-action\\'] {}';\n"
                "const UC_TPL = `#sidebar-box[sidebarcommand=\"pocketmail-local_workspace_local-sidebar-action\"] ${x}`;\n"
                "const UC_TPL_CONCAT = '#sidebar-box[' + `sidebarcommand=\"pocketmail-local_workspace_local-sidebar-action\" ${x}`;\n",
                encoding="utf-8",
            )
            rep = lint_extension(root, check_firefox_js=False)
            self.assertTrue(rep["ok"], f"Internal PocketMail allowlist probe failed: {rep['errors']}")

        # Mixed-string and obfuscated bypasses MUST fail
        mixed_probes = [
            ("mixed_btn_id", "const s = '#btn-sc-app-pocketmail Welcome to PocketMail';\n"),
            (
                "mixed_sidebarcommand",
                "const s = '#sidebar-box[sidebarcommand=\"pocketmail-local_workspace_local-sidebar-action\"] PocketMail';\n",
            ),
            ("concat_pocketmail", "const s = 'Pocket' + 'Mail';\n"),
            ("unicode_pocketmail", "const s = '\\u0050ocketMail';\n"),
            ("hex_pocketmail", "const s = '\\x50ocketMail';\n"),
            ("mixed_concat_pocketmail", "const s = '#btn-sc-app-pocketmail ' + 'Pocket' + 'Mail';\n"),
            ("tpl_empty_interp_pocketmail", "const s = `Pocket${''}Mail`;\n"),
            ("tpl_empty_interp_dq_pocketmail", 'const s = `Pocket${""}Mail`;\n'),
            ("tpl_empty_interp_bt_pocketmail", "const s = `Pocket${``}Mail`;\n"),
            ("tpl_after_interp_pocketmail", "const a = `hi ${user}`;\nconst s = `Pocket${''}Mail`;\n"),
            ("line_cont_concat_pocketmail", "const s = 'Pocket\\\n' + 'Mail';\n"),
            ("tpl_empty_interp_trailing_x_pocketmail", "const s = `Pocket${''}Mail ${x}`;\n"),
            ("tpl_leading_x_empty_interp_pocketmail", "const s = `${x} Pocket${''}Mail`;\n"),
            ("tpl_empty_interp_lc_with_x_pocketmail", "const s = `Pocket\\\n${''}Mail ${x}`;\n"),
            ("tpl_hex_empty_interp_with_x_pocketmail", "const s = `\\x50ocket${''}Mail ${x}`;\n"),
            ("concat_tpl_head_with_x_pocketmail", "const s = 'Pocket' + `Mail ${x}`;\n"),
            ("concat_tpl_head_empty_interp_with_x_pocketmail", "const s = 'Pocket' + `M${''}ail ${x}`;\n"),
        ]
        for label, code in mixed_probes:
            with tempfile.TemporaryDirectory(prefix=f"foxhub_brand_{label}_") as tmp:
                root = Path(tmp)
                _write_valid_probe_extension(root)
                (root / "src" / "popup" / "popup.js").write_text(code, encoding="utf-8")
                rep = lint_extension(root, check_firefox_js=False)
                self.assertFalse(rep["ok"], f"Mixed branding probe {label} unexpectedly passed")
                self.assertTrue(
                    any(e["rule"] == "branding.pocketmail_ui_string" for e in rep["errors"]),
                    f"Mixed branding probe {label} expected branding.pocketmail_ui_string, got {rep['errors']}",
                )

    def test_f16_zero_build_step_non_minified_and_css_safety(self) -> None:
        forbidden_files = [
            "package.json",
            "package-lock.json",
            "webpack.config.js",
            "vite.config.js",
            "rollup.config.js",
            "tsconfig.json",
        ]
        for fname in forbidden_files:
            self.assertFalse((REPO_ROOT / fname).exists(), f"Build-step config disallowed in zero-build repo: {fname}")
        self.assertFalse((REPO_ROOT / "node_modules").exists(), "node_modules must not exist in extension repo")

        src_dir = REPO_ROOT / "src"
        self.assertTrue(src_dir.is_dir())
        for js_file in src_dir.rglob("*.js"):
            self.assertFalse(js_file.name.endswith(".min.js"), f"Minified file disallowed: {js_file}")
            text = js_file.read_text(encoding="utf-8", errors="replace")
            self.assertNotIn("sourceMappingURL=", text, f"Source map reference disallowed: {js_file}")
            if len(text) > 2048:
                lines = text.splitlines()
                self.assertGreater(len(lines), 10, f"JS file looks single-line minified: {js_file}")
                avg_len = len(text) / max(1, len(lines))
                self.assertLess(avg_len, 240, f"JS file avg line length ({avg_len:.1f}) looks minified: {js_file}")

        # Synthetic CSS safety probes
        css_probes = [
            ("moz_binding", "div { -moz-binding: url('x.xml'); }", "css.unsafe_moz_binding"),
            ("expression", "div { width: expression(alert(1)); }", "css.unsafe_expression"),
            ("remote_url", "div { background: url('https://cdn.example/bg.png'); }", "css.remote_url"),
            ("unclosed_brace", "div { color: red;\n", "css.syntax.unclosed_brace"),
        ]
        for label, css_text, expected_rule in css_probes:
            with tempfile.TemporaryDirectory(prefix=f"foxhub_css_{label}_") as tmp:
                root = Path(tmp)
                _write_valid_probe_extension(root)
                (root / "src" / "popup" / "popup.css").write_text(css_text, encoding="utf-8")
                rep = lint_extension(root, check_firefox_js=False)
                self.assertFalse(rep["ok"], f"CSS probe {label} unexpectedly passed")
                self.assertTrue(
                    any(e["rule"] == expected_rule for e in rep["errors"]),
                    f"CSS probe {label} expected {expected_rule}, got {rep['errors']}",
                )


if __name__ == "__main__":
    unittest.main()
