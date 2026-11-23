const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({window: {}});
for (const file of ['mesh.js', 'bus-handling.js', 'bus-boost.js', 'career-motion.js', 'career-physics.js', 'career-sim.js']) {
  const filename = path.join(__dirname, '../dist', file);
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, {filename});
}
const create = options => context.window.CareerSim.create({random:context.window.BusMesh.random(17), ...options});

function tick(sim, seconds, controls) {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) sim.update(1 / 60, controls);
}

function driveUntil(sim, controls, reached) {
  for (let i = 0; i < 60 * 15; i++) {
    sim.update(1 / 60, controls);
    if (reached(sim.state.bus)) return;
  }
  assert.fail('The bus did not reach the waypoint within 15 s');
}

test('waiting at the station boards riders automatically and braking at the market lets them off first', () => {
  const events = [];
  const sim = create({onEvent: event => events.push(event)});
  const state = sim.state;
  state.cars = [];
  state.cones = [];
  const origin = state.nearbyStop;
  const waiting = origin.waiting.length;
  const rider = origin.waiting[0];
  assert.equal(origin.id, 'gare');
  sim.update(1/60);
  assert.equal(state.doorsOpen, true);
  assert.equal(state.people[0].phase, 'boarding');
  tick(sim, .4, {accelerate: true});
  assert.equal(state.bus.speed, 0);
  assert.equal(state.earnings, 0);
  assert.notEqual(state.people[0].x, rider.x);
  tick(sim, 2.6);
  assert.equal(state.doorsOpen, false);
  assert.equal(state.passengers.length, waiting);
  assert.equal(state.earnings, waiting * 3);
  assert.equal(events.filter(e => e.type === 'boarding').length, waiting);

  const market = state.stops.find(stop => stop.id === rider.destination);
  driveUntil(sim, {accelerate:true}, bus => bus.y <= market.y + 23);
  driveUntil(sim, {brake:true}, () => state.doorsOpen);
  assert.equal(state.nearbyStop.id, rider.destination);
  assert.equal(state.people[0].phase, 'alighting');
  assert.equal(state.people[0].id, rider.id);
  const dockedY = state.bus.y;
  tick(sim, 6, {brake:true});
  assert.equal(state.doorsOpen, false);
  assert.equal(state.bus.speed, 0);
  assert.equal(state.bus.y, dockedY, 'a held brake keeps the bus still after the doors close');
  assert.equal(state.passengers.some(p => p.id === rider.id), false);
  assert.equal(events.filter(e => e.type === 'alighting').length, 1);
  assert.equal(state.earnings, events.filter(e => e.type === 'boarding').reduce((sum, e) => sum + e.fare, 0));
  sim.update(1/60);
  tick(sim, .3, {brake:true});
  assert.ok(state.bus.speed < 0, 'releasing and pressing the brake again selects reverse');
});

test('a recently served stop stays empty and a moving bus can pass later arrivals', () => {
  const doorEvents = [];
  const sim = create({onEvent:event => { if (event.type === 'doors') doorEvents.push(event); }});
  const state = sim.state, start = state.nearbyStop;
  state.cars = [];
  state.cones = [];
  const firstGroup = start.waiting.length;
  tick(sim, 3);
  assert.equal(state.doorsOpen, false);
  const firstEarnings = state.earnings;
  assert.equal(firstEarnings, firstGroup * 3);
  assert.equal(doorEvents.length, 2);
  tick(sim, 8);
  assert.equal(start.waiting.length, 0);
  assert.equal(state.earnings, firstEarnings);
  assert.equal(state.doorsOpen, false);
  assert.equal(doorEvents.length, 2, 'standing at the same platform does not reopen the doors');

  // Leave the platform. Crossing the service boundary does not summon passengers.
  driveUntil(sim, {brake:true}, bus => bus.y > start.y + 39);
  assert.equal(state.nearbyStop, null);
  assert.equal(start.waiting.length, 0);
  tick(sim, start.nextArrival - state.time + .1);
  const waiting = start.waiting.length;
  assert.equal(waiting, 1);
  driveUntil(sim, {accelerate:true}, () => state.nearbyStop === start);
  assert.ok(state.bus.speed > 5);
  driveUntil(sim, {accelerate:true}, bus => bus.y < start.y - 12);
  assert.equal(start.waiting.length, waiting);
  assert.equal(state.earnings, firstEarnings);
  assert.equal(doorEvents.length, 2);

  // Stop beyond the platform, reverse towards it and coast to a standstill there.
  driveUntil(sim, {brake:true}, bus => bus.speed < -4 && bus.y >= start.y - 8);
  driveUntil(sim, {}, () => state.doorsOpen);
  assert.equal(state.nearbyStop, start);
  tick(sim, 5);
  assert.equal(state.doorsOpen, false);
  assert.equal(start.waiting.length, 0);
  assert.equal(state.earnings, firstEarnings + waiting * 3);
  assert.equal(doorEvents.length, 4);
});

