const test = require('node:test');
const assert = require('node:assert/strict');
const gameRuntime = require('./game-runtime.cjs');

function run(seed = 27) {
  const runtime = gameRuntime();
  runtime.Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  let frame, time = 0;
  runtime.window.matchMedia = () => ({matches:true});
  runtime.requestAnimationFrame = callback => { frame = callback; return 1; };
  runtime.cancelAnimationFrame = () => {};
  runtime.clearTimeout = clearTimeout;
  const events = [];
  const game = runtime.window.BusDrive.create({onEvent: e => events.push(e)});
  game.start();
  frame(0);
  return {game, state:game.state, events, step(ms = 1000 / 60) { frame(time += ms); }};
}

function launch(speed, steering = 0) {
  const race = run();
  const {state, game, step} = race;
  state.objects.splice(0, state.objects.length, {id:-1, type:'ramp', lane:0, z:5, passed:false});
  state.speed = speed;
  game.steer(steering);
  for (let i = 0; i < 90 && !state.jump; i++) step();
  assert.ok(state.jump, 'the wheels meet the ramp');
  return race;
}

function land({state, step}) {
  const takeoff = state.distance;
  let peak = state.jump.height;
  for (let i = 0; i < 360 && state.jump; i++) {
    peak = Math.max(peak, state.jump.height);
    step();
  }
  assert.equal(state.jump, null);
  return {length:state.distance - takeoff, peak};
}

test('ramps regularly occupy different positions between ordinary obstacle waves', () => {
  function course(seed) {
    const {state, step} = run(seed);
    const objects = new Map();
    for (let tick = 0; state.roadZ < 2200 && tick < 2000; tick++) {
      for (const o of state.objects) {
        if (!objects.has(o.id)) objects.set(o.id, {type:o.type, z:state.roadZ + o.z, lane:o.lane});
        o.passed = true;
      }
      step(150);
    }
    assert.ok(state.roadZ >= 2200);
    const ramps = [...objects.values()].filter(o => o.type === 'ramp' && o.z < 2200);
    const waves = [...objects.values()].filter(o => o.type !== 'ramp').map(o => o.z);
    assert.ok(ramps.length >= 8);
    assert.ok(new Set(ramps.map(r => r.lane)).size > 1);
    for (const [i, ramp] of ramps.entries()) {
      assert.ok(waves.some(z => z < ramp.z) && waves.some(z => z > ramp.z));
      assert.ok(waves.every(z => Math.abs(z - ramp.z) > 7), 'a ramp has its own stretch of road');
      assert.ok(ramp.z - (ramps[i - 1]?.z ?? 0) < 360, 'no long droughts between ramps');
    }
    return ramps.map(r => r.z);
  }
  assert.notDeepEqual(course(143), course(26));
});

test('takeoff pays 100 points once and speed extends the flight', () => {
  const slow = launch(36), fast = launch(112);
  assert.equal(slow.state.jump.long, false);
  assert.equal(fast.state.jump.long, true);
  slow.game.steer(1);
  const shortFlight = land(slow), longFlight = land(fast);
  assert.ok(longFlight.length > shortFlight.length * 2);
  assert.ok(longFlight.peak > shortFlight.peak);
  for (const {state, events} of [slow, fast]) {
    assert.deepEqual(events.map(e => [e.type, e.points]), [['jump', 100]]);
    assert.equal(state.score - Math.floor(state.distance), 100);
  }
});

test('a cruising bus gets a brief forward kick and lands within one second', () => {
  const race = launch(78);
  const {state, step} = race;
  const startTime = state.time, startDistance = state.distance, launchSpeed = state.speed;
  assert.ok(launchSpeed > 88 && launchSpeed < 92);
  for (let i = 0; i < 6; i++) step();
  assert.ok(state.distance - startDistance > 2.35, 'the impulse moves the bus forward');
  assert.ok(state.speed < launchSpeed && state.speed > 82);
  for (let i = 0; i < 18; i++) step();
  assert.ok(Math.abs(state.speed - 78) < 1, 'cruise speed is restored while airborne');
  land(race);
  assert.ok(state.time - startTime < 1);
  const length = state.distance - startDistance;
  assert.ok(length > 16 && length < 24);
});

test('steering anew during a long jump spins once in the requested direction', () => {
  for (const side of [-1, 1]) {
    const race = launch(95, side);
    const {game, state, step, events} = race;
    step();
    assert.equal(state.jump.spinDirection, 0, 'steering into the ramp is not a trick');
    if (side === 1) {
      for (let i = 0; state.jump.progress < .97 && i < 300; i++) step();
      assert.ok(state.jump.progress >= .97, 'a late input still has time for the full trick');
    }
    const trickTime = state.time;
    game.steer(0);
    game.steer(side);
    step();
    assert.equal(state.jump.spinDirection, side);
    game.steer(-side);
    let maxAngle = 0;
    while (state.jump && state.time < 8) {
      maxAngle = Math.max(maxAngle, state.jump.spinAngle * side);
      step();
    }
    assert.equal(state.jump, null);
    if (side === 1) assert.ok(state.time - trickTime < .35, 'late steering keeps the landing snappy');
    assert.ok(maxAngle > Math.PI * 1.95, 'the bus makes a complete turn');
    assert.deepEqual(events.map(e => [e.type, e.points]), [['jump', 100], ['spin', 50]]);
    assert.equal(state.score - Math.floor(state.distance), 150);
  }
});

test('the bus clears ground obstacles in flight and can hit them again after landing', () => {
  const race = launch(95);
  const {state, step} = race;
  for (let i = 0; state.jump.progress < .3 && i < 90; i++) step();
  const obstacle = () => ({id:-2, type:'barrier', lane:state.laneX, z:2, passed:false});
  state.objects.push(obstacle());
  land(race);
  assert.equal(state.health, 3);
  state.objects.push(obstacle());
  step();
  assert.equal(state.health, 2);
});

test('passing beside a ramp awards neither takeoff nor dodge points', () => {
  const {state, step, events} = run();
  state.objects.splice(0, state.objects.length, {id:-1, type:'ramp', lane:1, z:4, passed:false});
  for (let i = 0; i < 75; i++) step();
  assert.deepEqual(events, []);
  assert.equal(state.jump, null);
  assert.equal(state.score, Math.floor(state.distance));
});

test('a paused flight freezes and a new run starts on the ground', () => {
  const {state, game, step} = launch(95);
  step();
  game.pause();
  const progress = state.jump.progress;
  step(5000);
  game.resume();
  step();
  assert.equal(state.jump.progress, progress);
  step();
  assert.ok(state.jump.progress > progress);
  game.start();
  assert.equal(state.jump, null);
  assert.equal(state.score, 0);
});
