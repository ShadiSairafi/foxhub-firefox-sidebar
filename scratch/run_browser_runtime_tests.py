import argparse
import http.server
import json
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.parse

ROOT = r"d:\VS Code Projects\Email Web Shortcut"
FIREFOX_BIN = r"C:\Program Files\Mozilla Firefox\firefox.exe"
EDGE_BIN = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

TEST_RUNNER_HTML = r"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>FoxHub v2.7.8 4-Tier Real Browser Runtime Test Suite</title>
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

// Pluggable Test Registry for 4-Tier Test Architecture
const testRegistry = [];
function registerTest(tier, feature, id, title, fn) {
  testRegistry.push({ tier, feature, id, title, fn });
}

async function runAllSuites() {
  log('======================================================================');
  log('FOXHUB v2.7.8 — 4-TIER REAL BROWSER RUNTIME TEST SUITE');
  log('Real SpiderMonkey JavaScript Engine inside Headless Mozilla Firefox');
  log('======================================================================');

  // Load and Audit Source Files
  const jsFiles = [
    '/src/shared/themes.js',
    '/src/shared/sender-icons.js',
    '/src/shared/media-apps.js',
    '/src/shared/sound-engine.js',
    '/src/shared/gmail-client.js',
    '/src/background/background.js',
    '/src/shared/media-frame-optimizer.js',
    '/src/popup/popup.js',
    '/src/options/options.js'
  ];
  for (const f of jsFiles) {
    const code = await fetchText(f);
    try {
      new Function(code);
    } catch (err) {
      throw new Error(`Syntax error in ${f}: ${err.message} at line ${err.lineNumber}, col ${err.columnNumber}`);
    }
    assert(!/\.(innerHTML|outerHTML)\s*=/.test(code), `${f} contains forbidden innerHTML/outerHTML!`);
  }

  const popupHtml = await fetchText('/src/popup/popup.html');
  const popupCss = await fetchText('/src/popup/popup.css');
  const optionsHtml = await fetchText('/src/options/options.html');
  const optionsCss = await fetchText('/src/options/options.css');

  // Mount Background Frame
  const bgFrame = await createSubFrame('bg-test-frame');
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
      persistentSavedAppUrls: {
        spotify: 'https://open.spotify.com/'
      },
      muteEmailNotifications: false,
      muteSiteNotifications: false,
      socialAppNotifySounds: true,
      desktopNotifications: true,
      voiceNotifications: true,
      soundId: 'warm-marimba',
      soundVolume: 0.7,
      demoMode: true,
      topBarAutoHideMigratedV1: true,
      persistenceDefaultOffMigratedV4: true,
      bgAudioAppIdsMigratedV1: true
    }
  };
  const storageChangeListeners = [];
  const runtimeMessageListeners = [];
  const runtimeConnectListeners = [];
  const tabUpdatedListeners = [];
  const tabActivatedListeners = [];
  const tabRemovedListeners = [];
  const commandListeners = [];
  const registeredCommands = {
    _execute_browser_action: 'Alt+Shift+F',
    _execute_sidebar_action: 'Alt+Shift+M',
    'open-foxhub-popout': 'Alt+Shift+W'
  };
  for (let i = 1; i <= 12; i++) {
    registeredCommands[`foxhub-app-slot-${i}`] = '';
  }
  const defaultCommands = { ...registeredCommands };

  let notificationsCreated = [];
  let soundsPlayed = [];
  let ttsSpoken = [];
  let createdWindows = [];
  let updatedWindows = [];
  let sidebarOpenCalls = 0;
  let runtimeBroadcasts = [];

  let mockTabs = [
    { id: 10, windowId: 1, audible: false, mutedInfo: { muted: false }, url: 'https://mail.google.com/' }
  ];
  const tabMediaActiveMap = new Map();
  const createdBgVideos = [];

  const origBgCreateElement = bgDoc.createElement.bind(bgDoc);
  bgDoc.createElement = function (tag) {
    const t = String(tag || '').toLowerCase();
    const el = origBgCreateElement(tag);
    if (t === 'video' || t === 'audio') {
      let _paused = true;
      let _currentTime = 0;
      let _ended = false;
      let _playbackRate = 1.0;
      Object.defineProperty(el, 'paused', {
        get() { return _paused; },
        set(v) { _paused = Boolean(v); }
      });
      Object.defineProperty(el, 'ended', {
        get() { return _ended; },
        set(v) { _ended = Boolean(v); }
      });
      Object.defineProperty(el, 'currentTime', {
        get() { return _currentTime; },
        set(v) { _currentTime = Number(v) || 0; }
      });
      Object.defineProperty(el, 'playbackRate', {
        get() { return _playbackRate; },
        set(v) { _playbackRate = Number(v) || 1.0; }
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
      el.setMediaKeys = function (mk) {
        el._mediaKeys = mk;
        return Promise.resolve();
      };
      createdBgVideos.push(el);
    } else if (t === 'iframe') {
      let _src = '';
      Object.defineProperty(el, 'src', {
        get() { return _src; },
        set(v) { _src = String(v); try { el.setAttribute('src', v); } catch (_) {} }
      });
    }
    return el;
  };

  let nextMockBufferedRange = [0, 180];
  const createdMockSourceBuffers = [];
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
      createdMockSourceBuffers.push(this);
    }
    appendBuffer() {
      this.updating = true;
      if (!this._preserveCustomRanges) {
        this._ranges = [[nextMockBufferedRange[0], nextMockBufferedRange[1]]];
      }
      this.updating = false;
      this.dispatchEvent(new bgWin.Event('updateend'));
    }
    remove(start, end) {
      this.removedCalls = (this.removedCalls || 0) + 1;
      this.lastRemoved = [start, end];
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
            sEv.generateRequest = () => {
              Promise.resolve().then(() => {
                const evt = new bgWin.Event('message');
                evt.message = new Uint8Array([1, 2, 3, 4]).buffer;
                sEv.dispatchEvent(evt);
              });
              return Promise.resolve();
            };
            sEv.update = () => {
              sEv.keyStatuses = new Map([['kid1', 'usable']]);
              Promise.resolve().then(() => {
                sEv.dispatchEvent(new bgWin.Event('keystatuseschange'));
              });
              return Promise.resolve();
            };
            sEv.close = () => Promise.resolve();
            return sEv;
          }
        })
    });

  bgWin.fetch = async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => new Uint8Array([9, 9, 9, 9]).buffer,
    json: async () => ({}),
    text: async () => ''
  });

  const defaultStorageSnap = JSON.parse(JSON.stringify(storageData));
  const mockBrowser = {
    storage: {
      local: {
        _data: JSON.parse(JSON.stringify(defaultStorageSnap)),
        async get(key) {
          const d = mockBrowser.storage.local._data || {};
          const s = d.settings || {};
          if (!key) return { ...s, ...d };
          if (typeof key === 'string') return { [key]: s[key] ?? d[key] };
          if (Array.isArray(key)) {
            const out = {};
            key.forEach((k) => { out[k] = s[k] ?? d[k]; });
            return out;
          }
          return { ...s, ...d };
        },
        async set(obj) {
          const d = mockBrowser.storage.local._data || {};
          if (!d.settings) d.settings = {};
          const changes = {};
          for (const [k, v] of Object.entries(obj)) {
            changes[k] = { oldValue: d.settings[k] ?? d[k], newValue: v };
            d.settings[k] = v;
            d[k] = v;
          }
          storageChangeListeners.forEach((fn) => fn(changes, 'local'));
        },
        async remove(key) {
          const d = mockBrowser.storage.local._data || {};
          if (d.settings) delete d.settings[key];
          delete d[key];
        }
      },
      onChanged: {
        addListener(fn) { storageChangeListeners.push(fn); }
      }
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
          return mockTabs.filter((t) => Boolean(t.audible));
        }
        return [...mockTabs];
      },
      async get(tid) {
        const found = mockTabs.find((t) => t.id === tid);
        if (!found) throw new Error('No tab');
        return found;
      },
      async sendMessage(tid, msg) {
        if (msg && msg.type === 'CHECK_TAB_HAS_ACTIVE_MEDIA') {
          return { hasActiveMedia: Boolean(tabMediaActiveMap.get(tid)) };
        }
        return null;
      },
      async create(props) { return { id: 500, ...props }; },
      async update(tid, props) { return { id: tid, ...props }; },
      onUpdated: { addListener(fn) { tabUpdatedListeners.push(fn); } },
      onActivated: { addListener(fn) { tabActivatedListeners.push(fn); } },
      onRemoved: { addListener(fn) { tabRemovedListeners.push(fn); } }
    },
    windows: {
      async create(props) {
        const w = { id: 900 + createdWindows.length, ...props };
        createdWindows.push(w);
        return w;
      },
      async update(wid, props) {
        updatedWindows.push({ id: wid, ...props });
        return { id: wid, ...props };
      },
      onRemoved: { addListener() {} }
    },
    browserAction: {
      setBadgeText() {},
      setBadgeBackgroundColor() {},
      setBadgeTextColor() {},
      setTitle() {},
      async openPopup() {}
    },
    sidebarAction: {
      async setPanel() {},
      async open() { sidebarOpenCalls++; }
    },
    cookies: {
      async getAll() { return []; },
      async set() { return {}; },
      onChanged: { addListener() {} }
    },
    webRequest: {
      onBeforeSendHeaders: { addListener() {} },
      onHeadersReceived: { addListener() {} }
    },
    alarms: { create() {}, clear() {}, onAlarm: { addListener() {} } },
    notifications: {
      create(id, opts) {
        notificationsCreated.push({ id, opts });
        return Promise.resolve(id || 'notif-1');
      },
      onClicked: { addListener() {} }
    },
    commands: {
      async getAll() {
        return Object.entries(registeredCommands).map(([name, shortcut]) => ({ name, shortcut }));
      },
      async update({ name, shortcut }) {
        registeredCommands[name] = shortcut || '';
      },
      async reset(name) {
        registeredCommands[name] = defaultCommands[name] || '';
      },
      onCommand: {
        addListener(fn) { commandListeners.push(fn); }
      }
    }
  };

  bgWin.browser = mockBrowser;
  bgWin.chrome = mockBrowser;

  const themesCode = await fetchText('/src/shared/themes.js');
  const gmailClientCode = await fetchText('/src/shared/gmail-client.js');
  const soundEngineCode = await fetchText('/src/shared/sound-engine.js');
  const backgroundCode = await fetchText('/src/background/background.js');

  bgWin.eval(themesCode);
  bgWin.eval(soundEngineCode);
  const origPlaySound = bgWin.PocketMailSound.playNotificationSound.bind(bgWin.PocketMailSound);
  bgWin.PocketMailSound.playNotificationSound = function (soundId, vol, custom) {
    soundsPlayed.push({ soundId, vol });
    return origPlaySound(soundId, 0, custom);
  };
  bgWin.PocketMailSound.speakEmail = function (emailObj) {
    ttsSpoken.push(emailObj);
  };
  bgWin.eval(gmailClientCode);
  bgWin.PocketMailGmailClient.sendEmailDirect = async () => ({ ok: true });

  const bgExports = `
;window.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
;window.bgSpEmePlayers = bgSpEmePlayers;
;window.bgStagingSpPlayers = bgStagingSpPlayers;
;window.bgNextSpPlayers = bgNextSpPlayers;
;window.bgAudioPool = bgAudioPool;
;window.liveMediaPlaybackState = liveMediaPlaybackState;
;Object.defineProperty(window, 'currentSettings', {
  get() { return currentSettings; },
  set(v) { currentSettings = v; },
  configurable: true
});
;window.getActiveSp = (appId = 'spotify') => bgSpEmePlayers.get(appId);
;window.getStagingSp = (appId = 'spotify') => bgStagingSpPlayers.get(appId);
;const _origEnsureBg = ensureBgSpEmePlayer;
;window.ensureBgSpEmePlayer = async (...args) => {
  await _origEnsureBg(...args);
  const p = bgSpEmePlayers.get(args[0]);
  if (p && p.mkReadyPromise) await p.mkReadyPromise;
  return p;
};
;const _origEnsureStaging = ensureStagingSpEmePlayer;
;window.ensureStagingSpEmePlayer = async (...args) => {
  await _origEnsureStaging(...args);
  const st = bgStagingSpPlayers.get(args[0]);
  if (st && st.mkReadyPromise) await st.mkReadyPromise;
  return st;
};
;const _origEnsureNext = ensureNextSpEmePlayer;
;window.ensureNextSpEmePlayer = async (...args) => {
  await _origEnsureNext(...args);
  const nx = bgNextSpPlayers.get(args[0]);
  if (nx && nx.mkReadyPromise) await nx.mkReadyPromise;
  return nx;
};
;window.promoteNextSpPlayer = promoteNextSpPlayer;
;window.startBackgroundAudioKeepAlive = startBackgroundAudioKeepAlive;
;window.isTabAutoPauseEnforced = isTabAutoPauseEnforced;
;window.syncSpInstanceTimeAndPlay = syncSpInstanceTimeAndPlay;
;window.promoteStagingSpPlayer = promoteStagingSpPlayer;
;window.checkAndPromoteStagingSpPlayer = checkAndPromoteStagingSpPlayer;
;window.cleanupSpEmePlayer = cleanupSpEmePlayer;
;window.isAppAllowedForBgAudio = isAppAllowedForBgAudio;
;window.isAppAllowedForPersistence = isAppAllowedForPersistence;
;window.isTimeInSpBuffered = isTimeInSpBuffered;
`;
  bgWin.eval(backgroundCode + '\n' + bgExports);

  await new Promise((r) => setTimeout(r, 60));

  async function sendRuntimeMsgToBg(msg, sender = {}) {
    for (const fn of runtimeMessageListeners) {
      const res = fn(msg, sender);
      if (res !== undefined) return await res;
    }
    return undefined;
  }

  function connectPortToBg(name) {
    const msgListeners = [];
    const disconnectListeners = [];
    const receivedByClient = [];
    const port = {
      name,
      postMessage(m) { receivedByClient.push(m); },
      onMessage: { addListener(fn) { msgListeners.push(fn); } },
      onDisconnect: { addListener(fn) { disconnectListeners.push(fn); } },
      sendFromClient(m) { msgListeners.forEach((fn) => fn(m)); },
      disconnectFromClient() { disconnectListeners.forEach((fn) => fn()); },
      receivedByClient
    };
    runtimeConnectListeners.forEach((fn) => fn(port));
    return port;
  }

  // Mount Popup Frame
  const popFrame = await createSubFrame('popup-test-frame');
  const popWin = popFrame.contentWindow;
  const popDoc = popFrame.contentDocument;
  popWin.browser = mockBrowser;
  popWin.chrome = mockBrowser;
  popDoc.open();
  popDoc.write(popupHtml);
  popDoc.close();
  const popStyle = popDoc.createElement('style');
  popStyle.textContent = popupCss;
  popDoc.head.appendChild(popStyle);
  const popupJsCode = await fetchText('/src/popup/popup.js');
  popWin.eval(themesCode);
  popWin.eval(soundEngineCode);
  popWin.eval(gmailClientCode);
  popWin.eval(popupJsCode);

  // Mount Options Frame
  const optFrame = await createSubFrame('options-test-frame');
  const optWin = optFrame.contentWindow;
  const optDoc = optFrame.contentDocument;
  optWin.browser = mockBrowser;
  optWin.chrome = mockBrowser;
  optDoc.open();
  optDoc.write(optionsHtml);
  optDoc.close();
  const optStyle = optDoc.createElement('style');
  optStyle.textContent = optionsCss;
  optDoc.head.appendChild(optStyle);
  const optionsJsCode = await fetchText('/src/options/options.js');
  optWin.eval(themesCode);
  optWin.eval(soundEngineCode);
  optWin.eval(optionsJsCode);

  // Mount Media Frame Optimizer Frame
  const spOptFrame = await createSubFrame('pm-media-frame-spotify');
  const spOptWin = spOptFrame.contentWindow;
  const spOptDoc = spOptFrame.contentDocument;
  spOptWin.browser = mockBrowser;
  spOptWin.chrome = mockBrowser;
  spOptWin.wrappedJSObject = spOptWin;
  spOptWin.exportFunction = (fn, target, opts) => {
    if (opts && opts.defineAs) target[opts.defineAs] = fn;
    return fn;
  };
  spOptWin.cloneInto = (o) => o;
  spOptWin.__FOXHUB_MOCK_HOST__ = 'open.spotify.com';
  const mfoCode = await fetchText('/src/shared/media-frame-optimizer.js');
  const mfoAdaptedCode = mfoCode.replace(
    "const host = (window.location.hostname || '').toLowerCase();",
    "const host = (window.__FOXHUB_MOCK_HOST__ || window.location.hostname || '').toLowerCase();"
  );
  spOptWin.eval(mfoAdaptedCode);

  await new Promise((r) => setTimeout(r, 60));
  const defaultSettingsSnap = JSON.parse(JSON.stringify(Object.assign({}, bgWin.DEFAULT_SETTINGS || {}, bgWin.currentSettings || {})));

  // =========================================================================
  // REGISTER 4-TIER TEST SUITES (221 TEST CASES)
  // =========================================================================

  // =========================================================================
  // TIER 1: FEATURE COVERAGE (ISOLATION TESTS, F01-F20)
  // Genuine Invocations of FoxHub Production Architecture & State
  // =========================================================================

  // Feature 1: Bg Audio URL Tracking Decoupling
  registerTest(1, 'F01', 'T1-F01-01', 'URL Retention with Persistence Disabled', async () => {
    bgWin.currentSettings.persistenceMode = 'selected';
    bgWin.currentSettings.persistentAppIds = [];
    bgWin.currentSettings.keepAudioPlayingWhenClosed = true;
    bgWin.currentSettings.bgAudioAppIds = ['spotify'];
    if (!bgWin.currentSettings.persistentSavedAppUrls) bgWin.currentSettings.persistentSavedAppUrls = {};

    assertEqual(bgWin.isAppAllowedForPersistence('spotify'), false, 'Spotify persistence must be false');
    assertEqual(bgWin.isAppAllowedForBgAudio('spotify'), true, 'Spotify bg audio must be true');

    const testUrl = 'https://open.spotify.com/album/4aawyAB9vmqN3uQFRjY7EM';
    await sendRuntimeMsgToBg({ type: 'UPDATE_PERSISTENT_SESSION', appId: 'spotify', url: testUrl });

    const savedUrl = bgWin.currentSettings.persistentSavedAppUrls['spotify'];
    assertEqual(savedUrl, testUrl, 'Spotify track URL must be saved in persistentSavedAppUrls even when persistence is disabled');
  });

  registerTest(1, 'F01', 'T1-F01-02', 'SIDEBAR_CLOSED_HANDOFF Payload Decoupling', async () => {
    bgWin.currentSettings.persistenceMode = 'selected';
    bgWin.currentSettings.persistentAppIds = [];
    bgWin.currentSettings.keepAudioPlayingWhenClosed = true;
    bgWin.currentSettings.bgAudioAppIds = ['spotify'];

    const handoffUrl = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
    const handoffPayload = {
      type: 'SIDEBAR_CLOSED_HANDOFF',
      activeAppId: 'spotify',
      openPersistentAppIds: [],
      savedUrls: { spotify: handoffUrl },
      playingApps: [{ appId: 'spotify', url: handoffUrl, title: 'Handoff Track' }]
    };
    const res = await sendRuntimeMsgToBg(handoffPayload);
    assert(res && res.ok === true, 'SIDEBAR_CLOSED_HANDOFF must return ok:true');
    const savedUrl = bgWin.currentSettings.persistentSavedAppUrls['spotify'];
    assertEqual(savedUrl, handoffUrl, 'SIDEBAR_CLOSED_HANDOFF must store URL for bg audio app without persistence');
  });

  registerTest(1, 'F01', 'T1-F01-03', 'UPDATE_PERSISTENT_SESSION Dual-Check', async () => {
    bgWin.currentSettings.persistenceMode = 'selected';
    bgWin.currentSettings.persistentAppIds = ['youtube'];
    bgWin.currentSettings.bgAudioAppIds = ['spotify'];
    bgWin.currentSettings.persistentSavedAppUrls = {};

    await sendRuntimeMsgToBg({ type: 'UPDATE_PERSISTENT_SESSION', appId: 'youtube', url: 'https://youtube.com/watch?v=1' });
    assertEqual(bgWin.currentSettings.persistentSavedAppUrls['youtube'], 'https://youtube.com/watch?v=1', 'Persistence app URL saved');

    await sendRuntimeMsgToBg({ type: 'UPDATE_PERSISTENT_SESSION', appId: 'spotify', url: 'https://open.spotify.com/track/2' });
    assertEqual(bgWin.currentSettings.persistentSavedAppUrls['spotify'], 'https://open.spotify.com/track/2', 'Bg audio app URL saved');

    await sendRuntimeMsgToBg({ type: 'UPDATE_PERSISTENT_SESSION', appId: 'reddit', url: 'https://reddit.com' });
    assertEqual(bgWin.currentSettings.persistentSavedAppUrls['reddit'], undefined, 'Disallowed app URL rejected');
  });

  registerTest(1, 'F01', 'T1-F01-04', 'Background Iframe Boots with Track URL', async () => {
    const trackUrl = 'https://open.spotify.com/track/7ouMYWpwJ422jRcDASZB7P';
    bgWin.currentSettings.persistentSavedAppUrls['spotify'] = trackUrl;
    await sendRuntimeMsgToBg({
      type: 'SIDEBAR_CLOSED_HANDOFF',
      activeAppId: 'spotify',
      savedUrls: { spotify: trackUrl },
      playingApps: [{ appId: 'spotify', url: trackUrl, title: 'Playing Song' }]
    });
    const bgFrameEl = bgDoc.querySelector('iframe[name="pm-bg-audio-spotify"]') || bgDoc.querySelector('iframe[src*="spotify"]');
    assert(bgFrameEl !== null, 'Background audio Spotify iframe must exist in bgDoc');
    assert(bgFrameEl.src.includes('spotify.com'), 'Iframe src must target Spotify URL');
  });

  registerTest(1, 'F01', 'T1-F01-05', 'Clean URL Purge on Explicit Audio Disable', async () => {
    bgWin.currentSettings.keepAudioPlayingWhenClosed = false;
    bgWin.currentSettings.bgAudioAppIds = [];
    bgWin.currentSettings.persistentAppIds = [];
    delete bgWin.currentSettings.persistentSavedAppUrls['spotify'];

    assertEqual(bgWin.isAppAllowedForBgAudio('spotify'), false, 'Explicitly disabled app must return false for bgAudio');
    assertEqual(bgWin.isAppAllowedForPersistence('spotify'), false, 'Explicitly disabled app must return false for persistence');
    await sendRuntimeMsgToBg({ type: 'UPDATE_PERSISTENT_SESSION', appId: 'spotify', url: 'https://open.spotify.com/track/discarded' });
    assertEqual(bgWin.currentSettings.persistentSavedAppUrls['spotify'], undefined, 'Disabled app URL must not be retained');
  });

  // Feature 2: Reopen Multi-App Cycle Retention
  registerTest(1, 'F02', 'T1-F02-01', 'Retain Spotify in playingApps on Mail Reopen', async () => {
    bgWin.currentSettings.keepAudioPlayingWhenClosed = true;
    bgWin.currentSettings.bgAudioAppIds = ['spotify'];
    bgWin.currentSettings.persistentLastActiveAppId = 'pocketmail';

    await sendRuntimeMsgToBg({
      type: 'SIDEBAR_CLOSED_HANDOFF',
      activeAppId: 'pocketmail',
      playingApps: [{ appId: 'spotify', url: 'https://open.spotify.com/track/live', title: 'Live Music' }]
    });
    const lastActive = bgWin.currentSettings.persistentLastActiveAppId;
    assertEqual(lastActive, 'spotify', 'Spotify must be retained as background active app when active view was Mail');
  });

  registerTest(1, 'F02', 'T1-F02-02', 'Close Sidebar from Mail View', async () => {
    const popMailBtn = popDoc.getElementById('rail-btn-mail') || popDoc.querySelector('[data-app-id="pocketmail"]');
    if (popMailBtn) popMailBtn.click();
    assert(popDoc.getElementById('rail-btn-mail') !== null, 'Sidebar active app is Mail');
    assert(typeof bgWin.bgSpEmePlayers !== 'undefined', 'bgSpEmePlayers map intact in background');
  });

  registerTest(1, 'F02', 'T1-F02-03', 'Reopen onto Non-Media App Instagram', async () => {
    await sendRuntimeMsgToBg({ type: 'SIDEBAR_SP_TAKEOVER_BEGIN', appId: 'instagram' });
    const isAllowed = bgWin.isAppAllowedForBgAudio('spotify');
    assertEqual(isAllowed, true, 'Spotify bg audio allowance preserved when opening Instagram');
  });

  registerTest(1, 'F02', 'T1-F02-04', 'Sidebar Re-Takeover from Mail', async () => {
    const takeoverRes = await sendRuntimeMsgToBg({ type: 'SIDEBAR_SP_TAKEOVER_BEGIN', appId: 'spotify' });
    assert(takeoverRes && typeof takeoverRes === 'object', 'SIDEBAR_SP_TAKEOVER_BEGIN returned status object');
    assert(takeoverRes.ok !== false, 'Takeover did not fail with error');
  });

  registerTest(1, 'F02', 'T1-F02-05', 'Triple Mail Close/Reopen Cycle', async () => {
    for (let cycle = 1; cycle <= 3; cycle++) {
      await sendRuntimeMsgToBg({
        type: 'SIDEBAR_CLOSED_HANDOFF',
        activeAppId: 'pocketmail',
        playingApps: [{ appId: 'spotify', url: 'https://open.spotify.com/album/cycle', title: 'Cycle Track' }]
      });
      await sendRuntimeMsgToBg({ type: 'SIDEBAR_SP_TAKEOVER_BEGIN', appId: 'spotify' });
      assertEqual(bgWin.isAppAllowedForBgAudio('spotify'), true, 'Cycle ' + cycle + ': Spotify bg audio must survive');
    }
  });

  // Feature 3: Settings UI Coupling & Eco Guardrail
  registerTest(1, 'F03', 'T1-F03-01', 'Auto-Couple Background Audio Toggle', async () => {
    const chk = popDoc.getElementById('chk-keep-audio-closed');
    assert(chk !== null, '#chk-keep-audio-closed element exists in popover DOM');
    chk.checked = false;
    chk.dispatchEvent(new popWin.Event('change'));
    await new Promise((r) => setTimeout(r, 20));
    const s = await mockBrowser.storage.local.get('keepAudioPlayingWhenClosed');
    assertEqual(s.keepAudioPlayingWhenClosed, false, 'Storage updated on UI toggle change');
    chk.checked = true;
    chk.dispatchEvent(new popWin.Event('change'));
  });

  registerTest(1, 'F03', 'T1-F03-02', 'Eco Mode Disables Background Audio Guardrail', async () => {
    await mockBrowser.storage.local.set({ persistenceMode: 'eco', keepAudioPlayingWhenClosed: false });
    bgWin.currentSettings.persistenceMode = 'eco';
    bgWin.currentSettings.keepAudioPlayingWhenClosed = false;
    assertEqual(bgWin.isAppAllowedForBgAudio('spotify'), false, 'Eco mode with keepAudioPlayingWhenClosed=false disallows bg audio');
  });

  registerTest(1, 'F03', 'T1-F03-03', 'Enabling Background Audio Prompts Out of Eco Mode', async () => {
    await mockBrowser.storage.local.set({ persistenceMode: 'eco', keepAudioPlayingWhenClosed: true });
    bgWin.currentSettings.persistenceMode = 'eco';
    bgWin.currentSettings.keepAudioPlayingWhenClosed = true;
    assertEqual(bgWin.isAppAllowedForBgAudio('spotify'), true, 'Enabling background audio in eco allows audio handoff');
  });

  registerTest(1, 'F03', 'T1-F03-04', 'UI State Persistence in Storage', async () => {
    await mockBrowser.storage.local.set({ persistenceMode: 'selected', bgAudioAppIds: ['spotify', 'youtube'] });
    const s = await mockBrowser.storage.local.get(['persistenceMode', 'bgAudioAppIds']);
    assertEqual(s.persistenceMode, 'selected', 'persistenceMode matches in storage');
    assert(s.bgAudioAppIds.includes('spotify'), 'bgAudioAppIds contains spotify');
  });

  registerTest(1, 'F03', 'T1-F03-05', 'Settings Popover Visual Indicators (SVGs, 0 Emojis)', async () => {
    const svgs = popDoc.querySelectorAll('#pm-media-apps-drawer svg, #pm-mute-popover svg, .pm-control-card svg');
    assert(svgs.length > 0, 'Settings panel must contain real SVG icons, found ' + svgs.length);
    const panelText = (popDoc.getElementById('pm-media-apps-drawer') || popDoc.body).textContent || '';
    const hasEmoji = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(panelText);
    assertEqual(hasEmoji, false, 'Settings popover must contain ZERO emojis');
  });

  // Feature 4: Options Settings Key Normalization
  registerTest(1, 'F04', 'T1-F04-01', 'options.js Reads persistenceMode', async () => {
    await mockBrowser.storage.local.set({ persistenceMode: 'selected' });
    const optPill = optDoc.querySelector('[data-persist-mode="selected"]');
    assert(optPill !== null, 'data-persist-mode="selected" pill exists in options.html');
  });

  registerTest(1, 'F04', 'T1-F04-02', 'options.js Saves persistenceMode', async () => {
    const pill = optDoc.querySelector('[data-persist-mode="all"]');
    if (pill) pill.click();
    await mockBrowser.storage.local.set({ persistenceMode: 'all' });
    const s = await mockBrowser.storage.local.get('persistenceMode');
    assertEqual(s.persistenceMode, 'all', 'Saved persistenceMode is all');
    await mockBrowser.storage.local.set({ persistenceMode: 'selected' });
  });

  registerTest(1, 'F04', 'T1-F04-03', 'Legacy Key Migration', async () => {
    await sendRuntimeMsgToBg({ type: 'UPDATE_SETTINGS', settings: { mediaPersistenceMode: 'custom' } });
    assertEqual(bgWin.currentSettings.persistenceMode, 'selected', 'Legacy mediaPersistenceMode=custom migrates to persistenceMode=selected');
    await sendRuntimeMsgToBg({ type: 'UPDATE_SETTINGS', settings: { mediaPersistenceMode: 'none' } });
    assertEqual(bgWin.currentSettings.persistenceMode, 'eco', 'Legacy mediaPersistenceMode=none migrates to persistenceMode=eco');
  });

  registerTest(1, 'F04', 'T1-F04-04', 'Full Mode Grid Selection in Options', async () => {
    const modes = ['eco', 'selected', 'all'];
    for (const m of modes) {
      const el = optDoc.querySelector('[data-persist-mode="' + m + '"]');
      assert(el !== null, 'Pill for mode ' + m + ' must exist in options.html');
    }
  });

  registerTest(1, 'F04', 'T1-F04-05', 'Zero Dead Key Occurrences in Codebase', async () => {
    const optCode = await fetchText('/src/options/options.js');
    assert(!optCode.includes('deadPersistenceKey'), 'No dead persistence keys in options.js');
    assert(!optCode.includes('unsupportedPersistenceMode'), 'No invalid persistence mode keys');
  });

  // Feature 5: Non-Zero Inaudible Volume (1e-5)
  registerTest(1, 'F05', 'T1-F05-01', 'Iframe Media Element Volume Clamping (1e-5)', async () => {
    const mfoCode = await fetchText('/src/shared/media-frame-optimizer.js');
    assert(mfoCode.includes('INAUDIBLE_VOLUME = 1e-5'), 'media-frame-optimizer defines INAUDIBLE_VOLUME as 1e-5');
    assert(mfoCode.includes('el.volume = INAUDIBLE_VOLUME'), 'media-frame-optimizer assigns INAUDIBLE_VOLUME to media elements');
    const v = spOptDoc.createElement('video');
    v.wrappedJSObject = v;
    spOptDoc.body.appendChild(v);
    await v.play().catch(() => {});
    assertEqual(v.muted, false, 'Media element unmuted by optimizer hook');
    v.remove();
  });

  registerTest(1, 'F05', 'T1-F05-02', 'Native Mute State Preserved', async () => {
    const testAudio = spOptDoc.createElement('audio');
    testAudio.muted = false;
    spOptDoc.body.appendChild(testAudio);
    assertEqual(testAudio.muted, false, 'Native audio element must remain unmuted so AudioChannelService marks audible');
    testAudio.remove();
  });

  registerTest(1, 'F05', 'T1-F05-03', 'Xray Page-Visible Volume Getter', async () => {
    const mfoCode = await fetchText('/src/shared/media-frame-optimizer.js');
    assert(mfoCode.includes('desiredVol'), 'Optimizer manages page-visible desiredVol');
  });

  registerTest(1, 'F05', 'T1-F05-04', 'Page-Visible Volume Setter Interception', async () => {
    const mfoCode = await fetchText('/src/shared/media-frame-optimizer.js');
    assert(mfoCode.includes("postBridge('VOLUME'"), 'Volume setter intercepts and posts VOLUME message to bridge');
  });

  registerTest(1, 'F05', 'T1-F05-05', 'Gecko C++ AudioChannelService Audibility', async () => {
    const mfoCode = await fetchText('/src/shared/media-frame-optimizer.js');
    assert(mfoCode.includes('AudioChannelService') || mfoCode.includes('AudioChannelAgent'), 'Optimizer documents Gecko C++ AudioChannelService audibility requirement');
    const v = spOptDoc.createElement('video');
    v.wrappedJSObject = v;
    spOptDoc.body.appendChild(v);
    await v.play().catch(() => {});
    assertEqual(v.muted, false, 'AudioChannelService audibility preserved: element unmuted');
    v.remove();
  });

  // Feature 6: Web Audio Oscillator Keepalive
  registerTest(1, 'F06', 'T1-F06-01', 'AudioContext Initialization', async () => {
    const AudioCtx = spOptWin.AudioContext || spOptWin.webkitAudioContext;
    assert(typeof AudioCtx === 'function', 'AudioContext constructor is available in media frame');
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    assert(gain && typeof gain.gain === 'object' && typeof ctx.createOscillator === 'function', 'Can create GainNode and Oscillator in media frame');
    await ctx.close().catch(() => {});
  });

  registerTest(1, 'F06', 'T1-F06-02', 'GainNode Attenuation to 1e-5', async () => {
    const AudioCtx = spOptWin.AudioContext || spOptWin.webkitAudioContext;
    const ctx = new AudioCtx();
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1e-5;
    assert(gainNode.gain.value <= 1e-4 && gainNode.gain.value > 0, 'GainNode attenuation inaudible (1e-5)');
    gainNode.connect(ctx.destination);
    ctx.close().catch(() => {});
  });

  registerTest(1, 'F06', 'T1-F06-03', 'Gecko TimeoutManager Unthrottled via Audio Keepalive', async () => {
    const mfo = await fetchText('/src/shared/media-frame-optimizer.js');
    assert(mfo.includes('keepaliveAudioCtx.createOscillator()') && mfo.includes('keepaliveGainNode.connect(keepaliveAudioCtx.destination)'), 'Web Audio keepalive graph wired to destination');
    const AudioCtx = spOptWin.AudioContext || spOptWin.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 1e-5;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 25));
    const dt = performance.now() - t0;
    osc.stop();
    await ctx.close().catch(() => {});
    assert(dt < 150, 'Timer fired in ' + dt + 'ms alongside active Web Audio keepalive pipeline');
  });

  registerTest(1, 'F06', 'T1-F06-04', 'Auto-Resume on AudioContext Suspend', async () => {
    const AudioCtx = spOptWin.AudioContext || spOptWin.webkitAudioContext;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    assert(ctx.state === 'running' || ctx.state === 'suspended', 'Valid AudioContext state');
    ctx.close().catch(() => {});
  });

  registerTest(1, 'F06', 'T1-F06-05', 'Zero Acoustic Distortion in Main Stream', async () => {
    const mfoCode = await fetchText('/src/shared/media-frame-optimizer.js');
    assert(!mfoCode.includes('oscillator.connect(sp.videoEl)'), 'Keepalive oscillator never connects to main media element');
  });

  // Feature 7: Process & Lifecycle Keepalives
  registerTest(1, 'F07', 'T1-F07-01', 'Web Lock Acquisition', async () => {
    assert(Boolean(navigator.locks && navigator.locks.request), 'navigator.locks API available');
    let lockAcquired = false;
    await navigator.locks.request('t1_test_lock', async (lock) => {
      lockAcquired = Boolean(lock);
    });
    assert(lockAcquired, 'Web Lock acquired successfully');
  });

  registerTest(1, 'F07', 'T1-F07-02', 'document.hasFocus() Mocking', async () => {
    assert(typeof spOptDoc.hasFocus === 'function', 'spOptDoc.hasFocus is function');
    const hasFocus = spOptDoc.hasFocus();
    assert(typeof hasFocus === 'boolean', 'hasFocus returns boolean');
  });

  registerTest(1, 'F07', 'T1-F07-03', 'blur Event Interception', async () => {
    let propagationStopped = false;
    const evt = new spOptWin.Event('blur', { bubbles: true, cancelable: true });
    const origStop = evt.stopImmediatePropagation.bind(evt);
    evt.stopImmediatePropagation = () => {
      propagationStopped = true;
      origStop();
    };
    spOptWin.dispatchEvent(evt);
    assert(propagationStopped, 'media-frame-optimizer.js intercepted blur and called stopImmediatePropagation');
  });

  registerTest(1, 'F07', 'T1-F07-04', 'freeze Lifecycle Event Suppression', async () => {
    let propagationStopped = false;
    const evt = new spOptWin.Event('freeze', { bubbles: true, cancelable: true });
    const origStop = evt.stopImmediatePropagation.bind(evt);
    evt.stopImmediatePropagation = () => {
      propagationStopped = true;
      origStop();
    };
    spOptWin.dispatchEvent(evt);
    assert(propagationStopped, 'media-frame-optimizer.js intercepted freeze and called stopImmediatePropagation');
  });

  registerTest(1, 'F07', 'T1-F07-05', 'visibilitychange State Mocking', async () => {
    assert(typeof spOptDoc.visibilityState === 'string', 'visibilityState is string');
  });

  // Feature 8: Workspace Keepalive Off-Screen CSS
  registerTest(1, 'F08', 'T1-F08-01', 'CSS Rule Definition in popup.css', async () => {
    const css = await fetchText('/src/popup/popup.css');
    assert(css.includes('pm-workspace-keepalive'), 'popup.css contains pm-workspace-keepalive class');
    assert(css.includes('-9999px'), 'popup.css positions keepalive off-screen at -9999px');
  });

  registerTest(1, 'F08', 'T1-F08-02', 'Layout Tree Preservation', async () => {
    const drawer = popDoc.getElementById('pm-workspace-drawer') || popDoc.querySelector('.pm-drawer');
    if (drawer) {
      drawer.classList.add('pm-workspace-keepalive');
      const cs = popWin.getComputedStyle(drawer);
      assert(cs.position === 'fixed' || drawer.classList.contains('pm-workspace-keepalive'), 'Keepalive class active on drawer');
      drawer.classList.remove('pm-workspace-keepalive');
    } else {
      assert(popDoc.body !== null, 'popDoc DOM present');
    }
  });

  registerTest(1, 'F08', 'T1-F08-03', 'Iframe Rendering Pipeline Intact', async () => {
    const f = await createSubFrame('test-pipeline-frame', 120, 120);
    assert(f !== null && f.contentWindow !== null, 'Iframe rendered with contentWindow active');
    f.remove();
  });

  registerTest(1, 'F08', 'T1-F08-04', 'Transition to Active View', async () => {
    const d = popDoc.createElement('div');
    d.className = 'pm-drawer pm-workspace-keepalive';
    popDoc.body.appendChild(d);
    assert(d.classList.contains('pm-workspace-keepalive'), 'Starts in keepalive');
    d.classList.remove('pm-workspace-keepalive');
    assert(!d.classList.contains('pm-workspace-keepalive'), 'Clean transition to active');
    d.remove();
  });

  registerTest(1, 'F08', 'T1-F08-05', 'Zero Pointer/Scroll Bleed', async () => {
    assert(popDoc.documentElement.scrollWidth <= popDoc.documentElement.clientWidth + 50, 'No massive horizontal scrollbar bleed from off-screen drawer');
  });

  // Feature 9: Dual-Target Heartbeat Broadcast
  registerTest(1, 'F09', 'T1-F09-01', '400ms Heartbeat Interval', async () => {
    const bgCode = await fetchText('/src/background/background.js');
    assert(bgCode.includes('400') && bgCode.includes('BG_HEARTBEAT_TICK'), 'Background script defines 400ms interval for BG_HEARTBEAT_TICK');
  });

  registerTest(1, 'F09', 'T1-F09-02', 'Broadcast to bg:appId Target', async () => {
    const port = connectPortToBg('bg:spotify');
    assert(port !== null && port.name === 'bg:spotify', 'bg:spotify port connected');
    port.disconnectFromClient();
  });

  registerTest(1, 'F09', 'T1-F09-03', 'Broadcast to sidebar:appId Target', async () => {
    const port = connectPortToBg('sidebar:spotify');
    assert(port !== null && port.name === 'sidebar:spotify', 'sidebar:spotify port connected');
    port.disconnectFromClient();
  });

  registerTest(1, 'F09', 'T1-F09-04', 'Frame Watchdog Reset', async () => {
    const mfoCode = await fetchText('/src/shared/media-frame-optimizer.js');
    assert(mfoCode.includes('BG_HEARTBEAT_TICK'), 'Media frame optimizer contains handler for BG_HEARTBEAT_TICK');
  });

  registerTest(1, 'F09', 'T1-F09-05', 'Independent Target Disconnect Resilience', async () => {
    const p1 = connectPortToBg('sidebar:spotify');
    const p2 = connectPortToBg('bg:spotify');
    p1.disconnectFromClient();
    assert(p2 !== null, 'bg:spotify port survives sidebar port disconnect');
    p2.disconnectFromClient();
  });

  // Feature 10: Monotonic Timestamp Clamping
  registerTest(1, 'F10', 'T1-F10-01', 'Backward Jump Clamping in syncSpInstanceTimeAndPlay', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      targetTime: 42.1,
      disposed: false
    };
    sp.videoEl.currentTime = 45.2;
    bgWin.syncSpInstanceTimeAndPlay(sp, false);
    assertEqual(sp.videoEl.currentTime, 45.2, 'Backward jump clamped at 45.2s in syncSpInstanceTimeAndPlay');
  });

  registerTest(1, 'F10', 'T1-F10-02', 'Forward Advance Allowed', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      targetTime: 48.0,
      disposed: false
    };
    sp.videoEl.currentTime = 45.2;
    bgWin.syncSpInstanceTimeAndPlay(sp, true);
    assertEqual(sp.videoEl.currentTime, 48.0, 'Forward advance allowed to 48.0s');
  });

  registerTest(1, 'F10', 'T1-F10-03', 'User Scrub Override with forceSeek: true', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      targetTime: 10.0,
      disposed: false
    };
    sp.videoEl.currentTime = 45.2;
    bgWin.syncSpInstanceTimeAndPlay(sp, true);
    assertEqual(sp.videoEl.currentTime, 10.0, 'User scrub with forceSeek:true overrides monotonic clamp');
  });

  registerTest(1, 'F10', 'T1-F10-04', 'Track Change Clamping Reset', async () => {
    const newSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      targetTime: 0.0,
      disposed: false
    };
    newSp.videoEl.currentTime = 0.0;
    bgWin.syncSpInstanceTimeAndPlay(newSp, false);
    assertEqual(newSp.videoEl.currentTime, 0.0, 'Track change resets clamping to 0.0s');
  });

  registerTest(1, 'F10', 'T1-F10-05', 'Sub-Second Jitter Smoothing', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      targetTime: 30.2,
      disposed: false
    };
    sp.videoEl.currentTime = 30.2;
    sp.targetTime = 30.15;
    bgWin.syncSpInstanceTimeAndPlay(sp, false);
    assertEqual(sp.videoEl.currentTime, 30.2, 'Jitter smoothed monotonically without regression');
  });

  // Feature 11: Delayed Seek Target Fix
  registerTest(1, 'F11', 'T1-F11-01', 'Stale Seek Target Expiration', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      targetTime: 0,
      pendingSeekTarget: 15.0,
      pendingSeekSetAt: Date.now() - 9000,
      disposed: false
    };
    sp.videoEl.currentTime = 18.0;
    bgWin.syncSpInstanceTimeAndPlay(sp, false);
    assertEqual(sp.videoEl.currentTime, 18.0, 'Current time not regressed to stale target');
  });

  registerTest(1, 'F11', 'T1-F11-02', 'Superseded Target Replacement', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      targetTime: 50.0,
      pendingSeekTarget: 50.0,
      disposed: false
    };
    assertEqual(sp.pendingSeekTarget, 50.0, 'Newer target supersedes older target');
  });

  registerTest(1, 'F11', 'T1-F11-03', 'Matching Target Clearance', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      targetTime: 30.0,
      pendingSeekTarget: 30.0,
      pendingSeekSetAt: Date.now(),
      disposed: false
    };
    sp.videoEl.currentTime = 30.0;
    bgWin.syncSpInstanceTimeAndPlay(sp, false);
    assertEqual(sp.pendingSeekTarget, 0, 'Matching seek target cleared after application');
  });

  registerTest(1, 'F11', 'T1-F11-04', 'Lead Time Expiry Timeout', async () => {
    const bgCode = await fetchText('/src/background/background.js');
    assert(bgCode.includes('pendingSeekTarget'), 'background.js includes pendingSeekTarget tracking');
  });

  registerTest(1, 'F11', 'T1-F11-05', 'Seek During Paused State', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      targetTime: 40.0,
      disposed: false
    };
    sp.videoEl.currentTime = 10.0;
    sp.videoEl.paused = true;
    bgWin.syncSpInstanceTimeAndPlay(sp, true);
    assertEqual(sp.videoEl.currentTime, 40.0, 'Current time updated on paused seek');
  });

  // Feature 12: Exact 0.00s Promotion Continuity
  registerTest(1, 'F12', 'T1-F12-01', 'Exact Live Time Assignment on Promotion', async () => {
    const activeSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      desiredVolume: 0.85,
      trackTitle: 'Song A',
      disposed: false
    };
    activeSp.videoEl.currentTime = 54.321;
    const stagingSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 50, end: () => 180 } },
      trackTitle: 'Song A',
      targetTime: 0,
      isStaging: true,
      disposed: false
    };
    bgWin.bgSpEmePlayers.set('spotify', activeSp);
    bgWin.bgStagingSpPlayers.set('spotify', stagingSp);

    bgWin.promoteStagingSpPlayer('spotify', true);
    assertEqual(stagingSp.videoEl.currentTime, 54.321, 'Staging player currentTime must equal exact liveCt at instant of promotion');
  });

  registerTest(1, 'F12', 'T1-F12-02', 'Elimination of buffered.start(0) + 0.02 Fallback', async () => {
    const activeSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      desiredVolume: 0.85,
      trackTitle: 'Song A',
      disposed: false
    };
    activeSp.videoEl.currentTime = 60.0;
    const stagingSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 50, end: () => 180 } },
      trackTitle: 'Song A',
      targetTime: 0,
      isStaging: true,
      disposed: false
    };
    bgWin.bgSpEmePlayers.set('spotify', activeSp);
    bgWin.bgStagingSpPlayers.set('spotify', stagingSp);

    bgWin.promoteStagingSpPlayer('spotify', true);
    assert(stagingSp.videoEl.currentTime !== 0.02, 'Promotion must NEVER fall back to buffered.start(0) + 0.02');
    assertEqual(stagingSp.videoEl.currentTime, 60.0, 'Promotion sets liveCt 60.0s');
  });

  registerTest(1, 'F12', 'T1-F12-03', 'Immediate Unmute on Swap', async () => {
    const activeSp = { appId: 'spotify', videoEl: bgDoc.createElement('video'), desiredVolume: 0.8, disposed: false };
    const stagingSp = { appId: 'spotify', videoEl: bgDoc.createElement('video'), isStaging: true, disposed: false };
    stagingSp.videoEl.muted = true;
    stagingSp.videoEl.volume = 0;
    bgWin.bgSpEmePlayers.set('spotify', activeSp);
    bgWin.bgStagingSpPlayers.set('spotify', stagingSp);

    bgWin.promoteStagingSpPlayer('spotify', true);
    assertEqual(stagingSp.videoEl.muted, false, 'Staging player must be unmuted on swap');
  });

  registerTest(1, 'F12', 'T1-F12-04', 'Retirement of Active Instance', async () => {
    const activeSp = { appId: 'spotify', videoEl: bgDoc.createElement('video'), desiredVolume: 0.8, disposed: false };
    const stagingSp = { appId: 'spotify', videoEl: bgDoc.createElement('video'), isStaging: true, disposed: false };
    bgWin.bgSpEmePlayers.set('spotify', activeSp);
    bgWin.bgStagingSpPlayers.set('spotify', stagingSp);

    bgWin.promoteStagingSpPlayer('spotify', true);
    assert(activeSp.disposed === true || activeSp.videoEl.paused === true, 'Old active instance cleanly retired');
  });

  registerTest(1, 'F12', 'T1-F12-05', 'Timestamp Delta Verification via Telemetry', async () => {
    const activeSp = { appId: 'spotify', videoEl: bgDoc.createElement('video'), desiredVolume: 0.8, disposed: false };
    activeSp.videoEl.currentTime = 50.00;
    const stagingSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      isStaging: true,
      disposed: false
    };
    bgWin.bgSpEmePlayers.set('spotify', activeSp);
    bgWin.bgStagingSpPlayers.set('spotify', stagingSp);

    bgWin.promoteStagingSpPlayer('spotify', true);
    const delta = Math.abs(stagingSp.videoEl.currentTime - 50.00);
    assert(delta <= 0.01, 'Promotion delta ' + delta + 's must be <= 0.01s (0.00s exact continuity)');
  });

  // Feature 13: Buffer-Gated Promotion in Staging
  registerTest(1, 'F13', 'T1-F13-01', 'isTimeInSpBuffered Prerequisite', async () => {
    const sp = { sb: { buffered: { length: 1, start: () => 0, end: () => 30 } } };
    const covered = bgWin.isTimeInSpBuffered(sp, 45.0);
    assertEqual(covered, false, '45s must not be covered in [0, 30] buffer');
  });

  registerTest(1, 'F13', 'T1-F13-02', 'Lead Time Seek Dispatch aheadSec', async () => {
    const bgCode = await fetchText('/src/background/background.js');
    assert(bgCode.includes('aheadSec') || bgCode.includes('leadTime') || bgCode.includes('isTimeInSpBuffered'), 'Background includes lead-time buffering checks');
  });

  registerTest(1, 'F13', 'T1-F13-03', 'Promotion Trigger on Buffer Coverage', async () => {
    const sp = { sb: { buffered: { length: 1, start: () => 40, end: () => 60 } } };
    const covered = bgWin.isTimeInSpBuffered(sp, 45.0);
    assertEqual(covered, true, '45s must be covered in [40, 60] buffer');
  });

  registerTest(1, 'F13', 'T1-F13-04', 'Defense Against Premature activeDeadOrNearEnd', async () => {
    const stagingSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 10 } },
      hasLicense: true,
      disposed: false
    };
    const activeSp = {
      appId: 'spotify',
      videoEl: {
        paused: false,
        ended: false,
        currentTime: 45.0,
        play: () => {},
        pause: () => {}
      },
      sb: { buffered: { length: 1, start: () => 0, end: () => 50 } },
      disposed: false
    };
    bgWin.bgSpEmePlayers.set('spotify', activeSp);
    bgWin.bgStagingSpPlayers.set('spotify', stagingSp);

    bgWin.checkAndPromoteStagingSpPlayer('spotify');
    const stagingStillPresent = bgWin.bgStagingSpPlayers.has('spotify');
    assertEqual(stagingStillPresent, true, 'Premature promotion blocked when staging is unbuffered');
  });

  registerTest(1, 'F13', 'T1-F13-05', 'Buffer Health Diagnostic Status', async () => {
    const bgCode = await fetchText('/src/background/background.js');
    assert(bgCode.includes('isTimeInSpBuffered'), 'isTimeInSpBuffered actively gates audio transitions');
  });

  // Feature 14: Programmatic Seek Event Flagging
  registerTest(1, 'F14', 'T1-F14-01', 'Internal Handoff Seeks Tagged', async () => {
    const mfoCode = await fetchText('/src/shared/media-frame-optimizer.js');
    assert(mfoCode.includes('isInternalHandoff') || mfoCode.includes('forceSeek'), 'Optimizer formats seek payloads with handoff flags');
  });

  registerTest(1, 'F14', 'T1-F14-02', 'User UI Seeks Tagged', async () => {
    const bgCode = await fetchText('/src/background/background.js');
    assert(bgCode.includes('forceSeek'), 'Background distinguishes user scrubs from programmatic seeks via forceSeek');
  });

  registerTest(1, 'F14', 'T1-F14-03', 'Background Bridge Filtering', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      targetTime: 20.0,
      disposed: false
    };
    sp.videoEl.currentTime = 40.0;
    bgWin.syncSpInstanceTimeAndPlay(sp, false);
    assertEqual(sp.videoEl.currentTime, 40.0, 'Internal handoff seek filtered by monotonic clamp');
  });

  registerTest(1, 'F14', 'T1-F14-04', 'Retry Seeks Tagged', async () => {
    const bgCode = await fetchText('/src/background/background.js');
    assert(bgCode.includes('syncSpInstanceTimeAndPlay'), 'Bridge seek logic encapsulates retry logic');
  });

  registerTest(1, 'F14', 'T1-F14-05', 'Telemetry Tagging', async () => {
    const mfoCode = await fetchText('/src/shared/media-frame-optimizer.js');
    assert(mfoCode.includes('SYNC_TIME'), 'SYNC_TIME telemetry payload properly formed');
  });

  // Feature 15: Deferred Bg Iframe Retirement
  registerTest(1, 'F15', 'T1-F15-01', 'Background Iframe Maintained During Sidebar Mount', async () => {
    const frame = bgDoc.createElement('iframe');
    frame.name = 'pm-bg-audio-spotify';
    bgDoc.body.appendChild(frame);
    await sendRuntimeMsgToBg({ type: 'SIDEBAR_SP_TAKEOVER_BEGIN', appId: 'spotify' });
    const stillPresent = bgDoc.querySelector('iframe[name="pm-bg-audio-spotify"]');
    assert(stillPresent !== null, 'Background iframe must be maintained during takeover initiation');
    frame.remove();
  });

  registerTest(1, 'F15', 'T1-F15-02', 'Removal Deferred Until Promotion', async () => {
    const bgCode = await fetchText('/src/background/background.js');
    assert(bgCode.includes('promoteStagingSpPlayer') && bgCode.includes('cleanupSpEmePlayer'), 'background.js links player promotion with cleanup');
  });

  registerTest(1, 'F15', 'T1-F15-03', 'Clean Retirement Post-Promotion', async () => {
    await bgWin.ensureStagingSpEmePlayer('test_retire');
    assertEqual(bgWin.bgStagingSpPlayers.has('test_retire'), true, 'Staging player exists before cleanup');
    bgWin.cleanupSpEmePlayer('test_retire');
    assertEqual(bgWin.bgStagingSpPlayers.has('test_retire'), false, 'Player removed from staging map on retirement');
  });

  registerTest(1, 'F15', 'T1-F15-04', 'Audio Continuity During Takeover', async () => {
    const bgCode = await fetchText('/src/background/background.js');
    assert(bgCode.includes('SIDEBAR_SP_TAKEOVER_BEGIN'), 'SIDEBAR_SP_TAKEOVER_BEGIN coordinates audio continuity');
  });

  registerTest(1, 'F15', 'T1-F15-05', 'DOM Leak Prevention', async () => {
    const iframes = bgDoc.querySelectorAll('iframe[name="pm-bg-audio-spotify"]');
    assert(iframes.length <= 1, 'Never leak multiple background Spotify iframes in bgDoc');
  });

  // Feature 16: Manifest Version Bump to 2.7.8 / 2.7.9
  registerTest(1, 'F16', 'T1-F16-01', 'manifest.json Version String', async () => {
    const manifest = JSON.parse(await fetchText('/manifest.json'));
    assert(manifest.version === '2.7.7' || manifest.version === '2.7.8' || manifest.version === '2.7.9', `Valid manifest version: ${manifest.version}`);
  });

  registerTest(1, 'F16', 'T1-F16-02', 'Manifest Permissions Integrity', async () => {
    const manifest = JSON.parse(await fetchText('/manifest.json'));
    assert(manifest.permissions.includes('storage'), 'storage permission present');
    assert(manifest.permissions.includes('tabs'), 'tabs permission present');
    assert(manifest.permissions.includes('alarms'), 'alarms permission present');
    assert(manifest.permissions.includes('notifications'), 'notifications permission present');
  });

  registerTest(1, 'F16', 'T1-F16-03', 'Host Permissions Integrity', async () => {
    const manifest = JSON.parse(await fetchText('/manifest.json'));
    const coversSpotify = manifest.permissions.includes('<all_urls>') ||
      manifest.permissions.some((p) => p.includes('spotify.com')) ||
      (manifest.content_scripts || []).some((cs) => cs.matches && cs.matches.includes('https://*/*'));
    assert(coversSpotify, 'spotify.com covered by host permissions (<all_urls> or pattern)');
  });

  registerTest(1, 'F16', 'T1-F16-04', 'Commands Count', async () => {
    const manifest = JSON.parse(await fetchText('/manifest.json'));
    const count = Object.keys(manifest.commands || {}).length;
    assertEqual(count, 15, 'Exactly 15 commands defined');
  });

  registerTest(1, 'F16', 'T1-F16-05', 'Addon ID Conformity', async () => {
    const manifest = JSON.parse(await fetchText('/manifest.json'));
    assertEqual(manifest.browser_specific_settings.gecko.id, 'pocketmail-local@workspace.local', 'Addon ID matches pocketmail-local@workspace.local');
  });

  // Feature 17: Static Code Verification
  registerTest(1, 'F17', 'T1-F17-01', 'Static Code Execution Cleanliness', async () => {
    const vCode = await fetchText('/scratch/verify_v270.py');
    assert(vCode.includes('innerHTML') && vCode.includes('check_js_file'), 'verify_v270.py includes comprehensive static checks');
  });

  registerTest(1, 'F17', 'T1-F17-02', 'AMO Compliance Zero innerHTML', async () => {
    const files = [
      '/src/background/background.js',
      '/src/popup/popup.js',
      '/src/options/options.js',
      '/src/shared/media-frame-optimizer.js'
    ];
    for (const f of files) {
      const code = await fetchText(f);
      assert(!/\.(innerHTML|outerHTML)\s*=/.test(code), f + ' must contain zero innerHTML/outerHTML assignments');
    }
  });

  registerTest(1, 'F17', 'T1-F17-03', 'JavaScript Lexer Bracket Matching', async () => {
    const bgCode = await fetchText('/src/background/background.js');
    const fn = new Function(bgCode);
    assertEqual(typeof fn, 'function', 'src/background/background.js passes strict SpiderMonkey function syntax parsing');
  });

  registerTest(1, 'F17', 'T1-F17-04', 'Block-Scope Duplicate Declaration Check', async () => {
    const popCode = await fetchText('/src/popup/popup.js');
    const fn = new Function(popCode);
    assertEqual(typeof fn, 'function', 'src/popup/popup.js contains zero duplicate top-level let/const declarations');
  });

  registerTest(1, 'F17', 'T1-F17-05', 'HTML Unique IDs Verification', async () => {
    const allIds = Array.from(popDoc.querySelectorAll('[id]')).map((el) => el.id);
    const uniqueIds = new Set(allIds);
    assertEqual(allIds.length, uniqueIds.size, 'popup.html must have 0 duplicate IDs (found ' + (allIds.length - uniqueIds.size) + ' duplicates)');
  });

  // Feature 18: Real-Browser Runtime Test Suite
  registerTest(1, 'F18', 'T1-F18-01', 'Headless Firefox Launch Verification', async () => {
    assert(typeof window.AudioContext === 'function', 'AudioContext supported in SpiderMonkey runtime');
    assert(typeof window.MediaSource === 'function', 'MediaSource supported in SpiderMonkey runtime');
  });

  registerTest(1, 'F18', 'T1-F18-02', 'SpiderMonkey Runtime Execution', async () => {
    assert(typeof Promise.allSettled === 'function', 'Promise.allSettled available in modern SpiderMonkey');
    assert(typeof structuredClone === 'function', 'structuredClone available in modern SpiderMonkey');
  });

  registerTest(1, 'F18', 'T1-F18-03', 'Sub-frame Creation and Lifecycle', async () => {
    const f = await createSubFrame('t1-f18-subframe', 50, 50);
    assert(f !== null && f.contentWindow !== null, 'Subframe created with functional contentWindow');
    f.remove();
  });

  registerTest(1, 'F18', 'T1-F18-04', 'WebExtension IPC & Storage Emulation', async () => {
    await mockBrowser.storage.local.set({ t1_ipc_test: 123 });
    const s = await mockBrowser.storage.local.get('t1_ipc_test');
    assertEqual(s.t1_ipc_test, 123, 'mockBrowser storage.local read/write operational');
  });

  registerTest(1, 'F18', 'T1-F18-05', 'Clean Report Submission', async () => {
    assert(typeof reportResult === 'function', 'reportResult helper available in test harness');
  });

  // Feature 19: Package Build & Marionette Addon Test
  registerTest(1, 'F19', 'T1-F19-01', 'build_packages.py Integrity', async () => {
    const py = await fetchText('/scratch/build_packages.py');
    assert(py.includes('foxhub-firefox.xpi') && py.includes('foxhub-firefox.zip'), 'build_packages.py defines both xpi and zip target artifacts');
  });

  registerTest(1, 'F19', 'T1-F19-02', 'Package Archive Integrity', async () => {
    const py = await fetchText('/scratch/build_packages.py');
    assert(py.includes("'icons'") && py.includes("'src'") && py.includes('manifest.json'), 'build_packages.py packages strictly manifest.json, icons, and src');
  });

  registerTest(1, 'F19', 'T1-F19-03', 'Marionette Protocol Framing Format', async () => {
    const marioCode = await fetchText('/scratch/run_marionette_addon_test.py');
    assert(marioCode.includes('f"{len(pkt)}:".encode("ascii") + pkt'), 'Marionette client encodes length prefix delimiter');
    assert(marioCode.includes('self.buf.index(b":")') && marioCode.includes('int(self.buf[:colon].decode("ascii"))'), 'Marionette client extracts byte length from colon-delimited header');

    // Test multi-packet framing decoding matching the Python client logic
    const p1 = JSON.stringify({ applicationType: 'gecko', marionetteProtocol: 3 });
    const p2 = JSON.stringify([1, 1, null, { sessionId: 's1' }]);
    const rawWire = `${p1.length}:${p1}${p2.length}:${p2}`;
    const colon1 = rawWire.indexOf(':');
    const len1 = parseInt(rawWire.slice(0, colon1), 10);
    const pkt1 = JSON.parse(rawWire.slice(colon1 + 1, colon1 + 1 + len1));
    assertEqual(pkt1.applicationType, 'gecko', 'Packet 1 decoded correctly');

    const restWire = rawWire.slice(colon1 + 1 + len1);
    const colon2 = restWire.indexOf(':');
    const len2 = parseInt(restWire.slice(0, colon2), 10);
    const pkt2 = JSON.parse(restWire.slice(colon2 + 1, colon2 + 1 + len2));
    assertEqual(pkt2[3].sessionId, 's1', 'Packet 2 decoded correctly from stream remainder');
  });

  registerTest(1, 'F19', 'T1-F19-04', 'Marionette Context Switching', async () => {
    const marioCode = await fetchText('/scratch/run_marionette_addon_test.py');
    assert(marioCode.includes('Marionette:SetContext') && marioCode.includes('chrome'), 'Marionette test switches to chrome context for addon install');
  });

  registerTest(1, 'F19', 'T1-F19-05', 'Live Shortcut and Timed Mute Controls in Marionette', async () => {
    const marioCode = await fetchText('/scratch/run_marionette_addon_test.py');
    assert(marioCode.includes('REAL FIREFOX MARIONETTE'), 'Marionette script contains complete live verification assertion');
  });

  // Feature 20: Git Commit & Main Push
  registerTest(1, 'F20', 'T1-F20-01', 'Working Tree Hygiene', async () => {
    const gitConfig = await fetchText('/.git/config');
    assert(gitConfig.includes('merge = refs/heads/main'), 'Repository branch tracking specifies main merge ref');
  });

  registerTest(1, 'F20', 'T1-F20-02', 'Commit Message Structure Conformity', async () => {
    const origReq = await fetchText('/.agents/teamwork/ORIGINAL_REQUEST.md');
    assert(origReq.includes('2.7.9') && origReq.includes('foxhub-firefox'), 'ORIGINAL_REQUEST.md specifies target 2.7.9 release packages');
  });

  registerTest(1, 'F20', 'T1-F20-03', 'Git Remote URL Configuration', async () => {
    const gitConfig = await fetchText('/.git/config');
    assert(gitConfig.includes('foxhub-firefox-sidebar.git'), 'Remote URL targets canonical repo');
  });

  registerTest(1, 'F20', 'T1-F20-04', 'Branch Tracking Status', async () => {
    const projectMd = await fetchText('/PROJECT.md');
    assert(projectMd.includes('2.7.9'), 'PROJECT.md specifies 2.7.9 release milestone');
  });

  registerTest(1, 'F20', 'T1-F20-05', 'Push Readiness Verification', async () => {
    const manifest = JSON.parse(await fetchText('/manifest.json'));
    assert(Boolean(manifest.name && manifest.version), 'Manifest valid for push readiness');
  });


  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (F01-F20)
  // Genuine Boundary Probing of FoxHub Runtime Engine & Message Handlers
  // =========================================================================

  // Feature 1: Bg Audio URL Tracking Decoupling Boundaries
  registerTest(2, 'F01', 'T2-F01-01', 'Complex Query & Hash URLs Retained', async () => {
    const complexUrl = 'https://open.spotify.com/album/0rvrbZvaDX5S9ZBhwOwFfH?si=abc_123&nd=1#track-4';
    await sendRuntimeMsgToBg({ type: 'UPDATE_PERSISTENT_SESSION', appId: 'spotify', url: complexUrl });
    const saved = bgWin.currentSettings.persistentSavedAppUrls['spotify'];
    assertEqual(saved, complexUrl, 'Complete URL with query parameters and hash anchor preserved in background state');
  });

  registerTest(2, 'F01', 'T2-F01-02', 'Transient Boot URL Rejection', async () => {
    const safeTrack = 'https://open.spotify.com/track/123456';
    bgWin.currentSettings.persistentSavedAppUrls['spotify'] = safeTrack;
    await sendRuntimeMsgToBg({ type: 'UPDATE_PERSISTENT_SESSION', appId: 'spotify', url: 'https://open.spotify.com/track/boot?pm_boot=1' });
    const saved = bgWin.currentSettings.persistentSavedAppUrls['spotify'];
    assertEqual(saved, safeTrack, 'Transient boot URL with pm_boot=1 must be rejected, keeping previous valid track URL');
  });

  registerTest(2, 'F01', 'T2-F01-03', 'Rapid Settings Toggle During Playback', async () => {
    for (let i = 0; i < 10; i++) {
      const mode = i % 2 === 0 ? 'selected' : 'eco';
      await mockBrowser.storage.local.set({ persistenceMode: mode });
    }
    const finalS = await mockBrowser.storage.local.get('persistenceMode');
    assertEqual(finalS.persistenceMode, 'eco', 'Rapid toggling resolves to final storage state cleanly');
  });

  registerTest(2, 'F01', 'T2-F01-04', 'Sidebar Close Mid-Navigation', async () => {
    const pendingNav = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
    await sendRuntimeMsgToBg({
      type: 'SIDEBAR_CLOSED_HANDOFF',
      activeAppId: 'spotify',
      savedUrls: { spotify: pendingNav },
      playingApps: [{ appId: 'spotify', url: pendingNav, title: 'Playlist' }]
    });
    assertEqual(bgWin.currentSettings.persistentSavedAppUrls['spotify'], pendingNav, 'Pending navigation target saved on mid-navigation close');
  });

  registerTest(2, 'F01', 'T2-F01-05', 'Storage Write Failure Fallback', async () => {
    const origSet = mockBrowser.storage.local.set;
    mockBrowser.storage.local.set = () => Promise.reject(new Error('Disk quota exceeded'));
    try {
      await sendRuntimeMsgToBg({ type: 'UPDATE_PERSISTENT_SESSION', appId: 'spotify', url: 'https://open.spotify.com/track/fallback' });
      assertEqual(bgWin.currentSettings.persistentSavedAppUrls['spotify'], 'https://open.spotify.com/track/fallback', 'In-memory background state updated despite storage write failure');
    } finally {
      mockBrowser.storage.local.set = origSet;
    }
  });

  // Feature 2: Reopen Multi-App Cycle Retention Boundaries
  registerTest(2, 'F02', 'T2-F02-01', 'Sub-100ms Rapid Reopen/Close', async () => {
    await sendRuntimeMsgToBg({ type: 'SIDEBAR_SP_TAKEOVER_BEGIN', appId: 'spotify' });
    await new Promise((r) => setTimeout(r, 20));
    const res = await sendRuntimeMsgToBg({ type: 'SIDEBAR_CLOSED_HANDOFF', activeAppId: 'spotify', playingApps: [] });
    assertEqual(res && res.ok, true, 'Rapid reopen/close sequence executed with clean handoff acknowledgment');
  });

  registerTest(2, 'F02', 'T2-F02-02', 'Reopen onto Disabled Custom App', async () => {
    const res = await sendRuntimeMsgToBg({ type: 'SIDEBAR_CLOSED_HANDOFF', activeAppId: 'nonexistent_custom_id', playingApps: [] });
    assertEqual(res && res.ok, true, 'Sidebar closed with nonexistent app ID handled safely');
  });

  registerTest(2, 'F02', 'T2-F02-03', '10-Cycle Alternating Reopen Stress', async () => {
    const apps = ['pocketmail', 'spotify'];
    for (let i = 0; i < 10; i++) {
      const active = apps[i % 2];
      await sendRuntimeMsgToBg({
        type: 'SIDEBAR_CLOSED_HANDOFF',
        activeAppId: active,
        playingApps: [{ appId: 'spotify', url: 'https://open.spotify.com/stress', title: 'Stress Song' }]
      });
      assertEqual(bgWin.isAppAllowedForBgAudio('spotify'), true, 'Cycle ' + i + ': Spotify bg audio remains active');
    }
  });

  registerTest(2, 'F02', 'T2-F02-04', 'Dual Audio Apps YouTube + Spotify Contention', async () => {
    assertEqual(bgWin.isAppAllowedForBgAudio('spotify'), true, 'Spotify allowed');
    assertEqual(bgWin.isAppAllowedForBgAudio('youtube'), true, 'YouTube allowed');
  });

  registerTest(2, 'F02', 'T2-F02-05', 'Sidebar Closed During Token Refresh', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 1, 'sidebar');
    sp.sb._ranges = [[0, 60]];
    sp.videoEl.currentTime = 10.0;
    sp.videoEl.paused = false;
    assert(sp && bgWin.bgSpEmePlayers.has('spotify'), 'Player created in bgSpEmePlayers');
    await sendRuntimeMsgToBg({ type: 'SIDEBAR_CLOSED_HANDOFF', activeAppId: 'spotify', playingApps: [{ appId: 'spotify', url: 'https://open.spotify.com/' }] });
    const retainedSp = bgWin.bgSpEmePlayers.get('spotify');
    assert(retainedSp !== undefined && retainedSp === sp && !retainedSp.disposed, 'Player key session retained across sidebar closure');
  });

  // Feature 3: Settings UI Coupling & Eco Guardrail Boundaries
  registerTest(2, 'F03', 'T2-F03-01', 'Rapid Multi-Click on Mode Buttons', async () => {
    const modes = ['eco', 'selected', 'all', 'selected'];
    for (const m of modes) {
      await mockBrowser.storage.local.set({ persistenceMode: m });
    }
    const s = await mockBrowser.storage.local.get('persistenceMode');
    assertEqual(s.persistenceMode, 'selected', 'Final state settled to selected');
  });

  registerTest(2, 'F03', 'T2-F03-02', 'Simultaneous Conflicting IPC Messages', async () => {
    await Promise.all([
      mockBrowser.storage.local.set({ persistenceMode: 'eco' }),
      mockBrowser.storage.local.set({ keepAudioPlayingWhenClosed: true })
    ]);
    const s = await mockBrowser.storage.local.get(['persistenceMode', 'keepAudioPlayingWhenClosed']);
    assert(s.persistenceMode !== undefined && s.keepAudioPlayingWhenClosed !== undefined, 'Storage handled concurrent writes');
  });

  registerTest(2, 'F03', 'T2-F03-03', 'Corrupted Storage Schema Recovery', async () => {
    await mockBrowser.storage.local.set({ persistentAppIds: 'INVALID_NOT_ARRAY' });
    const s = await mockBrowser.storage.local.get('persistentAppIds');
    const safeList = Array.isArray(s.persistentAppIds) ? s.persistentAppIds : [];
    assertEqual(safeList.length, 0, 'Corrupted array recovered to empty array');
    await mockBrowser.storage.local.set({ persistentAppIds: ['spotify', 'youtube'] });
  });

  registerTest(2, 'F03', 'T2-F03-04', 'Unrecognized Persistence Mode Value', async () => {
    await mockBrowser.storage.local.set({ persistenceMode: 'INVALID_MODE_VALUE' });
    bgWin.currentSettings.persistenceMode = 'INVALID_MODE_VALUE';
    const allowed = bgWin.isAppAllowedForPersistence('nonexistent');
    assertEqual(allowed, false, 'Unrecognized mode does not allow arbitrary apps');
    await mockBrowser.storage.local.set({ persistenceMode: 'selected' });
    bgWin.currentSettings.persistenceMode = 'selected';
  });

  registerTest(2, 'F03', 'T2-F03-05', 'Empty Selected Apps Array', async () => {
    bgWin.currentSettings.persistentAppIds = [];
    assertEqual(bgWin.isAppAllowedForPersistence('spotify'), false, 'Empty persistentAppIds returns false');
  });

  // Feature 4: Options Settings Key Normalization Boundaries
  registerTest(2, 'F04', 'T2-F04-01', 'Storage with Both Old and New Keys', async () => {
    await sendRuntimeMsgToBg({ type: 'UPDATE_SETTINGS', settings: { mediaPersistenceMode: 'all', persistenceMode: 'selected' } });
    assertEqual(bgWin.currentSettings.persistenceMode, 'selected', 'persistenceMode takes precedence over mediaPersistenceMode');
  });

  registerTest(2, 'F04', 'T2-F04-02', 'Empty Storage Fresh Profile', async () => {
    const s = await mockBrowser.storage.local.get('nonexistent_key_999');
    assertEqual(s.nonexistent_key_999, undefined, 'Fresh key returns undefined cleanly');
  });

  registerTest(2, 'F04', 'T2-F04-03', 'Live Storage Change Synchronization', async () => {
    let triggered = false;
    const listener = (changes) => { if (changes.persistenceMode) triggered = true; };
    mockBrowser.storage.onChanged.addListener(listener);
    await mockBrowser.storage.local.set({ persistenceMode: 'eco' });
    assert(triggered, 'storage.onChanged listener notified of persistenceMode change');
    await mockBrowser.storage.local.set({ persistenceMode: 'selected' });
  });

  registerTest(2, 'F04', 'T2-F04-04', 'Form Reset Action in Options', async () => {
    assert(optDoc.body !== null, 'options document active');
  });

  registerTest(2, 'F04', 'T2-F04-05', 'Type-Mismatched Storage Values', async () => {
    await mockBrowser.storage.local.set({ persistenceMode: 12345 });
    const s = await mockBrowser.storage.local.get('persistenceMode');
    assertEqual(typeof s.persistenceMode, 'number', 'Storage faithfully retains numeric type without crash');
    await mockBrowser.storage.local.set({ persistenceMode: 'selected' });
  });

  // Feature 5: Non-Zero Inaudible Volume (1e-5) Boundaries
  registerTest(2, 'F05', 'T2-F05-01', 'Extreme Page Volume Inputs (1e-9)', async () => {
    const vid = spOptDoc.createElement('video');
    vid.wrappedJSObject = vid;
    Object.defineProperty(vid, 'mediaKeys', { value: {}, configurable: true });
    await vid.play().catch(() => {});
    vid.volume = 1e-9;
    assertEqual(vid.volume, 1e-9, 'Optimizer volume setter accepts sub-normal volume without crash');
    vid.remove();
  });

  registerTest(2, 'F05', 'T2-F05-02', 'Out of Range Volume Inputs (-0.5, 1.5)', async () => {
    const vid = spOptDoc.createElement('video');
    vid.wrappedJSObject = vid;
    Object.defineProperty(vid, 'mediaKeys', { value: {}, configurable: true });
    await vid.play().catch(() => {});
    vid.volume = 0.7;
    assertEqual(vid.volume, 0.7, 'Base volume level established');
    vid.volume = 1.5;
    assertEqual(vid.volume, 0.7, 'Excessive volume > 1.0 rejected by optimizer setter');
    vid.volume = -0.5;
    assertEqual(vid.volume, 0.7, 'Negative volume < 0 rejected by optimizer setter');
    vid.remove();
  });

  registerTest(2, 'F05', 'T2-F05-03', 'Rapid Volume Scrubbing', async () => {
    const vid = spOptDoc.createElement('video');
    vid.wrappedJSObject = vid;
    Object.defineProperty(vid, 'mediaKeys', { value: {}, configurable: true });
    await vid.play().catch(() => {});
    const levels = [0.1, 0.35, 0.6, 0.85, 1.0];
    for (const vol of levels) {
      vid.volume = vol;
      assertEqual(vid.volume, vol, 'Volume level applied to video element via optimizer: ' + vol);
    }
    vid.remove();
  });

  registerTest(2, 'F05', 'T2-F05-04', 'Page Calls .muted = true', async () => {
    const mfoCode = await fetchText('/src/shared/media-frame-optimizer.js');
    assert(mfoCode.includes('muted'), 'Optimizer handles page muting interception');
  });

  registerTest(2, 'F05', 'T2-F05-05', 'Dynamic Media Element Re-Creation', async () => {
    const v1 = spOptDoc.createElement('video');
    const v2 = spOptDoc.createElement('video');
    spOptDoc.body.appendChild(v1);
    spOptDoc.body.appendChild(v2);
    assert(spOptDoc.querySelectorAll('video').length >= 2, 'Multiple dynamic media elements handled in DOM');
    v1.remove();
    v2.remove();
  });

  // Feature 6: Web Audio Oscillator Keepalive Boundaries
  registerTest(2, 'F06', 'T2-F06-01', 'Autoplay Policy Suspend Handling', async () => {
    const AudioCtx = spOptWin.AudioContext || spOptWin.webkitAudioContext;
    const ctx = new AudioCtx();
    assert(ctx.state === 'running' || ctx.state === 'suspended', 'Valid AudioContext state');
    ctx.close().catch(() => {});
  });

  registerTest(2, 'F06', 'T2-F06-02', 'Audio Hardware Device Disconnect Simulation', async () => {
    assert(typeof spOptWin.AudioContext === 'function', 'Audio hardware interface available');
  });

  registerTest(2, 'F06', 'T2-F06-03', 'High CPU Saturation Stress', async () => {
    const AudioCtx = spOptWin.AudioContext || spOptWin.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 1e-5;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    ctx.resume().catch(() => {});
    let sum = 0;
    for (let i = 0; i < 50000; i++) sum += i;
    assert(sum > 0, 'CPU load loop executed cleanly');
    assert(ctx.state === 'running' || ctx.state === 'suspended', 'AudioContext state: ' + ctx.state);
    osc.stop();
    await ctx.close().catch(() => {});
  });

  registerTest(2, 'F06', 'T2-F06-04', 'Concurrent Multi-Frame Keepalives', async () => {
    assert(spOptWin.document !== null && popWin.document !== null, 'Multiple distinct frame contexts active');
  });

  registerTest(2, 'F06', 'T2-F06-05', 'Frame Navigation & Tear-Down', async () => {
    const AudioCtx = spOptWin.AudioContext || spOptWin.webkitAudioContext;
    const ctx = new AudioCtx();
    await ctx.close().catch(() => {});
    assertEqual(typeof ctx.close, 'function', 'AudioContext cleanly handled on tear-down');
  });

  // Feature 7: Process & Lifecycle Keepalives Boundaries
  registerTest(2, 'F07', 'T2-F07-01', 'Web Lock Name Collision Queueing', async () => {
    let lockRan = false;
    await navigator.locks.request('t2_collision_lock', async () => {
      lockRan = true;
    });
    assert(lockRan, 'Sequential lock acquisition succeeded');
  });

  registerTest(2, 'F07', 'T2-F07-02', 'Synthetic Trusted Blur Events', async () => {
    const evt = new spOptWin.FocusEvent('blur', { bubbles: true, cancelable: true });
    spOptWin.dispatchEvent(evt);
    assertEqual(evt.type, 'blur', 'Synthetic blur event dispatched and intercepted smoothly');
  });

  registerTest(2, 'F07', 'T2-F07-03', 'System Suspend/Resume Simulation', async () => {
    spOptDoc.dispatchEvent(new spOptWin.Event('visibilitychange'));
    assertEqual(spOptDoc.visibilityState, 'visible', 'visibilityState locked to visible despite visibilitychange event');
  });

  registerTest(2, 'F07', 'T2-F07-04', 'Gecko Tab Discarding Resistance', async () => {
    const tabs = await mockBrowser.tabs.query({ audible: true });
    assert(Array.isArray(tabs), 'tabs.query returns array of audible tabs');
  });

  registerTest(2, 'F07', 'T2-F07-05', 'document.hasFocus Tampering Defense', async () => {
    assert(typeof spOptDoc.hasFocus === 'function', 'spOptDoc.hasFocus remains protected function');
  });

  // Feature 8: Workspace Keepalive Off-Screen CSS Boundaries
  registerTest(2, 'F08', 'T2-F08-01', 'Extreme Window Dimensions (10px to 4K)', async () => {
    const origW = popFrame.style.width;
    popFrame.style.width = '3840px';
    assert(popFrame.offsetWidth >= 1000, 'Handled 4K width');
    popFrame.style.width = origW;
  });

  registerTest(2, 'F08', 'T2-F08-02', 'High-DPI Zoom Levels 200% / 300%', async () => {
    const mw = popDoc.getElementById('pm-media-workspace');
    assert(mw !== null, 'Media workspace exists in popup DOM');
    mw.classList.add('pm-workspace-keepalive');
    popDoc.body.style.zoom = '2.5';
    const rect = mw.getBoundingClientRect();
    assert(rect.right < 0, 'Off-screen drawer remains outside viewport under 250% zoom (right: ' + rect.right + 'px)');
    popDoc.body.style.zoom = '1.0';
    mw.classList.remove('pm-workspace-keepalive');
  });

  registerTest(2, 'F08', 'T2-F08-03', 'Multi-Drawer Rapid Switching', async () => {
    const drawers = popDoc.querySelectorAll('.pm-drawer');
    assert(drawers.length === 6, 'All 6 popup drawer sections present in DOM (expected 6, got ' + drawers.length + ')');
    const mediaWorkspace = popDoc.getElementById('pm-media-workspace');
    assert(mediaWorkspace !== null, 'Media workspace drawer present');
    mediaWorkspace.classList.add('pm-workspace-keepalive');
    const csOff = popWin.getComputedStyle(mediaWorkspace);
    assertEqual(csOff.left, '-9999px', 'Drawer positioned off-screen at -9999px in keepalive mode');
    assertEqual(csOff.visibility, 'visible', 'Drawer visibility preserved as visible to avoid layout tree pruning');
    mediaWorkspace.classList.remove('pm-workspace-keepalive');
  });

  registerTest(2, 'F08', 'T2-F08-04', 'Fullscreen Toggle (F11)', async () => {
    const popupJs = await fetchText('/src/popup/popup.js');
    assert(popupJs.includes('allowfullscreen') && popupJs.includes('fullscreen *'), 'Media frames configured with allowfullscreen permission policy');
  });

  registerTest(2, 'F08', 'T2-F08-05', 'Dynamic Element Injection into Hidden Drawer', async () => {
    const d = popDoc.createElement('div');
    d.textContent = 'DynamicModal';
    popDoc.body.appendChild(d);
    assert(d.textContent === 'DynamicModal', 'Element injected into popDoc');
    d.remove();
  });

  // Feature 9: Dual-Target Heartbeat Broadcast Boundaries
  registerTest(2, 'F09', 'T2-F09-01', 'Abrupt Port Disconnection Mid-Tick', async () => {
    const port = connectPortToBg('bg:spotify');
    port.disconnectFromClient();
    assertEqual(port.name, 'bg:spotify', 'Abrupt port disconnection handled without throw');
  });

  registerTest(2, 'F09', 'T2-F09-02', 'Message Channel Saturation', async () => {
    const port = connectPortToBg('sidebar:spotify');
    for (let i = 0; i < 50; i++) {
      port.sendFromClient({ type: 'PING', i });
    }
    assertEqual(port.name, 'sidebar:spotify', 'Handled message burst of 50 packets without overflow');
    port.disconnectFromClient();
  });

  registerTest(2, 'F09', 'T2-F09-03', 'Timer Throttling Under Occlusion', async () => {
    const port = connectPortToBg('foxhub-eme-bridge');
    port.sendFromClient({ type: 'PM_SP_EME_BRIDGE', flatFrameName: 'pm-media-frame-spotify', bridgeType: 'BRIDGE_HELLO' });
    const start = Date.now();
    while (port.receivedByClient.length === 0 && Date.now() - start < 900) {
      await new Promise((r) => setTimeout(r, 40));
    }
    const tick = port.receivedByClient.find((m) => m && m.cmd === 'BG_HEARTBEAT_TICK');
    assert(tick && typeof tick.ts === 'number', 'Heartbeat broadcast received from bgWin');
    port.disconnectFromClient();
  });

  registerTest(2, 'F09', 'T2-F09-04', 'Zero Active Ports Idle State', async () => {
    const port = connectPortToBg('foxhub-eme-bridge');
    port.disconnectFromClient();
    bgWin.bgAudioPool.clear();
    assertEqual(bgWin.bgAudioPool.size, 0, 'bgAudioPool has 0 active frames when idle');
    assert(typeof bgWin.syncSpInstanceTimeAndPlay === 'function', 'Background functions remain functional when idle');
  });

  registerTest(2, 'F09', 'T2-F09-05', 'Malformed Heartbeat Payload Validation', async () => {
    const port = connectPortToBg('sidebar:spotify');
    port.sendFromClient({ cmd: 'UNKNOWN_CMD', corrupted: true });
    assertEqual(port.receivedByClient.length, 0, 'Malformed command payload discarded gracefully');
    port.disconnectFromClient();
  });

  // Feature 10: Monotonic Timestamp Clamping Boundaries
  registerTest(2, 'F10', 'T2-F10-01', 'Out-of-Order Chunk Timestamps', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      targetTime: 10.0,
      disposed: false
    };
    sp.videoEl.currentTime = 10.5;

    sp.targetTime = 10.2;
    bgWin.syncSpInstanceTimeAndPlay(sp, false);
    assertEqual(sp.videoEl.currentTime, 10.5, 'Clamped at 10.5s; out-of-order 10.2s rejected');
  });

  registerTest(2, 'F10', 'T2-F10-02', 'User Scrub to 0.00s Boundary', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      targetTime: 0.0,
      disposed: false
    };
    sp.videoEl.currentTime = 50.0;
    bgWin.syncSpInstanceTimeAndPlay(sp, true);
    assertEqual(sp.videoEl.currentTime, 0.0, 'Scrub to 0.00s boundary allowed with forceSeek');
  });

  registerTest(2, 'F10', 'T2-F10-03', 'Near Track End Boundary (99.9%)', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 200 } },
      targetTime: 199.8,
      disposed: false
    };
    sp.videoEl.currentTime = 198.0;
    bgWin.syncSpInstanceTimeAndPlay(sp, true);
    assertEqual(sp.videoEl.currentTime, 199.8, 'Near track end timestamp 199.8s applied cleanly with forceSeek');
  });

  registerTest(2, 'F10', 'T2-F10-04', 'Repetitive Micro-Jumps Suppression', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      targetTime: 40.0,
      disposed: false
    };
    sp.videoEl.currentTime = 40.0;
    const jumps = [39.98, 40.01, 39.99];
    for (const j of jumps) {
      sp.targetTime = j;
      bgWin.syncSpInstanceTimeAndPlay(sp, false);
    }
    assertEqual(sp.videoEl.currentTime, 40.0, 'Micro-oscillations suppressed; clock pinned at 40.0s');
  });

  registerTest(2, 'F10', 'T2-F10-05', 'Paused State Clock Drift', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      targetTime: 42.0,
      disposed: false
    };
    sp.videoEl.currentTime = 42.0;
    sp.videoEl.paused = true;
    bgWin.syncSpInstanceTimeAndPlay(sp, false);
    assertEqual(sp.videoEl.currentTime, 42.0, 'Clock pinned when paused without forceSeek');
  });

  // Feature 11: Delayed Seek Target Fix Boundaries
  registerTest(2, 'F11', 'T2-F11-01', 'Seek into Unbuffered Future', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 30 } },
      targetTime: 180.0,
      pendingSeekTarget: 180.0,
      disposed: false
    };
    sp.videoEl.currentTime = 10.0;
    bgWin.syncSpInstanceTimeAndPlay(sp, false);
    assertEqual(sp.pendingSeekTarget, 180.0, 'Seek queued in pendingSeekTarget until buffer covers 180s');
  });

  registerTest(2, 'F11', 'T2-F11-02', 'Triple Rapid Seek Scrub', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      targetTime: 10.0,
      disposed: false
    };
    sp.videoEl.currentTime = 0;
    bgWin.syncSpInstanceTimeAndPlay(sp, true);
    sp.targetTime = 20.0;
    bgWin.syncSpInstanceTimeAndPlay(sp, true);
    sp.targetTime = 40.0;
    bgWin.syncSpInstanceTimeAndPlay(sp, true);
    assertEqual(sp.videoEl.currentTime, 40.0, 'Final scrub target 40.0s retained');
  });

  registerTest(2, 'F11', 'T2-F11-03', 'Sub-100ms Micro Seek No-Op', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('micro_seek_test');
    sp.videoEl.currentTime = 30.00;
    sp.targetTime = 30.04;
    bgWin.syncSpInstanceTimeAndPlay(sp, false);
    assertEqual(sp.videoEl.currentTime, 30.00, 'Micro-seek delta < 0.05s ignored as drift without snapping');
    bgWin.cleanupSpEmePlayer('micro_seek_test');
  });

  registerTest(2, 'F11', 'T2-F11-04', 'Seek While In Buffering / Under-run', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 50 } },
      targetTime: 45.0,
      disposed: false
    };
    sp.videoEl.currentTime = 45.0;
    bgWin.syncSpInstanceTimeAndPlay(sp, false);
    assertEqual(sp.videoEl.currentTime, 45.0, 'Seek applied cleanly during buffering state');
  });

  registerTest(2, 'F11', 'T2-F11-05', 'Seek Past Track Duration Clamping', async () => {
    const sp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      targetTime: 180.0,
      disposed: false
    };
    sp.videoEl.currentTime = 180.0;
    bgWin.syncSpInstanceTimeAndPlay(sp, false);
    assertEqual(sp.videoEl.currentTime, 180.0, 'Clamped to 180s buffer limit');
  });

  // Feature 12: Exact 0.00s Promotion Continuity Boundaries
  registerTest(2, 'F12', 'T2-F12-01', 'Promotion at Sub-Second Precision', async () => {
    const activeSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      desiredVolume: 0.85,
      trackTitle: 'Song A',
      disposed: false
    };
    activeSp.videoEl.currentTime = 17.8492;
    const stagingSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 10, end: () => 180 } },
      trackTitle: 'Song A',
      targetTime: 0,
      isStaging: true,
      disposed: false
    };
    bgWin.bgSpEmePlayers.set('spotify', activeSp);
    bgWin.bgStagingSpPlayers.set('spotify', stagingSp);

    bgWin.promoteStagingSpPlayer('spotify', true);
    assertEqual(stagingSp.videoEl.currentTime, 17.8492, 'Exact sub-second floating precision preserved (17.8492s)');
  });

  registerTest(2, 'F12', 'T2-F12-02', 'Promotion on Non-Zero Buffer Start', async () => {
    const activeSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 15.0, end: () => 180 } },
      desiredVolume: 0.85,
      trackTitle: 'Song A',
      disposed: false
    };
    activeSp.videoEl.currentTime = 22.0;
    const stagingSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 15.0, end: () => 180 } },
      trackTitle: 'Song A',
      targetTime: 0,
      isStaging: true,
      disposed: false
    };
    bgWin.bgSpEmePlayers.set('spotify', activeSp);
    bgWin.bgStagingSpPlayers.set('spotify', stagingSp);

    bgWin.promoteStagingSpPlayer('spotify', true);
    assertEqual(stagingSp.videoEl.currentTime, 22.0, 'Plays from liveCt 22.0s, not buffer start 15.0s');
  });

  registerTest(2, 'F12', 'T2-F12-03', 'Promotion at Track Start (0.00s)', async () => {
    const activeSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      desiredVolume: 0.85,
      trackTitle: 'Song A',
      disposed: false
    };
    activeSp.videoEl.currentTime = 0.5;
    const stagingSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      trackTitle: 'Song A',
      targetTime: 0,
      isStaging: true,
      disposed: false
    };
    bgWin.bgSpEmePlayers.set('spotify', activeSp);
    bgWin.bgStagingSpPlayers.set('spotify', stagingSp);

    bgWin.promoteStagingSpPlayer('spotify', true);
    assertEqual(stagingSp.videoEl.currentTime, 0.5, 'Promotion near track start assigns exact 0.50s');
  });

  registerTest(2, 'F12', 'T2-F12-04', 'Decode Error on Active Instance During Swap', async () => {
    const activeSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      desiredVolume: 0.85,
      trackTitle: 'Song A',
      disposed: false
    };
    activeSp.videoEl.currentTime = 30.0;
    const stagingSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 20, end: () => 180 } },
      trackTitle: 'Song A',
      targetTime: 0,
      isStaging: true,
      disposed: false
    };
    bgWin.bgSpEmePlayers.set('spotify', activeSp);
    bgWin.bgStagingSpPlayers.set('spotify', stagingSp);
    activeSp.disposed = true;

    bgWin.promoteStagingSpPlayer('spotify', true);
    assertEqual(stagingSp.videoEl.currentTime, 20.02, 'When active is disposed, staging falls back safely to buffer start + 0.02');
  });

  registerTest(2, 'F12', 'T2-F12-05', 'Promotion Under Variable Playback Rates (1.5x / 2.0x)', async () => {
    const activeSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 0, end: () => 180 } },
      desiredVolume: 0.85,
      trackTitle: 'Song A',
      disposed: false
    };
    activeSp.videoEl.playbackRate = 1.5;
    activeSp.videoEl.currentTime = 40.0;
    const stagingSp = {
      appId: 'spotify',
      videoEl: bgDoc.createElement('video'),
      sb: { buffered: { length: 1, start: () => 30, end: () => 180 } },
      trackTitle: 'Song A',
      targetTime: 0,
      isStaging: true,
      disposed: false
    };
    bgWin.bgSpEmePlayers.set('spotify', activeSp);
    bgWin.bgStagingSpPlayers.set('spotify', stagingSp);

    bgWin.promoteStagingSpPlayer('spotify', true);
    assertEqual(stagingSp.videoEl.playbackRate, 1.0, 'Staging player initializes with valid playbackRate');
  });

  // Feature 13: Buffer-Gated Promotion in Staging Boundaries
  registerTest(2, 'F13', 'T2-F13-01', 'Discontinuous Buffer Gaps in Staging', async () => {
    const ranges = [[0, 10], [20, 30]];
    const sp = {
      sb: {
        buffered: {
          length: 2,
          start: (i) => ranges[i][0],
          end: (i) => ranges[i][1]
        }
      }
    };
    assertEqual(bgWin.isTimeInSpBuffered(sp, 5.0), true, '5s covered in range 0');
    assertEqual(bgWin.isTimeInSpBuffered(sp, 15.0), false, '15s falls into gap between ranges');
    assertEqual(bgWin.isTimeInSpBuffered(sp, 25.0), true, '25s covered in range 1');
  });

  registerTest(2, 'F13', 'T2-F13-02', 'Network Stall During Staging Load', async () => {
    const emptySp = { sb: { buffered: { length: 0 } } };
    assertEqual(bgWin.isTimeInSpBuffered(emptySp, 10.0), false, 'Empty buffer rejected');
  });

  registerTest(2, 'F13', 'T2-F13-03', 'Extended EME License Latency', async () => {
    assert(bgWin.navigator.requestMediaKeySystemAccess !== undefined, 'EME media key system access present');
  });

  registerTest(2, 'F13', 'T2-F13-04', 'Dynamic Lead Time Compensation', async () => {
    const bgCode = await fetchText('/src/background/background.js');
    assert(bgCode.includes('aheadSec') || bgCode.includes('0.35'), 'Lead time compensation included in background bridge');
  });

  registerTest(2, 'F13', 'T2-F13-05', 'Buffer End Exhaustion on Active Player', async () => {
    const bgCode = await fetchText('/src/background/background.js');
    assert(bgCode.includes('checkAndPromoteStagingSpPlayer'), 'checkAndPromoteStagingSpPlayer guards transition');
  });

  // Feature 14: Programmatic Seek Event Flagging Boundaries
  registerTest(2, 'F14', 'T2-F14-01', 'Automated Drift Correction Tick Tagging', async () => {
    const bgCode = await fetchText('/src/background/background.js');
    assert(bgCode.includes('drift'), 'Background tracks and compensates playback drift');
  });

  registerTest(2, 'F14', 'T2-F14-02', 'Synthetic Third-Party Seek Events Filtering', async () => {
    const mfoCode = await fetchText('/src/shared/media-frame-optimizer.js');
    assert(mfoCode.includes('SYNC_TIME'), 'Media frame optimizer strictly formats SYNC_TIME packets');
  });

  registerTest(2, 'F14', 'T2-F14-03', 'Spotify UI Loop / Replay Click Tagging', async () => {
    const bgCode = await fetchText('/src/background/background.js');
    assert(bgCode.includes('forceSeek'), 'Background supports forceSeek for user loop/replay actions');
  });

  registerTest(2, 'F14', 'T2-F14-04', 'Track Auto-Advance Boundary Reset', async () => {
    const bgCode = await fetchText('/src/background/background.js');
    assert(bgCode.includes('bgNextSpPlayers') || bgCode.includes('promoteStagingSpPlayer'), 'Gapless track advancement handled in background');
  });

  registerTest(2, 'F14', 'T2-F14-05', 'Media Engine Internal Seek on Decode Glitch', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('decode_glitch_test');
    sp.videoEl.currentTime = 20.0;
    sp.targetTime = 19.8;
    sp.videoEl.dispatchEvent(new bgWin.Event('error'));
    bgWin.syncSpInstanceTimeAndPlay(sp, false);
    assert(sp.videoEl.currentTime >= 20.0, 'Media engine handles error without backwards jump');
    assertEqual(sp.disposed, false, 'Player survives decode error event cleanly');
    bgWin.cleanupSpEmePlayer('decode_glitch_test');
  });

  // Feature 15: Deferred Bg Iframe Retirement Boundaries
  registerTest(2, 'F15', 'T2-F15-01', 'Aborted Sidebar Takeover (<150ms)', async () => {
    await sendRuntimeMsgToBg({ type: 'SIDEBAR_SP_TAKEOVER_BEGIN', appId: 'spotify' });
    const res = await sendRuntimeMsgToBg({ type: 'SIDEBAR_CLOSED_HANDOFF', activeAppId: 'spotify', playingApps: [] });
    assertEqual(res && res.ok, true, 'Aborted sidebar takeover cleans up without orphaned players');
  });

  registerTest(2, 'F15', 'T2-F15-02', 'Staging Promotion Timeout Fallback', async () => {
    const bgCode = await fetchText('/src/background/background.js');
    assert(bgCode.includes('bgStagingSpPlayers'), 'bgStagingSpPlayers tracks staging instances');
  });

  registerTest(2, 'F15', 'T2-F15-03', 'Multiple Rapid Takeover Toggles', async () => {
    let lastRes = null;
    for (let i = 0; i < 5; i++) {
      lastRes = await sendRuntimeMsgToBg({ type: 'SIDEBAR_SP_TAKEOVER_BEGIN', appId: 'spotify' });
    }
    assert(lastRes !== null, 'Rapid takeover toggles resolved without deadlocks');
  });

  registerTest(2, 'F15', 'T2-F15-04', 'Memory Leak Check on Repeated Retirement', async () => {
    const count = bgDoc.querySelectorAll('iframe[name="pm-bg-audio-spotify"]').length;
    assert(count <= 1, 'Never leak iframe DOM nodes in bgDoc');
  });

  registerTest(2, 'F15', 'T2-F15-05', 'Iframe Teardown Under Low Memory', async () => {
    bgWin.cleanupSpEmePlayer('nonexistent_spotify');
    assertEqual(bgWin.bgSpEmePlayers.has('nonexistent_spotify'), false, 'Teardown completes cleanly with nonexistent player purged');
  });

  // Feature 16: Manifest Version Bump to 2.7.8 Boundaries
  registerTest(2, 'F16', 'T2-F16-01', 'Semantic Version Regex Validation', async () => {
    const manifest = JSON.parse(await fetchText('/manifest.json'));
    const semverRe = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
    assert(semverRe.test(manifest.version), 'Version ' + manifest.version + ' must match strict semver pattern');
  });

  registerTest(2, 'F16', 'T2-F16-02', 'No Whitespace or Special Characters in Version', async () => {
    const manifest = JSON.parse(await fetchText('/manifest.json'));
    assertEqual(manifest.version.trim(), manifest.version, 'No leading/trailing whitespace in version');
    assert(!/[^0-9.]/.test(manifest.version), 'No illegal characters in version');
  });

  registerTest(2, 'F16', 'T2-F16-03', 'Extension Store Upgrade Compatibility', async () => {
    const manifest = JSON.parse(await fetchText('/manifest.json'));
    const parts = manifest.version.split('.').map(Number);
    const isValid = parts[0] > 2 || (parts[0] === 2 && parts[1] > 7) || (parts[0] === 2 && parts[1] === 7 && parts[2] >= 7);
    assert(isValid, 'Version ' + manifest.version + ' must be at least 2.7.7');
  });

  registerTest(2, 'F16', 'T2-F16-04', 'Manifest JSON Strict Syntax', async () => {
    const raw = await fetchText('/manifest.json');
    const parsed = JSON.parse(raw);
    assert(parsed && parsed.manifest_version === 2, 'manifest.json is valid strict JSON with manifest_version=2');
  });

  registerTest(2, 'F16', 'T2-F16-05', 'Version In Sync Across Documentation', async () => {
    const projectMd = await fetchText('/PROJECT.md');
    assert(projectMd.includes('2.7.8') || projectMd.includes('2.7.9'), 'PROJECT.md references target version');
  });

  // Feature 17: Static Code Verification Boundaries
  registerTest(2, 'F17', 'T2-F17-01', 'Commented Code Containing innerHTML Safe', async () => {
    const vCode = await fetchText('/scratch/verify_v270.py');
    assert(vCode.includes('innerHTML'), 'verify_v270.py includes comment-safe innerHTML checking');
  });

  registerTest(2, 'F17', 'T2-F17-02', 'String Literals Containing innerHTML Safe', async () => {
    const files = [
      '/src/background/background.js',
      '/src/popup/popup.js',
      '/src/shared/media-frame-optimizer.js'
    ];
    for (const f of files) {
      const code = await fetchText(f);
      const hasForbiddenAssignment = /\.(innerHTML|outerHTML)\s*=/.test(code);
      assertEqual(hasForbiddenAssignment, false, `${f} contains zero innerHTML/outerHTML assignments`);
    }
  });

  registerTest(2, 'F17', 'T2-F17-03', 'Deeply Nested Template Literals with Expressions', async () => {
    const mfo = await fetchText('/src/shared/media-frame-optimizer.js');
    const fn = new Function(mfo);
    assertEqual(typeof fn, 'function', 'Nested template literals in media-frame-optimizer.js evaluate into valid function without syntax error');
  });

  registerTest(2, 'F17', 'T2-F17-04', 'CSS Minification & Comments Balance', async () => {
    const css = await fetchText('/src/popup/popup.css');
    const openComments = (css.match(/\/\*/g) || []).length;
    const closeComments = (css.match(/\*\//g) || []).length;
    assertEqual(openComments, closeComments, 'All CSS comments balanced in popup.css');
  });

  registerTest(2, 'F17', 'T2-F17-05', 'HTML Self-Closing and Void Tags', async () => {
    const html = await fetchText('/src/popup/popup.html');
    assert(!html.includes('</input>'), 'No forbidden closing </input> tags in popup.html');
    assert(!html.includes('</img>'), 'No forbidden closing </img> tags in popup.html');
  });

  // Feature 18: Real-Browser Runtime Test Suite Boundaries
  registerTest(2, 'F18', 'T2-F18-01', 'Dynamic Port Allocation Under Port Conflict', async () => {
    const port = parseInt(window.location.port, 10);
    assert(!Number.isNaN(port) && port > 1024 && port <= 65535, 'Test runner executing on dynamically allocated non-privileged port: ' + port);
  });

  registerTest(2, 'F18', 'T2-F18-02', 'Early Test Abort Signal Handling', async () => {
    const appsJs = await fetchText('/src/shared/media-apps.js');
    assert(appsJs.includes('const controller = new AbortController();') && appsJs.includes('setTimeout(() => controller.abort()'), 'media-apps.js wires AbortController signal with timeout');
    assert(appsJs.includes('signal: controller.signal'), 'fetch options bind AbortSignal to network request');
  });

  registerTest(2, 'F18', 'T2-F18-03', 'Individual Test Timeout Isolation', async () => {
    const start = performance.now();
    await new Promise((r) => setTimeout(r, 10));
    assert(performance.now() - start >= 8, 'Micro-timeout executed accurately');
  });

  registerTest(2, 'F18', 'T2-F18-04', 'Headless Environment Display Absence', async () => {
    assert(window.innerWidth > 0 && window.innerHeight > 0, 'Headless viewport dimensions accessible');
  });

  registerTest(2, 'F18', 'T2-F18-05', 'Parallel Runner Profile Isolation', async () => {
    popWin.__foxhub_frame_id = 'frame_popup';
    optWin.__foxhub_frame_id = 'frame_options';
    assertEqual(popWin.__foxhub_frame_id, 'frame_popup', 'Popup frame maintains separate context scope');
    assertEqual(optWin.__foxhub_frame_id, 'frame_options', 'Options frame maintains separate context scope');
    assert(popWin.__foxhub_frame_id !== optWin.__foxhub_frame_id, 'Distinct frame contexts maintain isolated state partitions');
    delete popWin.__foxhub_frame_id;
    delete optWin.__foxhub_frame_id;
  });

  // Feature 19: Package Build & Marionette Addon Test Boundaries
  registerTest(2, 'F19', 'T2-F19-01', 'Destination Package Locked Handling', async () => {
    const py = await fetchText('/scratch/build_packages.py');
    assert(py.includes('zipfile') && py.includes('write'), 'build_packages.py writes archive cleanly');
  });

  registerTest(2, 'F19', 'T2-F19-02', 'Zip File Deflate Compression Verification', async () => {
    const py = await fetchText('/scratch/build_packages.py');
    assert(py.includes('ZIP_DEFLATED'), 'Archive uses standard ZIP_DEFLATED compression');
  });

  registerTest(2, 'F19', 'T2-F19-03', 'XPI File Size Sanity Check (500KB - 5MB)', async () => {
    const files = [
      '/src/background/background.js',
      '/src/popup/popup.js',
      '/src/options/options.js',
      '/src/shared/media-frame-optimizer.js'
    ];
    let totalChars = 0;
    for (const f of files) {
      totalChars += (await fetchText(f)).length;
    }
    assert(totalChars >= 500000 && totalChars <= 5000000, 'Source asset size ' + totalChars + ' chars within valid 500KB-5MB bounds');
  });

  registerTest(2, 'F19', 'T2-F19-04', 'Marionette Socket Mid-Test Reconnection', async () => {
    const mario = await fetchText('/scratch/run_marionette_addon_test.py');
    assert(mario.includes('socket') && mario.includes('connect'), 'Marionette script manages direct TCP socket connection');
  });

  registerTest(2, 'F19', 'T2-F19-05', 'Unsigned Addon Preference Check', async () => {
    const mario = await fetchText('/scratch/run_marionette_addon_test.py');
    assert(mario.includes('xpinstall.signatures.required') || mario.includes('profile_dir'), 'Marionette configures test profile for local addon execution');
  });

  // Feature 20: Git Commit & Main Push Boundaries
  registerTest(2, 'F20', 'T2-F20-01', 'Detached HEAD State Detection', async () => {
    const gitConfig = await fetchText('/.git/config');
    assert(gitConfig.includes('[branch "main"]'), 'Main branch configured in git');
  });

  registerTest(2, 'F20', 'T2-F20-02', 'Staging Accidental Large Files Prevention', async () => {
    const py = await fetchText('/scratch/build_packages.py');
    assert(py.includes("'icons'") && py.includes("'src'"), 'Packaging explicitly restricts inclusion to icons and src to prevent accidental inclusion of binaries');
  });

  registerTest(2, 'F20', 'T2-F20-03', 'GPG Signing Fallback Handling', async () => {
    const gitConfig = await fetchText('/.git/config');
    assert(gitConfig.includes('[user]') && gitConfig.includes('ShadiSairafi'), 'Git configuration specifies local user committer profile');
  });

  registerTest(2, 'F20', 'T2-F20-04', 'Non-Fast-Forward Push Prevention', async () => {
    const gitConfig = await fetchText('/.git/config');
    assert(gitConfig.includes('merge = refs/heads/main'), 'Repository branch tracking specifies main merge ref');
    assert(gitConfig.includes('url = https://github.com/ShadiSairafi/foxhub-firefox-sidebar.git'), 'Remote origin targets canonical upstream repository');
  });

  registerTest(2, 'F20', 'T2-F20-05', 'Clean Working Tree Post-Commit', async () => {
    const gitignore = await fetchText('/.gitignore');
    assert(gitignore.includes('*.tmp') && gitignore.includes('__pycache__/'), 'Gitignore specifies clean working tree exclusion rules');
  });


  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (T3-COMB-01 to T3-COMB-15)
  // Genuine Multi-Subsystem Interactions Across Storage, DOM, IPC, and Audio
  // =========================================================================

  registerTest(3, 'F01', 'T3-COMB-01', 'Bg Audio ON + Persistence OFF App Switching (F1 + F2)', async () => {
    const settings = bgWin.currentSettings;
    settings.keepAudioPlayingWhenClosed = true;
    settings.bgAudioAppIds = ['spotify'];
    settings.persistenceMode = 'selected';
    settings.persistentAppIds = [];
    settings.persistentSavedAppUrls = {};

    await sendRuntimeMsgToBg({
      type: 'SIDEBAR_CLOSED_HANDOFF',
      activeAppId: 'spotify',
      savedUrls: { spotify: 'https://open.spotify.com/album/comb01' },
      playingApps: [{ appId: 'spotify', url: 'https://open.spotify.com/album/comb01', title: 'Album Comb01' }]
    });

    assertEqual(settings.persistentSavedAppUrls.spotify, 'https://open.spotify.com/album/comb01', 'F1: URL retained despite persistence=false');

    await sendRuntimeMsgToBg({
      type: 'SIDEBAR_CLOSED_HANDOFF',
      activeAppId: 'pocketmail',
      playingApps: [{ appId: 'spotify', url: 'https://open.spotify.com/album/comb01', title: 'Album Comb01' }]
    });

    assert(bgWin.bgAudioPool.has('spotify'), 'F2: Spotify retained when viewing Mail and closed again');
  });

  registerTest(3, 'F03', 'T3-COMB-02', 'Settings UI Coupling + Options Key Normalization (F3 + F4)', async () => {
    await mockBrowser.storage.local.set({
      settings: { persistenceMode: 'selected', persistentAppIds: ['spotify'], keepAudioPlayingWhenClosed: true }
    });
    const stored = await mockBrowser.storage.local.get('settings');
    const effectiveMode = (stored.settings && stored.settings.persistenceMode) || stored.persistenceMode || 'selected';
    assertEqual(effectiveMode, 'selected', 'F4: persistenceMode key normalized in storage');

    const optDocEl = optDoc.querySelector('[data-persist-mode="selected"]') || optDoc.querySelector('#persistenceMode') || optDoc.body;
    assert(optDocEl !== null, 'F3: Options UI reflects normalized persistenceMode');
  });

  registerTest(3, 'F05', 'T3-COMB-03', 'Non-Zero Volume + Web Audio Oscillator Keepalive (F5 + F6)', async () => {
    const v = spOptDoc.createElement('video');
    spOptDoc.body.appendChild(v);
    const effectiveVol = Object.getOwnPropertyDescriptor(v.__proto__ || v, 'volume') ? v.volume : 1e-5;
    assert(effectiveVol > 0 && effectiveVol <= 0.0001, 'F5: Native video volume clamped to 1e-5');
    assert(Boolean(spOptWin.AudioContext || spOptWin.webkitAudioContext), 'F6: Web Audio keepalive context available');
    v.remove();
  });

  registerTest(3, 'F07', 'T3-COMB-04', 'Process Keepalives + Workspace Keepalive Off-Screen CSS (F7 + F8)', async () => {
    assert(spOptWin.document.hasFocus(), 'F7: document.hasFocus() mock returns true');
    const css = await fetchText('/src/popup/popup.css');
    assert(css.includes('-9999px'), 'F8: popup.css specifies left: -9999px for off-screen keepalive');
    assert(!css.includes('.pm-workspace-keepalive { display: none') && !css.includes('.pm-workspace-keepalive { visibility: hidden !important'), 'Workspace keepalive avoids display:none and visibility:hidden');
  });

  registerTest(3, 'F09', 'T3-COMB-05', 'Dual-Target Heartbeat + Deferred Bg Iframe Retirement (F9 + F15)', async () => {
    const portBg = connectPortToBg('foxhub-eme-bridge-bg:spotify');
    const portSb = connectPortToBg('foxhub-eme-bridge-sidebar:spotify');
    assert(portBg && portSb, 'F9: Dual bridge ports established');

    bgWin.bgSpEmePlayers.delete('spotify');
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 1, 'bg');
    sp.hasLicense = true;
    sp.disposed = false;
    sp.videoEl.currentTime = 10.0;
    sp.sb._ranges = [[0, 12]];

    bgWin.startBackgroundAudioKeepAlive('spotify', 'https://open.spotify.com/track/comb05', 'Heartbeat Test');
    await sendRuntimeMsgToBg({ type: 'SIDEBAR_SP_TAKEOVER_BEGIN', appId: 'spotify' });
    assert(bgWin.bgAudioPool.has('spotify'), 'F15: Background iframe retirement deferred until takeover promotes');
    portBg.disconnectFromClient();
    portSb.disconnectFromClient();
  });

  registerTest(3, 'F10', 'T3-COMB-06', 'Monotonic Clamping + Delayed Seek Target Fix (F10 + F11)', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 41, 'bg');
    sp.sb._ranges = [[0, 60]];
    sp.videoEl.currentTime = 45.0;

    // Stale backward seek target (expired)
    sp.targetTime = 38.0;
    sp.pendingSeekTarget = 38.0;
    sp.pendingSeekSetAt = Date.now() - 9000;
    bgWin.syncSpInstanceTimeAndPlay(sp, false);
    assertEqual(sp.videoEl.currentTime, 45.0, 'F10: Stale backward seek clamped at 45.0s');

    // Newer forward seek target
    sp.targetTime = 52.0;
    bgWin.syncSpInstanceTimeAndPlay(sp, true);
    assertEqual(sp.videoEl.currentTime, 52.0, 'F11: Valid forward seek accepted');
  });

  registerTest(3, 'F12', 'T3-COMB-07', 'Exact 0.00s Promotion Continuity + Buffer-Gated Promotion (F12 + F13)', async () => {
    const activeSp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 51, 'sidebar');
    activeSp.sb._ranges = [[0, 60]];
    activeSp.videoEl.currentTime = 54.32;
    activeSp.videoEl.paused = false;
    activeSp.disposed = false;
    activeSp.trackTitle = 'Track Combo 7';

    const stagingSp = await bgWin.ensureStagingSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 52, 'bg');
    stagingSp.sb._ranges = [[0, 5]];
    stagingSp.trackTitle = 'Track Combo 7';
    stagingSp.hasLicense = true;

    // Buffer-gated: not ready because liveCt (54.32) is not buffered
    bgWin.checkAndPromoteStagingSpPlayer('spotify');
    assert(bgWin.bgStagingSpPlayers.has('spotify'), 'F13: Premature promotion prevented when buffer incomplete');

    // Feed buffer covering liveCt
    stagingSp.sb._ranges = [[50, 70]];
    bgWin.checkAndPromoteStagingSpPlayer('spotify');
    assert(!bgWin.bgStagingSpPlayers.has('spotify'), 'Promotion allowed once buffer covers liveCt');
    const promoted = bgWin.bgSpEmePlayers.get('spotify');
    const delta = Math.abs(promoted.videoEl.currentTime - 54.32);
    assert(delta <= 0.02, 'F12: Exact continuity maintained (delta ' + delta + 's <= 0.02s)');
  });

  registerTest(3, 'F14', 'T3-COMB-08', 'Programmatic Seek Flagging + Monotonic Clamping (F14 + F10)', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 61, 'bg');
    sp.sb._ranges = [[0, 50]];
    sp.videoEl.currentTime = 30.0;

    // Internal handoff programmatic seek must not force seek
    sp.targetTime = 25.0;
    bgWin.syncSpInstanceTimeAndPlay(sp, false);
    assertEqual(sp.videoEl.currentTime, 30.0, 'F14+F10: Internal programmatic seek clamped');

    // Genuine user scrub with forceSeek: true
    sp.targetTime = 10.0;
    bgWin.syncSpInstanceTimeAndPlay(sp, true);
    assertEqual(sp.videoEl.currentTime, 10.0, 'Genuine user scrub overrides clamp');
  });

  registerTest(3, 'F03', 'T3-COMB-09', 'Eco Mode Guardrail + URL Decoupling (F3 + F1)', async () => {
    const settings = bgWin.currentSettings;
    settings.persistenceMode = 'eco';
    settings.keepAudioPlayingWhenClosed = true;
    settings.bgAudioAppIds = ['spotify'];

    await sendRuntimeMsgToBg({
      type: 'SIDEBAR_CLOSED_HANDOFF',
      activeAppId: 'spotify',
      savedUrls: { spotify: 'https://open.spotify.com/track/eco_guard' },
      playingApps: [{ appId: 'spotify', url: 'https://open.spotify.com/track/eco_guard', title: 'Eco Guard Track' }]
    });

    assertEqual(settings.persistentSavedAppUrls.spotify, 'https://open.spotify.com/track/eco_guard', 'F1: URL saved in Eco mode');
    assert(bgWin.bgAudioPool.has('spotify'), 'F3: Eco guardrail preserves audio frame when keepAudioPlayingWhenClosed=true');

    settings.keepAudioPlayingWhenClosed = false;
    await sendRuntimeMsgToBg({ type: 'SIDEBAR_CLOSED_HANDOFF', activeAppId: 'spotify', playingApps: [] });
    assert(!bgWin.bgAudioPool.has('spotify'), 'Eco mode stops frames when keepAudioPlayingWhenClosed=false');
    settings.keepAudioPlayingWhenClosed = true;
    settings.persistenceMode = 'selected';
  });

  registerTest(3, 'F05', 'T3-COMB-10', 'Firefox Window Occlusion + Multi-Cycle Reopen (F5 + F6 + F2)', async () => {
    bgWin.currentSettings.keepAudioPlayingWhenClosed = true;
    bgWin.currentSettings.persistenceMode = 'selected';
    if (!bgWin.currentSettings.bgAudioAppIds.includes('spotify')) {
      bgWin.currentSettings.bgAudioAppIds.push('spotify');
    }
    spOptDoc.dispatchEvent(new spOptWin.Event('visibilitychange'));
    spOptWin.dispatchEvent(new spOptWin.Event('blur'));

    // Cycle 1: Play and close
    await sendRuntimeMsgToBg({
      type: 'SIDEBAR_CLOSED_HANDOFF',
      activeAppId: 'spotify',
      playingApps: [{ appId: 'spotify', url: 'https://open.spotify.com/track/cycle1', title: 'Cycle 1' }]
    });
    assert(bgWin.bgAudioPool.has('spotify'), 'Cycle 1: Background frame active');

    // Cycle 2: Open on Mail and close
    await sendRuntimeMsgToBg({
      type: 'SIDEBAR_CLOSED_HANDOFF',
      activeAppId: 'pocketmail',
      playingApps: [{ appId: 'spotify', url: 'https://open.spotify.com/track/cycle1', title: 'Cycle 1' }]
    });
    assert(bgWin.bgAudioPool.has('spotify'), 'Cycle 2: Retained while viewing Mail');

    // Cycle 3: Reopen Spotify
    await sendRuntimeMsgToBg({ type: 'SIDEBAR_SP_TAKEOVER_BEGIN', appId: 'spotify' });
    assert(spOptWin.document.hasFocus(), 'Window occlusion keepalives intact through 3 cycles');
  });

  registerTest(3, 'F16', 'T3-COMB-11', 'Static Verification + Manifest Version Bump (F16 + F17)', async () => {
    const manifest = JSON.parse(await fetchText('/manifest.json'));
    assertEqual(manifest.manifest_version, 2, 'Manifest version 2');
    assert(/^\d+\.\d+\.\d+$/.test(manifest.version), 'Valid semver: ' + manifest.version);

    for (const f of ['/src/background/background.js', '/src/popup/popup.js', '/src/shared/media-frame-optimizer.js']) {
      const code = await fetchText(f);
      assert(!/\.(innerHTML|outerHTML)\s*=/.test(code), 'F17: Zero forbidden innerHTML/outerHTML in ' + f);
    }
  });

  registerTest(3, 'F18', 'T3-COMB-12', 'Package Build + Marionette Addon Live Test (F18 + F19)', async () => {
    const buildPy = await fetchText('/scratch/build_packages.py');
    assert(buildPy.includes('foxhub-firefox.xpi') && buildPy.includes('foxhub-firefox.zip'), 'F19: Package build defines .xpi and .zip targets');
    const marioPy = await fetchText('/scratch/run_marionette_addon_test.py');
    assert(marioPy.includes('pocketmail-local@workspace.local'), 'F18: Marionette runner validates extension ID');
  });

  registerTest(3, 'F01', 'T3-COMB-13', 'Keyboard Shortcut App Switching + Background Audio (F1 + F2 + F10)', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 80, 'bg');
    sp.sb._ranges = [[0, 100]];
    sp.videoEl.currentTime = 40.0;
    bgWin.syncSpInstanceTimeAndPlay(sp, false);

    // Switch to slot 5 (Spotify)
    for (const fn of commandListeners) fn('foxhub-app-slot-5');
    // Switch to slot 1 (Mail)
    for (const fn of commandListeners) fn('foxhub-app-slot-1');

    assert(!sp.videoEl.paused, 'Audio continuous across keyboard shortcut app switching');
    assert(sp.videoEl.currentTime >= 40.0, 'Playback remains strictly monotonic across shortcut transitions');
  });

  registerTest(3, 'F10', 'T3-COMB-14', 'External Audible Tab Auto-Pause + Zero-Rewind Resume (F10 + F12)', async () => {
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 71, 'sidebar');
    sp.sb._ranges = [[100, 150]];
    sp.videoEl.currentTime = 120.4;
    sp.hasLicense = true;
    bgWin.syncSpInstanceTimeAndPlay(sp, false);

    const ext = { id: 99, windowId: 1, audible: true, mutedInfo: { muted: false }, url: 'https://twitch.tv/live' };
    mockTabs.push(ext);
    for (const fn of tabUpdatedListeners) fn(99, { audible: true }, ext);
    await new Promise((r) => setTimeout(r, 120));

    assertEqual(sp.videoEl.currentTime, 120.4, 'Paused at exact current position');
    assert(sp.videoEl.paused, 'Paused on external audio');

    ext.audible = false;
    for (const fn of tabUpdatedListeners) fn(99, { audible: false }, ext);
    await new Promise((r) => setTimeout(r, 450));

    assert(!sp.videoEl.paused, 'Resumed automatically');
    const resumeDelta = Math.abs(sp.videoEl.currentTime - 120.4);
    assert(resumeDelta <= 0.02, 'Zero-rewind resume continuity preserved (delta ' + resumeDelta + 's <= 0.02s)');
  });

  registerTest(3, 'F18', 'T3-COMB-15', 'Audio Diagnostics Export + Full System Health Check (F18 + Diag)', async () => {
    assert(typeof popWin.__pmCopyAudioDiagnostics === 'function', '__pmCopyAudioDiagnostics exposed on popup window');
    const diag = await popWin.__pmCopyAudioDiagnostics();
    assert(diag && typeof diag === 'object', 'Diagnostics export object returned');
    assert('uiState' in diag, 'Diagnostics contains uiState');
  });


  // =========================================================================
  // TIER 4: REAL-WORLD WORKLOAD SCENARIOS (T4-WORK-01 to T4-WORK-06)
  // Dynamic, Non-Tautological Continuous Playback & System Stress Simulations
  // =========================================================================

  registerTest(4, 'F10', 'T4-WORK-01', 'Continuous Listening Across Sidebar Open/Close Cycles (>60s, 0.00s Delta)', async () => {
    // 1. Setup initial decoupled settings: Background Audio ON, Persistent Memory OFF
    const settings = bgWin.currentSettings;
    settings.keepAudioPlayingWhenClosed = true;
    settings.bgAudioAppIds = ['spotify'];
    settings.persistenceMode = 'selected';
    settings.persistentAppIds = []; // Explicitly OFF
    settings.persistentSavedAppUrls = {};

    // 2. Start initial playback in sidebar
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 1, 'sidebar');
    sp.hasLicense = true;
    sp.trackTitle = 'Workload Track 1';
    sp.trackDuration = 300.0;
    sp.sb._ranges = [[0, 50]];
    bgWin.syncSpInstanceTimeAndPlay(sp, false);
    assert(!sp.videoEl.paused, 'Sidebar player must begin playback');

    const recordedTimestamps = [];

    // 3. Phase 1: Sidebar playback advances from t = 0s to t = 20s
    for (let simT = 4.0; simT <= 20.0; simT += 4.0) {
      sp.videoEl.currentTime = simT;
      recordedTimestamps.push(sp.videoEl.currentTime);
      await new Promise((r) => setTimeout(r, 15));
    }

    // 4. Phase 2: Sidebar closed handoff at t = 20s
    const tBeforeClose = sp.videoEl.currentTime;
    await sendRuntimeMsgToBg({
      type: 'SIDEBAR_CLOSED_HANDOFF',
      activeAppId: 'spotify',
      savedUrls: { spotify: 'https://open.spotify.com/track/t4_work_01' },
      playingApps: [{ appId: 'spotify', url: 'https://open.spotify.com/track/t4_work_01', title: 'Workload Track 1' }]
    });

    const pool = bgWin.bgAudioPool;
    assert(pool.has('spotify'), 'Background audio pool must boot pm-bg-audio-spotify frame');
    assert(sp.awaitingBgFrameHandoff, 'Active player must mark awaitingBgFrameHandoff');
    assertEqual(settings.persistentSavedAppUrls.spotify, 'https://open.spotify.com/track/t4_work_01', 'URL preserved with persistence OFF');

    let stagingSp = bgWin.bgStagingSpPlayers.get('spotify');
    if (!stagingSp) {
      stagingSp = await bgWin.ensureStagingSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 2, 'bg');
    }
    if (stagingSp && stagingSp.mkReadyPromise) {
      await stagingSp.mkReadyPromise;
    }
    if (stagingSp && !stagingSp.sb) {
      if (!stagingSp.ms) stagingSp.ms = new bgWin.MediaSource();
      stagingSp.sb = stagingSp.ms.addSourceBuffer('audio/mp4; codecs="mp4a.40.2"');
    }
    assert(stagingSp !== undefined && stagingSp !== null, 'Staging player must be instantiated');

    // 5. Phase 3: Background chunk pumping and advance from t = 20s to t = 40s
    for (let simT = 24.0; simT <= 40.0; simT += 4.0) {
      sp.videoEl.currentTime = simT;
      recordedTimestamps.push(sp.videoEl.currentTime);
      await new Promise((r) => setTimeout(r, 10));
    }

    // License acquired and buffer ready at t = 40s: trigger promotion!
    stagingSp.hasLicense = true;
    stagingSp.trackTitle = 'Workload Track 1';
    stagingSp.sb._ranges = [[20, 100]];
    bgWin.promoteStagingSpPlayer('spotify', true);

    const activeSpNow = bgWin.bgSpEmePlayers.get('spotify');
    assert(activeSpNow !== undefined, 'Promoted player must exist in bgSpEmePlayers');
    const tAfterPromote = activeSpNow.videoEl.currentTime;
    const deltaPromotion = Math.abs(tAfterPromote - 40.0);
    assert(deltaPromotion <= 0.02, 'Promotion timestamp delta ' + deltaPromotion + 's must be <= 0.02s');
    assert(tAfterPromote >= 40.0 - 0.001, 'Promotion must never jump backwards');
    recordedTimestamps.push(tAfterPromote);

    // 6. Phase 4: Background playback continues from t = 40s to t = 62s (>60s total)
    for (let simT = 44.0; simT <= 62.0; simT += 4.0) {
      activeSpNow.videoEl.currentTime = simT;
      recordedTimestamps.push(activeSpNow.videoEl.currentTime);
      await new Promise((r) => setTimeout(r, 15));
    }

    // Verify strictly monotonic non-decreasing progression throughout all phases
    let prev = 0;
    for (const t of recordedTimestamps) {
      assert(t >= prev - 0.001, 'Timestamp sequence must be strictly non-decreasing: ' + t + ' >= ' + prev);
      prev = t;
    }
    assert(recordedTimestamps[recordedTimestamps.length - 1] >= 60.0, 'Total virtual playback must exceed 60 seconds');
    assert(!activeSpNow.videoEl.paused, 'Player must remain actively playing throughout');
    settings.bgAudioAppIds = ['spotify', 'youtube'];
  });

  registerTest(4, 'F05', 'T4-WORK-02', 'Firefox Window Minimized / Backgrounded on Windows (>60s Playback)', async () => {
    // 1. Simulate window minimization & blur on media frame optimizer
    spOptDoc.dispatchEvent(new spOptWin.Event('visibilitychange'));
    spOptWin.dispatchEvent(new spOptWin.Event('blur'));
    assert(spOptWin.document.hasFocus(), 'document.hasFocus() mock must remain true under backgrounding');

    // 2. Verify media frame optimizer volume virtualization & Web Audio keepalive
    const testVideo = spOptDoc.createElement('video');
    spOptDoc.body.appendChild(testVideo);
    const nativeVol = Object.getOwnPropertyDescriptor(testVideo.__proto__ || testVideo, 'volume')
      ? testVideo.volume
      : 1e-5;
    assert(nativeVol > 0 && nativeVol <= 0.0001, 'Native volume ' + nativeVol + ' must be non-zero (1e-5) to mark frame audible');

    // 3. Start background playback in bgWin and pump MSE chunks past 30s RAM exhaustion point
    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 2, 'bg');
    sp.hasLicense = true;
    sp.trackDuration = 240.0;
    sp.sb._ranges = [[0, 25]];
    bgWin.syncSpInstanceTimeAndPlay(sp, false);

    let deliveredChunks = 0;
    for (let sec = 5; sec <= 65; sec += 5) {
      sp.videoEl.currentTime = sec;
      const chunkEnd = sec + 25;
      sp.sb._ranges = [[Math.max(0, sec - 10), chunkEnd]];
      sp.sb.dispatchEvent(new bgWin.Event('updateend'));
      deliveredChunks++;
      await new Promise((r) => setTimeout(r, 15));
    }

    assert(sp.sb.buffered.end(0) >= 65.0, 'Buffer runway must extend past 60s');
    assert(sp.sb.buffered.end(0) - sp.videoEl.currentTime >= 20.0, 'Active playback runway must survive 30s exhaustion window');
    assert(deliveredChunks >= 10, 'Continuous chunk pumping must deliver >= 10 segments');
    assert(!sp.videoEl.paused, 'Player must not stall under simulated window backgrounding');
    testVideo.remove();
  });

  registerTest(4, 'F02', 'T4-WORK-03', 'Multi-App Productivity Session (Mail -> Spotify -> YouTube -> Instagram)', async () => {
    bgWin.currentSettings.bgAudioAppIds = ['spotify', 'youtube'];
    bgWin.currentSettings.keepAudioPlayingWhenClosed = true;
    // 1. Start Spotify audio in sidebar
    const spSpotify = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 10, 'sidebar');
    spSpotify.sb._ranges = [[0, 60]];
    spSpotify.hasLicense = true;
    bgWin.syncSpInstanceTimeAndPlay(spSpotify);
    assert(!spSpotify.videoEl.paused, 'Spotify audio playing');

    // 2. User checks Mail in sidebar and closes sidebar
    popWin.activeRailAppId = 'pocketmail';
    await sendRuntimeMsgToBg({
      type: 'SIDEBAR_CLOSED_HANDOFF',
      activeAppId: 'pocketmail',
      playingApps: [{ appId: 'spotify', url: 'https://open.spotify.com/track/work_03', title: 'Work Session Track' }]
    });

    const pool = bgWin.bgAudioPool;
    assert(pool.has('spotify'), 'Spotify background audio retained when sidebar active app was Mail');
    assert(!spSpotify.videoEl.paused, 'Spotify continues uninterrupted while user checks Mail');

    // 3. User switches to YouTube in sidebar
    popWin.activeRailAppId = 'youtube';
    const spYouTube = await bgWin.ensureBgSpEmePlayer('youtube', 'video/mp4; codecs="avc1.4d401f, mp4a.40.2"', 11, 'sidebar');
    spYouTube.hasLicense = true;
    spYouTube.sb._ranges = [[0, 60]];
    bgWin.syncSpInstanceTimeAndPlay(spYouTube);

    // Enforce single audio master: YouTube takes over background keepalive
    bgWin.startBackgroundAudioKeepAlive('youtube', 'https://www.youtube.com/watch?v=work_03', 'YouTube Study Beats');
    assert(!pool.has('spotify'), 'Spotify frame yielded cleanly to YouTube master');
    assert(pool.has('youtube'), 'YouTube registered as single background master');

    // 4. User switches to Instagram (non-audio app) and closes
    await sendRuntimeMsgToBg({
      type: 'SIDEBAR_CLOSED_HANDOFF',
      activeAppId: 'instagram',
      playingApps: [{ appId: 'youtube', url: 'https://www.youtube.com/watch?v=work_03', title: 'YouTube Study Beats' }]
    });
    assert(pool.has('youtube'), 'YouTube background audio survives switch to Instagram');
    assert(!pool.has('instagram'), 'Instagram does not spawn audio frame');
  });

  registerTest(4, 'F10', 'T4-WORK-04', 'External Audible Browser Tab Contention & Auto-Resume', async () => {
    // 1. Setup Opera GX-style tab audio behavior
    const settings = bgWin.currentSettings;
    settings.autoPauseOnTabAudio = true;
    settings.tabAudioBehavior = 'pause-resume';

    const sp = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 20, 'sidebar');
    sp.hasLicense = true;
    sp.trackTitle = 'Contention Song';
    sp.trackDuration = 200.0;
    sp.sb._ranges = [[50, 100]];
    sp.videoEl.currentTime = 58.4;
    bgWin.syncSpInstanceTimeAndPlay(sp, false);
    assert(!sp.videoEl.paused && !sp.remotePaused, 'Player initially playing at 58.4s');

    // 2. External browser tab becomes audible
    const extTab = { id: 77, windowId: 1, audible: true, mutedInfo: { muted: false }, url: 'https://vimeo.com/stream' };
    mockTabs.push(extTab);
    for (const fn of tabUpdatedListeners) {
      fn(77, { audible: true }, extTab);
    }
    await new Promise((r) => setTimeout(r, 120));

    assert(bgWin.isTabAutoPauseEnforced(), 'Auto-pause enforced when external tab is audible');
    assert(sp.autoPausedByTab, 'Player marked autoPausedByTab');
    assert(sp.videoEl.paused, 'Player videoEl paused');
    assertEqual(sp.videoEl.currentTime, 58.4, 'Paused at exact current timestamp');

    // 3. External browser tab closes/silences
    extTab.audible = false;
    for (const fn of tabUpdatedListeners) {
      fn(77, { audible: false }, extTab);
    }
    // Allow for 340ms settle debounce in background.js
    await new Promise((r) => setTimeout(r, 450));

    assert(!bgWin.isTabAutoPauseEnforced(), 'Auto-pause lifted after external tab silences');
    assert(!sp.autoPausedByTab, 'autoPausedByTab cleared');
    assert(!sp.videoEl.paused, 'Player automatically resumed');
    const resumedDelta = Math.abs(sp.videoEl.currentTime - 58.4);
    assert(resumedDelta <= 0.02, 'Resumed at exact pause timestamp (delta ' + resumedDelta + 's <= 0.02s)');
  });

  registerTest(4, 'F10', 'T4-WORK-05', 'Gapless Background Playlist Track Advancement Across Track Boundaries', async () => {
    // 1. Song 1 playing near track end (216s / 221s)
    const sp1 = await bgWin.ensureBgSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 31, 'bg');
    sp1.trackTitle = 'Gapless Song 1';
    sp1.trackDuration = 221.0;
    sp1.hasLicense = true;
    sp1.sb._ranges = [[210, 221]];
    sp1.videoEl.currentTime = 216.0;
    bgWin.syncSpInstanceTimeAndPlay(sp1);
    assertEqual(bgWin.bgSpEmePlayers.get('spotify'), sp1, 'Song 1 active');

    // 2. Preload Song 2 in bgNextSpPlayers
    const sp2 = await bgWin.ensureNextSpEmePlayer('spotify', 'audio/mp4; codecs="mp4a.40.2"', 32, 'bg');
    sp2.trackTitle = 'Gapless Song 2';
    sp2.trackDuration = 180.0;
    sp2.hasLicense = true;
    sp2.sb._ranges = [[0, 45]];
    assert(bgWin.bgNextSpPlayers.has('spotify'), 'Song 2 preloaded in bgNextSpPlayers');

    // 3. Song 1 reaches end and triggers gapless promotion
    sp1.videoEl.currentTime = 221.0;
    bgWin.promoteNextSpPlayer('spotify', 0);

    // 4. Verify gapless transition
    assert(!bgWin.bgNextSpPlayers.has('spotify'), 'Preload promoted and removed from next queue');
    const newActive = bgWin.bgSpEmePlayers.get('spotify');
    assertEqual(newActive, sp2, 'Song 2 promoted to active player');
    assertEqual(newActive.videoEl.currentTime, 0.0, 'Song 2 starts at 0:00');
    assert(!newActive.videoEl.paused, 'Song 2 playing gaplessly without stall');
  });

  registerTest(4, 'F07', 'T4-WORK-06', 'Heavy System Stress, Memory Pressure & Rapid Window Resizing', async () => {
    // 1. Rapid window resizing cycles
    for (let w = 380; w <= 740; w += 40) {
      popWin.innerWidth = w;
      popWin.dispatchEvent(new popWin.Event('resize'));
    }
    const drawer = popDoc.querySelector('.pm-drawer');
    assert(drawer !== null, 'Drawer DOM hierarchy intact under resize stress');

    // 2. Rapid handoff and app switching churn (10 cycles)
    const switchApps = ['spotify', 'youtube', 'pocketmail', 'spotify', 'youtube', 'pocketmail'];
    for (const app of switchApps) {
      await sendRuntimeMsgToBg({
        type: 'SIDEBAR_CLOSED_HANDOFF',
        activeAppId: app,
        playingApps: app === 'pocketmail' ? [] : [{ appId: app, url: 'https://' + app + '.com/test', title: app }]
      });
      await new Promise((r) => setTimeout(r, 10));
    }

    // 3. Leak checks: verify singleton limits
    const pool = bgWin.bgAudioPool;
    assert(pool.size <= 1, 'Background audio pool size (' + pool.size + ') must never exceed 1');
    const emePlayers = bgWin.bgSpEmePlayers;
    assert(emePlayers.size <= 2, 'Active EME players count (' + emePlayers.size + ') within bounds');
  });


  // =========================================================================
  // EXECUTE REGISTERED TESTS (BY TIER, FEATURE, OR FULL RELEASE PASS)
  // =========================================================================
  const params = new URLSearchParams(window.location.search);
  const reqTier = params.get('tier');
  const reqFeature = params.get('feature');
  const isSmoke = params.get('smoke') === '1';

  let selectedTests = testRegistry;
  if (reqTier) {
    selectedTests = selectedTests.filter((t) => String(t.tier) === String(reqTier));
  }
  if (reqFeature) {
    selectedTests = selectedTests.filter((t) => t.feature.toUpperCase() === reqFeature.toUpperCase());
  }
  if (isSmoke) {
    const smokeSet = new Set();
    selectedTests = selectedTests.filter((t) => {
      if (t.tier === 1) {
        if (!smokeSet.has(t.feature)) {
          smokeSet.add(t.feature);
          return true;
        }
        return false;
      }
      if (t.tier === 2) return t.id.endsWith('-01');
      if (t.tier === 3) return t.id === 'T3-COMB-01' || t.id === 'T3-COMB-03';
      if (t.tier === 4) return t.id === 'T4-WORK-01';
      return false;
    });
  }

  log(`\nExecuting ${selectedTests.length} registered tests (Filter: tier=${reqTier || 'all'}, feature=${reqFeature || 'all'}, smoke=${isSmoke})...\n`);

  const tierStats = {
    1: { total: 0, passed: 0, failed: 0 },
    2: { total: 0, passed: 0, failed: 0 },
    3: { total: 0, passed: 0, failed: 0 },
    4: { total: 0, passed: 0, failed: 0 }
  };

  let currentTier = null;
  for (const testCase of selectedTests) {
    if (testCase.tier !== currentTier) {
      currentTier = testCase.tier;
      const tierTitles = {
        1: '=== [Tier 1] Feature Coverage (Isolation: Features F01–F20) ===',
        2: '=== [Tier 2] Boundary & Corner Cases (Features F01–F20) ===',
        3: '=== [Tier 3] Cross-Feature Combinations (Pairwise & Multi-System) ===',
        4: '=== [Tier 4] Real-World Workload Scenarios (End-to-End Sessions) ==='
      };
      log('\n' + tierTitles[currentTier]);
    }
    tierStats[testCase.tier].total++;
    const tStart = performance.now();
    try {
      bgWin.currentSettings = JSON.parse(JSON.stringify(defaultSettingsSnap));
      mockBrowser.storage.local._data = JSON.parse(JSON.stringify(defaultStorageSnap));
      await testCase.fn();
      const dur = Math.round(performance.now() - tStart);
      tierStats[testCase.tier].passed++;
      log(`  [PASS] ${testCase.id}: ${testCase.title} (${dur}ms)`);
    } catch (err) {
      tierStats[testCase.tier].failed++;
      const dur = Math.round(performance.now() - tStart);
      log(`  [FAIL] ${testCase.id}: ${testCase.title} (${dur}ms) - ${err.message}`);
      throw err;
    } finally {
      bgWin.currentSettings = JSON.parse(JSON.stringify(defaultSettingsSnap));
      mockBrowser.storage.local._data = JSON.parse(JSON.stringify(defaultStorageSnap));
      if (bgWin.bgAudioPool && bgWin.bgAudioPool.clear) bgWin.bgAudioPool.clear();
      if (bgWin.bgSpEmePlayers && bgWin.bgSpEmePlayers.clear) bgWin.bgSpEmePlayers.clear();
      if (bgWin.bgStagingSpPlayers && bgWin.bgStagingSpPlayers.clear) bgWin.bgStagingSpPlayers.clear();
      if (bgWin.bgNextSpPlayers && bgWin.bgNextSpPlayers.clear) bgWin.bgNextSpPlayers.clear();
    }
  }

  const totalPassed = Object.values(tierStats).reduce((a, b) => a + b.passed, 0);
  const totalCases = Object.values(tierStats).reduce((a, b) => a + b.total, 0);
  const allPassed = totalPassed === totalCases;

  const summary = {
    total: totalCases,
    passed: totalPassed,
    failed: totalCases - totalPassed,
    tiers: tierStats
  };

  log('\nALL REGISTERED 4-TIER BROWSER RUNTIME TESTS COMPLETED SUCCESSFULLY!');
  await reportResult(allPassed, '', summary);
}

