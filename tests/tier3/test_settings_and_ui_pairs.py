"""Tier 3 Module 1: Settings, UI Overhaul, Header Declutter & Backup/Restore Pairs (T3-01 .. T3-05)."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from _e2e_helpers import FoxHubE2EBase, make_default_settings_seed


class TestSettingsAndUIPairs(FoxHubE2EBase):
    """Pairwise cross-feature tests for F5, F6, F7, F8, F9, F10, F14, F15."""

    def test_t3_01_popup_options_storage_single_source_of_truth(self) -> None:
        """T3-01 (F5, F6): Sidebar Settings drawer <-> options.html <-> storage.local single source of truth."""
        self.assert_repo_file("src/shared/settings-ui.js")
        self.assert_repo_file("src/shared/settings-ui.css")

        initial = make_default_settings_seed(theme="warm-linen")
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", settings=initial)

        # Open sidebar settings drawer and update unified settings
        edit_res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const uiWin = window.__bridge.uiWin;
            const h = uiWin.__foxhubTestHelpers;
            if (!h.openSettingsDrawer(uiDoc)) return { ok: false, reason: 'Missing Settings trigger on rail' };
            await new Promise((r) => setTimeout(r, 180));

            const g1 = await h.revealSettingControl(uiDoc, ['gradientColor1', 'customGradient1'], [/Gradient.*1|Primary Gradient|Start Color/i], ['gradient'], /Appearance|Theme/i);
            const g2 = await h.revealSettingControl(uiDoc, ['gradientColor2', 'customGradient2'], [/Gradient.*2|Secondary Gradient|End Color/i], ['gradient'], /Appearance|Theme/i);
            if (!g1 || !g2) return { ok: false, reason: 'Missing gradient controls in popup' };
            h.setInputValue(g1, '#112233');
            h.setInputValue(g2, '#445566');
            const gradCard = g1.closest('[data-setting-card], .pm-control-card, .opt-card, .fh-card, section, div') || h.getSettingsRoot(uiDoc) || uiDoc.body;
            const applyGradBtn = h.findButtonByText(uiDoc, /Apply Gradient/i, gradCard) || h.findButtonByText(uiDoc, /Apply Gradient/i, uiDoc.body);
            if (applyGradBtn) {
              applyGradBtn.click();
              await new Promise((r) => setTimeout(r, 40));
            }

            const compact = await h.revealSettingControl(uiDoc, ['miniNowPlayingCompact'], [/Compact.*Now Playing|Now Playing.*Compact|Compact Strip/i], ['Compact', 'Now Playing'], /Media|Audio|Now Playing/i);
            if (!compact) return { ok: false, reason: 'Missing miniNowPlayingCompact in popup' };
            h.setCheckboxChecked(compact, true);

            const tabAudio = await h.revealSettingControl(uiDoc, ['tabAudioBehavior'], [/Tab Plays Audio|Tab Audio/i], ['Tab Audio', 'Pause'], /Media|Audio/i);
            if (!tabAudio) return { ok: false, reason: 'Missing tabAudioBehavior in popup' };
            if (tabAudio.tagName === 'SELECT') {
              h.setInputValue(tabAudio, 'pause-only');
            } else if (tabAudio.type === 'radio') {
              const scope = tabAudio.closest('[data-setting-card], .pm-control-card, .opt-card, fieldset, [role="radiogroup"], section, div') || uiDoc;
              const radio = scope.querySelector('input[type="radio"][value="pause-only"]')
                || Array.from(scope.querySelectorAll('input[type="radio"]')).find((r) => /pause[- ]only|pause only/i.test(r.value + ' ' + h.normText(r.closest('label') || r.parentElement)));
              if (radio) radio.click();
            } else {
              const scope = tabAudio.closest('[data-setting-card], .pm-control-card, .opt-card, fieldset, [role="radiogroup"], section, div') || uiDoc.body;
              const opt = scope.querySelector('[data-tab-audio-mode="pause-only"], [data-value="pause-only"], input[type="radio"][value="pause-only"]')
                || h.findButtonByText(uiDoc, /Pause Only/i, scope);
              if (opt) opt.click();
            }

            const qsSc = await h.revealSettingControl(uiDoc, ['quickSwitcherShortcut'], [/Quick Switcher.*Shortcut/i], ['Quick Switcher', 'Switcher'], /Shortcuts|Navigation|Switcher/i);
            if (!qsSc) return { ok: false, reason: 'Missing quickSwitcherShortcut in popup' };
            if (qsSc.tagName === 'BUTTON') {
              qsSc.click();
              await new Promise((r) => setTimeout(r, 30));
              uiWin.dispatchEvent(new uiWin.KeyboardEvent('keydown', { key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true, bubbles: true }));
            } else {
              h.setInputValue(qsSc, 'Ctrl+Shift+K');
            }

            await new Promise((r) => setTimeout(r, 150));
            const stored = await window.browser.storage.local.get('settings');
            return { ok: true, settings: stored.settings || {} };
            """
        )
        self.assertTrue(edit_res.get("ok"), msg=str(edit_res))
        s = edit_res["settings"]
        self.assertEqual(str(s.get("gradientColor1", "")).lower(), "#112233")
        self.assertEqual(str(s.get("customGradient1", "")).lower(), "#112233")
        self.assertEqual(str(s.get("gradientColor2", "")).lower(), "#445566")
        self.assertEqual(str(s.get("customGradient2", "")).lower(), "#445566")
        self.assertTrue(s.get("miniNowPlayingCompact"))
        self.assertEqual(s.get("tabAudioBehavior"), "pause-only")
        self.assertTrue(s.get("autoPauseOnTabAudio"))
        self.assertEqual(s.get("quickSwitcherShortcut"), "Ctrl+Shift+K")

        # Load options.html with exact dumped storage and verify parity + reverse sync
        dumped_storage = self.safe_eval("return window.__webextMock.storage.dump();")
        self.open_bridged_app("src/options/options.html", "", raw_storage=dumped_storage)

        opt_res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const uiWin = window.__bridge.uiWin;
            const h = uiWin.__foxhubTestHelpers;
            const g1 = await h.revealSettingControl(uiDoc, ['gradientColor1', 'customGradient1'], [/Gradient.*1|Primary Gradient|Start Color/i], ['gradient'], /Appearance|Theme/i);
            const g1Val = g1 ? String(g1.value || '').toLowerCase() : '';
            const compact = await h.revealSettingControl(uiDoc, ['miniNowPlayingCompact'], [/Compact.*Now Playing|Now Playing.*Compact|Compact Strip/i], ['Compact', 'Now Playing'], /Media|Audio|Now Playing/i);
            const compactVal = compact ? (compact.type === 'checkbox' ? Boolean(compact.checked) : compact.getAttribute('aria-checked') === 'true') : null;
            const qsSc = await h.revealSettingControl(uiDoc, ['quickSwitcherShortcut'], [/Quick Switcher.*Shortcut/i], ['Quick Switcher', 'Switcher'], /Shortcuts|Navigation|Switcher/i);
            const qsScVal = qsSc ? (qsSc.tagName === 'BUTTON' ? h.normText(qsSc) : String(qsSc.value || '')) : '';
            if (!g1 || !compact || !qsSc) {
              return { ok: false, reason: 'Missing unified settings controls in options.html' };
            }
            const readBefore = {
              g1: g1Val,
              compact: compactVal,
              qsSc: qsScVal,
            };
            const compactEdit = await h.revealSettingControl(uiDoc, ['miniNowPlayingCompact'], [/Compact.*Now Playing|Now Playing.*Compact|Compact Strip/i], ['Compact', 'Now Playing'], /Media|Audio|Now Playing/i);
            h.setCheckboxChecked(compactEdit, false);
            await new Promise((r) => setTimeout(r, 150));
            const stored = await window.browser.storage.local.get('settings');
            return { ok: true, readBefore, afterCompact: Boolean((stored.settings || {}).miniNowPlayingCompact) };
            """
        )
        self.assertTrue(opt_res.get("ok"), msg=str(opt_res))
        self.assertEqual(opt_res["readBefore"]["g1"], "#112233")
        self.assertTrue(opt_res["readBefore"]["compact"])
        self.assertEqual(opt_res["readBefore"]["qsSc"], "Ctrl+Shift+K")
        self.assertFalse(opt_res["afterCompact"])

        # Re-open popup and verify reverse edit synced cleanly
        dumped2 = self.safe_eval("return window.__webextMock.storage.dump();")
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1", raw_storage=dumped2)
        pop_check = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const uiWin = window.__bridge.uiWin;
            const h = uiWin.__foxhubTestHelpers;
            h.openSettingsDrawer(uiDoc);
            await new Promise((r) => setTimeout(r, 60));
            const compact = await h.revealSettingControl(uiDoc, ['miniNowPlayingCompact'], [/Compact.*Now Playing|Now Playing.*Compact|Compact Strip/i], ['Compact', 'Now Playing'], /Media|Audio|Now Playing/i);
            if (!compact) return { ok: false, reason: 'Missing compact control on reload' };
            return {
              ok: true,
              checked: compact.type === 'checkbox' ? Boolean(compact.checked) : compact.getAttribute('aria-checked') === 'true',
            };
            """
        )
        self.assertTrue(pop_check.get("ok"), msg=str(pop_check))
        self.assertFalse(pop_check["checked"])

    def test_t3_02_settings_live_search_and_userchrome_generator(self) -> None:
        """T3-02 (F6, F9): Settings live search + optional userChrome.css generator presets."""
        self.assert_repo_file("src/shared/settings-ui.js")
        self.open_ui_toplevel("src/options/options.html", "")

        res = self.safe_eval_async(
            """
            const h = window.__foxhubTestHelpers;
            const spy = window.__webextMock.installClipboardSpy();
            const search = h.findSettingsSearchInput(document);
            if (!search) return { ok: false, reason: 'Missing unified Settings live search input' };

            h.setInputValue(search, 'userChrome');
            await new Promise((r) => setTimeout(r, 80));

            const card = h.findUserChromeCard(document);
            if (!card) return { ok: false, reason: 'Missing userChrome.css companion generator card' };
            const cardText = h.normText(card);
            const hasOptionalDisclaimer = /optional/i.test(cardText);

            const presetPatterns = [
              /Hide sidebar header/i,
              /Hover[- ]to[- ]expand/i,
              /Rounded sidebar/i,
            ];
            const copied = [];
            for (const pat of presetPatterns) {
              const rowMatches = Array.from(card.querySelectorAll('div, section, li, article'))
                .filter((el) => h.isVisible(el) && pat.test(h.normText(el)) && h.findButtonByText(document, /Copy/i, el));
              rowMatches.sort((a, b) => h.normText(a).length - h.normText(b).length);
              const row = rowMatches[0] || card;
              let btn = h.findButtonByText(document, /Copy/i, row);
              if (!btn) {
                btn = Array.from(card.querySelectorAll('button')).find((b) => pat.test(h.normText(b) + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('data-preset') || '')));
              }
              if (!btn) return { ok: false, reason: 'Missing Copy button for preset: ' + pat };
              const prevCount = spy.getHistory().length;
              btn.click();
              await new Promise((r) => setTimeout(r, 30));
              const hist = spy.getHistory();
              if (hist.length <= prevCount) {
                return { ok: false, reason: 'Copy button click did not write to clipboard for preset: ' + pat };
              }
              copied.push(spy.getText());
            }

            // Unmatched query should hide cards cleanly without throwing
            h.setInputValue(search, 'zzzz_no_match_999');
            await new Promise((r) => setTimeout(r, 60));
            const cardVisibleAfterMiss = h.isVisible(card);

            return { ok: true, hasOptionalDisclaimer, copied, cardVisibleAfterMiss };
            """
        )
        self.assertTrue(res.get("ok"), msg=str(res))
        self.assertTrue(res["hasOptionalDisclaimer"], msg="userChrome.css card must explicitly label presets optional")
        self.assertEqual(len(res["copied"]), 3)
        self.assertEqual(
            len({c.strip() for c in res["copied"]}),
            3,
            msg=f"All 3 userChrome.css presets must copy distinct CSS, got: {res['copied']}",
        )
        for css_text in res["copied"]:
            self.assertGreater(len(css_text.strip()), 15)
            self.assertIn("{", css_text)
        self.assertFalse(res["cardVisibleAfterMiss"], msg="Unmatched search query should hide unrelated userChrome card")

    def test_t3_03_settings_search_advanced_diagnostics_and_feature_toggles(self) -> None:
        """T3-03 (F6, F10, F15): Tucked-away Advanced Diagnostics + live search for feature toggles."""
        self.assert_repo_file("src/shared/settings-ui.js")
        self.open_bridged_app("src/popup/popup.html", "?sidebar=1")

        res = self.safe_eval_async(
            """
            const uiDoc = window.__bridge.uiDoc;
            const uiWin = window.__bridge.uiWin;
            const h = uiWin.__foxhubTestHelpers;
            if (!h.openSettingsDrawer(uiDoc)) return { ok: false, reason: 'Missing Settings trigger on rail' };
            await new Promise((r) => setTimeout(r, 180));

            let diag = h.findDiagnosticsSection(uiDoc);
            if (!diag) {
              h.activateSettingsCategory(uiDoc, /Diagnostics|Advanced/i);
              await new Promise((r) => setTimeout(r, 50));
              diag = h.findDiagnosticsSection(uiDoc);
            }
            if (!diag) return { ok: false, reason: 'Missing tucked-away Advanced Diagnostics section' };
            const initiallyOpen = diag.kind === 'details'
              ? Boolean(diag.container.open)
              : Boolean(uiDoc.querySelector('#pm-live-audio-log-panel') && h.isVisible(uiDoc.querySelector('#pm-live-audio-log-panel')));

            let search = h.findSettingsSearchInput(uiDoc);
            if (!search) return { ok: false, reason: 'Missing live search input in sidebar Settings drawer' };

            h.setInputValue(search, 'Now Playing');
            await new Promise((r) => setTimeout(r, 60));
            const npToggle = h.findControlByKeyOrLabel(
              uiDoc,
              ['miniNowPlayingEnabled'],
              [/^(?!.*(?:compact|auto-?hide|progress|position)).*(?:Enable.*Now Playing|Show.*Now Playing|Mini.*Now Playing)/i, /Enable.*Now Playing|Show.*Now Playing/i]
            );
            const npAutoHide = h.findControlByKeyOrLabel(uiDoc, ['miniNowPlayingAutoHidePaused'], [/Auto-?hide.*paused|Hide when paused/i]);
            if (!npToggle || !npAutoHide) return { ok: false, reason: 'Search "Now Playing" did not surface Now Playing controls' };
            h.setCheckboxChecked(npToggle, false);
            await new Promise((r) => setTimeout(r, 40));
            const npAutoHide2 = h.findControlByKeyOrLabel(uiDoc, ['miniNowPlayingAutoHidePaused'], [/Auto-?hide.*paused|Hide when paused/i])
              || await h.revealSettingControl(uiDoc, ['miniNowPlayingAutoHidePaused'], [/Auto-?hide.*paused|Hide when paused/i], ['Now Playing'], /Media|Audio|Now Playing/i);
            if (!npAutoHide2) return { ok: false, reason: 'Missing miniNowPlayingAutoHidePaused after toggle' };
            h.setCheckboxChecked(npAutoHide2, false);
            await new Promise((r) => setTimeout(r, 40));

            search = h.findSettingsSearchInput(uiDoc);
            if (!search) return { ok: false, reason: 'Missing live search input before Quick Switcher search' };
            h.setInputValue(search, 'Quick Switcher');
            await new Promise((r) => setTimeout(r, 60));
            const qsToggle = h.findControlByKeyOrLabel(uiDoc, ['quickSwitcherEnabled'], [/Enable.*Quick Switcher|Quick Switcher/i]);
            if (!qsToggle) return { ok: false, reason: 'Search "Quick Switcher" did not surface Quick Switcher toggle' };
            h.setCheckboxChecked(qsToggle, false);
            await new Promise((r) => setTimeout(r, 40));

            search = h.findSettingsSearchInput(uiDoc);
            if (!search) return { ok: false, reason: 'Missing live search input before Diagnostics search' };
            h.setInputValue(search, 'Diagnostics');
            await new Promise((r) => setTimeout(r, 60));
            const diagAfter = h.findDiagnosticsSection(uiDoc);
            if (!diagAfter) return { ok: false, reason: 'Diagnostics section vanished on search "Diagnostics"' };
            if (diagAfter.kind !== 'details' || !diagAfter.container.open) {
              diagAfter.toggle.click();
            }
            await new Promise((r) => setTimeout(r, 80));
            let clearBtn = h.findButtonByText(uiDoc, /^Clear$/i, diagAfter.container) || h.findButtonByText(uiDoc, /Clear/i, diagAfter.container);
            if (!clearBtn) {
              const viewLogBtn = h.findButtonByText(uiDoc, /View Live Log|Live Log|Show Log/i, diagAfter.container);
              if (viewLogBtn) {
                viewLogBtn.click();
                await new Promise((r) => setTimeout(r, 80));
                clearBtn = h.findButtonByText(uiDoc, /^Clear$/i, diagAfter.container) || h.findButtonByText(uiDoc, /Clear/i, diagAfter.container);
              }
            }
            if (!clearBtn) return { ok: false, reason: 'Missing Clear diagnostics button after expanding Diagnostics' };
            clearBtn.click();
            await new Promise((r) => setTimeout(r, 80));

            const stored = await window.browser.storage.local.get('settings');
            return { ok: true, initiallyOpen, settings: stored.settings || {} };
            """
        )
        self.assertTrue(res.get("ok"), msg=str(res))
        self.assertFalse(res["initiallyOpen"], msg="Advanced Diagnostics must be collapsed/tucked away by default")
        self.assertFalse(res["settings"].get("miniNowPlayingEnabled"))
        self.assertFalse(res["settings"].get("miniNowPlayingAutoHidePaused"))
        self.assertFalse(res["settings"].get("quickSwitcherEnabled"))

    def test_t3_04_backup_restore_unified_schema_and_pollution_guard(self) -> None:
        """T3-04 (F5, F14): JSON Export/Import round-trip + prototype pollution & malformed payload rejection."""
        seeded = make_default_settings_seed(
            theme="nordic-fjord",
            gradientColor1="#123456",
            customGradient1="#123456",
            oauthAccounts=[{"email": "keep@gmail.com", "accessToken": "secret-tok"}],
            appShortcuts={"spotify": "Alt+Shift+S"},
            miniNowPlayingPosition="top",
        )
        self.open_background(settings=seeded)

        res = self.safe_eval_async(
            """
            const exported = await browser.runtime.sendMessage({ type: 'EXPORT_SETTINGS' });
            if (!exported || !exported.ok || !exported.payload) {
              return { ok: false, reason: 'EXPORT_SETTINGS failed: ' + JSON.stringify(exported) };
            }

            // Mutate settings to defaults before import tests
            await browser.runtime.sendMessage({
              type: 'UPDATE_SETTINGS',
              settings: {
                theme: 'warm-linen',
                gradientColor1: '#ffffff',
                appShortcuts: {},
                miniNowPlayingPosition: 'bottom',
              },
            });

            // 1. Prototype pollution payload (raw JSON string so __proto__ key is preserved)
            const protoPayload = '{"schema":"foxhub-settings-backup","schemaVersion":1,"__proto__":{"foxhubPolluted":true},"settings":{"theme":"true-night","__proto__":{"foxhubPolluted":true}}}';
            const rProto = await browser.runtime.sendMessage({ type: 'IMPORT_SETTINGS', json: protoPayload });
            const rMalformed = await browser.runtime.sendMessage({ type: 'IMPORT_SETTINGS', json: '{bad json' });
            const rWrongSchema = await browser.runtime.sendMessage({
              type: 'IMPORT_SETTINGS',
              payload: { schema: 'other-ext', schemaVersion: 1, settings: { theme: 'true-night' } },
            });

            const afterInvalid = await browser.runtime.sendMessage({ type: 'GET_STATE' });
            const polluted = ({}).foxhubPolluted;

            const rRestore = await browser.runtime.sendMessage({
              type: 'IMPORT_SETTINGS',
              json: JSON.stringify(exported.payload),
            });
            const afterRestore = await browser.runtime.sendMessage({ type: 'GET_STATE' });

            return {
              ok: true,
              exportedPayload: exported.payload,
              rProto,
              rMalformed,
              rWrongSchema,
              afterInvalidTheme: afterInvalid.settings.theme,
              polluted,
              rRestore,
              restored: afterRestore.settings,
            };
            """
        )
        self.assertTrue(res.get("ok"), msg=str(res))
        payload = res["exportedPayload"]
        self.assertEqual(payload.get("schema"), "foxhub-settings-backup")
        self.assertEqual(payload.get("schemaVersion"), 1)
        self.assertNotIn("oauthAccounts", payload.get("settings", {}))

        self.assertFalse(res["rProto"].get("ok"), msg="Prototype pollution payload must be rejected")
        self.assertFalse(res["rMalformed"].get("ok"), msg="Malformed JSON must be rejected")
        self.assertFalse(res["rWrongSchema"].get("ok"), msg="Unknown schema must be rejected")
        self.assertIsNone(res.get("polluted"), msg="Object.prototype must not be polluted")
        self.assertEqual(res["afterInvalidTheme"], "warm-linen")

        self.assertTrue(res["rRestore"].get("ok"), msg=f"Valid restore failed: {res['rRestore']}")
        restored = res["restored"]
        self.assertEqual(restored.get("theme"), "nordic-fjord")
        self.assertEqual(str(restored.get("gradientColor1", "")).lower(), "#123456")
        self.assertEqual(restored.get("appShortcuts"), {"spotify": "Alt+Shift+S"})
        self.assertEqual(restored.get("miniNowPlayingPosition"), "top")
        self.assertEqual(
            [a.get("email") for a in restored.get("oauthAccounts", [])],
            ["keep@gmail.com"],
        )

    def test_t3_05_decluttered_header_and_left_rail_quick_controls(self) -> None:
        """T3-05 (F7, F8): .pm-header-actions removes 4 duplicated buttons while left-rail controls work."""
        # Verify #rail-btn-open-sidebar is visible in toolbar popup mode (innerHeight <= 605)
        self.fx.set_viewport(520, 580)
        self.open_ui_toplevel("src/popup/popup.html", "")
        popup_audit = self.safe_eval_async(
            """
            await new Promise((r) => setTimeout(r, 80));
            const h = window.__foxhubTestHelpers;
            const openSbBtn = h.findRailButton(document, 'rail-btn-open-sidebar', /open.*sidebar/i);
            return {
              hasOpenSidebarBtn: Boolean(openSbBtn),
              openSidebarVisible: Boolean(openSbBtn && h.isVisible(openSbBtn)),
            };
            """
        )
        self.assertTrue(
            popup_audit.get("openSidebarVisible"),
            msg=f"Open Sidebar rail button must be visible in toolbar popup mode (520x580): {popup_audit}",
        )

        self.open_ui_toplevel("src/popup/popup.html", "?sidebar=1")

        for w, h in ((1200, 800), (320, 640)):
            self.fx.set_viewport(w, h)
            audit = self.safe_eval(
                """
                const h = window.__foxhubTestHelpers;
                const header = document.querySelector('.pm-header-actions');
                if (!header) return { ok: false, reason: 'Missing .pm-header-actions' };
                const forbiddenIds = ['btn-open-sidebar', 'btn-night-mode', 'btn-dnd', 'btn-settings'];
                const presentForbidden = forbiddenIds.filter((id) => Boolean(header.querySelector('#' + id)));
                const requiredRail = [
                  ['rail-btn-night-mode', /night\\s*mode/i],
                  ['rail-btn-mute-notifs', /mute/i],
                  ['rail-btn-sidebar-settings', /settings/i],
                ];
                const missingRail = requiredRail
                  .filter(([id, rx]) => !h.findRailButton(document, id, rx))
                  .map(([id]) => id);
                return { ok: true, presentForbidden, missingRail };
                """
            )
            self.assertTrue(audit.get("ok"), msg=str(audit))
            self.assertEqual(
                audit["presentForbidden"],
                [],
                msg=f"Decluttered .pm-header-actions must not duplicate rail buttons at {w}x{h}: {audit['presentForbidden']}",
            )
            self.assertEqual(audit["missingRail"], [], msg=f"Missing left-rail controls: {audit['missingRail']}")

        self.fx.set_viewport(1200, 800)
        state_after = self.safe_eval_async(
            """
            const h = window.__foxhubTestHelpers;
            const nightBtn = h.findRailButton(document, 'rail-btn-night-mode', /night\\s*mode/i);
            const muteBtn = h.findRailButton(document, 'rail-btn-mute-notifs', /mute/i);
            const settingsBtn = h.findRailButton(document, 'rail-btn-sidebar-settings', /settings/i);

            if (!nightBtn || !h.isVisible(nightBtn)) return { ok: false, reason: 'Night Mode rail button not visible' };
            if (!muteBtn || !h.isVisible(muteBtn)) return { ok: false, reason: 'Mute rail button not visible' };
            if (!settingsBtn || !h.isVisible(settingsBtn)) return { ok: false, reason: 'Settings rail button not visible' };

            nightBtn.click();
            await new Promise((r) => setTimeout(r, 60));

            muteBtn.click();
            await new Promise((r) => setTimeout(r, 80));
            const findMutePop = () => {
              const byId = document.getElementById('pm-mute-popover');
              if (byId && h.isVisible(byId)) return byId;
              return Array.from(document.querySelectorAll('[role="dialog"], [role="menu"], [data-mute-popover], [class*="mute-popover"]'))
                .find((el) => h.isVisible(el) && /mute/i.test(h.normText(el)));
            };
            const mutePop = findMutePop();
            let muteChecked = false;
            let mutePopoverVisible = Boolean(mutePop);
            let mutePopoverDismissed = true;
            if (mutePop) {
              const chk = mutePop.querySelector('#chk-mute-sites, #chk-mute-all, input[type="checkbox"]');
              if (chk) {
                h.setCheckboxChecked(chk, true);
                await new Promise((r) => setTimeout(r, 50));
                muteChecked = true;
              }
              muteBtn.click();
              await new Promise((r) => setTimeout(r, 60));
              if (findMutePop()) {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                await new Promise((r) => setTimeout(r, 50));
              }
              mutePopoverDismissed = !findMutePop();
            } else {
              await new Promise((r) => setTimeout(r, 60));
            }

            settingsBtn.click();
            await new Promise((r) => setTimeout(r, 180));
            const st = await browser.storage.local.get('settings');
            const s = st.settings || {};
            const sRoot = h.getSettingsRoot(document);
            const drawer = document.querySelector('.fh-settings-root, [data-settings-root], #foxhub-settings-root, #pm-settings-ui-root, [aria-label*="Settings" i]:not(button)')
              || document.getElementById('pm-media-apps-drawer')
              || (sRoot && sRoot !== document.body ? sRoot : null);
            return {
              ok: true,
              theme: s.theme,
              mutePopoverVisible,
              muteChecked,
              mutePopoverDismissed,
              muteAnyStored: Boolean(s.muteAllNotifications || s.muteSiteNotifications || s.muteEmailNotifications),
              drawerOpen: Boolean(drawer && h.isVisible(drawer)),
            };
            """
        )
        self.assertTrue(state_after.get("ok"), msg=str(state_after))
        self.assertEqual(state_after["theme"], "true-night")
        self.assertTrue(
            state_after["mutePopoverVisible"] or state_after["muteAnyStored"],
            msg=f"Clicking Mute rail button must open mute popover or toggle mute state: {state_after}",
        )
        self.assertTrue(state_after["mutePopoverDismissed"], msg="Mute popover should dismiss cleanly before opening Settings")
        self.assertTrue(state_after["drawerOpen"], msg="Clicking Settings rail button must open Settings drawer")


if __name__ == "__main__":
    unittest.main()
