(() => {
  'use strict';

  const maxHearts = 3;
  const outline = 'M32 56.7C29.5 56.5 7.2 40.2 5.7 25.6 4 10.1 18.1 4.6 27.6 11.8 29.4 13.1 30.9 14.8 32 16.4 37.4 6.1 49.8 5.5 55.8 12.8 66.9 26.3 49.2 47.1 34.1 56 33.2 56.6 32.6 56.8 32 56.7Z';
  const crack = 'M32 -3 32 16.4 28.5 23.3 34.1 27.1 29.4 33.5 35.3 37.1 30.1 44.8 33.3 48.1 31 57.8 31 69';
  let meterCount = 0;

  function heartSVG(id) {
    return `<svg class="heart-slot" data-full="true" aria-hidden="true" focusable="false" viewBox="0 0 64 64">
      <defs>
        <path id="${id}-shape" d="${outline}"/>
        <clipPath id="${id}-inside"><use href="#${id}-shape"/></clipPath>
        <clipPath id="${id}-left"><path d="${crack}H-8V-3Z"/></clipPath>
        <clipPath id="${id}-right"><path d="${crack}H72V-3Z"/></clipPath>
        <clipPath id="${id}-rise">
          <path class="heart-liquid" d="M-4 0Q4 -2 12 0T28 0 44 0 60 0H68V72H-4Z"/>
        </clipPath>
        <g id="${id}-paint">
          <use href="#${id}-shape" fill="#ff776b"/>
          <g clip-path="url(#${id}-inside)">
            <path d="M3 23Q11 41 30 47C36 49 54 35 61 17L67 46 34 65 8 48Z" fill="#df515c"/>
            <path d="M12.6 23.5Q13.5 16 20.5 15.7" fill="none" stroke="#ffe5bd" stroke-width="4.4" stroke-linecap="round"/>
            <ellipse cx="18.5" cy="33" rx="3.8" ry="1.7" fill="#f45f64"/>
            <ellipse cx="44.7" cy="32.5" rx="3.8" ry="1.7" fill="#f45f64"/>
            <g fill="#432b42">
              <ellipse cx="23.2" cy="29.8" rx="2.2" ry="3.1"/>
              <ellipse cx="39.7" cy="29.5" rx="2.2" ry="3.1"/>
            </g>
            <path d="M28.1 33.3Q31.8 37.2 35.1 32.9" fill="none" stroke="#432b42" stroke-width="2.5" stroke-linecap="round"/>
          </g>
          <use href="#${id}-shape" fill="none" stroke="#482d43" stroke-width="3.6" stroke-linejoin="round"/>
        </g>
        <g id="${id}-broken">
          <use href="#${id}-paint"/>
          <path d="${crack}" clip-path="url(#${id}-inside)" fill="none" stroke="#ffe0b5" stroke-width="2.8" stroke-linejoin="round"/>
        </g>
      </defs>
      <g class="heart-shell">
        <use href="#${id}-shape" y="1.5" fill="#38283b" stroke="#ffedcf" stroke-width="4.7"/>
        <use href="#${id}-shape" fill="#514657" stroke="#38283b" stroke-width="3.5"/>
        <use href="#${id}-shape" transform="translate(4.5 3.2) scale(.86)" fill="none" stroke="#897c8b" stroke-width="1.8"/>
      </g>
      <g class="heart-whole"><g clip-path="url(#${id}-rise)"><use href="#${id}-paint"/></g></g>
      <g class="heart-shard heart-shard-left"><use href="#${id}-broken" clip-path="url(#${id}-left)"/></g>
      <g class="heart-shard heart-shard-right"><use href="#${id}-broken" clip-path="url(#${id}-right)"/></g>
      <path class="heart-spark" d="M52 2Q53.2 7.4 58.2 8.5 53.2 9.7 52 15 50.8 9.7 45.8 8.5 50.8 7.3 52 2Z" fill="#ffde82" stroke="#503447" stroke-width="1.4"/>
    </svg>`;
  }

  function create(host) {
    const prefix = 'bus-heart-' + (++meterCount);
    host.innerHTML = Array.from({length:maxHearts}, (_,i) => heartSVG(prefix + '-' + i)).join('');
    const slots = Array.from(host.children);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    host.setAttribute('role', 'img');
    let health;

    host.addEventListener('animationend', event => {
      const slot = event.target.closest('.heart-slot');
      if (!slot) return;
      if ((event.animationName === 'heart-shatter-left' && slot.dataset.motion === 'break') ||
          (event.animationName === 'heart-gain-bounce' && slot.dataset.motion === 'fill')) {
        delete slot.dataset.motion;
      }
    });
    host.addEventListener('animationcancel', event => {
      if (reducedMotion.matches) {
        const slot = event.target.closest('.heart-slot');
        if (slot) delete slot.dataset.motion;
      }
    });

    function set(value, animate = true) {
      if (!Number.isFinite(value)) return;
      const next = Math.max(0, Math.min(maxHearts, Math.round(value)));
      if (next === health && animate) return;
      for (let i=0; i<slots.length; i++) {
        const slot = slots[i], full = i < next;
        if (!animate || reducedMotion.matches) delete slot.dataset.motion;
        else if (full !== (slot.dataset.full === 'true')) slot.dataset.motion = full ? 'fill' : 'break';
        slot.dataset.full = String(full);
      }
      host.setAttribute('aria-label', 'Vies du bus, ' + next + ' sur ' + maxHearts);
      health = next;
    }

    set(maxHearts, false);
    return {set};
  }

  window.BusHearts = {create};
})();
