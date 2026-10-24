/**
 * PocketMail — Toolbar Popup Controller
 * Multi-account switcher, 1-click actions, in-popup reader, TTS voice reader,
 * Sender Brand Logo & Favicon avatars, and 4-Tab Visual Customizer Studio
 * (Glassmorphism, Card Styles, Account Tab Styles, 16 Wallpapers, 14 Palettes, Ambient FX).
 * All icons are 100% crisp inline SVGs and all HTML rendering uses DOMParser (0 innerHTML).
 */

(function () {
  const SVGS = {
    starFilled: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    starOutline: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    speaker: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
    check: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    archive: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
    clock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    trash: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    plus: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    restore: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
    external: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`,
    emptyCoffee: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
    emptyStar: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    emptyClock: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
  };

  let appState = {
    accounts: [],
    totalUnread: 0,
    lastSyncAt: 0,
    usingDemo: false
  };
  let appSettings = {};
  let snoozedMap = {};

  let selectedAccountEmail = 'ALL'; // 'ALL' or specific account email
  let activeFilter = 'unread';      // 'unread' | 'all' | 'starred' | 'snoozed'
  let searchQuery = '';
  let activeReaderMessage = null;

  // DOM References
  const statusSubtitle = document.getElementById('pm-status-subtitle');
  const accountsBar = document.getElementById('pm-accounts-bar');
  const demoBanner = document.getElementById('pm-demo-banner');
  const emailListEl = document.getElementById('pm-email-list');
  const searchInput = document.getElementById('pm-search-input');
  const chipSnoozedLabel = document.getElementById('chip-snoozed-label');
  const ttsBar = document.getElementById('pm-tts-bar');
  const ttsLabel = document.getElementById('pm-tts-label');
  const toastEl = document.getElementById('pm-toast');

  // Drawers & Media Hub
  const readerDrawer = document.getElementById('pm-reader-drawer');
  const themeDrawer = document.getElementById('pm-theme-drawer');
  const accountDrawer = document.getElementById('pm-account-drawer');
  const composeDrawer = document.getElementById('pm-compose-drawer');
  const mediaWorkspace = document.getElementById('pm-media-workspace');
  const mediaAppsDrawer = document.getElementById('pm-media-apps-drawer');
  const mediaFramePoolEl = document.getElementById('pm-media-frame-pool');

  const IS_POPOUT_VIEW = window.location.search.includes('popout=1');
  let IS_SIDEBAR_VIEW =
    window.location.search.includes('sidebar=1') ||
    (!IS_POPOUT_VIEW && window.innerHeight > 605);

  function syncViewportModeAttributes() {
    const root = document.documentElement;
    if (!IS_POPOUT_VIEW && window.innerHeight > 605) {
      IS_SIDEBAR_VIEW = true;
    }
    if (IS_SIDEBAR_VIEW || IS_POPOUT_VIEW) {
      root.setAttribute('data-popout', 'true');
      root.style.setProperty('--popup-width', '100%');
      root.style.setProperty('--popup-height', '100vh');
    }
    if (IS_SIDEBAR_VIEW) {
      root.setAttribute('data-sidebar', 'true');
      root.setAttribute('data-view-mode', 'sidebar');
    } else {
      root.setAttribute('data-view-mode', 'popup');
    }
  }
  syncViewportModeAttributes();
  window.addEventListener('resize', syncViewportModeAttributes);

  let activeRailAppId = 'pocketmail';
  let activeMediaUrl = '';

  // Keep-Alive Multi-Frame Pool: appId -> { frame: HTMLIFrameElement, currentUrl: string, loaded: boolean }
  const mediaFramePool = new Map();

  function showToast(text, duration = 2200) {
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toastEl.classList.add('hidden');
    }, duration);
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    const diffSec = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function getInitials(name, email) {
    const src = (name || email || '?').trim();
    const parts = src.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return src.slice(0, 2).toUpperCase();
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

  function bindFaviconFallbacks(container) {
    if (!container) return;
    container.querySelectorAll('img.pm-avatar-favicon').forEach((img) => {
      img.addEventListener('error', () => {
        const parent = img.closest('.pm-avatar-brand');
        if (parent) {
          parent.classList.remove('pm-avatar-brand');
          const bg = parent.getAttribute('data-fallback-bg') || '#D95032';
          parent.style.background = bg;
          img.style.display = 'none';
          const fallbackSpan = parent.querySelector('.pm-avatar-fallback-text');
          if (fallbackSpan) fallbackSpan.style.display = 'inline';
        }
      });
    });
  }

  /**
   * Render Header Status & DND State
   */
  function renderHeaderStatus() {
    const activeAccounts = (appState.accounts || []).filter((a) => !a.disabled);
    const isDnd = appSettings.dndUntil && appSettings.dndUntil > Date.now();
    const dndBtn = document.getElementById('btn-dnd');

    if (isDnd) {
      dndBtn.classList.add('active');
      const minsLeft = Math.max(1, Math.ceil((appSettings.dndUntil - Date.now()) / 60000));
      statusSubtitle.textContent = `Do Not Disturb (${minsLeft}m left) • ${appState.totalUnread} unread`;
    } else {
      dndBtn.classList.remove('active');
      if (activeAccounts.length === 0) {
        statusSubtitle.textContent = 'No accounts connected yet';
      } else {
        const accWord = activeAccounts.length === 1 ? '1 account' : `${activeAccounts.length} accounts`;
        statusSubtitle.textContent = `${appState.totalUnread} unread across ${accWord}`;
      }
    }

    if (appState.usingDemo) {
      demoBanner.classList.remove('hidden');
    } else {
      demoBanner.classList.add('hidden');
    }

    const snoozedCount = Object.keys(snoozedMap || {}).length;
    if (chipSnoozedLabel) {
      chipSnoozedLabel.textContent = snoozedCount > 0 ? `Snoozed (${snoozedCount})` : 'Snoozed';
    }
  }

  /**
   * Render Multi-Account Switcher Bar
   */
  function renderAccountsBar() {
    const activeAccounts = (appState.accounts || []).filter((a) => !a.disabled);

    if (selectedAccountEmail !== 'ALL' && !activeAccounts.some((a) => a.email === selectedAccountEmail)) {
      selectedAccountEmail = 'ALL';
    }

    let html = `
      <button class="pm-account-pill ${selectedAccountEmail === 'ALL' ? 'active' : ''}" data-account="ALL">
        <span>All Inboxes</span>
        <span class="pm-account-count">${appState.totalUnread}</span>
      </button>
    `;

    activeAccounts.forEach((acc) => {
      const isSelected = selectedAccountEmail === acc.email;
      const displayLabel = acc.nickname || acc.email.split('@')[0];
      html += `
        <button class="pm-account-pill ${isSelected ? 'active' : ''}" data-account="${escapeHtml(acc.email)}" title="${escapeHtml(acc.email)}">
          <span class="pm-account-dot" style="background:${escapeHtml(acc.color || '#D95032')}"></span>
          <span>${escapeHtml(displayLabel)}</span>
          <span class="pm-account-count">${acc.unreadCount}</span>
        </button>
      `;
    });

    html += `
      <button class="pm-account-pill pm-account-pill-add" id="btn-pill-add-account" title="Sign in or add another Google account">
        ${SVGS.plus}
        <span>Add</span>
      </button>
    `;

    setSafeHtml(accountsBar, html);

    accountsBar.querySelectorAll('.pm-account-pill[data-account]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedAccountEmail = btn.getAttribute('data-account');
        renderAccountsBar();
        renderEmailList();
      });
    });

    const addPill = document.getElementById('btn-pill-add-account');
    if (addPill) {
      addPill.addEventListener('click', openAccountDrawer);
    }
  }

  /**
   * Gather visible messages based on selected account, filter chip, and search query
   */
  function getVisibleMessages() {
    if (activeFilter === 'snoozed') {
      const entries = Object.values(snoozedMap || {});
      return entries
        .map((e) => ({ ...e.message, snoozedUntil: e.wakeAt }))
        .filter((m) => selectedAccountEmail === 'ALL' || m.accountEmail === selectedAccountEmail);
    }

    const activeAccounts = (appState.accounts || []).filter((a) => !a.disabled);
    let list = [];
    activeAccounts.forEach((acc) => {
      if (selectedAccountEmail === 'ALL' || acc.email === selectedAccountEmail) {
        (acc.messages || []).forEach((m) => list.push(m));
      }
    });

    if (activeFilter === 'unread') {
      list = list.filter((m) => m.unread !== false);
    } else if (activeFilter === 'starred') {
      list = list.filter((m) => m.starred);
    } else if (activeFilter === 'codes') {
      list = list.filter((m) => {
        const code =
          m.otpCode ||
          (window.PocketMailGmailClient &&
            PocketMailGmailClient.extractVerificationCode(m.subject, m.snippet));
        return Boolean(code);
      });
    }
    // activeFilter === 'all' shows both unread and locally-read emails!

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (m) =>
          (m.subject || '').toLowerCase().includes(q) ||
          (m.senderName || '').toLowerCase().includes(q) ||
          (m.senderEmail || '').toLowerCase().includes(q) ||
          (m.snippet || '').toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  function getTotalMessagesIncludingRead() {
    const activeAccounts = (appState.accounts || []).filter((a) => !a.disabled);
    let count = 0;
    activeAccounts.forEach((acc) => {
      if (selectedAccountEmail === 'ALL' || acc.email === selectedAccountEmail) {
        count += (acc.messages || []).length;
      }
    });
    return count;
  }

  /**
   * Render Email Cards List
   */
  function renderEmailList() {
    const messages = getVisibleMessages();
    const showAccountBadge = selectedAccountEmail === 'ALL';
    const totalWithRead = getTotalMessagesIncludingRead();

    if (messages.length === 0) {
      const emptySvg =
        activeFilter === 'starred'
          ? SVGS.emptyStar
          : activeFilter === 'snoozed'
          ? SVGS.emptyClock
          : SVGS.emptyCoffee;
      const emptyTitle =
        activeFilter === 'starred'
          ? 'No starred emails right now'
          : activeFilter === 'snoozed'
          ? 'No snoozed emails right now'
          : searchQuery
          ? 'No matching emails found'
          : totalWithRead > 0 && activeFilter === 'unread'
          ? 'All recent emails marked as read!'
          : 'Your inbox is serene & caught up';
      const emptySub =
        searchQuery
          ? 'Try a different search keyword or switch accounts above.'
          : totalWithRead > 0 && activeFilter === 'unread'
          ? `You marked ${totalWithRead} recent email(s) as read. Switch to "All" or click Restore below to view them again.`
          : 'Enjoy a quiet moment — or customize your glassmorphism cards & backgrounds with the palette icon above.';

      setSafeHtml(
        emailListEl,
        `
        <div class="pm-empty-state">
          <div class="pm-empty-illustration">${emptySvg}</div>
          <div class="pm-empty-title">${escapeHtml(emptyTitle)}</div>
          <p class="pm-empty-subtitle">${escapeHtml(emptySub)}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
            ${
              totalWithRead > 0 && activeFilter === 'unread'
                ? `<button id="btn-empty-restore-read" class="pm-btn pm-btn-primary">
                    ${SVGS.restore}
                    <span>Restore ${totalWithRead} Read Email(s)</span>
                  </button>`
                : ''
            }
            <button id="btn-empty-add-account" class="pm-btn pm-btn-secondary">
              ${SVGS.plus}
              <span>Add / Manage Accounts</span>
            </button>
          </div>
        </div>
      `
      );

      const emptyRestoreBtn = document.getElementById('btn-empty-restore-read');
      if (emptyRestoreBtn) {
        emptyRestoreBtn.addEventListener('click', async () => {
          const res = await browser.runtime.sendMessage({ type: 'RESTORE_READ_EMAILS' });
          if (res && res.state) {
            appState = res.state;
            snoozedMap = res.snoozed || {};
            renderAll();
            showToast('Restored all recent emails!');
          }
        });
      }

      const emptyAddBtn = document.getElementById('btn-empty-add-account');
      if (emptyAddBtn) emptyAddBtn.addEventListener('click', openAccountDrawer);
      return;
    }

    setSafeHtml(
      emailListEl,
      messages
        .map((msg) => {
          const initials = getInitials(msg.senderName, msg.senderEmail);
          const color = msg.accountColor || '#D95032';
          const accShort = msg.accountNickname || (msg.accountEmail || '').split('@')[0];
          const timeStr = msg.snoozedUntil
            ? `Wakes ${new Date(msg.snoozedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : formatRelativeTime(msg.timestamp);

          const avatarHtml = window.PocketMailSenderIcons
            ? PocketMailSenderIcons.renderSenderAvatarHtml(msg, escapeHtml(initials), escapeHtml(color))
            : `<div class="pm-avatar" style="background:${escapeHtml(color)}">${escapeHtml(initials)}</div>`;

          const isReadCard = msg.unread === false;
          const otpCode =
            msg.otpCode ||
            (window.PocketMailGmailClient &&
              PocketMailGmailClient.extractVerificationCode(msg.subject, msg.snippet));

          return `
          <article class="pm-email-card ${isReadCard ? 'pm-card-read' : ''}" data-msg-id="${escapeHtml(msg.id)}" style="--card-account-color:${escapeHtml(color)};${isReadCard ? 'opacity:0.78;' : ''}">
            <div class="pm-card-left">
              <div class="pm-avatar-container">
                ${avatarHtml}
                ${
                  showAccountBadge
                    ? `<span class="pm-avatar-acc-dot" style="background:${escapeHtml(color)}" title="${escapeHtml(msg.accountEmail || '')}"></span>`
                    : ''
                }
              </div>
              <button class="pm-star-btn ${msg.starred ? 'starred' : ''}" data-action="star" title="Star / Unstar">
                ${msg.starred ? SVGS.starFilled : SVGS.starOutline}
              </button>
            </div>

            <div class="pm-card-main">
              <div class="pm-card-top">
                <div class="pm-sender-wrap">
                  <span class="pm-sender-name">${escapeHtml(msg.senderName)}</span>
                  ${
                    showAccountBadge
                      ? `<span class="pm-account-tag" style="color:${escapeHtml(color)};border-color:${escapeHtml(color)}40;background:${escapeHtml(color)}18">${escapeHtml(accShort)}</span>`
                      : ''
                  }
                </div>
                <span class="pm-card-time">${escapeHtml(timeStr)}</span>
              </div>

              <div class="pm-card-subject">${escapeHtml(msg.subject)}</div>
              <div class="pm-card-snippet">${escapeHtml(msg.snippet || 'Click to read full message…')}</div>

              <div class="pm-card-actions">
                ${
                  otpCode
                    ? `<button class="pm-action-pill pm-action-pill-otp" data-action="copyOtp" data-otp="${escapeHtml(otpCode)}" title="Click to copy verification code">
                        <span>Copy Code: ${escapeHtml(otpCode)}</span>
                      </button>`
                    : ''
                }
                <button class="pm-action-pill" data-action="listen" title="Read this email aloud">
                  ${SVGS.speaker}
                  <span>Listen</span>
                </button>
                <button class="pm-action-pill" data-action="${isReadCard ? 'markUnread' : 'markRead'}" title="${isReadCard ? 'Mark as unread' : 'Mark as read'}">
                  ${SVGS.check}
                  <span>${isReadCard ? 'Unread' : 'Read'}</span>
                </button>
                <button class="pm-action-pill" data-action="archive" title="Archive">
                  ${SVGS.archive}
                  <span>Archive</span>
                </button>
                <button class="pm-action-pill" data-action="snooze" title="Snooze for 1 hour">
                  ${SVGS.clock}
                  <span>Snooze</span>
                </button>
                <button class="pm-action-pill pm-action-pill-danger" data-action="deleteTrash" title="Delete (Move to Trash)">
                  ${SVGS.trash}
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </article>
        `;
        })
        .join('')
    );

    bindFaviconFallbacks(emailListEl);

    // Attach listeners to cards & action buttons
    emailListEl.querySelectorAll('.pm-email-card').forEach((cardEl) => {
      const msgId = cardEl.getAttribute('data-msg-id');
      const msgObj = messages.find((m) => m.id === msgId);
      if (!msgObj) return;

      cardEl.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const action = btn.getAttribute('data-action');
          if (action === 'copyOtp') {
            const code = btn.getAttribute('data-otp');
            if (code && navigator.clipboard) {
              await navigator.clipboard.writeText(code);
              showToast(`Copied verification code: ${code}`);
            }
            return;
          }
          await triggerCardAction(msgObj, action);
        });
      });

      cardEl.addEventListener('click', () => {
        openReaderView(msgObj);
      });
    });
  }

  let isSpeakingNow = false;
  let readerZoom = 100;
  let autoFitEmail = true;

  /**
   * Handle 1-Click Actions on an Email Card
   */
  async function triggerCardAction(msgObj, action) {
    if (action === 'listen') {
      const readerListenBtn = document.getElementById('btn-reader-listen');
      if (isSpeakingNow) {
        PocketMailSound.stopSpeaking();
        isSpeakingNow = false;
        ttsBar.classList.add('hidden');
        if (readerListenBtn) readerListenBtn.classList.remove('active');
        showToast('Stopped voice reading');
        return;
      }

      PocketMailSound.speakEmail(msgObj, appSettings, (ttsState) => {
        isSpeakingNow = Boolean(ttsState.playing);
        if (ttsState.playing) {
          ttsBar.classList.remove('hidden');
          ttsLabel.textContent = `Reading: ${msgObj.senderName} — ${msgObj.subject}`;
          if (readerListenBtn) readerListenBtn.classList.add('active');
        } else {
          ttsBar.classList.add('hidden');
          if (readerListenBtn) readerListenBtn.classList.remove('active');
        }
      });
      return;
    }

    if (action === 'star') {
      const nextAction = msgObj.starred ? 'unstar' : 'star';
      msgObj.starred = !msgObj.starred;
      const res = await browser.runtime.sendMessage({
        type: 'MESSAGE_ACTION',
        message: msgObj,
        actionType: nextAction
      });
      if (res && res.state) {
        appState = res.state;
        snoozedMap = res.snoozed || {};
        renderAll();
      }
      return;
    }

    if (action === 'snooze') {
      const isAlreadySnoozed = activeFilter === 'snoozed';
      const res = await browser.runtime.sendMessage({
        type: 'MESSAGE_ACTION',
        message: msgObj,
        actionType: isAlreadySnoozed ? 'unsnooze' : 'snooze',
        extra: { wakeAt: Date.now() + 60 * 60 * 1000 }
      });
      if (res && res.state) {
        appState = res.state;
        snoozedMap = res.snoozed || {};
        renderAll();
        showToast(isAlreadySnoozed ? 'Un-snoozed email' : 'Snoozed for 1 hour');
      }
      return;
    }

    const toastLabels = {
      markRead: 'Marked as read (visible in All tab)',
      markUnread: 'Marked as unread',
      archive: 'Archived conversation',
      deleteTrash: 'Moved to Trash'
    };

    const res = await browser.runtime.sendMessage({
      type: 'MESSAGE_ACTION',
      message: msgObj,
      actionType: action
    });

    if (res && res.state) {
      appState = res.state;
      snoozedMap = res.snoozed || {};
      renderAll();
      showToast(toastLabels[action] || 'Done');
    }
  }

  /**
   * Automatically scale wide HTML emails (like 600px+ Steam/store tables) to fit inside the Reader
   */
  function applyEmailReaderScale() {
    const viewportEl = document.getElementById('reader-body-viewport');
    const bodyEl = document.getElementById('reader-body');
    const lblZoom = document.getElementById('lbl-zoom-level');
    const autoFitBtn = document.getElementById('btn-reader-autofit');
    if (!viewportEl || !bodyEl) return;

    if (autoFitBtn) {
      autoFitBtn.classList.toggle('active', autoFitEmail);
    }

    if (autoFitEmail) {
      bodyEl.style.zoom = '1';
      bodyEl.classList.add('autofit-tables');
      const availW = Math.max(260, viewportEl.clientWidth - 6);
      const naturalW = bodyEl.scrollWidth;
      if (naturalW > availW + 8) {
        const ratio = Math.max(0.55, Math.min(1, availW / naturalW));
        bodyEl.style.zoom = String(Number(ratio.toFixed(3)));
        if (lblZoom) lblZoom.textContent = `Fit (${Math.round(ratio * 100)}%)`;
      } else {
        bodyEl.style.zoom = '1';
        if (lblZoom) lblZoom.textContent = 'Fit (100%)';
      }
    } else {
      bodyEl.classList.remove('autofit-tables');
      bodyEl.style.zoom = String(readerZoom / 100);
      if (lblZoom) lblZoom.textContent = `${readerZoom}%`;
    }
  }

  function updateReaderStarButton() {
    const starBtn = document.getElementById('btn-reader-star');
    if (!starBtn || !activeReaderMessage) return;
    setSafeHtml(starBtn, activeReaderMessage.starred ? SVGS.starFilled : SVGS.starOutline);
    starBtn.style.color = activeReaderMessage.starred ? '#E09F3E' : '';
  }

  /**
   * Open In-Popup Full Email Reader Drawer
   */
  async function openReaderView(msgObj) {
    activeReaderMessage = msgObj;
    readerDrawer.classList.remove('hidden');
    document.getElementById('pm-reader-snooze-bar')?.classList.add('hidden');

    updateReaderStarButton();

    const pill = document.getElementById('reader-account-pill');
    pill.textContent = msgObj.accountNickname
      ? `${msgObj.accountNickname} (${msgObj.accountEmail})`
      : msgObj.accountEmail;
    pill.style.background = msgObj.accountColor || '#D95032';

    document.getElementById('reader-subject').textContent = msgObj.subject;

    // OTP & Unsubscribe badges in reader header
    const otpBtn = document.getElementById('btn-reader-copy-otp');
    const unsubBtn = document.getElementById('btn-reader-unsubscribe');
    const initialOtp =
      msgObj.otpCode ||
      (window.PocketMailGmailClient &&
        PocketMailGmailClient.extractVerificationCode(msgObj.subject, msgObj.snippet));

    if (otpBtn) {
      if (initialOtp) {
        otpBtn.textContent = `Copy Code: ${initialOtp}`;
        otpBtn.setAttribute('data-otp', initialOtp);
        otpBtn.classList.remove('hidden');
      } else {
        otpBtn.classList.add('hidden');
      }
    }
    if (unsubBtn) {
      unsubBtn.classList.add('hidden');
    }

    const avatarWrap = document.getElementById('reader-avatar-wrap');
    const initials = getInitials(msgObj.senderName, msgObj.senderEmail);
    const color = msgObj.accountColor || '#D95032';
    const avatarHtml = window.PocketMailSenderIcons
      ? PocketMailSenderIcons.renderSenderAvatarHtml(msgObj, escapeHtml(initials), escapeHtml(color))
      : `<div class="pm-avatar" style="background:${escapeHtml(color)}">${escapeHtml(initials)}</div>`;
    setSafeHtml(avatarWrap, avatarHtml);
    bindFaviconFallbacks(avatarWrap);

    document.getElementById('reader-sender-name').textContent = msgObj.senderName;
    document.getElementById('reader-sender-email').textContent = msgObj.senderEmail;
    document.getElementById('reader-date').textContent = formatRelativeTime(msgObj.timestamp);

    const bodyEl = document.getElementById('reader-body');
    bodyEl.style.zoom = '1';
    setSafeHtml(bodyEl, `<p style="color:var(--text-muted)">Loading full message content locally…</p>`);
    document.getElementById('reader-reply-input').value = '';

    try {
      const fullContent = await browser.runtime.sendMessage({
        type: 'FETCH_FULL_EMAIL',
        message: msgObj
      });
      if (fullContent && fullContent.html) {
        setSafeHtml(bodyEl, fullContent.html);
        activeReaderMessage.fullText = fullContent.plainText || msgObj.snippet;
        activeReaderMessage.unsubscribeUrl = fullContent.unsubscribeUrl || null;

        const detectedOtp = initialOtp || fullContent.otpCode;
        if (detectedOtp && otpBtn) {
          otpBtn.textContent = `Copy Code: ${detectedOtp}`;
          otpBtn.setAttribute('data-otp', detectedOtp);
          otpBtn.classList.remove('hidden');
        }
        if (fullContent.unsubscribeUrl && unsubBtn) {
          unsubBtn.classList.remove('hidden');
        }

        // Re-calculate Auto-Fit scale immediately and as images finish loading
        requestAnimationFrame(applyEmailReaderScale);
        setTimeout(applyEmailReaderScale, 120);
        bodyEl.querySelectorAll('img').forEach((img) => {
          img.addEventListener('load', applyEmailReaderScale);
        });
      } else {
        bodyEl.textContent = msgObj.snippet || 'No additional content.';
        applyEmailReaderScale();
      }
    } catch (e) {
      bodyEl.textContent = msgObj.snippet || 'Could not load full thread.';
      applyEmailReaderScale();
    }
  }

  /**
   * Open Visual Customizer Studio Drawer inside Popup
   */
  function openThemeDrawer() {
    themeDrawer.classList.remove('hidden');
    renderThemeStudioGrids();
    syncStudioControlsState();
  }

  function syncStudioControlsState() {
    // Sliders
    const bgOp = appSettings.wallpaperOpacity !== undefined ? appSettings.wallpaperOpacity : 0.95;
    const bgBlur = appSettings.wallpaperBlur !== undefined ? appSettings.wallpaperBlur : 0;
    const cardOp = appSettings.cardOpacity !== undefined ? appSettings.cardOpacity : 0.62;
    const cardBlur = appSettings.cardBlur !== undefined ? appSettings.cardBlur : 16;
    const cardRad = appSettings.cardRadius !== undefined ? appSettings.cardRadius : 15;

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

    const popupW = appSettings.popupWidth !== undefined ? appSettings.popupWidth : 520;
    const rngPopupW = document.getElementById('rng-popup-width');
    const lblPopupW = document.getElementById('lbl-popup-width');
    if (rngPopupW && lblPopupW) {
      rngPopupW.value = popupW;
      lblPopupW.textContent = `${popupW}px`;
    }

    // Active Option Pills
    const highlightGroup = (selector, attr, currentVal) => {
      document.querySelectorAll(selector).forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute(attr) === currentVal);
      });
    };

    highlightGroup('[data-card-style]', 'data-card-style', appSettings.cardStyle || 'glassmorphism');
    highlightGroup('[data-card-actions]', 'data-card-actions', appSettings.cardActionsMode || 'always');
    highlightGroup('[data-card-density]', 'data-card-density', appSettings.cardDensity || 'cozy');
    highlightGroup('[data-avatar-shape]', 'data-avatar-shape', appSettings.avatarShape || 'squircle');
    highlightGroup('[data-left-accent-opt]', 'data-left-accent-opt', appSettings.showLeftAccent !== false ? 'on' : 'off');
    highlightGroup('[data-tab-style]', 'data-tab-style', appSettings.tabStyle || 'glass-pills');
    highlightGroup('[data-badge-mode]', 'data-badge-mode', appSettings.badgeCountMode || 'feed');
    highlightGroup('[data-ambient]', 'data-ambient', appSettings.ambientEffect || 'sunbeams');
    highlightGroup('[data-font]', 'data-font', appSettings.fontStyle || 'editorial');

    renderStudioLivePreview();
  }

  /**
   * Render Live Interactive Preview inside the Customizer Studio Dock
   * Shows how the selected Palette + Wallpaper + Ambient FX + Tab Style + Email Card Style look together
   */
  function renderStudioLivePreview() {
    const previewContainer = document.getElementById('pm-preview-content');
    const comboLabel = document.getElementById('lbl-preview-combo');
    if (!previewContainer) return;

    const themeObj = PocketMailThemes.THEMES[appSettings.theme] || PocketMailThemes.THEMES['warm-linen'];
    const styleNames = {
      'glassmorphism': 'Crystal Glass',
      'tinted-glass': 'Tinted Glass',
      'warm-paper': 'Warm Paper',
      'floating-minimal': 'Floating',
      'outlined-editorial': 'Outlined',
      'soft-neumorphic': 'Soft Cushion'
    };
    const styleLabel = styleNames[appSettings.cardStyle || 'glassmorphism'] || 'Crystal Glass';
    const opPct = Math.round((appSettings.cardOpacity !== undefined ? appSettings.cardOpacity : 0.62) * 100);
    if (comboLabel) {
      comboLabel.textContent = `• ${themeObj.name} • ${styleLabel} (${opPct}%)`;
    }

    // Pick the user's newest real message for the preview, or a realistic Google sample card
    const activeAccounts = (appState.accounts || []).filter((a) => !a.disabled);
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
        accountEmail: 'shadisairafi2016@gmail.com',
        accountNickname: 'shadisairafi2016',
        accountColor: '#D95032'
      };
    }

    const initials = getInitials(sampleMsg.senderName, sampleMsg.senderEmail);
    const color = sampleMsg.accountColor || '#D95032';
    const accShort = sampleMsg.accountNickname || (sampleMsg.accountEmail || 'personal').split('@')[0];
    const avatarHtml = window.PocketMailSenderIcons
      ? PocketMailSenderIcons.renderSenderAvatarHtml(sampleMsg, escapeHtml(initials), escapeHtml(color))
      : `<div class="pm-avatar" style="background:${escapeHtml(color)}">${escapeHtml(initials)}</div>`;

    const acc1 = activeAccounts[0] || { email: 'shadisairafi2016@gmail.com', nickname: 'shadisairafi2016', color: '#D95032', unreadCount: 20 };
    const acc2 = activeAccounts[1] || { email: 'shadisairafi2015@gmail.com', nickname: 'shadisairafi2015', color: '#2A7B6F', unreadCount: 20 };
    const totalCount = appState.totalUnread || (acc1.unreadCount + acc2.unreadCount);

    const previewHtml = `
      <div class="pm-accounts-bar">
        <button class="pm-account-pill active" type="button">
          <span>All Inboxes</span>
          <span class="pm-account-count">${totalCount}</span>
        </button>
        <button class="pm-account-pill" type="button">
          <span class="pm-account-dot" style="background:${escapeHtml(acc1.color || '#D95032')}"></span>
          <span>${escapeHtml(acc1.nickname || acc1.email.split('@')[0])}</span>
          <span class="pm-account-count">${acc1.unreadCount}</span>
        </button>
        <button class="pm-account-pill" type="button">
          <span class="pm-account-dot" style="background:${escapeHtml(acc2.color || '#2A7B6F')}"></span>
          <span>${escapeHtml(acc2.nickname || acc2.email.split('@')[0])}</span>
          <span class="pm-account-count">${acc2.unreadCount}</span>
        </button>
      </div>

      <article class="pm-email-card" style="--card-account-color:${escapeHtml(color)}">
        <div class="pm-card-left">
          <div class="pm-avatar-container">
            ${avatarHtml}
            <span class="pm-avatar-acc-dot" style="background:${escapeHtml(color)}"></span>
          </div>
          <button class="pm-star-btn starred" type="button" title="Starred">
            ${SVGS.starFilled}
          </button>
        </div>

        <div class="pm-card-main">
          <div class="pm-card-top">
            <div class="pm-sender-wrap">
              <span class="pm-sender-name">${escapeHtml(sampleMsg.senderName)}</span>
              <span class="pm-account-tag" style="color:${escapeHtml(color)};border-color:${escapeHtml(color)}40;background:${escapeHtml(color)}18">${escapeHtml(accShort)}</span>
            </div>
            <span class="pm-card-time">Just now</span>
          </div>

          <div class="pm-card-subject">${escapeHtml(sampleMsg.subject)}</div>
          <div class="pm-card-snippet">${escapeHtml(sampleMsg.snippet || 'Live preview of your email card styling…')}</div>

          <div class="pm-card-actions">
            <button class="pm-action-pill" type="button">${SVGS.speaker}<span>Listen</span></button>
            <button class="pm-action-pill" type="button">${SVGS.check}<span>Read</span></button>
            <button class="pm-action-pill" type="button">${SVGS.archive}<span>Archive</span></button>
            <button class="pm-action-pill" type="button">${SVGS.clock}<span>Snooze</span></button>
            <button class="pm-action-pill pm-action-pill-danger" type="button">${SVGS.trash}<span>Delete</span></button>
          </div>
        </div>
      </article>
    `;

    setSafeHtml(previewContainer, previewHtml);
    bindFaviconFallbacks(previewContainer);
  }

  function renderThemeStudioGrids() {
    const themeGrid = document.getElementById('pm-theme-grid');
    const wallpaperGrid = document.getElementById('pm-wallpaper-grid');

    const currentThemeId = appSettings.theme || 'warm-linen';
    const currentWallpaperId = appSettings.wallpaper || 'golden-meadow';

    setSafeHtml(
      themeGrid,
      Object.values(PocketMailThemes.THEMES)
        .map(
          (t) => `
        <button class="pm-theme-card ${currentThemeId === t.id ? 'active' : ''}" data-theme-id="${t.id}">
          <div class="pm-theme-swatch" style="background:${t.previewGradient}">
            <span class="pm-theme-swatch-dot" style="background:${t.accentDot}"></span>
          </div>
          <div>
            <div class="pm-theme-card-title">${escapeHtml(t.name)}</div>
            <div class="pm-theme-card-sub">${escapeHtml(t.subtitle)}</div>
          </div>
        </button>
      `
        )
        .join('')
    );

    themeGrid.querySelectorAll('.pm-theme-card').forEach((card) => {
      card.addEventListener('click', async () => {
        const themeId = card.getAttribute('data-theme-id');
        const themeObj = PocketMailThemes.THEMES[themeId];
        const nextWallpaper =
          appSettings.wallpaper === 'custom' || appSettings.wallpaper === 'custom-gradient'
            ? appSettings.wallpaper
            : themeObj.defaultWallpaper || appSettings.wallpaper;

        await saveSettingsPatch({
          theme: themeId,
          wallpaper: nextWallpaper
        });
        renderThemeStudioGrids();
        showToast(`Theme: ${themeObj.name}`);
      });
    });

    setSafeHtml(
      wallpaperGrid,
      Object.values(PocketMailThemes.WALLPAPERS)
        .map((wp) => {
          const bgUrl = wp.svg ? PocketMailThemes.svgToDataUrl(wp.svg) : 'none';
          return `
          <button class="pm-wallpaper-card ${currentWallpaperId === wp.id ? 'active' : ''}" data-wp-id="${wp.id}">
            <div class="pm-wallpaper-preview" style="background-image:${bgUrl}"></div>
            <div class="pm-wallpaper-name">${escapeHtml(wp.name)}</div>
            <div class="pm-wallpaper-desc">${escapeHtml(wp.description)}</div>
          </button>
        `;
        })
        .join('')
    );

    wallpaperGrid.querySelectorAll('.pm-wallpaper-card').forEach((card) => {
      card.addEventListener('click', async () => {
        const wpId = card.getAttribute('data-wp-id');
        await saveSettingsPatch({ wallpaper: wpId });
        renderThemeStudioGrids();
        showToast(`Background: ${PocketMailThemes.WALLPAPERS[wpId].name}`);
      });
    });
  }

  /**
   * Open Add Google Account / Multi-Account Manager Drawer
   */
  function openAccountDrawer() {
    accountDrawer.classList.remove('hidden');
    if (appSettings.oauthClientId) {
      document.getElementById('input-oauth-client-id').value = appSettings.oauthClientId;
    }
    renderConnectedAccountsList();
  }

  function renderConnectedAccountsList() {
    const container = document.getElementById('pm-connected-accounts-list');
    const accounts = appState.accounts || [];

    if (accounts.length === 0) {
      setSafeHtml(
        container,
        `<p style="font-size:12px;color:var(--text-muted)">No accounts detected yet. Click "Sign in with Google Account" above!</p>`
      );
      return;
    }

    setSafeHtml(
      container,
      accounts
        .map((acc) => {
          const typeLabel = acc.isDemo
            ? 'Sample Preview Account'
            : acc.accountType === 'oauth'
            ? 'Local OAuth 2.0 Account'
            : `Google Session (u/${acc.slotIndex || 0})`;

          return `
          <div class="pm-connected-item">
            <div class="pm-connected-left">
              <div class="pm-avatar" style="width:30px;height:30px;font-size:12px;background:${escapeHtml(acc.color || '#D95032')}">
                ${escapeHtml(getInitials(acc.nickname, acc.email))}
              </div>
              <div>
                <div class="pm-connected-email">${escapeHtml(acc.email)}</div>
                <div class="pm-connected-meta">${escapeHtml(typeLabel)} • ${acc.unreadCount} unread</div>
              </div>
            </div>
            <div>
              ${
                acc.isDemo
                  ? `<button class="pm-btn-xs pm-btn-secondary" data-hide-demo="1">Hide Demo</button>`
                  : `<button class="pm-btn-xs pm-btn-secondary" data-open-acc="${escapeHtml(acc.slotIndex || 0)}" style="display:inline-flex;align-items:center;gap:4px;"><span>Open</span>${SVGS.external}</button>`
              }
            </div>
          </div>
        `;
        })
        .join('')
    );

    container.querySelectorAll('[data-hide-demo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await saveSettingsPatch({ demoMode: 'off' });
        renderConnectedAccountsList();
        showToast('Preview accounts hidden');
      });
    });

    container.querySelectorAll('[data-open-acc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slot = btn.getAttribute('data-open-acc');
        browser.tabs.create({ url: `https://mail.google.com/mail/u/${slot}/#inbox` });
      });
    });
  }

  /**
   * Open Quick Compose Drawer (100% Local Direct Compose + Embedded Gmail View)
   */
  function setComposeDrawerMode(mode = 'native') {
    const nativeBtn = document.getElementById('btn-compose-mode-native');
    const embedBtn = document.getElementById('btn-compose-mode-embed');
    const nativePane = document.getElementById('pm-compose-native-pane');
    const embedPane = document.getElementById('pm-compose-embed-pane');
    const gmailFrame = document.getElementById('pm-compose-gmail-frame');

    const isEmbed = mode === 'embed';
    nativeBtn?.classList.toggle('active', !isEmbed);
    embedBtn?.classList.toggle('active', isEmbed);
    nativePane?.classList.toggle('hidden', isEmbed);
    embedPane?.classList.toggle('hidden', !isEmbed);

    if (isEmbed && gmailFrame) {
      const slot = document.getElementById('compose-from')?.value || '0';
      const to = (document.getElementById('compose-to')?.value || '').trim();
      const cc = (document.getElementById('compose-cc')?.value || '').trim();
      const bcc = (document.getElementById('compose-bcc')?.value || '').trim();
      const su = (document.getElementById('compose-subject')?.value || '').trim();
      const body = (document.getElementById('compose-body')?.value || '').trim();

      const embedUrl =
        `https://mail.google.com/mail/u/${slot}/?view=cm&fs=1&tf=1` +
        (to ? `&to=${encodeURIComponent(to)}` : '') +
        (cc ? `&cc=${encodeURIComponent(cc)}` : '') +
        (bcc ? `&bcc=${encodeURIComponent(bcc)}` : '') +
        (su ? `&su=${encodeURIComponent(su)}` : '') +
        (body ? `&body=${encodeURIComponent(body)}` : '');

      if (gmailFrame.dataset.loadedUrl !== embedUrl) {
        gmailFrame.dataset.loadedUrl = embedUrl;
        gmailFrame.src = embedUrl;
      }
    }
  }

  function openComposeDrawer(prefill = {}) {
    hideMediaWorkspaceKeepAlive();
    composeDrawer.classList.remove('hidden');
    setComposeDrawerMode('native');

    const fromSelect = document.getElementById('compose-from');
    const activeAccounts = (appState.accounts || []).filter((a) => !a.disabled);

    if (activeAccounts.length === 0) {
      setSafeHtml(
        fromSelect,
        `<option value="0" data-email="" data-demo="0">Default Gmail Account (u/0)</option>`
      );
    } else {
      setSafeHtml(
        fromSelect,
        activeAccounts
          .map(
            (acc) =>
              `<option value="${escapeHtml(String(acc.slotIndex || 0))}" data-email="${escapeHtml(
                acc.email || ''
              )}" data-demo="${acc.isDemo ? '1' : '0'}" ${
                selectedAccountEmail === acc.email ? 'selected' : ''
              }>${escapeHtml(acc.nickname ? `${acc.nickname} (${acc.email})` : acc.email)}</option>`
          )
          .join('')
      );
    }

    document.getElementById('compose-to').value = prefill.to || '';
    const ccEl = document.getElementById('compose-cc');
    const bccEl = document.getElementById('compose-bcc');
    if (ccEl) ccEl.value = prefill.cc || '';
    if (bccEl) bccEl.value = prefill.bcc || '';
    document.getElementById('compose-subject').value = prefill.subject || '';
    document.getElementById('compose-body').value = prefill.body || '';

    setTimeout(() => {
      document.getElementById(prefill.to ? 'compose-subject' : 'compose-to')?.focus();
    }, 60);
  }

  async function saveSettingsPatch(patch) {
    appSettings = { ...appSettings, ...patch };
    PocketMailThemes.applyThemeAndWallpaper(document, appSettings);
    syncStudioControlsState();
    const res = await browser.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: patch
    });
    if (res && res.state) {
      appState = res.state;
      appSettings = res.settings;
      renderAll();
    }
  }

  function addSidebarHash(urlStr) {
    try {
      const u = new URL(urlStr);
      if (!u.hash) {
        u.hash = 'pm-sidebar';
      }
      return u.toString();
    } catch (_) {
      return urlStr;
    }
  }

  const socialAppUnreadMap = new Map(); // appId -> { unreadCount, hasUnread }
  const hibernatedAppUrls = new Map();  // appId -> lastUrl (0-RAM URL memory when LRU pool evicts idle frames)
  const preconnectedOrigins = new Set();
  const MAX_KEEPALIVE_FRAMES = 4;       // Caps simultaneous warm iframes to keep RAM ultra-low

  const APP_CDN_PRECONNECT_MAP = {
    instagram: ['https://www.instagram.com', 'https://static.cdninstagram.com', 'https://scontent.cdninstagram.com'],
    whatsapp: ['https://web.whatsapp.com', 'https://static.whatsapp.net'],
    discord: ['https://discord.com', 'https://cdn.discordapp.com'],
    telegram: ['https://web.telegram.org'],
    spotify: ['https://open.spotify.com', 'https://open.spotifycdn.com', 'https://i.scdn.co'],
    youtube: ['https://www.youtube.com', 'https://i.ytimg.com', 'https://music.youtube.com'],
    tiktok: ['https://www.tiktok.com', 'https://sf16-website-login.neutral.ttwstatic.com'],
    x: ['https://x.com', 'https://abs.twimg.com', 'https://pbs.twimg.com'],
    messenger: ['https://www.messenger.com', 'https://static.xx.fbcdn.net'],
    reddit: ['https://www.reddit.com', 'https://www.redditstatic.com']
  };

  function ensureOriginPreconnected(rawUrl, appId = '') {
    if (!document.head) return;
    const originsToWarm = [];
    if (rawUrl) {
      try {
        originsToWarm.push(new URL(rawUrl).origin);
      } catch (_) {}
    }
    if (appId && APP_CDN_PRECONNECT_MAP[appId]) {
      originsToWarm.push(...APP_CDN_PRECONNECT_MAP[appId]);
    }
    originsToWarm.forEach((origin) => {
      if (!origin || preconnectedOrigins.has(origin)) return;
      preconnectedOrigins.add(origin);
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = origin;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });
    if (rawUrl || appId) {
      browser.runtime
        .sendMessage({
          type: 'PREWARM_APP_SESSION',
          url: rawUrl || (appId && APP_CDN_PRECONNECT_MAP[appId]?.[0]) || ''
        })
        .catch(() => {});
    }
  }

  function getSocialAppAccentColor() {
    if (window.PocketMailThemes && window.PocketMailThemes.THEMES) {
      const themeObj = window.PocketMailThemes.THEMES[appSettings.theme || 'warm-linen'];
      if (themeObj && themeObj.accent) return themeObj.accent;
    }
    return '#D96B43';
  }

  function broadcastSocialAppTheme() {
    const themeMode = appSettings.socialAppThemeMode || 'native';
    const accentColor = getSocialAppAccentColor();
    mediaFramePool.forEach((entry) => {
      if (entry.frame && entry.frame.contentWindow) {
        try {
          entry.frame.contentWindow.postMessage(
            {
              target: 'pocketmail-media-frame',
              cmd: 'APPLY_APP_THEME',
              themeMode,
              accentColor
            },
            '*'
          );
        } catch (_) {}
      }
    });
  }

  /**
   * Render Opera-Style Left Sidebar Rail (PocketHub Mail + Instagram, WhatsApp, Discord, Spotify, etc.)
   */
  function renderOperaRail() {
    const mediaApi = window.PocketMailMediaApps;
    if (!mediaApi) return;

    const mailBtn = document.getElementById('rail-btn-mail');
    const mailIconWrap = document.getElementById('rail-mail-icon');
    const mailBadge = document.getElementById('rail-mail-badge');
    const openSidebarBtn = document.getElementById('rail-btn-open-sidebar');
    const headerSidebarBtn = document.getElementById('btn-open-sidebar');
    const appsListEl = document.getElementById('pm-rail-apps-list');

    if (mailIconWrap && !mailIconWrap.hasChildNodes()) {
      mailIconWrap.appendChild(mediaApi.createAppSvgIcon('pocketmail', 16));
    }

    if (mailBtn) {
      mailBtn.classList.toggle('active', activeRailAppId === 'pocketmail');
    }

    if (mailBadge) {
      const count = appState.totalUnread || 0;
      mailBadge.textContent = count > 99 ? '99+' : String(count);
      mailBadge.classList.toggle('hidden', count <= 0);
    }

    if (IS_SIDEBAR_VIEW) {
      openSidebarBtn?.classList.add('hidden');
      headerSidebarBtn?.classList.add('hidden');
    }

    if (!appsListEl) return;
    appsListEl.replaceChildren();

    let draggedAppId = null;

    const handleAppReorderDrop = async (sourceId, targetId) => {
      if (!sourceId || !targetId || sourceId === targetId) return;
      const allBuiltIn = mediaApi.getOrderedBuiltInApps
        ? mediaApi.getOrderedBuiltInApps(appSettings)
        : mediaApi.BUILTIN_MEDIA_APPS;
      const customs = Array.isArray(appSettings.customMediaApps) ? appSettings.customMediaApps : [];
      const customIds = customs.map((c, idx) => c.id || `custom-${idx}`);
      const fullOrder = [...allBuiltIn.map((a) => a.id), ...customIds];
      const uniqueOrder = Array.from(new Set([...(appSettings.mediaAppsOrder || []), ...fullOrder]));

      const fromIdx = uniqueOrder.indexOf(sourceId);
      const toIdx = uniqueOrder.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return;

      uniqueOrder.splice(fromIdx, 1);
      uniqueOrder.splice(toIdx, 0, sourceId);

      await saveSettingsPatch({ mediaAppsOrder: uniqueOrder });
      renderOperaRail();
      if (mediaAppsDrawer && !mediaAppsDrawer.classList.contains('hidden')) {
        renderMediaAppsManager();
      }
      showToast('Updated pinned app order');
    };

    const activeApps = mediaApi.getActiveMediaApps(appSettings);
    activeApps.forEach((app) => {
      const btn = document.createElement('button');
      const isActive = activeRailAppId === app.id;
      const isAliveInPool = mediaFramePool.has(app.id);
      const unreadInfo = socialAppUnreadMap.get(app.id);
      const unreadCount = unreadInfo?.unreadCount || 0;
      const hasUnread = Boolean(unreadInfo?.hasUnread || unreadCount > 0);

      btn.className = `pm-rail-item ${isActive ? 'active' : ''}`;
      btn.draggable = true;
      btn.dataset.appId = app.id;
      btn.style.setProperty('--rail-app-grad', app.gradient || app.color);
      if (!isActive) {
        btn.style.color = app.color || 'var(--text-primary)';
      }
      btn.title = isAliveInPool
        ? `${app.name}${unreadCount > 0 ? ` (${unreadCount} new)` : ''} | Active in background (Click to switch, Drag to reorder, Right-click to close)`
        : `${app.name} | Click to open (Drag to reorder)`;
      btn.appendChild(mediaApi.createAppSvgIcon(app.id, 17));

      if (hasUnread) {
        const unreadBadge = document.createElement('span');
        unreadBadge.className = `pm-rail-social-badge ${unreadCount <= 0 ? 'dot-only' : ''}`;
        if (unreadCount > 0) {
          unreadBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
        }
        btn.appendChild(unreadBadge);
      }

      if (isAliveInPool) {
        const liveDot = document.createElement('span');
        liveDot.className = 'pm-rail-live-dot';
        btn.appendChild(liveDot);
      }

      // Drag-and-drop reordering directly on the Left Sidebar Rail
      btn.addEventListener('dragstart', (e) => {
        draggedAppId = app.id;
        btn.classList.add('is-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          try {
            e.dataTransfer.setData('text/plain', app.id);
          } catch (_) {}
        }
      });

      btn.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (draggedAppId && draggedAppId !== app.id) {
          btn.classList.add('drag-over-target');
        }
      });

      btn.addEventListener('dragleave', () => {
        btn.classList.remove('drag-over-target');
      });

      btn.addEventListener('drop', (e) => {
        e.preventDefault();
        btn.classList.remove('drag-over-target');
        const srcId = draggedAppId || e.dataTransfer?.getData('text/plain');
        if (srcId && srcId !== app.id) {
          handleAppReorderDrop(srcId, app.id);
        }
      });

      btn.addEventListener('dragend', () => {
        draggedAppId = null;
        btn.classList.remove('is-dragging', 'drag-over-target');
      });

      // Warm up DNS + TLS handshake + background cookie cache on hover (~150ms before click) with zero idle socket waste!
      btn.addEventListener(
        'mouseenter',
        () => {
          ensureOriginPreconnected(app.defaultUrl, app.id);
        },
        { passive: true }
      );

      btn.addEventListener('click', () => {
        const mode = appSettings.sidebarOpenMode || 'auto';
        if (mode === 'window') {
          const floatUrl = browser.runtime.getURL(`src/popup/popup.html?sidebar=1&app=${encodeURIComponent(app.id)}`);
          browser.runtime.sendMessage({
            type: 'OPEN_COMPANION_WINDOW',
            url: floatUrl
          });
          return;
        }
        if (!IS_SIDEBAR_VIEW) {
          document.documentElement.classList.add('show-popup-rail');
        }
        openMediaWorkspace(app);
      });

      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (mediaFramePool.has(app.id)) {
          closeMediaAppFrame(app.id);
          showToast(`Closed ${app.name} background session`);
        }
      });

      appsListEl.appendChild(btn);
    });

    // Inject lightweight DNS-prefetch for ALL active pinned apps on rail render (eliminates cold DNS stalls like TikTok's 11s IPv6/DNS timeout!)
    activeApps.forEach((app) => {
      try {
        const origins = [new URL(app.defaultUrl).origin, ...(APP_CDN_PRECONNECT_MAP[app.id] || [])];
        origins.forEach((origin) => {
          const dnsKey = `dns:${origin}`;
          if (!preconnectedOrigins.has(dnsKey) && document.head) {
            preconnectedOrigins.add(dnsKey);
            const dnsLink = document.createElement('link');
            dnsLink.rel = 'dns-prefetch';
            dnsLink.href = origin;
            document.head.appendChild(dnsLink);
          }
        });
      } catch (_) {}
    });
  }

  let mediaLoaderSafetyTimer = null;

  function getActivePoolEntry() {
    return mediaFramePool.get(activeRailAppId) || null;
  }

  // Pick ONLY the single most-specific subView across all 10 apps (supports TikTok /foryou <-> /, /@profile, Discord /channels/@me/<id>, Spotify #library, Telegram #hash, YouTube Music, Reddit Chat, etc.)
  function getActiveSubViewIndex(subViews, currentUrl) {
    if (!Array.isArray(subViews) || subViews.length === 0 || !currentUrl) return 0;

    let curUrlObj = null;
    try {
      curUrlObj = new URL(currentUrl);
    } catch (_) {
      return 0;
    }

    const curHost = curUrlObj.hostname.toLowerCase();
    const curPath = curUrlObj.pathname.replace(/\/+$/, '').toLowerCase() || '/';
    const curHash = curUrlObj.hash.toLowerCase();
    const normCur = currentUrl.replace(/\/+$/, '').toLowerCase();

    // 1. TikTok special route normalization
    if (curHost.includes('tiktok.com')) {
      if (curPath.startsWith('/@') || curPath === '/profile' || curUrlObj.searchParams.has('pm_goto_profile')) {
        const profIdx = subViews.findIndex((sv) => sv && (sv.icon === 'profile' || sv.url.endsWith('/profile')));
        if (profIdx >= 0) return profIdx;
      }
      if (curPath === '/' || curPath === '/foryou' || curPath.startsWith('/foryou/')) {
        const fyIdx = subViews.findIndex(
          (sv) => sv && (sv.url.endsWith('/foryou') || sv.label.toLowerCase() === 'for you')
        );
        if (fyIdx >= 0) return fyIdx;
      }
    }

    // 2. Spotify hash & collection route awareness
    if (curHost.includes('spotify.com')) {
      if (curHash === '#library' || curPath.startsWith('/collection')) {
        const libIdx = subViews.findIndex(
          (sv) => sv && (sv.url.includes('#library') || sv.url.includes('/collection') || sv.icon === 'library')
        );
        if (libIdx >= 0) return libIdx;
      }
      if (curPath.startsWith('/search')) {
        const sIdx = subViews.findIndex((sv) => sv && sv.url.includes('/search'));
        if (sIdx >= 0) return sIdx;
      }
    }

    // 3. Discord DMs (/channels/@me and /channels/@me/<id>) vs Server channels (/channels/<guildId>/<channelId>)
    if (curHost.includes('discord.com')) {
      if (curPath === '/channels/@me' || curPath.startsWith('/channels/@me/')) {
        const dmIdx = subViews.findIndex((sv) => sv && sv.url.includes('/channels/@me'));
        if (dmIdx >= 0) return dmIdx;
      }
      if (curPath.startsWith('/Guild-discovery') || curPath.startsWith('/guild-discovery')) {
        const discIdx = subViews.findIndex((sv) => sv && sv.url.toLowerCase().includes('guild-discovery'));
        if (discIdx >= 0) return discIdx;
      }
    }

    // 4. Instagram sub-routes (/direct/t/..., /reels/..., /explore/..., /<username> profile)
    if (curHost.includes('instagram.com')) {
      if (curPath.startsWith('/direct')) {
        const dmIdx = subViews.findIndex((sv) => sv && sv.url.includes('/direct'));
        if (dmIdx >= 0) return dmIdx;
      }
      if (curPath.startsWith('/reels') || curPath.startsWith('/reel/')) {
        const rIdx = subViews.findIndex((sv) => sv && sv.url.includes('/reels'));
        if (rIdx >= 0) return rIdx;
      }
      if (curPath.startsWith('/explore')) {
        const exIdx = subViews.findIndex((sv) => sv && sv.url.includes('/explore'));
        if (exIdx >= 0) return exIdx;
      }
      if (
        curPath === '/profile' ||
        curUrlObj.searchParams.has('pm_goto_profile') ||
        (curPath !== '/' &&
          !curPath.startsWith('/direct') &&
          !curPath.startsWith('/reels') &&
          !curPath.startsWith('/reel/') &&
          !curPath.startsWith('/explore') &&
          !curPath.startsWith('/stories') &&
          !curPath.startsWith('/p/'))
      ) {
        const profIdx = subViews.findIndex((sv) => sv && (sv.icon === 'profile' || sv.url.endsWith('/profile')));
        if (profIdx >= 0) return profIdx;
      }
    }

    // 4b. X (Twitter) profile & sub-routes (/home, /explore, /notifications, /messages, /<username> profile)
    if (curHost.includes('x.com') || curHost.includes('twitter.com')) {
      if (curPath === '/' || curPath === '/home') {
        if (curUrlObj.searchParams.has('pm_goto_profile')) {
          const profIdx = subViews.findIndex((sv) => sv && (sv.icon === 'profile' || sv.url.endsWith('/profile')));
          if (profIdx >= 0) return profIdx;
        }
        const homeIdx = subViews.findIndex((sv) => sv && sv.url.endsWith('/home'));
        if (homeIdx >= 0) return homeIdx;
      } else if (curPath.startsWith('/explore') || curPath.startsWith('/search')) {
        const exIdx = subViews.findIndex((sv) => sv && sv.url.includes('/explore'));
        if (exIdx >= 0) return exIdx;
      } else if (curPath.startsWith('/notifications')) {
        const notifIdx = subViews.findIndex((sv) => sv && sv.url.includes('/notifications'));
        if (notifIdx >= 0) return notifIdx;
      } else if (curPath.startsWith('/messages') || curPath.startsWith('/i/chat')) {
        const msgIdx = subViews.findIndex((sv) => sv && sv.url.includes('/messages'));
        if (msgIdx >= 0) return msgIdx;
      } else {
        const profIdx = subViews.findIndex((sv) => sv && (sv.icon === 'profile' || sv.url.endsWith('/profile')));
        if (profIdx >= 0) return profIdx;
      }
    }

    // 5. General longest-prefix + hostname + pathname + hash matcher
    let bestIdx = -1;
    let bestScore = -1;

    subViews.forEach((sv, idx) => {
      if (!sv || !sv.url) return;
      try {
        const svUrlObj = new URL(sv.url);
        const svHost = svUrlObj.hostname.toLowerCase();
        const svPath = svUrlObj.pathname.replace(/\/+$/, '').toLowerCase() || '/';
        const svHash = svUrlObj.hash.toLowerCase();

        // Must match hostname (distinguishes music.youtube.com from www.youtube.com, chat.reddit.com from www.reddit.com)
        if (svHost !== curHost) return;

        // If subView specifies a hash (e.g. #library), require hash match
        if (svHash && svHash !== curHash) return;

        if (curPath === svPath || (svPath !== '/' && curPath.startsWith(svPath + '/'))) {
          const score = svPath.length * 10 + (svHash ? svHash.length * 20 : 0);
          if (score > bestScore) {
            bestScore = score;
            bestIdx = idx;
          }
        }
      } catch (_) {
        const normSv = sv.url.replace(/\/+$/, '').toLowerCase();
        if (normCur === normSv || normCur.startsWith(normSv + '/') || normCur.startsWith(normSv + '?')) {
          if (normSv.length > bestScore) {
            bestScore = normSv.length;
            bestIdx = idx;
          }
        }
      }
    });

    return bestIdx >= 0 ? bestIdx : 0;
  }

  // True Viewport-Reflow Zoom: scales the iframe container with inverse width/height so zooming out gives the app a WIDER virtual screen while filling 100% of the sidebar!
  function applyFrameViewportZoom(entry, newZoom) {
    if (!entry || !entry.frame) return;
    const z = Math.max(0.5, Math.min(1.35, Number(newZoom) || 1.0));
    entry.zoom = z;
    const frame = entry.frame;
    if (Math.abs(z - 1.0) < 0.025) {
      frame.style.width = '100%';
      frame.style.height = '100%';
      frame.style.transform = 'none';
      frame.style.transformOrigin = '0 0';
    } else {
      const invPct = (100 / z).toFixed(3);
      frame.style.width = `${invPct}%`;
      frame.style.height = `${invPct}%`;
      frame.style.transform = `scale(${z})`;
      frame.style.transformOrigin = '0 0';
    }
    const fitBtn = document.getElementById('btn-media-zoom-fit');
    if (fitBtn && entry.appId === activeRailAppId) {
      fitBtn.textContent = Math.abs(z - 1.0) < 0.025 ? 'Fit' : `${Math.round(z * 100)}%`;
    }
  }

  function showMediaBrandLoader(app, frameEl) {
    const loaderEl = document.getElementById('pm-media-loader');
    const loaderIconEl = document.getElementById('pm-media-loader-icon');
    const loaderTitleEl = document.getElementById('pm-media-loader-title');
    const loaderSubEl = loaderEl?.querySelector('.pm-media-loader-sub');
    const targetFrame = frameEl || getActivePoolEntry()?.frame;

    if (loaderEl && app) {
      loaderEl.style.setProperty('--loader-accent', app.color || '#D96B43');
      loaderEl.style.setProperty('--loader-grad', app.gradient || app.color || 'linear-gradient(135deg,#D96B43,#B84A27)');
      loaderEl.classList.remove('hidden-loader');
    }
    if (loaderIconEl && app && window.PocketMailMediaApps) {
      loaderIconEl.replaceChildren(window.PocketMailMediaApps.createAppSvgIcon(app.id, 22));
    }
    if (loaderTitleEl && app) {
      loaderTitleEl.textContent = `Loading ${app.name}…`;
    }
    if (loaderSubEl) {
      loaderSubEl.textContent = 'Connecting your local Firefox session';
    }
    if (targetFrame) {
      targetFrame.classList.add('is-loading');
    }

    clearTimeout(mediaLoaderSafetyTimer);
    mediaLoaderSafetyTimer = setTimeout(() => {
      hideMediaBrandLoader(targetFrame);
    }, 1500);
  }

  function hideMediaBrandLoader(frameEl) {
    clearTimeout(mediaLoaderSafetyTimer);
    const loaderEl = document.getElementById('pm-media-loader');
    const targetFrame = frameEl || getActivePoolEntry()?.frame;
    loaderEl?.classList.add('hidden-loader');
    targetFrame?.classList.remove('is-loading');
  }

  const framePlaybackStates = new Map(); // appId -> { isPlaying, currentTime, resumeUrl, title, updatedAt }

  function isAppPersistent(appId) {
    if (!appId || appId === 'pocketmail') return false;
    const mode = appSettings.persistenceMode || 'eco';
    if (mode === 'all') return true;
    if (mode === 'selected') {
      const list = Array.isArray(appSettings.persistentAppIds)
        ? appSettings.persistentAppIds
        : ['spotify', 'youtube', 'discord'];
      return list.includes(appId);
    }
    return false;
  }

  function syncPersistentSessionToBackground(appId, url, playback = null) {
    if ((appSettings.persistenceMode || 'eco') === 'eco') return;
    browser.runtime
      .sendMessage({
        type: 'UPDATE_PERSISTENT_SESSION',
        activeAppId: activeRailAppId,
        appId: appId || undefined,
        url: url || undefined,
        playback: playback || undefined
      })
      .catch(() => {});
  }

  function enforceMediaPoolMemoryCap(protectedAppId) {
    const mode = appSettings.persistenceMode || 'eco';
    const selectedCount = Array.isArray(appSettings.persistentAppIds) ? appSettings.persistentAppIds.length : 3;
    const effectiveCap =
      mode === 'all'
        ? 12
        : mode === 'selected'
        ? Math.max(MAX_KEEPALIVE_FRAMES, selectedCount + 2)
        : MAX_KEEPALIVE_FRAMES;

    while (mediaFramePool.size >= effectiveCap) {
      let oldestId = null;
      let oldestScore = Infinity;

      mediaFramePool.forEach((entry, id) => {
        if (id === protectedAppId || id === activeRailAppId) return;
        if (isAppPersistent(id)) return;
        const audioBonus = id === 'spotify' || id === 'youtube' ? 180000 : 0;
        const score = (entry.lastUsedAt || 0) + audioBonus;
        if (score < oldestScore) {
          oldestScore = score;
          oldestId = id;
        }
      });

      if (!oldestId) break;
      const victim = mediaFramePool.get(oldestId);
      mediaFramePool.delete(oldestId);
      if (victim) {
        if (victim.currentUrl && !victim.currentUrl.includes('pm_boot=1')) {
          hibernatedAppUrls.set(oldestId, victim.currentUrl);
        }
        try {
          // Remove from DOM first so beforeunload inside the frame never dispatches PM_FRAME_NAV_START!
          victim.frame.remove();
          victim.frame.src = 'about:blank';
        } catch (_) {}
      }
    }
  }

  function getOrCreateMediaFrame(app) {
    let entry = mediaFramePool.get(app.id);
    if (!entry && mediaFramePoolEl) {
      enforceMediaPoolMemoryCap(app.id);
      const iframe = document.createElement('iframe');
      iframe.className = 'pm-media-frame';
      iframe.dataset.appId = app.id;
      iframe.name = `pm-media-frame-${app.id}`;
      iframe.allowFullscreen = true;
      iframe.setAttribute('allowfullscreen', 'true');
      iframe.setAttribute(
        'allow',
        'autoplay; clipboard-write; encrypted-media; picture-in-picture; microphone; camera; fullscreen *'
      );

      entry = {
        appId: app.id,
        frame: iframe,
        restoredUrl: hibernatedAppUrls.get(app.id) || '',
        currentUrl: '',
        hasNavigated: false,
        loaded: false,
        zoom: 1.0,
        lastUsedAt: Date.now(),
        lastNavAt: Date.now()
      };

      iframe.addEventListener('load', () => {
        // Ignore the initial synchronous about:blank load event when the iframe is first appended to the DOM!
        if (!entry.hasNavigated) return;
        entry.loaded = true;
        if (activeRailAppId === app.id) {
          hideMediaBrandLoader(iframe);
        } else {
          iframe.classList.remove('is-loading');
        }
      });

      mediaFramePoolEl.appendChild(iframe);
      mediaFramePool.set(app.id, entry);
    } else if (entry) {
      entry.lastUsedAt = Date.now();
    }
    return entry;
  }

  function switchActiveMediaFrame(appId) {
    mediaFramePool.forEach((entry, id) => {
      entry.frame.classList.toggle('is-active', id === appId);
    });
  }

  function closeMediaAppFrame(appId) {
    const entry = mediaFramePool.get(appId);
    mediaFramePool.delete(appId);
    if (entry) {
      try {
        entry.frame.remove();
        entry.frame.src = 'about:blank';
      } catch (_) {}
    }
    if (activeRailAppId === appId) {
      activeRailAppId = 'pocketmail';
      hideMediaWorkspaceKeepAlive();
    }
    renderOperaRail();
  }

  function hideMediaWorkspaceKeepAlive() {
    if (!mediaWorkspace) return;
    if (mediaFramePool.size > 0) {
      mediaWorkspace.classList.remove('hidden');
      mediaWorkspace.classList.add('pm-workspace-keepalive');
    } else {
      mediaWorkspace.classList.remove('pm-workspace-keepalive');
      mediaWorkspace.classList.add('hidden');
    }
  }

  function sendCommandToMediaFrame(cmd, extra = {}) {
    const entry = getActivePoolEntry();
    const frameEl = entry?.frame;
    if (frameEl && frameEl.contentWindow) {
      try {
        frameEl.contentWindow.postMessage(
          {
            target: 'pocketmail-media-frame',
            cmd,
            ...extra
          },
          '*'
        );
      } catch (_) {}
    }
  }

  function renderMediaBottomBar(app) {
    const bottomBar = document.getElementById('pm-media-bottom-bar');
    const bottomItems = document.getElementById('media-bottom-nav-items');
    const showBtn = document.getElementById('btn-show-bottom-nav');
    const mediaApi = window.PocketMailMediaApps;
    if (!bottomBar || !bottomItems || !mediaApi) return;

    const subViews = app?.subViews || [];
    if (subViews.length === 0) {
      bottomBar.classList.add('hidden');
      showBtn?.classList.add('hidden');
      return;
    }

    const isHidden = Boolean(appSettings.hideMediaBottomBar);
    bottomBar.classList.toggle('hidden', isHidden);
    showBtn?.classList.toggle('hidden', !isHidden);
    bottomBar.style.setProperty('--pm-nav-brand', app.color || 'var(--accent)');
    bottomBar.style.setProperty('--pm-nav-grad', app.gradient || app.color || 'var(--accent)');

    syncMediaTopBarAutoHideState();

    const activeIdx = getActiveSubViewIndex(subViews, activeMediaUrl);

    // Fast path: if buttons are already rendered for this exact app, only toggle active classes without tearing down DOM!
    if (bottomItems.dataset.renderedAppId === app.id && bottomItems.children.length === subViews.length) {
      Array.from(bottomItems.children).forEach((btn, idx) => {
        const isActive = idx === activeIdx;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-current', isActive ? 'page' : 'false');
      });
      return;
    }

    bottomItems.dataset.renderedAppId = app.id;
    bottomItems.replaceChildren();
    subViews.forEach((sv, idx) => {
      const itemBtn = document.createElement('button');
      const isActive = idx === activeIdx;
      itemBtn.type = 'button';
      itemBtn.className = `pm-media-bottom-item ${isActive ? 'active' : ''}`;
      itemBtn.setAttribute('aria-current', isActive ? 'page' : 'false');
      itemBtn.dataset.subviewIdx = String(idx);
      itemBtn.title = `${app.name}: ${sv.label}`;

      if (mediaApi.createSubViewIcon) {
        itemBtn.appendChild(mediaApi.createSubViewIcon(sv.icon || 'home', 15));
      }

      const lbl = document.createElement('span');
      lbl.className = 'pm-media-bottom-item-label';
      lbl.textContent = sv.label;
      itemBtn.appendChild(lbl);

      itemBtn.addEventListener('click', () => {
        openMediaWorkspace(app, sv.url, sv);
      });

      bottomItems.appendChild(itemBtn);
    });
  }

  /**
   * Open Embedded Media & Social Workspace inside Sidebar / Popup / Window
   * Uses Keep-Alive Multi-Frame Pool for 0ms instant switching between apps & smooth SPA subView navigation!
   */
  function openMediaWorkspace(app, customUrl, subViewMeta = null) {
    if (!mediaWorkspace || !app) return;
    activeRailAppId = app.id;

    // Ensure main origin + static CDN origins + cookie cache are pre-warmed
    ensureOriginPreconnected(customUrl || app.defaultUrl, app.id);

    const entry = getOrCreateMediaFrame(app);
    if (!entry) return;

    const rawTargetUrl = customUrl || entry.currentUrl || entry.restoredUrl || app.defaultUrl;
    const isWarmAndNavigated = Boolean(entry.hasNavigated && entry.loaded && entry.currentUrl);
    activeMediaUrl = rawTargetUrl;

    // Resolve /profile to the logged-in user's REAL profile URL on TikTok, Instagram, and X (never /accounts/edit/ or /settings/profile!)
    let targetUrl = rawTargetUrl;
    if (app.id === 'tiktok' && targetUrl.endsWith('/profile')) {
      const knownTikTokProfileUrl = entry.ownProfileUrl || appSettings.tiktokOwnProfileUrlV2 || '';
      if (knownTikTokProfileUrl) {
        targetUrl = knownTikTokProfileUrl;
      } else if (!isWarmAndNavigated) {
        targetUrl = 'https://www.tiktok.com/?pm_goto_profile=1';
      }
    } else if (app.id === 'instagram' && (targetUrl.endsWith('/profile') || targetUrl.includes('/accounts/edit'))) {
      const knownIgProfileUrl = entry.ownProfileUrl || appSettings.instagramOwnProfileUrl || '';
      if (knownIgProfileUrl) {
        targetUrl = knownIgProfileUrl;
      } else if (!isWarmAndNavigated) {
        targetUrl = 'https://www.instagram.com/?pm_goto_profile=1';
      }
    } else if (app.id === 'x' && (targetUrl.endsWith('/profile') || targetUrl.includes('/settings/profile'))) {
      const knownXProfileUrl = entry.ownProfileUrl || appSettings.xOwnProfileUrl || '';
      if (knownXProfileUrl) {
        targetUrl = knownXProfileUrl;
      } else if (!isWarmAndNavigated) {
        targetUrl = 'https://x.com/home?pm_goto_profile=1';
      }
    }

    // Check if this is a same-origin subView click on an already-loaded SPA frame (smooth 0ms SPA transition without refreshing!)
    // Exception: Only when ENTERING TikTok /messages do we force a clean frame navigation so webapp-messages boots cleanly and video decoders are freed.
    // Leaving /messages (e.g. Messages -> Profile, For You, Explore, Following) uses SPA_NAVIGATE so it clicks [data-e2e="nav-profile"] / /@username directly!
    let canUseSmoothSpaNav = false;
    if (customUrl && isWarmAndNavigated) {
      try {
        const curOrigin = new URL(entry.currentUrl).origin;
        const nextOrigin = new URL(targetUrl).origin;
        const isEnteringTikTokMessages =
          app.id === 'tiktok' &&
          targetUrl.includes('/messages') &&
          !(entry.currentUrl && entry.currentUrl.includes('/messages'));
        if (curOrigin === nextOrigin && !isEnteringTikTokMessages) {
          canUseSmoothSpaNav = true;
        }
      } catch (_) {}
    }

    // Ensure popup is wide enough if opened inside popup
    if (!IS_SIDEBAR_VIEW && !IS_POPOUT_VIEW && (appSettings.popupWidth || 540) < 620) {
      document.documentElement.style.setProperty('--popup-width', '660px');
    }

    readerDrawer?.classList.add('hidden');
    themeDrawer?.classList.add('hidden');
    accountDrawer?.classList.add('hidden');
    composeDrawer?.classList.add('hidden');
    mediaAppsDrawer?.classList.add('hidden');
    mediaWorkspace.classList.remove('hidden', 'pm-workspace-keepalive');

    switchActiveMediaFrame(app.id);
    renderOperaRail();
    syncPersistentSessionToBackground(app.id, targetUrl);

    const iconEl = document.getElementById('media-active-icon');
    const titleEl = document.getElementById('media-active-title');
    const subPillsEl = document.getElementById('media-subview-pills');
    const fitBtn = document.getElementById('btn-media-zoom-fit');

    if (fitBtn) {
      const z = entry.zoom || 1.0;
      fitBtn.textContent = Math.abs(z - 1.0) < 0.025 ? 'Fit' : `${Math.round(z * 100)}%`;
    }

    if (iconEl && window.PocketMailMediaApps) {
      iconEl.replaceChildren(window.PocketMailMediaApps.createAppSvgIcon(app.id, 13));
      iconEl.style.background = app.gradient || app.color || 'var(--accent)';
    }
    if (titleEl) {
      titleEl.textContent = app.name;
    }

    const subViews = app.subViews || [];
    const activeIdx = getActiveSubViewIndex(subViews, activeMediaUrl);

    if (subPillsEl) {
      if (subPillsEl.dataset.renderedAppId === app.id && subPillsEl.children.length === subViews.length) {
        Array.from(subPillsEl.children).forEach((pill, idx) => {
          pill.classList.toggle('active', idx === activeIdx);
        });
      } else {
        subPillsEl.dataset.renderedAppId = app.id;
        subPillsEl.replaceChildren();
        subViews.forEach((sv, idx) => {
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = `pm-media-subpill ${idx === activeIdx ? 'active' : ''}`;
          pill.textContent = sv.label;
          pill.addEventListener('click', () => {
            openMediaWorkspace(app, sv.url, sv);
          });
          subPillsEl.appendChild(pill);
        });
      }
    }

    renderMediaBottomBar(app);
    maybeShowFirstTimeTopBarHint();

    if (canUseSmoothSpaNav) {
      // Smooth 0ms in-app SPA navigation without reloading the iframe!
      entry.currentUrl = targetUrl;
      entry.pendingSpaUrl = targetUrl;
      entry.pendingSpaUntil = Date.now() + 1800;
      entry.lastNavAt = Date.now();
      sendCommandToMediaFrame('SPA_NAVIGATE', {
        url: targetUrl,
        label: subViewMeta?.label || '',
        icon: subViewMeta?.icon || ''
      });
      return;
    }

    if (!isWarmAndNavigated || Boolean(customUrl)) {
      if (isWarmAndNavigated && app.id === 'tiktok') {
        // Free active video decoders & MSE buffers before switching between TikTok video feed and Messages
        sendCommandToMediaFrame('FREE_HEAVY_MEDIA');
      }
      entry.loaded = false;
      entry.hasNavigated = true;
      entry.currentUrl = rawTargetUrl;
      entry.pendingSpaUrl = '';
      entry.pendingSpaUntil = 0;
      entry.lastNavAt = Date.now();
      showMediaBrandLoader(app, entry.frame);

      // Bypass & unregister any pre-existing Service Worker (sw.js / serviceworker.js) once per iframe on WhatsApp, YouTube, and X
      const needsSwBootClean =
        !entry.swCleaned &&
        (app.id === 'youtube' || app.id === 'whatsapp' || app.id === 'x');

      if (needsSwBootClean) {
        entry.swCleaned = true;
        try {
          const origin = new URL(targetUrl).origin;
          entry.frame.src = `${origin}/robots.txt?pm_boot=1&pm_target=${encodeURIComponent(targetUrl)}`;
        } catch (_) {
          entry.frame.src = targetUrl;
        }
      } else {
        entry.frame.src = targetUrl;
      }
    } else {
      // Already warm in Keep-Alive Pool — 0ms instant switch!
      hideMediaBrandLoader(entry.frame);
      broadcastSocialAppTheme();
    }
  }

  let topBarHintTimer = null;
  function getTopBarMode() {
    if (appSettings.mediaTopBarMode) return appSettings.mediaTopBarMode;
    return appSettings.autoHideMediaTopBar === false ? 'pinned' : 'hover';
  }

  function maybeShowFirstTimeTopBarHint() {
    if (appSettings.hasSeenTopBarHint || getTopBarMode() !== 'hover') return;
    const headerEl = mediaWorkspace?.querySelector('.pm-media-header');
    const hintEl = document.getElementById('pm-topbar-onboarding-hint');
    if (!headerEl || !hintEl) return;

    saveSettingsPatch({ hasSeenTopBarHint: true });

    headerEl.classList.add('peek-hint');
    setTimeout(() => {
      headerEl.classList.remove('peek-hint');
      hintEl.classList.remove('hidden');
      clearTimeout(topBarHintTimer);
      topBarHintTimer = setTimeout(() => {
        hintEl.classList.add('hidden');
      }, 7500);
    }, 1250);
  }

  function syncMediaTopBarAutoHideState() {
    const mode = getTopBarMode();
    const isAutoHide = mode === 'hover';
    const isDisabled = mode === 'disabled';
    mediaWorkspace?.classList.toggle('autohide-top-bar', isAutoHide);
    mediaWorkspace?.classList.toggle('disabled-top-bar', isDisabled);

    const pinBtn = document.getElementById('btn-media-autohide-top');
    if (pinBtn) {
      pinBtn.classList.toggle('active', mode === 'pinned');
      pinBtn.title =
        mode === 'pinned'
          ? 'Unpin Top Bar (Set to Auto-Hide on Hover)'
          : 'Pin Top Bar Always Visible (Currently Auto-Hidden — Hover top edge to show)';
    }

    document.querySelectorAll('[data-topbar-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-topbar-mode') === mode);
    });
  }

  /**
   * Render Add & Customize Sidebar Media Apps Drawer
   */
  function renderMediaAppsManager() {
    const mediaApi = window.PocketMailMediaApps;
    if (!mediaApi) return;

    const mode = appSettings.sidebarOpenMode || 'auto';
    document.querySelectorAll('[data-sidebar-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-sidebar-mode') === mode);
    });

    const socialTheme = appSettings.socialAppThemeMode || 'native';
    document.querySelectorAll('[data-social-theme]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-social-theme') === socialTheme);
    });

    const chkSocialSounds = document.getElementById('chk-social-notify-sounds');
    if (chkSocialSounds) {
      chkSocialSounds.checked = appSettings.socialAppNotifySounds !== false;
    }

    // Persistent App Memory & Background Audio Controls
    const pMode = appSettings.persistenceMode || 'eco';
    document.querySelectorAll('[data-persistence-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-persistence-mode') === pMode);
    });

    const chkKeepAudio = document.getElementById('chk-keep-audio-closed');
    if (chkKeepAudio) {
      chkKeepAudio.checked = appSettings.keepAudioPlayingWhenClosed !== false;
      chkKeepAudio.disabled = pMode === 'eco';
    }

    const resNoteEl = document.getElementById('pm-persistence-resource-note');
    if (resNoteEl) {
      resNoteEl.replaceChildren();
      const strongEl = document.createElement('strong');
      const descSpan = document.createElement('span');
      if (pMode === 'eco') {
        strongEl.textContent = '⚡ Resource Impact (Eco Mode): ';
        descSpan.textContent =
          'Uses 0 MB extra RAM and zero CPU/GPU when closed. Closing the sidebar unloads apps and resets to Mail Inbox.';
      } else if (pMode === 'selected') {
        strongEl.textContent = '🎵 Resource Impact (Selected Apps): ';
        descSpan.textContent =
          'Keeps only your chosen apps below in persistent memory & background audio when closed so music keeps playing while you work in full screen, and restores your exact page on reopen. Uses extra RAM (~150–300 MB per active app) and moderate CPU/GPU.';
      } else {
        strongEl.textContent = '🚀 Resource Impact (All Apps Persistent): ';
        descSpan.textContent =
          'Keeps all opened apps in persistent memory & background audio across sidebar close/reopen. Highest RAM, CPU, and GPU usage.';
      }
      resNoteEl.appendChild(strongEl);
      resNoteEl.appendChild(descSpan);
    }

    const pickerWrap = document.getElementById('pm-persistent-apps-picker-wrap');
    const pickerEl = document.getElementById('pm-persistent-apps-picker');
    if (pickerWrap && pickerEl) {
      pickerWrap.classList.toggle('hidden', pMode !== 'selected');
      pickerEl.replaceChildren();
      const pickedIds = Array.isArray(appSettings.persistentAppIds)
        ? appSettings.persistentAppIds
        : ['spotify', 'youtube', 'discord'];
      const allApps = [
        ...(mediaApi.getOrderedBuiltInApps ? mediaApi.getOrderedBuiltInApps(appSettings) : mediaApi.BUILTIN_MEDIA_APPS),
        ...(Array.isArray(appSettings.customMediaApps) ? appSettings.customMediaApps : [])
      ];
      allApps.forEach((app) => {
        const isPicked = pickedIds.includes(app.id);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `pm-opt-pill ${isPicked ? 'active' : ''}`;
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:4px 9px;font-size:11px;';
        chip.appendChild(mediaApi.createAppSvgIcon(app.id, 12));
        const lbl = document.createElement('span');
        lbl.textContent = `${app.name}${isPicked ? ' ✓' : ''}`;
        chip.appendChild(lbl);
        chip.addEventListener('click', async () => {
          const nextPicked = isPicked ? pickedIds.filter((id) => id !== app.id) : [...pickedIds, app.id];
          await saveSettingsPatch({ persistentAppIds: nextPicked });
          renderMediaAppsManager();
          showToast(isPicked ? `Removed ${app.name} from persistent memory` : `${app.name} set to persistent memory!`);
        });
        pickerEl.appendChild(chip);
      });
    }

    syncMediaTopBarAutoHideState();

    const enabledIds = Array.isArray(appSettings.enabledMediaApps)
      ? appSettings.enabledMediaApps
      : mediaApi.DEFAULT_ENABLED_APP_IDS;

    const soundMap = appSettings.socialAppSoundMap || {};
    const presets = window.PocketMailSound?.SOUND_PRESET_LIST || [
      { id: 'bamboo-pop', name: 'Soft Bamboo Pop' },
      { id: 'cozy-plop', name: 'Cozy Dewdrop Bloop' },
      { id: 'velvet-rhodes', name: 'Velvet Lo-Fi Rhodes' },
      { id: 'felt-piano', name: 'Warm Felt Piano' },
      { id: 'marimba', name: 'Warm Rosewood Marimba' },
      { id: 'kalimba', name: 'Cozy Kalimba Pluck' },
      { id: 'raindrop-leaf', name: 'Raindrop on Leaf' },
      { id: 'vinyl-pluck', name: 'Acoustic Harmonic Pluck' },
      { id: 'morning-dew', name: 'Sunlit Harp Whisper' },
      { id: 'soft-chord', name: 'Cozy Lounge Maj7' },
      { id: 'woodblock-tap', name: 'Tactile Walnut Tap' },
      { id: 'zen-bowl', name: 'Deep Singing Bowl' }
    ];

    let draggedGridAppId = null;
    const reorderAppsInManager = async (sourceId, targetId) => {
      if (!sourceId || !targetId || sourceId === targetId) return;
      const orderedBuiltIn = mediaApi.getOrderedBuiltInApps
        ? mediaApi.getOrderedBuiltInApps(appSettings)
        : mediaApi.BUILTIN_MEDIA_APPS;
      const customs = Array.isArray(appSettings.customMediaApps) ? appSettings.customMediaApps : [];
      const customIds = customs.map((c, idx) => c.id || `custom-${idx}`);
      const fullOrder = [...orderedBuiltIn.map((a) => a.id), ...customIds];
      const uniqueOrder = Array.from(new Set([...(appSettings.mediaAppsOrder || []), ...fullOrder]));

      const fromIdx = uniqueOrder.indexOf(sourceId);
      const toIdx = uniqueOrder.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return;

      uniqueOrder.splice(fromIdx, 1);
      uniqueOrder.splice(toIdx, 0, sourceId);

      await saveSettingsPatch({ mediaAppsOrder: uniqueOrder });
      renderMediaAppsManager();
      renderOperaRail();
      showToast('Updated pinned app order');
    };

    const gridEl = document.getElementById('pm-media-apps-toggle-grid');
    if (gridEl) {
      gridEl.replaceChildren();
      const orderedBuiltIns = mediaApi.getOrderedBuiltInApps
        ? mediaApi.getOrderedBuiltInApps(appSettings)
        : mediaApi.BUILTIN_MEDIA_APPS;

      orderedBuiltIns.forEach((app) => {
        const isEnabled = enabledIds.includes(app.id);
        const card = document.createElement('div');
        card.className = `pm-media-toggle-card ${isEnabled ? 'enabled' : ''}`;
        card.draggable = true;
        card.dataset.appId = app.id;

        card.addEventListener('dragstart', (e) => {
          draggedGridAppId = app.id;
          card.classList.add('is-dragging');
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            try {
              e.dataTransfer.setData('text/plain', app.id);
            } catch (_) {}
          }
        });
        card.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (draggedGridAppId && draggedGridAppId !== app.id) {
            card.classList.add('drag-over-target');
          }
        });
        card.addEventListener('dragleave', () => {
          card.classList.remove('drag-over-target');
        });
        card.addEventListener('drop', (e) => {
          e.preventDefault();
          card.classList.remove('drag-over-target');
          const srcId = draggedGridAppId || e.dataTransfer?.getData('text/plain');
          if (srcId && srcId !== app.id) {
            reorderAppsInManager(srcId, app.id);
          }
        });
        card.addEventListener('dragend', () => {
          draggedGridAppId = null;
          card.classList.remove('is-dragging', 'drag-over-target');
        });

        const topRow = document.createElement('div');
        topRow.className = 'pm-media-toggle-top';

        const info = document.createElement('div');
        info.className = 'pm-media-toggle-info';

        const gripSpan = document.createElement('span');
        gripSpan.className = 'pm-drag-grip-icon';
        gripSpan.title = 'Drag to reorder';
        gripSpan.appendChild(mediaApi.createSubViewIcon('drag-grip', 13));

        const iconBox = document.createElement('span');
        iconBox.className = 'pm-media-toggle-icon';
        iconBox.style.background = app.gradient || app.color;
        iconBox.appendChild(mediaApi.createAppSvgIcon(app.id, 15));

        const nameSpan = document.createElement('span');
        nameSpan.textContent = app.name;

        info.appendChild(gripSpan);
        info.appendChild(iconBox);
        info.appendChild(nameSpan);

        const statusBtn = document.createElement('button');
        statusBtn.className = `pm-btn-xs ${isEnabled ? 'pm-btn-primary' : 'pm-btn-secondary'}`;
        statusBtn.textContent = isEnabled ? 'Pinned' : 'Hidden';

        topRow.appendChild(info);
        topRow.appendChild(statusBtn);

        topRow.addEventListener('click', async () => {
          const nextIds = isEnabled
            ? enabledIds.filter((id) => id !== app.id)
            : [...enabledIds, app.id];
          await saveSettingsPatch({ enabledMediaApps: nextIds });
          renderMediaAppsManager();
          renderOperaRail();
        });

        // Per-App Custom Notification Sound Row (100% Vector SVGs + Dedicated Mute Button next to Preview!)
        // Media/video/AI apps default to muted so extension chimes never interrupt video/music playback unless explicitly enabled
        const isMediaStreamApp = ['spotify', 'youtube', 'tiktok', 'twitch', 'chatgpt', 'gemini'].includes(app.id);
        const effectiveSound = soundMap[app.id] !== undefined ? soundMap[app.id] : isMediaStreamApp ? 'none' : '';
        const isAppMuted = effectiveSound === 'none';
        const soundRow = document.createElement('div');
        soundRow.className = `pm-media-sound-row ${isAppMuted ? 'is-app-muted' : ''}`;
        soundRow.addEventListener('click', (e) => e.stopPropagation());

        const noteIcon = document.createElement('span');
        noteIcon.className = 'pm-media-sound-note-icon';
        noteIcon.appendChild(mediaApi.createSubViewIcon('music', 12));

        const soundSelect = document.createElement('select');
        soundSelect.className = 'pm-media-sound-select';
        soundSelect.title = `Custom message notification sound for ${app.name}`;

        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'Default Cozy Chime';
        soundSelect.appendChild(defaultOpt);

        presets.forEach((p) => {
          if (p.id === 'none') return;
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name;
          soundSelect.appendChild(opt);
        });

        soundSelect.value = isAppMuted || effectiveSound === 'default' ? '' : effectiveSound;
        soundSelect.addEventListener('change', async () => {
          const nextMap = { ...(appSettings.socialAppSoundMap || {}) };
          if (soundSelect.value) {
            nextMap[app.id] = soundSelect.value;
          } else if (isMediaStreamApp) {
            nextMap[app.id] = 'default';
          } else {
            delete nextMap[app.id];
          }
          await saveSettingsPatch({ socialAppSoundMap: nextMap });
          renderMediaAppsManager();
          const chosen = soundSelect.value || appSettings.soundId || 'bamboo-pop';
          if (chosen !== 'none' && window.PocketMailSound) {
            window.PocketMailSound.playNotificationSound(chosen, appSettings.soundVolume ?? 0.75, appSettings.customAudioData);
          }
          showToast(`${app.name} sound updated!`);
        });

        const previewBtn = document.createElement('button');
        previewBtn.type = 'button';
        previewBtn.className = 'pm-media-sound-preview-btn';
        previewBtn.title = `Test ${app.name} notification sound`;
        previewBtn.appendChild(mediaApi.createSubViewIcon('speaker-play', 12));
        previewBtn.addEventListener('click', () => {
          const chosen = soundSelect.value || appSettings.soundId || 'bamboo-pop';
          if (window.PocketMailSound) {
            window.PocketMailSound.playNotificationSound(chosen, appSettings.soundVolume ?? 0.75, appSettings.customAudioData);
          }
        });

        const muteBtn = document.createElement('button');
        muteBtn.type = 'button';
        muteBtn.className = `pm-media-sound-mute-btn ${isAppMuted ? 'is-muted' : ''}`;
        muteBtn.title = isAppMuted ? `Unmute ${app.name} notifications` : `Mute ${app.name} notifications`;
        muteBtn.appendChild(mediaApi.createSubViewIcon(isAppMuted ? 'speaker-mute' : 'alerts', 12));
        muteBtn.addEventListener('click', async () => {
          const nextMap = { ...(appSettings.socialAppSoundMap || {}) };
          if (isAppMuted) {
            if (isMediaStreamApp) {
              nextMap[app.id] = 'default';
            } else {
              delete nextMap[app.id];
            }
            showToast(`Unmuted ${app.name} notifications`);
          } else {
            nextMap[app.id] = 'none';
            showToast(`Muted ${app.name} notifications`);
          }
          await saveSettingsPatch({ socialAppSoundMap: nextMap });
          renderMediaAppsManager();
        });

        soundRow.appendChild(noteIcon);
        soundRow.appendChild(soundSelect);
        soundRow.appendChild(previewBtn);
        soundRow.appendChild(muteBtn);

        card.appendChild(topRow);
        card.appendChild(soundRow);
        gridEl.appendChild(card);
      });
    }

    const customListEl = document.getElementById('pm-custom-apps-list');
    if (customListEl) {
      customListEl.replaceChildren();
      const customs = Array.isArray(appSettings.customMediaApps) ? appSettings.customMediaApps : [];
      customs.forEach((c, idx) => {
        const appId = c.id || `custom-${idx}`;
        const row = document.createElement('div');
        row.className = 'pm-media-toggle-card';
        row.draggable = true;
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:8px;background:var(--bg-secondary);font-size:11.5px;';

        row.addEventListener('dragstart', (e) => {
          draggedGridAppId = appId;
          row.classList.add('is-dragging');
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            try {
              e.dataTransfer.setData('text/plain', appId);
            } catch (_) {}
          }
        });
        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (draggedGridAppId && draggedGridAppId !== appId) {
            row.classList.add('drag-over-target');
          }
        });
        row.addEventListener('dragleave', () => row.classList.remove('drag-over-target'));
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          row.classList.remove('drag-over-target');
          const srcId = draggedGridAppId || e.dataTransfer?.getData('text/plain');
          if (srcId && srcId !== appId) {
            reorderAppsInManager(srcId, appId);
          }
        });
        row.addEventListener('dragend', () => {
          draggedGridAppId = null;
          row.classList.remove('is-dragging', 'drag-over-target');
        });

        const leftWrap = document.createElement('div');
        leftWrap.style.cssText = 'display:flex;align-items:center;gap:7px;min-width:0;flex:1;';

        const gripSpan = document.createElement('span');
        gripSpan.className = 'pm-drag-grip-icon';
        gripSpan.title = 'Drag to reorder';
        gripSpan.appendChild(mediaApi.createSubViewIcon('drag-grip', 13));

        const iconBadge = document.createElement('span');
        iconBadge.className = 'pm-media-toggle-icon';
        iconBadge.style.cssText = `width:22px;height:22px;border-radius:6px;flex-shrink:0;background:${c.color || '#4E82EE'};`;
        iconBadge.appendChild(mediaApi.createAppSvgIcon(appId, 14));

        const label = document.createElement('span');
        label.style.cssText = 'font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        label.textContent = `${c.name} (${c.url})`;

        leftWrap.appendChild(gripSpan);
        leftWrap.appendChild(iconBadge);
        leftWrap.appendChild(label);

        const delBtn = document.createElement('button');
        delBtn.className = 'pm-btn-xs pm-btn-secondary';
        delBtn.textContent = 'Remove';
        delBtn.addEventListener('click', async () => {
          const nextCustoms = customs.filter((_, i) => i !== idx);
          await saveSettingsPatch({ customMediaApps: nextCustoms });
          renderMediaAppsManager();
          renderOperaRail();
        });

        row.appendChild(leftWrap);
        row.appendChild(delBtn);
        customListEl.appendChild(row);
      });
    }
  }

  let customIconsHydrating = false;
  async function hydrateMissingCustomAppIcons() {
    if (customIconsHydrating || !window.PocketMailMediaApps?.fetchWebsiteIconFromHtml) return;
    const customs = Array.isArray(appSettings.customMediaApps) ? appSettings.customMediaApps : [];
    const needsFetch = customs.some((c) => c && c.url && !c.iconUrl);
    if (!needsFetch) return;

    customIconsHydrating = true;
    try {
      let updated = false;
      const nextCustoms = await Promise.all(
        customs.map(async (c) => {
          if (!c || !c.url || c.iconUrl) return c;
          const fetchedIcon = await window.PocketMailMediaApps.fetchWebsiteIconFromHtml(c.url);
          if (fetchedIcon) {
            updated = true;
            return { ...c, iconUrl: fetchedIcon };
          }
          return c;
        })
      );
      if (updated) {
        await saveSettingsPatch({ customMediaApps: nextCustoms });
        renderOperaRail();
        const activeIconEl = document.getElementById('media-active-icon');
        if (activeIconEl && activeRailAppId && activeRailAppId.startsWith('custom-')) {
          activeIconEl.replaceChildren(window.PocketMailMediaApps.createAppSvgIcon(activeRailAppId, 13));
        }
      }
    } catch (_) {
    } finally {
      customIconsHydrating = false;
    }
  }

  function renderAll() {
    PocketMailThemes.applyThemeAndWallpaper(document, appSettings);
    renderOperaRail();
    renderHeaderStatus();
    renderAccountsBar();
    renderEmailList();
    renderStudioLivePreview();
    hydrateMissingCustomAppIcons();
  }

  function bindStudioControls() {
    // Sub-Tab Switcher inside Customizer Studio
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

    const fullStudioBtn = document.getElementById('btn-open-full-studio');
    if (fullStudioBtn) {
      fullStudioBtn.addEventListener('click', () => {
        browser.runtime.openOptionsPage();
      });
    }

    // Hold or Click "Peek" button to see full inbox underneath studio drawer
    const peekBtn = document.getElementById('btn-studio-peek');
    if (peekBtn) {
      peekBtn.addEventListener('mousedown', () => themeDrawer.classList.add('is-peeking'));
      peekBtn.addEventListener('mouseup', () => themeDrawer.classList.remove('is-peeking'));
      peekBtn.addEventListener('mouseleave', () => themeDrawer.classList.remove('is-peeking'));
    }

    // Minimize / Expand Live Combination Preview Dock
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

    // Sliders
    document.getElementById('rng-bg-opacity').addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById('lbl-bg-opacity').textContent = `${Math.round(val * 100)}%`;
      saveSettingsPatch({ wallpaperOpacity: val });
    });

    document.getElementById('rng-bg-blur').addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      document.getElementById('lbl-bg-blur').textContent = `${val}px`;
      saveSettingsPatch({ wallpaperBlur: val });
    });

    document.getElementById('rng-card-opacity').addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById('lbl-card-opacity').textContent = `${Math.round(val * 100)}%`;
      saveSettingsPatch({ cardOpacity: val });
    });

    document.getElementById('rng-card-blur').addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      document.getElementById('lbl-card-blur').textContent = `${val}px`;
      saveSettingsPatch({ cardBlur: val });
    });

    document.getElementById('rng-card-radius').addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      document.getElementById('lbl-card-radius').textContent = `${val}px`;
      saveSettingsPatch({ cardRadius: val });
    });

    const rngPopupW = document.getElementById('rng-popup-width');
    if (rngPopupW) {
      rngPopupW.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        document.getElementById('lbl-popup-width').textContent = `${val}px`;
        saveSettingsPatch({ popupWidth: val });
        setTimeout(applyEmailReaderScale, 60);
      });
    }

    // Custom Gradient Maker
    document.getElementById('btn-apply-gradient').addEventListener('click', async () => {
      const c1 = document.getElementById('clr-grad-1').value || '#FAD6A5';
      const c2 = document.getElementById('clr-grad-2').value || '#E8A598';
      await saveSettingsPatch({
        wallpaper: 'custom-gradient',
        customGradient1: c1,
        customGradient2: c2
      });
      renderThemeStudioGrids();
      showToast('Custom gradient background applied!');
    });

    // Custom Wallpaper Image URL
    document.getElementById('btn-apply-bg-url').addEventListener('click', async () => {
      const url = document.getElementById('input-custom-bg-url').value.trim();
      if (!url) {
        showToast('Paste an image URL first');
        return;
      }
      await saveSettingsPatch({
        wallpaper: 'custom',
        customWallpaperData: url
      });
      renderThemeStudioGrids();
      showToast('Custom image URL applied!');
    });

    // Option Pill Groups
    const bindPillGroup = (selector, attr, settingKey, labelPrefix) => {
      document.querySelectorAll(selector).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const val = btn.getAttribute(attr);
          await saveSettingsPatch({ [settingKey]: val });
          showToast(`${labelPrefix}: ${btn.textContent.trim()}`);
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
        await saveSettingsPatch({ showLeftAccent: val });
        showToast(val ? 'Colored left spine enabled' : 'Colored left spine hidden');
      });
    });
  }

  function bindEvents() {
    document.getElementById('btn-compose').addEventListener('click', () => openComposeDrawer());
    document.getElementById('btn-backgrounds').addEventListener('click', openThemeDrawer);
    document.getElementById('btn-settings').addEventListener('click', () => {
      browser.runtime.openOptionsPage();
    });

    // Opera Sidebar Rail & Media Hub Controls
    document.getElementById('rail-btn-mail')?.addEventListener('click', () => {
      activeRailAppId = 'pocketmail';
      hideMediaWorkspaceKeepAlive();
      mediaAppsDrawer?.classList.add('hidden');
      renderOperaRail();
      syncPersistentSessionToBackground('pocketmail', '');
    });

    const openFirefoxLeftSidebar = () => {
      try {
        if (browser.sidebarAction && browser.sidebarAction.open) {
          browser.sidebarAction.open();
          const panelUrl =
            activeRailAppId !== 'pocketmail'
              ? browser.runtime.getURL(`src/popup/popup.html?sidebar=1&app=${encodeURIComponent(activeRailAppId)}`)
              : browser.runtime.getURL('src/popup/popup.html?sidebar=1');
          browser.sidebarAction.setPanel({ panel: panelUrl });
          showToast('Opened in Firefox Left Sidebar!');
        } else {
          document.documentElement.classList.toggle('show-popup-rail');
          showToast('Toggled Opera Sidebar Rail');
        }
      } catch (_) {
        document.documentElement.classList.toggle('show-popup-rail');
        showToast('Opened Firefox Left Sidebar');
      }
    };

    document.getElementById('rail-btn-open-sidebar')?.addEventListener('click', openFirefoxLeftSidebar);
    document.getElementById('btn-open-sidebar')?.addEventListener('click', openFirefoxLeftSidebar);
    document.getElementById('btn-open-firefox-sidebar-top')?.addEventListener('click', openFirefoxLeftSidebar);

    document.getElementById('rail-btn-manage-apps')?.addEventListener('click', () => {
      hideMediaWorkspaceKeepAlive();
      readerDrawer?.classList.add('hidden');
      themeDrawer?.classList.add('hidden');
      accountDrawer?.classList.add('hidden');
      composeDrawer?.classList.add('hidden');
      mediaAppsDrawer?.classList.remove('hidden');
      renderMediaAppsManager();
    });

    document.getElementById('btn-media-apps-back')?.addEventListener('click', () => {
      mediaAppsDrawer?.classList.add('hidden');
    });

    document.querySelectorAll('[data-sidebar-mode]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const mode = btn.getAttribute('data-sidebar-mode');
        await saveSettingsPatch({ sidebarOpenMode: mode });
        renderMediaAppsManager();
        showToast(`Sidebar Click Mode: ${btn.textContent.trim()}`);
      });
    });

    document.querySelectorAll('[data-social-theme]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const themeMode = btn.getAttribute('data-social-theme') || 'native';
        await saveSettingsPatch({ socialAppThemeMode: themeMode });
        renderMediaAppsManager();
        broadcastSocialAppTheme();
        showToast(`Social App Theme: ${btn.textContent.trim()}`);
      });
    });

    document.getElementById('chk-social-notify-sounds')?.addEventListener('change', async (e) => {
      const enabled = Boolean(e.target.checked);
      await saveSettingsPatch({ socialAppNotifySounds: enabled });
      showToast(enabled ? 'Social app message sounds enabled' : 'Social app message sounds muted');
    });

    document.querySelectorAll('[data-persistence-mode]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pMode = btn.getAttribute('data-persistence-mode') || 'eco';
        const patch = { persistenceMode: pMode };
        if (pMode !== 'eco') {
          patch.persistentLastActiveAppId = activeRailAppId;
        }
        await saveSettingsPatch(patch);
        renderMediaAppsManager();
        showToast(
          pMode === 'eco'
            ? 'Eco Mode enabled — RAM freed when sidebar closes'
            : pMode === 'selected'
            ? 'Selected Apps Persistent Memory enabled!'
            : 'All Apps Persistent Memory enabled!'
        );
      });
    });

    document.getElementById('chk-keep-audio-closed')?.addEventListener('change', async (e) => {
      const enabled = Boolean(e.target.checked);
      await saveSettingsPatch({ keepAudioPlayingWhenClosed: enabled });
      showToast(
        enabled
          ? 'Background audio keep-alive enabled when sidebar closes'
          : 'Background audio will pause when sidebar closes'
      );
    });

    document.querySelectorAll('[data-topbar-mode]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const mode = btn.getAttribute('data-topbar-mode') || 'hover';
        await saveSettingsPatch({
          mediaTopBarMode: mode,
          autoHideMediaTopBar: mode !== 'pinned'
        });
        syncMediaTopBarAutoHideState();
        const label =
          mode === 'disabled'
            ? 'Top bar completely disabled'
            : mode === 'pinned'
              ? 'Top bar pinned always visible'
              : 'Top bar set to Show on Hover';
        showToast(label);
      });
    });

    document.getElementById('chk-autohide-top-bar')?.addEventListener('change', async (e) => {
      const enabled = Boolean(e.target.checked);
      const mode = enabled ? 'hover' : 'pinned';
      await saveSettingsPatch({
        mediaTopBarMode: mode,
        autoHideMediaTopBar: enabled
      });
      syncMediaTopBarAutoHideState();
      showToast(enabled ? 'Top bar set to Auto-Hide (Show on Hover)' : 'Top bar pinned always visible');
    });

    document.getElementById('btn-media-autohide-top')?.addEventListener('click', async () => {
      const currentMode = appSettings.mediaTopBarMode || (appSettings.autoHideMediaTopBar !== false ? 'hover' : 'pinned');
      const nextMode = currentMode === 'pinned' ? 'hover' : 'pinned';
      const nextAutoHide = nextMode === 'hover';
      const headerEl = mediaWorkspace?.querySelector('.pm-media-header');
      if (nextAutoHide && headerEl) {
        // Immediately slide the bar up out of sight even while cursor is still near the top
        headerEl.classList.add('force-collapse-now');
        const clearForce = () => {
          headerEl.classList.remove('force-collapse-now');
          headerEl.removeEventListener('mouseleave', clearForce);
        };
        headerEl.addEventListener('mouseleave', clearForce);
        setTimeout(clearForce, 900);
      }
      await saveSettingsPatch({
        mediaTopBarMode: nextMode,
        autoHideMediaTopBar: nextAutoHide
      });
      syncMediaTopBarAutoHideState();
      showToast(
        nextAutoHide
          ? 'Top bar unpinned — Auto-hides & shows on top-edge hover'
          : 'Top bar pinned — Always visible'
      );
    });

    document.getElementById('btn-dismiss-topbar-hint')?.addEventListener('click', () => {
      document.getElementById('pm-topbar-onboarding-hint')?.classList.add('hidden');
      saveSettingsPatch({ hasSeenTopBarHint: true });
    });

    document.getElementById('pm-media-top-hover-zone')?.addEventListener(
      'mouseenter',
      () => {
        document.getElementById('pm-topbar-onboarding-hint')?.classList.add('hidden');
      },
      { passive: true }
    );

    document.getElementById('btn-media-theme')?.addEventListener('click', async () => {
      const modes = [
        { id: 'native', label: 'Native Default' },
        { id: 'match-theme', label: 'Match PocketHub Palette' },
        { id: 'warm-glass', label: 'Cozy Warm Eye-Care' },
        { id: 'midnight-oled', label: 'Midnight Indigo' },
        { id: 'rose-twilight', label: 'Rose Twilight' }
      ];
      const cur = appSettings.socialAppThemeMode || 'native';
      const idx = modes.findIndex((m) => m.id === cur);
      const next = modes[(idx + 1) % modes.length];
      await saveSettingsPatch({ socialAppThemeMode: next.id });
      broadcastSocialAppTheme();
      showToast(`App Theme: ${next.label}`);
    });

    document.getElementById('btn-hide-bottom-nav')?.addEventListener('click', async () => {
      await saveSettingsPatch({ hideMediaBottomBar: true });
      const app = window.PocketMailMediaApps?.getAppById(activeRailAppId, appSettings);
      if (app) renderMediaBottomBar(app);
    });

    document.getElementById('btn-show-bottom-nav')?.addEventListener('click', async () => {
      await saveSettingsPatch({ hideMediaBottomBar: false });
      const app = window.PocketMailMediaApps?.getAppById(activeRailAppId, appSettings);
      if (app) renderMediaBottomBar(app);
    });

    document.getElementById('btn-add-custom-app')?.addEventListener('click', async () => {
      const nameInput = document.getElementById('input-custom-app-name');
      const urlInput = document.getElementById('input-custom-app-url');
      const colorInput = document.getElementById('input-custom-app-color');
      const name = (nameInput?.value || '').trim();
      let url = (urlInput?.value || '').trim();
      const color = colorInput?.value || '#D96B43';

      if (!name || !url) {
        showToast('Enter both an App Name and URL (https://…)');
        return;
      }
      if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
      }

      const addBtn = document.getElementById('btn-add-custom-app');
      if (addBtn) {
        addBtn.disabled = true;
        addBtn.textContent = 'Fetching Icon…';
      }

      let iconUrl = '';
      if (window.PocketMailMediaApps?.fetchWebsiteIconFromHtml) {
        try {
          iconUrl = await window.PocketMailMediaApps.fetchWebsiteIconFromHtml(url);
        } catch (_) {}
      }

      if (addBtn) {
        addBtn.disabled = false;
        addBtn.textContent = 'Add to Sidebar';
      }

      const customs = Array.isArray(appSettings.customMediaApps) ? [...appSettings.customMediaApps] : [];
      customs.push({
        id: `custom-${Date.now()}`,
        name,
        url,
        color,
        iconUrl
      });

      await saveSettingsPatch({ customMediaApps: customs });
      if (nameInput) nameInput.value = '';
      if (urlInput) urlInput.value = '';
      renderMediaAppsManager();
      renderOperaRail();
      showToast(`Added ${name} with website icon!`);
    });

    document.getElementById('btn-media-back')?.addEventListener('click', () => {
      sendCommandToMediaFrame('BACK');
    });

    document.getElementById('btn-media-reload')?.addEventListener('click', () => {
      const mediaApi = window.PocketMailMediaApps;
      const app = mediaApi ? mediaApi.getAppById(activeRailAppId, appSettings) : null;
      const entry = getActivePoolEntry();
      if (entry) {
        entry.loaded = false;
        entry.lastNavAt = Date.now();
      }
      if (app) showMediaBrandLoader(app, entry?.frame);
      sendCommandToMediaFrame('RELOAD');
    });

    document.getElementById('btn-media-zoom-out')?.addEventListener('click', () => {
      const entry = getActivePoolEntry();
      if (!entry) return;
      const nextZoom = Math.max(0.55, Math.round(((entry.zoom || 1.0) - 0.08) * 100) / 100);
      applyFrameViewportZoom(entry, nextZoom);
    });

    document.getElementById('btn-media-zoom-fit')?.addEventListener('click', () => {
      const entry = getActivePoolEntry();
      if (!entry) return;
      // Smart toggle: if currently at 100% (1.0), Fit expands virtual viewport width to ~620px so desktop layouts breathe inside narrow sidebars; if already scaled, reset to 100%
      const curZoom = entry.zoom || 1.0;
      if (Math.abs(curZoom - 1.0) < 0.03) {
        const wrapEl = document.querySelector('.pm-media-frame-wrap');
        const wrapWidth = wrapEl ? wrapEl.clientWidth : 420;
        const smartFitZoom = wrapWidth < 580 ? Math.min(0.84, Math.max(0.64, Math.round((wrapWidth / 620) * 100) / 100)) : 0.85;
        applyFrameViewportZoom(entry, smartFitZoom);
        showToast(`Smart Viewport Fit (${Math.round(smartFitZoom * 100)}% — wider desktop layout)`);
      } else {
        applyFrameViewportZoom(entry, 1.0);
        showToast('Viewport Zoom reset to 100%');
      }
    });

    document.getElementById('btn-media-zoom-in')?.addEventListener('click', () => {
      const entry = getActivePoolEntry();
      if (!entry) return;
      const nextZoom = Math.min(1.5, Math.round(((entry.zoom || 1.0) + 0.08) * 100) / 100);
      applyFrameViewportZoom(entry, nextZoom);
    });

    const openActiveMediaFloatingWin = () => {
      const floatUrl = browser.runtime.getURL(
        `src/popup/popup.html?sidebar=1&app=${encodeURIComponent(activeRailAppId || 'instagram')}`
      );
      browser.runtime.sendMessage({
        type: 'OPEN_COMPANION_WINDOW',
        url: floatUrl
      });
    };

    document.getElementById('btn-media-float-win')?.addEventListener('click', openActiveMediaFloatingWin);

    document.getElementById('btn-media-open-tab')?.addEventListener('click', () => {
      if (activeMediaUrl) {
        browser.tabs.create({ url: activeMediaUrl });
      }
    });

    document.getElementById('btn-media-close-app')?.addEventListener('click', () => {
      if (activeRailAppId && activeRailAppId !== 'pocketmail') {
        const mediaApi = window.PocketMailMediaApps;
        const app = mediaApi ? mediaApi.getAppById(activeRailAppId, appSettings) : null;
        closeMediaAppFrame(activeRailAppId);
        showToast(`Closed ${app ? app.name : 'app'} session`);
      }
    });

    // Listen for lifecycle & zoom events from media-frame-optimizer.js inside #pm-media-frame-pool
    window.addEventListener('message', (e) => {
      const data = e.data;
      if (!data || data.source !== 'pocketmail-media-frame') return;

      let sourceEntry = null;
      mediaFramePool.forEach((entry) => {
        if (entry.frame && entry.frame.contentWindow === e.source) {
          sourceEntry = entry;
        }
      });
      if (!sourceEntry && typeof data.flatFrameName === 'string' && data.flatFrameName.startsWith('pm-media-frame-')) {
        const matchedAppId = data.flatFrameName.replace('pm-media-frame-', '');
        sourceEntry = mediaFramePool.get(matchedAppId) || null;
      }

      if (data.type === 'PM_FRAME_NAVIGATE_ACTIVE' && data.url) {
        const targetEntry = sourceEntry || getActivePoolEntry();
        const appId = targetEntry?.appId || activeRailAppId;
        const app = window.PocketMailMediaApps?.getAppById(appId, appSettings);
        if (targetEntry && targetEntry.frame) {
          targetEntry.loaded = false;
          targetEntry.lastNavAt = Date.now();
          targetEntry.currentUrl = data.url;
          activeMediaUrl = data.url;
          if (app && appId === activeRailAppId) {
            showMediaBrandLoader(app, targetEntry.frame);
            const loaderTitleEl = document.getElementById('pm-media-loader-title');
            if (loaderTitleEl && data.title) {
              loaderTitleEl.textContent = data.title;
            }
          }
          targetEntry.frame.src = data.url;
        }
        return;
      }

      if (data.type === 'PM_OPEN_SPOTIFY_DRM_TAB') {
        browser.tabs.create({ url: data.url || 'https://open.spotify.com/' });
        showToast('Click "Enable DRM" on Firefox\'s yellow bar at the top of the tab!');
        return;
      }

      // If a custom website frame reports its live HTML <link rel="icon"> faviconUrl, persist it
      if (data.faviconUrl && sourceEntry && sourceEntry.appId && sourceEntry.appId.startsWith('custom-')) {
        const customs = Array.isArray(appSettings.customMediaApps) ? appSettings.customMediaApps : [];
        const cIdx = customs.findIndex((c, idx) => (c.id || `custom-${idx}`) === sourceEntry.appId);
        if (cIdx >= 0 && customs[cIdx].iconUrl !== data.faviconUrl) {
          const nextCustoms = [...customs];
          nextCustoms[cIdx] = { ...nextCustoms[cIdx], iconUrl: data.faviconUrl };
          saveSettingsPatch({ customMediaApps: nextCustoms }).then(() => {
            renderOperaRail();
            const activeIconEl = document.getElementById('media-active-icon');
            if (activeIconEl && activeRailAppId === sourceEntry.appId && window.PocketMailMediaApps) {
              activeIconEl.replaceChildren(window.PocketMailMediaApps.createAppSvgIcon(sourceEntry.appId, 13));
            }
          });
        }
      }

      if (data.ownProfileUrl && sourceEntry) {
        sourceEntry.ownProfileUrl = data.ownProfileUrl;
        if (sourceEntry.appId === 'tiktok' && appSettings.tiktokOwnProfileUrlV2 !== data.ownProfileUrl) {
          saveSettingsPatch({ tiktokOwnProfileUrlV2: data.ownProfileUrl });
        } else if (sourceEntry.appId === 'instagram' && appSettings.instagramOwnProfileUrl !== data.ownProfileUrl) {
          saveSettingsPatch({ instagramOwnProfileUrl: data.ownProfileUrl });
        } else if (sourceEntry.appId === 'x' && appSettings.xOwnProfileUrl !== data.ownProfileUrl) {
          saveSettingsPatch({ xOwnProfileUrl: data.ownProfileUrl });
        }
      }

      if (data.type === 'PM_FRAME_NAV_START') {
        if (sourceEntry) {
          sourceEntry.lastNavAt = Date.now();
        }
        const appId = sourceEntry?.appId || activeRailAppId;
        const app = window.PocketMailMediaApps?.getAppById(appId, appSettings);
        if (app && appId === activeRailAppId) {
          showMediaBrandLoader(app, sourceEntry?.frame);
          const loaderTitleEl = document.getElementById('pm-media-loader-title');
          if (loaderTitleEl && data.title) {
            loaderTitleEl.textContent = data.title;
          }
        }
      } else if (data.type === 'PM_FRAME_DOM_READY') {
        if (sourceEntry) {
          sourceEntry.loaded = true;
          if (sourceEntry.appId === activeRailAppId) {
            hideMediaBrandLoader(sourceEntry.frame);
          } else {
            sourceEntry.frame.classList.remove('is-loading');
          }
        } else {
          hideMediaBrandLoader();
        }
        broadcastSocialAppTheme();
      } else if (data.type === 'PM_FRAME_VISUAL_READY' || data.type === 'PM_FRAME_LOADED') {
        if (sourceEntry) {
          sourceEntry.loaded = true;
          if (sourceEntry.appId === activeRailAppId) {
            hideMediaBrandLoader(sourceEntry.frame);
          } else {
            sourceEntry.frame.classList.remove('is-loading');
          }
        } else {
          hideMediaBrandLoader();
        }
        broadcastSocialAppTheme();
      } else if (data.type === 'PM_FRAME_UNREAD_UPDATE') {
        let appId = sourceEntry?.appId || '';
        if (!appId && typeof data.flatFrameName === 'string' && data.flatFrameName.startsWith('pm-media-frame-')) {
          appId = data.flatFrameName.replace('pm-media-frame-', '');
        }
        if (appId) {
          const prev = socialAppUnreadMap.get(appId);
          const prevScore = prev ? (prev.unreadCount || (prev.hasUnread ? 1 : 0)) : 0;
          const prevMaxSeen = prev ? (prev.maxSeenScore || prevScore) : 0;
          const nextCount = Number(data.unreadCount) || 0;
          const nextHasUnread = Boolean(data.hasUnread || nextCount > 0);
          const nextScore = nextCount || (nextHasUnread ? 1 : 0);

          const isRecentNav = Boolean(
            data.isRouteTransition ||
              (sourceEntry && sourceEntry.lastNavAt && Date.now() - sourceEntry.lastNavAt < 5500)
          );

          socialAppUnreadMap.set(appId, {
            unreadCount: nextCount,
            hasUnread: nextHasUnread,
            maxSeenScore: Math.max(prevMaxSeen, nextScore)
          });
          renderOperaRail();

          // Play per-app custom notification sound ONLY on genuine new incoming messages (never on page/route transitions)
          if (
            !isRecentNav &&
            nextScore > prevScore &&
            nextScore > prevMaxSeen &&
            prev !== undefined &&
            appSettings.socialAppNotifySounds !== false &&
            !(appSettings.dndUntil && appSettings.dndUntil > Date.now()) &&
            window.PocketMailSound
          ) {
            const soundMap = appSettings.socialAppSoundMap || {};
            const isMediaStreamApp = ['spotify', 'youtube', 'tiktok', 'twitch', 'chatgpt', 'gemini'].includes(appId);
            const rawConfigured = soundMap[appId];
            const chosenSound =
              rawConfigured === 'none'
                ? 'none'
                : rawConfigured && rawConfigured !== 'default'
                  ? rawConfigured
                  : isMediaStreamApp && rawConfigured === undefined
                    ? 'none'
                    : appSettings.soundId || 'bamboo-pop';
            if (chosenSound !== 'none') {
              window.PocketMailSound.playNotificationSound(
                chosenSound,
                appSettings.soundVolume ?? 0.75,
                appSettings.customAudioData
              );
            }
          }
        }
      } else if (data.type === 'PM_FRAME_URL_CHANGED' && data.url) {
        if (sourceEntry) {
          // Ignore stale URL echoes during an active smooth SPA transition if the frame is still reporting the OLD URL
          if (
            sourceEntry.pendingSpaUntil &&
            Date.now() < sourceEntry.pendingSpaUntil &&
            sourceEntry.pendingSpaUrl &&
            window.PocketMailMediaApps
          ) {
            const app = window.PocketMailMediaApps.getAppById(sourceEntry.appId, appSettings);
            const subViews = app?.subViews || [];
            const targetIdx = getActiveSubViewIndex(subViews, sourceEntry.pendingSpaUrl);
            const reportedIdx = getActiveSubViewIndex(subViews, data.url);
            if (reportedIdx === targetIdx) {
              // Route transition completed! Clear pending lock
              sourceEntry.pendingSpaUntil = 0;
              sourceEntry.pendingSpaUrl = '';
            } else {
              // Still mid-transition; keep optimistic UI highlight stable
              return;
            }
          }
          sourceEntry.currentUrl = data.url;
          sourceEntry.lastNavAt = Date.now();
          syncPersistentSessionToBackground(sourceEntry.appId, data.url);
        }
        if (!sourceEntry || sourceEntry.appId === activeRailAppId) {
          activeMediaUrl = data.url;
          const subPillsEl = document.getElementById('media-subview-pills');
          if (subPillsEl && window.PocketMailMediaApps) {
            const app = window.PocketMailMediaApps.getAppById(activeRailAppId, appSettings);
            const subViews = app?.subViews || [];
            const activeSubIdx = getActiveSubViewIndex(subViews, activeMediaUrl);
            const pills = subPillsEl.querySelectorAll('.pm-media-subpill');
            subViews.forEach((_, idx) => {
              if (pills[idx]) {
                pills[idx].classList.toggle('active', idx === activeSubIdx);
              }
            });
            if (app) renderMediaBottomBar(app);
          }
        }
      } else if (data.type === 'PM_FRAME_PLAYBACK_STATE') {
        const appId =
          sourceEntry?.appId ||
          (typeof data.flatFrameName === 'string' && data.flatFrameName.startsWith('pm-media-frame-')
            ? data.flatFrameName.replace('pm-media-frame-', '')
            : '');
        if (appId) {
          const pb = {
            isPlaying: Boolean(data.isPlaying),
            currentTime: Number(data.currentTime) || 0,
            resumeUrl: data.resumeUrl || sourceEntry?.currentUrl || '',
            title: data.title || '',
            updatedAt: Date.now()
          };
          framePlaybackStates.set(appId, pb);
          if (pb.resumeUrl && sourceEntry) {
            sourceEntry.currentUrl = pb.resumeUrl;
          }
          if (pb.isPlaying || isAppPersistent(appId)) {
            syncPersistentSessionToBackground(appId, pb.resumeUrl, pb);
          }
        }
      } else if (data.type === 'PM_FRAME_ZOOM_UPDATED' && typeof data.zoom === 'number') {
        if (sourceEntry) {
          applyFrameViewportZoom(sourceEntry, data.zoom);
        }
      }
    });

    // Cycle Popup Width (520px Standard -> 660px Wide -> 780px Extra-Wide -> 520px)
    const cyclePopupWidth = async () => {
      const currentW = appSettings.popupWidth || 520;
      const nextW = currentW < 620 ? 660 : currentW < 740 ? 780 : 520;
      const label = nextW === 780 ? 'Extra-Wide (780px)' : nextW === 660 ? 'Wide (660px)' : 'Standard (520px)';
      await saveSettingsPatch({ popupWidth: nextW });
      setTimeout(applyEmailReaderScale, 80);
      showToast(`Popup Width: ${label}`);
    };

    document.getElementById('btn-toggle-wide')?.addEventListener('click', cyclePopupWidth);
    document.getElementById('btn-reader-wide')?.addEventListener('click', cyclePopupWidth);

    // Pop Out into Freely Resizable Desktop Window
    document.getElementById('btn-popout-window')?.addEventListener('click', () => {
      browser.windows.create({
        url: browser.runtime.getURL('src/popup/popup.html?popout=1'),
        type: 'popup',
        width: 900,
        height: 760
      });
    });

    // Corner Drag-to-Resize Grips
    const setupResizeGrip = (gripEl, isLeft) => {
      if (!gripEl) return;
      gripEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startX = e.screenX;
        const startY = e.screenY;
        const startW = appSettings.popupWidth || 520;
        const startH = appSettings.popupHeight || 600;
        let latestW = startW;
        let latestH = startH;

        const onMove = (moveEv) => {
          const dx = isLeft ? startX - moveEv.screenX : moveEv.screenX - startX;
          const dy = moveEv.screenY - startY;
          latestW = Math.max(380, Math.min(795, startW + dx));
          latestH = Math.max(460, Math.min(600, startH + dy));
          document.documentElement.style.setProperty('--popup-width', `${latestW}px`);
          document.documentElement.style.setProperty('--popup-height', `${latestH}px`);
          applyEmailReaderScale();
        };

        const onUp = async () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          await saveSettingsPatch({ popupWidth: latestW, popupHeight: latestH });
          showToast(`Resized to ${latestW}×${latestH}px`);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    };

    setupResizeGrip(document.getElementById('pm-resize-left'), true);
    setupResizeGrip(document.getElementById('pm-resize-right'), false);

    bindStudioControls();

    document.getElementById('btn-dnd').addEventListener('click', async () => {
      const isDnd = appSettings.dndUntil && appSettings.dndUntil > Date.now();
      const nextDnd = isDnd ? 0 : Date.now() + 60 * 60 * 1000;
      await saveSettingsPatch({ dndUntil: nextDnd });
      showToast(nextDnd ? 'Do Not Disturb enabled for 1 hour' : 'Notifications resumed');
    });

    const refreshBtn = document.getElementById('btn-refresh');
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.classList.add('pm-spinning');
      const res = await browser.runtime.sendMessage({ type: 'SYNC_NOW' });
      refreshBtn.classList.remove('pm-spinning');
      if (res && res.state) {
        appState = res.state;
        appSettings = res.settings;
        snoozedMap = res.snoozed || {};
        renderAll();
        showToast('Synced all accounts locally');
      }
    });

    document.getElementById('btn-demo-signin').addEventListener('click', openAccountDrawer);

    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value || '';
      renderEmailList();
    });

    document.querySelectorAll('.pm-filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.pm-filter-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        activeFilter = chip.getAttribute('data-filter');
        renderEmailList();
      });
    });

    document.getElementById('btn-mark-all-read').addEventListener('click', async () => {
      const targetEmail = selectedAccountEmail === 'ALL' ? null : selectedAccountEmail;
      const res = await browser.runtime.sendMessage({
        type: 'MARK_ALL_READ',
        accountEmail: targetEmail
      });
      if (res && res.state) {
        appState = res.state;
        snoozedMap = res.snoozed || {};
        renderAll();
        showToast('Marked as read (switch to "All" tab anytime to view)');
      }
    });

    document.getElementById('btn-tts-stop').addEventListener('click', () => {
      PocketMailSound.stopSpeaking();
      ttsBar.classList.add('hidden');
    });

    document.getElementById('btn-open-gmail').addEventListener('click', () => {
      let slot = 0;
      if (selectedAccountEmail !== 'ALL') {
        const found = (appState.accounts || []).find((a) => a.email === selectedAccountEmail);
        if (found && found.slotIndex !== undefined) slot = found.slotIndex;
      }
      browser.tabs.create({ url: `https://mail.google.com/mail/u/${slot}/#inbox` });
    });

    document.getElementById('btn-footer-add-account').addEventListener('click', openAccountDrawer);

    document.getElementById('btn-reader-back').addEventListener('click', () => {
      readerDrawer.classList.add('hidden');
      activeReaderMessage = null;
    });

    // Prev / Next Email Navigation inside Reader
    const navigateReaderEmail = (delta) => {
      if (!activeReaderMessage) return;
      const list = getVisibleMessages();
      const idx = list.findIndex((m) => m.id === activeReaderMessage.id);
      if (idx === -1) return;
      const targetIdx = idx + delta;
      if (targetIdx >= 0 && targetIdx < list.length) {
        openReaderView(list[targetIdx]);
      } else {
        showToast(delta < 0 ? 'Already at newest email' : 'Already at last email');
      }
    };

    document.getElementById('btn-reader-prev')?.addEventListener('click', () => navigateReaderEmail(-1));
    document.getElementById('btn-reader-next')?.addEventListener('click', () => navigateReaderEmail(1));

    document.getElementById('btn-reader-star')?.addEventListener('click', async () => {
      if (!activeReaderMessage) return;
      await triggerCardAction(activeReaderMessage, 'star');
      updateReaderStarButton();
      showToast(activeReaderMessage.starred ? 'Starred email' : 'Removed star');
    });

    document.getElementById('btn-reader-listen').addEventListener('click', () => {
      if (!activeReaderMessage) return;
      triggerCardAction(activeReaderMessage, 'listen');
    });

    document.getElementById('btn-reader-mark-read').addEventListener('click', async () => {
      if (!activeReaderMessage) return;
      await triggerCardAction(activeReaderMessage, 'markRead');
      readerDrawer.classList.add('hidden');
    });

    document.getElementById('btn-reader-snooze')?.addEventListener('click', () => {
      const snoozeBar = document.getElementById('pm-reader-snooze-bar');
      if (snoozeBar) snoozeBar.classList.toggle('hidden');
    });

    document.querySelectorAll('[data-snooze-mins]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!activeReaderMessage) return;
        const mins = parseInt(btn.getAttribute('data-snooze-mins') || '60', 10);
        const res = await browser.runtime.sendMessage({
          type: 'MESSAGE_ACTION',
          message: activeReaderMessage,
          actionType: 'snooze',
          extra: { wakeAt: Date.now() + mins * 60 * 1000 }
        });
        if (res && res.state) {
          appState = res.state;
          snoozedMap = res.snoozed || {};
          readerDrawer.classList.add('hidden');
          renderAll();
          showToast(`Snoozed (${btn.textContent.trim()})`);
        }
      });
    });

    document.getElementById('btn-reader-archive').addEventListener('click', async () => {
      if (!activeReaderMessage) return;
      await triggerCardAction(activeReaderMessage, 'archive');
      readerDrawer.classList.add('hidden');
    });

    document.getElementById('btn-reader-delete').addEventListener('click', async () => {
      if (!activeReaderMessage) return;
      await triggerCardAction(activeReaderMessage, 'deleteTrash');
      readerDrawer.classList.add('hidden');
    });

    document.getElementById('btn-reader-open-web').addEventListener('click', () => {
      if (!activeReaderMessage) return;
      browser.tabs.create({ url: activeReaderMessage.webUrl || 'https://mail.google.com/' });
    });

    // Reader Fit, Zoom, Copy OTP, Unsubscribe, Copy Text & Translate
    document.getElementById('btn-reader-autofit')?.addEventListener('click', () => {
      autoFitEmail = !autoFitEmail;
      if (!autoFitEmail) readerZoom = 100;
      applyEmailReaderScale();
      showToast(autoFitEmail ? 'Auto-Fit Email Width enabled' : 'Original 100% email width');
    });

    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
      autoFitEmail = false;
      readerZoom = Math.max(55, readerZoom - 10);
      applyEmailReaderScale();
    });

    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
      autoFitEmail = false;
      readerZoom = Math.min(140, readerZoom + 10);
      applyEmailReaderScale();
    });

    document.getElementById('btn-reader-copy-otp')?.addEventListener('click', async (e) => {
      const code = e.currentTarget.getAttribute('data-otp');
      if (code && navigator.clipboard) {
        await navigator.clipboard.writeText(code);
        showToast(`Copied verification code: ${code}`);
      }
    });

    document.getElementById('btn-reader-unsubscribe')?.addEventListener('click', () => {
      if (activeReaderMessage && activeReaderMessage.unsubscribeUrl) {
        browser.tabs.create({ url: activeReaderMessage.unsubscribeUrl });
      }
    });

    document.getElementById('btn-reader-copy-text')?.addEventListener('click', async () => {
      if (!activeReaderMessage) return;
      const text = `${activeReaderMessage.subject}\nFrom: ${activeReaderMessage.senderName} <${activeReaderMessage.senderEmail}>\n\n${activeReaderMessage.fullText || activeReaderMessage.snippet || ''}`;
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        showToast('Copied email text to clipboard!');
      }
    });

    document.getElementById('btn-reader-translate')?.addEventListener('click', () => {
      if (!activeReaderMessage) return;
      const text = (activeReaderMessage.fullText || activeReaderMessage.snippet || activeReaderMessage.subject || '').slice(0, 3500);
      const translateUrl = `https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(text)}&op=translate`;
      browser.tabs.create({ url: translateUrl });
    });

    // Make all links & buttons inside the email body open reliably in a new browser tab
    document.getElementById('reader-body')?.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:'))) {
        e.preventDefault();
        browser.tabs.create({ url: href });
      }
    });

    // Quick Reply Canned Chips
    document.querySelectorAll('.pm-canned-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const replyInput = document.getElementById('reader-reply-input');
        if (replyInput) {
          replyInput.value = chip.getAttribute('data-reply-text') || '';
          replyInput.focus();
        }
      });
    });

    // Keyboard Shortcuts (J/K, R, E, S, W, Escape, Ctrl+Enter)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (!composeDrawer.classList.contains('hidden')) {
          e.preventDefault();
          document.getElementById('btn-compose-send')?.click();
          return;
        }
        if (!readerDrawer.classList.contains('hidden') && activeReaderMessage) {
          e.preventDefault();
          document.getElementById('btn-reader-send-reply')?.click();
          return;
        }
      }

      const tag = (e.target && e.target.tagName) || '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        if (e.key === 'Escape') e.target.blur();
        return;
      }

      if (e.key === 'Escape') {
        if (!readerDrawer.classList.contains('hidden')) {
          readerDrawer.classList.add('hidden');
          activeReaderMessage = null;
        } else if (!themeDrawer.classList.contains('hidden')) {
          themeDrawer.classList.add('hidden');
        } else if (!accountDrawer.classList.contains('hidden')) {
          accountDrawer.classList.add('hidden');
        } else if (!composeDrawer.classList.contains('hidden')) {
          composeDrawer.classList.add('hidden');
        }
        return;
      }

      if (e.key.toLowerCase() === 'w') {
        cyclePopupWidth();
        return;
      }

      if (!readerDrawer.classList.contains('hidden') && activeReaderMessage) {
        if (e.key === 'j' || e.key === 'ArrowDown') {
          navigateReaderEmail(1);
        } else if (e.key === 'k' || e.key === 'ArrowUp') {
          navigateReaderEmail(-1);
        } else if (e.key.toLowerCase() === 'e') {
          document.getElementById('btn-reader-archive')?.click();
        } else if (e.key.toLowerCase() === 'r') {
          document.getElementById('btn-reader-mark-read')?.click();
        } else if (e.key.toLowerCase() === 's') {
          document.getElementById('btn-reader-star')?.click();
        }
      }
    });

    const openReplyInGmailTab = () => {
      if (!activeReaderMessage) return;
      const replyBody = document.getElementById('reader-reply-input').value.trim();
      const slot = activeReaderMessage.accountSlot || 0;
      const replySubject = activeReaderMessage.subject.startsWith('Re:')
        ? activeReaderMessage.subject
        : `Re: ${activeReaderMessage.subject}`;

      const gmailComposeUrl =
        `https://mail.google.com/mail/u/${slot}/?view=cm&fs=1` +
        `&to=${encodeURIComponent(activeReaderMessage.senderEmail)}` +
        `&su=${encodeURIComponent(replySubject)}` +
        `&body=${encodeURIComponent(replyBody)}`;

      browser.tabs.create({ url: gmailComposeUrl });
    };

    document.getElementById('btn-reader-reply-tab')?.addEventListener('click', openReplyInGmailTab);

    document.getElementById('btn-reader-send-reply').addEventListener('click', async () => {
      if (!activeReaderMessage) return;
      const replyInput = document.getElementById('reader-reply-input');
      const replyBody = (replyInput?.value || '').trim();
      if (!replyBody) {
        showToast('Write a reply message first!');
        replyInput?.focus();
        return;
      }

      const sendBtn = document.getElementById('btn-reader-send-reply');
      const sendLbl = document.getElementById('lbl-reader-send-reply');
      const slot = activeReaderMessage.accountSlot || 0;
      const replySubject = activeReaderMessage.subject.startsWith('Re:')
        ? activeReaderMessage.subject
        : `Re: ${activeReaderMessage.subject}`;

      if (sendBtn) sendBtn.disabled = true;
      if (sendLbl) sendLbl.textContent = 'Sending…';

      try {
        const res = await browser.runtime.sendMessage({
          type: 'SEND_EMAIL',
          payload: {
            slotIndex: slot,
            accountEmail: activeReaderMessage.accountEmail || '',
            to: activeReaderMessage.senderEmail,
            subject: replySubject,
            body: replyBody,
            threadId: activeReaderMessage.threadId || '',
            isDemo: Boolean(activeReaderMessage.isDemo)
          }
        });

        if (res && res.ok) {
          if (replyInput) replyInput.value = '';
          showToast(`✓ Reply sent directly to ${activeReaderMessage.senderName || activeReaderMessage.senderEmail}!`);
        } else {
          // Open inside PocketMail's Embedded Gmail Composer Drawer pre-filled!
          readerDrawer.classList.add('hidden');
          openComposeDrawer({
            to: activeReaderMessage.senderEmail,
            subject: replySubject,
            body: replyBody
          });
          setComposeDrawerMode('embed');
          showToast('Loaded in Embedded Gmail Composer — click Send below!');
        }
      } catch (_) {
        showToast('Could not send reply; try Embedded Gmail mode.');
      } finally {
        if (sendBtn) sendBtn.disabled = false;
        if (sendLbl) sendLbl.textContent = 'Send Reply';
      }
    });

    document.getElementById('btn-theme-back').addEventListener('click', () => {
      themeDrawer.classList.add('hidden');
    });

    document.getElementById('input-custom-bg').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        await saveSettingsPatch({
          wallpaper: 'custom',
          customWallpaperData: reader.result
        });
        renderThemeStudioGrids();
        showToast('Custom photo background applied!');
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('btn-clear-custom-bg').addEventListener('click', async () => {
      const themeObj = PocketMailThemes.THEMES[appSettings.theme] || PocketMailThemes.THEMES['warm-linen'];
      await saveSettingsPatch({
        wallpaper: themeObj.defaultWallpaper,
        customWallpaperData: ''
      });
      renderThemeStudioGrids();
      showToast('Reset to theme default background');
    });

    document.getElementById('btn-account-back').addEventListener('click', () => {
      accountDrawer.classList.add('hidden');
    });

    document.getElementById('btn-google-login-popup').addEventListener('click', async () => {
      await browser.runtime.sendMessage({ type: 'OPEN_GOOGLE_LOGIN' });
      showToast('Opening Google Account Sign-In…');
    });

    document.getElementById('btn-rescan-sessions').addEventListener('click', async () => {
      showToast('Scanning signed-in Google accounts…');
      const res = await browser.runtime.sendMessage({ type: 'SYNC_NOW' });
      if (res && res.state) {
        appState = res.state;
        appSettings = res.settings;
        renderAll();
        renderConnectedAccountsList();
        showToast(`Found ${appState.accounts.length} account(s)`);
      }
    });

    document.getElementById('btn-oauth-connect').addEventListener('click', async () => {
      const clientId = document.getElementById('input-oauth-client-id').value.trim();
      if (!clientId) {
        showToast('Enter a Google OAuth Client ID first, or use "Sign in with Google Account" above!');
        return;
      }
      try {
        showToast('Launching Google OAuth…');
        const res = await browser.runtime.sendMessage({
          type: 'CONNECT_OAUTH_ACCOUNT',
          clientId
        });
        if (res && res.ok) {
          appState = res.state;
          appSettings = res.settings;
          renderAll();
          renderConnectedAccountsList();
          showToast(`Connected ${res.account.email}!`);
        }
      } catch (err) {
        showToast(err.message || 'OAuth login cancelled');
      }
    });

    document.getElementById('btn-compose-back').addEventListener('click', () => {
      composeDrawer.classList.add('hidden');
    });

    document.getElementById('btn-compose-mode-native')?.addEventListener('click', () => {
      setComposeDrawerMode('native');
    });

    document.getElementById('btn-compose-mode-embed')?.addEventListener('click', () => {
      setComposeDrawerMode('embed');
    });

    document.getElementById('compose-from')?.addEventListener('change', () => {
      const embedPane = document.getElementById('pm-compose-embed-pane');
      if (embedPane && !embedPane.classList.contains('hidden')) {
        setComposeDrawerMode('embed');
      }
    });

    document.getElementById('btn-toggle-cc-bcc')?.addEventListener('click', () => {
      const row = document.getElementById('compose-cc-bcc-row');
      if (row) {
        const isHidden = row.classList.toggle('hidden');
        if (!isHidden) {
          document.getElementById('compose-cc')?.focus();
        }
      }
    });

    const COMPOSE_TEMPLATES = {
      checkin: {
        subject: 'Quick check-in',
        body: 'Hi there,\n\nHope your week is going well! Just wanted to quickly check in on this when you have a moment.\n\nWarm regards,'
      },
      thanks: {
        subject: 'Thank you!',
        body: 'Hi,\n\nThank you so much for sending this over — I really appreciate your help!\n\nBest,'
      },
      followup: {
        subject: 'Following up on our conversation',
        body: 'Hi,\n\nGreat speaking with you! Here is a quick follow-up on our next steps.\n\nWarmly,'
      }
    };

    document.querySelectorAll('[data-compose-template]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const key = chip.getAttribute('data-compose-template');
        const subInput = document.getElementById('compose-subject');
        const bodyInput = document.getElementById('compose-body');
        if (key === 'clear') {
          if (bodyInput) bodyInput.value = '';
          bodyInput?.focus();
          return;
        }
        const tpl = COMPOSE_TEMPLATES[key];
        if (tpl) {
          if (subInput && !subInput.value.trim()) subInput.value = tpl.subject;
          if (bodyInput) bodyInput.value = tpl.body;
          bodyInput?.focus();
        }
      });
    });

    document.getElementById('btn-compose-open-tab')?.addEventListener('click', () => {
      const slot = document.getElementById('compose-from').value || '0';
      const to = document.getElementById('compose-to').value.trim();
      const cc = (document.getElementById('compose-cc')?.value || '').trim();
      const bcc = (document.getElementById('compose-bcc')?.value || '').trim();
      const su = document.getElementById('compose-subject').value.trim();
      const body = document.getElementById('compose-body').value.trim();

      const url =
        `https://mail.google.com/mail/u/${slot}/?view=cm&fs=1` +
        `&to=${encodeURIComponent(to)}` +
        (cc ? `&cc=${encodeURIComponent(cc)}` : '') +
        (bcc ? `&bcc=${encodeURIComponent(bcc)}` : '') +
        `&su=${encodeURIComponent(su)}` +
        `&body=${encodeURIComponent(body)}`;

      browser.tabs.create({ url });
      composeDrawer.classList.add('hidden');
    });

    document.getElementById('btn-compose-send').addEventListener('click', async () => {
      const fromSelect = document.getElementById('compose-from');
      const selectedOpt = fromSelect?.options?.[fromSelect.selectedIndex];
      const slot = parseInt(fromSelect?.value || '0', 10) || 0;
      const accountEmail = selectedOpt?.getAttribute('data-email') || '';
      const isDemo = selectedOpt?.getAttribute('data-demo') === '1';

      const to = document.getElementById('compose-to').value.trim();
      const cc = (document.getElementById('compose-cc')?.value || '').trim();
      const bcc = (document.getElementById('compose-bcc')?.value || '').trim();
      const su = document.getElementById('compose-subject').value.trim();
      const body = document.getElementById('compose-body').value.trim();

      if (!to) {
        showToast('Please enter a recipient in the "To" field');
        document.getElementById('compose-to')?.focus();
        return;
      }

      const sendBtn = document.getElementById('btn-compose-send');
      const sendLbl = document.getElementById('lbl-compose-send');
      if (sendBtn) sendBtn.disabled = true;
      if (sendLbl) sendLbl.textContent = 'Sending Locally…';

      try {
        const res = await browser.runtime.sendMessage({
          type: 'SEND_EMAIL',
          payload: {
            slotIndex: slot,
            accountEmail,
            to,
            cc,
            bcc,
            subject: su,
            body,
            isDemo
          }
        });

        if (res && res.ok) {
          document.getElementById('compose-to').value = '';
          if (document.getElementById('compose-cc')) document.getElementById('compose-cc').value = '';
          if (document.getElementById('compose-bcc')) document.getElementById('compose-bcc').value = '';
          document.getElementById('compose-subject').value = '';
          document.getElementById('compose-body').value = '';
          composeDrawer.classList.add('hidden');
          showToast(`✓ Email sent directly to ${to}!`);
        } else {
          // Automatically switch to Embedded Gmail Composer right inside the drawer!
          setComposeDrawerMode('embed');
          showToast('Loaded inside Embedded Gmail Composer — click Send below!');
        }
      } catch (err) {
        setComposeDrawerMode('embed');
        showToast('Loaded inside Embedded Gmail Composer — click Send below!');
      } finally {
        if (sendBtn) sendBtn.disabled = false;
        if (sendLbl) sendLbl.textContent = 'Send Email Now';
      }
    });

    browser.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'STATE_UPDATED') {
        appState = msg.state;
        appSettings = msg.settings;
        renderAll();
      }
    });

    // When the user closes the sidebar (×), save persistent app URLs and hand off active music/audio to Background Audio Keep-Alive!
    if (IS_SIDEBAR_VIEW) {
      window.addEventListener('pagehide', () => {
        const mode = appSettings.persistenceMode || 'eco';
        if (mode === 'eco') return;

        const savedUrls = {};
        const playingApps = [];
        mediaFramePool.forEach((entry, id) => {
          if (!isAppPersistent(id)) return;
          const pb = framePlaybackStates.get(id);
          const bestUrl = pb?.resumeUrl || entry.currentUrl || entry.restoredUrl || '';
          if (bestUrl && !bestUrl.includes('pm_boot=1')) {
            savedUrls[id] = bestUrl;
          }
          if (pb && pb.isPlaying && Date.now() - pb.updatedAt < 12000 && bestUrl) {
            playingApps.push({
              appId: id,
              url: bestUrl,
              title: pb.title || ''
            });
          }
        });

        browser.runtime
          .sendMessage({
            type: 'SIDEBAR_CLOSED_HANDOFF',
            activeAppId: activeRailAppId,
            savedUrls,
            playingApps
          })
          .catch(() => {});
      });
    }
  }

  async function init() {
    bindEvents();
    const res = await browser.runtime.sendMessage({ type: 'GET_STATE' });
    if (res) {
      appState = res.state || appState;
      appSettings = res.settings || appSettings;
      snoozedMap = res.snoozed || {};

      // If Sidebar is opening, stop any background audio handoff frames so the sidebar takes over cleanly without double audio
      if (IS_SIDEBAR_VIEW) {
        try {
          const handoffRes = await browser.runtime.sendMessage({ type: 'STOP_BG_AUDIO_HANDOFF' });
          if (handoffRes && handoffRes.settings) {
            appSettings = handoffRes.settings;
          }
        } catch (_) {}
      }

      // Pre-seed hibernatedAppUrls for all persistent apps so clicking them or auto-restoring resumes their exact saved URL/timestamp!
      const savedMap = appSettings.persistentSavedAppUrls || {};
      Object.entries(savedMap).forEach(([id, savedUrl]) => {
        if (savedUrl && isAppPersistent(id)) {
          hibernatedAppUrls.set(id, savedUrl);
        }
      });

      renderAll();

      const params = new URLSearchParams(window.location.search || '');
      const initialAppId = params.get('app');
      if (initialAppId && window.PocketMailMediaApps) {
        const app = window.PocketMailMediaApps.getAppById(initialAppId, appSettings);
        if (app) {
          openMediaWorkspace(app, hibernatedAppUrls.get(app.id) || undefined);
          return;
        }
      }

      // If Persistent App Memory ('selected' or 'all') is enabled in Sidebar, restore the last active persistent app automatically!
      if (IS_SIDEBAR_VIEW && window.PocketMailMediaApps) {
        const lastActiveId = appSettings.persistentLastActiveAppId;
        if (lastActiveId && lastActiveId !== 'pocketmail' && isAppPersistent(lastActiveId)) {
          const app = window.PocketMailMediaApps.getAppById(lastActiveId, appSettings);
          if (app) {
            openMediaWorkspace(app, hibernatedAppUrls.get(app.id) || undefined);
          }
        }
      }
    }
  }

  init();
})();
