/**
 * FoxHub Background — Tab Audio Auto-Pause / Auto-Resume Watcher & Playback Watchdog
 * Preserves all v2.7.9 invariants (20s WASAPI drain ignore, 4.2s silent hold cap,
 * 340ms resume settle debounce, manual override preservation, 450ms watchdog).
 */

(function (global) {
  const bg = (global.FoxHubBg = global.FoxHubBg || {});
  const ta = bg.tabAudio;

  function setTabAudioPauseTrigger(active, stayStopped = false) {
    const nextActive = Boolean(active);
    ta.isAutoPausedByTabAudio = nextActive;
    try {
      global.__pmTabAudioPauseTrigger = nextActive;
      global.localStorage.setItem('__pm_tab_audio_trigger', nextActive ? '1' : '0');
    } catch (_) {}
    try {
      browser.storage.local
        .set({
          pmTabAudioTrigger: {
            active: nextActive,
            stayStopped: Boolean(stayStopped),
            ts: Date.now()
          }
        })
        .catch(() => {});
    } catch (_) {}
  }

  function isExternalBrowserTab(t) {
    if (!t) return false;
    if (t.mutedInfo && t.mutedInfo.muted) return false;
    if (t.windowId && (bg.companionWindowIds.has(t.windowId) || t.windowId === bg.state.activeLoginWindowId)) return false;
    const url = String(t.url || '');
    if (url.startsWith('moz-extension://')) return false;
    return true;
  }

  function getTabAudioBehavior() {
    const s = bg.state.currentSettings;
    if (
      s.tabAudioBehavior === 'pause-resume' ||
      s.tabAudioBehavior === 'pause-only' ||
      s.tabAudioBehavior === 'off'
    ) {
      return s.tabAudioBehavior;
    }
    return s.autoPauseOnTabAudio === false ? 'off' : 'pause-resume';
  }

  function isTabAutoPauseEnforced() {
    return Boolean(ta.isAutoPausedByTabAudio && getTabAudioBehavior() !== 'off');
  }

  function pauseAllForTabAudioAutoPause(stayStopped = false) {
    setTabAudioPauseTrigger(true, stayStopped);
    bg.logAudioDiag('tab-audio-auto-pause', {
      stayStopped,
      activeTabs: Array.from(ta.knownActiveMediaTabIds)
    });
    const pauseCmd = stayStopped ? 'PAUSE_LOCAL_MEDIA' : 'TAB_AUDIO_AUTO_PAUSE';

    bg.bgSpEmePlayers.forEach((sp, appId) => {
      if (!sp || sp.disposed || sp.explicitUserPause) return;
      const isPlayingOrAutoPaused = Boolean(
        (sp.videoEl && !sp.videoEl.paused) ||
          !sp.remotePaused ||
          sp.autoPausedByTab ||
          ta.tabAutoPausedSpAppIds.has(appId) ||
          bg.bgAudioPool.has(appId) ||
          bg.liveMediaPlaybackState.get(appId)?.isPlaying
      );
      if (isPlayingOrAutoPaused) {
        if (stayStopped) {
          sp.autoPausedByTab = false;
          sp.remotePaused = true;
          sp.explicitUserPause = true;
          ta.tabAutoPausedSpAppIds.delete(appId);
        } else {
          sp.autoPausedByTab = true;
          sp.remotePaused = true;
          ta.tabAutoPausedSpAppIds.add(appId);
        }
        const st = bg.liveMediaPlaybackState.get(appId);
        if (st) {
          st.isPlaying = false;
          st.updatedAt = Date.now();
        }
        if (sp.videoEl) {
          sp.videoEl.muted = true;
          if (!sp.videoEl.paused) {
            try {
              sp.lastPauseTrigger = 'tab-audio-auto-pause';
              sp.videoEl.pause();
            } catch (_) {}
          }
        }
      }
    });

    bg.bgStagingSpPlayers.forEach((stSp, appId) => {
      if (!stSp || stSp.disposed) return;
      stSp.remotePaused = true;
      if (!stayStopped) {
        stSp.autoPausedByTab = true;
        ta.tabAutoPausedSpAppIds.add(appId);
      }
      if (stSp.videoEl) {
        stSp.videoEl.muted = true;
        if (!stSp.videoEl.paused) {
          try {
            stSp.videoEl.pause();
          } catch (_) {}
        }
      }
    });

    bg.bgMsePlayers.forEach((player, appId) => {
      if (player && player.audioEl) {
        if (!stayStopped && !player.audioEl.paused) {
          ta.tabAutoPausedMseAppIds.add(appId);
        }
        player.audioEl.muted = true;
        if (!player.audioEl.paused) {
          try {
            player.audioEl.pause();
          } catch (_) {}
        }
        const st = bg.liveMediaPlaybackState.get(appId);
        if (st) {
          st.isPlaying = false;
          st.updatedAt = Date.now();
        }
      }
    });

    bg.emeBridgePorts.forEach((port) => {
      try {
        port.postMessage({ cmd: pauseCmd, markShouldResume: !stayStopped });
      } catch (_) {}
    });

    bg.bgAudioPool.forEach((entry) => {
      try {
        const bgFrame = entry && (entry.frame || entry.iframe);
        if (bgFrame && bgFrame.contentWindow) {
          bgFrame.contentWindow.postMessage(
            {
              target: 'pocketmail-media-frame',
              cmd: pauseCmd,
              markShouldResume: !stayStopped
            },
            '*'
          );
        }
      } catch (_) {}
    });

    browser.runtime
      .sendMessage({
        type: 'PM_TAB_AUDIO_AUTO_PAUSE_STATE',
        autoPaused: true,
        stayStopped
      })
      .catch(() => {});

    bg.refreshBgAudioIndicator();
  }

  function resumeAllFromTabAudioAutoPause() {
    setTabAudioPauseTrigger(false, false);
    ta.manualOverrideWhileTabAudible = false;
    bg.logAudioDiag('tab-audio-auto-resume', {
      spApps: Array.from(ta.tabAutoPausedSpAppIds)
    });

    bg.bgSpEmePlayers.forEach((sp, appId) => {
      if (!sp || sp.disposed) return;
      if ((sp.autoPausedByTab || ta.tabAutoPausedSpAppIds.has(appId)) && !sp.explicitUserPause) {
        sp.autoPausedByTab = false;
        sp.remotePaused = false;
        sp.lastPlayedAt = Date.now();
        if (sp.videoEl) {
          const savedSpVol = typeof bg.getSavedMediaVolumeState === 'function' ? bg.getSavedMediaVolumeState(appId) : { volume: 1.0 };
          sp.videoEl.muted = Boolean(sp.desiredMuted);
          sp.videoEl.volume =
            typeof sp.desiredVolume === 'number' && Number.isFinite(sp.desiredVolume)
              ? sp.desiredVolume
              : savedSpVol.volume;
          sp.lastPlayTrigger = 'tab-audio-auto-resume';
          if (sp.isClear) {
            const p = sp.videoEl.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } else {
            bg.syncSpInstanceTimeAndPlay(sp, false);
          }
        }
        const st = bg.liveMediaPlaybackState.get(appId);
        if (st) {
          st.isPlaying = true;
          st.updatedAt = Date.now();
        }
      }
    });
    ta.tabAutoPausedSpAppIds.clear();

    bg.bgStagingSpPlayers.forEach((stSp) => {
      if (!stSp || stSp.disposed) return;
      stSp.autoPausedByTab = false;
      stSp.remotePaused = false;
    });

    ta.tabAutoPausedMseAppIds.forEach((appId) => {
      const player = bg.bgMsePlayers.get(appId);
      if (player && player.audioEl) {
        const savedMseVol = typeof bg.getSavedMediaVolumeState === 'function'
          ? bg.getSavedMediaVolumeState(appId)
          : { volume: 1.0, muted: false };
        player.audioEl.muted = Boolean(savedMseVol.muted);
        player.audioEl.volume = savedMseVol.volume;
        if (player.audioEl.paused) {
          player.audioEl.play().catch(() => {});
        }
        const st = bg.liveMediaPlaybackState.get(appId);
        if (st) {
          st.isPlaying = true;
          st.updatedAt = Date.now();
        }
      }
    });
    ta.tabAutoPausedMseAppIds.clear();

    bg.emeBridgePorts.forEach((port) => {
      try {
        port.postMessage({ cmd: 'TAB_AUDIO_AUTO_RESUME' });
      } catch (_) {}
    });

    bg.bgAudioPool.forEach((entry) => {
      try {
        const bgFrame = entry && (entry.frame || entry.iframe);
        if (bgFrame && bgFrame.contentWindow) {
          bgFrame.contentWindow.postMessage(
            { target: 'pocketmail-media-frame', cmd: 'TAB_AUDIO_AUTO_RESUME' },
            '*'
          );
        }
      } catch (_) {}
    });

    browser.runtime
      .sendMessage({
        type: 'PM_TAB_AUDIO_AUTO_PAUSE_STATE',
        autoPaused: false
      })
      .catch(() => {});

    bg.refreshBgAudioIndicator();
  }

  async function checkExternalTabAudioState() {
    clearTimeout(ta.silentMediaRecheckTimer);
    const behavior = getTabAudioBehavior();
    if (behavior === 'off') {
      if (ta.pendingTabResumeTimer) {
        clearTimeout(ta.pendingTabResumeTimer);
        ta.pendingTabResumeTimer = null;
        bg.logAudioDiag('tab-resume-cancelled');
      }
      ta.knownActiveMediaTabIds.clear();
      ta.recentlyStoppedMediaTabMap.clear();
      ta.audibleOverrideTabIds.clear();
      ta.silentTabHoldSince.clear();
      ta.manualOverrideWhileTabAudible = false;
      if (ta.isAutoPausedByTabAudio) {
        resumeAllFromTabAudioAutoPause();
      }
      return;
    }
    try {
      const audibleTabs = await browser.tabs.query({ audible: true });
      const rawExternalAudible = (audibleTabs || []).filter((t) => Boolean(t && t.audible && isExternalBrowserTab(t)));
      const rawAudibleIdSet = new Set(rawExternalAudible.map((t) => t.id).filter((id) => typeof id === 'number'));

      if (ta.audibleOverrideTabIds.size > 0) {
        Array.from(ta.audibleOverrideTabIds).forEach((id) => {
          if (!rawAudibleIdSet.has(id) && !ta.knownActiveMediaTabIds.has(id)) {
            ta.audibleOverrideTabIds.delete(id);
          }
        });
        if (ta.audibleOverrideTabIds.size === 0) {
          ta.manualOverrideWhileTabAudible = false;
        }
      }

      const externalAudible = [];
      for (let i = 0; i < rawExternalAudible.length; i++) {
        const t = rawExternalAudible[i];
        const tid = t.id;
        if (ta.manualOverrideWhileTabAudible && typeof tid === 'number' && ta.audibleOverrideTabIds.has(tid)) {
          ta.silentTabHoldSince.delete(tid);
          continue;
        }
        const stoppedAt = typeof tid === 'number' ? ta.recentlyStoppedMediaTabMap.get(tid) || 0 : 0;
        if (stoppedAt && Date.now() - stoppedAt >= 30000) {
          ta.recentlyStoppedMediaTabMap.delete(tid);
          ta.lastLoggedDrainIgnoreMap.delete(tid);
        } else if (stoppedAt && Date.now() - stoppedAt < 30000) {
          const mediaCheck = await Promise.race([
            browser.tabs.sendMessage(tid, { type: 'CHECK_TAB_HAS_ACTIVE_MEDIA' }).catch(() => null),
            new Promise((resolve) => setTimeout(() => resolve(null), 220))
          ]);
          if (!(mediaCheck && mediaCheck.hasActiveMedia)) {
            ta.knownActiveMediaTabIds.delete(tid);
            ta.silentTabHoldSince.delete(tid);
            if (ta.lastLoggedDrainIgnoreMap.get(tid) !== stoppedAt) {
              ta.lastLoggedDrainIgnoreMap.set(tid, stoppedAt);
              bg.logAudioDiag('tab-audible-drain-ignored', {
                tabId: tid,
                msSinceStopped: Date.now() - stoppedAt
              });
            }
            continue;
          }
          ta.recentlyStoppedMediaTabMap.delete(tid);
          ta.lastLoggedDrainIgnoreMap.delete(tid);
        }
        externalAudible.push(t);
      }

      externalAudible.forEach((t) => {
        if (typeof t.id === 'number') {
          ta.knownActiveMediaTabIds.add(t.id);
          ta.recentlyStoppedMediaTabMap.delete(t.id);
          ta.silentTabHoldSince.delete(t.id);
        }
      });

      const getEffectiveKnownMediaIds = () =>
        Array.from(ta.knownActiveMediaTabIds).filter(
          (tid) => !(ta.manualOverrideWhileTabAudible && ta.audibleOverrideTabIds.has(tid))
        );

      const effectiveKnownBeforeCheck = getEffectiveKnownMediaIds();
      if (externalAudible.length === 0 && effectiveKnownBeforeCheck.length > 0) {
        const nowHold = Date.now();
        for (let i = 0; i < effectiveKnownBeforeCheck.length; i++) {
          const tid = effectiveKnownBeforeCheck[i];
          const holdStart = ta.silentTabHoldSince.get(tid) || 0;
          if (!holdStart) {
            ta.silentTabHoldSince.set(tid, nowHold);
            bg.logAudioDiag('tab-hold-started', { tabId: tid, holdStart: nowHold });
          } else if (nowHold - holdStart > 4200) {
            bg.logAudioDiag('tab-hold-expired', { tabId: tid, heldMs: nowHold - holdStart, maxHoldMs: 4200 });
            ta.knownActiveMediaTabIds.delete(tid);
            ta.silentTabHoldSince.delete(tid);
            ta.audibleOverrideTabIds.delete(tid);
            continue;
          }
          const tabInfo = await browser.tabs.get(tid).catch(() => null);
          if (!isExternalBrowserTab(tabInfo)) {
            ta.knownActiveMediaTabIds.delete(tid);
            ta.silentTabHoldSince.delete(tid);
            ta.audibleOverrideTabIds.delete(tid);
            continue;
          }
          const mediaCheck = await Promise.race([
            browser.tabs.sendMessage(tid, { type: 'CHECK_TAB_HAS_ACTIVE_MEDIA' }).catch(() => null),
            new Promise((resolve) => setTimeout(() => resolve(null), 220))
          ]);
          if (!(mediaCheck && mediaCheck.hasActiveMedia)) {
            ta.knownActiveMediaTabIds.delete(tid);
            ta.silentTabHoldSince.delete(tid);
            ta.audibleOverrideTabIds.delete(tid);
          }
        }
      }

      const effectiveKnownAfterCheck = getEffectiveKnownMediaIds();
      const hasActiveExternalMedia = externalAudible.length > 0 || effectiveKnownAfterCheck.length > 0;

      if (hasActiveExternalMedia) {
        if (ta.pendingTabResumeTimer) {
          clearTimeout(ta.pendingTabResumeTimer);
          ta.pendingTabResumeTimer = null;
          bg.logAudioDiag('tab-resume-cancelled');
        }
        const anyBgStillAudible = Boolean(bg.getAudibleBgAudioAppId());
        let anySpUnmutedOrPlaying = false;
        bg.bgSpEmePlayers.forEach((sp) => {
          if (sp && !sp.disposed && sp.videoEl && (!sp.videoEl.paused || !sp.videoEl.muted)) {
            anySpUnmutedOrPlaying = true;
          }
        });
        if (!ta.isAutoPausedByTabAudio || anyBgStillAudible || anySpUnmutedOrPlaying) {
          pauseAllForTabAudioAutoPause(behavior === 'pause-only');
        }
        if (externalAudible.length === 0 && effectiveKnownAfterCheck.length > 0) {
          ta.silentMediaRecheckTimer = setTimeout(checkExternalTabAudioState, 1200);
        }
      } else {
        if (rawExternalAudible.length === 0 && ta.knownActiveMediaTabIds.size === 0) {
          ta.manualOverrideWhileTabAudible = false;
          ta.audibleOverrideTabIds.clear();
        }
        if (ta.isAutoPausedByTabAudio) {
          if (behavior === 'pause-only') {
            if (ta.pendingTabResumeTimer) {
              clearTimeout(ta.pendingTabResumeTimer);
              ta.pendingTabResumeTimer = null;
              bg.logAudioDiag('tab-resume-cancelled');
            }
            setTabAudioPauseTrigger(false, true);
            ta.tabAutoPausedSpAppIds.clear();
            ta.tabAutoPausedMseAppIds.clear();
            bg.refreshBgAudioIndicator();
          } else if (!ta.pendingTabResumeTimer) {
            bg.logAudioDiag('tab-resume-scheduled', { debounceMs: 340 });
            ta.pendingTabResumeTimer = setTimeout(() => {
              ta.pendingTabResumeTimer = null;
              const stillOverriddenOrEmpty =
                Array.from(ta.knownActiveMediaTabIds).filter(
                  (tid) => !(ta.manualOverrideWhileTabAudible && ta.audibleOverrideTabIds.has(tid))
                ).length === 0;
              if (ta.isAutoPausedByTabAudio && stillOverriddenOrEmpty) {
                resumeAllFromTabAudioAutoPause();
              }
            }, 340);
          }
        }
      }
    } catch (_) {}
  }

  setInterval(() => {
    const now = Date.now();
    bg.bgSpEmePlayers.forEach((sp) => {
      if (!sp || sp.disposed || !sp.videoEl) return;
      if (!sp.videoEl.paused) {
        const ct = Number(sp.videoEl.currentTime) || 0;
        if (Math.abs(ct - (sp.lastObservedCt || 0)) > 0.02) {
          sp.lastObservedCt = ct;
          sp.lastTimeAdvanceAt = now;
        } else if (
          sp.appId === 'spotify' &&
          !sp.isStaging &&
          !sp.remotePaused &&
          !sp.explicitUserPause &&
          !isTabAutoPauseEnforced()
        ) {
          const bufEnd = bg.getSpBufferedEnd(sp);
          const nearTrackEnd =
            bufEnd > 2 && (bufEnd - ct <= 0.08 || (sp.trackDuration > 10 && ct >= sp.trackDuration - 0.5));
          const timeStalled = sp.lastTimeAdvanceAt > 0 && now - sp.lastTimeAdvanceAt > 1400;

          if (nearTrackEnd && timeStalled && bg.bgNextSpPlayers.has(sp.appId)) {
            const nextSp = bg.bgNextSpPlayers.get(sp.appId);
            if (
              nextSp &&
              !nextSp.disposed &&
              (nextSp.isClear || nextSp.hasLicense || (nextSp.createdAt > 0 && now - nextSp.createdAt > 6000))
            ) {
              bg.logAudioDiag('watchdog-promote-next-player', {
                appId: sp.appId,
                sourceType: sp.sourceType,
                ct: Math.round(ct * 100) / 100,
                bufEnd: Math.round(bufEnd * 100) / 100,
                trackDuration: Math.round((sp.trackDuration || 0) * 100) / 100
              });
              bg.promoteNextSpPlayer(sp.appId, 0);
              return;
            }
          }

          if (bufEnd > 2 && bufEnd - ct <= 0.04 && sp.lastTimeAdvanceAt > 0 && now - sp.lastTimeAdvanceAt > 2800) {
            bg.refreshBgAudioIndicator();
            if (!sp.lastStarveNudgeAt || now - sp.lastStarveNudgeAt > 12000) {
              sp.lastStarveNudgeAt = now;
              bg.logAudioDiag('buffer-starved-nudge', {
                ct: Math.round(ct * 100) / 100,
                bufEnd: Math.round(bufEnd * 100) / 100,
                sourceType: sp.sourceType,
                bgPool: bg.bgAudioPool.has('spotify')
              });
              const targetSource = sp.sourceType || 'sidebar';
              const directPort = bg.emeBridgePorts.get(`${targetSource}:spotify`) || bg.emeBridgePorts.get('sidebar:spotify');
              if (directPort) {
                try {
                  directPort.postMessage({ cmd: 'RESUME_BG_SP_MEDIA' });
                } catch (_) {}
              }
              if (targetSource === 'sidebar') {
                browser.runtime.sendMessage({ type: 'PM_RESUME_SIDEBAR_SP', appId: 'spotify' }).catch(() => {});
              }
              if (bg.bgAudioPool.has('spotify')) {
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
            }
          }
        }
      }
    });
    if (isTabAutoPauseEnforced()) {
      bg.bgSpEmePlayers.forEach((sp) => {
        if (sp && !sp.disposed && sp.videoEl) {
          sp.videoEl.muted = true;
          if (!sp.videoEl.paused) {
            try {
              sp.lastPauseTrigger = 'tab-auto-pause-enforced';
              sp.videoEl.pause();
            } catch (_) {}
          }
        }
      });
      bg.bgMsePlayers.forEach((player) => {
        if (player && player.audioEl) {
          player.audioEl.muted = true;
          if (!player.audioEl.paused) {
            try {
              player.audioEl.pause();
            } catch (_) {}
          }
        }
      });
    }
    const hasAnyBgAudioOrAutoPaused =
      ta.isAutoPausedByTabAudio ||
      bg.bgAudioPool.size > 0 ||
      bg.bgSpEmePlayers.size > 0 ||
      bg.bgMsePlayers.size > 0;
    if (hasAnyBgAudioOrAutoPaused && getTabAudioBehavior() !== 'off') {
      if (now - bg.state.lastWatchdogTabPollAt >= 900) {
        bg.state.lastWatchdogTabPollAt = now;
        checkExternalTabAudioState();
      }
    }
  }, 450);

  if (browser.tabs && browser.tabs.onUpdated) {
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.audible === true && isExternalBrowserTab(tab)) {
        ta.knownActiveMediaTabIds.add(tabId);
        ta.recentlyStoppedMediaTabMap.delete(tabId);
        if (ta.pendingTabResumeTimer) {
          clearTimeout(ta.pendingTabResumeTimer);
          ta.pendingTabResumeTimer = null;
          bg.logAudioDiag('tab-resume-cancelled');
        }
        if (!ta.audibleOverrideTabIds.has(tabId)) {
          ta.manualOverrideWhileTabAudible = false;
          ta.audibleOverrideTabIds.clear();
        }
      }
      if (changeInfo.audible === false) {
        ta.knownActiveMediaTabIds.delete(tabId);
        ta.silentTabHoldSince.delete(tabId);
        ta.audibleOverrideTabIds.delete(tabId);
        ta.recentlyStoppedMediaTabMap.set(tabId, Date.now());
        if (ta.audibleOverrideTabIds.size === 0) {
          ta.manualOverrideWhileTabAudible = false;
        }
      }
      if (changeInfo.mutedInfo && changeInfo.mutedInfo.muted) {
        ta.knownActiveMediaTabIds.delete(tabId);
        ta.recentlyStoppedMediaTabMap.delete(tabId);
        ta.audibleOverrideTabIds.delete(tabId);
      }
      if (changeInfo.status === 'loading' && changeInfo.url) {
        ta.knownActiveMediaTabIds.delete(tabId);
        ta.recentlyStoppedMediaTabMap.delete(tabId);
      }
      if (
        changeInfo.audible !== undefined ||
        changeInfo.mutedInfo !== undefined ||
        (changeInfo.status === 'complete' && tab && tab.audible)
      ) {
        checkExternalTabAudioState();
      }
    });
  }

  if (browser.tabs && browser.tabs.onActivated) {
    browser.tabs.onActivated.addListener(() => {
      checkExternalTabAudioState();
    });
  }

  if (browser.tabs && browser.tabs.onCreated) {
    browser.tabs.onCreated.addListener((tab) => {
      if (tab && typeof tab.id === 'number' && bg.companionWindowIds.has(tab.windowId) && bg.companionTabIds) {
        bg.companionTabIds.add(tab.id);
      }
    });
  }

  if (browser.tabs && browser.tabs.onRemoved) {
    browser.tabs.onRemoved.addListener((tabId) => {
      if (bg.companionTabIds) bg.companionTabIds.delete(tabId);
      ta.knownActiveMediaTabIds.delete(tabId);
      ta.recentlyStoppedMediaTabMap.delete(tabId);
      ta.audibleOverrideTabIds.delete(tabId);
      setTimeout(checkExternalTabAudioState, 60);
    });
  }

  bg.setTabAudioPauseTrigger = setTabAudioPauseTrigger;
  bg.isExternalBrowserTab = isExternalBrowserTab;
  bg.getTabAudioBehavior = getTabAudioBehavior;
  bg.isTabAutoPauseEnforced = isTabAutoPauseEnforced;
  bg.pauseAllForTabAudioAutoPause = pauseAllForTabAudioAutoPause;
  bg.resumeAllFromTabAudioAutoPause = resumeAllFromTabAudioAutoPause;
  bg.checkExternalTabAudioState = checkExternalTabAudioState;
})(window);
