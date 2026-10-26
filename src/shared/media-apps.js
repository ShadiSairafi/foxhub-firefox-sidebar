/**
 * PocketMail — Opera-Style Sidebar Media & Social Apps Catalog
 * Provides built-in presets for Instagram, WhatsApp, Discord, Telegram, Spotify,
 * YouTube, TikTok, X, Messenger, Reddit, Twitch, and ChatGPT, plus custom user apps.
 * Uses 100% DOM createElementNS for SVG icons (zero innerHTML, 100% CSP-safe).
 */

const BUILTIN_MEDIA_APPS = [
  {
    id: 'instagram',
    name: 'Instagram',
    color: '#E1306C',
    gradient: 'linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%)',
    defaultUrl: 'https://www.instagram.com/direct/inbox/',
    preferFullSession: true,
    subViews: [
      { label: 'DMs', url: 'https://www.instagram.com/direct/inbox/', icon: 'messages' },
      { label: 'Reels', url: 'https://www.instagram.com/reels/', icon: 'reels' },
      { label: 'Feed', url: 'https://www.instagram.com/', icon: 'home' },
      { label: 'Explore', url: 'https://www.instagram.com/explore/', icon: 'explore' },
      { label: 'Profile', url: 'https://www.instagram.com/profile', icon: 'profile' }
    ]
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    color: '#25D366',
    gradient: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
    defaultUrl: 'https://web.whatsapp.com/',
    preferFullSession: true,
    subViews: [
      { label: 'Chats', url: 'https://web.whatsapp.com/', icon: 'messages' }
    ]
  },
  {
    id: 'discord',
    name: 'Discord',
    color: '#5865F2',
    gradient: 'linear-gradient(135deg, #5865F2 0%, #4752C4 100%)',
    defaultUrl: 'https://discord.com/channels/@me',
    preferFullSession: true,
    subViews: [
      { label: 'DMs', url: 'https://discord.com/channels/@me', icon: 'messages' },
      { label: 'Friends', url: 'https://discord.com/channels/@me', icon: 'users' },
      { label: 'Nitro', url: 'https://discord.com/store', icon: 'explore' }
    ]
  },
  {
    id: 'telegram',
    name: 'Telegram',
    color: '#26A5E4',
    gradient: 'linear-gradient(135deg, #37AEE2 0%, #1E96C8 100%)',
    defaultUrl: 'https://web.telegram.org/k/',
    preferFullSession: true,
    subViews: [
      { label: 'Telegram K', url: 'https://web.telegram.org/k/', icon: 'messages' },
      { label: 'Telegram A', url: 'https://web.telegram.org/a/', icon: 'home' }
    ]
  },
  {
    id: 'spotify',
    name: 'Spotify',
    color: '#1DB954',
    gradient: 'linear-gradient(135deg, #1DB954 0%, #15883e 100%)',
    defaultUrl: 'https://open.spotify.com/',
    preferFullSession: true,
    subViews: [
      { label: 'Player', url: 'https://open.spotify.com/', icon: 'home' },
      { label: 'Search', url: 'https://open.spotify.com/search', icon: 'search' },
      { label: 'Library', url: 'https://open.spotify.com/collection/playlists', icon: 'library' },
      { label: 'Log In', url: 'https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F', icon: 'profile' }
    ]
  },
  {
    id: 'youtube',
    name: 'YouTube',
    color: '#FF0000',
    gradient: 'linear-gradient(135deg, #FF0000 0%, #CC0000 100%)',
    defaultUrl: 'https://www.youtube.com/',
    preferFullSession: false,
    subViews: [
      { label: 'Home', url: 'https://www.youtube.com/', icon: 'home' },
      { label: 'Shorts', url: 'https://www.youtube.com/shorts', icon: 'reels' },
      { label: 'Subs', url: 'https://www.youtube.com/feed/subscriptions', icon: 'users' },
      { label: 'YT Music', url: 'https://music.youtube.com/', icon: 'music' },
      { label: 'Library', url: 'https://www.youtube.com/feed/you', icon: 'library' }
    ]
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    color: '#FE2C55',
    gradient: 'linear-gradient(135deg, #25F4EE 0%, #000000 48%, #FE2C55 100%)',
    defaultUrl: 'https://www.tiktok.com/foryou',
    preferFullSession: true,
    subViews: [
      { label: 'For You', url: 'https://www.tiktok.com/foryou', icon: 'home' },
      { label: 'Explore', url: 'https://www.tiktok.com/explore', icon: 'explore' },
      { label: 'Following', url: 'https://www.tiktok.com/following', icon: 'users' },
      { label: 'Messages', url: 'https://www.tiktok.com/messages', icon: 'messages' },
      { label: 'Profile', url: 'https://www.tiktok.com/profile', icon: 'profile' }
    ]
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    color: '#1D9BF0',
    gradient: 'linear-gradient(135deg, #14171A 0%, #1D9BF0 100%)',
    defaultUrl: 'https://x.com/home',
    preferFullSession: true,
    subViews: [
      { label: 'Home', url: 'https://x.com/home', icon: 'home' },
      { label: 'Explore', url: 'https://x.com/explore', icon: 'search' },
      { label: 'Alerts', url: 'https://x.com/notifications', icon: 'alerts' },
      { label: 'Messages', url: 'https://x.com/messages', icon: 'messages' },
      { label: 'Profile', url: 'https://x.com/profile', icon: 'profile' }
    ]
  },
  {
    id: 'messenger',
    name: 'Messenger',
    color: '#0084FF',
    gradient: 'linear-gradient(135deg, #00B2FF 0%, #006AFF 50%, #9b37ff 100%)',
    defaultUrl: 'https://www.messenger.com/',
    preferFullSession: true,
    subViews: [
      { label: 'Chats', url: 'https://www.messenger.com/', icon: 'messages' },
      { label: 'Requests', url: 'https://www.messenger.com/requests', icon: 'alerts' },
      { label: 'Archive', url: 'https://www.messenger.com/archived', icon: 'library' }
    ]
  },
  {
    id: 'reddit',
    name: 'Reddit',
    color: '#FF4500',
    gradient: 'linear-gradient(135deg, #FF5700 0%, #FF4500 100%)',
    defaultUrl: 'https://www.reddit.com/',
    preferFullSession: false,
    subViews: [
      { label: 'Home', url: 'https://www.reddit.com/', icon: 'home' },
      { label: 'Popular', url: 'https://www.reddit.com/r/popular/', icon: 'explore' },
      { label: 'Chat', url: 'https://chat.reddit.com/', icon: 'messages' }
    ]
  },
  {
    id: 'twitch',
    name: 'Twitch',
    color: '#9146FF',
    gradient: 'linear-gradient(135deg, #9146FF 0%, #6441a5 100%)',
    defaultUrl: 'https://www.twitch.tv/',
    preferFullSession: false,
    subViews: [
      { label: 'Live', url: 'https://www.twitch.tv/', icon: 'home' },
      { label: 'Following', url: 'https://www.twitch.tv/directory/following', icon: 'users' },
      { label: 'Browse', url: 'https://www.twitch.tv/directory', icon: 'explore' }
    ]
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    color: '#10A37F',
    gradient: 'linear-gradient(135deg, #10A37F 0%, #0E8A6C 100%)',
    defaultUrl: 'https://chatgpt.com/',
    preferFullSession: true,
    subViews: [
      { label: 'New Chat', url: 'https://chatgpt.com/', icon: 'messages' }
    ]
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    color: '#4E82EE',
    gradient: 'linear-gradient(135deg, #4E82EE 0%, #9B72CB 52%, #D96570 100%)',
    defaultUrl: 'https://gemini.google.com/app',
    preferFullSession: true,
    subViews: [
      { label: 'Chat', url: 'https://gemini.google.com/app', icon: 'messages' },
      { label: 'Gems', url: 'https://gemini.google.com/gems/view', icon: 'explore' }
    ]
  }
];

