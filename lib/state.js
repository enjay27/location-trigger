'use strict';

// Daily state and flow guards (docs/architecture.md, "Daily state").
// Pure: callers load the state, call one of these, save the returned state, then act.
// Times in the state are epoch milliseconds so it round-trips through JSON.

const MINUTE = 60 * 1000;

function emptyState() {
  return { flow1: 'none', flow3: 'none', lastResetAt: null, lastEnterAt: null };
}

function parseHHMM(text) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text === undefined ? '' : String(text));
  if (!match) throw new Error(`expected a time as HH:MM, got "${text}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function minuteOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// True when minute t lies in [start, end), wrapping past midnight when start > end.
function inRange(t, start, end) {
  return start < end ? start <= t && t < end : t >= start || t < end;
}

function inWindow(now, settings) {
  const start = parseHHMM(settings.windowStart);
  const end = parseHHMM(settings.windowEnd);
  return start !== end && inRange(minuteOfDay(now), start, end);
}

function lastResetBoundary(now, resetTime) {
  const m = parseHHMM(resetTime);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(m / 60), m % 60);
  if (today <= now) return today;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, Math.floor(m / 60), m % 60);
}

function applyReset(state, now, settings) {
  const boundary = lastResetBoundary(now, settings.resetTime).getTime();
  if (state.lastResetAt !== null && state.lastResetAt !== undefined && boundary <= state.lastResetAt) {
    return state;
  }
  return { ...state, flow1: 'none', flow3: 'none', lastResetAt: now.getTime() };
}

function validateSettings(settings) {
  const errors = [];
  const times = {};
  for (const key of ['windowStart', 'windowEnd', 'resetTime']) {
    try {
      times[key] = parseHHMM(settings[key]);
    } catch (e) {
      errors.push(`${key}: ${e.message}`);
    }
  }
  const { windowStart: start, windowEnd: end, resetTime: reset } = times;
  if (start !== undefined && start === end) {
    errors.push('the time window is empty: start and end are the same');
  } else if (start !== undefined && end !== undefined && reset !== undefined
      && reset !== start && inRange(reset, start, end)) {
    errors.push('the reset time is inside the time window, so it would clear the flags mid-window');
  }
  if (!Number.isInteger(settings.graceMinutes) || settings.graceMinutes < 0) {
    errors.push('graceMinutes: expected a whole number of minutes, 0 or more');
  }
  return errors;
}

// Arrive: Flow 1 inside the window, the Flow 4 prompt outside it.
function onArrive(state, now, settings) {
  const s = { ...applyReset(state, now, settings), lastEnterAt: now.getTime() };
  if (s.flow1 !== 'none') return { state: s, action: 'none' };
  if (inWindow(now, settings)) return { state: { ...s, flow1: 'running' }, action: 'clockIn' };
  return { state: s, action: 'promptClockIn' };
}

// Leave: the Flow 2 reminder, once clocked in and not yet clocked out, after the grace period.
function onLeave(state, now, settings) {
  const s = applyReset(state, now, settings);
  const graceOver = s.lastEnterAt === null || s.lastEnterAt === undefined
    || now.getTime() - s.lastEnterAt >= settings.graceMinutes * MINUTE;
  if (s.flow1 === 'ok' && s.flow3 !== 'ok' && graceOver) return { state: s, action: 'remindClockOut' };
  return { state: s, action: 'none' };
}

// Manual Flow 1: also retries a run that failed or that iOS killed while running.
function startClockIn(state, now, settings) {
  const s = applyReset(state, now, settings);
  if (s.flow1 === 'ok') return { state: s, action: 'none' };
  return { state: { ...s, flow1: 'running' }, action: 'clockIn' };
}

// Flow 3 has no guard.
function startClockOut(state, now, settings) {
  const s = applyReset(state, now, settings);
  return { state: { ...s, flow3: 'running' }, action: 'clockOut' };
}

function finish(state, flow, ok) {
  if (flow !== 'flow1' && flow !== 'flow3') throw new Error(`expected flow1 or flow3, got "${flow}"`);
  return { ...state, [flow]: ok ? 'ok' : 'failed' };
}

module.exports = {
  emptyState,
  parseHHMM,
  inWindow,
  lastResetBoundary,
  applyReset,
  validateSettings,
  onArrive,
  onLeave,
  startClockIn,
  startClockOut,
  finish,
};
