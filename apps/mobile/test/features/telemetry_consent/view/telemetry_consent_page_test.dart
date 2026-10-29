import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/observability/mobile_observability.dart';
import 'package:mobile/core/observability/telemetry_preference.dart';
import 'package:mobile/core/router/app_router_telemetry_consent.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/telemetry_consent/view/telemetry_consent_page.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';
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

typedef _Started = (
  TelemetryPreference,
  _RecordingControls,
  MobileObservability,
);

/// Wires a preference to observability the way bootstrap does.
Future<_Started> _start({
  AppFlavor flavor = AppFlavor.production,
  Map<String, Object> saved = const {},
  String noticeVersion = TelemetryPreference.currentNoticeVersion,
  // Widget tests cannot await MobileObservability's PackageInfo channel call,
  // so they drive the same SDK controls directly.
  bool direct = false,
}) async {
  SharedPreferences.setMockInitialValues(saved);
  final controls = _RecordingControls();
  final observability = MobileObservability.withControls(controls);
  final preference = TelemetryPreference(noticeVersion: noticeVersion);
  await preference.initialize(
    promptEligible: flavor == AppFlavor.production,
    apply: ({required enabled}) async {
      if (!direct) {
        return observability.initialize(flavor, collectionEnabled: enabled);
      }
      await controls.setCrashCollection(enabled: enabled);
      await controls.setAnalyticsCollection(enabled: enabled);
      if (!enabled) await controls.deleteUnsentCrashReports();
    },
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

Map<String, Object> get _answered => {
  TelemetryPreference.choiceKey: false,
  TelemetryPreference.noticeVersionKey: TelemetryPreference.currentNoticeVersion,
};

void main() {
  tearDown(
    () => TestWidgetsFlutterBinding.instance.platformDispatcher
        .clearLocaleTestValue(),
  );

  group('prompt eligibility', () {
    test('shows in production only while no answer is stored', () async {
      final (fresh, _, _) = await _start();
      expect(fresh.consentPending, isTrue);
      final (decided, _, _) = await _start(saved: _answered);
      expect(decided.consentPending, isFalse);
    });

    test('non-production flavors never prompt and never collect', () async {
      for (final flavor in [AppFlavor.development, AppFlavor.staging]) {
        final (preference, controls, _) = await _start(flavor: flavor);
        expect(preference.consentPending, isFalse, reason: flavor.name);
        expect(_redirect(preference, Routes.home), isNull);
        await preference.setEnabled(value: true);
        expect(controls.calls, isNot(contains('crash:true')));
        expect(controls.calls, isNot(contains('analytics:true')));
      }
    });

    test('an uninitialized preference never prompts', () {
      expect(TelemetryPreference().consentPending, isFalse);
    });

    test('a changed notice version prompts again; the same one does not', () async {
      final (same, _, _) = await _start(saved: _answered);
      expect(same.consentPending, isFalse);
      final (next, controls, observability) = await _start(
        saved: _answered..[TelemetryPreference.choiceKey] = true,
        noticeVersion: 'telemetry-consent-v2',
      );
      expect(next.consentPending, isTrue);
      expect(observability.enabled, isFalse);
      expect(controls.calls, isNot(contains('analytics:true')));
    });
  });

  group('no collection before an explicit Allow', () {
    for (final locale in [
      const Locale('de', 'DE'),
      const Locale('fr', 'FR'),
      const Locale('en', 'GB'),
      const Locale('vi', 'VN'),
      const Locale('en', 'US'),
      const Locale('en'),
    ]) {
      test('$locale starts with both SDKs off', () async {
        TestWidgetsFlutterBinding.instance.platformDispatcher.localeTestValue =
            locale;
        final (preference, controls, observability) = await _start();
        expect(preference.enabled, isFalse);
        expect(observability.enabled, isFalse);
        expect(controls.calls, contains('crash:false'));
        expect(controls.calls, contains('analytics:false'));
        expect(controls.calls, isNot(contains('crash:true')));
        expect(controls.calls, isNot(contains('analytics:true')));
      });
    }

    test('an older persisted on collects nothing until answered', () async {
      final (preference, controls, observability) = await _start(
        saved: {TelemetryPreference.legacyKey: true},
      );
      expect(preference.consentPending, isTrue);
      expect(observability.enabled, isFalse);
      expect(controls.calls, ['crash:false', 'analytics:false', 'delete']);
    });
  });

  group('redirect', () {
    test('sends a pending user with a workspace to the prompt', () async {
      final (preference, _, _) = await _start();
      final target = _redirect(preference, '/tasks?x=1');
      expect(target, startsWith(Routes.telemetryConsent));
      expect(Uri.parse(target!).queryParameters['from'], '/tasks?x=1');
    });

    test('waits for onboarding and leaves Settings alone', () async {
      final (preference, _, _) = await _start();
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
      final (preference, _, _) = await _start();
      const onPrompt = '${Routes.telemetryConsent}?from=%2Ftasks';
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
      final (preference, controls, _) = await _start(direct: true);
      await tester.pumpApp(TelemetryConsentPage(preference: preference));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Allow'));
      await tester.pumpAndSettle();
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getBool(TelemetryPreference.choiceKey), isTrue);
      expect(
        prefs.getString(TelemetryPreference.noticeVersionKey),
        TelemetryPreference.currentNoticeVersion,
      );
      expect(prefs.getString(TelemetryPreference.decidedAtKey), isNotNull);
      expect(controls.calls.last, 'analytics:true');
      expect(controls.calls, contains('crash:true'));
      expect(preference.consentPending, isFalse);
    });

    testWidgets("Don't allow revokes, persists and is not shown again", (
      tester,
    ) async {
      final (preference, controls, _) = await _start(direct: true);
      await tester.pumpApp(TelemetryConsentPage(preference: preference));
      await tester.pumpAndSettle();
      controls.calls.clear();
      await tester.tap(find.text("Don't allow"));
      await tester.pumpAndSettle();
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getBool(TelemetryPreference.choiceKey), isFalse);
      expect(controls.calls, containsAll(['crash:false', 'analytics:false']));
      expect(controls.calls, isNot(contains('analytics:true')));
      expect(preference.consentPending, isFalse);
      expect(_redirect(preference, Routes.home), isNull);

      // A fresh launch reads the stored answer and does not prompt again.
      final (relaunched, _, _) = await _start(
        direct: true,
        saved: {
          TelemetryPreference.choiceKey: false,
          TelemetryPreference.noticeVersionKey:
              prefs.getString(TelemetryPreference.noticeVersionKey)!,
        },
      );
      expect(relaunched.consentPending, isFalse);
    });

    testWidgets('the back gesture declines and never grants consent', (
      tester,
    ) async {
      final (preference, controls, _) = await _start(direct: true);
      await tester.pumpApp(TelemetryConsentPage(preference: preference));
      await tester.pumpAndSettle();
      controls.calls.clear();
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getBool(TelemetryPreference.choiceKey), isFalse);
      expect(preference.enabled, isFalse);
      expect(preference.consentPending, isFalse);
      expect(controls.calls, isNot(contains('analytics:true')));
    });

    testWidgets('names Firebase, offers equal choices and a privacy link', (
      tester,
    ) async {
      final (preference, _, _) = await _start(direct: true);
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
      expect(find.text('Help improve Tuturuuu?'), findsOneWidget);
      expect(find.textContaining('Google Firebase'), findsOneWidget);
      expect(find.textContaining('anonymous'), findsNothing);
      expect(find.textContaining('advertising'), findsNothing);
      final buttons = tester
          .widgetList<AppButton>(
            find.ancestor(
              of: find.textContaining(RegExp(r'^(Allow|Don.t allow)$')),
              matching: find.byType(AppButton),
            ),
          )
          .toList();
      expect(buttons.map((b) => b.variant), [
        AppButtonVariant.outline,
        AppButtonVariant.outline,
      ]);
      expect(buttons.map((b) => b.size).toSet(), hasLength(1));
      expect(
        tester.getSize(find.byWidget(buttons.first)),
        tester.getSize(find.byWidget(buttons.last)),
      );
      await tester.tap(find.text('Privacy details'));
      await tester.pumpAndSettle();
      expect(opened, [telemetryPrivacyUri]);
    });

    test('Vietnamese copy matches the Legal draft verbatim', () {
      final vi = AppLocalizationsVi();
      expect(vi.telemetryConsentTitle, 'Giúp cải thiện Tuturuuu?');
      expect(vi.telemetryConsentAllow, 'Cho phép');
      expect(vi.telemetryConsentDeny, 'Không cho phép');
      expect(vi.telemetryConsentLearnMore, 'Chi tiết về quyền riêng tư');
      expect(vi.settingsShareTelemetry, 'Chia sẻ dữ liệu phân tích và báo cáo sự cố');
      expect(vi.telemetryConsentBody, startsWith('Chia sẻ dữ liệu sử dụng và báo cáo sự cố với Google Firebase'));
    });

    testWidgets('answers stay disabled until the preference is ready', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({});
      final preference = TelemetryPreference();
      await tester.pumpApp(TelemetryConsentPage(preference: preference));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Allow'));
      await tester.pumpAndSettle();
      expect(preference.hasExplicitChoice, isFalse);
      expect(preference.enabled, isFalse);
    });
  });
}
