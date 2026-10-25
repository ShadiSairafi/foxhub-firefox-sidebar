/**
 * PocketMail — Background Coordinator
 * 100% Local Multi-Account Polling, Google Login Window Watcher, Desktop Notifications,
 * Synthesized Chimes, Snooze Scheduler, and Instant Action Dispatcher.
 */

const DEFAULT_SETTINGS = {
  theme: 'warm-linen',
  wallpaper: 'watercolor-hills',
  wallpaperOpacity: 0.95,
  wallpaperBlur: 0,
  wallpaperFit: 'cover',
  cardStyle: 'glassmorphism', // 'glassmorphism' | 'tinted-glass' | 'warm-paper' | 'floating-minimal' | 'outlined-editorial'
  cardOpacity: 0.62,
  cardBlur: 16,
  cardRadius: 15,
  cardDensity: 'cozy',        // 'compact' | 'cozy' | 'spacious'
  cardActionsMode: 'always',  // 'always' | 'hover' | 'compact-icons'
  avatarShape: 'squircle',    // 'squircle' | 'circle' | 'pill'
  showLeftAccent: true,
  tabStyle: 'glass-pills',    // 'glass-pills' | 'segmented-bar' | 'underline-tabs' | 'tinted-chips'
  fontStyle: 'editorial',     // 'editorial' | 'modern-sans' | 'literary-serif' | 'rounded-cozy'
  ambientEffect: 'sunbeams',  // 'none' | 'sunbeams' | 'soft-bokeh' | 'paper-grain'
  badgeCountMode: 'feed',     // 'feed' (visible list count) | 'total' (Gmail fullcount)
  popupWidth: 540,            // Resizable popup width (380px - 790px)
  popupHeight: 600,           // Resizable popup height (460px - 600px)
  autoFitEmail: true,         // Automatically scale wide HTML emails to fit reader width
  enabledMediaApps: ['instagram', 'whatsapp', 'discord', 'telegram', 'spotify', 'youtube', 'tiktok', 'x', 'messenger', 'reddit'],
  customMediaApps: [],        // [{ id, name, url, color }]
  sidebarOpenMode: 'auto',    // 'auto' | 'sidebar' | 'embedded' | 'window'
  socialAppThemeMode: 'native', // 'native' | 'match-theme' | 'warm-glass' | 'midnight-oled' | 'cozy-sepia'
  socialAppNotifySounds: true,  // Play chime when social app receives new messages
  socialAppSoundMap: {},        // { whatsapp: 'crystal-drop', discord: 'zen-bell', ... }
  hideMediaBottomBar: false,    // Toggleable bottom navigation bar with icons
  autoHideMediaTopBar: true,    // Default ON: Auto-hide top shortcuts bar and reveal smoothly on hover
  hasSeenTopBarHint: false,     // Shows first-time onboarding hint explaining top-edge hover bar
  topBarAutoHideMigratedV1: true,
  persistenceMode: 'eco',       // 'eco' (reset & free RAM) | 'selected' (custom picked apps) | 'all' (all apps persistent)
  persistentAppIds: ['spotify', 'youtube', 'discord'], // Apps kept persistent in 'selected' mode
  persistentLastActiveAppId: 'pocketmail',
  persistentSavedAppUrls: {},   // { spotify: 'https://...', youtube: 'https://...', ... }
  keepAudioPlayingWhenClosed: true,
  customWallpaperData: '',
  customWallpaperUrl: '',
  gradientColor1: '#FAD6A5',
  gradientColor2: '#E8A598',
  gradientAngle: 135,
  pollIntervalSeconds: 30,
  soundId: 'marimba',
  soundVolume: 0.75,
  customAudioData: '',
  desktopNotifications: true,
  voiceNotifications: false,
  ttsRate: 1.0,
  ttsVoice: '',
  dndUntil: 0,
  demoMode: 'auto', // 'auto' | 'on' | 'off'
  maxSessionSlots: 5,
  accountConfigs: {}, // email -> { nickname, color, label, disabled }
  oauthAccounts: [],  // [{ email, name, picture, accessToken, expiresAt }]
  oauthClientId: ''
};

let currentSettings = { ...DEFAULT_SETTINGS };
let cachedState = {
  accounts: [],
  totalUnread: 0,
  lastSyncAt: 0,
  usingDemo: false,
  syncError: null
};

let knownUnreadIds = new Set();
let isFirstSync = true;
let pollTimer = null;

// Local overlay so actions (read/trash/archive/star/snooze) feel instantaneous (<10ms)
let localOverlay = {
  overlayVersion: 2,
  readIds: {},     // id -> timestamp
  trashedIds: {},  // id -> timestamp
  archivedIds: {}, // id -> timestamp
  starredIds: {},  // id -> boolean
  snoozed: {}      // id -> { wakeAt, message }
};

async function loadStorage() {
  const data = await browser.storage.local.get(['settings', 'localOverlay', 'cachedState']);
  if (data.settings) {
    currentSettings = { ...DEFAULT_SETTINGS, ...data.settings };
    if (!data.settings.topBarAutoHideMigratedV1) {
      currentSettings.autoHideMediaTopBar = true;
      currentSettings.topBarAutoHideMigratedV1 = true;
      await browser.storage.local.set({ settings: currentSettings });
    }
  } else {
    await browser.storage.local.set({ settings: currentSettings });
  }
  if (data.localOverlay) {
    const isUpgraded = data.localOverlay.overlayVersion === 2;
    localOverlay = {
      overlayVersion: 2,
      // Clear stuck readIds from v2.0 so emails hidden by "Read All" come right back
      readIds: isUpgraded ? (data.localOverlay.readIds || {}) : {},
      trashedIds: data.localOverlay.trashedIds || {},
      archivedIds: data.localOverlay.archivedIds || {},
      starredIds: data.localOverlay.starredIds || {},
      snoozed: data.localOverlay.snoozed || {}
    };
    if (!isUpgraded) {
      await browser.storage.local.set({ localOverlay });
    }
  }
  if (data.cachedState) {
    cachedState = data.cachedState;
    cachedState.accounts.forEach((acc) => {
      (acc.messages || []).forEach((m) => knownUnreadIds.add(m.id));
    });
  }
}

async function saveOverlay() {
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  for (const mapName of ['readIds', 'trashedIds', 'archivedIds']) {
    for (const [id, ts] of Object.entries(localOverlay[mapName])) {
      if (ts < cutoff) delete localOverlay[mapName][id];
    }
  }
  localOverlay.overlayVersion = 2;
  await browser.storage.local.set({ localOverlay });
}

function isDndActive() {
  return currentSettings.dndUntil && currentSettings.dndUntil > Date.now();
}

function applyOverlayToAccounts(rawAccounts) {
  const now = Date.now();
  let totalUnread = 0;

  const processedAccounts = rawAccounts.map((acc, idx) => {
    const cfg = currentSettings.accountConfigs[acc.email] || {};
    const color = cfg.color || acc.color || PocketMailGmailClient.ACCOUNT_COLORS[idx % PocketMailGmailClient.ACCOUNT_COLORS.length];
    const nickname = cfg.nickname || acc.nickname || '';
    const label = cfg.label || 'inbox';

    let removedCount = 0;
    const processedMessages = (acc.messages || []).filter((msg) => {
      if (localOverlay.trashedIds[msg.id] || localOverlay.archivedIds[msg.id]) {
        removedCount++;
        return false;
      }
      const snoozeEntry = localOverlay.snoozed[msg.id];
      if (snoozeEntry && snoozeEntry.wakeAt > now) {
        removedCount++;
        return false;
      }
      return true;
    }).map((msg) => {
      const isReadLocally = Boolean(localOverlay.readIds[msg.id]);
      if (isReadLocally) removedCount++;
      return {
        ...msg,
        unread: !isReadLocally,
        starred: localOverlay.starredIds[msg.id] !== undefined ? localOverlay.starredIds[msg.id] : Boolean(msg.starred),
        accountColor: color,
        accountNickname: nickname
      };
    });

    const unreadMessagesCount = processedMessages.filter((m) => m.unread).length;
    const rawFullCount = Math.max(unreadMessagesCount, Math.max(0, (acc.unreadCount || 0) - removedCount));

    const displayUnread = currentSettings.badgeCountMode === 'total' ? rawFullCount : unreadMessagesCount;

    if (!cfg.disabled) {
      totalUnread += displayUnread;
    }

    return {
      ...acc,
      color,
      nickname,
      label,
      disabled: Boolean(cfg.disabled),
      unreadCount: displayUnread,
      totalGmailUnread: rawFullCount,
      messages: processedMessages
    };
  });

  return {
    accounts: processedAccounts,
    totalUnread
  };
}

