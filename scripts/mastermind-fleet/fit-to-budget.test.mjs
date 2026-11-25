import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitToBudget } from './fit-to-budget.mjs';

const NOW = new Date('2026-11-20T03:00:00.000Z');

test('fits the body budget without dropping active lanes first', () => {
  const lane = (i, state) => ({
    id: `lane-${String(i).padStart(16, '0')}`,
    title: 'x'.repeat(70),
    machineId: 'macstudio1',
    state,
    updatedAt: NOW.toISOString(),
  });
  const state = {
    version: 1,
    lanes: [
      ...Array.from({ length: 250 }, (_, i) => lane(i, 'running')),
      ...Array.from({ length: 50 }, (_, i) => lane(300 + i, 'idle')),
    ],
    decisions: Array.from({ length: 50 }, (_, i) => ({
      id: `d${i}`,
      title: 'Decision',
      body: '部'.repeat(600),
    })),
  };
  const { state: fitted, bytes } = fitToBudget(state, 80 * 1024);
  assert.ok(bytes <= 80 * 1024);
  assert.equal(fitted.lanes.filter((l) => l.state === 'running').length, 250);
  assert.equal(fitted.lanes.filter((l) => l.state === 'idle').length, 0);
  assert.ok(fitted.decisions.every((d) => d.body === undefined));
  assert.equal(fitted.decisions.length, 50);
});

test('compacts lane detail before dropping any active lane', () => {
  const lane = (i) => ({
    id: `lane-${String(i).padStart(16, '0')}`,
    title: 'Running lane title',
    project: '部'.repeat(40),
    provider: 'p'.repeat(24),
    model: 'm'.repeat(40),
    machineId: 'macstudio1',
    state: 'running',
    updatedAt: NOW.toISOString(),
  });
  const state = {
    version: 1,
    lanes: Array.from({ length: 280 }, (_, i) => lane(i)),
    decisions: Array.from({ length: 50 }, (_, i) => ({
      id: `d${i}`,
      title: '部'.repeat(118),
      body: '部'.repeat(598),
    })),
  };
  const { state: fitted, bytes } = fitToBudget(state, 96 * 1024);
  assert.ok(bytes <= 96 * 1024);
  assert.equal(fitted.lanes.length, 280);
  assert.equal(fitted.lanes[0].project, undefined);
});

test('trims additions, then login requests, before any ask', () => {
  const ask = (i) => ({
    id: `a${i}`,
    title: 'Ask '.repeat(20),
    urgency: 'normal',
  });
  const login = (i) => ({
    id: `l${i}`,
    kind: 'login',
    title: 'Sign in '.repeat(10),
    urgency: 'high',
  });
  const state = {
    version: 1,
    lanes: [],
    decisions: [ask(0), login(0), ask(1), login(1)],
    resolved: [{ id: 'r', title: 'x'.repeat(2000) }],
    release: { main: { state: 'open', reason: 'y'.repeat(2000) } },
  };
  const core = { ...state, resolved: undefined, release: undefined };
  const coreBytes = Buffer.byteLength(JSON.stringify(core));
  const { state: noExtras } = fitToBudget(state, coreBytes + 10);
  assert.equal(noExtras.resolved, undefined);
  assert.equal(noExtras.release, undefined);
  assert.equal(noExtras.decisions.length, 4);
  const { state: tight } = fitToBudget(state, coreBytes - 50);
  assert.deepEqual(
    tight.decisions.map((d) => d.id),
    ['a0', 'l0', 'a1']
  );
});
