/**
 * FoxHub Per-App Optimizer — YouTube & YouTube Music
 * Handles both youtube.com / youtu.be and music.youtube.com,
 * including PiP/fullscreen, narrow mini-guide stripping, rich metadata, and R3 controls.
 */

export function initOptimizer(ctx) {
  const parseClockDuration = ctx?.parseClockDuration || (() => 0);
  const isMusicYt = ctx.hasHost('music.youtube.com');

  // YouTube Fullscreen & Picture-in-Picture (PiP) Support inside Sidebar Iframe
  if (!isMusicYt) {
    const triggerVideoFullscreen = () => {
      try {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
          return;
        }
        const playerEl =
          document.getElementById('movie_player') ||
          document.querySelector('.html5-video-player') ||
          document.querySelector('video.html5-main-video') ||
          document.documentElement;
        if (playerEl && playerEl.requestFullscreen) {
          playerEl.requestFullscreen().catch(() => {
            const vid = document.querySelector('video');
            if (vid && vid.requestFullscreen) vid.requestFullscreen().catch(() => {});
          });
        }
      } catch (_) {}
    };

    document.addEventListener(
      'click',
      (e) => {
        const fsBtn =
          e.target && e.target.closest
            ? e.target.closest('.ytp-fullscreen-button, button[aria-label*="Full screen" i], button[title*="Full screen" i]')
            : null;
        if (!fsBtn) return;
        const wasFs = Boolean(document.fullscreenElement);
        setTimeout(() => {
          if (Boolean(document.fullscreenElement) === wasFs) triggerVideoFullscreen();
        }, 90);
      },
      true
    );

    const ensureYtPipButton = () => {
      const rightControls = document.querySelector('.ytp-right-controls');
      if (!rightControls || rightControls.querySelector('.pm-yt-pip-btn')) return;
      const pipBtn = document.createElement('button');
      pipBtn.type = 'button';
      pipBtn.className = 'ytp-button pm-yt-pip-btn';
      pipBtn.title = 'Picture-in-Picture (Floating Video Window)';
      pipBtn.setAttribute('aria-label', 'Picture-in-Picture');
      pipBtn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;vertical-align:top;width:40px;height:100%;opacity:0.92;';
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', '20');
      svg.setAttribute('height', '20');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', '#ffffff');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      const r1 = document.createElementNS(svgNS, 'rect');
      r1.setAttribute('x', '2');
      r1.setAttribute('y', '4');
      r1.setAttribute('width', '20');
      r1.setAttribute('height', '15');
      r1.setAttribute('rx', '2');
      const r2 = document.createElementNS(svgNS, 'rect');
      r2.setAttribute('x', '12');
      r2.setAttribute('y', '11');
      r2.setAttribute('width', '8');
      r2.setAttribute('height', '6');
      r2.setAttribute('rx', '1');
      r2.setAttribute('fill', '#ffffff');
      svg.appendChild(r1);
      svg.appendChild(r2);
      pipBtn.appendChild(svg);

      pipBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const vid = document.querySelector('video.html5-main-video, video');
        if (!vid) return;
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(() => {});
        } else if (vid.requestPictureInPicture) {
          vid.requestPictureInPicture().catch(() => triggerVideoFullscreen());
        } else {
          triggerVideoFullscreen();
        }
      });

      const fsBtn = rightControls.querySelector('.ytp-fullscreen-button');
      if (fsBtn) rightControls.insertBefore(pipBtn, fsBtn);
      else rightControls.appendChild(pipBtn);
    };

    const ensureYtOverlayGuideMode = () => {
      if (window.innerWidth > 820) return;
      const ytdApp = document.querySelector('ytd-app');
      if (ytdApp && ytdApp.hasAttribute('guide-persistent-and-visible')) {
        ytdApp.removeAttribute('guide-persistent-and-visible');
      }
    };
    setTimeout(ensureYtOverlayGuideMode, 250);
    setTimeout(ensureYtOverlayGuideMode, 900);
    setInterval(ensureYtPipButton, 2000);
  }

  return {
    appId: 'youtube',
    disableUnreadDetection: true,
    disableSmartInvert: true,

    syncDomState() {
      if (!isMusicYt && window.innerWidth <= 1280) {
        const ytdApp = document.querySelector('ytd-app');
        if (ytdApp) {
          ytdApp.removeAttribute('mini-guide-visible');
          ytdApp.removeAttribute('guide-persistent-and-visible');
        }
        const drawer = document.querySelector('tp-yt-app-drawer#guide[opened]');
        if (drawer && window.innerWidth <= 920) {
          drawer.removeAttribute('opened');
        }
      }
    },

    onRouteChanged(prevPath, curPath, _ctx, helpers) {
      if (isMusicYt) return;
      const isPlayableYtPath =
        curPath.startsWith('/watch') ||
        curPath.startsWith('/shorts') ||
        curPath.startsWith('/live') ||
        curPath.startsWith('/embed');
      if (!isPlayableYtPath) {
        helpers.pauseActiveVideosSoftly();
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmStopYtMirror === 'function') {
            window.wrappedJSObject.__pmStopYtMirror();
          }
        } catch (_) {}
      } else if (prevPath.startsWith('/shorts') && !curPath.startsWith('/shorts')) {
        try {
          document.querySelectorAll('#shorts-player video, ytd-shorts video').forEach((v) => {
            if (!v.paused) v.pause();
          });
        } catch (_) {}
      } else if (prevPath.startsWith('/watch') && curPath.startsWith('/shorts')) {
        try {
          document.querySelectorAll('#movie_player video').forEach((v) => {
            if (!v.paused) v.pause();
          });
        } catch (_) {}
      }
    },

    beforeSpaNavigate({ startPath, destPath }, _ctx, helpers) {
      if (isMusicYt) return false;
      const destIsPlayable =
        destPath.startsWith('/watch') ||
        destPath.startsWith('/shorts') ||
        destPath.startsWith('/live') ||
        destPath.startsWith('/embed');
      if (!destIsPlayable || (startPath.startsWith('/shorts') && !destPath.startsWith('/shorts'))) {
        helpers.pauseActiveVideosSoftly();
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmStopYtMirror === 'function') {
            window.wrappedJSObject.__pmStopYtMirror();
          }
        } catch (_) {}
      }
      return false;
    },

    getTrackMeta(mediaEl) {
      if (isMusicYt) {
        const titleEl = document.querySelector('ytmusic-player-bar .title, ytmusic-player-bar yt-formatted-string.title');
        const bylineEl = document.querySelector('ytmusic-player-bar .byline a, ytmusic-player-bar .subtitle yt-formatted-string');
        const imgEl = document.querySelector('ytmusic-player-bar img.image, ytmusic-player-bar img#img');
        const timeInfoEl = document.querySelector('.time-info.ytmusic-player-bar');
        const prevBtn = document.querySelector('ytmusic-player-bar .previous-button');
        const nextBtn = document.querySelector('ytmusic-player-bar .next-button');
        let currentTime = 0;
        let duration = 0;
        if (timeInfoEl) {
          const parts = (timeInfoEl.textContent || '').split('/').map((s) => s.trim());
          if (parts.length === 2) {
            currentTime = parseClockDuration(parts[0]);
            duration = parseClockDuration(parts[1]);
          }
        }
        return {
          title: titleEl ? (titleEl.textContent || '').trim() : '',
          artist: bylineEl ? (bylineEl.textContent || '').trim() : '',
          artworkUrl: imgEl && imgEl.src ? imgEl.src : '',
          currentTime,
          duration,
          canPrev: prevBtn ? !prevBtn.disabled : true,
          canNext: nextBtn ? !nextBtn.disabled : true
        };
      }
      const titleEl = document.querySelector('#title h1 yt-formatted-string, ytd-watch-metadata h1, .ytp-title-link');
      const chanEl = document.querySelector('#owner #channel-name a, ytd-channel-name a');
      const prevBtn = document.querySelector('.ytp-prev-button');
      const nextBtn = document.querySelector('.ytp-next-button');
      return {
        title: titleEl ? (titleEl.textContent || '').trim() : '',
        artist: chanEl ? (chanEl.textContent || '').trim() : '',
        currentTime: mediaEl ? Math.floor(mediaEl.currentTime || 0) : 0,
        duration: mediaEl && Number.isFinite(mediaEl.duration) ? Math.floor(mediaEl.duration) : 0,
        canPrev: prevBtn ? prevBtn.getAttribute('aria-disabled') !== 'true' : true,
        canNext: nextBtn ? nextBtn.getAttribute('aria-disabled') !== 'true' : true
      };
    },

    adjustPlaybackState(stateObj) {
      const cinematicsEl = document.getElementById('cinematics');
      if (cinematicsEl && cinematicsEl.firstChild) {
        cinematicsEl.textContent = '';
      }
      const curYtPath = window.location.pathname || '/';
      const isPlayableYt =
        isMusicYt ||
        curYtPath.startsWith('/watch') ||
        curYtPath.startsWith('/shorts') ||
        curYtPath.startsWith('/live') ||
        curYtPath.startsWith('/embed');
      if (!isPlayableYt) {
        return { ...stateObj, isPlaying: false, currentTime: 0, resumeUrl: window.location.href };
      }
      let nextPlaying = stateObj.isPlaying;
      if (isMusicYt) {
        const ytmToggle = document.querySelector('ytmusic-player-bar #play-pause-button');
        const aria = (ytmToggle ? ytmToggle.getAttribute('aria-label') || ytmToggle.getAttribute('title') || '' : '').toLowerCase();
        if (aria.includes('pause')) nextPlaying = true;
      }
      let resumeUrl = stateObj.resumeUrl || window.location.href;
      if (!isMusicYt && curYtPath.startsWith('/watch')) {
        try {
          const u = new URL(window.location.href);
          if ((u.searchParams.get('list') || '').startsWith('RD')) u.searchParams.delete('index');
          if (stateObj.currentTime >= 1) u.searchParams.set('t', `${stateObj.currentTime}s`);
          resumeUrl = u.href;
        } catch (_) {}
      }
      return { ...stateObj, isPlaying: nextPlaying, resumeUrl };
    },

    isCurrentlyPlaying(_ctx) {
      if (isMusicYt) {
        const ytmToggle = document.querySelector('ytmusic-player-bar #play-pause-button');
        const aria = (ytmToggle ? ytmToggle.getAttribute('aria-label') || ytmToggle.getAttribute('title') || '' : '').toLowerCase();
        if (aria.includes('pause')) return true;
      }
      return false;
    },

    handleCommand(msg, _ctx, helpers = {}) {
      if (msg.cmd === 'SKIP_NEXT_SP_TRACK') {
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__skipNextSpTrack === 'function') {
            if (window.wrappedJSObject.__skipNextSpTrack()) return true;
          }
        } catch (_) {}
        const nextBtn = isMusicYt
          ? document.querySelector('ytmusic-player-bar .next-button')
          : document.querySelector('.ytp-next-button');
        if (nextBtn && !nextBtn.disabled) {
          nextBtn.click();
          return true;
        }
        return false;
      }
      if (msg.cmd === 'SKIP_PREV_SP_TRACK') {
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__skipPrevSpTrack === 'function') {
            if (window.wrappedJSObject.__skipPrevSpTrack()) return true;
          }
        } catch (_) {}
        const prevBtn = isMusicYt
          ? document.querySelector('ytmusic-player-bar .previous-button')
          : document.querySelector('.ytp-prev-button');
        if (prevBtn && !prevBtn.disabled) {
          prevBtn.click();
          return true;
        }
        return false;
      }
      if (msg.cmd === 'RESUME_BG_SP_MEDIA') {
        if (isMusicYt) {
          const ytmBtn = document.querySelector('ytmusic-player-bar #play-pause-button');
          const aria = (ytmBtn ? ytmBtn.getAttribute('aria-label') || ytmBtn.getAttribute('title') || '' : '').toLowerCase();
          if (ytmBtn && aria.includes('play')) {
            ytmBtn.click();
            return true;
          }
        }
        const msHandlers = typeof helpers.getCapturedMediaSessionHandlers === 'function'
          ? helpers.getCapturedMediaSessionHandlers()
          : {};
        if (typeof msHandlers.play === 'function') {
          try {
            msHandlers.play();
            return true;
          } catch (_) {}
        }
        if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureMirrorPlay === 'function') {
          return Boolean(window.wrappedJSObject.__pmEnsureMirrorPlay(true));
        }
        return false;
      }
      if (msg.cmd === 'PAUSE_LOCAL_MEDIA') {
        if (isMusicYt) {
          const ytmBtn = document.querySelector('ytmusic-player-bar #play-pause-button');
          const aria = (ytmBtn ? ytmBtn.getAttribute('aria-label') || ytmBtn.getAttribute('title') || '' : '').toLowerCase();
          if (ytmBtn && aria.includes('pause')) {
            ytmBtn.click();
          }
        }
        return false;
      }
      return false;
    },

    syncDarkDom(enableDark, _ctx, { getCookieVal }) {
      const docEl = document.documentElement;
      if (!docEl) return;
      if (enableDark) {
        if (!docEl.hasAttribute('dark')) {
          docEl.dataset.pmAddedYtDark = '1';
          docEl.setAttribute('dark', '');
        }
        if (docEl.style.colorScheme !== 'dark') docEl.style.colorScheme = 'dark';
        document.querySelectorAll('ytd-masthead, ytd-app, tp-yt-app-drawer, ytmusic-app').forEach((el) => {
          if (!el.hasAttribute('dark')) el.setAttribute('dark', '');
        });
        try {
          const prevPref = getCookieVal('PREF');
          if (!/(^|&)f6=400(&|$)/.test(prevPref)) {
            const nextPref = prevPref
              ? /(^|&)f6=[^&]*/.test(prevPref)
                ? prevPref.replace(/(^|&)f6=[^&]*/, '$1f6=400')
                : `${prevPref}&f6=400`
              : 'f6=400';
            document.cookie = 'PREF=; path=/; max-age=0; SameSite=None; Secure';
            document.cookie = `PREF=${nextPref}; domain=.youtube.com; path=/; max-age=31536000; SameSite=None; Secure`;
          }
        } catch (_) {}
      } else if (docEl.dataset.pmAddedYtDark === '1') {
        delete docEl.dataset.pmAddedYtDark;
        if (docEl.hasAttribute('dark')) docEl.removeAttribute('dark');
        docEl.style.colorScheme = '';
        document.querySelectorAll('ytd-masthead, ytd-app, tp-yt-app-drawer').forEach((el) => {
          if (el.hasAttribute('dark')) el.removeAttribute('dark');
        });
      }
    },

    getAppThemeCss() {
      return `
        html,
        html[dark],
        html:not(.style-scope),
        html[data-pm-social-theme="true-night"],
        ytd-app,
        ytmusic-app {
          background-color: #000000 !important;
          color: #FFFFFF !important;
          --yt-spec-base-background: #000000 !important;
          --yt-spec-raised-background: #0E0E14 !important;
          --yt-spec-menu-background: #12121A !important;
          --yt-spec-general-background-a: #000000 !important;
          --yt-spec-general-background-b: #08080C !important;
          --yt-spec-general-background-c: #0E0E14 !important;
          --yt-spec-brand-background-primary: #000000 !important;
          --yt-spec-brand-background-solid: #000000 !important;
          --yt-spec-brand-background-secondary: #0A0A0F !important;
          --yt-spec-additive-background: rgba(255, 255, 255, 0.10) !important;
          --yt-spec-badge-chip-background: rgba(255, 255, 255, 0.10) !important;
          --yt-spec-button-chip-background-hover: rgba(255, 255, 255, 0.18) !important;
          --yt-spec-inverted-background: #FFFFFF !important;
          --yt-spec-text-primary: #FFFFFF !important;
          --yt-spec-text-primary-inverse: #000000 !important;
          --yt-spec-text-secondary: #B8BCC8 !important;
          --yt-spec-text-disabled: #7E8290 !important;
          --yt-spec-icon-active-other: #FFFFFF !important;
          --yt-spec-icon-inactive: #D4D7E0 !important;
          --yt-spec-wordmark-text: #FFFFFF !important;
          --yt-spec-10-percent-layer: rgba(255, 255, 255, 0.14) !important;
          --yt-spec-outline: rgba(255, 255, 255, 0.18) !important;
          --ytd-searchbox-background: #0E0E14 !important;
          --ytd-searchbox-legacy-border-color: rgba(255, 255, 255, 0.22) !important;
          --ytd-searchbox-legacy-button-color: #181822 !important;
          --ytd-searchbox-legacy-button-border-color: rgba(255, 255, 255, 0.22) !important;
          --ytd-searchbox-legacy-button-icon-color: #FFFFFF !important;
          --ytd-searchbox-text-color: #FFFFFF !important;
        }
        body,
        ytd-masthead,
        #background.ytd-masthead,
        #container.ytd-masthead,
        #chips-wrapper.ytd-feed-filter-chip-bar-renderer,
        ytd-feed-filter-chip-bar-renderer {
          background: #000000 !important;
          background-color: #000000 !important;
        }
        yt-searchbox .ytSearchboxComponentInputBox,
        #search-form #container.ytd-searchbox {
          background: #0E0E14 !important;
          border-color: rgba(255, 255, 255, 0.22) !important;
          color: #FFFFFF !important;
        }
        yt-searchbox input.ytSearchboxComponentInput,
        input#search {
          color: #FFFFFF !important;
        }
        yt-searchbox button.ytSearchboxComponentSearchButton,
        #search-icon-legacy.ytd-searchbox {
          background: #181822 !important;
          border-color: rgba(255, 255, 255, 0.22) !important;
          color: #FFFFFF !important;
        }
        yt-chip-cloud-chip-renderer:not([selected]) {
          background-color: #14141D !important;
          color: #F4F5F8 !important;
        }
        yt-chip-cloud-chip-renderer[selected] {
          background-color: #FFFFFF !important;
          color: #000000 !important;
        }
        #video-title,
        yt-formatted-string#video-title,
        .yt-core-attributed-string {
          color: var(--yt-spec-text-primary, #FFFFFF);
        }
        ytd-topbar-logo-renderer #logo-icon svg path[fill="#212121"],
        ytd-topbar-logo-renderer #logo-icon svg path[fill="#282828"],
        ytd-topbar-logo-renderer #logo-icon svg path[fill="#0F0F0F"],
        ytd-topbar-logo-renderer #youtube-paths path {
          fill: #FFFFFF !important;
        }
      `;
    },

    isVisuallyPainted() {
      return Boolean(document.querySelector('ytd-masthead #container, ytd-page-manager > *, ytmusic-app, video, form'));
    },

    isRouteMatch(c, d) {
      if (c === d) return true;
      if (d.startsWith('/shorts') && c.startsWith('/shorts')) return true;
      if (d.startsWith('/feed/subscriptions') && c.startsWith('/feed/subscriptions')) return true;
      if ((d.startsWith('/feed/you') || d.startsWith('/feed/library')) && (c.startsWith('/feed/you') || c.startsWith('/feed/library'))) {
        return true;
      }
      return false;
    },

    findNavEl(cleanTarget) {
      if (cleanTarget === '/') {
        return document.querySelector(
          'ytd-mini-guide-entry-renderer a[href="/"], ytd-guide-entry-renderer a[href="/"], ytd-mini-guide-entry-renderer a[title="Home" i], a#logo'
        );
      }
      if (cleanTarget.startsWith('/shorts')) {
        return document.querySelector(
          'ytd-mini-guide-entry-renderer a[title="Shorts" i], ytd-guide-entry-renderer a[title="Shorts" i], ytd-mini-guide-entry-renderer[aria-label="Shorts" i] a#endpoint, a[title="Shorts" i]'
        );
      }
      if (cleanTarget.startsWith('/feed/subscriptions')) {
        return document.querySelector(
          'ytd-mini-guide-entry-renderer a[href="/feed/subscriptions"], ytd-guide-entry-renderer a[href="/feed/subscriptions"], a[title="Subscriptions" i], a[href="/feed/subscriptions"]'
        );
      }
      if (cleanTarget.startsWith('/feed/you') || cleanTarget.startsWith('/feed/library')) {
        return document.querySelector(
          'ytd-mini-guide-entry-renderer a[href="/feed/you"], ytd-guide-entry-renderer a[href="/feed/you"], a[href="/feed/you"], a[href="/feed/library"], a[title="You" i]'
        );
      }
      return null;
    }
  };
}
