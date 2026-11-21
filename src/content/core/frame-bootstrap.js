/**
 * FoxHub Content Core — Frame Bootstrapper
 * Dynamically loads the matching per-app optimizer and wires all core subsystems.
 */

import { initFrameContext } from './frame-context.js';
import { installMediaMirrorHooks, installNonMirrorAudioTracker, parseClockDuration } from './media-mirror.js';
import { initThemeEngine } from './theme-engine.js';
import { initNotificationMute } from './notification-mute.js';
import { initScrubberLoadbar } from './scrubber-loadbar.js';
import { initPageMemory } from './page-memory.js';
import { bumpWebNotificationUnread, initLifecycleRouter } from './lifecycle-router.js';

let hasBootstrapped = false;

function ensureXDarkCookie(ctx) {
  const isDarkMode = ctx.initialSyncThemeMode === 'true-night' || ctx.initialSyncThemeMode === 'midnight-oled';
  if (!isDarkMode || (!ctx.hasHost('x.com') && !ctx.hasHost('twitter.com'))) return;
  try {
    document.cookie = 'night_mode=; path=/; max-age=0; SameSite=None; Secure';
    document.cookie = `night_mode=2; domain=${ctx.hasHost('twitter.com') ? '.twitter.com' : '.x.com'}; path=/; max-age=31536000; SameSite=None; Secure`;
  } catch (_) {}
}

export async function bootstrapFoxHubFrame(seed = null) {
  if (hasBootstrapped) return;
  hasBootstrapped = true;

  const ctx = initFrameContext(seed);
  ctx.parseClockDuration = parseClockDuration;
  if (!ctx.isFoxHubContext && ctx.isGoogleAccountWidgetIframe) {
    ctx.setupSmartAccountSwitchAndLinkHandler();
    return;
  }
  if (!ctx.isFoxHubContext) return;

  if (ctx.isSwBootstrap) {
    ensureXDarkCookie(ctx);
    const wipe = async () => {
      try {
        const regs = await navigator.serviceWorker?.getRegistrations();
        if (regs?.length) await Promise.all(regs.map((r) => r.unregister()));
        const keys = await window.caches?.keys();
        if (keys?.length) await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (_) {}
    };
    const rawTarget = new URLSearchParams(window.location.search).get('pm_target') || '';
    let tgt = `${window.location.origin}/`;
    if (rawTarget) {
      try {
        const parsed = new URL(rawTarget, window.location.origin);
        if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin === window.location.origin) {
          tgt = parsed.href;
        }
      } catch (_) {}
    }
    await Promise.race([wipe(), new Promise((resolve) => setTimeout(resolve, 110))]);
    window.location.replace(tgt);
    return;
  }

  ensureXDarkCookie(ctx);
  if (
    ctx.isBgAudioFrame ||
    (ctx.isFoxHubMediaFrame &&
      (ctx.isMirrorAudioHost || ctx.hasHost('soundcloud.com') || ctx.hasHost('sndcdn.com') || ctx.hasHost('music.apple.com')))
  ) {
    try {
      const pw = window.wrappedJSObject;
      const canExp = Boolean(pw && typeof exportFunction === 'function');
      const navLocks = (canExp ? pw.navigator?.locks : null) || navigator.locks;
      if (navLocks?.request) {
        const lockCb = canExp
          ? exportFunction(() => new pw.Promise(exportFunction(() => {}, pw)), pw)
          : () => new Promise(() => {});
        Promise.resolve(navLocks.request('foxhub_media_keepalive', lockCb)).catch(() => {});
      }
    } catch (_) {}
  }

  ctx.setupSmartAccountSwitchAndLinkHandler();

  let opt = null;
  if (ctx.appMeta && ctx.appMeta.optimizerFile && typeof browser !== 'undefined' && browser.runtime?.getURL) {
    try {
      const optMod = await import(browser.runtime.getURL(`src/content/optimizers/${ctx.appMeta.optimizerFile}`));
      if (optMod && typeof optMod.initOptimizer === 'function') {
        opt = optMod.initOptimizer(ctx);
      }
    } catch (_) {}
  }

  if (ctx.isMirrorAudioHost && !ctx.isTopFrame) {
    installMediaMirrorHooks(ctx, opt);
  } else if (ctx.hasHost('soundcloud.com') || ctx.hasHost('sndcdn.com') || ctx.hasHost('music.apple.com')) {
    installNonMirrorAudioTracker(ctx);
  }

  initNotificationMute(ctx, opt, {
    onWebNotification: () => {
      bumpWebNotificationUnread();
    }
  });
  initThemeEngine(ctx, opt);
  if (ctx.isFoxHubMediaFrame || ctx.isPocketMailSidebarTop) {
    initScrubberLoadbar(ctx);
    initPageMemory(ctx, opt);
    initLifecycleRouter(ctx, opt);
  }
}
