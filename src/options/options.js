/**
 * FoxHub: Options & Customization Studio Controller
 */

(function () {
  let appState = { accounts: [], totalUnread: 0 };
  let appSettings = {};

  const toastEl = document.getElementById('opt-toast');

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 2400);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setSafeHtml(el, htmlStr) {
    if (!el) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlStr, 'text/html');
    el.replaceChildren(...Array.from(doc.body.childNodes));
  }

  async function saveSettings(patch, toastMsg) {
    appSettings = { ...appSettings, ...patch };
    PocketMailThemes.applyThemeAndWallpaper(document, appSettings);
    renderAll();
    if (toastMsg) showToast(toastMsg);
    const res = await browser.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: patch
    });
    if (res && res.state && (patch.demoMode !== undefined || patch.accountConfigs !== undefined || patch.maxAccounts !== undefined || patch.maxEmailsPerAccount !== undefined)) {
      appState = res.state;
      renderAccountsTab();
    }
  }

  /**
   * Render Tab 1: Accounts & Per-Account Settings
   */
  function renderAccountsTab() {
    const listEl = document.getElementById('opt-accounts-list');
    const accounts = appState.accounts || [];

    document.getElementById('opt-demo-mode').value = appSettings.demoMode || 'auto';
    const maxEmailsEl = document.getElementById('opt-max-emails-per-account');
    if (maxEmailsEl) maxEmailsEl.value = String(appSettings.maxEmailsPerAccount || 15);
    const badgeModeEl = document.getElementById('opt-badge-count-mode');
    if (badgeModeEl) badgeModeEl.value = appSettings.badgeCountMode || 'feed';
    document.getElementById('opt-oauth-client-id').value = appSettings.oauthClientId || '';

    if (accounts.length === 0) {
      setSafeHtml(
        listEl,
        `
        <div class="opt-card">
          <p class="opt-muted">No accounts connected yet. Click <strong>"Sign in with Google Account"</strong> above to sign into your Gmail account.</p>
        </div>
      `
      );
      return;
    }

    const labelOptions = [
      { key: 'inbox', name: 'All Inbox (Default)' },
      { key: 'primary', name: 'Primary Category Only' },
      { key: 'important', name: 'Important Only' },
      { key: 'starred', name: 'Starred' },
      { key: 'social', name: 'Social' },
      { key: 'promotions', name: 'Promotions' },
      { key: 'updates', name: 'Updates' }
    ];

    setSafeHtml(
      listEl,
      accounts
        .map((acc) => {
          const cfg = (appSettings.accountConfigs && appSettings.accountConfigs[acc.email]) || {};
          const currentLabel = cfg.label || acc.label || 'inbox';
          const currentColor = cfg.color || acc.color || '#D95032';
          const currentNick = cfg.nickname || acc.nickname || '';
          const initials = (currentNick || acc.email).slice(0, 2).toUpperCase();
          const badgeType = acc.isDemo
            ? 'Sample Preview Account'
            : acc.accountType === 'oauth'
            ? 'Local OAuth 2.0'
            : `Google Session (u/${acc.slotIndex || 0})`;

          return `
          <div class="opt-account-row" data-email="${escapeHtml(acc.email)}">
            <div class="opt-account-id">
              <div class="opt-account-avatar" style="background:${escapeHtml(currentColor)}">${escapeHtml(initials)}</div>
              <div style="min-width:0;">
                <div class="opt-account-email">${escapeHtml(acc.email)}</div>
                <div class="opt-account-sub">${escapeHtml(badgeType)} • ${acc.unreadCount} unread</div>
              </div>
            </div>

            <div>
              <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px;">Display Nickname</label>
              <input type="text" class="opt-input acc-nickname-input" value="${escapeHtml(currentNick)}" placeholder="e.g. Personal, Work, Studio">
            </div>

            <div>
              <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px;">Monitored Label</label>
              <select class="opt-select acc-label-select" ${acc.isDemo ? 'disabled' : ''}>
                ${labelOptions
                  .map(
                    (opt) =>
                      `<option value="${opt.key}" ${currentLabel === opt.key ? 'selected' : ''}>${opt.name}</option>`
                  )
                  .join('')}
              </select>
            </div>

            <div style="display:flex;align-items:center;gap:8px;">
              <input type="color" class="acc-color-input" value="${escapeHtml(currentColor)}" title="Choose Account Badge Color" style="width:36px;height:36px;border:none;background:none;cursor:pointer;">
              <button class="opt-btn opt-btn-secondary acc-save-btn" style="padding:8px 12px;font-size:12px;">Save</button>
            </div>
          </div>
        `;
        })
        .join('')
    );

    listEl.querySelectorAll('.opt-account-row').forEach((row) => {
      const email = row.getAttribute('data-email');
      const saveBtn = row.querySelector('.acc-save-btn');
      saveBtn.addEventListener('click', async () => {
        const nickname = row.querySelector('.acc-nickname-input').value.trim();
        const label = row.querySelector('.acc-label-select').value;
        const color = row.querySelector('.acc-color-input').value;

        const nextConfigs = { ...(appSettings.accountConfigs || {}) };
        nextConfigs[email] = {
          ...(nextConfigs[email] || {}),
          nickname,
          label,
          color
        };

        await saveSettings({ accountConfigs: nextConfigs }, `Saved settings for ${email}`);
      });
    });
  }

  /**
   * Render Tab 2: Backgrounds & Themes Studio
   */
  function renderBackgroundsTab() {
    const themeGrid = document.getElementById('opt-theme-grid');
    const wpGrid = document.getElementById('opt-wallpaper-grid');

    const currentThemeId = appSettings.theme || 'warm-linen';
    const currentWpId = appSettings.wallpaper || 'watercolor-hills';

    setSafeHtml(
      themeGrid,
      Object.values(PocketMailThemes.THEMES)
        .map(
          (t) => `
        <button class="opt-theme-card ${currentThemeId === t.id ? 'active' : ''}" data-theme-id="${t.id}">
          <div class="opt-theme-swatch" style="background:${t.previewGradient}">
            <span class="opt-theme-dot" style="background:${t.accentDot}"></span>
          </div>
          <div>
            <div style="font-weight:700;font-size:14px;">${escapeHtml(t.name)}</div>
            <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(t.subtitle)}</div>
          </div>
        </button>
      `
        )
        .join('')
    );

    themeGrid.querySelectorAll('.opt-theme-card').forEach((card) => {
      card.addEventListener('click', async () => {
        const themeId = card.getAttribute('data-theme-id');
        const themeObj = PocketMailThemes.THEMES[themeId];
        const nextWp = appSettings.wallpaper === 'custom' ? 'custom' : themeObj.defaultWallpaper;
        await saveSettings({ theme: themeId, wallpaper: nextWp }, `Applied ${themeObj.name} theme`);
      });
    });

    setSafeHtml(
      wpGrid,
      Object.values(PocketMailThemes.WALLPAPERS)
        .map((wp) => {
          const bgUrl = wp.svg ? PocketMailThemes.svgToDataUrl(wp.svg) : 'none';
          return `
          <button class="opt-wallpaper-card ${currentWpId === wp.id ? 'active' : ''}" data-wp-id="${wp.id}">
            <div class="opt-wallpaper-preview" style="background-image:${bgUrl}"></div>
            <div style="font-weight:700;font-size:13.5px;">${escapeHtml(wp.name)}</div>
            <div style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(wp.description)}</div>
          </button>
        `;
        })
        .join('')
    );

    wpGrid.querySelectorAll('.opt-wallpaper-card').forEach((card) => {
      card.addEventListener('click', async () => {
        const wpId = card.getAttribute('data-wp-id');
        await saveSettings({ wallpaper: wpId }, `Background: ${PocketMailThemes.WALLPAPERS[wpId].name}`);
      });
    });

    const wpOp = appSettings.wallpaperOpacity !== undefined ? appSettings.wallpaperOpacity : 0.95;
    document.getElementById('opt-wallpaper-opacity').value = wpOp;
    document.getElementById('opt-wallpaper-opacity-val').textContent = `${Math.round(wpOp * 100)}%`;

    const cardOp = appSettings.cardOpacity !== undefined ? appSettings.cardOpacity : 0.62;
    document.getElementById('opt-card-opacity').value = cardOp;
    document.getElementById('opt-card-opacity-val').textContent = `${Math.round(cardOp * 100)}%`;

    const cardBlur = appSettings.cardBlur !== undefined ? appSettings.cardBlur : 16;
    document.getElementById('opt-card-blur').value = cardBlur;
    document.getElementById('opt-card-blur-val').textContent = `${cardBlur}px`;

    const cardRadius = appSettings.cardRadius !== undefined ? appSettings.cardRadius : 15;
    document.getElementById('opt-card-radius').value = cardRadius;
    document.getElementById('opt-card-radius-val').textContent = `${cardRadius}px`;

    document.getElementById('opt-card-style').value = appSettings.cardStyle || 'glassmorphism';
    document.getElementById('opt-tab-style').value = appSettings.tabStyle || 'glass-pills';
    document.getElementById('opt-card-density').value = appSettings.cardDensity || 'cozy';
    document.getElementById('opt-ambient-effect').value = appSettings.ambientEffect || 'sunbeams';
    const fontStyleEl = document.getElementById('opt-font-style');
    if (fontStyleEl) fontStyleEl.value = appSettings.fontStyle || 'editorial';
    const socialThemeEl = document.getElementById('opt-social-theme-mode');
    if (socialThemeEl) socialThemeEl.value = appSettings.socialAppThemeMode || 'native';

    const previewEl = document.getElementById('opt-preview-content');
    const summaryEl = document.getElementById('opt-preview-summary');
    if (previewEl) {
      const themeObj = PocketMailThemes.THEMES[currentThemeId] || PocketMailThemes.THEMES['warm-linen'];
      if (summaryEl) {
        summaryEl.textContent = `• ${themeObj.name} • ${appSettings.cardStyle || 'glassmorphism'} (${Math.round(cardOp * 100)}% opacity, ${cardBlur}px blur)`;
      }
      const googleAvatar = window.PocketMailSenderIcons
        ? PocketMailSenderIcons.renderSenderAvatarHtml({ senderName: 'Google', senderEmail: 'no-reply@accounts.google.com' }, 'GO', '#D95032')
        : `<div class="pm-avatar" style="background:#D95032">GO</div>`;

      setSafeHtml(
        previewEl,
        `
        <div class="opt-preview-card">
          <div>${googleAvatar}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
              <strong style="font-size:13.5px;">Google</strong>
              <span style="font-size:11px;color:var(--text-muted);">Just now</span>
            </div>
            <div style="font-weight:650;font-size:13px;margin-bottom:3px;">Security alert: Live Combination Preview</div>
            <div style="font-size:12px;color:var(--text-secondary);">See how your selected theme palette, background artwork, and frosted glass card opacity look together in real time.</div>
          </div>
        </div>
      `
      );
    }
  }

  /**
   * Render Tab 3: Notifications, Sounds & Voice
   */
  function renderNotificationsTab() {
    const emailMuted = Boolean(
      appSettings.muteEmailNotifications || (appSettings.dndUntil && appSettings.dndUntil > Date.now())
    );
    const sitesMuted = Boolean(
      appSettings.muteSiteNotifications || appSettings.socialAppNotifySounds === false
    );
    const muteAllEl = document.getElementById('opt-mute-all');
    const muteEmailEl = document.getElementById('opt-mute-email');
    const muteSitesEl = document.getElementById('opt-mute-sites');
    if (muteAllEl) muteAllEl.checked = emailMuted && sitesMuted;
    if (muteEmailEl) muteEmailEl.checked = emailMuted;
    if (muteSitesEl) muteSitesEl.checked = sitesMuted;

    document.getElementById('opt-desktop-notif').checked = Boolean(appSettings.desktopNotifications);
    document.getElementById('opt-voice-notif').checked = Boolean(appSettings.voiceNotifications);
    const socialNotifEl = document.getElementById('opt-social-notif-sounds');
    if (socialNotifEl) {
      socialNotifEl.checked = !sitesMuted;
    }

    const soundGrid = document.getElementById('opt-sound-grid');
    const currentSound = appSettings.soundId || 'marimba';

    setSafeHtml(
      soundGrid,
      Object.values(PocketMailSound.SOUND_PRESETS)
        .map(
          (s) => `
        <div class="opt-sound-card ${currentSound === s.id ? 'active' : ''}" data-sound-id="${s.id}">
          <div>
            <div style="font-weight:700;font-size:13px;">${escapeHtml(s.name)}</div>
            <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(s.description)}</div>
          </div>
          <button class="opt-btn opt-btn-secondary btn-play-chime" data-play="${s.id}" style="padding:6px 10px;" title="Preview Chime">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
        </div>
      `
        )
        .join('')
    );

    soundGrid.querySelectorAll('.opt-sound-card').forEach((card) => {
      card.addEventListener('click', async (e) => {
        if (e.target.closest('.btn-play-chime')) return;
        const soundId = card.getAttribute('data-sound-id');
        await saveSettings({ soundId }, `Notification chime: ${PocketMailSound.SOUND_PRESETS[soundId].name}`);
        PocketMailSound.playNotificationSound(soundId, appSettings.soundVolume, appSettings.customAudioData);
      });
    });

    soundGrid.querySelectorAll('.btn-play-chime').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const soundId = btn.getAttribute('data-play');
        PocketMailSound.playNotificationSound(soundId, appSettings.soundVolume, appSettings.customAudioData);
      });
    });

    const vol = appSettings.soundVolume !== undefined ? appSettings.soundVolume : 0.75;
    document.getElementById('opt-sound-volume').value = vol;
    document.getElementById('opt-sound-volume-val').textContent = `${Math.round(vol * 100)}%`;

    // Per-app social notification chimes grid
    const socialSoundsGrid = document.getElementById('opt-social-app-sounds-grid');
    const mediaApi = window.PocketMailMediaApps;
    if (socialSoundsGrid && mediaApi && window.PocketMailSound) {
      socialSoundsGrid.replaceChildren();
      const soundMap = appSettings.socialAppSoundMap || {};
      const builtInApps = mediaApi.getOrderedBuiltInApps
        ? mediaApi.getOrderedBuiltInApps(appSettings)
        : mediaApi.BUILTIN_MEDIA_APPS;
      const customApps = (Array.isArray(appSettings.customMediaApps) ? appSettings.customMediaApps : []).map(
        (c, idx) => ({
          ...c,
          id: c.id || `custom-${idx}`,
          color: c.color || '#4E82EE'
        })
      );
      const allSoundApps = [...builtInApps, ...customApps];

      allSoundApps.forEach((app) => {
        const isMediaStream = ['spotify', 'youtube', 'tiktok', 'twitch', 'chatgpt', 'gemini'].includes(app.id);
        const curChoice = soundMap[app.id] || (isMediaStream ? 'none' : 'default');
        const row = document.createElement('div');
        row.className = 'opt-social-sound-row';

        const left = document.createElement('div');
        left.style.cssText = 'display:flex;align-items:center;gap:9px;min-width:0;';
        const iconBox = document.createElement('span');
        iconBox.className = 'opt-app-toggle-icon';
        iconBox.style.cssText = `width:28px;height:28px;border-radius:8px;background:${app.gradient || app.color || 'var(--accent)'};`;
        iconBox.appendChild(mediaApi.createAppSvgIcon(app.id, 14));
        const nameEl = document.createElement('strong');
        nameEl.style.fontSize = '13px';
        nameEl.textContent = app.name;
        left.appendChild(iconBox);
        left.appendChild(nameEl);

        const sel = document.createElement('select');
        sel.className = 'opt-select';
        sel.style.cssText = 'width:155px;padding:6px 9px;font-size:12px;';
        const opts = [
          { val: 'default', label: 'Default Chime' },
          { val: 'none', label: 'Muted (Silent)' },
          ...Object.values(window.PocketMailSound.SOUND_PRESETS).map((s) => ({ val: s.id, label: s.name }))
        ];
        opts.forEach((o) => {
          const optEl = document.createElement('option');
          optEl.value = o.val;
          optEl.textContent = o.label;
          if (curChoice === o.val) optEl.selected = true;
          sel.appendChild(optEl);
        });
        sel.addEventListener('change', async () => {
          const nextMap = { ...(appSettings.socialAppSoundMap || {}), [app.id]: sel.value };
          await saveSettings({ socialAppSoundMap: nextMap }, `Updated notification sound for ${app.name}`);
          if (sel.value !== 'none') {
            const previewId = sel.value === 'default' ? appSettings.soundId || 'bamboo-pop' : sel.value;
            window.PocketMailSound.playNotificationSound(previewId, appSettings.soundVolume, appSettings.customAudioData);
          }
        });

        row.appendChild(left);
        row.appendChild(sel);
        socialSoundsGrid.appendChild(row);
      });
    }

    const rate = appSettings.ttsRate || 1.0;
    document.getElementById('opt-tts-rate').value = rate;
    document.getElementById('opt-tts-rate-val').textContent = `${rate.toFixed(2)}x`;

    populateVoicesDropdown();
  }

  function populateVoicesDropdown() {
    const select = document.getElementById('opt-tts-voice');
    if (!window.speechSynthesis) {
      setSafeHtml(select, `<option value="">System Default Voice</option>`);
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    setSafeHtml(
      select,
      `<option value="">System Default Voice</option>` +
        voices
          .map(
            (v) =>
              `<option value="${escapeHtml(v.name)}" ${appSettings.ttsVoice === v.name ? 'selected' : ''}>${escapeHtml(
                `${v.name} (${v.lang})`
              )}</option>`
          )
          .join('')
    );
  }

  const DEFAULT_GLOBAL_SHORTCUTS_OPT = {
    popup: 'Alt+Shift+F',
    sidebar: 'Alt+Shift+M',
    popout: 'Alt+Shift+W'
  };
  let activeOptRecorderCleanup = null;

  function cancelOptShortcutRecording() {
    if (typeof activeOptRecorderCleanup === 'function') {
      activeOptRecorderCleanup();
      activeOptRecorderCleanup = null;
    }
  }

  function formatOptShortcutFromKeyEvent(ev) {
    if (!ev) return null;
    const k = ev.key || '';
    if (k === 'Escape') return { action: 'cancel' };
    if ((k === 'Backspace' || k === 'Delete') && !ev.ctrlKey && !ev.altKey && !ev.metaKey && !ev.shiftKey) {
      return { action: 'clear' };
    }
    if (k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta' || k === 'OS') return null;
    if (ev.getModifierState && ev.getModifierState('AltGraph')) return null;

    const isFnKey = /^F([1-9]|1[0-2])$/i.test(k);
    const useCtrl = Boolean(ev.ctrlKey || ev.metaKey);
    const useAlt = Boolean(ev.altKey);
    const useShift = Boolean(ev.shiftKey);
    const modCount = (useCtrl ? 1 : 0) + (useAlt ? 1 : 0) + (useShift ? 1 : 0);

    if (!isFnKey && !useCtrl && !useAlt) {
      return { action: 'invalid', message: 'Hold Alt+Shift or Ctrl+Shift + a key (or Backspace to clear)' };
    }
    if (modCount > 2) {
      return { action: 'invalid', message: 'Firefox supports up to 2 modifiers (e.g. Alt+Shift+Key)' };
    }

    let keyToken = '';
    const code = ev.code || '';
    if (/^Key([A-Z])$/.test(code)) keyToken = code.slice(3).toUpperCase();
    else if (/^Digit([0-9])$/.test(code)) keyToken = code.slice(5);
    else if (isFnKey) keyToken = k.toUpperCase();
    else if (code === 'Comma' || code === 'Period' || code === 'Space' || code === 'Home' || code === 'End' || code === 'PageUp' || code === 'PageDown' || code === 'Insert') keyToken = code;
    else if (code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight') keyToken = code.replace('Arrow', '');
    else if (k.length === 1 && /[a-z0-9]/i.test(k)) keyToken = k.toUpperCase();

    if (!keyToken) {
      return { action: 'invalid', message: 'Unsupported key — use A–Z, 0–9, or F1–F12' };
    }

    const parts = [];
    if (useCtrl) parts.push('Ctrl');
    if (useAlt) parts.push('Alt');
    if (useShift) parts.push('Shift');
    parts.push(keyToken);
    return { action: 'set', shortcut: parts.join('+') };
  }

  async function saveOptKeyboardShortcuts(nextGlobal, nextApps, nextOpenMode, toastMsg = '') {
    try {
      const res = await browser.runtime.sendMessage({
        type: 'UPDATE_KEYBOARD_SHORTCUTS',
        globalShortcuts: nextGlobal,
        appShortcuts: nextApps,
        appShortcutOpenMode: nextOpenMode || appSettings.appShortcutOpenMode || 'sidebar'
      });
      if (res && res.settings) {
        appSettings = res.settings;
      } else {
        appSettings = {
          ...appSettings,
          globalShortcuts: nextGlobal,
          appShortcuts: nextApps,
          appShortcutOpenMode: nextOpenMode || appSettings.appShortcutOpenMode || 'sidebar'
        };
      }
      renderPrivacyTab();
      if (res && res.ok === false && res.error) {
        showToast('Browser reserved shortcut — try Alt+Shift+Key');
      } else if (toastMsg) {
        showToast(toastMsg);
      }
    } catch (_) {
      renderPrivacyTab();
    }
  }

  function attachOptShortcutRecorder(btn, kind, keyOrAppId, labelName) {
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.classList.contains('is-recording')) {
        cancelOptShortcutRecording();
        renderPrivacyTab();
        return;
      }
      cancelOptShortcutRecording();
      const origText = btn.textContent;
      btn.classList.add('is-recording');
      btn.textContent = 'Press keys…';

      const onKeyDown = async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        const parsed = formatOptShortcutFromKeyEvent(ev);
        if (!parsed) return;
        if (parsed.action === 'cancel') {
          cleanup();
          btn.textContent = origText;
          return;
        }
        if (parsed.action === 'invalid') {
          showToast(parsed.message);
          return;
        }

        cleanup();
        const nextGlobal = { ...DEFAULT_GLOBAL_SHORTCUTS_OPT, ...(appSettings.globalShortcuts || {}) };
        const nextApps = { ...(appSettings.appShortcuts || {}) };

        if (parsed.action === 'clear') {
          if (kind === 'global') nextGlobal[keyOrAppId] = '';
          else delete nextApps[keyOrAppId];
          await saveOptKeyboardShortcuts(nextGlobal, nextApps, appSettings.appShortcutOpenMode, `Cleared shortcut for ${labelName}`);
          return;
        }

        const combo = parsed.shortcut;
        const comboNorm = combo.toLowerCase();
        Object.keys(nextGlobal).forEach((gk) => {
          if (!(kind === 'global' && gk === keyOrAppId) && String(nextGlobal[gk] || '').toLowerCase() === comboNorm) {
            nextGlobal[gk] = '';
          }
        });
        Object.keys(nextApps).forEach((aid) => {
          if (!(kind === 'app' && aid === keyOrAppId) && String(nextApps[aid] || '').toLowerCase() === comboNorm) {
            delete nextApps[aid];
          }
        });

        if (kind === 'global') nextGlobal[keyOrAppId] = combo;
        else nextApps[keyOrAppId] = combo;

        await saveOptKeyboardShortcuts(nextGlobal, nextApps, appSettings.appShortcutOpenMode, `${labelName} shortcut set to ${combo}`);
      };

      const onOutside = (ev) => {
        if (ev.target !== btn && !btn.contains(ev.target)) {
          cleanup();
          renderPrivacyTab();
        }
      };

      const cleanup = () => {
        btn.classList.remove('is-recording');
        window.removeEventListener('keydown', onKeyDown, true);
        document.removeEventListener('mousedown', onOutside, true);
        if (activeOptRecorderCleanup === cleanup) activeOptRecorderCleanup = null;
      };

      activeOptRecorderCleanup = cleanup;
      window.addEventListener('keydown', onKeyDown, true);
      document.addEventListener('mousedown', onOutside, true);
    });
  }

  /**
   * Render Tab 4: General & Privacy
   */
  function renderPrivacyTab() {
    const curGlobalSc = { ...DEFAULT_GLOBAL_SHORTCUTS_OPT, ...(appSettings.globalShortcuts || {}) };
    [
      ['opt-sc-global-popup', curGlobalSc.popup],
      ['opt-sc-global-sidebar', curGlobalSc.sidebar],
      ['opt-sc-global-popout', curGlobalSc.popout]
    ].forEach(([id, val]) => {
      const btn = document.getElementById(id);
      if (btn && !btn.classList.contains('is-recording')) {
        const clean = String(val || '').trim();
        btn.textContent = clean || 'Unassigned';
        btn.classList.toggle('has-shortcut', Boolean(clean));
      }
    });

    const appScOpenModeEl = document.getElementById('opt-app-shortcut-open-mode');
    if (appScOpenModeEl) {
      appScOpenModeEl.value = appSettings.appShortcutOpenMode || 'sidebar';
    }

    document.getElementById('opt-poll-interval').value = String(appSettings.pollIntervalSeconds || 30);
    document.getElementById('opt-max-slots').value = String(appSettings.maxSessionSlots || 5);

    const openModeEl = document.getElementById('opt-sidebar-open-mode');
    if (openModeEl) openModeEl.value = appSettings.sidebarOpenMode || 'auto';

    const autoHideTopEl = document.getElementById('opt-autohide-top-bar');
    if (autoHideTopEl) autoHideTopEl.checked = appSettings.autoHideMediaTopBar !== false;

    const showBottomBarEl = document.getElementById('opt-show-bottom-bar');
    if (showBottomBarEl) showBottomBarEl.checked = !appSettings.hideMediaBottomBar;

    const chkKeepAudio = document.getElementById('opt-keep-audio-closed');
    if (chkKeepAudio) {
      chkKeepAudio.checked = appSettings.keepAudioPlayingWhenClosed !== false;
    }

    const tabAudioBehaviorEl = document.getElementById('opt-tab-audio-behavior');
    if (tabAudioBehaviorEl) {
      const effectiveTabMode =
        appSettings.tabAudioBehavior === 'pause-resume' ||
        appSettings.tabAudioBehavior === 'pause-only' ||
        appSettings.tabAudioBehavior === 'off'
          ? appSettings.tabAudioBehavior
          : appSettings.autoPauseOnTabAudio === false
            ? 'off'
            : 'pause-resume';
      tabAudioBehaviorEl.value = effectiveTabMode;
    }

    const mediaApi = window.PocketMailMediaApps;
    const allApps = mediaApi
      ? [
          ...(mediaApi.getOrderedBuiltInApps ? mediaApi.getOrderedBuiltInApps(appSettings) : mediaApi.BUILTIN_MEDIA_APPS),
          ...(Array.isArray(appSettings.customMediaApps) ? appSettings.customMediaApps : [])
        ]
      : [];

    // 1. Background Audio When Extension is Closed (2-column SVG card grid)
    const bgPicker = document.getElementById('opt-bgaudio-apps-picker');
    if (bgPicker && mediaApi) {
      bgPicker.replaceChildren();
      const pickedBgAudioIds = Array.isArray(appSettings.bgAudioAppIds)
        ? appSettings.bgAudioAppIds
        : ['spotify', 'youtube'];

      allApps.forEach((app) => {
        const isAllowed = pickedBgAudioIds.includes(app.id);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `opt-app-toggle-card ${isAllowed ? 'is-active' : ''}`;

        const left = document.createElement('div');
        left.className = 'opt-app-toggle-left';

        const iconWrap = document.createElement('span');
        iconWrap.className = 'opt-app-toggle-icon';
        iconWrap.style.background = app.gradient || app.color || 'var(--accent)';
        iconWrap.appendChild(mediaApi.createAppSvgIcon(app.id, 17));

        const info = document.createElement('div');
        info.className = 'opt-app-toggle-info';
        const nameEl = document.createElement('div');
        nameEl.className = 'opt-app-toggle-name';
        nameEl.textContent = app.name;
        const subEl = document.createElement('div');
        subEl.className = 'opt-app-toggle-sub';
        subEl.textContent = isAllowed ? 'Plays in background' : 'Muted when closed';
        info.appendChild(nameEl);
        info.appendChild(subEl);

        left.appendChild(iconWrap);
        left.appendChild(info);

        const pill = document.createElement('span');
        pill.className = 'opt-app-toggle-pill';
        pill.appendChild(mediaApi.createSubViewIcon(isAllowed ? 'speaker-play' : 'speaker-mute', 12));
        const pillTxt = document.createElement('span');
        pillTxt.textContent = isAllowed ? 'ON' : 'OFF';
        pill.appendChild(pillTxt);

        card.appendChild(left);
        card.appendChild(pill);

        card.addEventListener('click', async () => {
          const nextIds = isAllowed
            ? pickedBgAudioIds.filter((id) => id !== app.id)
            : [...pickedBgAudioIds, app.id];
          await saveSettings(
            { bgAudioAppIds: nextIds },
            isAllowed
              ? `${app.name}: Background audio when closed turned OFF`
              : `${app.name}: Background audio when closed turned ON`
          );
        });
        bgPicker.appendChild(card);
      });
    }

    // 2. Session & Page Memory (Persistent Memory) Mode + 2-column SVG card grid
    const persistMode = appSettings.mediaPersistenceMode || 'custom';
    document.querySelectorAll('#opt-persistence-mode-group [data-persist-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-persist-mode') === persistMode);
    });

    const persistPicker = document.getElementById('opt-persistent-apps-picker');
    if (persistPicker && mediaApi) {
      persistPicker.replaceChildren();
      const pickedPersistIds = Array.isArray(appSettings.persistentAppIds)
        ? appSettings.persistentAppIds
        : [];

      allApps.forEach((app) => {
        const isPersist =
          persistMode === 'all' ? true : persistMode === 'none' ? false : pickedPersistIds.includes(app.id);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `opt-app-toggle-card ${isPersist ? 'is-active' : ''}`;

        const left = document.createElement('div');
        left.className = 'opt-app-toggle-left';

        const iconWrap = document.createElement('span');
        iconWrap.className = 'opt-app-toggle-icon';
        iconWrap.style.background = app.gradient || app.color || 'var(--accent)';
        iconWrap.appendChild(mediaApi.createAppSvgIcon(app.id, 17));

        const info = document.createElement('div');
        info.className = 'opt-app-toggle-info';
        const nameEl = document.createElement('div');
        nameEl.className = 'opt-app-toggle-name';
        nameEl.textContent = app.name;
        const subEl = document.createElement('div');
        subEl.className = 'opt-app-toggle-sub';
        subEl.textContent = isPersist ? 'Remembers page & reel' : 'Fresh start on open';
        info.appendChild(nameEl);
        info.appendChild(subEl);

        left.appendChild(iconWrap);
        left.appendChild(info);

        const pill = document.createElement('span');
        pill.className = 'opt-app-toggle-pill';
        pill.appendChild(mediaApi.createSubViewIcon(isPersist ? 'bolt' : 'eco-leaf', 12));
        const pillTxt = document.createElement('span');
        pillTxt.textContent = isPersist ? 'ON' : 'ECO';
        pill.appendChild(pillTxt);

        card.appendChild(left);
        card.appendChild(pill);

        card.addEventListener('click', async () => {
          const baseIds =
            persistMode === 'all'
              ? allApps.map((a) => a.id)
              : persistMode === 'none'
                ? []
                : pickedPersistIds;
          const nextIds = isPersist ? baseIds.filter((id) => id !== app.id) : [...baseIds, app.id];
          await saveSettings(
            { mediaPersistenceMode: 'custom', persistentAppIds: nextIds },
            isPersist
              ? `${app.name}: Persistent page memory turned OFF`
              : `${app.name}: Persistent page & video memory turned ON`
          );
        });
        persistPicker.appendChild(card);
      });
    }

    // 3. Per-App Direct Keyboard Shortcuts Grid (Mail + All Built-In Apps + All Custom Apps)
    const appScGrid = document.getElementById('opt-app-shortcuts-grid');
    if (appScGrid && mediaApi) {
      appScGrid.replaceChildren();
      const curAppShortcuts = appSettings.appShortcuts || {};
      const shortcutTargets = [
        {
          id: 'pocketmail',
          name: 'Mail Inbox',
          gradient: 'linear-gradient(135deg, #D96B43 0%, #B84C27 100%)',
          iconUrl: '',
          isCustom: false
        },
        ...allApps.map((a) => ({
          id: a.id,
          name: a.name,
          gradient: a.gradient || a.color || 'var(--accent)',
          iconUrl: a.iconUrl || '',
          isCustom: Boolean(a.isCustom || String(a.id || '').startsWith('custom-'))
        }))
      ];

      shortcutTargets.forEach((target) => {
        const assigned = String(curAppShortcuts[target.id] || '').trim();
        const row = document.createElement('div');
        row.className = 'opt-shortcut-item';

        const left = document.createElement('div');
        left.className = 'opt-app-toggle-left';

        const iconWrap = document.createElement('span');
        iconWrap.className = 'opt-app-toggle-icon';
        iconWrap.style.background = target.gradient;
        if (target.isCustom && target.iconUrl) {
          const img = document.createElement('img');
          img.src = target.iconUrl;
          img.alt = target.name;
          img.width = 17;
          img.height = 17;
          img.style.borderRadius = '4px';
          img.style.objectFit = 'contain';
          img.addEventListener('error', () => {
            iconWrap.replaceChildren(mediaApi.createAppSvgIcon(target.id, 17));
          });
          iconWrap.appendChild(img);
        } else {
          iconWrap.appendChild(mediaApi.createAppSvgIcon(target.id, 17));
        }

        const info = document.createElement('div');
        info.className = 'opt-app-toggle-info';
        const nameEl = document.createElement('div');
        nameEl.className = 'opt-app-toggle-name';
        nameEl.textContent = target.name;
        const subEl = document.createElement('div');
        subEl.className = 'opt-app-toggle-sub';
        subEl.textContent = target.isCustom
          ? 'Custom App hotkey'
          : target.id === 'pocketmail'
            ? 'Direct to Mail Inbox'
            : 'Direct app launch hotkey';
        info.appendChild(nameEl);
        info.appendChild(subEl);

        left.appendChild(iconWrap);
        left.appendChild(info);

        const rightGroup = document.createElement('div');
        rightGroup.style.display = 'flex';
        rightGroup.style.alignItems = 'center';
        rightGroup.style.gap = '6px';
        rightGroup.style.flexShrink = '0';

        const recBtn = document.createElement('button');
        recBtn.type = 'button';
        recBtn.className = `opt-shortcut-recorder-btn ${assigned ? 'has-shortcut' : ''}`;
        recBtn.dataset.appShortcutId = target.id;
        recBtn.textContent = assigned || 'Set Key';
        recBtn.title = `Click and press shortcut for ${target.name} (Backspace/Delete clears)`;
        attachOptShortcutRecorder(recBtn, 'app', target.id, target.name);
        rightGroup.appendChild(recBtn);

        if (assigned) {
          const clearBtn = document.createElement('button');
          clearBtn.type = 'button';
          clearBtn.className = 'opt-shortcut-clear-btn';
          clearBtn.title = `Clear shortcut for ${target.name}`;
          const xSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          xSvg.setAttribute('width', '13');
          xSvg.setAttribute('height', '13');
          xSvg.setAttribute('viewBox', '0 0 24 24');
          xSvg.setAttribute('fill', 'none');
          xSvg.setAttribute('stroke', 'currentColor');
          xSvg.setAttribute('stroke-width', '2.3');
          xSvg.setAttribute('stroke-linecap', 'round');
          const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          l1.setAttribute('x1', '18');
          l1.setAttribute('y1', '6');
          l1.setAttribute('x2', '6');
          l1.setAttribute('y2', '18');
          const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          l2.setAttribute('x1', '6');
          l2.setAttribute('y1', '6');
          l2.setAttribute('x2', '18');
          l2.setAttribute('y2', '18');
          xSvg.appendChild(l1);
          xSvg.appendChild(l2);
          clearBtn.appendChild(xSvg);
          clearBtn.addEventListener('click', async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const nextGlobal = { ...DEFAULT_GLOBAL_SHORTCUTS_OPT, ...(appSettings.globalShortcuts || {}) };
            const nextApps = { ...(appSettings.appShortcuts || {}) };
            delete nextApps[target.id];
            await saveOptKeyboardShortcuts(
              nextGlobal,
              nextApps,
              appSettings.appShortcutOpenMode,
              `Cleared shortcut for ${target.name}`
            );
          });
          rightGroup.appendChild(clearBtn);
        }

        row.appendChild(left);
        row.appendChild(rightGroup);
        appScGrid.appendChild(row);
      });
    }
  }

  function renderAll() {
    PocketMailThemes.applyThemeAndWallpaper(document, appSettings);
    renderAccountsTab();
    renderBackgroundsTab();
    renderNotificationsTab();
    renderPrivacyTab();
  }

  function bindEvents() {
    // Sidebar tab switching
    document.querySelectorAll('.opt-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.opt-nav-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.opt-tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        document.getElementById(tabId)?.classList.add('active');
      });
    });

    // Accounts actions
    document.getElementById('opt-btn-google-login').addEventListener('click', async () => {
      await browser.runtime.sendMessage({ type: 'OPEN_GOOGLE_LOGIN' });
      showToast('Opening Google Account Sign-In window…');
    });

    document.getElementById('opt-btn-rescan').addEventListener('click', async () => {
      showToast('Rescanning signed-in accounts…');
      const res = await browser.runtime.sendMessage({ type: 'SYNC_NOW' });
      if (res && res.state) {
        appState = res.state;
        appSettings = res.settings;
        renderAll();
        showToast(`Synced ${appState.accounts.length} account(s)`);
      }
    });

    document.getElementById('opt-demo-mode').addEventListener('change', async (e) => {
      await saveSettings({ demoMode: e.target.value }, 'Updated Preview Mode setting');
    });

    document.getElementById('opt-max-emails-per-account')?.addEventListener('change', async (e) => {
      await saveSettings({ maxEmailsPerAccount: parseInt(e.target.value, 10) }, 'Updated emails displayed per account');
    });

    document.getElementById('opt-badge-count-mode')?.addEventListener('change', async (e) => {
      await saveSettings({ badgeCountMode: e.target.value }, 'Updated toolbar unread counter mode');
    });

    document.getElementById('opt-btn-oauth-connect').addEventListener('click', async () => {
      const clientId = document.getElementById('opt-oauth-client-id').value.trim();
      if (!clientId) {
        showToast('Please paste a Google OAuth Client ID first.');
        return;
      }
      try {
        const res = await browser.runtime.sendMessage({
          type: 'CONNECT_OAUTH_ACCOUNT',
          clientId
        });
        if (res && res.ok) {
          appState = res.state;
          appSettings = res.settings;
          renderAll();
          showToast(`Connected ${res.account.email}!`);
        }
      } catch (err) {
        showToast(err.message || 'OAuth login cancelled');
      }
    });

    // Backgrounds & Theme controls
    document.getElementById('opt-input-custom-bg').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        await saveSettings(
          { wallpaper: 'custom', customWallpaperData: reader.result },
          'Custom background image saved locally!'
        );
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('opt-btn-reset-bg').addEventListener('click', async () => {
      const themeObj = PocketMailThemes.THEMES[appSettings.theme] || PocketMailThemes.THEMES['warm-linen'];
      await saveSettings(
        { wallpaper: themeObj.defaultWallpaper, customWallpaperData: '' },
        'Reset to default theme background'
      );
    });

    document.getElementById('opt-wallpaper-opacity').addEventListener('input', async (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById('opt-wallpaper-opacity-val').textContent = `${Math.round(val * 100)}%`;
      await saveSettings({ wallpaperOpacity: val });
    });

    document.getElementById('opt-card-opacity').addEventListener('input', async (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById('opt-card-opacity-val').textContent = `${Math.round(val * 100)}%`;
      await saveSettings({ cardOpacity: val });
    });

    document.getElementById('opt-card-blur').addEventListener('input', async (e) => {
      const val = parseInt(e.target.value, 10);
      document.getElementById('opt-card-blur-val').textContent = `${val}px`;
      await saveSettings({ cardBlur: val });
    });

    document.getElementById('opt-card-radius').addEventListener('input', async (e) => {
      const val = parseInt(e.target.value, 10);
      document.getElementById('opt-card-radius-val').textContent = `${val}px`;
      await saveSettings({ cardRadius: val });
    });

    document.getElementById('opt-card-style').addEventListener('change', (e) => {
      saveSettings({ cardStyle: e.target.value }, 'Updated Email Card Style');
    });

    document.getElementById('opt-tab-style').addEventListener('change', (e) => {
      saveSettings({ tabStyle: e.target.value }, 'Updated Account Tab Style');
    });

    document.getElementById('opt-card-density').addEventListener('change', (e) => {
      saveSettings({ cardDensity: e.target.value }, 'Updated Email Card Density');
    });

    document.getElementById('opt-ambient-effect').addEventListener('change', (e) => {
      saveSettings({ ambientEffect: e.target.value }, 'Updated Ambient Atmosphere');
    });

    document.getElementById('opt-font-style')?.addEventListener('change', (e) => {
      saveSettings({ fontStyle: e.target.value }, 'Updated Typography Style');
    });

    document.getElementById('opt-social-theme-mode')?.addEventListener('change', (e) => {
      saveSettings({ socialAppThemeMode: e.target.value }, 'Updated Social & Media App Theme Palette');
    });

    // Notifications & Sound controls
    document.getElementById('opt-mute-all')?.addEventListener('change', (e) => {
      const muted = Boolean(e.target.checked);
      saveSettings(
        {
          muteEmailNotifications: muted,
          muteSiteNotifications: muted,
          socialAppNotifySounds: !muted,
          dndUntil: 0
        },
        muted ? 'All notifications muted' : 'All notifications unmuted'
      );
    });

    document.getElementById('opt-mute-email')?.addEventListener('change', (e) => {
      const muted = Boolean(e.target.checked);
      saveSettings(
        { muteEmailNotifications: muted, dndUntil: 0 },
        muted ? 'Email notifications muted' : 'Email notifications unmuted'
      );
    });

    document.getElementById('opt-mute-sites')?.addEventListener('change', (e) => {
      const muted = Boolean(e.target.checked);
      saveSettings(
        { muteSiteNotifications: muted, socialAppNotifySounds: !muted },
        muted ? 'Sites & apps notifications muted' : 'Sites & apps notifications unmuted'
      );
    });

    document.getElementById('opt-desktop-notif').addEventListener('change', (e) => {
      saveSettings({ desktopNotifications: e.target.checked }, 'Updated desktop notifications');
    });

    document.getElementById('opt-voice-notif').addEventListener('change', (e) => {
      saveSettings({ voiceNotifications: e.target.checked }, 'Updated automatic voice announcements');
    });

    document.getElementById('opt-social-notif-sounds')?.addEventListener('change', (e) => {
      const enabled = Boolean(e.target.checked);
      saveSettings(
        { socialAppNotifySounds: enabled, muteSiteNotifications: !enabled },
        'Updated social app notification chimes'
      );
    });

    document.getElementById('opt-sound-volume').addEventListener('input', async (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById('opt-sound-volume-val').textContent = `${Math.round(val * 100)}%`;
      await saveSettings({ soundVolume: val });
    });

    document.getElementById('opt-input-custom-audio').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        await saveSettings(
          { soundId: 'custom', customAudioData: reader.result },
          'Custom notification sound uploaded!'
        );
        PocketMailSound.playNotificationSound('custom', appSettings.soundVolume, reader.result);
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('opt-tts-voice').addEventListener('change', (e) => {
      saveSettings({ ttsVoice: e.target.value }, 'Updated reading voice');
    });

    document.getElementById('opt-tts-rate').addEventListener('input', async (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById('opt-tts-rate-val').textContent = `${val.toFixed(2)}x`;
      await saveSettings({ ttsRate: val });
    });

    document.getElementById('opt-btn-test-tts').addEventListener('click', () => {
      PocketMailSound.speakEmail(
        {
          id: 'test-tts',
          senderName: 'FoxHub Studio',
          subject: 'Warm Greeting',
          snippet: 'Hello! Your local voice reader is ready to read your emails aloud whenever you like.'
        },
        appSettings
      );
    });

    document.getElementById('opt-btn-test-notif').addEventListener('click', async () => {
      await browser.runtime.sendMessage({ type: 'SYNC_NOW', forceTestNotification: true });
      showToast('Sent test notification & chime!');
    });

    // General & Privacy controls
    attachOptShortcutRecorder(
      document.getElementById('opt-sc-global-popup'),
      'global',
      'popup',
      'Floating Dropdown Popup'
    );
    attachOptShortcutRecorder(
      document.getElementById('opt-sc-global-sidebar'),
      'global',
      'sidebar',
      'Left Sidebar'
    );
    attachOptShortcutRecorder(
      document.getElementById('opt-sc-global-popout'),
      'global',
      'popout',
      'Desktop Popout Window'
    );

    document.getElementById('opt-app-shortcut-open-mode')?.addEventListener('change', async (e) => {
      const nextMode = e.target.value || 'sidebar';
      const nextGlobal = { ...DEFAULT_GLOBAL_SHORTCUTS_OPT, ...(appSettings.globalShortcuts || {}) };
      const nextApps = { ...(appSettings.appShortcuts || {}) };
      await saveOptKeyboardShortcuts(
        nextGlobal,
        nextApps,
        nextMode,
        'Updated per-app shortcut open mode'
      );
    });

    document.getElementById('opt-btn-reset-shortcuts')?.addEventListener('click', async () => {
      const res = await browser.runtime.sendMessage({ type: 'RESET_KEYBOARD_SHORTCUTS' }).catch(() => null);
      if (res && res.settings) {
        appSettings = res.settings;
      } else {
        appSettings = {
          ...appSettings,
          globalShortcuts: { ...DEFAULT_GLOBAL_SHORTCUTS_OPT },
          appShortcuts: {},
          appShortcutOpenMode: 'sidebar'
        };
      }
      renderPrivacyTab();
      showToast('Keyboard shortcuts reset to defaults');
    });

    document.getElementById('opt-poll-interval').addEventListener('change', (e) => {
      saveSettings({ pollIntervalSeconds: parseInt(e.target.value, 10) }, 'Updated check interval');
    });

    document.getElementById('opt-max-slots').addEventListener('change', (e) => {
      saveSettings({ maxSessionSlots: parseInt(e.target.value, 10) }, 'Updated multi-account slot scan count');
    });

    document.getElementById('opt-sidebar-open-mode')?.addEventListener('change', (e) => {
      saveSettings({ sidebarOpenMode: e.target.value }, 'Updated sidebar open mode');
    });

    document.getElementById('opt-autohide-top-bar')?.addEventListener('change', (e) => {
      saveSettings({ autoHideMediaTopBar: Boolean(e.target.checked) }, 'Updated media top bar behavior');
    });

    document.getElementById('opt-show-bottom-bar')?.addEventListener('change', (e) => {
      saveSettings({ hideMediaBottomBar: !e.target.checked }, 'Updated quick sub-view bottom bar');
    });

    document.getElementById('opt-keep-audio-closed')?.addEventListener('change', (e) => {
      saveSettings(
        { keepAudioPlayingWhenClosed: Boolean(e.target.checked) },
        e.target.checked
          ? 'Background audio keep-alive enabled when closed'
          : 'Background audio will pause when closed'
      );
    });

    document.getElementById('opt-tab-audio-behavior')?.addEventListener('change', (e) => {
      const nextMode = e.target.value || 'pause-resume';
      const labelMap = {
        'pause-resume': 'When Tab Plays Audio: Auto-Pause & Auto-Resume enabled',
        'pause-only': 'When Tab Plays Audio: Pause Only (stays stopped)',
        off: 'When Tab Plays Audio: Keep Playing Simultaneously (Off)'
      };
      saveSettings(
        {
          tabAudioBehavior: nextMode,
          autoPauseOnTabAudio: nextMode !== 'off'
        },
        labelMap[nextMode] || 'Updated browser tab audio behavior'
      );
    });

    document.querySelectorAll('#opt-persistence-mode-group [data-persist-mode]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const mode = btn.getAttribute('data-persist-mode');
        const label =
          mode === 'none'
            ? 'Eco Mode (0 MB background memory)'
            : mode === 'all'
              ? 'All Apps persistent memory enabled'
              : 'Selected Apps persistent memory enabled';
        await saveSettings({ mediaPersistenceMode: mode }, label);
      });
    });

    document.getElementById('opt-btn-clear-cache').addEventListener('click', async () => {
      const res = await browser.runtime.sendMessage({ type: 'CLEAR_LOCAL_CACHE' });
      if (res && res.state) {
        appState = res.state;
        renderAll();
        showToast('Cleared local read, snooze & sent cache');
      }
    });

    document.getElementById('opt-btn-clear-page-memory')?.addEventListener('click', async () => {
      try {
        localStorage.removeItem('pm_fast_boot_v1');
      } catch (_) {}
      try {
        await browser.storage.local.remove('pm_page_memory_v1');
      } catch (_) {}
      await browser.runtime.sendMessage({ type: 'CLEAR_PERSISTENT_SESSIONS' }).catch(() => {});
      showToast('Cleared saved page, video & reel positions');
    });

    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = populateVoicesDropdown;
    }

    browser.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'STATE_UPDATED') {
        appState = msg.state;
        appSettings = msg.settings;
        renderAll();
      }
    });
  }

  async function init() {
    bindEvents();
    const res = await browser.runtime.sendMessage({ type: 'GET_STATE' });
    if (res) {
      appState = res.state || appState;
      appSettings = res.settings || appSettings;
      renderAll();
    }
  }

  init();
})();
