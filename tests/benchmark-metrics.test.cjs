const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function benchmarkRuntime(browser = {}) {
  const window = {BusDrive: {BENCHMARK_SECONDS: 120}, navigator: {userAgent: 'Test browser'}};
  const source = fs.readFileSync(path.join(__dirname, '../dist/benchmark.js'), 'utf8');
  vm.runInNewContext(source, {window, ...browser});
  return window.BusBenchmark;
}

test('FPS uses elapsed time and each interval belongs to the previously rendered stage', () => {
  const run = benchmarkRuntime().create();
  let time = 1234;
  assert.equal(run.frame(time), 0);
  run.stage('forest', 'Forêt');
  for (let i = 0; i < 19; i++) run.frame(time += 10);
  run.stage('rocket', 'Fusée de nuit');
  run.frame(time + 100);
  const {summary, stages} = run.report();
  assert.equal(summary.frames, 20);
  assert.equal(summary.averageFps, 68.97);
  assert.equal(summary.p95FrameMs, 10);
  assert.equal(summary.slowestFrameMs, 100);
  assert.equal(stages[0].averageFps, 100);
  assert.equal(stages[1].averageFps, 10);
});

test('pauses exclude background time and final frame timing uses the real uncapped interval', () => {
  const benchmark = benchmarkRuntime();
  const run = benchmark.create();
  run.frame(0);
  run.stage('city', 'Ville');
  run.frame(20);
  run.pause();
  assert.equal(run.frame(200020), 20);
  assert.equal(run.frame(200020), 20);
  assert.equal(run.frame(200000), 20);
  run.frame(319990);
  run.frame(320030);
  run.frame(320090);
  assert.equal(run.elapsedMs, benchmark.durationMs);
  const report = run.report();
  assert.equal(report.durationMs, 120000);
  assert.equal(report.summary.measuredMs, 120030);
  assert.equal(report.summary.frames, 3);
  assert.equal(report.summary.slowestFrameMs, 119970);
});

test('download contains the report, render dimensions, and measured stage data', async () => {
  let blob, cleanup, clicked = false, removed = false, revoked;
  const link = {click() { clicked = true; }, remove() { removed = true; }};
  const benchmark = benchmarkRuntime({
    Blob, document: {createElement: () => link, body: {append() {}}},
    URL: {createObjectURL(file) { blob = file; return 'blob:test'; }, revokeObjectURL(url) { revoked = url; }},
    setTimeout(callback) { cleanup = callback; }
  });
  const run = benchmark.create({renderer: 'WebGL 2', width: 1920, height: 1080, pixelRatio: 2, busModel: 'express'});
  run.frame(0);
  run.stage('hills', 'Collines');
  run.frame(10);
  benchmark.download(run.report());
  assert.ok(clicked && removed);
  assert.equal(link.href, 'blob:test');
  assert.match(link.download, /^bus-station-3-benchmark-.*\.json$/);
  assert.match(blob.type, /application\/json/);
  const exported = JSON.parse(await blob.text());
  assert.equal(exported.environment.canvasAtStart.width, 1920);
  assert.equal(exported.environment.devicePixelRatio, 2);
  assert.equal(exported.environment.renderer, 'WebGL 2');
  assert.equal(exported.stages[0].id, 'hills');
  assert.equal(exported.summary.frames, 1);
  cleanup();
  assert.equal(revoked, 'blob:test');
});
