"""Shared opaque-box E2E helpers for Tier 3 and Tier 4 tests.

Non-test helper module (intentionally not named test_*.py so tests/run_tests.py
does not treat it as a test module).
"""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys
import unittest
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tests.lib import mock_helpers
from tests.lib.firefox_harness import HeadlessFirefox
from tests.lib.http_fixtures import FixtureServer

DEFAULT_PINNED_APPS = [
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

EXTRA_UNPINNED_APPS = [
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

ALL_21_BUILTIN_APP_IDS = DEFAULT_PINNED_APPS + EXTRA_UNPINNED_APPS

NEW_8_PRESET_IDS = [
    "claude",
    "perplexity",
    "soundcloud",
    "apple-music",
    "bluesky",
    "notion",
    "google-calendar",
    "google-keep",
]

SEMANTIC_HELPERS_JS = r"""
(function () {
  if (window.__foxhubTestHelpers) return;

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const cs = (el.ownerDocument.defaultView || window).getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function normText(el) {
    return String((el && (el.innerText || el.textContent)) || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getRect(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  }

  function setInputValue(el, value) {
    if (!el) return false;
    const win = el.ownerDocument.defaultView || window;
    el.focus();
    const proto = el.tagName === 'TEXTAREA'
      ? win.HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT'
        ? win.HTMLSelectElement.prototype
        : win.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && typeof desc.set === 'function') {
      desc.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
    return true;
  }

  function isControlVisible(ctrl, fallbackBox) {
    if (!ctrl) return false;
    if (isVisible(ctrl)) return true;
    if (ctrl.tagName === 'INPUT' && (ctrl.type === 'checkbox' || ctrl.type === 'radio')) {
      const cs = (ctrl.ownerDocument.defaultView || window).getComputedStyle(ctrl);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const wrapper = ctrl.closest('label, .fh-switch, [role="switch"]') || fallbackBox;
      return Boolean(wrapper && isVisible(wrapper));
    }
    return false;
  }

  function setCheckboxChecked(el, checked) {
    if (!el) return false;
    const win = el.ownerDocument.defaultView || window;
    if (el.type === 'checkbox') {
      if (Boolean(el.checked) !== Boolean(checked)) {
        const lbl = !isVisible(el) ? el.closest('label, .fh-switch, [role="switch"]') : null;
        if (lbl && isVisible(lbl)) {
          lbl.click();
        } else {
          el.click();
        }
      }
      if (Boolean(el.checked) !== Boolean(checked)) {
        el.click();
      }
      if (Boolean(el.checked) !== Boolean(checked)) {
        el.checked = Boolean(checked);
        el.dispatchEvent(new win.Event('input', { bubbles: true }));
        el.dispatchEvent(new win.Event('change', { bubbles: true }));
      }
      return true;
    }
    const pressed = el.getAttribute('aria-checked') || el.getAttribute('aria-pressed');
    if (pressed !== null) {
      const cur = pressed === 'true';
      if (cur !== Boolean(checked)) el.click();
      return true;
    }
    el.click();
    return true;
  }

  function getSettingsRoot(doc) {
    const candidates = [
      doc.querySelector('[data-settings-root]'),
      doc.querySelector('#foxhub-settings-root'),
      doc.querySelector('#pm-settings-ui-root'),
      doc.querySelector('.fh-settings-root'),
      doc.querySelector('#pm-media-apps-drawer:not(.hidden)'),
      doc.querySelector('main.opt-main'),
      doc.querySelector('.opt-layout'),
      doc.querySelector('.settings-container'),
      doc.querySelector('[aria-label*="Settings" i]:not(button)'),
      doc.querySelector('main, [role="main"]'),
      doc.body,
    ];
    for (const c of candidates) {
      if (c && isVisible(c)) return c;
    }
    return doc.body;
  }

  function findRailRoot(doc) {
    return (
      doc.getElementById('pm-opera-rail') ||
      doc.querySelector('aside[aria-label], nav[aria-label*="Sidebar" i], [role="navigation"][aria-label*="Sidebar" i]') ||
      doc.querySelector('aside, [role="navigation"]')
    );
  }

  function findRailButton(doc, preferredId, labelRegex) {
    if (preferredId) {
      const byId = doc.getElementById(preferredId);
      if (byId) return byId;
    }
    const rail = findRailRoot(doc);
    if (!rail) return null;
    const rx = isRegExp(labelRegex) ? new RegExp(labelRegex.source, labelRegex.flags) : new RegExp(String(labelRegex), 'i');
    const btns = Array.from(rail.querySelectorAll('button, [role="button"]')).filter((b) => {
      if (b.closest('#pm-rail-apps-list, [data-rail-apps]')) return false;
      return true;
    });
    for (const b of btns) {
      const meta = [
        b.getAttribute('aria-label') || '',
        b.getAttribute('title') || '',
        b.getAttribute('data-action') || '',
        b.getAttribute('data-rail-action') || '',
        normText(b),
      ].join(' ');
      if (rx.test(meta)) return b;
    }
    return null;
  }

  function openSettingsDrawer(doc) {
    const btn = findRailButton(doc, 'rail-btn-sidebar-settings', /settings/i)
      || findButtonByText(doc, /Settings/i, findRailRoot(doc) || doc.body);
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }

  const BUILTIN_APP_PATTERNS = [
    ['google-calendar', /\bgoogle\s*calendar\b/i],
    ['google-keep', /\bgoogle\s*keep\b/i],
    ['apple-music', /\bapple\s*music\b/i],
    ['soundcloud', /\bsoundcloud\b/i],
    ['perplexity', /\bperplexity\b/i],
    ['instagram', /\binstagram\b/i],
    ['whatsapp', /\bwhatsapp\b/i],
    ['messenger', /\bmessenger\b/i],
    ['telegram', /\btelegram\b/i],
    ['discord', /\bdiscord\b/i],
    ['spotify', /\bspotify\b/i],
    ['youtube', /\byoutube\b/i],
    ['chatgpt', /\bchatgpt\b/i],
    ['bluesky', /\bbluesky\b/i],
    ['tiktok', /\btiktok\b/i],
    ['reddit', /\breddit\b/i],
    ['twitch', /\btwitch\b/i],
    ['gemini', /\bgemini\b/i],
    ['claude', /\bclaude\b/i],
    ['notion', /\bnotion\b/i],
    ['x', /^(x|x\s*\(twitter\)|twitter)$/i],
  ];

  function inferRailAppId(el) {
    if (!el) return '';
    const explicit = el.getAttribute('data-app-id') || el.getAttribute('data-id') || '';
    if (explicit) return explicit;
    const inner = el.querySelector && el.querySelector('[data-app-id], [data-id]');
    if (inner) return inner.getAttribute('data-app-id') || inner.getAttribute('data-id') || '';
    const innerBtn = el.querySelector && el.querySelector('button, [role="button"]');
    const rawMeta = [
      el.getAttribute('title') || '',
      el.getAttribute('aria-label') || '',
      innerBtn ? (innerBtn.getAttribute('title') || '') : '',
      innerBtn ? (innerBtn.getAttribute('aria-label') || '') : '',
      normText(el),
    ].join(' ').replace(/\s+/g, ' ').trim();
    for (const [id, rx] of BUILTIN_APP_PATTERNS) {
      if (id === 'x') {
        const parts = [
          (el.getAttribute('title') || '').trim(),
          (el.getAttribute('aria-label') || '').trim(),
          innerBtn ? (innerBtn.getAttribute('title') || '').trim() : '',
          innerBtn ? (innerBtn.getAttribute('aria-label') || '').trim() : '',
          normText(el),
        ].filter(Boolean);
        if (parts.some((p) => rx.test(p) || /\bx\s*\(twitter\)|\btwitter\b/i.test(p))) return 'x';
      } else if (rx.test(rawMeta)) {
        return id;
      }
    }
    return '';
  }

  function findSemanticRailAppsContainer(rail) {
    if (!rail) return null;
    const containers = [rail, ...Array.from(rail.querySelectorAll('div, ul, ol, section, nav'))];
    let best = null;
    let bestCount = 0;
    for (const c of containers) {
      const kids = Array.from(c.children).filter((el) => isVisible(el));
      const appKidCount = kids.filter((el) => Boolean(inferRailAppId(el))).length;
      if (appKidCount >= 2 && (appKidCount > bestCount || (appKidCount === bestCount && c !== rail))) {
        best = c;
        bestCount = appKidCount;
      }
    }
    return best;
  }

  function isRailUtilityButton(el) {
    const meta = [
      el.getAttribute('id') || '',
      el.getAttribute('title') || '',
      el.getAttribute('aria-label') || '',
      el.getAttribute('data-action') || '',
      el.getAttribute('data-rail-action') || '',
      normText(el),
    ].join(' ');
    return /rail-btn-(mail|open-sidebar|night-mode|mute-notifs|sidebar-settings|add-app)|mail\s*inbox|open.*sidebar|night\s*mode|mute|add\s*or\s*pin|settings/i.test(meta) && !inferRailAppId(el);
  }

  function getRailAppItems(doc) {
    const rail = findRailRoot(doc);
    let container = doc.getElementById('pm-rail-apps-list')
      || doc.querySelector('[data-rail-apps], .pm-rail-apps-list, .fh-rail-apps');
    if (!container && rail) {
      container = findSemanticRailAppsContainer(rail);
    }
    if (container) {
      const keyed = Array.from(container.querySelectorAll('[data-app-id], [data-id]'))
        .filter((el) => {
          const p = el.parentElement;
          return !p || !p.closest('#pm-rail-apps-list [data-app-id], #pm-rail-apps-list [data-id], [data-rail-apps] [data-app-id], [data-rail-apps] [data-id], .fh-rail-apps [data-app-id], .fh-rail-apps [data-id]');
        });
      if (keyed.length > 0) return keyed;
      const directKids = Array.from(container.children).filter((el) => {
        if (!isVisible(el)) return false;
        if (!(el.matches('button, [role="button"], a') || Boolean(el.querySelector('button, [role="button"], a')))) return false;
        if (container === rail) return Boolean(inferRailAppId(el));
        return !isRailUtilityButton(el);
      });
      if (directKids.length > 0) return directKids;
      const topBtns = Array.from(container.querySelectorAll('button, [role="button"]'))
        .filter((el) => {
          const p = el.parentElement;
          return (!p || !p.closest('button, [role="button"]')) && !isRailUtilityButton(el);
        });
      if (topBtns.length > 0) return topBtns;
      return Array.from(container.children).filter((el) => isVisible(el) && !isRailUtilityButton(el));
    }
    if (!rail) return [];
    const rawCandidates = Array.from(rail.querySelectorAll('[data-app-id], [data-id], button, [role="button"]'))
      .filter((el) => {
        const p = el.parentElement;
        if (p && p.closest('[data-app-id], [data-id], button, [role="button"]')) return false;
        if (isRailUtilityButton(el)) return false;
        const meta = [
          el.getAttribute('title') || '',
          el.getAttribute('aria-label') || '',
          normText(el),
        ].join(' ');
        if (/play\s*\/?\s*pause|mute|prev|next/i.test(meta) && p && p !== rail) {
          const siblingApp = Array.from(p.querySelectorAll('button, [role="button"]')).some((sib) => sib !== el && !/play\s*\/?\s*pause|mute|prev|next/i.test([sib.getAttribute('title') || '', sib.getAttribute('aria-label') || '', normText(sib)].join(' ')) && Boolean(inferRailAppId(sib)));
          if (siblingApp) return false;
        }
        return Boolean(el.getAttribute('data-app-id') || el.getAttribute('data-id') || inferRailAppId(el));
      });
    const dedup = new Set();
    const out = [];
    for (const el of rawCandidates) {
      let item = el;
      const p = el.parentElement;
      if (p && p !== rail) {
        const parentAppIds = new Set(
          Array.from(p.querySelectorAll('button, [role="button"], [data-app-id], [data-id]'))
            .map((c) => inferRailAppId(c))
            .filter(Boolean)
        );
        if (parentAppIds.size === 1) {
          item = p;
        }
      }
      if (!dedup.has(item)) {
        dedup.add(item);
        out.push(item);
      }
    }
    return out;
  }

  function findSettingsSearchInput(doc) {
    const root = getSettingsRoot(doc);
    if (!root) return null;
    const inputs = Array.from(root.querySelectorAll('input[type="search"], input[type="text"], input:not([type])'));
    for (const inp of inputs) {
      if (!isVisible(inp)) continue;
      if (inp.id === 'pm-search-input') continue;
      const ph = (inp.getAttribute('placeholder') || '').toLowerCase();
      const aria = (inp.getAttribute('aria-label') || '').toLowerCase();
      const role = (inp.getAttribute('role') || '').toLowerCase();
      const dt = (inp.getAttribute('data-settings-search') || '').toLowerCase();
      if (
        inp.type === 'search' ||
        role === 'searchbox' ||
        dt !== '' ||
        ph.includes('search') ||
        ph.includes('filter') ||
        aria.includes('search') ||
        aria.includes('filter')
      ) {
        return inp;
      }
    }
    return null;
  }

  function getSettingsCategoryTabs(doc) {
    const root = getSettingsRoot(doc) || doc.body;
    const raw = Array.from(
      root.querySelectorAll(
        '[role="tab"], [data-category], [data-settings-tab], [data-settings-section], .opt-nav button, .opt-nav a, .settings-nav button, .fh-settings-nav button, nav button, nav [role="button"]'
      )
    );
    const seen = new Set();
    return raw.filter((el) => {
      if (seen.has(el) || !isVisible(el)) return false;
      if (el.closest('[role="dialog"], .pm-modal, .fh-modal')) return false;
      const txt = normText(el) || el.getAttribute('aria-label') || '';
      if (!txt || txt.length > 60) return false;
      seen.add(el);
      return true;
    });
  }

  function activateSettingsCategory(doc, pattern) {
    const rx = isRegExp(pattern) ? new RegExp(pattern.source, pattern.flags) : new RegExp(String(pattern), 'i');
    const tabs = getSettingsCategoryTabs(doc);
    const match = tabs.find((el) => {
      const meta = [
        normText(el),
        el.getAttribute('aria-label') || '',
        el.getAttribute('data-category') || '',
        el.getAttribute('data-settings-tab') || '',
        el.getAttribute('data-settings-section') || '',
      ].join(' ');
      return rx.test(meta);
    });
    if (match) {
      match.click();
      return match;
    }
    return null;
  }

  function isRegExp(val) {
    return Object.prototype.toString.call(val) === '[object RegExp]';
  }

  function findControlByKeyOrLabel(doc, keys, labelRegexes, opts) {
    const root = getSettingsRoot(doc) || doc.body;
    const allowHidden = Boolean(opts && opts.allowHidden);
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const k of keyList) {
      if (!k) continue;
      const direct = root.querySelector(
        `[data-setting-key="${k}"], [data-key="${k}"], [name="${k}"]`
      );
      if (direct && (isControlVisible(direct) || allowHidden)) return direct;
    }
    const regexes = (Array.isArray(labelRegexes) ? labelRegexes : [labelRegexes]).map((r) =>
      isRegExp(r) ? new RegExp(r.source, r.flags) : new RegExp(String(r), 'i')
    );
    const directCtrls = Array.from(
      root.querySelectorAll('input:not([type="search"]), select, textarea, button[role="switch"], button[role="radio"], button[data-sc-scope], button.fh-shortcut-btn, button[data-shortcut-control]')
    );
    for (const rx of regexes) {
      for (const ctrl of directCtrls) {
        if (!isControlVisible(ctrl) && !allowHidden) continue;
        const attrMeta = [
          ctrl.getAttribute('title') || '',
          ctrl.getAttribute('aria-label') || '',
          ctrl.getAttribute('placeholder') || '',
        ].join(' ').replace(/\s+/g, ' ').trim();
        if (attrMeta && rx.test(attrMeta)) {
          return ctrl;
        }
      }
    }
    const containers = Array.from(
      root.querySelectorAll('label, fieldset, [role="radiogroup"], [data-setting-card], .pm-control-card, .opt-card, .fh-setting-row, .fh-row, .settings-row, tr, section, div')
    );
    let best = null;
    let bestLen = Infinity;
    for (const box of containers) {
      if (!isVisible(box)) continue;
      const txt = normText(box);
      if (!txt || txt.length > 420) continue;
      if (!regexes.some((rx) => rx.test(txt))) continue;
      const ctrl = box.matches('input, select, textarea, button[role="switch"], button[role="radio"], button[data-sc-scope], button.fh-shortcut-btn, button[data-shortcut-control]')
        ? box
        : box.querySelector('input:not([type="search"]), select, textarea, button[role="switch"], button[role="radio"], button[data-sc-scope], button.fh-shortcut-btn, button[data-shortcut-control], [role="radiogroup"]');
      if (ctrl && (isControlVisible(ctrl, box) || allowHidden) && txt.length <= bestLen) {
        best = ctrl;
        bestLen = txt.length;
      }
    }
    return best;
  }

  async function revealSettingControl(doc, keys, labelRegexes, searchHints, categoryRegex) {
    let ctrl = findControlByKeyOrLabel(doc, keys, labelRegexes);
    if (ctrl && isControlVisible(ctrl)) return ctrl;
    const search = findSettingsSearchInput(doc);
    const hints = Array.isArray(searchHints) ? searchHints : (searchHints ? [searchHints] : []);
    if (search && hints.length > 0) {
      for (const hint of hints) {
        setInputValue(search, hint);
        await new Promise((r) => setTimeout(r, 50));
        ctrl = findControlByKeyOrLabel(doc, keys, labelRegexes);
        if (ctrl && isControlVisible(ctrl)) return ctrl;
      }
      setInputValue(search, '');
      await new Promise((r) => setTimeout(r, 40));
    }
    if (categoryRegex) {
      const cat = activateSettingsCategory(doc, categoryRegex);
      if (cat) {
        await new Promise((r) => setTimeout(r, 50));
        ctrl = findControlByKeyOrLabel(doc, keys, labelRegexes);
        if (ctrl && isControlVisible(ctrl)) return ctrl;
      }
    }
    const tabs = getSettingsCategoryTabs(doc);
    for (const tab of tabs) {
      tab.click();
      await new Promise((r) => setTimeout(r, 35));
      ctrl = findControlByKeyOrLabel(doc, keys, labelRegexes);
      if (ctrl && isControlVisible(ctrl)) return ctrl;
    }
    return findControlByKeyOrLabel(doc, keys, labelRegexes, { allowHidden: true });
  }

  function findButtonByText(doc, pattern, rootEl) {
    const root = rootEl || doc.body;
    if (!root) return null;
    const rx = isRegExp(pattern) ? new RegExp(pattern.source, pattern.flags) : new RegExp(String(pattern), 'i');
    const btns = Array.from(root.querySelectorAll('button, [role="button"], summary, a.btn'));
    for (const b of btns) {
      if (!isVisible(b)) continue;
      const label = [
        normText(b),
        b.getAttribute('aria-label') || '',
        b.getAttribute('title') || '',
      ].join(' ');
      if (rx.test(label)) return b;
    }
    return null;
  }

  function findOverflowButton(doc) {
    const header = doc.querySelector('.pm-header-actions') || doc.querySelector('header');
    if (!header) return null;
    const btns = Array.from(header.querySelectorAll('button, [role="button"]'));
    for (const b of btns) {
      if (!isVisible(b)) continue;
      const txt = normText(b);
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      const title = (b.getAttribute('title') || '').toLowerCase();
      const id = (b.id || '').toLowerCase();
      if (
        txt === '⋯' ||
        txt === '...' ||
        txt === '•••' ||
        aria.includes('more') ||
        aria.includes('overflow') ||
        title.includes('more') ||
        title.includes('overflow') ||
        id.includes('more') ||
        id.includes('overflow') ||
        b.hasAttribute('data-overflow-menu')
      ) {
        return b;
      }
    }
    return null;
  }

  function findNowPlayingBar(doc) {
    const selectors = [
      '#pm-mini-now-playing',
      '#pm-now-playing-bar',
      '#foxhub-now-playing',
      '[data-now-playing]',
      '[aria-label*="Now Playing" i]',
      '[role="region"][aria-label*="Playing" i]',
    ];
    for (const sel of selectors) {
      const matches = doc.querySelectorAll(sel);
      for (const el of matches) {
        if (el.matches('input, select, textarea, button, label') || el.closest('#pm-settings-mount, #pm-media-apps-drawer')) {
          continue;
        }
        return el;
      }
    }
    const candidates = Array.from(doc.querySelectorAll('aside, section, div, footer'));
    for (const el of candidates) {
      if (el.closest('#pm-settings-mount, #pm-media-apps-drawer')) continue;
      if (!isVisible(el)) continue;
      const cls = String(el.className || '').toLowerCase();
      const id = String(el.id || '').toLowerCase();
      if (cls.includes('now-playing') || cls.includes('nowplaying') || id.includes('now-playing')) {
        return el;
      }
    }
    return null;
  }

  function findQuickSwitcher(doc) {
    const selectors = [
      '#pm-quick-switcher',
      '#foxhub-quick-switcher',
      '[data-quick-switcher]',
      '[role="dialog"][aria-label*="Quick Switcher" i]',
      '[role="dialog"][aria-label*="Switcher" i]',
    ];
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (el && isVisible(el)) return el;
    }
    const dialogs = Array.from(doc.querySelectorAll('[role="dialog"], .pm-quick-switcher, .quick-switcher'));
    for (const d of dialogs) {
      if (!isVisible(d)) continue;
      const inp = d.querySelector('input[type="text"], input[type="search"], input:not([type])');
      if (inp) return d;
    }
    return null;
  }

  function findQuickSwitcherOption(qs, textRegex) {
    if (!qs) return null;
    const rx = isRegExp(textRegex) ? new RegExp(textRegex.source, textRegex.flags) : new RegExp(String(textRegex), 'i');
    const opts = Array.from(qs.querySelectorAll('[role="option"], button, a, li'))
      .filter((el) => isVisible(el) && rx.test(normText(el)));
    if (opts.length === 0) return null;
    const first = opts[0];
    if (first.matches('button, a')) return first;
    return first.querySelector('button, a') || first;
  }

  function clickQuickSwitcherOption(qs, textRegex) {
    const target = findQuickSwitcherOption(qs, textRegex);
    if (!target) return false;
    const clickable = target.matches('button, a') ? target : (target.querySelector('button, a') || target);
    clickable.click();
    return true;
  }

  function findUserChromeCard(doc) {
    const root = getSettingsRoot(doc) || doc.body;
    const els = Array.from(root.querySelectorAll('[data-userchrome], .pm-control-card, .opt-card, .fh-card, section, div'));
    const pickSmallest = (predicate) => {
      let best = null;
      let bestLen = Infinity;
      for (const el of els) {
        if (!isVisible(el)) continue;
        const txt = normText(el);
        if (predicate(txt) && txt.length <= bestLen) {
          best = el;
          bestLen = txt.length;
        }
      }
      return best;
    };
    return (
      pickSmallest((txt) => /userChrome\.css/i.test(txt) && /Copy/i.test(txt) && /Hide sidebar header/i.test(txt) && /Hover[- ]to[- ]expand/i.test(txt) && /Rounded.*sidebar/i.test(txt)) ||
      pickSmallest((txt) => /userChrome\.css/i.test(txt) && /Copy/i.test(txt) && /optional/i.test(txt)) ||
      pickSmallest((txt) => /userChrome\.css/i.test(txt) && /Copy/i.test(txt))
    );
  }

  function findDiagnosticsSection(doc) {
    const root = getSettingsRoot(doc) || doc.body;
    const details = Array.from(root.querySelectorAll('details'));
    for (const d of details) {
      const sum = d.querySelector('summary');
      if (sum && /Diagnostics|MSE|Widevine|Audio Event Log/i.test(normText(sum))) {
        return { kind: 'details', container: d, toggle: sum };
      }
    }
    const btn = findButtonByText(doc, /Advanced Diagnostics|Diagnostics|MSE\s*\/\s*Widevine|View Live Log/i, root);
    if (btn) {
      const container = btn.closest('.pm-control-card, .opt-card, section, div') || btn.parentElement;
      return { kind: 'accordion', container, toggle: btn };
    }
    return null;
  }

  window.__foxhubTestHelpers = {
    isVisible,
    isControlVisible,
    normText,
    getRect,
    setInputValue,
    setCheckboxChecked,
    getSettingsRoot,
    findRailRoot,
    findRailButton,
    openSettingsDrawer,
    inferRailAppId,
    getRailAppItems,
    findSettingsSearchInput,
    getSettingsCategoryTabs,
    activateSettingsCategory,
    findControlByKeyOrLabel,
    revealSettingControl,
    findButtonByText,
    findOverflowButton,
    findNowPlayingBar,
    findQuickSwitcher,
    findQuickSwitcherOption,
    clickQuickSwitcherOption,
    findUserChromeCard,
    findDiagnosticsSection,
  };
})();
"""


def load_manifest_json(project_root: Path | None = None) -> dict[str, Any]:
    root = project_root or REPO_ROOT
    return json.loads((root / "manifest.json").read_text(encoding="utf-8"))


def manifest_commands_seed(manifest: dict[str, Any]) -> list[dict[str, str]]:
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


def make_default_settings_seed(**overrides: Any) -> dict[str, Any]:
    base = {
        "theme": "warm-linen",
        "previousDayTheme": "warm-linen",
        "gradientColor1": "#FFFDF9",
        "gradientColor2": "#F1EBE1",
        "customGradient1": "#FFFDF9",
        "customGradient2": "#F1EBE1",
        "enabledMediaApps": list(DEFAULT_PINNED_APPS),
        "customMediaApps": [],
        "mediaSidebarMode": "auto",
        "sidebarOpenMode": "auto",
        "persistenceMode": "selected",
        "persistentAppIds": ["spotify", "youtube"],
        "bgAudioAppIds": ["spotify", "youtube", "soundcloud"],
        "keepAudioPlayingWhenClosed": True,
        "tabAudioBehavior": "pause-resume",
        "autoPauseOnTabAudio": True,
        "mediaTopBarMode": "hover",
        "autoHideMediaTopBar": True,
        "showMediaBottomBar": True,
        "socialAppThemeMode": "native",
        "customVideoLoadbar": True,
        "muteAllNotifications": False,
        "muteEmailNotifications": False,
        "muteSiteNotifications": False,
        "socialAppNotifySounds": True,
        "soundVolume": 0.5,
        "pollIntervalSeconds": 60,
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
        "settingsGearHintCount": 2,
        "appShortcuts": {},
        "globalShortcuts": {
            "popup": "Alt+Shift+F",
            "sidebar": "Alt+Shift+M",
            "popout": "Alt+Shift+W",
        },
        "demoMode": "auto",
    }
    base.update(overrides)
    return base


def make_get_state_response(settings: dict[str, Any] | None = None, **extras: Any) -> dict[str, Any]:
    s = settings if settings is not None else make_default_settings_seed()
    res = {
        "state": {
            "accounts": [
                {
                    "email": "demo@gmail.com",
                    "unreadCount": 2,
                    "messages": [
                        {
                            "id": "demo-1",
                            "threadId": "t-1",
                            "accountEmail": "demo@gmail.com",
                            "subject": "Welcome to FoxHub",
                            "snippet": "Your local sidebar inbox is ready.",
                            "senderName": "FoxHub Team",
                            "senderEmail": "team@example.com",
                            "timestamp": 1763560000000,
                            "unread": True,
                            "isDemo": True,
                        },
                        {
                            "id": "demo-2",
                            "threadId": "t-2",
                            "accountEmail": "demo@gmail.com",
                            "subject": "Weekly Digest",
                            "snippet": "Check out the latest notes.",
                            "senderName": "Digest",
                            "senderEmail": "digest@example.com",
                            "timestamp": 1763550000000,
                            "unread": True,
                            "isDemo": True,
                        },
                    ],
                }
            ],
            "totalUnread": 2,
        },
        "settings": s,
        "snoozed": {},
        "audibleAppId": None,
        "nowPlaying": None,
        "sidebarOpenCount": 1,
        "isAutoPausedByTabAudio": False,
        "pendingShortcutAppId": "",
        "pendingContextUrl": None,
    }
    res.update(extras)
    return res


def _wrap_html_for_bridge(html_text: str, base_href: str, stub_external_fetch: bool = False) -> str:
    fetch_stub = ""
    if stub_external_fetch:
        fetch_stub = (
            "const __origFetch = window.fetch ? window.fetch.bind(window) : null;\n"
            "window.fetch = function(input, init) {\n"
            "  const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');\n"
            "  if (/^https:\\/\\/(mail\\.google\\.com|gmail\\.googleapis\\.com|accounts\\.google\\.com)\\//i.test(url)) {\n"
            "    return Promise.resolve(new Response('', { status: 401, statusText: 'Mock Offline' }));\n"
            "  }\n"
            "  return __origFetch ? __origFetch(input, init) : Promise.reject(new Error('No fetch'));\n"
            "};\n"
        )
    bridge_head = (
        f'<base href="{base_href}">\n'
        "<script>\n"
        "window.__pageErrors = window.__pageErrors || [];\n"
        "window.addEventListener('error', (e) => { window.__pageErrors.push(String(e.message || e.error || 'error')); });\n"
        "window.addEventListener('unhandledrejection', (e) => { window.__pageErrors.push(String(e.reason || 'rejection')); });\n"
        "if (window.parent && window.parent !== window) {\n"
        "  if (window.parent.browser) window.browser = window.parent.browser;\n"
        "  if (window.parent.chrome) window.chrome = window.parent.chrome;\n"
        "  if (window.parent.__webextMock) window.__webextMock = window.parent.__webextMock;\n"
        "}\n"
        f"{fetch_stub}"
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


class FoxHubE2EBase(unittest.TestCase):
    """Shared FixtureServer + HeadlessFirefox base with zero-leak lifecycle and clean-FAIL guards."""

    PROJECT_ROOT: Path = REPO_ROOT
    server: FixtureServer
    fx: HeadlessFirefox

    @classmethod
    def setUpClass(cls) -> None:
        cls.server = FixtureServer(cls.PROJECT_ROOT).start()
        try:
            cls.fx = HeadlessFirefox().start()
        except Exception:
            cls.server.stop()
            raise

    @classmethod
    def tearDownClass(cls) -> None:
        try:
            if getattr(cls, "fx", None) is not None:
                cls.fx.close()
        finally:
            if getattr(cls, "server", None) is not None:
                cls.server.stop()

    def setUp(self) -> None:
        self.server.clear_seed()
        self.server.clear_telemetry()
        self.fx.navigate(self.server.url_for("/mock/echo"))
        self.fx.eval_js("try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}")
        self.fx.set_viewport(1200, 800)
        self.fx.reset_to_blank()
        self.server.clear_requests()

    # ------------------------------------------------------------------
    # Clean-FAIL guards (never raise FirefoxHarnessError / TypeError -> ERROR)
    # ------------------------------------------------------------------

    def assert_repo_file(self, rel_path: str) -> Path:
        p = self.PROJECT_ROOT / rel_path
        self.assertTrue(p.is_file(), msg=f"Missing required extension file: {rel_path}")
        return p

    def assert_repo_dir(self, rel_path: str) -> Path:
        p = self.PROJECT_ROOT / rel_path
        self.assertTrue(p.is_dir(), msg=f"Missing required extension directory: {rel_path}")
        return p

    def safe_eval(self, body: str, *args: Any) -> Any:
        wrapper = (
            "try {\n"
            "  const __fn = function() {\n" + body + "\n  };\n"
            "  return { __ok: true, value: __fn.apply(this, arguments) };\n"
            "} catch (e) {\n"
            "  return { __ok: false, error: String(e && e.stack ? e.stack : (e && e.message ? e.message : e)) };\n"
            "}"
        )
        res = self.fx.eval_js(wrapper, *args)
        self.assertIsInstance(res, dict, msg=f"Expected eval result object, got: {res!r}")
        self.assertTrue(res.get("__ok"), msg=f"JS execution failed: {res.get('error')}")
        return res.get("value")

    def safe_eval_async(self, async_body: str, *args: Any, timeout_ms: int = 10000) -> Any:
        wrapper = (
            "try {\n"
            "  const __fn = async function() {\n" + async_body + "\n  };\n"
            "  const value = await __fn.apply(this, arguments);\n"
            "  return { __ok: true, value };\n"
            "} catch (e) {\n"
            "  return { __ok: false, error: String(e && e.stack ? e.stack : (e && e.message ? e.message : e)) };\n"
            "}"
        )
        res = self.fx.eval_async_js(wrapper, *args, timeout_ms=timeout_ms)
        self.assertIsInstance(res, dict, msg=f"Expected async eval result object, got: {res!r}")
        self.assertTrue(res.get("__ok"), msg=f"Async JS execution failed: {res.get('error')}")
        return res.get("value")

    def assert_element_exists(self, selector: str, msg: str = "") -> None:
        exists = self.safe_eval("return Boolean(document.querySelector(arguments[0]));", selector)
        self.assertTrue(exists, msg=msg or f"Expected element {selector!r} to exist")

    def assert_element_visible(self, selector: str, msg: str = "") -> dict[str, Any]:
        self.assert_element_exists(selector, msg=msg or f"Expected element {selector!r} to exist")
        rect = self.fx.get_bounding_rect(selector)
        self.assertIsNotNone(rect, msg=msg or f"Expected bounding rect for {selector!r}")
        assert rect is not None
        vis = self.safe_eval(
            "const el = document.querySelector(arguments[0]);"
            "if (!el) return false;"
            "const cs = getComputedStyle(el);"
            "return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0;",
            selector,
        )
        self.assertTrue(vis, msg=msg or f"Element {selector!r} is hidden by CSS")
        self.assertGreater(rect["width"], 0, msg=msg or f"Element {selector!r} has zero width")
        self.assertGreater(rect["height"], 0, msg=msg or f"Element {selector!r} has zero height")
        return rect

    def ensure_semantic_helpers(self) -> None:
        self.safe_eval(SEMANTIC_HELPERS_JS)

    # ------------------------------------------------------------------
    # Page Boot & Same-Origin Bridge Helpers
    # ------------------------------------------------------------------

    def build_base_seed(
        self,
        settings: dict[str, Any] | None = None,
        extra_storage: dict[str, Any] | None = None,
        tabs: list[dict[str, Any]] | None = None,
        include_manifest: bool = True,
        include_message_responses: bool = False,
    ) -> dict[str, Any]:
        manifest = load_manifest_json(self.PROJECT_ROOT)
        s = settings if settings is not None else make_default_settings_seed()
        storage: dict[str, Any] = {"settings": s}
        if extra_storage:
            storage.update(extra_storage)
        seed: dict[str, Any] = {"storage": storage}
        if include_manifest:
            seed["manifest"] = manifest
            seed["commands"] = manifest_commands_seed(manifest)
        if tabs is not None:
            seed["tabs"] = tabs
        if include_message_responses:
            seed["messageResponses"] = {
                "GET_STATE": make_get_state_response(s),
                "STOP_BG_AUDIO_HANDOFF": {"ok": True, "skipped": True, "settings": s},
                "UPDATE_SETTINGS": {"ok": True, "settings": s},
                "GET_AUDIO_DIAGNOSTICS": {"ok": True, "diagnostics": {"events": [], "players": {}}},
                "CLEAR_AUDIO_DIAGNOSTICS": {"ok": True, "diagnostics": {"events": [], "players": {}}},
                "GET_KEYBOARD_SHORTCUTS": {
                    "ok": True,
                    "commands": manifest_commands_seed(manifest),
                    "globalShortcuts": s.get("globalShortcuts", {}),
                    "appShortcuts": s.get("appShortcuts", {}),
                    "quickSwitcherEnabled": s.get("quickSwitcherEnabled", True),
                    "quickSwitcherShortcut": s.get("quickSwitcherShortcut", "Ctrl+K"),
                },
            }
        return seed

    def open_background(
        self,
        settings: dict[str, Any] | None = None,
        extra_storage: dict[str, Any] | None = None,
        tabs: list[dict[str, Any]] | None = None,
        raw_storage: dict[str, Any] | None = None,
    ) -> None:
        """Load real src/background/background.html (via bridge wrapper to stub offline Google fetch)."""
        bg_path = self.assert_repo_file("src/background/background.html")
        bg_html = _wrap_html_for_bridge(
            bg_path.read_text(encoding="utf-8"),
            self.server.url_for("/src/background/"),
            stub_external_fetch=True,
        )
        # Keep mock_seed.js + webext_mock.js directly in background page
        mock_tags = '<script src="/__test__/mock_seed.js"></script>\n<script src="/__test__/webext_mock.js"></script>\n'
        bg_html = bg_html.replace('<base href="', mock_tags + '<base href="', 1)
        url = self.server.register_fixture("bg_only.html", bg_html)

        if raw_storage is not None:
            manifest = load_manifest_json(self.PROJECT_ROOT)
            seed: dict[str, Any] = {
                "storage": raw_storage,
                "manifest": manifest,
                "commands": manifest_commands_seed(manifest),
            }
            if tabs is not None:
                seed["tabs"] = tabs
        else:
            seed = self.build_base_seed(
                settings=settings,
                extra_storage=extra_storage,
                tabs=tabs,
                include_manifest=True,
                include_message_responses=False,
            )
        self.server.set_seed(seed)
        self.fx.navigate(url)
        ready = self.safe_eval_async(
            """
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline) {
              if (typeof window.__pmGetSyncBootState === 'function') {
                const st = await browser.runtime.sendMessage({ type: 'GET_STATE' }).catch(() => null);
                if (st && st.settings) {
                  return { ready: true, errors: window.__pageErrors || [] };
                }
              }
              await new Promise((r) => setTimeout(r, 25));
            }
            return { ready: false, errors: window.__pageErrors || [] };
            """
        )
        self.assertTrue(ready.get("ready"), msg=f"Background failed to initialize cleanly: {ready}")

    def open_bridged_app(
        self,
        ui_rel_path: str = "src/popup/popup.html",
        ui_query: str = "?sidebar=1",
        settings: dict[str, Any] | None = None,
        extra_storage: dict[str, Any] | None = None,
        tabs: list[dict[str, Any]] | None = None,
        raw_storage: dict[str, Any] | None = None,
    ) -> None:
        """Mount real background.html and real popup.html/options.html in same-origin iframes sharing 1 mock."""
        bg_path = self.assert_repo_file("src/background/background.html")
        ui_path = self.assert_repo_file(ui_rel_path)

        bg_base = self.server.url_for("/src/background/")
        ui_dir = "/" + "/".join(Path(ui_rel_path).parts[:-1]) + "/"
        ui_base = self.server.url_for(ui_dir)

        bg_html = _wrap_html_for_bridge(
            bg_path.read_text(encoding="utf-8"),
            bg_base,
            stub_external_fetch=True,
        )
        ui_html = _wrap_html_for_bridge(
            ui_path.read_text(encoding="utf-8"),
            ui_base,
            stub_external_fetch=True,
        )

        bg_url = self.server.register_fixture("bridge_bg.html", bg_html)
        ui_url = self.server.register_fixture("bridge_ui.html", ui_html) + (ui_query or "")

        host_html = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>FoxHub Bridge Host</title>
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
    window.__bridgeReady = false;
    window.__bridgeBootPromise = (async function () {{
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
      await new Promise((r) => setTimeout(r, 120));
      window.__bridge = {{
        bgFrame: bg,
        uiFrame: ui,
        bgWin: bg.contentWindow,
        uiWin: ui.contentWindow,
        bgDoc: bg.contentDocument,
        uiDoc: ui.contentDocument,
      }};
      window.__bridgeReady = true;
      return true;
    }})();
  </script>
</body>
</html>"""
        host_url = self.server.register_fixture("bridge_host.html", host_html)

        if raw_storage is not None:
            manifest = load_manifest_json(self.PROJECT_ROOT)
            seed: dict[str, Any] = {
                "storage": raw_storage,
                "manifest": manifest,
                "commands": manifest_commands_seed(manifest),
            }
            if tabs is not None:
                seed["tabs"] = tabs
        else:
            seed = self.build_base_seed(
                settings=settings,
                extra_storage=extra_storage,
                tabs=tabs,
                include_manifest=True,
                include_message_responses=False,
            )
        self.server.set_seed(seed)
        self.fx.navigate(host_url)
        boot = self.safe_eval_async(
            """
            await window.__bridgeBootPromise;
            const uiWin = window.__bridge.uiWin;
            const bgWin = window.__bridge.bgWin;
            const hScript = uiWin.document.createElement('script');
            hScript.textContent = arguments[0];
            uiWin.document.head.appendChild(hScript);
            return {
              ready: window.__bridgeReady,
              bgErrors: bgWin.__pageErrors || [],
              uiErrors: uiWin.__pageErrors || [],
              hasRail: Boolean(
                uiWin.document.getElementById('pm-opera-rail') ||
                uiWin.document.querySelector('aside[aria-label], [role="navigation"], main, .opt-layout, [role="main"], [data-settings-root], #foxhub-settings-root')
              ),
            };
            """,
            SEMANTIC_HELPERS_JS,
        )
        self.assertTrue(boot.get("ready"), msg=f"Bridge host boot failed: {boot}")
        self.assertTrue(boot.get("hasRail"), msg=f"UI frame did not render expected root: {boot}")

    def open_ui_toplevel(
        self,
        ui_rel_path: str = "src/popup/popup.html",
        ui_query: str = "?sidebar=1",
        settings: dict[str, Any] | None = None,
        extra_storage: dict[str, Any] | None = None,
        raw_storage: dict[str, Any] | None = None,
    ) -> None:
        """Open popup.html or options.html directly at top level (ideal for Marionette viewport/shortcut/click)."""
        self.assert_repo_file(ui_rel_path)
        s = settings if settings is not None else make_default_settings_seed()
        if raw_storage is not None:
            manifest = load_manifest_json(self.PROJECT_ROOT)
            effective_s = raw_storage.get("settings") if isinstance(raw_storage.get("settings"), dict) else make_default_settings_seed()
            seed: dict[str, Any] = {
                "storage": raw_storage,
                "manifest": manifest,
                "commands": manifest_commands_seed(manifest),
                "messageResponses": {
                    "GET_STATE": make_get_state_response(effective_s),
                    "STOP_BG_AUDIO_HANDOFF": {"ok": True, "skipped": True, "settings": effective_s},
                    "UPDATE_SETTINGS": {"ok": True, "settings": effective_s},
                    "GET_AUDIO_DIAGNOSTICS": {"ok": True, "diagnostics": {"events": [], "players": {}}},
                    "CLEAR_AUDIO_DIAGNOSTICS": {"ok": True, "diagnostics": {"events": [], "players": {}}},
                },
            }
        else:
            seed = self.build_base_seed(
                settings=s,
                extra_storage=extra_storage,
                include_manifest=True,
                include_message_responses=True,
            )
        self.server.set_seed(seed)
        url = self.server.url_for(f"/{ui_rel_path}{ui_query}")
        self.fx.navigate(url)
        # Wait for UI ready & install stateful message handler for subsequent UPDATE_SETTINGS
        self.safe_eval_async(
            """
            const deadline = Date.now() + 2500;
            const isOptionsPage = /options\\.html/i.test(window.location.pathname);
            while (Date.now() < deadline) {
              const hasSettingsMounted = Boolean(
                document.querySelector('.fh-settings-root, [data-settings-root], #foxhub-settings-root, #pm-settings-ui-root, .settings-container') ||
                Array.from(document.querySelectorAll('main input, main select, main [role="switch"], [role="main"] input')).some((el) => el.offsetParent !== null)
              );
              const hasPopupMounted = Boolean(
                document.getElementById('pm-opera-rail') ||
                document.querySelector('aside[aria-label], [role="navigation"]')
              );
              const ready = isOptionsPage ? hasSettingsMounted : (hasPopupMounted || hasSettingsMounted);
              if (ready) break;
              await new Promise((r) => setTimeout(r, 25));
            }
            window.__webextMock.runtime.setMessageHandler(async (msg) => {
              if (!msg || typeof msg !== 'object') return undefined;
              if (msg.type === 'UPDATE_SETTINGS') {
                const cur = await browser.storage.local.get('settings');
                const prev = (cur && cur.settings) || {};
                const patch = msg.patch || msg.settings || {};
                const next = { ...prev, ...patch };
                if (patch.gradientColor1 !== undefined && patch.customGradient1 === undefined) {
                  next.customGradient1 = patch.gradientColor1;
                }
                if (patch.gradientColor2 !== undefined && patch.customGradient2 === undefined) {
                  next.customGradient2 = patch.gradientColor2;
                }
                if (patch.mediaTopBarMode !== undefined && patch.autoHideMediaTopBar === undefined) {
                  next.autoHideMediaTopBar = patch.mediaTopBarMode === 'hover';
                }
                await browser.storage.local.set({ settings: next });
                return { ok: true, settings: next };
              }
              if (msg.type === 'GET_STATE') {
                const cur = await browser.storage.local.get('settings');
                return {
                  ...arguments[0],
                  settings: (cur && cur.settings) || arguments[0].settings,
                };
              }
              return undefined;
            });
            await new Promise((r) => setTimeout(r, 80));
            return true;
            """,
            make_get_state_response(s),
        )
        self.ensure_semantic_helpers()
