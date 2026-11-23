const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({window:{}});
for (const file of ['mesh', 'bus-boost', 'bus-handling', 'career-motion', 'career-physics', 'career-sim', 'career-roads']) {
  const filename = path.join(__dirname, '../dist', file + '.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, {filename});
}
const {CareerSim, CareerRoads} = context.window;
const {map} = CareerSim.create().state;
const {surfaces, segments} = CareerRoads.build(map);
const tolerance = 1e-7;

function side(a, b, p) {
  return (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0]);
}

// Convex polygons may share edges or vertices, but not an area of positive size.
function overlaps(a, b) {
  for (const polygon of [a,b]) {
    for (let i = 0; i < polygon.length; i++) {
      const start = polygon[i], end = polygon[(i+1) % polygon.length];
      const project = p => side(start, end, p);
      const pa = a.map(project), pb = b.map(project);
      if (Math.min(Math.max(...pa),Math.max(...pb)) - Math.max(Math.min(...pa),Math.min(...pb)) <= tolerance) return false;
    }
  }
  return true;
}

function roadPoint(road, along, across) {
  const dx = road.b.x-road.a.x, dy = road.b.y-road.a.y, length = Math.hypot(dx,dy);
  return [road.a.x+(dx*along-dy*across)/length, road.a.y+(dy*along+dx*across)/length];
}

function covered(point, material, kind) {
  return surfaces.some(face => face.material === material && (!kind || face.kind === kind) &&
    face.points.every((a,i,pts) => side(a,pts[(i+1) % pts.length],point) <= tolerance));
}

// Clip a lane segment against each asphalt face, then check the union of the
// resulting intervals. This catches hairline gaps between otherwise valid faces.
function continuousAsphalt(start, end) {
  const intervals = [];
  for (const {material,points} of surfaces) {
    if (material !== 'roadColor') continue;
    let lo = 0, hi = 1;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i+1) % points.length];
      const s = side(a,b,start), t = side(a,b,end);
      if (s > tolerance && t > tolerance) { hi = -1; break; }
      if (s > tolerance) lo = Math.max(lo, s/(s-t));
      if (t > tolerance) hi = Math.min(hi, s/(s-t));
    }
    if (lo <= hi) intervals.push([lo,hi]);
  }
  let reached = 0;
  for (const [lo,hi] of intervals.sort((a,b) => a[0]-b[0])) {
    if (lo > reached+tolerance) return false;
    reached = Math.max(reached, hi);
  }
  return reached >= 1-tolerance;
}

test('the career road surface is made of convex, upward faces with disjoint interiors', () => {
  for (const {points} of surfaces) {
    const turns = points.map((a,i) => side(a,points[(i+1) % points.length],points[(i+2) % points.length]));
    assert.ok(turns.every(t => Number.isFinite(t) && t <= tolerance) && turns.some(t => t < -tolerance));
  }
  for (let i = 0; i < surfaces.length; i++) {
    for (let j = i+1; j < surfaces.length; j++) {
      assert.ok(!overlaps(surfaces[i].points, surfaces[j].points), 'overlapping road faces ' + i + ' and ' + j);
    }
  }
});

test('both lanes connect across each city and country junction, with road and verge on both sides of each approach', () => {
  for (const id of ['NE','E','SE']) {
    const node = map.byId[id];
    const roads = map.roads.filter(r => r.a === node || r.b === node);
    assert.equal(new Set(roads.map(r => r.kind)).size, 2);
    for (const road of roads) {
      const length = Math.hypot(road.b.x-road.a.x,road.b.y-road.a.y);
      for (const across of [-.7,0,.7]) {
        const offset = across*road.width/2;
        const start = roadPoint(road,node === road.a ? 0 : length,offset);
        assert.ok(continuousAsphalt(start,roadPoint(road,length/2,offset)), 'gap in lane at ' + id);
      }
      for (const sign of [-1,1]) {
        assert.ok(covered(roadPoint(road,length/2,sign*(road.width/2-.1)), 'roadColor', road.kind));
        assert.ok(covered(roadPoint(road,length/2,sign*(road.width/2+road.vergeWidth/2)), 'verge', road.kind));
      }
    }
  }
});

test('markings stay on their own approach and leave the centre of the junction clear', () => {
  assert.equal(segments.length, map.roads.length);
  assert.equal(new Set(segments.map(s => s.road)).size, map.roads.length);
  const corridors = [];
  for (const {road,from,to} of segments) {
    const length = Math.hypot(road.b.x-road.a.x,road.b.y-road.a.y);
    assert.ok(from > 0 && from < to && to < length);
    const edge = road.width/2-.24;
    const corridor = [roadPoint(road,from,edge),roadPoint(road,to,edge),
      roadPoint(road,to,-edge),roadPoint(road,from,-edge)];
    for (const point of corridor) assert.ok(covered(point, 'roadColor', road.kind));
    for (const other of corridors) assert.ok(!overlaps(corridor, other), 'approach markings cross into another road');
    corridors.push(corridor);
  }
});
