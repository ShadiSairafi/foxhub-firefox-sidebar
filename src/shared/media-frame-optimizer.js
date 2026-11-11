/**
 * PocketMail — Embedded Media Frame & Sidebar Optimizer (Content Script)
 * Runs ONLY inside PocketMail's embedded media iframe (window.top !== window.self)
 * or PocketMail's direct Firefox Left Sidebar panel.
 * Never touches normal browser tabs.
 *
 * Responsibilities:
 * 1. Eliminates white flash on load & signals parent Loading Screen when ready.
 * 2. Injects tailored, route-aware responsive CSS & DOM adapters for:
 *    Instagram, WhatsApp Web, Discord, Telegram, Spotify, YouTube, YT Music,
 *    Reddit, TikTok, X (Twitter), Messenger, Twitch, and ChatGPT.
 * 3. Provides cross-origin postMessage bridge for Back, Forward, Reload, and Auto-Fit Zoom.
 */

(function initPocketMailMediaFrameOptimizer() {
  const realTopWin = window.top;
  const isTopFrame = realTopWin === window.self;
  const isDirectChildIframe = !isTopFrame && window.parent === realTopWin;
  const host = (window.location.hostname || '').toLowerCase();
  const isGoogleAccountWidgetIframe =
    !isTopFrame &&
    (host === 'ogs.google.com' ||
      (host === 'accounts.google.com' && (window.location.pathname || '').includes('/AccountChooser')));
  const isPocketMailSidebarTop =
    isTopFrame &&
    (window.location.hash.includes('pm-sidebar') || window.name === 'pm-opera-sidebar');

  // Passive External Browser Tab Media Watcher (0 DOM/CSS touch): notifies FoxHub immediately when an unmuted
  // video/audio starts or stops in a normal browser tab and prevents false Spotify resumes during quiet video scenes!
  function installExternalTabMediaWatcher() {
    let lastPlayNotifyAt = 0;
    let pauseReportTimer = null;

    const isAudiblePlayingElement = (el) => {
      if (!el || el.paused || el.ended) return false;
      if (el.muted || Number(el.volume) === 0) return false;
      if (el.mozHasAudio === false) return false;
      return true;
    };

    const hasAnyActiveAudibleMediaHere = () => {
      try {
        const els = document.querySelectorAll('video, audio');
        for (let i = 0; i < els.length; i++) {
          if (isAudiblePlayingElement(els[i])) return true;
        }
      } catch (_) {}
      return false;
    };

    const notifyTabMediaPlaying = (ev) => {
      const el = ev && ev.target;
      if (!el || (el.tagName !== 'VIDEO' && el.tagName !== 'AUDIO')) return;
      if (!isAudiblePlayingElement(el)) return;
      const now = Date.now();
      if (now - lastPlayNotifyAt < 350) return;
      lastPlayNotifyAt = now;
      clearTimeout(pauseReportTimer);
      try {
        browser.runtime.sendMessage({ type: 'EXTERNAL_TAB_MEDIA_PLAYING' }).catch(() => {});
      } catch (_) {}
    };

    const notifyTabMediaStopped = (ev) => {
      const el = ev && ev.target;
      if (!el || (el.tagName !== 'VIDEO' && el.tagName !== 'AUDIO')) return;
      clearTimeout(pauseReportTimer);
      pauseReportTimer = setTimeout(() => {
        if (!hasAnyActiveAudibleMediaHere()) {
          try {
            browser.runtime.sendMessage({ type: 'EXTERNAL_TAB_MEDIA_STOPPED' }).catch(() => {});
          } catch (_) {}
        }
      }, 220);
    };

    window.addEventListener('playing', notifyTabMediaPlaying, { capture: true, passive: true });
    window.addEventListener(
      'volumechange',
      (ev) => {
        const el = ev && ev.target;
        if (!el || (el.tagName !== 'VIDEO' && el.tagName !== 'AUDIO')) return;
        if (isAudiblePlayingElement(el)) {
          notifyTabMediaPlaying(ev);
        } else {
          notifyTabMediaStopped(ev);
        }
      },
      { capture: true, passive: true }
    );
    window.addEventListener('pause', notifyTabMediaStopped, { capture: true, passive: true });
    window.addEventListener('ended', notifyTabMediaStopped, { capture: true, passive: true });
    window.addEventListener('emptied', notifyTabMediaStopped, { capture: true, passive: true });
    window.addEventListener(
      'timeupdate',
      (ev) => {
        if (Date.now() - lastPlayNotifyAt < 1800) return;
        const el = ev && ev.target;
        if (el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') && isAudiblePlayingElement(el)) {
          notifyTabMediaPlaying(ev);
        }
      },
      { capture: true, passive: true }
    );

    try {
      browser.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'CHECK_TAB_HAS_ACTIVE_MEDIA') {
          if (hasAnyActiveAudibleMediaHere()) {
            return Promise.resolve({ hasActiveMedia: true });
          }
        }
        return undefined;
      });
    } catch (_) {}
  }

  const rawWindowName = typeof window.name === 'string' ? window.name : '';
  const pmtIdx = rawWindowName.indexOf('__pmt=');
  let cleanWindowName = pmtIdx >= 0 ? rawWindowName.slice(0, pmtIdx) : rawWindowName;
  let initialSyncThemeMode = '';
  let initialSyncAccent = '';
  if (pmtIdx >= 0) {
    try {
      const metaPart = rawWindowName.slice(pmtIdx + 6);
      const pmaIdx = metaPart.indexOf('__pma=');
      if (pmaIdx >= 0) {
        initialSyncThemeMode = decodeURIComponent(metaPart.slice(0, pmaIdx));
        initialSyncAccent = decodeURIComponent(metaPart.slice(pmaIdx + 6));
      } else {
        initialSyncThemeMode = decodeURIComponent(metaPart);
      }
    } catch (_) {}
  }

  let isStandbyBgFrame = cleanWindowName.startsWith('pm-bg-standby-');
  let isBgAudioFrame = cleanWindowName.startsWith('pm-bg-audio-');
  const isFoxHubMediaFrame = /^pm-(media-frame|bg-audio|bg-standby)-/.test(cleanWindowName);
  let isFoxHubContext = isFoxHubMediaFrame || isPocketMailSidebarTop;
  if (isFoxHubContext) {
    try {
      window.sessionStorage.setItem('__pm_foxhub_frame', '1');
    } catch (_) {}
  } else if (isDirectChildIframe) {
    try {
      if (window.sessionStorage.getItem('__pm_foxhub_frame') === '1') {
        isFoxHubContext = true;
      }
    } catch (_) {}
  }

  // Never run FoxHub sidebar CSS/DOM optimizations in normal browser tabs or nested third-party iframes
  if (!isFoxHubContext && !isGoogleAccountWidgetIframe) {
    if (isTopFrame || isDirectChildIframe) {
      installExternalTabMediaWatcher();
    }
    return;
  }
  if (isFoxHubContext) {
    try {
      if (initialSyncThemeMode) {
        window.sessionStorage.setItem('__pm_social_theme', initialSyncThemeMode);
      } else {
        initialSyncThemeMode = window.sessionStorage.getItem('__pm_social_theme') || '';
      }
      if (initialSyncAccent) {
        window.sessionStorage.setItem('__pm_social_accent', initialSyncAccent);
      } else {
        initialSyncAccent = window.sessionStorage.getItem('__pm_social_accent') || '';
      }
    } catch (_) {}
  }
  let initialThemeResolved = !isFoxHubContext || Boolean(initialSyncThemeMode);
  const initialAutoplayPolicy =
    typeof navigator.getAutoplayPolicy === 'function' ? navigator.getAutoplayPolicy('mediaelement') : 'allowed';
  const isMirrorAudioHost = host.includes('spotify.com') || host.includes('youtube.com');

  // Ensure background audio keep-alive frames and mirrored media frames report visibilityState='visible'
  // so YouTube & Spotify never defer player boot or self-pause when the popup/sidebar loses focus or closes.
  if ((isBgAudioFrame || (isFoxHubMediaFrame && isMirrorAudioHost)) && window.wrappedJSObject && typeof exportFunction === 'function') {
    try {
      const pageWin = window.wrappedJSObject;
      const getVisible = exportFunction(() => 'visible', pageWin);
      const getFalse = exportFunction(() => false, pageWin);
      Object.defineProperty(pageWin.Document.prototype, 'visibilityState', { get: getVisible, configurable: true });
      Object.defineProperty(pageWin.Document.prototype, 'hidden', { get: getFalse, configurable: true });
      window.addEventListener(
        'visibilitychange',
        (ev) => {
          ev.stopImmediatePropagation();
        },
        true
      );
    } catch (_) {}
  }

  // Zero-Socket MSE Audio Mirror for Spotify (Widevine EME) and YouTube (clear MSE): streams the page's audio SourceBuffer
  // to the persistent background.html player, which is the ONLY audible output, so closing/reopening the sidebar never cuts audio.
  if (isMirrorAudioHost && !isTopFrame) {
    try {
      installMediaMirrorHooks();
    } catch (_) {}
  }

  // On TikTok (and Instagram), disable broken HEVC / ByteVC1 (hev1 / hvc1) codec probing on Windows Firefox
  // so TikTok's xgplayer immediately requests rock-solid H.264 (avc1) / VP9 streams instead of failing with
  // MEDIA_ERR_DECODE (RemoteVideoDecoderChild::InitIPDL) and auto-scrolling 3 reels on startup!
  if ((host.includes('tiktok.com') || host.includes('instagram.com')) && !isTopFrame && window.wrappedJSObject && typeof exportFunction === 'function') {
    try {
      const pageWin = window.wrappedJSObject;
      const isHevcMime = (mime) => /hev1|hvc1|hevc|bytevc|bvc1/i.test(String(mime || ''));
      if (pageWin.MediaSource && typeof pageWin.MediaSource.isTypeSupported === 'function') {
        const origIsSupported = pageWin.MediaSource.isTypeSupported.bind(pageWin.MediaSource);
        exportFunction(
          function (mime) {
            if (isHevcMime(mime)) return false;
            return origIsSupported(mime);
          },
          pageWin.MediaSource,
          { defineAs: 'isTypeSupported' }
        );
      }
      if (pageWin.HTMLMediaElement && pageWin.HTMLMediaElement.prototype) {
        const origCanPlay = pageWin.HTMLMediaElement.prototype.canPlayType;
        exportFunction(
          function (mime) {
            if (isHevcMime(mime)) return '';
            return origCanPlay.call(this, mime);
          },
          pageWin.HTMLMediaElement.prototype,
          { defineAs: 'canPlayType' }
        );
      }
      if (host.includes('tiktok.com')) {
        try {
          Object.keys(window.localStorage).forEach((k) => {
            if (/hevc|bvc|bytevc|codec/i.test(k)) {
              window.localStorage.removeItem(k);
            }
          });
        } catch (_) {}
      }
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------------------------
  // Audio mirror for Spotify (Widevine EME) and YouTube (clear MSE), installed from this content
  // script with exportFunction (works under YouTube's strict CSP, unlike eval / <script> injection).
  // It mirrors the page's audio SourceBuffer directly to background.html via a dedicated runtime port,
  // and keeps the page's own element silent, so closing/reopening the sidebar never cuts the audio.
  // Only runs inside FoxHub's own frames (pm-media-frame-* / pm-bg-audio-*).
  // ---------------------------------------------------------------------------------------------
  function installMediaMirrorHooks() {
    const pageWin = window.wrappedJSObject;
    if (!pageWin || typeof exportFunction !== 'function') return;
    if (!isFoxHubMediaFrame) return;
    if (pageWin.__pmSpHookInstalled) return;
    pageWin.__pmSpHookInstalled = true;
    pageWin.__pmSpBridgeEnabled = true;

    const IS_YT = host.includes('youtube.com');
    let frameName = cleanWindowName;
    const mediaEls = []; // Xray-wrapped hooked music elements (most recent last)
    const mirroredEls = new WeakSet(); // YouTube main-player elements whose MediaSource is mirrored
    const lockedEls = new WeakSet();
    const suppressPauseEvent = new WeakSet();
    const wantPlay = new WeakMap();
    const msUrls = new WeakMap();
    const urlToMs = new Map();
    const msToEl = new WeakMap();
    const msSbStates = new WeakMap(); // MediaSource -> sbState
    const dealerSockets = new Set(); // Active Spotify dealer.spotify.com WebSockets
    const spMediaSessionHandlers = {}; // action -> page callback
    let spMediaSessionDuration = 0;
    const spConnectState = {
      origin: 'https://gew4-spclient.spotify.com',
      deviceId: '',
      activeDeviceId: '',
      headers: {},
      lastTransferAt: 0
    };
    let msCounter = Date.now();
    let isFrameUnloading = false;
    let lastUserGestureAt = 0;
    let lastPlayStartedAt = 0;
    let lastParentSyncSentAt = 0;
    let lastSidebarGestureBridgeAt = 0;
    let lastBgHeartbeatReportAt = 0;
    let mirrorWasPlaying = false;
    let mirrorAutoPausedByTab = false;
    let pendingYtSeekTarget = null; // { time: number, expiresAt: number }
    let bgTimerSeq = 900000000;
    const bridgedTimerCallbacks = new Map(); // timerId -> { cb, extraArgs, isInterval }
    let runMirrorSyncTick = () => {};

    const closeDealerSocketsForHandoff = () => {
      isFrameUnloading = true;
      bridgedTimerCallbacks.clear();
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
    };
    window.addEventListener('pagehide', markUnloading, true);
    window.addEventListener('beforeunload', markUnloading, true);
    window.addEventListener('unload', markUnloading, true);

    // Prevent Firefox compositor from freezing requestAnimationFrame to 0fps inside hidden background audio keep-alive frames!
    if ((isBgAudioFrame || isStandbyBgFrame) && pageWin.requestAnimationFrame) {
      try {
        let rafSeq = 1;
        const rafTimers = new Map();
        exportFunction(
          function (cb) {
            const id = ++rafSeq;
            const tid = window.setTimeout(() => {
              rafTimers.delete(id);
              try {
                cb(window.performance && typeof window.performance.now === 'function' ? window.performance.now() : Date.now());
              } catch (_) {}
            }, 33);
            rafTimers.set(id, tid);
            return id;
          },
          pageWin,
          { defineAs: 'requestAnimationFrame' }
        );
        exportFunction(
          function (id) {
            const tid = rafTimers.get(Number(id));
            if (tid !== undefined) {
              rafTimers.delete(Number(id));
              window.clearTimeout(tid);
            }
          },
          pageWin,
          { defineAs: 'cancelAnimationFrame' }
        );
      } catch (_) {}
    }

    const notifySidebarUserInteraction = (ev) => {
      if (isBgAudioFrame || isStandbyBgFrame || IS_YT) return;
      if (!ev || !ev.isTrusted) return;
      const now = Date.now();
      let isSeekBar = false;
      try {
        if (ev.target && ev.target.closest) {
          isSeekBar = Boolean(
            ev.target.closest('[data-testid="playback-progressbar"], [data-testid="progress-bar"]')
          );
        }
      } catch (_) {}
      if (!isSeekBar && now - lastSidebarGestureBridgeAt < 220) return;
      lastSidebarGestureBridgeAt = now;
      postBridge('USER_INTERACTION', { isSeekBar });
    };

    const recordUserGesture = (ev) => {
      lastUserGestureAt = Date.now();
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
        }
      },
      { capture: true, passive: true }
    );
    window.addEventListener(
      'pointerup',
      (ev) => {
        if (ev && ev.isTrusted) {
          lastUserGestureAt = Date.now();
          notifySidebarUserInteraction(ev);
        }
      },
      { capture: true, passive: true }
    );
    window.addEventListener(
      'wheel',
      (ev) => {
        if (ev && ev.isTrusted) {
          lastUserGestureAt = Date.now();
        }
      },
      { capture: true, passive: true }
    );

    // Clear any persisted muted state in YouTube's player storage so reopened YouTube frames never boot muted
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
            if (msg.cmd === 'BG_TIMER_FIRE') {
              const tid = Number(msg.timerId);
              const entry = bridgedTimerCallbacks.get(tid);
              if (!entry) return;
              if (!entry.isInterval) {
                bridgedTimerCallbacks.delete(tid);
              }
              try {
                if (entry.extraArgs) {
                  entry.cb.apply(pageWin, entry.extraArgs);
                } else {
                  entry.cb.call(pageWin);
                }
              } catch (_) {}
              return;
            }
            if (msg.cmd === 'BG_HEARTBEAT_TICK') {
              if (isBgAudioFrame && !isFrameUnloading) {
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
              let executed = false;
              try {
                if (pageWin && typeof pageWin.__seekActiveSpMediaEl === 'function') {
                  executed = Boolean(
                    pageWin.__seekActiveSpMediaEl(Number(msg.currentTime) || 0, Boolean(msg.forceHarmonySeek))
                  );
                }
              } catch (_) {}
              postBridge('SEEK_ACK', { executed });
              return;
            }
            if (msg.cmd === 'SKIP_NEXT_SP_TRACK') {
              try {
                if (pageWin && typeof pageWin.__skipNextSpTrack === 'function') {
                  pageWin.__skipNextSpTrack();
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
              msg.cmd === 'PAUSE_LOCAL_MEDIA'
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
              }
              try {
                if (typeof window.__pmHandleMediaFrameCommand === 'function') {
                  window.__pmHandleMediaFrameCommand({
                    target: 'pocketmail-media-frame',
                    cmd: msg.cmd,
                    resumeUrl: msg.resumeUrl,
                    targetSec: msg.targetSec,
                    markShouldResume: Boolean(msg.markShouldResume)
                  });
                } else {
                  window.postMessage(
                    {
                      target: 'pocketmail-media-frame',
                      cmd: msg.cmd,
                      resumeUrl: msg.resumeUrl,
                      targetSec: msg.targetSec,
                      markShouldResume: Boolean(msg.markShouldResume)
                    },
                    '*'
                  );
                }
              } catch (_) {}
            }
          });
          emeBridgePort.onDisconnect.addListener(() => {
            emeBridgePort = null;
          });
          try {
            emeBridgePort.postMessage({
              source: 'pocketmail-media-frame',
              type: 'PM_SP_EME_BRIDGE',
              flatFrameName: frameName,
              bridgeType: 'BRIDGE_HELLO',
              href: window.location.href
            });
          } catch (_) {}
        }
      } catch (_) {
        emeBridgePort = null;
      }
      return emeBridgePort;
    };
    ensureBridgePort();

    // Unthrottled timer bridge for hidden Spotify background frames: prevents Gecko's background tab budget
    // from throttling Harmony segment fetches or dealer.spotify.com WebSocket heartbeats over long sessions!
    if (!IS_YT && (isBgAudioFrame || isStandbyBgFrame) && pageWin.setTimeout && pageWin.setInterval) {
      try {
        const origSetTimeout = pageWin.setTimeout;
        const origClearTimeout = pageWin.clearTimeout;
        const origSetInterval = pageWin.setInterval;
        const origClearInterval = pageWin.clearInterval;

        exportFunction(
          function (cb, delay) {
            const ms = Number(delay) || 0;
            if (typeof cb === 'function' && !isFrameUnloading && ms >= 45 && ms <= 45000) {
              const port = ensureBridgePort();
              if (port) {
                const tid = ++bgTimerSeq;
                const extraArgs = arguments.length > 2 ? Array.prototype.slice.call(arguments, 2) : null;
                bridgedTimerCallbacks.set(tid, { cb, extraArgs, isInterval: false });
                try {
                  port.postMessage({
                    type: 'PM_BG_TIMER_BRIDGE',
                    op: 'SET',
                    timerId: tid,
                    delay: ms,
                    isInterval: false
                  });
                  return tid;
                } catch (_) {
                  bridgedTimerCallbacks.delete(tid);
                }
              }
            }
            return origSetTimeout.apply(pageWin, arguments);
          },
          pageWin,
          { defineAs: 'setTimeout' }
        );

        exportFunction(
          function (id) {
            const numId = Number(id);
            if (numId > 900000000) {
              bridgedTimerCallbacks.delete(numId);
              if (emeBridgePort) {
                try {
                  emeBridgePort.postMessage({ type: 'PM_BG_TIMER_BRIDGE', op: 'CLEAR', timerId: numId });
                } catch (_) {}
              }
              return;
            }
            return origClearTimeout.call(pageWin, id);
          },
          pageWin,
          { defineAs: 'clearTimeout' }
        );

        exportFunction(
          function (cb, delay) {
            const ms = Number(delay) || 0;
            if (typeof cb === 'function' && !isFrameUnloading && ms >= 45 && ms <= 45000) {
              const port = ensureBridgePort();
              if (port) {
                const tid = ++bgTimerSeq;
                const extraArgs = arguments.length > 2 ? Array.prototype.slice.call(arguments, 2) : null;
                bridgedTimerCallbacks.set(tid, { cb, extraArgs, isInterval: true });
                try {
                  port.postMessage({
                    type: 'PM_BG_TIMER_BRIDGE',
                    op: 'SET',
                    timerId: tid,
                    delay: ms,
                    isInterval: true
                  });
                  return tid;
                } catch (_) {
                  bridgedTimerCallbacks.delete(tid);
                }
              }
            }
            return origSetInterval.apply(pageWin, arguments);
          },
          pageWin,
          { defineAs: 'setInterval' }
        );

        exportFunction(
          function (id) {
            const numId = Number(id);
            if (numId > 900000000) {
              bridgedTimerCallbacks.delete(numId);
              if (emeBridgePort) {
                try {
                  emeBridgePort.postMessage({ type: 'PM_BG_TIMER_BRIDGE', op: 'CLEAR', timerId: numId });
                } catch (_) {}
              }
              return;
            }
            return origClearInterval.call(pageWin, id);
          },
          pageWin,
          { defineAs: 'clearInterval' }
        );
      } catch (_) {}
    }

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
        const txt = durEl ? (durEl.textContent || '').trim() : '';
        if (txt && txt.includes(':')) {
          const parts = txt.split(':').map((n) => parseInt(n, 10));
          if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
            return parts[0] * 60 + parts[1];
          }
          if (parts.length === 3 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1]) && !Number.isNaN(parts[2])) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
          }
        }
      } catch (_) {}
      return 0;
    };

    const getSpCurrentTrackMeta = (el) => {
      if (IS_YT) return {};
      let msId = 0;
      let duration = 0;
      let trackTitle = '';
      try {
        if (el && el.src) {
          const ms = urlToMs.get(el.src);
          const sbState = ms ? msSbStates.get(ms) : null;
          if (sbState && sbState.msId) msId = sbState.msId;
        }
        if (el && Number.isFinite(el.duration) && el.duration > 0 && el.duration < 86400) {
          duration = el.duration;
        } else if (spMediaSessionDuration > 0) {
          duration = spMediaSessionDuration;
        } else {
          duration = parseDomSpotifyDuration();
        }
        const metaTitle = pageWin.navigator && pageWin.navigator.mediaSession && pageWin.navigator.mediaSession.metadata
          ? String(pageWin.navigator.mediaSession.metadata.title || '').trim()
          : '';
        if (metaTitle) {
          trackTitle = metaTitle;
        } else {
          const domTitle = document.querySelector('[data-testid="context-item-info-title"]');
          if (domTitle) trackTitle = (domTitle.textContent || '').trim();
        }
      } catch (_) {}
      return { msId, duration, trackTitle };
    };

    const postBridge = (bridgeType, extra) => {
      if (
        isStandbyBgFrame &&
        bridgeType !== 'BRIDGE_HELLO' &&
        bridgeType !== 'SERVER_CERT' &&
        bridgeType !== 'LIC_AUTH'
      ) {
        return;
      }
      let enriched = extra || {};
      if (bridgeType === 'SYNC_TIME' && !IS_YT) {
        const meta = getSpCurrentTrackMeta(getActiveEl());
        let spUiStillPlaying = false;
        if (enriched.paused) {
          try {
            const spToggle = document.querySelector('[data-testid="control-button-playpause"]');
            const aria = spToggle ? (spToggle.getAttribute('aria-label') || '').toLowerCase() : '';
            spUiStillPlaying = aria.includes('pause');
          } catch (_) {}
        }
        enriched = Object.assign({ spUiStillPlaying }, meta, enriched);
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
          // Notify parent popup.js of play/pause/stop state transitions (marked alreadyRoutedToBg so popup.js never double-forwards to background!)
          if (!isBgAudioFrame && !isStandbyBgFrame) {
            if (bridgeType === 'STOP_PLAYBACK' || (bridgeType === 'SYNC_TIME' && payload.paused)) {
              lastParentSyncSentAt = 0;
              realTopWin.postMessage(Object.assign({}, payload, { alreadyRoutedToBg: true }), '*');
            } else if (bridgeType === 'SYNC_TIME' && !payload.paused) {
              const now = Date.now();
              if (now - lastParentSyncSentAt > 1200) {
                lastParentSyncSentAt = now;
                realTopWin.postMessage(Object.assign({}, payload, { alreadyRoutedToBg: true }), '*');
              }
            }
          }
          return;
        } catch (_) {
          emeBridgePort = null;
        }
      }
      if (!isStandbyBgFrame) {
        try {
          realTopWin.postMessage(payload, '*');
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
      if (host.includes('music.youtube.com')) return true;
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

    // Spotify: every EME <video> is music (canvas visuals have no MediaKeys). YouTube: any mirrored or main player element.
    const isMusicEl = (el) => {
      if (!el) return false;
      if (IS_YT) {
        if (mirroredEls.has(el)) return true;
        if (el.tagName === 'VIDEO' && !isYtInlinePreviewEl(el)) return true;
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
        // Never allow two media elements in the same frame to play simultaneously
        mediaEls.forEach((other) => {
          if (other !== el && !other.paused) {
            try {
              suppressPauseEvent.add(other);
              other.volume = 0;
              other.pause();
            } catch (_) {}
          }
        });
      } else if (idx < 0) {
        mediaEls.push(el);
      }
      if (lockedEls.has(el)) return true;
      lockedEls.add(el);

      // Keep the real element silent (Xray sets bypass the page-visible accessors below); the page still sees its own volume
      let desiredVol = typeof el.volume === 'number' && el.volume > 0 ? el.volume : 1.0;
      let desiredMuted = false;
      try {
        el.muted = false;
        el.volume = 0;
        const rawEl = el.wrappedJSObject;
        Object.defineProperty(rawEl, 'volume', {
          get: exportFunction(() => desiredVol, pageWin),
          set: exportFunction((v) => {
            const num = Number(v);
            if (!Number.isNaN(num) && num >= 0 && num <= 1) {
              // Ignore automatic startup 0-volume muting by YouTube/Spotify when no user gesture occurred
              if (num === 0 && Date.now() - lastUserGestureAt >= 1500) {
                return;
              }
              desiredVol = num;
              postBridge('VOLUME', { volume: desiredVol, muted: desiredMuted });
            }
          }, pageWin),
          configurable: true
        });
        Object.defineProperty(rawEl, 'muted', {
          get: exportFunction(() => desiredMuted, pageWin),
          set: exportFunction((m) => {
            const wantMute = Boolean(m);
            // Ignore automatic startup mute from YouTube/Spotify when there was no recent user click inside the frame
            if (wantMute && Date.now() - lastUserGestureAt >= 1500) {
              return;
            }
            desiredMuted = wantMute;
            postBridge('VOLUME', { volume: desiredVol, muted: desiredMuted });
          }, pageWin),
          configurable: true
        });
        postBridge('VOLUME', { volume: desiredVol, muted: desiredMuted });
      } catch (_) {}

      el.addEventListener('volumechange', () => {
        try {
          if (el.volume > 0) el.volume = 0;
          if (el.muted) el.muted = false;
        } catch (_) {}
      });
      el.addEventListener('loadedmetadata', () => {
        if (isFrameUnloading) return;
        applyPendingYtSeek(el);
      });
      el.addEventListener('canplay', () => {
        if (isFrameUnloading) return;
        applyPendingYtSeek(el);
      });
      el.addEventListener('timeupdate', () => {
        if (isFrameUnloading || !pendingYtSeekTarget) return;
        applyPendingYtSeek(el);
      });
      el.addEventListener('play', () => {
        if (isFrameUnloading) return;
        if (mirrorAutoPausedByTab || (IS_YT && !isYtPlayableEl(el))) {
          try {
            suppressPauseEvent.add(el);
            el.pause();
          } catch (_) {}
          return;
        }
        try {
          if (el.volume > 0) el.volume = 0;
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
        if (mirrorAutoPausedByTab || (IS_YT && !isYtPlayableEl(el))) {
          try {
            suppressPauseEvent.add(el);
            el.pause();
          } catch (_) {}
          return;
        }
        try {
          if (el.volume > 0) el.volume = 0;
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
        // Ignore browser-triggered pause during frame unload/hide, seeking, natural track end, or initial readyState=0 setup on a playable route
        if (isFrameUnloading || el.seeking || el.ended) return;
        if (el.readyState === 0 && (!IS_YT || isYtPlayableRoute())) return;
        const userInitiated =
          (Date.now() - lastUserGestureAt < 2000 && lastUserGestureAt >= lastPlayStartedAt) ||
          (IS_YT && !isYtPlayableRoute());
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
        // On Spotify, Harmony attaches a fresh MediaSource blob URL during track/session setup, firing 'emptied' — never treat that as STOP_PLAYBACK!
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
          const userSeek = Date.now() - lastUserGestureAt < 1500;
          postBridge('SYNC_TIME', {
            currentTime: el.currentTime,
            paused: !wantPlay.get(el) && el.paused,
            forceSeek: userSeek,
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

    // Report 'allowed' autoplay policy & active userActivation so YouTube's HTML5 player never auto-mutes on reopen
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

    // Remember which blob URL belongs to which MediaSource so we can map MediaSource <-> <video> reliably
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

    // Spotify: capture Widevine license auth + Connect device/cluster state + MediaSession handlers + dealer WebSockets
    if (!IS_YT && pageWin.WebSocket) {
      try {
        const OrigWS = pageWin.WebSocket;
        const WrappedWS = exportFunction(function (url, protocols) {
          const uStr = String(url || '');
          const ws =
            protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
          if (uStr.includes('dealer.spotify.com')) {
            dealerSockets.add(ws);
            ws.addEventListener(
              'close',
              () => {
                dealerSockets.delete(ws);
              },
              { once: true }
            );
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

    if (!IS_YT && pageWin.MediaSession && pageWin.MediaSession.prototype) {
      if (typeof pageWin.MediaSession.prototype.setActionHandler === 'function') {
        const origSetAction = pageWin.MediaSession.prototype.setActionHandler;
        define(pageWin.MediaSession.prototype, 'setActionHandler', function (action, handler) {
          try {
            const act = String(action || '');
            if (act) {
              if (typeof handler === 'function') {
                spMediaSessionHandlers[act] = handler;
              } else {
                delete spMediaSessionHandlers[act];
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
              spMediaSessionDuration = Number(state.duration);
            }
          } catch (_) {}
          return origSetPos.call(this, state);
        });
      }
    }

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
            if (lowerHdrs.authorization) {
              spConnectState.headers.authorization = lowerHdrs.authorization;
            }
            if (lowerHdrs['client-token']) {
              spConnectState.headers['client-token'] = lowerHdrs['client-token'];
            }
            const devMatch = url.match(/^(https:\/\/[^/]*spclient\.spotify\.com)\/connect-state\/v1\/devices\/hobs_([^/?#]+)/i);
            if (devMatch) {
              spConnectState.origin = devMatch[1];
              spConnectState.deviceId = devMatch[2];
            }
          }
        } catch (_) {}
        const fetchPromise = origFetch.call(pageWin, input, init);
        if (url && url.includes('/connect-state/v1/devices/hobs_')) {
          try {
            Promise.resolve(fetchPromise)
              .then((resp) => {
                if (resp && resp.ok && typeof resp.clone === 'function') {
                  return resp.clone().json();
                }
                return null;
              })
              .then((json) => {
                if (json && typeof json.active_device_id === 'string') {
                  spConnectState.activeDeviceId = json.active_device_id;
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
          // Activate only when attached to a real non-preview YouTube <video> on a playable route
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
            if (!sbState.initChunk) {
              sbState.initChunk = c;
            }
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
            if (sbState.activated) {
              postBridge('MSE_REMOVE', { msId, start: Number(start), end: Number(end) });
            }
            return origRem.call(rawSb, start, end);
          });
        }
        const origAbort = rawSb.abort;
        if (typeof origAbort === 'function') {
          define(rawSb, 'abort', function () {
            if (sbState.activated) {
              postBridge('MSE_ABORT', { msId });
            }
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
      if (isFrameUnloading || isStandbyBgFrame) return;
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
        postBridge('SYNC_TIME', {
          currentTime: el ? el.currentTime : 0,
          paused: true,
          explicitPause: Date.now() - lastUserGestureAt < 2500
        });
      }
    };
    setInterval(runMirrorSyncTick, 400);

    // Helpers used by the rest of this content script (and the diagnostics) via window.wrappedJSObject.__pm*
    define(pageWin, '__pmPromoteStandbyToBgFrame', function (newName) {
      frameName = String(newName || 'pm-bg-audio-spotify');
      mirrorAutoPausedByTab = false;
      postBridge('BRIDGE_HELLO', {});
    });
    define(pageWin, '__pmMarkUserGesture', function () {
      lastUserGestureAt = Date.now();
    });
    define(pageWin, '__pmDisableSpBridge', function () {});
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
    define(pageWin, '__pmEnsureMirrorPlay', function () {
      mirrorAutoPausedByTab = false;
      if (IS_YT && !isYtPlayableRoute()) return false;
      const el = getActiveEl();
      if (el && el.paused && !el.ended) {
        try {
          applyPendingYtSeek(el);
          el.wrappedJSObject.play();
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
        if (!IS_YT && typeof spMediaSessionHandlers.nexttrack === 'function') {
          spMediaSessionHandlers.nexttrack();
          return true;
        }
        const nextBtn = document.querySelector('[data-testid="control-button-skip-forward"]');
        if (nextBtn && !nextBtn.disabled) {
          nextBtn.click();
          return true;
        }
      } catch (_) {}
      return false;
    });
    define(pageWin, '__pmEnsureSpotifyLocalTakeover', function (forceTransfer) {
      try {
        const el = getActiveEl();
        if (el && !el.paused && !el.ended && el.readyState >= 1) {
          return 'playing';
        }
        if (
          forceTransfer &&
          spConnectState.deviceId &&
          spConnectState.headers.authorization &&
          Date.now() - spConnectState.lastTransferAt > 2600
        ) {
          spConnectState.lastTransferAt = Date.now();
          const fromDev = spConnectState.activeDeviceId || spConnectState.deviceId;
          const transferUrl = `${spConnectState.origin}/connect-state/v1/connect/transfer/from/${encodeURIComponent(
            fromDev
          )}/to/${encodeURIComponent(spConnectState.deviceId)}`;
          const reqHeaders = Object.assign({}, spConnectState.headers, {
            'content-type': 'application/json'
          });
          window
            .fetch(transferUrl, {
              method: 'POST',
              headers: reqHeaders,
              body: JSON.stringify({
                transfer_options: {
                  restore_paused: 'resume'
                }
              })
            })
            .catch(() => {});
          return 'transferred';
        }
        // Fallback if Connect headers aren't captured yet or button needs toggle:
        if (!forceTransfer && typeof spMediaSessionHandlers.play === 'function') {
          spMediaSessionHandlers.play();
          return 'mediasession-play';
        }
        const spToggle = document.querySelector('[data-testid="control-button-playpause"]');
        if (spToggle && !spToggle.disabled) {
          const aria = (spToggle.getAttribute('aria-label') || '').toLowerCase();
          if (!aria.includes('pause')) {
            spToggle.click();
            return 'clicked-play';
          }
          if (forceTransfer) {
            // Remote ghost device is still marked active: pause ghost, then play locally 240ms later
            spToggle.click();
            window.setTimeout(() => {
              try {
                const btn2 = document.querySelector('[data-testid="control-button-playpause"]');
                if (btn2 && !btn2.disabled) {
                  const aria2 = (btn2.getAttribute('aria-label') || '').toLowerCase();
                  if (!aria2.includes('pause')) btn2.click();
                }
              } catch (_) {}
            }, 240);
            return 'toggled-ghost';
          }
        }
      } catch (_) {}
      return 'noop';
    });
    define(pageWin, '__seekActiveSpMediaEl', function (targetTime, forceHarmonySeek) {
      try {
        const t = Number(targetTime);
        if (!(t >= 0)) return false;
        if (IS_YT) {
          if (!(t > 0)) return false;
          pendingYtSeekTarget = { time: t, setAt: Date.now(), expiresAt: Date.now() + 4500 };
          const el = getActiveEl();
          if (el) applyPendingYtSeek(el);
          return true;
        }
        const el = getActiveEl();
        if (!forceHarmonySeek && el && el.buffered && el.buffered.length > 0) {
          for (let i = 0; i < el.buffered.length; i++) {
            if (t >= el.buffered.start(i) && t <= el.buffered.end(i) - 0.1) {
              if (Math.abs((el.currentTime || 0) - t) > 1.2) {
                el.currentTime = t;
              }
              return true;
            }
          }
        }
        // Outside el.buffered (or explicit handoff alignment): invoke Spotify Harmony's own MediaSession seekto handler
        // so Harmony fetches the exact encrypted range (e.g. 120s) without stalling MSE or losing the playlist!
        if (typeof spMediaSessionHandlers.seekto === 'function') {
          const seekArg =
            typeof cloneInto === 'function'
              ? cloneInto({ seekTime: t, fastSeek: false }, pageWin)
              : { seekTime: t, fastSeek: false };
          spMediaSessionHandlers.seekto(seekArg);
          return true;
        }
        // DOM progressbar fallback if MediaSession seekto hasn't registered yet
        const dur = spMediaSessionDuration || parseDomSpotifyDuration();
        const progBar = document.querySelector(
          '[data-testid="playback-progressbar"] [data-testid="progress-bar"], [data-testid="playback-progressbar"]'
        );
        if (dur > 1 && progBar) {
          const rect = progBar.getBoundingClientRect();
          if (rect && rect.width > 20) {
            const ratio = Math.min(0.995, Math.max(0.002, t / dur));
            const clientX = rect.left + rect.width * ratio;
            const clientY = rect.top + rect.height / 2;
            progBar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX, clientY }));
            progBar.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX, clientY }));
            progBar.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY }));
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


  let currentZoom = 1.0;

  // Never touch CAPTCHA or anti-bot verification frames (ensures hCaptcha/Cloudflare/reCAPTCHA load with zero delay!)
  if (
    host.includes('hcaptcha.com') ||
    host.includes('cloudflare.com') ||
    host.includes('recaptcha.net') ||
    host.includes('arkoselabs.com') ||
    host.includes('funcaptcha.com') ||
    (host.includes('google.com') && (window.location.pathname || '').includes('/recaptcha'))
  ) {
    return;
  }

  const isKnownBuiltInHost =
    host.includes('instagram.com') ||
    host.includes('whatsapp.com') ||
    host.includes('discord.com') ||
    host.includes('telegram.org') ||
    host.includes('spotify.com') ||
    host.includes('youtube.com') ||
    host.includes('tiktok.com') ||
    host.includes('reddit.com') ||
    host.includes('x.com') ||
    host.includes('twitter.com') ||
    host.includes('messenger.com') ||
    host.includes('facebook.com') ||
    host.includes('twitch.tv') ||
    host.includes('chatgpt.com') ||
    host.includes('openai.com') ||
    host.includes('google.com');

  let siteNotificationsMuted = false;
  let siteNotificationsMutedUntil = 0;
  let cachedShortcutBindings = {
    globalShortcuts: { popup: 'Alt+Shift+F', sidebar: 'Alt+Shift+M', popout: 'Alt+Shift+W' },
    appShortcuts: {},
    appShortcutOpenMode: 'sidebar'
  };

  function isSiteNotificationsMutedNow() {
    return Boolean(siteNotificationsMuted || (siteNotificationsMutedUntil > 0 && Date.now() < siteNotificationsMutedUntil));
  }

  function syncFrameSettingsCache(s) {
    if (!s || typeof s !== 'object') return;
    siteNotificationsMuted = Boolean(s.muteSiteNotifications || s.socialAppNotifySounds === false);
    if (s.muteSitesUntil !== undefined) {
      siteNotificationsMutedUntil = Number(s.muteSitesUntil || 0);
    }
    if (s.globalShortcuts && typeof s.globalShortcuts === 'object') {
      cachedShortcutBindings.globalShortcuts = {
        popup: 'Alt+Shift+F',
        sidebar: 'Alt+Shift+M',
        popout: 'Alt+Shift+W',
        ...s.globalShortcuts
      };
    }
    if (s.appShortcuts && typeof s.appShortcuts === 'object') {
      cachedShortcutBindings.appShortcuts = { ...s.appShortcuts };
    }
    if (typeof s.appShortcutOpenMode === 'string' && s.appShortcutOpenMode) {
      cachedShortcutBindings.appShortcutOpenMode = s.appShortcutOpenMode;
    }
  }

  // Intercept Web Notification popups & non-gesture notification <audio> pings inside embedded frames when Sites Notifications are muted!
  if (!isTopFrame && isFoxHubMediaFrame && window.wrappedJSObject && typeof exportFunction === 'function') {
    try {
      const pageWin = window.wrappedJSObject;
      if (pageWin.Notification) {
        const OrigNotif = pageWin.Notification;
        const WrappedNotif = exportFunction(function (title, options) {
          if (
            !host.includes('spotify.com') &&
            !host.includes('youtube.com') &&
            !host.includes('twitch.tv') &&
            !host.includes('chatgpt.com') &&
            !host.includes('gemini.google.com')
          ) {
            webNotificationUnreadCount = Math.min(99, webNotificationUnreadCount + 1);
            setTimeout(() => {
              try {
                detectUnreadState();
              } catch (_) {}
            }, 10);
          }
          if (isSiteNotificationsMutedNow()) {
            const dummy = new pageWin.Object();
            exportFunction(() => {}, dummy, { defineAs: 'close' });
            exportFunction(() => {}, dummy, { defineAs: 'addEventListener' });
            exportFunction(() => {}, dummy, { defineAs: 'removeEventListener' });
            return dummy;
          }
          return options !== undefined ? new OrigNotif(title, options) : new OrigNotif(title);
        }, pageWin);
        WrappedNotif.prototype = OrigNotif.prototype;
        try {
          Object.defineProperty(WrappedNotif, 'permission', {
            get: exportFunction(() => (isSiteNotificationsMutedNow() ? 'default' : OrigNotif.permission || 'granted'), pageWin),
            configurable: true
          });
          if (typeof OrigNotif.requestPermission === 'function') {
            exportFunction(
              function (cb) {
                return OrigNotif.requestPermission.call(OrigNotif, cb);
              },
              WrappedNotif,
              { defineAs: 'requestPermission' }
            );
          }
        } catch (_) {}
        pageWin.Notification = WrappedNotif;
      }

      if (
        !isMirrorAudioHost &&
        !host.includes('tiktok.com') &&
        !host.includes('twitch.tv') &&
        pageWin.HTMLMediaElement &&
        pageWin.HTMLMediaElement.prototype
      ) {
        let lastUserClickInSocialFrameAt = 0;
        window.addEventListener(
          'pointerdown',
          (ev) => {
            if (ev && ev.isTrusted) lastUserClickInSocialFrameAt = Date.now();
          },
          { capture: true, passive: true }
        );
        const origSocialPlay = pageWin.HTMLMediaElement.prototype.play;
        exportFunction(
          function () {
            try {
              if (
                isSiteNotificationsMutedNow() &&
                this &&
                this.tagName === 'AUDIO' &&
                Date.now() - lastUserClickInSocialFrameAt > 1500 &&
                (!Number.isFinite(this.duration) || this.duration < 8)
              ) {
                this.muted = true;
                this.volume = 0;
                return pageWin.Promise.resolve();
              }
            } catch (_) {}
            return origSocialPlay.call(this);
          },
          pageWin.HTMLMediaElement.prototype,
          { defineAs: 'play' }
        );
      }
    } catch (_) {}
  }

  // Spoof top/parent/frameElement ONLY on custom websites so their frame-busters don't break,
  // while keeping native cross-compartment window descriptors intact on built-in SPAs (WhatsApp, Messenger, Discord, X, Google, TikTok, etc.).
  if (!isKnownBuiltInHost && window.wrappedJSObject && typeof exportFunction === 'function') {
    try {
      const pageWin = window.wrappedJSObject;
      const getSelf = exportFunction(() => pageWin, pageWin);
      const getNull = exportFunction(() => null, pageWin);
      Object.defineProperty(pageWin, 'top', { get: getSelf, configurable: true });
      Object.defineProperty(pageWin, 'parent', { get: getSelf, configurable: true });
      Object.defineProperty(pageWin, 'frameElement', { get: getNull, configurable: true });
    } catch (_) {}
  }

  // Event-driven sync of live iframe document.cookie (s_v_web_id, msToken, ttwid, tt_csrf_token) on TikTok from isolated content script world
  // (No 350ms polling timer during video playback — syncs on initial load and after user interactions like solving a CAPTCHA)
  if (host.includes('tiktok.com') && typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
    let lastSyncedCookieStr = '';
    const syncLiveTikTokCookies = () => {
      try {
        const raw = document.cookie || '';
        if (raw && raw !== lastSyncedCookieStr) {
          lastSyncedCookieStr = raw;
          browser.runtime
            .sendMessage({
              type: 'PM_SYNC_LIVE_FRAME_COOKIES',
              origin: 'https://www.tiktok.com',
              cookieStr: raw
            })
            .catch(() => {});
        }
      } catch (_) {}
    };
    syncLiveTikTokCookies();
    window.addEventListener('pointerup', () => setTimeout(syncLiveTikTokCookies, 80), { capture: true, passive: true });
    document.addEventListener('visibilitychange', syncLiveTikTokCookies, { passive: true });
  }

  function notifyParent(type, payload = {}) {
    if (isTopFrame) return;
    try {
      realTopWin.postMessage(
        {
          source: 'pocketmail-media-frame',
          type,
          flatFrameName: isDirectChildIframe ? cleanWindowName : '',
          url: window.location.href,
          ...payload
        },
        '*'
      );
    } catch (_) {}
  }

  // Decide if a URL is a same-app navigation or Google multi-account switch (/u/1/, ?authuser=1, AccountChooser)
  // that should stay inside the sidebar iframe instead of opening a new browser tab!
  function shouldKeepNavigationInSidebar(rawUrl, linkTarget = '') {
    if (!rawUrl || rawUrl.startsWith('javascript:') || rawUrl.startsWith('mailto:')) return false;
    let dest = null;
    try {
      dest = new URL(rawUrl, window.location.href);
    } catch (_) {
      return false;
    }

    const destHost = (dest.hostname || '').toLowerCase();
    const destPath = dest.pathname || '';
    const isAccountSwitchPattern =
      /\/u\/\d+(\/|$)/.test(destPath) ||
      dest.searchParams.has('authuser') ||
      (destHost === 'accounts.google.com' &&
        /\/(AccountChooser|ServiceLogin|AddSession|InteractiveLogin)/i.test(destPath));

    // Never trap external Google management/policy links — let those open in browser tabs
    if (
      destHost === 'myaccount.google.com' ||
      destHost === 'policies.google.com' ||
      destHost === 'one.google.com' ||
      destHost === 'support.google.com'
    ) {
      return false;
    }

    if (isGoogleAccountWidgetIframe) {
      if (
        isAccountSwitchPattern ||
        destHost.includes('gemini.google.com') ||
        destHost.includes('youtube.com') ||
        destHost.includes('mail.google.com')
      ) {
        return true;
      }
      return false;
    }

    // Inside the main app iframe:
    // 1. Any same-host account switch (/u/1/, ?authuser=1) or AccountChooser stays in the sidebar
    if (isAccountSwitchPattern && (destHost === host || destHost === 'accounts.google.com')) {
      return true;
    }
    // 2. Any same-host link that used target="_top" or target="_parent" (assuming the app was top-level) stays in the sidebar
    if (destHost === host && (linkTarget === '_top' || linkTarget === '_parent')) {
      return true;
    }
    return false;
  }

  function setupSmartAccountSwitchAndLinkHandler() {
    document.addEventListener(
      'click',
      (e) => {
        const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!a) return;
        const rawHref = a.getAttribute('href') || a.href || '';
        const targetAttr = (a.getAttribute('target') || '').toLowerCase();

        if (shouldKeepNavigationInSidebar(rawHref, targetAttr)) {
          let resolvedUrl = rawHref;
          try {
            resolvedUrl = new URL(rawHref, window.location.href).href;
          } catch (_) {}
          e.preventDefault();
          e.stopPropagation();
          notifyParent('PM_FRAME_NAVIGATE_ACTIVE', {
            url: resolvedUrl,
            title: 'Switching Account…'
          });
          if (isDirectChildIframe) {
            window.location.href = resolvedUrl;
          }
          return;
        }

        // If a same-origin link has target="_top" or target="_parent", rewrite to "_self" so Firefox doesn't kick it to a new tab
        if (isDirectChildIframe && (targetAttr === '_top' || targetAttr === '_parent')) {
          try {
            const dest = new URL(rawHref, window.location.href);
            if (dest.hostname.toLowerCase() === host) {
              a.setAttribute('target', '_self');
            }
          } catch (_) {}
        }
      },
      true
    );
  }

  setupSmartAccountSwitchAndLinkHandler();

  // If this is ONLY the nested Google Account Switcher widget iframe (ogs.google.com), stop here without injecting app CSS
  if (isGoogleAccountWidgetIframe) {
    return;
  }

  // Configure Telegram Web K at document_start to use a Dedicated Worker (instead of SharedWorker, which stalls in
  // Firefox's partitioned moz-extension:// iframe context) and skip ServiceWorker caching of X-Frame-Options: deny.
  if (isFoxHubContext && host.includes('telegram.org')) {
    try {
      const rawFlags = window.localStorage.getItem('experimental_flags');
      let parsedFlags = [];
      if (rawFlags) {
        try {
          const arr = JSON.parse(rawFlags);
          if (Array.isArray(arr)) parsedFlags = arr;
        } catch (_) {}
      }
      let changedFlags = false;
      if (!parsedFlags.includes('noSharedWorker')) {
        parsedFlags.push('noSharedWorker');
        changedFlags = true;
      }
      if (!parsedFlags.includes('noServiceWorker')) {
        parsedFlags.push('noServiceWorker');
        changedFlags = true;
      }
      if (changedFlags) {
        window.localStorage.setItem('experimental_flags', JSON.stringify(parsedFlags));
      }
    } catch (_) {}
  }

  function isTelegramVisuallyMounted() {
    const pageChats = document.getElementById('page-chats');
    if (pageChats && pageChats.style.display !== 'none' && pageChats.offsetHeight > 20) {
      return true;
    }
    return Boolean(
      document.querySelector(
        '#auth-flow-root, #auth-pages, .auth-pages, #MiddleColumn, #LeftColumn, .Auth, .qr-container, .chatlist-parts'
      )
    );
  }

  // Signal immediately at document_start (unless on ServiceWorker/CacheStorage bootstrap cleaner)
  const isSwBootstrap = window.location.search.includes('pm_boot=1');
  if (!isSwBootstrap) {
    notifyParent('PM_FRAME_START');
    // Fast early body-paint detector: hide the loading curtain as soon as document.body paints children without waiting for slow deferred analytics scripts!
    let earlyReadySent = false;
    const earlyPaintTimer = setInterval(() => {
      if (earlyReadySent || document.readyState === 'complete') {
        clearInterval(earlyPaintTimer);
        return;
      }
      if (isFoxHubContext && !initialThemeResolved) return;
      if (document.documentElement && document.documentElement.hasAttribute('data-pm-x-light-pending')) return;
      const hasBodyContent = Boolean(document.body && document.body.children && document.body.children.length > 0);
      const isReadyNow = hasBodyContent && isAppVisuallyPainted();
      if (isReadyNow) {
        earlyReadySent = true;
        clearInterval(earlyPaintTimer);
        injectOptimizerCss();
        notifyParent('PM_FRAME_DOM_READY', {
          title: document.title || '',
          ownProfileUrl: getOwnProfileUrlForCurrentHost()
        });
      }
    }, 35);
  }

  // Unregister Service Workers on domains where SW caches X-Frame-Options: DENY / CSP frame-ancestors 'none'
  if (
    host.includes('youtube.com') ||
    host.includes('whatsapp.com') ||
    host.includes('x.com') ||
    host.includes('twitter.com') ||
    host.includes('telegram.org') ||
    !isKnownBuiltInHost
  ) {
    try {
      if (navigator.serviceWorker) {
        const isTelegramHost = host.includes('telegram.org');
        try {
          navigator.serviceWorker.register = function () {
            return isTelegramHost
              ? Promise.reject(new Error('ServiceWorker disabled in sidebar'))
              : Promise.resolve({});
          };
        } catch (_) {}
        if (isTelegramHost && window.wrappedJSObject && typeof exportFunction === 'function') {
          try {
            const pageWin = window.wrappedJSObject;
            if (pageWin.navigator && pageWin.navigator.serviceWorker) {
              const rejectSw = exportFunction(
                () => pageWin.Promise.reject(new pageWin.Error('ServiceWorker disabled in sidebar')),
                pageWin
              );
              pageWin.navigator.serviceWorker.register = rejectSw;
            }
          } catch (_) {}
        }

        const unregisterSwFast = async () => {
          try {
            const regs = await navigator.serviceWorker.getRegistrations();
            if (regs && regs.length > 0) {
              await Promise.all(regs.map((r) => r.unregister()));
            }
            if (window.caches && window.caches.keys) {
              const keys = await window.caches.keys();
              if (keys && keys.length > 0) {
                await Promise.all(keys.map((k) => window.caches.delete(k)));
              }
            }
          } catch (_) {}
        };

        if (isSwBootstrap) {
          if (document.documentElement) {
            const isBootDark =
              initialSyncThemeMode === 'true-night' || initialSyncThemeMode === 'midnight-oled';
            document.documentElement.style.background = isBootDark ? '#000000' : '#141110';
            document.documentElement.style.visibility = 'hidden';
          }
          if (
            (initialSyncThemeMode === 'true-night' || initialSyncThemeMode === 'midnight-oled') &&
            (host.includes('x.com') || host.includes('twitter.com'))
          ) {
            try {
              const cDom = host.includes('twitter.com') ? '.twitter.com' : '.x.com';
              document.cookie = 'night_mode=; path=/; max-age=0; SameSite=None; Secure';
              document.cookie = `night_mode=2; domain=${cDom}; path=/; max-age=31536000; SameSite=None; Secure`;
            } catch (_) {}
          }
          const params = new URLSearchParams(window.location.search || '');
          const targetUrl = params.get('pm_target') || `${window.location.origin}/`;
          Promise.race([
            unregisterSwFast(),
            new Promise((resolve) => setTimeout(resolve, 110))
          ]).then(() => {
            window.location.replace(targetUrl);
          });
          return;
        } else {
          unregisterSwFast();
        }
      }
    } catch (_) {}
  }

  let pendingSpaTarget = null; // { destPath, icon, tiktokView, igView, spotifyView, messengerView, expiresAt }
  let spotifyViewOverride = ''; // 'library' | 'search' | 'player' | ''
  let spotifyPanelOpen = false;
  let activeSpotifyPanelTrigger = ''; // 'queue' | 'device' | ''
  let spPanelSyncClick = false;

  function syncAppSpecificDomState() {
    const root = document.documentElement;
    if (!root) return;
    const path = window.location.pathname || '/';
    root.setAttribute('data-pm-path', path);

    const cleanCur = path.replace(/\/+$/, '') || '/';
    if (pendingSpaTarget) {
      if (
        Date.now() > pendingSpaTarget.expiresAt ||
        isRouteMatchForApp(cleanCur, pendingSpaTarget.destPath, pendingSpaTarget.icon)
      ) {
        pendingSpaTarget = null;
      }
    }

    // 1. Instagram route awareness (Reels vs DM Thread vs DM Inbox vs Explore vs Profile vs Feed)
    if (host.includes('instagram.com')) {
      let igView = 'feed';
      const hasProfileHeader = Boolean(document.querySelector('main[role="main"] header'));
      if (pendingSpaTarget && pendingSpaTarget.igView) {
        igView = pendingSpaTarget.igView;
      } else if ((path === '/reels' || path.startsWith('/reels/')) && !hasProfileHeader) {
        igView = 'reels';
      } else if (path.startsWith('/direct/t/')) {
        igView = 'dm-thread';
      } else if (path.startsWith('/direct')) {
        igView = 'dm-inbox';
      } else if (path.startsWith('/explore')) {
        igView = 'explore';
      }
      if (hasProfileHeader && igView === 'reels') {
        igView = 'feed';
      }
      if (root.getAttribute('data-pm-ig-view') !== igView) {
        root.setAttribute('data-pm-ig-view', igView);
      }
    }

    // 2. Spotify route awareness (Player vs Search vs Library) & cookie banner cleanup
    if (host.includes('spotify.com')) {
      let spView = 'player';
      if (spotifyViewOverride) {
        spView = spotifyViewOverride;
      } else if (pendingSpaTarget && pendingSpaTarget.spotifyView) {
        spView = pendingSpaTarget.spotifyView;
      } else if (path.startsWith('/collection') && !path.startsWith('/collection/tracks')) {
        spView = 'library';
      } else if (path.startsWith('/search')) {
        spView = 'search';
      }
      if (root.getAttribute('data-pm-spotify-view') !== spView) {
        root.setAttribute('data-pm-spotify-view', spView);
      }
      const spPanelAttr = spotifyPanelOpen ? 'open' : 'closed';
      if (root.getAttribute('data-pm-spotify-panel') !== spPanelAttr) {
        root.setAttribute('data-pm-spotify-panel', spPanelAttr);
      }
      const oneTrust = document.getElementById('onetrust-consent-sdk');
      if (oneTrust) oneTrust.remove();
    }

    // 3. TikTok route awareness (Feed vs Explore vs Messages vs Profile)
    if (host.includes('tiktok.com')) {
      let ttView = 'feed';
      const isTikTokVideoDetail = path.includes('/video/') || path.includes('/photo/');
      if (path.startsWith('/messages')) {
        ttView = 'messages';
      } else if (pendingSpaTarget && pendingSpaTarget.tiktokView) {
        ttView = pendingSpaTarget.tiktokView;
      } else if (path.startsWith('/explore')) {
        ttView = 'explore';
      } else if ((path.startsWith('/@') && !isTikTokVideoDetail) || path.startsWith('/profile')) {
        ttView = 'profile';
      } else if (path.startsWith('/upload') || path.startsWith('/studio') || path.startsWith('/setting')) {
        ttView = 'other';
      } else {
        ttView = 'feed';
      }
      if (root.getAttribute('data-pm-tiktok-view') !== ttView) {
        root.setAttribute('data-pm-tiktok-view', ttView);
      }
    }

    // 4. Messenger route awareness (Active Chat Thread vs Inbox)
    if (host.includes('messenger.com')) {
      const mainEl = document.querySelector('div[role="main"]');
      const hasMountedConversation = Boolean(
        mainEl && mainEl.children.length > 0 && !mainEl.classList.contains('xlshs6z')
      );
      const msgView =
        pendingSpaTarget && pendingSpaTarget.messengerView
          ? pendingSpaTarget.messengerView
          : hasMountedConversation
          ? 'thread'
          : 'inbox';
      if (root.getAttribute('data-pm-messenger-view') !== msgView) {
        root.setAttribute('data-pm-messenger-view', msgView);
      }
    }

    // 5. YouTube: strip mini-guide attributes so Polymer uses 100% width inside FoxHub
    if (host.includes('youtube.com') && !host.includes('music.youtube.com') && window.innerWidth <= 1280) {
      const ytdApp = document.querySelector('ytd-app');
      if (ytdApp) {
        ytdApp.removeAttribute('mini-guide-visible');
        ytdApp.removeAttribute('guide-persistent-and-visible');
      }
      const drawer = document.querySelector('tp-yt-app-drawer#guide[opened]');
      if (drawer && window.innerWidth <= 920) {
        drawer.removeAttribute('opened');
      }
    }

    // 6. Global: remove intrusive Google One-Tap floating overlay
    const gsiPicker = document.getElementById('credential_picker_container');
    if (gsiPicker) gsiPicker.remove();
  }

  function getResponsiveSidebarCss() {
    let css = `
      /* Clean thin scrollbars, prevent horizontal overflow & hide Google One-Tap overlay */
      html {
        scrollbar-width: thin !important;
        scrollbar-color: rgba(160, 160, 160, 0.32) transparent !important;
        max-width: 100vw !important;
        overflow-x: clip !important;
      }
      body {
        max-width: 100vw !important;
        overflow-x: clip !important;
      }
      * {
        scrollbar-width: thin;
      }
      #credential_picker_container,
      #credential_picker_iframe,
      iframe[src*="accounts.google.com/gsi"],
      div[id^="credential_picker"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
        width: 0 !important;
        height: 0 !important;
        opacity: 0 !important;
      }
    `;

    if (host.includes('instagram.com')) {
      css += `
        /* 1. Compact Instagram Left Navigation Rail to 48px */
        :root, body {
          --nav-narrow-width: 48px !important;
          --nav-medium-width: 48px !important;
          --nav-wide-width: 48px !important;
        }

        /* Eliminate double vertical scrollbars */
        html[data-pm-ig-view="reels"]:not(:has(main[role="main"] header)),
        html[data-pm-ig-view="reels"]:not(:has(main[role="main"] header)) body,
        html[data-pm-ig-view="dm-inbox"],
        html[data-pm-ig-view="dm-inbox"] body,
        html[data-pm-ig-view="dm-thread"],
        html[data-pm-ig-view="dm-thread"] body {
          overflow-y: hidden !important;
          height: 100vh !important;
          max-height: 100vh !important;
        }

        html[data-pm-ig-view="feed"] body,
        html[data-pm-ig-view="explore"] body {
          overflow-y: visible !important;
        }

        main[role="main"],
        section > main[role="main"] {
          min-width: 0 !important;
          max-width: 100% !important;
          width: 100% !important;
          margin: 0 !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
        }

        html[data-pm-ig-view="reels"] main[role="main"]:not(:has(header)) > div {
          padding-left: 0 !important;
          padding-right: 0 !important;
          max-width: 100% !important;
          scrollbar-width: none !important;
        }
        html[data-pm-ig-view="reels"] main[role="main"]:not(:has(header)) > div::-webkit-scrollbar {
          display: none !important;
        }

        /* Force each Instagram Reel slide to occupy the full viewport height (minus the 50px bottom nav bar) so two reels NEVER stack vertically when narrow! */
        html[data-pm-ig-view="reels"] main[role="main"]:not(:has(header)) > div > div {
          min-height: calc(100vh - 50px) !important;
          height: calc(100vh - 50px) !important;
          max-height: calc(100vh - 50px) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          box-sizing: border-box !important;
          margin-bottom: 0 !important;
        }

        @media (max-width: 560px) {
          html[data-pm-ig-view="reels"] main[role="main"]:not(:has(header)) div[style*="--x-width"]:has(video),
          html[data-pm-ig-view="reels"] main[role="main"]:not(:has(header)) div[style*="--x-height"]:has(video):not([style*="--x-height: 100%"]) {
            --x-width: calc(100vw - 52px) !important;
            --x-height: calc(100vh - 84px) !important;
          }
          html[data-pm-ig-view="reels"] main[role="main"]:not(:has(header)) div[style*="--x-maxHeight"] a[href^="/"],
          html[data-pm-ig-view="reels"] main[role="main"]:not(:has(header)) div[style*="--x-maxHeight"] > div > div:first-child span {
            white-space: nowrap !important;
          }
          html[data-pm-ig-view="reels"] main[role="main"]:not(:has(header)) video {
            object-fit: cover !important;
          }
        }

        /* Prevent clicking a contact's avatar in the Instagram DM list from opening their Story instead of their DM chat!
           Instagram's IGDStoryRingOffMsys.react listens to onPointerEnter on div:has(> canvas) inside each div[role="button"] DM row
           and mounts a floating body > button[style*="position: fixed"][style*="border-radius: 50%"] portal over the avatar. */
        html[data-pm-ig-view="dm-inbox"] div[role="button"] div:has(> canvas),
        html[data-pm-ig-view="dm-inbox"] div[role="button"] div:has(> canvas) *,
        html[data-pm-ig-view="dm-inbox"] div[role="button"] canvas,
        html[data-pm-ig-view="dm-inbox"] [role="listitem"] div:has(> canvas),
        html[data-pm-ig-view="dm-inbox"] [role="listitem"] div:has(> canvas) *,
        html[data-pm-ig-view="dm-thread"] div[role="button"] div:has(> canvas),
        html[data-pm-ig-view="dm-thread"] div[role="button"] div:has(> canvas) *,
        html[data-pm-ig-view="dm-thread"] div[role="button"] canvas,
        html[data-pm-ig-view="dm-thread"] [role="listitem"] div:has(> canvas),
        html[data-pm-ig-view="dm-thread"] [role="listitem"] div:has(> canvas) * {
          pointer-events: none !important;
        }
        html[data-pm-ig-view="dm-inbox"] body > button[style*="position: fixed"][style*="border-radius"],
        html[data-pm-ig-view="dm-thread"] body > button[style*="position: fixed"][style*="border-radius"] {
          display: none !important;
          pointer-events: none !important;
        }

        /* Clean responsive Instagram Profile Reel / Post Lightbox Modal (div[role="dialog"]) */
        div[role="dialog"]:has(article),
        div[role="dialog"]:has(video) {
          background: rgba(10, 10, 14, 0.88) !important;
          backdrop-filter: blur(10px) !important;
        }
        div[role="dialog"] div:has(> div > article),
        div[role="dialog"] div:has(> article) {
          max-width: calc(100vw - 16px) !important;
          width: auto !important;
        }
        div[role="dialog"] article {
          width: clamp(290px, calc(100vw - 84px), 500px) !important;
          max-width: clamp(290px, calc(100vw - 84px), 500px) !important;
          max-height: calc(100vh - 52px) !important;
          height: auto !important;
          margin: 0 auto !important;
          border-radius: 14px !important;
          overflow-x: hidden !important;
          overflow-y: hidden !important;
          background: rgb(var(--ig-primary-background, 255, 255, 255)) !important;
          color: rgb(var(--ig-primary-text, 0, 0, 0)) !important;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65) !important;
          display: block !important;
          scrollbar-width: thin !important;
        }
        div[role="dialog"] article[data-pm-comments-open="true"] {
          overflow-y: auto !important;
        }
        div[role="dialog"] article > div,
        div[role="dialog"] article > div[style*="--x-maxWidth"] {
          --x-maxWidth: 100% !important;
          width: 100% !important;
          max-width: 100% !important;
          max-height: none !important;
          min-height: 0 !important;
          height: auto !important;
          display: flex !important;
          flex-direction: column !important;
        }
        div[role="dialog"] article ._aasi,
        div[role="dialog"] article ._aasi > div,
        div[role="dialog"] article ._aasi header,
        div[role="dialog"] article header {
          background: rgb(var(--ig-primary-background, 255, 255, 255)) !important;
          color: rgb(var(--ig-primary-text, 0, 0, 0)) !important;
          z-index: 5 !important;
        }
        div[role="dialog"] article ._aasi {
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          justify-content: space-between !important;
          width: 100% !important;
          flex-shrink: 0 !important;
          border-bottom: 1px solid rgba(128, 128, 128, 0.16) !important;
        }
        div[role="dialog"] article ._aasi header {
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          flex: 1 1 auto !important;
        }
        /* Hide empty mobile top bar if Instagram mounted header inside .x1oa3qoh at >= 736px */
        div[role="dialog"] article ._aasi:not(:has(header)) {
          display: none !important;
        }
        div[role="dialog"] article:has(._aasi header) .x1oa3qoh header {
          display: none !important;
        }
        div[role="dialog"] article header {
          padding: 8px 12px !important;
        }
        /* Default Full-Sized Post Mode (before clicking Comment icon) — matches both ._aatl (single) and ._aatn (carousel) */
        div[role="dialog"] article ._aatk {
          position: relative !important;
          width: 100% !important;
          max-width: 100% !important;
          min-height: 0 !important;
          max-height: calc(100vh - 215px) !important;
          height: auto !important;
          margin: 0 auto !important;
          background: #000 !important;
          overflow: hidden !important;
          flex-shrink: 1 !important;
        }
        div[role="dialog"] article ._aatk > div,
        div[role="dialog"] article ._aatk div[data-instancekey],
        div[role="dialog"] article ._aatk div[data-instancekey] > div,
        div[role="dialog"] article ._aatk div[data-visualcompletion="ignore"] {
          min-height: 0 !important;
          max-height: calc(100vh - 215px) !important;
        }
        div[role="dialog"] article ._aatk:has(video) [style*="padding-bottom"],
        div[role="dialog"] article ._aatk:has(video) ._aagv {
          padding-bottom: 0 !important;
          height: calc(100vh - 215px) !important;
          max-height: calc(100vh - 215px) !important;
        }
        div[role="dialog"] article ._aatk video,
        div[role="dialog"] article ._aatk img {
          object-fit: contain !important;
          max-height: calc(100vh - 215px) !important;
        }
        /* Comments-Open Mode (toggled when user clicks the Comment icon) */
        div[role="dialog"] article[data-pm-comments-open="true"] ._aatk,
        div[role="dialog"] article[data-pm-comments-open="true"] ._aatk > div,
        div[role="dialog"] article[data-pm-comments-open="true"] ._aatk div[data-instancekey],
        div[role="dialog"] article[data-pm-comments-open="true"] ._aatk div[data-instancekey] > div,
        div[role="dialog"] article[data-pm-comments-open="true"] ._aatk div[data-visualcompletion="ignore"],
        div[role="dialog"] article[data-pm-comments-open="true"] ._aatk video,
        div[role="dialog"] article[data-pm-comments-open="true"] ._aatk img {
          max-height: 320px !important;
          min-height: 0 !important;
        }
        div[role="dialog"] article[data-pm-comments-open="true"] ._aatk:has(video) [style*="padding-bottom"],
        div[role="dialog"] article[data-pm-comments-open="true"] ._aatk:has(video) ._aagv {
          padding-bottom: 0 !important;
          height: 320px !important;
          max-height: 320px !important;
        }
        /* Hide Instagram's misaligned internal audio button inside post modals so our pinned modal mute button is always cleanly visible */
        div[role="dialog"] article ._aatk button[aria-label*="audio" i],
        div[role="dialog"] article ._aatk [role="button"][aria-label*="audio" i],
        div[role="dialog"] article ._aatk button:has(svg[aria-label*="audio" i]),
        div[role="dialog"] article ._aatk [role="button"]:has(svg[aria-label*="audio" i]) {
          opacity: 0 !important;
          pointer-events: none !important;
        }
        div[role="dialog"] article .x1oa3qoh {
          flex-shrink: 0 !important;
        }
        div[role="dialog"] article .x1oa3qoh,
        div[role="dialog"] article .x5yr21d,
        div[role="dialog"] article .x1q2y9iw,
        div[role="dialog"] article section {
          width: 100% !important;
          max-width: 100% !important;
          min-height: 0 !important;
          height: auto !important;
          max-height: none !important;
          box-sizing: border-box !important;
        }
        /* Hide comments list and comment input by default so the post is full-sized first */
        div[role="dialog"] article:not([data-pm-comments-open="true"]) .xw2csxc.x1odjw0f,
        div[role="dialog"] article:not([data-pm-comments-open="true"]) ul._a9z6,
        div[role="dialog"] article:not([data-pm-comments-open="true"]) .x1q2y9iw > div:first-child:not(:has(section)),
        div[role="dialog"] article:not([data-pm-comments-open="true"]) section:has(textarea),
        div[role="dialog"] article:not([data-pm-comments-open="true"]) section:has(form) {
          display: none !important;
          min-height: 0 !important;
          max-height: 0 !important;
          height: 0 !important;
          overflow: hidden !important;
        }
        /* Show comments list & input when user clicks the Comment button */
        div[role="dialog"] article[data-pm-comments-open="true"] .xw2csxc.x1odjw0f,
        div[role="dialog"] article[data-pm-comments-open="true"] ul._a9z6,
        div[role="dialog"] article[data-pm-comments-open="true"] .x1q2y9iw > div:first-child:not(:has(section)) {
          position: relative !important;
          min-height: 170px !important;
          max-height: 250px !important;
          height: auto !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          border-bottom: 1px solid rgba(128, 128, 128, 0.14) !important;
        }

        @media (max-width: 720px) {
          html[data-pm-ig-view="dm-thread"] main[role="main"] > div > div > div:first-child,
          html[data-pm-ig-view="dm-thread"] div[role="navigation"] > div > div:first-child {
            width: 68px !important;
            min-width: 68px !important;
            max-width: 68px !important;
            overflow-x: hidden !important;
            transition: width 0.18s ease, min-width 0.18s ease, max-width 0.18s ease !important;
          }
          html[data-pm-ig-view="dm-thread"] main[role="main"] > div > div > div:first-child:hover {
            width: 220px !important;
            min-width: 220px !important;
            max-width: 220px !important;
            z-index: 50 !important;
            box-shadow: 6px 0 20px rgba(0, 0, 0, 0.18) !important;
          }
          /* On DM Inbox (when no thread is open yet), hide the empty "Your messages" placeholder column so the thread list gets 100% width */
          html[data-pm-ig-view="dm-inbox"] main[role="main"] > div > div > div:nth-child(2):not(:has(textarea)):not(:has([role="textbox"])) {
            display: none !important;
          }
          html[data-pm-ig-view="dm-inbox"] main[role="main"] > div > div > div:first-child {
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            flex: 1 1 100% !important;
          }
        }
      `;
    } else if (host.includes('whatsapp.com')) {
      css += `
        /* 2. Remove WhatsApp Web hardcoded 748px min-width while keeping QR Login page clean */
        html, body, #app, .app-wrapper-web, .two, ._aigs {
          min-width: 0 !important;
          max-width: 100vw !important;
          overflow-x: hidden !important;
        }

        body:has(#side) #app > div,
        body:has(#side) #app > div > div,
        body:has(#side) .two {
          min-width: 0 !important;
          min-height: 0 !important;
          width: 100% !important;
          max-width: 100vw !important;
          overflow-x: hidden !important;
        }

        @media (max-width: 680px) {
          /* Hide ONLY WhatsApp's empty 2-column border overlay (.two > div.x10l6tqk.x8qhkwt) that draws vertical lines at 64px and 45%.
             NEVER hide .two > div.x10l6tqk.x1o0tod (which is the Drawer Container for New Chat, Profile/Settings, Status, and Channels)! */
          body:has(#side) .two > div.x10l6tqk.x8qhkwt,
          body:has(#side) .two > div.x10l6tqk.x8qhkwt > div {
            display: none !important;
            border: none !important;
          }

          /* Compact the leftmost icon rail (.two > header) to 46px; when a chat (#main) is open, auto-reveal it whenever hovering the left rail or when a drawer is open! */
          body:has(#side) .two > header {
            width: 46px !important;
            min-width: 46px !important;
            max-width: 46px !important;
            flex: 0 0 46px !important;
            z-index: 260 !important;
          }
          body:has(#side):has(#main):not(:has(.two > div.x10l6tqk.x1o0tod [role="button"])):not(:has(.two > div.x10l6tqk.x1o0tod button)) .two:not(:has(> div:has(#side):hover)):not(:has(> header:hover)) > header {
            display: none !important;
          }
          /* Ensure slide-out drawers (New chat, Profile/Settings, Status, Channels) inside .two > div.x10l6tqk.x1o0tod sit cleanly across the full width! */
          body:has(#side) .two > div.x10l6tqk.x1o0tod > div,
          body:has(#side) .two > div.x10l6tqk.x1o0tod > span > div {
            margin-left: 46px !important;
            width: calc(100vw - 46px) !important;
            min-width: calc(100vw - 46px) !important;
            max-width: calc(100vw - 46px) !important;
            z-index: 250 !important;
          }
          /* When no chat is open yet (#main absent), hide ONLY the "Download WhatsApp for Windows" placeholder column (.xyyilfv) and let #side fill 100% of the sidebar! */
          body:has(#side):not(:has(#main)) .two > div:has(#side),
          body:has(#side):not(:has(#main)) div:has(> #side) {
            flex: 1 1 auto !important;
            width: calc(100vw - 46px) !important;
            min-width: 0 !important;
            max-width: calc(100vw - 46px) !important;
          }
          body:has(#side):not(:has(#main)) .two > div:has(#side) > header,
          body:has(#side):not(:has(#main)) #side {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
          }
          body:has(#side):not(:has(#main)) .two > div.xyyilfv:not(:has(#main)) {
            display: none !important;
          }
          /* When a chat thread IS open (#main present), collapse #side to a 78px Avatar Rail (with centered 68px highlight pill + 48px avatar) that expands to 230px on hover! */
          body:has(#side):has(#main) .two > div:has(#side),
          body:has(#side):has(#main) div:has(> #side) {
            flex: 0 0 78px !important;
            width: 78px !important;
            min-width: 78px !important;
            max-width: 78px !important;
            border-right: 1px solid rgba(134, 150, 160, 0.25) !important;
            box-sizing: border-box !important;
            overflow-x: hidden !important;
            transition: width 0.18s ease, min-width 0.18s ease, max-width 0.18s ease, flex-basis 0.18s ease !important;
          }
          body:has(#side):has(#main) .two > div:has(#side):hover,
          body:has(#side):has(#main) div:has(> #side):hover {
            flex: 0 0 230px !important;
            width: 230px !important;
            min-width: 230px !important;
            max-width: 230px !important;
            z-index: 100 !important;
            box-shadow: 6px 0 20px rgba(0, 0, 0, 0.35) !important;
          }
          body:has(#side):has(#main) .two > div:has(#side):not(:hover) #pane-side [role="gridcell"] > div {
            margin: 0 !important;
            padding: 0 !important;
          }
          body:has(#side):has(#main) .two > div:has(#side):not(:hover) #pane-side [role="gridcell"] > div > div {
            margin-left: 6px !important;
            margin-right: 6px !important;
            width: 64px !important;
            box-sizing: border-box !important;
          }
          body:has(#side):has(#main) .two > div:has(#side):not(:hover) #pane-side [role="gridcell"] > div > div > div:first-child {
            padding: 0 !important;
            margin: 0 !important;
          }
          body:has(#side):has(#main) .two > div:has(#side):not(:hover) #pane-side [role="gridcell"] > div > div > div:first-child > div:first-child {
            padding-left: 8px !important;
            padding-right: 8px !important;
          }
          body:has(#side):has(#main) .two > div:has(#side):not(:hover) #pane-side [role="gridcell"] > div > div > div:nth-child(2) {
            display: none !important;
          }
          body:has(#side):has(#main) .two > div:has(#side):not(:hover) > header,
          body:has(#side):has(#main) .two > div:has(#side):not(:hover) #side header,
          body:has(#side):has(#main) .two > div:has(#side):not(:hover) #side [role="textbox"],
          body:has(#side):has(#main) .two > div:has(#side):not(:hover) #side [aria-label*="Search" i],
          body:has(#side):has(#main) .two > div:has(#side):not(:hover) #side [aria-label*="chat filter" i],
          body:has(#side):has(#main) .two > div:has(#side):not(:hover) #side [role="tablist"] {
            display: none !important;
          }
          body:has(#side) #side {
            min-width: 0 !important;
            width: 100% !important;
            overflow-x: hidden !important;
          }
          body:has(#side) .two > div:has(#main),
          body:has(#side) div:has(> #main) {
            flex: 1 1 auto !important;
            width: calc(100vw - 78px) !important;
            min-width: 0 !important;
            max-width: calc(100vw - 78px) !important;
          }
          body:has(#side) #main {
            min-width: 0 !important;
            width: 100% !important;
          }
          body:has(#side) #main header {
            padding-left: 8px !important;
            padding-right: 6px !important;
          }
          body:has(#side) #main footer {
            padding-left: 4px !important;
            padding-right: 4px !important;
          }

          /* Constrain Emoji / GIF / Sticker panel (#expressions-panel-container) so it never overflows left or right */
          #expressions-panel-container [role="application"] {
            left: 6px !important;
            right: 6px !important;
            width: calc(100vw - 12px) !important;
            max-width: calc(100vw - 12px) !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }
          #expressions-panel-container [role="application"] ul,
          #expressions-panel-container [role="application"] form,
          #expressions-panel-container [role="application"] div,
          #expressions-panel-container [role="application"] span,
          #expressions-panel-container [role="application"] input {
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }
          #expressions-panel-container [role="application"] form {
            width: calc(100% - 16px) !important;
            margin: 0 auto !important;
          }
        }
      `;
    } else if (host.includes('discord.com')) {
      css += `
        /* 3. Discord Narrow Sidebar Optimization */
        html, body, #app-mount,
        [class*="app_"], [class*="bg_"], [class*="layers_"],
        [class*="base_"], [class*="content_"], [class*="chat_"],
        [class*="chatContent_"] {
          min-width: 0 !important;
          max-width: 100vw !important;
        }

        /* Always show Discord QR Code Login cleanly stacked inside narrow sidebars (< 850px) without needing to widen the panel! */
        @media (max-width: 850px) {
          form[class*="authBox"],
          div[class*="authBox"],
          div[class*="authBoxExpanded"] {
            width: 94vw !important;
            max-width: 440px !important;
            max-height: 92vh !important;
            padding: 16px 14px !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            box-sizing: border-box !important;
          }
          form[class*="authBox"] > div,
          div[class*="authBox"] > div[class*="centeringWrapper"] > div,
          div:has(> div[class*="mainLoginContainer"]) {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 14px !important;
            width: 100% !important;
          }
          div[class*="mainLoginContainer"] {
            width: 100% !important;
            max-width: 100% !important;
          }
          div[class*="verticalSeparator"] {
            display: block !important;
            width: 100% !important;
            height: 1px !important;
            margin: 4px 0 !important;
            background: rgba(255, 255, 255, 0.14) !important;
          }
          div[class*="qrLogin"],
          div[class*="qrLoginInner"] {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
          }
        }

        @media (max-width: 680px) {
          nav[class*="guilds_"],
          nav[class*="guilds_"] * {
            mask: none !important;
            -webkit-mask: none !important;
          }
          nav[class*="guilds_"] foreignObject,
          nav[class*="guilds_"] [class*="wrapper_"] img {
            border-radius: 12px !important;
          }
          div[class*="sidebar_"]:not([class*="sidebarList_"]):not(:hover) {
            width: auto !important;
            min-width: 0 !important;
            max-width: none !important;
          }
          div[class*="sidebar_"]:not([class*="sidebarList_"]):not(:hover) div[class*="sidebarList_"],
          div[class*="sidebar_"]:not([class*="sidebarList_"]):not(:hover) section[class*="panels_"] {
            width: 0 !important;
            min-width: 0 !important;
            max-width: 0 !important;
            opacity: 0 !important;
            overflow: hidden !important;
            pointer-events: none !important;
            border: none !important;
          }
          div[class*="sidebar_"]:not([class*="sidebarList_"]):hover {
            width: auto !important;
            min-width: 0 !important;
            max-width: none !important;
            z-index: 200 !important;
          }
          div[class*="sidebar_"]:not([class*="sidebarList_"]):hover div[class*="sidebarList_"] {
            width: 192px !important;
            min-width: 192px !important;
            max-width: 192px !important;
            opacity: 1 !important;
            pointer-events: auto !important;
            box-shadow: 8px 0 24px rgba(0, 0, 0, 0.5) !important;
          }
          div[class*="sidebar_"]:not([class*="sidebarList_"]):hover section[class*="panels_"] {
            opacity: 1 !important;
            pointer-events: auto !important;
            z-index: 210 !important;
          }
          div[class*="page_"],
          main[class*="container_"],
          div[class*="chat_"],
          div[class*="chatContent_"],
          div[class*="tabBody_"] {
            min-width: 0 !important;
            max-width: 100% !important;
            flex: 1 1 auto !important;
          }
          div[class*="nowPlayingColumn_"],
          aside[class*="membersWrap_"],
          div[class*="membersWrap_"] {
            display: none !important;
          }
        }
      `;
    } else if (host.includes('telegram.org')) {
      css += `
        /* 4. Telegram Web (K & A) Narrow Sidebar Optimization — preserve Telegram's native single-column mobile layout! */
        html, body, #page-chats, .whole, #main-columns,
        #column-center, #MiddleColumn, #LeftColumn {
          min-width: 0 !important;
          max-width: 100vw !important;
        }
      `;
    } else if (host.includes('spotify.com')) {
      css += `
        /* 5. Spotify Narrow Sidebar Optimization */
        #onetrust-consent-sdk,
        #onetrust-banner-sdk,
        .onetrust-pc-dark-filter,
        [data-testid="signup-bar"] {
          display: none !important;
        }

        @media (max-width: 2400px) {
          /* Keep Left Library mounted with non-zero width (never display:none on .main-view-container, which causes ResizeObserver 0px division-by-zero crash!) */
          html:not([data-pm-spotify-view="library"]) #Desktop_LeftSidebar_Id,
          html:not([data-pm-spotify-view="library"]) .Root__nav-bar {
            position: fixed !important;
            left: -9999px !important;
            top: 0 !important;
            width: 280px !important;
            height: 80vh !important;
            opacity: 0 !important;
            pointer-events: none !important;
            z-index: -1 !important;
          }

          html:not([data-pm-spotify-panel="open"]) #Desktop_PanelContainer_Id {
            position: fixed !important;
            left: -9999px !important;
            top: 0 !important;
            width: 320px !important;
            height: 80vh !important;
            opacity: 0 !important;
            pointer-events: none !important;
            z-index: -1 !important;
          }

          html[data-pm-spotify-panel="open"] #Desktop_PanelContainer_Id {
            position: fixed !important;
            top: 48px !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 80px !important;
            width: 100vw !important;
            max-width: 100vw !important;
            height: calc(100vh - 128px) !important;
            box-sizing: border-box !important;
            z-index: 85 !important;
            background: #121212 !important;
            opacity: 1 !important;
            pointer-events: auto !important;
            overflow-y: auto !important;
            display: flex !important;
            flex-direction: column !important;
          }

          html[data-pm-spotify-panel="open"] #Desktop_PanelContainer_Id > *,
          html[data-pm-spotify-panel="open"] #Desktop_PanelContainer_Id aside {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            flex: 1 1 auto !important;
          }

          html:not([data-pm-spotify-panel="open"]) .Root__right-sidebar:not(#Desktop_PanelContainer_Id),
          html:not([data-pm-spotify-panel="open"]) #main-view + div:not(#Desktop_PanelContainer_Id):not(:has([data-testid="now-playing-bar"])),
          html:not([data-pm-spotify-panel="open"]) aside[aria-label="Now playing view" i]:not([data-testid="now-playing-bar"]) {
            display: none !important;
            width: 0 !important;
            min-width: 0 !important;
            max-width: 0 !important;
          }

          /* On Library tab, overlay #Desktop_LeftSidebar_Id cleanly over the main view without setting .main-view-container to 0px width! */
          html[data-pm-spotify-view="library"] #Desktop_LeftSidebar_Id {
            position: fixed !important;
            top: 48px !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            height: calc(100vh - 48px) !important;
            padding-bottom: 76px !important;
            box-sizing: border-box !important;
            z-index: 80 !important;
            background: #121212 !important;
            opacity: 1 !important;
            pointer-events: auto !important;
          }

          [data-testid="root"],
          [data-testid="root"] > div:first-child,
          .Root__top-container {
            --left-sidebar-width: 0 !important;
            --right-sidebar-width: 0 !important;
            --panel-width: 0px !important;
            --panel-gap: 0px !important;
            grid-template-columns: 0px minmax(0, 1fr) 0px !important;
            width: 100vw !important;
            max-width: 100vw !important;
            min-width: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow-x: clip !important;
          }

          #main,
          #main-view,
          .Root__main-view,
          .main-view-container {
            grid-column: 1 / -1 !important;
            min-width: 0 !important;
            width: 100% !important;
            max-width: 100vw !important;
            padding-right: 0 !important;
            margin-right: 0 !important;
            box-sizing: border-box !important;
          }

          #global-nav-bar,
          [data-testid="top-bar"] {
            --encore-control-size-base: 32px !important;
            --encore-control-size-smaller: 26px !important;
            width: 100% !important;
            max-width: 100vw !important;
            height: 48px !important;
            min-height: 48px !important;
            max-height: 48px !important;
            padding: 4px 10px !important;
            box-sizing: border-box !important;
            align-items: center !important;
          }
          #global-nav-bar a[href="/"] svg,
          #global-nav-bar > div:first-child a svg {
            width: 24px !important;
            height: 24px !important;
          }
          #global-nav-bar [data-testid="home-button"],
          #global-nav-bar [data-testid="user-widget-link"],
          #global-nav-bar [data-testid="whats-new-feed-button"],
          #global-nav-bar [data-testid="friend-activity-button"],
          #global-nav-bar button[aria-label="Search" i] {
            width: 32px !important;
            height: 32px !important;
            min-width: 32px !important;
            min-height: 32px !important;
            padding: 0 !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          #global-nav-bar [data-testid="home-button"] svg,
          #global-nav-bar [data-testid="whats-new-feed-button"] svg,
          #global-nav-bar [data-testid="friend-activity-button"] svg,
          #global-nav-bar [role="search"] svg,
          #global-nav-bar form svg {
            width: 17px !important;
            height: 17px !important;
          }
          #global-nav-bar [data-testid="user-widget-link"] figure,
          #global-nav-bar [data-testid="user-widget-link"] img,
          #global-nav-bar [data-testid="user-widget-avatar"] {
            width: 24px !important;
            height: 24px !important;
            min-width: 24px !important;
            min-height: 24px !important;
          }
          #global-nav-bar [role="search"],
          #global-nav-bar form[role="search"],
          #global-nav-bar [data-testid="search-input"] {
            min-height: 32px !important;
            height: 32px !important;
            font-size: 13px !important;
          }
          #global-nav-bar a[href*="/download"],
          #global-nav-bar [data-testid="upgrade-button"],
          #global-nav-bar button[aria-label*="Install" i] {
            display: none !important;
          }

          /* Disable Firefox content-visibility: auto paint-containment bug on Spotify's horizontal shelf carousels so cards never clip to 28px/0px! */
          section[data-testid="component-shelf"],
          section[data-testid="component-shelf"] *,
          [data-testid="carousel-scroller"],
          [data-testid="carousel-scroller"] * {
            --carousel-shelf-content-visibility: visible !important;
            content-visibility: visible !important;
          }

          img[data-testid="card-image"] {
            opacity: 1 !important;
          }

          section[data-testid="component-shelf"] {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }

          [data-testid="grid-container"] {
            --column-count: 2 !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            grid-auto-rows: auto !important;
            overflow-y: visible !important;
            gap: 10px !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }
          @media (min-width: 580px) {
            [data-testid="grid-container"] {
              --column-count: 3 !important;
              grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            }
          }

          .contentSpacing {
            padding-left: 10px !important;
            padding-right: 10px !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }

          div:has(> [data-testid="now-playing-bar"]),
          .Root__now-playing-bar,
          .now-playing-bar-container {
            grid-column: 1 / -1 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            min-width: 0 !important;
            height: auto !important;
            min-height: 82px !important;
            z-index: 90 !important;
            background: #000000 !important;
            border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
          }
          [data-testid="now-playing-bar"],
          aside[data-testid="now-playing-bar"],
          footer[data-testid="now-playing-bar"] {
            display: flex !important;
            width: 100% !important;
            max-width: 100vw !important;
            min-width: 0 !important;
            height: auto !important;
            min-height: 78px !important;
            padding: 3px 8px 5px 8px !important;
            box-sizing: border-box !important;
            z-index: 90 !important;
          }
          [data-testid="now-playing-bar"] > div,
          footer[data-testid="now-playing-bar"] > div {
            display: flex !important;
            flex-wrap: wrap !important;
            align-items: center !important;
            justify-content: space-between !important;
            min-width: 0 !important;
            width: 100% !important;
            height: auto !important;
            gap: 2px 6px !important;
          }
          /* Row 1 (Full 100% Width): Player Controls (Shuffle, Prev, Play/Pause, Next, Repeat) + Full-Width Progress Seek Bar */
          [data-testid="now-playing-bar"] > div > div:nth-child(2) {
            order: 1 !important;
            flex: 1 1 100% !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }
          [data-testid="player-controls"] {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            gap: 1px !important;
          }
          [data-testid="general-controls"] {
            margin-bottom: 1px !important;
          }
          /* Row 2 Left: Current Track Cover + Song Title + Artist */
          [data-testid="now-playing-bar"] > div > div:nth-child(1) {
            order: 2 !important;
            flex: 1 1 0% !important;
            width: auto !important;
            min-width: 84px !important;
            max-width: calc(100% - 172px) !important;
            max-height: 30px !important;
            overflow: hidden !important;
          }
          [data-testid="now-playing-widget"] img,
          [data-testid="cover-art-image"] {
            width: 26px !important;
            height: 26px !important;
            min-width: 26px !important;
            border-radius: 4px !important;
          }
          /* Row 2 Right: Full-Width Clickable & Draggable Volume Slider + Queue */
          [data-testid="now-playing-bar"] > div > div:nth-child(3) {
            order: 3 !important;
            flex: 0 0 auto !important;
            width: auto !important;
            min-width: 0 !important;
            max-height: 30px !important;
            padding-right: 4px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: flex-end !important;
          }
          [data-testid="now-playing-bar"] > div > div:nth-child(3) > div {
            display: flex !important;
            align-items: center !important;
            justify-content: flex-end !important;
            gap: 2px !important;
            width: auto !important;
            min-width: 0 !important;
          }
          [data-testid="volume-bar"] {
            display: flex !important;
            align-items: center !important;
            flex: 0 0 auto !important;
            width: clamp(106px, 26vw, 146px) !important;
            min-width: 106px !important;
            gap: 4px !important;
          }
          [data-testid="volume-bar"] > button,
          [data-testid="volume-bar-toggle-mute-button"] {
            flex: 0 0 28px !important;
            width: 28px !important;
            min-width: 28px !important;
            height: 28px !important;
            padding: 0 !important;
          }
          [data-testid="volume-bar"] > div,
          [data-testid="volume-bar"] [data-testid="progress-bar"] {
            flex: 1 1 auto !important;
            width: 100% !important;
            min-width: 72px !important;
            height: 14px !important;
            display: flex !important;
            align-items: center !important;
            cursor: pointer !important;
          }
          /* Keep horizontal volume track & draggable white knob always visible so users don't need mouse wheel! */
          [data-testid="volume-bar"] [data-testid="progress-bar-background"] {
            width: 100% !important;
            height: 4px !important;
            border-radius: 999px !important;
            background-color: rgba(255, 255, 255, 0.28) !important;
          }
          [data-testid="volume-bar"] [data-testid="progress-bar"] button,
          [data-testid="volume-bar"] .progress-bar__slider {
            opacity: 1 !important;
            visibility: visible !important;
            display: block !important;
          }
          @media (max-width: 410px) {
            [data-testid="now-playing-bar"] [data-testid="lyrics-button"],
            [data-testid="now-playing-bar"] #device-picker-icon-button,
            [data-testid="now-playing-bar"] button[aria-label*="Connect to a device" i] {
              display: none !important;
            }
          }
          [data-testid="now-playing-bar"] [data-testid="fullscreen-mode-button"],
          [data-testid="now-playing-bar"] [data-testid="pip-toggle-button"],
          [data-testid="now-playing-bar"] button[aria-label*="Now playing view" i] {
            display: none !important;
          }
        }
      `;
    } else if (host.includes('music.youtube.com')) {
      css += `
        /* 6a. YouTube Music Narrow Sidebar Optimization */
        @media (max-width: 820px) {
          ytmusic-guide-renderer,
          #mini-guide.ytmusic-app-layout,
          #guide-wrapper.ytmusic-app-layout {
            display: none !important;
          }
          ytmusic-app-layout > #content,
          #browse-page.ytmusic-app,
          ytmusic-section-list-renderer {
            margin-left: 0 !important;
            width: 100% !important;
            max-width: 100vw !important;
            padding-left: 6px !important;
            padding-right: 6px !important;
            box-sizing: border-box !important;
          }
          ytmusic-nav-bar,
          ytmusic-player-bar {
            width: 100vw !important;
            max-width: 100vw !important;
            left: 0 !important;
          }
        }
      `;
    } else if (host.includes('youtube.com')) {
      css += `
        /* 6b. YouTube Sidebar Optimization (Always hide redundant left mini-guide & cinematics canvas inside FoxHub) */
        ytd-mini-guide-renderer {
          display: none !important;
          width: 0 !important;
        }
        tp-yt-app-drawer#guide {
          z-index: 2020 !important;
        }
        ytd-app[mini-guide-visible] ytd-page-manager.ytd-app,
        ytd-app[guide-persistent-and-visible] ytd-page-manager.ytd-app,
        ytd-page-manager.ytd-app,
        #page-manager.ytd-app,
        ytd-browse,
        ytd-two-column-browse-results-renderer {
          margin-left: 0 !important;
          width: 100% !important;
          max-width: 100vw !important;
          min-width: 0 !important;
        }
        ytd-shorts,
        #shorts-container,
        ytd-reel-video-renderer {
          max-width: 100vw !important;
          min-width: 0 !important;
        }
        @media (max-width: 640px) {
          ytd-shorts,
          #shorts-container,
          #shorts-inner-container {
            width: 100vw !important;
            max-width: 100vw !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
          }
          ytd-reel-video-renderer[is-active],
          ytd-reel-video-renderer #player-container {
            width: calc(100vw - 8px) !important;
            max-width: calc(100vw - 8px) !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }
        }
        /* Disable YouTube Ambient Mode (#cinematics) 30fps canvas blur loop in sidebar to save 3-5% CPU while gaming! */
        #cinematics,
        ytd-watch-flexy #cinematics,
        ytd-watch-flexy #cinematics canvas {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }

        @media (max-width: 960px) {
          ytd-rich-grid-renderer,
          #contents.ytd-rich-grid-renderer {
            --ytd-rich-grid-items-per-row: 1 !important;
            --ytd-rich-grid-posts-per-row: 1 !important;
            --ytd-rich-grid-slim-items-per-row: 2 !important;
            --ytd-rich-grid-game-cards-per-row: 1 !important;
            width: 100% !important;
            max-width: 100vw !important;
            padding-left: 8px !important;
            padding-right: 8px !important;
            box-sizing: border-box !important;
          }
          ytd-rich-grid-row,
          #contents.ytd-rich-grid-row {
            display: contents !important;
          }
          ytd-rich-item-renderer,
          ytd-rich-item-renderer[rendered-from-rich-grid] {
            width: 100% !important;
            max-width: 100% !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            margin-bottom: 14px !important;
          }
          ytd-rich-section-renderer {
            width: 100% !important;
            max-width: 100% !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
          }

          #masthead-container.ytd-app,
          ytd-masthead {
            width: 100vw !important;
            max-width: 100vw !important;
          }
          #container.ytd-masthead {
            padding: 0 8px !important;
            gap: 4px !important;
          }
          #guide-button.ytd-masthead,
          #country-code.ytd-topbar-logo-renderer,
          #voice-search-button.ytd-masthead,
          #buttons.ytd-masthead ytd-button-renderer {
            display: none !important;
          }
          #center.ytd-masthead {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            margin: 0 4px !important;
          }
          ytd-searchbox,
          yt-searchbox,
          #search-form,
          #container.ytd-searchbox {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }

          ytd-feed-filter-chip-bar-renderer {
            width: 100% !important;
            max-width: 100vw !important;
          }
          ytd-watch-flexy[flexy] #columns.ytd-watch-flexy {
            flex-direction: column !important;
            min-width: 0 !important;
            max-width: 100vw !important;
          }
          ytd-watch-flexy #primary.ytd-watch-flexy,
          ytd-watch-flexy #secondary.ytd-watch-flexy {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            padding: 0 8px !important;
            margin: 0 !important;
            box-sizing: border-box !important;
          }
        }
      `;
    } else if (host.includes('reddit.com')) {
      css += `
        /* 7. Reddit & Reddit Chat Sidebar Optimization (All Sidebar & Fit-Zoom Widths) */
        shreddit-experience-tree,
        xpromo-app-selector,
        shreddit-async-loader[bundlename*="xpromo"],
        #credential_picker_container {
          display: none !important;
        }

        @media (max-width: 2400px) {
          /* Hide the desktop right-hand info sidebar so the post/feed fills 100% of the FoxHub sidebar width */
          #right-sidebar-container,
          aside[aria-label*="sidebar" i],
          div[id*="right-sidebar"] {
            display: none !important;
            width: 0 !important;
            min-width: 0 !important;
            max-width: 0 !important;
          }

          /* At wide Fit-zoom or wide sidebar widths (>960px), keep #left-sidebar-container collapsed unless opened via ☰ so it never steals a 272px column or stacks above the feed */
          @media (min-width: 961px) {
            #left-sidebar-container:not([open]):not(:focus-within) {
              display: none !important;
              width: 0 !important;
              min-width: 0 !important;
              max-width: 0 !important;
            }
          }

          /* Ensure the ☰ hamburger left drawer opens cleanly on top of the backdrop */
          #left-sidebar-container[open],
          #left-sidebar-container:focus-within,
          reddit-sidebar-nav {
            z-index: 9999 !important;
            max-width: min(320px, 82vw) !important;
          }

          /* Collapse .main-container's 2-column grid (minmax(0,1fr) 316px) into a single 100%-width column so no 340px black void remains on the right! */
          shreddit-app,
          div.grid-container,
          .subgrid-container,
          .main-container,
          div[class*="grid-container"],
          div[class*="subgrid-container"],
          div[class*="main-container"],
          main.main,
          main,
          #main-content,
          shreddit-feed,
          shreddit-post,
          shreddit-comment-tree,
          div[slot="text-body"],
          shreddit-post [slot="post-media-container"],
          shreddit-post figure,
          article {
            grid-template-columns: minmax(0, 1fr) !important;
            flex: 1 1 100% !important;
            max-width: 100% !important;
            width: 100% !important;
            min-width: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            box-sizing: border-box !important;
          }
          .subgrid-container,
          .main-container,
          main.main {
            padding-left: 8px !important;
            padding-right: 8px !important;
          }

          /* Fix Top-Right Profile Avatar Overflow in Reddit Header */
          reddit-header-large,
          shreddit-app > header,
          header {
            max-width: 100vw !important;
            width: 100% !important;
            padding-left: 6px !important;
            padding-right: 10px !important;
            box-sizing: border-box !important;
          }
          header nav,
          reddit-header-large nav {
            max-width: 100% !important;
            width: 100% !important;
            padding-left: 4px !important;
            padding-right: 6px !important;
            gap: 4px !important;
            box-sizing: border-box !important;
          }
          reddit-search-large,
          faceplate-search-input,
          #search-input {
            flex: 1 1 75px !important;
            min-width: 65px !important;
            max-width: 100% !important;
          }
        }

        @media (max-width: 580px) {
          /* Hide the word "Create" next to the + icon so Bell & Profile Avatar fit 100% inside the right edge */
          #create-post span:not(:first-child),
          a[href*="/submit"] span:not(:first-child) {
            display: none !important;
          }
          #create-post,
          a[href*="/submit"] {
            padding-left: 6px !important;
            padding-right: 6px !important;
            min-width: 32px !important;
          }
        }
      `;
    } else if (host.includes('tiktok.com')) {
      css += `
        /* 8. TikTok Cinema Full-Height Video Feed, Explore Grid, Profile & Messages Optimization */
        @media (max-width: 2400px) {
          /* Keep TikTok's left nav mounted offscreen (0px visual width) so its React router links remain clickable via SPA_NAVIGATE,
             while allowing DivSideNavContainer on Messages if it houses the inbox drawer */
          [data-e2e="nav-side"],
          div[class*="DivSideNavContainer"]:not(:has([data-e2e="inbox-list"])):not(:has(div[class*="DivConversationList"])),
          html:not([data-pm-tiktok-view="messages"]) div[class*="DivSideNavContainer"],
          html:not([data-pm-tiktok-view="messages"]) div[class*="DivFullSideNav"],
          html:not([data-pm-tiktok-view="messages"]) div[class*="SideNavContainer"] {
            position: fixed !important;
            left: -9999px !important;
            top: 0 !important;
            width: 64px !important;
            height: 400px !important;
            opacity: 0 !important;
            pointer-events: none !important;
            z-index: -1 !important;
          }

          div[class*="DivSideNavPlaceholder"],
          div[class*="DivPromotionContainer"],
          div[class*="DivBottomBanner"],
          div[class*="DivAppBanner"] {
            display: none !important;
            width: 0 !important;
            min-width: 0 !important;
            max-width: 0 !important;
          }

          #app,
          div[class*="DivBodyContainer"],
          div[class*="DivMainContainer"],
          div[class*="DivShareLayoutMain"],
          div[class*="DivExploreContainer"],
          main {
            width: 100% !important;
            max-width: 100vw !important;
            min-width: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            padding-left: 2px !important;
            padding-right: 2px !important;
            box-sizing: border-box !important;
          }

          /* Full-Width Cinema Stage for TikTok Feed ([data-e2e="recommend-list-item-container"]):
             Preserve native scroll-snap item height & 0 margin so opening comments NEVER jumps to the reel above,
             while overlaying the right-hand action buttons on top of the video on hover so the video fills 100% width! */
          html[data-pm-tiktok-view="feed"] [data-e2e="recommend-list-item-container"],
          html[data-pm-tiktok-view="feed"] article[class*="ArticleItemContainer"] {
            position: relative !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 2px !important;
            box-sizing: border-box !important;
          }

          html[data-pm-tiktok-view="feed"] div[class*="DivContentContainer"],
          html[data-pm-tiktok-view="feed"] div[class*="DivMediaCardContainer"] {
            position: relative !important;
            width: 100% !important;
            max-width: 100% !important;
            height: 100% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 0 !important;
          }

          html[data-pm-tiktok-view="feed"] div[class*="DivVideoWrapper"] {
            position: relative !important;
            flex: 1 1 100% !important;
            width: 100% !important;
            max-width: 100% !important;
            height: calc(100vh - 54px) !important;
            max-height: 860px !important;
            min-height: 380px !important;
            background: #0b0b0e !important;
            border-radius: 14px !important;
            overflow: hidden !important;
          }

          html[data-pm-tiktok-view="feed"] div[class*="DivCliponeContainer"],
          html[data-pm-tiktok-view="feed"] div[class*="DivVideoCard"] {
            width: 100% !important;
            max-width: 100% !important;
            height: 100% !important;
            background: #0b0b0e !important;
          }

          /* Keep the active video player filling 100% of the card from top to bottom (never stacked above the poster image!) */
          html[data-pm-tiktok-view="feed"] div[class*="DivBasicPlayerWrapper"],
          html[data-pm-tiktok-view="feed"] div[class*="xgplayer-container"],
          html[data-pm-tiktok-view="feed"] div[class*="DivPlayerContainer"] {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            max-height: none !important;
            min-height: 0 !important;
            background: #0b0b0e !important;
            z-index: 2 !important;
          }

          /* Hide the duplicate static poster image underneath once the video player is mounted */
          html[data-pm-tiktok-view="feed"] div[class*="DivVideoWrapper"]:has(video) img[class*="ImgPoster"],
          html[data-pm-tiktok-view="feed"] div[class*="DivVideoWrapper"]:has(video) > img,
          html[data-pm-tiktok-view="feed"] div[class*="DivVideoCardPoster"] {
            opacity: 0 !important;
            pointer-events: none !important;
          }

          html[data-pm-tiktok-view="feed"] video {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            background: #0b0b0e !important;
          }

          /* Overlay the right-hand TikTok action buttons (Avatar +, Like, Comment, Bookmark, Share, Sound) over the right side of the video — hidden until hover! */
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] {
            position: absolute !important;
            right: 8px !important;
            bottom: 38px !important;
            top: auto !important;
            width: 56px !important;
            min-width: 56px !important;
            max-width: 56px !important;
            height: max-content !important;
            min-height: max-content !important;
            max-height: none !important;
            overflow: visible !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: flex-start !important;
            gap: 6px !important;
            z-index: 30 !important;
            margin: 0 !important;
            padding: 10px 4px !important;
            box-sizing: border-box !important;
            border-radius: 99px !important;
            background: rgba(34, 36, 48, 0.56) !important;
            border: 1px solid rgba(255, 255, 255, 0.24) !important;
            backdrop-filter: blur(12px) saturate(140%) !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.32) !important;
            color: #ffffff !important;
            opacity: 0 !important;
            pointer-events: none !important;
            transform: translateX(4px) scale(0.9) !important;
            transform-origin: bottom right !important;
            transition: opacity 0.18s ease, transform 0.18s ease !important;
          }

          /* Force crisp white icons & count text inside the TikTok action bar pill so it is never black-on-glass-gray in Light Mode! */
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] button,
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] button[class*="ButtonActionItem"],
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] div[class*="tux-icon-button"],
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] strong,
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] [data-e2e*="-count"],
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] span {
            color: #ffffff !important;
            text-shadow: 0 1px 3px rgba(0, 0, 0, 0.72) !important;
          }
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] button[class*="ButtonActionItem"] span[class*="SpanIconWrapper"],
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] button[class*="ButtonActionItem"] > span:first-child,
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] div[class*="tux-icon-button"] {
            background: rgba(255, 255, 255, 0.15) !important;
            border-radius: 50% !important;
            color: #ffffff !important;
          }
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] svg {
            color: #ffffff !important;
            fill: #ffffff !important;
            filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55)) !important;
          }
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] svg path:not([fill="#FE2C55"]):not([fill="#fe2c55"]):not([fill*="254, 44, 85"]):not([fill="#FACE15"]):not([fill="#face15"]):not([fill*="250, 206, 21"]) {
            fill: #ffffff !important;
          }

          /* Never let TikTok's responsive CSS hide or clip the creator profile picture above the + follow button on narrow sidebars, and center it 100% with the buttons! */
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] > * {
            margin-left: auto !important;
            margin-right: auto !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
          }

          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] > div:first-child {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            visibility: visible !important;
            opacity: 1 !important;
            position: relative !important;
            width: 44px !important;
            height: 44px !important;
            min-width: 44px !important;
            min-height: 44px !important;
            margin: 0 auto 10px auto !important;
            padding: 0 !important;
            left: 0 !important;
            right: 0 !important;
            overflow: visible !important;
            flex-shrink: 0 !important;
          }

          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] div[class*="DivActionItemContainer"],
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] div[class*="DivAvatarActionItem"],
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] button[class*="ButtonActionItem"] {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            margin-left: auto !important;
            margin-right: auto !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            visibility: visible !important;
            opacity: 1 !important;
            overflow: visible !important;
            flex-shrink: 0 !important;
          }

          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] [data-e2e="video-author-avatar"],
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] > div:first-child a[href^="/@"],
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] > div:first-child span[class*="SpanAvatarContainer"],
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] span[class*="SpanAvatarContainer"] {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            visibility: visible !important;
            opacity: 1 !important;
            width: 44px !important;
            height: 44px !important;
            min-width: 44px !important;
            min-height: 44px !important;
            margin: 0 auto !important;
            padding: 0 !important;
            border-radius: 50% !important;
            overflow: visible !important;
            flex-shrink: 0 !important;
            position: relative !important;
          }

          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] [data-e2e="video-author-avatar"] img,
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] > div:first-child a[href^="/@"] img,
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] > div:first-child img,
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"] img[class*="ImgAvatar"] {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            width: 44px !important;
            height: 44px !important;
            min-width: 44px !important;
            min-height: 44px !important;
            margin: 0 auto !important;
            padding: 0 !important;
            border-radius: 50% !important;
            object-fit: cover !important;
            border: 1.5px solid rgba(255, 255, 255, 0.85) !important;
            box-sizing: border-box !important;
          }

          html[data-pm-tiktok-view="feed"] [data-e2e="recommend-list-item-container"]:hover section[class*="SectionActionBarContainer"],
          html[data-pm-tiktok-view="feed"] article:hover section[class*="SectionActionBarContainer"],
          html[data-pm-tiktok-view="feed"] div[class*="DivContentContainer"]:hover section[class*="SectionActionBarContainer"],
          html[data-pm-tiktok-view="feed"] div[class*="DivVideoWrapper"]:hover section[class*="SectionActionBarContainer"],
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"]:hover,
          html[data-pm-tiktok-view="feed"] section[class*="SectionActionBarContainer"]:focus-within {
            opacity: 1 !important;
            pointer-events: auto !important;
            transform: translateX(0) scale(0.92) !important;
          }

          /* TikTok Explore (/explore) & Profile (/@...) — Prevent double-nested grid (outer wrapper must be block 100%, only innermost list is 2-column grid) */
          div:has(> [data-e2e="explore-item-list"]),
          div:has(> div > [data-e2e="explore-item-list"]),
          div:has(> [data-e2e="user-post-item-list"]),
          div:has(> [data-e2e="user-liked-item-list"]),
          div:has(> [data-e2e="user-repost-item-list"]),
          div:has(> [data-e2e="favorites-item-list"]),
          [data-e2e="explore-item-list"]:has(div[class*="DivThreeColumnContainer"]),
          [data-e2e="explore-item-list"]:has(div[class*="DivVideoFeedV2"]),
          div[class*="DivThreeColumnContainer"]:has([data-e2e="explore-item-list"]),
          div[class*="DivThreeColumnContainer"]:has(div[class*="DivVideoFeedV2"]),
          div[class*="DivThreeColumnContainer"]:has([data-e2e="user-post-item-list"]),
          div[class*="DivThreeColumnContainer"]:has([data-e2e="user-liked-item-list"]) {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            box-sizing: border-box !important;
          }

          /* Keep the horizontal category bar on Explore full-width flex */
          div[class*="DivCategoryListContainer"],
          div[class*="DivCategoryList"] {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }

          /* Keep the floating top-right coin/app/avatar pill compact on Explore & Profile so it doesn't cover category tabs */
          html[data-pm-tiktok-view="explore"] div[class*="DivFixedTopContainer"],
          html[data-pm-tiktok-view="explore"] div[class*="DivHeaderRightContainer"],
          html[data-pm-tiktok-view="profile"] div[class*="DivFixedTopContainer"],
          html[data-pm-tiktok-view="profile"] div[class*="DivHeaderRightContainer"] {
            transform: scale(0.82) !important;
            transform-origin: top right !important;
          }

          /* Only the innermost item list container is the 2-column CSS Grid (100% width across the sidebar) */
          [data-e2e="explore-item-list"]:not(:has(div[class*="DivThreeColumnContainer"])):not(:has(div[class*="DivVideoFeedV2"])),
          div[class*="DivThreeColumnContainer"]:not(:has([data-e2e="explore-item-list"])):not(:has([data-e2e="user-post-item-list"])):not(:has([data-e2e="user-liked-item-list"])),
          div[class*="DivVideoFeedV2"]:not(:has([data-e2e="explore-item-list"])),
          [data-e2e="user-post-item-list"],
          [data-e2e="user-liked-item-list"],
          [data-e2e="user-repost-item-list"],
          [data-e2e="favorites-item-list"] {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin: 0 !important;
            padding: 6px 8px !important;
            box-sizing: border-box !important;
          }

          /* Direct card containers fill their grid cell cleanly without overriding inner DivContainer/DivWrapper overlays */
          html[data-pm-tiktok-view="explore"] [data-e2e="explore-item"],
          html[data-pm-tiktok-view="explore"] div[class*="DivItemContainerV2"],
          html[data-pm-tiktok-view="explore"] div[class*="DivItemContainer"]:not([class*="Conversation"]),
          [data-e2e="user-post-item"],
          [data-e2e="user-liked-item"],
          [data-e2e="user-repost-item"],
          [data-e2e="favorites-item"],
          html[data-pm-tiktok-view="profile"] div[class*="DivItemContainerV2"] {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            margin: 0 !important;
            box-sizing: border-box !important;
          }

          @media (max-width: 360px) {
            [data-e2e="explore-item-list"]:not(:has(div[class*="DivThreeColumnContainer"])),
            div[class*="DivThreeColumnContainer"]:not(:has([data-e2e="explore-item-list"])) {
              grid-template-columns: minmax(0, 1fr) !important;
            }
          }

          /* TikTok Messages (/messages) Responsive Layout — Align Left Conversation List 100% with Divider Line! */
          html[data-pm-tiktok-view="messages"] [data-e2e="nav-side"],
          html[data-pm-tiktok-view="messages"] div[class*="DivSideNavContainer"]:not(:has([data-e2e="inbox-list"])):not(:has(div[class*="DivConversationList"])),
          html[data-pm-tiktok-view="messages"] div[class*="DivSideNavPlaceholder"] {
            display: none !important;
          }
          html[data-pm-tiktok-view="messages"] div[class*="DivDrawerContainer"],
          html[data-pm-tiktok-view="messages"] div:has(> div[class*="DivConversationListContainer"]) {
            width: 168px !important;
            min-width: 156px !important;
            max-width: 176px !important;
            flex: 0 0 168px !important;
            box-sizing: border-box !important;
          }
          html[data-pm-tiktok-view="messages"] div[class*="DivConversationListContainer"],
          html[data-pm-tiktok-view="messages"] [data-e2e="inbox-list"],
          html[data-pm-tiktok-view="messages"] div[class*="DivConversationListContainer"] .simplebar-wrapper,
          html[data-pm-tiktok-view="messages"] div[class*="DivConversationListContainer"] .simplebar-content-wrapper,
          html[data-pm-tiktok-view="messages"] div[class*="DivConversationListContainer"] .simplebar-content,
          html[data-pm-tiktok-view="messages"] div[class*="DivItemContainer"],
          html[data-pm-tiktok-view="messages"] div[class*="DivItemWrapper"],
          html[data-pm-tiktok-view="messages"] div[class*="DivInfoContainer"],
          html[data-pm-tiktok-view="messages"] p[class*="PNickname"],
          html[data-pm-tiktok-view="messages"] span[class*="SpanNickname"] {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            flex: 1 1 auto !important;
            box-sizing: border-box !important;
          }
          html[data-pm-tiktok-view="messages"] div[class*="DivChatBox"],
          html[data-pm-tiktok-view="messages"] div[class*="DivChatMain"],
          html[data-pm-tiktok-view="messages"] div[class*="DivMessageList"] {
            flex: 1 1 auto !important;
            width: auto !important;
            min-width: 0 !important;
            max-width: 100% !important;
            padding-left: 6px !important;
            padding-right: 6px !important;
            box-sizing: border-box !important;
          }
          html[data-pm-tiktok-view="messages"] div[class*="DivChatItemWrapper"],
          html[data-pm-tiktok-view="messages"] div[class*="DivMessageContainer"] {
            max-width: 100% !important;
            width: 100% !important;
            padding-left: 4px !important;
            padding-right: 4px !important;
            box-sizing: border-box !important;
          }
          html[data-pm-tiktok-view="messages"] div[class*="DivChatMain"] div[class*="DivTextContainer"],
          html[data-pm-tiktok-view="messages"] div[class*="DivChatMain"] p[class*="PText"] {
            max-width: 230px !important;
            min-width: 110px !important;
            width: auto !important;
            word-break: normal !important;
            overflow-wrap: break-word !important;
          }

          div[class*="DivHeaderWrapper"] {
            width: 100vw !important;
            max-width: 100vw !important;
            padding: 0 8px !important;
            box-sizing: border-box !important;
          }
        }
      `;
    } else if (host.includes('x.com') || host.includes('twitter.com')) {
      css += `
        /* 9. X (Twitter) Narrow Sidebar Optimization — Preserve window (html) as scroll container so VirtualScroller loads infinite posts! */
        html {
          min-width: 0 !important;
          max-width: 100vw !important;
          overflow-x: clip !important;
          overflow-y: scroll !important;
        }
        body, #react-root {
          min-width: 0 !important;
          max-width: 100vw !important;
          overflow-x: clip !important;
          overflow-y: visible !important;
        }

        @media (max-width: 780px) {
          header[role="banner"] {
            flex: 0 0 52px !important;
            width: 52px !important;
            min-width: 52px !important;
            max-width: 52px !important;
            align-items: center !important;
          }
          header[role="banner"] > div,
          header[role="banner"] > div > div {
            width: 52px !important;
            max-width: 52px !important;
            padding-left: 2px !important;
            padding-right: 2px !important;
            align-items: center !important;
          }
          header[role="banner"] nav a span {
            display: none !important;
          }
          [data-testid="sidebarColumn"] {
            display: none !important;
          }
          main[role="main"] {
            flex: 1 1 0% !important;
            width: calc(100vw - 52px) !important;
            max-width: calc(100vw - 52px) !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }
          main[role="main"] > div,
          [data-testid="primaryColumn"],
          [data-testid="DMDrawer"],
          section[aria-labelledby],
          article[data-testid="tweet"] {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            flex: 1 1 auto !important;
            box-sizing: border-box !important;
          }
        }
      `;
    } else if (host.includes('messenger.com')) {
      css += `
        /* 10. Messenger Narrow Sidebar Optimization */
        html, body {
          min-width: 0 !important;
          max-width: 100vw !important;
          overflow-x: clip !important;
        }
        div[style*="--messenger-card-min-width"] {
          --messenger-card-min-width: 0px !important;
        }

        /* Fix Messenger's 100px max-height bug (.x569fbc) on the Chats grid wrapper so the chat list fills 100% height! */
        div[role="navigation"][aria-label="Thread list"],
        div[role="navigation"][aria-label="Thread list"] div:has([role="grid"]),
        div[role="navigation"][aria-label="Thread list"] [role="grid"] {
          flex: 1 1 auto !important;
          height: 100% !important;
          max-height: none !important;
          min-height: 0 !important;
        }

        @media (max-width: 680px) {
          /* Hide the redundant leftmost 44px Inbox Switcher rail since FoxHub's bottom bar already provides Chats / Requests / Archive */
          div[role="navigation"][aria-label="Inbox switcher"] {
            display: none !important;
          }

          /* Pure 0ms CSS :has() switching between Messenger Inbox and Active Conversation (never waits for JS timers!) */
          body:not(:has(div[role="main"]:not(.xlshs6z) > div)) div[role="navigation"][aria-label="Thread list"] {
            position: relative !important;
            flex: 1 1 100% !important;
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            height: 100% !important;
          }
          body:not(:has(div[role="main"]:not(.xlshs6z) > div)) div[role="main"] {
            display: none !important;
          }

          /* When an active Conversation IS mounted in div[role="main"], Messenger's mobile UI renders a native Back button (←) in the conversation header and unmounts the Thread list contents, so hide Thread list and give [role="main"] 100% width in 0ms! */
          body:has(div[role="main"]:not(.xlshs6z) > div) div[role="navigation"][aria-label="Thread list"] {
            display: none !important;
          }
          body:has(div[role="main"]:not(.xlshs6z) > div) div[role="main"] {
            position: relative !important;
            display: flex !important;
            flex: 1 1 100% !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 100% !important;
            height: 100% !important;
          }
          body:has(div[role="main"]:not(.xlshs6z) > div) div[role="main"] > div {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            height: 100% !important;
          }
        }
      `;
    } else if (host.includes('twitch.tv')) {
      css += `
        /* 11. Twitch Narrow Sidebar Optimization */
        #onetrust-consent-sdk,
        .consent-banner {
          display: none !important;
        }
        @media (max-width: 820px) {
          .side-nav,
          [data-a-target="side-nav-bar"] {
            display: none !important;
            width: 0 !important;
          }
          .tw-root--theme-dark,
          .root-scrollable,
          main,
          .channel-root,
          .persistent-player {
            width: 100% !important;
            max-width: 100vw !important;
            min-width: 0 !important;
            left: 0 !important;
            margin-left: 0 !important;
          }
          .channel-root__right-column {
            position: relative !important;
            width: 100% !important;
            max-width: 100vw !important;
            transform: none !important;
          }
        }
      `;
    } else if (host.includes('chatgpt.com') || host.includes('openai.com')) {
      css += `
        /* 12. ChatGPT Narrow Sidebar Optimization */
        html, body, #__next, main {
          min-width: 0 !important;
          max-width: 100vw !important;
          overflow-x: clip !important;
        }
        article,
        [data-message-author-role],
        .prose {
          max-width: 100% !important;
          min-width: 0 !important;
          overflow-wrap: anywhere !important;
        }
        pre, code {
          max-width: 100% !important;
          overflow-x: auto !important;
        }
        form {
          max-width: 100% !important;
          padding-left: 6px !important;
          padding-right: 6px !important;
        }
      `;
    } else if (host.includes('gemini.google.com')) {
      css += `
        /* 13. Google Gemini Narrow Sidebar Optimization */
        html, body, chat-app, main {
          min-width: 0 !important;
          max-width: 100vw !important;
          overflow-x: clip !important;
        }
        /* Keep prompt input bar & conversation area fitting 100% inside narrow sidebars */
        input-container,
        .input-area-container,
        rich-textarea {
          max-width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
        }
      `;
    } else {
      css += `
        /* 14. Universal Responsive Adapter for Custom Added Websites (+ button) */
        html, body, #root, #app, #__next, main, [role="main"] {
          min-width: 0 !important;
          max-width: 100vw !important;
          overflow-x: clip !important;
          box-sizing: border-box !important;
        }
        img, video, canvas {
          max-width: 100% !important;
        }
        pre, code, table {
          max-width: 100% !important;
          overflow-x: auto !important;
        }
      `;
    }

    return css;
  }

  function detectPageFaviconUrl() {
    try {
      const links = Array.from(
        document.querySelectorAll(
          'link[rel*="icon" i], link[rel*="apple-touch-icon" i], link[rel="mask-icon" i]'
        )
      );
      let bestHref = '';
      let bestScore = -1;
      for (const link of links) {
        const href = link.href || link.getAttribute('href') || '';
        if (!href || href.startsWith('javascript:')) continue;
        const rel = (link.getAttribute('rel') || '').toLowerCase();
        const type = (link.getAttribute('type') || '').toLowerCase();
        const sizes = (link.getAttribute('sizes') || '').toLowerCase();
        let score = 10;
        if (rel.includes('apple-touch-icon')) score += 45;
        if (type.includes('svg') || href.endsWith('.svg')) score += 50;
        if (type.includes('png') || href.includes('.png')) score += 25;
        if (sizes.includes('any')) score += 40;
        if (score > bestScore) {
          bestHref = href;
          bestScore = score;
        }
      }
      return bestHref;
    } catch (_) {
      return '';
    }
  }

  let activeSocialThemeMode = 'native';
  let activeSocialAccent = '#FF5C39';
  let isSyncingPlatformDarkDom = false;
  let genericInvertTimer = null;
  let matchMediaHookInstalled = false;

  function syncPageMatchMediaDarkFlag(enableDark) {
    if (!isFoxHubContext || !window.wrappedJSObject || typeof exportFunction !== 'function') return;
    try {
      const pageWin = window.wrappedJSObject;
      pageWin.__pmForceDarkColorScheme = Boolean(enableDark);
      if (!matchMediaHookInstalled && typeof pageWin.matchMedia === 'function') {
        matchMediaHookInstalled = true;
        const origMatchMedia = pageWin.matchMedia.bind(pageWin);
        exportFunction(
          function (query) {
            const realMql = origMatchMedia(query);
            if (!pageWin.__pmForceDarkColorScheme || !realMql) return realMql;
            const q = String(query || '').toLowerCase();
            if (q.includes('prefers-color-scheme')) {
              const isDarkQuery = /prefers-color-scheme\s*:\s*dark/.test(q);
              const isLightQuery = /prefers-color-scheme\s*:\s*light/.test(q);
              if (isDarkQuery || isLightQuery) {
                try {
                  Object.defineProperty(realMql, 'matches', {
                    get: exportFunction(
                      () => (pageWin.__pmForceDarkColorScheme ? isDarkQuery : origMatchMedia(query).matches),
                      pageWin
                    ),
                    configurable: true
                  });
                } catch (_) {}
              }
            }
            return realMql;
          },
          pageWin,
          { defineAs: 'matchMedia' }
        );
      }
    } catch (_) {}
  }

  function getCookieVal(name) {
    try {
      const raw = document.cookie || '';
      const parts = raw.split(';');
      for (const p of parts) {
        const eq = p.indexOf('=');
        if (eq > 0 && p.slice(0, eq).trim() === name) {
          return p.slice(eq + 1).trim();
        }
      }
    } catch (_) {}
    return '';
  }

  function parseRgbComponents(str) {
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

  function computeLuminance(rgb) {
    return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  }

  function isXBootedInLightMode() {
    try {
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      const metaVal = (metaTheme?.getAttribute('content') || '').trim().toUpperCase();
      if (metaVal === '#FFFFFF' || metaVal === '#FFF' || metaVal === 'RGB(255, 255, 255)') {
        return true;
      }
      const inlineBg = (document.body?.style?.backgroundColor || '').replace(/\s+/g, '').toLowerCase();
      if (inlineBg === 'rgb(255,255,255)' || inlineBg === '#ffffff' || inlineBg === '#fff') {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function checkGenericLightPageAndSmartInvert() {
    const docEl = document.documentElement;
    if (!docEl) return;
    const enableDark = activeSocialThemeMode === 'true-night' || activeSocialThemeMode === 'midnight-oled';
    if (!enableDark || isKnownBuiltInHost || host.includes('twitch.tv') || host.includes('chatgpt.com') || host.includes('openai.com')) {
      if (docEl.hasAttribute('data-pm-smart-invert')) {
        docEl.removeAttribute('data-pm-smart-invert');
      }
      return;
    }
    try {
      const themeStyleEl = document.getElementById('pm-social-app-theme-css');
      if (themeStyleEl) themeStyleEl.disabled = true;
      const htmlBg = parseRgbComponents(window.getComputedStyle(docEl).backgroundColor);
      const bodyBg = document.body ? parseRgbComponents(window.getComputedStyle(document.body).backgroundColor) : null;
      if (themeStyleEl) themeStyleEl.disabled = false;
      const effective = bodyBg && bodyBg.a > 0.15 ? bodyBg : htmlBg && htmlBg.a > 0.15 ? htmlBg : null;
      if (!effective || computeLuminance(effective) > 0.52) {
        if (docEl.getAttribute('data-pm-smart-invert') !== '1') {
          docEl.setAttribute('data-pm-smart-invert', '1');
        }
      } else if (docEl.hasAttribute('data-pm-smart-invert')) {
        docEl.removeAttribute('data-pm-smart-invert');
      }
    } catch (_) {}
  }

  function syncPlatformDarkModeDom(enableDark) {
    if (isSyncingPlatformDarkDom) return;
    const docEl = document.documentElement;
    if (!docEl) return;
    isSyncingPlatformDarkDom = true;
    syncPageMatchMediaDarkFlag(enableDark);
    try {
      if (host.includes('youtube.com')) {
        if (enableDark) {
          if (!docEl.hasAttribute('dark')) {
            docEl.dataset.pmAddedYtDark = '1';
            docEl.setAttribute('dark', '');
          }
          if (docEl.style.colorScheme !== 'dark') {
            docEl.style.colorScheme = 'dark';
          }
          document.querySelectorAll('ytd-masthead, ytd-app, tp-yt-app-drawer, ytmusic-app').forEach((el) => {
            if (!el.hasAttribute('dark')) el.setAttribute('dark', '');
          });
          try {
            const prevPref = getCookieVal('PREF');
            if (!/(^|&)f6=400(&|$)/.test(prevPref)) {
              const nextPref = prevPref
                ? /(^|&)f6=[^&]*/.test(prevPref)
                  ? prevPref.replace(/(^|&)f6=[^&]*/, '$1f6=400')
                  : `${prevPref}&f6=400`
                : 'f6=400';
              document.cookie = 'PREF=; path=/; max-age=0; SameSite=None; Secure';
              document.cookie = `PREF=${nextPref}; domain=.youtube.com; path=/; max-age=31536000; SameSite=None; Secure`;
            }
          } catch (_) {}
        } else if (docEl.dataset.pmAddedYtDark === '1') {
          delete docEl.dataset.pmAddedYtDark;
          if (docEl.hasAttribute('dark')) docEl.removeAttribute('dark');
          docEl.style.colorScheme = '';
          document.querySelectorAll('ytd-masthead, ytd-app, tp-yt-app-drawer').forEach((el) => {
            if (el.hasAttribute('dark')) el.removeAttribute('dark');
          });
        }
      } else if (host.includes('x.com') || host.includes('twitter.com')) {
        const cookieDomain = host.includes('twitter.com') ? '.twitter.com' : '.x.com';
        if (enableDark) {
          const curNight = getCookieVal('night_mode');
          if (curNight !== '2') {
            try {
              if (window.sessionStorage.getItem('pm_x_prev_night') === null) {
                window.sessionStorage.setItem('pm_x_prev_night', curNight || '0');
              }
            } catch (_) {}
            try {
              // Expire any host-only night_mode=0 cookie first so it can never shadow domain=.x.com night_mode=2!
              document.cookie = 'night_mode=; path=/; max-age=0; SameSite=None; Secure';
              document.cookie = `night_mode=2; domain=${cookieDomain}; path=/; max-age=31536000; SameSite=None; Secure`;
              if (getCookieVal('night_mode') !== '2') {
                document.cookie = 'night_mode=2; path=/; max-age=31536000; SameSite=None; Secure';
              }
              if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
                browser.runtime
                  .sendMessage({
                    type: 'PM_SYNC_LIVE_FRAME_COOKIES',
                    origin: 'https://x.com',
                    cookieStr: document.cookie
                  })
                  .catch(() => {});
              }
            } catch (_) {}
          }
          if (isXBootedInLightMode()) {
            if (docEl.getAttribute('data-pm-x-light-pending') !== '1') {
              docEl.setAttribute('data-pm-x-light-pending', '1');
            }
            try {
              if (window.sessionStorage.getItem('pm_x_reloaded_for_dark') !== '1') {
                window.sessionStorage.setItem('pm_x_reloaded_for_dark', '1');
                // Mask immediately in #000000 and raise parent loader curtain so zero white flash is visible during reload!
                docEl.style.setProperty('background', '#000000', 'important');
                docEl.style.setProperty('opacity', '0', 'important');
                notifyParent('PM_FRAME_NAV_START', { title: 'Applying Dark Mode…' });
                setTimeout(() => window.location.reload(), 16);
              }
            } catch (_) {}
          } else {
            if (docEl.hasAttribute('data-pm-x-light-pending')) {
              docEl.removeAttribute('data-pm-x-light-pending');
            }
            try {
              window.sessionStorage.removeItem('pm_x_reloaded_for_dark');
            } catch (_) {}
          }
        } else {
          if (docEl.hasAttribute('data-pm-x-light-pending')) {
            docEl.removeAttribute('data-pm-x-light-pending');
          }
          try {
            const prevNight = window.sessionStorage.getItem('pm_x_prev_night');
            window.sessionStorage.removeItem('pm_x_reloaded_for_dark');
            if (prevNight !== null) {
              window.sessionStorage.removeItem('pm_x_prev_night');
              document.cookie = 'night_mode=; path=/; max-age=0; SameSite=None; Secure';
              document.cookie = `night_mode=${prevNight}; domain=${cookieDomain}; path=/; max-age=31536000; SameSite=None; Secure`;
              if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
                browser.runtime
                  .sendMessage({
                    type: 'PM_SYNC_LIVE_FRAME_COOKIES',
                    origin: 'https://x.com',
                    cookieStr: document.cookie
                  })
                  .catch(() => {});
              }
              if (prevNight !== '2') {
                notifyParent('PM_FRAME_NAV_START', { title: 'Restoring Theme…' });
                setTimeout(() => window.location.reload(), 16);
              }
            }
          } catch (_) {}
        }
      } else if (host.includes('telegram.org')) {
        if (enableDark) {
          if (!docEl.classList.contains('night') && !docEl.classList.contains('theme-dark')) {
            docEl.dataset.pmAddedTgDark = '1';
          }
          if (docEl.classList.contains('theme-light')) {
            docEl.dataset.pmWasTgLight = '1';
            docEl.classList.remove('theme-light');
          }
          if (!docEl.classList.contains('night')) docEl.classList.add('night');
          if (!docEl.classList.contains('theme-dark')) docEl.classList.add('theme-dark');
        } else if (docEl.dataset.pmAddedTgDark === '1') {
          delete docEl.dataset.pmAddedTgDark;
          docEl.classList.remove('night', 'theme-dark');
          if (docEl.dataset.pmWasTgLight === '1') {
            delete docEl.dataset.pmWasTgLight;
            docEl.classList.add('theme-light');
          }
        }
      } else if (host.includes('instagram.com')) {
        if (enableDark) {
          if (!docEl.classList.contains('_aa4d')) {
            docEl.dataset.pmAddedIgDark = '1';
            docEl.classList.add('_aa4d');
          }
          if (docEl.getAttribute('data-theme') !== 'dark') {
            docEl.setAttribute('data-theme', 'dark');
          }
          try {
            if (window.localStorage.getItem('igt') !== 'dark') {
              window.localStorage.setItem('igt', 'dark');
            }
          } catch (_) {}
        } else if (docEl.dataset.pmAddedIgDark === '1') {
          delete docEl.dataset.pmAddedIgDark;
          docEl.classList.remove('_aa4d');
          docEl.removeAttribute('data-theme');
          try {
            window.localStorage.removeItem('igt');
          } catch (_) {}
        }
      } else if (host.includes('whatsapp.com')) {
        if (enableDark) {
          if (!docEl.classList.contains('dark') && !(document.body && document.body.classList.contains('dark'))) {
            docEl.dataset.pmAddedWaDark = '1';
          }
          if (!docEl.classList.contains('dark')) docEl.classList.add('dark');
          if (document.body && !document.body.classList.contains('dark')) document.body.classList.add('dark');
        } else if (docEl.dataset.pmAddedWaDark === '1') {
          delete docEl.dataset.pmAddedWaDark;
          docEl.classList.remove('dark');
          if (document.body) document.body.classList.remove('dark');
        }
      } else if (host.includes('discord.com')) {
        if (enableDark) {
          if (docEl.classList.contains('theme-light')) {
            docEl.dataset.pmWasDcLight = '1';
            docEl.classList.remove('theme-light');
          }
          if (!docEl.classList.contains('theme-dark')) docEl.classList.add('theme-dark');
        } else if (docEl.dataset.pmWasDcLight === '1') {
          delete docEl.dataset.pmWasDcLight;
          docEl.classList.remove('theme-dark');
          docEl.classList.add('theme-light');
        }
      } else if (host.includes('reddit.com')) {
        if (enableDark) {
          if (!docEl.classList.contains('theme-dark')) {
            docEl.dataset.pmAddedRdDark = '1';
          }
          if (docEl.classList.contains('theme-light')) {
            docEl.dataset.pmWasRdLight = '1';
            docEl.classList.remove('theme-light');
          }
          if (!docEl.classList.contains('theme-dark')) docEl.classList.add('theme-dark');
          if (!docEl.classList.contains('dark')) docEl.classList.add('dark');
        } else if (docEl.dataset.pmAddedRdDark === '1') {
          delete docEl.dataset.pmAddedRdDark;
          docEl.classList.remove('theme-dark', 'dark');
          if (docEl.dataset.pmWasRdLight === '1') {
            delete docEl.dataset.pmWasRdLight;
            docEl.classList.add('theme-light');
          }
        }
      } else if (host.includes('messenger.com') || host.includes('facebook.com')) {
        if (enableDark) {
          if (!docEl.classList.contains('__fb-dark-mode')) {
            docEl.dataset.pmAddedFbDark = '1';
          }
          if (docEl.classList.contains('__fb-light-mode')) {
            docEl.dataset.pmWasFbLight = '1';
            docEl.classList.remove('__fb-light-mode');
          }
          if (!docEl.classList.contains('__fb-dark-mode')) docEl.classList.add('__fb-dark-mode');
          if (document.body) {
            if (document.body.classList.contains('__fb-light-mode')) document.body.classList.remove('__fb-light-mode');
            if (!document.body.classList.contains('__fb-dark-mode')) document.body.classList.add('__fb-dark-mode');
          }
        } else if (docEl.dataset.pmAddedFbDark === '1') {
          delete docEl.dataset.pmAddedFbDark;
          docEl.classList.remove('__fb-dark-mode');
          if (document.body) document.body.classList.remove('__fb-dark-mode');
          if (docEl.dataset.pmWasFbLight === '1') {
            delete docEl.dataset.pmWasFbLight;
            docEl.classList.add('__fb-light-mode');
            if (document.body) document.body.classList.add('__fb-light-mode');
          }
        }
      } else if (host.includes('tiktok.com')) {
        if (enableDark) {
          if (docEl.getAttribute('data-theme') !== 'dark') {
            docEl.dataset.pmPrevTtTheme = docEl.getAttribute('data-theme') || '';
            docEl.dataset.pmAddedTtDark = '1';
            docEl.setAttribute('data-theme', 'dark');
          }
          try {
            if (getCookieVal('tiktok_webapp_theme') !== 'dark') {
              document.cookie = 'tiktok_webapp_theme=; path=/; max-age=0; SameSite=None; Secure';
              document.cookie =
                'tiktok_webapp_theme=dark; domain=.tiktok.com; path=/; max-age=31536000; SameSite=None; Secure';
            }
          } catch (_) {}
        } else if (docEl.dataset.pmAddedTtDark === '1') {
          const prevTt = docEl.dataset.pmPrevTtTheme || '';
          delete docEl.dataset.pmAddedTtDark;
          delete docEl.dataset.pmPrevTtTheme;
          if (prevTt) {
            docEl.setAttribute('data-theme', prevTt);
          } else {
            docEl.removeAttribute('data-theme');
          }
        }
      } else if (host.includes('twitch.tv')) {
        if (enableDark) {
          if (docEl.classList.contains('tw-root--theme-light')) {
            docEl.dataset.pmWasTwLight = '1';
            docEl.classList.remove('tw-root--theme-light');
          }
          if (!docEl.classList.contains('tw-root--theme-dark')) docEl.classList.add('tw-root--theme-dark');
        } else if (docEl.dataset.pmWasTwLight === '1') {
          delete docEl.dataset.pmWasTwLight;
          docEl.classList.remove('tw-root--theme-dark');
          docEl.classList.add('tw-root--theme-light');
        }
      } else if (host.includes('chatgpt.com') || host.includes('openai.com')) {
        if (enableDark) {
          if (!docEl.classList.contains('dark')) {
            docEl.dataset.pmAddedGptDark = '1';
          }
          if (docEl.classList.contains('light')) docEl.classList.remove('light');
          if (!docEl.classList.contains('dark')) docEl.classList.add('dark');
          if (docEl.style.colorScheme !== 'dark') docEl.style.colorScheme = 'dark';
        } else if (docEl.dataset.pmAddedGptDark === '1') {
          delete docEl.dataset.pmAddedGptDark;
          docEl.classList.remove('dark');
          docEl.classList.add('light');
          docEl.style.colorScheme = '';
        }
      } else if (host.includes('gemini.google.com')) {
        if (enableDark && document.body) {
          if (!document.body.classList.contains('dark-theme')) {
            docEl.dataset.pmAddedGemDark = '1';
          }
          if (document.body.classList.contains('light-theme')) document.body.classList.remove('light-theme');
          if (!document.body.classList.contains('dark-theme')) document.body.classList.add('dark-theme');
        } else if (!enableDark && docEl.dataset.pmAddedGemDark === '1' && document.body) {
          delete docEl.dataset.pmAddedGemDark;
          document.body.classList.remove('dark-theme');
          document.body.classList.add('light-theme');
        }
      } else {
        // Custom user websites: activate standard dark-mode framework attributes first, then smart-invert if still light!
        if (enableDark) {
          if (!docEl.classList.contains('dark')) {
            docEl.dataset.pmAddedGenericDark = '1';
            docEl.classList.add('dark');
          }
          if (!docEl.hasAttribute('data-theme')) {
            docEl.dataset.pmAddedDataTheme = '1';
            docEl.setAttribute('data-theme', 'dark');
          }
          if (!docEl.hasAttribute('data-bs-theme')) {
            docEl.dataset.pmAddedBsTheme = '1';
            docEl.setAttribute('data-bs-theme', 'dark');
          }
          if (!docEl.hasAttribute('data-color-mode')) {
            docEl.dataset.pmAddedColorMode = '1';
            docEl.setAttribute('data-color-mode', 'dark');
          }
          clearTimeout(genericInvertTimer);
          genericInvertTimer = setTimeout(checkGenericLightPageAndSmartInvert, 65);
          setTimeout(checkGenericLightPageAndSmartInvert, 450);
        } else {
          if (docEl.hasAttribute('data-pm-smart-invert')) {
            docEl.removeAttribute('data-pm-smart-invert');
          }
          if (docEl.dataset.pmAddedGenericDark === '1') {
            delete docEl.dataset.pmAddedGenericDark;
            docEl.classList.remove('dark');
          }
          if (docEl.dataset.pmAddedDataTheme === '1') {
            delete docEl.dataset.pmAddedDataTheme;
            docEl.removeAttribute('data-theme');
          }
          if (docEl.dataset.pmAddedBsTheme === '1') {
            delete docEl.dataset.pmAddedBsTheme;
            docEl.removeAttribute('data-bs-theme');
          }
          if (docEl.dataset.pmAddedColorMode === '1') {
            delete docEl.dataset.pmAddedColorMode;
            docEl.removeAttribute('data-color-mode');
          }
        }
      }
    } finally {
      Promise.resolve().then(() => {
        isSyncingPlatformDarkDom = false;
      });
    }
  }

  function injectAppThemeCss(themeMode, accentColor) {
    activeSocialThemeMode = themeMode || 'native';
    activeSocialAccent = accentColor || activeSocialAccent || '#FF5C39';
    if (isFoxHubContext) {
      try {
        window.sessionStorage.setItem('__pm_social_theme', activeSocialThemeMode);
        window.sessionStorage.setItem('__pm_social_accent', activeSocialAccent);
      } catch (_) {}
    }
    const isDarkOverride = activeSocialThemeMode === 'true-night' || activeSocialThemeMode === 'midnight-oled';

    syncPlatformDarkModeDom(isDarkOverride);

    const root = document.head || document.documentElement;
    if (!root) return;
    let themeStyle = document.getElementById('pm-social-app-theme-css');
    if (!activeSocialThemeMode || activeSocialThemeMode === 'native') {
      if (themeStyle) themeStyle.remove();
      if (document.documentElement) {
        document.documentElement.removeAttribute('data-pm-social-theme');
        document.documentElement.removeAttribute('data-pm-smart-invert');
      }
      return;
    }
    if (!themeStyle) {
      themeStyle = document.createElement('style');
      themeStyle.id = 'pm-social-app-theme-css';
      root.appendChild(themeStyle);
    } else if (document.head && themeStyle.parentNode !== document.head) {
      document.head.appendChild(themeStyle);
    }
    if (document.documentElement && document.documentElement.getAttribute('data-pm-social-theme') !== activeSocialThemeMode) {
      document.documentElement.setAttribute('data-pm-social-theme', activeSocialThemeMode);
    }
    const accent = activeSocialAccent;
    let tCss = `
      /* FoxHub Social App Custom Theme Overlay (${activeSocialThemeMode}) */
      :root {
        --pm-social-accent: ${accent} !important;
      }
      ::-webkit-scrollbar-thumb {
        background: ${accent}66 !important;
      }
      * {
        scrollbar-color: ${accent}77 transparent !important;
      }
      ::selection {
        background: ${accent}44 !important;
      }
    `;

    if (activeSocialThemeMode !== 'true-night') {
      tCss += `
        body::before {
          content: "";
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, ${accent}, #FF7675, ${accent});
          z-index: 2147483646;
          pointer-events: none;
          opacity: 0.88;
        }
      `;
    }

    if (activeSocialThemeMode === 'warm-glass') {
      tCss += `
        html {
          filter: sepia(0.15) saturate(1.06) brightness(0.98) !important;
        }
        img, video, canvas, picture, iframe, [style*="background-image"] {
          filter: sepia(0) !important;
        }
        body::after {
          content: "";
          position: fixed;
          inset: 0;
          background: radial-gradient(circle at top right, rgba(217, 107, 67, 0.08), rgba(244, 162, 97, 0.04) 60%, transparent);
          pointer-events: none;
          z-index: 2147483645;
        }
      `;
    } else if (activeSocialThemeMode === 'true-night' || activeSocialThemeMode === 'midnight-oled') {
      tCss += `
        :root, html {
          color-scheme: dark !important;
        }
      `;
      if (activeSocialThemeMode === 'midnight-oled') {
        tCss += `
          body::after {
            content: "";
            position: fixed;
            inset: 0;
            background: radial-gradient(circle at top left, rgba(108, 92, 231, 0.08), rgba(0, 206, 209, 0.03) 65%, transparent);
            pointer-events: none;
            z-index: 2147483645;
          }
        `;
      }

      if (host.includes('youtube.com')) {
        tCss += `
          html,
          html[dark],
          html:not(.style-scope),
          html[data-pm-social-theme="true-night"],
          ytd-app,
          ytmusic-app {
            background-color: #000000 !important;
            color: #FFFFFF !important;
            --yt-spec-base-background: #000000 !important;
            --yt-spec-raised-background: #0E0E14 !important;
            --yt-spec-menu-background: #12121A !important;
            --yt-spec-general-background-a: #000000 !important;
            --yt-spec-general-background-b: #08080C !important;
            --yt-spec-general-background-c: #0E0E14 !important;
            --yt-spec-brand-background-primary: #000000 !important;
            --yt-spec-brand-background-solid: #000000 !important;
            --yt-spec-brand-background-secondary: #0A0A0F !important;
            --yt-spec-additive-background: rgba(255, 255, 255, 0.10) !important;
            --yt-spec-badge-chip-background: rgba(255, 255, 255, 0.10) !important;
            --yt-spec-button-chip-background-hover: rgba(255, 255, 255, 0.18) !important;
            --yt-spec-inverted-background: #FFFFFF !important;
            --yt-spec-text-primary: #FFFFFF !important;
            --yt-spec-text-primary-inverse: #000000 !important;
            --yt-spec-text-secondary: #B8BCC8 !important;
            --yt-spec-text-disabled: #7E8290 !important;
            --yt-spec-icon-active-other: #FFFFFF !important;
            --yt-spec-icon-inactive: #D4D7E0 !important;
            --yt-spec-wordmark-text: #FFFFFF !important;
            --yt-spec-10-percent-layer: rgba(255, 255, 255, 0.14) !important;
            --yt-spec-outline: rgba(255, 255, 255, 0.18) !important;
            --ytd-searchbox-background: #0E0E14 !important;
            --ytd-searchbox-legacy-border-color: rgba(255, 255, 255, 0.22) !important;
            --ytd-searchbox-legacy-button-color: #181822 !important;
            --ytd-searchbox-legacy-button-border-color: rgba(255, 255, 255, 0.22) !important;
            --ytd-searchbox-legacy-button-icon-color: #FFFFFF !important;
            --ytd-searchbox-text-color: #FFFFFF !important;
          }
          body,
          ytd-masthead,
          #background.ytd-masthead,
          #container.ytd-masthead,
          #chips-wrapper.ytd-feed-filter-chip-bar-renderer,
          ytd-feed-filter-chip-bar-renderer {
            background: #000000 !important;
            background-color: #000000 !important;
          }
          yt-searchbox .ytSearchboxComponentInputBox,
          #search-form #container.ytd-searchbox {
            background: #0E0E14 !important;
            border-color: rgba(255, 255, 255, 0.22) !important;
            color: #FFFFFF !important;
          }
          yt-searchbox input.ytSearchboxComponentInput,
          input#search {
            color: #FFFFFF !important;
          }
          yt-searchbox button.ytSearchboxComponentSearchButton,
          #search-icon-legacy.ytd-searchbox {
            background: #181822 !important;
            border-color: rgba(255, 255, 255, 0.22) !important;
            color: #FFFFFF !important;
          }
          yt-chip-cloud-chip-renderer:not([selected]) {
            background-color: #14141D !important;
            color: #F4F5F8 !important;
          }
          yt-chip-cloud-chip-renderer[selected] {
            background-color: #FFFFFF !important;
            color: #000000 !important;
          }
          #video-title,
          yt-formatted-string#video-title,
          .yt-core-attributed-string {
            color: var(--yt-spec-text-primary, #FFFFFF);
          }
          ytd-topbar-logo-renderer #logo-icon svg path[fill="#212121"],
          ytd-topbar-logo-renderer #logo-icon svg path[fill="#282828"],
          ytd-topbar-logo-renderer #logo-icon svg path[fill="#0F0F0F"],
          ytd-topbar-logo-renderer #youtube-paths path {
            fill: #FFFFFF !important;
          }
        `;
      } else if (host.includes('x.com') || host.includes('twitter.com')) {
        tCss += `
          html[data-pm-x-light-pending="1"] {
            filter: invert(0.94) hue-rotate(180deg) !important;
            background-color: #FFFFFF !important;
          }
          html[data-pm-x-light-pending="1"] img,
          html[data-pm-x-light-pending="1"] video,
          html[data-pm-x-light-pending="1"] [style*="background-image"] {
            filter: invert(1) hue-rotate(180deg) !important;
          }
          html:not([data-pm-x-light-pending="1"]),
          html:not([data-pm-x-light-pending="1"]) body {
            background-color: #000000 !important;
          }
        `;
      } else if (host.includes('telegram.org')) {
        tCss += `
          html, html.night, html.theme-dark, body {
            background-color: #000000 !important;
            color: #FFFFFF !important;
            --body-background-color: #000000 !important;
            --surface-color: #0E0E14 !important;
            --primary-text-color: #FFFFFF !important;
            --secondary-text-color: #B4B8C4 !important;
            --color-background: #000000 !important;
            --color-background-secondary: #0E0E14 !important;
            --color-text: #FFFFFF !important;
            --color-text-secondary: #B4B8C4 !important;
          }
          #auth-pages, #auth-flow-root, .auth-pages, #MiddleColumn, #LeftColumn, .chatlist-container {
            background-color: #000000 !important;
            color: #FFFFFF !important;
          }
        `;
      } else if (host.includes('instagram.com')) {
        tCss += `
          :root, html, body, ._aa4d, [data-theme="dark"] {
            background-color: #000000 !important;
            color: #F8F9FA !important;
            --ig-primary-background: 0, 0, 0 !important;
            --ig-secondary-background: 12, 12, 16 !important;
            --ig-elevated-background: 20, 20, 26 !important;
            --ig-highlight-background: 28, 28, 36 !important;
            --ig-primary-text: 248, 249, 250 !important;
            --ig-secondary-text: 176, 180, 188 !important;
            --ig-tertiary-text: 132, 136, 146 !important;
            --ig-stroke: 38, 38, 48 !important;
            --ig-elevated-separator: 38, 38, 48 !important;
            --ig-separator: 38, 38, 48 !important;
          }
        `;
      } else if (host.includes('reddit.com')) {
        tCss += `
          :root, html, html.theme-dark, body, shreddit-app {
            background-color: #000000 !important;
            color: #F4F5F8 !important;
            --color-neutral-background: #000000 !important;
            --color-neutral-background-weak: #0B0B10 !important;
            --color-neutral-background-medium: #12121A !important;
            --color-neutral-background-strong: #1A1A24 !important;
            --color-neutral-content: #F4F5F8 !important;
            --color-neutral-content-strong: #FFFFFF !important;
            --color-neutral-content-weak: #B4B8C4 !important;
          }
        `;
      } else if (host.includes('whatsapp.com')) {
        tCss += `
          html, body, body.dark {
            background-color: #000000 !important;
            --app-background: #000000 !important;
            --background-default: #000000 !important;
            --background-default-hover: #0F0F15 !important;
            --panel-header-background: #0A0A0F !important;
            --search-input-container-background: #0A0A0F !important;
            --search-input-background: #14141D !important;
            --compose-input-background: #14141D !important;
            --rich-text-panel-background: #0A0A0F !important;
            --incoming-background: #14141E !important;
            --primary-strong: #FFFFFF !important;
            --secondary: #B4B8C4 !important;
          }
        `;
      } else if (host.includes('messenger.com') || host.includes('facebook.com')) {
        tCss += `
          html, body, .__fb-dark-mode {
            background-color: #000000 !important;
            color: #F5F6F8 !important;
            --surface-background: #000000 !important;
            --web-wash: #000000 !important;
            --card-background: #0E0E14 !important;
            --card-background-flat: #0E0E14 !important;
            --hosted-view-selected-state: rgba(255, 255, 255, 0.10) !important;
            --primary-text: #FFFFFF !important;
            --secondary-text: #B8BCC8 !important;
          }
        `;
      } else if (host.includes('discord.com')) {
        tCss += `
          html, body, .theme-dark {
            background-color: #000000 !important;
            --background-primary: #000000 !important;
            --background-secondary: #08080C !important;
            --background-secondary-alt: #0D0D13 !important;
            --background-tertiary: #000000 !important;
            --background-floating: #101018 !important;
            --text-normal: #F4F5F8 !important;
            --header-primary: #FFFFFF !important;
            --channels-default: #B8BCC8 !important;
          }
        `;
      } else if (host.includes('spotify.com')) {
        tCss += `
          html, body {
            background-color: #000000 !important;
            --background-base: #000000 !important;
            --background-highlight: #12121A !important;
            --background-press: #08080C !important;
            --background-elevated-base: #12121A !important;
            --spice-main: #000000 !important;
            --spice-sidebar: #000000 !important;
            --spice-player: #050508 !important;
            --spice-card: #0E0E14 !important;
            --text-base: #FFFFFF !important;
            --text-subdued: #B8BCC8 !important;
          }
        `;
      } else if (host.includes('tiktok.com')) {
        tCss += `
          html, body, [data-theme="dark"] {
            background-color: #000000 !important;
            color: #FFFFFF !important;
          }
        `;
      } else {
        tCss += `
          html[data-pm-smart-invert="1"] {
            filter: invert(0.93) hue-rotate(180deg) contrast(1.04) !important;
            background-color: #FFFFFF !important;
          }
          html[data-pm-smart-invert="1"] img,
          html[data-pm-smart-invert="1"] video,
          html[data-pm-smart-invert="1"] picture,
          html[data-pm-smart-invert="1"] canvas,
          html[data-pm-smart-invert="1"] [style*="background-image"] {
            filter: invert(1) hue-rotate(180deg) !important;
          }
          html:not([data-pm-smart-invert="1"]),
          html:not([data-pm-smart-invert="1"]) body {
            background-color: #000000 !important;
          }
        `;
      }
    } else if (activeSocialThemeMode === 'rose-twilight') {
      tCss += `
        html {
          filter: hue-rotate(-6deg) saturate(1.07) !important;
        }
        img, video, canvas, picture {
          filter: hue-rotate(6deg) !important;
        }
        body::after {
          content: "";
          position: fixed;
          inset: 0;
          background: radial-gradient(circle at top right, rgba(232, 67, 147, 0.09), rgba(162, 155, 254, 0.05) 65%, transparent);
          pointer-events: none;
          z-index: 2147483645;
        }
      `;
    } else if (activeSocialThemeMode === 'match-theme') {
      tCss += `
        body::after {
          content: "";
          position: fixed;
          inset: 0;
          background: linear-gradient(160deg, ${accent}14 0%, transparent 55%);
          pointer-events: none;
          z-index: 2147483645;
        }
      `;
    }

    themeStyle.textContent = tCss;
  }

  // 1. ZERO-FLASH SYNCHRONOUS 0.00ms BOOT AT document_start:
  // Apply cookies (night_mode=2, PREF=f6=400, tiktok_webapp_theme=dark), matchMedia('(prefers-color-scheme: dark)'),
  // and OLED #000000 CSS synchronously BEFORE <head>, <body>, or any page script executes!
  if (isFoxHubContext && !isSwBootstrap && initialSyncThemeMode && initialSyncThemeMode !== 'native') {
    injectAppThemeCss(initialSyncThemeMode, initialSyncAccent || '#FF5C39');
  }

  // 2. Async storage sync & live updates across SPA hydration and theme toggles
  if (isFoxHubContext && !isSwBootstrap && typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
    browser.storage.local
      .get('settings')
      .then((res) => {
        initialThemeResolved = true;
        const s = (res && res.settings) || {};
        const storedMode = s.socialAppThemeMode || 'native';
        if (storedMode !== activeSocialThemeMode) {
          injectAppThemeCss(storedMode, activeSocialAccent);
        }
      })
      .catch(() => {
        initialThemeResolved = true;
      });

    if (browser.storage.onChanged) {
      browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.settings && changes.settings.newValue) {
          const nextMode = changes.settings.newValue.socialAppThemeMode || 'native';
          if (nextMode !== activeSocialThemeMode) {
            injectAppThemeCss(nextMode, activeSocialAccent);
          }
        }
      });
    }

    document.addEventListener('DOMContentLoaded', () => {
      if (activeSocialThemeMode && activeSocialThemeMode !== 'native') {
        injectAppThemeCss(activeSocialThemeMode, activeSocialAccent);
      }
    });

    if (typeof MutationObserver === 'function' && document.documentElement) {
      const darkHydrationObserver = new MutationObserver(() => {
        if (
          !isSyncingPlatformDarkDom &&
          (activeSocialThemeMode === 'true-night' || activeSocialThemeMode === 'midnight-oled')
        ) {
          syncPlatformDarkModeDom(true);
          if (!document.getElementById('pm-social-app-theme-css')) {
            injectAppThemeCss(activeSocialThemeMode, activeSocialAccent);
          }
        }
      });
      darkHydrationObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'dark', 'data-theme']
      });
    }
  }

  function injectDiscordCaptchaPreconnect() {
    if (!host.includes('discord.com') || !document.head) return;
    if (document.getElementById('pm-discord-hcaptcha-preconnect')) return;
    const hosts = ['https://newassets.hcaptcha.com', 'https://hcaptcha.com', 'https://assets.hcaptcha.com'];
    hosts.forEach((href, idx) => {
      const link = document.createElement('link');
      if (idx === 0) link.id = 'pm-discord-hcaptcha-preconnect';
      link.rel = 'preconnect';
      link.href = href;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });
  }

  // Instant visual feedback & reliable navigation when clicking "Log in" on Spotify Web Player
  function setupSpotifyLoginHelper() {
    if (!host.includes('spotify.com')) return;
    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-testid="login-button"], button, a') : null;
        if (!btn) return;
        const text = (btn.textContent || '').trim().toLowerCase();
        const isLoginBtn =
          btn.getAttribute('data-testid') === 'login-button' ||
          text === 'log in' ||
          text === 'login' ||
          (btn.tagName === 'A' && (btn.getAttribute('href') || '').includes('accounts.spotify.com'));
        if (!isLoginBtn) return;

        // Show immediate tactile feedback on the button AND trigger PocketHub's loading overlay
        btn.style.opacity = '0.72';
        btn.style.transform = 'scale(0.96)';
        const labelSpan = btn.querySelector('span') || btn;
        if (labelSpan && labelSpan.childNodes.length <= 2) {
          labelSpan.textContent = 'Opening Login…';
        }
        notifyParent('PM_FRAME_NAV_START', { title: 'Opening Spotify Login…' });

        // Fallback if Spotify's internal click handler gets blocked or stalls inside an iframe
        const startHref = window.location.href;
        setTimeout(() => {
          if (window.location.href === startHref && !window.location.hostname.includes('accounts.spotify.com')) {
            window.location.href = `https://accounts.spotify.com/en/login?continue=${encodeURIComponent(startHref)}`;
          }
        }, 420);
      },
      true
    );

    // Detect if Firefox DRM (Widevine EME / GMP decoder) is disabled in user's browser settings
    // (Firefox hides its yellow "You must enable DRM" infobar inside iframes, leaving users wondering why Spotify won't play!)
    if (host === 'open.spotify.com') {
      let drmVerifiedOk = false;
      let drmPollTimer = null;

      const probeWidevineDrm = async (timeoutMs = 3200) => {
        try {
          if (!navigator.requestMediaKeySystemAccess) return false;
          const checkPromise = navigator
            .requestMediaKeySystemAccess('com.widevine.alpha', [
              {
                initDataTypes: ['cenc'],
                audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }]
              }
            ])
            .then(() => true)
            .catch(() => false);
          const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
          return await Promise.race([checkPromise, timeoutPromise]);
        } catch (_) {
          return false;
        }
      };

      const showSpotifyDrmPrompt = async (pulseIfVisible = false) => {
        if (!document.body || drmVerifiedOk) return;
        const existing = document.getElementById('pm-spotify-drm-banner');
        if (existing) {
          if (pulseIfVisible) {
            existing.style.transform = 'scale(1.02)';
            existing.style.boxShadow = '0 0 0 2px #1ed760, 0 10px 28px rgba(0,0,0,0.8)';
            setTimeout(() => {
              existing.style.transform = 'scale(1)';
              existing.style.boxShadow = '0 8px 24px rgba(0,0,0,0.72)';
            }, 260);
          }
          return;
        }

        const isOk = await probeWidevineDrm(3200);
        if (isOk) {
          drmVerifiedOk = true;
          return;
        }
        if (document.getElementById('pm-spotify-drm-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'pm-spotify-drm-banner';
        banner.style.cssText =
          'position:fixed;bottom:78px;left:8px;right:8px;z-index:2147483640;background:#161616;border:1.5px solid #1ed760;border-radius:12px;padding:11px 12px;color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:11.5px;line-height:1.45;box-shadow:0 8px 24px rgba(0,0,0,0.72);display:flex;flex-direction:column;gap:8px;transition:transform 0.2s ease,box-shadow 0.2s ease;';

        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:8px;';

        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-weight:700;color:#1ed760;font-size:12.5px;';
        titleEl.textContent = '🎵 Enable Firefox DRM to Play Music';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Dismiss';
        closeBtn.style.cssText =
          'background:transparent;border:none;color:#aaa;cursor:pointer;font-size:14px;padding:0 4px;line-height:1;';
        closeBtn.addEventListener('click', () => {
          if (drmPollTimer) {
            clearInterval(drmPollTimer);
            drmPollTimer = null;
          }
          banner.remove();
        });

        topRow.appendChild(titleEl);
        topRow.appendChild(closeBtn);

        const descEl = document.createElement('div');
        descEl.style.cssText = 'color:#d8d8d8;font-size:11.2px;';
        descEl.textContent =
          'Spotify requires Widevine DRM for audio (Firefox hides its yellow "Enable DRM" bar inside sidebars). Choose either quick option:';

        const stepsEl = document.createElement('div');
        stepsEl.style.cssText =
          'background:#222;border-radius:8px;padding:7px 9px;color:#eee;font-size:11px;display:flex;flex-direction:column;gap:4px;';

        const step1 = document.createElement('div');
        step1.textContent = '1️⃣ Click "Open Tab to Enable DRM" below → click Firefox\'s yellow "Enable DRM" button at the top of the tab.';

        const step2 = document.createElement('div');
        step2.textContent =
          '2️⃣ Or in Firefox Settings → Tabs and browsing → Media → check "Play DRM-controlled content".';

        const step3 = document.createElement('div');
        step3.style.cssText = 'color:#aaa;font-size:10.3px;';
        step3.textContent =
          'Tip: If audio still stays paused, open about:config and set media.gmp.decoder.enabled to true.';

        stepsEl.appendChild(step1);
        stepsEl.appendChild(step2);
        stepsEl.appendChild(step3);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px;';

        const openTabBtn = document.createElement('button');
        openTabBtn.type = 'button';
        openTabBtn.textContent = '⚡ Open Tab to Enable DRM';
        openTabBtn.style.cssText =
          'background:#1ed760;color:#000;font-weight:700;border:none;border-radius:999px;padding:6px 11px;font-size:11px;cursor:pointer;';
        openTabBtn.addEventListener('click', () => {
          notifyParent('PM_OPEN_SPOTIFY_DRM_TAB', { url: 'https://open.spotify.com/' });
          openTabBtn.textContent = '✓ Opened Tab — Click "Enable DRM" at Top!';
        });

        const reloadBtn = document.createElement('button');
        reloadBtn.type = 'button';
        reloadBtn.textContent = '↻ I Enabled It — Reload';
        reloadBtn.style.cssText =
          'background:#2a2a2a;color:#fff;font-weight:600;border:1px solid #444;border-radius:999px;padding:6px 10px;font-size:11px;cursor:pointer;';
        reloadBtn.addEventListener('click', () => {
          reloadBtn.textContent = 'Reloading…';
          window.location.reload();
        });

        btnRow.appendChild(openTabBtn);
        btnRow.appendChild(reloadBtn);

        banner.appendChild(topRow);
        banner.appendChild(descEl);
        banner.appendChild(stepsEl);
        banner.appendChild(btnRow);
        document.body.appendChild(banner);

        // Poll every 2.5s while banner is open: as soon as user enables DRM in Firefox, auto-reload Spotify!
        if (!drmPollTimer) {
          drmPollTimer = setInterval(async () => {
            if (!document.getElementById('pm-spotify-drm-banner')) {
              clearInterval(drmPollTimer);
              drmPollTimer = null;
              return;
            }
            const ready = await probeWidevineDrm(1800);
            if (ready) {
              drmVerifiedOk = true;
              clearInterval(drmPollTimer);
              drmPollTimer = null;
              titleEl.textContent = '✓ Firefox DRM Activated! Starting Spotify…';
              setTimeout(() => window.location.reload(), 650);
            }
          }, 2500);
        }
      };

      // Also re-prompt if user clicks a Play button while DRM is still off
      document.addEventListener(
        'click',
        (e) => {
          if (drmVerifiedOk) return;
          const playEl =
            e.target && e.target.closest
              ? e.target.closest('[data-testid="play-button"], [data-testid="control-button-playpause"]')
              : null;
          if (playEl) {
            showSpotifyDrmPrompt(true);
          }
        },
        true
      );

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(() => showSpotifyDrmPrompt(false), 1400);
      } else {
        window.addEventListener('DOMContentLoaded', () => setTimeout(() => showSpotifyDrmPrompt(false), 1400), {
          once: true
        });
      }
    }
  }

  // Auto-recover X / Twitter if first load or /i/chat shows a transient "Something went wrong" / "Retry" state
  let xAutoRetriedAt = 0;
  function checkXTransientErrorRecovery() {
    if (!host.includes('x.com') && !host.includes('twitter.com')) return;
    if (Date.now() - xAutoRetriedAt < 8000) return;
    const retryBtn = document.querySelector('[data-testid="error-detail"] [role="button"], main button');
    if (retryBtn) {
      const txt = (retryBtn.textContent || '').trim().toLowerCase();
      if (txt === 'retry' || txt === 'try again') {
        xAutoRetriedAt = Date.now();
        retryBtn.click();
      }
    }
  }

  // YouTube Fullscreen & Picture-in-Picture (PiP) Support inside Sidebar Iframe
  function setupYouTubeFullscreenAndPipHelper() {
    if (!host.includes('youtube.com')) return;

    const triggerVideoFullscreen = () => {
      try {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
          return;
        }
        const playerEl =
          document.getElementById('movie_player') ||
          document.querySelector('.html5-video-player') ||
          document.querySelector('video.html5-main-video') ||
          document.documentElement;
        if (playerEl && playerEl.requestFullscreen) {
          playerEl.requestFullscreen().catch(() => {
            const vid = document.querySelector('video');
            if (vid && vid.requestFullscreen) vid.requestFullscreen().catch(() => {});
          });
        }
      } catch (_) {}
    };

    document.addEventListener(
      'click',
      (e) => {
        const fsBtn =
          e.target && e.target.closest
            ? e.target.closest('.ytp-fullscreen-button, button[aria-label*="Full screen" i], button[title*="Full screen" i]')
            : null;
        if (!fsBtn) return;
        const wasFs = Boolean(document.fullscreenElement);
        setTimeout(() => {
          if (Boolean(document.fullscreenElement) === wasFs) {
            triggerVideoFullscreen();
          }
        }, 90);
      },
      true
    );

    // Inject a sleek Picture-in-Picture (PiP) button next to YouTube's fullscreen button
    const ensureYtPipButton = () => {
      const rightControls = document.querySelector('.ytp-right-controls');
      if (!rightControls || rightControls.querySelector('.pm-yt-pip-btn')) return;
      const pipBtn = document.createElement('button');
      pipBtn.type = 'button';
      pipBtn.className = 'ytp-button pm-yt-pip-btn';
      pipBtn.title = 'Picture-in-Picture (Floating Video Window)';
      pipBtn.setAttribute('aria-label', 'Picture-in-Picture');
      pipBtn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;vertical-align:top;width:40px;height:100%;opacity:0.92;';
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', '20');
      svg.setAttribute('height', '20');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', '#ffffff');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      const r1 = document.createElementNS(svgNS, 'rect');
      r1.setAttribute('x', '2');
      r1.setAttribute('y', '4');
      r1.setAttribute('width', '20');
      r1.setAttribute('height', '15');
      r1.setAttribute('rx', '2');
      const r2 = document.createElementNS(svgNS, 'rect');
      r2.setAttribute('x', '12');
      r2.setAttribute('y', '11');
      r2.setAttribute('width', '8');
      r2.setAttribute('height', '6');
      r2.setAttribute('rx', '1');
      r2.setAttribute('fill', '#ffffff');
      svg.appendChild(r1);
      svg.appendChild(r2);
      pipBtn.appendChild(svg);

      pipBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const vid = document.querySelector('video.html5-main-video, video');
        if (!vid) return;
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(() => {});
        } else if (vid.requestPictureInPicture) {
          vid.requestPictureInPicture().catch(() => {
            triggerVideoFullscreen();
          });
        } else {
          triggerVideoFullscreen();
        }
      });

      const fsBtn = rightControls.querySelector('.ytp-fullscreen-button');
      if (fsBtn) {
        rightControls.insertBefore(pipBtn, fsBtn);
      } else {
        rightControls.appendChild(pipBtn);
      }
    };

    // Ensure YouTube's guide drawer starts in overlay mode on narrow sidebars so clicking #guide-button opens it cleanly
    const ensureYtOverlayGuideMode = () => {
      if (window.innerWidth > 820) return;
      const ytdApp = document.querySelector('ytd-app');
      if (ytdApp && ytdApp.hasAttribute('guide-persistent-and-visible')) {
        ytdApp.removeAttribute('guide-persistent-and-visible');
      }
    };

    setTimeout(ensureYtOverlayGuideMode, 250);
    setTimeout(ensureYtOverlayGuideMode, 900);
    setInterval(ensureYtPipButton, 2000);
  }

  // Detect unread messages / notifications from document.title and app/generic DOM badges
  let lastReportedUnread = -1;
  let lastReportedHasUnread = false;
  let lastRouteOrClickAt = Date.now();
  let zeroUnreadStreak = 0;
  let webNotificationUnreadCount = 0;

  window.addEventListener(
    'pointerdown',
    () => {
      if (webNotificationUnreadCount > 0) {
        webNotificationUnreadCount = 0;
      }
    },
    { passive: true }
  );

  function detectUnreadState() {
    // Pure media/streaming & AI apps (Spotify, YouTube, Twitch, ChatGPT, Gemini) should never trigger unread badges from song/video titles
    if (
      host.includes('spotify.com') ||
      host.includes('youtube.com') ||
      host.includes('twitch.tv') ||
      host.includes('chatgpt.com') ||
      host.includes('gemini.google.com')
    ) {
      return;
    }

    let unreadCount = webNotificationUnreadCount;
    let hasUnread = webNotificationUnreadCount > 0;

    const title = document.title || '';
    // Match leading "(3) Site", "[4] Site", or "• Site" at the start of the title (universal across almost all web apps)
    if (!host.includes('tiktok.com')) {
      const titleMatch = title.match(/^\s*[\(\[](\d{1,3})\+?[\)\]]\s+/);
      if (titleMatch && titleMatch[1]) {
        const parsedTitleCount = parseInt(titleMatch[1], 10) || 0;
        if (parsedTitleCount > unreadCount) unreadCount = parsedTitleCount;
      }
      if (title.trim().startsWith('•') || title.trim().startsWith('●') || title.trim().startsWith('* ')) {
        hasUnread = true;
      }
    }

    try {
      if (host.includes('whatsapp.com')) {
        const badges = document.querySelectorAll(
          'span[data-testid="icon-unread-count"], [aria-label*="unread message" i]'
        );
        let domSum = 0;
        badges.forEach((b) => {
          const n = parseInt((b.textContent || '').trim(), 10);
          if (!isNaN(n) && n > 0) domSum += n;
        });
        if (domSum > unreadCount) unreadCount = domSum;
      } else if (host.includes('instagram.com')) {
        const dmBadge = document.querySelector('a[href*="/direct/inbox"] span, [aria-label*="unread" i]');
        if (dmBadge) {
          const n = parseInt((dmBadge.textContent || '').trim(), 10);
          if (!isNaN(n) && n > unreadCount) unreadCount = n;
        }
      } else if (host.includes('discord.com')) {
        const badges = document.querySelectorAll('[class*="numberBadge_"]');
        let domSum = 0;
        badges.forEach((b) => {
          const n = parseInt((b.textContent || '').trim(), 10);
          if (!isNaN(n) && n > 0) domSum += n;
        });
        if (domSum > unreadCount) unreadCount = domSum;
      } else if (host.includes('tiktok.com')) {
        // On TikTok, only read the DM message count badge (not fluctuating activity/title counts on page changes)
        const dmBadge = document.querySelector('[data-e2e="message-icon"] sup, a[href*="/messages"] sup');
        if (dmBadge) {
          const n = parseInt((dmBadge.textContent || '').trim(), 10);
          if (!isNaN(n) && n >= 0) unreadCount = n;
        }
      } else if (host.includes('x.com') || host.includes('twitter.com')) {
        const dmBadge = document.querySelector(
          'a[href="/messages"] [aria-label*="unread" i], a[href="/i/chat"] [aria-label*="unread" i], [data-testid="AppTabBar_DirectMessage_Link"] span, [data-testid="AppTabBar_Notifications_Link"] [aria-label*="unread" i]'
        );
        if (dmBadge) {
          const n = parseInt((dmBadge.textContent || '').trim(), 10);
          if (!isNaN(n) && n > unreadCount) unreadCount = n;
          else if (dmBadge.getAttribute('aria-label')) hasUnread = true;
        }
      } else {
        // Universal out-of-the-box DOM badge & indicator detector for ANY custom website (GitHub, Threads, Bluesky, Slack, LinkedIn, Mastodon, etc.)
        const genericBadges = document.querySelectorAll(
          '[data-unread-count], [aria-label*="unread notification" i], [aria-label*="unread message" i], [aria-label*="new notification" i], .mail-status.unread, [data-target="notification-indicator.badge"]:not([hidden])'
        );
        genericBadges.forEach((el) => {
          const attrCount = parseInt(el.getAttribute('data-unread-count') || '', 10);
          if (!isNaN(attrCount) && attrCount > unreadCount) {
            unreadCount = attrCount;
          }
          const txtCount = parseInt((el.textContent || '').trim(), 10);
          if (!isNaN(txtCount) && txtCount > 0 && txtCount < 1000 && txtCount > unreadCount) {
            unreadCount = txtCount;
          }
          const style = window.getComputedStyle(el);
          if (style && style.display !== 'none' && style.visibility !== 'hidden') {
            hasUnread = true;
          }
        });
      }
    } catch (_) {}

    if (unreadCount > 0) hasUnread = true;

    const isRouteTransition = Date.now() - lastRouteOrClickAt < 5000;
    const curPath = (window.location.pathname || '').toLowerCase();
    const onInboxOrNotifRoute =
      curPath.startsWith('/messages') ||
      curPath.startsWith('/i/chat') ||
      curPath.startsWith('/notifications') ||
      curPath.startsWith('/direct');

    if (unreadCount === 0 && !hasUnread && (lastReportedUnread > 0 || lastReportedHasUnread)) {
      if (isRouteTransition) return;
      zeroUnreadStreak++;
      if (!onInboxOrNotifRoute && zeroUnreadStreak < 3) {
        return;
      }
    } else {
      zeroUnreadStreak = 0;
    }

    if (unreadCount !== lastReportedUnread || hasUnread !== lastReportedHasUnread) {
      lastReportedUnread = unreadCount;
      lastReportedHasUnread = hasUnread;
      notifyParent('PM_FRAME_UNREAD_UPDATE', {
        unreadCount,
        hasUnread,
        isRouteTransition,
        title
      });
    }
  }

  // Real Visual Readiness Detector: ensures #pm-media-loader stays visible until the SPA actually paints UI!
  let visualReadySent = false;
  function isAppVisuallyPainted() {
    if (!document.body) return false;
    try {
      if (host.includes('whatsapp.com')) {
        return Boolean(document.querySelector('#app > div, #side, #main, canvas, [data-ref]'));
      }
      if (host.includes('spotify.com')) {
        return Boolean(
          document.querySelector('#main, #main-view, .Root__main-view, [data-testid="root"], #Desktop_LeftSidebar_Id, form')
        );
      }
      if (host.includes('instagram.com')) {
        return Boolean(document.querySelector('main[role="main"], nav, [role="navigation"], article, form'));
      }
      if (host.includes('discord.com')) {
        return Boolean(
          document.querySelector('#app-mount > div, [class*="sidebar_"], [class*="chat_"], form[class*="authBox"], div[class*="authBox"]')
        );
      }
      if (host.includes('telegram.org')) {
        return isTelegramVisuallyMounted();
      }
      if (host.includes('reddit.com')) {
        return Boolean(document.querySelector('shreddit-app, rs-app, main, [role="main"], reddit-header-large'));
      }
      if (host.includes('youtube.com')) {
        return Boolean(
          document.querySelector('ytd-masthead #container, ytd-page-manager > *, ytmusic-app, video, form')
        );
      }
      if (host.includes('x.com') || host.includes('twitter.com')) {
        return Boolean(
          document.querySelector(
            '#react-root main, [data-testid="primaryColumn"], [data-testid="DMDrawer"], header[role="banner"], [data-testid="loginButton"], [data-testid="google_sign_in_container"], form, input'
          )
        );
      }
      if (host.includes('tiktok.com')) {
        return Boolean(
          document.querySelector('#app > div, video, [data-e2e="recommend-list-item-container"], [data-e2e="inbox-list"], main')
        );
      }
      if (host.includes('messenger.com')) {
        return Boolean(document.querySelector('[role="main"], [role="navigation"], form'));
      }
      if (host.includes('twitch.tv')) {
        return Boolean(
          document.querySelector('[data-a-target="top-nav-container"], .top-nav, main, video, [data-a-target="tw-core-button-label-text"]')
        );
      }
      if (host.includes('chatgpt.com') || host.includes('openai.com')) {
        return Boolean(
          document.querySelector('#prompt-textarea, main, nav, form, [data-testid="login-button"]')
        );
      }
      if (host.includes('gemini.google.com')) {
        return Boolean(
          document.querySelector('chat-app, rich-textarea, main, [role="main"], bard-sidenav, a[href*="ServiceLogin"]')
        );
      }
      const paintedEl = document.querySelector('main, [role="main"], nav, article, canvas, video, form, textarea');
      if (paintedEl) return true;
      return document.body.children.length > 0 && document.body.scrollHeight > 80;
    } catch (_) {
      return true;
    }
  }

  function getOwnProfileUrlForCurrentHost() {
    if (host.includes('tiktok.com')) return resolveTikTokOwnProfileUrl();
    if (host.includes('instagram.com')) return resolveInstagramOwnProfileUrl();
    if (host.includes('x.com') || host.includes('twitter.com')) return resolveXOwnProfileUrl();
    return '';
  }

  function checkAndNotifyVisualReady() {
    if (visualReadySent) return;
    if (isFoxHubContext && !initialThemeResolved) return;
    if (document.documentElement && document.documentElement.hasAttribute('data-pm-x-light-pending')) return;
    if (isAppVisuallyPainted()) {
      visualReadySent = true;
      notifyParent('PM_FRAME_VISUAL_READY', {
        title: document.title || '',
        faviconUrl: detectPageFaviconUrl(),
        ownProfileUrl: getOwnProfileUrlForCurrentHost()
      });
    }
  }

  function startVisualPaintWatcher() {
    visualReadySent = false;
    checkAndNotifyVisualReady();
    if (visualReadySent) return;
    requestAnimationFrame(() => checkAndNotifyVisualReady());
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      checkAndNotifyVisualReady();
      if (visualReadySent || attempts > 55) {
        clearInterval(timer);
        if (!visualReadySent) {
          visualReadySent = true;
          notifyParent('PM_FRAME_VISUAL_READY', {
            title: document.title || '',
            faviconUrl: detectPageFaviconUrl(),
            ownProfileUrl: getOwnProfileUrlForCurrentHost()
          });
        }
      }
    }, 20);
  }

  let cachedSidebarCss = null;
  function injectOptimizerCss() {
    const root = document.head || document.documentElement;
    if (!root) return;
    syncAppSpecificDomState();
    injectDiscordCaptchaPreconnect();
    let style = document.getElementById('pm-frame-optimizer-css');
    if (!style) {
      style = document.createElement('style');
      style.id = 'pm-frame-optimizer-css';
      if (cachedSidebarCss === null) {
        cachedSidebarCss = getResponsiveSidebarCss();
      }
      style.textContent = cachedSidebarCss;
      root.appendChild(style);
    }
  }

  if (document.documentElement) {
    injectOptimizerCss();
  } else {
    const obs = new MutationObserver(() => {
      if (document.documentElement) {
        injectOptimizerCss();
        obs.disconnect();
      }
    });
    obs.observe(document, { childList: true });
  }

  function setupInstagramDmStoryRingGuard() {
    if (!host.includes('instagram.com')) return;

    const isDmRoute = () => (window.location.pathname || '').startsWith('/direct');

    const blockStoryHover = (e) => {
      if (!isDmRoute()) return;
      const t = e.target;
      if (!t || !t.closest) return;
      const rowBtn = t.closest('div[role="button"][tabindex="0"], [role="listitem"]');
      if (!rowBtn) return;
      const storyWrap = t.closest('div:has(> canvas)');
      if (storyWrap && rowBtn.contains(storyWrap)) {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    const interceptStoryPortalClick = (e) => {
      if (!isDmRoute()) return;
      const t = e.target;
      if (!t || !t.closest) return;
      // 1. Catch any floating body > button[style*="position: fixed"] Story Portal spawned by IGDStoryRingOffMsys.react
      const portalBtn = t.closest('body > button[style*="position: fixed"]');
      if (portalBtn) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        portalBtn.style.display = 'none';
        portalBtn.style.pointerEvents = 'none';
        if (e.type === 'click' && typeof e.clientX === 'number') {
          const underEl = document.elementFromPoint(e.clientX, e.clientY);
          const dmRow = underEl && underEl.closest ? underEl.closest('div[role="button"][tabindex="0"]') : null;
          if (dmRow) dmRow.click();
        }
        return;
      }
      // 2. Catch any direct click on a canvas or story ring inside a DM row and forward it to the outer DM row button
      const rowBtn = t.closest('div[role="button"][tabindex="0"]');
      if (rowBtn) {
        const storyWrap = t.closest('div:has(> canvas)');
        if (storyWrap && rowBtn.contains(storyWrap) && t !== rowBtn) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (e.type === 'click') {
            rowBtn.click();
          }
        }
      }
    };

    window.addEventListener('pointerover', blockStoryHover, true);
    window.addEventListener('pointerenter', blockStoryHover, true);
    window.addEventListener('mouseover', blockStoryHover, true);
    window.addEventListener('pointerdown', interceptStoryPortalClick, true);
    window.addEventListener('mousedown', interceptStoryPortalClick, true);
    window.addEventListener('click', interceptStoryPortalClick, true);
  }

  let videoLoadbarConfig = {
    enabled: true,
    style: 'sunset',
    customColor: '#FF3366',
    size: 'normal',
    accentColor: initialSyncAccent || '#D95032'
  };
  let applyVideoLoadbarVisualsNow = null;

  function updateVideoLoadbarConfig(patch = {}) {
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

  function setupScrollingVideoScrubberBar() {
    if (isBgAudioFrame) return;
    const isSupportedHost =
      host.includes('instagram.com') ||
      (host.includes('youtube.com') && !host.includes('music.youtube.com')) ||
      host.includes('tiktok.com');
    if (!isSupportedHost) return;

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
      if (host.includes('instagram.com')) {
        if (p.startsWith('/reels') || p.includes('/reel/') || p.startsWith('/p/') || p.includes('/p/')) {
          return true;
        }
        return Boolean(document.querySelector('div[role="dialog"] video, article video'));
      }
      if (host.includes('youtube.com')) {
        return p.startsWith('/shorts');
      }
      if (host.includes('tiktok.com')) {
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
      // If a modal dialog with a video is open (e.g., Instagram Profile Reel modal), prioritize the modal's video!
      const dialogVids = host.includes('instagram.com')
        ? Array.from(document.querySelectorAll('div[role="dialog"] video'))
        : [];
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
          if (protoSetter) {
            protoSetter.call(v, clamped);
          }
        }
      } catch (_) {}
      try {
        if (IS_YT && window.wrappedJSObject && typeof window.wrappedJSObject.__seekActiveSpMediaEl === 'function') {
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
        // Hovering without pressing/holding ONLY moves the timestamp preview tooltip — NEVER move the progress fill or thumb unless pressed/held!
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

    let lastFindAt = 0;

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
      if (!host.includes('tiktok.com')) return false;
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

    const syncScrubberUi = (forceFind = false) => {
      rafPending = false;
      if (host.includes('instagram.com')) {
        syncInstagramModalVideoControls();
      }
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
      // Hide scrubber immediately on TikTok when the comments drawer is open so it never overlaps the comment section!
      if (isTikTokCommentDrawerOpen(vh, vw)) {
        if (scrubberEl) scrubberEl.style.display = 'none';
        return;
      }
      const now = Date.now();
      let v = boundVideo;
      if (
        forceFind ||
        !v ||
        v.paused ||
        v.ended ||
        !document.contains(v) ||
        now - lastFindAt > 450
      ) {
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
        if (boundVideo) {
          boundVideo.removeEventListener('timeupdate', updateScrubberTimeOnly);
        }
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
      // On narrow screens, YouTube Shorts centers a shorter 9:16 <video> inside the taller #player-container card (where the title & sound pills sit at the bottom).
      // Pin the scrubber bar to the bottom of the Short/Reel card container so it NEVER floats over the video title text!
      if (host.includes('youtube.com')) {
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
      } else if (host.includes('tiktok.com')) {
        const ttCard = v.closest('div[class*="DivVideoWrapper"], div[class*="DivBasicPlayerWrapper"], div[class*="DivPlayerContainer"]');
        if (ttCard) {
          const cardRect = ttCard.getBoundingClientRect();
          if (cardRect.width >= 60 && cardRect.height >= 60) {
            rect = cardRect;
          }
        }
      }

      const leftPx = Math.max(0, Math.round(rect.left));
      const rightPx = Math.min(vw, Math.round(rect.right));
      const widthPx = Math.max(60, rightPx - leftPx);

      // If the video reaches the bottom of the viewport and Instagram has a fixed bottom nav bar (not covered by a modal dialog), keep the scrubber above it
      let maxBottomY = vh;
      if (host.includes('instagram.com') && !v.closest('div[role="dialog"]')) {
        maxBottomY = getInstagramBottomNavTop(vh, vw);
        // If the Reel is still mounting or mid-scroll so its bottom extends past the bottom nav bar, hide the scrubber until settled so it never flashes over the bottom buttons!
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
      if (host.includes('instagram.com')) {
        syncInstagramModalVideoControls();
      }
    };
    applyVideoLoadbarVisualsNow = () => syncScrubberUi(false);

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
      if (!host.includes('instagram.com')) return;
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

  let lastTikTokFeedScrollAt = 0;
  let tiktokUserScrolled = false;
  const tiktokBootAt = Date.now();

  if (host.includes('tiktok.com') || host.includes('x.com') || host.includes('twitter.com')) {
    const markTikTokUserScroll = () => {
      tiktokUserScrolled = true;
    };
    window.addEventListener('wheel', markTikTokUserScroll, { capture: true, passive: true });
    window.addEventListener('touchstart', markTikTokUserScroll, { capture: true, passive: true });
    window.addEventListener('keydown', markTikTokUserScroll, { capture: true, passive: true });
    window.addEventListener('pointerdown', markTikTokUserScroll, { capture: true, passive: true });

    window.addEventListener(
      'scroll',
      (ev) => {
        lastTikTokFeedScrollAt = Date.now();
        // Prevent TikTok from auto-scrolling ~3 reels on initial feed hydration before the user has scrolled or clicked!
        const curPath = window.location.pathname || '/';
        const isFeed =
          curPath === '/' ||
          curPath.startsWith('/foryou') ||
          curPath.startsWith('/following') ||
          curPath.startsWith('/home');
        if (isFeed && !tiktokUserScrolled && Date.now() - tiktokBootAt < 6500) {
          if ((window.scrollY || 0) > 4) {
            window.scrollTo(0, 0);
          }
          const t = ev && ev.target;
          if (t && t !== document && t !== window && typeof t.scrollTop === 'number' && t.scrollTop > 4) {
            t.scrollTop = 0;
          }
        }
      },
      { capture: true, passive: true }
    );
  }

  function resolveActiveTikTokVideoUrl() {
    return '';
  }

  let checkPersistentRouteRestore = null;

  function setupPersistentPageMemory() {
    if (isBgAudioFrame) return;
    const STORAGE_KEY = 'pm_page_memory_v1';
    if (host.includes('tiktok.com') || host.includes('x.com') || host.includes('twitter.com')) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (_) {}
      return;
    }
    // Skip chat/mail apps that manage their own virtualized scroll or delete window.localStorage (like Discord)
    if (
      host.includes('discord.com') ||
      host.includes('whatsapp.com') ||
      host.includes('messenger.com') ||
      host.includes('telegram.org') ||
      host.includes('mail.google.com')
    ) {
      return;
    }
    let lastSaveAt = 0;
    let activeInnerScrollEl = null;
    let userHasScrolledOrClicked = false;
    let isRestoringScroll = false;
    let activeRestoreInterval = null;
    let lastRestoredRouteKey = '';
    let routeEnteredAt = Date.now();

    const getRouteKey = () => {
      try {
        const effectiveHref = (host.includes('tiktok.com') && resolveActiveTikTokVideoUrl()) || window.location.href;
        const u = new URL(effectiveHref);
        u.searchParams.delete('pm_boot');
        u.searchParams.delete('t');
        let p = u.pathname || '/';
        if ((host.includes('x.com') || host.includes('twitter.com')) && (p === '/' || p === '')) {
          p = '/home';
        }
        return `${p}${u.search || ''}`;
      } catch (_) {
        const p = window.location.pathname || '/';
        if ((host.includes('x.com') || host.includes('twitter.com')) && (p === '/' || p === '')) {
          return '/home';
        }
        return p;
      }
    };

    const readMemoryMap = () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) || {} : {};
      } catch (_) {
        return {};
      }
    };

    const writeMemoryMap = (map) => {
      try {
        const keys = Object.keys(map);
        if (keys.length > 24) {
          keys
            .sort((a, b) => (map[a]?.ts || 0) - (map[b]?.ts || 0))
            .slice(0, keys.length - 24)
            .forEach((k) => delete map[k]);
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
      } catch (_) {}
    };

    const buildContainerSelector = (el) => {
      if (!el || el === document || el === document.documentElement || el === document.body) return '';
      if (el.id) return `#${CSS.escape(el.id)}`;
      const testId = el.getAttribute && el.getAttribute('data-testid');
      if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
      const role = el.getAttribute && el.getAttribute('role');
      if (role) return `${el.tagName.toLowerCase()}[role="${CSS.escape(role)}"]`;
      if (typeof el.className === 'string' && el.className.trim()) {
        const firstCls = el.className.trim().split(/\s+/)[0];
        if (firstCls && !firstCls.includes(':')) {
          return `${el.tagName.toLowerCase()}.${CSS.escape(firstCls)}`;
        }
      }
      return el.tagName ? el.tagName.toLowerCase() : '';
    };

    const findBestVisibleVideo = () => {
      const vids = document.querySelectorAll('video');
      for (let i = 0; i < vids.length; i++) {
        const v = vids[i];
        if (!v.paused && !v.ended && v.readyState >= 1) return v;
      }
      const vh = window.innerHeight || 600;
      for (let i = 0; i < vids.length; i++) {
        const v = vids[i];
        const r = v.getBoundingClientRect();
        if (r.height > 80 && r.bottom > 40 && r.top < vh - 40) return v;
      }
      return vids[0] || null;
    };

    const saveCurrentPageMemory = (force = false) => {
      const now = Date.now();
      if (!force && now - lastSaveAt < 450) return;
      // Never overwrite saved scroll/video memory during the first 3.2s of initial hydration before user interaction!
      if (!force && !userHasScrolledOrClicked && now - routeEnteredAt < 3200) return;
      lastSaveAt = now;

      const key = getRouteKey();
      const winY = Math.round(window.scrollY || window.pageYOffset || 0);
      let innerTop = 0;
      let innerSel = '';
      if (
        activeInnerScrollEl &&
        activeInnerScrollEl !== document.documentElement &&
        activeInnerScrollEl !== document.body &&
        document.contains(activeInnerScrollEl)
      ) {
        innerTop = Math.round(activeInnerScrollEl.scrollTop || 0);
        innerSel = buildContainerSelector(activeInnerScrollEl);
      }

      let videoTime = 0;
      const vid = findBestVisibleVideo();
      if (vid && Number.isFinite(vid.currentTime) && vid.currentTime > 1.2 && (!vid.duration || vid.currentTime < vid.duration - 0.8)) {
        videoTime = Math.floor(vid.currentTime);
      }

      const isX = host.includes('x.com') || host.includes('twitter.com');
      let activeTab = '';
      let anchorStatusPath = '';
      let anchorOffsetTop = 70;
      if (isX) {
        const selectedTab = document.querySelector('[role="tablist"] [role="tab"][aria-selected="true"]');
        if (selectedTab) {
          activeTab = (selectedTab.textContent || '').trim();
        }
        if (winY > 30) {
          const tweets = document.querySelectorAll('article[data-testid="tweet"]');
          const vh = window.innerHeight || 600;
          for (let i = 0; i < tweets.length; i++) {
            const art = tweets[i];
            const r = art.getBoundingClientRect();
            if (r.bottom > 90 && r.top < vh * 0.75) {
              const statusLink = art.querySelector('a[href*="/status/"]');
              if (statusLink) {
                try {
                  anchorStatusPath = new URL(statusLink.href, window.location.origin).pathname;
                  anchorOffsetTop = Math.max(56, Math.min(220, Math.round(r.top)));
                } catch (_) {}
              }
              break;
            }
          }
        }
      }

      if (!userHasScrolledOrClicked && winY < 10 && innerTop < 10 && videoTime <= 1 && !activeTab) return;

      const map = readMemoryMap();
      const prev = map[key];
      // Protect existing deep scroll position ONLY if page is unloading before user scrolled; if user scrolled back to top, save 0!
      const finalWinY = winY < 15 && !userHasScrolledOrClicked && prev && prev.winY > 25 ? prev.winY : winY;
      const finalInnerTop = innerTop < 15 && !userHasScrolledOrClicked && prev && prev.innerTop > 25 ? prev.innerTop : innerTop;
      const finalInnerSel = finalInnerTop > 0 ? innerSel || (prev && prev.innerSel) || '' : '';

      map[key] = {
        winY: finalWinY,
        innerTop: finalInnerTop,
        innerSel: finalInnerSel,
        videoTime: videoTime > 1 ? videoTime : (prev && !userHasScrolledOrClicked ? prev.videoTime || 0 : 0),
        activeTab: activeTab || (prev && prev.activeTab) || '',
        anchorStatusPath: finalWinY > 30 ? anchorStatusPath || (prev && !userHasScrolledOrClicked ? prev.anchorStatusPath || '' : '') : '',
        anchorOffsetTop: finalWinY > 30 ? anchorOffsetTop : 70,
        ts: now
      };
      writeMemoryMap(map);
    };

    window.addEventListener(
      'scroll',
      (ev) => {
        const t = ev.target;
        if (t && t !== document && t !== document.documentElement && t !== document.body && typeof t.scrollTop === 'number') {
          activeInnerScrollEl = t;
        }
        if (userHasScrolledOrClicked || (!isRestoringScroll && Date.now() - routeEnteredAt > 4500)) {
          saveCurrentPageMemory(false);
        }
      },
      { capture: true, passive: true }
    );

    let lastVideoTimeSaveAt = 0;
    document.addEventListener(
      'timeupdate',
      (ev) => {
        const t = ev.target;
        if (t && t.tagName === 'VIDEO' && t.currentTime > 1.5) {
          const now = Date.now();
          if (now - lastVideoTimeSaveAt >= 5000) {
            lastVideoTimeSaveAt = now;
            saveCurrentPageMemory(false);
          }
        }
      },
      { capture: true, passive: true }
    );
    document.addEventListener(
      'pause',
      (ev) => {
        const t = ev.target;
        if (t && t.tagName === 'VIDEO' && t.currentTime > 1.5) {
          saveCurrentPageMemory(true);
        }
      },
      { capture: true, passive: true }
    );

    window.addEventListener('pagehide', () => saveCurrentPageMemory(true), { passive: true });
    window.addEventListener('beforeunload', () => saveCurrentPageMemory(true), { passive: true });

    const markUserInteraction = (ev) => {
      userHasScrolledOrClicked = true;
      if ((host.includes('x.com') || host.includes('twitter.com')) && ev && ev.type === 'pointerdown') {
        const tabEl = ev.target && ev.target.closest && ev.target.closest('[role="tab"]');
        if (tabEl) {
          setTimeout(() => saveCurrentPageMemory(true), 180);
        }
      }
    };
    window.addEventListener('wheel', markUserInteraction, { passive: true });
    window.addEventListener('touchstart', markUserInteraction, { passive: true });
    window.addEventListener('keydown', markUserInteraction, { passive: true });
    window.addEventListener('pointerdown', markUserInteraction, { passive: true });

    const restoreForRoute = () => {
      const key = getRouteKey();
      if (lastRestoredRouteKey === key) return;
      lastRestoredRouteKey = key;
      routeEnteredAt = Date.now();
      userHasScrolledOrClicked = false;
      if (activeRestoreInterval) {
        clearInterval(activeRestoreInterval);
        activeRestoreInterval = null;
      }

      const map = readMemoryMap();
      const entry = map[key];
      if (!entry || Date.now() - (entry.ts || 0) > 7 * 24 * 3600 * 1000) {
        isRestoringScroll = false;
        return;
      }

      const isX = host.includes('x.com') || host.includes('twitter.com');
      let videoTimeRestored = false;
      let tabRestored = false;
      let tabClickedAt = 0;
      let xAnchorRestored = false;
      let winScrollRestored = false;
      let xStepCount = 0;
      const restoreStartedAt = Date.now();
      isRestoringScroll = true;

      const applyScrollRestore = () => {
        if (userHasScrolledOrClicked || Date.now() - restoreStartedAt > 9500) {
          isRestoringScroll = false;
          if (activeRestoreInterval) {
            clearInterval(activeRestoreInterval);
            activeRestoreInterval = null;
          }
          return;
        }
        const p = window.location.pathname || '/';
        const isSnapReelRoute = p.startsWith('/reels') || p.startsWith('/reel/') || p.startsWith('/shorts');
        try {
          if (isX) {
            if (xAnchorRestored) return;
            // 1. Restore active feed tab ("Following" vs "For you") if saved
            if (!tabRestored && entry.activeTab && (p.startsWith('/home') || p === '/')) {
              const tabs = Array.from(document.querySelectorAll('[role="tablist"] [role="tab"]'));
              if (tabs.length > 0) {
                const matchingTab = tabs.find((t) => (t.textContent || '').trim() === entry.activeTab);
                if (matchingTab) {
                  tabRestored = true;
                  if (matchingTab.getAttribute('aria-selected') !== 'true') {
                    tabClickedAt = Date.now();
                    matchingTab.click();
                    return;
                  }
                }
              }
            }
            // Wait for tweets on the target tab to mount before restoring scroll
            if (tabClickedAt > 0 && Date.now() - tabClickedAt < 420) {
              return;
            }
            const hasMountedTweets = Boolean(document.querySelector('article[data-testid="tweet"]'));
            if (!hasMountedTweets) {
              return;
            }
            if (!entry.winY || entry.winY <= 30) {
              xAnchorRestored = true;
              winScrollRestored = true;
              isRestoringScroll = false;
              if (activeRestoreInterval) {
                clearInterval(activeRestoreInterval);
                activeRestoreInterval = null;
              }
              return;
            }
            // 2. If the exact anchor tweet is in the DOM, snap directly to its saved viewport offset and finish without overshooting!
            if (entry.anchorStatusPath) {
              const safePath = String(entry.anchorStatusPath).replace(/"/g, '');
              const link = document.querySelector(`article[data-testid="tweet"] a[href*="${safePath}"]`);
              const art = link ? link.closest('article[data-testid="tweet"]') : null;
              if (art) {
                const r = art.getBoundingClientRect();
                const targetTop = Number.isFinite(entry.anchorOffsetTop) ? entry.anchorOffsetTop : 70;
                if (Math.abs(r.top - targetTop) > 10) {
                  window.scrollBy({ top: r.top - targetTop, behavior: 'instant' });
                }
                xAnchorRestored = true;
                winScrollRestored = true;
                if (activeRestoreInterval) {
                  clearInterval(activeRestoreInterval);
                  activeRestoreInterval = null;
                }
                setTimeout(() => {
                  try {
                    if (!userHasScrolledOrClicked && document.contains(art)) {
                      const r2 = art.getBoundingClientRect();
                      if (Math.abs(r2.top - targetTop) > 10) {
                        window.scrollBy({ top: r2.top - targetTop, behavior: 'instant' });
                      }
                    }
                  } catch (_) {}
                  isRestoringScroll = false;
                }, 180);
                return;
              }
            }
            // 3. Progressive step-scan down the timeline ONLY AFTER tweets are mounted on the target tab!
            xStepCount += 1;
            const curY = window.scrollY || 0;
            const targetCeiling = Math.max(60, Math.round(entry.winY * 0.92));
            if (curY < targetCeiling - 12 && xStepCount <= 16) {
              const stepTarget =
                xStepCount === 1 && curY < 40
                  ? Math.min(targetCeiling, Math.min(680, Math.max(300, Math.round(entry.winY * 0.55))))
                  : Math.min(targetCeiling, curY + 280);
              window.scrollTo({ top: stepTarget, behavior: 'instant' });
            } else if (xStepCount <= 22) {
              // Hold near targetCeiling for a few ticks while X's React VirtualScroller commits the tweets around this offset
              routeEnteredAt = Date.now();
            } else {
              xAnchorRestored = true;
              winScrollRestored = true;
              isRestoringScroll = false;
              if (activeRestoreInterval) {
                clearInterval(activeRestoreInterval);
                activeRestoreInterval = null;
              }
            }
            return;
          }

          if (!isSnapReelRoute && !winScrollRestored && entry.winY > 15 && Math.abs((window.scrollY || 0) - entry.winY) > 20) {
            window.scrollTo({ top: entry.winY, behavior: 'instant' });
            if (Math.abs((window.scrollY || 0) - entry.winY) <= 24) {
              winScrollRestored = true;
            }
          }
          if (!isSnapReelRoute && entry.innerTop > 15 && entry.innerSel) {
            const container = document.querySelector(entry.innerSel);
            if (container && Math.abs((container.scrollTop || 0) - entry.innerTop) > 20) {
              container.scrollTop = entry.innerTop;
              activeInnerScrollEl = container;
            }
          }
          if (
            !videoTimeRestored &&
            entry.videoTime > 1.5 &&
            !window.location.search.includes('t=') &&
            !host.includes('spotify.com')
          ) {
            const vid = findBestVisibleVideo();
            if (vid && vid.readyState >= 1) {
              if ((vid.currentTime || 0) < 2.0) {
                vid.currentTime = entry.videoTime;
              }
              videoTimeRestored = true;
            }
          }
        } catch (_) {}
      };

      if (isX) {
        activeRestoreInterval = setInterval(applyScrollRestore, 140);
        setTimeout(applyScrollRestore, 60);
      } else {
        const delays = [80, 260, 600, 1200, 2100, 3300];
        delays.forEach((delay) => setTimeout(applyScrollRestore, delay));
        setTimeout(() => {
          isRestoringScroll = false;
        }, 3500);
      }
    };

    checkPersistentRouteRestore = restoreForRoute;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', restoreForRoute, { once: true });
    } else {
      restoreForRoute();
    }
    window.addEventListener('popstate', restoreForRoute, { passive: true });
  }

  function setupGmailComposeHelper() {
    if (host !== 'mail.google.com') return;
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
      search.includes('view=cm') ||
      search.includes('tf=cm') ||
      Boolean(composeMeta) ||
      isAutoSend;
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
        if (setter) {
          setter.call(el, val);
        } else {
          el.value = val;
        }
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
            if ((toInput.value || '').trim() !== targetTo) {
              setNativeInputValue(toInput, targetTo);
            }
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
              try {
                toInput.blur();
              } catch (_) {}
            }, 60);
          }
        }
        if (targetSu) {
          const suInput = document.querySelector('input[name="subjectbox"], input[aria-label="Subject"]');
          if (suInput && !(suInput.value || '').trim()) {
            setNativeInputValue(suInput, targetSu);
          }
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
      try {
        window.name = '';
      } catch (_) {}
      notifyParent('PM_GMAIL_AUTOSEND_RESULT', { ok: Boolean(ok), reason });
    };

    // In ?view=cm&fs=1&tf=1 / ?fs=1&tf=cm mode, Gmail calls window.close() as soon as the message is sent and saved to Sent Mail!
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
        const txt = (el.textContent || '').trim();
        if (txt === 'Send') {
          const r = el.getBoundingClientRect();
          if ((r.width > 12 && r.height > 10) || el.offsetParent !== null || window.innerWidth === 0) return el;
        }
      }
      return null;
    };

    const triggerGmailSendAction = (sendBtn) => {
      try {
        ensureGmailComposeFieldsPopulated();
        // 1. Blur any active To/Cc input so Gmail finalizes the recipient chip before Send is clicked
        if (document.activeElement && document.activeElement !== sendBtn && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        // 2. Dispatch realistic mouse sequence + native click on Send button
        sendBtn.focus();
        ['mousedown', 'mouseup', 'click'].forEach((type) => {
          sendBtn.dispatchEvent(
            new MouseEvent(type, {
              view: window,
              bubbles: true,
              cancelable: true,
              buttons: 1
            })
          );
        });
        if (typeof sendBtn.click === 'function') {
          sendBtn.click();
        }
        // 3. Also dispatch Ctrl+Enter on the message body / dialog (Gmail's universal keyboard send shortcut)
        const bodyBox =
          document.querySelector('div[aria-label="Message Body"], div[role="textbox"][aria-label*="Body" i], div[role="textbox"][g_editable="true"], div[contenteditable="true"]') ||
          sendBtn;
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

    // Also listen for manual Send click when user is in the "Gmail UI" tab
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
      // Even in manual "Gmail UI" embed mode, ensure any fields typed in Local Compose are prefilled & tokenized!
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
      const elapsed = now - startedAt;
      if (elapsed > 13000) {
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
        if (!firstSawSendBtnAt) {
          firstSawSendBtnAt = now;
        }
        ensureGmailComposeFieldsPopulated();
      }

      if (autoSendAttempts > 0) {
        // After clicking Send at least once, watch for Gmail's "Message sent" confirmation or the Send button disappearing
        const alertText = Array.from(document.querySelectorAll('[role="alert"], .bAq, .vh'))
          .map((el) => el.textContent || '')
          .join(' ');
        if (/Message sent|Sending\.\.\.|\bSent\b/i.test(alertText) || !sendBtn) {
          clearInterval(timer);
          setTimeout(() => reportComposeSendResult(true, 'sent_confirmed'), 450);
          return;
        }
      }

      // Wait 650ms after Send button first appears so Gmail finishes tokenizing the recipient chip, then retry every 850ms up to 6 times
      if (sendBtn && firstSawSendBtnAt && now - firstSawSendBtnAt >= 650 && autoSendAttempts < 6 && now - lastAutoSendClickAt >= 850) {
        autoSendAttempts += 1;
        lastAutoSendClickAt = now;
        triggerGmailSendAction(sendBtn);
      }
    }, 150);
  }

  setupInstagramDmStoryRingGuard();
  setupSpotifyLoginHelper();
  setupYouTubeFullscreenAndPipHelper();
  setupScrollingVideoScrubberBar();
  setupPersistentPageMemory();
  setupGmailComposeHelper();

  let lastHref = window.location.href;
  let lastReportedUrl = '';
  let routeCheckTimers = [];

  function getReportedFrameUrl() {
    if (host.includes('spotify.com') && spotifyViewOverride === 'library') {
      return 'https://open.spotify.com/collection/playlists';
    }
    if (host.includes('tiktok.com')) {
      const activeTtUrl = resolveActiveTikTokVideoUrl();
      if (activeTtUrl) return activeTtUrl;
    }
    return window.location.href;
  }

  function handleRouteOrStateCheck() {
    const currentReported = getReportedFrameUrl();
    if (window.location.href !== lastHref || (currentReported && currentReported !== lastReportedUrl)) {
      const prevPath = (() => {
        try {
          return new URL(lastHref).pathname;
        } catch (_) {
          return '';
        }
      })();
      lastHref = window.location.href;
      lastReportedUrl = currentReported;
      lastRouteOrClickAt = Date.now();
      const curPath = window.location.pathname || '/';

      // If user clicked a playlist/album/artist/search inside Spotify's Library sidebar, automatically reveal the Player/Search main view!
      if (host.includes('spotify.com') && spotifyViewOverride === 'library') {
        if (curPath !== prevPath && !curPath.startsWith('/collection/playlists')) {
          spotifyViewOverride = curPath.startsWith('/search') ? 'search' : 'player';
        }
      }

      // If user navigated on YouTube (e.g., clicked YouTube logo to go to Home '/', or switched between /shorts and /watch), stop stale audio immediately!
      if (host.includes('youtube.com') && !host.includes('music.youtube.com')) {
        const isPlayableYtPath =
          curPath.startsWith('/watch') ||
          curPath.startsWith('/shorts') ||
          curPath.startsWith('/live') ||
          curPath.startsWith('/embed');
        if (!isPlayableYtPath) {
          pauseActiveVideosSoftly();
          try {
            if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmStopYtMirror === 'function') {
              window.wrappedJSObject.__pmStopYtMirror();
            }
          } catch (_) {}
        } else if (prevPath.startsWith('/shorts') && !curPath.startsWith('/shorts')) {
          // Left Shorts for /watch: pause any hidden #shorts-player video
          try {
            document.querySelectorAll('#shorts-player video, ytd-shorts video').forEach((v) => {
              if (!v.paused) v.pause();
            });
          } catch (_) {}
        } else if (prevPath.startsWith('/watch') && curPath.startsWith('/shorts')) {
          // Left /watch for /shorts: pause any hidden #movie_player video
          try {
            document.querySelectorAll('#movie_player video').forEach((v) => {
              if (!v.paused) v.pause();
            });
          } catch (_) {}
        }
      }

      injectOptimizerCss();
      if (typeof checkPersistentRouteRestore === 'function') {
        checkPersistentRouteRestore();
      }
      notifyParent('PM_FRAME_URL_CHANGED', {
        url: currentReported,
        title: document.title || '',
        faviconUrl: detectPageFaviconUrl(),
        ownProfileUrl: getOwnProfileUrlForCurrentHost()
      });
      setTimeout(() => {
        try {
          reportLivePlaybackState();
        } catch (_) {}
      }, 20);
    }
    syncAppSpecificDomState();
    detectUnreadState();
    checkXTransientErrorRecovery();
    checkAndNotifyVisualReady();
  }

  function scheduleStaggeredRouteChecks() {
    routeCheckTimers.forEach((t) => clearTimeout(t));
    routeCheckTimers = [16, 60, 140, 260, 480, 850].map((delay) =>
      setTimeout(() => {
        if (window.location.href !== lastHref || getReportedFrameUrl() !== lastReportedUrl) {
          handleRouteOrStateCheck();
        } else {
          syncAppSpecificDomState();
        }
      }, delay)
    );
  }

  function setupFastSpaRouteObserver() {
    // 1. Modern Navigation API listener if supported
    try {
      if (window.navigation && typeof window.navigation.addEventListener === 'function') {
        window.navigation.addEventListener('navigate', () => {
          setTimeout(handleRouteOrStateCheck, 15);
        });
      }
    } catch (_) {}

    // 2. Standard popstate & hashchange listeners (Never wrap History.prototype.pushState/replaceState with exportFunction in Firefox,
    // because passing a page state object across compartments into StructuredCloneHolder throws DataCloneError in WhatsApp, Messenger, Discord, and X!)
    window.addEventListener('popstate', handleRouteOrStateCheck, { passive: true });
    window.addEventListener('hashchange', handleRouteOrStateCheck, { passive: true });

    // 4. Staggered checks after any user click or wheel scroll (catches async Shorts/Reels/TikTok snap changes)
    window.addEventListener(
      'wheel',
      () => {
        scheduleStaggeredRouteChecks();
      },
      { passive: true }
    );
    document.addEventListener(
      'click',
      (e) => {
        lastRouteOrClickAt = Date.now();
        // If user clicks the Comment icon or video area inside an Instagram post modal (div[role="dialog"] article)
        if (host.includes('instagram.com') && e.target && e.target.closest) {
          const dialogArt = e.target.closest('div[role="dialog"] article');
          if (dialogArt) {
            const btn = e.target.closest('[role="button"], button');
            const hasCommentSvg =
              (e.target.tagName === 'svg' && e.target.getAttribute('aria-label') === 'Comment') ||
              (btn && btn.querySelector && btn.querySelector('svg[aria-label="Comment"]'));
            if (hasCommentSvg) {
              const isOpen = dialogArt.getAttribute('data-pm-comments-open') === 'true';
              if (isOpen) {
                dialogArt.removeAttribute('data-pm-comments-open');
                dialogArt.scrollTo({ top: 0, behavior: 'smooth' });
              } else {
                dialogArt.setAttribute('data-pm-comments-open', 'true');
                setTimeout(() => {
                  try {
                    const commentInput = dialogArt.querySelector('textarea, input[placeholder*="comment" i]');
                    if (commentInput) commentInput.focus({ preventScroll: true });
                  } catch (_) {}
                }, 50);
              }
            } else {
              const mediaBox = e.target.closest('._aatk');
              const isCustomMute = e.target.closest('button[data-pm-ig-modal-mute="1"]');
              const isCarouselOrTagBtn =
                btn &&
                (btn.getAttribute('aria-label') || '').match(/next|back|previous|tag/i);
              if (mediaBox && !isCustomMute && !isCarouselOrTagBtn) {
                const vid = mediaBox.querySelector('video');
                if (vid) {
                  const wasPaused = vid.paused;
                  setTimeout(() => {
                    try {
                      if (vid.paused === wasPaused) {
                        if (wasPaused) {
                          vid.play().catch(() => {});
                        } else {
                          vid.pause();
                        }
                      }
                    } catch (_) {}
                  }, 35);
                }
              }
            }
          } else {
            const inDialog = e.target.closest('div[role="dialog"]');
            if (inDialog) {
              const openArt = inDialog.querySelector('article[data-pm-comments-open="true"]');
              if (openArt) openArt.removeAttribute('data-pm-comments-open');
            }
          }
        }
        // Spotify Queue & Connect Device Panel overlay toggle + Library row selection
        if (host.includes('spotify.com') && e.target && e.target.closest) {
          if (!spPanelSyncClick) {
            const queueBtn = e.target.closest(
              '[data-testid="control-button-queue"], button[aria-label="Queue" i], button[aria-label*="Queue" i]'
            );
            const deviceBtn = !queueBtn
              ? e.target.closest(
                  '#device-picker-icon-button, [data-testid="device-picker-icon-button"], button[aria-label*="Connect to a device" i]'
                )
              : null;
            if (queueBtn || deviceBtn) {
              const trigBtn = queueBtn || deviceBtn;
              const trigType = queueBtn ? 'queue' : 'device';
              if (spotifyPanelOpen && activeSpotifyPanelTrigger === trigType) {
                spotifyPanelOpen = false;
                activeSpotifyPanelTrigger = '';
              } else {
                spotifyPanelOpen = true;
                activeSpotifyPanelTrigger = trigType;
                if (spotifyViewOverride === 'library') {
                  spotifyViewOverride = 'player';
                }
                setTimeout(() => {
                  if (!spotifyPanelOpen || activeSpotifyPanelTrigger !== trigType) return;
                  const panelEl = document.getElementById('Desktop_PanelContainer_Id');
                  const hasPanelContent = Boolean(
                    panelEl && panelEl.children.length > 0 && (panelEl.textContent || '').trim().length > 0
                  );
                  if (!hasPanelContent && trigBtn && trigBtn.isConnected) {
                    spPanelSyncClick = true;
                    try {
                      trigBtn.click();
                    } catch (_) {}
                    setTimeout(() => {
                      spPanelSyncClick = false;
                      syncAppSpecificDomState();
                    }, 60);
                  } else {
                    syncAppSpecificDomState();
                  }
                }, 90);
              }
              syncAppSpecificDomState();
            } else if (spotifyPanelOpen) {
              const inPanel = e.target.closest('#Desktop_PanelContainer_Id');
              if (inPanel) {
                const closeBtn = e.target.closest(
                  'button[aria-label="Close" i], [data-testid="PanelHeader_CloseButton"], button[aria-label*="Hide" i]'
                );
                if (closeBtn) {
                  spotifyPanelOpen = false;
                  activeSpotifyPanelTrigger = '';
                  syncAppSpecificDomState();
                } else {
                  const navAnchor = e.target.closest('a[href^="/album/"], a[href^="/artist/"], a[href^="/playlist/"]');
                  if (navAnchor) {
                    setTimeout(() => {
                      spotifyPanelOpen = false;
                      activeSpotifyPanelTrigger = '';
                      syncAppSpecificDomState();
                    }, 90);
                  }
                }
              }
            }
          }

          if (spotifyViewOverride === 'library') {
            const leftSidebar = e.target.closest('#Desktop_LeftSidebar_Id');
            const clickedRow = leftSidebar
              ? e.target.closest('a[href], [role="row"], [data-encore-id="listRow"]')
              : null;
            if (clickedRow) {
              setTimeout(() => {
                spotifyViewOverride = 'player';
                syncAppSpecificDomState();
                notifyParent('PM_FRAME_URL_CHANGED', {
                  url: window.location.href,
                  title: document.title || ''
                });
              }, 80);
            }
          }
        }
        scheduleStaggeredRouteChecks();
      },
      { passive: true }
    );
  }

  // Event-driven <title> observer for 0ms unread badge & route change detection
  function attachTitleObserver() {
    const titleEl = document.querySelector('head > title');
    if (!titleEl || titleEl.dataset.pmObserved) return;
    titleEl.dataset.pmObserved = '1';
    const titleObs = new MutationObserver(() => {
      if (window.location.href !== lastHref) {
        handleRouteOrStateCheck();
      } else {
        detectUnreadState();
      }
    });
    titleObs.observe(titleEl, { childList: true, characterData: true, subtree: true });
  }

  function pauseActiveVideosSoftly() {
    try {
      document.querySelectorAll('video').forEach((v) => {
        try {
          if (!v.paused) v.pause();
        } catch (_) {}
      });
    } catch (_) {}
  }

  function freeHeavyMediaResources() {
    try {
      const videos = document.querySelectorAll('video');
      videos.forEach((v) => {
        try {
          v.pause();
          v.removeAttribute('src');
          v.load();
        } catch (_) {}
      });
    } catch (_) {}
  }

  function ensureSpecialRoutesReady() {
    const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    const search = window.location.search || '';
    const wantsProfile = path === '/profile' || search.includes('pm_goto_profile=1');

    if (host.includes('tiktok.com')) {
      if (wantsProfile) {
        const ownUrl = resolveTikTokOwnProfileUrl();
        if (ownUrl) {
          window.location.replace(ownUrl);
          return;
        }
        const navProf = findNativeInAppNavElement('/profile', 'profile');
        if (navProf) {
          navProf.click();
        }
        return;
      }
      if (path.startsWith('/messages')) {
        setTimeout(() => {
          if (!window.location.pathname.startsWith('/messages')) return;
          const hasInbox = Boolean(
            document.querySelector('[data-e2e="inbox-list"], div[class*="DivConversationList"], div[class*="DivChatBox"]')
          );
          if (!hasInbox) {
            const msgBtn = findNativeInAppNavElement('/messages', 'messages');
            if (msgBtn) msgBtn.click();
          }
        }, 650);
      }
    } else if (host.includes('instagram.com') && wantsProfile) {
      const tryGoIgProfile = (attempt = 0) => {
        const ownUrl = resolveInstagramOwnProfileUrl();
        const navProf = findNativeInAppNavElement('/profile', 'profile');
        if (navProf) {
          navProf.click();
          return;
        }
        if (ownUrl) {
          window.location.replace(ownUrl);
          return;
        }
        if (attempt < 8) {
          setTimeout(() => tryGoIgProfile(attempt + 1), 220);
        }
      };
      tryGoIgProfile(0);
    } else if ((host.includes('x.com') || host.includes('twitter.com')) && wantsProfile) {
      const tryGoXProfile = (attempt = 0) => {
        const navProf = findNativeInAppNavElement('/profile', 'profile');
        if (navProf) {
          navProf.click();
          return;
        }
        const ownUrl = resolveXOwnProfileUrl();
        if (ownUrl) {
          window.location.replace(ownUrl);
          return;
        }
        if (attempt < 8) {
          setTimeout(() => tryGoXProfile(attempt + 1), 220);
        }
      };
      tryGoXProfile(0);
    }
  }

  setupFastSpaRouteObserver();

  document.addEventListener('DOMContentLoaded', () => {
    injectOptimizerCss();
    attachTitleObserver();
    detectUnreadState();
    ensureSpecialRoutesReady();
    notifyParent('PM_FRAME_DOM_READY', {
      title: document.title || '',
      faviconUrl: detectPageFaviconUrl(),
      ownProfileUrl: getOwnProfileUrlForCurrentHost()
    });
    startVisualPaintWatcher();
  });

  window.addEventListener('load', () => {
    injectOptimizerCss();
    attachTitleObserver();
    detectUnreadState();
    ensureSpecialRoutesReady();
    notifyParent('PM_FRAME_LOADED', {
      title: document.title || '',
      faviconUrl: detectPageFaviconUrl(),
      ownProfileUrl: getOwnProfileUrlForCurrentHost()
    });
    startVisualPaintWatcher();
  });

  // Fast 260ms lightweight URL string check
  setInterval(() => {
    if (window.location.href !== lastHref || (host.includes('tiktok.com') && getReportedFrameUrl() !== lastReportedUrl)) {
      handleRouteOrStateCheck();
    }
  }, 260);

  // Live Playback & Timestamp Reporter + Background Audio Keep-Alive Auto-Resume
  let bgAudioAutoResumed = false;
  let bgAudioMseBridgeStarted = false;
  let activeMseRecorder = null;
  let activeMseMediaEl = null;
  let sidebarAutoResumeRequested = false;
  let sidebarAutoResumeRequestedAt = 0;
  let spAutoClickInFlight = false;
  let isTabAudioAutoPaused = false;
  let spTabPauseVerifyTimer = null;
  let lastSpotifyAutoResumeClickAt = 0;
  let spHydratedAt = 0;
  let spHydratedWithoutLocalMediaSince = 0;
  let lastAutoPlayedWatchKey = '';

  function clickSpotifyToggleOnce(wantPlaying) {
    const spToggle = document.querySelector('[data-testid="control-button-playpause"]');
    if (!spToggle || spToggle.disabled) return false;
    const aria = (spToggle.getAttribute('aria-label') || '').toLowerCase();
    const isPlayingUi = aria.includes('pause') || aria.includes('stop');
    const isPausedUi = aria.includes('play') && !aria.includes('pause');
    if (wantPlaying && !isPausedUi) return false;
    if (!wantPlaying && !isPlayingUi) return false;
    spAutoClickInFlight = true;
    try {
      spToggle.click();
      return true;
    } finally {
      setTimeout(() => {
        spAutoClickInFlight = false;
      }, 240);
    }
  }

  function getActiveMediaElement() {
    if (host.includes('youtube.com') && !host.includes('music.youtube.com')) {
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
    const all = Array.from(document.querySelectorAll('video, audio'));
    const playing = all.find(
      (el) =>
        !el.paused &&
        !el.ended &&
        el.readyState >= 1 &&
        !el.closest('ytd-video-preview, #video-preview, ytd-inline-preview-player, [hidden]')
    );
    if (playing) return playing;
    const mainYt = document.querySelector(
      '#movie_player video.html5-main-video, ytd-player video.html5-main-video, video.html5-main-video'
    );
    if (mainYt) return mainYt;
    const nonPreview = all.find(
      (el) => !el.closest('ytd-video-preview, #video-preview, ytd-miniplayer, [hidden]')
    );
    return nonPreview || all[0] || null;
  }

  function stopLocalMseAudioBridge() {
    if (!bgAudioMseBridgeStarted) return;
    bgAudioMseBridgeStarted = false;
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

  function isAudioMirrorActive() {
    try {
      return Boolean(isMirrorAudioHost && window.wrappedJSObject && window.wrappedJSObject.__pmSpBridgeEnabled);
    } catch (_) {
      return false;
    }
  }

  function ensureMirroredPlayback() {
    try {
      if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureMirrorPlay === 'function') {
        return Boolean(window.wrappedJSObject.__pmEnsureMirrorPlay());
      }
    } catch (_) {}
    return false;
  }

  function startLocalMseAudioBridge(mediaEl) {
    // Spotify & YouTube already stream their audio to background.html via the MSE mirror; never double it with the recorder bridge
    if (isAudioMirrorActive()) return;
    if (bgAudioMseBridgeStarted || !mediaEl) return;
    bgAudioMseBridgeStarted = true;
    activeMseMediaEl = mediaEl;
    (async () => {
      try {
        mediaEl.muted = false;
        mediaEl.volume = 0;
        // Lock page-world .volume and .muted setters on this element so YouTube Polymer hydrating yt-player-volume (v.volume = 1) never triggers Firefox's C++ Autoplay Pause!
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
        await mediaEl.play();
        const stream = mediaEl.mozCaptureStream
          ? mediaEl.mozCaptureStream()
          : mediaEl.captureStream
          ? mediaEl.captureStream()
          : null;
        if (stream && stream.getAudioTracks().length > 0) {
          const audioOnlyStream = new MediaStream(stream.getAudioTracks());
          const rec = new MediaRecorder(audioOnlyStream, { mimeType: 'audio/webm;codecs=opus' });
          activeMseRecorder = rec;
          rec.ondataavailable = async (ev) => {
            if (!bgAudioMseBridgeStarted) return;
            if (ev.data && ev.data.size > 0) {
              try {
                const buf = await ev.data.arrayBuffer();
                realTopWin.postMessage(
                  {
                    source: 'pocketmail-media-frame',
                    type: 'PM_BG_AUDIO_CHUNK',
                    flatFrameName: cleanWindowName,
                    chunk: buf
                  },
                  '*',
                  [buf]
                );
              } catch (_) {}
            }
          };
          rec.start(140);
          bgAudioAutoResumed = true;
        } else {
          bgAudioMseBridgeStarted = false;
        }
      } catch (_) {
        bgAudioMseBridgeStarted = false;
      }
    })();
  }

  function reportLivePlaybackState() {
    try {
      let isPlaying = false;
      let currentTime = 0;
      let resumeUrl = window.location.href;
      let spMediaPlaying = false;

      const mediaEl = host.includes('spotify.com') ? null : getActiveMediaElement();
      if (mediaEl) {
        currentTime = Math.floor(mediaEl.currentTime || 0);
        if (!mediaEl.paused && !mediaEl.ended) {
          isPlaying = true;
        } else if (!isTabAudioAutoPaused && bgAudioMseBridgeStarted && mediaEl.paused && !mediaEl.ended && mediaEl.readyState >= 2) {
          // Keep background bridge video playing if the page's UI framework transiently paused it during hydration
          mediaEl.play().catch(() => {});
          isPlaying = true;
        }
      }

      if (host.includes('spotify.com')) {
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__getSpDiag === 'function') {
            const rawDiag = window.wrappedJSObject.__getSpDiag();
            if (rawDiag) {
              const diag = JSON.parse(rawDiag);
              if (diag && !diag.paused && !diag.ended && diag.rs >= 1) {
                spMediaPlaying = true;
                isPlaying = true;
                if (diag.ct > 0) currentTime = Math.floor(diag.ct);
              }
            }
          }
        } catch (_) {}

        const spPlayBtn = document.querySelector('[data-testid="control-button-playpause"]');
        const posEl = document.querySelector('[data-testid="playback-position"]');
        const posText = posEl ? (posEl.textContent || '').trim() : '';
        const isSpPlayerHydrated = Boolean(spPlayBtn && !spPlayBtn.disabled && posText && posText !== '-:--');
        if (spMediaPlaying) {
          spHydratedWithoutLocalMediaSince = 0;
        } else if (isSpPlayerHydrated) {
          if (!spHydratedWithoutLocalMediaSince) {
            spHydratedWithoutLocalMediaSince = Date.now();
          }
        } else {
          spHydratedWithoutLocalMediaSince = 0;
        }
        if (isSpPlayerHydrated) {
          const aria = (spPlayBtn.getAttribute('aria-label') || '').toLowerCase();
          if (aria.includes('pause')) {
            isPlaying = true;
          }
          if (currentTime === 0 && posText.includes(':')) {
            const parts = posText.split(':').map((n) => parseInt(n, 10));
            if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
              currentTime = parts[0] * 60 + parts[1];
            }
          }
        }
      } else if (host.includes('youtube.com')) {
        const cinematicsEl = document.getElementById('cinematics');
        if (cinematicsEl && cinematicsEl.firstChild) {
          cinematicsEl.textContent = '';
        }
        const curYtPath = window.location.pathname || '/';
        const isPlayableYt =
          host.includes('music.youtube.com') ||
          curYtPath.startsWith('/watch') ||
          curYtPath.startsWith('/shorts') ||
          curYtPath.startsWith('/live') ||
          curYtPath.startsWith('/embed');
        if (!isPlayableYt) {
          isPlaying = false;
          currentTime = 0;
          resumeUrl = window.location.href;
        } else if (curYtPath.startsWith('/watch')) {
          try {
            const u = new URL(window.location.href);
            if ((u.searchParams.get('list') || '').startsWith('RD')) {
              u.searchParams.delete('index');
            }
            if (currentTime >= 1) {
              u.searchParams.set('t', `${currentTime}s`);
            }
            resumeUrl = u.href;
          } catch (_) {}
        }
      } else if (host.includes('tiktok.com')) {
        const activeTtUrl = resolveActiveTikTokVideoUrl();
        if (activeTtUrl) {
          resumeUrl = activeTtUrl;
        }
        // Only check for off-screen videos right after a feed scroll (never force layout reflows during steady video playback)
        if (Date.now() - lastTikTokFeedScrollAt < 2200) {
          try {
            const vh = window.innerHeight || 600;
            const vids = document.querySelectorAll('video');
            for (let i = 0; i < vids.length; i++) {
              const v = vids[i];
              if (!v.paused && v !== mediaEl) {
                const r = v.getBoundingClientRect();
                if (r.bottom < -vh * 0.35 || r.top > vh * 1.35) {
                  v.pause();
                }
              }
            }
          } catch (_) {}
        }
      }

      const curAutoplayPolicy =
        typeof navigator.getAutoplayPolicy === 'function' ? navigator.getAutoplayPolicy('mediaelement') : 'allowed';

      if (isStandbyBgFrame) {
        return;
      }

      notifyParent('PM_FRAME_PLAYBACK_STATE', {
        isPlaying,
        currentTime,
        resumeUrl,
        title: document.title || '',
        initialAutoplayPolicy,
        autoplayBlocked: false
      });

      // 1. If running inside Background Audio Keep-Alive Engine (when sidebar is closed), auto-resume playback ONCE when ready (never fight a later user pause or tab auto-pause!)
      if (!bgAudioAutoResumed && isBgAudioFrame && !isTabAudioAutoPaused) {
        if (host.includes('spotify.com')) {
          if (spMediaPlaying) {
            bgAudioAutoResumed = true;
          } else {
            // Wait until Spotify's bottom Now Playing bar is hydrated (not disabled and position !== '-:--')
            const spToggle = document.querySelector('[data-testid="control-button-playpause"]');
            const posEl = document.querySelector('[data-testid="playback-position"]');
            const posText = posEl ? (posEl.textContent || '').trim() : '';
            if (spToggle && !spToggle.disabled && posText && posText !== '-:--') {
              const aria = (spToggle.getAttribute('aria-label') || '').toLowerCase();
              if (!aria.includes('pause') && Date.now() - lastSpotifyAutoResumeClickAt > 2500) {
                lastSpotifyAutoResumeClickAt = Date.now();
                clickSpotifyToggleOnce(true);
              } else if (
                aria.includes('pause') &&
                spHydratedWithoutLocalMediaSince > 0 &&
                Date.now() - spHydratedWithoutLocalMediaSince > 1400 &&
                Date.now() - lastSpotifyAutoResumeClickAt > 2600
              ) {
                lastSpotifyAutoResumeClickAt = Date.now();
                try {
                  if (
                    window.wrappedJSObject &&
                    typeof window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover === 'function'
                  ) {
                    window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover(true);
                  }
                } catch (_) {}
              }
            }
          }
        } else if (isAudioMirrorActive()) {
          // YouTube in the hidden bg frame: the element is silent (audio comes from background.html), so play() is autoplay-allowed
          if (mediaEl && !mediaEl.paused && !mediaEl.ended) {
            bgAudioAutoResumed = true;
          } else {
            ensureMirroredPlayback();
          }
        } else if (mediaEl && mediaEl.readyState >= 2) {
          if (curAutoplayPolicy === 'allowed') {
            if (!mediaEl.paused && !mediaEl.muted && mediaEl.volume > 0) {
              bgAudioAutoResumed = true;
            } else {
              mediaEl.muted = false;
              mediaEl.volume = 1.0;
              mediaEl
                .play()
                .then(() => {
                  bgAudioAutoResumed = true;
                })
                .catch(() => {
                  startLocalMseAudioBridge(mediaEl);
                });
            }
          } else {
            // Standard Firefox (media.autoplay.default = 1): use zero-socket in-memory MediaRecorder -> MediaSource bridge!
            startLocalMseAudioBridge(mediaEl);
          }
        }
      }

      // 2. If the user reopened the Sidebar while Background Audio was playing (or opened a YouTube /watch video before clicking inside iframe), seamlessly play audio!
      if (!isBgAudioFrame && !isStandbyBgFrame && !isTabAudioAutoPaused) {
        if (sidebarAutoResumeRequested && host.includes('spotify.com')) {
          // Reopened sidebar took over from the hidden bg player: resume here once hydrated (buffered audio in background.html bridges the gap)
          const spToggle = document.querySelector('[data-testid="control-button-playpause"]');
          const posEl = document.querySelector('[data-testid="playback-position"]');
          const posText = posEl ? (posEl.textContent || '').trim() : '';
          if (spMediaPlaying || Date.now() - sidebarAutoResumeRequestedAt > 30000) {
            sidebarAutoResumeRequested = false;
          } else if (spToggle && !spToggle.disabled && posText && posText !== '-:--') {
            const aria = (spToggle.getAttribute('aria-label') || '').toLowerCase();
            if (!aria.includes('pause') && Date.now() - lastSpotifyAutoResumeClickAt > 2500) {
              lastSpotifyAutoResumeClickAt = Date.now();
              spAutoClickInFlight = true;
              try {
                spToggle.click();
              } finally {
                spAutoClickInFlight = false;
              }
            } else if (
              aria.includes('pause') &&
              spHydratedWithoutLocalMediaSince > 0 &&
              Date.now() - spHydratedWithoutLocalMediaSince > 1400 &&
              Date.now() - lastSpotifyAutoResumeClickAt > 2600
            ) {
              lastSpotifyAutoResumeClickAt = Date.now();
              try {
                if (
                  window.wrappedJSObject &&
                  typeof window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover === 'function'
                ) {
                  window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover(true);
                }
              } catch (_) {}
            }
          }
        } else if (sidebarAutoResumeRequested && isAudioMirrorActive()) {
          // Reopened sidebar took over YouTube from the hidden bg player: keep the silent page element playing (background.html is audible)
          if ((mediaEl && !mediaEl.paused && !mediaEl.ended) || Date.now() - sidebarAutoResumeRequestedAt > 30000) {
            sidebarAutoResumeRequested = false;
          } else {
            ensureMirroredPlayback();
          }
        } else if (sidebarAutoResumeRequested && mediaEl && mediaEl.readyState >= 2) {
          if (curAutoplayPolicy === 'allowed') {
            mediaEl.muted = false;
            mediaEl.volume = 1.0;
            mediaEl
              .play()
              .then(() => {
                sidebarAutoResumeRequested = false;
                notifyParent('PM_SIDEBAR_TOOK_OVER_AUDIO', {});
              })
              .catch(() => {
                sidebarAutoResumeRequested = false;
                startLocalMseAudioBridge(mediaEl);
              });
          } else {
            // Reopened sidebar without user click inside iframe yet: play video & stream audio via zero-socket MSE bridge immediately!
            sidebarAutoResumeRequested = false;
            startLocalMseAudioBridge(mediaEl);
          }
        } else if (
          host.includes('youtube.com') &&
          window.location.pathname.startsWith('/watch') &&
          mediaEl &&
          mediaEl.readyState >= 2 &&
          mediaEl.paused &&
          !mediaEl.ended &&
          Date.now() - lastUserGestureAt > 2000
        ) {
          const watchKey = (() => {
            try {
              return new URL(window.location.href).searchParams.get('v') || window.location.pathname;
            } catch (_) {
              return window.location.pathname;
            }
          })();
          if (lastAutoPlayedWatchKey !== watchKey) {
            lastAutoPlayedWatchKey = watchKey;
            if (isAudioMirrorActive()) {
              ensureMirroredPlayback();
            } else if (curAutoplayPolicy !== 'allowed' && !bgAudioMseBridgeStarted) {
              startLocalMseAudioBridge(mediaEl);
            }
          }
        }
      }
    } catch (_) {}
  }

  window.__pmReportLivePlaybackState = reportLivePlaybackState;

  // If user clicks anywhere inside the reopened sidebar while MSE bridge or auto-resume is active, switch to native unmuted audio with trusted gesture!
  if (!isBgAudioFrame && !isStandbyBgFrame) {
    let lastSpPlayBtnEl = null;
    let lastSpPlayBtnClickAt = 0;

    const handleUserMediaGesture = (e) => {
      if (host.includes('spotify.com')) {
        if (spAutoClickInFlight) return;
        sidebarAutoResumeRequested = false;
        if (e && e.target && e.target.closest) {
          const playOrPauseBtn = e.target.closest(
            '[data-testid="control-button-playpause"], [data-testid="play-button"]'
          );
          if (playOrPauseBtn) {
            const aria = (playOrPauseBtn.getAttribute('aria-label') || '').toLowerCase();
            const isBottomToggle = playOrPauseBtn.getAttribute('data-testid') === 'control-button-playpause';
            const now = Date.now();

            if (e.type === 'pointerdown' || e.type === 'mousedown') {
              if (!aria.includes('pause') && !(lastSpPlayBtnEl === playOrPauseBtn && now - lastSpPlayBtnClickAt < 1300)) {
                isTabAudioAutoPaused = false;
                window.__pmWasAutoPausedByTabAudio = false;
                clearTimeout(spTabPauseVerifyTimer);
                try {
                  if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmClearTabAutoPaused === 'function') {
                    window.wrappedJSObject.__pmClearTabAutoPaused();
                  }
                } catch (_) {}
                try {
                  realTopWin.postMessage(
                    {
                      source: 'pocketmail-media-frame',
                      type: 'PM_SP_EME_BRIDGE',
                      flatFrameName: cleanWindowName,
                      bridgeType: 'USER_PLAY_INTENT'
                    },
                    '*'
                  );
                } catch (_) {}
              }
              return;
            }

            if (e.type === 'click') {
              // Guard against accidental double/triple clicks on the SAME Play button while Widevine EME is still warming up (even if Spotify optimistically flipped aria-label to Pause within 50ms!)
              if (lastSpPlayBtnEl === playOrPauseBtn && now - lastSpPlayBtnClickAt < 1300) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return;
              }
              if (!aria.includes('pause')) {
                lastSpPlayBtnEl = playOrPauseBtn;
                lastSpPlayBtnClickAt = now;
                isTabAudioAutoPaused = false;
                window.__pmWasAutoPausedByTabAudio = false;
                clearTimeout(spTabPauseVerifyTimer);
                try {
                  if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmClearTabAutoPaused === 'function') {
                    window.wrappedJSObject.__pmClearTabAutoPaused();
                  }
                } catch (_) {}

                // Instant tactile visual confirmation so user knows the Play click registered at 0ms
                try {
                  const prevTransition = playOrPauseBtn.style.transition;
                  const prevTransform = playOrPauseBtn.style.transform;
                  const prevShadow = playOrPauseBtn.style.boxShadow;
                  playOrPauseBtn.style.transition = 'transform 0.14s ease, box-shadow 0.18s ease';
                  playOrPauseBtn.style.transform = 'scale(0.93)';
                  playOrPauseBtn.style.boxShadow = '0 0 0 3px rgba(30, 215, 96, 0.65)';
                  setTimeout(() => {
                    try {
                      playOrPauseBtn.style.transform = prevTransform;
                      playOrPauseBtn.style.boxShadow = prevShadow;
                      playOrPauseBtn.style.transition = prevTransition;
                    } catch (_) {}
                  }, 240);
                } catch (_) {}

                try {
                  realTopWin.postMessage(
                    {
                      source: 'pocketmail-media-frame',
                      type: 'PM_SP_EME_BRIDGE',
                      flatFrameName: cleanWindowName,
                      bridgeType: 'USER_PLAY_INTENT'
                    },
                    '*'
                  );
                } catch (_) {}
              } else {
                lastSpPlayBtnEl = null;
                lastSpPlayBtnClickAt = 0;
                notifyParent('PM_SP_SIDEBAR_PLAYPAUSE_CLICK', { aria });
              }
            }
          }
        }
        return;
      }
      const curPol =
        typeof navigator.getAutoplayPolicy === 'function' ? navigator.getAutoplayPolicy('mediaelement') : 'allowed';
      const canPlayNatively = curPol === 'allowed';
      if (isAudioMirrorActive()) {
        // YouTube audio comes from background.html; never "take over" natively (that used to kill the mirror and leave the video muted)
        sidebarAutoResumeRequested = false;
        return;
      }
      if (!sidebarAutoResumeRequested && !bgAudioMseBridgeStarted) return;
      const wasMseBridge = bgAudioMseBridgeStarted;
      const wasAutoResume = sidebarAutoResumeRequested;
      sidebarAutoResumeRequested = false;
      if (canPlayNatively) {
        stopLocalMseAudioBridge();
        notifyParent('PM_SIDEBAR_TOOK_OVER_AUDIO', {});
      }
      try {
        if ((wasMseBridge || wasAutoResume) && canPlayNatively) {
          const mediaEl = getActiveMediaElement();
          if (mediaEl) {
            mediaEl.muted = false;
            mediaEl.volume = 1.0;
            if (mediaEl.paused) mediaEl.play().catch(() => {});
          }
        }
      } catch (_) {}
    };
    window.addEventListener('pointerdown', handleUserMediaGesture, { passive: true, capture: true });
    window.addEventListener('mousedown', handleUserMediaGesture, { passive: true, capture: true });
    window.addEventListener('click', handleUserMediaGesture, { capture: true });
  }

  if (isBgAudioFrame) {
    const bootStart = Date.now();
    const fastBgBootTimer = setInterval(() => {
      if (bgAudioAutoResumed || Date.now() - bootStart > 18000) {
        clearInterval(fastBgBootTimer);
        return;
      }
      reportLivePlaybackState();
    }, 80);
  }
  setInterval(reportLivePlaybackState, isBgAudioFrame ? 900 : 1200);

  // Low-frequency fallback DOM state check — skips heavy DOM inspection whenever media (<video>/<audio>) is playing
  setInterval(() => {
    try {
      const mediaEl = getActiveMediaElement();
      if (mediaEl && !mediaEl.paused && !mediaEl.ended) {
        return;
      }
    } catch (_) {}
    handleRouteOrStateCheck();
  }, 3000);

  function resolveTikTokOwnProfileUrl() {
    try {
      // 1. Parse TikTok's rehydration JSON for the logged-in user's uniqueId (100% guaranteed to be the logged-in user, never a "Following" account!)
      const rehydEl = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (rehydEl && rehydEl.textContent) {
        const parsed = JSON.parse(rehydEl.textContent);
        const appCtx = parsed && parsed.__DEFAULT_SCOPE__ && parsed.__DEFAULT_SCOPE__['webapp.app-context'];
        const uniqueId = appCtx && appCtx.user && appCtx.user.uniqueId;
        if (uniqueId && typeof uniqueId === 'string') {
          const fullUrl = `https://www.tiktok.com/@${uniqueId}`;
          try {
            localStorage.setItem('pm_tiktok_own_profile_v2', fullUrl);
          } catch (_) {}
          return fullUrl;
        }
      }
      // 2. Check #SIGI_STATE if present (used on webapp-messages)
      const sigiEl = document.getElementById('SIGI_STATE');
      if (sigiEl && sigiEl.textContent) {
        const parsed = JSON.parse(sigiEl.textContent);
        const uniqueId =
          parsed &&
          parsed.AppContext &&
          parsed.AppContext.appContext &&
          parsed.AppContext.appContext.user &&
          parsed.AppContext.appContext.user.uniqueId;
        if (uniqueId && typeof uniqueId === 'string') {
          const fullUrl = `https://www.tiktok.com/@${uniqueId}`;
          try {
            localStorage.setItem('pm_tiktok_own_profile_v2', fullUrl);
          } catch (_) {}
          return fullUrl;
        }
      }
      // 3. Check STRICTLY [data-e2e="nav-profile"] (NEVER match [data-e2e="nav-side"] a[href^="/@"] which matches "Following accounts"!)
      const profE2e = document.querySelector('[data-e2e="nav-profile"]');
      const navProf =
        profE2e &&
        (profE2e.tagName === 'A'
          ? profE2e
          : profE2e.closest('a[href]') || profE2e.querySelector('a[href]'));
      if (navProf) {
        const href = navProf.getAttribute('href') || navProf.href || '';
        if (href && href.includes('/@')) {
          const fullUrl = new URL(href, window.location.origin).href;
          try {
            localStorage.setItem('pm_tiktok_own_profile_v2', fullUrl);
          } catch (_) {}
          return fullUrl;
        }
      }
      // 4. Fallback to cached own profile URL in TikTok's localStorage
      const cached = localStorage.getItem('pm_tiktok_own_profile_v2');
      if (cached && cached.includes('tiktok.com/@')) {
        return cached;
      }
    } catch (_) {}
    return '';
  }

  function resolveInstagramOwnProfileUrl() {
    try {
      const profLinks = Array.from(
        document.querySelectorAll('nav a[role="link"]:has(img), div[role="navigation"] a:has(img), nav a:has(img)')
      );
      for (const a of profLinks) {
        const href = (a.getAttribute('href') || '').trim();
        if (!href || !href.startsWith('/')) continue;
        const segs = href.split('/').filter(Boolean);
        if (
          segs.length === 1 &&
          !['explore', 'reels', 'direct', 'accounts', 'stories', 'p', 'reel', 'profile'].includes(segs[0].toLowerCase())
        ) {
          const fullUrl = `https://www.instagram.com/${segs[0]}/`;
          try {
            localStorage.setItem('pm_ig_own_profile', fullUrl);
          } catch (_) {}
          return fullUrl;
        }
      }
      const cached = localStorage.getItem('pm_ig_own_profile');
      if (cached && cached.includes('instagram.com/')) {
        return cached;
      }
    } catch (_) {}
    return '';
  }

  function resolveXOwnProfileUrl() {
    try {
      const profLink = document.querySelector(
        '[data-testid="AppTabBar_Profile_Link"], header[role="banner"] nav a[aria-label="Profile" i]'
      );
      if (profLink) {
        const href = (profLink.getAttribute('href') || '').trim();
        if (href && href.startsWith('/')) {
          const segs = href.split('/').filter(Boolean);
          if (
            segs.length === 1 &&
            !['home', 'explore', 'notifications', 'messages', 'i', 'settings', 'search', 'profile', 'compose'].includes(
              segs[0].toLowerCase()
            )
          ) {
            const fullUrl = `https://x.com/${segs[0]}`;
            try {
              localStorage.setItem('pm_x_own_profile', fullUrl);
            } catch (_) {}
            return fullUrl;
          }
        }
      }
      const cached = localStorage.getItem('pm_x_own_profile');
      if (cached && (cached.includes('x.com/') || cached.includes('twitter.com/'))) {
        return cached;
      }
    } catch (_) {}
    return '';
  }

  function resolveClickableRouterNode(el) {
    if (!el) return null;
    if (el.tagName === 'A' && el.hasAttribute('href')) return el;
    const parentAnchor = el.closest ? el.closest('a[href]') : null;
    if (parentAnchor) return parentAnchor;
    const childAnchor = el.querySelector ? el.querySelector('a[href]') : null;
    if (childAnchor) return childAnchor;
    if (el.tagName === 'BUTTON' || el.getAttribute?.('role') === 'button' || el.getAttribute?.('role') === 'tab') {
      return el;
    }
    const parentBtn = el.closest ? el.closest('button, [role="button"], [role="link"], [role="tab"]') : null;
    if (parentBtn) return parentBtn;
    const childBtn = el.querySelector ? el.querySelector('button, [role="button"], [role="link"], [role="tab"]') : null;
    return childBtn || el;
  }

  function isRouteMatchForApp(curPath, destPath, iconType = '') {
    const c = (curPath || '/').replace(/\/+$/, '') || '/';
    const d = (destPath || '/').replace(/\/+$/, '') || '/';
    if (c === d) return true;

    if (host.includes('tiktok.com')) {
      if ((d === '/' || d === '/foryou') && (c === '/' || c === '/foryou')) return true;
      if ((iconType === 'profile' || d === '/profile' || d.startsWith('/@')) && c.startsWith('/@')) return true;
      if (d.startsWith('/explore') && c.startsWith('/explore')) return true;
      if (d.startsWith('/following') && c.startsWith('/following')) return true;
      if (d.startsWith('/messages') && c.startsWith('/messages')) return true;
    }

    if (host.includes('instagram.com')) {
      if (d.startsWith('/direct') && c.startsWith('/direct')) return true;
      if (d.startsWith('/reels') && (c.startsWith('/reels') || c.startsWith('/reel/'))) return true;
      if (d.startsWith('/explore') && c.startsWith('/explore')) return true;
      if (iconType === 'profile' || d === '/profile' || d.includes('/accounts')) {
        const isNonProfile =
          c === '/' ||
          c.startsWith('/direct') ||
          c.startsWith('/reels') ||
          c.startsWith('/reel/') ||
          c.startsWith('/explore') ||
          c.startsWith('/stories') ||
          c.startsWith('/accounts');
        if (!isNonProfile) return true;
      }
    }

    if (host.includes('x.com') || host.includes('twitter.com')) {
      if ((d === '/' || d === '/home') && (c === '/' || c === '/home')) return true;
      if (d.startsWith('/explore') && (c.startsWith('/explore') || c.startsWith('/search'))) return true;
      if (d.startsWith('/notifications') && c.startsWith('/notifications')) return true;
      if ((d.startsWith('/messages') || d.startsWith('/i/chat')) && (c.startsWith('/messages') || c.startsWith('/i/chat'))) {
        return true;
      }
      if (iconType === 'profile' || d === '/profile' || d.startsWith('/settings/profile')) {
        const isSystem =
          c === '/' ||
          c === '/home' ||
          c.startsWith('/explore') ||
          c.startsWith('/search') ||
          c.startsWith('/notifications') ||
          c.startsWith('/messages') ||
          c.startsWith('/i/') ||
          c.startsWith('/settings');
        if (!isSystem && c.split('/').filter(Boolean).length >= 1) return true;
      }
    }

    if (host.includes('youtube.com')) {
      if (d.startsWith('/shorts') && c.startsWith('/shorts')) return true;
      if (d.startsWith('/feed/subscriptions') && c.startsWith('/feed/subscriptions')) return true;
      if ((d.startsWith('/feed/you') || d.startsWith('/feed/library')) && (c.startsWith('/feed/you') || c.startsWith('/feed/library'))) {
        return true;
      }
    }

    if (host.includes('messenger.com')) {
      if (d.startsWith('/requests') && c.startsWith('/requests')) return true;
      if (d.startsWith('/archived') && c.startsWith('/archived')) return true;
      if (d === '/' && (c === '/' || c.startsWith('/t/') || c.startsWith('/e2ee/t/'))) return true;
    }

    if (host.includes('discord.com')) {
      if (d.startsWith('/channels/@me') && c.startsWith('/channels/@me')) return true;
      if (d.startsWith('/store') && (c.startsWith('/store') || c.startsWith('/shop'))) return true;
    }

    if (host.includes('reddit.com')) {
      if (d.startsWith('/r/popular') && c.startsWith('/r/popular')) return true;
    }

    if (host.includes('twitch.tv')) {
      if (d.startsWith('/directory/following') && c.startsWith('/directory/following')) return true;
      if (d === '/directory' && c === '/directory') return true;
    }

    if (host.includes('gemini.google.com')) {
      if ((d === '/app' || d === '/') && (c === '/app' || c.startsWith('/app/'))) return true;
      if (d.startsWith('/gems') && c.startsWith('/gems')) return true;
    }

    if (host.includes('chatgpt.com')) {
      if (d === '/' && c === '/') return true;
      if (d.startsWith('/gpts') && c.startsWith('/gpts')) return true;
    }

    return false;
  }

  function findNativeInAppNavElement(destPath, iconType = '', label = '') {
    const cleanTarget = (destPath || '/').replace(/\/+$/, '') || '/';
    try {
      // 1. Instagram
      if (host.includes('instagram.com')) {
        if (iconType === 'profile' || cleanTarget === '/profile' || cleanTarget.includes('/accounts')) {
          const profLink = document.querySelector(
            'nav a[role="link"]:has(img), div[role="navigation"] a:has(img), nav a:has(img)'
          );
          if (profLink) return resolveClickableRouterNode(profLink);
        }
        if (cleanTarget === '/') {
          return resolveClickableRouterNode(
            document.querySelector('nav a[href="/"], div[role="navigation"] a[href="/"], a[href="/"]')
          );
        }
        if (cleanTarget.startsWith('/direct')) {
          return resolveClickableRouterNode(
            document.querySelector(
              'a[href="/direct/inbox/"], a[href="/direct/inbox"], nav a[href*="/direct"], div[role="navigation"] a[href*="/direct"]'
            )
          );
        }
        if (cleanTarget.startsWith('/reels')) {
          return resolveClickableRouterNode(
            document.querySelector(
              'a[href="/reels/"], a[href="/reels"], nav a[href*="/reels"], div[role="navigation"] a[href*="/reels"]'
            )
          );
        }
        if (cleanTarget.startsWith('/explore')) {
          return resolveClickableRouterNode(
            document.querySelector(
              'a[href="/explore/"], a[href="/explore"], nav a[href*="/explore"], div[role="navigation"] a[href*="/explore"]'
            )
          );
        }
      }
      // 2. TikTok
      else if (host.includes('tiktok.com')) {
        if (cleanTarget === '/' || cleanTarget === '/foryou' || iconType === 'home') {
          const el = document.querySelector(
            '[data-e2e="nav-foryou"], a[href="/foryou"], [data-e2e="nav-side"] a[href="/"]'
          );
          return resolveClickableRouterNode(el);
        }
        if (cleanTarget.startsWith('/explore') || iconType === 'explore') {
          const el = document.querySelector('[data-e2e="nav-explore"], a[href="/explore"], a[href^="/explore?"]');
          return resolveClickableRouterNode(el);
        }
        if (cleanTarget.startsWith('/following') || iconType === 'users') {
          const el = document.querySelector('[data-e2e="nav-following"], a[href="/following"], a[href^="/following?"]');
          return resolveClickableRouterNode(el);
        }
        if (cleanTarget.startsWith('/messages') || iconType === 'messages') {
          const el = document.querySelector(
            'a[href="/messages"], a[href^="/messages?"], [data-e2e="nav-messages"]'
          );
          return resolveClickableRouterNode(el);
        }
        if (iconType === 'profile' || cleanTarget.startsWith('/@') || cleanTarget.startsWith('/profile')) {
          const el = document.querySelector('[data-e2e="nav-profile"]');
          return resolveClickableRouterNode(el);
        }
      }
      // 3. Spotify
      else if (host.includes('spotify.com')) {
        if (cleanTarget === '/') {
          return resolveClickableRouterNode(
            document.querySelector(
              'button[data-testid="home-button"], a[data-testid="home-button"], a[aria-label="Home" i], button[aria-label="Home" i], a[href="/"]'
            )
          );
        }
        if (cleanTarget.startsWith('/search')) {
          return resolveClickableRouterNode(
            document.querySelector(
              'a[href="/search"], button[data-testid="browse-button"], button[aria-label="Browse" i], button[aria-label="Search" i], [data-testid="search-input"]'
            )
          );
        }
        if (cleanTarget.startsWith('/collection')) {
          return resolveClickableRouterNode(document.querySelector('a[href*="/collection"]'));
        }
      }
      // 4. X (Twitter)
      else if (host.includes('x.com') || host.includes('twitter.com')) {
        if (cleanTarget === '/' || cleanTarget === '/home') {
          return resolveClickableRouterNode(
            document.querySelector('[data-testid="AppTabBar_Home_Link"], a[href="/home"]')
          );
        }
        if (cleanTarget.startsWith('/explore')) {
          return resolveClickableRouterNode(
            document.querySelector('[data-testid="AppTabBar_Explore_Link"], a[href="/explore"]')
          );
        }
        if (cleanTarget.startsWith('/notifications')) {
          return resolveClickableRouterNode(
            document.querySelector('[data-testid="AppTabBar_Notifications_Link"], a[href="/notifications"]')
          );
        }
        if (cleanTarget.startsWith('/messages') || cleanTarget.startsWith('/i/chat')) {
          return resolveClickableRouterNode(
            document.querySelector(
              '[data-testid="AppTabBar_DirectMessage_Link"], a[href="/i/chat"], a[href="/messages"]'
            )
          );
        }
        if (iconType === 'profile' || cleanTarget === '/profile' || cleanTarget.startsWith('/settings/profile')) {
          return resolveClickableRouterNode(
            document.querySelector('[data-testid="AppTabBar_Profile_Link"], header[role="banner"] nav a[aria-label="Profile" i]')
          );
        }
      }
      // 5. YouTube
      else if (host.includes('youtube.com')) {
        if (cleanTarget === '/') {
          return resolveClickableRouterNode(
            document.querySelector(
              'ytd-mini-guide-entry-renderer a[href="/"], ytd-guide-entry-renderer a[href="/"], ytd-mini-guide-entry-renderer a[title="Home" i], a#logo'
            )
          );
        }
        if (cleanTarget.startsWith('/shorts')) {
          return resolveClickableRouterNode(
            document.querySelector(
              'ytd-mini-guide-entry-renderer a[title="Shorts" i], ytd-guide-entry-renderer a[title="Shorts" i], ytd-mini-guide-entry-renderer[aria-label="Shorts" i] a#endpoint, a[title="Shorts" i]'
            )
          );
        }
        if (cleanTarget.startsWith('/feed/subscriptions')) {
          return resolveClickableRouterNode(
            document.querySelector(
              'ytd-mini-guide-entry-renderer a[href="/feed/subscriptions"], ytd-guide-entry-renderer a[href="/feed/subscriptions"], a[title="Subscriptions" i], a[href="/feed/subscriptions"]'
            )
          );
        }
        if (cleanTarget.startsWith('/feed/you') || cleanTarget.startsWith('/feed/library')) {
          return resolveClickableRouterNode(
            document.querySelector(
              'ytd-mini-guide-entry-renderer a[href="/feed/you"], ytd-guide-entry-renderer a[href="/feed/you"], a[href="/feed/you"], a[href="/feed/library"], a[title="You" i]'
            )
          );
        }
      }
      // 6. Reddit
      else if (host.includes('reddit.com')) {
        if (cleanTarget === '/') {
          return resolveClickableRouterNode(
            document.querySelector(
              'left-nav-top-section a[href="/"], left-nav-top-section a[href^="/?feed=home"], a#reddit-logo, a[href="/?feed=home"], a[href="/"]'
            )
          );
        }
        if (cleanTarget.startsWith('/r/popular')) {
          return resolveClickableRouterNode(
            document.querySelector('left-nav-top-section a[href*="/r/popular"], a[href="/r/popular/"], a[href="/r/popular"]')
          );
        }
      }
      // 7. Discord
      else if (host.includes('discord.com')) {
        if (cleanTarget.startsWith('/store')) {
          return resolveClickableRouterNode(
            document.querySelector('a[href="/store"], a[href="/shop"], [aria-label="Nitro" i]')
          );
        }
        if (cleanTarget.startsWith('/channels/@me')) {
          if (iconType === 'users' || label.toLowerCase() === 'friends') {
            return resolveClickableRouterNode(
              document.querySelector('a[href="/channels/@me"], [aria-label="Friends" i], [data-list-item-id="guildsnav___home"]')
            );
          }
          return resolveClickableRouterNode(
            document.querySelector('[data-list-item-id="guildsnav___home"], a[href="/channels/@me"], [aria-label="Direct Messages" i]')
          );
        }
      }
      // 8. Messenger
      else if (host.includes('messenger.com')) {
        if (cleanTarget.startsWith('/requests')) {
          return resolveClickableRouterNode(
            document.querySelector('a[href*="/requests"], [aria-label*="Requests" i], [aria-label*="Message requests" i]')
          );
        }
        if (cleanTarget.startsWith('/archived')) {
          return resolveClickableRouterNode(
            document.querySelector('a[href*="/archived"], [aria-label*="Archive" i], [aria-label*="Archived chats" i]')
          );
        }
        if (cleanTarget === '/') {
          return resolveClickableRouterNode(
            document.querySelector('a[aria-label="Chats" i], [role="navigation"] [aria-label="Chats" i], a[href^="/t/"]')
          );
        }
      }
      // 9. WhatsApp
      else if (host.includes('whatsapp.com')) {
        return resolveClickableRouterNode(
          document.querySelector('button[aria-label="Chats" i], [data-icon="chat"]')
        );
      }
      // 10. Twitch
      else if (host.includes('twitch.tv')) {
        if (cleanTarget === '/') {
          return resolveClickableRouterNode(
            document.querySelector('a[data-a-target="home-link"], a[href="/"]')
          );
        }
        if (cleanTarget.startsWith('/directory/following')) {
          return resolveClickableRouterNode(
            document.querySelector('a[data-a-target="following-link"], a[href="/directory/following"]')
          );
        }
        if (cleanTarget === '/directory') {
          return resolveClickableRouterNode(
            document.querySelector('a[data-a-target="browse-link"], a[href="/directory"]')
          );
        }
      }
      // 11. ChatGPT
      else if (host.includes('chatgpt.com') || host.includes('openai.com')) {
        if (cleanTarget === '/') {
          return resolveClickableRouterNode(
            document.querySelector('a[data-testid="create-new-chat-button"], a[href="/"]')
          );
        }
        if (cleanTarget.startsWith('/gpts')) {
          return resolveClickableRouterNode(
            document.querySelector('a[href="/gpts"], a[href*="/gpts"]')
          );
        }
      }
      // 12. Gemini
      else if (host.includes('gemini.google.com')) {
        if (cleanTarget === '/app' || cleanTarget === '/') {
          return resolveClickableRouterNode(
            document.querySelector('a[href="/app"], button[aria-label*="New chat" i]')
          );
        }
        if (cleanTarget.startsWith('/gems')) {
          return resolveClickableRouterNode(
            document.querySelector('a[href*="/gems"]')
          );
        }
      }
      // 13. Telegram
      else if (host.includes('telegram.org')) {
        if (cleanTarget === '/k' || cleanTarget === '/a' || cleanTarget === '/') {
          return resolveClickableRouterNode(
            document.querySelector('.sidebar-close-button, button.btn-icon.sidebar-back-button')
          );
        }
      }

      // 14. Generic exact pathname href match in the live DOM (never match random /@creator links!)
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      for (const a of anchors) {
        try {
          const u = new URL(a.getAttribute('href') || a.href, window.location.origin);
          if (u.origin !== window.location.origin) continue;
          const p = (u.pathname || '/').replace(/\/+$/, '') || '/';
          if (p === cleanTarget) return a;
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  }

  function performSmoothSpaNavigation(targetUrl, label = '', icon = '') {
    if (!targetUrl) return;
    lastRouteOrClickAt = Date.now();

    // Resolve logged-in user's own profile URL on TikTok, Instagram, and X so clicking "Profile" always goes to their real profile page!
    if (icon === 'profile' || targetUrl.endsWith('/profile')) {
      const ownProfUrl = getOwnProfileUrlForCurrentHost();
      if (ownProfUrl) {
        targetUrl = ownProfUrl;
      }
    }

    let dest = null;
    try {
      dest = new URL(targetUrl, window.location.href);
    } catch (_) {
      window.location.href = targetUrl;
      return;
    }

    // Cross-origin subView (e.g., www.reddit.com -> chat.reddit.com, www.youtube.com -> music.youtube.com, open.spotify.com -> accounts.spotify.com)
    if (dest.origin !== window.location.origin) {
      pauseActiveVideosSoftly();
      try {
        if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmStopYtMirror === 'function') {
          window.wrappedJSObject.__pmStopYtMirror();
        }
      } catch (_) {}
      notifyParent('PM_FRAME_NAV_START', { title: label ? `Opening ${label}…` : undefined });
      window.location.href = targetUrl;
      return;
    }

    const startPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    const destPath = (dest.pathname || '/').replace(/\/+$/, '') || '/';

    // If navigating on YouTube to a non-video route (e.g., Home '/', Subs '/feed/subscriptions', Library '/feed/you') or leaving /shorts, immediately stop active video & mirror!
    if (host.includes('youtube.com') && !host.includes('music.youtube.com')) {
      const destIsPlayable =
        destPath.startsWith('/watch') ||
        destPath.startsWith('/shorts') ||
        destPath.startsWith('/live') ||
        destPath.startsWith('/embed');
      if (!destIsPlayable || (startPath.startsWith('/shorts') && !destPath.startsWith('/shorts'))) {
        pauseActiveVideosSoftly();
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmStopYtMirror === 'function') {
            window.wrappedJSObject.__pmStopYtMirror();
          }
        } catch (_) {}
      }
    }

    // Special Case 1: Spotify Zero-Reload View Switching (Never reload open.spotify.com or audio stops!)
    if (host.includes('spotify.com')) {
      const spView =
        destPath.startsWith('/collection') || dest.hash === '#library' || icon === 'library'
          ? 'library'
          : destPath.startsWith('/search') || icon === 'search'
          ? 'search'
          : 'player';
      spotifyViewOverride = spView;
      spotifyPanelOpen = false;
      activeSpotifyPanelTrigger = '';
      syncAppSpecificDomState();

      if (spView === 'library') {
        notifyParent('PM_FRAME_URL_CHANGED', {
          url: 'https://open.spotify.com/collection/playlists',
          title: document.title || ''
        });
        return;
      }

      const spEl = findNativeInAppNavElement(destPath, icon, label);
      if (spEl) {
        spEl.click();
        if (spView === 'search') {
          const searchInput = document.querySelector('[data-testid="search-input"], input[type="search"]');
          if (searchInput) searchInput.focus();
        }
      }
      scheduleStaggeredRouteChecks();
      notifyParent('PM_FRAME_URL_CHANGED', {
        url: spView === 'search' ? 'https://open.spotify.com/search' : 'https://open.spotify.com/',
        title: document.title || ''
      });
      return;
    }

    // Special Case 2: TikTok transition into or out of /messages (separate webapp-messages micro-frontend)
    if (host.includes('tiktok.com')) {
      const isCurrentlyOnMessages = startPath.startsWith('/messages');
      const isTargetMessages = destPath.startsWith('/messages');
      if (isCurrentlyOnMessages !== isTargetMessages) {
        pauseActiveVideosSoftly();
        notifyParent('PM_FRAME_NAV_START', { title: label ? `Opening ${label}…` : undefined });
        if (destPath === '/profile' || icon === 'profile') {
          const ownUrl = resolveTikTokOwnProfileUrl();
          if (ownUrl) {
            window.location.href = ownUrl;
            return;
          }
          const profEl = findNativeInAppNavElement('/profile', 'profile', label);
          if (profEl) {
            profEl.click();
            return;
          }
          window.location.href = 'https://www.tiktok.com/?pm_goto_profile=1';
          return;
        }
        window.location.href = targetUrl;
        return;
      }

      // Leaving TikTok video feed for Explore or Profile: pause active video so audio doesn't play over Explore/Profile
      const isLeavingFeed =
        (startPath === '/' || startPath.startsWith('/foryou') || startPath.startsWith('/following')) &&
        (destPath.startsWith('/explore') || destPath.startsWith('/@') || destPath === '/profile' || icon === 'profile');
      if (isLeavingFeed) {
        pauseActiveVideosSoftly();
      }
    }

    // Lock the optimistic view state for 1800ms so syncAppSpecificDomState never reverts it at 60ms while React 18 transitions
    pendingSpaTarget = {
      destPath,
      icon,
      expiresAt: Date.now() + 1800,
      tiktokView: host.includes('tiktok.com')
        ? destPath.startsWith('/messages')
          ? 'messages'
          : destPath.startsWith('/explore')
          ? 'explore'
          : destPath.startsWith('/@') || destPath.startsWith('/profile') || icon === 'profile'
          ? 'profile'
          : 'feed'
        : undefined,
      igView: host.includes('instagram.com')
        ? destPath.startsWith('/reels')
          ? 'reels'
          : destPath.startsWith('/direct')
          ? 'dm-inbox'
          : destPath.startsWith('/explore')
          ? 'explore'
          : 'feed'
        : undefined,
      messengerView: host.includes('messenger.com') ? 'inbox' : undefined
    };
    syncAppSpecificDomState();

    // Special Case 3: Discord two-step transition when inside a server and clicking Nitro (/store) or Friends
    if (host.includes('discord.com') && !startPath.startsWith('/channels/@me') && !startPath.startsWith('/store')) {
      const homeGuildBtn = document.querySelector('[data-list-item-id="guildsnav___home"], a[href="/channels/@me"]');
      if (homeGuildBtn && destPath.startsWith('/store')) {
        homeGuildBtn.click();
        setTimeout(() => {
          const storeEl = findNativeInAppNavElement('/store', icon, label);
          if (storeEl) storeEl.click();
          scheduleStaggeredRouteChecks();
        }, 90);
        return;
      }
    }

    // 1. Try clicking the app's own native router link in the DOM for 0ms SPA transition
    const nativeEl = findNativeInAppNavElement(dest.pathname, icon, label);
    if (nativeEl) {
      nativeEl.click();
      scheduleStaggeredRouteChecks();

      // Generous 1100ms verification window for React 18 startTransition / lazy chunks (never false-reloads at 280ms!)
      setTimeout(() => {
        const curPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
        if (isRouteMatchForApp(curPath, destPath, icon) || curPath !== startPath) {
          handleRouteOrStateCheck();
          return;
        }
        // Only fall back to location.href if the URL didn't budge at all after 1100ms AND we aren't already on a matching view
        if (destPath === '/profile' || icon === 'profile') {
          const ownUrl = getOwnProfileUrlForCurrentHost();
          if (ownUrl) window.location.href = ownUrl;
        } else if (!host.includes('whatsapp.com') && !host.includes('discord.com')) {
          window.location.href = targetUrl;
        }
      }, 1100);
      return;
    }

    // If we are already on an equivalent route and no native link needed clicking, just sync state without reloading!
    if (isRouteMatchForApp(startPath, destPath, icon) && !dest.search) {
      handleRouteOrStateCheck();
      return;
    }

    // 2. Try dispatching a bubbling click on a temporary same-origin <a> so delegated SPA routers intercept it
    try {
      const tempA = document.createElement('a');
      tempA.href = dest.pathname + dest.search + dest.hash;
      tempA.style.display = 'none';
      document.body.appendChild(tempA);
      tempA.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0 }));
      tempA.remove();
    } catch (_) {}

    scheduleStaggeredRouteChecks();

    setTimeout(() => {
      const curPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
      if (!isRouteMatchForApp(curPath, destPath, icon) && curPath === startPath) {
        if (destPath === '/profile' || icon === 'profile') {
          const ownUrl = getOwnProfileUrlForCurrentHost();
          if (ownUrl) window.location.href = ownUrl;
        } else if (!host.includes('whatsapp.com')) {
          window.location.href = targetUrl;
        }
      } else {
        handleRouteOrStateCheck();
      }
    }, 550);
  }

  function applyZoom(newZoom) {
    currentZoom = Math.max(0.5, Math.min(1.4, Number(newZoom) || 1.0));
    if (document.documentElement) {
      document.documentElement.style.zoom = String(currentZoom);
    }
    notifyParent('PM_FRAME_ZOOM_UPDATED', { zoom: currentZoom });
  }

  // Listen for navigation, zoom & theme commands from parent PocketHub toolbar
  function handleMediaFrameCommand(msg) {
    if (!msg || msg.target !== 'pocketmail-media-frame') return;

    switch (msg.cmd) {
      case 'ACTIVATE_BG_SPOTIFY_HANDOFF': {
        isStandbyBgFrame = false;
        isBgAudioFrame = true;
        cleanWindowName = 'pm-bg-audio-spotify';
        try {
          window.name = 'pm-bg-audio-spotify';
        } catch (_) {}
        bgAudioAutoResumed = false;
        isTabAudioAutoPaused = false;
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmPromoteStandbyToBgFrame === 'function') {
            window.wrappedJSObject.__pmPromoteStandbyToBgFrame('pm-bg-audio-spotify');
          }
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover === 'function') {
            window.wrappedJSObject.__pmEnsureSpotifyLocalTakeover(true);
          }
        } catch (_) {}
        reportLivePlaybackState();
        {
          const bootStart = Date.now();
          const fastBgBootTimer = setInterval(() => {
            if (bgAudioAutoResumed || Date.now() - bootStart > 18000) {
              clearInterval(fastBgBootTimer);
              return;
            }
            reportLivePlaybackState();
          }, 80);
        }
        break;
      }
      case 'PAUSE_BG_SP_MEDIA':
        if (!isBgAudioFrame || !host.includes('spotify.com')) break;
        bgAudioAutoResumed = true;
        setTimeout(() => {
          try {
            clickSpotifyToggleOnce(false);
            document.querySelectorAll('video, audio').forEach((el) => {
              try {
                if (!el.paused) el.pause();
              } catch (_) {}
            });
          } catch (_) {}
        }, 260);
        break;
      case 'RESUME_BG_SP_MEDIA':
        if (!isBgAudioFrame || !host.includes('spotify.com')) break;
        isTabAudioAutoPaused = false;
        window.__pmWasAutoPausedByTabAudio = false;
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmClearTabAutoPaused === 'function') {
            window.wrappedJSObject.__pmClearTabAutoPaused();
          }
        } catch (_) {}
        setTimeout(() => {
          try {
            if (!clickSpotifyToggleOnce(true)) {
              if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureMirrorPlay === 'function') {
                window.wrappedJSObject.__pmEnsureMirrorPlay();
              }
            }
          } catch (_) {}
        }, 260);
        break;
      case 'MARK_USER_GESTURE':
        lastUserGestureAt = Date.now();
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmMarkUserGesture === 'function') {
            window.wrappedJSObject.__pmMarkUserGesture();
          }
        } catch (_) {}
        break;
      case 'SEEK_SP_MEDIA':
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__seekActiveSpMediaEl === 'function') {
            window.wrappedJSObject.__seekActiveSpMediaEl(
              Number(msg.currentTime) || 0,
              Boolean(msg.forceHarmonySeek)
            );
          }
        } catch (_) {}
        break;
      case 'SKIP_NEXT_SP_TRACK':
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__skipNextSpTrack === 'function') {
            window.wrappedJSObject.__skipNextSpTrack();
          }
        } catch (_) {}
        break;
      case 'PREPARE_HANDOFF_UNLOAD':
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmPrepareHandoffUnload === 'function') {
            window.wrappedJSObject.__pmPrepareHandoffUnload();
          }
        } catch (_) {}
        break;
      case 'APPLY_MUTE_CONFIG':
        syncFrameSettingsCache(msg);
        break;
      case 'AUTO_RESUME_PLAYBACK':
        if (isBgAudioFrame) break;
        sidebarAutoResumeRequested = true;
        sidebarAutoResumeRequestedAt = Date.now();
        reportLivePlaybackState();
        {
          const fastSbResumeTimer = setInterval(() => {
            if (!sidebarAutoResumeRequested || Date.now() - sidebarAutoResumeRequestedAt > 18000) {
              clearInterval(fastSbResumeTimer);
              return;
            }
            reportLivePlaybackState();
          }, 80);
        }
        break;
      case 'PAUSE_LOCAL_MEDIA':
        sidebarAutoResumeRequested = false;
        isTabAudioAutoPaused = false;
        window.__pmWasAutoPausedByTabAudio = false;
        clearTimeout(spTabPauseVerifyTimer);
        stopLocalMseAudioBridge();
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmPauseAllSpMedia === 'function') {
            window.wrappedJSObject.__pmPauseAllSpMedia();
          }
          if (host.includes('spotify.com')) {
            clickSpotifyToggleOnce(false);
          }
          document.querySelectorAll('video, audio').forEach((el) => {
            try {
              if (!el.paused) el.pause();
            } catch (_) {}
          });
        } catch (_) {}
        reportLivePlaybackState();
        break;
      case 'TAB_AUDIO_AUTO_PAUSE': {
        clearTimeout(spTabPauseVerifyTimer);
        const alreadyAutoPaused = isTabAudioAutoPaused;
        isTabAudioAutoPaused = true;
        try {
          let wasPlayingNow = false;
          // Only click Spotify's play/pause button on the FIRST transition to auto-paused!
          // Duplicate TAB_AUDIO_AUTO_PAUSE messages within 5ms would otherwise read stale aria-label="Pause"
          // before React re-renders and double-click Spotify right back to Play!
          if (host.includes('spotify.com') && !alreadyAutoPaused) {
            if (clickSpotifyToggleOnce(false)) {
              wasPlayingNow = true;
            }
          }
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmTempPauseSpMedia === 'function') {
            if (window.wrappedJSObject.__pmTempPauseSpMedia()) {
              wasPlayingNow = true;
            }
          }
          document.querySelectorAll('video, audio').forEach((el) => {
            try {
              if (!el.paused && !el.ended) {
                wasPlayingNow = true;
                el.dataset.pmTabAutoPaused = '1';
                el.pause();
              }
            } catch (_) {}
          });
          if (wasPlayingNow || sidebarAutoResumeRequested || Boolean(msg.markShouldResume)) {
            window.__pmWasAutoPausedByTabAudio = true;
          }
          // Post-React settle verification (340ms later, once Spotify has updated aria-label)
          spTabPauseVerifyTimer = setTimeout(() => {
            if (!isTabAudioAutoPaused) return;
            try {
              if (host.includes('spotify.com') && clickSpotifyToggleOnce(false)) {
                window.__pmWasAutoPausedByTabAudio = true;
              }
              if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmTempPauseSpMedia === 'function') {
                window.wrappedJSObject.__pmTempPauseSpMedia();
              }
            } catch (_) {}
          }, 340);
        } catch (_) {}
        reportLivePlaybackState();
        break;
      }
      case 'TAB_AUDIO_AUTO_RESUME': {
        clearTimeout(spTabPauseVerifyTimer);
        if (!isTabAudioAutoPaused && !window.__pmWasAutoPausedByTabAudio) {
          break;
        }
        isTabAudioAutoPaused = false;
        try {
          if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmClearTabAutoPaused === 'function') {
            window.wrappedJSObject.__pmClearTabAutoPaused();
          }
          const shouldResume = Boolean(
            window.__pmWasAutoPausedByTabAudio ||
              sidebarAutoResumeRequested ||
              (isBgAudioFrame && !bgAudioAutoResumed)
          );
          window.__pmWasAutoPausedByTabAudio = false;
          if (shouldResume) {
            let clickedSpotifyPlay = false;
            if (host.includes('spotify.com')) {
              clickedSpotifyPlay = clickSpotifyToggleOnce(true);
              spTabPauseVerifyTimer = setTimeout(() => {
                if (isTabAudioAutoPaused) return;
                try {
                  if (!clickedSpotifyPlay) {
                    clickSpotifyToggleOnce(true);
                  }
                  if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureMirrorPlay === 'function') {
                    window.wrappedJSObject.__pmEnsureMirrorPlay();
                  }
                } catch (_) {}
              }, clickedSpotifyPlay ? 180 : 340);
            } else if (window.wrappedJSObject && typeof window.wrappedJSObject.__pmEnsureMirrorPlay === 'function') {
              window.wrappedJSObject.__pmEnsureMirrorPlay();
            }
            document.querySelectorAll('video, audio').forEach((el) => {
              try {
                if (el.dataset.pmTabAutoPaused === '1') {
                  delete el.dataset.pmTabAutoPaused;
                  if ((!host.includes('spotify.com') || !clickedSpotifyPlay) && el.paused && !el.ended) {
                    const p = el.play();
                    if (p && typeof p.catch === 'function') p.catch(() => {});
                  }
                }
              } catch (_) {}
            });
          }
        } catch (_) {}
        setTimeout(() => reportLivePlaybackState(), 180);
        break;
      }
      case 'FREE_HEAVY_MEDIA':
        freeHeavyMediaResources();
        break;
      case 'SPA_NAVIGATE':
        performSmoothSpaNavigation(msg.url, msg.label, msg.icon);
        break;
      case 'BACK':
        window.history.back();
        break;
      case 'FORWARD':
        window.history.forward();
        break;
      case 'RELOAD':
        window.location.reload();
        break;
      case 'ZOOM_IN':
        applyZoom(currentZoom + 0.1);
        break;
      case 'ZOOM_OUT':
        applyZoom(currentZoom - 0.1);
        break;
      case 'ZOOM_RESET':
        applyZoom(1.0);
        break;
      case 'APPLY_APP_THEME':
        injectAppThemeCss(msg.themeMode || 'native', msg.accentColor || '#6C5CE7');
        updateVideoLoadbarConfig(msg);
        break;
      case 'APPLY_LOADBAR_CONFIG':
        updateVideoLoadbarConfig(msg);
        break;
      case 'ZOOM_FIT': {
        if (Math.abs(currentZoom - 1.0) > 0.04) {
          applyZoom(1.0);
        } else {
          const vw = window.innerWidth || 450;
          const sw = Math.max(
            document.documentElement ? document.documentElement.scrollWidth : vw,
            document.body ? document.body.scrollWidth : vw,
            host.includes('whatsapp.com') ? 620 : host.includes('spotify.com') ? 540 : vw
          );
          const ratio = sw > vw + 12 ? Math.max(0.62, Math.min(0.95, (vw - 8) / sw)) : 0.88;
          applyZoom(ratio);
        }
        break;
      }
      default:
        break;
    }
  }
  window.__pmHandleMediaFrameCommand = handleMediaFrameCommand;
  window.addEventListener('message', (e) => {
    handleMediaFrameCommand(e.data);
  });

  if (isFoxHubMediaFrame && typeof browser !== 'undefined' && browser.storage) {
    const applyTriggerState = (trig) => {
      if (!trig || typeof trig !== 'object') return;
      if (trig.active) {
        const cmd = trig.stayStopped ? 'PAUSE_LOCAL_MEDIA' : 'TAB_AUDIO_AUTO_PAUSE';
        handleMediaFrameCommand({
          target: 'pocketmail-media-frame',
          cmd,
          markShouldResume: isBgAudioFrame
        });
      } else if (isTabAudioAutoPaused || window.__pmWasAutoPausedByTabAudio) {
        handleMediaFrameCommand({
          target: 'pocketmail-media-frame',
          cmd: 'TAB_AUDIO_AUTO_RESUME'
        });
      }
    };
    try {
      if (browser.storage.local && typeof browser.storage.local.get === 'function') {
        browser.storage.local
          .get(['pmTabAudioTrigger', 'settings'])
          .then((res) => {
            if (res && res.pmTabAudioTrigger && res.pmTabAudioTrigger.active) {
              applyTriggerState(res.pmTabAudioTrigger);
            }
            if (res && res.settings) {
              updateVideoLoadbarConfig(res.settings);
              syncFrameSettingsCache(res.settings);
            }
          })
          .catch(() => {});
      }
      if (browser.storage.onChanged && typeof browser.storage.onChanged.addListener === 'function') {
        browser.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && changes) {
            if (changes.pmTabAudioTrigger && changes.pmTabAudioTrigger.newValue) {
              applyTriggerState(changes.pmTabAudioTrigger.newValue);
            }
            if (changes.settings && changes.settings.newValue) {
              updateVideoLoadbarConfig(changes.settings.newValue);
              syncFrameSettingsCache(changes.settings.newValue);
            }
          }
        });
      }
    } catch (_) {}
  }

  // Relay custom per-app keyboard shortcuts when focus is inside an embedded FoxHub app iframe
  if (isFoxHubMediaFrame && !isBgAudioFrame && !isStandbyBgFrame && typeof browser !== 'undefined' && browser.runtime) {
    const formatFrameKeyCombo = (ev) => {
      if (!ev || ev.repeat) return '';
      if (ev.getModifierState && ev.getModifierState('AltGraph')) return '';
      const k = ev.key || '';
      if (k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta' || k === 'OS') return '';
      const isFnKey = /^F([1-9]|1[0-2])$/i.test(k);
      const hasPrimaryMod = ev.altKey || ev.ctrlKey || ev.metaKey;
      if (!hasPrimaryMod && !isFnKey) return '';
      if (!isFnKey && !(ev.altKey || (ev.ctrlKey && ev.shiftKey) || (ev.metaKey && ev.shiftKey))) return '';

      let keyToken = '';
      const code = ev.code || '';
      if (/^Key([A-Z])$/.test(code)) {
        keyToken = code.slice(3).toUpperCase();
      } else if (/^Digit([0-9])$/.test(code)) {
        keyToken = code.slice(5);
      } else if (isFnKey) {
        keyToken = k.toUpperCase();
      } else if (code === 'Comma') {
        keyToken = 'Comma';
      } else if (code === 'Period') {
        keyToken = 'Period';
      } else if (code === 'Space') {
        keyToken = 'Space';
      } else if (k.length === 1 && /[a-z0-9]/i.test(k)) {
        keyToken = k.toUpperCase();
      }
      if (!keyToken) return '';

      const parts = [];
      if (ev.ctrlKey || ev.metaKey) parts.push('Ctrl');
      if (ev.altKey) parts.push('Alt');
      if (ev.shiftKey) parts.push('Shift');
      parts.push(keyToken);
      return parts.join('+');
    };

    window.addEventListener(
      'keydown',
      (ev) => {
        try {
          const combo = formatFrameKeyCombo(ev);
          if (!combo) return;
          const map = cachedShortcutBindings.appShortcuts;
          if (!map || typeof map !== 'object') return;
          const comboNorm = combo.toLowerCase();
          for (const [appId, bound] of Object.entries(map)) {
            if (bound && String(bound).trim().toLowerCase() === comboNorm) {
              ev.preventDefault();
              ev.stopPropagation();
              browser.runtime
                .sendMessage({ type: 'TRIGGER_APP_SHORTCUT', appId })
                .catch(() => {});
              return;
            }
          }
        } catch (_) {}
      },
      true
    );
  }

  // Persistent Scroll Position Save & Instant Restore across FoxHub Close & Reopen
  if (!isBgAudioFrame && !isStandbyBgFrame && !window.location.search.includes('pm_boot=1')) {
    const SCROLL_STORE_KEY = '__pm_persist_scroll_v1';
    let scrollSaveTimer = null;
    let userScrolledManually = false;

    const findPrimaryScrollContainer = () => {
      try {
        const candidates = document.querySelectorAll(
          'main, [role="main"], [data-testid="primaryColumn"], .main-view-container__scroll-node, .scrollable-page'
        );
        for (let i = 0; i < candidates.length; i++) {
          const c = candidates[i];
          if (c && c.scrollHeight > c.clientHeight + 80 && c.scrollTop > 0) {
            return c;
          }
        }
      } catch (_) {}
      return null;
    };

    const persistCurrentScroll = () => {
      try {
        const winY = Math.round(window.scrollY || document.documentElement?.scrollTop || 0);
        const innerEl = winY <= 2 ? findPrimaryScrollContainer() : null;
        const innerY = innerEl ? Math.round(innerEl.scrollTop || 0) : 0;
        if (winY <= 4 && innerY <= 4) return;
        const payload = JSON.stringify({
          p: window.location.pathname + window.location.search,
          w: winY,
          i: innerY,
          ts: Date.now()
        });
        window.localStorage.setItem(SCROLL_STORE_KEY, payload);
      } catch (_) {}
    };

    window.addEventListener(
      'scroll',
      (ev) => {
        if (ev && ev.isTrusted) userScrolledManually = true;
        clearTimeout(scrollSaveTimer);
        scrollSaveTimer = setTimeout(persistCurrentScroll, 320);
      },
      { capture: true, passive: true }
    );
    window.addEventListener('pagehide', persistCurrentScroll, { capture: true, passive: true });

    const attemptRestoreSavedScroll = () => {
      if (userScrolledManually) return;
      try {
        const raw = window.localStorage.getItem(SCROLL_STORE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (!saved || Date.now() - (saved.ts || 0) > 6 * 3600 * 1000) return;
        if (saved.p !== window.location.pathname + window.location.search) return;
        if (saved.w > 4 && (document.documentElement?.scrollHeight || 0) > window.innerHeight + 40) {
          window.scrollTo(0, saved.w);
        } else if (saved.i > 4) {
          const candidates = document.querySelectorAll(
            'main, [role="main"], [data-testid="primaryColumn"], .main-view-container__scroll-node, .scrollable-page'
          );
          for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            if (c && c.scrollHeight > c.clientHeight + 80) {
              c.scrollTop = saved.i;
              break;
            }
          }
        }
      } catch (_) {}
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        attemptRestoreSavedScroll();
        setTimeout(attemptRestoreSavedScroll, 220);
      }, { once: true });
    } else {
      attemptRestoreSavedScroll();
      setTimeout(attemptRestoreSavedScroll, 220);
    }
  }
})();
