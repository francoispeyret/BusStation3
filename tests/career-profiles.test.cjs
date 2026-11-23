const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');

const script = fs.readFileSync(path.join(__dirname, '../dist/career-profiles.js'), 'utf8');
function storage() {
  const items = new Map();
  return {
    get length() { return items.size; },
    key: i => Array.from(items.keys())[i],
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value)
  };
}
function open(localStorage) {
  const window = {localStorage, crypto:{randomUUID}};
  vm.runInNewContext(script, {window});
  return window.CareerProfiles;
}

test('two drivers retain their own fares and avatars after reloading or playing in another tab', () => {
  const data = storage();
  const first = open(data), other = open(data);
  const lea = first.create('  Léa  ', 'moka');
  const sam = other.create('Sam', 'sami');
  assert.equal(lea.name, 'Léa');
  first.recordBoarding(lea.id, 4);
  other.recordBoarding(lea.id, 3);
  other.recordBoarding(sam.id, 5);
  first.recordBoarding(lea.id, 4);
  assert.deepEqual({...open(data).get(lea.id)}, {...lea, balance:11, passengers:3});
  assert.deepEqual({...open(data).get(sam.id)}, {...sam, balance:5, passengers:1});
  assert.equal(first.list().length, 2);
});

test('existing records survive damaged entries and a storage failure allows the current service to continue', () => {
  const data = storage();
  const profiles = open(data);
  assert.equal(profiles.create('   ', 'moka'), null);
  assert.equal(profiles.create('Sam', 'inconnu'), null);
  const driver = profiles.create('Zoé', 'rosa');
  data.setItem('busstation3.career.profile.broken', '[[!');
  data.setItem('busstation3.career.fares.' + driver.id + '.broken', '{"balance":-4,"passengers":2}');
  assert.deepEqual({...profiles.get(driver.id)}, {...driver});
  data.setItem = () => { throw new Error('Storage full'); };
  profiles.recordBoarding(driver.id, 3);
  assert.equal(profiles.recordBoarding(driver.id, -1).balance, 3);
  assert.equal(profiles.recordBoarding(driver.id, 4).balance, 7);
  assert.equal(profiles.get(driver.id).passengers, 2);
  assert.equal(profiles.recordBoarding('missing', 5), null);
});
