/**
 * FoxHub Background — Multi-Account Gmail Sync, Optimistic Overlay, Snooze Scheduler & Login Watcher
 */

(function (global) {
  const bg = (global.FoxHubBg = global.FoxHubBg || {});

  async function recordSentEmailInOverlay(payload = {}) {
    const to = (payload.to || '').trim();
    if (!to) return null;
    const slotIndex = Number(payload.slotIndex) || 0;
    const cs = bg.state.cachedState;
    const s = bg.state.currentSettings;
    const matchedAcc =
      (cs.accounts || []).find(
        (a) =>
          (payload.accountEmail && a.email === payload.accountEmail) ||
          (!payload.accountEmail && Number(a.slotIndex) === slotIndex)
      ) || cs.accounts?.[0] || null;
    const email = payload.accountEmail || matchedAcc?.email || `account_${slotIndex}@gmail.com`;
    const cfg = (s.accountConfigs && s.accountConfigs[email]) || {};
    const color = cfg.color || matchedAcc?.color || '#D95032';
    const nickname = cfg.nickname || matchedAcc?.nickname || '';
    const now = Date.now();

    const sentEntry = {
      id: `sent:${email}:${now}:${Math.random().toString(36).slice(2, 7)}`,
      threadId: payload.threadId || `sent_${now}`,
      accountEmail: email,
      accountSlot: slotIndex,
      accountType: matchedAcc?.accountType || 'session',
      accountColor: color,
      accountNickname: nickname,
      senderName: `To: ${to}`,
      senderEmail: to,
      recipientEmail: to,
      cc: (payload.cc || '').trim(),
      bcc: (payload.bcc || '').trim(),
      subject: (payload.subject || '').trim() || '(No subject)',
      snippet: (payload.body || '').replace(/\s+/g, ' ').trim().slice(0, 220),
      fullText: payload.body || '',
      timestamp: now,
      isoDate: new Date(now).toISOString(),
      webUrl: `https://mail.google.com/mail/u/${slotIndex}/#sent`,
      unread: false,
      isSent: true
    };

    const overlay = bg.state.localOverlay;
    if (!Array.isArray(overlay.sentMessages)) {
      overlay.sentMessages = [];
    }
    overlay.sentMessages.unshift(sentEntry);
    if (overlay.sentMessages.length > 100) {
      overlay.sentMessages.length = 100;
    }
    if (!Array.isArray(cs.sentMessages)) {
      cs.sentMessages = [];
    }
    cs.sentMessages = [
      sentEntry,
      ...cs.sentMessages.filter((m) => m && m.id !== sentEntry.id)
    ].slice(0, 100);
    await bg.saveOverlay();
    await browser.storage.local.set({ cachedState: cs });
    bg.broadcastStateUpdated();
    return sentEntry;
  }

  function applyOverlayToAccounts(rawAccounts) {
    const now = Date.now();
    const s = bg.state.currentSettings;
    const overlay = bg.state.localOverlay;
    let totalUnread = 0;

    const processedAccounts = rawAccounts.map((acc, idx) => {
      const cfg = (s.accountConfigs && s.accountConfigs[acc.email]) || {};
      const color =
        cfg.color ||
        acc.color ||
        global.PocketMailGmailClient.ACCOUNT_COLORS[idx % global.PocketMailGmailClient.ACCOUNT_COLORS.length];
      const nickname = cfg.nickname || acc.nickname || '';
      const label = cfg.label || 'inbox';

      let removedCount = 0;
      const processedMessages = (acc.messages || [])
        .filter((msg) => {
          if (msg.timestamp) {
            if (overlay.trashedIds[msg.id] && msg.timestamp > overlay.trashedIds[msg.id] + 2000) {
              delete overlay.trashedIds[msg.id];
            }
            if (overlay.archivedIds[msg.id] && msg.timestamp > overlay.archivedIds[msg.id] + 2000) {
              delete overlay.archivedIds[msg.id];
            }
            if (overlay.readIds[msg.id] && msg.timestamp > overlay.readIds[msg.id] + 2000) {
              delete overlay.readIds[msg.id];
            }
          }
          if (overlay.trashedIds[msg.id] || overlay.archivedIds[msg.id]) {
            removedCount++;
            return false;
          }
          const snoozeEntry = overlay.snoozed[msg.id];
          if (snoozeEntry && snoozeEntry.wakeAt > now) {
            removedCount++;
            return false;
          }
          return true;
        })
        .map((msg) => {
          const isReadLocally = Boolean(overlay.readIds[msg.id]);
          if (isReadLocally) removedCount++;
          const cachedFull = bg.resolvedOtpCache.get(msg.id);
          const isCacheFresh = Boolean(
            cachedFull && cachedFull.timestamp === msg.timestamp && now - (cachedFull.fetchedAt || 0) < 8000
          );
          const effectiveFullText = isCacheFresh ? cachedFull.fullText || msg.fullText || '' : '';
          const effectiveSnippet = isCacheFresh && cachedFull.latestSnippet ? cachedFull.latestSnippet : msg.snippet;
          const recomputedOtp =
            (isCacheFresh && cachedFull.otpCode) ||
            global.PocketMailGmailClient.extractVerificationCode(msg.subject, effectiveFullText || effectiveSnippet);
          return {
            ...msg,
            snippet: effectiveSnippet,
            fullText: effectiveFullText || undefined,
            otpCode: recomputedOtp || null,
            unread: !isReadLocally,
            starred: overlay.starredIds[msg.id] !== undefined ? overlay.starredIds[msg.id] : Boolean(msg.starred),
            accountColor: color,
            accountNickname: nickname
          };
        });

      const unreadMessagesCount = processedMessages.filter((m) => m.unread).length;
      const rawFullCount = Math.max(unreadMessagesCount, Math.max(0, (acc.unreadCount || 0) - removedCount));
      const displayUnread = s.badgeCountMode === 'total' ? rawFullCount : unreadMessagesCount;

      if (!cfg.disabled) {
        totalUnread += displayUnread;
      }

      return {
        ...acc,
        color,
        nickname,
        label,
        disabled: Boolean(cfg.disabled),
        unreadCount: displayUnread,
        totalGmailUnread: rawFullCount,
        messages: processedMessages
      };
    });

    return { accounts: processedAccounts, totalUnread };
  }

  async function syncAllAccounts(options = {}) {
    const s = bg.state.currentSettings;
    const overlay = bg.state.localOverlay;
    try {
      const maxSlots = s.maxSessionSlots || 5;
      const sessionAccounts = await global.PocketMailGmailClient.discoverSessionAccounts(
        maxSlots,
        s.accountConfigs || {}
      );

      const oauthResults = [];
      if (Array.isArray(s.oauthAccounts) && s.oauthAccounts.length > 0) {
        for (const oa of s.oauthAccounts) {
          try {
            const feed = await global.PocketMailGmailClient.fetchOAuthAccountFeed(oa);
            if (!sessionAccounts.some((sa) => sa.email === feed.email)) {
              oauthResults.push(feed);
            }
          } catch (e) {
            console.warn('OAuth account sync warning for', oa.email, e);
          }
        }
      }

      let combinedRaw = [...sessionAccounts, ...oauthResults];
      let usingDemo = false;

      if (s.demoMode === 'on' || (s.demoMode === 'auto' && combinedRaw.length === 0)) {
        const demoAccounts = global.PocketMailGmailClient.getSampleAccountsData();
        combinedRaw = [...combinedRaw, ...demoAccounts];
        usingDemo = true;
      }

      const { accounts, totalUnread } = applyOverlayToAccounts(combinedRaw);

      const otpCandidates = [];
      accounts.forEach((acc) => {
        if (acc.disabled) return;
        (acc.messages || []).forEach((m) => {
          if (
            m.unread !== false &&
            !m.isDemo &&
            /\b(code|key|verification|verify|otp|passcode|security|sign-in|signin|login|auth|confirm|pin|steam guard|two-factor|2fa|redeem|activation)\b/i.test(
              `${m.subject || ''} ${m.snippet || ''}`
            )
          ) {
            const cached = bg.resolvedOtpCache.get(m.id);
            if (!cached || cached.timestamp !== m.timestamp || Date.now() - (cached.fetchedAt || 0) >= 8000) {
              otpCandidates.push(m);
            }
          }
        });
      });

      if (otpCandidates.length > 0) {
        otpCandidates.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        await Promise.all(
          otpCandidates.slice(0, 3).map(async (m) => {
            try {
              const fullRes = await global.PocketMailGmailClient.fetchFullEmailContent(m);
              if (fullRes) {
                bg.resolvedOtpCache.set(m.id, {
                  timestamp: m.timestamp,
                  fetchedAt: Date.now(),
                  otpCode: fullRes.otpCode || null,
                  fullText: fullRes.plainText || '',
                  latestSnippet: fullRes.latestSnippet || ''
                });
                if (fullRes.plainText) m.fullText = fullRes.plainText;
                if (fullRes.latestSnippet) m.snippet = fullRes.latestSnippet;
                if (fullRes.otpCode) m.otpCode = fullRes.otpCode;
              }
            } catch (_) {}
          })
        );
      }

      const newArrivals = [];
      const nowTs = Date.now();
      let seenIdsChanged = false;
      if (!overlay.seenIds) overlay.seenIds = {};

      accounts.forEach((acc) => {
        if (acc.disabled) return;
        (acc.messages || []).forEach((msg) => {
          const alreadySeen = bg.knownUnreadIds.has(msg.id) || Boolean(overlay.seenIds[msg.id]);
          if (!alreadySeen) {
            bg.knownUnreadIds.add(msg.id);
            overlay.seenIds[msg.id] = nowTs;
            seenIdsChanged = true;

            const ageMs = msg.timestamp ? Math.max(0, nowTs - msg.timestamp) : 0;
            const isRecentArrival = ageMs < 4 * 60 * 1000;
            const isSpamLike = /\b(viagra|casino|lottery|unclaimed reward|crypto giveaway)\b/i.test(
              `${msg.subject || ''} ${msg.snippet || ''}`
            );
            if (!bg.state.isFirstSync && msg.unread !== false && !msg.isDemo && isRecentArrival && !isSpamLike) {
              newArrivals.push(msg);
            }
          }
        });
      });

      bg.state.isFirstSync = false;
      if (seenIdsChanged) {
        bg.saveOverlay().catch(() => {});
      }

      bg.state.cachedState = {
        accounts,
        totalUnread,
        sentMessages: Array.isArray(overlay.sentMessages) ? overlay.sentMessages : [],
        lastSyncAt: nowTs,
        usingDemo,
        syncError: null
      };

      await browser.storage.local.set({ cachedState: bg.state.cachedState });
      bg.updateToolbarBadge();

      if ((newArrivals.length > 0 && !bg.isEmailNotificationsMuted()) || options.forceTestNotification) {
        const targetMsg = options.forceTestNotification
          ? (accounts[0]?.messages?.[0] || {
              senderName: 'FoxHub',
              subject: 'Your local notifications are working!',
              snippet: '100% private and local on your Firefox browser.'
            })
          : newArrivals[0];

        if (s.desktopNotifications) {
          const title =
            newArrivals.length > 1
              ? `${newArrivals.length} new emails (${targetMsg.senderName})`
              : `${targetMsg.senderName} (${targetMsg.accountNickname || targetMsg.accountEmail || ''})`;

          browser.notifications.create(`pm-msg-${Date.now()}`, {
            type: 'basic',
            iconUrl: browser.runtime.getURL('icons/icon-128.png'),
            title,
            message: `${targetMsg.subject}\n${targetMsg.snippet || ''}`.slice(0, 220)
          });
        }

        if (s.soundId !== 'none') {
          global.PocketMailSound.playNotificationSound(s.soundId, s.soundVolume, s.customAudioData);
        }

        if (s.voiceNotifications) {
          global.PocketMailSound.speakEmail(targetMsg, s);
        }
      }

      bg.broadcastStateUpdated();
      return bg.state.cachedState;
    } catch (err) {
      bg.state.cachedState.syncError = err.message;
      return bg.state.cachedState;
    }
  }

  try {
    if (browser.notifications && browser.notifications.onClicked) {
      browser.notifications.onClicked.addListener((notificationId) => {
        if (typeof notificationId === 'string' && (notificationId.startsWith('pm-msg-') || notificationId.startsWith('pm-snooze-'))) {
          browser.runtime
            .sendMessage({
              type: 'OPEN_MAIL_WORKSPACE',
              state: bg.state.cachedState,
              settings: bg.state.currentSettings
            })
            .catch(() => {});
        }
      });
    }
  } catch (_) {}

  async function checkSnoozedEmails() {
    bg.checkExpiredMuteTimers();
    const now = Date.now();
    const s = bg.state.currentSettings;
    const overlay = bg.state.localOverlay;
    let changed = false;

    for (const [id, entry] of Object.entries(overlay.snoozed)) {
      if (entry.wakeAt <= now) {
        delete overlay.snoozed[id];
        delete overlay.readIds[id];
        changed = true;

        if (!bg.isEmailNotificationsMuted() && s.desktopNotifications && entry.message) {
          browser.notifications.create(`pm-snooze-${Date.now()}`, {
            type: 'basic',
            iconUrl: browser.runtime.getURL('icons/icon-128.png'),
            title: `Snoozed Email Reminder: ${entry.message.senderName}`,
            message: entry.message.subject
          });
          if (s.soundId !== 'none') {
            global.PocketMailSound.playNotificationSound(s.soundId, s.soundVolume, s.customAudioData);
          }
        }
      }
    }

    if (changed) {
      await bg.saveOverlay();
      await syncAllAccounts();
    }
  }

  async function openGoogleAccountLoginFlow() {
    const loginUrl =
      'https://accounts.google.com/AddSession?hl=en&service=mail&continue=https%3A%2F%2Fmail.google.com%2Fmail%2F';

    const win = await browser.windows.create({
      url: loginUrl,
      type: 'popup',
      width: 520,
      height: 680
    });

    bg.state.activeLoginWindowId = win.id;
    return { ok: true, windowId: win.id };
  }

  if (browser.tabs && browser.tabs.onUpdated) {
    browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (!bg.state.activeLoginWindowId || !tab || tab.windowId !== bg.state.activeLoginWindowId) return;

      const url = changeInfo.url || tab.url || '';
      if (url.startsWith('https://mail.google.com/mail/') && changeInfo.status === 'complete') {
        const finishedWinId = bg.state.activeLoginWindowId;
        bg.state.activeLoginWindowId = null;

        if (bg.state.currentSettings.demoMode === 'on') {
          bg.state.currentSettings.demoMode = 'auto';
          await browser.storage.local.set({ settings: bg.state.currentSettings });
        }

        setTimeout(async () => {
          try {
            await browser.windows.remove(finishedWinId);
          } catch (_) {}
          await syncAllAccounts();
          if (!bg.isEmailNotificationsMuted()) {
            if (bg.state.currentSettings.soundId !== 'none') {
              global.PocketMailSound.playNotificationSound('morning-dew', bg.state.currentSettings.soundVolume);
            }
            if (bg.state.currentSettings.desktopNotifications) {
              browser.notifications.create(`pm-login-${Date.now()}`, {
                type: 'basic',
                iconUrl: browser.runtime.getURL('icons/icon-128.png'),
                title: 'Google Account Connected!',
                message: 'FoxHub has added your Gmail account locally.'
              });
            }
          }
        }, 1200);
      }
    });
  }

  if (browser.windows && browser.windows.onRemoved) {
    browser.windows.onRemoved.addListener((windowId) => {
      bg.companionWindowIds.delete(windowId);
      if (windowId === bg.state.activeLoginWindowId) {
        bg.state.activeLoginWindowId = null;
        syncAllAccounts();
      }
    });
  }

  async function handleMessageAction(message, actionType, extra = {}) {
    const msgId = message.id;
    const now = Date.now();
    const overlay = bg.state.localOverlay;

    if (actionType === 'markRead') {
      overlay.readIds[msgId] = now;
    } else if (actionType === 'markUnread') {
      delete overlay.readIds[msgId];
    } else if (actionType === 'deleteTrash') {
      overlay.trashedIds[msgId] = now;
    } else if (actionType === 'archive') {
      overlay.archivedIds[msgId] = now;
    } else if (actionType === 'star') {
      overlay.starredIds[msgId] = true;
    } else if (actionType === 'unstar') {
      overlay.starredIds[msgId] = false;
    } else if (actionType === 'spam') {
      overlay.trashedIds[msgId] = now;
    } else if (actionType === 'snooze') {
      const wakeAt = extra.wakeAt || now + 3600 * 1000;
      overlay.snoozed[msgId] = { wakeAt, message };
    } else if (actionType === 'unsnooze') {
      delete overlay.snoozed[msgId];
    }

    await bg.saveOverlay();

    const updated = applyOverlayToAccounts(bg.state.cachedState.accounts);
    bg.state.cachedState.accounts = updated.accounts;
    bg.state.cachedState.totalUnread = updated.totalUnread;
    await browser.storage.local.set({ cachedState: bg.state.cachedState });
    bg.updateToolbarBadge();

    if (!message.isDemo && !['snooze', 'unsnooze'].includes(actionType)) {
      if (message.accountType === 'oauth') {
        const oa = (bg.state.currentSettings.oauthAccounts || []).find((a) => a.email === message.accountEmail);
        if (oa) {
          await global.PocketMailGmailClient.executeOAuthAction(oa, message.messageId || message.threadId, actionType);
        }
      } else {
        await global.PocketMailGmailClient.executeSessionAction(
          message.accountSlot || 0,
          message.accountEmail,
          message.threadId,
          actionType
        );
      }
    }

    return bg.state.cachedState;
  }

  function restartPollingTimer() {
    if (bg.state.pollTimer) clearInterval(bg.state.pollTimer);
    const intervalMs = Math.max(15, bg.state.currentSettings.pollIntervalSeconds || 30) * 1000;
    bg.state.pollTimer = setInterval(() => {
      syncAllAccounts();
      checkSnoozedEmails();
    }, intervalMs);
  }

  bg.recordSentEmailInOverlay = recordSentEmailInOverlay;
  bg.applyOverlayToAccounts = applyOverlayToAccounts;
  bg.syncAllAccounts = syncAllAccounts;
  bg.checkSnoozedEmails = checkSnoozedEmails;
  bg.openGoogleAccountLoginFlow = openGoogleAccountLoginFlow;
  bg.handleMessageAction = handleMessageAction;
  bg.restartPollingTimer = restartPollingTimer;
})(window);