test('each service starts with one passenger at the depot and two more at different city and country stops', () => {
  const cityChoices = new Set(), countryChoices = new Set();
  for (let seed = 1; seed <= 32; seed++) {
    const {state} = create({random:context.window.BusMesh.random(seed)});
    const occupied = state.stops.filter(stop => stop.waiting.length);
    assert.equal(occupied.length, 3);
    assert.ok(occupied.includes(state.nearbyStop));
    assert.ok(occupied.every(stop => stop.waiting.length === 1 && stop.nextArrival >= stop.demand.minInterval));
    const city = occupied.find(stop => stop !== state.nearbyStop && stop.x <= state.map.townEdge);
    const country = occupied.find(stop => stop.x > state.map.townEdge);
    assert.ok(city && country);
    cityChoices.add(city.id);
    countryChoices.add(country.id);
  }
  assert.ok(cityChoices.size > 1 && countryChoices.size > 1);
});

test('demand grows one rider at a time with smaller and slower queues in the countryside', () => {
  for (const [rural, limit, minimum, maximum] of [[false, 3, 45, 75], [true, 2, 70, 110]]) {
    const sim = create(), {state} = sim;
    state.cars = [];
    Object.assign(state.bus, {x:0, y:0});
    const stop = state.stops.find(item => !item.waiting.length && (item.x > state.map.townEdge) === rural);
    const next = stop.nextArrival - state.time;
    assert.equal(stop.waiting.length, 0);
    tick(sim, next - .1);
    assert.equal(stop.waiting.length, 0);
    tick(sim, .2);
    assert.equal(stop.waiting.length, 1);
    for (let count = 2; count <= limit; count++) {
      const delay = stop.nextArrival - state.time;
      assert.ok(delay >= minimum - .2 && delay <= maximum);
      tick(sim, delay - .1);
      assert.equal(stop.waiting.length, count - 1);
      tick(sim, .2);
      assert.equal(stop.waiting.length, count);
    }
    tick(sim, maximum + 1);
    assert.equal(stop.waiting.length, limit);
  }
});

test('waiting at the same platform long enough lets a newly arrived rider board', () => {
  const sim = create(), {state} = sim;
  const station = state.nearbyStop;
  state.cars = [];
  tick(sim, 2);
  assert.equal(state.earnings, 3);
  assert.equal(station.waiting.length, 0);
  tick(sim, station.nextArrival - state.time - .1);
  assert.equal(state.earnings, 3);
  assert.equal(state.doorsOpen, false);
  tick(sim, .2);
  assert.equal(state.people[0].phase, 'boarding');
  tick(sim, 1);
  assert.equal(state.passengers.length, 2);
  assert.equal(state.earnings, 6);
});

test('a full bus automatically lets a rider off and boards only as many as there are free seats', () => {
  const sim = create();
  const state = sim.state, station = state.nearbyStop;
  state.cars = [];
  const parked = {x:state.bus.x, y:state.bus.y};
  Object.assign(state.bus, {x:0, y:0});
  tick(sim, 240);
  Object.assign(state.bus, parked);
  const queue = station.waiting.map(person => person.id);
  assert.equal(queue.length, 3);
  station.nextArrival = state.time + 1.2;
  state.passengers = Array.from({length:24}, (_,i) => ({id:100+i, destination:i === 0 ? station.id : 'marche'}));
  sim.update(1/60);
  assert.equal(state.people[0].id, 100);
  assert.equal(state.people[0].phase, 'alighting');
  tick(sim, 5);
  assert.equal(state.passengers.length, 24);
  assert.equal(state.passengers.some(person => person.id === 100), false);
  assert.ok(state.passengers.some(person => person.id === queue[0]));
  assert.deepEqual(station.waiting.map(person => person.id), queue.slice(1));
  assert.equal(state.earnings, 3);
  assert.equal(state.doorsOpen, false);
  Object.assign(state.bus, {x:0, y:0});
  tick(sim, station.nextArrival - state.time + .1);
  assert.equal(station.waiting.length, 3);
  assert.equal(new Set(station.waiting.map(person => [person.x, person.y].join(','))).size, 3);
});

