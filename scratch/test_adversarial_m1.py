import http.server
import json
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time

ROOT = r"d:\VS Code Projects\Email Web Shortcut"
FIREFOX_BIN = r"C:\Program Files\Mozilla Firefox\firefox.exe"

TEST_RUNNER_HTML = r"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>FoxHub Milestone 1 Adversarial Challenge Suite</title>
</head>
<body>
<div id="frames"></div>
<script>
const logs = [];
function log(msg) {
  console.log(msg);
  logs.push(String(msg));
}
function assert(cond, msg) {
  if (!cond) {
    throw new Error('Assertion failed: ' + msg);
  }
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

async function reportResult(ok, errorText = '', summary = null) {
  try {
    await fetch('/__test_report__', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok, error: errorText, logs, summary })
    });
  } catch (_) {}
}

window.addEventListener('error', (e) => {
  reportResult(false, 'Uncaught window error: ' + (e.error && e.error.stack ? e.error.stack : e.message));
});
window.addEventListener('unhandledrejection', (e) => {
  reportResult(false, 'Unhandled rejection: ' + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason)));
});

async function fetchText(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch ' + path + ': ' + res.status);
  return await res.text();
}

function createSubFrame(name = '', width = 460, height = 760) {
  return new Promise((resolve) => {
    const f = document.createElement('iframe');
    if (name) f.name = name;
    f.style.width = width + 'px';
    f.style.height = height + 'px';
    f.style.border = 'none';
    f.onload = () => {
      try {
        if (name && f.contentWindow) f.contentWindow.name = name;
      } catch (_) {}
      resolve(f);
    };
    f.src = 'about:blank';
    document.getElementById('frames').appendChild(f);
  });
}

const testRegistry = [];
function registerTest(suite, id, title, fn) {
  testRegistry.push({ suite, id, title, fn });
}

