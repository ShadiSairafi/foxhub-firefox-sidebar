/**
 * FoxHub Background — Message Router, Lifecycle Ports, Window PostMessage Bridge & Startup Init
 */

(function (global) {
  const bg = (global.FoxHubBg = global.FoxHubBg || {});
  const schema = global.FoxHubSettingsSchema;

  function getMediaAppsCatalog() {
    return global.FoxHubMediaApps || global.PocketMailMediaApps || null;
  }

  function getValidPendingShortcutLaunch() {
    const p = bg.state.pendingShortcutLaunch;
    if (p && Date.now() - p.ts < 7000) return p;
    return null;
  }

  function getValidPendingContextUrl() {
    const p = bg.state.pendingContextUrl;
    if (p && Date.now() - p.ts < 10000) return p;
    return null;
  }

  function handleUpdatePersistentSession(msg) {
    if (!msg || typeof msg !== 'object') return;
    const s = bg.state.currentSettings;

    if (msg.activeAppId && (bg.isAppAllowedForPersistence(msg.activeAppId) || bg.isAppAllowedForBgAudio(msg.activeAppId))) {
      s.persistentLastActiveAppId = msg.activeAppId;
    } else if (msg.activeAppId === 'pocketmail' && msg.explicitMailClick && bg.bgAudioPool.size === 0) {
      s.persistentLastActiveAppId = 'pocketmail';
    }
    if (Array.isArray(msg.openPersistentAppIds)) {
      s.persistentOpenAppIds = msg.openPersistentAppIds.filter((id) => bg.isAppAllowedForPersistence(id));
    }
    if (msg.appId && msg.url && !msg.url.includes('pm_boot=1')) {
      if (!s.persistentSavedAppUrls) {
        s.persistentSavedAppUrls = {};
      }
      if (bg.isAppAllowedForPersistence(msg.appId) || bg.isAppAllowedForBgAudio(msg.appId)) {
        s.persistentSavedAppUrls[msg.appId] = msg.url;
      }
      if (msg.appId === 'youtube' && !bg.isPlayableYouTubeUrl(msg.url)) {
        if (bg.bgAudioPool.has('youtube')) {
          bg.removeBgAudioIframeOnly('youtube');
        }
        const stagingSp = bg.bgStagingSpPlayers.get('youtube');
        if (stagingSp) {
          bg.disposeSpPlayerInstance(stagingSp);
          bg.bgStagingSpPlayers.delete('youtube');
        }
        const activeSp = bg.bgSpEmePlayers.get('youtube');
        if (activeSp && !activeSp.disposed) {
          activeSp.awaitingBgFrameHandoff = false;
          activeSp.remotePaused = true;
          activeSp.explicitUserPause = true;
          if (activeSp.videoEl && !activeSp.videoEl.paused) {
            try {
              activeSp.videoEl.pause();
            } catch (_) {}
          }
        }
        const prevYt = bg.liveMediaPlaybackState.get('youtube');
        if (prevYt) {
          prevYt.isPlaying = false;
          prevYt.handedOffAt = undefined;
          prevYt.resumeUrl = msg.url;
          prevYt.updatedAt = Date.now();
        }
        bg.refreshBgAudioIndicator();
      }
    }
    if (msg.appId && msg.playback) {
      const prev = bg.liveMediaPlaybackState.get(msg.appId);
      const prevWasPlaying = Boolean(prev?.isPlaying);
      const sp = bg.bgSpEmePlayers.get(msg.appId);
      const candidateUrl = String(msg.playback.resumeUrl || msg.url || '');
      const isNonPlayableYt = msg.appId === 'youtube' && candidateUrl && !bg.isPlayableYouTubeUrl(candidateUrl);
      const isBgMasterActivelyPlaying = Boolean(
        !isNonPlayableYt &&
          bg.bgAudioPool.has(msg.appId) &&
          !(sp && sp.explicitUserPause) &&
          !bg.isTabAutoPauseEnforced() &&
          ((sp && !sp.disposed && sp.videoEl && !sp.videoEl.paused) || (prev && prev.isPlaying))
      );
      const inTakeoverGrace =
        !isNonPlayableYt &&
        !(sp && sp.explicitUserPause) &&
        !msg.playback.isPlaying &&
        prev &&
        prev.handedOffAt &&
        Date.now() - prev.handedOffAt < 12000 &&
        prev.isPlaying &&
        (bg.bgAudioPool.has(msg.appId) || (sp && sp.awaitingBgFrameHandoff));
      const nextIsPlaying = isNonPlayableYt
        ? false
        : Boolean(msg.playback.isPlaying || inTakeoverGrace || isBgMasterActivelyPlaying);
      if (nextIsPlaying) {
        bg.liveMediaPlaybackState.forEach((otherSt, otherId) => {
          if (otherId !== msg.appId && otherSt.isPlaying) {
            otherSt.isPlaying = false;
          }
        });
      }
      bg.liveMediaPlaybackState.set(
        msg.appId,
        bg.normalizePlaybackMeta(
          msg.appId,
          {
            isPlaying: nextIsPlaying,
            currentTime: Number(msg.playback.currentTime) || 0,
            duration: Number(msg.playback.duration) || 0,
            resumeUrl: candidateUrl,
            title: msg.playback.title !== undefined ? String(msg.playback.title || '') : undefined,
            artist: msg.playback.artist !== undefined ? String(msg.playback.artist || '') : undefined,
            album: msg.playback.album !== undefined ? String(msg.playback.album || '') : undefined,
            artworkUrl: msg.playback.artworkUrl !== undefined ? String(msg.playback.artworkUrl || '') : undefined,
            canPrev: msg.playback.canPrev,
            canNext: msg.playback.canNext,
            handedOffAt: inTakeoverGrace ? prev.handedOffAt : undefined
          },
          prev
        )
      );
      if (candidateUrl && (bg.isAppAllowedForPersistence(msg.appId) || bg.isAppAllowedForBgAudio(msg.appId))) {
        if (!s.persistentSavedAppUrls) {
          s.persistentSavedAppUrls = {};
        }
        s.persistentSavedAppUrls[msg.appId] = candidateUrl;
      }
      if (bg.recordTrackUrlOriginalTitle && (candidateUrl || msg.url) && msg.playback.title) {
        bg.recordTrackUrlOriginalTitle(msg.appId, candidateUrl || msg.url, msg.playback.title);
      }
      if (prevWasPlaying !== nextIsPlaying || msg.playback.title !== prev?.title) {
        bg.refreshBgAudioIndicator();
      }
    }
    bg.scheduleSettingsSave(false);
  }

  function buildBgTakeoverMeta(id, val = null, overrideUrl = '') {
    const sp = bg.bgSpEmePlayers.get(id);
    const st = bg.liveMediaPlaybackState.get(id);
    const bgEntry = val || bg.bgAudioPool.get(id);
    const spTitle = sp && sp.trackTitle ? String(sp.trackTitle).trim() : '';
    const stTitle = st && st.title ? String(st.title).trim() : '';
    const bgTitle = bgEntry && bgEntry.title ? String(bgEntry.title).trim() : '';
    const trackTitle =
      (spTitle && spTitle.toLowerCase() !== 'spotify' ? spTitle : '') ||
      (stTitle && stTitle.toLowerCase() !== 'spotify' ? stTitle : '') ||
      bgTitle;
    const artist = st && st.artist ? String(st.artist) : '';
    const currentTime =
      sp && sp.videoEl && Number.isFinite(sp.videoEl.currentTime) && sp.videoEl.currentTime > 0
        ? Math.floor(sp.videoEl.currentTime)
        : st
          ? Math.floor(Number(st.currentTime) || 0)
          : 0;
    const duration = (sp && Number(sp.trackDuration)) || (st ? Number(st.duration) || 0 : 0);
    const resumeUrl = overrideUrl || (bgEntry && bgEntry.url) || (st && st.resumeUrl) || '';
    let urlTrackTitle = '';
    if (id === 'spotify' && resumeUrl && bg.trackUrlOriginalTitleMap) {
      try {
        const p = (new URL(String(resumeUrl)).pathname || '').replace(/\/+$/, '');
        urlTrackTitle = bg.trackUrlOriginalTitleMap.get(`${id}:${p}`) || '';
      } catch (_) {}
    }
    return { trackTitle, artist, currentTime, duration, resumeUrl, urlTrackTitle };
  }

  // Synchronous hooks consumed by popup/tests via browser.extension.getBackgroundPage()
  try {
    global.__pmConsumePendingShortcutApp = () => {
      const p = getValidPendingShortcutLaunch();
      if (p) {
        const consumed = { ...p };
        bg.state.pendingShortcutLaunch = null;
        return consumed;
      }
      return null;
    };
    global.__pmConsumePendingContextUrl = () => {
      const p = getValidPendingContextUrl();
      if (p) {
        const consumed = { ...p };
        bg.state.pendingContextUrl = null;
        return consumed;
      }
      return null;
    };

    global.__pmGetSyncBootState = () => {
      const currentlyPausedByTab = bg.isTabAutoPauseEnforced();
      const activeBgApps = [];
      bg.bgAudioPool.forEach((val, id) => {
        const meta = buildBgTakeoverMeta(id, val);
        activeBgApps.push({
          appId: id,
          url: val.url,
          title: meta.trackTitle || val.title,
          trackTitle: meta.trackTitle,
          artist: meta.artist,
          currentTime: meta.currentTime,
          duration: meta.duration,
          resumeUrl: meta.resumeUrl,
          urlTrackTitle: meta.urlTrackTitle,
          bgMasterActive: false
        });
      });
      const pendingShortcut = getValidPendingShortcutLaunch();
      const pendingContext = getValidPendingContextUrl();
      return {
        settings: bg.state.currentSettings,
        activeBgApps,
        audibleAppId: bg.getAudibleBgAudioAppId(),
        nowPlaying: bg.getActiveNowPlayingState(),
        isAutoPausedByTabAudio: currentlyPausedByTab,
        sidebarOpenCount: bg.state.sidebarPortCount,
        pendingShortcutAppId: pendingShortcut ? pendingShortcut.appId || '' : '',
        pendingContextUrl: pendingContext ? { ...pendingContext } : null
      };
    };
  } catch (_) {}

  if (browser.runtime && browser.runtime.onConnect) {
    browser.runtime.onConnect.addListener((port) => {
      if (!port) return;
      if (port.name === 'foxhub-eme-bridge') {
        let portKey = '';
        port.onMessage.addListener((msg) => {
          if (!msg || msg.type !== 'PM_SP_EME_BRIDGE') return;
          const fn = typeof msg.flatFrameName === 'string' ? msg.flatFrameName : '';
          let appId = '';
          let sourceType = 'sidebar';
          if (fn.startsWith('pm-bg-audio-')) {
            appId = fn.replace('pm-bg-audio-', '');
            sourceType = 'bg';
            if (!bg.bgAudioPool.has(appId)) return;
          } else if (fn.startsWith('pm-bg-standby-')) {
            appId = fn.replace('pm-bg-standby-', '');
            if (bg.bgAudioPool.has(appId)) {
              sourceType = 'bg';
            } else if (bg.bgStandbyPool.has(appId)) {
              sourceType = 'standby';
              portKey = `standby:${appId}`;
              bg.emeBridgePorts.set(portKey, port);
              if (
                msg.bridgeType === 'BRIDGE_HELLO' ||
                msg.bridgeType === 'SERVER_CERT' ||
                msg.bridgeType === 'LIC_AUTH'
              ) {
                bg.handleSpEmeBridgeMessage(appId, msg, 'standby');
              }
              return;
            } else {
              return;
            }
          } else if (fn.startsWith('pm-media-frame-')) {
            appId = fn.replace('pm-media-frame-', '');
            sourceType = 'sidebar';
          }
          if (!appId) return;
          if (portKey && portKey !== `${sourceType}:${appId}` && bg.emeBridgePorts.get(portKey) === port) {
            bg.emeBridgePorts.delete(portKey);
          }
          portKey = `${sourceType}:${appId}`;
          bg.emeBridgePorts.set(portKey, port);
          bg.handleSpEmeBridgeMessage(appId, msg, sourceType);
        });
        port.onDisconnect.addListener(() => {
          if (portKey && bg.emeBridgePorts.get(portKey) === port) {
            bg.emeBridgePorts.delete(portKey);
          }
        });
        return;
      }

      const isPopupLifecycle = port.name === 'foxhub-popup-lifecycle';
      if (port.name !== 'foxhub-sidebar-lifecycle' && !isPopupLifecycle) return;
      if (isPopupLifecycle) {
        bg.state.popupPortCount++;
      } else {
        bg.state.sidebarPortCount++;
      }
      bg.refreshBgAudioIndicator();

      port.onMessage.addListener((msg) => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'FORWARD_SP_EME_BRIDGE' && msg.appId && msg.data) {
          bg.handleSpEmeBridgeMessage(msg.appId, msg.data, 'sidebar');
          return;
        }
        if (msg.type === 'UPDATE_PERSISTENT_SESSION') {
          handleUpdatePersistentSession(msg);
        }
      });

      port.onDisconnect.addListener(() => {
        if (isPopupLifecycle) {
          bg.state.popupPortCount = Math.max(0, bg.state.popupPortCount - 1);
        } else {
          bg.state.sidebarPortCount = Math.max(0, bg.state.sidebarPortCount - 1);
        }
        if (bg.state.sidebarPortCount + bg.state.popupPortCount === 0) {
          bg.triggerSidebarClosedAudioHandoff();
        }
        bg.refreshBgAudioIndicator();
      });
    });
  }

  global.addEventListener('message', (e) => {
    const data = e.data;
    if (!data || data.source !== 'pocketmail-media-frame') return;
    if (typeof data.flatFrameName !== 'string' || !data.flatFrameName.startsWith('pm-bg-audio-')) return;
    const appId = data.flatFrameName.replace('pm-bg-audio-', '');
    if (!appId || !bg.bgAudioPool.has(appId)) return;

    if (data.type === 'PM_FRAME_PLAYBACK_STATE') {
      const s = bg.state.currentSettings;
      const bgEntry = bg.bgAudioPool.get(appId);
      if (data.resumeUrl) {
        if (!s.persistentSavedAppUrls) s.persistentSavedAppUrls = {};
        s.persistentSavedAppUrls[appId] = data.resumeUrl;
        if (bgEntry) {
          bgEntry.url = data.resumeUrl;
          if (data.title) bgEntry.title = data.title;
          if (typeof data.autoplayBlocked === 'boolean') {
            bgEntry.autoplayBlocked = data.autoplayBlocked;
          }
        }
      }
      const prevSt = bg.liveMediaPlaybackState.get(appId);
      if (bg.recordTrackUrlOriginalTitle && (data.resumeUrl || bgEntry?.url) && data.title) {
        bg.recordTrackUrlOriginalTitle(appId, data.resumeUrl || bgEntry?.url, data.title);
      }
      const prevPlaying = Boolean(prevSt?.isPlaying);
      const nextPlaying = Boolean(data.isPlaying);
      bg.liveMediaPlaybackState.set(
        appId,
        bg.normalizePlaybackMeta(
          appId,
          {
            isPlaying: nextPlaying,
            currentTime: Number(data.currentTime) || 0,
            duration: Number(data.duration) || prevSt?.duration || 0,
            resumeUrl: data.resumeUrl || bgEntry?.url || prevSt?.resumeUrl || '',
            title: data.title !== undefined ? String(data.title) : (bgEntry?.title || prevSt?.title || ''),
            artist: data.artist,
            album: data.album,
            artworkUrl: data.artworkUrl,
            canPrev: data.canPrev,
            canNext: data.canNext
          },
          prevSt
        )
      );
      if (prevPlaying !== nextPlaying || data.title !== prevSt?.title) {
        bg.refreshBgAudioIndicator();
      }
    } else if (data.type === 'PM_SP_EME_BRIDGE') {
      bg.handleSpEmeBridgeMessage(appId, data, 'bg');
    } else if (data.type === 'PM_BG_AUDIO_CHUNK' && data.chunk) {
      bg.handleBgMseAudioChunk(appId, data.chunk);
    }
  });

  if (browser.runtime && browser.runtime.onMessage) {
    browser.runtime.onMessage.addListener((msg, sender) => {
      if (!msg || typeof msg !== 'object') return Promise.resolve({ ok: false });

      switch (msg.type) {
        case 'PM_SYNC_LIVE_FRAME_COOKIES':
          bg.handleLiveFrameCookiesMessage(msg);
          return undefined;

        case 'STATE_UPDATED':
        case 'OPEN_APP_FROM_SHORTCUT':
        case 'OPEN_MAIL_WORKSPACE':
        case 'BG_AUDIO_STATUS_CHANGED':
        case 'PM_TAB_AUDIO_AUTO_PAUSE_STATE':
        case 'PM_FORWARD_MEDIA_COMMAND':
        case 'PM_QUICK_SWITCHER_TOGGLE':
          return undefined;

        case 'GET_STATE': {
          bg.prewarmSocialCookieCache();
          const pendingShortcut = getValidPendingShortcutLaunch();
          const pendingContext = getValidPendingContextUrl();
          return Promise.resolve({
            state: bg.state.cachedState,
            settings: bg.state.currentSettings,
            snoozed: bg.state.localOverlay.snoozed,
            audibleAppId: bg.getAudibleBgAudioAppId(),
            nowPlaying: bg.getActiveNowPlayingState(),
            sidebarOpenCount: bg.state.sidebarPortCount,
            isAutoPausedByTabAudio: bg.isTabAutoPauseEnforced(),
            pendingShortcutAppId: pendingShortcut ? pendingShortcut.appId || '' : '',
            pendingContextUrl: pendingContext ? { ...pendingContext } : null
          });
        }

        case 'CONSUME_PENDING_SHORTCUT':
          bg.state.pendingShortcutLaunch = null;
          return Promise.resolve({ ok: true });

        case 'CONSUME_PENDING_CONTEXT_URL':
          bg.state.pendingContextUrl = null;
          return Promise.resolve({ ok: true });

        case 'PREWARM_APP_SESSION':
          bg.prewarmSocialCookieCache(msg.url || '');
          return Promise.resolve({ ok: true });

        case 'SYNC_NOW':
          return bg.syncAllAccounts({ forceTestNotification: Boolean(msg.forceTestNotification) }).then((state) => ({
            state,
            settings: bg.state.currentSettings,
            snoozed: bg.state.localOverlay.snoozed
          }));

        case 'MESSAGE_ACTION':
          return bg.handleMessageAction(msg.message, msg.actionType, msg.extra).then((state) => ({
            state,
            snoozed: bg.state.localOverlay.snoozed
          }));

        case 'MARK_ALL_READ':
          return (async () => {
            const targetEmail = msg.accountEmail;
            const toMark = [];
            bg.state.cachedState.accounts.forEach((acc) => {
              if (!targetEmail || acc.email === targetEmail) {
                (acc.messages || []).forEach((m) => toMark.push(m));
              }
            });
            for (const m of toMark) {
              await bg.handleMessageAction(m, 'markRead');
            }
            return { state: bg.state.cachedState, snoozed: bg.state.localOverlay.snoozed };
          })();

        case 'FETCH_FULL_EMAIL':
          return (async () => {
            const res = await global.PocketMailGmailClient.fetchFullEmailContent(msg.message);
            const msgId = msg.message?.id;
            if (msgId && res) {
              bg.resolvedOtpCache.set(msgId, {
                timestamp: msg.message?.timestamp || 0,
                fetchedAt: Date.now(),
                otpCode: res.otpCode || null,
                fullText: res.plainText || '',
                latestSnippet: res.latestSnippet || ''
              });
              let updated = false;
              (bg.state.cachedState.accounts || []).forEach((acc) => {
                (acc.messages || []).forEach((m) => {
                  if (m.id === msgId) {
                    if (res.plainText) m.fullText = res.plainText;
                    if (res.latestSnippet) m.snippet = res.latestSnippet;
                    if (res.otpCode) m.otpCode = res.otpCode;
                    updated = true;
                  }
                });
              });
              if (updated) {
                browser.storage.local.set({ cachedState: bg.state.cachedState }).catch(() => {});
              }
            }
            return res;
          })();

        case 'SEND_EMAIL':
          return (async () => {
            const payload = msg.payload || {};
            const oauthAcc = (bg.state.currentSettings.oauthAccounts || []).find(
              (a) => a.email && payload.accountEmail && a.email.toLowerCase() === payload.accountEmail.toLowerCase()
            );
            const res = await global.PocketMailGmailClient.sendEmailDirect(payload, oauthAcc);
            if (res && res.ok) {
              const sentMessage = await bg.recordSentEmailInOverlay(payload);
              if (!bg.isEmailNotificationsMuted() && bg.state.currentSettings.soundId !== 'none') {
                global.PocketMailSound.playNotificationSound(
                  'morning-dew',
                  Math.min(0.55, bg.state.currentSettings.soundVolume || 0.5)
                );
              }
              return { ...res, sentMessage, state: bg.state.cachedState };
            }
            return res;
          })();

        case 'RECORD_SENT_EMAIL':
          return (async () => {
            const payload = msg.payload || {};
            const sentMessage = await bg.recordSentEmailInOverlay(payload);
            if (!bg.isEmailNotificationsMuted() && bg.state.currentSettings.soundId !== 'none') {
              global.PocketMailSound.playNotificationSound(
                'morning-dew',
                Math.min(0.55, bg.state.currentSettings.soundVolume || 0.5)
              );
            }
            return { ok: true, sentMessage, state: bg.state.cachedState };
          })();

        case 'OPEN_GOOGLE_LOGIN':
          return bg.openGoogleAccountLoginFlow();

        case 'CONNECT_OAUTH_ACCOUNT':
          return (async () => {
            const clientId = msg.clientId || bg.state.currentSettings.oauthClientId;
            const oauthAcc = await global.PocketMailGmailClient.launchLocalGoogleOAuth(clientId);
            const list = bg.state.currentSettings.oauthAccounts || [];
            const existingIdx = list.findIndex((a) => a.email === oauthAcc.email);
            if (existingIdx >= 0) {
              list[existingIdx] = oauthAcc;
            } else {
              bg.state.currentSettings.oauthAccounts = [...list, oauthAcc];
            }
            if (msg.clientId) bg.state.currentSettings.oauthClientId = msg.clientId;
            await browser.storage.local.set({ settings: bg.state.currentSettings });
            const state = await bg.syncAllAccounts();
            return { ok: true, account: oauthAcc, state, settings: bg.state.currentSettings };
          })();

        case 'REMOVE_ACCOUNT':
          return (async () => {
            const email = msg.email;
            bg.state.currentSettings.oauthAccounts = (bg.state.currentSettings.oauthAccounts || []).filter(
              (a) => a.email !== email
            );
            if (!bg.state.currentSettings.accountConfigs[email]) {
              bg.state.currentSettings.accountConfigs[email] = {};
            }
            bg.state.currentSettings.accountConfigs[email].disabled = true;
            await browser.storage.local.set({ settings: bg.state.currentSettings });
            const state = await bg.syncAllAccounts();
            return { ok: true, state, settings: bg.state.currentSettings };
          })();

        case 'UPDATE_SETTINGS':
          return (async () => {
            const patch = msg.settings || {};
            const prevPoll = bg.state.currentSettings.pollIntervalSeconds;
            const prevSocialTheme = bg.state.currentSettings.socialAppThemeMode;
            const prevContextEnabled = bg.state.currentSettings.contextMenuEnabled;
            const prevContextBehavior = bg.state.currentSettings.contextMenuOpenBehavior;

            bg.state.currentSettings = schema.normalizeSettingsPatch(patch, bg.state.currentSettings);

            if (
              patch.globalShortcuts !== undefined ||
              patch.appShortcuts !== undefined ||
              patch.customMediaApps !== undefined
            ) {
              await bg.syncBrowserCommandsFromSettings();
            }
            if (
              bg.state.currentSettings.contextMenuEnabled !== prevContextEnabled ||
              bg.state.currentSettings.contextMenuOpenBehavior !== prevContextBehavior
            ) {
              await bg.syncContextMenusFromSettings();
            }
            if (
              (patch.socialAppThemeMode !== undefined && patch.socialAppThemeMode !== prevSocialTheme) ||
              patch.customMediaApps !== undefined
            ) {
              bg.state.bypassPersistentCacheUntil = Date.now() + 12000;
            }
            if (
              patch.socialAppThemeMode !== undefined &&
              patch.socialAppThemeMode !== 'true-night' &&
              patch.socialAppThemeMode !== 'midnight-oled'
            ) {
              bg.clearSocialThemeLiveCookies();
            }

            bg.scheduleSettingsSave(true);
            bg.updateToolbarBadge();

            Array.from(bg.bgAudioPool.keys()).forEach((appId) => {
              if (!bg.isAppAllowedForBgAudio(appId)) {
                bg.stopSingleBackgroundAudioFrame(appId);
              }
            });
            if (bg.state.sidebarPortCount === 0) {
              Array.from(bg.bgSpEmePlayers.keys()).forEach((appId) => {
                if (!bg.isAppAllowedForBgAudio(appId)) {
                  bg.cleanupSpEmePlayer(appId);
                }
              });
            }
            bg.refreshBgAudioIndicator();

            if (patch.autoPauseOnTabAudio !== undefined || patch.tabAudioBehavior !== undefined) {
              bg.tabAudio.manualOverrideWhileTabAudible = false;
              bg.tabAudio.audibleOverrideTabIds.clear();
              if (bg.getTabAudioBehavior() !== 'off') {
                bg.setTabAudioPauseTrigger(false, false);
              }
              bg.checkExternalTabAudioState();
            }
            if (patch.pollIntervalSeconds !== undefined && bg.state.currentSettings.pollIntervalSeconds !== prevPoll) {
              bg.restartPollingTimer();
            }
            const needsAccountSync =
              patch.demoMode !== undefined ||
              patch.accountConfigs !== undefined ||
              patch.maxAccounts !== undefined ||
              patch.maxEmailsPerAccount !== undefined ||
              patch.oauthAccounts !== undefined;
            const state = needsAccountSync ? await bg.syncAllAccounts() : bg.state.cachedState;
            if (!needsAccountSync) {
              bg.broadcastStateUpdated();
            }
            return { ok: true, settings: bg.state.currentSettings, state };
          })();

        case 'EXPORT_SETTINGS': {
          const appVersion =
            (typeof browser !== 'undefined' && browser.runtime && typeof browser.runtime.getManifest === 'function'
              ? browser.runtime.getManifest()?.version
              : null) || '2.8.0';
          return Promise.resolve({
            ok: true,
            payload: schema.buildSettingsExportPayload(bg.state.currentSettings, { appVersion })
          });
        }

        case 'IMPORT_SETTINGS':
          return (async () => {
            const rawInput = msg.json !== undefined ? msg.json : msg.payload !== undefined ? msg.payload : msg.data;
            const validation = schema.validateAndSanitizeImportPayload(rawInput);
            if (!validation.ok) {
              return { ok: false, error: validation.error };
            }
            // Preserve signed-in OAuth accounts and ephemeral session state
            const preservedOAuth = Array.isArray(bg.state.currentSettings.oauthAccounts)
              ? bg.state.currentSettings.oauthAccounts
              : [];
            bg.state.currentSettings = schema.normalizeSettings({
              ...validation.settings,
              oauthAccounts: preservedOAuth
            });
            bg.state.bypassPersistentCacheUntil = Date.now() + 12000;
            bg.scheduleSettingsSave(true);
            await bg.syncBrowserCommandsFromSettings();
            await bg.syncContextMenusFromSettings();
            bg.restartPollingTimer();
            bg.updateToolbarBadge();
            bg.refreshBgAudioIndicator(true);
            bg.checkExternalTabAudioState();
            const state = await bg.syncAllAccounts();
            return {
              ok: true,
              settings: bg.state.currentSettings,
              state,
              warnings: validation.warnings || []
            };
          })();

        case 'PLAY_SOUND_PREVIEW':
          global.PocketMailSound.playNotificationSound(
            msg.soundId || bg.state.currentSettings.soundId,
            msg.volume !== undefined ? msg.volume : bg.state.currentSettings.soundVolume,
            msg.customAudioData || bg.state.currentSettings.customAudioData
          );
          return Promise.resolve({ ok: true });

        case 'RESTORE_READ_EMAILS':
          return (async () => {
            bg.state.localOverlay.readIds = {};
            await bg.saveOverlay();
            const state = await bg.syncAllAccounts();
            return { ok: true, state, snoozed: bg.state.localOverlay.snoozed };
          })();

        case 'CLEAR_LOCAL_CACHE':
          return (async () => {
            bg.state.localOverlay = {
              overlayVersion: 2,
              readIds: {},
              trashedIds: {},
              archivedIds: {},
              starredIds: {},
              snoozed: {},
              seenIds: {},
              sentMessages: []
            };
            await bg.saveOverlay();
            const state = await bg.syncAllAccounts();
            return { ok: true, state };
          })();

        case 'CLEAR_PERSISTENT_SESSIONS':
          return (async () => {
            bg.state.currentSettings = {
              ...bg.state.currentSettings,
              persistentLastActiveAppId: 'pocketmail',
              persistentOpenAppIds: [],
              persistentSavedAppUrls: {}
            };
            bg.scheduleSettingsSave(true);
            bg.updateToolbarBadge();
            bg.broadcastStateUpdated();
            return { ok: true, settings: bg.state.currentSettings };
          })();

        case 'CHECK_SIDEBAR_CONTEXT': {
          const isFirefoxSidebar = !sender || !sender.tab;
          const isCompanionWindow = Boolean(
            sender && sender.tab && bg.companionWindowIds.has(sender.tab.windowId)
          );
          return Promise.resolve({
            isSidebar: Boolean(isFirefoxSidebar || isCompanionWindow || msg.hasSidebarHint),
            isFirefoxSidebar,
            isCompanionWindow,
            totalUnread: bg.state.cachedState.totalUnread || 0,
            settings: bg.state.currentSettings
          });
        }

        case 'SIDEBAR_NAVIGATE_APP':
          return (async () => {
            const targetUrl = msg.url || 'https://www.instagram.com/direct/inbox/#pm-sidebar';
            if (sender && sender.tab && bg.companionWindowIds.has(sender.tab.windowId)) {
              if (bg.companionTabIds && typeof sender.tab.id === 'number') {
                bg.companionTabIds.add(sender.tab.id);
              }
              await browser.tabs.update(sender.tab.id, { url: targetUrl });
              return { ok: true };
            }
            if (browser.sidebarAction && browser.sidebarAction.setPanel) {
              await browser.sidebarAction.setPanel({ panel: targetUrl });
              return { ok: true };
            }
            return { ok: false };
          })();

        case 'SIDEBAR_NAVIGATE_POCKETMAIL':
          return (async () => {
            if (sender && sender.tab && bg.companionWindowIds.has(sender.tab.windowId)) {
              const popUrl = browser.runtime.getURL('src/popup/popup.html?popout=1');
              await browser.tabs.update(sender.tab.id, { url: popUrl });
              return { ok: true };
            }
            if (browser.sidebarAction && browser.sidebarAction.setPanel) {
              const sidebarUrl = browser.runtime.getURL('src/popup/popup.html?sidebar=1');
              await browser.sidebarAction.setPanel({ panel: sidebarUrl });
              return { ok: true };
            }
            return { ok: false };
          })();

        case 'OPEN_COMPANION_WINDOW':
          return (async () => {
            const url = msg.url || browser.runtime.getURL('src/popup/popup.html?popout=1');
            const win = await browser.windows.create({
              url,
              type: 'popup',
              width: msg.width || 480,
              height: msg.height || 820
            });
            if (win && win.id) {
              if (typeof bg.registerCompanionWindow === 'function') {
                bg.registerCompanionWindow(win);
              } else {
                bg.companionWindowIds.add(win.id);
              }
            }
            return { ok: true, windowId: win?.id };
          })();

        case 'OPEN_URL_IN_SIDEBAR':
          if (msg.fromBackground) return undefined;
          return Promise.resolve(bg.openUrlInFoxHubSurface(msg.url, msg.openBehavior));

        case 'OPEN_APP_FROM_CONTEXT_MENU':
          if (msg.appId) {
            bg.launchAppViaShortcut(String(msg.appId), msg.openBehavior || '');
            return Promise.resolve({ ok: true });
          }
          if (msg.url) {
            return Promise.resolve(bg.openUrlInFoxHubSurface(msg.url, msg.openBehavior));
          }
          return Promise.resolve({ ok: false });

        case 'UPDATE_PERSISTENT_SESSION':
          handleUpdatePersistentSession(msg);
          return Promise.resolve({ ok: true });

        case 'PREINIT_BG_SP_PLAYER': {
          const appId = msg.appId || 'spotify';
          if (!bg.bgSpEmePlayers.has(appId)) {
            bg.ensureBgSpEmePlayer(appId, 'audio/mp4; codecs="mp4a.40.2"', 0, 'sidebar');
          }
          return Promise.resolve({ ok: true });
        }

        case 'PM_BYPASS_PERSISTENT_CACHE_ONCE':
          bg.state.bypassPersistentCacheUntil = Date.now() + 8000;
          return Promise.resolve({ ok: true });

        case 'PREPARE_SIDEBAR_DOCK_APP':
          if (msg.appId) {
            bg.state.pendingShortcutLaunch = { appId: msg.appId, openMode: 'sidebar', ts: Date.now() };
          }
          return Promise.resolve({ ok: true });

        case 'SIDEBAR_SP_TAKEOVER_BEGIN': {
          const appId = msg.appId || 'spotify';
          bg.state.lastSidebarPlayIntentAt = 0;
          const activeSp = bg.bgSpEmePlayers.get(appId);
          if (activeSp) {
            activeSp.explicitSidebarPlayIntent = false;
            const knownLive = bg.liveMediaPlaybackState.get(appId);
            if (!activeSp.trackTitle && knownLive && knownLive.title && knownLive.title !== 'Spotify') {
              activeSp.trackTitle = knownLive.title;
            }
          }
          if (bg.isTabAutoPauseEnforced()) {
            bg.removeBgAudioIframeOnly(appId);
            if (activeSp && !activeSp.disposed) {
              activeSp.remotePaused = true;
              activeSp.autoPausedByTab = bg.getTabAudioBehavior() === 'pause-resume';
              if (activeSp.videoEl) {
                activeSp.videoEl.muted = true;
                if (!activeSp.videoEl.paused) {
                  try {
                    activeSp.videoEl.pause();
                  } catch (_) {}
                }
              }
            }
            bg.logAudioDiag('sidebar-takeover-autopaused', { appId });
            return Promise.resolve({ ok: true, resume: false, autoPausedByTab: true });
          }
          const mirrorPlaying = Boolean(
            activeSp && !activeSp.disposed && activeSp.videoEl && !activeSp.videoEl.paused && !activeSp.remotePaused
          );
          const wasBgPlaying = Boolean(
            (mirrorPlaying || (bg.bgAudioPool.has(appId) && !(activeSp && activeSp.explicitUserPause))) &&
              !bg.isTabAutoPauseEnforced()
          );
          if (!bg.bgAudioPool.has(appId) && !mirrorPlaying) {
            return Promise.resolve({ ok: true, resume: false });
          }
          const spMeta = buildBgTakeoverMeta(appId);
          if (wasBgPlaying && activeSp && !activeSp.disposed) {
            activeSp.lastPlayedAt = Date.now();
            activeSp.awaitingBgFrameHandoff = true;
            activeSp.handoffStartedAt = Date.now();
            activeSp.handoffSource = 'sidebar';
            activeSp.remotePaused = false;
            if (activeSp.videoEl) {
              activeSp.videoEl.playbackRate = 1.0;
            }
            if (appId === 'spotify') {
              bg.ensureStagingSpEmePlayer(appId, activeSp.mime || 'audio/mp4; codecs="mp4a.40.2"', 0, 'sidebar');
            }
            const remBuf = bg.getSpBufferedEnd(activeSp) - (Number(activeSp.videoEl?.currentTime) || 0);
            bg.logAudioDiag('sidebar-takeover-begin', {
              appId,
              trackTitle: spMeta.trackTitle,
              remBuf: Math.round(remBuf * 100) / 100,
              ct: Math.round((Number(activeSp.videoEl?.currentTime) || 0) * 100) / 100
            });
            if (appId !== 'spotify') {
              activeSp.retireBgWhenBuffered = false;
              clearTimeout(activeSp.retireBgTimer);
              bg.removeBgAudioIframeOnly(appId);
            } else {
              activeSp.retireBgWhenBuffered = false;
              clearTimeout(activeSp.retireBgTimer);
            }
          } else {
            bg.removeBgAudioIframeOnly(appId);
          }
          return Promise.resolve({ ok: true, resume: wasBgPlaying, ...spMeta });
        }

        case 'PM_SP_SIDEBAR_PLAYPAUSE_CLICK': {
          const appId = msg.appId || 'spotify';
          const aria = String(msg.aria || '').toLowerCase();
          bg.logAudioDiag('sidebar-playpause-click', { appId, aria });
          if (aria.includes('pause')) {
            const sp = bg.bgSpEmePlayers.get(appId);
            if (sp && sp.videoEl) {
              sp.awaitingBgFrameHandoff = false;
              sp.remotePaused = true;
              sp.explicitUserPause = true;
              try {
                sp.lastPauseTrigger = 'sidebar-playpause-toggle';
                sp.videoEl.pause();
              } catch (_) {}
            }
            if (bg.bgAudioPool.has(appId)) {
              bg.removeBgAudioIframeOnly(appId);
            }
            const st = bg.liveMediaPlaybackState.get(appId);
            if (st) {
              st.isPlaying = false;
              st.updatedAt = Date.now();
            }
            bg.refreshBgAudioIndicator();
          }
          return Promise.resolve({ ok: true });
        }

        case 'SIDEBAR_CLOSED_HANDOFF': {
          const s = bg.state.currentSettings;
          const mode = s.persistenceMode || 'selected';
          if (mode === 'eco' && s.keepAudioPlayingWhenClosed === false) {
            bg.stopBackgroundAudioFrames();
            return Promise.resolve({ ok: true });
          }
          if (msg.activeAppId && (bg.isAppAllowedForPersistence(msg.activeAppId) || bg.isAppAllowedForBgAudio(msg.activeAppId))) {
            s.persistentLastActiveAppId = msg.activeAppId;
          } else if (
            Array.isArray(msg.playingApps) &&
            msg.playingApps.length > 0 &&
            msg.playingApps[0].appId &&
            (bg.isAppAllowedForPersistence(msg.playingApps[0].appId) || bg.isAppAllowedForBgAudio(msg.playingApps[0].appId))
          ) {
            s.persistentLastActiveAppId = msg.playingApps[0].appId;
          }
          if (Array.isArray(msg.openPersistentAppIds)) {
            s.persistentOpenAppIds = msg.openPersistentAppIds.filter((id) => bg.isAppAllowedForPersistence(id));
          }
          if (msg.savedUrls && typeof msg.savedUrls === 'object') {
            if (!s.persistentSavedAppUrls) s.persistentSavedAppUrls = {};
            Object.entries(msg.savedUrls).forEach(([id, u]) => {
              if (u && (bg.isAppAllowedForPersistence(id) || bg.isAppAllowedForBgAudio(id))) {
                s.persistentSavedAppUrls[id] = u;
              }
            });
          }
          bg.scheduleSettingsSave(false);
          if (Array.isArray(msg.playingApps) && bg.recordTrackUrlOriginalTitle) {
            msg.playingApps.forEach((pApp) => {
              if (pApp && pApp.appId && pApp.url && pApp.title) {
                bg.recordTrackUrlOriginalTitle(pApp.appId, pApp.url, pApp.title);
              }
            });
          }
          if (s.keepAudioPlayingWhenClosed === false) {
            bg.stopBackgroundAudioFrames();
            return Promise.resolve({ ok: true });
          }
          bg.triggerSidebarClosedAudioHandoff(Array.isArray(msg.playingApps) ? msg.playingApps : []);
          bg.checkExternalTabAudioState();
          return Promise.resolve({ ok: true });
        }

        case 'STOP_BG_AUDIO_HANDOFF': {
          if (msg.onlyIfNoSidebar && bg.state.sidebarPortCount > 0) {
            return Promise.resolve({
              ok: true,
              skipped: true,
              activeBgApps: [],
              audibleAppId: bg.getAudibleBgAudioAppId(),
              nowPlaying: bg.getActiveNowPlayingState(),
              isAutoPausedByTabAudio: bg.isTabAutoPauseEnforced(),
              settings: bg.state.currentSettings
            });
          }
          const currentlyPausedByTab = bg.isTabAutoPauseEnforced();
          const activeBgApps = [];
          bg.bgAudioPool.forEach((val, id) => {
            let resumeUrl = val.url;
            const sp = bg.bgSpEmePlayers.get(id);
            if (id === 'youtube' && sp && !sp.disposed && sp.videoEl && sp.videoEl.currentTime > 1) {
              try {
                const u = new URL(resumeUrl);
                if (u.pathname.startsWith('/watch')) {
                  u.searchParams.set('t', `${Math.floor(sp.videoEl.currentTime)}s`);
                  resumeUrl = u.href;
                  val.url = resumeUrl;
                }
              } catch (_) {}
            }
            const actuallyPlaying = !currentlyPausedByTab && !(sp && sp.explicitUserPause);
            const spTitle = sp && sp.trackTitle ? String(sp.trackTitle).trim() : '';
            const prevSt = bg.liveMediaPlaybackState.get(id);
            const prevTitle = prevSt && prevSt.title ? String(prevSt.title).trim() : '';
            const resolvedTitle =
              (spTitle && spTitle.toLowerCase() !== 'spotify' ? spTitle : '') ||
              (prevTitle && prevTitle.toLowerCase() !== 'spotify' ? prevTitle : '') ||
              val.title ||
              '';
            const resolvedCt =
              sp && sp.videoEl && Number.isFinite(sp.videoEl.currentTime) && sp.videoEl.currentTime > 0
                ? Math.floor(sp.videoEl.currentTime)
                : Math.floor(Number(prevSt?.currentTime) || 0);
            const resolvedDur = (sp && Number(sp.trackDuration)) || Number(prevSt?.duration) || 0;
            let urlTrackTitle = '';
            if (id === 'spotify' && resumeUrl && bg.trackUrlOriginalTitleMap) {
              try {
                const p = (new URL(String(resumeUrl)).pathname || '').replace(/\/+$/, '');
                urlTrackTitle = bg.trackUrlOriginalTitleMap.get(`${id}:${p}`) || '';
              } catch (_) {}
            }
            activeBgApps.push({
              appId: id,
              url: resumeUrl,
              title: resolvedTitle || val.title,
              trackTitle: resolvedTitle,
              artist: prevSt?.artist || '',
              currentTime: resolvedCt,
              duration: resolvedDur,
              resumeUrl,
              urlTrackTitle,
              autoPausedByTab: currentlyPausedByTab,
              bgMasterActive: false
            });
            bg.liveMediaPlaybackState.set(
              id,
              bg.normalizePlaybackMeta(
                id,
                {
                  isPlaying: actuallyPlaying,
                  currentTime: resolvedCt,
                  duration: resolvedDur,
                  resumeUrl,
                  title: resolvedTitle || prevSt?.title || '',
                  handedOffAt: actuallyPlaying ? Date.now() : undefined
                },
                prevSt
              )
            );
          });
          return Promise.resolve({
            ok: true,
            activeBgApps,
            audibleAppId: bg.getAudibleBgAudioAppId(),
            nowPlaying: bg.getActiveNowPlayingState(),
            isAutoPausedByTabAudio: currentlyPausedByTab,
            settings: bg.state.currentSettings
          });
        }

        case 'STOP_SINGLE_BG_AUDIO_APP':
          if (msg.appId) {
            bg.stopSingleBackgroundAudioFrame(msg.appId);
            if (msg.clearPlaybackState) {
              bg.liveMediaPlaybackState.delete(msg.appId);
            }
          }
          bg.refreshBgAudioIndicator();
          return Promise.resolve({ ok: true });

        case 'STOP_ALL_BG_AUDIO_APPS':
          bg.stopBackgroundAudioFrames();
          bg.liveMediaPlaybackState.clear();
          bg.refreshBgAudioIndicator();
          return Promise.resolve({ ok: true });

        case 'GET_BG_AUDIO_STATUS': {
          const activeBgApps = [];
          bg.bgAudioPool.forEach((val, id) => {
            activeBgApps.push({ appId: id, url: val.url, title: val.title });
          });
          return Promise.resolve({
            ok: true,
            activeBgApps,
            audibleAppId: bg.getAudibleBgAudioAppId(),
            nowPlaying: bg.getActiveNowPlayingState()
          });
        }

        case 'TOGGLE_NOW_PLAYING_COMMAND': {
          const cmdRes = bg.handleNowPlayingCommand(msg.appId, msg.command);
          return Promise.resolve({
            ...cmdRes,
            nowPlaying: bg.getActiveNowPlayingState()
          });
        }

        case 'GET_FRAME_OPT_BUNDLE': {
          const catalog = getMediaAppsCatalog();
          let urlHost = '';
          if (msg.url) {
            try {
              const parsed = new URL(String(msg.url));
              if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                urlHost = parsed.hostname.toLowerCase();
              }
            } catch (_) {}
          }
          const isGmailUrl = urlHost === 'mail.google.com' || urlHost.endsWith('.mail.google.com');
          const isYtMusicUrl = urlHost === 'music.youtube.com' || urlHost.endsWith('.music.youtube.com');
          const detected =
            msg.appId ||
            (isGmailUrl ? 'gmail' : '') ||
            (isYtMusicUrl ? 'yt-music' : '') ||
            (msg.url && catalog && typeof catalog.detectAppByUrl === 'function'
              ? catalog.detectAppByUrl(msg.url, bg.state.currentSettings)?.id
              : '') ||
            '';
          const safeAppId = String(detected || '').replace(/[^a-z0-9_-]/gi, '');
          const optimizerAppId = safeAppId === 'yt-music' ? 'youtube' : safeAppId;
          const optimizerPath = optimizerAppId ? `src/content/optimizers/${optimizerAppId}.js` : '';
          let cssPath = 'src/content/css/base.css';
          if (safeAppId === 'gmail') {
            cssPath = 'src/content/css/base.css';
          } else if (safeAppId === 'youtube' && isYtMusicUrl) {
            cssPath = 'src/content/css/yt-music.css';
          } else if (safeAppId) {
            cssPath = `src/content/css/${safeAppId}.css`;
          }
          return Promise.resolve({
            ok: true,
            appId: safeAppId,
            optimizerPath,
            cssPath,
            cssText: ''
          });
        }

        case 'GET_AUDIO_DIAGNOSTICS':
          return Promise.resolve({
            ok: true,
            diagnostics: bg.buildAudioDiagnosticsSnapshot()
          });

        case 'CLEAR_AUDIO_DIAGNOSTICS':
          bg.bgAudioDiagLog.length = 0;
          bg.logAudioDiag('diag-log-cleared');
          return Promise.resolve({
            ok: true,
            diagnostics: bg.buildAudioDiagnosticsSnapshot()
          });

        case 'LOG_CONTENT_AUDIO_DIAG':
          if (msg.event) {
            bg.logAudioDiag(String(msg.event), msg.details && typeof msg.details === 'object' ? msg.details : {});
          }
          return Promise.resolve({ ok: true });

        case 'EXTERNAL_TAB_MEDIA_PLAYING': {
          if (sender && sender.tab && bg.isExternalBrowserTab(sender.tab)) {
            const tid = sender.tab.id;
            if (Boolean(sender.tab.audible)) {
              if (typeof tid === 'number') {
                bg.tabAudio.knownActiveMediaTabIds.add(tid);
                bg.tabAudio.recentlyStoppedMediaTabMap.delete(tid);
                bg.tabAudio.silentTabHoldSince.delete(tid);
              }
              if (bg.tabAudio.pendingTabResumeTimer) {
                clearTimeout(bg.tabAudio.pendingTabResumeTimer);
                bg.tabAudio.pendingTabResumeTimer = null;
                bg.logAudioDiag('tab-resume-cancelled');
              }
              if (!(typeof tid === 'number' && bg.tabAudio.audibleOverrideTabIds.has(tid))) {
                bg.tabAudio.manualOverrideWhileTabAudible = false;
                bg.tabAudio.audibleOverrideTabIds.clear();
              }
              bg.checkExternalTabAudioState();
            } else {
              setTimeout(bg.checkExternalTabAudioState, 240);
            }
          }
          return Promise.resolve({ ok: true });
        }

        case 'EXTERNAL_TAB_MEDIA_STOPPED': {
          if (sender && sender.tab) {
            const tid = sender.tab.id;
            if (typeof tid === 'number') {
              bg.tabAudio.knownActiveMediaTabIds.delete(tid);
              bg.tabAudio.silentTabHoldSince.delete(tid);
              bg.tabAudio.recentlyStoppedMediaTabMap.set(tid, Date.now());
            }
            bg.checkExternalTabAudioState();
          }
          return Promise.resolve({ ok: true });
        }

        case 'GET_KEYBOARD_SHORTCUTS':
          return (async () => {
            const commands =
              browser.commands && typeof browser.commands.getAll === 'function'
                ? await browser.commands.getAll().catch(() => [])
                : [];
            return {
              ok: true,
              commands,
              globalShortcuts: { ...bg.DEFAULT_GLOBAL_SHORTCUTS, ...(bg.state.currentSettings.globalShortcuts || {}) },
              appShortcuts: { ...(bg.state.currentSettings.appShortcuts || {}) },
              appShortcutOpenMode: bg.state.currentSettings.appShortcutOpenMode || 'sidebar',
              quickSwitcherEnabled: bg.state.currentSettings.quickSwitcherEnabled !== false,
              quickSwitcherShortcut: bg.state.currentSettings.quickSwitcherShortcut || 'Ctrl+K'
            };
          })();

        case 'UPDATE_KEYBOARD_SHORTCUTS':
          return (async () => {
            const s = bg.state.currentSettings;
            if (msg.globalShortcuts && typeof msg.globalShortcuts === 'object') {
              s.globalShortcuts = {
                ...bg.DEFAULT_GLOBAL_SHORTCUTS,
                ...(s.globalShortcuts || {}),
                ...msg.globalShortcuts
              };
            }
            if (msg.appShortcuts && typeof msg.appShortcuts === 'object') {
              const cleaned = {};
              Object.entries(msg.appShortcuts).forEach(([k, v]) => {
                const sc = String(v || '').trim();
                if (k && sc) cleaned[k] = sc;
              });
              s.appShortcuts = cleaned;
            }
            if (typeof msg.appShortcutOpenMode === 'string' && msg.appShortcutOpenMode) {
              s.appShortcutOpenMode = msg.appShortcutOpenMode;
            }
            if (typeof msg.quickSwitcherEnabled === 'boolean') {
              s.quickSwitcherEnabled = msg.quickSwitcherEnabled;
            }
            if (typeof msg.quickSwitcherShortcut === 'string' && schema.isValidShortcutString(msg.quickSwitcherShortcut)) {
              s.quickSwitcherShortcut = schema.normalizeShortcutString(msg.quickSwitcherShortcut) || 'Ctrl+K';
            }
            const syncRes = await bg.syncBrowserCommandsFromSettings();
            bg.scheduleSettingsSave(true);
            bg.broadcastStateUpdated();
            const commands =
              browser.commands && typeof browser.commands.getAll === 'function'
                ? await browser.commands.getAll().catch(() => [])
                : [];
            return {
              ok: syncRes.ok,
              error: syncRes.error || null,
              settings: bg.state.currentSettings,
              commands
            };
          })();

        case 'RESET_KEYBOARD_SHORTCUTS':
          return (async () => {
            bg.state.currentSettings.globalShortcuts = { ...bg.DEFAULT_GLOBAL_SHORTCUTS };
            bg.state.currentSettings.appShortcuts = {};
            bg.state.currentSettings.appShortcutOpenMode = 'sidebar';
            bg.state.currentSettings.quickSwitcherEnabled = true;
            bg.state.currentSettings.quickSwitcherShortcut = 'Ctrl+K';
            await bg.resetAllBrowserCommandsToDefaults();
            bg.scheduleSettingsSave(true);
            bg.broadcastStateUpdated();
            const commands =
              browser.commands && typeof browser.commands.getAll === 'function'
                ? await browser.commands.getAll().catch(() => [])
                : [];
            return { ok: true, settings: bg.state.currentSettings, commands };
          })();

        case 'TRIGGER_APP_SHORTCUT':
          if (msg.appId) {
            bg.launchAppViaShortcut(String(msg.appId), msg.openMode || '');
          }
          return Promise.resolve({ ok: true });

        default:
          return Promise.resolve({ ok: false });
      }
    });
  }

  // Initialize on extension startup
  (async function init() {
    try {
      if (browser.sidebarAction && typeof browser.sidebarAction.setPanel === 'function') {
        browser.sidebarAction.setPanel({ panel: browser.runtime.getURL('src/popup/popup.html?sidebar=1') });
      }
    } catch (_) {}
    await bg.loadStorage();
    await bg.syncBrowserCommandsFromSettings();
    await bg.syncContextMenusFromSettings();
    bg.prewarmSocialCookieCache();
    bg.checkExternalTabAudioState();
    bg.updateToolbarBadge();
    await bg.syncAllAccounts();
    bg.restartPollingTimer();
  })();
})(window);
