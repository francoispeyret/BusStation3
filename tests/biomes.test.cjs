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

test('steering onto either shoulder slows the bus until its tires regain asphalt', () => {
  let frame;
  runtime.window.matchMedia = () => ({matches:true});
  runtime.requestAnimationFrame = callback => { frame = callback; return 1; };
  runtime.cancelAnimationFrame = () => {};
  runtime.clearTimeout = clearTimeout;
  for (const side of [-1, 1]) {
    let tick = 0;
    const game = BusDrive.create();
    game.start();
    frame(0);
    game.state.speed = 78;
    game.steer(side);
    let straddled = false;
    while (tick < 90) {
      frame(++tick * 1000 / 60);
      straddled ||= game.state.rearWheels.some(w => w.contact === 1)
        && game.state.rearWheels.some(w => w.contact === 0);
    }
    assert.ok(straddled, 'only the tire off the road should spray when straddling');
    assert.ok(side * game.state.laneX >= 2, 'the full shoulder lane is reachable');
    assert.equal(game.state.shoulderContact, 1);
    const shoulderSpeed = game.state.speed;
    assert.ok(shoulderSpeed < 60);
    game.steer(-side);
    while (tick < 240 && game.state.shoulderContact > 0) frame(++tick * 1000 / 60);
    assert.equal(game.state.shoulderContact, 0);
    assert.ok(game.state.rearWheels.every(w => w.contact === 0));
    assert.ok(game.state.speed > shoulderSpeed);
    game.stop();
  }
});

test('wheel spray switches material at the lap marker and uses the deck on bridges', () => {
  const route = ['hills', 'snow', 'bridge'];
  const offset = 2 * BusDrive.LANE_WIDTH;
  const snowStart = BusDrive.roadZForLap(2), bridgeStart = BusDrive.roadZForLap(3);
  for (const side of [-1, 1]) {
    const underWheel = z => BusRoute.shoulderColorAt(side * offset, z, route);
    assert.equal(underWheel(snowStart - .01), BusRoute.biomeFor('hills').grass);
    assert.equal(underWheel(snowStart + .01), BusRoute.biomeFor('snow').grass);
    assert.equal(underWheel(bridgeStart + .01), BusRoute.biomeFor('bridge').verge);
  }
  const rails = BusRoute.biomeFor('bridge').roadDetails.filter(band => band.y > .1);
  assert.ok(rails.length > 0);
  assert.ok(rails.every(band => band.right <= -BusDrive.DRIVABLE_HALF_WIDTH
    || band.left >= BusDrive.DRIVABLE_HALF_WIDTH));
});
