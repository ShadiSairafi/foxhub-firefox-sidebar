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
  persistenceMode: 'selected',  // 'eco' (reset & free RAM) | 'selected' (custom picked apps) | 'all' (all apps persistent)
  persistentAppIds: [],         // All apps OFF by default! User can toggle individual apps ON anytime
  persistentMemoryHintCount: 0, // Shows a gentle 1-or-2-time-ever notice when all persistent apps are OFF
  persistentLastActiveAppId: 'pocketmail',
  persistentSavedAppUrls: {},   // { spotify: 'https://...', youtube: 'https://...', ... }
  keepAudioPlayingWhenClosed: true,
  bgAudioAppIds: ['spotify', 'youtube'], // Only Spotify & YouTube play audio when closed by default (Twitter/X, TikTok, etc. off by default!)
  bgAudioAppIdsMigratedV1: true,
  persistenceDefaultSelectedMigratedV1: true,
  persistenceYoutubeAddedMigratedV2: true,
  persistenceAllSocialMigratedV3: true,
  persistenceDefaultOffMigratedV4: true,
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

// Local overlay so actions (read/trash/archive/star/snooze/sent) feel instantaneous (<10ms)
let localOverlay = {
  overlayVersion: 2,
  readIds: {},     // id -> timestamp
  trashedIds: {},  // id -> timestamp
  archivedIds: {}, // id -> timestamp
  starredIds: {},  // id -> boolean
  snoozed: {},     // id -> { wakeAt, message }
  seenIds: {},     // id -> timestamp (prevents old unread emails shifting into the 20-item Atom feed from being announced aloud)
  sentMessages: [] // [{ id, accountEmail, accountSlot, senderName, senderEmail, recipientEmail, subject, snippet, fullText, timestamp, isSent }]
};

async function loadStorage() {
  const data = await browser.storage.local.get(['settings', 'localOverlay', 'cachedState']);
  if (data.settings) {
    currentSettings = { ...DEFAULT_SETTINGS, ...data.settings };
    let needsSave = false;
    if (!data.settings.topBarAutoHideMigratedV1) {
      currentSettings.autoHideMediaTopBar = true;
      currentSettings.topBarAutoHideMigratedV1 = true;
      needsSave = true;
    }
    if (!data.settings.persistenceDefaultOffMigratedV4) {
      currentSettings.persistenceMode = 'selected';
      currentSettings.persistentAppIds = [];
      currentSettings.persistenceDefaultSelectedMigratedV1 = true;
      currentSettings.persistenceYoutubeAddedMigratedV2 = true;
      currentSettings.persistenceAllSocialMigratedV3 = true;
      currentSettings.persistenceDefaultOffMigratedV4 = true;
      needsSave = true;
    }
    if (!data.settings.bgAudioAppIdsMigratedV1) {
      currentSettings.bgAudioAppIds = ['spotify', 'youtube'];
      currentSettings.bgAudioAppIdsMigratedV1 = true;
      needsSave = true;
    }
    if (needsSave) {
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
      snoozed: data.localOverlay.snoozed || {},
      seenIds: data.localOverlay.seenIds || {},
      sentMessages: Array.isArray(data.localOverlay.sentMessages) ? data.localOverlay.sentMessages : []
    };
    Object.keys(localOverlay.seenIds || {}).forEach((id) => knownUnreadIds.add(id));
    if (!isUpgraded) {
      await browser.storage.local.set({ localOverlay });
    }
  }
  if (data.cachedState) {
    cachedState = data.cachedState;
    cachedState.accounts.forEach((acc) => {
      (acc.messages || []).forEach((m) => {
        knownUnreadIds.add(m.id);
        if (localOverlay.seenIds) localOverlay.seenIds[m.id] = Date.now();
      });
    });
  }
}

async function saveOverlay() {
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  for (const mapName of ['readIds', 'trashedIds', 'archivedIds', 'seenIds']) {
    if (!localOverlay[mapName]) localOverlay[mapName] = {};
    for (const [id, ts] of Object.entries(localOverlay[mapName])) {
      if (ts < cutoff) delete localOverlay[mapName][id];
    }
  }
  if (Array.isArray(localOverlay.sentMessages) && localOverlay.sentMessages.length > 100) {
    localOverlay.sentMessages = localOverlay.sentMessages.slice(0, 100);
  }
  localOverlay.overlayVersion = 2;
  await browser.storage.local.set({ localOverlay });
}

