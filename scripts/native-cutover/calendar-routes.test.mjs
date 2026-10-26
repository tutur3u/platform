import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calendarRollbackRoutes,
  calendarRouteHandles,
  calendarRoutePatterns,
} from './calendar-routes.mjs';

const native = {
  id: 'a'.repeat(32),
  pattern: calendarRoutePatterns.native,
  script: 'tuturuuu-calendar',
};
const acme = {
  id: 'b'.repeat(32),
  pattern: calendarRoutePatterns.acme,
  script: null,
};

test('capture retains separate native and scriptless ACME IDs', () => {
  const handles = calendarRouteHandles([
    acme,
    { id: 'other', pattern: 'other.example/*', script: 'other' },
    native,
  ]);
  assert.deepEqual(handles, { native, acme });
  assert.deepEqual(calendarRollbackRoutes(handles), [native, acme]);
});
test('capture accepts a provider-omitted script on the ACME exclusion', () => {
  const { script: _script, ...scriptless } = acme;
  assert.deepEqual(calendarRouteHandles([scriptless]).acme, acme);
});
test('pre-flip capture can record just the scriptless route', () => {
  assert.deepEqual(calendarRouteHandles([acme]), { native: null, acme });
  assert.throws(
    () => calendarRollbackRoutes({ acme }),
    /Both Calendar route IDs/
  );
});
for (const [name, routes] of [
  ['scripted ACME', [native, { ...acme, script: 'tuturuuu-calendar' }]],
  ['another native owner', [{ ...native, script: 'other' }, acme]],
  ['duplicate pattern', [native, acme, { ...acme, id: 'c'.repeat(32) }]],
  ['invalid ID', [native, { ...acme, id: 'invalid' }]],
])
  test(`refuses ${name} before rollback planning`, () => {
    assert.throws(() => calendarRouteHandles(routes));
  });
test('rollback refuses shared route IDs', () => {
  assert.throws(
    () => calendarRollbackRoutes({ native, acme: { ...acme, id: native.id } }),
    /must differ/
  );
});
