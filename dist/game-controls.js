(() => {
  'use strict';

  function mountSound(container, {setEnabled, setVolume}, refocus) {
    container.innerHTML = `<button id="sound" type="button" class="sound"></button>
      <input id="volume" class="volume-range" type="range" min="0" max="100" step="1" value="60" aria-label="Volume du jeu">
      <span id="volume-readout" class="volume-readout" aria-hidden="true"></span>`;
    const button = container.querySelector('button');
    const slider = container.querySelector('input');
    const readout = container.querySelector('.volume-readout');
    const speaker = '<path d="m3 9 4-.1L12.5 4v16L7 15H3z"/>';
    const waves = '<path d="M16 8a6 6 0 0 1 0 8m2.8-10.8a10 10 0 0 1 0 13.6"/>';
    const cross = '<path d="m16.5 9.5 5 5m0-5-5 5"/>';
    let volume = 60, enabled = true;
    function display() {
      button.innerHTML = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">' + speaker + (enabled ? waves : cross) + '</svg>';
      button.setAttribute('aria-pressed', String(enabled));
      button.setAttribute('aria-label', enabled ? 'Son activé' : 'Son coupé');
      button.title = enabled ? 'Couper le son' : 'Activer le son';
      const level = enabled ? volume : 0;
      slider.value = String(level);
      slider.style.setProperty('--level', level + '%');
      slider.setAttribute('aria-valuetext', level + ' %');
      readout.textContent = level + ' %';
    }
    function restore() {
      try {
        enabled = localStorage.getItem('busstation3.sound') !== '0';
        const saved = Number(localStorage.getItem('busstation3.volume'));
        volume = Number.isInteger(saved) && saved > 0 && saved <= 100 ? saved : 60;
      } catch {}
      setVolume(volume / 100);
      setEnabled(enabled);
      display();
    }
    function save() {
      try {
        localStorage.setItem('busstation3.volume', String(volume));
        localStorage.setItem('busstation3.sound', enabled ? '1' : '0');
      } catch {}
    }
    button.addEventListener('click', () => {
      enabled = !enabled;
      setEnabled(enabled);
      display();
      save();
    });
    slider.addEventListener('input', () => {
      const level = slider.valueAsNumber;
      if (level > 0) {
        volume = level;
        setVolume(level / 100);
      }
      if (enabled !== (level > 0)) {
        enabled = level > 0;
        setEnabled(enabled);
      }
      display();
    });
    slider.addEventListener('change', save);
    slider.addEventListener('pointerup', refocus);
    window.addEventListener('pageshow', event => { if (event.persisted) restore(); });
    window.addEventListener('storage', event => {
      if ([null, 'busstation3.sound', 'busstation3.volume'].includes(event.key)) restore();
    });
    restore();
  }

  const graphics = [
    {id:'graphics-detail', key:'detail', label:'Détails graphiques', labels:['Bas','Moyen','Haut','Extrême']},
    {id:'target-fps', key:'targetFps', label:'FPS cible', labels:['30','60','90','120','240','Illimité']},
    {id:'resolution-scale', key:'resolutionScale', label:'Échelle de résolution', labels:['1×','2×']}
  ];
  function mountGraphics(container, onChange) {
    const settings = window.BusSettings;
    container.replaceChildren();
    for (const {id, key, label, labels} of graphics) {
      const values = settings.choices[key];
      const min = key === 'resolutionScale' ? 1 : 0;
      const row = document.createElement('div');
      row.className = 'setting-row';
      row.innerHTML = '<label for="' + id + '">' + label + '</label>' +
        '<output for="' + id + '" id="' + id + '-value" aria-hidden="true"></output>' +
        '<input type="range" step="1" id="' + id + '" min="' + min + '" max="' + (min + values.length - 1) + '">' +
        '<div class="setting-marks" aria-hidden="true">' + labels.map(mark => '<span>' + mark + '</span>').join('') + '</div>';
      const slider = row.querySelector('input'), output = row.querySelector('output');
      if (key === 'targetFps') {
        row.insertAdjacentHTML('beforeend', '<p class="setting-note" id="target-fps-note">La fréquence de l’écran limite le nombre d’images affichées.</p>');
        slider.setAttribute('aria-describedby', 'target-fps-note');
      }
      function display(value) {
        const index = values.indexOf(value);
        slider.value = String(min + index);
        const text = labels[index] + (key === 'targetFps' && value ? ' FPS' : '');
        slider.setAttribute('aria-valuetext', text);
        output.value = text;
      }
      display(settings.current[key]);
      slider.addEventListener('input', () => {
        const next = settings.set({[key]:values[slider.valueAsNumber - min]});
        display(next[key]);
        onChange(next, key);
      });
      container.append(row);
    }
  }
  function bindSteeringDrag(canvas, active, steer, release) {
    let drag;
    function cancel() {
      if (!drag) return;
      const id = drag.id;
      drag = null;
      release(id);
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    }
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || drag || !active()) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      drag = {id:event.pointerId, x:event.clientX, range:Math.min(120, Math.max(48, canvas.clientWidth * .16))};
    });
    canvas.addEventListener('pointermove', event => {
      if (drag?.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const amount = Math.sign(dx) * Math.min(1, Math.max(0, Math.abs(dx) - 3) / drag.range);
      steer(event.pointerId, amount);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(type, event => { if (drag?.id === event.pointerId) cancel(); });
    }
    return cancel;
  }
  function mountCounter(dial, initial = 0, format) {
    const formatter = new Intl.NumberFormat('fr-FR', format);
    if (typeof dial.update !== 'function') {
      function writeText(value) {
        const label = formatter.format(value);
        if (dial.textContent !== label) dial.textContent = label;
      }
      writeText(initial);
      return writeText;
    }
    dial.locales = 'fr-FR';
    dial.format = format;
    dial.transformTiming = {duration:135, easing:'ease-out'};
    dial.opacityTiming = {duration:90, easing:'ease-out'};
    dial.setAttribute('role', 'img');
    function update(value, animate = true) {
      dial.animated = animate;
      if (dial.value === value) return;
      dial.update(value);
      dial.setAttribute('aria-label', formatter.format(value));
    }
    update(initial, false);
    dial.replaceChildren();
    return update;
  }
  window.BusControls = {mountSound, mountGraphics, bindSteeringDrag, mountCounter};
})();