async function recordSentEmailInOverlay(payload = {}) {
  const to = (payload.to || '').trim();
  if (!to) return null;
  const slotIndex = Number(payload.slotIndex) || 0;
  const matchedAcc =
    (cachedState.accounts || []).find(
      (a) =>
        (payload.accountEmail && a.email === payload.accountEmail) ||
        (!payload.accountEmail && Number(a.slotIndex) === slotIndex)
    ) || cachedState.accounts?.[0] || null;
  const email = payload.accountEmail || matchedAcc?.email || `account_${slotIndex}@gmail.com`;
  const cfg = (currentSettings.accountConfigs && currentSettings.accountConfigs[email]) || {};
  const color = cfg.color || matchedAcc?.color || '#D95032';
  const nickname = cfg.nickname || matchedAcc?.nickname || '';
  const now = Date.now();

  const sentEntry = {
    id: `sent:${email}:${now}:${Math.random().toString(36).slice(2, 7)}`,
    threadId: payload.threadId || `sent_${now}`,
    accountEmail: email,
    accountSlot: slotIndex,
    accountType: matchedAcc?.accountType || 'session',
    accountColor: color,
    accountNickname: nickname,
    senderName: `To: ${to}`,
    senderEmail: to,
    recipientEmail: to,
    cc: (payload.cc || '').trim(),
    bcc: (payload.bcc || '').trim(),
    subject: (payload.subject || '').trim() || '(No subject)',
    snippet: (payload.body || '').replace(/\s+/g, ' ').trim().slice(0, 220),
    fullText: payload.body || '',
    timestamp: now,
    isoDate: new Date(now).toISOString(),
    webUrl: `https://mail.google.com/mail/u/${slotIndex}/#sent`,
    unread: false,
    isSent: true
  };

  if (!Array.isArray(localOverlay.sentMessages)) {
    localOverlay.sentMessages = [];
  }
  localOverlay.sentMessages.unshift(sentEntry);
  if (localOverlay.sentMessages.length > 100) {
    localOverlay.sentMessages.length = 100;
  }
  if (!Array.isArray(cachedState.sentMessages)) {
    cachedState.sentMessages = [];
  }
  cachedState.sentMessages = [
    sentEntry,
    ...cachedState.sentMessages.filter((m) => m && m.id !== sentEntry.id)
  ].slice(0, 100);
  await saveOverlay();
  await browser.storage.local.set({ cachedState });
  browser.runtime
    .sendMessage({
      type: 'STATE_UPDATED',
      state: cachedState,
      settings: currentSettings
    })
    .catch(() => {});
  return sentEntry;
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
 * Update Firefox top-right toolbar badge text, color, and rich hover tooltip (strictly for Mail!)
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

  // Build informative Mail tooltip
  const lines = [`FoxHub Mail: ${cachedState.totalUnread} unread`];
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

    // Detect newly arrived unread messages that are ACTUALLY visible in FoxHub (never speak spam or older unread emails shifting into the 20-item Atom window!)
    const newArrivals = [];
    const nowTs = Date.now();
    let seenIdsChanged = false;
    if (!localOverlay.seenIds) localOverlay.seenIds = {};

    accounts.forEach((acc) => {
      if (acc.disabled) return;
      (acc.messages || []).forEach((msg) => {
        const alreadySeen = knownUnreadIds.has(msg.id) || Boolean(localOverlay.seenIds[msg.id]);
        if (!alreadySeen) {
          knownUnreadIds.add(msg.id);
          localOverlay.seenIds[msg.id] = nowTs;
          seenIdsChanged = true;

          const ageMs = msg.timestamp ? Math.max(0, nowTs - msg.timestamp) : 0;
          const isRecentArrival = ageMs < 4 * 60 * 1000; // Must have arrived within the last 4 minutes
          const isSpamLike = /\b(viagra|casino|lottery|unclaimed reward|crypto giveaway)\b/i.test(
            `${msg.subject || ''} ${msg.snippet || ''}`
          );
          if (!isFirstSync && msg.unread !== false && !msg.isDemo && isRecentArrival && !isSpamLike) {
            newArrivals.push(msg);
          }
        }
      });
    });

    isFirstSync = false;
    if (seenIdsChanged) {
      saveOverlay().catch(() => {});
    }

    cachedState = {
      accounts,
      totalUnread,
      sentMessages: Array.isArray(localOverlay.sentMessages) ? localOverlay.sentMessages : [],
      lastSyncAt: nowTs,
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
    // Exclude TikTok video streaming & telemetry subdomains (v16-webapp-prime.tiktok.com, v19-webapp-prime.tiktok.com, pull-*.tiktok.com, mcs/mon/log) so video segments stream with zero IPC delay
    if (h.endsWith('.tiktok.com') && /^(v\d+|pull-|video|mcs\.|mon\.|log\.|sf\d+|lf\d+|p\d+)/i.test(h)) {
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

  // Block Service Worker registration scripts on YouTube, WhatsApp Web & X inside PocketHub where SW caches X-Frame-Options: DENY
  if (browser.webRequest.onBeforeRequest) {
    browser.webRequest.onBeforeRequest.addListener(
      (details) => {
        if (!isFromPocketMail(details)) return {};
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

  async function getCachedCookiesForOrigin(urlStr, originKey, forceRefresh = false) {
    if (!forceRefresh) {
      const syncHit = getSyncCachedCookies(originKey);
      if (syncHit) return syncHit;
    }
    const now = Date.now();
    const storeCookies = await browser.cookies.getAll({ url: urlStr });
    if (cookieLookupCache.size > 80) cookieLookupCache.clear();
    const rawList = storeCookies || [];
    const list = [];
    for (const c of rawList) {
      if (!c || !c.name || c.value === 'EXPIRED') continue;
      list.push(c);
    }
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
    'https://www.facebook.com/',
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
      for (const key of Array.from(cookieLookupCache.keys())) {
        if (key.includes(domain) && key.startsWith('http')) {
          // Stale-while-revalidate: refresh in place without deleting first so XHRs never drop to async SQLite waits!
          getCachedCookiesForOrigin(`${key}/`, key, true).catch(() => {});
        }
      }
    });
  }

  // Live document.cookie & Set-Cookie map from embedded social iframes (e.g. TikTok s_v_web_id, msToken, ttwid, Gmail OSID/COMPASS, Discord __dcfduid)
  const liveFrameCookiesByOrigin = new Map();

  function updateLiveOriginCookie(rootOrigin, name, value) {
    if (!rootOrigin || !name) return;
    let map = liveFrameCookiesByOrigin.get(rootOrigin);
    if (!map) {
      map = new Map();
      liveFrameCookiesByOrigin.set(rootOrigin, map);
    }
    if (!value || value === 'EXPIRED' || value === 'deleted') {
      map.set(name, 'EXPIRED');
      return;
    }
    map.set(name, value);
    // Also update in-memory sync cache in place so 0ms fast path always has the latest token
    const cached = cookieLookupCache.get(rootOrigin);
    if (cached && Array.isArray(cached.cookies)) {
      const idx = cached.cookies.findIndex((c) => c && c.name === name);
      if (idx >= 0) {
        cached.cookies[idx] = { ...cached.cookies[idx], value };
      } else {
        cached.cookies.push({ name, value });
      }
    }
  }

  if (browser.runtime && browser.runtime.onMessage) {
    browser.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== 'PM_SYNC_LIVE_FRAME_COOKIES' || !msg.origin || !msg.cookieStr) return undefined;
      try {
        const rootOrigin = getRootOriginForHost(new URL(msg.origin).hostname) || msg.origin;
        msg.cookieStr.split(';').forEach((pair) => {
          const eq = pair.indexOf('=');
          if (eq > 0) {
            const k = pair.slice(0, eq).trim();
            const v = pair.slice(eq + 1).trim();
            if (k && v && v !== 'EXPIRED') {
              updateLiveOriginCookie(rootOrigin, k, v);
              // Persist TikTok anti-bot / CAPTCHA verification cookies into top-level cookie jar with SameSite=None; Secure
              if (
                rootOrigin.includes('tiktok.com') &&
                /^(s_v_web_id|msToken|ttwid|tt_csrf_token|tt_chain_token|odin_tt|PerfFp)$/i.test(k) &&
                browser.cookies &&
                browser.cookies.set
              ) {
                browser.cookies
                  .set({
                    url: 'https://www.tiktok.com/',
                    domain: '.tiktok.com',
                    path: '/',
                    name: k,
                    value: v,
                    secure: true,
                    sameSite: 'no_restriction'
                  })
                  .catch(() => {});
              }
            }
          }
        });
      } catch (_) {}
      return undefined;
    });
  }

  function mergeCookiesIntoHeaders(headers, storeCookies, liveFrameCookies = null, parsedUrl = null) {
    const cookieIdx = headers.findIndex((h) => (h.name || '').toLowerCase() === 'cookie');
    const hasHeaderCookie = Boolean(cookieIdx >= 0 && headers[cookieIdx].value);
    const hasLiveCookies = Boolean(liveFrameCookies && liveFrameCookies.size > 0);
    if ((!storeCookies || storeCookies.length === 0) && !hasHeaderCookie && !hasLiveCookies) return;

    const isGoogleMailOrAuth = Boolean(
      parsedUrl && (parsedUrl.hostname === 'mail.google.com' || parsedUrl.hostname === 'accounts.google.com')
    );

    const map = new Map();
    if (hasHeaderCookie) {
      headers[cookieIdx].value.split(';').forEach((pair) => {
        const eq = pair.indexOf('=');
        if (eq > 0) {
          const k = pair.slice(0, eq).trim();
          const v = pair.slice(eq + 1).trim();
          if (k && v && v !== 'EXPIRED' && v !== 'deleted') {
            map.set(k, v);
          }
        }
      });
    }
    if (storeCookies && storeCookies.length > 0) {
      // Sort longest path first per RFC 6265 so /mail/u/0 cookies take precedence over /mail or / cookies
      const orderedStore = isGoogleMailOrAuth
        ? [...storeCookies].sort((a, b) => (b?.path || '').length - (a?.path || '').length)
        : storeCookies;
      const isAtomFeedReq = Boolean(isGoogleMailOrAuth && (parsedUrl.pathname || '').includes('/feed/atom'));
      orderedStore.forEach((c) => {
        if (!c || !c.name || !c.value || c.value === 'EXPIRED' || c.value === 'deleted') return;
        // Never inject stale unpartitioned COMPASS routing cookies from /feed/atom or old tabs into Gmail Web UI (?view=cm)
        // — let Gmail's own Set-Cookie / live iframe cookie header manage COMPASS so it never triggers "Gmail Temporary Error"!
        if (isGoogleMailOrAuth && !isAtomFeedReq && c.name === 'COMPASS') return;
        if (!map.has(c.name)) {
          map.set(c.name, c.value);
        }
      });
    }
    // Live cookies from the iframe's own document.cookie / Set-Cookie (e.g. fresh OSID/COMPASS/S from 302 redirects, Discord __dcfduid, TikTok s_v_web_id/msToken) ALWAYS take priority
    if (hasLiveCookies) {
      liveFrameCookies.forEach((v, k) => {
        if (!k) return;
        if (v === 'EXPIRED' || v === 'deleted') {
          map.delete(k);
        } else if (v) {
          map.set(k, v);
        }
      });
    }
    // Ensure TikTok's verifyFp query param is always matched by s_v_web_id in the Cookie header
    if (parsedUrl && parsedUrl.hostname.endsWith('tiktok.com')) {
      const verifyFp = parsedUrl.searchParams.get('verifyFp');
      if (verifyFp && verifyFp.startsWith('verify_') && !map.has('s_v_web_id')) {
        map.set('s_v_web_id', verifyFp);
      }
    }
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
    if (h.endsWith('.x.com') || h === 'x.com' || h.endsWith('.twitter.com') || h === 'twitter.com') return 'https://x.com';
    if (h.endsWith('.tiktok.com') || h === 'tiktok.com') return 'https://www.tiktok.com';
    if (h.endsWith('.instagram.com') || h === 'instagram.com') return 'https://www.instagram.com';
    if (h.endsWith('.reddit.com') || h === 'reddit.com') return 'https://www.reddit.com';
    if (h.endsWith('.youtube.com') || h === 'youtube.com') return 'https://www.youtube.com';
    if (h.endsWith('.messenger.com') || h === 'messenger.com') return 'https://www.messenger.com';
    if (h.endsWith('.facebook.com') || h === 'facebook.com') return 'https://www.facebook.com';
    if (h.endsWith('.discord.com') || h === 'discord.com' || h.endsWith('.discordapp.com')) return 'https://discord.com';
    if (h.endsWith('.whatsapp.com') || h === 'whatsapp.com' || h.endsWith('.whatsapp.net')) return 'https://web.whatsapp.com';
    if (h.endsWith('.telegram.org') || h === 'telegram.org') return 'https://web.telegram.org';
    return '';
  }

  function getBaseSiteKey(hostname) {
    const h = (hostname || '').toLowerCase();
    if (!h) return '';
    if (h.endsWith('.google.com') || h === 'google.com' || h.endsWith('.gstatic.com') || h.endsWith('.googleapis.com')) return 'google';
    if (h.endsWith('.youtube.com') || h === 'youtube.com') return 'youtube';
    if (h.endsWith('.tiktok.com') || h === 'tiktok.com') return 'tiktok';
    if (h.endsWith('.spotify.com') || h === 'spotify.com') return 'spotify';
    if (h.endsWith('.discord.com') || h === 'discord.com' || h.endsWith('.discordapp.com')) return 'discord';
    if (h.endsWith('.whatsapp.com') || h === 'whatsapp.com' || h.endsWith('.whatsapp.net')) return 'whatsapp';
    if (h.endsWith('.messenger.com') || h === 'messenger.com') return 'messenger';
    if (h.endsWith('.facebook.com') || h === 'facebook.com') return 'facebook';
    if (h.endsWith('.instagram.com') || h === 'instagram.com') return 'instagram';
    if (h.endsWith('.x.com') || h === 'x.com' || h.endsWith('.twitter.com') || h === 'twitter.com') return 'x';
    if (h.endsWith('.reddit.com') || h === 'reddit.com') return 'reddit';
    if (h.endsWith('.telegram.org') || h === 'telegram.org') return 'telegram';
    const parts = h.split('.');
    return parts.length >= 2 ? parts.slice(-2).join('.') : h;
  }

  if (browser.webRequest.onBeforeSendHeaders) {
    const handleBeforeSendHeaders = (details) => {
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

      // Never modify headers or inject cookies on static CDN assets or CAPTCHA verification frames (0ms fast return!)
      if (isStaticCdnHost(parsedUrl.hostname, details.url)) {
        return {};
      }

      const targetOrigin = parsedUrl.origin;
      const targetSiteKey = getBaseSiteKey(parsedUrl.hostname);
      const rootOrigin = getRootOriginForHost(parsedUrl.hostname);
      const liveFrameCookies = liveFrameCookiesByOrigin.get(rootOrigin || targetOrigin) || null;
      const headers = [...details.requestHeaders];
      const isSwInterceptedAppFrame =
        details.type === 'sub_frame' &&
        details.frameId === -1 &&
        details.parentFrameId === -1 &&
        isEmbeddedSocialHost(details.url);
      // True ONLY for the top-level embedded media app frame inside PocketHub (never for nested iframes like hCaptcha inside Discord)
      const isTopEmbeddedAppFrame =
        details.type === 'sub_frame' &&
        (isDirectExtRequest ||
          isSwInterceptedAppFrame ||
          (Array.isArray(details.frameAncestors) &&
            details.frameAncestors.length === 1 &&
            details.frameAncestors[0].url &&
            details.frameAncestors[0].url.startsWith(extOrigin))) &&
        (details.parentFrameId === 0 || details.parentFrameId === -1);

      let initiatorOrigin = '';
      let initiatorSiteKey = '';
      try {
        const initUrlStr = details.documentUrl || details.originUrl || '';
        if (initUrlStr.startsWith('http')) {
          const initU = new URL(initUrlStr);
          initiatorOrigin = initU.origin;
          initiatorSiteKey = getBaseSiteKey(initU.hostname);
        }
      } catch (_) {}

      const isRedditChat = parsedUrl.hostname === 'chat.reddit.com';
      let httpRefererOrigin = '';
      let httpRefererSiteKey = '';
      for (const h of headers) {
        const lower = (h.name || '').toLowerCase();
        if (lower === 'referer' && h.value && h.value.startsWith('http')) {
          try {
            const refU = new URL(h.value);
            httpRefererOrigin = refU.origin;
            httpRefererSiteKey = getBaseSiteKey(refU.hostname);
          } catch (_) {}
        }
      }

      let hasReferer = false;
      for (const h of headers) {
        const lower = (h.name || '').toLowerCase();
        if (isTopEmbeddedAppFrame) {
          // Spoof Sec-Fetch-* on the top-level embedded app navigation itself
          if (lower === 'sec-fetch-dest') {
            h.value = 'document';
          } else if (lower === 'sec-fetch-mode') {
            h.value = 'navigate';
          } else if (lower === 'sec-fetch-site') {
            if (isRedditChat) {
              h.value = 'same-site';
            } else if (httpRefererOrigin) {
              h.value =
                httpRefererOrigin === targetOrigin
                  ? 'same-origin'
                  : httpRefererSiteKey && httpRefererSiteKey === targetSiteKey
                  ? 'same-site'
                  : 'cross-site';
            } else {
              h.value = 'none';
            }
          }
        } else if (lower === 'sec-fetch-site' && h.value === 'cross-site' && initiatorOrigin) {
          // Inside a moz-extension:// ancestor frame, Firefox marks ALL same-origin / same-site XHRs
          // (Discord /api/v9, Messenger /api/graphql, WhatsApp, X, Gmail, TikTok) as Sec-Fetch-Site: cross-site!
          // Restore the natural W3C Fetch Metadata value that Firefox sends in a top-level tab.
          if (initiatorOrigin === targetOrigin) {
            h.value = 'same-origin';
          } else if (initiatorSiteKey && initiatorSiteKey === targetSiteKey) {
            h.value = 'same-site';
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
      }

      const isGoogleMailOrAuth =
        parsedUrl.hostname === 'mail.google.com' || parsedUrl.hostname === 'accounts.google.com';

      // Fast Path: If cookies are already in our 5m RAM cache (and not path-sensitive mail.google.com), merge 100% SYNCHRONOUSLY in 0ms!
      if (!isGoogleMailOrAuth) {
        const syncCookies = getSyncCachedCookies(targetOrigin);
        const syncRootCookies = rootOrigin && rootOrigin !== targetOrigin ? getSyncCachedCookies(rootOrigin) : null;
        if (syncCookies && (!rootOrigin || rootOrigin === targetOrigin || syncRootCookies)) {
          const combined = syncRootCookies ? [...syncCookies, ...syncRootCookies] : syncCookies;
          mergeCookiesIntoHeaders(headers, combined, liveFrameCookies, parsedUrl);
          return { requestHeaders: headers };
        }
      }

      return (async () => {
        if (browser.cookies && browser.cookies.getAll && details.url.startsWith('http')) {
          try {
            if (isGoogleMailOrAuth) {
              const exactPathCookies = await browser.cookies.getAll({ url: details.url });
              mergeCookiesIntoHeaders(headers, exactPathCookies || [], liveFrameCookies, parsedUrl);
            } else {
              let storeCookies = await getCachedCookiesForOrigin(details.url, targetOrigin);
              if (rootOrigin && rootOrigin !== targetOrigin) {
                const rootCookies = await getCachedCookiesForOrigin(`${rootOrigin}/`, rootOrigin);
                storeCookies = [...(storeCookies || []), ...(rootCookies || [])];
              }
              mergeCookiesIntoHeaders(headers, storeCookies, liveFrameCookies, parsedUrl);
            }
          } catch (_) {}
        }

        return { requestHeaders: headers };
      })();
    };

    browser.webRequest.onBeforeSendHeaders.addListener(
      handleBeforeSendHeaders,
      {
        urls: ['<all_urls>'],
        types: ['sub_frame', 'xmlhttprequest']
      },
      ['blocking', 'requestHeaders']
    );
  }

  const EMBEDDED_SOCIAL_HOST_SUFFIXES = [
    'google.com',
    'x.com',
    'twitter.com',
    'whatsapp.com',
    'whatsapp.net',
    'youtube.com',
    'tiktok.com',
    'instagram.com',
    'spotify.com',
    'discord.com',
    'discordapp.com',
    'reddit.com',
    'messenger.com',
    'facebook.com',
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

  const rewriteSetCookieForIframe = (rawCookieVal, cookieOriginKey = '') => {
    if (!rawCookieVal) return rawCookieVal;
    const lines = String(rawCookieVal).split('\n');
    const outLines = lines.map((line) => {
      if (cookieOriginKey) {
        const semi = line.indexOf(';');
        const firstPart = semi >= 0 ? line.slice(0, semi) : line;
        const eq = firstPart.indexOf('=');
        if (eq > 0) {
          const cName = firstPart.slice(0, eq).trim();
          const cVal = firstPart.slice(eq + 1).trim();
          const isExpiredDirective =
            !cVal ||
            cVal === 'EXPIRED' ||
            cVal === 'deleted' ||
            /;\s*Max-Age\s*=\s*-?0\b/i.test(line) ||
            /;\s*Expires\s*=[^;]*1970/i.test(line);
          if (cName) {
            updateLiveOriginCookie(cookieOriginKey, cName, isExpiredDirective ? 'EXPIRED' : cVal);
          }
        }
      }
      let updated = line.replace(/;\s*SameSite\s*=\s*(Lax|Strict)/gi, '; SameSite=None');
      if (!/;\s*SameSite\s*=/i.test(updated)) {
        updated += '; SameSite=None';
      }
      if (!/;\s*Secure\b/i.test(updated)) {
        updated += '; Secure';
      }
      return updated;
    });
    return outLines.join('\n');
  };

  if (browser.webRequest.onHeadersReceived) {
    browser.webRequest.onHeadersReceived.addListener(
      (details) => {
        const isBootRequest = Boolean(details.url && details.url.includes('pm_boot=1'));
        const isSocialHost = isEmbeddedSocialHost(details.url);
        const fromPocketMail = isFromPocketMail(details);
        if ((!fromPocketMail && !isBootRequest && !isSocialHost) || !Array.isArray(details.responseHeaders)) {
          return {};
        }

        let respOriginKey = '';
        let parsedRespUrl = null;
        try {
          parsedRespUrl = new URL(details.url);
          if (!isBootRequest && isStaticCdnHost(parsedRespUrl.hostname, details.url)) {
            return {};
          }
          respOriginKey = getRootOriginForHost(parsedRespUrl.hostname) || parsedRespUrl.origin;
        } catch (_) {}

        // Neutralize Gmail's inline iframe frame-buster (Qh=window!=top||window.frameElement?Ph:null and We=function(a){var b=top.location;...})
        // on sub_frame HTML responses from mail.google.com so the embedded Gmail composer never throws SecurityError at line 109!
        if (
          fromPocketMail &&
          details.type === 'sub_frame' &&
          details.statusCode === 200 &&
          parsedRespUrl &&
          parsedRespUrl.hostname === 'mail.google.com' &&
          typeof browser.webRequest.filterResponseData === 'function'
        ) {
          try {
            const filter = browser.webRequest.filterResponseData(details.requestId);
            const decoder = new TextDecoder('utf-8');
            const encoder = new TextEncoder();
            const chunks = [];
            filter.ondata = (event) => {
              chunks.push(new Uint8Array(event.data));
            };
            filter.onstop = () => {
              try {
                let totalLen = 0;
                for (const c of chunks) totalLen += c.byteLength;
                const combined = new Uint8Array(totalLen);
                let offset = 0;
                for (const c of chunks) {
                  combined.set(c, offset);
                  offset += c.byteLength;
                }
                let html = decoder.decode(combined);
                html = html
                  .replace(/window\s*!==?\s*top\s*\|\|\s*window\.frameElement/g, 'false')
                  .replace(/window\s*===\s*top\b/g, 'true')
                  .replace(/var\s+b\s*=\s*top\.location\b/g, 'var b={href:""}')
                  .replace(/top\.location\.href\b/g, 'self.location.href')
                  .replace(/top\[['"]jsleir['"]\]/g, 'self["jsleir"]');
                filter.write(encoder.encode(html));
              } catch (_) {}
              try {
                filter.close();
              } catch (_) {}
            };
            filter.onerror = () => {
              try {
                filter.close();
              } catch (_) {}
            };
          } catch (_) {}
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
          if (fromPocketMail && name === 'set-cookie' && h.value) {
            cleanedHeaders.push({ name: h.name, value: rewriteSetCookieForIframe(h.value, respOriginKey) });
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

  // Filter Gmail's mail-static JS bundles when loaded inside FoxHub's embedded Gmail Compose iframe
  // so `var window=this;` also shadows bare `top` and `parent` (`var window=this,top=this,parent=this;`)
  // and Window `.top`/`.parent` accesses resolve to the Gmail frame itself instead of throwing cross-origin SecurityError!
  if (
    browser.webRequest &&
    browser.webRequest.onBeforeRequest &&
    typeof browser.webRequest.filterResponseData === 'function'
  ) {
    browser.webRequest.onBeforeRequest.addListener(
      (details) => {
        if (!isFromPocketMail(details)) return {};
        try {
          const filter = browser.webRequest.filterResponseData(details.requestId);
          const decoder = new TextDecoder('utf-8');
          const encoder = new TextEncoder();
          const chunks = [];
          filter.ondata = (event) => {
            chunks.push(new Uint8Array(event.data));
          };
          filter.onstop = () => {
            try {
              let totalLen = 0;
              for (const c of chunks) totalLen += c.byteLength;
              const combined = new Uint8Array(totalLen);
              let offset = 0;
              for (const c of chunks) {
                combined.set(c, offset);
                offset += c.byteLength;
              }
              let js = decoder.decode(combined);
              js = js
                .replace(/var window=this;/g, 'var window=this,top=this,parent=this;')
                .replace(/\bwindow\.top\b/g, 'window')
                .replace(/\bwindow\.parent\b/g, 'window')
                .replace(/\bthis\.ha\.top\b/g, 'this.ha')
                .replace(/\bd\.top\.opener\b/g, 'd.opener')
                .replace(/a==null\?void 0:a\.top\b/g, 'a==null?void 0:a')
                .replace(/Yac==null\?void 0:Yac\.top\b/g, 'Yac==null?void 0:Yac');
              filter.write(encoder.encode(js));
            } catch (_) {}
            try {
              filter.close();
            } catch (_) {}
          };
          filter.onerror = () => {
            try {
              filter.close();
            } catch (_) {}
          };
        } catch (_) {}
        return {};
      },
      {
        urls: ['*://mail.google.com/_/scs/mail-static/_/js/*'],
        types: ['script']
      },
      ['blocking']
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
const bgSpEmePlayers = new Map(); // appId -> spInstance (active audible player)
const bgStagingSpPlayers = new Map(); // appId -> spInstance (silent staging player during closed-sidebar handoff)
const bgSpCachedMeta = new Map(); // appId -> { serverCert, licAuth }
let bgSpInstanceCounter = 0;
// Apps whose page audio is mirrored (MSE) into background.html, so background.html is the only audible output
const MIRROR_AUDIO_APP_IDS = new Set(['spotify', 'youtube']);
var sidebarPortCount = 0;
var lastBgAudioIndicatorKey = '';
var cachedSidebarPlayingImageData = null;
var BG_AUDIO_APP_NAMES = {
  spotify: 'Spotify',
  youtube: 'YouTube',
  discord: 'Discord',
  tiktok: 'TikTok',
  twitch: 'Twitch',
  x: 'X (Twitter)',
  instagram: 'Instagram',
  reddit: 'Reddit',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  messenger: 'Messenger'
};

function getAudibleBgAudioAppId() {
  try {
    for (const [appId, sp] of bgSpEmePlayers) {
      const v = sp && !sp.disposed ? sp.videoEl : null;
      if (v && !v.paused && !v.ended && !v.muted && v.volume > 0 && v.readyState >= 2) return appId;
    }
    for (const [appId, p] of bgMsePlayers) {
      const a = p && p.audioEl;
      if (a && !a.paused && !a.ended && !a.muted && a.volume > 0 && a.readyState >= 2) return appId;
    }
  } catch (_) {}
  return null;
}

async function getSidebarPlayingIconImageData() {
  if (cachedSidebarPlayingImageData) return cachedSidebarPlayingImageData;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const drawBadgedSize = (sz) => {
            const c = document.createElement('canvas');
            c.width = sz;
            c.height = sz;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, sz, sz);
            const scale = sz / 32;
            ctx.beginPath();
            ctx.arc(24 * scale, 24 * scale, 8 * scale, 0, Math.PI * 2);
            ctx.fillStyle = '#1DB954';
            ctx.fill();
            ctx.lineWidth = Math.max(1, 1.8 * scale);
            ctx.strokeStyle = '#141110';
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(21.6 * scale, 20.2 * scale);
            ctx.lineTo(21.6 * scale, 27.8 * scale);
            ctx.lineTo(27.8 * scale, 24.0 * scale);
            ctx.closePath();
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            return ctx.getImageData(0, 0, sz, sz);
          };

          cachedSidebarPlayingImageData = {
            16: drawBadgedSize(16),
            32: drawBadgedSize(32)
          };
          resolve(cachedSidebarPlayingImageData);
        } catch (_) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = browser.runtime.getURL('icons/icon-32.png');
    } catch (_) {
      resolve(null);
    }
  });
}

async function updateSidebarActionIndicator(audibleAppId) {
  try {
    if (browser.sidebarAction) {
      if (audibleAppId) {
        const appName = BG_AUDIO_APP_NAMES[audibleAppId] || audibleAppId;
        if (typeof browser.sidebarAction.setTitle === 'function') {
          browser.sidebarAction
            .setTitle({ title: `▶ FoxHub — Playing ${appName}` })
            .catch(() => {});
        }
        if (typeof browser.sidebarAction.setIcon === 'function') {
          const imageData = await getSidebarPlayingIconImageData();
          if (imageData) {
            browser.sidebarAction.setIcon({ imageData }).catch(() => {});
          }
        }
      } else {
        if (typeof browser.sidebarAction.setTitle === 'function') {
          browser.sidebarAction.setTitle({ title: 'FoxHub' }).catch(() => {});
        }
        if (typeof browser.sidebarAction.setIcon === 'function') {
          browser.sidebarAction
            .setIcon({
              path: {
                16: browser.runtime.getURL('icons/icon-16.png'),
                32: browser.runtime.getURL('icons/icon-32.png'),
                48: browser.runtime.getURL('icons/icon-48.png'),
                128: browser.runtime.getURL('icons/icon-128.png')
              }
            })
            .catch(() => {});
        }
      }
    }
  } catch (_) {}
  browser.runtime
    .sendMessage({
      type: 'BG_AUDIO_STATUS_CHANGED',
      audibleAppId: audibleAppId || null,
      sidebarClosed: sidebarPortCount === 0
    })
    .catch(() => {});
}

function refreshBgAudioIndicator() {
  const audibleAppId = getAudibleBgAudioAppId() || '';
  const key = `${audibleAppId}:${sidebarPortCount === 0 ? 'closed' : 'open'}`;
  if (key === lastBgAudioIndicatorKey) return;
  lastBgAudioIndicatorKey = key;
  updateSidebarActionIndicator(audibleAppId || null);
}
setInterval(refreshBgAudioIndicator, 900);


let pendingSettingsSaveTimer = null;
function scheduleSettingsSave(immediate = false) {
  if (immediate) {
    if (pendingSettingsSaveTimer) {
      clearTimeout(pendingSettingsSaveTimer);
      pendingSettingsSaveTimer = null;
    }
    browser.storage.local.set({ settings: currentSettings }).catch(() => {});
    return;
  }
  if (pendingSettingsSaveTimer) return;
  pendingSettingsSaveTimer = setTimeout(() => {
    pendingSettingsSaveTimer = null;
    browser.storage.local.set({ settings: currentSettings }).catch(() => {});
  }, 2500);
}

function toLocalArrayBuffer(buf) {
  if (!buf) return null;
  if (buf instanceof ArrayBuffer) return buf;
  try {
    if (
      buf.buffer instanceof ArrayBuffer &&
      (buf.byteOffset || 0) === 0 &&
      buf.byteLength === buf.buffer.byteLength
    ) {
      return buf.buffer;
    }
    const u8 = new Uint8Array(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength || buf.length || 0);
    const out = new Uint8Array(u8.byteLength);
    out.set(u8);
    return out.buffer;
  } catch (_) {
    return null;
  }
}

function cloneLocalLicAuth(rawUrl, rawHeaders) {
  try {
    const cleanHeaders = {};
    if (rawHeaders && typeof rawHeaders === 'object') {
      for (const k of Object.keys(rawHeaders)) {
        cleanHeaders[String(k)] = String(rawHeaders[k]);
      }
    }
    return { url: String(rawUrl || ''), headers: cleanHeaders };
  } catch (_) {
    return null;
  }
}

function isAppAllowedForPersistence(appId) {
  if (!appId || appId === 'pocketmail') return false;
  const mode = currentSettings.persistenceMode || 'selected';
  if (mode === 'all') return true;
  if (mode === 'selected') {
    const list = Array.isArray(currentSettings.persistentAppIds)
      ? currentSettings.persistentAppIds
      : ['spotify', 'youtube', 'discord'];
    return list.includes(appId);
  }
  return false;
}

function isAppAllowedForBgAudio(appId) {
  if (!appId || appId === 'pocketmail') return false;
  const mode = currentSettings.persistenceMode || 'selected';
  if (mode === 'eco' || currentSettings.keepAudioPlayingWhenClosed === false) return false;
  const allowed = Array.isArray(currentSettings.bgAudioAppIds)
    ? currentSettings.bgAudioAppIds
    : ['spotify', 'youtube'];
  return allowed.includes(appId);
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

function disposeSpPlayerInstance(sp) {
  if (!sp || sp.disposed) return;
  sp.disposed = true;
  if (sp.serverCert || sp.licAuth) {
    const prev = bgSpCachedMeta.get(sp.appId) || {};
    bgSpCachedMeta.set(sp.appId, {
      ...prev,
      serverCert: sp.serverCert || prev.serverCert || null,
      licAuth: sp.licAuth || prev.licAuth || null
    });
  }
  sp.queue = [];
  sp.pendingGenReqs = [];
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

function cleanupSpEmePlayer(appId) {
  const sp = bgSpEmePlayers.get(appId);
  if (sp) {
    bgSpEmePlayers.delete(appId);
    disposeSpPlayerInstance(sp);
  }
  const st = bgStagingSpPlayers.get(appId);
  if (st) {
    bgStagingSpPlayers.delete(appId);
    disposeSpPlayerInstance(st);
  }
}

function removeBgAudioIframeOnly(appId) {
  const entry = bgAudioPool.get(appId);
  if (entry) {
    bgAudioPool.delete(appId);
    try {
      entry.frame.remove();
      entry.frame.src = 'about:blank';
    } catch (_) {}
  }
  const st = bgStagingSpPlayers.get(appId);
  if (st && st.sourceType === 'bg') {
    bgStagingSpPlayers.delete(appId);
    disposeSpPlayerInstance(st);
  }
  if (bgAudioPool.size === 0) {
    updateToolbarBadge();
  }
}

function recordRecentSpGenReq(appId, initDataType, initData) {
  if (!appId || !initData) return;
  const prev = bgSpCachedMeta.get(appId) || {};
  const now = Date.now();
  const list = (prev.recentGenReqs || []).filter((r) => now - r.ts < 4000);
  list.push({ initDataType: initDataType || 'cenc', initData, ts: now });
  bgSpCachedMeta.set(appId, { ...prev, recentGenReqs: list.slice(-4) });
}

function createSpPlayerInstance(appId, mime, msId = 0, isStaging = false, sourceType = 'sidebar') {
  const cached = bgSpCachedMeta.get(appId) || {};
  const now = Date.now();
  const isClear = appId !== 'spotify'; // YouTube MSE audio is unencrypted: no Widevine license needed
  const seededGenReqs = isClear
    ? []
    : (cached.recentGenReqs || [])
        .filter((r) => now - r.ts < 2500)
        .map((r) => ({ initDataType: r.initDataType, initData: r.initData }));
  return {
    id: ++bgSpInstanceCounter,
    appId,
    isClear,
    msId: msId || 0,
    mime: mime || 'audio/mp4; codecs="mp4a.40.2"',
    isStaging: Boolean(isStaging),
    sourceType,
    originSource: sourceType,
    awaitingBgFrameHandoff: false,
    handoffSource: 'bg',
    hasLicense: isClear,
    licensedAt: 0,
    lastLicStatus: 0,
    lastGenErr: null,
    disposed: false,
    videoEl: null,
    ms: null,
    sb: null,
    queue: [],
    mk: null,
    mkReadyPromise: null,
    serverCert: cached.serverCert || null,
    licAuth: cached.licAuth || null,
    pendingGenReqs: seededGenReqs,
    processedInitDataKeys: new Set(),
    objUrl: null,
    targetTime: 0,
    desiredVolume: 1.0,
    desiredMuted: false,
    remotePaused: false,
    explicitUserPause: false,
    lastPlayedAt: 0,
    lastSeekSentAt: 0
  };
}

function isTimeInSpBuffered(sp, t) {
  if (!sp || !sp.sb || !sp.sb.buffered || sp.sb.buffered.length === 0) return false;
  for (let i = 0; i < sp.sb.buffered.length; i++) {
    if (t >= sp.sb.buffered.start(i) - 0.3 && t <= sp.sb.buffered.end(i) + 0.3) {
      return true;
    }
  }
  return false;
}

function getSpBufferedEnd(sp) {
  if (!sp || !sp.sb || !sp.sb.buffered || sp.sb.buffered.length === 0) return 0;
  return sp.sb.buffered.end(sp.sb.buffered.length - 1);
}

function syncSpInstanceTimeAndPlay(sp, forceSeek = false) {
  if (!sp || sp.disposed || !sp.videoEl) return;
  try {
    if (sp.sb && sp.sb.buffered && sp.sb.buffered.length > 0) {
      const ct = sp.videoEl.currentTime || 0;
      const inBuffered = isTimeInSpBuffered(sp, ct);
      const bufEnd = getSpBufferedEnd(sp);
      const stalledAtBufferEnd =
        !sp.isClear &&
        bufEnd > 0 &&
        bufEnd - ct < 0.25 &&
        sp.videoEl.readyState <= 2 &&
        sp.targetTime > 0 &&
        isTimeInSpBuffered(sp, sp.targetTime) &&
        bufEnd - sp.targetTime > 1.2;
      if (!inBuffered || stalledAtBufferEnd) {
        if (sp.targetTime > 0 && isTimeInSpBuffered(sp, sp.targetTime) && bufEnd - sp.targetTime > 0.5) {
          sp.videoEl.currentTime = sp.targetTime;
        } else {
          const lastIdx = sp.sb.buffered.length - 1;
          sp.videoEl.currentTime = sp.sb.buffered.start(lastIdx) + 0.05;
        }
      } else if (forceSeek && sp.targetTime > 0 && isTimeInSpBuffered(sp, sp.targetTime)) {
        if (Math.abs(ct - sp.targetTime) > 0.5) {
          sp.videoEl.currentTime = sp.targetTime;
        }
      }
    } else if (forceSeek && sp.targetTime > 0 && sp.videoEl.readyState >= 1) {
      sp.videoEl.currentTime = sp.targetTime;
    }
    if (!sp.isStaging && !sp.remotePaused) {
      sp.lastPlayedAt = Date.now();
      if (sp.videoEl.paused) {
        sp.videoEl.play().catch(() => {});
      }
    }
  } catch (_) {}
}

// YouTube shows video in the sidebar while audio plays from background.html, so keep lip-sync tight:
// small drift is corrected with a tiny playbackRate nudge (inaudible), large drift with a seek.
function syncClearMirrorToFrame(sp, frameTime) {
  if (!sp || sp.disposed || !sp.videoEl || sp.isStaging) return;
  const v = sp.videoEl;
  try {
    if (!sp.remotePaused) sp.lastPlayedAt = Date.now();
    if (sp.syncHoldUntil && Date.now() < sp.syncHoldUntil) {
      if (sp.minSyncFrameTime && frameTime < sp.minSyncFrameTime) {
        if (v.paused && !sp.remotePaused) v.play().catch(() => {});
        return;
      }
      sp.syncHoldUntil = 0;
      sp.minSyncFrameTime = 0;
    }
    if (v.paused) {
      if (isTimeInSpBuffered(sp, frameTime)) v.currentTime = frameTime;
      v.playbackRate = 1.0;
      v.play().catch(() => {});
      return;
    }
    let drift = (Number(v.currentTime) || 0) - frameTime;
    if (Math.abs(drift) > 0.65) {
      if (isTimeInSpBuffered(sp, frameTime)) {
        v.currentTime = frameTime;
        drift = (Number(v.currentTime) || 0) - frameTime;
      }
      v.playbackRate = 1.0;
    } else if (Math.abs(drift) > 0.14) {
      v.playbackRate = Math.max(0.97, Math.min(1.03, 1 - drift * 0.18));
    } else if (v.playbackRate !== 1.0) {
      v.playbackRate = 1.0;
    }
    sp.lastDrift = Math.round(drift * 1000) / 1000;
  } catch (_) {}
}

const emeBridgePorts = new Map(); // `${sourceType}:${appId}` -> Port

function postSpSeekToSource(appId, sourceType, t) {
  const directPort = emeBridgePorts.get(`${sourceType}:${appId}`);
  if (directPort) {
    try {
      directPort.postMessage({ cmd: 'SEEK_SP_MEDIA', currentTime: t });
    } catch (_) {
      emeBridgePorts.delete(`${sourceType}:${appId}`);
    }
  }
  if (sourceType === 'sidebar') {
    browser.runtime.sendMessage({ type: 'PM_SEEK_SIDEBAR_SP', appId, currentTime: t }).catch(() => {});
    return;
  }
  const bgEntry = bgAudioPool.get(appId);
  if (bgEntry && bgEntry.frame && bgEntry.frame.contentWindow) {
    try {
      bgEntry.frame.contentWindow.postMessage(
        { target: 'pocketmail-media-frame', cmd: 'SEEK_SP_MEDIA', currentTime: t },
        '*'
      );
    } catch (_) {}
  }
}

function isPlayableYouTubeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h.includes('music.youtube.com')) return true;
    if (!h.includes('youtube.com')) return true;
    const p = u.pathname || '/';
    return (
      p.startsWith('/watch') ||
      p.startsWith('/shorts') ||
      p.startsWith('/live') ||
      p.startsWith('/embed')
    );
  } catch (_) {
    return false;
  }
}

function promoteStagingSpPlayer(appId, syncFromActive = true) {
  const stagingSp = bgStagingSpPlayers.get(appId);
  if (!stagingSp || stagingSp.disposed) return;
  const activeSp = bgSpEmePlayers.get(appId);
  const liveCt =
    syncFromActive && activeSp && activeSp.videoEl && !activeSp.disposed
      ? Number(activeSp.videoEl.currentTime) || 0
      : 0;

  let shouldForceSeek = false;
  if (liveCt > 0 && isTimeInSpBuffered(stagingSp, liveCt)) {
    if (!stagingSp.isClear && stagingSp.sb && stagingSp.sb.buffered && stagingSp.sb.buffered.length > 0) {
      const lastIdx = stagingSp.sb.buffered.length - 1;
      const bStart = stagingSp.sb.buffered.start(lastIdx) + 0.05;
      const bEnd = stagingSp.sb.buffered.end(lastIdx);
      const safeTarget = bEnd - liveCt >= 4.5 ? liveCt : Math.max(bStart, bEnd - 5.0);
      stagingSp.targetTime = safeTarget;
      shouldForceSeek = true;
      postSpSeekToSource(appId, stagingSp.sourceType, safeTarget);
    } else {
      stagingSp.targetTime = liveCt;
      shouldForceSeek = true;
    }
  } else if (stagingSp.sb && stagingSp.sb.buffered && stagingSp.sb.buffered.length > 0) {
    const lastIdx = stagingSp.sb.buffered.length - 1;
    stagingSp.targetTime = stagingSp.sb.buffered.start(lastIdx) + 0.05;
  }

  if (stagingSp.isClear && liveCt > 0.5) {
    stagingSp.syncHoldUntil = Date.now() + 1800;
    stagingSp.minSyncFrameTime = Math.max(0, liveCt - 1.5);
  }

  stagingSp.isStaging = false;
  stagingSp.awaitingBgFrameHandoff = false;
  stagingSp.desiredVolume = activeSp && activeSp.desiredVolume > 0 ? activeSp.desiredVolume : 1.0;
  stagingSp.desiredMuted = false;
  if (stagingSp.videoEl) {
    stagingSp.videoEl.muted = false;
    stagingSp.videoEl.volume = stagingSp.desiredVolume;
    stagingSp.videoEl.playbackRate = 1.0;
  }

  bgSpEmePlayers.set(appId, stagingSp);
  bgStagingSpPlayers.delete(appId);
  syncSpInstanceTimeAndPlay(stagingSp, shouldForceSeek);

  if (activeSp && activeSp !== stagingSp) {
    clearTimeout(activeSp.retireBgTimer);
    disposeSpPlayerInstance(activeSp);
  }
}

function checkAndPromoteStagingSpPlayer(appId) {
  const stagingSp = bgStagingSpPlayers.get(appId);
  if (!stagingSp || stagingSp.disposed) return;
  const activeSp = bgSpEmePlayers.get(appId);
  // Never auto-promote an idle sidebar staging instance while background audio is still actively playing (unless we are actively handing off to the sidebar)
  if (
    stagingSp.sourceType === 'sidebar' &&
    bgAudioPool.has(appId) &&
    !(activeSp && activeSp.awaitingBgFrameHandoff && activeSp.handoffSource === 'sidebar')
  ) {
    return;
  }

  const activeDeadOrNearEnd =
    !activeSp ||
    activeSp.disposed ||
    !activeSp.videoEl ||
    activeSp.videoEl.paused ||
    activeSp.videoEl.ended ||
    (getSpBufferedEnd(activeSp) > 0 && getSpBufferedEnd(activeSp) - (activeSp.videoEl.currentTime || 0) < 0.25);

  const stagingBufSpan =
    stagingSp.sb && stagingSp.sb.buffered && stagingSp.sb.buffered.length > 0
      ? stagingSp.sb.buffered.end(stagingSp.sb.buffered.length - 1) -
        stagingSp.sb.buffered.start(stagingSp.sb.buffered.length - 1)
      : 0;
  const stagingReady =
    stagingSp.hasLicense &&
    stagingSp.sb &&
    stagingSp.sb.buffered &&
    stagingSp.sb.buffered.length > 0 &&
    (stagingBufSpan >= 1.2 || activeDeadOrNearEnd);

  if (!stagingReady) {
    if (
      stagingSp.isClear &&
      activeDeadOrNearEnd &&
      stagingSp.sb &&
      stagingSp.sb.buffered &&
      stagingSp.sb.buffered.length > 0
    ) {
      promoteStagingSpPlayer(appId, true);
    }
    return;
  }

  if (stagingSp.sourceType === 'sidebar' && bgAudioPool.has(appId)) {
    removeBgAudioIframeOnly(appId);
  }

  const liveCt = activeSp && activeSp.videoEl ? Number(activeSp.videoEl.currentTime) || 0 : 0;
  const maxStagingWaitMs = stagingSp.isClear ? 2200 : 1100;
  if (
    activeDeadOrNearEnd ||
    liveCt <= 0 ||
    isTimeInSpBuffered(stagingSp, liveCt) ||
    (!stagingSp.isClear && stagingSp.sourceType === 'sidebar') ||
    (stagingSp.licensedAt > 0 && Date.now() - stagingSp.licensedAt > maxStagingWaitMs)
  ) {
    promoteStagingSpPlayer(appId, true);
  } else if (stagingSp.isClear && !stagingSp.lastSeekSentAt) {
    stagingSp.lastSeekSentAt = Date.now();
    postSpSeekToSource(appId, stagingSp.sourceType, liveCt);
  }
}

function drainSpInstanceQueue(sp) {
  if (!sp || sp.disposed || !sp.sb || sp.sb.updating || sp.queue.length === 0) return;
  const item = sp.queue.shift();
  try {
    if (item.type === 'abort') {
      try {
        sp.sb.abort();
      } catch (_) {}
      drainSpInstanceQueue(sp);
      return;
    }
    if (item.type === 'remove') {
      sp.sb.remove(item.start, item.end);
      return;
    }
    if (item.chunk) {
      if (
        typeof item.timestampOffset === 'number' &&
        Math.abs((sp.sb.timestampOffset || 0) - item.timestampOffset) > 0.01
      ) {
        try {
          sp.sb.timestampOffset = item.timestampOffset;
        } catch (_) {
          try {
            sp.sb.abort();
            sp.sb.timestampOffset = item.timestampOffset;
          } catch (__) {}
        }
      }
      sp.sb.appendBuffer(item.chunk);
    }
  } catch (err) {
    if (
      err &&
      err.name === 'QuotaExceededError' &&
      sp.videoEl &&
      sp.sb &&
      !sp.sb.updating &&
      sp.sb.buffered.length > 0
    ) {
      try {
        const bStart = sp.sb.buffered.start(0);
        const cutEnd = Math.max(bStart + 5, (sp.videoEl.currentTime || 0) - 8);
        if (cutEnd > bStart) {
          sp.queue.unshift(item);
          sp.sb.remove(bStart, cutEnd);
          return;
        }
      } catch (_) {}
    }
    if (!sp.disposed && sp.sb && !sp.sb.updating && sp.queue.length > 0) {
      setTimeout(() => drainSpInstanceQueue(sp), 15);
    }
  }
}

async function processSpInstanceGenReqs(sp) {
  if (!sp || sp.disposed || !sp.mk || !sp.licAuth || sp.pendingGenReqs.length === 0) return;
  while (sp.pendingGenReqs.length > 0 && !sp.disposed) {
    const req = sp.pendingGenReqs.shift();
    try {
      const keySig = `${req.initDataType}:${new Uint8Array(req.initData).join(',')}`;
      if (sp.processedInitDataKeys.has(keySig)) {
        continue;
      }
      sp.processedInitDataKeys.add(keySig);
      const sess = sp.mk.createSession();
      sess.addEventListener('message', async (ev) => {
        if (sp.disposed) return;
        try {
          const auth = sp.licAuth || bgSpCachedMeta.get(sp.appId)?.licAuth;
          if (!auth) return;
          const resp = await fetch(auth.url, {
            method: 'POST',
            headers: auth.headers,
            body: ev.message
          });
          sp.lastLicStatus = resp.status;
          if (!resp.ok) {
            // Cached auth token may be stale: re-queue so the next fresh LIC_AUTH from Spotify retries this key
            sp.processedInitDataKeys.delete(keySig);
            sp.pendingGenReqs.push(req);
            sess.close().catch(() => {});
            return;
          }
          const licBuf = await resp.arrayBuffer();
          if (sp.disposed) return;
          await sess.update(licBuf);
          sp.hasLicense = true;
          if (!sp.licensedAt) sp.licensedAt = Date.now();
          if (sp.isStaging) {
            checkAndPromoteStagingSpPlayer(sp.appId);
          } else {
            syncSpInstanceTimeAndPlay(sp);
          }
        } catch (err) {
          sp.lastGenErr = String(err);
          sp.processedInitDataKeys.delete(keySig);
        }
      });
      await sess.generateRequest(req.initDataType, req.initData);
    } catch (err) {
      sp.lastGenErr = String(err);
    }
  }
}

function prewarmNextSpMediaKeys() {}

function attachFreshSpMediaSource(sp, effectiveMime) {
  if (!sp || sp.disposed || !sp.videoEl) return Promise.resolve();
  try {
    if (sp.objUrl) URL.revokeObjectURL(sp.objUrl);
  } catch (_) {}
  sp.sb = null;
  const ms = new MediaSource();
  sp.ms = ms;
  sp.objUrl = URL.createObjectURL(ms);
  sp.videoEl.src = sp.objUrl;
  return new Promise((resolve) => {
    ms.addEventListener(
      'sourceopen',
      () => {
        if (!sp.disposed && sp.ms === ms) {
          try {
            const sb = ms.addSourceBuffer(effectiveMime);
            sp.sb = sb;
            sb.addEventListener('updateend', () => {
              if (sp.disposed || sp.sb !== sb) return;
              if (sp.isClear && !sp.licensedAt && sb.buffered.length > 0) sp.licensedAt = Date.now();
              // Proactively evict buffered audio more than 45s behind playback head so long sessions stay tiny in RAM
              if (
                sp.videoEl &&
                sp.videoEl.currentTime > 60 &&
                !sb.updating &&
                sb.buffered.length > 0 &&
                sp.videoEl.currentTime - sb.buffered.start(0) > 45
              ) {
                try {
                  sb.remove(sb.buffered.start(0), sp.videoEl.currentTime - 20);
                  return;
                } catch (_) {}
              }
              drainSpInstanceQueue(sp);
              if (!sp.isStaging && sp.retireBgWhenBuffered && sp.videoEl) {
                const rem = getSpBufferedEnd(sp) - (sp.videoEl.currentTime || 0);
                if (rem >= 8.0) {
                  sp.retireBgWhenBuffered = false;
                  clearTimeout(sp.retireBgTimer);
                  if (bgAudioPool.has(sp.appId)) {
                    removeBgAudioIframeOnly(sp.appId);
                  }
                }
              }
              if (sp.isStaging) {
                checkAndPromoteStagingSpPlayer(sp.appId);
              } else {
                syncSpInstanceTimeAndPlay(sp);
              }
            });
          } catch (_) {}
        }
        resolve();
      },
      { once: true }
    );
  });
}

function initSpPlayerInstance(sp) {
  if (!sp || sp.disposed) return Promise.resolve();
  if (sp.mkReadyPromise) return sp.mkReadyPromise;
  const effectiveMime = sp.mime || 'audio/mp4; codecs="mp4a.40.2"';
  sp.mkReadyPromise = (async () => {
    try {
      const v = document.createElement('video');
      v.autoplay = !sp.isStaging;
      v.muted = sp.isStaging ? true : sp.desiredMuted;
      v.volume = sp.isStaging ? 0 : sp.desiredVolume;
      document.body.appendChild(v);
      sp.videoEl = v;

      if (sp.isClear) {
        await attachFreshSpMediaSource(sp, effectiveMime);
        if (sp.disposed) return;
        drainSpInstanceQueue(sp);
        return;
      }

      const acc = await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [
        {
          initDataTypes: ['cenc'],
          audioCapabilities: [{ contentType: effectiveMime, robustness: 'SW_SECURE_CRYPTO' }]
        }
      ]);
      if (sp.disposed) return;
      const mk = await acc.createMediaKeys();
      if (sp.disposed) return;
      if (sp.serverCert) {
        await mk.setServerCertificate(sp.serverCert).catch(() => {});
      }
      await v.setMediaKeys(mk);
      if (sp.disposed) return;
      sp.mk = mk;

      await attachFreshSpMediaSource(sp, effectiveMime);
      if (sp.disposed) return;
      drainSpInstanceQueue(sp);
      processSpInstanceGenReqs(sp);
    } catch (_) {}
  })();
  return sp.mkReadyPromise;
}

function ensureBgSpEmePlayer(appId, mime = 'audio/mp4; codecs="mp4a.40.2"', newMsId = 0, sourceType = 'sidebar') {
  let sp = bgSpEmePlayers.get(appId);
  const effectiveMime = mime || 'audio/mp4; codecs="mp4a.40.2"';
  if (!sp || sp.disposed) {
    sp = createSpPlayerInstance(appId, effectiveMime, newMsId, false, sourceType);
    bgSpEmePlayers.set(appId, sp);
    return initSpPlayerInstance(sp);
  }
  sp.sourceType = sourceType;
  if (newMsId && !sp.msId) {
    sp.msId = newMsId;
  } else if (newMsId && sp.msId && newMsId !== sp.msId) {
    const prevVol = sp.desiredVolume;
    const prevMuted = sp.desiredMuted;
    disposeSpPlayerInstance(sp);
    sp = createSpPlayerInstance(appId, effectiveMime, newMsId, false, sourceType);
    sp.desiredVolume = prevVol;
    sp.desiredMuted = prevMuted;
    bgSpEmePlayers.set(appId, sp);
    return initSpPlayerInstance(sp);
  }
  return initSpPlayerInstance(sp);
}

function ensureStagingSpEmePlayer(appId, mime = 'audio/mp4; codecs="mp4a.40.2"', newMsId = 0, sourceType = 'bg') {
  let st = bgStagingSpPlayers.get(appId);
  const effectiveMime = mime || 'audio/mp4; codecs="mp4a.40.2"';
  if (!st || st.disposed) {
    st = createSpPlayerInstance(appId, effectiveMime, newMsId, true, sourceType);
    bgStagingSpPlayers.set(appId, st);
    return initSpPlayerInstance(st);
  }
  st.sourceType = sourceType;
  if (newMsId && !st.msId) {
    st.msId = newMsId;
  } else if (newMsId && st.msId && newMsId !== st.msId) {
    disposeSpPlayerInstance(st);
    st = createSpPlayerInstance(appId, effectiveMime, newMsId, true, sourceType);
    bgStagingSpPlayers.set(appId, st);
    return initSpPlayerInstance(st);
  }
  return initSpPlayerInstance(st);
}

function shouldRouteBgToStaging(appId) {
  const activeSp = bgSpEmePlayers.get(appId);
  if (!activeSp || activeSp.disposed || !activeSp.awaitingBgFrameHandoff) return false;
  if (!activeSp.videoEl || activeSp.videoEl.ended) return false;
  const bufEnd = getSpBufferedEnd(activeSp);
  return bufEnd > 0;
}

function activateSidebarSpTakeover(appId) {
  if (bgAudioPool.has(appId)) {
    removeBgAudioIframeOnly(appId);
  }
  const st = bgStagingSpPlayers.get(appId);
  if (st) {
    disposeSpPlayerInstance(st);
    bgStagingSpPlayers.delete(appId);
  }
  const activeSp = bgSpEmePlayers.get(appId);
  if (activeSp && !activeSp.disposed) {
    activeSp.awaitingBgFrameHandoff = false;
    activeSp.sourceType = 'sidebar';
    activeSp.remotePaused = false;
  }
}

function handleSpEmeBridgeMessage(appId, data, sourceType = 'bg') {
  if (!appId || !data) return;
  const bt = data.bridgeType;

  if (bt === 'STOP_PLAYBACK') {
    const curActiveSp = bgSpEmePlayers.get(appId);
    if (
      sourceType === 'sidebar' &&
      (bgAudioPool.has(appId) || (curActiveSp && !curActiveSp.disposed && curActiveSp.awaitingBgFrameHandoff)) &&
      !data.explicitStop
    ) {
      const isNonPlayableYt = appId === 'youtube' && data.href && !isPlayableYouTubeUrl(data.href);
      if (!isNonPlayableYt) return;
    }
    if (bgAudioPool.has(appId)) {
      removeBgAudioIframeOnly(appId);
    }
    const stagingSp = bgStagingSpPlayers.get(appId);
    if (stagingSp) {
      disposeSpPlayerInstance(stagingSp);
      bgStagingSpPlayers.delete(appId);
    }
    const activeSp = bgSpEmePlayers.get(appId);
    if (activeSp && !activeSp.disposed) {
      activeSp.awaitingBgFrameHandoff = false;
      activeSp.remotePaused = true;
      activeSp.explicitUserPause = true;
      if (activeSp.videoEl && !activeSp.videoEl.paused) {
        try {
          activeSp.videoEl.pause();
        } catch (_) {}
      }
    }
    const prevSt = liveMediaPlaybackState.get(appId);
    if (prevSt) {
      prevSt.isPlaying = false;
      prevSt.handedOffAt = undefined;
      if (data.href && !data.href.includes('pm_boot=1')) {
        prevSt.resumeUrl = data.href;
      }
      prevSt.updatedAt = Date.now();
    }
    if (data.href && !data.href.includes('pm_boot=1') && isAppAllowedForPersistence(appId)) {
      if (!currentSettings.persistentSavedAppUrls) currentSettings.persistentSavedAppUrls = {};
      currentSettings.persistentSavedAppUrls[appId] = data.href;
    }
    refreshBgAudioIndicator();
    return;
  }

  if (bt === 'USER_PLAY_INTENT') {
    if (bgStagingSpPlayers.has(appId)) {
      promoteStagingSpPlayer(appId, false);
    }
    const activeSp = bgSpEmePlayers.get(appId);
    if (activeSp && !activeSp.disposed) {
      activeSp.awaitingBgFrameHandoff = false;
      activeSp.remotePaused = false;
      activeSp.explicitUserPause = false;
      activeSp.lastPlayedAt = Date.now();
      syncSpInstanceTimeAndPlay(activeSp);
    }
    refreshBgAudioIndicator();
    return;
  }

  // If the sidebar frame for this app is actively streaming MSE/EME or playing, transition takeover from bgAudioPool to sidebar!
  if (
    sourceType === 'sidebar' &&
    bgAudioPool.has(appId) &&
    (bt === 'MSE_INIT' || bt === 'GEN_REQ' || bt === 'MSE_CHUNK' || (bt === 'SYNC_TIME' && !data.paused))
  ) {
    const activeSp = bgSpEmePlayers.get(appId);
    if (!(activeSp && activeSp.retireBgWhenBuffered)) {
      removeBgAudioIframeOnly(appId);
    }
    if (activeSp && !activeSp.disposed) {
      activeSp.awaitingBgFrameHandoff = true;
      activeSp.handoffStartedAt = Date.now();
      activeSp.handoffSource = 'sidebar';
      activeSp.remotePaused = false;
    }
  }

  if (bt === 'SERVER_CERT') {
    const certBuf = toLocalArrayBuffer(data.cert);
    if (!certBuf) return;
    const prev = bgSpCachedMeta.get(appId) || {};
    bgSpCachedMeta.set(appId, { ...prev, serverCert: certBuf });
    prewarmNextSpMediaKeys('audio/mp4; codecs="mp4a.40.2"', certBuf);
    const activeSp = bgSpEmePlayers.get(appId);
    if (activeSp && !activeSp.disposed) {
      activeSp.serverCert = certBuf;
      if (activeSp.mk) activeSp.mk.setServerCertificate(certBuf).catch(() => {});
    }
    const stagingSp = bgStagingSpPlayers.get(appId);
    if (stagingSp && !stagingSp.disposed) {
      stagingSp.serverCert = certBuf;
      if (stagingSp.mk) stagingSp.mk.setServerCertificate(certBuf).catch(() => {});
    }
    return;
  }

  if (bt === 'LIC_AUTH') {
    const licAuth = cloneLocalLicAuth(data.url, data.headers);
    if (!licAuth) return;
    const prev = bgSpCachedMeta.get(appId) || {};
    bgSpCachedMeta.set(appId, { ...prev, licAuth });
    const activeSp = bgSpEmePlayers.get(appId);
    if (activeSp && !activeSp.disposed) {
      activeSp.licAuth = licAuth;
      processSpInstanceGenReqs(activeSp);
    }
    const stagingSp = bgStagingSpPlayers.get(appId);
    if (stagingSp && !stagingSp.disposed) {
      stagingSp.licAuth = licAuth;
      processSpInstanceGenReqs(stagingSp);
    }
    return;
  }

  const routeActiveSp = bgSpEmePlayers.get(appId);
  const routeStagingSp = bgStagingSpPlayers.get(appId);
  // Ignore passive paused ticks or idle VOLUME events from the newly opened sidebar iframe while background audio is still playing
  if (
    sourceType === 'sidebar' &&
    bgAudioPool.has(appId) &&
    !(routeActiveSp && routeActiveSp.awaitingBgFrameHandoff && routeActiveSp.handoffSource === 'sidebar')
  ) {
    return;
  }
  // If we are actively handing off to a new source (sidebar -> bg or bg -> sidebar),
  // prevent late messages from the retiring source from disposing the active player or stealing staging
  if (
    routeActiveSp &&
    !routeActiveSp.disposed &&
    routeActiveSp.awaitingBgFrameHandoff &&
    routeActiveSp.handoffSource &&
    sourceType !== routeActiveSp.handoffSource
  ) {
    if (bt === 'MSE_INIT' || bt === 'GEN_REQ') {
      return;
    }
    if (data.msId && routeActiveSp.msId && data.msId !== routeActiveSp.msId) {
      return;
    }
  }
  // Which frame is currently taking over playback: the hidden bg frame (sidebar just closed) or the sidebar frame (sidebar just reopened)
  const handoffSrc =
    (routeActiveSp && !routeActiveSp.disposed && routeActiveSp.awaitingBgFrameHandoff && routeActiveSp.handoffSource) ||
    (routeStagingSp && routeStagingSp.sourceType) ||
    'bg';
  const useStaging = sourceType === handoffSrc && (shouldRouteBgToStaging(appId) || Boolean(routeStagingSp));

  if (bt === 'MSE_INIT') {
    if (useStaging) {
      ensureStagingSpEmePlayer(appId, data.mime, data.msId, sourceType);
      const st = bgStagingSpPlayers.get(appId);
      if (routeActiveSp && routeActiveSp.isClear && routeActiveSp.videoEl && st && !st.lastSeekSentAt) {
        const liveCt = Number(routeActiveSp.videoEl.currentTime) || 0;
        const href = String(data.href || '');
        if (liveCt > 0.5 && (href.includes('/shorts/') || !href.includes('t='))) {
          st.lastSeekSentAt = Date.now();
          postSpSeekToSource(appId, sourceType, liveCt);
        }
      }
    } else {
      ensureBgSpEmePlayer(appId, data.mime, data.msId, sourceType);
    }
    return;
  }

  if (bt === 'GEN_REQ') {
    const initBuf = toLocalArrayBuffer(data.initData);
    if (!initBuf) return;
    recordRecentSpGenReq(appId, data.initDataType, initBuf);
    if (useStaging) {
      ensureStagingSpEmePlayer(appId, 'audio/mp4; codecs="mp4a.40.2"', 0, sourceType);
      const st = bgStagingSpPlayers.get(appId);
      if (st) {
        st.pendingGenReqs.push({ initDataType: data.initDataType, initData: initBuf });
        processSpInstanceGenReqs(st);
      }
    } else {
      ensureBgSpEmePlayer(appId, 'audio/mp4; codecs="mp4a.40.2"', 0, sourceType);
      const sp = bgSpEmePlayers.get(appId);
      if (sp) {
        sp.pendingGenReqs.push({ initDataType: data.initDataType, initData: initBuf });
        processSpInstanceGenReqs(sp);
      }
    }
    return;
  }

  if (bt === 'MSE_CHUNK') {
    const chunkBuf = toLocalArrayBuffer(data.chunk);
    if (!chunkBuf) return;
    if (useStaging) {
      const curSt = bgStagingSpPlayers.get(appId);
      if (curSt && curSt.sourceType === sourceType && data.msId && curSt.msId && data.msId < curSt.msId) return;
      ensureStagingSpEmePlayer(appId, data.mime, data.msId, sourceType);
      const st = bgStagingSpPlayers.get(appId);
      if (st) {
        st.queue.push({ type: 'append', chunk: chunkBuf, timestampOffset: data.timestampOffset });
        drainSpInstanceQueue(st);
      }
    } else {
      const curSp = bgSpEmePlayers.get(appId);
      if (curSp && curSp.sourceType === sourceType && data.msId && curSp.msId && data.msId < curSp.msId) return;
      ensureBgSpEmePlayer(appId, data.mime, data.msId, sourceType);
      const sp = bgSpEmePlayers.get(appId);
      if (sp) {
        sp.queue.push({ type: 'append', chunk: chunkBuf, timestampOffset: data.timestampOffset });
        drainSpInstanceQueue(sp);
      }
    }
    return;
  }

  if (bt === 'MSE_REMOVE') {
    const target = useStaging ? bgStagingSpPlayers.get(appId) : bgSpEmePlayers.get(appId);
    if (!target || (data.msId && target.msId && data.msId < target.msId)) return;
    target.queue.push({ type: 'remove', start: data.start, end: data.end });
    drainSpInstanceQueue(target);
    return;
  }

  if (bt === 'MSE_ABORT') {
    const target = useStaging ? bgStagingSpPlayers.get(appId) : bgSpEmePlayers.get(appId);
    if (!target || (data.msId && target.msId && data.msId < target.msId)) return;
    target.queue.push({ type: 'abort' });
    drainSpInstanceQueue(target);
    return;
  }

  if (bt === 'VOLUME') {
    const target = useStaging ? bgStagingSpPlayers.get(appId) : bgSpEmePlayers.get(appId);
    if (!target) return;
    if (typeof data.volume === 'number') target.desiredVolume = data.volume;
    if (typeof data.muted === 'boolean') target.desiredMuted = data.muted;
    if (!target.isStaging && target.videoEl) {
      target.videoEl.muted = target.desiredMuted;
      target.videoEl.volume = target.desiredVolume;
    }
    return;
  }

  if (bt === 'SYNC_TIME') {
    if (appId === 'youtube' && data.href && !isPlayableYouTubeUrl(data.href)) {
      data.paused = true;
      data.explicitPause = true;
    }
    if (useStaging) {
      const st = bgStagingSpPlayers.get(appId);
      if (!st) return;
      st.targetTime = Number(data.currentTime) || 0;
      if (!data.fromSeek || !data.paused) {
        st.remotePaused = Boolean(data.paused);
      }
      if (!data.paused) {
        st.lastPlayedAt = Date.now();
        checkAndPromoteStagingSpPlayer(appId);
      }
      return;
    }

    const sp = bgSpEmePlayers.get(appId);
    if (!sp) return;
    if (sourceType === 'sidebar' && sp.sourceType === 'bg' && data.paused && !data.explicitPause) {
      // Ignore passive paused ticks from the newly opened sidebar iframe while background audio is still playing
      return;
    }
    if (sourceType === 'sidebar' && data.paused && !data.explicitPause && (sidebarPortCount === 0 || sp.awaitingBgFrameHandoff)) {
      // Ignore non-user pause events emitted while the sidebar/popup is closing or handing off
      return;
    }
    sp.targetTime = Number(data.currentTime) || 0;
    if (data.fromSeek && data.paused) {
      // Initial track seek before play() resolves: update targetTime without marking remotePaused=true
      if (sp.videoEl && !sp.videoEl.paused) {
        syncSpInstanceTimeAndPlay(sp, true);
      }
      return;
    }
    sp.remotePaused = Boolean(data.paused);
    if (!data.paused) {
      sp.explicitUserPause = false;
      if (!sp.handoffSource || sp.handoffSource === sourceType) {
        sp.awaitingBgFrameHandoff = false;
        if (!sp.isClear && sp.videoEl && sp.videoEl.playbackRate !== 1.0) {
          sp.videoEl.playbackRate = 1.0;
        }
      }
      sp.lastPlayedAt = Date.now();
    } else if (data.explicitPause) {
      sp.explicitUserPause = true;
      sp.awaitingBgFrameHandoff = false;
    }
    if (sp.videoEl) {
      if (!data.paused) {
        if (sp.isClear) {
          syncClearMirrorToFrame(sp, Number(data.currentTime) || 0);
        } else {
          syncSpInstanceTimeAndPlay(sp, Boolean(data.forceSeek));
        }
        const bgEntry = bgAudioPool.get(appId);
        const prevSt = liveMediaPlaybackState.get(appId);
        const liveSec = Math.floor(sp.videoEl.currentTime || data.currentTime || 0);
        let nextResumeUrl =
          (data.href && !data.href.includes('pm_boot=1') ? data.href : '') ||
          bgEntry?.url ||
          prevSt?.resumeUrl ||
          currentSettings.persistentSavedAppUrls?.[appId] ||
          (appId === 'youtube' ? 'https://www.youtube.com/' : 'https://open.spotify.com/');
        if (appId === 'youtube' && nextResumeUrl) {
          try {
            const u = new URL(nextResumeUrl);
            if (u.pathname.startsWith('/watch') && liveSec >= 1) {
              u.searchParams.set('t', `${liveSec}s`);
              nextResumeUrl = u.href;
            }
          } catch (_) {}
        }
        if (bgEntry && nextResumeUrl) {
          bgEntry.url = nextResumeUrl;
        }
        if (nextResumeUrl && isAppAllowedForPersistence(appId)) {
          if (!currentSettings.persistentSavedAppUrls) currentSettings.persistentSavedAppUrls = {};
          currentSettings.persistentSavedAppUrls[appId] = nextResumeUrl;
        }
        liveMediaPlaybackState.set(appId, {
          isPlaying: true,
          currentTime: liveSec,
          resumeUrl: nextResumeUrl,
          title: bgEntry?.title || prevSt?.title || (appId === 'youtube' ? 'YouTube' : 'Spotify'),
          updatedAt: Date.now()
        });
        refreshBgAudioIndicator();
      } else {
        if (!sp.videoEl.paused) {
          try {
            sp.videoEl.pause();
          } catch (_) {}
        }
        const prevSt = liveMediaPlaybackState.get(appId);
        if (prevSt) {
          prevSt.isPlaying = false;
          prevSt.handedOffAt = undefined;
          if (data.href && !data.href.includes('pm_boot=1')) {
            prevSt.resumeUrl = data.href;
          }
          prevSt.updatedAt = Date.now();
        }
        refreshBgAudioIndicator();
      }
    }
  }
}

window.__pmHandleSpEmeBridge = handleSpEmeBridgeMessage;

setInterval(() => {
  if (bgStagingSpPlayers.size > 0) {
    bgStagingSpPlayers.forEach((_, appId) => {
      checkAndPromoteStagingSpPlayer(appId);
    });
  }
}, 250);

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
  if (
    bgAudioPool.size === 0 &&
    bgMsePlayers.size === 0 &&
    bgSpEmePlayers.size === 0 &&
    bgStagingSpPlayers.size === 0
  ) {
    return;
  }
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
  bgStagingSpPlayers.forEach((_, appId) => cleanupSpEmePlayer(appId));
  bgAudioPool.clear();
  updateToolbarBadge();
}

function startBackgroundAudioKeepAlive(appId, targetUrl, title = '') {
  if (!appId || !targetUrl || !document.body) return;
  if (!isAppAllowedForBgAudio(appId)) {
    stopSingleBackgroundAudioFrame(appId);
    return;
  }

  // Ensure only one background audio app plays at a time (never YouTube + Spotify simultaneously)
  Array.from(bgAudioPool.keys()).forEach((otherId) => {
    if (otherId !== appId) {
      stopSingleBackgroundAudioFrame(otherId);
      liveMediaPlaybackState.delete(otherId);
    }
  });
  Array.from(bgSpEmePlayers.keys()).forEach((otherId) => {
    if (otherId !== appId) {
      cleanupSpEmePlayer(otherId);
    }
  });

  const existing = bgAudioPool.get(appId);
  if (existing) {
    // If this app's background audio keep-alive frame is already connected and running, keep it playing with 0ms interruption!
    if (existing.frame && existing.frame.isConnected) {
      const st = bgStagingSpPlayers.get(appId);
      if (st && st.sourceType === 'sidebar') {
        disposeSpPlayerInstance(st);
        bgStagingSpPlayers.delete(appId);
      }
      return;
    }
    try {
      existing.frame.remove();
      existing.frame.src = 'about:blank';
    } catch (_) {}
    bgAudioPool.delete(appId);
  }
  cleanupMsePlayer(appId);

  if (MIRROR_AUDIO_APP_IDS.has(appId)) {
    const staleStaging = bgStagingSpPlayers.get(appId);
    if (staleStaging) {
      disposeSpPlayerInstance(staleStaging);
      bgStagingSpPlayers.delete(appId);
    }
    const activeSp = bgSpEmePlayers.get(appId);
    const recentlyPlayingBeforeClose = Boolean(
      activeSp &&
        !activeSp.explicitUserPause &&
        activeSp.lastPlayedAt > 0 &&
        Date.now() - activeSp.lastPlayedAt < 3500
    );
    const hasWarmBuffer = Boolean(
      activeSp &&
        !activeSp.disposed &&
        activeSp.videoEl &&
        activeSp.sb &&
        activeSp.sb.buffered &&
        activeSp.sb.buffered.length > 0 &&
        (!activeSp.remotePaused || recentlyPlayingBeforeClose)
    );
    if (hasWarmBuffer) {
      // Keep the already-buffered <video> in background.html playing with 0.0ms gap while the background iframe boots and stages!
      activeSp.remotePaused = false;
      activeSp.explicitUserPause = false;
      activeSp.awaitingBgFrameHandoff = true;
      activeSp.handoffStartedAt = Date.now();
      activeSp.handoffSource = 'bg';
      activeSp.sourceType = 'bg';
      activeSp.videoEl.muted = false;
      activeSp.videoEl.volume = activeSp.desiredVolume > 0 ? activeSp.desiredVolume : 1.0;
      const remBuf = getSpBufferedEnd(activeSp) - (activeSp.videoEl.currentTime || 0);
      activeSp.videoEl.playbackRate = !activeSp.isClear && remBuf > 0 && remBuf < 9.5 ? 0.88 : 1.0;
      syncSpInstanceTimeAndPlay(activeSp);
      if (appId === 'spotify') {
        ensureStagingSpEmePlayer(appId, activeSp.mime || 'audio/mp4; codecs="mp4a.40.2"', 0, 'bg');
      }
    } else {
      cleanupSpEmePlayer(appId);
      if (appId === 'spotify') {
        ensureBgSpEmePlayer(appId, 'audio/mp4; codecs="mp4a.40.2"', 0, 'bg');
      }
    }
  } else {
    cleanupSpEmePlayer(appId);
  }

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
  refreshBgAudioIndicator();
}

function triggerSidebarClosedAudioHandoff(candidates = []) {
  const mode = currentSettings.persistenceMode || 'selected';
  if (mode === 'eco' || currentSettings.keepAudioPlayingWhenClosed === false) {
    stopBackgroundAudioFrames();
    return;
  }
  scheduleSettingsSave(true);

  let startedAny = false;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const allowedCandidates = candidates.filter((c) => {
      if (!c || !c.appId || !c.url || !isAppAllowedForBgAudio(c.appId)) return false;
      const sp = bgSpEmePlayers.get(c.appId);
      if (sp && sp.explicitUserPause) return false;
      if (c.appId === 'youtube' && !isPlayableYouTubeUrl(c.url)) return false;
      return true;
    });
    const chosen =
      allowedCandidates.find((c) => c.appId === currentSettings.persistentLastActiveAppId) ||
      allowedCandidates[allowedCandidates.length - 1];
    if (chosen && chosen.appId && chosen.url) {
      startBackgroundAudioKeepAlive(chosen.appId, chosen.url, chosen.title || '');
      startedAny = true;
    }
  }
  if (!startedAny) {
    let bestId = null;
    let bestSt = null;
    liveMediaPlaybackState.forEach((st, id) => {
      const sp = bgSpEmePlayers.get(id);
      if (sp && sp.explicitUserPause) return;
      if (st.isPlaying && Date.now() - st.updatedAt < 60000 && isAppAllowedForBgAudio(id)) {
        const candidateUrl = st.resumeUrl || currentSettings.persistentSavedAppUrls?.[id] || '';
        if (id === 'youtube' && !isPlayableYouTubeUrl(candidateUrl)) return;
        if (!bestSt || id === currentSettings.persistentLastActiveAppId || st.updatedAt >= bestSt.updatedAt) {
          bestId = id;
          bestSt = st;
        }
      }
    });
    if (bestId && bestSt) {
      const targetUrl =
        bestSt.resumeUrl ||
        currentSettings.persistentSavedAppUrls?.[bestId] ||
        (bestId === 'spotify' ? 'https://open.spotify.com/' : '');
      if (targetUrl) {
        startBackgroundAudioKeepAlive(bestId, targetUrl, bestSt.title || '');
        startedAny = true;
      }
    }
  }
  if (!startedAny) {
    // Also check if bgSpEmePlayers already has an active playing mirrored session (Spotify / YouTube) from the sidebar!
    MIRROR_AUDIO_APP_IDS.forEach((mirrorId) => {
      if (startedAny || !isAppAllowedForBgAudio(mirrorId)) return;
      const sp = bgSpEmePlayers.get(mirrorId);
      const recentlyActive =
        sp &&
        !sp.disposed &&
        !sp.explicitUserPause &&
        (!sp.remotePaused || Date.now() - (sp.lastPlayedAt || 0) < 2000);
      if (recentlyActive && sp.sb && sp.sb.buffered && sp.sb.buffered.length > 0) {
        const targetUrl =
          liveMediaPlaybackState.get(mirrorId)?.resumeUrl ||
          currentSettings.persistentSavedAppUrls?.[mirrorId] ||
          (mirrorId === 'spotify' ? 'https://open.spotify.com/' : 'https://www.youtube.com/');
        if (mirrorId === 'youtube' && !isPlayableYouTubeUrl(targetUrl)) return;
        startBackgroundAudioKeepAlive(mirrorId, targetUrl, mirrorId === 'spotify' ? 'Spotify' : 'YouTube');
        startedAny = true;
      }
    });
  }
  if (!startedAny) {
    // Clean up any non-persistent or paused EME players
    bgSpEmePlayers.forEach((sp, id) => {
      if (!bgAudioPool.has(id)) {
        cleanupSpEmePlayer(id);
      }
    });
  }
}

if (browser.runtime && browser.runtime.onConnect) {
  browser.runtime.onConnect.addListener((port) => {
    if (!port) return;
    if (port.name === 'foxhub-eme-bridge') {
      let portKey = '';
      port.onMessage.addListener((msg) => {
        if (!msg || msg.type !== 'PM_SP_EME_BRIDGE') return;
        const fn = typeof msg.flatFrameName === 'string' ? msg.flatFrameName : '';
        let appId = '';
        let sourceType = 'sidebar';
        if (fn.startsWith('pm-bg-audio-')) {
          appId = fn.replace('pm-bg-audio-', '');
          sourceType = 'bg';
          if (!bgAudioPool.has(appId)) return;
        } else if (fn.startsWith('pm-media-frame-')) {
          appId = fn.replace('pm-media-frame-', '');
          sourceType = 'sidebar';
        }
        if (!appId) return;
        portKey = `${sourceType}:${appId}`;
        emeBridgePorts.set(portKey, port);
        handleSpEmeBridgeMessage(appId, msg, sourceType);
      });
      port.onDisconnect.addListener(() => {
        if (portKey && emeBridgePorts.get(portKey) === port) {
          emeBridgePorts.delete(portKey);
        }
      });
      return;
    }
    if (port.name !== 'foxhub-sidebar-lifecycle') return;
    sidebarPortCount++;
    refreshBgAudioIndicator();

    port.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'FORWARD_SP_EME_BRIDGE' && msg.appId && msg.data) {
        handleSpEmeBridgeMessage(msg.appId, msg.data, 'sidebar');
        return;
      }
      if (msg.type === 'UPDATE_PERSISTENT_SESSION') {
        if (msg.activeAppId && isAppAllowedForPersistence(msg.activeAppId)) {
          currentSettings.persistentLastActiveAppId = msg.activeAppId;
        } else if (msg.activeAppId === 'pocketmail' && msg.explicitMailClick && bgAudioPool.size === 0) {
          currentSettings.persistentLastActiveAppId = 'pocketmail';
        }
        if (Array.isArray(msg.openPersistentAppIds)) {
          currentSettings.persistentOpenAppIds = msg.openPersistentAppIds.filter((id) => isAppAllowedForPersistence(id));
        }
        if (msg.appId && msg.url && !msg.url.includes('pm_boot=1')) {
          if (!currentSettings.persistentSavedAppUrls) {
            currentSettings.persistentSavedAppUrls = {};
          }
          if (isAppAllowedForPersistence(msg.appId)) {
            currentSettings.persistentSavedAppUrls[msg.appId] = msg.url;
          }
          if (msg.appId === 'youtube' && !isPlayableYouTubeUrl(msg.url)) {
            if (bgAudioPool.has('youtube')) {
              removeBgAudioIframeOnly('youtube');
            }
            const stagingSp = bgStagingSpPlayers.get('youtube');
            if (stagingSp) {
              disposeSpPlayerInstance(stagingSp);
              bgStagingSpPlayers.delete('youtube');
            }
            const activeSp = bgSpEmePlayers.get('youtube');
            if (activeSp && !activeSp.disposed) {
              activeSp.awaitingBgFrameHandoff = false;
              activeSp.remotePaused = true;
              activeSp.explicitUserPause = true;
              if (activeSp.videoEl && !activeSp.videoEl.paused) {
                try {
                  activeSp.videoEl.pause();
                } catch (_) {}
              }
            }
            const prevYt = liveMediaPlaybackState.get('youtube');
            if (prevYt) {
              prevYt.isPlaying = false;
              prevYt.handedOffAt = undefined;
              prevYt.resumeUrl = msg.url;
              prevYt.updatedAt = Date.now();
            }
            refreshBgAudioIndicator();
          }
        }
        if (msg.appId && msg.playback) {
          const prev = liveMediaPlaybackState.get(msg.appId);
          const prevWasPlaying = Boolean(prev?.isPlaying);
          const sp = bgSpEmePlayers.get(msg.appId);
          const candidateUrl = String(msg.playback.resumeUrl || msg.url || '');
          const isNonPlayableYt = msg.appId === 'youtube' && candidateUrl && !isPlayableYouTubeUrl(candidateUrl);
          const inTakeoverGrace =
            !isNonPlayableYt &&
            !(sp && sp.explicitUserPause) &&
            !msg.playback.isPlaying &&
            prev &&
            prev.handedOffAt &&
            Date.now() - prev.handedOffAt < 12000 &&
            prev.isPlaying &&
            (bgAudioPool.has(msg.appId) || (sp && sp.awaitingBgFrameHandoff));
          const nextIsPlaying = isNonPlayableYt ? false : Boolean(msg.playback.isPlaying || inTakeoverGrace);
          if (nextIsPlaying) {
            liveMediaPlaybackState.forEach((otherSt, otherId) => {
              if (otherId !== msg.appId && otherSt.isPlaying) {
                otherSt.isPlaying = false;
              }
            });
          }
          liveMediaPlaybackState.set(msg.appId, {
            isPlaying: nextIsPlaying,
            currentTime: Number(msg.playback.currentTime) || 0,
            duration: Number(msg.playback.duration) || 0,
            resumeUrl: candidateUrl,
            title: String(msg.playback.title || ''),
            handedOffAt: inTakeoverGrace ? prev.handedOffAt : undefined,
            updatedAt: Date.now()
          });
          if (candidateUrl && isAppAllowedForPersistence(msg.appId)) {
            if (!currentSettings.persistentSavedAppUrls) {
              currentSettings.persistentSavedAppUrls = {};
            }
            currentSettings.persistentSavedAppUrls[msg.appId] = candidateUrl;
          }
          if (prevWasPlaying !== nextIsPlaying) {
            refreshBgAudioIndicator();
          }
        }
        scheduleSettingsSave(false);
      }
    });

    // Fires 100% reliably in 0ms the instant the Firefox Left Sidebar (×) or Popup is closed!
    port.onDisconnect.addListener(() => {
      sidebarPortCount = Math.max(0, sidebarPortCount - 1);
      triggerSidebarClosedAudioHandoff();
      refreshBgAudioIndicator();
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
    handleSpEmeBridgeMessage(appId, data, 'bg');
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
        snoozed: localOverlay.snoozed,
        audibleAppId: getAudibleBgAudioAppId()
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
        if (res && res.ok) {
          const sentMessage = await recordSentEmailInOverlay(payload);
          if (currentSettings.soundId !== 'none') {
            PocketMailSound.playNotificationSound('morning-dew', Math.min(0.55, currentSettings.soundVolume || 0.5));
          }
          return { ...res, sentMessage, state: cachedState };
        }
        return res;
      })();

    case 'RECORD_SENT_EMAIL':
      return (async () => {
        const payload = msg.payload || {};
        const sentMessage = await recordSentEmailInOverlay(payload);
        if (currentSettings.soundId !== 'none') {
          PocketMailSound.playNotificationSound('morning-dew', Math.min(0.55, currentSettings.soundVolume || 0.5));
        }
        return { ok: true, sentMessage, state: cachedState };
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
        const patch = msg.settings || {};
        const prevPoll = currentSettings.pollIntervalSeconds;
        currentSettings = { ...currentSettings, ...patch };
        scheduleSettingsSave(true);
        // If any active background audio app was disabled in settings, stop it immediately
        Array.from(bgAudioPool.keys()).forEach((appId) => {
          if (!isAppAllowedForBgAudio(appId)) {
            stopSingleBackgroundAudioFrame(appId);
          }
        });
        if (sidebarPortCount === 0) {
          Array.from(bgSpEmePlayers.keys()).forEach((appId) => {
            if (!isAppAllowedForBgAudio(appId)) {
              cleanupSpEmePlayer(appId);
            }
          });
        }
        refreshBgAudioIndicator();
        if (patch.pollIntervalSeconds !== undefined && patch.pollIntervalSeconds !== prevPoll) {
          restartPollingTimer();
        }
        const needsAccountSync =
          patch.demoMode !== undefined ||
          patch.accountConfigs !== undefined ||
          patch.maxAccounts !== undefined ||
          patch.maxEmailsPerAccount !== undefined ||
          patch.oauthAccounts !== undefined;
        const state = needsAccountSync ? await syncAllAccounts() : cachedState;
        if (!needsAccountSync) {
          browser.runtime
            .sendMessage({
              type: 'STATE_UPDATED',
              state: cachedState,
              settings: currentSettings,
              snoozed: localOverlay.snoozed
            })
            .catch(() => {});
        }
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
        localOverlay = {
          overlayVersion: 2,
          readIds: {},
          trashedIds: {},
          archivedIds: {},
          starredIds: {},
          snoozed: {},
          seenIds: {},
          sentMessages: []
        };
        await saveOverlay();
        const state = await syncAllAccounts();
        return { ok: true, state };
      })();

    case 'CLEAR_PERSISTENT_SESSIONS':
      return (async () => {
        persistentAppSessions.clear();
        activeAppIdInSidebar = 'pocketmail';
        openPersistentAppIds = [];
        currentSettings = {
          ...currentSettings,
          lastActiveAppId: 'pocketmail',
          savedAppSessions: {},
          savedOpenPersistentApps: []
        };
        scheduleSettingsSave(true);
        return { ok: true };
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
      if (Array.isArray(msg.openPersistentAppIds)) {
        currentSettings.persistentOpenAppIds = msg.openPersistentAppIds.filter((id) => isAppAllowedForPersistence(id));
      }
      if (msg.appId && msg.url && !msg.url.includes('pm_boot=1')) {
        if (!currentSettings.persistentSavedAppUrls) {
          currentSettings.persistentSavedAppUrls = {};
        }
        if (isAppAllowedForPersistence(msg.appId)) {
          currentSettings.persistentSavedAppUrls[msg.appId] = msg.url;
        }
        if (msg.appId === 'youtube' && !isPlayableYouTubeUrl(msg.url)) {
          if (bgAudioPool.has('youtube')) {
            removeBgAudioIframeOnly('youtube');
          }
          const stagingSp = bgStagingSpPlayers.get('youtube');
          if (stagingSp) {
            disposeSpPlayerInstance(stagingSp);
            bgStagingSpPlayers.delete('youtube');
          }
          const activeSp = bgSpEmePlayers.get('youtube');
          if (activeSp && !activeSp.disposed) {
            activeSp.awaitingBgFrameHandoff = false;
            activeSp.remotePaused = true;
            activeSp.explicitUserPause = true;
            if (activeSp.videoEl && !activeSp.videoEl.paused) {
              try {
                activeSp.videoEl.pause();
              } catch (_) {}
            }
          }
          const prevYt = liveMediaPlaybackState.get('youtube');
          if (prevYt) {
            prevYt.isPlaying = false;
            prevYt.handedOffAt = undefined;
            prevYt.resumeUrl = msg.url;
            prevYt.updatedAt = Date.now();
          }
          refreshBgAudioIndicator();
        }
      }
      if (msg.appId && msg.playback) {
        const prev = liveMediaPlaybackState.get(msg.appId);
        const prevWasPlaying = Boolean(prev?.isPlaying);
        const sp = bgSpEmePlayers.get(msg.appId);
        const candidateUrl = String(msg.playback.resumeUrl || msg.url || '');
        const isNonPlayableYt = msg.appId === 'youtube' && candidateUrl && !isPlayableYouTubeUrl(candidateUrl);
        const inTakeoverGrace =
          !isNonPlayableYt &&
          !(sp && sp.explicitUserPause) &&
          !msg.playback.isPlaying &&
          prev &&
          prev.handedOffAt &&
          Date.now() - prev.handedOffAt < 12000 &&
          prev.isPlaying &&
          (bgAudioPool.has(msg.appId) || (sp && sp.awaitingBgFrameHandoff));
        const nextIsPlaying = isNonPlayableYt ? false : Boolean(msg.playback.isPlaying || inTakeoverGrace);
        if (nextIsPlaying) {
          liveMediaPlaybackState.forEach((otherSt, otherId) => {
            if (otherId !== msg.appId && otherSt.isPlaying) {
              otherSt.isPlaying = false;
            }
          });
        }
        liveMediaPlaybackState.set(msg.appId, {
          isPlaying: nextIsPlaying,
          currentTime: Number(msg.playback.currentTime) || 0,
          duration: Number(msg.playback.duration) || 0,
          resumeUrl: candidateUrl,
          title: String(msg.playback.title || ''),
          handedOffAt: inTakeoverGrace ? prev.handedOffAt : undefined,
          updatedAt: Date.now()
        });
        if (candidateUrl && isAppAllowedForPersistence(msg.appId)) {
          if (!currentSettings.persistentSavedAppUrls) {
            currentSettings.persistentSavedAppUrls = {};
          }
          currentSettings.persistentSavedAppUrls[msg.appId] = candidateUrl;
        }
        if (prevWasPlaying !== nextIsPlaying) {
          refreshBgAudioIndicator();
        }
      }
      scheduleSettingsSave(false);
      return Promise.resolve({ ok: true });
    }

    case 'PREINIT_BG_SP_PLAYER': {
      const appId = msg.appId || 'spotify';
      prewarmNextSpMediaKeys('audio/mp4; codecs="mp4a.40.2"');
      if (!bgSpEmePlayers.has(appId)) {
        ensureBgSpEmePlayer(appId, 'audio/mp4; codecs="mp4a.40.2"', 0, 'sidebar');
      }
      return Promise.resolve({ ok: true });
    }

    case 'SIDEBAR_SP_TAKEOVER_BEGIN': {
      // Sidebar is creating its own Spotify/YouTube web player. Never let two players run at once,
      // so retire the hidden bg frame and keep the already-buffered audio playing until the sidebar player resumes and swaps in.
      const appId = msg.appId || 'spotify';
      const activeSp = bgSpEmePlayers.get(appId);
      const mirrorPlaying = Boolean(
        activeSp && !activeSp.disposed && activeSp.videoEl && !activeSp.videoEl.paused && !activeSp.remotePaused
      );
      if (!bgAudioPool.has(appId) && !mirrorPlaying) {
        return Promise.resolve({ ok: true, resume: false });
      }
      if (mirrorPlaying) {
        activeSp.lastPlayedAt = Date.now();
        activeSp.awaitingBgFrameHandoff = true;
        activeSp.handoffStartedAt = Date.now();
        activeSp.handoffSource = 'sidebar';
        activeSp.remotePaused = false;
        const remBuf = getSpBufferedEnd(activeSp) - (activeSp.videoEl.currentTime || 0);
        if (!activeSp.isClear && remBuf > 0 && remBuf < 9.5) {
          activeSp.videoEl.playbackRate = 0.88;
        }
        if (appId === 'spotify') {
          ensureStagingSpEmePlayer(appId, activeSp.mime || 'audio/mp4; codecs="mp4a.40.2"', 0, 'sidebar');
        }
      }
      if (
        appId === 'spotify' &&
        bgAudioPool.has(appId) &&
        mirrorPlaying &&
        activeSp.originSource === 'bg' &&
        getSpBufferedEnd(activeSp) - (activeSp.videoEl.currentTime || 0) < 5.0
      ) {
        activeSp.retireBgWhenBuffered = true;
        clearTimeout(activeSp.retireBgTimer);
        activeSp.retireBgTimer = setTimeout(() => {
          activeSp.retireBgWhenBuffered = false;
          if (bgAudioPool.has(appId)) {
            removeBgAudioIframeOnly(appId);
          }
        }, 500);
        return Promise.resolve({ ok: true, resume: true });
      }
      removeBgAudioIframeOnly(appId);
      return Promise.resolve({ ok: true, resume: mirrorPlaying });
    }

    case 'PM_SP_SIDEBAR_PLAYPAUSE_CLICK': {
      const appId = msg.appId || 'spotify';
      const aria = String(msg.aria || '').toLowerCase();
      // If user clicked Pause in the sidebar, pause bgSpEmePlayers and remove background iframe
      if (aria.includes('pause')) {
        if (bgAudioPool.has(appId)) {
          removeBgAudioIframeOnly(appId);
        }
        const sp = bgSpEmePlayers.get(appId);
        if (sp && sp.videoEl) {
          sp.remotePaused = true;
          sp.explicitUserPause = true;
          try {
            sp.videoEl.pause();
          } catch (_) {}
        }
        const st = liveMediaPlaybackState.get(appId);
        if (st) {
          st.isPlaying = false;
          st.updatedAt = Date.now();
        }
      }
      return Promise.resolve({ ok: true });
    }

    case 'SIDEBAR_CLOSED_HANDOFF': {
      const mode = currentSettings.persistenceMode || 'selected';
      if (mode === 'eco') {
        stopBackgroundAudioFrames();
        return Promise.resolve({ ok: true });
      }

      if (msg.activeAppId && isAppAllowedForPersistence(msg.activeAppId)) {
        currentSettings.persistentLastActiveAppId = msg.activeAppId;
      } else if (Array.isArray(msg.playingApps) && msg.playingApps.length > 0 && msg.playingApps[0].appId) {
        currentSettings.persistentLastActiveAppId = msg.playingApps[0].appId;
      }
      if (Array.isArray(msg.openPersistentAppIds)) {
        currentSettings.persistentOpenAppIds = msg.openPersistentAppIds.filter((id) => isAppAllowedForPersistence(id));
      }
      if (msg.savedUrls && typeof msg.savedUrls === 'object') {
        if (!currentSettings.persistentSavedAppUrls) currentSettings.persistentSavedAppUrls = {};
        Object.entries(msg.savedUrls).forEach(([id, u]) => {
          if (u && isAppAllowedForPersistence(id)) {
            currentSettings.persistentSavedAppUrls[id] = u;
          }
        });
      }
      scheduleSettingsSave(false);
      if (currentSettings.keepAudioPlayingWhenClosed === false) {
        stopBackgroundAudioFrames();
        return Promise.resolve({ ok: true });
      }
      triggerSidebarClosedAudioHandoff(Array.isArray(msg.playingApps) ? msg.playingApps : []);
      return Promise.resolve({ ok: true });
    }

    case 'STOP_BG_AUDIO_HANDOFF': {
      const activeBgApps = [];
      bgAudioPool.forEach((val, id) => {
        let resumeUrl = val.url;
        const sp = bgSpEmePlayers.get(id);
        if (id === 'youtube' && sp && !sp.disposed && sp.videoEl && sp.videoEl.currentTime > 1) {
          try {
            const u = new URL(resumeUrl);
            if (u.pathname.startsWith('/watch')) {
              u.searchParams.set('t', `${Math.floor(sp.videoEl.currentTime)}s`);
              resumeUrl = u.href;
              val.url = resumeUrl;
            }
          } catch (_) {}
        }
        activeBgApps.push({ appId: id, url: resumeUrl, title: val.title });
        liveMediaPlaybackState.set(id, {
          isPlaying: true,
          currentTime: sp && sp.videoEl ? Math.floor(sp.videoEl.currentTime || 0) : 0,
          resumeUrl,
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
        audibleAppId: getAudibleBgAudioAppId(),
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
      refreshBgAudioIndicator();
      return Promise.resolve({ ok: true });
    }

    case 'STOP_ALL_BG_AUDIO_APPS': {
      stopBackgroundAudioFrames();
      liveMediaPlaybackState.clear();
      refreshBgAudioIndicator();
      return Promise.resolve({ ok: true });
    }

    case 'GET_BG_AUDIO_STATUS': {
      const activeBgApps = [];
      bgAudioPool.forEach((val, id) => {
        activeBgApps.push({ appId: id, url: val.url, title: val.title });
      });
      return Promise.resolve({
        ok: true,
        activeBgApps,
        audibleAppId: getAudibleBgAudioAppId()
      });
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
