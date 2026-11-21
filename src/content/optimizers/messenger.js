/**
 * FoxHub Per-App Optimizer — Messenger
 */

export function initOptimizer() {
  return {
    appId: 'messenger',
    disablePageMemory: true,
    disableSmartInvert: true,

    syncDomState(pendingSpaTarget) {
      const root = document.documentElement;
      if (!root) return;
      const mainEl = document.querySelector('div[role="main"]');
      const hasMountedConversation = Boolean(
        mainEl && mainEl.children.length > 0 && !mainEl.classList.contains('xlshs6z')
      );
      const msgView =
        pendingSpaTarget && pendingSpaTarget.messengerView
          ? pendingSpaTarget.messengerView
          : hasMountedConversation
          ? 'thread'
          : 'inbox';
      if (root.getAttribute('data-pm-messenger-view') !== msgView) {
        root.setAttribute('data-pm-messenger-view', msgView);
      }
    },

    buildPendingSpaTarget() {
      return { messengerView: 'inbox' };
    },

    syncDarkDom(enableDark) {
      const docEl = document.documentElement;
      if (!docEl) return;
      if (enableDark) {
        if (!docEl.classList.contains('__fb-dark-mode')) docEl.dataset.pmAddedFbDark = '1';
        if (docEl.classList.contains('__fb-light-mode')) {
          docEl.dataset.pmWasFbLight = '1';
          docEl.classList.remove('__fb-light-mode');
        }
        if (!docEl.classList.contains('__fb-dark-mode')) docEl.classList.add('__fb-dark-mode');
        if (document.body) {
          if (document.body.classList.contains('__fb-light-mode')) document.body.classList.remove('__fb-light-mode');
          if (!document.body.classList.contains('__fb-dark-mode')) document.body.classList.add('__fb-dark-mode');
        }
      } else if (docEl.dataset.pmAddedFbDark === '1') {
        delete docEl.dataset.pmAddedFbDark;
        docEl.classList.remove('__fb-dark-mode');
        if (document.body) document.body.classList.remove('__fb-dark-mode');
        if (docEl.dataset.pmWasFbLight === '1') {
          delete docEl.dataset.pmWasFbLight;
          docEl.classList.add('__fb-light-mode');
          if (document.body) document.body.classList.add('__fb-light-mode');
        }
      }
    },

    getAppThemeCss() {
      return `
        html, body, .__fb-dark-mode {
          background-color: #000000 !important;
          color: #F5F6F8 !important;
          --surface-background: #000000 !important;
          --web-wash: #000000 !important;
          --card-background: #0E0E14 !important;
          --card-background-flat: #0E0E14 !important;
          --hosted-view-selected-state: rgba(255, 255, 255, 0.10) !important;
          --primary-text: #FFFFFF !important;
          --secondary-text: #B8BCC8 !important;
        }
      `;
    },

    isVisuallyPainted() {
      return Boolean(document.querySelector('[role="main"], [role="navigation"], form'));
    },

    isRouteMatch(c, d) {
      if (c === d) return true;
      if (d.startsWith('/requests') && c.startsWith('/requests')) return true;
      if (d.startsWith('/archived') && c.startsWith('/archived')) return true;
      if (d === '/' && (c === '/' || c.startsWith('/t/') || c.startsWith('/e2ee/t/'))) return true;
      return false;
    },

    findNavEl(cleanTarget) {
      if (cleanTarget.startsWith('/requests')) {
        return document.querySelector('a[href*="/requests"], [aria-label*="Requests" i], [aria-label*="Message requests" i]');
      }
      if (cleanTarget.startsWith('/archived')) {
        return document.querySelector('a[href*="/archived"], [aria-label*="Archive" i], [aria-label*="Archived chats" i]');
      }
      if (cleanTarget === '/') {
        return document.querySelector('a[aria-label="Chats" i], [role="navigation"] [aria-label="Chats" i], a[href^="/t/"]');
      }
      return null;
    }
  };
}
