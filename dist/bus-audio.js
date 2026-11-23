(() => {
  'use strict';

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  function create({preloadArcade = false} = {}) {
    const engineUrl = 'assets/bus-engine.wav';
    const horn = {url: 'assets/departure-horn.wav'};
    const airBrake = {url: 'assets/air-brake.wav'};
    const rampBoing = {url: 'assets/ramp-boing.wav'};
    const rocketLoop = {url: 'assets/rocket-engine.wav'};
    const engineLevel = 0.25;
    const fullScaleGain = 0.45;
    let masterGain = fullScaleGain * 0.6;
    let ctx, master, motor, engineGain, engineBuffer, media;
    let loading = false;
    let stopTimer;
    let pitch = 1;
    let volume = engineLevel * 0.65;
    let previousSampleTime = 0;
    let previousSpeed = 0;
    let enabled = true;
    let driving = false;
    let shutdownStart, cueSource, cueMedia;
    let cueGeneration = 0;
    let rocketActive = false;
    let rocketSource, rocketGain, rocketMedia, rocketStop;

    function cueBytes(cue) {
      return cue.bytes ||= fetch(cue.url).then(response => {
        if (!response.ok) throw new Error('Cue unavailable');
        return response.arrayBuffer();
      }).catch(() => { cue.bytes = null; return null; });
    }

    function cueBuffer(cue) {
      return cue.decoded ||= cueBytes(cue).then(bytes => bytes && ctx.decodeAudioData(bytes))
        .catch(() => null)
        .then(buffer => {
          cue.bytes = null;
          if (!buffer) cue.decoded = null;
          return buffer;
        });
    }

    // Fetch short cues on the launch screen to avoid network waits during play.
    if ((window.AudioContext || window.webkitAudioContext) && window.location?.protocol !== 'file:') {
      cueBytes(horn);
      cueBytes(airBrake);
      if (preloadArcade) {
        cueBytes(rampBoing);
        cueBytes(rocketLoop);
      }
    }

    function stopCue() {
      cueGeneration++;
      if (cueSource) {
        cueSource.stop();
        cueSource = null;
      }
      if (cueMedia) cueMedia.pause();
    }

    function playCue(cue) {
      if (!enabled || !driving || masterGain === 0) return;
      stopCue();
      if (!ctx || window.location?.protocol === 'file:') {
        if (!window.Audio) return;
        cueMedia ||= new window.Audio();
        cueMedia.src = cue.url;
        syncVolume();
        cueMedia.play().catch(() => {});
        return;
      }
      const generation = cueGeneration;
      const deadline = performance.now() + 650;
      cueBuffer(cue).then(buffer => {
        if (!buffer || generation !== cueGeneration || !masterGain || performance.now() > deadline) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(master);
        source.onended = () => {
          source.disconnect();
          if (cueSource === source) cueSource = null;
        };
        cueSource = source;
        source.start();
      });
    }

    function syncVolume() {
      if (master) master.gain.setTargetAtTime(enabled && driving ? masterGain : 0, ctx.currentTime, 0.018);
      if (media) {
        media.volume = volume * masterGain;
        media.muted = !enabled || !driving || masterGain === 0;
      }
      if (cueMedia) {
        cueMedia.volume = masterGain;
        cueMedia.muted = !enabled || !driving || masterGain === 0;
      }
    }

    function rocketAudible() {
      return rocketActive && enabled && driving && masterGain > 0;
    }

    function syncRocket() {
      clearTimeout(rocketStop);
      if (!rocketAudible()) {
        if (rocketMedia) rocketMedia.pause();
        if (rocketSource) {
          rocketGain.gain.setTargetAtTime(0, ctx.currentTime, 0.018);
          rocketStop = setTimeout(() => {
            rocketSource.stop();
            rocketSource.disconnect();
            rocketSource = null;
          }, 100);
        }
        return;
      }
      if (!ctx || window.location?.protocol === 'file:') {
        if (!window.Audio) return;
        rocketMedia ||= new window.Audio(rocketLoop.url);
        rocketMedia.loop = true;
        rocketMedia.volume = masterGain;
        if (rocketMedia.paused) rocketMedia.play().catch(() => {});
        return;
      }
      cueBuffer(rocketLoop).then(buffer => {
        // A decode may finish after a pause, a restart or the end of the boost.
        if (!buffer || !rocketAudible()) return;
        if (!rocketGain) {
          rocketGain = ctx.createGain();
          rocketGain.connect(master);
        }
        if (!rocketSource) {
          rocketSource = ctx.createBufferSource();
          rocketSource.buffer = buffer;
          rocketSource.loop = true;
          rocketSource.connect(rocketGain);
          rocketGain.gain.setValueAtTime(0, ctx.currentTime);
          rocketSource.start();
        }
        rocketGain.gain.setTargetAtTime(1, ctx.currentTime, 0.035);
      });
    }

    function syncPlayback() {
      const audible = enabled && driving && volume > 0;
      if (!enabled || !driving) stopCue();
      clearTimeout(stopTimer);
      syncVolume();
      syncRocket();
      if (media) {
        media.playbackRate = pitch;
        if (audible && media.paused) media.play().catch(() => {});
        if (!audible) media.pause();
        return;
      }
      if (audible && engineBuffer && !motor) {
        motor = ctx.createBufferSource();
        motor.buffer = engineBuffer;
        motor.loop = true;
        motor.playbackRate.value = pitch;
        motor.connect(engineGain);
        motor.start();
      }
      if (!motor) return;
      engineGain.gain.setTargetAtTime(audible ? volume : 0, ctx.currentTime, 0.025);
      if (!audible) {
        // A quick pause/resume reverses the fade on the same playhead.
        stopTimer = setTimeout(() => {
          motor.stop();
          motor.disconnect();
          motor = null;
        }, 160);
      }
    }

    function applyEngineTone() {
      if (!enabled || !driving) return;
      if (motor) {
        motor.playbackRate.setTargetAtTime(pitch, ctx.currentTime, 0.05);
        engineGain.gain.setTargetAtTime(volume, ctx.currentTime, 0.06);
      } else if (media) {
        media.playbackRate = pitch;
        media.volume = volume * masterGain;
      }
    }

    function unlock() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!ctx && AudioContext) {
        try {
          ctx = new AudioContext();
          master = ctx.createGain();
          master.gain.value = 0;
          master.connect(ctx.destination);
          engineGain = ctx.createGain();
          engineGain.gain.value = 0;
          engineGain.connect(master);
        } catch { ctx = master = engineGain = null; }
      }
      if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});

      // Browsers can play a sibling file as media even when file:// blocks fetch.
      if (!ctx || window.location?.protocol === 'file:') {
        if (!media && window.Audio) {
          media = new window.Audio(engineUrl);
          media.loop = true;
          media.preservesPitch = false;
          media.webkitPreservesPitch = false;
        }
      } else if (!engineBuffer && !loading) {
        loading = true;
        fetch(engineUrl)
          .then(response => {
            if (!response.ok) throw new Error('Engine recording unavailable');
            return response.arrayBuffer();
          })
          .then(bytes => ctx.decodeAudioData(bytes))
          .then(buffer => {
            engineBuffer = buffer;
            syncPlayback();
          })
          .catch(() => { /* Retry on the next start, resume or sound activation. */ })
          .finally(() => { loading = false; });
      }
    }

    function note(pitch, endPitch, duration, offset, gain, wave = 'sine') {
      if (!driving || !enabled || !masterGain || !ctx || !master || ctx.state !== 'running') return;
      const start = ctx.currentTime + offset;
      const end = start + duration;
      const voice = ctx.createOscillator();
      const amp = ctx.createGain();
      voice.type = wave;
      voice.frequency.setValueAtTime(pitch, start);
      voice.frequency.exponentialRampToValueAtTime(endPitch, end);
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, end);
      voice.connect(amp);
      amp.connect(master);
      voice.onended = () => { voice.disconnect(); amp.disconnect(); };
      voice.start(start);
      voice.stop(end + 0.01);
    }

    return {
      horn() { playCue(horn); },
      airBrake() { playCue(airBrake); },
      setRocket(active) {
        if (rocketActive === active) return;
        rocketActive = active;
        syncRocket();
      },
      shutdown(progress) {
        shutdownStart ||= {pitch, volume};
        const remaining = 1 - clamp(progress, 0, 1);
        pitch = 0.32 + (shutdownStart.pitch - 0.32) * remaining;
        volume = shutdownStart.volume * remaining;
        if (remaining > 0) {
          applyEngineTone();
        } else {
          clearTimeout(stopTimer);
          if (motor) {
            motor.stop();
            motor.disconnect();
            motor = null;
          }
          if (media) { media.volume = 0; media.pause(); }
        }
      },
      setVolume(value) {
        if (!Number.isFinite(value)) return;
        masterGain = fullScaleGain * clamp(value, 0, 1);
        syncVolume();
        syncRocket();
      },
      setEnabled(value) {
        enabled = Boolean(value);
        if (enabled && driving) unlock();
        syncPlayback();
      },
      setDriving(value) {
        driving = value;
        if (driving && enabled) unlock();
        syncPlayback();
      },
      update(state) {
        shutdownStart = null;
        const dt = state.time - previousSampleTime;
        const acceleration = dt > 0 ? (state.speed - previousSpeed) / dt : 0;
        previousSampleTime = state.time;
        previousSpeed = state.speed;
        const load = state.braking ? 0 : clamp(acceleration / 32, 0, 1);
        const boost = state.braking ? 0 : Math.min(1, (state.boost || 0) / 0.30);
        const overrun = clamp(-acceleration / 40, 0, 1);
        // RPM already includes the drop at each automatic upshift. Engine load
        // adds a short growl as the bus accelerates, especially under turbo.
        const rpm = state.rpm ?? window.BusHandling.rpmAt(state.speed);
        const targetPitch = clamp(0.84 + (rpm - 2500) * 0.00018
          + (state.speed - 35) * 0.0025 + load * 0.10 + boost * 0.18 - overrun * 0.04, 0.76, 1.70);
        const targetVolume = engineLevel * (0.65 + load * 0.15 + boost * 0.13 - (state.braking ? 0.15 : 0));
        const smoothing = dt > 0 ? 1 - Math.exp(-dt / 0.10) : 1;
        pitch += (targetPitch - pitch) * smoothing;
        volume += (targetVolume - volume) * smoothing;
        applyEngineTone();
      },
      effect(type) {
        if (type === 'boarding') type = 'repair';
        if (type === 'jump') {
          playCue(rampBoing);
        } else if (type === 'spin') {
          note(659, 988, 0.15, 0, 0.095);
          note(988, 1319, 0.19, 0.095, 0.085);
        } else if (type === 'boost' || type === 'repair' || type === 'lap') {
          const notes = type === 'boost' ? [392, 494, 659] : type === 'repair' ? [523, 659, 784] : [523, 659, 784, 1047];
          notes.forEach((pitch, i) => note(pitch, pitch, 0.22, i * 0.075, 0.105));
        } else if (type === 'oil') {
          note(340, 100, 0.36, 0, 0.07, 'triangle');
        } else {
          note(type === 'pothole' ? 132 : 165, 46, 0.18, 0, 0.22, 'triangle');
        }
      }
    };
  }

  window.BusAudio = {create};
})();