let lastKnownCustomApps = [];

function getFallbackFaviconUrl(pageUrl) {
  try {
    const u = new URL(pageUrl);
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(u.origin)}`;
  } catch (_) {
    return '';
  }
}

/**
 * Fetches a website's HTML <head> and extracts its highest-quality <link rel="icon"> / <link rel="apple-touch-icon"> URL
 */
async function fetchWebsiteIconFromHtml(pageUrl) {
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return '';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(pageUrl, {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal
    });
    clearTimeout(timer);
    const baseUrl = res.url || pageUrl;
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = Array.from(
      doc.querySelectorAll(
        'link[rel*="icon" i], link[rel*="apple-touch-icon" i], link[rel="mask-icon" i]'
      )
    );

    let bestHref = '';
    let bestScore = -1;

    for (const link of links) {
      const rawHref = (link.getAttribute('href') || '').trim();
      if (!rawHref || rawHref.startsWith('javascript:')) continue;
      const rel = (link.getAttribute('rel') || '').toLowerCase();
      const type = (link.getAttribute('type') || '').toLowerCase();
      const sizes = (link.getAttribute('sizes') || '').toLowerCase();

      let score = 10;
      if (rel.includes('apple-touch-icon')) score += 45;
      if (type.includes('svg') || rawHref.endsWith('.svg')) score += 50;
      if (type.includes('png') || rawHref.includes('.png')) score += 25;
      if (sizes.includes('any')) score += 40;
      const sizeMatch = sizes.match(/(\d+)x(\d+)/);
      if (sizeMatch) {
        const dim = parseInt(sizeMatch[1], 10) || 0;
        if (dim >= 32 && dim <= 256) score += 35;
        else if (dim > 256) score += 20;
      }

      if (score > bestScore) {
        try {
          bestHref = new URL(rawHref, baseUrl).href;
          bestScore = score;
        } catch (_) {}
      }
    }

    if (bestHref) return bestHref;
  } catch (_) {}

  return getFallbackFaviconUrl(pageUrl);
}

const DEFAULT_ENABLED_APP_IDS = [
  'instagram',
  'whatsapp',
  'discord',
  'telegram',
  'spotify',
  'youtube',
  'tiktok',
  'x',
  'messenger',
  'reddit'
];

function createSvgElement(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

/**
 * Creates a crisp, CSP-safe vector SVG icon for any built-in or custom media app
 */
function createAppSvgIcon(appId, size = 18) {
  const svg = createSvgElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none'
  });

  switch (appId) {
    case 'pocketmail': {
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2.1');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(createSvgElement('rect', { x: 2, y: 4, width: 20, height: 16, rx: 3 }));
      svg.appendChild(createSvgElement('polyline', { points: '22,6 12,13 2,6' }));
      break;
    }
    case 'instagram': {
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(createSvgElement('rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5.5 }));
      svg.appendChild(createSvgElement('circle', { cx: 12, cy: 12, r: 4.3 }));
      svg.appendChild(createSvgElement('circle', { cx: 17.5, cy: 6.5, r: 1, fill: 'currentColor' }));
      break;
    }
    case 'whatsapp': {
      svg.appendChild(createSvgElement('path', {
        fill: 'currentColor',
        d: 'M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm5.82 14.01c-.24.68-1.41 1.3-1.95 1.38-.5.08-1.13.11-1.83-.11-.42-.13-.97-.31-1.66-.61-2.92-1.26-4.83-4.21-4.98-4.4-.15-.2-1.19-1.58-1.19-3.01 0-1.43.75-2.13 1.01-2.42.27-.29.59-.36.79-.36.2 0 .4 0 .57.01.18.01.43-.07.67.51.24.58.82 2 .89 2.15.07.15.12.32.02.52-.1.2-.15.32-.3.49-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.35 1.45.29.15.46.12.63-.07.17-.2.74-.86.94-1.16.2-.29.39-.24.66-.15.27.1 1.71.81 2 .95.29.15.49.22.56.34.07.12.07.71-.17 1.39z'
      }));
      break;
    }
    case 'discord': {
      svg.appendChild(createSvgElement('path', {
        fill: 'currentColor',
        d: 'M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z'
      }));
      break;
    }
    case 'telegram': {
      svg.appendChild(createSvgElement('path', {
        fill: 'currentColor',
        d: 'M20.66 3.72L2.95 10.55c-1.21.48-1.2 1.16-.22 1.46l4.55 1.42 10.53-6.64c.5-.3.96-.14.58.19l-8.53 7.7-.31 4.69c.46 0 .66-.21.92-.46l2.21-2.15 4.59 3.39c.85.47 1.46.23 1.67-.78L22 5.08c.31-1.24-.47-1.8-1.34-1.36z'
      }));
      break;
    }
    case 'spotify': {
      svg.appendChild(createSvgElement('path', {
        fill: 'currentColor',
        d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.59 14.42c-.18.3-.56.39-.86.21-2.35-1.43-5.3-1.76-8.78-.96-.33.08-.67-.13-.75-.47-.08-.33.13-.67.47-.75 3.81-.87 7.08-.5 9.71 1.11.3.18.39.56.21.86zm1.22-2.72c-.23.37-.71.49-1.08.26-2.69-1.65-6.79-2.13-9.97-1.17-.41.12-.85-.11-.98-.52-.12-.41.11-.85.52-.98 3.63-1.1 8.15-.57 11.25 1.34.37.22.49.7.26 1.07zm.11-2.83C14.7 8.95 9.37 8.77 6.29 9.71c-.49.15-1.02-.13-1.17-.62-.15-.49.13-1.02.62-1.17 3.54-1.07 9.43-.86 13.14 1.34.45.26.6.84.33 1.29-.26.44-.84.59-1.29.32z'
      }));
      break;
    }
    case 'youtube': {
      svg.appendChild(createSvgElement('path', {
        fill: 'currentColor',
        d: 'M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z'
      }));
      break;
    }
    case 'tiktok': {
      svg.appendChild(createSvgElement('path', {
        fill: 'currentColor',
        d: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z'
      }));
      break;
    }
    case 'x': {
      svg.appendChild(createSvgElement('path', {
        fill: 'currentColor',
        d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'
      }));
      break;
    }
    case 'messenger': {
      svg.appendChild(createSvgElement('path', {
        fill: 'currentColor',
        d: 'M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.02.57.61.94 1.13.71l1.99-.88c.17-.08.36-.1.55-.06.91.25 1.87.38 2.87.38 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2zm6 7.46l-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.34-1.75a.6.6 0 0 0-.72 0l-3.16 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.34 1.75a.6.6 0 0 0 .72 0l3.16-2.4c.42-.32.97.18.69.63z'
      }));
      break;
    }
    case 'reddit': {
      svg.appendChild(createSvgElement('path', {
        fill: 'currentColor',
        d: 'M22 11.78a2.65 2.65 0 0 0-4.53-1.87c-1.78-1.18-4.18-1.93-6.84-2.02l1.4-4.4 3.79.89a2 2 0 1 0 .25-1.22l-4.38-1.03a.64.64 0 0 0-.75.43l-1.69 5.31c-2.76.06-5.25.81-7.08 2.01A2.65 2.65 0 0 0 .62 13.9a2.68 2.68 0 0 0 .97 1.12c-.03.27-.05.55-.05.83 0 3.79 4.68 6.86 10.46 6.86s10.46-3.07 10.46-6.86c0-.28-.02-.56-.05-.83A2.65 2.65 0 0 0 22 11.78zM7.47 13.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm8.41 5.47c-1.02 1.02-2.97 1.1-3.88 1.1s-2.86-.08-3.88-1.1a.56.56 0 0 1 .79-.79c.64.64 2.09.87 3.09.87s2.45-.23 3.09-.87a.56.56 0 0 1 .79.79zm-.35-2.47a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z'
      }));
      break;
    }
    case 'twitch': {
      svg.appendChild(createSvgElement('path', {
        fill: 'currentColor',
        d: 'M4.26 3L3 6.28v13.14h4.5V22h2.53l2.53-2.58h3.8L21 14.79V3H4.26zm14.87 10.97l-2.85 2.85h-4.5l-2.53 2.53v-2.53H5.43V4.82h13.7v9.15zM15.3 7.9h1.9v5.4h-1.9V7.9zm-5.1 0h1.9v5.4h-1.9V7.9z'
      }));
      break;
    }
    case 'chatgpt': {
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(createSvgElement('path', { d: 'M12 2a4.5 4.5 0 0 0-3.89 2.25L4.5 10.5a4.5 4.5 0 0 0 0 4.5l3.61 6.25a4.5 4.5 0 0 0 7.78 0l3.61-6.25a4.5 4.5 0 0 0 0-4.5L15.89 4.25A4.5 4.5 0 0 0 12 2z' }));
      svg.appendChild(createSvgElement('circle', { cx: 12, cy: 12, r: 3 }));
      break;
    }
    case 'gemini': {
      svg.appendChild(createSvgElement('path', {
        fill: 'currentColor',
        d: 'M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z'
      }));
      break;
    }
    default: {
      // Check if this is a user-added Custom Website / Media App with a real favicon or HTML <link rel="icon">
      const customApp = lastKnownCustomApps.find((a) => a.id === appId);
      if (customApp && customApp.defaultUrl) {
        const lowerUrl = (customApp.defaultUrl || '').toLowerCase();
        const primaryIconUrl = customApp.iconUrl || getFallbackFaviconUrl(customApp.defaultUrl);
        if (primaryIconUrl) {
          const wrap = document.createElement('span');
          wrap.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;`;
          const img = document.createElement('img');
          img.src = primaryIconUrl;
          img.alt = customApp.name || '';
          img.width = size;
          img.height = size;
          img.style.cssText = `width:${size}px;height:${size}px;border-radius:4px;object-fit:contain;display:block;`;
          let triedFallback = false;
          img.addEventListener('error', () => {
            const s2Url = getFallbackFaviconUrl(customApp.defaultUrl);
            if (!triedFallback && s2Url && img.src !== s2Url) {
              triedFallback = true;
              img.src = s2Url;
              return;
            }
            const fallbackId = lowerUrl.includes('gemini.google.com') ? 'gemini' : '__fallback_globe__';
            wrap.replaceChildren(createAppSvgIcon(fallbackId, size));
          });
          wrap.appendChild(img);
          return wrap;
        }
      }
      // Custom site globe / media fallback icon
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(createSvgElement('circle', { cx: 12, cy: 12, r: 9.5 }));
      svg.appendChild(createSvgElement('line', { x1: 2.5, y1: 12, x2: 21.5, y2: 12 }));
      svg.appendChild(createSvgElement('path', { d: 'M12 2.5a14.5 14.5 0 0 1 0 19 14.5 14.5 0 0 1 0-19' }));
      break;
    }
  }

  return svg;
}

