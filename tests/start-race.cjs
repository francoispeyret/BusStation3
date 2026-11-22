const gameRuntime = require('./game-runtime.cjs');

module.exports = function startRace(seed = 27) {
  const runtime = gameRuntime();
  runtime.Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  let frame, time = 0;
  runtime.window.matchMedia = () => ({matches:true});
  runtime.requestAnimationFrame = callback => { frame = callback; return 1; };
  runtime.cancelAnimationFrame = () => {};
  runtime.clearTimeout = clearTimeout;
  const events = [];
  const game = runtime.window.BusDrive.create({onEvent: e => events.push(e)});
  game.start();
  frame(0);
  return {game, state:game.state, events, step(ms = 1000 / 60) { frame(time += ms); }};
};
