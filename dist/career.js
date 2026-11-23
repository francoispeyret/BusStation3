(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const accounts = window.CareerProfiles;
  const menu = $('service-menu');
  const stage = $('city-stage');
  const screen = $('city-view');
  const notices = window.BusNotices.create($('fare-notice'), $('fare-status'));
  const format = new Intl.NumberFormat('fr-FR');
  const pacer = window.BusSettings.createFramePacer();
  const keys = new Map(Object.entries({
    ArrowUp:'accelerate', z:'accelerate', w:'accelerate',
    ArrowDown:'brake', s:'brake', ArrowLeft:'left', q:'left', a:'left', ArrowRight:'right', d:'right'
  }));
  const held = new Map();
  const touchButtons = document.querySelectorAll('[data-drive]');
  let driver, sim, renderer, frame, lastFrame, lastHud = 0;
  const profiles = accounts.mount($('profiles'), {onSelect:startService});

  function write(id, value) {
    const element = $(id);
    if (element.textContent !== String(value)) element.textContent = value;
  }

  function releaseControls() {
    held.clear();
    touchButtons.forEach(button => button.classList.remove('is-held'));
  }

  function stopDistance(stop) {
    return Math.hypot(sim.state.bus.x - stop.x, sim.state.bus.y - stop.y);
  }

  function refreshInstruments() {
    const {stops, nearbyStop, passengers, bus, doorsOpen, serviceComplete, district} = sim.state;
    const requested = passengers.length && stops.find(stop => stop.id === passengers[0].destination);
    const closest = nearbyStop || stops.reduce((best, stop) => stopDistance(best) < stopDistance(stop) ? best : stop);
    const target = requested || closest;
    write('stop-label', requested ? 'Arrêt demandé' : 'Arrêt le plus proche');
    write('stop-number', String(stops.indexOf(target) + 1).padStart(2, '0'));
    write('stop-name', target.name);
    write('stop-distance', Math.round(stopDistance(target)) + ' m');
    write('district', district);
    write('balance', format.format(driver.balance));
    write('onboard', passengers.length);
    write('bus-speed', Math.abs(Math.round(bus.speed * 3.6)));
    $('door-prompt').hidden = !nearbyStop && !doorsOpen;
    if (nearbyStop) {
      const moving = Math.abs(bus.speed) > .8;
      let info = nearbyStop.name;
      if (moving) info += ' · Immobilise le bus';
      else if (doorsOpen) info += serviceComplete ? ' · Échanges terminés' : ' · Échanges en cours';
      else if (nearbyStop.waiting.length) info += ' · ' + nearbyStop.waiting.length + ' en attente';
      write('platform-status', info);
      write('door-action', doorsOpen ? 'Fermer les portes' : 'Ouvrir les portes');
      $('doors').disabled = moving || (doorsOpen && !serviceComplete);
    }
  }

  function feedback(event) {
    if (event.type === 'boarding') {
      const updated = accounts.recordBoarding(driver.id, event.fare);
      if (updated) driver = updated;
      else driver.balance += event.fare;
      notices.push({type:'repair', title:'+' + event.fare, unit:'€$', message:'Passager à bord'});
    } else if (event.type === 'alighting') {
      notices.push({type:'lap', title:'Descente', message:event.stopName});
    } else if (event.type === 'collision') {
      notices.push({type:'collision', title:'Accrochage !', message:'Reprends le volant'});
    } else if (event.type === 'hint') {
      notices.push({type:'hint', title:'Portes', message:event.message});
    }
    lastHud = 0;
  }

  function draw(now) {
    if (!sim || menu.open) return;
    const input = {};
    for (const control of held.values()) input[control] = true;
    if (lastFrame !== undefined) sim.update((now - lastFrame) / 1000, input);
    lastFrame = now;
    if (pacer.due(now)) renderer.draw(sim.state);
    if (now - lastHud >= 100) {
      refreshInstruments();
      renderer.drawMap($('mini-map'), sim.state);
      lastHud = now;
    }
    frame = requestAnimationFrame(draw);
  }

  function run() {
    cancelAnimationFrame(frame);
    lastFrame = undefined;
    lastHud = 0;
    pacer.reset();
    screen.focus({preventScroll:true});
    frame = requestAnimationFrame(draw);
  }

  function startService(profile) {
    driver = profile;
    sim = window.CareerSim.create({onEvent:feedback});
    $('profiles').hidden = true;
    $('back-home').hidden = true;
    $('service').hidden = false;
    $('driver-strip').hidden = false;
    $('driver-avatar').src = accounts.avatarUrl(driver.avatar);
    write('driver-name', driver.name);
    let busId;
    try { busId = localStorage.getItem('busstation3.busModel'); } catch {}
    renderer ??= window.CareerRender.create(screen, {busId});
    window.scrollTo(0, 0);
    refreshInstruments();
    run();
  }

  function drawStopList() {
    const {passengers, stops} = sim.state;
    const list = $('stop-list');
    list.replaceChildren();
    stops.forEach((stop, index) => {
      const li = document.createElement('li');
      const number = document.createElement('span');
      number.className = 'stop-index';
      number.textContent = index + 1;
      const count = passengers.filter(person => person.destination === stop.id).length;
      li.classList.toggle('requested', count > 0);
      li.append(number, stop.name + (count ? ' · ' + count + ' à déposer' : ''));
      list.append(li);
    });
  }

  function openMenu(showMap) {
    if (!sim) return;
    cancelAnimationFrame(frame);
    releaseControls();
    stage.classList.add('is-paused');
    $('map-panel').hidden = !showMap;
    $('pause-details').hidden = showMap;
    $('menu-map').hidden = showMap;
    menu.classList.toggle('show-map', showMap);
    write('menu-title', showMap ? 'Plan du réseau' : 'Service en pause');
    write('service-takings', 'Recettes de ce service · ' + format.format(sim.state.earnings) + ' €$');
    if (!menu.open) menu.showModal();
    if (showMap) {
      drawStopList();
      renderer.drawMap($('network-map'), sim.state);
    }
    $('resume-service').focus();
  }

  function resume() {
    menu.close();
    stage.classList.remove('is-paused');
    run();
  }

  function endService() {
    menu.close();
    cancelAnimationFrame(frame);
    releaseControls();
    notices.clear();
    stage.classList.remove('is-paused');
    sim = null;
    $('service').hidden = true;
    $('driver-strip').hidden = true;
    $('profiles').hidden = false;
    $('back-home').hidden = false;
    profiles.refresh();
    $('profiles').querySelector('button')?.focus();
  }

  function doors() {
    sim.toggleDoors();
    refreshInstruments();
  }

  $('doors').addEventListener('click', doors);
  $('pause-service').addEventListener('click', () => openMenu(false));
  $('open-map').addEventListener('click', () => openMenu(true));
  $('menu-map').addEventListener('click', () => openMenu(true));
  $('resume-service').addEventListener('click', resume);
  $('change-profile').addEventListener('click', endService);
  menu.addEventListener('cancel', event => { event.preventDefault(); resume(); });
  window.addEventListener('resize', () => {
    if (sim && menu.open && !$('map-panel').hidden) renderer.drawMap($('network-map'), sim.state);
  });
  document.addEventListener('keydown', event => {
    if (!sim || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (menu.open) {
      if (['p','m'].includes(key) && !event.repeat) resume();
      return;
    }
    const control = keys.get(key);
    if (control) {
      event.preventDefault();
      held.set(event.code || key, control);
    } else if (['e','m','p','Escape'].includes(key)) {
      event.preventDefault();
      if (event.repeat) return;
      if (key === 'e') doors();
      else openMenu(key === 'm');
    }
  });
  document.addEventListener('keyup', event => held.delete(event.code || event.key));
  for (const button of touchButtons) {
    function release(event) {
      held.delete(event.pointerId);
      if (![...held.values()].includes(button.dataset.drive)) button.classList.remove('is-held');
    }
    button.addEventListener('pointerdown', event => {
      if (!sim || menu.open || event.button !== 0) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      button.classList.add('is-held');
      held.set(event.pointerId, button.dataset.drive);
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('pointercancel', release);
  }
  function autoPause() {
    if (sim && !menu.open) openMenu(false);
  }
  window.addEventListener('blur', autoPause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
})();