/**
 * Creates a crisp vector SVG icon for bottom-bar subview tabs (Home, Messages, Explore, Reels, Search, Library, Profile, etc.)
 */
function createSubViewIcon(iconKey = 'home', size = 15) {
  const svg = createSvgElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2.1',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  });

  switch (iconKey) {
    case 'home':
      svg.appendChild(createSvgElement('path', { d: 'M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z' }));
      break;
    case 'messages':
      svg.appendChild(createSvgElement('path', { d: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' }));
      break;
    case 'reels':
      svg.appendChild(createSvgElement('rect', { x: 2, y: 2, width: 20, height: 20, rx: 4 }));
      svg.appendChild(createSvgElement('polygon', { points: '10 8 16 12 10 16 10 8', fill: 'currentColor' }));
      break;
    case 'explore':
      svg.appendChild(createSvgElement('circle', { cx: 12, cy: 12, r: 10 }));
      svg.appendChild(createSvgElement('polygon', { points: '16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76' }));
      break;
    case 'search':
      svg.appendChild(createSvgElement('circle', { cx: 11, cy: 11, r: 8 }));
      svg.appendChild(createSvgElement('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }));
      break;
    case 'users':
      svg.appendChild(createSvgElement('path', { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }));
      svg.appendChild(createSvgElement('circle', { cx: 9, cy: 7, r: 4 }));
      svg.appendChild(createSvgElement('path', { d: 'M23 21v-2a4 4 0 0 0-3-3.87' }));
      svg.appendChild(createSvgElement('path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }));
      break;
    case 'alerts':
      svg.appendChild(createSvgElement('path', { d: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9' }));
      svg.appendChild(createSvgElement('path', { d: 'M13.73 21a2 2 0 0 1-3.46 0' }));
      break;
    case 'library':
      svg.appendChild(createSvgElement('path', { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' }));
      svg.appendChild(createSvgElement('path', { d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' }));
      break;
    case 'music':
      svg.appendChild(createSvgElement('path', { d: 'M9 18V5l12-2v13' }));
      svg.appendChild(createSvgElement('circle', { cx: 6, cy: 18, r: 3 }));
      svg.appendChild(createSvgElement('circle', { cx: 18, cy: 16, r: 3 }));
      break;
    case 'speaker-play':
    case 'speaker-unmute':
      svg.appendChild(createSvgElement('polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' }));
      svg.appendChild(createSvgElement('path', { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' }));
      svg.appendChild(createSvgElement('path', { d: 'M19.07 4.93a10 10 0 0 1 0 14.14' }));
      break;
    case 'speaker-mute':
      svg.appendChild(createSvgElement('polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' }));
      svg.appendChild(createSvgElement('line', { x1: 23, y1: 9, x2: 17, y2: 15 }));
      svg.appendChild(createSvgElement('line', { x1: 17, y1: 9, x2: 23, y2: 15 }));
      break;
    case 'headphones':
      svg.appendChild(createSvgElement('path', { d: 'M3 18v-6a9 9 0 0 1 18 0v6' }));
      svg.appendChild(createSvgElement('path', { d: 'M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z' }));
      break;
    case 'audio-wave':
      svg.appendChild(createSvgElement('line', { x1: 4, y1: 10, x2: 4, y2: 14 }));
      svg.appendChild(createSvgElement('line', { x1: 8, y1: 6, x2: 8, y2: 18 }));
      svg.appendChild(createSvgElement('line', { x1: 12, y1: 3, x2: 12, y2: 21 }));
      svg.appendChild(createSvgElement('line', { x1: 16, y1: 7, x2: 16, y2: 17 }));
      svg.appendChild(createSvgElement('line', { x1: 20, y1: 10, x2: 20, y2: 14 }));
      break;
    case 'check':
      svg.appendChild(createSvgElement('polyline', { points: '20 6 9 17 4 12' }));
      break;
    case 'bolt':
      svg.appendChild(createSvgElement('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' }));
      break;
    case 'eco-leaf':
    case 'leaf':
      svg.appendChild(createSvgElement('path', { d: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z' }));
      svg.appendChild(createSvgElement('path', { d: 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12' }));
      break;
    case 'rocket':
      svg.appendChild(createSvgElement('path', { d: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z' }));
      svg.appendChild(createSvgElement('path', { d: 'm12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z' }));
      svg.appendChild(createSvgElement('path', { d: 'M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0' }));
      svg.appendChild(createSvgElement('path', { d: 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5' }));
      break;
    case 'drag-grip':
      [
        [9, 5],
        [9, 12],
        [9, 19],
        [15, 5],
        [15, 12],
        [15, 19]
      ].forEach(([cx, cy]) => {
        svg.appendChild(createSvgElement('circle', { cx, cy, r: 1.5, fill: 'currentColor', stroke: 'none' }));
      });
      break;
    case 'profile':
    default:
      svg.appendChild(createSvgElement('path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }));
      svg.appendChild(createSvgElement('circle', { cx: 12, cy: 7, r: 4 }));
      break;
  }

  return svg;
}

function mapCustomApps(settings = {}) {
  const customApps = Array.isArray(settings.customMediaApps)
    ? settings.customMediaApps.map((c, idx) => ({
        id: c.id || `custom-${idx}`,
        name: c.name || 'Custom App',
        color: c.color || '#C85A32',
        gradient: `linear-gradient(135deg, ${c.color || '#C85A32'}, #7B52AB)`,
        defaultUrl: c.url || 'https://',
        iconUrl: c.iconUrl || '',
        preferFullSession: true,
        isCustom: true,
        enabled: c.enabled !== false,
        subViews: [{ label: 'Home', url: c.url || 'https://', icon: 'home' }]
      }))
    : [];
  lastKnownCustomApps = customApps;
  return customApps;
}

function sortAppsByUserOrder(appsList, settings = {}) {
  const order = Array.isArray(settings.mediaAppsOrder) ? settings.mediaAppsOrder : [];
  if (order.length === 0) return appsList;
  const rankMap = new Map();
  order.forEach((id, idx) => rankMap.set(id, idx));
  return [...appsList].sort((a, b) => {
    const ra = rankMap.has(a.id) ? rankMap.get(a.id) : 10000 + appsList.indexOf(a);
    const rb = rankMap.has(b.id) ? rankMap.get(b.id) : 10000 + appsList.indexOf(b);
    return ra - rb;
  });
}

function getOrderedBuiltInApps(settings = {}) {
  return sortAppsByUserOrder(BUILTIN_MEDIA_APPS, settings);
}

/**
 * Returns the active list of media apps configured & ordered by the user
 */
function getActiveMediaApps(settings = {}) {
  const enabledIds = Array.isArray(settings.enabledMediaApps)
    ? settings.enabledMediaApps
    : DEFAULT_ENABLED_APP_IDS;

  const builtInActive = BUILTIN_MEDIA_APPS.filter((app) => enabledIds.includes(app.id));
  const customApps = mapCustomApps(settings).filter((app) => app.enabled !== false);

  return sortAppsByUserOrder([...builtInActive, ...customApps], settings);
}

function getAppById(appId, settings = {}) {
  const customApps = mapCustomApps(settings);
  const all = [...BUILTIN_MEDIA_APPS, ...customApps];
  return all.find((a) => a.id === appId) || BUILTIN_MEDIA_APPS[0];
}

function detectAppByUrl(urlStr = '', settings = {}) {
  const lower = (urlStr || '').toLowerCase();
  if (lower.includes('instagram.com')) return getAppById('instagram', settings);
  if (lower.includes('whatsapp.com')) return getAppById('whatsapp', settings);
  if (lower.includes('discord.com')) return getAppById('discord', settings);
  if (lower.includes('telegram.org')) return getAppById('telegram', settings);
  if (lower.includes('spotify.com')) return getAppById('spotify', settings);
  if (lower.includes('youtube.com')) return getAppById('youtube', settings);
  if (lower.includes('tiktok.com')) return getAppById('tiktok', settings);
  if (lower.includes('x.com') || lower.includes('twitter.com')) return getAppById('x', settings);
  if (lower.includes('messenger.com')) return getAppById('messenger', settings);
  if (lower.includes('reddit.com')) return getAppById('reddit', settings);
  if (lower.includes('twitch.tv')) return getAppById('twitch', settings);
  if (lower.includes('chatgpt.com') || lower.includes('openai.com')) return getAppById('chatgpt', settings);

  const customs = Array.isArray(settings.customMediaApps) ? settings.customMediaApps : [];
  for (let i = 0; i < customs.length; i++) {
    try {
      const host = new URL(customs[i].url).hostname.replace(/^www\./, '');
      if (host && lower.includes(host)) {
        return getAppById(customs[i].id || `custom-${i}`, settings);
      }
    } catch (_) {}
  }
  return null;
}

window.PocketMailMediaApps = {
  BUILTIN_MEDIA_APPS,
  DEFAULT_ENABLED_APP_IDS,
  createAppSvgIcon,
  createSubViewIcon,
  fetchWebsiteIconFromHtml,
  getFallbackFaviconUrl,
  getOrderedBuiltInApps,
  getActiveMediaApps,
  getAppById,
  detectAppByUrl
};
