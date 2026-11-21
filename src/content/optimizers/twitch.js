/**
 * FoxHub Per-App Optimizer — Twitch
 */

export function initOptimizer() {
  return {
    appId: 'twitch',
    disableUnreadDetection: true,
    disableSmartInvert: true,

    syncDarkDom(enableDark) {
      const docEl = document.documentElement;
      if (!docEl) return;
      if (enableDark) {
        if (docEl.classList.contains('tw-root--theme-light')) {
          docEl.dataset.pmWasTwLight = '1';
          docEl.classList.remove('tw-root--theme-light');
        }
        if (!docEl.classList.contains('tw-root--theme-dark')) docEl.classList.add('tw-root--theme-dark');
      } else if (docEl.dataset.pmWasTwLight === '1') {
        delete docEl.dataset.pmWasTwLight;
        docEl.classList.remove('tw-root--theme-dark');
        docEl.classList.add('tw-root--theme-light');
      }
    },

    isVisuallyPainted() {
      return Boolean(
        document.querySelector(
          '[data-a-target="top-nav-container"], .top-nav, main, video, [data-a-target="tw-core-button-label-text"]'
        )
      );
    },

    isRouteMatch(c, d) {
      if (c === d) return true;
      if (d.startsWith('/directory/following') && c.startsWith('/directory/following')) return true;
      if (d === '/directory' && c === '/directory') return true;
      return false;
    },

    findNavEl(cleanTarget) {
      if (cleanTarget === '/') {
        return document.querySelector('a[data-a-target="home-link"], a[href="/"]');
      }
      if (cleanTarget.startsWith('/directory/following')) {
        return document.querySelector('a[data-a-target="following-link"], a[href="/directory/following"]');
      }
      if (cleanTarget === '/directory') {
        return document.querySelector('a[data-a-target="browse-link"], a[href="/directory"]');
      }
      return null;
    }
  };
}
