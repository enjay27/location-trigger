'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const state = require('../lib/state');

// Local-time dates, so the tests hold in any time zone.
const at = (d, h, m) => new Date(2026, 9, d, h, m);

const SETTINGS = { windowStart: '08:00', windowEnd: '10:00', resetTime: '00:00', graceMinutes: 5 };
const NIGHT = { windowStart: '22:00', windowEnd: '04:00', resetTime: '12:00', graceMinutes: 5 };

// A state already reset for 25 October.
const fresh = () => ({ ...state.emptyState(), lastResetAt: at(25, 0, 1).getTime() });

test('parseHHMM reads 24-hour times and rejects anything else', () => {
  assert.equal(state.parseHHMM('00:00'), 0);
  assert.equal(state.parseHHMM('08:30'), 510);
  assert.equal(state.parseHHMM('23:59'), 1439);
  for (const bad of ['24:00', '8:30', '08:60', '0830', '', undefined]) {
    assert.throws(() => state.parseHHMM(bad), /HH:MM/, String(bad));
  }
});

test('inWindow includes the start and excludes the end', () => {
  assert.equal(state.inWindow(at(25, 7, 59), SETTINGS), false);
  assert.equal(state.inWindow(at(25, 8, 0), SETTINGS), true);
  assert.equal(state.inWindow(at(25, 9, 59), SETTINGS), true);
  assert.equal(state.inWindow(at(25, 10, 0), SETTINGS), false);
});

test('inWindow handles a window that crosses midnight', () => {
  assert.equal(state.inWindow(at(25, 21, 59), NIGHT), false);
  assert.equal(state.inWindow(at(25, 22, 0), NIGHT), true);
  assert.equal(state.inWindow(at(26, 3, 59), NIGHT), true);
  assert.equal(state.inWindow(at(26, 4, 0), NIGHT), false);
});

test('lastResetBoundary is today once the reset time has passed, else yesterday', () => {
  assert.deepEqual(state.lastResetBoundary(at(25, 11, 0), '12:00'), at(24, 12, 0));
  assert.deepEqual(state.lastResetBoundary(at(25, 12, 0), '12:00'), at(25, 12, 0));
  assert.deepEqual(state.lastResetBoundary(at(25, 13, 0), '12:00'), at(25, 12, 0));
});

test('applyReset clears both flows once a new boundary has passed', () => {
  const s = { ...fresh(), flow1: 'ok', flow3: 'ok' };
  const next = state.applyReset(s, at(26, 7, 0), SETTINGS);
  assert.equal(next.flow1, 'none');
  assert.equal(next.flow3, 'none');
  assert.equal(next.lastResetAt, at(26, 7, 0).getTime());
});

test('applyReset keeps the flows within the same day', () => {
  const s = { ...fresh(), flow1: 'ok', flow3: 'failed' };
  assert.deepEqual(state.applyReset(s, at(25, 18, 0), SETTINGS), s);
});

test('applyReset on a state never reset clears it and records the time', () => {
  const next = state.applyReset(state.emptyState(), at(25, 9, 0), SETTINGS);
  assert.equal(next.lastResetAt, at(25, 9, 0).getTime());
});

test('applyReset does not change its input', () => {
  const s = { ...fresh(), flow1: 'ok' };
  const copy = { ...s };
  state.applyReset(s, at(26, 7, 0), SETTINGS);
  assert.deepEqual(s, copy);
});

test('validateSettings accepts the defaults and a midnight-crossing window', () => {
  assert.deepEqual(state.validateSettings(SETTINGS), []);
  assert.deepEqual(state.validateSettings(NIGHT), []);
});

test('validateSettings rejects a reset time strictly inside the window', () => {
  assert.match(state.validateSettings({ ...SETTINGS, resetTime: '09:00' }).join(), /inside/);
  assert.match(state.validateSettings({ ...NIGHT, resetTime: '01:00' }).join(), /inside/);
  assert.deepEqual(state.validateSettings({ ...SETTINGS, resetTime: '08:00' }), []);
  assert.deepEqual(state.validateSettings({ ...SETTINGS, resetTime: '10:00' }), []);
});

test('validateSettings rejects bad times, an empty window and a bad grace period', () => {
  assert.notDeepEqual(state.validateSettings({ ...SETTINGS, windowStart: '8:00' }), []);
  assert.match(state.validateSettings({ ...SETTINGS, windowEnd: '08:00' }).join(), /empty/);
  assert.notDeepEqual(state.validateSettings({ ...SETTINGS, graceMinutes: -1 }), []);
  assert.notDeepEqual(state.validateSettings({ ...SETTINGS, graceMinutes: 2.5 }), []);
});

test('Arrive in the window clocks in and marks Flow 1 running first', () => {
  const { state: next, action } = state.onArrive(fresh(), at(25, 8, 30), SETTINGS);
  assert.equal(action, 'clockIn');
  assert.equal(next.flow1, 'running');
  assert.equal(next.lastEnterAt, at(25, 8, 30).getTime());
});

