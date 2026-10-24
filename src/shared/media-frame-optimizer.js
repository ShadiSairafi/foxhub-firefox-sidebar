/**
 * PocketMail — Embedded Media Frame & Sidebar Optimizer (Content Script)
 * Runs ONLY inside PocketMail's embedded media iframe (window.top !== window.self)
 * or PocketMail's direct Firefox Left Sidebar panel.
 * Never touches normal browser tabs.
 *
 * Responsibilities:
 * 1. Eliminates white flash on load & signals parent Loading Screen when ready.
 * 2. Injects tailored, route-aware responsive CSS & DOM adapters for:
 *    Instagram, WhatsApp Web, Discord, Telegram, Spotify, YouTube, YT Music,
 *    Reddit, TikTok, X (Twitter), Messenger, Twitch, and ChatGPT.
 * 3. Provides cross-origin postMessage bridge for Back, Forward, Reload, and Auto-Fit Zoom.
 */

(function initPocketMailMediaFrameOptimizer() {
  const realTopWin = window.top;
  const isTopFrame = realTopWin === window.self;
  const isDirectChildIframe = !isTopFrame && window.parent === realTopWin;
  const host = (window.location.hostname || '').toLowerCase();
  const isGoogleAccountWidgetIframe =
    !isTopFrame &&
    (host === 'ogs.google.com' ||
      (host === 'accounts.google.com' && (window.location.pathname || '').includes('/AccountChooser')));
  const isPocketMailSidebarTop =
    isTopFrame &&
    (window.location.hash.includes('pm-sidebar') || window.name === 'pm-opera-sidebar');

  // Never run in normal browser tabs or deeply nested ad/analytics/CAPTCHA sub-iframes
  if (!isDirectChildIframe && !isPocketMailSidebarTop && !isGoogleAccountWidgetIframe) return;

  const isBgAudioFrame = typeof window.name === 'string' && window.name.startsWith('pm-bg-audio-');
  const initialAutoplayPolicy =
    typeof navigator.getAutoplayPolicy === 'function' ? navigator.getAutoplayPolicy('mediaelement') : 'allowed';

  // Ensure background audio keep-alive frames report visibilityState='visible' so YouTube & Spotify never defer player boot
  if (isBgAudioFrame && window.wrappedJSObject && typeof exportFunction === 'function') {
    try {
      const pageWin = window.wrappedJSObject;
      const getVisible = exportFunction(() => 'visible', pageWin);
      const getFalse = exportFunction(() => false, pageWin);
      Object.defineProperty(pageWin.Document.prototype, 'visibilityState', { get: getVisible, configurable: true });
      Object.defineProperty(pageWin.Document.prototype, 'hidden', { get: getFalse, configurable: true });
    } catch (_) {}
  }

  let currentZoom = 1.0;

  // Never touch CAPTCHA or anti-bot verification frames (ensures hCaptcha/Cloudflare/reCAPTCHA load with zero delay!)
  if (
    host.includes('hcaptcha.com') ||
    host.includes('cloudflare.com') ||
    host.includes('recaptcha.net') ||
    host.includes('arkoselabs.com') ||
    host.includes('funcaptcha.com') ||
    (host.includes('google.com') && (window.location.pathname || '').includes('/recaptcha'))
  ) {
    return;
  }

  const isKnownBuiltInHost =
    host.includes('instagram.com') ||
    host.includes('whatsapp.com') ||
    host.includes('discord.com') ||
    host.includes('telegram.org') ||
    host.includes('spotify.com') ||
    host.includes('youtube.com') ||
    host.includes('reddit.com') ||
    host.includes('x.com') ||
    host.includes('twitter.com') ||
    host.includes('messenger.com') ||
    host.includes('google.com');

  // Mask iframe embedding fingerprint on TikTok & custom added websites so frame-busters (window.top !== window.self) never block or redirect the sidebar
  if ((host.includes('tiktok.com') || !isKnownBuiltInHost) && window.wrappedJSObject && typeof exportFunction === 'function') {
    try {
      const pageWin = window.wrappedJSObject;
      const getSelf = exportFunction(() => pageWin, pageWin);
      const getNull = exportFunction(() => null, pageWin);
      const getFalse = exportFunction(() => false, pageWin);
      Object.defineProperty(pageWin, 'top', { get: getSelf, configurable: true });
      Object.defineProperty(pageWin, 'parent', { get: getSelf, configurable: true });
      Object.defineProperty(pageWin, 'frameElement', { get: getNull, configurable: true });
      if (pageWin.Navigator && pageWin.Navigator.prototype) {
        Object.defineProperty(pageWin.Navigator.prototype, 'webdriver', { get: getFalse, configurable: true });
      }
    } catch (_) {}
  }

  function notifyParent(type, payload = {}) {
    if (isTopFrame) return;
    try {
      realTopWin.postMessage(
        {
          source: 'pocketmail-media-frame',
          type,
          flatFrameName: isDirectChildIframe ? (window.name || '') : '',
          url: window.location.href,
          ...payload
        },
        '*'
      );
    } catch (_) {}
  }

  // Decide if a URL is a same-app navigation or Google multi-account switch (/u/1/, ?authuser=1, AccountChooser)
  // that should stay inside the sidebar iframe instead of opening a new browser tab!
  function shouldKeepNavigationInSidebar(rawUrl, linkTarget = '') {
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

    // Never trap external Google management/policy links — let those open in browser tabs
    if (
      destHost === 'myaccount.google.com' ||
      destHost === 'policies.google.com' ||
      destHost === 'one.google.com' ||
      destHost === 'support.google.com'
    ) {
      return false;
    }

    if (isGoogleAccountWidgetIframe) {
      if (
        isAccountSwitchPattern ||
        destHost.includes('gemini.google.com') ||
        destHost.includes('youtube.com') ||
        destHost.includes('mail.google.com')
      ) {
        return true;
      }
      return false;
    }

    // Inside the main app iframe:
    // 1. Any same-host account switch (/u/1/, ?authuser=1) or AccountChooser stays in the sidebar
    if (isAccountSwitchPattern && (destHost === host || destHost === 'accounts.google.com')) {
      return true;
    }
    // 2. Any same-host link that used target="_top" or target="_parent" (assuming the app was top-level) stays in the sidebar
    if (destHost === host && (linkTarget === '_top' || linkTarget === '_parent')) {
      return true;
    }
    return false;
  }

  function setupSmartAccountSwitchAndLinkHandler() {
    document.addEventListener(
      'click',
      (e) => {
        const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!a) return;
        const rawHref = a.getAttribute('href') || a.href || '';
        const targetAttr = (a.getAttribute('target') || '').toLowerCase();

        if (shouldKeepNavigationInSidebar(rawHref, targetAttr)) {
          let resolvedUrl = rawHref;
          try {
            resolvedUrl = new URL(rawHref, window.location.href).href;
          } catch (_) {}
          e.preventDefault();
          e.stopPropagation();
          notifyParent('PM_FRAME_NAVIGATE_ACTIVE', {
            url: resolvedUrl,
            title: 'Switching Account…'
          });
          if (isDirectChildIframe) {
            window.location.href = resolvedUrl;
          }
          return;
        }

        // If a same-origin link has target="_top" or target="_parent", rewrite to "_self" so Firefox doesn't kick it to a new tab
        if (isDirectChildIframe && (targetAttr === '_top' || targetAttr === '_parent')) {
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

    // Also wrap window.open in Firefox content script context so JS-driven account switches (like Google One-Bar) stay in the sidebar
    try {
      if (window.wrappedJSObject && typeof exportFunction === 'function') {
        const origOpen = window.wrappedJSObject.open;
        if (typeof origOpen === 'function') {
          const smartOpen = function (url, target, features) {
            const strUrl = url ? String(url) : '';
            const strTarget = target ? String(target).toLowerCase() : '';
            if (shouldKeepNavigationInSidebar(strUrl, strTarget)) {
              let resolvedUrl = strUrl;
              try {
                resolvedUrl = new URL(strUrl, window.location.href).href;
              } catch (_) {}
              notifyParent('PM_FRAME_NAVIGATE_ACTIVE', {
                url: resolvedUrl,
                title: 'Switching Account…'
              });
              if (isDirectChildIframe) {
                window.location.href = resolvedUrl;
              }
              return window.wrappedJSObject;
            }
            return origOpen.call(window.wrappedJSObject, url, target, features);
          };
          exportFunction(smartOpen, window.wrappedJSObject, { defineAs: 'open' });
        }
      }
    } catch (_) {}
  }

  setupSmartAccountSwitchAndLinkHandler();

  // If this is ONLY the nested Google Account Switcher widget iframe (ogs.google.com), stop here without injecting app CSS
  if (isGoogleAccountWidgetIframe) {
    return;
  }

  // Signal immediately at document_start (unless on ServiceWorker/CacheStorage bootstrap cleaner)
  const isSwBootstrap = window.location.search.includes('pm_boot=1');
  if (!isSwBootstrap) {
    notifyParent('PM_FRAME_START');
  }

  // Unregister & block Service Workers (sw.js / serviceworker.js) inside embedded iframes
  // so cached X-Frame-Options: DENY / stale SW shells never block or slow down loading!
  if (
    host.includes('youtube.com') ||
    host.includes('whatsapp.com') ||
    host.includes('x.com') ||
    host.includes('twitter.com') ||
    !isKnownBuiltInHost
  ) {
    try {
      if (navigator.serviceWorker) {
        try {
          navigator.serviceWorker.register = function () {
            return Promise.resolve({});
          };
        } catch (_) {}

        const unregisterSwFast = async () => {
          try {
            const regs = await navigator.serviceWorker.getRegistrations();
            if (regs && regs.length > 0) {
              await Promise.all(regs.map((r) => r.unregister()));
              if (window.caches && window.caches.keys) {
                const keys = await window.caches.keys();
                await Promise.all(keys.map((k) => window.caches.delete(k)));
              }
            }
          } catch (_) {}
        };

        if (isSwBootstrap) {
          if (document.documentElement) {
            document.documentElement.style.background = '#141110';
            document.documentElement.style.visibility = 'hidden';
          }
          const params = new URLSearchParams(window.location.search || '');
          const targetUrl = params.get('pm_target') || `${window.location.origin}/`;
          Promise.race([
            unregisterSwFast(),
            new Promise((resolve) => setTimeout(resolve, 90))
          ]).then(() => {
            window.location.replace(targetUrl);
          });
          return;
        } else {
          unregisterSwFast();
        }
      }
    } catch (_) {}
  }

  let pendingSpaTarget = null; // { destPath, icon, tiktokView, igView, spotifyView, messengerView, expiresAt }
  let spotifyViewOverride = ''; // 'library' | 'search' | 'player' | ''

  function syncAppSpecificDomState() {
    const root = document.documentElement;
    if (!root) return;
    const path = window.location.pathname || '/';
    root.setAttribute('data-pm-path', path);

    const cleanCur = path.replace(/\/+$/, '') || '/';
    if (pendingSpaTarget) {
      if (
        Date.now() > pendingSpaTarget.expiresAt ||
        isRouteMatchForApp(cleanCur, pendingSpaTarget.destPath, pendingSpaTarget.icon)
      ) {
        pendingSpaTarget = null;
      }
    }

    // 1. Instagram route awareness (Reels vs DM Thread vs DM Inbox vs Explore vs Profile vs Feed)
    if (host.includes('instagram.com')) {
      let igView = 'feed';
      if (pendingSpaTarget && pendingSpaTarget.igView) {
        igView = pendingSpaTarget.igView;
      } else if (path.startsWith('/reels') || path.startsWith('/reel/')) {
        igView = 'reels';
      } else if (path.startsWith('/direct/t/')) {
        igView = 'dm-thread';
      } else if (path.startsWith('/direct')) {
        igView = 'dm-inbox';
      } else if (path.startsWith('/explore')) {
        igView = 'explore';
      }
      if (root.getAttribute('data-pm-ig-view') !== igView) {
        root.setAttribute('data-pm-ig-view', igView);
      }
    }

    // 2. Spotify route awareness (Player vs Search vs Library) & cookie banner cleanup
    if (host.includes('spotify.com')) {
      let spView = 'player';
      if (spotifyViewOverride) {
        spView = spotifyViewOverride;
      } else if (pendingSpaTarget && pendingSpaTarget.spotifyView) {
        spView = pendingSpaTarget.spotifyView;
      } else if (path.startsWith('/collection') && !path.startsWith('/collection/tracks')) {
        spView = 'library';
      } else if (path.startsWith('/search')) {
        spView = 'search';
      }
      if (root.getAttribute('data-pm-spotify-view') !== spView) {
        root.setAttribute('data-pm-spotify-view', spView);
      }
      const oneTrust = document.getElementById('onetrust-consent-sdk');
      if (oneTrust) oneTrust.remove();
    }

    // 3. TikTok route awareness (Feed vs Explore vs Messages vs Profile)
    if (host.includes('tiktok.com')) {
      let ttView = 'feed';
      if (path.startsWith('/messages')) {
        ttView = 'messages';
      } else if (pendingSpaTarget && pendingSpaTarget.tiktokView) {
        ttView = pendingSpaTarget.tiktokView;
      } else if (path.startsWith('/explore')) {
        ttView = 'explore';
      } else if (path.startsWith('/@') || path.startsWith('/profile')) {
        ttView = 'profile';
      } else if (path === '/' || path.startsWith('/foryou') || path.startsWith('/following')) {
        ttView = 'feed';
      } else {
        ttView = 'other';
      }
      if (root.getAttribute('data-pm-tiktok-view') !== ttView) {
        root.setAttribute('data-pm-tiktok-view', ttView);
      }
    }

    // 4. Messenger route awareness (Active Chat Thread vs Inbox)
    if (host.includes('messenger.com')) {
      const msgView =
        pendingSpaTarget && pendingSpaTarget.messengerView
          ? pendingSpaTarget.messengerView
          : path.includes('/t/')
          ? 'thread'
          : 'inbox';
      if (root.getAttribute('data-pm-messenger-view') !== msgView) {
        root.setAttribute('data-pm-messenger-view', msgView);
      }
    }

    // 5. YouTube: strip mini-guide attributes so Polymer uses 100% width
    if (host.includes('youtube.com') && !host.includes('music.youtube.com') && window.innerWidth <= 860) {
      const ytdApp = document.querySelector('ytd-app');
      if (ytdApp) {
        ytdApp.removeAttribute('mini-guide-visible');
        ytdApp.removeAttribute('guide-persistent-and-visible');
      }
      const drawer = document.querySelector('tp-yt-app-drawer#guide[opened]');
      if (drawer) {
        drawer.removeAttribute('opened');
      }
    }

    // 6. Global: remove intrusive Google One-Tap floating overlay
    const gsiPicker = document.getElementById('credential_picker_container');
    if (gsiPicker) gsiPicker.remove();
  }

  function getResponsiveSidebarCss() {
    let css = `
      /* Clean thin scrollbars, prevent horizontal overflow & hide Google One-Tap overlay */
      html {
        scrollbar-width: thin !important;
        scrollbar-color: rgba(160, 160, 160, 0.32) transparent !important;
        max-width: 100vw !important;
        overflow-x: clip !important;
      }
      body {
        max-width: 100vw !important;
        overflow-x: clip !important;
      }
      * {
        scrollbar-width: thin;
      }
      #credential_picker_container,
      #credential_picker_iframe,
      iframe[src*="accounts.google.com/gsi"],
      div[id^="credential_picker"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
        width: 0 !important;
        height: 0 !important;
        opacity: 0 !important;
      }
    `;

    if (host.includes('instagram.com')) {
      css += `
        /* 1. Compact Instagram Left Navigation Rail to 48px */
        :root, body {
          --nav-narrow-width: 48px !important;
          --nav-medium-width: 48px !important;
          --nav-wide-width: 48px !important;
        }

        /* Eliminate double vertical scrollbars */
        html[data-pm-ig-view="reels"],
        html[data-pm-ig-view="reels"] body,
        html[data-pm-ig-view="dm-inbox"],
        html[data-pm-ig-view="dm-inbox"] body,
        html[data-pm-ig-view="dm-thread"],
        html[data-pm-ig-view="dm-thread"] body {
          overflow-y: hidden !important;
          height: 100vh !important;
          max-height: 100vh !important;
        }

        html[data-pm-ig-view="feed"] body,
        html[data-pm-ig-view="explore"] body {
          overflow-y: visible !important;
        }

        main[role="main"],
        section > main[role="main"] {
          min-width: 0 !important;
          max-width: 100% !important;
          width: 100% !important;
          margin: 0 !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
        }

        html[data-pm-ig-view="reels"] main[role="main"] > div {
          padding-left: 0 !important;
          padding-right: 0 !important;
          max-width: 100% !important;
          scrollbar-width: none !important;
        }
        html[data-pm-ig-view="reels"] main[role="main"] > div::-webkit-scrollbar {
          display: none !important;
        }

        /* Prevent clicking a contact's avatar in the Instagram DM list from opening their Story instead of their DM chat! */
        html[data-pm-ig-view="dm-inbox"] [role="listitem"] div:has(> canvas),
        html[data-pm-ig-view="dm-inbox"] [role="listitem"] div:has(> canvas) *,
        html[data-pm-ig-view="dm-inbox"] [role="listitem"] [role="button"] [role="button"]:has(img),
        html[data-pm-ig-view="dm-inbox"] [role="listitem"] [role="button"] [role="button"]:has(img) *,
        html[data-pm-ig-view="dm-inbox"] [role="listitem"] canvas,
        html[data-pm-ig-view="dm-inbox"] [role="listitem"] img,
        html[data-pm-ig-view="dm-thread"] [role="listitem"] div:has(> canvas),
        html[data-pm-ig-view="dm-thread"] [role="listitem"] div:has(> canvas) *,
        html[data-pm-ig-view="dm-thread"] [role="listitem"] [role="button"] [role="button"]:has(img),
        html[data-pm-ig-view="dm-thread"] [role="listitem"] [role="button"] [role="button"]:has(img) *,
        html[data-pm-ig-view="dm-thread"] [role="listitem"] canvas,
        html[data-pm-ig-view="dm-thread"] [role="listitem"] img {
          pointer-events: none !important;
        }

        @media (max-width: 720px) {
          html[data-pm-ig-view="dm-thread"] main[role="main"] > div > div > div:first-child,
          html[data-pm-ig-view="dm-thread"] div[role="navigation"] > div > div:first-child {
            width: 68px !important;
            min-width: 68px !important;
            max-width: 68px !important;
            overflow-x: hidden !important;
            transition: width 0.18s ease, min-width 0.18s ease, max-width 0.18s ease !important;
          }
          html[data-pm-ig-view="dm-thread"] main[role="main"] > div > div > div:first-child:hover {
            width: 220px !important;
            min-width: 220px !important;
            max-width: 220px !important;
            z-index: 50 !important;
            box-shadow: 6px 0 20px rgba(0, 0, 0, 0.18) !important;
          }
          /* On DM Inbox (when no thread is open yet), hide the empty "Your messages" placeholder column so the thread list gets 100% width */
          html[data-pm-ig-view="dm-inbox"] main[role="main"] > div > div > div:nth-child(2):not(:has(textarea)):not(:has([role="textbox"])) {
            display: none !important;
          }
          html[data-pm-ig-view="dm-inbox"] main[role="main"] > div > div > div:first-child {
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            flex: 1 1 100% !important;
          }
        }
      `;
    } else if (host.includes('whatsapp.com')) {
      css += `
        /* 2. Remove WhatsApp Web hardcoded 748px min-width while keeping QR Login page clean */
        html, body, #app, .two, ._aigs {
          min-width: 0 !important;
          max-width: 100vw !important;
          overflow-x: hidden !important;
        }

        body:has(#side) #app > div,
        body:has(#side) #app > div > div {
          min-width: 0 !important;
          min-height: 0 !important;
          width: 100% !important;
          max-width: 100vw !important;
          overflow-x: hidden !important;
        }

        @media (max-width: 680px) {
          body:has(#side) #app > div > div > div:first-child:not(:has(#side)):not(:has(#main)) {
            min-width: 40px !important;
            max-width: 44px !important;
          }
          /* When no chat is open yet (#main absent), let the chat list (#side) fill 100% of the sidebar width! */
          body:has(#side):not(:has(#main)) div:has(> #side) {
            flex: 1 1 100% !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
          }
          body:has(#side):not(:has(#main)) #app > div > div > div:last-child:not(:has(#side)) {
            display: none !important;
          }
          /* When a chat thread IS open (#main present), split cleanly between chat list and active thread */
          body:has(#side):has(#main) div:has(> #side) {
            flex: 0 0 34% !important;
            width: 34% !important;
            min-width: 108px !important;
            max-width: 158px !important;
          }
          body:has(#side) #side {
            min-width: 0 !important;
            width: 100% !important;
          }
          body:has(#side) div:has(> #main) {
            flex: 1 1 auto !important;
            width: auto !important;
            min-width: 0 !important;
            max-width: 100% !important;
          }
          body:has(#side) #main {
            min-width: 0 !important;
            width: 100% !important;
          }
          body:has(#side) #main header {
            padding-left: 8px !important;
            padding-right: 6px !important;
          }
          body:has(#side) #main footer {
            padding-left: 4px !important;
            padding-right: 4px !important;
          }
        }

        @media (max-width: 430px) {
          body:has(#side):has(#main:focus-within) div:has(> #side) {
            flex: 0 0 56px !important;
            width: 56px !important;
            min-width: 56px !important;
            max-width: 56px !important;
            transition: width 0.18s ease, min-width 0.18s ease !important;
          }
          body:has(#side):has(#main) div:has(> #side):hover {
            flex: 0 0 165px !important;
            width: 165px !important;
            min-width: 165px !important;
            max-width: 165px !important;
            z-index: 50 !important;
          }
        }
      `;
    } else if (host.includes('discord.com')) {
      css += `
        /* 3. Discord Narrow Sidebar Optimization */
        html, body, #app-mount,
        [class*="app_"], [class*="bg_"], [class*="layers_"],
        [class*="base_"], [class*="content_"], [class*="chat_"],
        [class*="chatContent_"] {
          min-width: 0 !important;
          max-width: 100vw !important;
        }

        /* Always show Discord QR Code Login cleanly stacked inside narrow sidebars (< 850px) without needing to widen the panel! */
        @media (max-width: 850px) {
          form[class*="authBox"],
          div[class*="authBox"],
          div[class*="authBoxExpanded"] {
            width: 94vw !important;
            max-width: 440px !important;
            max-height: 92vh !important;
            padding: 16px 14px !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            box-sizing: border-box !important;
          }
          form[class*="authBox"] > div,
          div[class*="authBox"] > div[class*="centeringWrapper"] > div,
          div:has(> div[class*="mainLoginContainer"]) {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 14px !important;
            width: 100% !important;
          }
          div[class*="mainLoginContainer"] {
            width: 100% !important;
            max-width: 100% !important;
          }
          div[class*="verticalSeparator"] {
            display: block !important;
            width: 100% !important;
            height: 1px !important;
            margin: 4px 0 !important;
            background: rgba(255, 255, 255, 0.14) !important;
          }
          div[class*="qrLogin"],
          div[class*="qrLoginInner"] {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
          }
        }

        @media (max-width: 680px) {
          nav[class*="guilds_"],
          [aria-label="Servers sidebar"] {
            width: 52px !important;
            min-width: 52px !important;
          }
          div[class*="sidebar_"] {
            width: 146px !important;
            min-width: 146px !important;
            max-width: 146px !important;
            transition: width 0.18s ease !important;
          }
          div[class*="nowPlayingColumn_"],
          aside[class*="membersWrap_"],
          div[class*="membersWrap_"] {
            display: none !important;
          }
        }

        @media (max-width: 520px) {
          div[class*="sidebar_"]:not(:hover) {
            width: 52px !important;
            min-width: 52px !important;
            max-width: 52px !important;
          }
          div[class*="sidebar_"]:hover {
            width: 184px !important;
            min-width: 184px !important;
            max-width: 184px !important;
            z-index: 100 !important;
            box-shadow: 6px 0 20px rgba(0, 0, 0, 0.45) !important;
          }
        }
      `;
    } else if (host.includes('telegram.org')) {
      css += `
        /* 4. Telegram Web (K & A) Narrow Sidebar Optimization */
        html, body, #page-chats, .whole, #main-columns,
        #column-center, #MiddleColumn, #LeftColumn {
          min-width: 0 !important;
          max-width: 100vw !important;
        }

        @media (max-width: 620px) {
          #column-left,
          #LeftColumn {
            flex: 0 0 33% !important;
            width: 33% !important;
            min-width: 96px !important;
            max-width: 152px !important;
          }
          #column-center,
          #MiddleColumn {
            flex: 1 1 auto !important;
            width: auto !important;
            min-width: 0 !important;
            max-width: 100% !important;
          }
        }
      `;
    } else if (host.includes('spotify.com')) {
      css += `
        /* 5. Spotify Narrow Sidebar Optimization */
        #onetrust-consent-sdk,
        #onetrust-banner-sdk,
        .onetrust-pc-dark-filter,
        [data-testid="signup-bar"] {
          display: none !important;
        }

        @media (max-width: 940px) {
          /* Keep Left Library mounted with non-zero width (never display:none on .main-view-container, which causes ResizeObserver 0px division-by-zero crash!) */
          html:not([data-pm-spotify-view="library"]) #Desktop_LeftSidebar_Id,
          html:not([data-pm-spotify-view="library"]) .Root__nav-bar {
            position: fixed !important;
            left: -9999px !important;
            top: 0 !important;
            width: 280px !important;
            height: 80vh !important;
            opacity: 0 !important;
            pointer-events: none !important;
            z-index: -1 !important;
          }

          #Desktop_PanelContainer_Id,
          .Root__right-sidebar,
          #main-view + div:not(:has([data-testid="now-playing-bar"])),
          aside[aria-label="Now playing view" i]:not([data-testid="now-playing-bar"]) {
            display: none !important;
            width: 0 !important;
            min-width: 0 !important;
            max-width: 0 !important;
          }

          /* On Library tab, overlay #Desktop_LeftSidebar_Id cleanly over the main view without setting .main-view-container to 0px width! */
          html[data-pm-spotify-view="library"] #Desktop_LeftSidebar_Id {
            position: fixed !important;
            top: 48px !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            height: calc(100vh - 48px) !important;
            padding-bottom: 76px !important;
            box-sizing: border-box !important;
            z-index: 80 !important;
            background: #121212 !important;
            opacity: 1 !important;
            pointer-events: auto !important;
          }

          [data-testid="root"],
          [data-testid="root"] > div:first-child,
          .Root__top-container {
            --left-sidebar-width: 0 !important;
            --right-sidebar-width: 0 !important;
            --panel-width: 0px !important;
            --panel-gap: 0px !important;
            grid-template-columns: 0px minmax(0, 1fr) 0px !important;
            width: 100vw !important;
            max-width: 100vw !important;
            min-width: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow-x: clip !important;
          }

          #main,
          #main-view,
          .Root__main-view,
          .main-view-container {
            grid-column: 1 / -1 !important;
            min-width: 0 !important;
            width: 100% !important;
            max-width: 100vw !important;
            padding-right: 0 !important;
            margin-right: 0 !important;
            box-sizing: border-box !important;
          }

          #global-nav-bar,
          [data-testid="top-bar"] {
            width: 100% !important;
            max-width: 100vw !important;
            padding-left: 8px !important;
            padding-right: 8px !important;
            box-sizing: border-box !important;
          }
          #global-nav-bar a[href*="/download"],
          #global-nav-bar [data-testid="upgrade-button"],
          #global-nav-bar button[aria-label*="Install" i] {
            display: none !important;
          }

          /* Disable Firefox content-visibility: auto paint-containment bug on Spotify's horizontal shelf carousels so cards never clip to 28px/0px! */
          section[data-testid="component-shelf"],
          section[data-testid="component-shelf"] *,
          [data-testid="carousel-scroller"],
          [data-testid="carousel-scroller"] * {
            --carousel-shelf-content-visibility: visible !important;
            content-visibility: visible !important;
          }

          img[data-testid="card-image"] {
            opacity: 1 !important;
          }

          section[data-testid="component-shelf"] {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }

          [data-testid="grid-container"] {
            --column-count: 2 !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            grid-auto-rows: auto !important;
            overflow-y: visible !important;
            gap: 10px !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }
          @media (min-width: 580px) {
            [data-testid="grid-container"] {
              --column-count: 3 !important;
              grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            }
          }

          .contentSpacing {
            padding-left: 10px !important;
            padding-right: 10px !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }

          div:has(> [data-testid="now-playing-bar"]),
          .Root__now-playing-bar,
          .now-playing-bar-container {
            grid-column: 1 / -1 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            min-width: 0 !important;
            height: auto !important;
            min-height: 82px !important;
            z-index: 90 !important;
            background: #000000 !important;
            border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
          }
          [data-testid="now-playing-bar"],
          aside[data-testid="now-playing-bar"],
          footer[data-testid="now-playing-bar"] {
            display: flex !important;
            width: 100% !important;
            max-width: 100vw !important;
            min-width: 0 !important;
            height: auto !important;
            min-height: 78px !important;
            padding: 3px 8px 5px 8px !important;
            box-sizing: border-box !important;
            z-index: 90 !important;
          }
          [data-testid="now-playing-bar"] > div,
          footer[data-testid="now-playing-bar"] > div {
            display: flex !important;
            flex-wrap: wrap !important;
            align-items: center !important;
            justify-content: space-between !important;
            min-width: 0 !important;
            width: 100% !important;
            height: auto !important;
            gap: 2px 6px !important;
          }
          /* Row 1 (Full 100% Width): Player Controls (Shuffle, Prev, Play/Pause, Next, Repeat) + Full-Width Progress Seek Bar */
          [data-testid="now-playing-bar"] > div > div:nth-child(2) {
            order: 1 !important;
            flex: 1 1 100% !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }
          [data-testid="player-controls"] {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            gap: 1px !important;
          }
          [data-testid="general-controls"] {
            margin-bottom: 1px !important;
          }
          /* Row 2 Left: Current Track Cover + Song Title + Artist */
          [data-testid="now-playing-bar"] > div > div:nth-child(1) {
            order: 2 !important;
            flex: 1 1 48% !important;
            width: auto !important;
            min-width: 0 !important;
            max-width: 62% !important;
            max-height: 30px !important;
            overflow: hidden !important;
          }
          [data-testid="now-playing-widget"] img,
          [data-testid="cover-art-image"] {
            width: 26px !important;
            height: 26px !important;
            min-width: 26px !important;
            border-radius: 4px !important;
          }
          /* Row 2 Right: Compact Volume Bar & Queue (padded on right so ^ Nav pill never overlaps) */
          [data-testid="now-playing-bar"] > div > div:nth-child(3) {
            order: 3 !important;
            flex: 0 1 auto !important;
            width: auto !important;
            min-width: 0 !important;
            max-height: 28px !important;
            padding-right: 52px !important;
          }
          [data-testid="now-playing-bar"] [data-testid="fullscreen-mode-button"],
          [data-testid="now-playing-bar"] [data-testid="pip-toggle-button"],
          [data-testid="now-playing-bar"] button[aria-label*="Now playing view" i] {
            display: none !important;
          }
        }
      `;
    } else if (host.includes('music.youtube.com')) {
      css += `
        /* 6a. YouTube Music Narrow Sidebar Optimization */
        @media (max-width: 820px) {
          ytmusic-guide-renderer,
          #mini-guide.ytmusic-app-layout,
          #guide-wrapper.ytmusic-app-layout {
            display: none !important;
          }
          ytmusic-app-layout > #content,
          #browse-page.ytmusic-app,
          ytmusic-section-list-renderer {
            margin-left: 0 !important;
            width: 100% !important;
            max-width: 100vw !important;
            padding-left: 6px !important;
            padding-right: 6px !important;
            box-sizing: border-box !important;
          }
          ytmusic-nav-bar,
          ytmusic-player-bar {
            width: 100vw !important;
            max-width: 100vw !important;
            left: 0 !important;
          }
        }
      `;
    } else if (host.includes('youtube.com')) {
      css += `
        /* 6b. YouTube Narrow Sidebar Optimization */
        @media (max-width: 820px) {
          ytd-mini-guide-renderer {
            display: none !important;
          }
          tp-yt-app-drawer#guide {
            z-index: 2020 !important;
          }
          ytd-app[mini-guide-visible] ytd-page-manager.ytd-app,
          ytd-app[guide-persistent-and-visible] ytd-page-manager.ytd-app,
          ytd-page-manager.ytd-app,
          #page-manager.ytd-app,
          ytd-browse,
          ytd-two-column-browse-results-renderer {
            margin-left: 0 !important;
            width: 100% !important;
            max-width: 100vw !important;
            min-width: 0 !important;
          }

          ytd-rich-grid-renderer,
          #contents.ytd-rich-grid-renderer {
            --ytd-rich-grid-items-per-row: 1 !important;
            --ytd-rich-grid-posts-per-row: 1 !important;
            --ytd-rich-grid-slim-items-per-row: 2 !important;
            --ytd-rich-grid-game-cards-per-row: 1 !important;
            width: 100% !important;
            max-width: 100vw !important;
            padding-left: 8px !important;
            padding-right: 8px !important;
            box-sizing: border-box !important;
          }
          ytd-rich-grid-row,
          #contents.ytd-rich-grid-row {
            display: contents !important;
          }
          ytd-rich-item-renderer,
          ytd-rich-item-renderer[rendered-from-rich-grid] {
            width: 100% !important;
            max-width: 100% !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            margin-bottom: 14px !important;
          }
          ytd-rich-section-renderer {
            width: 100% !important;
            max-width: 100% !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
          }

          #masthead-container.ytd-app,
          ytd-masthead {
            width: 100vw !important;
            max-width: 100vw !important;
          }
          #container.ytd-masthead {
            padding: 0 8px !important;
            gap: 4px !important;
          }
          #guide-button.ytd-masthead,
          #country-code.ytd-topbar-logo-renderer,
          #voice-search-button.ytd-masthead,
          #buttons.ytd-masthead ytd-button-renderer {
            display: none !important;
          }
          #center.ytd-masthead {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            margin: 0 4px !important;
          }
          ytd-searchbox,
          yt-searchbox,
          #search-form,
          #container.ytd-searchbox {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }

          ytd-feed-filter-chip-bar-renderer {
            width: 100% !important;
            max-width: 100vw !important;
          }
          ytd-shorts,
          #shorts-container,
          ytd-reel-video-renderer {
            max-width: 100vw !important;
            min-width: 0 !important;
          }
          ytd-watch-flexy[flexy] #columns.ytd-watch-flexy {
            flex-direction: column !important;
            min-width: 0 !important;
            max-width: 100vw !important;
          }
          ytd-watch-flexy #primary.ytd-watch-flexy,
          ytd-watch-flexy #secondary.ytd-watch-flexy {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            padding: 0 8px !important;
            margin: 0 !important;
            box-sizing: border-box !important;
          }
          /* Disable YouTube Ambient Mode (#cinematics) 30fps canvas blur loop in sidebar to save 3-5% CPU while gaming! */
          #cinematics,
          ytd-watch-flexy #cinematics,
          ytd-watch-flexy #cinematics canvas {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
          }
        }
      `;
    } else if (host.includes('reddit.com')) {
      css += `
        /* 7. Reddit & Reddit Chat Narrow Sidebar Optimization */
        shreddit-experience-tree,
        xpromo-app-selector,
        shreddit-async-loader[bundlename*="xpromo"],
        #credential_picker_container {
          display: none !important;
        }

        @media (max-width: 960px) {
          /* Hide ONLY the desktop right-hand info sidebar; keep #left-sidebar-container / reddit-sidebar-nav functional when the ☰ drawer opens! */
          #right-sidebar-container {
            display: none !important;
          }

          /* Ensure the ☰ hamburger left drawer opens cleanly on top of the backdrop */
          #left-sidebar-container[open],
          #left-sidebar-container:focus-within,
          reddit-sidebar-nav {
            z-index: 9999 !important;
            max-width: 82vw !important;
          }

          div.grid-container,
          .subgrid-container,
          main.main,
          #main-content,
          shreddit-feed,
          shreddit-post,
          article {
            grid-template-columns: minmax(0, 1fr) !important;
            max-width: 100vw !important;
            width: 100% !important;
            min-width: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            box-sizing: border-box !important;
          }
          .subgrid-container,
          main.main {
            padding-left: 6px !important;
            padding-right: 6px !important;
          }

          /* Fix Top-Right Profile Avatar Overflow in Reddit Header */
          reddit-header-large,
          shreddit-app > header,
          header {
            max-width: 100vw !important;
            width: 100% !important;
            padding-left: 6px !important;
            padding-right: 10px !important;
            box-sizing: border-box !important;
          }
          header nav,
          reddit-header-large nav {
            max-width: 100% !important;
            width: 100% !important;
            padding-left: 4px !important;
            padding-right: 6px !important;
            gap: 4px !important;
            box-sizing: border-box !important;
          }
          reddit-search-large,
          faceplate-search-input,
          #search-input {
            flex: 1 1 75px !important;
            min-width: 65px !important;
            max-width: 100% !important;
          }
        }

        @media (max-width: 580px) {
          /* Hide the word "Create" next to the + icon so Bell & Profile Avatar fit 100% inside the right edge */
          #create-post span:not(:first-child),
          a[href*="/submit"] span:not(:first-child) {
            display: none !important;
          }
          #create-post,
          a[href*="/submit"] {
            padding-left: 6px !important;
            padding-right: 6px !important;
            min-width: 32px !important;
          }
        }
      `;
    } else if (host.includes('tiktok.com')) {
      css += `
        /* 8. TikTok Cinema Full-Height Video Feed, Explore Grid, Profile & Messages Optimization */
        @media (max-width: 860px) {
          /* Keep TikTok's left nav mounted offscreen (0px visual width) so its React router links remain clickable via SPA_NAVIGATE,
             while allowing DivSideNavContainer on Messages if it houses the inbox drawer */
          [data-e2e="nav-side"],
          div[class*="DivSideNavContainer"]:not(:has([data-e2e="inbox-list"])):not(:has(div[class*="DivConversationList"])),
          html:not([data-pm-tiktok-view="messages"]) div[class*="DivSideNavContainer"],
          html:not([data-pm-tiktok-view="messages"]) div[class*="DivFullSideNav"],
          html:not([data-pm-tiktok-view="messages"]) div[class*="SideNavContainer"] {
            position: fixed !important;
            left: -9999px !important;
            top: 0 !important;
            width: 64px !important;
            height: 400px !important;
            opacity: 0 !important;
            pointer-events: none !important;
            z-index: -1 !important;
          }

          div[class*="DivSideNavPlaceholder"],
          div[class*="DivPromotionContainer"],
          div[class*="DivBottomBanner"],
          div[class*="DivAppBanner"] {
            display: none !important;
            width: 0 !important;
            min-width: 0 !important;
            max-width: 0 !important;
          }

          #app,
          div[class*="DivBodyContainer"],
          div[class*="DivMainContainer"],
          div[class*="DivShareLayoutMain"],
          div[class*="DivExploreContainer"],
          main {
            width: 100% !important;
            max-width: 100vw !important;
            min-width: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            padding-left: 2px !important;
            padding-right: 2px !important;
            box-sizing: border-box !important;
          }

          /* Full-Height Dark Cinema Stage ONLY for Feed ([data-e2e="recommend-list-item-container"]) — never stretches Explore/Profile grids! */
          html[data-pm-tiktok-view="feed"] [data-e2e="recommend-list-item-container"],
          html[data-pm-tiktok-view="feed"] article[class*="ArticleItemContainer"] {
            width: 100% !important;
            max-width: 100% !important;
            min-height: calc(100vh - 58px) !important;
            margin: 0 0 8px 0 !important;
            padding: 4px 2px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-sizing: border-box !important;
          }

          html[data-pm-tiktok-view="feed"] div[class*="DivContentContainer"],
          html[data-pm-tiktok-view="feed"] div[class*="DivMediaCardContainer"] {
            width: 100% !important;
            max-width: 100% !important;
            display: flex !important;
            align-items: flex-end !important;
            justify-content: center !important;
            gap: 4px !important;
          }

          html[data-pm-tiktok-view="feed"] div[class*="DivVideoWrapper"] {
            position: relative !important;
            width: 100% !important;
            max-width: 100% !important;
            height: calc(100vh - 68px) !important;
            max-height: 820px !important;
            min-height: 440px !important;
            background: #0b0b0e !important;
            border-radius: 14px !important;
            overflow: hidden !important;
          }

          html[data-pm-tiktok-view="feed"] div[class*="DivCliponeContainer"],
          html[data-pm-tiktok-view="feed"] div[class*="DivVideoCard"] {
            width: 100% !important;
            max-width: 100% !important;
            height: 100% !important;
            background: #0b0b0e !important;
          }

          /* Keep the active video player filling 100% of the card from top to bottom (never stacked above the poster image!) */
          html[data-pm-tiktok-view="feed"] div[class*="DivBasicPlayerWrapper"],
          html[data-pm-tiktok-view="feed"] div[class*="xgplayer-container"],
          html[data-pm-tiktok-view="feed"] div[class*="DivPlayerContainer"] {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            max-height: none !important;
            min-height: 0 !important;
            background: #0b0b0e !important;
            z-index: 2 !important;
          }

          /* Hide the duplicate static poster image underneath once the video player is mounted */
          html[data-pm-tiktok-view="feed"] div[class*="DivVideoWrapper"]:has(video) img[class*="ImgPoster"],
          html[data-pm-tiktok-view="feed"] div[class*="DivVideoWrapper"]:has(video) > img,
          html[data-pm-tiktok-view="feed"] div[class*="DivVideoCardPoster"] {
            opacity: 0 !important;
            pointer-events: none !important;
          }

          html[data-pm-tiktok-view="feed"] video {
            width: 100% !important;
            height: 100% !important;
            object-fit: contain !important;
            background: #0b0b0e !important;
          }

          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"],
          html[data-pm-tiktok-view="feed"] div[class*="DivActionItemContainer"] {
            margin-left: 2px !important;
            margin-right: 0 !important;
            flex-shrink: 0 !important;
          }

          /* TikTok Explore (/explore) & Profile (/@...) — Prevent double-nested grid (outer wrapper must be block 100%, only innermost list is 2-column grid) */
          div:has(> [data-e2e="explore-item-list"]),
          div:has(> div > [data-e2e="explore-item-list"]),
          div:has(> [data-e2e="user-post-item-list"]),
          div:has(> [data-e2e="user-liked-item-list"]),
          div:has(> [data-e2e="user-repost-item-list"]),
          div:has(> [data-e2e="favorites-item-list"]),
          [data-e2e="explore-item-list"]:has(div[class*="DivThreeColumnContainer"]),
          [data-e2e="explore-item-list"]:has(div[class*="DivVideoFeedV2"]),
          div[class*="DivThreeColumnContainer"]:has([data-e2e="explore-item-list"]),
          div[class*="DivThreeColumnContainer"]:has(div[class*="DivVideoFeedV2"]),
          div[class*="DivThreeColumnContainer"]:has([data-e2e="user-post-item-list"]),
          div[class*="DivThreeColumnContainer"]:has([data-e2e="user-liked-item-list"]) {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            box-sizing: border-box !important;
          }

          /* Keep the horizontal category bar on Explore full-width flex */
          div[class*="DivCategoryListContainer"],
          div[class*="DivCategoryList"] {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }

          /* Keep the floating top-right coin/app/avatar pill compact on Explore & Profile so it doesn't cover category tabs */
          html[data-pm-tiktok-view="explore"] div[class*="DivFixedTopContainer"],
          html[data-pm-tiktok-view="explore"] div[class*="DivHeaderRightContainer"],
          html[data-pm-tiktok-view="profile"] div[class*="DivFixedTopContainer"],
          html[data-pm-tiktok-view="profile"] div[class*="DivHeaderRightContainer"] {
            transform: scale(0.82) !important;
            transform-origin: top right !important;
          }

          /* Only the innermost item list container is the 2-column CSS Grid (100% width across the sidebar) */
          [data-e2e="explore-item-list"]:not(:has(div[class*="DivThreeColumnContainer"])):not(:has(div[class*="DivVideoFeedV2"])),
          div[class*="DivThreeColumnContainer"]:not(:has([data-e2e="explore-item-list"])):not(:has([data-e2e="user-post-item-list"])):not(:has([data-e2e="user-liked-item-list"])),
          div[class*="DivVideoFeedV2"]:not(:has([data-e2e="explore-item-list"])),
          [data-e2e="user-post-item-list"],
          [data-e2e="user-liked-item-list"],
          [data-e2e="user-repost-item-list"],
          [data-e2e="favorites-item-list"] {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin: 0 !important;
            padding: 6px 8px !important;
            box-sizing: border-box !important;
          }

          /* Direct card containers fill their grid cell cleanly without overriding inner DivContainer/DivWrapper overlays */
          html[data-pm-tiktok-view="explore"] [data-e2e="explore-item"],
          html[data-pm-tiktok-view="explore"] div[class*="DivItemContainerV2"],
          html[data-pm-tiktok-view="explore"] div[class*="DivItemContainer"]:not([class*="Conversation"]),
          [data-e2e="user-post-item"],
          [data-e2e="user-liked-item"],
          [data-e2e="user-repost-item"],
          [data-e2e="favorites-item"],
          html[data-pm-tiktok-view="profile"] div[class*="DivItemContainerV2"] {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin: 0 !important;
            box-sizing: border-box !important;
          }

          @media (max-width: 360px) {
            [data-e2e="explore-item-list"]:not(:has(div[class*="DivThreeColumnContainer"])),
            div[class*="DivThreeColumnContainer"]:not(:has([data-e2e="explore-item-list"])) {
              grid-template-columns: minmax(0, 1fr) !important;
            }
          }

          /* TikTok Messages (/messages) Responsive Layout — Align Left Conversation List 100% with Divider Line! */
          html[data-pm-tiktok-view="messages"] [data-e2e="nav-side"],
          html[data-pm-tiktok-view="messages"] div[class*="DivSideNavContainer"]:not(:has([data-e2e="inbox-list"])):not(:has(div[class*="DivConversationList"])),
          html[data-pm-tiktok-view="messages"] div[class*="DivSideNavPlaceholder"] {
            display: none !important;
          }
          html[data-pm-tiktok-view="messages"] div[class*="DivDrawerContainer"],
          html[data-pm-tiktok-view="messages"] div:has(> div[class*="DivConversationListContainer"]) {
            width: 168px !important;
            min-width: 156px !important;
            max-width: 176px !important;
            flex: 0 0 168px !important;
            box-sizing: border-box !important;
          }
          html[data-pm-tiktok-view="messages"] div[class*="DivConversationListContainer"],
          html[data-pm-tiktok-view="messages"] [data-e2e="inbox-list"],
          html[data-pm-tiktok-view="messages"] div[class*="DivConversationListContainer"] .simplebar-wrapper,
          html[data-pm-tiktok-view="messages"] div[class*="DivConversationListContainer"] .simplebar-content-wrapper,
          html[data-pm-tiktok-view="messages"] div[class*="DivConversationListContainer"] .simplebar-content,
          html[data-pm-tiktok-view="messages"] div[class*="DivItemContainer"],
          html[data-pm-tiktok-view="messages"] div[class*="DivItemWrapper"],
          html[data-pm-tiktok-view="messages"] div[class*="DivInfoContainer"],
          html[data-pm-tiktok-view="messages"] p[class*="PNickname"],
          html[data-pm-tiktok-view="messages"] span[class*="SpanNickname"] {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            flex: 1 1 auto !important;
            box-sizing: border-box !important;
          }
          html[data-pm-tiktok-view="messages"] div[class*="DivChatBox"],
          html[data-pm-tiktok-view="messages"] div[class*="DivChatMain"],
          html[data-pm-tiktok-view="messages"] div[class*="DivMessageList"] {
            flex: 1 1 auto !important;
            width: auto !important;
            min-width: 0 !important;
            max-width: 100% !important;
            padding-left: 6px !important;
            padding-right: 6px !important;
            box-sizing: border-box !important;
          }
          html[data-pm-tiktok-view="messages"] div[class*="DivChatItemWrapper"],
          html[data-pm-tiktok-view="messages"] div[class*="DivMessageContainer"] {
            max-width: 100% !important;
            width: 100% !important;
            padding-left: 4px !important;
            padding-right: 4px !important;
            box-sizing: border-box !important;
          }
          html[data-pm-tiktok-view="messages"] div[class*="DivChatMain"] div[class*="DivTextContainer"],
          html[data-pm-tiktok-view="messages"] div[class*="DivChatMain"] p[class*="PText"] {
            max-width: 230px !important;
            min-width: 110px !important;
            width: auto !important;
            word-break: normal !important;
            overflow-wrap: break-word !important;
          }

          div[class*="DivHeaderWrapper"] {
            width: 100vw !important;
            max-width: 100vw !important;
            padding: 0 8px !important;
            box-sizing: border-box !important;
          }
        }
      `;
    } else if (host.includes('x.com') || host.includes('twitter.com')) {
      css += `
        /* 9. X (Twitter) Narrow Sidebar Optimization — Preserve window (html) as scroll container so VirtualScroller loads infinite posts! */
        html {
          min-width: 0 !important;
          max-width: 100vw !important;
          overflow-x: clip !important;
          overflow-y: scroll !important;
        }
        body, #react-root {
          min-width: 0 !important;
          max-width: 100vw !important;
          overflow-x: clip !important;
          overflow-y: visible !important;
        }

        @media (max-width: 780px) {
          header[role="banner"] {
            flex: 0 0 52px !important;
            width: 52px !important;
            min-width: 52px !important;
            max-width: 52px !important;
            align-items: center !important;
          }
          header[role="banner"] > div,
          header[role="banner"] > div > div {
            width: 52px !important;
            max-width: 52px !important;
            padding-left: 2px !important;
            padding-right: 2px !important;
            align-items: center !important;
          }
          header[role="banner"] nav a span {
            display: none !important;
          }
          [data-testid="sidebarColumn"] {
            display: none !important;
          }
          main[role="main"] {
            flex: 1 1 0% !important;
            width: calc(100vw - 52px) !important;
            max-width: calc(100vw - 52px) !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }
          main[role="main"] > div,
          [data-testid="primaryColumn"],
          [data-testid="DMDrawer"],
          section[aria-labelledby],
          article[data-testid="tweet"] {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            flex: 1 1 auto !important;
            box-sizing: border-box !important;
          }
        }
      `;
    } else if (host.includes('messenger.com')) {
      css += `
        /* 10. Messenger Flex & Left Chats Column Anti-Squish Optimization */
        html, body, [role="main"] {
          min-width: 0 !important;
          max-width: 100vw !important;
          overflow-x: clip !important;
        }

        /* Prevent the left Chats column from ever squishing to 50px ("C-h-a-t-s" vertical text wrap) */
        div[role="navigation"]:has([aria-label="Thread list"]),
        div:has(> div > [aria-label="Thread list"]),
        div[aria-label="Thread list"],
        div:has(> div > div[aria-label="Chats"]) {
          min-width: 165px !important;
          width: 165px !important;
          flex: 0 0 165px !important;
          overflow-x: hidden !important;
          box-sizing: border-box !important;
        }

        /* When no conversation is open ("No chats selected"), let the Chats column expand to 100% of the sidebar! */
        body:not(:has([role="main"] [role="textbox"])) div[role="navigation"]:has([aria-label="Thread list"]),
        body:not(:has([role="main"] [role="textbox"])) div:has(> div > [aria-label="Thread list"]),
        body:not(:has([role="main"] [role="textbox"])) div[aria-label="Thread list"],
        body:not(:has([role="main"] [role="textbox"])) div:has(> div > div[aria-label="Chats"]) {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 100% !important;
          flex: 1 1 100% !important;
        }
        body:not(:has([role="main"] [role="textbox"])) [role="main"] {
          display: none !important;
        }

        [role="main"] {
          flex: 1 1 auto !important;
          min-width: 0 !important;
          max-width: 100% !important;
        }
      `;
    } else if (host.includes('twitch.tv')) {
      css += `
        /* 11. Twitch Narrow Sidebar Optimization */
        #onetrust-consent-sdk,
        .consent-banner {
          display: none !important;
        }
        @media (max-width: 820px) {
          .side-nav,
          [data-a-target="side-nav-bar"] {
            display: none !important;
            width: 0 !important;
          }
          .tw-root--theme-dark,
          .root-scrollable,
          main,
          .channel-root,
          .persistent-player {
            width: 100% !important;
            max-width: 100vw !important;
            min-width: 0 !important;
            left: 0 !important;
            margin-left: 0 !important;
          }
          .channel-root__right-column {
            position: relative !important;
            width: 100% !important;
            max-width: 100vw !important;
            transform: none !important;
          }
        }
      `;
    } else if (host.includes('chatgpt.com') || host.includes('openai.com')) {
      css += `
        /* 12. ChatGPT Narrow Sidebar Optimization */
        html, body, #__next, main {
          min-width: 0 !important;
          max-width: 100vw !important;
          overflow-x: clip !important;
        }
        article,
        [data-message-author-role],
        .prose {
          max-width: 100% !important;
          min-width: 0 !important;
          overflow-wrap: anywhere !important;
        }
        pre, code {
          max-width: 100% !important;
          overflow-x: auto !important;
        }
        form {
          max-width: 100% !important;
          padding-left: 6px !important;
          padding-right: 6px !important;
        }
      `;
    } else if (host.includes('gemini.google.com')) {
      css += `
        /* 13. Google Gemini Narrow Sidebar Optimization */
        html, body, chat-app, main {
          min-width: 0 !important;
          max-width: 100vw !important;
          overflow-x: clip !important;
        }
        /* Keep prompt input bar & conversation area fitting 100% inside narrow sidebars */
        input-container,
        .input-area-container,
        rich-textarea {
          max-width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
        }
      `;
    } else {
      css += `
        /* 14. Universal Responsive Adapter for Custom Added Websites (+ button) */
        html, body, #root, #app, #__next, main, [role="main"] {
          min-width: 0 !important;
          max-width: 100vw !important;
          overflow-x: clip !important;
          box-sizing: border-box !important;
        }
        img, video, canvas {
          max-width: 100% !important;
        }
        pre, code, table {
          max-width: 100% !important;
          overflow-x: auto !important;
        }
      `;
    }

    return css;
  }

  function detectPageFaviconUrl() {
    try {
      const links = Array.from(
        document.querySelectorAll(
          'link[rel*="icon" i], link[rel*="apple-touch-icon" i], link[rel="mask-icon" i]'
        )
      );
      let bestHref = '';
      let bestScore = -1;
      for (const link of links) {
        const href = link.href || link.getAttribute('href') || '';
        if (!href || href.startsWith('javascript:')) continue;
        const rel = (link.getAttribute('rel') || '').toLowerCase();
        const type = (link.getAttribute('type') || '').toLowerCase();
        const sizes = (link.getAttribute('sizes') || '').toLowerCase();
        let score = 10;
        if (rel.includes('apple-touch-icon')) score += 45;
        if (type.includes('svg') || href.endsWith('.svg')) score += 50;
        if (type.includes('png') || href.includes('.png')) score += 25;
        if (sizes.includes('any')) score += 40;
        if (score > bestScore) {
          bestHref = href;
          bestScore = score;
        }
      }
      return bestHref;
    } catch (_) {
      return '';
    }
  }

  function injectAppThemeCss(themeMode, accentColor) {
    const root = document.head || document.documentElement;
    if (!root) return;
    let themeStyle = document.getElementById('pm-social-app-theme-css');
    if (!themeMode || themeMode === 'native') {
      if (themeStyle) themeStyle.remove();
      if (document.documentElement) document.documentElement.removeAttribute('data-pm-social-theme');
      return;
    }
    if (!themeStyle) {
      themeStyle = document.createElement('style');
      themeStyle.id = 'pm-social-app-theme-css';
      root.appendChild(themeStyle);
    }
    if (document.documentElement) {
      document.documentElement.setAttribute('data-pm-social-theme', themeMode);
    }
    const accent = accentColor || '#6C5CE7';
    let tCss = `
      /* PocketHub Social App Custom Theme Overlay (${themeMode}) */
      :root {
        --pm-social-accent: ${accent} !important;
      }
      ::-webkit-scrollbar-thumb {
        background: ${accent}66 !important;
      }
      * {
        scrollbar-color: ${accent}77 transparent !important;
      }
      ::selection {
        background: ${accent}44 !important;
      }
      body::before {
        content: "";
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, ${accent}, #FF7675, ${accent});
        z-index: 2147483646;
        pointer-events: none;
        opacity: 0.88;
      }
    `;

    if (themeMode === 'warm-glass') {
      tCss += `
        html {
          filter: sepia(0.15) saturate(1.06) brightness(0.98) !important;
        }
        img, video, canvas, picture, iframe, [style*="background-image"] {
          filter: sepia(0) !important;
        }
        body::after {
          content: "";
          position: fixed;
          inset: 0;
          background: radial-gradient(circle at top right, rgba(217, 107, 67, 0.08), rgba(244, 162, 97, 0.04) 60%, transparent);
          pointer-events: none;
          z-index: 2147483645;
        }
      `;
    } else if (themeMode === 'midnight-oled') {
      tCss += `
        html {
          filter: contrast(1.05) saturate(1.08) !important;
        }
        body::after {
          content: "";
          position: fixed;
          inset: 0;
          background: radial-gradient(circle at top left, rgba(108, 92, 231, 0.10), rgba(0, 206, 209, 0.04) 65%, transparent);
          pointer-events: none;
          z-index: 2147483645;
        }
      `;
    } else if (themeMode === 'rose-twilight') {
      tCss += `
        html {
          filter: hue-rotate(-6deg) saturate(1.07) !important;
        }
        img, video, canvas, picture {
          filter: hue-rotate(6deg) !important;
        }
        body::after {
          content: "";
          position: fixed;
          inset: 0;
          background: radial-gradient(circle at top right, rgba(232, 67, 147, 0.09), rgba(162, 155, 254, 0.05) 65%, transparent);
          pointer-events: none;
          z-index: 2147483645;
        }
      `;
    } else if (themeMode === 'match-theme') {
      tCss += `
        body::after {
          content: "";
          position: fixed;
          inset: 0;
          background: linear-gradient(160deg, ${accent}14 0%, transparent 55%);
          pointer-events: none;
          z-index: 2147483645;
        }
      `;
    }

    themeStyle.textContent = tCss;
  }

  function injectDiscordCaptchaPreconnect() {
    if (!host.includes('discord.com') || !document.head) return;
    if (document.getElementById('pm-discord-hcaptcha-preconnect')) return;
    const hosts = ['https://newassets.hcaptcha.com', 'https://hcaptcha.com', 'https://assets.hcaptcha.com'];
    hosts.forEach((href, idx) => {
      const link = document.createElement('link');
      if (idx === 0) link.id = 'pm-discord-hcaptcha-preconnect';
      link.rel = 'preconnect';
      link.href = href;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });
  }

  // Instant visual feedback & reliable navigation when clicking "Log in" on Spotify Web Player
  function setupSpotifyLoginHelper() {
    if (!host.includes('spotify.com')) return;
    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-testid="login-button"], button, a') : null;
        if (!btn) return;
        const text = (btn.textContent || '').trim().toLowerCase();
        const isLoginBtn =
          btn.getAttribute('data-testid') === 'login-button' ||
          text === 'log in' ||
          text === 'login' ||
          (btn.tagName === 'A' && (btn.getAttribute('href') || '').includes('accounts.spotify.com'));
        if (!isLoginBtn) return;

        // Show immediate tactile feedback on the button AND trigger PocketHub's loading overlay
        btn.style.opacity = '0.72';
        btn.style.transform = 'scale(0.96)';
        const labelSpan = btn.querySelector('span') || btn;
        if (labelSpan && labelSpan.childNodes.length <= 2) {
          labelSpan.textContent = 'Opening Login…';
        }
        notifyParent('PM_FRAME_NAV_START', { title: 'Opening Spotify Login…' });

        // Fallback if Spotify's internal click handler gets blocked or stalls inside an iframe
        const startHref = window.location.href;
        setTimeout(() => {
          if (window.location.href === startHref && !window.location.hostname.includes('accounts.spotify.com')) {
            window.location.href = `https://accounts.spotify.com/en/login?continue=${encodeURIComponent(startHref)}`;
          }
        }, 420);
      },
      true
    );

    // Detect if Firefox DRM (Widevine EME / GMP decoder) is disabled in user's browser settings
    // (Firefox hides its yellow "You must enable DRM" infobar inside iframes, leaving users wondering why Spotify won't play!)
    if (host === 'open.spotify.com') {
      let drmVerifiedOk = false;
      let drmPollTimer = null;

      const probeWidevineDrm = async (timeoutMs = 3200) => {
        try {
          if (!navigator.requestMediaKeySystemAccess) return false;
          const checkPromise = navigator
            .requestMediaKeySystemAccess('com.widevine.alpha', [
              {
                initDataTypes: ['cenc'],
                audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }]
              }
            ])
            .then(() => true)
            .catch(() => false);
          const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
          return await Promise.race([checkPromise, timeoutPromise]);
        } catch (_) {
          return false;
        }
      };

      const showSpotifyDrmPrompt = async (pulseIfVisible = false) => {
        if (!document.body || drmVerifiedOk) return;
        const existing = document.getElementById('pm-spotify-drm-banner');
        if (existing) {
          if (pulseIfVisible) {
            existing.style.transform = 'scale(1.02)';
            existing.style.boxShadow = '0 0 0 2px #1ed760, 0 10px 28px rgba(0,0,0,0.8)';
            setTimeout(() => {
              existing.style.transform = 'scale(1)';
              existing.style.boxShadow = '0 8px 24px rgba(0,0,0,0.72)';
            }, 260);
          }
          return;
        }

        const isOk = await probeWidevineDrm(3200);
        if (isOk) {
          drmVerifiedOk = true;
          return;
        }
        if (document.getElementById('pm-spotify-drm-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'pm-spotify-drm-banner';
        banner.style.cssText =
          'position:fixed;bottom:78px;left:8px;right:8px;z-index:2147483640;background:#161616;border:1.5px solid #1ed760;border-radius:12px;padding:11px 12px;color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:11.5px;line-height:1.45;box-shadow:0 8px 24px rgba(0,0,0,0.72);display:flex;flex-direction:column;gap:8px;transition:transform 0.2s ease,box-shadow 0.2s ease;';

        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:8px;';

        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-weight:700;color:#1ed760;font-size:12.5px;';
        titleEl.textContent = '🎵 Enable Firefox DRM to Play Music';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Dismiss';
        closeBtn.style.cssText =
          'background:transparent;border:none;color:#aaa;cursor:pointer;font-size:14px;padding:0 4px;line-height:1;';
        closeBtn.addEventListener('click', () => {
          if (drmPollTimer) {
            clearInterval(drmPollTimer);
            drmPollTimer = null;
          }
          banner.remove();
        });

        topRow.appendChild(titleEl);
        topRow.appendChild(closeBtn);

        const descEl = document.createElement('div');
        descEl.style.cssText = 'color:#d8d8d8;font-size:11.2px;';
        descEl.textContent =
          'Spotify requires Widevine DRM for audio (Firefox hides its yellow "Enable DRM" bar inside sidebars). Choose either quick option:';

        const stepsEl = document.createElement('div');
        stepsEl.style.cssText =
          'background:#222;border-radius:8px;padding:7px 9px;color:#eee;font-size:11px;display:flex;flex-direction:column;gap:4px;';

        const step1 = document.createElement('div');
        step1.textContent = '1️⃣ Click "Open Tab to Enable DRM" below → click Firefox\'s yellow "Enable DRM" button at the top of the tab.';

        const step2 = document.createElement('div');
        step2.textContent =
          '2️⃣ Or in Firefox Settings → Tabs and browsing → Media → check "Play DRM-controlled content".';

        const step3 = document.createElement('div');
        step3.style.cssText = 'color:#aaa;font-size:10.3px;';
        step3.textContent =
          'Tip: If audio still stays paused, open about:config and set media.gmp.decoder.enabled to true.';

        stepsEl.appendChild(step1);
        stepsEl.appendChild(step2);
        stepsEl.appendChild(step3);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px;';

        const openTabBtn = document.createElement('button');
        openTabBtn.type = 'button';
        openTabBtn.textContent = '⚡ Open Tab to Enable DRM';
        openTabBtn.style.cssText =
          'background:#1ed760;color:#000;font-weight:700;border:none;border-radius:999px;padding:6px 11px;font-size:11px;cursor:pointer;';
        openTabBtn.addEventListener('click', () => {
          notifyParent('PM_OPEN_SPOTIFY_DRM_TAB', { url: 'https://open.spotify.com/' });
          openTabBtn.textContent = '✓ Opened Tab — Click "Enable DRM" at Top!';
        });

        const reloadBtn = document.createElement('button');
        reloadBtn.type = 'button';
        reloadBtn.textContent = '↻ I Enabled It — Reload';
        reloadBtn.style.cssText =
          'background:#2a2a2a;color:#fff;font-weight:600;border:1px solid #444;border-radius:999px;padding:6px 10px;font-size:11px;cursor:pointer;';
        reloadBtn.addEventListener('click', () => {
          reloadBtn.textContent = 'Reloading…';
          window.location.reload();
        });

        btnRow.appendChild(openTabBtn);
        btnRow.appendChild(reloadBtn);

        banner.appendChild(topRow);
        banner.appendChild(descEl);
        banner.appendChild(stepsEl);
        banner.appendChild(btnRow);
        document.body.appendChild(banner);

        // Poll every 2.5s while banner is open: as soon as user enables DRM in Firefox, auto-reload Spotify!
        if (!drmPollTimer) {
          drmPollTimer = setInterval(async () => {
            if (!document.getElementById('pm-spotify-drm-banner')) {
              clearInterval(drmPollTimer);
              drmPollTimer = null;
              return;
            }
            const ready = await probeWidevineDrm(1800);
            if (ready) {
              drmVerifiedOk = true;
              clearInterval(drmPollTimer);
              drmPollTimer = null;
              titleEl.textContent = '✓ Firefox DRM Activated! Starting Spotify…';
              setTimeout(() => window.location.reload(), 650);
            }
          }, 2500);
        }
      };

      // Also re-prompt if user clicks a Play button while DRM is still off
      document.addEventListener(
        'click',
        (e) => {
          if (drmVerifiedOk) return;
          const playEl =
            e.target && e.target.closest
              ? e.target.closest('[data-testid="play-button"], [data-testid="control-button-playpause"]')
              : null;
          if (playEl) {
            showSpotifyDrmPrompt(true);
          }
        },
        true
      );

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(() => showSpotifyDrmPrompt(false), 1400);
      } else {
        window.addEventListener('DOMContentLoaded', () => setTimeout(() => showSpotifyDrmPrompt(false), 1400), {
          once: true
        });
      }
    }
  }

  // Auto-recover X / Twitter if first load or /i/chat shows a transient "Something went wrong" / "Retry" state
  let xAutoRetriedAt = 0;
  function checkXTransientErrorRecovery() {
    if (!host.includes('x.com') && !host.includes('twitter.com')) return;
    if (Date.now() - xAutoRetriedAt < 8000) return;
    const retryBtn = document.querySelector('[data-testid="error-detail"] [role="button"], main button');
    if (retryBtn) {
      const txt = (retryBtn.textContent || '').trim().toLowerCase();
      if (txt === 'retry' || txt === 'try again') {
        xAutoRetriedAt = Date.now();
        retryBtn.click();
      }
    }
  }

  // YouTube Fullscreen & Picture-in-Picture (PiP) Support inside Sidebar Iframe
  function setupYouTubeFullscreenAndPipHelper() {
    if (!host.includes('youtube.com')) return;

    const triggerVideoFullscreen = () => {
      try {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
          return;
        }
        const playerEl =
          document.getElementById('movie_player') ||
          document.querySelector('.html5-video-player') ||
          document.querySelector('video.html5-main-video') ||
          document.documentElement;
        if (playerEl && playerEl.requestFullscreen) {
          playerEl.requestFullscreen().catch(() => {
            const vid = document.querySelector('video');
            if (vid && vid.requestFullscreen) vid.requestFullscreen().catch(() => {});
          });
        }
      } catch (_) {}
    };

    document.addEventListener(
      'click',
      (e) => {
        const fsBtn =
          e.target && e.target.closest
            ? e.target.closest('.ytp-fullscreen-button, button[aria-label*="Full screen" i], button[title*="Full screen" i]')
            : null;
        if (!fsBtn) return;
        const wasFs = Boolean(document.fullscreenElement);
        setTimeout(() => {
          if (Boolean(document.fullscreenElement) === wasFs) {
            triggerVideoFullscreen();
          }
        }, 90);
      },
      true
    );

    // Inject a sleek Picture-in-Picture (PiP) button next to YouTube's fullscreen button
    const ensureYtPipButton = () => {
      const rightControls = document.querySelector('.ytp-right-controls');
      if (!rightControls || rightControls.querySelector('.pm-yt-pip-btn')) return;
      const pipBtn = document.createElement('button');
      pipBtn.type = 'button';
      pipBtn.className = 'ytp-button pm-yt-pip-btn';
      pipBtn.title = 'Picture-in-Picture (Floating Video Window)';
      pipBtn.setAttribute('aria-label', 'Picture-in-Picture');
      pipBtn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;vertical-align:top;width:40px;height:100%;opacity:0.92;';
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', '20');
      svg.setAttribute('height', '20');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', '#ffffff');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      const r1 = document.createElementNS(svgNS, 'rect');
      r1.setAttribute('x', '2');
      r1.setAttribute('y', '4');
      r1.setAttribute('width', '20');
      r1.setAttribute('height', '15');
      r1.setAttribute('rx', '2');
      const r2 = document.createElementNS(svgNS, 'rect');
      r2.setAttribute('x', '12');
      r2.setAttribute('y', '11');
      r2.setAttribute('width', '8');
      r2.setAttribute('height', '6');
      r2.setAttribute('rx', '1');
      r2.setAttribute('fill', '#ffffff');
      svg.appendChild(r1);
      svg.appendChild(r2);
      pipBtn.appendChild(svg);

      pipBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const vid = document.querySelector('video.html5-main-video, video');
        if (!vid) return;
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(() => {});
        } else if (vid.requestPictureInPicture) {
          vid.requestPictureInPicture().catch(() => {
            triggerVideoFullscreen();
          });
        } else {
          triggerVideoFullscreen();
        }
      });

      const fsBtn = rightControls.querySelector('.ytp-fullscreen-button');
      if (fsBtn) {
        rightControls.insertBefore(pipBtn, fsBtn);
      } else {
        rightControls.appendChild(pipBtn);
      }
    };

    // Ensure YouTube's guide drawer starts in overlay mode on narrow sidebars so clicking #guide-button opens it cleanly
    const ensureYtOverlayGuideMode = () => {
      if (window.innerWidth > 820) return;
      const ytdApp = document.querySelector('ytd-app');
      if (ytdApp && ytdApp.hasAttribute('guide-persistent-and-visible')) {
        ytdApp.removeAttribute('guide-persistent-and-visible');
      }
    };

    setTimeout(ensureYtOverlayGuideMode, 250);
    setTimeout(ensureYtOverlayGuideMode, 900);
    setInterval(ensureYtPipButton, 2000);
  }

  // Detect unread messages / notifications from document.title and app DOM badges
  let lastReportedUnread = -1;
  let lastReportedHasUnread = false;
  let lastRouteOrClickAt = Date.now();

  function detectUnreadState() {
    // Pure media/streaming & AI apps (Spotify, YouTube, Twitch, ChatGPT, Gemini) should never trigger unread badges from song/video titles
    if (
      host.includes('spotify.com') ||
      host.includes('youtube.com') ||
      host.includes('twitch.tv') ||
      host.includes('chatgpt.com') ||
      host.includes('gemini.google.com')
    ) {
      return;
    }

    let unreadCount = 0;
    let hasUnread = false;

    const title = document.title || '';
    // Match ONLY a leading "(3) WhatsApp", "(1) Discord", "(2) Instagram", "[4] Telegram" at the very start of the title (never numbers inside video/song titles!)
    if (!host.includes('tiktok.com')) {
      const titleMatch = title.match(/^\s*[\(\[](\d{1,3})\+?[\)\]]\s+/);
      if (titleMatch && titleMatch[1]) {
        unreadCount = parseInt(titleMatch[1], 10) || 0;
      }
      if (title.trim().startsWith('•') || title.trim().startsWith('●')) {
        hasUnread = true;
      }
    }

    try {
      if (host.includes('whatsapp.com')) {
        const badges = document.querySelectorAll(
          'span[data-testid="icon-unread-count"], [aria-label*="unread message" i]'
        );
        let domSum = 0;
        badges.forEach((b) => {
          const n = parseInt((b.textContent || '').trim(), 10);
          if (!isNaN(n) && n > 0) domSum += n;
        });
        if (domSum > unreadCount) unreadCount = domSum;
      } else if (host.includes('instagram.com')) {
        const dmBadge = document.querySelector('a[href*="/direct/inbox"] span, [aria-label*="unread" i]');
        if (dmBadge) {
          const n = parseInt((dmBadge.textContent || '').trim(), 10);
          if (!isNaN(n) && n > unreadCount) unreadCount = n;
        }
      } else if (host.includes('discord.com')) {
        const badges = document.querySelectorAll('[class*="numberBadge_"]');
        let domSum = 0;
        badges.forEach((b) => {
          const n = parseInt((b.textContent || '').trim(), 10);
          if (!isNaN(n) && n > 0) domSum += n;
        });
        if (domSum > unreadCount) unreadCount = domSum;
      } else if (host.includes('tiktok.com')) {
        // On TikTok, only read the DM message count badge (not fluctuating activity/title counts on page changes)
        const dmBadge = document.querySelector('[data-e2e="message-icon"] sup, a[href*="/messages"] sup');
        if (dmBadge) {
          const n = parseInt((dmBadge.textContent || '').trim(), 10);
          if (!isNaN(n) && n >= 0) unreadCount = n;
        }
      } else if (host.includes('x.com') || host.includes('twitter.com')) {
        const dmBadge = document.querySelector(
          'a[href="/messages"] [aria-label*="unread" i], a[href="/i/chat"] [aria-label*="unread" i], [data-testid="AppTabBar_DirectMessage_Link"] span'
        );
        if (dmBadge) {
          const n = parseInt((dmBadge.textContent || '').trim(), 10);
          if (!isNaN(n) && n > unreadCount) unreadCount = n;
          else if (dmBadge.getAttribute('aria-label')) hasUnread = true;
        }
      }
    } catch (_) {}

    if (unreadCount > 0) hasUnread = true;

    const isRouteTransition = Date.now() - lastRouteOrClickAt < 5000;
    // Ignore transient 0 readings while an SPA is in the middle of changing pages
    if (unreadCount === 0 && !hasUnread && lastReportedUnread > 0 && isRouteTransition) {
      return;
    }

    if (unreadCount !== lastReportedUnread || hasUnread !== lastReportedHasUnread) {
      lastReportedUnread = unreadCount;
      lastReportedHasUnread = hasUnread;
      notifyParent('PM_FRAME_UNREAD_UPDATE', {
        unreadCount,
        hasUnread,
        isRouteTransition,
        title
      });
    }
  }

  // Real Visual Readiness Detector: ensures #pm-media-loader stays visible until the SPA actually paints UI!
  let visualReadySent = false;
  function isAppVisuallyPainted() {
    if (!document.body) return false;
    try {
      if (host.includes('whatsapp.com')) {
        return Boolean(document.querySelector('#app > div, #side, #main, canvas, [data-ref]'));
      }
      if (host.includes('spotify.com')) {
        return Boolean(
          document.querySelector('#main, #main-view, .Root__main-view, [data-testid="root"], #Desktop_LeftSidebar_Id, form')
        );
      }
      if (host.includes('instagram.com')) {
        return Boolean(document.querySelector('main[role="main"], nav, [role="navigation"], article, form'));
      }
      if (host.includes('discord.com')) {
        return Boolean(
          document.querySelector('#app-mount > div, [class*="sidebar_"], [class*="chat_"], form[class*="authBox"], div[class*="authBox"]')
        );
      }
      if (host.includes('telegram.org')) {
        return Boolean(
          document.querySelector('#page-chats, #main-columns, #MiddleColumn, #LeftColumn, .chatlist-parts, .auth-pages, canvas')
        );
      }
      if (host.includes('reddit.com')) {
        return Boolean(document.querySelector('shreddit-app, rs-app, main, [role="main"], reddit-header-large'));
      }
      if (host.includes('youtube.com')) {
        return Boolean(document.querySelector('ytd-app, ytmusic-app, ytd-page-manager, video'));
      }
      if (host.includes('x.com') || host.includes('twitter.com')) {
        return Boolean(
          document.querySelector('#react-root main, [data-testid="primaryColumn"], [data-testid="DMDrawer"], header[role="banner"], form')
        );
      }
      if (host.includes('tiktok.com')) {
        return Boolean(
          document.querySelector('#app > div, video, [data-e2e="recommend-list-item-container"], [data-e2e="inbox-list"], main')
        );
      }
      if (host.includes('messenger.com')) {
        return Boolean(document.querySelector('[role="main"], [role="navigation"], form'));
      }
      const paintedEl = document.querySelector('main, [role="main"], nav, article, canvas, video, form, textarea');
      if (paintedEl) return true;
      return document.body.children.length > 0 && document.body.scrollHeight > 80;
    } catch (_) {
      return true;
    }
  }

  function getOwnProfileUrlForCurrentHost() {
    if (host.includes('tiktok.com')) return resolveTikTokOwnProfileUrl();
    if (host.includes('instagram.com')) return resolveInstagramOwnProfileUrl();
    if (host.includes('x.com') || host.includes('twitter.com')) return resolveXOwnProfileUrl();
    return '';
  }

  function checkAndNotifyVisualReady() {
    if (visualReadySent) return;
    if (isAppVisuallyPainted()) {
      visualReadySent = true;
      notifyParent('PM_FRAME_VISUAL_READY', {
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
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      checkAndNotifyVisualReady();
      if (visualReadySent || attempts > 45) {
        clearInterval(timer);
        if (!visualReadySent) {
          visualReadySent = true;
          notifyParent('PM_FRAME_VISUAL_READY', {
            title: document.title || '',
            faviconUrl: detectPageFaviconUrl(),
            ownProfileUrl: getOwnProfileUrlForCurrentHost()
          });
        }
      }
    }, 45);
  }

  let cachedSidebarCss = null;
  function injectOptimizerCss() {
    const root = document.head || document.documentElement;
    if (!root) return;
    syncAppSpecificDomState();
    injectDiscordCaptchaPreconnect();
    let style = document.getElementById('pm-frame-optimizer-css');
    if (!style) {
      style = document.createElement('style');
      style.id = 'pm-frame-optimizer-css';
      if (cachedSidebarCss === null) {
        cachedSidebarCss = getResponsiveSidebarCss();
      }
      style.textContent = cachedSidebarCss;
      root.appendChild(style);
    }
  }

  if (document.documentElement) {
    injectOptimizerCss();
  } else {
    const obs = new MutationObserver(() => {
      if (document.documentElement) {
        injectOptimizerCss();
        obs.disconnect();
      }
    });
    obs.observe(document, { childList: true });
  }

  setupSpotifyLoginHelper();
  setupYouTubeFullscreenAndPipHelper();

  let lastHref = window.location.href;
  let routeCheckTimers = [];

  function getReportedFrameUrl() {
    if (host.includes('spotify.com') && spotifyViewOverride === 'library') {
      return 'https://open.spotify.com/collection/playlists';
    }
    return window.location.href;
  }

  function handleRouteOrStateCheck() {
    if (window.location.href !== lastHref) {
      const prevPath = (() => {
        try {
          return new URL(lastHref).pathname;
        } catch (_) {
          return '';
        }
      })();
      lastHref = window.location.href;
      lastRouteOrClickAt = Date.now();

      // If user clicked a playlist/album/artist/search inside Spotify's Library sidebar, automatically reveal the Player/Search main view!
      if (host.includes('spotify.com') && spotifyViewOverride === 'library') {
        const curPath = window.location.pathname || '/';
        if (curPath !== prevPath && !curPath.startsWith('/collection/playlists')) {
          spotifyViewOverride = curPath.startsWith('/search') ? 'search' : 'player';
        }
      }

      injectOptimizerCss();
      notifyParent('PM_FRAME_URL_CHANGED', {
        url: getReportedFrameUrl(),
        title: document.title || '',
        faviconUrl: detectPageFaviconUrl(),
        ownProfileUrl: getOwnProfileUrlForCurrentHost()
      });
    }
    syncAppSpecificDomState();
    detectUnreadState();
    checkXTransientErrorRecovery();
    checkAndNotifyVisualReady();
  }

  function scheduleStaggeredRouteChecks() {
    routeCheckTimers.forEach((t) => clearTimeout(t));
    routeCheckTimers = [35, 100, 220, 420, 800].map((delay) =>
      setTimeout(() => {
        if (window.location.href !== lastHref) {
          handleRouteOrStateCheck();
        }
      }, delay)
    );
  }

  function setupFastSpaRouteObserver() {
    // 1. Modern Navigation API listener if supported (100% safe, no Xray compartment wrapping needed)
    try {
      if (window.navigation && typeof window.navigation.addEventListener === 'function') {
        window.navigation.addEventListener('navigate', () => {
          setTimeout(handleRouteOrStateCheck, 15);
        });
      }
    } catch (_) {}

    // 3. Standard popstate & hashchange listeners
    window.addEventListener('popstate', handleRouteOrStateCheck, { passive: true });
    window.addEventListener('hashchange', handleRouteOrStateCheck, { passive: true });

    // 4. Staggered checks after any user click (catches async React 18 startTransition updates at 35ms..800ms)
    document.addEventListener(
      'click',
      (e) => {
        lastRouteOrClickAt = Date.now();
        // If user is in Spotify Library view and clicks a playlist/track inside the left library, switch to player view
        if (host.includes('spotify.com') && spotifyViewOverride === 'library') {
          const leftSidebar = e.target && e.target.closest ? e.target.closest('#Desktop_LeftSidebar_Id') : null;
          const clickedRow =
            leftSidebar && e.target.closest
              ? e.target.closest('a[href], [role="row"], [data-encore-id="listRow"]')
              : null;
          if (clickedRow) {
            setTimeout(() => {
              spotifyViewOverride = 'player';
              syncAppSpecificDomState();
              notifyParent('PM_FRAME_URL_CHANGED', {
                url: window.location.href,
                title: document.title || ''
              });
            }, 80);
          }
        }
        scheduleStaggeredRouteChecks();
      },
      { passive: true }
    );
  }

  // Event-driven <title> observer for 0ms unread badge & route change detection
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

  function pauseActiveVideosSoftly() {
    try {
      document.querySelectorAll('video').forEach((v) => {
        try {
          if (!v.paused) v.pause();
        } catch (_) {}
      });
    } catch (_) {}
  }

  function freeHeavyMediaResources() {
    try {
      const videos = document.querySelectorAll('video');
      videos.forEach((v) => {
        try {
          v.pause();
          v.removeAttribute('src');
          v.load();
        } catch (_) {}
      });
    } catch (_) {}
  }

  function ensureSpecialRoutesReady() {
    const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    const search = window.location.search || '';
    const wantsProfile = path === '/profile' || search.includes('pm_goto_profile=1');

    if (host.includes('tiktok.com')) {
      if (wantsProfile) {
        const ownUrl = resolveTikTokOwnProfileUrl();
        if (ownUrl) {
          window.location.replace(ownUrl);
          return;
        }
        const navProf = findNativeInAppNavElement('/profile', 'profile');
        if (navProf) {
          navProf.click();
        }
        return;
      }
      if (path.startsWith('/messages')) {
        setTimeout(() => {
          if (!window.location.pathname.startsWith('/messages')) return;
          const hasInbox = Boolean(
            document.querySelector('[data-e2e="inbox-list"], div[class*="DivConversationList"], div[class*="DivChatBox"]')
          );
          if (!hasInbox) {
            const msgBtn = findNativeInAppNavElement('/messages', 'messages');
            if (msgBtn) msgBtn.click();
          }
        }, 650);
      }
    } else if (host.includes('instagram.com') && wantsProfile) {
      const tryGoIgProfile = (attempt = 0) => {
        const ownUrl = resolveInstagramOwnProfileUrl();
        const navProf = findNativeInAppNavElement('/profile', 'profile');
        if (navProf) {
          navProf.click();
          return;
        }
        if (ownUrl) {
          window.location.replace(ownUrl);
          return;
        }
        if (attempt < 8) {
          setTimeout(() => tryGoIgProfile(attempt + 1), 220);
        }
      };
      tryGoIgProfile(0);
    } else if ((host.includes('x.com') || host.includes('twitter.com')) && wantsProfile) {
      const tryGoXProfile = (attempt = 0) => {
        const navProf = findNativeInAppNavElement('/profile', 'profile');
        if (navProf) {
          navProf.click();
          return;
        }
        const ownUrl = resolveXOwnProfileUrl();
        if (ownUrl) {
          window.location.replace(ownUrl);
          return;
        }
        if (attempt < 8) {
          setTimeout(() => tryGoXProfile(attempt + 1), 220);
        }
      };
      tryGoXProfile(0);
    }
  }

  setupFastSpaRouteObserver();

  document.addEventListener('DOMContentLoaded', () => {
    injectOptimizerCss();
    attachTitleObserver();
    detectUnreadState();
    ensureSpecialRoutesReady();
    notifyParent('PM_FRAME_DOM_READY', {
      title: document.title || '',
      faviconUrl: detectPageFaviconUrl(),
      ownProfileUrl: getOwnProfileUrlForCurrentHost()
    });
    startVisualPaintWatcher();
  });

  window.addEventListener('load', () => {
    injectOptimizerCss();
    attachTitleObserver();
    detectUnreadState();
    ensureSpecialRoutesReady();
    notifyParent('PM_FRAME_LOADED', {
      title: document.title || '',
      faviconUrl: detectPageFaviconUrl(),
      ownProfileUrl: getOwnProfileUrlForCurrentHost()
    });
    startVisualPaintWatcher();
  });

  // Fast 260ms lightweight URL string check (zero DOM access, safe during video playback)
  setInterval(() => {
    if (window.location.href !== lastHref) {
      handleRouteOrStateCheck();
    }
  }, 260);

  // Live Playback & Timestamp Reporter + Background Audio Keep-Alive Auto-Resume
  let bgAudioAutoResumed = false;
  let bgAudioMseBridgeStarted = false;
  let activeMseRecorder = null;
  let activeMseMediaEl = null;
  let sidebarAutoResumeRequested = false;

  function stopLocalMseAudioBridge() {
    if (!bgAudioMseBridgeStarted) return;
    bgAudioMseBridgeStarted = false;
    try {
      if (activeMseRecorder && activeMseRecorder.state !== 'inactive') {
        activeMseRecorder.stop();
      }
    } catch (_) {}
    activeMseRecorder = null;
    try {
      if (activeMseMediaEl && activeMseMediaEl.wrappedJSObject) {
        delete activeMseMediaEl.wrappedJSObject.volume;
        delete activeMseMediaEl.wrappedJSObject.muted;
      }
      if (activeMseMediaEl) {
        activeMseMediaEl.muted = false;
        activeMseMediaEl.volume = 1.0;
      }
    } catch (_) {}
    activeMseMediaEl = null;
  }

  function startLocalMseAudioBridge(mediaEl) {
    if (bgAudioMseBridgeStarted || !mediaEl) return;
    bgAudioMseBridgeStarted = true;
    activeMseMediaEl = mediaEl;
    (async () => {
      try {
        mediaEl.muted = false;
        mediaEl.volume = 0;
        // Lock page-world .volume and .muted setters on this element so YouTube Polymer hydrating yt-player-volume (v.volume = 1) never triggers Firefox's C++ Autoplay Pause!
        if (window.wrappedJSObject && mediaEl.wrappedJSObject && typeof exportFunction === 'function') {
          try {
            const pageWin = window.wrappedJSObject;
            const rawEl = mediaEl.wrappedJSObject;
            const getOne = exportFunction(() => 1, pageWin);
            const setNoop = exportFunction(() => {}, pageWin);
            const getFalse = exportFunction(() => false, pageWin);
            Object.defineProperty(rawEl, 'volume', { get: getOne, set: setNoop, configurable: true });
            Object.defineProperty(rawEl, 'muted', { get: getFalse, set: setNoop, configurable: true });
          } catch (_) {}
        }
        await mediaEl.play();
        const stream = mediaEl.mozCaptureStream
          ? mediaEl.mozCaptureStream()
          : mediaEl.captureStream
          ? mediaEl.captureStream()
          : null;
        if (stream && stream.getAudioTracks().length > 0) {
          const audioOnlyStream = new MediaStream(stream.getAudioTracks());
          const rec = new MediaRecorder(audioOnlyStream, { mimeType: 'audio/webm;codecs=opus' });
          activeMseRecorder = rec;
          rec.ondataavailable = async (ev) => {
            if (!bgAudioMseBridgeStarted) return;
            if (ev.data && ev.data.size > 0) {
              try {
                const buf = await ev.data.arrayBuffer();
                realTopWin.postMessage(
                  {
                    source: 'pocketmail-media-frame',
                    type: 'PM_BG_AUDIO_CHUNK',
                    flatFrameName: window.name || '',
                    chunk: buf
                  },
                  '*',
                  [buf]
                );
              } catch (_) {}
            }
          };
          rec.start(140);
          bgAudioAutoResumed = true;
        }
      } catch (_) {
        bgAudioMseBridgeStarted = false;
      }
    })();
  }

  function reportLivePlaybackState() {
    try {
      let isPlaying = false;
      let currentTime = 0;
      let resumeUrl = window.location.href;

      const mediaEl = document.querySelector('video.html5-main-video, video, audio');
      if (mediaEl) {
        currentTime = Math.floor(mediaEl.currentTime || 0);
        if (!mediaEl.paused && !mediaEl.ended) {
          isPlaying = true;
        } else if (bgAudioMseBridgeStarted && mediaEl.paused && !mediaEl.ended && mediaEl.readyState >= 2) {
          // Keep background bridge video playing if the page's UI framework transiently paused it during hydration
          mediaEl.play().catch(() => {});
          isPlaying = true;
        }
      }

      if (host.includes('spotify.com')) {
        const spPlayBtn = document.querySelector('[data-testid="control-button-playpause"]');
        if (spPlayBtn && !spPlayBtn.disabled) {
          const aria = (spPlayBtn.getAttribute('aria-label') || '').toLowerCase();
          if (aria.includes('pause')) {
            isPlaying = true;
          }
        }
      } else if (host.includes('youtube.com')) {
        const cinematicsEl = document.getElementById('cinematics');
        if (cinematicsEl && cinematicsEl.firstChild) {
          cinematicsEl.textContent = '';
        }
        if (window.location.pathname.startsWith('/watch') && currentTime > 2) {
          try {
            const u = new URL(window.location.href);
            u.searchParams.set('t', `${currentTime}s`);
            resumeUrl = u.href;
          } catch (_) {}
        }
      }

      const curAutoplayPolicy =
        typeof navigator.getAutoplayPolicy === 'function' ? navigator.getAutoplayPolicy('mediaelement') : 'allowed';

      notifyParent('PM_FRAME_PLAYBACK_STATE', {
        isPlaying,
        currentTime,
        resumeUrl,
        title: document.title || '',
        initialAutoplayPolicy,
        autoplayBlocked: Boolean(isBgAudioFrame && host.includes('spotify.com') && curAutoplayPolicy !== 'allowed')
      });

      // 1. If running inside Background Audio Keep-Alive Engine (when sidebar is closed), auto-resume playback once ready!
      if (!bgAudioAutoResumed && isBgAudioFrame) {
        if (host.includes('spotify.com')) {
          // Wait specifically until Spotify's bottom Now Playing bar button is initialized and not disabled (~3.5s)
          const spToggle = document.querySelector('[data-testid="control-button-playpause"]');
          if (spToggle && !spToggle.disabled) {
            const aria = (spToggle.getAttribute('aria-label') || '').toLowerCase();
            if (aria.includes('pause')) {
              bgAudioAutoResumed = true;
            } else {
              spToggle.click();
            }
          }
        } else if (mediaEl && mediaEl.readyState >= 2) {
          if (curAutoplayPolicy === 'allowed') {
            if (!mediaEl.paused && !mediaEl.muted && mediaEl.volume > 0) {
              bgAudioAutoResumed = true;
            } else {
              mediaEl.muted = false;
              mediaEl.volume = 1.0;
              mediaEl
                .play()
                .then(() => {
                  bgAudioAutoResumed = true;
                })
                .catch(() => {
                  startLocalMseAudioBridge(mediaEl);
                });
            }
          } else {
            // Standard Firefox (media.autoplay.default = 1): use zero-socket in-memory MediaRecorder -> MediaSource bridge!
            startLocalMseAudioBridge(mediaEl);
          }
        }
      }

      // 2. If the user reopened the Sidebar while Background Audio was playing, seamlessly hand playback back to the Sidebar!
      if (sidebarAutoResumeRequested && !isBgAudioFrame) {
        if (host.includes('spotify.com')) {
          const spToggle = document.querySelector('[data-testid="control-button-playpause"]');
          if (spToggle && !spToggle.disabled) {
            const aria = (spToggle.getAttribute('aria-label') || '').toLowerCase();
            if (aria.includes('pause')) {
              sidebarAutoResumeRequested = false;
              notifyParent('PM_SIDEBAR_TOOK_OVER_AUDIO', {});
            } else if (curAutoplayPolicy === 'allowed') {
              spToggle.click();
              sidebarAutoResumeRequested = false;
              notifyParent('PM_SIDEBAR_TOOK_OVER_AUDIO', {});
            }
          }
        } else if (mediaEl && mediaEl.readyState >= 2) {
          if (curAutoplayPolicy === 'allowed') {
            mediaEl.muted = false;
            mediaEl.volume = 1.0;
            mediaEl
              .play()
              .then(() => {
                sidebarAutoResumeRequested = false;
                notifyParent('PM_SIDEBAR_TOOK_OVER_AUDIO', {});
              })
              .catch(() => {
                sidebarAutoResumeRequested = false;
                startLocalMseAudioBridge(mediaEl);
              });
          } else {
            // Reopened sidebar without user click inside iframe yet: play video & stream audio via zero-socket MSE bridge immediately!
            sidebarAutoResumeRequested = false;
            startLocalMseAudioBridge(mediaEl);
          }
        }
      }
    } catch (_) {}
  }

  // If user clicks anywhere inside the reopened sidebar while MSE bridge or auto-resume is active, switch to native unmuted audio with trusted gesture!
  if (!isBgAudioFrame) {
    window.addEventListener(
      'pointerdown',
      () => {
        if (!sidebarAutoResumeRequested && !bgAudioMseBridgeStarted) return;
        sidebarAutoResumeRequested = false;
        stopLocalMseAudioBridge();
        notifyParent('PM_SIDEBAR_TOOK_OVER_AUDIO', {});
        try {
          if (host.includes('spotify.com')) {
            const spToggle = document.querySelector('[data-testid="control-button-playpause"]');
            if (spToggle && !spToggle.disabled) {
              const aria = (spToggle.getAttribute('aria-label') || '').toLowerCase();
              if (!aria.includes('pause')) spToggle.click();
            }
          } else {
            const mediaEl = document.querySelector('video.html5-main-video, video, audio');
            if (mediaEl) {
              mediaEl.muted = false;
              mediaEl.volume = 1.0;
              if (mediaEl.paused) mediaEl.play().catch(() => {});
            }
          }
        } catch (_) {}
      },
      { passive: true, capture: true }
    );
  }

  setInterval(reportLivePlaybackState, isBgAudioFrame ? 800 : 1200);

  // Low-frequency fallback DOM state check — skips heavy DOM inspection whenever media (<video>/<audio>) is playing
  setInterval(() => {
    try {
      const mediaEl = document.querySelector('video, audio');
      if (mediaEl && !mediaEl.paused && !mediaEl.ended) {
        return;
      }
    } catch (_) {}
    handleRouteOrStateCheck();
  }, 3000);

  function resolveTikTokOwnProfileUrl() {
    try {
      // 1. Parse TikTok's rehydration JSON for the logged-in user's uniqueId (100% guaranteed to be the logged-in user, never a "Following" account!)
      const rehydEl = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (rehydEl && rehydEl.textContent) {
        const parsed = JSON.parse(rehydEl.textContent);
        const appCtx = parsed && parsed.__DEFAULT_SCOPE__ && parsed.__DEFAULT_SCOPE__['webapp.app-context'];
        const uniqueId = appCtx && appCtx.user && appCtx.user.uniqueId;
        if (uniqueId && typeof uniqueId === 'string') {
          const fullUrl = `https://www.tiktok.com/@${uniqueId}`;
          try {
            localStorage.setItem('pm_tiktok_own_profile_v2', fullUrl);
          } catch (_) {}
          return fullUrl;
        }
      }
      // 2. Check #SIGI_STATE if present (used on webapp-messages)
      const sigiEl = document.getElementById('SIGI_STATE');
      if (sigiEl && sigiEl.textContent) {
        const parsed = JSON.parse(sigiEl.textContent);
        const uniqueId =
          parsed &&
          parsed.AppContext &&
          parsed.AppContext.appContext &&
          parsed.AppContext.appContext.user &&
          parsed.AppContext.appContext.user.uniqueId;
        if (uniqueId && typeof uniqueId === 'string') {
          const fullUrl = `https://www.tiktok.com/@${uniqueId}`;
          try {
            localStorage.setItem('pm_tiktok_own_profile_v2', fullUrl);
          } catch (_) {}
          return fullUrl;
        }
      }
      // 3. Check STRICTLY [data-e2e="nav-profile"] (NEVER match [data-e2e="nav-side"] a[href^="/@"] which matches "Following accounts"!)
      const profE2e = document.querySelector('[data-e2e="nav-profile"]');
      const navProf =
        profE2e &&
        (profE2e.tagName === 'A'
          ? profE2e
          : profE2e.closest('a[href]') || profE2e.querySelector('a[href]'));
      if (navProf) {
        const href = navProf.getAttribute('href') || navProf.href || '';
        if (href && href.includes('/@')) {
          const fullUrl = new URL(href, window.location.origin).href;
          try {
            localStorage.setItem('pm_tiktok_own_profile_v2', fullUrl);
          } catch (_) {}
          return fullUrl;
        }
      }
      // 4. Fallback to cached own profile URL in TikTok's localStorage
      const cached = localStorage.getItem('pm_tiktok_own_profile_v2');
      if (cached && cached.includes('tiktok.com/@')) {
        return cached;
      }
    } catch (_) {}
    return '';
  }

  function resolveInstagramOwnProfileUrl() {
    try {
      const profLinks = Array.from(
        document.querySelectorAll('nav a[role="link"]:has(img), div[role="navigation"] a:has(img), nav a:has(img)')
      );
      for (const a of profLinks) {
        const href = (a.getAttribute('href') || '').trim();
        if (!href || !href.startsWith('/')) continue;
        const segs = href.split('/').filter(Boolean);
        if (
          segs.length === 1 &&
          !['explore', 'reels', 'direct', 'accounts', 'stories', 'p', 'reel', 'profile'].includes(segs[0].toLowerCase())
        ) {
          const fullUrl = `https://www.instagram.com/${segs[0]}/`;
          try {
            localStorage.setItem('pm_ig_own_profile', fullUrl);
          } catch (_) {}
          return fullUrl;
        }
      }
      const cached = localStorage.getItem('pm_ig_own_profile');
      if (cached && cached.includes('instagram.com/')) {
        return cached;
      }
    } catch (_) {}
    return '';
  }

  function resolveXOwnProfileUrl() {
    try {
      const profLink = document.querySelector(
        '[data-testid="AppTabBar_Profile_Link"], header[role="banner"] nav a[aria-label="Profile" i]'
      );
      if (profLink) {
        const href = (profLink.getAttribute('href') || '').trim();
        if (href && href.startsWith('/')) {
          const segs = href.split('/').filter(Boolean);
          if (
            segs.length === 1 &&
            !['home', 'explore', 'notifications', 'messages', 'i', 'settings', 'search', 'profile', 'compose'].includes(
              segs[0].toLowerCase()
            )
          ) {
            const fullUrl = `https://x.com/${segs[0]}`;
            try {
              localStorage.setItem('pm_x_own_profile', fullUrl);
            } catch (_) {}
            return fullUrl;
          }
        }
      }
      const cached = localStorage.getItem('pm_x_own_profile');
      if (cached && (cached.includes('x.com/') || cached.includes('twitter.com/'))) {
        return cached;
      }
    } catch (_) {}
    return '';
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

  function isRouteMatchForApp(curPath, destPath, iconType = '') {
    const c = (curPath || '/').replace(/\/+$/, '') || '/';
    const d = (destPath || '/').replace(/\/+$/, '') || '/';
    if (c === d) return true;

    if (host.includes('tiktok.com')) {
      if ((d === '/' || d === '/foryou') && (c === '/' || c === '/foryou')) return true;
      if ((iconType === 'profile' || d === '/profile' || d.startsWith('/@')) && c.startsWith('/@')) return true;
      if (d.startsWith('/explore') && c.startsWith('/explore')) return true;
      if (d.startsWith('/following') && c.startsWith('/following')) return true;
      if (d.startsWith('/messages') && c.startsWith('/messages')) return true;
    }

    if (host.includes('instagram.com')) {
      if (d.startsWith('/direct') && c.startsWith('/direct')) return true;
      if (d.startsWith('/reels') && (c.startsWith('/reels') || c.startsWith('/reel/'))) return true;
      if (d.startsWith('/explore') && c.startsWith('/explore')) return true;
      if (iconType === 'profile' || d === '/profile' || d.includes('/accounts')) {
        const isNonProfile =
          c === '/' ||
          c.startsWith('/direct') ||
          c.startsWith('/reels') ||
          c.startsWith('/reel/') ||
          c.startsWith('/explore') ||
          c.startsWith('/stories') ||
          c.startsWith('/accounts');
        if (!isNonProfile) return true;
      }
    }

    if (host.includes('x.com') || host.includes('twitter.com')) {
      if ((d === '/' || d === '/home') && (c === '/' || c === '/home')) return true;
      if (d.startsWith('/explore') && (c.startsWith('/explore') || c.startsWith('/search'))) return true;
      if (d.startsWith('/notifications') && c.startsWith('/notifications')) return true;
      if ((d.startsWith('/messages') || d.startsWith('/i/chat')) && (c.startsWith('/messages') || c.startsWith('/i/chat'))) {
        return true;
      }
      if (iconType === 'profile' || d === '/profile' || d.startsWith('/settings/profile')) {
        const isSystem =
          c === '/' ||
          c === '/home' ||
          c.startsWith('/explore') ||
          c.startsWith('/search') ||
          c.startsWith('/notifications') ||
          c.startsWith('/messages') ||
          c.startsWith('/i/') ||
          c.startsWith('/settings');
        if (!isSystem && c.split('/').filter(Boolean).length >= 1) return true;
      }
    }

    if (host.includes('youtube.com')) {
      if (d.startsWith('/shorts') && c.startsWith('/shorts')) return true;
      if (d.startsWith('/feed/subscriptions') && c.startsWith('/feed/subscriptions')) return true;
      if ((d.startsWith('/feed/you') || d.startsWith('/feed/library')) && (c.startsWith('/feed/you') || c.startsWith('/feed/library'))) {
        return true;
      }
    }

    if (host.includes('messenger.com')) {
      if (d.startsWith('/requests') && c.startsWith('/requests')) return true;
      if (d.startsWith('/archived') && c.startsWith('/archived')) return true;
      if (d === '/' && (c === '/' || c.startsWith('/t/') || c.startsWith('/e2ee/t/'))) return true;
    }

    if (host.includes('discord.com')) {
      if (d.startsWith('/channels/@me') && c.startsWith('/channels/@me')) return true;
      if (d.startsWith('/store') && (c.startsWith('/store') || c.startsWith('/shop'))) return true;
    }

    if (host.includes('reddit.com')) {
      if (d.startsWith('/r/popular') && c.startsWith('/r/popular')) return true;
    }

    return false;
  }

  function findNativeInAppNavElement(destPath, iconType = '', label = '') {
    const cleanTarget = (destPath || '/').replace(/\/+$/, '') || '/';
    try {
      // 1. Instagram
      if (host.includes('instagram.com')) {
        if (iconType === 'profile' || cleanTarget === '/profile' || cleanTarget.includes('/accounts')) {
          const profLink = document.querySelector(
            'nav a[role="link"]:has(img), div[role="navigation"] a:has(img), nav a:has(img)'
          );
          if (profLink) return resolveClickableRouterNode(profLink);
        }
        if (cleanTarget === '/') {
          return resolveClickableRouterNode(
            document.querySelector('nav a[href="/"], div[role="navigation"] a[href="/"], a[href="/"]')
          );
        }
        if (cleanTarget.startsWith('/direct')) {
          return resolveClickableRouterNode(
            document.querySelector(
              'a[href="/direct/inbox/"], a[href="/direct/inbox"], nav a[href*="/direct"], div[role="navigation"] a[href*="/direct"]'
            )
          );
        }
        if (cleanTarget.startsWith('/reels')) {
          return resolveClickableRouterNode(
            document.querySelector(
              'a[href="/reels/"], a[href="/reels"], nav a[href*="/reels"], div[role="navigation"] a[href*="/reels"]'
            )
          );
        }
        if (cleanTarget.startsWith('/explore')) {
          return resolveClickableRouterNode(
            document.querySelector(
              'a[href="/explore/"], a[href="/explore"], nav a[href*="/explore"], div[role="navigation"] a[href*="/explore"]'
            )
          );
        }
      }
      // 2. TikTok
      else if (host.includes('tiktok.com')) {
        if (cleanTarget === '/' || cleanTarget === '/foryou' || iconType === 'home') {
          const el = document.querySelector(
            '[data-e2e="nav-foryou"], a[href="/foryou"], [data-e2e="nav-side"] a[href="/"]'
          );
          return resolveClickableRouterNode(el);
        }
        if (cleanTarget.startsWith('/explore') || iconType === 'explore') {
          const el = document.querySelector('[data-e2e="nav-explore"], a[href="/explore"], a[href^="/explore?"]');
          return resolveClickableRouterNode(el);
        }
        if (cleanTarget.startsWith('/following') || iconType === 'users') {
          const el = document.querySelector('[data-e2e="nav-following"], a[href="/following"], a[href^="/following?"]');
          return resolveClickableRouterNode(el);
        }
        if (cleanTarget.startsWith('/messages') || iconType === 'messages') {
          const el = document.querySelector(
            'a[href="/messages"], a[href^="/messages?"], [data-e2e="nav-messages"]'
          );
          return resolveClickableRouterNode(el);
        }
        if (iconType === 'profile' || cleanTarget.startsWith('/@') || cleanTarget.startsWith('/profile')) {
          const el = document.querySelector('[data-e2e="nav-profile"]');
          return resolveClickableRouterNode(el);
        }
      }
      // 3. Spotify
      else if (host.includes('spotify.com')) {
        if (cleanTarget === '/') {
          return resolveClickableRouterNode(
            document.querySelector(
              'button[data-testid="home-button"], a[data-testid="home-button"], a[aria-label="Home" i], button[aria-label="Home" i], a[href="/"]'
            )
          );
        }
        if (cleanTarget.startsWith('/search')) {
          return resolveClickableRouterNode(
            document.querySelector(
              'a[href="/search"], button[data-testid="browse-button"], button[aria-label="Browse" i], button[aria-label="Search" i], [data-testid="search-input"]'
            )
          );
        }
        if (cleanTarget.startsWith('/collection')) {
          return resolveClickableRouterNode(document.querySelector('a[href*="/collection"]'));
        }
      }
      // 4. X (Twitter)
      else if (host.includes('x.com') || host.includes('twitter.com')) {
        if (cleanTarget === '/' || cleanTarget === '/home') {
          return resolveClickableRouterNode(
            document.querySelector('[data-testid="AppTabBar_Home_Link"], a[href="/home"]')
          );
        }
        if (cleanTarget.startsWith('/explore')) {
          return resolveClickableRouterNode(
            document.querySelector('[data-testid="AppTabBar_Explore_Link"], a[href="/explore"]')
          );
        }
        if (cleanTarget.startsWith('/notifications')) {
          return resolveClickableRouterNode(
            document.querySelector('[data-testid="AppTabBar_Notifications_Link"], a[href="/notifications"]')
          );
        }
        if (cleanTarget.startsWith('/messages') || cleanTarget.startsWith('/i/chat')) {
          return resolveClickableRouterNode(
            document.querySelector(
              '[data-testid="AppTabBar_DirectMessage_Link"], a[href="/i/chat"], a[href="/messages"]'
            )
          );
        }
        if (iconType === 'profile' || cleanTarget === '/profile' || cleanTarget.startsWith('/settings/profile')) {
          return resolveClickableRouterNode(
            document.querySelector('[data-testid="AppTabBar_Profile_Link"], header[role="banner"] nav a[aria-label="Profile" i]')
          );
        }
      }
      // 5. YouTube
      else if (host.includes('youtube.com')) {
        if (cleanTarget === '/') {
          return resolveClickableRouterNode(
            document.querySelector(
              'ytd-mini-guide-entry-renderer a[href="/"], ytd-guide-entry-renderer a[href="/"], ytd-mini-guide-entry-renderer a[title="Home" i], a#logo'
            )
          );
        }
        if (cleanTarget.startsWith('/shorts')) {
          return resolveClickableRouterNode(
            document.querySelector(
              'ytd-mini-guide-entry-renderer a[title="Shorts" i], ytd-guide-entry-renderer a[title="Shorts" i], ytd-mini-guide-entry-renderer[aria-label="Shorts" i] a#endpoint, a[title="Shorts" i]'
            )
          );
        }
        if (cleanTarget.startsWith('/feed/subscriptions')) {
          return resolveClickableRouterNode(
            document.querySelector(
              'ytd-mini-guide-entry-renderer a[href="/feed/subscriptions"], ytd-guide-entry-renderer a[href="/feed/subscriptions"], a[title="Subscriptions" i], a[href="/feed/subscriptions"]'
            )
          );
        }
        if (cleanTarget.startsWith('/feed/you') || cleanTarget.startsWith('/feed/library')) {
          return resolveClickableRouterNode(
            document.querySelector(
              'ytd-mini-guide-entry-renderer a[href="/feed/you"], ytd-guide-entry-renderer a[href="/feed/you"], a[href="/feed/you"], a[href="/feed/library"], a[title="You" i]'
            )
          );
        }
      }
      // 6. Reddit
      else if (host.includes('reddit.com')) {
        if (cleanTarget === '/') {
          return resolveClickableRouterNode(
            document.querySelector(
              'left-nav-top-section a[href="/"], left-nav-top-section a[href^="/?feed=home"], a#reddit-logo, a[href="/?feed=home"], a[href="/"]'
            )
          );
        }
        if (cleanTarget.startsWith('/r/popular')) {
          return resolveClickableRouterNode(
            document.querySelector('left-nav-top-section a[href*="/r/popular"], a[href="/r/popular/"], a[href="/r/popular"]')
          );
        }
      }
      // 7. Discord
      else if (host.includes('discord.com')) {
        if (cleanTarget.startsWith('/store')) {
          return resolveClickableRouterNode(
            document.querySelector('a[href="/store"], a[href="/shop"], [aria-label="Nitro" i]')
          );
        }
        if (cleanTarget.startsWith('/channels/@me')) {
          if (iconType === 'users' || label.toLowerCase() === 'friends') {
            return resolveClickableRouterNode(
              document.querySelector('a[href="/channels/@me"], [aria-label="Friends" i], [data-list-item-id="guildsnav___home"]')
            );
          }
          return resolveClickableRouterNode(
            document.querySelector('[data-list-item-id="guildsnav___home"], a[href="/channels/@me"], [aria-label="Direct Messages" i]')
          );
        }
      }
      // 8. Messenger
      else if (host.includes('messenger.com')) {
        if (cleanTarget.startsWith('/requests')) {
          return resolveClickableRouterNode(
            document.querySelector('a[href*="/requests"], [aria-label*="Requests" i], [aria-label*="Message requests" i]')
          );
        }
        if (cleanTarget.startsWith('/archived')) {
          return resolveClickableRouterNode(
            document.querySelector('a[href*="/archived"], [aria-label*="Archive" i], [aria-label*="Archived chats" i]')
          );
        }
        if (cleanTarget === '/') {
          return resolveClickableRouterNode(
            document.querySelector('a[aria-label="Chats" i], [role="navigation"] [aria-label="Chats" i], a[href^="/t/"]')
          );
        }
      }
      // 9. WhatsApp
      else if (host.includes('whatsapp.com')) {
        return resolveClickableRouterNode(
          document.querySelector('button[aria-label="Chats" i], [data-icon="chat"]')
        );
      }

      // 10. Generic exact pathname href match in the live DOM (never match random /@creator links!)
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
    lastRouteOrClickAt = Date.now();

    // Resolve logged-in user's own profile URL on TikTok, Instagram, and X so clicking "Profile" always goes to their real profile page!
    if (icon === 'profile' || targetUrl.endsWith('/profile')) {
      const ownProfUrl = getOwnProfileUrlForCurrentHost();
      if (ownProfUrl) {
        targetUrl = ownProfUrl;
      }
    }

    let dest = null;
    try {
      dest = new URL(targetUrl, window.location.href);
    } catch (_) {
      window.location.href = targetUrl;
      return;
    }

    // Cross-origin subView (e.g., www.reddit.com -> chat.reddit.com, www.youtube.com -> music.youtube.com, open.spotify.com -> accounts.spotify.com)
    if (dest.origin !== window.location.origin) {
      notifyParent('PM_FRAME_NAV_START', { title: label ? `Opening ${label}…` : undefined });
      window.location.href = targetUrl;
      return;
    }

    const startPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    const destPath = (dest.pathname || '/').replace(/\/+$/, '') || '/';

    // Special Case 1: Spotify Zero-Reload View Switching (Never reload open.spotify.com or audio stops!)
    if (host.includes('spotify.com')) {
      const spView =
        destPath.startsWith('/collection') || dest.hash === '#library' || icon === 'library'
          ? 'library'
          : destPath.startsWith('/search') || icon === 'search'
          ? 'search'
          : 'player';
      spotifyViewOverride = spView;
      syncAppSpecificDomState();

      if (spView === 'library') {
        notifyParent('PM_FRAME_URL_CHANGED', {
          url: 'https://open.spotify.com/collection/playlists',
          title: document.title || ''
        });
        return;
      }

      const spEl = findNativeInAppNavElement(destPath, icon, label);
      if (spEl) {
        spEl.click();
        if (spView === 'search') {
          const searchInput = document.querySelector('[data-testid="search-input"], input[type="search"]');
          if (searchInput) searchInput.focus();
        }
      }
      scheduleStaggeredRouteChecks();
      notifyParent('PM_FRAME_URL_CHANGED', {
        url: spView === 'search' ? 'https://open.spotify.com/search' : 'https://open.spotify.com/',
        title: document.title || ''
      });
      return;
    }

    // Special Case 2: TikTok transition into or out of /messages (separate webapp-messages micro-frontend)
    if (host.includes('tiktok.com')) {
      const isCurrentlyOnMessages = startPath.startsWith('/messages');
      const isTargetMessages = destPath.startsWith('/messages');
      if (isCurrentlyOnMessages !== isTargetMessages) {
        pauseActiveVideosSoftly();
        notifyParent('PM_FRAME_NAV_START', { title: label ? `Opening ${label}…` : undefined });
        if (destPath === '/profile' || icon === 'profile') {
          const ownUrl = resolveTikTokOwnProfileUrl();
          if (ownUrl) {
            window.location.href = ownUrl;
            return;
          }
          const profEl = findNativeInAppNavElement('/profile', 'profile', label);
          if (profEl) {
            profEl.click();
            return;
          }
          window.location.href = 'https://www.tiktok.com/?pm_goto_profile=1';
          return;
        }
        window.location.href = targetUrl;
        return;
      }

      // Leaving TikTok video feed for Explore or Profile: pause active video so audio doesn't play over Explore/Profile
      const isLeavingFeed =
        (startPath === '/' || startPath.startsWith('/foryou') || startPath.startsWith('/following')) &&
        (destPath.startsWith('/explore') || destPath.startsWith('/@') || destPath === '/profile' || icon === 'profile');
      if (isLeavingFeed) {
        pauseActiveVideosSoftly();
      }
    }

    // Lock the optimistic view state for 1800ms so syncAppSpecificDomState never reverts it at 60ms while React 18 transitions
    pendingSpaTarget = {
      destPath,
      icon,
      expiresAt: Date.now() + 1800,
      tiktokView: host.includes('tiktok.com')
        ? destPath.startsWith('/messages')
          ? 'messages'
          : destPath.startsWith('/explore')
          ? 'explore'
          : destPath.startsWith('/@') || destPath.startsWith('/profile') || icon === 'profile'
          ? 'profile'
          : 'feed'
        : undefined,
      igView: host.includes('instagram.com')
        ? destPath.startsWith('/reels')
          ? 'reels'
          : destPath.startsWith('/direct')
          ? 'dm-inbox'
          : destPath.startsWith('/explore')
          ? 'explore'
          : 'feed'
        : undefined,
      messengerView: host.includes('messenger.com') ? 'inbox' : undefined
    };
    syncAppSpecificDomState();

    // Special Case 3: Discord two-step transition when inside a server and clicking Nitro (/store) or Friends
    if (host.includes('discord.com') && !startPath.startsWith('/channels/@me') && !startPath.startsWith('/store')) {
      const homeGuildBtn = document.querySelector('[data-list-item-id="guildsnav___home"], a[href="/channels/@me"]');
      if (homeGuildBtn && destPath.startsWith('/store')) {
        homeGuildBtn.click();
        setTimeout(() => {
          const storeEl = findNativeInAppNavElement('/store', icon, label);
          if (storeEl) storeEl.click();
          scheduleStaggeredRouteChecks();
        }, 90);
        return;
      }
    }

    // 1. Try clicking the app's own native router link in the DOM for 0ms SPA transition
    const nativeEl = findNativeInAppNavElement(dest.pathname, icon, label);
    if (nativeEl) {
      nativeEl.click();
      scheduleStaggeredRouteChecks();

      // Generous 1100ms verification window for React 18 startTransition / lazy chunks (never false-reloads at 280ms!)
      setTimeout(() => {
        const curPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
        if (isRouteMatchForApp(curPath, destPath, icon) || curPath !== startPath) {
          handleRouteOrStateCheck();
          return;
        }
        // Only fall back to location.href if the URL didn't budge at all after 1100ms AND we aren't already on a matching view
        if (destPath === '/profile' || icon === 'profile') {
          const ownUrl = getOwnProfileUrlForCurrentHost();
          if (ownUrl) window.location.href = ownUrl;
        } else if (!host.includes('whatsapp.com') && !host.includes('discord.com')) {
          window.location.href = targetUrl;
        }
      }, 1100);
      return;
    }

    // If we are already on an equivalent route and no native link needed clicking, just sync state without reloading!
    if (isRouteMatchForApp(startPath, destPath, icon) && !dest.search) {
      handleRouteOrStateCheck();
      return;
    }

    // 2. Try dispatching a bubbling click on a temporary same-origin <a> so delegated SPA routers intercept it
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
      if (!isRouteMatchForApp(curPath, destPath, icon) && curPath === startPath) {
        if (destPath === '/profile' || icon === 'profile') {
          const ownUrl = getOwnProfileUrlForCurrentHost();
          if (ownUrl) window.location.href = ownUrl;
        } else if (!host.includes('whatsapp.com')) {
          window.location.href = targetUrl;
        }
      } else {
        handleRouteOrStateCheck();
      }
    }, 550);
  }

  function applyZoom(newZoom) {
    currentZoom = Math.max(0.5, Math.min(1.4, Number(newZoom) || 1.0));
    if (document.documentElement) {
      document.documentElement.style.zoom = String(currentZoom);
    }
    notifyParent('PM_FRAME_ZOOM_UPDATED', { zoom: currentZoom });
  }

  // Listen for navigation, zoom & theme commands from parent PocketHub toolbar
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg || msg.target !== 'pocketmail-media-frame') return;

    switch (msg.cmd) {
      case 'AUTO_RESUME_PLAYBACK':
        sidebarAutoResumeRequested = true;
        reportLivePlaybackState();
        break;
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
        applyZoom(currentZoom + 0.1);
        break;
      case 'ZOOM_OUT':
        applyZoom(currentZoom - 0.1);
        break;
      case 'ZOOM_RESET':
        applyZoom(1.0);
        break;
      case 'APPLY_APP_THEME':
        injectAppThemeCss(msg.themeMode || 'native', msg.accentColor || '#6C5CE7');
        break;
      case 'ZOOM_FIT': {
        if (Math.abs(currentZoom - 1.0) > 0.04) {
          applyZoom(1.0);
        } else {
          const vw = window.innerWidth || 450;
          const sw = Math.max(
            document.documentElement ? document.documentElement.scrollWidth : vw,
            document.body ? document.body.scrollWidth : vw,
            host.includes('whatsapp.com') ? 620 : host.includes('spotify.com') ? 540 : vw
          );
          const ratio = sw > vw + 12 ? Math.max(0.62, Math.min(0.95, (vw - 8) / sw)) : 0.88;
          applyZoom(ratio);
        }
        break;
      }
      default:
        break;
    }
  });
})();
