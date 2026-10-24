// Spike: answers the on-device questions in docs/architecture.md, "Open items".
//  1. Does a Run Immediately location automation fire while the phone is locked?
//     Point a test automation at this script, lock the phone, cross the boundary,
//     and look for the "Spike ran" notification.
//  2. Does Location.current() return a fix when run from an automation?
//  3. Does Request keep Keycloak's cookies across the redirects, so the sign-in reaches the ERP?
// It reports host names, status codes and cookie names only: never values, never the password.
// It does not clock in or out.

const keycloak = importModule('lib/keycloak');
const { createStorage } = importModule('lib/storage');

const storage = createStorage({ fm: FileManager.local(), keychain: Keychain });
const report = [];
const note = (line) => { report.push(line); console.log(line); };
const hostOf = (url) => ((/^[a-z]+:\/\/([^/?#]*)/i.exec(url || '') || [])[1] || '?').replace(/^.*@/, '');
const time = new Date().toLocaleTimeString();

async function notify(title, body) {
  const n = new Notification();
  n.identifier = 'location-trigger.spike';
  n.title = title;
  n.body = body;
  await n.schedule();
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => Timer.schedule(ms, false, () => reject(new Error(`timed out after ${ms} ms`))))]);
}

async function load(request, hops) {
  request.onRedirect = (next) => { hops.push(hostOf(next.url)); return next; };
  const body = await request.loadString();
  const response = request.response || {};
  const cookies = (response.cookies || []).map((c) => c.name);
  return { body, status: response.statusCode, url: response.url, cookies };
}

async function checkLocation() {
  try {
    Location.setAccuracyToHundredMeters();
    const fix = await withTimeout(Location.current(), 10000);
    note(`Location: fix, accuracy ${Math.round(fix.horizontalAccuracy)} m`);
  } catch (e) {
    note(`Location: no fix (${e.message})`);
  }
}

async function checkSignIn() {
  const settings = storage.loadSettings();
  const password = storage.getPassword();
  if (!settings || password === null) {
    note('Sign-in: skipped, run Setup first');
    return;
  }
  const erpHost = hostOf(settings.erpUrl);

  const hops = [];
  const page = await load(new Request(settings.erpUrl), hops);
  note(`GET ERP: ${page.status}, via ${hops.join(' → ') || 'no redirect'}, cookies [${page.cookies.join(', ')}]`);
  const form = keycloak.parseLoginForm(page.body);
  if (!form) {
    const where = hostOf(page.url);
    note(where === erpHost
      ? 'Sign-in: no login form, already signed in (a Keycloak or ERP session was reused)'
      : `Sign-in: no login form on ${where}${keycloak.loginError(page.body) ? `: ${keycloak.loginError(page.body)}` : ''}`);
    return;
  }

  const post = new Request(keycloak.checkFormAction(form.action, settings.keycloakHost));
  post.method = 'POST';
  post.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  post.body = keycloak.buildLoginBody(form, settings.username, password);
  const postHops = [];
  const result = await load(post, postHops);
  const landed = hostOf(result.url);
  note(`POST login: ${result.status}, via ${postHops.join(' → ') || 'no redirect'}, landed on ${landed}, cookies [${result.cookies.join(', ')}]`);

  const error = keycloak.loginError(result.body);
  if (error && /cookie/i.test(error)) note('Sign-in: FAILED, Request did not send Keycloak\'s cookies back');
  else if (error) note(`Sign-in: FAILED, Keycloak says "${error}"`);
  else if (keycloak.parseLoginForm(result.body)) note('Sign-in: FAILED, the login form came back (MFA or another step?)');
  else if (landed === erpHost) note('Sign-in: OK, reached the ERP');
  else note(`Sign-in: unclear, landed on ${landed}`);
}

await notify('Spike ran', `at ${time}`);
await checkLocation();
try {
  await checkSignIn();
} catch (e) {
  note(`Sign-in: error, ${e.message}`);
}
await notify(`Spike finished (${time})`, report.join('\n'));
Script.setShortcutOutput(report.join('\n'));
Script.complete();
