import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/observability/telemetry_preference.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/push_settings_tile.dart';
import 'package:mobile/features/settings/view/settings_tile.dart';
import 'package:mobile/features/settings/view/telemetry_settings_tile.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  for (final mode in [ThemeMode.light, ThemeMode.dark]) {
    for (final scale in [1.0, 2.0]) {
      for (final locale in ['en', 'vi']) {
        for (final row in ['push', 'telemetry', 'storage', 'long']) {
          testWidgets('$row $mode scale=$scale $locale disclosure', (
            tester,
          ) async {
            tester.view.physicalSize = const Size(390, 844);
            tester.view.devicePixelRatio = 1;
            tester.platformDispatcher.textScaleFactorTestValue = scale;
            addTearDown(
              tester.platformDispatcher.clearTextScaleFactorTestValue,
            );
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            final preference = TelemetryPreference();
            addTearDown(preference.dispose);
            late String summary;
            late String full;
            await tester.pumpApp(
              Builder(
                builder: (context) => Localizations.override(
                  context: context,
                  locale: Locale(locale),
                  child: Builder(
                    builder: (context) {
                      final l = context.l10n;
                      summary = switch (row) {
                        'push' => l.settingsPushSummary,
                        'telemetry' => l.settingsTelemetrySummary,
                        'storage' => l.settingsStorageSummary,
                        _ =>
                          'A long description that must stay reachable '
                              'even when it cannot fit on one line.',
                      };
                      full = switch (row) {
                        'push' => l.settingsPushFirebaseDisclosure,
                        'telemetry' =>
                          '${l.settingsShareTelemetryDescription}\n\n'
                              '${l.telemetryFirebaseInstallationDisclosure}',
                        'storage' => l.offlineStorageScope,
                        _ => summary,
                      };
                      return MediaQuery(
                        data: MediaQuery.of(
                          context,
                        ).copyWith(textScaler: TextScaler.linear(scale)),
                        child: Scaffold(
                          body: switch (row) {
                            'push' => const PushSettingsTile(),
                            'telemetry' => TelemetrySettingsTile(
                              preference: preference,
                            ),
                            _ => SettingsTile(
                              icon: LucideIcons.hardDrive,
                              title: l.cacheStorageTitle,
                              subtitle: summary,
                              details: row == 'storage' ? full : null,
                            ),
                          },
                        ),
                      );
                    },
                  ),
                ),
              ),
              themeMode: mode,
            );
            await tester.pumpAndSettle();
            final text = tester.widget<Text>(find.text(summary));
            expect(text.maxLines, 1);
            expect(tester.takeException(), isNull);
            await tester.tap(find.byType(AppIconButton));
            await tester.pumpAndSettle();
            expect(
              find.descendant(
                of: find.byType(AppSheetScaffold),
                matching: find.text(full),
              ),
              findsOneWidget,
            );
            expect(
              MediaQuery.textScalerOf(
                tester.element(find.byType(AppSheetScaffold)),
              ).scale(10),
              scale * 10,
            );
            expect(tester.takeException(), isNull);
          });
        }
      }
    }
  }

  testWidgets('opted-in wrapping rows keep wrapping without an info sheet', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    const long =
        'someone.with.a.very.long.address@example-workspace.tuturuuu.com';
    await tester.pumpApp(
      const SettingsTile(
        icon: LucideIcons.mail,
        title: 'Email',
        subtitle: long,
        wrapSupportingText: true,
      ),
    );
    await tester.pumpAndSettle();
    final text = tester.widget<Text>(find.text(long));
    expect(text.maxLines, isNull);
    expect(text.overflow, isNot(TextOverflow.ellipsis));
    expect(find.byIcon(LucideIcons.info), findsNothing);
  });
}
