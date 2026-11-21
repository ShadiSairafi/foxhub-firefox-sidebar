/**
 * FoxHub Per-App Optimizer — Notion
 */

export function initOptimizer() {
  return {
    appId: 'notion',
    disableUnreadDetection: true,
    disableSmartInvert: true,

    syncDarkDom(enableDark) {
      const docEl = document.documentElement;
      if (!docEl || !document.body) return;
      if (enableDark) {
        if (!document.body.classList.contains('dark')) docEl.dataset.pmAddedNotionDark = '1';
        document.body.classList.add('dark', 'notion-dark-theme');
        docEl.style.colorScheme = 'dark';
      } else if (docEl.dataset.pmAddedNotionDark === '1') {
        delete docEl.dataset.pmAddedNotionDark;
        document.body.classList.remove('dark', 'notion-dark-theme');
        docEl.style.colorScheme = '';
      }
    },

    getAppThemeCss() {
      return `
        html, body, #notion-app, .notion-app-inner, .notion-frame {
          background-color: #000000 !important;
          color: #F4F5F8 !important;
        }
      `;
    },

    isVisuallyPainted() {
      return Boolean(document.querySelector('.notion-app-inner, .notion-frame, .notion-page-content, main, form'));
    },

    findNavEl(cleanTarget) {
      if (cleanTarget === '/') return document.querySelector('a[href="/"]');
      return null;
    }
  };
}
