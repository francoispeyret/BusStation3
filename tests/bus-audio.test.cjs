const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

function openAudio() {
  const media = [];
  class Audio {
    constructor(src) {
      this.src = src;
      this.paused = true;
      this.playCount = 0;
      media.push(this);
    }
    play() { this.playCount++; this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const window = {location:{protocol:'file:'}, Audio};
  const context = vm.createContext({window, clearTimeout, setTimeout});
  for (const file of ['bus-handling.js', 'bus-audio.js']) {
    vm.runInContext(readFileSync(join(__dirname, '../dist', file), 'utf8'), context);
  }
  return {media, sound:window.BusAudio.create(), handling:window.BusHandling};
}

test('career uses the same recorded engine, pitch and load as the arcade transmission', () => {
  const career = openAudio(), arcade = openAudio();
  for (const game of [career, arcade]) game.sound.setDriving(true);
  const sampled = [];
  for (const [i, speed] of [0, 10, 20, 30, 41, 42, 64, 85, 60].entries()) {
    const driving = {time:i, speed, braking:i === 8};
    career.sound.update(driving);
    arcade.sound.update({...driving, rpm:arcade.handling.rpmAt(speed), boost:0});
    const careerMotor = career.media[0];
    assert.equal(careerMotor.src, 'assets/bus-engine.wav');
    assert.equal(careerMotor.loop, true);
    assert.equal(careerMotor.playbackRate, arcade.media[0].playbackRate);
    assert.equal(careerMotor.volume, arcade.media[0].volume);
    sampled.push(careerMotor.playbackRate);
  }
  assert.ok(sampled[3] > sampled[0]);
  assert.ok(sampled[5] < sampled[4], 'engine pitch falls after shifting up');
  assert.ok(sampled.at(-1) < sampled[7], 'braking lowers engine pitch');
});

test('muting, pausing and returning to a service silence cues and reuse one engine', () => {
  const {sound, media} = openAudio();
  sound.setEnabled(false);
  sound.setDriving(true);
  sound.horn();
  assert.equal(media.length, 0);
  sound.setEnabled(true);
  sound.setDriving(true);
  sound.horn();
  const [motor, cue] = media;
  assert.equal(motor.playCount, 1);
  assert.equal(cue.src, 'assets/departure-horn.wav');
  sound.setVolume(.2);
  assert.ok(Math.abs(cue.volume - .2 * .45) < 1e-9);
  sound.setDriving(false);
  assert.ok(cue.paused && motor.paused);
  sound.airBrake();
  assert.equal(cue.playCount, 1);
  sound.setDriving(true);
  sound.airBrake();
  assert.equal(cue.src, 'assets/air-brake.wav');
  assert.equal(cue.playCount, 2);
  sound.setEnabled(false);
  assert.ok(cue.paused && motor.paused);
  assert.equal(media.length, 2);
});
