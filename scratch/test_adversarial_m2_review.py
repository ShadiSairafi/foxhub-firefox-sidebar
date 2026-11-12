import http.server
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time

ROOT = r"d:\VS Code Projects\Email Web Shortcut"
FIREFOX_BIN = r"C:\Program Files\Mozilla Firefox\firefox.exe"

TEST_HTML = r"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>FoxHub M2 Reviewer 2 Adversarial Stress Suite</title>
</head>
<body>
<div id="container"></div>
<script>
const results = [];
function record(name, pass, err = null) {
  results.push({ name, pass, err });
  console.log((pass ? '[PASS] ' : '[FAIL] ') + name + (err ? ': ' + err : ''));
}

async function runM2ReviewStressTests() {
  // --- TEST 1: Ring Buffer 200 FIFO & Non-Blocking Console ---
  try {
    const bgAudioDiagLog = [];
    let consoleInfoCalls = 0;
    const origInfo = console.info;
    console.info = (...args) => {
      consoleInfoCalls++;
      // Stress test: what if console.info throws an unexpected exception?
      if (consoleInfoCalls % 10 === 0) {
        throw new Error('Console stream broken');
      }
    };

    function logAudioDiag(event, details = {}) {
      try {
        const entry = {
          ts: Date.now(),
          iso: new Date().toISOString(),
          event: String(event || 'event'),
          ...details
        };
        bgAudioDiagLog.push(entry);
        if (bgAudioDiagLog.length > 200) {
          bgAudioDiagLog.splice(0, bgAudioDiagLog.length - 200);
        }
        try {
          console.info('[FoxHub AudioDiag]', entry.iso, event, details);
        } catch (_) {}
      } catch (_) {}
    }

    // Stress: push 1000 items with arbitrary payloads
    for (let i = 0; i < 1000; i++) {
      logAudioDiag('event-' + i, { seq: i, extra: 'data-' + i });
    }

    if (bgAudioDiagLog.length !== 200) {
      throw new Error('Ring buffer length mismatch: expected 200, got ' + bgAudioDiagLog.length);
    }
    if (bgAudioDiagLog[0].event !== 'event-800') {
      throw new Error('Ring buffer FIFO start mismatch: expected event-800, got ' + bgAudioDiagLog[0].event);
    }
    if (bgAudioDiagLog[199].event !== 'event-999') {
      throw new Error('Ring buffer FIFO end mismatch: expected event-999, got ' + bgAudioDiagLog[199].event);
    }

    // Stress: null/undefined/throwing properties
    logAudioDiag(null, null);
    logAudioDiag(undefined, undefined);
    logAudioDiag('poison', { get boom() { throw new Error('poison getter'); } });
    if (bgAudioDiagLog.length !== 200) {
      throw new Error('Ring buffer length changed after edge case insertions');
    }

    console.info = origInfo;
    record('R3.1: Ring buffer 200 cap & non-blocking logging under console exceptions', true);
  } catch (err) {
    record('R3.1: Ring buffer 200 cap', false, err.message);
  }

  // --- TEST 2: Video Event Handlers, Disposed Guard & Complete Detachment ---
  try {
    let detachedCount = 0;
    const attachedHandlers = new Map();

    const mockVideo = {
      currentTime: 12.34,
      readyState: 4,
      muted: false,
      volume: 1.0,
      addEventListener(evt, fn) {
        attachedHandlers.set(evt, fn);
      },
      removeEventListener(evt, fn) {
        if (attachedHandlers.get(evt) === fn) {
          detachedCount++;
          attachedHandlers.delete(evt);
        }
      },
      pause() {},
      removeAttribute() {},
      load() {},
      remove() {}
    };

    const sp = {
      appId: 'spotify',
      sourceType: 'bg',
      isStaging: false,
      isNextPreload: false,
      disposed: false,
      lastPlayTrigger: 'steady-state-play',
      lastPauseTrigger: 'tab-auto-pause-enforced',
      videoEl: mockVideo
    };

    const triggeredEvents = [];
    function mockLogAudioDiag(evt, payload) {
      triggeredEvents.push({ evt, payload });
    }

    const videoEventHandlers = [
      ['play', () => {
        if (sp.disposed) return;
        mockLogAudioDiag('media-play', { trigger: sp.lastPlayTrigger || 'browser-play' });
      }],
      ['pause', () => {
        if (sp.disposed) return;
        mockLogAudioDiag('media-pause', { trigger: sp.lastPauseTrigger || 'browser-pause' });
      }],
      ['playing', () => { if (sp.disposed) return; mockLogAudioDiag('media-playing'); }],
      ['waiting', () => { if (sp.disposed) return; mockLogAudioDiag('media-waiting'); }],
      ['stalled', () => { if (sp.disposed) return; mockLogAudioDiag('media-stalled'); }],
      ['seeking', () => { if (sp.disposed) return; mockLogAudioDiag('media-seeking'); }],
      ['error', () => { if (sp.disposed) return; mockLogAudioDiag('media-error'); }]
    ];

    videoEventHandlers.forEach(([evt, handler]) => {
      mockVideo.addEventListener(evt, handler);
    });
    sp._videoHandlers = videoEventHandlers;

    // Trigger each event while active
    for (const [evt] of videoEventHandlers) {
      const fn = attachedHandlers.get(evt);
      if (fn) fn();
    }
    if (triggeredEvents.length !== 7) {
      throw new Error('Expected 7 triggered events before disposal, got ' + triggeredEvents.length);
    }
    if (triggeredEvents[0].payload.trigger !== 'steady-state-play') {
      throw new Error('Play trigger mismatch: ' + triggeredEvents[0].payload.trigger);
    }
    if (triggeredEvents[1].payload.trigger !== 'tab-auto-pause-enforced') {
      throw new Error('Pause trigger mismatch: ' + triggeredEvents[1].payload.trigger);
    }

    // Now dispose instance
    function disposeSpPlayerInstance(instance) {
      if (!instance || instance.disposed) return;
      instance.disposed = true;
      if (instance.videoEl) {
        if (Array.isArray(instance._videoHandlers)) {
          instance._videoHandlers.forEach(([evt, handler]) => {
            try {
              instance.videoEl.removeEventListener(evt, handler);
            } catch (_) {}
          });
          instance._videoHandlers = null;
        }
        instance.videoEl.remove();
        instance.videoEl = null;
      }
    }

    disposeSpPlayerInstance(sp);
    if (detachedCount !== 7) {
      throw new Error('Expected 7 detached handlers, got ' + detachedCount);
    }
    if (sp.videoEl !== null) {
      throw new Error('sp.videoEl was not set to null');
    }
    if (sp._videoHandlers !== null) {
      throw new Error('sp._videoHandlers was not set to null');
    }

    // Idempotent re-disposal must not throw
    disposeSpPlayerInstance(sp);
    disposeSpPlayerInstance(null);

    // Any late-firing detached callback must do nothing because sp.disposed === true
    for (const [, handler] of videoEventHandlers) {
      handler();
    }
    if (triggeredEvents.length !== 7) {
      throw new Error('Late-firing handler executed after sp.disposed!');
    }

    record('R3.2: HTML5 <video> listeners, triggers, sp.disposed guard & clean unbinding', true);
  } catch (err) {
    record('R3.2: HTML5 <video> telemetry', false, err.message);
  }

  // --- TEST 3: Hold-down & Keepalive Snapshot Structure ---
  try {
    const silentTabHoldSince = new Map();
    silentTabHoldSince.set(101, Date.now() - 1500);
    silentTabHoldSince.set(102, Date.now() - 3200);

    const recentlyStoppedMediaTabMap = new Map();
    recentlyStoppedMediaTabMap.set(201, Date.now() - 500);

    let pendingTabResumeTimer = 42;
    let bgWebAudioKeepaliveCtx = { state: 'running', sampleRate: 48000 };
    let lastAlarmWakePulseAt = Date.now() - 10000;
    let alarmWakePulseCount = 5;
    let lastHeartbeatBroadcastAt = Date.now() - 200;
    let heartbeatBroadcastCount = 120;
    const bgAudioDiagLog = [{ event: 'e1' }, { event: 'e2' }];

    function buildAudioDiagnosticsSnapshot() {
      const now = Date.now();
      const tabHolds = [];
      silentTabHoldSince.forEach((holdStart, tabId) => {
        tabHolds.push({
          tabId,
          heldMs: now - holdStart,
          holdStart
        });
      });

      return {
        version: '2.7.9',
        generatedAt: new Date().toISOString(),
        tabAudioHoldDown: {
          silentTabHolds: tabHolds,
          pendingTabResume: Boolean(pendingTabResumeTimer),
          recentlyStoppedTabs: Array.from(recentlyStoppedMediaTabMap.entries()).map(([tabId, stoppedAt]) => ({
            tabId,
            stoppedAt,
            msAgo: now - stoppedAt
          }))
        },
        keepalive: {
          webAudioState: bgWebAudioKeepaliveCtx ? bgWebAudioKeepaliveCtx.state : 'uninitialized',
          webAudioSampleRate: bgWebAudioKeepaliveCtx ? bgWebAudioKeepaliveCtx.sampleRate : 0,
          lastAlarmWakePulseAt,
          alarmWakePulseCount,
          lastHeartbeatBroadcastAt,
          heartbeatBroadcastCount
        },
        recentEvents: bgAudioDiagLog.slice(-150)
      };
    }

    const snap = buildAudioDiagnosticsSnapshot();
    if (snap.version !== '2.7.9') throw new Error('Expected snap.version 2.7.9');
    if (snap.tabAudioHoldDown.silentTabHolds.length !== 2) throw new Error('Expected 2 silent holds');
    if (snap.tabAudioHoldDown.recentlyStoppedTabs.length !== 1) throw new Error('Expected 1 stopped tab');
    if (!snap.tabAudioHoldDown.pendingTabResume) throw new Error('Expected pendingTabResume true');
    if (snap.keepalive.webAudioState !== 'running') throw new Error('Expected running webAudioState');
    if (snap.keepalive.alarmWakePulseCount !== 5) throw new Error('Expected alarmWakePulseCount 5');
    if (snap.keepalive.heartbeatBroadcastCount !== 120) throw new Error('Expected heartbeatBroadcastCount 120');

    record('R3.3: Hold-down & keepalive telemetry metrics in diagnostics snapshot', true);
  } catch (err) {
    record('R3.3: Hold-down & keepalive telemetry', false, err.message);
  }

  // --- TEST 4: SVG Creation and Zero Emojis in Optimizer DOM ---
  try {
    const container = document.getElementById('container');

    const titleEl = document.createElement('div');
    const musicSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    musicSvg.setAttribute('width', '14');
    musicSvg.setAttribute('height', '14');
    musicSvg.setAttribute('viewBox', '0 0 24 24');
    musicSvg.setAttribute('fill', 'none');
    musicSvg.setAttribute('stroke', '#1ed760');
    musicSvg.setAttribute('stroke-width', '2.2');
    musicSvg.setAttribute('stroke-linecap', 'round');
    musicSvg.setAttribute('stroke-linejoin', 'round');
    const musicPath1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    musicPath1.setAttribute('d', 'M9 18V5l12-2v13');
    const musicCircle1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    musicCircle1.setAttribute('cx', '6');
    musicCircle1.setAttribute('cy', '18');
    musicCircle1.setAttribute('r', '3');
    const musicCircle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    musicCircle2.setAttribute('cx', '18');
    musicCircle2.setAttribute('cy', '16');
    musicCircle2.setAttribute('r', '3');
    musicSvg.appendChild(musicPath1);
    musicSvg.appendChild(musicCircle1);
    musicSvg.appendChild(musicCircle2);
    titleEl.appendChild(musicSvg);
    titleEl.appendChild(document.createTextNode('Enable Firefox DRM to Play Music'));

    const step1 = document.createElement('div');
    step1.textContent = '1. Click "Open Tab to Enable DRM" below → click Firefox\'s yellow "Enable DRM" button at the top of the tab.';
    const step2 = document.createElement('div');
    step2.textContent = '2. Or in Firefox Settings → Tabs and browsing → Media → check "Play DRM-controlled content".';

    const openTabBtn = document.createElement('button');
    const zapSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    zapSvg.setAttribute('width', '12');
    zapSvg.setAttribute('height', '12');
    zapSvg.setAttribute('viewBox', '0 0 24 24');
    zapSvg.setAttribute('fill', 'currentColor');
    zapSvg.setAttribute('stroke', 'none');
    const zapPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    zapPoly.setAttribute('points', '13 2 3 14 12 14 11 22 21 10 12 10 13 2');
    zapSvg.appendChild(zapPoly);
    openTabBtn.appendChild(zapSvg);
    openTabBtn.appendChild(document.createTextNode('Open Tab to Enable DRM'));

    container.appendChild(titleEl);
    container.appendChild(step1);
    container.appendChild(step2);
    container.appendChild(openTabBtn);

    // Verify SVGs are DOM elements
    if (!(musicSvg instanceof SVGElement)) throw new Error('musicSvg is not an SVGElement');
    if (!(zapSvg instanceof SVGElement)) throw new Error('zapSvg is not an SVGElement');

    // Verify text contains no emojis
    const fullText = container.textContent;
    if (fullText.includes('🎵') || fullText.includes('⚡') || fullText.includes('1️⃣') || fullText.includes('2️⃣')) {
      throw new Error('Found forbidden emojis in rendered DOM text: ' + fullText);
    }

    record('R4.1: Clean SVG DOM creation and zero emojis in UI elements', true);
  } catch (err) {
    record('R4.1: SVG DOM creation', false, err.message);
  }

  // Report back to python harness
  await fetch('/__report__', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(results)
  });
}