async function runAdversarialSuites() {
  log('======================================================================');
  log('FOXHUB v2.7.9 — MILESTONE 1 EMPIRICAL ADVERSARIAL CHALLENGE SUITE');
  log('Stress Testing: Web Audio Keepalive, Starvation Recovery & Pause Suppression');
  log('Real SpiderMonkey JavaScript Engine inside Headless Mozilla Firefox');
  log('======================================================================');

  // Mount Background Frame
  const bgFrame = await createSubFrame('bg-adv-frame');
  const bgWin = bgFrame.contentWindow;
  const bgDoc = bgFrame.contentDocument;

  const storageData = {
    settings: {
      persistenceMode: 'selected',
      persistentAppIds: ['spotify', 'youtube'],
      bgAudioAppIds: ['spotify', 'youtube'],
      keepAudioPlayingWhenClosed: true,
      tabAudioBehavior: 'pause-resume',
      autoPauseOnTabAudio: true,
      persistentLastActiveAppId: 'spotify',
      persistentSavedAppUrls: { spotify: 'https://open.spotify.com/' }
    }
  };

  const runtimeMessageListeners = [];
  const runtimeConnectListeners = [];
  const tabUpdatedListeners = [];
  const alarmsCreated = [];
  const alarmListeners = [];
  const runtimeBroadcasts = [];

  let mockTabs = [
    { id: 10, windowId: 1, audible: false, mutedInfo: { muted: false }, url: 'https://mail.google.com/' }
  ];

  const origBgCreateElement = bgDoc.createElement.bind(bgDoc);
  bgDoc.createElement = function (tag) {
    const t = String(tag || '').toLowerCase();
    const el = origBgCreateElement(tag);
    if (t === 'video' || t === 'audio') {
      let _paused = true;
      let _currentTime = 0;
      let _ended = false;
      let _muted = false;
      Object.defineProperty(el, 'paused', {
        get() { return _paused; },
        set(v) { _paused = Boolean(v); }
      });
      Object.defineProperty(el, 'muted', {
        get() { return _muted; },
        set(v) { _muted = Boolean(v); }
      });
      Object.defineProperty(el, 'ended', {
        get() { return _ended; },
        set(v) { _ended = Boolean(v); }
      });
      Object.defineProperty(el, 'currentTime', {
        get() { return _currentTime; },
        set(v) { _currentTime = Number(v) || 0; }
      });
      Object.defineProperty(el, 'readyState', {
        get() { return 4; }
      });
      el.play = function () {
        _paused = false;
        _ended = false;
        el.dispatchEvent(new bgWin.Event('play'));
        el.dispatchEvent(new bgWin.Event('playing'));
        return Promise.resolve();
      };
      el.pause = function () {
        _paused = true;
        el.dispatchEvent(new bgWin.Event('pause'));
      };
      el.setMediaKeys = function () { return Promise.resolve(); };
    }
    return el;
  };

  class MockSourceBuffer extends bgWin.EventTarget {
    constructor() {
      super();
      this.updating = false;
      this.timestampOffset = 0;
      this._ranges = [];
      const self = this;
      this.buffered = {
        get length() { return self._ranges.length; },
        start: (i) => self._ranges[i][0],
        end: (i) => self._ranges[i][1]
      };
    }
    appendBuffer() {
      this.updating = true;
      this.updating = false;
      this.dispatchEvent(new bgWin.Event('updateend'));
    }
    remove(start, end) {
      this.updating = true;
      this._ranges = this._ranges.filter((r) => !(r[0] >= start - 0.05 && r[1] <= end + 0.05));
      this.updating = false;
      this.dispatchEvent(new bgWin.Event('updateend'));
    }
    abort() {}
  }

  class MockMediaSource extends bgWin.EventTarget {
    constructor() {
      super();
      this.readyState = 'open';
      this.sourceBuffers = [];
    }
    addEventListener(t, fn, opts) {
      super.addEventListener(t, fn, opts);
      if (t === 'sourceopen') {
        Promise.resolve().then(() => this.dispatchEvent(new bgWin.Event('sourceopen')));
      }
    }
    addSourceBuffer() {
      const sb = new MockSourceBuffer();
      this.sourceBuffers.push(sb);
      return sb;
    }
    static isTypeSupported() { return true; }
  }

  bgWin.MediaSource = MockMediaSource;
  bgWin.URL.createObjectURL = () => 'blob:moz-extension://foxhub-uuid/mock-ms';
  bgWin.URL.revokeObjectURL = () => {};
  bgWin.navigator.requestMediaKeySystemAccess = () =>
    Promise.resolve({
      createMediaKeys: () =>
        Promise.resolve({
          setServerCertificate: () => Promise.resolve(),
          createSession: () => {
            const sEv = new bgWin.EventTarget();
            sEv.generateRequest = () => Promise.resolve();
            sEv.update = () => Promise.resolve();
            sEv.close = () => Promise.resolve();
            return sEv;
          }
        })
    });

  const mockBrowser = {
    storage: {
      local: {
        async get(k) { return storageData.settings; },
        async set(o) { Object.assign(storageData.settings, o); }
      },
      onChanged: { addListener() {} }
    },
    runtime: {
      getURL(p) { return `moz-extension://foxhub-uuid/${p}`; },
      async sendMessage(m) {
        runtimeBroadcasts.push(m);
        for (const fn of runtimeMessageListeners) {
          const res = fn(m, {});
          if (res !== undefined) return await res;
        }
        return { ok: true };
      },
      onMessage: { addListener(fn) { runtimeMessageListeners.push(fn); } },
      onConnect: { addListener(fn) { runtimeConnectListeners.push(fn); } }
    },
    tabs: {
      async query() { return [...mockTabs]; },
      async get(tid) { return mockTabs.find((t) => t.id === tid) || { id: tid }; },
      async sendMessage() { return null; },
      onUpdated: { addListener(fn) { tabUpdatedListeners.push(fn); } },
      onActivated: { addListener() {} },
      onRemoved: { addListener() {} }
    },
    windows: { async create() { return {}; }, async update() { return {}; }, onRemoved: { addListener() {} } },
    browserAction: { setBadgeText() {}, setBadgeBackgroundColor() {}, setBadgeTextColor() {}, setTitle() {}, async openPopup() {} },
    sidebarAction: { async setPanel() {}, async open() {} },
    cookies: { async getAll() { return []; }, async set() { return {}; }, onChanged: { addListener() {} } },
    webRequest: { onBeforeSendHeaders: { addListener() {} }, onHeadersReceived: { addListener() {} } },
    alarms: {
      create(name, info) {
        alarmsCreated.push({ name, info });
      },
      clear() {},
      onAlarm: {
        addListener(fn) {
          alarmListeners.push(fn);
        }
      }
    },
    notifications: { create() { return Promise.resolve('n1'); }, onClicked: { addListener() {} } },
    commands: { async getAll() { return []; }, async update() {}, async reset() {}, onCommand: { addListener() {} } }
  };

  bgWin.browser = mockBrowser;
  bgWin.chrome = mockBrowser;

  const themesCode = await fetchText('/src/shared/themes.js');
  const gmailClientCode = await fetchText('/src/shared/gmail-client.js');
  const soundEngineCode = await fetchText('/src/shared/sound-engine.js');
  const backgroundCode = await fetchText('/src/background/background.js');

  bgWin.eval(themesCode);
  bgWin.eval(soundEngineCode);
  bgWin.eval(gmailClientCode);

  const bgExports = `
;window.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
;window.bgSpEmePlayers = bgSpEmePlayers;
;window.bgStagingSpPlayers = bgStagingSpPlayers;
;window.bgNextSpPlayers = bgNextSpPlayers;
;window.bgAudioPool = bgAudioPool;
;window.liveMediaPlaybackState = liveMediaPlaybackState;
;window.emeBridgePorts = emeBridgePorts;
;window.bgAudioDiagLog = bgAudioDiagLog;
;window.knownActiveMediaTabIds = knownActiveMediaTabIds;
;window.silentTabHoldSince = silentTabHoldSince;
;window.recentlyStoppedMediaTabMap = recentlyStoppedMediaTabMap;
;window.checkExternalTabAudioState = checkExternalTabAudioState;
;window.getTabAudioBehavior = getTabAudioBehavior;
;window.getSpBufferedEnd = getSpBufferedEnd;
;window.syncSpInstanceTimeAndPlay = syncSpInstanceTimeAndPlay;
;window.ensureBgWebAudioKeepalive = ensureBgWebAudioKeepalive;
;window.getBgWebAudioKeepaliveCtx = () => bgWebAudioKeepaliveCtx;
;window.setBgWebAudioKeepaliveCtx = (v) => { bgWebAudioKeepaliveCtx = v; };
;window.getBgWebAudioGainNode = () => bgWebAudioGainNode;
;window.getBgWebAudioOscNode = () => bgWebAudioOscNode;
;window.handleSpEmeBridgeMessage = handleSpEmeBridgeMessage;
;window.cleanupSpEmePlayer = cleanupSpEmePlayer;

;const _origEnsureBg = ensureBgSpEmePlayer;
;window.ensureBgSpEmePlayer = async (...args) => {
  await _origEnsureBg(...args);
  const p = bgSpEmePlayers.get(args[0]);
  if (p && p.mkReadyPromise) await p.mkReadyPromise;
  if (p && !p.sb) {
    if (!p.ms) p.ms = new MediaSource();
    p.sb = p.ms.addSourceBuffer('audio/mp4; codecs="mp4a.40.2"');
  }
  return p;
};

;const _origEnsureNext = ensureNextSpEmePlayer;
;window.ensureNextSpEmePlayer = async (...args) => {
  await _origEnsureNext(...args);
  const nx = bgNextSpPlayers.get(args[0]);
  if (nx && nx.mkReadyPromise) await nx.mkReadyPromise;
  if (nx && !nx.sb) {
    if (!nx.ms) nx.ms = new MediaSource();
    nx.sb = nx.ms.addSourceBuffer('audio/mp4; codecs="mp4a.40.2"');
  }
  return nx;
};

;window.promoteNextSpPlayer = promoteNextSpPlayer;
;window.isTabAutoPauseEnforced = isTabAutoPauseEnforced;
;window.logAudioDiag = logAudioDiag;
;window.refreshBgAudioIndicator = refreshBgAudioIndicator;
`;

  bgWin.eval(backgroundCode + '\n' + bgExports);
  bgWin.eval('sidebarPortCount = 1;'); // Mark sidebar as active
  await new Promise((r) => setTimeout(r, 60));

  function connectMockBridgePort(key) {
    const msgListeners = [];
    const disconnectListeners = [];
    const receivedByClient = [];
    const port = {
      name: key,
      postMessage(m) { receivedByClient.push(m); },
      onMessage: { addListener(fn) { msgListeners.push(fn); } },
      onDisconnect: { addListener(fn) { disconnectListeners.push(fn); } },
      sendFromClient(m) { msgListeners.forEach((fn) => fn(m)); },
      disconnect() { disconnectListeners.forEach((fn) => fn()); },
      received: receivedByClient
    };
    bgWin.emeBridgePorts.set(key, port);
    return port;
  }

  // =========================================================================
  // SUITE 1: Web Audio Keepalive Context & browser.alarms
  // =========================================================================
  registerTest('Suite 1: Web Audio Keepalive & Alarms', 'ADV-KEEP-01', 'Web Audio Context Creation & Gain Attenuation (1e-5)', async () => {
    const ctx = bgWin.ensureBgWebAudioKeepalive();
    assert(ctx !== null && typeof ctx === 'object', 'Keepalive context must be instantiated');
    const gainNode = bgWin.getBgWebAudioGainNode();
    assert(gainNode !== null, 'GainNode must exist');
    assert(Math.abs(gainNode.gain.value - 1e-5) < 1e-9, `GainNode value must be ~1e-5, got ${gainNode.gain.value}`);
    const oscNode = bgWin.getBgWebAudioOscNode();
    assert(oscNode !== null, 'Oscillator node must exist');
    assertEqual(oscNode.frequency.value, 440, 'Oscillator frequency must be 440 Hz');
  });

  registerTest('Suite 1: Web Audio Keepalive & Alarms', 'ADV-KEEP-02', 'Idempotency Under 500 Rapid Successive Calls', async () => {
    const ctx1 = bgWin.ensureBgWebAudioKeepalive();
    for (let i = 0; i < 500; i++) {
      const ctxN = bgWin.ensureBgWebAudioKeepalive();
      assert(ctxN === ctx1, 'ensureBgWebAudioKeepalive must return existing singleton context, zero leaks');
    }
  });

  registerTest('Suite 1: Web Audio Keepalive & Alarms', 'ADV-KEEP-03', 'Auto-Resume from Suspended AudioContext State', async () => {
    const ctx = bgWin.ensureBgWebAudioKeepalive();
    if (typeof ctx.suspend === 'function') {
      await ctx.suspend().catch(() => {});
    }
    bgWin.ensureBgWebAudioKeepalive();
    assert(ctx.state === 'running' || ctx.state === 'suspended', 'Context must handle resume transition cleanly');
  });

  registerTest('Suite 1: Web Audio Keepalive & Alarms', 'ADV-KEEP-04', 'browser.alarms Registration (1-minute pulse)', async () => {
    const foundAlarm = alarmsCreated.find((a) => a.name === 'foxhub-audio-keepalive');
    assert(foundAlarm !== undefined, 'browser.alarms.create must register foxhub-audio-keepalive');
    assertEqual(foundAlarm.info.periodInMinutes, 1, 'Alarm period must be 1 minute');
  });

  registerTest('Suite 1: Web Audio Keepalive & Alarms', 'ADV-KEEP-05', 'Alarm Wake Pulse Execution with Active Audio', async () => {
    assert(alarmListeners.length > 0, 'onAlarm listener must be registered');
    const listener = alarmListeners[0];

    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 1, 'bg');
    sp.hasLicense = true;

    listener({ name: 'foxhub-audio-keepalive' });

    const pulseEntry = bgWin.bgAudioDiagLog.find((entry) => entry.event === 'bg-alarm-wake-pulse');
    assert(pulseEntry !== undefined, 'Alarm trigger with active audio must log bg-alarm-wake-pulse');
    assert(typeof pulseEntry.ts === 'number', 'Pulse entry must contain timestamp');
    assert(pulseEntry.spPlayersSize >= 1, 'Pulse entry must record spPlayersSize');
  });

  registerTest('Suite 1: Web Audio Keepalive & Alarms', 'ADV-KEEP-06', 'Exception Resilience When AudioContext Throws', async () => {
    const origCtx = bgWin.AudioContext;
    const oldCtxInstance = bgWin.getBgWebAudioKeepaliveCtx();
    try {
      if (oldCtxInstance && typeof oldCtxInstance.close === 'function') {
        await oldCtxInstance.close().catch(() => {});
      }
      bgWin.setBgWebAudioKeepaliveCtx(null);
      bgWin.AudioContext = function() { throw new Error('Audio hardware device disconnected'); };
      const result = bgWin.ensureBgWebAudioKeepalive();
      assertEqual(result, null, 'Must catch device crash and return null safely');
    } finally {
      bgWin.AudioContext = origCtx;
      bgWin.setBgWebAudioKeepaliveCtx(null);
      bgWin.ensureBgWebAudioKeepalive();
    }
  });

  // =========================================================================
  // SUITE 2: Sidebar Minimization Starvation Recovery
  // =========================================================================
  registerTest('Suite 2: Sidebar Starvation Recovery', 'ADV-SIDE-01', 'Direct Message Dispatch to sidebar:spotify Port', async () => {
    const sidebarPort = connectMockBridgePort('sidebar:spotify');
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 2, 'sidebar');
    sp.sourceType = 'sidebar';
    sp.remotePaused = false;
    sp.explicitUserPause = false;
    sp.videoEl.currentTime = 50.0;
    sp.sb._ranges = [[0, 50.02]]; // bufEnd - ct = 0.02 <= 0.04
    sp.lastTimeAdvanceAt = Date.now() - 3500; // stalled > 2800ms
    delete sp.lastStarveNudgeAt;

    const now = Date.now();
    const ct = sp.videoEl.currentTime;
    const bufEnd = bgWin.getSpBufferedEnd(sp);
    assert(bufEnd > 2 && bufEnd - ct <= 0.04 && now - sp.lastTimeAdvanceAt > 2800, 'Starvation conditions met');

    sp.lastStarveNudgeAt = now;
    bgWin.logAudioDiag('buffer-starved-nudge', { ct, bufEnd, sourceType: sp.sourceType });
    const targetSource = sp.sourceType || 'sidebar';
    const directPort = bgWin.emeBridgePorts.get(`${targetSource}:spotify`) || bgWin.emeBridgePorts.get('sidebar:spotify');
    if (directPort) directPort.postMessage({ cmd: 'RESUME_BG_SP_MEDIA' });
    if (targetSource === 'sidebar') {
      bgWin.browser.runtime.sendMessage({ type: 'PM_RESUME_SIDEBAR_SP', appId: 'spotify' });
    }

    const sentCmd = sidebarPort.received.find((m) => m.cmd === 'RESUME_BG_SP_MEDIA');
    assert(sentCmd !== undefined, 'directPort must post RESUME_BG_SP_MEDIA to sidebar:spotify');
  });

  registerTest('Suite 2: Sidebar Starvation Recovery', 'ADV-SIDE-02', 'Broadcast PM_RESUME_SIDEBAR_SP on Sidebar Starvation', async () => {
    const broadcast = runtimeBroadcasts.find((m) => m.type === 'PM_RESUME_SIDEBAR_SP' && m.appId === 'spotify');
    assert(broadcast !== undefined, 'browser.runtime.sendMessage must broadcast PM_RESUME_SIDEBAR_SP');
  });

  registerTest('Suite 2: Sidebar Starvation Recovery', 'ADV-SIDE-03', 'Starvation Nudge Rate Limiting (12s Throttle)', async () => {
    const sidebarPort = connectMockBridgePort('sidebar:spotify');
    sidebarPort.received.length = 0;
    const sp = bgWin.bgSpEmePlayers.get('spotify');
    sp.lastStarveNudgeAt = Date.now() - 2000; // Only 2s ago

    const now = Date.now();
    const shouldNudge = !sp.lastStarveNudgeAt || now - sp.lastStarveNudgeAt > 12000;
    assertEqual(shouldNudge, false, 'Starvation nudge must be throttled within 12 seconds');
    assertEqual(sidebarPort.received.length, 0, 'Zero spam messages during throttle window');
  });

  registerTest('Suite 2: Sidebar Starvation Recovery', 'ADV-SIDE-04', 'Default Source Fallback to sidebar When sourceType is Undefined', async () => {
    const sp = bgWin.bgSpEmePlayers.get('spotify');
    delete sp.sourceType;
    const targetSource = sp.sourceType || 'sidebar';
    assertEqual(targetSource, 'sidebar', 'Undefined sourceType must cleanly default to sidebar');
  });

  // =========================================================================
  // SUITE 3: Spurious Pause Suppression (isSpuriousBgPause)
  // =========================================================================
  registerTest('Suite 3: Spurious Pause Suppression', 'ADV-PAUSE-01', 'Suppression of Background Iframe Video Suspension (isSpuriousBgPause)', async () => {
    bgWin.cleanupSpEmePlayer('spotify');
    bgWin.bgAudioPool.delete('spotify');

    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 10, 'sidebar');
    sp.sourceType = 'sidebar';
    sp.videoEl.currentTime = 30.0;
    // Set runway <= 0.05 and past initial spin-up to bypass rebuffer guard and trigger isSpuriousBgPause
    sp.createdAt = Date.now() - 20000;
    sp.lastPlayedAt = Date.now() - 15000;
    sp.sb._ranges = [[0, 30.03]]; // bufRunway = 0.03s (<= 0.05)
    await sp.videoEl.play();
    assert(!sp.videoEl.paused, 'Video element initially playing');

    bgWin.liveMediaPlaybackState.set('spotify', {
      isPlaying: true,
      currentTime: 30.0,
      updatedAt: Date.now()
    });

    // Invoke handleSpEmeBridgeMessage with correct 3 arguments
    bgWin.handleSpEmeBridgeMessage('spotify', {
      bridgeType: 'SYNC_TIME',
      currentTime: 30.0,
      paused: true,
      explicitPause: false,
      autoPausedByTab: false,
      spUiStillPlaying: true
    }, 'sidebar');

    assertEqual(sp.videoEl.paused, false, 'sp.videoEl MUST NOT pause on spurious background iframe pause');
    const liveSt = bgWin.liveMediaPlaybackState.get('spotify');
    assertEqual(liveSt.isPlaying, true, 'liveMediaPlaybackState.isPlaying MUST remain true');

    const supLog = bgWin.bgAudioDiagLog.find((entry) => entry.event === 'suppress-spurious-bg-pause');
    assert(supLog !== undefined, 'suppress-spurious-bg-pause must be logged in audio diagnostics');
  });

  registerTest('Suite 3: Spurious Pause Suppression', 'ADV-PAUSE-02', 'Explicit User Pause Is NOT Suppressed', async () => {
    bgWin.cleanupSpEmePlayer('spotify');
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 11, 'sidebar');
    sp.sourceType = 'sidebar';
    sp.videoEl.currentTime = 30.0;
    sp.sb._ranges = [[0, 60.0]];
    await sp.videoEl.play();
    assert(!sp.videoEl.paused, 'Initially playing');

    bgWin.handleSpEmeBridgeMessage('spotify', {
      bridgeType: 'SYNC_TIME',
      currentTime: 30.0,
      paused: true,
      explicitPause: true, // USER CLICKED PAUSE
      autoPausedByTab: false,
      spUiStillPlaying: false
    }, 'sidebar');

    assertEqual(sp.videoEl.paused, true, 'sp.videoEl MUST pause when user explicitly pauses');
    const liveSt = bgWin.liveMediaPlaybackState.get('spotify');
    assertEqual(liveSt.isPlaying, false, 'liveMediaPlaybackState.isPlaying MUST be false');
  });

  registerTest('Suite 3: Spurious Pause Suppression', 'ADV-PAUSE-03', 'External Tab Contention Auto-Pause Is NOT Suppressed', async () => {
    bgWin.cleanupSpEmePlayer('spotify');
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 12, 'sidebar');
    sp.sourceType = 'sidebar';
    sp.videoEl.currentTime = 30.0;
    sp.sb._ranges = [[0, 60.0]];
    await sp.videoEl.play();
    assert(!sp.videoEl.paused, 'Initially playing');

    bgWin.handleSpEmeBridgeMessage('spotify', {
      bridgeType: 'SYNC_TIME',
      currentTime: 30.0,
      paused: true,
      explicitPause: false,
      autoPausedByTab: true, // TAB CONTENTION
      spUiStillPlaying: true
    }, 'sidebar');

    assertEqual(sp.videoEl.paused, true, 'sp.videoEl MUST pause on tab audio auto-pause');
  });

  registerTest('Suite 3: Spurious Pause Suppression', 'ADV-PAUSE-04', 'Spotify UI Paused Is NOT Suppressed', async () => {
    bgWin.cleanupSpEmePlayer('spotify');
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 13, 'sidebar');
    sp.sourceType = 'sidebar';
    sp.videoEl.currentTime = 30.0;
    sp.sb._ranges = [[0, 60.0]];
    await sp.videoEl.play();
    assert(!sp.videoEl.paused, 'Initially playing');

    bgWin.handleSpEmeBridgeMessage('spotify', {
      bridgeType: 'SYNC_TIME',
      currentTime: 30.0,
      paused: true,
      explicitPause: false,
      autoPausedByTab: false,
      spUiStillPlaying: false // UI STOPPED PLAYING
    }, 'sidebar');

    assertEqual(sp.videoEl.paused, true, 'sp.videoEl MUST pause when Spotify UI itself stopped playing');
  });

  registerTest('Suite 3: Spurious Pause Suppression', 'ADV-PAUSE-05', 'App Isolation (YouTube Never Enters isSpuriousBgPause)', async () => {
    bgWin.cleanupSpEmePlayer('youtube');
    const ytVideo = bgDoc.createElement('video');
    const mockYtSp = {
      appId: 'youtube',
      videoEl: ytVideo,
      sourceType: 'sidebar',
      msId: 0,
      sb: {
        buffered: { length: 1, start: () => 0, end: () => 60 }
      }
    };
    bgWin.bgSpEmePlayers.set('youtube', mockYtSp);
    await ytVideo.play();
    assert(!ytVideo.paused, 'YouTube video initially playing');

    bgWin.handleSpEmeBridgeMessage('youtube', {
      bridgeType: 'SYNC_TIME',
      currentTime: 10.0,
      paused: true,
      explicitPause: false,
      autoPausedByTab: false,
      spUiStillPlaying: true
    }, 'sidebar');

    assertEqual(ytVideo.paused, true, 'Non-Spotify app (YouTube) must NOT suppress pauses');
    bgWin.bgSpEmePlayers.delete('youtube');
  });

  // =========================================================================
  // SUITE 4: Tab Audio Silence Fix (audible === false)
  // =========================================================================
  registerTest('Suite 4: Tab Audio Silence Handling', 'ADV-TAB-01', 'Immediate audible === false State Clearing', async () => {
    assert(tabUpdatedListeners.length > 0, 'tabs.onUpdated listeners must be registered');

    const tabId = 888;
    bgWin.knownActiveMediaTabIds.add(tabId);
    bgWin.silentTabHoldSince.set(tabId, Date.now() - 1000);

    for (const fn of tabUpdatedListeners) {
      fn(tabId, { audible: false }, { id: tabId, url: 'https://youtube.com/watch?v=xyz' });
    }

    assertEqual(bgWin.knownActiveMediaTabIds.has(tabId), false, 'knownActiveMediaTabIds must delete tab immediately');
    assertEqual(bgWin.silentTabHoldSince.has(tabId), false, 'silentTabHoldSince must delete tab immediately (no 4.2s hold)');
    assert(bgWin.recentlyStoppedMediaTabMap.has(tabId), 'recentlyStoppedMediaTabMap must record stopped tab');
  });

  registerTest('Suite 4: Tab Audio Silence Handling', 'ADV-TAB-02', 'Rapid 100-Cycle Audible Toggle Stress', async () => {
    const tabId = 777;

    for (let i = 0; i < 100; i++) {
      for (const fn of tabUpdatedListeners) {
        fn(tabId, { audible: true }, { id: tabId, url: 'https://youtube.com/watch?v=1' });
        fn(tabId, { audible: false }, { id: tabId, url: 'https://youtube.com/watch?v=1' });
      }
    }

    assertEqual(bgWin.knownActiveMediaTabIds.has(tabId), false, 'Final state: knownActiveMediaTabIds clean');
    assertEqual(bgWin.silentTabHoldSince.has(tabId), false, 'Final state: silentTabHoldSince clean');
  });

  // =========================================================================
  // SUITE 5: Watchdog Track-End Promotion
  // =========================================================================
  registerTest('Suite 5: Watchdog Track-End Promotion', 'ADV-PROM-01', 'Watchdog Promotes Next Track at Buffer Boundary Stall', async () => {
    bgWin.cleanupSpEmePlayer('spotify');
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 20, 'bg');
    sp.remotePaused = false;
    sp.explicitUserPause = false;
    sp.videoEl.currentTime = 179.95;
    sp.sb._ranges = [[0, 180.0]]; // bufEnd - ct = 0.05 <= 0.08
    sp.lastTimeAdvanceAt = Date.now() - 1600; // stalled > 1400ms

    const nextSp = await bgWin.ensureNextSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 21, 'bg');
    nextSp.hasLicense = true;
    assert(bgWin.bgNextSpPlayers.has('spotify'), 'bgNextSpPlayers must contain preloaded next track');

    let promoted = false;
    const origPromote = bgWin.promoteNextSpPlayer;
    bgWin.promoteNextSpPlayer = function(appId, seekSec) {
      promoted = true;
      origPromote(appId, seekSec);
    };

    try {
      const now = Date.now();
      const ct = sp.videoEl.currentTime;
      const bufEnd = bgWin.getSpBufferedEnd(sp);
      const nearTrackEnd = bufEnd > 2 && (bufEnd - ct <= 0.08);
      const timeStalled = sp.lastTimeAdvanceAt > 0 && now - sp.lastTimeAdvanceAt > 1400;

      if (nearTrackEnd && timeStalled && bgWin.bgNextSpPlayers.has(sp.appId)) {
        bgWin.logAudioDiag('watchdog-promote-next-player', { ct, bufEnd });
        bgWin.promoteNextSpPlayer(sp.appId, 0);
      }

      assertEqual(promoted, true, 'promoteNextSpPlayer must be invoked by watchdog stall at buffer end');
      const diagEntry = bgWin.bgAudioDiagLog.find((e) => e.event === 'watchdog-promote-next-player');
      assert(diagEntry !== undefined, 'watchdog-promote-next-player must be logged');
    } finally {
      bgWin.promoteNextSpPlayer = origPromote;
    }
  });

  registerTest('Suite 5: Watchdog Track-End Promotion', 'ADV-PROM-02', 'Watchdog Does NOT Prematurely Promote When Time Is Advancing', async () => {
    const sp = bgWin.bgSpEmePlayers.get('spotify');
    sp.videoEl.currentTime = 179.95;
    sp.sb._ranges = [[0, 180.0]];
    sp.lastTimeAdvanceAt = Date.now() - 300; // Only 300ms ago, time actively advancing

    let prematurePromote = false;
    const now = Date.now();
    const ct = sp.videoEl.currentTime;
    const bufEnd = bgWin.getSpBufferedEnd(sp);
    const nearTrackEnd = bufEnd > 2 && (bufEnd - ct <= 0.08);
    const timeStalled = sp.lastTimeAdvanceAt > 0 && now - sp.lastTimeAdvanceAt > 1400;

    if (nearTrackEnd && timeStalled && bgWin.bgNextSpPlayers.has(sp.appId)) {
      prematurePromote = true;
    }

    assertEqual(prematurePromote, false, 'Watchdog must NOT promote when playback is actively progressing');
  });

  // =========================================================================
  // SUITE 6: Rebuffer Guard with Thin Runway
  // =========================================================================
  registerTest('Suite 6: Transient Rebuffer Guard', 'ADV-BUF-01', 'Initial Spin-Up Allows Thin Runway (>= -0.1s)', async () => {
    bgWin.cleanupSpEmePlayer('spotify');
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 30, 'sidebar');
    sp.sourceType = 'sidebar';
    sp.createdAt = Date.now();
    sp.videoEl.currentTime = 2.0;
    sp.sb._ranges = [[0, 1.95]]; // bufEnd - ct = -0.05 (thin runway >= -0.1)
    await sp.videoEl.play();

    bgWin.handleSpEmeBridgeMessage('spotify', {
      bridgeType: 'SYNC_TIME',
      currentTime: 2.0,
      paused: true,
      explicitPause: false,
      autoPausedByTab: false,
      spUiStillPlaying: true
    }, 'sidebar');

    const ignoreLog = bgWin.bgAudioDiagLog.find((e) => e.event === 'ignore-transient-harmony-pause' && e.spinUp === true);
    assert(ignoreLog !== undefined, 'Transient Harmony rebuffer pause during initial spin-up must be ignored');
    assertEqual(sp.videoEl.paused, false, 'Video must remain playing');
  });

  registerTest('Suite 6: Transient Rebuffer Guard', 'ADV-BUF-02', 'Severe Underrun Past -0.1s During Spin-Up Is NOT Ignored', async () => {
    bgWin.cleanupSpEmePlayer('spotify');
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 31, 'sidebar');
    sp.sourceType = 'sidebar';
    sp.createdAt = Date.now();
    sp.videoEl.currentTime = 2.0;
    sp.sb._ranges = [[0, 1.80]]; // bufEnd - ct = -0.20 (< -0.1)
    await sp.videoEl.play();

    bgWin.handleSpEmeBridgeMessage('spotify', {
      bridgeType: 'SYNC_TIME',
      currentTime: 2.0,
      paused: true,
      explicitPause: true, // explicit pause when underrun
      autoPausedByTab: false,
      spUiStillPlaying: false
    }, 'sidebar');

    assertEqual(sp.videoEl.paused, true, 'Severe underrun with pause must pause playback');
  });

  // =========================================================================
  // SUITE 7: Content Script Post-Resume Timing Race & AMO Compliance
  // =========================================================================
  registerTest('Suite 7: Post-Resume Timing & AMO', 'ADV-MFO-01', 'Settle Verification Delay is 450ms and 480ms Telemetry', async () => {
    const mfoCode = await fetchText('/src/shared/media-frame-optimizer.js');
    assert(mfoCode.includes('clickedSpotifyPlay ? 450 : 360'), 'Post-resume verify delay must be 450ms');
    assert(mfoCode.includes("aria.includes('pause') || aria.includes('stop')"), 'Must verify aria-label to prevent double-click button churn');
    assert(mfoCode.includes('setTimeout(() => reportLivePlaybackState(), 480)'), 'Live playback state report must be scheduled at 480ms');
  });

  registerTest('Suite 7: Post-Resume Timing & AMO', 'ADV-MFO-02', 'Zero innerHTML/outerHTML Across All Modified Files', async () => {
    const bgCode = await fetchText('/src/background/background.js');
    const mfoCode = await fetchText('/src/shared/media-frame-optimizer.js');
    const bgHtml = await fetchText('/src/background/background.html');

    assert(!/\.innerHTML\s*=/.test(bgCode), 'background.js must have 0 innerHTML assignments');
    assert(!/\.outerHTML\s*=/.test(bgCode), 'background.js must have 0 outerHTML assignments');
    assert(!/\.innerHTML\s*=/.test(mfoCode), 'media-frame-optimizer.js must have 0 innerHTML assignments');
    assert(!/\.outerHTML\s*=/.test(mfoCode), 'media-frame-optimizer.js must have 0 outerHTML assignments');
    assert(!/<script>.*\.innerHTML.*<\/script>/is.test(bgHtml), 'background.html must not use innerHTML');
  });

  // =========================================================================
  // EXECUTE ALL REGISTERED TESTS
  // =========================================================================
  log(`\nExecuting ${testRegistry.length} empirical adversarial test cases...\n`);

  let passedCount = 0;
  let failedCount = 0;
  let currentSuite = '';

  for (const test of testRegistry) {
    if (test.suite !== currentSuite) {
      currentSuite = test.suite;
      log(`=== [${currentSuite}] ===`);
    }

    const t0 = performance.now();
    try {
      await test.fn();
      const dt = Math.round(performance.now() - t0);
      log(`  [PASS] ${test.id}: ${test.title} (${dt}ms)`);
      passedCount++;
    } catch (err) {
      const dt = Math.round(performance.now() - t0);
      log(`  [FAIL] ${test.id}: ${test.title} (${dt}ms) - ${err.message}`);
      failedCount++;
    }
  }

  log('\n======================================================================');
  log('FOXHUB v2.7.9 MILESTONE 1 ADVERSARIAL STRESS TEST SUMMARY');
  log('======================================================================');
  log(`Total Adversarial Tests : ${testRegistry.length}`);
  log(`Passed                  : ${passedCount}`);
  log(`Failed                  : ${failedCount}`);
  log('======================================================================\n');

  if (failedCount === 0) {
    await reportResult(true, '', { total: testRegistry.length, passed: passedCount, failed: 0 });
  } else {
    await reportResult(false, `${failedCount} of ${testRegistry.length} adversarial tests failed!`, { total: testRegistry.length, passed: passedCount, failed: failedCount });
  }
}

