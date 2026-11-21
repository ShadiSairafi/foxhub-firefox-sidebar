/**
 * FoxHub — Compose Email Drawer (Local Native Form + Embedded First-Party Gmail Composer)
 * Zero innerHTML / 0 DOMParser HTML strings.
 */

(function (global) {
  const P = (global.FoxHubPopup = global.FoxHubPopup || {});

  P.setComposeDrawerMode = function (mode = 'native') {
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
    if (embedPane) embedPane.style.cssText = '';

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
  };

  P.sendEmailViaFirstPartyGmailFrame = function (payload) {
    const st = P.state;
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
        if (st.pendingGmailAutoSendResolver === finish) {
          st.pendingGmailAutoSendResolver = null;
        }
        if (wasHidden && embedPane && result && result.ok) {
          embedPane.style.cssText = '';
          embedPane.classList.add('hidden');
        }
        resolve(result || { ok: false, reason: 'unknown' });
      };

      st.pendingGmailAutoSendResolver = finish;

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
  };

  P.openComposeDrawer = function (prefill = {}) {
    const st = P.state;
    P.closeHeaderMoreMenu?.();
    P.closeMutePopover?.();
    P.closeRailContextMenu?.();
    P.hideMediaWorkspaceKeepAlive?.();
    P.setDrawerOpen(P.dom.composeDrawer, true);
    P.setComposeDrawerMode('native');

    const fromSelect = document.getElementById('compose-from');
    const activeAccounts = (st.appState.accounts || []).filter((a) => !a.disabled);

    if (fromSelect) {
      fromSelect.replaceChildren();
      if (activeAccounts.length === 0) {
        const opt = document.createElement('option');
        opt.value = '0';
        opt.setAttribute('data-email', '');
        opt.setAttribute('data-demo', '0');
        opt.textContent = 'Default Gmail Account (u/0)';
        fromSelect.appendChild(opt);
      } else {
        activeAccounts.forEach((acc) => {
          const opt = document.createElement('option');
          opt.value = String(acc.slotIndex || 0);
          opt.setAttribute('data-email', acc.email || '');
          opt.setAttribute('data-demo', acc.isDemo ? '1' : '0');
          if (st.selectedAccountEmail === acc.email) opt.selected = true;
          opt.textContent = acc.nickname ? `${acc.nickname} (${acc.email})` : acc.email;
          fromSelect.appendChild(opt);
        });
      }
    }

    const toEl = document.getElementById('compose-to');
    const ccEl = document.getElementById('compose-cc');
    const bccEl = document.getElementById('compose-bcc');
    const subEl = document.getElementById('compose-subject');
    const bodyEl = document.getElementById('compose-body');
    if (toEl) toEl.value = prefill.to || '';
    if (ccEl) ccEl.value = prefill.cc || '';
    if (bccEl) bccEl.value = prefill.bcc || '';
    if (subEl) subEl.value = prefill.subject || '';
    if (bodyEl) bodyEl.value = prefill.body || '';

    setTimeout(() => {
      document.getElementById(prefill.to ? 'compose-subject' : 'compose-to')?.focus();
    }, 60);
  };

  P.bindComposeEvents = function () {
    const st = P.state;
    const composeDrawer = P.dom.composeDrawer;

    document.getElementById('btn-compose')?.addEventListener('click', () => P.openComposeDrawer());
    document.getElementById('btn-compose-back')?.addEventListener('click', () => {
      P.setDrawerOpen(composeDrawer, false);
    });

    document.getElementById('btn-compose-mode-native')?.addEventListener('click', () => {
      P.setComposeDrawerMode('native');
    });
    document.getElementById('btn-compose-mode-embed')?.addEventListener('click', () => {
      P.setComposeDrawerMode('embed');
    });

    document.getElementById('compose-from')?.addEventListener('change', () => {
      const embedPane = document.getElementById('pm-compose-embed-pane');
      if (embedPane && !embedPane.classList.contains('hidden')) {
        P.setComposeDrawerMode('embed');
      }
    });

    document.getElementById('btn-toggle-cc-bcc')?.addEventListener('click', () => {
      const row = document.getElementById('compose-cc-bcc-row');
      if (row) {
        const isHidden = row.classList.toggle('hidden');
        if (!isHidden) document.getElementById('compose-cc')?.focus();
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
      const slot = document.getElementById('compose-from')?.value || '0';
      const to = (document.getElementById('compose-to')?.value || '').trim();
      const cc = (document.getElementById('compose-cc')?.value || '').trim();
      const bcc = (document.getElementById('compose-bcc')?.value || '').trim();
      const su = (document.getElementById('compose-subject')?.value || '').trim();
      const body = (document.getElementById('compose-body')?.value || '').trim();

      const url =
        `https://mail.google.com/mail/u/${slot}/?view=cm&fs=1` +
        `&to=${encodeURIComponent(to)}` +
        (cc ? `&cc=${encodeURIComponent(cc)}` : '') +
        (bcc ? `&bcc=${encodeURIComponent(bcc)}` : '') +
        `&su=${encodeURIComponent(su)}` +
        `&body=${encodeURIComponent(body)}`;

      browser.tabs.create({ url });
      P.setDrawerOpen(composeDrawer, false);
    });

    document.getElementById('btn-compose-send')?.addEventListener('click', async () => {
      const fromSelect = document.getElementById('compose-from');
      const selectedOpt = fromSelect?.options?.[fromSelect.selectedIndex];
      const slot = parseInt(fromSelect?.value || '0', 10) || 0;
      const accountEmail = selectedOpt?.getAttribute('data-email') || '';
      const isDemo = selectedOpt?.getAttribute('data-demo') === '1';

      const to = (document.getElementById('compose-to')?.value || '').trim();
      const cc = (document.getElementById('compose-cc')?.value || '').trim();
      const bcc = (document.getElementById('compose-bcc')?.value || '').trim();
      const su = (document.getElementById('compose-subject')?.value || '').trim();
      const body = (document.getElementById('compose-body')?.value || '').trim();

      if (!to) {
        P.showToast('Please enter a recipient in the "To" field');
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
          res = await P.sendEmailViaFirstPartyGmailFrame(composePayload);
          if (res && res.ok) {
            const rec = await browser.runtime.sendMessage({
              type: 'RECORD_SENT_EMAIL',
              payload: composePayload
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
          const toEl = document.getElementById('compose-to');
          const ccEl = document.getElementById('compose-cc');
          const bccEl = document.getElementById('compose-bcc');
          const subEl = document.getElementById('compose-subject');
          const bodyEl = document.getElementById('compose-body');
          if (toEl) toEl.value = '';
          if (ccEl) ccEl.value = '';
          if (bccEl) bccEl.value = '';
          if (subEl) subEl.value = '';
          if (bodyEl) bodyEl.value = '';
          P.setDrawerOpen(composeDrawer, false);
          P.showToast(`✓ Email sent directly to ${to}!`);
        } else {
          P.setComposeDrawerMode('embed');
          P.showToast('Loaded inside Embedded Gmail Composer — click Send below!');
        }
      } catch (_) {
        P.setComposeDrawerMode('embed');
        P.showToast('Loaded inside Embedded Gmail Composer — click Send below!');
      } finally {
        if (sendBtn) sendBtn.disabled = false;
        if (sendLbl) sendLbl.textContent = 'Send Email Now';
      }
    });
  };
})(typeof window !== 'undefined' ? window : this);
