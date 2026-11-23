(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const accounts = window.CareerProfiles;
  const menu = $('service-menu');
  const stage = $('city-stage');
  const screen = $('city-view');
  const notices = window.BusNotices.create($('fare-notice'), $('fare-status'));
  const format = new Intl.NumberFormat('fr-FR');
  const {mountCounter} = window.BusControls;
  const balanceDial = mountCounter($('balance'));
  const onboardDial = mountCounter($('onboard'));
  const speedDial = mountCounter($('bus-speed'));
  const fuelDial = mountCounter($('fuel-value'), 100);
  const reserveLevel = 25;
  const pacer = window.BusSettings.createFramePacer();
  const audio = window.BusAudio.create();
  const keys = new Map(Object.entries({
    ArrowUp:'accelerate', z:'accelerate', w:'accelerate',
    ArrowDown:'brake', s:'brake', ArrowLeft:'left', q:'left', a:'left', ArrowRight:'right', d:'right'
  }));
  const held = new Map();
  const touchButtons = document.querySelectorAll('[data-drive]');
  let driver, sim, renderer, frame, lastFrame, lastHud = 0;
  let nextEngineUpdate = 0, brakingToStop = false, lastAirBrake = -Infinity;
  const cancelSteeringDrag = window.BusControls.bindSteeringDrag(screen, () => sim && !menu.open,
    (id, amount) => held.set(id, amount), id => held.delete(id));
  const profiles = accounts.mount($('profiles'), {onSelect:startService});
  window.BusControls.mountSound($('audio-controls'), audio, () => {
    if (sim && !menu.open) screen.focus({preventScroll:true});
  });
  window.BusControls.mountGraphics($('graphics-controls'), () => {
    if (sim && menu.open) renderer.draw(sim.state);
  });

  function write(id, value) {
    const element = $(id);
    if (element.textContent !== String(value)) element.textContent = value;
  }

  function releaseControls() {
    cancelSteeringDrag();
    held.clear();
    touchButtons.forEach(button => button.classList.remove('is-held'));
  }

  function stopDistance(stop) {
    return Math.hypot(sim.state.bus.x - stop.x, sim.state.bus.y - stop.y);
  }

  function refreshInstruments(animate = true) {
    const {stops, nearbyStop, passengers, bus, doorsOpen, serviceComplete, district, map, fuel, nearbyFuelStation, refueling, boost} = sim.state;
    const requested = passengers.length && stops.find(stop => stop.id === passengers[0].destination);
    const reserve = fuel <= reserveLevel;
    const closest = nearbyStop || stops.reduce((best, stop) => stopDistance(best) < stopDistance(stop) ? best : stop);
    const station = nearbyFuelStation || (reserve && map.fuelStations.reduce((best, pump) => stopDistance(best) < stopDistance(pump) ? best : pump));
    const target = station || requested || closest;
    const stopLabel = requested ? 'Arrêt demandé' : 'Arrêt le plus proche';
    write('stop-label', station ? (nearbyFuelStation ? 'Station-service' : 'Réserve · Station la plus proche') : stopLabel);
    $('stop-number').hidden = !!station;
    $('station-marker').toggleAttribute('hidden', !station);
    if (!station) write('stop-number', String(stops.indexOf(target) + 1).padStart(2, '0'));
    write('stop-name', target.name);
    write('stop-distance', Math.round(stopDistance(target)) + ' m');
    write('district', district);
    balanceDial(driver.balance, animate);
    onboardDial(passengers.length, animate);
    speedDial(Math.abs(Math.round(bus.speed * 3.6)), animate);
    write('speed-label', boost > 0 ? 'Turbo' : 'Vitesse');
    $('speed-instrument').classList.toggle('turbo-active', boost > 0);
    const level = Math.ceil(fuel);
    fuelDial(level, animate);
    const meter = $('fuel-meter');
    if (meter.getAttribute('aria-valuenow') !== String(level)) {
      meter.setAttribute('aria-valuenow', level);
      meter.setAttribute('aria-valuetext', level + ' %');
      meter.style.setProperty('--fuel-level', level + '%');
    }
    const gauge = $('fuel-instrument');
    if (reserve && !gauge.classList.contains('on-reserve') && !nearbyFuelStation && !sim.state.outOfFuel) {
      notices.push({type:'hint', title:'Réserve d’essence', message:station.name + ' · ' + Math.round(stopDistance(station)) + ' m'});
    }
    gauge.classList.toggle('on-reserve', reserve);
    let platformStatus = '';
    if (nearbyFuelStation) {
      const instruction = refueling ? 'Plein en cours' : level === 100 ? 'Réservoir plein' : 'Immobilise le bus à la pompe';
      platformStatus = nearbyFuelStation.name + ' · ' + instruction;
    } else if (nearbyStop) {
      let instruction = 'Immobilise le bus pour ouvrir les portes';
      if (doorsOpen) instruction = 'Portes ouvertes · Échanges en cours';
      else if (serviceComplete) instruction = 'Tu peux repartir';
      platformStatus = nearbyStop.name + ' · ' + instruction;
    }
    write('platform-status', platformStatus);
  }

  function feedback(event) {
    if (event.type === 'boarding') {
      audio.effect('boarding');
      const updated = accounts.recordBoarding(driver.id, event.fare);
      if (updated) driver = updated;
      else driver.balance += event.fare;
      notices.push({type:'repair', title:'+' + event.fare, unit:'€$', message:'Passager à bord'});
    } else if (event.type === 'alighting') {
      notices.push({type:'lap', title:'Descente', message:event.stopName});
    } else if (event.type === 'collision') {
      audio.effect('collision');
      notices.push({type:'collision', title:'Accrochage !', message:'Choc avec une voiture'});
    } else if (event.type === 'cone') {
      audio.effect('cone');
      notices.push({type:'cone', title:'Oups !', message:event.message});
    } else if (event.type === 'boost') {
      audio.effect('boost');
      notices.push({type:'boost', title:'Turbo', message:'Accélération'});
    } else if (event.type === 'doors' && sim.state.doorsOpen) {
      airBrake();
    } else if (event.type === 'refueled') {
      notices.push({type:'repair', title:'Plein terminé', message:'Tu peux repartir'});
    }
    lastHud = 0;
  }

  function airBrake() {
    if (sim.state.time - lastAirBrake < 1.2) return;
    lastAirBrake = sim.state.time;
    audio.airBrake();
  }
  function updateEngine(braking) {
    const {time, bus, boost} = sim.state;
    audio.update({time, speed:Math.abs(bus.speed) * 3.6, braking, boost});
    nextEngineUpdate = time + .09;
  }

  function draw(now) {
    if (!sim || menu.open) return;
    const input = {};
    for (const control of held.values()) {
      if (typeof control === 'number') input.steer = control;
      else input[control] = true;
    }
    if (input.brake && sim.state.bus.speed > 3) brakingToStop = true;
    if (!input.brake) brakingToStop = false;
    if (lastFrame !== undefined) sim.update((now - lastFrame) / 1000, input);
    if (sim.state.outOfFuel) {
      notices.clear();
      refreshInstruments(false);
      renderer.draw(sim.state);
      renderer.drawMap($('mini-map'), sim.state);
      openMenu(false);
      return;
    }
    if (brakingToStop && sim.state.bus.speed < .8) {
      airBrake();
      brakingToStop = false;
    }
    if (sim.state.time >= nextEngineUpdate) updateEngine(input.brake && sim.state.bus.speed >= 0);
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
    updateEngine(false);
    audio.setDriving(true);
    screen.focus({preventScroll:true});
    frame = requestAnimationFrame(draw);
  }

  function startService(profile) {
    driver = profile;
    sim = window.CareerSim.create({onEvent:feedback});
    lastAirBrake = -Infinity;
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
    refreshInstruments(false);
    run();
    audio.horn();
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
    const stations = $('fuel-station-list');
    stations.replaceChildren();
    for (const station of sim.state.map.fuelStations) {
      const item = document.createElement('li');
      const distance = document.createElement('span');
      distance.textContent = Math.round(stopDistance(station)) + ' m';
      item.append(station.name + ' ', distance);
      stations.append(item);
    }
  }

  function openMenu(showMap) {
    if (!sim) return;
    cancelAnimationFrame(frame);
    releaseControls();
    brakingToStop = false;
    audio.setDriving(false);
    stage.classList.add('is-paused');
    const gameOver = sim.state.outOfFuel;
    showMap = showMap && !gameOver;
    $('map-panel').hidden = !showMap;
    $('pause-details').hidden = showMap || gameOver;
    $('menu-map').hidden = showMap || gameOver;
    $('resume-service').hidden = gameOver;
    $('restart-service').hidden = !gameOver;
    $('service-result').hidden = !gameOver;
    menu.classList.toggle('show-map', showMap);
    write('menu-title', gameOver ? 'Panne sèche' : showMap ? 'Plan du réseau' : 'Service en pause');
    const earnings = format.format(sim.state.earnings) + ' €$';
    if (gameOver) {
      write('result-distance', format.format(Math.round(sim.state.distance)) + ' m');
      write('result-earnings', earnings);
    } else write('service-takings', 'Recettes de ce service · ' + earnings);
    if (!menu.open) menu.showModal();
    if (showMap) {
      drawStopList();
      renderer.drawMap($('network-map'), sim.state);
    }
    $(gameOver ? 'restart-service' : 'resume-service').focus();
  }

  function resume() {
    if (!sim || sim.state.outOfFuel) return;
    menu.close();
    stage.classList.remove('is-paused');
    run();
  }

  function endService() {
    menu.close();
    cancelAnimationFrame(frame);
    releaseControls();
    audio.setDriving(false);
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

  $('horn').addEventListener('click', () => audio.horn());
  $('pause-service').addEventListener('click', () => openMenu(false));
  $('open-map').addEventListener('click', () => openMenu(true));
  $('menu-map').addEventListener('click', () => openMenu(true));
  $('resume-service').addEventListener('click', resume);
  $('restart-service').addEventListener('click', () => {
    menu.close();
    stage.classList.remove('is-paused');
    startService(driver);
  });
  $('change-profile').addEventListener('click', endService);
  $('exit-career').addEventListener('click', () => {
    endService();
    window.location.assign('index.html');
  });
  menu.addEventListener('cancel', event => { event.preventDefault(); resume(); });
  window.addEventListener('resize', () => {
    if (sim && menu.open && !$('map-panel').hidden) renderer.drawMap($('network-map'), sim.state);
  });
  document.addEventListener('keydown', event => {
    if (!sim || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (menu.open) {
      if (['p','m'].includes(key) && !event.repeat) resume();
      return;
    }
    const control = keys.get(key);
    if (control) {
      event.preventDefault();
      held.set(event.code || key, control);
    } else if (['h','m','p','Escape'].includes(key)) {
      event.preventDefault();
      if (event.repeat) return;
      if (key === 'h') audio.horn();
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
  window.addEventListener('pagehide', autoPause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
})();
