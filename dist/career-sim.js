(() => {
  'use strict';

  const fare = 3;
  const capacity = 24;
  const topSpeed = 90 / 3.6;
  const coneLimit = 6;
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
      NW: [-100, -110], N: [0, -110], NE: [95, -110],
      W: [-100, 0], C: [0, 0], E: [95, 0],
      SW: [-100, 115], S: [0, 115], SE: [95, 115],
      mill: [205, -136], hill: [330, -82], orchard: [326, 58],
      farm: [214, 147], fork: [207, 16]
    };
    const nodes = Object.entries(locations).map(([id, [x, y]]) => ({id, x, y}));
    const byId = Object.fromEntries(nodes.map(node => [node.id, node]));
    const roads = [];
    function street(from, to, kind) {
      const urban = kind === 'city';
      roads.push({a: byId[from], b: byId[to], kind, width: urban ? 17 : 13, vergeWidth: urban ? 2.8 : 1.25});
    }
    for (const row of [['NW', 'N', 'NE'], ['W', 'C', 'E'], ['SW', 'S', 'SE'],
      ['NW', 'W', 'SW'], ['N', 'C', 'S'], ['NE', 'E', 'SE']]) {
      street(row[0], row[1], 'city');
      street(row[1], row[2], 'city');
    }
    for (const [a, b] of [['NE', 'mill'], ['mill', 'hill'], ['hill', 'orchard'],
      ['orchard', 'farm'], ['farm', 'SE'], ['E', 'fork'], ['fork', 'mill'],
      ['fork', 'orchard'], ['fork', 'farm']]) street(a, b, 'country');
    return {nodes, roads, byId, townEdge: 100, bounds: {minX: -131, minY: -165, maxX: 360, maxY: 177}};
  }

  // Sidewalk furniture faces traffic coming from 'from'. x and y are metres.
  function roadside(map, from, to, fraction, setback) {
    const a = map.byId[from], b = map.byId[to], axis = direction(a, b);
    return {...offset(a, axis, distance(a, b) * fraction, setback), heading: Math.atan2(axis.x, -axis.y)};
  }

  function makeStops(map) {
    const places = [
      ['gare', 'Gare centrale', 'S', 'C', 55 / 115, 9.2],
      ['marche', 'Place du Marché', 'C', 'N', 53 / 110, 9.2],
      ['musee', 'Musée des Arts', 'NW', 'W', .53, 9.2],
      ['parc', 'Parc des Tilleuls', 'SW', 'S', .46, 9.2],
      ['halles', 'Les Halles', 'E', 'SE', .4, 9.2],
      ['moulin', 'Vieux Moulin', 'NE', 'mill', .65, 7.3],
      ['verger', 'Les Vergers', 'hill', 'orchard', .46, 7.3],
      ['ferme', 'Ferme des Prés', 'farm', 'SE', .42, 7.3]
    ];
    return places.map(([id, name, from, to, fraction, margin]) =>
      ({id, name, ...roadside(map, from, to, fraction, margin), waiting: [], nextArrival: 0}));
  }

  function makeSignals(map) {
    const lights = [];
    for (const [junction, approaches, shift] of [
      ['C', ['N', 'S', 'E', 'W'], 0], ['E', ['C', 'NE', 'SE', 'fork'], 7]
    ]) {
      for (const from of approaches) {
        const end = map.byId[junction], axis = direction(map.byId[from], end);
        const group = Math.abs(axis.y) > Math.abs(axis.x) ? 0 : 1;
        const margin = from === 'fork' ? 7.5 : 9.1;
        lights.push({...offset(end, axis, -10, margin), heading: Math.atan2(axis.x, -axis.y),
          from, to: junction, group, shift, aspect: 'red'});
      }
    }
    const signs = [
      ['speed30', 'S', 'C', .75, 9.1], ['crossing', 'C', 'N', .23, 9.1],
      ['stop', 'W', 'NW', .91, 9.1], ['stop', 'SE', 'S', .90, 9.1],
      ['speed50', 'NE', 'mill', .23, 7.3], ['crossing', 'NW', 'W', .28, 9.1],
      ['stop', 'farm', 'fork', .93, 7.3], ['speed30', 'mill', 'NE', .85, 7.3]
    ].map(([kind, from, to, fraction, margin]) => ({kind, from, to, ...roadside(map, from, to, fraction, margin)}));
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

  function poseCar(car) {
    const points = car.route.points;
    let lo = 1, hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (points[mid].at < car.location) lo = mid + 1;
      else hi = mid;
    }
    const a = points[lo - 1], b = points[lo], t = (car.location - a.at) / (b.at - a.at);
    car.x = a.x + (b.x - a.x) * t;
    car.y = a.y + (b.y - a.y) * t;
    car.heading = Math.atan2(b.x - a.x, a.y - b.y);
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
          cruise: 7.5 + (id % 4), speed: 5, stoppedAt: null, wait: 0, contact: false};
        poseCar(car);
        cars.push(car);
      });
    });
    return cars;
  }

  function trafficSpeed(car, state, dt) {
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
    const forward = forwardOf(car.heading);
    function follow(vehicle, gap) {
      if (vehicle === car || Math.cos(vehicle.heading - car.heading) < .75) return;
      const dx = vehicle.x - car.x, dy = vehicle.y - car.y;
      const along = dx * forward.x + dy * forward.y;
      const across = Math.abs(-dx * forward.y + dy * forward.x);
      if (along > 0 && along < 22 && across < 2.15) {
        speed = Math.min(speed, Math.max(0, (along - gap) * .85 + Math.max(0, vehicle.speed)));
      }
    }
    follow(state.bus, 8.5);
    for (const other of state.cars) follow(other, 5.6);
    return speed;
  }

  // Separating-axis test for a 9.2 x 2.7 m bus against a 4.1 x 1.85 m car.
  function touching(bus, car) {
    const dx = bus.x - car.x, dy = bus.y - car.y;
    if (dx*dx + dy*dy > 52) return false;
    const busForward = forwardOf(bus.heading), carForward = forwardOf(car.heading);
    const busRight = {x: -busForward.y, y: busForward.x}, carRight = {x: -carForward.y, y: carForward.x};
    function span(a, b) { return Math.abs(a.x * b.x + a.y * b.y); }
    return [busForward, busRight, carForward, carRight].every(axis =>
      Math.abs(dx * axis.x + dy * axis.y) < 4.6 * span(axis, busForward) + 1.35 * span(axis, busRight)
        + 2.05 * span(axis, carForward) + .925 * span(axis, carRight));
  }

  function nearestRoad(position, roads) {
    let nearest = null;
    let best = Infinity;
    for (const road of roads) {
      const dx = road.b.x - road.a.x, dy = road.b.y - road.a.y;
      const t = clamp(((position.x - road.a.x) * dx + (position.y - road.a.y) * dy) / (dx*dx + dy*dy), 0, 1);
      const x = road.a.x + t*dx, y = road.a.y + t*dy;
      const lateral = Math.hypot(x - position.x, y - position.y);
      // The centre can cross a city curb, leaving half the bus width to the outer edge.
      const limit = road.width / 2 + (road.kind === 'city' ? road.vergeWidth - 1.35 : -1.1);
      const over = lateral - limit;
      if (over < best) { best = over; nearest = {x, y, lateral, over}; }
    }
    return nearest;
  }

  function drive(state, dt, input) {
    const bus = state.bus;
    if (state.doorsOpen) return;
    let acceleration = 0;
    if (input.brake) acceleration = bus.speed > .15 ? -13.5 : -3.5;
    else if (input.accelerate) acceleration = bus.speed < -.15 ? 9 : 6.6;
    if (acceleration) bus.speed = clamp(bus.speed + acceleration * dt, -4.2, topSpeed);
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
    state.distance += distance(bus, previous);
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
      // Each physics substep moves at most 0.84 m. Test the cone's footprint
      // against the oriented coach, including its front and rear corners.
      const dx = cone.x - bus.x, dy = cone.y - bus.y;
      if (Math.abs(bus.speed) < .01 || dx*dx + dy*dy > 30) continue;
      const heading = bus.heading + (bus.speed < 0 ? Math.PI : 0);
      const forward = forwardOf(heading);
      const along = dx * forward.x + dy * forward.y;
      const across = dy * forward.x - dx * forward.y;
      if (Math.hypot(Math.max(0, Math.abs(along) - 4.6), Math.max(0, Math.abs(across) - 1.35)) > .46) continue;
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
    const state = {map, stops, ...makeSignals(map), bus: {x: 5.2, y: 62, heading: 0, speed: 0, steer: 0},
      time: 0, distance: 0, earnings: 0, passengers: [], people: [], doorsOpen: false, serviceComplete: false,
      nearbyStop: stops[0], district: 'Centre-ville', collisions: 0, cones: []};
    state.cars = makeTraffic(state);
    const sites = coneSites(map, stops, random);
    for (let id = 0; id < coneLimit; id++) {
      const site = pickConeSite(state, sites, random, true);
      if (site) state.cones.push({id, ...site, hit:null});
    }
    updateLights(state);
    let serial = 0, activeStop = null, lastCollision = -Infinity;
    function queuePassenger(stop, index) {
      const number = serial++;
      const choices = stops.filter(item => item !== stop);
      const dest = choices[(index === 0 ? stops.indexOf(stop) : number + index) % choices.length];
      const side = index % 2 === 0 ? .8 : 1.6;
      const position = offset(stop, forwardOf(stop.heading), -1.6 - 1.15 * index, side);
      stop.waiting.push({id: number, color: coats[number % coats.length], destination: dest.id, ...position});
    }
    stops.forEach((stop, i) => {
      for (let j = 0; j < 2 + (i % 3); j++) queuePassenger(stop, j);
      stop.nextArrival = 25 + 3 * i;
    });

    function setNearbyStop() {
      let nearest = null, best = 9.5;
      for (const stop of state.stops) {
        const d = distance(state.bus, stop);
        if (d < best) { best = d; nearest = stop; }
      }
      state.nearbyStop = nearest;
      state.district = state.bus.x > map.townEdge ? 'Campagne' : 'Centre-ville';
    }

    function updateService(dt) {
      if (!activeStop || state.serviceComplete) return;
      const door = offset(state.bus, forwardOf(state.bus.heading), 2.7, 1.45);
      if (!state.people.length) {
        const leaving = state.passengers.find(p => p.destination === activeStop.id);
        const joining = state.passengers.length < capacity && activeStop.waiting[0];
        if (!leaving && !joining) { state.serviceComplete = true; return; }
        const person = leaving || activeStop.waiting.shift();
        const sidewalk = offset(activeStop, forwardOf(activeStop.heading), 1 + (person.id % 2), 2.3);
        const start = leaving ? door : {x: person.x, y: person.y};
        const end = leaving ? sidewalk : door;
        state.people.push({...person, ...start, phase: leaving ? 'alighting' : 'boarding',
          progress: 0, start, end});
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
        onEvent({type: 'boarding', fare, stopName: activeStop.name, message: 'Passager à bord · +' + fare + ' €$'});
      } else {
        state.passengers = state.passengers.filter(p => p.id !== person.id);
        onEvent({type: 'alighting', stopName: activeStop.name, message: 'Descente · ' + activeStop.name});
      }
    }

    function toggleDoors() {
      if (state.doorsOpen) {
        if (!state.serviceComplete) {
          onEvent({type: 'hint', message: 'Attends la fin des échanges.'});
          return false;
        }
        state.doorsOpen = false;
        state.serviceComplete = false;
        activeStop = null;
        onEvent({type: 'doors', message: 'Portes fermées · Bonne route !'});
        return true;
      }
      if (!state.nearbyStop || Math.abs(state.bus.speed) > .8) {
        onEvent({type: 'hint', message: state.nearbyStop ? 'Immobilise le bus pour ouvrir.' : 'Rapproche-toi d’un arrêt.'});
        return false;
      }
      state.bus.speed = 0;
      state.doorsOpen = true;
      activeStop = state.nearbyStop;
      onEvent({type: 'doors', message: 'Portes ouvertes · ' + activeStop.name});
      updateService(0);
      return true;
    }

    function step(dt, input) {
      state.time += dt;
      updateLights(state);
      const previousBus = {x: state.bus.x, y: state.bus.y};
      drive(state, dt, input);
      updateService(dt);
      for (const stop of stops) {
        if (state.time >= stop.nextArrival && stop.waiting.length < 4 && distance(state.bus, stop) > 35) {
          queuePassenger(stop, stop.waiting.length);
          stop.nextArrival = state.time + 30;
        }
      }
      for (const car of state.cars) {
        if (car.contact && touching(state.bus, car)) {
          // A stopped car occupies its lane until the driver backs away or turns clear.
          if (distance(state.bus, car) < distance(previousBus, car)) {
            state.distance -= distance(state.bus, previousBus);
            Object.assign(state.bus, previousBus);
            state.bus.speed = 0;
          }
          continue;
        }
        const wanted = trafficSpeed(car, state, dt);
        car.speed += clamp(wanted - car.speed, -6 * dt, 2.2 * dt);
        car.location = (car.location + car.speed * dt) % car.route.length;
        poseCar(car);
        const hit = touching(state.bus, car);
        if (hit && !car.contact) {
          car.speed = 0;
          car.wait = 1;
          state.bus.speed *= -.18;
          if (state.time - lastCollision > 1.5) {
            state.collisions++;
            lastCollision = state.time;
            onEvent({type: 'collision', message: 'Accrochage !'});
          }
        }
        car.contact = hit;
      }
      updateCones(state, sites, random, onEvent);
      setNearbyStop();
    }

    function update(seconds, input = {}) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      // Keep physics stable across refresh rates and discard time spent in inactive tabs.
      const activeTime = Math.min(seconds, .25);
      const count = Math.ceil(activeTime * 30);
      for (let i = 0; i < count; i++) step(activeTime / count, input);
    }
    return {state, update, toggleDoors};
  }
  window.CareerSim = Object.freeze({create});
})();
