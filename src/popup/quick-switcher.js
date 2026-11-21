/**
 * FoxHub — Quick Switcher Spotlight Modal (Ctrl+K)
 * Filters Mail + pinned/unpinned apps, launches validated http(s):// ad-hoc URLs,
 * and triggers quick actions (Night Mode, Mute, Play/Pause, Compose, Full Settings).
 */

(function (global) {
  const P = (global.FoxHubPopup = global.FoxHubPopup || {});
  const SVG_NS = 'http://www.w3.org/2000/svg';

  let selectedIdx = 0;
  let currentItems = [];
  let lastFocusedEl = null;

  function createSearchSvg(size = 15) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', '11');
    c.setAttribute('cy', '11');
    c.setAttribute('r', '8');
    const l = document.createElementNS(SVG_NS, 'line');
    l.setAttribute('x1', '21');
    l.setAttribute('y1', '21');
    l.setAttribute('x2', '16.65');
    l.setAttribute('y2', '16.65');
    svg.appendChild(c);
    svg.appendChild(l);
    return svg;
  }

  function normalizeAdhocUrl(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return { url: '', rejected: false };
    const isBareHostPort = /^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)+):\d+(?:[/?#]|$)/i.test(trimmed);
    if (!isBareHostPort && /^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:/i.test(trimmed)) {
      return { url: '', rejected: true };
    }
    if (/\s/.test(trimmed)) return { url: '', rejected: false };
    const candidate = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : /^(localhost(:\d+)?|[a-z0-9-]+(\.[a-z0-9-]+)+)([:/?#].*)?$/i.test(trimmed)
        ? `https://${trimmed}`
        : '';
    if (!candidate) return { url: '', rejected: false };
    try {
      const u = new URL(candidate);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        return { url: u.href, rejected: false };
      }
      return { url: '', rejected: true };
    } catch (_) {
      return { url: '', rejected: false };
    }
  }

  P.isQuickSwitcherOpen = function () {
    const ov = document.getElementById('pm-quick-switcher');
    return Boolean(ov && !ov.classList.contains('hidden'));
  };

  P.matchesQuickSwitcherShortcut = function (ev) {
    const schema = P.getSchemaApi();
    if (!ev || !schema) return false;
    const parsed = schema.formatShortcutFromKeyEvent(ev);
    if (!parsed || parsed.action !== 'set' || !parsed.shortcut) return false;
    const target = schema.normalizeShortcutString(P.state.appSettings.quickSwitcherShortcut || 'Ctrl+K');
    return parsed.shortcut.toLowerCase() === (target || 'ctrl+k').toLowerCase();
  };

  function buildResultsList(query) {
    const st = P.state;
    const mediaApi = P.getAppsApi();
    const q = String(query || '').trim().toLowerCase();
    const items = [];

    const totalUnread = st.appState.totalUnread || 0;
    const mailItem = {
      id: 'pocketmail',
      title: 'FoxHub Mail Inbox',
      subtitle: totalUnread > 0 ? `${totalUnread} unread` : 'Inbox',
      tag: 'Mail',
      color: '#D95032',
      appId: 'pocketmail',
      run: () => P.activateAppDirectlyById('pocketmail')
    };

    const pinnedApps = mediaApi ? mediaApi.getActiveMediaApps(st.appSettings) : [];
    const pinnedSet = new Set(pinnedApps.map((a) => a.id));
    const allBuiltIn = mediaApi ? mediaApi.BUILTIN_MEDIA_APPS : [];
    const unpinnedApps = allBuiltIn.filter((a) => !pinnedSet.has(a.id));

    const matchStr = (str) => !q || String(str || '').toLowerCase().includes(q);

    const appItems = [];
    if (matchStr(mailItem.title) || matchStr('mail inbox gmail')) {
      appItems.push(mailItem);
    }

    pinnedApps.forEach((app) => {
      if (matchStr(app.name) || matchStr(app.id) || matchStr(app.category)) {
        appItems.push({
          id: app.id,
          title: app.name,
          subtitle: app.defaultUrl || '',
          tag: 'Pinned',
          color: app.gradient || app.color || '#6C63FF',
          appId: app.id,
          run: () => P.activateAppDirectlyById(app.id)
        });
      }
    });

    if (q) {
      unpinnedApps.forEach((app) => {
        if (matchStr(app.name) || matchStr(app.id) || matchStr(app.category)) {
          appItems.push({
            id: app.id,
            title: app.name,
            subtitle: app.defaultUrl || '',
            tag: 'Open app',
            color: app.gradient || app.color || '#6C63FF',
            appId: app.id,
            run: () => {
              if (!st.IS_SIDEBAR_VIEW) document.documentElement.classList.add('show-popup-rail');
              P.openMediaWorkspace(app);
            }
          });
        }
      });
    }

    const urlCheck = normalizeAdhocUrl(query);
    if (urlCheck.rejected) {
      items.push({
        id: 'adhoc-rejected',
        title: 'Only http:// and https:// URLs are supported',
        subtitle: String(query || '').trim(),
        tag: 'Blocked',
        color: '#C93B2B',
        appId: '',
        run: () => P.showToast('Only http:// and https:// URLs are supported')
      });
    } else if (urlCheck.url) {
      const adhocItem = {
        id: 'adhoc-url',
        title: `Open URL in Sidebar: ${urlCheck.url}`,
        subtitle: urlCheck.url,
        tag: 'Web URL',
        color: '#6C63FF',
        appId: '',
        run: () => P.openUrlInWorkspace(urlCheck.url)
      };
      if (appItems.length === 0) items.push(adhocItem);
      else appItems.push(adhocItem);
    }

    items.push(...appItems);

    // Quick Commands
    const isNight = st.appSettings.theme === 'true-night';
    const anyMuted = P.isEmailMutedNow() || P.isSitesMutedNow();
    const np = P.getResolvedNowPlayingState?.();

    const commands = [
      {
        id: 'cmd-night',
        title: isNight ? 'Disable True Night Mode' : 'Toggle True Night Mode (OLED)',
        subtitle: 'Switch day / pitch-black theme',
        tag: 'Command',
        color: '#2B211B',
        run: () => P.toggleTrueNightMode?.()
      },
      {
        id: 'cmd-mute-all',
        title: anyMuted ? 'Unmute All Notifications' : 'Mute All Notifications',
        subtitle: 'Toggle Email & Sites notifications',
        tag: 'Command',
        color: '#D95032',
        run: async () => {
          const wantAll = !anyMuted;
          await P.saveSettingsPatch({
            muteEmailNotifications: wantAll,
            muteSiteNotifications: wantAll,
            socialAppNotifySounds: !wantAll,
            dndUntil: 0,
            muteSitesUntil: 0,
            lastMuteTimerMins: 0
          });
          P.renderHeaderStatus();
          P.broadcastMuteAndShortcutsConfig?.();
          P.showToast(wantAll ? 'Muted All Notifications' : 'Unmuted All Notifications');
        }
      },
      {
        id: 'cmd-mute-sites',
        title: P.isSitesMutedNow() ? 'Unmute Sites Notifications' : 'Mute Sites Notifications',
        subtitle: 'Toggle social & media chimes',
        tag: 'Command',
        color: '#6C63FF',
        run: async () => {
          const wantSites = !P.isSitesMutedNow();
          await P.saveSettingsPatch({
            muteSiteNotifications: wantSites,
            socialAppNotifySounds: !wantSites,
            muteSitesUntil: 0
          });
          P.renderHeaderStatus();
          P.broadcastMuteAndShortcutsConfig?.();
          P.showToast(wantSites ? 'Muted Sites Notifications' : 'Unmuted Sites Notifications');
        }
      },
      {
        id: 'cmd-compose',
        title: 'Compose New Email',
        subtitle: 'Open local email composer',
        tag: 'Command',
        color: '#2E7D5B',
        run: () => P.openComposeDrawer?.()
      },
      {
        id: 'cmd-options',
        title: 'Open Full Settings',
        subtitle: 'Open FoxHub Options studio',
        tag: 'Command',
        color: '#4E82EE',
        run: () => browser.runtime.openOptionsPage()
      }
    ];

    if (np && np.appId) {
      commands.unshift({
        id: 'cmd-playpause',
        title: `${np.isPlaying ? 'Pause' : 'Play'} ${np.appName || np.appId}`,
        subtitle: np.title || 'Media Playback',
        tag: 'Audio',
        color: np.color || '#1DB954',
        appId: np.appId,
        run: () => P.sendNowPlayingCommand?.(np.appId, 'play_pause')
      });
    }

    commands.forEach((cmd) => {
      if (matchStr(cmd.title) || matchStr(cmd.subtitle) || matchStr('command action toggle')) {
        items.push(cmd);
      }
    });

    return items;
  }

  function renderResults(query) {
    const listEl = document.getElementById('pm-qs-results');
    if (!listEl) return;
    const mediaApi = P.getAppsApi();
    currentItems = buildResultsList(query);
    if (selectedIdx >= currentItems.length) selectedIdx = 0;

    listEl.replaceChildren();
    if (currentItems.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:18px;text-align:center;font-size:12px;color:var(--text-muted);';
      empty.textContent = 'No matching apps, URLs, or commands.';
      listEl.appendChild(empty);
      return;
    }

    currentItems.forEach((item, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pm-qs-item${idx === selectedIdx ? ' is-selected' : ''}`;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', idx === selectedIdx ? 'true' : 'false');

      const left = document.createElement('div');
      left.className = 'pm-qs-item-left';
      const iconBox = document.createElement('span');
      iconBox.className = 'pm-qs-item-icon';
      iconBox.style.background = item.color || 'var(--accent)';
      if (item.appId && mediaApi) {
        iconBox.appendChild(mediaApi.createAppSvgIcon(item.appId, 14));
      } else {
        iconBox.appendChild(createSearchSvg(13));
      }

      const txt = document.createElement('div');
      txt.className = 'pm-qs-item-text';
      const ttl = document.createElement('div');
      ttl.className = 'pm-qs-item-title';
      ttl.textContent = item.title;
      const sub = document.createElement('div');
      sub.className = 'pm-qs-item-sub';
      sub.textContent = item.subtitle;
      txt.appendChild(ttl);
      txt.appendChild(sub);

      left.appendChild(iconBox);
      left.appendChild(txt);

      const tag = document.createElement('span');
      tag.className = 'pm-qs-item-tag';
      tag.textContent = item.tag;

      btn.appendChild(left);
      btn.appendChild(tag);
      btn.addEventListener('click', () => {
        P.closeQuickSwitcher();
        item.run();
      });
      listEl.appendChild(btn);
    });
  }

  function updateSelectionHighlight() {
    const listEl = document.getElementById('pm-qs-results');
    if (!listEl) return;
    Array.from(listEl.children).forEach((el, idx) => {
      const sel = idx === selectedIdx;
      el.classList.toggle('is-selected', sel);
      el.setAttribute('aria-selected', sel ? 'true' : 'false');
      if (sel && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  P.openQuickSwitcher = function () {
    if (P.state.appSettings.quickSwitcherEnabled === false) return;
    P.closeHeaderMoreMenu?.();
    P.closeMutePopover?.();
    P.closeRailContextMenu?.();
    const ov = document.getElementById('pm-quick-switcher');
    const inp = document.getElementById('pm-qs-input');
    if (!ov || !inp) return;
    lastFocusedEl = document.activeElement;
    selectedIdx = 0;
    inp.value = '';
    ov.classList.remove('hidden');
    renderResults('');
    setTimeout(() => inp.focus(), 10);
  };

  P.closeQuickSwitcher = function () {
    const ov = document.getElementById('pm-quick-switcher');
    if (!ov || ov.classList.contains('hidden')) return;
    ov.classList.add('hidden');
    if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
      try { lastFocusedEl.focus(); } catch (_) {}
    }
    lastFocusedEl = null;
  };

  P.toggleQuickSwitcher = function () {
    if (P.isQuickSwitcherOpen()) P.closeQuickSwitcher();
    else P.openQuickSwitcher();
  };

  P.bindQuickSwitcherEvents = function () {
    const searchIconWrap = document.getElementById('pm-qs-search-icon');
    if (searchIconWrap && !searchIconWrap.hasChildNodes()) {
      searchIconWrap.appendChild(createSearchSvg(15));
    }

    document.getElementById('pm-qs-backdrop')?.addEventListener('click', P.closeQuickSwitcher);

    const inp = document.getElementById('pm-qs-input');
    inp?.addEventListener('input', () => {
      selectedIdx = 0;
      renderResults(inp.value);
    });

    inp?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        P.closeQuickSwitcher();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (currentItems.length > 0) {
          selectedIdx = (selectedIdx + 1) % currentItems.length;
          updateSelectionHighlight();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentItems.length > 0) {
          selectedIdx = (selectedIdx - 1 + currentItems.length) % currentItems.length;
          updateSelectionHighlight();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = currentItems[selectedIdx];
        if (chosen) {
          P.closeQuickSwitcher();
          chosen.run();
        }
      }
    });
  };
})(typeof window !== 'undefined' ? window : this);
