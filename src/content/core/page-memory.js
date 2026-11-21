/**
 * FoxHub Content Core — Persistent Page Memory & Scroll Position Restoration
 */

let routeRestoreCallback = null;

export function checkPersistentRouteRestore() {
  if (typeof routeRestoreCallback === 'function') {
    routeRestoreCallback();
  }
}

export function initPageMemory(ctx, opt = null) {
  if (ctx.isBgAudioFrame || ctx.isStandbyBgFrame || ctx.isSwBootstrap) return;

  // TikTok & X 6.5s initial auto-scroll guard
  if (ctx.hasHost('tiktok.com') || ctx.hasHost('x.com') || ctx.hasHost('twitter.com')) {
    let tiktokUserScrolled = false;
    const tiktokBootAt = Date.now();
    const markTikTokUserScroll = () => {
      tiktokUserScrolled = true;
    };
    window.addEventListener('wheel', markTikTokUserScroll, { capture: true, passive: true });
    window.addEventListener('touchstart', markTikTokUserScroll, { capture: true, passive: true });
    window.addEventListener('keydown', markTikTokUserScroll, { capture: true, passive: true });
    window.addEventListener('pointerdown', markTikTokUserScroll, { capture: true, passive: true });

    window.addEventListener(
      'scroll',
      (ev) => {
        ctx.state.lastTikTokFeedScrollAt = Date.now();
        const curPath = window.location.pathname || '/';
        const isFeed =
          curPath === '/' ||
          curPath.startsWith('/foryou') ||
          curPath.startsWith('/following') ||
          curPath.startsWith('/home');
        if (isFeed && !tiktokUserScrolled && Date.now() - tiktokBootAt < 6500) {
          if ((window.scrollY || 0) > 4) window.scrollTo(0, 0);
          const t = ev && ev.target;
          if (t && t !== document && t !== window && typeof t.scrollTop === 'number' && t.scrollTop > 4) {
            t.scrollTop = 0;
          }
        }
      },
      { capture: true, passive: true }
    );
  }

  // 1. Persistent Route & Video Time Memory (pm_page_memory_v1)
  const STORAGE_KEY = 'pm_page_memory_v1';
  const skipPageMemory = Boolean(
    (opt && opt.disablePageMemory) ||
      ctx.hasHost('tiktok.com') ||
      ctx.hasHost('x.com') ||
      ctx.hasHost('twitter.com') ||
      ctx.hasHost('discord.com') ||
      ctx.hasHost('discordapp.com') ||
      ctx.hasHost('whatsapp.com') ||
      ctx.hasHost('whatsapp.net') ||
      ctx.hasHost('messenger.com') ||
      ctx.hasHost('telegram.org') ||
      ctx.hasHost('mail.google.com')
  );

  if (ctx.hasHost('tiktok.com') || ctx.hasHost('x.com') || ctx.hasHost('twitter.com')) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  if (!skipPageMemory) {
    let lastSaveAt = 0;
    let activeInnerScrollEl = null;
    let userHasScrolledOrClicked = false;
    let isRestoringScroll = false;
    let lastRestoredRouteKey = '';
    let routeEnteredAt = Date.now();

    const getRouteKey = () => {
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete('pm_boot');
        u.searchParams.delete('t');
        return `${u.pathname || '/'}${u.search || ''}`;
      } catch (_) {
        return window.location.pathname || '/';
      }
    };

    const readMemoryMap = () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) || {} : {};
      } catch (_) {
        return {};
      }
    };

    const writeMemoryMap = (map) => {
      try {
        const keys = Object.keys(map);
        if (keys.length > 24) {
          keys
            .sort((a, b) => (map[a]?.ts || 0) - (map[b]?.ts || 0))
            .slice(0, keys.length - 24)
            .forEach((k) => delete map[k]);
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
      } catch (_) {}
    };

    const buildContainerSelector = (el) => {
      if (!el || el === document || el === document.documentElement || el === document.body) return '';
      if (el.id) return `#${CSS.escape(el.id)}`;
      const testId = el.getAttribute && el.getAttribute('data-testid');
      if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
      const role = el.getAttribute && el.getAttribute('role');
      if (role) return `${el.tagName.toLowerCase()}[role="${CSS.escape(role)}"]`;
      if (typeof el.className === 'string' && el.className.trim()) {
        const firstCls = el.className.trim().split(/\s+/)[0];
        if (firstCls && !firstCls.includes(':')) {
          return `${el.tagName.toLowerCase()}.${CSS.escape(firstCls)}`;
        }
      }
      return el.tagName ? el.tagName.toLowerCase() : '';
    };

    const findBestVisibleVideo = () => {
      const vids = document.querySelectorAll('video');
      for (let i = 0; i < vids.length; i++) {
        const v = vids[i];
        if (!v.paused && !v.ended && v.readyState >= 1) return v;
      }
      const vh = window.innerHeight || 600;
      for (let i = 0; i < vids.length; i++) {
        const v = vids[i];
        const r = v.getBoundingClientRect();
        if (r.height > 80 && r.bottom > 40 && r.top < vh - 40) return v;
      }
      return vids[0] || null;
    };

    const saveCurrentPageMemory = (force = false) => {
      const now = Date.now();
      if (!force && now - lastSaveAt < 450) return;
      if (!force && !userHasScrolledOrClicked && now - routeEnteredAt < 3200) return;
      lastSaveAt = now;

      const key = getRouteKey();
      const winY = Math.round(window.scrollY || window.pageYOffset || 0);
      let innerTop = 0;
      let innerSel = '';
      if (
        activeInnerScrollEl &&
        activeInnerScrollEl !== document.documentElement &&
        activeInnerScrollEl !== document.body &&
        document.contains(activeInnerScrollEl)
      ) {
        innerTop = Math.round(activeInnerScrollEl.scrollTop || 0);
        innerSel = buildContainerSelector(activeInnerScrollEl);
      }

      let videoTime = 0;
      const vid = findBestVisibleVideo();
      if (vid && Number.isFinite(vid.currentTime) && vid.currentTime > 1.2 && (!vid.duration || vid.currentTime < vid.duration - 0.8)) {
        videoTime = Math.floor(vid.currentTime);
      }

      if (!userHasScrolledOrClicked && winY < 10 && innerTop < 10 && videoTime <= 1) return;

      const map = readMemoryMap();
      const prev = map[key];
      const finalWinY = winY < 15 && !userHasScrolledOrClicked && prev && prev.winY > 25 ? prev.winY : winY;
      const finalInnerTop = innerTop < 15 && !userHasScrolledOrClicked && prev && prev.innerTop > 25 ? prev.innerTop : innerTop;
      const finalInnerSel = finalInnerTop > 0 ? innerSel || (prev && prev.innerSel) || '' : '';

      map[key] = {
        winY: finalWinY,
        innerTop: finalInnerTop,
        innerSel: finalInnerSel,
        videoTime: videoTime > 1 ? videoTime : prev && !userHasScrolledOrClicked ? prev.videoTime || 0 : 0,
        ts: now
      };
      writeMemoryMap(map);
    };

    window.addEventListener(
      'scroll',
      (ev) => {
        const t = ev.target;
        if (t && t !== document && t !== document.documentElement && t !== document.body && typeof t.scrollTop === 'number') {
          activeInnerScrollEl = t;
        }
        if (userHasScrolledOrClicked || (!isRestoringScroll && Date.now() - routeEnteredAt > 4500)) {
          saveCurrentPageMemory(false);
        }
      },
      { capture: true, passive: true }
    );

    let lastVideoTimeSaveAt = 0;
    document.addEventListener(
      'timeupdate',
      (ev) => {
        const t = ev.target;
        if (t && t.tagName === 'VIDEO' && t.currentTime > 1.5) {
          const now = Date.now();
          if (now - lastVideoTimeSaveAt >= 5000) {
            lastVideoTimeSaveAt = now;
            saveCurrentPageMemory(false);
          }
        }
      },
      { capture: true, passive: true }
    );
    document.addEventListener(
      'pause',
      (ev) => {
        const t = ev.target;
        if (t && t.tagName === 'VIDEO' && t.currentTime > 1.5) {
          saveCurrentPageMemory(true);
        }
      },
      { capture: true, passive: true }
    );

    window.addEventListener('pagehide', () => saveCurrentPageMemory(true), { passive: true });
    window.addEventListener('beforeunload', () => saveCurrentPageMemory(true), { passive: true });

    const markUserInteraction = () => {
      userHasScrolledOrClicked = true;
    };
    window.addEventListener('wheel', markUserInteraction, { passive: true });
    window.addEventListener('touchstart', markUserInteraction, { passive: true });
    window.addEventListener('keydown', markUserInteraction, { passive: true });
    window.addEventListener('pointerdown', markUserInteraction, { passive: true });

    const restoreForRoute = () => {
      const key = getRouteKey();
      if (lastRestoredRouteKey === key) return;
      lastRestoredRouteKey = key;
      routeEnteredAt = Date.now();
      userHasScrolledOrClicked = false;

      const map = readMemoryMap();
      const entry = map[key];
      if (!entry || Date.now() - (entry.ts || 0) > 7 * 24 * 3600 * 1000) {
        isRestoringScroll = false;
        return;
      }

      let videoTimeRestored = false;
      let winScrollRestored = false;
      isRestoringScroll = true;

      const applyScrollRestore = () => {
        if (userHasScrolledOrClicked) {
          isRestoringScroll = false;
          return;
        }
        const p = window.location.pathname || '/';
        const isSnapReelRoute = p.startsWith('/reels') || p.startsWith('/reel/') || p.startsWith('/shorts');
        try {
          if (!isSnapReelRoute && !winScrollRestored && entry.winY > 15 && Math.abs((window.scrollY || 0) - entry.winY) > 20) {
            window.scrollTo({ top: entry.winY, behavior: 'instant' });
            if (Math.abs((window.scrollY || 0) - entry.winY) <= 24) winScrollRestored = true;
          }
          if (!isSnapReelRoute && entry.innerTop > 15 && entry.innerSel) {
            const container = document.querySelector(entry.innerSel);
            if (container && Math.abs((container.scrollTop || 0) - entry.innerTop) > 20) {
              container.scrollTop = entry.innerTop;
              activeInnerScrollEl = container;
            }
          }
          if (
            !videoTimeRestored &&
            entry.videoTime > 1.5 &&
            !window.location.search.includes('t=') &&
            !ctx.hasHost('spotify.com')
          ) {
            const vid = findBestVisibleVideo();
            if (vid && vid.readyState >= 1) {
              if ((vid.currentTime || 0) < 2.0) vid.currentTime = entry.videoTime;
              videoTimeRestored = true;
            }
          }
        } catch (_) {}
      };

      [80, 260, 600, 1200, 2100, 3300].forEach((delay) => setTimeout(applyScrollRestore, delay));
      setTimeout(() => {
        isRestoringScroll = false;
      }, 3500);
    };

    routeRestoreCallback = restoreForRoute;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', restoreForRoute, { once: true });
    } else {
      restoreForRoute();
    }
    window.addEventListener('popstate', restoreForRoute, { passive: true });
  }

  // 2. Persistent Scroll Position Save & Instant Restore across FoxHub Close & Reopen (__pm_persist_scroll_v1)
  const SCROLL_STORE_KEY = '__pm_persist_scroll_v1';
  let scrollSaveTimer = null;
  let userScrolledManually = false;

  const findPrimaryScrollContainer = () => {
    try {
      const candidates = document.querySelectorAll(
        'main, [role="main"], [data-testid="primaryColumn"], .main-view-container__scroll-node, .scrollable-page'
      );
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (c && c.scrollHeight > c.clientHeight + 80 && c.scrollTop > 0) return c;
      }
    } catch (_) {}
    return null;
  };

  const persistCurrentScroll = () => {
    try {
      const winY = Math.round(window.scrollY || document.documentElement?.scrollTop || 0);
      const innerEl = winY <= 2 ? findPrimaryScrollContainer() : null;
      const innerY = innerEl ? Math.round(innerEl.scrollTop || 0) : 0;
      if (winY <= 4 && innerY <= 4) return;
      window.localStorage.setItem(
        SCROLL_STORE_KEY,
        JSON.stringify({
          p: window.location.pathname + window.location.search,
          w: winY,
          i: innerY,
          ts: Date.now()
        })
      );
    } catch (_) {}
  };

  window.addEventListener(
    'scroll',
    (ev) => {
      if (ev && ev.isTrusted) userScrolledManually = true;
      clearTimeout(scrollSaveTimer);
      scrollSaveTimer = setTimeout(persistCurrentScroll, 320);
    },
    { capture: true, passive: true }
  );
  window.addEventListener('pagehide', persistCurrentScroll, { capture: true, passive: true });

  const attemptRestoreSavedScroll = () => {
    if (userScrolledManually) return;
    try {
      const raw = window.localStorage.getItem(SCROLL_STORE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || Date.now() - (saved.ts || 0) > 6 * 3600 * 1000) return;
      if (saved.p !== window.location.pathname + window.location.search) return;
      if (saved.w > 4 && (document.documentElement?.scrollHeight || 0) > window.innerHeight + 40) {
        window.scrollTo(0, saved.w);
      } else if (saved.i > 4) {
        const candidates = document.querySelectorAll(
          'main, [role="main"], [data-testid="primaryColumn"], .main-view-container__scroll-node, .scrollable-page'
        );
        for (let i = 0; i < candidates.length; i++) {
          const c = candidates[i];
          if (c && c.scrollHeight > c.clientHeight + 80) {
            c.scrollTop = saved.i;
            break;
          }
        }
      }
    } catch (_) {}
  };

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        attemptRestoreSavedScroll();
        setTimeout(attemptRestoreSavedScroll, 220);
      },
      { once: true }
    );
  } else {
    attemptRestoreSavedScroll();
    setTimeout(attemptRestoreSavedScroll, 220);
  }
}
