import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _CompletionHeldSettings extends SettingsRepository {
  final written = Completer<void>();
  final finish = Completer<void>();
  @override
  Future<void> setThemeMode(String mode, {bool Function()? shouldWrite}) async {
    await super.setThemeMode(mode, shouldWrite: shouldWrite);
    written.complete();
    await finish.future;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({'theme-mode': 'light'}));
  test('manual choice retains persistence and immediate state', () async {
    final settings = SettingsRepository();
    final theme = ThemeCubit(settingsRepository: settings);
    await theme.setThemeMode(ThemeMode.dark);
    expect(theme.state.themeMode, ThemeMode.dark);
    expect(await settings.getThemeMode(), 'dark');
    await theme.close();
  });
  test(
    'actor ABA during preference await prevents write and emission',
    () async {
      var epoch = 0;
      final settings = SettingsRepository();
      final theme = ThemeCubit(
        settingsRepository: settings,
        initialThemeMode: ThemeMode.light,
      );
      final pending = theme.setThemeMode(
        ThemeMode.dark,
        isCurrent: () => epoch == 0,
      );
      epoch += 2;
      await pending;
      expect(theme.state.themeMode, ThemeMode.light);
      expect(await settings.getThemeMode(), 'light');
      await theme.close();
    },
  );
  test('dispose during preference await prevents write and emission', () async {
    final settings = SettingsRepository();
    final theme = ThemeCubit(settingsRepository: settings);
    final pending = theme.setThemeMode(ThemeMode.dark, isCurrent: () => true);
    await theme.close();
    await pending;
    expect(await settings.getThemeMode(), 'light');
  });
  test('expired action before admission does not change preference', () async {
    final settings = SettingsRepository();
    final theme = ThemeCubit(settingsRepository: settings);
    await theme.setThemeMode(ThemeMode.dark, isCurrent: () => false);
    expect(await settings.getThemeMode(), 'light');
    expect(theme.state.themeMode, ThemeMode.system);
    await theme.close();
  });
  test(
    'scope replacement after persistence cannot publish stale theme',
    () async {
      var epoch = 0;
      final settings = _CompletionHeldSettings();
      final theme = ThemeCubit(
        settingsRepository: settings,
        initialThemeMode: ThemeMode.light,
      );
      final pending = theme.setThemeMode(
        ThemeMode.dark,
        isCurrent: () => epoch == 0,
      );
      await settings.written.future;
      epoch += 2;
      settings.finish.complete();
      await pending;
      expect(theme.state.themeMode, ThemeMode.light);
      await theme.close();
    },
  );
}
