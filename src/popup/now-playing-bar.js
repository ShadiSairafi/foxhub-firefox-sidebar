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
    }
    return svg;
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

  function updateProgressBarOnly() {
    const fillEl = document.getElementById('pm-np-progress-fill');
    if (!fillEl || !lastNpSnapshot) return;
    const dur = Number(lastNpSnapshot.duration) || 0;
    if (dur <= 0) {
      fillEl.style.width = '0%';
      return;
    }
    const elapsedSec = lastNpSnapshot.isPlaying
      ? Math.max(0, (Date.now() - (lastNpSnapshot.updatedAt || Date.now())) / 1000)
      : 0;
    const displayTime = Math.min(dur, (Number(lastNpSnapshot.currentTime) || 0) + elapsedSec);
    const pct = Math.min(100, Math.max(0, (displayTime / dur) * 100));
    fillEl.style.width = `${pct.toFixed(1)}%`;
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

    if (s.miniNowPlayingAutoHidePaused !== false && !np.isPlaying) {
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
    barEl.style.setProperty('--np-accent', np.color || '#1DB954');
    barEl.classList.remove('hidden');

    const trackEl = document.getElementById('pm-np-progress-track');
    const showProgress = s.miniNowPlayingShowProgress !== false;
    trackEl?.classList.toggle('hidden', !showProgress);
    if (showProgress) updateProgressBarOnly();

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
      const np = lastNpSnapshot || P.getResolvedNowPlayingState?.();
      if (np && np.appId) P.sendNowPlayingCommand?.(np.appId, 'prev');
    });
    document.getElementById('pm-np-playpause')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const np = lastNpSnapshot || P.getResolvedNowPlayingState?.();
      if (np && np.appId) P.sendNowPlayingCommand?.(np.appId, 'play_pause');
    });
    document.getElementById('pm-np-next')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const np = lastNpSnapshot || P.getResolvedNowPlayingState?.();
      if (np && np.appId) P.sendNowPlayingCommand?.(np.appId, 'next');
    });
  };
})(typeof window !== 'undefined' ? window : this);
