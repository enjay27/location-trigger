// Setup: enter the settings and the password (docs/architecture.md, "Storage and notifications").
// Run once in Scriptable, and again to change anything. Settings go to a local file,
// the password to the iOS Keychain.

const state = importModule('lib/state');
const { createStorage } = importModule('lib/storage');

const storage = createStorage({ fm: FileManager.local(), keychain: Keychain });
const DEFAULTS = {
  erpUrl: '',
  keycloakHost: '',
  username: '',
  windowStart: '08:00',
  windowEnd: '10:00',
  resetTime: '00:00',
  graceMinutes: 5,
};

function connectionErrors(s) {
  const errors = [];
  if (!/^https:\/\/[^/?#\s]+/i.test(s.erpUrl)) errors.push('ERP sign-in URL: expected https://…');
  if (!/^[a-z0-9.-]+$/i.test(s.keycloakHost)) errors.push('Keycloak host: a host name only, like sso.example.com');
  if (!s.username) errors.push('Username: required');
  return errors;
}

async function ask(current, hasPassword, problems) {
  const alert = new Alert();
  alert.title = 'location-trigger setup';
  alert.message = problems.length ? problems.join('\n') : 'All values stay on this phone.';
  alert.addTextField('ERP sign-in URL (https://…)', current.erpUrl);
  alert.addTextField('Keycloak host (sso.example.com)', current.keycloakHost);
  alert.addTextField('Username', current.username);
  alert.addSecureTextField(hasPassword ? 'Password (leave empty to keep)' : 'Password', '');
  alert.addTextField('Window start HH:MM', current.windowStart);
  alert.addTextField('Window end HH:MM', current.windowEnd);
  alert.addTextField('Daily reset HH:MM', current.resetTime);
  alert.addTextField('Exit grace minutes', String(current.graceMinutes));
  alert.addAction('Save');
  alert.addCancelAction('Cancel');
  if ((await alert.presentAlert()) === -1) return null;
  const v = (i) => alert.textFieldValue(i).trim();
  const grace = v(7);
  return {
    settings: {
      erpUrl: v(0),
      keycloakHost: v(1).toLowerCase(),
      username: v(2),
      windowStart: v(4),
      windowEnd: v(5),
      resetTime: v(6),
      graceMinutes: /^\d+$/.test(grace) ? Number(grace) : NaN,
    },
    password: alert.textFieldValue(3),
  };
}

let current = { ...DEFAULTS, ...(storage.loadSettings() || {}) };
let problems = [];
for (;;) {
  const hasPassword = storage.getPassword() !== null;
  const answer = await ask(current, hasPassword, problems);
  if (answer === null) break;
  current = answer.settings;
  problems = [...connectionErrors(current), ...state.validateSettings(current)];
  if (!answer.password && !hasPassword) problems.push('Password: required');
  if (problems.length) continue;
  storage.saveSettings(current);
  if (answer.password) storage.setPassword(answer.password);
  const done = new Alert();
  done.title = 'Saved';
  done.message = 'Run Spike to check the sign-in on this phone.';
  done.addAction('OK');
  await done.presentAlert();
  break;
}
Script.complete();
