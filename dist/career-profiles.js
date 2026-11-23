(function () {
  'use strict';

  const avatars = [
    {id:'moka', name:'Moka', detail:'Foulard orange et deux chignons'},
    {id:'marin', name:'Marin', detail:'Casquette de marin et moustache grise'},
    {id:'yuki', name:'Yuki', detail:'Carré noir et lunettes rondes'},
    {id:'robin', name:'Robin', detail:'Casquette verte et ciré jaune'},
    {id:'zelie', name:'Zélie', detail:'Cheveux argentés et lunettes violettes'},
    {id:'sami', name:'Sami', detail:'Turban turquoise et veste orange'},
    {id:'lou', name:'Lou', detail:'Boucles lilas et veste verte'},
    {id:'rosa', name:'Rosa', detail:'Cheveux noirs et foulard rose'},
    {id:'milo', name:'Milo', detail:'Béret bordeaux et longues boucles'},
    {id:'tao', name:'Tao', detail:'Lunettes ambrées et bleu de travail'}
  ];
  const namespace = 'busstation3.career.';
  const profilePrefix = namespace + 'profile.';
  const farePrefix = namespace + 'fares.';
  const memory = new Map();
  const session = uniqueId();
  const numbers = new Intl.NumberFormat('fr-FR');
  let storageAvailable = true;

  function uniqueId() {
    return window.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  function avatarUrl(id) {
    const avatar = avatars.find(item => item.id === id) || avatars[0];
    return 'assets/career/' + avatar.id + '.webp';
  }

  function storedRecords() {
    if (!storageAvailable) return memory;
    try {
      const storage = window.localStorage;
      const records = new Map();
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key || !key.startsWith(namespace)) continue;
        try {
          const value = JSON.parse(storage.getItem(key));
          if (value && typeof value === 'object') records.set(key, value);
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
      }
      memory.clear();
      records.forEach((value, key) => memory.set(key, value));
    } catch {
      storageAvailable = false;
    }
    return memory;
  }

  function save(key, value) {
    memory.set(key, value);
    if (!storageAvailable) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      storageAvailable = false;
    }
  }

  function list() {
    const records = storedRecords();
    const profiles = new Map();
    records.forEach((value, key) => {
      if (!key.startsWith(profilePrefix) || typeof value.name !== 'string' || !value.name.trim()) return;
      const id = key.slice(profilePrefix.length);
      const avatar = avatars.find(item => item.id === value.avatar) || avatars[0];
      profiles.set(id, {id, name:value.name.slice(0, 24), avatar:avatar.id, balance:0, passengers:0});
    });
    records.forEach((value, key) => {
      if (!key.startsWith(farePrefix)) return;
      const profile = profiles.get(key.slice(farePrefix.length).split('.')[0]);
      if (!profile || !Number.isSafeInteger(value.balance) || value.balance < 0 ||
          !Number.isSafeInteger(value.passengers) || value.passengers < 0) return;
      profile.balance += value.balance;
      profile.passengers += value.passengers;
    });
    return Array.from(profiles.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  function get(id) {
    return list().find(profile => profile.id === id) || null;
  }

  function create(name, avatar) {
    if (typeof name !== 'string' || !name.trim() || !avatars.some(item => item.id === avatar)) return null;
    const id = uniqueId();
    const profile = {name:name.trim().slice(0, 24), avatar};
    save(profilePrefix + id, profile);
    return {id, ...profile, balance:0, passengers:0};
  }

  // A tab writes its own running total. Two simultaneous services can therefore
  // pay the same driver without overwriting each other's fares.
  function recordBoarding(id, amount) {
    const profile = get(id);
    if (!profile || !Number.isSafeInteger(amount) || amount <= 0) return profile;
    const key = farePrefix + id + '.' + session;
    const fares = memory.get(key) || {balance:0, passengers:0};
    save(key, {balance:fares.balance + amount, passengers:fares.passengers + 1});
    profile.balance += amount;
    profile.passengers++;
    return profile;
  }

  function mount(root, {onSelect}) {
    let view;
    root.classList.add('career-profiles');
    root.setAttribute('aria-labelledby', 'profile-title');

    function note() {
      return storageAvailable ? 'Les profils sont sauvegardés dans ce navigateur.' :
        'Stockage du navigateur indisponible. Ta progression est conservée pour cette session.';
    }

    function showCreation(canReturn, focusName) {
      view = 'create';
      root.innerHTML = `<div class="cp-heading"><h1 id="profile-title">Crée ton profil<span>.</span></h1>
        <p>Choisis le nom et le portrait de ta carte de service.</p></div>
        <div class="cp-creation"><div class="cp-preview">
          <div class="cp-pass" aria-label="Aperçu de ta carte de service">
            <div class="cp-pass-head"><strong>Carte de service</strong><img src="assets/bus-mark.svg" width="32" height="32" alt=""></div>
            <img class="cp-pass-portrait" width="260" height="260" src="${avatarUrl(avatars[0].id)}" alt="">
            <div class="cp-pass-foot"><span>Nom</span><strong class="cp-pass-name">Ton nom</strong></div>
          </div></div>
          <form class="cp-form">
            <label class="cp-label" for="cp-name">Nom du profil</label>
            <input id="cp-name" type="text" placeholder="Ton nom ou ton pseudo" maxlength="24" required autocomplete="off" spellcheck="false">
            <fieldset class="cp-avatars"><legend>Avatar</legend><div class="cp-avatar-grid"></div></fieldset>
            <div class="cp-actions"><button class="cp-start" type="submit">Créer et conduire <span aria-hidden="true">→</span></button>
            ${canReturn ? '<button type="button" class="cp-back">Mes profils</button>' : ''}</div>
            <p class="cp-save-note"></p>
          </form></div>`;
      const form = root.querySelector('form');
      const grid = form.querySelector('.cp-avatar-grid');
      const input = form.querySelector('#cp-name');
      const previewName = root.querySelector('.cp-pass-name');
      const previewPortrait = root.querySelector('.cp-pass-portrait');
      form.querySelector('.cp-save-note').textContent = note();
      for (const [index, avatar] of avatars.entries()) {
        const label = document.createElement('label');
        label.className = 'cp-avatar';
        label.title = avatar.name + ' · ' + avatar.detail;
        label.innerHTML = `<input type="radio" name="avatar" value="${avatar.id}" aria-label="${avatar.name}, ${avatar.detail}">
          <span class="cp-avatar-img"><img src="${avatarUrl(avatar.id)}" alt="" width="80" height="80"></span>
          <span class="cp-avatar-name">${avatar.name}</span>`;
        label.querySelector('input').checked = index === 0;
        grid.append(label);
      }
      grid.addEventListener('change', event => { previewPortrait.src = avatarUrl(event.target.value); });
      input.addEventListener('input', () => {
        input.setCustomValidity('');
        previewName.textContent = input.value.trim() || 'Ton nom';
      });
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (!input.value.trim()) {
          input.setCustomValidity('Saisis le nom de ton profil.');
          input.reportValidity();
          return;
        }
        const profile = create(input.value, form.elements.avatar.value);
        if (profile) onSelect(profile);
      });
      form.querySelector('.cp-back')?.addEventListener('click', () => {
        refresh();
        root.querySelector('.cp-new')?.focus();
      });
      if (focusName) input.focus();
    }

    function refresh() {
      const profiles = list();
      if (!profiles.length) {
        showCreation(false, false);
        return;
      }
      view = 'list';
      root.innerHTML = `<div class="cp-heading"><h1 id="profile-title" tabindex="-1">Choisis ton profil<span>.</span></h1>
        <p>Reprends le volant avec ta carte de service.</p></div>
        <div class="cp-roster"></div><p class="cp-save-note"></p>`;
      const roster = root.querySelector('.cp-roster');
      for (const profile of profiles) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'cp-account';
        card.innerHTML = `<img width="80" height="80" src="${avatarUrl(profile.avatar)}" alt="">
          <span class="cp-account-info"><strong></strong><span></span></span><span class="cp-take" aria-hidden="true">→</span>`;
        card.querySelector('strong').textContent = profile.name;
        card.querySelector('.cp-account-info > span').textContent = numbers.format(profile.balance) + ' €$ · ' +
          numbers.format(profile.passengers) + (profile.passengers > 1 ? ' voyageurs' : ' voyageur');
        card.addEventListener('click', () => {
          const selected = get(profile.id);
          if (selected) onSelect(selected);
          else refresh();
        });
        roster.append(card);
      }
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'cp-new';
      add.innerHTML = '<span aria-hidden="true">＋</span> Créer un profil';
      add.addEventListener('click', () => showCreation(true, true));
      roster.append(add);
      root.querySelector('.cp-save-note').textContent = note();
    }

    function synchronize(event) {
      if (view === 'list' && !root.hidden && (event.key === null || event.key.startsWith(namespace))) refresh();
    }
    window.addEventListener('storage', synchronize);
    refresh();
    return {refresh, destroy() { window.removeEventListener('storage', synchronize); root.replaceChildren(); }};
  }

  window.CareerProfiles = {mount, get, list, create, recordBoarding, avatarUrl};
}());
