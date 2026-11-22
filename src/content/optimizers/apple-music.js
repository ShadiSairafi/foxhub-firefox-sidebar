/**
 * FoxHub Per-App Optimizer — Apple Music Web
 */

export function initOptimizer() {
  function queryPlayerButton(kind) {
    const selectors = {
      play: [
        'amp-chrome-player button[aria-label*="Play" i]',
        'button[data-testid="playback-control-play"]',
        '.web-chrome-playback-controls button[aria-label*="Play" i]'
      ],
      pause: [
        'amp-chrome-player button[aria-label*="Pause" i]',
        'button[data-testid="playback-control-pause"]',
        '.web-chrome-playback-controls button[aria-label*="Pause" i]'
      ],
      next: [
        'amp-chrome-player button[aria-label*="Next" i]',
        'button[data-testid="playback-control-next"]',
        '.web-chrome-playback-controls button[aria-label*="Next" i]'
      ],
      prev: [
        'amp-chrome-player button[aria-label*="Previous" i]',
        'button[data-testid="playback-control-previous"]',
        '.web-chrome-playback-controls button[aria-label*="Previous" i]'
      ]
    };
    const list = selectors[kind] || [];
    for (let i = 0; i < list.length; i++) {
      const btn = document.querySelector(list[i]);
      if (btn) return btn;
    }
    return null;
  }

  return {
    appId: 'apple-music',
    disableUnreadDetection: true,
    disableSmartInvert: true,

    syncDarkDom(enableDark) {
      const docEl = document.documentElement;
      if (!docEl) return;
      if (enableDark) {
        docEl.setAttribute('data-color-scheme', 'dark');
        docEl.style.colorScheme = 'dark';
      } else {
        docEl.removeAttribute('data-color-scheme');
        docEl.style.colorScheme = '';
      }
    },

    getTrackMeta(mediaEl) {
      const titleEl = document.querySelector('.web-chrome-playback-lcd__song-name, [data-testid="track-title"]');
      const artistEl = document.querySelector('.web-chrome-playback-lcd__sub-copy, [data-testid="track-subtitle"]');
      const imgEl = document.querySelector('.web-chrome-playback-lcd__artwork img, amp-chrome-player img');
      const prevBtn = queryPlayerButton('prev');
      const nextBtn = queryPlayerButton('next');
      return {
        title: titleEl ? (titleEl.textContent || '').trim() : '',
        artist: artistEl ? (artistEl.textContent || '').trim() : '',
        artworkUrl: imgEl && imgEl.src ? imgEl.src : '',
        currentTime: mediaEl ? Math.floor(mediaEl.currentTime || 0) : 0,
        duration: mediaEl && Number.isFinite(mediaEl.duration) ? Math.floor(mediaEl.duration) : 0,
        canPrev: prevBtn ? !prevBtn.disabled : true,
        canNext: nextBtn ? !nextBtn.disabled : true
      };
    },

    isCurrentlyPlaying() {
      return Boolean(queryPlayerButton('pause'));
    },

    handleCommand(msg, ctx, helpers = {}) {
      const msHandlers = typeof helpers.getCapturedMediaSessionHandlers === 'function'
        ? helpers.getCapturedMediaSessionHandlers()
        : {};
      const mediaEl = typeof helpers.getActiveMediaElement === 'function' ? helpers.getActiveMediaElement() : null;

      switch (msg.cmd) {
        case 'RESUME_BG_SP_MEDIA': {
          const playBtn = queryPlayerButton('play');
          if (playBtn && !playBtn.disabled) {
            playBtn.click();
            return true;
          }
          if (typeof msHandlers.play === 'function') {
            try { msHandlers.play(); return true; } catch (_) {}
          }
          if (mediaEl && mediaEl.paused && !mediaEl.ended) {
            mediaEl.play().catch(() => {
              if (ctx?.isBgAudioFrame && typeof helpers.startLocalMseAudioBridge === 'function') {
                helpers.startLocalMseAudioBridge(mediaEl);
              }
            });
            return true;
          }
          return false;
        }
        case 'PAUSE_LOCAL_MEDIA': {
          const pauseBtn = queryPlayerButton('pause');
          if (pauseBtn && !pauseBtn.disabled) pauseBtn.click();
          if (typeof msHandlers.pause === 'function') {
            try { msHandlers.pause(); } catch (_) {}
          }
          return false;
        }
        case 'SKIP_NEXT_SP_TRACK': {
          if (typeof msHandlers.nexttrack === 'function') {
            try { msHandlers.nexttrack(); return true; } catch (_) {}
          }
          const nextBtn = queryPlayerButton('next');
          if (nextBtn && !nextBtn.disabled) { nextBtn.click(); return true; }
          return false;
        }
        case 'SKIP_PREV_SP_TRACK': {
          if (typeof msHandlers.previoustrack === 'function') {
            try { msHandlers.previoustrack(); return true; } catch (_) {}
          }
          const prevBtn = queryPlayerButton('prev');
          if (prevBtn && !prevBtn.disabled) { prevBtn.click(); return true; }
          return false;
        }
        case 'PM_MEDIA_CONTROL':
          if (msg.command === 'set_volume' && Number.isFinite(Number(msg.volume)) && mediaEl) {
            const nextVol = Math.min(1, Math.max(0, Number(msg.volume)));
            const wantMuted = typeof msg.muted === 'boolean' ? msg.muted : nextVol <= 0.001;
            if (!ctx?.state?.bgAudioMseBridgeStarted) {
              mediaEl.volume = nextVol;
              mediaEl.muted = wantMuted;
            }
            return true;
          }
          if (msg.command === 'mute_toggle' && mediaEl) {
            if (!ctx?.state?.bgAudioMseBridgeStarted) {
              if (!msg.muted && Number.isFinite(Number(msg.volume)) && Number(msg.volume) > 0) {
                mediaEl.volume = Math.min(1, Number(msg.volume));
              }
              mediaEl.muted = Boolean(msg.muted);
            }
            return true;
          }
          return false;
        default:
          return false;
      }
    },

    getAppThemeCss() {
      return `
        html, body, #scrollable-page {
          background-color: #000000 !important;
          color: #FFFFFF !important;
        }
      `;
    },

    isVisuallyPainted() {
      return Boolean(document.querySelector('amp-chrome-player, .web-navigation, main, [role="main"], form'));
    },

    isRouteMatch(c, d) {
      if (c === d) return true;
      if (d === '/' && (c === '/' || c.includes('/listen-now') || c.includes('/home'))) return true;
      if (d.startsWith('/browse') && c.startsWith('/browse')) return true;
      if (d.startsWith('/search') && c.startsWith('/search')) return true;
      if (d.startsWith('/library') && c.startsWith('/library')) return true;
      return false;
    },

    findNavEl(cleanTarget) {
      if (cleanTarget === '/') return document.querySelector('a[href="/"], a[href*="/listen-now"]');
      if (cleanTarget.startsWith('/browse')) return document.querySelector('a[href="/browse"]');
      if (cleanTarget.startsWith('/search')) return document.querySelector('a[href="/search"]');
      if (cleanTarget.startsWith('/library')) return document.querySelector('a[href*="/library"]');
      return null;
    }
  };
}
