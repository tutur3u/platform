import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAMMING_APPS, selectProgrammingApps } from './select-programming-apps.mjs';

test('mode all selects all six programming apps', () => {
  assert.deepEqual(PROGRAMMING_APPS, ['web', 'learn', 'infrastructure', 'mail', 'contacts', 'tasks']);
  assert.deepEqual(selectProgrammingApps({ mode: 'all', apps: [], reason: 'full build trigger' }), [...PROGRAMMING_APPS]);
});

test('a calendar-only change selects no programming apps', () => {
  assert.deepEqual(selectProgrammingApps({ mode: 'affected', apps: ['apps/calendar'], reason: 'workspace and documentation changes' }), []);
});

test('a web change selects web', () => {
  assert.deepEqual(selectProgrammingApps({ mode: 'affected', apps: ['apps/web'], reason: 'workspace and documentation changes' }), ['web']);
});
