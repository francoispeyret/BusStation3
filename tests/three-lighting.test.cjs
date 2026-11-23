const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const gameRuntime = require('./game-runtime.cjs');

function createLighting() {
  const runtime = gameRuntime();
  runtime.AbortController = AbortController;
  const dist = path.join(__dirname, '../dist');
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const [,bundle] = html.match(/src="(assets\/vendor\/three-[^"]+\.js)"/);
  vm.runInContext(fs.readFileSync(path.join(dist, bundle), 'utf8'), runtime);
  const {THREE} = runtime;
  const scene = new THREE.Scene();
  const renderer = {shadowMap:{}, capabilities:{maxTextureSize:4096}};
  const lighting = runtime.window.BusThreeLighting.create(THREE, scene, renderer, {BEND_START:24, BEND_RATE:.00095, FAR:288});
  const frame = {
    bus:runtime.window.BusModels.models[0], busOpacity:1, d:0, time:0, lapBiomes:['hills'],
    cam:{cx:0, cz:-10, a:0}, pose:{x:0, y:0, yaw:0, roll:0, pitch:0},
    light:{direction:{x:0, y:.6, z:.8}, tint:[1,1,1], fog:[1,1,1], shadow:1, night:0}
  };
  return {THREE, scene, renderer, lighting, frame, drive:runtime.window.BusDrive};
}

test('daylight and headlight shadows keep the full VSM blur when switching graphics detail', () => {
  const {THREE, scene, renderer, lighting, frame} = createLighting();
  assert.equal(renderer.shadowMap.enabled, true);
  assert.equal(renderer.shadowMap.type, THREE.VSMShadowMap);
  const directional = scene.children.filter(light => light.isDirectionalLight);
  const headlights = scene.children.filter(light => light.isSpotLight);
  assert.equal(directional.length, 2);
  assert.equal(headlights.length, 2);
  for (const shadowWidth of [512, 1536, 768, 1024]) {
    for (const night of [0, .5, 1]) {
      frame.light.night = night;
      lighting.update({...frame, level:{shadowWidth, lighting:0}});
      const near = directional[0].shadow;
      assert.equal(near.mapSize.width, shadowWidth);
      const blurMetres = near.radius * (near.camera.right - near.camera.left) / near.mapSize.width;
      assert.ok(blurMetres >= 1 && blurMetres <= 1.5, `Near shadow blur spans ${blurMetres} m`);
      for (const lamp of headlights) assert.equal(lamp.visible, night > 0);
      for (const lamp of [...directional, ...headlights]) {
        assert.ok(lamp.castShadow);
        assert.equal(lamp.shadow.radius, 25);
        assert.equal(lamp.shadow.blurSamples, 25);
      }
    }
  }
  lighting.dispose();
  assert.equal(scene.children.length, 0);
});

test('directional shadows cover the curved road and shoulders through 200 metres at every detail level', () => {
  const {THREE, scene, lighting, frame, drive} = createLighting();
  const suns = scene.children.filter(light => light.isDirectionalLight);
  for (const [distance, elevation, azimuth] of [[1200, 13, 8], [2600, 51, -18]]) {
    frame.d = distance;
    frame.pose.x = drive.roadX(distance);
    frame.cam.a = Math.atan(drive.roadSlope(distance));
    frame.cam.cx = frame.pose.x - 13.3*Math.sin(frame.cam.a);
    frame.cam.cz = distance - 13.3*Math.cos(frame.cam.a);
    const pitch = elevation * Math.PI / 180, bearing = azimuth * Math.PI / 180;
    frame.light.direction = {x:Math.cos(pitch)*Math.sin(bearing), y:Math.sin(pitch), z:Math.cos(pitch)*Math.cos(bearing)};
    for (const shadowWidth of [512, 768, 1024, 1536]) {
      lighting.update({...frame, level:{shadowWidth, lighting:0}});
      scene.updateMatrixWorld(true);
      for (const sun of suns) sun.shadow.updateMatrices(sun);
      for (let metres = 0; metres <= 200; metres += 10) {
        for (const offset of [-6, 0, 6]) {
          const receiver = new THREE.Vector3(drive.roadX(distance+metres)+offset, 0, -metres);
          const covered = suns.some(sun => {
            const uv = receiver.clone().applyMatrix4(sun.shadow.matrix);
            return uv.x > .02 && uv.x < .98 && uv.y > .02 && uv.y < .98 && uv.z > 0 && uv.z < 1;
          });
          assert.ok(covered, `Uncovered road at ${metres} m, offset ${offset}, map width ${shadowWidth}, sun ${elevation}°`);
        }
      }
    }
  }
  lighting.dispose();
});

test('the cached distant map stays anchored while driving and refreshes on route and detail changes', () => {
  const {THREE, scene, lighting, frame, drive} = createLighting();
  const distant = scene.children.filter(light => light.isDirectionalLight)[1];
  const shadow = distant.shadow;
  frame.level = {shadowWidth:768, lighting:0};
  lighting.update(frame);
  assert.equal(shadow.autoUpdate, false);
  assert.ok(shadow.needsUpdate);
  scene.updateMatrixWorld(true);
  shadow.updateMatrices(distant);
  shadow.needsUpdate = false;

  const fixedRoadZ = 160;
  function receiverOnMap() {
    const offset = lighting.material.uniforms.distantOriginOffset.value;
    return new THREE.Vector3(drive.roadX(fixedRoadZ), 0, frame.d-fixedRoadZ+offset).applyMatrix4(shadow.matrix);
  }
  const initial = receiverOnMap();
  frame.d += 1.5;
  frame.time += 1 / 120;
  lighting.update(frame);
  assert.equal(shadow.needsUpdate, false);
  assert.ok(initial.distanceTo(receiverOnMap()) < 1e-10);

  frame.lapBiomes = ['snow'];
  lighting.update(frame);
  assert.ok(shadow.needsUpdate);
  assert.equal(lighting.material.uniforms.distantOriginOffset.value, 0);
  shadow.needsUpdate = false;
  frame.level = {shadowWidth:1024, lighting:.55};
  lighting.update(frame);
  assert.ok(shadow.needsUpdate);
  lighting.dispose();
});
