const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({window:{}});
for (const file of ['mesh.js', 'bus-handling.js', 'career-motion.js', 'career-physics.js', 'career-sim.js']) {
  const filename = path.join(__dirname, '../dist', file);
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, {filename});
}
const {CareerSim, BusMesh} = context.window;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('each service scatters up to six cones on separate streets, clear of junctions, stops and the depot', () => {
  const layouts = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const {state} = CareerSim.create({random:BusMesh.random(seed)});
    assert.equal(state.cones.length, 6);
    assert.equal(new Set(state.cones.map(cone => cone.road)).size, 6);
    layouts.add(state.cones.map(cone => cone.x.toFixed(3) + '/' + cone.y.toFixed(3)).join(','));
    for (const cone of state.cones) {
      const {a, b, width} = cone.road;
      const lateral = ((b.x-a.x)*(cone.y-a.y) - (b.y-a.y)*(cone.x-a.x)) / distance(a, b);
      assert.ok(Math.abs(lateral) + .475 < width / 2);
      assert.ok(state.stops.every(stop => distance(cone, stop) >= 21));
      assert.ok(state.map.nodes.every(node => distance(cone, node) >= 18));
      assert.ok(distance(cone, state.bus) >= 26);
      assert.ok(state.cones.every(other => cone === other || distance(cone, other) >= 34));
    }
  }
  assert.equal(layouts.size, 40);
});

test('a cone can be knocked over once in either gear and returns away from the bus after the impact', () => {
  for (const reverse of [false,true]) {
    const events = [];
    const sim = CareerSim.create({random:BusMesh.random(21), onEvent:event => events.push(event.type)});
    const {bus, cones} = sim.state, cone = cones[0];
    sim.state.cars = [];
    const street = cone.road, initial = {x:cone.x, y:cone.y};
    const sx = Math.sin(cone.heading), cy = Math.cos(cone.heading);
    const towardsCentre = -Math.sign(cone.lateral);
    function approach(shift) {
      Object.assign(bus, {x:cone.x - 6*sx + shift*cy, y:cone.y + 6*cy + shift*sx,
        heading:cone.heading + (reverse ? Math.PI : 0), speed:reverse ? -4 : 12, steer:0});
    }
    approach(towardsCentre * 3.5);
    for (let i=0; i<60; i++) sim.update(1/60, reverse ? {brake:true} : {});
    assert.equal(cone.hit, null, 'passing beside the cone leaves it standing');
    approach(0);
    for (let i=0; i<90 && !cone.hit; i++) sim.update(1/60, reverse ? {brake:true} : {});
    assert.ok(cone.hit);
    assert.equal(Math.abs(bus.speed), cone.hit.speed * .75);
    assert.ok(Math.cos(cone.hit.heading - cone.heading) > .99, 'the cone flies in the direction of travel');
    bus.speed = 0;
    for (let i=0; i<60*8; i++) sim.update(1/60);
    assert.ok(cone.hit && sim.state.time > cone.hit.start + cone.hit.duration);
    assert.equal(distance(cone, initial), 0);
    for (let i=0; i<60*12; i++) sim.update(1/60);
    assert.equal(cone.hit, null);
    assert.notEqual(cone.road, street);
    assert.ok(distance(cone, bus) >= 85);
    assert.equal(cones.length, 6);
    assert.deepEqual(events, ['cone']);
    assert.equal(sim.state.earnings, 0);
  }
});
