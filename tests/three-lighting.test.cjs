const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const gameRuntime = require('./game-runtime.cjs');

test('daylight and headlight shadows keep the full VSM blur when switching graphics detail', () => {
  const runtime = gameRuntime();
  runtime.AbortController = AbortController;
  const dist = path.join(__dirname, '../dist');
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const [,bundle] = html.match(/src="(assets\/vendor\/three-[^"]+\.js)"/);
  vm.runInContext(fs.readFileSync(path.join(dist, bundle), 'utf8'), runtime);
  const {THREE} = runtime;
  const scene = new THREE.Scene();
  const renderer = {shadowMap:{}, capabilities:{maxTextureSize:4096}};
  const lighting = runtime.window.BusThreeLighting.create(THREE, scene, renderer, {BEND_START:24, BEND_RATE:.00095});
  const frame = {
    bus:runtime.window.BusModels.models[0], busOpacity:1, d:0,
    cam:{cx:0, cz:-10, a:0}, pose:{x:0, y:0, yaw:0, roll:0, pitch:0},
    light:{direction:{x:0, y:.6, z:.8}, tint:[1,1,1], fog:[1,1,1], shadow:1, night:0}
  };

  assert.equal(renderer.shadowMap.enabled, true);
  assert.equal(renderer.shadowMap.type, THREE.VSMShadowMap);
  const sun = scene.children.find(light => light.isDirectionalLight);
  const headlights = scene.children.filter(light => light.isSpotLight);
  assert.equal(headlights.length, 2);
  for (const shadowWidth of [512, 1536, 768, 1024]) {
    for (const night of [0, .5, 1]) {
      frame.light.night = night;
      lighting.update({...frame, level:{shadowWidth, lighting:0}});
      assert.equal(sun.shadow.mapSize.width, shadowWidth);
      for (const lamp of headlights) assert.equal(lamp.visible, night > 0);
      for (const lamp of [sun, ...headlights]) {
        assert.ok(lamp.castShadow);
        assert.equal(lamp.shadow.radius, 25);
        assert.equal(lamp.shadow.blurSamples, 25);
      }
    }
  }
  lighting.dispose();
});
