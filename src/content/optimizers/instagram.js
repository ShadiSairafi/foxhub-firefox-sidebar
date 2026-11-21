/**
 * FoxHub Per-App Optimizer — Instagram
 */

export function initOptimizer(ctx) {
  const isDmRoute = () => (window.location.pathname || '').startsWith('/direct');

  // Block Instagram's floating DM Story Ring portal from hijacking avatar clicks
  const blockStoryHover = (e) => {
    if (!isDmRoute()) return;
    const t = e.target;
    if (!t || !t.closest) return;
    const rowBtn = t.closest('div[role="button"][tabindex="0"], [role="listitem"]');
    if (!rowBtn) return;
    const storyWrap = t.closest('div:has(> canvas)');
    if (storyWrap && rowBtn.contains(storyWrap)) {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  };

  const interceptStoryPortalClick = (e) => {
    if (!isDmRoute()) return;
    const t = e.target;
    if (!t || !t.closest) return;
    const portalBtn = t.closest('body > button[style*="position: fixed"]');
    if (portalBtn) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      portalBtn.style.display = 'none';
      portalBtn.style.pointerEvents = 'none';
      if (e.type === 'click' && typeof e.clientX === 'number') {
        const underEl = document.elementFromPoint(e.clientX, e.clientY);
        const dmRow = underEl && underEl.closest ? underEl.closest('div[role="button"][tabindex="0"]') : null;
        if (dmRow) dmRow.click();
      }
      return;
    }
    const rowBtn = t.closest('div[role="button"][tabindex="0"]');
    if (rowBtn) {
      const storyWrap = t.closest('div:has(> canvas)');
      if (storyWrap && rowBtn.contains(storyWrap) && t !== rowBtn) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.type === 'click') rowBtn.click();
      }
    }
  };

  window.addEventListener('pointerover', blockStoryHover, true);
  window.addEventListener('pointerenter', blockStoryHover, true);
  window.addEventListener('mouseover', blockStoryHover, true);
  window.addEventListener('pointerdown', interceptStoryPortalClick, true);
  window.addEventListener('mousedown', interceptStoryPortalClick, true);
  window.addEventListener('click', interceptStoryPortalClick, true);

  function resolveOwnProfileUrl() {
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
          try { window.localStorage.setItem('pm_ig_own_profile', fullUrl); } catch (_) {}
          return fullUrl;
        }
      }
      const cached = window.localStorage.getItem('pm_ig_own_profile');
      if (cached && cached.includes('instagram.com/')) return cached;
    } catch (_) {}
    return '';
  }

  function findNavEl(cleanTarget, iconType) {
    if (iconType === 'profile' || cleanTarget === '/profile' || cleanTarget.includes('/accounts')) {
      const profLink = document.querySelector('nav a[role="link"]:has(img), div[role="navigation"] a:has(img), nav a:has(img)');
      if (profLink) return profLink;
    }
    if (cleanTarget === '/') {
      return document.querySelector('nav a[href="/"], div[role="navigation"] a[href="/"], a[href="/"]');
    }
    if (cleanTarget.startsWith('/direct')) {
      return document.querySelector(
        'a[href="/direct/inbox/"], a[href="/direct/inbox"], nav a[href*="/direct"], div[role="navigation"] a[href*="/direct"]'
      );
    }
    if (cleanTarget.startsWith('/reels')) {
      return document.querySelector(
        'a[href="/reels/"], a[href="/reels"], nav a[href*="/reels"], div[role="navigation"] a[href*="/reels"]'
      );
    }
    if (cleanTarget.startsWith('/explore')) {
      return document.querySelector(
        'a[href="/explore/"], a[href="/explore"], nav a[href*="/explore"], div[role="navigation"] a[href*="/explore"]'
      );
    }
    return null;
  }

  return {
    appId: 'instagram',
    disableSmartInvert: true,

    syncDomState(pendingSpaTarget) {
      const root = document.documentElement;
      if (!root) return;
      const path = window.location.pathname || '/';
      let igView = 'feed';
      const hasProfileHeader = Boolean(document.querySelector('main[role="main"] header'));
      if (pendingSpaTarget && pendingSpaTarget.igView) {
        igView = pendingSpaTarget.igView;
      } else if ((path === '/reels' || path.startsWith('/reels/')) && !hasProfileHeader) {
        igView = 'reels';
      } else if (path.startsWith('/direct/t/')) {
        igView = 'dm-thread';
      } else if (path.startsWith('/direct')) {
        igView = 'dm-inbox';
      } else if (path.startsWith('/explore')) {
        igView = 'explore';
      }
      if (hasProfileHeader && igView === 'reels') igView = 'feed';
      if (root.getAttribute('data-pm-ig-view') !== igView) {
        root.setAttribute('data-pm-ig-view', igView);
      }
    },

    buildPendingSpaTarget(destPath) {
      return {
        igView: destPath.startsWith('/reels')
          ? 'reels'
          : destPath.startsWith('/direct')
          ? 'dm-inbox'
          : destPath.startsWith('/explore')
          ? 'explore'
          : 'feed'
      };
    },

    onDocumentClick(e) {
      if (!e.target || !e.target.closest) return;
      const dialogArt = e.target.closest('div[role="dialog"] article');
      if (dialogArt) {
        const btn = e.target.closest('[role="button"], button');
        const hasCommentSvg =
          (e.target.tagName === 'svg' && e.target.getAttribute('aria-label') === 'Comment') ||
          (btn && btn.querySelector && btn.querySelector('svg[aria-label="Comment"]'));
        if (hasCommentSvg) {
          const isOpen = dialogArt.getAttribute('data-pm-comments-open') === 'true';
          if (isOpen) {
            dialogArt.removeAttribute('data-pm-comments-open');
            dialogArt.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            dialogArt.setAttribute('data-pm-comments-open', 'true');
            setTimeout(() => {
              try {
                const commentInput = dialogArt.querySelector('textarea, input[placeholder*="comment" i]');
                if (commentInput) commentInput.focus({ preventScroll: true });
              } catch (_) {}
            }, 50);
          }
        } else {
          const mediaBox = e.target.closest('._aatk');
          const isCustomMute = e.target.closest('button[data-pm-ig-modal-mute="1"]');
          const isCarouselOrTagBtn = btn && (btn.getAttribute('aria-label') || '').match(/next|back|previous|tag/i);
          if (mediaBox && !isCustomMute && !isCarouselOrTagBtn) {
            const vid = mediaBox.querySelector('video');
            if (vid) {
              const wasPaused = vid.paused;
              setTimeout(() => {
                try {
                  if (vid.paused === wasPaused) {
                    if (wasPaused) vid.play().catch(() => {});
                    else vid.pause();
                  }
                } catch (_) {}
              }, 35);
            }
          }
        }
      } else {
        const inDialog = e.target.closest('div[role="dialog"]');
        if (inDialog) {
          const openArt = inDialog.querySelector('article[data-pm-comments-open="true"]');
          if (openArt) openArt.removeAttribute('data-pm-comments-open');
        }
      }
    },

    ensureSpecialRoutesReady() {
      const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
      const wantsProfile = path === '/profile' || (window.location.search || '').includes('pm_goto_profile=1');
      if (!wantsProfile) return;
      const tryGoIgProfile = (attempt = 0) => {
        const ownUrl = resolveOwnProfileUrl();
        const navProf = findNavEl('/profile', 'profile');
        if (navProf) {
          navProf.click();
          return;
        }
        if (ownUrl) {
          window.location.replace(ownUrl);
          return;
        }
        if (attempt < 8) setTimeout(() => tryGoIgProfile(attempt + 1), 220);
      };
      tryGoIgProfile(0);
    },

    syncDarkDom(enableDark) {
      const docEl = document.documentElement;
      if (!docEl) return;
      if (enableDark) {
        if (!docEl.classList.contains('_aa4d')) {
          docEl.dataset.pmAddedIgDark = '1';
          docEl.classList.add('_aa4d');
        }
        if (docEl.getAttribute('data-theme') !== 'dark') docEl.setAttribute('data-theme', 'dark');
        try {
          if (window.localStorage.getItem('igt') !== 'dark') window.localStorage.setItem('igt', 'dark');
        } catch (_) {}
      } else if (docEl.dataset.pmAddedIgDark === '1') {
        delete docEl.dataset.pmAddedIgDark;
        docEl.classList.remove('_aa4d');
        docEl.removeAttribute('data-theme');
        try { window.localStorage.removeItem('igt'); } catch (_) {}
      }
    },

    getAppThemeCss() {
      return `
        :root, html, body, ._aa4d, [data-theme="dark"] {
          background-color: #000000 !important;
          color: #F8F9FA !important;
          --ig-primary-background: 0, 0, 0 !important;
          --ig-secondary-background: 12, 12, 16 !important;
          --ig-elevated-background: 20, 20, 26 !important;
          --ig-highlight-background: 28, 28, 36 !important;
          --ig-primary-text: 248, 249, 250 !important;
          --ig-secondary-text: 176, 180, 188 !important;
          --ig-tertiary-text: 132, 136, 146 !important;
          --ig-stroke: 38, 38, 48 !important;
          --ig-elevated-separator: 38, 38, 48 !important;
          --ig-separator: 38, 38, 48 !important;
        }
      `;
    },

    detectUnread() {
      const dmBadge = document.querySelector('a[href*="/direct/inbox"] span, [aria-label*="unread" i]');
      if (dmBadge) {
        const n = parseInt((dmBadge.textContent || '').trim(), 10);
        if (!isNaN(n) && n > 0) return { unreadCount: n, hasUnread: true };
      }
      return { unreadCount: 0, hasUnread: false };
    },

    isVisuallyPainted() {
      return Boolean(document.querySelector('main[role="main"], nav, [role="navigation"], article, form'));
    },

    resolveOwnProfileUrl,

    isRouteMatch(c, d, iconType) {
      if (c === d) return true;
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
      return false;
    },

    findNavEl
  };
}
