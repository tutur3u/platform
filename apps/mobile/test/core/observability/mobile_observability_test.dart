import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/observability/mobile_observability.dart';
import 'package:mobile/core/observability/telemetry_preference.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _RecordingControls extends TelemetryCollectionControls {
  final calls = <String>[];
  Error? deleteError;

  @override
  Future<void> setCrashCollection({required bool enabled}) async =>
      calls.add('crash:$enabled');

  @override
  Future<void> setAnalyticsCollection({required bool enabled}) async =>
      calls.add('analytics:$enabled');

  @override
  Future<void> deleteUnsentCrashReports() async {
    calls.add('delete');
    if (deleteError case final error?) throw error;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('native errors retain a safe code without message or details', () {
    final error = PlatformException(
      code: 'webview_create_failed',
      message: 'Private email content',
      details: {'token': 'private'},
    );
    expect(
      mobileCrashSignature(error),
      'PlatformException:webview_create_failed',
    );
  });

  test('unsafe native codes are redacted', () {
    expect(
      mobileCrashSignature(
        PlatformException(code: 'email:private@example.com'),
      ),
      'PlatformException:unknown',
    );
  });

  group('unsent crash reports', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    test('startup without consent disables then deletes them', () async {
      final controls = _RecordingControls();
      final observability = MobileObservability.withControls(controls);
      await observability.initialize(
        AppFlavor.production,
        collectionEnabled: false,
      );
      expect(controls.calls, ['crash:false', 'analytics:false', 'delete']);
      expect(observability.enabled, isFalse);
    });

    test('non-production startup deletes them even with consent', () async {
      final controls = _RecordingControls();
      await MobileObservability.withControls(
        controls,
      ).initialize(AppFlavor.development, collectionEnabled: true);
      expect(controls.calls, ['crash:false', 'analytics:false', 'delete']);
    });

    test('startup with consent keeps them for upload', () async {
      final controls = _RecordingControls();
      final observability = MobileObservability.withControls(controls);
      await observability.initialize(
        AppFlavor.production,
        collectionEnabled: true,
      );
      expect(controls.calls, ['crash:true', 'analytics:true']);
      expect(observability.enabled, isTrue);
    });

    test('opting out disables collection and deletes them', () async {
      final controls = _RecordingControls();
      final observability = MobileObservability.withControls(controls);
      final preference = TelemetryPreference();
      await preference.initialize(
        read: () async => null,
        apply: ({required enabled}) => observability.initialize(
          AppFlavor.production,
          collectionEnabled: enabled,
        ),
      );
      expect(controls.calls, ['crash:false', 'analytics:false', 'delete']);
      await preference.setEnabled(value: true);
      expect(controls.calls.last, 'analytics:true');
      controls.calls.clear();

      await preference.setEnabled(value: false);
      expect(controls.calls, ['crash:false', 'analytics:false', 'delete']);
      expect(observability.enabled, isFalse);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getBool(TelemetryPreference.choiceKey), isFalse);
    });

    test('a failed deletion still leaves collection disabled', () async {
      final controls = _RecordingControls()..deleteError = StateError('io');
      final observability = MobileObservability.withControls(controls);
      await observability.initialize(
        AppFlavor.production,
        collectionEnabled: false,
      );
      expect(controls.calls.last, 'delete');
      expect(observability.enabled, isFalse);
    });
  });
}
