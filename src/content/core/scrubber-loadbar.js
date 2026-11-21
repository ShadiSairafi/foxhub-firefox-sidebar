/**
 * FoxHub Content Core — Scrolling Video Scrubber Loadbar & Instagram Modal Video Controls
 */

const videoLoadbarConfig = {
  enabled: true,
  style: 'sunset',
  customColor: '#FF3366',
  size: 'normal',
  accentColor: '#D95032'
};

let applyVideoLoadbarVisualsNow = null;

export function updateVideoLoadbarConfig(patch = {}) {
  if (!patch || typeof patch !== 'object') return;
  if (patch.customVideoLoadbar !== undefined) {
    videoLoadbarConfig.enabled = patch.customVideoLoadbar !== false;
  }
  if (typeof patch.videoLoadbarStyle === 'string' && patch.videoLoadbarStyle) {
    videoLoadbarConfig.style = patch.videoLoadbarStyle;
  }
  if (typeof patch.videoLoadbarColor === 'string' && patch.videoLoadbarColor) {
    videoLoadbarConfig.customColor = patch.videoLoadbarColor;
  }
  if (typeof patch.videoLoadbarSize === 'string' && patch.videoLoadbarSize) {
    videoLoadbarConfig.size = patch.videoLoadbarSize;
  }
  if (typeof patch.accentColor === 'string' && patch.accentColor) {
    videoLoadbarConfig.accentColor = patch.accentColor;
  }
  if (typeof applyVideoLoadbarVisualsNow === 'function') {
    applyVideoLoadbarVisualsNow();
  }
}

