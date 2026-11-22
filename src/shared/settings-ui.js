/**
 * FoxHub — Unified Fluent Settings Engine
 * Single shared component mounted in both the sidebar settings drawer (#pm-settings-mount)
 * and the full-page Options studio (#opt-settings-mount).
 * Zero innerHTML / outerHTML / insertAdjacentHTML / eval / inline handlers.
 */

(function (global) {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const CATEGORIES = [
    { id: 'mail', label: 'Mail & Accounts', shortLabel: 'Mail', icon: 'mail' },
    { id: 'appearance', label: 'Appearance & Themes', shortLabel: 'Themes', icon: 'palette' },
    { id: 'apps', label: 'Apps & Websites', shortLabel: 'Apps', icon: 'grid' },
    { id: 'audio', label: 'Audio & Playback', shortLabel: 'Audio', icon: 'headphones' },
    { id: 'navigation', label: 'Shortcuts & Nav', shortLabel: 'Keys', icon: 'keyboard' },
    { id: 'backup', label: 'Backup & Tools', shortLabel: 'Backup', icon: 'shield' }
  ];

  const USERCHROME_PRESETS = [
    {
      id: 'hide-header',
      title: 'Hide Sidebar Header',
      description: 'Hides Firefox\'s built-in sidebar title bar above FoxHub for edge-to-edge height.',
      css:
        '/* Optional FoxHub userChrome.css — Hide Sidebar Header */\n' +
        '#sidebar-box[sidebarcommand$="_workspace_local-sidebar-action"] #sidebar-header,\n' +
        '#sidebar-box[sidebarcommand*="sidebar-action"] #sidebar-header {\n' +
        '  display: none !important;\n' +
        '}'
    },
    {
      id: 'hover-expand',
      title: 'Hover-to-Expand Floating Drawer',
      description: 'Collapses the sidebar to the 48px FoxHub rail when idle and expands smoothly on hover.',
      css:
        '/* Optional FoxHub userChrome.css — Hover-to-Expand Drawer */\n' +
        '#sidebar-box[sidebarcommand$="_workspace_local-sidebar-action"] {\n' +
        '  min-width: 48px !important;\n' +
        '  width: 48px !important;\n' +
        '  transition: min-width 180ms ease, width 180ms ease !important;\n' +
        '}\n' +
        '#sidebar-box[sidebarcommand$="_workspace_local-sidebar-action"]:hover {\n' +
        '  min-width: 400px !important;\n' +
        '  width: 400px !important;\n' +
        '}'
    },
    {
      id: 'rounded-sidebar',
      title: 'Rounded Floating Sidebar',
      description: 'Adds soft rounded corners, subtle margin, and depth shadow around the sidebar panel.',
      css:
        '/* Optional FoxHub userChrome.css — Rounded Sidebar */\n' +
        '#sidebar-box[sidebarcommand$="_workspace_local-sidebar-action"] {\n' +
        '  margin: 6px !important;\n' +
        '  border-radius: 12px !important;\n' +
        '  overflow: hidden !important;\n' +
        '  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22) !important;\n' +
        '}'
    }
  ];

  const SILENT_DEFAULT_APP_IDS = new Set([
    'spotify',
    'youtube',
    'soundcloud',
    'apple-music',
    'tiktok',
    'twitch',
    'chatgpt',
    'gemini',
    'claude',
    'perplexity'
  ]);

  let globalActiveRecorderCleanup = null;
  let globalActiveRecorderBtn = null;

  function isRecording() {
    if (typeof globalActiveRecorderCleanup !== 'function') return false;
    if (!globalActiveRecorderBtn || !globalActiveRecorderBtn.isConnected) {
      cancelGlobalRecorder();
      return false;
    }
    return true;
  }

  function cancelGlobalRecorder() {
    if (typeof globalActiveRecorderCleanup === 'function') {
      try {
        globalActiveRecorderCleanup();
      } catch (_) {}
      globalActiveRecorderCleanup = null;
    }
    globalActiveRecorderBtn = null;
  }

  function createSvg(iconKey, size = 14) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.1');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const el = (tag, attrs) => {
      const n = document.createElementNS(SVG_NS, tag);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
      return n;
    };

    switch (iconKey) {
      case 'mail':
        svg.appendChild(el('rect', { x: 2, y: 4, width: 20, height: 16, rx: 3 }));
        svg.appendChild(el('polyline', { points: '22,6 12,13 2,6' }));
        break;
      case 'palette':
        svg.appendChild(el('circle', { cx: 13.5, cy: 6.5, r: 0.8, fill: 'currentColor' }));
        svg.appendChild(el('circle', { cx: 17.5, cy: 10.5, r: 0.8, fill: 'currentColor' }));
        svg.appendChild(el('circle', { cx: 8.5, cy: 7.5, r: 0.8, fill: 'currentColor' }));
        svg.appendChild(el('path', { d: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.12a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.55C21.97 6.01 17.46 2 12 2z' }));
        break;
      case 'grid':
        svg.appendChild(el('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1.5 }));
        svg.appendChild(el('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1.5 }));
        svg.appendChild(el('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1.5 }));
        svg.appendChild(el('rect', { x: 14, y: 14, width: 7, height: 7, rx: 1.5 }));
        break;
      case 'headphones':
        svg.appendChild(el('path', { d: 'M3 18v-6a9 9 0 0 1 18 0v6' }));
        svg.appendChild(el('path', { d: 'M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z' }));
        break;
      case 'keyboard':
        svg.appendChild(el('rect', { x: 2, y: 4, width: 20, height: 16, rx: 2 }));
        svg.appendChild(el('path', { d: 'M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10' }));
        break;
      case 'shield':
        svg.appendChild(el('path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }));
        break;
      case 'search':
        svg.appendChild(el('circle', { cx: 11, cy: 11, r: 8 }));
        svg.appendChild(el('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }));
        break;
      case 'close':
        svg.appendChild(el('line', { x1: 18, y1: 6, x2: 6, y2: 18 }));
        svg.appendChild(el('line', { x1: 6, y1: 6, x2: 18, y2: 18 }));
        break;
      case 'chevron-down':
        svg.appendChild(el('polyline', { points: '6 9 12 15 18 9' }));
        break;
      case 'copy':
        svg.appendChild(el('rect', { x: 9, y: 9, width: 13, height: 13, rx: 2 }));
        svg.appendChild(el('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }));
        break;
      case 'play':
        svg.appendChild(el('polygon', { points: '5 3 19 12 5 21 5 3', fill: 'currentColor' }));
        break;
      default:
        svg.appendChild(el('circle', { cx: 12, cy: 12, r: 9 }));
        break;
    }
    return svg;
  }

  function getApis() {
    return {
      schema: global.FoxHubSettingsSchema || global.PocketMailSettingsSchema || null,
      media: global.FoxHubMediaApps || global.PocketMailMediaApps || null,
      themes: global.FoxHubThemes || global.PocketMailThemes || null,
      sound: global.FoxHubSound || global.PocketMailSound || null,
      icons: global.FoxHubSenderIcons || global.PocketMailSenderIcons || null
    };
  }

  function isSafeCustomIconRef(val) {
    if (val === '' || val === null || val === undefined) return true;
    if (typeof val !== 'string') return false;
    const trimmed = val.trim();
    if (!trimmed) return true;
    if (trimmed.length > 8 * 1024 * 1024) return false;
    const apis = getApis();
    if (apis.schema && typeof apis.schema.isSafeImageRef === 'function') {
      return apis.schema.isSafeImageRef(trimmed);
    }
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) return true;
    if (/^data:image\/svg\+xml[;,]/i.test(trimmed)) return true;
    if (trimmed.length > 2048) return false;
    try {
      const u = new URL(trimmed);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  let toggleLabelSeq = 0;

  function makeToggleSwitch(checked, onChange, ariaOpts) {
    const label = document.createElement('label');
    label.className = 'fh-switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(checked);
    if (typeof ariaOpts === 'string') {
      if (ariaOpts) input.setAttribute('aria-label', ariaOpts);
    } else if (ariaOpts && typeof ariaOpts === 'object') {
      if (ariaOpts.labelledBy) input.setAttribute('aria-labelledby', ariaOpts.labelledBy);
      else if (ariaOpts.ariaLabel) input.setAttribute('aria-label', ariaOpts.ariaLabel);
      if (ariaOpts.settingKey) input.setAttribute('data-setting-key', ariaOpts.settingKey);
    }
    input.addEventListener('change', () => onChange(Boolean(input.checked), input));
    const track = document.createElement('span');
    track.className = 'fh-switch-track';
    track.setAttribute('aria-hidden', 'true');
    label.appendChild(input);
    label.appendChild(track);
    return { wrap: label, input };
  }

  function setHighlightedText(el, plainText, tokens) {
    if (!el) return;
    const text = String(plainText || '');
    if (!tokens || tokens.length === 0) {
      el.textContent = text;
      return;
    }
    const lower = text.toLowerCase();
    const ranges = [];
    tokens.forEach((tok) => {
      if (!tok) return;
      let idx = lower.indexOf(tok);
      while (idx !== -1) {
        ranges.push([idx, idx + tok.length]);
        idx = lower.indexOf(tok, idx + tok.length);
      }
    });
    if (ranges.length === 0) {
      el.textContent = text;
      return;
    }
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [ranges[0]];
    for (let i = 1; i < ranges.length; i++) {
      const prev = merged[merged.length - 1];
      if (ranges[i][0] <= prev[1]) {
        prev[1] = Math.max(prev[1], ranges[i][1]);
      } else {
        merged.push(ranges[i]);
      }
    }
    const frag = document.createDocumentFragment();
    let cursor = 0;
    merged.forEach(([start, end]) => {
      if (start > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, start)));
      }
      const mark = document.createElement('mark');
      mark.className = 'fh-mark';
      mark.textContent = text.slice(start, end);
      frag.appendChild(mark);
      cursor = end;
    });
    if (cursor < text.length) {
      frag.appendChild(document.createTextNode(text.slice(cursor)));
    }
    el.replaceChildren(frag);
  }

  function copyTextToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }

  function formatMuteTimerRemaining(untilTs) {
    const diffMs = Math.max(0, Number(untilTs || 0) - Date.now());
    if (diffMs <= 0) return '';
    const totalMins = Math.max(1, Math.ceil(diffMs / 60000));
    if (totalMins < 60) return `${totalMins}m left`;
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return m > 0 ? `${h}h ${m}m left` : `${h}h left`;
  }

  function mount(containerEl, options = {}) {
    if (!containerEl) {
      throw new Error('FoxHubSettingsUI.mount requires a container element');
    }

    const mode = options.mode === 'options' ? 'options' : 'drawer';
    let activeCategory = CATEGORIES.some((c) => c.id === options.initialCategory)
      ? options.initialCategory
      : 'mail';
    let searchQuery = '';
    let liveAudioLogVisible = false;
    let liveAudioLogTimer = null;
    let muteTimerTick = null;
    let diagLogPanelRef = null;
    let renderLiveAudioLogRef = null;
    let destroyed = false;
    let statusBannerState = null; // { kind: 'ok'|'err', text: string }

    const getSettings = () => {
      const apis = getApis();
      const raw = typeof options.getSettings === 'function' ? options.getSettings() : {};
      const hasRawKeys = Boolean(
        raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length > 0
      );
      return apis.schema
        ? apis.schema.normalizeSettings(raw, { skipLegacyMigrations: hasRawKeys })
        : { ...(raw || {}) };
    };
    const getState = () => (typeof options.getState === 'function' ? options.getState() : { accounts: [] }) || { accounts: [] };
    const notifyToast = (msg) => {
      if (msg && typeof options.onToast === 'function') options.onToast(msg);
    };
    const savePatch = async (patch, toastMsg) => {
      if (typeof options.onSavePatch === 'function') {
        return await options.onSavePatch(patch, toastMsg);
      }
      try {
        const res = await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: patch });
        if (!res || res.ok === false) {
          notifyToast('Could not persist settings: ' + ((res && res.error) || 'background rejected update'));
          return res || { ok: false };
        }
        if (toastMsg) notifyToast(toastMsg);
        return res;
      } catch (err) {
        notifyToast('Could not persist settings: ' + ((err && err.message) || 'unknown error'));
        return { ok: false, error: err && err.message };
      }
    };

    const root = document.createElement('div');
    root.className = 'fh-settings-root';
    root.setAttribute('data-fh-mode', mode);

    // Header: Search + Category Nav
    const header = document.createElement('div');
    header.className = 'fh-settings-header';

    const searchBox = document.createElement('div');
    searchBox.className = 'fh-search-box';
    const searchIconSpan = document.createElement('span');
    searchIconSpan.className = 'fh-search-icon';
    searchIconSpan.appendChild(createSvg('search', 14));
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'fh-search-input';
    searchInput.placeholder = 'Search settings, shortcuts, apps, backup…';
    searchInput.setAttribute('aria-label', 'Search settings');
    const searchCount = document.createElement('span');
    searchCount.className = 'fh-search-count hidden';
    const searchClearBtn = document.createElement('button');
    searchClearBtn.type = 'button';
    searchClearBtn.className = 'fh-search-clear hidden';
    searchClearBtn.title = 'Clear search';
    searchClearBtn.setAttribute('aria-label', 'Clear search');
    searchClearBtn.appendChild(createSvg('close', 11));

    searchBox.appendChild(searchIconSpan);
    searchBox.appendChild(searchInput);
    searchBox.appendChild(searchCount);
    searchBox.appendChild(searchClearBtn);

    const catNav = document.createElement('div');
    catNav.className = 'fh-cat-nav';
    catNav.setAttribute('role', 'tablist');
    const catPillEls = new Map();

    CATEGORIES.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `fh-cat-pill ${cat.id === activeCategory ? 'active' : ''}`;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('data-fh-cat', cat.id);
      btn.setAttribute('aria-selected', cat.id === activeCategory ? 'true' : 'false');
      const iconWrap = document.createElement('span');
      iconWrap.className = 'fh-cat-pill-icon';
      iconWrap.appendChild(createSvg(cat.icon, 13));
      const lbl = document.createElement('span');
      lbl.className = 'fh-cat-pill-label';
      lbl.textContent = mode === 'drawer' ? cat.shortLabel : cat.label;
      const badge = document.createElement('span');
      badge.className = 'fh-cat-badge hidden';
      btn.appendChild(iconWrap);
      btn.appendChild(lbl);
      btn.appendChild(badge);
      btn.addEventListener('click', () => {
        setCategory(cat.id);
      });
      catNav.appendChild(btn);
      catPillEls.set(cat.id, { btn, badge });
    });

    header.appendChild(searchBox);
    header.appendChild(catNav);

    const itemsStack = document.createElement('div');
    itemsStack.className = 'fh-items-stack';

    const emptyState = document.createElement('div');
    emptyState.className = 'fh-empty-state fh-settings-empty hidden';
    emptyState.setAttribute('data-settings-empty', '1');
    const emptyIcon = document.createElement('div');
    emptyIcon.style.color = 'var(--text-muted)';
    emptyIcon.appendChild(createSvg('search', 24));
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = 'font-weight:700;font-size:13px;';
    const emptySub = document.createElement('div');
    emptySub.className = 'fh-card-desc';
    emptySub.textContent = 'Try another keyword like "spotify", "theme", "shortcut", "now playing", or "backup".';
    const emptyClearBtn = document.createElement('button');
    emptyClearBtn.type = 'button';
    emptyClearBtn.className = 'fh-btn fh-btn-primary fh-btn-xs';
    emptyClearBtn.textContent = 'Clear Search';
    emptyClearBtn.addEventListener('click', () => setSearchQuery(''));
    emptyState.appendChild(emptyIcon);
    emptyState.appendChild(emptyMsg);
    emptyState.appendChild(emptySub);
    emptyState.appendChild(emptyClearBtn);

    root.appendChild(header);
    root.appendChild(itemsStack);
    root.appendChild(emptyState);
    containerEl.replaceChildren(root);

    const itemRegistry = []; // { el, category, keywords, titleEl, plainTitle, isDiag }
    const groupHeaders = new Map(); // catId -> headerEl

    function registerItem(catId, titleText, keywords, bodyBuilder, opts = {}) {
      const card = document.createElement(opts.tag || 'div');
      card.className = opts.className || 'fh-card';
      card.setAttribute('data-fh-setting-item', '1');
      card.setAttribute('data-setting-item', '1');
      card.setAttribute('data-fh-category', catId);
      const kw = `${titleText} ${keywords || ''} ${catId}`.toLowerCase();
      card.setAttribute('data-fh-keywords', kw);

      let titleEl = null;
      if (titleText && !opts.omitDefaultHeader) {
        const head = document.createElement('div');
        head.className = 'fh-card-head';
        const titleWrap = document.createElement('div');
        titleWrap.className = 'fh-card-title';
        if (opts.icon) titleWrap.appendChild(createSvg(opts.icon, 15));
        titleEl = document.createElement('span');
        titleEl.className = 'fh-item-title-text';
        titleEl.textContent = titleText;
        titleWrap.appendChild(titleEl);
        head.appendChild(titleWrap);
        if (opts.badgeText) {
          const b = document.createElement('span');
          b.className = `fh-badge-pill ${opts.badgeClass || ''}`.trim();
          b.textContent = opts.badgeText;
          head.appendChild(b);
        }
        card.appendChild(head);
      }

      bodyBuilder(card, (customTitleEl) => {
        titleEl = customTitleEl;
      });

      const entry = {
        el: card,
        category: catId,
        keywords: kw,
        titleEl,
        plainTitle: titleText,
        isDiag: Boolean(opts.isDiag)
      };
      itemRegistry.push(entry);
      return card;
    }

    // Unified Shortcut Recorder
    function bindShortcutButton(btn, scope, key, displayName) {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (btn.classList.contains('is-recording')) {
          cancelGlobalRecorder();
          syncAllSections();
          return;
        }
        cancelGlobalRecorder();
        const apis = getApis();
        const schema = apis.schema;
        const origText = btn.textContent;
        btn.classList.add('is-recording');
        btn.textContent = 'Press keys…';

        const cleanup = () => {
          btn.classList.remove('is-recording');
          window.removeEventListener('keydown', onKeyDown, true);
          document.removeEventListener('mousedown', onOutsideDown, true);
          if (globalActiveRecorderCleanup === cleanup) {
            globalActiveRecorderCleanup = null;
            globalActiveRecorderBtn = null;
          }
        };

        const onOutsideDown = (me) => {
          if (me.target !== btn && !btn.contains(me.target)) {
            cleanup();
            btn.textContent = origText;
          }
        };

        const onKeyDown = async (ke) => {
          if (!btn.isConnected) {
            cleanup();
            return;
          }
          ke.preventDefault();
          ke.stopPropagation();
          ke.stopImmediatePropagation();
          const parsed = schema && typeof schema.formatShortcutFromKeyEvent === 'function'
            ? schema.formatShortcutFromKeyEvent(ke)
            : null;
          if (!parsed) return;
          if (parsed.action === 'cancel') {
            cleanup();
            btn.textContent = origText;
            return;
          }
          if (parsed.action === 'invalid') {
            notifyToast(parsed.message);
            return;
          }
          cleanup();

          const cur = getSettings();
          const nextGlobal = { ...(cur.globalShortcuts || {}) };
          const nextApps = { ...(cur.appShortcuts || {}) };
          let nextQuickSwitcher = cur.quickSwitcherShortcut || 'Ctrl+K';

          if (parsed.action === 'clear') {
            if (scope === 'global') {
              nextGlobal[key] = '';
            } else if (scope === 'app') {
              delete nextApps[key];
            } else if (scope === 'quickSwitcher') {
              nextQuickSwitcher = 'Ctrl+K';
            }
            await applyShortcutUpdate(nextGlobal, nextApps, cur.appShortcutOpenMode, cur.quickSwitcherEnabled, nextQuickSwitcher,
              scope === 'quickSwitcher' ? 'Reset Quick Switcher shortcut to Ctrl+K' : `Cleared shortcut for ${displayName}`,
              { isShortcutBinding: true });
            return;
          }

          const combo = parsed.shortcut;
          const conflicts = schema && typeof schema.findShortcutConflicts === 'function'
            ? schema.findShortcutConflicts(combo, {
                globalShortcuts: nextGlobal,
                appShortcuts: nextApps,
                quickSwitcherShortcut: nextQuickSwitcher
              }, { scope, key })
            : [];

          conflicts.forEach((c) => {
            if (c.scope === 'global') nextGlobal[c.key] = '';
            else if (c.scope === 'app') delete nextApps[c.key];
          });

          if (scope === 'global') nextGlobal[key] = combo;
          else if (scope === 'app') nextApps[key] = combo;
          else if (scope === 'quickSwitcher') nextQuickSwitcher = combo;

          await applyShortcutUpdate(
            nextGlobal,
            nextApps,
            cur.appShortcutOpenMode,
            cur.quickSwitcherEnabled,
            nextQuickSwitcher,
            `${displayName} shortcut set to ${combo}`,
            { isShortcutBinding: true }
          );
        };

        globalActiveRecorderBtn = btn;
        globalActiveRecorderCleanup = cleanup;
        window.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('mousedown', onOutsideDown, true);
      });
    }

    async function applyShortcutUpdate(nextGlobal, nextApps, nextOpenMode, quickSwitcherEnabled, quickSwitcherShortcut, toastMsg, updateOpts = {}) {
      try {
        const res = await browser.runtime.sendMessage({
          type: 'UPDATE_KEYBOARD_SHORTCUTS',
          globalShortcuts: nextGlobal,
          appShortcuts: nextApps,
          appShortcutOpenMode: nextOpenMode || 'sidebar',
          quickSwitcherEnabled: quickSwitcherEnabled !== false,
          quickSwitcherShortcut: quickSwitcherShortcut || 'Ctrl+K'
        });
        const failed = !res || res.ok === false;
        if (!failed && res && res.settings && typeof options.onStateReplace === 'function') {
          options.onStateReplace({ settings: res.settings, state: getState() });
        } else if (failed && res && res.settings && updateOpts.isShortcutBinding && typeof options.onStateReplace === 'function') {
          options.onStateReplace({ settings: res.settings, state: getState() });
        }
        if (!failed && typeof options.onBroadcastAppConfig === 'function') {
          options.onBroadcastAppConfig('muteAndShortcuts');
        }
        syncAllSections({ force: failed });
        if (failed) {
          const errStr = String((res && res.error) || '');
          const isShortcutErr = Boolean(res && updateOpts.isShortcutBinding) && (
            !errStr || /reserved|invalid|shortcut|command|already|taken|bound/i.test(errStr)
          );
          if (isShortcutErr) {
            notifyToast('Browser reserved shortcut — try Alt+Shift+Key');
          } else {
            notifyToast('Could not persist settings: ' + (errStr || 'background rejected update'));
          }
        } else if (toastMsg) {
          notifyToast(toastMsg);
        }
      } catch (err) {
        syncAllSections({ force: true });
        notifyToast('Could not persist settings: ' + ((err && err.message) || 'unknown error'));
      }
    }

    // =========================================================================
    // Custom App Pro Edit Modal (Name, URL, Color, Icon URL/Upload, UA Mode)
    // =========================================================================
    function openCustomAppEditModal(targetAppId) {
      const apis = getApis();
      const s = getSettings();
      const customs = Array.isArray(s.customMediaApps) ? [...s.customMediaApps] : [];
      const customIdx = customs.findIndex((c, i) => (c.id || `custom-${i}`) === targetAppId);
      const existing = customIdx >= 0 ? customs[customIdx] : null;
      if (!existing) return;
      const stableId = existing.id || targetAppId;

      document.getElementById('pm-custom-app-edit-modal')?.remove();

      const backdrop = document.createElement('div');
      backdrop.id = 'pm-custom-app-edit-modal';
      backdrop.className = 'fh-modal-backdrop';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.setAttribute('aria-label', `Edit ${existing.name || 'Custom App'}`);

      const modal = document.createElement('div');
      modal.className = 'fh-modal';

      const head = document.createElement('div');
      head.className = 'fh-modal-head';
      const title = document.createElement('div');
      title.className = 'fh-modal-title';
      title.textContent = `Edit Custom Website: ${existing.name || 'Custom App'}`;
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'fh-btn fh-btn-xs';
      closeBtn.setAttribute('aria-label', 'Close modal');
      closeBtn.appendChild(createSvg('close', 13));
      head.appendChild(title);
      head.appendChild(closeBtn);
      modal.appendChild(head);

      let draftName = existing.name || '';
      let draftUrl = existing.url || '';
      let draftColor = existing.color || '#C85A32';
      let draftIconUrl = existing.iconUrl || '';
      let draftUa = existing.userAgentMode || 'default';

      // Name
      const fName = document.createElement('div');
      fName.className = 'fh-modal-field';
      const lName = document.createElement('label');
      lName.textContent = 'App Name';
      const iName = document.createElement('input');
      iName.type = 'text';
      iName.className = 'fh-input';
      iName.maxLength = 60;
      iName.value = draftName;
      iName.addEventListener('input', () => { draftName = iName.value; });
      fName.appendChild(lName);
      fName.appendChild(iName);
      modal.appendChild(fName);

      // URL
      const fUrl = document.createElement('div');
      fUrl.className = 'fh-modal-field';
      const lUrl = document.createElement('label');
      lUrl.textContent = 'Website URL (https://)';
      const iUrl = document.createElement('input');
      iUrl.type = 'url';
      iUrl.className = 'fh-input';
      iUrl.value = draftUrl;
      iUrl.addEventListener('input', () => { draftUrl = iUrl.value; });
      fUrl.appendChild(lUrl);
      fUrl.appendChild(iUrl);
      modal.appendChild(fUrl);

      // Color + Icon Preview
      const fColor = document.createElement('div');
      fColor.className = 'fh-modal-field';
      const lColor = document.createElement('label');
      lColor.textContent = 'Brand Accent Color & Icon';
      const colorRow = document.createElement('div');
      colorRow.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;';

      const iconPreview = document.createElement('div');
      iconPreview.className = 'fh-app-icon-box';
      iconPreview.style.cssText = `width:32px;height:32px;border-radius:8px;background:${draftColor};overflow:hidden;`;
      const refreshIconPreview = () => {
        iconPreview.style.background = draftColor;
        if (draftIconUrl && isSafeCustomIconRef(draftIconUrl)) {
          const img = document.createElement('img');
          img.src = draftIconUrl;
          img.alt = '';
          img.style.cssText = 'width:24px;height:24px;object-fit:contain;border-radius:4px;';
          img.addEventListener('error', () => {
            if (apis.media) iconPreview.replaceChildren(apis.media.createAppSvgIcon('__fallback_globe__', 16));
          });
          iconPreview.replaceChildren(img);
        } else if (apis.media) {
          iconPreview.replaceChildren(apis.media.createAppSvgIcon('__fallback_globe__', 16));
        }
      };
      refreshIconPreview();

      const iColor = document.createElement('input');
      iColor.type = 'color';
      iColor.value = draftColor;
      iColor.style.cssText = 'width:38px;height:32px;border:none;background:none;cursor:pointer;padding:0;';
      const hexSpan = document.createElement('span');
      hexSpan.style.cssText = 'font-family:monospace;font-size:11.5px;font-weight:700;';
      hexSpan.textContent = draftColor.toUpperCase();
      iColor.addEventListener('input', () => {
        draftColor = iColor.value;
        hexSpan.textContent = draftColor.toUpperCase();
        refreshIconPreview();
      });

      colorRow.appendChild(iconPreview);
      colorRow.appendChild(iColor);
      colorRow.appendChild(hexSpan);
      fColor.appendChild(lColor);
      fColor.appendChild(colorRow);
      modal.appendChild(fColor);

      // Icon URL + Upload + Auto-Fetch + Reset
      const fIcon = document.createElement('div');
      fIcon.className = 'fh-modal-field';
      const lIcon = document.createElement('label');
      lIcon.textContent = 'Custom Icon URL or Upload';
      const iIconUrl = document.createElement('input');
      iIconUrl.type = 'url';
      iIconUrl.className = 'fh-input';
      iIconUrl.placeholder = 'https://example.com/icon.png (optional)';
      iIconUrl.value = draftIconUrl;
      iIconUrl.addEventListener('input', () => {
        draftIconUrl = iIconUrl.value.trim();
        refreshIconPreview();
      });

      const iconBtnRow = document.createElement('div');
      iconBtnRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px;';

      const uploadLbl = document.createElement('label');
      uploadLbl.className = 'fh-btn fh-btn-xs';
      uploadLbl.style.cursor = 'pointer';
      uploadLbl.textContent = 'Upload Icon…';
      const uploadInput = document.createElement('input');
      uploadInput.type = 'file';
      uploadInput.accept = 'image/*';
      uploadInput.hidden = true;
      uploadInput.addEventListener('change', (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;
        if (!/^image\//i.test(file.type || '')) {
          errBanner.textContent = 'Please upload a valid image file (PNG, JPG, WebP, SVG).';
          errBanner.classList.remove('hidden');
          uploadInput.value = '';
          return;
        }
        if (file.size > 6 * 1024 * 1024) {
          errBanner.textContent = 'Icon file must be 6 MB or smaller.';
          errBanner.classList.remove('hidden');
          uploadInput.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string' && reader.result.length > 8 * 1024 * 1024) {
            errBanner.textContent = 'Encoded icon exceeds the 8 MB limit. Choose a smaller image.';
            errBanner.classList.remove('hidden');
            return;
          }
          if (typeof reader.result === 'string' && isSafeCustomIconRef(reader.result)) {
            errBanner.classList.add('hidden');
            draftIconUrl = reader.result;
            iIconUrl.value = draftIconUrl;
            refreshIconPreview();
          } else {
            errBanner.textContent = 'Uploaded icon could not be validated as a safe image.';
            errBanner.classList.remove('hidden');
          }
        };
        reader.readAsDataURL(file);
      });
      uploadLbl.appendChild(uploadInput);

      const fetchBtn = document.createElement('button');
      fetchBtn.type = 'button';
      fetchBtn.className = 'fh-btn fh-btn-xs';
      fetchBtn.textContent = 'Auto-Fetch Favicon';
      fetchBtn.addEventListener('click', async () => {
        const target = /^https?:\/\//i.test(draftUrl.trim()) ? draftUrl.trim() : `https://${draftUrl.trim()}`;
        if (!apis.media?.fetchWebsiteIconFromHtml) return;
        fetchBtn.disabled = true;
        fetchBtn.textContent = 'Fetching…';
        try {
          const found = await apis.media.fetchWebsiteIconFromHtml(target);
          if (found && isSafeCustomIconRef(found)) {
            errBanner.classList.add('hidden');
            draftIconUrl = found;
            iIconUrl.value = found;
            refreshIconPreview();
          } else {
            notifyToast('Could not detect a favicon for this URL.');
          }
        } catch (_) {
          notifyToast('Could not detect a favicon for this URL.');
        }
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Auto-Fetch Favicon';
      });

      const resetIconBtn = document.createElement('button');
      resetIconBtn.type = 'button';
      resetIconBtn.className = 'fh-btn fh-btn-xs';
      resetIconBtn.textContent = 'Reset Icon';
      resetIconBtn.addEventListener('click', () => {
        draftIconUrl = '';
        iIconUrl.value = '';
        refreshIconPreview();
      });

      iconBtnRow.appendChild(uploadLbl);
      iconBtnRow.appendChild(fetchBtn);
      iconBtnRow.appendChild(resetIconBtn);
      fIcon.appendChild(lIcon);
      fIcon.appendChild(iIconUrl);
      fIcon.appendChild(iconBtnRow);
      modal.appendChild(fIcon);

      // Per-Site User-Agent Mode
      const fUa = document.createElement('div');
      fUa.className = 'fh-modal-field';
      const lUa = document.createElement('label');
      lUa.textContent = 'Per-Site Browser Identity (User-Agent)';
      const uaGroup = document.createElement('div');
      uaGroup.className = 'fh-pill-group';
      const uaModes = [
        { id: 'default', label: 'Default (Firefox)' },
        { id: 'mobile', label: 'Mobile View (Android UA)' },
        { id: 'desktop', label: 'Force Desktop UA' }
      ];
      const uaBtns = [];
      uaModes.forEach((m) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `fh-pill-btn ${draftUa === m.id ? 'active' : ''}`;
        b.setAttribute('data-ua-mode', m.id);
        b.textContent = m.label;
        b.addEventListener('click', () => {
          draftUa = m.id;
          uaBtns.forEach((x) => x.classList.toggle('active', x.getAttribute('data-ua-mode') === draftUa));
        });
        uaGroup.appendChild(b);
        uaBtns.push(b);
      });
      fUa.appendChild(lUa);
      fUa.appendChild(uaGroup);
      modal.appendChild(fUa);

      const errBanner = document.createElement('div');
      errBanner.className = 'fh-status-banner is-err hidden';
      modal.appendChild(errBanner);

      // Modal Actions
      const actions = document.createElement('div');
      actions.className = 'fh-modal-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'fh-btn';
      cancelBtn.textContent = 'Cancel';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'fh-btn fh-btn-primary';
      saveBtn.textContent = 'Save Changes';

      const closeModal = () => {
        window.removeEventListener('keydown', onModalEsc, true);
        backdrop.remove();
      };
      const onModalEsc = (ev) => {
        if (ev.key === 'Escape') {
          ev.stopPropagation();
          closeModal();
        }
      };

      closeBtn.addEventListener('click', closeModal);
      cancelBtn.addEventListener('click', closeModal);
      backdrop.addEventListener('mousedown', (ev) => {
        if (ev.target === backdrop) closeModal();
      });
      window.addEventListener('keydown', onModalEsc, true);

      saveBtn.addEventListener('click', async () => {
        const cleanName = draftName.trim();
        let cleanUrl = draftUrl.trim();
        if (!cleanName) {
          errBanner.textContent = 'Enter an App Name.';
          errBanner.classList.remove('hidden');
          return;
        }
        if (cleanUrl && !/^[a-z][a-z0-9+.-]*:/i.test(cleanUrl)) {
          cleanUrl = `https://${cleanUrl}`;
        }
        try {
          const parsed = new URL(cleanUrl);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error('Only http:// or https:// URLs are allowed.');
          }
        } catch (_) {
          errBanner.textContent = 'Enter a valid http:// or https:// URL.';
          errBanner.classList.remove('hidden');
          return;
        }

        const cleanIconUrl = String(draftIconUrl || '').trim();
        if (cleanIconUrl && !isSafeCustomIconRef(cleanIconUrl)) {
          errBanner.textContent = 'Enter a valid http(s):// URL or image data URL for the custom icon.';
          errBanner.classList.remove('hidden');
          return;
        }
        errBanner.classList.add('hidden');

        const freshCustoms = Array.isArray(getSettings().customMediaApps) ? [...getSettings().customMediaApps] : [];
        const saveIdx = freshCustoms.findIndex((c, i) => (c.id || `custom-${i}`) === stableId);
        if (saveIdx < 0) {
          closeModal();
          syncAllSections();
          return;
        }
        const nextEntry = {
          ...freshCustoms[saveIdx],
          name: cleanName.slice(0, 60),
          url: cleanUrl,
          color: draftColor,
          iconUrl: cleanIconUrl,
          userAgentMode: draftUa
        };
        freshCustoms[saveIdx] = nextEntry;
        let saveRes;
        try {
          saveRes = await savePatch({ customMediaApps: freshCustoms }, `Updated ${nextEntry.name}`);
        } catch (err) {
          notifyToast('Could not persist settings: ' + ((err && err.message) || 'unknown error'));
          return;
        }
        if (!saveRes || saveRes.ok === false || saveRes.rolledBack) {
          errBanner.textContent = 'Could not save custom app changes: ' + ((saveRes && saveRes.error) || 'background rejected update');
          errBanner.classList.remove('hidden');
          return;
        }
        if (typeof options.onCustomAppUpdated === 'function') {
          options.onCustomAppUpdated(stableId, existing, nextEntry);
        }
        closeModal();
        syncAllSections();
      });

      actions.appendChild(cancelBtn);
      actions.appendChild(saveBtn);
      modal.appendChild(actions);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
      iName.focus();
    }

    // =========================================================================
    // Build All 6 Category Sections (Dynamic updaters keep focus intact!)
    // =========================================================================
    const sectionUpdaters = [];
    const muteTimerUpdaters = [];

    // Helper: create category group header for search mode
    CATEGORIES.forEach((cat) => {
      const gh = document.createElement('div');
      gh.className = 'fh-search-group-hdr hidden';
      gh.appendChild(createSvg(cat.icon, 12));
      const t = document.createElement('span');
      t.textContent = cat.label;
      gh.appendChild(t);
      groupHeaders.set(cat.id, gh);
    });

    function appendWithGroupHeader(catId, cards) {
      itemsStack.appendChild(groupHeaders.get(catId));
      cards.forEach((c) => itemsStack.appendChild(c));
    }

    // -------------------------------------------------------------------------
    // CATEGORY 1: MAIL & ACCOUNTS
    // -------------------------------------------------------------------------
    const mailAccountsCard = registerItem(
      'mail',
      'Connected Email Accounts',
      'gmail login accounts rescan nickname label badge color demo oauth',
      (card) => {
        const btnBar = document.createElement('div');
        btnBar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
        const loginBtn = document.createElement('button');
        loginBtn.type = 'button';
        loginBtn.className = 'fh-btn fh-btn-primary';
        loginBtn.textContent = 'Sign in with Google';
        loginBtn.addEventListener('click', async () => {
          await browser.runtime.sendMessage({ type: 'OPEN_GOOGLE_LOGIN' });
          notifyToast('Opening Google Account Sign-In…');
        });
        const rescanBtn = document.createElement('button');
        rescanBtn.type = 'button';
        rescanBtn.className = 'fh-btn';
        rescanBtn.textContent = 'Rescan Browser Accounts';
        rescanBtn.addEventListener('click', async () => {
          notifyToast('Scanning signed-in Google accounts…');
          const res = await browser.runtime.sendMessage({ type: 'SYNC_NOW' });
          if (res && res.state && typeof options.onStateReplace === 'function') {
            options.onStateReplace({ state: res.state, settings: res.settings || getSettings() });
          }
          syncAllSections();
          notifyToast(`Detected ${(res?.state?.accounts || []).length} account(s)`);
        });
        btnBar.appendChild(loginBtn);
        btnBar.appendChild(rescanBtn);
        card.appendChild(btnBar);

        const accListEl = document.createElement('div');
        accListEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
        card.appendChild(accListEl);

        sectionUpdaters.push((syncOpts = {}) => {
          const force = Boolean(syncOpts && syncOpts.force);
          const activeEl = document.activeElement;
          if (!force && activeEl && accListEl.contains(activeEl)) return;
          const apis = getApis();
          const st = getState();
          const s = getSettings();
          const accounts = Array.isArray(st.accounts) ? st.accounts : [];
          accListEl.replaceChildren();
          if (accounts.length === 0) {
            const p = document.createElement('p');
            p.className = 'fh-card-desc';
            p.textContent = 'No Gmail accounts detected yet. Click "Sign in with Google" above.';
            accListEl.appendChild(p);
            return;
          }
          const labelOptions = [
            { key: 'inbox', name: 'All Inbox (Default)' },
            { key: 'primary', name: 'Primary Only' },
            { key: 'important', name: 'Important Only' },
            { key: 'starred', name: 'Starred' },
            { key: 'social', name: 'Social' },
            { key: 'promotions', name: 'Promotions' },
            { key: 'updates', name: 'Updates' }
          ];
          accounts.forEach((acc) => {
            const cfg = (s.accountConfigs && s.accountConfigs[acc.email]) || {};
            const currentLabel = cfg.label || acc.label || 'inbox';
            const currentColor = cfg.color || acc.color || '#D95032';
            const currentNick = cfg.nickname || acc.nickname || '';
            const initials = (currentNick || acc.email || '?').slice(0, 2).toUpperCase();

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:11px;border:1px solid var(--border-color);background:var(--card-bg-solid, var(--bg-base));';

            const top = document.createElement('div');
            top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';
            const idLeft = document.createElement('div');
            idLeft.style.cssText = 'display:flex;align-items:center;gap:9px;min-width:0;flex:1;';
            if (apis.icons?.createSenderAvatarElement) {
              const av = apis.icons.createSenderAvatarElement(document, { senderName: currentNick || acc.email, senderEmail: acc.email }, initials, currentColor);
              av.style.width = '32px';
              av.style.height = '32px';
              av.style.fontSize = '12px';
              idLeft.appendChild(av);
            } else {
              const av = document.createElement('div');
              av.className = 'pm-avatar';
              av.style.cssText = `width:32px;height:32px;font-size:12px;background:${currentColor};`;
              av.textContent = initials;
              idLeft.appendChild(av);
            }
            const meta = document.createElement('div');
            meta.style.minWidth = '0';
            const em = document.createElement('div');
            em.style.cssText = 'font-weight:700;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            em.textContent = acc.email;
            const sub = document.createElement('div');
            sub.className = 'fh-row-sub';
            const kind = acc.isDemo ? 'Sample Preview' : acc.accountType === 'oauth' ? 'Local OAuth 2.0' : `Google Session (u/${acc.slotIndex || 0})`;
            sub.textContent = `${kind} • ${acc.unreadCount || 0} unread`;
            meta.appendChild(em);
            meta.appendChild(sub);
            idLeft.appendChild(meta);
            top.appendChild(idLeft);

            if (acc.isDemo) {
              const hideBtn = document.createElement('button');
              hideBtn.type = 'button';
              hideBtn.className = 'fh-btn fh-btn-xs';
              hideBtn.textContent = 'Hide Demo';
              hideBtn.addEventListener('click', async () => {
                await savePatch({ demoMode: 'off' }, 'Preview accounts hidden');
                syncAllSections();
              });
              top.appendChild(hideBtn);
            } else if (acc.accountType === 'oauth' || acc.disabled) {
              const rmBtn = document.createElement('button');
              rmBtn.type = 'button';
              rmBtn.className = 'fh-btn fh-btn-xs fh-btn-danger';
              rmBtn.textContent = 'Remove';
              rmBtn.addEventListener('click', async () => {
                const res = await browser.runtime.sendMessage({ type: 'REMOVE_ACCOUNT', email: acc.email });
                if (res && res.state && typeof options.onStateReplace === 'function') {
                  options.onStateReplace({ state: res.state, settings: res.settings || getSettings() });
                }
                syncAllSections();
                notifyToast(`Removed ${acc.email}`);
              });
              top.appendChild(rmBtn);
            }
            row.appendChild(top);

            const edits = document.createElement('div');
            edits.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
            const nickIn = document.createElement('input');
            nickIn.type = 'text';
            nickIn.className = 'fh-input';
            nickIn.style.cssText = 'flex:1;min-width:110px;';
            nickIn.placeholder = 'Nickname';
            nickIn.value = currentNick;

            const lblSel = document.createElement('select');
            lblSel.className = 'fh-select';
            lblSel.style.cssText = 'flex:1;min-width:120px;';
            lblSel.disabled = Boolean(acc.isDemo);
            labelOptions.forEach((opt) => {
              const o = document.createElement('option');
              o.value = opt.key;
              o.textContent = opt.name;
              lblSel.appendChild(o);
            });
            lblSel.value = currentLabel;

            const clrIn = document.createElement('input');
            clrIn.type = 'color';
            clrIn.value = currentColor;
            clrIn.style.cssText = 'width:32px;height:30px;border:none;background:none;cursor:pointer;padding:0;';

            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'fh-btn fh-btn-xs fh-btn-primary';
            saveBtn.textContent = 'Save';
            saveBtn.addEventListener('click', async () => {
              const curConfigs = { ...(getSettings().accountConfigs || {}) };
              curConfigs[acc.email] = {
                ...(curConfigs[acc.email] || {}),
                nickname: nickIn.value.trim(),
                label: lblSel.value,
                color: clrIn.value
              };
              await savePatch({ accountConfigs: curConfigs }, `Saved settings for ${acc.email}`);
              syncAllSections();
            });

            edits.appendChild(nickIn);
            edits.appendChild(lblSel);
            edits.appendChild(clrIn);
            edits.appendChild(saveBtn);
            row.appendChild(edits);
            accListEl.appendChild(row);
          });
        });
      },
      { icon: 'mail' }
    );

    const mailSyncCard = registerItem(
      'mail',
      'Inbox Polling, Limits & Demo Mode',
      'poll interval sync session slots max emails badge count mode demo preview',
      (card) => {
        const makeSelectRow = (label, sub, key, optsList) => {
          const row = document.createElement('div');
          row.className = 'fh-row fh-row-stack-narrow';
          const meta = document.createElement('div');
          meta.className = 'fh-row-meta';
          const l = document.createElement('div');
          l.className = 'fh-row-label';
          l.textContent = label;
          const sEl = document.createElement('div');
          sEl.className = 'fh-row-sub';
          sEl.textContent = sub;
          meta.appendChild(l);
          meta.appendChild(sEl);
          const ctrl = document.createElement('div');
          ctrl.className = 'fh-row-ctrl';
          const sel = document.createElement('select');
          sel.className = 'fh-select fh-select-compact';
          optsList.forEach(([v, txt]) => {
            const o = document.createElement('option');
            o.value = String(v);
            o.textContent = txt;
            sel.appendChild(o);
          });
          sel.addEventListener('change', async () => {
            const rawVal = sel.value;
            const parsed = typeof optsList[0][0] === 'number' ? parseInt(rawVal, 10) : rawVal;
            await savePatch({ [key]: parsed }, `Updated ${label}`);
          });
          ctrl.appendChild(sel);
          row.appendChild(meta);
          row.appendChild(ctrl);
          card.appendChild(row);
          sectionUpdaters.push((syncOpts = {}) => {
            const force = Boolean(syncOpts && syncOpts.force);
            const cur = getSettings()[key];
            if (cur !== undefined && (force || document.activeElement !== sel)) sel.value = String(cur);
          });
        };

        makeSelectRow('Background Check Interval', 'How often FoxHub checks connected accounts for new emails.', 'pollIntervalSeconds', [
          [15, 'Every 15 seconds'],
          [30, 'Every 30 seconds'],
          [60, 'Every 1 minute'],
          [180, 'Every 3 minutes'],
          [300, 'Every 5 minutes']
        ]);
        makeSelectRow('Multi-Login Session Slots', 'Google session slots (u/0 through u/N) scanned automatically.', 'maxSessionSlots', [
          [3, 'Up to 3 accounts (u/0–u/2)'],
          [5, 'Up to 5 accounts (u/0–u/4)'],
          [8, 'Up to 8 accounts (u/0–u/7)']
        ]);
        makeSelectRow('Emails Displayed Per Account', 'Number of recent inbox items fetched per account.', 'maxEmailsPerAccount', [
          [10, '10 emails'],
          [15, '15 emails'],
          [20, '20 emails'],
          [30, '30 emails'],
          [50, '50 emails']
        ]);
        makeSelectRow('Toolbar Unread Counter Mode', 'Choose recent visible feed count or all-time unread total.', 'badgeCountMode', [
          ['feed', 'Recent Feed Count'],
          ['total', 'Total All-Time Unread']
        ]);
        makeSelectRow('Sample Preview Inbox (Demo)', 'Show sample emails when no Gmail account is signed in.', 'demoMode', [
          ['auto', 'Auto (Only when 0 accounts)'],
          ['on', 'Always Show Samples'],
          ['off', 'Disabled (Real accounts only)']
        ]);
      },
      { icon: 'mail' }
    );

    const mailOauthCacheCard = registerItem(
      'mail',
      'Local Google OAuth 2.0 & Cache',
      'oauth client id clear local read snooze sent cache reset',
      (card) => {
        const oauthWrap = document.createElement('div');
        oauthWrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
        const oauthInput = document.createElement('input');
        oauthInput.type = 'text';
        oauthInput.className = 'fh-input';
        oauthInput.style.flex = '1';
        oauthInput.placeholder = 'Google OAuth Client ID (.apps.googleusercontent.com)';
        const oauthBtn = document.createElement('button');
        oauthBtn.type = 'button';
        oauthBtn.className = 'fh-btn';
        oauthBtn.textContent = 'Connect OAuth';
        oauthBtn.addEventListener('click', async () => {
          const clientId = oauthInput.value.trim();
          if (!clientId) {
            notifyToast('Enter a Google OAuth Client ID first');
            return;
          }
          try {
            const res = await browser.runtime.sendMessage({ type: 'CONNECT_OAUTH_ACCOUNT', clientId });
            if (res && res.ok && typeof options.onStateReplace === 'function') {
              options.onStateReplace({ state: res.state, settings: res.settings || getSettings() });
            }
            syncAllSections();
            notifyToast(res?.ok ? `Connected ${res.account?.email || 'OAuth account'}` : (res?.error || 'OAuth cancelled'));
          } catch (err) {
            notifyToast(err.message || 'OAuth login cancelled');
          }
        });
        oauthWrap.appendChild(oauthInput);
        oauthWrap.appendChild(oauthBtn);
        card.appendChild(oauthWrap);

        const cacheRow = document.createElement('div');
        cacheRow.className = 'fh-row fh-row-stack-narrow';
        const cMeta = document.createElement('div');
        cMeta.className = 'fh-row-meta';
        const cLbl = document.createElement('div');
        cLbl.className = 'fh-row-label';
        cLbl.textContent = 'Local Email Cache';
        const cSub = document.createElement('div');
        cSub.className = 'fh-row-sub';
        cSub.textContent = 'Clears locally marked read, archived, snoozed, and sent history overlay.';
        cMeta.appendChild(cLbl);
        cMeta.appendChild(cSub);
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'fh-btn fh-btn-xs';
        clearBtn.textContent = 'Reset Local Cache';
        clearBtn.addEventListener('click', async () => {
          const res = await browser.runtime.sendMessage({ type: 'CLEAR_LOCAL_CACHE' });
          if (res && res.state && typeof options.onStateReplace === 'function') {
            options.onStateReplace({ state: res.state, settings: getSettings() });
          }
          syncAllSections();
          notifyToast('Local read/snooze/sent cache cleared');
        });
        cacheRow.appendChild(cMeta);
        cacheRow.appendChild(clearBtn);
        card.appendChild(cacheRow);

        sectionUpdaters.push((syncOpts = {}) => {
          const force = Boolean(syncOpts && syncOpts.force);
          if (force || document.activeElement !== oauthInput) {
            oauthInput.value = getSettings().oauthClientId || '';
          }
        });
      },
      { icon: 'mail' }
    );

    // -------------------------------------------------------------------------
    // CATEGORY 2: APPEARANCE & THEMES
    // -------------------------------------------------------------------------
    const appThemesCard = registerItem(
      'appearance',
      'Color Palettes & Visual Studio',
      'theme palette dark true night warm linen sakura matcha obsidian glassmorphism',
      (card) => {
        if (mode === 'drawer' && typeof options.onOpenThemeStudio === 'function') {
          const studioBanner = document.createElement('div');
          studioBanner.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 10px;border-radius:10px;background:var(--accent-soft);border:1px solid var(--border-strong);';
          const txt = document.createElement('span');
          txt.style.cssText = 'font-size:11.5px;font-weight:650;';
          txt.textContent = 'Want live inbox peek while styling?';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'fh-btn fh-btn-xs fh-btn-primary';
          btn.textContent = 'Open Visual Studio';
          btn.addEventListener('click', () => options.onOpenThemeStudio());
          studioBanner.appendChild(txt);
          studioBanner.appendChild(btn);
          card.appendChild(studioBanner);
        }

        const themeGrid = document.createElement('div');
        themeGrid.className = 'fh-grid-cards';
        card.appendChild(themeGrid);

        sectionUpdaters.push(() => {
          const apis = getApis();
          if (!apis.themes) return;
          const s = getSettings();
          const curTheme = s.theme || 'warm-linen';
          if (themeGrid.childElementCount === 0) {
            Object.values(apis.themes.THEMES).forEach((t) => {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = `fh-theme-card ${curTheme === t.id ? 'active' : ''}`;
              btn.setAttribute('data-theme-id', t.id);
              const sw = document.createElement('div');
              sw.className = 'fh-theme-swatch';
              sw.style.background = t.previewGradient;
              const dot = document.createElement('span');
              dot.className = 'fh-theme-dot';
              dot.style.background = t.accentDot;
              sw.appendChild(dot);

              const info = document.createElement('div');
              info.style.minWidth = '0';
              const n = document.createElement('div');
              n.style.cssText = 'font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
              n.textContent = t.name;
              const sub = document.createElement('div');
              sub.style.cssText = 'font-size:10.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
              sub.textContent = t.subtitle || '';
              info.appendChild(n);
              info.appendChild(sub);

              btn.appendChild(sw);
              btn.appendChild(info);
              btn.addEventListener('click', async () => {
                const curWp = getSettings().wallpaper;
                const nextWp = curWp === 'custom' || curWp === 'custom-gradient' ? curWp : (t.defaultWallpaper || curWp);
                await savePatch({ theme: t.id, wallpaper: nextWp }, `Applied ${t.name} theme`);
                syncAllSections();
              });
              themeGrid.appendChild(btn);
            });
          } else {
            Array.from(themeGrid.children).forEach((btn) => {
              btn.classList.toggle('active', btn.getAttribute('data-theme-id') === curTheme);
            });
          }
        });
      },
      { icon: 'palette' }
    );

    const appWallpapersCard = registerItem(
      'appearance',
      'Wallpapers, Custom Gradient & Photo',
      'wallpaper background artwork custom gradient angle image upload url fit opacity blur',
      (card) => {
        const wpGrid = document.createElement('div');
        wpGrid.className = 'fh-grid-cards';
        card.appendChild(wpGrid);

        // Custom Gradient Maker
        const gradBox = document.createElement('div');
        gradBox.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:8px;border-top:1px solid var(--border-color);';
        const c1In = document.createElement('input');
        c1In.type = 'color';
        c1In.title = 'Gradient Color 1';
        c1In.style.cssText = 'width:32px;height:28px;border:none;background:none;cursor:pointer;padding:0;';
        const c2In = document.createElement('input');
        c2In.type = 'color';
        c2In.title = 'Gradient Color 2';
        c2In.style.cssText = 'width:32px;height:28px;border:none;background:none;cursor:pointer;padding:0;';
        const angIn = document.createElement('input');
        angIn.type = 'number';
        angIn.min = '0';
        angIn.max = '360';
        angIn.className = 'fh-input';
        angIn.style.width = '68px';
        angIn.title = 'Gradient Angle (0–360°)';
        const applyGradBtn = document.createElement('button');
        applyGradBtn.type = 'button';
        applyGradBtn.className = 'fh-btn fh-btn-xs fh-btn-primary';
        applyGradBtn.textContent = 'Apply Gradient';
        applyGradBtn.addEventListener('click', async () => {
          const g1 = c1In.value || '#FAD6A5';
          const g2 = c2In.value || '#E8A598';
          const angle = Math.max(0, Math.min(360, parseInt(angIn.value || '135', 10) || 135));
          await savePatch({
            wallpaper: 'custom-gradient',
            gradientColor1: g1,
            gradientColor2: g2,
            customGradient1: g1,
            customGradient2: g2,
            gradientAngle: angle
          }, 'Custom gradient applied');
          syncAllSections();
        });
        gradBox.appendChild(c1In);
        gradBox.appendChild(c2In);
        gradBox.appendChild(angIn);
        gradBox.appendChild(applyGradBtn);
        card.appendChild(gradBox);

        // Custom Image Upload + URL + Fit
        const imgBox = document.createElement('div');
        imgBox.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:1px solid var(--border-color);';
        const uploadRow = document.createElement('div');
        uploadRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
        const uploadLbl = document.createElement('label');
        uploadLbl.className = 'fh-btn fh-btn-xs';
        uploadLbl.style.cursor = 'pointer';
        uploadLbl.textContent = 'Upload Photo…';
        const fileIn = document.createElement('input');
        fileIn.type = 'file';
        fileIn.accept = 'image/*';
        fileIn.hidden = true;
        fileIn.addEventListener('change', (ev) => {
          const f = ev.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = async () => {
            if (typeof r.result === 'string') {
              await savePatch({ wallpaper: 'custom', customWallpaperData: r.result }, 'Custom background uploaded');
              syncAllSections();
            }
          };
          r.readAsDataURL(f);
        });
        uploadLbl.appendChild(fileIn);

        const fitSel = document.createElement('select');
        fitSel.className = 'fh-select';
        fitSel.style.width = 'auto';
        ['cover', 'contain', 'repeat', 'tile', 'auto'].forEach((fit) => {
          const o = document.createElement('option');
          o.value = fit;
          o.textContent = `Fit: ${fit}`;
          fitSel.appendChild(o);
        });
        fitSel.addEventListener('change', () => savePatch({ wallpaperFit: fitSel.value }, `Wallpaper fit: ${fitSel.value}`));

        const resetWpBtn = document.createElement('button');
        resetWpBtn.type = 'button';
        resetWpBtn.className = 'fh-btn fh-btn-xs';
        resetWpBtn.textContent = 'Reset';
        resetWpBtn.addEventListener('click', async () => {
          const apis = getApis();
          const curTheme = getSettings().theme || 'warm-linen';
          const defWp = apis.themes?.THEMES?.[curTheme]?.defaultWallpaper || 'watercolor-hills';
          await savePatch({ wallpaper: defWp, customWallpaperData: '', customWallpaperUrl: '' }, 'Reset wallpaper to theme default');
          syncAllSections();
        });

        uploadRow.appendChild(uploadLbl);
        uploadRow.appendChild(fitSel);
        uploadRow.appendChild(resetWpBtn);

        const urlRow = document.createElement('div');
        urlRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;min-width:0;';
        const urlIn = document.createElement('input');
        urlIn.type = 'url';
        urlIn.className = 'fh-input';
        urlIn.style.cssText = 'flex:1;min-width:120px;';
        urlIn.placeholder = 'Image URL (https://…)';
        const urlApply = document.createElement('button');
        urlApply.type = 'button';
        urlApply.className = 'fh-btn fh-btn-xs fh-btn-primary';
        urlApply.textContent = 'Use';
        urlApply.addEventListener('click', async () => {
          const u = urlIn.value.trim();
          if (!/^https?:\/\//i.test(u)) {
            notifyToast('Enter a valid https:// image URL');
            return;
          }
          await savePatch({ wallpaper: 'custom', customWallpaperData: u, customWallpaperUrl: u }, 'Custom wallpaper URL applied');
          syncAllSections();
        });
        urlRow.appendChild(urlIn);
        urlRow.appendChild(urlApply);

        imgBox.appendChild(uploadRow);
        imgBox.appendChild(urlRow);
        card.appendChild(imgBox);

        sectionUpdaters.push((syncOpts = {}) => {
          const force = Boolean(syncOpts && syncOpts.force);
          const apis = getApis();
          const s = getSettings();
          if (force || document.activeElement !== c1In) c1In.value = s.gradientColor1 || s.customGradient1 || '#FAD6A5';
          if (force || document.activeElement !== c2In) c2In.value = s.gradientColor2 || s.customGradient2 || '#E8A598';
          if (force || document.activeElement !== angIn) angIn.value = String(s.gradientAngle !== undefined ? s.gradientAngle : 135);
          if (force || document.activeElement !== fitSel) fitSel.value = s.wallpaperFit || 'cover';
          if (force || document.activeElement !== urlIn) urlIn.value = s.customWallpaperUrl || '';
          if (!apis.themes) return;
          const curWp = s.wallpaper || 'watercolor-hills';
          if (wpGrid.childElementCount === 0) {
            Object.values(apis.themes.WALLPAPERS).forEach((wp) => {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = `fh-wp-card ${curWp === wp.id ? 'active' : ''}`;
              btn.setAttribute('data-wp-id', wp.id);
              const prev = document.createElement('div');
              prev.className = 'fh-wp-preview';
              prev.style.backgroundImage = wp.svg ? apis.themes.svgToDataUrl(wp.svg) : 'none';
              const n = document.createElement('div');
              n.style.cssText = 'font-weight:700;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
              n.textContent = wp.name;
              btn.appendChild(prev);
              btn.appendChild(n);
              btn.addEventListener('click', async () => {
                await savePatch({ wallpaper: wp.id }, `Background: ${wp.name}`);
                syncAllSections();
              });
              wpGrid.appendChild(btn);
            });
          } else {
            Array.from(wpGrid.children).forEach((btn) => {
              btn.classList.toggle('active', btn.getAttribute('data-wp-id') === curWp);
            });
          }
        });
      },
      { icon: 'palette' }
    );

    const appSurfaceCard = registerItem(
      'appearance',
      'Cards, Typography, Social Theme & Dimensions',
      'card style glassmorphism opacity blur radius density actions avatar shape left accent tab font ambient social app theme cozy-sepia popup width',
      (card) => {
        const makeRange = (label, key, min, max, step, fmt) => {
          const wrap = document.createElement('div');
          wrap.className = 'fh-slider-wrap';
          const head = document.createElement('div');
          head.className = 'fh-slider-head';
          const lbl = document.createElement('span');
          lbl.textContent = label;
          const valLbl = document.createElement('strong');
          head.appendChild(lbl);
          head.appendChild(valLbl);
          const inp = document.createElement('input');
          inp.type = 'range';
          inp.className = 'fh-range';
          inp.min = String(min);
          inp.max = String(max);
          inp.step = String(step);
          inp.addEventListener('input', () => {
            const num = parseFloat(inp.value);
            valLbl.textContent = fmt(num);
            savePatch({ [key]: num });
          });
          wrap.appendChild(head);
          wrap.appendChild(inp);
          card.appendChild(wrap);
          sectionUpdaters.push((syncOpts = {}) => {
            const force = Boolean(syncOpts && syncOpts.force);
            const v = getSettings()[key];
            if (typeof v === 'number') {
              if (force || document.activeElement !== inp) inp.value = String(v);
              valLbl.textContent = fmt(v);
            }
          });
        };

        makeRange('Wallpaper Visibility', 'wallpaperOpacity', 0.05, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
        makeRange('Wallpaper Soft-Focus Blur', 'wallpaperBlur', 0, 20, 1, (v) => `${v}px`);
        makeRange('Card Glass Opacity', 'cardOpacity', 0.1, 1, 0.02, (v) => `${Math.round(v * 100)}%`);
        makeRange('Card Frosted Blur', 'cardBlur', 0, 28, 2, (v) => `${v}px`);
        makeRange('Card Corner Radius', 'cardRadius', 0, 28, 1, (v) => `${v}px`);
        makeRange('Popup Window Width', 'popupWidth', 380, 795, 15, (v) => `${v}px`);

        const selectGrid = document.createElement('div');
        selectGrid.className = 'fh-grid-2';
        card.appendChild(selectGrid);

        const addSelectField = (label, key, pairs) => {
          const box = document.createElement('div');
          box.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
          const lbl = document.createElement('label');
          lbl.style.cssText = 'font-size:11.5px;font-weight:700;color:var(--text-secondary);';
          lbl.textContent = label;
          const sel = document.createElement('select');
          sel.className = 'fh-select';
          pairs.forEach(([val, text]) => {
            const o = document.createElement('option');
            o.value = val;
            o.textContent = text;
            sel.appendChild(o);
          });
          sel.addEventListener('change', async () => {
            const prevSocial = getSettings().socialAppThemeMode;
            await savePatch({ [key]: sel.value }, `${label}: ${sel.options[sel.selectedIndex]?.textContent || sel.value}`);
            if (key === 'socialAppThemeMode' && typeof options.onBroadcastAppConfig === 'function') {
              options.onBroadcastAppConfig('socialTheme', prevSocial);
            }
          });
          box.appendChild(lbl);
          box.appendChild(sel);
          selectGrid.appendChild(box);
          sectionUpdaters.push((syncOpts = {}) => {
            const force = Boolean(syncOpts && syncOpts.force);
            const cur = getSettings()[key];
            if (cur !== undefined && (force || document.activeElement !== sel)) sel.value = String(cur);
          });
        };

        // Strictly matches FoxHubSettingsSchema.ENUMS.cardStyle (5 values — no soft-neumorphic)
        addSelectField('Card Material Style', 'cardStyle', [
          ['glassmorphism', 'Crystal Glassmorphism'],
          ['tinted-glass', 'Tinted Color Glass'],
          ['warm-paper', 'Artisanal Warm Paper'],
          ['floating-minimal', 'Borderless Floating'],
          ['outlined-editorial', 'Editorial Outlined']
        ]);
        addSelectField('Card Density', 'cardDensity', [
          ['compact', 'Compact Rows'],
          ['cozy', 'Cozy Default'],
          ['spacious', 'Spacious Magazine']
        ]);
        addSelectField('Card Action Buttons', 'cardActionsMode', [
          ['always', 'Always Show'],
          ['hover', 'Reveal on Hover'],
          ['compact-icons', 'Compact Icons']
        ]);
        addSelectField('Avatar Shape', 'avatarShape', [
          ['squircle', 'Squircle'],
          ['circle', 'Circle'],
          ['pill', 'Soft Pill']
        ]);
        addSelectField('Account Tab Style', 'tabStyle', [
          ['glass-pills', 'Frosted Glass Pills'],
          ['segmented-bar', 'Segmented Bar'],
          ['underline-tabs', 'Editorial Underline'],
          ['tinted-chips', 'Tinted Color Chips']
        ]);
        addSelectField('Typography Style', 'fontStyle', [
          ['editorial', 'Editorial Mix'],
          ['modern-sans', 'Modern Sans'],
          ['literary-serif', 'Bookish Serif'],
          ['rounded-cozy', 'Rounded Cozy']
        ]);
        addSelectField('Ambient Atmosphere', 'ambientEffect', [
          ['sunbeams', 'Warm Sunbeams'],
          ['soft-bokeh', 'Dreamy Bokeh Glow'],
          ['paper-grain', 'Fine Paper Texture'],
          ['none', 'None (Clean)']
        ]);
        // All 7 schema values incl. cozy-sepia
        addSelectField('Social & Media App Theme', 'socialAppThemeMode', [
          ['native', 'Native App Default'],
          ['true-night', 'True Night OLED (#000)'],
          ['match-theme', 'Match FoxHub Palette'],
          ['warm-glass', 'Cozy Warm Eye-Care'],
          ['midnight-oled', 'Midnight Indigo'],
          ['cozy-sepia', 'Cozy Sepia'],
          ['rose-twilight', 'Rose Twilight']
        ]);

        // showLeftAccent toggle
        const accentRow = document.createElement('div');
        accentRow.className = 'fh-row';
        const accentMeta = document.createElement('div');
        accentMeta.className = 'fh-row-meta';
        const accentLbl = document.createElement('div');
        accentLbl.className = 'fh-row-label';
        accentLbl.id = `fh-toggle-lbl-${mode}-${++toggleLabelSeq}`;
        accentLbl.textContent = 'Colored Account Left Spine';
        const accentSub = document.createElement('div');
        accentSub.className = 'fh-row-sub';
        accentSub.textContent = 'Show account color stripe along the left edge of each email card.';
        accentMeta.appendChild(accentLbl);
        accentMeta.appendChild(accentSub);
        const accentSwitch = makeToggleSwitch(true, (checked) => {
          savePatch({ showLeftAccent: checked }, checked ? 'Left spine shown' : 'Left spine hidden');
        }, { labelledBy: accentLbl.id, settingKey: 'showLeftAccent' });
        accentRow.appendChild(accentMeta);
        accentRow.appendChild(accentSwitch.wrap);
        card.appendChild(accentRow);

        sectionUpdaters.push(() => {
          accentSwitch.input.checked = getSettings().showLeftAccent !== false;
        });
      },
      { icon: 'palette' }
    );

    // -------------------------------------------------------------------------
    // CATEGORY 3: APPS & CUSTOM WEBSITES
    // -------------------------------------------------------------------------
    const appsCatalogCard = registerItem(
      'apps',
      'Built-In App Presets (21) & Pinning',
      'apps catalog pin unpin instagram whatsapp discord telegram spotify youtube tiktok x messenger reddit twitch chatgpt gemini claude perplexity soundcloud apple music bluesky notion google calendar keep reorder',
      (card) => {
        const sub = document.createElement('p');
        sub.className = 'fh-card-desc';
        sub.textContent = 'Pin apps to your left rail, drag or use arrows to reorder, enable background audio, assign chimes, or set direct hotkeys. New presets stay unpinned until you enable them.';
        card.appendChild(sub);

        const grid = document.createElement('div');
        grid.className = 'fh-app-catalog-grid';
        card.appendChild(grid);

        let draggedId = null;
        let pendingGridRebuild = false;
        const cardMap = new Map();

        const getOrderedAllApps = () => {
          const apis = getApis();
          if (!apis.media) return { apis, s: getSettings(), allApps: [], customs: [] };
          const s = getSettings();
          const builtIns = apis.media.getOrderedBuiltInApps ? apis.media.getOrderedBuiltInApps(s) : apis.media.BUILTIN_MEDIA_APPS;
          const customs = apis.media.mapCustomApps ? apis.media.mapCustomApps(s) : [];
          return { apis, s, allApps: [...builtIns, ...customs], customs };
        };

        const moveOrder = async (sourceId, targetId) => {
          if (!sourceId || !targetId || sourceId === targetId) return;
          const { s, allApps } = getOrderedAllApps();
          const fullOrder = allApps.map((a) => a.id);
          const unique = Array.from(new Set([...(s.mediaAppsOrder || []), ...fullOrder]));
          const fromIdx = unique.indexOf(sourceId);
          const toIdx = unique.indexOf(targetId);
          if (fromIdx === -1 || toIdx === -1) return;
          unique.splice(fromIdx, 1);
          unique.splice(toIdx, 0, sourceId);
          await savePatch({ mediaAppsOrder: unique }, 'Updated app order');
          syncAllSections();
        };

        const isGridFormControlFocused = () => {
          const activeEl = document.activeElement;
          return Boolean(
            activeEl &&
            grid.contains(activeEl) &&
            (activeEl.tagName === 'SELECT' || activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')
          );
        };

        const updateAppsGrid = (syncOpts = {}) => {
          const force = Boolean(syncOpts && syncOpts.force);
          const { apis, s, allApps, customs } = getOrderedAllApps();
          if (!apis.media) return;
          const enabledIds = Array.isArray(s.enabledMediaApps) ? s.enabledMediaApps : apis.media.DEFAULT_ENABLED_APP_IDS;
          const bgAudioIds = Array.isArray(s.bgAudioAppIds) ? s.bgAudioAppIds : ['spotify', 'youtube', 'soundcloud'];
          const soundMap = s.socialAppSoundMap || {};
          const soundPresets = apis.sound?.SOUND_PRESET_LIST || [];
          const sig = allApps.map((a) => `${a.id}:${a.name}:${a.color || ''}:${a.gradient || ''}:${a.iconUrl || ''}`).join('|');

          const updateCardsInPlace = () => {
            allApps.forEach((app, idx) => {
              const refs = cardMap.get(app.id);
              if (!refs) return;
              const isEnabled = app.isCustom ? app.enabled !== false : enabledIds.includes(app.id);
              const isBgOn = bgAudioIds.includes(app.id);
              const isSilentDefault = SILENT_DEFAULT_APP_IDS.has(app.id);
              const curSnd = soundMap[app.id] !== undefined ? soundMap[app.id] : (isSilentDefault ? 'none' : '');
              const assignedSc = String((s.appShortcuts || {})[app.id] || '').trim();

              refs.itemCard.classList.toggle('is-enabled', isEnabled);
              refs.pinBtn.className = `fh-btn fh-btn-xs ${isEnabled ? 'fh-btn-primary' : ''}`;
              refs.pinBtn.textContent = isEnabled ? 'Pinned' : 'Hidden';
              if (refs.upBtn) refs.upBtn.classList.toggle('hidden', idx === 0);
              refs.bgBtn.className = `fh-btn fh-btn-xs ${isBgOn ? 'fh-btn-primary' : ''}`;
              refs.bgBtn.style.cssText = isBgOn ? 'background:#1DB954;border-color:#1DB954;color:#FFF;' : '';
              refs.bgBtn.textContent = isBgOn ? 'Bg Audio: ON' : 'Bg Audio: OFF';
              if (force || document.activeElement !== refs.sndSel) {
                refs.sndSel.value = curSnd === 'default' ? '' : curSnd;
              }
              if (!refs.scBtn.classList.contains('is-recording')) {
                refs.scBtn.className = `fh-shortcut-btn ${assignedSc ? 'has-shortcut' : ''}`;
                refs.scBtn.textContent = assignedSc || 'Hotkey';
              }
            });
          };

          if (grid.dataset.renderSig === sig && cardMap.size === allApps.length) {
            updateCardsInPlace();
            return;
          }

          if (draggedId !== null || grid.querySelector('.is-recording') || (!force && isGridFormControlFocused())) {
            pendingGridRebuild = true;
            updateCardsInPlace();
            return;
          }

          let focusedAppId = '';
          let focusedRole = '';
          const activeEl = document.activeElement;
          if (activeEl && grid.contains(activeEl)) {
            const activeCard = activeEl.closest('[data-app-id]');
            focusedAppId = activeCard ? (activeCard.getAttribute('data-app-id') || '') : '';
            const oldRefs = focusedAppId ? cardMap.get(focusedAppId) : null;
            if (oldRefs) {
              if (oldRefs.upBtn === activeEl) focusedRole = 'up';
              else if (oldRefs.pinBtn === activeEl) focusedRole = 'pin';
              else if (oldRefs.bgBtn === activeEl) focusedRole = 'bg';
              else if (oldRefs.scBtn === activeEl) focusedRole = 'sc';
              else if (oldRefs.sndSel === activeEl) focusedRole = 'snd';
            }
          }

          pendingGridRebuild = false;
          cardMap.clear();
          grid.replaceChildren();
          allApps.forEach((app, idx) => {
            const isEnabled = app.isCustom ? app.enabled !== false : enabledIds.includes(app.id);
            const isBgOn = bgAudioIds.includes(app.id);

            const itemCard = document.createElement('div');
            itemCard.className = `fh-app-card ${isEnabled ? 'is-enabled' : ''}`;
            itemCard.draggable = true;
            itemCard.setAttribute('data-app-id', app.id);

            itemCard.addEventListener('dragstart', (e) => {
              draggedId = app.id;
              if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', app.id); } catch (_) {}
              }
            });
            itemCard.addEventListener('dragover', (e) => e.preventDefault());
            itemCard.addEventListener('drop', (e) => {
              e.preventDefault();
              const src = draggedId || e.dataTransfer?.getData('text/plain');
              if (src && src !== app.id) moveOrder(src, app.id);
            });
            itemCard.addEventListener('dragend', () => {
              draggedId = null;
              if (pendingGridRebuild && !destroyed) {
                pendingGridRebuild = false;
                updateAppsGrid();
              }
            });

            const top = document.createElement('div');
            top.className = 'fh-app-card-top';

            const idWrap = document.createElement('div');
            idWrap.className = 'fh-app-card-id';
            const iconBox = document.createElement('span');
            iconBox.className = 'fh-app-icon-box';
            iconBox.style.background = app.gradient || app.color || '#6C63FF';
            iconBox.appendChild(apis.media.createAppSvgIcon(app.id, 14, customs));
            const nameCol = document.createElement('div');
            nameCol.className = 'fh-app-name-col';
            const nm = document.createElement('div');
            nm.className = 'fh-app-name';
            nm.textContent = app.name;
            const catTag = document.createElement('span');
            catTag.className = 'fh-app-cat-tag';
            catTag.textContent = app.category || 'app';
            nameCol.appendChild(nm);
            nameCol.appendChild(catTag);
            idWrap.appendChild(iconBox);
            idWrap.appendChild(nameCol);

            const pinBtn = document.createElement('button');
            pinBtn.type = 'button';
            pinBtn.className = `fh-btn fh-btn-xs ${isEnabled ? 'fh-btn-primary' : ''}`;
            pinBtn.textContent = isEnabled ? 'Pinned' : 'Hidden';
            pinBtn.addEventListener('click', async () => {
              const curApis = getApis();
              const curS = getSettings();
              const curEnabledIds = Array.isArray(curS.enabledMediaApps)
                ? curS.enabledMediaApps
                : (curApis.media?.DEFAULT_ENABLED_APP_IDS || []);
              if (app.isCustom) {
                const rawCustoms = Array.isArray(curS.customMediaApps) ? [...curS.customMediaApps] : [];
                const cIdx = rawCustoms.findIndex((c, ci) => (c.id || `custom-${ci}`) === app.id);
                if (cIdx >= 0) {
                  const curEn = rawCustoms[cIdx].enabled !== false;
                  rawCustoms[cIdx] = { ...rawCustoms[cIdx], enabled: !curEn };
                  await savePatch({ customMediaApps: rawCustoms });
                }
              } else {
                const curEn = curEnabledIds.includes(app.id);
                const nextIds = curEn ? curEnabledIds.filter((x) => x !== app.id) : [...curEnabledIds, app.id];
                await savePatch({ enabledMediaApps: nextIds });
              }
              syncAllSections();
            });

            top.appendChild(idWrap);
            top.appendChild(pinBtn);
            itemCard.appendChild(top);

            const ctrls = document.createElement('div');
            ctrls.className = 'fh-app-card-controls';

            const upBtn = document.createElement('button');
            upBtn.type = 'button';
            upBtn.className = `fh-btn fh-btn-xs ${idx === 0 ? 'hidden' : ''}`;
            upBtn.title = 'Move Up';
            upBtn.textContent = '↑';
            upBtn.addEventListener('click', () => {
              const { allApps: curAllApps } = getOrderedAllApps();
              const curIdx = curAllApps.findIndex((a) => a.id === app.id);
              if (curIdx > 0) moveOrder(app.id, curAllApps[curIdx - 1].id);
            });
            ctrls.appendChild(upBtn);

            // Bg Audio toggle pill
            const bgBtn = document.createElement('button');
            bgBtn.type = 'button';
            bgBtn.className = `fh-btn fh-btn-xs ${isBgOn ? 'fh-btn-primary' : ''}`;
            if (isBgOn) bgBtn.style.cssText = 'background:#1DB954;border-color:#1DB954;color:#FFF;';
            bgBtn.textContent = isBgOn ? 'Bg Audio: ON' : 'Bg Audio: OFF';
            bgBtn.addEventListener('click', async () => {
              const curS = getSettings();
              const curBgIds = Array.isArray(curS.bgAudioAppIds) ? curS.bgAudioAppIds : ['spotify', 'youtube', 'soundcloud'];
              const curOn = curBgIds.includes(app.id);
              const nextBg = curOn ? curBgIds.filter((x) => x !== app.id) : [...curBgIds, app.id];
              await savePatch({ bgAudioAppIds: nextBg }, `${app.name}: Bg Audio ${curOn ? 'OFF' : 'ON'}`);
              syncAllSections();
            });
            ctrls.appendChild(bgBtn);

            // Per-App Sound Select
            const isSilentDefault = SILENT_DEFAULT_APP_IDS.has(app.id);
            const curSnd = soundMap[app.id] !== undefined ? soundMap[app.id] : (isSilentDefault ? 'none' : '');
            const sndSel = document.createElement('select');
            sndSel.className = 'fh-select';
            sndSel.style.cssText = 'flex:1;min-width:98px;padding:3px 6px;font-size:10.5px;';
            sndSel.title = `Notification chime for ${app.name}`;
            const defO = document.createElement('option');
            defO.value = '';
            defO.textContent = 'Default Chime';
            sndSel.appendChild(defO);
            const muteO = document.createElement('option');
            muteO.value = 'none';
            muteO.textContent = 'Muted';
            sndSel.appendChild(muteO);
            soundPresets.forEach((p) => {
              if (p.id === 'none' || p.id === 'custom') return;
              const o = document.createElement('option');
              o.value = p.id;
              o.textContent = p.name;
              sndSel.appendChild(o);
            });
            sndSel.value = curSnd === 'default' ? '' : curSnd;
            sndSel.addEventListener('change', async () => {
              const curApis = getApis();
              const curS = getSettings();
              const nextMap = { ...(curS.socialAppSoundMap || {}) };
              if (sndSel.value) nextMap[app.id] = sndSel.value;
              else if (isSilentDefault) nextMap[app.id] = 'default';
              else delete nextMap[app.id];
              await savePatch({ socialAppSoundMap: nextMap }, `${app.name} sound updated`);
              if (sndSel.value && sndSel.value !== 'none' && curApis.sound) {
                curApis.sound.playNotificationSound(sndSel.value, curS.soundVolume ?? 0.75, curS.customAudioData);
              }
            });
            ctrls.appendChild(sndSel);

            // Per-App Shortcut button
            const assignedSc = String((s.appShortcuts || {})[app.id] || '').trim();
            const scBtn = document.createElement('button');
            scBtn.type = 'button';
            scBtn.className = `fh-shortcut-btn ${assignedSc ? 'has-shortcut' : ''}`;
            scBtn.style.cssText = 'min-width:74px;height:24px;font-size:10px;padding:0 6px;';
            scBtn.textContent = assignedSc || 'Hotkey';
            scBtn.setAttribute('data-sc-app', app.id);
            bindShortcutButton(scBtn, 'app', app.id, app.name);
            ctrls.appendChild(scBtn);

            itemCard.appendChild(ctrls);
            grid.appendChild(itemCard);
            cardMap.set(app.id, { itemCard, pinBtn, upBtn, bgBtn, sndSel, scBtn });
          });
          grid.dataset.renderSig = sig;
          if (focusedAppId && cardMap.has(focusedAppId)) {
            const nextRefs = cardMap.get(focusedAppId);
            let targetFocus = null;
            if (focusedRole === 'up') {
              targetFocus = nextRefs.upBtn && !nextRefs.upBtn.classList.contains('hidden') ? nextRefs.upBtn : nextRefs.pinBtn;
            } else if (focusedRole === 'pin') {
              targetFocus = nextRefs.pinBtn;
            } else if (focusedRole === 'bg') {
              targetFocus = nextRefs.bgBtn;
            } else if (focusedRole === 'sc') {
              targetFocus = nextRefs.scBtn;
            } else if (focusedRole === 'snd') {
              targetFocus = nextRefs.sndSel;
            }
            if (targetFocus && typeof targetFocus.focus === 'function') {
              targetFocus.focus();
            }
          }
        };

        grid.addEventListener('focusout', () => {
          setTimeout(() => {
            if (!destroyed && pendingGridRebuild && draggedId === null && !grid.querySelector('.is-recording') && !isGridFormControlFocused()) {
              pendingGridRebuild = false;
              updateAppsGrid();
            }
          }, 0);
        });

        sectionUpdaters.push(updateAppsGrid);
      },
      { icon: 'grid' }
    );

    const customAppsCard = registerItem(
      'apps',
      'Custom Websites & Pro Controls',
      'custom website app add url color icon upload useragent mobile desktop edit modal',
      (card) => {
        const form = document.createElement('div');
        form.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
        const row1 = document.createElement('div');
        row1.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;min-width:0;';
        const nameIn = document.createElement('input');
        nameIn.type = 'text';
        nameIn.id = 'input-custom-app-name';
        nameIn.className = 'fh-input';
        nameIn.placeholder = 'Website Name (e.g. Linear, Threads)';
        nameIn.style.cssText = 'flex:1;min-width:0;';
        const clrIn = document.createElement('input');
        clrIn.type = 'color';
        clrIn.id = 'input-custom-app-color';
        clrIn.value = '#D96B43';
        clrIn.style.cssText = 'width:36px;height:32px;border:none;background:none;cursor:pointer;padding:0;';
        row1.appendChild(nameIn);
        row1.appendChild(clrIn);

        const row2 = document.createElement('div');
        row2.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
        const urlIn = document.createElement('input');
        urlIn.type = 'url';
        urlIn.id = 'input-custom-app-url';
        urlIn.className = 'fh-input';
        urlIn.placeholder = 'https://…';
        urlIn.style.cssText = 'flex:1;min-width:140px;';
        const uaSel = document.createElement('select');
        uaSel.className = 'fh-select';
        uaSel.style.width = 'auto';
        [
          ['default', 'Default UA'],
          ['mobile', 'Mobile UA'],
          ['desktop', 'Desktop UA']
        ].forEach(([v, txt]) => {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = txt;
          uaSel.appendChild(o);
        });
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.id = 'btn-add-custom-app';
        addBtn.className = 'fh-btn fh-btn-primary fh-btn-xs';
        addBtn.textContent = 'Add to Sidebar';

        addBtn.addEventListener('click', async () => {
          const apis = getApis();
          const nm = nameIn.value.trim();
          let u = urlIn.value.trim();
          if (!nm || !u) {
            notifyToast('Enter both a Name and URL (https://…)');
            return;
          }
          if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = `https://${u}`;
          try {
            const parsed = new URL(u);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('bad protocol');
          } catch (_) {
            notifyToast('Only http:// or https:// URLs are supported');
            return;
          }
          addBtn.disabled = true;
          addBtn.textContent = 'Adding…';
          let iconUrl = '';
          if (apis.media?.fetchWebsiteIconFromHtml) {
            try { iconUrl = await apis.media.fetchWebsiteIconFromHtml(u); } catch (_) {}
          }
          iconUrl = isSafeCustomIconRef(iconUrl) ? String(iconUrl || '').trim() : '';
          addBtn.disabled = false;
          addBtn.textContent = 'Add to Sidebar';
          const customs = Array.isArray(getSettings().customMediaApps) ? [...getSettings().customMediaApps] : [];
          customs.push({
            id: `custom-${Date.now()}`,
            name: nm,
            url: u,
            color: clrIn.value || '#D96B43',
            iconUrl,
            enabled: true,
            userAgentMode: uaSel.value || 'default'
          });
          await savePatch({ customMediaApps: customs }, `Added ${nm} to sidebar`);
          nameIn.value = '';
          urlIn.value = '';
          uaSel.value = 'default';
          syncAllSections();
        });

        row2.appendChild(urlIn);
        row2.appendChild(uaSel);
        row2.appendChild(addBtn);
        form.appendChild(row1);
        form.appendChild(row2);
        card.appendChild(form);

        const listEl = document.createElement('div');
        listEl.id = 'pm-custom-apps-list';
        listEl.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
        card.appendChild(listEl);

        const updateCustomList = () => {
          const apis = getApis();
          const s = getSettings();
          const customs = Array.isArray(s.customMediaApps) ? s.customMediaApps : [];
          const mapped = apis.media?.mapCustomApps ? apis.media.mapCustomApps(s) : customs;
          const sig = customs
            .map((c, i) => `${c.id || 'custom-' + i}:${c.name}:${c.url}:${c.color}:${c.iconUrl || ''}:${c.userAgentMode || 'default'}`)
            .join('|') || '__empty__';

          if (listEl.dataset.renderSig === sig) return;

          listEl.replaceChildren();
          if (customs.length === 0) {
            const p = document.createElement('p');
            p.className = 'fh-card-desc';
            p.textContent = 'No custom websites added yet.';
            listEl.appendChild(p);
            listEl.dataset.renderSig = sig;
            return;
          }
          customs.forEach((c, idx) => {
            const appId = c.id || `custom-${idx}`;
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 10px;border-radius:10px;border:1px solid var(--border-color);background:var(--card-bg-solid, var(--bg-base));';

            const left = document.createElement('div');
            left.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;flex:1;';
            const ic = document.createElement('span');
            ic.className = 'fh-app-icon-box';
            ic.style.background = c.color || '#6C63FF';
            if (apis.media) ic.appendChild(apis.media.createAppSvgIcon(appId, 14, mapped));
            const info = document.createElement('div');
            info.style.minWidth = '0';
            const nm = document.createElement('div');
            nm.className = 'fh-app-name';
            nm.textContent = c.name || 'Custom App';
            const urlTxt = document.createElement('div');
            urlTxt.className = 'fh-row-sub';
            urlTxt.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            urlTxt.textContent = c.url || '';
            info.appendChild(nm);
            info.appendChild(urlTxt);
            left.appendChild(ic);
            left.appendChild(info);

            const right = document.createElement('div');
            right.style.cssText = 'display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;';
            if (c.userAgentMode && c.userAgentMode !== 'default') {
              const uaBadge = document.createElement('span');
              uaBadge.className = 'fh-badge-pill is-accent';
              uaBadge.textContent = c.userAgentMode === 'mobile' ? 'Mobile UA' : 'Desktop UA';
              right.appendChild(uaBadge);
            }

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'fh-btn fh-btn-xs';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', () => openCustomAppEditModal(appId));
            right.appendChild(editBtn);

            const rmBtn = document.createElement('button');
            rmBtn.type = 'button';
            rmBtn.className = 'fh-btn fh-btn-xs fh-btn-danger';
            rmBtn.textContent = 'Remove';
            rmBtn.addEventListener('click', async () => {
              const curCustoms = Array.isArray(getSettings().customMediaApps) ? getSettings().customMediaApps : [];
              const nextCustoms = curCustoms.filter((item, i) => ((item && item.id) || `custom-${i}`) !== appId);
              await savePatch({ customMediaApps: nextCustoms }, `Removed ${c.name || 'custom app'}`);
              syncAllSections();
            });
            right.appendChild(rmBtn);

            row.appendChild(left);
            row.appendChild(right);
            listEl.appendChild(row);
          });
          listEl.dataset.renderSig = sig;
        };

        sectionUpdaters.push(updateCustomList);
      },
      { icon: 'grid' }
    );

    // -------------------------------------------------------------------------
    // CATEGORY 4: AUDIO, PLAYBACK & PERSISTENCE
    // -------------------------------------------------------------------------
    const audioNowPlayingCard = registerItem(
      'audio',
      'Mini "Now Playing" Bar & Left-Rail Controls',
      'mini now playing bar spotify youtube soundcloud position bottom top compact progress bar auto hide paused left rail equalizer indicator quick controls play pause mute',
      (card) => {
        const addToggleRow = (label, sub, key, defaultOn = true) => {
          const row = document.createElement('div');
          row.className = 'fh-row';
          const meta = document.createElement('div');
          meta.className = 'fh-row-meta';
          const l = document.createElement('div');
          l.className = 'fh-row-label';
          l.id = `fh-toggle-lbl-${mode}-${++toggleLabelSeq}`;
          l.textContent = label;
          const sEl = document.createElement('div');
          sEl.className = 'fh-row-sub';
          sEl.textContent = sub;
          meta.appendChild(l);
          meta.appendChild(sEl);
          const sw = makeToggleSwitch(defaultOn, (checked) => {
            savePatch({ [key]: checked }, `${label}: ${checked ? 'ON' : 'OFF'}`);
          }, { labelledBy: l.id, settingKey: key });
          row.appendChild(meta);
          row.appendChild(sw.wrap);
          card.appendChild(row);
          sectionUpdaters.push(() => {
            const val = getSettings()[key];
            sw.input.checked = defaultOn ? val !== false : val === true;
          });
        };

        addToggleRow(
          'Enable Mini "Now Playing" Bar',
          'Shows a compact playback strip while listening in the background from Mail or another app.',
          'miniNowPlayingEnabled'
        );

        const posRow = document.createElement('div');
        posRow.className = 'fh-row fh-row-stack-narrow';
        const posMeta = document.createElement('div');
        posMeta.className = 'fh-row-meta';
        const posLbl = document.createElement('div');
        posLbl.className = 'fh-row-label';
        posLbl.textContent = 'Now Playing Bar Position';
        const posSub = document.createElement('div');
        posSub.className = 'fh-row-sub';
        posSub.textContent = 'Dock the strip at the bottom or top of the FoxHub workspace.';
        posMeta.appendChild(posLbl);
        posMeta.appendChild(posSub);
        const posGroup = document.createElement('div');
        posGroup.className = 'fh-pill-group';
        const posBtns = [];
        [
          ['bottom', 'Bottom'],
          ['top', 'Top']
        ].forEach(([val, txt]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'fh-pill-btn';
          b.setAttribute('data-np-pos', val);
          b.textContent = txt;
          b.addEventListener('click', async () => {
            await savePatch({ miniNowPlayingPosition: val }, `Now Playing position: ${txt}`);
            syncAllSections();
          });
          posGroup.appendChild(b);
          posBtns.push(b);
        });
        posRow.appendChild(posMeta);
        posRow.appendChild(posGroup);
        card.appendChild(posRow);
        sectionUpdaters.push(() => {
          const curPos = getSettings().miniNowPlayingPosition || 'bottom';
          posBtns.forEach((b) => b.classList.toggle('active', b.getAttribute('data-np-pos') === curPos));
        });

        addToggleRow('Compact Strip Layout', 'Single-line ultra-slim height for narrow sidebars.', 'miniNowPlayingCompact', false);
        addToggleRow('Show Track Progress Bar', 'Display interactive seek bar & timestamps to skip parts of the song.', 'miniNowPlayingShowProgress', true);
        addToggleRow('Auto-Hide When Paused', 'Hide automatically on pause instead of staying visible with an × close button.', 'miniNowPlayingAutoHidePaused', false);
        addToggleRow('Left-Rail Equalizer Indicator', 'Show animated equalizer & track tooltip on the active music app icon.', 'railPlayingIndicatorEnabled');
        addToggleRow('Left-Rail Quick Play/Pause & Mute', 'Click the equalizer badge or middle-click the rail icon to play/pause (Shift+click to mute).', 'railQuickControlsEnabled');
      },
      { icon: 'headphones' }
    );

    const audioBgMemoryCard = registerItem(
      'audio',
      'Background Audio, Tab Auto-Pause & Persistent Memory',
      'background audio keep playing closed spotify youtube soundcloud tab audio pause resume off persistent memory eco selected all clear saved page reel positions',
      (card) => {
        // Tab Audio Behavior
        const tabRow = document.createElement('div');
        tabRow.className = 'fh-row fh-row-stack-narrow';
        const tabMeta = document.createElement('div');
        tabMeta.className = 'fh-row-meta';
        const tabLbl = document.createElement('div');
        tabLbl.className = 'fh-row-label';
        tabLbl.textContent = 'When Another Browser Tab Plays Audio / Video';
        const tabSub = document.createElement('div');
        tabSub.className = 'fh-row-sub';
        tabSub.textContent = 'Smart media handoff: automatically pause FoxHub music when a normal tab plays audio.';
        tabMeta.appendChild(tabLbl);
        tabMeta.appendChild(tabSub);
        const tabSel = document.createElement('select');
        tabSel.className = 'fh-select fh-select-compact';
        [
          ['pause-resume', 'Auto-Pause & Auto-Resume'],
          ['pause-only', 'Pause Only (Stay Stopped)'],
          ['off', 'Play Together (Off)']
        ].forEach(([v, t]) => {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = t;
          tabSel.appendChild(o);
        });
        tabSel.addEventListener('change', async () => {
          await savePatch({
            tabAudioBehavior: tabSel.value,
            autoPauseOnTabAudio: tabSel.value !== 'off'
          }, `Tab Audio Behavior: ${tabSel.options[tabSel.selectedIndex]?.textContent || tabSel.value}`);
        });
        tabRow.appendChild(tabMeta);
        tabRow.appendChild(tabSel);
        card.appendChild(tabRow);

        // Keep audio playing when closed
        const keepRow = document.createElement('div');
        keepRow.className = 'fh-row';
        const keepMeta = document.createElement('div');
        keepMeta.className = 'fh-row-meta';
        const keepLbl = document.createElement('div');
        keepLbl.className = 'fh-row-label';
        keepLbl.id = `fh-toggle-lbl-${mode}-${++toggleLabelSeq}`;
        keepLbl.textContent = 'Keep Audio Playing When Closed';
        const keepSub = document.createElement('div');
        keepSub.className = 'fh-row-sub';
        keepSub.textContent = 'Hand off Spotify, YouTube, or SoundCloud audio to background keep-alive when closing the sidebar.';
        keepMeta.appendChild(keepLbl);
        keepMeta.appendChild(keepSub);
        const keepSw = makeToggleSwitch(true, async (checked) => {
          const curMode = getSettings().persistenceMode || 'selected';
          if (checked && curMode === 'eco') {
            await savePatch({
              persistenceMode: 'selected',
              keepAudioPlayingWhenClosed: true
            }, 'Switched to Selected Apps — Background audio enabled');
          } else {
            await savePatch({ keepAudioPlayingWhenClosed: checked }, checked ? 'Background audio enabled' : 'Background audio disabled');
          }
          syncAllSections();
        }, { labelledBy: keepLbl.id, settingKey: 'keepAudioPlayingWhenClosed' });
        keepRow.appendChild(keepMeta);
        keepRow.appendChild(keepSw.wrap);
        card.appendChild(keepRow);

        // Background Audio Apps Grid
        const bgGrid = document.createElement('div');
        bgGrid.className = 'fh-grid-apps-toggle';
        card.appendChild(bgGrid);

        const spTip = document.createElement('div');
        spTip.className = 'fh-status-banner is-ok hidden';
        spTip.textContent = 'Spotify DRM Tip: Ensure Firefox Settings -> Autoplay is set to "Allow Audio and Video" so background Spotify audio resumes smoothly.';
        card.appendChild(spTip);

        // Persistence Mode
        const pRow = document.createElement('div');
        pRow.className = 'fh-row fh-row-stack-narrow';
        const pMeta = document.createElement('div');
        pMeta.className = 'fh-row-meta';
        const pLbl = document.createElement('div');
        pLbl.className = 'fh-row-label';
        pLbl.textContent = 'Persistent App Memory (Instant Restore)';
        const pSub = document.createElement('div');
        pSub.className = 'fh-row-sub';
        pMeta.appendChild(pLbl);
        pMeta.appendChild(pSub);
        const pGroup = document.createElement('div');
        pGroup.className = 'fh-pill-group';
        const pBtns = [];
        [
          ['eco', 'Eco (0 MB)'],
          ['selected', 'Selected Apps'],
          ['all', 'All Apps']
        ].forEach(([val, txt]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'fh-pill-btn';
          b.setAttribute('data-persist-mode', val);
          b.textContent = txt;
          b.addEventListener('click', async () => {
            const patch = { persistenceMode: val };
            if (val !== 'eco' && typeof options.getActiveAppId === 'function') {
              const aid = options.getActiveAppId();
              if (aid && !String(aid).startsWith('adhoc-')) {
                patch.persistentLastActiveAppId = aid;
              } else {
                const curLast = getSettings().persistentLastActiveAppId;
                if (!curLast || String(curLast).startsWith('adhoc-')) {
                  patch.persistentLastActiveAppId = 'pocketmail';
                }
              }
            }
            await savePatch(patch, `Persistence Mode: ${txt}`);
            syncAllSections();
          });
          pGroup.appendChild(b);
          pBtns.push(b);
        });
        pRow.appendChild(pMeta);
        pRow.appendChild(pGroup);
        card.appendChild(pRow);

        const pGrid = document.createElement('div');
        pGrid.className = 'fh-grid-apps-toggle';
        card.appendChild(pGrid);

        const clearMemRow = document.createElement('div');
        clearMemRow.className = 'fh-row';
        const cmLbl = document.createElement('span');
        cmLbl.className = 'fh-row-sub';
        cmLbl.textContent = 'Clear saved page, video timestamp & scroll memory across apps.';
        const cmBtn = document.createElement('button');
        cmBtn.type = 'button';
        cmBtn.className = 'fh-btn fh-btn-xs';
        cmBtn.textContent = 'Clear Saved Page & Reel Positions';
        cmBtn.addEventListener('click', async () => {
          try { window.localStorage.removeItem('pm_fast_boot_v1'); } catch (_) {}
          try { await browser.storage.local.remove('pm_page_memory_v1'); } catch (_) {}
          try { await browser.runtime.sendMessage({ type: 'CLEAR_PERSISTENT_SESSIONS' }); } catch (_) {}
          notifyToast('Cleared saved page & reel positions');
        });
        clearMemRow.appendChild(cmLbl);
        clearMemRow.appendChild(cmBtn);
        card.appendChild(clearMemRow);

        const bgCardMap = new Map();
        const pCardMap = new Map();
        let pendingBgRebuild = false;
        let pendingPRebuild = false;

        const updateBgAndPersistGrids = (syncOpts = {}) => {
          const force = Boolean(syncOpts && syncOpts.force);
          const apis = getApis();
          const s = getSettings();
          if (force || document.activeElement !== tabSel) tabSel.value = s.tabAudioBehavior || 'pause-resume';
          const pMode = s.persistenceMode || 'selected';
          keepSw.input.checked = pMode !== 'eco' && s.keepAudioPlayingWhenClosed !== false;
          pBtns.forEach((b) => b.classList.toggle('active', b.getAttribute('data-persist-mode') === pMode));
          pSub.textContent =
            pMode === 'eco'
              ? 'Eco Mode: 0 MB extra RAM when closed; unloads apps on close.'
              : pMode === 'selected'
                ? 'Selected Apps: Restores exact URL & scroll position for chosen apps.'
                : 'All Apps: Keeps all opened apps persistent across close/reopen.';

          const bgIds = Array.isArray(s.bgAudioAppIds) ? s.bgAudioAppIds : [];
          const pIds = Array.isArray(s.persistentAppIds) ? s.persistentAppIds : [];
          spTip.classList.toggle('hidden', pMode === 'eco' || !keepSw.input.checked || !bgIds.includes('spotify'));

          if (!apis.media) return;
          const allApps = [
            ...(apis.media.getOrderedBuiltInApps ? apis.media.getOrderedBuiltInApps(s) : apis.media.BUILTIN_MEDIA_APPS),
            ...(apis.media.mapCustomApps ? apis.media.mapCustomApps(s) : [])
          ];
          const customs = apis.media.mapCustomApps ? apis.media.mapCustomApps(s) : [];
          const sig = allApps.map((a) => `${a.id}:${a.name}:${a.color || ''}:${a.gradient || ''}:${a.iconUrl || ''}`).join('|');

          const syncBgCardsInPlace = () => {
            allApps.forEach((app) => {
              const refs = bgCardMap.get(app.id);
              if (!refs) return;
              const on = bgIds.includes(app.id);
              refs.btn.classList.toggle('is-active', on);
              refs.pill.className = `fh-badge-pill ${on ? 'is-on' : ''}`;
              refs.pill.textContent = on ? 'ON' : 'OFF';
            });
          };

          if (bgGrid.dataset.renderSig === sig && bgCardMap.size === allApps.length) {
            syncBgCardsInPlace();
          } else if (document.activeElement && bgGrid.contains(document.activeElement)) {
            pendingBgRebuild = true;
            syncBgCardsInPlace();
          } else {
            pendingBgRebuild = false;
            bgCardMap.clear();
            bgGrid.replaceChildren();
            allApps.forEach((app) => {
              const on = bgIds.includes(app.id);
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = `fh-mini-app-card ${on ? 'is-active' : ''}`;
              const left = document.createElement('span');
              left.className = 'fh-mini-app-left';
              const ic = document.createElement('span');
              ic.className = 'fh-app-icon-box';
              ic.style.cssText = `width:22px;height:22px;border-radius:6px;background:${app.gradient || app.color};`;
              ic.appendChild(apis.media.createAppSvgIcon(app.id, 12, customs));
              const nm = document.createElement('span');
              nm.className = 'fh-mini-app-name';
              nm.textContent = app.name;
              left.appendChild(ic);
              left.appendChild(nm);
              const pill = document.createElement('span');
              pill.className = `fh-badge-pill ${on ? 'is-on' : ''}`;
              pill.textContent = on ? 'ON' : 'OFF';
              btn.appendChild(left);
              btn.appendChild(pill);
              btn.addEventListener('click', async () => {
                const curS = getSettings();
                const curBgIds = Array.isArray(curS.bgAudioAppIds) ? curS.bgAudioAppIds : [];
                const curPIds = Array.isArray(curS.persistentAppIds) ? curS.persistentAppIds : [];
                const curPMode = curS.persistenceMode || 'selected';
                const curOn = curBgIds.includes(app.id);
                const nextBg = curOn ? curBgIds.filter((x) => x !== app.id) : [...curBgIds, app.id];
                const patch = { bgAudioAppIds: nextBg };
                if (!curOn) {
                  patch.keepAudioPlayingWhenClosed = true;
                  if (curPMode === 'eco') patch.persistenceMode = 'selected';
                  if (!curPIds.includes(app.id)) patch.persistentAppIds = [...curPIds, app.id];
                }
                await savePatch(patch, `${app.name}: Bg Audio ${curOn ? 'OFF' : 'ON'}`);
                syncAllSections();
              });
              bgGrid.appendChild(btn);
              bgCardMap.set(app.id, { btn, pill });
            });
            bgGrid.dataset.renderSig = sig;
          }

          pGrid.classList.toggle('hidden', pMode !== 'selected');
          if (pMode === 'selected') {
            const syncPCardsInPlace = () => {
              allApps.forEach((app) => {
                const refs = pCardMap.get(app.id);
                if (!refs) return;
                const on = pIds.includes(app.id);
                refs.btn.classList.toggle('is-active', on);
                refs.pill.className = `fh-badge-pill ${on ? 'is-accent' : ''}`;
                refs.pill.textContent = on ? 'ON' : 'OFF';
              });
            };

            if (pGrid.dataset.renderSig === sig && pCardMap.size === allApps.length) {
              syncPCardsInPlace();
            } else if (document.activeElement && pGrid.contains(document.activeElement)) {
              pendingPRebuild = true;
              syncPCardsInPlace();
            } else {
              pendingPRebuild = false;
              pCardMap.clear();
              pGrid.replaceChildren();
              allApps.forEach((app) => {
                const on = pIds.includes(app.id);
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `fh-mini-app-card ${on ? 'is-active' : ''}`;
                const left = document.createElement('span');
                left.className = 'fh-mini-app-left';
                const ic = document.createElement('span');
                ic.className = 'fh-app-icon-box';
                ic.style.cssText = `width:22px;height:22px;border-radius:6px;background:${app.gradient || app.color};`;
                ic.appendChild(apis.media.createAppSvgIcon(app.id, 12, customs));
                const nm = document.createElement('span');
                nm.className = 'fh-mini-app-name';
                nm.textContent = app.name;
                left.appendChild(ic);
                left.appendChild(nm);
                const pill = document.createElement('span');
                pill.className = `fh-badge-pill ${on ? 'is-accent' : ''}`;
                pill.textContent = on ? 'ON' : 'OFF';
                btn.appendChild(left);
                btn.appendChild(pill);
                btn.addEventListener('click', async () => {
                  const curS = getSettings();
                  const curPIds = Array.isArray(curS.persistentAppIds) ? curS.persistentAppIds : [];
                  const curOn = curPIds.includes(app.id);
                  const nextP = curOn ? curPIds.filter((x) => x !== app.id) : [...curPIds, app.id];
                  await savePatch({ persistentAppIds: nextP }, `${app.name} persistence ${curOn ? 'OFF' : 'ON'}`);
                  syncAllSections();
                });
                pGrid.appendChild(btn);
                pCardMap.set(app.id, { btn, pill });
              });
              pGrid.dataset.renderSig = sig;
            }
          }
        };

        bgGrid.addEventListener('focusout', () => {
          setTimeout(() => {
            if (!destroyed && pendingBgRebuild && !(document.activeElement && bgGrid.contains(document.activeElement))) {
              pendingBgRebuild = false;
              updateBgAndPersistGrids();
            }
          }, 0);
        });
        pGrid.addEventListener('focusout', () => {
          setTimeout(() => {
            if (!destroyed && pendingPRebuild && !(document.activeElement && pGrid.contains(document.activeElement))) {
              pendingPRebuild = false;
              updateBgAndPersistGrids();
            }
          }, 0);
        });

        sectionUpdaters.push(updateBgAndPersistGrids);
      },
      { icon: 'headphones' }
    );

    const audioMuteChimesCard = registerItem(
      'audio',
      'Quick Mute Timers, Notification Chimes & Voice (TTS)',
      'mute all email sites timer 15m 1h 3h 8h desktop notifications voice tts chime sound volume custom audio upload',
      (card) => {
        const addBool = (label, sub, onGet, onSet, isTimerDependent = false) => {
          const row = document.createElement('div');
          row.className = 'fh-row';
          const meta = document.createElement('div');
          meta.className = 'fh-row-meta';
          const l = document.createElement('div');
          l.className = 'fh-row-label';
          l.id = `fh-toggle-lbl-${mode}-${++toggleLabelSeq}`;
          l.textContent = label;
          const sEl = document.createElement('div');
          sEl.className = 'fh-row-sub';
          sEl.textContent = sub;
          meta.appendChild(l);
          meta.appendChild(sEl);
          const sw = makeToggleSwitch(false, onSet, { labelledBy: l.id });
          row.appendChild(meta);
          row.appendChild(sw.wrap);
          card.appendChild(row);
          const syncSwitch = (syncOpts = {}) => {
            const force = Boolean(syncOpts && syncOpts.force);
            if (force || document.activeElement !== sw.input) {
              sw.input.checked = Boolean(onGet(getSettings()));
            }
          };
          sectionUpdaters.push(syncSwitch);
          if (isTimerDependent) {
            muteTimerUpdaters.push(syncSwitch);
          }
        };

        addBool(
          'Mute All Notifications',
          'Silence both Email and Sites notifications simultaneously.',
          (s) => {
            const now = Date.now();
            const em = Boolean(s.muteEmailNotifications || (s.dndUntil && s.dndUntil > now));
            const st = Boolean(s.muteSiteNotifications || s.socialAppNotifySounds === false || (s.muteSitesUntil && s.muteSitesUntil > now));
            return em && st;
          },
          async (val) => {
            await savePatch({
              muteEmailNotifications: val,
              muteSiteNotifications: val,
              socialAppNotifySounds: !val,
              dndUntil: 0,
              muteSitesUntil: 0,
              lastMuteTimerMins: 0
            }, val ? 'Muted All Notifications' : 'Unmuted All Notifications');
            if (typeof options.onBroadcastAppConfig === 'function') options.onBroadcastAppConfig('muteAndShortcuts');
            syncAllSections();
          },
          true
        );

        addBool(
          'Mute Email Notifications',
          'Silence desktop email popups, chimes, and voice announcements.',
          (s) => Boolean(s.muteEmailNotifications || (s.dndUntil && s.dndUntil > Date.now())),
          async (val) => {
            await savePatch({ muteEmailNotifications: val, dndUntil: 0 }, val ? 'Muted Email Notifications' : 'Unmuted Email Notifications');
            syncAllSections();
          },
          true
        );

        addBool(
          'Mute Sites Notifications',
          'Silence social/messenger chimes and suppress embedded site notifications.',
          (s) => Boolean(s.muteSiteNotifications || s.socialAppNotifySounds === false || (s.muteSitesUntil && s.muteSitesUntil > Date.now())),
          async (val) => {
            await savePatch({
              muteSiteNotifications: val,
              socialAppNotifySounds: !val,
              muteSitesUntil: 0
            }, val ? 'Muted Sites Notifications' : 'Unmuted Sites Notifications');
            if (typeof options.onBroadcastAppConfig === 'function') options.onBroadcastAppConfig('muteAndShortcuts');
            syncAllSections();
          },
          true
        );

        // Timed Mute Row
        const timerRow = document.createElement('div');
        timerRow.className = 'fh-row fh-row-stack-narrow';
        const timerMeta = document.createElement('div');
        timerMeta.className = 'fh-row-meta';
        const timerLbl = document.createElement('div');
        timerLbl.className = 'fh-row-label';
        const timerStatus = document.createElement('span');
        timerStatus.style.cssText = 'margin-left:6px;font-size:11px;color:var(--accent);';
        timerLbl.textContent = 'Mute Timer';
        timerLbl.appendChild(timerStatus);
        const timerSub = document.createElement('div');
        timerSub.className = 'fh-row-sub';
        timerSub.textContent = 'Temporarily silence notifications and automatically resume.';
        timerMeta.appendChild(timerLbl);
        timerMeta.appendChild(timerSub);

        const timerBtnsWrap = document.createElement('div');
        timerBtnsWrap.className = 'fh-pill-group';
        const timerPills = [];
        [
          [15, '15m'],
          [60, '1h'],
          [180, '3h'],
          [480, '8h']
        ].forEach(([mins, txt]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'fh-pill-btn';
          b.setAttribute('data-mute-mins', String(mins));
          b.textContent = txt;
          b.addEventListener('click', async () => {
            const until = Date.now() + mins * 60 * 1000;
            await savePatch({
              muteEmailNotifications: false,
              muteSiteNotifications: false,
              socialAppNotifySounds: true,
              dndUntil: until,
              muteSitesUntil: until,
              lastMuteTimerMins: mins
            }, `Muted notifications for ${txt}`);
            if (typeof options.onBroadcastAppConfig === 'function') options.onBroadcastAppConfig('muteAndShortcuts');
            syncAllSections();
          });
          timerBtnsWrap.appendChild(b);
          timerPills.push(b);
        });
        const clearTimerBtn = document.createElement('button');
        clearTimerBtn.type = 'button';
        clearTimerBtn.className = 'fh-pill-btn hidden';
        clearTimerBtn.textContent = 'Clear';
        clearTimerBtn.addEventListener('click', async () => {
          await savePatch({ dndUntil: 0, muteSitesUntil: 0, lastMuteTimerMins: 0 }, 'Cleared mute timer');
          if (typeof options.onBroadcastAppConfig === 'function') options.onBroadcastAppConfig('muteAndShortcuts');
          syncAllSections();
        });
        timerBtnsWrap.appendChild(clearTimerBtn);
        timerRow.appendChild(timerMeta);
        timerRow.appendChild(timerBtnsWrap);
        card.appendChild(timerRow);

        const updateTimerDisplay = () => {
          const s = getSettings();
          const now = Date.now();
          const maxUntil = Math.max(
            s.dndUntil && s.dndUntil > now ? s.dndUntil : 0,
            s.muteSitesUntil && s.muteSitesUntil > now ? s.muteSitesUntil : 0
          );
          timerStatus.textContent = maxUntil > now ? `(${formatMuteTimerRemaining(maxUntil)})` : '';
          clearTimerBtn.classList.toggle('hidden', !(maxUntil > now));
          const activeMins = maxUntil > now ? Number(s.lastMuteTimerMins || 0) : 0;
          timerPills.forEach((p) => {
            p.classList.toggle('active', maxUntil > now && parseInt(p.getAttribute('data-mute-mins'), 10) === activeMins);
          });
        };
        sectionUpdaters.push(updateTimerDisplay);
        muteTimerUpdaters.push(updateTimerDisplay);

        addBool(
          'Desktop Popup Notifications',
          'Show a native Firefox notification when brand-new unread mail arrives.',
          (s) => s.desktopNotifications !== false,
          (val) => savePatch({ desktopNotifications: val }, `Desktop notifications ${val ? 'enabled' : 'disabled'}`)
        );
        addBool(
          'Speak New Emails Aloud (TTS)',
          'Automatically announce sender and subject for brand-new unread mail.',
          (s) => Boolean(s.voiceNotifications),
          (val) => savePatch({ voiceNotifications: val }, `Voice alerts ${val ? 'enabled' : 'disabled'}`)
        );

        // Chime Picker + Volume + Upload + Test
        const chimeRow = document.createElement('div');
        chimeRow.className = 'fh-row fh-row-stack-narrow';
        const chimeMeta = document.createElement('div');
        chimeMeta.className = 'fh-row-meta';
        const chimeLbl = document.createElement('div');
        chimeLbl.className = 'fh-row-label';
        chimeLbl.textContent = 'Notification Sound Chime & Volume';
        chimeMeta.appendChild(chimeLbl);

        const chimeCtrls = document.createElement('div');
        chimeCtrls.className = 'fh-row-ctrl fh-row-ctrl-wrap';
        const chimeSel = document.createElement('select');
        chimeSel.className = 'fh-select';
        chimeSel.style.cssText = 'flex:1;min-width:140px;';
        const apisInit = getApis();
        if (apisInit.sound?.SOUND_PRESETS) {
          Object.values(apisInit.sound.SOUND_PRESETS).forEach((p) => {
            const o = document.createElement('option');
            o.value = p.id;
            o.textContent = p.name;
            chimeSel.appendChild(o);
          });
        }
        chimeSel.addEventListener('change', async () => {
          const apis = getApis();
          await savePatch({ soundId: chimeSel.value }, `Chime: ${chimeSel.options[chimeSel.selectedIndex]?.textContent || chimeSel.value}`);
          if (apis.sound) apis.sound.playNotificationSound(chimeSel.value, getSettings().soundVolume, getSettings().customAudioData);
        });
        const previewChimeBtn = document.createElement('button');
        previewChimeBtn.type = 'button';
        previewChimeBtn.className = 'fh-btn fh-btn-xs';
        previewChimeBtn.textContent = 'Preview';
        previewChimeBtn.addEventListener('click', () => {
          const apis = getApis();
          const s = getSettings();
          if (apis.sound) apis.sound.playNotificationSound(s.soundId || 'marimba', s.soundVolume, s.customAudioData);
        });
        const uploadChimeLbl = document.createElement('label');
        uploadChimeLbl.className = 'fh-btn fh-btn-xs';
        uploadChimeLbl.style.cursor = 'pointer';
        uploadChimeLbl.textContent = 'Upload Audio…';
        const audioFileIn = document.createElement('input');
        audioFileIn.type = 'file';
        audioFileIn.accept = 'audio/*';
        audioFileIn.hidden = true;
        audioFileIn.addEventListener('change', (ev) => {
          const f = ev.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = async () => {
            if (typeof r.result === 'string') {
              await savePatch({ soundId: 'custom', customAudioData: r.result }, `Uploaded custom sound: ${f.name}`);
              syncAllSections();
            }
          };
          r.readAsDataURL(f);
        });
        uploadChimeLbl.appendChild(audioFileIn);

        const testNotifBtn = document.createElement('button');
        testNotifBtn.type = 'button';
        testNotifBtn.className = 'fh-btn fh-btn-xs fh-btn-primary';
        testNotifBtn.textContent = 'Test Alert';
        testNotifBtn.addEventListener('click', async () => {
          const apis = getApis();
          const s = getSettings();
          if (apis.sound) apis.sound.playNotificationSound(s.soundId, s.soundVolume, s.customAudioData);
          await browser.runtime.sendMessage({ type: 'SYNC_NOW', forceTestNotification: true }).catch(() => {});
          notifyToast('Sent test notification & chime');
        });

        chimeCtrls.appendChild(chimeSel);
        chimeCtrls.appendChild(previewChimeBtn);
        chimeCtrls.appendChild(uploadChimeLbl);
        chimeCtrls.appendChild(testNotifBtn);
        chimeRow.appendChild(chimeMeta);
        chimeRow.appendChild(chimeCtrls);
        card.appendChild(chimeRow);

        const volWrap = document.createElement('div');
        volWrap.className = 'fh-slider-wrap';
        const volHead = document.createElement('div');
        volHead.className = 'fh-slider-head';
        const volLbl = document.createElement('span');
        volLbl.textContent = 'Chime Volume';
        const volVal = document.createElement('strong');
        volHead.appendChild(volLbl);
        volHead.appendChild(volVal);
        const volIn = document.createElement('input');
        volIn.type = 'range';
        volIn.className = 'fh-range';
        volIn.min = '0';
        volIn.max = '1';
        volIn.step = '0.05';
        volIn.addEventListener('input', () => {
          const v = parseFloat(volIn.value);
          volVal.textContent = `${Math.round(v * 100)}%`;
          savePatch({ soundVolume: v });
        });
        volWrap.appendChild(volHead);
        volWrap.appendChild(volIn);
        card.appendChild(volWrap);

        // TTS Voice + Rate + Test
        const ttsRow = document.createElement('div');
        ttsRow.className = 'fh-row fh-row-stack-narrow';
        const ttsMeta = document.createElement('div');
        ttsMeta.className = 'fh-row-meta';
        const ttsLbl = document.createElement('div');
        ttsLbl.className = 'fh-row-label';
        ttsLbl.textContent = 'Voice Reader (TTS) Voice & Speed';
        ttsMeta.appendChild(ttsLbl);
        const ttsCtrls = document.createElement('div');
        ttsCtrls.className = 'fh-row-ctrl fh-row-ctrl-wrap';
        const voiceSel = document.createElement('select');
        voiceSel.className = 'fh-select';
        voiceSel.style.cssText = 'flex:1;min-width:130px;';
        const populateVoices = () => {
          const voices = typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : [];
          voiceSel.replaceChildren();
          const def = document.createElement('option');
          def.value = '';
          def.textContent = 'Browser Default Voice';
          voiceSel.appendChild(def);
          voices.forEach((v) => {
            const o = document.createElement('option');
            o.value = v.name;
            o.textContent = `${v.name} (${v.lang})`;
            voiceSel.appendChild(o);
          });
          voiceSel.value = getSettings().ttsVoice || '';
        };
        populateVoices();
        if (typeof speechSynthesis !== 'undefined') {
          speechSynthesis.onvoiceschanged = populateVoices;
        }
        voiceSel.addEventListener('change', () => savePatch({ ttsVoice: voiceSel.value }, 'Updated reading voice'));

        const rateSel = document.createElement('select');
        rateSel.className = 'fh-select';
        rateSel.style.width = 'auto';
        [0.75, 0.9, 1.0, 1.15, 1.3, 1.5].forEach((r) => {
          const o = document.createElement('option');
          o.value = String(r);
          o.textContent = `${r.toFixed(2)}x`;
          rateSel.appendChild(o);
        });
        rateSel.addEventListener('change', () => savePatch({ ttsRate: parseFloat(rateSel.value) }, `Reading speed: ${rateSel.value}x`));

        const testTtsBtn = document.createElement('button');
        testTtsBtn.type = 'button';
        testTtsBtn.className = 'fh-btn fh-btn-xs';
        testTtsBtn.textContent = 'Test Voice';
        testTtsBtn.addEventListener('click', () => {
          const apis = getApis();
          if (apis.sound?.speakEmail) {
            apis.sound.speakEmail(
              { senderName: 'FoxHub', subject: 'Local voice reading sample', snippet: 'Your emails are always read locally in Firefox.' },
              getSettings(),
              () => {}
            );
          }
        });
        ttsCtrls.appendChild(voiceSel);
        ttsCtrls.appendChild(rateSel);
        ttsCtrls.appendChild(testTtsBtn);
        ttsRow.appendChild(ttsMeta);
        ttsRow.appendChild(ttsCtrls);
        card.appendChild(ttsRow);

        sectionUpdaters.push((syncOpts = {}) => {
          const force = Boolean(syncOpts && syncOpts.force);
          const s = getSettings();
          if (force || document.activeElement !== chimeSel) chimeSel.value = s.soundId || 'marimba';
          const vol = s.soundVolume !== undefined ? s.soundVolume : 0.75;
          if (force || document.activeElement !== volIn) volIn.value = String(vol);
          volVal.textContent = `${Math.round(vol * 100)}%`;
          if (force || document.activeElement !== voiceSel) voiceSel.value = s.ttsVoice || '';
          const rate = s.ttsRate !== undefined ? Number(s.ttsRate) : 1.0;
          if (force || document.activeElement !== rateSel) rateSel.value = String(rate);
        });
      },
      { icon: 'headphones' }
    );

    // Tucked-away Advanced Diagnostics Accordion (<details> collapsed by default)
    const diagDetails = registerItem(
      'audio',
      'Advanced Audio & Widevine Diagnostics',
      'diagnostics mse widevine live audio log debug buffer event copy clear',
      (details, setTitleEl) => {
        details.className = 'fh-diag-details';
        const summary = document.createElement('summary');
        summary.className = 'fh-diag-summary';
        const sumLeft = document.createElement('span');
        sumLeft.style.cssText = 'display:inline-flex;align-items:center;gap:6px;';
        const titleSpan = document.createElement('span');
        titleSpan.className = 'fh-item-title-text';
        titleSpan.textContent = 'Advanced Audio & Widevine Diagnostics';
        setTitleEl(titleSpan);
        const badge = document.createElement('span');
        badge.className = 'fh-badge-pill';
        badge.textContent = 'MSE / Tab-Audio';
        sumLeft.appendChild(titleSpan);
        sumLeft.appendChild(badge);
        const chev = createSvg('chevron-down', 14);
        summary.appendChild(sumLeft);
        summary.appendChild(chev);

        const body = document.createElement('div');
        body.className = 'fh-diag-body';
        const btnBar = document.createElement('div');
        btnBar.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.id = 'btn-toggle-audio-log';
        toggleBtn.className = 'fh-btn fh-btn-xs';
        const toggleLbl = document.createElement('span');
        toggleLbl.id = 'lbl-toggle-audio-log';
        toggleLbl.textContent = 'View Live Log';
        toggleBtn.appendChild(toggleLbl);

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.id = 'btn-clear-audio-log';
        clearBtn.className = 'fh-btn fh-btn-xs hidden';
        clearBtn.textContent = 'Clear';

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.id = 'btn-copy-audio-diagnostics';
        copyBtn.className = 'fh-btn fh-btn-xs';
        copyBtn.textContent = 'Copy Audio Diagnostics';

        const logPanel = document.createElement('div');
        logPanel.id = 'pm-live-audio-log-panel';
        logPanel.className = 'fh-diag-log-panel hidden';

        const copyDiagnostics = async () => {
          try {
            const res = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' }).catch(() => null);
            const frames = typeof options.getMediaFramesSnapshot === 'function' ? options.getMediaFramesSnapshot() : {};
            const payload = {
              ...(res && res.diagnostics ? res.diagnostics : { error: 'Background diagnostics unavailable' }),
              uiState: {
                activeAppId: typeof options.getActiveAppId === 'function' ? options.getActiveAppId() : '',
                frames
              }
            };
            await copyTextToClipboard(JSON.stringify(payload, null, 2));
            notifyToast('Copied audio diagnostics JSON to clipboard!');
            return payload;
          } catch (_) {
            notifyToast('Could not copy diagnostics');
            return null;
          }
        };

        const renderLiveLog = async () => {
          if (destroyed) return;
          if (!logPanel || logPanel.classList.contains('hidden')) {
            if (liveAudioLogTimer) {
              clearInterval(liveAudioLogTimer);
              liveAudioLogTimer = null;
            }
            return;
          }
          if (!logPanel.offsetParent && typeof window.__pmForceRenderAudioLog !== 'boolean') {
            if (liveAudioLogTimer) {
              clearInterval(liveAudioLogTimer);
              liveAudioLogTimer = null;
            }
            return;
          }
          try {
            const res = await browser.runtime.sendMessage({ type: 'GET_AUDIO_DIAGNOSTICS' });
            const diag = res && res.diagnostics ? res.diagnostics : null;
            const frag = document.createDocumentFragment();
            const summaryRow = document.createElement('div');
            summaryRow.style.cssText = 'padding-bottom:5px;margin-bottom:5px;border-bottom:1px solid rgba(255,255,255,0.1);color:#82aaff;font-weight:600;word-break:break-word;';
            if (diag) {
              const sp = diag.activePlayers?.spotify || null;
              const spStr = sp ? `sp#${sp.id}(t=${sp.currentTime}s paused=${sp.paused} lic=${sp.hasLicense})` : 'none';
              summaryRow.textContent = `Audible: ${diag.audibleAppId || 'none'} | Active: ${spStr} | TabAutoPause: ${Boolean(diag.isAutoPausedByTabAudio)}`;
            } else {
              summaryRow.textContent = 'Diagnostics snapshot unavailable.';
            }
            frag.appendChild(summaryRow);

            const events = diag && Array.isArray(diag.recentEvents) ? diag.recentEvents.slice().reverse() : [];
            if (events.length === 0) {
              const emptyRow = document.createElement('div');
              emptyRow.style.color = '#8b95a5';
              emptyRow.textContent = 'No audio events recorded yet.';
              frag.appendChild(emptyRow);
            } else {
              events.slice(0, 80).forEach((ev) => {
                const r = document.createElement('div');
                r.style.cssText = 'padding:1.5px 0;border-bottom:1px solid rgba(255,255,255,0.04);word-break:break-word;';
                const tSpan = document.createElement('span');
                tSpan.style.color = '#7f8c98';
                const isoStr = typeof ev.iso === 'string' && ev.iso.includes('T') ? ev.iso.split('T')[1].replace('Z', '') : '';
                tSpan.textContent = `${isoStr || String(ev.ts || '')} `;
                const nSpan = document.createElement('span');
                nSpan.style.fontWeight = '700';
                nSpan.style.color = '#1ed760';
                nSpan.textContent = `[${String(ev.event || 'event')}] `;
                const dSpan = document.createElement('span');
                dSpan.textContent = Object.keys(ev)
                  .filter((k) => k !== 'ts' && k !== 'iso' && k !== 'event')
                  .map((k) => `${k}=${typeof ev[k] === 'object' ? JSON.stringify(ev[k]) : String(ev[k])}`)
                  .join(' ');
                r.appendChild(tSpan);
                r.appendChild(nSpan);
                r.appendChild(dSpan);
                frag.appendChild(r);
              });
            }
            logPanel.replaceChildren(frag);
          } catch (_) {}
        };

        diagLogPanelRef = logPanel;
        renderLiveAudioLogRef = renderLiveLog;
        if (mode === 'drawer') {
          window.__pmCopyAudioDiagnostics = copyDiagnostics;
          window.__pmRenderLiveAudioDiagnosticsPanel = renderLiveLog;
        }

        copyBtn.addEventListener('click', copyDiagnostics);
        toggleBtn.addEventListener('click', () => {
          liveAudioLogVisible = !liveAudioLogVisible;
          logPanel.classList.toggle('hidden', !liveAudioLogVisible);
          clearBtn.classList.toggle('hidden', !liveAudioLogVisible);
          toggleLbl.textContent = liveAudioLogVisible ? 'Hide Live Log' : 'View Live Log';
          if (liveAudioLogTimer) {
            clearInterval(liveAudioLogTimer);
            liveAudioLogTimer = null;
          }
          if (liveAudioLogVisible) {
            renderLiveLog();
            if (mode === 'options' || logPanel.offsetParent || typeof window.__pmForceRenderAudioLog === 'boolean') {
              liveAudioLogTimer = setInterval(renderLiveLog, 1000);
            }
          }
        });
        clearBtn.addEventListener('click', async () => {
          await browser.runtime.sendMessage({ type: 'CLEAR_AUDIO_DIAGNOSTICS' }).catch(() => {});
          await renderLiveLog();
          notifyToast('Cleared audio diagnostics log');
        });

        btnBar.appendChild(toggleBtn);
        btnBar.appendChild(clearBtn);
        btnBar.appendChild(copyBtn);
        body.appendChild(btnBar);
        body.appendChild(logPanel);
        details.appendChild(summary);
        details.appendChild(body);
      },
      { tag: 'details', className: 'fh-diag-details', omitDefaultHeader: true, isDiag: true }
    );

    // -------------------------------------------------------------------------
    // CATEGORY 5: SHORTCUTS, NAVIGATION & CONTEXT MENUS
    // -------------------------------------------------------------------------
    const navShortcutsCard = registerItem(
      'navigation',
      'Keyboard Shortcuts & Quick Switcher (Ctrl+K)',
      'shortcuts hotkeys global popup sidebar popout quick switcher ctrl+k mail inbox foxhub reset defaults',
      (card) => {
        const rows = [
          { scope: 'global', key: 'popup', label: 'Floating Dropdown Popup', def: 'Alt+Shift+F' },
          { scope: 'global', key: 'sidebar', label: 'Firefox Left Sidebar', def: 'Alt+Shift+M' },
          { scope: 'global', key: 'popout', label: 'Desktop Popout Window', def: 'Alt+Shift+W' },
          { scope: 'app', key: 'pocketmail', label: 'Open Mail Inbox Directly', def: '' }
        ];
        rows.forEach((r) => {
          const row = document.createElement('div');
          row.className = 'fh-row';
          const lbl = document.createElement('div');
          lbl.className = 'fh-row-label';
          lbl.textContent = r.label;
          const ctrl = document.createElement('div');
          ctrl.className = 'fh-row-ctrl';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'fh-shortcut-btn';
          btn.setAttribute('data-sc-scope', r.scope);
          btn.setAttribute('data-sc-key', r.key);
          bindShortcutButton(btn, r.scope, r.key, r.label);
          ctrl.appendChild(btn);

          if (r.scope === 'app') {
            const clr = document.createElement('button');
            clr.type = 'button';
            clr.className = 'fh-btn fh-btn-xs hidden';
            clr.textContent = '×';
            clr.title = `Clear ${r.label} shortcut`;
            clr.addEventListener('click', async () => {
              const cur = getSettings();
              const nextApps = { ...(cur.appShortcuts || {}) };
              delete nextApps[r.key];
              await applyShortcutUpdate(cur.globalShortcuts, nextApps, cur.appShortcutOpenMode, cur.quickSwitcherEnabled, cur.quickSwitcherShortcut, `Cleared ${r.label} shortcut`);
            });
            ctrl.appendChild(clr);
            sectionUpdaters.push(() => {
              const v = String((getSettings().appShortcuts || {})[r.key] || '').trim();
              if (!btn.classList.contains('is-recording')) {
                btn.textContent = v || 'Set Shortcut';
                btn.classList.toggle('has-shortcut', Boolean(v));
              }
              clr.classList.toggle('hidden', !v);
            });
          } else {
            sectionUpdaters.push(() => {
              const v = String((getSettings().globalShortcuts || {})[r.key] || r.def || '').trim();
              if (!btn.classList.contains('is-recording')) {
                btn.textContent = v || 'Unassigned';
                btn.classList.toggle('has-shortcut', Boolean(v));
              }
            });
          }
          row.appendChild(lbl);
          row.appendChild(ctrl);
          card.appendChild(row);
        });

        // Quick Switcher Enable + Shortcut
        const qsEnRow = document.createElement('div');
        qsEnRow.className = 'fh-row';
        const qsMeta = document.createElement('div');
        qsMeta.className = 'fh-row-meta';
        const qsLbl = document.createElement('div');
        qsLbl.className = 'fh-row-label';
        qsLbl.id = `fh-toggle-lbl-${mode}-${++toggleLabelSeq}`;
        qsLbl.textContent = 'Enable Quick Switcher Spotlight';
        const qsSub = document.createElement('div');
        qsSub.className = 'fh-row-sub';
        qsSub.textContent = 'Jump to apps, open ad-hoc URLs, or toggle Night Mode & Mute via keyboard.';
        qsMeta.appendChild(qsLbl);
        qsMeta.appendChild(qsSub);
        const qsSw = makeToggleSwitch(true, async (checked) => {
          const cur = getSettings();
          await applyShortcutUpdate(cur.globalShortcuts, cur.appShortcuts, cur.appShortcutOpenMode, checked, cur.quickSwitcherShortcut, `Quick Switcher ${checked ? 'enabled' : 'disabled'}`);
        }, { labelledBy: qsLbl.id, settingKey: 'quickSwitcherEnabled' });
        qsEnRow.appendChild(qsMeta);
        qsEnRow.appendChild(qsSw.wrap);
        card.appendChild(qsEnRow);

        const qsScRow = document.createElement('div');
        qsScRow.className = 'fh-row';
        const qsScLbl = document.createElement('div');
        qsScLbl.className = 'fh-row-label';
        qsScLbl.textContent = 'Quick Switcher Shortcut';
        const qsScBtn = document.createElement('button');
        qsScBtn.type = 'button';
        qsScBtn.className = 'fh-shortcut-btn has-shortcut';
        qsScBtn.setAttribute('data-sc-scope', 'quickSwitcher');
        bindShortcutButton(qsScBtn, 'quickSwitcher', 'quickSwitcherShortcut', 'Quick Switcher');
        qsScRow.appendChild(qsScLbl);
        qsScRow.appendChild(qsScBtn);
        card.appendChild(qsScRow);

        // App Hotkey Open Mode + Reset Defaults
        const openModeRow = document.createElement('div');
        openModeRow.className = 'fh-row fh-row-stack-narrow';
        const omLbl = document.createElement('div');
        omLbl.className = 'fh-row-label';
        omLbl.textContent = 'App Hotkeys Open In';
        const omCtrls = document.createElement('div');
        omCtrls.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
        const omSel = document.createElement('select');
        omSel.className = 'fh-select';
        omSel.style.width = 'auto';
        [
          ['sidebar', 'Firefox Left Sidebar'],
          ['popup', 'Floating Popup'],
          ['popout', 'Popout Window']
        ].forEach(([v, t]) => {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = t;
          omSel.appendChild(o);
        });
        omSel.addEventListener('change', async () => {
          const cur = getSettings();
          await applyShortcutUpdate(cur.globalShortcuts, cur.appShortcuts, omSel.value, cur.quickSwitcherEnabled, cur.quickSwitcherShortcut, `App hotkeys open in: ${omSel.options[omSel.selectedIndex]?.textContent}`);
        });
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'fh-btn fh-btn-xs';
        resetBtn.textContent = 'Reset Defaults';
        resetBtn.addEventListener('click', async () => {
          cancelGlobalRecorder();
          const res = await browser.runtime.sendMessage({ type: 'RESET_KEYBOARD_SHORTCUTS' }).catch(() => null);
          if (res && res.settings && typeof options.onStateReplace === 'function') {
            options.onStateReplace({ settings: res.settings, state: getState() });
          }
          if (typeof options.onBroadcastAppConfig === 'function') options.onBroadcastAppConfig('muteAndShortcuts');
          syncAllSections();
          notifyToast('Reset shortcuts to defaults');
        });
        omCtrls.appendChild(omSel);
        omCtrls.appendChild(resetBtn);
        openModeRow.appendChild(omLbl);
        openModeRow.appendChild(omCtrls);
        card.appendChild(openModeRow);

        sectionUpdaters.push((syncOpts = {}) => {
          const force = Boolean(syncOpts && syncOpts.force);
          const s = getSettings();
          qsSw.input.checked = s.quickSwitcherEnabled !== false;
          if (!qsScBtn.classList.contains('is-recording')) {
            qsScBtn.textContent = s.quickSwitcherShortcut || 'Ctrl+K';
          }
          if (force || document.activeElement !== omSel) omSel.value = s.appShortcutOpenMode || 'sidebar';
        });
      },
      { icon: 'keyboard' }
    );

    const navContextWorkspaceCard = registerItem(
      'navigation',
      'Right-Click Context Menus & Workspace Bars',
      'context menu right click open link page in foxhub sidebar open mode auto embedded window top bar hover pinned disabled bottom bar',
      (card) => {
        const ctxRow = document.createElement('div');
        ctxRow.className = 'fh-row';
        const ctxMeta = document.createElement('div');
        ctxMeta.className = 'fh-row-meta';
        const ctxLbl = document.createElement('div');
        ctxLbl.className = 'fh-row-label';
        ctxLbl.id = `fh-toggle-lbl-${mode}-${++toggleLabelSeq}`;
        ctxLbl.textContent = 'Right-Click "Open in FoxHub" Context Menu';
        const ctxSub = document.createElement('div');
        ctxSub.className = 'fh-row-sub';
        ctxSub.textContent = 'Add page and link right-click menu entries in Firefox to open any URL inside FoxHub.';
        ctxMeta.appendChild(ctxLbl);
        ctxMeta.appendChild(ctxSub);
        const ctxSw = makeToggleSwitch(true, (checked) => {
          savePatch({ contextMenuEnabled: checked }, `Context menus ${checked ? 'enabled' : 'disabled'}`);
        }, { labelledBy: ctxLbl.id, settingKey: 'contextMenuEnabled' });
        ctxRow.appendChild(ctxMeta);
        ctxRow.appendChild(ctxSw.wrap);
        card.appendChild(ctxRow);

        const ctxBehRow = document.createElement('div');
        ctxBehRow.className = 'fh-row fh-row-stack-narrow';
        const cbLbl = document.createElement('div');
        cbLbl.className = 'fh-row-label';
        cbLbl.textContent = 'Context Menu Open Behavior';
        const cbSel = document.createElement('select');
        cbSel.className = 'fh-select fh-select-compact';
        [
          ['sidebar', 'Open in FoxHub Sidebar'],
          ['popout', 'Open in Popout Window']
        ].forEach(([v, t]) => {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = t;
          cbSel.appendChild(o);
        });
        cbSel.addEventListener('change', () => savePatch({ contextMenuOpenBehavior: cbSel.value }, `Context menu opens in: ${cbSel.value}`));
        ctxBehRow.appendChild(cbLbl);
        ctxBehRow.appendChild(cbSel);
        card.appendChild(ctxBehRow);

        // Sidebar Open Mode (all 4 schema options)
        const sbRow = document.createElement('div');
        sbRow.className = 'fh-row fh-row-stack-narrow';
        const sbLbl = document.createElement('div');
        sbLbl.className = 'fh-row-label';
        sbLbl.textContent = 'Sidebar Icon Click Mode';
        const sbSel = document.createElement('select');
        sbSel.className = 'fh-select fh-select-compact';
        [
          ['auto', 'Smart Auto (Recommended)'],
          ['sidebar', 'Firefox Left Sidebar'],
          ['embedded', 'Split View Inside Popup'],
          ['window', 'Floating Side Window']
        ].forEach(([v, t]) => {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = t;
          sbSel.appendChild(o);
        });
        sbSel.addEventListener('change', () => savePatch({ sidebarOpenMode: sbSel.value }, `Sidebar open mode: ${sbSel.options[sbSel.selectedIndex]?.textContent}`));
        sbRow.appendChild(sbLbl);
        sbRow.appendChild(sbSel);
        card.appendChild(sbRow);

        // Top Bar Mode (all 3 schema options)
        const tbRow = document.createElement('div');
        tbRow.className = 'fh-row fh-row-stack-narrow';
        const tbLbl = document.createElement('div');
        tbLbl.className = 'fh-row-label';
        tbLbl.textContent = 'Media App Top Bar Mode';
        const tbGroup = document.createElement('div');
        tbGroup.className = 'fh-pill-group';
        const tbBtns = [];
        [
          ['hover', 'Show on Hover'],
          ['pinned', 'Always Pinned'],
          ['disabled', 'Completely Off']
        ].forEach(([v, t]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'fh-pill-btn';
          b.setAttribute('data-tb-mode', v);
          b.textContent = t;
          b.addEventListener('click', async () => {
            await savePatch({ mediaTopBarMode: v, autoHideMediaTopBar: v !== 'pinned' }, `Top bar: ${t}`);
            syncAllSections();
          });
          tbGroup.appendChild(b);
          tbBtns.push(b);
        });
        tbRow.appendChild(tbLbl);
        tbRow.appendChild(tbGroup);
        card.appendChild(tbRow);

        // Bottom Bar toggle
        const bbRow = document.createElement('div');
        bbRow.className = 'fh-row';
        const bbLbl = document.createElement('div');
        bbLbl.className = 'fh-row-label';
        bbLbl.id = `fh-toggle-lbl-${mode}-${++toggleLabelSeq}`;
        bbLbl.textContent = 'Show Quick Sub-View Bottom Bar';
        const bbSw = makeToggleSwitch(true, (checked) => {
          savePatch({ hideMediaBottomBar: !checked }, checked ? 'Bottom navigation bar shown' : 'Bottom navigation bar hidden');
        }, { labelledBy: bbLbl.id });
        bbRow.appendChild(bbLbl);
        bbRow.appendChild(bbSw.wrap);
        card.appendChild(bbRow);

        sectionUpdaters.push((syncOpts = {}) => {
          const force = Boolean(syncOpts && syncOpts.force);
          const s = getSettings();
          ctxSw.input.checked = s.contextMenuEnabled !== false;
          if (force || document.activeElement !== cbSel) cbSel.value = s.contextMenuOpenBehavior || 'sidebar';
          if (force || document.activeElement !== sbSel) sbSel.value = s.sidebarOpenMode || 'auto';
          const tbMode = s.mediaTopBarMode || (s.autoHideMediaTopBar === false ? 'pinned' : 'hover');
          tbBtns.forEach((b) => b.classList.toggle('active', b.getAttribute('data-tb-mode') === tbMode));
          bbSw.input.checked = !s.hideMediaBottomBar;
        });
      },
      { icon: 'keyboard' }
    );

    const navVideoLoadbarCard = registerItem(
      'navigation',
      'Custom Video Loadbar (TikTok, Reels & Shorts)',
      'video loadbar progress seek tiktok reels shorts style sunset accent cyber emerald minimal white custom color size slim normal bold',
      (card) => {
        const enRow = document.createElement('div');
        enRow.className = 'fh-row';
        const enLbl = document.createElement('div');
        enLbl.className = 'fh-row-label';
        enLbl.id = `fh-toggle-lbl-${mode}-${++toggleLabelSeq}`;
        enLbl.textContent = 'Enable Custom Video Progress & Seek Bar';
        const enSw = makeToggleSwitch(true, async (checked) => {
          await savePatch({ customVideoLoadbar: checked }, `Video loadbar ${checked ? 'enabled' : 'disabled'}`);
          if (typeof options.onBroadcastAppConfig === 'function') options.onBroadcastAppConfig('videoLoadbar');
          syncAllSections();
        }, { labelledBy: enLbl.id, settingKey: 'customVideoLoadbar' });
        enRow.appendChild(enLbl);
        enRow.appendChild(enSw.wrap);
        card.appendChild(enRow);

        const styleRow = document.createElement('div');
        styleRow.className = 'fh-row fh-row-stack-narrow';
        const stLbl = document.createElement('div');
        stLbl.className = 'fh-row-label';
        stLbl.textContent = 'Loadbar Style & Thickness';
        const stCtrls = document.createElement('div');
        stCtrls.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
        const stSel = document.createElement('select');
        stSel.className = 'fh-select';
        stSel.style.width = 'auto';
        [
          ['sunset', 'Sunset Glow'],
          ['accent', 'Match Theme'],
          ['cyber', 'Neon Cyber'],
          ['emerald', 'Emerald Mint'],
          ['minimal-white', 'Minimal White'],
          ['custom', 'Custom Hex']
        ].forEach(([v, t]) => {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = t;
          stSel.appendChild(o);
        });
        stSel.addEventListener('change', async () => {
          await savePatch({ customVideoLoadbar: true, videoLoadbarStyle: stSel.value }, `Loadbar style: ${stSel.value}`);
          if (typeof options.onBroadcastAppConfig === 'function') options.onBroadcastAppConfig('videoLoadbar');
        });
        const clrIn = document.createElement('input');
        clrIn.type = 'color';
        clrIn.title = 'Custom Loadbar Color';
        clrIn.style.cssText = 'width:30px;height:28px;border:none;background:none;cursor:pointer;padding:0;';
        clrIn.addEventListener('change', async () => {
          await savePatch({ customVideoLoadbar: true, videoLoadbarStyle: 'custom', videoLoadbarColor: clrIn.value }, `Loadbar color: ${clrIn.value.toUpperCase()}`);
          if (typeof options.onBroadcastAppConfig === 'function') options.onBroadcastAppConfig('videoLoadbar');
        });
        const szSel = document.createElement('select');
        szSel.className = 'fh-select';
        szSel.style.width = 'auto';
        [
          ['slim', 'Slim (3px)'],
          ['normal', 'Normal (4px)'],
          ['bold', 'Bold (6px)']
        ].forEach(([v, t]) => {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = t;
          szSel.appendChild(o);
        });
        szSel.addEventListener('change', async () => {
          await savePatch({ customVideoLoadbar: true, videoLoadbarSize: szSel.value }, `Loadbar size: ${szSel.value}`);
          if (typeof options.onBroadcastAppConfig === 'function') options.onBroadcastAppConfig('videoLoadbar');
        });
        stCtrls.appendChild(stSel);
        stCtrls.appendChild(clrIn);
        stCtrls.appendChild(szSel);
        styleRow.appendChild(stLbl);
        styleRow.appendChild(stCtrls);
        card.appendChild(styleRow);

        sectionUpdaters.push((syncOpts = {}) => {
          const force = Boolean(syncOpts && syncOpts.force);
          const s = getSettings();
          enSw.input.checked = s.customVideoLoadbar !== false;
          if (force || document.activeElement !== stSel) stSel.value = s.videoLoadbarStyle || 'sunset';
          if (force || document.activeElement !== clrIn) clrIn.value = s.videoLoadbarColor || '#FF3366';
          if (force || document.activeElement !== szSel) szSel.value = s.videoLoadbarSize || 'normal';
        });
      },
      { icon: 'keyboard' }
    );

    // -------------------------------------------------------------------------
    // CATEGORY 6: BACKUP & COMPANION TOOLS
    // -------------------------------------------------------------------------
    const backupRestoreCard = registerItem(
      'backup',
      'Settings Backup & Restore (JSON)',
      'backup restore export import json settings pinned apps custom urls themes audio shortcuts',
      (card) => {
        const desc = document.createElement('p');
        desc.className = 'fh-card-desc';
        desc.textContent = 'Export your pinned apps, custom URLs, themes, audio preferences, and shortcuts to JSON—or restore from a previous backup with strict local validation.';
        card.appendChild(desc);

        const expRow = document.createElement('div');
        expRow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
        const exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'fh-btn fh-btn-primary fh-btn-xs';
        exportBtn.textContent = 'Export Settings (.json)';
        const copyJsonBtn = document.createElement('button');
        copyJsonBtn.type = 'button';
        copyJsonBtn.className = 'fh-btn fh-btn-xs';
        copyJsonBtn.textContent = 'Copy Backup JSON';

        const statusBanner = document.createElement('div');
        statusBanner.className = 'fh-status-banner hidden';
        const showBanner = (kind, text) => {
          statusBannerState = { kind, text };
          statusBanner.className = `fh-status-banner ${kind === 'ok' ? 'is-ok' : 'is-err'}`;
          statusBanner.textContent = text;
        };

        const fetchBackupJson = async () => {
          const apis = getApis();
          const res = await browser.runtime.sendMessage({ type: 'EXPORT_SETTINGS' }).catch(() => null);
          const payload = (res && res.payload) || (apis.schema ? apis.schema.buildSettingsExportPayload(getSettings()) : { schema: 'foxhub-settings-backup', schemaVersion: 1, settings: getSettings() });
          return JSON.stringify(payload, null, 2);
        };

        exportBtn.addEventListener('click', async () => {
          const jsonStr = await fetchBackupJson();
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const day = new Date().toISOString().slice(0, 10);
          a.href = url;
          a.download = `foxhub-settings-backup-${day}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          showBanner('ok', 'Exported settings backup JSON file.');
          notifyToast('Exported settings backup (.json)');
        });

        copyJsonBtn.addEventListener('click', async () => {
          const jsonStr = await fetchBackupJson();
          await copyTextToClipboard(jsonStr);
          showBanner('ok', 'Copied settings backup JSON to clipboard.');
          notifyToast('Copied settings backup JSON');
        });

        expRow.appendChild(exportBtn);
        expRow.appendChild(copyJsonBtn);
        card.appendChild(expRow);

        const impWrap = document.createElement('div');
        impWrap.style.cssText = 'display:flex;flex-direction:column;gap:7px;padding-top:8px;border-top:1px solid var(--border-color);';
        const impBtns = document.createElement('div');
        impBtns.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
        const fileLbl = document.createElement('label');
        fileLbl.className = 'fh-btn fh-btn-xs';
        fileLbl.style.cursor = 'pointer';
        fileLbl.textContent = 'Import .json File…';
        const fileIn = document.createElement('input');
        fileIn.type = 'file';
        fileIn.accept = '.json,application/json';
        fileIn.hidden = true;
        fileLbl.appendChild(fileIn);

        const jsonText = document.createElement('textarea');
        jsonText.className = 'fh-textarea';
        jsonText.placeholder = 'Or paste backup JSON here and click Restore Backup…';

        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.className = 'fh-btn fh-btn-xs fh-btn-primary';
        restoreBtn.textContent = 'Restore Backup';

        const runImport = async (rawText) => {
          const apis = getApis();
          if (apis.schema?.validateAndSanitizeImportPayload) {
            const localCheck = apis.schema.validateAndSanitizeImportPayload(rawText);
            if (!localCheck.ok) {
              showBanner('err', localCheck.error || 'Invalid backup file.');
              return;
            }
          }
          try {
            const res = await browser.runtime.sendMessage({ type: 'IMPORT_SETTINGS', json: rawText });
            if (!res || !res.ok) {
              showBanner('err', (res && res.error) || 'Failed to import backup.');
              return;
            }
            if (typeof options.onStateReplace === 'function') {
              options.onStateReplace({ state: res.state || getState(), settings: res.settings || getSettings() });
            }
            const warnNote = Array.isArray(res.warnings) && res.warnings.length > 0 ? ` (${res.warnings.join(' ')})` : '';
            showBanner('ok', `Settings restored successfully!${warnNote}`);
            notifyToast('Settings backup restored!');
            syncAllSections();
          } catch (err) {
            showBanner('err', err.message || 'Failed to restore backup.');
          }
        };

        fileIn.addEventListener('change', (ev) => {
          const f = ev.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => {
            const text = typeof r.result === 'string' ? r.result : '';
            jsonText.value = text;
            runImport(text);
          };
          r.readAsText(f);
        });

        restoreBtn.addEventListener('click', () => {
          runImport(jsonText.value);
        });

        impBtns.appendChild(fileLbl);
        impBtns.appendChild(restoreBtn);
        impWrap.appendChild(impBtns);
        impWrap.appendChild(jsonText);
        impWrap.appendChild(statusBanner);
        card.appendChild(impWrap);

        sectionUpdaters.push(() => {
          if (statusBannerState) {
            statusBanner.className = `fh-status-banner ${statusBannerState.kind === 'ok' ? 'is-ok' : 'is-err'}`;
            statusBanner.textContent = statusBannerState.text;
          }
        });
      },
      { icon: 'shield' }
    );

    const userChromeCard = registerItem(
      'backup',
      'Firefox Chrome Polish (userChrome.css)',
      'userchrome css optional sidebar header hover expand floating drawer rounded firefox chrome polish',
      (card) => {
        const notice = document.createElement('p');
        notice.className = 'fh-card-desc';
        notice.textContent = '100% Optional — FoxHub works completely out of the box without touching Firefox files. If you want native sidebar chrome polish, paste a preset below into <profile>/chrome/userChrome.css and enable toolkit.legacyUserProfileCustomizations.stylesheets in about:config.';
        card.appendChild(notice);

        USERCHROME_PRESETS.forEach((preset) => {
          const box = document.createElement('div');
          box.className = 'fh-code-card';
          const top = document.createElement('div');
          top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;min-width:0;';
          const title = document.createElement('strong');
          title.style.cssText = 'font-size:12px;min-width:0;overflow-wrap:anywhere;';
          title.textContent = preset.title;
          const copyBtn = document.createElement('button');
          copyBtn.type = 'button';
          copyBtn.className = 'fh-btn fh-btn-xs';
          copyBtn.setAttribute('data-userchrome-copy', preset.id);
          copyBtn.textContent = 'Copy CSS';
          copyBtn.addEventListener('click', async () => {
            await copyTextToClipboard(preset.css);
            copyBtn.textContent = 'Copied!';
            notifyToast(`Copied "${preset.title}" CSS`);
            setTimeout(() => { copyBtn.textContent = 'Copy CSS'; }, 1600);
          });
          top.appendChild(title);
          top.appendChild(copyBtn);

          const desc = document.createElement('div');
          desc.className = 'fh-row-sub';
          desc.textContent = preset.description;

          const pre = document.createElement('pre');
          pre.className = 'fh-code-pre';
          const code = document.createElement('code');
          code.textContent = preset.css;
          pre.appendChild(code);

          box.appendChild(top);
          box.appendChild(desc);
          box.appendChild(pre);
          card.appendChild(box);
        });

        const copyAllBtn = document.createElement('button');
        copyAllBtn.type = 'button';
        copyAllBtn.className = 'fh-btn fh-btn-xs fh-btn-primary';
        copyAllBtn.style.alignSelf = 'flex-start';
        copyAllBtn.textContent = 'Copy All 3 Presets Combined';
        copyAllBtn.addEventListener('click', async () => {
          const allCss = USERCHROME_PRESETS.map((p) => p.css).join('\n\n');
          await copyTextToClipboard(allCss);
          notifyToast('Copied all 3 userChrome.css presets!');
        });
        card.appendChild(copyAllBtn);
      },
      { icon: 'shield', badgeText: 'Optional', badgeClass: 'fh-badge-optional' }
    );

    const privacyCard = registerItem(
      'backup',
      '100% Local Privacy Guarantee',
      'privacy local storage zero servers telemetry direct connection',
      (card) => {
        const list = document.createElement('ul');
        list.style.cssText = 'padding-left:18px;display:flex;flex-direction:column;gap:5px;font-size:11.5px;color:var(--text-secondary);';
        [
          'Zero External Servers: No developer backend, telemetry, or analytics.',
          'Direct Connections: Mail, OAuth, and web apps connect directly from Firefox.',
          'Local Storage Only: Preferences, themes, and backups stay in browser.storage.local.'
        ].forEach((txt) => {
          const li = document.createElement('li');
          li.textContent = txt;
          list.appendChild(li);
        });
        card.appendChild(list);
      },
      { icon: 'shield' }
    );

    appendWithGroupHeader('mail', [mailAccountsCard, mailSyncCard, mailOauthCacheCard]);
    appendWithGroupHeader('appearance', [appThemesCard, appWallpapersCard, appSurfaceCard]);
    appendWithGroupHeader('apps', [appsCatalogCard, customAppsCard]);
    appendWithGroupHeader('audio', [audioNowPlayingCard, audioBgMemoryCard, audioMuteChimesCard, diagDetails]);
    appendWithGroupHeader('navigation', [navShortcutsCard, navContextWorkspaceCard, navVideoLoadbarCard]);
    appendWithGroupHeader('backup', [backupRestoreCard, userChromeCard, privacyCard]);

    // =========================================================================
    // Filtering, Highlighting & Sync
    // =========================================================================
    function applyFilterAndVisibility() {
      const q = searchQuery.trim().toLowerCase();
      const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
      const isSearching = tokens.length > 0;

      searchClearBtn.classList.toggle('hidden', !isSearching);

      const countsByCat = new Map();
      CATEGORIES.forEach((c) => countsByCat.set(c.id, 0));

      let totalMatches = 0;
      const diagExplicitMatch = isSearching && /(diag|mse|widevine|audio log|debug|buffer)/i.test(q);

      itemRegistry.forEach((entry) => {
        const matches = !isSearching || tokens.every((tok) => entry.keywords.includes(tok));
        if (matches) {
          countsByCat.set(entry.category, (countsByCat.get(entry.category) || 0) + 1);
          totalMatches++;
        }
        const visible = isSearching ? matches : entry.category === activeCategory;
        entry.el.classList.toggle('hidden', !visible);

        if (entry.titleEl) {
          setHighlightedText(entry.titleEl, entry.plainTitle, isSearching ? tokens : []);
        }
        if (entry.isDiag) {
          if (diagExplicitMatch && matches) {
            entry.el.open = true;
          } else if (!isSearching) {
            entry.el.open = false;
          }
        }
      });

      groupHeaders.forEach((hdr, catId) => {
        const showHdr = isSearching && (countsByCat.get(catId) || 0) > 0;
        hdr.classList.toggle('hidden', !showHdr);
      });

      catPillEls.forEach(({ btn, badge }, catId) => {
        const isActive = !isSearching && catId === activeCategory;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        const cnt = countsByCat.get(catId) || 0;
        badge.textContent = String(cnt);
        badge.classList.toggle('hidden', !isSearching || cnt === 0);
      });

      if (isSearching) {
        searchCount.textContent = `${totalMatches} match${totalMatches === 1 ? '' : 'es'}`;
        searchCount.classList.remove('hidden');
      } else {
        searchCount.classList.add('hidden');
      }

      const showEmpty = isSearching && totalMatches === 0;
      emptyState.classList.toggle('hidden', !showEmpty);
      if (showEmpty) {
        emptyMsg.textContent = `No settings match "${searchQuery.trim()}"`;
      }
    }

    function syncAllSections(syncOpts = {}) {
      if (destroyed) return;
      sectionUpdaters.forEach((fn) => {
        try { fn(syncOpts); } catch (_) {}
      });
    }

    function setCategory(catId) {
      if (!CATEGORIES.some((c) => c.id === catId)) return;
      activeCategory = catId;
      if (searchQuery.trim()) {
        searchQuery = '';
        searchInput.value = '';
      }
      applyFilterAndVisibility();
      if (typeof options.onCategoryChange === 'function') {
        options.onCategoryChange(catId, '');
      }
    }

    function setSearchQuery(q) {
      searchQuery = String(q || '');
      if (searchInput.value !== searchQuery) {
        searchInput.value = searchQuery;
      }
      applyFilterAndVisibility();
      if (typeof options.onCategoryChange === 'function') {
        options.onCategoryChange(activeCategory, searchQuery);
      }
    }

    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value || '';
      applyFilterAndVisibility();
      if (typeof options.onCategoryChange === 'function') {
        options.onCategoryChange(activeCategory, searchQuery);
      }
    });
    searchClearBtn.addEventListener('click', () => {
      setSearchQuery('');
      searchInput.focus();
    });

    function startIntervals() {
      if (destroyed) return;
      if (!muteTimerTick) {
        muteTimerTick = setInterval(() => {
          if (destroyed) return;
          if (mode === 'drawer' && !root.offsetParent) return;
          muteTimerUpdaters.forEach((fn) => {
            try { fn(); } catch (_) {}
          });
        }, 5000);
      }
      if (
        liveAudioLogVisible &&
        !liveAudioLogTimer &&
        diagLogPanelRef &&
        !diagLogPanelRef.classList.contains('hidden') &&
        (mode === 'options' || diagLogPanelRef.offsetParent || typeof window.__pmForceRenderAudioLog === 'boolean') &&
        typeof renderLiveAudioLogRef === 'function'
      ) {
        liveAudioLogTimer = setInterval(renderLiveAudioLogRef, 1000);
      }
    }

    function stopIntervals() {
      if (liveAudioLogTimer) {
        clearInterval(liveAudioLogTimer);
        liveAudioLogTimer = null;
      }
      if (muteTimerTick) {
        clearInterval(muteTimerTick);
        muteTimerTick = null;
      }
    }

    if (mode === 'options' || containerEl.offsetParent !== null) {
      startIntervals();
    }

    syncAllSections();
    applyFilterAndVisibility();

    return {
      update(updateOpts = {}) {
        syncAllSections({ force: Boolean(updateOpts && updateOpts.force) });
        applyFilterAndVisibility();
      },
      setCategory,
      setSearchQuery,
      getActiveCategory: () => activeCategory,
      getSearchQuery: () => searchQuery,
      focusSearch: () => searchInput.focus(),
      startIntervals,
      stopIntervals,
      destroy() {
        destroyed = true;
        cancelGlobalRecorder();
        stopIntervals();
        document.getElementById('pm-custom-app-edit-modal')?.remove();
        containerEl.replaceChildren();
      }
    };
  }

  const settingsUiApi = {
    mount,
    CATEGORIES,
    USERCHROME_PRESETS,
    isRecording
  };

  global.FoxHubSettingsUI = settingsUiApi;
  global.FoxHubSettingsUi = settingsUiApi;
})(typeof window !== 'undefined' ? window : this);
