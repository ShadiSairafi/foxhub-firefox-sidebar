/**
 * FoxHub Content Core — Widevine EME & Clear MSE Audio Mirror,
 * Non-Mirror Audio Tracker (SoundCloud / Apple Music) & Rich Metadata Extraction
 */

const trackedMediaEls = new Set();
const capturedMediaSessionHandlers = {};
let capturedMediaSessionDuration = 0;

let activeMseRecorder = null;
let activeMseMediaEl = null;
let activeMseBridgeSeq = 0;
let activeMseBridgeToken = 0;
let keepaliveAudioCtx = null;
let keepaliveOscNode = null;
let keepaliveGainNode = null;
let lastTrackSkipCmdAt = 0;
let lastTrackSkipDir = '';

export function isShouldDebounceSkip(dir, windowMs = 250) {
  const now = Date.now();
  if (lastTrackSkipDir === dir && now - lastTrackSkipCmdAt < windowMs) {
    return true;
  }
  lastTrackSkipDir = dir;
  lastTrackSkipCmdAt = now;
  return false;
}

export function getCapturedMediaSessionHandlers() {
  return capturedMediaSessionHandlers;
}

export function getCapturedMediaSessionDuration() {
  return capturedMediaSessionDuration;
}

export function parseClockDuration(txt) {
  const str = String(txt || '').trim();
  if (!str || !str.includes(':')) return 0;
  const parts = str.split(':').map((n) => parseInt(n, 10));
  if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1]) && !Number.isNaN(parts[2])) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

export function ensureWebAudioKeepalive(inaudibleVolume = 1e-5) {
  try {
    if (keepaliveAudioCtx && keepaliveAudioCtx.state !== 'closed') {
      if (keepaliveAudioCtx.state === 'suspended') {
        keepaliveAudioCtx.resume().catch(() => {});
      }
      return keepaliveAudioCtx;
    }
    const pageWin = window.wrappedJSObject;
    const AudioCtx =
      window.AudioContext ||
      window.webkitAudioContext ||
      (pageWin && (pageWin.AudioContext || pageWin.webkitAudioContext));
    if (!AudioCtx) return null;
    keepaliveAudioCtx = new AudioCtx();
    keepaliveOscNode = keepaliveAudioCtx.createOscillator();
    keepaliveGainNode = keepaliveAudioCtx.createGain();
    keepaliveGainNode.gain.value = inaudibleVolume;
    keepaliveOscNode.type = 'sine';
    keepaliveOscNode.frequency.value = 440;
    keepaliveOscNode.connect(keepaliveGainNode);
    keepaliveGainNode.connect(keepaliveAudioCtx.destination);
    keepaliveOscNode.start();
    if (keepaliveAudioCtx.state === 'suspended') {
      keepaliveAudioCtx.resume().catch(() => {});
    }
    return keepaliveAudioCtx;
  } catch (_) {
    return null;
  }
}

export function closeWebAudioKeepalive() {
  try {
    if (keepaliveAudioCtx && keepaliveAudioCtx.state !== 'closed') {
      keepaliveAudioCtx.close().catch(() => {});
    }
  } catch (_) {}
}

export function isMediaElementAudible(ctx, el) {
  if (!el || el.paused || el.ended) return false;
  if (el.muted || !(Number(el.volume) > 0)) return false;
  if (el.mozHasAudio === false) {
    const isShortFormHost = Boolean(ctx && (ctx.hasHost('instagram.com') || ctx.hasHost('tiktok.com')));
    const rs = Number(el.readyState) || 0;
    const ct = Number(el.currentTime) || 0;
    if (isShortFormHost) {
      // Firefox MSE <video> on Instagram Reels / TikTok can report mozHasAudio=false while audio plays via MSE/startup
      try {
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        if (r && r.width >= 80 && r.height >= 80) return true;
      } catch (_) {}
      return rs < 3 || ct < 1.5;
    }
    // On other hosts, allow startup frames before audio decoder initializes; filter confirmed decoded silent loops
    return rs < 3 || ct < 0.8;
  }
  return true;
}

export function getActiveMediaElement(ctx) {
  if (ctx.hasHost('youtube.com') && !ctx.hasHost('music.youtube.com')) {
    const p = window.location.pathname || '/';
    const isPlayableYtPath =
      p.startsWith('/watch') || p.startsWith('/shorts') || p.startsWith('/live') || p.startsWith('/embed');
    if (!isPlayableYtPath) {
      return null;
    }
    if (p.startsWith('/shorts')) {
      const shortsPlaying = Array.from(
        document.querySelectorAll('#shorts-player video, ytd-shorts video, ytd-reel-video-renderer video')
      ).find((el) => !el.paused && !el.ended && el.readyState >= 1);
      if (shortsPlaying) return shortsPlaying;
      const shortsAny = document.querySelector(
        '#shorts-player video.html5-main-video, ytd-shorts video.html5-main-video, #shorts-player video, ytd-shorts video'
      );
      if (shortsAny) return shortsAny;
    }
  }

  const domEls = Array.from(document.querySelectorAll('video, audio'));
  const combined = [...domEls];
  trackedMediaEls.forEach((el) => {
    if (el && !combined.includes(el)) {
      if (document.contains(el) || (!el.paused && !el.ended) || el.src) {
        combined.push(el);
      }
    }
  });

  const isPreview = (el) => {
    try {
      return Boolean(el.closest && el.closest('ytd-video-preview, #video-preview, ytd-inline-preview-player, [hidden]'));
    } catch (_) {
      return false;
    }
  };

  const isVisibleInViewport = (el) => {
    try {
      if (!el || typeof el.getBoundingClientRect !== 'function') return false;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 600;
      const vw = window.innerWidth || 420;
      return r.width >= 60 && r.height >= 60 && r.bottom > 24 && r.top < vh - 24 && r.right > 0 && r.left < vw;
    } catch (_) {
      return false;
    }
  };

  const audiblePlayingCandidates = combined.filter(
    (el) => isMediaElementAudible(ctx, el) && el.readyState >= 1 && !isPreview(el)
  );
  if (audiblePlayingCandidates.length > 0) {
    const visibleAudible = audiblePlayingCandidates.find(isVisibleInViewport);
    return visibleAudible || audiblePlayingCandidates[0];
  }

  const playingCandidates = combined.filter(
    (el) => !el.paused && !el.ended && el.readyState >= 1 && !isPreview(el)
  );
  if (playingCandidates.length > 0) {
    const visiblePlaying = playingCandidates.find(isVisibleInViewport);
    return visiblePlaying || playingCandidates[0];
  }

  const mainYt = document.querySelector(
    '#movie_player video.html5-main-video, ytd-player video.html5-main-video, video.html5-main-video'
  );
  if (mainYt) return mainYt;

  const nonPreview = combined.find((el) => {
    try {
      return !el.closest || !el.closest('ytd-video-preview, #video-preview, ytd-miniplayer, [hidden]');
    } catch (_) {
      return true;
    }
  });
  return nonPreview || combined[0] || null;
}

export function getTrackedMediaElements() {
  const set = new Set(document.querySelectorAll('video, audio'));
  trackedMediaEls.forEach((el) => {
    if (el) set.add(el);
  });
  return Array.from(set);
}

export function isAudioMirrorActive(ctx) {
  try {
    return Boolean(ctx.isMirrorAudioHost && window.wrappedJSObject && window.wrappedJSObject.__pmSpBridgeEnabled);
  } catch (_) {
    return false;
  }
}

export function ensureMirroredPlayback() {
  try {
    if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureMirrorPlay === 'function') {
      return Boolean(window.wrappedJSObject.__pmEnsureMirrorPlay());
    }
  } catch (_) {}
  return false;
}

export function stopLocalMseAudioBridge(ctx) {
  activeMseBridgeToken = ++activeMseBridgeSeq;
  if (!ctx.state.bgAudioMseBridgeStarted) return;
  ctx.state.bgAudioMseBridgeStarted = false;
  try {
    if (activeMseRecorder && activeMseRecorder.state !== 'inactive') {
      activeMseRecorder.stop();
    }
  } catch (_) {}
  activeMseRecorder = null;
  try {
    if (activeMseMediaEl && activeMseMediaEl.wrappedJSObject) {
      delete activeMseMediaEl.wrappedJSObject.volume;
      delete activeMseMediaEl.wrappedJSObject.muted;
    }
    if (activeMseMediaEl) {
      activeMseMediaEl.muted = false;
      activeMseMediaEl.volume = 1.0;
    }
  } catch (_) {}
  activeMseMediaEl = null;
}

