const test = require('node:test');
const assert = require('node:assert/strict');
const gameRuntime = require('./game-runtime.cjs');

test('the same two-minute drive visits all six landscapes regardless of frame cadence', () => {
  const {window, Math: math} = gameRuntime();
  const {BusDrive, BusRoute} = window;
  const game = BusDrive.create();
  const raceBefore = JSON.stringify(game.state);
  const route = game.createBenchmark(), direct = game.createBenchmark();
  math.random = () => { throw new Error('Benchmark draws must be repeatable'); };
  const scenery = new Set();
  let previous = -1;
  for (let ms = 0; ms < 120000; ms += 307) {
    const s = route.sample(ms);
    assert.ok(s.distance > previous);
    previous = s.distance;
    assert.equal(s.lap, BusDrive.lapAtRoadZ(s.roadZ));
    const stage = BusDrive.BENCHMARK_STAGES[s.benchmarkStage];
    assert.ok(ms >= stage.startMs && ms < stage.endMs);
    assert.equal(BusRoute.routeThemeAt(s.roadZ, s.lapBiomes), stage.biome);
    scenery.add(stage.biome);
  }
  assert.equal(scenery.size, 6);
  assert.equal(BusDrive.BENCHMARK_SECONDS, 120);
  assert.equal(route.sample(130000).distance, 6000);
  assert.deepEqual(route.sample(70425), direct.sample(70425));
  assert.equal(JSON.stringify(game.state), raceBefore);
});

test('the central pickup ignites the rocket at night for 400 metres, with a 300 km/h peak', () => {
  const {window} = gameRuntime();
  const route = window.BusDrive.create().createBenchmark();
  const before = route.sample(67900);
  assert.equal(before.rocketRemaining, 0);
  assert.ok(before.objects.some(o => o.type === 'rocket' && o.lane === 0 && o.z > 0 && o.z < 5));
  const start = route.sample(68000).distance;
  for (const ms of [68000, 69500, 71000, 73000]) {
    const s = route.sample(ms);
    assert.ok(Math.abs(s.rocketRemaining - (400 - (s.distance - start))) < 1e-7);
    assert.equal(window.BusDrive.periodForLap(s.lap), 3);
    assert.ok(!s.objects.some(o => o.type === 'rocket'));
  }
  assert.equal(route.sample(73000).speed, 300);
  const cutoff = route.sample(73700);
  assert.ok(Math.abs(cutoff.distance - start - 400) < 1e-7);
  assert.equal(cutoff.rocketRemaining, 0);
  assert.ok(cutoff.rocketGrace > 1.99);
  assert.equal(route.sample(76000).rocketGrace, 0);
});

test('benchmark pause stops the shared audio and resuming the race restores its own rocket', () => {
  const runtime = gameRuntime();
  const {window} = runtime;
  const media = [];
  runtime.clearTimeout = clearTimeout;
  runtime.requestAnimationFrame = () => 1;
  runtime.cancelAnimationFrame = () => {};
  window.matchMedia = () => ({matches:true});
  window.location = {protocol:'file:'};
  window.Audio = class {
    constructor(src) { this.src = src; this.paused = true; media.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  };
  const game = window.BusDrive.create();
  game.start();
  game.state.rocketRemaining = 200;
  game.pause();
  const route = game.createBenchmark();
  route.setPlaying(true);
  route.sample(71000);
  const rocket = media.find(m => m.src === 'assets/rocket-engine.wav');
  assert.equal(rocket.paused, false);
  route.setPlaying(false);
  assert.equal(rocket.paused, true);
  game.resume();
  assert.equal(rocket.paused, false);
  assert.equal(game.state.rocketRemaining, 200);
  assert.equal(media.filter(m => m.src === 'assets/bus-engine.wav').length, 1);
});
