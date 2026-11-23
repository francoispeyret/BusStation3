/* Shared planar road surfaces for the career camera and overhead view. */
(() => {
  'use strict';

  // A cross-section runs from one outer verge edge to the other, through the
  // two edges of the asphalt. The arm's direction points out of the junction.
  function crossSection(arm, distance) {
    const {node, ux, uy, road} = arm;
    const half = road.width / 2, outer = half + road.vergeWidth;
    return [-outer, -half, half, outer].map(offset => [
      node.x + distance * ux - offset * uy, node.y + distance * uy + offset * ux
    ]);
  }

  function joinSections(surfaces, start, end, kind) {
    for (let i = 0; i < 3; i++) {
      surfaces.push({kind, material:i === 1 ? 'roadColor' : 'verge',
        points:[start[i], start[i+1], end[i+1], end[i]]});
    }
  }

  function joinAtNode(node, arms, surfaces) {
    if (arms.length === 1) {
      arms[0].section = crossSection(arms[0], 0);
      return;
    }
    arms.sort((a,b) => a.angle - b.angle);
    const widest = arms.reduce((a,b) => a.road.width >= b.road.width ? a : b).road;
    const half = widest.width / 2, outer = half + widest.vergeWidth;
    const corners = arms.map((arm,i) => {
      const next = arms[(i+1) % arms.length];
      // Intersect the offset edges of consecutive arms. Using their shared
      // junction width also handles opposite approaches without a special case.
      const divisor = 1 - arm.ux * next.ux - arm.uy * next.uy;
      const x = (next.uy - arm.uy) / divisor, y = (arm.ux - next.ux) / divisor;
      return {asphalt:[node.x + x * half, node.y + y * half],
        verge:[node.x + x * outer, node.y + y * outer]};
    });
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i], before = corners[(i + arms.length - 1) % arms.length], after = corners[i];
      arm.section = [before.verge, before.asphalt, after.asphalt, after.verge];
      if (arms.length > 2) {
        surfaces.push({kind:widest.kind, material:'roadColor',
          points:[[node.x, node.y], after.asphalt, before.asphalt]});
      }
      const along = p => (p[0] - node.x) * arm.ux + (p[1] - node.y) * arm.uy;
      arm.trim = Math.max(0, along(before.asphalt), along(after.asphalt));
      if (arm.road.width !== widest.width || arm.road.vergeWidth !== widest.vergeWidth) {
        // Narrow the city mouth over six metres past its furthest corner.
        arm.trim = Math.max(arm.trim, along(before.verge), along(after.verge)) + 6;
        const approach = crossSection(arm, arm.trim);
        joinSections(surfaces, arm.section, approach, widest.kind);
        arm.section = approach;
      }
    }
  }

  function build(map) {
    const surfaces = [], byNode = new Map();
    function attach(node, road, ux, uy) {
      const arm = {node, road, ux, uy, angle:Math.atan2(uy, ux), trim:0};
      if (!byNode.has(node)) byNode.set(node, []);
      byNode.get(node).push(arm);
      return arm;
    }
    const links = map.roads.map(road => {
      const dx = road.b.x - road.a.x, dy = road.b.y - road.a.y;
      const length = Math.hypot(dx,dy), ux = dx/length, uy = dy/length;
      return {road, length, a:attach(road.a, road, ux, uy), b:attach(road.b, road, -ux, -uy)};
    });
    for (const [node, arms] of byNode) joinAtNode(node, arms, surfaces);
    const segments = links.map(({road, length, a, b}) => {
      joinSections(surfaces, a.section, b.section.slice().reverse(), road.kind);
      return {road, from:a.trim, to:length - b.trim};
    });
    return {surfaces, segments};
  }

  window.CareerRoads = Object.freeze({build});
})();
