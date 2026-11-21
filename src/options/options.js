/**
 * FoxHub — Full-Page Options & Theme Studio Controller (v2.8.0)
 * Pure-DOM orchestration layer around window.FoxHubSettingsUI.
 */
(function () {
  'use strict';

  const ThemeEngine = window.FoxHubThemes || window.PocketMailThemes;
  const SettingsSchema = window.FoxHubSettingsSchema || {};
  const SenderIcons = window.FoxHubSenderIcons || window.PocketMailSenderIcons;
  const SettingsUI = window.FoxHubSettingsUI || window.FoxHubSettingsUi;

  let appState = { accounts: [], activeAccountIndex: 0 };
  let appSettings = Object.assign({}, SettingsSchema.DEFAULT_SETTINGS || {});
  let settingsController = null;
  let toastTimer = null;
  let activeCategory = 'mail';

  const els = {
    navButtons: Array.from(document.querySelectorAll('.opt-nav-btn[data-category]')),
    previewBox: document.getElementById('opt-live-preview-box'),
    previewSummary: document.getElementById('opt-preview-summary'),
    previewWallpaper: document.getElementById('opt-preview-wallpaper'),
    previewContent: document.getElementById('opt-preview-content'),
    mount: document.getElementById('opt-settings-mount'),
    toast: document.getElementById('opt-toast')
  };

  function showToast(message) {
    if (!els.toast || !message) return;
    els.toast.textContent = String(message);
    els.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (els.toast) els.toast.classList.add('hidden');
    }, 2600);
  }

  function getSettings() {
    const defaults = SettingsSchema.DEFAULT_SETTINGS || {};
    return Object.assign({}, defaults, appSettings || {});
  }

  function applyTheme(settings) {
    if (ThemeEngine && typeof ThemeEngine.applyThemeAndWallpaper === 'function') {
      ThemeEngine.applyThemeAndWallpaper(document, settings);
    }
  }

  function syncNavSelection(categoryId) {
    activeCategory = categoryId || 'mail';
    els.navButtons.forEach((btn) => {
      const match = btn.dataset.category === activeCategory;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-current', match ? 'page' : 'false');
    });
    if (els.previewBox) {
      els.previewBox.classList.toggle('hidden', activeCategory !== 'appearance');
    }
    if (activeCategory === 'appearance') {
      renderLivePreview();
    }
  }

  function renderLivePreview() {
    if (!els.previewContent || !els.previewBox || els.previewBox.classList.contains('hidden')) return;
    const s = getSettings();

    if (els.previewSummary) {
      const themeName = (ThemeEngine && ThemeEngine.THEMES && ThemeEngine.THEMES[s.theme]?.name) || s.theme || 'warm-linen';
      const wpName = (ThemeEngine && ThemeEngine.WALLPAPERS && ThemeEngine.WALLPAPERS[s.wallpaper]?.name) || s.wallpaper || 'none';
      const cardLabel = s.cardStyle || 'glassmorphism';
      els.previewSummary.textContent = themeName + ' · ' + wpName + ' · ' + cardLabel;
    }

    const sampleMessages = [
      {
        id: 'prev-1',
        from: 'notifications@github.com',
        fromName: 'GitHub',
        subject: 'FoxHub v2.8.0 workspace update ready',
        snippet: 'Unified settings search, custom app UA toggles, and Spotlight switcher.',
        time: '2m',
        unread: true,
        color: '#24292F',
        initials: 'GH'
      },
      {
        id: 'prev-2',
        from: 'team@linear.app',
        fromName: 'Linear',
        subject: 'Weekly Sprint Digest',
        snippet: 'All 4 milestones are passing headless Firefox checks cleanly.',
        time: '1h',
        unread: false,
        color: '#5E6AD2',
        initials: 'LN'
      }
    ];

    const frag = document.createDocumentFragment();
    sampleMessages.forEach((msg) => {
      const row = document.createElement('div');
      row.className = 'opt-preview-row' + (msg.unread ? ' unread' : '');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '10px';
      row.style.padding = '8px 10px';
      row.style.borderRadius = '10px';
      row.style.background = 'var(--card-bg, rgba(255,255,255,0.72))';
      row.style.border = '1px solid var(--border-color, rgba(0,0,0,0.08))';
      row.style.marginBottom = '6px';

      let avatarEl = null;
      if (SenderIcons && typeof SenderIcons.createSenderAvatarElement === 'function') {
        try {
          avatarEl = SenderIcons.createSenderAvatarElement(document, msg, msg.initials, msg.color);
        } catch (e) {
          avatarEl = null;
        }
      }
      if (!avatarEl) {
        avatarEl = document.createElement('span');
        avatarEl.className = 'opt-preview-avatar-fallback';
        avatarEl.textContent = msg.initials;
        avatarEl.style.width = '28px';
        avatarEl.style.height = '28px';
        avatarEl.style.borderRadius = '8px';
        avatarEl.style.display = 'inline-flex';
        avatarEl.style.alignItems = 'center';
        avatarEl.style.justifyContent = 'center';
        avatarEl.style.background = msg.color;
        avatarEl.style.color = '#ffffff';
        avatarEl.style.fontSize = '11px';
        avatarEl.style.fontWeight = '700';
        avatarEl.style.flexShrink = '0';
      }

      const body = document.createElement('div');
      body.style.minWidth = '0';
      body.style.flex = '1';

      const top = document.createElement('div');
      top.style.display = 'flex';
      top.style.justifyContent = 'space-between';
      top.style.gap = '8px';
      top.style.fontSize = '12px';

      const sender = document.createElement('strong');
      sender.textContent = msg.fromName;
      sender.style.color = 'var(--text-primary)';

      const time = document.createElement('span');
      time.textContent = msg.time;
      time.style.fontSize = '11px';
      time.style.color = 'var(--text-muted)';

      top.append(sender, time);

      const subj = document.createElement('div');
      subj.textContent = msg.subject;
      subj.style.fontSize = '12px';
      subj.style.fontWeight = msg.unread ? '700' : '500';
      subj.style.color = 'var(--text-primary)';
      subj.style.whiteSpace = 'nowrap';
      subj.style.overflow = 'hidden';
      subj.style.textOverflow = 'ellipsis';

      const snip = document.createElement('div');
      snip.textContent = msg.snippet;
      snip.style.fontSize = '11px';
      snip.style.color = 'var(--text-secondary)';
      snip.style.whiteSpace = 'nowrap';
      snip.style.overflow = 'hidden';
      snip.style.textOverflow = 'ellipsis';

      body.append(top, subj, snip);
      row.append(avatarEl, body);
      frag.appendChild(row);
    });

    els.previewContent.replaceChildren(frag);
  }

  async function savePatch(patch, toastMsg) {
    if (!patch || typeof patch !== 'object') return null;
    const prevSettings = appSettings;
    if (typeof SettingsSchema.normalizeSettingsPatch === 'function') {
      appSettings = SettingsSchema.normalizeSettingsPatch(patch, appSettings);
    } else if (typeof SettingsSchema.normalizeSettings === 'function') {
      appSettings = SettingsSchema.normalizeSettings(Object.assign({}, appSettings || {}, patch), {
        skipLegacyMigrations: true
      });
    } else {
      appSettings = Object.assign({}, appSettings || {}, patch);
    }
    applyTheme(getSettings());
    renderLivePreview();

    const resyncFromBackground = async () => {
      try {
        const fresh = await browser.runtime.sendMessage({ type: 'GET_STATE' });
        if (fresh && fresh.state) appState = fresh.state;
        if (fresh && fresh.settings) {
          appSettings = fresh.settings;
          return;
        }
      } catch (_) {}
      appSettings = prevSettings;
    };

    try {
      const res = await browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: patch });
      if (!res || res.ok === false) {
        await resyncFromBackground();
        applyTheme(getSettings());
        if (settingsController) settingsController.update({ force: true });
        renderLivePreview();
        showToast('Could not persist settings: ' + ((res && res.error) || 'background rejected update'));
        return res || { ok: false };
      }
      if (res.settings) appSettings = res.settings;
      if (res.state) appState = res.state;
      applyTheme(getSettings());
      if (settingsController) settingsController.update();
      renderLivePreview();
      if (toastMsg) {
        showToast(toastMsg);
      }
      return res;
    } catch (err) {
      await resyncFromBackground();
      applyTheme(getSettings());
      if (settingsController) settingsController.update({ force: true });
      renderLivePreview();
      showToast('Could not persist settings: ' + (err?.message || 'unknown error'));
      return null;
    }
  }

  function handleStateReplace(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (payload.state && typeof payload.state === 'object') {
      appState = payload.state;
    } else if (Array.isArray(payload.accounts)) {
      appState = payload;
    }
    if (payload.settings && typeof payload.settings === 'object') {
      appSettings = payload.settings;
    }
    applyTheme(getSettings());
    if (settingsController) settingsController.update();
    renderLivePreview();
  }

  function getInitialCategory() {
    try {
      const params = new URLSearchParams(window.location.search);
      const cat = params.get('category') || window.location.hash.replace(/^#/, '');
      if (cat && SettingsUI && Array.isArray(SettingsUI.CATEGORIES)) {
        if (SettingsUI.CATEGORIES.some((c) => c.id === cat)) return cat;
      }
    } catch (e) {}
    return 'mail';
  }

  async function init() {
    try {
      const res = await browser.runtime.sendMessage({ type: 'GET_STATE' });
      if (res) {
        if (res.state) appState = res.state;
        if (res.settings) appSettings = res.settings;
      }
    } catch (e) {}

    applyTheme(getSettings());

    const startCategory = getInitialCategory();
    if (els.mount && SettingsUI && typeof SettingsUI.mount === 'function') {
      settingsController = SettingsUI.mount(els.mount, {
        mode: 'options',
        initialCategory: startCategory,
        getSettings,
        getState: () => appState,
        onSavePatch: savePatch,
        onStateReplace: handleStateReplace,
        onToast: showToast,
        onCategoryChange: syncNavSelection
      });
    }

    syncNavSelection(startCategory);

    els.navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.category || 'mail';
        if (settingsController) {
          settingsController.setCategory(cat);
        }
        syncNavSelection(cat);
      });
    });

    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
      browser.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'STATE_UPDATED') {
          handleStateReplace(msg);
        }
      });
    }

    window.addEventListener('beforeunload', () => {
      if (settingsController && typeof settingsController.destroy === 'function') {
        settingsController.destroy();
      }
    });
  }

  init();
})();
