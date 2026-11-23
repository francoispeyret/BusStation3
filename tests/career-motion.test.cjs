const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({window:{}});
for (const script of ['bus-handling.js', 'career-motion.js']) {
  const filename = path.join(__dirname, '../dist', script);
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, {filename});
}
const {CareerMotion: motion, BusHandling: handling} = context.window;
const createBus = () => ({speed:0, steer:0, motion:motion.create()});

test('front tyres show the driving angle at a standstill and wheel spin follows signed travel', () => {
  const bus = createBus();
  bus.steer = 1;
  motion.update(bus, .02, 0, {});
  assert.equal(bus.motion.wheelAngle, handling.wheelAngle(1, 0));
  assert.equal(bus.motion.wheelSpin, 0);
  bus.speed = 5;
  motion.update(bus, .02, 5, {});
  assert.ok(bus.motion.wheelSpin > 0);
  assert.ok(bus.motion.wheelAngle < handling.wheelAngle(1, 0));
  bus.speed = -5;
  motion.update(bus, .02, -5, {});
  assert.ok(Math.abs(bus.motion.wheelSpin) < 1e-9);
});

test('acceleration vibrates the body gently and braking raises the nose, then both settle', () => {
  const bus = createBus();
  const dt = 1 / 60;
  const heights = [];
  for (let frame = 0; frame < 90; frame++) {
    const previous = bus.speed;
    bus.speed += 6.6 * dt;
    motion.update(bus, dt, previous, {accelerate:true});
    heights.push(bus.motion.heave);
  }
  assert.ok(Math.max(...heights) > .01 && Math.min(...heights) < -.01);
  assert.ok(heights.every(h => Math.abs(h) < .02));
  for (let frame = 0; frame < 30; frame++) {
    const previous = bus.speed;
    bus.speed -= 13.5 * dt;
    motion.update(bus, dt, previous, {brake:true});
  }
  assert.ok(bus.motion.pitch > .035 && bus.motion.pitch < .05);
  for (let frame = 0; frame < 90; frame++) motion.update(bus, dt, bus.speed, {});
  assert.ok(Math.abs(bus.motion.heave) < .00001 && bus.motion.pitch < .00001);
});

test('a directional shunt moves the body briefly without steering, regardless of frame rate', () => {
  function shunt(side, hz) {
    const bus = createBus();
    Object.assign(bus, {x:10, y:-15, heading:2, speed:12});
    motion.impact(bus, {strength:12, side, longitudinal:0});
    for (let i = 0; i < hz / 10; i++) motion.update(bus, 1 / hz, 12, {});
    assert.deepEqual([bus.x, bus.y, bus.heading, bus.speed, bus.steer], [10,-15,2,12,0]);
    const {sway, yaw, roll, heave} = bus.motion;
    for (let i = 0; i < hz; i++) motion.update(bus, 1 / hz, 12, {});
    for (const axis of ['sway','yaw','roll','heave']) assert.ok(Math.abs(bus.motion[axis]) < .0001);
    return {sway, yaw, roll, heave};
  }
  const left = shunt(-1, 60);
  const right = shunt(1, 60);
  const slower = shunt(1, 30);
  assert.ok(right.sway > .04 && right.heave > .03 && Math.abs(right.roll) > .03);
  for (const axis of ['sway','yaw','roll']) assert.equal(left[axis], -right[axis]);
  for (const axis of Object.keys(right)) assert.ok(Math.abs(slower[axis] - right[axis]) < 1e-10);
});
