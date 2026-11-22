const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Follow the real script order, including the content modules loaded by a file:// game.
const dist = path.join(__dirname, '../dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const runtime = vm.createContext({window:{}, Math:Object.create(Math)});
for (const match of html.matchAll(/<script src="([^"?]+)/g)) {
  const file = match[1];
  if (file === 'world.js') break;
  if (file.startsWith('assets/')) continue;
  vm.runInContext(fs.readFileSync(path.join(dist, file), 'utf8'), runtime, {filename:file});
}
const {BusBiomes, BusDrive, BusRoute} = runtime.window;
const ids = [...BusBiomes.definitions.keys()];

test('all registered landscapes enter the draw and can repeat after the hills', () => {
  for (const id of ['hills','village','forest','mesa','desert','beach','bridge','city','snow']) {
    assert.ok(ids.includes(id), id);
  }
  for (const [i,id] of ids.entries()) {
    const route = ['hills'];
    runtime.Math.random = () => (i+.5)/ids.length;
    assert.equal(BusDrive.sceneryForLap(1,route), 'hills');
    assert.equal(BusDrive.sceneryForLap(3,route), id);
    assert.equal(BusDrive.sceneryForLap(2,route), id);
    assert.equal(BusDrive.SCENERY_NAMES[id], BusBiomes.definitions.get(id).name);
  }
  runtime.Math.random = Math.random;
});

test('every pair of terrains meets at its fixed lap marker', () => {
  const z = BusDrive.roadZForLap(3);
  for (const before of ids) for (const after of ids) {
    const route = ['hills',before,after];
    assert.equal(BusRoute.routeThemeAt(z-.001,route), before);
    assert.equal(BusRoute.routeThemeAt(z+.001,route), after);
    for (const offset of [-30,-10,10,30]) {
      const x = BusDrive.roadX(z)+offset;
      const difference = BusRoute.terrainHeightAt(x,z-.001,route)-BusRoute.terrainHeightAt(x,z+.001,route);
      assert.ok(Math.abs(difference)<.025, before+' → '+after);
    }
  }
});

test('each landscape streams valid models and moving inhabitants during a lap', () => {
  const {CHUNK,biomeActorsInSection,biomeActorPose,biomeModelMesh} = BusRoute;
  const first = Math.ceil(BusDrive.roadZForLap(2)/CHUNK);
  const end = Math.floor(BusDrive.roadZForLap(3)/CHUNK);
  for (const id of ids) {
    const route = ['hills',id,id];
    let moving = false;
    for (let i=first;i<end;i++) for (const a of biomeActorsInSection(i,route)) {
      assert.ok(Number.isFinite(a.x+a.y+a.z+a.height+a.radius), a.model);
      if (!a.motion) continue;
      const start = biomeActorPose(a,0), later = biomeActorPose(a,2.7);
      moving ||= ['x','y','z','yaw','roll','pitch'].some(key=>start[key]!==later[key]);
    }
    assert.ok(moving, id+' should have active inhabitants');
  }
  for (const model of BusBiomes.models.keys()) for (const variant of [0,1,2]) {
    const mesh = biomeModelMesh(model,variant);
    assert.ok(mesh.data.length>0 && mesh.data.length%18===0 && mesh.data.every(Number.isFinite), model);
  }
});
