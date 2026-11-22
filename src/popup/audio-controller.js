/**
 * FoxHub — Background Audio Handoff, MSE/EME Bridges, Now Playing Selector & Pagehide Handoff
 * Preserves 100% of v2.7.9 Spotify/YouTube/SoundCloud keep-alive & tab-audio auto-pause/resume behavior.
 */

(function (global) {
  const P = (global.FoxHubPopup = global.FoxHubPopup || {});
  const recentPriorityPausedUntilMap = new Map();

  P.cleanupSidebarMsePlayer = function (appId) {
    const st = P.state;
    const player = st.sidebarMsePlayers.get(appId);
    if (!player) return;
    st.sidebarMsePlayers.delete(appId);
    try {
      player.audioEl.pause();
      player.audioEl.removeAttribute('src');
      player.audioEl.load();
      player.audioEl.remove();
    } catch (_) {}
    try {
      if (player.objUrl) URL.revokeObjectURL(player.objUrl);
    } catch (_) {}
  };

  P.cleanupSidebarSpEmePlayer = function () {};

  P.isAppAllowedForBgAudio = function (appId) {
    const s = P.state.appSettings;
    if (!appId || appId === 'pocketmail' || appId.startsWith('adhoc-')) return false;
    if (s.keepAudioPlayingWhenClosed === false) return false;
    const allowedList = Array.isArray(s.bgAudioAppIds)
      ? s.bgAudioAppIds
      : ['spotify', 'youtube', 'soundcloud'];
    return allowedList.includes(appId);
  };

  P.isPlayableYouTubeUrl = function (url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const u = new URL(url);
      const h = u.hostname.toLowerCase();
      if (h.includes('music.youtube.com')) return true;
      if (!h.includes('youtube.com')) return true;
      const p = u.pathname || '/';
      return (
        p.startsWith('/watch') ||
        p.startsWith('/shorts') ||
        p.startsWith('/live') ||
        p.startsWith('/embed')
      );
    } catch (_) {
      return false;
    }
  };

  P.saveFastBootCache = function (overrideActiveId = '') {
    const st = P.state;
    try {
      const savedUrls = {};
      Object.entries(st.appSettings.persistentSavedAppUrls || {}).forEach(([id, u]) => {
        if (u && !id.startsWith('adhoc-') && !P.isTransientAuthOrBootUrl?.(u)) savedUrls[id] = u;
      });
      st.hibernatedAppUrls.forEach((u, id) => {
        if (u && !id.startsWith('adhoc-') && !P.isTransientAuthOrBootUrl?.(u)) savedUrls[id] = u;
      });
      st.mediaFramePool.forEach((entry, id) => {
        if (id.startsWith('adhoc-')) return;
        const bestUrl =
          entry.currentUrl && !P.isTransientAuthOrBootUrl?.(entry.currentUrl)
            ? entry.currentUrl
            : entry.restoredUrl && !P.isTransientAuthOrBootUrl?.(entry.restoredUrl)
              ? entry.restoredUrl
              : '';
        if (bestUrl) savedUrls[id] = bestUrl;
        if (P.isAppPersistent?.(id)) st.knownOpenPersistentIds.add(id);
      });
      const openPersistentAppIds = Array.from(st.knownOpenPersistentIds).filter((id) => P.isAppPersistent?.(id));
      const candidateId = overrideActiveId || st.activeRailAppId || '';
      const persistentTargetId =
        candidateId && candidateId !== 'pocketmail' && !candidateId.startsWith('adhoc-') && P.isAppPersistent?.(candidateId)
          ? candidateId
          : candidateId === 'pocketmail' && st.appSettings.persistentLastActiveAppId === 'pocketmail'
            ? 'pocketmail'
            : st.appSettings.persistentLastActiveAppId || 'pocketmail';
      window.localStorage.setItem(
        'pm_fast_boot_v1',
        JSON.stringify({
          activeAppId: persistentTargetId,
          openPersistentAppIds,
          savedUrls,
          settings: {
            ...st.appSettings,
            persistentLastActiveAppId: persistentTargetId,
            persistentOpenAppIds: openPersistentAppIds,
            persistentSavedAppUrls: savedUrls
          },
          ts: Date.now()
        })
      );
    } catch (_) {}
  };

  P.syncPersistentSessionToBackground = function (appId, url, playback = null, explicitMailClick = false) {
    const st = P.state;
    if (st.IS_POPOUT_VIEW) return;
    if (appId && appId.startsWith('adhoc-')) return;
    if ((st.appSettings.persistenceMode || 'selected') === 'eco' && !P.isAppAllowedForBgAudio(appId)) return;
    if (appId && (P.isAppPersistent?.(appId) || P.isAppAllowedForBgAudio(appId))) {
      if (P.isAppPersistent?.(appId)) {
        st.knownOpenPersistentIds.add(appId);
      }
      if (url && !P.isTransientAuthOrBootUrl?.(url)) {
        st.hibernatedAppUrls.set(appId, url);
      }
    }
    if (
      st.activeRailAppId &&
      st.activeRailAppId !== 'pocketmail' &&
      !st.activeRailAppId.startsWith('adhoc-') &&
      (P.isAppPersistent?.(st.activeRailAppId) || P.isAppAllowedForBgAudio(st.activeRailAppId))
    ) {
      st.appSettings.persistentLastActiveAppId = st.activeRailAppId;
    } else if (st.activeRailAppId === 'pocketmail' && explicitMailClick) {
      st.appSettings.persistentLastActiveAppId = 'pocketmail';
    }
    P.saveFastBootCache();
    if (!st.sidebarInitCompleted) return;
    const safePlayback =
      playback && appId && !P.isAppAllowedForBgAudio(appId)
        ? { ...playback, isPlaying: false }
        : playback;
    const payload = {
      type: 'UPDATE_PERSISTENT_SESSION',
      activeAppId: st.activeRailAppId,
      explicitMailClick: explicitMailClick || undefined,
      openPersistentAppIds: Array.from(st.knownOpenPersistentIds).filter((id) => P.isAppPersistent?.(id)),
      appId: appId || undefined,
      url: url || undefined,
      playback: safePlayback || undefined
    };
    if (st.sidebarLifecyclePort) {
      try {
        st.sidebarLifecyclePort.postMessage(payload);
        return;
      } catch (_) {}
    }
    browser.runtime.sendMessage(payload).catch(() => {});
  };

  P.pauseOtherSidebarMediaFrames = function (activeAudioAppId) {
    const st = P.state;
    // Strict priority to the currently selected foreground app:
    // background music heartbeats must NEVER auto-pause the user's selected app (e.g., Instagram Reels).
    if (!activeAudioAppId || activeAudioAppId !== st.activeRailAppId) {
      return;
    }

    const activeIsBgAudioApp = P.isAppAllowedForBgAudio(activeAudioAppId);
    const otherIds = new Set([
      ...st.mediaFramePool.keys(),
      ...st.framePlaybackStates.keys(),
      ...st.pendingSidebarAudioTakeoverSet,
      ...st.bgMasterAudioSet,
      ...(st.currentAudibleBgAppId ? [st.currentAudibleBgAppId] : []),
      ...(st.bgNowPlayingState?.appId ? [st.bgNowPlayingState.appId] : [])
    ]);

    let pausedAny = false;
    otherIds.forEach((id) => {
      if (!id || id === activeAudioAppId) return;
      const entry = st.mediaFramePool.get(id);
      const pb = st.framePlaybackStates.get(id);
      const isBgNpPlaying = Boolean(st.bgNowPlayingState && st.bgNowPlayingState.appId === id && st.bgNowPlayingState.isPlaying);
      const wasActiveOrPlaying = Boolean(
        (pb && pb.isPlaying) ||
          isBgNpPlaying ||
          st.sidebarMsePlayers.has(id) ||
          st.pendingSidebarAudioTakeoverSet.has(id) ||
          st.bgMasterAudioSet.has(id) ||
          st.currentAudibleBgAppId === id
      );

      if (pb && pb.isPlaying) {
        pb.isPlaying = false;
        pb.updatedAt = Date.now();
        pausedAny = true;
      }
      if (isBgNpPlaying) {
        st.bgNowPlayingState = {
          ...st.bgNowPlayingState,
          isPlaying: false,
          updatedAt: Date.now()
        };
        pausedAny = true;
      }
      if (st.currentAudibleBgAppId === id) {
        st.currentAudibleBgAppId = null;
        pausedAny = true;
      }
      P.cleanupSidebarMsePlayer(id);
      P.cleanupSidebarSpEmePlayer(id);
      const wasPendingTakeover = st.pendingSidebarAudioTakeoverSet.has(id);
      st.pendingSidebarAudioTakeoverSet.delete(id);
      st.bgMasterAudioSet.delete(id);

      const otherIsBgMusicApp = P.isAppAllowedForBgAudio(id);
      if (!activeIsBgAudioApp && otherIsBgMusicApp) {
        // Selected foreground social app (e.g., Instagram Reels) takes audio priority:
        // cleanly pause background music without wiping its track state or double-toggling Spotify's button.
        recentPriorityPausedUntilMap.set(id, Date.now() + 2600);
        if (wasPendingTakeover) {
          browser.runtime.sendMessage({ type: 'ABORT_SIDEBAR_SP_TAKEOVER', appId: id }).catch(() => {});
        }
        if (wasActiveOrPlaying || wasPendingTakeover) {
          pausedAny = true;
          browser.runtime
            .sendMessage({ type: 'TOGGLE_NOW_PLAYING_COMMAND', appId: id, command: 'pause' })
            .then((res) => {
              if (res && res.nowPlaying) {
                st.bgNowPlayingState = res.nowPlaying;
              }
              P.renderOperaRail?.();
              P.renderNowPlayingBar?.();
            })
            .catch(() => {
              if (entry?.frame?.contentWindow) {
                try {
                  entry.frame.contentWindow.postMessage(
                    { target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' },
                    '*'
                  );
                } catch (_) {}
              }
            });
        } else if (entry?.frame?.contentWindow) {
          try {
            entry.frame.contentWindow.postMessage(
              { target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' },
              '*'
            );
          } catch (_) {}
        }
        return;
      }

      if (entry) {
        entry.suppressedWhileInactive = true;
      }
      if (wasActiveOrPlaying || entry) {
        pausedAny = true;
        browser.runtime
          .sendMessage({ type: 'STOP_SINGLE_BG_AUDIO_APP', appId: id, clearPlaybackState: true })
          .catch(() => {});
      }
      if (entry?.frame?.contentWindow) {
        try {
          entry.frame.contentWindow.postMessage(
            { target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' },
            '*'
          );
        } catch (_) {}
      }
    });

    const activeEntry = st.mediaFramePool.get(activeAudioAppId);
    if (activeEntry) {
      activeEntry.suppressedWhileInactive = false;
    }
    if (pausedAny) {
      P.renderOperaRail?.();
      P.renderNowPlayingBar?.();
    }
  };

  P.getResolvedNowPlayingState = function () {
    const st = P.state;
    const appsApi = P.getAppsApi();
    const bgNp = st.bgNowPlayingState;

    const enrich = (raw) => {
      if (!raw || !raw.appId) return null;
      const appMeta = appsApi?.getAppById?.(raw.appId, st.appSettings);
      const isMatch = appMeta && appMeta.id === raw.appId;
      const appName = raw.appName || (isMatch ? appMeta.name : raw.appId);
      const color = raw.color || (isMatch ? appMeta.color : '') || '#1DB954';
      return {
        appId: raw.appId,
        appName,
        color,
        isPlaying: st.isAutoPausedByExternalTab ? false : Boolean(raw.isPlaying),
        muted: Boolean(raw.muted),
        title: raw.title || appName,
        artist: raw.artist || '',
        album: raw.album || '',
        artworkUrl: raw.artworkUrl || '',
        currentTime: Number(raw.currentTime) || 0,
        duration: Number(raw.duration) || 0,
        canPrev: raw.canPrev !== false,
        canNext: raw.canNext !== false,
        resumeUrl: raw.resumeUrl || '',
        updatedAt: raw.updatedAt || Date.now()
      };
    };

    if (bgNp && bgNp.appId && bgNp.isPlaying && !st.isAutoPausedByExternalTab) {
      const localPb = st.framePlaybackStates.get(bgNp.appId);
      if (!localPb || (bgNp.updatedAt || 0) >= (localPb.updatedAt || 0) - 2000) {
        return enrich(bgNp);
      }
    }

    const now = Date.now();
    let bestId = null;
    let bestScore = -1;
    const musicSet = new Set(['spotify', 'youtube', 'soundcloud', 'apple-music']);

    st.framePlaybackStates.forEach((pb, id) => {
      if (!pb) return;
      const isMusicOrBg = musicSet.has(id) || P.isAppAllowedForBgAudio(id);
      if (!isMusicOrBg) return;
      const isPlaying =
        !st.isAutoPausedByExternalTab &&
        (Boolean(pb.isPlaying) ||
          st.sidebarMsePlayers.has(id) ||
          st.pendingSidebarAudioTakeoverSet.has(id) ||
          st.bgMasterAudioSet.has(id) ||
          st.currentAudibleBgAppId === id);
      if (!isPlaying && now - (pb.updatedAt || 0) > 30 * 60 * 1000) return;
      const score = (isPlaying ? 10000000000000 : 0) + (pb.updatedAt || 0);
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    });

    if (bestId) {
      const pb = st.framePlaybackStates.get(bestId);
      const isPlaying =
        !st.isAutoPausedByExternalTab &&
        (Boolean(pb.isPlaying) ||
          st.sidebarMsePlayers.has(bestId) ||
          st.pendingSidebarAudioTakeoverSet.has(bestId) ||
          st.bgMasterAudioSet.has(bestId) ||
          st.currentAudibleBgAppId === bestId);
      return enrich({
        ...pb,
        appId: bestId,
        isPlaying
      });
    }

    if (bgNp && bgNp.appId && now - (bgNp.updatedAt || 0) <= 30 * 60 * 1000) {
      return enrich(bgNp);
    }

    return null;
  };

  P.sendNowPlayingCommand = async function (appId, command, extra = {}) {
    const st = P.state;
    if (!appId || !command) return null;
    if (command === 'play_pause' || command === 'prev' || command === 'next') {
      recentPriorityPausedUntilMap.delete(appId);
    }
    try {
      const payload = {
        type: 'TOGGLE_NOW_PLAYING_COMMAND',
        appId,
        command
      };
      if (command === 'seek' && Number.isFinite(Number(extra?.seekTime))) {
        payload.seekTime = Math.max(0, Number(extra.seekTime));
      }
      const res = await browser.runtime.sendMessage(payload);
      if (res) {
        if (res.nowPlaying) {
          st.bgNowPlayingState = res.nowPlaying;
        }
        const prev = st.framePlaybackStates.get(appId);
        if (
          prev ||
          typeof res.isPlaying === 'boolean' ||
          typeof res.muted === 'boolean' ||
          typeof res.currentTime === 'number'
        ) {
          st.framePlaybackStates.set(appId, {
            ...(prev || {}),
            isPlaying: typeof res.isPlaying === 'boolean' ? res.isPlaying : Boolean(prev?.isPlaying),
            muted: typeof res.muted === 'boolean' ? res.muted : Boolean(prev?.muted),
            currentTime:
              typeof res.currentTime === 'number'
                ? res.currentTime
                : payload.seekTime !== undefined
                  ? payload.seekTime
                  : Number(prev?.currentTime) || 0,
            updatedAt: Date.now()
          });
        }
        if (res.isPlaying === false && st.currentAudibleBgAppId === appId) {
          st.currentAudibleBgAppId = null;
        } else if (res.isPlaying === true) {
          st.currentAudibleBgAppId = appId;
          st.framePlaybackStates.forEach((pb, otherId) => {
            if (otherId !== appId && pb && pb.isPlaying) {
              pb.isPlaying = false;
            }
          });
        }
      }
      P.renderOperaRail?.();
      P.renderNowPlayingBar?.();
      return res;
    } catch (_) {
      return null;
    }
  };

  P.handleBgAudioStatusChanged = function (msg) {
    if (!msg || typeof msg !== 'object') return;
    const st = P.state;
    const appsApi = P.getAppsApi();
    const isKnownApp = (id) => {
      if (!id) return false;
      if (!appsApi?.getAppById) return true;
      const meta = appsApi.getAppById(id, st.appSettings);
      return Boolean(meta && meta.id === id);
    };

    const rawAudibleId = msg.audibleAppId || null;
    const hasUnknownAudible = Boolean(rawAudibleId && !isKnownApp(rawAudibleId));
    const npAppId = msg.nowPlaying && msg.nowPlaying.appId ? msg.nowPlaying.appId : '';
    const hasUnknownNp = Boolean(npAppId && !isKnownApp(npAppId));

    if (
      (hasUnknownAudible && !npAppId) ||
      (hasUnknownNp && !rawAudibleId) ||
      (hasUnknownAudible && hasUnknownNp)
    ) {
      return;
    }

    if (!rawAudibleId) {
      st.currentAudibleBgAppId = null;
    } else if (!hasUnknownAudible) {
      st.currentAudibleBgAppId = rawAudibleId;
    }

    const activePlayingId =
      (!hasUnknownAudible && rawAudibleId) ||
      (!hasUnknownNp && npAppId && msg.nowPlaying.isPlaying ? npAppId : null);

    if (activePlayingId) {
      st.framePlaybackStates.forEach((pb, otherId) => {
        if (otherId !== activePlayingId && pb && pb.isPlaying) {
          pb.isPlaying = false;
        }
      });
      Array.from(st.pendingSidebarAudioTakeoverSet).forEach((otherId) => {
        if (otherId !== activePlayingId) st.pendingSidebarAudioTakeoverSet.delete(otherId);
      });
      Array.from(st.bgMasterAudioSet).forEach((otherId) => {
        if (otherId !== activePlayingId) st.bgMasterAudioSet.delete(otherId);
      });
    } else if (!rawAudibleId && (!msg.nowPlaying || (!hasUnknownNp && !msg.nowPlaying.isPlaying))) {
      st.framePlaybackStates.forEach((pb, id) => {
        if (pb && pb.isPlaying && !st.sidebarMsePlayers.has(id)) {
          pb.isPlaying = false;
        }
      });
      Array.from(st.pendingSidebarAudioTakeoverSet).forEach((id) => {
        if (!st.sidebarMsePlayers.has(id)) st.pendingSidebarAudioTakeoverSet.delete(id);
      });
      Array.from(st.bgMasterAudioSet).forEach((id) => {
        if (!st.sidebarMsePlayers.has(id)) st.bgMasterAudioSet.delete(id);
      });
    }

    if (msg.nowPlaying !== undefined) {
      if (!msg.nowPlaying || !npAppId) {
        st.bgNowPlayingState = null;
      } else if (!hasUnknownNp) {
        st.bgNowPlayingState = msg.nowPlaying;
        const prev = st.framePlaybackStates.get(npAppId) || {};
        st.framePlaybackStates.set(npAppId, {
          ...prev,
          ...msg.nowPlaying,
          updatedAt: msg.nowPlaying.updatedAt || Date.now()
        });
      }
    }
    P.renderOperaRail?.();
    P.renderNowPlayingBar?.();
  };

  P.handleForwardMediaCommand = function (msg) {
    const st = P.state;
    if (!msg || !msg.appId) return;
    const entry = st.mediaFramePool.get(msg.appId);
    if (!msg.skipFramePost && entry?.frame?.contentWindow) {
      try {
        entry.frame.contentWindow.postMessage(
          {
            target: 'pocketmail-media-frame',
            cmd: msg.cmd,
            command: msg.command,
            muted: msg.muted,
            currentTime: msg.currentTime,
            forceHarmonySeek: msg.forceHarmonySeek,
            isUserScrub: msg.isUserScrub,
            markShouldResume: msg.markShouldResume
          },
          '*'
        );
      } catch (_) {}
    }
    const mse = st.sidebarMsePlayers.get(msg.appId);
    if (mse && mse.audioEl) {
      if (msg.command === 'mute_toggle' && typeof msg.muted === 'boolean') {
        mse.audioEl.muted = msg.muted;
      } else if (msg.cmd === 'SEEK_SP_MEDIA' && Number.isFinite(Number(msg.currentTime))) {
        try { mse.audioEl.currentTime = Math.max(0, Number(msg.currentTime)); } catch (_) {}
      } else if (msg.cmd === 'PAUSE_LOCAL_MEDIA') {
        try { mse.audioEl.pause(); } catch (_) {}
      } else if (msg.cmd === 'RESUME_BG_SP_MEDIA') {
        mse.audioEl.play().catch(() => {});
      }
    }
  };

  P.handleTabAudioAutoPauseState = function (msg) {
    const st = P.state;
    const autoPaused = Boolean(msg.autoPaused);
    const stayStopped = Boolean(msg.stayStopped);
    st.isAutoPausedByExternalTab = autoPaused && !stayStopped;
    if (autoPaused) {
      if (stayStopped) {
        st.pendingSidebarAudioTakeoverSet.clear();
        st.bgMasterAudioSet.clear();
      }
      st.sidebarMsePlayers.forEach((player) => {
        if (player && player.audioEl && !player.audioEl.paused) {
          player.autoPausedByTab = !stayStopped;
          try {
            player.audioEl.pause();
          } catch (_) {}
        }
      });
      st.mediaFramePool.forEach((entry) => {
        try {
          entry?.frame?.contentWindow?.postMessage(
            {
              target: 'pocketmail-media-frame',
              cmd: stayStopped ? 'PAUSE_LOCAL_MEDIA' : 'TAB_AUDIO_AUTO_PAUSE'
            },
            '*'
          );
        } catch (_) {}
      });
    } else {
      st.isAutoPausedByExternalTab = false;
      st.sidebarMsePlayers.forEach((player) => {
        if (player && player.autoPausedByTab && player.audioEl && player.audioEl.paused) {
          player.autoPausedByTab = false;
          player.audioEl.play().catch(() => {});
        }
      });
      st.mediaFramePool.forEach((entry, id) => {
        try {
          const needsDeferredTakeoverResume =
            st.pendingSidebarAudioTakeoverSet.has(id) && !entry.autoResumeSentAt;
          if (needsDeferredTakeoverResume) {
            entry.autoResumeSentAt = Date.now();
            entry?.frame?.contentWindow?.postMessage(
              P.buildAutoResumePayload
                ? P.buildAutoResumePayload(id)
                : { target: 'pocketmail-media-frame', cmd: 'AUTO_RESUME_PLAYBACK' },
              '*'
            );
          } else {
            entry?.frame?.contentWindow?.postMessage(
              { target: 'pocketmail-media-frame', cmd: 'TAB_AUDIO_AUTO_RESUME' },
              '*'
            );
          }
        } catch (_) {}
      });
    }
    P.renderOperaRail?.();
    P.renderNowPlayingBar?.();
  };

  P.handleAudioWindowMessage = function (e, sourceEntry) {
    const st = P.state;
    const data = e.data;
    if (!data) return false;

    const resolveAppId = (fallback = '') =>
      sourceEntry?.appId ||
      (typeof data.flatFrameName === 'string' && data.flatFrameName.startsWith('pm-media-frame-')
        ? data.flatFrameName.replace('pm-media-frame-', '')
        : fallback);

    if (data.type === 'PM_SIDEBAR_TOOK_OVER_AUDIO') {
      const appId = resolveAppId('');
      if (appId) {
        st.pendingSidebarAudioTakeoverSet.delete(appId);
        st.bgMasterAudioSet.delete(appId);
        P.cleanupSidebarMsePlayer(appId);
        P.cleanupSidebarSpEmePlayer(appId);
        browser.runtime.sendMessage({ type: 'STOP_SINGLE_BG_AUDIO_APP', appId }).catch(() => {});
        P.renderOperaRail?.();
        P.renderNowPlayingBar?.();
      }
      return true;
    }

    if (data.type === 'PM_SP_SIDEBAR_PLAYPAUSE_CLICK') {
      const appId = resolveAppId('spotify');
      const aria = String(data.aria || '').toLowerCase();
      if (aria.includes('pause')) {
        st.bgMasterAudioSet.delete(appId);
        st.pendingSidebarAudioTakeoverSet.delete(appId);
        if (st.currentAudibleBgAppId === appId) {
          st.currentAudibleBgAppId = null;
        }
        const prevPb = st.framePlaybackStates.get(appId);
        if (prevPb) {
          prevPb.isPlaying = false;
          prevPb.updatedAt = Date.now();
        }
        P.renderOperaRail?.();
        P.renderNowPlayingBar?.();
      }
      browser.runtime
        .sendMessage({ type: 'PM_SP_SIDEBAR_PLAYPAUSE_CLICK', appId, aria: data.aria || '' })
        .catch(() => {});
      return true;
    }

    if (data.type === 'PM_SP_EME_BRIDGE') {
      const appId = resolveAppId('');
      if (appId) {
        if (!data.alreadyRoutedToBg) {
          try {
            const bgWin =
              browser.extension && typeof browser.extension.getBackgroundPage === 'function'
                ? browser.extension.getBackgroundPage()
                : null;
            if (bgWin && typeof bgWin.__pmHandleSpEmeBridge === 'function') {
              bgWin.__pmHandleSpEmeBridge(appId, data, 'sidebar');
            } else if (st.sidebarLifecyclePort) {
              st.sidebarLifecyclePort.postMessage({ type: 'FORWARD_SP_EME_BRIDGE', appId, data });
            }
          } catch (_) {
            if (st.sidebarLifecyclePort) {
              try {
                st.sidebarLifecyclePort.postMessage({ type: 'FORWARD_SP_EME_BRIDGE', appId, data });
              } catch (__) {}
            }
          }
        }

        if (data.bridgeType === 'STOP_PLAYBACK') {
          if (st.bgMasterAudioSet.has(appId) && !data.explicitStop) return true;
          st.pendingSidebarAudioTakeoverSet.delete(appId);
          st.bgMasterAudioSet.delete(appId);
          const prevPb = st.framePlaybackStates.get(appId);
          const nextUrl =
            (data.href && !data.href.includes('pm_boot=1') ? data.href : '') ||
            sourceEntry?.currentUrl ||
            prevPb?.resumeUrl ||
            '';
          if (sourceEntry && nextUrl) sourceEntry.currentUrl = nextUrl;
          const pb = {
            ...(prevPb || {}),
            isPlaying: false,
            currentTime: 0,
            resumeUrl: nextUrl,
            title: prevPb?.title || '',
            updatedAt: Date.now()
          };
          st.framePlaybackStates.set(appId, pb);
          if (st.currentAudibleBgAppId === appId) st.currentAudibleBgAppId = null;
          P.renderOperaRail?.();
          P.renderNowPlayingBar?.();
          P.syncPersistentSessionToBackground(appId, nextUrl, pb);
        } else if (data.bridgeType === 'SYNC_TIME') {
          const targetEntry = sourceEntry || st.mediaFramePool.get(appId);
          const isSuppressedInactive =
            appId !== st.activeRailAppId &&
            Boolean(targetEntry?.suppressedWhileInactive || !P.isAppAllowedForBgAudio(appId));
          if (isSuppressedInactive && !data.paused) {
            try {
              targetEntry?.frame?.contentWindow?.postMessage(
                { target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' },
                '*'
              );
            } catch (_) {}
            browser.runtime
              .sendMessage({ type: 'STOP_SINGLE_BG_AUDIO_APP', appId, clearPlaybackState: true })
              .catch(() => {});
            return true;
          }
          const isNonPlayableYt =
            appId === 'youtube' &&
            (data.href || sourceEntry?.currentUrl) &&
            !P.isPlayableYouTubeUrl(data.href || sourceEntry?.currentUrl);
          const isInSelectedPriorityPauseGrace =
            appId !== st.activeRailAppId &&
            Date.now() < (recentPriorityPausedUntilMap.get(appId) || 0);
          if (!data.paused && !isNonPlayableYt && !isInSelectedPriorityPauseGrace) {
            if (appId === st.activeRailAppId) {
              P.pauseOtherSidebarMediaFrames(appId);
            }
            st.pendingSidebarAudioTakeoverSet.delete(appId);
            st.bgMasterAudioSet.delete(appId);
            const prevPb = st.framePlaybackStates.get(appId);
            const prevWasPlaying = Boolean(prevPb?.isPlaying);
            const prevAudible = st.currentAudibleBgAppId;
            const liveSec = Math.floor(Number(data.currentTime) || 0);
            let nextResumeUrl =
              (data.href && !data.href.includes('pm_boot=1') ? data.href : '') ||
              sourceEntry?.currentUrl ||
              prevPb?.resumeUrl ||
              (appId === 'youtube' ? 'https://www.youtube.com/' : 'https://open.spotify.com/');
            if (appId === 'youtube' && nextResumeUrl) {
              try {
                const u = new URL(nextResumeUrl);
                if (u.pathname.startsWith('/watch') && liveSec >= 1) {
                  u.searchParams.set('t', `${liveSec}s`);
                  nextResumeUrl = u.href;
                }
              } catch (_) {}
            }
            if (sourceEntry && nextResumeUrl) sourceEntry.currentUrl = nextResumeUrl;
            const pb = {
              ...(prevPb || {}),
              isPlaying: true,
              currentTime: liveSec,
              duration: Number(data.duration) || prevPb?.duration || 0,
              resumeUrl: nextResumeUrl,
              title: (data.trackTitle && String(data.trackTitle).trim()) || prevPb?.title || (appId === 'youtube' ? 'YouTube' : 'Spotify'),
              artist: data.artist !== undefined ? String(data.artist) : (prevPb?.artist || ''),
              artworkUrl: data.artworkUrl !== undefined ? String(data.artworkUrl) : (prevPb?.artworkUrl || ''),
              canPrev: data.canPrev !== undefined ? Boolean(data.canPrev) : (prevPb?.canPrev !== false),
              canNext: data.canNext !== undefined ? Boolean(data.canNext) : (prevPb?.canNext !== false),
              updatedAt: Date.now()
            };
            st.framePlaybackStates.set(appId, pb);
            P.recordTrackUrlTitle?.(appId, pb.resumeUrl, pb.title);
            if (st.currentAudibleBgAppId !== appId) st.currentAudibleBgAppId = appId;
            if (!prevWasPlaying || prevAudible !== st.currentAudibleBgAppId) {
              P.renderOperaRail?.();
              P.renderNowPlayingBar?.();
            }
            if (
              !prevWasPlaying ||
              pb.resumeUrl !== prevPb?.resumeUrl ||
              Date.now() - st.lastPersistentPlaybackSyncAt > 4000
            ) {
              st.lastPersistentPlaybackSyncAt = Date.now();
              P.syncPersistentSessionToBackground(appId, pb.resumeUrl, pb);
            }
          } else {
            if (
              (st.pendingSidebarAudioTakeoverSet.has(appId) || st.bgMasterAudioSet.has(appId)) &&
              !data.explicitPause &&
              !isNonPlayableYt
            ) {
              return true;
            }
            st.pendingSidebarAudioTakeoverSet.delete(appId);
            st.bgMasterAudioSet.delete(appId);
            const prevPb = st.framePlaybackStates.get(appId);
            const prevWasPlaying = Boolean(prevPb?.isPlaying);
            const prevAudible = st.currentAudibleBgAppId;
            const nextUrl =
              (data.href && !data.href.includes('pm_boot=1') ? data.href : '') ||
              sourceEntry?.currentUrl ||
              prevPb?.resumeUrl ||
              '';
            const pb = {
              ...(prevPb || {}),
              isPlaying: false,
              currentTime: Math.floor(Number(data.currentTime) || prevPb?.currentTime || 0),
              resumeUrl: nextUrl,
              title: prevPb?.title || '',
              updatedAt: Date.now()
            };
            st.framePlaybackStates.set(appId, pb);
            if (st.currentAudibleBgAppId === appId) st.currentAudibleBgAppId = null;
            if (prevWasPlaying || prevAudible !== st.currentAudibleBgAppId) {
              P.renderOperaRail?.();
              P.renderNowPlayingBar?.();
              P.syncPersistentSessionToBackground(appId, nextUrl, pb);
            }
          }
        }
      }
      return true;
    }

    if (data.type === 'PM_BG_AUDIO_CHUNK' && data.chunk) {
      const appId = resolveAppId('');
      if (appId) {
        const targetEntry = sourceEntry || st.mediaFramePool.get(appId);
        if (appId !== st.activeRailAppId && (targetEntry?.suppressedWhileInactive || !P.isAppAllowedForBgAudio(appId))) {
          P.cleanupSidebarMsePlayer(appId);
          try {
            targetEntry?.frame?.contentWindow?.postMessage(
              { target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' },
              '*'
            );
          } catch (_) {}
          return true;
        }
        if (st.pendingSidebarAudioTakeoverSet.has(appId)) {
          st.pendingSidebarAudioTakeoverSet.delete(appId);
          browser.runtime.sendMessage({ type: 'STOP_SINGLE_BG_AUDIO_APP', appId }).catch(() => {});
        }
        if (appId === st.activeRailAppId) {
          P.pauseOtherSidebarMediaFrames(appId);
        }
        let player = st.sidebarMsePlayers.get(appId);
        if (!player) {
          const ms = new MediaSource();
          const objUrl = URL.createObjectURL(ms);
          const audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          audioEl.muted = false;
          audioEl.volume = 1.0;
          audioEl.src = objUrl;
          document.body.appendChild(audioEl);
          player = { ms, audioEl, sb: null, queue: [], objUrl };
          st.sidebarMsePlayers.set(appId, player);

          ms.addEventListener('sourceopen', () => {
            try {
              player.sb = ms.addSourceBuffer('audio/webm;codecs=opus');
              player.sb.addEventListener('updateend', () => {
                try {
                  if (player.audioEl.currentTime > 35 && !player.sb.updating && player.sb.buffered.length > 0) {
                    const start = player.sb.buffered.start(0);
                    if (player.audioEl.currentTime - start > 25) {
                      player.sb.remove(start, player.audioEl.currentTime - 15);
                      return;
                    }
                  }
                  if (player.queue.length > 0 && !player.sb.updating) {
                    player.sb.appendBuffer(player.queue.shift());
                  }
                  if (player.audioEl.paused) player.audioEl.play().catch(() => {});
                } catch (_) {}
              });
              if (player.queue.length > 0 && !player.sb.updating) {
                player.sb.appendBuffer(player.queue.shift());
              }
            } catch (_) {}
          });
        }

        if (player.sb && !player.sb.updating && player.queue.length === 0) {
          try {
            player.sb.appendBuffer(data.chunk);
          } catch (_) {}
        } else if (player.queue.length < 40) {
          player.queue.push(data.chunk);
        }
      }
      return true;
    }

    if (data.type === 'PM_FRAME_PLAYBACK_STATE') {
      if (typeof data.initialAutoplayPolicy === 'string') {
        st.lastDetectedAutoplayPolicy = data.initialAutoplayPolicy;
      }
      const appId = resolveAppId('');
      if (appId) {
        const targetEntry = sourceEntry || st.mediaFramePool.get(appId);
        const candidateUrl = data.resumeUrl || targetEntry?.currentUrl || '';
        const isNonPlayableYt = appId === 'youtube' && candidateUrl && !P.isPlayableYouTubeUrl(candidateUrl);
        const isDisallowedInactiveFrame =
          appId !== st.activeRailAppId &&
          Boolean(targetEntry?.suppressedWhileInactive || !P.isAppAllowedForBgAudio(appId));
        if (isDisallowedInactiveFrame && data.isPlaying) {
          P.cleanupSidebarMsePlayer(appId);
          if (st.currentAudibleBgAppId === appId) st.currentAudibleBgAppId = null;
          try {
            targetEntry?.frame?.contentWindow?.postMessage(
              { target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' },
              '*'
            );
          } catch (_) {}
          browser.runtime
            .sendMessage({ type: 'STOP_SINGLE_BG_AUDIO_APP', appId, clearPlaybackState: true })
            .catch(() => {});
        }
        const isInSelectedPriorityPauseGrace =
          appId !== st.activeRailAppId &&
          Date.now() < (recentPriorityPausedUntilMap.get(appId) || 0);
        const effectivePlaying =
          isNonPlayableYt || isDisallowedInactiveFrame || isInSelectedPriorityPauseGrace
            ? false
            : Boolean(data.isPlaying);
        if (isNonPlayableYt) {
          st.pendingSidebarAudioTakeoverSet.delete('youtube');
          if (st.currentAudibleBgAppId === 'youtube') st.currentAudibleBgAppId = null;
        }
        if (effectivePlaying && appId === st.activeRailAppId) {
          P.pauseOtherSidebarMediaFrames(appId);
        }
        const prevPb = st.framePlaybackStates.get(appId);
        const prevIsPlaying = Boolean(prevPb?.isPlaying);
        const isTakeoverOrMse =
          !isNonPlayableYt &&
          (st.sidebarMsePlayers.has(appId) ||
            st.pendingSidebarAudioTakeoverSet.has(appId) ||
            st.bgMasterAudioSet.has(appId));
        if (!effectivePlaying && !isTakeoverOrMse && st.currentAudibleBgAppId === appId) {
          st.currentAudibleBgAppId = null;
        }
        const pb = {
          isPlaying: Boolean(effectivePlaying || isTakeoverOrMse),
          currentTime: isNonPlayableYt ? 0 : Number(data.currentTime) || 0,
          duration: Number(data.duration) || prevPb?.duration || 0,
          resumeUrl: candidateUrl,
          title: data.title !== undefined ? String(data.title) : (prevPb?.title || ''),
          artist: data.artist !== undefined ? String(data.artist) : (prevPb?.artist || ''),
          album: data.album !== undefined ? String(data.album) : (prevPb?.album || ''),
          artworkUrl: data.artworkUrl !== undefined ? String(data.artworkUrl) : (prevPb?.artworkUrl || ''),
          canPrev: data.canPrev !== undefined ? Boolean(data.canPrev) : (prevPb?.canPrev !== false),
          canNext: data.canNext !== undefined ? Boolean(data.canNext) : (prevPb?.canNext !== false),
          muted: data.muted !== undefined ? Boolean(data.muted) : Boolean(prevPb?.muted),
          updatedAt: Date.now()
        };
        st.framePlaybackStates.set(appId, pb);
        P.recordTrackUrlTitle?.(appId, pb.resumeUrl, pb.title);
        if (
          prevIsPlaying !== pb.isPlaying ||
          isNonPlayableYt ||
          pb.title !== prevPb?.title ||
          pb.artist !== prevPb?.artist
        ) {
          P.renderOperaRail?.();
        }
        P.renderNowPlayingBar?.();
        if (pb.resumeUrl && sourceEntry) sourceEntry.currentUrl = pb.resumeUrl;
        if (pb.isPlaying || P.isAppPersistent?.(appId)) {
          P.syncPersistentSessionToBackground(appId, pb.resumeUrl, pb);
        }
      }
      return true;
    }

    return false;
  };

  P.bindPageHideHandoff = function () {
    const st = P.state;
    if (st.IS_POPOUT_VIEW) return;

    window.addEventListener('pagehide', () => {
      const activeMseIds = new Set(st.sidebarMsePlayers.keys());
      st.sidebarMsePlayers.forEach((_, id) => P.cleanupSidebarMsePlayer(id));
      if (!st.sidebarInitCompleted) return;
      if (
        !st.IS_SIDEBAR_VIEW &&
        st.mediaFramePool.size === 0 &&
        st.pendingSidebarAudioTakeoverSet.size === 0 &&
        st.bgMasterAudioSet.size === 0
      ) {
        return;
      }
      const mode = st.appSettings.persistenceMode || 'selected';
      if (mode === 'eco' && st.appSettings.keepAudioPlayingWhenClosed === false) return;

      const savedUrls = {};
      const playingApps = [];
      const addedPlayingIds = new Set();
      st.mediaFramePool.forEach((entry, id) => {
        if (id.startsWith('adhoc-')) return;
        const pb = st.framePlaybackStates.get(id);
        let bestUrl = entry.currentUrl || pb?.resumeUrl || entry.restoredUrl || '';
        if (id === 'youtube' && bestUrl && pb?.resumeUrl) {
          try {
            const curU = new URL(bestUrl);
            const pbU = new URL(pb.resumeUrl);
            if (
              curU.pathname.startsWith('/watch') &&
              pbU.pathname.startsWith('/watch') &&
              curU.searchParams.get('v') === pbU.searchParams.get('v') &&
              pbU.searchParams.get('t')
            ) {
              bestUrl = pb.resumeUrl;
            }
          } catch (_) {}
        }
        if (bestUrl && !P.isTransientAuthOrBootUrl?.(bestUrl) && (P.isAppPersistent?.(id) || P.isAppAllowedForBgAudio(id))) {
          savedUrls[id] = bestUrl;
          st.hibernatedAppUrls.set(id, bestUrl);
          if (P.isAppPersistent?.(id)) st.knownOpenPersistentIds.add(id);
        }
        if (!P.isAppAllowedForBgAudio(id)) {
          try {
            entry.frame.contentWindow?.postMessage(
              { target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' },
              '*'
            );
          } catch (_) {}
          return;
        }
        if (id === 'youtube' && !P.isPlayableYouTubeUrl(bestUrl)) return;
        const wasPlayingOrTakeover =
          (pb && pb.isPlaying && Date.now() - pb.updatedAt < 60000) ||
          activeMseIds.has(id) ||
          st.pendingSidebarAudioTakeoverSet.has(id) ||
          st.bgMasterAudioSet.has(id);
        if (wasPlayingOrTakeover && bestUrl) {
          addedPlayingIds.add(id);
          playingApps.push({
            appId: id,
            url: bestUrl,
            title: pb?.title || '',
            artist: pb?.artist || '',
            currentTime: Number(pb?.currentTime) || 0
          });
        }
      });

      const bgCandidateIds = new Set([
        ...st.pendingSidebarAudioTakeoverSet,
        ...st.bgMasterAudioSet,
        ...(st.currentAudibleBgAppId ? [st.currentAudibleBgAppId] : [])
      ]);
      bgCandidateIds.forEach((bgId) => {
        if (!addedPlayingIds.has(bgId) && P.isAppAllowedForBgAudio(bgId)) {
          const fallbackUrl =
            bgId === 'spotify'
              ? 'https://open.spotify.com/'
              : bgId === 'youtube'
                ? 'https://www.youtube.com/'
                : P.getAppsApi()?.getAppById(bgId, st.appSettings)?.defaultUrl || '';
          const bgUrl =
            st.hibernatedAppUrls.get(bgId) ||
            st.appSettings.persistentSavedAppUrls?.[bgId] ||
            st.framePlaybackStates.get(bgId)?.resumeUrl ||
            fallbackUrl;
          if (bgUrl) {
            addedPlayingIds.add(bgId);
            playingApps.push({
              appId: bgId,
              url: bgUrl,
              title: st.framePlaybackStates.get(bgId)?.title || ''
            });
          }
        }
      });

      P.saveFastBootCache();

      browser.runtime
        .sendMessage({
          type: 'SIDEBAR_CLOSED_HANDOFF',
          activeAppId: st.activeRailAppId && !st.activeRailAppId.startsWith('adhoc-') ? st.activeRailAppId : 'pocketmail',
          openPersistentAppIds: Array.from(st.knownOpenPersistentIds).filter((id) => P.isAppPersistent?.(id)),
          savedUrls,
          playingApps
        })
        .catch(() => {});
    });
  };

  P.recordTrackUrlTitle = function (appId, rawUrl, rawTitle) {
    const st = P.state;
    if (appId !== 'spotify' || !rawUrl || !rawTitle) return;
    const cleanTitle = String(rawTitle).trim();
    if (!cleanTitle || cleanTitle.toLowerCase() === 'spotify') return;
    try {
      const p = (new URL(String(rawUrl)).pathname || '').replace(/\/+$/, '');
      if (!/^\/track\/[^/]+$/i.test(p)) return;
      const key = `${appId}:${p}`;
      if (!st.trackUrlTitleMap.has(key)) {
        st.trackUrlTitleMap.set(key, cleanTitle);
        if (st.trackUrlTitleMap.size > 40) {
          const firstKey = st.trackUrlTitleMap.keys().next().value;
          if (firstKey) st.trackUrlTitleMap.delete(firstKey);
        }
      }
    } catch (_) {}
  };

  P.resolveSpotifyReopenUrl = function (rawUrl, activeMeta = null) {
    const st = P.state;
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    try {
      const u = new URL(rawUrl);
      if (!u.hostname.toLowerCase().includes('spotify.com')) return rawUrl;
      const p = (u.pathname || '').replace(/\/+$/, '');
      if (!/^\/track\/[^/]+$/i.test(p)) return rawUrl;
      const meta = activeMeta || st.pendingTakeoverMeta?.get('spotify') || st.bgNowPlayingState || null;
      const activeTitle = String(meta?.trackTitle || meta?.title || st.bgNowPlayingState?.title || '').trim();
      if (!activeTitle || activeTitle.toLowerCase() === 'spotify') return rawUrl;
      let metaPath = '';
      if (meta?.resumeUrl) {
        try {
          metaPath = (new URL(String(meta.resumeUrl)).pathname || '').replace(/\/+$/, '');
        } catch (_) {}
      }
      const origTitle = String(
        (metaPath === p ? meta?.urlTrackTitle : '') ||
          st.trackUrlTitleMap?.get(`spotify:${p}`) ||
          ''
      ).trim();
      if (origTitle && origTitle.toLowerCase() !== activeTitle.toLowerCase()) {
        return 'https://open.spotify.com/';
      }
    } catch (_) {}
    return rawUrl;
  };

  P.buildAutoResumePayload = function (appId) {
    const st = P.state;
    const meta = st.pendingTakeoverMeta?.get(appId) || null;
    const pb = st.framePlaybackStates?.get(appId) || null;
    const np = st.bgNowPlayingState && st.bgNowPlayingState.appId === appId ? st.bgNowPlayingState : null;
    const rawTitle = meta?.trackTitle || meta?.title || np?.title || pb?.title || '';
    const expectedTrackTitle = rawTitle && rawTitle.toLowerCase() !== 'spotify' ? rawTitle : '';
    return {
      target: 'pocketmail-media-frame',
      cmd: 'AUTO_RESUME_PLAYBACK',
      expectedTrackTitle,
      expectedArtist: meta?.artist || np?.artist || pb?.artist || '',
      expectedTime: Number(meta?.currentTime ?? np?.currentTime ?? pb?.currentTime ?? 0) || 0,
      expectedDuration: Number(meta?.duration ?? np?.duration ?? pb?.duration ?? 0) || 0
    };
  };

  P.audioController = {
    isAppAllowedForBgAudio: P.isAppAllowedForBgAudio,
    isPlayableYouTubeUrl: P.isPlayableYouTubeUrl,
    getResolvedNowPlayingState: P.getResolvedNowPlayingState,
    sendNowPlayingCommand: P.sendNowPlayingCommand,
    cleanupSidebarMsePlayer: P.cleanupSidebarMsePlayer,
    pauseOtherSidebarMediaFrames: P.pauseOtherSidebarMediaFrames
  };
})(typeof window !== 'undefined' ? window : this);
