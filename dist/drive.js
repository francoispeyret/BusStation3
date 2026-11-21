(() => {
  'use strict';

  const LAP_METRES = 1000;
  const LANES = [-1, 0, 1];
  const HAZARDS = ['cone', 'barrier', 'oil', 'pothole'];
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const choose = items => items[Math.floor(Math.random() * items.length)];
  const isPickup = type => type === 'repair' || type === 'boost';

  function makeSound() {
    let ctx, master, motor, engineGain;
    let enabled = true;
    let driving = false;

    function level() {
      if (master) master.gain.setTargetAtTime(enabled ? 0.45 : 0, ctx.currentTime, 0.018);
      if (engineGain) engineGain.gain.setTargetAtTime(driving ? 0.056 : 0, ctx.currentTime, 0.025);
    }

    function unlock() {
      if (!enabled) return;
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      try {
        if (!ctx) {
          ctx = new Audio();
          master = ctx.createGain();
          master.gain.value = 0;
          master.connect(ctx.destination);
          motor = ctx.createOscillator();
          engineGain = ctx.createGain();
          engineGain.gain.value = 0;
          motor.type = 'triangle';
          motor.frequency.value = 48;
          motor.connect(engineGain);
          engineGain.connect(master);
          motor.start();
        }
        if (ctx.state !== 'running') ctx.resume().catch(() => {});
        level();
      } catch {
        // Audio may be unavailable or disallowed while graphics and simulation work.
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
      setEnabled(value) {
        enabled = Boolean(value);
        if (enabled && driving) unlock();
        level();
      },
      setDriving(value) {
        driving = value;
        if (value) unlock();
        level();
      },
      update(state) {
        if (enabled && motor && ctx.state === 'running') {
          const thrum = state.flat ? 3 * Math.sin(12 * state.time) : 0;
          motor.frequency.setTargetAtTime(27 + state.rpm / 57 + thrum, ctx.currentTime, 0.085);
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
      status: 'ready', distance: 0, speed: 48, time: 0, laneX: 0, lane: 0, steer: 0,
      objects: [], boost: 0, slip: 0, flat: false, hit: 0, score: 0, lap: 1,
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
    let steeringPosition = 0;
    let slideDirection = 1;

    function emit(type, message) {
      audio.effect(type);
      onEvent({ type, message }, state);
    }

    function addObject(lane, z, type) {
      state.objects.push({ id: ++objectId, lane, z, type, passed: false });
    }

    function fillRoad() {
      while (nextWave - state.distance < 210) {
        const z = nextWave - state.distance;
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
      state.health = Math.max(0, state.health - 1);
      state.boost = 0;
      state.hit = 0.65;
      if (type === 'pothole') state.flat = true;
      state.speed = Math.max(28, state.speed * (type === 'barrier' ? 0.52 : 0.68));
      const message = type === 'pothole' ? 'Pneu crevé !' : type === 'cone' ? 'Cône percuté !' : 'Choc sur la barrière !';
      emit(type, message);
    }

    function advance(dt) {
      state.time += dt;
      state.boost = Math.max(0, state.boost - dt);
      state.slip = Math.max(0, state.slip - dt);
      state.hit = Math.max(0, state.hit - dt);

      const cruise = Math.min(114, 78 + state.distance * 0.012);
      let target = (state.flat ? cruise * 0.70 : cruise) + (state.boost ? 39 : 0);
      if (state.braking) target = Math.min(34, target);
      const rate = state.speed > target ? 62 : state.boost ? 36 : 13;
      state.speed += clamp(target - state.speed, -rate * dt, rate * dt);
      state.gear = Math.min(6, 1 + Math.floor(state.speed / 21));
      state.rpm = Math.round(1500 + state.speed * 89 / (1 + (state.gear - 1) * 0.64));

      const oldX = state.laneX;
      const response = state.slip > 0 ? 4.8 : state.flat ? 6.9 : 10.5;
      steeringPosition += (state.lane - steeringPosition) * (1 - Math.exp(-response * dt));
      const drift = state.slip ? slideDirection * Math.sin(state.slip * 11) * Math.sin(Math.PI * state.slip / 1.6) * 0.23 : 0;
      state.laneX = clamp(steeringPosition + drift, -1, 1);
      state.steer = clamp((state.laneX - oldX) / dt / 5, -1, 1);

      const travel = state.speed * dt / 3.6;
      state.distance += travel;
      const lap = 1 + Math.floor(state.distance / LAP_METRES);
      state.lapProgress = (state.distance % LAP_METRES) / LAP_METRES;
      if (lap > state.lap) {
        state.lap = lap;
        bonus += 250;
        emit('lap', 'Tour ' + lap + ' · +250');
      }

      for (const object of state.objects) {
        object.z -= travel;
        if (object.passed || object.z > 2.85) continue;
        // Check the full contact interval so a late swerve can still clip a cone.
        const touched = object.z >= -1.8 && Math.abs(state.laneX - object.lane) < (isPickup(object.type) ? 0.49 : 0.56);
        if (touched) {
          object.passed = true;
          object.collected = true;
          encounter(object.type);
        } else if (object.z < -1.8) {
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
        state.status = 'finished';
        state.braking = false;
        audio.setDriving(false);
        audio.effect('finish');
        onUpdate(state);
        onFinish(state);
        return;
      }
      onUpdate(state);
      if (state.status === 'running') frameId = requestAnimationFrame(tick);
    }

    function beginFrames() {
      previousTime = undefined;
      state.status = 'running';
      audio.setDriving(true);
      onUpdate(state);
      frameId = requestAnimationFrame(tick);
    }

    return {
      state,
      start() {
        cancelAnimationFrame(frameId);
        Object.assign(state, startingState());
        wave = objectId = bonus = nextAudio = steeringPosition = 0;
        nextWave = 55;
        fillRoad();
        beginFrames();
      },
      pause() {
        if (state.status !== 'running') return;
        state.status = 'paused';
        state.braking = false;
        cancelAnimationFrame(frameId);
        audio.setDriving(false);
      },
      resume() {
        if (state.status === 'paused') beginFrames();
      },
      move(direction) {
        if (state.status === 'running' && (direction === -1 || direction === 1)) {
          state.lane = clamp(state.lane + direction, -1, 1);
        }
      },
      brake(pressed) {
        state.braking = state.status === 'running' && Boolean(pressed);
      },
      setSound: audio.setEnabled,
      stop() {
        cancelAnimationFrame(frameId);
        state.status = 'stopped';
        state.braking = false;
        audio.setDriving(false);
      }
    };
  }

  window.BusDrive = { create };
})();
