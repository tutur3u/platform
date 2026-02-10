import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/settings/cubit/theme_state.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';

/// Cubit for managing user theme preferences.
class ThemeCubit extends Cubit<ThemeState> {
  ThemeCubit({required SettingsRepository settingsRepository})
    : _settingsRepository = settingsRepository,
      super(const ThemeState());

  final SettingsRepository _settingsRepository;

  /// Loads the persisted theme mode.
  Future<void> loadThemeMode() async {
    try {
      final mode = await _settingsRepository.getThemeMode();
      emit(state.copyWith(themeMode: _parseThemeMode(mode)));
    } on Exception catch (e) {
      debugPrint('Error loading theme mode: $e');
      emit(state.copyWith(themeMode: ThemeMode.system));
    }
  }

  /// Sets and persists the user's theme choice.
  Future<void> setThemeMode(ThemeMode mode) async {
    try {
      await _settingsRepository.setThemeMode(mode.name);
      emit(state.copyWith(themeMode: mode));
    } on Exception catch (e) {
      debugPrint('Error setting theme mode: $e');
      emit(state.copyWith(themeMode: ThemeMode.system));
    }
  }

  ThemeMode _parseThemeMode(String mode) {
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
