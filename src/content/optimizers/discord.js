/**
 * FoxHub Per-App Optimizer — Discord
 */

export function initOptimizer() {
  function findNavEl(cleanTarget, iconType, label) {
    if (cleanTarget.startsWith('/store')) {
      return document.querySelector('a[href="/store"], a[href="/shop"], [aria-label="Nitro" i]');
    }
    if (cleanTarget.startsWith('/channels/@me')) {
      if (iconType === 'users' || (label || '').toLowerCase() === 'friends') {
        return document.querySelector('a[href="/channels/@me"], [aria-label="Friends" i], [data-list-item-id="guildsnav___home"]');
      }
      return document.querySelector('[data-list-item-id="guildsnav___home"], a[href="/channels/@me"], [aria-label="Direct Messages" i]');
    }
    return null;
  }

  return {
    appId: 'discord',
    disablePageMemory: true,
    disableSmartInvert: true,

    syncDomState() {
      if (!document.head || document.getElementById('pm-discord-hcaptcha-preconnect')) return;
      const hosts = ['https://newassets.hcaptcha.com', 'https://hcaptcha.com', 'https://assets.hcaptcha.com'];
      hosts.forEach((href, idx) => {
        const link = document.createElement('link');
        if (idx === 0) link.id = 'pm-discord-hcaptcha-preconnect';
        link.rel = 'preconnect';
        link.href = href;
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
      });
    },

    beforeSpaNavigate({ startPath, destPath, icon, label }, _ctx, helpers) {
      if (!startPath.startsWith('/channels/@me') && !startPath.startsWith('/store')) {
        const homeGuildBtn = document.querySelector('[data-list-item-id="guildsnav___home"], a[href="/channels/@me"]');
        if (homeGuildBtn && destPath.startsWith('/store')) {
          homeGuildBtn.click();
          setTimeout(() => {
            const storeEl = helpers.findNativeInAppNavElement('/store', icon, label);
            if (storeEl) storeEl.click();
            helpers.scheduleStaggeredRouteChecks();
          }, 90);
          return true;
        }
      }
      return false;
    },

    syncDarkDom(enableDark) {
      const docEl = document.documentElement;
      if (!docEl) return;
      if (enableDark) {
        if (docEl.classList.contains('theme-light')) {
          docEl.dataset.pmWasDcLight = '1';
          docEl.classList.remove('theme-light');
        }
        if (!docEl.classList.contains('theme-dark')) docEl.classList.add('theme-dark');
      } else if (docEl.dataset.pmWasDcLight === '1') {
        delete docEl.dataset.pmWasDcLight;
        docEl.classList.remove('theme-dark');
        docEl.classList.add('theme-light');
      }
    },

    getAppThemeCss() {
      return `
        html, body, .theme-dark {
          background-color: #000000 !important;
          --background-primary: #000000 !important;
          --background-secondary: #08080C !important;
          --background-secondary-alt: #0D0D13 !important;
          --background-tertiary: #000000 !important;
          --background-floating: #101018 !important;
          --text-normal: #F4F5F8 !important;
          --header-primary: #FFFFFF !important;
          --channels-default: #B8BCC8 !important;
        }
      `;
    },

    detectUnread() {
      const badges = document.querySelectorAll('[class*="numberBadge_"]');
      let domSum = 0;
      badges.forEach((b) => {
        const n = parseInt((b.textContent || '').trim(), 10);
        if (!isNaN(n) && n > 0) domSum += n;
      });
      return { unreadCount: domSum, hasUnread: domSum > 0 };
    },

    isVisuallyPainted() {
      return Boolean(
        document.querySelector(
          '#app-mount > div, [class*="sidebar_"], [class*="chat_"], form[class*="authBox"], div[class*="authBox"]'
        )
      );
    },

    isRouteMatch(c, d) {
      if (c === d) return true;
      if (d.startsWith('/channels/@me') && c.startsWith('/channels/@me')) return true;
      if (d.startsWith('/store') && (c.startsWith('/store') || c.startsWith('/shop'))) return true;
      return false;
    },

    findNavEl
  };
}
