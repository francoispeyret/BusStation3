const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const gameRuntime = require('./game-runtime.cjs');

const script = fs.readFileSync(path.join(__dirname, '../dist/settings.js'), 'utf8');
function loadSettings(storage) {
  const window = {localStorage:storage};
  vm.runInNewContext(script, {window});
  return window.BusSettings;
}

test('graphics preferences survive reopening and validate each saved choice', () => {
  const items = new Map();
  const storage = {getItem:key=>items.get(key), setItem:(key,value)=>items.set(key,value)};
  const settings = loadSettings(storage);
  assert.deepEqual({...settings.current}, {detail:'medium', targetFps:0, resolutionScale:1});
  settings.set({detail:'extreme', targetFps:90, resolutionScale:2});
  assert.deepEqual({...loadSettings(storage).current}, {detail:'extreme', targetFps:90, resolutionScale:2});
  settings.set({targetFps:50, resolutionScale:1});
  assert.deepEqual({...loadSettings(storage).current}, {detail:'extreme', targetFps:90, resolutionScale:1});
  items.set('busstation3.graphics', '{"detail":"high","targetFps":-8,"resolutionScale":4}');
  assert.deepEqual({...loadSettings(storage).current}, {detail:'high', targetFps:0, resolutionScale:1});
  items.set('busstation3.graphics', '?');
  assert.equal(loadSettings(storage).current.detail, 'medium');

  const blocked = () => { throw new Error('Storage blocked'); };
  const temporary = loadSettings({getItem:blocked, setItem:blocked});
  assert.equal(temporary.set({targetFps:240}).targetFps, 240);
});

test('frame pacing follows the chosen target, including fractional display ratios and restart', () => {
  const settings = loadSettings();
  const pace = settings.createFramePacer();
  for (const refresh of [60, 90, 120, 144, 240]) {
    for (const targetFps of settings.choices.targetFps) {
      settings.set({targetFps});
      pace.reset();
      let draws = 0;
      for (let tick=0; tick<refresh*5; tick++) {
        const timestamp = Math.round(tick*10000/refresh) / 10;
        if (pace.due(timestamp)) draws++;
      }
      assert.ok(Math.abs(draws - 5*Math.min(targetFps || refresh, refresh)) <= 1,
        `Got ${draws} draws in five seconds at ${targetFps} fps on ${refresh} Hz`);
    }
  }
  settings.set({targetFps:30});
  assert.ok(pace.due(15000));
  assert.equal(pace.due(15008), false);
  assert.ok(pace.due(16100));
  assert.equal(pace.due(16108), false);
  settings.set({targetFps:240});
  assert.ok(pace.due(16109));
  pace.reset();
  assert.ok(pace.due(16110));
});

test('capping race draws preserves steering, braking, elapsed physics, and events across pause', () => {
  function exercise(targetFps) {
    const env = gameRuntime();
    env.window.BusSettings.set({targetFps});
    env.window.matchMedia = () => ({matches:true});
    env.clearTimeout = clearTimeout;
    let frame, draws=0, seed=195;
    env.requestAnimationFrame = callback => { frame=callback; return 1; };
    env.cancelAnimationFrame = () => {};
    env.Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2**32;
    };
    const events = [];
    const game = env.window.BusDrive.create({onUpdate:()=>draws++, onEvent:e=>events.push(e)});
    game.start();
    for (let tick=0; tick<600; tick++) {
      if (tick===70) game.steer(.65);
      if (tick===130) game.steer(0);
      if (tick===160) game.brake(true);
      if (tick===210) game.brake(false);
      if (tick===300) { game.pause(); game.resume(); }
      frame(tick*1000/120 + (tick>=300 ? 5000 : 0));
    }
    return {draws, trace:JSON.stringify([game.state,events])};
  }
  const capped = exercise(30), unlimited = exercise(0);
  assert.equal(capped.trace, unlimited.trace);
  assert.ok(capped.draws >= 150 && capped.draws <= 154);
  assert.ok(unlimited.draws >= 600);
});
