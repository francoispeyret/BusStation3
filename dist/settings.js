(() => {
  'use strict';

  const storageKey = 'busstation3.graphics';
  const choices = Object.freeze({
    detail: Object.freeze(['low', 'medium', 'high', 'extreme']),
    targetFps: Object.freeze([30, 60, 90, 120, 240, 0]),
    resolutionScale: Object.freeze([1, 2])
  });
  const defaults = {detail: 'medium', targetFps: 0, resolutionScale: 1};

  function validate(values, fallback) {
    const next = {...fallback};
    for (const key of Object.keys(choices)) {
      if (choices[key].includes(values?.[key])) next[key] = values[key];
    }
    return Object.freeze(next);
  }

  let saved;
  try { saved = JSON.parse(window.localStorage.getItem(storageKey)); } catch {}
  let current = validate(saved, defaults);

  function set(patch) {
    const next = validate(patch, current);
    if (Object.keys(choices).every(key => current[key] === next[key])) return current;
    current = next;
    try { window.localStorage.setItem(storageKey, JSON.stringify(current)); } catch {}
    return current;
  }

  // One pacer per animation loop. Deadlines follow the target cadence even when
  // the display refresh rate is not an integer multiple (e.g. 90 fps at 144 Hz).
  function createFramePacer() {
    let deadline, target;
    return {
      reset() { deadline = undefined; },
      due(timestamp) {
        const fps = current.targetFps;
        if (!fps) {
          deadline = undefined;
          return true;
        }
        const period = 1000 / fps;
        if (deadline === undefined || fps !== target) {
          target = fps;
          deadline = timestamp + period;
          return true;
        }
        // Accommodate fractional refresh periods and rounded browser timestamps.
        const ahead = timestamp + 0.25 - deadline;
        if (ahead < 0) return false;
        deadline += (1 + Math.floor(ahead / period)) * period;
        return true;
      }
    };
  }

  window.BusSettings = Object.freeze({choices, get current() { return current; }, set, createFramePacer});
})();
