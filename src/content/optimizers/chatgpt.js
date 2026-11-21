/**
 * FoxHub Per-App Optimizer — ChatGPT
 */

export function initOptimizer() {
  return {
    appId: 'chatgpt',
    disableUnreadDetection: true,
    disableSmartInvert: true,

    syncDarkDom(enableDark) {
      const docEl = document.documentElement;
      if (!docEl) return;
      if (enableDark) {
        if (!docEl.classList.contains('dark')) docEl.dataset.pmAddedGptDark = '1';
        if (docEl.classList.contains('light')) docEl.classList.remove('light');
        if (!docEl.classList.contains('dark')) docEl.classList.add('dark');
        if (docEl.style.colorScheme !== 'dark') docEl.style.colorScheme = 'dark';
      } else if (docEl.dataset.pmAddedGptDark === '1') {
        delete docEl.dataset.pmAddedGptDark;
        docEl.classList.remove('dark');
        docEl.classList.add('light');
        docEl.style.colorScheme = '';
      }
    },

    isVisuallyPainted() {
      return Boolean(document.querySelector('#prompt-textarea, main, nav, form, [data-testid="login-button"]'));
    },

    isRouteMatch(c, d) {
      if (c === d) return true;
      if (d === '/' && c === '/') return true;
      if (d.startsWith('/gpts') && c.startsWith('/gpts')) return true;
      return false;
    },

    findNavEl(cleanTarget) {
      if (cleanTarget === '/') {
        return document.querySelector('a[data-testid="create-new-chat-button"], a[href="/"]');
      }
      if (cleanTarget.startsWith('/gpts')) {
        return document.querySelector('a[href="/gpts"], a[href*="/gpts"]');
      }
      return null;
    }
  };
}
