/**
 * FoxHub Background — WebRequest Framing Unblock, First-Party Cookie Sync,
 * Custom App Mobile/Desktop User-Agent Override, SW Blocker & Gmail Frame-Buster Stripper
 */

(function (global) {
  const bg = (global.FoxHubBg = global.FoxHubBg || {});

  const COOKIE_CACHE_TTL_MS = 300000;
  const cookieLookupCache = new Map();
  const liveFrameCookiesByOrigin = new Map();

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
    'sndcdn.com',
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
    'akamaized.net',
    'api-partner.spotify.com',
    'clienttoken.spotify.com',
    'api.spotify.com',
    'spclient.wg.spotify.com'
  ];

  const EXTRA_SOCIAL_AUTH_SUFFIXES = [
    'google.com',
    'whatsapp.net',
    'discordapp.com',
    'facebook.com',
    'anthropic.com',
    'apple.com',
    'bsky.social',
    'notion.so',
    'notion.site'
  ];

  const EXTRA_PREWARM_ORIGINS = [
    'https://accounts.spotify.com/',
    'https://www.facebook.com/',
    'https://api.x.com/'
  ];

  function getMediaAppsCatalog() {
    return global.FoxHubMediaApps || global.PocketMailMediaApps || null;
  }

  function isStaticCdnHost(hostname, fullUrl = '') {
    const h = (hostname || '').toLowerCase();
    if (STATIC_CDN_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`))) {
      return true;
    }
    if (h.endsWith('.spotify.com') && h !== 'open.spotify.com' && h !== 'accounts.spotify.com') {
      return true;
    }
    if (h.endsWith('.tiktok.com') && /^(v\d+|pull-|video|mcs\.|mon\.|log\.|sf\d+|lf\d+|p\d+)/i.test(h)) {
      return true;
    }
    if (fullUrl && /\/(hcaptcha|recaptcha|turnstile)\b/i.test(fullUrl)) {
      return true;
    }
    return false;
  }

  function getEmbeddedSocialHostSuffixes() {
    const suffixes = new Set(EXTRA_SOCIAL_AUTH_SUFFIXES);
    const catalog = getMediaAppsCatalog();
    if (catalog && Array.isArray(catalog.BUILTIN_MEDIA_APPS)) {
      catalog.BUILTIN_MEDIA_APPS.forEach((app) => {
        (app.hostSuffixes || []).forEach((s) => suffixes.add(String(s).toLowerCase()));
      });
    }
    const customs = bg.state.currentSettings?.customMediaApps;
    if (Array.isArray(customs)) {
      customs.forEach((c) => {
        try {
          if (c && c.url) {
            const h = new URL(c.url).hostname.toLowerCase().replace(/^www\./, '');
            if (h) suffixes.add(h);
          }
        } catch (_) {}
      });
    }
    return Array.from(suffixes);
  }

  function isEmbeddedSocialHost(urlStr) {
    if (!urlStr) return false;
    try {
      const h = new URL(urlStr).hostname.toLowerCase();
      return getEmbeddedSocialHostSuffixes().some((s) => h === s || h.endsWith(`.${s}`));
    } catch (_) {
      return false;
    }
  }

  function getPrewarmSocialUrls() {
    const urls = new Set(EXTRA_PREWARM_ORIGINS);
    const catalog = getMediaAppsCatalog();
    if (catalog && Array.isArray(catalog.BUILTIN_MEDIA_APPS)) {
      catalog.BUILTIN_MEDIA_APPS.forEach((app) => {
        try {
          if (app.defaultUrl) urls.add(`${new URL(app.defaultUrl).origin}/`);
        } catch (_) {}
        (app.subViews || []).forEach((sv) => {
          try {
            if (sv && sv.url) urls.add(`${new URL(sv.url).origin}/`);
          } catch (_) {}
        });
      });
    }
    const customs = bg.state.currentSettings?.customMediaApps;
    if (Array.isArray(customs)) {
      customs.forEach((c) => {
        try {
          if (c && c.url) urls.add(`${new URL(c.url).origin}/`);
        } catch (_) {}
      });
    }
    return Array.from(urls);
  }

  function getRootOriginForHost(hostname) {
    const h = (hostname || '').toLowerCase();
    if (!h) return '';
    if (h === 'facebook.com' || h.endsWith('.facebook.com')) return 'https://www.facebook.com';
    const catalog = getMediaAppsCatalog();
    if (catalog && Array.isArray(catalog.BUILTIN_MEDIA_APPS)) {
      for (const app of catalog.BUILTIN_MEDIA_APPS) {
        if (Array.isArray(app.hostSuffixes) && app.hostSuffixes.some((s) => h === s || h.endsWith(`.${s}`))) {
          try {
            return new URL(app.defaultUrl).origin;
          } catch (_) {}
        }
      }
    }
    return '';
  }

  function getBaseSiteKey(hostname) {
    const h = (hostname || '').toLowerCase();
    if (!h) return '';
    const catalog = getMediaAppsCatalog();
    if (catalog && Array.isArray(catalog.BUILTIN_MEDIA_APPS)) {
      for (const app of catalog.BUILTIN_MEDIA_APPS) {
        if (Array.isArray(app.hostSuffixes) && app.hostSuffixes.some((s) => h === s || h.endsWith(`.${s}`))) {
          if (app.id === 'google-calendar' || app.id === 'google-keep' || app.id === 'gemini') {
            return 'google';
          }
          return app.id;
        }
      }
    }
    if (h === 'google.com' || h.endsWith('.google.com') || h.endsWith('.gstatic.com') || h.endsWith('.googleapis.com')) {
      return 'google';
    }
    if (h === 'facebook.com' || h.endsWith('.facebook.com')) return 'facebook';
    if (h === 'apple.com' || h.endsWith('.apple.com')) return 'apple';
    const parts = h.split('.');
    return parts.length >= 2 ? parts.slice(-2).join('.') : h;
  }

  function resolveCustomAppUserAgentMode(parsedUrl, initiatorUrlStr = '') {
    const customs = bg.state.currentSettings?.customMediaApps;
    if (!Array.isArray(customs) || customs.length === 0) return 'default';

    const candidates = [];
    if (parsedUrl && parsedUrl.hostname) {
      candidates.push(parsedUrl.hostname.toLowerCase().replace(/^www\./, ''));
    }
    if (initiatorUrlStr && initiatorUrlStr.startsWith('http')) {
      try {
        candidates.push(new URL(initiatorUrlStr).hostname.toLowerCase().replace(/^www\./, ''));
      } catch (_) {}
    }
    if (candidates.length === 0) return 'default';

    for (let i = 0; i < customs.length; i++) {
      const c = customs[i];
      if (!c || c.enabled === false || (c.userAgentMode !== 'mobile' && c.userAgentMode !== 'desktop')) continue;
      try {
        const customHost = new URL(c.url).hostname.toLowerCase().replace(/^www\./, '');
        if (!customHost) continue;
        if (candidates.some((ch) => ch === customHost || ch.endsWith(`.${customHost}`))) {
          return c.userAgentMode;
        }
      } catch (_) {}
    }
    return 'default';
  }

  function getCustomUserAgentString(mode) {
    if (mode !== 'mobile' && mode !== 'desktop') return '';
    const rawUa = typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '';
    const match = rawUa.match(/Firefox\/(\d+(?:\.\d+)?)/);
    const ffVer = match ? match[1] : '142.0';
    if (mode === 'mobile') {
      return `Mozilla/5.0 (Android 14; Mobile; rv:${ffVer}) Gecko/${ffVer} Firefox/${ffVer}`;
    }
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${ffVer}) Gecko/20100101 Firefox/${ffVer}`;
  }

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

  function prewarmSocialCookieCache(specificUrl = '') {
    if (!browser.cookies || !browser.cookies.getAll) return;
    const urls = specificUrl ? [specificUrl] : getPrewarmSocialUrls();
    urls.forEach((u) => {
      try {
        const origin = new URL(u).origin;
        if (!getSyncCachedCookies(origin)) {
          getCachedCookiesForOrigin(u, origin).catch(() => {});
        }
      } catch (_) {}
    });
  }

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

  function clearSocialThemeLiveCookies() {
    const xLive = liveFrameCookiesByOrigin.get('https://x.com');
    if (xLive) xLive.delete('night_mode');
    const ttLive = liveFrameCookiesByOrigin.get('https://www.tiktok.com');
    if (ttLive) ttLive.delete('tiktok_webapp_theme');
    const ytLive = liveFrameCookiesByOrigin.get('https://www.youtube.com');
    if (ytLive) ytLive.delete('PREF');
  }

  function handleLiveFrameCookiesMessage(msg) {
    if (!msg || msg.type !== 'PM_SYNC_LIVE_FRAME_COOKIES' || !msg.origin || !msg.cookieStr) return;
    try {
      const rootOrigin = getRootOriginForHost(new URL(msg.origin).hostname) || msg.origin;
      msg.cookieStr.split(';').forEach((pair) => {
        const eq = pair.indexOf('=');
        if (eq > 0) {
          const k = pair.slice(0, eq).trim();
          const v = pair.slice(eq + 1).trim();
          if (k && v && v !== 'EXPIRED') {
            updateLiveOriginCookie(rootOrigin, k, v);
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
  }

  function mergeCookiesIntoHeaders(headers, storeCookies, liveFrameCookies = null, parsedUrl = null) {
    const cookieIdx = headers.findIndex((h) => (h.name || '').toLowerCase() === 'cookie');
    const hasHeaderCookie = Boolean(cookieIdx >= 0 && headers[cookieIdx].value);
    const hasLiveCookies = Boolean(liveFrameCookies && liveFrameCookies.size > 0);
    const socialTheme = bg.state.currentSettings?.socialAppThemeMode || 'native';
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
      const orderedStore = isGoogleMailOrAuth
        ? [...storeCookies].sort((a, b) => (b?.path || '').length - (a?.path || '').length)
        : storeCookies;
      const isAtomFeedReq = Boolean(isGoogleMailOrAuth && (parsedUrl.pathname || '').includes('/feed/atom'));
      orderedStore.forEach((c) => {
        if (!c || !c.name || !c.value || c.value === 'EXPIRED' || c.value === 'deleted') return;
        if (isGoogleMailOrAuth && !isAtomFeedReq && c.name === 'COMPASS') return;
        if (!map.has(c.name)) {
          map.set(c.name, c.value);
        }
      });
    }
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
    if (parsedUrl && parsedUrl.hostname.endsWith('tiktok.com')) {
      const verifyFp = parsedUrl.searchParams.get('verifyFp');
      if (verifyFp && verifyFp.startsWith('verify_') && !map.has('s_v_web_id')) {
        map.set('s_v_web_id', verifyFp);
      }
    }
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

  const extOrigin = browser.runtime.getURL('');

  function isFromPocketMail(details) {
    const isCompanion = Boolean(
      bg.companionWindowIds.has(details.windowId) ||
      (bg.companionTabIds && bg.companionTabIds.has(details.tabId))
    );
    if (details.type === 'main_frame') {
      return Boolean(details.tabId === -1 || isCompanion);
    }
    if (
      details.tabId === -1 ||
      isCompanion ||
      (details.originUrl && details.originUrl.startsWith(extOrigin)) ||
      (details.documentUrl && details.documentUrl.startsWith(extOrigin))
    ) {
      return true;
    }
    if (Array.isArray(details.frameAncestors) && details.frameAncestors.length > 0) {
      return details.frameAncestors.some((a) => a.url && a.url.startsWith(extOrigin));
    }
    return false;
  }

  function applyCustomUserAgentHeader(headers, parsedUrl, details) {
    const initiatorUrl = details.documentUrl || details.originUrl || '';
    const uaMode = resolveCustomAppUserAgentMode(parsedUrl, initiatorUrl);
    if (uaMode !== 'mobile' && uaMode !== 'desktop') return false;
    const uaStr = getCustomUserAgentString(uaMode);
    if (!uaStr) return false;
    const uaIdx = headers.findIndex((h) => (h.name || '').toLowerCase() === 'user-agent');
    if (uaIdx >= 0) {
      headers[uaIdx].value = uaStr;
    } else {
      headers.push({ name: 'User-Agent', value: uaStr });
    }
    return true;
  }

  if (browser.webRequest) {
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

    if (browser.cookies && browser.cookies.onChanged) {
      browser.cookies.onChanged.addListener((changeInfo) => {
        const domain = (changeInfo.cookie?.domain || '').replace(/^\./, '').toLowerCase();
        if (!domain) return;
        for (const key of Array.from(cookieLookupCache.keys())) {
          if (key.includes(domain) && key.startsWith('http')) {
            getCachedCookiesForOrigin(`${key}/`, key, true).catch(() => {});
          }
        }
      });
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

        const headers = [...details.requestHeaders];
        const uaModified = applyCustomUserAgentHeader(headers, parsedUrl, details);

        if (isStaticCdnHost(parsedUrl.hostname, details.url)) {
          return uaModified ? { requestHeaders: headers } : {};
        }

        const targetOrigin = parsedUrl.origin;
        const targetSiteKey = getBaseSiteKey(parsedUrl.hostname);
        const rootOrigin = getRootOriginForHost(parsedUrl.hostname);
        const liveFrameCookies = liveFrameCookiesByOrigin.get(rootOrigin || targetOrigin) || null;
        const isSwInterceptedAppFrame =
          details.type === 'sub_frame' &&
          details.frameId === -1 &&
          details.parentFrameId === -1 &&
          isEmbeddedSocialHost(details.url);
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
          bg.isPersistentCacheableAppFrame(parsedUrl)
        );

        let hasReferer = false;
        for (let hi = headers.length - 1; hi >= 0; hi--) {
          const h = headers[hi];
          const lower = (h.name || '').toLowerCase();
          if (allowPersistentRamCache && (lower === 'cache-control' || lower === 'pragma')) {
            headers.splice(hi, 1);
            continue;
          }
          if (isTopEmbeddedAppFrame) {
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
          types: ['main_frame', 'sub_frame', 'xmlhttprequest']
        },
        ['blocking', 'requestHeaders']
      );
    }

    const rewriteSetCookieForIframe = (rawCookieVal, cookieOriginKey = '') => {
      if (!rawCookieVal) return rawCookieVal;
      const isSocialDark =
        bg.state.currentSettings?.socialAppThemeMode === 'true-night' ||
        bg.state.currentSettings?.socialAppThemeMode === 'midnight-oled';
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
            bg.isPersistentCacheableAppFrame(parsedRespUrl)
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

    if (browser.webRequest.onBeforeRequest && typeof browser.webRequest.filterResponseData === 'function') {
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

  bg.prewarmSocialCookieCache = prewarmSocialCookieCache;
  bg.clearSocialThemeLiveCookies = clearSocialThemeLiveCookies;
  bg.handleLiveFrameCookiesMessage = handleLiveFrameCookiesMessage;
  bg.isFromPocketMail = isFromPocketMail;
  bg.getRootOriginForHost = getRootOriginForHost;
  bg.getBaseSiteKey = getBaseSiteKey;
  bg.getEmbeddedSocialHostSuffixes = getEmbeddedSocialHostSuffixes;
  bg.isEmbeddedSocialHost = isEmbeddedSocialHost;
  bg.resolveCustomAppUserAgentMode = resolveCustomAppUserAgentMode;
  bg.getCustomUserAgentString = getCustomUserAgentString;
})(window);
