/**
 * FoxHub Background — Shared State, Storage Normalization, Mute Timers & Toolbar Badge
 */

(function (global) {
  const bg = (global.FoxHubBg = global.FoxHubBg || {});
  const schema = global.FoxHubSettingsSchema;
  const DEFAULT_SETTINGS = schema.DEFAULT_SETTINGS;

  bg.DEFAULT_SETTINGS = DEFAULT_SETTINGS;

  bg.state = {
    currentSettings: schema.normalizeSettings({}),
    cachedState: {
      accounts: [],
      totalUnread: 0,
      sentMessages: [],
      lastSyncAt: 0,
      usingDemo: false,
      syncError: null
    },
    localOverlay: {
      overlayVersion: 2,
      readIds: {},
      trashedIds: {},
      archivedIds: {},
      starredIds: {},
      snoozed: {},
      seenIds: {},
      sentMessages: []
    },
    isFirstSync: true,
    pollTimer: null,
    activeLoginWindowId: null,
    pendingSettingsSaveTimer: null,
    bypassPersistentCacheUntil: 0,
    pendingShortcutLaunch: null,
    pendingContextUrl: null,
    sidebarPortCount: 0,
    popupPortCount: 0,
    lastAlarmWakePulseAt: 0,
    alarmWakePulseCount: 0,
    lastHeartbeatBroadcastAt: 0,
    heartbeatBroadcastCount: 0,
    bgWebAudioKeepaliveCtx: null,
    bgWebAudioGainNode: null,
    bgWebAudioOscNode: null,
    bgSpInstanceCounter: 0,
    standbySpotifyPrewarmTimer: null,
    lastBgAudioIndicatorKey: '',
    cachedSidebarPlayingImageData: null,
    lastWatchdogTabPollAt: 0,
    lastShortcutLaunchAt: 0,
    lastShortcutLaunchAppId: '',
    lastSidebarPlayIntentAt: 0
  };

  bg.knownUnreadIds = new Set();
  bg.resolvedOtpCache = new Map();
  bg.companionWindowIds = new Set();
  bg.companionTabIds = new Set();
  bg.registerCompanionWindow = function registerCompanionWindow(win) {
    if (!win || !win.id) return;
    bg.companionWindowIds.add(win.id);
    if (Array.isArray(win.tabs)) {
      win.tabs.forEach((t) => {
        if (t && typeof t.id === 'number') {
          bg.companionTabIds.add(t.id);
        }
      });
    }
  };

  bg.liveMediaPlaybackState = new Map();
  bg.bgAudioPool = new Map();
  bg.bgStandbyPool = new Map();
  bg.sidebarHasAppendedSpChunks = new Map();
  bg.bgMsePlayers = new Map();
  bg.bgSpEmePlayers = new Map();
  bg.bgStagingSpPlayers = new Map();
  bg.bgNextSpPlayers = new Map();
  bg.bgSpCachedMeta = new Map();
  bg.emeBridgePorts = new Map();
  bg.bgAudioDiagLog = [];
  bg.slotToAppIdMap = new Map();
  bg.trackUrlOriginalTitleMap = new Map();

  bg.recordTrackUrlOriginalTitle = function recordTrackUrlOriginalTitle(appId, rawUrl, rawTitle) {
    if (appId !== 'spotify' || !rawUrl || !rawTitle) return;
    const cleanTitle = String(rawTitle).trim();
    if (!cleanTitle || cleanTitle.toLowerCase() === 'spotify') return;
    try {
      const u = new URL(String(rawUrl));
      const p = (u.pathname || '').replace(/\/+$/, '');
      if (!/^\/track\/[^/]+$/i.test(p)) return;
      const key = `${appId}:${p}`;
      if (!bg.trackUrlOriginalTitleMap.has(key)) {
        bg.trackUrlOriginalTitleMap.set(key, cleanTitle);
        if (bg.trackUrlOriginalTitleMap.size > 40) {
          const firstKey = bg.trackUrlOriginalTitleMap.keys().next().value;
          if (firstKey) bg.trackUrlOriginalTitleMap.delete(firstKey);
        }
      }
    } catch (_) {}
  };

  bg.tabAudio = {
    isAutoPausedByTabAudio: false,
    manualOverrideWhileTabAudible: false,
    lastExternalTabAudioCheckAt: 0,
    pendingTabResumeTimer: null,
    silentMediaRecheckTimer: null,
    knownActiveMediaTabIds: new Set(),
    recentlyStoppedMediaTabMap: new Map(),
    silentTabHoldSince: new Map(),
    audibleOverrideTabIds: new Set(),
    tabAutoPausedSpAppIds: new Set(),
    tabAutoPausedMseAppIds: new Set(),
    lastLoggedDrainIgnoreMap: new Map()
  };

  async function loadStorage() {
    const data = await browser.storage.local.get(['settings', 'localOverlay', 'cachedState']);
    if (data.settings) {
      const normalized = schema.normalizeSettings(data.settings);
      bg.state.currentSettings = normalized;
      const needsMigrationSave =
        !data.settings.topBarAutoHideMigratedV1 ||
        !data.settings.persistenceDefaultOffMigratedV4 ||
        !data.settings.bgAudioAppIdsMigratedV1 ||
        !data.settings.bgAudioAppIdsSoundCloudMigratedV2 ||
        (data.settings.muteSiteNotifications === undefined && data.settings.socialAppNotifySounds === false) ||
        (data.settings.muteSiteNotifications === true && data.settings.socialAppNotifySounds !== false);
      if (needsMigrationSave) {
        await browser.storage.local.set({ settings: bg.state.currentSettings });
      }
    } else {
      bg.state.currentSettings = schema.normalizeSettings({});
      await browser.storage.local.set({ settings: bg.state.currentSettings });
    }

    if (data.localOverlay) {
      const isUpgraded = data.localOverlay.overlayVersion === 2;
      bg.state.localOverlay = {
        overlayVersion: 2,
        readIds: isUpgraded ? (data.localOverlay.readIds || {}) : {},
        trashedIds: data.localOverlay.trashedIds || {},
        archivedIds: data.localOverlay.archivedIds || {},
        starredIds: data.localOverlay.starredIds || {},
        snoozed: data.localOverlay.snoozed || {},
        seenIds: data.localOverlay.seenIds || {},
        sentMessages: Array.isArray(data.localOverlay.sentMessages) ? data.localOverlay.sentMessages : []
      };
      Object.keys(bg.state.localOverlay.seenIds || {}).forEach((id) => bg.knownUnreadIds.add(id));
      if (!isUpgraded) {
        await browser.storage.local.set({ localOverlay: bg.state.localOverlay });
      }
    }

    if (data.cachedState) {
      bg.state.cachedState = data.cachedState;
      (bg.state.cachedState.accounts || []).forEach((acc) => {
        (acc.messages || []).forEach((m) => {
          bg.knownUnreadIds.add(m.id);
          if (bg.state.localOverlay.seenIds) bg.state.localOverlay.seenIds[m.id] = Date.now();
          if (typeof global.PocketMailGmailClient !== 'undefined' && global.PocketMailGmailClient.extractVerificationCode) {
            m.otpCode = global.PocketMailGmailClient.extractVerificationCode(m.subject, m.fullText || m.snippet) || null;
          }
        });
      });
    }
  }

  async function saveOverlay() {
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    const overlay = bg.state.localOverlay;
    for (const mapName of ['readIds', 'trashedIds', 'archivedIds', 'seenIds']) {
      if (!overlay[mapName]) overlay[mapName] = {};
      for (const [id, ts] of Object.entries(overlay[mapName])) {
        if (ts < cutoff) delete overlay[mapName][id];
      }
    }
    if (Array.isArray(overlay.sentMessages) && overlay.sentMessages.length > 100) {
      overlay.sentMessages = overlay.sentMessages.slice(0, 100);
    }
    overlay.overlayVersion = 2;
    await browser.storage.local.set({ localOverlay: overlay });
  }

  function scheduleSettingsSave(immediate = false) {
    if (immediate) {
      if (bg.state.pendingSettingsSaveTimer) {
        clearTimeout(bg.state.pendingSettingsSaveTimer);
        bg.state.pendingSettingsSaveTimer = null;
      }
      browser.storage.local.set({ settings: bg.state.currentSettings }).catch(() => {});
      return;
    }
    if (bg.state.pendingSettingsSaveTimer) return;
    bg.state.pendingSettingsSaveTimer = setTimeout(() => {
      bg.state.pendingSettingsSaveTimer = null;
      browser.storage.local.set({ settings: bg.state.currentSettings }).catch(() => {});
    }, 2500);
  }

  function isDndActive() {
    const s = bg.state.currentSettings;
    return Boolean(s.dndUntil && s.dndUntil > Date.now());
  }

  function isSitesTimedMuteActive() {
    const s = bg.state.currentSettings;
    return Boolean(s.muteSitesUntil && s.muteSitesUntil > Date.now());
  }

  function isEmailNotificationsMuted() {
    const s = bg.state.currentSettings;
    return Boolean(isDndActive() || s.muteEmailNotifications);
  }

  function isSiteNotificationsMuted() {
    const s = bg.state.currentSettings;
    return Boolean(
      isSitesTimedMuteActive() ||
        s.muteSiteNotifications ||
        s.socialAppNotifySounds === false
    );
  }

  function broadcastStateUpdated() {
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
      browser.runtime
        .sendMessage({
          type: 'STATE_UPDATED',
          state: bg.state.cachedState,
          settings: bg.state.currentSettings,
          snoozed: bg.state.localOverlay.snoozed,
          snoozedCount: Object.keys(bg.state.localOverlay.snoozed || {}).length
        })
        .catch(() => {});
    }
  }

  function updateToolbarBadge() {
    try {
      const s = bg.state.currentSettings;
      const cs = bg.state.cachedState;
      const themes = global.PocketMailThemes;
      const themeObj = themes && themes.THEMES ? (themes.THEMES[s.theme] || themes.THEMES['warm-linen']) : null;
      const badgeBg = themeObj ? (themeObj.vars['--badge-bg'] || '#D95032') : '#D95032';

      if (isDndActive() || isSitesTimedMuteActive()) {
        browser.browserAction.setBadgeText({ text: 'DND' });
        browser.browserAction.setBadgeBackgroundColor({ color: '#6E5A4F' });
      } else if (cs.totalUnread > 0) {
        const badgeStr = cs.totalUnread > 99 ? '99+' : String(cs.totalUnread);
        browser.browserAction.setBadgeText({ text: badgeStr });
        browser.browserAction.setBadgeBackgroundColor({ color: badgeBg });
      } else {
        browser.browserAction.setBadgeText({ text: '' });
      }

      const emailMutedNow = isEmailNotificationsMuted();
      const sitesMutedNow = isSiteNotificationsMuted();
      const muteSuffix =
        emailMutedNow && sitesMutedNow
          ? ' (All Muted)'
          : emailMutedNow
            ? ' (Email Muted)'
            : sitesMutedNow
              ? ' (Sites Muted)'
              : '';
      const lines = [`FoxHub Mail: ${cs.totalUnread} unread${muteSuffix}`];
      (cs.accounts || []).forEach((acc) => {
        if (!acc.disabled) {
          const label = acc.nickname ? `${acc.nickname} (${acc.email})` : acc.email;
          lines.push(`• ${label}: ${acc.unreadCount}`);
        }
      });
      if (cs.usingDemo) {
        lines.push('(Sample Preview Inbox: Click "+ Add Account" to sign into Gmail)');
      }
      browser.browserAction.setTitle({ title: lines.join('\n') });
    } catch (_) {}
  }

  function checkExpiredMuteTimers() {
    const now = Date.now();
    const s = bg.state.currentSettings;
    let expiredChanged = false;
    if (s.dndUntil && s.dndUntil > 0 && s.dndUntil <= now) {
      s.dndUntil = 0;
      expiredChanged = true;
    }
    if (s.muteSitesUntil && s.muteSitesUntil > 0 && s.muteSitesUntil <= now) {
      s.muteSitesUntil = 0;
      expiredChanged = true;
    }
    if (expiredChanged) {
      if (!isDndActive() && !isSitesTimedMuteActive()) {
        s.lastMuteTimerMins = 0;
      }
      scheduleSettingsSave(true);
      updateToolbarBadge();
      broadcastStateUpdated();
    }
  }
  setInterval(checkExpiredMuteTimers, 10000);

  function resolveAppIdForHostname(hostname) {
    if (!hostname) return '';
    const mediaApps = global.FoxHubMediaApps || global.PocketMailMediaApps;
    if (mediaApps && typeof mediaApps.resolveAppIdForHostname === 'function') {
      return mediaApps.resolveAppIdForHostname(hostname, bg.state.currentSettings);
    }
    return '';
  }

  function isAppAllowedForPersistence(appId) {
    if (!appId || appId === 'pocketmail') return false;
    const mode = bg.state.currentSettings.persistenceMode || 'selected';
    if (mode === 'all') return true;
    if (mode === 'selected') {
      const list = Array.isArray(bg.state.currentSettings.persistentAppIds)
        ? bg.state.currentSettings.persistentAppIds
        : [];
      return list.includes(appId);
    }
    return false;
  }

  function isAppAllowedForBgAudio(appId) {
    if (!appId || appId === 'pocketmail') return false;
    if (bg.state.currentSettings.keepAudioPlayingWhenClosed === false) return false;
    const allowed = Array.isArray(bg.state.currentSettings.bgAudioAppIds)
      ? bg.state.currentSettings.bgAudioAppIds
      : ['spotify', 'youtube', 'soundcloud'];
    return allowed.includes(appId);
  }

  function isPersistentCacheableAppFrame(parsedUrl) {
    if (!parsedUrl || Date.now() < bg.state.bypassPersistentCacheUntil) return false;
    if (parsedUrl.searchParams.has('pm_boot') || parsedUrl.searchParams.has('pm_reload')) return false;
    const h = (parsedUrl.hostname || '').toLowerCase();
    const p = (parsedUrl.pathname || '/').toLowerCase();
    if (
      h === 'accounts.google.com' ||
      h === 'mail.google.com' ||
      h === 'accounts.spotify.com' ||
      p === '/login' ||
      p.startsWith('/login/') ||
      p === '/signin' ||
      p.startsWith('/signin/') ||
      p === '/logout' ||
      p.startsWith('/logout/') ||
      p.startsWith('/oauth') ||
      p.startsWith('/auth/') ||
      p.startsWith('/i/flow/') ||
      p.startsWith('/accounts/login') ||
      p.startsWith('/challenge') ||
      p.startsWith('/checkpoint')
    ) {
      return false;
    }
    const matchedAppId = resolveAppIdForHostname(h);
    if (!matchedAppId) return false;
    return isAppAllowedForPersistence(matchedAppId);
  }

  bg.loadStorage = loadStorage;
  bg.saveOverlay = saveOverlay;
  bg.scheduleSettingsSave = scheduleSettingsSave;
  bg.isDndActive = isDndActive;
  bg.isSitesTimedMuteActive = isSitesTimedMuteActive;
  bg.isEmailNotificationsMuted = isEmailNotificationsMuted;
  bg.isSiteNotificationsMuted = isSiteNotificationsMuted;
  bg.checkExpiredMuteTimers = checkExpiredMuteTimers;
  bg.updateToolbarBadge = updateToolbarBadge;
  bg.broadcastStateUpdated = broadcastStateUpdated;
  bg.resolveAppIdForHostname = resolveAppIdForHostname;
  bg.isAppAllowedForPersistence = isAppAllowedForPersistence;
  bg.isAppAllowedForBgAudio = isAppAllowedForBgAudio;
  bg.isPersistentCacheableAppFrame = isPersistentCacheableAppFrame;
})(window);
