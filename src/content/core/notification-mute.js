/**
 * FoxHub Content Core — Notification Mute, Shortcut Bindings Cache & Audio Ping Filter
 */

let siteNotificationsMuted = false;
let siteNotificationsMutedUntil = 0;

const cachedShortcutBindings = {
  globalShortcuts: { popup: 'Alt+Shift+F', sidebar: 'Alt+Shift+M', popout: 'Alt+Shift+W' },
  appShortcuts: {},
  appShortcutOpenMode: 'sidebar',
  quickSwitcherEnabled: true,
  quickSwitcherShortcut: 'Ctrl+K'
};

export function isSiteNotificationsMutedNow() {
  return Boolean(
    siteNotificationsMuted || (siteNotificationsMutedUntil > 0 && Date.now() < siteNotificationsMutedUntil)
  );
}

export function getCachedShortcutBindings() {
  return cachedShortcutBindings;
}

export function syncFrameSettingsCache(s) {
  if (!s || typeof s !== 'object') return;
  if (s.muteSiteNotifications !== undefined || s.socialAppNotifySounds !== undefined) {
    siteNotificationsMuted = Boolean(s.muteSiteNotifications || s.socialAppNotifySounds === false);
  }
  if (s.muteSitesUntil !== undefined) {
    siteNotificationsMutedUntil = Number(s.muteSitesUntil || 0);
  }
  if (s.globalShortcuts && typeof s.globalShortcuts === 'object') {
    cachedShortcutBindings.globalShortcuts = {
      popup: 'Alt+Shift+F',
      sidebar: 'Alt+Shift+M',
      popout: 'Alt+Shift+W',
      ...s.globalShortcuts
    };
  }
  if (s.appShortcuts && typeof s.appShortcuts === 'object') {
    cachedShortcutBindings.appShortcuts = { ...s.appShortcuts };
  }
  if (typeof s.appShortcutOpenMode === 'string' && s.appShortcutOpenMode) {
    cachedShortcutBindings.appShortcutOpenMode = s.appShortcutOpenMode;
  }
  if (s.quickSwitcherEnabled !== undefined) {
    cachedShortcutBindings.quickSwitcherEnabled = s.quickSwitcherEnabled !== false;
  }
  if (typeof s.quickSwitcherShortcut === 'string' && s.quickSwitcherShortcut.trim()) {
    cachedShortcutBindings.quickSwitcherShortcut = s.quickSwitcherShortcut.trim();
  }
}

export function initNotificationMute(ctx, opt = null, hooks = {}) {
  if (ctx.isTopFrame || !ctx.isFoxHubMediaFrame) return;
  if (!window.wrappedJSObject || typeof exportFunction !== 'function') return;

  const suppressUnreadCount = Boolean(
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
  );

  const skipSocialAudioMute = Boolean(
    ctx.isMirrorAudioHost ||
      ctx.hasHost('tiktok.com') ||
      ctx.hasHost('twitch.tv') ||
      ctx.hasHost('soundcloud.com') ||
      ctx.hasHost('sndcdn.com') ||
      ctx.hasHost('music.apple.com')
  );

  try {
    const pageWin = window.wrappedJSObject;
    if (pageWin.Notification && !pageWin.__pmNotifWrapped) {
      pageWin.__pmNotifWrapped = true;
      const OrigNotif = pageWin.Notification;
      const WrappedNotif = exportFunction(function (title, options) {
        if (!suppressUnreadCount && typeof hooks.onWebNotification === 'function') {
          hooks.onWebNotification();
        }
        if (isSiteNotificationsMutedNow()) {
          const dummy = new pageWin.Object();
          exportFunction(() => {}, dummy, { defineAs: 'close' });
          exportFunction(() => {}, dummy, { defineAs: 'addEventListener' });
          exportFunction(() => {}, dummy, { defineAs: 'removeEventListener' });
          return dummy;
        }
        return options !== undefined ? new OrigNotif(title, options) : new OrigNotif(title);
      }, pageWin);
      WrappedNotif.prototype = OrigNotif.prototype;
      try {
        Object.defineProperty(WrappedNotif, 'permission', {
          get: exportFunction(() => (isSiteNotificationsMutedNow() ? 'default' : OrigNotif.permission || 'granted'), pageWin),
          configurable: true
        });
        if (typeof OrigNotif.requestPermission === 'function') {
          exportFunction(
            function (cb) {
              return OrigNotif.requestPermission.call(OrigNotif, cb);
            },
            WrappedNotif,
            { defineAs: 'requestPermission' }
          );
        }
      } catch (_) {}
      pageWin.Notification = WrappedNotif;
    }

    if (!skipSocialAudioMute && pageWin.HTMLMediaElement && pageWin.HTMLMediaElement.prototype && !pageWin.__pmSocialAudioMuteWrapped) {
      pageWin.__pmSocialAudioMuteWrapped = true;
      let lastUserClickInSocialFrameAt = 0;
      window.addEventListener(
        'pointerdown',
        (ev) => {
          if (ev && ev.isTrusted) lastUserClickInSocialFrameAt = Date.now();
        },
        { capture: true, passive: true }
      );
      const origSocialPlay = pageWin.HTMLMediaElement.prototype.play;
      exportFunction(
        function () {
          try {
            if (
              isSiteNotificationsMutedNow() &&
              this &&
              this.tagName === 'AUDIO' &&
              Date.now() - lastUserClickInSocialFrameAt > 1500 &&
              (!Number.isFinite(this.duration) || this.duration < 8)
            ) {
              this.muted = true;
              this.volume = 0;
              return pageWin.Promise.resolve();
            }
          } catch (_) {}
          return origSocialPlay.call(this);
        },
        pageWin.HTMLMediaElement.prototype,
        { defineAs: 'play' }
      );
    }
  } catch (_) {}
}