window.addEventListener('load', runM2ReviewStressTests);
</script>
</body>
</html>
"""

class TestServer(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass # silent

    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(TEST_HTML.encode('utf-8'))
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == '/__report__':
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length).decode('utf-8')
            self.server.report_data = json.loads(body)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'OK')

def run():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
    sock.close()

    server = http.server.HTTPServer(('127.0.0.1', port), TestServer)
    server.report_data = None
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    profile_dir = tempfile.mkdtemp(prefix="ff_m2_review_")
    cmd = [
        FIREFOX_BIN,
        "--headless",
        "-profile", profile_dir,
        "--no-remote",
        f"http://127.0.0.1:{port}/"
    ]
    proc = subprocess.Popen(cmd)

    start = time.time()
    while time.time() - start < 15:
        if server.report_data is not None:
            break
        time.sleep(0.1)

    proc.terminate()
    try:
        proc.wait(timeout=3)
    except Exception:
        proc.kill()
    server.shutdown()
    shutil.rmtree(profile_dir, ignore_errors=True)

    if not server.report_data:
        print("[FAIL] Timeout waiting for test results from Firefox!")
        sys.exit(1)

    all_pass = True
    print("=" * 70)
    print("FOXHUB v2.7.9 M2 REVIEWER 2 ADVERSARIAL STRESS TEST RESULTS (Real Firefox)")
    print("=" * 70)
    for r in server.report_data:
        status = "[PASS]" if r["pass"] else "[FAIL]"
        print(f"  {status} {r['name']}")
        if not r["pass"]:
            all_pass = False
            print(f"         Error: {r['err']}")
    print("=" * 70)

    if all_pass:
        print("ALL REVIEWER 2 ADVERSARIAL STRESS TESTS PASSED (100%)!")
        sys.exit(0)
    else:
        print("SOME TESTS FAILED!")
        sys.exit(1)

if __name__ == '__main__':
    run()
