import 'dart:async';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/observability/telemetry_preference.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('nothing is collected before an explicit answer, in any locale', () async {
    for (final locale in [
      const Locale('de', 'DE'),
      const Locale('vi', 'VN'),
      const Locale('en', 'US'),
      const Locale('en'),
    ]) {
      TestWidgetsFlutterBinding.instance.platformDispatcher.localeTestValue =
          locale;
      final applied = <bool>[];
      final preference = TelemetryPreference();
      await preference.initialize(
        apply: ({required enabled}) async => applied.add(enabled),
      );
      expect(preference.enabled, isFalse, reason: '$locale');
      expect(applied, [false], reason: '$locale');
      expect(preference.hasExplicitChoice, isFalse);
    }
    TestWidgetsFlutterBinding.instance.platformDispatcher
        .clearLocaleTestValue();
  });

  test('the region and locale logic is gone from the source', () {
    final source = File(
      'lib/core/observability/telemetry_preference.dart',
    ).readAsStringSync();
    expect(source, isNot(contains('privateRegions')));
    expect(source, isNot(contains('countryCode')));
    expect(source, isNot(contains('defaultEnabled')));
    expect(
      File('lib/bootstrap.dart').readAsStringSync(),
      isNot(contains('deviceCountryCode')),
    );
  });

  test('an answer is stored with its notice version and time', () async {
    final at = DateTime.utc(2026, 10, 30, 9, 15);
    final preference = TelemetryPreference(clock: () => at);
    await preference.initialize(apply: ({required enabled}) async {});
    await preference.setEnabled(value: true);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool(TelemetryPreference.choiceKey), isTrue);
    expect(
      prefs.getString(TelemetryPreference.noticeVersionKey),
      'telemetry-consent-v1',
    );
    expect(
      prefs.getString(TelemetryPreference.decidedAtKey),
      at.toIso8601String(),
    );
  });

  test('both answers persist across restarts', () async {
    final applied = <bool>[];
    Future<TelemetryPreference> start() async {
      final preference = TelemetryPreference();
      await preference.initialize(
        apply: ({required enabled}) async => applied.add(enabled),
      );
      return preference;
    }

    final first = await start();
    await first.setEnabled(value: true);
    final allowed = await start();
    expect(allowed.enabled, isTrue);
    expect(allowed.hasExplicitChoice, isTrue);
    await allowed.setEnabled(value: false);
    final denied = await start();
    expect(denied.enabled, isFalse);
    expect(denied.hasExplicitChoice, isTrue);
    expect(applied, [false, false, true, true, false, false]);
  });

  test('a changed notice version voids the answer and asks again', () async {
    final first = TelemetryPreference();
    await first.initialize(apply: ({required enabled}) async {});
    await first.setEnabled(value: true);
    final applied = <bool>[];
    final next = TelemetryPreference(noticeVersion: 'telemetry-consent-v2');
    await next.initialize(
      promptEligible: true,
      apply: ({required enabled}) async => applied.add(enabled),
    );
    expect(next.hasExplicitChoice, isFalse);
    expect(next.enabled, isFalse);
    expect(next.consentPending, isTrue);
    expect(applied, [false]);
    await next.setEnabled(value: true);
    expect(next.consentPending, isFalse);
    final prefs = await SharedPreferences.getInstance();
    expect(
      prefs.getString(TelemetryPreference.noticeVersionKey),
      'telemetry-consent-v2',
    );
  });

  test('an older persisted on is never trusted as consent', () async {
    SharedPreferences.setMockInitialValues({TelemetryPreference.legacyKey: true});
    final applied = <bool>[];
    final preference = TelemetryPreference();
    await preference.initialize(
      promptEligible: true,
      apply: ({required enabled}) async => applied.add(enabled),
    );
    expect(preference.enabled, isFalse);
    expect(preference.consentPending, isTrue);
    expect(applied, [false]);
    expect(
      (await SharedPreferences.getInstance()).containsKey(
        TelemetryPreference.legacyKey,
      ),
      isFalse,
    );
  });

  test(
    'Firebase initialization waits for preference read completion',
    () async {
      final read = Completer<bool?>();
      final applied = <bool>[];
      final preference = TelemetryPreference();
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
    final preference = TelemetryPreference();
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
      TelemetryPreference.choiceKey: true,
      TelemetryPreference.noticeVersionKey: TelemetryPreference.currentNoticeVersion,
    });
    final preference = TelemetryPreference();
    final applied = <bool>[];
    await preference.initialize(
      apply: ({required enabled}) async {
        applied.add(enabled);
        if (!enabled) {
          expect(
            (await SharedPreferences.getInstance()).getBool(
              TelemetryPreference.choiceKey,
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
        TelemetryPreference.choiceKey,
      ),
      isFalse,
    );
  });

  test('native defaults stay disabled until Dart reads consent', () {
    final plist = File('ios/Runner/Info.plist').readAsStringSync();
    for (final key in [
      'FIREBASE_ANALYTICS_COLLECTION_ENABLED',
      'FirebaseCrashlyticsCollectionEnabled',
      // No advertising identifier is ever collected.
      'GOOGLE_ANALYTICS_ADID_COLLECTION_ENABLED',
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
      'google_analytics_adid_collection_enabled',
    ]) {
      // Duplicate meta-data names break the manifest merge.
      expect(manifest.split('android:name="$key"'), hasLength(2));
      expect(
        manifest,
        matches(RegExp('android:name="$key"\\s+android:value="false"')),
      );
    }
    expect(
      manifest,
      matches(
        RegExp(
          r'<uses-permission\s+android:name="com\.google\.android\.gms\.permission\.AD_ID"'
          r'\s+tools:node="remove"',
        ),
      ),
    );
    expect(
      File('ios/Podfile').readAsStringSync(),
      contains(r'$FirebaseAnalyticsWithoutAdIdSupport = true'),
    );
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
