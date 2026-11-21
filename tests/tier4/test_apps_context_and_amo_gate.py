"""Tier 4 Module 3: Custom App UA Lifecycle, New Presets & Full AMO Release Gate (T4-04, T4-08, T4-09)."""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

_TIER3_DIR = Path(__file__).resolve().parent.parent / "tier3"
if str(_TIER3_DIR) not in sys.path:
    sys.path.insert(0, str(_TIER3_DIR))

from _e2e_helpers import (
    DEFAULT_PINNED_APPS,
    EXTRA_UNPINNED_APPS,
    FoxHubE2EBase,
    NEW_8_PRESET_IDS,
    load_manifest_json,
)
from tests.lib.amo_lint import lint_extension


class TestAppsContextAndAMOGate(FoxHubE2EBase):
    """Real-world E2E scenarios 4, 8, and 9."""

    def test_t4_04_scenario_4_custom_web_app_lifecycle_ua_and_context_menu(self) -> None:
        """T4-04 (F11, F12, F15): Custom app create -> Pro edit (Mobile UA, color, icon) -> contextMenus & Ctrl+K launch."""
        portal_url = self.server.url_for("/mock/custom/portal")
        icon_url = self.server.url_for("/icons/icon-48.png")
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1")

        ui_res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const uiWin = window.__bridge.uiWin;
            const h = uiWin.__foxhubTestHelpers;

            if (!h.openSettingsDrawer(uiDoc)) return { ok: false, reason: 'Missing Settings trigger on rail' };
            await new Promise((r) => setTimeout(r, 100));

            const findCustomCreateControls = () => {
              const sRoot = h.getSettingsRoot(uiDoc) || uiDoc.body;
              const nameInp = uiDoc.getElementById('input-custom-app-name')
                || sRoot.querySelector('[data-custom-add-name], input[placeholder*="App Name" i], input[placeholder*="Site Name" i], input[name="customAppName"]');
              const colorInp = uiDoc.getElementById('input-custom-app-color')
                || sRoot.querySelector('[data-custom-add-color], input[type="color"]');
              const urlInp = uiDoc.getElementById('input-custom-app-url')
                || sRoot.querySelector('[data-custom-add-url], input[type="url"], input[placeholder*="https://" i]');
              const addBtn = uiDoc.getElementById('btn-add-custom-app')
                || h.findButtonByText(uiDoc, /Add to Sidebar|Add Custom|Add Site|Add App/i, sRoot);
              const visible = Boolean(nameInp && h.isVisible(nameInp) && urlInp && h.isVisible(urlInp) && addBtn && h.isVisible(addBtn));
              return { visible, nameInp, colorInp, urlInp, addBtn };
            };

            let createCtrls = findCustomCreateControls();
            if (!createCtrls.visible) {
              const search = h.findSettingsSearchInput(uiDoc);
              if (search) {
                for (const q of ['Custom', 'Add']) {
                  h.setInputValue(search, q);
                  await new Promise((r) => setTimeout(r, 60));
                  createCtrls = findCustomCreateControls();
                  if (createCtrls.visible) break;
                }
                if (!createCtrls.visible) {
                  h.setInputValue(search, '');
                  await new Promise((r) => setTimeout(r, 40));
                }
              }
            }
            if (!createCtrls.visible) {
              h.activateSettingsCategory(uiDoc, /Apps|Custom|Sites|Integrations/i);
              await new Promise((r) => setTimeout(r, 60));
              createCtrls = findCustomCreateControls();
            }
            if (!createCtrls.visible) {
              for (const tab of h.getSettingsCategoryTabs(uiDoc)) {
                tab.click();
                await new Promise((r) => setTimeout(r, 40));
                createCtrls = findCustomCreateControls();
                if (createCtrls.visible) break;
              }
            }

            const { visible, nameInp, colorInp, urlInp, addBtn } = createCtrls;
            if (!visible || !nameInp || !urlInp || !addBtn) {
              return { ok: false, reason: 'Missing Custom App creation inputs' };
            }
            h.setInputValue(nameInp, 'Portal');
            if (colorInp) h.setInputValue(colorInp, '#0D9488');
            h.setInputValue(urlInp, arguments[0]);
            addBtn.click();
            await new Promise((r) => setTimeout(r, 120));

            const findPortalEditBtn = () => {
              const row = Array.from(uiDoc.querySelectorAll('#pm-custom-apps-list > *, [data-custom-app-id], .fh-custom-app-row'))
                .find((el) => h.isVisible(el) && /Portal/i.test(h.normText(el)));
              if (row) {
                const b = h.findButtonByText(uiDoc, /Edit/i, row);
                if (b) return b;
              }
              const sRoot = h.getSettingsRoot(uiDoc) || uiDoc.body;
              const candidates = Array.from(sRoot.querySelectorAll('li, tr, section, article, div'))
                .filter((el) => h.isVisible(el) && /Portal/i.test(h.normText(el)) && h.normText(el).length <= 320);
              candidates.sort((a, b) => h.normText(a).length - h.normText(b).length);
              for (const c of candidates) {
                const b = h.findButtonByText(uiDoc, /^Edit$/i, c) || h.findButtonByText(uiDoc, /Edit/i, c);
                if (b) return b;
              }
              return h.findButtonByText(uiDoc, /Edit.*Portal/i, sRoot);
            };
            let editBtn = findPortalEditBtn();
            if (!editBtn) {
              const s2 = h.findSettingsSearchInput(uiDoc);
              if (s2) {
                for (const q of ['Portal', 'Custom']) {
                  h.setInputValue(s2, q);
                  await new Promise((r) => setTimeout(r, 60));
                  editBtn = findPortalEditBtn();
                  if (editBtn) break;
                }
                if (!editBtn) {
                  h.setInputValue(s2, '');
                  await new Promise((r) => setTimeout(r, 40));
                }
              }
            }
            if (!editBtn) {
              h.activateSettingsCategory(uiDoc, /Apps|Custom|Sites|Integrations/i);
              await new Promise((r) => setTimeout(r, 60));
              editBtn = findPortalEditBtn();
            }
            if (!editBtn) {
              return { ok: false, reason: 'Missing Pro Edit button on newly created custom app "Portal"' };
            }
            editBtn.click();
            await new Promise((r) => setTimeout(r, 80));

            const modal = Array.from(uiDoc.querySelectorAll('[role="dialog"], .pm-modal, .fh-modal, form'))
              .find((el) => h.isVisible(el) && (/User-?Agent|Mobile|Desktop/i.test(h.normText(el)) || el.querySelector('select, [name="userAgentMode"]')));
            if (!modal) return { ok: false, reason: 'Custom App Pro Edit modal did not open' };

            const eName = modal.querySelector('input[name="name"], input[data-field="name"]')
              || modal.querySelector('input[placeholder*="Name" i], input[aria-label*="Name" i]')
              || modal.querySelector('input[type="text"]');
            const eColor = modal.querySelector('input[name="color"], input[data-field="color"]')
              || modal.querySelector('input[type="color"]');
            const eIcon = modal.querySelector('input[name="iconUrl"], input[data-field="iconUrl"]')
              || modal.querySelector('input[placeholder*="Icon" i], input[aria-label*="Icon" i]')
              || Array.from(modal.querySelectorAll('input[type="url"]'))[1]
              || null;
            const eUa = modal.querySelector('select[name="userAgentMode"], [data-field="userAgentMode"], select');
            const eUaMob = h.findButtonByText(uiDoc, /^Mobile$/i, modal) || modal.querySelector('[data-ua-mode="mobile"], input[value="mobile"]');
            const saveBtn = h.findButtonByText(uiDoc, /Save|Apply|Update/i, modal);
            if (!eName || (!eUa && !eUaMob) || !saveBtn) {
              return { ok: false, reason: 'Missing fields in Custom App Pro Edit modal' };
            }

            h.setInputValue(eName, 'Mobile Portal');
            if (eColor) h.setInputValue(eColor, '#2563EB');
            if (eIcon) h.setInputValue(eIcon, arguments[2]);
            if (eUa && eUa.tagName === 'SELECT') h.setInputValue(eUa, 'mobile');
            else if (eUaMob) eUaMob.click();
            saveBtn.click();
            await new Promise((r) => setTimeout(r, 120));

            // Trigger contextMenus click + webRequest UA check + Quick Switcher launch
            const targetLink = arguments[0] + '/inbox';
            window.__webextMock.contextMenus.triggerClick(
              { menuItemId: 'foxhub-open-link', linkUrl: targetLink },
              { id: 1, url: 'https://example.com/' }
            );
            await new Promise((r) => setTimeout(r, 100));
            const boot = window.__bridge.bgWin.__pmGetSyncBootState();
            const ctxFrames = Array.from(uiDoc.querySelectorAll('iframe')).map((f) => f.src || '');

            const wrRes = await window.__webextMock.webRequest.triggerBeforeSendHeaders({
              url: targetLink,
              type: 'sub_frame',
              tabId: -1,
              originUrl: arguments[1],
              requestHeaders: [{ name: 'User-Agent', value: 'Desktop' }],
            });

            uiWin.dispatchEvent(new uiWin.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
            await new Promise((r) => setTimeout(r, 80));
            const qs = h.findQuickSwitcher(uiDoc);
            let qsFound = false;
            if (qs) {
              const qInp = qs.querySelector('input');
              if (qInp) {
                h.setInputValue(qInp, 'Mobile Portal');
                await new Promise((r) => setTimeout(r, 50));
                qsFound = Boolean(h.findQuickSwitcherOption(qs, /Mobile Portal/i));
              }
            }

            const stored = await window.browser.storage.local.get('settings');
            return { ok: true, boot, ctxFrames, wrRes, qsFound, customApps: (stored.settings || {}).customMediaApps || [] };
            """,
            portal_url,
            self.server.url_for("/src/popup/popup.html"),
            icon_url,
        )
        self.assertTrue(ui_res.get("ok"), msg=str(ui_res))
        self.assertEqual(len(ui_res["customApps"]), 1)
        app = ui_res["customApps"][0]
        self.assertEqual(app["name"], "Mobile Portal")
        self.assertEqual(str(app["color"]).lower(), "#2563eb")
        self.assertEqual(app.get("iconUrl"), icon_url)
        self.assertEqual(app["userAgentMode"], "mobile")
        pending_ctx = (ui_res["boot"].get("pendingContextUrl") or {}).get("url")
        expected_ctx = portal_url + "/inbox"
        self.assertTrue(
            pending_ctx == expected_ctx or any(expected_ctx in src for src in ui_res["ctxFrames"]),
            msg=f"Context menu click must queue or load {expected_ctx!r} in sidebar frame, got pending={pending_ctx!r}, frames={ui_res['ctxFrames']}",
        )
        ua_vals = [h["value"] for h in ui_res["wrRes"]["requestHeaders"] if h["name"].lower() == "user-agent"]
        self.assertTrue(ua_vals and "Android 14; Mobile" in ua_vals[0], msg=f"Expected Mobile UA rewrite, got: {ua_vals}")
        self.assertTrue(ui_res["qsFound"], msg="Edited custom app 'Mobile Portal' must appear in Ctrl+K Quick Switcher")

    def test_t4_08_scenario_8_enabling_new_builtin_ai_and_productivity_presets(self) -> None:
        """T4-08 (F2, F13, F15): Enabling new built-in AI & productivity presets, SVG verification, Ctrl+K & content optimizers."""
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", raw_storage={})

        res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const uiWin = window.__bridge.uiWin;
            const h = uiWin.__foxhubTestHelpers;

            const initialRailIds = h.getRailAppItems(uiDoc)
              .map((el) => h.inferRailAppId(el))
              .filter(Boolean);

            const toEnable = ['claude', 'perplexity', 'gemini', 'notion', 'bluesky'];
            await window.browser.runtime.sendMessage({
              type: 'UPDATE_SETTINGS',
              settings: { enabledMediaApps: arguments[0].concat(toEnable) },
            });
            await new Promise((r) => setTimeout(r, 140));

            const currentRailItems = h.getRailAppItems(uiDoc);
            const railSvgs = [];
            for (const id of toEnable) {
              const btn = uiDoc.querySelector(`#pm-rail-apps-list [data-app-id="${id}"], #pm-rail-apps-list [data-id="${id}"]`)
                || currentRailItems.find((el) => h.inferRailAppId(el) === id);
              const svg = btn ? btn.querySelector('svg') : null;
              railSvgs.push({
                id,
                hasBtn: Boolean(btn),
                hasSvg: Boolean(svg && svg.namespaceURI === 'http://www.w3.org/2000/svg' && svg.childElementCount >= 1),
              });
            }

            // Ctrl+K Quick Switcher should list newly pinned Claude & Gemini
            uiWin.dispatchEvent(new uiWin.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
            await new Promise((r) => setTimeout(r, 80));
            const qs = h.findQuickSwitcher(uiDoc);
            let qsHasClaude = false;
            let qsHasGemini = false;
            if (qs) {
              const qInp = qs.querySelector('input');
              if (qInp) {
                h.setInputValue(qInp, 'Claude');
                await new Promise((r) => setTimeout(r, 40));
                qsHasClaude = Boolean(h.findQuickSwitcherOption(qs, /claude/i));
                h.setInputValue(qInp, 'Gemini');
                await new Promise((r) => setTimeout(r, 40));
                qsHasGemini = Boolean(h.findQuickSwitcherOption(qs, /gemini/i));
              }
            }

            // Query GET_FRAME_OPT_BUNDLE for all 8 new presets + gemini
            const bundles = [];
            for (const id of arguments[1]) {
              bundles.push(await window.browser.runtime.sendMessage({ type: 'GET_FRAME_OPT_BUNDLE', appId: id }));
            }

            // Close Quick Switcher if open, then click pinned gemini rail button to verify workspace iframe launch
            if (qs && !qs.classList.contains('hidden')) {
              uiWin.dispatchEvent(new uiWin.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
              await new Promise((r) => setTimeout(r, 40));
            }
            const geminiBtn = uiDoc.querySelector('#pm-rail-apps-list [data-app-id="gemini"], #pm-rail-apps-list [data-id="gemini"]')
              || currentRailItems.find((el) => h.inferRailAppId(el) === 'gemini');
            let geminiWorkspaceLaunched = false;
            if (geminiBtn) {
              geminiBtn.click();
              const dl = Date.now() + 2000;
              while (Date.now() < dl) {
                const ws = uiDoc.getElementById('pm-media-workspace');
                const gFrame = uiDoc.querySelector('iframe[name="pm-media-frame-gemini"], iframe[name^="pm-media-frame-gemini"]');
                if (ws && !ws.classList.contains('hidden') && !ws.classList.contains('pm-workspace-keepalive') && gFrame) {
                  geminiWorkspaceLaunched = true;
                  break;
                }
                await new Promise((r) => setTimeout(r, 40));
              }
            }

            return { initialRailIds, railSvgs, hasQs: Boolean(qs), qsHasClaude, qsHasGemini, bundles, geminiWorkspaceLaunched };
            """,
            list(DEFAULT_PINNED_APPS),
            list(NEW_8_PRESET_IDS) + ["gemini"],
        )
        self.assertEqual(len(res["initialRailIds"]), len(DEFAULT_PINNED_APPS))
        self.assertEqual(set(res["initialRailIds"]), set(DEFAULT_PINNED_APPS))
        for hidden_id in EXTRA_UNPINNED_APPS:
            self.assertNotIn(hidden_id, res["initialRailIds"])
        for entry in res["railSvgs"]:
            self.assertTrue(entry["hasBtn"], msg=f"Newly pinned preset {entry['id']} missing from left rail")
            self.assertTrue(entry["hasSvg"], msg=f"Preset {entry['id']} missing valid createElementNS <svg> icon")
        self.assertTrue(res["hasQs"], msg="Ctrl+K Quick Switcher did not open")
        self.assertTrue(res["qsHasClaude"], msg="Quick Switcher missing newly pinned Claude")
        self.assertTrue(res["qsHasGemini"], msg="Quick Switcher missing newly pinned Gemini")
        self.assertTrue(res["geminiWorkspaceLaunched"], msg="Clicking pinned Gemini rail button did not launch Gemini workspace iframe")

        content_js_to_check = []
        for b in res["bundles"]:
            self.assertTrue(b.get("ok"), msg=f"GET_FRAME_OPT_BUNDLE failed: {b}")
            opt = b.get("optimizerPath") or ""
            self.assertTrue(opt, msg=f"Missing optimizerPath in bundle: {b}")
            p = self.assert_repo_file(opt)
            content_js_to_check.append(p)
        bad = [r for r in self.fx.check_js_syntax(content_js_to_check) if not r.get("ok")]
        self.assertEqual(bad, [], msg=f"New preset optimizer scripts have JS syntax errors: {bad}")

    def test_t4_09_scenario_9_full_amo_release_gate_and_extension_hygiene(self) -> None:
        """T4-09 (F1, F2, F3, F4, F5, F16): Full AMO release gate, modular split, zero PocketMail & SpiderMonkey parse."""
        manifest = load_manifest_json(self.PROJECT_ROOT)
        self.assertEqual(manifest.get("manifest_version"), 2)
        ver_parts = tuple(int(p) for p in str(manifest.get("version", "0.0.0")).split("."))
        self.assertGreater(ver_parts, (2, 7, 9))
        self.assertIn("contextMenus", manifest.get("permissions") or [])
        cs_list = manifest.get("content_scripts") or []
        self.assertEqual(cs_list[0].get("js"), ["src/content/tab-media-watcher.js"])

        watcher = self.assert_repo_file("src/content/tab-media-watcher.js")
        self.assertLessEqual(watcher.stat().st_size, 8192)
        self.assertFalse(
            (self.PROJECT_ROOT / "src/shared/media-frame-optimizer.js").exists(),
            msg="Monolithic media-frame-optimizer.js must be split and removed",
        )
        self.assert_repo_file("src/shared/settings-ui.js")
        self.assert_repo_file("src/shared/settings-ui.css")

        war = manifest.get("web_accessible_resources") or []
        for entry in war:
            self.assertFalse(str(entry).startswith(("tests/", ".git/")), msg=f"Unsafe web_accessible_resources entry: {entry}")

        popup_html = self.assert_repo_file("src/popup/popup.html").read_text(encoding="utf-8")
        popup_srcs = re.findall(r'<script\s+[^>]*src=["\']([^"\']+)["\']', popup_html, flags=re.IGNORECASE)
        self.assertFalse(any(s.strip() == "popup.js" for s in popup_srcs), msg="popup.html must load modular scripts")

        bg_html = self.assert_repo_file("src/background/background.html").read_text(encoding="utf-8")
        bg_srcs = re.findall(r'<script\s+[^>]*src=["\']([^"\']+)["\']', bg_html, flags=re.IGNORECASE)
        self.assertFalse(any(s.strip() == "background.js" for s in bg_srcs), msg="background.html must load modular scripts")

        report = lint_extension(
            self.PROJECT_ROOT,
            check_firefox_js=True,
            firefox_harness=self.fx,
            check_split_budget=True,
        )
        self.assertGreater(report["stats"]["firefox_js_checked"], 0)
        self.assertTrue(
            report["ok"],
            msg=f"AMO release gate lint failed ({len(report['errors'])} errors): {report['errors']}",
        )


if __name__ == "__main__":
    unittest.main()
