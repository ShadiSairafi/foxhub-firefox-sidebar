/**
 * FoxHub Per-App Optimizer — WhatsApp Web
 */

export function initOptimizer() {
  return {
    appId: 'whatsapp',
    disablePageMemory: true,
    disableSmartInvert: true,

    getFitWidthFloor() {
      return 620;
    },

    syncDarkDom(enableDark) {
      const docEl = document.documentElement;
      if (!docEl) return;
      if (enableDark) {
        if (!docEl.classList.contains('dark') && !(document.body && document.body.classList.contains('dark'))) {
          docEl.dataset.pmAddedWaDark = '1';
        }
        if (!docEl.classList.contains('dark')) docEl.classList.add('dark');
        if (document.body && !document.body.classList.contains('dark')) document.body.classList.add('dark');
      } else if (docEl.dataset.pmAddedWaDark === '1') {
        delete docEl.dataset.pmAddedWaDark;
        docEl.classList.remove('dark');
        if (document.body) document.body.classList.remove('dark');
      }
    },

    getAppThemeCss() {
      return `
        html, body, body.dark {
          background-color: #000000 !important;
          --app-background: #000000 !important;
          --background-default: #000000 !important;
          --background-default-hover: #0F0F15 !important;
          --panel-header-background: #0A0A0F !important;
          --search-input-container-background: #0A0A0F !important;
          --search-input-background: #14141D !important;
          --compose-input-background: #14141D !important;
          --rich-text-panel-background: #0A0A0F !important;
          --incoming-background: #14141E !important;
          --primary-strong: #FFFFFF !important;
          --secondary: #B4B8C4 !important;
        }
      `;
    },

    detectUnread() {
      const badges = document.querySelectorAll('span[data-testid="icon-unread-count"], [aria-label*="unread message" i]');
      let domSum = 0;
      badges.forEach((b) => {
        const n = parseInt((b.textContent || '').trim(), 10);
        if (!isNaN(n) && n > 0) domSum += n;
      });
      return { unreadCount: domSum, hasUnread: domSum > 0 };
    },

    isVisuallyPainted() {
      return Boolean(document.querySelector('#app > div, #side, #main, canvas, [data-ref]'));
    },

    findNavEl() {
      return document.querySelector('button[aria-label="Chats" i], [data-icon="chat"]');
    }
  };
}
