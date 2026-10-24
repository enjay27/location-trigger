'use strict';

// Settings, state and password (docs/architecture.md, "Storage and notifications").
// Takes Scriptable's FileManager and Keychain as parameters so Node can test it.
// Loads nothing itself: Scriptable resolves importModule() paths differently from require().

const FOLDER = 'location-trigger';
const PASSWORD_KEY = 'location-trigger.password';

function createStorage({ fm, keychain }) {
  const folder = fm.joinPath(fm.documentsDirectory(), FOLDER);
  const pathOf = (name) => fm.joinPath(folder, name);

  function readJson(name) {
    const path = pathOf(name);
    if (!fm.fileExists(path)) return null;
    try {
      return JSON.parse(fm.readString(path));
    } catch (e) {
      throw new Error(`${path} is not valid JSON (${e.message}); fix or delete it`);
    }
  }

  function writeJson(name, value) {
    if (!fm.fileExists(folder)) fm.createDirectory(folder, true);
    fm.writeString(pathOf(name), JSON.stringify(value, null, 2));
  }

  return {
    loadSettings: () => readJson('settings.json'),
    saveSettings(settings) {
      if ('password' in settings) throw new Error('the password belongs in the Keychain, not settings.json');
      writeJson('settings.json', settings);
    },
    // null when nothing is saved yet: the caller starts from state.emptyState().
    loadState: () => readJson('state.json'),
    saveState: (state) => writeJson('state.json', state),
    getPassword: () => (keychain.contains(PASSWORD_KEY) ? keychain.get(PASSWORD_KEY) : null),
    setPassword: (password) => keychain.set(PASSWORD_KEY, password),
  };
}

module.exports = { createStorage };