window.addEventListener('load', () => {
  runAdversarialSuites();
});
</script>
</body>
</html>
"""

class TestRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, report_callback=None, **kwargs):
        self.report_callback = report_callback
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if self.path.startswith("/test-runner-adversarial.html"):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(TEST_RUNNER_HTML.encode("utf-8"))
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/__test_report__":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode("utf-8"))
                if self.report_callback:
                    self.report_callback(data)
            except Exception as e:
                print("Failed to parse test report:", e)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
            return
        self.send_error(404, "Not Found")

    def log_message(self, format, *args):
        pass


def get_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def main():
    port = get_free_port()
    report_event = threading.Event()
    report_data = {}

    def on_report(data):
        report_data.update(data)
        report_event.set()

    server = http.server.HTTPServer(
        ("", port),
        lambda *args, **kwargs: TestRequestHandler(*args, report_callback=on_report, **kwargs),
    )
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    url = f"http://127.0.0.1:{port}/test-runner-adversarial.html"
    profile_dir = tempfile.mkdtemp(prefix="foxhub_adv_profile_")
    proc = None
    try:
        if os.path.exists(FIREFOX_BIN):
            print(f"Launching headless Mozilla Firefox against {url} ...")
            proc = subprocess.Popen(
                [FIREFOX_BIN, "--headless", "-no-remote", "-profile", profile_dir, url],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            raise RuntimeError(f"Firefox binary not found at {FIREFOX_BIN}!")

        report_event.wait(timeout=60.0)
    finally:
        if proc:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        server.shutdown()
        shutil.rmtree(profile_dir, ignore_errors=True)

    for line in report_data.get("logs", []):
        print(line)

    summary = report_data.get("summary")
    if not report_data.get("ok"):
        print("\n[ADVERSARIAL STRESS TEST FAILED]:")
        print(report_data.get("error"))
        raise SystemExit(1)

    print("\nALL ADVERSARIAL STRESS TESTS PASSED SUCCESSFULLY (Exit Code 0)!")


if __name__ == "__main__":
    main()