export function startLocalMseAudioBridge(ctx, mediaEl) {
  if (isAudioMirrorActive(ctx)) return;
  if (ctx.state.bgAudioMseBridgeStarted || !mediaEl) return;
  const curPolicy =
    typeof navigator.getAutoplayPolicy === 'function' ? navigator.getAutoplayPolicy('mediaelement') : 'allowed';
  if (ctx.state.bgAudioAutoplayBlocked) {
    if (curPolicy === 'allowed') {
      ctx.state.bgAudioAutoplayBlocked = false;
    } else {
      return;
    }
  }
  const bridgeToken = ++activeMseBridgeSeq;
  activeMseBridgeToken = bridgeToken;
  ctx.state.bgAudioMseBridgeStarted = true;
  activeMseMediaEl = mediaEl;
  let localRecorder = null;
  const cleanupFailedBridge = (markAutoplayBlocked = false) => {
    try {
      if (localRecorder && localRecorder.state !== 'inactive') {
        localRecorder.stop();
      }
    } catch (_) {}
    if (activeMseBridgeToken !== bridgeToken) {
      return;
    }
    activeMseBridgeToken = ++activeMseBridgeSeq;
    try {
      if (activeMseRecorder && activeMseRecorder !== localRecorder && activeMseRecorder.state !== 'inactive') {
        activeMseRecorder.stop();
      }
    } catch (_) {}
    activeMseRecorder = null;
    activeMseMediaEl = null;
    try {
      if (mediaEl.wrappedJSObject) {
        delete mediaEl.wrappedJSObject.volume;
        delete mediaEl.wrappedJSObject.muted;
      }
      mediaEl.muted = false;
      mediaEl.volume = 1.0;
    } catch (_) {}
    ctx.state.bgAudioMseBridgeStarted = false;
    if (markAutoplayBlocked) ctx.state.bgAudioAutoplayBlocked = true;
  };
  const isBridgeCancelled = () =>
    !ctx.state.bgAudioMseBridgeStarted ||
    activeMseMediaEl !== mediaEl ||
    activeMseBridgeToken !== bridgeToken;
  const restoreCancelledMediaEl = () => {
    if (ctx.state.bgAudioMseBridgeStarted && activeMseMediaEl === mediaEl) return;
    try {
      mediaEl.muted = false;
      mediaEl.volume = 1.0;
    } catch (_) {}
  };
  (async () => {
    try {
      mediaEl.muted = false;
      mediaEl.volume = ctx.INAUDIBLE_VOLUME;
      try {
        await mediaEl.play();
        if (isBridgeCancelled()) {
          restoreCancelledMediaEl();
          return;
        }
      } catch (playErr) {
        if (isBridgeCancelled()) {
          restoreCancelledMediaEl();
          return;
        }
        if (!playErr || playErr.name !== 'NotAllowedError') {
          cleanupFailedBridge(false);
          return;
        }
        try {
          mediaEl.muted = true;
          await mediaEl.play();
          if (isBridgeCancelled()) {
            restoreCancelledMediaEl();
            return;
          }
          mediaEl.muted = false;
          mediaEl.volume = ctx.INAUDIBLE_VOLUME;
          await Promise.resolve();
          if (isBridgeCancelled()) {
            restoreCancelledMediaEl();
            return;
          }
        } catch (_) {
          if (isBridgeCancelled()) {
            restoreCancelledMediaEl();
            return;
          }
          cleanupFailedBridge(true);
          return;
        }
        if (mediaEl.paused) {
          if (isBridgeCancelled()) {
            restoreCancelledMediaEl();
            return;
          }
          cleanupFailedBridge(true);
          return;
        }
      }
      if (isBridgeCancelled()) {
        restoreCancelledMediaEl();
        return;
      }
      ctx.state.bgAudioAutoplayBlocked = false;
      if (window.wrappedJSObject && mediaEl.wrappedJSObject && typeof exportFunction === 'function') {
        try {
          const pageWin = window.wrappedJSObject;
          const rawEl = mediaEl.wrappedJSObject;
          const getOne = exportFunction(() => 1, pageWin);
          const setNoop = exportFunction(() => {}, pageWin);
          const getFalse = exportFunction(() => false, pageWin);
          Object.defineProperty(rawEl, 'volume', { get: getOne, set: setNoop, configurable: true });
          Object.defineProperty(rawEl, 'muted', { get: getFalse, set: setNoop, configurable: true });
        } catch (_) {}
      }
      const stream = mediaEl.mozCaptureStream
        ? mediaEl.mozCaptureStream()
        : mediaEl.captureStream
        ? mediaEl.captureStream()
        : null;
      if (stream && stream.getAudioTracks().length > 0) {
        if (isBridgeCancelled()) {
          restoreCancelledMediaEl();
          return;
        }
        const audioOnlyStream = new MediaStream(stream.getAudioTracks());
        const rec = new MediaRecorder(audioOnlyStream, { mimeType: 'audio/webm;codecs=opus' });
        localRecorder = rec;
        activeMseRecorder = rec;
        rec.ondataavailable = async (ev) => {
          if (isBridgeCancelled() || activeMseRecorder !== rec) return;
          if (ev.data && ev.data.size > 0) {
            try {
              const buf = await ev.data.arrayBuffer();
              if (isBridgeCancelled() || activeMseRecorder !== rec) return;
              ctx.realTopWin.postMessage(
                {
                  source: 'pocketmail-media-frame',
                  type: 'PM_BG_AUDIO_CHUNK',
                  flatFrameName: ctx.cleanWindowName,
                  chunk: buf
                },
                '*',
                [buf]
              );
            } catch (_) {}
          }
        };
        rec.start(140);
        if (isBridgeCancelled()) {
          try {
            if (rec.state !== 'inactive') rec.stop();
          } catch (_) {}
          restoreCancelledMediaEl();
          return;
        }
        ctx.state.bgAudioAutoResumed = true;
      } else {
        cleanupFailedBridge(false);
      }
    } catch (_) {
      if (isBridgeCancelled()) {
        restoreCancelledMediaEl();
        return;
      }
      cleanupFailedBridge(false);
    }
  })();
}

export function extractRichTrackMeta(ctx, opt, mediaEl = null, fallbackToDocTitle = true) {
  const base = {
    title: '',
    artist: '',
    album: '',
    artworkUrl: '',
    currentTime: 0,
    duration: 0,
    canPrev: true,
    canNext: true
  };
  try {
    const pageWin = window.wrappedJSObject;
    const msMeta =
      (pageWin && pageWin.navigator && pageWin.navigator.mediaSession && pageWin.navigator.mediaSession.metadata) ||
      (navigator.mediaSession && navigator.mediaSession.metadata) ||
      null;
    if (msMeta) {
      if (msMeta.title) base.title = String(msMeta.title).trim();
      if (msMeta.artist) base.artist = String(msMeta.artist).trim();
      if (msMeta.album) base.album = String(msMeta.album).trim();
      if (msMeta.artwork && msMeta.artwork.length > 0) {
        const art = msMeta.artwork[msMeta.artwork.length - 1] || msMeta.artwork[0];
        if (art && art.src) base.artworkUrl = String(art.src);
      }
    }
  } catch (_) {}

  if (mediaEl) {
    if (Number.isFinite(mediaEl.currentTime) && mediaEl.currentTime > 0) {
      base.currentTime = Math.floor(mediaEl.currentTime);
    }
    if (Number.isFinite(mediaEl.duration) && mediaEl.duration > 0 && mediaEl.duration < 86400) {
      base.duration = Math.floor(mediaEl.duration);
    }
  }
  if (!base.duration && capturedMediaSessionDuration > 0) {
    base.duration = Math.floor(capturedMediaSessionDuration);
  }

  if (opt && typeof opt.getTrackMeta === 'function') {
    try {
      const appMeta = opt.getTrackMeta(mediaEl) || {};
      if (appMeta.title && !base.title) base.title = String(appMeta.title).trim();
      else if (appMeta.title && appMeta.preferDomTitle) base.title = String(appMeta.title).trim();
      if (appMeta.artist && !base.artist) base.artist = String(appMeta.artist).trim();
      if (appMeta.album && !base.album) base.album = String(appMeta.album).trim();
      if (appMeta.artworkUrl && !base.artworkUrl) base.artworkUrl = String(appMeta.artworkUrl);
      if (Number.isFinite(appMeta.currentTime) && appMeta.currentTime > 0 && !base.currentTime) {
        base.currentTime = Math.floor(appMeta.currentTime);
      }
      if (Number.isFinite(appMeta.duration) && appMeta.duration > 0 && !base.duration) {
        base.duration = Math.floor(appMeta.duration);
      }
      if (typeof appMeta.canPrev === 'boolean') base.canPrev = appMeta.canPrev;
      if (typeof appMeta.canNext === 'boolean') base.canNext = appMeta.canNext;
    } catch (_) {}
  }

  if (!base.title && fallbackToDocTitle) {
    base.title = document.title || '';
  }
  return base;
}

function installSharedMediaSessionHooks(pageWin, define) {
  if (!pageWin || pageWin.__pmMediaSessionHooked) return;
  pageWin.__pmMediaSessionHooked = true;
  if (pageWin.MediaSession && pageWin.MediaSession.prototype) {
    if (typeof pageWin.MediaSession.prototype.setActionHandler === 'function') {
      const origSetAction = pageWin.MediaSession.prototype.setActionHandler;
      define(pageWin.MediaSession.prototype, 'setActionHandler', function (action, handler) {
        try {
          const act = String(action || '');
          if (act) {
            if (typeof handler === 'function') {
              capturedMediaSessionHandlers[act] = handler;
            } else {
              delete capturedMediaSessionHandlers[act];
            }
          }
        } catch (_) {}
        return origSetAction.call(this, action, handler);
      });
    }
    if (typeof pageWin.MediaSession.prototype.setPositionState === 'function') {
      const origSetPos = pageWin.MediaSession.prototype.setPositionState;
      define(pageWin.MediaSession.prototype, 'setPositionState', function (state) {
        try {
          if (state && Number(state.duration) > 0) {
            capturedMediaSessionDuration = Number(state.duration);
          }
        } catch (_) {}
        return origSetPos.call(this, state);
      });
    }
  }
}

function installAutoplaySpoof(pageWin, define) {
  if (pageWin.Navigator && pageWin.Navigator.prototype) {
    define(pageWin.Navigator.prototype, 'getAutoplayPolicy', function () {
      return 'allowed';
    });
  }
  if (pageWin.UserActivation && pageWin.UserActivation.prototype) {
    try {
      const retTrue = exportFunction(() => true, pageWin);
      Object.defineProperty(pageWin.UserActivation.prototype, 'isActive', { get: retTrue, configurable: true });
      Object.defineProperty(pageWin.UserActivation.prototype, 'hasBeenActive', { get: retTrue, configurable: true });
    } catch (_) {}
  }
}

