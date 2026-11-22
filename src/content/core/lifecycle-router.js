/**
 * FoxHub Content Core — Lifecycle Router, Playback Reporting, Commands,
 * Unread Detection, SPA Navigation & Quick Switcher / App Shortcut Relay
 */

import { detectPageFaviconUrl, injectAppThemeCss } from './theme-engine.js';
import {
  getCachedShortcutBindings,
  syncFrameSettingsCache
} from './notification-mute.js';
import { updateVideoLoadbarConfig } from './scrubber-loadbar.js';
import { checkPersistentRouteRestore } from './page-memory.js';
import {
  ensureMirroredPlayback,
  extractRichTrackMeta,
  getActiveMediaElement,
  getCapturedMediaSessionHandlers,
  getTrackedMediaElements,
  isAudioMirrorActive,
  isMediaElementAudible,
  isShouldDebounceSkip,
  startLocalMseAudioBridge,
  stopLocalMseAudioBridge
} from './media-mirror.js';

let webNotificationUnreadCount = 0;
let lastReportedUnread = -1;
let lastReportedHasUnread = false;
let zeroUnreadStreak = 0;

export function bumpWebNotificationUnread() {
  webNotificationUnreadCount = Math.min(99, webNotificationUnreadCount + 1);
}

export function formatFrameKeyCombo(ev) {
  if (!ev || ev.repeat) return '';
  if (ev.getModifierState && ev.getModifierState('AltGraph')) return '';
  const k = ev.key || '';
  if (k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta' || k === 'OS') return '';

  const isFnKey = /^F([1-9]|1[0-2])$/i.test(k);
  const useCtrl = Boolean(ev.ctrlKey || ev.metaKey);
  const useAlt = Boolean(ev.altKey);
  const useShift = Boolean(ev.shiftKey);
  const modCount = (useCtrl ? 1 : 0) + (useAlt ? 1 : 0) + (useShift ? 1 : 0);

  if (!isFnKey && !useCtrl && !useAlt) return '';
  if (modCount > 2) return '';

  let keyToken = '';
  const code = ev.code || '';
  if (/^Key([A-Z])$/.test(code)) {
    keyToken = code.slice(3).toUpperCase();
  } else if (/^Digit([0-9])$/.test(code)) {
    keyToken = code.slice(5);
  } else if (isFnKey) {
    keyToken = k.toUpperCase();
  } else if (code === 'Comma') {
    keyToken = 'Comma';
  } else if (code === 'Period') {
    keyToken = 'Period';
  } else if (code === 'Space') {
    keyToken = 'Space';
  } else if (code === 'Home' || code === 'End' || code === 'PageUp' || code === 'PageDown' || code === 'Insert') {
    keyToken = code;
  } else if (code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight') {
    keyToken = code.replace('Arrow', '');
  } else if (k.length === 1 && /[a-z0-9]/i.test(k)) {
    keyToken = k.toUpperCase();
  }
  if (!keyToken) return '';

  const parts = [];
  if (useCtrl) parts.push('Ctrl');
  if (useAlt) parts.push('Alt');
  if (useShift) parts.push('Shift');
  parts.push(keyToken);
  return parts.join('+');
}

function normalizeConfiguredShortcut(str) {
  return String(str || '')
    .trim()
    .replace(/\b(Command|MacCtrl|Control)\b/gi, 'Ctrl')
    .toLowerCase();
}

export function initLifecycleRouter(ctx, opt = null) {
  if (ctx.isSwBootstrap || (!ctx.isFoxHubMediaFrame && !ctx.isPocketMailSidebarTop)) return;

  window.addEventListener(
    'pointerdown',
    () => {
      if (webNotificationUnreadCount > 0) {
        webNotificationUnreadCount = 0;
      }
    },
    { passive: true }
  );

  // Unregister cached ServiceWorkers on domains where SW caches frame-blocking headers
  if (
    ctx.hasHost('youtube.com') ||
    ctx.hasHost('whatsapp.com') ||
    ctx.hasHost('x.com') ||
    ctx.hasHost('twitter.com') ||
    ctx.hasHost('telegram.org') ||
    !ctx.isKnownBuiltInHost
  ) {
    try {
      if (navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function') {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          if (regs && regs.length > 0) {
            return Promise.all(regs.map((r) => r.unregister()));
          }
          return null;
        }).catch(() => {});
      }
      if (window.caches && typeof window.caches.keys === 'function') {
        window.caches.keys().then((keys) => {
          if (keys && keys.length > 0) {
            return Promise.all(keys.map((k) => window.caches.delete(k)));
          }
          return null;
        }).catch(() => {});
      }
    } catch (_) {}
  }

  function resolveClickableRouterNode(el) {
    if (!el) return null;
    if (el.tagName === 'A' && el.hasAttribute('href')) return el;
    const parentAnchor = el.closest ? el.closest('a[href]') : null;
    if (parentAnchor) return parentAnchor;
    const childAnchor = el.querySelector ? el.querySelector('a[href]') : null;
    if (childAnchor) return childAnchor;
    if (el.tagName === 'BUTTON' || el.getAttribute?.('role') === 'button' || el.getAttribute?.('role') === 'tab') {
      return el;
    }
    const parentBtn = el.closest ? el.closest('button, [role="button"], [role="link"], [role="tab"]') : null;
    if (parentBtn) return parentBtn;
    const childBtn = el.querySelector ? el.querySelector('button, [role="button"], [role="link"], [role="tab"]') : null;
    return childBtn || el;
  }

  function isRouteMatchForApp(curPath, destPath, iconType = '', curUrl = window.location.href, destUrl = '') {
    const c = (curPath || '/').replace(/\/+$/, '') || '/';
    const d = (destPath || '/').replace(/\/+$/, '') || '/';
    if (opt && typeof opt.isRouteMatch === 'function') {
      const matched = opt.isRouteMatch(c, d, iconType, curUrl, destUrl);
      if (typeof matched === 'boolean') return matched;
    }
    return c === d;
  }

  function syncAppSpecificDomState() {
    const root = document.documentElement;
    if (!root) return;
    const path = window.location.pathname || '/';
    root.setAttribute('data-pm-path', path);

    const cleanCur = path.replace(/\/+$/, '') || '/';
    if (ctx.state.pendingSpaTarget) {
      const pTarget = ctx.state.pendingSpaTarget;
      if (
        Date.now() > pTarget.expiresAt ||
        isRouteMatchForApp(cleanCur, pTarget.destPath, pTarget.icon, window.location.href, pTarget.destUrl || '')
      ) {
        ctx.state.pendingSpaTarget = null;
      }
    }

    if (opt && typeof opt.syncDomState === 'function') {
      try {
        opt.syncDomState(ctx.state.pendingSpaTarget, ctx);
      } catch (_) {}
    }

    const gsiPicker = document.getElementById('credential_picker_container');
    if (gsiPicker) gsiPicker.remove();
    ctx.ensureStylesheetOrder();
  }

  function getOwnProfileUrlForCurrentHost() {
    if (opt && typeof opt.resolveOwnProfileUrl === 'function') {
      try {
        return opt.resolveOwnProfileUrl(ctx) || '';
      } catch (_) {}
    }
    return '';
  }

  function detectUnreadState() {
    if (
      (opt && opt.disableUnreadDetection) ||
      ctx.hasHost('spotify.com') ||
      ctx.hasHost('youtube.com') ||
      ctx.hasHost('youtu.be') ||
      ctx.hasHost('twitch.tv') ||
      ctx.hasHost('chatgpt.com') ||
      ctx.hasHost('openai.com') ||
      ctx.hasHost('gemini.google.com') ||
      ctx.hasHost('claude.ai') ||
      ctx.hasHost('anthropic.com') ||
      ctx.hasHost('perplexity.ai') ||
      ctx.hasHost('soundcloud.com') ||
      ctx.hasHost('sndcdn.com') ||
      ctx.hasHost('music.apple.com') ||
      ctx.hasHost('notion.so') ||
      ctx.hasHost('notion.site') ||
      ctx.hasHost('calendar.google.com') ||
      ctx.hasHost('keep.google.com')
    ) {
      return;
    }

    let unreadCount = webNotificationUnreadCount;
    let hasUnread = webNotificationUnreadCount > 0;
    const title = document.title || '';

    if (!(opt && opt.skipTitleUnread)) {
      const titleMatch = title.match(/^\s*[\(\[](\d{1,3})\+?[\)\]]\s+/);
      if (titleMatch && titleMatch[1]) {
        const parsedTitleCount = parseInt(titleMatch[1], 10) || 0;
        if (parsedTitleCount > unreadCount) unreadCount = parsedTitleCount;
      }
      if (title.trim().startsWith('•') || title.trim().startsWith('●') || title.trim().startsWith('* ')) {
        hasUnread = true;
      }
    }

    try {
      if (opt && typeof opt.detectUnread === 'function') {
        const res = opt.detectUnread(ctx);
        if (res && typeof res === 'object') {
          if (typeof res.unreadCount === 'number' && res.unreadCount > unreadCount) {
            unreadCount = res.unreadCount;
          }
          if (res.hasUnread) hasUnread = true;
        }
      } else {
        const genericBadges = document.querySelectorAll(
          '[data-unread-count], [aria-label*="unread notification" i], [aria-label*="unread message" i], [aria-label*="new notification" i], .mail-status.unread, [data-target="notification-indicator.badge"]:not([hidden])'
        );
        genericBadges.forEach((el) => {
          const attrCount = parseInt(el.getAttribute('data-unread-count') || '', 10);
          if (!isNaN(attrCount) && attrCount > unreadCount) unreadCount = attrCount;
          const txtCount = parseInt((el.textContent || '').trim(), 10);
          if (!isNaN(txtCount) && txtCount > 0 && txtCount < 1000 && txtCount > unreadCount) unreadCount = txtCount;
          const style = window.getComputedStyle(el);
          if (style && style.display !== 'none' && style.visibility !== 'hidden') {
            hasUnread = true;
          }
        });
      }
    } catch (_) {}

    if (unreadCount > 0) hasUnread = true;

    const isRouteTransition = Date.now() - ctx.state.lastRouteOrClickAt < 5000;
    const curPath = (window.location.pathname || '').toLowerCase();
    const onInboxOrNotifRoute =
      curPath.startsWith('/messages') ||
      curPath.startsWith('/i/chat') ||
      curPath.startsWith('/notifications') ||
      curPath.startsWith('/direct');

    if (unreadCount === 0 && !hasUnread && (lastReportedUnread > 0 || lastReportedHasUnread)) {
      if (isRouteTransition) return;
      zeroUnreadStreak++;
      if (!onInboxOrNotifRoute && zeroUnreadStreak < 3) return;
    } else {
      zeroUnreadStreak = 0;
    }

    if (unreadCount !== lastReportedUnread || hasUnread !== lastReportedHasUnread) {
      lastReportedUnread = unreadCount;
      lastReportedHasUnread = hasUnread;
      ctx.notifyParent('PM_FRAME_UNREAD_UPDATE', {
        unreadCount,
        hasUnread,
        isRouteTransition,
        title
      });
    }
  }

  let visualReadySent = false;
  function isAppVisuallyPainted() {
    if (!document.body) return false;
    try {
      if (opt && typeof opt.isVisuallyPainted === 'function') {
        if (opt.isVisuallyPainted(ctx)) return true;
      }
      const paintedEl = document.querySelector('main, [role="main"], nav, article, canvas, video, form, textarea');
      if (paintedEl) return true;
      return document.body.children.length > 0 && document.body.scrollHeight > 80;
    } catch (_) {
      return true;
    }
  }

  function checkAndNotifyVisualReady() {
    if (visualReadySent) return;
    if (ctx.isFoxHubContext && !ctx.initialThemeResolved) return;
    if (document.documentElement && document.documentElement.hasAttribute('data-pm-x-light-pending')) return;
    if (isAppVisuallyPainted()) {
      visualReadySent = true;
      ctx.notifyParent('PM_FRAME_VISUAL_READY', {
        title: document.title || '',
        faviconUrl: detectPageFaviconUrl(),
        ownProfileUrl: getOwnProfileUrlForCurrentHost()
      });
    }
  }

  function startVisualPaintWatcher() {
    visualReadySent = false;
    checkAndNotifyVisualReady();
    if (visualReadySent) return;
    requestAnimationFrame(() => checkAndNotifyVisualReady());
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      checkAndNotifyVisualReady();
      if (visualReadySent || attempts > 55) {
        clearInterval(timer);
        if (!visualReadySent) {
          visualReadySent = true;
          ctx.notifyParent('PM_FRAME_VISUAL_READY', {
            title: document.title || '',
            faviconUrl: detectPageFaviconUrl(),
            ownProfileUrl: getOwnProfileUrlForCurrentHost()
          });
        }
      }
    }, 20);
  }

  // Signal PM_FRAME_START and run fast early paint watcher
  ctx.notifyParent('PM_FRAME_START');
  let earlyReadySent = false;
  const earlyPaintTimer = setInterval(() => {
    if (earlyReadySent || document.readyState === 'complete') {
      clearInterval(earlyPaintTimer);
      return;
    }
    if (ctx.isFoxHubContext && !ctx.initialThemeResolved) return;
    if (document.documentElement && document.documentElement.hasAttribute('data-pm-x-light-pending')) return;
    const hasBodyContent = Boolean(document.body && document.body.children && document.body.children.length > 0);
    if (hasBodyContent && isAppVisuallyPainted()) {
      earlyReadySent = true;
      clearInterval(earlyPaintTimer);
      syncAppSpecificDomState();
      ctx.notifyParent('PM_FRAME_DOM_READY', {
        title: document.title || '',
        ownProfileUrl: getOwnProfileUrlForCurrentHost()
      });
    }
  }, 35);

  if (document.documentElement) {
    syncAppSpecificDomState();
  } else {
    const domObs = new MutationObserver(() => {
      if (document.documentElement) {
        syncAppSpecificDomState();
        domObs.disconnect();
      }
    });
    domObs.observe(document, { childList: true });
  }

  let lastHref = window.location.href;
  let lastReportedUrl = '';
  let routeCheckTimers = [];
  let spTabPauseVerifyTimer = null;
  let lastAutoPlayedWatchKey = '';
  let lastUserGestureAt = 0;

  function getReportedFrameUrl() {
    if (opt && typeof opt.getReportedUrl === 'function') {
      const customUrl = opt.getReportedUrl(ctx);
      if (customUrl) return customUrl;
    }
    return window.location.href;
  }

  function pauseActiveVideosSoftly() {
    try {
      getTrackedMediaElements().forEach((v) => {
        try {
          if (!v.paused) v.pause();
        } catch (_) {}
      });
    } catch (_) {}
  }

  function freeHeavyMediaResources() {
    try {
      getTrackedMediaElements().forEach((v) => {
        try {
          v.pause();
          v.removeAttribute('src');
          v.load();
        } catch (_) {}
      });
    } catch (_) {}
  }

  function handleRouteOrStateCheck() {
    const currentReported = getReportedFrameUrl();
    if (window.location.href !== lastHref || (currentReported && currentReported !== lastReportedUrl)) {
      const prevPath = (() => {
        try {
          return new URL(lastHref).pathname;
        } catch (_) {
          return '';
        }
      })();
      lastHref = window.location.href;
      lastReportedUrl = currentReported;
      ctx.state.lastRouteOrClickAt = Date.now();
      const curPath = window.location.pathname || '/';

      if (opt && typeof opt.onRouteChanged === 'function') {
        try {
          opt.onRouteChanged(prevPath, curPath, ctx, { pauseActiveVideosSoftly });
        } catch (_) {}
      }

      syncAppSpecificDomState();
      checkPersistentRouteRestore();
      ctx.notifyParent('PM_FRAME_URL_CHANGED', {
        url: currentReported,
        title: document.title || '',
        faviconUrl: detectPageFaviconUrl(),
        ownProfileUrl: getOwnProfileUrlForCurrentHost()
      });
      setTimeout(() => {
        try {
          reportLivePlaybackState();
        } catch (_) {}
      }, 20);
    }
    syncAppSpecificDomState();
    detectUnreadState();
    if (opt && typeof opt.onPeriodicCheck === 'function') {
      try {
        opt.onPeriodicCheck(ctx);
      } catch (_) {}
    }
    checkAndNotifyVisualReady();
  }

  function scheduleStaggeredRouteChecks() {
    routeCheckTimers.forEach((t) => clearTimeout(t));
    routeCheckTimers = [16, 60, 140, 260, 480, 850].map((delay) =>
      setTimeout(() => {
        if (window.location.href !== lastHref || getReportedFrameUrl() !== lastReportedUrl) {
          handleRouteOrStateCheck();
        } else {
          syncAppSpecificDomState();
        }
      }, delay)
    );
  }

  // Setup fast SPA observer WITHOUT wrapping History.prototype (avoids DataCloneError in Firefox)
  try {
    if (window.navigation && typeof window.navigation.addEventListener === 'function') {
      window.navigation.addEventListener('navigate', () => {
        setTimeout(handleRouteOrStateCheck, 15);
      });
    }
  } catch (_) {}
  window.addEventListener('popstate', handleRouteOrStateCheck, { passive: true });
  window.addEventListener('hashchange', handleRouteOrStateCheck, { passive: true });
  window.addEventListener('wheel', scheduleStaggeredRouteChecks, { passive: true });
  document.addEventListener(
    'click',
    (e) => {
      ctx.state.lastRouteOrClickAt = Date.now();
      if (opt && typeof opt.onDocumentClick === 'function') {
        try {
          opt.onDocumentClick(e, ctx, { syncAppSpecificDomState });
        } catch (_) {}
      }
      scheduleStaggeredRouteChecks();
    },
    { passive: true }
  );

  function attachTitleObserver() {
    const titleEl = document.querySelector('head > title');
    if (!titleEl || titleEl.dataset.pmObserved) return;
    titleEl.dataset.pmObserved = '1';
    const titleObs = new MutationObserver(() => {
      if (window.location.href !== lastHref) {
        handleRouteOrStateCheck();
      } else {
        detectUnreadState();
      }
    });
    titleObs.observe(titleEl, { childList: true, characterData: true, subtree: true });
  }

  function findNativeInAppNavElement(destPath, iconType = '', label = '', destUrl = '') {
    const cleanTarget = (destPath || '/').replace(/\/+$/, '') || '/';
    try {
      if (opt && typeof opt.findNavEl === 'function') {
        const el = opt.findNavEl(cleanTarget, iconType, label, destUrl, { resolveClickableRouterNode });
        if (el) return resolveClickableRouterNode(el);
      }
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      for (const a of anchors) {
        try {
          const u = new URL(a.getAttribute('href') || a.href, window.location.origin);
          if (u.origin !== window.location.origin) continue;
          const p = (u.pathname || '/').replace(/\/+$/, '') || '/';
          if (p === cleanTarget) return a;
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  }

  function performSmoothSpaNavigation(targetUrl, label = '', icon = '') {
    if (!targetUrl) return;
    ctx.state.lastRouteOrClickAt = Date.now();

    if (icon === 'profile' || targetUrl.endsWith('/profile')) {
      const ownProfUrl = getOwnProfileUrlForCurrentHost();
      if (ownProfUrl) targetUrl = ownProfUrl;
    }

    let dest = null;
    try {
      dest = new URL(targetUrl, window.location.href);
    } catch (_) {
      window.location.href = targetUrl;
      return;
    }

    if (dest.origin !== window.location.origin) {
      pauseActiveVideosSoftly();
      try {
        if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmStopYtMirror === 'function') {
          window.wrappedJSObject.__pmStopYtMirror();
        }
      } catch (_) {}
      ctx.notifyParent('PM_FRAME_NAV_START', { title: label ? `Opening ${label}…` : undefined });
      window.location.href = targetUrl;
      return;
    }

    const startPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    const destPath = (dest.pathname || '/').replace(/\/+$/, '') || '/';

    if (opt && typeof opt.beforeSpaNavigate === 'function') {
      const handled = opt.beforeSpaNavigate(
        {
          dest,
          targetUrl,
          startPath,
          destPath,
          icon,
          label
        },
        ctx,
        {
          pauseActiveVideosSoftly,
          syncAppSpecificDomState,
          scheduleStaggeredRouteChecks,
          findNativeInAppNavElement
        }
      );
      if (handled) return;
    }

    const extraPending = opt && typeof opt.buildPendingSpaTarget === 'function'
      ? opt.buildPendingSpaTarget(destPath, icon, dest.href)
      : {};

    ctx.state.pendingSpaTarget = {
      destPath,
      destUrl: dest.href,
      icon,
      expiresAt: Date.now() + 1800,
      ...(extraPending || {})
    };
    syncAppSpecificDomState();

    const nativeEl = findNativeInAppNavElement(dest.pathname, icon, label, dest.href);
    if (nativeEl) {
      nativeEl.click();
      scheduleStaggeredRouteChecks();
      setTimeout(() => {
        const curPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
        if (isRouteMatchForApp(curPath, destPath, icon, window.location.href, dest.href) || curPath !== startPath) {
          handleRouteOrStateCheck();
          return;
        }
        if (destPath === '/profile' || icon === 'profile') {
          const ownUrl = getOwnProfileUrlForCurrentHost();
          if (ownUrl) window.location.href = ownUrl;
        } else if (!ctx.hasHost('whatsapp.com') && !ctx.hasHost('discord.com')) {
          window.location.href = targetUrl;
        }
      }, 1100);
      return;
    }

    if (isRouteMatchForApp(startPath, destPath, icon, window.location.href, dest.href) && !dest.search && !dest.hash) {
      handleRouteOrStateCheck();
      return;
    }

    try {
      const tempA = document.createElement('a');
      tempA.href = dest.pathname + dest.search + dest.hash;
      tempA.style.display = 'none';
      document.body.appendChild(tempA);
      tempA.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0 }));
      tempA.remove();
    } catch (_) {}

    scheduleStaggeredRouteChecks();

    setTimeout(() => {
      const curPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
      if (!isRouteMatchForApp(curPath, destPath, icon, window.location.href, dest.href) && curPath === startPath) {
        if (destPath === '/profile' || icon === 'profile') {
          const ownUrl = getOwnProfileUrlForCurrentHost();
          if (ownUrl) window.location.href = ownUrl;
        } else if (!ctx.hasHost('whatsapp.com')) {
          window.location.href = targetUrl;
        }
      } else {
        handleRouteOrStateCheck();
      }
    }, 550);
  }

  function reportLivePlaybackState() {
    try {
      if (ctx.isStandbyBgFrame) return;

      let isPlaying = false;
      let currentTime = 0;
      let resumeUrl = window.location.href;

      const mediaEl = ctx.hasHost('spotify.com') ? null : getActiveMediaElement(ctx);
      if (mediaEl) {
        currentTime = Math.floor(mediaEl.currentTime || 0);
        const isAudibleMediaEl =
          isAudioMirrorActive(ctx) ||
          ctx.state.bgAudioMseBridgeStarted ||
          isMediaElementAudible(ctx, mediaEl);
        if (!mediaEl.paused && !mediaEl.ended && isAudibleMediaEl) {
          isPlaying = true;
        } else if (
          !ctx.state.isTabAudioAutoPaused &&
          ctx.state.bgAudioMseBridgeStarted &&
          mediaEl.paused &&
          !mediaEl.ended &&
          mediaEl.readyState >= 2
        ) {
          mediaEl.play().catch(() => {});
          isPlaying = true;
        }
      }

      const trackMeta = extractRichTrackMeta(ctx, opt, mediaEl, true);
      if (!currentTime && trackMeta.currentTime > 0) {
        currentTime = Math.floor(trackMeta.currentTime);
      }

      let stateObj = {
        isPlaying,
        currentTime,
        duration: trackMeta.duration || 0,
        resumeUrl,
        title: trackMeta.title || document.title || '',
        artist: trackMeta.artist || '',
        album: trackMeta.album || '',
        artworkUrl: trackMeta.artworkUrl || '',
        canPrev: trackMeta.canPrev !== false,
        canNext: trackMeta.canNext !== false
      };

      if (opt && typeof opt.adjustPlaybackState === 'function') {
        stateObj = opt.adjustPlaybackState(stateObj, ctx, mediaEl) || stateObj;
      }

      const curAutoplayPolicy =
        typeof navigator.getAutoplayPolicy === 'function' ? navigator.getAutoplayPolicy('mediaelement') : 'allowed';

      if (ctx.isStandbyBgFrame) return;

      const reportVol =
        mediaEl && !isAudioMirrorActive(ctx) && !ctx.state.bgAudioMseBridgeStarted && typeof mediaEl.volume === 'number'
          ? Math.min(1, Math.max(0, Number(mediaEl.volume)))
          : undefined;
      const reportMuted =
        mediaEl && !isAudioMirrorActive(ctx) && !ctx.state.bgAudioMseBridgeStarted
          ? Boolean(mediaEl.muted)
          : undefined;

      ctx.notifyParent('PM_FRAME_PLAYBACK_STATE', {
        isPlaying: Boolean(stateObj.isPlaying),
        currentTime: Number(stateObj.currentTime) || 0,
        duration: Number(stateObj.duration) || 0,
        resumeUrl: stateObj.resumeUrl || window.location.href,
        title: stateObj.title || document.title || '',
        artist: stateObj.artist || '',
        album: stateObj.album || '',
        artworkUrl: stateObj.artworkUrl || '',
        canPrev: stateObj.canPrev !== false,
        canNext: stateObj.canNext !== false,
        volume: reportVol,
        muted: reportMuted,
        initialAutoplayPolicy: ctx.initialAutoplayPolicy,
        autoplayBlocked: Boolean(ctx.state.bgAudioAutoplayBlocked)
      });

      // 1. Background audio auto-resume when running in background.html pool
      if (!ctx.state.bgAudioAutoResumed && ctx.isBgAudioFrame && !ctx.state.isTabAudioAutoPaused) {
        if (opt && typeof opt.handleBgAutoResume === 'function') {
          const handled = opt.handleBgAutoResume(ctx, stateObj, mediaEl, {
            startLocalMseAudioBridge: (el) => startLocalMseAudioBridge(ctx, el),
            curAutoplayPolicy
          });
          if (handled) return;
        }
        if (isAudioMirrorActive(ctx)) {
          if (mediaEl && !mediaEl.paused && !mediaEl.ended) {
            ctx.state.bgAudioAutoResumed = true;
          } else {
            ensureMirroredPlayback();
          }
        } else if (mediaEl && mediaEl.readyState >= 2) {
          if (curAutoplayPolicy === 'allowed') {
            if (!mediaEl.paused && !mediaEl.muted && mediaEl.volume > 0) {
              ctx.state.bgAudioAutoResumed = true;
            } else {
              mediaEl.muted = false;
              mediaEl.volume = 1.0;
              mediaEl
                .play()
                .then(() => {
                  ctx.state.bgAudioAutoResumed = true;
                })
                .catch(() => {
                  startLocalMseAudioBridge(ctx, mediaEl);
                });
            }
          } else {
            startLocalMseAudioBridge(ctx, mediaEl);
          }
        }
      }

      // 2. Sidebar reopened auto-resume or YouTube /watch autoplay
      if (!ctx.isBgAudioFrame && !ctx.isStandbyBgFrame && !ctx.state.isTabAudioAutoPaused) {
        if (ctx.state.sidebarAutoResumeRequested && opt && typeof opt.handleSidebarAutoResume === 'function') {
          const handled = opt.handleSidebarAutoResume(ctx, stateObj, mediaEl, {
            startLocalMseAudioBridge: (el) => startLocalMseAudioBridge(ctx, el),
            curAutoplayPolicy
          });
          if (handled) return;
        }
        if (ctx.state.sidebarAutoResumeRequested && isAudioMirrorActive(ctx)) {
          if ((mediaEl && !mediaEl.paused && !mediaEl.ended) || Date.now() - ctx.state.sidebarAutoResumeRequestedAt > 30000) {
            ctx.state.sidebarAutoResumeRequested = false;
          } else {
            ensureMirroredPlayback();
          }
        } else if (ctx.state.sidebarAutoResumeRequested && mediaEl && mediaEl.readyState >= 2) {
          if (curAutoplayPolicy === 'allowed') {
            mediaEl.muted = false;
            mediaEl.volume = 1.0;
            mediaEl
              .play()
              .then(() => {
                ctx.state.sidebarAutoResumeRequested = false;
                ctx.notifyParent('PM_SIDEBAR_TOOK_OVER_AUDIO', {});
              })
              .catch(() => {
                ctx.state.sidebarAutoResumeRequested = false;
                startLocalMseAudioBridge(ctx, mediaEl);
              });
          } else {
            ctx.state.sidebarAutoResumeRequested = false;
            startLocalMseAudioBridge(ctx, mediaEl);
          }
        } else if (
          ctx.hasHost('youtube.com') &&
          !ctx.hasHost('music.youtube.com') &&
          window.location.pathname.startsWith('/watch') &&
          mediaEl &&
          mediaEl.readyState >= 2 &&
          mediaEl.paused &&
          !mediaEl.ended &&
          Date.now() - lastUserGestureAt > 2000
        ) {
          const watchKey = (() => {
            try {
              return new URL(window.location.href).searchParams.get('v') || window.location.pathname;
            } catch (_) {
              return window.location.pathname;
            }
          })();
          if (lastAutoPlayedWatchKey !== watchKey) {
            lastAutoPlayedWatchKey = watchKey;
            if (isAudioMirrorActive(ctx)) {
              ensureMirroredPlayback();
            } else if (curAutoplayPolicy !== 'allowed' && !ctx.state.bgAudioMseBridgeStarted) {
              startLocalMseAudioBridge(ctx, mediaEl);
            }
          }
        }
      }
    } catch (_) {}
  }

  window.__pmReportLivePlaybackState = reportLivePlaybackState;

  if (!ctx.isBgAudioFrame && !ctx.isStandbyBgFrame) {
    const handleUserMediaGesture = (e) => {
      if (e && e.isTrusted) {
        lastUserGestureAt = Date.now();
        ctx.state.bgAudioAutoplayBlocked = false;
      }
      if (opt && typeof opt.handleUserMediaGesture === 'function') {
        const handled = opt.handleUserMediaGesture(e, ctx, {
          clearVerifyTimer: () => clearTimeout(spTabPauseVerifyTimer)
        });
        if (handled) return;
      }
      const curPol =
        typeof navigator.getAutoplayPolicy === 'function' ? navigator.getAutoplayPolicy('mediaelement') : 'allowed';
      const canPlayNatively = curPol === 'allowed';
      if (isAudioMirrorActive(ctx)) {
        ctx.state.sidebarAutoResumeRequested = false;
        return;
      }
      if (!ctx.state.sidebarAutoResumeRequested && !ctx.state.bgAudioMseBridgeStarted) return;
      const wasMseBridge = ctx.state.bgAudioMseBridgeStarted;
      const wasAutoResume = ctx.state.sidebarAutoResumeRequested;
      ctx.state.sidebarAutoResumeRequested = false;
      if (canPlayNatively) {
        stopLocalMseAudioBridge(ctx);
        ctx.notifyParent('PM_SIDEBAR_TOOK_OVER_AUDIO', {});
      }
      try {
        if ((wasMseBridge || wasAutoResume) && canPlayNatively) {
          const mediaEl = getActiveMediaElement(ctx);
          if (mediaEl) {
            mediaEl.muted = false;
            mediaEl.volume = 1.0;
            if (mediaEl.paused) mediaEl.play().catch(() => {});
          }
        }
      } catch (_) {}
    };
    window.addEventListener('pointerdown', handleUserMediaGesture, { passive: true, capture: true });
    window.addEventListener('mousedown', handleUserMediaGesture, { passive: true, capture: true });
    window.addEventListener('click', handleUserMediaGesture, { capture: true });
  }

  function executeTrackSkip(dir) {
    if (isShouldDebounceSkip(dir)) return;
    if (opt && typeof opt.handleCommand === 'function') {
      const cmdName = dir === 'prev' ? 'SKIP_PREV_SP_TRACK' : 'SKIP_NEXT_SP_TRACK';
      if (opt.handleCommand({ cmd: cmdName }, ctx)) return;
    }
    const msHandlers = getCapturedMediaSessionHandlers();
    const handlerKey = dir === 'prev' ? 'previoustrack' : 'nexttrack';
    if (typeof msHandlers[handlerKey] === 'function') {
      try {
        msHandlers[handlerKey]();
        return;
      } catch (_) {}
    }
    try {
      const fnName = dir === 'prev' ? '__skipPrevSpTrack' : '__skipNextSpTrack';
      if (window.wrappedJSObject && typeof window.wrappedJSObject[fnName] === 'function') {
        // Bypass duplicate debounce by calling directly only when mirror didn't already run
        window.wrappedJSObject[fnName]();
      }
    } catch (_) {}
  }

  function resumeActivePlayback(msg) {
    if (ctx.state.isTabAudioAutoPaused) return;
    ctx.state.bgAudioAutoplayBlocked = false;
    window.__pmWasAutoPausedByTabAudio = false;
    ctx.reportDiag('frame-resume-nudge', { isBgAudioFrame: ctx.isBgAudioFrame, appId: ctx.appMeta.appId });

    try {
      if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmClearTabAutoPaused === 'function') {
        window.wrappedJSObject.__pmClearTabAutoPaused();
      }
    } catch (_) {}

    if (opt && typeof opt.handleCommand === 'function') {
      if (opt.handleCommand({ ...msg, cmd: 'RESUME_BG_SP_MEDIA' }, ctx, {
        startLocalMseAudioBridge: (el) => startLocalMseAudioBridge(ctx, el),
        getActiveMediaElement: () => getActiveMediaElement(ctx),
        getCapturedMediaSessionHandlers
      })) {
        return;
      }
    }

    const msHandlers = getCapturedMediaSessionHandlers();
    const mediaEl = getActiveMediaElement(ctx);
    if (isAudioMirrorActive(ctx)) {
      ensureMirroredPlayback();
      return;
    }
    if (typeof msHandlers.play === 'function') {
      try {
        msHandlers.play();
      } catch (_) {}
    }
    if (mediaEl && mediaEl.paused && !mediaEl.ended) {
      const curPol =
        typeof navigator.getAutoplayPolicy === 'function' ? navigator.getAutoplayPolicy('mediaelement') : 'allowed';
      if (curPol === 'allowed') {
        mediaEl.play().catch(() => {
          if (ctx.isBgAudioFrame) startLocalMseAudioBridge(ctx, mediaEl);
        });
      } else if (ctx.isBgAudioFrame) {
        startLocalMseAudioBridge(ctx, mediaEl);
      }
    }
  }

  function pauseLocalPlayback(msg) {
    ctx.state.sidebarAutoResumeRequested = false;
    ctx.state.bgAudioAutoResumed = true;
    ctx.state.isTabAudioAutoPaused = false;
    window.__pmWasAutoPausedByTabAudio = false;
    clearTimeout(spTabPauseVerifyTimer);
    stopLocalMseAudioBridge(ctx);
    try {
      if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmPauseAllSpMedia === 'function') {
        window.wrappedJSObject.__pmPauseAllSpMedia();
      }
      if (opt && typeof opt.handleCommand === 'function') {
        opt.handleCommand({ ...msg, cmd: 'PAUSE_LOCAL_MEDIA' }, ctx, {
          getActiveMediaElement: () => getActiveMediaElement(ctx),
          getCapturedMediaSessionHandlers
        });
      }
      getTrackedMediaElements().forEach((el) => {
        try {
          if (!el.paused) el.pause();
        } catch (_) {}
      });
    } catch (_) {}
    reportLivePlaybackState();
  }

  function handleMediaFrameCommand(msg) {
    if (!msg || msg.target !== 'pocketmail-media-frame') return;

    switch (msg.cmd) {
      case 'ACTIVATE_BG_SPOTIFY_HANDOFF': {
        ctx.isStandbyBgFrame = false;
        ctx.isBgAudioFrame = true;
        ctx.cleanWindowName = 'pm-bg-audio-spotify';
        try {
          window.name = 'pm-bg-audio-spotify';
        } catch (_) {}
        ctx.state.bgAudioAutoResumed = false;
        ctx.state.isTabAudioAutoPaused = false;
        ctx.state.bgAudioAutoplayBlocked = false;
        if (typeof msg.trackTitle === 'string' && msg.trackTitle) {
          ctx.state.expectedTrackTitle = msg.trackTitle;
        }
        if (Number(msg.targetSec) > 0) {
          ctx.state.expectedTrackTime = Number(msg.targetSec) || 0;
        }
        if (opt && typeof opt.handleCommand === 'function') {
          opt.handleCommand(msg, ctx);
        }
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmPromoteStandbyToBgFrame === 'function') {
            window.wrappedJSObject.__pmPromoteStandbyToBgFrame('pm-bg-audio-spotify');
          }
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover === 'function') {
            window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover(true);
          }
        } catch (_) {}
        reportLivePlaybackState();
        {
          const bootStart = Date.now();
          const fastBgBootTimer = setInterval(() => {
            if (ctx.state.bgAudioAutoResumed || Date.now() - bootStart > 18000) {
              clearInterval(fastBgBootTimer);
              return;
            }
            reportLivePlaybackState();
          }, 80);
        }
        break;
      }
      case 'PAUSE_BG_SP_MEDIA':
        if (!ctx.isBgAudioFrame || !ctx.hasHost('spotify.com')) break;
        ctx.state.bgAudioAutoResumed = true;
        setTimeout(() => {
          try {
            if (opt && typeof opt.handleCommand === 'function') {
              opt.handleCommand(msg, ctx);
            }
            getTrackedMediaElements().forEach((el) => {
              try {
                if (!el.paused) el.pause();
              } catch (_) {}
            });
          } catch (_) {}
        }, 260);
        break;
      case 'RESUME_BG_SP_MEDIA':
        resumeActivePlayback(msg);
        break;
      case 'TOGGLE_PLAY_PAUSE': {
        const el = getActiveMediaElement(ctx);
        const msHandlers = getCapturedMediaSessionHandlers();
        const isCurPlaying = Boolean(
          (el && !el.paused && !el.ended) ||
            (opt && typeof opt.isCurrentlyPlaying === 'function' && opt.isCurrentlyPlaying(ctx))
        );
        if (isCurPlaying) {
          if (typeof msHandlers.pause === 'function') {
            try { msHandlers.pause(); } catch (_) {}
          }
          pauseLocalPlayback(msg);
        } else {
          resumeActivePlayback(msg);
        }
        break;
      }
      case 'PM_MEDIA_CONTROL': {
        if (msg.command === 'set_volume' && Number.isFinite(Number(msg.volume))) {
          const nextVol = Math.min(1, Math.max(0, Number(msg.volume)));
          const wantMuted = typeof msg.muted === 'boolean' ? msg.muted : nextVol <= 0.001;
          if (opt && typeof opt.handleCommand === 'function' && opt.handleCommand(msg, ctx, {
            getActiveMediaElement: () => getActiveMediaElement(ctx)
          })) {
            reportLivePlaybackState();
            break;
          }
          if (isAudioMirrorActive(ctx)) {
            try {
              if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmSetMirrorVolume === 'function') {
                window.wrappedJSObject.__pmSetMirrorVolume(nextVol, wantMuted);
              }
            } catch (_) {}
          } else {
            const el = getActiveMediaElement(ctx);
            if (el) {
              try {
                el.volume = nextVol;
                el.muted = wantMuted;
              } catch (_) {}
            }
            getTrackedMediaElements().forEach((m) => {
              try {
                m.volume = nextVol;
                m.muted = wantMuted;
              } catch (_) {}
            });
          }
          reportLivePlaybackState();
        } else if (msg.command === 'mute_toggle') {
          const wantMuted = Boolean(msg.muted);
          const nextVol = Number.isFinite(Number(msg.volume)) ? Math.min(1, Math.max(0, Number(msg.volume))) : null;
          if (opt && typeof opt.handleCommand === 'function' && opt.handleCommand(msg, ctx, {
            getActiveMediaElement: () => getActiveMediaElement(ctx)
          })) {
            reportLivePlaybackState();
            break;
          }
          if (isAudioMirrorActive(ctx)) {
            try {
              if (nextVol !== null && window.wrappedJSObject && typeof window.wrappedJSObject.__pmSetMirrorVolume === 'function') {
                window.wrappedJSObject.__pmSetMirrorVolume(nextVol, wantMuted);
              } else if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmSetMirrorMute === 'function') {
                window.wrappedJSObject.__pmSetMirrorMute(wantMuted);
              }
            } catch (_) {}
          } else {
            const el = getActiveMediaElement(ctx);
            if (el) {
              if (!wantMuted && nextVol !== null && nextVol > 0) el.volume = nextVol;
              el.muted = wantMuted;
            }
            getTrackedMediaElements().forEach((m) => {
              try {
                if (!wantMuted && nextVol !== null && nextVol > 0) m.volume = nextVol;
                m.muted = wantMuted;
              } catch (_) {}
            });
          }
          reportLivePlaybackState();
        }
        break;
      }
      case 'MARK_USER_GESTURE':
        lastUserGestureAt = Date.now();
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmMarkUserGesture === 'function') {
            window.wrappedJSObject.__pmMarkUserGesture();
          }
        } catch (_) {}
        break;
      case 'SEEK_SP_MEDIA':
        try {
          const targetSec = Math.max(0, Number(msg.currentTime) || 0);
          const isUserScrub = Boolean(msg.isUserScrub);
          let executed = false;
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__seekActiveSpMediaEl === 'function') {
            executed = Boolean(
              window.wrappedJSObject.__seekActiveSpMediaEl(
                targetSec,
                Boolean(msg.forceHarmonySeek),
                isUserScrub
              )
            );
          } else {
            const msHandlers = getCapturedMediaSessionHandlers();
            if (typeof msHandlers.seekto === 'function') {
              try {
                msHandlers.seekto({ seekTime: targetSec, fastSeek: false });
                executed = true;
              } catch (_) {}
            }
            if (!executed) {
              const mediaEl = getActiveMediaElement(ctx);
              if (mediaEl && Number.isFinite(targetSec)) {
                try {
                  const maxT = Number.isFinite(mediaEl.duration) && mediaEl.duration > 0 ? mediaEl.duration : targetSec;
                  mediaEl.currentTime = Math.min(targetSec, maxT);
                  executed = true;
                } catch (_) {}
              }
            }
          }
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmPostSpBridgeSeekAck === 'function') {
            window.wrappedJSObject.__pmPostSpBridgeSeekAck(executed);
          } else if (isAudioMirrorActive(ctx)) {
            ctx.realTopWin.postMessage(
              {
                source: 'pocketmail-media-frame',
                type: 'PM_SP_EME_BRIDGE',
                flatFrameName: ctx.cleanWindowName,
                bridgeType: 'SEEK_ACK',
                executed: Boolean(executed)
              },
              '*'
            );
          }
          if (isUserScrub) {
            setTimeout(() => reportLivePlaybackState(), 120);
          }
        } catch (_) {}
        break;
      case 'SKIP_NEXT_SP_TRACK':
        executeTrackSkip('next');
        break;
      case 'SKIP_PREV_SP_TRACK':
        executeTrackSkip('prev');
        break;
      case 'PREPARE_HANDOFF_UNLOAD':
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmPrepareHandoffUnload === 'function') {
            window.wrappedJSObject.__pmPrepareHandoffUnload();
          }
        } catch (_) {}
        break;
      case 'APPLY_MUTE_CONFIG':
        syncFrameSettingsCache(msg);
        break;
      case 'AUTO_RESUME_PLAYBACK':
        if (ctx.isBgAudioFrame) break;
        ctx.state.bgAudioAutoplayBlocked = false;
        ctx.state.sidebarAutoResumeRequested = true;
        ctx.state.sidebarAutoResumeRequestedAt = Date.now();
        ctx.state.expectedTrackTitle = typeof msg.expectedTrackTitle === 'string' ? msg.expectedTrackTitle : '';
        ctx.state.expectedTrackArtist = typeof msg.expectedArtist === 'string' ? msg.expectedArtist : '';
        ctx.state.expectedTrackTime = Number(msg.expectedTime) || 0;
        ctx.state.expectedTrackDuration = Number(msg.expectedDuration) || 0;
        if (opt && typeof opt.handleCommand === 'function') {
          opt.handleCommand(msg, ctx);
        }
        reportLivePlaybackState();
        {
          const fastSbResumeTimer = setInterval(() => {
            if (!ctx.state.sidebarAutoResumeRequested || Date.now() - ctx.state.sidebarAutoResumeRequestedAt > 18000) {
              clearInterval(fastSbResumeTimer);
              return;
            }
            reportLivePlaybackState();
          }, 80);
        }
        break;
      case 'PAUSE_LOCAL_MEDIA':
        pauseLocalPlayback(msg);
        break;
      case 'TAB_AUDIO_AUTO_PAUSE': {
        clearTimeout(spTabPauseVerifyTimer);
        const alreadyAutoPaused = ctx.state.isTabAudioAutoPaused;
        ctx.state.isTabAudioAutoPaused = true;
        try {
          let wasPlayingNow = false;
          if (opt && typeof opt.handleCommand === 'function') {
            if (opt.handleCommand({ ...msg, alreadyAutoPaused }, ctx, {
              getActiveMediaElement: () => getActiveMediaElement(ctx)
            })) {
              wasPlayingNow = true;
            }
          }
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmTempPauseSpMedia === 'function') {
            if (window.wrappedJSObject.__pmTempPauseSpMedia()) {
              wasPlayingNow = true;
            }
          }
          getTrackedMediaElements().forEach((el) => {
            try {
              if (!el.paused && !el.ended) {
                wasPlayingNow = true;
                el.dataset.pmTabAutoPaused = '1';
                el.pause();
              }
            } catch (_) {}
          });
          if (wasPlayingNow || ctx.state.sidebarAutoResumeRequested || Boolean(msg.markShouldResume)) {
            window.__pmWasAutoPausedByTabAudio = true;
          }
          spTabPauseVerifyTimer = setTimeout(() => {
            if (!ctx.state.isTabAudioAutoPaused) return;
            try {
              if (opt && typeof opt.handleCommand === 'function') {
                opt.handleCommand({ ...msg, cmd: 'TAB_AUDIO_AUTO_PAUSE_VERIFY' }, ctx);
              }
              if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmTempPauseSpMedia === 'function') {
                window.wrappedJSObject.__pmTempPauseSpMedia();
              }
              getTrackedMediaElements().forEach((el) => {
                try {
                  if (!el.paused && !el.ended) {
                    el.dataset.pmTabAutoPaused = '1';
                    el.pause();
                  }
                } catch (_) {}
              });
            } catch (_) {}
          }, 340);
        } catch (_) {}
        reportLivePlaybackState();
        break;
      }
      case 'TAB_AUDIO_AUTO_RESUME': {
        clearTimeout(spTabPauseVerifyTimer);
        if (!ctx.state.isTabAudioAutoPaused && !window.__pmWasAutoPausedByTabAudio) {
          break;
        }
        ctx.state.isTabAudioAutoPaused = false;
        ctx.state.bgAudioAutoplayBlocked = false;
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmClearTabAutoPaused === 'function') {
            window.wrappedJSObject.__pmClearTabAutoPaused();
          }
          const shouldResume = Boolean(
            window.__pmWasAutoPausedByTabAudio ||
              ctx.state.sidebarAutoResumeRequested ||
              (ctx.isBgAudioFrame && !ctx.state.bgAudioAutoResumed)
          );
          window.__pmWasAutoPausedByTabAudio = false;
          ctx.reportDiag('frame-tab-auto-resume', {
            host: ctx.host,
            isBgAudioFrame: ctx.isBgAudioFrame,
            shouldResume
          });
          if (shouldResume) {
            let optHandledResume = false;
            if (opt && typeof opt.handleCommand === 'function') {
              optHandledResume = Boolean(
                opt.handleCommand(
                  { ...msg, cmd: 'TAB_AUDIO_AUTO_RESUME' },
                  ctx,
                  {
                    scheduleVerifyTimer: (fn, ms) => {
                      spTabPauseVerifyTimer = setTimeout(fn, ms);
                    },
                    getActiveMediaElement: () => getActiveMediaElement(ctx),
                    getCapturedMediaSessionHandlers
                  }
                )
              );
            }
            if (!optHandledResume && window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureMirrorPlay === 'function') {
              window.wrappedJSObject.__pmEnsureMirrorPlay(true);
            }
            getTrackedMediaElements().forEach((el) => {
              try {
                if (el.dataset.pmTabAutoPaused === '1') {
                  delete el.dataset.pmTabAutoPaused;
                  if ((!ctx.hasHost('spotify.com') || !optHandledResume) && el.paused && !el.ended) {
                    const p = el.play();
                    if (p && typeof p.catch === 'function') p.catch(() => {});
                  }
                }
              } catch (_) {}
            });
          }
        } catch (_) {}
        setTimeout(() => reportLivePlaybackState(), 480);
        break;
      }
      case 'FREE_HEAVY_MEDIA':
        freeHeavyMediaResources();
        break;
      case 'SPA_NAVIGATE':
        performSmoothSpaNavigation(msg.url, msg.label, msg.icon);
        break;
      case 'BACK':
        window.history.back();
        break;
      case 'FORWARD':
        window.history.forward();
        break;
      case 'RELOAD':
        window.location.reload();
        break;
      case 'ZOOM_IN':
        ctx.applyZoom(ctx.getZoom() + 0.1);
        break;
      case 'ZOOM_OUT':
        ctx.applyZoom(ctx.getZoom() - 0.1);
        break;
      case 'ZOOM_RESET':
        ctx.applyZoom(1.0);
        break;
      case 'APPLY_APP_THEME':
        injectAppThemeCss(ctx, msg.themeMode || 'native', msg.accentColor || '#6C5CE7', opt);
        updateVideoLoadbarConfig(msg);
        break;
      case 'APPLY_LOADBAR_CONFIG':
        updateVideoLoadbarConfig(msg);
        break;
      case 'ZOOM_FIT': {
        const curZoom = ctx.getZoom();
        if (Math.abs(curZoom - 1.0) > 0.04) {
          ctx.applyZoom(1.0);
        } else {
          const vw = window.innerWidth || 450;
          const floor = opt && typeof opt.getFitWidthFloor === 'function' ? opt.getFitWidthFloor() : vw;
          const sw = Math.max(
            document.documentElement ? document.documentElement.scrollWidth : vw,
            document.body ? document.body.scrollWidth : vw,
            floor
          );
          const ratio = sw > vw + 12 ? Math.max(0.62, Math.min(0.95, (vw - 8) / sw)) : 0.88;
          ctx.applyZoom(ratio);
        }
        break;
      }
      default:
        break;
    }
  }

  window.__pmHandleMediaFrameCommand = handleMediaFrameCommand;
  window.addEventListener('message', (e) => {
    handleMediaFrameCommand(e.data);
  });

  if (ctx.isFoxHubMediaFrame && typeof browser !== 'undefined' && browser.storage) {
    const applyTriggerState = (trig) => {
      if (!trig || typeof trig !== 'object') return;
      if (trig.active) {
        const cmd = trig.stayStopped ? 'PAUSE_LOCAL_MEDIA' : 'TAB_AUDIO_AUTO_PAUSE';
        handleMediaFrameCommand({
          target: 'pocketmail-media-frame',
          cmd,
          markShouldResume: ctx.isBgAudioFrame
        });
      } else if (ctx.state.isTabAudioAutoPaused || window.__pmWasAutoPausedByTabAudio) {
        handleMediaFrameCommand({
          target: 'pocketmail-media-frame',
          cmd: 'TAB_AUDIO_AUTO_RESUME'
        });
      }
    };
    try {
      if (browser.storage.local && typeof browser.storage.local.get === 'function') {
        browser.storage.local
          .get(['pmTabAudioTrigger', 'settings'])
          .then((res) => {
            if (res && res.pmTabAudioTrigger && res.pmTabAudioTrigger.active) {
              applyTriggerState(res.pmTabAudioTrigger);
            }
            if (res && res.settings) {
              updateVideoLoadbarConfig(res.settings);
              syncFrameSettingsCache(res.settings);
            }
          })
          .catch(() => {});
      }
      if (browser.storage.onChanged && typeof browser.storage.onChanged.addListener === 'function') {
        browser.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && changes) {
            if (changes.pmTabAudioTrigger && changes.pmTabAudioTrigger.newValue) {
              applyTriggerState(changes.pmTabAudioTrigger.newValue);
            }
            if (changes.settings && changes.settings.newValue) {
              updateVideoLoadbarConfig(changes.settings.newValue);
              syncFrameSettingsCache(changes.settings.newValue);
            }
          }
        });
      }
    } catch (_) {}
  }

  // Relay Quick Switcher (Ctrl+K) & custom per-app keyboard shortcuts when focus is inside embedded iframe
  if (ctx.isFoxHubMediaFrame && !ctx.isBgAudioFrame && !ctx.isStandbyBgFrame) {
    window.addEventListener(
      'keydown',
      (ev) => {
        try {
          const combo = formatFrameKeyCombo(ev);
          if (!combo) return;
          const comboNorm = combo.toLowerCase();
          const bindings = getCachedShortcutBindings();

          if (bindings.quickSwitcherEnabled) {
            const qsNorm = normalizeConfiguredShortcut(bindings.quickSwitcherShortcut || 'Ctrl+K');
            if (qsNorm && comboNorm === qsNorm) {
              ev.preventDefault();
              ev.stopPropagation();
              ev.stopImmediatePropagation();
              ctx.notifyParent('PM_QUICK_SWITCHER_TOGGLE', { shortcut: combo });
              return;
            }
          }

          if (typeof browser !== 'undefined' && browser.runtime) {
            const map = bindings.appShortcuts;
            if (!map || typeof map !== 'object') return;
            for (const [appId, bound] of Object.entries(map)) {
              if (bound && normalizeConfiguredShortcut(bound) === comboNorm) {
                ev.preventDefault();
                ev.stopPropagation();
                browser.runtime
                  .sendMessage({ type: 'TRIGGER_APP_SHORTCUT', appId })
                  .catch(() => {});
                return;
              }
            }
          }
        } catch (_) {}
      },
      true
    );
  }

  const onDomContentLoaded = () => {
    syncAppSpecificDomState();
    attachTitleObserver();
    detectUnreadState();
    if (opt && typeof opt.ensureSpecialRoutesReady === 'function') {
      try {
        opt.ensureSpecialRoutesReady(ctx);
      } catch (_) {}
    }
    ctx.notifyParent('PM_FRAME_DOM_READY', {
      title: document.title || '',
      faviconUrl: detectPageFaviconUrl(),
      ownProfileUrl: getOwnProfileUrlForCurrentHost()
    });
    startVisualPaintWatcher();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDomContentLoaded);
  } else {
    onDomContentLoaded();
  }

  const onWindowLoad = () => {
    syncAppSpecificDomState();
    attachTitleObserver();
    detectUnreadState();
    if (opt && typeof opt.ensureSpecialRoutesReady === 'function') {
      try {
        opt.ensureSpecialRoutesReady(ctx);
      } catch (_) {}
    }
    ctx.notifyParent('PM_FRAME_LOADED', {
      title: document.title || '',
      faviconUrl: detectPageFaviconUrl(),
      ownProfileUrl: getOwnProfileUrlForCurrentHost()
    });
    startVisualPaintWatcher();
  };
  if (document.readyState === 'complete') {
    onWindowLoad();
  } else {
    window.addEventListener('load', onWindowLoad);
  }

  setInterval(() => {
    if (window.location.href !== lastHref || (ctx.hasHost('tiktok.com') && getReportedFrameUrl() !== lastReportedUrl)) {
      handleRouteOrStateCheck();
    }
  }, 260);

  if (ctx.isBgAudioFrame) {
    const bootStart = Date.now();
    const fastBgBootTimer = setInterval(() => {
      if (ctx.state.bgAudioAutoResumed || Date.now() - bootStart > 18000) {
        clearInterval(fastBgBootTimer);
        return;
      }
      reportLivePlaybackState();
    }, 80);
  }
  setInterval(reportLivePlaybackState, ctx.isBgAudioFrame ? 900 : 1200);

  // Immediately report audible media start / unmute in selected foreground apps (e.g. Instagram Reels)
  if (!ctx.isBgAudioFrame && !ctx.isStandbyBgFrame && !ctx.hasHost('spotify.com')) {
    let fastMediaReportTimer = null;
    let fastMediaVerifyTimer = null;
    const scheduleFastPlaybackReport = (ev) => {
      const t = ev && ev.target;
      if (!t || (t.tagName !== 'VIDEO' && t.tagName !== 'AUDIO')) return;
      if (!fastMediaReportTimer) {
        fastMediaReportTimer = setTimeout(() => {
          fastMediaReportTimer = null;
          reportLivePlaybackState();
        }, 80);
      }
      if ((ev.type === 'play' || ev.type === 'playing' || ev.type === 'volumechange') && !t.paused && !t.muted) {
        clearTimeout(fastMediaVerifyTimer);
        fastMediaVerifyTimer = setTimeout(() => {
          fastMediaVerifyTimer = null;
          reportLivePlaybackState();
        }, 380);
      }
    };
    document.addEventListener('play', scheduleFastPlaybackReport, true);
    document.addEventListener('playing', scheduleFastPlaybackReport, true);
    document.addEventListener('volumechange', scheduleFastPlaybackReport, true);
    document.addEventListener('canplay', scheduleFastPlaybackReport, true);
  }

  setInterval(() => {
    try {
      const mediaEl = getActiveMediaElement(ctx);
      if (mediaEl && !mediaEl.paused && !mediaEl.ended) return;
    } catch (_) {}
    handleRouteOrStateCheck();
  }, 3000);
}
