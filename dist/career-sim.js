(() => {
  'use strict';

  const fare = 3;
  const capacity = 24;
  const topSpeed = 90 / 3.6;
  const turbo = window.BusBoost;
  const coneLimit = 6;
  const metresPerFuelPercent = 40;
  const refillPercentPerSecond = 20;
  const pumpRadius = 3.5;
  const countryRoadWidth = 13, countryVergeWidth = 4;
  const countryRoadside = countryRoadWidth / 2 + countryVergeWidth + .65;
  const coats = ['#ef795e', '#43ac9d', '#f2bc45', '#9475cc', '#507dd1', '#e796bd'];
  const carPaint = ['#f4b84a', '#539fac', '#ee795d', '#9f91cd', '#6896c7', '#eee6ce'];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function direction(a, b) {
    const length = distance(a, b);
    return {x: (b.x - a.x) / length, y: (b.y - a.y) / length};
  }

  function offset(origin, forward, along, right) {
    return {x: origin.x + along * forward.x - right * forward.y,
      y: origin.y + along * forward.y + right * forward.x};
  }

  function forwardOf(heading) {
    return {x: Math.sin(heading), y: -Math.cos(heading)};
  }

  function makeMap() {
    const locations = {
      NW: [-200, -220], N: [0, -220], NE: [190, -220],
      W: [-200, 0], C: [0, 0], E: [190, 0],
      SW: [-200, 230], S: [0, 230], SE: [190, 230],
      mill: [410, -272], hill: [660, -164], orchard: [652, 116],
      farm: [428, 294], fork: [414, 32]
    };
    const nodes = Object.entries(locations).map(([id, [x, y]]) => ({id, x, y}));
    const byId = Object.fromEntries(nodes.map(node => [node.id, node]));
    const roads = [];
    function street(from, to, kind) {
      const urban = kind === 'city';
      roads.push({a: byId[from], b: byId[to], kind, width: urban ? 17 : countryRoadWidth,
        vergeWidth: urban ? 2.8 : countryVergeWidth});
    }
    for (const row of [['NW', 'N', 'NE'], ['W', 'C', 'E'], ['SW', 'S', 'SE'],
      ['NW', 'W', 'SW'], ['N', 'C', 'S'], ['NE', 'E', 'SE']]) {
      street(row[0], row[1], 'city');
      street(row[1], row[2], 'city');
    }
    for (const [a, b] of [['NE', 'mill'], ['mill', 'hill'], ['hill', 'orchard'],
      ['orchard', 'farm'], ['farm', 'SE'], ['E', 'fork'], ['fork', 'mill'],
      ['fork', 'orchard'], ['fork', 'farm']]) street(a, b, 'country');
    const map = {nodes, roads, byId, townEdge: 200, bounds: {minX: -262, minY: -330, maxX: 720, maxY: 354}};
    map.fuelStations = [
      {id:'centre', name:'Relais du Centre', ...roadPosition(map, 'C', 'E', .47, 9.15)},
      {id:'vergers', name:'Relais des Vergers', ...roadPosition(map, 'fork', 'orchard', .55, 8.35)}
    ];
    return map;
  }

  // The lateral offset is measured in metres to the right of the direction of travel.
  function roadPosition(map, from, to, fraction, lateral = 0) {
    const a = map.byId[from], b = map.byId[to], axis = direction(a, b);
    return {...offset(a, axis, distance(a, b) * fraction, lateral), heading: Math.atan2(axis.x, -axis.y)};
  }

  function makeStops(map) {
    const cityDemand = {minInterval:45, maxInterval:75, limit:3};
    const countryDemand = {minInterval:70, maxInterval:110, limit:2};
    const places = [
      ['gare', 'Gare centrale', 'S', 'C', 55 / 115, 9.2],
      ['marche', 'Place du Marché', 'C', 'N', 53 / 110, 9.2],
      ['musee', 'Musée des Arts', 'NW', 'W', .53, 9.2],
      ['parc', 'Parc des Tilleuls', 'SW', 'S', .46, 9.2],
      ['halles', 'Les Halles', 'E', 'SE', .4, 9.2],
      ['moulin', 'Vieux Moulin', 'NE', 'mill', .65, countryRoadside],
      ['verger', 'Les Vergers', 'hill', 'orchard', .46, countryRoadside],
      ['ferme', 'Ferme des Prés', 'farm', 'SE', .42, countryRoadside]
    ];
    return places.map(([id, name, from, to, fraction, margin]) => {
      const position = roadPosition(map, from, to, fraction, margin);
      const demand = position.x <= map.townEdge ? cityDemand : countryDemand;
      return {id, name, ...position, demand, waiting:[], nextArrival:0};
    });
  }

  function makeSignals(map) {
    const lights = [];
    for (const [junction, approaches, shift] of [
      ['C', ['N', 'S', 'E', 'W'], 0], ['E', ['C', 'NE', 'SE', 'fork'], 7]
    ]) {
      for (const from of approaches) {
        const end = map.byId[junction], axis = direction(map.byId[from], end);
        const group = Math.abs(axis.y) > Math.abs(axis.x) ? 0 : 1;
        const margin = from === 'fork' ? countryRoadside : 9.1;
        lights.push({...offset(end, axis, -10, margin), heading: Math.atan2(axis.x, -axis.y),
          from, to: junction, group, shift, aspect: 'red'});
      }
    }
    const signs = [
      ['speed30', 'S', 'C', .75, 9.1], ['crossing', 'C', 'N', .23, 9.1],
      ['stop', 'W', 'NW', .91, 9.1], ['stop', 'SE', 'S', .90, 9.1],
      ['speed50', 'NE', 'mill', .23, countryRoadside], ['crossing', 'NW', 'W', .28, 9.1],
      ['stop', 'farm', 'fork', .93, countryRoadside], ['speed30', 'mill', 'NE', .85, countryRoadside]
    ].map(([kind, from, to, fraction, margin]) => ({kind, from, to, ...roadPosition(map, from, to, fraction, margin)}));
    return {lights, signs};
  }

  function updateLights(state) {
    for (const light of state.lights) {
      // Both directions see red for one second before the cross traffic moves.
      const phase = (state.time + light.shift + light.group * 13) % 26;
      light.aspect = phase < 10 ? 'green' : phase < 12 ? 'amber' : 'red';
    }
  }

  // Trace each right-hand lane with a short Bézier arc through each intersection.
  // Distances along the resulting loop also locate the stop lines used by the AI.
  function trafficLoop(ids, state) {
    const nodes = ids.map(id => state.map.byId[id]);
    const points = [], controls = [];
    let length = 0;
    function append(point) {
      if (points.length) length += distance(points[points.length - 1], point);
      points.push({...point, at: length});
    }
    const lanes = nodes.map((a, i) => {
      const b = nodes[(i + 1) % nodes.length], axis = direction(a, b);
      const road = state.map.roads.find(r => (r.a === a && r.b === b) || (r.a === b && r.b === a));
      const lateral = road.width * .205;
      return {a, b, axis, lateral, entry: offset(a, axis, 9, lateral), end: offset(b, axis, -9, lateral)};
    });
    for (const [i, lane] of lanes.entries()) {
      const next = lanes[(i + 1) % lanes.length];
      if (!i) append(lane.entry);
      append(lane.end);
      const light = state.lights.find(item => item.from === lane.a.id && item.to === lane.b.id);
      const sign = state.signs.find(item => item.kind === 'stop' && item.from === lane.a.id && item.to === lane.b.id);
      if (light || sign) controls.push({at: length - 4, light});
      const mid1 = offset(lane.b, lane.axis, 0, lane.lateral), mid2 = offset(lane.b, next.axis, 0, next.lateral);
      const center = {x: (mid1.x + mid2.x) / 2, y: (mid1.y + mid2.y) / 2};
      for (let k = 1; k <= 8; k++) {
        const t = k / 8, u = 1 - t;
        append({x: u*u*lane.end.x + 2*u*t*center.x + t*t*next.entry.x,
          y: u*u*lane.end.y + 2*u*t*center.y + t*t*next.entry.y});
      }
    }
    return {points, length, controls};
  }

  function routePose(route, location) {
    const points = route.points;
    let lo = 1, hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (points[mid].at < location) lo = mid + 1;
      else hi = mid;
    }
    const a = points[lo - 1], b = points[lo], t = (location - a.at) / (b.at - a.at);
    return {x:a.x + (b.x - a.x)*t, y:a.y + (b.y - a.y)*t, heading:Math.atan2(b.x - a.x, a.y - b.y)};
  }

  function makeTraffic(state) {
    const itineraries = [
      ['S', 'C', 'N', 'NW', 'W', 'SW'], ['N', 'C', 'E', 'NE'],
      ['SE', 'S', 'SW', 'W', 'C', 'E'], ['NE', 'mill', 'hill', 'orchard', 'fork', 'E'],
      ['farm', 'fork', 'mill', 'NE', 'E', 'SE'], ['W', 'NW', 'N', 'C']
    ];
    const cars = [];
    itineraries.forEach((ids, i) => {
      const route = trafficLoop(ids, state);
      [0.16 + .055 * i, .73 + .021 * i].forEach(fraction => {
        const id = cars.length;
        const car = {id, color: carPaint[id % carPaint.length], route, location: route.length * fraction,
          cruise:7.5 + (id % 4), speed:5, stoppedAt:null, wait:0, mode:'driving',
          recoverAt:0, busContactAt:-Infinity, yieldToBus:false, yawRate:0};
        Object.assign(car, routePose(route, car.location));
        car.vx = Math.sin(car.heading)*car.speed;
        car.vy = -Math.cos(car.heading)*car.speed;
        cars.push(car);
      });
    });
    return cars;
  }

  function trafficSpeed(car, state, dt, heading = car.heading) {
    if (car.wait > 0) {
      car.wait -= dt;
      return 0;
    }
    let speed = car.cruise;
    for (const control of car.route.controls) {
      const ahead = (control.at - car.location + car.route.length) % car.route.length;
      if (ahead > 25) {
        if (car.stoppedAt === control && ahead < car.route.length - 6) car.stoppedAt = null;
        continue;
      }
      if (control.light ? control.light.aspect === 'green' : car.stoppedAt === control) continue;
      if (ahead < .45 && !control.light) { car.stoppedAt = control; car.wait = 1.1; }
      speed = Math.min(speed, Math.sqrt(7 * Math.max(0, ahead - .12)));
    }
    const forward = forwardOf(heading);
    function follow(vehicle, gap, yieldRegardlessOfDirection = false) {
      if (vehicle === car || (!yieldRegardlessOfDirection && Math.cos(vehicle.heading - heading) < .75)) return;
      const dx = vehicle.x - car.x, dy = vehicle.y - car.y;
      const along = dx * forward.x + dy * forward.y;
      const across = Math.abs(-dx * forward.y + dy * forward.x);
      if (along > 0 && along < 22 && across < 2.15) {
        speed = Math.min(speed, Math.max(0, (along - gap) * .85 + Math.max(0, vehicle.vx*forward.x + vehicle.vy*forward.y)));
      }
    }
    if (car.yieldToBus && distance(state.bus, car) > 22) car.yieldToBus = false;
    follow(state.bus, 8.5, car.yieldToBus);
    for (const other of state.cars) follow(other, 5.6);
    return speed;
  }

  function yawDelta(to, from) {
    return Math.atan2(Math.sin(to-from), Math.cos(to-from));
  }

  function closestRouteLocation(car) {
    const {points, length} = car.route;
    let best = Infinity, location = car.location;
    for (let i = 1; i < points.length; i++) {
      const a = points[i-1], b = points[i];
      const dx = b.x-a.x, dy = b.y-a.y;
      const t = clamp(((car.x-a.x)*dx + (car.y-a.y)*dy) / (dx*dx + dy*dy), 0, 1);
      const error = (car.x-a.x-t*dx)**2 + (car.y-a.y-t*dy)**2;
      if (error < best) {
        best = error;
        location = a.at + t*(b.at-a.at);
      }
    }
    return location % length;
  }

  function rejoinLane(car, state, dt) {
    car.location = closestRouteLocation(car);
    const lane = routePose(car.route, car.location), forward = forwardOf(lane.heading);
    const right = {x:-forward.y, y:forward.x};
    const across = (lane.x-car.x)*right.x + (lane.y-car.y)*right.y;
    const along = car.vx*forward.x + car.vy*forward.y, lateral = car.vx*right.x + car.vy*right.y;
    const wanted = trafficSpeed(car, state, dt, lane.heading);
    const speed = along + clamp(wanted - along, -6*dt, 2.2*dt);
    const correction = clamp(1.15*across, -3.5, 3.5);
    const sideways = lateral + clamp(correction-lateral, -3.5*dt, 3.5*dt);
    car.vx = forward.x*speed + right.x*sideways;
    car.vy = forward.y*speed + right.y*sideways;
    const bearing = lane.heading + Math.atan2(sideways, Math.max(2, speed));
    car.yawRate = clamp(3.6*yawDelta(bearing, car.heading), -1.65, 1.65);
    car.heading += car.yawRate*dt;
    car.x += car.vx*dt;
    car.y += car.vy*dt;
    car.speed = Math.max(0, speed);
    if (Math.abs(across) < .018 && Math.abs(yawDelta(lane.heading, car.heading)) < .012) {
      car.location = closestRouteLocation(car);
      car.mode = 'driving';
    }
  }

  function moveTraffic(car, state, dt) {
    if (car.mode === 'sliding') {
      if (state.time < car.recoverAt) {
        window.CareerPhysics.slide(car, dt);
        return;
      }
      car.mode = 'rejoining';
    }
    if (car.mode === 'rejoining') {
      rejoinLane(car, state, dt);
      return;
    }
    const wanted = trafficSpeed(car, state, dt);
    car.speed += clamp(wanted - car.speed, -6*dt, 2.2*dt);
    car.location = (car.location + car.speed*dt) % car.route.length;
    const oldHeading = car.heading;
    Object.assign(car, routePose(car.route, car.location));
    car.vx = Math.sin(car.heading)*car.speed;
    car.vy = -Math.cos(car.heading)*car.speed;
    car.yawRate = clamp(yawDelta(car.heading, oldHeading)/dt, -1.5, 1.5);
  }

  function dislodge(car, strength, time) {
    if (strength > .55 || car.mode === 'driving') {
      car.mode = 'sliding';
      car.recoverAt = time + 2.3;
      car.wait = 0;
    }
  }

  function nearestRoad(position, roads) {
    let nearest = null;
    let best = Infinity;
    for (const road of roads) {
      const dx = road.b.x - road.a.x, dy = road.b.y - road.a.y;
      const t = clamp(((position.x - road.a.x) * dx + (position.y - road.a.y) * dy) / (dx*dx + dy*dy), 0, 1);
      const x = road.a.x + t*dx, y = road.a.y + t*dy;
      const lateral = Math.hypot(x - position.x, y - position.y);
      // Leave half the coach width between its centre and the outer edge of the verge.
      const limit = road.width / 2 + road.vergeWidth - 1.35;
      const over = lateral - limit;
      if (over < best) { best = over; nearest = {x, y, lateral, over}; }
    }
    return nearest;
  }

  function drive(state, dt, input, brakeHeldAtStop) {
    const bus = state.bus;
    if (state.doorsOpen || state.refueling) return;
    let acceleration = 0;
    if (input.brake) acceleration = bus.speed > .15 ? -13.5 : -3.5;
    else if (state.boost && (bus.speed > .4 || (input.accelerate && bus.speed >= 0))) acceleration = turbo.acceleration / 3.6;
    else if (input.accelerate) acceleration = bus.speed < -.15 ? 9 : 6.6;
    const limit = topSpeed + (state.boost ? turbo.speedBonus / 3.6 : 0);
    if (bus.speed > limit) bus.speed = Math.max(limit, bus.speed - turbo.deceleration / 3.6 * dt);
    else if (acceleration && !brakeHeldAtStop) bus.speed = clamp(bus.speed + acceleration * dt, -4.2, limit);
    else bus.speed = Math.sign(bus.speed) * Math.max(0, Math.abs(bus.speed) - (.85 + .003 * bus.speed * bus.speed) * dt);
    const drag = clamp(input.steer || 0, -1, 1);
    const steering = Math.max(drag, Number(!!input.right)) - Math.max(-drag, Number(!!input.left));
    const yaw = window.BusHandling.steeringYaw(bus, steering, bus.speed * 3.6, bus.speed * dt, dt);
    const axis = forwardOf(bus.heading + yaw / 2);
    bus.heading += yaw;
    const previous = {x: bus.x, y: bus.y};
    bus.x += bus.speed * axis.x * dt;
    bus.y += bus.speed * axis.y * dt;
    const edge = nearestRoad(bus, state.map.roads);
    if (edge.over > 0) {
      bus.x += (edge.x - bus.x) * edge.over / edge.lateral;
      bus.y += (edge.y - bus.y) * edge.over / edge.lateral;
      bus.speed *= Math.exp(-3.8 * dt);
    }
    const travelled = distance(bus, previous);
    const range = state.fuel * metresPerFuelPercent;
    if (travelled > range) {
      // Stop at the last reachable point, even if this step would cross a pump.
      const fraction = range / travelled;
      bus.x = previous.x + (bus.x - previous.x) * fraction;
      bus.y = previous.y + (bus.y - previous.y) * fraction;
    }
    state.distance += Math.min(travelled, range);
    state.fuel = travelled >= range ? 0 : state.fuel - travelled / metresPerFuelPercent;
  }

  function coneSites(map, stops, random) {
    const sites = [];
    for (const road of map.roads) {
      const axis = direction(road.a, road.b), length = distance(road.a, road.b);
      for (const fraction of [.25, .5, .75]) {
        for (const side of [-1, 1]) {
          const along = length * (fraction + (random() - .5) * .10);
          const lateral = side * road.width * (.32 + .07 * random());
          const point = offset(road.a, axis, along, lateral);
          if (stops.some(stop => distance(point, stop) < 21)) continue;
          if (map.fuelStations.some(station => distance(point, station) < 15)) continue;
          if (map.nodes.some(node => distance(point, node) < 18)) continue;
          sites.push({...point, road, lateral, heading:Math.atan2(axis.x, -axis.y)});
        }
      }
    }
    return sites;
  }

  function pickConeSite(state, sites, random, initial) {
    const options = sites.filter(site => {
      const range = distance(site, state.bus);
      if (range < (initial ? 26 : 85)) return false;
      if (!initial && range < 210) {
        const ahead = forwardOf(state.bus.heading);
        if ((site.x - state.bus.x) * ahead.x + (site.y - state.bus.y) * ahead.y > range * .35) return false;
      }
      if (state.cars.some(car => distance(car, site) < 6)) return false;
      return state.cones.every(other => other.road !== site.road && distance(other, site) >= 34);
    });
    return options[Math.floor(random() * options.length)];
  }

  function touchesBus(bus, item, radius) {
    const dx = item.x - bus.x, dy = item.y - bus.y;
    if (dx*dx + dy*dy > 36) return false;
    const axis = forwardOf(bus.heading);
    const along = dx * axis.x + dy * axis.y;
    const across = dy * axis.x - dx * axis.y;
    return Math.hypot(Math.max(0, Math.abs(along) - 4.6), Math.max(0, Math.abs(across) - 1.35)) <= radius;
  }

  function makeBoosts(map) {
    const passages = [['S', 'C', .71], ['W', 'NW', .34], ['E', 'SE', .68],
      ['mill', 'hill', .42], ['fork', 'farm', .56], ['orchard', 'farm', .4]];
    return passages.map(([from, to, fraction], id) =>
      ({id, ...roadPosition(map, from, to, fraction), respawnAt:0, touching:false}));
  }

  function updateBoosts(state, random, onEvent) {
    for (const pickup of state.boosts) {
      if (pickup.respawnAt && state.time >= pickup.respawnAt) pickup.respawnAt = 0;
      const touching = touchesBus(state.bus, pickup, .57);
      // Track contact during the cooldown too, so parking on a bolt cannot retrigger it.
      if (!pickup.respawnAt && touching && !pickup.touching) {
        state.boost = turbo.duration;
        pickup.respawnAt = state.time + 15 + 30 * random();
        onEvent({type:'boost', message:'Turbo'});
      }
      pickup.touching = touching;
    }
  }

  function updateCones(state, sites, random, onEvent) {
    const bus = state.bus;
    for (const cone of state.cones) {
      if (cone.hit) {
        if (state.time < cone.respawnAt) continue;
        const site = pickConeSite(state, sites, random, false);
        if (site) Object.assign(cone, site, {hit:null});
        else cone.respawnAt = state.time + 2;
        continue;
      }
      if (Math.abs(bus.speed) < .01 || !touchesBus(bus, cone, .46)) continue;
      const dx = cone.x - bus.x, dy = cone.y - bus.y;
      const heading = bus.heading + (bus.speed < 0 ? Math.PI : 0);
      const forward = forwardOf(heading);
      const across = dy * forward.x - dx * forward.y;
      const side = across < 0 ? -1 : 1;
      const axis = direction(cone.road.a, cone.road.b);
      const vergeSide = side * Math.sign(axis.x * forward.x + axis.y * forward.y);
      const toVerge = Math.max(2.2, cone.road.width / 2 - vergeSide * cone.lateral + 1.9);
      cone.hit = {start:state.time, duration:.95, speed:Math.abs(bus.speed), heading, side, toVerge};
      cone.respawnAt = state.time + cone.hit.duration + 8 + random() * 8;
      bus.speed *= .75;
      onEvent({type:'cone', message:'Cône renversé · Bus ralenti'});
    }
  }

  function create({onEvent = () => {}, random = Math.random} = {}) {
    const map = makeMap(), stops = makeStops(map);
    const depot = stops[0], spawn = offset(depot, forwardOf(depot.heading), -2, -4);
    const bus = {...spawn, heading:depot.heading, speed:0, steer:0, vx:0, vy:0, yawRate:0,
      motion:window.CareerMotion.create()};
    const state = {map, stops, ...makeSignals(map), bus,
      boost:0, boosts:makeBoosts(map),
      time: 0, distance: 0, earnings: 0, passengers: [], people: [], doorsOpen: false, serviceComplete: false,
      fuel:100, nearbyFuelStation:null, refueling:false, outOfFuel:false,
      nearbyStop: stops[0], district: 'Centre-ville', collisions: 0, cones: []};
    state.cars = makeTraffic(state);
    const sites = coneSites(map, stops, random);
    for (let id = 0; id < coneLimit; id++) {
      const site = pickConeSite(state, sites, random, true);
      if (site) state.cones.push({id, ...site, hit:null});
    }
    updateLights(state);
    let serial = 0, brakeHeldAtStop = false, filledHere = false;
    function queuePassenger(stop) {
      let index = 0;
      while (stop.waiting.some(person => person.slot === index)) index++;
      const number = serial++;
      const choices = stops.filter(item => item !== stop);
      const dest = choices[(index === 0 ? stops.indexOf(stop) : number + index) % choices.length];
      const side = index % 2 === 0 ? .8 : 1.6;
      const position = offset(stop, forwardOf(stop.heading), -1.6 - 1.15 * index, side);
      stop.waiting.push({id: number, slot:index, color: coats[number % coats.length], destination: dest.id, ...position});
    }
    function scheduleArrival(stop, opening = false) {
      const {minInterval, maxInterval} = stop.demand;
      const delay = opening ? minInterval * (.3 + .7 * random()) : minInterval + random() * (maxInterval - minInterval);
      stop.nextArrival = state.time + delay;
    }
    queuePassenger(depot);
    for (const stop of stops) scheduleArrival(stop, stop !== depot);

    function setNearbyStop() {
      let nearest = null, best = 9.5;
      for (const stop of state.stops) {
        const d = distance(state.bus, stop);
        if (d < best) { best = d; nearest = stop; }
      }
      if (nearest !== state.nearbyStop) state.serviceComplete = false;
      state.nearbyStop = nearest;
      state.district = state.bus.x > map.townEdge ? 'Campagne' : 'Centre-ville';
    }

    function startTransfer(stop) {
      const leaving = state.passengers.find(p => p.destination === stop.id);
      const person = leaving || (state.passengers.length < capacity && stop.waiting.shift());
      if (!person) return false;
      const door = offset(state.bus, forwardOf(state.bus.heading), 2.7, 1.45);
      const sidewalk = offset(stop, forwardOf(stop.heading), 1 + (person.id % 2), 2.3);
      const start = leaving ? door : {x:person.x, y:person.y};
      state.people.push({...person, ...start, phase:leaving ? 'alighting' : 'boarding',
        progress:0, start, end:leaving ? sidewalk : door});
      return true;
    }

    function readyToPark(input, previousSpeed) {
      const pullingAway = input.accelerate && !input.brake && previousSpeed >= 0;
      return Math.abs(bus.speed) <= .4 && !pullingAway;
    }

    function updateFuelStop(dt, input, previousSpeed) {
      const station = map.fuelStations.find(pump => distance(bus, pump) <= pumpRadius) || null;
      if (state.nearbyFuelStation !== station) {
        state.nearbyFuelStation = station;
        filledHere = false;
        state.refueling = false;
      }
      if (!station) {
        if (state.fuel === 0) {
          bus.speed = bus.vx = bus.vy = bus.yawRate = 0;
          state.outOfFuel = true;
          state.boost = 0;
          onEvent({type:'fuel-empty'});
        }
        return;
      }
      if (state.fuel >= 100) return;
      if (!state.refueling) {
        if (state.fuel > 0 && (filledHere || !readyToPark(input, previousSpeed))) return;
        bus.speed = 0;
        state.refueling = true;
      }
      state.fuel = Math.min(100, state.fuel + refillPercentPerSecond * dt);
      if (state.fuel === 100) {
        state.refueling = false;
        filledHere = true;
        brakeHeldAtStop = !!input.brake;
        onEvent({type:'refueled', stationName:station.name});
      }
    }

    function updateService(dt, input, previousSpeed) {
      const stop = state.nearbyStop;
      if (!stop || state.serviceComplete) return;
      if (!state.doorsOpen) {
        if (!readyToPark(input, previousSpeed)) return;
        if (!startTransfer(stop)) {
          state.serviceComplete = true;
          return;
        }
        bus.speed = 0;
        state.doorsOpen = true;
        onEvent({type:'doors', message:'Portes ouvertes · ' + stop.name});
      }
      const person = state.people[0];
      person.progress = Math.min(1, person.progress + dt / .95);
      person.x = person.start.x + (person.end.x - person.start.x) * person.progress;
      person.y = person.start.y + (person.end.y - person.start.y) * person.progress;
      if (person.progress < 1) return;
      state.people.pop();
      if (person.phase === 'boarding') {
        state.passengers.push({id: person.id, color: person.color, destination: person.destination});
        state.earnings += fare;
        onEvent({type: 'boarding', fare, stopName: stop.name, message: 'Passager à bord · +' + fare + ' €$'});
      } else {
        state.passengers = state.passengers.filter(p => p.id !== person.id);
        onEvent({type: 'alighting', stopName: stop.name, message: 'Descente · ' + stop.name});
      }
      if (!startTransfer(stop)) {
        state.doorsOpen = false;
        state.serviceComplete = true;
        scheduleArrival(stop);
        // A brake held throughout boarding keeps the bus parked until released.
        brakeHeldAtStop = !!input.brake;
        onEvent({type: 'doors', message: 'Portes fermées · Bonne route !'});
      }
    }

    function step(dt, input) {
      state.time += dt;
      state.boost = Math.max(0, state.boost - dt);
      updateLights(state);
      const oldX = bus.x, oldY = bus.y, oldHeading = bus.heading, oldSpeed = bus.speed;
      if (!input.brake) brakeHeldAtStop = false;
      drive(state, dt, input, brakeHeldAtStop);
      bus.vx = (bus.x - oldX)/dt;
      bus.vy = (bus.y - oldY)/dt;
      bus.yawRate = (bus.heading - oldHeading)/dt;
      updateFuelStop(dt, input, oldSpeed);
      if (state.outOfFuel) return;
      for (const stop of stops) {
        if (state.time < stop.nextArrival) continue;
        scheduleArrival(stop);
        if (stop.waiting.length >= stop.demand.limit || (state.doorsOpen && stop === state.nearbyStop)) continue;
        queuePassenger(stop);
        if (stop === state.nearbyStop) state.serviceComplete = false;
      }
      for (const car of state.cars) moveTraffic(car, state, dt);
      for (const car of state.cars) {
        const hit = window.CareerPhysics.collideBus(bus, car);
        if (!hit) continue;
        car.yieldToBus = true;
        dislodge(car, hit.strength, state.time);
        if (hit.strength > .55 && state.time - car.busContactAt > .45) {
          state.collisions++;
          window.CareerMotion.impact(bus, hit);
          onEvent({type:'collision', message:'Accrochage !', ...hit});
        }
        car.busContactAt = state.time;
      }
      // A displaced car can also knock a neighbouring vehicle out of its lane.
      for (let i = 0; i < state.cars.length; i++) {
        const a = state.cars[i];
        for (let j = i+1; j < state.cars.length; j++) {
          const b = state.cars[j];
          if (a.mode === 'driving' && b.mode === 'driving') continue;
          const hit = window.CareerPhysics.collideCars(a, b);
          if (hit) {
            dislodge(a, hit.strength, state.time);
            dislodge(b, hit.strength, state.time);
          }
        }
      }
      updateCones(state, sites, random, onEvent);
      updateBoosts(state, random, onEvent);
      setNearbyStop();
      updateService(dt, input, oldSpeed);
      window.CareerMotion.update(bus, dt, oldSpeed, input);
    }

    function update(seconds, input = {}) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      // Keep physics stable across refresh rates and discard time spent in inactive tabs.
      const activeTime = Math.min(seconds, .25);
      const count = Math.ceil(activeTime * 30);
      for (let i = 0; i < count && !state.outOfFuel; i++) step(activeTime / count, input);
    }
    return {state, update};
  }
  window.CareerSim = Object.freeze({create});
})();
