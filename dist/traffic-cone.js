/* The road cone and its knock-over animation used in both game modes. */
(() => {
  'use strict';

  function model() {
    const m = new window.BusMesh.Mesh();
    m.box(0,.01,0,.95,.12,.90,'#c25a3a');
    m.quad([-.475,.01,-.45],[-.475,.01,.45],[.475,.01,.45],[.475,.01,-.45],'#854632');
    for (const [y,top,r,r2,color] of [[.13,.50,.37,.26,'#fa793e'],[.50,.69,.26,.19,'#fff3d2'],[.69,1.15,.19,.056,'#fa793e']]) {
      m.rings(0,0,0,[[r,y,r],[r2,top,r2]],8,color);
    }
    return m;
  }

  function flight(progress, age, side, speed, toVerge) {
    const p = progress;
    const fade = Math.min(1, Math.max(0, (p - .52) / .48));
    return {
      across:side * toVerge * p * (1.5 - .5 * p),
      forward:speed * age * (1.04 - .20 * p),
      lift:8 * p - 6.4 * p * p,
      turn:side * p * 2.4, roll:-side * p * 5.9, pitch:p * 3.4,
      alpha:1 - fade * fade * (3 - 2 * fade)
    };
  }
  window.BusCone = {model, flight};
})();