test('the driver can turn onto a second road that leads out into the countryside', () => {
  const sim = create();
  const {map, bus} = sim.state;
  // Approach the central junction at the same speed regardless of block length.
  sim.state.cars = [];
  sim.state.cones = [];
  driveUntil(sim, {accelerate:true}, bus => bus.y <= 65);
  driveUntil(sim, {brake:true}, bus => bus.speed <= 14);
  driveUntil(sim, {}, bus => bus.y <= 18);
  driveUntil(sim, {right:true}, bus => bus.heading >= 1.55);
  driveUntil(sim, {accelerate:true}, bus => bus.x > map.townEdge + 8);
  assert.ok(bus.x > map.byId.E.x);
  assert.equal(sim.state.district, 'Campagne');
  assert.ok(sim.state.distance > 300);

  const {roads, nodes} = map;
  const xs = nodes.map(node => node.x), ys = nodes.map(node => node.y);
  // The original network of junctions measured 430 m east–west and 283 m north–south.
  assert.equal(Math.max(...xs) - Math.min(...xs), 2 * 430);
  assert.equal(Math.max(...ys) - Math.min(...ys), 2 * 283);
  const connected = new Set([nodes[0]]);
  for (const _ of nodes) {
    for (const {a, b} of roads) {
      if (connected.has(a) || connected.has(b)) { connected.add(a); connected.add(b); }
    }
  }
  assert.equal(connected.size, nodes.length);
  assert.ok(roads.length > nodes.length, 'the road network contains several independent cycles');
});

test('the tank starts full and fuel consumption follows the metres driven in either gear', () => {
  const sim = create(), {state} = sim;
  state.cones = [];
  state.cars = [];
  assert.equal(state.fuel, 100);
  tick(sim, 6);
  assert.equal(state.distance, 0);
  assert.equal(state.fuel, 100);
  tick(sim, 2, {accelerate:true});
  const forwardDistance = state.distance, forwardFuel = state.fuel;
  assert.ok(forwardDistance > 0 && forwardFuel < 100);
  driveUntil(sim, {brake:true}, bus => bus.speed < -1);
  const reverseStart = state.distance, reverseFuel = state.fuel;
  tick(sim, 1, {brake:true});
  assert.ok(state.distance > reverseStart && state.fuel < reverseFuel);
  const fuelPerMetre = (100 - forwardFuel) / forwardDistance;
  const reverseConsumption = (reverseFuel - state.fuel) / (state.distance - reverseStart);
  assert.ok(Math.abs(reverseConsumption - fuelPerMetre) < 1e-7);
});

test('both fuel stations allow a complete refill after braking at the pump', () => {
  const events = [];
  const sim = create({onEvent:e => events.push(e.type)}), {state} = sim;
  state.cones = [];
  state.cars = [];
  const stations = state.map.fuelStations;
  assert.equal(stations.length, 2);
  assert.equal(new Set(stations.map(s => s.id)).size, 2);
  assert.ok(stations.some(s => s.x < state.map.townEdge) && stations.some(s => s.x > state.map.townEdge));

  for (const station of stations) {
    events.length = 0;
    state.fuel = 43;
    const dx = Math.sin(station.heading), dy = -Math.cos(station.heading);
    Object.assign(state.bus, {x:station.x - 13*dx, y:station.y - 13*dy, heading:station.heading, speed:9, steer:0});
    driveUntil(sim, {}, () => state.nearbyFuelStation?.id === station.id);
    assert.ok(state.bus.speed > 5 && state.fuel < 43);
    assert.equal(state.refueling, false, 'driving by the pump cannot fill the tank');
    driveUntil(sim, {brake:true}, () => state.refueling);
    const before = state.fuel;
    tick(sim, .4, {brake:true});
    assert.ok(state.fuel > before && state.fuel < 100);
    assert.equal(state.bus.speed, 0);
    tick(sim, 6);
    assert.equal(state.fuel, 100);
    assert.equal(state.refueling, false);
    assert.equal(events.filter(type => type === 'refueled').length, 1);
    driveUntil(sim, {accelerate:true}, () => !state.nearbyFuelStation);
    assert.ok(state.bus.speed > 0 && state.fuel < 100);
  }
});

