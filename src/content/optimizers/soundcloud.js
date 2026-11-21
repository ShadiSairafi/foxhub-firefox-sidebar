/**
 * FoxHub Per-App Optimizer — SoundCloud
 * Handles rich metadata extraction, Play/Pause/Prev/Next/Mute controls,
 * detached <audio> / WebAudio playback detection, and PM_BG_AUDIO_CHUNK fallback.
 */

export function initOptimizer(ctx) {
  const parseClockDuration = ctx?.parseClockDuration || (() => 0);
  let lastAutoResumeClickAt = 0;

  function getPlayControl() {
    return document.querySelector('.playControl, button.playControls__play');
  }

  function isUiPlaying() {
    const btn = getPlayControl();
    if (!btn) return false;
    if (btn.classList.contains('playing')) return true;
    const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase();
    return label.includes('pause');
  }

  function clickSoundCloudPlay(wantPlaying) {
    const btn = getPlayControl();
    if (!btn || btn.disabled) return false;
    const playing = isUiPlaying();
    if (wantPlaying && playing) return false;
    if (!wantPlaying && !playing) return false;
    btn.click();
    return true;
  }

  function extractBgImageUrl(el) {
    if (!el) return '';
    try {
      const inline = el.style && el.style.backgroundImage;
      const raw = inline || window.getComputedStyle(el).backgroundImage || '';
      const m = raw.match(/url\(["']?(.*?)["']?\)/i);
      return m && m[1] ? m[1] : '';
    } catch (_) {
      return '';
    }
  }

  return {
    appId: 'soundcloud',
    disableUnreadDetection: true,
    disableSmartInvert: true,

    getTrackMeta(mediaEl) {
      const titleEl = document.querySelector('.playbackSoundBadge__titleLink, .playbackSoundBadge__title a');
      const artistEl = document.querySelector('.playbackSoundBadge__lightLink, .playbackSoundBadge__titleContextContainer a');
      const artEl = document.querySelector('.playbackSoundBadge__avatar span.sc-artwork, .playbackSoundBadge__avatar span[style*="background-image"]');
      const passedEl = document.querySelector('.playbackTimeline__timePassed span:last-child');
      const durEl = document.querySelector('.playbackTimeline__duration span:last-child');
      const prevBtn = document.querySelector('.skipControl__previous');
      const nextBtn = document.querySelector('.skipControl__next');

      const ct = mediaEl && mediaEl.currentTime > 0
        ? Math.floor(mediaEl.currentTime)
        : passedEl
        ? parseClockDuration(passedEl.textContent)
        : 0;
      const dur = mediaEl && Number.isFinite(mediaEl.duration) && mediaEl.duration > 0
        ? Math.floor(mediaEl.duration)
        : durEl
        ? parseClockDuration(durEl.textContent)
        : 0;

      return {
        title: titleEl ? (titleEl.getAttribute('title') || titleEl.textContent || '').trim() : '',
        artist: artistEl ? (artistEl.getAttribute('title') || artistEl.textContent || '').trim() : '',
        artworkUrl: extractBgImageUrl(artEl),
        currentTime: ct,
        duration: dur,
        canPrev: prevBtn ? !prevBtn.disabled : true,
        canNext: nextBtn ? !nextBtn.disabled : true
      };
    },

    adjustPlaybackState(stateObj, _ctx, mediaEl) {
      const playing = Boolean(
        stateObj.isPlaying ||
          isUiPlaying() ||
          (mediaEl && !mediaEl.paused && !mediaEl.ended)
      );
      return { ...stateObj, isPlaying: playing };
    },

    isCurrentlyPlaying() {
      return isUiPlaying();
    },

    handleBgAutoResume(_ctx, stateObj, mediaEl, helpers) {
      if (stateObj.isPlaying) {
        ctx.state.bgAudioAutoResumed = true;
        return true;
      }
      const now = Date.now();
      if (now - lastAutoResumeClickAt > 2200) {
        lastAutoResumeClickAt = now;
        if (clickSoundCloudPlay(true)) {
          return true;
        }
      }
      if (mediaEl && mediaEl.readyState >= 2) {
        if (helpers.curAutoplayPolicy === 'allowed') {
          mediaEl.muted = false;
          mediaEl.volume = 1.0;
          mediaEl
            .play()
            .then(() => {
              ctx.state.bgAudioAutoResumed = true;
            })
            .catch(() => {
              helpers.startLocalMseAudioBridge(mediaEl);
            });
        } else {
          helpers.startLocalMseAudioBridge(mediaEl);
        }
        return true;
      }
      return false;
    },

    handleCommand(msg, _ctx, helpers = {}) {
      const msHandlers = typeof helpers.getCapturedMediaSessionHandlers === 'function'
        ? helpers.getCapturedMediaSessionHandlers()
        : {};
      const mediaEl = typeof helpers.getActiveMediaElement === 'function' ? helpers.getActiveMediaElement() : null;

      switch (msg.cmd) {
        case 'RESUME_BG_SP_MEDIA': {
          if (clickSoundCloudPlay(true)) return true;
          if (typeof msHandlers.play === 'function') {
            try {
              msHandlers.play();
              return true;
            } catch (_) {}
          }
          if (mediaEl && mediaEl.paused && !mediaEl.ended) {
            mediaEl.play().catch(() => {
              if (ctx.isBgAudioFrame && typeof helpers.startLocalMseAudioBridge === 'function') {
                helpers.startLocalMseAudioBridge(mediaEl);
              }
            });
            return true;
          }
          return false;
        }
        case 'PAUSE_LOCAL_MEDIA':
          clickSoundCloudPlay(false);
          if (typeof msHandlers.pause === 'function') {
            try { msHandlers.pause(); } catch (_) {}
          }
          return false;
        case 'SKIP_NEXT_SP_TRACK': {
          if (typeof msHandlers.nexttrack === 'function') {
            try {
              msHandlers.nexttrack();
              return true;
            } catch (_) {}
          }
          const nextBtn = document.querySelector('.skipControl__next');
          if (nextBtn && !nextBtn.disabled) {
            nextBtn.click();
            return true;
          }
          return false;
        }
        case 'SKIP_PREV_SP_TRACK': {
          if (typeof msHandlers.previoustrack === 'function') {
            try {
              msHandlers.previoustrack();
              return true;
            } catch (_) {}
          }
          const prevBtn = document.querySelector('.skipControl__previous');
          if (prevBtn && !prevBtn.disabled) {
            prevBtn.click();
            return true;
          }
          return false;
        }
        case 'PM_MEDIA_CONTROL':
          if (msg.command === 'mute_toggle') {
            const wantMuted = Boolean(msg.muted);
            const volBtn = document.querySelector('.volume__button');
            if (volBtn && volBtn.classList.contains('muted') !== wantMuted) {
              try { volBtn.click(); } catch (_) {}
            }
            if (mediaEl) mediaEl.muted = wantMuted;
            return true;
          }
          return false;
        default:
          return false;
      }
    },

    getAppThemeCss() {
      return `
        html, body, #app, .l-container {
          background-color: #000000 !important;
          color: #F4F5F8 !important;
        }
        .playControls__inner, .playControls__wrapper {
          background-color: #0B0B10 !important;
          border-top-color: rgba(255, 255, 255, 0.12) !important;
        }
      `;
    },

    isVisuallyPainted() {
      return Boolean(document.querySelector('.playControls, .soundList, main, [role="main"], #content, form'));
    },

    isRouteMatch(c, d) {
      if (c === d) return true;
      if (d.startsWith('/discover') && (c === '/' || c.startsWith('/discover'))) return true;
      if (d.startsWith('/feed') && c.startsWith('/feed')) return true;
      if (d.startsWith('/search') && c.startsWith('/search')) return true;
      if (d.startsWith('/you/library') && c.startsWith('/you/library')) return true;
      return false;
    },

    findNavEl(cleanTarget) {
      if (cleanTarget === '/' || cleanTarget.startsWith('/discover')) {
        return document.querySelector('a[href="/discover"], a[href="/"]');
      }
      if (cleanTarget.startsWith('/feed')) return document.querySelector('a[href="/feed"]');
      if (cleanTarget.startsWith('/search')) return document.querySelector('a[href="/search"]');
      if (cleanTarget.startsWith('/you/library')) return document.querySelector('a[href="/you/library"]');
      return null;
    }
  };
}
