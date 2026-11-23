(() => {
  'use strict';
  const wheelbase = 3.09;

  function wheelAngle(steer, speedKmh) {
    return steer * .28 / (1 + Math.abs(speedKmh) / 72);
  }

  // Both modes use the arcade bus' bicycle steering model. Signed travel
  // makes the same wheel input turn the body the other way when reversing.
  function steeringYaw(state, input, speedKmh, travelMetres, dt) {
    const previous = state.steer;
    const response = input ? 9 : 15;
    state.steer += (input - previous) * (1 - Math.exp(-response * dt));
    if (!input && Math.abs(state.steer) < .0001) state.steer = 0;
    return travelMetres / wheelbase * Math.tan(wheelAngle((previous + state.steer) * .5, speedKmh));
  }

  function gearAt(kmh) {
    return Math.min(6, 1 + Math.floor(kmh / 21));
  }

  function rpmAt(kmh, gear = gearAt(kmh)) {
    return Math.round(1500 + kmh * 89 / (1 + (gear - 1) * .64));
  }

  window.BusHandling = Object.freeze({wheelbase, wheelAngle, steeringYaw, gearAt, rpmAt});
})();
