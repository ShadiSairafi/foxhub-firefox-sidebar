/**
 * FoxHub — Mail List, Multi-Account Switcher, Card Actions & Connected Accounts Drawer
 * 100% Pure DOM APIs (createElement / textContent / replaceChildren, 0 innerHTML / 0 DOMParser).
 */

(function (global) {
  const P = (global.FoxHubPopup = global.FoxHubPopup || {});

  P.renderAccountsBar = function () {
    const st = P.state;
    const accountsBar = P.dom.accountsBar;
    if (!accountsBar) return;

    const activeAccounts = (st.appState.accounts || []).filter((a) => !a.disabled);
    if (st.selectedAccountEmail !== 'ALL' && !activeAccounts.some((a) => a.email === st.selectedAccountEmail)) {
      st.selectedAccountEmail = 'ALL';
    }

    const frag = document.createDocumentFragment();

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = `pm-account-pill ${st.selectedAccountEmail === 'ALL' ? 'active' : ''}`;
    allBtn.setAttribute('data-account', 'ALL');
    const allLbl = document.createElement('span');
    allLbl.textContent = 'All Inboxes';
    const allCnt = document.createElement('span');
    allCnt.className = 'pm-account-count';
    allCnt.textContent = String(st.appState.totalUnread || 0);
    allBtn.appendChild(allLbl);
    allBtn.appendChild(allCnt);
    allBtn.addEventListener('click', () => {
      st.selectedAccountEmail = 'ALL';
      P.renderAccountsBar();
      P.renderEmailList();
    });
    frag.appendChild(allBtn);

    activeAccounts.forEach((acc) => {
      const isSelected = st.selectedAccountEmail === acc.email;
      const displayLabel = acc.nickname || (acc.email || '').split('@')[0];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pm-account-pill ${isSelected ? 'active' : ''}`;
      btn.setAttribute('data-account', acc.email);
      btn.title = acc.email;

      const dot = document.createElement('span');
      dot.className = 'pm-account-dot';
      dot.style.background = acc.color || '#D95032';
      const nm = document.createElement('span');
      nm.textContent = displayLabel;
      const cnt = document.createElement('span');
      cnt.className = 'pm-account-count';
      cnt.textContent = String(acc.unreadCount || 0);

      btn.appendChild(dot);
      btn.appendChild(nm);
      btn.appendChild(cnt);
      btn.addEventListener('click', () => {
        st.selectedAccountEmail = acc.email;
        P.renderAccountsBar();
        P.renderEmailList();
      });
      frag.appendChild(btn);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.id = 'btn-pill-add-account';
    addBtn.className = 'pm-account-pill pm-account-pill-add';
    addBtn.title = 'Sign in or add another Google account';
    addBtn.appendChild(P.createSvgIcon('plus', 12));
    const addLbl = document.createElement('span');
    addLbl.textContent = 'Add';
    addBtn.appendChild(addLbl);
    addBtn.addEventListener('click', () => P.openAccountDrawer());
    frag.appendChild(addBtn);

    accountsBar.replaceChildren(frag);
  };

  P.getVisibleMessages = function () {
    const st = P.state;
    const gmailApi = P.getGmailApi();

    if (st.activeFilter === 'snoozed') {
      const entries = Object.values(st.snoozedMap || {});
      return entries
        .map((e) => ({ ...e.message, snoozedUntil: e.wakeAt }))
        .filter((m) => st.selectedAccountEmail === 'ALL' || m.accountEmail === st.selectedAccountEmail);
    }

    if (st.activeFilter === 'sent') {
      let sentList = Array.isArray(st.appState.sentMessages) ? [...st.appState.sentMessages] : [];
      sentList = sentList.filter((m) => st.selectedAccountEmail === 'ALL' || m.accountEmail === st.selectedAccountEmail);
      if (st.searchQuery.trim()) {
        const q = st.searchQuery.trim().toLowerCase();
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

    const activeAccounts = (st.appState.accounts || []).filter((a) => !a.disabled);
    let list = [];
    activeAccounts.forEach((acc) => {
      if (st.selectedAccountEmail === 'ALL' || acc.email === st.selectedAccountEmail) {
        (acc.messages || []).forEach((m) => list.push(m));
      }
    });

    if (st.activeFilter === 'unread') {
      list = list.filter((m) => m.unread !== false);
    } else if (st.activeFilter === 'starred') {
      list = list.filter((m) => m.starred);
    } else if (st.activeFilter === 'codes') {
      list = list.filter((m) => {
        const code =
          m.otpCode ||
          (gmailApi && gmailApi.extractVerificationCode(m.subject, m.snippet));
        return Boolean(code);
      });
    }

    if (st.searchQuery.trim()) {
      const q = st.searchQuery.trim().toLowerCase();
      list = list.filter(
        (m) =>
          (m.subject || '').toLowerCase().includes(q) ||
          (m.senderName || '').toLowerCase().includes(q) ||
          (m.senderEmail || '').toLowerCase().includes(q) ||
          (m.snippet || '').toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  };

  P.getTotalMessagesIncludingRead = function () {
    const st = P.state;
    const activeAccounts = (st.appState.accounts || []).filter((a) => !a.disabled);
    let count = 0;
    activeAccounts.forEach((acc) => {
      if (st.selectedAccountEmail === 'ALL' || acc.email === st.selectedAccountEmail) {
        count += (acc.messages || []).length;
      }
    });
    return count;
  };

  P.triggerCardAction = async function (msgObj, action) {
    const st = P.state;
    const soundApi = P.getSoundApi();
    const ttsBar = P.dom.ttsBar;
    const ttsLabel = P.dom.ttsLabel;

    if (action === 'listen') {
      const readerListenBtn = document.getElementById('btn-reader-listen');
      if (st.isSpeakingNow) {
        soundApi?.stopSpeaking();
        st.isSpeakingNow = false;
        ttsBar?.classList.add('hidden');
        if (readerListenBtn) readerListenBtn.classList.remove('active');
        P.showToast('Stopped voice reading');
        return;
      }
      soundApi?.speakEmail(msgObj, st.appSettings, (ttsState) => {
        st.isSpeakingNow = Boolean(ttsState.playing);
        if (ttsState.playing) {
          ttsBar?.classList.remove('hidden');
          if (ttsLabel) ttsLabel.textContent = `Reading: ${msgObj.senderName} — ${msgObj.subject}`;
          if (readerListenBtn) readerListenBtn.classList.add('active');
        } else {
          ttsBar?.classList.add('hidden');
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
        st.appState = res.state;
        st.snoozedMap = res.snoozed || {};
        P.renderAll();
      }
      return;
    }

    if (action === 'snooze') {
      const isAlreadySnoozed = st.activeFilter === 'snoozed';
      const res = await browser.runtime.sendMessage({
        type: 'MESSAGE_ACTION',
        message: msgObj,
        actionType: isAlreadySnoozed ? 'unsnooze' : 'snooze',
        extra: { wakeAt: Date.now() + 60 * 60 * 1000 }
      });
      if (res && res.state) {
        st.appState = res.state;
        st.snoozedMap = res.snoozed || {};
        P.renderAll();
        P.showToast(isAlreadySnoozed ? 'Un-snoozed email' : 'Snoozed for 1 hour');
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
      st.appState = res.state;
      st.snoozedMap = res.snoozed || {};
      P.renderAll();
      P.showToast(toastLabels[action] || 'Done');
    }
  };

  P.renderEmailList = function () {
    const st = P.state;
    const emailListEl = P.dom.emailListEl;
    if (!emailListEl) return;

    const gmailApi = P.getGmailApi();
    const iconsApi = P.getIconsApi();
    const messages = P.getVisibleMessages();
    const showAccountBadge = st.selectedAccountEmail === 'ALL';
    const totalWithRead = P.getTotalMessagesIncludingRead();

    if (messages.length === 0) {
      const emptyKey =
        st.activeFilter === 'starred'
          ? 'emptyStar'
          : st.activeFilter === 'snoozed'
            ? 'emptyClock'
            : 'emptyCoffee';
      const emptyTitle =
        st.activeFilter === 'starred'
          ? 'No starred emails right now'
          : st.activeFilter === 'sent'
            ? 'No sent emails yet'
            : st.activeFilter === 'snoozed'
              ? 'No snoozed emails right now'
              : st.searchQuery
                ? 'No matching emails found'
                : totalWithRead > 0 && st.activeFilter === 'unread'
                  ? 'All recent emails marked as read!'
                  : 'Your inbox is serene & caught up';
      const emptySub = st.searchQuery
        ? 'Try a different search keyword or switch accounts above.'
        : st.activeFilter === 'sent'
          ? 'Emails you send or reply to from FoxHub will appear here and in your Gmail Sent folder.'
          : totalWithRead > 0 && st.activeFilter === 'unread'
            ? `You marked ${totalWithRead} recent email(s) as read. Switch to "All" or click Restore below to view them again.`
            : 'Enjoy a quiet moment — or customize your glassmorphism cards & backgrounds with the palette icon above.';

      const wrap = document.createElement('div');
      wrap.className = 'pm-empty-state';
      const illus = document.createElement('div');
      illus.className = 'pm-empty-illustration';
      illus.appendChild(P.createSvgIcon(emptyKey, 26));
      const titleEl = document.createElement('div');
      titleEl.className = 'pm-empty-title';
      titleEl.textContent = emptyTitle;
      const subEl = document.createElement('p');
      subEl.className = 'pm-empty-subtitle';
      subEl.textContent = emptySub;
      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;';

      if (totalWithRead > 0 && st.activeFilter === 'unread') {
        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.id = 'btn-empty-restore-read';
        restoreBtn.className = 'pm-btn pm-btn-primary';
        restoreBtn.appendChild(P.createSvgIcon('restore', 12));
        const sp = document.createElement('span');
        sp.textContent = `Restore ${totalWithRead} Read Email(s)`;
        restoreBtn.appendChild(sp);
        restoreBtn.addEventListener('click', async () => {
          const res = await browser.runtime.sendMessage({ type: 'RESTORE_READ_EMAILS' });
          if (res && res.state) {
            st.appState = res.state;
            st.snoozedMap = res.snoozed || {};
            P.renderAll();
            P.showToast('Restored all recent emails!');
          }
        });
        btns.appendChild(restoreBtn);
      }

      const addAccBtn = document.createElement('button');
      addAccBtn.type = 'button';
      addAccBtn.id = 'btn-empty-add-account';
      addAccBtn.className = 'pm-btn pm-btn-secondary';
      addAccBtn.appendChild(P.createSvgIcon('plus', 12));
      const addSpan = document.createElement('span');
      addSpan.textContent = 'Add / Manage Accounts';
      addAccBtn.appendChild(addSpan);
      addAccBtn.addEventListener('click', () => P.openAccountDrawer());
      btns.appendChild(addAccBtn);

      wrap.appendChild(illus);
      wrap.appendChild(titleEl);
      wrap.appendChild(subEl);
      wrap.appendChild(btns);
      emailListEl.replaceChildren(wrap);
      return;
    }

    const frag = document.createDocumentFragment();
    let fullThreadOtpFetchCount = 0;

    messages.forEach((msg) => {
      const initials = P.getInitials(msg.senderName, msg.senderEmail);
      const color = msg.accountColor || '#D95032';
      const accShort = msg.accountNickname || (msg.accountEmail || '').split('@')[0];
      const timeStr = msg.snoozedUntil
        ? `Wakes ${new Date(msg.snoozedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : P.formatRelativeTime(msg.timestamp);
      const isReadCard = msg.unread === false;
      const otpCode = gmailApi
        ? gmailApi.extractVerificationCode(msg.subject, msg.fullText || msg.snippet)
        : msg.otpCode;
      msg.otpCode = otpCode || null;

      const card = document.createElement('article');
      card.className = `pm-email-card${isReadCard ? ' is-read pm-card-read' : ''}`;
      card.setAttribute('data-msg-id', msg.id);
      card.style.setProperty('--card-account-color', color);

      const leftCol = document.createElement('div');
      leftCol.className = 'pm-card-left';
      const avContainer = document.createElement('div');
      avContainer.className = 'pm-avatar-container';
      if (iconsApi && typeof iconsApi.createSenderAvatarElement === 'function') {
        avContainer.appendChild(iconsApi.createSenderAvatarElement(document, msg, initials, color));
      } else {
        const av = document.createElement('div');
        av.className = 'pm-avatar';
        av.style.background = color;
        av.textContent = initials;
        avContainer.appendChild(av);
      }
      if (showAccountBadge) {
        const dot = document.createElement('span');
        dot.className = 'pm-avatar-acc-dot';
        dot.style.background = color;
        dot.title = msg.accountEmail || '';
        avContainer.appendChild(dot);
      }

      const starBtn = document.createElement('button');
      starBtn.type = 'button';
      starBtn.className = `pm-star-btn${msg.starred ? ' starred' : ''}`;
      starBtn.setAttribute('data-action', 'star');
      starBtn.title = 'Star / Unstar';
      starBtn.appendChild(P.createSvgIcon(msg.starred ? 'starFilled' : 'starOutline', 14));
      starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        P.triggerCardAction(msg, 'star');
      });

      leftCol.appendChild(avContainer);
      leftCol.appendChild(starBtn);

      const mainCol = document.createElement('div');
      mainCol.className = 'pm-card-main';

      const topRow = document.createElement('div');
      topRow.className = 'pm-card-top';
      const senderWrap = document.createElement('div');
      senderWrap.className = 'pm-sender-wrap';
      const senderName = document.createElement('span');
      senderName.className = 'pm-sender-name';
      senderName.textContent = msg.senderName || '';
      senderWrap.appendChild(senderName);
      if (showAccountBadge) {
        const tag = document.createElement('span');
        tag.className = 'pm-account-tag';
        tag.style.color = color;
        tag.style.borderColor = `${color}40`;
        tag.style.background = `${color}18`;
        tag.textContent = accShort;
        senderWrap.appendChild(tag);
      }
      const timeEl = document.createElement('span');
      timeEl.className = 'pm-card-time';
      timeEl.textContent = timeStr;
      topRow.appendChild(senderWrap);
      topRow.appendChild(timeEl);

      const subjEl = document.createElement('div');
      subjEl.className = 'pm-card-subject';
      subjEl.textContent = msg.subject || '';

      const snipEl = document.createElement('div');
      snipEl.className = 'pm-card-snippet';
      snipEl.textContent = msg.snippet || 'Click to read full message…';

      const actionsRow = document.createElement('div');
      actionsRow.className = 'pm-card-actions';

      const makeActionPill = (actionKey, iconKey, labelText, titleText, extraClass = '') => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `pm-action-pill${extraClass ? ` ${extraClass}` : ''}`;
        btn.setAttribute('data-action', actionKey);
        btn.title = titleText;
        if (iconKey) btn.appendChild(P.createSvgIcon(iconKey, 12));
        const sp = document.createElement('span');
        sp.textContent = labelText;
        btn.appendChild(sp);
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (actionKey === 'copyOtp') {
            const code = btn.getAttribute('data-otp');
            if (code && navigator.clipboard) {
              await navigator.clipboard.writeText(code);
              P.showToast(`Copied verification code: ${code}`);
            }
            return;
          }
          if (actionKey === 'copyText') {
            const selText = (window.getSelection && window.getSelection().toString().trim()) || '';
            if (selText && navigator.clipboard) {
              await navigator.clipboard.writeText(selText);
              P.showToast(`Copied selection: "${selText.slice(0, 36)}${selText.length > 36 ? '…' : ''}"`);
              return;
            }
            let bodyText = msg.fullText || '';
            if (!bodyText) {
              try {
                const fullRes = await browser.runtime.sendMessage({ type: 'FETCH_FULL_EMAIL', message: msg });
                if (fullRes && fullRes.plainText) {
                  bodyText = fullRes.plainText;
                  msg.fullText = bodyText;
                }
              } catch (_) {}
            }
            const toCopy = `${msg.subject || ''}\n${bodyText || msg.snippet || ''}`.trim();
            if (toCopy && navigator.clipboard) {
              await navigator.clipboard.writeText(toCopy);
              P.showToast('Copied message text to clipboard!');
            }
            return;
          }
          await P.triggerCardAction(msg, actionKey);
        });
        return btn;
      };

      if (otpCode) {
        const otpPill = makeActionPill('copyOtp', null, `Copy Code: ${otpCode}`, 'Click to copy verification code', 'pm-action-pill-otp');
        otpPill.setAttribute('data-otp', otpCode);
        actionsRow.appendChild(otpPill);
      }
      actionsRow.appendChild(makeActionPill('copyText', 'copy', 'Copy', 'Copy highlighted text or full message content'));
      actionsRow.appendChild(makeActionPill('listen', 'speaker', 'Listen', 'Read this email aloud'));
      actionsRow.appendChild(makeActionPill(isReadCard ? 'markUnread' : 'markRead', 'check', isReadCard ? 'Unread' : 'Read', isReadCard ? 'Mark as unread' : 'Mark as read'));
      actionsRow.appendChild(makeActionPill('archive', 'archive', 'Archive', 'Archive'));
      actionsRow.appendChild(makeActionPill('snooze', 'clock', 'Snooze', 'Snooze for 1 hour'));
      actionsRow.appendChild(makeActionPill('deleteTrash', 'trash', 'Delete', 'Delete (Move to Trash)', 'pm-action-pill-danger'));

      mainCol.appendChild(topRow);
      mainCol.appendChild(subjEl);
      mainCol.appendChild(snipEl);
      mainCol.appendChild(actionsRow);

      card.appendChild(leftCol);
      card.appendChild(mainCol);

      card.addEventListener('click', () => {
        const sel = window.getSelection && window.getSelection();
        if (sel && sel.toString().trim().length > 0) return;
        P.openReaderView(msg);
      });

      if (
        fullThreadOtpFetchCount < 3 &&
        !msg.isDemo &&
        msg._otpVerifiedTs !== msg.timestamp &&
        /\b(code|key|verification|verify|otp|passcode|security|sign-in|signin|login|auth|confirm|pin|steam guard|two-factor|2fa|redeem|activation)\b/i.test(
          `${msg.subject || ''} ${msg.snippet || ''}`
        )
      ) {
        fullThreadOtpFetchCount++;
        msg._otpVerifiedTs = msg.timestamp;
        browser.runtime
          .sendMessage({ type: 'FETCH_FULL_EMAIL', message: msg })
          .then((fullRes) => {
            if (!fullRes) return;
            if (fullRes.plainText) msg.fullText = fullRes.plainText;
            if (fullRes.latestSnippet) {
              msg.snippet = fullRes.latestSnippet;
              snipEl.textContent = fullRes.latestSnippet;
            }
            const resolvedOtp =
              fullRes.otpCode ||
              (gmailApi && gmailApi.extractVerificationCode(msg.subject, msg.fullText || msg.snippet));
            if (resolvedOtp) {
              msg.otpCode = resolvedOtp;
              const existingOtpBtn = actionsRow.querySelector('[data-action="copyOtp"]');
              if (existingOtpBtn) {
                existingOtpBtn.setAttribute('data-otp', resolvedOtp);
                const spanEl = existingOtpBtn.querySelector('span') || existingOtpBtn;
                spanEl.textContent = `Copy Code: ${resolvedOtp}`;
              } else {
                const otpPill = makeActionPill('copyOtp', null, `Copy Code: ${resolvedOtp}`, 'Click to copy verification code', 'pm-action-pill-otp');
                otpPill.setAttribute('data-otp', resolvedOtp);
                actionsRow.insertBefore(otpPill, actionsRow.firstChild);
              }
            }
          })
          .catch(() => {});
      }

      frag.appendChild(card);
    });

    emailListEl.replaceChildren(frag);
  };

  P.openAccountDrawer = function () {
    const st = P.state;
    P.closeHeaderMoreMenu?.();
    P.closeMutePopover?.();
    P.closeRailContextMenu?.();
    P.setDrawerOpen(P.dom.accountDrawer, true);
    if (st.appSettings.oauthClientId) {
      const inp = document.getElementById('input-oauth-client-id');
      if (inp) inp.value = st.appSettings.oauthClientId;
    }
    P.renderConnectedAccountsList();
  };

  P.renderConnectedAccountsList = function () {
    const st = P.state;
    const container = document.getElementById('pm-connected-accounts-list');
    if (!container) return;
    const accounts = st.appState.accounts || [];

    if (accounts.length === 0) {
      const p = document.createElement('p');
      p.style.cssText = 'font-size:12px;color:var(--text-muted);';
      p.textContent = 'No accounts detected yet. Click "Sign in with Google Account" above!';
      container.replaceChildren(p);
      return;
    }

    const frag = document.createDocumentFragment();
    accounts.forEach((acc) => {
      const typeLabel = acc.isDemo
        ? 'Sample Preview Account'
        : acc.accountType === 'oauth'
          ? 'Local OAuth 2.0 Account'
          : `Google Session (u/${acc.slotIndex || 0})`;

      const item = document.createElement('div');
      item.className = 'pm-connected-item';

      const left = document.createElement('div');
      left.className = 'pm-connected-left';
      const av = document.createElement('div');
      av.className = 'pm-avatar';
      av.style.cssText = `width:30px;height:30px;font-size:12px;background:${acc.color || '#D95032'};`;
      av.textContent = P.getInitials(acc.nickname, acc.email);
      const textWrap = document.createElement('div');
      textWrap.className = 'pm-connected-text';
      const emEl = document.createElement('div');
      emEl.className = 'pm-connected-email';
      emEl.textContent = acc.email || '';
      const metaEl = document.createElement('div');
      metaEl.className = 'pm-connected-meta';
      metaEl.textContent = `${typeLabel} • ${acc.unreadCount || 0} unread`;
      textWrap.appendChild(emEl);
      textWrap.appendChild(metaEl);
      left.appendChild(av);
      left.appendChild(textWrap);

      const right = document.createElement('div');
      if (acc.isDemo) {
        const hideBtn = document.createElement('button');
        hideBtn.type = 'button';
        hideBtn.className = 'pm-btn-xs pm-btn-secondary';
        hideBtn.textContent = 'Hide Demo';
        hideBtn.addEventListener('click', async () => {
          await P.saveSettingsPatch({ demoMode: 'off' });
          P.renderConnectedAccountsList();
          P.showToast('Preview accounts hidden');
        });
        right.appendChild(hideBtn);
      } else {
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'pm-btn-xs pm-btn-secondary';
        openBtn.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';
        const sp = document.createElement('span');
        sp.textContent = 'Open';
        openBtn.appendChild(sp);
        openBtn.appendChild(P.createSvgIcon('external', 11));
        openBtn.addEventListener('click', () => {
          browser.tabs.create({ url: `https://mail.google.com/mail/u/${acc.slotIndex || 0}/#inbox` });
        });
        right.appendChild(openBtn);
      }

      item.appendChild(left);
      item.appendChild(right);
      frag.appendChild(item);
    });

    container.replaceChildren(frag);
  };

  P.bindMailViewEvents = function () {
    const st = P.state;
    document.getElementById('btn-demo-signin')?.addEventListener('click', () => P.openAccountDrawer());

    P.dom.searchInput?.addEventListener('input', (e) => {
      st.searchQuery = e.target.value || '';
      P.renderEmailList();
    });

    document.querySelectorAll('.pm-filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.pm-filter-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        st.activeFilter = chip.getAttribute('data-filter');
        P.renderEmailList();
      });
    });

    document.getElementById('btn-mark-all-read')?.addEventListener('click', async () => {
      const targetEmail = st.selectedAccountEmail === 'ALL' ? null : st.selectedAccountEmail;
      const res = await browser.runtime.sendMessage({
        type: 'MARK_ALL_READ',
        accountEmail: targetEmail
      });
      if (res && res.state) {
        st.appState = res.state;
        st.snoozedMap = res.snoozed || {};
        P.renderAll();
        P.showToast('Marked as read (switch to "All" tab anytime to view)');
      }
    });

    document.getElementById('btn-tts-stop')?.addEventListener('click', () => {
      P.getSoundApi()?.stopSpeaking();
      st.isSpeakingNow = false;
      P.dom.ttsBar?.classList.add('hidden');
    });

    document.getElementById('btn-open-gmail')?.addEventListener('click', () => {
      let slot = 0;
      if (st.selectedAccountEmail !== 'ALL') {
        const found = (st.appState.accounts || []).find((a) => a.email === st.selectedAccountEmail);
        if (found && found.slotIndex !== undefined) slot = found.slotIndex;
      }
      browser.tabs.create({ url: `https://mail.google.com/mail/u/${slot}/#inbox` });
    });

    document.getElementById('btn-footer-add-account')?.addEventListener('click', () => P.openAccountDrawer());
    document.getElementById('btn-account-back')?.addEventListener('click', () => {
      P.setDrawerOpen(P.dom.accountDrawer, false);
    });

    document.getElementById('btn-google-login-popup')?.addEventListener('click', async () => {
      await browser.runtime.sendMessage({ type: 'OPEN_GOOGLE_LOGIN' });
      P.showToast('Opening Google Account Sign-In…');
    });

    document.getElementById('btn-rescan-sessions')?.addEventListener('click', async () => {
      P.showToast('Scanning signed-in Google accounts…');
      const res = await browser.runtime.sendMessage({ type: 'SYNC_NOW' });
      if (res && res.state) {
        st.appState = res.state;
        st.appSettings = res.settings || st.appSettings;
        P.renderAll();
        P.renderConnectedAccountsList();
        P.showToast(`Found ${st.appState.accounts.length} account(s)`);
      }
    });

    document.getElementById('btn-oauth-connect')?.addEventListener('click', async () => {
      const clientId = (document.getElementById('input-oauth-client-id')?.value || '').trim();
      if (!clientId) {
        P.showToast('Enter a Google OAuth Client ID first, or use "Sign in with Google Account" above!');
        return;
      }
      try {
        P.showToast('Launching Google OAuth…');
        const res = await browser.runtime.sendMessage({
          type: 'CONNECT_OAUTH_ACCOUNT',
          clientId
        });
        if (res && res.ok) {
          st.appState = res.state;
          st.appSettings = res.settings || st.appSettings;
          P.renderAll();
          P.renderConnectedAccountsList();
          P.showToast(`Connected ${res.account.email}!`);
        }
      } catch (err) {
        P.showToast(err.message || 'OAuth login cancelled');
      }
    });
  };
})(typeof window !== 'undefined' ? window : this);
