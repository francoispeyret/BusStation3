(() => {
  'use strict';

  // Metres, seconds, kilograms. Tyre grip constrains the coach to its driven
  // heading; a struck passenger car is free to translate and rotate in the plane.
  const coach = {halfLength:4.6, halfWidth:1.35, inverseMass:1/12500, inverseInertia:0};
  const sedan = {halfLength:2.05, halfWidth:.925, inverseMass:1/1250,
    inverseInertia:12 / (1250 * (4.1**2 + 1.85**2))};
  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
  const cross = (x, y, u, v) => x*v - y*u;

  function box(body, shape) {
    const fx = Math.sin(body.heading), fy = -Math.cos(body.heading);
    return {body, shape, fx, fy, rx:-fy, ry:fx};
  }

  function radius(b, nx, ny) {
    return Math.abs(b.fx*nx + b.fy*ny)*b.shape.halfLength +
      Math.abs(b.rx*nx + b.ry*ny)*b.shape.halfWidth;
  }

  // Tangential interval of the face (or corner) furthest along the normal.
  // Taking the middle of the two supporting features avoids artificial spin
  // when two bumpers meet centrally, while retaining leverage on corner hits.
  function support(b, nx, ny, tx, ty) {
    let centre = b.body.x*tx + b.body.y*ty, extent = 0;
    function add(ax, ay, half) {
      const facing = ax*nx + ay*ny, tangent = half*(ax*tx + ay*ty);
      if (Math.abs(facing) < .02) extent += Math.abs(tangent);
      else centre += Math.sign(facing)*tangent;
    }
    add(b.fx, b.fy, b.shape.halfLength);
    add(b.rx, b.ry, b.shape.halfWidth);
    return {min:centre - extent, max:centre + extent};
  }

  function contact(a, b) {
    const dx = b.body.x - a.body.x, dy = b.body.y - a.body.y;
    let depth = Infinity, nx, ny;
    for (const [ax, ay] of [[a.fx,a.fy], [a.rx,a.ry], [b.fx,b.fy], [b.rx,b.ry]]) {
      const delta = dx*ax + dy*ay;
      const overlap = radius(a, ax, ay) + radius(b, ax, ay) - Math.abs(delta);
      if (overlap < 0) return null;
      if (overlap < depth) {
        depth = overlap;
        const sign = delta >= 0 ? 1 : -1;
        nx = sign*ax;
        ny = sign*ay;
      }
    }
    const tx = -ny, ty = nx;
    const first = support(a, nx, ny, tx, ty), second = support(b, -nx, -ny, tx, ty);
    const tangent = (Math.max(first.min, second.min) + Math.min(first.max, second.max))*.5;
    const normal = a.body.x*nx + a.body.y*ny + radius(a, nx, ny) - depth*.5;
    return {nx, ny, depth, x:nx*normal + tx*tangent, y:ny*normal + ty*tangent};
  }

  function inverseMassAt(b, armX, armY, nx, ny) {
    if (b.shape === coach) {
      const along = b.fx*nx + b.fy*ny;
      return b.body.speed*along < 0 ? b.shape.inverseMass*along**2 : 0;
    }
    return b.shape.inverseMass + b.shape.inverseInertia*cross(armX, armY, nx, ny)**2;
  }

  function impulse(b, armX, armY, jx, jy) {
    const body = b.body, invMass = b.shape.inverseMass;
    if (b.shape === coach) {
      // The heavy, driven axle can lose speed without deflecting, reversing,
      // or rolling away from a stop when another driver hits the coach.
      const before = body.speed, delta = (jx*b.fx + jy*b.fy)*invMass;
      body.speed = Math.sign(before)*clamp(Math.abs(before) + Math.sign(before)*delta, 0, Math.abs(before));
      body.vx += (body.speed - before)*b.fx;
      body.vy += (body.speed - before)*b.fy;
    } else {
      body.vx += jx*invMass;
      body.vy += jy*invMass;
      body.yawRate += cross(armX, armY, jx, jy)*b.shape.inverseInertia;
      body.speed = Math.max(0, body.vx*b.fx + body.vy*b.fy);
    }
  }

  function resolve(first, second, firstShape) {
    const dx = second.x - first.x, dy = second.y - first.y;
    if (dx*dx + dy*dy > (firstShape === coach ? 50 : 21)) return null;
    const a = box(first, firstShape), b = box(second, sedan);
    const hit = contact(a, b);
    if (!hit) return null;
    const {nx, ny, depth, x, y} = hit;
    const ax = x-first.x, ay = y-first.y, bx = x-second.x, by = y-second.y;
    const vx = second.vx - second.yawRate*by - (first.vx - first.yawRate*ay);
    const vy = second.vy + second.yawRate*bx - (first.vy + first.yawRate*ax);
    const strength = Math.max(0, -(vx*nx + vy*ny));
    if (strength > 0) {
      const restitution = strength > 2 ? .12 : 0;
      const normal = strength*(1 + restitution) /
        (inverseMassAt(a, ax, ay, -nx, -ny) + inverseMassAt(b, bx, by, nx, ny));
      const tx = -ny, ty = nx;
      const slip = vx*tx + vy*ty, sign = Math.sign(slip);
      const friction = clamp(-slip /
        (inverseMassAt(a, ax, ay, sign*tx, sign*ty) + inverseMassAt(b, bx, by, tx, ty)), -.28*normal, .28*normal);
      const jx = normal*nx + friction*tx, jy = normal*ny + friction*ty;
      impulse(a, ax, ay, -jx, -jy);
      impulse(b, bx, by, jx, jy);
    }
    // Correct penetration separately; it must not add velocity to a resting pair.
    const correction = Math.max(0, depth - .003);
    const share = firstShape === coach ? 0 : .5;
    first.x -= nx*correction*share;
    first.y -= ny*correction*share;
    second.x += nx*correction*(1-share);
    second.y += ny*correction*(1-share);
    return {strength, side:-(nx*a.rx + ny*a.ry), longitudinal:-(nx*a.fx + ny*a.fy)};
  }

  function slide(car, dt) {
    const fx = Math.sin(car.heading), fy = -Math.cos(car.heading);
    const forward = (car.vx*fx + car.vy*fy)*Math.exp(-.95*dt);
    const lateral = (-car.vx*fy + car.vy*fx)*Math.exp(-2.2*dt);
    car.vx = fx*forward - fy*lateral;
    car.vy = fy*forward + fx*lateral;
    car.yawRate *= Math.exp(-2*dt);
    car.x += car.vx*dt;
    car.y += car.vy*dt;
    car.heading += car.yawRate*dt;
    car.speed = Math.max(0, forward);
  }

  window.CareerPhysics = Object.freeze({
    collideBus:(bus, car) => resolve(bus, car, coach),
    collideCars:(first, second) => resolve(first, second, sedan),
    slide
  });
})();
