/**
 * FoxHub Per-App Optimizer — Claude (Anthropic)
 */

export function initOptimizer() {
  return {
    appId: 'claude',
    disableUnreadDetection: true,
    disableSmartInvert: true,

    syncDarkDom(enableDark) {
      const docEl = document.documentElement;
      if (!docEl) return;
      if (enableDark) {
        if (docEl.getAttribute('data-theme') !== 'dark') {
          docEl.dataset.pmAddedClaudeDark = '1';
          docEl.setAttribute('data-theme', 'dark');
          docEl.setAttribute('data-mode', 'dark');
        }
        docEl.style.colorScheme = 'dark';
      } else if (docEl.dataset.pmAddedClaudeDark === '1') {
        delete docEl.dataset.pmAddedClaudeDark;
        docEl.removeAttribute('data-theme');
        docEl.removeAttribute('data-mode');
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
      return Boolean(
        document.querySelector('[contenteditable="true"], main, fieldset, form, [data-testid="chat-input"], a[href*="login"]')
      );
    },

    isRouteMatch(c, d) {
      if (c === d) return true;
      if (d === '/' && (c === '/' || c.startsWith('/new') || c.startsWith('/chat/'))) return true;
      if (d.startsWith('/projects') && c.startsWith('/projects')) return true;
      return false;
    },

    findNavEl(cleanTarget) {
      if (cleanTarget === '/') {
        return document.querySelector('a[href="/new"], a[href="/"]');
      }
      if (cleanTarget.startsWith('/projects')) {
        return document.querySelector('a[href="/projects"], a[href*="/projects"]');
      }
      return null;
    }
  };
}
