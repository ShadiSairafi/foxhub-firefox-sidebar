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
  popupWidth: 560,            // Resizable popup width (380px - 790px)
  popupHeight: 600,           // Resizable popup height (460px - 600px)
  autoFitEmail: true,         // Automatically scale wide HTML emails to fit reader width
  enabledMediaApps: ['instagram', 'whatsapp', 'discord', 'telegram', 'spotify', 'youtube', 'tiktok', 'x', 'messenger', 'reddit'],
  customMediaApps: [],        // [{ id, name, url, color }]
  sidebarOpenMode: 'auto',    // 'auto' | 'sidebar' | 'embedded' | 'window'
  socialAppThemeMode: 'native', // 'native' | 'match-theme' | 'warm-glass' | 'midnight-oled' | 'cozy-sepia' | 'true-night'
  socialAppNotifySounds: true,  // Play chime when social app receives new messages
  socialAppSoundMap: {},        // { whatsapp: 'crystal-drop', discord: 'zen-bell', ... }
  hideMediaBottomBar: false,    // Toggleable bottom navigation bar with icons
  autoHideMediaTopBar: true,    // Default ON: Auto-hide top shortcuts bar and reveal smoothly on hover
  hasSeenTopBarHint: false,     // Shows first-time onboarding hint explaining top-edge hover bar
  topBarAutoHideMigratedV1: true,
  persistenceMode: 'selected',  // 'eco' (reset & free RAM) | 'selected' (custom picked apps) | 'all' (all apps persistent)
  persistentAppIds: [],         // All apps OFF by default! User can toggle individual apps ON anytime
  persistentMemoryHintCount: 0, // Shows a gentle 1-or-2-time-ever notice when all persistent apps are OFF
  settingsGearHintCount: 0,     // Shows a curved-arrow coachmark pointing at the Settings gear up to 2 times
  customVideoLoadbar: true,     // On by default: custom interactive video progress/seek bar on TikTok, Reels & Shorts
  videoLoadbarStyle: 'sunset',  // 'sunset' | 'accent' | 'cyber' | 'emerald' | 'minimal-white' | 'custom'
  videoLoadbarColor: '#FF3366', // Custom hex color when videoLoadbarStyle === 'custom'
  videoLoadbarSize: 'normal',   // 'slim' | 'normal' | 'bold'
  persistentLastActiveAppId: 'pocketmail',
  persistentSavedAppUrls: {},   // { spotify: 'https://...', youtube: 'https://...', ... }
  keepAudioPlayingWhenClosed: true,
  autoPauseOnTabAudio: true,    // Opera GX-style: automatically pause FoxHub music when a browser tab plays audio
  tabAudioBehavior: 'pause-resume', // 'pause-resume' (default) | 'pause-only' | 'off'
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
  muteEmailNotifications: false,
  muteSiteNotifications: false,
  globalShortcuts: {
    popup: 'Alt+Shift+F',
    sidebar: 'Alt+Shift+M',
    popout: 'Alt+Shift+W'
  },
  appShortcuts: {},
  appShortcutOpenMode: 'sidebar', // 'sidebar' | 'popup' | 'popout'
  ttsRate: 1.0,
  ttsVoice: '',
  dndUntil: 0,
  muteSitesUntil: 0,
  lastMuteTimerMins: 0,
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
const resolvedOtpCache = new Map(); // msg.id -> { otpCode, fullText }

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
    if (data.settings.muteSiteNotifications === undefined && data.settings.socialAppNotifySounds === false) {
      currentSettings.muteSiteNotifications = true;
      needsSave = true;
    } else if (data.settings.muteSiteNotifications === true && currentSettings.socialAppNotifySounds !== false) {
      currentSettings.socialAppNotifySounds = false;
      needsSave = true;
    }
    if (!currentSettings.globalShortcuts || typeof currentSettings.globalShortcuts !== 'object') {
      currentSettings.globalShortcuts = { ...DEFAULT_SETTINGS.globalShortcuts };
    }
    if (!currentSettings.appShortcuts || typeof currentSettings.appShortcuts !== 'object') {
      currentSettings.appShortcuts = {};
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
        if (typeof PocketMailGmailClient !== 'undefined' && PocketMailGmailClient.extractVerificationCode) {
          m.otpCode = PocketMailGmailClient.extractVerificationCode(m.subject, m.fullText || m.snippet) || null;
        }
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
  return Boolean(currentSettings.dndUntil && currentSettings.dndUntil > Date.now());
}

function isSitesTimedMuteActive() {
  return Boolean(currentSettings.muteSitesUntil && currentSettings.muteSitesUntil > Date.now());
}

function isEmailNotificationsMuted() {
  return Boolean(isDndActive() || currentSettings.muteEmailNotifications);
}

function isSiteNotificationsMuted() {
  return Boolean(
    isSitesTimedMuteActive() ||
      currentSettings.muteSiteNotifications ||
      currentSettings.socialAppNotifySounds === false
  );
}