/**
 * Update Firefox toolbar badge text, color, and rich hover tooltip
 */
function updateToolbarBadge() {
  const themeObj = PocketMailThemes.THEMES[currentSettings.theme] || PocketMailThemes.THEMES['warm-linen'];
  const badgeBg = themeObj.vars['--badge-bg'] || '#D95032';

  if (isDndActive()) {
    browser.browserAction.setBadgeText({ text: 'DND' });
    browser.browserAction.setBadgeBackgroundColor({ color: '#6E5A4F' });
  } else if (cachedState.totalUnread > 0) {
    const badgeStr = cachedState.totalUnread > 99 ? '99+' : String(cachedState.totalUnread);
    browser.browserAction.setBadgeText({ text: badgeStr });
    browser.browserAction.setBadgeBackgroundColor({ color: badgeBg });
  } else {
    browser.browserAction.setBadgeText({ text: '' });
  }

  // Build informative tooltip
  const lines = [`FoxHub: ${cachedState.totalUnread} unread`];
  cachedState.accounts.forEach((acc) => {
    if (!acc.disabled) {
      const label = acc.nickname ? `${acc.nickname} (${acc.email})` : acc.email;
      lines.push(`• ${label}: ${acc.unreadCount}`);
    }
  });
  if (cachedState.usingDemo) {
    lines.push('(Sample Preview Inbox: Click "+ Add Account" to sign into Gmail)');
  }
  browser.browserAction.setTitle({ title: lines.join('\n') });
}

/**
 * Main Multi-Account Sync Function
 */
async function syncAllAccounts(options = {}) {
  try {
    const maxSlots = currentSettings.maxSessionSlots || 5;
    const sessionAccounts = await PocketMailGmailClient.discoverSessionAccounts(
      maxSlots,
      currentSettings.accountConfigs || {}
    );

    // Also fetch any OAuth-connected accounts
    const oauthResults = [];
    if (Array.isArray(currentSettings.oauthAccounts) && currentSettings.oauthAccounts.length > 0) {
      for (const oa of currentSettings.oauthAccounts) {
        try {
          const feed = await PocketMailGmailClient.fetchOAuthAccountFeed(oa);
          if (!sessionAccounts.some((s) => s.email === feed.email)) {
            oauthResults.push(feed);
          }
        } catch (e) {
          console.warn('OAuth account sync warning for', oa.email, e);
        }
      }
    }

    let combinedRaw = [...sessionAccounts, ...oauthResults];
    let usingDemo = false;

    if (
      currentSettings.demoMode === 'on' ||
      (currentSettings.demoMode === 'auto' && combinedRaw.length === 0)
    ) {
      const demoAccounts = PocketMailGmailClient.getSampleAccountsData();
      combinedRaw = [...combinedRaw, ...demoAccounts];
      usingDemo = true;
    }

    const { accounts, totalUnread } = applyOverlayToAccounts(combinedRaw);

    // Detect newly arrived unread messages
    const newArrivals = [];
    const currentIds = new Set();

    accounts.forEach((acc) => {
      if (acc.disabled) return;
      (acc.messages || []).forEach((msg) => {
        currentIds.add(msg.id);
        if (!isFirstSync && !knownUnreadIds.has(msg.id) && !msg.isDemo) {
          newArrivals.push(msg);
        }
      });
    });

    knownUnreadIds = currentIds;
    isFirstSync = false;

    cachedState = {
      accounts,
      totalUnread,
      lastSyncAt: Date.now(),
      usingDemo,
      syncError: null
    };

    await browser.storage.local.set({ cachedState });
    updateToolbarBadge();

    // Notify on new arrivals (unless Do Not Disturb is active)
    if ((newArrivals.length > 0 || options.forceTestNotification) && !isDndActive()) {
      const targetMsg = options.forceTestNotification
        ? (accounts[0]?.messages?.[0] || {
            senderName: 'FoxHub',
            subject: 'Your local notifications are working!',
            snippet: '100% private and local on your Firefox browser.'
          })
        : newArrivals[0];

      if (currentSettings.desktopNotifications) {
        const title = newArrivals.length > 1
          ? `${newArrivals.length} new emails (${targetMsg.senderName})`
          : `${targetMsg.senderName} (${targetMsg.accountNickname || targetMsg.accountEmail || ''})`;

        browser.notifications.create(`pm-msg-${Date.now()}`, {
          type: 'basic',
          iconUrl: browser.runtime.getURL('icons/icon-128.png'),
          title,
          message: `${targetMsg.subject}\n${targetMsg.snippet || ''}`.slice(0, 220)
        });
      }

      if (currentSettings.soundId !== 'none') {
        PocketMailSound.playNotificationSound(
          currentSettings.soundId,
          currentSettings.soundVolume,
          currentSettings.customAudioData
        );
      }

      if (currentSettings.voiceNotifications) {
        PocketMailSound.speakEmail(targetMsg, currentSettings);
      }
    }

    // Broadcast updated state to open popup or options tabs
    browser.runtime.sendMessage({
      type: 'STATE_UPDATED',
      state: cachedState,
      settings: currentSettings,
      snoozedCount: Object.keys(localOverlay.snoozed || {}).length
    }).catch(() => {});

    return cachedState;
  } catch (err) {
    cachedState.syncError = err.message;
    return cachedState;
  }
}

/**
 * Check Snoozed Emails every minute and wake due emails
 */
async function checkSnoozedEmails() {
  const now = Date.now();
  let changed = false;

  for (const [id, entry] of Object.entries(localOverlay.snoozed)) {
    if (entry.wakeAt <= now) {
      delete localOverlay.snoozed[id];
      delete localOverlay.readIds[id];
      changed = true;

      if (!isDndActive() && currentSettings.desktopNotifications && entry.message) {
        browser.notifications.create(`pm-snooze-${Date.now()}`, {
          type: 'basic',
          iconUrl: browser.runtime.getURL('icons/icon-128.png'),
          title: `Snoozed Email Reminder: ${entry.message.senderName}`,
          message: entry.message.subject
        });
        if (currentSettings.soundId !== 'none') {
          PocketMailSound.playNotificationSound(
            currentSettings.soundId,
            currentSettings.soundVolume,
            currentSettings.customAudioData
          );
        }
      }
    }
  }

  if (changed) {
    await saveOverlay();
    await syncAllAccounts();
  }
}

/**
 * Google Account Sign-In Window Manager
 * Opens Google's AddSession flow so the user can log into any additional Google account,
 * and automatically detects when login finishes and redirects to mail.google.com!
 */
let activeLoginWindowId = null;
const companionWindowIds = new Set();
let prewarmSocialCookieCache = () => {};

/**
 * Unblock X-Frame-Options, CSP frame-ancestors, and attach first-party cookies
 * for embedded media iframes inside PocketMail so logins & sessions work inside the frame
 */
