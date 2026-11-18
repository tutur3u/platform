@Tags(['golden'])
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/widgets/apps_dropdown_picker.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/golden_tolerance.dart';
import '../../helpers/pump_app.dart';

void main() {
  final original = goldenFileComparator;
  setUpAll(() async {
    goldenFileComparator = GoldenTolerance(
      File('test/features/apps/apps_hub_goldens_test.dart').absolute.uri,
    );
    if (!Platform.isLinux) return;
    for (final font in const {
      'Roboto': 'assets/fonts/NotoSans.ttf',
      'Nunito': 'assets/fonts/Nunito-Variable.ttf',
      'MaterialIcons': 'fonts/MaterialIcons-Regular.otf',
      'LucideIcons': 'assets/fonts/lucide/LucideIcons.otf',
    }.entries) {
      await (FontLoader(font.key)..addFont(rootBundle.load(font.value))).load();
    }
  });
  tearDownAll(() => goldenFileComparator = original);

  for (final (design, sorbet) in [
    ('classic', null),
    ('sorbet', const SorbetTheme()),
  ]) {
    for (final brightness in Brightness.values) {
      for (final (device, size, top, clearance) in [
        ('phone', const Size(390, 844), 48.0, 122.0),
        ('tablet', const Size(834, 1194), 24.0, 108.0),
      ]) {
        final name = 'apps_${design}_${brightness.name}_$device';
        testWidgets(name, skip: !Platform.isLinux, (tester) async {
          tester.view
            ..devicePixelRatio = 1
            ..physicalSize = size
            ..padding = FakeViewPadding(bottom: clearance)
            ..viewPadding = FakeViewPadding(top: top);

          addTearDown(tester.view.reset);
          SharedPreferences.setMockInitialValues({
            'apps-pinned': ['tasks', 'calendar', 'finance', 'chat'],
            'apps-recent': ['drive', 'meet', 'documents', 'timer'],
            'enabled-experimental-apps': [
              'chat',
              'meet',
              'documents',
              'drive',
              'timer',
            ],
          });
          final settings = SettingsRepository();
          final tabs = AppTabCubit(settingsRepository: settings);
          final experiments = ExperimentalAppsCubit(
            settingsRepository: settings,
          );
          addTearDown(tabs.close);
          addTearDown(experiments.close);
          await tabs.loadLastApp();
          await experiments.load();

          await tester.pumpWidget(
            sorbetTestApp(
              sorbet: sorbet,
              brightness: brightness,
              boundaryKey: const ValueKey('golden'),
              home: MultiBlocProvider(
                providers: [
                  BlocProvider.value(value: tabs),
                  BlocProvider.value(value: experiments),
                ],
                child: const Scaffold(body: AppsScreen()),
              ),
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
