/**
 * FoxHub — Opera-Style Left Rail, 3-Bar Equalizer Indicator, Quick Play/Pause/Mute Controls,
 * Hover Track Tooltip, Mute Popover & Drag-to-Reorder
 */

(function (global) {
  const P = (global.FoxHubPopup = global.FoxHubPopup || {});
  const SVG_NS = 'http://www.w3.org/2000/svg';

  P.createRailUiSvg = function (iconType, size = 14) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.1');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const el = (tag, attrs) => {
      const node = document.createElementNS(SVG_NS, tag);
      Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
      return node;
    };

    if (iconType === 'stop') {
      svg.appendChild(el('rect', { x: '5', y: '5', width: '14', height: '14', rx: '2.5' }));
    } else if (iconType === 'remove') {
      svg.appendChild(el('polyline', { points: '3 6 5 6 21 6' }));
      svg.appendChild(el('path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }));
      svg.appendChild(el('line', { x1: '10', y1: '11', x2: '10', y2: '17' }));
      svg.appendChild(el('line', { x1: '14', y1: '11', x2: '14', y2: '17' }));
    } else if (iconType === 'external') {
      svg.appendChild(el('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }));
      svg.appendChild(el('polyline', { points: '15 3 21 3 21 9' }));
      svg.appendChild(el('line', { x1: '10', y1: '14', x2: '21', y2: '3' }));
    } else if (iconType === 'settings') {
      svg.appendChild(el('circle', { cx: '12', cy: '12', r: '3' }));
      svg.appendChild(
        el('path', {
          d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z'
        })
      );
    } else if (iconType === 'play') {
      svg.appendChild(el('polygon', { points: '6 4 20 12 6 20 6 4', fill: 'currentColor', stroke: 'none' }));
    } else if (iconType === 'pause') {
      svg.appendChild(el('rect', { x: '6', y: '4', width: '4', height: '16', rx: '1' }));
      svg.appendChild(el('rect', { x: '14', y: '4', width: '4', height: '16', rx: '1' }));
    } else if (iconType === 'mute') {
      svg.appendChild(el('polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' }));
      svg.appendChild(el('line', { x1: '23', y1: '9', x2: '17', y2: '15' }));
      svg.appendChild(el('line', { x1: '17', y1: '9', x2: '23', y2: '15' }));
    } else if (iconType === 'plus') {
      svg.appendChild(el('line', { x1: '12', y1: '5', x2: '12', y2: '19' }));
      svg.appendChild(el('line', { x1: '5', y1: '12', x2: '19', y2: '12' }));
    } else if (iconType === 'moon') {
      svg.appendChild(el('path', { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }));
    } else if (iconType === 'sun') {
      svg.appendChild(el('circle', { cx: '12', cy: '12', r: '5' }));
      svg.appendChild(el('line', { x1: '12', y1: '1', x2: '12', y2: '3' }));
      svg.appendChild(el('line', { x1: '12', y1: '21', x2: '12', y2: '23' }));
      svg.appendChild(el('line', { x1: '4.22', y1: '4.22', x2: '5.64', y2: '5.64' }));
      svg.appendChild(el('line', { x1: '18.36', y1: '18.36', x2: '19.78', y2: '19.78' }));
      svg.appendChild(el('line', { x1: '1', y1: '12', x2: '3', y2: '12' }));
      svg.appendChild(el('line', { x1: '21', y1: '12', x2: '23', y2: '12' }));
      svg.appendChild(el('line', { x1: '4.22', y1: '19.78', x2: '5.64', y2: '18.36' }));
      svg.appendChild(el('line', { x1: '18.36', y1: '5.64', x2: '19.78', y2: '4.22' }));
    }
    return svg;
  };

  function createEqualizerBadge(quickEnabled) {
    const badge = document.createElement('span');
    badge.className = `pm-rail-eq-badge${quickEnabled ? '' : ' is-no-quick-ctrl'}`;
    for (let i = 0; i < 3; i++) {
      const bar = document.createElement('span');
      bar.className = 'pm-rail-eq-bar';
      badge.appendChild(bar);
    }
    return badge;
  }

  let activeMutePopoverAnchor = null;
  P.closeMutePopover = function () {
    const pop = document.getElementById('pm-mute-popover');
    if (pop) pop.classList.add('hidden');
    document.getElementById('rail-btn-mute-notifs')?.setAttribute('aria-expanded', 'false');
    activeMutePopoverAnchor = null;
  };

  P.toggleMutePopover = function (anchorBtn) {
    const pop = document.getElementById('pm-mute-popover');
    const targetBtn = anchorBtn || document.getElementById('rail-btn-mute-notifs');
    if (!pop || !targetBtn) return;
    if (!pop.classList.contains('hidden') && activeMutePopoverAnchor === targetBtn) {
      P.closeMutePopover();
      return;
    }
    P.closeHeaderMoreMenu?.();
    P.closeRailContextMenu();
    P.syncMuteUiControls();
    activeMutePopoverAnchor = targetBtn;
    targetBtn.setAttribute('aria-expanded', 'true');

    pop.classList.remove('hidden');
    const rect = targetBtn.getBoundingClientRect();
    const popW = 248;
    const popH = pop.offsetHeight || 256;
    const vw = window.innerWidth || 460;
    const vh = window.innerHeight || 600;

    let left = rect.right + 8;
    let top = Math.min(vh - popH - 10, Math.max(10, rect.bottom - popH + 6));
    if (left + popW > vw - 8) {
      left = Math.max(8, vw - popW - 8);
    }
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  };

  P.closeRailContextMenu = function () {
    document.getElementById('pm-rail-context-menu')?.remove();
  };

  P.isAppPlayingAudioNow = function (appId) {
    const st = P.state;
    if (!appId || st.isAutoPausedByExternalTab) return false;
    if (appId === st.currentAudibleBgAppId) return true;
    if (
      st.pendingSidebarAudioTakeoverSet.has(appId) ||
      st.bgMasterAudioSet.has(appId) ||
      st.sidebarMsePlayers.has(appId)
    ) {
      return true;
    }
    const pb = st.framePlaybackStates.get(appId);
    return Boolean(pb && pb.isPlaying && Date.now() - (pb.updatedAt || 0) < 15000);
  };

  P.openFirefoxLeftSidebar = function () {
    const st = P.state;
    try {
      if (browser.sidebarAction && browser.sidebarAction.open) {
        if (st.activeRailAppId && st.activeRailAppId !== 'pocketmail') {
          browser.runtime
            .sendMessage({ type: 'PREPARE_SIDEBAR_DOCK_APP', appId: st.activeRailAppId })
            .catch(() => {});
        }
        browser.sidebarAction.open();
        P.showToast('Opened in Firefox Left Sidebar!');
      } else {
        document.documentElement.classList.toggle('show-popup-rail');
        P.showToast('Toggled Opera Sidebar Rail');
      }
    } catch (_) {
      document.documentElement.classList.toggle('show-popup-rail');
      P.showToast('Opened Firefox Left Sidebar');
    }
  };

  P.openRailAppContextMenu = function (app, anchorBtn, clientY) {
    const st = P.state;
    P.closeHeaderMoreMenu?.();
    P.closeRailContextMenu();
    const mediaApi = P.getAppsApi();
    if (!mediaApi || !app) return;

    const menu = document.createElement('div');
    menu.id = 'pm-rail-context-menu';
    menu.className = 'pm-rail-context-menu';

    const hdr = document.createElement('div');
    hdr.className = 'pm-rail-ctx-header';
    const hdrIcon = mediaApi.createAppSvgIcon(app.id, 14);
    hdrIcon.style.color = app.color || 'var(--accent)';
    const hdrText = document.createElement('span');
    hdrText.textContent = app.name;
    hdr.appendChild(hdrIcon);
    hdr.appendChild(hdrText);
    menu.appendChild(hdr);

    const addItem = (iconType, labelText, onClick, isDanger = false) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `pm-rail-ctx-item${isDanger ? ' is-danger' : ''}`;
      const iconWrap = document.createElement('span');
      iconWrap.className = 'pm-rail-ctx-icon';
      iconWrap.appendChild(P.createRailUiSvg(iconType, 14));
      const textSpan = document.createElement('span');
      textSpan.textContent = labelText;
      item.appendChild(iconWrap);
      item.appendChild(textSpan);
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        P.closeHeaderMoreMenu?.();
    P.closeRailContextMenu();
        onClick();
      });
      menu.appendChild(item);
    };

    const isPlayingAudio = P.isAppPlayingAudioNow(app.id);
    const isAlive =
      st.mediaFramePool.has(app.id) ||
      st.pendingSidebarAudioTakeoverSet.has(app.id) ||
      st.bgMasterAudioSet.has(app.id) ||
      app.id === st.currentAudibleBgAppId;

    if ((isPlayingAudio || isAlive || app.bgAudioSupported) && st.appSettings.railQuickControlsEnabled !== false) {
      addItem(isPlayingAudio ? 'pause' : 'play', isPlayingAudio ? 'Pause Audio' : 'Play / Resume', () => {
        P.sendNowPlayingCommand?.(app.id, 'play_pause');
      });
      addItem('mute', 'Mute / Unmute App', () => {
        P.sendNowPlayingCommand?.(app.id, 'mute_toggle');
      });
    }

    if (isAlive) {
      addItem('stop', 'Close Background Session', () => {
        P.closeMediaAppFrame?.(app.id);
        P.showToast(`Closed ${app.name} background session`);
      });
    }

    const isMediaCapable =
      isAlive ||
      ['spotify', 'youtube', 'soundcloud', 'apple-music', 'tiktok', 'twitch', 'reddit', 'x', 'instagram'].includes(app.id) ||
      app.isCustom;
    if (isMediaCapable) {
      const curTabBehavior = P.getEffectiveTabAudioBehavior(st.appSettings);
      const modeLabel =
        curTabBehavior === 'pause-resume'
          ? 'Pause & Resume'
          : curTabBehavior === 'pause-only'
            ? 'Pause Only'
            : 'Off (Play Together)';
      addItem('pause', `On Tab Audio: ${modeLabel}`, async () => {
        const order = ['pause-resume', 'pause-only', 'off'];
        const nextMode = order[(order.indexOf(curTabBehavior) + 1) % order.length];
        await P.saveSettingsPatch({
          tabAudioBehavior: nextMode,
          autoPauseOnTabAudio: nextMode !== 'off'
        });
        const toastMap = {
          'pause-resume': 'When Tab Plays Audio: Auto-Pause & Auto-Resume (Default)',
          'pause-only': 'When Tab Plays Audio: Pause Only (Stay Stopped)',
          off: 'When Tab Plays Audio: Keep Playing Simultaneously (Off)'
        };
        P.showToast(toastMap[nextMode]);
      });
    }

    addItem(
      'remove',
      `Remove ${app.name} from Sidebar`,
      async () => {
        if (isAlive || st.activeRailAppId === app.id) {
          P.closeMediaAppFrame?.(app.id);
        }
        if (app.isCustom) {
          const customs = Array.isArray(st.appSettings.customMediaApps) ? [...st.appSettings.customMediaApps] : [];
          const cIdx = customs.findIndex((c, idx) => (c.id || `custom-${idx}`) === app.id);
          if (cIdx >= 0) {
            customs[cIdx] = { ...customs[cIdx], enabled: false };
            await P.saveSettingsPatch({ customMediaApps: customs });
          }
        } else {
          const enabledIds = Array.isArray(st.appSettings.enabledMediaApps)
            ? st.appSettings.enabledMediaApps
            : mediaApi.BUILTIN_MEDIA_APPS.map((a) => a.id);
          const nextIds = enabledIds.filter((id) => id !== app.id);
          await P.saveSettingsPatch({ enabledMediaApps: nextIds });
        }
        P.renderOperaRail();
        P.showToast(`Removed ${app.name} from sidebar (click + anytime to add back)`);
      },
      true
    );

    addItem('external', 'Open in Browser Tab', () => {
      if (app.defaultUrl) browser.tabs.create({ url: app.defaultUrl });
    });

    addItem('plus', 'Add or Pin Sidebar Apps (+)', () => {
      document.getElementById('rail-btn-manage-apps')?.click();
    });

    addItem('settings', 'Sidebar & Audio Settings', () => {
      document.getElementById('rail-btn-sidebar-settings')?.click();
    });

    document.body.appendChild(menu);

    const rect = anchorBtn ? anchorBtn.getBoundingClientRect() : { right: 42, top: clientY || 60 };
    const menuH = menu.offsetHeight || 160;
    const topPos = Math.max(8, Math.min(window.innerHeight - menuH - 8, rect.top));
    menu.style.left = `${Math.round((rect.right || 42) + 6)}px`;
    menu.style.top = `${Math.round(topPos)}px`;

    setTimeout(() => {
      const dismiss = (ev) => {
        if (!menu.contains(ev.target)) {
          P.closeHeaderMoreMenu?.();
    P.closeRailContextMenu();
          document.removeEventListener('mousedown', dismiss, true);
        }
      };
      document.addEventListener('mousedown', dismiss, true);
    }, 0);
  };

  P.renderOperaRail = function () {
    const st = P.state;
    const mediaApi = P.getAppsApi();
    if (!mediaApi) return;

    P.syncNightModeButtons?.();

    const mailBtn = document.getElementById('rail-btn-mail');
    const mailIconWrap = document.getElementById('rail-mail-icon');
    const mailBadge = document.getElementById('rail-mail-badge');
    const openSidebarBtn = document.getElementById('rail-btn-open-sidebar');
    const appsListEl = document.getElementById('pm-rail-apps-list');

    if (mailIconWrap && !mailIconWrap.hasChildNodes()) {
      mailIconWrap.appendChild(mediaApi.createAppSvgIcon('pocketmail', 16));
    }
    if (mailBtn) {
      mailBtn.classList.toggle('active', st.activeRailAppId === 'pocketmail');
    }
    if (mailBadge) {
      const count = st.appState.totalUnread || 0;
      mailBadge.textContent = count > 99 ? '99+' : String(count);
      mailBadge.classList.toggle('hidden', count <= 0);
    }
    if (st.IS_SIDEBAR_VIEW) {
      openSidebarBtn?.classList.add('hidden');
    }

    const eqEnabled = st.appSettings.railPlayingIndicatorEnabled !== false;
    const quickEnabled = st.appSettings.railQuickControlsEnabled !== false;
    const anyAudioPlaying =
      !st.isAutoPausedByExternalTab &&
      (Boolean(st.currentAudibleBgAppId) ||
        st.pendingSidebarAudioTakeoverSet.size > 0 ||
        st.bgMasterAudioSet.size > 0 ||
        st.sidebarMsePlayers.size > 0 ||
        Array.from(st.framePlaybackStates.keys()).some((id) => P.isAppPlayingAudioNow(id)));

    if (openSidebarBtn) {
      openSidebarBtn.classList.toggle('is-playing-audio', anyAudioPlaying && eqEnabled);
      openSidebarBtn.title = anyAudioPlaying
        ? '▶ Audio playing in Left Sidebar — Click to open Left Sidebar (Alt+Shift+M)'
        : 'Dock to Firefox Left Sidebar (Alt+Shift+M)';
      let badgeEl = openSidebarBtn.querySelector('.pm-rail-eq-badge');
      if (anyAudioPlaying && eqEnabled) {
        if (!badgeEl) {
          badgeEl = createEqualizerBadge(false);
          openSidebarBtn.style.position = 'relative';
          openSidebarBtn.appendChild(badgeEl);
        }
      } else if (badgeEl) {
        badgeEl.remove();
      }
    }

    if (!appsListEl) return;

    let draggedAppId = null;

    const handleAppReorderDrop = (sourceId, targetId) => {
      if (!sourceId || !targetId || sourceId === targetId) return;
      const allBuiltIn = mediaApi.getOrderedBuiltInApps
        ? mediaApi.getOrderedBuiltInApps(st.appSettings)
        : mediaApi.BUILTIN_MEDIA_APPS;
      const customs = Array.isArray(st.appSettings.customMediaApps) ? st.appSettings.customMediaApps : [];
      const customIds = customs.map((c, idx) => c.id || `custom-${idx}`);
      const fullOrder = [...allBuiltIn.map((a) => a.id), ...customIds];
      const uniqueOrder = Array.from(new Set([...(st.appSettings.mediaAppsOrder || []), ...fullOrder]));

      const fromIdx = uniqueOrder.indexOf(sourceId);
      const toIdx = uniqueOrder.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return;

      uniqueOrder.splice(fromIdx, 1);
      uniqueOrder.splice(toIdx, 0, sourceId);

      st.appSettings = { ...st.appSettings, mediaAppsOrder: uniqueOrder };
      P.renderOperaRail();
      P.saveSettingsPatch({ mediaAppsOrder: uniqueOrder });
      P.showToast('Updated pinned app order');
    };

    const activeApps = mediaApi.getActiveMediaApps(st.appSettings);
    const orderSignature = activeApps.map((a) => a.id).join(',');
    const np = P.getResolvedNowPlayingState?.();

    const syncRailItemButtonState = (btn, app, isInitialCreate) => {
      const isActive = st.activeRailAppId === app.id;
      const isPlayingAudio = P.isAppPlayingAudioNow(app.id);
      const showEq = Boolean(isPlayingAudio && eqEnabled);
      const pb = st.framePlaybackStates.get(app.id);
      const isMuted = Boolean((np && np.appId === app.id ? np.muted : false) || pb?.muted);
      const isAliveInPool =
        st.mediaFramePool.has(app.id) ||
        st.pendingSidebarAudioTakeoverSet.has(app.id) ||
        st.bgMasterAudioSet.has(app.id) ||
        isPlayingAudio;
      const unreadInfo = st.socialAppUnreadMap.get(app.id);
      const unreadCount = unreadInfo?.unreadCount || 0;
      const hasUnread = Boolean(unreadInfo?.hasUnread || unreadCount > 0);

      btn.classList.toggle('active', isActive);
      btn.classList.toggle('is-playing-audio', showEq);
      btn.classList.toggle('is-playing-muted', Boolean(showEq && isMuted));
      btn.style.setProperty('--rail-app-grad', app.gradient || app.color);
      btn.style.color = isActive ? '' : app.color || 'var(--text-primary)';

      const trackTitle = (np && np.appId === app.id ? np.title : '') || pb?.title || '';
      const trackArtist = (np && np.appId === app.id ? np.artist : '') || pb?.artist || '';
      const trackInfo =
        trackTitle && trackTitle !== app.name
          ? trackArtist
            ? `${trackTitle} · ${trackArtist}`
            : trackTitle
          : '';

      if (isPlayingAudio) {
        btn.title =
          `▶ ${app.name}${trackInfo ? ` — ${trackInfo}` : ' — Playing Audio'}` +
          (quickEnabled ? '\nClick equalizer or middle-click: Play/Pause · Shift+Middle-click: Mute' : '');
      } else if (isAliveInPool) {
        btn.title =
          `${app.name}${trackInfo ? ` (${trackInfo})` : ''}${unreadCount > 0 ? ` (${unreadCount} new)` : ''} | Active in background` +
          (quickEnabled ? ' · Middle-click: Play' : '');
      } else {
        btn.title = `${app.name} | Click to open, Drag to reorder, Right-click to remove/options`;
      }

      let unreadBadge = btn.querySelector('.pm-rail-social-badge');
      const prevCount = Number(btn.dataset.lastUnreadCount || 0);
      const hadUnread = btn.dataset.hadUnread === '1';
      if (hasUnread) {
        const nextBadgeText = unreadCount > 0 ? (unreadCount > 99 ? '99+' : String(unreadCount)) : '';
        if (!unreadBadge) {
          unreadBadge = document.createElement('span');
          unreadBadge.className = `pm-rail-social-badge ${unreadCount <= 0 ? 'dot-only' : ''} ${!isInitialCreate && !hadUnread ? 'is-badge-pop' : ''}`.trim();
          unreadBadge.textContent = nextBadgeText;
          btn.appendChild(unreadBadge);
        } else {
          unreadBadge.classList.toggle('dot-only', unreadCount <= 0);
          if (unreadBadge.textContent !== nextBadgeText) unreadBadge.textContent = nextBadgeText;
          if (unreadCount > prevCount) {
            unreadBadge.classList.remove('is-badge-pop');
            void unreadBadge.offsetWidth;
            unreadBadge.classList.add('is-badge-pop');
          }
        }
        btn.dataset.hadUnread = '1';
        btn.dataset.lastUnreadCount = String(unreadCount);
      } else {
        if (unreadBadge) unreadBadge.remove();
        btn.dataset.hadUnread = '0';
        btn.dataset.lastUnreadCount = '0';
      }

      let eqBadge = btn.querySelector('.pm-rail-eq-badge');
      let liveDot = btn.querySelector('.pm-rail-live-dot');
      if (showEq) {
        if (liveDot) liveDot.remove();
        if (!eqBadge) {
          eqBadge = createEqualizerBadge(quickEnabled);
          eqBadge.title = quickEnabled ? 'Click: Play/Pause · Shift+Click: Mute' : 'Playing Audio';
          btn.appendChild(eqBadge);
        } else {
          eqBadge.classList.toggle('is-no-quick-ctrl', !quickEnabled);
          eqBadge.title = quickEnabled ? 'Click: Play/Pause · Shift+Click: Mute' : 'Playing Audio';
        }
      } else {
        if (eqBadge) eqBadge.remove();
        if (isAliveInPool) {
          if (!liveDot) {
            liveDot = document.createElement('span');
            liveDot.className = 'pm-rail-live-dot';
            btn.appendChild(liveDot);
          }
        } else if (liveDot) {
          liveDot.remove();
        }
      }
    };

    if (appsListEl.dataset.renderedOrder === orderSignature && appsListEl.children.length === activeApps.length) {
      activeApps.forEach((app, idx) => {
        const existingBtn = appsListEl.children[idx];
        if (existingBtn) syncRailItemButtonState(existingBtn, app, false);
      });
      return;
    }

    appsListEl.dataset.renderedOrder = orderSignature;
    appsListEl.replaceChildren();

    activeApps.forEach((app) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pm-rail-item';
      btn.draggable = true;
      btn.dataset.appId = app.id;
      btn.appendChild(mediaApi.createAppSvgIcon(app.id, 17));
      syncRailItemButtonState(btn, app, true);

      btn.addEventListener('dragstart', (e) => {
        draggedAppId = app.id;
        btn.classList.add('is-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', app.id); } catch (_) {}
        }
      });

      btn.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (draggedAppId && draggedAppId !== app.id && !btn.classList.contains('drag-over-target')) {
          btn.classList.add('drag-over-target');
        }
      });

      btn.addEventListener('dragleave', () => btn.classList.remove('drag-over-target'));

      btn.addEventListener('drop', (e) => {
        e.preventDefault();
        btn.classList.remove('drag-over-target');
        const srcId = draggedAppId || e.dataTransfer?.getData('text/plain');
        if (srcId && srcId !== app.id) handleAppReorderDrop(srcId, app.id);
      });

      btn.addEventListener('dragend', () => {
        draggedAppId = null;
        btn.classList.remove('is-dragging', 'drag-over-target');
      });

      btn.addEventListener(
        'mouseenter',
        () => P.ensureOriginPreconnected?.(app.defaultUrl, app.id),
        { passive: true }
      );

      btn.addEventListener('mousedown', (e) => {
        if (e.button === 1 && st.appSettings.railQuickControlsEnabled !== false) {
          e.preventDefault();
        }
      });

      btn.addEventListener('auxclick', (e) => {
        if (e.button !== 1) return;
        if (st.appSettings.railQuickControlsEnabled === false) return;
        const canControl =
          app.category === 'music' ||
          app.bgAudioSupported ||
          P.isAppPlayingAudioNow(app.id) ||
          st.mediaFramePool.has(app.id);
        if (!canControl) return;
        e.preventDefault();
        e.stopPropagation();
        P.sendNowPlayingCommand?.(app.id, e.shiftKey ? 'mute_toggle' : 'play_pause');
      });

      btn.addEventListener('click', (e) => {
        if (e.target.closest('.pm-rail-eq-badge') && st.appSettings.railQuickControlsEnabled !== false) {
          e.preventDefault();
          e.stopPropagation();
          const cmd = e.shiftKey ? 'mute_toggle' : 'play_pause';
          P.sendNowPlayingCommand?.(app.id, cmd);
          return;
        }
        const mode = st.appSettings.sidebarOpenMode || 'auto';
        if (mode === 'window') {
          P.closeHeaderMoreMenu?.();
          const floatUrl = browser.runtime.getURL(`src/popup/popup.html?sidebar=1&app=${encodeURIComponent(app.id)}`);
          browser.runtime.sendMessage({ type: 'OPEN_COMPANION_WINDOW', url: floatUrl });
          return;
        }
        if (!st.IS_SIDEBAR_VIEW) {
          document.documentElement.classList.add('show-popup-rail');
        }
        P.openMediaWorkspace?.(app);
      });

      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        P.openRailAppContextMenu(app, btn, e.clientY);
      });

      appsListEl.appendChild(btn);
    });

    activeApps.forEach((app) => {
      try {
        const origins = [new URL(app.defaultUrl).origin, ...(P.APP_CDN_PRECONNECT_MAP?.[app.id] || [])];
        origins.forEach((origin) => {
          const dnsKey = `dns:${origin}`;
          if (!st.preconnectedOrigins.has(dnsKey) && document.head) {
            st.preconnectedOrigins.add(dnsKey);
            const dnsLink = document.createElement('link');
            dnsLink.rel = 'dns-prefetch';
            dnsLink.href = origin;
            document.head.appendChild(dnsLink);
          }
        });
      } catch (_) {}
    });
  };

  P.bindLeftRailEvents = function () {
    const st = P.state;

    document.getElementById('rail-btn-mail')?.addEventListener('click', () => {
      P.closeHeaderMoreMenu?.();
      P.closeMutePopover?.();
      P.closeRailContextMenu?.();
      st.activeRailAppId = 'pocketmail';
      st.activeSidebarHubSection = '';
      P.hideMediaWorkspaceKeepAlive?.();
      P.setDrawerOpen(P.dom.mediaAppsDrawer, false);
      st.settingsUiHandle?.stopIntervals?.();
      P.syncSidebarHubRailButtons?.();
      P.renderOperaRail();
      P.renderNowPlayingBar?.();
      P.syncPersistentSessionToBackground?.('pocketmail', '', null, true);
      P.triggerSilentMailSync?.(2500);
    });

    document.getElementById('rail-btn-open-sidebar')?.addEventListener('click', P.openFirefoxLeftSidebar);
    document.getElementById('btn-open-firefox-sidebar-top')?.addEventListener('click', P.openFirefoxLeftSidebar);
    document.getElementById('btn-open-full-settings-drawer')?.addEventListener('click', () => {
      browser.runtime.openOptionsPage();
    });
    document.getElementById('rail-btn-night-mode')?.addEventListener('click', () => P.toggleTrueNightMode?.());

    document.getElementById('rail-btn-mute-notifs')?.addEventListener('click', (e) => {
      e.stopPropagation();
      P.toggleMutePopover(e.currentTarget);
    });

    document.getElementById('chk-mute-all')?.addEventListener('change', async (e) => {
      const wantAll = Boolean(e.target.checked);
      await P.saveSettingsPatch({
        muteEmailNotifications: wantAll,
        muteSiteNotifications: wantAll,
        socialAppNotifySounds: !wantAll,
        dndUntil: 0,
        muteSitesUntil: 0,
        lastMuteTimerMins: 0
      });
      P.syncMuteUiControls();
      P.renderHeaderStatus();
      P.broadcastMuteAndShortcutsConfig?.();
      P.showToast(wantAll ? 'Muted All Notifications (Email & Sites)' : 'Unmuted All Notifications');
    });

    document.getElementById('chk-mute-email')?.addEventListener('change', async (e) => {
      const wantEmail = Boolean(e.target.checked);
      const keepSitesTimer = st.appSettings.muteSitesUntil && st.appSettings.muteSitesUntil > Date.now();
      await P.saveSettingsPatch({
        muteEmailNotifications: wantEmail,
        dndUntil: 0,
        lastMuteTimerMins: keepSitesTimer ? st.appSettings.lastMuteTimerMins || 0 : 0
      });
      P.syncMuteUiControls();
      P.renderHeaderStatus();
      P.showToast(wantEmail ? 'Muted Email Notifications, Chimes & Voice' : 'Unmuted Email Notifications');
    });

    document.getElementById('chk-mute-sites')?.addEventListener('change', async (e) => {
      const wantSites = Boolean(e.target.checked);
      const keepEmailTimer = st.appSettings.dndUntil && st.appSettings.dndUntil > Date.now();
      await P.saveSettingsPatch({
        muteSiteNotifications: wantSites,
        socialAppNotifySounds: !wantSites,
        muteSitesUntil: 0,
        lastMuteTimerMins: keepEmailTimer ? st.appSettings.lastMuteTimerMins || 0 : 0
      });
      P.syncMuteUiControls();
      P.renderHeaderStatus();
      P.broadcastMuteAndShortcutsConfig?.();
      P.showToast(wantSites ? 'Muted Sites Notifications & App Chimes' : 'Unmuted Sites Notifications');
    });

    document.querySelectorAll('.pm-mute-timer-pill[data-mute-mins]').forEach((pill) => {
      pill.addEventListener('click', async (e) => {
        e.stopPropagation();
        const mins = parseInt(pill.getAttribute('data-mute-mins') || '60', 10) || 60;
        const until = Date.now() + mins * 60 * 1000;
        const emailMuted = P.isEmailMutedNow();
        const sitesMuted = P.isSitesMutedNow();
        let patch;
        let scopeLbl = 'All notifications';
        if (emailMuted && !sitesMuted) {
          patch = { muteEmailNotifications: false, dndUntil: until, lastMuteTimerMins: mins };
          scopeLbl = 'Email notifications';
        } else if (sitesMuted && !emailMuted) {
          patch = { muteSiteNotifications: false, socialAppNotifySounds: true, muteSitesUntil: until, lastMuteTimerMins: mins };
          scopeLbl = 'Sites notifications';
        } else {
          patch = {
            muteEmailNotifications: false,
            muteSiteNotifications: false,
            socialAppNotifySounds: true,
            dndUntil: until,
            muteSitesUntil: until,
            lastMuteTimerMins: mins
          };
          scopeLbl = 'All notifications';
        }
        await P.saveSettingsPatch(patch);
        P.syncMuteUiControls();
        P.renderHeaderStatus();
        P.broadcastMuteAndShortcutsConfig?.();
        const durText = mins < 60 ? `${mins} min` : `${mins / 60} hr${mins > 60 ? 's' : ''}`;
        P.showToast(`${scopeLbl} muted for ${durText}`);
      });
    });

    document.getElementById('btn-mute-timer-clear')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await P.saveSettingsPatch({ dndUntil: 0, muteSitesUntil: 0, lastMuteTimerMins: 0 });
      P.syncMuteUiControls();
      P.renderHeaderStatus();
      P.broadcastMuteAndShortcutsConfig?.();
      P.showToast('Cleared mute timer — notifications active');
    });

    document.addEventListener('mousedown', (e) => {
      const pop = document.getElementById('pm-mute-popover');
      if (!pop || pop.classList.contains('hidden')) return;
      const t = e.target;
      if (t && !pop.contains(t) && !t.closest('#rail-btn-mute-notifs')) {
        P.closeMutePopover();
      }
    });

    window.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
          P.closeMutePopover();
        }
      }, 0);
    });

    document.getElementById('rail-btn-manage-apps')?.addEventListener('click', () => {
      P.openSidebarHubDrawer?.('apps');
    });

    document.getElementById('rail-btn-sidebar-settings')?.addEventListener('click', () => {
      P.hideSettingsGearCoachmark?.(true);
      P.openSidebarHubDrawer?.('settings');
    });

    document.getElementById('btn-dismiss-settings-coachmark')?.addEventListener('click', (e) => {
      e.stopPropagation();
      P.hideSettingsGearCoachmark?.(false);
    });

    document.getElementById('pm-settings-coachmark-body')?.addEventListener('click', () => {
      P.hideSettingsGearCoachmark?.(true);
      P.openSidebarHubDrawer?.('settings');
    });

    document.getElementById('btn-media-apps-back')?.addEventListener('click', () => {
      P.closeSidebarHubDrawer?.();
    });
  };
})(typeof window !== 'undefined' ? window : this);