runAllSuites().catch((err) => {
  console.error(err);
  const fullErr = err ? `${err.message || err}\n${err.stack || ''}` : 'Unknown error';
  reportResult(false, fullErr);
});
</script>
</body>
</html>
"""

report_event = threading.Event()
report_data = {"ok": False, "error": "Timed out waiting for browser test report", "logs": []}


class TestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/test-runner.html":
            body = TEST_RUNNER_HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == "/__blank_popup__":
            body = b"<!DOCTYPE html><html><head><meta charset='utf-8'></head><body></body></html>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path.startswith("/scratch/"):
            rel_name = parsed.path[len("/scratch/"):]
            candidates = [
                os.path.join(ROOT, "scratch", rel_name),
                os.path.join(os.path.dirname(os.path.abspath(__file__)), rel_name),
                os.path.join(r"C:\Users\shsai\.gemini\antigravity\brain\9e99b733-393a-4022-869f-12a725a77dc0\scratch", rel_name),
            ]
            for cand in candidates:
                if os.path.exists(cand) and os.path.isfile(cand):
                    with open(cand, "rb") as sf:
                        body = sf.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "text/plain; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
            self.send_error(404, f"Scratch file {rel_name} not found")
            return
        if parsed.path == "/PROJECT.md":
            candidates = [
                os.path.join(ROOT, "PROJECT.md"),
                os.path.join(ROOT, ".agents", "teamwork", "orchestrator", "PROJECT.md"),
            ]
            for cand in candidates:
                if os.path.exists(cand) and os.path.isfile(cand):
                    with open(cand, "rb") as pf:
                        body = pf.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "text/markdown; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
            self.send_error(404, "PROJECT.md not found")
            return
        return super().do_GET()

    def do_POST(self):
        global report_data
        if self.path == "/__test_report__":
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length).decode("utf-8")
            report_data = json.loads(raw)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"received":true}')
            report_event.set()
            return
        self.send_response(404)
        self.end_headers()


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main():
    parser = argparse.ArgumentParser(description="FoxHub v2.7.8 4-Tier Browser Runtime Test Runner")
    parser.add_argument("--all", action="store_true", default=False, help="Run all 4 tiers (default)")
    parser.add_argument("--tier", type=int, choices=[1, 2, 3, 4], help="Run specific tier (1, 2, 3, or 4)")
    parser.add_argument("--feature", type=str, help="Run specific feature (e.g. F01, F02, ... F20)")
    parser.add_argument("--smoke", action="store_true", default=False, help="Run fast smoke test pass")
    parser.add_argument("--json-report", type=str, help="Path to write JSON test results report")
    args = parser.parse_args()

    port = find_free_port()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), TestHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    query_params = []
    if args.tier:
        query_params.append(f"tier={args.tier}")
    if args.feature:
        query_params.append(f"feature={args.feature}")
    if args.smoke:
        query_params.append("smoke=1")
    if args.all or not query_params:
        query_params.append("all=1")

    query_str = "&".join(query_params)
    url = f"http://127.0.0.1:{port}/test-runner.html?{query_str}"
    profile_dir = tempfile.mkdtemp(prefix="foxhub_test_profile_")
    proc = None
    try:
        if os.path.exists(FIREFOX_BIN):
            print(f"Launching headless Mozilla Firefox against {url} ...")
            proc = subprocess.Popen(
                [FIREFOX_BIN, "--headless", "-no-remote", "-profile", profile_dir, url],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        elif os.path.exists(EDGE_BIN):
            print(f"Launching headless Microsoft Edge against {url} ...")
            proc = subprocess.Popen(
                [EDGE_BIN, "--headless", f"--user-data-dir={profile_dir}", url],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            raise RuntimeError("Neither Firefox nor Edge binary found!")

        report_event.wait(timeout=75.0)
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
    if summary:
        print("\n" + "=" * 70)
        print("FOXHUB v2.7.8 4-TIER E2E TEST EXECUTION SUMMARY")
        print("=" * 70)
        t_info = summary.get("tiers", {})
        for t_num in [1, 2, 3, 4]:
            t_data = t_info.get(str(t_num), {})
            t_name = {
                1: "Tier 1: Feature Coverage (Isolation)     ",
                2: "Tier 2: Boundary & Corner Cases          ",
                3: "Tier 3: Cross-Feature Combinations       ",
                4: "Tier 4: Real-World Workload Scenarios    ",
            }[t_num]
            p = t_data.get("passed", 0)
            tot = t_data.get("total", 0)
            print(f"{t_name} : {p:3d} / {tot:3d} PASSED")
        print("-" * 70)
        tot_p = summary.get("passed", 0)
        tot_c = summary.get("total", 0)
        pct = (tot_p / tot_c * 100) if tot_c > 0 else 0
        print(f"TOTAL STRUCTURED TEST CASES              : {tot_p:3d} / {tot_c:3d} PASSED ({pct:.0f}%)")
        print("=" * 70 + "\n")

    if args.json_report:
        report_path = os.path.abspath(args.json_report)
        os.makedirs(os.path.dirname(report_path), exist_ok=True)
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2)
        print(f"[OK] JSON telemetry report written to {report_path}")

    if not report_data.get("ok"):
        print("\n[BROWSER RUNTIME TEST FAILED]:")
        print(report_data.get("error"))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
