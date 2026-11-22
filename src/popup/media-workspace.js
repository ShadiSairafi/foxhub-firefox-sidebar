/**
 * FoxHub — Embedded Media & Social Workspace Controller
 * Keep-Alive Multi-Frame Pool, 21-App CDN Preconnect, SPA Navigation, Ad-Hoc URL Launch & Custom UA Reload
 */

(function (global) {
  const P = (global.FoxHubPopup = global.FoxHubPopup || {});
  const MAX_KEEPALIVE_FRAMES = 4;

  // Covers all 21 built-in apps in FoxHubMediaApps.BUILTIN_MEDIA_APPS
  P.APP_CDN_PRECONNECT_MAP = {
    instagram: ['https://www.instagram.com', 'https://static.cdninstagram.com', 'https://scontent.cdninstagram.com'],
    whatsapp: ['https://web.whatsapp.com', 'https://static.whatsapp.net'],
    discord: ['https://discord.com', 'https://cdn.discordapp.com'],
    telegram: ['https://web.telegram.org'],
    spotify: ['https://open.spotify.com', 'https://accounts.spotify.com', 'https://open.spotifycdn.com', 'https://i.scdn.co'],
    youtube: ['https://www.youtube.com', 'https://i.ytimg.com', 'https://music.youtube.com'],
    tiktok: ['https://www.tiktok.com', 'https://sf16-website-login.neutral.ttwstatic.com'],
    x: ['https://x.com', 'https://abs.twimg.com', 'https://pbs.twimg.com'],
    messenger: ['https://www.messenger.com', 'https://www.facebook.com', 'https://static.xx.fbcdn.net'],
    reddit: ['https://www.reddit.com', 'https://chat.reddit.com', 'https://www.redditstatic.com'],
    twitch: ['https://www.twitch.tv', 'https://static.twitchcdn.net'],
    chatgpt: ['https://chatgpt.com', 'https://cdn.oaistatic.com'],
    gemini: ['https://gemini.google.com', 'https://www.gstatic.com'],
    claude: ['https://claude.ai'],
    perplexity: ['https://www.perplexity.ai'],
    soundcloud: ['https://soundcloud.com', 'https://a-v2.sndcdn.com', 'https://i1.sndcdn.com'],
    'apple-music': ['https://music.apple.com', 'https://is1-ssl.mzstatic.com'],
    bluesky: ['https://bsky.app', 'https://bsky.social', 'https://cdn.bsky.app'],
    notion: ['https://www.notion.so'],
    'google-calendar': ['https://calendar.google.com', 'https://www.gstatic.com'],
    'google-keep': ['https://keep.google.com', 'https://www.gstatic.com']
  };

  P.addSidebarHash = function (urlStr) {
    try {
      const u = new URL(urlStr);
      if (!u.hash) u.hash = 'pm-sidebar';
      return u.toString();
    } catch (_) {
      return urlStr;
    }
  };

  P.ensureOriginPreconnected = function (rawUrl, appId = '') {
    const st = P.state;
    if (!document.head) return;
    const originsToWarm = [];
    if (rawUrl) {
      try {
        originsToWarm.push(new URL(rawUrl).origin);
      } catch (_) {}
    }
    if (appId && P.APP_CDN_PRECONNECT_MAP[appId]) {
      originsToWarm.push(...P.APP_CDN_PRECONNECT_MAP[appId]);
    }
    const extraOrigins = P.getAppsApi()?.getPreconnectOrigins?.(appId, st.appSettings);
    if (Array.isArray(extraOrigins)) {
      originsToWarm.push(...extraOrigins);
    }
    originsToWarm.forEach((origin) => {
      if (!origin || st.preconnectedOrigins.has(origin)) return;
      st.preconnectedOrigins.add(origin);
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = origin;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });
    if (rawUrl || appId) {
      browser.runtime
        .sendMessage({
          type: 'PREWARM_APP_SESSION',
          url: rawUrl || (appId && P.APP_CDN_PRECONNECT_MAP[appId]?.[0]) || ''
        })
        .catch(() => {});
    }
  };

  P.getSocialAppAccentColor = function () {
    const themesApi = P.getThemesApi();
    const s = P.state.appSettings;
    if (themesApi && themesApi.THEMES) {
      const themeObj = themesApi.THEMES[s.theme || 'warm-linen'];
      if (themeObj) {
        return themeObj.accent || themeObj.accentDot || themeObj.vars?.['--accent'] || '#D96B43';
      }
    }
    return '#D96B43';
  };

  P.buildMediaFrameWindowName = function (appId, appObj = null) {
    const s = P.state.appSettings;
    const themeMode = s.socialAppThemeMode || 'native';
    const accentColor = P.getSocialAppAccentColor();
    const app = appObj || P.getAppsApi()?.getAppById?.(appId, s);
    const uaMode = app && app.id === appId && app.userAgentMode ? app.userAgentMode : 'default';
    const uaSuffix = uaMode !== 'default' ? `__pmua=${encodeURIComponent(uaMode)}` : '';
    return `pm-media-frame-${appId}__pmt=${encodeURIComponent(themeMode)}__pma=${encodeURIComponent(accentColor)}${uaSuffix}`;
  };

  P.broadcastSocialAppTheme = function (prevThemeMode = null) {
    const st = P.state;
    const s = st.appSettings;
    const themeMode = s.socialAppThemeMode || 'native';
    const accentColor = P.getSocialAppAccentColor();
    const isDarkNow = themeMode === 'true-night' || themeMode === 'midnight-oled';
    const wasDarkBefore =
      prevThemeMode !== null ? prevThemeMode === 'true-night' || prevThemeMode === 'midnight-oled' : isDarkNow;
    const osDark = Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const isDarkTheme = Boolean(P.getThemesApi()?.THEMES?.[s.theme]?.isDark);
    const wantIframeDark =
      isDarkNow || (themeMode !== 'native' && isDarkTheme) || (themeMode === 'native' && osDark);
    document.documentElement.setAttribute('data-social-dark', wantIframeDark ? 'true' : 'false');

    st.mediaFramePool.forEach((entry) => {
      if (entry.frame) {
        entry.frame.name = P.buildMediaFrameWindowName(entry.appId);
        if (
          prevThemeMode !== null &&
          isDarkNow !== wasDarkBefore &&
          entry.appId === 'x' &&
          entry.loaded &&
          st.activeRailAppId === 'x'
        ) {
          const xApp = P.getAppsApi()?.getAppById('x', s);
          if (xApp) P.showMediaBrandLoader(xApp, entry.frame, true);
        }
        if (entry.frame.contentWindow) {
          try {
            entry.frame.contentWindow.postMessage(
              {
                target: 'pocketmail-media-frame',
                cmd: 'APPLY_APP_THEME',
                themeMode,
                accentColor,
                customVideoLoadbar: s.customVideoLoadbar !== false,
                videoLoadbarStyle: s.videoLoadbarStyle || 'sunset',
                videoLoadbarColor: s.videoLoadbarColor || '#FF3366',
                videoLoadbarSize: s.videoLoadbarSize || 'normal'
              },
              '*'
            );
          } catch (_) {}
        }
      }
    });
  };

  P.broadcastVideoLoadbarConfig = function () {
    const st = P.state;
    const s = st.appSettings;
    const accentColor = P.getSocialAppAccentColor();
    st.mediaFramePool.forEach((entry) => {
      if (entry.frame && entry.frame.contentWindow) {
        try {
          entry.frame.contentWindow.postMessage(
            {
              target: 'pocketmail-media-frame',
              cmd: 'APPLY_LOADBAR_CONFIG',
              accentColor,
              customVideoLoadbar: s.customVideoLoadbar !== false,
              videoLoadbarStyle: s.videoLoadbarStyle || 'sunset',
              videoLoadbarColor: s.videoLoadbarColor || '#FF3366',
              videoLoadbarSize: s.videoLoadbarSize || 'normal'
            },
            '*'
          );
        } catch (_) {}
      }
    });
  };

  P.broadcastMuteAndShortcutsConfig = function () {
    const st = P.state;
    const s = st.appSettings;
    const sitesMuted = P.isSitesMutedNow();
    st.mediaFramePool.forEach((entry) => {
      if (entry.frame && entry.frame.contentWindow) {
        try {
          entry.frame.contentWindow.postMessage(
            {
              target: 'pocketmail-media-frame',
              cmd: 'APPLY_MUTE_CONFIG',
              muteSiteNotifications: sitesMuted,
              socialAppNotifySounds: !sitesMuted,
              muteSitesUntil: s.muteSitesUntil || 0,
              globalShortcuts: s.globalShortcuts || {},
              appShortcuts: s.appShortcuts || {},
              appShortcutOpenMode: s.appShortcutOpenMode || 'sidebar',
              quickSwitcherEnabled: s.quickSwitcherEnabled !== false,
              quickSwitcherShortcut: s.quickSwitcherShortcut || 'Ctrl+K'
            },
            '*'
          );
        } catch (_) {}
      }
    });
  };

  P.isTransientAuthOrBootUrl = function (url) {
    if (!url || typeof url !== 'string') return true;
    if (url.includes('pm_boot=1')) return true;
    try {
      const u = new URL(url);
      const p = (u.pathname || '/').toLowerCase();
      const h = (u.hostname || '').toLowerCase();
      if (
        p === '/login' ||
        p.startsWith('/login/') ||
        p === '/signin' ||
        p.startsWith('/signin/') ||
        p.startsWith('/i/flow/login') ||
        p.startsWith('/accounts/login') ||
        h === 'accounts.google.com' ||
        h === 'accounts.spotify.com' ||
        (h.includes('tiktok.com') && (p.includes('/video/') || p.includes('/photo/')))
      ) {
        return true;
      }
    } catch (_) {
      return true;
    }
    return false;
  };

  P.isAppPersistent = function (appId) {
    if (!appId || appId === 'pocketmail' || appId.startsWith('adhoc-')) return false;
    const s = P.state.appSettings;
    const mode = s.persistenceMode || 'selected';
    if (mode === 'all') return true;
    if (mode === 'selected') {
      const list = Array.isArray(s.persistentAppIds) ? s.persistentAppIds : [];
      return list.includes(appId);
    }
    return false;
  };

  P.enforceMediaPoolMemoryCap = function (protectedAppId) {
    const st = P.state;
    while (st.mediaFramePool.size >= MAX_KEEPALIVE_FRAMES) {
      let oldestId = null;
      let oldestScore = Infinity;

      st.mediaFramePool.forEach((entry, id) => {
        if (id === protectedAppId || id === st.activeRailAppId) return;
        const pb = st.framePlaybackStates.get(id);
        const isActivelyPlayingAudio =
          P.isAppAllowedForBgAudio(id) &&
          ((pb && pb.isPlaying) ||
            st.pendingSidebarAudioTakeoverSet.has(id) ||
            st.bgMasterAudioSet.has(id) ||
            st.currentAudibleBgAppId === id);
        const persistBonus = P.isAppPersistent(id) ? 60000 : 0;
        const audioBonus = isActivelyPlayingAudio ? 600000 : 0;
        const score = (entry.lastUsedAt || 0) + persistBonus + audioBonus;
        if (score < oldestScore) {
          oldestScore = score;
          oldestId = id;
        }
      });

      if (!oldestId) break;
      const victim = st.mediaFramePool.get(oldestId);
      st.mediaFramePool.delete(oldestId);
      if (victim) {
        if (!oldestId.startsWith('adhoc-') && victim.currentUrl && !victim.currentUrl.includes('pm_boot=1')) {
          st.hibernatedAppUrls.set(oldestId, victim.currentUrl);
        }
        try {
          victim.frame.remove();
          victim.frame.src = 'about:blank';
        } catch (_) {}
      }
    }
  };

  P.getActivePoolEntry = function () {
    return P.state.mediaFramePool.get(P.state.activeRailAppId) || null;
  };

  P.getOrCreateMediaFrame = function (app) {
    const st = P.state;
    let entry = st.mediaFramePool.get(app.id);
    if (!entry && P.dom.mediaFramePoolEl) {
      if (!st.IS_POPOUT_VIEW && !st.sidebarLifecyclePort) {
        try {
          if (browser.runtime && typeof browser.runtime.connect === 'function') {
            const lifecyclePortName = st.IS_SIDEBAR_VIEW ? 'foxhub-sidebar-lifecycle' : 'foxhub-popup-lifecycle';
            st.sidebarLifecyclePort = browser.runtime.connect({ name: lifecyclePortName });
          }
        } catch (_) {}
      }
      P.enforceMediaPoolMemoryCap(app.id);
      const iframe = document.createElement('iframe');
      iframe.className = 'pm-media-frame';
      iframe.dataset.appId = app.id;
      iframe.name = P.buildMediaFrameWindowName(app.id, app);
      iframe.allowFullscreen = true;
      iframe.setAttribute('allowfullscreen', 'true');
      iframe.setAttribute(
        'allow',
        'autoplay *; encrypted-media *; clipboard-write *; picture-in-picture *; microphone; camera; fullscreen *'
      );

      entry = {
        appId: app.id,
        frame: iframe,
        restoredUrl: st.hibernatedAppUrls.get(app.id) || '',
        currentUrl: '',
        hasNavigated: false,
        loaded: false,
        autoResumeSentAt: 0,
        zoom: 1.0,
        lastUsedAt: Date.now(),
        lastNavAt: Date.now()
      };

      iframe.addEventListener('load', () => {
        if (!entry.hasNavigated) return;
        if (entry.bootingSwClean) {
          entry.bootingSwClean = false;
          return;
        }
        entry.loaded = true;
        try {
          window.localStorage.setItem(`pm_app_warmed_${app.id}`, '1');
        } catch (_) {}
        if (st.activeRailAppId === app.id) {
          P.hideMediaBrandLoader(iframe);
        } else {
          iframe.classList.remove('is-loading');
        }
      });

      P.dom.mediaFramePoolEl.appendChild(iframe);
      st.mediaFramePool.set(app.id, entry);

      if ((app.id === 'spotify' || app.id === 'youtube' || app.bgAudioSupported || P.isAppAllowedForBgAudio(app.id)) && !st.IS_POPOUT_VIEW) {
        const takeoverAppId = app.id;
        let hasBgActive = Boolean(
          st.currentAudibleBgAppId === takeoverAppId ||
            st.bgMasterAudioSet.has(takeoverAppId) ||
            (st.bgNowPlayingState && st.bgNowPlayingState.appId === takeoverAppId && st.bgNowPlayingState.isPlaying)
        );
        try {
          const bgWin =
            browser.extension && typeof browser.extension.getBackgroundPage === 'function'
              ? browser.extension.getBackgroundPage()
              : null;
          if (bgWin?.FoxHubBg?.bgAudioPool?.has(takeoverAppId)) {
            hasBgActive = true;
          }
        } catch (_) {}
        if (hasBgActive) {
          st.pendingSidebarAudioTakeoverSet.add(takeoverAppId);
        }
        browser.runtime
          .sendMessage({ type: 'SIDEBAR_SP_TAKEOVER_BEGIN', appId: takeoverAppId })
          .then((res) => {
            if (!st.mediaFramePool.has(takeoverAppId)) {
              st.pendingSidebarAudioTakeoverSet.delete(takeoverAppId);
              return;
            }
            if (res && res.bgMasterActive) {
              st.bgMasterAudioSet.add(takeoverAppId);
              st.pendingSidebarAudioTakeoverSet.delete(takeoverAppId);
              P.renderOperaRail?.();
              return;
            }
            st.bgMasterAudioSet.delete(takeoverAppId);
            if (res && res.resume) {
              if (res.trackTitle || res.resumeUrl || typeof res.currentTime === 'number') {
                const prevMeta = st.pendingTakeoverMeta.get(takeoverAppId) || {};
                st.pendingTakeoverMeta.set(takeoverAppId, {
                  ...prevMeta,
                  trackTitle: res.trackTitle || prevMeta.trackTitle || '',
                  artist: res.artist || prevMeta.artist || '',
                  currentTime: typeof res.currentTime === 'number' ? res.currentTime : (prevMeta.currentTime || 0),
                  duration: typeof res.duration === 'number' ? res.duration : (prevMeta.duration || 0),
                  resumeUrl: res.resumeUrl || prevMeta.resumeUrl || '',
                  handedOffAt:
                    typeof res.handedOffAt === 'number' && res.handedOffAt > 0
                      ? res.handedOffAt
                      : prevMeta.handedOffAt || 0
                });
              }
              if (st.activeRailAppId !== takeoverAppId) {
                // User already switched away before takeover began — abort cleanly so background audio stays master!
                st.pendingSidebarAudioTakeoverSet.add(takeoverAppId);
                P.abortIncompleteSidebarAudioTakeover?.(st.activeRailAppId);
                return;
              }
              st.pendingSidebarAudioTakeoverSet.add(takeoverAppId);
              if (entry.loaded && (!entry.autoResumeSentAt || Date.now() - entry.autoResumeSentAt > 4000)) {
                entry.autoResumeSentAt = Date.now();
                try {
                  iframe.contentWindow?.postMessage(
                    P.buildAutoResumePayload
                      ? P.buildAutoResumePayload(takeoverAppId)
                      : { target: 'pocketmail-media-frame', cmd: 'AUTO_RESUME_PLAYBACK' },
                    '*'
                  );
                } catch (_) {}
              }
            } else {
              st.pendingSidebarAudioTakeoverSet.delete(takeoverAppId);
            }
          })
          .catch(() => {});
      }
    } else if (entry) {
      entry.lastUsedAt = Date.now();
    }
    return entry;
  };

  P.abortIncompleteSidebarAudioTakeover = function (exceptAppId = '') {
    const st = P.state;
    const pendingIds = Array.from(st.pendingSidebarAudioTakeoverSet);
    pendingIds.forEach((pendingId) => {
      if (!pendingId || pendingId === exceptAppId) return;
      st.pendingSidebarAudioTakeoverSet.delete(pendingId);
      st.bgMasterAudioSet.add(pendingId);
      const staleEntry = st.mediaFramePool.get(pendingId);
      if (staleEntry) {
        st.mediaFramePool.delete(pendingId);
        if (staleEntry.currentUrl && !P.isTransientAuthOrBootUrl?.(staleEntry.currentUrl)) {
          st.hibernatedAppUrls.set(pendingId, staleEntry.currentUrl);
        }
        try {
          staleEntry.frame.contentWindow?.postMessage(
            { target: 'pocketmail-media-frame', cmd: 'PREPARE_HANDOFF_UNLOAD' },
            '*'
          );
        } catch (_) {}
        try {
          staleEntry.frame.remove();
          staleEntry.frame.src = 'about:blank';
        } catch (_) {}
      }
      browser.runtime
        .sendMessage({ type: 'ABORT_SIDEBAR_SP_TAKEOVER', appId: pendingId })
        .catch(() => {});
    });
  };

  P.switchActiveMediaFrame = function (appId) {
    const st = P.state;
    P.abortIncompleteSidebarAudioTakeover(appId);
    st.mediaFramePool.forEach((entry, id) => {
      if (id === appId) {
        entry.suppressedWhileInactive = false;
        entry.frame.classList.add('is-active');
        return;
      }
      entry.frame.classList.remove('is-active');
      if (!P.isAppAllowedForBgAudio(id)) {
        entry.suppressedWhileInactive = true;
        const pb = st.framePlaybackStates.get(id);
        if (pb && pb.isPlaying) pb.isPlaying = false;
        P.cleanupSidebarMsePlayer(id);
        browser.runtime
          .sendMessage({ type: 'STOP_SINGLE_BG_AUDIO_APP', appId: id, clearPlaybackState: true })
          .catch(() => {});
        try {
          entry.frame.contentWindow?.postMessage(
            { target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' },
            '*'
          );
        } catch (_) {}
      }
    });
  };

  P.closeMediaAppFrame = function (appId) {
    const st = P.state;
    const entry = st.mediaFramePool.get(appId);
    st.mediaFramePool.delete(appId);
    st.knownOpenPersistentIds.delete(appId);
    st.framePlaybackStates.delete(appId);
    st.pendingSidebarAudioTakeoverSet.delete(appId);
    st.bgMasterAudioSet.delete(appId);
    if (st.currentAudibleBgAppId === appId) st.currentAudibleBgAppId = null;
    P.cleanupSidebarMsePlayer(appId);
    P.cleanupSidebarSpEmePlayer(appId);
    browser.runtime
      .sendMessage({ type: 'STOP_SINGLE_BG_AUDIO_APP', appId, clearPlaybackState: true })
      .catch(() => {});
    if (entry) {
      try {
        entry.frame.remove();
        entry.frame.src = 'about:blank';
      } catch (_) {}
    }
    if (st.activeRailAppId === appId) {
      st.activeRailAppId = 'pocketmail';
      P.hideMediaWorkspaceKeepAlive();
    }
    P.saveFastBootCache();
    P.renderOperaRail?.();
    P.renderNowPlayingBar?.();
  };

  P.hideMediaWorkspaceKeepAlive = function () {
    const st = P.state;
    const mediaWorkspace = P.dom.mediaWorkspace;
    if (!mediaWorkspace) return;
    P.abortIncompleteSidebarAudioTakeover('');
    st.mediaFramePool.forEach((entry, id) => {
      if (!P.isAppAllowedForBgAudio(id)) {
        entry.suppressedWhileInactive = true;
        const pb = st.framePlaybackStates.get(id);
        if (pb && pb.isPlaying) pb.isPlaying = false;
        P.cleanupSidebarMsePlayer(id);
        browser.runtime
          .sendMessage({ type: 'STOP_SINGLE_BG_AUDIO_APP', appId: id, clearPlaybackState: true })
          .catch(() => {});
        try {
          entry.frame.contentWindow?.postMessage(
            { target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' },
            '*'
          );
        } catch (_) {}
      }
    });
    P.setDrawerOpen(mediaWorkspace, false, { keepAlive: st.mediaFramePool.size > 0 });
    P.renderNowPlayingBar?.();
  };

  P.sendCommandToMediaFrame = function (cmd, extra = {}) {
    const entry = P.getActivePoolEntry();
    const frameEl = entry?.frame;
    if (frameEl && frameEl.contentWindow) {
      try {
        frameEl.contentWindow.postMessage(
          {
            target: 'pocketmail-media-frame',
            cmd,
            ...extra
          },
          '*'
        );
      } catch (_) {}
    }
  };

  P.getActiveSubViewIndex = function (subViews, currentUrl) {
    if (!Array.isArray(subViews) || subViews.length === 0 || !currentUrl) return 0;

    let curUrlObj = null;
    try {
      curUrlObj = new URL(currentUrl);
    } catch (_) {
      return 0;
    }

    const curHost = curUrlObj.hostname.toLowerCase();
    const curPath = curUrlObj.pathname.replace(/\/+$/, '').toLowerCase() || '/';
    const curHash = curUrlObj.hash.toLowerCase();
    const normCur = currentUrl.replace(/\/+$/, '').toLowerCase();

    if (curHost.includes('tiktok.com')) {
      const isTikTokVideoItem = curPath.includes('/video/') || curPath.includes('/photo/');
      if ((!isTikTokVideoItem && curPath.startsWith('/@')) || curPath === '/profile' || curUrlObj.searchParams.has('pm_goto_profile')) {
        const profIdx = subViews.findIndex((sv) => sv && (sv.icon === 'profile' || sv.url.endsWith('/profile')));
        if (profIdx >= 0) return profIdx;
      }
      if (isTikTokVideoItem || curPath === '/' || curPath === '/foryou' || curPath.startsWith('/foryou/')) {
        const fyIdx = subViews.findIndex(
          (sv) => sv && (sv.url.endsWith('/foryou') || sv.label.toLowerCase() === 'for you')
        );
        if (fyIdx >= 0) return fyIdx;
      }
    }

    if (curHost.includes('spotify.com')) {
      if (curHash === '#library' || curPath.startsWith('/collection')) {
        const libIdx = subViews.findIndex(
          (sv) => sv && (sv.url.includes('#library') || sv.url.includes('/collection') || sv.icon === 'library')
        );
        if (libIdx >= 0) return libIdx;
      }
      if (curPath.startsWith('/search')) {
        const sIdx = subViews.findIndex((sv) => sv && sv.url.includes('/search'));
        if (sIdx >= 0) return sIdx;
      }
    }

    if (curHost.includes('discord.com')) {
      if (curPath === '/channels/@me' || curPath.startsWith('/channels/@me/')) {
        const dmIdx = subViews.findIndex((sv) => sv && sv.url.includes('/channels/@me'));
        if (dmIdx >= 0) return dmIdx;
      }
      if (curPath.toLowerCase().startsWith('/guild-discovery')) {
        const discIdx = subViews.findIndex((sv) => sv && sv.url.toLowerCase().includes('guild-discovery'));
        if (discIdx >= 0) return discIdx;
      }
    }

    if (curHost.includes('instagram.com')) {
      if (curPath.startsWith('/direct')) {
        const dmIdx = subViews.findIndex((sv) => sv && sv.url.includes('/direct'));
        if (dmIdx >= 0) return dmIdx;
      }
      if (curPath === '/reels' || curPath.startsWith('/reels/')) {
        const rIdx = subViews.findIndex((sv) => sv && sv.url.includes('/reels'));
        if (rIdx >= 0) return rIdx;
      }
      if (curPath.startsWith('/explore')) {
        const exIdx = subViews.findIndex((sv) => sv && sv.url.includes('/explore'));
        if (exIdx >= 0) return exIdx;
      }
      if (
        curPath === '/profile' ||
        curUrlObj.searchParams.has('pm_goto_profile') ||
        (curPath !== '/' &&
          !curPath.startsWith('/direct') &&
          !curPath.startsWith('/reels') &&
          !curPath.startsWith('/explore') &&
          !curPath.startsWith('/stories'))
      ) {
        const profIdx = subViews.findIndex((sv) => sv && (sv.icon === 'profile' || sv.url.endsWith('/profile')));
        if (profIdx >= 0) return profIdx;
      }
    }

    if (curHost.includes('x.com') || curHost.includes('twitter.com')) {
      if (curPath === '/' || curPath === '/home') {
        if (curUrlObj.searchParams.has('pm_goto_profile')) {
          const profIdx = subViews.findIndex((sv) => sv && (sv.icon === 'profile' || sv.url.endsWith('/profile')));
          if (profIdx >= 0) return profIdx;
        }
        const homeIdx = subViews.findIndex((sv) => sv && sv.url.endsWith('/home'));
        if (homeIdx >= 0) return homeIdx;
      } else if (curPath.startsWith('/explore') || curPath.startsWith('/search')) {
        const exIdx = subViews.findIndex((sv) => sv && sv.url.includes('/explore'));
        if (exIdx >= 0) return exIdx;
      } else if (curPath.startsWith('/notifications')) {
        const notifIdx = subViews.findIndex((sv) => sv && sv.url.includes('/notifications'));
        if (notifIdx >= 0) return notifIdx;
      } else if (curPath.startsWith('/messages') || curPath.startsWith('/i/chat')) {
        const msgIdx = subViews.findIndex((sv) => sv && sv.url.includes('/messages'));
        if (msgIdx >= 0) return msgIdx;
      } else {
        const profIdx = subViews.findIndex((sv) => sv && (sv.icon === 'profile' || sv.url.endsWith('/profile')));
        if (profIdx >= 0) return profIdx;
      }
    }

    let bestIdx = -1;
    let bestScore = -1;

    subViews.forEach((sv, idx) => {
      if (!sv || !sv.url) return;
      try {
        const svUrlObj = new URL(sv.url);
        const svHost = svUrlObj.hostname.toLowerCase();
        const svPath = svUrlObj.pathname.replace(/\/+$/, '').toLowerCase() || '/';
        const svHash = svUrlObj.hash.toLowerCase();
        if (svHost !== curHost) return;
        if (svHash && svHash !== curHash) return;
        if (curPath === svPath || (svPath !== '/' && curPath.startsWith(svPath + '/'))) {
          const score = svPath.length * 10 + (svHash ? svHash.length * 20 : 0);
          if (score > bestScore) {
            bestScore = score;
            bestIdx = idx;
          }
        }
      } catch (_) {
        const normSv = sv.url.replace(/\/+$/, '').toLowerCase();
        if (normCur === normSv || normCur.startsWith(normSv + '/') || normCur.startsWith(normSv + '?')) {
          if (normSv.length > bestScore) {
            bestScore = normSv.length;
            bestIdx = idx;
          }
        }
      }
    });

    return bestIdx >= 0 ? bestIdx : 0;
  };

  P.applyFrameViewportZoom = function (entry, newZoom) {
    if (!entry || !entry.frame) return;
    const z = Math.max(0.5, Math.min(1.35, Number(newZoom) || 1.0));
    entry.zoom = z;
    const frame = entry.frame;
    if (Math.abs(z - 1.0) < 0.025) {
      frame.style.width = '100%';
      frame.style.height = '100%';
      frame.style.transform = 'none';
      frame.style.transformOrigin = '0 0';
    } else {
      const invPct = (100 / z).toFixed(3);
      frame.style.width = `${invPct}%`;
      frame.style.height = `${invPct}%`;
      frame.style.transform = `scale(${z})`;
      frame.style.transformOrigin = '0 0';
    }
    const fitBtn = document.getElementById('btn-media-zoom-fit');
    if (fitBtn && entry.appId === P.state.activeRailAppId) {
      fitBtn.textContent = Math.abs(z - 1.0) < 0.025 ? 'Fit' : `${Math.round(z * 100)}%`;
    }
  };

  let mediaLoaderSafetyTimer = null;
  P.showMediaBrandLoader = function (app, frameEl, isFastCachedRestore = false) {
    const loaderEl = document.getElementById('pm-media-loader');
    const loaderIconEl = document.getElementById('pm-media-loader-icon');
    const loaderTitleEl = document.getElementById('pm-media-loader-title');
    const loaderSubEl = loaderEl?.querySelector('.pm-media-loader-sub');
    const targetFrame = frameEl || P.getActivePoolEntry()?.frame;
    const appsApi = P.getAppsApi();

    if (loaderEl && app) {
      loaderEl.style.setProperty('--loader-accent', app.color || '#D96B43');
      loaderEl.style.setProperty('--loader-grad', app.gradient || app.color || 'linear-gradient(135deg,#D96B43,#B84A27)');
      loaderEl.classList.remove('hidden-loader');
    }
    if (loaderIconEl && app && appsApi) {
      loaderIconEl.replaceChildren(appsApi.createAppSvgIcon(app.id, 22));
    }
    if (loaderTitleEl && app) {
      loaderTitleEl.textContent = isFastCachedRestore ? `Restoring ${app.name}…` : `Loading ${app.name}…`;
    }
    if (loaderSubEl) {
      loaderSubEl.textContent = isFastCachedRestore
        ? 'Instant persistent memory'
        : 'Connecting your local Firefox session';
    }
    if (targetFrame) targetFrame.classList.add('is-loading');

    clearTimeout(mediaLoaderSafetyTimer);
    mediaLoaderSafetyTimer = setTimeout(() => {
      P.hideMediaBrandLoader(targetFrame);
    }, isFastCachedRestore ? 520 : 1400);
  };

  P.hideMediaBrandLoader = function (frameEl) {
    clearTimeout(mediaLoaderSafetyTimer);
    const loaderEl = document.getElementById('pm-media-loader');
    const targetFrame = frameEl || P.getActivePoolEntry()?.frame;
    loaderEl?.classList.add('hidden-loader');
    targetFrame?.classList.remove('is-loading');
  };

  P.getTopBarMode = function () {
    const s = P.state.appSettings;
    if (s.mediaTopBarMode) return s.mediaTopBarMode;
    return s.autoHideMediaTopBar === false ? 'pinned' : 'hover';
  };

  P.syncMediaTopBarAutoHideState = function () {
    const mode = P.getTopBarMode();
    const mediaWorkspace = P.dom.mediaWorkspace;
    mediaWorkspace?.classList.toggle('autohide-top-bar', mode === 'hover');
    mediaWorkspace?.classList.toggle('disabled-top-bar', mode === 'disabled');

    const pinBtn = document.getElementById('btn-media-autohide-top');
    if (pinBtn) {
      pinBtn.classList.toggle('active', mode === 'pinned');
      pinBtn.title =
        mode === 'pinned'
          ? 'Unpin Top Bar (Set to Auto-Hide on Hover)'
          : 'Pin Top Bar Always Visible (Currently Auto-Hidden — Hover top edge to show)';
    }
  };

  let topBarHintTimer = null;
  P.maybeShowFirstTimeTopBarHint = function () {
    const st = P.state;
    if (st.appSettings.hasSeenTopBarHint || P.getTopBarMode() !== 'hover') return;
    const headerEl = P.dom.mediaWorkspace?.querySelector('.pm-media-header');
    const hintEl = document.getElementById('pm-topbar-onboarding-hint');
    if (!headerEl || !hintEl) return;

    P.saveSettingsPatch({ hasSeenTopBarHint: true });
    headerEl.classList.add('peek-hint');
    setTimeout(() => {
      headerEl.classList.remove('peek-hint');
      hintEl.classList.remove('hidden');
      clearTimeout(topBarHintTimer);
      topBarHintTimer = setTimeout(() => {
        hintEl.classList.add('hidden');
      }, 7500);
    }, 1250);
  };

  let hasShownPersistHintThisSession = false;
  P.maybeShowPersistentMemoryHint = function () {
    const st = P.state;
    if (hasShownPersistHintThisSession) return;
    const mode = st.appSettings.persistenceMode || 'selected';
    const picked = Array.isArray(st.appSettings.persistentAppIds) ? st.appSettings.persistentAppIds : [];
    if (mode === 'all' || picked.length > 0) return;

    const shownCount = Number(st.appSettings.persistentMemoryHintCount) || 0;
    if (shownCount >= 2) return;

    hasShownPersistHintThisSession = true;
    const nextCount = shownCount + 1;
    st.appSettings.persistentMemoryHintCount = nextCount;
    P.saveSettingsPatch({ persistentMemoryHintCount: nextCount });

    setTimeout(() => {
      P.showToast('Tip: Persistent Memory is off by default — you can enable it per app in the + Hub anytime.');
    }, 1600);
  };

  let hasShownSettingsGearHintThisSession = false;
  let settingsGearCoachmarkTimer = null;
  let settingsGearCoachmarkDelayTimer = null;
  let settingsGearCoachmarkCancelled = false;

  P.syncSettingsGearCoachmarkPosition = function () {
    const coachEl = document.getElementById('pm-settings-gear-coachmark');
    if (!coachEl) return;
    const npBar = document.getElementById('pm-mini-now-playing');
    const appRoot = document.getElementById('pm-app-root');
    const isBottomNpVisible = Boolean(
      npBar &&
      !npBar.classList.contains('hidden') &&
      appRoot?.getAttribute('data-np-position') !== 'top'
    );
    if (isBottomNpVisible) {
      const rect = npBar.getBoundingClientRect();
      const npHeight = rect && rect.height > 0 ? rect.height : 44;
      const clearance = Math.max(54, Math.ceil(npHeight + 10));
      coachEl.style.setProperty('--pm-coachmark-bottom', `${clearance}px`);
      coachEl.classList.add('is-above-now-playing');
    } else {
      coachEl.classList.remove('is-above-now-playing');
      coachEl.style.removeProperty('--pm-coachmark-bottom');
    }
  };

  P.hideSettingsGearCoachmark = function (markCompleted = false) {
    const st = P.state;
    clearTimeout(settingsGearCoachmarkDelayTimer);
    settingsGearCoachmarkDelayTimer = null;
    clearTimeout(settingsGearCoachmarkTimer);
    settingsGearCoachmarkTimer = null;
    settingsGearCoachmarkCancelled = true;
    document.getElementById('pm-settings-gear-coachmark')?.classList.add('hidden');
    document.getElementById('rail-btn-sidebar-settings')?.classList.remove('is-coachmark-target');
    if (markCompleted && (Number(st.appSettings.settingsGearHintCount) || 0) < 2) {
      st.appSettings.settingsGearHintCount = 2;
      P.saveSettingsPatch({ settingsGearHintCount: 2 });
    }
  };

  P.maybeShowSettingsGearCoachmark = function () {
    const st = P.state;
    if (hasShownSettingsGearHintThisSession || settingsGearCoachmarkCancelled) return;
    const shownCount = Number(st.appSettings.settingsGearHintCount) || 0;
    if (shownCount >= 2) return;
    const coachEl = document.getElementById('pm-settings-gear-coachmark');
    const gearBtn = document.getElementById('rail-btn-sidebar-settings');
    if (!coachEl || !gearBtn) return;

    hasShownSettingsGearHintThisSession = true;

    clearTimeout(settingsGearCoachmarkDelayTimer);
    settingsGearCoachmarkDelayTimer = setTimeout(() => {
      settingsGearCoachmarkDelayTimer = null;
      if (settingsGearCoachmarkCancelled) return;
      const currentCount = Number(st.appSettings.settingsGearHintCount) || 0;
      if (currentCount >= 2) return;
      if (P.isQuickSwitcherOpen?.()) return;
      const isAnyOverlayDrawerOpen = [
        P.dom.mediaAppsDrawer,
        P.dom.readerDrawer,
        P.dom.themeDrawer,
        P.dom.accountDrawer,
        P.dom.composeDrawer
      ].some((d) => d && !d.classList.contains('hidden'));
      if (isAnyOverlayDrawerOpen) return;
      const isAnyOverlayPopoverOpen = [
        'pm-mute-popover',
        'pm-header-more-menu',
        'pm-custom-app-edit-modal'
      ].some((id) => {
        const el = document.getElementById(id);
        return Boolean(el && !el.classList.contains('hidden'));
      });
      if (isAnyOverlayPopoverOpen) return;

      const nextCount = Math.min(2, currentCount + 1);
      st.appSettings.settingsGearHintCount = nextCount;
      P.saveSettingsPatch({ settingsGearHintCount: nextCount });

      P.syncSettingsGearCoachmarkPosition?.();
      coachEl.classList.remove('hidden');
      gearBtn.classList.add('is-coachmark-target');
      clearTimeout(settingsGearCoachmarkTimer);
      settingsGearCoachmarkTimer = setTimeout(() => {
        P.hideSettingsGearCoachmark(false);
      }, 10500);
    }, 900);
  };

  P.renderMediaBottomBar = function (app) {
    const st = P.state;
    const bottomBar = document.getElementById('pm-media-bottom-bar');
    const bottomItems = document.getElementById('media-bottom-nav-items');
    const showBtn = document.getElementById('btn-show-bottom-nav');
    const mediaApi = P.getAppsApi();
    if (!bottomBar || !bottomItems || !mediaApi) return;

    const subViews = app?.subViews || [];
    if (subViews.length === 0) {
      bottomBar.classList.add('hidden');
      showBtn?.classList.add('hidden');
      return;
    }

    const isHidden = Boolean(st.appSettings.hideMediaBottomBar);
    bottomBar.classList.toggle('hidden', isHidden);
    showBtn?.classList.toggle('hidden', !isHidden);
    bottomBar.style.setProperty('--pm-nav-brand', app.color || 'var(--accent)');
    bottomBar.style.setProperty('--pm-nav-grad', app.gradient || app.color || 'var(--accent)');

    P.syncMediaTopBarAutoHideState();

    const activeIdx = P.getActiveSubViewIndex(subViews, st.activeMediaUrl);

    if (bottomItems.dataset.renderedAppId === app.id && bottomItems.children.length === subViews.length) {
      Array.from(bottomItems.children).forEach((btn, idx) => {
        const isActive = idx === activeIdx;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-current', isActive ? 'page' : 'false');
      });
      return;
    }

    bottomItems.dataset.renderedAppId = app.id;
    bottomItems.replaceChildren();
    subViews.forEach((sv, idx) => {
      const itemBtn = document.createElement('button');
      const isActive = idx === activeIdx;
      itemBtn.type = 'button';
      itemBtn.className = `pm-media-bottom-item ${isActive ? 'active' : ''}`;
      itemBtn.setAttribute('aria-current', isActive ? 'page' : 'false');
      itemBtn.dataset.subviewIdx = String(idx);
      itemBtn.title = `${app.name}: ${sv.label}`;

      if (mediaApi.createSubViewIcon) {
        itemBtn.appendChild(mediaApi.createSubViewIcon(sv.icon || 'home', 15));
      }

      const lbl = document.createElement('span');
      lbl.className = 'pm-media-bottom-item-label';
      lbl.textContent = sv.label;
      itemBtn.appendChild(lbl);

      itemBtn.addEventListener('click', () => {
        P.openMediaWorkspace(app, sv.url, sv);
      });

      bottomItems.appendChild(itemBtn);
    });
  };

  function syncWorkspaceHeaderMeta(app) {
    if (!app) return;
    const mediaApi = P.getAppsApi();
    const iconEl = document.getElementById('media-active-icon');
    const titleEl = document.getElementById('media-active-title');
    const uaBadgeEl = document.getElementById('media-ua-badge');
    if (iconEl && mediaApi) {
      iconEl.replaceChildren(mediaApi.createAppSvgIcon(app.id, 13));
      iconEl.style.background = app.gradient || app.color || 'var(--accent)';
    }
    if (titleEl) titleEl.textContent = app.name;
    if (uaBadgeEl) {
      if (app.userAgentMode === 'mobile') {
        uaBadgeEl.textContent = 'Mobile UA';
        uaBadgeEl.classList.remove('hidden');
      } else if (app.userAgentMode === 'desktop') {
        uaBadgeEl.textContent = 'Desktop UA';
        uaBadgeEl.classList.remove('hidden');
      } else {
        uaBadgeEl.textContent = '';
        uaBadgeEl.classList.add('hidden');
      }
    }
  }

  P.openMediaWorkspace = function (app, customUrl, subViewMeta = null) {
    const st = P.state;
    const mediaWorkspace = P.dom.mediaWorkspace;
    const mediaApi = P.getAppsApi();
    if (!mediaWorkspace || !app) return;
    st.activeRailAppId = app.id;

    P.ensureOriginPreconnected(customUrl || app.defaultUrl, app.id);
    if (app.id === 'spotify') {
      browser.runtime.sendMessage({ type: 'PREINIT_BG_SP_PLAYER', appId: 'spotify' }).catch(() => {});
    }

    const entry = P.getOrCreateMediaFrame(app);
    if (!entry) return;

    const validCurrentUrl =
      entry.currentUrl && !P.isTransientAuthOrBootUrl(entry.currentUrl) ? entry.currentUrl : '';
    const validRestoredUrl =
      entry.restoredUrl && !P.isTransientAuthOrBootUrl(entry.restoredUrl) ? entry.restoredUrl : '';
    const rawCandidateUrl = customUrl || validCurrentUrl || validRestoredUrl || app.defaultUrl;
    const rawTargetUrl =
      app.id === 'spotify' && !subViewMeta?.isExplicitUrlOpen && P.resolveSpotifyReopenUrl
        ? P.resolveSpotifyReopenUrl(rawCandidateUrl)
        : rawCandidateUrl;
    const isWarmAndNavigated = Boolean(entry.hasNavigated && entry.loaded && entry.currentUrl);
    st.activeMediaUrl = rawTargetUrl;

    let targetUrl = rawTargetUrl;
    if (app.id === 'tiktok' && targetUrl.endsWith('/profile')) {
      const knownTikTokProfileUrl = entry.ownProfileUrl || st.appSettings.tiktokOwnProfileUrlV2 || '';
      if (knownTikTokProfileUrl) targetUrl = knownTikTokProfileUrl;
      else if (!isWarmAndNavigated) targetUrl = 'https://www.tiktok.com/?pm_goto_profile=1';
    } else if (app.id === 'instagram' && (targetUrl.endsWith('/profile') || targetUrl.includes('/accounts/edit'))) {
      const knownIgProfileUrl = entry.ownProfileUrl || st.appSettings.instagramOwnProfileUrl || '';
      if (knownIgProfileUrl) targetUrl = knownIgProfileUrl;
      else if (!isWarmAndNavigated) targetUrl = 'https://www.instagram.com/?pm_goto_profile=1';
    } else if (app.id === 'x' && (targetUrl.endsWith('/profile') || targetUrl.includes('/settings/profile'))) {
      const knownXProfileUrl = entry.ownProfileUrl || st.appSettings.xOwnProfileUrl || '';
      if (knownXProfileUrl) targetUrl = knownXProfileUrl;
      else if (!isWarmAndNavigated) targetUrl = 'https://x.com/home?pm_goto_profile=1';
    }

    let canUseSmoothSpaNav = false;
    if (customUrl && isWarmAndNavigated && app.id !== 'adhoc-web') {
      try {
        const curOrigin = new URL(entry.currentUrl).origin;
        const nextOrigin = new URL(targetUrl).origin;
        const isEnteringTikTokMessages =
          app.id === 'tiktok' &&
          targetUrl.includes('/messages') &&
          !(entry.currentUrl && entry.currentUrl.includes('/messages'));
        if (curOrigin === nextOrigin && !isEnteringTikTokMessages) {
          canUseSmoothSpaNav = true;
        }
      } catch (_) {}
    }

    if (!st.IS_SIDEBAR_VIEW && !st.IS_POPOUT_VIEW && (st.appSettings.popupWidth || 540) < 620) {
      document.documentElement.style.setProperty('--popup-width', '660px');
    }

    P.closeHeaderMoreMenu?.();
    P.closeMutePopover?.();
    P.closeRailContextMenu?.();
    P.setDrawerOpen(P.dom.readerDrawer, false);
    P.setDrawerOpen(P.dom.themeDrawer, false);
    P.setDrawerOpen(P.dom.accountDrawer, false);
    P.setDrawerOpen(P.dom.composeDrawer, false);
    P.setDrawerOpen(P.dom.mediaAppsDrawer, false);
    P.state.settingsUiHandle?.stopIntervals?.();
    P.closeQuickSwitcher?.();
    st.activeSidebarHubSection = '';
    document.getElementById('rail-btn-manage-apps')?.classList.remove('active');
    document.getElementById('rail-btn-sidebar-settings')?.classList.remove('active');
    mediaWorkspace.dataset.activeApp = app.id;
    P.setDrawerOpen(mediaWorkspace, true);

    P.switchActiveMediaFrame(app.id);
    P.renderOperaRail?.();
    P.renderNowPlayingBar?.();
    P.syncPersistentSessionToBackground(app.id, targetUrl);

    const subPillsEl = document.getElementById('media-subview-pills');
    const fitBtn = document.getElementById('btn-media-zoom-fit');

    if (fitBtn) {
      const z = entry.zoom || 1.0;
      fitBtn.textContent = Math.abs(z - 1.0) < 0.025 ? 'Fit' : `${Math.round(z * 100)}%`;
    }
    syncWorkspaceHeaderMeta(app);

    const subViews = app.subViews || [];
    const activeIdx = P.getActiveSubViewIndex(subViews, st.activeMediaUrl);

    if (subPillsEl) {
      if (subPillsEl.dataset.renderedAppId === app.id && subPillsEl.children.length === subViews.length) {
        Array.from(subPillsEl.children).forEach((pill, idx) => {
          pill.classList.toggle('active', idx === activeIdx);
        });
      } else {
        subPillsEl.dataset.renderedAppId = app.id;
        subPillsEl.replaceChildren();
        subViews.forEach((sv, idx) => {
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = `pm-media-subpill ${idx === activeIdx ? 'active' : ''}`;
          pill.textContent = sv.label;
          pill.addEventListener('click', () => P.openMediaWorkspace(app, sv.url, sv));
          subPillsEl.appendChild(pill);
        });
      }
    }

    P.renderMediaBottomBar(app);
    P.maybeShowFirstTimeTopBarHint();
    P.maybeShowPersistentMemoryHint();
    P.maybeShowSettingsGearCoachmark();

    if (canUseSmoothSpaNav) {
      entry.currentUrl = targetUrl;
      entry.pendingSpaUrl = targetUrl;
      entry.pendingSpaUntil = Date.now() + 1800;
      entry.lastNavAt = Date.now();
      P.sendCommandToMediaFrame('SPA_NAVIGATE', {
        url: targetUrl,
        label: subViewMeta?.label || '',
        icon: subViewMeta?.icon || ''
      });
      return;
    }

    const normCurUrl = (entry.currentUrl || '').replace(/\/+$/, '');
    const normTargetUrl = (targetUrl || '').replace(/\/+$/, '');
    const isAlreadyNavigatingSameUrl =
      Boolean(entry.hasNavigated && normCurUrl && normCurUrl === normTargetUrl) && !subViewMeta;

    if (isAlreadyNavigatingSameUrl) {
      if (entry.loaded) {
        P.hideMediaBrandLoader(entry.frame);
        P.broadcastSocialAppTheme();
      }
      return;
    }

    if (!isWarmAndNavigated || Boolean(customUrl)) {
      if (isWarmAndNavigated && app.id === 'tiktok') {
        P.sendCommandToMediaFrame('FREE_HEAVY_MEDIA');
      }
      let warmedInProfile = false;
      try {
        warmedInProfile = window.localStorage.getItem(`pm_app_warmed_${app.id}`) === '1';
      } catch (_) {}
      const isFastCachedRestore = Boolean(
        !isWarmAndNavigated &&
          P.isAppPersistent(app.id) &&
          (entry.restoredUrl || st.hibernatedAppUrls.has(app.id) || warmedInProfile)
      );
      entry.loaded = false;
      entry.hasNavigated = true;
      entry.currentUrl = rawTargetUrl;
      entry.pendingSpaUrl = '';
      entry.pendingSpaUntil = 0;
      entry.lastNavAt = Date.now();
      entry.frame.name = P.buildMediaFrameWindowName(app.id, app);

      const swStorageKey = app.id === 'telegram' ? 'pm_sw_cleaned_v2_telegram' : `pm_sw_cleaned_v1_${app.id}`;
      let alreadyCleanedInProfile = Boolean(entry.swCleaned);
      if (!alreadyCleanedInProfile) {
        try {
          alreadyCleanedInProfile = window.localStorage.getItem(swStorageKey) === '1';
        } catch (_) {}
      }
      const needsSwBootClean =
        !alreadyCleanedInProfile && (app.id === 'x' || app.id === 'whatsapp' || app.id === 'telegram');
      P.showMediaBrandLoader(app, entry.frame, isFastCachedRestore);
      if (needsSwBootClean) {
        entry.swCleaned = true;
        entry.bootingSwClean = true;
        try {
          window.localStorage.setItem(swStorageKey, '1');
        } catch (_) {}
        try {
          const origin = new URL(targetUrl).origin;
          const bootPath = app.id === 'telegram' ? '/favicon.ico' : '/robots.txt';
          entry.frame.src = `${origin}${bootPath}?pm_boot=1&pm_target=${encodeURIComponent(targetUrl)}`;
        } catch (_) {
          entry.bootingSwClean = false;
          entry.frame.src = targetUrl;
        }
      } else {
        entry.swCleaned = true;
        entry.bootingSwClean = false;
        entry.frame.src = targetUrl;
      }
    } else {
      P.hideMediaBrandLoader(entry.frame);
      P.broadcastSocialAppTheme();
    }
  };

  P.openUrlInWorkspace = function (rawUrl) {
    const st = P.state;
    const mediaApi = P.getAppsApi();
    let parsed;
    try {
      parsed = new URL(String(rawUrl || '').trim());
    } catch (_) {
      return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const cleanUrl = parsed.href;
    const matched = mediaApi?.detectAppByUrl?.(cleanUrl, st.appSettings);
    if (!st.IS_SIDEBAR_VIEW) {
      document.documentElement.classList.add('show-popup-rail');
    }
    if (matched) {
      P.openMediaWorkspace(matched, cleanUrl, { isExplicitUrlOpen: true });
      return true;
    }
    const adhocApp = {
      id: 'adhoc-web',
      name: parsed.hostname.replace(/^www\./, '') || 'Web Link',
      category: 'custom',
      color: '#6C63FF',
      gradient: 'linear-gradient(135deg, #6C63FF 0%, #4A42CC 100%)',
      defaultUrl: cleanUrl,
      preferFullSession: true,
      isCustom: false,
      isAdhoc: true,
      userAgentMode: 'default',
      subViews: []
    };
    P.openMediaWorkspace(adhocApp, cleanUrl);
    return true;
  };

  P.reloadCustomAppFrameIfWarm = function (appId, prevEntry, nextEntry) {
    const st = P.state;
    const appObj = P.getAppsApi()?.getAppById?.(appId, st.appSettings);
    if (appId === st.activeRailAppId && appObj) {
      syncWorkspaceHeaderMeta(appObj);
    }
    const poolEntry = st.mediaFramePool.get(appId);
    if (!poolEntry || !poolEntry.frame) return;
    const urlChanged = prevEntry?.url !== nextEntry?.url;
    const uaChanged = prevEntry?.userAgentMode !== nextEntry?.userAgentMode;
    if (!urlChanged && !uaChanged) return;
    poolEntry.frame.name = P.buildMediaFrameWindowName(appId, appObj);
    poolEntry.loaded = false;
    poolEntry.lastNavAt = Date.now();
    const targetUrl = nextEntry?.url || poolEntry.currentUrl;
    if (targetUrl) poolEntry.currentUrl = targetUrl;
    browser.runtime
      .sendMessage({ type: 'PM_BYPASS_PERSISTENT_CACHE_ONCE', appId })
      .catch(() => {})
      .finally(() => {
        if (targetUrl) poolEntry.frame.src = targetUrl;
      });
  };

  let customIconsHydrating = false;
  P.hydrateMissingCustomAppIcons = async function () {
    const st = P.state;
    const mediaApi = P.getAppsApi();
    if (customIconsHydrating || !mediaApi?.fetchWebsiteIconFromHtml) return;
    const customs = Array.isArray(st.appSettings.customMediaApps) ? st.appSettings.customMediaApps : [];
    const needsFetch = customs.some((c) => c && c.url && !c.iconUrl);
    if (!needsFetch) return;

    customIconsHydrating = true;
    try {
      let updated = false;
      const nextCustoms = await Promise.all(
        customs.map(async (c) => {
          if (!c || !c.url || c.iconUrl) return c;
          const fetchedIcon = await mediaApi.fetchWebsiteIconFromHtml(c.url);
          if (fetchedIcon) {
            updated = true;
            return { ...c, iconUrl: fetchedIcon };
          }
          return c;
        })
      );
      if (updated) {
        await P.saveSettingsPatch({ customMediaApps: nextCustoms });
        P.renderOperaRail?.();
        const activeIconEl = document.getElementById('media-active-icon');
        if (activeIconEl && st.activeRailAppId && st.activeRailAppId.startsWith('custom-')) {
          activeIconEl.replaceChildren(mediaApi.createAppSvgIcon(st.activeRailAppId, 13));
        }
      }
    } catch (_) {
    } finally {
      customIconsHydrating = false;
    }
  };

  P.schedulePrewarmPersistentApps = function () {
    const st = P.state;
    const mediaApi = P.getAppsApi();
    if (st.IS_POPOUT_VIEW || (st.appSettings.persistenceMode || 'selected') === 'eco') return;
    const candidates = Array.from(st.knownOpenPersistentIds).filter(
      (id) =>
        id &&
        id !== st.activeRailAppId &&
        P.isAppPersistent(id) &&
        !st.mediaFramePool.has(id) &&
        !st.pendingSidebarAudioTakeoverSet.has(id) &&
        !st.bgMasterAudioSet.has(id) &&
        st.currentAudibleBgAppId !== id
    );
    if (candidates.length === 0 || !mediaApi) return;

    candidates.slice(0, 4).forEach((appId) => {
      const app = mediaApi.getAppById(appId, st.appSettings);
      if (!app) return;
      const savedUrl = st.hibernatedAppUrls.get(appId) || st.appSettings.persistentSavedAppUrls?.[appId] || app.defaultUrl;
      P.ensureOriginPreconnected(savedUrl, appId);
    });
  };

  P.handleWorkspaceWindowMessage = function (e, sourceEntry) {
    const st = P.state;
    const data = e.data;
    const mediaApi = P.getAppsApi();
    const soundApi = P.getSoundApi();
    if (!data) return false;

    if (data.type === 'PM_FRAME_NAVIGATE_ACTIVE' && data.url) {
      const targetEntry = sourceEntry || P.getActivePoolEntry();
      const appId = targetEntry?.appId || st.activeRailAppId;
      const app = mediaApi?.getAppById(appId, st.appSettings);
      if (targetEntry && targetEntry.frame) {
        targetEntry.loaded = false;
        targetEntry.lastNavAt = Date.now();
        targetEntry.currentUrl = data.url;
        st.activeMediaUrl = data.url;
        if (app && appId === st.activeRailAppId) {
          P.showMediaBrandLoader(app, targetEntry.frame);
          const loaderTitleEl = document.getElementById('pm-media-loader-title');
          if (loaderTitleEl && data.title) loaderTitleEl.textContent = data.title;
        }
        targetEntry.frame.src = data.url;
      }
      return true;
    }

    if (data.type === 'PM_OPEN_SPOTIFY_DRM_TAB') {
      browser.tabs.create({ url: data.url || 'https://open.spotify.com/' });
      P.showToast('Click "Enable DRM" on Firefox\'s yellow bar at the top of the tab!');
      return true;
    }

    if (
      data.faviconUrl &&
      (!mediaApi?.isSafeIconUrl || mediaApi.isSafeIconUrl(data.faviconUrl)) &&
      sourceEntry &&
      sourceEntry.appId &&
      sourceEntry.appId.startsWith('custom-')
    ) {
      const customs = Array.isArray(st.appSettings.customMediaApps) ? st.appSettings.customMediaApps : [];
      const cIdx = customs.findIndex((c, idx) => (c.id || `custom-${idx}`) === sourceEntry.appId);
      if (cIdx >= 0 && customs[cIdx].iconUrl !== data.faviconUrl) {
        const nextCustoms = [...customs];
        nextCustoms[cIdx] = { ...nextCustoms[cIdx], iconUrl: data.faviconUrl };
        P.saveSettingsPatch({ customMediaApps: nextCustoms }).then(() => {
          P.renderOperaRail?.();
          const activeIconEl = document.getElementById('media-active-icon');
          if (activeIconEl && st.activeRailAppId === sourceEntry.appId && mediaApi) {
            activeIconEl.replaceChildren(mediaApi.createAppSvgIcon(sourceEntry.appId, 13));
          }
        });
      }
    }

    if (data.ownProfileUrl && sourceEntry) {
      sourceEntry.ownProfileUrl = data.ownProfileUrl;
      if (sourceEntry.appId === 'tiktok' && st.appSettings.tiktokOwnProfileUrlV2 !== data.ownProfileUrl) {
        P.saveSettingsPatch({ tiktokOwnProfileUrlV2: data.ownProfileUrl });
      } else if (sourceEntry.appId === 'instagram' && st.appSettings.instagramOwnProfileUrl !== data.ownProfileUrl) {
        P.saveSettingsPatch({ instagramOwnProfileUrl: data.ownProfileUrl });
      } else if (sourceEntry.appId === 'x' && st.appSettings.xOwnProfileUrl !== data.ownProfileUrl) {
        P.saveSettingsPatch({ xOwnProfileUrl: data.ownProfileUrl });
      }
    }

    if (data.type === 'PM_FRAME_START') {
      P.broadcastSocialAppTheme();
      P.broadcastVideoLoadbarConfig();
      return true;
    }

    if (data.type === 'PM_FRAME_NAV_START') {
      if (sourceEntry) sourceEntry.lastNavAt = Date.now();
      const appId = sourceEntry?.appId || st.activeRailAppId;
      const app = mediaApi?.getAppById(appId, st.appSettings);
      if (app && appId === st.activeRailAppId && !P.isAppPersistent(appId)) {
        P.showMediaBrandLoader(app, sourceEntry?.frame);
        const loaderTitleEl = document.getElementById('pm-media-loader-title');
        if (loaderTitleEl && data.title) loaderTitleEl.textContent = data.title;
      }
      return true;
    }

    if (data.type === 'PM_FRAME_DOM_READY') {
      if (sourceEntry) {
        sourceEntry.loaded = true;
        try { window.localStorage.setItem(`pm_app_warmed_${sourceEntry.appId}`, '1'); } catch (_) {}
        if (sourceEntry.appId === st.activeRailAppId) {
          P.hideMediaBrandLoader(sourceEntry.frame);
        } else {
          sourceEntry.frame.classList.remove('is-loading');
        }
        if (st.isAutoPausedByExternalTab) {
          try {
            sourceEntry.frame.contentWindow?.postMessage(
              {
                target: 'pocketmail-media-frame',
                cmd: 'TAB_AUDIO_AUTO_PAUSE',
                markShouldResume: st.pendingSidebarAudioTakeoverSet.has(sourceEntry.appId)
              },
              '*'
            );
          } catch (_) {}
        } else if (
          sourceEntry.appId === st.activeRailAppId &&
          st.pendingSidebarAudioTakeoverSet.has(sourceEntry.appId) &&
          (!sourceEntry.autoResumeSentAt || Date.now() - sourceEntry.autoResumeSentAt > 4000)
        ) {
          sourceEntry.autoResumeSentAt = Date.now();
          try {
            sourceEntry.frame.contentWindow?.postMessage(
              P.buildAutoResumePayload
                ? P.buildAutoResumePayload(sourceEntry.appId)
                : { target: 'pocketmail-media-frame', cmd: 'AUTO_RESUME_PLAYBACK' },
              '*'
            );
          } catch (_) {}
        }
      } else {
        P.hideMediaBrandLoader();
      }
      P.broadcastSocialAppTheme();
      P.broadcastVideoLoadbarConfig();
      return true;
    }

    if (data.type === 'PM_FRAME_VISUAL_READY' || data.type === 'PM_FRAME_LOADED') {
      if (sourceEntry) {
        sourceEntry.loaded = true;
        if (sourceEntry.appId === st.activeRailAppId) {
          P.hideMediaBrandLoader(sourceEntry.frame);
        } else {
          sourceEntry.frame.classList.remove('is-loading');
        }
        if (st.isAutoPausedByExternalTab) {
          try {
            sourceEntry.frame.contentWindow?.postMessage(
              {
                target: 'pocketmail-media-frame',
                cmd: 'TAB_AUDIO_AUTO_PAUSE',
                markShouldResume: st.pendingSidebarAudioTakeoverSet.has(sourceEntry.appId)
              },
              '*'
            );
          } catch (_) {}
        } else if (
          sourceEntry.appId === st.activeRailAppId &&
          st.pendingSidebarAudioTakeoverSet.has(sourceEntry.appId) &&
          (!sourceEntry.autoResumeSentAt || Date.now() - sourceEntry.autoResumeSentAt > 4000)
        ) {
          sourceEntry.autoResumeSentAt = Date.now();
          try {
            sourceEntry.frame.contentWindow?.postMessage(
              P.buildAutoResumePayload
                ? P.buildAutoResumePayload(sourceEntry.appId)
                : { target: 'pocketmail-media-frame', cmd: 'AUTO_RESUME_PLAYBACK' },
              '*'
            );
          } catch (_) {}
        }
      } else {
        P.hideMediaBrandLoader();
      }
      P.broadcastSocialAppTheme();
      return true;
    }

    if (data.type === 'PM_FRAME_UNREAD_UPDATE') {
      let appId = sourceEntry?.appId || '';
      if (!appId && typeof data.flatFrameName === 'string' && data.flatFrameName.startsWith('pm-media-frame-')) {
        appId = data.flatFrameName.replace('pm-media-frame-', '');
      }
      if (appId) {
        const prev = st.socialAppUnreadMap.get(appId);
        const prevScore = prev ? (prev.unreadCount || (prev.hasUnread ? 1 : 0)) : 0;
        const prevMaxSeen = prev ? (prev.maxSeenScore || prevScore) : 0;
        const nextCount = Number(data.unreadCount) || 0;
        const nextHasUnread = Boolean(data.hasUnread || nextCount > 0);
        const nextScore = nextCount || (nextHasUnread ? 1 : 0);

        const isRecentNav = Boolean(
          data.isRouteTransition ||
            (sourceEntry && sourceEntry.lastNavAt && Date.now() - sourceEntry.lastNavAt < 5500)
        );

        st.socialAppUnreadMap.set(appId, {
          unreadCount: nextCount,
          hasUnread: nextHasUnread,
          maxSeenScore: Math.max(prevMaxSeen, nextScore)
        });
        P.renderOperaRail?.();

        if (
          !isRecentNav &&
          nextScore > prevScore &&
          nextScore > prevMaxSeen &&
          prev !== undefined &&
          !P.isSitesMutedNow() &&
          soundApi
        ) {
          const soundMap = st.appSettings.socialAppSoundMap || {};
          const isMediaStreamApp = [
            'spotify', 'youtube', 'soundcloud', 'apple-music',
            'tiktok', 'twitch', 'chatgpt', 'gemini', 'claude', 'perplexity'
          ].includes(appId);
          const rawConfigured = soundMap[appId];
          const chosenSound =
            rawConfigured === 'none'
              ? 'none'
              : rawConfigured && rawConfigured !== 'default'
                ? rawConfigured
                : isMediaStreamApp && rawConfigured === undefined
                  ? 'none'
                  : st.appSettings.soundId || 'bamboo-pop';
          if (chosenSound !== 'none') {
            soundApi.playNotificationSound(
              chosenSound,
              st.appSettings.soundVolume ?? 0.75,
              st.appSettings.customAudioData
            );
          }
        }
      }
      return true;
    }

    if (data.type === 'PM_FRAME_URL_CHANGED' && data.url) {
      if (sourceEntry) {
        if (
          sourceEntry.pendingSpaUntil &&
          Date.now() < sourceEntry.pendingSpaUntil &&
          sourceEntry.pendingSpaUrl &&
          mediaApi
        ) {
          const app = mediaApi.getAppById(sourceEntry.appId, st.appSettings);
          const subViews = app?.subViews || [];
          const targetIdx = P.getActiveSubViewIndex(subViews, sourceEntry.pendingSpaUrl);
          const reportedIdx = P.getActiveSubViewIndex(subViews, data.url);
          if (reportedIdx === targetIdx) {
            sourceEntry.pendingSpaUntil = 0;
            sourceEntry.pendingSpaUrl = '';
          } else {
            return true;
          }
        }
        sourceEntry.currentUrl = data.url;
        sourceEntry.lastNavAt = Date.now();
        const prevPb = st.framePlaybackStates.get(sourceEntry.appId);
        if (sourceEntry.appId === 'youtube' && !P.isPlayableYouTubeUrl(data.url)) {
          st.pendingSidebarAudioTakeoverSet.delete('youtube');
          if (st.currentAudibleBgAppId === 'youtube') st.currentAudibleBgAppId = null;
          const stoppedPb = {
            isPlaying: false,
            currentTime: 0,
            resumeUrl: data.url,
            title: data.title || prevPb?.title || 'YouTube',
            updatedAt: Date.now()
          };
          st.framePlaybackStates.set('youtube', stoppedPb);
          P.renderOperaRail?.();
          P.renderNowPlayingBar?.();
          P.syncPersistentSessionToBackground('youtube', data.url, stoppedPb);
        } else {
          if (prevPb) {
            prevPb.resumeUrl = data.url;
            if (data.title) prevPb.title = data.title;
          }
          P.syncPersistentSessionToBackground(sourceEntry.appId, data.url, prevPb || null);
        }
      }
      if (!sourceEntry || sourceEntry.appId === st.activeRailAppId) {
        st.activeMediaUrl = data.url;
        const subPillsEl = document.getElementById('media-subview-pills');
        if (subPillsEl && mediaApi) {
          const app = mediaApi.getAppById(st.activeRailAppId, st.appSettings);
          const subViews = app?.subViews || [];
          const activeSubIdx = P.getActiveSubViewIndex(subViews, st.activeMediaUrl);
          const pills = subPillsEl.querySelectorAll('.pm-media-subpill');
          subViews.forEach((_, idx) => {
            if (pills[idx]) pills[idx].classList.toggle('active', idx === activeSubIdx);
          });
          if (app) P.renderMediaBottomBar(app);
        }
      }
      return true;
    }

    if (data.type === 'PM_FRAME_ZOOM_UPDATED' && typeof data.zoom === 'number') {
      if (sourceEntry) P.applyFrameViewportZoom(sourceEntry, data.zoom);
      return true;
    }

    return false;
  };

  P.bindMediaWorkspaceEvents = function () {
    const st = P.state;
    const mediaWorkspace = P.dom.mediaWorkspace;

    document.getElementById('btn-media-autohide-top')?.addEventListener('click', async () => {
      const currentMode = P.getTopBarMode();
      const nextMode = currentMode === 'pinned' ? 'hover' : 'pinned';
      const nextAutoHide = nextMode === 'hover';
      const headerEl = mediaWorkspace?.querySelector('.pm-media-header');
      if (nextAutoHide && headerEl) {
        headerEl.classList.add('force-collapse-now');
        const clearForce = () => {
          headerEl.classList.remove('force-collapse-now');
          headerEl.removeEventListener('mouseleave', clearForce);
        };
        headerEl.addEventListener('mouseleave', clearForce);
        setTimeout(clearForce, 900);
      }
      await P.saveSettingsPatch({
        mediaTopBarMode: nextMode,
        autoHideMediaTopBar: nextAutoHide
      });
      P.syncMediaTopBarAutoHideState();
      P.showToast(
        nextAutoHide
          ? 'Top bar unpinned — Auto-hides & shows on top-edge hover'
          : 'Top bar pinned — Always visible'
      );
    });

    document.getElementById('btn-dismiss-topbar-hint')?.addEventListener('click', () => {
      document.getElementById('pm-topbar-onboarding-hint')?.classList.add('hidden');
      P.saveSettingsPatch({ hasSeenTopBarHint: true });
    });

    document.getElementById('pm-media-top-hover-zone')?.addEventListener(
      'mouseenter',
      () => {
        document.getElementById('pm-topbar-onboarding-hint')?.classList.add('hidden');
      },
      { passive: true }
    );

    document.getElementById('btn-media-theme')?.addEventListener('click', async () => {
      const modes = [
        { id: 'native', label: 'Native Default' },
        { id: 'true-night', label: 'True Night OLED (#000)' },
        { id: 'match-theme', label: 'Match FoxHub Palette' },
        { id: 'warm-glass', label: 'Cozy Warm Eye-Care' },
        { id: 'midnight-oled', label: 'Midnight Indigo' },
        { id: 'cozy-sepia', label: 'Cozy Sepia' },
        { id: 'rose-twilight', label: 'Rose Twilight' }
      ];
      const cur = st.appSettings.socialAppThemeMode || 'native';
      const idx = modes.findIndex((m) => m.id === cur);
      const next = modes[(idx + 1) % modes.length];
      await P.saveSettingsPatch({ socialAppThemeMode: next.id });
      P.broadcastSocialAppTheme(cur);
      P.showToast(`App Theme: ${next.label}`);
    });

    document.getElementById('btn-hide-bottom-nav')?.addEventListener('click', async () => {
      await P.saveSettingsPatch({ hideMediaBottomBar: true });
      const app = P.getAppsApi()?.getAppById(st.activeRailAppId, st.appSettings);
      if (app) P.renderMediaBottomBar(app);
    });

    document.getElementById('btn-show-bottom-nav')?.addEventListener('click', async () => {
      await P.saveSettingsPatch({ hideMediaBottomBar: false });
      const app = P.getAppsApi()?.getAppById(st.activeRailAppId, st.appSettings);
      if (app) P.renderMediaBottomBar(app);
    });

    document.getElementById('btn-media-back')?.addEventListener('click', () => {
      P.sendCommandToMediaFrame('BACK');
    });

    document.getElementById('btn-media-reload')?.addEventListener('click', () => {
      const appId = st.activeRailAppId;
      const app = P.getAppsApi()?.getAppById(appId, st.appSettings);
      const entry = P.getActivePoolEntry();
      if (entry) {
        entry.loaded = false;
        entry.lastNavAt = Date.now();
      }
      if (app) P.showMediaBrandLoader(app, entry?.frame);
      Promise.all([
        browser.runtime.sendMessage({ type: 'SIDEBAR_FRAME_RELOAD_PREPARE', appId }).catch(() => {}),
        browser.runtime.sendMessage({ type: 'PM_BYPASS_PERSISTENT_CACHE_ONCE', appId }).catch(() => {})
      ]).finally(() => P.sendCommandToMediaFrame('RELOAD'));
    });

    document.getElementById('btn-media-zoom-out')?.addEventListener('click', () => {
      const entry = P.getActivePoolEntry();
      if (!entry) return;
      const nextZoom = Math.max(0.55, Math.round(((entry.zoom || 1.0) - 0.08) * 100) / 100);
      P.applyFrameViewportZoom(entry, nextZoom);
    });

    document.getElementById('btn-media-zoom-fit')?.addEventListener('click', () => {
      const entry = P.getActivePoolEntry();
      if (!entry) return;
      const curZoom = entry.zoom || 1.0;
      if (Math.abs(curZoom - 1.0) < 0.03) {
        const wrapEl = document.querySelector('.pm-media-frame-wrap');
        const wrapWidth = wrapEl ? wrapEl.clientWidth : 420;
        const smartFitZoom = wrapWidth < 580 ? Math.min(0.84, Math.max(0.64, Math.round((wrapWidth / 620) * 100) / 100)) : 0.85;
        P.applyFrameViewportZoom(entry, smartFitZoom);
        P.showToast(`Smart Viewport Fit (${Math.round(smartFitZoom * 100)}% — wider desktop layout)`);
      } else {
        P.applyFrameViewportZoom(entry, 1.0);
        P.showToast('Viewport Zoom reset to 100%');
      }
    });

    document.getElementById('btn-media-zoom-in')?.addEventListener('click', () => {
      const entry = P.getActivePoolEntry();
      if (!entry) return;
      const nextZoom = Math.min(1.5, Math.round(((entry.zoom || 1.0) + 0.08) * 100) / 100);
      P.applyFrameViewportZoom(entry, nextZoom);
    });

    document.getElementById('btn-media-float-win')?.addEventListener('click', () => {
      const floatUrl = browser.runtime.getURL(
        `src/popup/popup.html?sidebar=1&app=${encodeURIComponent(st.activeRailAppId || 'instagram')}`
      );
      browser.runtime.sendMessage({ type: 'OPEN_COMPANION_WINDOW', url: floatUrl });
    });

    document.getElementById('btn-media-open-tab')?.addEventListener('click', () => {
      if (st.activeMediaUrl) browser.tabs.create({ url: st.activeMediaUrl });
    });

    document.getElementById('btn-media-close-app')?.addEventListener('click', () => {
      if (st.activeRailAppId && st.activeRailAppId !== 'pocketmail') {
        const app = P.getAppsApi()?.getAppById(st.activeRailAppId, st.appSettings);
        P.closeMediaAppFrame(st.activeRailAppId);
        P.showToast(`Closed ${app ? app.name : 'app'} session`);
      }
    });
  };
})(typeof window !== 'undefined' ? window : this);
