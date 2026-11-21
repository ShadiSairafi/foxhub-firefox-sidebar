/**
 * FoxHub Per-App Optimizer — Google Keep
 * Uses hash-aware route matching so "/" and "/#reminders" remain distinct.
 */

export function initOptimizer() {
  function getHashFromUrl(urlStr) {
    try {
      return new URL(urlStr, window.location.origin).hash || '';
    } catch (_) {
      const idx = String(urlStr || '').indexOf('#');
      return idx >= 0 ? String(urlStr).slice(idx) : '';
    }
  }

  return {
    appId: 'google-keep',
    disableUnreadDetection: true,
    allowSmartInvert: true,

    isVisuallyPainted() {
      return Boolean(document.querySelector('.notes-container, [role="main"], [aria-label*="Take a note" i], form'));
    },

    isRouteMatch(c, d, _iconType, curUrl, destUrl) {
      const curHash = getHashFromUrl(curUrl || window.location.href).toLowerCase();
      const destHash = getHashFromUrl(destUrl || '').toLowerCase();
      if (destHash === '#reminders') {
        return curHash === '#reminders';
      }
      if (destUrl && !destHash) {
        return c === d && (curHash === '' || curHash === '#home');
      }
      return c === d && curHash === destHash;
    },

    findNavEl(_cleanTarget, _iconType, _label, destUrl) {
      const destHash = getHashFromUrl(destUrl || '').toLowerCase();
      if (destHash === '#reminders') {
        return document.querySelector('[href="#reminders"], [aria-label="Reminders" i]');
      }
      return document.querySelector('[href="#home"], [aria-label="Notes" i]');
    }
  };
}
