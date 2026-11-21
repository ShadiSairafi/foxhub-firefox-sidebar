/**
 * FoxHub Per-App Optimizer — Reddit
 */

export function initOptimizer() {
  return {
    appId: 'reddit',
    disableSmartInvert: true,

    syncDarkDom(enableDark) {
      const docEl = document.documentElement;
      if (!docEl) return;
      if (enableDark) {
        if (!docEl.classList.contains('theme-dark')) docEl.dataset.pmAddedRdDark = '1';
        if (docEl.classList.contains('theme-light')) {
          docEl.dataset.pmWasRdLight = '1';
          docEl.classList.remove('theme-light');
        }
        if (!docEl.classList.contains('theme-dark')) docEl.classList.add('theme-dark');
        if (!docEl.classList.contains('dark')) docEl.classList.add('dark');
      } else if (docEl.dataset.pmAddedRdDark === '1') {
        delete docEl.dataset.pmAddedRdDark;
        docEl.classList.remove('theme-dark', 'dark');
        if (docEl.dataset.pmWasRdLight === '1') {
          delete docEl.dataset.pmWasRdLight;
          docEl.classList.add('theme-light');
        }
      }
    },

    getAppThemeCss() {
      return `
        :root, html, html.theme-dark, body, shreddit-app {
          background-color: #000000 !important;
          color: #F4F5F8 !important;
          --color-neutral-background: #000000 !important;
          --color-neutral-background-weak: #0B0B10 !important;
          --color-neutral-background-medium: #12121A !important;
          --color-neutral-background-strong: #1A1A24 !important;
          --color-neutral-content: #F4F5F8 !important;
          --color-neutral-content-strong: #FFFFFF !important;
          --color-neutral-content-weak: #B4B8C4 !important;
        }
      `;
    },

    isVisuallyPainted() {
      return Boolean(document.querySelector('shreddit-app, rs-app, main, [role="main"], reddit-header-large'));
    },

    isRouteMatch(c, d) {
      if (c === d) return true;
      if (d.startsWith('/r/popular') && c.startsWith('/r/popular')) return true;
      return false;
    },

    findNavEl(cleanTarget) {
      if (cleanTarget === '/') {
        return document.querySelector(
          'left-nav-top-section a[href="/"], left-nav-top-section a[href^="/?feed=home"], a#reddit-logo, a[href="/?feed=home"], a[href="/"]'
        );
      }
      if (cleanTarget.startsWith('/r/popular')) {
        return document.querySelector('left-nav-top-section a[href*="/r/popular"], a[href="/r/popular/"], a[href="/r/popular"]');
      }
      return null;
    }
  };
}
