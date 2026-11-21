/**
 * FoxHub Per-App Optimizer — Google Calendar
 */

export function initOptimizer() {
  return {
    appId: 'google-calendar',
    disableUnreadDetection: true,
    allowSmartInvert: true,

    isVisuallyPainted() {
      return Boolean(document.querySelector('[role="main"], [data-viewkey], c-wiz, form'));
    },

    isRouteMatch(c, d) {
      if (c === d) return true;
      if (d.includes('/agenda') && c.includes('/agenda')) return true;
      if (d.includes('/week') && c.includes('/week')) return true;
      return false;
    },

    findNavEl(cleanTarget) {
      if (cleanTarget.includes('/agenda')) {
        return document.querySelector('[data-viewkey="agenda"], a[href*="/agenda"]');
      }
      if (cleanTarget.includes('/week')) {
        return document.querySelector('[data-viewkey="week"], a[href*="/week"]');
      }
      return null;
    }
  };
}
