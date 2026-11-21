/**
 * FoxHub Per-App Optimizer — Telegram Web (K & A)
 */

export function initOptimizer() {
  return {
    appId: 'telegram',
    disablePageMemory: true,
    disableSmartInvert: true,

    syncDarkDom(enableDark) {
      const docEl = document.documentElement;
      if (!docEl) return;
      if (enableDark) {
        if (!docEl.classList.contains('night') && !docEl.classList.contains('theme-dark')) {
          docEl.dataset.pmAddedTgDark = '1';
        }
        if (docEl.classList.contains('theme-light')) {
          docEl.dataset.pmWasTgLight = '1';
          docEl.classList.remove('theme-light');
        }
        if (!docEl.classList.contains('night')) docEl.classList.add('night');
        if (!docEl.classList.contains('theme-dark')) docEl.classList.add('theme-dark');
      } else if (docEl.dataset.pmAddedTgDark === '1') {
        delete docEl.dataset.pmAddedTgDark;
        docEl.classList.remove('night', 'theme-dark');
        if (docEl.dataset.pmWasTgLight === '1') {
          delete docEl.dataset.pmWasTgLight;
          docEl.classList.add('theme-light');
        }
      }
    },

    getAppThemeCss() {
      return `
        html, html.night, html.theme-dark, body {
          background-color: #000000 !important;
          color: #FFFFFF !important;
          --body-background-color: #000000 !important;
          --surface-color: #0E0E14 !important;
          --primary-text-color: #FFFFFF !important;
          --secondary-text-color: #B4B8C4 !important;
          --color-background: #000000 !important;
          --color-background-secondary: #0E0E14 !important;
          --color-text: #FFFFFF !important;
          --color-text-secondary: #B4B8C4 !important;
        }
        #auth-pages, #auth-flow-root, .auth-pages, #MiddleColumn, #LeftColumn, .chatlist-container {
          background-color: #000000 !important;
          color: #FFFFFF !important;
        }
      `;
    },

    isVisuallyPainted() {
      const pageChats = document.getElementById('page-chats');
      if (pageChats && pageChats.style.display !== 'none' && pageChats.offsetHeight > 20) return true;
      return Boolean(
        document.querySelector(
          '#auth-flow-root, #auth-pages, .auth-pages, #MiddleColumn, #LeftColumn, .Auth, .qr-container, .chatlist-parts'
        )
      );
    },

    findNavEl(cleanTarget) {
      if (cleanTarget === '/k' || cleanTarget === '/a' || cleanTarget === '/') {
        return document.querySelector('.sidebar-close-button, button.btn-icon.sidebar-back-button');
      }
      return null;
    }
  };
}
