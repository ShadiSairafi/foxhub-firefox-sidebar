/**
 * FoxHub Background — Keyboard Commands, Dynamic App Shortcuts & Context Menus ("Open in FoxHub Sidebar")
 */

(function (global) {
  const bg = (global.FoxHubBg = global.FoxHubBg || {});

  const APP_SHORTCUT_SLOT_COUNT = 12;
  const GLOBAL_COMMAND_MAP = {
    popup: '_execute_browser_action',
    sidebar: '_execute_sidebar_action',
    popout: 'open-foxhub-popout'
  };
  const DEFAULT_GLOBAL_SHORTCUTS = {
    popup: 'Alt+Shift+F',
    sidebar: 'Alt+Shift+M',
    popout: 'Alt+Shift+W'
  };

  function getMediaAppsCatalog() {
    return global.FoxHubMediaApps || global.PocketMailMediaApps || null;
  }

  async function resetAllBrowserCommandsToDefaults() {
    bg.slotToAppIdMap.clear();
    if (!browser.commands) return;
    for (const cmdName of Object.values(GLOBAL_COMMAND_MAP)) {
      try {
        if (typeof browser.commands.reset === 'function') {
          await browser.commands.reset(cmdName);
        }
      } catch (_) {}
    }
    for (let i = 1; i <= APP_SHORTCUT_SLOT_COUNT; i++) {
      const slotName = `foxhub-app-slot-${i}`;
      try {
        if (typeof browser.commands.reset === 'function') {
          await browser.commands.reset(slotName);
        }
      } catch (_) {}
      try {
        if (typeof browser.commands.update === 'function') {
          await browser.commands.update({ name: slotName, shortcut: '' });
        }
      } catch (_) {}
    }
  }

  async function syncBrowserCommandsFromSettings() {
    bg.slotToAppIdMap.clear();
    if (!browser.commands || typeof browser.commands.update !== 'function') {
      return { ok: true };
    }
    const s = bg.state.currentSettings;
    let firstErr = '';
    const gs = { ...DEFAULT_GLOBAL_SHORTCUTS, ...(s.globalShortcuts || {}) };
    for (const [key, cmdName] of Object.entries(GLOBAL_COMMAND_MAP)) {
      const sc = String(gs[key] ?? '').trim();
      try {
        await browser.commands.update({ name: cmdName, shortcut: sc });
      } catch (err) {
        if (!firstErr) firstErr = err && err.message ? err.message : String(err);
      }
    }

    const appSc = s.appShortcuts && typeof s.appShortcuts === 'object' ? s.appShortcuts : {};
    const validAppIds = new Set(['pocketmail']);
    const catalog = getMediaAppsCatalog();
    if (catalog && Array.isArray(catalog.BUILTIN_MEDIA_APPS)) {
      catalog.BUILTIN_MEDIA_APPS.forEach((app) => validAppIds.add(app.id));
    }
    (Array.isArray(s.customMediaApps) ? s.customMediaApps : []).forEach((c, idx) => {
      if (c) validAppIds.add(c.id || `custom-${idx}`);
    });

    const pairs = Object.entries(appSc).filter(([id, sc]) => validAppIds.has(id) && String(sc || '').trim().length > 0);
    for (let i = 1; i <= APP_SHORTCUT_SLOT_COUNT; i++) {
      const slotName = `foxhub-app-slot-${i}`;
      const entry = pairs[i - 1];
      if (entry) {
        const [appId, sc] = entry;
        bg.slotToAppIdMap.set(slotName, appId);
        try {
          await browser.commands.update({ name: slotName, shortcut: String(sc).trim() });
        } catch (err) {
          if (!firstErr) firstErr = err && err.message ? err.message : String(err);
        }
      } else {
        try {
          if (typeof browser.commands.reset === 'function') {
            await browser.commands.reset(slotName);
          }
        } catch (_) {}
        try {
          await browser.commands.update({ name: slotName, shortcut: '' });
        } catch (_) {}
      }
    }
    return { ok: !firstErr, error: firstErr || null };
  }

  function launchAppViaShortcut(appId, modeOverride = '') {
    if (!appId) return;
    const now = Date.now();
    if (appId === bg.state.lastShortcutLaunchAppId && now - bg.state.lastShortcutLaunchAt < 380) {
      return;
    }
    bg.state.lastShortcutLaunchAt = now;
    bg.state.lastShortcutLaunchAppId = appId;

    const s = bg.state.currentSettings;
    const openMode = modeOverride || s.appShortcutOpenMode || 'sidebar';
    bg.state.pendingShortcutLaunch = { appId, openMode, ts: now };

    let settingsDirty = false;
    if (appId !== 'pocketmail' && bg.isAppAllowedForPersistence(appId)) {
      if (s.persistentLastActiveAppId !== appId) {
        s.persistentLastActiveAppId = appId;
        settingsDirty = true;
      }
    } else if (appId === 'pocketmail' && bg.bgAudioPool.size === 0) {
      if (s.persistentLastActiveAppId !== 'pocketmail') {
        s.persistentLastActiveAppId = 'pocketmail';
        settingsDirty = true;
      }
    }

    if (appId !== 'pocketmail' && !appId.startsWith('custom-')) {
      const enabled = Array.isArray(s.enabledMediaApps) ? s.enabledMediaApps : [];
      if (!enabled.includes(appId)) {
        s.enabledMediaApps = [...enabled, appId];
        settingsDirty = true;
      }
    } else if (appId.startsWith('custom-') && Array.isArray(s.customMediaApps)) {
      s.customMediaApps = s.customMediaApps.map((c, idx) => {
        const cid = c && (c.id || `custom-${idx}`);
        if (cid === appId && c.enabled === false) {
          settingsDirty = true;
          return { ...c, enabled: true };
        }
        return c;
      });
    }
    if (settingsDirty) bg.scheduleSettingsSave(true);

    browser.runtime
      .sendMessage({
        type: 'OPEN_APP_FROM_SHORTCUT',
        appId,
        openMode,
        settings: s
      })
      .catch(() => {});

    if (openMode === 'popout') {
      if (bg.companionWindowIds.size > 0) {
        const existingWinId = Array.from(bg.companionWindowIds)[0];
        browser.windows
          .update(existingWinId, { focused: true })
          .catch(() => {
            bg.companionWindowIds.delete(existingWinId);
            const url = browser.runtime.getURL(`src/popup/popup.html?popout=1&app=${encodeURIComponent(appId)}`);
            browser.windows
              .create({ url, type: 'popup', width: 560, height: 820 })
              .then((win) => {
                if (win && win.id && typeof bg.registerCompanionWindow === 'function') {
                  bg.registerCompanionWindow(win);
                } else if (win && win.id) {
                  bg.companionWindowIds.add(win.id);
                }
              })
              .catch(() => {});
          });
        return;
      }
      const url = browser.runtime.getURL(`src/popup/popup.html?popout=1&app=${encodeURIComponent(appId)}`);
      browser.windows
        .create({ url, type: 'popup', width: 560, height: 820 })
        .then((win) => {
          if (win && win.id && typeof bg.registerCompanionWindow === 'function') {
            bg.registerCompanionWindow(win);
          } else if (win && win.id) {
            bg.companionWindowIds.add(win.id);
          }
        })
        .catch(() => {});
    } else if (openMode === 'popup') {
      if (bg.state.popupPortCount === 0 && browser.browserAction && typeof browser.browserAction.openPopup === 'function') {
        browser.browserAction.openPopup().catch(() => {
          if (browser.sidebarAction && typeof browser.sidebarAction.open === 'function') {
            browser.sidebarAction.open().catch(() => {});
          }
        });
      }
    } else {
      if (browser.sidebarAction && typeof browser.sidebarAction.open === 'function') {
        browser.sidebarAction.open().catch(() => {
          if (bg.state.sidebarPortCount === 0) {
            const url = browser.runtime.getURL(`src/popup/popup.html?popout=1&app=${encodeURIComponent(appId)}`);
            browser.windows
              .create({ url, type: 'popup', width: 560, height: 820 })
              .then((win) => {
                if (win && win.id && typeof bg.registerCompanionWindow === 'function') {
                  bg.registerCompanionWindow(win);
                } else if (win && win.id) {
                  bg.companionWindowIds.add(win.id);
                }
              })
              .catch(() => {});
          }
        });
      }
    }
  }

  function isSafeWebUrl(rawUrl) {
    if (typeof rawUrl !== 'string') return false;
    try {
      const u = new URL(rawUrl.trim());
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  function openUrlInFoxHubSurface(targetUrl, behaviorOverride = '') {
    if (!isSafeWebUrl(targetUrl)) {
      return { ok: false, error: 'Invalid URL' };
    }
    const cleanUrl = new URL(targetUrl.trim()).href;
    const s = bg.state.currentSettings;
    const openBehavior =
      behaviorOverride === 'popout' || behaviorOverride === 'sidebar'
        ? behaviorOverride
        : s.contextMenuOpenBehavior === 'popout'
          ? 'popout'
          : 'sidebar';

    bg.state.pendingContextUrl = {
      url: cleanUrl,
      openBehavior,
      ts: Date.now()
    };

    browser.runtime
      .sendMessage({
        type: 'OPEN_URL_IN_SIDEBAR',
        url: cleanUrl,
        openBehavior,
        fromBackground: true
      })
      .catch(() => {});

    // Synchronously call sidebarAction.open / windows.create before any await so user-gesture token stays intact
    if (openBehavior === 'popout') {
      if (bg.companionWindowIds.size > 0) {
        const existingWinId = Array.from(bg.companionWindowIds)[0];
        browser.windows.update(existingWinId, { focused: true }).catch(() => {
          bg.companionWindowIds.delete(existingWinId);
          const popUrl = browser.runtime.getURL(`src/popup/popup.html?popout=1&url=${encodeURIComponent(cleanUrl)}`);
          browser.windows
            .create({ url: popUrl, type: 'popup', width: 560, height: 820 })
            .then((win) => {
              if (win && win.id && typeof bg.registerCompanionWindow === 'function') {
                bg.registerCompanionWindow(win);
              } else if (win && win.id) {
                bg.companionWindowIds.add(win.id);
              }
            })
            .catch(() => {});
        });
      } else {
        const popUrl = browser.runtime.getURL(`src/popup/popup.html?popout=1&url=${encodeURIComponent(cleanUrl)}`);
        browser.windows
          .create({ url: popUrl, type: 'popup', width: 560, height: 820 })
          .then((win) => {
            if (win && win.id && typeof bg.registerCompanionWindow === 'function') {
              bg.registerCompanionWindow(win);
            } else if (win && win.id) {
              bg.companionWindowIds.add(win.id);
            }
          })
          .catch(() => {});
      }
    } else if (browser.sidebarAction && typeof browser.sidebarAction.open === 'function') {
      browser.sidebarAction.open().catch(() => {
        if (bg.state.sidebarPortCount === 0) {
          const popUrl = browser.runtime.getURL(`src/popup/popup.html?popout=1&url=${encodeURIComponent(cleanUrl)}`);
          browser.windows
            .create({ url: popUrl, type: 'popup', width: 560, height: 820 })
            .then((win) => {
              if (win && win.id && typeof bg.registerCompanionWindow === 'function') {
                bg.registerCompanionWindow(win);
              } else if (win && win.id) {
                bg.companionWindowIds.add(win.id);
              }
            })
            .catch(() => {});
        }
      });
    }

    return { ok: true, url: cleanUrl, openBehavior };
  }

  async function syncContextMenusFromSettings() {
    if (!browser.contextMenus) return { ok: false };
    try {
      if (typeof browser.contextMenus.removeAll === 'function') {
        await browser.contextMenus.removeAll();
      }
      const s = bg.state.currentSettings;
      if (s.contextMenuEnabled === false) {
        return { ok: true, enabled: false };
      }
      if (typeof browser.contextMenus.create === 'function') {
        browser.contextMenus.create({
          id: 'foxhub-open-page',
          title: 'Open Page in FoxHub Sidebar',
          contexts: ['page'],
          documentUrlPatterns: ['http://*/*', 'https://*/*']
        });
        browser.contextMenus.create({
          id: 'foxhub-open-link',
          title: 'Open Link in FoxHub Sidebar',
          contexts: ['link'],
          targetUrlPatterns: ['http://*/*', 'https://*/*']
        });
      }
      return { ok: true, enabled: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  }

  if (browser.contextMenus && browser.contextMenus.onClicked) {
    browser.contextMenus.onClicked.addListener((info, tab) => {
      if (!info) return;
      if (info.menuItemId !== 'foxhub-open-link' && info.menuItemId !== 'foxhub-open-page') return;
      const rawUrl = info.menuItemId === 'foxhub-open-link' ? info.linkUrl : (info.pageUrl || tab?.url || '');
      if (!isSafeWebUrl(rawUrl)) return;
      openUrlInFoxHubSurface(rawUrl);
    });
  }

  if (browser.commands && browser.commands.onCommand) {
    browser.commands.onCommand.addListener((command) => {
      if (command === 'open-foxhub-popout') {
        const url = browser.runtime.getURL('src/popup/popup.html?popout=1');
        browser.windows
          .create({ url, type: 'popup', width: 560, height: 820 })
          .then((win) => {
            if (win && win.id && typeof bg.registerCompanionWindow === 'function') {
              bg.registerCompanionWindow(win);
            } else if (win && win.id) {
              bg.companionWindowIds.add(win.id);
            }
          })
          .catch(() => {});
        return;
      }
      if (typeof command === 'string' && command.startsWith('foxhub-app-slot-')) {
        const mappedAppId = bg.slotToAppIdMap.get(command);
        if (mappedAppId) {
          launchAppViaShortcut(mappedAppId);
        }
      }
    });
  }

  bg.APP_SHORTCUT_SLOT_COUNT = APP_SHORTCUT_SLOT_COUNT;
  bg.GLOBAL_COMMAND_MAP = GLOBAL_COMMAND_MAP;
  bg.DEFAULT_GLOBAL_SHORTCUTS = DEFAULT_GLOBAL_SHORTCUTS;
  bg.resetAllBrowserCommandsToDefaults = resetAllBrowserCommandsToDefaults;
  bg.syncBrowserCommandsFromSettings = syncBrowserCommandsFromSettings;
  bg.launchAppViaShortcut = launchAppViaShortcut;
  bg.syncContextMenusFromSettings = syncContextMenusFromSettings;
  bg.openUrlInFoxHubSurface = openUrlInFoxHubSurface;
})(window);
