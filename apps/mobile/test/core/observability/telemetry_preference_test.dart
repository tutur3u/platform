import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/observability/telemetry_preference.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('every EU/EEA, Swiss, UK and Vietnamese region defaults off', () {
    for (final region in TelemetryPreference.privateRegions) {
      expect(TelemetryPreference.defaultEnabled(region), isFalse);
      expect(TelemetryPreference.defaultEnabled(region.toLowerCase()), isFalse);
    }
    expect(TelemetryPreference.privateRegions, contains('VN'));
    expect(TelemetryPreference.defaultEnabled('VN'), isFalse);
    expect(TelemetryPreference.defaultEnabled('vn'), isFalse);
    for (final region in ['US', 'AU', 'CA', 'JP', 'SG']) {
      expect(TelemetryPreference.defaultEnabled(region), isTrue);
    }
    expect(TelemetryPreference.defaultEnabled(null), isFalse);
    expect(TelemetryPreference.defaultEnabled(''), isFalse);
  });

  test('both explicit choices persist and override changed regions', () async {
    final preference = TelemetryPreference(countryCode: 'DE');
    final applied = <bool>[];
    await preference.initialize(
      apply: ({required enabled}) async => applied.add(enabled),
    );
    expect(preference.enabled, isFalse);
    await preference.setEnabled(value: true);
    final restored = TelemetryPreference(countryCode: 'FR');
    await restored.initialize(
      apply: ({required enabled}) async => applied.add(enabled),
    );
    expect(restored.enabled, isTrue);
    await restored.setEnabled(value: false);
    final outside = TelemetryPreference(countryCode: 'VN');
    await outside.initialize(
      apply: ({required enabled}) async => applied.add(enabled),
    );
    expect(outside.enabled, isFalse);
    expect(applied, [false, true, true, false, false]);
  });

  test(
    'Firebase initialization waits for preference read completion',
    () async {
      final read = Completer<bool?>();
      final applied = <bool>[];
      final preference = TelemetryPreference(countryCode: 'US');
      final startup = preference.initialize(
        read: () => read.future,
        apply: ({required enabled}) async => applied.add(enabled),
      );
      await Future<void>.delayed(Duration.zero);
      expect(applied, isEmpty);
      expect(preference.ready, isFalse);
      read.complete(false);
      await startup;
      expect(applied, [false]);
      expect(preference.ready, isTrue);
    },
  );

  test('failed preference read never initializes collection', () async {
    var calls = 0;
    final preference = TelemetryPreference(countryCode: 'US');
    await expectLater(
      preference.initialize(
        read: () async => throw StateError('storage unavailable'),
        apply: ({required enabled}) async {
          calls++;
        },
      ),
      throwsStateError,
    );
    expect(calls, 0);
    expect(preference.enabled, isFalse);
  });

  test('off revokes collection before the saved value changes', () async {
    SharedPreferences.setMockInitialValues({
      TelemetryPreference.preferenceKey: true,
    });
    final preference = TelemetryPreference(countryCode: 'US');
    final applied = <bool>[];
    await preference.initialize(
      apply: ({required enabled}) async {
        applied.add(enabled);
        if (!enabled) {
          expect(
            (await SharedPreferences.getInstance()).getBool(
              TelemetryPreference.preferenceKey,
            ),
            isTrue,
          );
        }
      },
    );
    await preference.setEnabled(value: false);
    expect(applied, [true, false]);
    expect(
      (await SharedPreferences.getInstance()).getBool(
        TelemetryPreference.preferenceKey,
      ),
      isFalse,
    );
  });

  test('native defaults stay disabled until Dart reads consent', () {
    final plist = File('ios/Runner/Info.plist').readAsStringSync();
    for (final key in [
      'FIREBASE_ANALYTICS_COLLECTION_ENABLED',
      'FirebaseCrashlyticsCollectionEnabled',
    ]) {
      // Exactly one entry each: duplicate plist keys are invalid.
      expect(plist.split('<key>$key</key>'), hasLength(2));
      expect(plist, matches(RegExp('<key>$key</key>\\s*<false/>')));
    }
    final manifest = File(
      'android/app/src/main/AndroidManifest.xml',
    ).readAsStringSync();
    for (final key in [
      'firebase_analytics_collection_enabled',
      'firebase_crashlytics_collection_enabled',
    ]) {
      // Duplicate meta-data names break the manifest merge.
      expect(manifest.split('android:name="$key"'), hasLength(2));
      expect(
        manifest,
        matches(RegExp('android:name="$key"\\s+android:value="false"')),
      );
    }
    // Stale SDK overrides from older builds are cleared before Firebase starts.
    final gate = RegExp(
      r'android:name="\.telemetry\.TelemetryConsentGateProvider"'
      r'[^>]*android:initOrder="(\d+)"',
    ).firstMatch(manifest);
    expect(gate, isNotNull);
    // FirebaseInitProvider uses 100; higher orders are created first.
    expect(int.parse(gate!.group(1)!), greaterThan(100));
    final delegate = File('ios/Runner/AppDelegate.swift').readAsStringSync();
    expect(
      delegate.indexOf('TelemetryConsentGate.clearPersistedCrashCollection()'),
      allOf(
        greaterThan(-1),
        lessThan(delegate.indexOf('FirebaseApp.configure()')),
      ),
    );
    final bootstrap = File('lib/bootstrap.dart').readAsStringSync();
    expect(
      bootstrap.indexOf('TelemetryPreference.instance.initialize('),
      lessThan(bootstrap.indexOf('await Firebase.initializeApp(')),
    );
  });
}