test('Arrive outside the window prompts and leaves Flow 1 untouched (Flow 4)', () => {
  const { state: next, action } = state.onArrive(fresh(), at(25, 7, 15), SETTINGS);
  assert.equal(action, 'promptClockIn');
  assert.equal(next.flow1, 'none');
  assert.equal(next.lastEnterAt, at(25, 7, 15).getTime());
});

test('Arrive does nothing once Flow 1 has started today, whatever its result', () => {
  for (const flow1 of ['running', 'ok', 'failed']) {
    const { state: next, action } = state.onArrive({ ...fresh(), flow1 }, at(25, 9, 0), SETTINGS);
    assert.equal(action, 'none', flow1);
    assert.equal(next.flow1, flow1);
    assert.equal(next.lastEnterAt, at(25, 9, 0).getTime());
  }
});

test('Arrive on a new day resets first, then clocks in', () => {
  const s = { ...fresh(), flow1: 'ok', flow3: 'ok' };
  const { state: next, action } = state.onArrive(s, at(26, 8, 5), SETTINGS);
  assert.equal(action, 'clockIn');
  assert.equal(next.flow3, 'none');
});

test('a midnight-crossing window is one day: the second Arrive after midnight does nothing', () => {
  const s = { ...state.emptyState(), lastResetAt: at(25, 12, 0).getTime() };
  const first = state.onArrive(s, at(25, 23, 0), NIGHT);
  assert.equal(first.action, 'clockIn');
  const second = state.onArrive(state.finish(first.state, 'flow1', true), at(26, 1, 0), NIGHT);
  assert.equal(second.action, 'none');
});

test('Leave after a successful clock-in reminds to clock out (Flow 2)', () => {
  const s = { ...fresh(), flow1: 'ok', lastEnterAt: at(25, 8, 30).getTime() };
  assert.equal(state.onLeave(s, at(25, 18, 0), SETTINGS).action, 'remindClockOut');
});

test('Flow 2 repeats on every qualifying Leave until Flow 3 succeeds', () => {
  let s = { ...fresh(), flow1: 'ok', lastEnterAt: at(25, 8, 30).getTime() };
  let r = state.onLeave(s, at(25, 12, 0), SETTINGS);
  assert.equal(r.action, 'remindClockOut');
  r = state.onLeave(r.state, at(25, 18, 0), SETTINGS);
  assert.equal(r.action, 'remindClockOut');
  r = state.onLeave({ ...r.state, flow3: 'failed' }, at(25, 18, 30), SETTINGS);
  assert.equal(r.action, 'remindClockOut');
  r = state.onLeave({ ...r.state, flow3: 'ok' }, at(25, 19, 0), SETTINGS);
  assert.equal(r.action, 'none');
});

test('Leave within the grace period after Arrive is ignored', () => {
  const s = { ...fresh(), flow1: 'ok', lastEnterAt: at(25, 8, 30).getTime() };
  assert.equal(state.onLeave(s, at(25, 8, 34), SETTINGS).action, 'none');
  assert.equal(state.onLeave(s, at(25, 8, 35), SETTINGS).action, 'remindClockOut');
});

test('Leave without a successful clock-in does nothing', () => {
  for (const flow1 of ['none', 'running', 'failed']) {
    const s = { ...fresh(), flow1, lastEnterAt: at(25, 8, 30).getTime() };
    assert.equal(state.onLeave(s, at(25, 18, 0), SETTINGS).action, 'none', flow1);
  }
});

test('Leave on a new day resets first, so yesterday\'s clock-in does not arm Flow 2', () => {
  const s = { ...fresh(), flow1: 'ok', lastEnterAt: at(25, 8, 30).getTime() };
  const { state: next, action } = state.onLeave(s, at(26, 7, 0), SETTINGS);
  assert.equal(action, 'none');
  assert.equal(next.flow1, 'none');
});

test('a manual clock-in runs from none, running or failed, and refuses ok', () => {
  for (const flow1 of ['none', 'running', 'failed']) {
    const { state: next, action } = state.startClockIn({ ...fresh(), flow1 }, at(25, 11, 0), SETTINGS);
    assert.equal(action, 'clockIn', flow1);
    assert.equal(next.flow1, 'running');
  }
  const { state: next, action } = state.startClockIn({ ...fresh(), flow1: 'ok' }, at(25, 11, 0), SETTINGS);
  assert.equal(action, 'none');
  assert.equal(next.flow1, 'ok');
});

test('a clock-out always runs and marks Flow 3 running first', () => {
  for (const flow3 of ['none', 'running', 'ok', 'failed']) {
    const { state: next, action } = state.startClockOut({ ...fresh(), flow3 }, at(25, 18, 0), SETTINGS);
    assert.equal(action, 'clockOut', flow3);
    assert.equal(next.flow3, 'running');
  }
});

test('finish records ok or failed for a flow', () => {
  const s = { ...fresh(), flow1: 'running', flow3: 'running' };
  assert.equal(state.finish(s, 'flow1', true).flow1, 'ok');
  assert.equal(state.finish(s, 'flow1', false).flow1, 'failed');
  assert.equal(state.finish(s, 'flow3', true).flow3, 'ok');
  assert.throws(() => state.finish(s, 'flow2', true), /flow1 or flow3/);
});
