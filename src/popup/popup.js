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
    copy: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
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
    const chipSentLabel = document.getElementById('chip-sent-label');
    if (chipSentLabel) {
      const sentCount = Array.isArray(appState.sentMessages)
        ? appState.sentMessages.filter((m) => selectedAccountEmail === 'ALL' || m.accountEmail === selectedAccountEmail).length
        : 0;
      chipSentLabel.textContent = sentCount > 0 ? `Sent (${sentCount})` : 'Sent';
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

    if (activeFilter === 'sent') {
      let sentList = Array.isArray(appState.sentMessages) ? [...appState.sentMessages] : [];
      sentList = sentList.filter((m) => selectedAccountEmail === 'ALL' || m.accountEmail === selectedAccountEmail);
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        sentList = sentList.filter(
          (m) =>
            (m.subject || '').toLowerCase().includes(q) ||
            (m.senderName || '').toLowerCase().includes(q) ||
            (m.senderEmail || '').toLowerCase().includes(q) ||
            (m.snippet || '').toLowerCase().includes(q)
        );
      }
      return sentList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
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
          : activeFilter === 'sent'
          ? 'No sent emails yet'
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
          : activeFilter === 'sent'
          ? 'Emails you send or reply to from FoxHub will appear here and in your Gmail Sent folder.'
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
                <button class="pm-action-pill" data-action="copyText" title="Copy highlighted text or full message content">
                  ${SVGS.copy}
                  <span>Copy</span>
                </button>
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
          if (action === 'copyText') {
            const selText = (window.getSelection && window.getSelection().toString().trim()) || '';
            if (selText && navigator.clipboard) {
              await navigator.clipboard.writeText(selText);
              showToast(`Copied selection: "${selText.slice(0, 36)}${selText.length > 36 ? '…' : ''}"`);
              return;
            }
            let bodyText = msgObj.fullText || '';
            if (!bodyText) {
              try {
                const fullRes = await browser.runtime.sendMessage({ type: 'FETCH_FULL_EMAIL', message: msgObj });
                if (fullRes && fullRes.plainText) {
                  bodyText = fullRes.plainText;
                  msgObj.fullText = bodyText;
                }
              } catch (_) {}
            }
            const toCopy = `${msgObj.subject || ''}\n${bodyText || msgObj.snippet || ''}`.trim();
            if (toCopy && navigator.clipboard) {
              await navigator.clipboard.writeText(toCopy);
              showToast('Copied message text to clipboard!');
            }
            return;
          }
          await triggerCardAction(msgObj, action);
        });
      });

      cardEl.addEventListener('click', () => {
        const sel = window.getSelection && window.getSelection();
        if (sel && sel.toString().trim().length > 0) return;
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
   * Scan any email for useful copyable items (Codes, Commit/Build/Order IDs, Links, Emails, Subject, Sender)
   * and render 1-click Copy Chips inside the Reader View
   */
  function renderReaderSmartCopyChips(msgObj, bodyEl, detectedOtp = '') {
    const barEl = document.getElementById('pm-reader-smart-chips');
    if (!barEl || !msgObj) return;
    barEl.replaceChildren();

    const items = [];
    const seenVals = new Set();
    const addChip = (label, value, title) => {
      const val = String(value || '').trim();
      if (!val || seenVals.has(val)) return;
      seenVals.add(val);
      items.push({ label, value: val, title: title || `Click to copy: ${val}` });
    };

    if (detectedOtp) {
      addChip(`Code: ${detectedOtp}`, detectedOtp, `Copy verification code: ${detectedOtp}`);
    }

    const fullStr = `${msgObj.subject || ''} ${msgObj.fullText || msgObj.snippet || ''}`;

    // Extract commit hashes (e.g. 2925f54), ticket/order/PR IDs (#1234), or hyphenated run/branch tokens (e.g. night-audit-058-096)
    const parenHexMatch = (msgObj.subject || '').match(/\(([a-f0-9]{7,12})\)/i);
    if (parenHexMatch && parenHexMatch[1]) {
      addChip(`Commit: ${parenHexMatch[1]}`, parenHexMatch[1]);
    }
    const idTokens = fullStr.match(/(?:#\d{3,10}|\b[a-z]+-[a-z0-9]+-\d{2,6}(?:-\d{2,6})?\b|\b[A-Z]{2,5}-\d{3,10}\b)/g) || [];
    idTokens.slice(0, 2).forEach((tok) => {
      addChip(`ID: ${tok}`, tok);
    });

    // Extract clean links from the rendered HTML body or text
    const urlSet = new Set();
    if (bodyEl) {
      bodyEl.querySelectorAll('a[href^="http"]').forEach((a) => {
        const href = (a.getAttribute('href') || '').trim();
        if (href && !/unsubscribe|optout|opt-out|preferences|mailto:/i.test(href)) {
          urlSet.add(href);
        }
      });
    }
    const textUrls = fullStr.match(/https?:\/\/[^\s"'<>)]+/gi) || [];
    textUrls.forEach((u) => {
      if (!/unsubscribe|optout|opt-out|preferences/i.test(u)) {
        urlSet.add(u);
      }
    });
    Array.from(urlSet)
      .slice(0, 2)
      .forEach((urlStr) => {
        let shortHost = urlStr;
        try {
          const u = new URL(urlStr);
          const cleanPath = u.pathname && u.pathname !== '/' ? u.pathname.slice(0, 18) : '';
          shortHost = `${u.hostname.replace(/^www\./, '')}${cleanPath}${u.pathname.length > 18 ? '…' : ''}`;
        } catch (_) {}
        addChip(`Link: ${shortHost}`, urlStr, `Copy URL: ${urlStr}`);
      });

    if (msgObj.subject) {
      addChip('Copy Subject', msgObj.subject, `Copy subject: ${msgObj.subject}`);
    }
    if (msgObj.senderEmail) {
      addChip(`Sender: ${msgObj.senderEmail}`, msgObj.senderEmail, `Copy sender email: ${msgObj.senderEmail}`);
    }

    if (items.length === 0) {
      barEl.classList.add('hidden');
      return;
    }

    barEl.classList.remove('hidden');
    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pm-smart-copy-chip';
      btn.title = item.title;
      setSafeHtml(btn, `${SVGS.copy}<span>${escapeHtml(item.label)}</span>`);
      btn.addEventListener('click', async () => {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(item.value);
          showToast(`Copied: ${item.value.slice(0, 42)}${item.value.length > 42 ? '…' : ''}`);
        }
      });
      barEl.appendChild(btn);
    });
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
    renderReaderSmartCopyChips(msgObj, null, initialOtp);

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
        renderReaderSmartCopyChips(activeReaderMessage, bodyEl, detectedOtp);

        // Re-calculate Auto-Fit scale immediately and as images finish loading
        requestAnimationFrame(applyEmailReaderScale);
        setTimeout(applyEmailReaderScale, 120);
        bodyEl.querySelectorAll('img').forEach((img) => {
          img.addEventListener('load', applyEmailReaderScale);
        });
      } else {
        bodyEl.textContent = msgObj.snippet || 'No additional content.';
        renderReaderSmartCopyChips(activeReaderMessage, bodyEl, initialOtp);
        applyEmailReaderScale();
      }
    } catch (e) {
      bodyEl.textContent = msgObj.snippet || 'Could not load full thread.';
      renderReaderSmartCopyChips(activeReaderMessage, bodyEl, initialOtp);
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

  let pendingGmailAutoSendResolver = null;

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
    if (embedPane) {
      embedPane.style.cssText = '';
    }

    if (isEmbed && gmailFrame) {
      const fromSelect = document.getElementById('compose-from');
      const slot = fromSelect?.value || '0';
      const selectedOpt = fromSelect?.options?.[fromSelect.selectedIndex];
      const accountEmail = (selectedOpt?.getAttribute('data-email') || '').trim();
      const authUserParam = encodeURIComponent(accountEmail || String(slot));
      const to = (document.getElementById('compose-to')?.value || '').trim();
      const cc = (document.getElementById('compose-cc')?.value || '').trim();
      const bcc = (document.getElementById('compose-bcc')?.value || '').trim();
      const su = (document.getElementById('compose-subject')?.value || '').trim();
      const body = (document.getElementById('compose-body')?.value || '').trim();

      gmailFrame.name =
        'pm-gmail-compose:' +
        JSON.stringify({
          pmMode: 'embed',
          to,
          cc,
          bcc,
          su,
          body,
          ts: Date.now()
        });
      const embedUrl =
        `https://mail.google.com/mail/u/${slot}/?view=cm&fs=1&tf=1&authuser=${authUserParam}` +
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

  /**
   * Executes a genuine first-party Gmail send inside #pm-compose-gmail-frame
   * using ?view=cm&fs=1&tf=1&...&pm_autosend=1 so Gmail's own web composer
   * dispatches the message with valid first-party CSRF tokens and saves to Sent Mail.
   */
  function sendEmailViaFirstPartyGmailFrame(payload) {
    return new Promise((resolve) => {
      const gmailFrame = document.getElementById('pm-compose-gmail-frame');
      const embedPane = document.getElementById('pm-compose-embed-pane');
      if (!gmailFrame) {
        resolve({ ok: false, reason: 'no_frame' });
        return;
      }

      const slot = payload.slotIndex || 0;
      const accountEmail = (payload.accountEmail || '').trim();
      const authUserParam = encodeURIComponent(accountEmail || String(slot));
      const to = (payload.to || '').trim();
      const cc = (payload.cc || '').trim();
      const bcc = (payload.bcc || '').trim();
      const su = (payload.subject || '').trim();
      const body = (payload.body || '').trim();

      // Keep the frame laid out off-screen if the user is on the Native Form tab so Gmail's composer initializes at full speed
      const wasHidden = embedPane ? embedPane.classList.contains('hidden') : false;
      if (wasHidden && embedPane) {
        embedPane.classList.remove('hidden');
        embedPane.style.cssText =
          'position:fixed !important;left:-9999px !important;top:0 !important;width:480px !important;height:520px !important;opacity:0 !important;pointer-events:none !important;z-index:-1 !important;';
      }

      let finished = false;
      const finish = (result) => {
        if (finished) return;
        finished = true;
        if (pendingGmailAutoSendResolver === finish) {
          pendingGmailAutoSendResolver = null;
        }
        if (wasHidden && embedPane && result && result.ok) {
          embedPane.style.cssText = '';
          embedPane.classList.add('hidden');
        }
        resolve(result || { ok: false, reason: 'unknown' });
      };

      pendingGmailAutoSendResolver = finish;

      gmailFrame.name =
        'pm-gmail-compose:' +
        JSON.stringify({
          pmMode: 'autosend',
          to,
          cc,
          bcc,
          su,
          body,
          ts: Date.now()
        });
      const autoSendUrl =
        `https://mail.google.com/mail/u/${slot}/?view=cm&fs=1&tf=1&authuser=${authUserParam}` +
        (to ? `&to=${encodeURIComponent(to)}` : '') +
        (cc ? `&cc=${encodeURIComponent(cc)}` : '') +
        (bcc ? `&bcc=${encodeURIComponent(bcc)}` : '') +
        (su ? `&su=${encodeURIComponent(su)}` : '') +
        (body ? `&body=${encodeURIComponent(body)}` : '') +
        `&pm_autosend=1&_t=${Date.now()}`;

      gmailFrame.dataset.loadedUrl = autoSendUrl;
      gmailFrame.src = autoSendUrl;

      setTimeout(() => {
        finish({ ok: false, reason: 'timeout' });
      }, 13500);
    });
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

  const THEME_OR_LAYOUT_KEYS = new Set([
    'theme',
    'wallpaper',
    'customWallpaperData',
    'wallpaperOpacity',
    'wallpaperBlur',
    'accentColor',
    'fontFamily',
    'cardRadius',
    'density',
    'popupWidth',
    'popupHeight',
    'customColorBg',
    'customColorCard',
    'customColorText',
    'customColorAccent'
  ]);
  const ACCOUNT_SYNC_KEYS = new Set([
    'demoMode',
    'accountConfigs',
    'maxAccounts',
    'maxEmailsPerAccount',
    'oauthAccounts'
  ]);

  async function saveSettingsPatch(patch) {
    if (!patch || typeof patch !== 'object') return;
    appSettings = { ...appSettings, ...patch };
    const patchKeys = Object.keys(patch);
    const touchesTheme = patchKeys.some((k) => THEME_OR_LAYOUT_KEYS.has(k));
    const touchesAccounts = patchKeys.some((k) => ACCOUNT_SYNC_KEYS.has(k));

    if (touchesTheme) {
      PocketMailThemes.applyThemeAndWallpaper(document, appSettings);
    }
    if (themeDrawer && !themeDrawer.classList.contains('hidden')) {
      syncStudioControlsState();
      renderStudioLivePreview();
    }
    if (
      patch.enabledMediaApps !== undefined ||
      patch.mediaAppsOrder !== undefined ||
      patch.customMediaApps !== undefined
    ) {
      renderOperaRail();
    }

    const sendPromise = browser.runtime
      .sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: patch
      })
      .then((res) => {
        if (res && res.state) {
          appState = res.state;
        }
        if (touchesAccounts) {
          renderHeaderStatus();
          renderAccountsBar();
          renderEmailList();
        }
        return res;
      })
      .catch(() => null);

    if (touchesAccounts) {
      await sendPromise;
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

    const isAppPlayingAudioNow = (appId) => {
      if (!appId) return false;
      if (appId === currentAudibleBgAppId) return true;
      if (pendingSidebarAudioTakeoverSet.has(appId) || sidebarMsePlayers.has(appId)) return true;
      const pb = framePlaybackStates.get(appId);
      return Boolean(pb && pb.isPlaying && Date.now() - (pb.updatedAt || 0) < 15000);
    };

    const anyAudioPlaying =
      Boolean(currentAudibleBgAppId) ||
      pendingSidebarAudioTakeoverSet.size > 0 ||
      sidebarMsePlayers.size > 0 ||
      Array.from(framePlaybackStates.keys()).some((id) => isAppPlayingAudioNow(id));

    [openSidebarBtn, headerSidebarBtn].forEach((sBtn) => {
      if (!sBtn) return;
      sBtn.classList.toggle('is-playing-audio', anyAudioPlaying);
      sBtn.title = anyAudioPlaying
        ? '▶ Audio playing in Left Sidebar — Click to open Left Sidebar (Alt+Shift+M)'
        : 'Dock to Firefox Left Sidebar (Alt+Shift+M)';
      let badgeEl = sBtn.querySelector('.pm-rail-playing-badge');
      if (anyAudioPlaying) {
        if (!badgeEl) {
          badgeEl = document.createElement('span');
          badgeEl.className = 'pm-rail-playing-badge';
          badgeEl.textContent = '▶';
          sBtn.style.position = 'relative';
          sBtn.appendChild(badgeEl);
        }
      } else if (badgeEl) {
        badgeEl.remove();
      }
    });

    if (!appsListEl) return;

    let draggedAppId = null;

    const handleAppReorderDrop = (sourceId, targetId) => {
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

      // Instant 0ms optimistic DOM update
      appSettings = { ...appSettings, mediaAppsOrder: uniqueOrder };
      renderOperaRail();
      if (mediaAppsDrawer && !mediaAppsDrawer.classList.contains('hidden')) {
        renderMediaAppsManager();
      }
      saveSettingsPatch({ mediaAppsOrder: uniqueOrder });
      showToast('Updated pinned app order');
    };

    const activeApps = mediaApi.getActiveMediaApps(appSettings);
    const orderSignature = activeApps.map((a) => a.id).join(',');

    const syncRailItemButtonState = (btn, app, isInitialCreate) => {
      const isActive = activeRailAppId === app.id;
      const isPlayingAudio = isAppPlayingAudioNow(app.id);
      const isAliveInPool =
        mediaFramePool.has(app.id) || pendingSidebarAudioTakeoverSet.has(app.id) || isPlayingAudio;
      const unreadInfo = socialAppUnreadMap.get(app.id);
      const unreadCount = unreadInfo?.unreadCount || 0;
      const hasUnread = Boolean(unreadInfo?.hasUnread || unreadCount > 0);

      btn.classList.toggle('active', isActive);
      btn.classList.toggle('is-playing-audio', isPlayingAudio);
      btn.style.setProperty('--rail-app-grad', app.gradient || app.color);
      btn.style.color = isActive ? '' : app.color || 'var(--text-primary)';
      btn.title = isPlayingAudio
        ? `▶ ${app.name} — Playing Audio | Click to switch, Drag to reorder, Right-click to stop & close`
        : isAliveInPool
        ? `${app.name}${unreadCount > 0 ? ` (${unreadCount} new)` : ''} | Active in background (Click to switch, Drag to reorder, Right-click to close)`
        : `${app.name} | Click to open (Drag to reorder)`;

      // Update notification badge IN-PLACE so it never flashes or re-runs entry animation during audio ticks or app switches!
      let unreadBadge = btn.querySelector('.pm-rail-social-badge');
      const prevCount = Number(btn.dataset.lastUnreadCount || 0);
      const hadUnread = btn.dataset.hadUnread === '1';
      if (hasUnread) {
        const nextBadgeText = unreadCount > 0 ? (unreadCount > 99 ? '99+' : String(unreadCount)) : '';
        if (!unreadBadge) {
          unreadBadge = document.createElement('span');
          unreadBadge.className = `pm-rail-social-badge ${unreadCount <= 0 ? 'dot-only' : ''} ${!isInitialCreate && !hadUnread ? 'is-badge-pop' : ''}`.trim();
          unreadBadge.textContent = nextBadgeText;
          btn.appendChild(unreadBadge);
        } else {
          unreadBadge.classList.toggle('dot-only', unreadCount <= 0);
          if (unreadBadge.textContent !== nextBadgeText) {
            unreadBadge.textContent = nextBadgeText;
          }
          if (unreadCount > prevCount) {
            unreadBadge.classList.remove('is-badge-pop');
            void unreadBadge.offsetWidth;
            unreadBadge.classList.add('is-badge-pop');
          }
        }
        btn.dataset.hadUnread = '1';
        btn.dataset.lastUnreadCount = String(unreadCount);
      } else {
        if (unreadBadge) {
          unreadBadge.remove();
        }
        btn.dataset.hadUnread = '0';
        btn.dataset.lastUnreadCount = '0';
      }

      // Update playing badge & live dot in-place
      let playingBadge = btn.querySelector('.pm-rail-playing-badge');
      let liveDot = btn.querySelector('.pm-rail-live-dot');
      if (isPlayingAudio) {
        if (liveDot) liveDot.remove();
        if (!playingBadge) {
          playingBadge = document.createElement('span');
          playingBadge.className = 'pm-rail-playing-badge';
          playingBadge.textContent = '▶';
          btn.appendChild(playingBadge);
        }
      } else {
        if (playingBadge) playingBadge.remove();
        if (isAliveInPool) {
          if (!liveDot) {
            liveDot = document.createElement('span');
            liveDot.className = 'pm-rail-live-dot';
            btn.appendChild(liveDot);
          }
        } else if (liveDot) {
          liveDot.remove();
        }
      }
    };

    if (appsListEl.dataset.renderedOrder === orderSignature && appsListEl.children.length === activeApps.length) {
      activeApps.forEach((app, idx) => {
        const existingBtn = appsListEl.children[idx];
        if (existingBtn) {
          syncRailItemButtonState(existingBtn, app, false);
        }
      });
      return;
    }

    appsListEl.dataset.renderedOrder = orderSignature;
    appsListEl.replaceChildren();

    activeApps.forEach((app) => {
      const btn = document.createElement('button');
      btn.className = 'pm-rail-item';
      btn.draggable = true;
      btn.dataset.appId = app.id;
      btn.appendChild(mediaApi.createAppSvgIcon(app.id, 17));
      syncRailItemButtonState(btn, app, true);

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
        if (draggedAppId && draggedAppId !== app.id && !btn.classList.contains('drag-over-target')) {
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
        if (mediaFramePool.has(app.id) || pendingSidebarAudioTakeoverSet.has(app.id)) {
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
      const isTikTokVideoItem = curPath.includes('/video/') || curPath.includes('/photo/');
      if ((!isTikTokVideoItem && curPath.startsWith('/@')) || curPath === '/profile' || curUrlObj.searchParams.has('pm_goto_profile')) {
        const profIdx = subViews.findIndex((sv) => sv && (sv.icon === 'profile' || sv.url.endsWith('/profile')));
        if (profIdx >= 0) return profIdx;
      }
      if (isTikTokVideoItem || curPath === '/' || curPath === '/foryou' || curPath.startsWith('/foryou/')) {
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
      if (curPath === '/reels' || curPath.startsWith('/reels/')) {
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
          !curPath.startsWith('/explore') &&
          !curPath.startsWith('/stories'))
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

  function showMediaBrandLoader(app, frameEl, isFastCachedRestore = false) {
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
      loaderTitleEl.textContent = isFastCachedRestore ? `Restoring ${app.name}…` : `Loading ${app.name}…`;
    }
    if (loaderSubEl) {
      loaderSubEl.textContent = isFastCachedRestore
        ? 'Instant persistent memory'
        : 'Connecting your local Firefox session';
    }
    if (targetFrame) {
      targetFrame.classList.add('is-loading');
    }

    clearTimeout(mediaLoaderSafetyTimer);
    mediaLoaderSafetyTimer = setTimeout(() => {
      hideMediaBrandLoader(targetFrame);
    }, isFastCachedRestore ? 520 : 1400);
  }

  function hideMediaBrandLoader(frameEl) {
    clearTimeout(mediaLoaderSafetyTimer);
    const loaderEl = document.getElementById('pm-media-loader');
    const targetFrame = frameEl || getActivePoolEntry()?.frame;
    loaderEl?.classList.add('hidden-loader');
    targetFrame?.classList.remove('is-loading');
  }

  const framePlaybackStates = new Map(); // appId -> { isPlaying, currentTime, resumeUrl, title, updatedAt }
  const pendingSidebarAudioTakeoverSet = new Set();
  const knownOpenPersistentIds = new Set();
  const sidebarMsePlayers = new Map(); // appId -> { ms, audioEl, sb, queue, objUrl }
  let currentAudibleBgAppId = null;
  let sidebarLifecyclePort = null;
  let sidebarInitCompleted = false;
  let lastDetectedAutoplayPolicy = 'allowed';
  let lastPersistentPlaybackSyncAt = 0;

  function isTransientAuthOrBootUrl(url) {
    if (!url || typeof url !== 'string') return true;
    if (url.includes('pm_boot=1')) return true;
    try {
      const u = new URL(url);
      const p = (u.pathname || '/').toLowerCase();
      const h = (u.hostname || '').toLowerCase();
      if (
        p === '/login' ||
        p.startsWith('/login/') ||
        p === '/signin' ||
        p.startsWith('/signin/') ||
        p.startsWith('/i/flow/login') ||
        p.startsWith('/accounts/login') ||
        h === 'accounts.google.com' ||
        h === 'accounts.spotify.com' ||
        (h.includes('tiktok.com') && (p.includes('/video/') || p.includes('/photo/')))
      ) {
        return true;
      }
    } catch (_) {
      return true;
    }
    return false;
  }

  function saveFastBootCache(overrideActiveId = '') {
    try {
      const savedUrls = {};
      Object.entries(appSettings.persistentSavedAppUrls || {}).forEach(([id, u]) => {
        if (u && !isTransientAuthOrBootUrl(u)) savedUrls[id] = u;
      });
      hibernatedAppUrls.forEach((u, id) => {
        if (u && !isTransientAuthOrBootUrl(u)) savedUrls[id] = u;
      });
      mediaFramePool.forEach((entry, id) => {
        const bestUrl =
          entry.currentUrl && !isTransientAuthOrBootUrl(entry.currentUrl)
            ? entry.currentUrl
            : entry.restoredUrl && !isTransientAuthOrBootUrl(entry.restoredUrl)
              ? entry.restoredUrl
              : '';
        if (bestUrl) savedUrls[id] = bestUrl;
        if (isAppPersistent(id)) knownOpenPersistentIds.add(id);
      });
      const openPersistentAppIds = Array.from(knownOpenPersistentIds).filter((id) => isAppPersistent(id));
      const effectiveActiveId = overrideActiveId || activeRailAppId || appSettings.persistentLastActiveAppId || 'pocketmail';
      window.localStorage.setItem(
        'pm_fast_boot_v1',
        JSON.stringify({
          activeAppId: effectiveActiveId,
          openPersistentAppIds,
          savedUrls,
          settings: {
            ...appSettings,
            persistentLastActiveAppId: effectiveActiveId,
            persistentOpenAppIds: openPersistentAppIds,
            persistentSavedAppUrls: savedUrls
          },
          ts: Date.now()
        })
      );
    } catch (_) {}
  }

  function cleanupSidebarMsePlayer(appId) {
    const player = sidebarMsePlayers.get(appId);
    if (!player) return;
    sidebarMsePlayers.delete(appId);
    try {
      player.audioEl.pause();
      player.audioEl.removeAttribute('src');
      player.audioEl.load();
      player.audioEl.remove();
    } catch (_) {}
    try {
      if (player.objUrl) URL.revokeObjectURL(player.objUrl);
    } catch (_) {}
  }

  function cleanupSidebarSpEmePlayer() {}

  function isAppPersistent(appId) {
    if (!appId || appId === 'pocketmail') return false;
    const mode = appSettings.persistenceMode || 'selected';
    if (mode === 'all') return true;
    if (mode === 'selected') {
      const list = Array.isArray(appSettings.persistentAppIds) ? appSettings.persistentAppIds : [];
      return list.includes(appId);
    }
    return false;
  }

  function isAppAllowedForBgAudio(appId) {
    if (!appId || appId === 'pocketmail') return false;
    if ((appSettings.persistenceMode || 'selected') === 'eco') return false;
    if (appSettings.keepAudioPlayingWhenClosed === false) return false;
    const allowedList = Array.isArray(appSettings.bgAudioAppIds)
      ? appSettings.bgAudioAppIds
      : ['spotify', 'youtube'];
    return allowedList.includes(appId);
  }

  function isPlayableYouTubeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const u = new URL(url);
      const h = u.hostname.toLowerCase();
      if (h.includes('music.youtube.com')) return true;
      if (!h.includes('youtube.com')) return true;
      const p = u.pathname || '/';
      return (
        p.startsWith('/watch') ||
        p.startsWith('/shorts') ||
        p.startsWith('/live') ||
        p.startsWith('/embed')
      );
    } catch (_) {
      return false;
    }
  }

  function syncPersistentSessionToBackground(appId, url, playback = null, explicitMailClick = false) {
    if (IS_POPOUT_VIEW) return;
    if ((appSettings.persistenceMode || 'selected') === 'eco') return;
    if (appId && isAppPersistent(appId)) {
      knownOpenPersistentIds.add(appId);
      if (url && !isTransientAuthOrBootUrl(url)) {
        hibernatedAppUrls.set(appId, url);
      }
    }
    if (activeRailAppId && activeRailAppId !== 'pocketmail' && isAppPersistent(activeRailAppId)) {
      appSettings.persistentLastActiveAppId = activeRailAppId;
    } else if (activeRailAppId === 'pocketmail' && explicitMailClick) {
      appSettings.persistentLastActiveAppId = 'pocketmail';
    }
    saveFastBootCache();
    if (!sidebarInitCompleted) return;
    const safePlayback =
      playback && appId && !isAppAllowedForBgAudio(appId)
        ? { ...playback, isPlaying: false }
        : playback;
    const payload = {
      type: 'UPDATE_PERSISTENT_SESSION',
      activeAppId: activeRailAppId,
      explicitMailClick: explicitMailClick || undefined,
      openPersistentAppIds: Array.from(knownOpenPersistentIds).filter((id) => isAppPersistent(id)),
      appId: appId || undefined,
      url: url || undefined,
      playback: safePlayback || undefined
    };
    if (sidebarLifecyclePort) {
      try {
        sidebarLifecyclePort.postMessage(payload);
        return;
      } catch (_) {}
    }
    browser.runtime.sendMessage(payload).catch(() => {});
  }

  function enforceMediaPoolMemoryCap(protectedAppId) {
    const effectiveCap = MAX_KEEPALIVE_FRAMES;

    while (mediaFramePool.size >= effectiveCap) {
      let oldestId = null;
      let oldestScore = Infinity;

      mediaFramePool.forEach((entry, id) => {
        if (id === protectedAppId || id === activeRailAppId) return;
        const st = framePlaybackStates.get(id);
        const isActivelyPlayingAudio =
          isAppAllowedForBgAudio(id) &&
          ((st && st.isPlaying) || pendingSidebarAudioTakeoverSet.has(id) || currentAudibleBgAppId === id);
        const persistBonus = isAppPersistent(id) ? 60000 : 0;
        const audioBonus = isActivelyPlayingAudio ? 600000 : 0;
        const score = (entry.lastUsedAt || 0) + persistBonus + audioBonus;
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
      if (!IS_POPOUT_VIEW && !sidebarLifecyclePort) {
        try {
          if (browser.runtime && typeof browser.runtime.connect === 'function') {
            sidebarLifecyclePort = browser.runtime.connect({ name: 'foxhub-sidebar-lifecycle' });
          }
        } catch (_) {}
      }
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
        autoResumeSentAt: 0,
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

      if ((app.id === 'spotify' || app.id === 'youtube') && !IS_POPOUT_VIEW) {
        // Only one player per app may exist: retire the hidden bg player and auto-resume here if music was playing
        const takeoverAppId = app.id;
        browser.runtime
          .sendMessage({ type: 'SIDEBAR_SP_TAKEOVER_BEGIN', appId: takeoverAppId })
          .then((res) => {
            if (res && res.resume) {
              pendingSidebarAudioTakeoverSet.add(takeoverAppId);
              if (entry.loaded && (!entry.autoResumeSentAt || Date.now() - entry.autoResumeSentAt > 4000)) {
                entry.autoResumeSentAt = Date.now();
                try {
                  iframe.contentWindow?.postMessage(
                    { target: 'pocketmail-media-frame', cmd: 'AUTO_RESUME_PLAYBACK' },
                    '*'
                  );
                } catch (_) {}
              }
            } else {
              pendingSidebarAudioTakeoverSet.delete(takeoverAppId);
            }
          })
          .catch(() => {});
      }
    } else if (entry) {
      entry.lastUsedAt = Date.now();
    }
    return entry;
  }

  function pauseOtherSidebarMediaFrames(activeAudioAppId) {
    mediaFramePool.forEach((entry, id) => {
      if (id === activeAudioAppId) {
        entry.suppressedWhileInactive = false;
        return;
      }
      entry.suppressedWhileInactive = true;
      cleanupSidebarMsePlayer(id);
      cleanupSidebarSpEmePlayer(id);
      pendingSidebarAudioTakeoverSet.delete(id);
      if (currentAudibleBgAppId === id) {
        currentAudibleBgAppId = null;
      }
      const st = framePlaybackStates.get(id);
      if (st && st.isPlaying) {
        st.isPlaying = false;
      }
      browser.runtime
        .sendMessage({ type: 'STOP_SINGLE_BG_AUDIO_APP', appId: id, clearPlaybackState: true })
        .catch(() => {});
      try {
        entry.frame.contentWindow?.postMessage(
          { target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' },
          '*'
        );
      } catch (_) {}
    });
  }

  function switchActiveMediaFrame(appId) {
    const isMediaApp = ['spotify', 'youtube', 'tiktok', 'twitch'].includes(appId) || isAppAllowedForBgAudio(appId);
    if (isMediaApp) {
      pauseOtherSidebarMediaFrames(appId);
    } else {
      // Switching to a non-media app (e.g. Discord, WhatsApp): pause any background frame not allowed for bg audio, or any frame that wasn't already playing when we switched away
      mediaFramePool.forEach((entry, id) => {
        if (id === appId) {
          entry.suppressedWhileInactive = false;
          return;
        }
        const st = framePlaybackStates.get(id);
        const wasAlreadyPlaying = Boolean(
          (st && st.isPlaying) || pendingSidebarAudioTakeoverSet.has(id) || currentAudibleBgAppId === id
        );
        if (!isAppAllowedForBgAudio(id) || !wasAlreadyPlaying) {
          entry.suppressedWhileInactive = true;
          if (st && st.isPlaying) st.isPlaying = false;
          try {
            entry.frame.contentWindow?.postMessage(
              { target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' },
              '*'
            );
          } catch (_) {}
        }
      });
    }
    mediaFramePool.forEach((entry, id) => {
      if (id === appId) {
        entry.suppressedWhileInactive = false;
      }
      entry.frame.classList.toggle('is-active', id === appId);
    });
  }

  function closeMediaAppFrame(appId) {
    const entry = mediaFramePool.get(appId);
    mediaFramePool.delete(appId);
    knownOpenPersistentIds.delete(appId);
    framePlaybackStates.delete(appId);
    pendingSidebarAudioTakeoverSet.delete(appId);
    if (currentAudibleBgAppId === appId) {
      currentAudibleBgAppId = null;
    }
    cleanupSidebarMsePlayer(appId);
    cleanupSidebarSpEmePlayer(appId);
    browser.runtime
      .sendMessage({ type: 'STOP_SINGLE_BG_AUDIO_APP', appId, clearPlaybackState: true })
      .catch(() => {});
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
    saveFastBootCache();
    renderOperaRail();
  }

  function hideMediaWorkspaceKeepAlive() {
    if (!mediaWorkspace) return;
    // Pause any frame in the pool that is not configured for background audio or wasn't already playing
    mediaFramePool.forEach((entry, id) => {
      const st = framePlaybackStates.get(id);
      const wasAlreadyPlaying = Boolean(
        (st && st.isPlaying) || pendingSidebarAudioTakeoverSet.has(id) || currentAudibleBgAppId === id
      );
      if (!isAppAllowedForBgAudio(id) || !wasAlreadyPlaying) {
        entry.suppressedWhileInactive = true;
        if (st && st.isPlaying) st.isPlaying = false;
        try {
          entry.frame.contentWindow?.postMessage(
            { target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' },
            '*'
          );
        } catch (_) {}
      }
    });
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
    if (app.id === 'spotify') {
      browser.runtime.sendMessage({ type: 'PREINIT_BG_SP_PLAYER', appId: 'spotify' }).catch(() => {});
    }

    const entry = getOrCreateMediaFrame(app);
    if (!entry) return;

    const validCurrentUrl =
      entry.currentUrl && !isTransientAuthOrBootUrl(entry.currentUrl) ? entry.currentUrl : '';
    const validRestoredUrl =
      entry.restoredUrl && !isTransientAuthOrBootUrl(entry.restoredUrl) ? entry.restoredUrl : '';
    const rawTargetUrl = customUrl || validCurrentUrl || validRestoredUrl || app.defaultUrl;
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
    maybeShowPersistentMemoryHint();

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

    const normCurUrl = (entry.currentUrl || '').replace(/\/+$/, '');
    const normTargetUrl = (targetUrl || '').replace(/\/+$/, '');
    const isAlreadyNavigatingSameUrl =
      Boolean(entry.hasNavigated && normCurUrl && normCurUrl === normTargetUrl) && !subViewMeta;

    if (isAlreadyNavigatingSameUrl) {
      if (entry.loaded) {
        hideMediaBrandLoader(entry.frame);
        broadcastSocialAppTheme();
      }
      return;
    }

    if (!isWarmAndNavigated || Boolean(customUrl)) {
      if (isWarmAndNavigated && app.id === 'tiktok') {
        // Free active video decoders & MSE buffers before switching between TikTok video feed and Messages
        sendCommandToMediaFrame('FREE_HEAVY_MEDIA');
      }
      const isFastCachedRestore = Boolean(
        !isWarmAndNavigated && isAppPersistent(app.id) && (entry.restoredUrl || hibernatedAppUrls.has(app.id))
      );
      entry.loaded = false;
      entry.hasNavigated = true;
      entry.currentUrl = rawTargetUrl;
      entry.pendingSpaUrl = '';
      entry.pendingSpaUntil = 0;
      entry.lastNavAt = Date.now();
      showMediaBrandLoader(app, entry.frame, isFastCachedRestore);
      // Bypass & unregister any pre-existing Service Worker (sw.js / serviceworker.js) once per profile on X and WhatsApp
      // so cached X-Frame-Options: DENY / CSP frame-ancestors 'none' in Service Worker CacheStorage never blocks embedding,
      // while avoiding re-running robots.txt?pm_boot=1 on subsequent popup reopens!
      const swStorageKey = `pm_sw_cleaned_v1_${app.id}`;
      let alreadyCleanedInProfile = Boolean(entry.swCleaned);
      if (!alreadyCleanedInProfile) {
        try {
          alreadyCleanedInProfile = window.localStorage.getItem(swStorageKey) === '1';
        } catch (_) {}
      }
      const needsSwBootClean = !alreadyCleanedInProfile && (app.id === 'x' || app.id === 'whatsapp');
      if (needsSwBootClean) {
        entry.swCleaned = true;
        try {
          window.localStorage.setItem(swStorageKey, '1');
        } catch (_) {}
        try {
          const origin = new URL(targetUrl).origin;
          entry.frame.src = `${origin}/robots.txt?pm_boot=1&pm_target=${encodeURIComponent(targetUrl)}`;
        } catch (_) {
          entry.frame.src = targetUrl;
        }
      } else {
        entry.swCleaned = true;
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

  let hasShownPersistHintThisSession = false;
  function maybeShowPersistentMemoryHint() {
    if (hasShownPersistHintThisSession) return;
    const mode = appSettings.persistenceMode || 'selected';
    const picked = Array.isArray(appSettings.persistentAppIds) ? appSettings.persistentAppIds : [];
    if (mode === 'all' || picked.length > 0) return;

    const shownCount = Number(appSettings.persistentMemoryHintCount) || 0;
    if (shownCount >= 2) return;

    hasShownPersistHintThisSession = true;
    const nextCount = shownCount + 1;
    appSettings.persistentMemoryHintCount = nextCount;
    saveSettingsPatch({ persistentMemoryHintCount: nextCount });

    setTimeout(() => {
      showToast('Tip: Persistent Memory is off by default — you can enable it per app in the + Hub anytime.');
    }, 1600);
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
    const pMode = appSettings.persistenceMode || 'selected';
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
      const iconKey = pMode === 'eco' ? 'bolt' : pMode === 'selected' ? 'music' : 'rocket';
      const noteSvg = mediaApi.createSubViewIcon(iconKey, 14);
      noteSvg.style.cssText = 'flex-shrink:0;margin-top:1px;color:var(--accent);';
      const textWrap = document.createElement('div');
      const strongEl = document.createElement('strong');
      const descSpan = document.createElement('span');
      if (pMode === 'eco') {
        strongEl.textContent = 'Resource Impact (Eco Mode): ';
        descSpan.textContent =
          'Uses 0 MB extra RAM and zero CPU/GPU when closed. Closing the sidebar unloads apps and resets to Mail Inbox.';
      } else if (pMode === 'selected') {
        strongEl.textContent = 'Resource Impact (Selected Apps): ';
        descSpan.textContent =
          'Keeps only your chosen apps below in persistent memory & background audio when closed so music keeps playing while you work in full screen, and restores your exact page & scroll position on reopen.';
      } else {
        strongEl.textContent = 'Resource Impact (All Apps Persistent): ';
        descSpan.textContent =
          'Keeps all opened apps in persistent memory & background audio across sidebar close/reopen. Highest RAM, CPU, and GPU usage.';
      }
      textWrap.appendChild(strongEl);
      textWrap.appendChild(descSpan);
      resNoteEl.appendChild(noteSvg);
      resNoteEl.appendChild(textWrap);
    }

    const pickerWrap = document.getElementById('pm-persistent-apps-picker-wrap');
    const pickerEl = document.getElementById('pm-persistent-apps-picker');
    if (pickerWrap && pickerEl) {
      pickerWrap.classList.toggle('hidden', pMode !== 'selected');
      pickerEl.replaceChildren();
      const pickedIds = Array.isArray(appSettings.persistentAppIds)
        ? appSettings.persistentAppIds
        : [];
      const allApps = [
        ...(mediaApi.getOrderedBuiltInApps ? mediaApi.getOrderedBuiltInApps(appSettings) : mediaApi.BUILTIN_MEDIA_APPS),
        ...(Array.isArray(appSettings.customMediaApps) ? appSettings.customMediaApps : [])
      ];
      allApps.forEach((app) => {
        const isPicked = pickedIds.includes(app.id);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `pm-bgaudio-app-card ${isPicked ? 'is-active' : ''}`;
        const leftWrap = document.createElement('span');
        leftWrap.className = 'pm-bgaudio-app-left';
        const iconBadge = document.createElement('span');
        iconBadge.className = 'pm-bgaudio-app-icon';
        iconBadge.style.background = app.gradient || app.color || 'var(--accent)';
        iconBadge.appendChild(mediaApi.createAppSvgIcon(app.id, 12));
        const lbl = document.createElement('span');
        lbl.className = 'pm-bgaudio-app-name';
        lbl.textContent = app.name;
        leftWrap.appendChild(iconBadge);
        leftWrap.appendChild(lbl);

        const statusBadge = document.createElement('span');
        statusBadge.className = 'pm-bgaudio-status-badge';
        if (isPicked) {
          statusBadge.appendChild(mediaApi.createSubViewIcon('check', 10));
        }
        const statusTxt = document.createElement('span');
        statusTxt.textContent = isPicked ? 'ON' : 'OFF';
        statusBadge.appendChild(statusTxt);

        chip.appendChild(leftWrap);
        chip.appendChild(statusBadge);
        chip.addEventListener('click', async () => {
          const nextPicked = isPicked ? pickedIds.filter((id) => id !== app.id) : [...pickedIds, app.id];
          await saveSettingsPatch({ persistentAppIds: nextPicked });
          renderMediaAppsManager();
          showToast(isPicked ? `Removed ${app.name} from persistent memory` : `${app.name} set to persistent memory!`);
        });
        pickerEl.appendChild(chip);
      });
    }

    const bgAudioPickerWrap = document.getElementById('pm-bgaudio-apps-picker-wrap');
    const bgAudioPickerEl = document.getElementById('pm-bgaudio-apps-picker');
    const pickedBgAudioIds = Array.isArray(appSettings.bgAudioAppIds)
      ? appSettings.bgAudioAppIds
      : ['spotify', 'youtube'];
    if (bgAudioPickerWrap && bgAudioPickerEl) {
      const showBgAudioPicker = pMode !== 'eco' && appSettings.keepAudioPlayingWhenClosed !== false;
      bgAudioPickerWrap.classList.toggle('hidden', !showBgAudioPicker);
      bgAudioPickerEl.replaceChildren();
      const allAppsForBg = [
        ...(mediaApi.getOrderedBuiltInApps ? mediaApi.getOrderedBuiltInApps(appSettings) : mediaApi.BUILTIN_MEDIA_APPS),
        ...(Array.isArray(appSettings.customMediaApps) ? appSettings.customMediaApps : [])
      ];
      allAppsForBg.forEach((app) => {
        const isAllowed = pickedBgAudioIds.includes(app.id);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `pm-bgaudio-app-card ${isAllowed ? 'is-bgaudio-on' : ''}`;
        const leftWrap = document.createElement('span');
        leftWrap.className = 'pm-bgaudio-app-left';
        const iconBadge = document.createElement('span');
        iconBadge.className = 'pm-bgaudio-app-icon';
        iconBadge.style.background = app.gradient || app.color || 'var(--accent)';
        iconBadge.appendChild(mediaApi.createAppSvgIcon(app.id, 12));
        const lbl = document.createElement('span');
        lbl.className = 'pm-bgaudio-app-name';
        lbl.textContent = app.name;
        leftWrap.appendChild(iconBadge);
        leftWrap.appendChild(lbl);

        const statusBadge = document.createElement('span');
        statusBadge.className = 'pm-bgaudio-status-badge';
        statusBadge.appendChild(mediaApi.createSubViewIcon(isAllowed ? 'speaker-play' : 'speaker-mute', 11));
        const statusTxt = document.createElement('span');
        statusTxt.textContent = isAllowed ? 'ON' : 'OFF';
        statusBadge.appendChild(statusTxt);

        chip.appendChild(leftWrap);
        chip.appendChild(statusBadge);
        chip.addEventListener('click', async () => {
          const nextBgAudioIds = isAllowed
            ? pickedBgAudioIds.filter((id) => id !== app.id)
            : [...pickedBgAudioIds, app.id];
          await saveSettingsPatch({ bgAudioAppIds: nextBgAudioIds });
          renderMediaAppsManager();
          showToast(
            isAllowed
              ? `${app.name}: Background audio when closed turned OFF`
              : `${app.name}: Background audio when closed turned ON`
          );
        });
        bgAudioPickerEl.appendChild(chip);
      });
    }

    const spAutoplayTipEl = document.getElementById('pm-spotify-bg-autoplay-tip');
    if (spAutoplayTipEl) {
      const pickedIdsForTip = Array.isArray(appSettings.persistentAppIds)
        ? appSettings.persistentAppIds
        : [];
      const isSpotifyPersistent = pMode === 'all' || (pMode === 'selected' && pickedIdsForTip.includes('spotify'));
      const showSpTip =
        pMode !== 'eco' &&
        appSettings.keepAudioPlayingWhenClosed !== false &&
        isSpotifyPersistent &&
        pickedBgAudioIds.includes('spotify');
      spAutoplayTipEl.classList.toggle('hidden', !showSpTip);
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
    const reorderAppsInManager = (sourceId, targetId) => {
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

      // Instant 0ms optimistic DOM update
      appSettings = { ...appSettings, mediaAppsOrder: uniqueOrder };
      renderMediaAppsManager();
      renderOperaRail();
      saveSettingsPatch({ mediaAppsOrder: uniqueOrder });
      showToast('Updated pinned app order');
    };

    const gridEl = document.getElementById('pm-media-apps-toggle-grid');
    if (gridEl) {
      gridEl.replaceChildren();
      const orderedBuiltIns = mediaApi.getOrderedBuiltInApps
        ? mediaApi.getOrderedBuiltInApps(appSettings)
        : mediaApi.BUILTIN_MEDIA_APPS;
      const customAppItems = (Array.isArray(appSettings.customMediaApps) ? appSettings.customMediaApps : []).map(
        (c, idx) => ({
          ...c,
          id: c.id || `custom-${idx}`,
          color: c.color || '#4E82EE',
          isCustom: true,
          customIdx: idx
        })
      );
      const allGridApps = [...orderedBuiltIns, ...customAppItems];

      allGridApps.forEach((app) => {
        const isEnabled = app.isCustom ? app.enabled !== false : enabledIds.includes(app.id);
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
          if (draggedGridAppId && draggedGridAppId !== app.id && !card.classList.contains('drag-over-target')) {
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

        const isBgAudioAllowed = pickedBgAudioIds.includes(app.id);
        const bgAudioBtn = document.createElement('button');
        bgAudioBtn.type = 'button';
        bgAudioBtn.className = `pm-btn-xs ${isBgAudioAllowed ? 'pm-btn-primary' : 'pm-btn-secondary'}`;
        bgAudioBtn.style.cssText = isBgAudioAllowed
          ? 'background:#1db954;border-color:#1db954;color:#fff;padding:2px 7px;font-size:10.5px;display:inline-flex;align-items:center;gap:4px;'
          : 'opacity:0.75;padding:2px 7px;font-size:10.5px;display:inline-flex;align-items:center;gap:4px;';
        bgAudioBtn.appendChild(mediaApi.createSubViewIcon(isBgAudioAllowed ? 'speaker-play' : 'speaker-mute', 11));
        const bgBtnTxt = document.createElement('span');
        bgBtnTxt.textContent = isBgAudioAllowed ? 'Bg Audio: ON' : 'Bg Audio: OFF';
        bgAudioBtn.appendChild(bgBtnTxt);
        bgAudioBtn.title = isBgAudioAllowed
          ? `${app.name} is allowed to keep playing audio when the extension is closed (Click to turn OFF)`
          : `${app.name} will NOT play audio when the extension is closed (Click to turn ON)`;
        bgAudioBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const nextBgAudioIds = isBgAudioAllowed
            ? pickedBgAudioIds.filter((id) => id !== app.id)
            : [...pickedBgAudioIds, app.id];
          await saveSettingsPatch({ bgAudioAppIds: nextBgAudioIds });
          renderMediaAppsManager();
          showToast(
            isBgAudioAllowed
              ? `${app.name}: Background audio when closed turned OFF`
              : `${app.name}: Background audio when closed turned ON`
          );
        });

        const statusBtn = document.createElement('button');
        statusBtn.className = `pm-btn-xs ${isEnabled ? 'pm-btn-primary' : 'pm-btn-secondary'}`;
        statusBtn.textContent = isEnabled ? 'Pinned' : 'Hidden';

        const rightBtnsWrap = document.createElement('div');
        rightBtnsWrap.style.cssText = 'display:inline-flex;align-items:center;gap:5px;';
        rightBtnsWrap.appendChild(bgAudioBtn);
        rightBtnsWrap.appendChild(statusBtn);

        topRow.appendChild(info);
        topRow.appendChild(rightBtnsWrap);

        topRow.addEventListener('click', async () => {
          if (app.isCustom) {
            const customs = Array.isArray(appSettings.customMediaApps) ? [...appSettings.customMediaApps] : [];
            if (customs[app.customIdx]) {
              customs[app.customIdx] = { ...customs[app.customIdx], enabled: !isEnabled };
              await saveSettingsPatch({ customMediaApps: customs });
            }
          } else {
            const nextIds = isEnabled
              ? enabledIds.filter((id) => id !== app.id)
              : [...enabledIds, app.id];
            await saveSettingsPatch({ enabledMediaApps: nextIds });
          }
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
          saveSettingsPatch({ socialAppSoundMap: nextMap });
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
        muteBtn.addEventListener('click', () => {
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
          saveSettingsPatch({ socialAppSoundMap: nextMap });
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
          if (draggedGridAppId && draggedGridAppId !== appId && !row.classList.contains('drag-over-target')) {
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
        delBtn.addEventListener('click', () => {
          const nextCustoms = customs.filter((_, i) => i !== idx);
          saveSettingsPatch({ customMediaApps: nextCustoms });
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
      syncPersistentSessionToBackground('pocketmail', '', null, true);
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
      renderMediaAppsManager();
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
          if (
            pendingSidebarAudioTakeoverSet.has(sourceEntry.appId) &&
            (!sourceEntry.autoResumeSentAt || Date.now() - sourceEntry.autoResumeSentAt > 4000)
          ) {
            sourceEntry.autoResumeSentAt = Date.now();
            try {
              sourceEntry.frame.contentWindow?.postMessage(
                { target: 'pocketmail-media-frame', cmd: 'AUTO_RESUME_PLAYBACK' },
                '*'
              );
            } catch (_) {}
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
          if (
            pendingSidebarAudioTakeoverSet.has(sourceEntry.appId) &&
            (!sourceEntry.autoResumeSentAt || Date.now() - sourceEntry.autoResumeSentAt > 4000)
          ) {
            sourceEntry.autoResumeSentAt = Date.now();
            try {
              sourceEntry.frame.contentWindow?.postMessage(
                { target: 'pocketmail-media-frame', cmd: 'AUTO_RESUME_PLAYBACK' },
                '*'
              );
            } catch (_) {}
          }
        } else {
          hideMediaBrandLoader();
        }
        broadcastSocialAppTheme();
      } else if (data.type === 'PM_SIDEBAR_TOOK_OVER_AUDIO') {
        const appId =
          sourceEntry?.appId ||
          (typeof data.flatFrameName === 'string' && data.flatFrameName.startsWith('pm-media-frame-')
            ? data.flatFrameName.replace('pm-media-frame-', '')
            : '');
        if (appId) {
          pendingSidebarAudioTakeoverSet.delete(appId);
          cleanupSidebarMsePlayer(appId);
          cleanupSidebarSpEmePlayer(appId);
          browser.runtime.sendMessage({ type: 'STOP_SINGLE_BG_AUDIO_APP', appId }).catch(() => {});
          renderOperaRail();
        }
      } else if (data.type === 'PM_SP_SIDEBAR_PLAYPAUSE_CLICK') {
        const appId =
          sourceEntry?.appId ||
          (typeof data.flatFrameName === 'string' && data.flatFrameName.startsWith('pm-media-frame-')
            ? data.flatFrameName.replace('pm-media-frame-', '')
            : 'spotify');
        browser.runtime
          .sendMessage({ type: 'PM_SP_SIDEBAR_PLAYPAUSE_CLICK', appId, aria: data.aria || '' })
          .catch(() => {});
      } else if (data.type === 'PM_SP_EME_BRIDGE') {
        const appId =
          sourceEntry?.appId ||
          (typeof data.flatFrameName === 'string' && data.flatFrameName.startsWith('pm-media-frame-')
            ? data.flatFrameName.replace('pm-media-frame-', '')
            : '');
        if (appId) {
          // Only forward to background.html if media-frame-optimizer's direct emeBridgePort didn't already deliver it!
          if (!data.alreadyRoutedToBg) {
            try {
              const bgWin =
                browser.extension && typeof browser.extension.getBackgroundPage === 'function'
                  ? browser.extension.getBackgroundPage()
                  : null;
              if (bgWin && typeof bgWin.__pmHandleSpEmeBridge === 'function') {
                bgWin.__pmHandleSpEmeBridge(appId, data, 'sidebar');
              } else if (sidebarLifecyclePort) {
                sidebarLifecyclePort.postMessage({ type: 'FORWARD_SP_EME_BRIDGE', appId, data });
              }
            } catch (_) {
              if (sidebarLifecyclePort) {
                try {
                  sidebarLifecyclePort.postMessage({ type: 'FORWARD_SP_EME_BRIDGE', appId, data });
                } catch (__) {}
              }
            }
          }

          if (data.bridgeType === 'STOP_PLAYBACK') {
            pendingSidebarAudioTakeoverSet.delete(appId);
            const prevPb = framePlaybackStates.get(appId);
            const nextUrl =
              (data.href && !data.href.includes('pm_boot=1') ? data.href : '') ||
              sourceEntry?.currentUrl ||
              prevPb?.resumeUrl ||
              '';
            if (sourceEntry && nextUrl) {
              sourceEntry.currentUrl = nextUrl;
            }
            const pb = {
              isPlaying: false,
              currentTime: 0,
              resumeUrl: nextUrl,
              title: prevPb?.title || '',
              updatedAt: Date.now()
            };
            framePlaybackStates.set(appId, pb);
            if (currentAudibleBgAppId === appId) {
              currentAudibleBgAppId = null;
            }
            renderOperaRail();
            syncPersistentSessionToBackground(appId, nextUrl, pb);
          } else if (data.bridgeType === 'SYNC_TIME') {
            const targetEntry = sourceEntry || mediaFramePool.get(appId);
            const isSuppressedInactive =
              appId !== activeRailAppId &&
              Boolean(targetEntry?.suppressedWhileInactive || !isAppAllowedForBgAudio(appId));
            if (isSuppressedInactive && !data.paused) {
              try {
                targetEntry?.frame?.contentWindow?.postMessage(
                  { target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' },
                  '*'
                );
              } catch (_) {}
              browser.runtime
                .sendMessage({ type: 'STOP_SINGLE_BG_AUDIO_APP', appId, clearPlaybackState: true })
                .catch(() => {});
              return;
            }
            const isNonPlayableYt =
              appId === 'youtube' &&
              (data.href || sourceEntry?.currentUrl) &&
              !isPlayableYouTubeUrl(data.href || sourceEntry?.currentUrl);
            if (!data.paused && !isNonPlayableYt) {
              pendingSidebarAudioTakeoverSet.delete(appId);
              const prevPb = framePlaybackStates.get(appId);
              const prevWasPlaying = Boolean(prevPb?.isPlaying);
              const prevAudible = currentAudibleBgAppId;
              const liveSec = Math.floor(Number(data.currentTime) || 0);
              let nextResumeUrl =
                (data.href && !data.href.includes('pm_boot=1') ? data.href : '') ||
                sourceEntry?.currentUrl ||
                prevPb?.resumeUrl ||
                (appId === 'youtube' ? 'https://www.youtube.com/' : 'https://open.spotify.com/');
              if (appId === 'youtube' && nextResumeUrl) {
                try {
                  const u = new URL(nextResumeUrl);
                  if (u.pathname.startsWith('/watch') && liveSec >= 1) {
                    u.searchParams.set('t', `${liveSec}s`);
                    nextResumeUrl = u.href;
                  }
                } catch (_) {}
              }
              if (sourceEntry && nextResumeUrl) {
                sourceEntry.currentUrl = nextResumeUrl;
              }
              const pb = {
                isPlaying: true,
                currentTime: liveSec,
                resumeUrl: nextResumeUrl,
                title: prevPb?.title || (appId === 'youtube' ? 'YouTube' : 'Spotify'),
                updatedAt: Date.now()
              };
              framePlaybackStates.set(appId, pb);
              if (currentAudibleBgAppId !== appId) {
                currentAudibleBgAppId = appId;
              }
              if (!prevWasPlaying || prevAudible !== currentAudibleBgAppId) {
                renderOperaRail();
              }
              if (
                !prevWasPlaying ||
                pb.resumeUrl !== prevPb?.resumeUrl ||
                Date.now() - lastPersistentPlaybackSyncAt > 4000
              ) {
                lastPersistentPlaybackSyncAt = Date.now();
                syncPersistentSessionToBackground(appId, pb.resumeUrl, pb);
              }
            } else {
              // Ignore passive paused ticks while background takeover is still in progress unless explicitly paused or on a non-playable YT route
              if (pendingSidebarAudioTakeoverSet.has(appId) && !data.explicitPause && !isNonPlayableYt) {
                return;
              }
              pendingSidebarAudioTakeoverSet.delete(appId);
              const prevPb = framePlaybackStates.get(appId);
              const prevWasPlaying = Boolean(prevPb?.isPlaying);
              const prevAudible = currentAudibleBgAppId;
              const nextUrl =
                (data.href && !data.href.includes('pm_boot=1') ? data.href : '') ||
                sourceEntry?.currentUrl ||
                prevPb?.resumeUrl ||
                '';
              const pb = {
                isPlaying: false,
                currentTime: Math.floor(Number(data.currentTime) || prevPb?.currentTime || 0),
                resumeUrl: nextUrl,
                title: prevPb?.title || '',
                updatedAt: Date.now()
              };
              framePlaybackStates.set(appId, pb);
              if (currentAudibleBgAppId === appId) {
                currentAudibleBgAppId = null;
              }
              if (prevWasPlaying || prevAudible !== currentAudibleBgAppId) {
                renderOperaRail();
                syncPersistentSessionToBackground(appId, nextUrl, pb);
              }
            }
          }
        }
      } else if (data.type === 'PM_BG_AUDIO_CHUNK' && data.chunk) {
        const appId =
          sourceEntry?.appId ||
          (typeof data.flatFrameName === 'string' && data.flatFrameName.startsWith('pm-media-frame-')
            ? data.flatFrameName.replace('pm-media-frame-', '')
            : '');
        if (appId) {
          const targetEntry = sourceEntry || mediaFramePool.get(appId);
          if (appId !== activeRailAppId && (targetEntry?.suppressedWhileInactive || !isAppAllowedForBgAudio(appId))) {
            cleanupSidebarMsePlayer(appId);
            try {
              targetEntry?.frame?.contentWindow?.postMessage(
                { target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' },
                '*'
              );
            } catch (_) {}
            return;
          }
          if (pendingSidebarAudioTakeoverSet.has(appId)) {
            pendingSidebarAudioTakeoverSet.delete(appId);
            browser.runtime.sendMessage({ type: 'STOP_SINGLE_BG_AUDIO_APP', appId }).catch(() => {});
          }
          let player = sidebarMsePlayers.get(appId);
          if (!player) {
            const ms = new MediaSource();
            const objUrl = URL.createObjectURL(ms);
            const audioEl = document.createElement('audio');
            audioEl.autoplay = true;
            audioEl.muted = false;
            audioEl.volume = 1.0;
            audioEl.src = objUrl;
            document.body.appendChild(audioEl);
            player = { ms, audioEl, sb: null, queue: [], objUrl };
            sidebarMsePlayers.set(appId, player);

            ms.addEventListener('sourceopen', () => {
              try {
                player.sb = ms.addSourceBuffer('audio/webm;codecs=opus');
                player.sb.addEventListener('updateend', () => {
                  try {
                    if (player.audioEl.currentTime > 35 && !player.sb.updating && player.sb.buffered.length > 0) {
                      const start = player.sb.buffered.start(0);
                      if (player.audioEl.currentTime - start > 25) {
                        player.sb.remove(start, player.audioEl.currentTime - 15);
                        return;
                      }
                    }
                    if (player.queue.length > 0 && !player.sb.updating) {
                      player.sb.appendBuffer(player.queue.shift());
                    }
                    if (player.audioEl.paused) {
                      player.audioEl.play().catch(() => {});
                    }
                  } catch (_) {}
                });
                if (player.queue.length > 0 && !player.sb.updating) {
                  player.sb.appendBuffer(player.queue.shift());
                }
              } catch (_) {}
            });
          }

          if (player.sb && !player.sb.updating && player.queue.length === 0) {
            try {
              player.sb.appendBuffer(data.chunk);
            } catch (_) {}
          } else if (player.queue.length < 40) {
            player.queue.push(data.chunk);
          }
        }
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
          const prevPb = framePlaybackStates.get(sourceEntry.appId);
          if (sourceEntry.appId === 'youtube' && !isPlayableYouTubeUrl(data.url)) {
            pendingSidebarAudioTakeoverSet.delete('youtube');
            if (currentAudibleBgAppId === 'youtube') {
              currentAudibleBgAppId = null;
            }
            const stoppedPb = {
              isPlaying: false,
              currentTime: 0,
              resumeUrl: data.url,
              title: data.title || prevPb?.title || 'YouTube',
              updatedAt: Date.now()
            };
            framePlaybackStates.set('youtube', stoppedPb);
            renderOperaRail();
            syncPersistentSessionToBackground('youtube', data.url, stoppedPb);
          } else {
            if (prevPb) {
              prevPb.resumeUrl = data.url;
              if (data.title) prevPb.title = data.title;
            }
            syncPersistentSessionToBackground(sourceEntry.appId, data.url, prevPb || null);
          }
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
        if (typeof data.initialAutoplayPolicy === 'string') {
          lastDetectedAutoplayPolicy = data.initialAutoplayPolicy;
        }
        const appId =
          sourceEntry?.appId ||
          (typeof data.flatFrameName === 'string' && data.flatFrameName.startsWith('pm-media-frame-')
            ? data.flatFrameName.replace('pm-media-frame-', '')
            : '');
        if (appId) {
          const targetEntry = sourceEntry || mediaFramePool.get(appId);
          const candidateUrl = data.resumeUrl || targetEntry?.currentUrl || '';
          const isNonPlayableYt = appId === 'youtube' && candidateUrl && !isPlayableYouTubeUrl(candidateUrl);
          const isDisallowedInactiveFrame =
            appId !== activeRailAppId &&
            Boolean(targetEntry?.suppressedWhileInactive || !isAppAllowedForBgAudio(appId));
          if (isDisallowedInactiveFrame && data.isPlaying) {
            cleanupSidebarMsePlayer(appId);
            if (currentAudibleBgAppId === appId) {
              currentAudibleBgAppId = null;
            }
            try {
              targetEntry?.frame?.contentWindow?.postMessage(
                { target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' },
                '*'
              );
            } catch (_) {}
            browser.runtime
              .sendMessage({ type: 'STOP_SINGLE_BG_AUDIO_APP', appId, clearPlaybackState: true })
              .catch(() => {});
          }
          const effectivePlaying = isNonPlayableYt || isDisallowedInactiveFrame ? false : Boolean(data.isPlaying);
          if (isNonPlayableYt) {
            pendingSidebarAudioTakeoverSet.delete('youtube');
            if (currentAudibleBgAppId === 'youtube') {
              currentAudibleBgAppId = null;
            }
          }
          if (effectivePlaying) {
            pauseOtherSidebarMediaFrames(appId);
            if (pendingSidebarAudioTakeoverSet.size > 0) {
              Array.from(pendingSidebarAudioTakeoverSet).forEach((otherId) => {
                if (otherId !== appId) {
                  pendingSidebarAudioTakeoverSet.delete(otherId);
                  browser.runtime
                    .sendMessage({ type: 'STOP_SINGLE_BG_AUDIO_APP', appId: otherId, clearPlaybackState: true })
                    .catch(() => {});
                }
              });
            }
          }
          const prevIsPlaying = Boolean(framePlaybackStates.get(appId)?.isPlaying);
          const isTakeoverOrMse =
            !isNonPlayableYt && (sidebarMsePlayers.has(appId) || pendingSidebarAudioTakeoverSet.has(appId));
          if (!effectivePlaying && !isTakeoverOrMse && currentAudibleBgAppId === appId) {
            currentAudibleBgAppId = null;
          }
          const pb = {
            isPlaying: Boolean(effectivePlaying || isTakeoverOrMse),
            currentTime: isNonPlayableYt ? 0 : Number(data.currentTime) || 0,
            resumeUrl: candidateUrl,
            title: data.title || '',
            updatedAt: Date.now()
          };
          framePlaybackStates.set(appId, pb);
          if (prevIsPlaying !== pb.isPlaying || isNonPlayableYt) {
            renderOperaRail();
          }
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
      } else if (data.type === 'PM_GMAIL_AUTOSEND_RESULT') {
        if (typeof pendingGmailAutoSendResolver === 'function') {
          pendingGmailAutoSendResolver({
            ok: Boolean(data.ok),
            reason: data.reason || '',
            method: data.method || 'first-party-gmail-composer'
          });
        } else if (data.ok && composeDrawer && !composeDrawer.classList.contains('hidden')) {
          // User clicked Send manually inside the Embedded "Gmail UI" tab
          const fromSelect = document.getElementById('compose-from');
          const selectedOpt = fromSelect?.options?.[fromSelect.selectedIndex];
          const slot = parseInt(fromSelect?.value || '0', 10) || 0;
          const accountEmail = selectedOpt?.getAttribute('data-email') || '';
          const to = (document.getElementById('compose-to')?.value || '').trim();
          const cc = (document.getElementById('compose-cc')?.value || '').trim();
          const bcc = (document.getElementById('compose-bcc')?.value || '').trim();
          const su = (document.getElementById('compose-subject')?.value || '').trim();
          const body = (document.getElementById('compose-body')?.value || '').trim();
          browser.runtime
            .sendMessage({
              type: 'RECORD_SENT_EMAIL',
              payload: { slotIndex: slot, accountEmail, to: to || 'Recipient', cc, bcc, subject: su, body }
            })
            .then((res) => {
              if (res && res.state) {
                appState = res.state;
                renderAll();
              }
            })
            .catch(() => {});
          composeDrawer.classList.add('hidden');
          showToast(`✓ Email sent via Gmail${to ? ` to ${to}` : ''}!`);
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

    const copyReaderSelectionOrBody = async () => {
      const selText = (window.getSelection && window.getSelection().toString().trim()) || lastHighlightedMailText || '';
      if (selText && navigator.clipboard) {
        await navigator.clipboard.writeText(selText);
        showToast(`Copied selection: "${selText.slice(0, 36)}${selText.length > 36 ? '…' : ''}"`);
        document.getElementById('pm-selection-copy-pill')?.classList.add('hidden');
        lastHighlightedMailText = '';
        return;
      }
      if (!activeReaderMessage) return;
      const renderedBodyText = (document.getElementById('reader-body')?.innerText || '').trim();
      const bodyContent = renderedBodyText || activeReaderMessage.fullText || activeReaderMessage.snippet || '';
      const text = `${activeReaderMessage.subject}\nFrom: ${activeReaderMessage.senderName} <${activeReaderMessage.senderEmail}>\n\n${bodyContent}`;
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        showToast('Copied full email text to clipboard!');
      }
    };

    document.getElementById('btn-reader-copy-text')?.addEventListener('click', copyReaderSelectionOrBody);
    document.getElementById('btn-reader-header-copy')?.addEventListener('click', copyReaderSelectionOrBody);

    let lastHighlightedMailText = '';
    const selectionCopyPill = document.getElementById('pm-selection-copy-pill');
    const selectionCopyLbl = document.getElementById('lbl-selection-copy-pill');
    const readerCopyTextBtn = document.getElementById('btn-reader-copy-text');

    selectionCopyPill?.addEventListener('mousedown', (e) => {
      // Keep current selection alive when clicking the floating Copy Selection pill
      e.preventDefault();
      e.stopPropagation();
    });

    selectionCopyPill?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const textToCopy = (window.getSelection && window.getSelection().toString().trim()) || lastHighlightedMailText;
      if (textToCopy && navigator.clipboard) {
        await navigator.clipboard.writeText(textToCopy);
        showToast(`Copied: "${textToCopy.slice(0, 40)}${textToCopy.length > 40 ? '…' : ''}"`);
      }
      selectionCopyPill.classList.add('hidden');
      lastHighlightedMailText = '';
    });

    const updateSelectionCopyPill = () => {
      if (!selectionCopyPill) return;
      const sel = window.getSelection ? window.getSelection() : null;
      const text = sel ? sel.toString().trim() : '';
      if (!text || !sel || sel.rangeCount === 0) {
        selectionCopyPill.classList.add('hidden');
        if (readerCopyTextBtn) readerCopyTextBtn.textContent = 'Copy Text';
        return;
      }
      const anchorNode = sel.anchorNode;
      const anchorEl = anchorNode && anchorNode.nodeType === 1 ? anchorNode : anchorNode?.parentElement;
      if (!anchorEl || (!anchorEl.closest('#pm-reader-drawer') && !anchorEl.closest('#pm-email-list'))) {
        selectionCopyPill.classList.add('hidden');
        if (readerCopyTextBtn) readerCopyTextBtn.textContent = 'Copy Text';
        return;
      }

      lastHighlightedMailText = text;
      if (readerCopyTextBtn && anchorEl.closest('#pm-reader-drawer')) {
        readerCopyTextBtn.textContent = 'Copy Selection';
      }
      if (selectionCopyLbl) {
        const preview = text.length > 18 ? `${text.slice(0, 18)}…` : text;
        selectionCopyLbl.textContent = `Copy "${preview}"`;
      }

      try {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect && (rect.width > 0 || rect.height > 0)) {
          const topPos = Math.max(8, rect.top - 36);
          const leftPos = Math.max(54, Math.min(window.innerWidth - 170, rect.left + rect.width / 2 - 65));
          selectionCopyPill.style.top = `${Math.round(topPos)}px`;
          selectionCopyPill.style.left = `${Math.round(leftPos)}px`;
          selectionCopyPill.classList.remove('hidden');
        }
      } catch (_) {}
    };

    document.addEventListener('selectionchange', updateSelectionCopyPill);

    document.getElementById('btn-reader-translate')?.addEventListener('click', () => {
      if (!activeReaderMessage) return;
      const text = (activeReaderMessage.fullText || activeReaderMessage.snippet || activeReaderMessage.subject || '').slice(0, 3500);
      const translateUrl = `https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(text)}&op=translate`;
      browser.tabs.create({ url: translateUrl });
    });

    // Make all links & buttons inside the email body open reliably in a new browser tab (unless user is highlighting text!)
    document.getElementById('reader-body')?.addEventListener('click', (e) => {
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.toString().trim().length > 0) return;
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

      const replyPayload = {
        slotIndex: slot,
        accountEmail: activeReaderMessage.accountEmail || '',
        to: activeReaderMessage.senderEmail,
        subject: replySubject,
        body: replyBody,
        threadId: activeReaderMessage.threadId || '',
        isDemo: Boolean(activeReaderMessage.isDemo)
      };

      try {
        let res = await browser.runtime.sendMessage({
          type: 'SEND_EMAIL',
          payload: replyPayload
        });

        if (!res || !res.ok) {
          if (sendLbl) sendLbl.textContent = 'Sending via Gmail…';
          res = await sendEmailViaFirstPartyGmailFrame(replyPayload);
          if (res && res.ok) {
            const rec = await browser.runtime.sendMessage({
              type: 'RECORD_SENT_EMAIL',
              payload: replyPayload
            });
            if (rec && rec.state) {
              appState = rec.state;
              renderAll();
            }
          }
        } else if (res.state) {
          appState = res.state;
          renderAll();
        }

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
      if (sendLbl) sendLbl.textContent = 'Sending via Gmail…';

      const composePayload = {
        slotIndex: slot,
        accountEmail,
        to,
        cc,
        bcc,
        subject: su,
        body,
        isDemo
      };

      try {
        let res = await browser.runtime.sendMessage({
          type: 'SEND_EMAIL',
          payload: composePayload
        });

        if (!res || !res.ok) {
          res = await sendEmailViaFirstPartyGmailFrame(composePayload);
          if (res && res.ok) {
            const rec = await browser.runtime.sendMessage({
              type: 'RECORD_SENT_EMAIL',
              payload: composePayload
            });
            if (rec && rec.state) {
              appState = rec.state;
              renderAll();
            }
          }
        } else if (res.state) {
          appState = res.state;
          renderAll();
        }

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
      } else if (msg.type === 'BG_AUDIO_STATUS_CHANGED') {
        currentAudibleBgAppId = msg.audibleAppId || null;
        renderOperaRail();
      } else if (msg.type === 'PM_SEEK_SIDEBAR_SP') {
        const spEntry = mediaFramePool.get(msg.appId || 'spotify');
        try {
          spEntry?.frame?.contentWindow?.postMessage(
            { target: 'pocketmail-media-frame', cmd: 'SEEK_SP_MEDIA', currentTime: msg.currentTime },
            '*'
          );
        } catch (_) {}
      }
    });

    // When the user closes the sidebar (×) or popup, save persistent app URLs and hand off active music/audio to Background Audio Keep-Alive!
    if (!IS_POPOUT_VIEW) {
      window.addEventListener('pagehide', () => {
        const activeMseIds = new Set(sidebarMsePlayers.keys());
        sidebarMsePlayers.forEach((_, id) => cleanupSidebarMsePlayer(id));
        if (!sidebarInitCompleted) return;
        // If this was just the top-right Mail popup with no media frames opened, do not disturb background audio
        if (!IS_SIDEBAR_VIEW && mediaFramePool.size === 0 && pendingSidebarAudioTakeoverSet.size === 0) {
          return;
        }
        const mode = appSettings.persistenceMode || 'selected';
        if (mode === 'eco') return;

        const savedUrls = {};
        const playingApps = [];
        const addedPlayingIds = new Set();
        mediaFramePool.forEach((entry, id) => {
          const pb = framePlaybackStates.get(id);
          let bestUrl = entry.currentUrl || pb?.resumeUrl || entry.restoredUrl || '';
          if (id === 'youtube' && bestUrl && pb?.resumeUrl) {
            try {
              const curU = new URL(bestUrl);
              const pbU = new URL(pb.resumeUrl);
              if (
                curU.pathname.startsWith('/watch') &&
                pbU.pathname.startsWith('/watch') &&
                curU.searchParams.get('v') === pbU.searchParams.get('v') &&
                pbU.searchParams.get('t')
              ) {
                bestUrl = pb.resumeUrl;
              }
            } catch (_) {}
          }
          if (bestUrl && !isTransientAuthOrBootUrl(bestUrl) && isAppPersistent(id)) {
            savedUrls[id] = bestUrl;
            hibernatedAppUrls.set(id, bestUrl);
            knownOpenPersistentIds.add(id);
          }
          if (!isAppAllowedForBgAudio(id)) {
            try {
              entry.frame.contentWindow?.postMessage(
                { target: 'pocketmail-media-frame', cmd: 'PAUSE_LOCAL_MEDIA' },
                '*'
              );
            } catch (_) {}
            return;
          }
          if (id === 'youtube' && !isPlayableYouTubeUrl(bestUrl)) {
            return;
          }
          const wasPlayingOrTakeover =
            (pb && pb.isPlaying && Date.now() - pb.updatedAt < 60000) ||
            activeMseIds.has(id) ||
            pendingSidebarAudioTakeoverSet.has(id);
          if (wasPlayingOrTakeover && bestUrl) {
            addedPlayingIds.add(id);
            playingApps.push({
              appId: id,
              url: bestUrl,
              title: pb?.title || ''
            });
          }
        });

        // Also include any app still playing in background.html (when the user opened onto Mail/Instagram and closed without switching to the media app)
        pendingSidebarAudioTakeoverSet.forEach((bgId) => {
          if (!addedPlayingIds.has(bgId) && isAppAllowedForBgAudio(bgId)) {
            const bgUrl = hibernatedAppUrls.get(bgId) || appSettings.persistentSavedAppUrls?.[bgId] || '';
            if (bgUrl) {
              playingApps.push({
                appId: bgId,
                url: bgUrl,
                title: ''
              });
            }
          }
        });

        saveFastBootCache();

        browser.runtime
          .sendMessage({
            type: 'SIDEBAR_CLOSED_HANDOFF',
            activeAppId: activeRailAppId,
            openPersistentAppIds: Array.from(knownOpenPersistentIds).filter((id) => isAppPersistent(id)),
            savedUrls,
            playingApps
          })
          .catch(() => {});
      });
    }
  }

  function schedulePrewarmPersistentApps() {
    if (IS_POPOUT_VIEW || (appSettings.persistenceMode || 'selected') === 'eco') return;
    const candidates = Array.from(knownOpenPersistentIds).filter(
      (id) =>
        id &&
        id !== activeRailAppId &&
        isAppPersistent(id) &&
        !mediaFramePool.has(id) &&
        !pendingSidebarAudioTakeoverSet.has(id) &&
        currentAudibleBgAppId !== id
    );
    if (candidates.length === 0) return;

    // Only preconnect DNS/TLS origins for persistent apps — never boot hidden (visibility: hidden) iframes in the background,
    // because Firefox throttles requestAnimationFrame to 0fps inside hidden iframes which stalls SPA hydration on splash screens!
    candidates.slice(0, 4).forEach((appId) => {
      if (!window.PocketMailMediaApps) return;
      const app = window.PocketMailMediaApps.getAppById(appId, appSettings);
      if (!app) return;
      const savedUrl = hibernatedAppUrls.get(appId) || appSettings.persistentSavedAppUrls?.[appId] || app.defaultUrl;
      ensureOriginPreconnected(savedUrl, appId);
    });
  }

  async function init() {
    bindEvents();

    const params = new URLSearchParams(window.location.search || '');
    const initialAppId = params.get('app');
    let fastBootMountedAppId = '';

    // 0ms Synchronous Fast-Boot Cache for previously loaded persistent apps & themes
    try {
      const rawFast = window.localStorage.getItem('pm_fast_boot_v1');
      if (rawFast) {
        const fast = JSON.parse(rawFast);
        if (fast && fast.settings && Date.now() - (fast.ts || 0) < 7 * 24 * 3600 * 1000) {
          appSettings = { ...appSettings, ...fast.settings };
          if (fast.savedUrls && typeof fast.savedUrls === 'object') {
            Object.entries(fast.savedUrls).forEach(([k, v]) => {
              if (v && !isTransientAuthOrBootUrl(v) && !hibernatedAppUrls.has(k)) hibernatedAppUrls.set(k, v);
            });
          }
          const openList = Array.isArray(fast.openPersistentAppIds)
            ? fast.openPersistentAppIds
            : Array.isArray(appSettings.persistentOpenAppIds)
              ? appSettings.persistentOpenAppIds
              : [];
          openList.forEach((id) => {
            if (id && isAppPersistent(id)) knownOpenPersistentIds.add(id);
          });
          if (window.PocketMailThemes) {
            window.PocketMailThemes.applyThemeAndWallpaper(document, appSettings);
          }
          const fastLastActiveId = initialAppId || fast.activeAppId || appSettings.persistentLastActiveAppId;
          const canFastRestoreLastApp =
            !IS_POPOUT_VIEW &&
            fastLastActiveId &&
            fastLastActiveId !== 'pocketmail' &&
            (Boolean(initialAppId) || isAppPersistent(fastLastActiveId));
          if (canFastRestoreLastApp && window.PocketMailMediaApps) {
            const fastApp = window.PocketMailMediaApps.getAppById(fastLastActiveId, appSettings);
            if (fastApp) {
              activeRailAppId = fastApp.id;
              fastBootMountedAppId = fastApp.id;
              if (!IS_SIDEBAR_VIEW) {
                document.documentElement.classList.add('show-popup-rail');
              }
              renderOperaRail();
              openMediaWorkspace(fastApp, hibernatedAppUrls.get(fastApp.id) || undefined);
            } else {
              renderOperaRail();
            }
          } else {
            renderOperaRail();
          }
        }
      }
    } catch (_) {}

    if (IS_SIDEBAR_VIEW && !IS_POPOUT_VIEW) {
      try {
        if (browser.runtime && typeof browser.runtime.connect === 'function') {
          sidebarLifecyclePort = browser.runtime.connect({ name: 'foxhub-sidebar-lifecycle' });
        }
      } catch (_) {}
    }

    const [res, handoffRes] = await Promise.all([
      browser.runtime.sendMessage({ type: 'GET_STATE' }).catch(() => null),
      IS_SIDEBAR_VIEW && !IS_POPOUT_VIEW
        ? browser.runtime.sendMessage({ type: 'STOP_BG_AUDIO_HANDOFF' }).catch(() => null)
        : Promise.resolve(null)
    ]);

    if (res) {
      appState = res.state || appState;
      appSettings = res.settings || appSettings;
      snoozedMap = res.snoozed || {};
      currentAudibleBgAppId = res.audibleAppId || null;

      if (IS_SIDEBAR_VIEW && !IS_POPOUT_VIEW && handoffRes) {
        if (handoffRes.settings) {
          appSettings = handoffRes.settings;
        }
        if (handoffRes.audibleAppId !== undefined) {
          currentAudibleBgAppId = handoffRes.audibleAppId || currentAudibleBgAppId;
        }
        if (Array.isArray(handoffRes.activeBgApps)) {
          handoffRes.activeBgApps.forEach((bgApp) => {
            if (bgApp && bgApp.appId && isAppAllowedForBgAudio(bgApp.appId)) {
              pendingSidebarAudioTakeoverSet.add(bgApp.appId);
              if (bgApp.url) {
                hibernatedAppUrls.set(bgApp.appId, bgApp.url);
              }
            }
          });
        }
      }

      // Pre-seed hibernatedAppUrls & knownOpenPersistentIds for all persistent apps so clicking them or auto-restoring resumes their exact saved URL/timestamp!
      const savedMap = appSettings.persistentSavedAppUrls || {};
      Object.entries(savedMap).forEach(([id, savedUrl]) => {
        if (savedUrl && !isTransientAuthOrBootUrl(savedUrl) && isAppPersistent(id) && !hibernatedAppUrls.has(id)) {
          hibernatedAppUrls.set(id, savedUrl);
        }
      });
      if (Array.isArray(appSettings.persistentOpenAppIds)) {
        appSettings.persistentOpenAppIds.forEach((id) => {
          if (id && isAppPersistent(id)) knownOpenPersistentIds.add(id);
        });
      }

      const firstBgPlayingId =
        pendingSidebarAudioTakeoverSet.size > 0 ? Array.from(pendingSidebarAudioTakeoverSet)[0] : '';
      const rawLastActiveId = appSettings.persistentLastActiveAppId || fastBootMountedAppId;
      const lastActiveId =
        rawLastActiveId && rawLastActiveId !== 'pocketmail' && isAppPersistent(rawLastActiveId)
          ? rawLastActiveId
          : firstBgPlayingId && isAppPersistent(firstBgPlayingId)
            ? firstBgPlayingId
            : rawLastActiveId;
      const shouldAutoRestoreApp =
        !IS_POPOUT_VIEW &&
        !initialAppId &&
        lastActiveId &&
        lastActiveId !== 'pocketmail' &&
        isAppPersistent(lastActiveId);
      if (shouldAutoRestoreApp) {
        activeRailAppId = lastActiveId;
      }

      renderAll();
      sidebarInitCompleted = true;
      saveFastBootCache();

      if (initialAppId && window.PocketMailMediaApps) {
        const app = window.PocketMailMediaApps.getAppById(initialAppId, appSettings);
        if (app) {
          if (fastBootMountedAppId !== app.id) {
            openMediaWorkspace(app, hibernatedAppUrls.get(app.id) || undefined);
          }
          schedulePrewarmPersistentApps();
          return;
        }
      }

      // Restore the last active persistent app automatically (if not already mounted at 0ms by fast-boot) and pre-warm other persistent apps!
      if (shouldAutoRestoreApp && window.PocketMailMediaApps) {
        const app = window.PocketMailMediaApps.getAppById(lastActiveId, appSettings);
        if (app && fastBootMountedAppId !== app.id) {
          if (!IS_SIDEBAR_VIEW) {
            document.documentElement.classList.add('show-popup-rail');
          }
          openMediaWorkspace(app, hibernatedAppUrls.get(app.id) || undefined);
        }
      }
      schedulePrewarmPersistentApps();
    }
  }

  init();
})();
