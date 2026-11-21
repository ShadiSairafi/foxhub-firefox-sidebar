"""Tier 3 Module 3: Context Menus, Custom App UA, Presets & Backup Round-Trip Pairs (T3-12 .. T3-16)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from _e2e_helpers import (
    ALL_21_BUILTIN_APP_IDS,
    DEFAULT_PINNED_APPS,
    FoxHubE2EBase,
    make_default_settings_seed,
)
from tests.lib import mock_helpers
from tests.lib.amo_lint import lint_extension


class TestAppsContextUAPairs(FoxHubE2EBase):
    """Pairwise cross-feature tests for F5, F11, F12, F13, F14, F15, F16."""

    def test_t3_12_context_menu_settings_registration_and_surface_routing(self) -> None:
        """T3-12 (F5, F11): contextMenus settings <-> menu registration & sidebar/popout routing."""
        settings = make_default_settings_seed(contextMenuEnabled=True, contextMenuOpenBehavior="sidebar")
        self.open_background(settings=settings)

        menus_default = mock_helpers.get_context_menus(self.fx)
        self.assertEqual({m["id"] for m in menus_default}, {"foxhub-open-page", "foxhub-open-link"})

        # Disable context menus
        self.safe_eval_async(
            "return await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { contextMenuEnabled: false } });"
        )
        self.assertEqual(mock_helpers.get_context_menus(self.fx), [])

        # Re-enable with popout behavior and trigger link click
        self.safe_eval_async(
            "return await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { contextMenuEnabled: true, contextMenuOpenBehavior: 'popout' } });"
        )
        self.assertEqual({m["id"] for m in mock_helpers.get_context_menus(self.fx)}, {"foxhub-open-page", "foxhub-open-link"})

        mock_helpers.clear_calls(self.fx)
        mock_helpers.trigger_context_menu_click(self.fx, "foxhub-open-link", link_url="https://example.com/post")
        pop_res = self.safe_eval_async(
            """
            await new Promise((r) => setTimeout(r, 60));
            return {
              boot: window.__pmGetSyncBootState(),
              calls: window.__webextMock.getCalls('windows.create'),
            };
            """
        )
        self.assertTrue(len(pop_res["calls"]) >= 1, msg="Popout behavior must call windows.create")
        created_url = pop_res["calls"][-1]["args"][0]["url"]
        self.assertIn("src/popup/popup.html?popout=1", created_url)
        self.assertEqual((pop_res["boot"].get("pendingContextUrl") or {}).get("url"), "https://example.com/post")

        # Switch to sidebar behavior and trigger page click
        self.safe_eval_async(
            "return await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { contextMenuOpenBehavior: 'sidebar' } });"
        )
        mock_helpers.clear_calls(self.fx)
        mock_helpers.trigger_context_menu_click(self.fx, "foxhub-open-page", page_url="https://example.com/home")
        sb_calls = mock_helpers.get_calls(self.fx, "sidebarAction.open")
        self.assertGreaterEqual(len(sb_calls), 1, msg="Sidebar behavior must invoke sidebarAction.open")

        # Reject unsafe javascript: URL cleanly
        mock_helpers.trigger_context_menu_click(self.fx, "foxhub-open-link", link_url="javascript:alert(1)")
        boot_unsafe = self.safe_eval("return window.__pmGetSyncBootState();")
        self.assertNotEqual((boot_unsafe.get("pendingContextUrl") or {}).get("url"), "javascript:alert(1)")

    def test_t3_13_context_menu_launch_applies_custom_app_ua_override(self) -> None:
        """T3-13 (F11, F12): contextMenus launch <-> Custom App Mobile/Desktop UA webRequest rewrite."""
        custom_app = {
            "id": "custom-notes",
            "name": "Notes",
            "url": "https://notes.example.test/app",
            "color": "#2266aa",
            "iconUrl": "",
            "enabled": True,
            "userAgentMode": "mobile",
        }
        settings = make_default_settings_seed(customMediaApps=[custom_app])
        self.open_background(settings=settings)

        mock_helpers.trigger_context_menu_click(self.fx, "foxhub-open-link", link_url="https://notes.example.test/app/doc1")
        boot = self.safe_eval("return window.__pmGetSyncBootState();")
        self.assertEqual((boot.get("pendingContextUrl") or {}).get("url"), "https://notes.example.test/app/doc1")

        # 1. FoxHub sidebar frame -> rewritten to Android Mobile UA
        foxhub_origin = self.server.url_for("/src/popup/popup.html")
        res_mobile = mock_helpers.trigger_before_send_headers(
            self.fx,
            "https://notes.example.test/app/doc1",
            request_headers=[{"name": "User-Agent", "value": "Desktop"}],
            req_type="sub_frame",
            tab_id=-1,
            origin_url=foxhub_origin,
        )
        ua_mobile = [h["value"] for h in res_mobile["requestHeaders"] if h["name"].lower() == "user-agent"]
        self.assertTrue(ua_mobile and "Android 14; Mobile" in ua_mobile[0], msg=f"Expected Mobile UA, got {ua_mobile}")

        # 2. External normal browser tab -> untouched
        res_ext = mock_helpers.trigger_before_send_headers(
            self.fx,
            "https://notes.example.test/app/doc1",
            request_headers=[{"name": "User-Agent", "value": "Desktop"}],
            req_type="main_frame",
            tab_id=7,
            origin_url="https://other.test/",
        )
        ua_ext = [h["value"] for h in res_ext["requestHeaders"] if h["name"].lower() == "user-agent"]
        self.assertEqual(ua_ext, ["Desktop"], msg="External normal browser tab User-Agent must not be rewritten")

        # 3. Switch custom app to desktop UA mode -> rewritten to Windows Desktop UA
        custom_desktop = {**custom_app, "userAgentMode": "desktop"}
        self.safe_eval_async(
            "return await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { customMediaApps: [arguments[0]] } });",
            custom_desktop,
        )
        res_desktop = mock_helpers.trigger_before_send_headers(
            self.fx,
            "https://notes.example.test/app/doc1",
            request_headers=[{"name": "User-Agent", "value": "CustomOrig"}],
            req_type="sub_frame",
            tab_id=-1,
            origin_url=foxhub_origin,
        )
        ua_desktop = [h["value"] for h in res_desktop["requestHeaders"] if h["name"].lower() == "user-agent"]
        self.assertTrue(ua_desktop and "Windows NT 10.0; Win64; x64" in ua_desktop[0], msg=f"Expected Desktop UA, got {ua_desktop}")

    def test_t3_14_custom_app_edit_modal_updates_rail_and_quick_switcher(self) -> None:
        """T3-14 (F12, F15): Custom App Pro Edit modal <-> Left Rail & Ctrl+K Quick Switcher."""
        custom_url = self.server.url_for("/mock/custom/mytool")
        icon_url = self.server.url_for("/icons/icon-32.png")
        initial_app = {
            "id": "custom-mytool",
            "name": "Tool A",
            "url": custom_url,
            "color": "#aa2244",
            "iconUrl": "",
            "enabled": True,
            "userAgentMode": "default",
        }
        settings = make_default_settings_seed(customMediaApps=[initial_app])
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=settings)

        res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const uiWin = window.__bridge.uiWin;
            const h = uiWin.__foxhubTestHelpers;

            if (!h.openSettingsDrawer(uiDoc)) return { ok: false, reason: 'Missing Settings trigger on rail' };
            await new Promise((r) => setTimeout(r, 100));

            const findToolAEditBtn = () => {
              const directRow = Array.from(uiDoc.querySelectorAll('#pm-custom-apps-list > *, [data-custom-app-id], .fh-custom-app-row'))
                .find((el) => h.isVisible(el) && /Tool A/i.test(h.normText(el)));
              if (directRow) {
                const b = h.findButtonByText(uiDoc, /Edit/i, directRow);
                if (b) return b;
              }
              const sRoot = h.getSettingsRoot(uiDoc) || uiDoc.body;
              const candidates = Array.from(sRoot.querySelectorAll('li, tr, section, article, div'))
                .filter((el) => h.isVisible(el) && /Tool A/i.test(h.normText(el)) && h.normText(el).length <= 320);
              candidates.sort((a, b) => h.normText(a).length - h.normText(b).length);
              for (const row of candidates) {
                const b = h.findButtonByText(uiDoc, /^Edit$/i, row) || h.findButtonByText(uiDoc, /Edit/i, row);
                if (b) return b;
              }
              return h.findButtonByText(uiDoc, /Edit.*Tool A|Edit Custom/i, sRoot);
            };

            let editBtn = findToolAEditBtn();
            if (!editBtn) {
              const search = h.findSettingsSearchInput(uiDoc);
              if (search) {
                for (const q of ['Tool A', 'Custom']) {
                  h.setInputValue(search, q);
                  await new Promise((r) => setTimeout(r, 60));
                  editBtn = findToolAEditBtn();
                  if (editBtn) break;
                }
                if (!editBtn) {
                  h.setInputValue(search, '');
                  await new Promise((r) => setTimeout(r, 50));
                }
              }
            }
            if (!editBtn) {
              h.activateSettingsCategory(uiDoc, /Apps|Custom|Sites|Integrations/i);
              await new Promise((r) => setTimeout(r, 60));
              editBtn = findToolAEditBtn();
            }
            if (!editBtn) {
              for (const tab of h.getSettingsCategoryTabs(uiDoc)) {
                tab.click();
                await new Promise((r) => setTimeout(r, 40));
                editBtn = findToolAEditBtn();
                if (editBtn) break;
              }
            }
            if (!editBtn) {
              return { ok: false, reason: 'Missing Custom App Edit button/modal trigger for "Tool A"' };
            }
            editBtn.click();
            await new Promise((r) => setTimeout(r, 80));

            const modal = Array.from(uiDoc.querySelectorAll('[role="dialog"], .pm-modal, .fh-modal, form'))
              .find((el) => h.isVisible(el) && (/User-?Agent|Mobile|Desktop/i.test(h.normText(el)) || el.querySelector('select, [name="userAgentMode"]')));
            if (!modal) {
              return { ok: false, reason: 'Clicking Edit did not open Custom App Edit modal with User-Agent controls' };
            }

            const nameInp = modal.querySelector('input[name="name"], input[data-field="name"]')
              || modal.querySelector('input[placeholder*="Name" i], input[aria-label*="Name" i]')
              || modal.querySelector('input[type="text"]');
            const colorInp = modal.querySelector('input[name="color"], input[data-field="color"]')
              || modal.querySelector('input[type="color"]');
            const iconInp = modal.querySelector('input[name="iconUrl"], input[data-field="iconUrl"]')
              || modal.querySelector('input[placeholder*="Icon" i], input[aria-label*="Icon" i]')
              || Array.from(modal.querySelectorAll('input[type="url"]'))[1]
              || null;
            const uaSel = modal.querySelector('select[name="userAgentMode"], [data-field="userAgentMode"], select');
            const uaMobileBtn = h.findButtonByText(uiDoc, /^Mobile$/i, modal) || modal.querySelector('[data-ua-mode="mobile"], input[value="mobile"]');
            const saveBtn = h.findButtonByText(uiDoc, /Save|Apply|Update/i, modal);

            if (!nameInp || !colorInp || (!uaSel && !uaMobileBtn) || !saveBtn) {
              return { ok: false, reason: 'Missing required fields in Custom App Edit modal' };
            }

            h.setInputValue(nameInp, 'Tool Pro');
            h.setInputValue(colorInp, '#0088cc');
            if (iconInp) h.setInputValue(iconInp, arguments[0]);
            if (uaSel && uaSel.tagName === 'SELECT') {
              h.setInputValue(uaSel, 'mobile');
            } else if (uaMobileBtn) {
              uaMobileBtn.click();
            }
            saveBtn.click();
            await new Promise((r) => setTimeout(r, 140));

            const stored = await window.browser.storage.local.get('settings');
            const customList = (stored.settings || {}).customMediaApps || [];

            const railMatches = h.getRailAppItems(uiDoc).concat(
              Array.from(uiDoc.querySelectorAll('#pm-rail-apps-list button, #pm-rail-apps-list [role="button"], aside button, [role="navigation"] button'))
            ).some((el) => /Tool Pro/i.test((el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + h.normText(el)));

            // Open Quick Switcher and search "Tool Pro"
            uiWin.dispatchEvent(new uiWin.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
            await new Promise((r) => setTimeout(r, 80));
            const qs = h.findQuickSwitcher(uiDoc);
            let qsMatched = false;
            if (qs) {
              const qInp = qs.querySelector('input');
              if (qInp) {
                h.setInputValue(qInp, 'Tool Pro');
                await new Promise((r) => setTimeout(r, 50));
                qsMatched = Boolean(h.findQuickSwitcherOption(qs, /Tool Pro/i));
              }
            }

            return { ok: true, customList, railMatches, hasQuickSwitcher: Boolean(qs), qsMatched };
            """,
            icon_url,
        )
        self.assertTrue(res.get("ok"), msg=str(res))
        self.assertEqual(len(res["customList"]), 1)
        edited = res["customList"][0]
        self.assertEqual(edited.get("name"), "Tool Pro")
        self.assertEqual(str(edited.get("color", "")).lower(), "#0088cc")
        self.assertEqual(edited.get("iconUrl"), icon_url)
        self.assertEqual(edited.get("userAgentMode"), "mobile")
        self.assertTrue(res["railMatches"], msg="Edited custom app 'Tool Pro' must update left rail")
        self.assertTrue(res["hasQuickSwitcher"], msg="Ctrl+K Quick Switcher must open")
        self.assertTrue(res["qsMatched"], msg="Edited custom app 'Tool Pro' must appear in Ctrl+K Quick Switcher")

    def test_t3_15_backup_restore_roundtrip_custom_apps_shortcuts_context_presets(self) -> None:
        """T3-15 (F11, F12, F13, F14): Backup/Restore round-trip restores custom UA apps, presets, shortcuts & contextMenus."""
        seeded = make_default_settings_seed(
            enabledMediaApps=list(DEFAULT_PINNED_APPS) + ["claude", "notion"],
            customMediaApps=[
                {
                    "id": "custom-portal",
                    "name": "Portal",
                    "url": "https://portal.example.test/",
                    "color": "#1188aa",
                    "iconUrl": "",
                    "enabled": True,
                    "userAgentMode": "mobile",
                }
            ],
            appShortcuts={"claude": "Alt+Shift+C"},
            contextMenuEnabled=False,
        )
        self.open_background(settings=seeded)

        res = self.safe_eval_async(
            """
            const exported = await browser.runtime.sendMessage({ type: 'EXPORT_SETTINGS' });
            if (!exported || !exported.ok) return { ok: false, reason: 'EXPORT_SETTINGS failed' };

            await browser.runtime.sendMessage({
              type: 'UPDATE_SETTINGS',
              settings: {
                enabledMediaApps: arguments[0],
                customMediaApps: [],
                appShortcuts: {},
                contextMenuEnabled: true,
              },
            });
            await new Promise((r) => setTimeout(r, 60));
            const menusMid = window.__webextMock.contextMenus.list();
            const cmdsMid = await browser.commands.getAll();

            const imported = await browser.runtime.sendMessage({
              type: 'IMPORT_SETTINGS',
              payload: exported.payload,
            });
            await new Promise((r) => setTimeout(r, 60));
            const stateAfter = await browser.runtime.sendMessage({ type: 'GET_STATE' });
            const menusAfter = window.__webextMock.contextMenus.list();
            const cmdsAfter = await browser.commands.getAll();

            return { ok: true, menusMid, cmdsMid, imported, stateAfter, menusAfter, cmdsAfter };
            """,
            list(DEFAULT_PINNED_APPS),
        )
        self.assertTrue(res.get("ok"), msg=str(res))
        self.assertEqual(len(res["menusMid"]), 2)
        slot1_mid = [c for c in res["cmdsMid"] if c["name"] == "foxhub-app-slot-1"][0]
        self.assertEqual(slot1_mid["shortcut"], "")

        self.assertTrue(res["imported"].get("ok"))
        s = res["stateAfter"]["settings"]
        self.assertEqual(s["customMediaApps"][0]["userAgentMode"], "mobile")
        self.assertIn("claude", s["enabledMediaApps"])
        self.assertIn("notion", s["enabledMediaApps"])
        self.assertEqual(res["menusAfter"], [])
        slot1_after = [c for c in res["cmdsAfter"] if c["name"] == "foxhub-app-slot-1"][0]
        self.assertEqual(slot1_after["shortcut"], "Alt+Shift+C")

    def test_t3_16_expanded_presets_createelementns_svg_and_amo_compliance(self) -> None:
        """T3-16 (F13, F16): All 21 built-in presets render createElementNS SVGs, resolve via detectAppByUrl, and pass AMO DOM checks."""
        self.open_ui_toplevel("src/popup/popup.html", "?sidebar=1")

        res = self.safe_eval(
            """
            const cat = window.FoxHubMediaApps || window.PocketMailMediaApps;
            if (!cat || !Array.isArray(cat.BUILTIN_MEDIA_APPS)) {
              return { ok: false, reason: 'Missing FoxHubMediaApps catalog' };
            }
            const byId = {};
            const details = [];
            for (const app of cat.BUILTIN_MEDIA_APPS) {
              byId[app.id] = app;
              const svg = cat.createAppSvgIcon(app.id, 24);
              const detected = cat.detectAppByUrl(app.defaultUrl);
              details.push({
                id: app.id,
                isSvg: Boolean(svg && svg.tagName && svg.tagName.toLowerCase() === 'svg'),
                ns: svg ? svg.namespaceURI : null,
                childCount: svg ? svg.childElementCount : 0,
                viewBox: svg ? svg.getAttribute('viewBox') : null,
                detectedId: detected ? detected.id : null,
              });
            }
            return {
              ok: true,
              ids: cat.BUILTIN_MEDIA_APPS.map((a) => a.id),
              defaultPinned: cat.DEFAULT_ENABLED_APP_IDS || [],
              details,
            };
            """
        )
        self.assertTrue(res.get("ok"), msg=str(res))
        for expected_id in ALL_21_BUILTIN_APP_IDS:
            self.assertIn(expected_id, res["ids"], msg=f"Missing built-in preset {expected_id!r}")
        for d in res["details"]:
            self.assertTrue(d["isSvg"], msg=f"Preset {d['id']} did not return <svg>")
            self.assertEqual(d["ns"], "http://www.w3.org/2000/svg")
            self.assertGreaterEqual(d["childCount"], 1, msg=f"Preset {d['id']} SVG has no shape children")
            self.assertTrue(bool(d["viewBox"]), msg=f"Preset {d['id']} SVG missing viewBox")
            self.assertEqual(d["detectedId"], d["id"], msg=f"detectAppByUrl failed for {d['id']}: got {d['detectedId']}")

        # Verify shared catalog & mail modules have 0 unsafe DOM/eval findings in AMO linter
        rep = lint_extension(self.PROJECT_ROOT, check_firefox_js=False)
        shared_dom_errors = [
            e
            for e in rep["errors"]
            if e["file"].startswith("src/shared/") and ("unsafe_dom" in e["rule"] or "unsafe_eval" in e["rule"])
        ]
        self.assertEqual(shared_dom_errors, [], msg=f"Shared modules have AMO DOM/eval errors: {shared_dom_errors}")


if __name__ == "__main__":
    unittest.main()