export function installNonMirrorAudioTracker(ctx) {
  const pageWin = window.wrappedJSObject;
  if (!pageWin || typeof exportFunction !== 'function') return;
  if (pageWin.__pmNonMirrorTrackerInstalled) return;
  pageWin.__pmNonMirrorTrackerInstalled = true;

  const define = (target, name, fn) => {
    try {
      exportFunction(fn, target, { defineAs: name });
    } catch (_) {}
  };

  installAutoplaySpoof(pageWin, define);
  installSharedMediaSessionHooks(pageWin, define);

  if (ctx.isBgAudioFrame) {
    ensureWebAudioKeepalive(ctx.INAUDIBLE_VOLUME);
  }

  if (pageWin.HTMLMediaElement && pageWin.HTMLMediaElement.prototype) {
    const proto = pageWin.HTMLMediaElement.prototype;
    const origPlay = proto.play;
    if (typeof origPlay === 'function') {
      define(proto, 'play', function () {
        try {
          trackedMediaEls.add(this);
        } catch (_) {}
        return origPlay.call(this);
      });
    }
  }
}

export function installMediaMirrorHooks(ctx, opt = null) {
  const pageWin = window.wrappedJSObject;
  if (!pageWin || typeof exportFunction !== 'function') return;
  if (!ctx.isFoxHubMediaFrame) return;
  if (pageWin.__pmSpHookInstalled) return;
  pageWin.__pmSpHookInstalled = true;
  pageWin.__pmSpBridgeEnabled = true;

  const IS_YT = ctx.hasHost('youtube.com') || ctx.hasHost('youtu.be');
  const IS_YTM = ctx.hasHost('music.youtube.com');
  let frameName = ctx.cleanWindowName;
  const mediaEls = [];
  const mirroredEls = new WeakSet();
  const lockedEls = new WeakSet();
  const suppressPauseEvent = new WeakSet();
  const wantPlay = new WeakMap();
  const msUrls = new WeakMap();
  const urlToMs = new Map();
  const msToEl = new WeakMap();
  const msSbStates = new WeakMap();
  const dealerSockets = new Set();
  const spConnectState = {
    origin: 'https://gew4-spclient.spotify.com',
    deviceId: '',
    activeDeviceId: '',
    headers: {},
    lastTransferAt: 0,
    lastSelfTransferAt: 0
  };
  let msCounter = Date.now();
  let isFrameUnloading = false;
  let lastUserGestureAt = 0;
  let lastPauseControlGestureAt = 0;
  let internalHandoffSeekUntil = 0;
  let lastUserSeekBarScrubAt = 0;
  let lastPlayStartedAt = 0;
  let lastParentSyncSentAt = 0;
  let lastSidebarGestureBridgeAt = 0;
  let lastBgHeartbeatReportAt = 0;
  let mirrorWasPlaying = false;
  let mirrorAutoPausedByTab = false;
  let pendingYtSeekTarget = null;
  let lastSpSeekAt = 0;
  let lastSpSeekTarget = -1;
  let runMirrorSyncTick = () => {};
  let activeMirrorDesiredMuted = false;
  let activeMirrorDesiredVolume = 1.0;

  ensureWebAudioKeepalive(ctx.INAUDIBLE_VOLUME);

  const closeDealerSocketsForHandoff = () => {
    isFrameUnloading = true;
    dealerSockets.forEach((ws) => {
      try {
        if (ws && ws.readyState <= 1) {
          ws.close(1000, 'foxhub-handoff');
        }
      } catch (_) {}
    });
    dealerSockets.clear();
  };

  const markUnloading = () => {
    closeDealerSocketsForHandoff();
    closeWebAudioKeepalive();
  };
  window.addEventListener('pagehide', markUnloading, true);
  window.addEventListener('beforeunload', markUnloading, true);
  window.addEventListener('unload', markUnloading, true);

  const notifySidebarUserInteraction = (ev) => {
    if (ctx.isBgAudioFrame || ctx.isStandbyBgFrame || IS_YT) return;
    if (!ev || !ev.isTrusted) return;
    const now = Date.now();
    let isSeekBar = false;
    try {
      if (ev.target && ev.target.closest) {
        isSeekBar = Boolean(
          ev.target.closest('[data-testid="playback-progressbar"], [data-testid="progress-bar"], .playback-bar, .ytp-progress-bar')
        );
      }
    } catch (_) {}
    if (isSeekBar) {
      lastUserSeekBarScrubAt = now;
    }
    if (!isSeekBar && now - lastSidebarGestureBridgeAt < 220) return;
    lastSidebarGestureBridgeAt = now;
    postBridge('USER_INTERACTION', { isSeekBar });
  };

  const isSpotifyUiShowingPlaying = () => {
    if (IS_YT) return false;
    try {
      const spToggle = document.querySelector('[data-testid="control-button-playpause"]');
      const aria = spToggle ? (spToggle.getAttribute('aria-label') || '').toLowerCase() : '';
      if (aria.includes('pause') || aria.includes('stop')) return true;
      if (!spToggle && pageWin.navigator && pageWin.navigator.mediaSession) {
        return pageWin.navigator.mediaSession.playbackState === 'playing';
      }
    } catch (_) {}
    return false;
  };

  const isPauseControlInteraction = (ev) => {
    if (!ev || ctx.state.spAutoClickInFlight) return 'none';
    try {
      if (ev.type === 'keydown') {
        if (ev.target && ev.target.closest && ev.target.closest('input, textarea, select, [contenteditable="true"]')) {
          return 'none';
        }
        const k = ev.key || '';
        const c = ev.code || '';
        if (k === 'MediaPause' || k === 'MediaStop') return 'pause';
        const isToggleKey =
          c === 'Space' ||
          k === ' ' ||
          k === 'MediaPlayPause' ||
          (IS_YT && k.toLowerCase() === 'k');
        if (!isToggleKey) return 'none';
        if (!IS_YT) {
          return isSpotifyUiShowingPlaying() ? 'pause' : 'play';
        }
        return 'pause';
      }
      if (ev.target && ev.target.closest) {
        if (IS_YT) {
          const ytMatch = ev.target.closest(
            '.ytp-play-button, #movie_player video, ytd-shorts video, ytmusic-player-bar #play-pause-button, button[aria-label*="Pause" i], button[aria-label*="Play" i]'
          );
          return ytMatch ? 'pause' : 'none';
        }
        const spBtn = ev.target.closest('[data-testid="control-button-playpause"], [data-testid="play-button"]');
        if (!spBtn) return 'none';
        const aria = (spBtn.getAttribute('aria-label') || '').toLowerCase();
        if (aria.includes('pause') || aria.includes('stop')) {
          return 'pause';
        }
        if (aria.includes('play')) {
          return 'play';
        }
        return ev.type === 'click' && Date.now() - lastPauseControlGestureAt < 800 ? 'pause' : 'none';
      }
    } catch (_) {}
    return 'none';
  };

  const recordUserGesture = (ev) => {
    const now = Date.now();
    lastUserGestureAt = now;
    const pauseIntent = isPauseControlInteraction(ev);
    if (pauseIntent === 'pause') {
      lastPauseControlGestureAt = now;
    } else if (pauseIntent === 'play' && (ev.type !== 'click' || now - lastPauseControlGestureAt > 800)) {
      lastPauseControlGestureAt = 0;
    }
    if (ev && ev.isTrusted && ev.target && ev.target.closest) {
      try {
        if (ev.target.closest('[data-testid="playback-progressbar"], [data-testid="progress-bar"], .playback-bar, .ytp-progress-bar')) {
          lastUserSeekBarScrubAt = now;
        }
      } catch (_) {}
    }
    ensureWebAudioKeepalive(ctx.INAUDIBLE_VOLUME);
    notifySidebarUserInteraction(ev);
  };
  window.addEventListener('pointerdown', recordUserGesture, { capture: true, passive: true });
  window.addEventListener('mousedown', recordUserGesture, { capture: true, passive: true });
  window.addEventListener('keydown', recordUserGesture, { capture: true, passive: true });
  window.addEventListener('touchstart', recordUserGesture, { capture: true, passive: true });
  window.addEventListener(
    'pointermove',
    (ev) => {
      if (ev && ev.isTrusted && ev.buttons > 0) {
        lastUserGestureAt = Date.now();
        if (ev.target && ev.target.closest) {
          try {
            if (ev.target.closest('[data-testid="playback-progressbar"], [data-testid="progress-bar"], .playback-bar, .ytp-progress-bar')) {
              lastUserSeekBarScrubAt = Date.now();
            }
          } catch (_) {}
        }
      }
    },
    { capture: true, passive: true }
  );
  window.addEventListener(
    'pointerup',
    (ev) => {
      if (ev && ev.isTrusted) {
        const now = Date.now();
        lastUserGestureAt = now;
        if (isPauseControlInteraction(ev) === 'pause') {
          lastPauseControlGestureAt = now;
        }
        if (ev.target && ev.target.closest) {
          try {
            if (ev.target.closest('[data-testid="playback-progressbar"], [data-testid="progress-bar"], .playback-bar, .ytp-progress-bar')) {
              lastUserSeekBarScrubAt = now;
            }
          } catch (_) {}
        }
        notifySidebarUserInteraction(ev);
      }
    },
    { capture: true, passive: true }
  );

  if (IS_YT) {
    try {
      for (const store of [window.sessionStorage, window.localStorage]) {
        if (!store) continue;
        const rawVol = store.getItem('yt-player-volume');
        if (rawVol && rawVol.includes('"muted":true')) {
          store.setItem('yt-player-volume', rawVol.replace(/"muted"\s*:\s*true/g, '"muted":false'));
        }
      }
    } catch (_) {}
  }

  let emeBridgePort = null;
  const ensureBridgePort = () => {
    if (emeBridgePort) return emeBridgePort;
    try {
      if (typeof browser !== 'undefined' && browser.runtime && typeof browser.runtime.connect === 'function') {
        emeBridgePort = browser.runtime.connect({ name: 'foxhub-eme-bridge' });
        emeBridgePort.onMessage.addListener((msg) => {
          if (!msg || !msg.cmd) return;
          if (msg.cmd === 'BG_HEARTBEAT_TICK') {
            if (!isFrameUnloading) {
              ensureWebAudioKeepalive(ctx.INAUDIBLE_VOLUME);
              try {
                runMirrorSyncTick();
              } catch (_) {}
              const nowHb = Date.now();
              if (nowHb - lastBgHeartbeatReportAt > 850) {
                lastBgHeartbeatReportAt = nowHb;
                try {
                  if (typeof window.__pmReportLivePlaybackState === 'function') {
                    window.__pmReportLivePlaybackState();
                  }
                } catch (_) {}
              }
            }
            return;
          }
          if (msg.cmd === 'MARK_USER_GESTURE') {
            lastUserGestureAt = Date.now();
            return;
          }
          if (msg.cmd === 'PREPARE_HANDOFF_UNLOAD') {
            closeDealerSocketsForHandoff();
            return;
          }
          if (msg.cmd === 'SEEK_SP_MEDIA') {
            const seekSec = Number(msg.currentTime) || 0;
            const isUserScrub = Boolean(msg.isUserScrub);
            const nowSeek = Date.now();
            if (!isUserScrub && Math.abs(seekSec - lastSpSeekTarget) < 0.25 && nowSeek - lastSpSeekAt < 140) {
              return;
            }
            lastSpSeekAt = nowSeek;
            lastSpSeekTarget = seekSec;
            let executed = false;
            try {
              if (pageWin && typeof pageWin.__seekActiveSpMediaEl === 'function') {
                executed = Boolean(
                  pageWin.__seekActiveSpMediaEl(seekSec, Boolean(msg.forceHarmonySeek), isUserScrub)
                );
              }
            } catch (_) {}
            postBridge('SEEK_ACK', { executed: Boolean(executed) });
            return;
          }
          if (msg.cmd === 'SKIP_NEXT_SP_TRACK') {
            if (isShouldDebounceSkip('next')) return;
            try {
              if (pageWin && typeof pageWin.__skipNextSpTrack === 'function') {
                pageWin.__skipNextSpTrack();
              }
            } catch (_) {}
            return;
          }
          if (msg.cmd === 'SKIP_PREV_SP_TRACK') {
            if (isShouldDebounceSkip('prev')) return;
            try {
              if (pageWin && typeof pageWin.__skipPrevSpTrack === 'function') {
                pageWin.__skipPrevSpTrack();
              }
            } catch (_) {}
            return;
          }
          if (
            msg.cmd === 'ACTIVATE_BG_SPOTIFY_HANDOFF' ||
            msg.cmd === 'PAUSE_BG_SP_MEDIA' ||
            msg.cmd === 'RESUME_BG_SP_MEDIA' ||
            msg.cmd === 'TAB_AUDIO_AUTO_PAUSE' ||
            msg.cmd === 'TAB_AUDIO_AUTO_RESUME' ||
            msg.cmd === 'PAUSE_LOCAL_MEDIA' ||
            msg.cmd === 'PM_MEDIA_CONTROL' ||
            msg.cmd === 'TOGGLE_PLAY_PAUSE'
          ) {
            if (msg.cmd === 'TAB_AUDIO_AUTO_PAUSE') {
              mirrorAutoPausedByTab = true;
            } else if (
              msg.cmd === 'TAB_AUDIO_AUTO_RESUME' ||
              msg.cmd === 'PAUSE_LOCAL_MEDIA' ||
              msg.cmd === 'RESUME_BG_SP_MEDIA' ||
              msg.cmd === 'ACTIVATE_BG_SPOTIFY_HANDOFF'
            ) {
              mirrorAutoPausedByTab = false;
              ensureWebAudioKeepalive(ctx.INAUDIBLE_VOLUME);
            }
            const cmdPayload = {
              target: 'pocketmail-media-frame',
              cmd: msg.cmd,
              command: msg.command,
              muted: msg.muted,
              volume: msg.volume,
              resumeUrl: msg.resumeUrl,
              targetSec: msg.targetSec,
              markShouldResume: Boolean(msg.markShouldResume)
            };
            try {
              if (typeof window.__pmHandleMediaFrameCommand === 'function') {
                window.__pmHandleMediaFrameCommand(cmdPayload);
              } else {
                window.postMessage(cmdPayload, '*');
              }
            } catch (_) {}
          }
        });
        emeBridgePort.onDisconnect.addListener(() => {
          emeBridgePort = null;
          if (!isFrameUnloading) {
            setTimeout(() => {
              if (!isFrameUnloading && !emeBridgePort) {
                ensureBridgePort();
              }
            }, 1000);
          }
        });
        try {
          emeBridgePort.postMessage({
            source: 'pocketmail-media-frame',
            type: 'PM_SP_EME_BRIDGE',
            flatFrameName: frameName,
            bridgeType: 'BRIDGE_HELLO',
            href: window.location.href
          });
          ensureWebAudioKeepalive(ctx.INAUDIBLE_VOLUME);
        } catch (_) {}
      }
    } catch (_) {
      emeBridgePort = null;
    }
    return emeBridgePort;
  };
  ensureBridgePort();

  const isMediaSource = (o) => {
    try {
      return Object.prototype.toString.call(o) === '[object MediaSource]';
    } catch (_) {
      return false;
    }
  };

  const copyBuf = (b) => {
    if (!b) return null;
    try {
      const isView = typeof b.byteOffset === 'number' && b.buffer;
      const src = isView ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b);
      const out = new Uint8Array(src.byteLength);
      out.set(src);
      return out.buffer;
    } catch (_) {
      return null;
    }
  };

  const parseDomSpotifyDuration = () => {
    try {
      const durEl = document.querySelector('[data-testid="playback-duration"]');
      return parseClockDuration(durEl ? durEl.textContent : '');
    } catch (_) {}
    return 0;
  };

  const getSpCurrentTrackMeta = (el) => {
    let msId = 0;
    let duration = 0;
    let trackTitle = '';
    let artist = '';
    let album = '';
    let artworkUrl = '';
    let canPrev = true;
    let canNext = true;

    try {
      if (el && el.src) {
        const ms = urlToMs.get(el.src);
        const sbState = ms ? msSbStates.get(ms) : null;
        if (sbState && sbState.msId) msId = sbState.msId;
      }
      const rich = extractRichTrackMeta(ctx, opt, el, false);
      trackTitle = rich.title || '';
      artist = rich.artist || '';
      album = rich.album || '';
      artworkUrl = rich.artworkUrl || '';
      duration = rich.duration || 0;
      canPrev = rich.canPrev !== false;
      canNext = rich.canNext !== false;

      if (!duration && !IS_YT) {
        duration = parseDomSpotifyDuration();
      }
      if (!trackTitle && !IS_YT) {
        const domTitle = document.querySelector('[data-testid="context-item-info-title"]');
        if (domTitle) trackTitle = (domTitle.textContent || '').trim();
      }
      if (!artist && !IS_YT) {
        const domArtist = document.querySelector('[data-testid="context-item-info-subtitles"]');
        if (domArtist) artist = (domArtist.textContent || '').trim();
      }
      if (!artworkUrl && !IS_YT) {
        const coverImg = document.querySelector('[data-testid="cover-art-image"]');
        if (coverImg && coverImg.src) artworkUrl = coverImg.src;
      }
    } catch (_) {}
    return { msId, duration, trackTitle, artist, album, artworkUrl, canPrev, canNext };
  };

  const postBridge = (bridgeType, extra) => {
    if (
      ctx.isStandbyBgFrame &&
      bridgeType !== 'BRIDGE_HELLO' &&
      bridgeType !== 'SERVER_CERT' &&
      bridgeType !== 'LIC_AUTH'
    ) {
      return;
    }
    let enriched = extra || {};
    if (bridgeType === 'SYNC_TIME') {
      const meta = getSpCurrentTrackMeta(getActiveEl());
      if (!IS_YT) {
        const spUiStillPlaying = enriched.explicitPause
          ? false
          : enriched.paused
          ? isSpotifyUiShowingPlaying()
          : true;
        enriched = Object.assign({ spUiStillPlaying }, meta, enriched);
      } else {
        enriched = Object.assign({}, meta, enriched);
      }
    }
    const payload = Object.assign(
      {
        source: 'pocketmail-media-frame',
        type: 'PM_SP_EME_BRIDGE',
        flatFrameName: frameName,
        bridgeType,
        href: window.location.href
      },
      enriched
    );
    const port = ensureBridgePort();
    if (port) {
      try {
        port.postMessage(payload);
        if (!ctx.isBgAudioFrame && !ctx.isStandbyBgFrame) {
          if (bridgeType === 'STOP_PLAYBACK' || (bridgeType === 'SYNC_TIME' && payload.paused)) {
            lastParentSyncSentAt = 0;
            ctx.realTopWin.postMessage(Object.assign({}, payload, { alreadyRoutedToBg: true }), '*');
          } else if (bridgeType === 'SYNC_TIME' && !payload.paused) {
            const now = Date.now();
            if (now - lastParentSyncSentAt > 1200) {
              lastParentSyncSentAt = now;
              ctx.realTopWin.postMessage(Object.assign({}, payload, { alreadyRoutedToBg: true }), '*');
            }
          }
        }
        return;
      } catch (_) {
        emeBridgePort = null;
      }
    }
    if (!ctx.isStandbyBgFrame) {
      try {
        ctx.realTopWin.postMessage(payload, '*');
      } catch (_) {}
    }
  };

  const isYtInlinePreviewEl = (el) => {
    if (!IS_YT || !el) return false;
    try {
      if (el.closest && el.closest('ytd-video-preview, #inline-preview-player, #video-preview')) {
        return true;
      }
    } catch (_) {}
    return false;
  };

  const isYtPlayableRoute = () => {
    if (!IS_YT) return true;
    if (IS_YTM) return true;
    const p = window.location.pathname || '/';
    return p.startsWith('/watch') || p.startsWith('/shorts') || p.startsWith('/live') || p.startsWith('/embed');
  };

  if (IS_YT && !window.location.search.includes('pm_boot=1') && !isYtPlayableRoute()) {
    postBridge('STOP_PLAYBACK', { currentTime: 0, paused: true, explicitPause: true });
  }

  const isYtPlayableEl = (el) => {
    if (!IS_YT || !el) return false;
    if (isYtInlinePreviewEl(el)) return false;
    if (!isYtPlayableRoute()) return false;
    return true;
  };

  const applyPendingYtSeek = (el) => {
    if (!IS_YT || !el || !pendingYtSeekTarget) return;
    const now = Date.now();
    if (now > pendingYtSeekTarget.expiresAt) {
      pendingYtSeekTarget = null;
      return;
    }
    try {
      if (el.readyState >= 1 && !el.seeking) {
        const elapsedSec = Math.max(0, (now - (pendingYtSeekTarget.setAt || now)) / 1000);
        let targetT = pendingYtSeekTarget.time + elapsedSec;
        if (el.duration > 1 && targetT >= el.duration - 0.4) {
          targetT = targetT % el.duration;
        }
        pendingYtSeekTarget = null;
        if (Math.abs((el.currentTime || 0) - targetT) > 1.2) {
          el.currentTime = targetT;
        }
      }
    } catch (_) {}
  };

  const isMusicEl = (el) => {
    if (!el) return false;
    if (IS_YT) {
      if (mirroredEls.has(el)) return true;
      if ((el.tagName === 'VIDEO' || (IS_YTM && el.tagName === 'AUDIO')) && !isYtInlinePreviewEl(el)) return true;
      return false;
    }
    if (el.tagName !== 'VIDEO') return true;
    if (el.mediaKeys) return true;
    return !document.contains(el);
  };

  const getActiveEl = () => {
    for (let i = mediaEls.length - 1; i >= 0; i--) {
      const e = mediaEls[i];
      if (isMusicEl(e) && (!IS_YT || isYtPlayableEl(e)) && !e.paused && !e.ended) return e;
    }
    for (let i = mediaEls.length - 1; i >= 0; i--) {
      const e = mediaEls[i];
      if (isMusicEl(e) && (!IS_YT || isYtPlayableEl(e)) && e.src) return e;
    }
    for (let i = mediaEls.length - 1; i >= 0; i--) {
      const e = mediaEls[i];
      if (isMusicEl(e) && (!IS_YT || isYtPlayableEl(e))) return e;
    }
    return null;
  };

  const findElForMs = (ms) => {
    const mapped = msToEl.get(ms);
    if (mapped) return mapped;
    const u = msUrls.get(ms);
    if (!u) return null;
    const candidates = [...mediaEls, ...Array.from(document.querySelectorAll('video, audio'))];
    const v = candidates.find((x) => x && x.src === u);
    if (v) msToEl.set(ms, v);
    return v || null;
  };

  const attachElToYtSbState = (sbState, el) => {
    if (!sbState || !el || sbState.hookedEl) return;
    sbState.hookedEl = true;
    mirroredEls.add(el);
    try {
      el.wrappedJSObject.__pmMirrored = true;
    } catch (_) {}
    hookMusicElement(el);
  };

  const activateYtSbState = (sbState, el) => {
    if (!sbState) return;
    if (el && !sbState.hookedEl) {
      attachElToYtSbState(sbState, el);
    }
    if (sbState.activated) return;
    sbState.activated = true;
    postBridge('MSE_INIT', { mime: sbState.mime, msId: sbState.msId, href: pageWin.location.href });
    if (sbState.initChunk) {
      postBridge('MSE_CHUNK', {
        mime: sbState.mime,
        msId: sbState.msId,
        chunk: sbState.initChunk,
        timestampOffset: 0
      });
    }
    for (const item of sbState.recentChunks) {
      postBridge('MSE_CHUNK', {
        mime: sbState.mime,
        msId: sbState.msId,
        chunk: item.chunk,
        timestampOffset: item.timestampOffset
      });
    }
    sbState.recentChunks.length = 0;
  };

  const hookMusicElement = (el, isStartingPlay = false) => {
    if (!isMusicEl(el)) return false;
    trackedMediaEls.add(el);
    if (IS_YT && !mirroredEls.has(el)) {
      const u = el.src || '';
      const ms = u ? urlToMs.get(u) : null;
      const sbState = ms ? msSbStates.get(ms) : null;
      if (sbState) {
        activateYtSbState(sbState, el);
      }
      mirroredEls.add(el);
      try {
        el.wrappedJSObject.__pmMirrored = true;
      } catch (_) {}
    }
    const idx = mediaEls.indexOf(el);
    if (isStartingPlay) {
      if (idx >= 0) mediaEls.splice(idx, 1);
      mediaEls.push(el);
      mediaEls.forEach((other) => {
        if (other !== el && !other.paused) {
          try {
            suppressPauseEvent.add(other);
            other.volume = ctx.INAUDIBLE_VOLUME;
            other.pause();
          } catch (_) {}
        }
      });
    } else if (idx < 0) {
      mediaEls.push(el);
    }
    if (lockedEls.has(el)) return true;
    lockedEls.add(el);

    if (typeof el.volume === 'number' && el.volume > 0.001 && activeMirrorDesiredVolume === 1.0) {
      activeMirrorDesiredVolume = el.volume;
    }
    try {
      el.muted = false;
      el.volume = ctx.INAUDIBLE_VOLUME;
      const rawEl = el.wrappedJSObject;
      Object.defineProperty(rawEl, 'volume', {
        get: exportFunction(() => activeMirrorDesiredVolume, pageWin),
        set: exportFunction((v) => {
          const num = Number(v);
          if (!Number.isNaN(num) && num >= 0 && num <= 1) {
            if (num === 0 && Date.now() - lastUserGestureAt >= 1500) {
              return;
            }
            activeMirrorDesiredVolume = num;
            postBridge('VOLUME', { volume: activeMirrorDesiredVolume, muted: activeMirrorDesiredMuted });
          }
        }, pageWin),
        configurable: true
      });
      Object.defineProperty(rawEl, 'muted', {
        get: exportFunction(() => activeMirrorDesiredMuted, pageWin),
        set: exportFunction((m) => {
          const wantMute = Boolean(m);
          if (wantMute && Date.now() - lastUserGestureAt >= 1500) {
            return;
          }
          activeMirrorDesiredMuted = wantMute;
          postBridge('VOLUME', { volume: activeMirrorDesiredVolume, muted: activeMirrorDesiredMuted });
        }, pageWin),
        configurable: true
      });
      postBridge('VOLUME', { volume: activeMirrorDesiredVolume, muted: activeMirrorDesiredMuted });
    } catch (_) {}

    el.addEventListener('volumechange', () => {
      try {
        if (el.volume !== ctx.INAUDIBLE_VOLUME) el.volume = ctx.INAUDIBLE_VOLUME;
        if (el.muted) el.muted = false;
      } catch (_) {}
    });
    el.addEventListener('loadedmetadata', () => {
      if (!isFrameUnloading) applyPendingYtSeek(el);
    });
    el.addEventListener('canplay', () => {
      if (!isFrameUnloading) applyPendingYtSeek(el);
    });
    el.addEventListener('timeupdate', () => {
      if (!isFrameUnloading && pendingYtSeekTarget) applyPendingYtSeek(el);
    });
    el.addEventListener('play', () => {
      if (isFrameUnloading) return;
      ensureWebAudioKeepalive(ctx.INAUDIBLE_VOLUME);
      if (mirrorAutoPausedByTab || (IS_YT && !isYtPlayableEl(el))) {
        try {
          suppressPauseEvent.add(el);
          el.pause();
        } catch (_) {}
        return;
      }
      try {
        if (el.volume !== ctx.INAUDIBLE_VOLUME) el.volume = ctx.INAUDIBLE_VOLUME;
        if (el.muted) el.muted = false;
      } catch (_) {}
      applyPendingYtSeek(el);
      wantPlay.set(el, true);
      if (getActiveEl() === el) {
        mirrorWasPlaying = true;
        postBridge('SYNC_TIME', { currentTime: el.currentTime, paused: false });
      }
    });
    el.addEventListener('playing', () => {
      if (isFrameUnloading) return;
      ensureWebAudioKeepalive(ctx.INAUDIBLE_VOLUME);
      if (mirrorAutoPausedByTab || (IS_YT && !isYtPlayableEl(el))) {
        try {
          suppressPauseEvent.add(el);
          el.pause();
        } catch (_) {}
        return;
      }
      try {
        if (el.volume !== ctx.INAUDIBLE_VOLUME) el.volume = ctx.INAUDIBLE_VOLUME;
        if (el.muted) el.muted = false;
      } catch (_) {}
      applyPendingYtSeek(el);
      wantPlay.set(el, true);
      if (getActiveEl() === el) {
        mirrorWasPlaying = true;
        postBridge('SYNC_TIME', { currentTime: el.currentTime, paused: false });
      }
    });
    el.addEventListener('pause', () => {
      if (suppressPauseEvent.has(el)) {
        suppressPauseEvent.delete(el);
        return;
      }
      if (isFrameUnloading || el.seeking || el.ended) return;
      if (el.readyState === 0 && (!IS_YT || isYtPlayableRoute())) return;
      const recentExplicitPauseGesture =
        Date.now() - lastPauseControlGestureAt < 2200 && lastPauseControlGestureAt >= lastPlayStartedAt;
      const userInitiated = recentExplicitPauseGesture || (IS_YT && !isYtPlayableRoute());
      wantPlay.set(el, false);
      const activeNow = getActiveEl();
      if (!activeNow || activeNow === el || activeNow.paused) {
        mirrorWasPlaying = false;
        postBridge('SYNC_TIME', {
          currentTime: el.currentTime,
          paused: true,
          explicitPause: userInitiated
        });
      }
    });
    el.addEventListener('emptied', () => {
      if (isFrameUnloading) return;
      if (!IS_YT || isYtPlayableRoute()) return;
      wantPlay.set(el, false);
      const activeNow = getActiveEl();
      if (!activeNow || activeNow === el || activeNow.paused) {
        mirrorWasPlaying = false;
        postBridge('STOP_PLAYBACK', {
          currentTime: 0,
          paused: true,
          explicitPause: true
        });
      }
    });
    el.addEventListener('seeked', () => {
      if (isFrameUnloading) return;
      if (getActiveEl() === el) {
        const now = Date.now();
        const isInternalHandoff = now < internalHandoffSeekUntil;
        if (isInternalHandoff) {
          internalHandoffSeekUntil = 0;
        }
        const isExplicitUserScrub = !isInternalHandoff && now - lastUserSeekBarScrubAt < 2500;
        postBridge('SYNC_TIME', {
          currentTime: el.currentTime,
          paused: !wantPlay.get(el) && el.paused,
          forceSeek: isExplicitUserScrub,
          isExplicitUserScrub,
          isInternalHandoff,
          fromSeek: true
        });
      }
    });
    return true;
  };

  const define = (target, name, fn) => {
    try {
      exportFunction(fn, target, { defineAs: name });
    } catch (_) {}
  };

  installAutoplaySpoof(pageWin, define);
  installSharedMediaSessionHooks(pageWin, define);

  if (pageWin.URL) {
    const origCreateUrl = pageWin.URL.createObjectURL;
    define(pageWin.URL, 'createObjectURL', function (obj) {
      const u = origCreateUrl.call(pageWin.URL, obj);
      if (isMediaSource(obj)) {
        const strU = String(u);
        msUrls.set(obj, strU);
        urlToMs.set(strU, obj);
      }
      return u;
    });
  }

  if (!IS_YT && pageWin.WebSocket) {
    try {
      const OrigWS = pageWin.WebSocket;
      const WrappedWS = exportFunction(function (url, protocols) {
        const uStr = String(url || '');
        const ws = protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
        if (uStr.includes('dealer.spotify.com')) {
          dealerSockets.add(ws);
          ws.addEventListener('close', () => dealerSockets.delete(ws), { once: true });
        }
        return ws;
      }, pageWin);
      WrappedWS.prototype = OrigWS.prototype;
      try {
        Object.defineProperty(WrappedWS, 'CONNECTING', { value: 0 });
        Object.defineProperty(WrappedWS, 'OPEN', { value: 1 });
        Object.defineProperty(WrappedWS, 'CLOSING', { value: 2 });
        Object.defineProperty(WrappedWS, 'CLOSED', { value: 3 });
      } catch (_) {}
      pageWin.WebSocket = WrappedWS;
    } catch (_) {}
  }

  const BG_SP_DEV_ID_KEY = '__pm_bg_spharmony_device_id';
  if (!IS_YT && (ctx.isBgAudioFrame || ctx.isStandbyBgFrame) && pageWin.Storage && pageWin.Storage.prototype) {
    try {
      const storageProto = pageWin.Storage.prototype;
      const origGetItem = storageProto.getItem;
      const origSetItem = storageProto.setItem;
      const origRemoveItem = storageProto.removeItem;
      const isLocalStore = (self) => {
        try {
          return Boolean(
            self &&
              (self === window.localStorage ||
                self === pageWin.localStorage ||
                self.wrappedJSObject === pageWin.localStorage)
          );
        } catch (_) {
          return false;
        }
      };
      if (typeof origGetItem === 'function') {
        define(storageProto, 'getItem', function (key) {
          if (String(key) === '_spharmony_device_id' && isLocalStore(this)) {
            try {
              return origGetItem.call(pageWin.sessionStorage, BG_SP_DEV_ID_KEY);
            } catch (_) {}
          }
          return origGetItem.call(this, key);
        });
      }
      if (typeof origSetItem === 'function') {
        define(storageProto, 'setItem', function (key, val) {
          if (String(key) === '_spharmony_device_id' && isLocalStore(this)) {
            try {
              return origSetItem.call(pageWin.sessionStorage, BG_SP_DEV_ID_KEY, val);
            } catch (_) {}
          }
          return origSetItem.call(this, key, val);
        });
      }
      if (typeof origRemoveItem === 'function') {
        define(storageProto, 'removeItem', function (key) {
          if (String(key) === '_spharmony_device_id' && isLocalStore(this)) {
            try {
              return origRemoveItem.call(pageWin.sessionStorage, BG_SP_DEV_ID_KEY);
            } catch (_) {}
          }
          return origRemoveItem.call(this, key);
        });
      }
    } catch (_) {}
  }

  const resolveLocalSpotifyDeviceId = () => {
    try {
      const isIsolatedBg = ctx.isBgAudioFrame || ctx.isStandbyBgFrame;
      const rawStored = isIsolatedBg
        ? window.sessionStorage && window.sessionStorage.getItem(BG_SP_DEV_ID_KEY)
        : window.localStorage && window.localStorage.getItem('_spharmony_device_id');
      if (rawStored) {
        const cleaned = String(rawStored).replace(/^"+|"+$/g, '').trim();
        if (cleaned) {
          spConnectState.deviceId = cleaned;
          return cleaned;
        }
      }
    } catch (_) {}
    return spConnectState.deviceId || '';
  };

  if (!IS_YT && pageWin.fetch) {
    const origFetch = pageWin.fetch;
    const extractFetchHeaders = (input, init) => {
      const hdrs = {};
      try {
        const h = (init && init.headers) || (input && input.headers);
        if (h) {
          if (typeof h.forEach === 'function') {
            h.forEach((v, k) => {
              hdrs[String(k).toLowerCase()] = String(v);
            });
          } else {
            const rawH = h.wrappedJSObject || h;
            Object.keys(rawH).forEach((k) => {
              hdrs[String(k).toLowerCase()] = String(rawH[k]);
            });
          }
        }
      } catch (_) {}
      return hdrs;
    };
    define(pageWin, 'fetch', function (input, init) {
      let url = '';
      let hobsPrefix = '';
      try {
        url = typeof input === 'string' ? input : input && input.url ? String(input.url) : '';
        if (url.includes('widevine-license') && !url.includes('certificate')) {
          const hdrs = {};
          const h = (init && init.headers) || (input && input.headers);
          if (h) {
            if (typeof h.forEach === 'function') {
              h.forEach((v, k) => {
                hdrs[String(k)] = String(v);
              });
            } else {
              const rawH = h.wrappedJSObject || h;
              Object.keys(rawH).forEach((k) => {
                hdrs[String(k)] = String(rawH[k]);
              });
            }
          }
          postBridge('LIC_AUTH', { url, headers: hdrs });
        } else if (url.includes('spclient.spotify.com') || url.includes('api-partner.spotify.com')) {
          const lowerHdrs = extractFetchHeaders(input, init);
          if (lowerHdrs.authorization) spConnectState.headers.authorization = lowerHdrs.authorization;
          if (lowerHdrs['client-token']) spConnectState.headers['client-token'] = lowerHdrs['client-token'];
          const originMatch = url.match(/^(https:\/\/[^/]*spclient\.spotify\.com)\//i);
          if (originMatch) spConnectState.origin = originMatch[1];
          const trackDevMatch = url.match(/\/track-playback\/v1\/devices\/([^/?#]+)/i);
          if (trackDevMatch && trackDevMatch[1]) spConnectState.deviceId = decodeURIComponent(trackDevMatch[1]);
          const devMatch = url.match(/^(https:\/\/[^/]*spclient\.spotify\.com)\/connect-state\/v1\/devices\/hobs_([^/?#]+)/i);
          if (devMatch) {
            spConnectState.origin = devMatch[1];
            hobsPrefix = devMatch[2];
            if (!spConnectState.deviceId) resolveLocalSpotifyDeviceId();
            if (!spConnectState.deviceId) spConnectState.deviceId = hobsPrefix;
          }
        }
      } catch (_) {}
      const fetchPromise = origFetch.call(pageWin, input, init);
      if (url && url.includes('/connect-state/v1/devices/hobs_')) {
        try {
          Promise.resolve(fetchPromise)
            .then((resp) => (resp && resp.ok && typeof resp.clone === 'function' ? resp.clone().json() : null))
            .then((json) => {
              if (!json || typeof json !== 'object') return;
              if (typeof json.active_device_id === 'string') spConnectState.activeDeviceId = json.active_device_id;
              if (hobsPrefix && json.devices && typeof json.devices === 'object') {
                const matchedFullId = Object.keys(json.devices).find(
                  (k) => k === hobsPrefix || k.startsWith(hobsPrefix)
                );
                if (matchedFullId) spConnectState.deviceId = matchedFullId;
              }
            })
            .catch(() => {});
        } catch (_) {}
      }
      return fetchPromise;
    });
  }

  if (!IS_YT && pageWin.MediaKeys && pageWin.MediaKeys.prototype.setServerCertificate) {
    const origCert = pageWin.MediaKeys.prototype.setServerCertificate;
    define(pageWin.MediaKeys.prototype, 'setServerCertificate', function (cert) {
      const c = copyBuf(cert);
      if (c) postBridge('SERVER_CERT', { cert: c });
      return origCert.call(this, cert);
    });
  }

  if (!IS_YT && pageWin.MediaKeySession) {
    const origGen = pageWin.MediaKeySession.prototype.generateRequest;
    define(pageWin.MediaKeySession.prototype, 'generateRequest', function (initDataType, initData) {
      const d = copyBuf(initData);
      if (d) postBridge('GEN_REQ', { initDataType: String(initDataType), initData: d });
      return origGen.call(this, initDataType, initData);
    });
  }

  if (pageWin.MediaSource) {
    const origAddSb = pageWin.MediaSource.prototype.addSourceBuffer;
    define(pageWin.MediaSource.prototype, 'addSourceBuffer', function (mime) {
      const sb = origAddSb.call(this, mime);
      const mimeStr = typeof mime === 'string' ? mime : String(mime || '');
      if (!mimeStr.startsWith('audio/')) return sb;

      const msId = ++msCounter;
      const sbState = {
        ms: this,
        msId,
        mime: mimeStr,
        activated: false,
        hookedEl: false,
        initChunk: null,
        recentChunks: []
      };
      msSbStates.set(this, sbState);

      if (IS_YT) {
        const el = findElForMs(this);
        if (isYtPlayableRoute() && el && !isYtInlinePreviewEl(el)) {
          activateYtSbState(sbState, el);
        }
      } else {
        sbState.activated = true;
        postBridge('MSE_INIT', { mime: mimeStr, msId });
      }

      const rawSb = sb.wrappedJSObject || sb;
      const origApp = rawSb.appendBuffer;
      define(rawSb, 'appendBuffer', function (buf) {
        const c = copyBuf(buf);
        if (c) {
          const tsOffset = Number(rawSb.timestampOffset) || 0;
          if (!sbState.initChunk) sbState.initChunk = c;
          if (IS_YT && (!sbState.activated || !sbState.hookedEl)) {
            const el = findElForMs(sbState.ms);
            if (isYtPlayableRoute() && el && !isYtInlinePreviewEl(el)) {
              activateYtSbState(sbState, el);
            }
          }
          if (sbState.activated && (!IS_YT || isYtPlayableRoute())) {
            postBridge('MSE_CHUNK', { mime: mimeStr, msId, chunk: c, timestampOffset: tsOffset });
          } else if (c !== sbState.initChunk) {
            sbState.recentChunks.push({ chunk: c, timestampOffset: tsOffset });
            if (sbState.recentChunks.length > 16) sbState.recentChunks.shift();
          }
        }
        return origApp.call(rawSb, buf);
      });
      const origRem = rawSb.remove;
      if (typeof origRem === 'function') {
        define(rawSb, 'remove', function (start, end) {
          if (sbState.activated) postBridge('MSE_REMOVE', { msId, start: Number(start), end: Number(end) });
          return origRem.call(rawSb, start, end);
        });
      }
      const origAbort = rawSb.abort;
      if (typeof origAbort === 'function') {
        define(rawSb, 'abort', function () {
          if (sbState.activated) postBridge('MSE_ABORT', { msId });
          return origAbort.call(rawSb);
        });
      }
      return sb;
    });
  }

  if (pageWin.HTMLMediaElement) {
    const proto = pageWin.HTMLMediaElement.prototype;
    if (!IS_YT && proto.setMediaKeys) {
      const origSetMk = proto.setMediaKeys;
      define(proto, 'setMediaKeys', function (mk) {
        if (mk) hookMusicElement(this);
        return origSetMk.call(this, mk);
      });
    }
    if (IS_YT && proto.load) {
      const origLoad = proto.load;
      define(proto, 'load', function () {
        hookMusicElement(this);
        return origLoad.call(this);
      });
    }
    const origPlay = proto.play;
    define(proto, 'play', function () {
      if (mirrorAutoPausedByTab || (IS_YT && !isYtPlayableEl(this))) {
        try {
          suppressPauseEvent.add(this);
          this.pause();
        } catch (_) {}
        return Promise.resolve();
      }
      const isMusic = hookMusicElement(this, true);
      if (isMusic) {
        lastPlayStartedAt = Date.now();
        wantPlay.set(this, true);
        applyPendingYtSeek(this);
      }
      const p = origPlay.call(this);
      if (isMusic && this.currentTime > 0 && !isFrameUnloading && !mirrorAutoPausedByTab) {
        mirrorWasPlaying = true;
        postBridge('SYNC_TIME', { currentTime: this.currentTime, paused: false });
      }
      return p;
    });
  }

  runMirrorSyncTick = () => {
    if (isFrameUnloading || ctx.isStandbyBgFrame) return;
    if (IS_YT) {
      for (let i = 0; i < mediaEls.length; i++) {
        const v = mediaEls[i];
        if (v && !v.paused && !isYtPlayableEl(v)) {
          try {
            suppressPauseEvent.add(v);
            v.pause();
          } catch (_) {}
        }
      }
      if (!isYtPlayableRoute()) {
        if (mirrorWasPlaying) {
          mirrorWasPlaying = false;
          postBridge('STOP_PLAYBACK', { currentTime: 0, paused: true, explicitPause: true });
        }
        return;
      }
    }
    const el = getActiveEl();
    if (mirrorAutoPausedByTab) {
      if (el && !el.paused && !el.ended) {
        try {
          suppressPauseEvent.add(el);
          el.pause();
        } catch (_) {}
      }
      return;
    }
    if (el && !el.paused && !el.ended) {
      applyPendingYtSeek(el);
      mirrorWasPlaying = true;
      postBridge('SYNC_TIME', { currentTime: el.currentTime, paused: false });
    } else if (mirrorWasPlaying) {
      mirrorWasPlaying = false;
      const recentExplicitPause =
        Date.now() - lastPauseControlGestureAt < 2500 && lastPauseControlGestureAt >= lastPlayStartedAt;
      postBridge('SYNC_TIME', {
        currentTime: el ? el.currentTime : 0,
        paused: true,
        explicitPause: recentExplicitPause
      });
    }
  };
  setInterval(runMirrorSyncTick, 400);

  define(pageWin, '__pmPromoteStandbyToBgFrame', function (newName) {
    frameName = String(newName || 'pm-bg-audio-spotify');
    mirrorAutoPausedByTab = false;
    postBridge('BRIDGE_HELLO', {});
  });
  define(pageWin, '__pmMarkUserGesture', function () {
    lastUserGestureAt = Date.now();
  });
  define(pageWin, '__pmDisableSpBridge', function () {});
  define(pageWin, '__pmSetMirrorMute', function (muted) {
    activeMirrorDesiredMuted = Boolean(muted);
  });
  define(pageWin, '__pmSetMirrorVolume', function (volume, muted) {
    const num = Number(volume);
    if (!Number.isNaN(num) && num >= 0 && num <= 1) {
      activeMirrorDesiredVolume = num;
    }
    if (typeof muted === 'boolean') {
      activeMirrorDesiredMuted = muted;
    }
  });
  define(pageWin, '__pmStopYtMirror', function () {
    mirrorWasPlaying = false;
    mirrorAutoPausedByTab = false;
    pendingYtSeekTarget = null;
    mediaEls.forEach((el) => {
      try {
        suppressPauseEvent.add(el);
        if (!el.paused) el.pause();
      } catch (_) {}
    });
    postBridge('STOP_PLAYBACK', { currentTime: 0, paused: true, explicitPause: true });
  });
  define(pageWin, '__pmEnsureMirrorPlay', function (allowMediaSession) {
    ensureWebAudioKeepalive(ctx.INAUDIBLE_VOLUME);
    mirrorAutoPausedByTab = false;
    if (IS_YT && !isYtPlayableRoute()) return false;
    const el = getActiveEl();
    if (allowMediaSession && (!el || el.paused) && typeof capturedMediaSessionHandlers.play === 'function') {
      try {
        capturedMediaSessionHandlers.play();
      } catch (_) {}
    }
    if (el && el.paused && !el.ended) {
      try {
        applyPendingYtSeek(el);
        const p = el.wrappedJSObject.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {}
    }
    return Boolean(el);
  });
  define(pageWin, '__pmPauseAllSpMedia', function () {
    mirrorWasPlaying = false;
    mirrorAutoPausedByTab = false;
    mediaEls.forEach((el) => {
      try {
        if (!el.paused) el.pause();
      } catch (_) {}
    });
    postBridge('STOP_PLAYBACK', { currentTime: 0, paused: true, explicitPause: true });
  });
  define(pageWin, '__pmClearTabAutoPaused', function () {
    mirrorAutoPausedByTab = false;
  });
  define(pageWin, '__pmTempPauseSpMedia', function () {
    let pausedAny = false;
    const hadMirrorPlaying = mirrorWasPlaying;
    mirrorAutoPausedByTab = true;
    mirrorWasPlaying = false;
    let latestTime = 0;
    mediaEls.forEach((el) => {
      try {
        if (el.currentTime > latestTime) latestTime = el.currentTime;
        if (!el.paused) {
          pausedAny = true;
          suppressPauseEvent.add(el);
          el.pause();
        }
      } catch (_) {}
    });
    if (pausedAny || hadMirrorPlaying) {
      postBridge('SYNC_TIME', {
        currentTime: latestTime || 0,
        paused: true,
        explicitPause: false,
        autoPausedByTab: true
      });
    }
    return pausedAny || hadMirrorPlaying;
  });
  define(pageWin, '__pmPrepareHandoffUnload', function () {
    closeDealerSocketsForHandoff();
  });
  define(pageWin, '__skipNextSpTrack', function () {
    try {
      if (typeof capturedMediaSessionHandlers.nexttrack === 'function') {
        capturedMediaSessionHandlers.nexttrack();
        return true;
      }
      const nextBtn = IS_YT
        ? document.querySelector('ytmusic-player-bar .next-button, .ytp-next-button')
        : document.querySelector('[data-testid="control-button-skip-forward"]');
      if (nextBtn && !nextBtn.disabled) {
        nextBtn.click();
        return true;
      }
    } catch (_) {}
    return false;
  });
  define(pageWin, '__skipPrevSpTrack', function () {
    try {
      if (typeof capturedMediaSessionHandlers.previoustrack === 'function') {
        capturedMediaSessionHandlers.previoustrack();
        return true;
      }
      const prevBtn = IS_YT
        ? document.querySelector('ytmusic-player-bar .previous-button, .ytp-prev-button')
        : document.querySelector('[data-testid="control-button-skip-back"]');
      if (prevBtn && !prevBtn.disabled) {
        prevBtn.click();
        return true;
      }
    } catch (_) {}
    return false;
  });
  define(pageWin, '__pmGetSpotifyConnectState', function () {
    const stateObj = {
      deviceId: spConnectState.deviceId || resolveLocalSpotifyDeviceId() || '',
      activeDeviceId: spConnectState.activeDeviceId || '',
      hasAuth: Boolean(spConnectState.headers && spConnectState.headers.authorization),
      hasConnectState: Boolean(spConnectState.activeDeviceId || spConnectState.deviceId)
    };
    return typeof cloneInto === 'function' ? cloneInto(stateObj, pageWin) : stateObj;
  });
  define(pageWin, '__pmPostSpBridgeSeekAck', function (executed) {
    postBridge('SEEK_ACK', { executed: Boolean(executed) });
  });
  define(pageWin, '__pmEnsureSpotifyLocalTakeover', function (forceTransfer) {
    try {
      const el = getActiveEl();
      if (el && !el.paused && !el.ended && el.readyState >= 1) {
        return 'playing';
      }
      const localDevId = resolveLocalSpotifyDeviceId();
      const hasLocalStreamAttached = Boolean(el && (el.src || el.mediaKeys));
      const isActiveOnDifferentDevice = Boolean(
        spConnectState.activeDeviceId && localDevId && spConnectState.activeDeviceId !== localDevId
      );
      const fromDev = spConnectState.activeDeviceId || localDevId;
      const isCrossDeviceTransfer = Boolean(fromDev && localDevId && fromDev !== localDevId);
      const now = Date.now();
      const throttleOk = isCrossDeviceTransfer
        ? now - spConnectState.lastTransferAt > 2400
        : now - spConnectState.lastSelfTransferAt > 2400;
      if (
        forceTransfer &&
        localDevId &&
        spConnectState.headers.authorization &&
        (!hasLocalStreamAttached || isActiveOnDifferentDevice) &&
        throttleOk
      ) {
        if (isCrossDeviceTransfer) {
          spConnectState.lastTransferAt = now;
        } else {
          spConnectState.lastSelfTransferAt = now;
        }
        const transferUrl = `${spConnectState.origin}/connect-state/v1/connect/transfer/from/${encodeURIComponent(
          fromDev
        )}/to/${encodeURIComponent(localDevId)}`;
        const reqHeaders = Object.assign({}, spConnectState.headers, {
          'content-type': 'application/json'
        });
        const postBody = JSON.stringify({
          transfer_options: { restore_paused: 'resume' }
        });
        const fetchOpts = { method: 'POST', headers: reqHeaders, body: postBody };
        const safeOpts = typeof cloneInto === 'function' ? cloneInto(fetchOpts, pageWin) : fetchOpts;
        const fetchFn = pageWin.fetch || window.fetch;
        fetchFn.call(pageWin, transferUrl, safeOpts).catch(() => {});
        return 'transferred';
      }
      const expectedTitle = String(ctx.state.expectedTrackTitle || '').trim().toLowerCase();
      const domTitleEl = document.querySelector('[data-testid="context-item-info-title"]');
      const domTitle = domTitleEl ? (domTitleEl.textContent || '').trim().toLowerCase() : '';
      const hasTrackMismatch = Boolean(
        expectedTitle && expectedTitle !== 'spotify' && domTitle && domTitle !== expectedTitle
      );
      if (hasTrackMismatch) {
        return 'track-mismatch';
      }
      if (!forceTransfer && typeof capturedMediaSessionHandlers.play === 'function') {
        capturedMediaSessionHandlers.play();
        return 'mediasession-play';
      }
      const spToggle = document.querySelector('[data-testid="control-button-playpause"]');
      if (spToggle && !spToggle.disabled) {
        const aria = (spToggle.getAttribute('aria-label') || '').toLowerCase();
        if (!aria.includes('pause') && !aria.includes('stop')) {
          if (!expectedTitle || expectedTitle === 'spotify' || domTitle === expectedTitle) {
            spToggle.click();
            return 'clicked-play';
          }
        }
      }
    } catch (_) {}
    return 'noop';
  });
  define(pageWin, '__seekActiveSpMediaEl', function (targetTime, forceHarmonySeek, isUserScrub) {
    try {
      const t = Number(targetTime);
      if (!(t >= 0)) return false;
      if (isUserScrub) {
        internalHandoffSeekUntil = 0;
        lastUserSeekBarScrubAt = Date.now();
        lastUserGestureAt = Date.now();
      } else {
        internalHandoffSeekUntil = Date.now() + 4000;
      }
      if (IS_YT) {
        if (!(t >= 0)) return false;
        pendingYtSeekTarget = { time: t, setAt: Date.now(), expiresAt: Date.now() + 4500 };
        const el = getActiveEl();
        if (el) applyPendingYtSeek(el);
        return true;
      }
      const el = getActiveEl();
      const hasSeekToHandler = typeof capturedMediaSessionHandlers.seekto === 'function';
      if (!forceHarmonySeek && el && el.buffered && el.buffered.length > 0) {
        for (let i = 0; i < el.buffered.length; i++) {
          if (t >= el.buffered.start(i) && t <= el.buffered.end(i) - 0.1) {
            if (Math.abs((el.currentTime || 0) - t) > 1.2) {
              el.currentTime = t;
            }
            if (hasSeekToHandler) {
              const seekArg =
                typeof cloneInto === 'function'
                  ? cloneInto({ seekTime: t, fastSeek: false }, pageWin)
                  : { seekTime: t, fastSeek: false };
              capturedMediaSessionHandlers.seekto(seekArg);
              return true;
            }
            break;
          }
        }
      }
      if (hasSeekToHandler) {
        const seekArg =
          typeof cloneInto === 'function'
            ? cloneInto({ seekTime: t, fastSeek: false }, pageWin)
            : { seekTime: t, fastSeek: false };
        capturedMediaSessionHandlers.seekto(seekArg);
        return true;
      }
      const dur = capturedMediaSessionDuration || parseDomSpotifyDuration();
      const rangeInput = document.querySelector(
        '[data-testid="playback-progressbar"] input[type="range"]'
      );
      if (dur > 1 && rangeInput) {
        try {
          const maxAttr = Number(rangeInput.max) || 0;
          const nextVal = maxAttr > dur * 100 ? Math.round(t * 1000) : Math.round(t);
          const nativeSetter = Object.getOwnPropertyDescriptor(
            pageWin.HTMLInputElement ? pageWin.HTMLInputElement.prototype : HTMLInputElement.prototype,
            'value'
          )?.set;
          if (nativeSetter) {
            nativeSetter.call(rangeInput.wrappedJSObject || rangeInput, String(nextVal));
          } else {
            rangeInput.value = String(nextVal);
          }
          rangeInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          rangeInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        } catch (_) {}
      }
      const progBar = document.querySelector(
        '[data-testid="playback-progressbar"] [data-testid="progress-bar"], [data-testid="playback-progressbar"]'
      );
      if (dur > 1 && progBar) {
        const rect = progBar.getBoundingClientRect();
        if (rect && rect.width > 20) {
          const ratio = Math.min(0.995, Math.max(0.002, t / dur));
          const clientX = rect.left + rect.width * ratio;
          const clientY = rect.top + rect.height / 2;
          progBar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: 1, pointerId: 1, isPrimary: true }));
          progBar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: 1 }));
          progBar.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: 0, pointerId: 1, isPrimary: true }));
          progBar.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: 0 }));
          progBar.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY, button: 0 }));
          return true;
        }
      }
    } catch (_) {}
    return false;
  });
  define(pageWin, '__getSpDiag', function () {
    try {
      const el = getActiveEl();
      if (!el) return null;
      return JSON.stringify({
        paused: Boolean(el.paused),
        ended: Boolean(el.ended),
        ct: Number(el.currentTime) || 0,
        rs: Number(el.readyState) || 0,
        hasKeys: Boolean(el.mediaKeys)
      });
    } catch (_) {
      return null;
    }
  });
  define(pageWin, '__pmMirrorDiag', function () {
    try {
      return JSON.stringify(
        mediaEls.map((el, i) => {
          const buf = [];
          try {
            for (let j = 0; j < el.buffered.length; j++) {
              buf.push([Math.round(el.buffered.start(j) * 10) / 10, Math.round(el.buffered.end(j) * 10) / 10]);
            }
          } catch (_) {}
          return {
            idx: i,
            paused: el.paused,
            ct: Math.round((el.currentTime || 0) * 100) / 100,
            rs: el.readyState,
            realVol: el.volume,
            hasKeys: Boolean(el.mediaKeys),
            buf
          };
        })
      );
    } catch (_) {
      return '[]';
    }
  });
}
