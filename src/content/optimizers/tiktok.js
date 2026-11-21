/**
 * FoxHub Per-App Optimizer — TikTok
 */

export function initOptimizer(ctx) {
  if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
    let lastSyncedCookieStr = '';
    const syncLiveTikTokCookies = () => {
      try {
        const raw = document.cookie || '';
        if (raw && raw !== lastSyncedCookieStr) {
          lastSyncedCookieStr = raw;
          browser.runtime
            .sendMessage({
              type: 'PM_SYNC_LIVE_FRAME_COOKIES',
              origin: 'https://www.tiktok.com',
              cookieStr: raw
            })
            .catch(() => {});
        }
      } catch (_) {}
    };
    syncLiveTikTokCookies();
    window.addEventListener('pointerup', () => setTimeout(syncLiveTikTokCookies, 80), { capture: true, passive: true });
    document.addEventListener('visibilitychange', syncLiveTikTokCookies, { passive: true });
  }

  function resolveOwnProfileUrl() {
    try {
      const rehydEl = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (rehydEl && rehydEl.textContent) {
        const parsed = JSON.parse(rehydEl.textContent);
        const appCtx = parsed && parsed.__DEFAULT_SCOPE__ && parsed.__DEFAULT_SCOPE__['webapp.app-context'];
        const uniqueId = appCtx && appCtx.user && appCtx.user.uniqueId;
        if (uniqueId && typeof uniqueId === 'string') {
          const fullUrl = `https://www.tiktok.com/@${uniqueId}`;
          try { window.localStorage.setItem('pm_tiktok_own_profile_v2', fullUrl); } catch (_) {}
          return fullUrl;
        }
      }
      const sigiEl = document.getElementById('SIGI_STATE');
      if (sigiEl && sigiEl.textContent) {
        const parsed = JSON.parse(sigiEl.textContent);
        const uniqueId = parsed?.AppContext?.appContext?.user?.uniqueId;
        if (uniqueId && typeof uniqueId === 'string') {
          const fullUrl = `https://www.tiktok.com/@${uniqueId}`;
          try { window.localStorage.setItem('pm_tiktok_own_profile_v2', fullUrl); } catch (_) {}
          return fullUrl;
        }
      }
      const profE2e = document.querySelector('[data-e2e="nav-profile"]');
      const navProf =
        profE2e &&
        (profE2e.tagName === 'A' ? profE2e : profE2e.closest('a[href]') || profE2e.querySelector('a[href]'));
      if (navProf) {
        const href = navProf.getAttribute('href') || navProf.href || '';
        if (href && href.includes('/@')) {
          const fullUrl = new URL(href, window.location.origin).href;
          try { window.localStorage.setItem('pm_tiktok_own_profile_v2', fullUrl); } catch (_) {}
          return fullUrl;
        }
      }
      const cached = window.localStorage.getItem('pm_tiktok_own_profile_v2');
      if (cached && cached.includes('tiktok.com/@')) return cached;
    } catch (_) {}
    return '';
  }

  function findNavEl(cleanTarget, iconType) {
    if (cleanTarget === '/' || cleanTarget === '/foryou' || iconType === 'home') {
      return document.querySelector('[data-e2e="nav-foryou"], a[href="/foryou"], [data-e2e="nav-side"] a[href="/"]');
    }
    if (cleanTarget.startsWith('/explore') || iconType === 'explore') {
      return document.querySelector('[data-e2e="nav-explore"], a[href="/explore"], a[href^="/explore?"]');
    }
    if (cleanTarget.startsWith('/following') || iconType === 'users') {
      return document.querySelector('[data-e2e="nav-following"], a[href="/following"], a[href^="/following?"]');
    }
    if (cleanTarget.startsWith('/messages') || iconType === 'messages') {
      return document.querySelector('a[href="/messages"], a[href^="/messages?"], [data-e2e="nav-messages"]');
    }
    if (iconType === 'profile' || cleanTarget.startsWith('/@') || cleanTarget.startsWith('/profile')) {
      return document.querySelector('[data-e2e="nav-profile"]');
    }
    return null;
  }

  return {
    appId: 'tiktok',
    disablePageMemory: true,
    disableSmartInvert: true,
    skipTitleUnread: true,

    syncDomState(pendingSpaTarget) {
      const root = document.documentElement;
      if (!root) return;
      const path = window.location.pathname || '/';
      let ttView = 'feed';
      const isTikTokVideoDetail = path.includes('/video/') || path.includes('/photo/');
      if (path.startsWith('/messages')) {
        ttView = 'messages';
      } else if (pendingSpaTarget && pendingSpaTarget.tiktokView) {
        ttView = pendingSpaTarget.tiktokView;
      } else if (path.startsWith('/explore')) {
        ttView = 'explore';
      } else if ((path.startsWith('/@') && !isTikTokVideoDetail) || path.startsWith('/profile')) {
        ttView = 'profile';
      } else if (path.startsWith('/upload') || path.startsWith('/studio') || path.startsWith('/setting')) {
        ttView = 'other';
      }
      if (root.getAttribute('data-pm-tiktok-view') !== ttView) {
        root.setAttribute('data-pm-tiktok-view', ttView);
      }
    },

    buildPendingSpaTarget(destPath, icon) {
      return {
        tiktokView: destPath.startsWith('/messages')
          ? 'messages'
          : destPath.startsWith('/explore')
          ? 'explore'
          : destPath.startsWith('/@') || destPath.startsWith('/profile') || icon === 'profile'
          ? 'profile'
          : 'feed'
      };
    },

    beforeSpaNavigate({ targetUrl, startPath, destPath, icon, label }, _ctx, helpers) {
      const isCurrentlyOnMessages = startPath.startsWith('/messages');
      const isTargetMessages = destPath.startsWith('/messages');
      if (isCurrentlyOnMessages !== isTargetMessages) {
        helpers.pauseActiveVideosSoftly();
        ctx.notifyParent('PM_FRAME_NAV_START', { title: label ? `Opening ${label}…` : undefined });
        if (destPath === '/profile' || icon === 'profile') {
          const ownUrl = resolveOwnProfileUrl();
          if (ownUrl) {
            window.location.href = ownUrl;
            return true;
          }
          const profEl = helpers.findNativeInAppNavElement('/profile', 'profile', label);
          if (profEl) {
            profEl.click();
            return true;
          }
          window.location.href = 'https://www.tiktok.com/?pm_goto_profile=1';
          return true;
        }
        window.location.href = targetUrl;
        return true;
      }

      const isLeavingFeed =
        (startPath === '/' || startPath.startsWith('/foryou') || startPath.startsWith('/following')) &&
        (destPath.startsWith('/explore') || destPath.startsWith('/@') || destPath === '/profile' || icon === 'profile');
      if (isLeavingFeed) {
        helpers.pauseActiveVideosSoftly();
      }
      return false;
    },

    adjustPlaybackState(stateObj, _ctx, mediaEl) {
      if (Date.now() - (ctx.state.lastTikTokFeedScrollAt || 0) < 2200) {
        try {
          const vh = window.innerHeight || 600;
          const vids = document.querySelectorAll('video');
          for (let i = 0; i < vids.length; i++) {
            const v = vids[i];
            if (!v.paused && v !== mediaEl) {
              const r = v.getBoundingClientRect();
              if (r.bottom < -vh * 0.35 || r.top > vh * 1.35) v.pause();
            }
          }
        } catch (_) {}
      }
      return stateObj;
    },

    ensureSpecialRoutesReady() {
      const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
      const wantsProfile = path === '/profile' || (window.location.search || '').includes('pm_goto_profile=1');
      if (wantsProfile) {
        const ownUrl = resolveOwnProfileUrl();
        if (ownUrl) {
          window.location.replace(ownUrl);
          return;
        }
        const navProf = findNavEl('/profile', 'profile');
        if (navProf) navProf.click();
        return;
      }
      if (path.startsWith('/messages')) {
        setTimeout(() => {
          if (!window.location.pathname.startsWith('/messages')) return;
          const hasInbox = Boolean(
            document.querySelector('[data-e2e="inbox-list"], div[class*="DivConversationList"], div[class*="DivChatBox"]')
          );
          if (!hasInbox) {
            const msgBtn = findNavEl('/messages', 'messages');
            if (msgBtn) msgBtn.click();
          }
        }, 650);
      }
    },

    syncDarkDom(enableDark, _ctx, { getCookieVal }) {
      const docEl = document.documentElement;
      if (!docEl) return;
      if (enableDark) {
        if (docEl.getAttribute('data-theme') !== 'dark') {
          docEl.dataset.pmPrevTtTheme = docEl.getAttribute('data-theme') || '';
          docEl.dataset.pmAddedTtDark = '1';
          docEl.setAttribute('data-theme', 'dark');
        }
        try {
          if (getCookieVal('tiktok_webapp_theme') !== 'dark') {
            document.cookie = 'tiktok_webapp_theme=; path=/; max-age=0; SameSite=None; Secure';
            document.cookie =
              'tiktok_webapp_theme=dark; domain=.tiktok.com; path=/; max-age=31536000; SameSite=None; Secure';
          }
        } catch (_) {}
      } else if (docEl.dataset.pmAddedTtDark === '1') {
        const prevTt = docEl.dataset.pmPrevTtTheme || '';
        delete docEl.dataset.pmAddedTtDark;
        delete docEl.dataset.pmPrevTtTheme;
        if (prevTt) docEl.setAttribute('data-theme', prevTt);
        else docEl.removeAttribute('data-theme');
      }
    },

    getAppThemeCss() {
      return `
        html, body, [data-theme="dark"] {
          background-color: #000000 !important;
          color: #FFFFFF !important;
        }
      `;
    },

    detectUnread() {
      const dmBadge = document.querySelector('[data-e2e="message-icon"] sup, a[href*="/messages"] sup');
      if (dmBadge) {
        const n = parseInt((dmBadge.textContent || '').trim(), 10);
        if (!isNaN(n) && n >= 0) return { unreadCount: n, hasUnread: n > 0 };
      }
      return { unreadCount: 0, hasUnread: false };
    },

    isVisuallyPainted() {
      return Boolean(
        document.querySelector('#app > div, video, [data-e2e="recommend-list-item-container"], [data-e2e="inbox-list"], main')
      );
    },

    resolveOwnProfileUrl,

    isRouteMatch(c, d, iconType) {
      if (c === d) return true;
      if ((d === '/' || d === '/foryou') && (c === '/' || c === '/foryou')) return true;
      if ((iconType === 'profile' || d === '/profile' || d.startsWith('/@')) && c.startsWith('/@')) return true;
      if (d.startsWith('/explore') && c.startsWith('/explore')) return true;
      if (d.startsWith('/following') && c.startsWith('/following')) return true;
      if (d.startsWith('/messages') && c.startsWith('/messages')) return true;
      return false;
    },

    findNavEl
  };
}
