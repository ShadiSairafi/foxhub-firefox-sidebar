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
  <title>FoxHub Milestone 3 Adversarial Challenge Suite (Tier 5)</title>
</head>
<body>
<div id="frames"></div>
<script>
const logs = [];
function log(msg) {
  console.log(msg);
  logs.push(String(msg));
  try {
    fetch('/__log__', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: String(msg)
    }).catch(() => {});
  } catch (_) {}
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
    log('[REPORT] Reporting result: ok=' + ok + (errorText ? (' error=' + errorText) : ''));
    await fetch('/__test_report__', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok, error: errorText, logs, summary })
    });
  } catch (e) {
    console.error('[REPORT ERROR]', e);
  }
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
  try {
    log('======================================================================');
    log('FOXHUB v2.7.9 — MILESTONE 3 EMPIRICAL ADVERSARIAL CHALLENGE SUITE');
    log('Tier 5 White-Box Stress Testing: Background Architecture Hardening');
    log('Real SpiderMonkey JavaScript Engine inside Headless Mozilla Firefox');
    log('======================================================================');

    // Mount Background Frame
    const bgFrame = await createSubFrame('bg-adv-m3-frame');
    const bgWin = bgFrame.contentWindow;
    const bgDoc = bgFrame.contentDocument;

    // Deterministic Timer Interceptors
    const origSetInterval = bgWin.setInterval.bind(bgWin);
    bgWin.setInterval = function (fn, ms, ...args) {
      if (ms === 400) {
        bgWin.__heartbeatBroadcastFn = fn;
      } else if (ms === 450) {
        bgWin.__watchdogFn = fn;
      }
      return origSetInterval(fn, ms, ...args);
    };

    const origSetTimeout = bgWin.setTimeout.bind(bgWin);
    bgWin.setTimeout = function (fn, ms, ...args) {
      if (ms === 340) {
        bgWin.__tabResumeDebounceFn = fn;
      }
      return origSetTimeout(fn, ms, ...args);
    };

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
    const tabActivatedListeners = [];
    const tabRemovedListeners = [];
    const alarmsCreated = [];
    const alarmListeners = [];
    const runtimeBroadcasts = [];

    let mockTabs = [
      { id: 10, windowId: 1, audible: false, mutedInfo: { muted: false }, url: 'https://mail.google.com/' }
    ];
    const tabMediaActiveMap = new Map(); // tabId -> boolean

    const origBgCreateElement = bgDoc.createElement.bind(bgDoc);
    bgDoc.createElement = function (tag) {
      const t = String(tag || '').toLowerCase();
      const el = origBgCreateElement(tag);
      if (t === 'video' || t === 'audio') {
        let _paused = true;
        let _currentTime = 0;
        let _ended = false;
        let _muted = false;
        let _volume = 1.0;
        let _playbackRate = 1.0;
        Object.defineProperty(el, 'paused', {
          get() { return _paused; },
          set(v) { _paused = Boolean(v); }
        });
        Object.defineProperty(el, 'muted', {
          get() { return _muted; },
          set(v) { _muted = Boolean(v); }
        });
        Object.defineProperty(el, 'volume', {
          get() { return _volume; },
          set(v) { _volume = Number(v); }
        });
        Object.defineProperty(el, 'playbackRate', {
          get() { return _playbackRate; },
          set(v) { _playbackRate = Number(v); }
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
        async query(q) {
          if (q && q.audible === true) {
            return mockTabs.filter((t) => t.audible === true);
          }
          return [...mockTabs];
        },
        async get(tid) {
          const found = mockTabs.find((t) => t.id === tid);
          if (!found) throw new Error('No tab ' + tid);
          return found;
        },
        async sendMessage(tid, msg) {
          if (msg && msg.type === 'CHECK_TAB_HAS_ACTIVE_MEDIA') {
            return { hasActiveMedia: Boolean(tabMediaActiveMap.get(tid)) };
          }
          return null;
        },
        onUpdated: { addListener(fn) { tabUpdatedListeners.push(fn); } },
        onActivated: { addListener(fn) { tabActivatedListeners.push(fn); } },
        onRemoved: { addListener(fn) { tabRemovedListeners.push(fn); } }
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
;window.currentSettings = currentSettings;
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
;window.audibleOverrideTabIds = audibleOverrideTabIds;
;window.tabAutoPausedSpAppIds = tabAutoPausedSpAppIds;
;window.checkExternalTabAudioState = checkExternalTabAudioState;
;window.getTabAudioBehavior = getTabAudioBehavior;
;window.isTabAutoPauseEnforced = isTabAutoPauseEnforced;
;window.getSpBufferedEnd = getSpBufferedEnd;
;window.syncSpInstanceTimeAndPlay = syncSpInstanceTimeAndPlay;
;window.ensureBgWebAudioKeepalive = ensureBgWebAudioKeepalive;
;window.getBgWebAudioKeepaliveCtx = () => bgWebAudioKeepaliveCtx;
;window.setBgWebAudioKeepaliveCtx = (v) => { bgWebAudioKeepaliveCtx = v; };
;window.getBgWebAudioGainNode = () => bgWebAudioGainNode;
;window.getBgWebAudioOscNode = () => bgWebAudioOscNode;
;window.handleSpEmeBridgeMessage = handleSpEmeBridgeMessage;
;window.cleanupSpEmePlayer = cleanupSpEmePlayer;
;window.disposeSpPlayerInstance = disposeSpPlayerInstance;
;window.promoteNextSpPlayer = promoteNextSpPlayer;
;window.pauseAllForTabAudioAutoPause = pauseAllForTabAudioAutoPause;
;window.resumeAllFromTabAudioAutoPause = resumeAllFromTabAudioAutoPause;
;window.buildAudioDiagnosticsSnapshot = buildAudioDiagnosticsSnapshot;
;window.logAudioDiag = logAudioDiag;
;window.refreshBgAudioIndicator = refreshBgAudioIndicator;
;window.isExternalBrowserTab = isExternalBrowserTab;
;window.setActiveLoginWindowId = (v) => { activeLoginWindowId = v; };
;window.companionWindowIds = companionWindowIds;
;window.activeLoginWindowId = activeLoginWindowId;
;window.getIsAutoPausedByTabAudio = () => isAutoPausedByTabAudio;
;window.setIsAutoPausedByTabAudio = (v) => { isAutoPausedByTabAudio = v; };
;window.getManualOverrideWhileTabAudible = () => manualOverrideWhileTabAudible;
;window.setManualOverrideWhileTabAudible = (v) => { manualOverrideWhileTabAudible = v; };
;window.getHeartbeatBroadcastCount = () => heartbeatBroadcastCount;
;window.getLastHeartbeatBroadcastAt = () => lastHeartbeatBroadcastAt;
;window.getAlarmWakePulseCount = () => alarmWakePulseCount;
;window.getLastAlarmWakePulseAt = () => lastAlarmWakePulseAt;

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
`;

    bgWin.eval(backgroundCode + '\n' + bgExports);
    bgWin.eval('sidebarPortCount = 1;');

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
    // SUITE 1: TAB AUDIO STATE MACHINE & SILENCE DETECTION RACES
    // =========================================================================

    registerTest('Suite 1: Tab Audio State Machine', 'ADV-M3-TAB-01', 'Tab Audio Behavior Mode Transitions (pause-resume -> pause-only -> off -> pause-resume)', async () => {
      const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 10, 'bg');
      sp.hasLicense = true;
      sp.remotePaused = false;
      sp.explicitUserPause = false;
      sp.autoPausedByTab = false;
      sp.videoEl.currentTime = 10.0;
      sp.sb._ranges = [[0, 60.0]];
      await sp.videoEl.play();

      // 1. Mode is pause-resume
      bgWin.currentSettings.tabAudioBehavior = 'pause-resume';
      bgWin.currentSettings.autoPauseOnTabAudio = true;

      // External tab 20 becomes audible
      const tab20 = { id: 20, windowId: 1, audible: true, mutedInfo: { muted: false }, url: 'https://youtube.com/watch?v=1' };
      mockTabs = [tab20];
      tabUpdatedListeners[0](20, { audible: true }, tab20);
      await bgWin.checkExternalTabAudioState();

      assertEqual(bgWin.getIsAutoPausedByTabAudio(), true, 'Must auto-pause when external tab plays in pause-resume');
      assertEqual(sp.autoPausedByTab, true, 'sp.autoPausedByTab must be true');
      assertEqual(sp.videoEl.paused, true, 'videoEl must be paused');

      // External tab 20 goes silent
      tab20.audible = false;
      mockTabs = [tab20];
      tabUpdatedListeners[0](20, { audible: false }, tab20);
      await bgWin.checkExternalTabAudioState();

      // Trigger captured debounce
      if (bgWin.__tabResumeDebounceFn) {
        bgWin.__tabResumeDebounceFn();
        bgWin.__tabResumeDebounceFn = null;
      }

      assertEqual(bgWin.getIsAutoPausedByTabAudio(), false, 'Auto-pause clears');
      assertEqual(sp.videoEl.paused, false, 'Spotify resumes playing in pause-resume mode');

      // 2. Mode is pause-only
      bgWin.currentSettings.tabAudioBehavior = 'pause-only';
      const tab21 = { id: 21, windowId: 1, audible: true, mutedInfo: { muted: false }, url: 'https://youtube.com/watch?v=2' };
      mockTabs = [tab21];
      tabUpdatedListeners[0](21, { audible: true }, tab21);
      await bgWin.checkExternalTabAudioState();

      assertEqual(bgWin.getIsAutoPausedByTabAudio(), true, 'Must auto-pause when external tab plays in pause-only');
      assertEqual(sp.explicitUserPause, true, 'sp.explicitUserPause must be true in pause-only mode');
      assertEqual(sp.autoPausedByTab, false, 'sp.autoPausedByTab must be false in pause-only mode');
      assertEqual(sp.videoEl.paused, true, 'videoEl must be paused');

      // External tab 21 goes silent -> stays stopped in pause-only mode
      tab21.audible = false;
      mockTabs = [tab21];
      tabUpdatedListeners[0](21, { audible: false }, tab21);
      await bgWin.checkExternalTabAudioState();

      assertEqual(bgWin.getIsAutoPausedByTabAudio(), false, 'Trigger flag clears with stayStopped=true');
      assertEqual(sp.videoEl.paused, true, 'videoEl must REMAIN paused in pause-only mode');
      assertEqual(sp.explicitUserPause, true, 'sp.explicitUserPause remains true');

      // 3. Switch mode to off
      bgWin.currentSettings.tabAudioBehavior = 'off';
      bgWin.currentSettings.autoPauseOnTabAudio = false;
      await bgWin.checkExternalTabAudioState();

      // External tab plays while mode is off -> Spotify ignores external tab
      const tab22 = { id: 22, windowId: 1, audible: true, mutedInfo: { muted: false }, url: 'https://youtube.com/watch?v=3' };
      mockTabs = [tab22];
      tabUpdatedListeners[0](22, { audible: true }, tab22);
      await bgWin.checkExternalTabAudioState();

      assertEqual(bgWin.getIsAutoPausedByTabAudio(), false, 'Must never auto-pause when mode is off');
      assertEqual(bgWin.knownActiveMediaTabIds.size, 0, 'knownActiveMediaTabIds must stay empty in off mode');

      // Restore to pause-resume and reset tabs
      bgWin.currentSettings.tabAudioBehavior = 'pause-resume';
      bgWin.currentSettings.autoPauseOnTabAudio = true;
      mockTabs = [];
      await bgWin.checkExternalTabAudioState();
    });

    registerTest('Suite 1: Tab Audio State Machine', 'ADV-M3-TAB-02', 'Silence Detection 4.2-second Hold & Expiration Race', async () => {
      const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 11, 'bg');
      sp.hasLicense = true;
      sp.remotePaused = false;
      sp.explicitUserPause = false;
      sp.videoEl.currentTime = 15.0;
      sp.sb._ranges = [[0, 60.0]];
      await sp.videoEl.play();

      // External tab 30 becomes audible
      const tab30 = { id: 30, windowId: 1, audible: true, mutedInfo: { muted: false }, url: 'https://youtube.com/watch?v=quiet' };
      mockTabs = [tab30];
      tabMediaActiveMap.set(30, true);
      tabUpdatedListeners[0](30, { audible: true }, tab30);
      await bgWin.checkExternalTabAudioState();

      assertEqual(bgWin.knownActiveMediaTabIds.has(30), true, 'Tab 30 tracked in active media');
      assertEqual(bgWin.getIsAutoPausedByTabAudio(), true, 'Spotify auto-paused');

      // Tab 30 temporarily drops audible: false (quiet intro/scene)
      tab30.audible = false;
      mockTabs = [tab30];
      await bgWin.checkExternalTabAudioState();

      assert(bgWin.silentTabHoldSince.has(30), 'Silent tab hold must be initiated for tab 30');
      assertEqual(bgWin.getIsAutoPausedByTabAudio(), true, 'Spotify must remain paused during silent hold');

      // Simulate hold expiration: wind back hold start time past 4200ms
      const holdStart = bgWin.silentTabHoldSince.get(30);
      bgWin.silentTabHoldSince.set(30, holdStart - 4500);

      await bgWin.checkExternalTabAudioState();

      // Verify hold expired and tab was deleted
      assertEqual(bgWin.knownActiveMediaTabIds.has(30), false, 'Tab 30 must be evicted on hold expiration');
      assertEqual(bgWin.silentTabHoldSince.has(30), false, 'silentTabHoldSince must be cleared');

      const expiredEntry = bgWin.bgAudioDiagLog.find((e) => e.event === 'tab-hold-expired' && e.tabId === 30);
      assert(expiredEntry !== undefined, 'tab-hold-expired must be logged');

      // Trigger captured debounce
      if (bgWin.__tabResumeDebounceFn) {
        bgWin.__tabResumeDebounceFn();
        bgWin.__tabResumeDebounceFn = null;
      }

      assertEqual(bgWin.getIsAutoPausedByTabAudio(), false, 'Spotify must auto-resume after debounce');
      assertEqual(sp.videoEl.paused, false, 'Spotify videoEl must be playing');

      tabMediaActiveMap.delete(30);
    });

    registerTest('Suite 1: Tab Audio State Machine', 'ADV-M3-TAB-03', 'CHECK_TAB_HAS_ACTIVE_MEDIA Messaging & Fast Eviction', async () => {
      // 1. Tab reports activeMedia: false -> immediate eviction without 4.2s wait
      const tab40 = { id: 40, windowId: 1, audible: false, mutedInfo: { muted: false }, url: 'https://vimeo.com/123' };
      mockTabs = [tab40];
      bgWin.knownActiveMediaTabIds.add(40);
      tabMediaActiveMap.set(40, false);

      await bgWin.checkExternalTabAudioState();
      assertEqual(bgWin.knownActiveMediaTabIds.has(40), false, 'Tab 40 must be evicted immediately when activeMedia is false');

      // 2. Tab with no media active mapping
      const tab41 = { id: 41, windowId: 1, audible: false, mutedInfo: { muted: false }, url: 'https://site.com' };
      mockTabs = [tab41];
      bgWin.knownActiveMediaTabIds.add(41);
      tabMediaActiveMap.delete(41);

      await bgWin.checkExternalTabAudioState();
      assertEqual(bgWin.knownActiveMediaTabIds.has(41), false, 'Tab 41 must be evicted cleanly');

      tabMediaActiveMap.delete(40);
    });

    registerTest('Suite 1: Tab Audio State Machine', 'ADV-M3-TAB-04', 'External Tab Closure & Navigation Cleanup Races', async () => {
      const tab50 = { id: 50, windowId: 1, audible: true, mutedInfo: { muted: false }, url: 'https://twitch.tv/stream' };
      mockTabs = [tab50];
      bgWin.knownActiveMediaTabIds.add(50);
      bgWin.recentlyStoppedMediaTabMap.set(50, Date.now());
      bgWin.audibleOverrideTabIds.add(50);

      // Tab closed
      tabRemovedListeners[0](50);
      assertEqual(bgWin.knownActiveMediaTabIds.has(50), false, 'onRemoved must delete from knownActiveMediaTabIds');
      assertEqual(bgWin.recentlyStoppedMediaTabMap.has(50), false, 'onRemoved must delete from recentlyStoppedMediaTabMap');
      assertEqual(bgWin.audibleOverrideTabIds.has(50), false, 'onRemoved must delete from audibleOverrideTabIds');

      // Tab 51 navigates to new URL while playing
      const tab51 = { id: 51, windowId: 1, audible: true, mutedInfo: { muted: false }, url: 'https://example.com/new' };
      mockTabs = [tab51];
      bgWin.knownActiveMediaTabIds.add(51);
      for (const fn of tabUpdatedListeners) fn(51, { status: 'loading', url: 'https://example.com/new' }, tab51);
      assertEqual(bgWin.knownActiveMediaTabIds.has(51), false, 'Navigation loading must evict tab 51');

      // Tab 52 muted
      const tab52 = { id: 52, windowId: 1, audible: true, mutedInfo: { muted: true }, url: 'https://example.com/muted' };
      mockTabs = [tab52];
      bgWin.knownActiveMediaTabIds.add(52);
      for (const fn of tabUpdatedListeners) fn(52, { mutedInfo: { muted: true } }, tab52);
      assertEqual(bgWin.knownActiveMediaTabIds.has(52), false, 'Muting tab must evict tab 52');
    });

    registerTest('Suite 1: Tab Audio State Machine', 'ADV-M3-TAB-05', 'Manual Play Override While Tab Audible & Multi-Tab Contention', async () => {
      const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 12, 'bg');
      sp.hasLicense = true;
      sp.remotePaused = false;
      sp.videoEl.currentTime = 10.0;
      sp.sb._ranges = [[0, 60.0]];
      await sp.videoEl.play();

      // External tab 101 becomes audible -> Spotify pauses
      const tab101 = { id: 101, windowId: 1, audible: true, mutedInfo: { muted: false }, url: 'https://youtube.com/a' };
      mockTabs = [tab101];
      for (const fn of tabUpdatedListeners) fn(101, { audible: true }, tab101);
      await bgWin.checkExternalTabAudioState();
      assertEqual(bgWin.getIsAutoPausedByTabAudio(), true, 'Spotify auto-paused by tab 101');

      // User manually clicks Play in Spotify
      bgWin.setManualOverrideWhileTabAudible(true);
      bgWin.audibleOverrideTabIds.add(101);
      await bgWin.checkExternalTabAudioState();

      // Trigger debounce
      if (bgWin.__tabResumeDebounceFn) {
        bgWin.__tabResumeDebounceFn();
        bgWin.__tabResumeDebounceFn = null;
      }
      assertEqual(bgWin.getIsAutoPausedByTabAudio(), false, 'Spotify resumes playing under user override for tab 101');

      // Second external tab 102 becomes audible -> clears override and pauses Spotify
      const tab102 = { id: 102, windowId: 1, audible: true, mutedInfo: { muted: false }, url: 'https://youtube.com/b' };
      mockTabs = [tab101, tab102];
      for (const fn of tabUpdatedListeners) fn(102, { audible: true }, tab102);
      await bgWin.checkExternalTabAudioState();
      assertEqual(bgWin.getIsAutoPausedByTabAudio(), true, 'Tab 102 must pause Spotify');
      assertEqual(bgWin.getManualOverrideWhileTabAudible(), false, 'New audible tab must reset manual override');
      assertEqual(bgWin.audibleOverrideTabIds.size, 0, 'New audible tab must clear override tab IDs');

      // Tab 102 stops playing -> tab 101 is still audible (unoverridden), so Spotify stays paused
      tab102.audible = false;
      for (const fn of tabUpdatedListeners) fn(102, { audible: false }, tab102);
      mockTabs = [tab101];
      await bgWin.checkExternalTabAudioState();
      assertEqual(bgWin.getIsAutoPausedByTabAudio(), true, 'Spotify stays paused while tab 101 remains audible');

      // Tab 101 stops playing -> all tabs quiet -> Spotify resumes!
      tab101.audible = false;
      for (const fn of tabUpdatedListeners) fn(101, { audible: false }, tab101);
      mockTabs = [];
      await bgWin.checkExternalTabAudioState();
      if (bgWin.__tabResumeDebounceFn) {
        bgWin.__tabResumeDebounceFn();
        bgWin.__tabResumeDebounceFn = null;
      }
      assertEqual(bgWin.getIsAutoPausedByTabAudio(), false, 'Spotify resumes when all external tabs silence');
    });

    registerTest('Suite 1: Tab Audio State Machine', 'ADV-M3-TAB-06', 'Rapid 50-Iteration High-Concurrency Tab Flapping', async () => {
      for (let i = 0; i < 50; i++) {
        const tabId = 200 + (i % 5);
        const isAudible = (i % 2) === 0;
        const tab = { id: tabId, windowId: 1, audible: isAudible, mutedInfo: { muted: false }, url: 'https://fast.com' };
        tabUpdatedListeners[0](tabId, { audible: isAudible }, tab);
      }
      mockTabs = [];
      await bgWin.checkExternalTabAudioState();
      if (bgWin.__tabResumeDebounceFn) {
        bgWin.__tabResumeDebounceFn();
        bgWin.__tabResumeDebounceFn = null;
      }

      assertEqual(bgWin.getIsAutoPausedByTabAudio(), false, 'Must settle cleanly to unpaused when all tabs quiet');
    });

    registerTest('Suite 1: Tab Audio State Machine', 'ADV-M3-TAB-07', 'Window & Protocol Exclusions (Companion, Login, Extension)', async () => {
      bgWin.companionWindowIds.add(999);
      bgWin.setActiveLoginWindowId(888);

      const tCompanion = { id: 301, windowId: 999, audible: true, mutedInfo: { muted: false }, url: 'https://site.com' };
      assertEqual(bgWin.isExternalBrowserTab(tCompanion), false, 'Companion window tab must NOT be external tab');

      const tLogin = { id: 302, windowId: 888, audible: true, mutedInfo: { muted: false }, url: 'https://accounts.google.com' };
      assertEqual(bgWin.isExternalBrowserTab(tLogin), false, 'Login window tab must NOT be external tab');

      const tExt = { id: 303, windowId: 1, audible: true, mutedInfo: { muted: false }, url: 'moz-extension://foxhub-uuid/popup.html' };
      assertEqual(bgWin.isExternalBrowserTab(tExt), false, 'moz-extension tab must NOT be external tab');

      const tMuted = { id: 304, windowId: 1, audible: true, mutedInfo: { muted: true }, url: 'https://site.com' };
      assertEqual(bgWin.isExternalBrowserTab(tMuted), false, 'Muted tab must NOT be external tab');

      const tGen = { id: 305, windowId: 1, audible: true, mutedInfo: { muted: false }, url: 'https://spotify.com' };
      assertEqual(bgWin.isExternalBrowserTab(tGen), true, 'Standard external tab must be external tab');

      bgWin.companionWindowIds.delete(999);
      bgWin.setActiveLoginWindowId(null);
    });

    // =========================================================================
    // SUITE 2: PLAYER PROMOTION & DUAL-IFRAME LIFECYCLE
    // =========================================================================

    registerTest('Suite 2: Player Promotion & Lifecycle', 'ADV-M3-PROM-01', 'Dual-Iframe Track Advancement & Buffer Handoff', async () => {
      const sp1 = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 21, 'bg');
      sp1.hasLicense = true;
      sp1.desiredVolume = 0.85;
      sp1.desiredMuted = false;
      sp1.trackTitle = 'Track 1';
      await sp1.videoEl.play();

      const sp2 = await bgWin.ensureNextSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 22, 'sidebar');
      sp2.hasLicense = true;
      sp2.trackTitle = 'Track 2';
      sp2.isNextPreload = true;

      assertEqual(bgWin.bgSpEmePlayers.get('spotify'), sp1, 'sp1 is active player');
      assertEqual(bgWin.bgNextSpPlayers.get('spotify'), sp2, 'sp2 is next player');

      const promoted = bgWin.promoteNextSpPlayer('spotify', 0);
      assertEqual(promoted, true, 'promoteNextSpPlayer must return true');

      assertEqual(bgWin.bgSpEmePlayers.get('spotify'), sp2, 'sp2 must now be active player');
      assertEqual(bgWin.bgNextSpPlayers.has('spotify'), false, 'bgNextSpPlayers must be cleared');
      assertEqual(sp2.isNextPreload, false, 'sp2 isNextPreload must be false');
      assertEqual(sp2.desiredVolume, 0.85, 'sp2 must inherit desiredVolume');
      assertEqual(sp1.disposed, true, 'sp1 must be cleanly disposed');

      const diag = bgWin.bgAudioDiagLog.find((e) => e.event === 'promote-next-track');
      assert(diag !== undefined, 'promote-next-track must be logged in ring buffer');
    });

    registerTest('Suite 2: Player Promotion & Lifecycle', 'ADV-M3-PROM-02', 'Watchdog Track-End Promotion Boundary Conditions', async () => {
      const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 23, 'bg');
      sp.hasLicense = true;
      sp.trackDuration = 180;
      sp.videoEl.currentTime = 179.6;
      sp.sb._ranges = [[0, 180.0]];
      sp.remotePaused = false;
      sp.explicitUserPause = false;
      await sp.videoEl.play();

      const nextSp = await bgWin.ensureNextSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 24, 'bg');
      nextSp.hasLicense = true;

      // 1. Stalled only 1000ms (< 1400ms threshold) -> Watchdog should NOT promote
      sp.lastTimeAdvanceAt = Date.now() - 1000;
      if (bgWin.__watchdogFn) bgWin.__watchdogFn();
      assertEqual(bgWin.bgSpEmePlayers.get('spotify'), sp, 'Should not promote when stalled < 1400ms');

      // 2. Stalled 1500ms (> 1400ms threshold) -> Watchdog MUST promote
      sp.lastTimeAdvanceAt = Date.now() - 1500;
      if (bgWin.__watchdogFn) bgWin.__watchdogFn();
      assertEqual(bgWin.bgSpEmePlayers.get('spotify'), nextSp, 'Watchdog promotion executed past 1400ms');
    });

    registerTest('Suite 2: Player Promotion & Lifecycle', 'ADV-M3-PROM-03', 'Promotion While Auto-Pause Enforced', async () => {
      bgWin.setIsAutoPausedByTabAudio(true);
      bgWin.currentSettings.tabAudioBehavior = 'pause-resume';
      assertEqual(bgWin.isTabAutoPauseEnforced(), true, 'Auto-pause enforced');

      const nextSp = await bgWin.ensureNextSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 25, 'bg');
      nextSp.hasLicense = true;

      bgWin.promoteNextSpPlayer('spotify', 0);

      assertEqual(nextSp.remotePaused, true, 'Promoted player remotePaused must be true under auto-pause');
      assertEqual(nextSp.autoPausedByTab, true, 'Promoted player autoPausedByTab must be true');
      assertEqual(nextSp.videoEl.muted, true, 'Promoted player videoEl must be muted');
      assertEqual(nextSp.videoEl.paused, true, 'Promoted player videoEl must be paused');

      bgWin.setIsAutoPausedByTabAudio(false);
    });

    registerTest('Suite 2: Player Promotion & Lifecycle', 'ADV-M3-PROM-04', 'Idempotent Promotion & Disposed Next Player Resilience', async () => {
      bgWin.bgNextSpPlayers.delete('spotify');
      const p1 = bgWin.promoteNextSpPlayer('spotify', 0);
      assertEqual(p1, false, 'Must return false when next player does not exist');

      const spDisposed = { disposed: true, appId: 'spotify' };
      bgWin.bgNextSpPlayers.set('spotify', spDisposed);
      const p2 = bgWin.promoteNextSpPlayer('spotify', 0);
      assertEqual(p2, false, 'Must return false when next player is disposed');

      const nextSp = await bgWin.ensureNextSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 26, 'bg');
      nextSp.hasLicense = true;

      const r1 = bgWin.promoteNextSpPlayer('spotify', 0);
      const r2 = bgWin.promoteNextSpPlayer('spotify', 0);
      const r3 = bgWin.promoteNextSpPlayer('spotify', 0);

      assertEqual(r1, true, 'First promotion succeeds');
      assertEqual(r2, false, 'Second promotion returns false');
      assertEqual(r3, false, 'Third promotion returns false');
    });

    registerTest('Suite 2: Player Promotion & Lifecycle', 'ADV-M3-PROM-05', 'Non-Zero Target Time Promotion & Micro-Gap Bridging', async () => {
      const nextSp = await bgWin.ensureNextSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 27, 'bg');
      nextSp.hasLicense = true;

      bgWin.promoteNextSpPlayer('spotify', 72.5);

      assertEqual(nextSp.targetTime, 72.5, 'targetTime assigned');
      assertEqual(nextSp.pendingSeekTarget, 72.5, 'pendingSeekTarget assigned');
      assert(nextSp.pendingSeekSetAt > 0, 'pendingSeekSetAt assigned');

      nextSp.pendingSeekTarget = 0;
      nextSp.videoEl.currentTime = 10.0;
      nextSp.sb._ranges = [
        [0, 10.0],
        [10.15, 30.0]
      ];
      nextSp.targetTime = 12.0;
      bgWin.syncSpInstanceTimeAndPlay(nextSp, false);

      assertEqual(nextSp.videoEl.currentTime, 10.17, 'Must bridge micro-gap forward to start + 0.02');
    });

    // =========================================================================
    // SUITE 3: BUFFER RUNWAY GUARD, REBUFFER THRESHOLDS & MONOTONIC CLAMPING
    // =========================================================================

    registerTest('Suite 3: Buffer Runway & Clamping', 'ADV-M3-BUF-01', 'Monotonic Playback Head Clamping (Anti-Rewind)', async () => {
      const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 31, 'bg');
      sp.hasLicense = true;
      sp.videoEl.currentTime = 35.0;
      sp.sb._ranges = [[0, 50.0]];
      sp.maxObservedCt = 35.0;

      // Jitter tick with backward currentTime (31.0 < 35.0) without forceSeek/user scrub
      bgWin.handleSpEmeBridgeMessage('spotify', {
        bridgeType: 'SYNC_TIME',
        currentTime: 31.0,
        paused: false,
        forceSeek: false,
        isExplicitUserScrub: false
      }, 'bg');

      assertEqual(sp.videoEl.currentTime, 35.0, 'videoEl.currentTime must NOT jump backwards on ordinary tick');
      assertEqual(sp.maxObservedCt, 35.0, 'maxObservedCt remains unchanged at 35.0');
    });

    registerTest('Suite 3: Buffer Runway & Clamping', 'ADV-M3-BUF-02', 'Explicit User Scrub Override of Monotonic Clamping', async () => {
      const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 32, 'bg');
      sp.hasLicense = true;
      sp.videoEl.currentTime = 45.0;
      sp.sb._ranges = [[0, 60.0]];
      sp.maxObservedCt = 45.0;

      bgWin.handleSpEmeBridgeMessage('spotify', {
        bridgeType: 'SYNC_TIME',
        currentTime: 15.0,
        paused: false,
        forceSeek: true,
        isExplicitUserScrub: true
      }, 'bg');

      assertEqual(sp.videoEl.currentTime, 15.0, 'videoEl.currentTime must seek backwards on explicit user scrub');
      assertEqual(sp.maxObservedCt, 15.0, 'maxObservedCt must be reset to scrub position');
    });

    registerTest('Suite 3: Buffer Runway & Clamping', 'ADV-M3-BUF-03', 'Stale Seek Target Expiration (8.5s Timeout)', async () => {
      const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 33, 'bg');
      sp.hasLicense = true;
      sp.videoEl.currentTime = 20.0;
      sp.sb._ranges = [[0, 25.0]];

      sp.pendingSeekTarget = 80.0;
      sp.pendingSeekSetAt = Date.now() - 9000;

      sp.sb._ranges = [[0, 90.0]];
      bgWin.syncSpInstanceTimeAndPlay(sp, false);

      assertEqual(sp.videoEl.currentTime, 20.0, 'Expired pending seek must NOT execute');
    });

    registerTest('Suite 3: Buffer Runway & Clamping', 'ADV-M3-BUF-04', 'Discard Stale Backward Pending Seek on Buffer Arrival', async () => {
      const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 34, 'bg');
      sp.hasLicense = true;
      sp.videoEl.currentTime = 50.0;
      sp.pendingSeekTarget = 40.0;
      sp.pendingSeekSetAt = Date.now() - 2000;
      sp.pendingSeekIsUserScrub = false;

      sp.sb._ranges = [[30.0, 70.0]];
      bgWin.syncSpInstanceTimeAndPlay(sp, false);

      assertEqual(sp.videoEl.currentTime, 50.0, 'Backward non-user seek must be discarded');
      assertEqual(sp.pendingSeekTarget, 0, 'pendingSeekTarget cleared');

      const discardDiag = bgWin.bgAudioDiagLog.find((e) => e.event === 'discard-stale-pending-seek');
      assert(discardDiag !== undefined, 'discard-stale-pending-seek must be logged');
    });

    registerTest('Suite 3: Buffer Runway & Clamping', 'ADV-M3-BUF-05', 'Transient Harmony Rebuffer Guard Under Thin vs Severely Starved Runway', async () => {
      const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 35, 'bg');
      sp.hasLicense = true;
      sp.remotePaused = false;
      await sp.videoEl.play();

      // Case A: Initial Spin-up with thin runway (-0.05s >= -0.1s)
      sp.videoEl.currentTime = 5.0;
      sp.sb._ranges = [[0, 4.95]];

      bgWin.handleSpEmeBridgeMessage('spotify', {
        bridgeType: 'SYNC_TIME',
        currentTime: 5.0,
        paused: true,
        spUiStillPlaying: true,
        explicitPause: false
      }, 'bg');

      assertEqual(sp.remotePaused, false, 'Thin runway during spin-up must suppress transient pause');
      const ignoreDiag1 = bgWin.bgAudioDiagLog.find((e) => e.event === 'ignore-transient-harmony-pause');
      assert(ignoreDiag1 !== undefined, 'ignore-transient-harmony-pause logged');

      // Case B: Initial Spin-up with severe underrun (-0.25s < -0.1s)
      sp.sb._ranges = [[0, 4.75]];
      bgWin.handleSpEmeBridgeMessage('spotify', {
        bridgeType: 'SYNC_TIME',
        currentTime: 5.0,
        paused: true,
        spUiStillPlaying: true,
        explicitPause: false
      }, 'bg');

      assertEqual(sp.remotePaused, true, 'Severe underrun during spin-up must NOT be suppressed');

      // Case C: Explicit user pause
      sp.remotePaused = false;
      await sp.videoEl.play();
      sp.sb._ranges = [[0, 20.0]];
      bgWin.handleSpEmeBridgeMessage('spotify', {
        bridgeType: 'SYNC_TIME',
        currentTime: 5.0,
        paused: true,
        spUiStillPlaying: false,
        explicitPause: true
      }, 'bg');

      assertEqual(sp.remotePaused, true, 'Explicit user pause must NEVER be suppressed');
    });

    // =========================================================================
    // SUITE 4: 400MS PORT HEARTBEAT & AUTO-RECONNECT LOGIC
    // =========================================================================

    registerTest('Suite 4: 400ms Port Heartbeat', 'ADV-M3-HBEAT-01', '400ms Heartbeat Broadcast to bg:* and sidebar:*', async () => {
      const bgPort = connectMockBridgePort('bg:spotify');
      const sbPort = connectMockBridgePort('sidebar:spotify');
      const ytPort = connectMockBridgePort('bg:youtube');
      const stPort = connectMockBridgePort('standby:spotify');

      const countBefore = bgWin.getHeartbeatBroadcastCount();

      // Trigger captured heartbeat broadcast function directly
      assert(typeof bgWin.__heartbeatBroadcastFn === 'function', 'Heartbeat broadcast function must be registered');
      bgWin.__heartbeatBroadcastFn();

      const countAfter = bgWin.getHeartbeatBroadcastCount();
      assertEqual(countAfter, countBefore + 1, 'Broadcast count must increment by 1');

      assert(bgPort.received.length > 0, 'bg:spotify must receive tick');
      assertEqual(bgPort.received[0].cmd, 'BG_HEARTBEAT_TICK', 'Command must be BG_HEARTBEAT_TICK');
      assert(typeof bgPort.received[0].ts === 'number', 'Timestamp must be numeric');

      assert(sbPort.received.length > 0, 'sidebar:spotify must receive tick');
      assert(ytPort.received.length > 0, 'bg:youtube must receive tick');
      assertEqual(stPort.received.length, 0, 'standby:spotify must NOT receive heartbeat tick');
    });

    registerTest('Suite 4: 400ms Port Heartbeat', 'ADV-M3-HBEAT-02', 'Throwing / Broken Port Detection & Dead Key Eviction', async () => {
      const brokenPort = {
        name: 'bg:broken',
        postMessage() { throw new Error('Port disconnected abruptly'); }
      };
      bgWin.emeBridgePorts.set('bg:broken', brokenPort);
      bgWin.emeBridgePorts.set('sidebar:null_entry', null);

      assert(bgWin.emeBridgePorts.has('bg:broken'), 'bg:broken initially present');
      assert(bgWin.emeBridgePorts.has('sidebar:null_entry'), 'sidebar:null_entry initially present');

      bgWin.__heartbeatBroadcastFn();

      assertEqual(bgWin.emeBridgePorts.has('bg:broken'), false, 'Throwing port must be evicted');
      assertEqual(bgWin.emeBridgePorts.has('sidebar:null_entry'), false, 'Null port must be evicted');
    });

    // =========================================================================
    // SUITE 5: WEB AUDIO KEEPALIVE CONTEXT & ALARMS
    // =========================================================================

    registerTest('Suite 5: Web Audio Keepalive & Alarms', 'ADV-M3-KEEP-01', 'AudioContext Gain Clamping & Oscillator Parameters', async () => {
      const ctx = bgWin.ensureBgWebAudioKeepalive();
      assert(ctx !== null, 'Keepalive context must exist');

      const gainNode = bgWin.getBgWebAudioGainNode();
      assert(gainNode !== null, 'GainNode exists');
      assert(Math.abs(gainNode.gain.value - 1e-5) < 1e-9, 'Gain clamped to 1e-5');

      const osc = bgWin.getBgWebAudioOscNode();
      assert(osc !== null, 'Oscillator exists');
      assertEqual(osc.frequency.value, 440, 'Oscillator frequency 440 Hz');
    });

    registerTest('Suite 5: Web Audio Keepalive & Alarms', 'ADV-M3-KEEP-02', 'Periodic Alarm Wake Pulse Dispatch & Metric Increment', async () => {
      const alarmListener = alarmListeners[0];
      assert(typeof alarmListener === 'function', 'Alarm listener exists');

      const pulseCountBefore = bgWin.getAlarmWakePulseCount();

      alarmListener({ name: 'foxhub-audio-keepalive' });

      const pulseCountAfter = bgWin.getAlarmWakePulseCount();
      assertEqual(pulseCountAfter, pulseCountBefore + 1, 'Wake pulse count must increment by 1');
      assert(bgWin.getLastAlarmWakePulseAt() > 0, 'lastAlarmWakePulseAt must be recorded');
    });

    // =========================================================================
    // SUITE 6: AUDIO DIAGNOSTICS RING BUFFER & SNAPSHOT CONTRACT
    // =========================================================================

    registerTest('Suite 6: Diagnostics & Snapshot', 'ADV-M3-DIAG-01', 'Ring Buffer Max Limit (200 Entries) & Strict FIFO Under 1000 Bursts', async () => {
      for (let i = 0; i < 1000; i++) {
        bgWin.logAudioDiag(`burst-event-${i}`, { seq: i });
      }

      assertEqual(bgWin.bgAudioDiagLog.length, 200, 'Ring buffer length must be capped at 200');

      assertEqual(bgWin.bgAudioDiagLog[0].seq, 800, 'Oldest retained event must be seq 800');
      assertEqual(bgWin.bgAudioDiagLog[199].seq, 999, 'Newest retained event must be seq 999');
    });

    registerTest('Suite 6: Diagnostics & Snapshot', 'ADV-M3-DIAG-02', 'Audio Diagnostics Snapshot Schema & Resilience', async () => {
      const snapshot = bgWin.buildAudioDiagnosticsSnapshot();

      assertEqual(snapshot.version, '2.7.9', 'Snapshot version must be 2.7.9');
      assert(typeof snapshot.generatedAt === 'string', 'generatedAt timestamp exists');
      assert(typeof snapshot.tabAudioBehavior === 'string', 'tabAudioBehavior exists');
      assert(typeof snapshot.isAutoPausedByTabAudio === 'boolean', 'isAutoPausedByTabAudio boolean');
      assert(typeof snapshot.tabAudioHoldDown === 'object' && snapshot.tabAudioHoldDown !== null, 'tabAudioHoldDown object');
      assert(Array.isArray(snapshot.tabAudioHoldDown.silentTabHolds), 'silentTabHolds is array');
      assert(Array.isArray(snapshot.tabAudioHoldDown.recentlyStoppedTabs), 'recentlyStoppedTabs is array');
      assert(typeof snapshot.keepalive === 'object', 'keepalive metrics object');
      assert(typeof snapshot.keepalive.alarmWakePulseCount === 'number', 'alarmWakePulseCount exists');
      assert(typeof snapshot.keepalive.heartbeatBroadcastCount === 'number', 'heartbeatBroadcastCount exists');
      assert(Array.isArray(snapshot.recentEvents), 'recentEvents is array');
      assert(snapshot.recentEvents.length <= 150, 'recentEvents capped at 150');
    });

    // =========================================================================
    // EXECUTION LOOP
    // =========================================================================

    let passedCount = 0;
    let failedCount = 0;
    let currentSuite = '';

    for (const test of testRegistry) {
      if (test.suite !== currentSuite) {
        currentSuite = test.suite;
        log(`\n=== [${currentSuite}] ===`);
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
    log('FOXHUB v2.7.9 MILESTONE 3 ADVERSARIAL STRESS TEST SUMMARY');
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
  } catch (err) {
    log('CRITICAL ERROR in runAdversarialSuites: ' + (err && err.stack ? err.stack : err));
    await reportResult(false, 'CRITICAL ERROR: ' + (err && err.stack ? err.stack : err));
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
        if self.path.startswith("/test-runner-adversarial-m3.html"):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(TEST_RUNNER_HTML.encode("utf-8"))
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/__log__":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8", errors="replace")
            print(f"[BROWSER] {body}", flush=True)
            self.send_response(200)
            self.end_headers()
            return
        if self.path == "/__test_report__":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode("utf-8"))
                if self.report_callback:
                    self.report_callback(data)
            except Exception as e:
                print("Failed to parse test report:", e, flush=True)
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

    url = f"http://127.0.0.1:{port}/test-runner-adversarial-m3.html"
    profile_dir = tempfile.mkdtemp(prefix="foxhub_adv_m3_profile_")
    proc = None
    try:
        if os.path.exists(FIREFOX_BIN):
            print(f"Launching headless Mozilla Firefox against {url} ...", flush=True)
            proc = subprocess.Popen(
                [FIREFOX_BIN, "--headless", "-no-remote", "-profile", profile_dir, url],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            raise RuntimeError(f"Firefox binary not found at {FIREFOX_BIN}!")

        if not report_event.wait(timeout=30.0):
            print("TIMEOUT WAITING FOR TEST REPORT (30s)!", flush=True)
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

    summary = report_data.get("summary")
    if not report_data.get("ok"):
        print("\n[ADVERSARIAL STRESS TEST FAILED]:", flush=True)
        print(report_data.get("error"), flush=True)
        raise SystemExit(1)

    print("\nALL MILESTONE 3 ADVERSARIAL STRESS TESTS PASSED SUCCESSFULLY (Exit Code 0)!", flush=True)


if __name__ == "__main__":
    main()
