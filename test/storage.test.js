'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStorage } = require('../lib/storage');
const { emptyState } = require('../lib/state');

// In-memory stand-ins for Scriptable's FileManager and Keychain.
function fakeFileManager() {
  const files = new Map();
  const dirs = new Set(['/docs']);
  return {
    files,
    dirs,
    documentsDirectory: () => '/docs',
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: (p) => files.has(p) || dirs.has(p),
    createDirectory: (p) => { dirs.add(p); },
    readString: (p) => files.get(p),
    writeString: (p, s) => {
      if (!dirs.has(p.slice(0, p.lastIndexOf('/')))) throw new Error(`no directory for ${p}`);
      files.set(p, s);
    },
  };
}

function fakeKeychain() {
  const items = new Map();
  return {
    items,
    contains: (k) => items.has(k),
    get: (k) => { if (!items.has(k)) throw new Error('missing'); return items.get(k); },
    set: (k, v) => { items.set(k, v); },
  };
}

const SETTINGS = {
  erpUrl: 'https://erp.example.com/login',
  keycloakHost: 'sso.example.com',
  username: 'kd',
  windowStart: '08:00',
  windowEnd: '10:00',
  resetTime: '00:00',
  graceMinutes: 5,
};

test('settings round-trip through a file in its own folder', () => {
  const fm = fakeFileManager();
  const storage = createStorage({ fm, keychain: fakeKeychain() });
  assert.equal(storage.loadSettings(), null);
  storage.saveSettings(SETTINGS);
  assert.deepEqual(storage.loadSettings(), SETTINGS);
  assert.ok(fm.files.has('/docs/location-trigger/settings.json'));
});

test('saveSettings refuses a password, which belongs in the Keychain', () => {
  const storage = createStorage({ fm: fakeFileManager(), keychain: fakeKeychain() });
  assert.throws(() => storage.saveSettings({ ...SETTINGS, password: 'x' }), /Keychain/);
});

test('loadState starts empty and round-trips', () => {
  const storage = createStorage({ fm: fakeFileManager(), keychain: fakeKeychain() });
  assert.deepEqual(storage.loadState(), emptyState());
  const s = { ...emptyState(), flow1: 'ok', lastResetAt: 1, lastEnterAt: 2 };
  storage.saveState(s);
  assert.deepEqual(storage.loadState(), s);
});

test('a corrupt state file is an error, not an empty day that could clock in twice', () => {
  const fm = fakeFileManager();
  const storage = createStorage({ fm, keychain: fakeKeychain() });
  storage.saveState(emptyState());
  fm.files.set('/docs/location-trigger/state.json', '{"flow1": ');
  assert.throws(() => storage.loadState(), /state\.json/);
});

test('the password lives only in the Keychain', () => {
  const fm = fakeFileManager();
  const keychain = fakeKeychain();
  const storage = createStorage({ fm, keychain });
  assert.equal(storage.getPassword(), null);
  storage.setPassword('s3cret');
  assert.equal(storage.getPassword(), 's3cret');
  storage.saveSettings(SETTINGS);
  storage.saveState(emptyState());
  for (const content of fm.files.values()) assert.ok(!content.includes('s3cret'));
});
