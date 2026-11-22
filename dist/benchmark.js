(() => {
  'use strict';

  const durationMs = window.BusDrive.BENCHMARK_SECONDS * 1000;
  const round = value => Math.round(value * 100) / 100;

  function summarize(intervals) {
    const frames = intervals.length;
    const measuredMs = intervals.reduce((total, ms) => total + ms, 0);
    const sorted = [...intervals].sort((a, b) => a - b);
    return {
      frames,
      measuredMs: round(measuredMs),
      averageFps: frames ? round(1000 * frames / measuredMs) : null,
      p95FrameMs: frames ? round(sorted[Math.ceil(frames * .95) - 1]) : null,
      slowestFrameMs: frames ? round(sorted[frames - 1]) : null
    };
  }

  function create({renderer, width, height, pixelRatio, busModel} = {}) {
    const startedAt = new Date().toISOString();
    const environment = {
      renderer, busModel, canvasAtStart: {width, height, unit: 'drawing-buffer pixels'},
      devicePixelRatio: pixelRatio, userAgent: window.navigator?.userAgent
    };
    const stages = new Map();
    let currentStage;
    let previousTime = null;
    let elapsedMs = 0;

    function stage(id, label) {
      if (currentStage && currentStage.id === id) return;
      if (!stages.has(id)) stages.set(id, {id, label, intervals: []});
      currentStage = stages.get(id);
    }

    function frame(timestamp) {
      if (elapsedMs === durationMs || !Number.isFinite(timestamp)) return elapsedMs;
      if (previousTime !== null) {
        const interval = timestamp - previousTime;
        if (interval <= 0) return elapsedMs;
        // Keep the entire observed interval, even when it crosses the finish line.
        if (!currentStage) stage('route', 'Parcours');
        currentStage.intervals.push(interval);
        elapsedMs = Math.min(durationMs, elapsedMs + interval);
      }
      previousTime = timestamp;
      return elapsedMs;
    }

    function report() {
      const samples = Array.from(stages.values());
      return {
        game: 'Bus Station 3', benchmarkVersion: 1, startedAt,
        targetDurationMs: durationMs, durationMs: round(elapsedMs), environment,
        summary: summarize(samples.flatMap(sample => sample.intervals)),
        stages: samples.map(({id, label, intervals}) => ({id, label, ...summarize(intervals)}))
      };
    }

    return {
      frame, stage, report,
      get elapsedMs() { return elapsedMs; },
      pause() { previousTime = null; }
    };
  }

  function download(report) {
    const file = new Blob([JSON.stringify(report, null, 2)], {type: 'application/json;charset=utf-8'});
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bus-station-3-benchmark-' + report.startedAt.replace(/[:.]/g, '-') + '.json';
    document.body.append(link);
    try {
      link.click();
    } finally {
      link.remove();
      // Let the browser take ownership of the download before releasing its URL.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  window.BusBenchmark = {durationMs, create, download};
})();