test('the last drops must carry the bus into the pump area even if one frame would overshoot it', () => {
  // Both buses approach from 4 m away, within one physics step of the 3.5 m pump radius.
  for (const [remainingMetres, reachesPump] of [[.2,false],[.7,true]]) {
    const events = [];
    const sim = create({onEvent:e => events.push(e.type)}), {state} = sim;
    const station = state.map.fuelStations[0];
    state.cars = [];
    state.cones = [];
    state.fuel = 100 * remainingMetres / 4000;
    Object.assign(state.bus, {x:station.x - 4*Math.sin(station.heading),
      y:station.y + 4*Math.cos(station.heading), heading:station.heading, speed:25});
    sim.update(1/30);
    assert.ok(Math.abs(state.distance - remainingMetres) < 1e-7);
    assert.equal(state.outOfFuel, !reachesPump);
    assert.equal(state.refueling, reachesPump);
    tick(sim, 6);
    assert.equal(state.fuel, reachesPump ? 100 : 0);
    assert.deepEqual(events, [reachesPump ? 'refueled' : 'fuel-empty']);
  }
});

test('running dry on the road ends the service and a new service starts with a full tank', () => {
  const events = [];
  const sim = create({onEvent:e => events.push(e.type)}), {state} = sim;
  state.cars = [];
  state.cones = [];
  state.fuel = .01;
  driveUntil(sim, {accelerate:true}, () => state.outOfFuel);
  assert.equal(state.fuel, 0);
  assert.equal(state.bus.speed, 0);
  assert.equal(state.refueling, false);
  const stoppedAt = state.distance;
  tick(sim, 3, {accelerate:true});
  tick(sim, 3, {brake:true});
  assert.equal(state.distance, stoppedAt);
  assert.equal(state.fuel, 0);
  assert.equal(events.filter(type => type === 'fuel-empty').length, 1);
  const next = create();
  assert.equal(next.state.fuel, 100);
  assert.equal(next.state.outOfFuel, false);
});

test('a quick correction is gentle at cruising speed and the wheel centres on release', () => {
  const sim = create();
  sim.state.cars = [];
  tick(sim, 4, {accelerate:true});
  const bus = sim.state.bus;
  assert.equal(Math.round(bus.speed * 3.6), 90);
  tick(sim, .1, {right:true});
  assert.ok(bus.heading > 0 && bus.heading < .05, 'a tenth-second tap changes heading by less than three degrees');
  assert.ok(bus.steer > 0 && bus.steer < .8);
  tick(sim, .7);
  assert.equal(bus.steer, 0);
  const heading = bus.heading;
  tick(sim, .1);
  assert.equal(bus.heading, heading);
});

test('the bus can cut across a city sidewalk in a turn while staying inside the block boundary', () => {
  const sim = create();
  sim.state.cars = [];
  const bus = sim.state.bus;
  Object.assign(bus, {x:8, y:18, speed:9});
  let furthestFromAsphalt = 0;
  driveUntil(sim, {right:true}, () => {
    // The two streets meet at (0, 0), each with 8.5 m of asphalt on either side.
    const lateral = Math.min(Math.abs(bus.x), Math.abs(bus.y));
    furthestFromAsphalt = Math.max(furthestFromAsphalt, lateral - 8.5);
    return bus.heading >= 1.52;
  });
  assert.ok(furthestFromAsphalt > 1, 'the bus centre crosses the curb during the right turn');
  assert.ok(bus.x > 20 && Math.abs(bus.y) < 8.5 && bus.speed > 5, 'the bus rejoins the street without stalling');

  Object.assign(bus, {x:7, y:42, heading:Math.PI / 2, speed:12, steer:0});
  tick(sim, 2, {accelerate:true});
  assert.ok(Math.abs(bus.x + 1.35 - (8.5 + 2.8)) < .01, 'the sidewalk has an outer limit between intersections');
});

