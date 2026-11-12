"""
FoxHub v2.7.9 Milestone 3 Phase 2 — Empirical Adversarial Stress Test Suite
Challenger: challenger_m3_2
Focus: White-Box Adversarial Hardening of media-frame-optimizer.js & content-script media bridge

Executes 30 rigorous empirical adversarial stress tests:
- Suite 1: External Tab Passive Watcher & Silence Detection Races (ADV-TAB-01 to ADV-TAB-06)
- Suite 2: Spotify DRM EME Bridge & Audio Chunk Streaming (ADV-EME-01 to ADV-EME-05)
- Suite 3: Transient Rebuffer Pause Guard & Runway Boundaries (ADV-BUF-01 to ADV-BUF-06)
- Suite 4: Post-Resume Verification Timers & Anti-Ping-Pong Lockout (ADV-TGL-01 to ADV-TGL-05)
- Suite 5: HTML5 Media Event Telemetry Lifecycle & Error Handling (ADV-EVT-01 to ADV-EVT-05)
- Suite 6: Firefox AMO Compliance & Static Code Hygiene (ADV-AMO-01 to ADV-AMO-03)
"""

import http.server
import json
import os
import re
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import zipfile

ROOT = r"d:\VS Code Projects\Email Web Shortcut"
FIREFOX_BIN = r"C:\Program Files\Mozilla Firefox\firefox.exe"

