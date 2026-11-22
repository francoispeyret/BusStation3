(() => {
  'use strict';

  const paths = {
    gamepad: '<path d="M7 6.5h10c2 0 3.3 1.5 3.8 3.7l1.1 5.1c.6 3-1.7 4.7-3.7 3.1L15 16h-6l-3.2 2.4c-2.1 1.6-4.3-.2-3.7-3.1l1.1-5.1C3.7 8 5 6.5 7 6.5Z"/><path d="M7.5 9.5v4m-2-2h4m6.5.9h.01M18 10.2h.01" stroke-width="2.5"/>',
    trophy: '<path d="M7.5 3.5h9v5.7a4.5 4.5 0 0 1-9 0zM7 5.5H3.5v2a4.2 4.2 0 0 0 4.8 4m8.7-6h3.5v2a4.2 4.2 0 0 1-4.8 4M12 14v4m-4 2.5h8m-6-2h4"/>',
    volume: '<path d="m3 9 4-.1L12.5 4v16L7 15H3zM16 8a6 6 0 0 1 0 8m2.8-10.8a10 10 0 0 1 0 13.6"/>',
    mute: '<path d="m3 9 4-.1L12.5 4v16L7 15H3zM16.5 9.5l5 5m0-5-5 5"/>',
    play: '<path d="M5.5 3.6a.7.7 0 0 1 1.1-.6l13.2 8.3a.8.8 0 0 1 0 1.4L6.6 21a.7.7 0 0 1-1.1-.6z" fill="currentColor"/>',
    pause: '<path d="M8 5v14m8-14v14" stroke-width="3.8"/>',
    pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.3"/>',
    expand: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
    shrink: '<path d="M9 4v5H4m16 0h-5V4m0 16v-5h5m-16 0h5v5"/>',
    star: '<path d="m12 2.5 2.8 5.7 6.3 1-4.5 4.4 1 6.4L12 17l-5.6 3 1-6.4-4.5-4.4 6.3-1z"/>',
    road: '<path d="m6.7 3-4 18m14.6-18 4 18M12 3v3m0 4v3m0 4v4"/>',
    flag: '<path d="M4.5 21V4m0 1c5.5-4 9 3.5 15-.5v10c-6 4-9.5-3.5-15 .5"/><path d="M9.6 4.7V9l5 1V5.8m-10 4 5-.8v5.3m5-4.3 4.9-.7" stroke-width="1.4"/>',
    gauge: '<path d="M4.2 18a9.5 9.5 0 1 1 15.6 0M12 5.5v2M5.3 10l2 1m11.4-1-2 1m-4.5 4.5 3-4"/><circle cx="12" cy="16" r="1.3"/>',
    sign: '<path d="M11.5 2.5V5m0 5v2m0 6v3.5M4 5h12.5l3 2.5-3 2.5H4zM20 13H7l-3 2.5L7 18h13z"/>',
    left: '<path d="M20 12H4m6-6-6 6 6 6"/>',
    right: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    brake: '<rect x="5" y="4" width="14" height="16" rx="4"/><path d="M9 8v8m6-8v8"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    touch: '<path d="M9 14V5a2 2 0 0 1 4 0v6-1a2 2 0 0 1 3.5-1.2 2 2 0 0 1 3.3 1.4c1.3 0 2.2.9 2.2 2.3V16c0 3.2-1.6 5-5 5h-3.5c-2 0-3.2-.9-4.5-2.4l-4-5c-1.4-2.1.5-3.3 2-2.4z"/>',
    home: '<path d="m3 10 9-7 9 7m-16-1v11h14V9M10 20v-6h4v6"/>',
    retry: '<path d="M4 11a8 8 0 1 1 2 6M4 5v6h6"/>'
  };
  const $ = id => document.getElementById(id);
  const icon = name => '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">' + paths[name] + '</svg>';
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });

  const number = new Intl.NumberFormat('fr-FR');
  const cabinet = $('cabinet'), modal = $('modal'), title = $('modal-title'), body = $('modal-body');
  const road = $('road'), notice = $('notice'), effect = $('active-effect');
  const health = $('health');
  const hearts = window.BusHearts.create(health);
  const noticeStatus = $('notice-status');
  const impactTitles = {cone: 'Oups !', barrier: 'Boum !', oil: 'Ça glisse !', pothole: 'Crevé !'};
  const pendingNotices = [];
  const gauges = Object.fromEntries(['score','distance','lap','speed'].map(key => [key, $(key)]));
  const lapNumber = new Intl.NumberFormat('fr-FR', {minimumIntegerDigits: 2});
  for (const dial of document.querySelectorAll('.reading number-flow')) {
    if (typeof dial.update !== 'function') continue;
    dial.locales = 'fr-FR';
    if (dial === gauges.lap) dial.format = {minimumIntegerDigits: 2};
    dial.transformTiming = {duration: 135, easing: 'ease-out'};
    dial.opacityTiming = {duration: 90, easing: 'ease-out'};
    dial.setAttribute('role', 'img');
    setDial(dial, Number(dial.textContent), false);
    dial.replaceChildren();
  }
  const rankingPrefix = 'busstation3.result.';
  const memoryScores = new Map();
  const models = window.BusModels.models;
  const modelKey = 'busstation3.busModel';
  let modelIndex = 0;
  let renderer, view = 'loading', panel = '', scoreId = '', scoreSaved = false, lastHud = -1;
  const heldControls = new Map();
  let drag = null;
  let graphicsLost = false;
  const volumeSlider = $('volume');
  let volume = Number(volumeSlider.defaultValue);
  let soundOn = true;
  try {
    const savedModel = localStorage.getItem(modelKey);
    modelIndex = Math.max(0, models.findIndex(model => model.id === savedModel));
    soundOn = localStorage.getItem('busstation3.sound') !== '0';
    const savedVolume = Number(localStorage.getItem('busstation3.volume'));
    if (Number.isInteger(savedVolume) && savedVolume > 0 && savedVolume <= 100) volume = savedVolume;
  } catch {}
  const game = window.BusDrive.create({ onUpdate: update, onEvent: event, onFinish: finish });
  game.setVolume(volume / 100);
  game.setSound(soundOn);

  const demo = {phase:'demo', introProgress:1, time:0, roadZ:0, speed:54, busModel:models[modelIndex].id, busOpacity:1,
    laneX:0, heading:0, objects:[], impacts:[], lap:1, lapProgress:0};
  const demoPeriodSeconds = 12;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let demoFrame, lastDemoTime;

  function showModelName() {
    setText($('bus-model-name'), models[modelIndex].name);
    setText($('bus-model-count'), String(modelIndex + 1).padStart(2, '0') + ' / ' + String(models.length).padStart(2, '0'));
  }

  function selectModel(direction) {
    modelIndex = (modelIndex + direction + models.length) % models.length;
    showModelName();
    try { localStorage.setItem(modelKey, models[modelIndex].id); } catch {}
    if (reducedMotion.matches) syncDemo();
  }

  function fadeDemoBus(dt) {
    const target = models[modelIndex].id;
    if (reducedMotion.matches) {
      demo.busModel = target;
      demo.busOpacity = 1;
      return;
    }
    // Reverse smoothly on a second click and spend any remaining frame time fading in.
    let step = dt / .20;
    if (demo.busModel !== target) {
      if (step < demo.busOpacity) {
        demo.busOpacity -= step;
        return;
      }
      step -= demo.busOpacity;
      demo.busOpacity = 0;
      demo.busModel = target;
    }
    demo.busOpacity = Math.min(1, demo.busOpacity + step);
  }

  function drawDemo(now) {
    const dt = lastDemoTime === undefined ? 0 : Math.min((now - lastDemoTime) / 1000, .5);
    lastDemoTime = now;
    demo.time += dt;
    // roadZ measures forward travel; the actual lane also curves sideways.
    const slope = window.BusDrive.roadSlope(demo.roadZ);
    demo.roadZ += demo.speed / 3.6 * dt / Math.hypot(1, slope);
    const period = demo.time / demoPeriodSeconds;
    demo.lap = 1 + Math.floor(period);
    demo.lapProgress = period % 1;
    fadeDemoBus(dt);
    renderer.render(demo);
    if (!reducedMotion.matches) demoFrame = requestAnimationFrame(drawDemo);
  }

  function syncDemo() {
    cancelAnimationFrame(demoFrame);
    lastDemoTime = undefined;
    if (view !== 'home') return;
    const unavailable = !renderer || graphicsLost;
    cabinet.toggleAttribute('data-demo-unavailable', unavailable);
    road.hidden = unavailable;
    if (!unavailable && !document.hidden && !modal.open) demoFrame = requestAnimationFrame(drawDemo);
  }

  function loadArcade() {
    const minimumMs = 5000;
    const bar = $('loading-progress'), percent = $('loading-percent');
    let startedAt, ready = false;
    function progress(now) {
      startedAt ??= now;
      const value = Math.min(ready ? 100 : 95, Math.floor(100 * (now - startedAt) / minimumMs));
      if (bar.value !== value) {
        bar.value = value;
        percent.textContent = value + ' %';
      }
      if (value < 100) requestAnimationFrame(progress);
      else requestAnimationFrame(() => {
        $('loading-screen').hidden = true;
        document.querySelector('.topbar').inert = false;
        document.querySelector('.shell').inert = false;
        home(false);
      });
    }
    requestAnimationFrame(progress);
    // Paint the cover before preparing the shaders and the first section of road.
    Promise.allSettled([$('loading-art').decode(), document.fonts.ready]).then(() => {
      requestAnimationFrame(() => {
        road.hidden = false;
        try {
          renderer = window.BusWorld.init(road);
          renderer.render(demo);
        } catch {
          renderer?.dispose();
          renderer = null;
          road.hidden = true;
        }
        ready = true;
      });
    });
  }

  function refreshSound() {
    const control = $('sound');
    if (control.getAttribute('aria-pressed') !== String(soundOn)) {
      control.innerHTML = icon(soundOn ? 'volume' : 'mute');
      control.setAttribute('aria-pressed', String(soundOn));
    }
    control.setAttribute('aria-label', soundOn ? 'Son activé' : 'Son coupé');
    control.title = soundOn ? 'Couper le son' : 'Activer le son';
    const level = soundOn ? volume : 0;
    volumeSlider.value = String(level);
    volumeSlider.style.setProperty('--level', level + '%');
    volumeSlider.setAttribute('aria-valuetext', level + ' %');
    $('volume-readout').textContent = level + ' %';
  }
  function saveSound() {
    try {
      localStorage.setItem('busstation3.volume', String(volume));
      localStorage.setItem('busstation3.sound', soundOn ? '1' : '0');
    } catch {}
  }
  function setSoundEnabled(on) {
    if (soundOn !== on) {
      soundOn = on;
      game.setSound(on);
    }
    refreshSound();
  }
  function setText(el, value) { if (el.textContent !== value) el.textContent = value; }
  function setDial(dial, value, animate) {
    const formatter = dial === gauges.lap ? lapNumber : number;
    if (typeof dial.update !== 'function') {
      setText(dial, formatter.format(value));
      return;
    }
    dial.animated = animate;
    if (dial.value !== value) {
      dial.update(value);
      dial.setAttribute('aria-label', formatter.format(value));
    }
  }
  function hud(state) {
    const rolling = state.status === 'running' && state.time > 0;
    setDial(gauges.score, state.score, rolling);
    setDial(gauges.distance, Math.floor(state.distance), rolling);
    setDial(gauges.lap, state.lap, rolling);
    setDial(gauges.speed, Math.round(state.speed), rolling);
    const canSpin = state.phase === 'driving' && state.jump?.long && !state.jump.spinDirection;
    const effectLabel = canSpin ? 'Braque pour un 360°' : state.slip ? 'Glissade' : state.boost ? 'Turbo'
      : state.flat ? 'Pneu crevé' : state.shoulderContact > 0 ? 'Accotement' : '';
    effect.hidden = !effectLabel;
    setText(effect,effectLabel);
  }
  function update(state) {
    if (view !== 'run') return;
    if (cabinet.dataset.phase !== state.phase) {
      cabinet.dataset.phase = state.phase;
      $('touch-controls').hidden = state.phase !== 'driving';
    }
    renderer.render(state);
    if (state.time - lastHud >= .16 || state.status === 'finished') { hud(state); lastHud = state.time; }
  }
  function showNotice({type, message, points}) {
    const card = document.createElement('div');
    card.className = 'notice-card';
    const headline = document.createElement('strong');
    headline.className = 'notice-headline';
    headline.textContent = points ? '+' + number.format(points) : impactTitles[type];
    if (points) {
      const unit = document.createElement('small');
      unit.textContent = 'pts';
      headline.append(unit);
    }
    const caption = document.createElement('span');
    caption.className = 'notice-caption';
    caption.textContent = message;
    card.append(headline, caption);
    notice.dataset.type = type;
    notice.replaceChildren(card);
    noticeStatus.replaceChildren(points ? message + ' : +' + points + ' points' : impactTitles[type] + ' ' + message);
  }
  notice.addEventListener('animationend', e => {
    if (e.target !== notice.firstElementChild) return;
    if (pendingNotices.length) showNotice(pendingNotices.shift());
    else notice.replaceChildren();
  });
  function clearNotices() {
    pendingNotices.length = 0;
    notice.replaceChildren();
    noticeStatus.replaceChildren();
  }
  function event(feedback, state) {
    hearts.set(state.health);
    // Refresh after the physics step has added all bonuses to the score.
    lastHud = -1;
    if (feedback.type === 'dodge') return;
    if (notice.firstElementChild) pendingNotices.push(feedback);
    else showNotice(feedback);
  }
  function showRun(active) {
    delete cabinet.dataset.phase;
    document.body.classList.toggle('in-race', active);
    $('attract').hidden = active;
    road.hidden = false;
    road.setAttribute('aria-hidden', String(!active));
    health.hidden = !active;
    if (active) hearts.set(3, false);
    $('pause').hidden = !active;
    $('touch-controls').hidden = !active;
    clearNotices();
    lastHud = -1;
  }
  function start() {
    if (view === 'loading') return;
    view = 'run';
    closeDialog();
    showRun(true);
    if (!renderer && !graphicsLost) {
      try { renderer = window.BusWorld.init(road); } catch { /* Show the rendering error below. */ }
    }
    if (!renderer || graphicsLost) {
      home();
      openDialog('error','gamepad','Rendu indisponible','<p class="modal-desc">La scène de jeu n’a pas pu démarrer. Recharge la page pour réessayer.</p><button class="secondary" data-action="close">Fermer</button>');
      return;
    }
    scoreId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10);
    scoreSaved = false;
    releaseControls();
    game.state.busModel = models[modelIndex].id;
    game.start();
    cabinet.focus({preventScroll:true});
    if (window.scrollY > 0) window.scrollTo(0, 0);
  }
  function home(focusPlay = true) {
    if (view !== 'loading') game.stop();
    view = 'home';
    demo.busModel = models[modelIndex].id;
    demo.busOpacity = 1;
    showRun(false);
    closeDialog();
    hud({score:0,distance:0,lap:1,speed:0,health:3});
    if (focusPlay) $('play').focus({preventScroll:true});
  }
  function openDialog(kind, symbol, heading, html, reveal = false) {
    releaseControls();
    cabinet.classList.add('is-paused');
    modal.classList.toggle('finish-reveal', reveal);
    panel = kind;
    title.toggleAttribute('autofocus', kind === 'finish');
    if (kind === 'finish') title.tabIndex = -1;
    title.textContent = heading;
    body.innerHTML = html;
    $('modal-symbol').innerHTML = icon(symbol);
    $('close-modal').hidden = kind === 'finish';
    const ranking = kind === 'scores';
    $('scores-tab').classList.toggle('selected',ranking);
    $('arcade-tab').classList.toggle('selected',!ranking);
    if (ranking) {
      $('scores-tab').setAttribute('aria-current','page');
      $('arcade-tab').removeAttribute('aria-current');
    } else {
      $('scores-tab').removeAttribute('aria-current');
      $('arcade-tab').setAttribute('aria-current','page');
    }
    if (!modal.open) modal.showModal();
    syncDemo();
    const focus = kind === 'finish' ? title : body.querySelector('[data-initial-focus]') || $('close-modal');
    if (!focus.hidden) focus.focus({preventScroll:true});
  }
  function closeDialog() {
    cabinet.classList.remove('is-paused');
    panel = '';
    if (modal.open) modal.close();
    $('scores-tab').classList.remove('selected');
    $('scores-tab').removeAttribute('aria-current');
    $('arcade-tab').classList.add('selected');
    $('arcade-tab').setAttribute('aria-current','page');
    syncDemo();
  }
  function pauseGame() {
    if (view !== 'run') return;
    game.pause();
    openDialog('pause','pause','Pause au terminus',
      '<p class="modal-desc">' + number.format(Math.floor(game.state.distance)) + ' m parcourus · Tour ' + game.state.lap + '</p><div class="modal-buttons"><button class="primary" data-action="resume" data-initial-focus>' + icon('play') + 'Reprendre</button>' +
      (game.state.phase === 'stopping' ? '' : '<button class="secondary" data-action="finish">Terminer la course</button>') + '</div>');
  }
  function resume() {
    if (graphicsLost) return;
    closeDialog();
    game.resume();
    cabinet.focus({preventScroll:true});
  }
  function finish(state) {
    const firstResult = view !== 'finish';
    view = 'finish';
    clearNotices();
    $('touch-controls').hidden = true;
    $('pause').hidden = true;
    hud(state);
    const metres = Math.floor(state.distance);
    const summary = '<strong class="end-score"><number-flow id="result-score">' + number.format(state.score) + '</number-flow> <span>pts</span></strong><p class="modal-desc"><number-flow id="result-distance">' + number.format(metres) + '</number-flow> m parcourus · Tour ' + state.lap + '</p>';
    const saving = scoreSaved ? '<p class="saved">Score enregistré.</p>' : '<form class="save-form" id="save-score"><label for="initials">Signe ton score avec trois lettres</label><div class="save-row"><input id="initials" name="initials" required minlength="3" maxlength="3" pattern="[A-Z]{3}" placeholder="ABC" autocomplete="off" autocapitalize="characters" spellcheck="false" title="Trois lettres de A à Z"><button type="submit" class="primary">Enregistrer</button></div></form>';
    openDialog('finish','flag','Fin de la course',summary + saving + '<div class="modal-buttons"><button class="secondary" data-action="restart">' + icon('retry') + 'Rejouer</button><button class="secondary" data-action="home">Accueil</button></div>',firstResult);
    const scoreDial = $('result-score');
    const roll = firstResult && typeof scoreDial.update === 'function'
      && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const resultDials = [[scoreDial, state.score], [$('result-distance'), metres]];
    for (const [dial, value] of resultDials) {
      if (typeof dial.update !== 'function') continue;
      dial.locales = 'fr-FR';
      dial.transformTiming = {duration: 830, easing: 'cubic-bezier(.22,.68,.2,1)'};
      dial.opacityTiming = {duration: 240, easing: 'ease-out'};
      dial.setAttribute('role', 'img');
      setDial(dial, roll ? 0 : value, false);
      dial.setAttribute('aria-label', number.format(value));
      dial.replaceChildren();
    }
    if (roll) {
      // Let the dialog's fade reveal the zeroes before the reels start turning.
      setTimeout(() => {
        for (const [dial, value] of resultDials) {
          if (dial.isConnected && modal.open) setDial(dial, value, true);
        }
      }, 160);
    }
    if (!scoreSaved) {
      const field = $('initials');
      field.addEventListener('input',() => {
        field.value = field.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z]/g,'').slice(0,3);
      });
      $('save-score').addEventListener('submit',saveScore);
    }
  }
  function results() {
    const rows = new Map(memoryScores);
    try {
      for (let i=0;i<localStorage.length;i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(rankingPrefix)) continue;
        let row;
        try { row = JSON.parse(localStorage.getItem(key)); } catch { continue; }
        if (row && /^[A-Z]{3}$/.test(row.name) && Number.isSafeInteger(row.score) && row.score >= 0 && Number.isFinite(row.distance)) rows.set(key,row);
      }
    } catch {}
    return [...rows.entries()].sort((a,b) => b[1].score - a[1].score || b[1].distance - a[1].distance || a[0].localeCompare(b[0]));
  }
  function saveScore(e) {
    e.preventDefault();
    const name = $('initials').value;
    if (scoreSaved || !/^[A-Z]{3}$/.test(name)) return;
    const key = rankingPrefix + scoreId;
    const row = {name,score:game.state.score,distance:Math.floor(game.state.distance)};
    memoryScores.set(key,row);
    let persistent = false;
    try {
      localStorage.setItem(key,JSON.stringify(row));
      persistent = true;
      results().slice(10).forEach(([old]) => { localStorage.removeItem(old); memoryScores.delete(old); });
    } catch {}
    scoreSaved = true;
    scores(persistent ? 'Score enregistré.' : 'Score conservé pour cette session. Le stockage local est indisponible.');
  }
  function scores(feedback='') {
    if (game.state.status === 'running') game.pause();
    const rows = results().slice(0,10);
    let content = '<p class="modal-desc">Les 10 meilleurs scores de cet appareil.</p>';
    if (feedback) content += '<p class="saved" role="status">' + feedback + '</p>';
    if (rows.length) {
      content += '<div class="table-scroll"><table class="scores-table"><thead><tr><th scope="col">Rang</th><th scope="col">Pseudo</th><th scope="col">Distance</th><th scope="col">Score</th></tr></thead><tbody>' +
        rows.map(([,r],i) => '<tr><td>' + String(i+1).padStart(2,'0') + '</td><td class="initials">' + r.name + '</td><td>' + number.format(r.distance) + ' m</td><td>' + number.format(r.score) + ' pts</td></tr>').join('') + '</tbody></table></div>';
    } else content += '<div class="empty-board">La première place est libre.<small>Termine une course pour y inscrire tes trois lettres.</small></div>';
    const run = view === 'run';
    const verb = run ? 'Reprendre' : view === 'finish' ? 'Rejouer' : 'Jouer';
    openDialog('scores','trophy','Classement local',content + '<div class="modal-buttons"><button class="primary" data-action="' + (run ? 'resume' : 'restart') + '" data-initial-focus>' + icon('play') + verb + '</button></div>');
  }
  function dismiss() {
    if (panel === 'pause') resume();
    else if (panel === 'finish') return;
    else if (panel === 'scores' && view === 'run') pauseGame();
    else if (panel === 'scores' && view === 'finish') finish(game.state);
    else closeDialog();
  }
  function enterArcade() {
    if (view === 'finish') finish(game.state);
    else if (view === 'run') pauseGame();
    else { closeDialog(); $('play').focus({preventScroll:true}); }
  }
  modal.addEventListener('cancel',e => { e.preventDefault(); dismiss(); });
  modal.addEventListener('click',e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'resume') resume();
    if (action === 'finish') {
      closeDialog();
      game.endRun();
      cabinet.focus({preventScroll:true});
    }
    if (action === 'restart') start();
    if (action === 'home') home();
    if (action === 'close') dismiss();
    if (e.target === modal) {
      const rect = modal.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) dismiss();
    }
  });
  $('close-modal').addEventListener('click',dismiss);
  $('play').addEventListener('click',start);
  $('bus-prev').addEventListener('click', () => selectModel(-1));
  $('bus-next').addEventListener('click', () => selectModel(1));
  $('arcade-tab').addEventListener('click',enterArcade);
  $('brand').addEventListener('click',enterArcade);
  $('scores-tab').addEventListener('click',() => scores());
  $('sound').addEventListener('click',() => {
    setSoundEnabled(!soundOn);
    saveSound();
  });
  volumeSlider.addEventListener('input', () => {
    const level = volumeSlider.valueAsNumber;
    if (level > 0) {
      volume = level;
      game.setVolume(level / 100);
    }
    setSoundEnabled(level > 0);
  });
  volumeSlider.addEventListener('change', saveSound);
  volumeSlider.addEventListener('pointerup', () => {
    if (game.state.status === 'running') cabinet.focus({preventScroll:true});
  });
  $('pause').addEventListener('click',pauseGame);

  const fullscreen = () => Boolean(document.fullscreenElement || cabinet.classList.contains('maximized'));
  const audioControls = $('audio-controls');
  const cornerActions = cabinet.querySelector('.corner-actions');
  function refreshSizeButton() {
    const full = fullscreen();
    const audioParent = full ? cornerActions : $('header-audio');
    if (audioControls.parentElement !== audioParent) audioParent.prepend(audioControls);
    $('expand').innerHTML = icon(full ? 'shrink' : 'expand');
    $('expand').title = full ? 'Quitter le plein écran' : 'Plein écran';
    $('expand').setAttribute('aria-label',$('expand').title);
    if (view === 'run' && game.state.status !== 'running') requestAnimationFrame(() => renderer.render(game.state));
  }
  $('expand').addEventListener('click',async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (cabinet.classList.contains('maximized')) { cabinet.classList.remove('maximized'); document.body.classList.remove('immersive'); }
    else {
      let native = false;
      if (cabinet.requestFullscreen) {
        try { await cabinet.requestFullscreen(); native = true; } catch {}
      }
      if (!native) { cabinet.classList.add('maximized'); document.body.classList.add('immersive'); }
    }
    refreshSizeButton();
  });
  // The dialog stays inside the active fullscreen element so controls remain available.
  cabinet.append(modal);
  document.addEventListener('fullscreenchange',refreshSizeButton);
  // Keyboard, touch buttons and the analog drag can be used at the same time.
  // Each release only clears its own input (e.g. lifting the brake while turning).
  const directions = new Map([
    ['arrowleft', -1], ['a', -1], ['q', -1],
    ['arrowright', 1], ['d', 1],
    ['arrowdown', 'brake'], ['s', 'brake']
  ]);
  const touchButtons = new Map([['left', -1], ['right', 1], ['brake', 'brake']]);

  function applyControls() {
    let left = 0;
    let right = 0;
    let braking = false;
    for (const input of heldControls.values()) {
      if (input === 'brake') braking = true;
      else {
        left = Math.min(left, input);
        right = Math.max(right, input);
      }
    }
    game.steer(left + right);
    game.brake(braking);
    $('left').classList.toggle('is-held', left < 0);
    $('right').classList.toggle('is-held', right > 0);
    $('brake').classList.toggle('is-held', braking);
  }
  function releaseControls() {
    drag = null;
    heldControls.clear();
    applyControls();
  }
  function setControl(id, value) {
    if (game.state.status !== 'running' || game.state.phase === 'stopping' || modal.open) return;
    heldControls.set(id, value);
    applyControls();
  }
  function releaseControl(id) {
    if (heldControls.delete(id)) applyControls();
  }
  function handleKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.matches('input,textarea,[contenteditable=true]')) return;
    if (modal.open) {
      if (panel === 'pause' && ['p','P',' '].includes(e.key) && !e.repeat) { e.preventDefault(); resume(); }
      return;
    }
    if (view === 'home') {
      if (e.key === 'Enter' && !e.target.closest('button')) { e.preventDefault(); start(); }
      return;
    }
    if (game.state.status !== 'running') return;
    const key = e.key.toLowerCase();
    const buttonInput = [' ', 'enter'].includes(key) ? touchButtons.get(e.target.id) : undefined;
    const input = buttonInput ?? directions.get(key);
    if (input !== undefined) {
      e.preventDefault();
      if (!e.repeat) setControl('key-' + (e.code || key), input);
    } else if ([' ', 'p', 'escape'].includes(key)) {
      e.preventDefault();
      if (!e.repeat) pauseGame();
    }
  }
  document.addEventListener('keydown', handleKey);
  document.addEventListener('keyup', e => releaseControl('key-' + (e.code || e.key.toLowerCase())));

  function finishPointer(e) {
    if (drag?.id === e.pointerId) drag = null;
    releaseControl(e.pointerId);
  }
  for (const [id, input] of touchButtons) {
    const button = $(id);
    button.addEventListener('pointerdown', e => {
      if (e.button !== 0 || game.state.status !== 'running') return;
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      setControl(e.pointerId, input);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, finishPointer);
    // Assistive technologies can activate a button without sending pointer events.
    button.addEventListener('click', e => {
      if (e.detail !== 0 || game.state.status !== 'running') return;
      const source = Symbol(id);
      setControl(source, input);
      window.setTimeout(() => releaseControl(source), 130);
    });
  }
  road.addEventListener('pointerdown', e => {
    if (e.button !== 0 || drag || game.state.status !== 'running') return;
    e.preventDefault();
    road.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, range: Math.min(120, Math.max(48, road.clientWidth * .16)) };
  });
  road.addEventListener('pointermove', e => {
    if (drag?.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const amount = Math.sign(dx) * Math.min(1, Math.max(0, Math.abs(dx) - 3) / drag.range);
    setControl(e.pointerId, amount);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) road.addEventListener(name, finishPointer);
  road.addEventListener('webglcontextlost', () => {
    graphicsLost = true;
    syncDemo();
    if (game.state.status === 'running') pauseGame();
    if (panel === 'pause') {
      const resumeButton = body.querySelector('[data-action="resume"]');
      resumeButton.disabled = true;
      resumeButton.textContent = 'Restauration de l’image…';
    }
  });
  road.addEventListener('webglcontextrestored', () => {
    graphicsLost = false;
    syncDemo();
    if (view === 'run' && game.state.status === 'paused') {
      requestAnimationFrame(() => renderer.render(game.state));
      if (panel === 'pause') pauseGame();
    }
  });
  document.addEventListener('visibilitychange',() => {
    if (document.hidden && game.state.status === 'running') pauseGame();
    syncDemo();
  });
  reducedMotion.addEventListener('change', syncDemo);
  window.addEventListener('resize', () => { if (reducedMotion.matches) syncDemo(); });
  window.addEventListener('blur',() => { if (game.state.status === 'running') pauseGame(); });
  window.addEventListener('storage',e => { if (panel === 'scores' && e.key?.startsWith(rankingPrefix)) scores(); });
  showModelName();
  refreshSound();
  loadArcade();
})();
