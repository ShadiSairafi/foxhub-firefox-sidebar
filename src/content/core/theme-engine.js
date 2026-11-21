/**
 * FoxHub Content Core — Theme Engine, 0ms Dark Boot & Smart-Invert Fallback
 */

let activeSocialThemeMode = 'native';
let activeSocialAccent = '#FF5C39';
let isSyncingPlatformDarkDom = false;
let genericInvertTimer = null;
let matchMediaHookInstalled = false;

export function detectPageFaviconUrl() {
  try {
    const links = Array.from(
      document.querySelectorAll('link[rel*="icon" i], link[rel*="apple-touch-icon" i], link[rel="mask-icon" i]')
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

export function getCookieVal(name) {
  try {
    const raw = document.cookie || '';
    const parts = raw.split(';');
    for (const p of parts) {
      const eq = p.indexOf('=');
      if (eq > 0 && p.slice(0, eq).trim() === name) {
        return p.slice(eq + 1).trim();
      }
    }
  } catch (_) {}
  return '';
}

function parseRgbComponents(str) {
  if (!str) return null;
  const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!m) return null;
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] !== undefined ? Number(m[4]) : 1
  };
}

function computeLuminance(rgb) {
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

export function syncPageMatchMediaDarkFlag(ctx, enableDark) {
  if (!ctx.isFoxHubContext || !window.wrappedJSObject || typeof exportFunction !== 'function') return;
  try {
    const pageWin = window.wrappedJSObject;
    pageWin.__pmForceDarkColorScheme = Boolean(enableDark);
    if (!matchMediaHookInstalled && typeof pageWin.matchMedia === 'function') {
      matchMediaHookInstalled = true;
      const origMatchMedia = pageWin.matchMedia.bind(pageWin);
      exportFunction(
        function (query) {
          const realMql = origMatchMedia(query);
          if (!pageWin.__pmForceDarkColorScheme || !realMql) return realMql;
          const q = String(query || '').toLowerCase();
          if (q.includes('prefers-color-scheme')) {
            const isDarkQuery = /prefers-color-scheme\s*:\s*dark/.test(q);
            const isLightQuery = /prefers-color-scheme\s*:\s*light/.test(q);
            if (isDarkQuery || isLightQuery) {
              try {
                Object.defineProperty(realMql, 'matches', {
                  get: exportFunction(
                    () => (pageWin.__pmForceDarkColorScheme ? isDarkQuery : origMatchMedia(query).matches),
                    pageWin
                  ),
                  configurable: true
                });
              } catch (_) {}
            }
          }
          return realMql;
        },
        pageWin,
        { defineAs: 'matchMedia' }
      );
    }
  } catch (_) {}
}

export function checkGenericLightPageAndSmartInvert(ctx, opt = null) {
  const docEl = document.documentElement;
  if (!docEl) return;
  const enableDark = activeSocialThemeMode === 'true-night' || activeSocialThemeMode === 'midnight-oled';
  const allowSmartInvert = Boolean(!ctx.isKnownBuiltInHost || (opt && opt.allowSmartInvert));
  if (!enableDark || !allowSmartInvert || (opt && opt.disableSmartInvert)) {
    if (docEl.hasAttribute('data-pm-smart-invert')) {
      docEl.removeAttribute('data-pm-smart-invert');
    }
    return;
  }
  try {
    const themeStyleEl = document.getElementById('pm-social-app-theme-css');
    if (themeStyleEl) themeStyleEl.disabled = true;
    const htmlBg = parseRgbComponents(window.getComputedStyle(docEl).backgroundColor);
    const bodyBg = document.body ? parseRgbComponents(window.getComputedStyle(document.body).backgroundColor) : null;
    if (themeStyleEl) themeStyleEl.disabled = false;
    const effective = bodyBg && bodyBg.a > 0.15 ? bodyBg : htmlBg && htmlBg.a > 0.15 ? htmlBg : null;
    if (!effective || computeLuminance(effective) > 0.52) {
      if (docEl.getAttribute('data-pm-smart-invert') !== '1') {
        docEl.setAttribute('data-pm-smart-invert', '1');
      }
    } else if (docEl.hasAttribute('data-pm-smart-invert')) {
      docEl.removeAttribute('data-pm-smart-invert');
    }
  } catch (_) {}
}

function stripWindowNameThemeHints(nextMode = 'native') {
  try {
    if (typeof window.name !== 'string' || !window.name) return;
    const parts = window.name.split(/(?=__pm(?:t|a|ua)=)/);
    const kept = parts.filter((p) => !p.startsWith('__pmt=') && !p.startsWith('__pma='));
    if (nextMode && nextMode !== 'native') {
      kept.splice(1, 0, `__pmt=${encodeURIComponent(nextMode)}`);
    }
    const nextName = kept.join('');
    if (nextName !== window.name) window.name = nextName;
  } catch (_) {}
}

export function syncPlatformDarkModeDom(ctx, enableDark, opt = null, syncMeta = null) {
  if (isSyncingPlatformDarkDom) return;
  const docEl = document.documentElement;
  if (!docEl) return;
  isSyncingPlatformDarkDom = true;
  syncPageMatchMediaDarkFlag(ctx, enableDark);
  try {
    if (opt && typeof opt.syncDarkDom === 'function') {
      opt.syncDarkDom(enableDark, ctx, {
        getCookieVal,
        isStorageReconcile: Boolean(syncMeta && syncMeta.isStorageReconcile)
      });
    } else if (ctx.hasHost('facebook.com')) {
      if (enableDark) {
        if (!docEl.classList.contains('__fb-dark-mode')) docEl.dataset.pmAddedFbDark = '1';
        if (docEl.classList.contains('__fb-light-mode')) {
          docEl.dataset.pmWasFbLight = '1';
          docEl.classList.remove('__fb-light-mode');
        }
        docEl.classList.add('__fb-dark-mode');
        if (document.body) {
          document.body.classList.remove('__fb-light-mode');
          document.body.classList.add('__fb-dark-mode');
        }
      } else if (docEl.dataset.pmAddedFbDark === '1') {
        delete docEl.dataset.pmAddedFbDark;
        docEl.classList.remove('__fb-dark-mode');
        if (document.body) document.body.classList.remove('__fb-dark-mode');
        if (docEl.dataset.pmWasFbLight === '1') {
          delete docEl.dataset.pmWasFbLight;
          docEl.classList.add('__fb-light-mode');
          if (document.body) document.body.classList.add('__fb-light-mode');
        }
      }
    } else if (!ctx.isKnownBuiltInHost) {
      if (enableDark) {
        if (!docEl.classList.contains('dark')) {
          docEl.dataset.pmAddedGenericDark = '1';
          docEl.classList.add('dark');
        }
        if (!docEl.hasAttribute('data-theme')) {
          docEl.dataset.pmAddedDataTheme = '1';
          docEl.setAttribute('data-theme', 'dark');
        }
        if (!docEl.hasAttribute('data-bs-theme')) {
          docEl.dataset.pmAddedBsTheme = '1';
          docEl.setAttribute('data-bs-theme', 'dark');
        }
        if (!docEl.hasAttribute('data-color-mode')) {
          docEl.dataset.pmAddedColorMode = '1';
          docEl.setAttribute('data-color-mode', 'dark');
        }
        clearTimeout(genericInvertTimer);
        genericInvertTimer = setTimeout(() => checkGenericLightPageAndSmartInvert(ctx, opt), 65);
        setTimeout(() => checkGenericLightPageAndSmartInvert(ctx, opt), 450);
      } else {
        if (docEl.hasAttribute('data-pm-smart-invert')) docEl.removeAttribute('data-pm-smart-invert');
        if (docEl.dataset.pmAddedGenericDark === '1') {
          delete docEl.dataset.pmAddedGenericDark;
          docEl.classList.remove('dark');
        }
        if (docEl.dataset.pmAddedDataTheme === '1') {
          delete docEl.dataset.pmAddedDataTheme;
          docEl.removeAttribute('data-theme');
        }
        if (docEl.dataset.pmAddedBsTheme === '1') {
          delete docEl.dataset.pmAddedBsTheme;
          docEl.removeAttribute('data-bs-theme');
        }
        if (docEl.dataset.pmAddedColorMode === '1') {
          delete docEl.dataset.pmAddedColorMode;
          docEl.removeAttribute('data-color-mode');
        }
      }
    }
    if (opt && opt.allowSmartInvert) {
      if (enableDark) {
        clearTimeout(genericInvertTimer);
        genericInvertTimer = setTimeout(() => checkGenericLightPageAndSmartInvert(ctx, opt), 65);
        setTimeout(() => checkGenericLightPageAndSmartInvert(ctx, opt), 450);
      } else if (docEl.hasAttribute('data-pm-smart-invert')) {
        docEl.removeAttribute('data-pm-smart-invert');
      }
    }
  } finally {
    Promise.resolve().then(() => {
      isSyncingPlatformDarkDom = false;
    });
  }
}

export function injectAppThemeCss(ctx, themeMode, accentColor, opt = null, syncMeta = null) {
  activeSocialThemeMode = themeMode || 'native';
  activeSocialAccent = accentColor || activeSocialAccent || '#FF5C39';
  if (ctx.isFoxHubContext) {
    try {
      window.sessionStorage.setItem('__pm_social_theme', activeSocialThemeMode);
      window.sessionStorage.setItem('__pm_social_accent', activeSocialAccent);
    } catch (_) {}
  }
  const isDarkOverride = activeSocialThemeMode === 'true-night' || activeSocialThemeMode === 'midnight-oled';
  syncPlatformDarkModeDom(ctx, isDarkOverride, opt, syncMeta);

  const root = document.head || document.documentElement;
  if (!root) return;
  let themeStyle = document.getElementById('pm-social-app-theme-css');
  if (!activeSocialThemeMode || activeSocialThemeMode === 'native') {
    if (themeStyle) themeStyle.remove();
    if (document.documentElement) {
      document.documentElement.removeAttribute('data-pm-social-theme');
      document.documentElement.removeAttribute('data-pm-smart-invert');
    }
    return;
  }
  if (!themeStyle) {
    themeStyle = document.createElement('style');
    themeStyle.id = 'pm-social-app-theme-css';
    root.appendChild(themeStyle);
  } else if (document.head && themeStyle.parentNode !== document.head) {
    document.head.appendChild(themeStyle);
  }
  ctx.ensureStylesheetOrder();

  if (document.documentElement && document.documentElement.getAttribute('data-pm-social-theme') !== activeSocialThemeMode) {
    document.documentElement.setAttribute('data-pm-social-theme', activeSocialThemeMode);
  }
  const accent = activeSocialAccent;
  let tCss = `
    /* FoxHub Social App Custom Theme Overlay (${activeSocialThemeMode}) */
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
  `;

  if (activeSocialThemeMode !== 'true-night') {
    tCss += `
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
  }

  if (activeSocialThemeMode === 'warm-glass') {
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
  } else if (activeSocialThemeMode === 'true-night' || activeSocialThemeMode === 'midnight-oled') {
    tCss += `
      :root, html {
        color-scheme: dark !important;
      }
    `;
    if (activeSocialThemeMode === 'midnight-oled') {
      tCss += `
        body::after {
          content: "";
          position: fixed;
          inset: 0;
          background: radial-gradient(circle at top left, rgba(108, 92, 231, 0.08), rgba(0, 206, 209, 0.03) 65%, transparent);
          pointer-events: none;
          z-index: 2147483645;
        }
      `;
    }

    const appDarkCss = opt && typeof opt.getAppThemeCss === 'function'
      ? opt.getAppThemeCss(activeSocialThemeMode, accent)
      : '';
    if (appDarkCss) {
      tCss += appDarkCss;
    } else if (ctx.hasHost('facebook.com')) {
      tCss += `
        html, body, .__fb-dark-mode {
          background-color: #000000 !important;
          color: #F5F6F8 !important;
          --surface-background: #000000 !important;
          --web-wash: #000000 !important;
          --card-background: #0E0E14 !important;
          --card-background-flat: #0E0E14 !important;
          --hosted-view-selected-state: rgba(255, 255, 255, 0.10) !important;
          --primary-text: #FFFFFF !important;
          --secondary-text: #B8BCC8 !important;
        }
      `;
    } else if (!ctx.isKnownBuiltInHost || (opt && opt.allowSmartInvert)) {
      tCss += `
        html[data-pm-smart-invert="1"] {
          filter: invert(0.93) hue-rotate(180deg) contrast(1.04) !important;
          background-color: #FFFFFF !important;
        }
        html[data-pm-smart-invert="1"] img,
        html[data-pm-smart-invert="1"] video,
        html[data-pm-smart-invert="1"] picture,
        html[data-pm-smart-invert="1"] canvas,
        html[data-pm-smart-invert="1"] [style*="background-image"] {
          filter: invert(1) hue-rotate(180deg) !important;
        }
        html:not([data-pm-smart-invert="1"]),
        html:not([data-pm-smart-invert="1"]) body {
          background-color: #000000 !important;
        }
      `;
    }
  } else if (activeSocialThemeMode === 'rose-twilight') {
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
  } else if (activeSocialThemeMode === 'match-theme') {
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

export function initThemeEngine(ctx, opt = null) {
  if (ctx.isFoxHubContext && !ctx.isSwBootstrap && ctx.initialSyncThemeMode && ctx.initialSyncThemeMode !== 'native') {
    injectAppThemeCss(ctx, ctx.initialSyncThemeMode, ctx.initialSyncAccent || '#FF5C39', opt);
  }

  if (ctx.isFoxHubContext && !ctx.isSwBootstrap && typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
    browser.storage.local
      .get('settings')
      .then((res) => {
        ctx.initialThemeResolved = true;
        const s = (res && res.settings) || {};
        const storedMode = s.socialAppThemeMode || 'native';
        if (storedMode !== activeSocialThemeMode) {
          stripWindowNameThemeHints(storedMode);
          injectAppThemeCss(ctx, storedMode, activeSocialAccent, opt, { isStorageReconcile: true });
        }
      })
      .catch(() => {
        ctx.initialThemeResolved = true;
      });

    if (browser.storage.onChanged) {
      browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.settings && changes.settings.newValue) {
          const nextMode = changes.settings.newValue.socialAppThemeMode || 'native';
          if (nextMode !== activeSocialThemeMode) {
            injectAppThemeCss(ctx, nextMode, activeSocialAccent, opt);
          }
        }
      });
    }

    const onDomReadyTheme = () => {
      ctx.ensureStylesheetOrder();
      if (activeSocialThemeMode && activeSocialThemeMode !== 'native') {
        injectAppThemeCss(ctx, activeSocialThemeMode, activeSocialAccent, opt);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onDomReadyTheme);
    } else {
      onDomReadyTheme();
    }

    if (typeof MutationObserver === 'function' && document.documentElement) {
      const darkHydrationObserver = new MutationObserver(() => {
        if (
          !isSyncingPlatformDarkDom &&
          (activeSocialThemeMode === 'true-night' || activeSocialThemeMode === 'midnight-oled')
        ) {
          syncPlatformDarkModeDom(ctx, true, opt);
          if (!document.getElementById('pm-social-app-theme-css')) {
            injectAppThemeCss(ctx, activeSocialThemeMode, activeSocialAccent, opt);
          }
        }
      });
      darkHydrationObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'dark', 'data-theme']
      });
    }
  }
}
