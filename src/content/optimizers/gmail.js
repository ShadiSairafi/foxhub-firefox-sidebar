/**
 * FoxHub Per-App Optimizer — Gmail Compose & Auto-Send Helper
 */

export function initOptimizer(ctx) {
  (function setupGmailComposeHelper() {
    if (ctx.host !== 'mail.google.com') return;
    const search = window.location.search || '';
    let composeMeta = null;
    try {
      if (typeof window.name === 'string' && window.name.startsWith('pm-gmail-compose:')) {
        composeMeta = JSON.parse(window.name.slice('pm-gmail-compose:'.length));
      }
    } catch (_) {}

    const isAutoSend =
      search.includes('pm_autosend=1') ||
      window.name === 'pm-gmail-autosend-frame' ||
      (composeMeta && composeMeta.pmMode === 'autosend');
    const isComposeView =
      search.includes('view=cm') || search.includes('tf=cm') || Boolean(composeMeta) || isAutoSend;
    if (!isComposeView) return;

    const urlParams = new URLSearchParams(search);
    const targetTo = ((composeMeta && composeMeta.to) || urlParams.get('to') || '').trim();
    const targetSu = ((composeMeta && composeMeta.su) || urlParams.get('su') || '').trim();
    const targetBody = ((composeMeta && composeMeta.body) || urlParams.get('body') || '').trim();

    let autoSendAttempts = 0;
    let lastAutoSendClickAt = 0;
    let firstSawSendBtnAt = 0;
    let resultSent = false;
    let toFieldTokenizedAt = 0;

    const setNativeInputValue = (el, val) => {
      if (!el) return;
      try {
        const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
        const setter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;
        if (setter) setter.call(el, val);
        else el.value = val;
      } catch (_) {
        el.value = val;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const ensureGmailComposeFieldsPopulated = () => {
      try {
        if (targetTo) {
          const hasChip = Boolean(
            document.querySelector(
              '[data-hovercard-id*="@"], [role="option"][data-hovercard-id], .vR, .afV, div[aria-label*="Press delete to remove" i]'
            )
          );
          const toInput = document.querySelector(
            'input[aria-label="To recipients"], input[aria-label*="To" i], textarea[name="to"], input[name="to"]'
          );
          if (!hasChip && toInput && Date.now() - toFieldTokenizedAt > 900) {
            toFieldTokenizedAt = Date.now();
            toInput.focus();
            if ((toInput.value || '').trim() !== targetTo) setNativeInputValue(toInput, targetTo);
            ['keydown', 'keypress', 'keyup'].forEach((type) => {
              toInput.dispatchEvent(
                new KeyboardEvent(type, {
                  key: 'Enter',
                  code: 'Enter',
                  keyCode: 13,
                  which: 13,
                  bubbles: true,
                  cancelable: true
                })
              );
            });
            setTimeout(() => {
              try { toInput.blur(); } catch (_) {}
            }, 60);
          }
        }
        if (targetSu) {
          const suInput = document.querySelector('input[name="subjectbox"], input[aria-label="Subject"]');
          if (suInput && !(suInput.value || '').trim()) setNativeInputValue(suInput, targetSu);
        }
        if (targetBody) {
          const bodyBox = document.querySelector(
            'div[aria-label="Message Body"], div[role="textbox"][aria-label*="Body" i], div[role="textbox"][g_editable="true"]'
          );
          if (bodyBox && !(bodyBox.innerText || '').trim()) {
            bodyBox.focus();
            bodyBox.textContent = targetBody;
            bodyBox.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      } catch (_) {}
    };

    const reportComposeSendResult = (ok, reason = '') => {
      if (resultSent) return;
      resultSent = true;
      try { window.name = ''; } catch (_) {}
      ctx.notifyParent('PM_GMAIL_AUTOSEND_RESULT', { ok: Boolean(ok), reason });
    };

    try {
      if (window.wrappedJSObject && typeof exportFunction === 'function') {
        const onWindowClose = exportFunction(function () {
          reportComposeSendResult(true, 'window_close');
        }, window.wrappedJSObject);
        window.wrappedJSObject.close = onWindowClose;
      }
    } catch (_) {}

    const findGmailSendButton = () => {
      const candidates = document.querySelectorAll(
        'div[role="button"][aria-label^="Send"], div[role="button"][data-tooltip^="Send"], .T-I.J-J5-Ji.aoO.v7.T-I-atl.L3'
      );
      for (let i = 0; i < candidates.length; i++) {
        const el = candidates[i];
        const r = el.getBoundingClientRect();
        if ((r.width > 12 && r.height > 10) || el.offsetParent !== null || window.innerWidth === 0) return el;
      }
      const allBtns = document.querySelectorAll('div[role="button"]');
      for (let i = 0; i < allBtns.length; i++) {
        const el = allBtns[i];
        if ((el.textContent || '').trim() === 'Send') {
          const r = el.getBoundingClientRect();
          if ((r.width > 12 && r.height > 10) || el.offsetParent !== null || window.innerWidth === 0) return el;
        }
      }
      return null;
    };

    const triggerGmailSendAction = (sendBtn) => {
      try {
        ensureGmailComposeFieldsPopulated();
        if (document.activeElement && document.activeElement !== sendBtn && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        sendBtn.focus();
        ['mousedown', 'mouseup', 'click'].forEach((type) => {
          sendBtn.dispatchEvent(
            new MouseEvent(type, { view: window, bubbles: true, cancelable: true, buttons: 1 })
          );
        });
        if (typeof sendBtn.click === 'function') sendBtn.click();
        const bodyBox =
          document.querySelector(
            'div[aria-label="Message Body"], div[role="textbox"][aria-label*="Body" i], div[role="textbox"][g_editable="true"], div[contenteditable="true"]'
          ) || sendBtn;
        ['keydown', 'keypress', 'keyup'].forEach((type) => {
          bodyBox.dispatchEvent(
            new KeyboardEvent(type, {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              ctrlKey: true,
              metaKey: true,
              bubbles: true,
              cancelable: true
            })
          );
        });
      } catch (_) {}
    };

    document.addEventListener(
      'click',
      (e) => {
        const sendBtn = findGmailSendButton();
        if (sendBtn && e.target && (e.target === sendBtn || sendBtn.contains(e.target))) {
          setTimeout(() => reportComposeSendResult(true, 'manual_click'), 900);
        }
      },
      { capture: true, passive: true }
    );

    if (!isAutoSend) {
      [400, 900, 1600, 2600].forEach((d) => setTimeout(ensureGmailComposeFieldsPopulated, d));
      return;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (resultSent) {
        clearInterval(timer);
        return;
      }
      const now = Date.now();
      if (now - startedAt > 13000) {
        clearInterval(timer);
        reportComposeSendResult(false, 'timeout');
        return;
      }

      const bodyText = (document.body && document.body.innerText) || '';
      if (bodyText.includes('Temporary Error') || bodyText.includes('account is temporarily unavailable')) {
        clearInterval(timer);
        reportComposeSendResult(false, 'temporary_error');
        return;
      }

      const sendBtn = findGmailSendButton();
      if (sendBtn) {
        if (!firstSawSendBtnAt) firstSawSendBtnAt = now;
        ensureGmailComposeFieldsPopulated();
      }

      if (autoSendAttempts > 0) {
        const alertText = Array.from(document.querySelectorAll('[role="alert"], .bAq, .vh'))
          .map((el) => el.textContent || '')
          .join(' ');
        if (/Message sent|Sending\.\.\.|\bSent\b/i.test(alertText) || !sendBtn) {
          clearInterval(timer);
          setTimeout(() => reportComposeSendResult(true, 'sent_confirmed'), 450);
          return;
        }
      }

      if (sendBtn && firstSawSendBtnAt && now - firstSawSendBtnAt >= 650 && autoSendAttempts < 6 && now - lastAutoSendClickAt >= 850) {
        autoSendAttempts += 1;
        lastAutoSendClickAt = now;
        triggerGmailSendAction(sendBtn);
      }
    }, 150);
  })();

  return {
    appId: 'gmail',
    disablePageMemory: true,
    disableUnreadDetection: true,
    disableSmartInvert: true,

    isVisuallyPainted() {
      return Boolean(document.querySelector('main, [role="main"], form, [role="button"]'));
    }
  };
}
