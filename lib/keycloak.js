'use strict';

// Reading Keycloak's login page (docs/architecture.md, "Signing in").
// Scriptable has no DOM and no URL class, so this parses with regular expressions and
// checks hosts by hand. Pure: the caller does the HTTP.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return String.fromCodePoint(code);
    }
    const key = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : whole;
  });
}

// Tags whose attribute values may contain '>' inside quotes.
function tagPattern(name) {
  return new RegExp(`<${name}\\b((?:[^>"']|"[^"]*"|'[^']*')*)>`, 'gi');
}

function parseAttributes(text) {
  const attributes = {};
  const pattern = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const value = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4];
    attributes[match[1].toLowerCase()] = decodeEntities(value === undefined ? '' : value);
  }
  return attributes;
}

// The action URL and hidden inputs of #kc-form-login, or null when the page has none.
function parseLoginForm(html) {
  const forms = tagPattern('form');
  let match;
  while ((match = forms.exec(html)) !== null) {
    const attributes = parseAttributes(match[1]);
    if (attributes.id !== 'kc-form-login' || !attributes.action) continue;
    const start = forms.lastIndex;
    const end = html.slice(start).search(/<\/form\s*>/i);
    const body = end < 0 ? html.slice(start) : html.slice(start, start + end);
    const fields = {};
    const inputs = tagPattern('input');
    let input;
    while ((input = inputs.exec(body)) !== null) {
      const a = parseAttributes(input[1]);
      if ((a.type || '').toLowerCase() === 'hidden' && a.name) fields[a.name] = a.value || '';
    }
    return { action: attributes.action, fields };
  }
  return null;
}

// Returns the action when it is https on keycloakHost; throws otherwise.
function checkFormAction(action, keycloakHost) {
  const match = /^https:\/\/([^/?#]*)/i.exec(action || '');
  const authority = match ? match[1] : '';
  const host = authority.replace(/:\d+$/, '');
  if (!match || /[@\\]/.test(authority) || host.toLowerCase() !== String(keycloakHost).toLowerCase()) {
    throw new Error(`refusing to send the password to "${action}": not https on ${keycloakHost}`);
  }
  return action;
}

function buildLoginBody(form, username, password) {
  const fields = { ...form.fields };
  delete fields.username;
  delete fields.password;
  const pairs = Object.keys(fields).map((name) => [name, fields[name]]);
  pairs.push(['username', username], ['password', password]);
  return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

const ERROR_PATTERNS = [
  /<span\b[^>]*\bid=["']input-error["'][^>]*>([\s\S]*?)<\/span>/i,
  /<span\b[^>]*\bclass=["'][^"']*\bkc-feedback-text\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
  /<div\b[^>]*\bid=["']kc-error-message["'][^>]*>([\s\S]*?)<\/div>/i,
];

// The message Keycloak shows on a failed sign-in or its error page, or null.
function loginError(html) {
  for (const pattern of ERROR_PATTERNS) {
    const match = pattern.exec(html);
    if (!match) continue;
    const text = decodeEntities(match[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return null;
}

module.exports = { parseLoginForm, checkFormAction, buildLoginBody, loginError };
