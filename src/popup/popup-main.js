/**
 * FoxHub — Popup Main Entry, Settings UI Mount, Header More Menu, Unified Dispatchers & Boot
 * Loads last after all 10 modular FoxHubPopup controllers.
 */

(function (global) {
  const P = (global.FoxHubPopup = global.FoxHubPopup || {});

  let lastQuickSwitcherRemoteTs = 0;
  let lastSilentMailSyncAt = 0;

  P.triggerSilentMailSync = function (minIntervalMs = 4000) {
    const st = P.state;
    const now = Date.now();
    if (now - lastSilentMailSyncAt < minIntervalMs) return;
    lastSilentMailSyncAt = now;
    browser.runtime
      .sendMessage({ type: 'SYNC_NOW' })
      .then((syncRes) => {
        if (syncRes && syncRes.state) {
          st.appState = syncRes.state;
          if (syncRes.settings) st.appSettings = syncRes.settings;
          if (syncRes.snoozed) st.snoozedMap = syncRes.snoozed;
          P.renderAll();
        }
      })
      .catch(() => {});
  };

  P.renderAll = function () {
    const st = P.state;
    P.getThemesApi()?.applyThemeAndWallpaper(document, st.appSettings);
    if (
      st.activeRailAppId === 'pocketmail' &&
      P.dom.mediaWorkspace &&
      !P.dom.mediaWorkspace.classList.contains('hidden') &&
      !P.dom.mediaWorkspace.classList.contains('pm-workspace-keepalive')
    ) {
      P.hideMediaWorkspaceKeepAlive?.();
    }
    P.renderOperaRail?.();
    P.renderHeaderStatus?.();
    P.renderAccountsBar?.();
    P.renderEmailList?.();
    P.renderStudioLivePreview?.();
    P.renderNowPlayingBar?.();
    P.syncSettingsDrawerUi?.();
    P.hydrateMissingCustomAppIcons?.();
  };

  P.syncSidebarHubRailButtons = function () {
    const st = P.state;
    const isDrawerOpen = Boolean(P.dom.mediaAppsDrawer && !P.dom.mediaAppsDrawer.classList.contains('hidden'));
    document
      .getElementById('rail-btn-manage-apps')
      ?.classList.toggle('active', isDrawerOpen && st.activeSidebarHubSection === 'apps');
    document
      .getElementById('rail-btn-sidebar-settings')
      ?.classList.toggle('active', isDrawerOpen && st.activeSidebarHubSection === 'settings');
  };

  P.syncSettingsDrawerUi = function (opts = {}) {
    const st = P.state;
    if (st.settingsUiHandle) {
      st.settingsUiHandle.update({
        settings: st.appSettings,
        state: st.appState,
        force: Boolean(opts && opts.force)
      });
    }
  };

  function ensureSettingsUiMounted(initialCategory = 'apps') {
    const st = P.state;
    if (st.settingsUiHandle) return st.settingsUiHandle;
    const mountEl = document.getElementById('pm-settings-mount');
    const settingsUi = P.getSettingsUiApi();
    if (!mountEl || !settingsUi) return null;

    st.settingsUiHandle = settingsUi.mount(mountEl, {
      mode: 'drawer',
      initialCategory,
      getSettings: () => st.appSettings,
      getState: () => st.appState,
      getActiveAppId: () => st.activeRailAppId,
      getMediaFramesSnapshot: () => {
        const snap = {};
        st.mediaFramePool.forEach((entry, id) => {
          snap[id] = {
            currentUrl: entry.currentUrl || '',
            loaded: Boolean(entry.loaded),
            suppressedWhileInactive: Boolean(entry.suppressedWhileInactive),
            playback: st.framePlaybackStates.get(id) || null
          };
        });
        return snap;
      },
      onSavePatch: async (patch, toastMsg) => {
        const res = await P.saveSettingsPatch(patch);
        if (toastMsg && (!res || (res.ok !== false && !res.rolledBack))) {
          P.showToast(toastMsg);
        }
        return res;
      },
      onStateReplace: ({ state, settings }) => {
        if (state) st.appState = state;
        if (settings) st.appSettings = settings;
        P.renderAll();
      },
      onToast: (msg) => P.showToast(msg),
      onCustomAppUpdated: (appId, prevEntry, nextEntry) => {
        P.reloadCustomAppFrameIfWarm?.(appId, prevEntry, nextEntry);
      },
      onOpenThemeStudio: () => {
        P.closeSidebarHubDrawer();
        P.openThemeDrawer?.();
      },
      onOpenAccountDrawer: () => {
        P.closeSidebarHubDrawer();
        P.openAccountDrawer?.();
      },
      onOpenFullOptions: () => browser.runtime.openOptionsPage(),
      onBroadcastAppConfig: (kind, prevVal) => {
        if (kind === 'socialTheme') P.broadcastSocialAppTheme?.(prevVal);
        else if (kind === 'videoLoadbar') P.broadcastVideoLoadbarConfig?.();
        else if (kind === 'muteAndShortcuts') P.broadcastMuteAndShortcutsConfig?.();
      }
    });
    return st.settingsUiHandle;
  }

  P.closeSidebarHubDrawer = function () {
    const st = P.state;
    st.activeSidebarHubSection = '';
    P.setDrawerOpen(P.dom.mediaAppsDrawer, false);
    st.settingsUiHandle?.stopIntervals?.();
    P.syncSidebarHubRailButtons();
    if (st.activeRailAppId && st.activeRailAppId !== 'pocketmail' && st.mediaFramePool.has(st.activeRailAppId)) {
      P.setDrawerOpen(P.dom.mediaWorkspace, true);
    }
    P.renderNowPlayingBar?.();
  };

  P.openSidebarHubDrawer = function (section = 'settings') {
    const st = P.state;
    const isAlreadyOpenSameSection =
      P.dom.mediaAppsDrawer && !P.dom.mediaAppsDrawer.classList.contains('hidden') && st.activeSidebarHubSection === section;
    if (isAlreadyOpenSameSection) {
      P.closeSidebarHubDrawer();
      return;
    }
    closeHeaderMoreMenu();
    P.closeMutePopover?.();
    P.closeRailContextMenu?.();
    st.activeSidebarHubSection = section;
    P.hideMediaWorkspaceKeepAlive?.();
    P.setDrawerOpen(P.dom.readerDrawer, false);
    P.setDrawerOpen(P.dom.themeDrawer, false);
    P.setDrawerOpen(P.dom.accountDrawer, false);
    P.setDrawerOpen(P.dom.composeDrawer, false);
    P.closeQuickSwitcher?.();
    P.setDrawerOpen(P.dom.mediaAppsDrawer, true);

    const handle = ensureSettingsUiMounted(section === 'apps' ? 'apps' : 'audio');
    if (handle) {
      handle.setCategory(section === 'apps' ? 'apps' : 'audio');
      handle.update();
      handle.startIntervals?.();
    }
    P.syncSidebarHubRailButtons();
    P.renderNowPlayingBar?.();

    const scrollBody = P.dom.mediaAppsDrawer?.querySelector('.pm-drawer-content') || P.dom.mediaAppsDrawer;
    if (scrollBody) scrollBody.scrollTop = 0;
  };

  P.activateAppDirectlyById = function (appId) {
    const st = P.state;
    if (!appId) return;
    P.closeMutePopover?.();
    P.closeRailContextMenu?.();
    closeHeaderMoreMenu();
    P.closeQuickSwitcher?.();
    P.setDrawerOpen(P.dom.readerDrawer, false);
    P.setDrawerOpen(P.dom.themeDrawer, false);
    P.setDrawerOpen(P.dom.accountDrawer, false);
    P.setDrawerOpen(P.dom.composeDrawer, false);
    P.setDrawerOpen(P.dom.mediaAppsDrawer, false);
    st.settingsUiHandle?.stopIntervals?.();
    st.activeSidebarHubSection = '';
    P.syncSidebarHubRailButtons();

    if (appId === 'pocketmail') {
      st.activeRailAppId = 'pocketmail';
      P.hideMediaWorkspaceKeepAlive?.();
      P.renderAll();
      P.syncPersistentSessionToBackground?.('pocketmail', '', null, true);
      P.triggerSilentMailSync(2000);
      return;
    }

    const mediaApi = P.getAppsApi();
    if (!mediaApi) return;
    const app = mediaApi.getAppById(appId, st.appSettings);
    if (!app) return;
    if (!st.IS_SIDEBAR_VIEW) {
      document.documentElement.classList.add('show-popup-rail');
    }
    P.openMediaWorkspace?.(app, st.hibernatedAppUrls.get(app.id) || undefined);
  };

  function getVisibleHeaderMoreItems() {
    const menu = document.getElementById('pm-header-more-menu');
    if (!menu) return [];
    return Array.from(menu.querySelectorAll('[role="menuitem"], button')).filter((el) => {
      if (el.disabled || el.hidden || el.classList.contains('hidden')) return false;
      const cs = window.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    });
  }

  function focusHeaderMoreItem(index) {
    const items = getVisibleHeaderMoreItems();
    if (!items.length) return;
    const targetIdx = ((index % items.length) + items.length) % items.length;
    items.forEach((el, idx) => el.setAttribute('tabindex', idx === targetIdx ? '0' : '-1'));
    items[targetIdx].focus();
  }

  function closeHeaderMoreMenu(opts = {}) {
    const menu = document.getElementById('pm-header-more-menu');
    const btn = document.getElementById('btn-header-more');
    const wasOpen = Boolean(menu && !menu.classList.contains('hidden'));
    if (menu) menu.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (opts && opts.restoreFocus && wasOpen && btn && typeof btn.focus === 'function') {
      const cs = window.getComputedStyle(btn);
      if (cs.display !== 'none' && cs.visibility !== 'hidden') btn.focus();
    }
  }
  P.closeHeaderMoreMenu = closeHeaderMoreMenu;

  function toggleHeaderMoreMenu(anchorBtn, opts = {}) {
    const menu = document.getElementById('pm-header-more-menu');
    if (!menu || !anchorBtn) return;
    const willOpen = menu.classList.contains('hidden');
    if (!willOpen) {
      closeHeaderMoreMenu();
      return;
    }
    P.closeMutePopover?.();
    P.closeRailContextMenu?.();
    menu.classList.remove('hidden');
    anchorBtn.setAttribute('aria-expanded', 'true');
    const rect = anchorBtn.getBoundingClientRect();
    const menuW = menu.offsetWidth || 196;
    const menuH = menu.offsetHeight || 220;
    const vw = window.innerWidth || 320;
    const vh = window.innerHeight || 600;
    const left = Math.max(8, Math.min(vw - menuW - 8, rect.right - menuW));
    const top = Math.max(8, Math.min(vh - menuH - 8, rect.bottom + 6));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    const items = getVisibleHeaderMoreItems();
    items.forEach((el) => el.setAttribute('tabindex', '-1'));
    if (typeof opts.focusIndex === 'number' && items.length > 0) {
      focusHeaderMoreItem(opts.focusIndex);
    }
  }

  function bindHeaderAndResizeEvents() {
    const st = P.state;

    const cyclePopupWidth = async () => {
      const currentW = st.appSettings.popupWidth || 520;
      const nextW = currentW < 620 ? 660 : currentW < 740 ? 780 : 520;
      const label = nextW === 780 ? 'Extra-Wide (780px)' : nextW === 660 ? 'Wide (660px)' : 'Standard (520px)';
      await P.saveSettingsPatch({ popupWidth: nextW });
      setTimeout(() => P.applyEmailReaderScale?.(), 80);
      P.showToast(`Popup Width: ${label}`);
    };

    document.getElementById('btn-toggle-wide')?.addEventListener('click', cyclePopupWidth);
    document.getElementById('btn-reader-wide')?.addEventListener('click', cyclePopupWidth);

    const openPopoutWindow = () => {
      browser.windows.create({
        url: browser.runtime.getURL('src/popup/popup.html?popout=1'),
        type: 'popup',
        width: 900,
        height: 760
      });
    };
    document.getElementById('btn-popout-window')?.addEventListener('click', openPopoutWindow);

    const moreBtn = document.getElementById('btn-header-more');
    const moreMenuEl = document.getElementById('pm-header-more-menu');
    moreBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHeaderMoreMenu(moreBtn, { focusIndex: e.detail === 0 ? 0 : null });
    });
    moreBtn?.addEventListener('keydown', (e) => {
      const isOpen = Boolean(moreMenuEl && !moreMenuEl.classList.contains('hidden'));
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        if (!isOpen) toggleHeaderMoreMenu(moreBtn, { focusIndex: 0 });
        else focusHeaderMoreItem(0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (!isOpen) toggleHeaderMoreMenu(moreBtn, { focusIndex: -1 });
        else focusHeaderMoreItem(-1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        toggleHeaderMoreMenu(moreBtn, { focusIndex: 0 });
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        closeHeaderMoreMenu({ restoreFocus: true });
      }
    });
    moreMenuEl?.addEventListener('keydown', (e) => {
      const items = getVisibleHeaderMoreItems();
      const idx = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        focusHeaderMoreItem(idx === -1 ? 0 : idx + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        focusHeaderMoreItem(idx === -1 ? -1 : idx - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        e.stopPropagation();
        focusHeaderMoreItem(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        e.stopPropagation();
        focusHeaderMoreItem(-1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (document.activeElement && items.includes(document.activeElement)) {
          e.preventDefault();
          e.stopPropagation();
          document.activeElement.click();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeHeaderMoreMenu({ restoreFocus: true });
      } else if (e.key === 'Tab') {
        closeHeaderMoreMenu({ restoreFocus: false });
      }
    });

    document.getElementById('btn-more-themes')?.addEventListener('click', () => {
      closeHeaderMoreMenu();
      P.openThemeDrawer?.();
    });
    document.getElementById('btn-more-popout')?.addEventListener('click', () => {
      closeHeaderMoreMenu();
      openPopoutWindow();
    });
    document.getElementById('btn-more-quick-switcher')?.addEventListener('click', () => {
      closeHeaderMoreMenu();
      P.openQuickSwitcher?.();
    });
    document.getElementById('btn-more-accounts')?.addEventListener('click', () => {
      closeHeaderMoreMenu();
      P.openAccountDrawer?.();
    });
    document.getElementById('btn-more-settings')?.addEventListener('click', () => {
      closeHeaderMoreMenu();
      browser.runtime.openOptionsPage();
    });
    document.getElementById('btn-more-sync')?.addEventListener('click', () => {
      closeHeaderMoreMenu();
      document.getElementById('btn-refresh')?.click();
    });

    const dismissMoreOnOutside = (e) => {
      const menu = document.getElementById('pm-header-more-menu');
      if (!menu || menu.classList.contains('hidden')) return;
      if (!menu.contains(e.target) && !e.target.closest('#btn-header-more')) {
        closeHeaderMoreMenu();
      }
    };
    document.addEventListener('mousedown', dismissMoreOnOutside);
    document.addEventListener('click', dismissMoreOnOutside);
    window.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
          closeHeaderMoreMenu();
        }
      }, 0);
    });

    const refreshBtn = document.getElementById('btn-refresh');
    refreshBtn?.addEventListener('click', async () => {
      closeHeaderMoreMenu();
      refreshBtn.classList.add('pm-spinning');
      const res = await browser.runtime.sendMessage({ type: 'SYNC_NOW' }).catch(() => null);
      refreshBtn.classList.remove('pm-spinning');
      if (res && res.state) {
        st.appState = res.state;
        st.appSettings = res.settings || st.appSettings;
        st.snoozedMap = res.snoozed || {};
        P.renderAll();
        P.showToast('Synced all accounts locally');
      }
    });

    const setupResizeGrip = (gripEl, isLeft) => {
      if (!gripEl) return;
      gripEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startX = e.screenX;
        const startY = e.screenY;
        const startW = st.appSettings.popupWidth || 520;
        const startH = st.appSettings.popupHeight || 600;
        let latestW = startW;
        let latestH = startH;

        const onMove = (moveEv) => {
          const dx = isLeft ? startX - moveEv.screenX : moveEv.screenX - startX;
          const dy = moveEv.screenY - startY;
          latestW = Math.max(380, Math.min(795, startW + dx));
          latestH = Math.max(460, Math.min(600, startH + dy));
          document.documentElement.style.setProperty('--popup-width', `${latestW}px`);
          document.documentElement.style.setProperty('--popup-height', `${latestH}px`);
          P.applyEmailReaderScale?.();
        };

        const onUp = async () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          await P.saveSettingsPatch({ popupWidth: latestW, popupHeight: latestH });
          P.showToast(`Resized to ${latestW}×${latestH}px`);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    };

    setupResizeGrip(document.getElementById('pm-resize-left'), true);
    setupResizeGrip(document.getElementById('pm-resize-right'), false);

    // Unified Window Message Bridge from Embedded Content Frames
    window.addEventListener('message', (e) => {
      const data = e.data;
      if (!data || data.source !== 'pocketmail-media-frame') return;

      let sourceEntry = null;
      st.mediaFramePool.forEach((entry) => {
        if (entry.frame && entry.frame.contentWindow && entry.frame.contentWindow === e.source) {
          sourceEntry = entry;
        }
      });
      const gmailComposeFrame = document.getElementById('pm-compose-gmail-frame');
      const isFromGmailCompose = Boolean(
        gmailComposeFrame && gmailComposeFrame.contentWindow && gmailComposeFrame.contentWindow === e.source
      );
      const isSameOriginHost = !e.origin || e.origin === window.location.origin;
      const isTrustedSelfPost =
        isSameOriginHost &&
        (e.source === window || (window.parent && window.parent !== window && e.source === window.parent));
      const isTrustedFrameSource = Boolean(sourceEntry || isFromGmailCompose);
      if (!isTrustedFrameSource && !isTrustedSelfPost) return;

      if (data.type === 'PM_QUICK_SWITCHER_TOGGLE') {
        if (!sourceEntry && !isTrustedSelfPost) return;
        if (st.appSettings.quickSwitcherEnabled === false) return;
        const now = Date.now();
        if (now - lastQuickSwitcherRemoteTs > 150) {
          lastQuickSwitcherRemoteTs = now;
          P.toggleQuickSwitcher?.();
        }
        return;
      }

      if (data.type === 'PM_GMAIL_AUTOSEND_RESULT') {
        if (!isFromGmailCompose && !isTrustedSelfPost) return;
        if (typeof st.pendingGmailAutoSendResolver === 'function') {
          st.pendingGmailAutoSendResolver({
            ok: Boolean(data.ok),
            reason: data.reason || '',
            method: data.method || 'first-party-gmail-composer'
          });
        } else if (data.ok && P.dom.composeDrawer && !P.dom.composeDrawer.classList.contains('hidden')) {
          const fromSelect = document.getElementById('compose-from');
          const selectedOpt = fromSelect?.options?.[fromSelect.selectedIndex];
          const slot = parseInt(fromSelect?.value || '0', 10) || 0;
          const accountEmail = selectedOpt?.getAttribute('data-email') || '';
          const to = (document.getElementById('compose-to')?.value || '').trim();
          const cc = (document.getElementById('compose-cc')?.value || '').trim();
          const bcc = (document.getElementById('compose-bcc')?.value || '').trim();
          const su = (document.getElementById('compose-subject')?.value || '').trim();
          const body = (document.getElementById('compose-body')?.value || '').trim();
          browser.runtime
            .sendMessage({
              type: 'RECORD_SENT_EMAIL',
              payload: { slotIndex: slot, accountEmail, to: to || 'Recipient', cc, bcc, subject: su, body }
            })
            .then((res) => {
              if (res && res.state) {
                st.appState = res.state;
                P.renderAll();
              }
            })
            .catch(() => {});
          P.setDrawerOpen(P.dom.composeDrawer, false);
          P.showToast(`✓ Email sent via Gmail${to ? ` to ${to}` : ''}!`);
        }
        return;
      }

      if (!sourceEntry && isTrustedSelfPost && typeof data.flatFrameName === 'string' && data.flatFrameName.startsWith('pm-media-frame-')) {
        const matchedAppId = data.flatFrameName.replace('pm-media-frame-', '');
        sourceEntry = st.mediaFramePool.get(matchedAppId) || null;
      }

      if (P.handleAudioWindowMessage?.(e, sourceEntry)) return;
      P.handleWorkspaceWindowMessage?.(e, sourceEntry);
    });

    // Unified Runtime Message Listener
    browser.runtime.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'STATE_UPDATED') {
        st.appState = msg.state || st.appState;
        st.appSettings = msg.settings || st.appSettings;
        P.renderAll();
        P.broadcastMuteAndShortcutsConfig?.();
      } else if (msg.type === 'OPEN_APP_FROM_SHORTCUT') {
        const targetMode = msg.openMode || 'sidebar';
        const isExactTargetSurface =
          (targetMode === 'sidebar' && st.IS_SIDEBAR_VIEW && !st.IS_POPOUT_VIEW) ||
          (targetMode === 'popup' && !st.IS_SIDEBAR_VIEW && !st.IS_POPOUT_VIEW) ||
          (targetMode === 'popout' && st.IS_POPOUT_VIEW);
        if (isExactTargetSurface) {
          try { browser.extension?.getBackgroundPage?.()?.__pmConsumePendingShortcutApp?.(); } catch (_) {}
          browser.runtime.sendMessage({ type: 'CONSUME_PENDING_SHORTCUT' }).catch(() => {});
        }
        if (msg.settings) st.appSettings = msg.settings;
        if (msg.appId) P.activateAppDirectlyById(msg.appId);
      } else if (msg.type === 'OPEN_URL_IN_SIDEBAR' && msg.url) {
        const wantPopout = msg.openBehavior === 'popout';
        if (wantPopout !== st.IS_POPOUT_VIEW) return;
        try { browser.extension?.getBackgroundPage?.()?.__pmConsumePendingContextUrl?.(); } catch (_) {}
        browser.runtime.sendMessage({ type: 'CONSUME_PENDING_CONTEXT_URL' }).catch(() => {});
        P.openUrlInWorkspace?.(msg.url);
      } else if (msg.type === 'OPEN_APP_FROM_CONTEXT_MENU') {
        if (msg.appId) P.activateAppDirectlyById(msg.appId);
        else if (msg.url) P.openUrlInWorkspace?.(msg.url);
      } else if (msg.type === 'OPEN_MAIL_WORKSPACE') {
        P.activateAppDirectlyById('pocketmail');
      } else if (msg.type === 'BG_AUDIO_STATUS_CHANGED') {
        P.handleBgAudioStatusChanged?.(msg);
      } else if (msg.type === 'PM_FORWARD_MEDIA_COMMAND') {
        P.handleForwardMediaCommand?.(msg);
      } else if (msg.type === 'PM_QUICK_SWITCHER_TOGGLE') {
        const matchesPool = msg.flatFrameName && st.mediaFramePool.has(msg.flatFrameName.replace('pm-media-frame-', ''));
        const isActiveSurface = matchesPool || document.hasFocus() || document.visibilityState === 'visible';
        if (isActiveSurface) {
          const now = Date.now();
          if (now - lastQuickSwitcherRemoteTs > 150) {
            lastQuickSwitcherRemoteTs = now;
            P.toggleQuickSwitcher?.();
          }
        }
      } else if (msg.type === 'PM_SEEK_SIDEBAR_SP') {
        const spEntry = st.mediaFramePool.get(msg.appId || 'spotify');
        try {
          spEntry?.frame?.contentWindow?.postMessage(
            {
              target: 'pocketmail-media-frame',
              cmd: 'SEEK_SP_MEDIA',
              currentTime: msg.currentTime,
              forceHarmonySeek: Boolean(msg.forceHarmonySeek)
            },
            '*'
          );
        } catch (_) {}
      } else if (msg.type === 'PM_SKIP_SIDEBAR_SP') {
        const spEntry = st.mediaFramePool.get(msg.appId || 'spotify');
        try {
          spEntry?.frame?.contentWindow?.postMessage(
            { target: 'pocketmail-media-frame', cmd: 'SKIP_NEXT_SP_TRACK' },
            '*'
          );
        } catch (_) {}
      } else if (msg.type === 'PM_RESUME_SIDEBAR_SP') {
        const spEntry = st.mediaFramePool.get(msg.appId || 'spotify');
        try {
          spEntry?.frame?.contentWindow?.postMessage(
            { target: 'pocketmail-media-frame', cmd: 'RESUME_BG_SP_MEDIA' },
            '*'
          );
        } catch (_) {}
      } else if (msg.type === 'PM_TAB_AUDIO_AUTO_PAUSE_STATE') {
        P.handleTabAudioAutoPauseState?.(msg);
      }
    });

    // Single Unified window.keydown Dispatcher (Quick Switcher + App Hotkeys + Ctrl+Enter + Escape + W + Reader)
    window.addEventListener(
      'keydown',
      (e) => {
        if (P.isShortcutRecordingActive()) return;
        if (document.getElementById('pm-custom-app-edit-modal')) return;

        // 1. Quick Switcher Shortcut (works even when focus is inside inputs)
        if (!e.repeat && st.appSettings.quickSwitcherEnabled !== false && P.matchesQuickSwitcherShortcut?.(e)) {
          e.preventDefault();
          e.stopPropagation();
          P.toggleQuickSwitcher?.();
          return;
        }

        if (P.isQuickSwitcherOpen?.()) {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            P.closeQuickSwitcher?.();
          }
          return;
        }

        // 2. Per-app custom hotkeys
        if ((e.altKey || e.ctrlKey || e.metaKey || /^F([1-9]|1[0-2])$/i.test(e.key || '')) && !e.repeat) {
          const schema = P.getSchemaApi();
          const parsedSc = schema?.formatShortcutFromKeyEvent?.(e);
          if (parsedSc && parsedSc.action === 'set' && parsedSc.shortcut) {
            const comboNorm = parsedSc.shortcut.toLowerCase();
            const appScMap = st.appSettings.appShortcuts || {};
            for (const [boundAppId, boundCombo] of Object.entries(appScMap)) {
              if (boundCombo && String(boundCombo).trim().toLowerCase() === comboNorm) {
                e.preventDefault();
                e.stopPropagation();
                P.activateAppDirectlyById(boundAppId);
                return;
              }
            }
          }
        }

        // 3. Ctrl+Enter in Compose / Reader Quick Reply
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          if (P.dom.composeDrawer && !P.dom.composeDrawer.classList.contains('hidden')) {
            e.preventDefault();
            document.getElementById('btn-compose-send')?.click();
            return;
          }
          if (P.dom.readerDrawer && !P.dom.readerDrawer.classList.contains('hidden') && st.activeReaderMessage) {
            e.preventDefault();
            document.getElementById('btn-reader-send-reply')?.click();
            return;
          }
        }

        const tag = (e.target && e.target.tagName) || '';
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
          if (e.key === 'Escape') e.target.blur();
          return;
        }

        const moreMenuOpen = document.getElementById('pm-header-more-menu');
        const moreBtnEl = document.getElementById('btn-header-more');
        if (moreMenuOpen && !moreMenuOpen.classList.contains('hidden')) {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeHeaderMoreMenu({ restoreFocus: true });
            return;
          }
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') && !moreMenuOpen.contains(e.target) && e.target !== moreBtnEl) {
            e.preventDefault();
            e.stopPropagation();
            focusHeaderMoreItem(e.key === 'ArrowUp' || e.key === 'End' ? -1 : 0);
            return;
          }
        }

        // 4. Escape closes top-most overlay/popover/drawer
        if (e.key === 'Escape') {
          const moreMenu = document.getElementById('pm-header-more-menu');
          const mutePop = document.getElementById('pm-mute-popover');
          if (moreMenu && !moreMenu.classList.contains('hidden')) {
            closeHeaderMoreMenu({ restoreFocus: true });
          } else if (mutePop && !mutePop.classList.contains('hidden')) {
            P.closeMutePopover?.();
          } else if (P.dom.readerDrawer && !P.dom.readerDrawer.classList.contains('hidden')) {
            P.setDrawerOpen(P.dom.readerDrawer, false);
            st.activeReaderMessage = null;
          } else if (P.dom.themeDrawer && !P.dom.themeDrawer.classList.contains('hidden')) {
            P.setDrawerOpen(P.dom.themeDrawer, false);
          } else if (P.dom.accountDrawer && !P.dom.accountDrawer.classList.contains('hidden')) {
            P.setDrawerOpen(P.dom.accountDrawer, false);
          } else if (P.dom.composeDrawer && !P.dom.composeDrawer.classList.contains('hidden')) {
            P.setDrawerOpen(P.dom.composeDrawer, false);
          } else if (P.dom.mediaAppsDrawer && !P.dom.mediaAppsDrawer.classList.contains('hidden')) {
            P.closeSidebarHubDrawer();
          }
          return;
        }

        if (e.key.toLowerCase() === 'w') {
          cyclePopupWidth();
          return;
        }

        if (P.dom.readerDrawer && !P.dom.readerDrawer.classList.contains('hidden') && st.activeReaderMessage) {
          if (e.key === 'j' || e.key === 'ArrowDown') {
            P.navigateReaderEmail?.(1);
          } else if (e.key === 'k' || e.key === 'ArrowUp') {
            P.navigateReaderEmail?.(-1);
          } else if (e.key.toLowerCase() === 'e') {
            document.getElementById('btn-reader-archive')?.click();
          } else if (e.key.toLowerCase() === 'r') {
            document.getElementById('btn-reader-mark-read')?.click();
          } else if (e.key.toLowerCase() === 's') {
            document.getElementById('btn-reader-star')?.click();
          }
        }
      },
      true
    );
  }

  async function init() {
    const st = P.state;
    const mediaApi = P.getAppsApi();

    P.bindMailViewEvents?.();
    P.bindEmailReaderEvents?.();
    P.bindComposeEvents?.();
    P.bindThemeStudioEvents?.();
    P.bindMediaWorkspaceEvents?.();
    P.bindLeftRailEvents?.();
    P.bindNowPlayingEvents?.();
    P.bindQuickSwitcherEvents?.();
    bindHeaderAndResizeEvents();
    P.bindPageHideHandoff?.();

    const params = new URLSearchParams(window.location.search || '');
    const urlParamAppId = params.get('app') || '';
    const urlParamContextUrl = params.get('url') || '';
    let initialAppId = '';
    let initialContextUrl = urlParamContextUrl || '';
    let isShortcutLaunch = false;
    let fastBootMountedAppId = '';

    let syncBgState = null;
    try {
      const bgWin =
        browser.extension && typeof browser.extension.getBackgroundPage === 'function'
          ? browser.extension.getBackgroundPage()
          : null;
      if (bgWin && typeof bgWin.__pmConsumePendingShortcutApp === 'function') {
        const pendingSc = bgWin.__pmConsumePendingShortcutApp();
        const scAppId = typeof pendingSc === 'string' ? pendingSc : pendingSc?.appId;
        if (scAppId) {
          initialAppId = scAppId;
          isShortcutLaunch = true;
        }
      }
      if (bgWin && typeof bgWin.__pmConsumePendingContextUrl === 'function') {
        const pendingCtx = bgWin.__pmConsumePendingContextUrl();
        if (pendingCtx && pendingCtx.url && !initialContextUrl) {
          initialContextUrl = pendingCtx.url;
        }
      }
      if (bgWin && typeof bgWin.__pmGetSyncBootState === 'function') {
        syncBgState = bgWin.__pmGetSyncBootState();
      }
      if (!initialAppId && syncBgState && syncBgState.pendingShortcutAppId) {
        initialAppId = syncBgState.pendingShortcutAppId;
        isShortcutLaunch = true;
        browser.runtime.sendMessage({ type: 'CONSUME_PENDING_SHORTCUT' }).catch(() => {});
      }
      if (!initialContextUrl && syncBgState && syncBgState.pendingContextUrl?.url) {
        initialContextUrl = syncBgState.pendingContextUrl.url;
        browser.runtime.sendMessage({ type: 'CONSUME_PENDING_CONTEXT_URL' }).catch(() => {});
      }
    } catch (_) {}

    if (!initialAppId && urlParamAppId) {
      initialAppId = urlParamAppId;
    }

    try {
      if (syncBgState && syncBgState.settings) {
        st.appSettings = { ...st.appSettings, ...syncBgState.settings };
        st.currentAudibleBgAppId = syncBgState.audibleAppId || null;
        if (syncBgState.nowPlaying) st.bgNowPlayingState = syncBgState.nowPlaying;
        st.isAutoPausedByExternalTab = Boolean(syncBgState.isAutoPausedByTabAudio);
        if (
          !st.IS_POPOUT_VIEW &&
          (st.IS_SIDEBAR_VIEW || (Number(syncBgState.sidebarOpenCount) || 0) === 0) &&
          Array.isArray(syncBgState.activeBgApps)
        ) {
          syncBgState.activeBgApps.forEach((bgApp) => {
            if (bgApp && bgApp.appId && P.isAppAllowedForBgAudio?.(bgApp.appId)) {
              st.pendingTakeoverMeta.set(bgApp.appId, {
                trackTitle: bgApp.trackTitle || bgApp.title || '',
                artist: bgApp.artist || '',
                currentTime: Number(bgApp.currentTime) || 0,
                duration: Number(bgApp.duration) || 0,
                resumeUrl: bgApp.resumeUrl || bgApp.url || '',
                urlTrackTitle: bgApp.urlTrackTitle || '',
                handedOffAt: typeof bgApp.handedOffAt === 'number' && bgApp.handedOffAt > 0 ? bgApp.handedOffAt : 0
              });
              if (bgApp.bgMasterActive) {
                st.bgMasterAudioSet.add(bgApp.appId);
                st.pendingSidebarAudioTakeoverSet.delete(bgApp.appId);
              } else {
                st.pendingSidebarAudioTakeoverSet.add(bgApp.appId);
              }
              if (bgApp.url) {
                const resolvedBgUrl =
                  bgApp.appId === 'spotify' && P.resolveSpotifyReopenUrl
                    ? P.resolveSpotifyReopenUrl(bgApp.url, bgApp)
                    : bgApp.url;
                st.hibernatedAppUrls.set(bgApp.appId, resolvedBgUrl);
              }
            }
          });
        }
      }
      const rawFast = window.localStorage.getItem('pm_fast_boot_v1');
      if (rawFast || syncBgState) {
        const fast = rawFast ? JSON.parse(rawFast) : null;
        if (fast && fast.settings && !syncBgState && Date.now() - (fast.ts || 0) < 7 * 24 * 3600 * 1000) {
          st.appSettings = { ...st.appSettings, ...fast.settings };
        }
        if (fast && fast.savedUrls && typeof fast.savedUrls === 'object') {
          Object.entries(fast.savedUrls).forEach(([k, v]) => {
            if (v && !P.isTransientAuthOrBootUrl?.(v) && !st.hibernatedAppUrls.has(k)) {
              const resolvedFastUrl =
                k === 'spotify' && P.resolveSpotifyReopenUrl ? P.resolveSpotifyReopenUrl(v) : v;
              st.hibernatedAppUrls.set(k, resolvedFastUrl);
            }
          });
        }
        if (st.appSettings.persistentSavedAppUrls && typeof st.appSettings.persistentSavedAppUrls === 'object') {
          Object.entries(st.appSettings.persistentSavedAppUrls).forEach(([k, v]) => {
            if (v && !P.isTransientAuthOrBootUrl?.(v) && !st.hibernatedAppUrls.has(k)) {
              const resolvedSavedUrl =
                k === 'spotify' && P.resolveSpotifyReopenUrl ? P.resolveSpotifyReopenUrl(v) : v;
              st.hibernatedAppUrls.set(k, resolvedSavedUrl);
            }
          });
        }
        const openList = Array.isArray(st.appSettings.persistentOpenAppIds)
          ? st.appSettings.persistentOpenAppIds
          : Array.isArray(fast?.openPersistentAppIds)
            ? fast.openPersistentAppIds
            : [];
        openList.forEach((id) => {
          if (id && P.isAppPersistent?.(id)) st.knownOpenPersistentIds.add(id);
        });
        P.getThemesApi()?.applyThemeAndWallpaper(document, st.appSettings);

        const fastLastActiveId = initialAppId
          ? initialAppId
          : st.appSettings.persistentLastActiveAppId || fast?.activeAppId;
        const canFastRestoreLastApp =
          !initialContextUrl &&
          !st.IS_POPOUT_VIEW &&
          fastLastActiveId &&
          fastLastActiveId !== 'pocketmail' &&
          (Boolean(initialAppId) || P.isAppPersistent?.(fastLastActiveId));
        if (canFastRestoreLastApp && mediaApi) {
          const fastApp = mediaApi.getAppById(fastLastActiveId, st.appSettings);
          if (fastApp) {
            st.activeRailAppId = fastApp.id;
            if (!st.IS_SIDEBAR_VIEW) {
              document.documentElement.classList.add('show-popup-rail');
            }
            P.renderOperaRail?.();
            P.openMediaWorkspace?.(fastApp, st.hibernatedAppUrls.get(fastApp.id) || undefined);
            fastBootMountedAppId = fastApp.id;
          } else {
            P.renderOperaRail?.();
          }
        } else {
          if (initialAppId === 'pocketmail') st.activeRailAppId = 'pocketmail';
          P.renderOperaRail?.();
        }
      }
    } catch (_) {}

    ensureSettingsUiMounted('audio');

    if (st.IS_SIDEBAR_VIEW && !st.IS_POPOUT_VIEW && !st.sidebarLifecyclePort) {
      try {
        if (browser.runtime && typeof browser.runtime.connect === 'function') {
          st.sidebarLifecyclePort = browser.runtime.connect({ name: 'foxhub-sidebar-lifecycle' });
        }
      } catch (_) {}
    }

    let [res, handoffRes] = await Promise.all([
      browser.runtime.sendMessage({ type: 'GET_STATE' }).catch(() => null),
      !st.IS_POPOUT_VIEW
        ? browser.runtime
            .sendMessage({ type: 'STOP_BG_AUDIO_HANDOFF', onlyIfNoSidebar: !st.IS_SIDEBAR_VIEW })
            .catch(() => null)
        : Promise.resolve(null)
    ]);

    if (res) {
      st.appState = res.state || st.appState;
      st.appSettings = res.settings || st.appSettings;
      st.snoozedMap = res.snoozed || {};
      st.currentAudibleBgAppId = res.audibleAppId || null;
      st.bgNowPlayingState = res.nowPlaying || null;
      st.isAutoPausedByExternalTab = Boolean(res.isAutoPausedByTabAudio);

      if (!isShortcutLaunch && res.pendingShortcutAppId) {
        initialAppId = res.pendingShortcutAppId;
        isShortcutLaunch = true;
        browser.runtime.sendMessage({ type: 'CONSUME_PENDING_SHORTCUT' }).catch(() => {});
      }
      if (!initialContextUrl && res.pendingContextUrl?.url) {
        initialContextUrl = res.pendingContextUrl.url;
        browser.runtime.sendMessage({ type: 'CONSUME_PENDING_CONTEXT_URL' }).catch(() => {});
      }

      const actAsPrimaryHub =
        !st.IS_POPOUT_VIEW && (st.IS_SIDEBAR_VIEW || (Number(res.sidebarOpenCount) || 0) === 0);
      if (actAsPrimaryHub && !st.sidebarLifecyclePort) {
        try {
          if (browser.runtime && typeof browser.runtime.connect === 'function') {
            const lifecyclePortName = st.IS_SIDEBAR_VIEW ? 'foxhub-sidebar-lifecycle' : 'foxhub-popup-lifecycle';
            st.sidebarLifecyclePort = browser.runtime.connect({ name: lifecyclePortName });
          }
        } catch (_) {}
      }
      if (actAsPrimaryHub && (!handoffRes || handoffRes.skipped)) {
        handoffRes = await browser.runtime.sendMessage({ type: 'STOP_BG_AUDIO_HANDOFF' }).catch(() => null);
      }

      if (actAsPrimaryHub && handoffRes && !handoffRes.skipped) {
        if (handoffRes.settings) st.appSettings = handoffRes.settings;
        if (handoffRes.isAutoPausedByTabAudio !== undefined) {
          st.isAutoPausedByExternalTab = Boolean(handoffRes.isAutoPausedByTabAudio);
        }
        if (handoffRes.audibleAppId !== undefined) {
          st.currentAudibleBgAppId = handoffRes.audibleAppId || st.currentAudibleBgAppId;
        }
        if (handoffRes.nowPlaying !== undefined) {
          st.bgNowPlayingState = handoffRes.nowPlaying || st.bgNowPlayingState;
        }
        if (Array.isArray(handoffRes.activeBgApps)) {
          handoffRes.activeBgApps.forEach((bgApp) => {
            if (bgApp && bgApp.appId && P.isAppAllowedForBgAudio?.(bgApp.appId)) {
              st.pendingTakeoverMeta.set(bgApp.appId, {
                trackTitle: bgApp.trackTitle || bgApp.title || '',
                artist: bgApp.artist || '',
                currentTime: Number(bgApp.currentTime) || 0,
                duration: Number(bgApp.duration) || 0,
                resumeUrl: bgApp.resumeUrl || bgApp.url || '',
                urlTrackTitle: bgApp.urlTrackTitle || '',
                handedOffAt: typeof bgApp.handedOffAt === 'number' && bgApp.handedOffAt > 0 ? bgApp.handedOffAt : 0
              });
              const resolvedBgUrl = bgApp.url
                ? bgApp.appId === 'spotify' && P.resolveSpotifyReopenUrl
                  ? P.resolveSpotifyReopenUrl(bgApp.url, bgApp)
                  : bgApp.url
                : '';
              if (bgApp.bgMasterActive) {
                st.bgMasterAudioSet.add(bgApp.appId);
                st.pendingSidebarAudioTakeoverSet.delete(bgApp.appId);
                if (resolvedBgUrl) st.hibernatedAppUrls.set(bgApp.appId, resolvedBgUrl);
                return;
              }
              st.pendingSidebarAudioTakeoverSet.add(bgApp.appId);
              if (resolvedBgUrl) st.hibernatedAppUrls.set(bgApp.appId, resolvedBgUrl);
              const existingEntry = st.mediaFramePool.get(bgApp.appId);
              if (
                !st.isAutoPausedByExternalTab &&
                existingEntry &&
                existingEntry.loaded &&
                (!existingEntry.autoResumeSentAt || Date.now() - existingEntry.autoResumeSentAt > 4000)
              ) {
                existingEntry.autoResumeSentAt = Date.now();
                try {
                  existingEntry.frame.contentWindow?.postMessage(
                    P.buildAutoResumePayload
                      ? P.buildAutoResumePayload(bgApp.appId)
                      : { target: 'pocketmail-media-frame', cmd: 'AUTO_RESUME_PLAYBACK' },
                    '*'
                  );
                } catch (_) {}
              }
            }
          });
        }
      }

      const savedMap = st.appSettings.persistentSavedAppUrls || {};
      Object.entries(savedMap).forEach(([id, savedUrl]) => {
        if (
          savedUrl &&
          !P.isTransientAuthOrBootUrl?.(savedUrl) &&
          (P.isAppPersistent?.(id) || P.isAppAllowedForBgAudio?.(id)) &&
          !st.hibernatedAppUrls.has(id)
        ) {
          const resolvedSaved =
            id === 'spotify' && P.resolveSpotifyReopenUrl ? P.resolveSpotifyReopenUrl(savedUrl) : savedUrl;
          st.hibernatedAppUrls.set(id, resolvedSaved);
        }
      });
      if (Array.isArray(st.appSettings.persistentOpenAppIds)) {
        st.appSettings.persistentOpenAppIds.forEach((id) => {
          if (id && P.isAppPersistent?.(id)) st.knownOpenPersistentIds.add(id);
        });
      }

      const activeBgSet = new Set([...st.pendingSidebarAudioTakeoverSet, ...st.bgMasterAudioSet]);
      const firstBgPlayingId = activeBgSet.size > 0 ? Array.from(activeBgSet)[0] : '';
      const rawLastActiveId = st.appSettings.persistentLastActiveAppId || fastBootMountedAppId;
      const lastActiveId =
        rawLastActiveId && rawLastActiveId !== 'pocketmail' && P.isAppPersistent?.(rawLastActiveId)
          ? rawLastActiveId
          : firstBgPlayingId && (P.isAppPersistent?.(firstBgPlayingId) || P.isAppAllowedForBgAudio?.(firstBgPlayingId))
            ? firstBgPlayingId
            : rawLastActiveId;
      const shouldAutoRestoreApp =
        !initialContextUrl &&
        !st.IS_POPOUT_VIEW &&
        !initialAppId &&
        lastActiveId &&
        lastActiveId !== 'pocketmail' &&
        (P.isAppPersistent?.(lastActiveId) || activeBgSet.has(lastActiveId));

      if (initialAppId === 'pocketmail') {
        st.activeRailAppId = 'pocketmail';
        P.hideMediaWorkspaceKeepAlive?.();
      } else if (initialAppId) {
        st.activeRailAppId = initialAppId;
      } else if (shouldAutoRestoreApp) {
        st.activeRailAppId = lastActiveId;
      }

      P.renderAll();
      st.sidebarInitCompleted = true;
      P.saveFastBootCache?.();
      P.maybeShowSettingsGearCoachmark?.();

      if (Date.now() - (st.appState.lastSyncAt || 0) > 2500) {
        P.triggerSilentMailSync(2000);
      }
      window.addEventListener('focus', () => {
        if (st.activeRailAppId === 'pocketmail') {
          P.triggerSilentMailSync(3000);
        }
      });
      setInterval(() => {
        if (st.activeRailAppId === 'pocketmail' && document.visibilityState === 'visible') {
          P.triggerSilentMailSync(9000);
        }
      }, 10000);

      setInterval(() => {
        const now = Date.now();
        const hadDnd = Boolean(st.appSettings.dndUntil && st.appSettings.dndUntil > 0);
        const hadSites = Boolean(st.appSettings.muteSitesUntil && st.appSettings.muteSitesUntil > 0);
        if (!hadDnd && !hadSites) return;
        let expired = false;
        if (hadDnd && st.appSettings.dndUntil <= now) {
          st.appSettings.dndUntil = 0;
          expired = true;
        }
        if (hadSites && st.appSettings.muteSitesUntil <= now) {
          st.appSettings.muteSitesUntil = 0;
          expired = true;
        }
        if (expired && !st.appSettings.dndUntil && !st.appSettings.muteSitesUntil) {
          st.appSettings.lastMuteTimerMins = 0;
        }
        P.syncMuteUiControls?.();
        P.renderHeaderStatus?.();
        if (expired) {
          P.syncSettingsDrawerUi();
          P.broadcastMuteAndShortcutsConfig?.();
        }
      }, 5000);

      if (initialContextUrl && !isShortcutLaunch) {
        P.openUrlInWorkspace?.(initialContextUrl);
        P.schedulePrewarmPersistentApps?.();
        return;
      }

      if (initialAppId === 'pocketmail') {
        P.schedulePrewarmPersistentApps?.();
        return;
      }

      if (initialAppId && initialAppId !== 'pocketmail' && mediaApi) {
        const app = mediaApi.getAppById(initialAppId, st.appSettings);
        if (app) {
          if (fastBootMountedAppId !== app.id) {
            if (!st.IS_SIDEBAR_VIEW) document.documentElement.classList.add('show-popup-rail');
            P.openMediaWorkspace?.(app, st.hibernatedAppUrls.get(app.id) || undefined);
          }
          P.schedulePrewarmPersistentApps?.();
          return;
        }
      }

      if (shouldAutoRestoreApp && mediaApi) {
        const app = mediaApi.getAppById(lastActiveId, st.appSettings);
        if (app && fastBootMountedAppId !== app.id) {
          if (!st.IS_SIDEBAR_VIEW) document.documentElement.classList.add('show-popup-rail');
          P.openMediaWorkspace?.(app, st.hibernatedAppUrls.get(app.id) || undefined);
        }
      }
      P.schedulePrewarmPersistentApps?.();
    }
  }

  P.init = init;
  init();
})(typeof window !== 'undefined' ? window : this);
