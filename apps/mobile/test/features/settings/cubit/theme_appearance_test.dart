import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _HeldAppearanceSettings extends SettingsRepository {
  final release = Completer<void>();

  @override
  Future<void> setAppearance(
    String encoded, {
    bool Function()? shouldWrite,
  }) async {
    await release.future;
    await super.setAppearance(encoded, shouldWrite: shouldWrite);
  }
}

const _aurora = AppearanceSettings(
  theme: AppearanceThemeId.aurora,
  accent: AppearanceAccentId.violet,
  backgroundStyle: AppearanceBackgroundStyle.blobs,
  intensity: 0.8,
  softness: 0.3,
  surfaceOpacity: 0.55,
  animate: true,
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test(
    'existing theme-mode installs migrate with the default appearance',
    () async {
      SharedPreferences.setMockInitialValues({'theme-mode': 'dark'});
      final settings = SettingsRepository();
      final theme = ThemeCubit(settingsRepository: settings);
      await theme.loadThemeMode();
      await theme.loadAppearance();
      expect(theme.state.themeMode, ThemeMode.dark);
      expect(theme.state.appearance, const AppearanceSettings());
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('theme-mode'), 'dark');
      expect(prefs.containsKey('appearance-v1'), isFalse);
      await theme.close();
    },
  );

  test('appearance applies immediately and survives a restart', () async {
    final settings = SettingsRepository();
    final theme = ThemeCubit(settingsRepository: settings);
    final pending = theme.setAppearance(_aurora);
    expect(theme.state.appearance, _aurora);
    await pending;
    await theme.close();

    final restarted = ThemeCubit(
      settingsRepository: settings,
      initialAppearance: AppearanceSettings.decode(
        await settings.getAppearance(),
      ),
    );
    expect(restarted.state.appearance, _aurora);
    await restarted.close();
  });

  test('preview does not persist until committed', () async {
    final settings = SettingsRepository();
    final theme = ThemeCubit(settingsRepository: settings)
      ..previewAppearance(_aurora);
    expect(theme.state.appearance, _aurora);
    expect(await settings.getAppearance(), isNull);
    await theme.close();
  });

  test('a newer change wins over an older pending write', () async {
    final settings = _HeldAppearanceSettings();
    final theme = ThemeCubit(settingsRepository: settings);
    final older = theme.setAppearance(_aurora);
    final newer = theme.setAppearance(const AppearanceSettings());
    settings.release.complete();
    await Future.wait([older, newer]);
    expect(theme.state.appearance, const AppearanceSettings());
    expect(
      AppearanceSettings.decode(await settings.getAppearance()),
      const AppearanceSettings(),
    );
    await theme.close();
  });

  test('closing before the write lands prevents persistence', () async {
    final settings = _HeldAppearanceSettings();
    final theme = ThemeCubit(settingsRepository: settings);
    final pending = theme.setAppearance(_aurora);
    await theme.close();
    settings.release.complete();
    await pending;
    expect(await settings.getAppearance(), isNull);
  });

  test('a late load cannot replace a newer user choice', () async {
    SharedPreferences.setMockInitialValues({'appearance-v1': _aurora.encode()});
    final theme = ThemeCubit(settingsRepository: SettingsRepository());
    final load = theme.loadAppearance();
    theme.previewAppearance(const AppearanceSettings(intensity: 0.2));
    await load;
    expect(theme.state.appearance.intensity, 0.2);
    await theme.close();
  });

  test('selecting a theme applies its recommended background', () async {
    final theme = ThemeCubit(settingsRepository: SettingsRepository());
    await theme.selectTheme(AppearanceThemeId.sunset);
    expect(theme.state.appearance.theme, AppearanceThemeId.sunset);
    expect(
      theme.state.appearance.backgroundStyle,
      AppearanceBackgroundStyle.gradient,
    );
    await theme.close();
  });

  test('reset restores the default appearance and system mode', () async {
    final settings = SettingsRepository();
    final theme = ThemeCubit(
      settingsRepository: settings,
      initialThemeMode: ThemeMode.dark,
      initialAppearance: _aurora,
    );
    await theme.resetAppearance();
    expect(theme.state.appearance, const AppearanceSettings());
    expect(theme.state.themeMode, ThemeMode.system);
    expect(await settings.getThemeMode(), 'system');
    expect(
      AppearanceSettings.decode(await settings.getAppearance()),
      const AppearanceSettings(),
    );
    await theme.close();
  });

  group('decode', () {
    test('round-trips every field', () {
      expect(AppearanceSettings.decode(_aurora.encode()), _aurora);
    });

    test('malformed payloads fall back to defaults', () {
      for (final raw in [null, '', 'not json', '[1,2]', '"text"']) {
        expect(AppearanceSettings.decode(raw), const AppearanceSettings());
      }
    });

    test('unknown names and out-of-range numbers are sanitized', () {
      final decoded = AppearanceSettings.decode(
        '{"theme":"neon","accent":"plaid","background":"video",'
        '"intensity":7,"softness":-1,"surfaceOpacity":0,"animate":"yes"}',
      );
      expect(decoded.theme, AppearanceThemeId.classic);
      expect(decoded.accent, AppearanceAccentId.theme);
      expect(decoded.backgroundStyle, AppearanceBackgroundStyle.solid);
      expect(decoded.intensity, 1);
      expect(decoded.softness, 0);
      expect(decoded.surfaceOpacity, AppearanceSettings.minSurfaceOpacity);
      expect(decoded.animate, isFalse);
    });
  });
}
