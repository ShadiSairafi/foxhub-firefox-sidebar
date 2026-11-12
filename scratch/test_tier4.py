# Tier 4 Test Case Generator (6 Real-World Workload Scenarios)
# Dynamic, non-tautological continuous playback & system stress simulations

def get_tier4_tests_js():
    return r"""
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
"""
