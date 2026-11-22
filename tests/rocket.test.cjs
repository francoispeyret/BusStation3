const test = require('node:test');
const assert = require('node:assert/strict');
const startRace = require('./start-race.cjs');

function putOnRoad({state}, type, z = 1) {
  state.objects.splice(0, state.objects.length, {id:-1, type, lane:state.laneX, z, passed:false});
}

function collectRocket() {
  const race = startRace();
  race.state.speed = 78;
  putOnRoad(race, 'rocket');
  race.step();
  assert.equal(race.events.at(-1).type, 'rocket');
  assert.equal(race.state.rocketRemaining, 400);
  return race;
}

test('rocket thrust builds to 300 km/h in about four seconds and expires after 400 metres', () => {
  for (const frameMs of [1000 / 60, 100]) {
    const race = collectRocket();
    const {state, step} = race;
    const start = state.distance;
    const startTime = state.time;
    let timeToTopSpeed;
    let lastPoweredDistance = start;
    for (let i = 0; i < 500 && state.rocketRemaining > 0; i++) {
      state.objects.length = 0;
      lastPoweredDistance = state.distance;
      step(frameMs);
      assert.ok(state.speed <= 300);
      if (state.speed === 300) timeToTopSpeed ??= state.time - startTime;
      assert.ok(Math.abs(state.rocketRemaining - Math.max(0, 400 - (state.distance - start))) < 1e-6);
    }
    assert.ok(timeToTopSpeed >= 4 && timeToTopSpeed < 4.2);
    assert.equal(state.rocketRemaining, 0);
    assert.ok(lastPoweredDistance - start < 400 && state.distance - start >= 400 - 1e-6);
    const speedAtCutoff = state.speed;
    step(frameMs);
    assert.ok(state.speed < speedAtCutoff);
  }
});

test('the rocket protects against barriers and potholes only while attached', () => {
  const race = collectRocket();
  const {state, events, step} = race;
  for (let i = 0; state.rocketRemaining > 50 && i < 500; i++) {
    state.objects.length = 0;
    step();
  }
  assert.ok(state.rocketRemaining > 0 && state.rocketRemaining <= 50);
  for (const type of ['barrier', 'pothole']) {
    putOnRoad(race, type);
    step();
    assert.equal(state.health, 3);
    assert.equal(state.flat, false);
    assert.equal(state.hit, 0);
    assert.ok(events.every(e => e.type !== type));
  }
  putOnRoad(race, 'cone');
  step();
  assert.ok(events.some(e => e.type === 'cone'));
  for (let i = 0; state.rocketRemaining > 0 && i < 500; i++) {
    state.objects.length = 0;
    step();
  }
  assert.equal(state.rocketRemaining, 0);
  putOnRoad(race, 'barrier');
  step();
  assert.equal(state.health, 2);
});

test('a ramp can launch the rocket-powered bus while respecting the speed limit', () => {
  const race = collectRocket();
  const {state, events, step} = race;
  for (let i = 0; state.speed < 300 && i < 300; i++) {
    state.objects.length = 0;
    step();
  }
  assert.equal(state.speed, 300);
  putOnRoad(race, 'ramp', 0);
  step();
  assert.ok(state.jump?.long);
  assert.ok(events.some(e => e.type === 'jump' && e.points === 100));
  assert.equal(state.speed, 300);
  const remaining = state.rocketRemaining;
  step();
  assert.ok(state.rocketRemaining < remaining);
});

test('pause freezes the remaining metres and restarting removes the rocket', () => {
  const {game, state, step} = collectRocket();
  step(100);
  const remaining = state.rocketRemaining;
  game.pause();
  step(4000);
  game.resume();
  step();
  assert.equal(state.rocketRemaining, remaining);
  step();
  assert.ok(state.rocketRemaining < remaining);
  game.start();
  assert.equal(state.rocketRemaining, 0);
});

test('rockets appear sporadically on clear lanes, well apart from one another', () => {
  const {state, step} = startRace(41);
  const seen = new Set();
  const positions = [];
  let turbos = 0;
  for (let i = 0; state.roadZ < 6500 && i < 6000; i++) {
    for (const object of state.objects) {
      if (!seen.has(object.id)) {
        seen.add(object.id);
        if (object.type === 'boost') turbos++;
        if (object.type === 'rocket') {
          assert.ok(!state.objects.some(other => other !== object && other.lane === object.lane && Math.abs(other.z - object.z) < 1));
          positions.push(state.roadZ + object.z);
        }
      }
      object.passed = true;
    }
    step(150);
  }
  assert.ok(state.roadZ >= 6500);
  assert.ok(positions.length >= 2 && positions.length < turbos);
  assert.ok(positions.every((z, i) => z - (positions[i - 1] || 0) > 400));
});
