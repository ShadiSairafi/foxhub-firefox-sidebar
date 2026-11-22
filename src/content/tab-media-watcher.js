/**
 * FoxHub Tab Media Watcher & Frame Entry (document_start)
 */
(function () {
  const doc = document, on = addEventListener;
  const topW = window.top, isTop = topW === window.self, isChild = !isTop && window.parent === topW;
  const host = (location.hostname || '').toLowerCase(), path = location.pathname || '/';
  const has = (s) => host === s || host.endsWith('.' + s);
  const isAcct = !isTop && (host === 'ogs.google.com' || (host === 'accounts.google.com' && path.includes('/AccountChooser')));
  const isSbTop = isTop && (location.hash.includes('pm-sidebar') || window.name === 'pm-opera-sidebar');

  const rawN = typeof window.name === 'string' ? window.name : '', mi = rawN.search(/__pm(?:t|a|ua)=/), pmt = rawN.indexOf('__pmt=');
  const cleanN = mi >= 0 ? rawN.slice(0, mi) : rawN;
  const isBg = cleanN.startsWith('pm-bg-audio-');
  const isMedia = /^pm-(media-frame|bg-audio|bg-standby)-/.test(cleanN);
  const isGmail = cleanN.startsWith('pm-gmail-compose:') || cleanN === 'pm-gmail-autosend-frame';
  let isFH = isMedia || isSbTop || isGmail;
  try {
    if (isFH) sessionStorage.setItem('__pm_foxhub_frame', '1');
    else if (isChild && sessionStorage.getItem('__pm_foxhub_frame') === '1') isFH = true;
  } catch (_) {}

  // Normal tabs: passive tab-audio watcher only, exit immediately
  if (!isFH && !isAcct) {
    if (!isTop && !isChild) return;
    let lastAt = 0, stopT = null;
    const isEl = (e) => e?.tagName === 'VIDEO' || e?.tagName === 'AUDIO';
    const aud = (e) => Boolean(e && !e.paused && !e.ended && !e.muted && +e.volume > 0 && e.mozHasAudio !== false);
    const any = () => {
      try { for (const e of doc.querySelectorAll('video,audio')) if (aud(e)) return true; } catch (_) {}
      return false;
    };
    const send = (t) => { try { browser.runtime.sendMessage({ type: t }).catch(() => {}); } catch (_) {} };
    const onPlay = (ev) => {
      const e = ev?.target;
      if (!isEl(e) || !aud(e) || Date.now() - lastAt < 350) return;
      lastAt = Date.now(); clearTimeout(stopT); send('EXTERNAL_TAB_MEDIA_PLAYING');
    };
    const onStop = (ev) => {
      if (!isEl(ev?.target)) return;
      clearTimeout(stopT); stopT = setTimeout(() => !any() && send('EXTERNAL_TAB_MEDIA_STOPPED'), 220);
    };
    const o = { capture: true, passive: true };
    on('playing', onPlay, o);
    for (const t of ['pause', 'ended', 'emptied']) on(t, onStop, o);
    on('volumechange', (e) => isEl(e?.target) && (aud(e.target) ? onPlay : onStop)(e), o);
    on('timeupdate', (e) => Date.now() - lastAt >= 1800 && isEl(e?.target) && aud(e.target) && onPlay(e), o);
    try {
      browser.runtime.onMessage.addListener((m) =>
        m?.type === 'CHECK_TAB_HAS_ACTIVE_MEDIA' && any() ? Promise.resolve({ hasActiveMedia: true }) : undefined
      );
    } catch (_) {}
    return;
  }

  if (/(^|\.)(hcaptcha\.com|cloudflare\.com|recaptcha\.net|arkoselabs\.com|funcaptcha\.com)$/.test(host) ||
    (has('google.com') && path.includes('/recaptcha'))) return;

  const u = (p) => browser.runtime.getURL('src/content/' + p);
  const boot = (p) => Promise.all([p, import(browser.runtime.getURL('src/content/core/frame-bootstrap.js'))])
    .then(([, m]) => m?.bootstrapFoxHubFrame?.()).catch(() => {});
  if (!isFH && isAcct) return boot(null);

  const isBoot = location.search.includes('pm_boot=1');
  let tm = pmt >= 0 ? rawN.slice(pmt + 6).split(/__pm(?:a|ua)=/)[0] : '';
  try { if (!tm) tm = sessionStorage.getItem('__pm_social_theme') || ''; } catch (_) {}
  const isDark = tm === 'true-night' || tm === 'midnight-oled';
  const isMir = ['spotify.com', 'youtube.com', 'youtu.be'].some(has);
  const mirP = isMir && !isTop && !isBoot ? import(browser.runtime.getURL('src/content/core/media-mirror.js')).catch(() => null) : null;
  const de = doc.documentElement;

  if (isBoot) {
    if (de) { de.style.background = isDark ? '#000' : '#141110'; de.style.visibility = 'hidden'; }
    return boot(null);
  }
  if (isDark && de) { de.style.backgroundColor = '#000'; de.style.colorScheme = 'dark'; }

  const pw = window.wrappedJSObject, canExp = Boolean(pw && typeof exportFunction === 'function');
  const defG = (o, k, f) => Object.defineProperty(o, k, { get: exportFunction(f, pw), configurable: true });

  if (isBg || (isMedia && (isMir || has('soundcloud.com') || has('music.apple.com')))) {
    try {
      const dp = canExp && pw.Document?.prototype;
      if (dp) {
        defG(dp, 'visibilityState', () => 'visible');
        defG(dp, 'hidden', () => false);
        Object.defineProperty(dp, 'hasFocus', { value: exportFunction(() => true, pw), writable: true, configurable: true });
      }
      const stop = (e) => e.stopImmediatePropagation();
      on('visibilitychange', stop, true);
      on('freeze', stop, true);
      on('blur', (e) => (!e.target || e.target === window || e.target === doc) && stop(e), true);
    } catch (_) {}
  }

  if ((has('tiktok.com') || has('instagram.com')) && !isTop && canExp) {
    try {
      const bad = (m) => /hev1|hvc1|hevc|bytevc|bvc1/i.test(String(m || ''));
      const ms = pw.MediaSource, hm = pw.HTMLMediaElement?.prototype;
      if (ms?.isTypeSupported) {
        const o = ms.isTypeSupported.bind(ms);
        exportFunction((m) => !bad(m) && o(m), ms, { defineAs: 'isTypeSupported' });
      }
      if (hm) {
        const o = hm.canPlayType;
        exportFunction(function (m) { return bad(m) ? '' : o.call(this, m); }, hm, { defineAs: 'canPlayType' });
      }
      if (has('tiktok.com')) Object.keys(localStorage).forEach((k) => /hevc|bvc|bytevc|codec/i.test(k) && localStorage.removeItem(k));
    } catch (_) {}
  }

  const RULES = (
    'music.youtube.com=yt-music,youtube.com,youtu.be=youtube,instagram.com,whatsapp.com,whatsapp.net=whatsapp,' +
    'discord.com,discordapp.com=discord,telegram.org,spotify.com,reddit.com,tiktok.com,x.com,twitter.com=x,' +
    'messenger.com,twitch.tv,chatgpt.com,openai.com=chatgpt,gemini.google.com,claude.ai,anthropic.com=claude,' +
    'perplexity.ai,soundcloud.com,sndcdn.com=soundcloud,music.apple.com=apple-music,bsky.app=bluesky,' +
    'bsky.social=bluesky,notion.so,notion.site=notion,calendar.google.com=google-calendar,' +
    'keep.google.com=google-keep,facebook.com=,google.com='
  ).split(',');
  let cssSlug = 'custom', builtIn = false;
  for (const r of RULES) {
    const [s, sl] = r.split('=');
    if (has(s)) { cssSlug = sl ?? s.split('.')[0]; builtIn = true; break; }
  }

  const isTg = has('telegram.org');
  if (isTg) {
    try {
      const f = JSON.parse(localStorage.getItem('experimental_flags') || '[]'), a = Array.isArray(f) ? f : [];
      for (const x of ['noSharedWorker', 'noServiceWorker']) if (!a.includes(x)) a.push(x);
      localStorage.setItem('experimental_flags', JSON.stringify(a));
    } catch (_) {}
  }
  if (!builtIn || isTg || ['youtube.com', 'whatsapp.com', 'x.com', 'twitter.com'].some(has)) {
    try {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.register = () => (isTg ? Promise.reject(new Error('SW disabled')) : Promise.resolve({}));
        if (isTg && canExp && pw.navigator?.serviceWorker) {
          pw.navigator.serviceWorker.register = exportFunction(() => pw.Promise.reject(new pw.Error('SW disabled')), pw);
        }
      }
    } catch (_) {}
  }
  if (!builtIn && canExp) {
    try { defG(pw, 'top', () => pw); defG(pw, 'parent', () => pw); defG(pw, 'frameElement', () => null); } catch (_) {}
  }

  const addCss = () => {
    const r = doc.head || doc.documentElement;
    if (!r) return false;
    const mk = (id, p) => {
      if (doc.getElementById(id)) return;
      const l = doc.createElement('link');
      l.id = id; l.rel = 'stylesheet'; l.href = u(p);
      r.appendChild(l);
    };
    mk('pm-frame-base-css', 'css/base.css');
    if (cssSlug) mk('pm-frame-app-css', `css/${cssSlug}.css`);
    return true;
  };
  if (!addCss()) {
    const o = new MutationObserver(() => addCss() && o.disconnect());
    o.observe(doc, { childList: true });
  }

  boot(mirP);
})();
