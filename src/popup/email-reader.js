/**
 * FoxHub — In-Popup Email Reader Drawer, Smart Copy Chips, Dark Mode DOM Adaptation & Quick Reply
 * Uses FoxHubGmailClient.renderEmailContent() & FoxHubSenderIcons.createSenderAvatarElement() (0 innerHTML).
 */

(function (global) {
  const P = (global.FoxHubPopup = global.FoxHubPopup || {});

  function parseCssRgb(str) {
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

  function relLuminance(rgb) {
    return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  }

  P.adaptEmailDomForDarkMode = function (container) {
    if (!container) return;
    const isDarkUi = document.documentElement.getAttribute('data-color-scheme') === 'dark';
    if (!isDarkUi) return;

    const lightBgNodes = new WeakSet();
    const nodes = container.querySelectorAll('*');
    nodes.forEach((el) => {
      const hasInlineBg = Boolean(el.style?.backgroundColor || el.style?.background || el.getAttribute('bgcolor'));
      if (!hasInlineBg) return;
      const bg = parseCssRgb(window.getComputedStyle(el).backgroundColor);
      if (bg && bg.a > 0.25 && relLuminance(bg) > 0.52) {
        lightBgNodes.add(el);
      }
    });

    const isInsideLightBox = (el) => {
      let cur = el;
      while (cur && cur !== container) {
        if (lightBgNodes.has(cur)) return true;
        cur = cur.parentElement;
      }
      return false;
    };

    nodes.forEach((el) => {
      if (isInsideLightBox(el)) return;
      const hasColorOverride = Boolean(el.style?.color || el.getAttribute('color'));
      if (!hasColorOverride) return;
      const fg = parseCssRgb(window.getComputedStyle(el).color);
      if (fg && fg.a > 0.2 && relLuminance(fg) < 0.36) {
        const isLink = el.tagName === 'A' || Boolean(el.closest && el.closest('a'));
        el.style.setProperty('color', isLink ? '#FF7A5C' : '#F4F4F8', 'important');
      }
    });
  };

  P.applyEmailReaderScale = function () {
    const st = P.state;
    const viewportEl = document.getElementById('reader-body-viewport');
    const bodyEl = document.getElementById('reader-body');
    const lblZoom = document.getElementById('lbl-zoom-level');
    const autoFitBtn = document.getElementById('btn-reader-autofit');
    if (!viewportEl || !bodyEl) return;

    if (autoFitBtn) {
      autoFitBtn.classList.toggle('active', st.autoFitEmail);
    }

    if (st.autoFitEmail) {
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
      bodyEl.style.zoom = String(st.readerZoom / 100);
      if (lblZoom) lblZoom.textContent = `${st.readerZoom}%`;
    }
  };

  P.updateReaderStarButton = function () {
    const starBtn = document.getElementById('btn-reader-star');
    const msg = P.state.activeReaderMessage;
    if (!starBtn || !msg) return;
    starBtn.replaceChildren(P.createSvgIcon(msg.starred ? 'starFilled' : 'starOutline', 16));
    starBtn.style.color = msg.starred ? '#E09F3E' : '';
  };

  P.renderReaderSmartCopyChips = function (msgObj, bodyEl, detectedOtp = '') {
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
    const parenHexMatch = (msgObj.subject || '').match(/\(([a-f0-9]{7,12})\)/i);
    if (parenHexMatch && parenHexMatch[1]) {
      addChip(`Commit: ${parenHexMatch[1]}`, parenHexMatch[1]);
    }
    const idTokens =
      fullStr.match(/(?:(?<![A-Za-z0-9_.-])#\d{3,10}|\b[a-z]+-[a-z0-9]+-\d{2,6}(?:-\d{2,6})?\b|\b[A-Z]{2,5}-\d{3,10}\b)/g) || [];
    idTokens.slice(0, 2).forEach((tok) => addChip(`ID: ${tok}`, tok));

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

    if (msgObj.subject) addChip('Copy Subject', msgObj.subject, `Copy subject: ${msgObj.subject}`);
    if (msgObj.senderEmail) addChip(`Sender: ${msgObj.senderEmail}`, msgObj.senderEmail, `Copy sender email: ${msgObj.senderEmail}`);

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
      btn.appendChild(P.createSvgIcon('copy', 12));
      const span = document.createElement('span');
      span.textContent = item.label;
      btn.appendChild(span);
      btn.addEventListener('click', async () => {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(item.value);
          P.showToast(`Copied: ${item.value.slice(0, 42)}${item.value.length > 42 ? '…' : ''}`);
        }
      });
      barEl.appendChild(btn);
    });
  };

  P.openReaderView = async function (msgObj) {
    const st = P.state;
    const gmailApi = P.getGmailApi();
    const iconsApi = P.getIconsApi();
    P.closeHeaderMoreMenu?.();
    P.closeMutePopover?.();
    P.closeRailContextMenu?.();
    st.activeReaderMessage = msgObj;
    P.setDrawerOpen(P.dom.readerDrawer, true);
    document.getElementById('pm-reader-snooze-bar')?.classList.add('hidden');

    P.updateReaderStarButton();

    const pill = document.getElementById('reader-account-pill');
    if (pill) {
      pill.textContent = msgObj.accountNickname
        ? `${msgObj.accountNickname} (${msgObj.accountEmail})`
        : msgObj.accountEmail;
      pill.style.background = msgObj.accountColor || '#D95032';
    }

    const subjEl = document.getElementById('reader-subject');
    if (subjEl) subjEl.textContent = msgObj.subject || '';

    const otpBtn = document.getElementById('btn-reader-copy-otp');
    const unsubBtn = document.getElementById('btn-reader-unsubscribe');
    const initialOtp = gmailApi
      ? gmailApi.extractVerificationCode(msgObj.subject, msgObj.fullText || msgObj.snippet)
      : msgObj.otpCode;

    if (otpBtn) {
      if (initialOtp) {
        otpBtn.textContent = `Copy Code: ${initialOtp}`;
        otpBtn.setAttribute('data-otp', initialOtp);
        otpBtn.classList.remove('hidden');
      } else {
        otpBtn.classList.add('hidden');
      }
    }
    if (unsubBtn) unsubBtn.classList.add('hidden');

    const avatarWrap = document.getElementById('reader-avatar-wrap');
    if (avatarWrap) {
      const initials = P.getInitials(msgObj.senderName, msgObj.senderEmail);
      const color = msgObj.accountColor || '#D95032';
      if (iconsApi && typeof iconsApi.createSenderAvatarElement === 'function') {
        avatarWrap.replaceChildren(iconsApi.createSenderAvatarElement(document, msgObj, initials, color));
      } else {
        const fallback = document.createElement('div');
        fallback.className = 'pm-avatar';
        fallback.style.background = color;
        fallback.textContent = initials;
        avatarWrap.replaceChildren(fallback);
      }
    }

    const sName = document.getElementById('reader-sender-name');
    const sEmail = document.getElementById('reader-sender-email');
    const rDate = document.getElementById('reader-date');
    if (sName) sName.textContent = msgObj.senderName || '';
    if (sEmail) sEmail.textContent = msgObj.senderEmail || '';
    if (rDate) rDate.textContent = P.formatRelativeTime(msgObj.timestamp);

    const bodyEl = document.getElementById('reader-body');
    if (bodyEl) {
      bodyEl.style.zoom = '1';
      const loadingP = document.createElement('p');
      loadingP.style.color = 'var(--text-muted)';
      loadingP.textContent = 'Loading full message content locally…';
      bodyEl.replaceChildren(loadingP);
    }
    const replyIn = document.getElementById('reader-reply-input');
    if (replyIn) replyIn.value = '';
    P.renderReaderSmartCopyChips(msgObj, null, initialOtp);

    try {
      const fullContent = await browser.runtime.sendMessage({
        type: 'FETCH_FULL_EMAIL',
        message: msgObj
      });
      if (bodyEl && fullContent && (fullContent.domTree || fullContent.plainText)) {
        if (gmailApi && typeof gmailApi.renderEmailContent === 'function') {
          gmailApi.renderEmailContent(bodyEl, fullContent);
        } else {
          bodyEl.textContent = fullContent.plainText || msgObj.snippet || 'No additional content.';
        }
        P.adaptEmailDomForDarkMode(bodyEl);
        st.activeReaderMessage.fullText = fullContent.plainText || msgObj.snippet;
        st.activeReaderMessage.unsubscribeUrl = fullContent.unsubscribeUrl || null;

        const detectedOtp =
          fullContent.otpCode ||
          (gmailApi && gmailApi.extractVerificationCode(msgObj.subject, st.activeReaderMessage.fullText)) ||
          initialOtp;
        if (detectedOtp) {
          msgObj.otpCode = detectedOtp;
          if (otpBtn) {
            otpBtn.textContent = `Copy Code: ${detectedOtp}`;
            otpBtn.setAttribute('data-otp', detectedOtp);
            otpBtn.classList.remove('hidden');
          }
        } else if (otpBtn) {
          otpBtn.classList.add('hidden');
        }
        if (fullContent.unsubscribeUrl && unsubBtn) {
          unsubBtn.classList.remove('hidden');
        }
        P.renderReaderSmartCopyChips(st.activeReaderMessage, bodyEl, detectedOtp);

        requestAnimationFrame(P.applyEmailReaderScale);
        setTimeout(P.applyEmailReaderScale, 120);
        bodyEl.querySelectorAll('img').forEach((img) => {
          img.addEventListener('load', P.applyEmailReaderScale);
        });
      } else if (bodyEl) {
        bodyEl.textContent = msgObj.snippet || 'No additional content.';
        P.renderReaderSmartCopyChips(st.activeReaderMessage, bodyEl, initialOtp);
        P.applyEmailReaderScale();
      }
    } catch (_) {
      if (bodyEl) bodyEl.textContent = msgObj.snippet || 'Could not load full thread.';
      P.renderReaderSmartCopyChips(st.activeReaderMessage, bodyEl, initialOtp);
      P.applyEmailReaderScale();
    }
  };

  P.navigateReaderEmail = function (delta) {
    const st = P.state;
    if (!st.activeReaderMessage) return;
    const list = P.getVisibleMessages();
    const idx = list.findIndex((m) => m.id === st.activeReaderMessage.id);
    if (idx === -1) return;
    const targetIdx = idx + delta;
    if (targetIdx >= 0 && targetIdx < list.length) {
      P.openReaderView(list[targetIdx]);
    } else {
      P.showToast(delta < 0 ? 'Already at newest email' : 'Already at last email');
    }
  };

  P.bindEmailReaderEvents = function () {
    const st = P.state;
    const readerDrawer = P.dom.readerDrawer;

    document.getElementById('btn-reader-back')?.addEventListener('click', () => {
      P.setDrawerOpen(readerDrawer, false);
      st.activeReaderMessage = null;
    });

    document.getElementById('btn-reader-prev')?.addEventListener('click', () => P.navigateReaderEmail(-1));
    document.getElementById('btn-reader-next')?.addEventListener('click', () => P.navigateReaderEmail(1));

    document.getElementById('btn-reader-star')?.addEventListener('click', async () => {
      if (!st.activeReaderMessage) return;
      await P.triggerCardAction(st.activeReaderMessage, 'star');
      P.updateReaderStarButton();
      P.showToast(st.activeReaderMessage.starred ? 'Starred email' : 'Removed star');
    });

    document.getElementById('btn-reader-listen')?.addEventListener('click', () => {
      if (!st.activeReaderMessage) return;
      P.triggerCardAction(st.activeReaderMessage, 'listen');
    });

    document.getElementById('btn-reader-mark-read')?.addEventListener('click', async () => {
      if (!st.activeReaderMessage) return;
      await P.triggerCardAction(st.activeReaderMessage, 'markRead');
      P.setDrawerOpen(readerDrawer, false);
    });

    document.getElementById('btn-reader-snooze')?.addEventListener('click', () => {
      document.getElementById('pm-reader-snooze-bar')?.classList.toggle('hidden');
    });

    document.querySelectorAll('[data-snooze-mins]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!st.activeReaderMessage) return;
        const mins = parseInt(btn.getAttribute('data-snooze-mins') || '60', 10);
        const res = await browser.runtime.sendMessage({
          type: 'MESSAGE_ACTION',
          message: st.activeReaderMessage,
          actionType: 'snooze',
          extra: { wakeAt: Date.now() + mins * 60 * 1000 }
        });
        if (res && res.state) {
          st.appState = res.state;
          st.snoozedMap = res.snoozed || {};
          P.setDrawerOpen(readerDrawer, false);
          P.renderAll();
          P.showToast(`Snoozed (${btn.textContent.trim()})`);
        }
      });
    });

    document.getElementById('btn-reader-archive')?.addEventListener('click', async () => {
      if (!st.activeReaderMessage) return;
      await P.triggerCardAction(st.activeReaderMessage, 'archive');
      P.setDrawerOpen(readerDrawer, false);
    });

    document.getElementById('btn-reader-delete')?.addEventListener('click', async () => {
      if (!st.activeReaderMessage) return;
      await P.triggerCardAction(st.activeReaderMessage, 'deleteTrash');
      P.setDrawerOpen(readerDrawer, false);
    });

    document.getElementById('btn-reader-open-web')?.addEventListener('click', () => {
      if (!st.activeReaderMessage) return;
      browser.tabs.create({ url: st.activeReaderMessage.webUrl || 'https://mail.google.com/' });
    });

    document.getElementById('btn-reader-autofit')?.addEventListener('click', () => {
      st.autoFitEmail = !st.autoFitEmail;
      if (!st.autoFitEmail) st.readerZoom = 100;
      P.applyEmailReaderScale();
      P.showToast(st.autoFitEmail ? 'Auto-Fit Email Width enabled' : 'Original 100% email width');
    });

    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
      st.autoFitEmail = false;
      st.readerZoom = Math.max(55, st.readerZoom - 10);
      P.applyEmailReaderScale();
    });

    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
      st.autoFitEmail = false;
      st.readerZoom = Math.min(140, st.readerZoom + 10);
      P.applyEmailReaderScale();
    });

    document.getElementById('btn-reader-copy-otp')?.addEventListener('click', async (e) => {
      const code = e.currentTarget.getAttribute('data-otp');
      if (code && navigator.clipboard) {
        await navigator.clipboard.writeText(code);
        P.showToast(`Copied verification code: ${code}`);
      }
    });

    document.getElementById('btn-reader-unsubscribe')?.addEventListener('click', () => {
      if (st.activeReaderMessage && st.activeReaderMessage.unsubscribeUrl) {
        browser.tabs.create({ url: st.activeReaderMessage.unsubscribeUrl });
      }
    });

    let lastHighlightedMailText = '';
    const selectionCopyPill = document.getElementById('pm-selection-copy-pill');
    const selectionCopyLbl = document.getElementById('lbl-selection-copy-pill');
    const readerCopyTextBtn = document.getElementById('btn-reader-copy-text');

    const copyReaderSelectionOrBody = async () => {
      const selText = (window.getSelection && window.getSelection().toString().trim()) || lastHighlightedMailText || '';
      if (selText && navigator.clipboard) {
        await navigator.clipboard.writeText(selText);
        P.showToast(`Copied selection: "${selText.slice(0, 36)}${selText.length > 36 ? '…' : ''}"`);
        selectionCopyPill?.classList.add('hidden');
        lastHighlightedMailText = '';
        return;
      }
      if (!st.activeReaderMessage) return;
      const renderedBodyText = (document.getElementById('reader-body')?.innerText || '').trim();
      const bodyContent = renderedBodyText || st.activeReaderMessage.fullText || st.activeReaderMessage.snippet || '';
      const text = `${st.activeReaderMessage.subject}\nFrom: ${st.activeReaderMessage.senderName} <${st.activeReaderMessage.senderEmail}>\n\n${bodyContent}`;
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        P.showToast('Copied full email text to clipboard!');
      }
    };

    document.getElementById('btn-reader-copy-text')?.addEventListener('click', copyReaderSelectionOrBody);
    document.getElementById('btn-reader-header-copy')?.addEventListener('click', copyReaderSelectionOrBody);

    selectionCopyPill?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    selectionCopyPill?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const textToCopy = (window.getSelection && window.getSelection().toString().trim()) || lastHighlightedMailText;
      if (textToCopy && navigator.clipboard) {
        await navigator.clipboard.writeText(textToCopy);
        P.showToast(`Copied: "${textToCopy.slice(0, 40)}${textToCopy.length > 40 ? '…' : ''}"`);
      }
      selectionCopyPill.classList.add('hidden');
      lastHighlightedMailText = '';
    });

    document.addEventListener('selectionchange', () => {
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
    });

    document.getElementById('btn-reader-translate')?.addEventListener('click', () => {
      if (!st.activeReaderMessage) return;
      const text = (st.activeReaderMessage.fullText || st.activeReaderMessage.snippet || st.activeReaderMessage.subject || '').slice(0, 3500);
      const translateUrl = `https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(text)}&op=translate`;
      browser.tabs.create({ url: translateUrl });
    });

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

    document.querySelectorAll('.pm-canned-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const replyInput = document.getElementById('reader-reply-input');
        if (replyInput) {
          replyInput.value = chip.getAttribute('data-reply-text') || '';
          replyInput.focus();
        }
      });
    });

    document.getElementById('btn-reader-reply-tab')?.addEventListener('click', () => {
      if (!st.activeReaderMessage) return;
      const replyBody = (document.getElementById('reader-reply-input')?.value || '').trim();
      const slot = st.activeReaderMessage.accountSlot || 0;
      const replySubject = st.activeReaderMessage.subject.startsWith('Re:')
        ? st.activeReaderMessage.subject
        : `Re: ${st.activeReaderMessage.subject}`;
      const gmailComposeUrl =
        `https://mail.google.com/mail/u/${slot}/?view=cm&fs=1` +
        `&to=${encodeURIComponent(st.activeReaderMessage.senderEmail)}` +
        `&su=${encodeURIComponent(replySubject)}` +
        `&body=${encodeURIComponent(replyBody)}`;
      browser.tabs.create({ url: gmailComposeUrl });
    });

    document.getElementById('btn-reader-send-reply')?.addEventListener('click', async () => {
      if (!st.activeReaderMessage) return;
      const replyInput = document.getElementById('reader-reply-input');
      const replyBody = (replyInput?.value || '').trim();
      if (!replyBody) {
        P.showToast('Write a reply message first!');
        replyInput?.focus();
        return;
      }

      const sendBtn = document.getElementById('btn-reader-send-reply');
      const sendLbl = document.getElementById('lbl-reader-send-reply');
      const slot = st.activeReaderMessage.accountSlot || 0;
      const replySubject = st.activeReaderMessage.subject.startsWith('Re:')
        ? st.activeReaderMessage.subject
        : `Re: ${st.activeReaderMessage.subject}`;

      if (sendBtn) sendBtn.disabled = true;
      if (sendLbl) sendLbl.textContent = 'Sending…';

      const replyPayload = {
        slotIndex: slot,
        accountEmail: st.activeReaderMessage.accountEmail || '',
        to: st.activeReaderMessage.senderEmail,
        subject: replySubject,
        body: replyBody,
        threadId: st.activeReaderMessage.threadId || '',
        isDemo: Boolean(st.activeReaderMessage.isDemo)
      };

      try {
        let res = await browser.runtime.sendMessage({
          type: 'SEND_EMAIL',
          payload: replyPayload
        });

        if (!res || !res.ok) {
          if (sendLbl) sendLbl.textContent = 'Sending via Gmail…';
          res = await P.sendEmailViaFirstPartyGmailFrame(replyPayload);
          if (res && res.ok) {
            const rec = await browser.runtime.sendMessage({
              type: 'RECORD_SENT_EMAIL',
              payload: replyPayload
            });
            if (rec && rec.state) {
              st.appState = rec.state;
              P.renderAll();
            }
          }
        } else if (res.state) {
          st.appState = res.state;
          P.renderAll();
        }

        if (res && res.ok) {
          if (replyInput) replyInput.value = '';
          P.showToast(`✓ Reply sent directly to ${st.activeReaderMessage.senderName || st.activeReaderMessage.senderEmail}!`);
        } else {
          P.setDrawerOpen(readerDrawer, false);
          P.openComposeDrawer({
            to: st.activeReaderMessage.senderEmail,
            subject: replySubject,
            body: replyBody
          });
          P.setComposeDrawerMode('embed');
          P.showToast('Loaded in Embedded Gmail Composer — click Send below!');
        }
      } catch (_) {
        P.showToast('Could not send reply; try Embedded Gmail mode.');
      } finally {
        if (sendBtn) sendBtn.disabled = false;
        if (sendLbl) sendLbl.textContent = 'Send Reply';
      }
    });
  };
})(typeof window !== 'undefined' ? window : this);
