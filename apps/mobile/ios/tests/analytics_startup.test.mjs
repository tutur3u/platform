import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('iOS upgrade resets both SDK stores before initialization without invoking Firebase', () => {
  const delegate = readFileSync(new URL('../Runner/AppDelegate.swift', import.meta.url), 'utf8');
  const gate = delegate.slice(delegate.indexOf('enum AnalyticsStartupGate {'));
  assert.doesNotMatch(gate, /Analytics\.|FirebaseApp|import Firebase|preconditionFailure/);
  assert.match(delegate, /guard self\.analyticsStartupReady else/);
  assert.ok(delegate.indexOf('AnalyticsStartupGate.disableBeforeInitialization()') < delegate.indexOf('return super.application'));
  const fixture = readFileSync(new URL('./analytics_startup_fixture.swift', import.meta.url), 'utf8');
  const result = spawnSync('swift', ['-'], { input: 'import Foundation\n' + gate + '\n' + fixture, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /14 persisted-state assertions passed/);
});
