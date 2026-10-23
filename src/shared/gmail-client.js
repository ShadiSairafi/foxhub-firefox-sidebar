/**
 * PocketMail — 100% Local Multi-Account Gmail Engine
 * Supports:
 * 1. Multi-Session Auto-Discovery (u/0 .. u/5) via Gmail Atom Feed + Local Session Tokens
 * 2. Interactive Google Account Sign-In ("Add Account" popup flow via accounts.google.com/AddSession)
 * 3. Optional Local OAuth 2.0 Flow (browser.identity.launchWebAuthFlow with user's Client ID)
 * 4. Instant Actions: Mark Read/Unread, Trash/Delete, Archive, Star, Spam, Full Thread Reader, Quick Reply
 */

(function (global) {
  const ACCOUNT_COLORS = [
    '#D95032', // Terracotta
    '#2E6F53', // Botanical Sage
    '#2B6CB0', // Aegean Blue
    '#C8526C', // Rosewood Blossom
    '#C86D22', // Tuscan Ochre
    '#6B4E9B'  // Wisteria Plum
  ];

  const LABEL_FEEDS = {
    'inbox': '',
    'primary': '^smartlabel_personal',
    'important': 'important',
    'starred': 'starred',
    'social': '^smartlabel_social',
    'promotions': '^smartlabel_promo',
    'updates': '^smartlabel_notification'
  };

  /**
   * Smart 1-Click OTP / 2FA Verification Code Extractor
   * Detects 4–8 digit or G-XXXXXX verification codes in subject/snippet/body
   */
  function extractVerificationCode(subject = '', snippet = '') {
    const combined = `${subject} ${snippet}`;
    const hasKeyword = /\b(code|verification|verify|otp|passcode|security|sign-in|signin|login|auth|confirm|pin|steam guard)\b/i.test(combined);
    if (!hasKeyword) return null;

    // Match Google style G-123456
    const gMatch = combined.match(/\b(G-\d{5,8})\b/i);
    if (gMatch) return gMatch[1];

    // Match 5-8 digit standalone verification code (avoiding years 2010-2030 or prices)
    const numMatches = combined.match(/\b(\d{5,8})\b/g);
    if (numMatches && numMatches.length > 0) {
      return numMatches[0];
    }

    // Match 4-digit code if explicitly preceded by "code:" or "code is"
    const fourDigit = combined.match(/\bcode(?:\s+is|\s*[:=-])?\s*(\d{4})\b/i);
    if (fourDigit) return fourDigit[1];

    return null;
  }
  function decToHexId(decStr) {
    try {
      if (!decStr) return '';
      return BigInt(decStr).toString(16);
    } catch (e) {
      return decStr;
    }
  }

  /**
   * Extract hex message/thread ID from Atom <link href="..."> or <id>
   */
  function extractHexId(linkHref, tagId) {
    if (linkHref) {
      const match = linkHref.match(/[?&]message_id=([0-9a-fA-F]+)/);
      if (match && match[1]) return match[1];
    }
    if (tagId) {
      const parts = tagId.split(':');
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) {
        return decToHexId(last);
      }
      return last;
    }
    return 'msg_' + Math.random().toString(36).slice(2, 10);
  }

  /**
   * Parse Gmail Atom XML Feed into structured account & messages data
   */
  function parseAtomFeed(xmlText, slotIndex, accountConfig = {}) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');

    if (doc.querySelector('parsererror')) {
      throw new Error('Invalid XML feed response');
    }

    const titleEl = doc.querySelector('feed > title');
    const titleText = titleEl ? titleEl.textContent : '';
    const emailMatch = titleText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const email = emailMatch ? emailMatch[1].toLowerCase() : (accountConfig.email || `account_${slotIndex}@gmail.com`);

    const fullCountEl = doc.querySelector('feed > fullcount');
    const rawFullCount = fullCountEl ? parseInt(fullCountEl.textContent, 10) : 0;

    const entries = Array.from(doc.querySelectorAll('feed > entry'));
    const messages = entries.map((entry) => {
      const subject = (entry.querySelector('title')?.textContent || '(No subject)').trim();
      const summary = (entry.querySelector('summary')?.textContent || '').trim();
      const issued = entry.querySelector('issued')?.textContent || entry.querySelector('modified')?.textContent || new Date().toISOString();
      const linkEl = entry.querySelector('link');
      const linkHref = linkEl ? linkEl.getAttribute('href') : '';
      const tagId = entry.querySelector('id')?.textContent || '';
      const hexId = extractHexId(linkHref, tagId);

      const authorName = (entry.querySelector('author > name')?.textContent || '').trim();
      const authorEmail = (entry.querySelector('author > email')?.textContent || '').trim();

      return {
        id: `${email}:${hexId}`,
        threadId: hexId,
        accountEmail: email,
        accountSlot: slotIndex,
        accountType: 'session',
        subject: subject || '(No subject)',
        snippet: summary,
        otpCode: extractVerificationCode(subject, summary),
        senderName: authorName || authorEmail.split('@')[0] || 'Unknown Sender',
        senderEmail: authorEmail,
        timestamp: new Date(issued).getTime() || Date.now(),
        isoDate: issued,
        webUrl: `https://mail.google.com/mail/u/${slotIndex}/#inbox/${hexId}`,
        unread: true
      };
    });

    return {
      email,
      slotIndex,
      unreadCount: isNaN(rawFullCount) ? messages.length : rawFullCount,
      messages
    };
  }

  /**
   * Fetch Atom feed for a specific Google session slot (/u/0, /u/1, etc.)
   */
  async function fetchSessionSlotFeed(slotIndex = 0, labelKey = 'inbox') {
    const feedSuffix = LABEL_FEEDS[labelKey] !== undefined ? LABEL_FEEDS[labelKey] : labelKey;
    const encodedLabel = feedSuffix ? `/${encodeURIComponent(feedSuffix)}` : '';
    const url = `https://mail.google.com/mail/u/${slotIndex}/feed/atom${encodedLabel}?_=${Date.now()}`;

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/atom+xml,application/xml,text/xml'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    if (!text.includes('<feed') && !text.includes('</feed>')) {
      throw new Error('Not logged into Gmail for this slot');
    }

    return parseAtomFeed(text, slotIndex);
  }

  /**
   * Discover all signed-in Gmail session accounts across slots u/0 .. u/5
   */
  async function discoverSessionAccounts(maxSlots = 5, accountSettingsMap = {}) {
    const discovered = [];
    const seenEmails = new Set();

    const slotPromises = [];
    for (let slot = 0; slot < maxSlots; slot++) {
      slotPromises.push(
        (async () => {
          try {
            // Check if user configured a specific label for this slot/account
            const prelim = await fetchSessionSlotFeed(slot, 'inbox');
            const customSetting = accountSettingsMap[prelim.email] || {};
            if (customSetting.disabled) return null;

            let result = prelim;
            if (customSetting.label && customSetting.label !== 'inbox') {
              try {
                result = await fetchSessionSlotFeed(slot, customSetting.label);
              } catch (_) {
                result = prelim;
              }
            }
            return result;
          } catch (_) {
            return null;
          }
        })()
      );
    }

    const results = await Promise.all(slotPromises);
    for (const res of results) {
      if (res && res.email && !seenEmails.has(res.email)) {
        seenEmails.add(res.email);
        discovered.push(res);
      }
    }

    return discovered;
  }

  /**
   * Retrieve GMAIL_AT action token and ik user key for a session slot
   */
  const tokenCache = {}; // email -> { at, ik, expiresAt }

  async function getSessionTokens(slotIndex, accountEmail) {
    const cached = tokenCache[accountEmail];
    if (cached && cached.at && cached.expiresAt > Date.now()) {
      return cached;
    }

    let atToken = null;
    let ikToken = cached?.ik || null;

    // 1. Check browser cookies for GMAIL_AT
    if (typeof browser !== 'undefined' && browser.cookies) {
      try {
        const cookies = await browser.cookies.getAll({ domain: 'mail.google.com', name: 'GMAIL_AT' });
        const slotPath = `/mail/u/${slotIndex}`;
        const exactCookie = cookies.find((c) => c.path && c.path.startsWith(slotPath)) || cookies[0];
        if (exactCookie && exactCookie.value) {
          atToken = exactCookie.value;
        }
      } catch (e) {
        console.warn('Cookie lookup warning:', e);
      }
    }

    // 2. If ikToken or atToken is missing, fetch the Gmail bootstrap page to extract GLOBALS / ik / GMAIL_AT
    if (!atToken || !ikToken) {
      try {
        const resp = await fetch(`https://mail.google.com/mail/u/${slotIndex}/?ui=2`, {
          method: 'GET',
          credentials: 'include'
        });
        if (resp.ok) {
          const html = await resp.text();
          // Extract ik: in GLOBALS array, ik is a 10-char hex/alphanumeric string right before the email address
          if (accountEmail) {
            const escapedEmail = accountEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const ikRegex = new RegExp(`"([a-f0-9]{8,14})"\\s*,\\s*"${escapedEmail}"`, 'i');
            const ikMatch = html.match(ikRegex);
            if (ikMatch && ikMatch[1]) {
              ikToken = ikMatch[1];
            }
          }
          if (!ikToken) {
            const fallbackIk = html.match(/["']ik["']\s*:\s*["']([a-zA-Z0-9_-]{8,14})["']/);
            if (fallbackIk) ikToken = fallbackIk[1];
          }
          if (!atToken) {
            const atMatch = html.match(/GM_ACTION_TOKEN\s*=\s*["']([^"']+)["']/) ||
                            html.match(/["']at["']\s*:\s*["']([^"']{15,})["']/);
            if (atMatch && atMatch[1]) {
              atToken = atMatch[1];
            }
          }
        }

        // Re-check cookies after visiting /mail/u/{slotIndex}/
        if (!atToken && typeof browser !== 'undefined' && browser.cookies) {
          const cookiesAfter = await browser.cookies.getAll({ domain: 'mail.google.com', name: 'GMAIL_AT' });
          const slotPath = `/mail/u/${slotIndex}`;
          const exactCookie = cookiesAfter.find((c) => c.path && c.path.startsWith(slotPath)) || cookiesAfter[0];
          if (exactCookie && exactCookie.value) {
            atToken = exactCookie.value;
          }
        }
      } catch (e) {
        console.warn('Bootstrap token extraction warning:', e);
      }
    }

    const result = {
      at: atToken,
      ik: ikToken,
      expiresAt: Date.now() + 15 * 60 * 1000
    };
    if (accountEmail) {
      tokenCache[accountEmail] = result;
    }
    return result;
  }

  /**
   * Perform an instant email action on a Gmail session account
   * Actions:
   * - markRead: 'rd'
   * - markUnread: 'ur'
   * - deleteTrash: 'tr'
   * - archive: 'rc_^i' (or 'arch')
   * - star: 'st'
   * - unstar: 'xst'
   * - spam: 'sp'
   */
  async function executeSessionAction(slotIndex, accountEmail, threadHexId, actionType) {
    const actionMap = {
      markRead: 'rd',
      markUnread: 'ur',
      deleteTrash: 'tr',
      archive: 'rc_^i',
      star: 'st',
      unstar: 'xst',
      spam: 'sp'
    };

    const actCode = actionMap[actionType] || actionType;
    const { at, ik } = await getSessionTokens(slotIndex, accountEmail);

    if (!at) {
      return { ok: false, reason: 'missing_at_token' };
    }

    const params = new URLSearchParams();
    params.set('ui', '2');
    if (ik) params.set('ik', ik);
    params.set('view', 'up');
    params.set('act', actCode);
    params.set('at', at);
    params.set('t', threadHexId);
    params.set('rt', 'j');

    const url = `https://mail.google.com/mail/u/${slotIndex}/?${params.toString()}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: `t=${encodeURIComponent(threadHexId)}`
      });
      return { ok: response.ok, status: response.status };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Fetch full email HTML/text content for the in-popup Reader View
   */
  async function fetchFullEmailContent(message) {
    if (message.isDemo) {
      return {
        html: message.demoHtml || `<p>${message.snippet}</p>`,
        plainText: message.fullText || message.snippet
      };
    }

    // If OAuth account
    if (message.accountType === 'oauth' && message.oauthAccessToken) {
      return fetchOAuthMessageBody(message.threadId, message.oauthAccessToken);
    }

    // Session account: Try Gmail Print View (?ui=2&ik=...&view=pt&search=all&th=...)
    const slot = message.accountSlot || 0;
    const { ik } = await getSessionTokens(slot, message.accountEmail);

    if (ik) {
      try {
        const ptUrl = `https://mail.google.com/mail/u/${slot}/?ui=2&ik=${encodeURIComponent(ik)}&view=pt&search=all&th=${encodeURIComponent(message.threadId)}`;
        const resp = await fetch(ptUrl, { credentials: 'include' });
        if (resp.ok) {
          const rawHtml = await resp.text();
          const cleaned = sanitizeGmailPrintHtml(rawHtml);
          if (cleaned && cleaned.plainText.length > 10) {
            return cleaned;
          }
        }
      } catch (e) {
        console.warn('Print view fetch fallback:', e);
      }
    }

    // Fallback to clean formatted snippet view
    const escapedSnippet = (message.snippet || 'No preview available.')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return {
      html: `<div class="pm-reader-fallback-body"><p>${escapedSnippet}</p></div>`,
      plainText: message.snippet || ''
    };
  }

  /**
   * Clean and sanitize Gmail's Print View HTML so it renders safely & beautifully inside the popup
   * Strips the redundant Gmail print-view logo header and duplicate subject/sender rows,
   * fixes relative URLs, and detects Unsubscribe links + OTP codes.
   */
  function sanitizeGmailPrintHtml(rawHtml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    // Remove unsafe tags
    doc.querySelectorAll('script, meta, iframe, object, embed, link').forEach((el) => el.remove());

    // Find the actual email message body inside Gmail's print view structure
    let bodyContainer = doc.querySelector('.bodycontainer') || doc.body;
    if (!bodyContainer) return null;

    // Strip the top Gmail print-view logo table and duplicate subject table if present
    const mainContent = bodyContainer.querySelector('.maincontent');
    if (mainContent) {
      // Remove top <hr> and duplicate subject table before table.message
      Array.from(mainContent.children).forEach((child) => {
        if (child.tagName === 'HR') {
          child.remove();
        } else if (child.tagName === 'TABLE' && !child.classList.contains('message')) {
          child.remove();
        }
      });

      // Inside each table.message, the first rows contain the duplicate sender/recipient/date header
      // while the last row contains the actual email content
      mainContent.querySelectorAll('table.message').forEach((msgTable) => {
        const rows = Array.from(msgTable.querySelectorAll(':scope > tbody > tr, :scope > tr'));
        if (rows.length >= 2) {
          // Keep only rows that contain the actual message body (skip sender & To:/Reply-To: rows)
          for (let i = 0; i < rows.length - 1; i++) {
            rows[i].remove();
          }
        }
      });

      bodyContainer = mainContent;
    }

    // Detect 1-Click Unsubscribe link inside the email
    let unsubscribeUrl = null;
    // Fix relative URLs and make all links open safely
    bodyContainer.querySelectorAll('a').forEach((a) => {
      let href = a.getAttribute('href') || '';
      if (href.startsWith('//')) {
        href = 'https:' + href;
        a.setAttribute('href', href);
      } else if (href.startsWith('/')) {
        href = 'https://mail.google.com' + href;
        a.setAttribute('href', href);
      }
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');

      const linkText = (a.textContent || '').trim().toLowerCase();
      if (
        !unsubscribeUrl &&
        href.startsWith('http') &&
        (linkText.includes('unsubscribe') ||
          linkText.includes('opt out') ||
          linkText.includes('opt-out') ||
          linkText.includes('email preferences') ||
          linkText.includes('manage subscriptions') ||
          /unsubscribe|optout|opt-out/i.test(href))
      ) {
        unsubscribeUrl = href;
      }
    });

    // Fix protocol-relative or root-relative images
    bodyContainer.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (src.startsWith('//')) {
        img.setAttribute('src', 'https:' + src);
      } else if (src.startsWith('/')) {
        img.setAttribute('src', 'https://mail.google.com' + src);
      }
    });

    const plainText = (bodyContainer.innerText || bodyContainer.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();

    const otpCode = extractVerificationCode('', plainText);

    return {
      html: bodyContainer.innerHTML,
      plainText,
      unsubscribeUrl,
      otpCode
    };
  }

  /**
   * Optional Local OAuth 2.0 Flow (100% local via browser.identity.launchWebAuthFlow)
   * Lets users connect any Google account using their own local OAuth Client ID
   */
  async function launchLocalGoogleOAuth(clientId) {
    if (!clientId) {
      throw new Error('Please provide a Google OAuth Client ID or use the Instant Google Account Sign-In button.');
    }
    if (typeof browser === 'undefined' || !browser.identity) {
      throw new Error('browser.identity API is not available.');
    }

    const redirectUri = browser.identity.getRedirectURL();
    const scopes = [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ].join(' ');

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId.trim());
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('prompt', 'select_account consent');

    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true
    });

    const hashParams = new URLSearchParams(responseUrl.split('#')[1] || '');
    const accessToken = hashParams.get('access_token');
    const expiresIn = parseInt(hashParams.get('expires_in') || '3600', 10);

    if (!accessToken) {
      throw new Error('No access_token returned from Google OAuth flow.');
    }

    // Fetch user profile email
    const profileResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!profileResp.ok) {
      throw new Error('Failed to fetch Google user profile.');
    }
    const profile = await profileResp.json();

    return {
      email: profile.email.toLowerCase(),
      name: profile.name || profile.email.split('@')[0],
      picture: profile.picture || '',
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
      accountType: 'oauth'
    };
  }

  /**
   * Fetch unread messages for an OAuth-connected account
   */
  async function fetchOAuthAccountFeed(oauthAccount) {
    const headers = { Authorization: `Bearer ${oauthAccount.accessToken}` };
    const listResp = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread+in:inbox&maxResults=20',
      { headers }
    );
    if (!listResp.ok) {
      throw new Error(`OAuth Gmail API HTTP ${listResp.status}`);
    }
    const listData = await listResp.json();
    const rawItems = listData.messages || [];

    const detailed = await Promise.all(
      rawItems.slice(0, 15).map(async (item) => {
        try {
          const msgResp = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers }
          );
          if (!msgResp.ok) return null;
          const msgData = await msgResp.json();
          const hdrs = msgData.payload?.headers || [];
          const getHdr = (name) => hdrs.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

          const fromRaw = getHdr('From');
          const emailMatch = fromRaw.match(/<([^>]+)>/);
          const senderEmail = emailMatch ? emailMatch[1] : fromRaw;
          const senderName = fromRaw.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || senderEmail;

          return {
            id: `${oauthAccount.email}:${item.id}`,
            threadId: item.threadId || item.id,
            messageId: item.id,
            accountEmail: oauthAccount.email,
            accountSlot: 0,
            accountType: 'oauth',
            oauthAccessToken: oauthAccount.accessToken,
            subject: getHdr('Subject') || '(No subject)',
            snippet: msgData.snippet || '',
            senderName,
            senderEmail,
            timestamp: parseInt(msgData.internalDate || Date.now(), 10),
            isoDate: new Date(parseInt(msgData.internalDate || Date.now(), 10)).toISOString(),
            webUrl: `https://mail.google.com/mail/u/${encodeURIComponent(oauthAccount.email)}/#inbox/${item.threadId || item.id}`,
            unread: true
          };
        } catch (_) {
          return null;
        }
      })
    );

    const validMessages = detailed.filter(Boolean);
    return {
      email: oauthAccount.email,
      slotIndex: oauthAccount.email,
      accountType: 'oauth',
      unreadCount: listData.resultSizeEstimate || validMessages.length,
      messages: validMessages
    };
  }

  async function fetchOAuthMessageBody(messageId, accessToken) {
    const resp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!resp.ok) throw new Error('Failed to fetch OAuth message body');
    const data = await resp.json();

    function findPart(payload, mime) {
      if (!payload) return null;
      if (payload.mimeType === mime && payload.body?.data) {
        return payload.body.data;
      }
      if (payload.parts) {
        for (const p of payload.parts) {
          const found = findPart(p, mime);
          if (found) return found;
        }
      }
      return null;
    }

    function decodeBase64Url(str) {
      try {
        const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        return decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
      } catch (e) {
        return '';
      }
    }

    const htmlData = findPart(data.payload, 'text/html');
    const textData = findPart(data.payload, 'text/plain');
    const html = htmlData ? decodeBase64Url(htmlData) : `<p>${decodeBase64Url(textData || '') || data.snippet}</p>`;
    const plainText = textData ? decodeBase64Url(textData) : (data.snippet || '');

    return { html, plainText };
  }

  async function executeOAuthAction(oauthAccount, messageId, actionType) {
    const headers = {
      Authorization: `Bearer ${oauthAccount.accessToken}`,
      'Content-Type': 'application/json'
    };

    if (actionType === 'deleteTrash') {
      const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`, {
        method: 'POST',
        headers
      });
      return { ok: r.ok };
    }

    const body = { addLabelIds: [], removeLabelIds: [] };
    if (actionType === 'markRead') body.removeLabelIds.push('UNREAD');
    if (actionType === 'markUnread') body.addLabelIds.push('UNREAD');
    if (actionType === 'archive') body.removeLabelIds.push('INBOX');
    if (actionType === 'star') body.addLabelIds.push('STARRED');
    if (actionType === 'unstar') body.removeLabelIds.push('STARRED');
    if (actionType === 'spam') {
      body.addLabelIds.push('SPAM');
      body.removeLabelIds.push('INBOX');
    }

    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    return { ok: r.ok };
  }

  /**
   * Encode string to UTF-8 safe base64url for RFC 2822 email sending
   */
  function encodeBase64UrlUtf8(str) {
    const utf8Bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * 100% Local Direct Email Send (Compose & Quick Reply)
   * Sends directly from the user's Firefox browser to their signed-in Gmail account
   * with zero external servers.
   */
  async function sendEmailDirect(payload = {}, oauthAccount = null) {
    const {
      slotIndex = 0,
      accountEmail = '',
      to = '',
      cc = '',
      bcc = '',
      subject = '',
      body = '',
      threadId = '',
      isDemo = false
    } = payload;

    if (!to || !to.trim()) {
      return { ok: false, error: 'Please enter a recipient email address.' };
    }

    if (isDemo) {
      return { ok: true, method: 'demo' };
    }

    // 1. If OAuth 2.0 account is connected with gmail.modify / gmail.send scope
    if (oauthAccount && oauthAccount.accessToken) {
      try {
        const mimeLines = [
          `From: ${accountEmail || oauthAccount.email}`,
          `To: ${to.trim()}`
        ];
        if (cc && cc.trim()) mimeLines.push(`Cc: ${cc.trim()}`);
        if (bcc && bcc.trim()) mimeLines.push(`Bcc: ${bcc.trim()}`);
        mimeLines.push(`Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject || '(No subject)')))}?=`);
        mimeLines.push('MIME-Version: 1.0');
        mimeLines.push('Content-Type: text/plain; charset="UTF-8"');
        mimeLines.push('Content-Transfer-Encoding: 8bit');
        mimeLines.push('');
        mimeLines.push(body || '');

        const raw = encodeBase64UrlUtf8(mimeLines.join('\r\n'));
        const reqBody = { raw };
        if (threadId) reqBody.threadId = threadId;

        const oauthResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${oauthAccount.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(reqBody)
        });
        if (oauthResp.ok) {
          return { ok: true, method: 'oauth' };
        }
      } catch (e) {
        console.warn('OAuth direct send fallback to session:', e);
      }
    }

    // 2. Direct Local Gmail Session Send (ui=2&act=sm)
    const { at, ik } = await getSessionTokens(slotIndex, accountEmail);
    if (at) {
      try {
        const query = new URLSearchParams();
        query.set('ui', '2');
        if (ik) query.set('ik', ik);
        query.set('view', 'up');
        query.set('act', 'sm');
        query.set('at', at);
        query.set('rt', 'j');

        const form = new URLSearchParams();
        if (accountEmail) form.set('from', accountEmail);
        form.set('to', to.trim());
        form.set('cc', (cc || '').trim());
        form.set('bcc', (bcc || '').trim());
        form.set('subject', subject || '');
        form.set('body', body || '');
        form.set('ishtml', '0');
        if (threadId) {
          form.set('th', threadId);
          form.set('rm', threadId);
        }

        const sendUrl = `https://mail.google.com/mail/u/${slotIndex}/?${query.toString()}`;
        const resp = await fetch(sendUrl, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
          },
          body: form.toString()
        });

        if (resp.ok) {
          const text = await resp.text();
          // Verify response didn't return an auth redirect page
          if (!text.includes('accounts.google.com/ServiceLogin')) {
            return { ok: true, method: 'session-ui2' };
          }
        }
      } catch (e) {
        console.warn('Session ui=2 send warning:', e);
      }

      // 3. Fallback: Gmail Basic HTML Session POST (/mail/u/{slot}/h/?v=b&pv=tl&cs=b)
      try {
        const basicForm = new URLSearchParams();
        basicForm.set('at', at);
        basicForm.set('to', to.trim());
        basicForm.set('cc', (cc || '').trim());
        basicForm.set('bcc', (bcc || '').trim());
        basicForm.set('subject', subject || '');
        basicForm.set('body', body || '');
        basicForm.set('nvp_bu_send', 'Send');

        const basicUrl = `https://mail.google.com/mail/u/${slotIndex}/h/${Math.random().toString(36).slice(2, 10)}/?v=b&pv=tl&cs=b`;
        const basicResp = await fetch(basicUrl, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
          },
          body: basicForm.toString()
        });
        if (basicResp.ok) {
          return { ok: true, method: 'session-basic' };
        }
      } catch (e) {
        console.warn('Basic HTML send fallback warning:', e);
      }
    }

    return {
      ok: false,
      reason: 'session_token_unavailable',
      error: 'Could not verify Gmail action token. Switch to "Embedded Gmail" tab above to send directly inside this drawer!'
    };
  }

  /**
   * Sample / Sandbox Accounts for testing themes, TTS voice reading, & multi-account switcher
   */
  function getSampleAccountsData() {
    const now = Date.now();
    return [
      {
        email: 'studio@warmcraft.design',
        nickname: 'Design Studio',
        slotIndex: 0,
        accountType: 'demo',
        color: '#D95032',
        unreadCount: 3,
        messages: [
          {
            id: 'demo:1',
            threadId: '18f9a1001',
            accountEmail: 'studio@warmcraft.design',
            accountSlot: 0,
            accountType: 'demo',
            isDemo: true,
            subject: ' Ceramic glaze samples & linen swatches for Friday',
            snippet: 'Hi! I left the new warm terracotta and sage linen samples on the studio table. Let me know which background texture feels coziest to you!',
            fullText: 'Hi! I left the new warm terracotta and sage linen samples on the studio table. We tested eight different natural paper palettes and made sure none of them look cold or sci-fi. Let me know which background texture feels coziest to you!',
            demoHtml: `<div style="line-height:1.65;"><p>Hi there,</p><p>I left the new <strong>warm terracotta</strong> and <strong>botanical sage linen</strong> samples on the studio table this morning.</p><p>We tested all eight natural paper palettes and illustrated backgrounds so you can switch between them anytime with a single click. Everything stays 100% locally in your browser with zero external servers.</p><p>Warmly,<br/><strong>Clara Vance</strong><br/>Material &amp; Tactile Design Lead</p></div>`,
            senderName: 'Clara Vance',
            senderEmail: 'clara@warmcraft.design',
            timestamp: now - 8 * 60 * 1000,
            unread: true,
            starred: true,
            webUrl: 'https://mail.google.com/mail/u/0/#inbox'
          },
          {
            id: 'demo:2',
            threadId: '18f9a1002',
            accountEmail: 'studio@warmcraft.design',
            accountSlot: 0,
            accountType: 'demo',
            isDemo: true,
            subject: 'Your artisan roast order #4082 has shipped',
            snippet: 'Good news! Your bag of single-origin Ethiopian Yirgacheffe whole bean coffee has been roasted this morning and is on its way.',
            fullText: 'Good news! Your bag of single-origin Ethiopian Yirgacheffe whole bean coffee was roasted this morning and is on its way. Expected delivery: Tomorrow by 2:00 PM.',
            demoHtml: `<div style="line-height:1.65;"><p>Good morning!</p><p>Your bag of single-origin <strong>Ethiopian Yirgacheffe</strong> whole bean coffee was roasted two hours ago and is on its way to you.</p><ul><li>Roast Level: Medium-Light Honey Process</li><li>Tasting Notes: Bergamot, Peach, Warm Jasmine</li><li>Expected Arrival: Tomorrow afternoon</li></ul><p>Enjoy your brew,<br/><strong>Hearthside Roasters</strong></p></div>`,
            senderName: 'Hearthside Coffee',
            senderEmail: 'orders@hearthside.coffee',
            timestamp: now - 42 * 60 * 1000,
            unread: true,
            starred: false,
            webUrl: 'https://mail.google.com/mail/u/0/#inbox'
          },
          {
            id: 'demo:3',
            threadId: '18f9a1003',
            accountEmail: 'studio@warmcraft.design',
            accountSlot: 0,
            accountType: 'demo',
            isDemo: true,
            subject: 'Weekend botanical garden passes attached',
            snippet: 'Here are two passes for the Saturday morning conservatory walk. Don’t forget to bring your sketchbook!',
            fullText: 'Here are two passes for the Saturday morning conservatory walk at 10:00 AM. The Japanese maple courtyard is in full autumn color right now. Don’t forget to bring your sketchbook!',
            demoHtml: `<div style="line-height:1.65;"><p>Hey!</p><p>Here are our two passes for the Saturday morning conservatory walk at 10:00 AM. The Japanese maple courtyard and glasshouse ferns look incredible right now.</p><p>See you by the fountain!<br/><strong>Liam</strong></p></div>`,
            senderName: 'Liam Mercer',
            senderEmail: 'liam.mercer@botanical.org',
            timestamp: now - 3 * 3600 * 1000,
            unread: true,
            starred: false,
            webUrl: 'https://mail.google.com/mail/u/0/#inbox'
          }
        ]
      },
      {
        email: 'personal.journal@gmail.com',
        nickname: 'Personal Inbox',
        slotIndex: 1,
        accountType: 'demo',
        color: '#2E6F53',
        unreadCount: 2,
        messages: [
          {
            id: 'demo:4',
            threadId: '18f9a1004',
            accountEmail: 'personal.journal@gmail.com',
            accountSlot: 1,
            accountType: 'demo',
            isDemo: true,
            subject: 'Flight itinerary to Florence & Siena',
            snippet: 'Booking confirmed! Departure Oct 28 at 09:40 AM. Window seat 14A reserved on both legs.',
            fullText: 'Booking confirmed! Your autumn trip to Florence and Siena is all set. Departure October 28 at 09:40 AM, window seat 14A reserved.',
            demoHtml: `<div style="line-height:1.65;"><p>Buongiorno!</p><p>Your reservation to <strong>Florence (FLR)</strong> is confirmed.</p><p><strong>Seat:</strong> 14A (Window)<br/><strong>Villa Check-in:</strong> 3:00 PM in San Gimignano</p></div>`,
            senderName: 'Viajero Travel',
            senderEmail: 'concierge@viajero.travel',
            timestamp: now - 6 * 3600 * 1000,
            unread: true,
            starred: true,
            webUrl: 'https://mail.google.com/mail/u/1/#inbox'
          },
          {
            id: 'demo:5',
            threadId: '18f9a1005',
            accountEmail: 'personal.journal@gmail.com',
            accountSlot: 1,
            accountType: 'demo',
            isDemo: true,
            subject: 'Book club notes: The Wind-Up Bird Chronicle',
            snippet: 'We are meeting at the corner bakery this Thursday at 6:30 PM. Cinnamon rolls are on me!',
            fullText: 'We are meeting at the corner bakery this Thursday at 6:30 PM to talk about chapters 12 through 18. Cinnamon rolls are on me!',
            demoHtml: `<div style="line-height:1.65;"><p>Hi everyone,</p><p>Just a cozy reminder that we’re meeting at <strong>Tartine &amp; Tea</strong> this Thursday at 6:30 PM. Fresh cardamom and cinnamon knots are on me!</p><p>Best,<br/><strong>Nora</strong></p></div>`,
            senderName: 'Nora Lindqvist',
            senderEmail: 'nora@bookclub.local',
            timestamp: now - 19 * 3600 * 1000,
            unread: true,
            starred: false,
            webUrl: 'https://mail.google.com/mail/u/1/#inbox'
          }
        ]
      }
    ];
  }

  global.PocketMailGmailClient = {
    ACCOUNT_COLORS,
    LABEL_FEEDS,
    extractVerificationCode,
    fetchSessionSlotFeed,
    discoverSessionAccounts,
    getSessionTokens,
    executeSessionAction,
    fetchFullEmailContent,
    launchLocalGoogleOAuth,
    fetchOAuthAccountFeed,
    executeOAuthAction,
    sendEmailDirect,
    getSampleAccountsData
  };
})(typeof window !== 'undefined' ? window : this);
