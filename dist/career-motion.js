(() => {
  'use strict';
  const tyreRadius = .46 * 1.08; // Model radius and career vertical scale, in metres.
  const turn = 2 * Math.PI;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  function create() {
    return {
      wheelAngle:0, wheelSpin:0, pitch:0, roll:0, heave:0, sway:0, yaw:0,
      bounce:0, vibration:0, phase:0,
      velocity:{pitch:0, roll:0, bounce:0, sway:0, yaw:0}
    };
  }

  // Exact critically damped spring step. A hit adds velocity so the body
  // takes the impact immediately, then settles without moving the axles.
  function spring(motion, axis, target, rate, dt) {
    const offset = motion[axis] - target;
    const velocity = motion.velocity[axis];
    const change = velocity + rate * offset;
    const decay = Math.exp(-rate * dt);
    motion[axis] = target + (offset + change * dt) * decay;
    motion.velocity[axis] = (velocity - rate * change * dt) * decay;
  }

  function impact(bus, {strength, side, longitudinal}) {
    const v = bus.motion.velocity;
    const amount = clamp(strength / 12, 0, 1);
    v.sway = clamp(v.sway + side * 2.1 * amount, -2.8, 2.8);
    v.roll = clamp(v.roll - side * .95 * amount, -1.2, 1.2);
    v.yaw = clamp(v.yaw + side * .65 * amount, -.85, .85);
    v.pitch = clamp(v.pitch - longitudinal * .9 * amount, -1.2, 1.2);
    v.bounce = clamp(v.bounce + 1.65 * amount, 0, 2.2);
  }

  function update(bus, dt, previousSpeed, input) {
    const m = bus.motion;
    const acceleration = (bus.speed - previousSpeed) / dt;
    const driving = input.accelerate && !input.brake && bus.speed > 0 ? acceleration
      : input.brake && bus.speed < 0 ? -acceleration : 0;
    const braking = input.brake && previousSpeed > .15 ? clamp(-acceleration / 13.5, 0, 1) : 0;
    m.wheelAngle = window.BusHandling.wheelAngle(bus.steer, bus.speed * 3.6);
    m.wheelSpin = (m.wheelSpin + bus.speed * dt / tyreRadius) % turn;

    const lateralAcceleration = bus.speed * bus.speed * Math.tan(m.wheelAngle) / window.BusHandling.wheelbase;
    spring(m, 'roll', clamp(-lateralAcceleration * .003, -.032, .032), 9, dt);
    spring(m, 'pitch', braking * .044, 11, dt);
    spring(m, 'sway', 0, 13, dt);
    spring(m, 'yaw', 0, 13, dt);
    spring(m, 'bounce', 0, 12, dt);

    m.vibration += (clamp(driving / 6.6, 0, 1) - m.vibration) * (1 - Math.exp(-9 * dt));
    m.phase = (m.phase + turn * (5 + Math.abs(bus.speed) * .12) * dt) % turn;
    m.heave = m.bounce + m.vibration * (.014 * Math.sin(m.phase) + .004 * Math.sin(2 * m.phase));
  }

  window.CareerMotion = Object.freeze({create, impact, update});
})();