test('the bus can follow either grassy country shoulder and steer back onto the road', () => {
  const sim = create();
  const {bus, map} = sim.state;
  sim.state.cars = [];
  sim.state.cones = [];
  const road = map.roads.find(r => r.a.id === 'mill' && r.b.id === 'hill');
  const dx = road.b.x - road.a.x, dy = road.b.y - road.a.y, length = Math.hypot(dx, dy);
  const heading = Math.atan2(dx, -dy);
  for (const side of [-1, 1]) {
    const beyondAsphalt = () => side * ((bus.y - road.a.y)*dx - (bus.x - road.a.x)*dy) / length - road.width/2;
    Object.assign(bus, {x:(road.a.x + road.b.x)/2, y:(road.a.y + road.b.y)/2,
      heading:heading + side * Math.PI/2, speed:12, steer:0});
    tick(sim, 2, {accelerate:true});
    const outerEdge = beyondAsphalt();
    assert.ok(outerEdge > 2, 'the bus can pull completely off the asphalt');
    assert.ok(Math.abs(outerEdge + 1.35 - road.vergeWidth) < .01, 'the grass leaves half the coach width at the outer boundary');
    tick(sim, 1, {accelerate:true});
    assert.ok(Math.abs(beyondAsphalt() - outerEdge) < .01, 'driving outwards cannot cross the outer boundary');

    const x = bus.x, y = bus.y;
    bus.heading = heading - side * .02;
    tick(sim, 1.8, {accelerate:true});
    assert.ok(beyondAsphalt() > 1.35, 'both rows of wheels stay on the grass');
    assert.ok(((bus.x - x)*dx + (bus.y - y)*dy)/length > 10, 'the bus advances along the shoulder');
    driveUntil(sim, side > 0 ? {left:true} : {right:true}, () => beyondAsphalt() < -.5);
  }
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

// Car 0 travels north on the long straight from the depot to the central lights.
function collisionScenario({offset = 0, gap = 9, heading = 0, busSpeed = 19, carSpeed = 3, cruise = 8} = {}) {
  const events = [];
  const sim = create({onEvent:event => { if (event.type === 'collision') events.push(event); }});
  const {bus, cars} = sim.state, car = cars[0];
  sim.state.cars = [car];
  sim.state.cones = [];
  car.location = car.route.controls[0].at - 57;
  const lane = car.route.points[0];
  Object.assign(car, {x:lane.x, y:lane.y-car.location, heading:0, speed:carSpeed, cruise, vx:0, vy:-carSpeed});
  Object.assign(bus, {x:car.x+offset, y:car.y+gap, heading, speed:busSpeed});
  return {sim, car, bus, events};
}

test('a stationary coach absorbs an oncoming hit and traffic proceeds once it moves clear', () => {
  const {sim, car, bus, events} = collisionScenario({gap:-9, heading:Math.PI, busSpeed:0, carSpeed:8});
  const parked = {x:bus.x, y:bus.y};
  tick(sim, .6);
  assert.equal(car.mode, 'sliding');
  assert.ok(car.vy > 0, 'the oncoming car recoils from the bus bumper');
  assert.equal(bus.x, parked.x);
  assert.equal(bus.y, parked.y);
  assert.equal(bus.speed, 0);
  tick(sim, 4);
  assert.equal(sim.state.collisions, 1);
  assert.equal(events.filter(e => e.type === 'collision').length, 1);
  assert.ok(car.speed < .2, 'the driver yields to the obstruction on recovering');
  Object.assign(bus, {x:-6, y:85});
  const before = car.location;
  tick(sim, 3);
  assert.ok(car.speed > 4 && car.location > before + 5);
});

test('a coach can keep pushing another vehicle without locking, reversing or repeating the impact', () => {
  const {sim, car, bus, events} = collisionScenario({busSpeed:8, carSpeed:0, cruise:0});
  const carStart = car.y, busStart = bus.y;
  let before = bus.speed;
  for (let frame = 0; frame < 60 && !events.length; frame++) {
    before = bus.speed;
    sim.update(1/60, {accelerate:true});
  }
  const impact = events[0];
  assert.equal(impact.type, 'collision');
  assert.ok(impact.strength > 8 && impact.longitudinal < -.99);
  assert.ok(bus.speed < before && bus.speed > .85*before, 'a rear-end impact costs only a little coach speed');
  assert.ok(-car.vy > .9*before && Math.abs(car.yawRate) < .01, 'a central hit pushes the car straight ahead');
  tick(sim, 2, {accelerate:true});
  assert.equal(events.length, 1);
  assert.equal(bus.heading, 0);
  assert.ok(car.y < carStart - 20 && bus.y < busStart - 20);
  assert.ok(bus.y-car.y > 6.62, 'the two bumpers stay separated even under sustained throttle');
});

test('an offset hit spins the lighter car, which steers back into traffic and obeys the next red light', () => {
  for (const hz of [30, 60, 120]) {
    const {sim, car, bus, events} = collisionScenario({offset:1.65});
    const laneX = car.x;
    sim.state.time = 4; // Arrange for a red phase when the driver reaches the junction.
    for (let frame = 0; frame < hz && !events.length; frame++) sim.update(1/hz);
    assert.equal(events[0].type, 'collision');
    assert.ok(Math.abs(car.yawRate) > 1);
    assert.equal(bus.heading, 0);
    // Clear the obstruction as soon as the cars separate and follow the full recovery.
    Object.assign(bus, {x:0, y:110, speed:0});
    let maxOffset = 0, sawRecovery = false, wasDriving = false, stopped = false;
    const control = car.route.controls[0];
    for (let frame = 0; frame < hz*27; frame++) {
      const x = car.x, y = car.y;
      sim.update(1/hz);
      assert.ok(Math.hypot(car.x-x, car.y-y) < 25/hz, 'the car moves continuously throughout its return');
      maxOffset = Math.max(maxOffset, Math.abs(car.x-laneX));
      sawRecovery ||= car.mode === 'rejoining';
      wasDriving ||= sawRecovery && car.mode === 'driving' && car.speed > 5;
      if (control.light.aspect === 'red' && car.speed < .1 && Math.abs(control.at - car.location) < .5) stopped = true;
      if (stopped && control.light.aspect === 'green' && car.location > control.at+2) break;
    }
    assert.ok(maxOffset > 1 && sawRecovery && wasDriving);
    assert.ok(stopped && car.location > control.at+2, 'the recovered driver stops on red and leaves on green');
    assert.equal(events.length, 1);
  }
});

test('a car striking the side of the coach produces a lateral suspension impulse', () => {
  const {sim, bus, events} = collisionScenario({gap:-6, heading:Math.PI/2, busSpeed:0, carSpeed:7});
  const {x, y} = bus;
  tick(sim, .65);
  assert.equal(events.length, 1);
  assert.ok(events[0].side < -.99 && Math.abs(events[0].longitudinal) < .01);
  assert.ok(Math.abs(bus.motion.roll) > .001, 'the impact reaches the suspension during the collision substep');
  assert.equal(bus.x, x);
  assert.equal(bus.y, y);
});

test('a car pushed by the coach can transfer its momentum to another car', () => {
  const {sim, car, events} = collisionScenario({busSpeed:13, carSpeed:0, cruise:0});
  const next = {...car, id:20, y:car.y-8.5, location:car.location+8.5};
  sim.state.cars.push(next);
  const start = next.y;
  tick(sim, .9, {accelerate:true});
  assert.equal(next.mode, 'sliding');
  assert.ok(next.y < start-1 && next.vy < -3);
  assert.equal(events.length, 1, 'only contact involving the player triggers the notification');
});

test('reversing into a parked car pushes it backwards and slows the coach in reverse', () => {
  const {sim, car, bus, events} = collisionScenario({gap:-7.5, busSpeed:-4.2, carSpeed:0, cruise:0});
  const initialY = car.y;
  for (let frame = 0; frame < 60 && !events.length; frame++) sim.update(1/60, {brake:true});
  assert.equal(events[0].type, 'collision');
  assert.ok(events[0].longitudinal > .99, 'the bus receives a forward impulse through its rear bumper');
  assert.ok(bus.speed > -4.2 && bus.speed < -3.4);
  assert.ok(car.vy > 3.6 && Math.abs(car.yawRate) < .01);
  tick(sim, .6, {brake:true});
  assert.ok(car.y > initialY + 2 && bus.speed < 0);
  assert.equal(events.length, 1);
});

function boostScenario(options) {
  const sim = create(options);
  sim.state.cars = [];
  sim.state.cones = [];
  const {bus, boosts} = sim.state, bolt = boosts[0];
  function approach(offset = 0) {
    const cos = Math.cos(bolt.heading), sin = Math.sin(bolt.heading);
    Object.assign(bus, {heading:bolt.heading, speed:25, x:bolt.x-10*sin+offset*cos, y:bolt.y+10*cos+offset*sin});
  }
  return {sim, state:sim.state, bus, bolt, approach};
}

test('bolts occupy the centre of distinct city and country roads and can be passed on either side', () => {
  const {sim, state, approach} = boostScenario();
  const streets = new Set();
  for (const bolt of state.boosts) {
    const road = state.map.roads.find(({a, b}) => {
      const toA = Math.hypot(bolt.x-a.x, bolt.y-a.y), toB = Math.hypot(bolt.x-b.x, bolt.y-b.y);
      return Math.min(toA,toB) > 30 && Math.abs(toA+toB-Math.hypot(a.x-b.x,a.y-b.y)) < .001;
    });
    assert.ok(road && !streets.has(road));
    streets.add(road);
  }
  assert.equal(new Set([...streets].map(road => road.kind)).size, 2);
  assert.ok(streets.size < state.map.roads.length);
  for (const side of [-1,1]) {
    approach(3*side);
    tick(sim, 1);
    assert.equal(state.boost, 0);
  }
});

test('a collected bolt gives the arcade acceleration, speed bonus and duration while respecting the brake', () => {
  for (const braking of [false,true]) {
    const events = [];
    const {sim, state, bus, bolt, approach} = boostScenario({onEvent:e => events.push(e.type)});
    approach();
    driveUntil(sim, {accelerate:true}, () => state.boost > 0);
    assert.equal(state.boost, 4.2);
    assert.ok(bolt.respawnAt > state.time);
    assert.equal(events.filter(type => type === 'boost').length, 1);
    tick(sim, .5, {brake:braking});
    if (braking) {
      assert.ok(bus.speed < 25);
      continue;
    }
    assert.ok(Math.abs(bus.speed*3.6-108) < .01, '36 km/h gained per second while coasting');
    tick(sim, 3.6);
    assert.ok(state.boost > 0 && Math.abs(bus.speed*3.6-129) < .01);
    tick(sim, .2, {accelerate:true});
    assert.equal(state.boost, 0);
    assert.ok(bus.speed*3.6 > 100 && bus.speed*3.6 < 129, 'the boost wears off progressively');
    tick(sim, .8, {accelerate:true});
    assert.ok(Math.abs(bus.speed*3.6-90) < .01);
    assert.equal(state.earnings, 0);
  }
});

test('bolts draw a new 15–45 second cooldown per pickup and a parked bus must clear the bolt to collect again', () => {
  const events = [];
  let draw = .25;
  const {sim, state, bus, bolt} = boostScenario({random:() => draw, onEvent:e => events.push(e.type)});
  Object.assign(bus, {x:bolt.x, y:bolt.y, heading:bolt.heading, speed:0});
  for (const value of [0,.5,.9999]) {
    draw = value;
    const previous = events.filter(type => type === 'boost').length;
    sim.update(1/60);
    assert.equal(events.filter(type => type === 'boost').length, previous + 1);
    assert.ok(Math.abs(bolt.respawnAt-state.time-(15+30*value)) < 1e-8);
    assert.ok(state.boosts.slice(1).every(other => !other.respawnAt));
    tick(sim, bolt.respawnAt-state.time-.1);
    assert.ok(bolt.respawnAt > state.time);
    tick(sim, .2);
    assert.equal(bolt.respawnAt, 0);
    assert.equal(state.boost, 0, 'the visible bolt stays available underneath a parked bus');
    assert.equal(events.filter(type => type === 'boost').length, previous + 1);
    bus.y = bolt.y + 12;
    sim.update(1/60);
    bus.y = bolt.y;
  }
});
