/**
 * FoxHub Per-App Optimizer — Spotify
 * Preserves Widevine DRM prompt, zero-reload Library/Search view switching,
 * 1300ms double-click Play debounce, Connect takeover, and rich metadata.
 */

export function initOptimizer(ctx) {
  const parseClockDuration = ctx?.parseClockDuration || (() => 0);
  let lastSpotifyAutoResumeClickAt = 0;
  let spHydratedWithoutLocalMediaSince = 0;
  let lastSpPlayBtnEl = null;
  let lastSpPlayBtnClickAt = 0;

  function clickSpotifyToggleOnce(wantPlaying) {
    const spToggle = document.querySelector('[data-testid="control-button-playpause"]');
    if (!spToggle || spToggle.disabled) return false;
    const aria = (spToggle.getAttribute('aria-label') || '').toLowerCase();
    const isPlayingUi = aria.includes('pause') || aria.includes('stop');
    const isPausedUi = !isPlayingUi && (aria.includes('play') || !aria || aria.length < 30);
    if (wantPlaying && !isPausedUi) return false;
    if (!wantPlaying && !isPlayingUi) return false;
    ctx.state.spAutoClickInFlight = true;
    try {
      spToggle.click();
      return true;
    } finally {
      setTimeout(() => {
        ctx.state.spAutoClickInFlight = false;
      }, 240);
    }
  }

  function clickSpotifyHomePlayButton() {
    const selectors = [
      '[data-testid="shortcut-item"] button[data-testid="play-button"]',
      '[data-testid="shortcut-item"] button[aria-label*="Play"]',
      'section[data-testid*="recently-played"] button[data-testid="play-button"]',
      'section[aria-label*="Recently played"] button[data-testid="play-button"]',
      'section[aria-label*="Jump back in"] button[data-testid="play-button"]',
      'section[aria-label*="Made for"] button[data-testid="play-button"]',
      '[data-testid="top-result-card"] button[data-testid="play-button"]',
      '[data-testid="card-click-handler"] button[data-testid="play-button"]',
      'main button[data-testid="play-button"]:not([disabled])',
      'main button[aria-label*="Play"]:not([disabled])'
    ];
    for (let i = 0; i < selectors.length; i++) {
      const btn = document.querySelector(selectors[i]);
      if (btn && !btn.disabled) {
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (!aria.includes('pause') && !aria.includes('stop')) {
          ctx.state.spAutoClickInFlight = true;
          try {
            btn.click();
            return true;
          } finally {
            setTimeout(() => {
              ctx.state.spAutoClickInFlight = false;
            }, 240);
          }
        }
      }
    }
    return false;
  }

  // Instant visual feedback & Widevine DRM detection banner
  (function setupSpotifyLoginAndDrmHelper() {
    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-testid="login-button"], button, a') : null;
        if (!btn) return;
        const text = (btn.textContent || '').trim().toLowerCase();
        const isLoginBtn =
          btn.getAttribute('data-testid') === 'login-button' ||
          text === 'log in' ||
          text === 'login' ||
          (btn.tagName === 'A' && (btn.getAttribute('href') || '').includes('accounts.spotify.com'));
        if (!isLoginBtn) return;

        btn.style.opacity = '0.72';
        btn.style.transform = 'scale(0.96)';
        const labelSpan = btn.querySelector('span') || btn;
        if (labelSpan && labelSpan.childNodes.length <= 2) {
          labelSpan.textContent = 'Opening Login…';
        }
        ctx.notifyParent('PM_FRAME_NAV_START', { title: 'Opening Spotify Login…' });

        const startHref = window.location.href;
        setTimeout(() => {
          if (window.location.href === startHref && !window.location.hostname.includes('accounts.spotify.com')) {
            window.location.href = `https://accounts.spotify.com/en/login?continue=${encodeURIComponent(startHref)}`;
          }
        }, 420);
      },
      true
    );

    if (ctx.host === 'open.spotify.com') {
      let drmVerifiedOk = false;
      let drmPollTimer = null;

      const probeWidevineDrm = async (timeoutMs = 3200) => {
        try {
          if (!navigator.requestMediaKeySystemAccess) return false;
          const checkPromise = navigator
            .requestMediaKeySystemAccess('com.widevine.alpha', [
              {
                initDataTypes: ['cenc'],
                audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }]
              }
            ])
            .then(() => true)
            .catch(() => false);
          const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
          return await Promise.race([checkPromise, timeoutPromise]);
        } catch (_) {
          return false;
        }
      };

      const showSpotifyDrmPrompt = async (pulseIfVisible = false) => {
        if (!document.body || drmVerifiedOk) return;
        const existing = document.getElementById('pm-spotify-drm-banner');
        if (existing) {
          if (pulseIfVisible) {
            existing.style.transform = 'scale(1.02)';
            existing.style.boxShadow = '0 0 0 2px #1ed760, 0 10px 28px rgba(0,0,0,0.8)';
            setTimeout(() => {
              existing.style.transform = 'scale(1)';
              existing.style.boxShadow = '0 8px 24px rgba(0,0,0,0.72)';
            }, 260);
          }
          return;
        }

        const isOk = await probeWidevineDrm(3200);
        if (isOk) {
          drmVerifiedOk = true;
          return;
        }
        if (document.getElementById('pm-spotify-drm-banner')) return;

        const SVG_NS = 'http://www.w3.org/2000/svg';
        const banner = document.createElement('div');
        banner.id = 'pm-spotify-drm-banner';
        banner.style.cssText =
          'position:fixed;bottom:78px;left:8px;right:8px;z-index:2147483640;background:#161616;border:1.5px solid #1ed760;border-radius:12px;padding:11px 12px;color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:11.5px;line-height:1.45;box-shadow:0 8px 24px rgba(0,0,0,0.72);display:flex;flex-direction:column;gap:8px;transition:transform 0.2s ease,box-shadow 0.2s ease;';

        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:8px;';

        const titleEl = document.createElement('div');
        titleEl.style.cssText =
          'font-weight:700;color:#1ed760;font-size:12.5px;display:inline-flex;align-items:center;gap:6px;';
        const musicSvg = document.createElementNS(SVG_NS, 'svg');
        musicSvg.setAttribute('width', '14');
        musicSvg.setAttribute('height', '14');
        musicSvg.setAttribute('viewBox', '0 0 24 24');
        musicSvg.setAttribute('fill', 'none');
        musicSvg.setAttribute('stroke', '#1ed760');
        musicSvg.setAttribute('stroke-width', '2.2');
        musicSvg.setAttribute('stroke-linecap', 'round');
        musicSvg.setAttribute('stroke-linejoin', 'round');
        const musicPath1 = document.createElementNS(SVG_NS, 'path');
        musicPath1.setAttribute('d', 'M9 18V5l12-2v13');
        const musicCircle1 = document.createElementNS(SVG_NS, 'circle');
        musicCircle1.setAttribute('cx', '6');
        musicCircle1.setAttribute('cy', '18');
        musicCircle1.setAttribute('r', '3');
        const musicCircle2 = document.createElementNS(SVG_NS, 'circle');
        musicCircle2.setAttribute('cx', '18');
        musicCircle2.setAttribute('cy', '16');
        musicCircle2.setAttribute('r', '3');
        musicSvg.appendChild(musicPath1);
        musicSvg.appendChild(musicCircle1);
        musicSvg.appendChild(musicCircle2);
        titleEl.appendChild(musicSvg);
        titleEl.appendChild(document.createTextNode('Enable Firefox DRM to Play Music'));

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.title = 'Dismiss';
        closeBtn.style.cssText =
          'background:transparent;border:none;color:#aaa;cursor:pointer;padding:2px 4px;line-height:1;display:inline-flex;align-items:center;justify-content:center;';
        const closeSvg = document.createElementNS(SVG_NS, 'svg');
        closeSvg.setAttribute('width', '13');
        closeSvg.setAttribute('height', '13');
        closeSvg.setAttribute('viewBox', '0 0 24 24');
        closeSvg.setAttribute('fill', 'none');
        closeSvg.setAttribute('stroke', 'currentColor');
        closeSvg.setAttribute('stroke-width', '2.4');
        closeSvg.setAttribute('stroke-linecap', 'round');
        closeSvg.setAttribute('stroke-linejoin', 'round');
        const closeLine1 = document.createElementNS(SVG_NS, 'line');
        closeLine1.setAttribute('x1', '18');
        closeLine1.setAttribute('y1', '6');
        closeLine1.setAttribute('x2', '6');
        closeLine1.setAttribute('y2', '18');
        const closeLine2 = document.createElementNS(SVG_NS, 'line');
        closeLine2.setAttribute('x1', '6');
        closeLine2.setAttribute('y1', '6');
        closeLine2.setAttribute('x2', '18');
        closeLine2.setAttribute('y2', '18');
        closeSvg.appendChild(closeLine1);
        closeSvg.appendChild(closeLine2);
        closeBtn.appendChild(closeSvg);
        closeBtn.addEventListener('click', () => {
          if (drmPollTimer) {
            clearInterval(drmPollTimer);
            drmPollTimer = null;
          }
          banner.remove();
        });

        topRow.appendChild(titleEl);
        topRow.appendChild(closeBtn);

        const descEl = document.createElement('div');
        descEl.style.cssText = 'color:#d8d8d8;font-size:11.2px;';
        descEl.textContent =
          'Spotify requires Widevine DRM for audio (Firefox hides its yellow "Enable DRM" bar inside sidebars). Choose either quick option:';

        const stepsEl = document.createElement('div');
        stepsEl.style.cssText =
          'background:#222;border-radius:8px;padding:7px 9px;color:#eee;font-size:11px;display:flex;flex-direction:column;gap:4px;';

        const step1 = document.createElement('div');
        step1.textContent =
          '1. Click "Open Tab to Enable DRM" below → click Firefox\'s yellow "Enable DRM" button at the top of the tab.';
        const step2 = document.createElement('div');
        step2.textContent =
          '2. Or in Firefox Settings → Tabs and browsing → Media → check "Play DRM-controlled content".';
        const step3 = document.createElement('div');
        step3.style.cssText = 'color:#aaa;font-size:10.3px;';
        step3.textContent =
          'Tip: If audio still stays paused, open about:config and set media.gmp.decoder.enabled to true.';
        stepsEl.appendChild(step1);
        stepsEl.appendChild(step2);
        stepsEl.appendChild(step3);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px;';

        const openTabBtn = document.createElement('button');
        openTabBtn.type = 'button';
        openTabBtn.style.cssText =
          'background:#1ed760;color:#000;font-weight:700;border:none;border-radius:999px;padding:6px 11px;font-size:11px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;';
        const zapSvg = document.createElementNS(SVG_NS, 'svg');
        zapSvg.setAttribute('width', '12');
        zapSvg.setAttribute('height', '12');
        zapSvg.setAttribute('viewBox', '0 0 24 24');
        zapSvg.setAttribute('fill', 'currentColor');
        zapSvg.setAttribute('stroke', 'none');
        const zapPoly = document.createElementNS(SVG_NS, 'polygon');
        zapPoly.setAttribute('points', '13 2 3 14 12 14 11 22 21 10 12 10 13 2');
        zapSvg.appendChild(zapPoly);
        openTabBtn.appendChild(zapSvg);
        openTabBtn.appendChild(document.createTextNode('Open Tab to Enable DRM'));
        openTabBtn.addEventListener('click', () => {
          ctx.notifyParent('PM_OPEN_SPOTIFY_DRM_TAB', { url: 'https://open.spotify.com/' });
          openTabBtn.textContent = 'Opened Tab — Click "Enable DRM" at Top!';
        });

        const reloadBtn = document.createElement('button');
        reloadBtn.type = 'button';
        reloadBtn.textContent = '↻ I Enabled It — Reload';
        reloadBtn.style.cssText =
          'background:#2a2a2a;color:#fff;font-weight:600;border:1px solid #444;border-radius:999px;padding:6px 10px;font-size:11px;cursor:pointer;';
        reloadBtn.addEventListener('click', () => {
          reloadBtn.textContent = 'Reloading…';
          window.location.reload();
        });

        btnRow.appendChild(openTabBtn);
        btnRow.appendChild(reloadBtn);

        banner.appendChild(topRow);
        banner.appendChild(descEl);
        banner.appendChild(stepsEl);
        banner.appendChild(btnRow);
        document.body.appendChild(banner);

        if (!drmPollTimer) {
          drmPollTimer = setInterval(async () => {
            if (!document.getElementById('pm-spotify-drm-banner')) {
              clearInterval(drmPollTimer);
              drmPollTimer = null;
              return;
            }
            const ready = await probeWidevineDrm(1800);
            if (ready) {
              drmVerifiedOk = true;
              clearInterval(drmPollTimer);
              drmPollTimer = null;
              titleEl.textContent = 'Firefox DRM Activated! Starting Spotify…';
              setTimeout(() => window.location.reload(), 650);
            }
          }, 2500);
        }
      };

      document.addEventListener(
        'click',
        (e) => {
          if (drmVerifiedOk) return;
          const playEl =
            e.target && e.target.closest
              ? e.target.closest('[data-testid="play-button"], [data-testid="control-button-playpause"]')
              : null;
          if (playEl) showSpotifyDrmPrompt(true);
        },
        true
      );

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(() => showSpotifyDrmPrompt(false), 1400);
      } else {
        window.addEventListener('DOMContentLoaded', () => setTimeout(() => showSpotifyDrmPrompt(false), 1400), {
          once: true
        });
      }
    }
  })();

  function getDiagInfo() {
    let spMediaPlaying = false;
    let currentTime = 0;
    try {
      if (window.wrappedJSObject && typeof window.wrappedJSObject.__getSpDiag === 'function') {
        const rawDiag = window.wrappedJSObject.__getSpDiag();
        if (rawDiag) {
          const diag = JSON.parse(rawDiag);
          if (diag && !diag.paused && !diag.ended && diag.rs >= 1) {
            spMediaPlaying = true;
            if (diag.ct > 0) currentTime = Math.floor(diag.ct);
          }
        }
      }
    } catch (_) {}
    return { spMediaPlaying, currentTime };
  }

  return {
    appId: 'spotify',
    disableUnreadDetection: true,
    disableSmartInvert: true,

    getFitWidthFloor() {
      return 540;
    },

    syncDomState(pendingSpaTarget) {
      const root = document.documentElement;
      if (!root) return;
      const path = window.location.pathname || '/';
      let spView = 'player';
      if (ctx.state.spotifyViewOverride) {
        spView = ctx.state.spotifyViewOverride;
      } else if (pendingSpaTarget && pendingSpaTarget.spotifyView) {
        spView = pendingSpaTarget.spotifyView;
      } else if (path.startsWith('/collection') && !path.startsWith('/collection/tracks')) {
        spView = 'library';
      } else if (path.startsWith('/search')) {
        spView = 'search';
      }
      if (root.getAttribute('data-pm-spotify-view') !== spView) {
        root.setAttribute('data-pm-spotify-view', spView);
      }
      const spPanelAttr = ctx.state.spotifyPanelOpen ? 'open' : 'closed';
      if (root.getAttribute('data-pm-spotify-panel') !== spPanelAttr) {
        root.setAttribute('data-pm-spotify-panel', spPanelAttr);
      }
      const oneTrust = document.getElementById('onetrust-consent-sdk');
      if (oneTrust) oneTrust.remove();
    },

    getReportedUrl() {
      if (ctx.state.spotifyViewOverride === 'library') {
        return 'https://open.spotify.com/collection/playlists';
      }
      return '';
    },

    onRouteChanged(prevPath, curPath) {
      if (ctx.state.spotifyViewOverride === 'library') {
        if (curPath !== prevPath && !curPath.startsWith('/collection/playlists')) {
          ctx.state.spotifyViewOverride = curPath.startsWith('/search') ? 'search' : 'player';
        }
      }
    },

    onDocumentClick(e, _ctx, helpers) {
      if (!e.target || !e.target.closest) return;
      if (!ctx.state.spPanelSyncClick) {
        const queueBtn = e.target.closest(
          '[data-testid="control-button-queue"], button[aria-label="Queue" i], button[aria-label*="Queue" i]'
        );
        const deviceBtn = !queueBtn
          ? e.target.closest(
              '#device-picker-icon-button, [data-testid="device-picker-icon-button"], button[aria-label*="Connect to a device" i]'
            )
          : null;
        if (queueBtn || deviceBtn) {
          const trigBtn = queueBtn || deviceBtn;
          const trigType = queueBtn ? 'queue' : 'device';
          if (ctx.state.spotifyPanelOpen && ctx.state.activeSpotifyPanelTrigger === trigType) {
            ctx.state.spotifyPanelOpen = false;
            ctx.state.activeSpotifyPanelTrigger = '';
          } else {
            ctx.state.spotifyPanelOpen = true;
            ctx.state.activeSpotifyPanelTrigger = trigType;
            if (ctx.state.spotifyViewOverride === 'library') {
              ctx.state.spotifyViewOverride = 'player';
            }
            setTimeout(() => {
              if (!ctx.state.spotifyPanelOpen || ctx.state.activeSpotifyPanelTrigger !== trigType) return;
              const panelEl = document.getElementById('Desktop_PanelContainer_Id');
              const hasPanelContent = Boolean(
                panelEl && panelEl.children.length > 0 && (panelEl.textContent || '').trim().length > 0
              );
              if (!hasPanelContent && trigBtn && trigBtn.isConnected) {
                ctx.state.spPanelSyncClick = true;
                try { trigBtn.click(); } catch (_) {}
                setTimeout(() => {
                  ctx.state.spPanelSyncClick = false;
                  helpers.syncAppSpecificDomState();
                }, 60);
              } else {
                helpers.syncAppSpecificDomState();
              }
            }, 90);
          }
          helpers.syncAppSpecificDomState();
        } else if (ctx.state.spotifyPanelOpen) {
          const inPanel = e.target.closest('#Desktop_PanelContainer_Id');
          if (inPanel) {
            const closeBtn = e.target.closest(
              'button[aria-label="Close" i], [data-testid="PanelHeader_CloseButton"], button[aria-label*="Hide" i]'
            );
            if (closeBtn) {
              ctx.state.spotifyPanelOpen = false;
              ctx.state.activeSpotifyPanelTrigger = '';
              helpers.syncAppSpecificDomState();
            } else {
              const navAnchor = e.target.closest('a[href^="/album/"], a[href^="/artist/"], a[href^="/playlist/"]');
              if (navAnchor) {
                setTimeout(() => {
                  ctx.state.spotifyPanelOpen = false;
                  ctx.state.activeSpotifyPanelTrigger = '';
                  helpers.syncAppSpecificDomState();
                }, 90);
              }
            }
          }
        }
      }

      if (ctx.state.spotifyViewOverride === 'library') {
        const leftSidebar = e.target.closest('#Desktop_LeftSidebar_Id');
        const clickedRow = leftSidebar
          ? e.target.closest('a[href], [role="row"], [data-encore-id="listRow"]')
          : null;
        if (clickedRow) {
          setTimeout(() => {
            ctx.state.spotifyViewOverride = 'player';
            helpers.syncAppSpecificDomState();
            ctx.notifyParent('PM_FRAME_URL_CHANGED', {
              url: window.location.href,
              title: document.title || ''
            });
          }, 80);
        }
      }
    },

    beforeSpaNavigate({ dest, destPath, icon, label }, _ctx, helpers) {
      const spView =
        destPath.startsWith('/collection') || dest.hash === '#library' || icon === 'library'
          ? 'library'
          : destPath.startsWith('/search') || icon === 'search'
          ? 'search'
          : 'player';
      ctx.state.spotifyViewOverride = spView;
      ctx.state.spotifyPanelOpen = false;
      ctx.state.activeSpotifyPanelTrigger = '';
      helpers.syncAppSpecificDomState();

      if (spView === 'library') {
        ctx.notifyParent('PM_FRAME_URL_CHANGED', {
          url: 'https://open.spotify.com/collection/playlists',
          title: document.title || ''
        });
        return true;
      }

      const spEl = helpers.findNativeInAppNavElement(destPath, icon, label, dest.href);
      if (spEl) {
        spEl.click();
        if (spView === 'search') {
          const searchInput = document.querySelector('[data-testid="search-input"], input[type="search"]');
          if (searchInput) searchInput.focus();
        }
      }
      helpers.scheduleStaggeredRouteChecks();
      ctx.notifyParent('PM_FRAME_URL_CHANGED', {
        url: spView === 'search' ? 'https://open.spotify.com/search' : 'https://open.spotify.com/',
        title: document.title || ''
      });
      return true;
    },

    findNavEl(cleanTarget) {
      if (cleanTarget === '/') {
        return document.querySelector(
          'button[data-testid="home-button"], a[data-testid="home-button"], a[aria-label="Home" i], button[aria-label="Home" i], a[href="/"]'
        );
      }
      if (cleanTarget.startsWith('/search')) {
        return document.querySelector(
          'a[href="/search"], button[data-testid="browse-button"], button[aria-label="Browse" i], button[aria-label="Search" i], [data-testid="search-input"]'
        );
      }
      if (cleanTarget.startsWith('/collection')) {
        return document.querySelector('a[href*="/collection"]');
      }
      return null;
    },

    getTrackMeta() {
      const titleEl = document.querySelector('[data-testid="context-item-info-title"]');
      const artistEl = document.querySelector('[data-testid="context-item-info-subtitles"]');
      const coverEl = document.querySelector('[data-testid="cover-art-image"]');
      const durEl = document.querySelector('[data-testid="playback-duration"]');
      const posEl = document.querySelector('[data-testid="playback-position"]');
      const prevBtn = document.querySelector('[data-testid="control-button-skip-back"]');
      const nextBtn = document.querySelector('[data-testid="control-button-skip-forward"]');
      return {
        title: titleEl ? (titleEl.textContent || '').trim() : '',
        artist: artistEl ? (artistEl.textContent || '').trim() : '',
        artworkUrl: coverEl && coverEl.src ? coverEl.src : '',
        duration: durEl ? parseClockDuration(durEl.textContent) : 0,
        currentTime: posEl ? parseClockDuration(posEl.textContent) : 0,
        canPrev: prevBtn ? !prevBtn.disabled : true,
        canNext: nextBtn ? !nextBtn.disabled : true
      };
    },

    adjustPlaybackState(stateObj) {
      const diag = getDiagInfo();
      let isPlaying = stateObj.isPlaying;
      let currentTime = stateObj.currentTime;
      if (diag.spMediaPlaying) {
        isPlaying = true;
        if (diag.currentTime > 0) currentTime = diag.currentTime;
        spHydratedWithoutLocalMediaSince = 0;
      }

      const spPlayBtn = document.querySelector('[data-testid="control-button-playpause"]');
      const posEl = document.querySelector('[data-testid="playback-position"]');
      const posText = posEl ? (posEl.textContent || '').trim() : '';
      const titleEl = document.querySelector('[data-testid="context-item-info-title"]');
      const hasTrackTitle = Boolean(titleEl && (titleEl.textContent || '').trim());
      const hasValidPos = Boolean(posText && posText !== '-:--');
      const ariaPlayBtn = (spPlayBtn ? spPlayBtn.getAttribute('aria-label') || '' : '').toLowerCase();
      const isSpPlayerHydrated = Boolean(
        spPlayBtn && !spPlayBtn.disabled && (hasValidPos || hasTrackTitle || ariaPlayBtn.includes('pause'))
      );

      if (!diag.spMediaPlaying) {
        if (isSpPlayerHydrated) {
          if (!spHydratedWithoutLocalMediaSince) spHydratedWithoutLocalMediaSince = Date.now();
        } else {
          spHydratedWithoutLocalMediaSince = 0;
        }
      }
      if (isSpPlayerHydrated) {
        if (ariaPlayBtn.includes('pause')) isPlaying = true;
        if (currentTime === 0 && posText && posText !== '-:--' && posText.includes(':')) {
          currentTime = parseClockDuration(posText);
        }
      }
      return { ...stateObj, isPlaying, currentTime };
    },

    isCurrentlyPlaying() {
      const diag = getDiagInfo();
      if (diag.spMediaPlaying) return true;
      const spPlayBtn = document.querySelector('[data-testid="control-button-playpause"]');
      const aria = (spPlayBtn ? spPlayBtn.getAttribute('aria-label') || '' : '').toLowerCase();
      return aria.includes('pause') || aria.includes('stop');
    },

    handleBgAutoResume(_ctx, stateObj) {
      const diag = getDiagInfo();
      if (diag.spMediaPlaying) {
        ctx.state.bgAudioAutoResumed = true;
        return true;
      }
      const spToggle = document.querySelector('[data-testid="control-button-playpause"]');
      const now = Date.now();
      const canAttemptClick = now - lastSpotifyAutoResumeClickAt > 2200;
      let connectState = null;
      try {
        if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmGetSpotifyConnectState === 'function') {
          connectState = window.wrappedJSObject.__pmGetSpotifyConnectState();
        }
      } catch (_) {}
      const domTitle = (document.querySelector('[data-testid="context-item-info-title"]')?.textContent || '').trim();
      const hasExpectedSession = Boolean(
        ctx.isBgAudioFrame ||
          (ctx.state.expectedTrackTitle && ctx.state.expectedTrackTitle.toLowerCase() !== 'spotify') ||
          (stateObj && stateObj.title && stateObj.title.toLowerCase() !== 'spotify') ||
          domTitle ||
          (connectState && (connectState.hasConnectState || connectState.activeDeviceId))
      );

      if (spToggle && !spToggle.disabled) {
        const aria = (spToggle.getAttribute('aria-label') || '').toLowerCase();
        if (!aria.includes('pause') && !aria.includes('stop')) {
          if (canAttemptClick) {
            lastSpotifyAutoResumeClickAt = now;
            clickSpotifyToggleOnce(true);
          }
        } else if (
          aria.includes('pause') &&
          spHydratedWithoutLocalMediaSince > 0 &&
          now - spHydratedWithoutLocalMediaSince > 1400 &&
          canAttemptClick
        ) {
          lastSpotifyAutoResumeClickAt = now;
          try {
            if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover === 'function') {
              window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover(true);
            }
          } catch (_) {}
        }
      } else if (canAttemptClick) {
        lastSpotifyAutoResumeClickAt = now;
        let resumed = false;
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover === 'function') {
            const res = window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover(true);
            if (res === 'transferred' || res === 'playing' || res === 'clicked-play') resumed = true;
          }
        } catch (_) {}
        if (!resumed && !hasExpectedSession) {
          resumed = clickSpotifyHomePlayButton();
        }
        if (!resumed && !hasExpectedSession) {
          try {
            if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover === 'function') {
              window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover(false);
            }
          } catch (_) {}
        }
      }
      return true;
    },

    handleSidebarAutoResume() {
      const diag = getDiagInfo();
      const spToggle = document.querySelector('[data-testid="control-button-playpause"]');
      const now = Date.now();
      if (diag.spMediaPlaying || now - ctx.state.sidebarAutoResumeRequestedAt > 30000) {
        ctx.state.sidebarAutoResumeRequested = false;
        return true;
      }
      if (!spToggle || spToggle.disabled) {
        return true;
      }

      const aria = (spToggle.getAttribute('aria-label') || '').toLowerCase();
      const isUiPlaying = aria.includes('pause') || aria.includes('stop');
      const titleEl = document.querySelector('[data-testid="context-item-info-title"]');
      const domTitle = titleEl ? (titleEl.textContent || '').trim() : '';
      const posEl = document.querySelector('[data-testid="playback-position"]');
      const posText = posEl ? (posEl.textContent || '').trim() : '';
      const hasValidPos = Boolean(posText && posText !== '-:--');
      let connectState = null;
      try {
        if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmGetSpotifyConnectState === 'function') {
          connectState = window.wrappedJSObject.__pmGetSpotifyConnectState();
        }
      } catch (_) {}

      const expectedTitle = String(ctx.state.expectedTrackTitle || '').trim();
      const hasExpectedTitle = Boolean(expectedTitle && expectedTitle.toLowerCase() !== 'spotify');
      const titleMatches = !hasExpectedTitle || (domTitle && domTitle.toLowerCase() === expectedTitle.toLowerCase());
      const titleMismatches = Boolean(hasExpectedTitle && domTitle && domTitle.toLowerCase() !== expectedTitle.toLowerCase());
      const isConnectHydrated = Boolean(connectState && (connectState.hasConnectState || connectState.activeDeviceId));
      const isPlayerHydrated = Boolean(domTitle || hasValidPos || isUiPlaying || isConnectHydrated);

      if (isUiPlaying) {
        if (
          spHydratedWithoutLocalMediaSince > 0 &&
          now - spHydratedWithoutLocalMediaSince > 900 &&
          now - lastSpotifyAutoResumeClickAt > 2400
        ) {
          lastSpotifyAutoResumeClickAt = now;
          try {
            if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover === 'function') {
              window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover(true);
            }
          } catch (_) {}
        }
      } else if (isPlayerHydrated && now - lastSpotifyAutoResumeClickAt > 2200) {
        if (titleMismatches || (hasExpectedTitle && !domTitle)) {
          if (connectState && connectState.hasAuth && now - ctx.state.sidebarAutoResumeRequestedAt > 900) {
            lastSpotifyAutoResumeClickAt = now;
            try {
              if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover === 'function') {
                window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover(true);
              }
            } catch (_) {}
          }
        } else if (titleMatches) {
          lastSpotifyAutoResumeClickAt = now;
          clickSpotifyToggleOnce(true);
        }
      }
      return true;
    },

    handleUserMediaGesture(e, _ctx, helpers) {
      if (ctx.state.spAutoClickInFlight) return true;
      ctx.state.sidebarAutoResumeRequested = false;
      if (e && e.target && e.target.closest) {
        const playOrPauseBtn = e.target.closest(
          '[data-testid="control-button-playpause"], [data-testid="play-button"]'
        );
        if (playOrPauseBtn) {
          const aria = (playOrPauseBtn.getAttribute('aria-label') || '').toLowerCase();
          const now = Date.now();

          if (e.type === 'pointerdown' || e.type === 'mousedown') {
            if (!aria.includes('pause') && !(lastSpPlayBtnEl === playOrPauseBtn && now - lastSpPlayBtnClickAt < 1300)) {
              ctx.state.isTabAudioAutoPaused = false;
              window.__pmWasAutoPausedByTabAudio = false;
              helpers.clearVerifyTimer();
              try {
                if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmClearTabAutoPaused === 'function') {
                  window.wrappedJSObject.__pmClearTabAutoPaused();
                }
              } catch (_) {}
              try {
                ctx.realTopWin.postMessage(
                  {
                    source: 'pocketmail-media-frame',
                    type: 'PM_SP_EME_BRIDGE',
                    flatFrameName: ctx.cleanWindowName,
                    bridgeType: 'USER_PLAY_INTENT'
                  },
                  '*'
                );
              } catch (_) {}
            }
            return true;
          }

          if (e.type === 'click') {
            if (lastSpPlayBtnEl === playOrPauseBtn && now - lastSpPlayBtnClickAt < 1300) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              return true;
            }
            if (!aria.includes('pause')) {
              lastSpPlayBtnEl = playOrPauseBtn;
              lastSpPlayBtnClickAt = now;
              ctx.state.isTabAudioAutoPaused = false;
              window.__pmWasAutoPausedByTabAudio = false;
              helpers.clearVerifyTimer();
              try {
                if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmClearTabAutoPaused === 'function') {
                  window.wrappedJSObject.__pmClearTabAutoPaused();
                }
              } catch (_) {}

              try {
                const prevTransition = playOrPauseBtn.style.transition;
                const prevTransform = playOrPauseBtn.style.transform;
                const prevShadow = playOrPauseBtn.style.boxShadow;
                playOrPauseBtn.style.transition = 'transform 0.14s ease, box-shadow 0.18s ease';
                playOrPauseBtn.style.transform = 'scale(0.93)';
                playOrPauseBtn.style.boxShadow = '0 0 0 3px rgba(30, 215, 96, 0.65)';
                setTimeout(() => {
                  try {
                    playOrPauseBtn.style.transform = prevTransform;
                    playOrPauseBtn.style.boxShadow = prevShadow;
                    playOrPauseBtn.style.transition = prevTransition;
                  } catch (_) {}
                }, 240);
              } catch (_) {}

              try {
                ctx.realTopWin.postMessage(
                  {
                    source: 'pocketmail-media-frame',
                    type: 'PM_SP_EME_BRIDGE',
                    flatFrameName: ctx.cleanWindowName,
                    bridgeType: 'USER_PLAY_INTENT'
                  },
                  '*'
                );
              } catch (_) {}
            } else {
              lastSpPlayBtnEl = null;
              lastSpPlayBtnClickAt = 0;
              ctx.notifyParent('PM_SP_SIDEBAR_PLAYPAUSE_CLICK', { aria });
            }
          }
        }
      }
      return true;
    },

    handleCommand(msg, _ctx, helpers = {}) {
      switch (msg.cmd) {
        case 'ACTIVATE_BG_SPOTIFY_HANDOFF':
          spHydratedWithoutLocalMediaSince = 0;
          return true;
        case 'PAUSE_BG_SP_MEDIA':
          clickSpotifyToggleOnce(false);
          return true;
        case 'RESUME_BG_SP_MEDIA':
          setTimeout(() => {
            if (ctx.state.isTabAudioAutoPaused) return;
            try {
              clickSpotifyToggleOnce(true);
              let needMirrorPlay = true;
              const d = getDiagInfo();
              if (d.spMediaPlaying) needMirrorPlay = false;
              if (needMirrorPlay && window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureMirrorPlay === 'function') {
                window.wrappedJSObject.__pmEnsureMirrorPlay(true);
              }
            } catch (_) {}
          }, 120);
          return true;
        case 'PAUSE_LOCAL_MEDIA':
          clickSpotifyToggleOnce(false);
          return false;
        case 'TAB_AUDIO_AUTO_PAUSE':
          if (!msg.alreadyAutoPaused && clickSpotifyToggleOnce(false)) {
            return true;
          }
          return false;
        case 'TAB_AUDIO_AUTO_PAUSE_VERIFY':
          if (clickSpotifyToggleOnce(false)) {
            window.__pmWasAutoPausedByTabAudio = true;
          }
          return true;
        case 'TAB_AUDIO_AUTO_RESUME': {
          let clickedSpotifyPlay = clickSpotifyToggleOnce(true);
          if (!clickedSpotifyPlay) {
            try {
              if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureMirrorPlay === 'function') {
                window.wrappedJSObject.__pmEnsureMirrorPlay(true);
              }
            } catch (_) {}
          }
          const verifySpotifyResumed = (allowLateRetryClick) => {
            if (ctx.state.isTabAudioAutoPaused) return;
            try {
              const spToggle = document.querySelector('[data-testid="control-button-playpause"]');
              const aria = spToggle ? (spToggle.getAttribute('aria-label') || '').toLowerCase() : '';
              const isUiPlaying = aria.includes('pause') || aria.includes('stop');
              if (!isUiPlaying && (!clickedSpotifyPlay || allowLateRetryClick)) {
                if (clickSpotifyToggleOnce(true)) clickedSpotifyPlay = true;
              }
              const diag = getDiagInfo();
              if (!diag.spMediaPlaying && window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureMirrorPlay === 'function') {
                window.wrappedJSObject.__pmEnsureMirrorPlay(true);
              }
            } catch (_) {}
          };
          if (typeof helpers.scheduleVerifyTimer === 'function') {
            helpers.scheduleVerifyTimer(() => {
              verifySpotifyResumed(false);
              helpers.scheduleVerifyTimer(() => verifySpotifyResumed(true), 450);
            }, 220);
          }
          return clickedSpotifyPlay;
        }
        case 'AUTO_RESUME_PLAYBACK':
          spHydratedWithoutLocalMediaSince = 0;
          lastSpotifyAutoResumeClickAt = 0;
          return true;
        case 'SKIP_NEXT_SP_TRACK':
          try {
            if (window.wrappedJSObject && typeof window.wrappedJSObject.__skipNextSpTrack === 'function') {
              return Boolean(window.wrappedJSObject.__skipNextSpTrack());
            }
          } catch (_) {}
          return false;
        case 'SKIP_PREV_SP_TRACK':
          try {
            if (window.wrappedJSObject && typeof window.wrappedJSObject.__skipPrevSpTrack === 'function') {
              return Boolean(window.wrappedJSObject.__skipPrevSpTrack());
            }
          } catch (_) {}
          return false;
        default:
          return false;
      }
    },

    getAppThemeCss() {
      return `
        html, body {
          background-color: #000000 !important;
          --background-base: #000000 !important;
          --background-highlight: #12121A !important;
          --background-press: #08080C !important;
          --background-elevated-base: #12121A !important;
          --spice-main: #000000 !important;
          --spice-sidebar: #000000 !important;
          --spice-player: #050508 !important;
          --spice-card: #0E0E14 !important;
          --text-base: #FFFFFF !important;
          --text-subdued: #B8BCC8 !important;
        }
      `;
    },

    isVisuallyPainted() {
      return Boolean(
        document.querySelector('#main, #main-view, .Root__main-view, [data-testid="root"], #Desktop_LeftSidebar_Id, form')
      );
    }
  };
}
