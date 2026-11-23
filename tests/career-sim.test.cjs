const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({window: {}});
const filename = path.join(__dirname, '../dist/career-sim.js');
vm.runInContext(fs.readFileSync(filename, 'utf8'), context, {filename});
const create = context.window.CareerSim.create;

function tick(sim, seconds, controls) {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) sim.update(1 / 60, controls);
}

test('collect fares once at the station, then take the first rider to the market', () => {
  const events = [];
  const sim = create({onEvent: event => events.push(event)});
  const state = sim.state;
  const origin = state.nearbyStop;
  const waiting = origin.waiting.length;
  const rider = origin.waiting[0];
  assert.equal(origin.id, 'gare');
  assert.equal(sim.toggleDoors(), true);
  assert.equal(state.people[0].phase, 'boarding');
  tick(sim, .4, {accelerate: true});
  assert.equal(state.bus.speed, 0);
  assert.equal(state.earnings, 0);
  assert.notEqual(state.people[0].x, rider.x);
  assert.equal(sim.toggleDoors(), false);
  tick(sim, 2.6);
  assert.equal(state.serviceComplete, true);
  assert.equal(state.passengers.length, waiting);
  assert.equal(state.earnings, waiting * 3);
  assert.equal(events.filter(e => e.type === 'boarding').length, waiting);
  sim.toggleDoors();
  sim.toggleDoors();
  tick(sim, .1);
  assert.equal(state.earnings, waiting * 3);
  assert.equal(sim.toggleDoors(), true);

  tick(sim, 7, {accelerate: true});
  tick(sim, 1.65, {brake: true});
  assert.equal(state.nearbyStop.id, rider.destination);
  assert.equal(sim.toggleDoors(), true);
  assert.equal(state.people[0].phase, 'alighting');
  assert.equal(state.people[0].id, rider.id);
  tick(sim, 5);
  assert.equal(state.passengers.some(p => p.id === rider.id), false);
  assert.equal(events.filter(e => e.type === 'alighting').length, 1);
  assert.equal(state.earnings, events.filter(e => e.type === 'boarding').reduce((sum, e) => sum + e.fare, 0));
});

test('doors require a stationary bus at a stop; demand returns after the bus leaves', () => {
  const sim = create();
  const start = sim.state.stops[0];
  sim.toggleDoors();
  tick(sim, 35);
  assert.equal(start.waiting.length, 0);
  sim.toggleDoors();
  tick(sim, .6, {accelerate: true});
  assert.equal(sim.state.nearbyStop, start);
  assert.equal(sim.toggleDoors(), false);
  tick(sim, 3.5, {accelerate: true});
  assert.equal(sim.state.nearbyStop, null);
  assert.equal(sim.toggleDoors(), false);
  assert.ok(start.waiting.length > 0);
});

test('the driver can turn onto a second road that leads out into the countryside', () => {
  const sim = create();
  // Isolate steering from incidental traffic along the test itinerary.
  sim.state.cars = [];
  tick(sim, 4.3, {accelerate: true});
  tick(sim, 1.23, {accelerate: true, right: true});
  tick(sim, 5.5, {accelerate: true});
  assert.ok(sim.state.bus.x > 100);
  assert.equal(sim.state.district, 'Campagne');
  assert.ok(sim.state.distance > 120);

  const {roads, nodes} = sim.state.map;
  const connected = new Set([nodes[0]]);
  for (const _ of nodes) {
    for (const {a, b} of roads) {
      if (connected.has(a) || connected.has(b)) { connected.add(a); connected.add(b); }
    }
  }
  assert.equal(connected.size, nodes.length);
  assert.ok(roads.length > nodes.length, 'the road network contains several independent cycles');
});

test('traffic approaches its signals, stops on red and leaves on green', () => {
  const sim = create();
  let waitingCar, signal, stoppedAt, moved = false;
  for (let frame = 0; frame < 50 * 30; frame++) {
    sim.update(1 / 30);
    if (!waitingCar) {
      for (const car of sim.state.cars) {
        signal = car.route.controls.find(c => c.light?.aspect === 'red' &&
          c.at - car.location >= 0 && c.at - car.location < .5 && car.speed < .1);
        if (signal) { waitingCar = car; stoppedAt = car.location; break; }
      }
    } else if (signal.light.aspect === 'green' && waitingCar.location > stoppedAt + 2) {
      moved = true;
      break;
    }
  }
  assert.ok(waitingCar, 'a car stops just behind the line during the red phase');
  assert.ok(moved, 'the waiting car clears its stop line during the next green phase');
});

test('an oncoming car can strike the bus and stays in contact without repeated notices', () => {
  const events = [];
  const sim = create({onEvent: e => events.push(e)});
  const car = sim.state.cars.find(c => Math.abs(c.heading) < .01 && Math.abs(c.x - 3.485) < .01);
  assert.ok(car);
  Object.assign(sim.state.bus, {x: car.x, y: car.y - 8, heading: Math.PI, speed: 0});
  tick(sim, 3);
  assert.equal(sim.state.collisions, 1);
  assert.equal(events.filter(e => e.type === 'collision').length, 1);
  assert.equal(car.speed, 0);
  const previous = car.location;
  tick(sim, 2);
  assert.equal(car.location, previous);
  tick(sim, 2, {brake: true});
  assert.ok(sim.state.bus.speed < 0);
});
