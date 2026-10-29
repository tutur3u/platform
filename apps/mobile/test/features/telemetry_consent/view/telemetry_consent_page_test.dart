import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/observability/mobile_observability.dart';
import 'package:mobile/core/observability/telemetry_preference.dart';
import 'package:mobile/core/router/app_router_telemetry_consent.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/telemetry_consent/view/telemetry_consent_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';

class _RecordingControls extends TelemetryCollectionControls {
  final calls = <String>[];

  @override
  Future<void> setCrashCollection({required bool enabled}) async =>
      calls.add('crash:$enabled');

  @override
  Future<void> setAnalyticsCollection({required bool enabled}) async =>
      calls.add('analytics:$enabled');

  @override
  Future<void> deleteUnsentCrashReports() async => calls.add('delete');
}

/// Wires a preference to observability the way bootstrap does.
Future<(TelemetryPreference, _RecordingControls, MobileObservability)> _start({
  String? country,
  AppFlavor flavor = AppFlavor.production,
  Map<String, Object> saved = const {},
}) async {
  SharedPreferences.setMockInitialValues(saved);
  final controls = _RecordingControls();
  final observability = MobileObservability.withControls(controls);
  final preference = TelemetryPreference(countryCode: country);
  await preference.initialize(
    promptEligible: flavor == AppFlavor.production,
    apply: ({required enabled}) =>
        observability.initialize(flavor, collectionEnabled: enabled),
  );
  return (preference, controls, observability);
}

String? _redirect(TelemetryPreference? preference, String location) {
  final uri = Uri.parse(location);
  return resolveTelemetryConsentRedirect(
    preference: preference,
    uri: uri,
    matchedLocation: uri.path,
    hasWorkspace: true,
  );
}

