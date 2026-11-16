@Tags(['golden'])
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/settings_group.dart';
import 'package:mobile/features/settings/view/settings_tile.dart';

import '../../../helpers/golden_tolerance.dart';
import '../../../helpers/pump_app.dart';

/// Settings rows at phone and tablet sizes, light and dark, classic and
/// Sorbet: a switch row whose description opens details, chevron rows with
/// and without a value, and a destructive row.
void main() {
  final original = goldenFileComparator;
  setUpAll(() {
    goldenFileComparator = GoldenTolerance(
      File(
        'test/features/settings/view/settings_rows_goldens_test.dart',
      ).absolute.uri,
    );
  });
  tearDownAll(() => goldenFileComparator = original);

  for (final (design, sorbet) in [
    ('classic', null),
    ('sorbet', const SorbetTheme()),
  ]) {
    for (final brightness in Brightness.values) {
      for (final (device, size) in [
        ('phone', const Size(390, 844)),
        ('tablet', const Size(834, 1194)),
      ]) {
        final name = 'rows_${design}_${brightness.name}_$device';
        testWidgets(name, (tester) async {
          tester.view
            ..physicalSize = size
            ..devicePixelRatio = 1;
          addTearDown(tester.view.reset);
          await tester.pumpWidget(
            sorbetTestApp(
              sorbet: sorbet,
              brightness: brightness,
              boundaryKey: const ValueKey('golden'),
              home: const _SettingsRowsScene(),
            ),
          );
          await tester.pumpAndSettle();
          await expectLater(
            find.byKey(const ValueKey('golden')),
            matchesGoldenFile('goldens/$name.png'),
          );
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}

class _SettingsRowsScene extends StatelessWidget {
  const _SettingsRowsScene();

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SettingsCompactSection(
            title: 'Notifications & interaction',
            children: [
              SettingsTile(
                grouped: true,
                icon: LucideIcons.bell,
                title: 'Push notifications',
                subtitle: 'Get alerts on this device',
                details: 'Alerts are delivered through the platform service.',
                trailingWidth: 64,
                trailing: AppSwitch(value: true, onChanged: (_) {}),
              ),
              SettingsTile(
                grouped: true,
                icon: LucideIcons.vibrate,
                title: 'Haptic feedback',
                value: 'On',
                onTap: () {},
              ),
              SettingsTile(
                grouped: true,
                icon: LucideIcons.bellRing,
                title: 'Reminders',
                onTap: () {},
              ),
            ],
          ),
          SettingsCompactSection(
            title: 'Account',
            children: [
              SettingsTile(
                grouped: true,
                isDestructive: true,
                icon: LucideIcons.userMinus,
                title: 'Delete account',
                onTap: () {},
              ),
            ],
          ),
        ],
      ),
    ),
  );
}