export function initScrubberLoadbar(ctx) {
  if (ctx.initialSyncAccent) {
    videoLoadbarConfig.accentColor = ctx.initialSyncAccent;
  }
  if (ctx.isBgAudioFrame || ctx.isStandbyBgFrame) return;

  const isIg = ctx.hasHost('instagram.com');
  const isYt = (ctx.hasHost('youtube.com') || ctx.hasHost('youtu.be')) && !ctx.hasHost('music.youtube.com');
  const isTt = ctx.hasHost('tiktok.com');
  if (!isIg && !isYt && !isTt) return;

  let scrubberEl = null;
  let trackEl = null;
  let fillEl = null;
  let thumbEl = null;
  let tooltipEl = null;
  let isDragging = false;
  let isHovering = false;
  let dragVideo = null;
  let boundVideo = null;
  let videoResizeObs = null;
  let rafPending = false;
  let lastFindAt = 0;

  const getLoadbarStyleSpec = () => {
    const st = videoLoadbarConfig.style || 'sunset';
    const sz = videoLoadbarConfig.size || 'normal';
    const acc = videoLoadbarConfig.accentColor || '#D95032';
    const customCol = videoLoadbarConfig.customColor || '#FF3366';

    let fillBg = 'linear-gradient(90deg, #ff3366 0%, #ff6b3d 55%, #a29bfe 100%)';
    let ringCol = '#ff3366';
    if (st === 'accent') {
      fillBg = `linear-gradient(90deg, ${acc} 0%, #ff7675 60%, ${acc} 100%)`;
      ringCol = acc;
    } else if (st === 'cyber') {
      fillBg = 'linear-gradient(90deg, #00f2fe 0%, #4facfe 50%, #f093fb 100%)';
      ringCol = '#00f2fe';
    } else if (st === 'emerald') {
      fillBg = 'linear-gradient(90deg, #1DB954 0%, #00d2d3 100%)';
      ringCol = '#1DB954';
    } else if (st === 'minimal-white') {
      fillBg = '#ffffff';
      ringCol = '#ffffff';
    } else if (st === 'custom') {
      fillBg = customCol;
      ringCol = customCol;
    }

    const baseH = sz === 'slim' ? '3px' : sz === 'bold' ? '6px' : '4px';
    const hoverH = sz === 'slim' ? '6px' : sz === 'bold' ? '9px' : '7px';
    const thumbDim = sz === 'slim' ? '10px' : sz === 'bold' ? '14px' : '12px';
    return { fillBg, ringCol, baseH, hoverH, thumbDim };
  };

  const isScrollingVideoRoute = () => {
    const p = window.location.pathname || '/';
    if (isIg) {
      if (p.startsWith('/reels') || p.includes('/reel/') || p.startsWith('/p/') || p.includes('/p/')) {
        return true;
      }
      return Boolean(document.querySelector('div[role="dialog"] video, article video'));
    }
    if (isYt) {
      return p.startsWith('/shorts');
    }
    if (isTt) {
      return !p.startsWith('/messages');
    }
    return false;
  };

  const formatSec = (sec) => {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r < 10 ? '0' : ''}${r}`;
  };

  const findActiveReelVideo = () => {
    if (!isScrollingVideoRoute()) return null;
    const dialogVids = isIg ? Array.from(document.querySelectorAll('div[role="dialog"] video')) : [];
    const vids = dialogVids.length > 0 ? dialogVids : Array.from(document.querySelectorAll('video'));
    if (!vids.length) return null;
    const vh = window.innerHeight || 600;
    const vw = window.innerWidth || 420;
    let best = null;
    let bestScore = -Infinity;
    for (const v of vids) {
      let rect = v.getBoundingClientRect();
      if ((rect.width < 60 || rect.height < 60) && v.parentElement) {
        rect = v.parentElement.getBoundingClientRect();
      }
      if (rect.width < 80 || rect.height < 140) continue;
      if (rect.bottom < 48 || rect.top > vh - 56) continue;
      const midY = (rect.top + rect.bottom) / 2;
      if (midY < 48 || midY > vh - 56) continue;
      const visibleTop = Math.max(0, rect.top);
      const visibleBottom = Math.min(vh, rect.bottom);
      const visibleH = Math.max(0, visibleBottom - visibleTop);
      if (visibleH < Math.max(90, rect.height * 0.55)) continue;
      let score = visibleH * rect.width;
      if (!v.paused && !v.ended) score += 500000;
      if (v.readyState >= 1 && v.duration > 0.5) score += 100000;
      const centerDist = Math.abs(midY - vh / 2);
      score -= centerDist * 40;
      if (score > bestScore && rect.left < vw && rect.right > 0) {
        bestScore = score;
        best = v;
      }
    }
    return best;
  };

  const seekReelVideoTo = (v, targetTime) => {
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    const clamped = Math.max(0, Math.min(v.duration - 0.05, targetTime));
    try {
      v.currentTime = clamped;
    } catch (_) {}
    try {
      if (Math.abs((Number(v.currentTime) || 0) - clamped) > 0.5) {
        const protoSetter = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')?.set;
        if (protoSetter) protoSetter.call(v, clamped);
      }
    } catch (_) {}
    try {
      if (isYt && window.wrappedJSObject && typeof window.wrappedJSObject.__seekActiveSpMediaEl === 'function') {
        window.wrappedJSObject.__seekActiveSpMediaEl(clamped);
      }
    } catch (_) {}
  };

  const ensureScrubberDom = () => {
    if (scrubberEl && document.body && document.body.contains(scrubberEl)) return scrubberEl;
    if (!document.body) return null;
    scrubberEl = document.createElement('div');
    scrubberEl.id = 'pm-universal-reel-scrubber';
    scrubberEl.setAttribute('role', 'slider');
    scrubberEl.setAttribute('aria-label', 'Video progress scrubber');
    scrubberEl.style.cssText = [
      'position:fixed',
      'left:0px',
      'top:0px',
      'width:100%',
      'height:20px',
      'z-index:2147483645',
      'cursor:pointer',
      'display:none',
      'align-items:flex-end',
      'user-select:none',
      '-webkit-user-select:none',
      'touch-action:none',
      'pointer-events:auto'
    ].join(';');

    trackEl = document.createElement('div');
    trackEl.className = 'pm-reel-scrubber-track';
    trackEl.style.cssText = [
      'position:relative',
      'width:100%',
      'height:4px',
      'background:rgba(255,255,255,0.26)',
      'backdrop-filter:blur(4px)',
      'border-radius:999px',
      'transition:height 0.12s ease, background 0.12s ease',
      'box-shadow:0 1px 4px rgba(0,0,0,0.45)'
    ].join(';');

    fillEl = document.createElement('div');
    fillEl.className = 'pm-reel-scrubber-fill';
    fillEl.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      'bottom:0',
      'width:0%',
      'background:linear-gradient(90deg, #ff3366 0%, #ff6b3d 55%, #a29bfe 100%)',
      'border-radius:999px',
      'pointer-events:none'
    ].join(';');

    thumbEl = document.createElement('div');
    thumbEl.className = 'pm-reel-scrubber-thumb';
    thumbEl.style.cssText = [
      'position:absolute',
      'top:50%',
      'left:0%',
      'width:12px',
      'height:12px',
      'border-radius:50%',
      'background:#ffffff',
      'box-shadow:0 0 8px rgba(0,0,0,0.65), 0 0 0 2px #ff3366',
      'transform:translate(-50%, -50%) scale(0.75)',
      'opacity:0.85',
      'transition:transform 0.12s ease, opacity 0.12s ease',
      'pointer-events:none'
    ].join(';');

    tooltipEl = document.createElement('div');
    tooltipEl.className = 'pm-reel-scrubber-tooltip';
    tooltipEl.style.cssText = [
      'position:absolute',
      'bottom:14px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:rgba(12,12,18,0.88)',
      'color:#ffffff',
      'font:600 11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'padding:4px 8px',
      'border-radius:6px',
      'border:1px solid rgba(255,255,255,0.16)',
      'box-shadow:0 4px 12px rgba(0,0,0,0.45)',
      'white-space:nowrap',
      'opacity:0',
      'transition:opacity 0.12s ease',
      'pointer-events:none'
    ].join(';');

    trackEl.appendChild(fillEl);
    trackEl.appendChild(thumbEl);
    scrubberEl.appendChild(trackEl);
    scrubberEl.appendChild(tooltipEl);
    document.body.appendChild(scrubberEl);

    const setHoverVisual = (active) => {
      isHovering = active;
      if (!trackEl || !thumbEl || !tooltipEl || !fillEl) return;
      const spec = getLoadbarStyleSpec();
      fillEl.style.background = spec.fillBg;
      thumbEl.style.width = spec.thumbDim;
      thumbEl.style.height = spec.thumbDim;
      thumbEl.style.boxShadow = `0 0 8px rgba(0,0,0,0.65), 0 0 0 2px ${spec.ringCol}`;
      trackEl.style.height = active || isDragging ? spec.hoverH : spec.baseH;
      trackEl.style.background = active || isDragging ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.26)';
      thumbEl.style.transform = active || isDragging ? 'translate(-50%, -50%) scale(1.08)' : 'translate(-50%, -50%) scale(0.75)';
      thumbEl.style.opacity = active || isDragging ? '1' : '0.85';
      tooltipEl.style.opacity = active || isDragging ? '1' : '0';
    };
    setHoverVisual(false);

    const updateScrubFromEvent = (ev, commitSeek = true) => {
      const v = dragVideo || findActiveReelVideo();
      if (!v || !scrubberEl || !Number.isFinite(v.duration) || v.duration <= 0) return;
      const rect = scrubberEl.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const pct = (ratio * 100).toFixed(2);
      const targetSec = ratio * v.duration;
      tooltipEl.style.left = `${Math.max(12, Math.min(88, ratio * 100))}%`;
      tooltipEl.textContent = `${formatSec(targetSec)} / ${formatSec(v.duration)}`;
      if (commitSeek) {
        fillEl.style.width = `${pct}%`;
        thumbEl.style.left = `${pct}%`;
        seekReelVideoTo(v, targetSec);
      }
    };

    scrubberEl.addEventListener('pointerenter', () => setHoverVisual(true));
    scrubberEl.addEventListener('pointerleave', () => {
      if (!isDragging) setHoverVisual(false);
    });
    scrubberEl.addEventListener('pointermove', (ev) => {
      if (isDragging) {
        ev.preventDefault();
        ev.stopPropagation();
        updateScrubFromEvent(ev, true);
      } else {
        updateScrubFromEvent(ev, false);
      }
    });
    scrubberEl.addEventListener(
      'pointerdown',
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        dragVideo = findActiveReelVideo();
        if (!dragVideo) return;
        isDragging = true;
        try {
          scrubberEl.setPointerCapture(ev.pointerId);
        } catch (_) {}
        setHoverVisual(true);
        updateScrubFromEvent(ev, true);
      },
      true
    );
    const endDrag = (ev) => {
      if (!isDragging) return;
      ev.preventDefault();
      ev.stopPropagation();
      updateScrubFromEvent(ev, true);
      isDragging = false;
      dragVideo = null;
      try {
        scrubberEl.releasePointerCapture(ev.pointerId);
      } catch (_) {}
      setHoverVisual(false);
    };
    scrubberEl.addEventListener('pointerup', endDrag, true);
    scrubberEl.addEventListener('pointercancel', endDrag, true);
    scrubberEl.addEventListener(
      'click',
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
      },
      true
    );
    return scrubberEl;
  };

  const updateScrubberTimeOnly = () => {
    if (isDragging || !boundVideo || !fillEl || !thumbEl || !tooltipEl) return;
    const v = boundVideo;
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    const ratio = dur > 0 ? Math.max(0, Math.min(1, (v.currentTime || 0) / dur)) : 0;
    const pct = (ratio * 100).toFixed(2);
    fillEl.style.width = `${pct}%`;
    thumbEl.style.left = `${pct}%`;
    if (!isHovering) {
      tooltipEl.style.left = `${Math.max(12, Math.min(88, ratio * 100))}%`;
      tooltipEl.textContent = dur > 0 ? `${formatSec(v.currentTime)} / ${formatSec(dur)}` : '0:00 / --:--';
    }
  };

  const isTikTokCommentDrawerOpen = (vh, vw) => {
    if (!isTt) return false;
    const commentContainers = document.querySelectorAll(
      'div[class*="DivCommentContainer"], div[class*="DivCommentMain"], [data-e2e="search-comment-container"], div[class*="DivCommentListContainer"], div[class*="DivCommentDrawer"], div[class*="DivCommentHeader"]'
    );
    for (let i = 0; i < commentContainers.length; i++) {
      const el = commentContainers[i];
      const r = el.getBoundingClientRect();
      if (r.width > 100 && r.height > 80 && r.top < vh - 40 && r.bottom > 80 && r.left < vw && r.right > 0) {
        const st = window.getComputedStyle(el);
        if (st.display !== 'none' && st.visibility !== 'hidden' && parseFloat(st.opacity || '1') > 0.05) {
          return true;
        }
      }
    }
    return false;
  };

  const getInstagramBottomNavTop = (vh, vw) => {
    let navTop = vh;
    const navCandidates = document.querySelectorAll('div[role="navigation"], nav');
    for (let i = 0; i < navCandidates.length; i++) {
      const r = navCandidates[i].getBoundingClientRect();
      if (r.height >= 32 && r.height <= 68 && r.bottom >= vh - 6 && r.width >= vw * 0.7) {
        navTop = Math.min(navTop, Math.round(r.top));
      }
    }
    if (navTop === vh) {
      const navLink = document.querySelector('a[href="/reels/"], a[href="/explore/"], a[href="/direct/inbox/"]');
      let cur = navLink ? navLink.parentElement : null;
      while (cur && cur !== document.body) {
        const r = cur.getBoundingClientRect();
        if (r.height >= 36 && r.height <= 68 && r.bottom >= vh - 6 && r.width >= vw * 0.75) {
          navTop = Math.min(navTop, Math.round(r.top));
          break;
        }
        cur = cur.parentElement;
      }
    }
    return navTop;
  };

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const createIgSpeakerSvg = (muted) => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', '#fff');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const poly = document.createElementNS(SVG_NS, 'polygon');
    poly.setAttribute('points', '11 5 6 9 2 9 2 15 6 15 11 19 11 5');
    svg.appendChild(poly);
    if (muted) {
      const l1 = document.createElementNS(SVG_NS, 'line');
      l1.setAttribute('x1', '23');
      l1.setAttribute('y1', '9');
      l1.setAttribute('x2', '17');
      l1.setAttribute('y2', '15');
      const l2 = document.createElementNS(SVG_NS, 'line');
      l2.setAttribute('x1', '17');
      l2.setAttribute('y1', '9');
      l2.setAttribute('x2', '23');
      l2.setAttribute('y2', '15');
      svg.appendChild(l1);
      svg.appendChild(l2);
    } else {
      const p1 = document.createElementNS(SVG_NS, 'path');
      p1.setAttribute('d', 'M15.54 8.46a5 5 0 0 1 0 7.07');
      const p2 = document.createElementNS(SVG_NS, 'path');
      p2.setAttribute('d', 'M19.07 4.93a10 10 0 0 1 0 14.14');
      svg.appendChild(p1);
      svg.appendChild(p2);
    }
    return svg;
  };
  const createIgPlayBadgeSvg = () => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '28');
    svg.setAttribute('height', '28');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', '#fff');
    const poly = document.createElementNS(SVG_NS, 'polygon');
    poly.setAttribute('points', '6 3 20 12 6 21 6 3');
    svg.appendChild(poly);
    return svg;
  };

  const syncInstagramModalVideoControls = () => {
    if (!isIg) return;
    const mediaBox = document.querySelector('div[role="dialog"] article ._aatk');
    if (!mediaBox) return;
    const vid = mediaBox.querySelector('video');
    let muteBtn = mediaBox.querySelector('button[data-pm-ig-modal-mute="1"]');
    let playBadge = mediaBox.querySelector('div[data-pm-ig-modal-play="1"]');
    if (!vid) {
      if (muteBtn) muteBtn.style.display = 'none';
      if (playBadge) playBadge.style.display = 'none';
      return;
    }
    if (!muteBtn) {
      muteBtn = document.createElement('button');
      muteBtn.type = 'button';
      muteBtn.setAttribute('data-pm-ig-modal-mute', '1');
      muteBtn.title = 'Mute / Unmute';
      muteBtn.style.cssText = [
        'position:absolute',
        'bottom:22px',
        'right:12px',
        'width:32px',
        'height:32px',
        'border-radius:50%',
        'background:rgba(18,18,24,0.78)',
        'border:1px solid rgba(255,255,255,0.22)',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'cursor:pointer',
        'z-index:60',
        'padding:0',
        'backdrop-filter:blur(6px)',
        'box-shadow:0 2px 8px rgba(0,0,0,0.45)',
        'pointer-events:auto'
      ].join(';');
      muteBtn.addEventListener(
        'click',
        (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          ev.stopImmediatePropagation();
          const currentVid = mediaBox.querySelector('video');
          if (!currentVid) return;
          const targetMuted = !currentVid.muted;
          const nativeSvg = mediaBox.querySelector('svg[aria-label*="audio" i]');
          const nativeBtn = nativeSvg ? nativeSvg.closest('button, [role="button"]') : null;
          if (nativeBtn) {
            try {
              nativeBtn.click();
            } catch (_) {}
          }
          currentVid.muted = targetMuted;
          if (!targetMuted && currentVid.volume === 0) currentVid.volume = 1;
          setTimeout(() => {
            if (currentVid) {
              currentVid.muted = targetMuted;
              if (!targetMuted && currentVid.volume === 0) currentVid.volume = 1;
            }
            syncInstagramModalVideoControls();
          }, 30);
          syncInstagramModalVideoControls();
        },
        true
      );
      mediaBox.appendChild(muteBtn);
    }
    if (!playBadge) {
      playBadge = document.createElement('div');
      playBadge.setAttribute('data-pm-ig-modal-play', '1');
      playBadge.style.cssText = [
        'position:absolute',
        'top:50%',
        'left:50%',
        'transform:translate(-50%,-50%)',
        'width:58px',
        'height:58px',
        'border-radius:50%',
        'background:rgba(15,15,20,0.68)',
        'border:1px solid rgba(255,255,255,0.22)',
        'display:none',
        'align-items:center',
        'justify-content:center',
        'z-index:55',
        'pointer-events:none',
        'backdrop-filter:blur(4px)'
      ].join(';');
      playBadge.appendChild(createIgPlayBadgeSvg());
      mediaBox.appendChild(playBadge);
    }
    muteBtn.style.display = 'flex';
    const isMuted = Boolean(vid.muted || vid.volume === 0);
    if (muteBtn.getAttribute('data-muted') !== (isMuted ? '1' : '0')) {
      muteBtn.setAttribute('data-muted', isMuted ? '1' : '0');
      muteBtn.replaceChildren(createIgSpeakerSvg(isMuted));
    }
    playBadge.style.display = vid.paused ? 'flex' : 'none';
    if (!vid.__pmModalEventsBound) {
      vid.__pmModalEventsBound = true;
      vid.addEventListener('play', syncInstagramModalVideoControls, { passive: true });
      vid.addEventListener('pause', syncInstagramModalVideoControls, { passive: true });
      vid.addEventListener('volumechange', syncInstagramModalVideoControls, { passive: true });
    }
  };

  const syncScrubberUi = (forceFind = false) => {
    rafPending = false;
    if (isIg) syncInstagramModalVideoControls();
    if (!videoLoadbarConfig.enabled || !isScrollingVideoRoute()) {
      if (scrubberEl) scrubberEl.style.display = 'none';
      return;
    }
    if (trackEl && fillEl && thumbEl) {
      const spec = getLoadbarStyleSpec();
      fillEl.style.background = spec.fillBg;
      thumbEl.style.width = spec.thumbDim;
      thumbEl.style.height = spec.thumbDim;
      thumbEl.style.boxShadow = `0 0 8px rgba(0,0,0,0.65), 0 0 0 2px ${spec.ringCol}`;
      trackEl.style.height = isHovering || isDragging ? spec.hoverH : spec.baseH;
    }
    const vh = window.innerHeight || 600;
    const vw = window.innerWidth || 420;
    if (isTikTokCommentDrawerOpen(vh, vw)) {
      if (scrubberEl) scrubberEl.style.display = 'none';
      return;
    }
    const now = Date.now();
    let v = boundVideo;
    if (forceFind || !v || v.paused || v.ended || !document.contains(v) || now - lastFindAt > 450) {
      lastFindAt = now;
      v = findActiveReelVideo();
    }
    if (!v) {
      if (scrubberEl) scrubberEl.style.display = 'none';
      return;
    }
    const bar = ensureScrubberDom();
    if (!bar) return;

    if (boundVideo !== v) {
      if (boundVideo) boundVideo.removeEventListener('timeupdate', updateScrubberTimeOnly);
      boundVideo = v;
      v.addEventListener('timeupdate', updateScrubberTimeOnly, { passive: true });
      if (typeof ResizeObserver === 'function') {
        try {
          if (!videoResizeObs) {
            videoResizeObs = new ResizeObserver(() => {
              if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(() => syncScrubberUi(false));
              }
            });
            if (document.documentElement) videoResizeObs.observe(document.documentElement);
          }
          videoResizeObs.observe(v);
          if (v.parentElement) videoResizeObs.observe(v.parentElement);
        } catch (_) {}
      }
    }

    let rect = v.getBoundingClientRect();
    if ((rect.width < 60 || rect.height < 60) && v.parentElement) {
      rect = v.parentElement.getBoundingClientRect();
    }
    if (isYt) {
      const ytCard = v.closest('#player-container, #shorts-player, ytd-reel-video-renderer[is-active], .html5-video-player');
      if (ytCard) {
        const cardRect = ytCard.getBoundingClientRect();
        if (cardRect.width >= 60 && cardRect.height >= 60) {
          rect = {
            left: cardRect.left,
            right: cardRect.right,
            width: cardRect.width,
            top: cardRect.top,
            bottom: Math.max(rect.bottom, cardRect.bottom),
            height: cardRect.height
          };
        }
      }
    } else if (isTt) {
      const ttCard = v.closest('div[class*="DivVideoWrapper"], div[class*="DivBasicPlayerWrapper"], div[class*="DivPlayerContainer"]');
      if (ttCard) {
        const cardRect = ttCard.getBoundingClientRect();
        if (cardRect.width >= 60 && cardRect.height >= 60) rect = cardRect;
      }
    }

    const leftPx = Math.max(0, Math.round(rect.left));
    const rightPx = Math.min(vw, Math.round(rect.right));
    const widthPx = Math.max(60, rightPx - leftPx);

    let maxBottomY = vh;
    if (isIg && !v.closest('div[role="dialog"]')) {
      maxBottomY = getInstagramBottomNavTop(vh, vw);
      if (rect.bottom > maxBottomY + 18 || rect.top < -24 || rect.height < 150) {
        bar.style.display = 'none';
        return;
      }
    }
    const visibleBottom = Math.max(24, Math.min(maxBottomY, Math.round(rect.bottom)));

    bar.style.display = 'flex';
    bar.style.left = `${leftPx}px`;
    bar.style.width = `${widthPx}px`;
    bar.style.top = `${visibleBottom - 20}px`;
    bar.style.bottom = 'auto';

    updateScrubberTimeOnly();
    if (isIg) syncInstagramModalVideoControls();
  };
  applyVideoLoadbarVisualsNow = () => syncScrubberUi(false);

  const scheduleFastScrubberSync = () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => syncScrubberUi(true));
  };

  setInterval(() => syncScrubberUi(false), 380);
  document.addEventListener('play', scheduleFastScrubberSync, { capture: true, passive: true });
  document.addEventListener('loadedmetadata', scheduleFastScrubberSync, { capture: true, passive: true });
  window.addEventListener('resize', scheduleFastScrubberSync, { passive: true });
  window.addEventListener('scroll', scheduleFastScrubberSync, { capture: true, passive: true });
}