if (browser.webRequest) {
  const extOrigin = browser.runtime.getURL('');

  const STATIC_CDN_SUFFIXES = [
    'static.whatsapp.net',
    'abs.twimg.com',
    'pbs.twimg.com',
    'video.twimg.com',
    'ttwstatic.com',
    'tiktokcdn.com',
    'tiktokcdn-us.com',
    'scdn.co',
    'spotifycdn.com',
    'ytimg.com',
    'ggpht.com',
    'googlevideo.com',
    'redditstatic.com',
    'redd.it',
    'cdninstagram.com',
    'fbcdn.net',
    'jtvnw.net',
    'ttvnw.net',
    // CAPTCHA & verification providers + Discord CDN (never spoof headers or delay with async cookie checks!)
    'hcaptcha.com',
    'newassets.hcaptcha.com',
    'challenges.cloudflare.com',
    'recaptcha.net',
    'gstatic.com',
    'arkoselabs.com',
    'funcaptcha.com',
    'cdn.discordapp.com',
    'media.discordapp.net',
    'discordapp.net',
    'scdn.co',
    'spotifycdn.com',
    'akamaized.net',
    // Spotify Bearer-token APIs (use credentials: 'omit' — never delay or inject cookies!)
    'api-partner.spotify.com',
    'clienttoken.spotify.com',
    'api.spotify.com',
    'spclient.wg.spotify.com'
  ];

  const isStaticCdnHost = (hostname, fullUrl = '') => {
    const h = (hostname || '').toLowerCase();
    if (STATIC_CDN_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`))) {
      return true;
    }
    // Only open.spotify.com and accounts.spotify.com use session cookies; all other *.spotify.com hosts (spclient, dealer, apresolve, login5, melody) use Bearer tokens
    if (h.endsWith('.spotify.com') && h !== 'open.spotify.com' && h !== 'accounts.spotify.com') {
      return true;
    }
    if (fullUrl && (/\/(hcaptcha|recaptcha|turnstile)\b/i.test(fullUrl))) {
      return true;
    }
    return false;
  };

  const isFromPocketMail = (details) => {
    if (
      details.tabId === -1 ||
      companionWindowIds.has(details.windowId) ||
      (details.originUrl && details.originUrl.startsWith(extOrigin)) ||
      (details.documentUrl && details.documentUrl.startsWith(extOrigin))
    ) {
      return true;
    }
    if (Array.isArray(details.frameAncestors) && details.frameAncestors.length > 0) {
      return details.frameAncestors.some((a) => a.url && a.url.startsWith(extOrigin));
    }
    return false;
  };

  // Block Service Worker registration scripts across embedded social apps
  // Note: Firefox SW script fetches have originUrl set to the site origin (not moz-extension://) and empty frameAncestors,
  // so we block sw.js directly on these domains so a Service Worker never caches X-Frame-Options: DENY or slows down boot!
  if (browser.webRequest.onBeforeRequest) {
    browser.webRequest.onBeforeRequest.addListener(
      (details) => {
        if (/\/(sw|service-worker|serviceworker|guest-sw|guest-events-sw|OneSignalSDKWorker)\.js(\?|$)/i.test(details.url || '')) {
          return { cancel: true };
        }
        return {};
      },
      {
        urls: [
          '*://*.whatsapp.com/*',
          '*://*.youtube.com/*',
          '*://*.x.com/*',
          '*://*.twitter.com/*'
        ],
        types: ['script', 'xmlhttprequest', 'other']
      },
      ['blocking']
    );
  }

  // 5-minute in-memory cookie lookup cache kept live via browser.cookies.onChanged:
  // - Warm cache hits merge cookies 100% SYNCHRONOUSLY in <0.005ms (returns plain object, ZERO Promise overhead!)
  // - Prewarmed on startup and on rail hover so initial app clicks never wait on async SQLite cookie reads
  const COOKIE_CACHE_TTL_MS = 300000;
  const cookieLookupCache = new Map();
  function getSyncCachedCookies(originKey) {
    const cached = cookieLookupCache.get(originKey);
    if (cached && Date.now() - cached.ts < COOKIE_CACHE_TTL_MS) {
      return cached.cookies;
    }
    return null;
  }

  async function getCachedCookiesForOrigin(urlStr, originKey) {
    const syncHit = getSyncCachedCookies(originKey);
    if (syncHit) return syncHit;
    const now = Date.now();
    const storeCookies = await browser.cookies.getAll({ url: urlStr });
    if (cookieLookupCache.size > 80) cookieLookupCache.clear();
    const list = storeCookies || [];
    cookieLookupCache.set(originKey, { ts: now, cookies: list });
    if (originKey.includes('tiktok.com')) {
      cookieLookupCache.set('tiktok-root', { ts: now, cookies: list });
    }
    return list;
  }

  const PREWARM_SOCIAL_URLS = [
    'https://www.instagram.com/',
    'https://web.whatsapp.com/',
    'https://discord.com/',
    'https://web.telegram.org/',
    'https://open.spotify.com/',
    'https://accounts.spotify.com/',
    'https://www.youtube.com/',
    'https://music.youtube.com/',
    'https://www.tiktok.com/',
    'https://x.com/',
    'https://api.x.com/',
    'https://www.messenger.com/',
    'https://www.reddit.com/',
    'https://chat.reddit.com/'
  ];

  prewarmSocialCookieCache = (specificUrl = '') => {
    if (!browser.cookies || !browser.cookies.getAll) return;
    const urls = specificUrl ? [specificUrl] : PREWARM_SOCIAL_URLS;
    urls.forEach((u) => {
      try {
        const origin = new URL(u).origin;
        if (!getSyncCachedCookies(origin)) {
          getCachedCookiesForOrigin(u, origin).catch(() => {});
        }
      } catch (_) {}
    });
  };

  if (browser.cookies && browser.cookies.onChanged) {
    browser.cookies.onChanged.addListener((changeInfo) => {
      const domain = (changeInfo.cookie?.domain || '').replace(/^\./, '').toLowerCase();
      if (!domain) return;
      for (const key of cookieLookupCache.keys()) {
        if (key.includes(domain)) {
          cookieLookupCache.delete(key);
        }
      }
    });
  }

  function mergeCookiesIntoHeaders(headers, storeCookies) {
    if (!storeCookies || storeCookies.length === 0) return;
    const cookieIdx = headers.findIndex((h) => (h.name || '').toLowerCase() === 'cookie');
    const map = new Map();
    if (cookieIdx >= 0 && headers[cookieIdx].value) {
      headers[cookieIdx].value.split(';').forEach((pair) => {
        const eq = pair.indexOf('=');
        if (eq > 0) {
          map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
        }
      });
    }
    storeCookies.forEach((c) => {
      if (!map.has(c.name)) {
        map.set(c.name, c.value);
      }
    });
    const merged = Array.from(map.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    if (cookieIdx >= 0) {
      headers[cookieIdx].value = merged;
    } else if (merged) {
      headers.push({ name: 'Cookie', value: merged });
    }
  }

  function getRootOriginForHost(hostname) {
    const h = (hostname || '').toLowerCase();
    if (h.endsWith('.spotify.com') || h === 'spotify.com') return 'https://open.spotify.com';
    if (h.endsWith('.x.com') || h === 'x.com' || h.endsWith('.twitter.com')) return 'https://x.com';
    if (h.endsWith('.tiktok.com') || h === 'tiktok.com') return 'https://www.tiktok.com';
    if (h.endsWith('.instagram.com') || h === 'instagram.com') return 'https://www.instagram.com';
    if (h.endsWith('.reddit.com') || h === 'reddit.com') return 'https://www.reddit.com';
    if (h.endsWith('.youtube.com') || h === 'youtube.com') return 'https://www.youtube.com';
    if (h.endsWith('.messenger.com') || h === 'messenger.com') return 'https://www.messenger.com';
    if (h.endsWith('.discord.com') || h === 'discord.com') return 'https://discord.com';
    return '';
  }

  if (browser.webRequest.onBeforeSendHeaders) {
    browser.webRequest.onBeforeSendHeaders.addListener(
      (details) => {
        if (!Array.isArray(details.requestHeaders)) {
          return {};
        }
        if (!isFromPocketMail(details)) {
          return {};
        }

        const isDirectExtRequest = Boolean(
          (details.originUrl && details.originUrl.startsWith(extOrigin)) ||
            (details.documentUrl && details.documentUrl.startsWith(extOrigin))
        );

        let parsedUrl = null;
        try {
          parsedUrl = new URL(details.url);
        } catch (_) {
          return {};
        }

        // Never modify headers or inject cookies on static CDN assets or CAPTCHA verification frames
        if (isStaticCdnHost(parsedUrl.hostname, details.url)) {
          return {};
        }

        const targetOrigin = parsedUrl.origin;
        const rootOrigin = getRootOriginForHost(parsedUrl.hostname);
        const headers = [...details.requestHeaders];
        // True ONLY for the top-level embedded media app frame inside PocketHub (never for nested iframes like hCaptcha inside Discord)
        const isTopEmbeddedAppFrame =
          details.type === 'sub_frame' &&
          (isDirectExtRequest ||
            (Array.isArray(details.frameAncestors) &&
              details.frameAncestors.length === 1 &&
              details.frameAncestors[0].url &&
              details.frameAncestors[0].url.startsWith(extOrigin))) &&
          (details.parentFrameId === 0 || details.parentFrameId === -1);

        const isRedditChat = parsedUrl.hostname === 'chat.reddit.com';
        let hasHttpReferer = false;
        for (const h of headers) {
          const lower = (h.name || '').toLowerCase();
          if (lower === 'referer' && h.value && h.value.startsWith('http')) {
            hasHttpReferer = true;
          }
        }

        let hasReferer = false;
        for (const h of headers) {
          const lower = (h.name || '').toLowerCase();
          if (isTopEmbeddedAppFrame) {
            // Only spoof Sec-Fetch-* on the top-level embedded app navigation itself
            if (lower === 'sec-fetch-dest') {
              h.value = 'document';
            } else if (lower === 'sec-fetch-mode') {
              h.value = 'navigate';
            } else if (lower === 'sec-fetch-site') {
              h.value = isRedditChat ? 'same-site' : hasHttpReferer ? 'same-origin' : 'none';
            }
          }
          if (lower === 'origin' && h.value && h.value.startsWith('moz-extension://') && targetOrigin) {
            h.value = isRedditChat ? 'https://www.reddit.com' : targetOrigin;
          } else if (lower === 'referer') {
            hasReferer = true;
            if (isRedditChat) {
              h.value = 'https://www.reddit.com/';
            } else if (h.value && h.value.startsWith('moz-extension://') && targetOrigin) {
              h.value = `${targetOrigin}/`;
            }
          }
        }

        if (!hasReferer && isRedditChat) {
          headers.push({ name: 'Referer', value: 'https://www.reddit.com/' });
        } else if (!hasReferer && targetOrigin && parsedUrl.hostname.includes('mail.google.com')) {
          headers.push({ name: 'Referer', value: 'https://mail.google.com/mail/u/0/' });
        }

        // Fast Path: If cookies are already in our 5m RAM cache, merge 100% SYNCHRONOUSLY in 0ms (no Promise!)
        const syncCookies = getSyncCachedCookies(targetOrigin);
        const syncRootCookies = rootOrigin && rootOrigin !== targetOrigin ? getSyncCachedCookies(rootOrigin) : null;
        if (syncCookies && (!rootOrigin || rootOrigin === targetOrigin || syncRootCookies)) {
          const combined = syncRootCookies ? [...syncCookies, ...syncRootCookies] : syncCookies;
          mergeCookiesIntoHeaders(headers, combined);
          return { requestHeaders: headers };
        }

        return (async () => {
          if (browser.cookies && browser.cookies.getAll && details.url.startsWith('http')) {
            try {
              let storeCookies = await getCachedCookiesForOrigin(details.url, targetOrigin);
              if (rootOrigin && rootOrigin !== targetOrigin) {
                const rootCookies = await getCachedCookiesForOrigin(`${rootOrigin}/`, rootOrigin);
                storeCookies = [...(storeCookies || []), ...(rootCookies || [])];
              }
              mergeCookiesIntoHeaders(headers, storeCookies);
            } catch (_) {}
          }

          return { requestHeaders: headers };
        })();
      },
      {
        urls: ['<all_urls>'],
        types: ['sub_frame', 'xmlhttprequest']
      },
      ['blocking', 'requestHeaders']
    );
  }

  const EMBEDDED_SOCIAL_HOST_SUFFIXES = [
    'x.com',
    'twitter.com',
    'whatsapp.com',
    'youtube.com',
    'tiktok.com',
    'instagram.com',
    'spotify.com',
    'discord.com',
    'reddit.com',
    'messenger.com',
    'telegram.org'
  ];

  const isEmbeddedSocialHost = (urlStr) => {
    if (!urlStr) return false;
    try {
      const h = new URL(urlStr).hostname.toLowerCase();
      return EMBEDDED_SOCIAL_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
    } catch (_) {
      return false;
    }
  };

  if (browser.webRequest.onHeadersReceived) {
    browser.webRequest.onHeadersReceived.addListener(
      (details) => {
        const isBootRequest = Boolean(details.url && details.url.includes('pm_boot=1'));
        const isSocialHost = isEmbeddedSocialHost(details.url);
        if ((!isFromPocketMail(details) && !isBootRequest && !isSocialHost) || !Array.isArray(details.responseHeaders)) {
          return {};
        }

        const cleanedHeaders = [];
        for (const h of details.responseHeaders) {
          const name = (h.name || '').toLowerCase();
          if (
            name === 'x-frame-options' ||
            name === 'cross-origin-embedder-policy' ||
            name === 'cross-origin-opener-policy' ||
            name === 'cross-origin-resource-policy'
          ) {
            continue;
          }
          if (isBootRequest && name === 'content-type') {
            continue;
          }
          if (name === 'content-security-policy' || name === 'content-security-policy-report-only') {
            if (isBootRequest) {
              continue;
            }
            // Strip frame-ancestors whether preceded by ';', ',' (e.g. Meta/WhatsApp merged CSP headers!), or start of string
            const strippedCsp = (h.value || '')
              .replace(/(^|[;,])\s*frame-ancestors\b[^;,]*/gi, '$1')
              .replace(/,\s*,/g, ',')
              .replace(/;\s*,/g, ',')
              .replace(/^[;,\s]+|[;,\s]+$/g, '');
            if (strippedCsp.length > 0) {
              cleanedHeaders.push({ name: h.name, value: strippedCsp });
            }
            continue;
          }
          cleanedHeaders.push(h);
        }

        if (isBootRequest) {
          cleanedHeaders.push({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
        }

        return { responseHeaders: cleanedHeaders };
      },
      { urls: ['<all_urls>'], types: ['main_frame', 'sub_frame', 'xmlhttprequest', 'other'] },
      ['blocking', 'responseHeaders']
    );
  }
}

async function openGoogleAccountLoginFlow() {
  const loginUrl = 'https://accounts.google.com/AddSession?hl=en&service=mail&continue=https%3A%2F%2Fmail.google.com%2Fmail%2F';

  const win = await browser.windows.create({
    url: loginUrl,
    type: 'popup',
    width: 520,
    height: 680
  });

  activeLoginWindowId = win.id;
  return { ok: true, windowId: win.id };
}

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!activeLoginWindowId || tab.windowId !== activeLoginWindowId) return;

  const url = changeInfo.url || tab.url || '';
  // Detect when Google login completes and lands on mail.google.com/mail/u/...
  if (url.startsWith('https://mail.google.com/mail/') && changeInfo.status === 'complete') {
    const finishedWinId = activeLoginWindowId;
    activeLoginWindowId = null;

    // If user was in auto demo mode, switch demo off when a real account is connected
    if (currentSettings.demoMode === 'on') {
      currentSettings.demoMode = 'auto';
      await browser.storage.local.set({ settings: currentSettings });
    }

    setTimeout(async () => {
      try {
        await browser.windows.remove(finishedWinId);
      } catch (_) {}
      await syncAllAccounts();
      PocketMailSound.playNotificationSound('morning-dew', currentSettings.soundVolume);
      browser.notifications.create(`pm-login-${Date.now()}`, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/icon-128.png'),
        title: 'Google Account Connected!',
        message: 'PocketMail has added your Gmail account locally.'
      });
    }, 1200);
  }
});

browser.windows.onRemoved.addListener((windowId) => {
  companionWindowIds.delete(windowId);
  if (windowId === activeLoginWindowId) {
    activeLoginWindowId = null;
    syncAllAccounts();
  }
});

/**
 * Perform single or bulk message actions
 */
async function handleMessageAction(message, actionType, extra = {}) {
  const msgId = message.id;
  const now = Date.now();

  // 1. Update local optimistic overlay immediately
  if (actionType === 'markRead') {
    localOverlay.readIds[msgId] = now;
  } else if (actionType === 'markUnread') {
    delete localOverlay.readIds[msgId];
  } else if (actionType === 'deleteTrash') {
    localOverlay.trashedIds[msgId] = now;
  } else if (actionType === 'archive') {
    localOverlay.archivedIds[msgId] = now;
  } else if (actionType === 'star') {
    localOverlay.starredIds[msgId] = true;
  } else if (actionType === 'unstar') {
    localOverlay.starredIds[msgId] = false;
  } else if (actionType === 'spam') {
    localOverlay.trashedIds[msgId] = now;
  } else if (actionType === 'snooze') {
    const wakeAt = extra.wakeAt || (now + 3600 * 1000);
    localOverlay.snoozed[msgId] = { wakeAt, message };
  } else if (actionType === 'unsnooze') {
    delete localOverlay.snoozed[msgId];
  }

  await saveOverlay();

  // Re-apply overlay to cached state immediately for instant UI response
  const updated = applyOverlayToAccounts(cachedState.accounts);
  cachedState.accounts = updated.accounts;
  cachedState.totalUnread = updated.totalUnread;
  await browser.storage.local.set({ cachedState });
  updateToolbarBadge();

  // 2. If it's a real Gmail account (not demo & not snooze), execute the remote Gmail action
  if (!message.isDemo && !['snooze', 'unsnooze'].includes(actionType)) {
    if (message.accountType === 'oauth') {
      const oa = (currentSettings.oauthAccounts || []).find((a) => a.email === message.accountEmail);
      if (oa) {
        await PocketMailGmailClient.executeOAuthAction(oa, message.messageId || message.threadId, actionType);
      }
    } else {
      await PocketMailGmailClient.executeSessionAction(
        message.accountSlot || 0,
        message.accountEmail,
        message.threadId,
        actionType
      );
    }
  }

  return cachedState;
}

/**
 * Polling Loop Setup
 */
function restartPollingTimer() {
  if (pollTimer) clearInterval(pollTimer);
  const intervalMs = Math.max(15, currentSettings.pollIntervalSeconds || 30) * 1000;
  pollTimer = setInterval(() => {
    syncAllAccounts();
    checkSnoozedEmails();
  }, intervalMs);
}

/**
 * Message Listener for Popup & Options UI
 */
const liveMediaPlaybackState = new Map(); // appId -> { isPlaying, currentTime, resumeUrl, title, updatedAt }
const bgAudioPool = new Map(); // appId -> { frame, url, title, autoplayBlocked }
const bgMsePlayers = new Map(); // appId -> { ms, audioEl, sb, queue, objUrl }
const bgSpEmePlayers = new Map(); // appId -> { videoEl, ms, sb, queue, mk, mkReadyPromise, serverCert, licAuth, pendingGenReqs, objUrl, targetTime, msId }

function isAppAllowedForPersistence(appId) {
  if (!appId || appId === 'pocketmail') return false;
  const mode = currentSettings.persistenceMode || 'eco';
  if (mode === 'all') return true;
  if (mode === 'selected') {
    const list = Array.isArray(currentSettings.persistentAppIds)
      ? currentSettings.persistentAppIds
      : ['spotify', 'youtube', 'discord'];
    return list.includes(appId);
  }
  return false;
}

function cleanupMsePlayer(appId) {
  const player = bgMsePlayers.get(appId);
  if (!player) return;
  bgMsePlayers.delete(appId);
  try {
    player.audioEl.pause();
    player.audioEl.removeAttribute('src');
    player.audioEl.load();
    player.audioEl.remove();
  } catch (_) {}
  try {
    if (player.objUrl) URL.revokeObjectURL(player.objUrl);
  } catch (_) {}
}

function cleanupSpEmePlayer(appId) {
  const sp = bgSpEmePlayers.get(appId);
  if (!sp) return;
  bgSpEmePlayers.delete(appId);
  try {
    if (sp.videoEl) {
      sp.videoEl.pause();
      sp.videoEl.removeAttribute('src');
      sp.videoEl.load();
      sp.videoEl.remove();
    }
  } catch (_) {}
  try {
    if (sp.objUrl) URL.revokeObjectURL(sp.objUrl);
  } catch (_) {}
}

function getOrCreateBgSpState(appId) {
  let sp = bgSpEmePlayers.get(appId);
  if (!sp) {
    sp = {
      videoEl: null,
      ms: null,
      sb: null,
      queue: [],
      mk: null,
      mkReadyPromise: null,
      serverCert: null,
      licAuth: null,
      pendingGenReqs: [],
      objUrl: null,
      targetTime: 0,
      msId: 0
    };
    bgSpEmePlayers.set(appId, sp);
  }
  return sp;
}

function drainBgSpQueue(appId) {
  const sp = bgSpEmePlayers.get(appId);
  if (!sp || !sp.sb || sp.sb.updating || sp.queue.length === 0) return;
  const item = sp.queue.shift();
  try {
    if (item.type === 'remove') {
      sp.sb.remove(item.start, item.end);
    } else if (item.chunk) {
      if (
        typeof item.timestampOffset === 'number' &&
        Math.abs((sp.sb.timestampOffset || 0) - item.timestampOffset) > 0.01
      ) {
        sp.sb.timestampOffset = item.timestampOffset;
      }
      sp.sb.appendBuffer(item.chunk);
    }
  } catch (_) {}
}

async function processPendingSpGenReqs(appId) {
  const sp = bgSpEmePlayers.get(appId);
  if (!sp || !sp.mk || !sp.licAuth || sp.pendingGenReqs.length === 0) return;
  while (sp.pendingGenReqs.length > 0) {
    const req = sp.pendingGenReqs.shift();
    try {
      const sess = sp.mk.createSession();
      sess.addEventListener('message', async (ev) => {
        try {
          const resp = await fetch(sp.licAuth.url, {
            method: 'POST',
            headers: sp.licAuth.headers,
            body: ev.message
          });
          const licBuf = await resp.arrayBuffer();
          await sess.update(licBuf);
          const curSp = bgSpEmePlayers.get(appId);
          if (curSp && curSp.videoEl) {
            if (
              curSp.targetTime &&
              Math.abs(curSp.videoEl.currentTime - curSp.targetTime) > 1.5 &&
              curSp.videoEl.readyState >= 1
            ) {
              curSp.videoEl.currentTime = curSp.targetTime;
            }
            curSp.videoEl.play().catch(() => {});
          }
        } catch (_) {}
      });
      await sess.generateRequest(req.initDataType, req.initData);
    } catch (_) {}
  }
}

function ensureBgSpEmePlayer(appId, mime) {
  const sp = getOrCreateBgSpState(appId);
  if (sp.mkReadyPromise) return sp.mkReadyPromise;
  const effectiveMime = mime || 'audio/mp4; codecs="mp4a.40.2"';
  sp.mkReadyPromise = (async () => {
    try {
      const v = document.createElement('video');
      v.autoplay = true;
      v.muted = false;
      v.volume = 1.0;
      document.body.appendChild(v);
      sp.videoEl = v;

      const acc = await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [
        {
          initDataTypes: ['cenc'],
          audioCapabilities: [{ contentType: effectiveMime, robustness: 'SW_SECURE_CRYPTO' }]
        }
      ]);
      const mk = await acc.createMediaKeys();
      if (sp.serverCert) {
        await mk.setServerCertificate(sp.serverCert).catch(() => {});
      }
      await v.setMediaKeys(mk);
      sp.mk = mk;

      const ms = new MediaSource();
      sp.ms = ms;
      sp.objUrl = URL.createObjectURL(ms);
      v.src = sp.objUrl;
      await new Promise((resolve) => {
        ms.addEventListener(
          'sourceopen',
          () => {
            try {
              const sb = ms.addSourceBuffer(effectiveMime);
              sp.sb = sb;
              sb.addEventListener('updateend', () => {
                drainBgSpQueue(appId);
                if (sp.videoEl && sp.videoEl.paused && sp.videoEl.readyState >= 2) {
                  sp.videoEl.play().catch(() => {});
                }
              });
            } catch (_) {}
            resolve();
          },
          { once: true }
        );
      });
      drainBgSpQueue(appId);
      processPendingSpGenReqs(appId);
    } catch (_) {}
  })();
  return sp.mkReadyPromise;
}

function stopSingleBackgroundAudioFrame(appId) {
  if (!appId) return;
  cleanupMsePlayer(appId);
  cleanupSpEmePlayer(appId);
  const entry = bgAudioPool.get(appId);
  if (entry) {
    bgAudioPool.delete(appId);
    try {
      entry.frame.remove();
      entry.frame.src = 'about:blank';
    } catch (_) {}
  }
  if (bgAudioPool.size === 0) {
    updateToolbarBadge();
  }
}

function stopBackgroundAudioFrames() {
  if (bgAudioPool.size === 0 && bgMsePlayers.size === 0 && bgSpEmePlayers.size === 0) return;
  bgAudioPool.forEach((entry, appId) => {
    cleanupMsePlayer(appId);
    cleanupSpEmePlayer(appId);
    try {
      entry.frame.remove();
      entry.frame.src = 'about:blank';
    } catch (_) {}
  });
  bgMsePlayers.forEach((_, appId) => cleanupMsePlayer(appId));
  bgSpEmePlayers.forEach((_, appId) => cleanupSpEmePlayer(appId));
  bgAudioPool.clear();
  updateToolbarBadge();
}

function startBackgroundAudioKeepAlive(appId, targetUrl, title = '') {
  if (!appId || !targetUrl || !document.body) return;
  const mode = currentSettings.persistenceMode || 'eco';
  if (mode === 'eco' || currentSettings.keepAudioPlayingWhenClosed === false) return;

  const existing = bgAudioPool.get(appId);
  if (existing) {
    // If this app's background audio keep-alive frame is already connected and running, keep it playing with 0ms interruption!
    if (existing.frame && existing.frame.isConnected) {
      return;
    }
    try {
      existing.frame.remove();
      existing.frame.src = 'about:blank';
    } catch (_) {}
    bgAudioPool.delete(appId);
  }
  cleanupMsePlayer(appId);
  cleanupSpEmePlayer(appId);

  const iframe = document.createElement('iframe');
  iframe.name = `pm-bg-audio-${appId}`;
  iframe.setAttribute(
    'allow',
    'autoplay *; encrypted-media *; clipboard-write *; picture-in-picture *; fullscreen *'
  );
  iframe.style.cssText =
    'position:fixed;left:-9999px;top:-9999px;width:420px;height:680px;opacity:0;pointer-events:none;border:none;';
  iframe.src = targetUrl;
  document.body.appendChild(iframe);
  bgAudioPool.set(appId, {
    frame: iframe,
    url: targetUrl,
    title,
    autoplayBlocked: false,
    startedAt: Date.now()
  });

  try {
    browser.browserAction.setBadgeText({ text: '▶' });
    browser.browserAction.setBadgeBackgroundColor({ color: '#1DB954' });
  } catch (_) {}
}

function triggerSidebarClosedAudioHandoff(candidates = []) {
  const mode = currentSettings.persistenceMode || 'eco';
  if (mode === 'eco') {
    stopBackgroundAudioFrames();
    return;
  }
  browser.storage.local.set({ settings: currentSettings }).catch(() => {});

  if (currentSettings.keepAudioPlayingWhenClosed === false) return;

  let startedAny = false;
  if (Array.isArray(candidates) && candidates.length > 0) {
    candidates.forEach((c) => {
      if (c && c.appId && c.url) {
        startBackgroundAudioKeepAlive(c.appId, c.url, c.title || '');
        startedAny = true;
      }
    });
  }
  if (!startedAny) {
    liveMediaPlaybackState.forEach((st, id) => {
      if (st.isPlaying && Date.now() - st.updatedAt < 60000) {
        const targetUrl = st.resumeUrl || currentSettings.persistentSavedAppUrls?.[id];
        if (targetUrl) {
          startBackgroundAudioKeepAlive(id, targetUrl, st.title || '');
          startedAny = true;
        }
      }
    });
  }
}

if (browser.runtime && browser.runtime.onConnect) {
  browser.runtime.onConnect.addListener((port) => {
    if (!port || port.name !== 'foxhub-sidebar-lifecycle') return;

    port.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'UPDATE_PERSISTENT_SESSION') {
        if (msg.activeAppId && isAppAllowedForPersistence(msg.activeAppId)) {
          currentSettings.persistentLastActiveAppId = msg.activeAppId;
        } else if (msg.activeAppId === 'pocketmail' && msg.explicitMailClick && bgAudioPool.size === 0) {
          currentSettings.persistentLastActiveAppId = 'pocketmail';
        }
        if (msg.appId && msg.url && !msg.url.includes('pm_boot=1')) {
          if (!currentSettings.persistentSavedAppUrls) {
            currentSettings.persistentSavedAppUrls = {};
          }
          if (isAppAllowedForPersistence(msg.appId)) {
            currentSettings.persistentSavedAppUrls[msg.appId] = msg.url;
          }
        }
        if (msg.appId && msg.playback) {
          const prev = liveMediaPlaybackState.get(msg.appId);
          const inTakeoverGrace =
            prev && prev.handedOffAt && Date.now() - prev.handedOffAt < 15000 && prev.isPlaying;
          liveMediaPlaybackState.set(msg.appId, {
            ...msg.playback,
            isPlaying: Boolean(msg.playback.isPlaying || inTakeoverGrace),
            handedOffAt: inTakeoverGrace ? prev.handedOffAt : undefined,
            updatedAt: Date.now()
          });
          if (msg.playback.resumeUrl && isAppAllowedForPersistence(msg.appId)) {
            if (!currentSettings.persistentSavedAppUrls) {
              currentSettings.persistentSavedAppUrls = {};
            }
            currentSettings.persistentSavedAppUrls[msg.appId] = msg.playback.resumeUrl;
          }
        }
      }
    });

    // Fires 100% reliably in 0ms the instant the Firefox Left Sidebar (×) or Popup is closed!
    port.onDisconnect.addListener(() => {
      triggerSidebarClosedAudioHandoff();
    });
  });
}

window.addEventListener('message', (e) => {
  const data = e.data;
  if (!data || data.source !== 'pocketmail-media-frame') return;
  if (typeof data.flatFrameName !== 'string' || !data.flatFrameName.startsWith('pm-bg-audio-')) return;
  const appId = data.flatFrameName.replace('pm-bg-audio-', '');
  if (!appId || !bgAudioPool.has(appId)) return;

  if (data.type === 'PM_FRAME_PLAYBACK_STATE') {
    if (data.resumeUrl) {
      if (!currentSettings.persistentSavedAppUrls) currentSettings.persistentSavedAppUrls = {};
      currentSettings.persistentSavedAppUrls[appId] = data.resumeUrl;
      const bgEntry = bgAudioPool.get(appId);
      if (bgEntry) {
        bgEntry.url = data.resumeUrl;
        if (data.title) bgEntry.title = data.title;
        if (typeof data.autoplayBlocked === 'boolean') {
          bgEntry.autoplayBlocked = data.autoplayBlocked;
        }
      }
    }
    if (data.isPlaying) {
      liveMediaPlaybackState.set(appId, {
        isPlaying: true,
        currentTime: Number(data.currentTime) || 0,
        resumeUrl: data.resumeUrl || bgAudioPool.get(appId)?.url || '',
        title: data.title || bgAudioPool.get(appId)?.title || '',
        updatedAt: Date.now()
      });
    }
  } else if (data.type === 'PM_SP_EME_BRIDGE') {
    const sp = getOrCreateBgSpState(appId);
    const bt = data.bridgeType;
    if (bt === 'SERVER_CERT') {
      sp.serverCert = data.cert;
      if (sp.mk) sp.mk.setServerCertificate(data.cert).catch(() => {});
    } else if (bt === 'LIC_AUTH') {
      sp.licAuth = { url: data.url, headers: data.headers };
      processPendingSpGenReqs(appId);
    } else if (bt === 'GEN_REQ') {
      sp.pendingGenReqs.push({ initDataType: data.initDataType, initData: data.initData });
      ensureBgSpEmePlayer(appId, 'audio/mp4; codecs="mp4a.40.2"');
      processPendingSpGenReqs(appId);
    } else if (bt === 'MSE_INIT') {
      ensureBgSpEmePlayer(appId, data.mime);
    } else if (bt === 'MSE_CHUNK') {
      ensureBgSpEmePlayer(appId, data.mime);
      sp.queue.push({ type: 'append', chunk: data.chunk, timestampOffset: data.timestampOffset });
      drainBgSpQueue(appId);
    } else if (bt === 'MSE_REMOVE') {
      sp.queue.push({ type: 'remove', start: data.start, end: data.end });
      drainBgSpQueue(appId);
    } else if (bt === 'SYNC_TIME') {
      sp.targetTime = data.currentTime;
      if (sp.videoEl) {
        if (!data.paused) {
          if (Math.abs(sp.videoEl.currentTime - data.currentTime) > 1.5 && sp.videoEl.readyState >= 1) {
            sp.videoEl.currentTime = data.currentTime;
          }
          if (sp.videoEl.paused && sp.videoEl.readyState >= 2) {
            sp.videoEl.play().catch(() => {});
          }
          const bgEntry = bgAudioPool.get(appId);
          liveMediaPlaybackState.set(appId, {
            isPlaying: true,
            currentTime: Math.floor(data.currentTime || 0),
            resumeUrl: bgEntry?.url || 'https://open.spotify.com/',
            title: bgEntry?.title || 'Spotify',
            updatedAt: Date.now()
          });
        } else if (!sp.videoEl.paused) {
          sp.videoEl.pause();
        }
      }
    }
  } else if (data.type === 'PM_BG_AUDIO_CHUNK' && data.chunk) {
    // 100% local in-memory MediaSource Opus stream player (zero network/UDP sockets, bypasses iframe autoplay restrictions!)
    let player = bgMsePlayers.get(appId);
    if (!player) {
      const ms = new MediaSource();
      const objUrl = URL.createObjectURL(ms);
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.muted = false;
      audioEl.volume = 1.0;
      audioEl.src = objUrl;
      document.body.appendChild(audioEl);
      player = { ms, audioEl, sb: null, queue: [], objUrl };
      bgMsePlayers.set(appId, player);

      ms.addEventListener('sourceopen', () => {
        try {
          player.sb = ms.addSourceBuffer('audio/webm;codecs=opus');
          player.sb.addEventListener('updateend', () => {
            try {
              if (player.audioEl.currentTime > 35 && !player.sb.updating && player.sb.buffered.length > 0) {
                const start = player.sb.buffered.start(0);
                if (player.audioEl.currentTime - start > 25) {
                  player.sb.remove(start, player.audioEl.currentTime - 15);
                  return;
                }
              }
              if (player.queue.length > 0 && !player.sb.updating) {
                player.sb.appendBuffer(player.queue.shift());
              }
              if (player.audioEl.paused) {
                player.audioEl.play().catch(() => {});
              }
            } catch (_) {}
          });
          if (player.queue.length > 0 && !player.sb.updating) {
            player.sb.appendBuffer(player.queue.shift());
          }
        } catch (_) {}
      });
    }

    if (player.sb && !player.sb.updating && player.queue.length === 0) {
      try {
        player.sb.appendBuffer(data.chunk);
      } catch (_) {}
    } else if (player.queue.length < 40) {
      player.queue.push(data.chunk);
    }
    const bgEntry = bgAudioPool.get(appId);
    const prevSt = liveMediaPlaybackState.get(appId);
    liveMediaPlaybackState.set(appId, {
      isPlaying: true,
      currentTime: prevSt?.currentTime || 0,
      resumeUrl: bgEntry?.url || prevSt?.resumeUrl || '',
      title: bgEntry?.title || prevSt?.title || '',
      updatedAt: Date.now()
    });
  }
});

browser.runtime.onMessage.addListener((msg, sender) => {
  switch (msg.type) {
    case 'GET_STATE':
      prewarmSocialCookieCache();
      return Promise.resolve({
        state: cachedState,
        settings: currentSettings,
        snoozed: localOverlay.snoozed
      });

    case 'PREWARM_APP_SESSION':
      prewarmSocialCookieCache(msg.url || '');
      return Promise.resolve({ ok: true });

    case 'SYNC_NOW':
      return syncAllAccounts({ forceTestNotification: Boolean(msg.forceTestNotification) }).then((state) => ({
        state,
        settings: currentSettings,
        snoozed: localOverlay.snoozed
      }));

    case 'MESSAGE_ACTION':
      return handleMessageAction(msg.message, msg.actionType, msg.extra).then((state) => ({
        state,
        snoozed: localOverlay.snoozed
      }));

    case 'MARK_ALL_READ':
      return (async () => {
        const targetEmail = msg.accountEmail; // null means all accounts
        const toMark = [];
        cachedState.accounts.forEach((acc) => {
          if (!targetEmail || acc.email === targetEmail) {
            (acc.messages || []).forEach((m) => toMark.push(m));
          }
        });
        for (const m of toMark) {
          await handleMessageAction(m, 'markRead');
        }
        return { state: cachedState, snoozed: localOverlay.snoozed };
      })();

    case 'FETCH_FULL_EMAIL':
      return PocketMailGmailClient.fetchFullEmailContent(msg.message);

    case 'SEND_EMAIL':
      return (async () => {
        const payload = msg.payload || {};
        const oauthAcc = (currentSettings.oauthAccounts || []).find(
          (a) => a.email && payload.accountEmail && a.email.toLowerCase() === payload.accountEmail.toLowerCase()
        );
        const res = await PocketMailGmailClient.sendEmailDirect(payload, oauthAcc);
        if (res && res.ok && currentSettings.soundId !== 'none') {
          PocketMailSound.playNotificationSound('morning-dew', Math.min(0.55, currentSettings.soundVolume || 0.5));
        }
        return res;
      })();

    case 'OPEN_GOOGLE_LOGIN':
      return openGoogleAccountLoginFlow();

    case 'CONNECT_OAUTH_ACCOUNT':
      return (async () => {
        const clientId = msg.clientId || currentSettings.oauthClientId;
        const oauthAcc = await PocketMailGmailClient.launchLocalGoogleOAuth(clientId);
        const existingIdx = (currentSettings.oauthAccounts || []).findIndex((a) => a.email === oauthAcc.email);
        if (existingIdx >= 0) {
          currentSettings.oauthAccounts[existingIdx] = oauthAcc;
        } else {
          currentSettings.oauthAccounts = [...(currentSettings.oauthAccounts || []), oauthAcc];
        }
        if (msg.clientId) currentSettings.oauthClientId = msg.clientId;
        await browser.storage.local.set({ settings: currentSettings });
        const state = await syncAllAccounts();
        return { ok: true, account: oauthAcc, state, settings: currentSettings };
      })();

    case 'REMOVE_ACCOUNT':
      return (async () => {
        const email = msg.email;
        currentSettings.oauthAccounts = (currentSettings.oauthAccounts || []).filter((a) => a.email !== email);
        if (!currentSettings.accountConfigs[email]) {
          currentSettings.accountConfigs[email] = {};
        }
        currentSettings.accountConfigs[email].disabled = true;
        await browser.storage.local.set({ settings: currentSettings });
        const state = await syncAllAccounts();
        return { ok: true, state, settings: currentSettings };
      })();

    case 'UPDATE_SETTINGS':
      return (async () => {
        currentSettings = { ...currentSettings, ...(msg.settings || {}) };
        await browser.storage.local.set({ settings: currentSettings });
        restartPollingTimer();
        const state = await syncAllAccounts();
        return { ok: true, settings: currentSettings, state };
      })();

    case 'PLAY_SOUND_PREVIEW':
      PocketMailSound.playNotificationSound(
        msg.soundId || currentSettings.soundId,
        msg.volume !== undefined ? msg.volume : currentSettings.soundVolume,
        msg.customAudioData || currentSettings.customAudioData
      );
      return Promise.resolve({ ok: true });

    case 'RESTORE_READ_EMAILS':
      return (async () => {
        localOverlay.readIds = {};
        await saveOverlay();
        const state = await syncAllAccounts();
        return { ok: true, state, snoozed: localOverlay.snoozed };
      })();

    case 'CLEAR_LOCAL_CACHE':
      return (async () => {
        localOverlay = { overlayVersion: 2, readIds: {}, trashedIds: {}, archivedIds: {}, starredIds: {}, snoozed: {} };
        await saveOverlay();
        const state = await syncAllAccounts();
        return { ok: true, state };
      })();

    case 'CHECK_SIDEBAR_CONTEXT': {
      // Content scripts inside Firefox's Left Sidebar have !sender.tab
      // Content scripts inside PocketMail Companion Side Windows have companionWindowIds.has(sender.tab.windowId)
      const isFirefoxSidebar = !sender || !sender.tab;
      const isCompanionWindow = Boolean(sender && sender.tab && companionWindowIds.has(sender.tab.windowId));
      return Promise.resolve({
        isSidebar: Boolean(isFirefoxSidebar || isCompanionWindow || msg.hasSidebarHint),
        isFirefoxSidebar,
        isCompanionWindow,
        totalUnread: cachedState.totalUnread || 0,
        settings: currentSettings
      });
    }

    case 'SIDEBAR_NAVIGATE_APP':
      return (async () => {
        const targetUrl = msg.url || 'https://www.instagram.com/direct/inbox/#pm-sidebar';
        if (sender && sender.tab && companionWindowIds.has(sender.tab.windowId)) {
          await browser.tabs.update(sender.tab.id, { url: targetUrl });
          return { ok: true };
        }
        if (browser.sidebarAction && browser.sidebarAction.setPanel) {
          await browser.sidebarAction.setPanel({ panel: targetUrl });
          return { ok: true };
        }
        return { ok: false };
      })();

    case 'SIDEBAR_NAVIGATE_POCKETMAIL':
      return (async () => {
        if (sender && sender.tab && companionWindowIds.has(sender.tab.windowId)) {
          const popUrl = browser.runtime.getURL('src/popup/popup.html?popout=1');
          await browser.tabs.update(sender.tab.id, { url: popUrl });
          return { ok: true };
        }
        if (browser.sidebarAction && browser.sidebarAction.setPanel) {
          const sidebarUrl = browser.runtime.getURL('src/popup/popup.html?sidebar=1');
          await browser.sidebarAction.setPanel({ panel: sidebarUrl });
          return { ok: true };
        }
        return { ok: false };
      })();

    case 'OPEN_COMPANION_WINDOW':
      return (async () => {
        const url = msg.url || browser.runtime.getURL('src/popup/popup.html?popout=1');
        const win = await browser.windows.create({
          url,
          type: 'popup',
          width: msg.width || 480,
          height: msg.height || 820
        });
        if (win && win.id) {
          companionWindowIds.add(win.id);
        }
        return { ok: true, windowId: win?.id };
      })();

    case 'UPDATE_PERSISTENT_SESSION': {
      if (msg.activeAppId && isAppAllowedForPersistence(msg.activeAppId)) {
        currentSettings.persistentLastActiveAppId = msg.activeAppId;
      } else if (msg.activeAppId === 'pocketmail' && msg.explicitMailClick && bgAudioPool.size === 0) {
        currentSettings.persistentLastActiveAppId = 'pocketmail';
      }
      if (msg.appId && msg.url && !msg.url.includes('pm_boot=1')) {
        if (!currentSettings.persistentSavedAppUrls) {
          currentSettings.persistentSavedAppUrls = {};
        }
        if (isAppAllowedForPersistence(msg.appId)) {
          currentSettings.persistentSavedAppUrls[msg.appId] = msg.url;
        }
      }
      if (msg.appId && msg.playback) {
        const prev = liveMediaPlaybackState.get(msg.appId);
        const inTakeoverGrace =
          prev && prev.handedOffAt && Date.now() - prev.handedOffAt < 15000 && prev.isPlaying;
        liveMediaPlaybackState.set(msg.appId, {
          ...msg.playback,
          isPlaying: Boolean(msg.playback.isPlaying || inTakeoverGrace),
          handedOffAt: inTakeoverGrace ? prev.handedOffAt : undefined,
          updatedAt: Date.now()
        });
        if (msg.playback.resumeUrl && isAppAllowedForPersistence(msg.appId)) {
          if (!currentSettings.persistentSavedAppUrls) {
            currentSettings.persistentSavedAppUrls = {};
          }
          currentSettings.persistentSavedAppUrls[msg.appId] = msg.playback.resumeUrl;
        }
      }
      browser.storage.local.set({ settings: currentSettings }).catch(() => {});
      return Promise.resolve({ ok: true });
    }

    case 'SIDEBAR_CLOSED_HANDOFF': {
      const mode = currentSettings.persistenceMode || 'eco';
      if (mode === 'eco') {
        stopBackgroundAudioFrames();
        return Promise.resolve({ ok: true });
      }

      if (msg.activeAppId && isAppAllowedForPersistence(msg.activeAppId)) {
        currentSettings.persistentLastActiveAppId = msg.activeAppId;
      } else if (Array.isArray(msg.playingApps) && msg.playingApps.length > 0 && msg.playingApps[0].appId) {
        currentSettings.persistentLastActiveAppId = msg.playingApps[0].appId;
      }
      if (msg.savedUrls && typeof msg.savedUrls === 'object') {
        if (!currentSettings.persistentSavedAppUrls) currentSettings.persistentSavedAppUrls = {};
        Object.entries(msg.savedUrls).forEach(([id, u]) => {
          if (u && isAppAllowedForPersistence(id)) {
            currentSettings.persistentSavedAppUrls[id] = u;
          }
        });
      }
      browser.storage.local.set({ settings: currentSettings }).catch(() => {});

      // If any persistent app was actively playing audio/music when the sidebar closed, hand off to Background Audio Keep-Alive!
      if (currentSettings.keepAudioPlayingWhenClosed !== false) {
        const candidates = Array.isArray(msg.playingApps) ? msg.playingApps : [];
        if (candidates.length > 0) {
          candidates.forEach((c) => {
            if (c && c.appId && c.url) {
              startBackgroundAudioKeepAlive(c.appId, c.url, c.title || '');
            }
          });
        } else {
          liveMediaPlaybackState.forEach((st, id) => {
            if (st.isPlaying && Date.now() - st.updatedAt < 60000) {
              const targetUrl = st.resumeUrl || currentSettings.persistentSavedAppUrls?.[id];
              if (targetUrl) {
                startBackgroundAudioKeepAlive(id, targetUrl, st.title || '');
              }
            }
          });
        }
      }
      return Promise.resolve({ ok: true });
    }

    case 'STOP_BG_AUDIO_HANDOFF': {
      const activeBgApps = [];
      bgAudioPool.forEach((val, id) => {
        activeBgApps.push({ appId: id, url: val.url, title: val.title });
        liveMediaPlaybackState.set(id, {
          isPlaying: true,
          currentTime: 0,
          resumeUrl: val.url,
          title: val.title || '',
          handedOffAt: Date.now(),
          updatedAt: Date.now()
        });
      });
      // Do NOT kill bgAudioPool here! Keep background audio playing with 0ms interruption while the user checks Mail or another app (e.g. Instagram).
      // Only stop a specific background audio app via STOP_SINGLE_BG_AUDIO_APP when the user opens or takes over that specific media app in the sidebar.
      return Promise.resolve({
        ok: true,
        activeBgApps,
        settings: currentSettings
      });
    }

    case 'STOP_SINGLE_BG_AUDIO_APP': {
      if (msg.appId) {
        stopSingleBackgroundAudioFrame(msg.appId);
        if (msg.clearPlaybackState) {
          liveMediaPlaybackState.delete(msg.appId);
        }
      }
      return Promise.resolve({ ok: true });
    }

    case 'STOP_ALL_BG_AUDIO_APPS': {
      stopBackgroundAudioFrames();
      liveMediaPlaybackState.clear();
      return Promise.resolve({ ok: true });
    }

    case 'GET_BG_AUDIO_STATUS': {
      const activeBgApps = [];
      bgAudioPool.forEach((val, id) => {
        activeBgApps.push({ appId: id, url: val.url, title: val.title });
      });
      return Promise.resolve({ ok: true, activeBgApps });
    }

    default:
      return Promise.resolve({ ok: false });
  }
});

// Initialize on extension startup
(async function init() {
  await loadStorage();
  prewarmSocialCookieCache();
  updateToolbarBadge();
  await syncAllAccounts();
  restartPollingTimer();
})();
