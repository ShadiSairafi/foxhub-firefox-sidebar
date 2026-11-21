/**
 * FoxHub Per-App Optimizer — Perplexity
 */

export function initOptimizer() {
  return {
    appId: 'perplexity',
    disableUnreadDetection: true,
    disableSmartInvert: true,

    syncDarkDom(enableDark) {
      const docEl = document.documentElement;
      if (!docEl) return;
      if (enableDark) {
        if (!docEl.classList.contains('dark')) docEl.dataset.pmAddedPplxDark = '1';
        docEl.classList.add('dark');
        docEl.setAttribute('data-color-scheme', 'dark');
        docEl.style.colorScheme = 'dark';
      } else if (docEl.dataset.pmAddedPplxDark === '1') {
        delete docEl.dataset.pmAddedPplxDark;
        docEl.classList.remove('dark');
        docEl.removeAttribute('data-color-scheme');
        docEl.style.colorScheme = '';
      }
    },

    getAppThemeCss() {
      return `
        html, body {
          background-color: #000000 !important;
          color: #F4F5F8 !important;
        }
      `;
    },

    isVisuallyPainted() {
      return Boolean(document.querySelector('textarea, main, [role="main"], nav, form'));
    },

    isRouteMatch(c, d) {
      if (c === d) return true;
      if (d.startsWith('/discover') && c.startsWith('/discover')) return true;
      if (d.startsWith('/library') && c.startsWith('/library')) return true;
      return false;
    },

    findNavEl(cleanTarget) {
      if (cleanTarget === '/') return document.querySelector('a[href="/"]');
      if (cleanTarget.startsWith('/discover')) return document.querySelector('a[href="/discover"]');
      if (cleanTarget.startsWith('/library')) return document.querySelector('a[href="/library"]');
      return null;
    }
  };
}
