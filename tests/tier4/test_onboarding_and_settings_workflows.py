"""Tier 4 Module 1: Fresh Install Onboarding, Power-User Settings Overhaul & Backup Migration (T4-01, T4-05, T4-07)."""

from __future__ import annotations

import json
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
    make_default_settings_seed,
)


class TestOnboardingAndSettingsWorkflows(FoxHubE2EBase):
    """Real-world E2E scenarios 1, 5, and 7."""

    def test_t4_01_scenario_1_fresh_install_first_run_sidebar(self) -> None:
        """T4-01 (F1, F5, F7, F13): Fresh install defaults, hidden extra presets, decluttered header & zero PocketMail branding."""
        manifest = load_manifest_json(self.PROJECT_ROOT)
        self.assertEqual(manifest.get("manifest_version"), 2)
        ver_parts = tuple(int(p) for p in str(manifest.get("version", "0.0.0")).split("."))
        self.assertGreater(ver_parts, (2, 7, 9))
        sb = manifest.get("sidebar_action") or {}
        self.assertTrue(sb.get("open_at_install"))
        self.assertEqual(sb.get("default_panel"), "src/popup/popup.html?sidebar=1")

        # Empty storage.local -> true first-run defaults
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", raw_storage={})

        res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const uiWin = window.__bridge.uiWin;
            const h = uiWin.__foxhubTestHelpers;

            const header = uiDoc.querySelector('.pm-header-actions');
            const duplicateIds = ['btn-open-sidebar', 'btn-night-mode', 'btn-dnd', 'btn-settings']
              .filter((id) => Boolean(header && header.querySelector('#' + id)));

            const railButtons = h.getRailAppItems(uiDoc);
            const railIds = railButtons
              .map((b) => h.inferRailAppId(b))
              .filter(Boolean);

            const bodyText = h.normText(uiDoc.body);
            const hasPocketMailText = /pocketmail/i.test(bodyText);

            // Open Settings and verify unpinned new presets are discoverable & toggleable
            h.openSettingsDrawer(uiDoc);
            await new Promise((r) => setTimeout(r, 120));

            const presetNames = [
              'Claude',
              'Perplexity',
              'SoundCloud',
              'Apple Music',
              'Bluesky',
              'Notion',
              'Google Calendar',
              'Google Keep',
              'Gemini',
            ];
            const sRoot = h.getSettingsRoot(uiDoc) || uiDoc.body;
            h.activateSettingsCategory(uiDoc, /Apps|Presets|Sidebar|Integrations/i);
            await new Promise((r) => setTimeout(r, 60));

            const presetVisible = {};
            const readVisibleSettings = () => h.normText(sRoot).toLowerCase();
            let visibleSettingsText = readVisibleSettings();
            const search = h.findSettingsSearchInput(uiDoc);

            for (const name of presetNames) {
              let found = visibleSettingsText.includes(name.toLowerCase());
              if (!found && search) {
                h.setInputValue(search, name);
                await new Promise((r) => setTimeout(r, 50));
                found = readVisibleSettings().includes(name.toLowerCase());
              }
              presetVisible[name] = found;
            }
            if (search) {
              h.setInputValue(search, '');
              await new Promise((r) => setTimeout(r, 40));
            }
            const settingsText = readVisibleSettings();

            return {
              duplicateIds,
              railIds,
              railCount: railButtons.length,
              hasPocketMailText,
              settingsText,
              presetVisible,
            };
            """
        )
        self.assertEqual(res["duplicateIds"], [], msg=f"Header still contains duplicate rail buttons: {res['duplicateIds']}")
        self.assertFalse(res["hasPocketMailText"], msg="Fresh-install UI still exposes 'PocketMail' user-facing text")
        self.assertEqual(res["railCount"], len(DEFAULT_PINNED_APPS))
        self.assertEqual(set(res["railIds"]), set(DEFAULT_PINNED_APPS))
        for unpinned in EXTRA_UNPINNED_APPS:
            self.assertNotIn(unpinned, res["railIds"])
        for preset_name in (
            "Claude",
            "Perplexity",
            "SoundCloud",
            "Apple Music",
            "Bluesky",
            "Notion",
            "Google Calendar",
            "Google Keep",
            "Gemini",
        ):
            self.assertTrue(
                res["presetVisible"].get(preset_name),
                msg=f"Preset {preset_name} missing from Settings",
            )

    def test_t4_05_scenario_5_power_user_settings_overhaul_and_options_sync(self) -> None:
        """T4-05 (F5, F6, F9): Power-user search, theme gradient, diagnostics accordion, userChrome.css copy & options.html sync."""
        self.assert_repo_file("src/shared/settings-ui.js")
        self.assert_repo_file("src/shared/settings-ui.css")

        self.open_bridged_app("src/popup/popup.html", "?sidebar=1")

        pop_res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const uiWin = window.__bridge.uiWin;
            const h = uiWin.__foxhubTestHelpers;
            const spy = window.__webextMock.installClipboardSpy();
            // Also mirror navigator.clipboard on uiWin and hook uiDoc.execCommand('copy')
            if (uiWin.navigator && navigator.clipboard) {
              try {
                Object.defineProperty(uiWin.navigator, 'clipboard', { value: navigator.clipboard, configurable: true });
              } catch (_) {}
            }
            const origUiExec = typeof uiDoc.execCommand === 'function' ? uiDoc.execCommand.bind(uiDoc) : null;
            uiDoc.execCommand = function (cmd, showUI, value) {
              if (String(cmd).toLowerCase() === 'copy') {
                const active = uiDoc.activeElement;
                const sel = uiWin.getSelection ? String(uiWin.getSelection()) : '';
                const txt = sel || (active && typeof active.value === 'string' ? active.value : '');
                if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                  navigator.clipboard.writeText(txt);
                }
                return true;
              }
              return origUiExec ? origUiExec(cmd, showUI, value) : false;
            };

            if (!h.openSettingsDrawer(uiDoc)) return { ok: false, reason: 'Missing Settings trigger on rail' };
            await new Promise((r) => setTimeout(r, 100));

            // Categorized visual navigation check across >= 2 settings categories
            const catTabs = h.getSettingsCategoryTabs(uiDoc);
            let categoryNavCount = catTabs.length;
            let categoryNavSwitched = false;
            if (catTabs.length >= 2) {
              const sRoot = h.getSettingsRoot(uiDoc) || uiDoc.body;
              const getTabState = (tab) => [
                tab.getAttribute('aria-selected') || '',
                tab.getAttribute('aria-current') || '',
                tab.className || '',
              ].join('|');
              catTabs[0].click();
              await new Promise((r) => setTimeout(r, 50));
              const text0 = h.normText(sRoot);
              const tab0Before = getTabState(catTabs[0]);
              const tab1Before = getTabState(catTabs[1]);
              catTabs[1].click();
              await new Promise((r) => setTimeout(r, 50));
              const text1 = h.normText(sRoot);
              const tab0After = getTabState(catTabs[0]);
              const tab1After = getTabState(catTabs[1]);
              categoryNavSwitched = (text0 !== text1) || (tab0Before !== tab0After && tab1Before !== tab1After);
            }

            let diagBefore = h.findDiagnosticsSection(uiDoc);
            if (!diagBefore) {
              h.activateSettingsCategory(uiDoc, /Diagnostics|Advanced/i);
              await new Promise((r) => setTimeout(r, 50));
              diagBefore = h.findDiagnosticsSection(uiDoc);
            }
            if (!diagBefore) return { ok: false, reason: 'Missing tucked-away Advanced Diagnostics section' };
            const diagInitiallyCollapsed = diagBefore.kind === 'details'
              ? !diagBefore.container.open
              : !(uiDoc.querySelector('#pm-live-audio-log-panel') && h.isVisible(uiDoc.querySelector('#pm-live-audio-log-panel')));

            let search = h.findSettingsSearchInput(uiDoc);
            if (!search) return { ok: false, reason: 'Missing Settings live search input' };

            h.setInputValue(search, 'gradient');
            await new Promise((r) => setTimeout(r, 80));
            const g1 = h.findControlByKeyOrLabel(uiDoc, ['gradientColor1', 'customGradient1'], [/Gradient.*1|Primary Gradient|Start Color/i]);
            const g2 = h.findControlByKeyOrLabel(uiDoc, ['gradientColor2', 'customGradient2'], [/Gradient.*2|Secondary Gradient|End Color/i]);
            if (!g1 || !g2) return { ok: false, reason: 'Missing gradient color inputs under "gradient" search' };
            h.setInputValue(g1, '#1E293B');
            await new Promise((r) => setTimeout(r, 40));
            const g2Now = h.findControlByKeyOrLabel(uiDoc, ['gradientColor2', 'customGradient2'], [/Gradient.*2|Secondary Gradient|End Color/i])
              || await h.revealSettingControl(uiDoc, ['gradientColor2', 'customGradient2'], [/Gradient.*2|Secondary Gradient|End Color/i], ['gradient'], /Appearance|Theme/i);
            h.setInputValue(g2Now, '#0F172A');
            await new Promise((r) => setTimeout(r, 40));
            const gradCard = g1.closest('[data-setting-card], .pm-control-card, .opt-card, .fh-card, section, div') || h.getSettingsRoot(uiDoc) || uiDoc.body;
            const applyGradBtn = h.findButtonByText(uiDoc, /Apply Gradient/i, gradCard) || h.findButtonByText(uiDoc, /Apply Gradient/i, uiDoc.body);
            if (applyGradBtn) {
              applyGradBtn.click();
              await new Promise((r) => setTimeout(r, 40));
            }

            search = h.findSettingsSearchInput(uiDoc);
            if (search) {
              h.setInputValue(search, 'Diagnostics');
              await new Promise((r) => setTimeout(r, 60));
            }
            let diagNow = h.findDiagnosticsSection(uiDoc);
            if (!diagNow || !h.isVisible(diagNow.container)) {
              h.activateSettingsCategory(uiDoc, /Diagnostics|Advanced|Backup/i);
              await new Promise((r) => setTimeout(r, 50));
              diagNow = h.findDiagnosticsSection(uiDoc);
            }
            if (diagNow.kind !== 'details' || !diagNow.container.open) {
              diagNow.toggle.click();
            }
            await new Promise((r) => setTimeout(r, 80));
            let clearBtn = h.findButtonByText(uiDoc, /^Clear$/i, diagNow.container) || h.findButtonByText(uiDoc, /Clear/i, diagNow.container);
            if (!clearBtn) {
              const viewLogBtn = h.findButtonByText(uiDoc, /View Live Log|Live Log|Show Log/i, diagNow.container);
              if (viewLogBtn) {
                viewLogBtn.click();
                await new Promise((r) => setTimeout(r, 80));
                clearBtn = h.findButtonByText(uiDoc, /^Clear$/i, diagNow.container) || h.findButtonByText(uiDoc, /Clear/i, diagNow.container);
              }
            }
            if (!clearBtn) return { ok: false, reason: 'Missing Clear button in expanded Advanced Diagnostics' };
            clearBtn.click();
            await new Promise((r) => setTimeout(r, 40));

            search = h.findSettingsSearchInput(uiDoc);
            if (search) {
              h.setInputValue(search, 'userChrome');
              await new Promise((r) => setTimeout(r, 60));
            }
            const ucCard = h.findUserChromeCard(uiDoc);
            if (!ucCard) return { ok: false, reason: 'Missing userChrome.css card' };
            const ucRows = Array.from(ucCard.querySelectorAll('div, section, li, article'))
              .filter((el) => h.isVisible(el) && /Hover[- ]to[- ]expand/i.test(h.normText(el)) && h.findButtonByText(uiDoc, /Copy/i, el));
            ucRows.sort((a, b) => h.normText(a).length - h.normText(b).length);
            const row = ucRows[0] || ucCard;
            const copyBtn = h.findButtonByText(uiDoc, /Copy/i, row);
            if (!copyBtn) return { ok: false, reason: 'Missing Copy button for Hover-to-expand preset' };
            const prevCopyCount = spy.getHistory().length;
            copyBtn.click();
            await new Promise((r) => setTimeout(r, 120));
            const copiedCountAfter = spy.getHistory().length;

            const st = await window.browser.storage.local.get('settings');
            return {
              ok: true,
              categoryNavCount,
              categoryNavSwitched,
              diagInitiallyCollapsed,
              copiedCountDelta: copiedCountAfter - prevCopyCount,
              copiedCss: spy.getText(),
              settings: st.settings || {},
            };
            """
        )
        self.assertTrue(pop_res.get("ok"), msg=str(pop_res))
        self.assertGreaterEqual(pop_res["categoryNavCount"], 2, msg="Categorized Settings UI must provide at least 2 visual categories")
        self.assertTrue(pop_res["categoryNavSwitched"], msg="Clicking between Settings categories must switch visible panel/category")
        self.assertTrue(pop_res["diagInitiallyCollapsed"])
        self.assertGreater(pop_res["copiedCountDelta"], 0, msg="Copy click must trigger clipboard write (navigator.clipboard or execCommand)")
        self.assertGreater(len(pop_res["copiedCss"].strip()), 15)
        self.assertIn("{", pop_res["copiedCss"])
        self.assertEqual(str(pop_res["settings"].get("gradientColor1", "")).lower(), "#1e293b")
        self.assertEqual(str(pop_res["settings"].get("customGradient1", "")).lower(), "#1e293b")
        self.assertEqual(str(pop_res["settings"].get("gradientColor2", "")).lower(), "#0f172a")
        self.assertEqual(str(pop_res["settings"].get("customGradient2", "")).lower(), "#0f172a")

        # Sync into options.html and edit pollIntervalSeconds back to popup.html
        dumped = self.safe_eval("return window.__webextMock.storage.dump();")
        self.open_bridged_app("src/options/options.html", "", raw_storage=dumped)

        opt_res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const h = window.__bridge.uiWin.__foxhubTestHelpers;
            const g1 = await h.revealSettingControl(uiDoc, ['gradientColor1', 'customGradient1'], [/Gradient.*1|Primary Gradient|Start Color/i], ['gradient'], /Appearance|Theme/i);
            const seenG1 = g1 ? String(g1.value || '').toLowerCase() : '';
            const poll = await h.revealSettingControl(uiDoc, ['pollIntervalSeconds'], [/Check Interval|Poll Interval/i], ['Check Interval', 'Poll Interval', 'Interval'], /Mail|Sync|General|Inbox|Notifications/i);
            if (!g1 || !poll) return { ok: false, reason: 'Missing controls in options.html' };
            h.setInputValue(poll, '180');
            await new Promise((r) => setTimeout(r, 150));
            const st = await window.browser.storage.local.get('settings');
            return { ok: true, seenG1, pollIntervalSeconds: (st.settings || {}).pollIntervalSeconds };
            """
        )
        self.assertTrue(opt_res.get("ok"), msg=str(opt_res))
        self.assertEqual(opt_res["seenG1"], "#1e293b")
        self.assertEqual(int(opt_res["pollIntervalSeconds"]), 180)

        dumped2 = self.safe_eval("return window.__webextMock.storage.dump();")
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", raw_storage=dumped2)
        pop_verify = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const h = window.__bridge.uiWin.__foxhubTestHelpers;
            h.openSettingsDrawer(uiDoc);
            await new Promise((r) => setTimeout(r, 80));
            const poll = await h.revealSettingControl(uiDoc, ['pollIntervalSeconds'], [/Check Interval|Poll Interval/i], ['Check Interval', 'Poll Interval', 'Interval'], /Mail|Sync|General|Inbox|Notifications/i);
            if (!poll) return { ok: false, reason: 'Missing pollIntervalSeconds in popup Settings UI' };
            return { ok: true, pollVal: String(poll.value || '') };
            """
        )
        self.assertTrue(pop_verify.get("ok"), msg=str(pop_verify))
        self.assertEqual(pop_verify["pollVal"], "180")

    def test_t4_07_scenario_7_full_backup_restore_migration_and_adversarial_rejection(self) -> None:
        """T4-07 (F5, F12, F14): Full Backup & Restore migration with custom UA app, shortcuts, themes & malformed rejection."""
        self.assert_repo_file("src/shared/settings-ui.js")
        rich_settings = make_default_settings_seed(
            theme="nordic-fjord",
            enabledMediaApps=list(DEFAULT_PINNED_APPS) + ["claude", "notion"],
            customMediaApps=[
                {
                    "id": "custom-wiki",
                    "name": "Work Wiki",
                    "url": "https://wiki.example.com/",
                    "color": "#336699",
                    "iconUrl": "",
                    "enabled": True,
                    "userAgentMode": "mobile",
                }
            ],
            appShortcuts={"claude": "Alt+Shift+C"},
            oauthAccounts=[{"email": "user@gmail.com", "accessToken": "tok-keep"}],
        )
        self.open_bridged_app("src/options/options.html", "", settings=rich_settings)

        res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const h = window.__bridge.uiWin.__foxhubTestHelpers;

            const findBackupBtns = () => ({
              exportBtn: h.findButtonByText(uiDoc, /Export.*Backup|Export Settings|Export JSON|Export/i, h.getSettingsRoot(uiDoc) || uiDoc.body),
              importBtn: h.findButtonByText(uiDoc, /Import.*Backup|Import Settings|Restore|Import/i, h.getSettingsRoot(uiDoc) || uiDoc.body),
            });
            let { exportBtn, importBtn } = findBackupBtns();
            if (!exportBtn || !importBtn) {
              const search = h.findSettingsSearchInput(uiDoc);
              if (search) {
                for (const q of ['Backup', 'Export']) {
                  h.setInputValue(search, q);
                  await new Promise((r) => setTimeout(r, 60));
                  ({ exportBtn, importBtn } = findBackupBtns());
                  if (exportBtn && importBtn) break;
                }
                if (!exportBtn || !importBtn) {
                  h.setInputValue(search, '');
                  await new Promise((r) => setTimeout(r, 40));
                }
              }
            }
            if (!exportBtn || !importBtn) {
              h.activateSettingsCategory(uiDoc, /Backup|Restore|Data|Import|Export/i);
              await new Promise((r) => setTimeout(r, 60));
              ({ exportBtn, importBtn } = findBackupBtns());
            }
            if (!exportBtn || !importBtn) {
              for (const tab of h.getSettingsCategoryTabs(uiDoc)) {
                tab.click();
                await new Promise((r) => setTimeout(r, 40));
                ({ exportBtn, importBtn } = findBackupBtns());
                if (exportBtn && importBtn) break;
              }
            }
            if (!exportBtn || !importBtn) {
              return { ok: false, reason: 'Missing Export/Import JSON Backup buttons in unified Settings UI' };
            }

            const expRes = await window.browser.runtime.sendMessage({ type: 'EXPORT_SETTINGS' });
            if (!expRes || !expRes.ok) return { ok: false, reason: 'EXPORT_SETTINGS failed' };

            await window.browser.runtime.sendMessage({
              type: 'UPDATE_SETTINGS',
              settings: {
                theme: 'warm-linen',
                enabledMediaApps: arguments[0],
                customMediaApps: [],
                appShortcuts: {},
              },
            });

            const bad1 = await window.browser.runtime.sendMessage({ type: 'IMPORT_SETTINGS', json: '{bad json' });
            const bad2 = await window.browser.runtime.sendMessage({
              type: 'IMPORT_SETTINGS',
              json: '{"schema":"foxhub-settings-backup","schemaVersion":1,"__proto__":{"pwned":true},"settings":{"theme":"true-night","__proto__":{"pwned":true}}}',
            });
            const bad3 = await window.browser.runtime.sendMessage({
              type: 'IMPORT_SETTINGS',
              payload: {
                schema: 'foxhub-settings-backup',
                schemaVersion: 1,
                settings: {
                  customMediaApps: [{ id: 'x', name: 'Bad', url: 'javascript:alert(1)', color: '#000000' }],
                },
              },
            });
            const pwned = ({}).pwned;
            const mid = await window.browser.runtime.sendMessage({ type: 'GET_STATE' });

            const good = await window.browser.runtime.sendMessage({
              type: 'IMPORT_SETTINGS',
              json: JSON.stringify(expRes.payload),
            });
            await new Promise((r) => setTimeout(r, 80));
            const finalState = await window.browser.runtime.sendMessage({ type: 'GET_STATE' });
            const cmds = await window.browser.commands.getAll();

            return {
              ok: true,
              bad1,
              bad2,
              bad3,
              pwned,
              midTheme: mid.settings.theme,
              good,
              finalSettings: finalState.settings,
              cmds,
            };
            """,
            list(DEFAULT_PINNED_APPS),
        )
        self.assertTrue(res.get("ok"), msg=str(res))
        self.assertFalse(res["bad1"].get("ok"))
        self.assertFalse(res["bad2"].get("ok"))
        self.assertFalse(res["bad3"].get("ok"))
        self.assertIsNone(res.get("pwned"))
        self.assertEqual(res["midTheme"], "warm-linen")

        self.assertTrue(res["good"].get("ok"))
        fs = res["finalSettings"]
        self.assertEqual(fs.get("theme"), "nordic-fjord")
        self.assertIn("claude", fs.get("enabledMediaApps", []))
        self.assertIn("notion", fs.get("enabledMediaApps", []))
        self.assertEqual(fs["customMediaApps"][0]["name"], "Work Wiki")
        self.assertEqual(fs["customMediaApps"][0]["userAgentMode"], "mobile")
        self.assertEqual([a["email"] for a in fs.get("oauthAccounts", [])], ["user@gmail.com"])
        slot1 = [c for c in res["cmds"] if c["name"] == "foxhub-app-slot-1"][0]
        self.assertEqual(slot1["shortcut"], "Alt+Shift+C")


if __name__ == "__main__":
    unittest.main()
