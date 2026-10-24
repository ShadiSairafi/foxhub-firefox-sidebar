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
