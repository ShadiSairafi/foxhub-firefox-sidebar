/**
 * FoxHub Per-App Optimizer — Bluesky
 */

export function initOptimizer() {
  return {
    appId: 'bluesky',
    disableSmartInvert: true,

    syncDarkDom(enableDark) {
      const docEl = document.documentElement;
      if (!docEl) return;
      if (enableDark) {
        if (!docEl.classList.contains('theme--dark')) docEl.dataset.pmAddedBskyDark = '1';
        if (docEl.classList.contains('theme--light')) {
          docEl.dataset.pmWasBskyLight = '1';
          docEl.classList.remove('theme--light');
        }
        docEl.classList.add('theme--dark');
        docEl.style.colorScheme = 'dark';
      } else if (docEl.dataset.pmAddedBskyDark === '1') {
        delete docEl.dataset.pmAddedBskyDark;
        docEl.classList.remove('theme--dark');
        if (docEl.dataset.pmWasBskyLight === '1') {
          delete docEl.dataset.pmWasBskyLight;
          docEl.classList.add('theme--light');
        }
        docEl.style.colorScheme = '';
      }
    },

    getAppThemeCss() {
      return `
        html, body, html.theme--dark {
          background-color: #000000 !important;
          color: #FFFFFF !important;
        }
      `;
    },

    detectUnread() {
      const badges = document.querySelectorAll(
        '[aria-label*="Notifications" i] [aria-label*="unread" i], a[href="/notifications"] div, a[href="/messages"] div'
      );
      let count = 0;
      badges.forEach((b) => {
        const n = parseInt((b.textContent || '').trim(), 10);
        if (!isNaN(n) && n > 0 && n < 1000) count = Math.max(count, n);
      });
      return { unreadCount: count, hasUnread: count > 0 };
    },

    isVisuallyPainted() {
      return Boolean(
        document.querySelector('[data-testid="HomeScreenFeedTabs"], [data-testid="composeFAB"], main, [role="main"], form')
      );
    },

    isRouteMatch(c, d) {
      if (c === d) return true;
      if (d.startsWith('/search') && c.startsWith('/search')) return true;
      if (d.startsWith('/notifications') && c.startsWith('/notifications')) return true;
      if (d.startsWith('/messages') && c.startsWith('/messages')) return true;
      return false;
    },

    findNavEl(cleanTarget) {
      if (cleanTarget === '/') return document.querySelector('a[href="/"]');
      if (cleanTarget.startsWith('/search')) return document.querySelector('a[href="/search"]');
      if (cleanTarget.startsWith('/notifications')) return document.querySelector('a[href="/notifications"]');
      if (cleanTarget.startsWith('/messages')) return document.querySelector('a[href="/messages"]');
      return null;
    }
  };
}
