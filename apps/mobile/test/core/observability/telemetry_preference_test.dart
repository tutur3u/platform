import 'dart:async';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/observability/telemetry_preference.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test(
    'nothing is collected before an explicit answer, in any locale',
    () async {
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
    },
  );

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
    // Start, allow, restart, deny (revokes first), restart.
    expect(applied, [false, true, true, false, false]);
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
    SharedPreferences.setMockInitialValues({
      TelemetryPreference.legacyKey: true,
    });
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
      TelemetryPreference.noticeVersionKey:
          TelemetryPreference.currentNoticeVersion,
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

  test(
    'a persisted enable from an older build never survives startup',
    () async {
      // Nothing stored (an older build never wrote consent): collection is
      // switched off, never on, however Firebase last persisted it.
      final applied = <bool>[];
      final preference = TelemetryPreference();
      await preference.initialize(
        promptEligible: true,
        apply: ({required enabled}) async => applied.add(enabled),
      );
      expect(applied, [false]);
      expect(preference.enabled, isFalse);
    },
  );

  test('a stale-version Allow is not consent at startup', () async {
    SharedPreferences.setMockInitialValues({
      TelemetryPreference.choiceKey: true,
      TelemetryPreference.noticeVersionKey: 'telemetry-consent-v0',
    });
    final applied = <bool>[];
    await TelemetryPreference().initialize(
      apply: ({required enabled}) async => applied.add(enabled),
    );
    expect(applied, [false]);
  });

  group('session transitions re-read consent', () {
    Future<(TelemetryPreference, List<bool>)> started() async {
      final applied = <bool>[];
      final preference = TelemetryPreference();
      await preference.initialize(
        apply: ({required enabled}) async => applied.add(enabled),
      );
      return (preference, applied);
    }

    test('stored Allow is revoked first, then enabled again', () async {
      final (preference, applied) = await started();
      await preference.setEnabled(value: true);
      applied.clear();
      await preference.reloadConsent();
      expect(applied, [false, true]);
      expect(preference.enabled, isTrue);
    });

    test('a consent that vanished leaves collection off', () async {
      final (preference, applied) = await started();
      await preference.setEnabled(value: true);
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(TelemetryPreference.noticeVersionKey);
      applied.clear();
      await preference.reloadConsent();
      expect(applied, [false]);
      expect(preference.enabled, isFalse);
      expect(preference.hasExplicitChoice, isFalse);
    });

    test('a Deny stays off', () async {
      final (preference, applied) = await started();
      await preference.setEnabled(value: false);
      applied.clear();
      await preference.reloadConsent();
      expect(applied, [false]);
      expect(preference.enabled, isFalse);
    });

    test('a failing enable fails closed and never throws', () async {
      SharedPreferences.setMockInitialValues({
        TelemetryPreference.choiceKey: true,
        TelemetryPreference.noticeVersionKey:
            TelemetryPreference.currentNoticeVersion,
      });
      final applied = <bool>[];
      final preference = TelemetryPreference();
      await preference.initialize(
        apply: ({required enabled}) async {
          applied.add(enabled);
          if (applied.length > 1 && enabled) throw StateError('apply failed');
        },
      );
      applied.clear();
      await preference.reloadConsent();
      expect(applied, [false, true]);
      expect(preference.enabled, isFalse);
    });

    test('does nothing before startup finished', () async {
      final applied = <bool>[];
      final preference = TelemetryPreference();
      await preference.reloadConsent();
      expect(applied, isEmpty);
      expect(preference.ready, isFalse);
    });
  });

  test(
    'the privacy manifest is declared, untracked and in the Runner target',
    () {
      final manifest = File(
        'ios/Runner/PrivacyInfo.xcprivacy',
      ).readAsStringSync();
      expect(manifest, matches(RegExp(r'NSPrivacyTracking</key>\s*<false/>')));
      expect(manifest, contains('NSPrivacyAccessedAPICategoryUserDefaults'));
      expect(manifest, contains('CA92.1'));
      expect(
        manifest,
        isNot(contains('NSPrivacyCollectedDataTypePurchaseHistory')),
      );
      expect(manifest, isNot(contains('NSPrivacyCollectedDataTypeUserID')));
      final project = File(
        'ios/Runner.xcodeproj/project.pbxproj',
      ).readAsStringSync();
      expect(
        RegExp('PrivacyInfo.xcprivacy in Resources').allMatches(project),
        hasLength(2),
      );
    },
  );

  test('native consent readers mirror the Dart keys and notice version', () {
    final dart = File(
      'lib/core/observability/telemetry_preference.dart',
    ).readAsStringSync();
    expect(dart, contains("'telemetry-consent-v1'"));
    expect(dart, contains("choiceKey = 'telemetry-consent-choice'"));
    expect(
      dart,
      contains("noticeVersionKey = 'telemetry-consent-notice-version'"),
    );
    const shared = [
      'flutter.telemetry-consent-choice',
      'flutter.telemetry-consent-notice-version',
      'telemetry-consent-v1',
    ];
    final kotlin = File(
      'android/app/src/main/kotlin/com/tuturuuu/app/mobile/telemetry/'
      'TelemetryConsentDecision.kt',
    ).readAsStringSync();
    final swift = File('ios/Runner/AppDelegate.swift').readAsStringSync();
    for (final value in shared) {
      expect(kotlin, contains('"$value"'));
      expect(swift, contains('"$value"'));
    }
    expect(kotlin, contains('"FlutterSharedPreferences"'));
  });

  test('native defaults stay disabled until Dart reads consent', () {
    final plist = File('ios/Runner/Info.plist').readAsStringSync();
    for (final key in [
      'FIREBASE_ANALYTICS_COLLECTION_ENABLED',
      'FirebaseCrashlyticsCollectionEnabled',
      'FirebaseDataCollectionDefaultEnabled',
      'FirebaseMessagingAutoInitEnabled',
      // No advertising identifier is ever collected.
      'GOOGLE_ANALYTICS_ADID_COLLECTION_ENABLED',
    ]) {
      // Exactly one entry each: duplicate plist keys are invalid.
      expect(plist.split('<key>$key</key>'), hasLength(2));
      expect(plist, matches(RegExp('<key>$key</key>\\s*<false/>')));
    }
    final gradle = File('android/app/build.gradle.kts').readAsStringSync();
    expect(
      gradle,
      contains(
        'exclude(group = "com.google.android.gms", '
        'module = "play-services-ads-identifier")',
      ),
    );
    final manifest = File(
      'android/app/src/main/AndroidManifest.xml',
    ).readAsStringSync();
    for (final key in [
      'firebase_analytics_collection_enabled',
      'firebase_crashlytics_collection_enabled',
      'firebase_data_collection_default_enabled',
      'firebase_messaging_auto_init_enabled',
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
      manifest,
      matches(
        RegExp(
          r'<uses-permission\s+android:name="android\.permission\.ACCESS_ADSERVICES_AD_ID"'
          r'\s+tools:node="remove"',
        ),
      ),
    );
    // Attribution reporting is ad measurement; the app has none.
    expect(
      manifest,
      matches(
        RegExp(
          r'<uses-permission\s+android:name="android\.permission\.ACCESS_ADSERVICES_ATTRIBUTION"'
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
    // A persisted "on" from an older build is switched off right after Firebase
    // starts, unless the stored choice is an explicit Allow.
    final gateCall = delegate.indexOf(
      'TelemetryConsentGate.disableCollectionUnlessAllowed()',
    );
    expect(gateCall, greaterThan(delegate.indexOf('FirebaseApp.configure()')));
    expect(
      gateCall,
      greaterThan(delegate.indexOf('GeneratedPluginRegistrant.register')),
    );
    expect(
      delegate,
      contains('Analytics.setAnalyticsCollectionEnabled(false)'),
    );
    expect(
      delegate,
      contains(
        'Crashlytics.crashlytics().setCrashlyticsCollectionEnabled(false)',
      ),
    );
    expect(manifest, isNot(contains('TelemetryCollectionLockProvider')));
    final kotlin = File(
      'android/app/src/main/kotlin/com/tuturuuu/app/mobile/telemetry/'
      'FirebaseStartupGate.kt',
    ).readAsStringSync();
    expect(kotlin, contains('setAnalyticsCollectionEnabled(false)'));
    expect(kotlin, contains('PersistedAnalyticsGate.mayEnable'));
    expect(kotlin, contains('TelemetryConsentDecision.allowsCollection'));
    expect(manifest, contains('tools:node="remove"'));
    expect(
      manifest,
      contains('com.google.firebase.provider.FirebaseInitProvider'),
    );
    final nativeStartup = delegate.substring(
      delegate.indexOf('didFinishLaunchingWithOptions launchOptions:'),
      delegate.indexOf(
        'override func application(',
        delegate.indexOf('didFinishLaunchingWithOptions launchOptions:'),
      ),
    );
    expect(nativeStartup, isNot(contains('FirebaseApp.configure()')));
    expect(nativeStartup, isNot(contains('registerForRemoteNotifications()')));
    final podfile = File('ios/Podfile').readAsStringSync();
    expect(podfile, contains('ConsentFirebaseMessagingPlugin.m'));
    expect(podfile, contains('APNs registration waits'));
  });
}
