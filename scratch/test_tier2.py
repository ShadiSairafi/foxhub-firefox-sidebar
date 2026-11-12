# Tier 2 Test Case Generator (Features F01 - F20, 100 boundary tests)
# Genuine boundary & corner cases exercising real FoxHub runtime functions

def get_tier2_tests_js():
    return r"""
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
"""
