/**
 * PocketMail — Sender Brand Logo & Favicon Engine
 * Renders authentic crisp SVG logos for major senders (Google, YouTube, GitHub, Discord,
 * Steam, Spotify, Amazon, Apple, Microsoft, Netflix, PayPal, LinkedIn, Reddit, Twitch, etc.)
 * + automatic high-res domain favicons for any company/service email domain,
 * + warm gradient monograms for personal contacts.
 */

(function (global) {
  const BRAND_SVGS = {
    // Official 4-color Google "G" Logo
    google: `<svg viewBox="0 0 48 48" width="24" height="24">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>`,

    youtube: `<svg viewBox="0 0 48 48" width="24" height="24">
      <path fill="#FF0000" d="M43.2 13.9c-.5-2-2.1-3.6-4.1-4.1C35.5 8.8 24 8.8 24 8.8s-11.5 0-15.1 1c-2 .5-3.6 2.1-4.1 4.1C3.8 17.5 3.8 24 3.8 24s0 6.5 1 10.1c.5 2 2.1 3.6 4.1 4.1 3.6 1 15.1 1 15.1 1s11.5 0 15.1-1c2-.5 3.6-2.1 4.1-4.1 1-3.6 1-10.1 1-10.1s0-6.5-1-10.1z"/>
      <polygon fill="#FFFFFF" points="20,30.5 30.5,24 20,17.5"/>
    </svg>`,

    github: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#24292F">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.92.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.39-3.87-1.39-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/>
    </svg>`,

    discord: `<svg viewBox="0 0 24 24" width="23" height="23" fill="#5865F2">
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.48 0 12.64 12.64 0 0 0-.62-1.25.08.08 0 0 0-.08-.04c-1.7.29-3.35.8-4.89 1.52a.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.22-2a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1-.01-.13c.13-.09.25-.19.37-.29a.08.08 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.07 0a.08.08 0 0 1 .08.01c.12.1.25.2.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.9a.08.08 0 0 0-.04.11c.36.7.77 1.37 1.22 2a.08.08 0 0 0 .09.03 19.83 19.83 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.68-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42z"/>
    </svg>`,

    microsoft: `<svg viewBox="0 0 48 48" width="22" height="22">
      <rect x="4" y="4" width="18" height="18" fill="#F25022"/>
      <rect x="26" y="4" width="18" height="18" fill="#7FBA00"/>
      <rect x="4" y="26" width="18" height="18" fill="#00A4EF"/>
      <rect x="26" y="26" width="18" height="18" fill="#FFB900"/>
    </svg>`,

    apple: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#1D1D1F">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83zM15.96 6.33c.67-.81 1.12-1.94 1-3.08-.96.04-2.13.64-2.82 1.45-.61.7-.15 1.85-1.01 2.97 1.08.08 2.16-.53 2.83-1.34z"/>
    </svg>`,

    spotify: `<svg viewBox="0 0 24 24" width="23" height="23" fill="#1DB954">
      <path d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm5.05 15.86a.68.68 0 0 1-.94.23c-2.58-1.58-5.83-1.93-9.66-1.06a.69.69 0 0 1-.31-1.34c4.19-.96 7.78-.55 10.68 1.22.33.2.43.62.23.95zm1.35-3a.86.86 0 0 1-1.18.29c-2.95-1.82-7.45-2.34-10.94-1.28a.86.86 0 1 1-.5-1.65c3.99-1.21 8.95-.62 12.34 1.46.4.25.53.78.28 1.18zm.12-3.12C15 8.64 9.17 8.45 5.79 9.48a1.03 1.03 0 1 1-.6-1.97c3.88-1.18 10.32-.95 14.39 1.47a1.03 1.03 0 0 1-1.06 1.76z"/>
    </svg>`,

    steam: `<svg viewBox="0 0 24 24" width="23" height="23" fill="#1B2838">
      <path d="M12 1a11 11 0 0 0-10.95 10.03l5.91 2.44a3.1 3.1 0 0 1 1.75-.54l2.63-3.82v-.05a4.14 4.14 0 1 1 4.14 4.14h-.1l-3.76 2.68c0 .06.01.13.01.2a3.12 3.12 0 0 1-6.17.64L1.25 14.9A11 11 0 1 0 12 1zm3.48 5.3a2.76 2.76 0 1 0 0 5.52 2.76 2.76 0 0 0 0-5.52zm-6.97 7.6a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2z"/>
    </svg>`,

    amazon: `<svg viewBox="0 0 24 24" width="23" height="23">
      <path fill="#FF9900" d="M15.9 17.6c-2.7 1.9-6.6 2.9-9.9 2.9-4.7 0-8.9-1.7-12.1-4.6-.2-.2 0-.5.3-.3 3.5 2 7.8 3.2 12.2 3.2 3 0 6.3-.6 9.3-1.9.4-.2.8.3.2.7z" transform="translate(3 -1) scale(0.85)"/>
      <text x="5" y="15" font-family="Georgia, serif" font-weight="bold" font-size="15" fill="#232F3E">a</text>
    </svg>`,

    netflix: `<svg viewBox="0 0 24 24" width="22" height="22">
      <path fill="#E50914" d="M5 2h4.2l5.6 14.2V2H19v20h-4.2L9.2 7.8V22H5V2z"/>
    </svg>`,

    linkedin: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#0A66C2">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
    </svg>`,

    reddit: `<svg viewBox="0 0 24 24" width="23" height="23" fill="#FF4500">
      <circle cx="12" cy="12" r="11" fill="#FF4500"/>
      <path fill="#FFF" d="M16.67 13.1c0-.66-.53-1.19-1.19-1.19-.32 0-.61.13-.82.34-.82-.58-1.95-.95-3.21-1l.55-2.58 1.79.38c.02.49.42.88.92.88.51 0 .92-.41.92-.92s-.41-.92-.92-.92c-.36 0-.68.21-.82.52l-2-.43a.28.28 0 0 0-.33.21l-.62 2.91c-1.29.04-2.44.41-3.27 1a1.18 1.18 0 0 0-.82-.34c-.66 0-1.19.53-1.19 1.19 0 .48.29.9.71 1.08-.02.14-.03.28-.03.42 0 2.15 2.41 3.89 5.39 3.89s5.39-1.74 5.39-3.89c0-.14-.01-.28-.03-.42.42-.19.7-.6.7-1.08z"/>
    </svg>`,

    paypal: `<svg viewBox="0 0 24 24" width="22" height="22">
      <path fill="#003087" d="M7.1 20.5H4.2L6.6 5.2c.1-.6.6-1 1.2-1h6.1c2.9 0 4.8 1.4 4.4 4.2-.4 3-2.5 4.6-5.5 4.6H9.6l-1.1 6.7c-.1.5-.5.8-1.4.8z"/>
      <path fill="#0079C1" d="M9.6 22H7.2l1.8-11.2c.1-.5.5-.8 1-.8h4.9c2.4 0 4 1.2 3.6 3.5-.4 2.5-2.1 3.8-4.6 3.8h-2.6l-.8 4.7z" opacity="0.85"/>
    </svg>`,

    twitch: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#9146FF">
      <path d="M4.3 3H21v11.7l-4.7 4.7h-3.9l-2.5 2.4H7v-2.4H3V6.2L4.3 3zm1.4 1.7v11.9h4v2.4l2.4-2.4h4.4l3-3V4.7H5.7zm9.3 3.3h1.7v4.7H15V8zm-4.7 0H12v4.7h-1.7V8z"/>
    </svg>`,

    mozilla: `<svg viewBox="0 0 48 48" width="24" height="24">
      <rect x="3" y="8" width="42" height="32" rx="7" fill="#000000"/>
      <text x="7.5" y="30" font-family="Georgia, monospace" font-weight="900" font-size="18" fill="#FFFFFF">moz://a</text>
    </svg>`,

    firefox: `<svg viewBox="0 0 48 48" width="24" height="24">
      <circle cx="24" cy="24" r="20" fill="url(#ff-grad)"/>
      <defs>
        <linearGradient id="ff-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FF9500"/>
          <stop offset="55%" stop-color="#FF3B30"/>
          <stop offset="100%" stop-color="#9B30FF"/>
        </linearGradient>
      </defs>
      <circle cx="24" cy="25" r="10" fill="#FFF4E0" opacity="0.25"/>
      <path d="M29 12c-4 1-7 4-7 9 0 4 3 7 7 7 3 0 6-2 7-5 1 6-4 13-12 13-7 0-13-6-13-13 0-6 4-11 9-13-1 2-1 4 0 6 2-3 5-4 9-4z" fill="#FFF"/>
    </svg>`,

    nba: `<svg viewBox="0 0 48 48" width="24" height="24">
      <rect x="11" y="4" width="26" height="40" rx="6" fill="#1D428A"/>
      <path d="M24 4h7a6 6 0 0 1 6 6v28a6 6 0 0 1-6 6h-7V4z" fill="#C8102E"/>
      <circle cx="24" cy="14" r="3.2" fill="#FFFFFF"/>
      <path d="M19 36c1-6 3-11 5-15 2 4 4 9 5 15" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round" fill="none"/>
    </svg>`,

    x: `<svg viewBox="0 0 24 24" width="20" height="20" fill="#111">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>`
  };

  const PERSONAL_EMAIL_DOMAINS = new Set([
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'icloud.com',
    'me.com',
    'aol.com',
    'proton.me',
    'protonmail.com'
  ]);

  function extractDomain(email) {
    const clean = String(email || '').trim().toLowerCase();
    const parts = clean.split('@');
    if (parts.length < 2) return '';
    return parts[parts.length - 1].replace(/[>)"']/g, '');
  }

  /**
   * Detect known brand key from sender email or sender name
   */
  function matchBrandKey(senderName, senderEmail) {
    const name = String(senderName || '').toLowerCase();
    const email = String(senderEmail || '').toLowerCase();
    const domain = extractDomain(email);

    if (
      domain.endsWith('youtube.com') ||
      name.includes('youtube')
    ) {
      return 'youtube';
    }
    if (
      domain.endsWith('google.com') ||
      domain === 'accounts.google.com' ||
      name === 'google' ||
      name.startsWith('google ') ||
      email.includes('no-reply@accounts.google.com')
    ) {
      return 'google';
    }
    if (domain.endsWith('github.com') || name === 'github') return 'github';
    if (domain.endsWith('discord.com') || name.includes('discord')) return 'discord';
    if (domain.endsWith('steampowered.com') || name.includes('steam')) return 'steam';
    if (domain.endsWith('spotify.com') || name.includes('spotify')) return 'spotify';
    if (domain.endsWith('microsoft.com') || name.includes('microsoft')) return 'microsoft';
    if (domain.endsWith('apple.com') || name.includes('apple')) return 'apple';
    if (domain.endsWith('amazon.com') || name.startsWith('amazon')) return 'amazon';
    if (domain.endsWith('netflix.com') || name.includes('netflix')) return 'netflix';
    if (domain.endsWith('linkedin.com') || name.includes('linkedin')) return 'linkedin';
    if (domain.endsWith('reddit.com') || domain.endsWith('redditmail.com') || name.includes('reddit')) return 'reddit';
    if (domain.endsWith('paypal.com') || name.includes('paypal')) return 'paypal';
    if (domain.endsWith('twitch.tv') || name.includes('twitch')) return 'twitch';
    if (name.includes('firefox') || name.includes('mozilla add-ons') || domain.includes('addons.mozilla.org')) return 'firefox';
    if (domain.endsWith('mozilla.org') || domain.endsWith('mozilla.com') || name.includes('mozilla')) return 'mozilla';
    if (domain.endsWith('nba.com') || name === 'nba' || name.startsWith('nba ')) return 'nba';
    if (domain.endsWith('x.com') || domain.endsWith('twitter.com')) return 'x';

    return null;
  }

  /**
   * Build HTML for a sender avatar (Brand SVG, Company Favicon with fallback, or Warm Monogram)
   */
  function renderSenderAvatarHtml(msg, initials, fallbackColor) {
    const brandKey = matchBrandKey(msg.senderName, msg.senderEmail);
    const domain = extractDomain(msg.senderEmail);

    // 1. Known crisp vector brand SVG (Google, YouTube, GitHub, Discord, Steam, etc.)
    if (brandKey && BRAND_SVGS[brandKey]) {
      return `
        <div class="pm-avatar pm-avatar-brand" title="${brandKey}">
          ${BRAND_SVGS[brandKey]}
        </div>
      `;
    }

    // 2. Any company/organization domain (not a generic personal @gmail/@yahoo/@outlook)
    // Load high-res favicon on a porcelain tile with automatic monogram fallback
    if (domain && domain.includes('.') && !PERSONAL_EMAIL_DOMAINS.has(domain) && !domain.endsWith('.local') && !domain.endsWith('.design')) {
      const rootDomain = domain.split('.').slice(-2).join('.');
      const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(rootDomain)}&sz=64`;
      return `
        <div class="pm-avatar pm-avatar-brand" data-fallback-bg="${fallbackColor}">
          <img src="${faviconUrl}" alt="" class="pm-avatar-favicon" loading="lazy" />
          <span class="pm-avatar-fallback-text" style="display:none;">${initials}</span>
        </div>
      `;
    }

    // 3. Personal contact / human sender: Warm tactile monogram
    return `
      <div class="pm-avatar" style="background:linear-gradient(135deg, ${fallbackColor}, ${ fallbackColor }dd)">
        ${initials}
      </div>
    `;
  }

  global.PocketMailSenderIcons = {
    BRAND_SVGS,
    matchBrandKey,
    renderSenderAvatarHtml
  };
})(typeof window !== 'undefined' ? window : this);
