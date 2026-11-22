/**
 * FoxHub Content Core — Frame Context, Host Catalog & Parent Bridge
 */

export const INAUDIBLE_VOLUME = 1e-5;

export function matchHostSuffix(hostname, suffix) {
  if (!hostname || !suffix) return false;
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

const FRAME_APP_RULES = [
  { suffixes: ['music.youtube.com'], appId: 'youtube', cssSlug: 'yt-music', optimizerFile: 'youtube.js', isMusicYt: true },
  { suffixes: ['youtube.com', 'youtu.be'], appId: 'youtube', cssSlug: 'youtube', optimizerFile: 'youtube.js', isMusicYt: false },
  { suffixes: ['spotify.com'], appId: 'spotify', cssSlug: 'spotify', optimizerFile: 'spotify.js' },
  { suffixes: ['soundcloud.com', 'sndcdn.com'], appId: 'soundcloud', cssSlug: 'soundcloud', optimizerFile: 'soundcloud.js' },
  { suffixes: ['music.apple.com'], appId: 'apple-music', cssSlug: 'apple-music', optimizerFile: 'apple-music.js' },
  { suffixes: ['instagram.com'], appId: 'instagram', cssSlug: 'instagram', optimizerFile: 'instagram.js' },
  { suffixes: ['whatsapp.com', 'whatsapp.net'], appId: 'whatsapp', cssSlug: 'whatsapp', optimizerFile: 'whatsapp.js' },
  { suffixes: ['discord.com', 'discordapp.com'], appId: 'discord', cssSlug: 'discord', optimizerFile: 'discord.js' },
  { suffixes: ['telegram.org'], appId: 'telegram', cssSlug: 'telegram', optimizerFile: 'telegram.js' },
  { suffixes: ['tiktok.com'], appId: 'tiktok', cssSlug: 'tiktok', optimizerFile: 'tiktok.js' },
  { suffixes: ['x.com', 'twitter.com'], appId: 'x', cssSlug: 'x', optimizerFile: 'x.js' },
  { suffixes: ['messenger.com'], appId: 'messenger', cssSlug: 'messenger', optimizerFile: 'messenger.js' },
  { suffixes: ['reddit.com'], appId: 'reddit', cssSlug: 'reddit', optimizerFile: 'reddit.js' },
  { suffixes: ['twitch.tv'], appId: 'twitch', cssSlug: 'twitch', optimizerFile: 'twitch.js' },
  { suffixes: ['chatgpt.com', 'openai.com'], appId: 'chatgpt', cssSlug: 'chatgpt', optimizerFile: 'chatgpt.js' },
  { suffixes: ['gemini.google.com'], appId: 'gemini', cssSlug: 'gemini', optimizerFile: 'gemini.js' },
  { suffixes: ['claude.ai', 'anthropic.com'], appId: 'claude', cssSlug: 'claude', optimizerFile: 'claude.js' },
  { suffixes: ['perplexity.ai'], appId: 'perplexity', cssSlug: 'perplexity', optimizerFile: 'perplexity.js' },
  { suffixes: ['bsky.app', 'bsky.social'], appId: 'bluesky', cssSlug: 'bluesky', optimizerFile: 'bluesky.js' },
  { suffixes: ['notion.so', 'notion.site'], appId: 'notion', cssSlug: 'notion', optimizerFile: 'notion.js' },
  { suffixes: ['calendar.google.com'], appId: 'google-calendar', cssSlug: 'google-calendar', optimizerFile: 'google-calendar.js' },
  { suffixes: ['keep.google.com'], appId: 'google-keep', cssSlug: 'google-keep', optimizerFile: 'google-keep.js' },
  { suffixes: ['mail.google.com'], appId: 'gmail', cssSlug: '', optimizerFile: 'gmail.js' }
];

export function detectFrameApp(hostname, cleanWindowName = '') {
  const host = String(hostname || '').toLowerCase();
  for (let i = 0; i < FRAME_APP_RULES.length; i++) {
    const rule = FRAME_APP_RULES[i];
    if (rule.suffixes.some((s) => matchHostSuffix(host, s))) {
      return {
        appId: rule.appId,
        cssSlug: rule.cssSlug,
        optimizerFile: rule.optimizerFile,
        isMusicYt: Boolean(rule.isMusicYt),
        isKnownBuiltInHost: true
      };
    }
  }
  if (matchHostSuffix(host, 'facebook.com') || matchHostSuffix(host, 'google.com')) {
    return {
      appId: '',
      cssSlug: '',
      optimizerFile: '',
      isMusicYt: false,
      isKnownBuiltInHost: true
    };
  }
  const customId = cleanWindowName.startsWith('pm-media-frame-')
    ? cleanWindowName.slice('pm-media-frame-'.length)
    : 'custom';
  return {
    appId: customId || 'custom',
    cssSlug: 'custom',
    optimizerFile: '',
    isMusicYt: false,
    isKnownBuiltInHost: false
  };
}

export function initFrameContext(seed = null) {
  const realTopWin = window.top;
  const isTopFrame = realTopWin === window.self;
  const isDirectChildIframe = !isTopFrame && window.parent === realTopWin;
  const host = (window.location.hostname || '').toLowerCase();
  const path = window.location.pathname || '/';

  const rawWindowName = typeof window.name === 'string' ? window.name : '';
  const metaSplitIdx = rawWindowName.search(/__pm(?:t|a|ua)=/);
  let cleanWindowName =
    (seed && seed.cleanWindowName) || (metaSplitIdx >= 0 ? rawWindowName.slice(0, metaSplitIdx) : rawWindowName);
  let initialSyncThemeMode = (seed && seed.initialSyncThemeMode) || '';
  let initialSyncAccent = (seed && seed.initialSyncAccent) || '';
  if (metaSplitIdx >= 0) {
    try {
      const pmtIdx = rawWindowName.indexOf('__pmt=');
      if (!initialSyncThemeMode && pmtIdx >= 0) {
        initialSyncThemeMode = decodeURIComponent(rawWindowName.slice(pmtIdx + 6).split(/__pm(?:t|a|ua)=/)[0]);
      }
      const pmaIdx = rawWindowName.indexOf('__pma=');
      if (!initialSyncAccent && pmaIdx >= 0) {
        initialSyncAccent = decodeURIComponent(rawWindowName.slice(pmaIdx + 6).split(/__pm(?:t|a|ua)=/)[0]);
      }
    } catch (_) {}
  }

  const isGoogleAccountWidgetIframe =
    seed && typeof seed.isGoogleAccountWidgetIframe === 'boolean'
      ? seed.isGoogleAccountWidgetIframe
      : !isTopFrame &&
        (host === 'ogs.google.com' || (host === 'accounts.google.com' && path.includes('/AccountChooser')));

  const isPocketMailSidebarTop =
    seed && typeof seed.isPocketMailSidebarTop === 'boolean'
      ? seed.isPocketMailSidebarTop
      : isTopFrame && (window.location.hash.includes('pm-sidebar') || window.name === 'pm-opera-sidebar');

  const isStandbyBgFrame =
    seed && typeof seed.isStandbyBgFrame === 'boolean'
      ? seed.isStandbyBgFrame
      : cleanWindowName.startsWith('pm-bg-standby-');

  const isBgAudioFrame =
    seed && typeof seed.isBgAudioFrame === 'boolean'
      ? seed.isBgAudioFrame
      : cleanWindowName.startsWith('pm-bg-audio-');

  const isFoxHubMediaFrame =
    seed && typeof seed.isFoxHubMediaFrame === 'boolean'
      ? seed.isFoxHubMediaFrame
      : /^pm-(media-frame|bg-audio|bg-standby)-/.test(cleanWindowName);

  const isGmailComposeFrame =
    cleanWindowName.startsWith('pm-gmail-compose:') || cleanWindowName === 'pm-gmail-autosend-frame';

  let isFoxHubContext =
    seed && typeof seed.isFoxHubContext === 'boolean'
      ? seed.isFoxHubContext
      : isFoxHubMediaFrame || isPocketMailSidebarTop || isGmailComposeFrame;

  if (isFoxHubContext) {
    try {
      window.sessionStorage.setItem('__pm_foxhub_frame', '1');
    } catch (_) {}
  } else if (isDirectChildIframe) {
    try {
      if (window.sessionStorage.getItem('__pm_foxhub_frame') === '1') {
        isFoxHubContext = true;
      }
    } catch (_) {}
  }

  if (isFoxHubContext) {
    try {
      if (initialSyncThemeMode) {
        window.sessionStorage.setItem('__pm_social_theme', initialSyncThemeMode);
      } else {
        initialSyncThemeMode = window.sessionStorage.getItem('__pm_social_theme') || '';
      }
      if (initialSyncAccent) {
        window.sessionStorage.setItem('__pm_social_accent', initialSyncAccent);
      } else {
        initialSyncAccent = window.sessionStorage.getItem('__pm_social_accent') || '';
      }
    } catch (_) {}
  }

  const appMeta = detectFrameApp(host, cleanWindowName);
  const isKnownBuiltInHost =
    seed && typeof seed.isKnownBuiltInHost === 'boolean' ? seed.isKnownBuiltInHost : appMeta.isKnownBuiltInHost;

  const isMirrorAudioHost =
    matchHostSuffix(host, 'spotify.com') ||
    matchHostSuffix(host, 'youtube.com') ||
    matchHostSuffix(host, 'youtu.be');

  const initialAutoplayPolicy =
    typeof navigator.getAutoplayPolicy === 'function' ? navigator.getAutoplayPolicy('mediaelement') : 'allowed';

  const isSwBootstrap = window.location.search.includes('pm_boot=1');
  let currentZoom = 1.0;

  const ctx = {
    realTopWin,
    isTopFrame,
    isDirectChildIframe,
    host,
    hasHost: (suffix) => matchHostSuffix(host, suffix),
    isGoogleAccountWidgetIframe,
    isPocketMailSidebarTop,
    cleanWindowName,
    initialSyncThemeMode,
    initialSyncAccent,
    initialThemeResolved: !isFoxHubContext || Boolean(initialSyncThemeMode),
    isStandbyBgFrame,
    isBgAudioFrame,
    isFoxHubMediaFrame,
    isGmailComposeFrame,
    isFoxHubContext,
    isKnownBuiltInHost,
    isMirrorAudioHost,
    initialAutoplayPolicy,
    isSwBootstrap,
    appMeta,
    INAUDIBLE_VOLUME,
    state: {
      pendingSpaTarget: null,
      spotifyViewOverride: '',
      spotifyPanelOpen: false,
      activeSpotifyPanelTrigger: '',
      spPanelSyncClick: false,
      spAutoClickInFlight: false,
      bgAudioAutoResumed: false,
      bgAudioAutoplayBlocked: false,
      bgAudioMseBridgeStarted: false,
      sidebarAutoResumeRequested: false,
      sidebarAutoResumeRequestedAt: 0,
      expectedTrackTitle: '',
      expectedTrackArtist: '',
      expectedTrackTime: 0,
      expectedTrackDuration: 0,
      isTabAudioAutoPaused: false,
      desiredVolume: 1.0,
      desiredMuted: false,
      hasPersistedVolume: false,
      lastRouteOrClickAt: Date.now()
    }
  };

  ctx.notifyParent = (type, payload = {}) => {
    if (ctx.isTopFrame) return;
    try {
      ctx.realTopWin.postMessage(
        {
          source: 'pocketmail-media-frame',
          type,
          flatFrameName: ctx.isDirectChildIframe ? ctx.cleanWindowName : '',
          url: window.location.href,
          ...payload
        },
        '*'
      );
    } catch (_) {}
  };

  ctx.applyZoom = (newZoom) => {
    currentZoom = Math.max(0.5, Math.min(1.4, Number(newZoom) || 1.0));
    if (document.documentElement) {
      document.documentElement.style.zoom = String(currentZoom);
    }
    ctx.notifyParent('PM_FRAME_ZOOM_UPDATED', { zoom: currentZoom });
  };

  ctx.getZoom = () => currentZoom;

  ctx.ensureStylesheetOrder = () => {
    const head = document.head;
    if (!head) return;
    const ensureLink = (id, pathStr) => {
      let el = document.getElementById(id);
      if (!el && pathStr && typeof browser !== 'undefined' && browser.runtime?.getURL) {
        el = document.createElement('link');
        el.id = id;
        el.rel = 'stylesheet';
        el.href = browser.runtime.getURL(pathStr);
      }
      return el;
    };
    const baseLink = ensureLink('pm-frame-base-css', 'src/content/css/base.css');
    const appLink = appMeta.cssSlug
      ? ensureLink('pm-frame-app-css', `src/content/css/${appMeta.cssSlug}.css`)
      : null;
    const themeStyle = document.getElementById('pm-social-app-theme-css');

    const placeBeforeTheme = (el) => {
      if (!el) return;
      if (themeStyle && themeStyle.parentNode === head) {
        if (el.parentNode !== head || el.compareDocumentPosition(themeStyle) & Node.DOCUMENT_POSITION_PRECEDING) {
          head.insertBefore(el, themeStyle);
        }
      } else if (el.parentNode !== head) {
        head.appendChild(el);
      }
    };
    placeBeforeTheme(baseLink);
    placeBeforeTheme(appLink);
    if (themeStyle && themeStyle.parentNode === head && head.lastElementChild !== themeStyle) {
      head.appendChild(themeStyle);
    }
  };

  ctx.reportDiag = (event, details = {}) => {
    try {
      if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
        browser.runtime
          .sendMessage({
            type: 'LOG_CONTENT_AUDIO_DIAG',
            event,
            details
          })
          .catch(() => {});
      }
    } catch (_) {}
  };

  let linkHandlerInstalled = false;
  ctx.shouldKeepNavigationInSidebar = (rawUrl, linkTarget = '') => {
    if (!rawUrl || rawUrl.startsWith('javascript:') || rawUrl.startsWith('mailto:')) return false;
    let dest = null;
    try {
      dest = new URL(rawUrl, window.location.href);
    } catch (_) {
      return false;
    }
    const destHost = (dest.hostname || '').toLowerCase();
    const destPath = dest.pathname || '';
    const isAccountSwitchPattern =
      /\/u\/\d+(\/|$)/.test(destPath) ||
      dest.searchParams.has('authuser') ||
      (destHost === 'accounts.google.com' &&
        /\/(AccountChooser|ServiceLogin|AddSession|InteractiveLogin)/i.test(destPath));

    if (
      destHost === 'myaccount.google.com' ||
      destHost === 'policies.google.com' ||
      destHost === 'one.google.com' ||
      destHost === 'support.google.com'
    ) {
      return false;
    }
    if (ctx.isGoogleAccountWidgetIframe) {
      return (
        isAccountSwitchPattern ||
        destHost.includes('gemini.google.com') ||
        destHost.includes('youtube.com') ||
        destHost.includes('mail.google.com')
      );
    }
    if (isAccountSwitchPattern && (destHost === host || destHost === 'accounts.google.com')) {
      return true;
    }
    if (destHost === host && (linkTarget === '_top' || linkTarget === '_parent')) {
      return true;
    }
    return false;
  };

  ctx.setupSmartAccountSwitchAndLinkHandler = () => {
    if (linkHandlerInstalled) return;
    linkHandlerInstalled = true;
    document.addEventListener(
      'click',
      (e) => {
        const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!a) return;
        const rawHref = a.getAttribute('href') || a.href || '';
        const targetAttr = (a.getAttribute('target') || '').toLowerCase();

        if (ctx.shouldKeepNavigationInSidebar(rawHref, targetAttr)) {
          let resolvedUrl = rawHref;
          try {
            resolvedUrl = new URL(rawHref, window.location.href).href;
          } catch (_) {}
          e.preventDefault();
          e.stopPropagation();
          ctx.notifyParent('PM_FRAME_NAVIGATE_ACTIVE', {
            url: resolvedUrl,
            title: 'Switching Account…'
          });
          if (ctx.isDirectChildIframe) {
            window.location.href = resolvedUrl;
          }
          return;
        }
        if (ctx.isDirectChildIframe && (targetAttr === '_top' || targetAttr === '_parent')) {
          try {
            const dest = new URL(rawHref, window.location.href);
            if (dest.hostname.toLowerCase() === host) {
              a.setAttribute('target', '_self');
            }
          } catch (_) {}
        }
      },
      true
    );
  };

  return ctx;
}