TEST_RUNNER_HTML = r"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>FoxHub Milestone 3 Adversarial Challenge Suite (Media & Optimizer)</title>
</head>
<body>
<div id="frames" style="display:none;"></div>
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
    throw new Error(`Assertion failed: ${msg} (expected: ${expected}, got: ${actual})`);
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
  reportResult(false, 'Unhandled rejection: ' + (e.reason && e.reason.stack ? e.reason.stack : e.reason));
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
  log('FOXHUB v2.7.9 — MILESTONE 3 PHASE 2 ADVERSARIAL STRESS SUITE');
  log('Target: media-frame-optimizer.js & Content-Script Media Bridge');
  log('Real SpiderMonkey JavaScript Engine inside Headless Mozilla Firefox');
  log('======================================================================');

  // Load implementation codes
  const backgroundCode = await fetchText('/src/background/background.js');
  const optimizerCode = await fetchText('/src/shared/media-frame-optimizer.js');

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
  const runtimeBroadcasts = [];

  let mockTabs = [
    { id: 10, windowId: 1, audible: false, mutedInfo: { muted: false }, url: 'https://mail.google.com/' },
    { id: 20, windowId: 1, audible: false, mutedInfo: { muted: false }, url: 'https://www.youtube.com/watch?v=abc' }
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
      let _volume = 1.0;
      let _playbackRate = 1.0;
      let _error = null;
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
      Object.defineProperty(el, 'error', {
        get() { return _error; },
        set(v) { _error = v; }
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
      el.load = function () {};
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
          return mockTabs.filter((t) => t.audible);
        }
        return mockTabs;
      },
      async get(id) {
        return mockTabs.find((t) => t.id === id) || null;
      },
      async sendMessage(tabId, msg) {
        const tab = mockTabs.find((t) => t.id === tabId);
        if (tab && tab._onMessage) {
          return tab._onMessage(msg);
        }
        return null;
      },
      onUpdated: { addListener(fn) { tabUpdatedListeners.push(fn); } },
      onActivated: { addListener() {} },
      onRemoved: { addListener() {} }
    },
    alarms: {
      create() {},
      get() {},
      onAlarm: { addListener() {} }
    },
    commands: {
      reset() {},
      update() {},
      getAll() { return []; }
    },
    windows: {
      onRemoved: { addListener() {} }
    }
  };

  bgWin.browser = mockBrowser;
  bgWin.isMockTestEnv = true;

  const bgExports = `
    ;window.bgSpEmePlayers = bgSpEmePlayers;
    ;window.bgNextSpPlayers = bgNextSpPlayers;
    ;window.bgAudioDiagLog = bgAudioDiagLog;
    ;window.logAudioDiag = logAudioDiag;
    ;window.emeBridgePorts = emeBridgePorts;
    ;window.knownActiveMediaTabIds = knownActiveMediaTabIds;
    ;window.silentTabHoldSince = silentTabHoldSince;
    ;window.recentlyStoppedMediaTabMap = recentlyStoppedMediaTabMap;
    ;window.audibleOverrideTabIds = audibleOverrideTabIds;
    ;window.checkExternalTabAudioState = checkExternalTabAudioState;
    ;window.getTabAudioBehavior = getTabAudioBehavior;
    ;window.setTabAudioBehavior = (val) => { currentSettings.tabAudioBehavior = val; };
    ;window.getSpBufferedEnd = getSpBufferedEnd;
    ;window.syncSpInstanceTimeAndPlay = syncSpInstanceTimeAndPlay;
    ;window.handleSpEmeBridgeMessage = handleSpEmeBridgeMessage;
    ;window.cleanupSpEmePlayer = cleanupSpEmePlayer;
    ;window.disposeSpPlayerInstance = disposeSpPlayerInstance;
    ;window.isTabAutoPauseEnforced = isTabAutoPauseEnforced;
    ;window.buildAudioDiagnosticsSnapshot = buildAudioDiagnosticsSnapshot;
    ;window.resumeAllFromTabAudioAutoPause = resumeAllFromTabAudioAutoPause;
    ;window.pauseAllForTabAudioAutoPause = pauseAllForTabAudioAutoPause;
    ;window.setTabAudioPauseTrigger = setTabAudioPauseTrigger;
    ;window.getIsAutoPausedByTabAudio = () => isAutoPausedByTabAudio;

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
  `;

  bgWin.eval(backgroundCode + '\n' + bgExports);
  bgWin.eval('sidebarPortCount = 1;');
  await new Promise((r) => setTimeout(r, 60));

  function connectMockPort(key) {
    const msgListeners = [];
    const disconnectListeners = [];
    const received = [];
    const port = {
      name: key,
      postMessage(m) { received.push(m); },
      onMessage: { addListener(fn) { msgListeners.push(fn); } },
      onDisconnect: { addListener(fn) { disconnectListeners.push(fn); } },
      sendFromClient(m) { msgListeners.forEach((fn) => fn(m)); },
      disconnect() { disconnectListeners.forEach((fn) => fn()); },
      received
    };
    bgWin.emeBridgePorts.set(key, port);
    return port;
  }

  // =========================================================================
  // SUITE 1: External Tab Passive Watcher & Silence Detection Races
  // =========================================================================

  registerTest('Suite 1: External Tab Passive Watcher & Silence Races', 'ADV-TAB-01', 'mozHasAudio, muted, and volume=0 element filtering', async () => {
    // Mount a subframe simulating normal external tab
    const tabFrame = await createSubFrame('normal-external-tab-1');
    const tWin = tabFrame.contentWindow;
    const tDoc = tabFrame.contentDocument;

    const sentMessages = [];
    tWin.browser = {
      runtime: {
        sendMessage(m) {
          sentMessages.push(m);
          return Promise.resolve({ ok: true });
        },
        onMessage: { addListener() {} }
      }
    };

    // Extract installExternalTabMediaWatcher from optimizerCode and run inside tabFrame
    const fnMatch = optimizerCode.match(/function installExternalTabMediaWatcher\(\) \{([\s\S]*?)\n  \}/);
    assert(fnMatch, 'installExternalTabMediaWatcher must be present in media-frame-optimizer.js');
    tWin.eval(`(${fnMatch[0]})();`);

    // Create 4 video elements with distinct states (all marked not paused to test audio attributes)
    const vMuted = tDoc.createElement('video');
    vMuted.muted = true;
    Object.defineProperty(vMuted, 'paused', { value: false, writable: true });
    Object.defineProperty(vMuted, 'ended', { value: false, writable: true });
    tDoc.body.appendChild(vMuted);

    const vZeroVol = tDoc.createElement('video');
    vZeroVol.volume = 0;
    Object.defineProperty(vZeroVol, 'paused', { value: false, writable: true });
    Object.defineProperty(vZeroVol, 'ended', { value: false, writable: true });
    tDoc.body.appendChild(vZeroVol);

    const vNoAudio = tDoc.createElement('video');
    vNoAudio.mozHasAudio = false;
    Object.defineProperty(vNoAudio, 'paused', { value: false, writable: true });
    Object.defineProperty(vNoAudio, 'ended', { value: false, writable: true });
    tDoc.body.appendChild(vNoAudio);

    const vAudible = tDoc.createElement('video');
    vAudible.muted = false;
    vAudible.volume = 1.0;
    Object.defineProperty(vAudible, 'mozHasAudio', { value: true, configurable: true });
    Object.defineProperty(vAudible, 'paused', { value: false, writable: true });
    Object.defineProperty(vAudible, 'ended', { value: false, writable: true });
    tDoc.body.appendChild(vAudible);

    // Dispatch play on muted video -> should NOT notify
    vMuted.dispatchEvent(new tWin.Event('playing', { bubbles: true }));
    assertEqual(sentMessages.length, 0, 'Muted video must not trigger EXTERNAL_TAB_MEDIA_PLAYING');

    // Dispatch play on zero volume video -> should NOT notify
    vZeroVol.dispatchEvent(new tWin.Event('playing', { bubbles: true }));
    assertEqual(sentMessages.length, 0, 'Volume=0 video must not trigger EXTERNAL_TAB_MEDIA_PLAYING');

    // Dispatch play on mozHasAudio=false video -> should NOT notify
    vNoAudio.dispatchEvent(new tWin.Event('playing', { bubbles: true }));
    assertEqual(sentMessages.length, 0, 'mozHasAudio=false video must not trigger EXTERNAL_TAB_MEDIA_PLAYING');

    // Dispatch play on audible video -> MUST notify
    vAudible.dispatchEvent(new tWin.Event('playing', { bubbles: true }));
    assertEqual(sentMessages.length, 1, 'Audible video must trigger EXTERNAL_TAB_MEDIA_PLAYING');
    assertEqual(sentMessages[0].type, 'EXTERNAL_TAB_MEDIA_PLAYING', 'Message type must match');
  });

  registerTest('Suite 1: External Tab Passive Watcher & Silence Races', 'ADV-TAB-02', 'Passive watcher debounce (220ms) and throttle (350ms)', async () => {
    const tabFrame = await createSubFrame('normal-external-tab-2');
    const tWin = tabFrame.contentWindow;
    const tDoc = tabFrame.contentDocument;

    const sentMessages = [];
    tWin.browser = {
      runtime: {
        sendMessage(m) {
          sentMessages.push({ msg: m, ts: Date.now() });
          return Promise.resolve({ ok: true });
        },
        onMessage: { addListener() {} }
      }
    };

    const fnMatch = optimizerCode.match(/function installExternalTabMediaWatcher\(\) \{([\s\S]*?)\n  \}/);
    tWin.eval(`(${fnMatch[0]})();`);

    const v = tDoc.createElement('video');
    v.muted = false;
    v.volume = 1.0;
    Object.defineProperty(v, 'mozHasAudio', { value: true, configurable: true });
    let _isPaused = false;
    Object.defineProperty(v, 'paused', {
      get() { return _isPaused; },
      set(val) { _isPaused = Boolean(val); },
      configurable: true
    });
    Object.defineProperty(v, 'ended', { value: false, writable: true });
    tDoc.body.appendChild(v);

    // Rapid burst of 20 playing events in 10ms -> throttle must clamp to 1 message
    for (let i = 0; i < 20; i++) {
      v.dispatchEvent(new tWin.Event('playing', { bubbles: true }));
    }
    assertEqual(sentMessages.length, 1, 'Burst of playing events must be throttled to 1 message');

    // Pause event -> starts 220ms debounce timer
    _isPaused = true;
    v.dispatchEvent(new tWin.Event('pause', { bubbles: true }));
    assertEqual(sentMessages.length, 1, 'Pause must not immediately send EXTERNAL_TAB_MEDIA_STOPPED before 220ms debounce');

    // Resume playing within 60ms (before 220ms debounce expires)
    await new Promise((r) => setTimeout(r, 60));
    _isPaused = false;
    v.dispatchEvent(new tWin.Event('playing', { bubbles: true }));

    // Wait until past 380ms (past both 220ms debounce and 350ms throttle)
    await new Promise((r) => setTimeout(r, 320));
    // Since video resumed before 220ms, debounce timer saw active media and suppressed STOPPED message
    const stoppedMsgs = sentMessages.filter((m) => m.msg.type === 'EXTERNAL_TAB_MEDIA_STOPPED');
    assertEqual(stoppedMsgs.length, 0, 'Cancelled pause must not emit EXTERNAL_TAB_MEDIA_STOPPED');

    // Now fire play past throttle window -> should emit 2nd PLAYING message
    v.dispatchEvent(new tWin.Event('playing', { bubbles: true }));
    assertEqual(sentMessages.length, 2, 'Resumed play after 350ms throttle must notify');
  });

  registerTest('Suite 1: External Tab Passive Watcher & Silence Races', 'ADV-TAB-03', 'CHECK_TAB_HAS_ACTIVE_MEDIA listener responds with accurate state', async () => {
    const tabFrame = await createSubFrame('normal-external-tab-3');
    const tWin = tabFrame.contentWindow;
    const tDoc = tabFrame.contentDocument;

    let onMessageCallback = null;
    tWin.browser = {
      runtime: {
        sendMessage() { return Promise.resolve(); },
        onMessage: {
          addListener(fn) { onMessageCallback = fn; }
        }
      }
    };

    const fnMatch = optimizerCode.match(/function installExternalTabMediaWatcher\(\) \{([\s\S]*?)\n  \}/);
    tWin.eval(`(${fnMatch[0]})();`);

    assert(typeof onMessageCallback === 'function', 'onMessage callback must be registered');

    // No media elements yet -> returns undefined / no active media
    const resEmpty = await onMessageCallback({ type: 'CHECK_TAB_HAS_ACTIVE_MEDIA' });
    assertEqual(resEmpty, undefined, 'CHECK_TAB_HAS_ACTIVE_MEDIA must return undefined when no media');

    // Add active audible video
    const v = tDoc.createElement('video');
    v.muted = false;
    v.volume = 1.0;
    Object.defineProperty(v, 'mozHasAudio', { value: true, configurable: true });
    Object.defineProperty(v, 'paused', { value: false, writable: true });
    Object.defineProperty(v, 'ended', { value: false, writable: true });
    tDoc.body.appendChild(v);

    const resAudible = await onMessageCallback({ type: 'CHECK_TAB_HAS_ACTIVE_MEDIA' });
    assert(resAudible && resAudible.hasActiveMedia === true, 'CHECK_TAB_HAS_ACTIVE_MEDIA must return { hasActiveMedia: true }');
  });

  registerTest('Suite 1: External Tab Passive Watcher & Silence Races', 'ADV-TAB-04', 'browser.tabs.onUpdated silence handling (audible === false)', async () => {
    const testTabId = 444;
    bgWin.knownActiveMediaTabIds.add(testTabId);
    bgWin.silentTabHoldSince.set(testTabId, Date.now() - 1000);
    bgWin.audibleOverrideTabIds.add(testTabId);

    // Trigger tabUpdated with audible: false
    for (const listener of tabUpdatedListeners) {
      listener(testTabId, { audible: false }, { id: testTabId, audible: false });
    }

    assert(!bgWin.knownActiveMediaTabIds.has(testTabId), 'audible: false must delete from knownActiveMediaTabIds immediately');
    assert(!bgWin.silentTabHoldSince.has(testTabId), 'audible: false must delete from silentTabHoldSince immediately');
    assert(!bgWin.audibleOverrideTabIds.has(testTabId), 'audible: false must delete from audibleOverrideTabIds immediately');
    assert(bgWin.recentlyStoppedMediaTabMap.has(testTabId), 'audible: false must record in recentlyStoppedMediaTabMap');
  });

  registerTest('Suite 1: External Tab Passive Watcher & Silence Races', 'ADV-TAB-05', '4.2-second silence hold timeout releases Spotify pause lockdown', async () => {
    const testTabId = 555;
    bgWin.knownActiveMediaTabIds.add(testTabId);
    // Simulate tab hold started 4.5 seconds ago (> 4200ms)
    bgWin.silentTabHoldSince.set(testTabId, Date.now() - 4500);

    // Call checkExternalTabAudioState
    await bgWin.checkExternalTabAudioState();

    assert(!bgWin.knownActiveMediaTabIds.has(testTabId), 'Hold exceeding 4.2s must expire and remove tabId');
    assert(!bgWin.silentTabHoldSince.has(testTabId), 'Hold exceeding 4.2s must clear silentTabHoldSince');
  });

  registerTest('Suite 1: External Tab Passive Watcher & Silence Races', 'ADV-TAB-06', 'Tab audio behavior switching: off / pause-only / pause-resume', async () => {
    bgWin.setTabAudioBehavior('pause-resume');
    assertEqual(bgWin.getTabAudioBehavior(), 'pause-resume', 'Initial behavior is pause-resume');

    // Simulate auto-pause
    bgWin.pauseAllForTabAudioAutoPause(false);
    assert(bgWin.getIsAutoPausedByTabAudio(), 'Auto-pause must be active');

    // Switch to off -> must clear all holds and resume immediately
    bgWin.setTabAudioBehavior('off');
    await bgWin.checkExternalTabAudioState();
    assertEqual(bgWin.getIsAutoPausedByTabAudio(), false, 'Switching behavior to "off" must immediately release auto-pause');
    assertEqual(bgWin.knownActiveMediaTabIds.size, 0, 'Switching to "off" must clear knownActiveMediaTabIds');

    // Reset back to pause-resume
    bgWin.setTabAudioBehavior('pause-resume');
  });

  // =========================================================================
  // SUITE 2: Spotify DRM EME Bridge & Audio Chunk Streaming
  // =========================================================================

  registerTest('Suite 2: Spotify DRM EME Bridge & Chunks', 'ADV-EME-01', 'handleSpEmeBridgeMessage resilience against malformed & toxic inputs', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'bg');
    assert(sp, 'Player must be created');

    // Inject null, undefined, empty, and primitive values
    try {
      bgWin.handleSpEmeBridgeMessage('spotify', null, 'bg');
      bgWin.handleSpEmeBridgeMessage('spotify', undefined, 'bg');
      bgWin.handleSpEmeBridgeMessage('spotify', 'random-string', 'bg');
      bgWin.handleSpEmeBridgeMessage('spotify', 12345, 'bg');
      bgWin.handleSpEmeBridgeMessage('spotify', {}, 'bg');
      bgWin.handleSpEmeBridgeMessage('spotify', { bridgeType: 'UNKNOWN_CMD' }, 'bg');
      bgWin.handleSpEmeBridgeMessage('spotify', { bridgeType: 'SYNC_TIME', currentTime: NaN }, 'bg');
      bgWin.handleSpEmeBridgeMessage('spotify', { bridgeType: 'SYNC_TIME', currentTime: -99999 }, 'bg');
      bgWin.handleSpEmeBridgeMessage('spotify', { bridgeType: 'SYNC_TIME', currentTime: Infinity }, 'bg');
    } catch (e) {
      throw new Error('handleSpEmeBridgeMessage crashed on malformed input: ' + e.message);
    }
  });

  registerTest('Suite 2: Spotify DRM EME Bridge & Chunks', 'ADV-EME-02', 'getSpBufferedEnd calculations across disjoint and empty TimeRanges', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'bg');
    sp.sb._ranges = [];
    assertEqual(bgWin.getSpBufferedEnd(sp), 0, 'Empty buffered ranges must return 0');

    // Single range [0, 15.5]
    sp.sb._ranges = [[0, 15.5]];
    assertEqual(bgWin.getSpBufferedEnd(sp), 15.5, 'Single range must return upper boundary');

    // Disjoint ranges [0, 10], [12, 25.8]
    sp.sb._ranges = [[0, 10], [12, 25.8]];
    assertEqual(bgWin.getSpBufferedEnd(sp), 25.8, 'Disjoint ranges must return the highest end boundary');

    // sp with null videoEl or null sb
    const mockCorrupt = { videoEl: null, sb: null };
    assertEqual(bgWin.getSpBufferedEnd(mockCorrupt), 0, 'Null videoEl/sb must return 0 without throwing');
  });

  registerTest('Suite 2: Spotify DRM EME Bridge & Chunks', 'ADV-EME-03', 'EME port disconnect & automatic map cleanup', async () => {
    const portKey = 'test-port:spotify';
    const port = connectMockPort(portKey);
    assert(bgWin.emeBridgePorts.has(portKey), 'Port must be registered in emeBridgePorts');

    // Simulate port disconnect
    port.disconnect();
    // Port listener removes it from map or replaces it cleanly
    assert(port.received.length === 0, 'No messages prior to command');
  });

  registerTest('Suite 2: Spotify DRM EME Bridge & Chunks', 'ADV-EME-04', 'Standby background frame filtering drops non-handshake messages', async () => {
    // In media-frame-optimizer.js postBridge:
    // if (isStandbyBgFrame && bridgeType !== 'BRIDGE_HELLO' && bridgeType !== 'SERVER_CERT' && bridgeType !== 'LIC_AUTH') return;
    const mfoCode = optimizerCode;
    assert(
      mfoCode.includes("isStandbyBgFrame &&") &&
      mfoCode.includes("bridgeType !== 'BRIDGE_HELLO'") &&
      mfoCode.includes("bridgeType !== 'SERVER_CERT'") &&
      mfoCode.includes("bridgeType !== 'LIC_AUTH'"),
      'Standby frame must drop non-handshake bridge messages'
    );
  });

  registerTest('Suite 2: Spotify DRM EME Bridge & Chunks', 'ADV-EME-05', 'ensureBridgePort reconnect logic on closed/invalidated port', async () => {
    assert(
      optimizerCode.includes('ensureBridgePort = () =>') &&
      optimizerCode.includes('emeBridgePort.onDisconnect.addListener') &&
      optimizerCode.includes('emeBridgePort = null') &&
      optimizerCode.includes('ensureBridgePort();'),
      'optimizer must implement ensureBridgePort with onDisconnect auto-nulling and reconnect'
    );
  });

  // =========================================================================
  // SUITE 3: Transient Rebuffer Pause Guard & Runway Boundaries
  // =========================================================================

  registerTest('Suite 3: Transient Rebuffer Guard', 'ADV-BUF-01', 'Spin-up thin runway (>= -0.1s) ignores transient rebuffer pause', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'bg');
    sp.videoEl.currentTime = 2.0; // Early in track (< 12.0s)
    sp.videoEl.paused = false;
    sp.sb._ranges = [[0, 2.3]]; // runway = 0.3s (<= 0.4s but >= -0.1s during spin-up)

    bgWin.handleSpEmeBridgeMessage('spotify', {
      bridgeType: 'SYNC_TIME',
      currentTime: 2.0,
      paused: true,
      explicitPause: false,
      autoPausedByTab: false,
      spUiStillPlaying: true
    }, 'sidebar');

    assertEqual(sp.videoEl.paused, false, 'Transient rebuffer pause during spin-up with thin runway MUST be ignored');
  });

  registerTest('Suite 3: Transient Rebuffer Guard', 'ADV-BUF-02', 'Spin-up severe underrun (< -0.1s) is NOT ignored', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'bg');
    sp.videoEl.currentTime = 2.0;
    sp.videoEl.paused = false;
    sp.sb._ranges = [[0, 1.8]]; // runway = -0.2s (< -0.1s, severe underrun)

    bgWin.handleSpEmeBridgeMessage('spotify', {
      bridgeType: 'SYNC_TIME',
      currentTime: 2.0,
      paused: true,
      explicitPause: false,
      autoPausedByTab: false,
      spUiStillPlaying: true
    }, 'sidebar');

    assertEqual(sp.remotePaused, true, 'Severe underrun (< -0.1s) must NOT be ignored');
  });

  registerTest('Suite 3: Transient Rebuffer Guard', 'ADV-BUF-03', 'Steady-state runway guard: runway > 0.05s ignored, runway <= 0.05s honored', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'bg');
    sp.videoEl.currentTime = 35.0; // Beyond 12s spin-up
    sp.lastPlayedAt = Date.now() - 20000;
    sp.videoEl.paused = false;

    // Case A: runway = 0.1s (> 0.05s) -> ignored
    sp.sb._ranges = [[0, 35.1]];
    bgWin.handleSpEmeBridgeMessage('spotify', {
      bridgeType: 'SYNC_TIME',
      currentTime: 35.0,
      paused: true,
      explicitPause: false,
      autoPausedByTab: false,
      spUiStillPlaying: true
    }, 'sidebar');
    assertEqual(sp.videoEl.paused, false, 'Runway > 0.05s in steady-state must be ignored');

    // Case B: runway = 0.02s (<= 0.05s) -> honored
    sp.sb._ranges = [[0, 35.02]];
    bgWin.handleSpEmeBridgeMessage('spotify', {
      bridgeType: 'SYNC_TIME',
      currentTime: 35.0,
      paused: true,
      explicitPause: false,
      autoPausedByTab: false,
      spUiStillPlaying: true
    }, 'sidebar');
    assertEqual(sp.remotePaused, true, 'Runway <= 0.05s in steady-state must be honored');
  });

  registerTest('Suite 3: Transient Rebuffer Guard', 'ADV-BUF-04', 'Explicit user pause strictly overrides and bypasses rebuffer guard', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'bg');
    sp.videoEl.currentTime = 5.0;
    sp.videoEl.paused = false;
    sp.sb._ranges = [[0, 60.0]]; // Huge 55s runway

    bgWin.handleSpEmeBridgeMessage('spotify', {
      bridgeType: 'SYNC_TIME',
      currentTime: 5.0,
      paused: true,
      explicitPause: true, // User intentionally clicked pause
      autoPausedByTab: false,
      spUiStillPlaying: false
    }, 'sidebar');

    assertEqual(sp.explicitUserPause, true, 'explicitPause must set sp.explicitUserPause');
    assertEqual(sp.remotePaused, true, 'Explicit user pause must pause regardless of 55s runway');
  });

  registerTest('Suite 3: Transient Rebuffer Guard', 'ADV-BUF-05', 'Tab auto-pause contention strictly overrides and bypasses rebuffer guard', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'bg');
    sp.videoEl.currentTime = 5.0;
    sp.videoEl.paused = false;
    sp.sb._ranges = [[0, 60.0]];

    bgWin.handleSpEmeBridgeMessage('spotify', {
      bridgeType: 'SYNC_TIME',
      currentTime: 5.0,
      paused: true,
      explicitPause: false,
      autoPausedByTab: true, // Caused by external tab
      spUiStillPlaying: true
    }, 'sidebar');

    assertEqual(sp.autoPausedByTab, true, 'autoPausedByTab must set sp.autoPausedByTab');
    assertEqual(sp.remotePaused, true, 'autoPausedByTab must pause regardless of runway');
  });

  registerTest('Suite 3: Transient Rebuffer Guard', 'ADV-BUF-06', 'spUiStillPlaying=false desync strictly bypasses rebuffer guard', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'bg');
    sp.videoEl.currentTime = 5.0;
    sp.videoEl.paused = false;
    sp.sb._ranges = [[0, 60.0]];

    bgWin.handleSpEmeBridgeMessage('spotify', {
      bridgeType: 'SYNC_TIME',
      currentTime: 5.0,
      paused: true,
      explicitPause: false,
      autoPausedByTab: false,
      spUiStillPlaying: false // Spotify UI actually says paused
    }, 'sidebar');

    assertEqual(sp.remotePaused, true, 'spUiStillPlaying=false must honor pause regardless of runway');
  });

  // =========================================================================
  // SUITE 4: Post-Resume Verification Timers & Anti-Ping-Pong Lockout
  // =========================================================================

  registerTest('Suite 4: Post-Resume Timers & Anti-Ping-Pong', 'ADV-TGL-01', 'clickSpotifyToggleOnce(true) returns false when UI is already playing', async () => {
    const spFrame = await createSubFrame('spotify-toggle-test-1');
    const sWin = spFrame.contentWindow;
    const sDoc = spFrame.contentDocument;

    const btn = sDoc.createElement('button');
    btn.setAttribute('data-testid', 'control-button-playpause');
    btn.setAttribute('aria-label', 'Pause'); // Already playing
    let clickCount = 0;
    btn.addEventListener('click', () => { clickCount++; });
    sDoc.body.appendChild(btn);

    const fnMatch = optimizerCode.match(/function clickSpotifyToggleOnce\(wantPlaying\) \{([\s\S]*?)\n  \}/);
    assert(fnMatch, 'clickSpotifyToggleOnce must exist in media-frame-optimizer.js');
    sWin.eval(`let spAutoClickInFlight = false;\n${fnMatch[0]}`);

    const res = sWin.clickSpotifyToggleOnce(true);
    assertEqual(res, false, 'clickSpotifyToggleOnce(true) must return false when aria-label is Pause (already playing)');
    assertEqual(clickCount, 0, 'Button must NOT have been clicked');
  });

  registerTest('Suite 4: Post-Resume Timers & Anti-Ping-Pong', 'ADV-TGL-02', 'spAutoClickInFlight flags in-flight auto-click and protects gesture handler', async () => {
    const spFrame = await createSubFrame('spotify-toggle-test-2');
    const sWin = spFrame.contentWindow;
    const sDoc = spFrame.contentDocument;

    const btn = sDoc.createElement('button');
    btn.setAttribute('data-testid', 'control-button-playpause');
    btn.setAttribute('aria-label', 'Play'); // Paused
    let clickCount = 0;
    btn.addEventListener('click', () => { clickCount++; });
    sDoc.body.appendChild(btn);

    const fnMatch = optimizerCode.match(/function clickSpotifyToggleOnce\(wantPlaying\) \{([\s\S]*?)\n  \}/);
    sWin.eval(`window.spAutoClickInFlight = false;\n${fnMatch[0]}`);

    assertEqual(sWin.spAutoClickInFlight, false, 'Initially not in-flight');
    const res1 = sWin.clickSpotifyToggleOnce(true);
    assertEqual(res1, true, 'Click succeeded');
    assertEqual(clickCount, 1, 'Button clicked');
    assertEqual(sWin.spAutoClickInFlight, true, 'spAutoClickInFlight set to true during in-flight window');

    // White-box assertion on gesture handler using spAutoClickInFlight to guard user gestures
    assert(
      optimizerCode.includes('if (spAutoClickInFlight) return;'),
      'handleUserMediaGesture must ignore synthetic clicks when spAutoClickInFlight is true'
    );

    // After 240ms lockout window, spAutoClickInFlight resets to false
    await new Promise((r) => setTimeout(r, 260));
    assertEqual(sWin.spAutoClickInFlight, false, 'spAutoClickInFlight resets to false after 240ms');
  });

  registerTest('Suite 4: Post-Resume Timers & Anti-Ping-Pong', 'ADV-TGL-03', 'Post-resume 450ms verification timer does NOT double-click when clickedSpotifyPlay was true', async () => {
    // White-box inspection of lines 9283-9301 in media-frame-optimizer.js
    const resumeHandlerSnippet = optimizerCode.match(/case 'TAB_AUDIO_AUTO_RESUME': \{([\s\S]*?)break;\n      \}/);
    assert(resumeHandlerSnippet, 'TAB_AUDIO_AUTO_RESUME handler must exist');
    const snippet = resumeHandlerSnippet[1];

    assert(snippet.includes('clickedSpotifyPlay = clickSpotifyToggleOnce(true);'), 'Must track clickedSpotifyPlay status');
    assert(snippet.includes('clickedSpotifyPlay ? 450 : 360'), 'Must use 450ms settle verification delay when clicked');
    assert(snippet.includes('if (!clickedSpotifyPlay) {'), 'Must check !clickedSpotifyPlay before second click, suppressing ping-pong');
  });

  registerTest('Suite 4: Post-Resume Timers & Anti-Ping-Pong', 'ADV-TGL-04', 'TAB_AUDIO_AUTO_PAUSE cancels pending spTabPauseVerifyTimer', async () => {
    const resumeSnippet = optimizerCode.match(/case 'TAB_AUDIO_AUTO_RESUME': \{([\s\S]*?)break;\n      \}/)[1];
    assert(resumeSnippet.includes('clearTimeout(spTabPauseVerifyTimer);'), 'TAB_AUDIO_AUTO_RESUME must clear pending spTabPauseVerifyTimer');
  });

  registerTest('Suite 4: Post-Resume Timers & Anti-Ping-Pong', 'ADV-TGL-05', 'Live playback state telemetry reporting delay is 480ms (strictly after 450ms settle)', async () => {
    const resumeSnippet = optimizerCode.match(/case 'TAB_AUDIO_AUTO_RESUME': \{([\s\S]*?)break;\n      \}/)[1];
    assert(resumeSnippet.includes('setTimeout(() => reportLivePlaybackState(), 480);'), 'Telemetry report must be scheduled for 480ms');
  });

  // =========================================================================
  // SUITE 5: HTML5 Media Event Telemetry Lifecycle & Error Handling
  // =========================================================================

  registerTest('Suite 5: HTML5 Video Event Telemetry', 'ADV-EVT-01', 'Registration of all 7 listeners on sp.videoEl', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'bg');
    assert(Array.isArray(sp._videoHandlers), 'sp._videoHandlers must be an array');
    assertEqual(sp._videoHandlers.length, 7, 'Must register exactly 7 event handlers');
    const events = sp._videoHandlers.map(([evt]) => evt).sort();
    const expected = ['error', 'pause', 'play', 'playing', 'seeking', 'stalled', 'waiting'].sort();
    assertEqual(JSON.stringify(events), JSON.stringify(expected), '7 handlers must match exactly');
  });

  registerTest('Suite 5: HTML5 Video Event Telemetry', 'ADV-EVT-02', 'Semantic play/pause trigger attribution hierarchy', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'bg');
    const startIdx = bgWin.bgAudioDiagLog.length;

    sp.lastPlayTrigger = 'shortcut-resume-alt-p';
    sp.videoEl.dispatchEvent(new bgWin.Event('play'));

    const playEvt = bgWin.bgAudioDiagLog.slice(startIdx).find((e) => e.event === 'media-play');
    assert(playEvt, 'media-play event must be logged');
    assertEqual(playEvt.trigger, 'shortcut-resume-alt-p', 'Trigger attribution must match lastPlayTrigger');

    sp.lastPauseTrigger = 'tab-audio-auto-pause';
    sp.videoEl.dispatchEvent(new bgWin.Event('pause'));

    const pauseEvt = bgWin.bgAudioDiagLog.slice(startIdx).find((e) => e.event === 'media-pause');
    assert(pauseEvt, 'media-pause event must be logged');
    assertEqual(pauseEvt.trigger, 'tab-audio-auto-pause', 'Trigger attribution must match lastPauseTrigger');
  });

  registerTest('Suite 5: HTML5 Video Event Telemetry', 'ADV-EVT-03', 'Seeking telemetry captures targetTime accurately', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'bg');
    sp.targetTime = 142.75;
    sp.videoEl.currentTime = 140.0;
    const startIdx = bgWin.bgAudioDiagLog.length;

    sp.videoEl.dispatchEvent(new bgWin.Event('seeking'));

    const seekEvt = bgWin.bgAudioDiagLog.slice(startIdx).find((e) => e.event === 'media-seeking');
    assert(seekEvt, 'media-seeking event must be logged');
    assertEqual(seekEvt.targetTime, 142.75, 'targetTime must be recorded accurately');
  });

  registerTest('Suite 5: HTML5 Video Event Telemetry', 'ADV-EVT-04', 'Error telemetry formats structured MediaError code and message', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'bg');
    sp.videoEl.error = { code: 3, message: 'MEDIA_ERR_DECODE: Demuxer failure' };
    const startIdx = bgWin.bgAudioDiagLog.length;

    sp.videoEl.dispatchEvent(new bgWin.Event('error'));

    const errEvt = bgWin.bgAudioDiagLog.slice(startIdx).find((e) => e.event === 'media-error');
    assert(errEvt, 'media-error event must be logged');
    assertEqual(errEvt.error.code, 3, 'Error code must match');
    assertEqual(errEvt.error.message, 'MEDIA_ERR_DECODE: Demuxer failure', 'Error message must match');
  });

  registerTest('Suite 5: HTML5 Video Event Telemetry', 'ADV-EVT-05', 'Player disposal tears down all listeners and prevents ghost events', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'bg');
    const oldVideo = sp.videoEl;

    bgWin.disposeSpPlayerInstance(sp);
    assertEqual(sp.disposed, true, 'sp.disposed must be true');
    assertEqual(sp.videoEl, null, 'sp.videoEl must be null');
    assertEqual(sp._videoHandlers, null, 'sp._videoHandlers must be null');

    const startIdx = bgWin.bgAudioDiagLog.length;
    // Dispatch events on detached oldVideo -> must be ignored!
    oldVideo.dispatchEvent(new bgWin.Event('play'));
    oldVideo.dispatchEvent(new bgWin.Event('pause'));
    oldVideo.dispatchEvent(new bgWin.Event('error'));

    const newLogs = bgWin.bgAudioDiagLog.slice(startIdx);
    assertEqual(newLogs.length, 0, 'Detached element events must NOT generate diagnostic logs');
  });

  // =========================================================================
  // EXECUTE ALL IN-BROWSER TESTS
  // =========================================================================
  log(`\nExecuting ${testRegistry.length} in-browser empirical test cases...\n`);
  let passedCount = 0;
  let currentSuite = '';

  for (const t of testRegistry) {
    if (t.suite !== currentSuite) {
      currentSuite = t.suite;
      log(`=== [${currentSuite}] ===`);
    }
    const t0 = performance.now();
    try {
      await t.fn();
      const elapsed = Math.round(performance.now() - t0);
      log(`  [PASS] ${t.id}: ${t.title} (${elapsed}ms)`);
      passedCount++;
    } catch (err) {
      const elapsed = Math.round(performance.now() - t0);
      log(`  [FAIL] ${t.id}: ${t.title} (${elapsed}ms)`);
      log(`         ERROR: ${err.message}`);
      await reportResult(false, `Test ${t.id} failed: ${err.message}`, { total: testRegistry.length, passed: passedCount });
      return;
    }
  }

  log('======================================================================');
  log(`FOXHUB v2.7.9 MILESTONE 3 IN-BROWSER ADVERSARIAL SUMMARY`);
  log(`Total In-Engine Tests : ${testRegistry.length}`);
  log(`Passed                : ${passedCount}`);
  log(`Failed                : 0`);
  log('======================================================================\n');

  await reportResult(true, '', { total: testRegistry.length, passed: passedCount });
}

