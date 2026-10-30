import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deferAnalyticsStartup } from './defer_analytics_startup.mjs';

const fixture = [
  'class FlutterFirebaseAnalyticsPlugin {',
  '  private lateinit var analytics: FirebaseAnalytics',
  '  private fun initInstance(messenger: BinaryMessenger, context: Context) {',
  '    analytics = FirebaseAnalytics.getInstance(context)',
  '    registerChannels(messenger)',
  '  }',
  '  fun logEvent() { analytics.logEvent("event", null) }',
  '}',
].join('\n');

test('engine attachment binds channels without constructing Measurement', () => {
  const patched = deferAnalyticsStartup(fixture);
  const init = patched.slice(patched.indexOf('private fun initInstance'), patched.indexOf('fun logEvent'));
  assert.doesNotMatch(init, /FirebaseAnalytics\.getInstance/);
  assert.match(init, /registerChannels\(messenger\)/);
  assert.match(patched, /by lazy \{\s*FirebaseAnalytics.getInstance\(analyticsContext\)/);
  assert.match(patched, /analytics\.logEvent/);
});

test('unrecognized upstream startup code fails closed', () => {
  assert.throws(() => deferAnalyticsStartup(fixture.replace('getInstance(context)', 'newInstance(context)')));
  assert.throws(() => deferAnalyticsStartup(fixture + fixture));
});

test('native startup resets persisted enable before any SDK call', () => {
  const root = new URL('../', import.meta.url);
  const provider = readFileSync(new URL('android/app/src/main/kotlin/com/tuturuuu/app/mobile/telemetry/TelemetryConsentGateProvider.kt', root), 'utf8');
  assert.ok(provider.indexOf('PersistedAnalyticsGate.disable') < provider.indexOf('clearPersistedCrashCollection(context)'));
  assert.match(provider, /check\(editor.commit\(\)\)/);
  assert.doesNotMatch(provider, /FirebaseAnalytics|getInstance|FirebaseApp/);
  const manifest = readFileSync(new URL('android/app/src/main/AndroidManifest.xml', root), 'utf8');
  for (const component of ['Receiver', 'Service', 'JobService']) {
    assert.match(manifest, new RegExp('AppMeasurement' + component + '"\\s+android:enabled="false"'));
  }
});
