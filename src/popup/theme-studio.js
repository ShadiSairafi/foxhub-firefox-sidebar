/**
 * FoxHub — Visual Customizer Studio Drawer, Live Combination Preview & True Night OLED Toggle
 * Pure DOM APIs (0 innerHTML / 0 DOMParser HTML strings) + Dual Gradient Key Sync.
 */

(function (global) {
  const P = (global.FoxHubPopup = global.FoxHubPopup || {});

  P.openThemeDrawer = function () {
    P.closeHeaderMoreMenu?.();
    P.closeMutePopover?.();
    P.closeRailContextMenu?.();
    P.setDrawerOpen(P.dom.themeDrawer, true);
    P.renderThemeStudioGrids();
    P.syncStudioControlsState();
  };

  P.syncStudioControlsState = function () {
    const s = P.state.appSettings;
    const bgOp = s.wallpaperOpacity !== undefined ? s.wallpaperOpacity : 0.95;
    const bgBlur = s.wallpaperBlur !== undefined ? s.wallpaperBlur : 0;
    const cardOp = s.cardOpacity !== undefined ? s.cardOpacity : 0.62;
    const cardBlur = s.cardBlur !== undefined ? s.cardBlur : 16;
    const cardRad = s.cardRadius !== undefined ? s.cardRadius : 15;

    const rngBgOp = document.getElementById('rng-bg-opacity');
    const lblBgOp = document.getElementById('lbl-bg-opacity');
    if (rngBgOp && lblBgOp) {
      rngBgOp.value = bgOp;
      lblBgOp.textContent = `${Math.round(bgOp * 100)}%`;
    }

    const rngBgBlur = document.getElementById('rng-bg-blur');
    const lblBgBlur = document.getElementById('lbl-bg-blur');
    if (rngBgBlur && lblBgBlur) {
      rngBgBlur.value = bgBlur;
      lblBgBlur.textContent = `${bgBlur}px`;
    }

    const rngCardOp = document.getElementById('rng-card-opacity');
    const lblCardOp = document.getElementById('lbl-card-opacity');
    if (rngCardOp && lblCardOp) {
      rngCardOp.value = cardOp;
      lblCardOp.textContent = `${Math.round(cardOp * 100)}%`;
    }

    const rngCardBlur = document.getElementById('rng-card-blur');
    const lblCardBlur = document.getElementById('lbl-card-blur');
    if (rngCardBlur && lblCardBlur) {
      rngCardBlur.value = cardBlur;
      lblCardBlur.textContent = `${cardBlur}px`;
    }

    const rngCardRad = document.getElementById('rng-card-radius');
    const lblCardRad = document.getElementById('lbl-card-radius');
    if (rngCardRad && lblCardRad) {
      rngCardRad.value = cardRad;
      lblCardRad.textContent = `${cardRad}px`;
    }

    const popupW = s.popupWidth !== undefined ? s.popupWidth : 520;
    const rngPopupW = document.getElementById('rng-popup-width');
    const lblPopupW = document.getElementById('lbl-popup-width');
    if (rngPopupW && lblPopupW) {
      rngPopupW.value = popupW;
      lblPopupW.textContent = `${popupW}px`;
    }

    const clrGrad1 = document.getElementById('clr-grad-1');
    const clrGrad2 = document.getElementById('clr-grad-2');
    if (clrGrad1) clrGrad1.value = s.gradientColor1 || s.customGradient1 || '#FAD6A5';
    if (clrGrad2) clrGrad2.value = s.gradientColor2 || s.customGradient2 || '#E8A598';

    const highlightGroup = (selector, attr, currentVal) => {
      document.querySelectorAll(selector).forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute(attr) === currentVal);
      });
    };

    highlightGroup('[data-card-style]', 'data-card-style', s.cardStyle || 'glassmorphism');
    highlightGroup('[data-card-actions]', 'data-card-actions', s.cardActionsMode || 'always');
    highlightGroup('[data-card-density]', 'data-card-density', s.cardDensity || 'cozy');
    highlightGroup('[data-avatar-shape]', 'data-avatar-shape', s.avatarShape || 'squircle');
    highlightGroup('[data-left-accent-opt]', 'data-left-accent-opt', s.showLeftAccent !== false ? 'on' : 'off');
    highlightGroup('[data-tab-style]', 'data-tab-style', s.tabStyle || 'glass-pills');
    highlightGroup('[data-badge-mode]', 'data-badge-mode', s.badgeCountMode || 'feed');
    highlightGroup('[data-ambient]', 'data-ambient', s.ambientEffect || 'sunbeams');
    highlightGroup('[data-font]', 'data-font', s.fontStyle || 'editorial');

    P.renderStudioLivePreview();
  };

  P.renderStudioLivePreview = function () {
    const previewContainer = document.getElementById('pm-preview-content');
    const comboLabel = document.getElementById('lbl-preview-combo');
    if (!previewContainer) return;

    const st = P.state;
    const s = st.appSettings;
    const themesApi = P.getThemesApi();
    const iconsApi = P.getIconsApi();
    if (!themesApi) return;

    const themeObj = themesApi.THEMES[s.theme] || themesApi.THEMES['warm-linen'];
    const styleNames = {
      glassmorphism: 'Crystal Glass',
      'tinted-glass': 'Tinted Glass',
      'warm-paper': 'Warm Paper',
      'floating-minimal': 'Floating',
      'outlined-editorial': 'Outlined'
    };
    const styleLabel = styleNames[s.cardStyle || 'glassmorphism'] || 'Crystal Glass';
    const opPct = Math.round((s.cardOpacity !== undefined ? s.cardOpacity : 0.62) * 100);
    if (comboLabel) {
      comboLabel.textContent = `• ${themeObj.name} • ${styleLabel} (${opPct}%)`;
    }

    const activeAccounts = (st.appState.accounts || []).filter((a) => !a.disabled);
    let sampleMsg = null;
    for (const acc of activeAccounts) {
      if (acc.messages && acc.messages.length > 0) {
        sampleMsg = acc.messages[0];
        break;
      }
    }
    if (!sampleMsg) {
      sampleMsg = {
        id: 'preview-sample',
        senderName: 'Google',
        senderEmail: 'no-reply@accounts.google.com',
        subject: 'Security alert — Live customization preview',
        snippet: 'See how your background, glassmorphism opacity, blur, and tabs look together in real time.',
        timestamp: Date.now() - 120000,
        starred: true,
        accountEmail: 'demo@gmail.com',
        accountNickname: 'Personal',
        accountColor: '#D95032'
      };
    }

    const initials = P.getInitials(sampleMsg.senderName, sampleMsg.senderEmail);
    const color = sampleMsg.accountColor || '#D95032';
    const accShort = sampleMsg.accountNickname || (sampleMsg.accountEmail || 'personal').split('@')[0];
    const acc1 = activeAccounts[0] || { email: 'personal@gmail.com', nickname: 'Personal', color: '#D95032', unreadCount: 4 };
    const acc2 = activeAccounts[1] || { email: 'work@gmail.com', nickname: 'Work', color: '#2A7B6F', unreadCount: 2 };
    const totalCount = st.appState.totalUnread || acc1.unreadCount + acc2.unreadCount;

    const frag = document.createDocumentFragment();

    // Accounts bar preview
    const accBar = document.createElement('div');
    accBar.className = 'pm-accounts-bar';
    const mkPill = (label, cnt, active, dotColor) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pm-account-pill${active ? ' active' : ''}`;
      if (dotColor) {
        const dot = document.createElement('span');
        dot.className = 'pm-account-dot';
        dot.style.background = dotColor;
        btn.appendChild(dot);
      }
      const sp = document.createElement('span');
      sp.textContent = label;
      const cntEl = document.createElement('span');
      cntEl.className = 'pm-account-count';
      cntEl.textContent = String(cnt);
      btn.appendChild(sp);
      btn.appendChild(cntEl);
      return btn;
    };
    accBar.appendChild(mkPill('All Inboxes', totalCount, true, null));
    accBar.appendChild(mkPill(acc1.nickname || acc1.email.split('@')[0], acc1.unreadCount, false, acc1.color || '#D95032'));
    accBar.appendChild(mkPill(acc2.nickname || acc2.email.split('@')[0], acc2.unreadCount, false, acc2.color || '#2A7B6F'));
    frag.appendChild(accBar);

    // Card preview
    const card = document.createElement('article');
    card.className = 'pm-email-card';
    card.style.setProperty('--card-account-color', color);

    const left = document.createElement('div');
    left.className = 'pm-card-left';
    const avCont = document.createElement('div');
    avCont.className = 'pm-avatar-container';
    if (iconsApi?.createSenderAvatarElement) {
      avCont.appendChild(iconsApi.createSenderAvatarElement(document, sampleMsg, initials, color));
    } else {
      const av = document.createElement('div');
      av.className = 'pm-avatar';
      av.style.background = color;
      av.textContent = initials;
      avCont.appendChild(av);
    }
    const avDot = document.createElement('span');
    avDot.className = 'pm-avatar-acc-dot';
    avDot.style.background = color;
    avCont.appendChild(avDot);

    const starBtn = document.createElement('button');
    starBtn.type = 'button';
    starBtn.className = 'pm-star-btn starred';
    starBtn.title = 'Starred';
    starBtn.appendChild(P.createSvgIcon('starFilled', 14));
    left.appendChild(avCont);
    left.appendChild(starBtn);

    const main = document.createElement('div');
    main.className = 'pm-card-main';
    const top = document.createElement('div');
    top.className = 'pm-card-top';
    const sWrap = document.createElement('div');
    sWrap.className = 'pm-sender-wrap';
    const sNm = document.createElement('span');
    sNm.className = 'pm-sender-name';
    sNm.textContent = sampleMsg.senderName;
    const tag = document.createElement('span');
    tag.className = 'pm-account-tag';
    tag.style.color = color;
    tag.style.borderColor = `${color}40`;
    tag.style.background = `${color}18`;
    tag.textContent = accShort;
    sWrap.appendChild(sNm);
    sWrap.appendChild(tag);
    const tEl = document.createElement('span');
    tEl.className = 'pm-card-time';
    tEl.textContent = 'Just now';
    top.appendChild(sWrap);
    top.appendChild(tEl);

    const subj = document.createElement('div');
    subj.className = 'pm-card-subject';
    subj.textContent = sampleMsg.subject;
    const snip = document.createElement('div');
    snip.className = 'pm-card-snippet';
    snip.textContent = sampleMsg.snippet || 'Live preview of your email card styling…';

    const acts = document.createElement('div');
    acts.className = 'pm-card-actions';
    [
      ['speaker', 'Listen', ''],
      ['check', 'Read', ''],
      ['archive', 'Archive', ''],
      ['clock', 'Snooze', ''],
      ['trash', 'Delete', 'pm-action-pill-danger']
    ].forEach(([ik, lbl, cls]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `pm-action-pill${cls ? ` ${cls}` : ''}`;
      b.appendChild(P.createSvgIcon(ik, 12));
      const sp = document.createElement('span');
      sp.textContent = lbl;
      b.appendChild(sp);
      acts.appendChild(b);
    });

    main.appendChild(top);
    main.appendChild(subj);
    main.appendChild(snip);
    main.appendChild(acts);
    card.appendChild(left);
    card.appendChild(main);
    frag.appendChild(card);

    previewContainer.replaceChildren(frag);
  };

  P.renderThemeStudioGrids = function () {
    const themesApi = P.getThemesApi();
    if (!themesApi) return;
    const s = P.state.appSettings;
    const themeGrid = document.getElementById('pm-theme-grid');
    const wallpaperGrid = document.getElementById('pm-wallpaper-grid');

    const currentThemeId = s.theme || 'warm-linen';
    const currentWallpaperId = s.wallpaper || 'watercolor-hills';

    if (themeGrid) {
      const frag = document.createDocumentFragment();
      Object.values(themesApi.THEMES).forEach((t) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `pm-theme-card ${currentThemeId === t.id ? 'active' : ''}`;
        card.setAttribute('data-theme-id', t.id);
        const sw = document.createElement('div');
        sw.className = 'pm-theme-swatch';
        sw.style.background = t.previewGradient;
        const dot = document.createElement('span');
        dot.className = 'pm-theme-swatch-dot';
        dot.style.background = t.accentDot;
        sw.appendChild(dot);

        const info = document.createElement('div');
        const ttl = document.createElement('div');
        ttl.className = 'pm-theme-card-title';
        ttl.textContent = t.name;
        const sub = document.createElement('div');
        sub.className = 'pm-theme-card-sub';
        sub.textContent = t.subtitle;
        info.appendChild(ttl);
        info.appendChild(sub);

        card.appendChild(sw);
        card.appendChild(info);
        card.addEventListener('click', async () => {
          const curWp = P.state.appSettings.wallpaper;
          const nextWallpaper =
            curWp === 'custom' || curWp === 'custom-gradient'
              ? curWp
              : t.defaultWallpaper || curWp;
          await P.saveSettingsPatch({ theme: t.id, wallpaper: nextWallpaper });
          P.renderThemeStudioGrids();
          P.showToast(`Theme: ${t.name}`);
        });
        frag.appendChild(card);
      });
      themeGrid.replaceChildren(frag);
    }

    if (wallpaperGrid) {
      const frag = document.createDocumentFragment();
      Object.values(themesApi.WALLPAPERS).forEach((wp) => {
        const bgUrl = wp.svg ? themesApi.svgToDataUrl(wp.svg) : 'none';
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `pm-wallpaper-card ${currentWallpaperId === wp.id ? 'active' : ''}`;
        card.setAttribute('data-wp-id', wp.id);
        const prev = document.createElement('div');
        prev.className = 'pm-wallpaper-preview';
        prev.style.backgroundImage = bgUrl;
        const nm = document.createElement('div');
        nm.className = 'pm-wallpaper-name';
        nm.textContent = wp.name;
        const desc = document.createElement('div');
        desc.className = 'pm-wallpaper-desc';
        desc.textContent = wp.description;

        card.appendChild(prev);
        card.appendChild(nm);
        card.appendChild(desc);
        card.addEventListener('click', async () => {
          await P.saveSettingsPatch({ wallpaper: wp.id });
          P.renderThemeStudioGrids();
          P.showToast(`Background: ${wp.name}`);
        });
        frag.appendChild(card);
      });
      wallpaperGrid.replaceChildren(frag);
    }
  };

  P.syncNightModeButtons = function () {
    const isTrueNight = P.state.appSettings.theme === 'true-night';
    const railNightBtn = document.getElementById('rail-btn-night-mode');
    if (railNightBtn && typeof P.createRailUiSvg === 'function') {
      railNightBtn.classList.toggle('is-night-active', isTrueNight);
      railNightBtn.title = isTrueNight
        ? 'True Night OLED Mode is ON (#000000) — Click to restore Day Theme'
        : 'Toggle True Night Mode (OLED Pitch-Black #000000)';
      railNightBtn.replaceChildren(P.createRailUiSvg(isTrueNight ? 'sun' : 'moon', 15));
    }
  };

  P.toggleTrueNightMode = async function () {
    const st = P.state;
    const s = st.appSettings;
    const isCurrentlyNight = s.theme === 'true-night';
    const prevSocialMode = s.socialAppThemeMode || 'native';
    const themesApi = P.getThemesApi();

    if (!isCurrentlyNight) {
      await P.saveSettingsPatch({
        previousDayTheme: s.theme || 'warm-linen',
        previousDayWallpaper: s.wallpaper || 'watercolor-hills',
        previousDaySocialTheme: prevSocialMode,
        previousDayAmbient: s.ambientEffect || 'sunbeams',
        theme: 'true-night',
        wallpaper: 'none',
        ambientEffect: 'none',
        socialAppThemeMode: 'true-night'
      });
      themesApi?.applyThemeAndWallpaper(document, st.appSettings);
      P.broadcastSocialAppTheme?.(prevSocialMode);
      P.renderAll?.();
      if (P.dom.readerDrawer && !P.dom.readerDrawer.classList.contains('hidden') && st.activeReaderMessage) {
        P.adaptEmailDomForDarkMode?.(document.getElementById('reader-body'));
      }
      P.showToast('True Night OLED Mode enabled (#000000)');
    } else {
      const restoredTheme =
        s.previousDayTheme && s.previousDayTheme !== 'true-night' ? s.previousDayTheme : 'warm-linen';
      const restoredWall = s.previousDayWallpaper || 'watercolor-hills';
      const restoredAmbient = s.previousDayAmbient || 'sunbeams';
      const restoredSocial =
        s.previousDaySocialTheme && s.previousDaySocialTheme !== 'true-night' ? s.previousDaySocialTheme : 'native';
      await P.saveSettingsPatch({
        theme: restoredTheme,
        wallpaper: restoredWall,
        ambientEffect: restoredAmbient,
        socialAppThemeMode: restoredSocial
      });
      themesApi?.applyThemeAndWallpaper(document, st.appSettings);
      P.broadcastSocialAppTheme?.(prevSocialMode);
      P.renderAll?.();
      P.showToast('Restored previous theme');
    }
  };

  P.bindThemeStudioEvents = function () {
    const themeDrawer = P.dom.themeDrawer;

    document.getElementById('btn-backgrounds')?.addEventListener('click', P.openThemeDrawer);
    document.getElementById('btn-theme-back')?.addEventListener('click', () => {
      P.setDrawerOpen(themeDrawer, false);
    });

    document.querySelectorAll('.pm-studio-tab').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        document.querySelectorAll('.pm-studio-tab').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.pm-studio-panel').forEach((p) => {
          p.classList.remove('active');
          p.classList.add('hidden');
        });
        tabBtn.classList.add('active');
        const targetId = tabBtn.getAttribute('data-studio-tab');
        const panel = document.getElementById(targetId);
        if (panel) {
          panel.classList.remove('hidden');
          panel.classList.add('active');
        }
      });
    });

    document.getElementById('btn-open-full-studio')?.addEventListener('click', () => {
      browser.runtime.openOptionsPage();
    });

    const peekBtn = document.getElementById('btn-studio-peek');
    if (peekBtn && themeDrawer) {
      peekBtn.addEventListener('mousedown', () => themeDrawer.classList.add('is-peeking'));
      peekBtn.addEventListener('mouseup', () => themeDrawer.classList.remove('is-peeking'));
      peekBtn.addEventListener('mouseleave', () => themeDrawer.classList.remove('is-peeking'));
    }

    const togglePreviewBtn = document.getElementById('btn-toggle-preview-dock');
    const previewDock = document.getElementById('pm-studio-preview-dock');
    const lblTogglePreview = document.getElementById('lbl-toggle-preview');
    if (togglePreviewBtn && previewDock) {
      togglePreviewBtn.addEventListener('click', () => {
        const isCollapsed = previewDock.classList.toggle('collapsed');
        if (lblTogglePreview) {
          lblTogglePreview.textContent = isCollapsed ? 'Show Preview' : 'Minimize';
        }
      });
    }

    document.getElementById('rng-bg-opacity')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const lbl = document.getElementById('lbl-bg-opacity');
      if (lbl) lbl.textContent = `${Math.round(val * 100)}%`;
      P.saveSettingsPatch({ wallpaperOpacity: val });
    });

    document.getElementById('rng-bg-blur')?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      const lbl = document.getElementById('lbl-bg-blur');
      if (lbl) lbl.textContent = `${val}px`;
      P.saveSettingsPatch({ wallpaperBlur: val });
    });

    document.getElementById('rng-card-opacity')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const lbl = document.getElementById('lbl-card-opacity');
      if (lbl) lbl.textContent = `${Math.round(val * 100)}%`;
      P.saveSettingsPatch({ cardOpacity: val });
    });

    document.getElementById('rng-card-blur')?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      const lbl = document.getElementById('lbl-card-blur');
      if (lbl) lbl.textContent = `${val}px`;
      P.saveSettingsPatch({ cardBlur: val });
    });

    document.getElementById('rng-card-radius')?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      const lbl = document.getElementById('lbl-card-radius');
      if (lbl) lbl.textContent = `${val}px`;
      P.saveSettingsPatch({ cardRadius: val });
    });

    document.getElementById('rng-popup-width')?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      const lbl = document.getElementById('lbl-popup-width');
      if (lbl) lbl.textContent = `${val}px`;
      P.saveSettingsPatch({ popupWidth: val });
      setTimeout(() => P.applyEmailReaderScale?.(), 60);
    });

    document.getElementById('btn-apply-gradient')?.addEventListener('click', async () => {
      const c1 = document.getElementById('clr-grad-1')?.value || '#FAD6A5';
      const c2 = document.getElementById('clr-grad-2')?.value || '#E8A598';
      await P.saveSettingsPatch({
        wallpaper: 'custom-gradient',
        gradientColor1: c1,
        gradientColor2: c2,
        customGradient1: c1,
        customGradient2: c2
      });
      P.renderThemeStudioGrids();
      P.showToast('Custom gradient background applied!');
    });

    document.getElementById('btn-apply-bg-url')?.addEventListener('click', async () => {
      const url = (document.getElementById('input-custom-bg-url')?.value || '').trim();
      if (!url) {
        P.showToast('Paste an image URL first');
        return;
      }
      await P.saveSettingsPatch({
        wallpaper: 'custom',
        customWallpaperData: url,
        customWallpaperUrl: url
      });
      P.renderThemeStudioGrids();
      P.showToast('Custom image URL applied!');
    });

    document.getElementById('input-custom-bg')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        await P.saveSettingsPatch({
          wallpaper: 'custom',
          customWallpaperData: reader.result
        });
        P.renderThemeStudioGrids();
        P.showToast('Custom photo background applied!');
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('btn-clear-custom-bg')?.addEventListener('click', async () => {
      const themesApi = P.getThemesApi();
      const themeObj = themesApi?.THEMES[P.state.appSettings.theme] || themesApi?.THEMES['warm-linen'];
      await P.saveSettingsPatch({
        wallpaper: themeObj ? themeObj.defaultWallpaper : 'watercolor-hills',
        customWallpaperData: '',
        customWallpaperUrl: ''
      });
      P.renderThemeStudioGrids();
      P.showToast('Reset to theme default background');
    });

    const bindPillGroup = (selector, attr, settingKey, labelPrefix) => {
      document.querySelectorAll(selector).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const val = btn.getAttribute(attr);
          await P.saveSettingsPatch({ [settingKey]: val });
          P.showToast(`${labelPrefix}: ${btn.textContent.trim()}`);
        });
      });
    };

    bindPillGroup('[data-card-style]', 'data-card-style', 'cardStyle', 'Card Style');
    bindPillGroup('[data-card-actions]', 'data-card-actions', 'cardActionsMode', 'Actions');
    bindPillGroup('[data-card-density]', 'data-card-density', 'cardDensity', 'Density');
    bindPillGroup('[data-avatar-shape]', 'data-avatar-shape', 'avatarShape', 'Avatar');
    bindPillGroup('[data-tab-style]', 'data-tab-style', 'tabStyle', 'Tabs');
    bindPillGroup('[data-badge-mode]', 'data-badge-mode', 'badgeCountMode', 'Counter');
    bindPillGroup('[data-ambient]', 'data-ambient', 'ambientEffect', 'Atmosphere');
    bindPillGroup('[data-font]', 'data-font', 'fontStyle', 'Typography');

    document.querySelectorAll('[data-left-accent-opt]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const val = btn.getAttribute('data-left-accent-opt') === 'on';
        await P.saveSettingsPatch({ showLeftAccent: val });
        P.showToast(val ? 'Colored left spine enabled' : 'Colored left spine hidden');
      });
    });
  };
})(typeof window !== 'undefined' ? window : this);
