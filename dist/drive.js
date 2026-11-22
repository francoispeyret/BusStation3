(() => {
  'use strict';

  const LAP_METRES = 1000;
  const LAP_PERIODS = ['Matin', 'Journée', 'Fin de journée', 'Nuit'];
  function periodForLap(lap=1) {
    return (Math.max(1,Math.floor(lap))-1)%LAP_PERIODS.length;
  }
  const SCENERY_NAMES = Object.fromEntries(
    Array.from(window.BusBiomes.definitions, ([id, biome]) => [id, biome.name])
  );
  const BIOMES = Object.keys(SCENERY_NAMES);
  const previewBiomes = ['hills'];
  function sceneryForLap(lap = 1, lapBiomes = previewBiomes) {
    lap = Math.floor(lap);
    if (lap <= 1 || !Number.isFinite(lap)) return 'hills';
    // Approaching a marker reveals the next draw. Keep it for every later visit.
    while (lapBiomes.length < lap) lapBiomes.push(choose(BIOMES));
    return lapBiomes[lap - 1];
  }
  const INTRO_SECONDS = 3.2;
  const LAUNCH_WAIT = 0.65;
  const LAUNCH_SPEED = 48;
  const BRAKE_SECONDS = 3;
  const OUTRO_SECONDS = 4.5;
  const LANES = [-1, 0, 1];
  const LANE_WIDTH = window.BusBiomes.LANE_WIDTH;
  const ROAD_HALF_WIDTH = 1.5 * LANE_WIDTH;
  const DRIVABLE_HALF_WIDTH = ROAD_HALF_WIDTH + LANE_WIDTH;
  const SHOULDER_SPEED_FACTOR = 0.62;
  const BUS_HALF_WIDTH = 1.16;
  const BUS_HALF_LENGTH = 2.54;
  const REAR_AXLE_Z = -1.55;
  const TIRE_WIDTH = 0.29;
  const WHEELBASE = 3.09;
  const MAX_HEADING_FROM_ROAD = 0.54;
  const RAMP = {halfWidth: 1.45, halfLength: 2.6, lipHeight: 0.9, wheelMargin: 0.35};
  const RAMP_CLEARANCE = 12;
  const LONG_JUMP_SPEED = 72;
  const RAMP_KICK_KMH = 12;
  const RAMP_KICK_SECONDS = 0.35;
  const ROCKET_METRES = 400;
  const ROCKET_GRACE_SECONDS = 2;
  const ROCKET_SPEED = 300;
  const ROCKET_ACCELERATION = 55; // km/h per second
  const ROCKET_BRAKING = 200; // km/h per second
  // Half-extents in metres, matching the visible road objects.
  const FOOTPRINTS = {
    cone: [0.46, 0.44], barrier: [1.12, 0.35], oil: [1.12, 0.97],
    pothole: [1.12, 0.97], boost: [0.57, 0.20], repair: [0.56, 0.32], rocket: [0.76, 0.55]
  };
  const HAZARDS = ['cone', 'barrier', 'oil', 'pothole'];
  const IMPACT_DURATIONS = { cone: 0.95, barrier: 0.76, oil: 0.68, repair: 0.85, boost: 0.50 };
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const choose = items => items[Math.floor(Math.random() * items.length)];
  const isPickup = type => type === 'repair' || type === 'boost' || type === 'rocket';
  const roadX = z => 11 * Math.sin(z * 0.012) + 8 * Math.sin(z * 0.022 + 0.7);
  const roadSlope = z => 0.132 * Math.cos(z * 0.012) + 0.176 * Math.cos(z * 0.022 + 0.7);

  function tireContact(x, z) {
    const beyond = Math.abs(x - roadX(z)) - ROAD_HALF_WIDTH;
    return clamp(0.5 + beyond / TIRE_WIDTH, 0, 1);
  }

  function updateWheelContact(state) {
    const sin = Math.sin(state.worldHeading), cos = Math.cos(state.worldHeading);
    const busX = roadX(state.roadZ) + state.laneX * LANE_WIDTH;
    let contact = 0;
    for (const wheel of state.rearWheels) {
      wheel.x = busX + wheel.side * BUS_HALF_WIDTH * cos + REAR_AXLE_Z * sin;
      wheel.z = state.roadZ - wheel.side * BUS_HALF_WIDTH * sin + REAR_AXLE_Z * cos;
      wheel.contact = state.jump ? 0 : tireContact(wheel.x, wheel.z);
      if (!state.jump) contact += wheel.contact + tireContact(wheel.x + WHEELBASE * sin, wheel.z + WHEELBASE * cos);
    }
    state.shoulderContact = contact / 4;
  }

  // Both bends repeat after this distance on the Z axis. Measure one period
  // along the centreline so each kilometre marker has a permanent road position.
  const roadPeriod = 2 * Math.PI / .002;
  const sampleCount = 1024;
  const sampleStep = roadPeriod / sampleCount;
  const roadLengths = new Float64Array(sampleCount + 1);
  let previousScale = Math.hypot(1, roadSlope(0));
  for (let i = 1; i <= sampleCount; i++) {
    const scale = Math.hypot(1, roadSlope(i * sampleStep));
    roadLengths[i] = roadLengths[i - 1] + (previousScale + scale) * .5 * sampleStep;
    previousScale = scale;
  }
  const periodLength = roadLengths[sampleCount];
  function routeProgressAt(z) {
    if (z <= 0) return 0;
    const period = Math.floor(z / roadPeriod);
    const sample = (z - period * roadPeriod) / sampleStep;
    const i = Math.min(sampleCount - 1, Math.floor(sample));
    const metres = period * periodLength + roadLengths[i] + (sample - i) * (roadLengths[i + 1] - roadLengths[i]);
    // Roundoff from the inverse lookup must not leave the bus on the previous lap at its sign.
    return (metres + 1e-8) / LAP_METRES;
  }
  function lapAtRoadZ(z) {
    return 1 + Math.floor(routeProgressAt(z));
  }
  function roadZAtDistance(metres) {
    const period = Math.floor(metres / periodLength);
    const within = metres - period * periodLength;
    let lo = 0, hi = sampleCount;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (roadLengths[mid] <= within) lo = mid;
      else hi = mid;
    }
    const fraction = (within - roadLengths[lo]) / (roadLengths[lo + 1] - roadLengths[lo]);
    return period * roadPeriod + (lo + fraction) * sampleStep;
  }
  // Geometry and terrain samples repeatedly ask for the same nearby markers.
  const lapMarkers = new Array(4);
  function roadZForLap(lap) {
    const slot = lap % lapMarkers.length;
    if (lapMarkers[slot]?.lap === lap) return lapMarkers[slot].z;
    const z = roadZAtDistance(Math.max(0, lap - 1) * LAP_METRES);
    lapMarkers[slot] = {lap, z};
    return z;
  }

  function makeSound() {
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
      cueBytes(rampBoing);
      cueBytes(rocketLoop);
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
      if (master) master.gain.setTargetAtTime(enabled ? masterGain : 0, ctx.currentTime, 0.018);
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
      if (!enabled || !ctx || !master || ctx.state !== 'running') return;
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
        const boost = state.braking ? 0 : Math.min(1, state.boost / 0.30);
        const overrun = clamp(-acceleration / 40, 0, 1);
        // RPM already includes the drop at each automatic upshift. Engine load
        // adds a short growl as the bus accelerates, especially under turbo.
        const targetPitch = clamp(0.84 + (state.rpm - 2500) * 0.00018
          + (state.speed - 35) * 0.0025 + load * 0.10 + boost * 0.18 - overrun * 0.04, 0.76, 1.70);
        const targetVolume = engineLevel * (0.65 + load * 0.15 + boost * 0.13 - (state.braking ? 0.15 : 0));
        const smoothing = dt > 0 ? 1 - Math.exp(-dt / 0.10) : 1;
        pitch += (targetPitch - pitch) * smoothing;
        volume += (targetVolume - volume) * smoothing;
        applyEngineTone();
      },
      effect(type) {
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

  function startingState() {
    const state = {
      status: 'ready', phase: 'driving', introProgress: 1, stopProgress: 0,
      distance: 0, roadZ: 0, speed: LAUNCH_SPEED, time: 0, laneX: 0,
      worldHeading: Math.atan(roadSlope(0)), heading: 0, steer: 0,
      shoulderContact: 0, rearWheels: [-1, 1].map(side => ({side, x: 0, z: 0, contact: 0})),
      objects: [], impacts: [], jump: null, boost: 0, rocketRemaining: 0, rocketGrace: 0,
      slip: 0, flat: false, hit: 0, score: 0, lap: 1,
      lapBiomes: ['hills'], lapProgress: 0, health: 3, gear: 3, rpm: 2200, braking: false
    };
    updateWheelContact(state);
    return state;
  }

  function updateTransmission(state) {
    state.gear = Math.min(6, 1 + Math.floor(state.speed / 21));
    state.rpm = Math.round(1500 + state.speed * 89 / (1 + (state.gear - 1) * 0.64));
  }

  const STAGE_SECONDS = 20;
  const NIGHT_STAGE = 3;
  const IGNITION_SECONDS = 8, CUTOFF_SECONDS = 13.7, PICKUP_METRES = 300;
  const BENCHMARK_STAGES = ['hills', 'forest', 'desert', 'city', 'bridge', 'snow'].map((biome, i) => ({
    biome, label: SCENERY_NAMES[biome] + (i === NIGHT_STAGE ? ' · Fusée de nuit' : ''),
    startMs: i * STAGE_SECONDS * 1000, endMs: (i + 1) * STAGE_SECONDS * 1000
  }));
  const BENCHMARK_SECONDS = STAGE_SECONDS * BENCHMARK_STAGES.length;
  // Time (s) and speed (km/h) along the city lap. Integrating these speeds gives
  // 300 m to the pickup, 400 m under thrust, then 300 m back to the next marker.
  const nightSpeeds = [[0, 180], [4, 120], [IGNITION_SECONDS, 120], [11, ROCKET_SPEED],
    [CUTOFF_SECONDS, ROCKET_SPEED], [15.95, 120], [STAGE_SECONDS, 180]];

  function createBenchmark(audio) {
    const state = startingState();
    state.status = 'running';
    state.lapBiomes = BENCHMARK_STAGES.map(stage => stage.biome);
    // Fix the scenery beyond the finish line too: both cameras see ahead of the bus.
    state.lapBiomes.push('snow', 'snow');
    const rocketPickupZ = roadZAtDistance(NIGHT_STAGE * LAP_METRES + PICKUP_METRES);
    const props = [...HAZARDS, 'ramp', 'boost', 'repair'];
    let playing = false, nextAudio = 0;

    function sample(elapsedMs) {
      const time = state.time = clamp(elapsedMs / 1000, 0, BENCHMARK_SECONDS);
      const index = state.benchmarkStage = Math.min(BENCHMARK_STAGES.length - 1, Math.floor(time / STAGE_SECONDS));
      const local = time - index * STAGE_SECONDS;
      state.speed = LAP_METRES / STAGE_SECONDS * 3.6;
      let metres = state.speed * local / 3.6;
      state.rocketRemaining = state.rocketGrace = 0;
      if (index === NIGHT_STAGE) {
        metres = 0;
        for (let i = 1; i < nightSpeeds.length; i++) {
          const [start, from] = nightSpeeds[i - 1], [end, to] = nightSpeeds[i];
          const dt = Math.min(end, local) - start;
          state.speed = from + (to - from) * dt / (end - start);
          metres += (from + state.speed) * .5 * dt / 3.6;
          if (local <= end) break;
        }
        if (local >= IGNITION_SECONDS && local < CUTOFF_SECONDS) {
          state.rocketRemaining = clamp(ROCKET_METRES - (metres - PICKUP_METRES), 0, ROCKET_METRES);
        }
        if (local >= CUTOFF_SECONDS) state.rocketGrace = Math.max(0, ROCKET_GRACE_SECONDS - (local - CUTOFF_SECONDS));
      }
      state.lap = index + 1;
      state.lapProgress = metres / LAP_METRES;
      state.distance = index * LAP_METRES + metres;
      state.score = Math.floor(state.distance);
      state.roadZ = roadZAtDistance(state.distance);
      state.worldHeading = Math.atan(roadSlope(state.roadZ));
      updateWheelContact(state);
      updateTransmission(state);

      // Scripted traffic stays on the two outer lanes; the night rocket is in
      // the centre. Keep the usual draw distance and sample by absolute position.
      state.objects.length = 0;
      const first = Math.max(1, Math.ceil((state.roadZ - 20) / 54));
      for (let wave = first; wave * 54 < state.roadZ + 210; wave++) {
        state.objects.push({id: wave, type: props[wave % props.length], lane: wave % 2 ? 1 : -1, z: wave * 54 - state.roadZ});
      }
      const pickupZ = rocketPickupZ - state.roadZ;
      if (pickupZ > 0 && pickupZ < 210) state.objects.push({id: -1, type: 'rocket', lane: 0, z: pickupZ});
      if (playing) {
        audio.setRocket(state.rocketRemaining > 0);
        if (time >= nextAudio) {
          audio.update(state);
          nextAudio = time + .09;
        }
      }
      return state;
    }
    sample(0);
    return {
      state, sample,
      setPlaying(active) {
        if (playing === active) return;
        playing = active;
        audio.setRocket(active && state.rocketRemaining > 0);
        if (active) audio.update(state);
        audio.setDriving(active);
      }
    };
  }

  function create({ onUpdate = () => {}, onEvent = () => {}, onFinish = () => {} } = {}) {
    const state = startingState();
    const audio = makeSound();
    let frameId = 0;
    let previousTime;
    let wave = 0;
    let nextWave = 0;
    let nextRamp = 0;
    let nextRocket = 0;
    let objectId = 0;
    let bonus = 0;
    let nextAudio = 0;
    let steeringInput = 0;
    let slideDirection = 1;
    let phaseTime = 0;
    let stopSpeed = 0;
    let stopRpm = 0;

    function emit(type, message, points = 0) {
      bonus += points;
      state.score = Math.floor(state.distance) + bonus;
      if (type !== 'dodge' && type !== 'rocket') audio.effect(type);
      onEvent({ type, message, points }, state);
    }

    function addObject(lane, z, type) {
      state.objects.push({ id: ++objectId, lane, z, type, passed: false });
    }

    function fillRoad() {
      while (nextWave - state.roadZ < 210) {
        const z = nextWave - state.roadZ;
        // The opening offers one easy dodge, then a visible reward for changing lanes.
        if (wave === 0) {
          addObject(0, z, 'cone');
          addObject(-1, z, 'boost');
        } else if (wave === 1) {
          addObject(-1, z, 'oil');
        } else if (wave === 2) {
          addObject(1, z, 'pothole');
          addObject(0, z, 'repair');
        } else {
          const safe = choose(LANES);
          const others = LANES.filter(lane => lane !== safe);
          const lane = choose(others);
          addObject(lane, z, choose(HAZARDS));
          const doubleChance = Math.min(0.72, 0.18 + nextWave / 5200);
          if (Math.random() < doubleChance) addObject(others.find(other => other !== lane), z, choose(HAZARDS));
          if (wave % 4 === 2) addObject(safe, z, 'repair');
          else if (wave % 3 === 0) addObject(safe, z, 'boost');
          else if (nextWave >= nextRocket) {
            addObject(safe, z, 'rocket');
            nextRocket = nextWave + 900 + Math.random() * 500;
          }
        }
        const waveZ = nextWave;
        nextWave += Math.max(38, 59 - nextWave / 360) + Math.random() * 12;
        // Ramps have their own distance schedule. Move a candidate clear of
        // either neighbouring wave and let it sit anywhere across the lanes.
        if (nextRamp <= nextWave - RAMP_CLEARANCE) {
          const rampZ = Math.max(nextRamp, waveZ + RAMP_CLEARANCE);
          addObject(Math.random() * 2 - 1, rampZ - state.roadZ, 'ramp');
          nextRamp = rampZ + 115 + Math.random() * 60;
        }
        wave++;
      }
    }

    function takeOff() {
      const entrySpeed = state.speed;
      const momentum = clamp((entrySpeed - 30) / 115, 0, 1);
      state.jump = {
        entrySpeed, long: entrySpeed >= LONG_JUMP_SPEED, progress: 0, rate: 1 / (0.60 + 0.68 * momentum),
        peak: 1.75 + 2.9 * momentum, height: RAMP.lipHeight * 0.5,
        spinDirection: 0, spinElapsed: 0, spinAngle: 0
      };
      state.speed = Math.min(ROCKET_SPEED, state.speed + RAMP_KICK_KMH);
      updateWheelContact(state);
      emit('jump', state.jump.long ? 'Grand saut !' : 'Saut de tremplin !', 100);
    }

    function advanceJump(dt) {
      const jump = state.jump;
      if (!jump) return;
      const p = jump.progress = Math.min(1, jump.progress + dt * jump.rate);
      jump.height = (RAMP.lipHeight * 0.5 + 4 * jump.peak * p) * (1 - p);
      if (jump.spinDirection) {
        jump.spinElapsed += dt;
        const t = Math.min(1, jump.spinElapsed / jump.spinDuration);
        jump.spinAngle = jump.spinDirection * 2 * Math.PI * t * t * (3 - 2 * t);
      }
      if (p === 1) state.jump = null;
    }

    function encounter(type) {
      if (type === 'rocket') {
        state.rocketRemaining = ROCKET_METRES;
        state.rocketGrace = 0;
        audio.setRocket(true);
        emit(type, 'Cœurs protégés sur ' + ROCKET_METRES + ' m, puis encore ' + ROCKET_GRACE_SECONDS + ' s');
        return;
      }
      if (type === 'repair') {
        state.health = Math.min(3, state.health + 1);
        state.flat = false;
        state.slip = 0;
        emit(type, 'Réparation', 70);
        return;
      }
      if (type === 'boost') {
        state.boost = 4.2;
        emit(type, 'Turbo', 100);
        return;
      }
      if (type === 'oil') {
        state.slip = 1.6;
        slideDirection = Math.random() < 0.5 ? -1 : 1;
        state.speed *= 0.8;
        emit(type, 'Flaque d’eau');
        return;
      }
      if (type === 'cone') {
        state.speed *= 0.75;
        emit(type, 'Cône renversé · Bus ralenti');
        return;
      }
      if (state.rocketRemaining > 0 || state.rocketGrace > 0) return;
      state.health = Math.max(0, state.health - 1);
      state.boost = 0;
      if (type === 'pothole') state.flat = true;
      else state.hit = 0.65;
      state.speed = Math.max(28, state.speed * (type === 'barrier' ? 0.52 : 0.68));
      const message = type === 'pothole' ? 'Nid-de-poule · −1 cœur' : 'Barrière · −1 cœur';
      emit(type, message);
      if (state.health === 0) beginStop();
    }

    function advanceClock(dt) {
      state.time += dt;
      state.hit = Math.max(0, state.hit - dt);
      for (let i = state.impacts.length - 1; i >= 0; i--) {
        const impact = state.impacts[i];
        if (state.time >= impact.start + impact.duration) state.impacts.splice(i, 1);
      }
    }

    // Project the rotated bus onto the road's lateral axis so its corners
    // stay inside the two shoulders even on a bend.
    function limitToRoadside(x, roadAngle) {
      const angle = state.worldHeading - roadAngle;
      const halfSpan = BUS_HALF_WIDTH * Math.abs(Math.cos(angle)) + BUS_HALF_LENGTH * Math.abs(Math.sin(angle));
      const limit = DRIVABLE_HALF_WIDTH - (halfSpan + 0.16) / Math.cos(roadAngle);
      const offset = x - roadX(state.roadZ);
      state.laneX = clamp(offset, -limit, limit) / LANE_WIDTH;
      return Math.abs(offset) > limit;
    }

    // During a cinematic the scenery moves, but only player-driven metres count.
    function rollAlongRoad(path, dt) {
      if (path <= 0) return;
      const travel = path * Math.cos(state.worldHeading);
      const x = roadX(state.roadZ) + state.laneX * LANE_WIDTH + path * Math.sin(state.worldHeading);
      state.roadZ += travel;
      const roadAngle = Math.atan(roadSlope(state.roadZ));
      state.heading *= Math.exp(-2 * dt);
      state.worldHeading = roadAngle + state.heading;
      limitToRoadside(x, roadAngle);
      updateWheelContact(state);
      for (const object of state.objects) object.z -= travel;
    }

    function advanceIntro(dt) {
      const previousSpeed = state.speed;
      advanceClock(dt);
      phaseTime += dt;
      state.introProgress = Math.min(1, phaseTime / INTRO_SECONDS);
      const t = clamp((phaseTime - LAUNCH_WAIT) / (INTRO_SECONDS - LAUNCH_WAIT), 0, 1);
      state.speed = LAUNCH_SPEED * t * t * (3 - 2 * t);
      state.gear = Math.min(3, 1 + Math.floor(state.speed / 21));
      state.rpm = Math.round(850 + state.speed * 28);
      rollAlongRoad((previousSpeed + state.speed) * .5 * dt / 3.6, dt);
      if (state.introProgress === 1) state.phase = 'driving';
      if (state.time >= nextAudio) {
        nextAudio = state.time + 0.09;
        audio.update(state);
      }
    }

    function beginStop() {
      if (state.phase === 'stopping') return;
      state.phase = 'stopping';
      state.rocketRemaining = 0;
      state.rocketGrace = 0;
      audio.setRocket(false);
      phaseTime = 0;
      stopSpeed = state.speed;
      stopRpm = state.rpm;
      steeringInput = state.steer = state.slip = state.boost = 0;
      state.braking = true;
      audio.shutdown(0);
    }

    function advanceStop(dt) {
      const previous = state.stopProgress;
      phaseTime += dt;
      advanceClock(dt);
      advanceJump(dt);
      state.introProgress = Math.min(1, state.introProgress + dt / INTRO_SECONDS);
      const progress = state.stopProgress = Math.min(1, phaseTime / BRAKE_SECONDS);
      if (previous < 1) {
        const rest = 1 - progress;
        state.speed = stopSpeed * rest * rest;
        state.rpm = Math.round(stopRpm * rest);
        state.gear = Math.min(6, 1 + Math.floor(state.speed / 21));
        // Integral of the braking curve. The stopping distance is frame-rate independent.
        const path = stopSpeed * BRAKE_SECONDS / 10.8 * ((1 - previous) ** 3 - rest ** 3);
        rollAlongRoad(path, dt);
        audio.shutdown(progress);
        if (progress === 1) audio.airBrake();
      }
    }

    function advance(dt) {
      advanceClock(dt);
      state.boost = Math.max(0, state.boost - dt);
      state.slip = Math.max(0, state.slip - dt);
      state.rocketGrace = Math.max(0, state.rocketGrace - dt);

      const powered = state.rocketRemaining > 0;
      const previousSpeed = state.speed;
      if (powered) {
        const target = state.braking ? 34 : ROCKET_SPEED;
        const change = (state.braking ? ROCKET_BRAKING : ROCKET_ACCELERATION) * dt;
        state.speed += clamp(target - state.speed, -change, change);
      } else if (state.jump) {
        state.speed = Math.max(state.jump.entrySpeed, state.speed - RAMP_KICK_KMH * dt / RAMP_KICK_SECONDS);
      } else {
        const cruise = Math.min(114, 78 + state.distance * 0.012);
        let target = (state.flat ? cruise * 0.70 : cruise) + (state.boost ? 39 : 0);
        if (state.braking) target = Math.min(34, target);
        target *= 1 - state.shoulderContact * (1 - SHOULDER_SPEED_FACTOR);
        // Extra drag above the normal turbo and ramp speeds softens rocket burnout.
        const deceleration = 62 + 1.5 * Math.max(0, state.speed - 165);
        const rate = state.speed > target ? deceleration : state.boost ? 36 : 13;
        state.speed += clamp(target - state.speed, -rate * dt, rate * dt);
      }
      updateTransmission(state);

      // Bicycle steering in world coordinates. Releasing the wheel straightens
      // the front tires; the driver keeps the new heading until countersteering.
      const grip = state.slip ? 0.55 : state.flat ? 0.74 : 1;
      // Powered steps use their entry speed so the last step can end at the exact metre.
      const path = (powered ? previousSpeed : state.speed) * dt / 3.6;
      const response = steeringInput ? 9 : 15;
      const oldSteer = state.steer;
      state.steer += (steeringInput - oldSteer) * (1 - Math.exp(-response * dt));
      if (!steeringInput && Math.abs(state.steer) < 0.0001) state.steer = 0;
      const wheelAngle = (oldSteer + state.steer) * 0.5 * 0.28 / (1 + state.speed / 72);
      const slipYaw = state.slip ? slideDirection * 2.1 * Math.sin(state.slip * 8.3) * Math.sin(Math.PI * state.slip / 1.6) : 0;
      const oldHeading = state.worldHeading;
      const yaw = path / WHEELBASE * Math.tan(wheelAngle) * grip + slipYaw * dt;
      const roadAngle = Math.atan(roadSlope(state.roadZ));
      state.worldHeading = clamp(oldHeading + yaw, roadAngle - MAX_HEADING_FROM_ROAD, roadAngle + MAX_HEADING_FROM_ROAD);

      const midHeading = (oldHeading + state.worldHeading) * 0.5;
      const travel = path * Math.cos(midHeading);
      const x = roadX(state.roadZ) + state.laneX * LANE_WIDTH + path * Math.sin(midHeading);
      state.roadZ += travel;
      state.distance += path;
      if (powered) {
        state.rocketRemaining = Math.max(0, state.rocketRemaining - path);
        if (state.rocketRemaining < 1e-8) {
          state.rocketRemaining = 0;
          state.rocketGrace = ROCKET_GRACE_SECONDS;
          if (state.jump) state.jump.entrySpeed = state.speed;
          audio.setRocket(false);
        }
      }
      const newRoadAngle = Math.atan(roadSlope(state.roadZ));
      if (limitToRoadside(x, newRoadAngle)) {
        state.worldHeading += (newRoadAngle - state.worldHeading) * (1 - Math.exp(-7 * dt));
      }
      state.heading = state.worldHeading - newRoadAngle;
      advanceJump(dt);
      updateWheelContact(state);
      const progress = routeProgressAt(state.roadZ);
      const lap = 1 + Math.floor(progress);
      state.lapProgress = progress % 1;
      if (lap > state.lap) {
        state.lap = lap;
        const scenery = SCENERY_NAMES[sceneryForLap(lap, state.lapBiomes)];
        emit('lap', 'Tour ' + lap + ' · ' + scenery + ' · ' + LAP_PERIODS[periodForLap(lap)], 250);
      }

      const busX = roadX(state.roadZ) + state.laneX * LANE_WIDTH;
      let dodgePoints = 0;
      for (const object of state.objects) {
        object.z -= travel;
        if (object.passed || object.z > 4.5 || state.health === 0) continue;
        // Test the road object's rectangle against the rotated bus on all four axes.
        // This lets a cone clear a corner even when the bus straddles a line.
        const objectZ = state.roadZ + object.z;
        const objectAngle = Math.atan(roadSlope(objectZ));
        const objectX = roadX(objectZ) + object.lane * LANE_WIDTH;
        const offsetX = objectX - busX;
        const cosRoad = Math.cos(objectAngle), sinRoad = Math.sin(objectAngle);
        const dx = offsetX * cosRoad - object.z * sinRoad;
        const dz = offsetX * sinRoad + object.z * cosRoad;
        if (object.type === 'ramp') {
          // The front wheels reach the lip as the bus centre crosses the ramp centre.
          if (dz <= 0) {
            object.passed = true;
            if (!state.jump && dz >= -RAMP.halfLength && Math.abs(dx) <= RAMP.halfWidth + RAMP.wheelMargin) takeOff();
          }
          continue;
        }
        const relativeHeading = state.worldHeading - objectAngle;
        const sin = Math.sin(relativeHeading), cos = Math.cos(relativeHeading), absSin = Math.abs(sin);
        const [width, length] = FOOTPRINTS[object.type];
        const touched = Math.abs(dx) <= width + BUS_HALF_WIDTH * cos + BUS_HALF_LENGTH * absSin
          && Math.abs(dz) <= length + BUS_HALF_WIDTH * absSin + BUS_HALF_LENGTH * cos
          && Math.abs(dx * cos - dz * sin) <= BUS_HALF_WIDTH + width * cos + length * absSin
          && Math.abs(dx * sin + dz * cos) <= BUS_HALF_LENGTH + width * absSin + length * cos;
        if (touched && !state.jump) {
          object.passed = true;
          object.collected = object.type !== 'pothole';
          const duration = IMPACT_DURATIONS[object.type];
          if (duration) {
            const side = Math.sign(object.lane) || Math.sign(dx) || (object.id % 2 ? 1 : -1);
            state.impacts.push({
              type: object.type, x: objectX, z: objectZ, yaw: objectAngle, side,
              speed: state.speed / 3.6, start: state.time, duration
            });
          }
          encounter(object.type);
        } else if (object.z < -4.5) {
          object.passed = true;
          if (!isPickup(object.type)) dodgePoints += 10;
        }
      }
      if (dodgePoints) emit('dodge', 'Esquive', dodgePoints);
      // Compact in place. The same array is shared with the renderer during a run.
      let count = 0;
      for (const object of state.objects) {
        if (object.z > -14 && !object.collected) state.objects[count++] = object;
      }
      state.objects.length = count;
      fillRoad();
      state.score = Math.floor(state.distance) + bonus;
      if (state.phase === 'driving' && state.time >= nextAudio) {
        nextAudio = state.time + 0.09;
        audio.update(state);
      }
    }

    function tick(timestamp) {
      if (state.status !== 'running') return;
      let remaining = previousTime === undefined ? 0 : Math.max(0, (timestamp - previousTime) / 1000);
      previousTime = timestamp;
      if (state.phase === 'starting') {
        const step = Math.min(remaining, INTRO_SECONDS - phaseTime);
        advanceIntro(step);
        remaining -= step;
      }
      // Bound physics catch-up and substep collisions, while keeping the shots on real time.
      if (state.phase === 'driving') remaining = Math.min(remaining, .20);
      while (remaining > 0.00001 && state.phase === 'driving') {
        // Limit the distance between contact checks to one metre, even at full thrust.
        const secondsPerMetre = 3.6 / Math.max(1, state.speed);
        let step = Math.min(remaining, 1 / 40, secondsPerMetre);
        if (state.rocketRemaining > 0) step = Math.min(step, state.rocketRemaining * secondsPerMetre);
        advance(step);
        remaining -= step;
      }
      if (state.phase === 'stopping') {
        advanceStop(Math.min(remaining, OUTRO_SECONDS - phaseTime));
        if (phaseTime >= OUTRO_SECONDS) {
          state.status = 'finished';
          audio.setDriving(false);
          onUpdate(state);
          onFinish(state);
          return;
        }
      }
      onUpdate(state);
      if (state.status === 'running') frameId = requestAnimationFrame(tick);
    }

    function beginFrames() {
      previousTime = undefined;
      state.status = 'running';
      audio.setRocket(state.rocketRemaining > 0);
      if (state.phase !== 'stopping') audio.update(state);
      audio.setDriving(true);
      onUpdate(state);
      frameId = requestAnimationFrame(tick);
    }

    return {
      state,
      createBenchmark: () => createBenchmark(audio),
      start() {
        cancelAnimationFrame(frameId);
        Object.assign(state, startingState());
        audio.setRocket(false);
        wave = objectId = bonus = nextAudio = steeringInput = phaseTime = 0;
        if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
          state.phase = 'starting';
          state.introProgress = state.speed = 0;
          state.gear = 1;
          state.rpm = 850;
          // Start just behind the line so the first obstacle stays far ahead at handover.
          state.roadZ = -LAUNCH_SPEED * (INTRO_SECONDS - LAUNCH_WAIT) / 7.2;
          state.worldHeading = Math.atan(roadSlope(state.roadZ));
          updateWheelContact(state);
        }
        nextWave = 55;
        nextRamp = 77 + Math.random() * 22;
        nextRocket = 450 + Math.random() * 300;
        fillRoad();
        beginFrames();
        audio.horn();
      },
      pause() {
        if (state.status !== 'running') return;
        state.status = 'paused';
        steeringInput = 0;
        state.braking = false;
        cancelAnimationFrame(frameId);
        audio.setDriving(false);
      },
      resume() {
        if (state.status === 'paused') beginFrames();
      },
      endRun() {
        if (state.status !== 'running' && state.status !== 'paused') return;
        beginStop();
        if (state.status === 'paused') beginFrames();
      },
      steer(value) {
        const input = state.status === 'running' && state.phase !== 'stopping' && Number.isFinite(value) ? clamp(value, -1, 1) : 0;
        const previousDirection = Math.abs(steeringInput) >= 0.12 ? Math.sign(steeringInput) : 0;
        steeringInput = input;
        const direction = Math.abs(input) >= 0.12 ? Math.sign(input) : 0;
        const jump = state.jump;
        if (jump?.long && !jump.spinDirection && direction && direction !== previousDirection) {
          jump.spinDirection = direction;
          // Speed up late spins and allow a brief finish just before touchdown.
          const timeLeft = (1 - jump.progress) / jump.rate;
          jump.spinDuration = clamp(timeLeft, 0.28, 0.50);
          jump.rate = Math.min(jump.rate, (1 - jump.progress) / jump.spinDuration);
          emit('spin', '360° !', 50);
        }
      },
      brake(pressed) {
        if (state.phase !== 'stopping') state.braking = state.status === 'running' && Boolean(pressed);
      },
      setSound: audio.setEnabled,
      setVolume: audio.setVolume,
      stop() {
        cancelAnimationFrame(frameId);
        state.status = 'stopped';
        state.jump = null;
        state.rocketRemaining = 0;
        state.rocketGrace = 0;
        audio.setRocket(false);
        steeringInput = 0;
        state.braking = false;
        audio.setDriving(false);
      }
    };
  }

  window.BusDrive = { create, roadX, roadSlope, periodForLap, sceneryForLap, SCENERY_NAMES,
    lapAtRoadZ, roadZForLap, LANE_WIDTH, ROAD_HALF_WIDTH, DRIVABLE_HALF_WIDTH, RAMP, ROCKET_METRES,
    BENCHMARK_STAGES, BENCHMARK_SECONDS };
})();