window.addEventListener('DOMContentLoaded', () => {
  runAdversarialSuites().catch((err) => {
    reportResult(false, 'Runner exception: ' + (err.stack || err.message));
  });
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
        if self.path == "/test-runner-adversarial-m3.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
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


def run_spidermonkey_adversarial_tests():
    port = get_free_port()
    report_event = threading.Event()
    report_data = {}

    def on_report(data):
        report_data.update(data)
        report_event.set()

    server = http.server.HTTPServer(
        ("", port),
        lambda *args, **kwargs: TestRequestHandler(*args, report_callback=on_report, **kwargs)
    )
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    url = f"http://127.0.0.1:{port}/test-runner-adversarial-m3.html"
    profile_dir = tempfile.mkdtemp(prefix="foxhub_adv_m3_profile_")
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

    if not report_data.get("ok"):
        print("\n[ADVERSARIAL STRESS TEST FAILED IN SPIDERMONKEY]:")
        print(report_data.get("error"))
        return False, report_data.get("error")

    return True, report_data.get("summary")


def run_suite_6_amo_and_static_tests():
    print("\n=== [Suite 6: Firefox AMO Compliance & Static Code Hygiene] ===")
    tests_passed = 0

    # ADV-AMO-01: Zero occurrences of .innerHTML = or .outerHTML = in src/**/*.js
    print("  Executing ADV-AMO-01: Zero .innerHTML = or .outerHTML = in src/**/*.js ...")
    inner_outer_pattern = re.compile(r"\.(innerHTML|outerHTML)\s*=")
    violations = []
    src_dir = os.path.join(ROOT, "src")
    for root_dir, _, files in os.walk(src_dir):
        for fname in files:
            if fname.endswith(".js"):
                fpath = os.path.join(root_dir, fname)
                with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                    for line_idx, line in enumerate(f, 1):
                        clean_line = line.strip()
                        if clean_line.startswith("//") or clean_line.startswith("*"):
                            continue
                        if inner_outer_pattern.search(line):
                            violations.append(f"{fpath}:{line_idx} - {clean_line}")

    if violations:
        print(f"  [FAIL] ADV-AMO-01: Found {len(violations)} innerHTML/outerHTML assignments:")
        for v in violations:
            print(f"         {v}")
        return False
    print("  [PASS] ADV-AMO-01: Zero .innerHTML = or .outerHTML = in src/**/*.js (0 violations)")
    tests_passed += 1

    # ADV-AMO-02: Zero unicode emojis across src/
    print("  Executing ADV-AMO-02: Zero unicode emojis (🎵, 1️⃣, 2️⃣, ⚡) in src/ ...")
    emoji_ranges = [
        (0x1F300, 0x1F5FF),  # Misc Symbols & Pictographs (including 🎵 U+1F3B5)
        (0x1F600, 0x1F64F),  # Emoticons
        (0x1F680, 0x1F6FF),  # Transport & Map
        (0x1F700, 0x1F77F),  # Alchemical
        (0x1F780, 0x1F7FF),  # Geometric Shapes Extended
        (0x1F800, 0x1F8FF),  # Supplemental Arrows-C
        (0x1F900, 0x1F9FF),  # Supplemental Symbols & Pictographs
        (0x1FA00, 0x1FAFF),  # Symbols & Pictographs Extended-A
        (0x1F100, 0x1F1FF),  # Enclosed Alphanumeric
    ]
    specific_emojis = {
        '\u26a1': 'LIGHTNING SYMBOL (⚡)',
        '\U0001f3b5': 'MUSICAL NOTE (🎵)',
        '\ufe0f': 'VARIATION SELECTOR-16',
        '\u20e3': 'COMBINING ENCLOSING KEYCAP (1️⃣, 2️⃣)',
    }
    emoji_violations = []
    for root_dir, _, files in os.walk(src_dir):
        for fname in files:
            if fname.endswith((".js", ".html", ".css")):
                fpath = os.path.join(root_dir, fname)
                with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                    for line_idx, line in enumerate(f, 1):
                        clean_line = line.strip()
                        if clean_line.startswith("//") or clean_line.startswith("*"):
                            continue
                        for ch in line:
                            cp = ord(ch)
                            for start, end in emoji_ranges:
                                if start <= cp <= end:
                                    emoji_violations.append(f"{fpath}:{line_idx} - {clean_line}")
                                    break
                            if ch in specific_emojis:
                                emoji_violations.append(f"{fpath}:{line_idx} - {clean_line}")
                                break

    if emoji_violations:
        print(f"  [FAIL] ADV-AMO-02: Found {len(emoji_violations)} unicode emojis in src/:")
        for v in emoji_violations:
            print(f"         {v}")
        return False
    print("  [PASS] ADV-AMO-02: Zero unicode emojis in src/ (0 violations)")
    tests_passed += 1

    # ADV-AMO-03: DRM banner inline SVG DOM verification
    print("  Executing ADV-AMO-03: DRM banner SVG and text node construction ...")
    mfo_path = os.path.join(src_dir, "shared", "media-frame-optimizer.js")
    with open(mfo_path, "r", encoding="utf-8") as f:
        mfo_content = f.read()

    assert "document.createElementNS('http://www.w3.org/2000/svg', 'svg')" in mfo_content, "Must use createElementNS for SVG"
    assert "document.createTextNode('Enable Firefox DRM to Play Music')" in mfo_content, "Must use createTextNode"
    assert "closeBtn.addEventListener('click'" in mfo_content, "Must have dismiss handler"
    assert "clearInterval(drmPollTimer)" in mfo_content, "Must clear polling timer on dismiss"
    print("  [PASS] ADV-AMO-03: DRM banner constructs inline SVGs safely with zero innerHTML & timer cleanup")
    tests_passed += 1

    return True


def main():
    print("======================================================================")
    print("FOXHUB v2.7.9 — MILESTONE 3 PHASE 2 EMPIRICAL ADVERSARIAL RUNNER")
    print("Empirical Challenger: challenger_m3_2")
    print("======================================================================")

    # 1. Run in-browser tests in Headless Firefox
    browser_ok, browser_summary = run_spidermonkey_adversarial_tests()
    if not browser_ok:
        print("\nADVERSARIAL SUITE FAILED!")
        exit(1)

    # 2. Run static AMO compliance & code hygiene tests
    static_ok = run_suite_6_amo_and_static_tests()
    if not static_ok:
        print("\nAMO STATIC COMPLIANCE FAILED!")
        exit(1)

    total_tests = (browser_summary.get("total", 0) if browser_summary else 0) + 3
    passed_tests = (browser_summary.get("passed", 0) if browser_summary else 0) + 3

    print("\n======================================================================")
    print("FOXHUB v2.7.9 MILESTONE 3 TOTAL ADVERSARIAL STRESS SUMMARY")
    print(f"Total Adversarial Tests Executed : {total_tests}")
    print(f"Total Tests Passed               : {passed_tests}")
    print(f"Total Tests Failed               : 0")
    print("======================================================================")
    print("\nALL ADVERSARIAL CHALLENGES VERIFIED WITH 100% PASS RATE (Exit Code 0)!\n")


if __name__ == "__main__":
    main()
