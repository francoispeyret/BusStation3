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
    heart: '<path d="M20.7 5.7c-2-2-5.3-1.8-7.3.3L12 7.5 10.6 6c-2-2.1-5.3-2.3-7.3-.3-2.1 2.1-1.7 5.3.4 7.6L12 21l8.3-7.7c2.1-2.3 2.5-5.5.4-7.6Z"/>',
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
  const gauges = Object.fromEntries(['score','distance','lap','speed','tach','health'].map(key => [key, $(key)]));
  const rankingPrefix = 'busstation3.result.';
  const memoryScores = new Map();
  let renderer, view = 'home', panel = '', scoreId = '', scoreSaved = false, lastHud = -1, lastHealth = -1, noticeUntil = 0;
  let graphicsLost = false;
  let soundOn = true;
  try { soundOn = localStorage.getItem('busstation3.sound') !== '0'; } catch {}
  const game = window.BusDrive.create({ onUpdate: update, onEvent: event, onFinish: finish });
  game.setSound(soundOn);

  function refreshSound() {
    const control = $('sound');
    const label = soundOn ? 'Son activé' : 'Son coupé';
    control.innerHTML = icon(soundOn ? 'volume' : 'mute') + '<span>' + label + '</span>';
    control.setAttribute('aria-pressed', String(soundOn));
    control.setAttribute('aria-label', label);
    control.title = soundOn ? 'Couper le son' : 'Activer le son';
  }
  function setText(el, value) { if (el.textContent !== value) el.textContent = value; }
  function hud(state) {
    setText(gauges.score, number.format(state.score));
    setText(gauges.distance, number.format(Math.floor(state.distance)));
    setText(gauges.lap, String(state.lap).padStart(2,'0'));
    setText(gauges.speed, String(Math.round(state.speed)));
    const rpm = state.rpm || 0;
    const bars = Math.round(Math.min(1,rpm / 4600) * 7);
    Array.from(gauges.tach.children).forEach((bar, index) => bar.classList.toggle('lit',index < bars));
    const rpmText = number.format(Math.round(rpm / 50) * 50) + ' tr/min';
    if (state.gear) setText($('engine'), rpmText);
    gauges.tach.title = rpmText;
    gauges.tach.setAttribute('aria-label',rpmText);
    if (lastHealth !== state.health) {
      gauges.health.innerHTML = [1,2,3].map(n => '<b class="' + (n > state.health ? 'empty' : '') + '"></b>').join('');
      gauges.health.parentElement.setAttribute('aria-label','État du bus, ' + state.health + ' sur 3');
      lastHealth = state.health;
    }
    const effectLabel = state.slip ? 'Glissade' : state.boost ? 'Turbo' : state.flat ? 'Pneu crevé' : '';
    effect.hidden = !effectLabel;
    setText(effect,effectLabel);
  }
  function update(state) {
    if (view !== 'run') return;
    renderer.render(state);
    if (state.time - lastHud >= .08 || state.status === 'finished') { hud(state); lastHud = state.time; }
    if (!notice.hidden && state.time > noticeUntil) notice.hidden = true;
  }
  function event({message},state) {
    notice.textContent = message;
    notice.hidden = false;
    noticeUntil = state.time + 1.25;
    hud(state);
  }
  function showRun(active) {
    $('attract').hidden = active;
    road.hidden = !active;
    $('run-info').hidden = !active;
    $('pause').hidden = !active;
    $('touch-controls').hidden = !active;
    notice.hidden = true;
    lastHud = -1;
  }
  function start() {
    closeDialog();
    view = 'run';
    showRun(true);
    try { renderer ||= window.BusWorld.init(road); }
    catch {
      home();
      openDialog('error','gamepad','Rendu indisponible','<p class="modal-desc">La scène de jeu n’a pas pu démarrer. Recharge la page pour réessayer.</p><button class="secondary" data-action="close">Fermer</button>');
      return;
    }
    scoreId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10);
    scoreSaved = false;
    game.start();
    cabinet.focus({preventScroll:true});
    if (cabinet.getBoundingClientRect().top < 0) cabinet.scrollIntoView({block:'start'});
  }
  function home() {
    closeDialog();
    game.stop();
    view = 'home';
    showRun(false);
    hud({score:0,distance:0,lap:1,speed:0,health:3});
    $('play').focus({preventScroll:true});
  }
  function openDialog(kind, symbol, heading, html) {
    panel = kind;
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
    const focus = body.querySelector('[data-initial-focus]') || $('close-modal');
    if (!focus.hidden) focus.focus({preventScroll:true});
  }
  function closeDialog() {
    panel = '';
    if (modal.open) modal.close();
    $('scores-tab').classList.remove('selected');
    $('scores-tab').removeAttribute('aria-current');
    $('arcade-tab').classList.add('selected');
    $('arcade-tab').setAttribute('aria-current','page');
  }
  function pauseGame() {
    if (view !== 'run') return;
    game.pause();
    openDialog('pause','pause','Pause au terminus',
      '<p class="modal-desc">' + number.format(Math.floor(game.state.distance)) + ' m parcourus · Tour ' + game.state.lap + '</p><div class="modal-buttons"><button class="primary" data-action="resume" data-initial-focus>' + icon('play') + 'Reprendre</button><button class="secondary" data-action="finish">Terminer la course</button></div>');
  }
  function resume() {
    if (graphicsLost) return;
    closeDialog();
    game.resume();
    cabinet.focus({preventScroll:true});
  }
  function finish(state) {
    view = 'finish';
    $('touch-controls').hidden = true;
    $('pause').hidden = true;
    hud(state);
    const summary = '<strong class="end-score">' + number.format(state.score) + ' <span>pts</span></strong><p class="modal-desc">' + number.format(Math.floor(state.distance)) + ' m parcourus · Tour ' + state.lap + '</p>';
    const saving = scoreSaved ? '<p class="saved">Score enregistré.</p>' : '<form class="save-form" id="save-score"><label for="initials">Signe ton score avec trois lettres</label><div class="save-row"><input id="initials" name="initials" required minlength="3" maxlength="3" pattern="[A-Z]{3}" placeholder="ABC" autocomplete="off" autocapitalize="characters" spellcheck="false" title="Trois lettres de A à Z"><button type="submit" class="primary">Enregistrer</button></div></form>';
    openDialog('finish','flag','Fin de la course',summary + saving + '<div class="modal-buttons"><button class="secondary" data-action="restart">' + icon('retry') + 'Rejouer</button><button class="secondary" data-action="home">Accueil</button></div>');
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
    if (action === 'finish') { game.stop(); finish(game.state); }
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
  $('arcade-tab').addEventListener('click',enterArcade);
  $('brand').addEventListener('click',enterArcade);
  $('scores-tab').addEventListener('click',() => scores());
  $('sound').addEventListener('click',() => {
    soundOn = !soundOn;
    game.setSound(soundOn);
    try { localStorage.setItem('busstation3.sound',soundOn ? '1' : '0'); } catch {}
    refreshSound();
  });
  $('pause').addEventListener('click',pauseGame);

  const fullscreen = () => Boolean(document.fullscreenElement || cabinet.classList.contains('maximized'));
  function refreshSizeButton() {
    const full = fullscreen();
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
    if (!['arrowleft','arrowright','arrowdown','a','q','d','s',' ','p','escape'].includes(key)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (key === 'arrowleft' || key === 'a' || key === 'q') game.move(-1);
    else if (key === 'arrowright' || key === 'd') game.move(1);
    else if (key === 'arrowdown' || key === 's') game.brake(true);
    else pauseGame();
  }
  document.addEventListener('keydown',handleKey);
  document.addEventListener('keyup',e => { if (['ArrowDown','s','S'].includes(e.key)) game.brake(false); });
  for (const [id,direction] of [['left',-1],['right',1]]) {
    $(id).addEventListener('click',() => game.move(direction));
  }
  $('brake').addEventListener('pointerdown',e => { e.preventDefault(); $('brake').setPointerCapture(e.pointerId); game.brake(true); });
  for (const name of ['pointerup','pointercancel','lostpointercapture']) $('brake').addEventListener(name,() => game.brake(false));
  let swipe = null;
  road.addEventListener('pointerdown',e => { swipe = {id:e.pointerId,x:e.clientX,y:e.clientY}; road.setPointerCapture(e.pointerId); });
  road.addEventListener('pointerup',e => {
    if (swipe?.id === e.pointerId) {
      const dx = e.clientX - swipe.x;
      if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(e.clientY-swipe.y)) game.move(Math.sign(dx));
    }
    swipe = null;
  });
  road.addEventListener('pointercancel',() => { swipe = null; });
  road.addEventListener('webglcontextlost', () => {
    graphicsLost = true;
    if (game.state.status === 'running') pauseGame();
    if (panel === 'pause') {
      const resumeButton = body.querySelector('[data-action="resume"]');
      resumeButton.disabled = true;
      resumeButton.textContent = 'Restauration de l’image…';
    }
  });
  road.addEventListener('webglcontextrestored', () => {
    graphicsLost = false;
    if (view === 'run' && game.state.status === 'paused') {
      requestAnimationFrame(() => renderer.render(game.state));
      if (panel === 'pause') pauseGame();
    }
  });
  document.addEventListener('visibilitychange',() => { if (document.hidden && game.state.status === 'running') pauseGame(); });
  window.addEventListener('blur',() => { if (game.state.status === 'running') pauseGame(); });
  window.addEventListener('storage',e => { if (panel === 'scores' && e.key?.startsWith(rankingPrefix)) scores(); });
  refreshSound();
})();
