/**
 * FoxHub — Popup Shared Namespace, Mutable State, Pure-DOM SVG Helpers & Mute/Settings Utilities
 */

(function (global) {
  const P = (global.FoxHubPopup = global.FoxHubPopup || {});
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const IS_POPOUT_VIEW = window.location.search.includes('popout=1');
  const initialSidebar =
    window.location.search.includes('sidebar=1') || (!IS_POPOUT_VIEW && window.innerHeight > 605);

  P.state = {
    appState: {
      accounts: [],
      totalUnread: 0,
      lastSyncAt: 0,
      usingDemo: false,
      sentMessages: []
    },
    appSettings: {},
    snoozedMap: {},
    selectedAccountEmail: 'ALL',
    activeFilter: 'unread',
    searchQuery: '',
    activeReaderMessage: null,
    activeRailAppId: 'pocketmail',
    activeMediaUrl: '',
    activeSidebarHubSection: '',
    IS_POPOUT_VIEW,
    IS_SIDEBAR_VIEW: initialSidebar,
    sidebarLifecyclePort: null,
    sidebarInitCompleted: false,
    currentAudibleBgAppId: null,
    bgNowPlayingState: null,
    isAutoPausedByExternalTab: false,
    lastDetectedAutoplayPolicy: 'allowed',
    lastPersistentPlaybackSyncAt: 0,
    pendingGmailAutoSendResolver: null,
    activeShortcutRecorderCleanup: null,
    isSpeakingNow: false,
    readerZoom: 100,
    autoFitEmail: true,
    settingsUiHandle: null,
    mediaFramePool: new Map(),
    hibernatedAppUrls: new Map(),
    knownOpenPersistentIds: new Set(),
    preconnectedOrigins: new Set(),
    framePlaybackStates: new Map(),
    pendingSidebarAudioTakeoverSet: new Set(),
    bgMasterAudioSet: new Set(),
    pendingTakeoverMeta: new Map(),
    trackUrlTitleMap: new Map(),
    sidebarMsePlayers: new Map(),
    socialAppUnreadMap: new Map()
  };

  P.dom = {
    statusSubtitle: document.getElementById('pm-status-subtitle'),
    accountsBar: document.getElementById('pm-accounts-bar'),
    demoBanner: document.getElementById('pm-demo-banner'),
    emailListEl: document.getElementById('pm-email-list'),
    searchInput: document.getElementById('pm-search-input'),
    chipSnoozedLabel: document.getElementById('chip-snoozed-label'),
    ttsBar: document.getElementById('pm-tts-bar'),
    ttsLabel: document.getElementById('pm-tts-label'),
    toastEl: document.getElementById('pm-toast'),
    readerDrawer: document.getElementById('pm-reader-drawer'),
    themeDrawer: document.getElementById('pm-theme-drawer'),
    accountDrawer: document.getElementById('pm-account-drawer'),
    composeDrawer: document.getElementById('pm-compose-drawer'),
    mediaWorkspace: document.getElementById('pm-media-workspace'),
    mediaAppsDrawer: document.getElementById('pm-media-apps-drawer'),
    mediaFramePoolEl: document.getElementById('pm-media-frame-pool')
  };

  P.setDrawerOpen = function (drawerEl, isOpen, opts = {}) {
    if (!drawerEl) return;
    if (isOpen) {
      if (drawerEl !== P.dom.mediaWorkspace) {
        P.hideSettingsGearCoachmark?.(false);
      }
      drawerEl.classList.remove('hidden', 'pm-workspace-keepalive');
      drawerEl.setAttribute('aria-hidden', 'false');
      return;
    }
    if (drawerEl.contains(document.activeElement)) {
      try { document.activeElement.blur(); } catch (_) {}
    }
    if (opts && opts.keepAlive) {
      drawerEl.classList.add('hidden', 'pm-workspace-keepalive');
    } else {
      drawerEl.classList.remove('pm-workspace-keepalive');
      drawerEl.classList.add('hidden');
    }
    drawerEl.setAttribute('aria-hidden', 'true');
  };

  P.getThemesApi = () => global.FoxHubThemes || global.PocketMailThemes || null;
  P.getAppsApi = () => global.FoxHubMediaApps || global.PocketMailMediaApps || null;
  P.getGmailApi = () => global.FoxHubGmailClient || global.PocketMailGmailClient || null;
  P.getIconsApi = () => global.FoxHubSenderIcons || global.PocketMailSenderIcons || null;
  P.getSoundApi = () => global.FoxHubSound || global.PocketMailSound || null;
  P.getSchemaApi = () => global.FoxHubSettingsSchema || global.PocketMailSettingsSchema || null;
  P.getSettingsUiApi = () => global.FoxHubSettingsUI || global.FoxHubSettingsUi || null;

  P.isShortcutRecordingActive = () =>
    Boolean(P.state.activeShortcutRecorderCleanup || P.getSettingsUiApi()?.isRecording?.());

  P.syncViewportModeAttributes = function () {
    const root = document.documentElement;
    if (!P.state.IS_POPOUT_VIEW && window.innerHeight > 605) {
      P.state.IS_SIDEBAR_VIEW = true;
    }
    if (P.state.IS_SIDEBAR_VIEW || P.state.IS_POPOUT_VIEW) {
      root.setAttribute('data-popout', 'true');
      root.style.setProperty('--popup-width', '100%');
      root.style.setProperty('--popup-height', '100vh');
    }
    if (P.state.IS_SIDEBAR_VIEW) {
      root.setAttribute('data-sidebar', 'true');
      root.setAttribute('data-view-mode', 'sidebar');
    } else {
      root.setAttribute('data-view-mode', 'popup');
    }
    if ((window.innerWidth || 0) > 480) {
      P.closeHeaderMoreMenu?.();
    }
    P.syncSettingsGearCoachmarkPosition?.();
  };
  P.syncViewportModeAttributes();
  window.addEventListener('resize', P.syncViewportModeAttributes);

  P.createSvgIcon = function (key, size = 14) {
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
      Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
      return node;
    };

    switch (key) {
      case 'starFilled':
        svg.setAttribute('fill', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.appendChild(el('polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }));
        break;
      case 'starOutline':
        svg.setAttribute('stroke-width', '2');
        svg.appendChild(el('polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }));
        break;
      case 'copy':
        svg.setAttribute('stroke-width', '2.2');
        svg.appendChild(el('rect', { x: 9, y: 9, width: 13, height: 13, rx: 2, ry: 2 }));
        svg.appendChild(el('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }));
        break;
      case 'speaker':
        svg.setAttribute('stroke-width', '2.2');
        svg.appendChild(el('polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' }));
        svg.appendChild(el('path', { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' }));
        break;
      case 'check':
        svg.setAttribute('stroke-width', '2.4');
        svg.appendChild(el('polyline', { points: '20 6 9 17 4 12' }));
        break;
      case 'archive':
        svg.setAttribute('stroke-width', '2.2');
        svg.appendChild(el('polyline', { points: '21 8 21 21 3 21 3 8' }));
        svg.appendChild(el('rect', { x: 1, y: 3, width: 22, height: 5 }));
        svg.appendChild(el('line', { x1: 10, y1: 12, x2: 14, y2: 12 }));
        break;
      case 'clock':
        svg.setAttribute('stroke-width', '2.2');
        svg.appendChild(el('circle', { cx: 12, cy: 12, r: 10 }));
        svg.appendChild(el('polyline', { points: '12 6 12 12 16 14' }));
        break;
      case 'trash':
        svg.setAttribute('stroke-width', '2.2');
        svg.appendChild(el('polyline', { points: '3 6 5 6 21 6' }));
        svg.appendChild(el('path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }));
        break;
      case 'plus':
        svg.setAttribute('stroke-width', '2.5');
        svg.appendChild(el('line', { x1: 12, y1: 5, x2: 12, y2: 19 }));
        svg.appendChild(el('line', { x1: 5, y1: 12, x2: 19, y2: 12 }));
        break;
      case 'restore':
        svg.setAttribute('stroke-width', '2.3');
        svg.appendChild(el('polyline', { points: '1 4 1 10 7 10' }));
        svg.appendChild(el('path', { d: 'M3.51 15a9 9 0 1 0 2.13-9.36L1 10' }));
        break;
      case 'external':
        svg.setAttribute('stroke-width', '2.3');
        svg.appendChild(el('line', { x1: 7, y1: 17, x2: 17, y2: 7 }));
        svg.appendChild(el('polyline', { points: '7 7 17 7 17 17' }));
        break;
      case 'emptyCoffee':
        svg.setAttribute('stroke-width', '1.9');
        svg.appendChild(el('path', { d: 'M18 8h1a4 4 0 0 1 0 8h-1' }));
        svg.appendChild(el('path', { d: 'M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z' }));
        svg.appendChild(el('line', { x1: 6, y1: 1, x2: 6, y2: 4 }));
        svg.appendChild(el('line', { x1: 10, y1: 1, x2: 10, y2: 4 }));
        svg.appendChild(el('line', { x1: 14, y1: 1, x2: 14, y2: 4 }));
        break;
      case 'emptyStar':
        svg.setAttribute('stroke-width', '1.9');
        svg.appendChild(el('polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }));
        break;
      case 'emptyClock':
        svg.setAttribute('stroke-width', '1.9');
        svg.appendChild(el('circle', { cx: 12, cy: 12, r: 10 }));
        svg.appendChild(el('polyline', { points: '12 6 12 12 16 14' }));
        break;
      default:
        svg.appendChild(el('circle', { cx: 12, cy: 12, r: 9 }));
        break;
    }
    return svg;
  };

  P.showToast = function (text, duration = 2200) {
    const toastEl = P.dom.toastEl;
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    clearTimeout(P.showToast._timer);
    P.showToast._timer = setTimeout(() => {
      toastEl.classList.add('hidden');
    }, duration);
  };

  P.formatRelativeTime = function (timestamp) {
    if (!timestamp) return '';
    const diffSec = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  P.getInitials = function (name, email) {
    const src = (name || email || '?').trim();
    const parts = src.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return src.slice(0, 2).toUpperCase();
  };

  P.escapeHtml = function (str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  P.isEmailMutedNow = function () {
    const s = P.state.appSettings;
    return Boolean(s.muteEmailNotifications || (s.dndUntil && s.dndUntil > Date.now()));
  };

  P.isSitesMutedNow = function () {
    const s = P.state.appSettings;
    return Boolean(
      s.muteSiteNotifications ||
        s.socialAppNotifySounds === false ||
        (s.muteSitesUntil && s.muteSitesUntil > Date.now())
    );
  };

  P.formatMuteTimerRemaining = function (untilTs) {
    const diffMs = Math.max(0, (Number(untilTs) || 0) - Date.now());
    if (diffMs <= 0) return '';
    const totalMins = Math.max(1, Math.ceil(diffMs / 60000));
    if (totalMins < 60) return `${totalMins}m left`;
    const hrs = Math.floor(totalMins / 60);
    const remMins = totalMins % 60;
    return remMins > 0 ? `${hrs}h ${remMins}m left` : `${hrs}h left`;
  };

  P.syncMuteUiControls = function () {
    const s = P.state.appSettings;
    const now = Date.now();
    const emailMuted = P.isEmailMutedNow();
    const sitesMuted = P.isSitesMutedNow();
    const allMuted = emailMuted && sitesMuted;
    const anyMuted = emailMuted || sitesMuted;

    const emailTimerActive = Boolean(s.dndUntil && s.dndUntil > now && !s.muteEmailNotifications);
    const sitesTimerActive = Boolean(
      s.muteSitesUntil && s.muteSitesUntil > now && !s.muteSiteNotifications && s.socialAppNotifySounds !== false
    );
    const activeTimerUntil = Math.max(
      emailTimerActive ? Number(s.dndUntil) || 0 : 0,
      sitesTimerActive ? Number(s.muteSitesUntil) || 0 : 0
    );
    const timerText = activeTimerUntil > now ? P.formatMuteTimerRemaining(activeTimerUntil) : '';

    const statusLabel = allMuted
      ? `All Notifications Muted${timerText ? ` (${timerText})` : ''} (Click to manage)`
      : emailMuted
        ? `Email Notifications Muted${timerText ? ` (${timerText})` : ''} (Click to manage)`
        : sitesMuted
          ? `Sites Notifications Muted${timerText ? ` (${timerText})` : ''} (Click to manage)`
          : 'Mute Notifications (All, Email, or Sites)';

    const railMuteBtn = document.getElementById('rail-btn-mute-notifs');
    if (railMuteBtn) {
      railMuteBtn.classList.toggle('is-muted-active', anyMuted);
      railMuteBtn.title = statusLabel;
    }

    const chkAll = document.getElementById('chk-mute-all');
    const chkEmail = document.getElementById('chk-mute-email');
    const chkSites = document.getElementById('chk-mute-sites');
    if (chkAll) {
      chkAll.checked = allMuted;
      chkAll.closest('.pm-mute-option-row')?.classList.toggle('is-checked', allMuted);
    }
    if (chkEmail) {
      chkEmail.checked = emailMuted;
      chkEmail.closest('.pm-mute-option-row')?.classList.toggle('is-checked', emailMuted);
    }
    if (chkSites) {
      chkSites.checked = sitesMuted;
      chkSites.closest('.pm-mute-option-row')?.classList.toggle('is-checked', sitesMuted);
    }

    const popBadge = document.getElementById('pm-mute-popover-badge');
    if (popBadge) {
      const shortTimer = timerText ? timerText.replace(' left', '') : '';
      popBadge.textContent = allMuted
        ? shortTimer
          ? `Muted (${shortTimer})`
          : 'All Muted'
        : emailMuted
          ? shortTimer
            ? `Email (${shortTimer})`
            : 'Email Muted'
          : sitesMuted
            ? shortTimer
              ? `Sites (${shortTimer})`
              : 'Sites Muted'
            : 'All Active';
      popBadge.classList.toggle('is-muted', anyMuted);
    }

    const timerRemEl = document.getElementById('pm-mute-timer-remaining');
    if (timerRemEl) timerRemEl.textContent = timerText;

    const activePresetMins = activeTimerUntil > now ? Number(s.lastMuteTimerMins) || 0 : 0;
    document.querySelectorAll('.pm-mute-timer-pill[data-mute-mins]').forEach((pill) => {
      const pMins = parseInt(pill.getAttribute('data-mute-mins') || '0', 10);
      pill.classList.toggle('active', Boolean(activeTimerUntil > now && activePresetMins === pMins));
    });

    const clearTimerBtn = document.getElementById('btn-mute-timer-clear');
    if (clearTimerBtn) {
      clearTimerBtn.classList.toggle('hidden', !(activeTimerUntil > now));
    }
  };

  P.renderHeaderStatus = function () {
    const st = P.state;
    const s = st.appSettings;
    const appState = st.appState;
    const activeAccounts = (appState.accounts || []).filter((a) => !a.disabled);
    const now = Date.now();
    const emailMuted = P.isEmailMutedNow();
    const sitesMuted = P.isSitesMutedNow();
    const emailTimerActive = Boolean(s.dndUntil && s.dndUntil > now && !s.muteEmailNotifications);
    const sitesTimerActive = Boolean(
      s.muteSitesUntil && s.muteSitesUntil > now && !s.muteSiteNotifications && s.socialAppNotifySounds !== false
    );
    const maxUntil = Math.max(
      emailTimerActive ? Number(s.dndUntil) || 0 : 0,
      sitesTimerActive ? Number(s.muteSitesUntil) || 0 : 0
    );
    const remStr = maxUntil > now ? P.formatMuteTimerRemaining(maxUntil) : '';

    P.syncMuteUiControls();

    const statusSubtitle = P.dom.statusSubtitle;
    if (statusSubtitle) {
      if (emailMuted && sitesMuted) {
        statusSubtitle.textContent = remStr
          ? `All Notifications Muted (${remStr}) • ${appState.totalUnread} unread`
          : `All Notifications Muted • ${appState.totalUnread} unread`;
      } else if (emailMuted) {
        statusSubtitle.textContent = remStr
          ? `Do Not Disturb (${remStr}) • ${appState.totalUnread} unread`
          : `Email Notifications Muted • ${appState.totalUnread} unread`;
      } else if (sitesMuted) {
        statusSubtitle.textContent = remStr
          ? `Sites Muted (${remStr}) • ${appState.totalUnread} unread`
          : `Sites Notifications Muted • ${appState.totalUnread} unread`;
      } else if (activeAccounts.length === 0) {
        statusSubtitle.textContent = 'No accounts connected yet';
      } else {
        const accWord = activeAccounts.length === 1 ? '1 account' : `${activeAccounts.length} accounts`;
        statusSubtitle.textContent = `${appState.totalUnread} unread across ${accWord}`;
      }
    }

    if (P.dom.demoBanner) {
      P.dom.demoBanner.classList.toggle('hidden', !appState.usingDemo);
    }

    const snoozedCount = Object.keys(st.snoozedMap || {}).length;
    if (P.dom.chipSnoozedLabel) {
      P.dom.chipSnoozedLabel.textContent = snoozedCount > 0 ? `Snoozed (${snoozedCount})` : 'Snoozed';
    }
    const chipSentLabel = document.getElementById('chip-sent-label');
    if (chipSentLabel) {
      const sentCount = Array.isArray(appState.sentMessages)
        ? appState.sentMessages.filter((m) => st.selectedAccountEmail === 'ALL' || m.accountEmail === st.selectedAccountEmail).length
        : 0;
      chipSentLabel.textContent = sentCount > 0 ? `Sent (${sentCount})` : 'Sent';
    }
  };

  P.getEffectiveTabAudioBehavior = function (settings = P.state.appSettings) {
    if (
      settings.tabAudioBehavior === 'pause-resume' ||
      settings.tabAudioBehavior === 'pause-only' ||
      settings.tabAudioBehavior === 'off'
    ) {
      return settings.tabAudioBehavior;
    }
    return settings.autoPauseOnTabAudio === false ? 'off' : 'pause-resume';
  };

  const FALLBACK_THEME_OR_LAYOUT_KEYS = [
    'theme', 'wallpaper', 'wallpaperOpacity', 'wallpaperBlur', 'wallpaperFit',
    'customWallpaperData', 'customWallpaperUrl', 'gradientColor1', 'gradientColor2',
    'customGradient1', 'customGradient2', 'gradientAngle', 'cardStyle', 'cardOpacity',
    'cardBlur', 'cardRadius', 'cardDensity', 'cardActionsMode', 'avatarShape',
    'showLeftAccent', 'tabStyle', 'fontStyle', 'ambientEffect', 'socialAppThemeMode',
    'popupWidth', 'popupHeight'
  ];

  const ACCOUNT_SYNC_KEYS = new Set([
    'demoMode', 'accountConfigs', 'maxAccounts', 'maxEmailsPerAccount', 'oauthAccounts'
  ]);

  P.saveSettingsPatch = async function (patch) {
    if (!patch || typeof patch !== 'object') return null;
    const st = P.state;
    const prevSettings = st.appSettings;
    const schema = P.getSchemaApi();
    st.appSettings = schema && typeof schema.normalizeSettingsPatch === 'function'
      ? schema.normalizeSettingsPatch(patch, st.appSettings)
      : { ...st.appSettings, ...patch };

    const patchKeys = Object.keys(patch);
    const touchesAccounts = patchKeys.some((k) => ACCOUNT_SYNC_KEYS.has(k));

    const applyPatchSideEffects = (syncOpts = {}) => {
      const themeKeys = new Set(schema?.THEME_OR_LAYOUT_KEYS || FALLBACK_THEME_OR_LAYOUT_KEYS);
      const touchesTheme = patchKeys.some((k) => themeKeys.has(k));
      if (touchesTheme) {
        P.getThemesApi()?.applyThemeAndWallpaper(document, st.appSettings);
      }
      if (P.dom.themeDrawer && !P.dom.themeDrawer.classList.contains('hidden')) {
        P.syncStudioControlsState?.();
        P.renderStudioLivePreview?.();
      }
      if (
        patch.enabledMediaApps !== undefined ||
        patch.mediaAppsOrder !== undefined ||
        patch.customMediaApps !== undefined ||
        patch.railPlayingIndicatorEnabled !== undefined ||
        patch.railQuickControlsEnabled !== undefined
      ) {
        P.renderOperaRail?.();
      }
      if (patchKeys.some((k) => k.startsWith('miniNowPlaying'))) {
        P.renderNowPlayingBar?.();
      }
      if (patch.mediaTopBarMode !== undefined || patch.autoHideMediaTopBar !== undefined) {
        P.syncMediaTopBarAutoHideState?.();
      }
      if (patch.hideMediaBottomBar !== undefined && st.activeRailAppId && st.activeRailAppId !== 'pocketmail') {
        const app = P.getAppsApi()?.getAppById(st.activeRailAppId, st.appSettings);
        if (app) P.renderMediaBottomBar?.(app);
      }
      if (syncOpts.syncAccounts) {
        P.renderHeaderStatus();
        P.renderAccountsBar?.();
        P.renderEmailList?.();
      }
      if (syncOpts.syncDrawer) {
        P.syncSettingsDrawerUi?.({ force: Boolean(syncOpts.force) });
      }
    };

    const rollbackSettings = async (errMsg) => {
      try {
        const fresh = await browser.runtime.sendMessage({ type: 'GET_STATE' });
        if (fresh && fresh.state) st.appState = fresh.state;
        st.appSettings = (fresh && fresh.settings) ? fresh.settings : prevSettings;
      } catch (_) {
        st.appSettings = prevSettings;
      }
      P.syncMuteUiControls?.();
      applyPatchSideEffects({ syncAccounts: touchesAccounts, syncDrawer: true, force: true });
      P.showToast('Could not persist settings: ' + (errMsg || 'background rejected update'));
      return { ok: false, rolledBack: true };
    };

    applyPatchSideEffects();

    const sendPromise = browser.runtime
      .sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: patch
      })
      .then((res) => {
        if (!res || res.ok === false) {
          return rollbackSettings(res && res.error);
        }
        if (res && res.settings) st.appSettings = res.settings;
        if (res && res.state) st.appState = res.state;
        if (touchesAccounts) {
          P.renderHeaderStatus();
          P.renderAccountsBar?.();
          P.renderEmailList?.();
        }
        P.syncSettingsDrawerUi?.();
        return res;
      })
      .catch((err) => rollbackSettings(err && err.message));

    if (touchesAccounts) {
      await sendPromise;
    }
    return sendPromise;
  };
})(typeof window !== 'undefined' ? window : this);
