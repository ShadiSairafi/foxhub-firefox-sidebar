/**
 * FoxHub — Unified Settings Schema, Normalization, Backup/Restore Validation & Shortcut Helpers
 * Single source of truth consumed by background modules, sidebar settings drawer, and options page.
 */

(function (global) {
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  const DEFAULT_ENABLED_APPS = [
    'instagram',
    'whatsapp',
    'discord',
    'telegram',
    'spotify',
    'youtube',
    'tiktok',
    'x',
    'messenger',
    'reddit'
  ];

  const DEFAULT_SETTINGS = {
    // Theme & Visual Studio
    theme: 'warm-linen',
    wallpaper: 'watercolor-hills',
    wallpaperOpacity: 0.95,
    wallpaperBlur: 0,
    wallpaperFit: 'cover',
    customWallpaperData: '',
    customWallpaperUrl: '',
    gradientColor1: '#FAD6A5',
    gradientColor2: '#E8A598',
    customGradient1: '#FAD6A5',
    customGradient2: '#E8A598',
    gradientAngle: 135,
    cardStyle: 'glassmorphism',
    cardOpacity: 0.62,
    cardBlur: 16,
    cardRadius: 15,
    cardDensity: 'cozy',
    cardActionsMode: 'always',
    avatarShape: 'squircle',
    showLeftAccent: true,
    tabStyle: 'glass-pills',
    fontStyle: 'editorial',
    ambientEffect: 'sunbeams',
    previousDayTheme: 'warm-linen',
    previousDayWallpaper: 'watercolor-hills',
    previousDayAmbient: 'sunbeams',
    previousDaySocialTheme: 'native',

    // Popup & Mail
    popupWidth: 560,
    popupHeight: 600,
    autoFitEmail: true,
    badgeCountMode: 'feed',
    pollIntervalSeconds: 30,
    demoMode: 'auto',
    maxSessionSlots: 5,
    maxEmailsPerAccount: 15,
    accountConfigs: {},
    oauthAccounts: [],
    oauthClientId: '',

    // Notifications, Chimes & TTS
    soundId: 'marimba',
    soundVolume: 0.75,
    customAudioData: '',
    desktopNotifications: true,
    voiceNotifications: false,
    muteEmailNotifications: false,
    muteSiteNotifications: false,
    socialAppNotifySounds: true,
    socialAppSoundMap: {},
    ttsRate: 1.0,
    ttsVoice: '',
    dndUntil: 0,
    muteSitesUntil: 0,
    lastMuteTimerMins: 0,

    // Sidebar, Media Apps, Persistence & Audio
    enabledMediaApps: [...DEFAULT_ENABLED_APPS],
    mediaAppsOrder: [],
    customMediaApps: [],
    sidebarOpenMode: 'auto',
    socialAppThemeMode: 'native',
    hideMediaBottomBar: false,
    mediaTopBarMode: 'hover',
    autoHideMediaTopBar: true,
    hasSeenTopBarHint: false,
    persistenceMode: 'selected',
    persistentAppIds: [],
    persistentOpenAppIds: [],
    persistentLastActiveAppId: 'pocketmail',
    persistentSavedAppUrls: {},
    persistentMemoryHintCount: 0,
    settingsGearHintCount: 0,
    keepAudioPlayingWhenClosed: true,
    tabAudioBehavior: 'pause-resume',
    autoPauseOnTabAudio: true,
    bgAudioAppIds: ['spotify', 'youtube', 'soundcloud'],
    customVideoLoadbar: true,
    videoLoadbarStyle: 'sunset',
    videoLoadbarColor: '#FF3366',
    videoLoadbarSize: 'normal',
    instagramOwnProfileUrl: '',
    tiktokOwnProfileUrlV2: '',
    xOwnProfileUrl: '',

    // Keyboard Shortcuts
    globalShortcuts: {
      popup: 'Alt+Shift+F',
      sidebar: 'Alt+Shift+M',
      popout: 'Alt+Shift+W'
    },
    appShortcuts: {},
    appShortcutOpenMode: 'sidebar',

    // R2/R3 Features
    miniNowPlayingEnabled: true,
    miniNowPlayingPosition: 'bottom',
    miniNowPlayingCompact: false,
    miniNowPlayingShowProgress: true,
    miniNowPlayingAutoHidePaused: false,
    contextMenuEnabled: true,
    contextMenuOpenBehavior: 'sidebar',
    quickSwitcherEnabled: true,
    quickSwitcherShortcut: 'Ctrl+K',
    railPlayingIndicatorEnabled: true,
    railQuickControlsEnabled: true,

    // Migration Flags
    topBarAutoHideMigratedV1: true,
    bgAudioAppIdsMigratedV1: true,
    bgAudioAppIdsSoundCloudMigratedV2: true,
    persistenceDefaultSelectedMigratedV1: true,
    persistenceYoutubeAddedMigratedV2: true,
    persistenceAllSocialMigratedV3: true,
    persistenceDefaultOffMigratedV4: true,
    miniNowPlayingKeepPausedMigratedV1: true
  };

  const THEME_OR_LAYOUT_KEYS = [
    'theme',
    'wallpaper',
    'wallpaperOpacity',
    'wallpaperBlur',
    'wallpaperFit',
    'customWallpaperData',
    'customWallpaperUrl',
    'gradientColor1',
    'gradientColor2',
    'customGradient1',
    'customGradient2',
    'gradientAngle',
    'cardStyle',
    'cardOpacity',
    'cardBlur',
    'cardRadius',
    'cardDensity',
    'cardActionsMode',
    'avatarShape',
    'showLeftAccent',
    'tabStyle',
    'fontStyle',
    'ambientEffect',
    'socialAppThemeMode',
    'popupWidth',
    'popupHeight'
  ];

  const VALID_THEMES = new Set([
    'warm-linen',
    'sakura-morning',
    'soft-sage',
    'coastal-breeze',
    'golden-hour',
    'lavender-cloud',
    'matcha-latte',
    'peach-sorbet',
    'autumn-maple',
    'nordic-fjord',
    'rose-quartz',
    'pure-paper',
    'cozy-espresso',
    'midnight-velvet',
    'true-night'
  ]);

  const VALID_WALLPAPERS = new Set([
    'watercolor-hills',
    'sakura-petals',
    'botanical-leaves',
    'japanese-garden',
    'cloud-kingdom',
    'starry-dusk',
    'ocean-waves',
    'mountain-mist',
    'desert-dunes',
    'lavender-fields',
    'autumn-forest',
    'paper-origami',
    'cafe-rain',
    'warm-terrazzo',
    'cozy-window',
    'none',
    'custom',
    'custom-gradient'
  ]);

  const VALID_SOUNDS = new Set([
    'bamboo-pop',
    'cozy-plop',
    'velvet-rhodes',
    'felt-piano',
    'marimba',
    'kalimba',
    'raindrop-leaf',
    'vinyl-pluck',
    'morning-dew',
    'soft-chord',
    'woodblock-tap',
    'zen-bowl',
    'warm-bell',
    'crystal-drop',
    'crisp-ding',
    'custom',
    'none'
  ]);

  const ENUMS = {
    wallpaperFit: new Set(['cover', 'contain', 'repeat', 'tile', 'auto']),
    cardStyle: new Set(['glassmorphism', 'tinted-glass', 'warm-paper', 'floating-minimal', 'outlined-editorial']),
    cardDensity: new Set(['compact', 'cozy', 'spacious']),
    cardActionsMode: new Set(['always', 'hover', 'compact-icons']),
    avatarShape: new Set(['squircle', 'circle', 'pill']),
    tabStyle: new Set(['glass-pills', 'segmented-bar', 'underline-tabs', 'tinted-chips']),
    fontStyle: new Set(['editorial', 'modern-sans', 'literary-serif', 'rounded-cozy']),
    ambientEffect: new Set(['none', 'sunbeams', 'soft-bokeh', 'paper-grain']),
    badgeCountMode: new Set(['feed', 'total']),
    demoMode: new Set(['auto', 'on', 'off']),
    sidebarOpenMode: new Set(['auto', 'sidebar', 'embedded', 'window']),
    socialAppThemeMode: new Set(['native', 'match-theme', 'warm-glass', 'midnight-oled', 'cozy-sepia', 'true-night', 'rose-twilight']),
    mediaTopBarMode: new Set(['hover', 'pinned', 'disabled']),
    persistenceMode: new Set(['eco', 'selected', 'all']),
    tabAudioBehavior: new Set(['pause-resume', 'pause-only', 'off']),
    videoLoadbarStyle: new Set(['sunset', 'accent', 'cyber', 'emerald', 'minimal-white', 'custom']),
    videoLoadbarSize: new Set(['slim', 'normal', 'bold']),
    appShortcutOpenMode: new Set(['sidebar', 'popup', 'popout']),
    miniNowPlayingPosition: new Set(['bottom', 'top']),
    contextMenuOpenBehavior: new Set(['sidebar', 'popout'])
  };

  const NUMBER_RANGES = {
    wallpaperOpacity: [0.05, 1.0],
    wallpaperBlur: [0, 20],
    gradientAngle: [0, 360],
    cardOpacity: [0.1, 1.0],
    cardBlur: [0, 28],
    cardRadius: [0, 28],
    popupWidth: [380, 795],
    popupHeight: [460, 600],
    pollIntervalSeconds: [15, 3600],
    maxSessionSlots: [1, 8],
    maxEmailsPerAccount: [5, 50],
    soundVolume: [0, 1],
    ttsRate: [0.5, 2.0],
    dndUntil: [0, 9999999999999],
    muteSitesUntil: [0, 9999999999999],
    lastMuteTimerMins: [0, 10080],
    persistentMemoryHintCount: [0, 100],
    settingsGearHintCount: [0, 100]
  };

  const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  const MAX_MEDIA_DATA_URL_LEN = 8 * 1024 * 1024;
  const MAX_OBJECT_DEPTH = 64;

  function isPlainObject(val) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
    if (Object.prototype.toString.call(val) !== '[object Object]') return false;
    const proto = Object.getPrototypeOf(val);
    if (proto === null) return true;
    return Object.getPrototypeOf(proto) === null;
  }

  function inspectObjectSafety(root, maxDepth = MAX_OBJECT_DEPTH) {
    if (!root || typeof root !== 'object') {
      return { forbidden: false, tooDeep: false };
    }
    const seen = new Set();
    const stack = [{ val: root, depth: 0 }];
    while (stack.length > 0) {
      const { val, depth } = stack.pop();
      if (!val || typeof val !== 'object') continue;
      if (seen.has(val)) continue;
      seen.add(val);

      if (depth > maxDepth) {
        return { forbidden: false, tooDeep: true };
      }

      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          const item = val[i];
          if (item && typeof item === 'object') {
            if (depth + 1 > maxDepth) {
              return { forbidden: false, tooDeep: true };
            }
            stack.push({ val: item, depth: depth + 1 });
          }
        }
        continue;
      }

      const keys = Object.getOwnPropertyNames(val);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (FORBIDDEN_KEYS.has(k)) {
          return { forbidden: true, tooDeep: false };
        }
        const child = val[k];
        if (child && typeof child === 'object') {
          if (depth + 1 > maxDepth) {
            return { forbidden: false, tooDeep: true };
          }
          stack.push({ val: child, depth: depth + 1 });
        }
      }
    }
    return { forbidden: false, tooDeep: false };
  }

  function hasForbiddenKeys(node) {
    const res = inspectObjectSafety(node, MAX_OBJECT_DEPTH);
    return res.forbidden || res.tooDeep;
  }

  function sanitizePlainObject(obj, maxDepth = MAX_OBJECT_DEPTH) {
    if (!isPlainObject(obj)) return {};
    const out = {};
    const seen = new WeakMap();
    seen.set(obj, out);
    const stack = [{ src: obj, dst: out, depth: 0 }];

    while (stack.length > 0) {
      const { src, dst, depth } = stack.pop();
      if (Array.isArray(src)) {
        for (let i = 0; i < src.length; i++) {
          const item = src[i];
          if (isPlainObject(item)) {
            if (depth + 1 > maxDepth) continue;
            if (seen.has(item)) {
              dst.push(seen.get(item));
            } else {
              const childDst = {};
              seen.set(item, childDst);
              dst.push(childDst);
              stack.push({ src: item, dst: childDst, depth: depth + 1 });
            }
          } else if (Array.isArray(item)) {
            if (depth + 1 > maxDepth) {
              dst.push([]);
            } else if (seen.has(item)) {
              dst.push(seen.get(item));
            } else {
              const childDst = [];
              seen.set(item, childDst);
              dst.push(childDst);
              stack.push({ src: item, dst: childDst, depth: depth + 1 });
            }
          } else {
            dst.push(item);
          }
        }
        continue;
      }

      const keys = Object.keys(src);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (FORBIDDEN_KEYS.has(k)) continue;
        const val = src[k];
        if (isPlainObject(val)) {
          if (depth + 1 > maxDepth) continue;
          if (seen.has(val)) {
            dst[k] = seen.get(val);
          } else {
            const childDst = {};
            seen.set(val, childDst);
            dst[k] = childDst;
            stack.push({ src: val, dst: childDst, depth: depth + 1 });
          }
        } else if (Array.isArray(val)) {
          if (depth + 1 > maxDepth) continue;
          if (seen.has(val)) {
            dst[k] = seen.get(val);
          } else {
            const childDst = [];
            seen.set(val, childDst);
            dst[k] = childDst;
            stack.push({ src: val, dst: childDst, depth: depth + 1 });
          }
        } else {
          dst[k] = val;
        }
      }
    }
    return out;
  }

  function cloneDefaults() {
    return {
      ...DEFAULT_SETTINGS,
      enabledMediaApps: [...DEFAULT_SETTINGS.enabledMediaApps],
      mediaAppsOrder: [...DEFAULT_SETTINGS.mediaAppsOrder],
      customMediaApps: [],
      persistentAppIds: [],
      persistentOpenAppIds: [],
      persistentSavedAppUrls: {},
      bgAudioAppIds: [...DEFAULT_SETTINGS.bgAudioAppIds],
      accountConfigs: {},
      oauthAccounts: [],
      socialAppSoundMap: {},
      globalShortcuts: { ...DEFAULT_SETTINGS.globalShortcuts },
      appShortcuts: {}
    };
  }

  function isValidHexColor(val) {
    return typeof val === 'string' && HEX_COLOR_RE.test(val.trim());
  }

  function isSafeWebUrl(val) {
    if (typeof val !== 'string' || val.length > 2048) return false;
    try {
      const u = new URL(val.trim());
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  function isSafeImageRef(val) {
    if (typeof val !== 'string') return false;
    if (val === '') return true;
    const trimmed = val.trim();
    if (!trimmed || trimmed.length > MAX_MEDIA_DATA_URL_LEN) return false;
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) return true;
    if (/^data:image\/svg\+xml[;,]/i.test(trimmed)) return true;
    return isSafeWebUrl(trimmed);
  }

  function isSafeAudioDataUrl(val) {
    if (val === '') return true;
    if (typeof val !== 'string' || val.length > MAX_MEDIA_DATA_URL_LEN) return false;
    return /^data:audio\/[a-z0-9.+-]+;base64,/i.test(val.trim());
  }

  function normalizeShortcutString(str) {
    const raw = String(str || '').trim();
    if (!raw) return '';
    const parts = raw.split('+').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return '';
    const mods = new Set();
    let key = '';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const lower = p.toLowerCase();
      if (lower === 'ctrl' || lower === 'control' || lower === 'command' || lower === 'macctrl') {
        mods.add(lower === 'macctrl' ? 'MacCtrl' : lower === 'command' ? 'Command' : 'Ctrl');
      } else if (lower === 'alt') {
        mods.add('Alt');
      } else if (lower === 'shift') {
        mods.add('Shift');
      } else {
        if (key) return ''; // Multiple non-modifier keys
        if (/^[a-z0-9]$/i.test(p)) {
          key = p.toUpperCase();
        } else if (/^f([1-9]|1[0-2])$/i.test(p)) {
          key = p.toUpperCase();
        } else if (['Comma', 'Period', 'Space', 'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete', 'Up', 'Down', 'Left', 'Right'].includes(p)) {
          key = p;
        } else {
          return '';
        }
      }
    }
    if (!key) return '';
    const orderedMods = [];
    if (mods.has('Ctrl')) orderedMods.push('Ctrl');
    if (mods.has('Command')) orderedMods.push('Command');
    if (mods.has('MacCtrl')) orderedMods.push('MacCtrl');
    if (mods.has('Alt')) orderedMods.push('Alt');
    if (mods.has('Shift')) orderedMods.push('Shift');
    if (orderedMods.length > 2) return '';
    const isFn = /^F([1-9]|1[0-2])$/.test(key);
    if (!isFn && !mods.has('Ctrl') && !mods.has('Alt') && !mods.has('Command') && !mods.has('MacCtrl')) {
      return '';
    }
    return [...orderedMods, key].join('+');
  }

  function isValidShortcutString(str) {
    if (str === '') return true;
    if (typeof str !== 'string' || str.length > 40) return false;
    return normalizeShortcutString(str).length > 0;
  }

  function formatShortcutFromKeyEvent(ev) {
    if (!ev) return null;
    const k = ev.key || '';
    if (k === 'Escape') return { action: 'cancel' };
    if ((k === 'Backspace' || k === 'Delete') && !ev.ctrlKey && !ev.altKey && !ev.metaKey && !ev.shiftKey) {
      return { action: 'clear' };
    }
    if (k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta' || k === 'OS') {
      return null;
    }
    if (ev.getModifierState && ev.getModifierState('AltGraph')) {
      return null;
    }

    const isFnKey = /^F([1-9]|1[0-2])$/i.test(k);
    const useCtrl = Boolean(ev.ctrlKey || ev.metaKey);
    const useAlt = Boolean(ev.altKey);
    const useShift = Boolean(ev.shiftKey);
    const modCount = (useCtrl ? 1 : 0) + (useAlt ? 1 : 0) + (useShift ? 1 : 0);

    if (!isFnKey && !useCtrl && !useAlt) {
      return {
        action: 'invalid',
        message: 'Hold Alt+Shift or Ctrl+Shift + a key (or Backspace to clear)'
      };
    }
    if (modCount > 2) {
      return {
        action: 'invalid',
        message: 'Firefox supports up to 2 modifiers (e.g. Alt+Shift+Key or Ctrl+Shift+Key)'
      };
    }

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

    if (!keyToken) {
      return {
        action: 'invalid',
        message: 'Unsupported key — use A–Z, 0–9, or F1–F12 with Alt+Shift / Ctrl+Shift'
      };
    }

    const parts = [];
    if (useCtrl) parts.push('Ctrl');
    if (useAlt) parts.push('Alt');
    if (useShift) parts.push('Shift');
    parts.push(keyToken);
    return { action: 'set', shortcut: parts.join('+') };
  }

  function findShortcutConflicts(combo, settings = {}, exclude = {}) {
    const norm = normalizeShortcutString(combo);
    const conflicts = [];
    if (!norm) return conflicts;

    const gs = settings.globalShortcuts || {};
    for (const [k, v] of Object.entries(gs)) {
      if (exclude.scope === 'global' && exclude.key === k) continue;
      if (normalizeShortcutString(v) === norm) {
        conflicts.push({ scope: 'global', key: k, shortcut: norm });
      }
    }

    const apps = settings.appShortcuts || {};
    for (const [appId, v] of Object.entries(apps)) {
      if (exclude.scope === 'app' && exclude.key === appId) continue;
      if (normalizeShortcutString(v) === norm) {
        conflicts.push({ scope: 'app', key: appId, shortcut: norm });
      }
    }

    if (exclude.scope !== 'quickSwitcher' && normalizeShortcutString(settings.quickSwitcherShortcut) === norm) {
      conflicts.push({ scope: 'quickSwitcher', key: 'quickSwitcherShortcut', shortcut: norm });
    }
    return conflicts;
  }

  function clampNum(val, min, max, fallback) {
    if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
    return Math.min(max, Math.max(min, val));
  }

  function normalizeCustomAppEntry(c, idx) {
    if (!isPlainObject(c)) return null;
    const rawUrl = typeof c.url === 'string' ? c.url.trim() : '';
    const url = isSafeWebUrl(rawUrl) ? rawUrl : (typeof c.defaultUrl === 'string' && isSafeWebUrl(c.defaultUrl) ? c.defaultUrl.trim() : '');
    if (!url) return null;
    const id = typeof c.id === 'string' && c.id.trim() ? c.id.trim().slice(0, 80) : `custom-${idx}`;
    const name = typeof c.name === 'string' && c.name.trim() ? c.name.trim().slice(0, 60) : 'Custom App';
    const color = isValidHexColor(c.color) ? c.color.trim() : '#C85A32';
    const iconUrl = isSafeImageRef(c.iconUrl) ? String(c.iconUrl || '').trim() : '';
    const userAgentMode = c.userAgentMode === 'mobile' || c.userAgentMode === 'desktop' ? c.userAgentMode : 'default';
    return {
      id,
      name,
      url,
      color,
      iconUrl,
      enabled: c.enabled !== false,
      userAgentMode
    };
  }

  function normalizeSettings(raw, options = {}) {
    const base = cloneDefaults();
    if (!isPlainObject(raw)) {
      return base;
    }
    const cleanRaw = sanitizePlainObject(raw);
    const merged = { ...base, ...cleanRaw };
    const skipLegacyMigrations = Boolean(options && options.skipLegacyMigrations);

    // Remove legacy/alias-only keys from the canonical output
    delete merged.mediaPersistenceMode;
    delete merged.lastActiveAppId;
    delete merged.savedAppSessions;
    delete merged.savedOpenPersistentApps;

    // 1. One-shot v2.7.9 & v2.8.0 migrations (only when upgrading stored raw settings)
    let ranTopBarMigration = false;
    let ranPersistenceV4Migration = false;
    if (!skipLegacyMigrations) {
      if (!cleanRaw.topBarAutoHideMigratedV1) {
        if (cleanRaw.mediaTopBarMode === undefined) {
          merged.autoHideMediaTopBar = true;
          merged.mediaTopBarMode = 'hover';
          ranTopBarMigration = true;
        }
        merged.topBarAutoHideMigratedV1 = true;
      }
      if (!cleanRaw.persistenceDefaultOffMigratedV4) {
        ranPersistenceV4Migration = true;
        merged.persistenceMode = 'selected';
        merged.persistentAppIds = [];
        merged.persistenceDefaultSelectedMigratedV1 = true;
        merged.persistenceYoutubeAddedMigratedV2 = true;
        merged.persistenceAllSocialMigratedV3 = true;
        merged.persistenceDefaultOffMigratedV4 = true;
      }
      if (!cleanRaw.bgAudioAppIdsMigratedV1) {
        merged.bgAudioAppIds = ['spotify', 'youtube', 'soundcloud'];
        merged.bgAudioAppIdsMigratedV1 = true;
        merged.bgAudioAppIdsSoundCloudMigratedV2 = true;
      } else if (!cleanRaw.bgAudioAppIdsSoundCloudMigratedV2) {
        const prevBg = Array.isArray(merged.bgAudioAppIds) ? merged.bgAudioAppIds : [];
        if (prevBg.length === 2 && prevBg.includes('spotify') && prevBg.includes('youtube')) {
          merged.bgAudioAppIds = ['spotify', 'youtube', 'soundcloud'];
        }
        merged.bgAudioAppIdsSoundCloudMigratedV2 = true;
      }
      if (!cleanRaw.miniNowPlayingKeepPausedMigratedV1) {
        if (cleanRaw.topBarAutoHideMigratedV1 && cleanRaw.persistenceDefaultOffMigratedV4) {
          merged.miniNowPlayingAutoHidePaused = false;
        }
        merged.miniNowPlayingKeepPausedMigratedV1 = true;
      }
    } else {
      merged.topBarAutoHideMigratedV1 = true;
      merged.bgAudioAppIdsMigratedV1 = true;
      merged.bgAudioAppIdsSoundCloudMigratedV2 = true;
      merged.persistenceDefaultSelectedMigratedV1 = true;
      merged.persistenceYoutubeAddedMigratedV2 = true;
      merged.persistenceAllSocialMigratedV3 = true;
      merged.persistenceDefaultOffMigratedV4 = true;
      merged.miniNowPlayingKeepPausedMigratedV1 = true;
    }

    // 2. Bidirectional alias synchronization
    // mediaTopBarMode <-> autoHideMediaTopBar
    if (ranTopBarMigration) {
      merged.mediaTopBarMode = 'hover';
      merged.autoHideMediaTopBar = true;
    } else if (ENUMS.mediaTopBarMode.has(cleanRaw.mediaTopBarMode)) {
      merged.mediaTopBarMode = cleanRaw.mediaTopBarMode;
      merged.autoHideMediaTopBar = cleanRaw.mediaTopBarMode !== 'pinned';
    } else if (typeof cleanRaw.autoHideMediaTopBar === 'boolean') {
      merged.autoHideMediaTopBar = cleanRaw.autoHideMediaTopBar;
      merged.mediaTopBarMode = cleanRaw.autoHideMediaTopBar ? 'hover' : 'pinned';
    } else {
      merged.mediaTopBarMode = 'hover';
      merged.autoHideMediaTopBar = true;
    }

    // persistenceMode <- mediaPersistenceMode
    if (ranPersistenceV4Migration) {
      merged.persistenceMode = 'selected';
    } else if (ENUMS.persistenceMode.has(cleanRaw.persistenceMode)) {
      merged.persistenceMode = cleanRaw.persistenceMode;
    } else if (typeof cleanRaw.mediaPersistenceMode === 'string') {
      const legacy = cleanRaw.mediaPersistenceMode;
      merged.persistenceMode =
        legacy === 'none' ? 'eco' : legacy === 'custom' ? 'selected' : legacy === 'all' ? 'all' : 'selected';
    } else {
      merged.persistenceMode = base.persistenceMode;
    }

    // Legacy persistence session keys
    if (typeof cleanRaw.persistentLastActiveAppId !== 'string' && typeof cleanRaw.lastActiveAppId === 'string') {
      merged.persistentLastActiveAppId = cleanRaw.lastActiveAppId;
    }
    if (!isPlainObject(cleanRaw.persistentSavedAppUrls) && isPlainObject(cleanRaw.savedAppSessions)) {
      merged.persistentSavedAppUrls = sanitizePlainObject(cleanRaw.savedAppSessions);
    }
    if (!Array.isArray(cleanRaw.persistentOpenAppIds) && Array.isArray(cleanRaw.savedOpenPersistentApps)) {
      merged.persistentOpenAppIds = cleanRaw.savedOpenPersistentApps.filter((id) => typeof id === 'string');
    }

    // gradientColor1/2 <-> customGradient1/2
    const g1 = isValidHexColor(cleanRaw.customGradient1)
      ? cleanRaw.customGradient1.trim()
      : isValidHexColor(cleanRaw.gradientColor1)
        ? cleanRaw.gradientColor1.trim()
        : base.gradientColor1;
    const g2 = isValidHexColor(cleanRaw.customGradient2)
      ? cleanRaw.customGradient2.trim()
      : isValidHexColor(cleanRaw.gradientColor2)
        ? cleanRaw.gradientColor2.trim()
        : base.gradientColor2;
    merged.gradientColor1 = g1;
    merged.customGradient1 = g1;
    merged.gradientColor2 = g2;
    merged.customGradient2 = g2;

    // tabAudioBehavior <-> autoPauseOnTabAudio
    if (ENUMS.tabAudioBehavior.has(cleanRaw.tabAudioBehavior)) {
      merged.tabAudioBehavior = cleanRaw.tabAudioBehavior;
      merged.autoPauseOnTabAudio = cleanRaw.tabAudioBehavior !== 'off';
    } else if (typeof cleanRaw.autoPauseOnTabAudio === 'boolean') {
      merged.autoPauseOnTabAudio = cleanRaw.autoPauseOnTabAudio;
      merged.tabAudioBehavior = cleanRaw.autoPauseOnTabAudio ? 'pause-resume' : 'off';
    } else {
      merged.tabAudioBehavior = 'pause-resume';
      merged.autoPauseOnTabAudio = true;
    }

    // muteSiteNotifications <-> socialAppNotifySounds
    if (cleanRaw.muteSiteNotifications === undefined && cleanRaw.socialAppNotifySounds === false) {
      merged.muteSiteNotifications = true;
      merged.socialAppNotifySounds = false;
    } else if (cleanRaw.muteSiteNotifications === true && cleanRaw.socialAppNotifySounds !== false) {
      merged.muteSiteNotifications = true;
      merged.socialAppNotifySounds = false;
    } else if (typeof cleanRaw.muteSiteNotifications === 'boolean') {
      merged.muteSiteNotifications = cleanRaw.muteSiteNotifications;
      merged.socialAppNotifySounds = !cleanRaw.muteSiteNotifications;
    } else if (typeof cleanRaw.socialAppNotifySounds === 'boolean') {
      merged.socialAppNotifySounds = cleanRaw.socialAppNotifySounds;
      merged.muteSiteNotifications = !cleanRaw.socialAppNotifySounds;
    } else {
      merged.muteSiteNotifications = false;
      merged.socialAppNotifySounds = true;
    }

    // 3. Validate enums, colors, numbers, arrays, objects
    if (!VALID_THEMES.has(merged.theme)) merged.theme = base.theme;
    if (!VALID_THEMES.has(merged.previousDayTheme)) merged.previousDayTheme = base.previousDayTheme;
    if (!VALID_WALLPAPERS.has(merged.wallpaper)) merged.wallpaper = base.wallpaper;
    if (!VALID_WALLPAPERS.has(merged.previousDayWallpaper)) merged.previousDayWallpaper = base.previousDayWallpaper;
    if (!VALID_SOUNDS.has(merged.soundId)) merged.soundId = base.soundId;
    if (!isValidHexColor(merged.videoLoadbarColor)) merged.videoLoadbarColor = base.videoLoadbarColor;

    for (const [k, validSet] of Object.entries(ENUMS)) {
      if (!validSet.has(merged[k])) {
        merged[k] = base[k];
      }
    }

    for (const [k, [min, max]] of Object.entries(NUMBER_RANGES)) {
      merged[k] = clampNum(merged[k], min, max, base[k]);
    }

    // Booleans
    const boolKeys = [
      'showLeftAccent',
      'autoFitEmail',
      'desktopNotifications',
      'voiceNotifications',
      'muteEmailNotifications',
      'muteSiteNotifications',
      'socialAppNotifySounds',
      'hideMediaBottomBar',
      'autoHideMediaTopBar',
      'hasSeenTopBarHint',
      'keepAudioPlayingWhenClosed',
      'autoPauseOnTabAudio',
      'customVideoLoadbar',
      'miniNowPlayingEnabled',
      'miniNowPlayingCompact',
      'miniNowPlayingShowProgress',
      'miniNowPlayingAutoHidePaused',
      'contextMenuEnabled',
      'quickSwitcherEnabled',
      'railPlayingIndicatorEnabled',
      'railQuickControlsEnabled'
    ];
    for (let i = 0; i < boolKeys.length; i++) {
      const bk = boolKeys[i];
      if (typeof merged[bk] !== 'boolean') {
        merged[bk] = base[bk];
      }
    }

    // String arrays
    for (const arrKey of ['enabledMediaApps', 'mediaAppsOrder', 'persistentAppIds', 'persistentOpenAppIds', 'bgAudioAppIds']) {
      if (!Array.isArray(merged[arrKey])) {
        merged[arrKey] = [...base[arrKey]];
      } else {
        merged[arrKey] = Array.from(
          new Set(merged[arrKey].filter((item) => typeof item === 'string' && item.trim().length > 0))
        );
      }
    }

    // Custom media apps
    if (Array.isArray(cleanRaw.customMediaApps)) {
      merged.customMediaApps = cleanRaw.customMediaApps
        .map((c, idx) => normalizeCustomAppEntry(c, idx))
        .filter(Boolean);
    } else {
      merged.customMediaApps = [];
    }

    // Safe plain objects
    merged.accountConfigs = isPlainObject(merged.accountConfigs) ? sanitizePlainObject(merged.accountConfigs) : {};
    merged.socialAppSoundMap = isPlainObject(merged.socialAppSoundMap) ? sanitizePlainObject(merged.socialAppSoundMap) : {};
    merged.persistentSavedAppUrls = isPlainObject(merged.persistentSavedAppUrls)
      ? sanitizePlainObject(merged.persistentSavedAppUrls)
      : {};
    merged.oauthAccounts = Array.isArray(merged.oauthAccounts)
      ? merged.oauthAccounts.filter((a) => isPlainObject(a) && typeof a.email === 'string')
      : [];

    // Shortcuts
    const rawGs = isPlainObject(merged.globalShortcuts) ? sanitizePlainObject(merged.globalShortcuts) : {};
    merged.globalShortcuts = {
      popup: isValidShortcutString(rawGs.popup) ? (rawGs.popup ? normalizeShortcutString(rawGs.popup) : '') : base.globalShortcuts.popup,
      sidebar: isValidShortcutString(rawGs.sidebar) ? (rawGs.sidebar ? normalizeShortcutString(rawGs.sidebar) : '') : base.globalShortcuts.sidebar,
      popout: isValidShortcutString(rawGs.popout) ? (rawGs.popout ? normalizeShortcutString(rawGs.popout) : '') : base.globalShortcuts.popout
    };

    const rawAs = isPlainObject(merged.appShortcuts) ? sanitizePlainObject(merged.appShortcuts) : {};
    const cleanAs = {};
    for (const [k, v] of Object.entries(rawAs)) {
      if (typeof v === 'string' && v.trim() && isValidShortcutString(v)) {
        cleanAs[k] = normalizeShortcutString(v);
      }
    }
    merged.appShortcuts = cleanAs;

    merged.quickSwitcherShortcut = isValidShortcutString(merged.quickSwitcherShortcut) && merged.quickSwitcherShortcut
      ? normalizeShortcutString(merged.quickSwitcherShortcut)
      : base.quickSwitcherShortcut;

    // URL/data fields
    merged.customWallpaperData = isSafeImageRef(merged.customWallpaperData) ? String(merged.customWallpaperData || '') : '';
    merged.customWallpaperUrl = isSafeImageRef(merged.customWallpaperUrl) ? String(merged.customWallpaperUrl || '') : '';
    merged.customAudioData = isSafeAudioDataUrl(merged.customAudioData) ? String(merged.customAudioData || '') : '';
    merged.instagramOwnProfileUrl = isSafeWebUrl(merged.instagramOwnProfileUrl) ? merged.instagramOwnProfileUrl.trim() : '';
    merged.tiktokOwnProfileUrlV2 = isSafeWebUrl(merged.tiktokOwnProfileUrlV2) ? merged.tiktokOwnProfileUrlV2.trim() : '';
    merged.xOwnProfileUrl = isSafeWebUrl(merged.xOwnProfileUrl) ? merged.xOwnProfileUrl.trim() : '';

    return merged;
  }

  function normalizeSettingsPatch(patch, current = DEFAULT_SETTINGS) {
    const hasExistingCurrent = isPlainObject(current) && Object.keys(current).length > 0;
    if (!isPlainObject(patch) || hasForbiddenKeys(patch)) {
      return normalizeSettings(current, { skipLegacyMigrations: hasExistingCurrent });
    }
    const cleanPatch = sanitizePlainObject(patch);
    const workingPatch = { ...cleanPatch };

    // Respect whichever side of a bidirectional alias was explicitly provided in this patch
    if (workingPatch.customGradient1 !== undefined && workingPatch.gradientColor1 === undefined) {
      workingPatch.gradientColor1 = workingPatch.customGradient1;
    } else if (workingPatch.gradientColor1 !== undefined && workingPatch.customGradient1 === undefined) {
      workingPatch.customGradient1 = workingPatch.gradientColor1;
    }
    if (workingPatch.customGradient2 !== undefined && workingPatch.gradientColor2 === undefined) {
      workingPatch.gradientColor2 = workingPatch.customGradient2;
    } else if (workingPatch.gradientColor2 !== undefined && workingPatch.customGradient2 === undefined) {
      workingPatch.customGradient2 = workingPatch.gradientColor2;
    }

    if (workingPatch.mediaTopBarMode !== undefined && workingPatch.autoHideMediaTopBar === undefined) {
      workingPatch.autoHideMediaTopBar = workingPatch.mediaTopBarMode !== 'pinned';
    } else if (workingPatch.autoHideMediaTopBar !== undefined && workingPatch.mediaTopBarMode === undefined) {
      workingPatch.mediaTopBarMode = workingPatch.autoHideMediaTopBar ? 'hover' : 'pinned';
    }

    if (workingPatch.tabAudioBehavior !== undefined && workingPatch.autoPauseOnTabAudio === undefined) {
      workingPatch.autoPauseOnTabAudio = workingPatch.tabAudioBehavior !== 'off';
    } else if (workingPatch.autoPauseOnTabAudio !== undefined && workingPatch.tabAudioBehavior === undefined) {
      workingPatch.tabAudioBehavior = workingPatch.autoPauseOnTabAudio ? 'pause-resume' : 'off';
    }

    if (workingPatch.muteSiteNotifications !== undefined && workingPatch.socialAppNotifySounds === undefined) {
      workingPatch.socialAppNotifySounds = !workingPatch.muteSiteNotifications;
    } else if (workingPatch.socialAppNotifySounds !== undefined && workingPatch.muteSiteNotifications === undefined) {
      workingPatch.muteSiteNotifications = !workingPatch.socialAppNotifySounds;
    }

    if (workingPatch.mediaPersistenceMode !== undefined && workingPatch.persistenceMode === undefined) {
      workingPatch.persistenceMode =
        workingPatch.mediaPersistenceMode === 'none'
          ? 'eco'
          : workingPatch.mediaPersistenceMode === 'custom'
            ? 'selected'
            : workingPatch.mediaPersistenceMode;
    }

    const baseCurrent = isPlainObject(current) ? sanitizePlainObject(current) : {};
    return normalizeSettings({ ...baseCurrent, ...workingPatch }, { skipLegacyMigrations: true });
  }

  const EPHEMERAL_OR_SENSITIVE_KEYS = new Set([
    'oauthAccounts',
    'dndUntil',
    'muteSitesUntil',
    'lastMuteTimerMins',
    'persistentOpenAppIds',
    'persistentSavedAppUrls',
    'persistentLastActiveAppId'
  ]);

  const ALLOWED_IMPORT_KEYS = new Set(
    Object.keys(DEFAULT_SETTINGS).filter((k) => k !== 'oauthAccounts')
  );

  function buildSettingsExportPayload(settings, opts = {}) {
    const normalized = normalizeSettings(settings);
    const exportSettings = {};
    for (const key of Object.keys(normalized)) {
      if (EPHEMERAL_OR_SENSITIVE_KEYS.has(key)) continue;
      exportSettings[key] = normalized[key];
    }
    return {
      schema: 'foxhub-settings-backup',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      appVersion: String(opts.appVersion || '2.8.0'),
      settings: exportSettings
    };
  }

  function validateAndSanitizeImportPayload(jsonOrObj) {
    let parsed = jsonOrObj;
    if (typeof jsonOrObj === 'string') {
      const trimmed = jsonOrObj.trim();
      if (!trimmed) {
        return { ok: false, error: 'Backup file is empty.' };
      }
      try {
        parsed = JSON.parse(trimmed);
      } catch (err) {
        return { ok: false, error: `Invalid JSON: ${err && err.message ? err.message : 'parse error'}` };
      }
    }

    if (!isPlainObject(parsed)) {
      return { ok: false, error: 'Backup root must be a JSON object.' };
    }
    const safety = inspectObjectSafety(parsed, MAX_OBJECT_DEPTH);
    if (safety.forbidden) {
      return { ok: false, error: 'Backup contains forbidden prototype keys.' };
    }
    if (safety.tooDeep) {
      return { ok: false, error: 'Payload nesting exceeds maximum depth.' };
    }

    let rawSettings = null;
    if ('schema' in parsed || 'schemaVersion' in parsed || 'settings' in parsed) {
      if (parsed.schema !== 'foxhub-settings-backup') {
        return { ok: false, error: 'Unsupported backup schema.' };
      }
      if (parsed.schemaVersion !== 1) {
        return { ok: false, error: 'Unsupported backup schemaVersion.' };
      }
      if (!isPlainObject(parsed.settings)) {
        return { ok: false, error: 'Backup settings payload must be an object.' };
      }
      rawSettings = parsed.settings;
    } else {
      rawSettings = parsed;
    }

    const keys = Object.keys(rawSettings);
    if (keys.length === 0) {
      return { ok: false, error: 'Backup contains no settings.' };
    }

    const recognizedCount = keys.filter((k) => ALLOWED_IMPORT_KEYS.has(k)).length;
    if (recognizedCount === 0) {
      return { ok: false, error: 'Backup contains no recognized FoxHub settings.' };
    }

    const warnings = [];
    const validated = {};

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = rawSettings[k];
      if (k === 'oauthAccounts') {
        warnings.push('Skipped oauthAccounts for security.');
        continue;
      }
      if (!ALLOWED_IMPORT_KEYS.has(k)) {
        warnings.push(`Ignored unknown key "${k}".`);
        continue;
      }

      const defVal = DEFAULT_SETTINGS[k];

      if (k === 'theme' || k === 'previousDayTheme') {
        if (typeof v !== 'string' || !VALID_THEMES.has(v)) {
          return { ok: false, error: `Invalid theme value for "${k}".` };
        }
        validated[k] = v;
        continue;
      }
      if (k === 'wallpaper' || k === 'previousDayWallpaper') {
        if (typeof v !== 'string' || !VALID_WALLPAPERS.has(v)) {
          return { ok: false, error: `Invalid wallpaper value for "${k}".` };
        }
        validated[k] = v;
        continue;
      }
      if (k === 'soundId') {
        if (typeof v !== 'string' || !VALID_SOUNDS.has(v)) {
          return { ok: false, error: 'Invalid soundId preset.' };
        }
        validated[k] = v;
        continue;
      }
      if (ENUMS[k]) {
        if (typeof v !== 'string' || !ENUMS[k].has(v)) {
          return { ok: false, error: `Invalid option "${String(v)}" for "${k}".` };
        }
        validated[k] = v;
        continue;
      }
      if (NUMBER_RANGES[k]) {
        const [min, max] = NUMBER_RANGES[k];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
          return { ok: false, error: `Numeric value for "${k}" must be between ${min} and ${max}.` };
        }
        validated[k] = v;
        continue;
      }
      if (k === 'gradientColor1' || k === 'gradientColor2' || k === 'customGradient1' || k === 'customGradient2' || k === 'videoLoadbarColor') {
        if (!isValidHexColor(v)) {
          return { ok: false, error: `Invalid hex color for "${k}".` };
        }
        validated[k] = v.trim();
        continue;
      }
      if (k === 'customWallpaperData' || k === 'customWallpaperUrl') {
        if (typeof v !== 'string' || !isSafeImageRef(v)) {
          return { ok: false, error: `Unsafe image URL or data URL for "${k}".` };
        }
        validated[k] = v.trim();
        continue;
      }
      if (k === 'customAudioData') {
        if (typeof v !== 'string' || !isSafeAudioDataUrl(v)) {
          return { ok: false, error: 'Unsafe customAudioData value.' };
        }
        validated[k] = v.trim();
        continue;
      }
      if (k === 'instagramOwnProfileUrl' || k === 'tiktokOwnProfileUrlV2' || k === 'xOwnProfileUrl') {
        if (typeof v !== 'string' || (v !== '' && !isSafeWebUrl(v))) {
          return { ok: false, error: `Invalid URL for "${k}".` };
        }
        validated[k] = v.trim();
        continue;
      }
      if (k === 'quickSwitcherShortcut') {
        if (typeof v !== 'string' || !v.trim() || !isValidShortcutString(v)) {
          return { ok: false, error: 'Invalid quickSwitcherShortcut.' };
        }
        validated[k] = normalizeShortcutString(v);
        continue;
      }
      if (k === 'globalShortcuts') {
        if (!isPlainObject(v)) return { ok: false, error: 'globalShortcuts must be an object.' };
        const cleanGs = {};
        for (const [gk, gv] of Object.entries(v)) {
          if (!['popup', 'sidebar', 'popout'].includes(gk)) continue;
          if (typeof gv !== 'string' || !isValidShortcutString(gv)) {
            return { ok: false, error: `Invalid global shortcut for "${gk}".` };
          }
          cleanGs[gk] = gv ? normalizeShortcutString(gv) : '';
        }
        validated.globalShortcuts = cleanGs;
        continue;
      }
      if (k === 'appShortcuts') {
        if (!isPlainObject(v)) return { ok: false, error: 'appShortcuts must be an object.' };
        const cleanAs = {};
        for (const [ak, av] of Object.entries(v)) {
          if (typeof av !== 'string' || !isValidShortcutString(av)) {
            return { ok: false, error: `Invalid app shortcut for "${ak}".` };
          }
          if (av.trim()) cleanAs[ak] = normalizeShortcutString(av);
        }
        validated.appShortcuts = cleanAs;
        continue;
      }
      if (k === 'customMediaApps') {
        if (!Array.isArray(v)) return { ok: false, error: 'customMediaApps must be an array.' };
        const cleanCustom = [];
        for (let ci = 0; ci < v.length; ci++) {
          const item = v[ci];
          if (!isPlainObject(item)) {
            return { ok: false, error: `customMediaApps[${ci}] must be an object.` };
          }
          if (!isSafeWebUrl(item.url)) {
            return { ok: false, error: `customMediaApps[${ci}].url must be an http(s) URL.` };
          }
          if (item.iconUrl !== undefined && item.iconUrl !== '' && !isSafeImageRef(item.iconUrl)) {
            return { ok: false, error: `customMediaApps[${ci}].iconUrl is unsafe.` };
          }
          if (item.color !== undefined && item.color !== '' && !isValidHexColor(item.color)) {
            return { ok: false, error: `customMediaApps[${ci}].color must be a hex color.` };
          }
          if (
            item.userAgentMode !== undefined &&
            item.userAgentMode !== 'default' &&
            item.userAgentMode !== 'mobile' &&
            item.userAgentMode !== 'desktop'
          ) {
            return { ok: false, error: `customMediaApps[${ci}].userAgentMode is invalid.` };
          }
          cleanCustom.push(normalizeCustomAppEntry(item, ci));
        }
        validated.customMediaApps = cleanCustom.filter(Boolean);
        continue;
      }
      if (Array.isArray(defVal)) {
        if (!Array.isArray(v) || !v.every((item) => typeof item === 'string')) {
          return { ok: false, error: `"${k}" must be an array of strings.` };
        }
        validated[k] = Array.from(new Set(v.map((s) => s.trim()).filter(Boolean)));
        continue;
      }
      if (typeof defVal === 'boolean') {
        if (typeof v !== 'boolean') {
          return { ok: false, error: `"${k}" must be a boolean.` };
        }
        validated[k] = v;
        continue;
      }
      if (isPlainObject(defVal)) {
        if (!isPlainObject(v)) {
          return { ok: false, error: `"${k}" must be an object.` };
        }
        validated[k] = sanitizePlainObject(v);
        continue;
      }
      if (typeof defVal === 'string') {
        if (typeof v !== 'string' || v.length > 2048) {
          return { ok: false, error: `"${k}" must be a string.` };
        }
        validated[k] = v;
      }
    }

    validated.topBarAutoHideMigratedV1 = true;
    validated.bgAudioAppIdsMigratedV1 = true;
    validated.bgAudioAppIdsSoundCloudMigratedV2 = true;
    validated.persistenceDefaultSelectedMigratedV1 = true;
    validated.persistenceYoutubeAddedMigratedV2 = true;
    validated.persistenceAllSocialMigratedV3 = true;
    validated.persistenceDefaultOffMigratedV4 = true;

    const normalized = normalizeSettings(validated, { skipLegacyMigrations: true });
    return { ok: true, settings: normalized, warnings };
  }

  const schemaApi = {
    DEFAULT_SETTINGS,
    THEME_OR_LAYOUT_KEYS,
    VALID_THEMES,
    VALID_WALLPAPERS,
    VALID_SOUNDS,
    ENUMS,
    NUMBER_RANGES,
    normalizeSettings,
    normalizeSettingsPatch,
    buildSettingsExportPayload,
    buildExportPayload: buildSettingsExportPayload,
    validateAndSanitizeImportPayload,
    validateImportPayload: validateAndSanitizeImportPayload,
    formatShortcutFromKeyEvent,
    normalizeShortcutString,
    isValidShortcutString,
    findShortcutConflicts,
    isSafeWebUrl,
    isSafeImageRef
  };

  global.FoxHubSettingsSchema = schemaApi;
  global.PocketMailSettingsSchema = schemaApi;
})(typeof window !== 'undefined' ? window : this);
