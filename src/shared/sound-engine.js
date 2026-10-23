/**
 * PocketHub — 100% Local Cozy Acoustic & Tactile Sound Synthesizer + Voice (TTS) Reader Engine
 * All chimes pass through a warm analog-style Low-Pass Filter so there are zero sharp or piercing frequencies.
 */

(function (global) {
  const SOUND_PRESETS = {
    'bamboo-pop': {
      id: 'bamboo-pop',
      name: 'Soft Bamboo Pop',
      description: 'Light, rounded hollow bamboo tap — ultra-satisfying'
    },
    'cozy-plop': {
      id: 'cozy-plop',
      name: 'Cozy Dewdrop Bloop',
      description: 'Gentle warm bubble pop with zero sharp highs'
    },
    'velvet-rhodes': {
      id: 'velvet-rhodes',
      name: 'Velvet Lo-Fi Rhodes',
      description: 'Mellow low-pass vintage electric piano chord'
    },
    'felt-piano': {
      id: 'felt-piano',
      name: 'Warm Felt Piano',
      description: 'Soft, intimate muffled upright piano two-note interval'
    },
    'marimba': {
      id: 'marimba',
      name: 'Warm Rosewood Marimba',
      description: 'Deep, gentle wooden marimba fifth (C4 to G4)'
    },
    'kalimba': {
      id: 'kalimba',
      name: 'Cozy Kalimba Pluck',
      description: 'Mellow low-register thumb-piano pluck'
    },
    'raindrop-leaf': {
      id: 'raindrop-leaf',
      name: 'Raindrop on Leaf',
      description: 'Subtle organic droplet pat with warm decay'
    },
    'vinyl-pluck': {
      id: 'vinyl-pluck',
      name: 'Acoustic Harmonic Pluck',
      description: 'Warm, muted acoustic guitar natural harmonic'
    },
    'morning-dew': {
      id: 'morning-dew',
      name: 'Sunlit Harp Whisper',
      description: 'Soft ascending mid-register harp notes'
    },
    'soft-chord': {
      id: 'soft-chord',
      name: 'Cozy Lounge Maj7',
      description: 'Dreamy warm pad chord in low-mid register'
    },
    'woodblock-tap': {
      id: 'woodblock-tap',
      name: 'Tactile Walnut Tap',
      description: 'Ultra-short, quiet wooden desk tap'
    },
    'zen-bowl': {
      id: 'zen-bowl',
      name: 'Deep Singing Bowl',
      description: 'Low, grounding 288 Hz meditation hum'
    },
    'warm-bell': {
      id: 'warm-bell',
      name: 'Mellow Ceramic Chime',
      description: 'Soft earthenware chime without high overtones'
    },
    'crystal-drop': {
      id: 'crystal-drop',
      name: 'Soft Glass Pebble',
      description: 'Gentle rounded pebble tap, low-pass smoothed'
    },
    'crisp-ding': {
      id: 'crisp-ding',
      name: 'Minimalist Warm Note',
      description: 'Single soft, rounded G4 tone'
    },
    'custom': {
      id: 'custom',
      name: 'Custom Local Sound',
      description: 'Your own uploaded audio file'
    },
    'none': {
      id: 'none',
      name: 'Silent',
      description: 'No notification sound'
    }
  };

  // Dropdown list excludes 'custom' and 'none' (since Mute is a dedicated SVG toggle button)
  const SOUND_PRESET_LIST = Object.values(SOUND_PRESETS).filter(
    (p) => p.id !== 'custom' && p.id !== 'none'
  );

  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = global.AudioContext || global.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  /**
   * Plays a warm, low-pass filtered note with optional pitch glide and zero harshness
   */
  function playWarmTone(ctx, opts) {
    const {
      freq = 320,
      endFreq = null,
      startTime = ctx.currentTime,
      duration = 0.28,
      volume = 0.18,
      type = 'sine',
      attack = 0.016,
      cutoff = 900
    } = opts;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    if (endFreq && endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), startTime + duration * 0.82);
    }

    // Warm analog-style low-pass filter removes all sharp/piercing upper harmonics
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, startTime);
    filter.Q.setValueAtTime(0.65, startTime);

    const safePeak = Math.max(0.002, Math.min(0.32, volume));
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(safePeak, startTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.onended = () => {
      try {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch (_) {}
    };

    osc.start(startTime);
    osc.stop(startTime + duration + 0.025);
  }

  async function playNotificationSound(soundId = 'bamboo-pop', volume = 0.7, customAudioData = null) {
    if (soundId === 'none' || volume <= 0) return;

    if (soundId === 'custom' && customAudioData) {
      try {
        const audio = new Audio(customAudioData);
        audio.volume = Math.min(1, Math.max(0, volume));
        await audio.play();
        return;
      } catch (_) {}
    }

    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime + 0.015;
    // Gentle master scaling so chimes are always cozy, light, and never startling
    const vol = Math.min(1, Math.max(0.04, volume)) * 0.22;

    switch (soundId) {
      case 'bamboo-pop':
        // Soft hollow bamboo tap: warm low-mid fundamental with subtle pitch bloom
        playWarmTone(ctx, { freq: 290, endFreq: 385, startTime: now, duration: 0.14, volume: vol * 0.95, type: 'sine', attack: 0.008, cutoff: 750 });
        playWarmTone(ctx, { freq: 580, startTime: now + 0.005, duration: 0.07, volume: vol * 0.22, type: 'triangle', attack: 0.005, cutoff: 700 });
        break;

      case 'cozy-plop':
        // Satisfying warm dewdrop bloop (G3 -> D4 soft glide)
        playWarmTone(ctx, { freq: 220, endFreq: 392, startTime: now, duration: 0.16, volume: vol * 0.95, type: 'sine', attack: 0.01, cutoff: 680 });
        break;

      case 'velvet-rhodes':
        // Warm Fmaj9 lo-fi Rhodes chord in cozy mid-register (F3, A3, C4, E4, G4)
        [174.61, 220.0, 261.63, 329.63, 392.0].forEach((f, idx) => {
          playWarmTone(ctx, {
            freq: f,
            startTime: now + idx * 0.022,
            duration: 0.62,
            volume: vol * (0.48 - idx * 0.05),
            type: 'triangle',
            attack: 0.025,
            cutoff: 640
          });
        });
        break;

      case 'felt-piano':
        // Muffled upright felt piano (C4 -> E4 gentle interval)
        playWarmTone(ctx, { freq: 261.63, startTime: now, duration: 0.36, volume: vol * 0.85, type: 'sine', attack: 0.02, cutoff: 620 });
        playWarmTone(ctx, { freq: 329.63, startTime: now + 0.12, duration: 0.52, volume: vol * 0.9, type: 'sine', attack: 0.022, cutoff: 650 });
        break;

      case 'marimba':
        // Warm rosewood marimba (C4 -> G4 in mellow register, zero high piercing octave)
        playWarmTone(ctx, { freq: 261.63, startTime: now, duration: 0.24, volume: vol * 0.9, type: 'sine', attack: 0.01, cutoff: 720 });
        playWarmTone(ctx, { freq: 392.0, startTime: now + 0.11, duration: 0.38, volume: vol * 0.95, type: 'sine', attack: 0.012, cutoff: 760 });
        break;

      case 'kalimba':
        // Cozy thumb-piano pluck (D4 -> F#4 -> A4)
        [293.66, 369.99, 440.0].forEach((f, idx) => {
          playWarmTone(ctx, {
            freq: f,
            startTime: now + idx * 0.085,
            duration: 0.34,
            volume: vol * 0.8,
            type: 'sine',
            attack: 0.01,
            cutoff: 780
          });
        });
        break;

      case 'raindrop-leaf':
        // Soft organic droplet pat
        playWarmTone(ctx, { freq: 340, endFreq: 255, startTime: now, duration: 0.11, volume: vol * 0.75, type: 'sine', attack: 0.007, cutoff: 620 });
        playWarmTone(ctx, { freq: 450, startTime: now + 0.065, duration: 0.22, volume: vol * 0.82, type: 'sine', attack: 0.01, cutoff: 720 });
        break;

      case 'vinyl-pluck':
        // Warm acoustic guitar harmonic (A3 -> E4)
        playWarmTone(ctx, { freq: 220.0, startTime: now, duration: 0.32, volume: vol * 0.8, type: 'triangle', attack: 0.012, cutoff: 580 });
        playWarmTone(ctx, { freq: 329.63, startTime: now + 0.075, duration: 0.44, volume: vol * 0.85, type: 'sine', attack: 0.014, cutoff: 680 });
        break;

      case 'morning-dew':
        // Soft mid-register harp whisper (G3 -> B3 -> D4 -> F#4)
        [196.0, 246.94, 293.66, 369.99].forEach((f, idx) => {
          playWarmTone(ctx, {
            freq: f,
            startTime: now + idx * 0.075,
            duration: 0.48,
            volume: vol * (0.76 - idx * 0.08),
            type: 'sine',
            attack: 0.018,
            cutoff: 720
          });
        });
        break;

      case 'soft-chord':
        // Cozy lounge Cmaj7 pad (C4, E4, G4, B4) with warm low-pass filter
        [261.63, 329.63, 392.0, 493.88].forEach((f, idx) => {
          playWarmTone(ctx, {
            freq: f,
            startTime: now + idx * 0.025,
            duration: 0.65,
            volume: vol * 0.46,
            type: 'sine',
            attack: 0.03,
            cutoff: 660
          });
        });
        break;

      case 'woodblock-tap':
        // Tactile walnut desk tap (ultra-short & unobtrusive)
        playWarmTone(ctx, { freq: 245, endFreq: 175, startTime: now, duration: 0.085, volume: vol * 0.9, type: 'triangle', attack: 0.005, cutoff: 520 });
        break;

      case 'zen-bowl':
        // Deep 288 Hz warm meditation bowl
        playWarmTone(ctx, { freq: 288.0, startTime: now, duration: 0.88, volume: vol * 0.85, type: 'sine', attack: 0.035, cutoff: 540 });
        playWarmTone(ctx, { freq: 432.0, startTime: now + 0.02, duration: 0.52, volume: vol * 0.28, type: 'sine', attack: 0.03, cutoff: 600 });
        break;

      case 'warm-bell':
        // Mellow ceramic chime (E4 -> B4, warm & gentle)
        playWarmTone(ctx, { freq: 329.63, startTime: now, duration: 0.55, volume: vol * 0.82, type: 'sine', attack: 0.015, cutoff: 700 });
        playWarmTone(ctx, { freq: 493.88, startTime: now + 0.04, duration: 0.35, volume: vol * 0.35, type: 'sine', attack: 0.015, cutoff: 720 });
        break;

      case 'crystal-drop':
        // Soft glass pebble (F4 -> A4, smoothed)
        playWarmTone(ctx, { freq: 349.23, startTime: now, duration: 0.16, volume: vol * 0.78, type: 'sine', attack: 0.01, cutoff: 760 });
        playWarmTone(ctx, { freq: 440.0, startTime: now + 0.065, duration: 0.26, volume: vol * 0.8, type: 'sine', attack: 0.012, cutoff: 780 });
        break;

      case 'crisp-ding':
      default:
        // Single soft rounded G4 note
        playWarmTone(ctx, { freq: 392.0, startTime: now, duration: 0.36, volume: vol * 0.82, type: 'sine', attack: 0.015, cutoff: 720 });
        break;
    }
  }

  /**
   * Text-To-Speech (Listen to Email) Engine
   */
  let currentUtterance = null;
  let speakingMessageId = null;

  function stopSpeaking() {
    if (global.speechSynthesis) {
      global.speechSynthesis.cancel();
    }
    currentUtterance = null;
    speakingMessageId = null;
  }

  function speakEmail(emailObj, options = {}, onStateChange = () => {}) {
    if (!global.speechSynthesis) {
      onStateChange({ playing: false, error: 'Speech synthesis is not supported in this browser.' });
      return;
    }

    if (speakingMessageId === emailObj.id && global.speechSynthesis.speaking) {
      stopSpeaking();
      onStateChange({ playing: false, messageId: null });
      return;
    }

    stopSpeaking();

    const cleanBody = (emailObj.fullText || emailObj.snippet || '')
      .replace(/https?:\/\/\S+/g, 'link')
      .replace(/\s+/g, ' ')
      .trim();

    const script = `Email from ${emailObj.senderName || emailObj.senderEmail}. Subject: ${emailObj.subject || 'No subject'}. ${cleanBody}`;

    const utterance = new SpeechSynthesisUtterance(script);
    utterance.rate = options.ttsRate || 1.0;
    utterance.pitch = options.ttsPitch || 1.0;
    utterance.volume = options.volume !== undefined ? options.volume : 0.9;

    const voices = global.speechSynthesis.getVoices();
    if (options.ttsVoice && voices.length > 0) {
      const matched = voices.find((v) => v.name === options.ttsVoice);
      if (matched) utterance.voice = matched;
    }

    speakingMessageId = emailObj.id;
    currentUtterance = utterance;

    utterance.onstart = () => {
      onStateChange({ playing: true, messageId: emailObj.id });
    };
    utterance.onend = () => {
      speakingMessageId = null;
      currentUtterance = null;
      onStateChange({ playing: false, messageId: null });
    };
    utterance.onerror = () => {
      speakingMessageId = null;
      currentUtterance = null;
      onStateChange({ playing: false, messageId: null });
    };

    global.speechSynthesis.speak(utterance);
  }

  function getSpeakingMessageId() {
    if (global.speechSynthesis && global.speechSynthesis.speaking) {
      return speakingMessageId;
    }
    return null;
  }

  global.PocketMailSound = {
    SOUND_PRESETS,
    SOUND_PRESET_LIST,
    playNotificationSound,
    speakEmail,
    stopSpeaking,
    getSpeakingMessageId
  };
})(typeof window !== 'undefined' ? window : this);
