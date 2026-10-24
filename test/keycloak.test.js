'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const keycloak = require('../lib/keycloak');

// Made-up pages shaped like Keycloak's login themes; hosts are example.com.
const ACTION = 'https://sso.example.com/realms/demo/login-actions/authenticate'
  + '?session_code=abc-123&execution=e7f0&client_id=erp-web&tab_id=Xy9';

const V2_PAGE = `<!DOCTYPE html><html><body>
<div class="pf-v5-c-login__main">
  <form id="kc-form-login" class="pf-v5-c-form" onsubmit="login.disabled = true; return true;"
        action="https://sso.example.com/realms/demo/login-actions/authenticate?session_code=abc-123&amp;execution=e7f0&amp;client_id=erp-web&amp;tab_id=Xy9" method="post" novalidate="novalidate">
    <input id="username" name="username" value="" type="text" autocomplete="username" autofocus>
    <input id="password" name="password" value="" type="password" autocomplete="current-password">
    <span id="input-error" class="pf-v5-c-helper-text__item-text" aria-live="polite">Invalid username or password.</span>
    <input type="hidden" id="id-hidden-input" name="credentialId" value=""/>
    <button class="pf-v5-c-button" name="login" id="kc-login" type="submit">Sign In</button>
  </form>
</div>
<form id="kc-select-try-another-way-form" action="https://sso.example.com/other" method="post">
  <input type="hidden" name="tryAnotherWay" value="on"/>
</form>
</body></html>`;

const LEGACY_PAGE = `<html><body>
<div class="alert-error"><span class="kc-feedback-text">Account is disabled, contact your administrator.</span></div>
<form method='post' action='https://sso.example.com/realms/demo/login-actions/authenticate?session_code=abc-123&#38;execution=e7f0&amp;client_id=erp-web&amp;tab_id=Xy9' id='kc-form-login'>
  <input tabindex="1" id="username" class="pf-c-form-control" name="username" value="kd" type="text" autofocus autocomplete="off"/>
  <input tabindex="2" id="password" class="pf-c-form-control" name="password" type="password" autocomplete="off"/>
  <input type="checkbox" id="rememberMe" name="rememberMe">
  <input type=hidden id="id-hidden-input" name="credentialId" value="cred&quot;1"/>
  <input tabindex="4" class="pf-c-button" name="login" id="kc-login" type="submit" value="Sign In"/>
</form>
</body></html>`;

const COOKIE_ERROR_PAGE = `<html><body>
<div id="kc-error-message">
  <p class="instruction">Cookie not found. Please make sure cookies are enabled in your browser.</p>
</div>
</body></html>`;

test('parseLoginForm reads the action and hidden inputs of #kc-form-login (v2 theme)', () => {
  assert.deepEqual(keycloak.parseLoginForm(V2_PAGE), {
    action: ACTION,
    fields: { credentialId: '' },
  });
});

test('parseLoginForm handles single quotes, unquoted values and entities (legacy theme)', () => {
  assert.deepEqual(keycloak.parseLoginForm(LEGACY_PAGE), {
    action: ACTION,
    fields: { credentialId: 'cred"1' },
  });
});

test('parseLoginForm returns null when the page has no login form', () => {
  assert.equal(keycloak.parseLoginForm(COOKIE_ERROR_PAGE), null);
  assert.equal(keycloak.parseLoginForm('<html><body>Welcome to the ERP</body></html>'), null);
});

test('buildLoginBody form-encodes the hidden fields, username and password', () => {
  const form = { action: ACTION, fields: { credentialId: '' } };
  assert.equal(
    keycloak.buildLoginBody(form, 'kd@example.com', 'p&ss w=rd%'),
    'credentialId=&username=kd%40example.com&password=p%26ss%20w%3Drd%25',
  );
});

test('buildLoginBody lets the username and password win over same-named hidden fields', () => {
  const form = { action: ACTION, fields: { username: 'planted', password: 'planted' } };
  assert.equal(keycloak.buildLoginBody(form, 'u', 'p'), 'username=u&password=p');
});

test('checkFormAction accepts https on the configured Keycloak host, in any case', () => {
  assert.equal(keycloak.checkFormAction(ACTION, 'sso.example.com'), ACTION);
  assert.equal(keycloak.checkFormAction(ACTION, 'SSO.Example.com'), ACTION);
  assert.equal(
    keycloak.checkFormAction('https://sso.example.com:8443/realms/demo/x', 'sso.example.com'),
    'https://sso.example.com:8443/realms/demo/x',
  );
});

test('checkFormAction refuses any other target, so the password goes nowhere else', () => {
  const refused = [
    'http://sso.example.com/realms/demo/login-actions/authenticate',
    'https://evil.example.net/realms/demo/login-actions/authenticate',
    'https://sso.example.com.evil.example.net/realms/demo',
    'https://sso.example.com@evil.example.net/realms/demo',
    'https://evil.example.net\\@sso.example.com/realms/demo',
    '//sso.example.com/realms/demo',
    '/realms/demo/login-actions/authenticate',
    '',
  ];
  for (const action of refused) {
    assert.throws(() => keycloak.checkFormAction(action, 'sso.example.com'), /refusing/, action);
  }
});

test('loginError reads the message from either theme and from the error page', () => {
  assert.equal(keycloak.loginError(V2_PAGE), 'Invalid username or password.');
  assert.equal(keycloak.loginError(LEGACY_PAGE), 'Account is disabled, contact your administrator.');
  assert.equal(
    keycloak.loginError(COOKIE_ERROR_PAGE),
    'Cookie not found. Please make sure cookies are enabled in your browser.',
  );
});

test('loginError returns null for a page without an error', () => {
  assert.equal(keycloak.loginError('<html><body>Welcome to the ERP</body></html>'), null);
  assert.equal(keycloak.loginError(V2_PAGE.replace('Invalid username or password.', '')), null);
});
