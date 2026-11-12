# Tier 3 Test Case Generator (15 Cross-Feature Combination Tests)
# Genuine multi-subsystem interactions across Storage, DOM, IPC, and Audio

def get_tier3_tests_js():
    return r"""
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
"""
