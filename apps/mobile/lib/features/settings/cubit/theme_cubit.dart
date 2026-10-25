import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/theme/appearance/appearance_palettes.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/settings/cubit/theme_state.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';

/// Cubit for managing user theme preferences.
class ThemeCubit extends Cubit<ThemeState> {
  ThemeCubit({
    required SettingsRepository settingsRepository,
    ThemeMode initialThemeMode = ThemeMode.system,
    AppearanceSettings initialAppearance = const AppearanceSettings(),
  }) : _settingsRepository = settingsRepository,
       super(
         ThemeState(themeMode: initialThemeMode, appearance: initialAppearance),
       );

  final SettingsRepository _settingsRepository;
  int _appearanceRevision = 0;

  /// Loads the persisted theme mode.
  Future<void> loadThemeMode() async {
    try {
      final mode = await _settingsRepository.getThemeMode();
      emit(state.copyWith(themeMode: parseThemeMode(mode)));
    } on Exception catch (e) {
      debugPrint('Error loading theme mode: $e');
      emit(state.copyWith(themeMode: ThemeMode.system));
    }
  }

  /// Loads persisted appearance customisation. Installs that predate it have
  /// no stored payload and keep the default appearance with their saved mode.
  Future<void> loadAppearance() async {
    final revision = _appearanceRevision;
    try {
      final raw = await _settingsRepository.getAppearance();
      if (isClosed || revision != _appearanceRevision) return;
      emit(state.copyWith(appearance: AppearanceSettings.decode(raw)));
    } on Exception catch (e) {
      debugPrint('Error loading appearance: $e');
    }
  }

  /// Sets and persists the user's theme choice. Returns whether [mode] was
  /// persisted and applied. [isCurrent] fences the write at the repository's
  /// linearization point: a stale scope before it skips the write and
  /// returns false. Once the write is dispatched it cannot be cancelled, so
  /// the device-wide theme state follows the stored value even if the scope
  /// ended meanwhile. A failed or throwing platform write returns false and
  /// keeps the current theme, which the repository restores in storage. Only
  /// a write that is still the newest saved choice when it returns is
  /// published; any other completion returns false without emitting, so
  /// overlapping choices end on the newest saved one.
  Future<bool> setThemeMode(
    ThemeMode mode, {
    bool Function()? isCurrent,
  }) async {
    bool current() => isCurrent == null || (!isClosed && isCurrent());
    if (!current()) return false;
    final PreferenceWriteOutcome outcome;
    try {
      outcome = await _settingsRepository.setThemeMode(
        mode.name,
        shouldWrite: isCurrent == null ? null : current,
      );
    } on Exception catch (e) {
      if (!current()) return false;
      debugPrint('Error setting theme mode: $e');
      return false;
    }
    // Superseded, failed and skipped writes never publish.
    if (outcome != PreferenceWriteOutcome.saved) return false;
    if (!isClosed) emit(state.copyWith(themeMode: mode));
    return true;
  }

  /// Applies [appearance] immediately without persisting, for live slider
  /// feedback. Call [setAppearance] when the gesture ends.
  void previewAppearance(AppearanceSettings appearance) {
    if (isClosed || appearance == state.appearance) return;
    _appearanceRevision++;
    emit(state.copyWith(appearance: appearance));
  }

  /// Applies [appearance] immediately, then persists it. A newer change or
  /// closing the cubit prevents an older write from landing last.
  Future<void> setAppearance(AppearanceSettings appearance) async {
    if (isClosed) return;
    final revision = ++_appearanceRevision;
    emit(state.copyWith(appearance: appearance));
    try {
      await _settingsRepository.setAppearance(
        appearance.encode(),
        shouldWrite: () => !isClosed && revision == _appearanceRevision,
      );
    } on Exception catch (e) {
      debugPrint('Error saving appearance: $e');
    }
  }

  /// Picks a curated theme together with its recommended background style.
  Future<void> selectTheme(AppearanceThemeId theme) => setAppearance(
    state.appearance.copyWith(
      theme: theme,
      backgroundStyle: AppearancePalettes.of(theme).preferredStyle,
    ),
  );

  /// Restores the default appearance and follows the system mode.
  Future<void> resetAppearance() async {
    await setAppearance(const AppearanceSettings());
    await setThemeMode(ThemeMode.system);
  }

  static ThemeMode parseThemeMode(String mode) {
    switch (mode) {
      case 'light':
        return ThemeMode.light;
      case 'dark':
        return ThemeMode.dark;
      case 'system':
      default:
        return ThemeMode.system;
    }
  }
}
