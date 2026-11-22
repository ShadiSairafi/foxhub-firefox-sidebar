/**
 * FoxHub Background — Audio Engine, Widevine/Clear MSE Mirror,
 * SoundCloud/YTM/Spotify Rich Now Playing Metadata & Background Keepalive
 */

(function (global) {
  const bg = (global.FoxHubBg = global.FoxHubBg || {});

  const MIRROR_AUDIO_APP_IDS = new Set(['spotify', 'youtube']);

  function getMediaAppsCatalog() {
    return global.FoxHubMediaApps || global.PocketMailMediaApps || null;
  }

  function isTabPausedEnforced() {
    return typeof bg.isTabAutoPauseEnforced === 'function' ? bg.isTabAutoPauseEnforced() : false;
  }

  function getBehavior() {
    return typeof bg.getTabAudioBehavior === 'function' ? bg.getTabAudioBehavior() : 'pause-resume';
  }

  function getSavedMediaVolumeState(appId) {
    const map = bg.state.currentSettings && bg.state.currentSettings.mediaVolumeMap;
    const entry = appId && map && typeof map === 'object' && Object.prototype.hasOwnProperty.call(map, appId)
      ? map[appId]
      : null;
    const vol =
      entry && typeof entry.volume === 'number' && Number.isFinite(entry.volume)
        ? Math.round(Math.min(1, Math.max(0, entry.volume)) * 100) / 100
        : 1.0;
    const muted = Boolean(entry && entry.muted);
    const rawLast =
      entry && typeof entry.lastNonZeroVolume === 'number' && Number.isFinite(entry.lastNonZeroVolume)
        ? Math.round(Math.min(1, Math.max(0, entry.lastNonZeroVolume)) * 100) / 100
        : vol;
    const lastNonZeroVolume = rawLast > 0.001 ? rawLast : vol > 0.001 ? vol : 1.0;
    return { volume: vol, muted, lastNonZeroVolume };
  }

  function persistMediaVolumeState(appId, volume, muted, lastNonZeroOverride = null) {
    if (!appId || typeof appId !== 'string') return getSavedMediaVolumeState(appId);
    if (appId === '__proto__' || appId === 'constructor' || appId === 'prototype') {
      return getSavedMediaVolumeState('');
    }
    const s = bg.state.currentSettings;
    if (!s.mediaVolumeMap || typeof s.mediaVolumeMap !== 'object') {
      s.mediaVolumeMap = {};
    }
    const prev = getSavedMediaVolumeState(appId);
    const nextVol =
      typeof volume === 'number' && Number.isFinite(volume)
        ? Math.round(Math.min(1, Math.max(0, volume)) * 100) / 100
        : prev.volume;
    const nextMuted = typeof muted === 'boolean' ? muted : prev.muted;
    const candLast =
      typeof lastNonZeroOverride === 'number' && Number.isFinite(lastNonZeroOverride) && lastNonZeroOverride > 0.001
        ? Math.round(Math.min(1, Math.max(0, lastNonZeroOverride)) * 100) / 100
        : !nextMuted && nextVol > 0.001
          ? nextVol
          : prev.lastNonZeroVolume > 0.001
            ? prev.lastNonZeroVolume
            : 1.0;
    const nextEntry = {
      volume: nextVol,
      muted: nextMuted,
      lastNonZeroVolume: candLast
    };
    s.mediaVolumeMap[appId] = nextEntry;
    if (typeof bg.scheduleSettingsSave === 'function') {
      bg.scheduleSettingsSave(false);
    }
    return nextEntry;
  }

  function handleNonMirrorVolumeChanged(appId, volume, muted) {
    if (!appId || typeof appId !== 'string') return null;
    const rawVol = Number(volume);
    const nextVol = Number.isFinite(rawVol) ? Math.round(Math.min(1, Math.max(0, rawVol)) * 100) / 100 : undefined;
    const nextMuted = typeof muted === 'boolean' ? muted : undefined;
    const persisted = persistMediaVolumeState(appId, nextVol, nextMuted);
    if (typeof bg.scheduleSettingsSave === 'function') {
      bg.scheduleSettingsSave(true);
    }
    const prevSt = bg.liveMediaPlaybackState.get(appId);
    if (prevSt) {
      bg.liveMediaPlaybackState.set(
        appId,
        normalizePlaybackMeta(
          appId,
          { volume: persisted.volume, muted: persisted.muted, lastNonZeroVolume: persisted.lastNonZeroVolume },
          prevSt
        )
      );
    }
    const mse = bg.bgMsePlayers.get(appId);
    if (mse && mse.audioEl) {
      try {
        mse.audioEl.volume = persisted.volume;
        mse.audioEl.muted = isTabPausedEnforced() ? true : persisted.muted;
      } catch (_) {}
    }
    refreshBgAudioIndicator(true, appId);
    return persisted;
  }

  function pushAuthoritativeVolumeToFrame(appId, sourceType, volume, muted) {
    if (!appId || (sourceType !== 'bg' && sourceType !== 'sidebar')) return;
    const safeVol =
      typeof volume === 'number' && Number.isFinite(volume)
        ? Math.round(Math.min(1, Math.max(0, volume)) * 100) / 100
        : 1.0;
    const safeMuted = Boolean(muted);
    const port = bg.emeBridgePorts.get(`${sourceType}:${appId}`);
    let delivered = false;
    if (port) {
      try {
        port.postMessage({ cmd: 'PM_MEDIA_CONTROL', command: 'set_volume', volume: safeVol, muted: safeMuted });
        delivered = true;
      } catch (_) {}
    }
    if (!delivered && sourceType === 'bg') {
      const bgEntry = bg.bgAudioPool.get(appId);
      const bgFrame = bgEntry && (bgEntry.frame || bgEntry.iframe);
      if (bgFrame && bgFrame.contentWindow) {
        try {
          bgFrame.contentWindow.postMessage(
            { target: 'pocketmail-media-frame', cmd: 'PM_MEDIA_CONTROL', command: 'set_volume', volume: safeVol, muted: safeMuted },
            '*'
          );
        } catch (_) {}
      }
    } else if (!delivered && sourceType === 'sidebar') {
      browser.runtime
        .sendMessage({
          type: 'PM_FORWARD_MEDIA_COMMAND',
          appId,
          cmd: 'PM_MEDIA_CONTROL',
          command: 'set_volume',
          volume: safeVol,
          muted: safeMuted
        })
        .catch(() => {});
    }
  }

  function logAudioDiag(event, details = {}) {
    try {
      const entry = {
        ts: Date.now(),
        iso: new Date().toISOString(),
        event: String(event || 'event'),
        ...details
      };
      bg.bgAudioDiagLog.push(entry);
      if (bg.bgAudioDiagLog.length > 200) {
        bg.bgAudioDiagLog.splice(0, bg.bgAudioDiagLog.length - 200);
      }
      try {
        console.info('[FoxHub AudioDiag]', entry.iso, event, details);
      } catch (_) {}
    } catch (_) {}
  }

  function isTimeInSpBuffered(sp, t) {
    if (!sp || !sp.sb || !sp.sb.buffered || sp.sb.buffered.length === 0) return false;
    for (let i = 0; i < sp.sb.buffered.length; i++) {
      if (t >= sp.sb.buffered.start(i) - 0.15 && t <= sp.sb.buffered.end(i) - 0.02) {
        return true;
      }
    }
    return false;
  }

  function getSpBufferedEnd(sp) {
    if (!sp || !sp.sb || !sp.sb.buffered || sp.sb.buffered.length === 0) return 0;
    return sp.sb.buffered.end(sp.sb.buffered.length - 1);
  }

  function summarizeSpInstanceDiag(sp) {
    if (!sp) return null;
    const v = sp.videoEl;
    const bufRanges = [];
    try {
      if (sp.sb && sp.sb.buffered) {
        for (let i = 0; i < sp.sb.buffered.length; i++) {
          bufRanges.push([
            Math.round(sp.sb.buffered.start(i) * 100) / 100,
            Math.round(sp.sb.buffered.end(i) * 100) / 100
          ]);
        }
      }
    } catch (_) {}
    return {
      id: sp.id,
      appId: sp.appId,
      msId: sp.msId || 0,
      sourceType: sp.sourceType,
      isStaging: Boolean(sp.isStaging),
      isNextPreload: Boolean(sp.isNextPreload),
      disposed: Boolean(sp.disposed),
      hasLicense: Boolean(sp.hasLicense),
      lastLicStatus: sp.lastLicStatus || 0,
      lastGenErr: sp.lastGenErr || null,
      remotePaused: Boolean(sp.remotePaused),
      explicitUserPause: Boolean(sp.explicitUserPause),
      autoPausedByTab: Boolean(sp.autoPausedByTab),
      awaitingBgFrameHandoff: Boolean(sp.awaitingBgFrameHandoff),
      handoffSource: sp.handoffSource || '',
      targetTime: Math.round((Number(sp.targetTime) || 0) * 100) / 100,
      currentTime: v ? Math.round((Number(v.currentTime) || 0) * 100) / 100 : 0,
      paused: v ? Boolean(v.paused) : true,
      muted: v ? Boolean(v.muted) : true,
      readyState: v ? v.readyState : 0,
      buffered: bufRanges,
      trackTitle: sp.trackTitle || '',
      trackDuration: Math.round(Number(sp.trackDuration) || 0),
      msSinceAdvance: sp.lastTimeAdvanceAt ? Date.now() - sp.lastTimeAdvanceAt : 0
    };
  }

  function getAudibleBgAudioAppId() {
    try {
      for (const [appId, sp] of bg.bgSpEmePlayers) {
        const v = sp && !sp.disposed ? sp.videoEl : null;
        if (v && !v.paused && !v.ended && !v.muted && v.volume > 0 && v.readyState >= 2 && !sp.remotePaused) {
          const bufEnd = getSpBufferedEnd(sp);
          const ct = Number(v.currentTime) || 0;
          if (bufEnd > 0 && bufEnd - ct <= 0.05 && sp.lastTimeAdvanceAt && Date.now() - sp.lastTimeAdvanceAt > 2800) {
            continue;
          }
          return appId;
        }
      }
      for (const [appId, p] of bg.bgMsePlayers) {
        const a = p && p.audioEl;
        if (a && !a.paused && !a.ended && !a.muted && a.volume > 0 && a.readyState >= 2) return appId;
      }
      if (!isTabPausedEnforced()) {
        for (const [appId] of bg.bgAudioPool) {
          if (MIRROR_AUDIO_APP_IDS.has(appId)) continue;
          const sp = bg.bgSpEmePlayers.get(appId);
          if (sp && sp.explicitUserPause) continue;
          const st = bg.liveMediaPlaybackState.get(appId);
          if (st && st.isPlaying) {
            return appId;
          }
        }
      }
    } catch (_) {}
    return null;
  }

  function normalizePlaybackMeta(appId, raw = {}, prev = null) {
    const safeRaw = raw && typeof raw === 'object' ? raw : {};
    const safePrev = prev && typeof prev === 'object' ? prev : {};
    const hasOwn = (k) => Object.prototype.hasOwnProperty.call(safeRaw, k);
    const strOrPrev = (k) => {
      if (hasOwn(k) && safeRaw[k] !== undefined && safeRaw[k] !== null) {
        return String(safeRaw[k]);
      }
      return typeof safePrev[k] === 'string' ? safePrev[k] : '';
    };
    const numOrPrev = (k) => {
      if (hasOwn(k) && typeof safeRaw[k] === 'number' && Number.isFinite(safeRaw[k])) {
        return Math.max(0, safeRaw[k]);
      }
      return typeof safePrev[k] === 'number' && Number.isFinite(safePrev[k]) ? safePrev[k] : 0;
    };
    const boolOrPrev = (k, defVal = false) => {
      if (typeof safeRaw[k] === 'boolean') return safeRaw[k];
      if (typeof safePrev[k] === 'boolean') return safePrev[k];
      return defVal;
    };

    const resumeUrl = strOrPrev('resumeUrl');
    const title = strOrPrev('title');
    const artist = strOrPrev('artist');
    const album = strOrPrev('album');
    const artworkUrl = strOrPrev('artworkUrl');

    const savedVol = getSavedMediaVolumeState(appId);
    const volRaw = hasOwn('volume') && typeof safeRaw.volume === 'number' && Number.isFinite(safeRaw.volume)
      ? Math.min(1, Math.max(0, safeRaw.volume))
      : typeof safePrev.volume === 'number' && Number.isFinite(safePrev.volume)
        ? Math.min(1, Math.max(0, safePrev.volume))
        : savedVol.volume;

    return {
      appId,
      isPlaying: Boolean(safeRaw.isPlaying !== undefined ? safeRaw.isPlaying : safePrev.isPlaying),
      title,
      artist,
      album,
      artworkUrl,
      currentTime: numOrPrev('currentTime'),
      duration: numOrPrev('duration'),
      canPrev: boolOrPrev('canPrev', true),
      canNext: boolOrPrev('canNext', true),
      muted: boolOrPrev('muted', savedVol.muted),
      volume: Math.round(volRaw * 100) / 100,
      lastNonZeroVolume:
        typeof safeRaw.lastNonZeroVolume === 'number' && Number.isFinite(safeRaw.lastNonZeroVolume) && safeRaw.lastNonZeroVolume > 0.001
          ? Math.round(Math.min(1, safeRaw.lastNonZeroVolume) * 100) / 100
          : typeof safePrev.lastNonZeroVolume === 'number' && Number.isFinite(safePrev.lastNonZeroVolume) && safePrev.lastNonZeroVolume > 0.001
            ? Math.round(Math.min(1, safePrev.lastNonZeroVolume) * 100) / 100
            : savedVol.lastNonZeroVolume,
      resumeUrl,
      handedOffAt: safeRaw.handedOffAt !== undefined ? safeRaw.handedOffAt : safePrev.handedOffAt,
      updatedAt: Date.now()
    };
  }

  function getActiveNowPlayingState() {
    const audibleId = getAudibleBgAudioAppId();
    const s = bg.state.currentSettings || {};
    const catalog = getMediaAppsCatalog();

    let targetId = audibleId || null;
    if (!targetId && !isTabPausedEnforced()) {
      let bestPlaying = null;
      bg.liveMediaPlaybackState.forEach((st, id) => {
        if (st && st.isPlaying && (!bestPlaying || (st.updatedAt || 0) > (bestPlaying.updatedAt || 0))) {
          bestPlaying = { id, updatedAt: st.updatedAt || 0 };
        }
      });
      if (bestPlaying) targetId = bestPlaying.id;
    }

    if (!targetId) {
      let bestPaused = null;
      const now = Date.now();
      const allowedBg = new Set(Array.isArray(s.bgAudioAppIds) ? s.bgAudioAppIds : ['spotify', 'youtube', 'soundcloud']);
      bg.liveMediaPlaybackState.forEach((st, id) => {
        if (!st || now - (st.updatedAt || 0) > 30 * 60 * 1000) return;
        if (!allowedBg.has(id) && id !== 'apple-music') return;
        if (!bestPaused || (st.updatedAt || 0) > (bestPaused.updatedAt || 0)) {
          bestPaused = { id, updatedAt: st.updatedAt || 0 };
        }
      });
      if (bestPaused) targetId = bestPaused.id;
    }

    if (!targetId) return null;

    const st = bg.liveMediaPlaybackState.get(targetId) || {};
    const sp = bg.bgSpEmePlayers.get(targetId);
    const mse = bg.bgMsePlayers.get(targetId);
    const bgEntry = bg.bgAudioPool.get(targetId);
    const appMeta = catalog && typeof catalog.getAppById === 'function' ? catalog.getAppById(targetId, s) : null;
    const appName = (appMeta && appMeta.id === targetId ? appMeta.name : null) || targetId;

    const hasPendingUserScrub = Boolean(
      sp &&
        !sp.disposed &&
        sp.pendingSeekIsUserScrub &&
        Number.isFinite(sp.pendingSeekTarget) &&
        sp.pendingSeekTarget >= 0 &&
        sp.pendingSeekSetAt > 0 &&
        Date.now() - sp.pendingSeekSetAt < 3500
    );
    const liveCt = hasPendingUserScrub
      ? Number(sp.pendingSeekTarget) || 0
      : sp && !sp.disposed && sp.videoEl && (Number(sp.videoEl.currentTime) > 0 || !(Number(st.currentTime) > 0))
        ? Number(sp.videoEl.currentTime) || 0
        : mse && mse.audioEl
          ? Number(mse.audioEl.currentTime) || 0
          : Number(st.currentTime) || 0;
    const liveDur =
      sp && !sp.disposed && sp.trackDuration > 0
        ? Number(sp.trackDuration)
        : Number(st.duration) || 0;
    const isActuallyPlaying = Boolean(
      audibleId === targetId ||
      (!isTabPausedEnforced() &&
        ((sp && !sp.disposed && sp.videoEl && !sp.videoEl.paused && !sp.remotePaused) ||
          (mse && mse.audioEl && !mse.audioEl.paused) ||
          st.isPlaying))
    );
    const savedVol = getSavedMediaVolumeState(targetId);
    const isMuted = Boolean(
      sp && !sp.disposed
        ? sp.desiredMuted
        : mse && mse.audioEl && !isTabPausedEnforced()
          ? mse.audioEl.muted
          : typeof st.muted === 'boolean'
            ? st.muted
            : savedVol.muted
    );
    const liveVol =
      sp && !sp.disposed && typeof sp.desiredVolume === 'number' && Number.isFinite(sp.desiredVolume)
        ? sp.desiredVolume
        : mse && mse.audioEl && typeof mse.audioEl.volume === 'number' && Number.isFinite(mse.audioEl.volume)
          ? mse.audioEl.volume
          : typeof st.volume === 'number' && Number.isFinite(st.volume)
            ? st.volume
            : savedVol.volume;
    const lastNonZeroVolume =
      sp && !sp.disposed && typeof sp.lastNonZeroVolume === 'number' && sp.lastNonZeroVolume > 0.001
        ? sp.lastNonZeroVolume
        : savedVol.lastNonZeroVolume;

    return {
      appId: targetId,
      appName,
      color: (appMeta && appMeta.id === targetId ? appMeta.color : '') || '#1DB954',
      isPlaying: isActuallyPlaying,
      muted: isMuted,
      volume: Math.round(Math.min(1, Math.max(0, liveVol)) * 100) / 100,
      lastNonZeroVolume: Math.round(Math.min(1, Math.max(0.01, lastNonZeroVolume)) * 100) / 100,
      title: st.title || (sp && sp.trackTitle) || (bgEntry && bgEntry.title) || appName,
      artist: st.artist || '',
      album: st.album || '',
      artworkUrl: st.artworkUrl || '',
      currentTime: Math.round(liveCt * 10) / 10,
      duration: Math.round(liveDur * 10) / 10,
      canPrev: st.canPrev !== false,
      canNext: st.canNext !== false,
      resumeUrl: st.resumeUrl || (bgEntry && bgEntry.url) || '',
      inBackgroundPool: bg.bgAudioPool.has(targetId),
      updatedAt: st.updatedAt || Date.now()
    };
  }

  function buildAudioDiagnosticsSnapshot() {
    const activePlayers = {};
    bg.bgSpEmePlayers.forEach((sp, id) => {
      activePlayers[id] = summarizeSpInstanceDiag(sp);
    });
    const stagingPlayers = {};
    bg.bgStagingSpPlayers.forEach((sp, id) => {
      stagingPlayers[id] = summarizeSpInstanceDiag(sp);
    });
    const nextPlayers = {};
    bg.bgNextSpPlayers.forEach((sp, id) => {
      nextPlayers[id] = summarizeSpInstanceDiag(sp);
    });

    const now = Date.now();
    const tabHolds = [];
    bg.tabAudio.silentTabHoldSince.forEach((holdStart, tabId) => {
      tabHolds.push({
        tabId,
        heldMs: now - holdStart,
        holdStart
      });
    });

    const manifestVersion =
      (typeof browser !== 'undefined' && browser.runtime && typeof browser.runtime.getManifest === 'function'
        ? browser.runtime.getManifest()?.version
        : null) || '2.8.0';

    const s = bg.state.currentSettings;
    return {
      version: manifestVersion,
      generatedAt: new Date().toISOString(),
      audibleAppId: getAudibleBgAudioAppId(),
      nowPlaying: getActiveNowPlayingState(),
      sidebarPortCount: bg.state.sidebarPortCount,
      popupPortCount: bg.state.popupPortCount,
      bgAudioPoolIds: Array.from(bg.bgAudioPool.keys()),
      emeBridgePortKeys: Array.from(bg.emeBridgePorts.keys()),
      tabAudioBehavior: getBehavior(),
      isAutoPausedByTabAudio: Boolean(bg.tabAudio.isAutoPausedByTabAudio),
      manualOverrideWhileTabAudible: Boolean(bg.tabAudio.manualOverrideWhileTabAudible),
      knownActiveMediaTabIds: Array.from(bg.tabAudio.knownActiveMediaTabIds),
      audibleOverrideTabIds: Array.from(bg.tabAudio.audibleOverrideTabIds),
      tabAudioHoldDown: {
        silentTabHolds: tabHolds,
        pendingTabResume: Boolean(bg.tabAudio.pendingTabResumeTimer),
        recentlyStoppedTabs: Array.from(bg.tabAudio.recentlyStoppedMediaTabMap.entries()).map(([tabId, stoppedAt]) => ({
          tabId,
          stoppedAt,
          msAgo: now - stoppedAt
        }))
      },
      keepalive: {
        webAudioState: bg.state.bgWebAudioKeepaliveCtx ? bg.state.bgWebAudioKeepaliveCtx.state : 'uninitialized',
        webAudioSampleRate: bg.state.bgWebAudioKeepaliveCtx ? bg.state.bgWebAudioKeepaliveCtx.sampleRate : 0,
        lastAlarmWakePulseAt: bg.state.lastAlarmWakePulseAt,
        alarmWakePulseCount: bg.state.alarmWakePulseCount,
        lastHeartbeatBroadcastAt: bg.state.lastHeartbeatBroadcastAt,
        heartbeatBroadcastCount: bg.state.heartbeatBroadcastCount
      },
      persistenceMode: s.persistenceMode || 'selected',
      keepAudioPlayingWhenClosed: s.keepAudioPlayingWhenClosed !== false,
      persistentAppIds: Array.isArray(s.persistentAppIds) ? s.persistentAppIds : [],
      bgAudioAppIds: Array.isArray(s.bgAudioAppIds) ? s.bgAudioAppIds : [],
      activePlayers,
      stagingPlayers,
      nextPlayers,
      recentEvents: bg.bgAudioDiagLog.slice(-150)
    };
  }

  async function getSidebarPlayingIconImageData() {
    if (bg.state.cachedSidebarPlayingImageData) return bg.state.cachedSidebarPlayingImageData;
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const drawBadgedSize = (sz) => {
              const c = document.createElement('canvas');
              c.width = sz;
              c.height = sz;
              const ctx = c.getContext('2d');
              ctx.drawImage(img, 0, 0, sz, sz);
              const scale = sz / 32;
              ctx.beginPath();
              ctx.arc(24 * scale, 24 * scale, 8 * scale, 0, Math.PI * 2);
              ctx.fillStyle = '#1DB954';
              ctx.fill();
              ctx.lineWidth = Math.max(1, 1.8 * scale);
              ctx.strokeStyle = '#141110';
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(21.6 * scale, 20.2 * scale);
              ctx.lineTo(21.6 * scale, 27.8 * scale);
              ctx.lineTo(27.8 * scale, 24.0 * scale);
              ctx.closePath();
              ctx.fillStyle = '#FFFFFF';
              ctx.fill();
              return ctx.getImageData(0, 0, sz, sz);
            };

            bg.state.cachedSidebarPlayingImageData = {
              16: drawBadgedSize(16),
              32: drawBadgedSize(32)
            };
            resolve(bg.state.cachedSidebarPlayingImageData);
          } catch (_) {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = browser.runtime.getURL('icons/icon-32.png');
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function updateSidebarActionIndicator(audibleAppId, userVolumeChangedAppId = '') {
    const catalog = getMediaAppsCatalog();
    const s = bg.state.currentSettings;
    try {
      if (browser.sidebarAction) {
        if (audibleAppId) {
          const matchedApp = catalog && typeof catalog.getAppById === 'function' ? catalog.getAppById(audibleAppId, s) : null;
          const appName = (matchedApp && matchedApp.id === audibleAppId ? matchedApp.name : null) || audibleAppId;
          if (typeof browser.sidebarAction.setTitle === 'function') {
            browser.sidebarAction.setTitle({ title: `▶ FoxHub — Playing ${appName}` }).catch(() => {});
          }
          if (typeof browser.sidebarAction.setIcon === 'function') {
            const imageData = await getSidebarPlayingIconImageData();
            if (imageData) {
              browser.sidebarAction.setIcon({ imageData }).catch(() => {});
            }
          }
        } else {
          if (typeof browser.sidebarAction.setTitle === 'function') {
            browser.sidebarAction.setTitle({ title: 'FoxHub' }).catch(() => {});
          }
          if (typeof browser.sidebarAction.setIcon === 'function') {
            browser.sidebarAction
              .setIcon({
                path: {
                  16: browser.runtime.getURL('icons/icon-16.png'),
                  32: browser.runtime.getURL('icons/icon-32.png'),
                  48: browser.runtime.getURL('icons/icon-48.png'),
                  128: browser.runtime.getURL('icons/icon-128.png')
                }
              })
              .catch(() => {});
          }
        }
      }
    } catch (_) {}
    browser.runtime
      .sendMessage({
        type: 'BG_AUDIO_STATUS_CHANGED',
        audibleAppId: audibleAppId || null,
        sidebarClosed: bg.state.sidebarPortCount === 0,
        nowPlaying: getActiveNowPlayingState(),
        userVolumeChangedAppId: userVolumeChangedAppId || undefined
      })
      .catch(() => {});
  }

  function refreshBgAudioIndicator(forceBroadcast = false, userVolumeChangedAppId = '') {
    const audibleAppId = getAudibleBgAudioAppId() || '';
    const np = getActiveNowPlayingState();
    const npSig = np ? `${np.appId}:${np.isPlaying}:${np.muted}:${np.volume}:${np.title}:${np.artist}` : 'none';
    const key = `${audibleAppId}:${bg.state.sidebarPortCount === 0 ? 'closed' : 'open'}:${npSig}`;
    if (!forceBroadcast && key === bg.state.lastBgAudioIndicatorKey) return;
    bg.state.lastBgAudioIndicatorKey = key;
    updateSidebarActionIndicator(audibleAppId || null, userVolumeChangedAppId);
  }
  setInterval(() => refreshBgAudioIndicator(false), 900);

  function toLocalArrayBuffer(buf) {
    if (!buf) return null;
    if (buf instanceof ArrayBuffer) return buf;
    try {
      if (
        buf.buffer instanceof ArrayBuffer &&
        (buf.byteOffset || 0) === 0 &&
        buf.byteLength === buf.buffer.byteLength
      ) {
        return buf.buffer;
      }
      const u8 = new Uint8Array(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength || buf.length || 0);
      const out = new Uint8Array(u8.byteLength);
      out.set(u8);
      return out.buffer;
    } catch (_) {
      return null;
    }
  }

  function cloneLocalLicAuth(rawUrl, rawHeaders) {
    try {
      const cleanHeaders = {};
      if (rawHeaders && typeof rawHeaders === 'object') {
        for (const k of Object.keys(rawHeaders)) {
          cleanHeaders[String(k)] = String(rawHeaders[k]);
        }
      }
      return { url: String(rawUrl || ''), headers: cleanHeaders };
    } catch (_) {
      return null;
    }
  }

  function cleanupMsePlayer(appId) {
    const player = bg.bgMsePlayers.get(appId);
    if (!player) return;
    bg.bgMsePlayers.delete(appId);
    try {
      player.audioEl.pause();
      player.audioEl.removeAttribute('src');
      player.audioEl.load();
      player.audioEl.remove();
    } catch (_) {}
    try {
      if (player.objUrl) URL.revokeObjectURL(player.objUrl);
    } catch (_) {}
  }

  function disposeSpPlayerInstance(sp) {
    if (!sp || sp.disposed) return;
    sp.disposed = true;
    if (sp.serverCert || sp.licAuth) {
      const prev = bg.bgSpCachedMeta.get(sp.appId) || {};
      bg.bgSpCachedMeta.set(sp.appId, {
        ...prev,
        serverCert: sp.serverCert || prev.serverCert || null,
        licAuth: sp.licAuth || prev.licAuth || null
      });
    }
    sp.queue = [];
    sp.pendingGenReqs = [];
    sp.deferredGenReqs = [];
    if (sp._genRetryTimer) {
      clearTimeout(sp._genRetryTimer);
      sp._genRetryTimer = null;
    }
    try {
      if (sp.videoEl) {
        if (Array.isArray(sp._videoHandlers)) {
          sp._videoHandlers.forEach(([evt, handler]) => {
            try {
              sp.videoEl.removeEventListener(evt, handler);
            } catch (_) {}
          });
          sp._videoHandlers = null;
        }
        sp.videoEl.muted = true;
        sp.videoEl.volume = 0;
        sp.videoEl.pause();
        sp.videoEl.removeAttribute('src');
        sp.videoEl.load();
        sp.videoEl.remove();
        sp.videoEl = null;
      }
    } catch (_) {}
    try {
      if (sp.objUrl) URL.revokeObjectURL(sp.objUrl);
    } catch (_) {}
  }

  function cleanupSpEmePlayer(appId) {
    const sp = bg.bgSpEmePlayers.get(appId);
    if (sp) {
      bg.bgSpEmePlayers.delete(appId);
      disposeSpPlayerInstance(sp);
    }
    const st = bg.bgStagingSpPlayers.get(appId);
    if (st) {
      bg.bgStagingSpPlayers.delete(appId);
      disposeSpPlayerInstance(st);
    }
    const nx = bg.bgNextSpPlayers.get(appId);
    if (nx) {
      bg.bgNextSpPlayers.delete(appId);
      disposeSpPlayerInstance(nx);
    }
  }

  function removeBgAudioIframeOnly(appId) {
    const entry = bg.bgAudioPool.get(appId);
    const bgPort = bg.emeBridgePorts.get(`bg:${appId}`);
    if (bgPort) {
      try {
        bgPort.postMessage({ cmd: 'PREPARE_HANDOFF_UNLOAD' });
      } catch (_) {}
    }
    if (entry) {
      bg.bgAudioPool.delete(appId);
      try {
        if (entry.frame && entry.frame.contentWindow) {
          entry.frame.contentWindow.postMessage(
            { target: 'pocketmail-media-frame', cmd: 'PREPARE_HANDOFF_UNLOAD' },
            '*'
          );
        }
      } catch (_) {}
      try {
        entry.frame.remove();
        entry.frame.src = 'about:blank';
      } catch (_) {}
    }
    try {
      const domFrames = document.querySelectorAll(`iframe[name="pm-bg-audio-${appId}"]`);
      for (const f of domFrames) {
        f.remove();
        f.src = 'about:blank';
      }
    } catch (_) {}
    const st = bg.bgStagingSpPlayers.get(appId);
    if (st && st.sourceType === 'bg') {
      bg.bgStagingSpPlayers.delete(appId);
      disposeSpPlayerInstance(st);
    }
    const nx = bg.bgNextSpPlayers.get(appId);
    if (nx && nx.sourceType === 'bg') {
      bg.bgNextSpPlayers.delete(appId);
      disposeSpPlayerInstance(nx);
    }
    if (bg.bgAudioPool.size === 0) {
      bg.updateToolbarBadge();
    }
  }

  function recordRecentSpGenReq(appId, initDataType, initData) {
    if (!appId || !initData) return;
    const prev = bg.bgSpCachedMeta.get(appId) || {};
    const now = Date.now();
    const sig = `${initDataType || 'cenc'}:${new Uint8Array(initData).join(',')}`;
    const list = (prev.recentGenReqs || []).filter((r) => now - r.ts < 1800000 && r.sig !== sig);
    list.push({ initDataType: initDataType || 'cenc', initData, sig, ts: now });
    bg.bgSpCachedMeta.set(appId, { ...prev, recentGenReqs: list.slice(-8) });
  }

  function createSpPlayerInstance(appId, mime, msId = 0, isStaging = false, sourceType = 'sidebar') {
    const cached = bg.bgSpCachedMeta.get(appId) || {};
    const savedVol = getSavedMediaVolumeState(appId);
    const now = Date.now();
    const isClear = appId !== 'spotify';
    const seededGenReqs = isClear
      ? []
      : (cached.recentGenReqs || [])
          .filter((r) => now - r.ts < 1800000)
          .slice(-6)
          .map((r) => ({ initDataType: r.initDataType, initData: r.initData }));
    return {
      id: ++bg.state.bgSpInstanceCounter,
      appId,
      isClear,
      msId: msId || 0,
      mime: mime || 'audio/mp4; codecs="mp4a.40.2"',
      isStaging: Boolean(isStaging),
      isNextPreload: false,
      createdAt: now,
      sourceType,
      originSource: sourceType,
      awaitingBgFrameHandoff: false,
      handoffSource: 'bg',
      hasLicense: isClear,
      licensedAt: 0,
      lastLicStatus: 0,
      lastGenErr: null,
      disposed: false,
      videoEl: null,
      ms: null,
      sb: null,
      queue: [],
      mk: null,
      mkReadyPromise: null,
      serverCert: cached.serverCert || null,
      licAuth: cached.licAuth || null,
      pendingGenReqs: seededGenReqs,
      deferredGenReqs: [],
      processedInitDataKeys: new Set(),
      objUrl: null,
      targetTime: 0,
      pendingSeekTarget: 0,
      pendingSeekSetAt: 0,
      pendingSeekIsUserScrub: false,
      maxObservedCt: 0,
      minContinueCt: 0,
      isExplicitUserScrub: false,
      explicitUserScrubUntil: 0,
      trackDuration: 0,
      trackTitle: '',
      desiredVolume: savedVol.volume,
      desiredMuted: savedVol.muted,
      lastNonZeroVolume: savedVol.lastNonZeroVolume,
      remotePaused: false,
      explicitUserPause: false,
      lastPlayedAt: 0,
      lastObservedCt: 0,
      lastTimeAdvanceAt: now,
      lastStarveNudgeAt: 0,
      retireBgWhenBuffered: false,
      retireBgTimer: null,
      lastSeekSentAt: 0,
      seekAttempts: 0,
      skipNextSentAt: 0,
      explicitSidebarPlayIntent: false,
      explicitSidebarPlayIntentAt: 0
    };
  }

  function promoteNextSpPlayer(appId, initialTargetTime = 0) {
    const nextSp = bg.bgNextSpPlayers.get(appId);
    if (!nextSp || nextSp.disposed) return false;
    const activeSp = bg.bgSpEmePlayers.get(appId);
    if (!nextSp.isClear && !nextSp.hasLicense) {
      const activeEnded = Boolean(activeSp && !activeSp.disposed && activeSp.videoEl && activeSp.videoEl.ended);
      const timedOut = nextSp.createdAt > 0 && Date.now() - nextSp.createdAt > 6000;
      if (!activeEnded || !timedOut) {
        processSpInstanceGenReqs(nextSp);
        logAudioDiag('defer-promote-unlicensed-next', {
          appId,
          msId: nextSp.msId || 0,
          activeEnded
        });
        return false;
      }
    }
    bg.bgNextSpPlayers.delete(appId);

    const preserveSidebarHandoff = Boolean(
      activeSp &&
        !activeSp.disposed &&
        activeSp.awaitingBgFrameHandoff &&
        activeSp.handoffSource === 'sidebar' &&
        nextSp.sourceType === 'bg' &&
        bg.bgStagingSpPlayers.get(appId)?.sourceType === 'sidebar'
    );
    nextSp.isStaging = false;
    nextSp.isNextPreload = false;
    nextSp.awaitingBgFrameHandoff = preserveSidebarHandoff;
    if (preserveSidebarHandoff) {
      nextSp.handoffSource = 'sidebar';
      nextSp.handoffStartedAt = activeSp.handoffStartedAt || Date.now();
    } else {
      nextSp.handoffStartedAt = 0;
    }
    nextSp.lastTimeAdvanceAt = Date.now();
    const savedVol = getSavedMediaVolumeState(appId);
    nextSp.desiredMuted = activeSp ? Boolean(activeSp.desiredMuted) : savedVol.muted;
    nextSp.lastNonZeroVolume =
      (activeSp && activeSp.lastNonZeroVolume > 0.001 ? activeSp.lastNonZeroVolume : 0) ||
      savedVol.lastNonZeroVolume ||
      1.0;
    nextSp.desiredVolume =
      activeSp && typeof activeSp.desiredVolume === 'number' && Number.isFinite(activeSp.desiredVolume)
        ? activeSp.desiredVolume
        : savedVol.volume;
    if (initialTargetTime > 0) {
      nextSp.targetTime = initialTargetTime;
      nextSp.pendingSeekTarget = initialTargetTime;
      nextSp.pendingSeekSetAt = Date.now();
    }
    if (nextSp.videoEl) {
      nextSp.videoEl.muted = isTabPausedEnforced() ? true : nextSp.desiredMuted;
      nextSp.videoEl.volume = nextSp.desiredVolume;
      nextSp.videoEl.playbackRate = 1.0;
    }

    bg.bgSpEmePlayers.set(appId, nextSp);
    if (isTabPausedEnforced()) {
      nextSp.remotePaused = true;
      if (getBehavior() === 'pause-resume') {
        nextSp.autoPausedByTab = true;
        bg.tabAudio.tabAutoPausedSpAppIds.add(appId);
      }
      if (nextSp.videoEl) {
        nextSp.videoEl.muted = true;
        if (!nextSp.videoEl.paused) {
          try {
            nextSp.videoEl.pause();
          } catch (_) {}
        }
      }
    } else {
      nextSp.remotePaused = false;
      syncSpInstanceTimeAndPlay(nextSp, initialTargetTime > 0);
    }

    if (activeSp && activeSp !== nextSp) {
      clearTimeout(activeSp.retireBgTimer);
      disposeSpPlayerInstance(activeSp);
    }
    logAudioDiag('promote-next-track', {
      appId,
      trackTitle: nextSp.trackTitle || '',
      msId: nextSp.msId || 0,
      initialTargetTime
    });
    return true;
  }

  function syncSpInstanceTimeAndPlay(sp, forceSeek = false, isExplicitUserScrub = false) {
    if (!sp || sp.disposed || !sp.videoEl) return;
    try {
      const isUserScrub = Boolean(
        isExplicitUserScrub ||
        (sp.explicitUserScrubUntil && Date.now() < sp.explicitUserScrubUntil) ||
        sp.pendingSeekIsUserScrub
      );
      const ct = Number(sp.videoEl.currentTime) || 0;
      if (!sp.maxObservedCt || ct > sp.maxObservedCt) {
        sp.maxObservedCt = ct;
      }

      if (sp.sb && sp.sb.buffered && sp.sb.buffered.length > 0) {
        const inBuffered = isTimeInSpBuffered(sp, ct);
        const bufStart0 = sp.sb.buffered.start(0);
        const bufEnd = getSpBufferedEnd(sp);

        if (forceSeek && sp.targetTime >= 0) {
          if (isTimeInSpBuffered(sp, sp.targetTime)) {
            const allowSeek = isUserScrub || sp.targetTime >= ct - 0.05;
            let seekConfirmed = true;
            if (allowSeek && Math.abs(ct - sp.targetTime) > 0.35) {
              if (sp.videoEl.readyState >= 1) {
                sp.videoEl.currentTime = sp.targetTime;
                if (isUserScrub) sp.maxObservedCt = sp.targetTime;
                seekConfirmed = Math.abs((Number(sp.videoEl.currentTime) || 0) - sp.targetTime) <= 0.35;
              } else {
                seekConfirmed = false;
              }
            } else if (!allowSeek) {
              logAudioDiag('clamp-backward-seek-target', {
                appId: sp.appId,
                targetTime: Math.round(sp.targetTime * 100) / 100,
                ct: Math.round(ct * 100) / 100,
                maxObservedCt: Math.round((sp.maxObservedCt || 0) * 100) / 100
              });
            }
            if (seekConfirmed) {
              sp.pendingSeekTarget = 0;
              sp.pendingSeekSetAt = 0;
              sp.pendingSeekIsUserScrub = false;
              sp.explicitUserScrubUntil = 0;
            } else {
              sp.pendingSeekTarget = sp.targetTime;
              sp.pendingSeekSetAt = Date.now();
              sp.pendingSeekIsUserScrub = isUserScrub;
            }
          } else {
            if (isUserScrub || sp.targetTime >= ct - 0.05) {
              sp.pendingSeekTarget = sp.targetTime;
              sp.pendingSeekSetAt = Date.now();
              sp.pendingSeekIsUserScrub = isUserScrub;
            } else {
              sp.pendingSeekTarget = 0;
              sp.pendingSeekSetAt = 0;
              sp.pendingSeekIsUserScrub = false;
            }
          }
        } else if (
          (sp.pendingSeekTarget > 0 || (sp.pendingSeekIsUserScrub && sp.pendingSeekTarget >= 0)) &&
          sp.pendingSeekSetAt > 0 &&
          Date.now() - sp.pendingSeekSetAt < 8500
        ) {
          if (isTimeInSpBuffered(sp, sp.pendingSeekTarget)) {
            const allowPending = sp.pendingSeekIsUserScrub || isUserScrub || sp.pendingSeekTarget >= ct - 0.05;
            let pendingConfirmed = true;
            if (allowPending && Math.abs(ct - sp.pendingSeekTarget) > 0.08) {
              if (sp.videoEl.readyState >= 1) {
                sp.videoEl.currentTime = sp.pendingSeekTarget;
                if (sp.pendingSeekIsUserScrub || isUserScrub) {
                  sp.maxObservedCt = sp.pendingSeekTarget;
                }
                pendingConfirmed = Math.abs((Number(sp.videoEl.currentTime) || 0) - sp.pendingSeekTarget) <= 0.35;
              } else {
                pendingConfirmed = false;
              }
            } else if (!allowPending) {
              logAudioDiag('discard-stale-pending-seek', {
                appId: sp.appId,
                pendingSeekTarget: Math.round(sp.pendingSeekTarget * 100) / 100,
                ct: Math.round(ct * 100) / 100
              });
            }
            if (pendingConfirmed) {
              sp.pendingSeekTarget = 0;
              sp.pendingSeekSetAt = 0;
              sp.pendingSeekIsUserScrub = false;
            }
          }
        } else if (!inBuffered) {
          const minFloor = !isUserScrub && sp.minContinueCt > 0 ? sp.minContinueCt : 0;
          if (ct < bufStart0 - 0.25 && (minFloor <= 0 || bufStart0 >= minFloor - 0.5)) {
            if (sp.targetTime >= bufStart0 && isTimeInSpBuffered(sp, sp.targetTime)) {
              sp.videoEl.currentTime = sp.targetTime;
            } else {
              sp.videoEl.currentTime = bufStart0 + 0.02;
            }
          } else {
            const isStalled = sp.lastTimeAdvanceAt > 0 && Date.now() - sp.lastTimeAdvanceAt > 1500;
            const maxGap = isStalled ? 12.0 : 2.8;
            let bridgedForward = false;
            for (let i = 0; i < sp.sb.buffered.length; i++) {
              const rStart = sp.sb.buffered.start(i);
              const rEnd = sp.sb.buffered.end(i);
              if (rStart > ct && rStart - ct <= maxGap && rEnd > rStart + 0.08) {
                sp.videoEl.currentTime = rStart + 0.02;
                bridgedForward = true;
                break;
              }
            }
            if (!bridgedForward && !sp.isStaging && sp.appId === 'spotify' && bufEnd > 2 && ct >= bufEnd - 0.12) {
              const nextSp = bg.bgNextSpPlayers.get(sp.appId);
              const nearTrackEnd = !sp.trackDuration || ct >= sp.trackDuration - 2.0;
              if (
                nextSp &&
                !nextSp.disposed &&
                nextSp.hasLicense &&
                nextSp.sb &&
                nextSp.sb.buffered &&
                nextSp.sb.buffered.length > 0 &&
                nearTrackEnd
              ) {
                promoteNextSpPlayer(sp.appId, 0);
                return;
              }
            }
          }
        } else if (sp.sb.buffered.length > 1) {
          const isStalled = sp.lastTimeAdvanceAt > 0 && Date.now() - sp.lastTimeAdvanceAt > 1500;
          const maxGap = isStalled ? 12.0 : 2.8;
          for (let i = 0; i < sp.sb.buffered.length - 1; i++) {
            const rEnd = sp.sb.buffered.end(i);
            const nextStart = sp.sb.buffered.start(i + 1);
            const nextEnd = sp.sb.buffered.end(i + 1);
            if (
              ct >= rEnd - 0.09 &&
              ct <= rEnd + 0.05 &&
              nextStart > rEnd &&
              nextStart - rEnd <= maxGap &&
              nextEnd > nextStart + 0.08 &&
              (sp.targetTime >= nextStart - 0.05 || ct >= rEnd - 0.02)
            ) {
              sp.videoEl.currentTime = nextStart + 0.02;
              break;
            }
          }
        }
      } else if (forceSeek && sp.targetTime > 0) {
        const allowSeek = isUserScrub || sp.targetTime >= ct - 0.05;
        if (allowSeek) {
          sp.pendingSeekTarget = sp.targetTime;
          sp.pendingSeekSetAt = Date.now();
          sp.pendingSeekIsUserScrub = isUserScrub;
          // Only jump videoEl.currentTime immediately when the target is buffered (or no SourceBuffer yet),
          // so unbuffered handoffs never stall videoEl into readyState=1 silence.
          const hasSb = Boolean(sp.sb && sp.sb.buffered && sp.sb.buffered.length > 0);
          if (sp.videoEl.readyState >= 1 && (!hasSb || isTimeInSpBuffered(sp, sp.targetTime))) {
            sp.videoEl.currentTime = sp.targetTime;
            if (isUserScrub) sp.maxObservedCt = sp.targetTime;
          }
        }
      }

      if (!sp.isStaging && isTabPausedEnforced()) {
        sp.remotePaused = true;
        if (getBehavior() === 'pause-resume') {
          sp.autoPausedByTab = true;
          if (sp.appId) bg.tabAudio.tabAutoPausedSpAppIds.add(sp.appId);
        }
        sp.videoEl.muted = true;
        if (!sp.videoEl.paused) {
          sp.lastPauseTrigger = 'tab-auto-pause-enforced';
          sp.videoEl.pause();
        }
        return;
      }

      if (!sp.isStaging && !sp.remotePaused) {
        ensureBgWebAudioKeepalive();
        sp.lastPlayedAt = Date.now();
        sp.videoEl.muted = Boolean(sp.desiredMuted);
        if (typeof sp.desiredVolume !== 'number' || !Number.isFinite(sp.desiredVolume)) {
          sp.desiredVolume = getSavedMediaVolumeState(sp.appId).volume;
        }
        sp.videoEl.volume = Math.min(1, Math.max(0, sp.desiredVolume));
        if (sp.videoEl.playbackRate !== 1.0 && !sp.isClear) {
          sp.videoEl.playbackRate = 1.0;
        }
        const curCtNow = Number(sp.videoEl.currentTime) || 0;
        const hasUnfulfilledSeek = Boolean(
          sp.pendingSeekTarget > 0 &&
            sp.pendingSeekSetAt > 0 &&
            Date.now() - sp.pendingSeekSetAt < 8500 &&
            (sp.videoEl.readyState < 1 ||
              !sp.sb ||
              !sp.sb.buffered ||
              sp.sb.buffered.length === 0 ||
              !isTimeInSpBuffered(sp, sp.pendingSeekTarget) ||
              curCtNow < sp.pendingSeekTarget - 0.5)
        );
        if (sp.videoEl.paused && !hasUnfulfilledSeek) {
          sp.lastTimeAdvanceAt = Date.now();
          sp.lastPlayTrigger = forceSeek ? (isUserScrub ? 'user-seek-play' : 'time-sync-seek-play') : 'steady-state-play';
          sp.videoEl.play().catch(() => {});
        }
      }
    } catch (_) {}
  }

  function syncClearMirrorToFrame(sp, frameTime) {
    if (!sp || sp.disposed || !sp.videoEl || sp.isStaging) return;
    const v = sp.videoEl;
    try {
      if (isTabPausedEnforced()) {
        sp.remotePaused = true;
        if (getBehavior() === 'pause-resume') {
          sp.autoPausedByTab = true;
          if (sp.appId) bg.tabAudio.tabAutoPausedSpAppIds.add(sp.appId);
        }
        v.muted = true;
        if (!v.paused) {
          sp.lastPauseTrigger = 'tab-auto-pause-enforced';
          v.pause();
        }
        return;
      }
      if (!sp.remotePaused) {
        sp.lastPlayedAt = Date.now();
        v.muted = Boolean(sp.desiredMuted);
      }
      if (sp.syncHoldUntil && Date.now() < sp.syncHoldUntil) {
        if (sp.minSyncFrameTime && frameTime < sp.minSyncFrameTime) {
          if (v.paused && !sp.remotePaused) {
            sp.lastPlayTrigger = 'clear-mirror-sync-play';
            v.play().catch(() => {});
          }
          return;
        }
        sp.syncHoldUntil = 0;
        sp.minSyncFrameTime = 0;
      }
      if (v.paused) {
        if (isTimeInSpBuffered(sp, frameTime)) v.currentTime = frameTime;
        v.playbackRate = 1.0;
        sp.lastPlayTrigger = 'clear-mirror-play';
        v.play().catch(() => {});
        return;
      }
      let drift = (Number(v.currentTime) || 0) - frameTime;
      if (Math.abs(drift) > 0.65) {
        if (isTimeInSpBuffered(sp, frameTime)) {
          v.currentTime = frameTime;
          drift = (Number(v.currentTime) || 0) - frameTime;
        }
        v.playbackRate = 1.0;
      } else if (Math.abs(drift) > 0.14) {
        v.playbackRate = Math.max(0.97, Math.min(1.03, 1 - drift * 0.18));
      } else if (v.playbackRate !== 1.0) {
        v.playbackRate = 1.0;
      }
      sp.lastDrift = Math.round(drift * 1000) / 1000;
    } catch (_) {}
  }

  function postSpSeekToSource(appId, sourceType, t, forceHarmonySeek = false) {
    let deliveredViaPort = false;
    const directPort = bg.emeBridgePorts.get(`${sourceType}:${appId}`);
    if (directPort) {
      try {
        directPort.postMessage({ cmd: 'SEEK_SP_MEDIA', currentTime: t, forceHarmonySeek: Boolean(forceHarmonySeek) });
        deliveredViaPort = true;
      } catch (_) {
        bg.emeBridgePorts.delete(`${sourceType}:${appId}`);
      }
    }
    if (sourceType === 'sidebar') {
      if (!deliveredViaPort) {
        browser.runtime
          .sendMessage({ type: 'PM_SEEK_SIDEBAR_SP', appId, currentTime: t, forceHarmonySeek: Boolean(forceHarmonySeek) })
          .catch(() => {});
      }
      return true;
    }
    const bgEntry = bg.bgAudioPool.get(appId);
    if (bgEntry && bgEntry.frame && bgEntry.frame.contentWindow) {
      try {
        bgEntry.frame.contentWindow.postMessage(
          {
            target: 'pocketmail-media-frame',
            cmd: 'SEEK_SP_MEDIA',
            currentTime: t,
            forceHarmonySeek: Boolean(forceHarmonySeek)
          },
          '*'
        );
      } catch (_) {}
    }
    return deliveredViaPort;
  }

  function postSpSkipNextToSource(appId, sourceType) {
    const directPort = bg.emeBridgePorts.get(`${sourceType}:${appId}`);
    if (directPort) {
      try {
        directPort.postMessage({ cmd: 'SKIP_NEXT_SP_TRACK' });
      } catch (_) {
        bg.emeBridgePorts.delete(`${sourceType}:${appId}`);
      }
    }
    if (sourceType === 'sidebar') {
      browser.runtime.sendMessage({ type: 'PM_SKIP_SIDEBAR_SP', appId }).catch(() => {});
      return;
    }
    const bgEntry = bg.bgAudioPool.get(appId);
    if (bgEntry && bgEntry.frame && bgEntry.frame.contentWindow) {
      try {
        bgEntry.frame.contentWindow.postMessage(
          { target: 'pocketmail-media-frame', cmd: 'SKIP_NEXT_SP_TRACK' },
          '*'
        );
      } catch (_) {}
    }
  }

  function isPlayableYouTubeUrl(url) {
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
  }

  function isDifferentSpTrackTitle(a, b) {
    const norm = (t) => String(t || '').trim().toLowerCase();
    const aNorm = norm(a);
    const bNorm = norm(b);
    return Boolean(
      aNorm &&
        bNorm &&
        aNorm !== 'spotify' &&
        bNorm !== 'spotify' &&
        aNorm !== bNorm
    );
  }

  function promoteStagingSpPlayer(appId, syncFromActive = true) {
    const stagingSp = bg.bgStagingSpPlayers.get(appId);
    if (!stagingSp || stagingSp.disposed) return;
    const activeSp = bg.bgSpEmePlayers.get(appId);
    const isDifferentTrack = Boolean(activeSp && isDifferentSpTrackTitle(stagingSp.trackTitle, activeSp.trackTitle));
    const activeIsAlive = Boolean(activeSp && activeSp.videoEl && !activeSp.disposed);
    const minFloor = !isDifferentTrack && stagingSp.minContinueCt > 0 ? stagingSp.minContinueCt : 0;
    const rawLiveCt =
      syncFromActive && !isDifferentTrack && activeIsAlive
        ? Math.max(Number(activeSp.videoEl.currentTime) || 0, minFloor)
        : minFloor;
    const activeEndedOrAtEnd = Boolean(
      activeIsAlive &&
        (activeSp.videoEl.ended || (activeSp.trackDuration > 15 && rawLiveCt >= activeSp.trackDuration - 2.0))
    );
    const stagingStartsFreshTrack = Boolean(
      activeEndedOrAtEnd &&
        rawLiveCt > 15 &&
        stagingSp.sb &&
        stagingSp.sb.buffered &&
        stagingSp.sb.buffered.length > 0 &&
        !isTimeInSpBuffered(stagingSp, rawLiveCt) &&
        stagingSp.sb.buffered.start(0) < 2.0 &&
        getSpBufferedEnd(stagingSp) < Math.max(25, rawLiveCt - 15)
    );
    const liveCt = stagingStartsFreshTrack ? 0 : rawLiveCt;

    let shouldForceSeek = false;
    if (liveCt > 0 && isTimeInSpBuffered(stagingSp, liveCt)) {
      let exactCt = liveCt;
      if (stagingSp.sb && stagingSp.sb.buffered) {
        for (let i = 0; i < stagingSp.sb.buffered.length; i++) {
          const bStart = stagingSp.sb.buffered.start(i);
          const bEnd = stagingSp.sb.buffered.end(i);
          if (liveCt >= bStart - 0.15 && liveCt <= bEnd - 0.02) {
            exactCt = Math.max(liveCt, bStart);
            break;
          }
        }
      }
      let seekApplied = false;
      if (stagingSp.videoEl) {
        try {
          if (stagingSp.videoEl.readyState >= 1) {
            stagingSp.videoEl.currentTime = exactCt;
            seekApplied = Math.abs((Number(stagingSp.videoEl.currentTime) || 0) - exactCt) <= 0.35;
          }
        } catch (_) {}
      }
      stagingSp.targetTime = exactCt;
      stagingSp.minContinueCt = exactCt;
      if (seekApplied) {
        stagingSp.pendingSeekTarget = 0;
        stagingSp.pendingSeekSetAt = 0;
        shouldForceSeek = false;
      } else {
        stagingSp.pendingSeekTarget = exactCt;
        stagingSp.pendingSeekSetAt = Date.now();
        shouldForceSeek = true;
      }
    } else if ((activeIsAlive || minFloor > 0) && !isDifferentTrack && liveCt > 0) {
      let forwardRange = null;
      if (stagingSp.sb && stagingSp.sb.buffered) {
        for (let i = 0; i < stagingSp.sb.buffered.length; i++) {
          const bStart = stagingSp.sb.buffered.start(i);
          const bEnd = stagingSp.sb.buffered.end(i);
          if (bStart > liveCt && bStart - liveCt <= 3.0 && bEnd > bStart + 0.08) {
            forwardRange = bStart + 0.02;
            break;
          }
        }
      }
      if (forwardRange !== null) {
        let forwardApplied = false;
        if (stagingSp.videoEl) {
          try {
            if (stagingSp.videoEl.readyState >= 1) {
              stagingSp.videoEl.currentTime = forwardRange;
              forwardApplied = Math.abs((Number(stagingSp.videoEl.currentTime) || 0) - forwardRange) <= 0.35;
            }
          } catch (_) {}
        }
        stagingSp.targetTime = forwardRange;
        stagingSp.minContinueCt = forwardRange;
        if (forwardApplied) {
          stagingSp.pendingSeekTarget = 0;
          stagingSp.pendingSeekSetAt = 0;
          shouldForceSeek = false;
        } else {
          stagingSp.pendingSeekTarget = forwardRange;
          stagingSp.pendingSeekSetAt = Date.now();
          shouldForceSeek = true;
        }
      } else {
        stagingSp.targetTime = liveCt;
        stagingSp.pendingSeekTarget = liveCt;
        stagingSp.pendingSeekSetAt = Date.now();
        stagingSp.minContinueCt = Math.max(stagingSp.minContinueCt || 0, liveCt);
        shouldForceSeek = liveCt > 0.25;
        if (liveCt > 0.25 && stagingSp.sourceType === 'sidebar') {
          postSpSeekToSource(appId, stagingSp.sourceType, liveCt, true);
        }
      }
    } else if (stagingSp.targetTime > 0 && isTimeInSpBuffered(stagingSp, stagingSp.targetTime)) {
      shouldForceSeek = true;
    } else if (stagingSp.sb && stagingSp.sb.buffered && stagingSp.sb.buffered.length > 0) {
      stagingSp.targetTime = Math.max(stagingSp.sb.buffered.start(0) + 0.02, minFloor);
      shouldForceSeek = true;
    }

    if (stagingSp.isClear && liveCt > 0.5) {
      stagingSp.syncHoldUntil = Date.now() + 1800;
      stagingSp.minSyncFrameTime = Math.max(0, liveCt - 1.5);
    }

    stagingSp.isStaging = false;
    stagingSp.awaitingBgFrameHandoff = false;
    const savedVol = getSavedMediaVolumeState(appId);
    stagingSp.desiredMuted = activeSp ? Boolean(activeSp.desiredMuted) : savedVol.muted;
    stagingSp.lastNonZeroVolume =
      (activeSp && activeSp.lastNonZeroVolume > 0.001 ? activeSp.lastNonZeroVolume : 0) ||
      savedVol.lastNonZeroVolume ||
      1.0;
    stagingSp.desiredVolume =
      activeSp && typeof activeSp.desiredVolume === 'number' && Number.isFinite(activeSp.desiredVolume)
        ? activeSp.desiredVolume
        : savedVol.volume;
    if (stagingSp.videoEl) {
      stagingSp.videoEl.muted = isTabPausedEnforced() ? true : stagingSp.desiredMuted;
      stagingSp.videoEl.volume = stagingSp.desiredVolume;
      stagingSp.videoEl.playbackRate = 1.0;
    }

    bg.bgSpEmePlayers.set(appId, stagingSp);
    bg.bgStagingSpPlayers.delete(appId);
    if (isTabPausedEnforced() || (activeSp && activeSp.autoPausedByTab && bg.tabAudio.isAutoPausedByTabAudio)) {
      stagingSp.remotePaused = true;
      if (getBehavior() === 'pause-resume') {
        stagingSp.autoPausedByTab = true;
        bg.tabAudio.tabAutoPausedSpAppIds.add(appId);
      }
      if (stagingSp.videoEl) {
        stagingSp.videoEl.muted = true;
        if (!stagingSp.videoEl.paused) {
          try {
            stagingSp.videoEl.pause();
          } catch (_) {}
        }
      }
    } else {
      syncSpInstanceTimeAndPlay(stagingSp, shouldForceSeek);
    }

    if (stagingSp.sourceType === 'sidebar' && bg.bgAudioPool.has(appId)) {
      removeBgAudioIframeOnly(appId);
    }

    if (activeSp && activeSp !== stagingSp) {
      clearTimeout(activeSp.retireBgTimer);
      disposeSpPlayerInstance(activeSp);
    }
    logAudioDiag('promote-staging', {
      appId,
      sourceType: stagingSp.sourceType,
      liveCt: Math.round(liveCt * 100) / 100,
      targetTime: Math.round((stagingSp.targetTime || 0) * 100) / 100,
      isDifferentTrack
    });
  }

  function checkAndPromoteStagingSpPlayer(appId) {
    const stagingSp = bg.bgStagingSpPlayers.get(appId);
    if (!stagingSp || stagingSp.disposed) return;
    const activeSp = bg.bgSpEmePlayers.get(appId);
    if (
      stagingSp.sourceType === 'sidebar' &&
      bg.bgAudioPool.has(appId) &&
      !(activeSp && activeSp.awaitingBgFrameHandoff && activeSp.handoffSource === 'sidebar')
    ) {
      return;
    }

    const activeDeadOrNearEnd =
      !activeSp ||
      activeSp.disposed ||
      !activeSp.videoEl ||
      (activeSp.videoEl.paused && !isTabPausedEnforced() && !activeSp.autoPausedByTab) ||
      activeSp.videoEl.ended ||
      (getSpBufferedEnd(activeSp) > 0 && getSpBufferedEnd(activeSp) - (activeSp.videoEl.currentTime || 0) < 0.25);

    const stagingBufSpan =
      stagingSp.sb && stagingSp.sb.buffered && stagingSp.sb.buffered.length > 0
        ? stagingSp.sb.buffered.end(stagingSp.sb.buffered.length - 1) -
          stagingSp.sb.buffered.start(stagingSp.sb.buffered.length - 1)
        : 0;
    const stagingReady =
      stagingSp.hasLicense &&
      stagingSp.sb &&
      stagingSp.sb.buffered &&
      stagingSp.sb.buffered.length > 0 &&
      (stagingBufSpan >= 1.2 || activeDeadOrNearEnd);

    if (!stagingReady) {
      if (
        stagingSp.isClear &&
        activeDeadOrNearEnd &&
        stagingSp.sb &&
        stagingSp.sb.buffered &&
        stagingSp.sb.buffered.length > 0
      ) {
        promoteStagingSpPlayer(appId, true);
      }
      return;
    }

    const liveCt = Math.max(
      activeSp && activeSp.videoEl ? Number(activeSp.videoEl.currentTime) || 0 : 0,
      stagingSp.minContinueCt || 0
    );
    const isDifferentTrack = Boolean(activeSp && isDifferentSpTrackTitle(stagingSp.trackTitle, activeSp.trackTitle));

    if (isDifferentTrack) {
      const liveMetaTitle = bg.liveMediaPlaybackState.get(appId)?.title || '';
      const matchesCurrentLiveTrack = Boolean(
        stagingSp.trackTitle &&
          liveMetaTitle &&
          !isDifferentSpTrackTitle(stagingSp.trackTitle, liveMetaTitle)
      );
      const hasExplicitIntent = Boolean(
        stagingSp.sourceType !== 'sidebar' ||
          stagingSp.explicitSidebarPlayIntent ||
          (activeSp && activeSp.explicitSidebarPlayIntent) ||
          matchesCurrentLiveTrack ||
          activeDeadOrNearEnd
      );
      if (!hasExplicitIntent) {
        logAudioDiag('block-mismatched-staging-promote', {
          appId,
          activeTrack: activeSp.trackTitle,
          stagingTrack: stagingSp.trackTitle
        });
        return;
      }
      if (stagingSp.sourceType === 'sidebar' && bg.bgAudioPool.has(appId)) {
        removeBgAudioIframeOnly(appId);
      }
      promoteStagingSpPlayer(appId, false);
      return;
    }

    if (
      !stagingSp.isClear &&
      activeSp &&
      activeSp.trackDuration > 15 &&
      liveCt >= activeSp.trackDuration - 2.2 &&
      getSpBufferedEnd(stagingSp) < Math.max(25, liveCt - 15) &&
      (!stagingSp.skipNextSentAt || Date.now() - stagingSp.skipNextSentAt > 3500)
    ) {
      stagingSp.skipNextSentAt = Date.now();
      postSpSkipNextToSource(appId, stagingSp.sourceType);
      if (!activeDeadOrNearEnd) return;
    }

    const needsHarmonyAlignment = liveCt > 0.8 && !isTimeInSpBuffered(stagingSp, liveCt);
    if (needsHarmonyAlignment) {
      const now = Date.now();
      const confirmedSeeks = stagingSp.seekConfirmedCount || 0;
      const rawAttempts = stagingSp.seekAttempts || 0;
      const retryDelayMs = confirmedSeeks > 0 ? 1800 : 850;
      if (
        !stagingSp.lastSeekSentAt ||
        (now - stagingSp.lastSeekSentAt > retryDelayMs && confirmedSeeks < 4 && rawAttempts < 12)
      ) {
        const aheadSec = Math.max(1.5, Math.min(3.0, (now - (stagingSp.licensedAt || now)) * 0.001 + 1.2));
        const sentOk = postSpSeekToSource(appId, stagingSp.sourceType, liveCt + aheadSec, true);
        if (sentOk) {
          stagingSp.lastSeekSentAt = now;
          stagingSp.seekAttempts = rawAttempts + 1;
        }
      }
      const maxStagingWaitMs = stagingSp.isClear ? 3500 : 9500;
      const timedOut = stagingSp.licensedAt > 0 && now - stagingSp.licensedAt > maxStagingWaitMs;
      const activeIsPlaying = isSpActivelyPlayingCurrentTrack(activeSp);
      if (activeIsPlaying || (!activeDeadOrNearEnd && !timedOut)) {
        return;
      }
    }

    if (stagingSp.sourceType === 'sidebar' && bg.bgAudioPool.has(appId)) {
      removeBgAudioIframeOnly(appId);
    }
    promoteStagingSpPlayer(appId, true);
  }

  function drainSpInstanceQueue(sp) {
    if (!sp || sp.disposed || !sp.sb || sp.sb.updating || sp.queue.length === 0) return;
    const item = sp.queue.shift();
    try {
      if (item.type === 'abort') {
        try {
          sp.sb.abort();
        } catch (_) {}
        drainSpInstanceQueue(sp);
        return;
      }
      if (item.type === 'remove') {
        sp.sb.remove(item.start, item.end);
        return;
      }
      if (item.chunk) {
        if (
          typeof item.timestampOffset === 'number' &&
          Math.abs((sp.sb.timestampOffset || 0) - item.timestampOffset) > 0.01
        ) {
          try {
            sp.sb.timestampOffset = item.timestampOffset;
          } catch (_) {
            try {
              sp.sb.abort();
              sp.sb.timestampOffset = item.timestampOffset;
            } catch (__) {}
          }
        }
        sp.sb.appendBuffer(item.chunk);
      }
    } catch (err) {
      if (
        err &&
        err.name === 'QuotaExceededError' &&
        sp.videoEl &&
        sp.sb &&
        !sp.sb.updating &&
        sp.sb.buffered.length > 0
      ) {
        try {
          const bStart = sp.sb.buffered.start(0);
          const ct = Number(sp.videoEl.currentTime) || 0;
          const maxSafeCut = Math.max(bStart, ct - 2);
          const cutEnd = Math.min(maxSafeCut, Math.max(bStart + 5, ct - 8));
          if (cutEnd > bStart + 0.1) {
            sp.queue.unshift(item);
            sp.sb.remove(bStart, cutEnd);
            return;
          }
        } catch (_) {}
      }
      if (item && item.chunk && (item._errRetries || 0) < 2) {
        item._errRetries = (item._errRetries || 0) + 1;
        sp.queue.unshift(item);
      }
      if (!sp.disposed && sp.sb && !sp.sb.updating && sp.queue.length > 0) {
        setTimeout(() => drainSpInstanceQueue(sp), 20);
      }
    }
  }

  function armSpGenRetryTimer(sp) {
    if (!sp || sp.disposed || sp._genRetryTimer) return;
    const deferred = Array.isArray(sp.deferredGenReqs) ? sp.deferredGenReqs : [];
    if (deferred.length === 0) return;
    const now = Date.now();
    let earliestAt = Infinity;
    for (let i = 0; i < deferred.length; i++) {
      const t = Number(deferred[i]?.retryNotBefore) || now;
      if (t < earliestAt) earliestAt = t;
    }
    const waitMs = Math.max(10, Math.min(10000, earliestAt - now));
    sp._genRetryTimer = setTimeout(() => {
      sp._genRetryTimer = null;
      if (sp.disposed) return;
      const curNow = Date.now();
      const ready = [];
      const remaining = [];
      const curList = Array.isArray(sp.deferredGenReqs) ? sp.deferredGenReqs : [];
      for (let i = 0; i < curList.length; i++) {
        const r = curList[i];
        if (!r) continue;
        if (!r.retryNotBefore || curNow >= r.retryNotBefore) {
          r.retryNotBefore = 0;
          ready.push(r);
        } else {
          remaining.push(r);
        }
      }
      sp.deferredGenReqs = remaining;
      if (ready.length > 0) {
        sp.pendingGenReqs.push(...ready);
      }
      if (remaining.length > 0) {
        armSpGenRetryTimer(sp);
      }
      if (sp.pendingGenReqs.length > 0) {
        processSpInstanceGenReqs(sp);
      }
    }, waitMs);
  }

  function scheduleSpGenReqRetry(sp, req, keySig, reason = '') {
    if (!sp || sp.disposed || !req) return;
    if (keySig) sp.processedInitDataKeys.delete(keySig);
    if (!Array.isArray(sp.deferredGenReqs)) sp.deferredGenReqs = [];
    if (sp.deferredGenReqs.includes(req)) {
      armSpGenRetryTimer(sp);
      return;
    }
    req.retries = (req.retries || 0) + 1;
    if (req.retries > 6) {
      logAudioDiag('eme-license-giveup', {
        appId: sp.appId,
        sourceType: sp.sourceType,
        reason,
        retries: req.retries
      });
      return;
    }
    const delayMs = Math.min(10000, 450 * Math.pow(2, req.retries - 1));
    req.retryNotBefore = Date.now() + delayMs;
    sp.deferredGenReqs.push(req);
    armSpGenRetryTimer(sp);
  }

  async function processSpInstanceGenReqs(sp) {
    const entryAuth = sp && (sp.licAuth || bg.bgSpCachedMeta.get(sp.appId)?.licAuth);
    if (!sp || sp.disposed || !sp.mk || !entryAuth || sp.pendingGenReqs.length === 0) return;
    if (!sp.licAuth) sp.licAuth = entryAuth;
    let iterations = 0;
    const maxIterations = Math.max(16, sp.pendingGenReqs.length * 2 + 4);
    while (sp.pendingGenReqs.length > 0 && !sp.disposed && iterations++ < maxIterations) {
      const preAuth = sp.licAuth || bg.bgSpCachedMeta.get(sp.appId)?.licAuth;
      if (!preAuth) break;
      const req = sp.pendingGenReqs.shift();
      if (req && req.retryNotBefore && Date.now() < req.retryNotBefore) {
        if (!Array.isArray(sp.deferredGenReqs)) sp.deferredGenReqs = [];
        if (!sp.deferredGenReqs.includes(req)) sp.deferredGenReqs.push(req);
        armSpGenRetryTimer(sp);
        continue;
      }
      const keySig = `${req.initDataType}:${new Uint8Array(req.initData).join(',')}`;
      let sawMissingAuth = false;
      try {
        if (sp.processedInitDataKeys.has(keySig)) continue;
        sp.processedInitDataKeys.add(keySig);
        const sess = sp.mk.createSession();
        sess.addEventListener('message', async (ev) => {
          if (sp.disposed) return;
          try {
            const auth = sp.licAuth || bg.bgSpCachedMeta.get(sp.appId)?.licAuth;
            if (!auth) {
              sawMissingAuth = true;
              sp.processedInitDataKeys.delete(keySig);
              sp.pendingGenReqs.unshift(req);
              sess.close().catch(() => {});
              return;
            }
            const resp = await fetch(auth.url, {
              method: 'POST',
              headers: auth.headers,
              body: ev.message
            });
            sp.lastLicStatus = resp.status;
            if (!resp.ok) {
              logAudioDiag('eme-license-retry', {
                appId: sp.appId,
                status: resp.status,
                sourceType: sp.sourceType,
                retries: (req.retries || 0) + 1
              });
              scheduleSpGenReqRetry(sp, req, keySig, `http-${resp.status}`);
              sess.close().catch(() => {});
              return;
            }
            const licBuf = await resp.arrayBuffer();
            if (sp.disposed) return;
            await sess.update(licBuf);
            sp.hasLicense = true;
            if (!sp.licensedAt) sp.licensedAt = Date.now();
            if (sp.isStaging && !sp.isNextPreload) {
              checkAndPromoteStagingSpPlayer(sp.appId);
            } else if (!sp.isNextPreload) {
              syncSpInstanceTimeAndPlay(sp);
            } else {
              const activeSp = bg.bgSpEmePlayers.get(sp.appId);
              if (
                activeSp &&
                activeSp.videoEl &&
                (activeSp.videoEl.ended ||
                  (getSpBufferedEnd(activeSp) > 2 &&
                    (activeSp.videoEl.currentTime || 0) >= getSpBufferedEnd(activeSp) - 0.15))
              ) {
                promoteNextSpPlayer(sp.appId, 0);
              }
            }
          } catch (err) {
            sp.lastGenErr = String(err);
            logAudioDiag('eme-license-err', {
              appId: sp.appId,
              sourceType: sp.sourceType,
              err: String(err)
            });
            scheduleSpGenReqRetry(sp, req, keySig, String(err));
            sess.close().catch(() => {});
          }
        });
        await sess.generateRequest(req.initDataType, req.initData);
        if (sawMissingAuth) break;
      } catch (err) {
        sp.lastGenErr = String(err);
        logAudioDiag('eme-gen-err', {
          appId: sp.appId,
          sourceType: sp.sourceType,
          err: String(err)
        });
        scheduleSpGenReqRetry(sp, req, keySig, String(err));
      }
    }
  }

  function prewarmNextSpMediaKeys() {}

  function attachFreshSpMediaSource(sp, effectiveMime) {
    if (!sp || sp.disposed || !sp.videoEl) return Promise.resolve();
    try {
      if (sp.objUrl) URL.revokeObjectURL(sp.objUrl);
    } catch (_) {}
    sp.sb = null;
    const ms = new MediaSource();
    sp.ms = ms;
    sp.objUrl = URL.createObjectURL(ms);
    sp.videoEl.src = sp.objUrl;
    return new Promise((resolve) => {
      ms.addEventListener(
        'sourceopen',
        () => {
          if (!sp.disposed && sp.ms === ms) {
            try {
              const sb = ms.addSourceBuffer(effectiveMime);
              sp.sb = sb;
              sb.addEventListener('updateend', () => {
                if (sp.disposed || sp.sb !== sb) return;
                if (sp.isClear && !sp.licensedAt && sb.buffered.length > 0) sp.licensedAt = Date.now();
                if (sp.videoEl && !sb.updating && sb.buffered.length > 1) {
                  const ctNow = sp.videoEl.currentTime || 0;
                  const lastRangeStart = sb.buffered.start(sb.buffered.length - 1);
                  const firstRangeStart = sb.buffered.start(0);
                  const firstRangeEnd = sb.buffered.end(0);
                  if (ctNow >= lastRangeStart - 0.5 && firstRangeEnd < ctNow - 4.0) {
                    try {
                      sb.remove(firstRangeStart, Math.max(firstRangeEnd + 0.5, ctNow - 3.0));
                      return;
                    } catch (_) {}
                  }
                }
                if (
                  sp.videoEl &&
                  sp.videoEl.currentTime > 42 &&
                  !sb.updating &&
                  sb.buffered.length > 0 &&
                  sp.videoEl.currentTime - sb.buffered.start(0) > 32
                ) {
                  try {
                    sb.remove(sb.buffered.start(0), sp.videoEl.currentTime - 15);
                    return;
                  } catch (_) {}
                }
                drainSpInstanceQueue(sp);
                if (!sp.isStaging && sp.retireBgWhenBuffered && sp.videoEl) {
                  const rem = getSpBufferedEnd(sp) - (sp.videoEl.currentTime || 0);
                  if (rem >= 5.5) {
                    sp.retireBgWhenBuffered = false;
                    clearTimeout(sp.retireBgTimer);
                    logAudioDiag('retire-bg-after-buffer', {
                      appId: sp.appId,
                      rem: Math.round(rem * 100) / 100
                    });
                    if (bg.bgAudioPool.has(sp.appId)) {
                      removeBgAudioIframeOnly(sp.appId);
                    }
                  }
                }
                if (sp.isStaging && !sp.isNextPreload) {
                  checkAndPromoteStagingSpPlayer(sp.appId);
                } else if (!sp.isNextPreload) {
                  syncSpInstanceTimeAndPlay(sp);
                }
              });
            } catch (_) {}
          }
          resolve();
        },
        { once: true }
      );
    });
  }

  function initSpPlayerInstance(sp) {
    if (!sp || sp.disposed) return Promise.resolve();
    if (sp.mkReadyPromise) return sp.mkReadyPromise;
    const effectiveMime = sp.mime || 'audio/mp4; codecs="mp4a.40.2"';
    sp.mkReadyPromise = (async () => {
      try {
        const v = document.createElement('video');
        v.autoplay = false;
        v.muted = sp.isStaging || sp.isNextPreload || isTabPausedEnforced() ? true : sp.desiredMuted;
        v.volume = sp.isStaging || sp.isNextPreload ? 0 : sp.desiredVolume;
        v.addEventListener('ended', () => {
          if (!sp.disposed && !sp.isStaging && !sp.isNextPreload && bg.bgSpEmePlayers.get(sp.appId) === sp) {
            if (bg.bgNextSpPlayers.has(sp.appId)) {
              promoteNextSpPlayer(sp.appId, 0);
            }
          }
        });

        const videoEventHandlers = [
          ['play', () => {
            if (sp.disposed) return;
            logAudioDiag('media-play', {
              appId: sp.appId,
              sourceType: sp.sourceType,
              isStaging: Boolean(sp.isStaging),
              isNextPreload: Boolean(sp.isNextPreload),
              ct: Math.round((Number(v.currentTime) || 0) * 100) / 100,
              bufEnd: Math.round(getSpBufferedEnd(sp) * 100) / 100,
              readyState: v.readyState,
              trigger: sp.lastPlayTrigger || sp.lastPlayPauseTrigger || 'browser-play'
            });
          }],
          ['pause', () => {
            if (sp.disposed) return;
            logAudioDiag('media-pause', {
              appId: sp.appId,
              sourceType: sp.sourceType,
              isStaging: Boolean(sp.isStaging),
              isNextPreload: Boolean(sp.isNextPreload),
              ct: Math.round((Number(v.currentTime) || 0) * 100) / 100,
              bufEnd: Math.round(getSpBufferedEnd(sp) * 100) / 100,
              readyState: v.readyState,
              trigger: sp.lastPauseTrigger || sp.lastPlayPauseTrigger || 'browser-pause'
            });
          }],
          ['playing', () => {
            if (sp.disposed) return;
            logAudioDiag('media-playing', {
              appId: sp.appId,
              sourceType: sp.sourceType,
              ct: Math.round((Number(v.currentTime) || 0) * 100) / 100,
              bufEnd: Math.round(getSpBufferedEnd(sp) * 100) / 100,
              readyState: v.readyState
            });
          }],
          ['waiting', () => {
            if (sp.disposed) return;
            logAudioDiag('media-waiting', {
              appId: sp.appId,
              sourceType: sp.sourceType,
              ct: Math.round((Number(v.currentTime) || 0) * 100) / 100,
              bufEnd: Math.round(getSpBufferedEnd(sp) * 100) / 100,
              readyState: v.readyState
            });
          }],
          ['stalled', () => {
            if (sp.disposed) return;
            logAudioDiag('media-stalled', {
              appId: sp.appId,
              sourceType: sp.sourceType,
              ct: Math.round((Number(v.currentTime) || 0) * 100) / 100,
              bufEnd: Math.round(getSpBufferedEnd(sp) * 100) / 100,
              readyState: v.readyState
            });
          }],
          ['seeking', () => {
            if (sp.disposed) return;
            logAudioDiag('media-seeking', {
              appId: sp.appId,
              sourceType: sp.sourceType,
              ct: Math.round((Number(v.currentTime) || 0) * 100) / 100,
              targetTime: Math.round((Number(sp.targetTime) || 0) * 100) / 100
            });
          }],
          ['loadedmetadata', () => {
            if (sp.disposed || sp.isStaging || sp.isNextPreload) return;
            if (sp.pendingSeekTarget > 0) {
              syncSpInstanceTimeAndPlay(sp);
            }
          }],
          ['error', () => {
            if (sp.disposed) return;
            const err = v.error ? { code: v.error.code, message: v.error.message } : null;
            logAudioDiag('media-error', { appId: sp.appId, sourceType: sp.sourceType, error: err });
          }],
          ['encrypted', (ev) => {
            if (sp.disposed || sp.isClear || !ev || !ev.initData) return;
            const initBuf = toLocalArrayBuffer(ev.initData);
            if (!initBuf) return;
            const initDataType = String(ev.initDataType || 'cenc');
            recordRecentSpGenReq(sp.appId, initDataType, initBuf);
            sp.pendingGenReqs.push({ initDataType, initData: initBuf });
            processSpInstanceGenReqs(sp);
          }]
        ];

        videoEventHandlers.forEach(([evt, handler]) => {
          v.addEventListener(evt, handler);
        });
        sp._videoHandlers = videoEventHandlers;

        document.body.appendChild(v);
        sp.videoEl = v;

        if (sp.isClear) {
          await attachFreshSpMediaSource(sp, effectiveMime);
          if (sp.disposed) return;
          drainSpInstanceQueue(sp);
          return;
        }

        const acc = await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [
          {
            initDataTypes: ['cenc'],
            audioCapabilities: [{ contentType: effectiveMime, robustness: 'SW_SECURE_CRYPTO' }]
          }
        ]);
        if (sp.disposed) return;
        const mk = await acc.createMediaKeys();
        if (sp.disposed) return;
        if (sp.serverCert) {
          await mk.setServerCertificate(sp.serverCert).catch(() => {});
        }
        await v.setMediaKeys(mk);
        if (sp.disposed) return;
        sp.mk = mk;

        await attachFreshSpMediaSource(sp, effectiveMime);
        if (sp.disposed) return;
        drainSpInstanceQueue(sp);
        processSpInstanceGenReqs(sp);
      } catch (_) {}
    })();
    return sp.mkReadyPromise;
  }

  function isSpActivelyPlayingCurrentTrack(sp) {
    if (!sp || sp.disposed || !sp.videoEl) return false;
    if (sp.videoEl.paused || sp.videoEl.ended) return false;
    const bufEnd = getSpBufferedEnd(sp);
    const ct = Number(sp.videoEl.currentTime) || 0;
    return bufEnd - ct > 0.35;
  }

  function ensureNextSpEmePlayer(appId, mime = 'audio/mp4; codecs="mp4a.40.2"', newMsId = 0, sourceType = 'sidebar') {
    let nx = bg.bgNextSpPlayers.get(appId);
    const effectiveMime = mime || 'audio/mp4; codecs="mp4a.40.2"';
    if (!nx || nx.disposed) {
      nx = createSpPlayerInstance(appId, effectiveMime, newMsId, true, sourceType);
      nx.isNextPreload = true;
      bg.bgNextSpPlayers.set(appId, nx);
      return initSpPlayerInstance(nx);
    }
    nx.sourceType = sourceType;
    if (newMsId && !nx.msId) {
      nx.msId = newMsId;
    } else if (newMsId && nx.msId && newMsId !== nx.msId) {
      disposeSpPlayerInstance(nx);
      nx = createSpPlayerInstance(appId, effectiveMime, newMsId, true, sourceType);
      nx.isNextPreload = true;
      bg.bgNextSpPlayers.set(appId, nx);
      return initSpPlayerInstance(nx);
    }
    return initSpPlayerInstance(nx);
  }

  function ensureBgSpEmePlayer(appId, mime = 'audio/mp4; codecs="mp4a.40.2"', newMsId = 0, sourceType = 'sidebar') {
    let sp = bg.bgSpEmePlayers.get(appId);
    const effectiveMime = mime || 'audio/mp4; codecs="mp4a.40.2"';
    if (!sp || sp.disposed) {
      sp = createSpPlayerInstance(appId, effectiveMime, newMsId, false, sourceType);
      bg.bgSpEmePlayers.set(appId, sp);
      return initSpPlayerInstance(sp);
    }
    sp.sourceType = sourceType;
    if (newMsId && !sp.msId) {
      sp.msId = newMsId;
    } else if (newMsId && sp.msId && newMsId !== sp.msId) {
      const existingNx = appId === 'spotify' ? bg.bgNextSpPlayers.get(appId) : null;
      if (existingNx && !existingNx.disposed && existingNx.msId === newMsId) {
        existingNx.sourceType = sourceType;
        if (isSpActivelyPlayingCurrentTrack(sp)) {
          return initSpPlayerInstance(existingNx);
        }
        promoteNextSpPlayer(appId, 0);
        return initSpPlayerInstance(existingNx);
      }
      if (appId === 'spotify' && isSpActivelyPlayingCurrentTrack(sp)) {
        if (
          sourceType === 'sidebar' &&
          !bg.bgAudioPool.has(appId) &&
          sp.reloadingSidebarFrameAt &&
          Date.now() - sp.reloadingSidebarFrameAt < 25000
        ) {
          const minCt = Math.max(sp.minContinueCt || 0, Number(sp.videoEl?.currentTime) || 0, sp.targetTime || 0);
          const p = ensureStagingSpEmePlayer(appId, effectiveMime, newMsId, sourceType);
          const stSp = bg.bgStagingSpPlayers.get(appId);
          if (stSp) {
            stSp.minContinueCt = minCt;
            stSp.targetTime = minCt;
          }
          return p;
        }
        return ensureNextSpEmePlayer(appId, effectiveMime, newMsId, sourceType);
      }
      const prevVol = sp.desiredVolume;
      const prevMuted = Boolean(sp.desiredMuted);
      const prevLastNonZero = sp.lastNonZeroVolume;
      const preserveSidebarHandoff = Boolean(
        sourceType === 'bg' &&
          sp.awaitingBgFrameHandoff &&
          sp.handoffSource === 'sidebar' &&
          bg.bgStagingSpPlayers.get(appId)?.sourceType === 'sidebar'
      );
      const prevHandoffStartedAt = sp.handoffStartedAt || 0;
      disposeSpPlayerInstance(sp);
      sp = createSpPlayerInstance(appId, effectiveMime, newMsId, false, sourceType);
      sp.desiredMuted = prevMuted;
      sp.desiredVolume = typeof prevVol === 'number' && Number.isFinite(prevVol) ? prevVol : getSavedMediaVolumeState(appId).volume;
      if (typeof prevLastNonZero === 'number' && prevLastNonZero > 0.001) {
        sp.lastNonZeroVolume = prevLastNonZero;
      }
      if (preserveSidebarHandoff) {
        sp.awaitingBgFrameHandoff = true;
        sp.handoffSource = 'sidebar';
        sp.handoffStartedAt = prevHandoffStartedAt || Date.now();
      }
      bg.bgSpEmePlayers.set(appId, sp);
      return initSpPlayerInstance(sp);
    }
    return initSpPlayerInstance(sp);
  }

  function ensureStagingSpEmePlayer(appId, mime = 'audio/mp4; codecs="mp4a.40.2"', newMsId = 0, sourceType = 'bg') {
    let st = bg.bgStagingSpPlayers.get(appId);
    const effectiveMime = mime || 'audio/mp4; codecs="mp4a.40.2"';
    const hasRecentPlayIntent = Boolean(
      sourceType === 'sidebar' &&
        bg.state.lastSidebarPlayIntentAt &&
        Date.now() - bg.state.lastSidebarPlayIntentAt < 10000
    );
    if (st && !st.disposed && st.sourceType && st.sourceType !== sourceType) {
      disposeSpPlayerInstance(st);
      bg.bgStagingSpPlayers.delete(appId);
      st = null;
    }
    if (!st || st.disposed) {
      st = createSpPlayerInstance(appId, effectiveMime, newMsId, true, sourceType);
      if (hasRecentPlayIntent) {
        st.explicitSidebarPlayIntent = true;
        st.explicitSidebarPlayIntentAt = bg.state.lastSidebarPlayIntentAt;
      }
      bg.bgStagingSpPlayers.set(appId, st);
      return initSpPlayerInstance(st);
    }
    st.sourceType = sourceType;
    if (hasRecentPlayIntent && !st.explicitSidebarPlayIntent) {
      st.explicitSidebarPlayIntent = true;
      st.explicitSidebarPlayIntentAt = bg.state.lastSidebarPlayIntentAt;
    }
    if (newMsId && !st.msId) {
      st.msId = newMsId;
    } else if (newMsId && st.msId && newMsId !== st.msId) {
      disposeSpPlayerInstance(st);
      st = createSpPlayerInstance(appId, effectiveMime, newMsId, true, sourceType);
      if (hasRecentPlayIntent) {
        st.explicitSidebarPlayIntent = true;
        st.explicitSidebarPlayIntentAt = bg.state.lastSidebarPlayIntentAt;
      }
      bg.bgStagingSpPlayers.set(appId, st);
      return initSpPlayerInstance(st);
    }
    return initSpPlayerInstance(st);
  }

  function shouldRouteBgToStaging(appId) {
    const activeSp = bg.bgSpEmePlayers.get(appId);
    if (!activeSp || activeSp.disposed || !activeSp.awaitingBgFrameHandoff) return false;
    if (!activeSp.videoEl || activeSp.videoEl.ended) return false;
    return getSpBufferedEnd(activeSp) > 0;
  }

  function abortSidebarSpTakeover(appId) {
    if (!appId) return;
    const stagingSp = bg.bgStagingSpPlayers.get(appId);
    if (stagingSp && stagingSp.sourceType === 'sidebar') {
      bg.bgStagingSpPlayers.delete(appId);
      disposeSpPlayerInstance(stagingSp);
    }
    const activeSp = bg.bgSpEmePlayers.get(appId);
    if (activeSp && !activeSp.disposed) {
      activeSp.awaitingBgFrameHandoff = false;
      activeSp.handoffSource = 'bg';
      activeSp.handoffStartedAt = 0;
      activeSp.reloadingSidebarFrameAt = 0;
      if (!activeSp.explicitUserPause && !isTabPausedEnforced()) {
        activeSp.remotePaused = false;
        const savedVol = getSavedMediaVolumeState(appId);
        if (typeof activeSp.desiredVolume !== 'number' || !Number.isFinite(activeSp.desiredVolume)) {
          activeSp.desiredVolume = savedVol.volume;
        }
        if (activeSp.videoEl) {
          activeSp.videoEl.muted = Boolean(activeSp.desiredMuted);
          activeSp.videoEl.volume = activeSp.desiredVolume;
          activeSp.videoEl.playbackRate = 1.0;
        }
        syncSpInstanceTimeAndPlay(activeSp, false);
        if (bg.bgAudioPool.has(appId)) {
          const needResume = Boolean(activeSp.videoEl && activeSp.videoEl.paused);
          const bgEntry = bg.bgAudioPool.get(appId);
          const bgPort = bg.emeBridgePorts.get(`bg:${appId}`);
          if (appId === 'spotify') {
            const reclaimCmd = {
              cmd: 'ACTIVATE_BG_SPOTIFY_HANDOFF',
              resumeUrl: (bgEntry && bgEntry.url) || 'https://open.spotify.com/',
              trackTitle: activeSp.trackTitle || (bgEntry && bgEntry.title) || '',
              targetSec: activeSp.videoEl ? Number(activeSp.videoEl.currentTime) || 0 : 0
            };
            if (bgPort) {
              try {
                bgPort.postMessage(reclaimCmd);
              } catch (_) {}
            }
            if (bgEntry && bgEntry.frame && bgEntry.frame.contentWindow) {
              try {
                bgEntry.frame.contentWindow.postMessage(
                  { target: 'pocketmail-media-frame', ...reclaimCmd },
                  '*'
                );
              } catch (_) {}
            }
          }
          if (needResume) {
            if (bgPort) {
              try {
                bgPort.postMessage({ cmd: 'RESUME_BG_SP_MEDIA' });
              } catch (_) {}
            }
            if (bgEntry && bgEntry.frame && bgEntry.frame.contentWindow) {
              try {
                bgEntry.frame.contentWindow.postMessage(
                  { target: 'pocketmail-media-frame', cmd: 'RESUME_BG_SP_MEDIA' },
                  '*'
                );
              } catch (_) {}
            }
          }
        }
      }
    }
    logAudioDiag('abort-sidebar-takeover', {
      appId,
      bgPoolAlive: bg.bgAudioPool.has(appId),
      hasActiveSp: Boolean(activeSp && !activeSp.disposed)
    });
    refreshBgAudioIndicator(true);
  }

  function activateSidebarSpTakeover(appId) {
    if (bg.bgAudioPool.has(appId)) {
      removeBgAudioIframeOnly(appId);
    }
    const st = bg.bgStagingSpPlayers.get(appId);
    if (st) {
      disposeSpPlayerInstance(st);
      bg.bgStagingSpPlayers.delete(appId);
    }
    const activeSp = bg.bgSpEmePlayers.get(appId);
    if (activeSp && !activeSp.disposed) {
      activeSp.awaitingBgFrameHandoff = false;
      activeSp.sourceType = 'sidebar';
      activeSp.remotePaused = false;
    }
  }

  function handleSpEmeBridgeMessage(appId, data, sourceType = 'bg') {
    if (!appId || !data) return;
    const bt = data.bridgeType;
    const s = bg.state.currentSettings;

    if (bt === 'BRIDGE_HELLO') {
      if (sourceType === 'standby') return;
      const helloStaging = bg.bgStagingSpPlayers.get(appId);
      if (helloStaging && helloStaging.sourceType === sourceType) {
        helloStaging.lastSeekSentAt = 0;
      }
      const curAuthSp = bg.bgSpEmePlayers.get(appId);
      const savedVol = getSavedMediaVolumeState(appId);
      const authVol =
        curAuthSp && !curAuthSp.disposed && typeof curAuthSp.desiredVolume === 'number'
          ? curAuthSp.desiredVolume
          : savedVol.volume;
      const authMuted =
        curAuthSp && !curAuthSp.disposed ? Boolean(curAuthSp.desiredMuted) : savedVol.muted;
      pushAuthoritativeVolumeToFrame(appId, sourceType, authVol, authMuted);
      if (isTabPausedEnforced()) {
        const stayStopped = getBehavior() === 'pause-only';
        const pauseCmd = stayStopped ? 'PAUSE_LOCAL_MEDIA' : 'TAB_AUDIO_AUTO_PAUSE';
        const directPort = bg.emeBridgePorts.get(`${sourceType}:${appId}`);
        if (directPort) {
          try {
            directPort.postMessage({ cmd: pauseCmd, markShouldResume: !stayStopped });
          } catch (_) {}
        }
        const bgEntryForPause = bg.bgAudioPool.get(appId);
        const bgFrameForPause = bgEntryForPause && (bgEntryForPause.frame || bgEntryForPause.iframe);
        if (bgFrameForPause && bgFrameForPause.contentWindow) {
          try {
            bgFrameForPause.contentWindow.postMessage(
              { target: 'pocketmail-media-frame', cmd: pauseCmd, markShouldResume: !stayStopped },
              '*'
            );
          } catch (_) {}
        }
      }
      return;
    }

    if (bt === 'SEEK_ACK') {
      const ackSt = bg.bgStagingSpPlayers.get(appId);
      if (ackSt && ackSt.sourceType === sourceType) {
        if (data.executed) {
          ackSt.seekConfirmedCount = (ackSt.seekConfirmedCount || 0) + 1;
        } else {
          ackSt.lastSeekSentAt = Math.min(ackSt.lastSeekSentAt || 0, Date.now() - 550);
          if (ackSt.seekAttempts > 0) ackSt.seekAttempts = Math.max(0, ackSt.seekAttempts - 1);
        }
      }
      return;
    }

    if (bt === 'USER_INTERACTION') {
      if (data.isSeekBar) {
        const sp = bg.bgSpEmePlayers.get(appId);
        if (sp) {
          sp.isExplicitUserScrub = true;
          sp.explicitUserScrubUntil = Date.now() + 3000;
        }
        const st = bg.bgStagingSpPlayers.get(appId);
        if (st) {
          st.isExplicitUserScrub = true;
          st.explicitUserScrubUntil = Date.now() + 3000;
        }
      }
      if (sourceType === 'sidebar' && bg.bgAudioPool.has(appId)) {
        const bgPort = bg.emeBridgePorts.get(`bg:${appId}`);
        if (bgPort) {
          try {
            bgPort.postMessage({ cmd: 'MARK_USER_GESTURE', isSeekBar: Boolean(data.isSeekBar) });
          } catch (_) {}
        }
        const bgEntry = bg.bgAudioPool.get(appId);
        if (bgEntry && bgEntry.frame && bgEntry.frame.contentWindow) {
          try {
            bgEntry.frame.contentWindow.postMessage(
              { target: 'pocketmail-media-frame', cmd: 'MARK_USER_GESTURE', isSeekBar: Boolean(data.isSeekBar) },
              '*'
            );
          } catch (_) {}
        }
      }
      return;
    }

    if (bt === 'STOP_PLAYBACK') {
      const curActiveSp = bg.bgSpEmePlayers.get(appId);
      if (
        sourceType === 'sidebar' &&
        (bg.bgAudioPool.has(appId) || (curActiveSp && !curActiveSp.disposed && curActiveSp.awaitingBgFrameHandoff)) &&
        !data.explicitStop
      ) {
        const isNonPlayableYt = appId === 'youtube' && data.href && !isPlayableYouTubeUrl(data.href);
        if (!isNonPlayableYt) return;
      }
      if (bg.bgAudioPool.has(appId)) {
        removeBgAudioIframeOnly(appId);
      }
      logAudioDiag('stop-playback', {
        appId,
        sourceType,
        explicitStop: Boolean(data.explicitStop),
        href: data.href || ''
      });
      const stagingSp = bg.bgStagingSpPlayers.get(appId);
      if (stagingSp) {
        disposeSpPlayerInstance(stagingSp);
        bg.bgStagingSpPlayers.delete(appId);
      }
      const activeSp = bg.bgSpEmePlayers.get(appId);
      if (activeSp && !activeSp.disposed) {
        activeSp.awaitingBgFrameHandoff = false;
        activeSp.remotePaused = true;
        activeSp.explicitUserPause = true;
        if (activeSp.videoEl && !activeSp.videoEl.paused) {
          try {
            activeSp.lastPauseTrigger = 'user-stop-playback';
            activeSp.videoEl.pause();
          } catch (_) {}
        }
      }
      const prevSt = bg.liveMediaPlaybackState.get(appId);
      if (prevSt) {
        prevSt.isPlaying = false;
        prevSt.handedOffAt = undefined;
        if (data.href && !data.href.includes('pm_boot=1')) {
          prevSt.resumeUrl = data.href;
        }
        prevSt.updatedAt = Date.now();
      }
      if (
        data.href &&
        !data.href.includes('pm_boot=1') &&
        (bg.isAppAllowedForPersistence(appId) || bg.isAppAllowedForBgAudio(appId))
      ) {
        if (!s.persistentSavedAppUrls) s.persistentSavedAppUrls = {};
        s.persistentSavedAppUrls[appId] = data.href;
      }
      refreshBgAudioIndicator();
      return;
    }

    if (bt === 'USER_PLAY_INTENT') {
      if (bg.tabAudio.isAutoPausedByTabAudio || bg.tabAudio.knownActiveMediaTabIds.size > 0) {
        bg.tabAudio.manualOverrideWhileTabAudible = true;
        bg.tabAudio.audibleOverrideTabIds.clear();
        bg.tabAudio.knownActiveMediaTabIds.forEach((tid) => bg.tabAudio.audibleOverrideTabIds.add(tid));
        if (browser.tabs && typeof browser.tabs.query === 'function') {
          browser.tabs
            .query({ audible: true })
            .then((tabs) => {
              (tabs || []).forEach((t) => {
                if (t && typeof t.id === 'number' && t.audible && bg.isExternalBrowserTab(t)) {
                  bg.tabAudio.audibleOverrideTabIds.add(t.id);
                }
              });
            })
            .catch(() => {});
        }
        if (bg.tabAudio.isAutoPausedByTabAudio && typeof bg.setTabAudioPauseTrigger === 'function') {
          bg.setTabAudioPauseTrigger(false, false);
          browser.runtime
            .sendMessage({
              type: 'PM_TAB_AUDIO_AUTO_PAUSE_STATE',
              autoPaused: false
            })
            .catch(() => {});
        }
        logAudioDiag('tab-manual-override', {
          appId,
          sourceType,
          overriddenTabs: Array.from(bg.tabAudio.audibleOverrideTabIds)
        });
      }
      bg.tabAudio.tabAutoPausedSpAppIds.delete(appId);
      if (sourceType === 'sidebar') {
        bg.state.lastSidebarPlayIntentAt = Date.now();
      }
      const curStaging = bg.bgStagingSpPlayers.get(appId);
      if (curStaging && !curStaging.disposed) {
        if (sourceType === 'sidebar') {
          curStaging.explicitSidebarPlayIntent = true;
          curStaging.explicitSidebarPlayIntentAt = Date.now();
        }
        if (getSpBufferedEnd(curStaging) > 0) {
          const activeSpBefore = bg.bgSpEmePlayers.get(appId);
          const isDiffTrack = Boolean(
            activeSpBefore && isDifferentSpTrackTitle(curStaging.trackTitle, activeSpBefore.trackTitle)
          );
          const activeLiveCt =
            !isDiffTrack && activeSpBefore && !activeSpBefore.disposed && activeSpBefore.videoEl
              ? Math.max(Number(activeSpBefore.videoEl.currentTime) || 0, curStaging.minContinueCt || 0)
              : curStaging.minContinueCt || 0;
          const canDirectPromote = Boolean(
            (curStaging.hasLicense || curStaging.isClear) &&
              (isDiffTrack ||
                activeLiveCt <= 0.8 ||
                isTimeInSpBuffered(curStaging, activeLiveCt) ||
                !isSpActivelyPlayingCurrentTrack(activeSpBefore))
          );
          if (canDirectPromote) {
            promoteStagingSpPlayer(appId, true);
          } else {
            if (!isDiffTrack && activeLiveCt > (curStaging.minContinueCt || 0)) {
              curStaging.minContinueCt = activeLiveCt;
              curStaging.targetTime = activeLiveCt;
            }
            checkAndPromoteStagingSpPlayer(appId);
          }
        }
      }
      let deferredBgRetire = false;
      if (sourceType === 'sidebar' && bg.bgAudioPool.has(appId)) {
        const spIntent = bg.bgSpEmePlayers.get(appId);
        if (appId !== 'spotify' || !spIntent || spIntent.disposed || !isSpActivelyPlayingCurrentTrack(spIntent)) {
          removeBgAudioIframeOnly(appId);
        } else {
          deferredBgRetire = true;
          spIntent.awaitingBgFrameHandoff = true;
          spIntent.handoffSource = 'sidebar';
          spIntent.handoffStartedAt = Date.now();
          spIntent.retireBgWhenBuffered = false;
          ensureStagingSpEmePlayer(appId, spIntent.mime || 'audio/mp4; codecs="mp4a.40.2"', 0, 'sidebar');
          const stReady = bg.bgStagingSpPlayers.get(appId);
          if (stReady) {
            stReady.explicitSidebarPlayIntent = true;
            stReady.explicitSidebarPlayIntentAt = Date.now();
            const curCt = Math.max(Number(spIntent.videoEl?.currentTime) || 0, spIntent.minContinueCt || 0);
            if (curCt > (stReady.minContinueCt || 0)) stReady.minContinueCt = curCt;
          }
        }
      } else if (appId === 'spotify' && bg.bgAudioPool.has('spotify')) {
        const bgPort = bg.emeBridgePorts.get('bg:spotify');
        if (bgPort) {
          try {
            bgPort.postMessage({ cmd: 'RESUME_BG_SP_MEDIA' });
          } catch (_) {}
        }
        const bgEntry = bg.bgAudioPool.get('spotify');
        if (bgEntry && bgEntry.frame && bgEntry.frame.contentWindow) {
          try {
            bgEntry.frame.contentWindow.postMessage(
              { target: 'pocketmail-media-frame', cmd: 'RESUME_BG_SP_MEDIA' },
              '*'
            );
          } catch (_) {}
        }
      }
      const activeSp = bg.bgSpEmePlayers.get(appId);
      if (activeSp && !activeSp.disposed) {
        if (sourceType === 'sidebar') {
          activeSp.explicitSidebarPlayIntent = true;
          activeSp.explicitSidebarPlayIntentAt = Date.now();
        }
        if (!deferredBgRetire) {
          activeSp.awaitingBgFrameHandoff = false;
        }
        activeSp.autoPausedByTab = false;
        activeSp.remotePaused = false;
        activeSp.explicitUserPause = false;
        activeSp.pausedByCommandAt = 0;
        activeSp.lastPlayedAt = Date.now();
        if (!deferredBgRetire) {
          syncSpInstanceTimeAndPlay(activeSp);
        }
      }
      logAudioDiag('user-play-intent', { appId, sourceType });
      refreshBgAudioIndicator();
      return;
    }

    if (sourceType === 'sidebar') {
      if (bt === 'MSE_INIT') {
        bg.sidebarHasAppendedSpChunks.set(appId, false);
      } else if (bt === 'MSE_CHUNK') {
        bg.sidebarHasAppendedSpChunks.set(appId, true);
      }
    }

    const shouldTransitionBgToSidebar =
      sourceType === 'sidebar' &&
      bg.bgAudioPool.has(appId) &&
      (bt === 'MSE_INIT' || bt === 'GEN_REQ' || bt === 'MSE_CHUNK' || (bt === 'SYNC_TIME' && !data.paused));
    if (shouldTransitionBgToSidebar) {
      const activeSp = bg.bgSpEmePlayers.get(appId);
      if (activeSp && !activeSp.disposed) {
        const isEnteringSidebarHandoff = !activeSp.awaitingBgFrameHandoff || activeSp.handoffSource !== 'sidebar';
        activeSp.awaitingBgFrameHandoff = true;
        if (isEnteringSidebarHandoff || !activeSp.handoffStartedAt) {
          activeSp.handoffStartedAt = Date.now();
        }
        activeSp.handoffSource = 'sidebar';
        if (!isTabPausedEnforced()) {
          activeSp.remotePaused = false;
        }
        if (appId !== 'spotify') {
          activeSp.retireBgWhenBuffered = false;
          clearTimeout(activeSp.retireBgTimer);
          removeBgAudioIframeOnly(appId);
        } else {
          activeSp.retireBgWhenBuffered = false;
          clearTimeout(activeSp.retireBgTimer);
        }
      } else {
        removeBgAudioIframeOnly(appId);
      }
    }

    if (bt === 'SERVER_CERT') {
      const certBuf = toLocalArrayBuffer(data.cert);
      if (!certBuf) return;
      const prev = bg.bgSpCachedMeta.get(appId) || {};
      bg.bgSpCachedMeta.set(appId, { ...prev, serverCert: certBuf });
      prewarmNextSpMediaKeys('audio/mp4; codecs="mp4a.40.2"', certBuf);
      [bg.bgSpEmePlayers.get(appId), bg.bgStagingSpPlayers.get(appId), bg.bgNextSpPlayers.get(appId)].forEach((inst) => {
        if (inst && !inst.disposed) {
          inst.serverCert = certBuf;
          if (inst.mk) inst.mk.setServerCertificate(certBuf).catch(() => {});
        }
      });
      return;
    }

    if (bt === 'LIC_AUTH') {
      const licAuth = cloneLocalLicAuth(data.url, data.headers);
      if (!licAuth) return;
      const prev = bg.bgSpCachedMeta.get(appId) || {};
      bg.bgSpCachedMeta.set(appId, { ...prev, licAuth });
      [bg.bgSpEmePlayers.get(appId), bg.bgStagingSpPlayers.get(appId), bg.bgNextSpPlayers.get(appId)].forEach((inst) => {
        if (inst && !inst.disposed) {
          inst.licAuth = licAuth;
          processSpInstanceGenReqs(inst);
        }
      });
      return;
    }

    const routeActiveSp = bg.bgSpEmePlayers.get(appId);
    let routeStagingSp = bg.bgStagingSpPlayers.get(appId);
    const hasActiveSidebarReload = Boolean(
      !bg.bgAudioPool.has(appId) &&
        routeActiveSp &&
        !routeActiveSp.disposed &&
        routeActiveSp.reloadingSidebarFrameAt &&
        Date.now() - routeActiveSp.reloadingSidebarFrameAt < 25000
    );
    // Auto-expire stalled sidebar handoffs (>15s without buffered sidebar audio) so bg never starves on track change
    if (
      !hasActiveSidebarReload &&
      routeActiveSp &&
      !routeActiveSp.disposed &&
      routeActiveSp.awaitingBgFrameHandoff &&
      routeActiveSp.handoffSource === 'sidebar' &&
      routeActiveSp.handoffStartedAt > 0 &&
      Date.now() - routeActiveSp.handoffStartedAt > 15000 &&
      (!routeStagingSp || routeStagingSp.disposed || getSpBufferedEnd(routeStagingSp) <= 0)
    ) {
      abortSidebarSpTakeover(appId);
      routeStagingSp = bg.bgStagingSpPlayers.get(appId);
    }
    if (
      sourceType === 'sidebar' &&
      bg.bgAudioPool.has(appId) &&
      !(routeActiveSp && routeActiveSp.awaitingBgFrameHandoff && routeActiveSp.handoffSource === 'sidebar')
    ) {
      return;
    }
    if (
      routeActiveSp &&
      !routeActiveSp.disposed &&
      routeActiveSp.awaitingBgFrameHandoff &&
      routeActiveSp.handoffSource &&
      sourceType !== routeActiveSp.handoffSource
    ) {
      // Only suppress non-handoff-source streams when the closing sidebar is handing off to bg ('bg').
      // When waiting for a sidebar takeover ('sidebar'), the live bg iframe MUST keep streaming
      // MSE_INIT, GEN_REQ, and next-track MSE_CHUNK so playback never goes silent across track
      // transitions or while Spotify Connect is still in remote-control mode.
      if (routeActiveSp.handoffSource !== 'sidebar') {
        if (bt === 'MSE_INIT' || bt === 'GEN_REQ') return;
        if (data.msId && routeActiveSp.msId && data.msId !== routeActiveSp.msId) return;
      }
    }
    const isSidebarReload = Boolean(
      sourceType === 'sidebar' &&
        !bg.bgAudioPool.has(appId) &&
        routeActiveSp &&
        !routeActiveSp.disposed &&
        routeActiveSp.reloadingSidebarFrameAt &&
        Date.now() - routeActiveSp.reloadingSidebarFrameAt < 25000
    );
    const handoffSrc =
      (routeActiveSp && !routeActiveSp.disposed && routeActiveSp.awaitingBgFrameHandoff && routeActiveSp.handoffSource) ||
      (routeStagingSp && routeStagingSp.sourceType) ||
      'bg';
    const useStaging =
      (sourceType === handoffSrc && (shouldRouteBgToStaging(appId) || Boolean(routeStagingSp))) ||
      (isSidebarReload && (!data.msId || !routeActiveSp.msId || data.msId !== routeActiveSp.msId));

    if (bt === 'MSE_INIT') {
      if (useStaging) {
        ensureStagingSpEmePlayer(appId, data.mime, data.msId, sourceType);
        const st = bg.bgStagingSpPlayers.get(appId);
        if (routeActiveSp && routeActiveSp.isClear && routeActiveSp.videoEl && st && !st.lastSeekSentAt) {
          const liveCt = Number(routeActiveSp.videoEl.currentTime) || 0;
          const href = String(data.href || '');
          if (liveCt > 0.5 && (href.includes('/shorts/') || !href.includes('t='))) {
            st.lastSeekSentAt = Date.now();
            postSpSeekToSource(appId, sourceType, liveCt);
          }
        }
      } else {
        ensureBgSpEmePlayer(appId, data.mime, data.msId, sourceType);
      }
      return;
    }

    if (bt === 'GEN_REQ') {
      const initBuf = toLocalArrayBuffer(data.initData);
      if (!initBuf) return;
      recordRecentSpGenReq(appId, data.initDataType, initBuf);
      if (useStaging) {
        ensureStagingSpEmePlayer(appId, 'audio/mp4; codecs="mp4a.40.2"', 0, sourceType);
        const st = bg.bgStagingSpPlayers.get(appId);
        if (st) {
          st.pendingGenReqs.push({ initDataType: data.initDataType, initData: initBuf });
          processSpInstanceGenReqs(st);
        }
      } else {
        ensureBgSpEmePlayer(appId, 'audio/mp4; codecs="mp4a.40.2"', 0, sourceType);
        const sp = bg.bgSpEmePlayers.get(appId);
        if (sp) {
          sp.pendingGenReqs.push({ initDataType: data.initDataType, initData: initBuf });
          processSpInstanceGenReqs(sp);
        }
        const nx = bg.bgNextSpPlayers.get(appId);
        if (nx && !nx.disposed) {
          nx.pendingGenReqs.push({ initDataType: data.initDataType, initData: initBuf });
          processSpInstanceGenReqs(nx);
        }
      }
      return;
    }

    if (bt === 'MSE_CHUNK') {
      const chunkBuf = toLocalArrayBuffer(data.chunk);
      if (!chunkBuf) return;
      if (useStaging) {
        const curSt = bg.bgStagingSpPlayers.get(appId);
        if (curSt && curSt.sourceType === sourceType && data.msId && curSt.msId && data.msId < curSt.msId) return;
        ensureStagingSpEmePlayer(appId, data.mime, data.msId, sourceType);
        const st = bg.bgStagingSpPlayers.get(appId);
        if (st) {
          st.queue.push({ type: 'append', chunk: chunkBuf, timestampOffset: data.timestampOffset });
          drainSpInstanceQueue(st);
        }
      } else {
        const curSp = bg.bgSpEmePlayers.get(appId);
        const existingNx = appId === 'spotify' ? bg.bgNextSpPlayers.get(appId) : null;
        if (existingNx && !existingNx.disposed && data.msId && existingNx.msId === data.msId) {
          existingNx.sourceType = sourceType;
          existingNx.queue.push({ type: 'append', chunk: chunkBuf, timestampOffset: data.timestampOffset });
          drainSpInstanceQueue(existingNx);
          const curFinishedOrNearEnd =
            !curSp ||
            curSp.disposed ||
            !curSp.videoEl ||
            curSp.videoEl.ended ||
            (getSpBufferedEnd(curSp) > 2 &&
              (Number(curSp.videoEl.currentTime) || 0) >= getSpBufferedEnd(curSp) - 0.12);
          if (
            curFinishedOrNearEnd &&
            existingNx.hasLicense &&
            existingNx.sb &&
            existingNx.sb.buffered &&
            existingNx.sb.buffered.length > 0
          ) {
            promoteNextSpPlayer(appId, 0);
          }
          return;
        }
        if (
          appId === 'spotify' &&
          curSp &&
          !curSp.disposed &&
          data.msId &&
          curSp.msId &&
          data.msId !== curSp.msId &&
          isSpActivelyPlayingCurrentTrack(curSp)
        ) {
          const sameOrigin = (curSp.originSource || curSp.sourceType) === sourceType;
          if (sameOrigin && data.msId < curSp.msId) return;
          ensureNextSpEmePlayer(appId, data.mime, data.msId, sourceType);
          const nx = bg.bgNextSpPlayers.get(appId);
          if (nx) {
            nx.queue.push({ type: 'append', chunk: chunkBuf, timestampOffset: data.timestampOffset });
            drainSpInstanceQueue(nx);
          }
          return;
        }
        const sameCurOrigin = curSp && (curSp.originSource || curSp.sourceType) === sourceType;
        if (sameCurOrigin && data.msId && curSp.msId && data.msId < curSp.msId) return;
        ensureBgSpEmePlayer(appId, data.mime, data.msId, sourceType);
        const sp = bg.bgSpEmePlayers.get(appId);
        if (sp) {
          sp.queue.push({ type: 'append', chunk: chunkBuf, timestampOffset: data.timestampOffset });
          drainSpInstanceQueue(sp);
        }
      }
      return;
    }

    if (bt === 'MSE_REMOVE') {
      const curNx = !useStaging && data.msId ? bg.bgNextSpPlayers.get(appId) : null;
      const target = useStaging
        ? bg.bgStagingSpPlayers.get(appId)
        : curNx && curNx.msId === data.msId
          ? curNx
          : bg.bgSpEmePlayers.get(appId);
      const sameRemOrigin = target && (target.originSource || target.sourceType) === sourceType;
      if (!target || (sameRemOrigin && data.msId && target.msId && data.msId < target.msId)) return;
      target.queue.push({ type: 'remove', start: data.start, end: data.end });
      drainSpInstanceQueue(target);
      return;
    }

    if (bt === 'MSE_ABORT') {
      const curNx = !useStaging && data.msId ? bg.bgNextSpPlayers.get(appId) : null;
      const target = useStaging
        ? bg.bgStagingSpPlayers.get(appId)
        : curNx && curNx.msId === data.msId
          ? curNx
          : bg.bgSpEmePlayers.get(appId);
      const sameAbortOrigin = target && (target.originSource || target.sourceType) === sourceType;
      if (!target || (sameAbortOrigin && data.msId && target.msId && data.msId < target.msId)) return;
      target.queue.push({ type: 'abort' });
      drainSpInstanceQueue(target);
      return;
    }

    if (bt === 'VOLUME') {
      const target = useStaging ? bg.bgStagingSpPlayers.get(appId) : bg.bgSpEmePlayers.get(appId);
      if (sourceType === 'bg' || sourceType === 'standby') {
        if (sourceType === 'bg') {
          const savedVol = getSavedMediaVolumeState(appId);
          const authVol =
            target && !target.disposed && typeof target.desiredVolume === 'number'
              ? target.desiredVolume
              : savedVol.volume;
          const authMuted =
            target && !target.disposed ? Boolean(target.desiredMuted) : savedVol.muted;
          pushAuthoritativeVolumeToFrame(appId, 'bg', authVol, authMuted);
        }
        return;
      }
      if (sourceType === 'sidebar' && data.userInitiated !== true) {
        const savedVol = getSavedMediaVolumeState(appId);
        const authVol =
          target && !target.disposed && typeof target.desiredVolume === 'number'
            ? target.desiredVolume
            : savedVol.volume;
        const authMuted =
          target && !target.disposed ? Boolean(target.desiredMuted) : savedVol.muted;
        pushAuthoritativeVolumeToFrame(appId, 'sidebar', authVol, authMuted);
        return;
      }
      const prevSaved = getSavedMediaVolumeState(appId);
      const nextVol =
        typeof data.volume === 'number' && Number.isFinite(data.volume)
          ? Math.round(Math.min(1, Math.max(0, data.volume)) * 100) / 100
          : target && typeof target.desiredVolume === 'number'
            ? target.desiredVolume
            : prevSaved.volume;
      const nextMuted =
        typeof data.muted === 'boolean'
          ? data.muted
          : target
            ? Boolean(target.desiredMuted)
            : prevSaved.muted;
      const persisted = persistMediaVolumeState(appId, nextVol, nextMuted);
      if (typeof bg.scheduleSettingsSave === 'function') {
        bg.scheduleSettingsSave(true);
      }
      [bg.bgSpEmePlayers.get(appId), bg.bgStagingSpPlayers.get(appId), bg.bgNextSpPlayers.get(appId)].forEach((inst) => {
        if (!inst || inst.disposed) return;
        inst.desiredVolume = persisted.volume;
        inst.desiredMuted = persisted.muted;
        inst.lastNonZeroVolume = persisted.lastNonZeroVolume;
        if (!inst.isStaging && !inst.isNextPreload && inst.videoEl) {
          inst.videoEl.muted = isTabPausedEnforced() ? true : inst.desiredMuted;
          inst.videoEl.volume = inst.desiredVolume;
        }
      });
      const prevVolSt = bg.liveMediaPlaybackState.get(appId);
      if (prevVolSt) {
        bg.liveMediaPlaybackState.set(
          appId,
          normalizePlaybackMeta(
            appId,
            { volume: persisted.volume, muted: persisted.muted, lastNonZeroVolume: persisted.lastNonZeroVolume },
            prevVolSt
          )
        );
      }
      refreshBgAudioIndicator(true, appId);
      return;
    }

    if (bt === 'SYNC_TIME') {
      if (appId === 'youtube' && data.href && !isPlayableYouTubeUrl(data.href)) {
        data.paused = true;
        data.explicitPause = true;
      }
      if (useStaging) {
        const st = bg.bgStagingSpPlayers.get(appId);
        if (!st) return;
        st.targetTime = Number(data.currentTime) || 0;
        if (Number(data.duration) > 0) st.trackDuration = Number(data.duration);
        if (data.trackTitle) {
          if (st.trackTitle && st.trackTitle !== String(data.trackTitle)) {
            st.maxObservedCt = 0;
          }
          st.trackTitle = String(data.trackTitle);
        }
        if (data.isExplicitUserScrub) {
          st.isExplicitUserScrub = true;
          st.explicitUserScrubUntil = Date.now() + 3000;
        }
        if (isTabPausedEnforced() && !data.paused) {
          const stayStopped = getBehavior() === 'pause-only';
          st.remotePaused = true;
          st.autoPausedByTab = !stayStopped;
          if (!stayStopped) bg.tabAudio.tabAutoPausedSpAppIds.add(appId);
          if (st.videoEl) {
            st.videoEl.muted = true;
            if (!st.videoEl.paused) {
              try {
                st.videoEl.pause();
              } catch (_) {}
            }
          }
          const pauseCmd = stayStopped ? 'PAUSE_LOCAL_MEDIA' : 'TAB_AUDIO_AUTO_PAUSE';
          const directPort = bg.emeBridgePorts.get(`${sourceType}:${appId}`);
          if (directPort) {
            try {
              directPort.postMessage({ cmd: pauseCmd, markShouldResume: !stayStopped });
            } catch (_) {}
          }
          const bgEntryForPause = bg.bgAudioPool.get(appId);
          const bgFrameForPause = bgEntryForPause && (bgEntryForPause.frame || bgEntryForPause.iframe);
          if (bgFrameForPause && bgFrameForPause.contentWindow) {
            try {
              bgFrameForPause.contentWindow.postMessage(
                { target: 'pocketmail-media-frame', cmd: pauseCmd, markShouldResume: !stayStopped },
                '*'
              );
            } catch (_) {}
          }
          return;
        }
        if (!data.fromSeek || !data.paused) {
          st.remotePaused = Boolean(data.paused);
        }
        if (!data.paused) {
          st.lastPlayedAt = Date.now();
          checkAndPromoteStagingSpPlayer(appId);
        }
        return;
      }

      const readyNextSp = bg.bgNextSpPlayers.get(appId);
      const curSpForNext = bg.bgSpEmePlayers.get(appId);
      const nextMatchesByMsId = Boolean(data.msId && readyNextSp && readyNextSp.msId === data.msId);
      const nextMatchesByTrackAdvance = Boolean(
        readyNextSp &&
          readyNextSp.sourceType === sourceType &&
          curSpForNext &&
          !curSpForNext.disposed &&
          isDifferentSpTrackTitle(data.trackTitle, curSpForNext.trackTitle) &&
          Number(data.currentTime) < 15 &&
          (!curSpForNext.videoEl ||
            curSpForNext.videoEl.ended ||
            getSpBufferedEnd(curSpForNext) - (Number(curSpForNext.videoEl.currentTime) || 0) < 1.5)
      );
      if (
        !data.paused &&
        readyNextSp &&
        !readyNextSp.disposed &&
        (nextMatchesByMsId || nextMatchesByTrackAdvance)
      ) {
        if (Number(data.duration) > 0) readyNextSp.trackDuration = Number(data.duration);
        if (data.trackTitle) readyNextSp.trackTitle = String(data.trackTitle);
        promoteNextSpPlayer(appId, Number(data.currentTime) || 0);
      }

      const sp = bg.bgSpEmePlayers.get(appId);
      if (!sp) return;
      if (Number(data.duration) > 0) sp.trackDuration = Number(data.duration);
      if (data.trackTitle) {
        if (sp.trackTitle && sp.trackTitle !== String(data.trackTitle)) {
          sp.maxObservedCt = 0;
        }
        sp.trackTitle = String(data.trackTitle);
      }
      const isExplicitUserScrub = Boolean(data.isExplicitUserScrub);
      if (isExplicitUserScrub) {
        sp.isExplicitUserScrub = true;
        sp.explicitUserScrubUntil = Date.now() + 3000;
      }
      const effectiveForceSeek = Boolean(data.forceSeek && !data.isInternalHandoff);
      if (sourceType === 'sidebar' && sp.sourceType === 'bg' && data.paused && !data.explicitPause) {
        return;
      }
      if (
        sourceType === 'sidebar' &&
        data.paused &&
        !data.explicitPause &&
        (bg.state.sidebarPortCount + bg.state.popupPortCount === 0 || sp.awaitingBgFrameHandoff)
      ) {
        return;
      }
      if (data.fromSeek && data.paused) {
        if (effectiveForceSeek) {
          sp.targetTime = Number(data.currentTime) || 0;
          if (sp.videoEl) {
            if (!sp.videoEl.paused) {
              syncSpInstanceTimeAndPlay(sp, true, isExplicitUserScrub);
            } else if (isTimeInSpBuffered(sp, sp.targetTime)) {
              try {
                sp.videoEl.currentTime = sp.targetTime;
              } catch (_) {}
            }
          }
        } else if (!sp.videoEl || sp.videoEl.paused) {
          sp.targetTime = Number(data.currentTime) || 0;
        }
        return;
      }
      const curTime = sp.videoEl ? sp.videoEl.currentTime || 0 : 0;
      const bufEnd = getSpBufferedEnd(sp);
      const bufRunway = bufEnd - curTime;
      const isInitialSpinUp = curTime < 12.0 || Date.now() - (sp.lastPlayedAt || sp.createdAt || 0) < 8000;
      const allowThinRunway = isInitialSpinUp ? bufRunway >= -0.1 : bufRunway > 0.05;

      if (
        appId === 'spotify' &&
        data.paused &&
        !data.explicitPause &&
        !data.autoPausedByTab &&
        data.spUiStillPlaying &&
        sp.videoEl &&
        !sp.videoEl.paused &&
        (bufRunway > 0.4 || allowThinRunway)
      ) {
        logAudioDiag('ignore-transient-harmony-pause', {
          appId,
          sourceType,
          ct: Math.round(curTime * 100) / 100,
          bufEnd: Math.round(bufEnd * 100) / 100,
          runway: Math.round(bufRunway * 100) / 100,
          spinUp: isInitialSpinUp
        });
        return;
      }
      const isSidebarHandoffBgPause = Boolean(
        data.paused &&
          sp.videoEl &&
          appId === 'spotify' &&
          sourceType === 'bg' &&
          !data.explicitPause &&
          !data.autoPausedByTab &&
          sp.awaitingBgFrameHandoff &&
          sp.handoffSource === 'sidebar' &&
          Date.now() - (sp.handoffStartedAt || 0) < 12000 &&
          !sp.videoEl.paused &&
          getSpBufferedEnd(sp) - (sp.videoEl.currentTime || 0) > 0.35
      );
      const isSpuriousBgPause = Boolean(
        data.paused &&
          ((appId === 'spotify' && !data.explicitPause && !data.autoPausedByTab && data.spUiStillPlaying) ||
            isSidebarHandoffBgPause)
      );
      if (isSpuriousBgPause) {
        logAudioDiag('suppress-spurious-bg-pause', {
          appId,
          sourceType,
          ct: Math.round((sp.videoEl ? sp.videoEl.currentTime || 0 : 0) * 100) / 100,
          bufEnd: Math.round(getSpBufferedEnd(sp) * 100) / 100
        });
        return;
      }
      const prevRemotePaused = sp.remotePaused;
      sp.targetTime = Number(data.currentTime) || 0;
      sp.remotePaused = Boolean(data.paused);
      if (prevRemotePaused !== sp.remotePaused) {
        logAudioDiag(sp.remotePaused ? 'sync-paused' : 'sync-playing', {
          appId,
          sourceType,
          ct: Math.round(sp.targetTime * 100) / 100,
          explicitPause: Boolean(data.explicitPause),
          spUiStillPlaying: Boolean(data.spUiStillPlaying),
          trackTitle: sp.trackTitle || ''
        });
      }
      if (data.autoPausedByTab) {
        sp.autoPausedByTab = true;
        sp.explicitUserPause = false;
      } else if (!data.paused) {
        if (sp.explicitUserPause && sp.pausedByCommandAt && Date.now() - sp.pausedByCommandAt < 2500) {
          sp.remotePaused = true;
          if (sp.videoEl && !sp.videoEl.paused) {
            try {
              sp.lastPauseTrigger = 'pause-command-grace';
              sp.videoEl.pause();
            } catch (_) {}
          }
          const sincePauseMs = Date.now() - sp.pausedByCommandAt;
          if (sincePauseMs > 700 && (!sp.lastPauseReNudgeAt || Date.now() - sp.lastPauseReNudgeAt > 650)) {
            sp.lastPauseReNudgeAt = Date.now();
            const directPort = bg.emeBridgePorts.get(`${sourceType}:${appId}`);
            if (directPort) {
              try {
                directPort.postMessage({ cmd: 'PAUSE_LOCAL_MEDIA', command: 'pause', markShouldResume: false });
              } catch (_) {}
            }
          }
          return;
        }
        if (isTabPausedEnforced()) {
          const stayStopped = getBehavior() === 'pause-only';
          sp.remotePaused = true;
          if (stayStopped) {
            sp.autoPausedByTab = false;
            sp.explicitUserPause = true;
          } else {
            sp.autoPausedByTab = true;
            bg.tabAudio.tabAutoPausedSpAppIds.add(appId);
          }
          if (sp.videoEl) {
            sp.videoEl.muted = true;
            if (!sp.videoEl.paused) {
              try {
                sp.lastPauseTrigger = 'tab-auto-pause-enforced';
                sp.videoEl.pause();
              } catch (_) {}
            }
          }
          const pauseCmd = stayStopped ? 'PAUSE_LOCAL_MEDIA' : 'TAB_AUDIO_AUTO_PAUSE';
          const directPort = bg.emeBridgePorts.get(`${sourceType}:${appId}`);
          if (directPort) {
            try {
              directPort.postMessage({ cmd: pauseCmd, markShouldResume: !stayStopped });
            } catch (_) {}
          }
          const bgEntryForPause = bg.bgAudioPool.get(appId);
          const bgFrameForPause = bgEntryForPause && (bgEntryForPause.frame || bgEntryForPause.iframe);
          if (bgFrameForPause && bgFrameForPause.contentWindow) {
            try {
              bgFrameForPause.contentWindow.postMessage(
                { target: 'pocketmail-media-frame', cmd: pauseCmd, markShouldResume: !stayStopped },
                '*'
              );
            } catch (_) {}
          }
          const prevPausedSt = bg.liveMediaPlaybackState.get(appId);
          if (prevPausedSt && prevPausedSt.isPlaying) {
            prevPausedSt.isPlaying = false;
            prevPausedSt.updatedAt = Date.now();
          }
          refreshBgAudioIndicator();
          return;
        }
        if (!bg.tabAudio.isAutoPausedByTabAudio && getBehavior() !== 'off') {
          const nowChk = Date.now();
          if (nowChk - bg.tabAudio.lastExternalTabAudioCheckAt > 900) {
            bg.tabAudio.lastExternalTabAudioCheckAt = nowChk;
            if (typeof bg.checkExternalTabAudioState === 'function') bg.checkExternalTabAudioState();
          }
        }
        sp.autoPausedByTab = false;
        sp.explicitUserPause = false;
        if (!sp.handoffSource || sp.handoffSource === sourceType) {
          sp.awaitingBgFrameHandoff = false;
          if (!sp.isClear && sp.videoEl && sp.videoEl.playbackRate !== 1.0) {
            sp.videoEl.playbackRate = 1.0;
          }
        }
        sp.lastPlayedAt = Date.now();
      } else if (data.explicitPause) {
        sp.autoPausedByTab = false;
        sp.explicitUserPause = true;
        sp.awaitingBgFrameHandoff = false;
      }

      if (sp.videoEl) {
        if (!data.paused) {
          if (sp.isClear) {
            syncClearMirrorToFrame(sp, Number(data.currentTime) || 0);
          } else {
            syncSpInstanceTimeAndPlay(sp, effectiveForceSeek, isExplicitUserScrub);
          }
          const bgEntry = bg.bgAudioPool.get(appId);
          const prevSt = bg.liveMediaPlaybackState.get(appId);
          const liveSec = Math.floor(sp.videoEl.currentTime || data.currentTime || 0);
          let nextResumeUrl =
            (data.href && !data.href.includes('pm_boot=1') ? data.href : '') ||
            bgEntry?.url ||
            prevSt?.resumeUrl ||
            s.persistentSavedAppUrls?.[appId] ||
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
          if (bgEntry && nextResumeUrl) {
            bgEntry.url = nextResumeUrl;
          }
          const latestTitle = String(data.trackTitle || sp.trackTitle || '').trim();
          if (bgEntry && latestTitle && latestTitle.toLowerCase() !== 'spotify') {
            bgEntry.title = latestTitle;
          }
          if (bg.recordTrackUrlOriginalTitle && nextResumeUrl && latestTitle) {
            bg.recordTrackUrlOriginalTitle(appId, nextResumeUrl, latestTitle);
          }
          if (nextResumeUrl && (bg.isAppAllowedForPersistence(appId) || bg.isAppAllowedForBgAudio(appId))) {
            if (!s.persistentSavedAppUrls) s.persistentSavedAppUrls = {};
            s.persistentSavedAppUrls[appId] = nextResumeUrl;
          }
          bg.liveMediaPlaybackState.set(
            appId,
            normalizePlaybackMeta(
              appId,
              {
                isPlaying: true,
                currentTime: liveSec,
                duration: Number(data.duration) || sp.trackDuration || prevSt?.duration || 0,
                resumeUrl: nextResumeUrl,
                title: data.trackTitle || sp.trackTitle || bgEntry?.title || prevSt?.title || (appId === 'youtube' ? 'YouTube' : 'Spotify'),
                artist: data.artist !== undefined ? data.artist : prevSt?.artist,
                album: data.album !== undefined ? data.album : prevSt?.album,
                artworkUrl: data.artworkUrl !== undefined ? data.artworkUrl : prevSt?.artworkUrl,
                canPrev: data.canPrev,
                canNext: data.canNext
              },
              prevSt
            )
          );
          refreshBgAudioIndicator();
        } else {
          const isSidebarHandoffBgPause =
            appId === 'spotify' &&
            sourceType === 'bg' &&
            !data.explicitPause &&
            !data.autoPausedByTab &&
            sp.awaitingBgFrameHandoff &&
            sp.handoffSource === 'sidebar' &&
            Date.now() - (sp.handoffStartedAt || 0) < 12000 &&
            sp.videoEl &&
            !sp.videoEl.paused &&
            getSpBufferedEnd(sp) - (sp.videoEl.currentTime || 0) > 0.35;
          const isSpuriousBgPause =
            (appId === 'spotify' && !data.explicitPause && !data.autoPausedByTab && data.spUiStillPlaying) ||
            isSidebarHandoffBgPause;

          if (isSpuriousBgPause) {
            logAudioDiag('suppress-spurious-bg-pause', {
              appId,
              sourceType,
              ct: Math.round((sp.videoEl.currentTime || 0) * 100) / 100,
              bufEnd: Math.round(getSpBufferedEnd(sp) * 100) / 100
            });
          } else {
            if (!sp.videoEl.paused) {
              try {
                sp.lastPauseTrigger = data.explicitPause ? 'user-explicit-pause' : 'ui-stopped-pause';
                sp.videoEl.pause();
              } catch (_) {}
            }
            const prevSt = bg.liveMediaPlaybackState.get(appId);
            if (prevSt) {
              prevSt.isPlaying = false;
              prevSt.handedOffAt = undefined;
              if (data.href && !data.href.includes('pm_boot=1')) {
                prevSt.resumeUrl = data.href;
              }
              prevSt.updatedAt = Date.now();
            }
            refreshBgAudioIndicator();
          }
        }
      }
    }
  }

  function handleBgMseAudioChunk(appId, chunk) {
    if (!appId || !chunk) return;
    let player = bg.bgMsePlayers.get(appId);
    const pausedByTab = isTabPausedEnforced();
    const savedVol = getSavedMediaVolumeState(appId);
    if (!player) {
      const ms = new MediaSource();
      const objUrl = URL.createObjectURL(ms);
      const audioEl = document.createElement('audio');
      audioEl.autoplay = !pausedByTab;
      audioEl.muted = pausedByTab ? true : savedVol.muted;
      audioEl.volume = savedVol.volume;
      audioEl.src = objUrl;
      document.body.appendChild(audioEl);
      player = { ms, audioEl, sb: null, queue: [], objUrl };
      bg.bgMsePlayers.set(appId, player);

      const appendNextOrTrim = (item) => {
        try {
          player.sb.appendBuffer(item);
        } catch (err) {
          if (err && err.name === 'QuotaExceededError' && player.sb && !player.sb.updating && player.sb.buffered.length > 0) {
            try {
              const bStart = player.sb.buffered.start(0);
              const ct = Number(player.audioEl.currentTime) || 0;
              const cutEnd = Math.min(Math.max(bStart, ct - 2), Math.max(bStart + 4, ct - 8));
              if (cutEnd > bStart + 0.1) {
                player.queue.unshift(item);
                player.sb.remove(bStart, cutEnd);
              }
            } catch (_) {}
          }
        }
      };

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
              if (player.sb.buffered.length > 1) {
                const ct = Number(player.audioEl.currentTime) || 0;
                for (let i = 0; i < player.sb.buffered.length - 1; i++) {
                  const rEnd = player.sb.buffered.end(i);
                  const nextStart = player.sb.buffered.start(i + 1);
                  if (ct >= rEnd - 0.09 && ct <= rEnd + 0.05 && nextStart > rEnd && nextStart - rEnd <= 8.0) {
                    player.audioEl.currentTime = nextStart + 0.02;
                    break;
                  }
                }
              }
              if (player.queue.length > 0 && !player.sb.updating) {
                appendNextOrTrim(player.queue.shift());
              }
              if (player.audioEl.paused && !isTabPausedEnforced()) {
                player.audioEl.play().catch(() => {});
              }
            } catch (_) {}
          });
          if (player.queue.length > 0 && !player.sb.updating) {
            appendNextOrTrim(player.queue.shift());
          }
        } catch (_) {}
      });
    }

    if (player.sb && !player.sb.updating && player.queue.length === 0) {
      try {
        player.sb.appendBuffer(chunk);
      } catch (err) {
        if (err && err.name === 'QuotaExceededError' && player.sb && !player.sb.updating && player.sb.buffered.length > 0) {
          try {
            const bStart = player.sb.buffered.start(0);
            const ct = Number(player.audioEl.currentTime) || 0;
            const cutEnd = Math.min(Math.max(bStart, ct - 2), Math.max(bStart + 4, ct - 8));
            if (cutEnd > bStart + 0.1) {
              player.queue.unshift(chunk);
              player.sb.remove(bStart, cutEnd);
            }
          } catch (_) {}
        } else if (player.queue.length < 120) {
          player.queue.push(chunk);
        }
      }
    } else if (player.queue.length < 120) {
      player.queue.push(chunk);
    }
    const bgEntry = bg.bgAudioPool.get(appId);
    const prevSt = bg.liveMediaPlaybackState.get(appId);
    bg.liveMediaPlaybackState.set(
      appId,
      normalizePlaybackMeta(
        appId,
        {
          isPlaying: !pausedByTab,
          currentTime: prevSt?.currentTime || 0,
          resumeUrl: bgEntry?.url || prevSt?.resumeUrl || '',
          title: bgEntry?.title || prevSt?.title || ''
        },
        prevSt
      )
    );
    refreshBgAudioIndicator();
  }

  function handleNowPlayingCommand(appId, command, extra = {}) {
    const active = getActiveNowPlayingState();
    const targetId = appId || active?.appId || '';
    if (!targetId || !command) return { ok: false };

    const sp = bg.bgSpEmePlayers.get(targetId);
    const mse = bg.bgMsePlayers.get(targetId);
    const bgEntry = bg.bgAudioPool.get(targetId);
    const prevSt = bg.liveMediaPlaybackState.get(targetId);

    const dispatchToTargetFrames = (portCmd, framePayload) => {
      let deliveredBgPort = false;
      let deliveredSidebarPort = false;
      ['bg', 'sidebar'].forEach((src) => {
        const p = bg.emeBridgePorts.get(`${src}:${targetId}`);
        if (p) {
          try {
            p.postMessage(portCmd);
            if (src === 'bg') deliveredBgPort = true;
            else deliveredSidebarPort = true;
          } catch (_) {}
        }
      });
      if (!deliveredBgPort && bgEntry && bgEntry.frame && bgEntry.frame.contentWindow) {
        try {
          bgEntry.frame.contentWindow.postMessage(
            { target: 'pocketmail-media-frame', ...framePayload },
            '*'
          );
        } catch (_) {}
      }
      browser.runtime
        .sendMessage({
          type: 'PM_FORWARD_MEDIA_COMMAND',
          appId: targetId,
          command,
          skipFramePost: deliveredSidebarPort,
          ...framePayload
        })
        .catch(() => {});
    };

    if (command === 'pause') {
      if (sp && !sp.disposed) {
        sp.awaitingBgFrameHandoff = false;
        sp.explicitUserPause = true;
        sp.pausedByCommandAt = Date.now();
        sp.lastPauseReNudgeAt = 0;
        sp.remotePaused = true;
        if (sp.videoEl && !sp.videoEl.paused) {
          try {
            sp.lastPauseTrigger = 'selected-app-priority-pause';
            sp.videoEl.pause();
          } catch (_) {}
        }
      }
      const curSt = bg.bgStagingSpPlayers.get(targetId);
      if (curSt && !curSt.disposed) {
        bg.bgStagingSpPlayers.delete(targetId);
        disposeSpPlayerInstance(curSt);
      }
      if (mse && mse.audioEl && !mse.audioEl.paused) {
        try {
          mse.audioEl.pause();
        } catch (_) {}
      }
      bg.liveMediaPlaybackState.set(
        targetId,
        normalizePlaybackMeta(targetId, { isPlaying: false }, prevSt)
      );
      dispatchToTargetFrames(
        { cmd: 'PAUSE_LOCAL_MEDIA', command: 'pause', markShouldResume: false },
        { cmd: 'PAUSE_LOCAL_MEDIA', command: 'pause', markShouldResume: false }
      );
      refreshBgAudioIndicator(true);
      return { ok: true, isPlaying: false };
    }

    if (command === 'seek') {
      const rawTarget = Number(extra && extra.seekTime);
      if (!Number.isFinite(rawTarget) || rawTarget < 0) {
        return { ok: false, error: 'Invalid seekTime' };
      }
      const dur = (sp && Number(sp.trackDuration)) || Number(prevSt?.duration) || 0;
      const seekSec = dur > 0 ? Math.min(rawTarget, Math.max(0, dur - 0.25)) : rawTarget;
      const now = Date.now();
      if (sp && !sp.disposed) {
        sp.isExplicitUserScrub = true;
        sp.explicitUserScrubUntil = now + 3500;
        sp.targetTime = seekSec;
        sp.pendingSeekTarget = seekSec;
        sp.pendingSeekSetAt = now;
        sp.pendingSeekIsUserScrub = true;
        sp.maxObservedCt = seekSec;
        if (sp.videoEl && isTimeInSpBuffered(sp, seekSec)) {
          try {
            sp.videoEl.currentTime = seekSec;
          } catch (_) {}
        }
      }
      const curSt = bg.bgStagingSpPlayers.get(targetId);
      if (curSt && !curSt.disposed) {
        curSt.isExplicitUserScrub = true;
        curSt.explicitUserScrubUntil = now + 3500;
        curSt.targetTime = seekSec;
      }
      if (mse && mse.audioEl && Number.isFinite(mse.audioEl.duration)) {
        try {
          mse.audioEl.currentTime = Math.min(seekSec, mse.audioEl.duration);
        } catch (_) {}
      }
      bg.liveMediaPlaybackState.set(
        targetId,
        normalizePlaybackMeta(targetId, { currentTime: Math.floor(seekSec) }, prevSt)
      );
      dispatchToTargetFrames(
        { cmd: 'SEEK_SP_MEDIA', currentTime: seekSec, forceHarmonySeek: true, isUserScrub: true },
        { cmd: 'SEEK_SP_MEDIA', currentTime: seekSec, forceHarmonySeek: true, isUserScrub: true }
      );
      refreshBgAudioIndicator(true);
      return { ok: true, currentTime: seekSec };
    }

    if (command === 'set_volume') {
      const rawVol = Number(extra && extra.volume);
      if (!Number.isFinite(rawVol)) {
        return { ok: false, error: 'Invalid volume' };
      }
      const nextVol = Math.round(Math.min(1, Math.max(0, rawVol)) * 100) / 100;
      const nextMuted = typeof extra?.muted === 'boolean' ? extra.muted : nextVol <= 0.001;
      const persisted = persistMediaVolumeState(targetId, nextVol, nextMuted);
      if (typeof bg.scheduleSettingsSave === 'function') {
        bg.scheduleSettingsSave(true);
      }
      if (sp && !sp.disposed) {
        sp.desiredVolume = persisted.volume;
        sp.desiredMuted = persisted.muted;
        sp.lastNonZeroVolume = persisted.lastNonZeroVolume;
        if (sp.videoEl) {
          try {
            sp.videoEl.volume = persisted.volume;
            sp.videoEl.muted = isTabPausedEnforced() ? true : persisted.muted;
          } catch (_) {}
        }
      }
      const curSt = bg.bgStagingSpPlayers.get(targetId);
      if (curSt && !curSt.disposed) {
        curSt.desiredVolume = persisted.volume;
        curSt.desiredMuted = persisted.muted;
        curSt.lastNonZeroVolume = persisted.lastNonZeroVolume;
      }
      const curNx = bg.bgNextSpPlayers.get(targetId);
      if (curNx && !curNx.disposed) {
        curNx.desiredVolume = persisted.volume;
        curNx.desiredMuted = persisted.muted;
        curNx.lastNonZeroVolume = persisted.lastNonZeroVolume;
      }
      if (mse && mse.audioEl) {
        try {
          mse.audioEl.volume = persisted.volume;
          mse.audioEl.muted = isTabPausedEnforced() ? true : persisted.muted;
        } catch (_) {}
      }
      bg.liveMediaPlaybackState.set(
        targetId,
        normalizePlaybackMeta(
          targetId,
          { volume: persisted.volume, muted: persisted.muted, lastNonZeroVolume: persisted.lastNonZeroVolume },
          prevSt
        )
      );
      dispatchToTargetFrames(
        { cmd: 'PM_MEDIA_CONTROL', command: 'set_volume', volume: persisted.volume, muted: persisted.muted },
        { cmd: 'PM_MEDIA_CONTROL', command: 'set_volume', volume: persisted.volume, muted: persisted.muted }
      );
      refreshBgAudioIndicator(true);
      return { ok: true, volume: persisted.volume, muted: persisted.muted };
    }

    if (command === 'mute_toggle') {
      const savedVol = getSavedMediaVolumeState(targetId);
      const restoreNonZero =
        (sp && !sp.disposed && sp.lastNonZeroVolume > 0.001 ? sp.lastNonZeroVolume : 0) ||
        (savedVol.lastNonZeroVolume > 0.001 ? savedVol.lastNonZeroVolume : 0.8);
      const baseVol =
        sp && !sp.disposed && typeof sp.desiredVolume === 'number' && Number.isFinite(sp.desiredVolume)
          ? sp.desiredVolume
          : mse && mse.audioEl && Number.isFinite(mse.audioEl.volume)
            ? mse.audioEl.volume
            : typeof prevSt?.volume === 'number' && Number.isFinite(prevSt.volume)
              ? prevSt.volume
              : savedVol.volume;
      const baseMuted =
        sp && !sp.disposed
          ? Boolean(sp.desiredMuted)
          : mse && mse.audioEl
            ? Boolean(mse.audioEl.muted)
            : prevSt && typeof prevSt.muted === 'boolean'
              ? prevSt.muted
              : Boolean(savedVol.muted);
      const effectivelyMuted = baseMuted || !(baseVol > 0.001);
      let nextMuted = !effectivelyMuted;
      let nextVol = baseVol;
      if (sp && !sp.disposed) {
        sp.desiredMuted = nextMuted;
        if (!nextMuted && !(sp.desiredVolume > 0.001)) {
          sp.desiredVolume = restoreNonZero;
        }
        nextVol = typeof sp.desiredVolume === 'number' ? sp.desiredVolume : nextVol;
        if (sp.videoEl) {
          sp.videoEl.volume = nextVol;
          sp.videoEl.muted = isTabPausedEnforced() ? true : nextMuted;
        }
      } else if (mse && mse.audioEl) {
        if (!nextMuted && !(mse.audioEl.volume > 0.001)) {
          mse.audioEl.volume = restoreNonZero;
        }
        nextVol = mse.audioEl.volume;
        mse.audioEl.muted = isTabPausedEnforced() ? true : nextMuted;
      } else if (!nextMuted && !(nextVol > 0.001)) {
        nextVol = restoreNonZero;
      }
      const curSt = bg.bgStagingSpPlayers.get(targetId);
      if (curSt && !curSt.disposed) {
        curSt.desiredMuted = nextMuted;
        curSt.desiredVolume = nextVol;
        if (!nextMuted && nextVol > 0.001) curSt.lastNonZeroVolume = nextVol;
      }
      const curNx = bg.bgNextSpPlayers.get(targetId);
      if (curNx && !curNx.disposed) {
        curNx.desiredMuted = nextMuted;
        curNx.desiredVolume = nextVol;
        if (!nextMuted && nextVol > 0.001) curNx.lastNonZeroVolume = nextVol;
      }
      const persisted = persistMediaVolumeState(targetId, nextVol, nextMuted, restoreNonZero);
      if (typeof bg.scheduleSettingsSave === 'function') {
        bg.scheduleSettingsSave(true);
      }
      bg.liveMediaPlaybackState.set(
        targetId,
        normalizePlaybackMeta(
          targetId,
          { muted: persisted.muted, volume: persisted.volume, lastNonZeroVolume: persisted.lastNonZeroVolume },
          prevSt
        )
      );
      dispatchToTargetFrames(
        { cmd: 'PM_MEDIA_CONTROL', command: 'mute_toggle', muted: persisted.muted, volume: persisted.volume },
        { cmd: 'PM_MEDIA_CONTROL', command: 'mute_toggle', muted: persisted.muted, volume: persisted.volume }
      );
      refreshBgAudioIndicator(true);
      return { ok: true, muted: persisted.muted, volume: persisted.volume };
    }

    if (command === 'play_pause') {
      const currentlyPlaying = Boolean(
        !isTabPausedEnforced() &&
        ((sp && !sp.disposed && sp.videoEl && !sp.videoEl.paused && !sp.remotePaused) ||
          (mse && mse.audioEl && !mse.audioEl.paused) ||
          (prevSt && prevSt.isPlaying))
      );
      const nextPlaying = !currentlyPlaying;
      if (nextPlaying) {
        if (isTabPausedEnforced() || bg.tabAudio.isAutoPausedByTabAudio || bg.tabAudio.knownActiveMediaTabIds.size > 0) {
          bg.tabAudio.manualOverrideWhileTabAudible = true;
          bg.tabAudio.audibleOverrideTabIds.clear();
          bg.tabAudio.knownActiveMediaTabIds.forEach((tid) => bg.tabAudio.audibleOverrideTabIds.add(tid));
          if (browser.tabs && typeof browser.tabs.query === 'function') {
            browser.tabs
              .query({ audible: true })
              .then((tabs) => {
                (tabs || []).forEach((t) => {
                  if (t && typeof t.id === 'number' && t.audible && bg.isExternalBrowserTab(t)) {
                    bg.tabAudio.audibleOverrideTabIds.add(t.id);
                  }
                });
              })
              .catch(() => {});
          }
          if (bg.tabAudio.isAutoPausedByTabAudio && typeof bg.setTabAudioPauseTrigger === 'function') {
            bg.setTabAudioPauseTrigger(false, false);
            browser.runtime
              .sendMessage({
                type: 'PM_TAB_AUDIO_AUTO_PAUSE_STATE',
                autoPaused: false
              })
              .catch(() => {});
          }
          logAudioDiag('tab-manual-override', {
            appId: targetId,
            sourceType: 'now-playing',
            overriddenTabs: Array.from(bg.tabAudio.audibleOverrideTabIds)
          });
        }
        bg.tabAudio.tabAutoPausedSpAppIds.delete(targetId);
        bg.tabAudio.tabAutoPausedMseAppIds.delete(targetId);
        if (sp && !sp.disposed) {
          sp.explicitUserPause = false;
          sp.pausedByCommandAt = 0;
          sp.remotePaused = false;
          sp.autoPausedByTab = false;
          sp.lastPlayedAt = Date.now();
          syncSpInstanceTimeAndPlay(sp);
        }
        if (mse && mse.audioEl) {
          const savedMseVol = getSavedMediaVolumeState(targetId);
          mse.audioEl.muted = savedMseVol.muted;
          mse.audioEl.volume = savedMseVol.volume;
          if (mse.audioEl.paused && !isTabPausedEnforced()) {
            mse.audioEl.play().catch(() => {});
          }
        }
        bg.liveMediaPlaybackState.set(
          targetId,
          normalizePlaybackMeta(targetId, { isPlaying: true }, prevSt)
        );
        dispatchToTargetFrames(
          { cmd: 'RESUME_BG_SP_MEDIA', command: 'play_pause' },
          { cmd: 'RESUME_BG_SP_MEDIA', command: 'play_pause' }
        );
      } else {
        if (sp && !sp.disposed) {
          sp.explicitUserPause = true;
          sp.pausedByCommandAt = Date.now();
          sp.lastPauseReNudgeAt = 0;
          sp.remotePaused = true;
          if (sp.videoEl && !sp.videoEl.paused) {
            try {
              sp.lastPauseTrigger = 'now-playing-pause';
              sp.videoEl.pause();
            } catch (_) {}
          }
        }
        if (mse && mse.audioEl && !mse.audioEl.paused) {
          try {
            mse.audioEl.pause();
          } catch (_) {}
        }
        bg.liveMediaPlaybackState.set(
          targetId,
          normalizePlaybackMeta(targetId, { isPlaying: false }, prevSt)
        );
        dispatchToTargetFrames(
          { cmd: 'PAUSE_LOCAL_MEDIA', command: 'play_pause', markShouldResume: false },
          { cmd: 'PAUSE_LOCAL_MEDIA', command: 'play_pause', markShouldResume: false }
        );
      }
      refreshBgAudioIndicator(true);
      return { ok: true, isPlaying: nextPlaying };
    }

    if (command === 'prev' || command === 'next') {
      bg.state.lastSidebarPlayIntentAt = Date.now();
      if (sp && !sp.disposed) {
        sp.explicitUserPause = false;
        sp.pausedByCommandAt = 0;
        sp.explicitSidebarPlayIntent = true;
        sp.explicitSidebarPlayIntentAt = Date.now();
      }
      const curSt = bg.bgStagingSpPlayers.get(targetId);
      if (curSt && !curSt.disposed) {
        curSt.explicitSidebarPlayIntent = true;
        curSt.explicitSidebarPlayIntentAt = Date.now();
      }
      const cmdName = command === 'next' ? 'SKIP_NEXT_SP_TRACK' : 'SKIP_PREV_SP_TRACK';
      dispatchToTargetFrames(
        { cmd: cmdName, command },
        { cmd: cmdName, command }
      );
      return { ok: true };
    }

    return { ok: false };
  }

  function ensureBgWebAudioKeepalive() {
    try {
      if (bg.state.bgWebAudioKeepaliveCtx && bg.state.bgWebAudioKeepaliveCtx.state !== 'closed') {
        if (bg.state.bgWebAudioKeepaliveCtx.state === 'suspended') {
          bg.state.bgWebAudioKeepaliveCtx.resume().catch(() => {});
        }
        return bg.state.bgWebAudioKeepaliveCtx;
      }
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();
      const gain = ctx.createGain();
      gain.gain.value = 1e-5;
      const osc = ctx.createOscillator();
      osc.frequency.value = 440;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      bg.state.bgWebAudioKeepaliveCtx = ctx;
      bg.state.bgWebAudioGainNode = gain;
      bg.state.bgWebAudioOscNode = osc;
      logAudioDiag('bg-webaudio-keepalive-started', {
        state: ctx.state,
        sampleRate: ctx.sampleRate
      });
      return ctx;
    } catch (_) {
      return null;
    }
  }

  function disposeStandbyBgFrame(appId) {
    if (!appId) return;
    if (appId === 'spotify' && bg.state.standbySpotifyPrewarmTimer) {
      clearTimeout(bg.state.standbySpotifyPrewarmTimer);
      bg.state.standbySpotifyPrewarmTimer = null;
    }
    bg.emeBridgePorts.delete(`standby:${appId}`);
    const st = bg.bgStandbyPool.get(appId);
    if (st) {
      bg.bgStandbyPool.delete(appId);
      try {
        st.frame.remove();
        st.frame.src = 'about:blank';
      } catch (_) {}
    }
  }

  function disposeAllStandbyBgFrames() {
    if (bg.state.standbySpotifyPrewarmTimer) {
      clearTimeout(bg.state.standbySpotifyPrewarmTimer);
      bg.state.standbySpotifyPrewarmTimer = null;
    }
    Array.from(bg.bgStandbyPool.keys()).forEach((appId) => {
      disposeStandbyBgFrame(appId);
    });
  }

  function stopSingleBackgroundAudioFrame(appId) {
    if (!appId) return;
    disposeStandbyBgFrame(appId);
    cleanupMsePlayer(appId);
    cleanupSpEmePlayer(appId);
    const entry = bg.bgAudioPool.get(appId);
    if (entry) {
      bg.bgAudioPool.delete(appId);
      try {
        entry.frame.remove();
        entry.frame.src = 'about:blank';
      } catch (_) {}
    }
    try {
      const domFrames = document.querySelectorAll(`iframe[name="pm-bg-audio-${appId}"]`);
      for (const f of domFrames) {
        f.remove();
        f.src = 'about:blank';
      }
    } catch (_) {}
    if (bg.bgAudioPool.size === 0) {
      bg.updateToolbarBadge();
    }
  }

  function stopBackgroundAudioFrames() {
    disposeAllStandbyBgFrames();
    if (
      bg.bgAudioPool.size === 0 &&
      bg.bgMsePlayers.size === 0 &&
      bg.bgSpEmePlayers.size === 0 &&
      bg.bgStagingSpPlayers.size === 0
    ) {
      return;
    }
    bg.bgAudioPool.forEach((entry, appId) => {
      cleanupMsePlayer(appId);
      cleanupSpEmePlayer(appId);
      try {
        entry.frame.remove();
        entry.frame.src = 'about:blank';
      } catch (_) {}
    });
    bg.bgMsePlayers.forEach((_, appId) => cleanupMsePlayer(appId));
    bg.bgSpEmePlayers.forEach((_, appId) => cleanupSpEmePlayer(appId));
    bg.bgStagingSpPlayers.forEach((_, appId) => cleanupSpEmePlayer(appId));
    bg.bgAudioPool.clear();
    bg.updateToolbarBadge();
  }

  function startBackgroundAudioKeepAlive(appId, targetUrl, title = '') {
    if (!appId || !targetUrl || !document.body) return;
    if (!bg.isAppAllowedForBgAudio(appId)) {
      stopSingleBackgroundAudioFrame(appId);
      return;
    }
    logAudioDiag('start-bg-keepalive', {
      appId,
      targetUrl,
      alreadyInPool: bg.bgAudioPool.has(appId)
    });

    Array.from(bg.bgAudioPool.keys()).forEach((otherId) => {
      if (otherId !== appId) {
        stopSingleBackgroundAudioFrame(otherId);
        bg.liveMediaPlaybackState.delete(otherId);
      }
    });
    Array.from(bg.bgStandbyPool.keys()).forEach((otherId) => {
      if (otherId !== appId) {
        disposeStandbyBgFrame(otherId);
      }
    });
    Array.from(bg.bgSpEmePlayers.keys()).forEach((otherId) => {
      if (otherId !== appId) {
        cleanupSpEmePlayer(otherId);
      }
    });

    const existing = bg.bgAudioPool.get(appId);
    if (existing) {
      if (existing.frame && existing.frame.isConnected) {
        abortSidebarSpTakeover(appId);
        return;
      }
      try {
        existing.frame.remove();
        existing.frame.src = 'about:blank';
      } catch (_) {}
      bg.bgAudioPool.delete(appId);
    }
    cleanupMsePlayer(appId);

    if (MIRROR_AUDIO_APP_IDS.has(appId)) {
      const staleStaging = bg.bgStagingSpPlayers.get(appId);
      if (staleStaging) {
        disposeSpPlayerInstance(staleStaging);
        bg.bgStagingSpPlayers.delete(appId);
      }
      const activeSp = bg.bgSpEmePlayers.get(appId);
      const hasWarmBuffer = Boolean(
        activeSp &&
          !activeSp.disposed &&
          activeSp.videoEl &&
          activeSp.sb &&
          activeSp.sb.buffered &&
          activeSp.sb.buffered.length > 0 &&
          !activeSp.explicitUserPause
      );
      if (hasWarmBuffer) {
        const knownTitle =
          (title && title !== 'Spotify' ? title : '') ||
          (bg.liveMediaPlaybackState.get(appId)?.title || '');
        if (!activeSp.trackTitle && knownTitle && knownTitle !== 'Spotify') {
          activeSp.trackTitle = knownTitle;
        }
        activeSp.explicitSidebarPlayIntent = false;
        activeSp.explicitUserPause = false;
        activeSp.awaitingBgFrameHandoff = true;
        activeSp.handoffStartedAt = Date.now();
        activeSp.handoffSource = 'bg';
        activeSp.sourceType = 'bg';
        const savedCloseVol = getSavedMediaVolumeState(appId);
        if (typeof activeSp.desiredVolume !== 'number' || !Number.isFinite(activeSp.desiredVolume)) {
          activeSp.desiredVolume = savedCloseVol.volume;
        }
        activeSp.videoEl.muted = isTabPausedEnforced() ? true : Boolean(activeSp.desiredMuted);
        activeSp.videoEl.volume = activeSp.desiredVolume;
        activeSp.videoEl.playbackRate = 1.0;
        if (isTabPausedEnforced()) {
          activeSp.remotePaused = true;
          activeSp.autoPausedByTab = getBehavior() === 'pause-resume';
          if (activeSp.autoPausedByTab) bg.tabAudio.tabAutoPausedSpAppIds.add(appId);
          activeSp.videoEl.muted = true;
          if (!activeSp.videoEl.paused) {
            try {
              activeSp.videoEl.pause();
            } catch (_) {}
          }
        } else {
          activeSp.remotePaused = false;
          syncSpInstanceTimeAndPlay(activeSp);
        }
        if (appId === 'spotify') {
          ensureStagingSpEmePlayer(appId, activeSp.mime || 'audio/mp4; codecs="mp4a.40.2"', 0, 'bg');
        }
      } else {
        cleanupSpEmePlayer(appId);
        if (appId === 'spotify') {
          ensureBgSpEmePlayer(appId, 'audio/mp4; codecs="mp4a.40.2"', 0, 'bg');
        }
      }
    } else {
      cleanupSpEmePlayer(appId);
    }

    const standbyEntry = appId === 'spotify' ? bg.bgStandbyPool.get('spotify') : null;
    if (standbyEntry && standbyEntry.frame && standbyEntry.frame.isConnected) {
      bg.bgStandbyPool.delete('spotify');
      const iframe = standbyEntry.frame;
      iframe.name = `pm-bg-audio-${appId}`;
      const standbyPort = bg.emeBridgePorts.get(`standby:${appId}`);
      if (standbyPort) {
        bg.emeBridgePorts.delete(`standby:${appId}`);
        bg.emeBridgePorts.set(`bg:${appId}`, standbyPort);
      }
      bg.bgAudioPool.set(appId, {
        frame: iframe,
        url: targetUrl,
        title,
        autoplayBlocked: false,
        startedAt: Date.now()
      });
      const curSp = bg.bgSpEmePlayers.get(appId);
      const activateCmd = {
        cmd: 'ACTIVATE_BG_SPOTIFY_HANDOFF',
        resumeUrl: targetUrl,
        trackTitle: (curSp && curSp.trackTitle) || title || '',
        targetSec: curSp && curSp.videoEl ? Number(curSp.videoEl.currentTime) || 0 : 0
      };
      if (standbyPort) {
        try {
          standbyPort.postMessage(activateCmd);
        } catch (_) {}
      }
      if (iframe.contentWindow) {
        try {
          iframe.contentWindow.postMessage({ target: 'pocketmail-media-frame', ...activateCmd }, '*');
        } catch (_) {}
      }
      refreshBgAudioIndicator();
      return;
    }

    try {
      const staleFrames = document.querySelectorAll(`iframe[name="pm-bg-audio-${appId}"]`);
      for (const f of staleFrames) {
        f.remove();
        f.src = 'about:blank';
      }
    } catch (_) {}

    const iframe = document.createElement('iframe');
    iframe.name = `pm-bg-audio-${appId}`;
    iframe.setAttribute(
      'allow',
      'autoplay *; encrypted-media *; clipboard-write *; picture-in-picture *; fullscreen *'
    );
    iframe.style.cssText =
      'position:fixed;left:0;top:0;width:420px;height:680px;opacity:0.001;pointer-events:none;z-index:-1;border:none;';
    iframe.src = targetUrl;
    document.body.appendChild(iframe);
    bg.bgAudioPool.set(appId, {
      frame: iframe,
      url: targetUrl,
      title,
      autoplayBlocked: false,
      startedAt: Date.now()
    });
    refreshBgAudioIndicator();
  }

  function triggerSidebarClosedAudioHandoff(candidates = []) {
    const s = bg.state.currentSettings;
    if (s.keepAudioPlayingWhenClosed === false) {
      stopBackgroundAudioFrames();
      return;
    }
    bg.scheduleSettingsSave(true);

    let startedAny = false;
    if (Array.isArray(candidates) && candidates.length > 0) {
      const allowedCandidates = candidates.filter((c) => {
        if (!c || !c.appId || !c.url || !bg.isAppAllowedForBgAudio(c.appId)) return false;
        const sp = bg.bgSpEmePlayers.get(c.appId);
        if (sp && sp.explicitUserPause) return false;
        if (c.appId === 'youtube' && !isPlayableYouTubeUrl(c.url)) return false;
        return true;
      });
      const chosen =
        allowedCandidates.find((c) => c.appId === s.persistentLastActiveAppId) ||
        allowedCandidates[allowedCandidates.length - 1];
      if (chosen && chosen.appId && chosen.url) {
        startBackgroundAudioKeepAlive(chosen.appId, chosen.url, chosen.title || '');
        startedAny = true;
      }
    }
    if (!startedAny) {
      let bestId = null;
      let bestSt = null;
      bg.liveMediaPlaybackState.forEach((st, id) => {
        const sp = bg.bgSpEmePlayers.get(id);
        if (sp && sp.explicitUserPause) return;
        const isActivelyPlaying =
          (sp && !sp.disposed && sp.videoEl && !sp.videoEl.paused && !sp.explicitUserPause) ||
          (st.isPlaying && Date.now() - st.updatedAt < 120000);
        if (isActivelyPlaying && bg.isAppAllowedForBgAudio(id)) {
          const catalog = getMediaAppsCatalog();
          const defaultAppUrl = catalog && typeof catalog.getAppById === 'function' ? catalog.getAppById(id, s)?.defaultUrl : '';
          const candidateUrl =
            st.resumeUrl ||
            s.persistentSavedAppUrls?.[id] ||
            defaultAppUrl ||
            '';
          if (id === 'youtube' && !isPlayableYouTubeUrl(candidateUrl)) return;
          if (!bestSt || id === s.persistentLastActiveAppId || st.updatedAt >= bestSt.updatedAt) {
            bestId = id;
            bestSt = st;
          }
        }
      });
      if (bestId && bestSt) {
        const catalog = getMediaAppsCatalog();
        const defaultAppUrl = catalog && typeof catalog.getAppById === 'function' ? catalog.getAppById(bestId, s)?.defaultUrl : '';
        const targetUrl =
          bestSt.resumeUrl ||
          s.persistentSavedAppUrls?.[bestId] ||
          defaultAppUrl ||
          '';
        if (targetUrl) {
          startBackgroundAudioKeepAlive(bestId, targetUrl, bestSt.title || '');
          startedAny = true;
        }
      }
    }
    if (!startedAny) {
      MIRROR_AUDIO_APP_IDS.forEach((mirrorId) => {
        if (startedAny || !bg.isAppAllowedForBgAudio(mirrorId)) return;
        const sp = bg.bgSpEmePlayers.get(mirrorId);
        const recentlyActive =
          sp &&
          !sp.disposed &&
          !sp.explicitUserPause &&
          (!sp.remotePaused ||
            (sp.videoEl && !sp.videoEl.paused) ||
            Date.now() - (sp.lastPlayedAt || 0) < 60000);
        if (recentlyActive && sp.sb && sp.sb.buffered && sp.sb.buffered.length > 0) {
          const targetUrl =
            bg.liveMediaPlaybackState.get(mirrorId)?.resumeUrl ||
            s.persistentSavedAppUrls?.[mirrorId] ||
            (mirrorId === 'spotify' ? 'https://open.spotify.com/' : 'https://www.youtube.com/');
          if (mirrorId === 'youtube' && !isPlayableYouTubeUrl(targetUrl)) return;
          startBackgroundAudioKeepAlive(mirrorId, targetUrl, mirrorId === 'spotify' ? 'Spotify' : 'YouTube');
          startedAny = true;
        }
      });
    }
    if (!startedAny) {
      Array.from(bg.bgAudioPool.keys()).forEach((id) => {
        const sp = bg.bgSpEmePlayers.get(id);
        if (sp && sp.explicitUserPause) {
          stopSingleBackgroundAudioFrame(id);
        }
      });
      bg.bgSpEmePlayers.forEach((sp, id) => {
        if (!bg.bgAudioPool.has(id)) {
          if (
            bg.isAppAllowedForBgAudio(id) &&
            !sp.explicitUserPause &&
            sp.sb &&
            sp.sb.buffered &&
            sp.sb.buffered.length > 0
          ) {
            const targetUrl =
              bg.liveMediaPlaybackState.get(id)?.resumeUrl ||
              s.persistentSavedAppUrls?.[id] ||
              (id === 'spotify' ? 'https://open.spotify.com/' : '');
            if (targetUrl) {
              startBackgroundAudioKeepAlive(id, targetUrl, sp.trackTitle || (id === 'spotify' ? 'Spotify' : id));
              return;
            }
          }
          cleanupSpEmePlayer(id);
        }
      });
      if (bg.state.sidebarPortCount + bg.state.popupPortCount === 0) {
        disposeAllStandbyBgFrames();
      }
    }
  }

  // Timers & alarms
  setInterval(() => {
    if (bg.bgStagingSpPlayers.size > 0) {
      bg.bgStagingSpPlayers.forEach((_, appId) => {
        checkAndPromoteStagingSpPlayer(appId);
      });
    }
  }, 250);

  setInterval(() => {
    if (bg.emeBridgePorts.size === 0) return;
    const now = Date.now();
    bg.state.lastHeartbeatBroadcastAt = now;
    bg.state.heartbeatBroadcastCount++;
    const deadKeys = [];
    bg.emeBridgePorts.forEach((p, key) => {
      if (!p) {
        deadKeys.push(key);
        return;
      }
      if (!key.startsWith('bg:') && !key.startsWith('sidebar:')) return;
      try {
        p.postMessage({ cmd: 'BG_HEARTBEAT_TICK', ts: now });
      } catch (_) {
        deadKeys.push(key);
      }
    });
    for (let i = 0; i < deadKeys.length; i++) {
      try {
        bg.emeBridgePorts.delete(deadKeys[i]);
      } catch (_) {}
    }
  }, 400);

  if (typeof browser !== 'undefined' && browser.alarms) {
    try {
      browser.alarms.create('foxhub-audio-keepalive', { periodInMinutes: 1 });
    } catch (_) {}
    if (browser.alarms.onAlarm) {
      browser.alarms.onAlarm.addListener((alarm) => {
        if (alarm && alarm.name === 'foxhub-audio-keepalive') {
          bg.state.lastAlarmWakePulseAt = Date.now();
          bg.state.alarmWakePulseCount++;
          ensureBgWebAudioKeepalive();
          const hasActiveAudio = bg.bgAudioPool.size > 0 || bg.bgSpEmePlayers.size > 0 || bg.bgMsePlayers.size > 0;
          if (hasActiveAudio) {
            logAudioDiag('bg-alarm-wake-pulse', {
              ts: bg.state.lastAlarmWakePulseAt,
              pulseCount: bg.state.alarmWakePulseCount,
              bgPoolSize: bg.bgAudioPool.size,
              spPlayersSize: bg.bgSpEmePlayers.size
            });
            if (getBehavior() !== 'off' && typeof bg.checkExternalTabAudioState === 'function') {
              bg.checkExternalTabAudioState();
            }
            refreshBgAudioIndicator();
          }
        }
      });
    }
  }

  ensureBgWebAudioKeepalive();

  // Synchronous hooks preserved for popup/tests
  global.__pmHandleSpEmeBridge = handleSpEmeBridgeMessage;
  global.__pmGetStandbyPoolIds = () => Array.from(bg.bgStandbyPool.keys());
  global.__pmGetAudioDiagnostics = buildAudioDiagnosticsSnapshot;

  bg.getBehavior = getBehavior;
  bg.getSavedMediaVolumeState = getSavedMediaVolumeState;
  bg.persistMediaVolumeState = persistMediaVolumeState;
  bg.handleNonMirrorVolumeChanged = handleNonMirrorVolumeChanged;
  bg.MIRROR_AUDIO_APP_IDS = MIRROR_AUDIO_APP_IDS;
  bg.logAudioDiag = logAudioDiag;
  bg.isTimeInSpBuffered = isTimeInSpBuffered;
  bg.getSpBufferedEnd = getSpBufferedEnd;
  bg.buildAudioDiagnosticsSnapshot = buildAudioDiagnosticsSnapshot;
  bg.getAudibleBgAudioAppId = getAudibleBgAudioAppId;
  bg.normalizePlaybackMeta = normalizePlaybackMeta;
  bg.getActiveNowPlayingState = getActiveNowPlayingState;
  bg.handleNowPlayingCommand = handleNowPlayingCommand;
  bg.handleBgMseAudioChunk = handleBgMseAudioChunk;
  bg.updateSidebarActionIndicator = updateSidebarActionIndicator;
  bg.refreshBgAudioIndicator = refreshBgAudioIndicator;
  bg.toLocalArrayBuffer = toLocalArrayBuffer;
  bg.cloneLocalLicAuth = cloneLocalLicAuth;
  bg.isPlayableYouTubeUrl = isPlayableYouTubeUrl;
  bg.cleanupMsePlayer = cleanupMsePlayer;
  bg.disposeSpPlayerInstance = disposeSpPlayerInstance;
  bg.cleanupSpEmePlayer = cleanupSpEmePlayer;
  bg.removeBgAudioIframeOnly = removeBgAudioIframeOnly;
  bg.ensureNextSpEmePlayer = ensureNextSpEmePlayer;
  bg.ensureBgSpEmePlayer = ensureBgSpEmePlayer;
  bg.ensureStagingSpEmePlayer = ensureStagingSpEmePlayer;
  bg.abortSidebarSpTakeover = abortSidebarSpTakeover;
  bg.activateSidebarSpTakeover = activateSidebarSpTakeover;
  bg.promoteStagingSpPlayer = promoteStagingSpPlayer;
  bg.checkAndPromoteStagingSpPlayer = checkAndPromoteStagingSpPlayer;
  bg.promoteNextSpPlayer = promoteNextSpPlayer;
  bg.syncSpInstanceTimeAndPlay = syncSpInstanceTimeAndPlay;
  bg.syncClearMirrorToFrame = syncClearMirrorToFrame;
  bg.handleSpEmeBridgeMessage = handleSpEmeBridgeMessage;
  bg.ensureBgWebAudioKeepalive = ensureBgWebAudioKeepalive;
  bg.disposeStandbyBgFrame = disposeStandbyBgFrame;
  bg.disposeAllStandbyBgFrames = disposeAllStandbyBgFrames;
  bg.stopSingleBackgroundAudioFrame = stopSingleBackgroundAudioFrame;
  bg.stopBackgroundAudioFrames = stopBackgroundAudioFrames;
  bg.startBackgroundAudioKeepAlive = startBackgroundAudioKeepAlive;
  bg.triggerSidebarClosedAudioHandoff = triggerSidebarClosedAudioHandoff;
})(window);
