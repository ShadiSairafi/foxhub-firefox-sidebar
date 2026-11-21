/**
 * FoxHub Per-App Optimizer — X (Twitter)
 */

export function initOptimizer(ctx) {
  let xAutoRetriedAt = 0;
  let darkReloadTimer = null;

  function isXBootedInLightMode() {
    try {
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      const metaVal = (metaTheme?.getAttribute('content') || '').trim().toUpperCase();
      if (metaVal === '#FFFFFF' || metaVal === '#FFF' || metaVal === 'RGB(255, 255, 255)') return true;
      const inlineBg = (document.body?.style?.backgroundColor || '').replace(/\s+/g, '').toLowerCase();
      if (inlineBg === 'rgb(255,255,255)' || inlineBg === '#ffffff' || inlineBg === '#fff') return true;
    } catch (_) {}
    return false;
  }

  function resolveOwnProfileUrl() {
    try {
      const profLink = document.querySelector(
        '[data-testid="AppTabBar_Profile_Link"], header[role="banner"] nav a[aria-label="Profile" i]'
      );
      if (profLink) {
        const href = (profLink.getAttribute('href') || '').trim();
        if (href && href.startsWith('/')) {
          const segs = href.split('/').filter(Boolean);
          if (
            segs.length === 1 &&
            !['home', 'explore', 'notifications', 'messages', 'i', 'settings', 'search', 'profile', 'compose'].includes(
              segs[0].toLowerCase()
            )
          ) {
            const fullUrl = `https://x.com/${segs[0]}`;
            try { window.localStorage.setItem('pm_x_own_profile', fullUrl); } catch (_) {}
            return fullUrl;
          }
        }
      }
      const cached = window.localStorage.getItem('pm_x_own_profile');
      if (cached && (cached.includes('x.com/') || cached.includes('twitter.com/'))) return cached;
    } catch (_) {}
    return '';
  }

  function findNavEl(cleanTarget, iconType) {
    if (cleanTarget === '/' || cleanTarget === '/home') {
      return document.querySelector('[data-testid="AppTabBar_Home_Link"], a[href="/home"]');
    }
    if (cleanTarget.startsWith('/explore')) {
      return document.querySelector('[data-testid="AppTabBar_Explore_Link"], a[href="/explore"]');
    }
    if (cleanTarget.startsWith('/notifications')) {
      return document.querySelector('[data-testid="AppTabBar_Notifications_Link"], a[href="/notifications"]');
    }
    if (cleanTarget.startsWith('/messages') || cleanTarget.startsWith('/i/chat')) {
      return document.querySelector(
        '[data-testid="AppTabBar_DirectMessage_Link"], a[href="/i/chat"], a[href="/messages"]'
      );
    }
    if (iconType === 'profile' || cleanTarget === '/profile' || cleanTarget.startsWith('/settings/profile')) {
      return document.querySelector('[data-testid="AppTabBar_Profile_Link"], header[role="banner"] nav a[aria-label="Profile" i]');
    }
    return null;
  }

  return {
    appId: 'x',
    disablePageMemory: true,
    disableSmartInvert: true,

    onPeriodicCheck() {
      if (Date.now() - xAutoRetriedAt < 8000) return;
      const retryBtn = document.querySelector('[data-testid="error-detail"] [role="button"], main button');
      if (retryBtn) {
        const txt = (retryBtn.textContent || '').trim().toLowerCase();
        if (txt === 'retry' || txt === 'try again') {
          xAutoRetriedAt = Date.now();
          retryBtn.click();
        }
      }
    },

    ensureSpecialRoutesReady() {
      const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
      const wantsProfile = path === '/profile' || (window.location.search || '').includes('pm_goto_profile=1');
      if (!wantsProfile) return;
      const tryGoXProfile = (attempt = 0) => {
        const navProf = findNavEl('/profile', 'profile');
        if (navProf) {
          navProf.click();
          return;
        }
        const ownUrl = resolveOwnProfileUrl();
        if (ownUrl) {
          window.location.replace(ownUrl);
          return;
        }
        if (attempt < 8) setTimeout(() => tryGoXProfile(attempt + 1), 220);
      };
      tryGoXProfile(0);
    },

    syncDarkDom(enableDark, _ctx, { getCookieVal, isStorageReconcile = false } = {}) {
      const docEl = document.documentElement;
      if (!docEl) return;
      const cookieDomain = ctx.hasHost('twitter.com') ? '.twitter.com' : '.x.com';
      if (enableDark) {
        const curNight = getCookieVal('night_mode');
        if (curNight !== '2') {
          try {
            if (window.sessionStorage.getItem('pm_x_prev_night') === null) {
              window.sessionStorage.setItem('pm_x_prev_night', curNight || '0');
            }
          } catch (_) {}
          try {
            document.cookie = 'night_mode=; path=/; max-age=0; SameSite=None; Secure';
            document.cookie = `night_mode=2; domain=${cookieDomain}; path=/; max-age=31536000; SameSite=None; Secure`;
            if (getCookieVal('night_mode') !== '2') {
              document.cookie = 'night_mode=2; path=/; max-age=31536000; SameSite=None; Secure';
            }
            if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
              browser.runtime
                .sendMessage({
                  type: 'PM_SYNC_LIVE_FRAME_COOKIES',
                  origin: 'https://x.com',
                  cookieStr: document.cookie
                })
                .catch(() => {});
            }
          } catch (_) {}
        }
        if (isXBootedInLightMode()) {
          if (docEl.getAttribute('data-pm-x-light-pending') !== '1') {
            docEl.setAttribute('data-pm-x-light-pending', '1');
          }
          try {
            if (window.sessionStorage.getItem('pm_x_reloaded_for_dark') !== '1') {
              window.sessionStorage.setItem('pm_x_reloaded_for_dark', '1');
              docEl.style.setProperty('background', '#000000', 'important');
              docEl.style.setProperty('opacity', '0', 'important');
              ctx.notifyParent('PM_FRAME_NAV_START', { title: 'Applying Dark Mode…' });
              clearTimeout(darkReloadTimer);
              darkReloadTimer = setTimeout(() => {
                darkReloadTimer = null;
                window.location.reload();
              }, 16);
            }
          } catch (_) {}
        } else {
          if (docEl.hasAttribute('data-pm-x-light-pending')) docEl.removeAttribute('data-pm-x-light-pending');
          try { window.sessionStorage.removeItem('pm_x_reloaded_for_dark'); } catch (_) {}
        }
      } else {
        const hadPendingLightHide =
          Boolean(darkReloadTimer) || docEl.hasAttribute('data-pm-x-light-pending');
        clearTimeout(darkReloadTimer);
        darkReloadTimer = null;
        if (docEl.hasAttribute('data-pm-x-light-pending')) docEl.removeAttribute('data-pm-x-light-pending');
        if (hadPendingLightHide) {
          docEl.style.removeProperty('opacity');
          docEl.style.removeProperty('background');
        }
        try {
          const prevNight = window.sessionStorage.getItem('pm_x_prev_night');
          window.sessionStorage.removeItem('pm_x_reloaded_for_dark');
          if (prevNight !== null) {
            const curNight = getCookieVal('night_mode');
            window.sessionStorage.removeItem('pm_x_prev_night');
            document.cookie = 'night_mode=; path=/; max-age=0; SameSite=None; Secure';
            document.cookie = `night_mode=${prevNight}; domain=${cookieDomain}; path=/; max-age=31536000; SameSite=None; Secure`;
            if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
              browser.runtime
                .sendMessage({
                  type: 'PM_SYNC_LIVE_FRAME_COOKIES',
                  origin: 'https://x.com',
                  cookieStr: document.cookie
                })
                .catch(() => {});
            }
            if (prevNight !== '2' && (!isStorageReconcile || curNight === '2')) {
              ctx.notifyParent('PM_FRAME_NAV_START', { title: 'Restoring Theme…' });
              setTimeout(() => window.location.reload(), 16);
            }
          }
        } catch (_) {}
      }
    },

    getAppThemeCss() {
      return `
        html[data-pm-x-light-pending="1"] {
          filter: invert(0.94) hue-rotate(180deg) !important;
          background-color: #FFFFFF !important;
        }
        html[data-pm-x-light-pending="1"] img,
        html[data-pm-x-light-pending="1"] video,
        html[data-pm-x-light-pending="1"] [style*="background-image"] {
          filter: invert(1) hue-rotate(180deg) !important;
        }
        html:not([data-pm-x-light-pending="1"]),
        html:not([data-pm-x-light-pending="1"]) body {
          background-color: #000000 !important;
        }
      `;
    },

    detectUnread() {
      const dmBadge = document.querySelector(
        'a[href="/messages"] [aria-label*="unread" i], a[href="/i/chat"] [aria-label*="unread" i], [data-testid="AppTabBar_DirectMessage_Link"] span, [data-testid="AppTabBar_Notifications_Link"] [aria-label*="unread" i]'
      );
      if (dmBadge) {
        const n = parseInt((dmBadge.textContent || '').trim(), 10);
        if (!isNaN(n) && n > 0) return { unreadCount: n, hasUnread: true };
        if (dmBadge.getAttribute('aria-label')) return { unreadCount: 0, hasUnread: true };
      }
      return { unreadCount: 0, hasUnread: false };
    },

    isVisuallyPainted() {
      return Boolean(
        document.querySelector(
          '#react-root main, [data-testid="primaryColumn"], [data-testid="DMDrawer"], header[role="banner"], [data-testid="loginButton"], [data-testid="google_sign_in_container"], form, input'
        )
      );
    },

    resolveOwnProfileUrl,

    isRouteMatch(c, d, iconType) {
      if (c === d) return true;
      if ((d === '/' || d === '/home') && (c === '/' || c === '/home')) return true;
      if (d.startsWith('/explore') && (c.startsWith('/explore') || c.startsWith('/search'))) return true;
      if (d.startsWith('/notifications') && c.startsWith('/notifications')) return true;
      if ((d.startsWith('/messages') || d.startsWith('/i/chat')) && (c.startsWith('/messages') || c.startsWith('/i/chat'))) {
        return true;
      }
      if (iconType === 'profile' || d === '/profile' || d.startsWith('/settings/profile')) {
        const isSystem =
          c === '/' ||
          c === '/home' ||
          c.startsWith('/explore') ||
          c.startsWith('/search') ||
          c.startsWith('/notifications') ||
          c.startsWith('/messages') ||
          c.startsWith('/i/') ||
          c.startsWith('/settings');
        if (!isSystem && c.split('/').filter(Boolean).length >= 1) return true;
      }
      return false;
    },

    findNavEl
  };
}
