import 'dart:ui';

import 'package:bloc/bloc.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/settings/cubit/locale_state.dart';

/// Manages the user's locale preference.
///
/// A `null` locale means "follow system default".
class LocaleCubit extends Cubit<LocaleState> {
  LocaleCubit({required SettingsRepository settingsRepository})
    : _settings = settingsRepository,
      super(const LocaleState());

  final SettingsRepository _settings;

  /// Loads the persisted locale preference on app startup.
  Future<void> loadLocale() async {
    final code = await _settings.getLocale();
    if (code != null) {
      emit(LocaleState(locale: Locale(code)));
    }
  }

  /// Sets the locale to a specific language code and persists it.
  Future<void> setLocale(Locale locale) async {
    emit(LocaleState(locale: locale));
    await _settings.setLocale(locale.languageCode);
  }

  /// Clears the locale override to follow system default.
  Future<void> clearLocale() async {
    emit(const LocaleState());
    await _settings.setLocale(null);
  }
}