function checkExpiredMuteTimers() {
  const now = Date.now();
  let expiredChanged = false;
  if (currentSettings.dndUntil && currentSettings.dndUntil > 0 && currentSettings.dndUntil <= now) {
    currentSettings.dndUntil = 0;
    expiredChanged = true;
  }
  if (currentSettings.muteSitesUntil && currentSettings.muteSitesUntil > 0 && currentSettings.muteSitesUntil <= now) {
    currentSettings.muteSitesUntil = 0;
    expiredChanged = true;
  }
  if (expiredChanged) {
    if (!isDndActive() && !isSitesTimedMuteActive()) {
      currentSettings.lastMuteTimerMins = 0;
    }
    scheduleSettingsSave(true);
    updateToolbarBadge();
    browser.runtime
      .sendMessage({
        type: 'STATE_UPDATED',
        state: cachedState,
        settings: currentSettings,
        snoozed: localOverlay.snoozed
      })
      .catch(() => {});
  }
}
setInterval(checkExpiredMuteTimers, 10000);

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
      // If a brand-new message arrived in this thread AFTER the user locally archived/trashed/read an earlier message in the thread,
      // clear the old overlay entry so the new message appears in the inbox!
      if (msg.timestamp) {
        if (localOverlay.trashedIds[msg.id] && msg.timestamp > localOverlay.trashedIds[msg.id] + 2000) {
          delete localOverlay.trashedIds[msg.id];
        }
        if (localOverlay.archivedIds[msg.id] && msg.timestamp > localOverlay.archivedIds[msg.id] + 2000) {
          delete localOverlay.archivedIds[msg.id];
        }
        if (localOverlay.readIds[msg.id] && msg.timestamp > localOverlay.readIds[msg.id] + 2000) {
          delete localOverlay.readIds[msg.id];
        }
      }
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
      const cachedFull = resolvedOtpCache.get(msg.id);
      const isCacheFresh = Boolean(
        cachedFull && cachedFull.timestamp === msg.timestamp && now - (cachedFull.fetchedAt || 0) < 8000
      );
      const effectiveFullText = isCacheFresh ? cachedFull.fullText || msg.fullText || '' : '';
      const effectiveSnippet = isCacheFresh && cachedFull.latestSnippet ? cachedFull.latestSnippet : msg.snippet;
      const recomputedOtp =
        (isCacheFresh && cachedFull.otpCode) ||
        PocketMailGmailClient.extractVerificationCode(msg.subject, effectiveFullText || effectiveSnippet);
      return {
        ...msg,
        snippet: effectiveSnippet,
        fullText: effectiveFullText || undefined,
        otpCode: recomputedOtp || null,
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

  if (isDndActive() || isSitesTimedMuteActive()) {
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
  const emailMutedNow = isEmailNotificationsMuted();
  const sitesMutedNow = isSiteNotificationsMuted();
  const muteSuffix =
    emailMutedNow && sitesMutedNow
      ? ' (All Muted)'
      : emailMutedNow
        ? ' (Email Muted)'
        : sitesMutedNow
          ? ' (Sites Muted)'
          : '';
  const lines = [`FoxHub Mail: ${cachedState.totalUnread} unread${muteSuffix}`];
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

    // For the newest unread verification/2FA emails (especially multi-message threads where Gmail's Atom <summary>
    // stays stuck on an older code in the thread), resolve the full thread body so we always extract the newest message's code!
    const otpCandidates = [];
    accounts.forEach((acc) => {
      if (acc.disabled) return;
      (acc.messages || []).forEach((m) => {
        if (
          m.unread !== false &&
          !m.isDemo &&
          /\b(code|key|verification|verify|otp|passcode|security|sign-in|signin|login|auth|confirm|pin|steam guard|two-factor|2fa|redeem|activation)\b/i.test(
            `${m.subject || ''} ${m.snippet || ''}`
          )
        ) {
          const cached = resolvedOtpCache.get(m.id);
          if (!cached || cached.timestamp !== m.timestamp || Date.now() - (cached.fetchedAt || 0) >= 8000) {
            otpCandidates.push(m);
          }
        }
      });
    });

    if (otpCandidates.length > 0) {
      otpCandidates.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      await Promise.all(
        otpCandidates.slice(0, 3).map(async (m) => {
          try {
            const fullRes = await PocketMailGmailClient.fetchFullEmailContent(m);
            if (fullRes) {
              resolvedOtpCache.set(m.id, {
                timestamp: m.timestamp,
                fetchedAt: Date.now(),
                otpCode: fullRes.otpCode || null,
                fullText: fullRes.plainText || '',
                latestSnippet: fullRes.latestSnippet || ''
              });
              if (fullRes.plainText) m.fullText = fullRes.plainText;
              if (fullRes.latestSnippet) m.snippet = fullRes.latestSnippet;
              if (fullRes.otpCode) m.otpCode = fullRes.otpCode;
            }
          } catch (_) {}
        })
      );
    }

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

    // Notify on new arrivals (unless Do Not Disturb or Email Mute is active)
    if ((newArrivals.length > 0 && !isEmailNotificationsMuted()) || options.forceTestNotification) {
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

try {
  if (browser.notifications && browser.notifications.onClicked) {
    browser.notifications.onClicked.addListener((notificationId) => {
      if (typeof notificationId === 'string' && (notificationId.startsWith('pm-msg-') || notificationId.startsWith('pm-snooze-'))) {
        browser.runtime
          .sendMessage({
            type: 'OPEN_MAIL_WORKSPACE',
            state: cachedState,
            settings: currentSettings
          })
          .catch(() => {});
      }
    });
  }
} catch (_) {}

/**
 * Check Snoozed Emails every minute and wake due emails
 */
async function checkSnoozedEmails() {
  checkExpiredMuteTimers();
  const now = Date.now();
  let changed = false;

  for (const [id, entry] of Object.entries(localOverlay.snoozed)) {
    if (entry.wakeAt <= now) {
      delete localOverlay.snoozed[id];
      delete localOverlay.readIds[id];
      changed = true;

      if (!isEmailNotificationsMuted() && currentSettings.desktopNotifications && entry.message) {
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

  // Block Service Worker registration scripts on YouTube, WhatsApp Web, Telegram & X inside FoxHub where SW caches X-Frame-Options: DENY
  if (browser.webRequest.onBeforeRequest) {
    browser.webRequest.onBeforeRequest.addListener(
      (details) => {
        if (!isFromPocketMail(details)) return {};
        if (
          /\/(sw(-[\w.-]+)?|service[.-]?worker(-[\w.-]+)?|guest-sw|guest-events-sw|OneSignalSDKWorker)\.js(\?|$)/i.test(
            details.url || ''
          )
        ) {
          return { cancel: true };
        }
        return {};
      },
      {
        urls: [
          '*://*.whatsapp.com/*',
          '*://*.youtube.com/*',
          '*://*.x.com/*',
          '*://*.twitter.com/*',
          '*://*.telegram.org/*'
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
    'https://chat.reddit.com/',
    'https://www.twitch.tv/',
    'https://chatgpt.com/',
    'https://gemini.google.com/'
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
    const socialTheme = currentSettings?.socialAppThemeMode || 'native';
    const phLower = parsedUrl ? parsedUrl.hostname.toLowerCase() : '';
    const hasDarkCookieOverride =
      Boolean(parsedUrl && (socialTheme === 'true-night' || socialTheme === 'midnight-oled')) &&
      (phLower === 'x.com' ||
        phLower.endsWith('.x.com') ||
        phLower === 'twitter.com' ||
        phLower.endsWith('.twitter.com') ||
        phLower === 'www.youtube.com' ||
        phLower.endsWith('.youtube.com') ||
        phLower === 'www.tiktok.com' ||
        phLower.endsWith('.tiktok.com'));
    if ((!storeCookies || storeCookies.length === 0) && !hasHeaderCookie && !hasLiveCookies && !hasDarkCookieOverride) {
      return;
    }

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
    // Honor FoxHub's Social Dark Mode override (True Night OLED / Midnight OLED) on cookie-driven platforms (X Lights Out, YouTube SSR Dark, TikTok Dark)
    if (parsedUrl && (socialTheme === 'true-night' || socialTheme === 'midnight-oled')) {
      if (phLower === 'x.com' || phLower.endsWith('.x.com') || phLower === 'twitter.com' || phLower.endsWith('.twitter.com')) {
        map.set('night_mode', '2');
      } else if (phLower === 'www.youtube.com' || phLower.endsWith('.youtube.com')) {
        const prevPref = map.get('PREF') || '';
        const nextPref = prevPref
          ? /(^|&)f6=[^&]*/.test(prevPref)
            ? prevPref.replace(/(^|&)f6=[^&]*/, '$1f6=400')
            : `${prevPref}&f6=400`
          : 'f6=400';
        map.set('PREF', nextPref);
      } else if (phLower === 'www.tiktok.com' || phLower.endsWith('.tiktok.com')) {
        map.set('tiktok_webapp_theme', 'dark');
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

      const allowPersistentRamCache = Boolean(
        isTopEmbeddedAppFrame &&
        details.method === 'GET' &&
        isPersistentCacheableAppFrame(parsedUrl)
      );

      let hasReferer = false;
      for (let hi = headers.length - 1; hi >= 0; hi--) {
        const h = headers[hi];
        const lower = (h.name || '').toLowerCase();
        if (
          allowPersistentRamCache &&
          (lower === 'cache-control' || lower === 'pragma')
        ) {
          // Strip browser reload/revalidation request headers on persistent app opens so Gecko serves the hard-cached HTML shell in 0.2ms from RAM
          headers.splice(hi, 1);
          continue;
        }
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
    const isSocialDark =
      currentSettings?.socialAppThemeMode === 'true-night' || currentSettings?.socialAppThemeMode === 'midnight-oled';
    const lines = String(rawCookieVal).split('\n');
    const outLines = lines.map((line) => {
      let effectiveLine = line;
      if (isSocialDark && cookieOriginKey === 'https://x.com' && /^\s*night_mode=[01]\b/i.test(effectiveLine)) {
        effectiveLine = effectiveLine.replace(/^(\s*night_mode=)[01]\b/i, '$12');
      }
      if (cookieOriginKey) {
        const semi = effectiveLine.indexOf(';');
        const firstPart = semi >= 0 ? effectiveLine.slice(0, semi) : effectiveLine;
        const eq = firstPart.indexOf('=');
        if (eq > 0) {
          const cName = firstPart.slice(0, eq).trim();
          const cVal = firstPart.slice(eq + 1).trim();
          const isExpiredDirective =
            !cVal ||
            cVal === 'EXPIRED' ||
            cVal === 'deleted' ||
            /;\s*Max-Age\s*=\s*-?0\b/i.test(effectiveLine) ||
            /;\s*Expires\s*=[^;]*1970/i.test(effectiveLine);
          if (cName) {
            updateLiveOriginCookie(cookieOriginKey, cName, isExpiredDirective ? 'EXPIRED' : cVal);
          }
        }
      }
      let updated = effectiveLine.replace(/;\s*SameSite\s*=\s*(Lax|Strict)/gi, '; SameSite=None');
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

        // Serve a minimal clean HTML document for ServiceWorker/CacheStorage bootstrap cleanup requests (?pm_boot=1)
        // so /favicon.ico?pm_boot=1 (Telegram) and /robots.txt?pm_boot=1 (X, WhatsApp) execute media-frame-optimizer.js cleanly at document_start!
        if (
          isBootRequest &&
          details.type === 'sub_frame' &&
          typeof browser.webRequest.filterResponseData === 'function'
        ) {
          try {
            const bootFilter = browser.webRequest.filterResponseData(details.requestId);
            const bootEncoder = new TextEncoder();
            bootFilter.ondata = () => {};
            bootFilter.onstop = () => {
              try {
                bootFilter.write(
                  bootEncoder.encode(
                    '<!DOCTYPE html><html style="background:#000000;color-scheme:dark"><head><meta charset="utf-8"></head><body style="background:#000000;margin:0"></body></html>'
                  )
                );
              } catch (_) {}
              try {
                bootFilter.close();
              } catch (_) {}
            };
            bootFilter.onerror = () => {
              try {
                bootFilter.close();
              } catch (_) {}
            };
          } catch (_) {}
        }

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

        const shouldHardCachePersistentShell = Boolean(
          fromPocketMail &&
          !isBootRequest &&
          details.type === 'sub_frame' &&
          details.method === 'GET' &&
          details.statusCode === 200 &&
          parsedRespUrl &&
          isPersistentCacheableAppFrame(parsedRespUrl)
        );

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
          if (
            shouldHardCachePersistentShell &&
            (name === 'cache-control' ||
              name === 'pragma' ||
              name === 'expires' ||
              (name === 'vary' && /\b(cookie|\*)/i.test(h.value || '')))
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

        if (shouldHardCachePersistentShell) {
          cleanedHeaders.push({
            name: 'Cache-Control',
            value: 'private, max-age=1800, stale-while-revalidate=86400'
          });
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
      if (!isEmailNotificationsMuted()) {
        if (currentSettings.soundId !== 'none') {
          PocketMailSound.playNotificationSound('morning-dew', currentSettings.soundVolume);
        }
        if (currentSettings.desktopNotifications) {
          browser.notifications.create(`pm-login-${Date.now()}`, {
            type: 'basic',
            iconUrl: browser.runtime.getURL('icons/icon-128.png'),
            title: 'Google Account Connected!',
            message: 'FoxHub has added your Gmail account locally.'
          });
        }
      }
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
const bgStandbyPool = new Map(); // appId -> { frame, url, createdAt }
const sidebarHasAppendedSpChunks = new Map(); // appId -> boolean
const bgMsePlayers = new Map(); // appId -> { ms, audioEl, sb, queue, objUrl }
const bgSpEmePlayers = new Map(); // appId -> spInstance (active audible player)
const bgStagingSpPlayers = new Map(); // appId -> spInstance (silent staging player during closed-sidebar handoff)
const bgNextSpPlayers = new Map(); // appId -> spInstance (gapless preloaded next track player)
const bgSpCachedMeta = new Map(); // appId -> { serverCert, licAuth, recentGenReqs }
const bgAudioDiagLog = []; // ring buffer of recent playback/handoff/tab-audio events (max 80)
let bgSpInstanceCounter = 0;
let standbySpotifyPrewarmTimer = null;
let pendingShortcutLaunch = null; // { appId, openMode, ts }
// Apps whose page audio is mirrored (MSE) into background.html, so background.html is the only audible output
const MIRROR_AUDIO_APP_IDS = new Set(['spotify', 'youtube']);
var sidebarPortCount = 0;
var popupPortCount = 0;
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

function logAudioDiag(event, details = {}) {
  try {
    bgAudioDiagLog.push({
      ts: Date.now(),
      iso: new Date().toISOString(),
      event: String(event || 'event'),
      ...details
    });
    if (bgAudioDiagLog.length > 80) {
      bgAudioDiagLog.splice(0, bgAudioDiagLog.length - 80);
    }
  } catch (_) {}
}

function summarizeSpInstanceDiag(sp) {
  if (!sp) return null;
  const v = sp.videoEl;
  const bufRanges = [];
  try {
    if (sp.sb && sp.sb.buffered) {
      for (let i = 0; i < sp.sb.buffered.length; i++) {
        bufRanges.push([
          Math.round(sp.sb.buffered.start(i) * 100) / 100,
          Math.round(sp.sb.buffered.end(i) * 100) / 100
        ]);
      }
    }
  } catch (_) {}
  return {
    id: sp.id,
    appId: sp.appId,
    sourceType: sp.sourceType,
    isStaging: Boolean(sp.isStaging),
    isNextPreload: Boolean(sp.isNextPreload),
    disposed: Boolean(sp.disposed),
    hasLicense: Boolean(sp.hasLicense),
    lastLicStatus: sp.lastLicStatus || 0,
    lastGenErr: sp.lastGenErr || null,
    remotePaused: Boolean(sp.remotePaused),
    explicitUserPause: Boolean(sp.explicitUserPause),
    autoPausedByTab: Boolean(sp.autoPausedByTab),
    awaitingBgFrameHandoff: Boolean(sp.awaitingBgFrameHandoff),
    handoffSource: sp.handoffSource || '',
    targetTime: Math.round((Number(sp.targetTime) || 0) * 100) / 100,
    currentTime: v ? Math.round((Number(v.currentTime) || 0) * 100) / 100 : 0,
    paused: v ? Boolean(v.paused) : true,
    muted: v ? Boolean(v.muted) : true,
    readyState: v ? v.readyState : 0,
    buffered: bufRanges,
    trackTitle: sp.trackTitle || '',
    trackDuration: Math.round(Number(sp.trackDuration) || 0),
    msSinceAdvance: sp.lastTimeAdvanceAt ? Date.now() - sp.lastTimeAdvanceAt : 0
  };
}

function buildAudioDiagnosticsSnapshot() {
  const activePlayers = {};
  bgSpEmePlayers.forEach((sp, id) => {
    activePlayers[id] = summarizeSpInstanceDiag(sp);
  });
  const stagingPlayers = {};
  bgStagingSpPlayers.forEach((sp, id) => {
    stagingPlayers[id] = summarizeSpInstanceDiag(sp);
  });
  const nextPlayers = {};
  bgNextSpPlayers.forEach((sp, id) => {
    nextPlayers[id] = summarizeSpInstanceDiag(sp);
  });
  return {
    version: '2.7.8',
    generatedAt: new Date().toISOString(),
    audibleAppId: getAudibleBgAudioAppId(),
    sidebarPortCount,
    popupPortCount,
    bgAudioPoolIds: Array.from(bgAudioPool.keys()),
    emeBridgePortKeys: Array.from(emeBridgePorts.keys()),
    tabAudioBehavior: getTabAudioBehavior(),
    isAutoPausedByTabAudio: Boolean(isAutoPausedByTabAudio),
    manualOverrideWhileTabAudible: Boolean(manualOverrideWhileTabAudible),
    knownActiveMediaTabIds: Array.from(knownActiveMediaTabIds),
    audibleOverrideTabIds: Array.from(audibleOverrideTabIds),
    persistenceMode: currentSettings.persistenceMode || 'selected',
    keepAudioPlayingWhenClosed: currentSettings.keepAudioPlayingWhenClosed !== false,
    persistentAppIds: Array.isArray(currentSettings.persistentAppIds) ? currentSettings.persistentAppIds : [],
    bgAudioAppIds: Array.isArray(currentSettings.bgAudioAppIds) ? currentSettings.bgAudioAppIds : [],
    activePlayers,
    stagingPlayers,
    nextPlayers,
    recentEvents: bgAudioDiagLog.slice(-60)
  };
}

function getAudibleBgAudioAppId() {
  try {
    for (const [appId, sp] of bgSpEmePlayers) {
      const v = sp && !sp.disposed ? sp.videoEl : null;
      if (v && !v.paused && !v.ended && !v.muted && v.volume > 0 && v.readyState >= 2 && !sp.remotePaused) {
        const bufEnd = getSpBufferedEnd(sp);
        const ct = Number(v.currentTime) || 0;
        if (bufEnd > 0 && bufEnd - ct <= 0.05 && sp.lastTimeAdvanceAt && Date.now() - sp.lastTimeAdvanceAt > 2800) {
          continue;
        }
        return appId;
      }
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

let bypassPersistentCacheUntil = 0;

try {
  window.__pmConsumePendingShortcutApp = () => {
    if (pendingShortcutLaunch && Date.now() - pendingShortcutLaunch.ts < 7000) {
      const consumed = { ...pendingShortcutLaunch };
      pendingShortcutLaunch = null;
      return consumed;
    }
    return null;
  };
  window.__pmGetAudioDiagnostics = buildAudioDiagnosticsSnapshot;
  window.__pmGetSyncBootState = () => {
    const currentlyPausedByTab = isTabAutoPauseEnforced();
    const activeBgApps = [];
    bgAudioPool.forEach((val, id) => {
      activeBgApps.push({
        appId: id,
        url: val.url,
        title: val.title,
        bgMasterActive: false
      });
    });
    const pendingAppId =
      pendingShortcutLaunch && Date.now() - pendingShortcutLaunch.ts < 7000 ? pendingShortcutLaunch.appId || '' : '';
    return {
      settings: currentSettings,
      activeBgApps,
      audibleAppId: getAudibleBgAudioAppId(),
      isAutoPausedByTabAudio: currentlyPausedByTab,
      sidebarOpenCount: sidebarPortCount,
      pendingShortcutAppId: pendingAppId
    };
  };
} catch (_) {}

function resolveAppIdForHostname(hostname) {
  if (!hostname) return '';
  const h = hostname.toLowerCase();
  if (h === 'www.instagram.com' || h.endsWith('.instagram.com') || h === 'instagram.com') return 'instagram';
  if (h === 'web.whatsapp.com' || h.endsWith('.whatsapp.com')) return 'whatsapp';
  if (h === 'discord.com' || h.endsWith('.discord.com')) return 'discord';
  if (h === 'web.telegram.org' || h.endsWith('.telegram.org')) return 'telegram';
  if (h === 'open.spotify.com') return 'spotify';
  if (h === 'www.youtube.com' || h === 'music.youtube.com' || h === 'm.youtube.com') return 'youtube';
  if (h === 'www.tiktok.com' || h.endsWith('.tiktok.com')) return 'tiktok';
  if (h === 'x.com' || h.endsWith('.x.com') || h === 'twitter.com' || h.endsWith('.twitter.com')) return 'x';
  if (h === 'www.messenger.com' || h.endsWith('.messenger.com')) return 'messenger';
  if (h === 'www.reddit.com' || h === 'chat.reddit.com' || h.endsWith('.reddit.com')) return 'reddit';
  if (h === 'www.twitch.tv' || h.endsWith('.twitch.tv') || h === 'twitch.tv') return 'twitch';
  if (h === 'chatgpt.com' || h.endsWith('.chatgpt.com')) return 'chatgpt';
  if (h === 'gemini.google.com') return 'gemini';
  const customs = Array.isArray(currentSettings.customMediaApps) ? currentSettings.customMediaApps : [];
  for (let i = 0; i < customs.length; i++) {
    const c = customs[i];
    if (!c || !c.url) continue;
    try {
      const ch = new URL(c.url).hostname.toLowerCase();
      if (ch === h) return c.id || `custom-${i}`;
    } catch (_) {}
  }
  return '';
}

function isPersistentCacheableAppFrame(parsedUrl) {
  if (!parsedUrl || Date.now() < bypassPersistentCacheUntil) return false;
  if (parsedUrl.searchParams.has('pm_boot') || parsedUrl.searchParams.has('pm_reload')) return false;
  const h = (parsedUrl.hostname || '').toLowerCase();
  const p = (parsedUrl.pathname || '/').toLowerCase();
  if (
    h === 'accounts.google.com' ||
    h === 'mail.google.com' ||
    h === 'accounts.spotify.com' ||
    p === '/login' ||
    p.startsWith('/login/') ||
    p === '/signin' ||
    p.startsWith('/signin/') ||
    p === '/logout' ||
    p.startsWith('/logout/') ||
    p.startsWith('/oauth') ||
    p.startsWith('/auth/') ||
    p.startsWith('/i/flow/') ||
    p.startsWith('/accounts/login') ||
    p.startsWith('/challenge') ||
    p.startsWith('/checkpoint')
  ) {
    return false;
  }
  const matchedAppId = resolveAppIdForHostname(h);
  if (!matchedAppId) return false;
  return isAppAllowedForPersistence(matchedAppId);
}

function isAppAllowedForPersistence(appId) {
  if (!appId || appId === 'pocketmail') return false;
  const mode = currentSettings.persistenceMode || 'selected';
  if (mode === 'all') return true;
  if (mode === 'selected') {
    const list = Array.isArray(currentSettings.persistentAppIds)
      ? currentSettings.persistentAppIds
      : [];
    return list.includes(appId);
  }
  return false;
}

function isAppAllowedForBgAudio(appId) {
  if (!appId || appId === 'pocketmail') return false;
  if (currentSettings.keepAudioPlayingWhenClosed === false) return false;
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
      sp.videoEl.muted = true;
      sp.videoEl.volume = 0;
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
  const nx = bgNextSpPlayers.get(appId);
  if (nx) {
    bgNextSpPlayers.delete(appId);
    disposeSpPlayerInstance(nx);
  }
}

function removeBgAudioIframeOnly(appId) {
  const entry = bgAudioPool.get(appId);
  const bgPort = emeBridgePorts.get(`bg:${appId}`);
  if (bgPort) {
    try {
      bgPort.postMessage({ cmd: 'PREPARE_HANDOFF_UNLOAD' });
    } catch (_) {}
  }
  if (entry) {
    bgAudioPool.delete(appId);
    try {
      if (entry.frame && entry.frame.contentWindow) {
        entry.frame.contentWindow.postMessage(
          { target: 'pocketmail-media-frame', cmd: 'PREPARE_HANDOFF_UNLOAD' },
          '*'
        );
      }
    } catch (_) {}
    try {
      entry.frame.remove();
      entry.frame.src = 'about:blank';
    } catch (_) {}
  }
  try {
    const domFrames = document.querySelectorAll(`iframe[name="pm-bg-audio-${appId}"]`);
    for (const f of domFrames) {
      f.remove();
      f.src = 'about:blank';
    }
  } catch (_) {}
  const st = bgStagingSpPlayers.get(appId);
  if (st && st.sourceType === 'bg') {
    bgStagingSpPlayers.delete(appId);
    disposeSpPlayerInstance(st);
  }
  const nx = bgNextSpPlayers.get(appId);
  if (nx && nx.sourceType === 'bg') {
    bgNextSpPlayers.delete(appId);
    disposeSpPlayerInstance(nx);
  }
  if (bgAudioPool.size === 0) {
    updateToolbarBadge();
  }
}

function recordRecentSpGenReq(appId, initDataType, initData) {
  if (!appId || !initData) return;
  const prev = bgSpCachedMeta.get(appId) || {};
  const now = Date.now();
  const sig = `${initDataType || 'cenc'}:${new Uint8Array(initData).join(',')}`;
  const list = (prev.recentGenReqs || []).filter((r) => now - r.ts < 120000 && r.sig !== sig);
  list.push({ initDataType: initDataType || 'cenc', initData, sig, ts: now });
  bgSpCachedMeta.set(appId, { ...prev, recentGenReqs: list.slice(-8) });
}

function createSpPlayerInstance(appId, mime, msId = 0, isStaging = false, sourceType = 'sidebar') {
  const cached = bgSpCachedMeta.get(appId) || {};
  const now = Date.now();
  const isClear = appId !== 'spotify'; // YouTube MSE audio is unencrypted: no Widevine license needed
  const seededGenReqs = isClear
    ? []
    : (cached.recentGenReqs || [])
        .filter((r) => now - r.ts < 120000)
        .slice(-6)
        .map((r) => ({ initDataType: r.initDataType, initData: r.initData }));
  return {
    id: ++bgSpInstanceCounter,
    appId,
    isClear,
    msId: msId || 0,
    mime: mime || 'audio/mp4; codecs="mp4a.40.2"',
    isStaging: Boolean(isStaging),
    isNextPreload: false,
    createdAt: now,
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
    pendingSeekTarget: 0,
    pendingSeekSetAt: 0,
    pendingSeekIsUserScrub: false,
    maxObservedCt: 0,
    isExplicitUserScrub: false,
    explicitUserScrubUntil: 0,
    trackDuration: 0,
    trackTitle: '',
    desiredVolume: 1.0,
    desiredMuted: false,
    remotePaused: false,
    explicitUserPause: false,
    lastPlayedAt: 0,
    lastObservedCt: 0,
    lastTimeAdvanceAt: now,
    lastStarveNudgeAt: 0,
    retireBgWhenBuffered: false,
    retireBgTimer: null,
    lastSeekSentAt: 0,
    seekAttempts: 0,
    skipNextSentAt: 0
  };
}

function isTimeInSpBuffered(sp, t) {
  if (!sp || !sp.sb || !sp.sb.buffered || sp.sb.buffered.length === 0) return false;
  for (let i = 0; i < sp.sb.buffered.length; i++) {
    if (t >= sp.sb.buffered.start(i) - 0.15 && t <= sp.sb.buffered.end(i) - 0.02) {
      return true;
    }
  }
  return false;
}

function getSpBufferedEnd(sp) {
  if (!sp || !sp.sb || !sp.sb.buffered || sp.sb.buffered.length === 0) return 0;
  return sp.sb.buffered.end(sp.sb.buffered.length - 1);
}

// Opera GX-style Auto-Pause & Auto-Resume state (declared before EME/MSE helpers so every path honors it)
let isAutoPausedByTabAudio = false;
let manualOverrideWhileTabAudible = false;
let lastExternalTabAudioCheckAt = 0;
let pendingTabResumeTimer = null;
let silentMediaRecheckTimer = null;
const knownActiveMediaTabIds = new Set();
const recentlyStoppedMediaTabMap = new Map(); // tabId -> stoppedAt
const silentTabHoldSince = new Map(); // tabId -> firstSeenSilentAt
const audibleOverrideTabIds = new Set();
const tabAutoPausedSpAppIds = new Set();
const tabAutoPausedMseAppIds = new Set();

function setTabAudioPauseTrigger(active, stayStopped = false) {
  const nextActive = Boolean(active);
  isAutoPausedByTabAudio = nextActive;
  try {
    window.__pmTabAudioPauseTrigger = nextActive;
    window.localStorage.setItem('__pm_tab_audio_trigger', nextActive ? '1' : '0');
  } catch (_) {}
  try {
    browser.storage.local
      .set({
        pmTabAudioTrigger: {
          active: nextActive,
          stayStopped: Boolean(stayStopped),
          ts: Date.now()
        }
      })
      .catch(() => {});
  } catch (_) {}
}

function isExternalBrowserTab(t) {
  if (!t) return false;
  if (t.mutedInfo && t.mutedInfo.muted) return false;
  if (t.windowId && (companionWindowIds.has(t.windowId) || t.windowId === activeLoginWindowId)) return false;
  const url = String(t.url || '');
  if (url.startsWith('moz-extension://')) return false;
  return true;
}

function getTabAudioBehavior() {
  if (
    currentSettings.tabAudioBehavior === 'pause-resume' ||
    currentSettings.tabAudioBehavior === 'pause-only' ||
    currentSettings.tabAudioBehavior === 'off'
  ) {
    return currentSettings.tabAudioBehavior;
  }
  return currentSettings.autoPauseOnTabAudio === false ? 'off' : 'pause-resume';
}

function isTabAutoPauseEnforced() {
  return Boolean(isAutoPausedByTabAudio && getTabAudioBehavior() !== 'off');
}

function promoteNextSpPlayer(appId, initialTargetTime = 0) {
  const nextSp = bgNextSpPlayers.get(appId);
  if (!nextSp || nextSp.disposed) return false;
  const activeSp = bgSpEmePlayers.get(appId);
  bgNextSpPlayers.delete(appId);

  nextSp.isStaging = false;
  nextSp.isNextPreload = false;
  nextSp.awaitingBgFrameHandoff = false;
  nextSp.desiredVolume = activeSp && activeSp.desiredVolume > 0 ? activeSp.desiredVolume : 1.0;
  nextSp.desiredMuted = Boolean(activeSp && activeSp.desiredMuted);
  if (initialTargetTime > 0) {
    nextSp.targetTime = initialTargetTime;
    nextSp.pendingSeekTarget = initialTargetTime;
    nextSp.pendingSeekSetAt = Date.now();
  }
  if (nextSp.videoEl) {
    nextSp.videoEl.muted = isTabAutoPauseEnforced() ? true : nextSp.desiredMuted;
    nextSp.videoEl.volume = nextSp.desiredVolume;
    nextSp.videoEl.playbackRate = 1.0;
  }

  bgSpEmePlayers.set(appId, nextSp);
  if (isTabAutoPauseEnforced()) {
    nextSp.remotePaused = true;
    if (getTabAudioBehavior() === 'pause-resume') {
      nextSp.autoPausedByTab = true;
      tabAutoPausedSpAppIds.add(appId);
    }
    if (nextSp.videoEl) {
      nextSp.videoEl.muted = true;
      if (!nextSp.videoEl.paused) {
        try {
          nextSp.videoEl.pause();
        } catch (_) {}
      }
    }
  } else {
    nextSp.remotePaused = false;
    syncSpInstanceTimeAndPlay(nextSp, initialTargetTime > 0);
  }

  if (activeSp && activeSp !== nextSp) {
    clearTimeout(activeSp.retireBgTimer);
    disposeSpPlayerInstance(activeSp);
  }
  logAudioDiag('promote-next-track', {
    appId,
    trackTitle: nextSp.trackTitle || '',
    msId: nextSp.msId || 0,
    initialTargetTime
  });
  return true;
}

function syncSpInstanceTimeAndPlay(sp, forceSeek = false, isExplicitUserScrub = false) {
  if (!sp || sp.disposed || !sp.videoEl) return;
  try {
    const isUserScrub = Boolean(
      forceSeek ||
      isExplicitUserScrub ||
      (sp.explicitUserScrubUntil && Date.now() < sp.explicitUserScrubUntil) ||
      sp.pendingSeekIsUserScrub
    );
    const ct = Number(sp.videoEl.currentTime) || 0;
    if (!sp.maxObservedCt || ct > sp.maxObservedCt) {
      sp.maxObservedCt = ct;
    }

    if (sp.sb && sp.sb.buffered && sp.sb.buffered.length > 0) {
      const inBuffered = isTimeInSpBuffered(sp, ct);
      const bufStart0 = sp.sb.buffered.start(0);
      const bufEnd = getSpBufferedEnd(sp);

      // 1. Honor explicit user/handoff seek target once its fMP4 segment arrives in SourceBuffer
      if (forceSeek && sp.targetTime >= 0) {
        if (isTimeInSpBuffered(sp, sp.targetTime)) {
          const allowSeek = isUserScrub || sp.targetTime >= ct - 0.05;
          if (allowSeek) {
            if (Math.abs(ct - sp.targetTime) > 0.35) {
              sp.videoEl.currentTime = sp.targetTime;
              if (isUserScrub) {
                sp.maxObservedCt = sp.targetTime;
              }
            }
          } else {
            logAudioDiag('clamp-backward-seek-target', {
              appId: sp.appId,
              targetTime: Math.round(sp.targetTime * 100) / 100,
              ct: Math.round(ct * 100) / 100,
              maxObservedCt: Math.round((sp.maxObservedCt || 0) * 100) / 100
            });
          }
          sp.pendingSeekTarget = 0;
          sp.pendingSeekSetAt = 0;
          sp.pendingSeekIsUserScrub = false;
          sp.explicitUserScrubUntil = 0;
        } else {
          if (isUserScrub || sp.targetTime >= ct - 0.05) {
            sp.pendingSeekTarget = sp.targetTime;
            sp.pendingSeekSetAt = Date.now();
            sp.pendingSeekIsUserScrub = isUserScrub;
          } else {
            sp.pendingSeekTarget = 0;
            sp.pendingSeekSetAt = 0;
            sp.pendingSeekIsUserScrub = false;
          }
        }
      } else if (sp.pendingSeekTarget > 0 && Date.now() - (sp.pendingSeekSetAt || 0) < 8500) {
        if (isTimeInSpBuffered(sp, sp.pendingSeekTarget)) {
          const allowPending = sp.pendingSeekIsUserScrub || isUserScrub || sp.pendingSeekTarget >= ct - 0.05;
          if (allowPending) {
            if (Math.abs(ct - sp.pendingSeekTarget) > 0.08) {
              sp.videoEl.currentTime = sp.pendingSeekTarget;
              if (sp.pendingSeekIsUserScrub || isUserScrub) {
                sp.maxObservedCt = sp.pendingSeekTarget;
              }
            }
          } else {
            logAudioDiag('discard-stale-pending-seek', {
              appId: sp.appId,
              pendingSeekTarget: Math.round(sp.pendingSeekTarget * 100) / 100,
              ct: Math.round(ct * 100) / 100
            });
          }
          sp.pendingSeekTarget = 0;
          sp.pendingSeekSetAt = 0;
          sp.pendingSeekIsUserScrub = false;
        }
      } else if (!inBuffered) {
        // 2. ONLY snap forward — NEVER jump backwards to an older anchor range!
        if (ct < bufStart0 - 0.25) {
          if (sp.targetTime >= bufStart0 && isTimeInSpBuffered(sp, sp.targetTime)) {
            sp.videoEl.currentTime = sp.targetTime;
          } else {
            sp.videoEl.currentTime = bufStart0 + 0.02;
          }
        } else {
          // Check if there is a forward buffered segment just ahead of a micro-gap (e.g. fMP4 boundary or post-seek range)
          let bridgedForward = false;
          for (let i = 0; i < sp.sb.buffered.length; i++) {
            const rStart = sp.sb.buffered.start(i);
            const rEnd = sp.sb.buffered.end(i);
            if (rStart > ct && rStart - ct <= 2.8 && rEnd > rStart + 0.08) {
              sp.videoEl.currentTime = rStart + 0.02;
              bridgedForward = true;
              break;
            }
          }
          if (!bridgedForward && !sp.isStaging && sp.appId === 'spotify' && bufEnd > 2 && ct >= bufEnd - 0.12) {
            const nextSp = bgNextSpPlayers.get(sp.appId);
            const nearTrackEnd = !sp.trackDuration || ct >= sp.trackDuration - 2.0;
            if (
              nextSp &&
              !nextSp.disposed &&
              nextSp.hasLicense &&
              nextSp.sb &&
              nextSp.sb.buffered &&
              nextSp.sb.buffered.length > 0 &&
              nearTrackEnd
            ) {
              promoteNextSpPlayer(sp.appId, 0);
              return;
            }
          }
        }
      } else if (sp.sb.buffered.length > 1) {
        // Also bridge when Gecko's AAC decoder stalls 1-3 frames (~0.02-0.08s) before the end of an earlier range right before a micro-gap
        for (let i = 0; i < sp.sb.buffered.length - 1; i++) {
          const rEnd = sp.sb.buffered.end(i);
          const nextStart = sp.sb.buffered.start(i + 1);
          const nextEnd = sp.sb.buffered.end(i + 1);
          if (
            ct >= rEnd - 0.09 &&
            ct <= rEnd + 0.05 &&
            nextStart > rEnd &&
            nextStart - rEnd <= 2.8 &&
            nextEnd > nextStart + 0.08 &&
            (sp.targetTime >= nextStart - 0.05 || ct >= rEnd - 0.02)
          ) {
            sp.videoEl.currentTime = nextStart + 0.02;
            break;
          }
        }
      }
    } else if (forceSeek && sp.targetTime > 0) {
      const allowSeek = isUserScrub || sp.targetTime >= ct - 0.05;
      if (allowSeek) {
        sp.pendingSeekTarget = sp.targetTime;
        sp.pendingSeekSetAt = Date.now();
        sp.pendingSeekIsUserScrub = isUserScrub;
        if (sp.videoEl.readyState >= 1) {
          sp.videoEl.currentTime = sp.targetTime;
          if (isUserScrub) {
            sp.maxObservedCt = sp.targetTime;
          }
        }
      }
    }
    if (!sp.isStaging && isTabAutoPauseEnforced()) {
      sp.remotePaused = true;
      if (getTabAudioBehavior() === 'pause-resume') {
        sp.autoPausedByTab = true;
        if (sp.appId) tabAutoPausedSpAppIds.add(sp.appId);
      }
      sp.videoEl.muted = true;
      if (!sp.videoEl.paused) {
        sp.videoEl.pause();
      }
      return;
    }
    if (!sp.isStaging && !sp.remotePaused) {
      sp.lastPlayedAt = Date.now();
      sp.videoEl.muted = Boolean(sp.desiredMuted);
      if (sp.desiredVolume > 0) {
        sp.videoEl.volume = sp.desiredVolume;
      }
      if (sp.videoEl.playbackRate !== 1.0 && !sp.isClear) {
        sp.videoEl.playbackRate = 1.0;
      }
      if (sp.videoEl.paused) {
        sp.lastTimeAdvanceAt = Date.now();
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
    if (isTabAutoPauseEnforced()) {
      sp.remotePaused = true;
      if (getTabAudioBehavior() === 'pause-resume') {
        sp.autoPausedByTab = true;
        if (sp.appId) tabAutoPausedSpAppIds.add(sp.appId);
      }
      v.muted = true;
      if (!v.paused) {
        v.pause();
      }
      return;
    }
    if (!sp.remotePaused) {
      sp.lastPlayedAt = Date.now();
      v.muted = Boolean(sp.desiredMuted);
    }
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

function postSpSeekToSource(appId, sourceType, t, forceHarmonySeek = false) {
  let deliveredViaPort = false;
  const directPort = emeBridgePorts.get(`${sourceType}:${appId}`);
  if (directPort) {
    try {
      directPort.postMessage({ cmd: 'SEEK_SP_MEDIA', currentTime: t, forceHarmonySeek: Boolean(forceHarmonySeek) });
      deliveredViaPort = true;
    } catch (_) {
      emeBridgePorts.delete(`${sourceType}:${appId}`);
    }
  }
  if (sourceType === 'sidebar') {
    browser.runtime
      .sendMessage({ type: 'PM_SEEK_SIDEBAR_SP', appId, currentTime: t, forceHarmonySeek: Boolean(forceHarmonySeek) })
      .catch(() => {});
    return true;
  }
  const bgEntry = bgAudioPool.get(appId);
  if (bgEntry && bgEntry.frame && bgEntry.frame.contentWindow) {
    try {
      bgEntry.frame.contentWindow.postMessage(
        {
          target: 'pocketmail-media-frame',
          cmd: 'SEEK_SP_MEDIA',
          currentTime: t,
          forceHarmonySeek: Boolean(forceHarmonySeek)
        },
        '*'
      );
    } catch (_) {}
  }
  return deliveredViaPort;
}

function postSpSkipNextToSource(appId, sourceType) {
  const directPort = emeBridgePorts.get(`${sourceType}:${appId}`);
  if (directPort) {
    try {
      directPort.postMessage({ cmd: 'SKIP_NEXT_SP_TRACK' });
    } catch (_) {
      emeBridgePorts.delete(`${sourceType}:${appId}`);
    }
  }
  if (sourceType === 'sidebar') {
    browser.runtime.sendMessage({ type: 'PM_SKIP_SIDEBAR_SP', appId }).catch(() => {});
    return;
  }
  const bgEntry = bgAudioPool.get(appId);
  if (bgEntry && bgEntry.frame && bgEntry.frame.contentWindow) {
    try {
      bgEntry.frame.contentWindow.postMessage(
        { target: 'pocketmail-media-frame', cmd: 'SKIP_NEXT_SP_TRACK' },
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
  const isDifferentTrack = Boolean(
    activeSp &&
      stagingSp.trackTitle &&
      activeSp.trackTitle &&
      stagingSp.trackTitle !== activeSp.trackTitle
  );
  const activeIsAlive = Boolean(
    activeSp && activeSp.videoEl && !activeSp.disposed
  );
  const liveCt =
    syncFromActive && !isDifferentTrack && activeIsAlive
      ? Number(activeSp.videoEl.currentTime) || 0
      : 0;

  let shouldForceSeek = false;
  if (liveCt > 0 && isTimeInSpBuffered(stagingSp, liveCt)) {
    // Exact 0.00s alignment: align directly to liveCt at the instant of swap!
    let exactCt = liveCt;
    if (stagingSp.sb && stagingSp.sb.buffered) {
      for (let i = 0; i < stagingSp.sb.buffered.length; i++) {
        const bStart = stagingSp.sb.buffered.start(i);
        const bEnd = stagingSp.sb.buffered.end(i);
        if (liveCt >= bStart - 0.15 && liveCt <= bEnd - 0.02) {
          exactCt = Math.max(liveCt, bStart);
          break;
        }
      }
    }
    stagingSp.targetTime = exactCt;
    stagingSp.pendingSeekTarget = 0;
    if (stagingSp.videoEl) {
      try {
        stagingSp.videoEl.currentTime = exactCt;
      } catch (_) {}
    }
    shouldForceSeek = false;
  } else if (activeIsAlive && !isDifferentTrack && liveCt > 0) {
    // Defend against premature fallback: if activeSp is alive on the same track, NEVER rewind to buffer start!
    let forwardRange = null;
    if (stagingSp.sb && stagingSp.sb.buffered) {
      for (let i = 0; i < stagingSp.sb.buffered.length; i++) {
        const bStart = stagingSp.sb.buffered.start(i);
        const bEnd = stagingSp.sb.buffered.end(i);
        if (bStart > liveCt && bStart - liveCt <= 3.0 && bEnd > bStart + 0.08) {
          forwardRange = bStart + 0.02;
          break;
        }
      }
    }
    if (forwardRange !== null) {
      stagingSp.targetTime = forwardRange;
      stagingSp.pendingSeekTarget = 0;
      if (stagingSp.videoEl) {
        try {
          stagingSp.videoEl.currentTime = forwardRange;
        } catch (_) {}
      }
      shouldForceSeek = false;
    } else {
      stagingSp.targetTime = liveCt;
      stagingSp.pendingSeekTarget = 0;
      shouldForceSeek = false;
    }
  } else if (stagingSp.targetTime > 0 && isTimeInSpBuffered(stagingSp, stagingSp.targetTime)) {
    shouldForceSeek = true;
  } else if (stagingSp.sb && stagingSp.sb.buffered && stagingSp.sb.buffered.length > 0) {
    // Only fall back to buffer start if starting fresh or on a different track
    stagingSp.targetTime = stagingSp.sb.buffered.start(0) + 0.02;
    shouldForceSeek = true;
  }

  if (stagingSp.isClear && liveCt > 0.5) {
    stagingSp.syncHoldUntil = Date.now() + 1800;
    stagingSp.minSyncFrameTime = Math.max(0, liveCt - 1.5);
  }

  stagingSp.isStaging = false;
  stagingSp.awaitingBgFrameHandoff = false;
  stagingSp.desiredVolume = activeSp && activeSp.desiredVolume > 0 ? activeSp.desiredVolume : 1.0;
  stagingSp.desiredMuted = Boolean(activeSp && activeSp.desiredMuted);
  if (stagingSp.videoEl) {
    stagingSp.videoEl.muted = isTabAutoPauseEnforced() ? true : stagingSp.desiredMuted;
    stagingSp.videoEl.volume = stagingSp.desiredVolume;
    stagingSp.videoEl.playbackRate = 1.0;
  }

  bgSpEmePlayers.set(appId, stagingSp);
  bgStagingSpPlayers.delete(appId);
  if (isTabAutoPauseEnforced() || (activeSp && activeSp.autoPausedByTab && isAutoPausedByTabAudio)) {
    stagingSp.remotePaused = true;
    if (getTabAudioBehavior() === 'pause-resume') {
      stagingSp.autoPausedByTab = true;
      tabAutoPausedSpAppIds.add(appId);
    }
    if (stagingSp.videoEl) {
      stagingSp.videoEl.muted = true;
      if (!stagingSp.videoEl.paused) {
        try {
          stagingSp.videoEl.pause();
        } catch (_) {}
      }
    }
  } else {
    syncSpInstanceTimeAndPlay(stagingSp, shouldForceSeek);
  }

  if (stagingSp.sourceType === 'sidebar' && bgAudioPool.has(appId)) {
    removeBgAudioIframeOnly(appId);
  }

  if (activeSp && activeSp !== stagingSp) {
    clearTimeout(activeSp.retireBgTimer);
    disposeSpPlayerInstance(activeSp);
  }
  logAudioDiag('promote-staging', {
    appId,
    sourceType: stagingSp.sourceType,
    liveCt: Math.round(liveCt * 100) / 100,
    targetTime: Math.round((stagingSp.targetTime || 0) * 100) / 100,
    isDifferentTrack
  });
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
    (activeSp.videoEl.paused && !isTabAutoPauseEnforced() && !activeSp.autoPausedByTab) ||
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

  const liveCt = activeSp && activeSp.videoEl ? Number(activeSp.videoEl.currentTime) || 0 : 0;
  const isDifferentTrack = Boolean(
    activeSp &&
      stagingSp.trackTitle &&
      activeSp.trackTitle &&
      stagingSp.trackTitle !== activeSp.trackTitle
  );

  // If the taking-over Spotify player already advanced to the next song in the playlist, promote cleanly at 0:00 of the new song!
  if (isDifferentTrack) {
    if (stagingSp.sourceType === 'sidebar' && bgAudioPool.has(appId)) {
      removeBgAudioIframeOnly(appId);
    }
    promoteStagingSpPlayer(appId, false);
    return;
  }

  // If activeSp reached the end of the current track while stagingSp booted on the old checkpoint of the SAME track,
  // instruct the taking-over Spotify player to skip forward to the next track in the playlist instead of restarting Song 1!
  if (
    !stagingSp.isClear &&
    activeSp &&
    activeSp.trackDuration > 15 &&
    liveCt >= activeSp.trackDuration - 2.2 &&
    getSpBufferedEnd(stagingSp) < Math.max(25, liveCt - 15) &&
    (!stagingSp.skipNextSentAt || Date.now() - stagingSp.skipNextSentAt > 3500)
  ) {
    stagingSp.skipNextSentAt = Date.now();
    postSpSkipNextToSource(appId, stagingSp.sourceType);
    if (!activeDeadOrNearEnd) {
      return;
    }
  }

  // If stagingSp booted at an older checkpoint (e.g. 0:00 when liveCt is 120s), seek Harmony in the taking-over frame
  // BEFORE promoting so playback continues seamlessly from 120s instead of restarting from initial open position!
  const needsHarmonyAlignment =
    liveCt > 2.5 && !isTimeInSpBuffered(stagingSp, liveCt);
  if (needsHarmonyAlignment) {
    const now = Date.now();
    const confirmedSeeks = stagingSp.seekConfirmedCount || 0;
    const rawAttempts = stagingSp.seekAttempts || 0;
    const retryDelayMs = confirmedSeeks > 0 ? 1800 : 850;
    if (
      !stagingSp.lastSeekSentAt ||
      (now - stagingSp.lastSeekSentAt > retryDelayMs && confirmedSeeks < 4 && rawAttempts < 12)
    ) {
      const aheadSec = Math.max(1.5, Math.min(3.0, (now - (stagingSp.licensedAt || now)) * 0.001 + 1.2));
      const sentOk = postSpSeekToSource(appId, stagingSp.sourceType, liveCt + aheadSec, true);
      if (sentOk) {
        stagingSp.lastSeekSentAt = now;
        stagingSp.seekAttempts = rawAttempts + 1;
      }
    }
    const maxStagingWaitMs = stagingSp.isClear ? 3500 : 9500;
    const timedOut = stagingSp.licensedAt > 0 && now - stagingSp.licensedAt > maxStagingWaitMs;
    const activeIsPlaying = Boolean(
      activeSp &&
        !activeSp.disposed &&
        activeSp.videoEl &&
        !activeSp.videoEl.paused &&
        !activeSp.videoEl.ended
    );
    if (activeIsPlaying || (!activeDeadOrNearEnd && !timedOut)) {
      return;
    }
  }

  if (stagingSp.sourceType === 'sidebar' && bgAudioPool.has(appId)) {
    removeBgAudioIframeOnly(appId);
  }
  promoteStagingSpPlayer(appId, true);
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
            logAudioDiag('eme-license-retry', {
              appId: sp.appId,
              status: resp.status,
              sourceType: sp.sourceType
            });
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
          if (sp.isStaging && !sp.isNextPreload) {
            checkAndPromoteStagingSpPlayer(sp.appId);
          } else if (!sp.isNextPreload) {
            syncSpInstanceTimeAndPlay(sp);
          } else {
            // If activeSp already finished its buffer while nextSp was waiting for Widevine license, promote immediately!
            const activeSp = bgSpEmePlayers.get(sp.appId);
            if (
              activeSp &&
              activeSp.videoEl &&
              (activeSp.videoEl.ended ||
                (getSpBufferedEnd(activeSp) > 2 &&
                  (activeSp.videoEl.currentTime || 0) >= getSpBufferedEnd(activeSp) - 0.15))
            ) {
              promoteNextSpPlayer(sp.appId, 0);
            }
          }
        } catch (err) {
          sp.lastGenErr = String(err);
          sp.processedInitDataKeys.delete(keySig);
          logAudioDiag('eme-license-err', {
            appId: sp.appId,
            sourceType: sp.sourceType,
            err: String(err)
          });
        }
      });
      await sess.generateRequest(req.initDataType, req.initData);
    } catch (err) {
      sp.lastGenErr = String(err);
      logAudioDiag('eme-gen-err', {
        appId: sp.appId,
        sourceType: sp.sourceType,
        err: String(err)
      });
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
              // Immediately purge any stale pre-seek disjoint anchor range (e.g. [0..15s] left behind after seeking to [50..85s])
              if (sp.videoEl && !sb.updating && sb.buffered.length > 1) {
                const ctNow = sp.videoEl.currentTime || 0;
                const lastRangeStart = sb.buffered.start(sb.buffered.length - 1);
                const firstRangeStart = sb.buffered.start(0);
                const firstRangeEnd = sb.buffered.end(0);
                if (ctNow >= lastRangeStart - 0.5 && firstRangeEnd < ctNow - 4.0) {
                  try {
                    sb.remove(firstRangeStart, Math.max(firstRangeEnd + 0.5, ctNow - 3.0));
                    return;
                  } catch (_) {}
                }
              }
              // Proactively evict buffered audio more than 32s behind playback head so long sessions stay tiny in RAM
              if (
                sp.videoEl &&
                sp.videoEl.currentTime > 42 &&
                !sb.updating &&
                sb.buffered.length > 0 &&
                sp.videoEl.currentTime - sb.buffered.start(0) > 32
              ) {
                try {
                  sb.remove(sb.buffered.start(0), sp.videoEl.currentTime - 15);
                  return;
                } catch (_) {}
              }
              drainSpInstanceQueue(sp);
              if (!sp.isStaging && sp.retireBgWhenBuffered && sp.videoEl) {
                const rem = getSpBufferedEnd(sp) - (sp.videoEl.currentTime || 0);
                if (rem >= 5.5) {
                  sp.retireBgWhenBuffered = false;
                  clearTimeout(sp.retireBgTimer);
                  logAudioDiag('retire-bg-after-buffer', {
                    appId: sp.appId,
                    rem: Math.round(rem * 100) / 100
                  });
                  if (bgAudioPool.has(sp.appId)) {
                    removeBgAudioIframeOnly(sp.appId);
                  }
                }
              }
              if (sp.isStaging && !sp.isNextPreload) {
                checkAndPromoteStagingSpPlayer(sp.appId);
              } else if (!sp.isNextPreload) {
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
      v.autoplay = false;
      v.muted = sp.isStaging || sp.isNextPreload || isTabAutoPauseEnforced() ? true : sp.desiredMuted;
      v.volume = sp.isStaging || sp.isNextPreload ? 0 : sp.desiredVolume;
      v.addEventListener('ended', () => {
        if (!sp.disposed && !sp.isStaging && !sp.isNextPreload && bgSpEmePlayers.get(sp.appId) === sp) {
          if (bgNextSpPlayers.has(sp.appId)) {
            promoteNextSpPlayer(sp.appId, 0);
          }
        }
      });
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

function isSpActivelyPlayingCurrentTrack(sp) {
  if (!sp || sp.disposed || !sp.videoEl) return false;
  if (sp.videoEl.paused || sp.videoEl.ended) return false;
  const bufEnd = getSpBufferedEnd(sp);
  const ct = Number(sp.videoEl.currentTime) || 0;
  return bufEnd - ct > 0.35;
}

function ensureNextSpEmePlayer(appId, mime = 'audio/mp4; codecs="mp4a.40.2"', newMsId = 0, sourceType = 'sidebar') {
  let nx = bgNextSpPlayers.get(appId);
  const effectiveMime = mime || 'audio/mp4; codecs="mp4a.40.2"';
  if (!nx || nx.disposed) {
    nx = createSpPlayerInstance(appId, effectiveMime, newMsId, true, sourceType);
    nx.isNextPreload = true;
    bgNextSpPlayers.set(appId, nx);
    return initSpPlayerInstance(nx);
  }
  nx.sourceType = sourceType;
  if (newMsId && !nx.msId) {
    nx.msId = newMsId;
  } else if (newMsId && nx.msId && newMsId !== nx.msId) {
    disposeSpPlayerInstance(nx);
    nx = createSpPlayerInstance(appId, effectiveMime, newMsId, true, sourceType);
    nx.isNextPreload = true;
    bgNextSpPlayers.set(appId, nx);
    return initSpPlayerInstance(nx);
  }
  return initSpPlayerInstance(nx);
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
    // Gapless Preload Guard: if Spotify Harmony creates a second MediaSource ~20s before Song 1 ends,
    // stage Song 2 in bgNextSpPlayers instead of killing Song 1 early!
    if (appId === 'spotify' && isSpActivelyPlayingCurrentTrack(sp)) {
      return ensureNextSpEmePlayer(appId, effectiveMime, newMsId, sourceType);
    }
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

  if (bt === 'BRIDGE_HELLO') {
    if (sourceType === 'standby') return;
    const helloStaging = bgStagingSpPlayers.get(appId);
    if (helloStaging && helloStaging.sourceType === sourceType) {
      helloStaging.lastSeekSentAt = 0;
    }
    if (isTabAutoPauseEnforced()) {
      const stayStopped = getTabAudioBehavior() === 'pause-only';
      const pauseCmd = stayStopped ? 'PAUSE_LOCAL_MEDIA' : 'TAB_AUDIO_AUTO_PAUSE';
      const directPort = emeBridgePorts.get(`${sourceType}:${appId}`);
      if (directPort) {
        try {
          directPort.postMessage({ cmd: pauseCmd, markShouldResume: !stayStopped });
        } catch (_) {}
      }
      const bgEntryForPause = bgAudioPool.get(appId);
      const bgFrameForPause = bgEntryForPause && (bgEntryForPause.frame || bgEntryForPause.iframe);
      if (bgFrameForPause && bgFrameForPause.contentWindow) {
        try {
          bgFrameForPause.contentWindow.postMessage(
            { target: 'pocketmail-media-frame', cmd: pauseCmd, markShouldResume: !stayStopped },
            '*'
          );
        } catch (_) {}
      }
    }
    return;
  }

  if (bt === 'SEEK_ACK') {
    const ackSt = bgStagingSpPlayers.get(appId);
    if (ackSt && ackSt.sourceType === sourceType && data.executed) {
      ackSt.seekConfirmedCount = (ackSt.seekConfirmedCount || 0) + 1;
    }
    return;
  }

  if (bt === 'USER_INTERACTION') {
    if (data.isSeekBar) {
      const sp = bgSpEmePlayers.get(appId);
      if (sp) {
        sp.isExplicitUserScrub = true;
        sp.explicitUserScrubUntil = Date.now() + 3000;
      }
      const st = bgStagingSpPlayers.get(appId);
      if (st) {
        st.isExplicitUserScrub = true;
        st.explicitUserScrubUntil = Date.now() + 3000;
      }
    }
    if (sourceType === 'sidebar' && bgAudioPool.has(appId)) {
      const bgPort = emeBridgePorts.get(`bg:${appId}`);
      if (bgPort) {
        try {
          bgPort.postMessage({ cmd: 'MARK_USER_GESTURE', isSeekBar: Boolean(data.isSeekBar) });
        } catch (_) {}
      }
      const bgEntry = bgAudioPool.get(appId);
      if (bgEntry && bgEntry.frame && bgEntry.frame.contentWindow) {
        try {
          bgEntry.frame.contentWindow.postMessage(
            { target: 'pocketmail-media-frame', cmd: 'MARK_USER_GESTURE', isSeekBar: Boolean(data.isSeekBar) },
            '*'
          );
        } catch (_) {}
      }
    }
    return;
  }

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
    logAudioDiag('stop-playback', {
      appId,
      sourceType,
      explicitStop: Boolean(data.explicitStop),
      href: data.href || ''
    });
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
    if (
      data.href &&
      !data.href.includes('pm_boot=1') &&
      (isAppAllowedForPersistence(appId) || isAppAllowedForBgAudio(appId))
    ) {
      if (!currentSettings.persistentSavedAppUrls) currentSettings.persistentSavedAppUrls = {};
      currentSettings.persistentSavedAppUrls[appId] = data.href;
    }
    refreshBgAudioIndicator();
    return;
  }

  if (bt === 'USER_PLAY_INTENT') {
    if (isAutoPausedByTabAudio || knownActiveMediaTabIds.size > 0) {
      manualOverrideWhileTabAudible = true;
      audibleOverrideTabIds.clear();
      knownActiveMediaTabIds.forEach((tid) => audibleOverrideTabIds.add(tid));
      if (browser.tabs && typeof browser.tabs.query === 'function') {
        browser.tabs
          .query({ audible: true })
          .then((tabs) => {
            (tabs || []).forEach((t) => {
              if (t && typeof t.id === 'number' && t.audible && isExternalBrowserTab(t)) {
                audibleOverrideTabIds.add(t.id);
              }
            });
          })
          .catch(() => {});
      }
      if (isAutoPausedByTabAudio) {
        setTabAudioPauseTrigger(false, false);
        browser.runtime
          .sendMessage({
            type: 'PM_TAB_AUDIO_AUTO_PAUSE_STATE',
            autoPaused: false
          })
          .catch(() => {});
      }
      logAudioDiag('tab-manual-override', {
        appId,
        sourceType,
        overriddenTabs: Array.from(audibleOverrideTabIds)
      });
    }
    tabAutoPausedSpAppIds.delete(appId);
    const curStaging = bgStagingSpPlayers.get(appId);
    if (curStaging && getSpBufferedEnd(curStaging) > 0) {
      promoteStagingSpPlayer(appId, false);
    }
    if (sourceType === 'sidebar' && bgAudioPool.has(appId)) {
      removeBgAudioIframeOnly(appId);
    } else if (appId === 'spotify' && bgAudioPool.has('spotify')) {
      const bgPort = emeBridgePorts.get('bg:spotify');
      if (bgPort) {
        try {
          bgPort.postMessage({ cmd: 'RESUME_BG_SP_MEDIA' });
        } catch (_) {}
      }
      const bgEntry = bgAudioPool.get('spotify');
      if (bgEntry && bgEntry.frame && bgEntry.frame.contentWindow) {
        try {
          bgEntry.frame.contentWindow.postMessage(
            { target: 'pocketmail-media-frame', cmd: 'RESUME_BG_SP_MEDIA' },
            '*'
          );
        } catch (_) {}
      }
    }
    const activeSp = bgSpEmePlayers.get(appId);
    if (activeSp && !activeSp.disposed) {
      activeSp.awaitingBgFrameHandoff = false;
      activeSp.autoPausedByTab = false;
      activeSp.remotePaused = false;
      activeSp.explicitUserPause = false;
      activeSp.lastPlayedAt = Date.now();
      syncSpInstanceTimeAndPlay(activeSp);
    }
    logAudioDiag('user-play-intent', { appId, sourceType });
    refreshBgAudioIndicator();
    return;
  }

  if (sourceType === 'sidebar') {
    if (bt === 'MSE_INIT') {
      sidebarHasAppendedSpChunks.set(appId, false);
    } else if (bt === 'MSE_CHUNK') {
      sidebarHasAppendedSpChunks.set(appId, true);
    }
  }

  // If the sidebar frame for this app is actively streaming MSE/EME or playing, transition takeover from bgAudioPool to sidebar
  // so two open.spotify.com Harmony instances never compete on the same Spotify Connect account!
  const shouldTransitionBgToSidebar =
    sourceType === 'sidebar' &&
    bgAudioPool.has(appId) &&
    (bt === 'MSE_INIT' || bt === 'GEN_REQ' || bt === 'MSE_CHUNK' || (bt === 'SYNC_TIME' && !data.paused));
  if (shouldTransitionBgToSidebar) {
    const activeSp = bgSpEmePlayers.get(appId);
    if (activeSp && !activeSp.disposed) {
      activeSp.awaitingBgFrameHandoff = true;
      activeSp.handoffStartedAt = Date.now();
      activeSp.handoffSource = 'sidebar';
      if (!isTabAutoPauseEnforced()) {
        activeSp.remotePaused = false;
      }
      const remBuf = getSpBufferedEnd(activeSp) - (Number(activeSp.videoEl?.currentTime) || 0);
      if (appId !== 'spotify') {
        activeSp.retireBgWhenBuffered = false;
        clearTimeout(activeSp.retireBgTimer);
        removeBgAudioIframeOnly(appId);
      } else {
        // Defer background iframe retirement for Spotify until stagingSp promotes in checkAndPromoteStagingSpPlayer
        activeSp.retireBgWhenBuffered = false;
        clearTimeout(activeSp.retireBgTimer);
      }
    } else {
      removeBgAudioIframeOnly(appId);
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
    const nextSp = bgNextSpPlayers.get(appId);
    if (nextSp && !nextSp.disposed) {
      nextSp.serverCert = certBuf;
      if (nextSp.mk) nextSp.mk.setServerCertificate(certBuf).catch(() => {});
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
    const nextSp = bgNextSpPlayers.get(appId);
    if (nextSp && !nextSp.disposed) {
      nextSp.licAuth = licAuth;
      processSpInstanceGenReqs(nextSp);
    }
    return;
  }

  const routeActiveSp = bgSpEmePlayers.get(appId);
  const routeStagingSp = bgStagingSpPlayers.get(appId);
  if (
    sourceType === 'sidebar' &&
    bgAudioPool.has(appId) &&
    !(routeActiveSp && routeActiveSp.awaitingBgFrameHandoff && routeActiveSp.handoffSource === 'sidebar')
  ) {
    // Ignore passive paused ticks or idle VOLUME events from the newly opened sidebar iframe while background audio is still playing
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
  const useStaging =
    sourceType === handoffSrc && (shouldRouteBgToStaging(appId) || Boolean(routeStagingSp));

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
      const nx = bgNextSpPlayers.get(appId);
      if (nx && !nx.disposed) {
        nx.pendingGenReqs.push({ initDataType: data.initDataType, initData: initBuf });
        processSpInstanceGenReqs(nx);
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
      if (
        appId === 'spotify' &&
        curSp &&
        !curSp.disposed &&
        data.msId &&
        curSp.msId &&
        data.msId !== curSp.msId &&
        isSpActivelyPlayingCurrentTrack(curSp)
      ) {
        if (data.msId < curSp.msId) return;
        ensureNextSpEmePlayer(appId, data.mime, data.msId, sourceType);
        const nx = bgNextSpPlayers.get(appId);
        if (nx) {
          nx.queue.push({ type: 'append', chunk: chunkBuf, timestampOffset: data.timestampOffset });
          drainSpInstanceQueue(nx);
        }
        return;
      }
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
    const curNx = !useStaging && data.msId ? bgNextSpPlayers.get(appId) : null;
    const target = useStaging
      ? bgStagingSpPlayers.get(appId)
      : curNx && curNx.msId === data.msId
        ? curNx
        : bgSpEmePlayers.get(appId);
    if (!target || (data.msId && target.msId && data.msId < target.msId)) return;
    target.queue.push({ type: 'remove', start: data.start, end: data.end });
    drainSpInstanceQueue(target);
    return;
  }

  if (bt === 'MSE_ABORT') {
    const curNx = !useStaging && data.msId ? bgNextSpPlayers.get(appId) : null;
    const target = useStaging
      ? bgStagingSpPlayers.get(appId)
      : curNx && curNx.msId === data.msId
        ? curNx
        : bgSpEmePlayers.get(appId);
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
      target.videoEl.muted = isTabAutoPauseEnforced() ? true : target.desiredMuted;
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
      if (Number(data.duration) > 0) st.trackDuration = Number(data.duration);
      if (data.trackTitle) {
        if (st.trackTitle && st.trackTitle !== String(data.trackTitle)) {
          st.maxObservedCt = 0;
        }
        st.trackTitle = String(data.trackTitle);
      }
      if (data.isExplicitUserScrub) {
        st.isExplicitUserScrub = true;
        st.explicitUserScrubUntil = Date.now() + 3000;
      }
      if (isTabAutoPauseEnforced() && !data.paused) {
        const stayStopped = getTabAudioBehavior() === 'pause-only';
        st.remotePaused = true;
        st.autoPausedByTab = !stayStopped;
        if (!stayStopped) tabAutoPausedSpAppIds.add(appId);
        if (st.videoEl) {
          st.videoEl.muted = true;
          if (!st.videoEl.paused) {
            try {
              st.videoEl.pause();
            } catch (_) {}
          }
        }
        const pauseCmd = stayStopped ? 'PAUSE_LOCAL_MEDIA' : 'TAB_AUDIO_AUTO_PAUSE';
        const directPort = emeBridgePorts.get(`${sourceType}:${appId}`);
        if (directPort) {
          try {
            directPort.postMessage({ cmd: pauseCmd, markShouldResume: !stayStopped });
          } catch (_) {}
        }
        const bgEntryForPause = bgAudioPool.get(appId);
        const bgFrameForPause = bgEntryForPause && (bgEntryForPause.frame || bgEntryForPause.iframe);
        if (bgFrameForPause && bgFrameForPause.contentWindow) {
          try {
            bgFrameForPause.contentWindow.postMessage(
              { target: 'pocketmail-media-frame', cmd: pauseCmd, markShouldResume: !stayStopped },
              '*'
            );
          } catch (_) {}
        }
        return;
      }
      if (!data.fromSeek || !data.paused) {
        st.remotePaused = Boolean(data.paused);
      }
      if (!data.paused) {
        st.lastPlayedAt = Date.now();
        checkAndPromoteStagingSpPlayer(appId);
      }
      return;
    }

    // If Spotify Harmony just started playing the preloaded next track (bgNextSpPlayers), promote it with 0ms gap!
    const readyNextSp = bgNextSpPlayers.get(appId);
    if (
      !data.paused &&
      readyNextSp &&
      !readyNextSp.disposed &&
      data.msId &&
      readyNextSp.msId === data.msId
    ) {
      if (Number(data.duration) > 0) readyNextSp.trackDuration = Number(data.duration);
      if (data.trackTitle) readyNextSp.trackTitle = String(data.trackTitle);
      promoteNextSpPlayer(appId, Number(data.currentTime) || 0);
    }

    const sp = bgSpEmePlayers.get(appId);
    if (!sp) return;
    if (Number(data.duration) > 0) sp.trackDuration = Number(data.duration);
    if (data.trackTitle) {
      if (sp.trackTitle && sp.trackTitle !== String(data.trackTitle)) {
        sp.maxObservedCt = 0;
      }
      sp.trackTitle = String(data.trackTitle);
    }
    const isExplicitUserScrub = Boolean(data.isExplicitUserScrub);
    if (isExplicitUserScrub) {
      sp.isExplicitUserScrub = true;
      sp.explicitUserScrubUntil = Date.now() + 3000;
    }
    const effectiveForceSeek = Boolean(data.forceSeek && !data.isInternalHandoff);
    if (sourceType === 'sidebar' && sp.sourceType === 'bg' && data.paused && !data.explicitPause) {
      // Ignore passive paused ticks from the newly opened sidebar iframe while background audio is still playing
      return;
    }
    if (sourceType === 'sidebar' && data.paused && !data.explicitPause && (sidebarPortCount + popupPortCount === 0 || sp.awaitingBgFrameHandoff)) {
      // Ignore non-user pause events emitted while the sidebar/popup is closing or handing off
      return;
    }
    if (data.fromSeek && data.paused) {
      // Only honor explicit user/handoff seeks while paused — never snap backwards to an old Spotify server cluster anchor!
      if (effectiveForceSeek) {
        sp.targetTime = Number(data.currentTime) || 0;
        if (sp.videoEl && !sp.videoEl.paused) {
          syncSpInstanceTimeAndPlay(sp, true, isExplicitUserScrub);
        }
      } else if (!sp.videoEl || sp.videoEl.paused) {
        sp.targetTime = Number(data.currentTime) || 0;
      }
      return;
    }
    if (
      appId === 'spotify' &&
      data.paused &&
      !data.explicitPause &&
      !data.autoPausedByTab &&
      data.spUiStillPlaying &&
      sp.videoEl &&
      !sp.videoEl.paused &&
      getSpBufferedEnd(sp) - (sp.videoEl.currentTime || 0) > 0.4
    ) {
      // Ignore transient Harmony rebuffer pause while audio mirror still has buffered runway
      logAudioDiag('ignore-transient-harmony-pause', {
        appId,
        sourceType,
        ct: Math.round((sp.videoEl.currentTime || 0) * 100) / 100,
        bufEnd: Math.round(getSpBufferedEnd(sp) * 100) / 100
      });
      return;
    }
    const prevRemotePaused = sp.remotePaused;
    sp.targetTime = Number(data.currentTime) || 0;
    sp.remotePaused = Boolean(data.paused);
    if (prevRemotePaused !== sp.remotePaused) {
      logAudioDiag(sp.remotePaused ? 'sync-paused' : 'sync-playing', {
        appId,
        sourceType,
        ct: Math.round(sp.targetTime * 100) / 100,
        explicitPause: Boolean(data.explicitPause),
        spUiStillPlaying: Boolean(data.spUiStillPlaying),
        trackTitle: sp.trackTitle || ''
      });
    }
    if (data.autoPausedByTab) {
      sp.autoPausedByTab = true;
      sp.explicitUserPause = false;
    } else if (!data.paused) {
      if (isTabAutoPauseEnforced()) {
        // Immediately enforce auto-pause if a frame emits an unpaused tick while an external tab is playing audio!
        const stayStopped = getTabAudioBehavior() === 'pause-only';
        sp.remotePaused = true;
        if (stayStopped) {
          sp.autoPausedByTab = false;
          sp.explicitUserPause = true;
        } else {
          sp.autoPausedByTab = true;
          tabAutoPausedSpAppIds.add(appId);
        }
        if (sp.videoEl) {
          sp.videoEl.muted = true;
          if (!sp.videoEl.paused) {
            try {
              sp.videoEl.pause();
            } catch (_) {}
          }
        }
        const pauseCmd = stayStopped ? 'PAUSE_LOCAL_MEDIA' : 'TAB_AUDIO_AUTO_PAUSE';
        const directPort = emeBridgePorts.get(`${sourceType}:${appId}`);
        if (directPort) {
          try {
            directPort.postMessage({ cmd: pauseCmd, markShouldResume: !stayStopped });
          } catch (_) {}
        }
        const bgEntryForPause = bgAudioPool.get(appId);
        const bgFrameForPause = bgEntryForPause && (bgEntryForPause.frame || bgEntryForPause.iframe);
        if (bgFrameForPause && bgFrameForPause.contentWindow) {
          try {
            bgFrameForPause.contentWindow.postMessage(
              { target: 'pocketmail-media-frame', cmd: pauseCmd, markShouldResume: !stayStopped },
              '*'
            );
          } catch (_) {}
        }
        const prevPausedSt = liveMediaPlaybackState.get(appId);
        if (prevPausedSt && prevPausedSt.isPlaying) {
          prevPausedSt.isPlaying = false;
          prevPausedSt.updatedAt = Date.now();
        }
        refreshBgAudioIndicator();
        return;
      }
      if (!isAutoPausedByTabAudio && getTabAudioBehavior() !== 'off') {
        const nowChk = Date.now();
        if (nowChk - lastExternalTabAudioCheckAt > 900) {
          lastExternalTabAudioCheckAt = nowChk;
          checkExternalTabAudioState();
        }
      }
      sp.autoPausedByTab = false;
      sp.explicitUserPause = false;
      if (!sp.handoffSource || sp.handoffSource === sourceType) {
        sp.awaitingBgFrameHandoff = false;
        if (!sp.isClear && sp.videoEl && sp.videoEl.playbackRate !== 1.0) {
          sp.videoEl.playbackRate = 1.0;
        }
      }
      sp.lastPlayedAt = Date.now();
    } else if (data.explicitPause) {
      sp.autoPausedByTab = false;
      sp.explicitUserPause = true;
      sp.awaitingBgFrameHandoff = false;
    }
    if (sp.videoEl) {
      if (!data.paused) {
        if (sp.isClear) {
          syncClearMirrorToFrame(sp, Number(data.currentTime) || 0);
        } else {
          syncSpInstanceTimeAndPlay(sp, effectiveForceSeek, isExplicitUserScrub);
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
        if (nextResumeUrl && (isAppAllowedForPersistence(appId) || isAppAllowedForBgAudio(appId))) {
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

// Unthrottled background heartbeat broadcast to both bg:* and sidebar:* frames so Gecko never throttles execution budget
setInterval(() => {
  if (emeBridgePorts.size === 0) return;
  const now = Date.now();
  const deadKeys = [];
  emeBridgePorts.forEach((p, key) => {
    if (!p) {
      deadKeys.push(key);
      return;
    }
    // Broadcast heartbeat to both bg and sidebar frames (exclude standby)
    if (!key.startsWith('bg:') && !key.startsWith('sidebar:')) return;
    try {
      p.postMessage({ cmd: 'BG_HEARTBEAT_TICK', ts: now });
    } catch (_) {
      deadKeys.push(key);
    }
  });
  for (let i = 0; i < deadKeys.length; i++) {
    try {
      emeBridgePorts.delete(deadKeys[i]);
    } catch (_) {}
  }
}, 400);

function disposeStandbyBgFrame(appId) {
  if (!appId) return;
  if (appId === 'spotify' && standbySpotifyPrewarmTimer) {
    clearTimeout(standbySpotifyPrewarmTimer);
    standbySpotifyPrewarmTimer = null;
  }
  emeBridgePorts.delete(`standby:${appId}`);
  const st = bgStandbyPool.get(appId);
  if (st) {
    bgStandbyPool.delete(appId);
    try {
      st.frame.remove();
      st.frame.src = 'about:blank';
    } catch (_) {}
  }
}

function disposeAllStandbyBgFrames() {
  if (standbySpotifyPrewarmTimer) {
    clearTimeout(standbySpotifyPrewarmTimer);
    standbySpotifyPrewarmTimer = null;
  }
  Array.from(bgStandbyPool.keys()).forEach((appId) => {
    disposeStandbyBgFrame(appId);
  });
}

function scheduleStandbyBgSpotifyPrewarm() {
  // Never spawn a second open.spotify.com Harmony instance while the sidebar is open:
  // activeSp.videoEl's 15-35s RAM SourceBuffer already bridges sidebar close with 0.0ms audio gap!
}
window.__pmGetStandbyPoolIds = () => Array.from(bgStandbyPool.keys());

function stopSingleBackgroundAudioFrame(appId) {
  if (!appId) return;
  disposeStandbyBgFrame(appId);
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
  try {
    const domFrames = document.querySelectorAll(`iframe[name="pm-bg-audio-${appId}"]`);
    for (const f of domFrames) {
      f.remove();
      f.src = 'about:blank';
    }
  } catch (_) {}
  if (bgAudioPool.size === 0) {
    updateToolbarBadge();
  }
}

function stopBackgroundAudioFrames() {
  disposeAllStandbyBgFrames();
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
  logAudioDiag('start-bg-keepalive', {
    appId,
    targetUrl,
    alreadyInPool: bgAudioPool.has(appId)
  });

  // Ensure only one background audio app plays at a time (never YouTube + Spotify simultaneously)
  Array.from(bgAudioPool.keys()).forEach((otherId) => {
    if (otherId !== appId) {
      stopSingleBackgroundAudioFrame(otherId);
      liveMediaPlaybackState.delete(otherId);
    }
  });
  Array.from(bgStandbyPool.keys()).forEach((otherId) => {
    if (otherId !== appId) {
      disposeStandbyBgFrame(otherId);
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
      activeSp.explicitUserPause = false;
      activeSp.awaitingBgFrameHandoff = true;
      activeSp.handoffStartedAt = Date.now();
      activeSp.handoffSource = 'bg';
      activeSp.sourceType = 'bg';
      activeSp.videoEl.muted = isTabAutoPauseEnforced() ? true : false;
      activeSp.videoEl.volume = activeSp.desiredVolume > 0 ? activeSp.desiredVolume : 1.0;
      activeSp.videoEl.playbackRate = 1.0;
      if (isTabAutoPauseEnforced()) {
        activeSp.remotePaused = true;
        activeSp.autoPausedByTab = getTabAudioBehavior() === 'pause-resume';
        if (activeSp.autoPausedByTab) tabAutoPausedSpAppIds.add(appId);
        activeSp.videoEl.muted = true;
        if (!activeSp.videoEl.paused) {
          try {
            activeSp.videoEl.pause();
          } catch (_) {}
        }
      } else {
        activeSp.remotePaused = false;
        syncSpInstanceTimeAndPlay(activeSp);
      }
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

  // Promote pre-warmed passive standby Spotify frame in 0ms on first close so there is zero cold-boot reload!
  const standbyEntry = appId === 'spotify' ? bgStandbyPool.get('spotify') : null;
  if (standbyEntry && standbyEntry.frame && standbyEntry.frame.isConnected) {
    bgStandbyPool.delete('spotify');
    const iframe = standbyEntry.frame;
    iframe.name = `pm-bg-audio-${appId}`;
    const standbyPort = emeBridgePorts.get(`standby:${appId}`);
    if (standbyPort) {
      emeBridgePorts.delete(`standby:${appId}`);
      emeBridgePorts.set(`bg:${appId}`, standbyPort);
    }
    bgAudioPool.set(appId, {
      frame: iframe,
      url: targetUrl,
      title,
      autoplayBlocked: false,
      startedAt: Date.now()
    });
    const curSp = bgSpEmePlayers.get(appId);
    const activateCmd = {
      cmd: 'ACTIVATE_BG_SPOTIFY_HANDOFF',
      resumeUrl: targetUrl,
      targetSec: curSp && curSp.videoEl ? Number(curSp.videoEl.currentTime) || 0 : 0
    };
    if (standbyPort) {
      try {
        standbyPort.postMessage(activateCmd);
      } catch (_) {}
    }
    if (iframe.contentWindow) {
      try {
        iframe.contentWindow.postMessage({ target: 'pocketmail-media-frame', ...activateCmd }, '*');
      } catch (_) {}
    }
    refreshBgAudioIndicator();
    return;
  }

  try {
    const staleFrames = document.querySelectorAll(`iframe[name="pm-bg-audio-${appId}"]`);
    for (const f of staleFrames) {
      f.remove();
      f.src = 'about:blank';
    }
  } catch (_) {}

  const iframe = document.createElement('iframe');
  iframe.name = `pm-bg-audio-${appId}`;
  iframe.setAttribute(
    'allow',
    'autoplay *; encrypted-media *; clipboard-write *; picture-in-picture *; fullscreen *'
  );
  iframe.style.cssText =
    'position:fixed;left:0;top:0;width:420px;height:680px;opacity:0.001;pointer-events:none;z-index:-1;border:none;';
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
  if (currentSettings.keepAudioPlayingWhenClosed === false) {
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
      const isActivelyPlaying =
        (sp && !sp.disposed && sp.videoEl && !sp.videoEl.paused && !sp.explicitUserPause) ||
        (st.isPlaying && Date.now() - st.updatedAt < 120000);
      if (isActivelyPlaying && isAppAllowedForBgAudio(id)) {
        const candidateUrl =
          st.resumeUrl ||
          currentSettings.persistentSavedAppUrls?.[id] ||
          (id === 'spotify' ? 'https://open.spotify.com/' : '');
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
        (!sp.remotePaused ||
          (sp.videoEl && !sp.videoEl.paused) ||
          Date.now() - (sp.lastPlayedAt || 0) < 60000);
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
    // Clean up any non-persistent or explicitly user-paused EME / background frames on close
    Array.from(bgAudioPool.keys()).forEach((id) => {
      const sp = bgSpEmePlayers.get(id);
      if (sp && sp.explicitUserPause) {
        stopSingleBackgroundAudioFrame(id);
      }
    });
    bgSpEmePlayers.forEach((sp, id) => {
      if (!bgAudioPool.has(id)) {
        if (
          isAppAllowedForBgAudio(id) &&
          !sp.explicitUserPause &&
          sp.sb &&
          sp.sb.buffered &&
          sp.sb.buffered.length > 0
        ) {
          const targetUrl =
            liveMediaPlaybackState.get(id)?.resumeUrl ||
            currentSettings.persistentSavedAppUrls?.[id] ||
            (id === 'spotify' ? 'https://open.spotify.com/' : '');
          if (targetUrl) {
            startBackgroundAudioKeepAlive(id, targetUrl, sp.trackTitle || (id === 'spotify' ? 'Spotify' : id));
            return;
          }
        }
        cleanupSpEmePlayer(id);
      }
    });
    if (sidebarPortCount + popupPortCount === 0) {
      disposeAllStandbyBgFrames();
    }
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
        } else if (fn.startsWith('pm-bg-standby-')) {
          appId = fn.replace('pm-bg-standby-', '');
          if (bgAudioPool.has(appId)) {
            sourceType = 'bg';
          } else if (bgStandbyPool.has(appId)) {
            sourceType = 'standby';
            portKey = `standby:${appId}`;
            emeBridgePorts.set(portKey, port);
            if (
              msg.bridgeType === 'BRIDGE_HELLO' ||
              msg.bridgeType === 'SERVER_CERT' ||
              msg.bridgeType === 'LIC_AUTH'
            ) {
              handleSpEmeBridgeMessage(appId, msg, 'standby');
            }
            return;
          } else {
            return;
          }
        } else if (fn.startsWith('pm-media-frame-')) {
          appId = fn.replace('pm-media-frame-', '');
          sourceType = 'sidebar';
        }
        if (!appId) return;
        if (portKey && portKey !== `${sourceType}:${appId}` && emeBridgePorts.get(portKey) === port) {
          emeBridgePorts.delete(portKey);
        }
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
    const isPopupLifecycle = port.name === 'foxhub-popup-lifecycle';
    if (port.name !== 'foxhub-sidebar-lifecycle' && !isPopupLifecycle) return;
    if (isPopupLifecycle) {
      popupPortCount++;
    } else {
      sidebarPortCount++;
    }
    refreshBgAudioIndicator();

    port.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'FORWARD_SP_EME_BRIDGE' && msg.appId && msg.data) {
        handleSpEmeBridgeMessage(msg.appId, msg.data, 'sidebar');
        return;
      }
      if (msg.type === 'UPDATE_PERSISTENT_SESSION') {
        if (msg.activeAppId && (isAppAllowedForPersistence(msg.activeAppId) || isAppAllowedForBgAudio(msg.activeAppId))) {
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
          if (isAppAllowedForPersistence(msg.appId) || isAppAllowedForBgAudio(msg.appId)) {
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
          if (candidateUrl && (isAppAllowedForPersistence(msg.appId) || isAppAllowedForBgAudio(msg.appId))) {
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
      if (isPopupLifecycle) {
        popupPortCount = Math.max(0, popupPortCount - 1);
      } else {
        sidebarPortCount = Math.max(0, sidebarPortCount - 1);
      }
      if (sidebarPortCount + popupPortCount === 0) {
        triggerSidebarClosedAudioHandoff();
      }
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
              if (player.audioEl.paused && !isTabAutoPauseEnforced()) {
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
      isPlaying: !isTabAutoPauseEnforced(),
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
        audibleAppId: getAudibleBgAudioAppId(),
        sidebarOpenCount: sidebarPortCount,
        isAutoPausedByTabAudio: isTabAutoPauseEnforced(),
        pendingShortcutAppId:
          pendingShortcutLaunch && Date.now() - pendingShortcutLaunch.ts < 7000
            ? pendingShortcutLaunch.appId || ''
            : ''
      });

    case 'CONSUME_PENDING_SHORTCUT':
      pendingShortcutLaunch = null;
      return Promise.resolve({ ok: true });

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
      return (async () => {
        const res = await PocketMailGmailClient.fetchFullEmailContent(msg.message);
        const msgId = msg.message?.id;
        if (msgId && res) {
          resolvedOtpCache.set(msgId, {
            timestamp: msg.message?.timestamp || 0,
            fetchedAt: Date.now(),
            otpCode: res.otpCode || null,
            fullText: res.plainText || '',
            latestSnippet: res.latestSnippet || ''
          });
          let updated = false;
          (cachedState.accounts || []).forEach((acc) => {
            (acc.messages || []).forEach((m) => {
              if (m.id === msgId) {
                if (res.plainText) m.fullText = res.plainText;
                if (res.latestSnippet) m.snippet = res.latestSnippet;
                if (res.otpCode) m.otpCode = res.otpCode;
                updated = true;
              }
            });
          });
          if (updated) {
            browser.storage.local.set({ cachedState }).catch(() => {});
          }
        }
        return res;
      })();

    case 'SEND_EMAIL':
      return (async () => {
        const payload = msg.payload || {};
        const oauthAcc = (currentSettings.oauthAccounts || []).find(
          (a) => a.email && payload.accountEmail && a.email.toLowerCase() === payload.accountEmail.toLowerCase()
        );
        const res = await PocketMailGmailClient.sendEmailDirect(payload, oauthAcc);
        if (res && res.ok) {
          const sentMessage = await recordSentEmailInOverlay(payload);
          if (!isEmailNotificationsMuted() && currentSettings.soundId !== 'none') {
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
        if (!isEmailNotificationsMuted() && currentSettings.soundId !== 'none') {
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
        if (patch.tabAudioBehavior !== undefined && patch.autoPauseOnTabAudio === undefined) {
          patch.autoPauseOnTabAudio = patch.tabAudioBehavior !== 'off';
        } else if (patch.autoPauseOnTabAudio !== undefined && patch.tabAudioBehavior === undefined) {
          patch.tabAudioBehavior = patch.autoPauseOnTabAudio ? 'pause-resume' : 'off';
        }
        if (patch.muteSiteNotifications !== undefined && patch.socialAppNotifySounds === undefined) {
          patch.socialAppNotifySounds = !patch.muteSiteNotifications;
        } else if (patch.socialAppNotifySounds !== undefined && patch.muteSiteNotifications === undefined) {
          patch.muteSiteNotifications = !patch.socialAppNotifySounds;
        }
        const prevPoll = currentSettings.pollIntervalSeconds;
        const prevSocialTheme = currentSettings.socialAppThemeMode;
        if (patch.mediaPersistenceMode !== undefined && patch.persistenceMode === undefined) {
          patch.persistenceMode =
            patch.mediaPersistenceMode === 'none'
              ? 'eco'
              : patch.mediaPersistenceMode === 'custom'
                ? 'selected'
                : patch.mediaPersistenceMode;
        }
        currentSettings = { ...currentSettings, ...patch };
        if (patch.globalShortcuts !== undefined || patch.appShortcuts !== undefined) {
          await syncBrowserCommandsFromSettings();
        }
        if (patch.socialAppThemeMode !== undefined && patch.socialAppThemeMode !== prevSocialTheme) {
          bypassPersistentCacheUntil = Date.now() + 12000;
        }
        if (
          patch.socialAppThemeMode !== undefined &&
          patch.socialAppThemeMode !== 'true-night' &&
          patch.socialAppThemeMode !== 'midnight-oled'
        ) {
          const xLive = liveFrameCookiesByOrigin.get('https://x.com');
          if (xLive) xLive.delete('night_mode');
          const ttLive = liveFrameCookiesByOrigin.get('https://www.tiktok.com');
          if (ttLive) ttLive.delete('tiktok_webapp_theme');
          const ytLive = liveFrameCookiesByOrigin.get('https://www.youtube.com');
          if (ytLive) ytLive.delete('PREF');
        }
        scheduleSettingsSave(true);
        updateToolbarBadge();
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
        if (patch.autoPauseOnTabAudio !== undefined || patch.tabAudioBehavior !== undefined) {
          manualOverrideWhileTabAudible = false;
          audibleOverrideTabIds.clear();
          const nextBehavior = getTabAudioBehavior();
          if (nextBehavior !== 'off') {
            setTabAudioPauseTrigger(false, false);
          }
          checkExternalTabAudioState();
        }
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
        updateToolbarBadge();
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
      if (msg.activeAppId && (isAppAllowedForPersistence(msg.activeAppId) || isAppAllowedForBgAudio(msg.activeAppId))) {
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
        if (isAppAllowedForPersistence(msg.appId) || isAppAllowedForBgAudio(msg.appId)) {
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
        const isBgMasterActivelyPlaying = Boolean(
          !isNonPlayableYt &&
          bgAudioPool.has(msg.appId) &&
          !(sp && sp.explicitUserPause) &&
          !isTabAutoPauseEnforced() &&
          ((sp && !sp.disposed && sp.videoEl && !sp.videoEl.paused) || (prev && prev.isPlaying))
        );
        const inTakeoverGrace =
          !isNonPlayableYt &&
          !(sp && sp.explicitUserPause) &&
          !msg.playback.isPlaying &&
          prev &&
          prev.handedOffAt &&
          Date.now() - prev.handedOffAt < 12000 &&
          prev.isPlaying &&
          (bgAudioPool.has(msg.appId) || (sp && sp.awaitingBgFrameHandoff));
        const nextIsPlaying = isNonPlayableYt
          ? false
          : Boolean(msg.playback.isPlaying || inTakeoverGrace || isBgMasterActivelyPlaying);
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
        if (candidateUrl && (isAppAllowedForPersistence(msg.appId) || isAppAllowedForBgAudio(msg.appId))) {
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

    case 'PM_BYPASS_PERSISTENT_CACHE_ONCE': {
      bypassPersistentCacheUntil = Date.now() + 8000;
      return Promise.resolve({ ok: true });
    }

    case 'PREPARE_SIDEBAR_DOCK_APP': {
      if (msg.appId) {
        pendingShortcutLaunch = { appId: msg.appId, openMode: 'sidebar', ts: Date.now() };
      }
      return Promise.resolve({ ok: true });
    }

    case 'SIDEBAR_SP_TAKEOVER_BEGIN': {
      const appId = msg.appId || 'spotify';
      const activeSp = bgSpEmePlayers.get(appId);
      if (isTabAutoPauseEnforced()) {
        removeBgAudioIframeOnly(appId);
        if (activeSp && !activeSp.disposed) {
          activeSp.remotePaused = true;
          activeSp.autoPausedByTab = getTabAudioBehavior() === 'pause-resume';
          if (activeSp.videoEl) {
            activeSp.videoEl.muted = true;
            if (!activeSp.videoEl.paused) {
              try {
                activeSp.videoEl.pause();
              } catch (_) {}
            }
          }
        }
        logAudioDiag('sidebar-takeover-autopaused', { appId });
        return Promise.resolve({ ok: true, resume: false, autoPausedByTab: true });
      }
      const mirrorPlaying = Boolean(
        activeSp && !activeSp.disposed && activeSp.videoEl && !activeSp.videoEl.paused && !activeSp.remotePaused
      );
      const wasBgPlaying = Boolean(
        (mirrorPlaying || (bgAudioPool.has(appId) && !(activeSp && activeSp.explicitUserPause))) &&
          !isTabAutoPauseEnforced()
      );
      if (!bgAudioPool.has(appId) && !mirrorPlaying) {
        return Promise.resolve({ ok: true, resume: false });
      }
      if (wasBgPlaying && activeSp && !activeSp.disposed) {
        activeSp.lastPlayedAt = Date.now();
        activeSp.awaitingBgFrameHandoff = true;
        activeSp.handoffStartedAt = Date.now();
        activeSp.handoffSource = 'sidebar';
        activeSp.remotePaused = false;
        if (activeSp.videoEl) {
          activeSp.videoEl.playbackRate = 1.0;
        }
        if (appId === 'spotify') {
          ensureStagingSpEmePlayer(appId, activeSp.mime || 'audio/mp4; codecs="mp4a.40.2"', 0, 'sidebar');
        }
        const remBuf = getSpBufferedEnd(activeSp) - (Number(activeSp.videoEl?.currentTime) || 0);
        logAudioDiag('sidebar-takeover-begin', {
          appId,
          remBuf: Math.round(remBuf * 100) / 100,
          ct: Math.round((Number(activeSp.videoEl?.currentTime) || 0) * 100) / 100
        });
        if (appId !== 'spotify') {
          activeSp.retireBgWhenBuffered = false;
          clearTimeout(activeSp.retireBgTimer);
          removeBgAudioIframeOnly(appId);
        } else {
          // Defer background iframe retirement for Spotify until stagingSp actually promotes!
          // Keeping pm-bg-audio-spotify alive in bgAudioPool ensures activeSp continues receiving MSE chunks.
          activeSp.retireBgWhenBuffered = false;
          clearTimeout(activeSp.retireBgTimer);
        }
      } else {
        removeBgAudioIframeOnly(appId);
      }
      return Promise.resolve({ ok: true, resume: wasBgPlaying });
    }

    case 'PM_SP_SIDEBAR_PLAYPAUSE_CLICK': {
      const appId = msg.appId || 'spotify';
      const aria = String(msg.aria || '').toLowerCase();
      logAudioDiag('sidebar-playpause-click', { appId, aria });
      if (aria.includes('pause')) {
        const sp = bgSpEmePlayers.get(appId);
        if (sp && sp.videoEl) {
          sp.awaitingBgFrameHandoff = false;
          sp.remotePaused = true;
          sp.explicitUserPause = true;
          try {
            sp.videoEl.pause();
          } catch (_) {}
        }
        if (bgAudioPool.has(appId)) {
          removeBgAudioIframeOnly(appId);
        }
        const st = liveMediaPlaybackState.get(appId);
        if (st) {
          st.isPlaying = false;
          st.updatedAt = Date.now();
        }
        refreshBgAudioIndicator();
      }
      return Promise.resolve({ ok: true });
    }

    case 'SIDEBAR_CLOSED_HANDOFF': {
      const mode = currentSettings.persistenceMode || 'selected';
      if (mode === 'eco' && currentSettings.keepAudioPlayingWhenClosed === false) {
        stopBackgroundAudioFrames();
        return Promise.resolve({ ok: true });
      }

      if (msg.activeAppId && (isAppAllowedForPersistence(msg.activeAppId) || isAppAllowedForBgAudio(msg.activeAppId))) {
        currentSettings.persistentLastActiveAppId = msg.activeAppId;
      } else if (
        Array.isArray(msg.playingApps) &&
        msg.playingApps.length > 0 &&
        msg.playingApps[0].appId &&
        (isAppAllowedForPersistence(msg.playingApps[0].appId) || isAppAllowedForBgAudio(msg.playingApps[0].appId))
      ) {
        currentSettings.persistentLastActiveAppId = msg.playingApps[0].appId;
      }
      if (Array.isArray(msg.openPersistentAppIds)) {
        currentSettings.persistentOpenAppIds = msg.openPersistentAppIds.filter((id) => isAppAllowedForPersistence(id));
      }
      if (msg.savedUrls && typeof msg.savedUrls === 'object') {
        if (!currentSettings.persistentSavedAppUrls) currentSettings.persistentSavedAppUrls = {};
        Object.entries(msg.savedUrls).forEach(([id, u]) => {
          if (u && (isAppAllowedForPersistence(id) || isAppAllowedForBgAudio(id))) {
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
      checkExternalTabAudioState();
      return Promise.resolve({ ok: true });
    }

    case 'STOP_BG_AUDIO_HANDOFF': {
      if (msg.onlyIfNoSidebar && sidebarPortCount > 0) {
        return Promise.resolve({
          ok: true,
          skipped: true,
          activeBgApps: [],
          audibleAppId: getAudibleBgAudioAppId(),
          isAutoPausedByTabAudio: isTabAutoPauseEnforced(),
          settings: currentSettings
        });
      }
      const currentlyPausedByTab = isTabAutoPauseEnforced();
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
        const actuallyPlaying = !currentlyPausedByTab && !(sp && sp.explicitUserPause);
        activeBgApps.push({
          appId: id,
          url: resumeUrl,
          title: val.title,
          autoPausedByTab: currentlyPausedByTab,
          bgMasterActive: false
        });
        liveMediaPlaybackState.set(id, {
          isPlaying: actuallyPlaying,
          currentTime: sp && sp.videoEl ? Math.floor(sp.videoEl.currentTime || 0) : 0,
          resumeUrl,
          title: val.title || '',
          handedOffAt: actuallyPlaying ? Date.now() : undefined,
          updatedAt: Date.now()
        });
      });
      // Do NOT kill bgAudioPool here! Keep background audio playing with 0ms interruption while the user checks Mail or another app (e.g. Instagram).
      // Only stop a specific background audio app via STOP_SINGLE_BG_AUDIO_APP when the user opens or takes over that specific media app in the sidebar.
      return Promise.resolve({
        ok: true,
        activeBgApps,
        audibleAppId: getAudibleBgAudioAppId(),
        isAutoPausedByTabAudio: currentlyPausedByTab,
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

    case 'GET_AUDIO_DIAGNOSTICS': {
      return Promise.resolve({
        ok: true,
        diagnostics: buildAudioDiagnosticsSnapshot()
      });
    }

    case 'EXTERNAL_TAB_MEDIA_PLAYING': {
      if (sender && sender.tab && isExternalBrowserTab(sender.tab)) {
        const tid = sender.tab.id;
        // CRITICAL: Only treat an external tab as playing audio when Firefox's OS audio mixer confirms sender.tab.audible === true!
        // Silent autoplaying <video> elements on Reddit/X/news sites that lack .muted=true have sender.tab.audible === false and must NEVER stop Spotify!
        if (Boolean(sender.tab.audible)) {
          if (typeof tid === 'number') {
            knownActiveMediaTabIds.add(tid);
            recentlyStoppedMediaTabMap.delete(tid);
            silentTabHoldSince.delete(tid);
          }
          if (pendingTabResumeTimer) {
            clearTimeout(pendingTabResumeTimer);
            pendingTabResumeTimer = null;
          }
          if (!(typeof tid === 'number' && audibleOverrideTabIds.has(tid))) {
            manualOverrideWhileTabAudible = false;
            audibleOverrideTabIds.clear();
          }
          checkExternalTabAudioState();
        } else {
          // Recheck shortly in case Firefox updates sender.tab.audible=true a moment after <video>.play() starts
          setTimeout(checkExternalTabAudioState, 240);
        }
      }
      return Promise.resolve({ ok: true });
    }

    case 'EXTERNAL_TAB_MEDIA_STOPPED': {
      if (sender && sender.tab) {
        const tid = sender.tab.id;
        if (typeof tid === 'number') {
          knownActiveMediaTabIds.delete(tid);
          silentTabHoldSince.delete(tid);
          recentlyStoppedMediaTabMap.set(tid, Date.now());
        }
        checkExternalTabAudioState();
      }
      return Promise.resolve({ ok: true });
    }

    case 'GET_KEYBOARD_SHORTCUTS':
      return (async () => {
        const commands =
          browser.commands && typeof browser.commands.getAll === 'function'
            ? await browser.commands.getAll().catch(() => [])
            : [];
        return {
          ok: true,
          commands,
          globalShortcuts: { ...DEFAULT_GLOBAL_SHORTCUTS, ...(currentSettings.globalShortcuts || {}) },
          appShortcuts: { ...(currentSettings.appShortcuts || {}) },
          appShortcutOpenMode: currentSettings.appShortcutOpenMode || 'sidebar'
        };
      })();

    case 'UPDATE_KEYBOARD_SHORTCUTS':
      return (async () => {
        if (msg.globalShortcuts && typeof msg.globalShortcuts === 'object') {
          currentSettings.globalShortcuts = {
            ...DEFAULT_GLOBAL_SHORTCUTS,
            ...(currentSettings.globalShortcuts || {}),
            ...msg.globalShortcuts
          };
        }
        if (msg.appShortcuts && typeof msg.appShortcuts === 'object') {
          const cleaned = {};
          Object.entries(msg.appShortcuts).forEach(([k, v]) => {
            const sc = String(v || '').trim();
            if (k && sc) cleaned[k] = sc;
          });
          currentSettings.appShortcuts = cleaned;
        }
        if (typeof msg.appShortcutOpenMode === 'string' && msg.appShortcutOpenMode) {
          currentSettings.appShortcutOpenMode = msg.appShortcutOpenMode;
        }
        const syncRes = await syncBrowserCommandsFromSettings();
        scheduleSettingsSave(true);
        browser.runtime
          .sendMessage({
            type: 'STATE_UPDATED',
            state: cachedState,
            settings: currentSettings,
            snoozed: localOverlay.snoozed
          })
          .catch(() => {});
        const commands =
          browser.commands && typeof browser.commands.getAll === 'function'
            ? await browser.commands.getAll().catch(() => [])
            : [];
        return {
          ok: syncRes.ok,
          error: syncRes.error || null,
          settings: currentSettings,
          commands
        };
      })();

    case 'RESET_KEYBOARD_SHORTCUTS':
      return (async () => {
        currentSettings.globalShortcuts = { ...DEFAULT_GLOBAL_SHORTCUTS };
        currentSettings.appShortcuts = {};
        currentSettings.appShortcutOpenMode = 'sidebar';
        await resetAllBrowserCommandsToDefaults();
        scheduleSettingsSave(true);
        browser.runtime
          .sendMessage({
            type: 'STATE_UPDATED',
            state: cachedState,
            settings: currentSettings,
            snoozed: localOverlay.snoozed
          })
          .catch(() => {});
        const commands =
          browser.commands && typeof browser.commands.getAll === 'function'
            ? await browser.commands.getAll().catch(() => [])
            : [];
        return { ok: true, settings: currentSettings, commands };
      })();

    case 'TRIGGER_APP_SHORTCUT': {
      if (msg.appId) {
        launchAppViaShortcut(String(msg.appId), msg.openMode || '');
      }
      return Promise.resolve({ ok: true });
    }

    default:
      return Promise.resolve({ ok: false });
  }
});

// Opera GX-style Auto-Pause & Auto-Resume when external browser tabs play audio
function pauseAllForTabAudioAutoPause(stayStopped = false) {
  setTabAudioPauseTrigger(true, stayStopped);
  logAudioDiag('tab-audio-auto-pause', {
    stayStopped,
    activeTabs: Array.from(knownActiveMediaTabIds)
  });
  const pauseCmd = stayStopped ? 'PAUSE_LOCAL_MEDIA' : 'TAB_AUDIO_AUTO_PAUSE';

  bgSpEmePlayers.forEach((sp, appId) => {
    if (!sp || sp.disposed || sp.explicitUserPause) return;
    const isPlayingOrAutoPaused = Boolean(
      (sp.videoEl && !sp.videoEl.paused) ||
      !sp.remotePaused ||
      sp.autoPausedByTab ||
      tabAutoPausedSpAppIds.has(appId) ||
      bgAudioPool.has(appId) ||
      liveMediaPlaybackState.get(appId)?.isPlaying
    );
    if (isPlayingOrAutoPaused) {
      if (stayStopped) {
        sp.autoPausedByTab = false;
        sp.remotePaused = true;
        sp.explicitUserPause = true;
        tabAutoPausedSpAppIds.delete(appId);
      } else {
        sp.autoPausedByTab = true;
        sp.remotePaused = true;
        tabAutoPausedSpAppIds.add(appId);
      }
      const st = liveMediaPlaybackState.get(appId);
      if (st) {
        st.isPlaying = false;
        st.updatedAt = Date.now();
      }
      if (sp.videoEl) {
        sp.videoEl.muted = true;
        if (!sp.videoEl.paused) {
          try {
            sp.videoEl.pause();
          } catch (_) {}
        }
      }
    }
  });

  bgStagingSpPlayers.forEach((stSp, appId) => {
    if (!stSp || stSp.disposed) return;
    stSp.remotePaused = true;
    if (!stayStopped) {
      stSp.autoPausedByTab = true;
      tabAutoPausedSpAppIds.add(appId);
    }
    if (stSp.videoEl) {
      stSp.videoEl.muted = true;
      if (!stSp.videoEl.paused) {
        try {
          stSp.videoEl.pause();
        } catch (_) {}
      }
    }
  });

  bgMsePlayers.forEach((player, appId) => {
    if (player && player.audioEl) {
      if (!stayStopped && !player.audioEl.paused) {
        tabAutoPausedMseAppIds.add(appId);
      }
      player.audioEl.muted = true;
      if (!player.audioEl.paused) {
        try {
          player.audioEl.pause();
        } catch (_) {}
      }
      const st = liveMediaPlaybackState.get(appId);
      if (st) {
        st.isPlaying = false;
        st.updatedAt = Date.now();
      }
    }
  });

  emeBridgePorts.forEach((port) => {
    try {
      port.postMessage({ cmd: pauseCmd, markShouldResume: !stayStopped });
    } catch (_) {}
  });

  bgAudioPool.forEach((entry) => {
    try {
      const bgFrame = entry && (entry.frame || entry.iframe);
      if (bgFrame && bgFrame.contentWindow) {
        bgFrame.contentWindow.postMessage(
          {
            target: 'pocketmail-media-frame',
            cmd: pauseCmd,
            markShouldResume: !stayStopped
          },
          '*'
        );
      }
    } catch (_) {}
  });

  browser.runtime
    .sendMessage({
      type: 'PM_TAB_AUDIO_AUTO_PAUSE_STATE',
      autoPaused: true,
      stayStopped
    })
    .catch(() => {});

  refreshBgAudioIndicator();
}

function resumeAllFromTabAudioAutoPause() {
  setTabAudioPauseTrigger(false, false);
  manualOverrideWhileTabAudible = false;
  logAudioDiag('tab-audio-auto-resume', {
    spApps: Array.from(tabAutoPausedSpAppIds)
  });

  bgSpEmePlayers.forEach((sp, appId) => {
    if (!sp || sp.disposed) return;
    if ((sp.autoPausedByTab || tabAutoPausedSpAppIds.has(appId)) && !sp.explicitUserPause) {
      sp.autoPausedByTab = false;
      sp.remotePaused = false;
      sp.lastPlayedAt = Date.now();
      if (sp.videoEl) {
        sp.videoEl.muted = Boolean(sp.desiredMuted);
        sp.videoEl.volume = sp.desiredVolume > 0 ? sp.desiredVolume : 1.0;
        if (sp.isClear) {
          const p = sp.videoEl.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } else {
          syncSpInstanceTimeAndPlay(sp, false);
        }
      }
      const st = liveMediaPlaybackState.get(appId);
      if (st) {
        st.isPlaying = true;
        st.updatedAt = Date.now();
      }
    }
  });
  tabAutoPausedSpAppIds.clear();

  bgStagingSpPlayers.forEach((stSp) => {
    if (!stSp || stSp.disposed) return;
    stSp.autoPausedByTab = false;
    stSp.remotePaused = false;
  });

  tabAutoPausedMseAppIds.forEach((appId) => {
    const player = bgMsePlayers.get(appId);
    if (player && player.audioEl) {
      player.audioEl.muted = false;
      player.audioEl.volume = 1.0;
      if (player.audioEl.paused) {
        player.audioEl.play().catch(() => {});
      }
      const st = liveMediaPlaybackState.get(appId);
      if (st) {
        st.isPlaying = true;
        st.updatedAt = Date.now();
      }
    }
  });
  tabAutoPausedMseAppIds.clear();

  emeBridgePorts.forEach((port) => {
    try {
      port.postMessage({ cmd: 'TAB_AUDIO_AUTO_RESUME' });
    } catch (_) {}
  });

  bgAudioPool.forEach((entry) => {
    try {
      const bgFrame = entry && (entry.frame || entry.iframe);
      if (bgFrame && bgFrame.contentWindow) {
        bgFrame.contentWindow.postMessage(
          { target: 'pocketmail-media-frame', cmd: 'TAB_AUDIO_AUTO_RESUME' },
          '*'
        );
      }
    } catch (_) {}
  });

  browser.runtime
    .sendMessage({
      type: 'PM_TAB_AUDIO_AUTO_PAUSE_STATE',
      autoPaused: false
    })
    .catch(() => {});

  refreshBgAudioIndicator();
}

async function checkExternalTabAudioState() {
  clearTimeout(silentMediaRecheckTimer);
  const behavior = getTabAudioBehavior();
  if (behavior === 'off') {
    if (pendingTabResumeTimer) {
      clearTimeout(pendingTabResumeTimer);
      pendingTabResumeTimer = null;
    }
    knownActiveMediaTabIds.clear();
    recentlyStoppedMediaTabMap.clear();
    audibleOverrideTabIds.clear();
    silentTabHoldSince.clear();
    manualOverrideWhileTabAudible = false;
    if (isAutoPausedByTabAudio) {
      resumeAllFromTabAudioAutoPause();
    }
    return;
  }
  try {
    const audibleTabs = await browser.tabs.query({ audible: true });
    const rawExternalAudible = (audibleTabs || []).filter((t) => Boolean(t && t.audible && isExternalBrowserTab(t)));
    const rawAudibleIdSet = new Set(
      rawExternalAudible.map((t) => t.id).filter((id) => typeof id === 'number')
    );

    // Prune manual-override tab IDs that are no longer audible and no longer tracked
    if (audibleOverrideTabIds.size > 0) {
      Array.from(audibleOverrideTabIds).forEach((id) => {
        if (!rawAudibleIdSet.has(id) && !knownActiveMediaTabIds.has(id)) {
          audibleOverrideTabIds.delete(id);
        }
      });
      if (audibleOverrideTabIds.size === 0) {
        manualOverrideWhileTabAudible = false;
      }
    }

    const externalAudible = [];
    for (let i = 0; i < rawExternalAudible.length; i++) {
      const t = rawExternalAudible[i];
      const tid = t.id;
      if (manualOverrideWhileTabAudible && typeof tid === 'number' && audibleOverrideTabIds.has(tid)) {
        // User explicitly pressed Play in Spotify while this external tab was playing audio — honor user intent!
        silentTabHoldSince.delete(tid);
        continue;
      }
      const stoppedAt = typeof tid === 'number' ? recentlyStoppedMediaTabMap.get(tid) || 0 : 0;
      if (stoppedAt && Date.now() - stoppedAt < 2400) {
        const mediaCheck = await Promise.race([
          browser.tabs.sendMessage(tid, { type: 'CHECK_TAB_HAS_ACTIVE_MEDIA' }).catch(() => null),
          new Promise((resolve) => setTimeout(() => resolve(null), 180))
        ]);
        if (!(mediaCheck && mediaCheck.hasActiveMedia)) {
          knownActiveMediaTabIds.delete(tid);
          silentTabHoldSince.delete(tid);
          continue;
        }
        recentlyStoppedMediaTabMap.delete(tid);
      }
      externalAudible.push(t);
    }

    externalAudible.forEach((t) => {
      if (typeof t.id === 'number') {
        knownActiveMediaTabIds.add(t.id);
        recentlyStoppedMediaTabMap.delete(t.id);
        silentTabHoldSince.delete(t.id);
      }
    });

    // Build effective non-overridden active media tab IDs
    const getEffectiveKnownMediaIds = () =>
      Array.from(knownActiveMediaTabIds).filter(
        (tid) => !(manualOverrideWhileTabAudible && audibleOverrideTabIds.has(tid))
      );

    // If Firefox temporarily dropped tab.audible=false (e.g. quiet music video intro/scene, seeking, or buffering),
    // query previously active media tabs before falsely unpausing Spotify — capped at 4.2s max silent hold so silent videos never lock Spotify!
    const effectiveKnownBeforeCheck = getEffectiveKnownMediaIds();
    if (externalAudible.length === 0 && effectiveKnownBeforeCheck.length > 0) {
      const nowHold = Date.now();
      for (let i = 0; i < effectiveKnownBeforeCheck.length; i++) {
        const tid = effectiveKnownBeforeCheck[i];
        const holdStart = silentTabHoldSince.get(tid) || 0;
        if (!holdStart) {
          silentTabHoldSince.set(tid, nowHold);
        } else if (nowHold - holdStart > 4200) {
          // Tab has reported audible=false for >4.2s continuously — release hold so Spotify is never stuck paused!
          knownActiveMediaTabIds.delete(tid);
          silentTabHoldSince.delete(tid);
          audibleOverrideTabIds.delete(tid);
          continue;
        }
        const tabInfo = await browser.tabs.get(tid).catch(() => null);
        if (!isExternalBrowserTab(tabInfo)) {
          knownActiveMediaTabIds.delete(tid);
          silentTabHoldSince.delete(tid);
          audibleOverrideTabIds.delete(tid);
          continue;
        }
        const mediaCheck = await Promise.race([
          browser.tabs.sendMessage(tid, { type: 'CHECK_TAB_HAS_ACTIVE_MEDIA' }).catch(() => null),
          new Promise((resolve) => setTimeout(() => resolve(null), 220))
        ]);
        if (!(mediaCheck && mediaCheck.hasActiveMedia)) {
          knownActiveMediaTabIds.delete(tid);
          silentTabHoldSince.delete(tid);
          audibleOverrideTabIds.delete(tid);
        }
      }
    }

    const effectiveKnownAfterCheck = getEffectiveKnownMediaIds();
    const hasActiveExternalMedia = externalAudible.length > 0 || effectiveKnownAfterCheck.length > 0;

    if (hasActiveExternalMedia) {
      if (pendingTabResumeTimer) {
        clearTimeout(pendingTabResumeTimer);
        pendingTabResumeTimer = null;
      }
      const anyBgStillAudible = Boolean(getAudibleBgAudioAppId());
      let anySpUnmutedOrPlaying = false;
      bgSpEmePlayers.forEach((sp) => {
        if (sp && !sp.disposed && sp.videoEl && (!sp.videoEl.paused || !sp.videoEl.muted)) {
          anySpUnmutedOrPlaying = true;
        }
      });
      if (!isAutoPausedByTabAudio || anyBgStillAudible || anySpUnmutedOrPlaying) {
        pauseAllForTabAudioAutoPause(behavior === 'pause-only');
      }
      if (externalAudible.length === 0 && effectiveKnownAfterCheck.length > 0) {
        silentMediaRecheckTimer = setTimeout(checkExternalTabAudioState, 1200);
      }
    } else {
      if (rawExternalAudible.length === 0 && knownActiveMediaTabIds.size === 0) {
        manualOverrideWhileTabAudible = false;
        audibleOverrideTabIds.clear();
      }
      if (isAutoPausedByTabAudio) {
        if (behavior === 'pause-only') {
          if (pendingTabResumeTimer) {
            clearTimeout(pendingTabResumeTimer);
            pendingTabResumeTimer = null;
          }
          setTabAudioPauseTrigger(false, true);
          tabAutoPausedSpAppIds.clear();
          tabAutoPausedMseAppIds.clear();
          refreshBgAudioIndicator();
        } else if (!pendingTabResumeTimer) {
          // Clean 340ms settle debounce prevents quarter-second blips during YouTube playlist track transitions
          pendingTabResumeTimer = setTimeout(() => {
            pendingTabResumeTimer = null;
            const stillOverriddenOrEmpty =
              Array.from(knownActiveMediaTabIds).filter(
                (tid) => !(manualOverrideWhileTabAudible && audibleOverrideTabIds.has(tid))
              ).length === 0;
            if (isAutoPausedByTabAudio && stillOverriddenOrEmpty) {
              resumeAllFromTabAudioAutoPause();
            }
          }, 340);
        }
      }
    }
  } catch (_) {}
}

// Continuous background watchdog: enforces the in-memory auto-pause trigger on all active/staging audio elements,
// tracks live playback head progression to prevent stuck header banners, and polls external tab audio state.
let lastWatchdogTabPollAt = 0;
setInterval(() => {
  const now = Date.now();
  bgSpEmePlayers.forEach((sp) => {
    if (!sp || sp.disposed || !sp.videoEl) return;
    if (!sp.videoEl.paused) {
      const ct = Number(sp.videoEl.currentTime) || 0;
      if (Math.abs(ct - (sp.lastObservedCt || 0)) > 0.02) {
        sp.lastObservedCt = ct;
        sp.lastTimeAdvanceAt = now;
      } else if (
        sp.appId === 'spotify' &&
        !sp.isStaging &&
        !sp.remotePaused &&
        !sp.explicitUserPause &&
        !isTabAutoPauseEnforced()
      ) {
        const bufEnd = getSpBufferedEnd(sp);
        if (bufEnd > 2 && bufEnd - ct <= 0.04 && sp.lastTimeAdvanceAt > 0 && now - sp.lastTimeAdvanceAt > 2800) {
          refreshBgAudioIndicator();
          if (!sp.lastStarveNudgeAt || now - sp.lastStarveNudgeAt > 12000) {
            sp.lastStarveNudgeAt = now;
            logAudioDiag('buffer-starved-nudge', {
              ct: Math.round(ct * 100) / 100,
              bufEnd: Math.round(bufEnd * 100) / 100,
              sourceType: sp.sourceType,
              bgPool: bgAudioPool.has('spotify')
            });
            if (bgAudioPool.has('spotify')) {
              const bgPort = emeBridgePorts.get('bg:spotify');
              if (bgPort) {
                try {
                  bgPort.postMessage({ cmd: 'RESUME_BG_SP_MEDIA' });
                } catch (_) {}
              }
              const bgEntry = bgAudioPool.get('spotify');
              if (bgEntry && bgEntry.frame && bgEntry.frame.contentWindow) {
                try {
                  bgEntry.frame.contentWindow.postMessage(
                    { target: 'pocketmail-media-frame', cmd: 'RESUME_BG_SP_MEDIA' },
                    '*'
                  );
                } catch (_) {}
              }
            }
          }
        }
      }
    }
  });
  if (isTabAutoPauseEnforced()) {
    bgSpEmePlayers.forEach((sp) => {
      if (sp && !sp.disposed && sp.videoEl) {
        sp.videoEl.muted = true;
        if (!sp.videoEl.paused) {
          try {
            sp.videoEl.pause();
          } catch (_) {}
        }
      }
    });
    bgMsePlayers.forEach((player) => {
      if (player && player.audioEl) {
        player.audioEl.muted = true;
        if (!player.audioEl.paused) {
          try {
            player.audioEl.pause();
          } catch (_) {}
        }
      }
    });
  }
  const hasAnyBgAudioOrAutoPaused =
    isAutoPausedByTabAudio || bgAudioPool.size > 0 || bgSpEmePlayers.size > 0 || bgMsePlayers.size > 0;
  if (hasAnyBgAudioOrAutoPaused && getTabAudioBehavior() !== 'off') {
    if (now - lastWatchdogTabPollAt >= 900) {
      lastWatchdogTabPollAt = now;
      checkExternalTabAudioState();
    }
  }
}, 450);

if (browser.tabs && browser.tabs.onUpdated) {
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.audible === true && isExternalBrowserTab(tab)) {
      knownActiveMediaTabIds.add(tabId);
      recentlyStoppedMediaTabMap.delete(tabId);
      if (pendingTabResumeTimer) {
        clearTimeout(pendingTabResumeTimer);
        pendingTabResumeTimer = null;
      }
      if (!audibleOverrideTabIds.has(tabId)) {
        manualOverrideWhileTabAudible = false;
        audibleOverrideTabIds.clear();
      }
    }
    if (changeInfo.mutedInfo && changeInfo.mutedInfo.muted) {
      knownActiveMediaTabIds.delete(tabId);
      recentlyStoppedMediaTabMap.delete(tabId);
      audibleOverrideTabIds.delete(tabId);
    }
    if (changeInfo.status === 'loading' && changeInfo.url) {
      knownActiveMediaTabIds.delete(tabId);
      recentlyStoppedMediaTabMap.delete(tabId);
    }
    if (
      changeInfo.audible !== undefined ||
      changeInfo.mutedInfo !== undefined ||
      (changeInfo.status === 'complete' && tab && tab.audible)
    ) {
      checkExternalTabAudioState();
    }
  });
}

if (browser.tabs && browser.tabs.onActivated) {
  browser.tabs.onActivated.addListener(() => {
    checkExternalTabAudioState();
  });
}

if (browser.tabs && browser.tabs.onRemoved) {
  browser.tabs.onRemoved.addListener((tabId) => {
    knownActiveMediaTabIds.delete(tabId);
    recentlyStoppedMediaTabMap.delete(tabId);
    audibleOverrideTabIds.delete(tabId);
    setTimeout(checkExternalTabAudioState, 60);
  });
}

const APP_SHORTCUT_SLOT_COUNT = 12;
const GLOBAL_COMMAND_MAP = {
  popup: '_execute_browser_action',
  sidebar: '_execute_sidebar_action',
  popout: 'open-foxhub-popout'
};
const DEFAULT_GLOBAL_SHORTCUTS = {
  popup: 'Alt+Shift+F',
  sidebar: 'Alt+Shift+M',
  popout: 'Alt+Shift+W'
};
const slotToAppIdMap = new Map(); // 'foxhub-app-slot-1' -> appId

async function resetAllBrowserCommandsToDefaults() {
  slotToAppIdMap.clear();
  if (!browser.commands) return;
  for (const cmdName of Object.values(GLOBAL_COMMAND_MAP)) {
    try {
      if (typeof browser.commands.reset === 'function') {
        await browser.commands.reset(cmdName);
      }
    } catch (_) {}
  }
  for (let i = 1; i <= APP_SHORTCUT_SLOT_COUNT; i++) {
    const slotName = `foxhub-app-slot-${i}`;
    try {
      if (typeof browser.commands.reset === 'function') {
        await browser.commands.reset(slotName);
      }
    } catch (_) {}
    try {
      if (typeof browser.commands.update === 'function') {
        await browser.commands.update({ name: slotName, shortcut: '' });
      }
    } catch (_) {}
  }
}

async function syncBrowserCommandsFromSettings() {
  slotToAppIdMap.clear();
  if (!browser.commands || typeof browser.commands.update !== 'function') {
    return { ok: true };
  }
  let firstErr = '';
  const gs = { ...DEFAULT_GLOBAL_SHORTCUTS, ...(currentSettings.globalShortcuts || {}) };
  for (const [key, cmdName] of Object.entries(GLOBAL_COMMAND_MAP)) {
    const sc = String(gs[key] ?? '').trim();
    try {
      await browser.commands.update({ name: cmdName, shortcut: sc });
    } catch (err) {
      if (!firstErr) firstErr = err && err.message ? err.message : String(err);
    }
  }

  const appSc = currentSettings.appShortcuts && typeof currentSettings.appShortcuts === 'object'
    ? currentSettings.appShortcuts
    : {};
  const validAppIds = new Set(['pocketmail', 'instagram', 'whatsapp', 'discord', 'telegram', 'spotify', 'youtube', 'tiktok', 'x', 'messenger', 'reddit', 'twitch', 'chatgpt', 'gemini']);
  (Array.isArray(currentSettings.customMediaApps) ? currentSettings.customMediaApps : []).forEach((c, idx) => {
    if (c) validAppIds.add(c.id || `custom-${idx}`);
  });

  const pairs = Object.entries(appSc).filter(([id, sc]) => validAppIds.has(id) && String(sc || '').trim().length > 0);
  for (let i = 1; i <= APP_SHORTCUT_SLOT_COUNT; i++) {
    const slotName = `foxhub-app-slot-${i}`;
    const entry = pairs[i - 1];
    if (entry) {
      const [appId, sc] = entry;
      slotToAppIdMap.set(slotName, appId);
      try {
        await browser.commands.update({ name: slotName, shortcut: String(sc).trim() });
      } catch (err) {
        if (!firstErr) firstErr = err && err.message ? err.message : String(err);
      }
    } else {
      try {
        if (typeof browser.commands.reset === 'function') {
          await browser.commands.reset(slotName);
        }
      } catch (_) {}
      try {
        await browser.commands.update({ name: slotName, shortcut: '' });
      } catch (_) {}
    }
  }
  return { ok: !firstErr, error: firstErr || null };
}

let lastShortcutLaunchAt = 0;
let lastShortcutLaunchAppId = '';

function launchAppViaShortcut(appId, modeOverride = '') {
  if (!appId) return;
  const now = Date.now();
  if (appId === lastShortcutLaunchAppId && now - lastShortcutLaunchAt < 380) {
    return;
  }
  lastShortcutLaunchAt = now;
  lastShortcutLaunchAppId = appId;

  const openMode = modeOverride || currentSettings.appShortcutOpenMode || 'sidebar';
  pendingShortcutLaunch = { appId, openMode, ts: now };

  // If the shortcut target itself is a persistent app, promote it to persistentLastActiveAppId immediately so persistent memory never overrides it!
  let settingsDirty = false;
  if (appId !== 'pocketmail' && isAppAllowedForPersistence(appId)) {
    if (currentSettings.persistentLastActiveAppId !== appId) {
      currentSettings.persistentLastActiveAppId = appId;
      settingsDirty = true;
    }
  } else if (appId === 'pocketmail' && bgAudioPool.size === 0) {
    if (currentSettings.persistentLastActiveAppId !== 'pocketmail') {
      currentSettings.persistentLastActiveAppId = 'pocketmail';
      settingsDirty = true;
    }
  }

  // Ensure built-in app is enabled/pinned on the rail when launched via shortcut
  if (appId !== 'pocketmail' && !appId.startsWith('custom-')) {
    const enabled = Array.isArray(currentSettings.enabledMediaApps) ? currentSettings.enabledMediaApps : [];
    if (!enabled.includes(appId)) {
      currentSettings.enabledMediaApps = [...enabled, appId];
      settingsDirty = true;
    }
  } else if (appId.startsWith('custom-') && Array.isArray(currentSettings.customMediaApps)) {
    currentSettings.customMediaApps = currentSettings.customMediaApps.map((c, idx) => {
      const cid = c && (c.id || `custom-${idx}`);
      if (cid === appId && c.enabled === false) {
        settingsDirty = true;
        return { ...c, enabled: true };
      }
      return c;
    });
  }
  if (settingsDirty) scheduleSettingsSave(true);

  // Broadcast immediately so any already-open FoxHub Sidebar/Popup/Popout switches to appId in 0ms!
  browser.runtime
    .sendMessage({
      type: 'OPEN_APP_FROM_SHORTCUT',
      appId,
      openMode,
      settings: currentSettings
    })
    .catch(() => {});

  // Synchronously invoke Firefox's user-gesture surface opener inside the onCommand turn!
  if (openMode === 'popout') {
    if (companionWindowIds.size > 0) {
      const existingWinId = Array.from(companionWindowIds)[0];
      browser.windows
        .update(existingWinId, { focused: true })
        .catch(() => {
          companionWindowIds.delete(existingWinId);
          const url = browser.runtime.getURL(`src/popup/popup.html?popout=1&app=${encodeURIComponent(appId)}`);
          browser.windows
            .create({ url, type: 'popup', width: 560, height: 820 })
            .then((win) => {
              if (win && win.id) companionWindowIds.add(win.id);
            })
            .catch(() => {});
        });
      return;
    }
    const url = browser.runtime.getURL(`src/popup/popup.html?popout=1&app=${encodeURIComponent(appId)}`);
    browser.windows
      .create({
        url,
        type: 'popup',
        width: 560,
        height: 820
      })
      .then((win) => {
        if (win && win.id) companionWindowIds.add(win.id);
      })
      .catch(() => {});
  } else if (openMode === 'popup') {
    if (popupPortCount === 0 && browser.browserAction && typeof browser.browserAction.openPopup === 'function') {
      browser.browserAction.openPopup().catch(() => {
        if (browser.sidebarAction && typeof browser.sidebarAction.open === 'function') {
          browser.sidebarAction.open().catch(() => {});
        }
      });
    }
  } else {
    if (browser.sidebarAction && typeof browser.sidebarAction.open === 'function') {
      browser.sidebarAction.open().catch(() => {
        if (sidebarPortCount === 0) {
          const url = browser.runtime.getURL(`src/popup/popup.html?popout=1&app=${encodeURIComponent(appId)}`);
          browser.windows.create({ url, type: 'popup', width: 560, height: 820 }).catch(() => {});
        }
      });
    }
  }
}

if (browser.commands && browser.commands.onCommand) {
  browser.commands.onCommand.addListener((command) => {
    if (command === 'open-foxhub-popout') {
      const url = browser.runtime.getURL('src/popup/popup.html?popout=1');
      browser.windows
        .create({
          url,
          type: 'popup',
          width: 560,
          height: 820
        })
        .then((win) => {
          if (win && win.id) {
            companionWindowIds.add(win.id);
          }
        })
        .catch(() => {});
      return;
    }
    if (typeof command === 'string' && command.startsWith('foxhub-app-slot-')) {
      const mappedAppId = slotToAppIdMap.get(command);
      if (mappedAppId) {
        launchAppViaShortcut(mappedAppId);
      }
    }
  });
}

// Initialize on extension startup
(async function init() {
  try {
    if (browser.sidebarAction && typeof browser.sidebarAction.setPanel === 'function') {
      browser.sidebarAction.setPanel({ panel: browser.runtime.getURL('src/popup/popup.html?sidebar=1') });
    }
  } catch (_) {}
  await loadStorage();
  await syncBrowserCommandsFromSettings();
  prewarmSocialCookieCache();
  checkExternalTabAudioState();
  updateToolbarBadge();
  await syncAllAccounts();
  restartPollingTimer();
})();