void main() {
  group('prompt eligibility', () {
    test('shows in production only while no explicit choice is stored', () async {
      final (fresh, _, _) = await _start(country: 'DE');
      expect(fresh.consentPending, isTrue);

      final (decided, _, _) = await _start(
        country: 'DE',
        saved: {TelemetryPreference.preferenceKey: false},
      );
      expect(decided.consentPending, isFalse);
    });

    test('non-production flavors never prompt and never collect', () async {
      for (final flavor in [AppFlavor.development, AppFlavor.staging]) {
        final (preference, controls, _) = await _start(
          country: 'US',
          flavor: flavor,
        );
        expect(preference.consentPending, isFalse, reason: flavor.name);
        expect(_redirect(preference, Routes.home), isNull);
        expect(controls.calls, containsAll(['crash:false', 'analytics:false']));
        expect(controls.calls, isNot(contains('crash:true')));
        await preference.setEnabled(value: true);
        expect(controls.calls, isNot(contains('analytics:true')));
      }
    });

    test('an uninitialized preference never prompts', () {
      expect(TelemetryPreference(countryCode: 'DE').consentPending, isFalse);
    });
  });

  group('no collection before an explicit Allow', () {
    for (final country in ['DE', 'FR', 'CH', 'GB', 'IS', 'VN', null]) {
      test('${country ?? 'unknown region'} stays off at startup', () async {
        final (preference, controls, observability) = await _start(
          country: country,
        );
        expect(preference.enabled, isFalse);
        expect(observability.enabled, isFalse);
        expect(controls.calls, contains('crash:false'));
        expect(controls.calls, contains('analytics:false'));
        expect(controls.calls, isNot(contains('crash:true')));
        expect(controls.calls, isNot(contains('analytics:true')));
      });
    }

    test('an on-by-default region follows its default until answered', () async {
      final (preference, controls, observability) = await _start(country: 'US');
      expect(preference.consentPending, isTrue);
      expect(observability.enabled, isTrue);
      expect(controls.calls, containsAll(['crash:true', 'analytics:true']));
    });
  });

  group('redirect', () {
    test('sends a pending user with a workspace to the prompt', () async {
      final (preference, _, _) = await _start(country: 'DE');
      final target = _redirect(preference, '/tasks?x=1');
      expect(target, startsWith(Routes.telemetryConsent));
      expect(Uri.parse(target!).queryParameters['from'], '/tasks?x=1');
    });

    test('waits for onboarding and leaves Settings alone', () async {
      final (preference, _, _) = await _start(country: 'DE');
      expect(
        resolveTelemetryConsentRedirect(
          preference: preference,
          uri: Uri.parse('/'),
          matchedLocation: '/',
          hasWorkspace: false,
        ),
        isNull,
      );
      expect(_redirect(preference, Routes.settingsPreferences), isNull);
    });

    test('returns to the original destination once answered', () async {
      final (preference, _, _) = await _start(country: 'DE');
      final onPrompt = '${Routes.telemetryConsent}?from=%2Ftasks';
      expect(_redirect(preference, onPrompt), isNull);
      await preference.setEnabled(value: false);
      expect(_redirect(preference, onPrompt), '/tasks');
      expect(_redirect(preference, '/tasks'), isNull);
      expect(
        _redirect(preference, '${Routes.telemetryConsent}?from=//evil.example'),
        Routes.home,
      );
    });
  });

  group('page', () {
    testWidgets('Allow persists and configures both SDKs', (tester) async {
      final (preference, controls, _) = await _start(country: 'DE');
      await tester.pumpApp(TelemetryConsentPage(preference: preference));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Allow'));
      await tester.pumpAndSettle();
      expect(
        (await SharedPreferences.getInstance()).getBool(
          TelemetryPreference.preferenceKey,
        ),
        isTrue,
      );
      expect(controls.calls.last, 'analytics:true');
      expect(controls.calls, contains('crash:true'));
      expect(preference.consentPending, isFalse);
    });

    testWidgets("Don't allow revokes, persists and is not shown again", (
      tester,
    ) async {
      final (preference, controls, _) = await _start(country: 'US');
      await tester.pumpApp(TelemetryConsentPage(preference: preference));
      await tester.pumpAndSettle();
      controls.calls.clear();
      await tester.tap(find.text("Don't allow"));
      await tester.pumpAndSettle();
      expect(
        (await SharedPreferences.getInstance()).getBool(
          TelemetryPreference.preferenceKey,
        ),
        isFalse,
      );
      expect(controls.calls, containsAll(['crash:false', 'analytics:false']));
      expect(preference.consentPending, isFalse);
      expect(_redirect(preference, Routes.home), isNull);

      // A fresh launch reads the stored choice and does not prompt again.
      final (relaunched, _, _) = await _start(
        country: 'US',
        saved: {TelemetryPreference.preferenceKey: false},
      );
      expect(relaunched.consentPending, isFalse);
    });

    testWidgets('names the services, offers equal choices and a link', (
      tester,
    ) async {
      final (preference, _, _) = await _start(country: 'DE');
      final opened = <Uri>[];
      await tester.pumpApp(
        TelemetryConsentPage(
          preference: preference,
          openLink: (context, uri) async {
            opened.add(uri);
            return true;
          },
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Firebase Analytics'), findsOneWidget);
      expect(find.textContaining('Crashlytics'), findsOneWidget);
      expect(find.text('Allow'), findsOneWidget);
      expect(find.text("Don't allow"), findsOneWidget);
      final variants = tester
          .widgetList<AppButton>(
            find.ancestor(
              of: find.textContaining(RegExp(r'^(Allow|Don.t allow)$')),
              matching: find.byType(AppButton),
            ),
          )
          .map((button) => button.variant);
      expect(variants, [AppButtonVariant.outline, AppButtonVariant.outline]);
      await tester.tap(find.text('Learn more'));
      await tester.pumpAndSettle();
      expect(opened, [telemetryPrivacyUri]);
    });

    testWidgets('answers stay disabled until the preference is ready', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({});
      final preference = TelemetryPreference(countryCode: 'DE');
      await tester.pumpApp(TelemetryConsentPage(preference: preference));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Allow'));
      await tester.pumpAndSettle();
      expect(preference.hasExplicitChoice, isFalse);
      expect(preference.enabled, isFalse);
    });
  });
}
