(() => {
  'use strict';

  const LAP_METRES = 1000;
  const LANES = [-1, 0, 1];
  const LANE_WIDTH = 3.65;
  const BUS_HALF_WIDTH = 1.16;
  const BUS_HALF_LENGTH = 2.54;
  const WHEELBASE = 3.09;
  const MAX_HEADING_FROM_ROAD = 0.54;
  const STEERING_LIMIT = 1.5 - (BUS_HALF_WIDTH + 0.08) / LANE_WIDTH;
  // Half-extents in metres, matching the visible road objects.
  const FOOTPRINTS = {
    cone: [0.46, 0.44], barrier: [1.12, 0.35], oil: [1.12, 0.97],
    pothole: [1.12, 0.97], boost: [0.57, 0.20], repair: [0.56, 0.32]
  };
  const HAZARDS = ['cone', 'barrier', 'oil', 'pothole'];
  const IMPACT_DURATIONS = { cone: 0.95, barrier: 0.76, oil: 0.68, repair: 0.85, boost: 0.50 };
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const choose = items => items[Math.floor(Math.random() * items.length)];
  const isPickup = type => type === 'repair' || type === 'boost';
  const roadX = z => 11 * Math.sin(z * 0.012) + 8 * Math.sin(z * 0.022 + 0.7);
  const roadSlope = z => 0.132 * Math.cos(z * 0.012) + 0.176 * Math.cos(z * 0.022 + 0.7);

  function makeSound() {
    const engineUrl = 'assets/bus-engine.wav';
    const fullScaleGain = 0.45;
    let masterGain = fullScaleGain * 0.6;
    let ctx, master, motor, engineGain, engineBuffer, media;
    let loading = false;
    let stopTimer;
    let pitch = 1;
    let volume = 0.65;
    let previousSampleTime = 0;
    let previousSpeed = 0;
    let enabled = true;
    let driving = false;

    function syncVolume() {
      if (master) master.gain.setTargetAtTime(enabled ? masterGain : 0, ctx.currentTime, 0.018);
      if (media) {
        media.volume = volume * masterGain;
        media.muted = !enabled || !driving || masterGain === 0;
      }
    }

    function syncPlayback() {
      const audible = enabled && driving;
      clearTimeout(stopTimer);
      syncVolume();
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
      setVolume(value) {
        if (!Number.isFinite(value)) return;
        masterGain = fullScaleGain * clamp(value, 0, 1);
        syncVolume();
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
        const targetVolume = 0.65 + load * 0.15 + boost * 0.13 - (state.braking ? 0.15 : 0);
        const smoothing = dt > 0 ? 1 - Math.exp(-dt / 0.10) : 1;
        pitch += (targetPitch - pitch) * smoothing;
        volume += (targetVolume - volume) * smoothing;
        if (!enabled || !driving) return;
        if (motor) {
          motor.playbackRate.setTargetAtTime(pitch, ctx.currentTime, 0.05);
          engineGain.gain.setTargetAtTime(volume, ctx.currentTime, 0.06);
        } else if (media) {
          media.playbackRate = pitch;
          media.volume = volume * masterGain;
        }
      },
      effect(type) {
        if (type === 'boost' || type === 'repair' || type === 'lap') {
          const notes = type === 'boost' ? [392, 494, 659] : type === 'repair' ? [523, 659, 784] : [523, 659, 784, 1047];
          notes.forEach((pitch, i) => note(pitch, pitch, 0.22, i * 0.075, 0.105));
        } else if (type === 'oil') {
          note(340, 100, 0.36, 0, 0.07, 'triangle');
        } else if (type === 'finish') {
          [392, 330, 262].forEach((pitch, i) => note(pitch, pitch, 0.27, i * 0.14, 0.085));
        } else {
          note(type === 'pothole' ? 132 : 165, 46, 0.18, 0, 0.22, 'triangle');
        }
      }
    };
  }

  function startingState() {
    return {
      status: 'ready', distance: 0, roadZ: 0, speed: 48, time: 0, laneX: 0,
      worldHeading: Math.atan(roadSlope(0)), heading: 0, steer: 0,
      objects: [], impacts: [], boost: 0, slip: 0, flat: false, hit: 0, score: 0, lap: 1,
      lapProgress: 0, health: 3, gear: 3, rpm: 2200, braking: false
    };
  }

  function create({ onUpdate = () => {}, onEvent = () => {}, onFinish = () => {} } = {}) {
    const state = startingState();
    const audio = makeSound();
    let frameId = 0;
    let previousTime;
    let wave = 0;
    let nextWave = 0;
    let objectId = 0;
    let bonus = 0;
    let nextAudio = 0;
    let steeringInput = 0;
    let slideDirection = 1;
    let finishAt = 0;

    function emit(type, message) {
      audio.effect(type);
      onEvent({ type, message }, state);
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
        }
        nextWave += Math.max(38, 59 - nextWave / 360) + Math.random() * 12;
        wave++;
      }
    }

    function encounter(type) {
      if (type === 'repair') {
        state.health = Math.min(3, state.health + 1);
        state.flat = false;
        state.slip = 0;
        bonus += 70;
        emit(type, 'Réparation +70');
        return;
      }
      if (type === 'boost') {
        state.boost = 4.2;
        bonus += 100;
        emit(type, 'Turbo +100');
        return;
      }
      if (type === 'oil') {
        state.slip = 1.6;
        slideDirection = Math.random() < 0.5 ? -1 : 1;
        state.speed *= 0.8;
        emit(type, 'Ça glisse !');
        return;
      }
      if (type === 'cone') {
        state.speed *= 0.75;
        emit(type, 'Cône renversé · Bus ralenti');
        return;
      }
      state.health = Math.max(0, state.health - 1);
      state.boost = 0;
      if (type === 'pothole') state.flat = true;
      else state.hit = 0.65;
      state.speed = Math.max(28, state.speed * (type === 'barrier' ? 0.52 : 0.68));
      const message = type === 'pothole' ? 'Pneu crevé !' : 'Choc sur la barrière !';
      emit(type, message);
      if (state.health === 0) {
        finishAt = state.time + (IMPACT_DURATIONS[type] || 0);
        state.braking = false;
        audio.setDriving(false);
      }
    }

    function advanceClock(dt) {
      state.time += dt;
      state.hit = Math.max(0, state.hit - dt);
      for (let i = state.impacts.length - 1; i >= 0; i--) {
        const impact = state.impacts[i];
        if (state.time >= impact.start + impact.duration) state.impacts.splice(i, 1);
      }
    }

    function advance(dt) {
      advanceClock(dt);
      state.boost = Math.max(0, state.boost - dt);
      state.slip = Math.max(0, state.slip - dt);

      const cruise = Math.min(114, 78 + state.distance * 0.012);
      let target = (state.flat ? cruise * 0.70 : cruise) + (state.boost ? 39 : 0);
      if (state.braking) target = Math.min(34, target);
      const rate = state.speed > target ? 62 : state.boost ? 36 : 13;
      state.speed += clamp(target - state.speed, -rate * dt, rate * dt);
      state.gear = Math.min(6, 1 + Math.floor(state.speed / 21));
      state.rpm = Math.round(1500 + state.speed * 89 / (1 + (state.gear - 1) * 0.64));

      // Bicycle steering in world coordinates. Releasing the wheel straightens
      // the front tires; the driver keeps the new heading until countersteering.
      const grip = state.slip ? 0.55 : state.flat ? 0.74 : 1;
      const path = state.speed * dt / 3.6;
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
      const nextX = (x - roadX(state.roadZ)) / LANE_WIDTH;
      state.laneX = clamp(nextX, -STEERING_LIMIT, STEERING_LIMIT);
      const newRoadAngle = Math.atan(roadSlope(state.roadZ));
      if (state.laneX !== nextX) {
        // Shoulder friction slows the bus and gradually straightens the body.
        state.worldHeading += (newRoadAngle - state.worldHeading) * (1 - Math.exp(-7 * dt));
        state.speed = Math.max(28, state.speed - 23 * dt);
      }
      state.heading = state.worldHeading - newRoadAngle;
      const lap = 1 + Math.floor(state.distance / LAP_METRES);
      state.lapProgress = (state.distance % LAP_METRES) / LAP_METRES;
      if (lap > state.lap) {
        state.lap = lap;
        bonus += 250;
        emit('lap', 'Tour ' + lap + ' · +250');
      }

      const busX = roadX(state.roadZ) + state.laneX * LANE_WIDTH;
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
        const relativeHeading = state.worldHeading - objectAngle;
        const sin = Math.sin(relativeHeading), cos = Math.cos(relativeHeading), absSin = Math.abs(sin);
        const [width, length] = FOOTPRINTS[object.type];
        const touched = Math.abs(dx) <= width + BUS_HALF_WIDTH * cos + BUS_HALF_LENGTH * absSin
          && Math.abs(dz) <= length + BUS_HALF_WIDTH * absSin + BUS_HALF_LENGTH * cos
          && Math.abs(dx * cos - dz * sin) <= BUS_HALF_WIDTH + width * cos + length * absSin
          && Math.abs(dx * sin + dz * cos) <= BUS_HALF_LENGTH + width * absSin + length * cos;
        if (touched) {
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
          if (!isPickup(object.type)) bonus += 10;
        }
      }
      // Compact in place. The same array is shared with the renderer during a run.
      let count = 0;
      for (const object of state.objects) {
        if (object.z > -14 && !object.collected) state.objects[count++] = object;
      }
      state.objects.length = count;
      fillRoad();
      state.score = Math.floor(state.distance) + bonus;
      if (state.time >= nextAudio) {
        nextAudio = state.time + 0.09;
        audio.update(state);
      }
    }

    function tick(timestamp) {
      if (state.status !== 'running') return;
      // Bound catch-up after a stall and split the work so narrow obstacles remain hittable.
      let remaining = previousTime === undefined ? 0 : clamp((timestamp - previousTime) / 1000, 0, 0.20);
      previousTime = timestamp;
      while (remaining > 0.00001 && state.health > 0) {
        const step = Math.min(remaining, 1 / 40);
        advance(step);
        remaining -= step;
      }
      if (state.health <= 0) {
        // Hold the final score and the road still while the last barrier falls.
        advanceClock(remaining);
        if (state.time >= finishAt) {
          state.status = 'finished';
          audio.effect('finish');
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
      audio.update(state);
      audio.setDriving(state.health > 0);
      onUpdate(state);
      frameId = requestAnimationFrame(tick);
    }

    return {
      state,
      start() {
        cancelAnimationFrame(frameId);
        Object.assign(state, startingState());
        wave = objectId = bonus = nextAudio = steeringInput = finishAt = 0;
        nextWave = 55;
        fillRoad();
        beginFrames();
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
      steer(value) {
        steeringInput = state.status === 'running' && state.health > 0 && Number.isFinite(value) ? clamp(value, -1, 1) : 0;
      },
      brake(pressed) {
        state.braking = state.status === 'running' && state.health > 0 && Boolean(pressed);
      },
      setSound: audio.setEnabled,
      setVolume: audio.setVolume,
      stop() {
        cancelAnimationFrame(frameId);
        state.status = 'stopped';
        steeringInput = 0;
        state.braking = false;
        audio.setDriving(false);
      }
    };
  }

  window.BusDrive = { create, roadX, roadSlope };
})();
