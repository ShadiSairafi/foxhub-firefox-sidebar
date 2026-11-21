/**
 * FoxHub Per-App Optimizer — Google Gemini
 */

export function initOptimizer() {
  return {
    appId: 'gemini',
    disableUnreadDetection: true,
    disableSmartInvert: true,

    syncDarkDom(enableDark) {
      const docEl = document.documentElement;
      if (!docEl || !document.body) return;
      if (enableDark) {
        if (!document.body.classList.contains('dark-theme')) docEl.dataset.pmAddedGemDark = '1';
        if (document.body.classList.contains('light-theme')) document.body.classList.remove('light-theme');
        if (!document.body.classList.contains('dark-theme')) document.body.classList.add('dark-theme');
      } else if (docEl.dataset.pmAddedGemDark === '1') {
        delete docEl.dataset.pmAddedGemDark;
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
      }
    },

    isVisuallyPainted() {
      return Boolean(
        document.querySelector('chat-app, rich-textarea, main, [role="main"], bard-sidenav, a[href*="ServiceLogin"]')
      );
    },

    isRouteMatch(c, d) {
      if (c === d) return true;
      if ((d === '/app' || d === '/') && (c === '/app' || c.startsWith('/app/'))) return true;
      if (d.startsWith('/gems') && c.startsWith('/gems')) return true;
      return false;
    },

    findNavEl(cleanTarget) {
      if (cleanTarget === '/app' || cleanTarget === '/') {
        return document.querySelector('a[href="/app"], button[aria-label*="New chat" i]');
      }
      if (cleanTarget.startsWith('/gems')) {
        return document.querySelector('a[href*="/gems"]');
      }
      return null;
    }
  };
}
