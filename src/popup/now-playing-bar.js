/**
 * FoxHub — Mini "Now Playing" Bar (Opera GX / Arc Style)
 * Pure DOM + createElementNS SVG controls, obeying all 5 miniNowPlaying* settings.
 */

(function (global) {
  const P = (global.FoxHubPopup = global.FoxHubPopup || {});
  const SVG_NS = 'http://www.w3.org/2000/svg';

  let progressTimer = null;
  let lastNpSnapshot = null;
  let lastRenderedArtKey = '';
  let isScrubbing = false;
  let scrubPreviewTime = 0;
  let isVolScrubbing = false;
  let lastNonZeroVolume = 1.0;
  let lastVolDispatchAt = 0;
  let lastUserVolAt = 0;
  let lastUserVolValue = 1.0;
  let lastUserVolMuted = false;
  let dismissedPausedAppId = '';
  let lastUserScrubAt = 0;
  let lastUserScrubTargetSec = 0;
  let lastUserScrubAppId = '';

  function formatClockSec(sec) {
    const safe = Math.max(0, Math.floor(Number(sec) || 0));
    const hrs = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    const ss = secs < 10 ? `0${secs}` : String(secs);
    if (hrs > 0) {
      const mm = mins < 10 ? `0${mins}` : String(mins);
      return `${hrs}:${mm}:${ss}`;
    }
    return `${mins}:${ss}`;
  }

  function createNpSvg(type, size = 13) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const el = (tag, attrs) => {
      const n = document.createElementNS(SVG_NS, tag);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
      return n;
    };

    if (type === 'play') {
      svg.appendChild(el('polygon', { points: '6 4 20 12 6 20 6 4', fill: 'currentColor', stroke: 'none' }));
    } else if (type === 'pause') {
      svg.appendChild(el('rect', { x: 6, y: 4, width: 4, height: 16, rx: 1, fill: 'currentColor', stroke: 'none' }));
      svg.appendChild(el('rect', { x: 14, y: 4, width: 4, height: 16, rx: 1, fill: 'currentColor', stroke: 'none' }));
    } else if (type === 'prev') {
      svg.appendChild(el('polygon', { points: '19 20 9 12 19 4 19 20', fill: 'currentColor', stroke: 'none' }));
      svg.appendChild(el('line', { x1: 5, y1: 19, x2: 5, y2: 5 }));
    } else if (type === 'next') {
      svg.appendChild(el('polygon', { points: '5 4 15 12 5 20 5 4', fill: 'currentColor', stroke: 'none' }));
      svg.appendChild(el('line', { x1: 19, y1: 5, x2: 19, y2: 19 }));
    } else if (type === 'close') {
      svg.appendChild(el('line', { x1: 18, y1: 6, x2: 6, y2: 18 }));
      svg.appendChild(el('line', { x1: 6, y1: 6, x2: 18, y2: 18 }));
    } else if (type === 'vol-muted') {
      svg.appendChild(el('polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5', fill: 'currentColor', stroke: 'none' }));
      svg.appendChild(el('line', { x1: 22, y1: 9, x2: 16, y2: 15 }));
      svg.appendChild(el('line', { x1: 16, y1: 9, x2: 22, y2: 15 }));
    } else if (type === 'vol-low') {
      svg.appendChild(el('polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5', fill: 'currentColor', stroke: 'none' }));
      svg.appendChild(el('path', { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' }));
    } else if (type === 'vol-high') {
      svg.appendChild(el('polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5', fill: 'currentColor', stroke: 'none' }));
      svg.appendChild(el('path', { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' }));
      svg.appendChild(el('path', { d: 'M19.07 4.93a10 10 0 0 1 0 14.14' }));
    }
    return svg;
  }

  function setVisualVolume(vol, muted) {
    const safeVol = Math.min(1, Math.max(0, Number.isFinite(Number(vol)) ? Number(vol) : 1.0));
    const isMuted = Boolean(muted || safeVol <= 0.001);
    if (!isMuted && safeVol > 0.02) {
      lastNonZeroVolume = safeVol;
    }
    const displayPct = isMuted ? 0 : Math.round(safeVol * 100);
    const volBtn = document.getElementById('pm-np-vol-btn');
    const sliderEl = document.getElementById('pm-np-vol-slider');
    const fillEl = document.getElementById('pm-np-vol-fill');
    const thumbEl = document.getElementById('pm-np-vol-thumb');
    if (fillEl) fillEl.style.width = `${displayPct}%`;
    if (thumbEl) thumbEl.style.left = `${displayPct}%`;
    if (sliderEl) {
      sliderEl.setAttribute('aria-valuenow', String(displayPct));
      sliderEl.setAttribute('aria-valuetext', isMuted ? 'Muted (0%)' : `${displayPct}%`);
    }
    if (volBtn) {
      const iconKind = isMuted ? 'vol-muted' : displayPct <= 50 ? 'vol-low' : 'vol-high';
      if (volBtn.dataset.iconState !== iconKind) {
        volBtn.dataset.iconState = iconKind;
        volBtn.replaceChildren(createNpSvg(iconKind, 13));
      }
      volBtn.classList.toggle('is-muted', isMuted);
      volBtn.title = isMuted ? 'Unmute (0%)' : `Mute (${displayPct}%) · Scroll wheel to adjust`;
      volBtn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
    }
  }

  function commitVolume(vol, mutedOverride = null, forceSend = false) {
    const np = lastNpSnapshot || P.getResolvedNowPlayingState?.();
    if (!np || !np.appId) return;
    const clampedVol = Math.round(Math.min(1, Math.max(0, Number(vol) || 0)) * 100) / 100;
    const wantMuted = typeof mutedOverride === 'boolean' ? mutedOverride : clampedVol <= 0.001;
    if (!wantMuted && clampedVol > 0.02) {
      lastNonZeroVolume = clampedVol;
    }
    lastUserVolAt = Date.now();
    lastUserVolValue = clampedVol;
    lastUserVolMuted = wantMuted;
    if (lastNpSnapshot) {
      lastNpSnapshot = {
        ...lastNpSnapshot,
        volume: clampedVol,
        muted: wantMuted
      };
    }
    setVisualVolume(clampedVol, wantMuted);
    const now = Date.now();
    if (!forceSend && now - lastVolDispatchAt < 45) return;
    lastVolDispatchAt = now;
    P.sendNowPlayingCommand?.(np.appId, 'set_volume', { volume: clampedVol, muted: wantMuted });
  }

  function stopProgressTicker() {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  function isOverlayDrawerOpen() {
    const d = P.dom;
    return [d.readerDrawer, d.themeDrawer, d.accountDrawer, d.composeDrawer, d.mediaAppsDrawer].some(
      (el) => el && !el.classList.contains('hidden')
    );
  }

  function setVisualProgress(pct, currentSec = 0, durationSec = 0) {
    const trackEl = document.getElementById('pm-np-progress-track');
    const fillEl = document.getElementById('pm-np-progress-fill');
    const thumbEl = document.getElementById('pm-np-progress-thumb');
    const clampedPct = Math.min(100, Math.max(0, Number(pct) || 0));
    if (fillEl) fillEl.style.width = `${clampedPct.toFixed(1)}%`;
    if (thumbEl) thumbEl.style.left = `${clampedPct.toFixed(1)}%`;
    if (trackEl) {
      trackEl.setAttribute('data-seekable', durationSec > 0 ? '1' : '0');
      trackEl.setAttribute('aria-valuemax', String(Math.max(0, Math.floor(durationSec))));
      trackEl.setAttribute('aria-valuenow', String(Math.max(0, Math.floor(currentSec))));
      trackEl.setAttribute(
        'aria-valuetext',
        durationSec > 0 ? `${formatClockSec(currentSec)} of ${formatClockSec(durationSec)}` : 'Unavailable'
      );
    }
  }

  function updateProgressBarOnly() {
    if (isScrubbing) return;
    if (!lastNpSnapshot) return;
    const dur = Number(lastNpSnapshot.duration) || 0;
    const hasRecentScrub = Boolean(
      lastUserScrubAt > 0 &&
        Date.now() - lastUserScrubAt < 2200 &&
        lastUserScrubAppId === lastNpSnapshot.appId
    );
    if (dur <= 0) {
      setVisualProgress(0, Number(lastNpSnapshot.currentTime) || 0, 0);
      return;
    }
    const baseTime = hasRecentScrub ? lastUserScrubTargetSec : Number(lastNpSnapshot.currentTime) || 0;
    const baseUpdatedAt = hasRecentScrub ? lastUserScrubAt : lastNpSnapshot.updatedAt || Date.now();
    const elapsedSec = lastNpSnapshot.isPlaying
      ? Math.max(0, (Date.now() - baseUpdatedAt) / 1000)
      : 0;
    const displayTime = Math.min(dur, baseTime + elapsedSec);
    const pct = Math.min(100, Math.max(0, (displayTime / dur) * 100));
    setVisualProgress(pct, displayTime, dur);
  }

  function commitSeekToSeconds(targetSec) {
    const np = lastNpSnapshot || P.getResolvedNowPlayingState?.();
    if (!np || !np.appId) return;
    const dur = Number(np.duration) || 0;
    if (dur <= 0) return;
    const clampedSec = Math.min(Math.max(0, Number(targetSec) || 0), Math.max(0, dur - 0.5));
    const pct = (clampedSec / dur) * 100;
    lastUserScrubAt = Date.now();
    lastUserScrubTargetSec = clampedSec;
    lastUserScrubAppId = np.appId;
    if (lastNpSnapshot) {
      lastNpSnapshot = {
        ...lastNpSnapshot,
        currentTime: clampedSec,
        updatedAt: lastUserScrubAt
      };
    }
    setVisualProgress(pct, clampedSec, dur);
    P.sendNowPlayingCommand?.(np.appId, 'seek', { seekTime: clampedSec });
  }

  P.renderNowPlayingBar = function () {
    const st = P.state;
    const s = st.appSettings;
    const barEl = document.getElementById('pm-mini-now-playing');
    if (!barEl) return;

    if (s.miniNowPlayingEnabled === false) {
      barEl.classList.add('hidden');
      stopProgressTicker();
      P.syncSettingsGearCoachmarkPosition?.();
      return;
    }

    const np = P.getResolvedNowPlayingState?.();
    if (!np) {
      barEl.classList.add('hidden');
      stopProgressTicker();
      P.syncSettingsGearCoachmarkPosition?.();
      return;
    }

    if (np.isPlaying) {
      dismissedPausedAppId = '';
    } else if (dismissedPausedAppId && dismissedPausedAppId === np.appId) {
      barEl.classList.add('hidden');
      stopProgressTicker();
      P.syncSettingsGearCoachmarkPosition?.();
      return;
    }

    if (s.miniNowPlayingAutoHidePaused === true && !np.isPlaying) {
      barEl.classList.add('hidden');
      stopProgressTicker();
      P.syncSettingsGearCoachmarkPosition?.();
      return;
    }

    const mediaWs = P.dom.mediaWorkspace;
    const isViewingSameApp =
      st.activeRailAppId === np.appId &&
      mediaWs &&
      !mediaWs.classList.contains('hidden') &&
      !mediaWs.classList.contains('pm-workspace-keepalive') &&
      !isOverlayDrawerOpen();

    if (isViewingSameApp) {
      barEl.classList.add('hidden');
      stopProgressTicker();
      P.syncSettingsGearCoachmarkPosition?.();
      return;
    }

    lastNpSnapshot = np;

    const appRoot = document.getElementById('pm-app-root');
    const pos = s.miniNowPlayingPosition === 'top' ? 'top' : 'bottom';
    if (appRoot) appRoot.setAttribute('data-np-position', pos);

    barEl.classList.toggle('is-compact', Boolean(s.miniNowPlayingCompact));
    barEl.classList.toggle('is-paused', !np.isPlaying);
    barEl.style.setProperty('--np-accent', np.color || '#1DB954');
    barEl.classList.remove('hidden');

    const trackEl = document.getElementById('pm-np-progress-track');
    const showProgress = s.miniNowPlayingShowProgress !== false;
    trackEl?.classList.toggle('hidden', !showProgress);
    if (showProgress) updateProgressBarOnly();

    if (!isVolScrubbing) {
      const useOptimisticVol = lastUserVolAt > 0 && Date.now() - lastUserVolAt < 1000;
      const effVol = useOptimisticVol
        ? lastUserVolValue
        : typeof np.volume === 'number' && Number.isFinite(np.volume)
          ? np.volume
          : 1.0;
      const effMuted = useOptimisticVol ? lastUserVolMuted : Boolean(np.muted);
      setVisualVolume(effVol, effMuted);
    }

    const artEl = document.getElementById('pm-np-art');
    const artKey = `${np.appId}|${np.artworkUrl || ''}`;
    if (artEl && lastRenderedArtKey !== artKey) {
      lastRenderedArtKey = artKey;
      artEl.style.background = np.color || '#1DB954';
      const setFallbackIcon = () => {
        const appsApi = P.getAppsApi();
        if (appsApi) {
          artEl.replaceChildren(appsApi.createAppSvgIcon(np.appId, 14));
        } else {
          artEl.textContent = (np.appName || '♪').slice(0, 1);
        }
      };
      if (np.artworkUrl && /^https?:\/\//i.test(np.artworkUrl)) {
        const img = document.createElement('img');
        img.src = np.artworkUrl;
        img.alt = '';
        img.addEventListener('error', setFallbackIcon);
        artEl.replaceChildren(img);
      } else {
        setFallbackIcon();
      }
    }

    const titleEl = document.getElementById('pm-np-title');
    const artistEl = document.getElementById('pm-np-artist');
    if (titleEl) titleEl.textContent = np.title || np.appName || 'Playing Audio';
    if (artistEl) artistEl.textContent = np.artist || np.appName || '';

    const jumpBtn = document.getElementById('pm-np-jump');
    if (jumpBtn) jumpBtn.title = `Switch to ${np.appName || np.appId}`;

    const prevBtn = document.getElementById('pm-np-prev');
    const playBtn = document.getElementById('pm-np-playpause');
    const nextBtn = document.getElementById('pm-np-next');
    const closeBtn = document.getElementById('pm-np-close');
    if (prevBtn) {
      prevBtn.disabled = np.canPrev === false;
      if (!prevBtn.hasChildNodes()) prevBtn.appendChild(createNpSvg('prev', 12));
    }
    if (nextBtn) {
      nextBtn.disabled = np.canNext === false;
      if (!nextBtn.hasChildNodes()) nextBtn.appendChild(createNpSvg('next', 12));
    }
    if (playBtn) {
      const wanted = np.isPlaying ? 'pause' : 'play';
      if (playBtn.dataset.iconState !== wanted) {
        playBtn.dataset.iconState = wanted;
        playBtn.replaceChildren(createNpSvg(wanted, 13));
      }
      playBtn.title = np.isPlaying ? 'Pause' : 'Play';
    }
    if (closeBtn) {
      if (!closeBtn.hasChildNodes()) closeBtn.appendChild(createNpSvg('close', 12));
      closeBtn.classList.toggle('hidden', Boolean(np.isPlaying));
    }

    stopProgressTicker();
    if (showProgress && np.isPlaying && (Number(np.duration) || 0) > 0) {
      progressTimer = setInterval(updateProgressBarOnly, 1000);
    }
    P.syncSettingsGearCoachmarkPosition?.();
  };

  P.bindNowPlayingEvents = function () {
    document.getElementById('pm-np-jump')?.addEventListener('click', () => {
      const np = lastNpSnapshot || P.getResolvedNowPlayingState?.();
      if (np && np.appId) P.activateAppDirectlyById?.(np.appId);
    });
    document.getElementById('pm-np-prev')?.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissedPausedAppId = '';
      const np = lastNpSnapshot || P.getResolvedNowPlayingState?.();
      if (np && np.appId) P.sendNowPlayingCommand?.(np.appId, 'prev');
    });
    document.getElementById('pm-np-playpause')?.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissedPausedAppId = '';
      const np = lastNpSnapshot || P.getResolvedNowPlayingState?.();
      if (np && np.appId) P.sendNowPlayingCommand?.(np.appId, 'play_pause');
    });
    document.getElementById('pm-np-next')?.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissedPausedAppId = '';
      const np = lastNpSnapshot || P.getResolvedNowPlayingState?.();
      if (np && np.appId) P.sendNowPlayingCommand?.(np.appId, 'next');
    });
    document.getElementById('pm-np-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const np = lastNpSnapshot || P.getResolvedNowPlayingState?.();
      if (np && !np.isPlaying && np.appId) {
        dismissedPausedAppId = np.appId;
        const barEl = document.getElementById('pm-mini-now-playing');
        barEl?.classList.add('hidden');
        stopProgressTicker();
        P.syncSettingsGearCoachmarkPosition?.();
      }
    });

    const trackEl = document.getElementById('pm-np-progress-track');
    const tooltipEl = document.getElementById('pm-np-seek-tooltip');
    if (trackEl) {
      const computeSeekAtClientX = (clientX) => {
        const np = lastNpSnapshot || P.getResolvedNowPlayingState?.();
        const dur = Number(np?.duration) || 0;
        if (dur <= 0) return null;
        const rect = trackEl.getBoundingClientRect();
        if (!rect || rect.width <= 0) return null;
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        return { ratio, dur, targetSec: ratio * dur, rect };
      };

      const positionTooltip = (info) => {
        if (!tooltipEl || !info) return;
        tooltipEl.textContent = `${formatClockSec(info.targetSec)} / ${formatClockSec(info.dur)}`;
        tooltipEl.classList.remove('hidden');
        const clampedPct = Math.min(86, Math.max(14, info.ratio * 100));
        tooltipEl.style.left = `${clampedPct.toFixed(1)}%`;
      };

      const hideTooltip = () => {
        if (!isScrubbing && tooltipEl) {
          tooltipEl.classList.add('hidden');
        }
      };

      trackEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        const info = computeSeekAtClientX(e.clientX);
        if (!info) return;
        e.preventDefault();
        e.stopPropagation();
        isScrubbing = true;
        scrubPreviewTime = info.targetSec;
        trackEl.classList.add('is-scrubbing');
        try {
          trackEl.setPointerCapture(e.pointerId);
        } catch (_) {}
        setVisualProgress(info.ratio * 100, info.targetSec, info.dur);
        positionTooltip(info);
      });

      trackEl.addEventListener('pointermove', (e) => {
        const info = computeSeekAtClientX(e.clientX);
        if (!info) {
          hideTooltip();
          return;
        }
        positionTooltip(info);
        if (isScrubbing) {
          e.preventDefault();
          scrubPreviewTime = info.targetSec;
          setVisualProgress(info.ratio * 100, info.targetSec, info.dur);
        }
      });

      const finishScrub = (e, shouldCommit) => {
        if (!isScrubbing) return;
        const info = e && typeof e.clientX === 'number' ? computeSeekAtClientX(e.clientX) : null;
        const targetSec = info ? info.targetSec : scrubPreviewTime;
        isScrubbing = false;
        trackEl.classList.remove('is-scrubbing');
        try {
          if (e && e.pointerId !== undefined) trackEl.releasePointerCapture(e.pointerId);
        } catch (_) {}
        if (tooltipEl) tooltipEl.classList.add('hidden');
        if (shouldCommit) {
          commitSeekToSeconds(targetSec);
        } else {
          updateProgressBarOnly();
        }
      };

      trackEl.addEventListener('pointerup', (e) => finishScrub(e, true));
      trackEl.addEventListener('pointercancel', (e) => finishScrub(e, false));
      trackEl.addEventListener('pointerleave', hideTooltip);

      trackEl.addEventListener('keydown', (e) => {
        const np = lastNpSnapshot || P.getResolvedNowPlayingState?.();
        const dur = Number(np?.duration) || 0;
        if (dur <= 0) return;
        const elapsedSec = np.isPlaying
          ? Math.max(0, (Date.now() - (np.updatedAt || Date.now())) / 1000)
          : 0;
        const curSec = Math.min(dur, (Number(np.currentTime) || 0) + elapsedSec);
        let nextSec = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nextSec = curSec + 5;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nextSec = curSec - 5;
        else if (e.key === 'Home') nextSec = 0;
        else if (e.key === 'End') nextSec = Math.max(0, dur - 1);
        if (nextSec !== null) {
          e.preventDefault();
          e.stopPropagation();
          commitSeekToSeconds(nextSec);
        }
      });
    }

    // Volume button (mute/unmute), draggable slider, keyboard & scroll-wheel controls
    const volWrapEl = document.getElementById('pm-np-vol-wrap');
    const volBtnEl = document.getElementById('pm-np-vol-btn');
    const volSliderEl = document.getElementById('pm-np-vol-slider');
    const volTooltipEl = document.getElementById('pm-np-vol-tooltip');

    volBtnEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      const np = lastNpSnapshot || P.getResolvedNowPlayingState?.();
      if (!np || !np.appId) return;
      const curMuted = Boolean(np.muted || (typeof np.volume === 'number' && np.volume <= 0.001));
      if (curMuted) {
        const restoreVol = lastNonZeroVolume > 0.05 ? lastNonZeroVolume : 0.8;
        commitVolume(restoreVol, false, true);
      } else {
        const curVol = typeof np.volume === 'number' && np.volume > 0.02 ? np.volume : lastNonZeroVolume;
        if (curVol > 0.02) lastNonZeroVolume = curVol;
        commitVolume(0, true, true);
      }
    });

    volWrapEl?.addEventListener(
      'wheel',
      (e) => {
        const np = lastNpSnapshot || P.getResolvedNowPlayingState?.();
        if (!np || !np.appId) return;
        e.preventDefault();
        e.stopPropagation();
        const curVol = np.muted ? 0 : typeof np.volume === 'number' ? np.volume : 1.0;
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        const nextVol = Math.min(1, Math.max(0, Math.round((curVol + delta) * 20) / 20));
        commitVolume(nextVol, nextVol <= 0.001, true);
      },
      { passive: false }
    );

    if (volSliderEl) {
      const computeVolAtClientX = (clientX) => {
        const rect = volSliderEl.getBoundingClientRect();
        if (!rect || rect.width <= 0) return null;
        return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      };

      const showVolTooltip = (ratio) => {
        if (!volTooltipEl || ratio === null) return;
        volTooltipEl.textContent = `${Math.round(ratio * 100)}%`;
        volTooltipEl.classList.remove('hidden');
      };

      const hideVolTooltip = () => {
        if (!isVolScrubbing && volTooltipEl) {
          volTooltipEl.classList.add('hidden');
        }
      };

      volSliderEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        const ratio = computeVolAtClientX(e.clientX);
        if (ratio === null) return;
        e.preventDefault();
        e.stopPropagation();
        isVolScrubbing = true;
        volSliderEl.classList.add('is-scrubbing');
        volWrapEl?.classList.add('is-vol-open');
        try {
          volSliderEl.setPointerCapture(e.pointerId);
        } catch (_) {}
        showVolTooltip(ratio);
        commitVolume(ratio, ratio <= 0.001, false);
      });

      volSliderEl.addEventListener('pointermove', (e) => {
        const ratio = computeVolAtClientX(e.clientX);
        if (ratio === null) return;
        showVolTooltip(ratio);
        if (isVolScrubbing) {
          e.preventDefault();
          commitVolume(ratio, ratio <= 0.001, false);
        }
      });

      const finishVolScrub = (e, shouldCommit) => {
        if (!isVolScrubbing) return;
        const ratio = e && typeof e.clientX === 'number' ? computeVolAtClientX(e.clientX) : lastUserVolValue;
        isVolScrubbing = false;
        volSliderEl.classList.remove('is-scrubbing');
        volWrapEl?.classList.remove('is-vol-open');
        try {
          if (e && e.pointerId !== undefined) volSliderEl.releasePointerCapture(e.pointerId);
        } catch (_) {}
        if (volTooltipEl) volTooltipEl.classList.add('hidden');
        if (shouldCommit && ratio !== null) {
          commitVolume(ratio, ratio <= 0.001, true);
        }
      };

      volSliderEl.addEventListener('pointerup', (e) => finishVolScrub(e, true));
      volSliderEl.addEventListener('pointercancel', (e) => finishVolScrub(e, false));
      volSliderEl.addEventListener('pointerleave', hideVolTooltip);

      volSliderEl.addEventListener('keydown', (e) => {
        const np = lastNpSnapshot || P.getResolvedNowPlayingState?.();
        if (!np || !np.appId) return;
        const curVol = np.muted ? 0 : typeof np.volume === 'number' ? np.volume : 1.0;
        let nextVol = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nextVol = Math.min(1, curVol + 0.05);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nextVol = Math.max(0, curVol - 0.05);
        else if (e.key === 'Home') nextVol = 0;
        else if (e.key === 'End') nextVol = 1;
        if (nextVol !== null) {
          e.preventDefault();
          e.stopPropagation();
          commitVolume(nextVol, nextVol <= 0.001, true);
        }
      });
    }
  };
})(typeof window !== 'undefined' ? window : this);
