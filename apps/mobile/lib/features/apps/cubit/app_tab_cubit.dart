import 'dart:developer';

import 'package:bloc/bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_state.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';

class AppTabCubit extends Cubit<AppTabState> {
  AppTabCubit({required SettingsRepository settingsRepository})
    : _settings = settingsRepository,
      super(const AppTabState());

  final SettingsRepository _settings;
  int _selectionRequestVersion = 0;

  void _bumpSelectionVersion() {
    _selectionRequestVersion += 1;
  }

  Future<void> clearSelection() async {
    _bumpSelectionVersion();
    if (state.selectedId != null || state.shouldAutoFocus) {
      emit(
        state.copyWith(
          selectedId: () => null,
          shouldAutoFocus: false,
        ),
      );
    }
    try {
      await _settings.clearLastAppRoute();
      await _settings.setLastTabRoute(Routes.apps);
    } on Exception catch (e, st) {
      log('Failed to persist cleared app selection', error: e, stackTrace: st);
    }
  }

  void consumeAutoFocus() {
    emit(state.copyWith(shouldAutoFocus: false));
  }

  Future<void> loadLastApp() async {
    final requestVersion = ++_selectionRequestVersion;
    String? route;
    try {
      route = await _settings.getLastAppRoute();
    } on Exception catch (e, st) {
      log('Failed to load last app route', error: e, stackTrace: st);
      return;
    }
    if (route == null) return;
    if (isClosed || requestVersion != _selectionRequestVersion) {
      return;
    }
    final module = AppRegistry.moduleFromLocation(route);
    if (module != null) {
      emit(state.copyWith(selectedId: () => module.id));
    } else {
      try {
        await _settings.clearLastAppRoute();
      } on Exception catch (e, st) {
        log('Failed to clear last app route', error: e, stackTrace: st);
      }
    }
  }

  Future<void> openWithSearch() async {
    _bumpSelectionVersion();
    emit(
      state.copyWith(
        selectedId: () => null,
        shouldAutoFocus: true,
      ),
    );
    try {
      await _settings.clearLastAppRoute();
      await _settings.setLastTabRoute(Routes.apps);
    } on Exception catch (e, st) {
      log('Failed to persist app search state', error: e, stackTrace: st);
    }
  }

  Future<void> select(AppModule module) async {
    _bumpSelectionVersion();
    if (state.selectedId == module.id && state.hasSelection) return;
    emit(state.copyWith(selectedId: () => module.id));
    try {
      await _settings.setLastAppRoute(module.route);
      await _settings.setLastTabRoute(Routes.apps);
    } on Exception catch (e, st) {
      log('Failed to persist app selection', error: e, stackTrace: st);
    }
  }

  Future<void> setLastTabRoute(String route) async {
    try {
      await _settings.setLastTabRoute(route);
    } on Exception catch (e, st) {
      log('Failed to persist last tab route', error: e, stackTrace: st);
    }
  }

  void syncFromLocation(String location) {
    _bumpSelectionVersion();
    final module = AppRegistry.moduleFromLocation(location);
    if (module == null || module.id == state.selectedId) return;
    emit(state.copyWith(selectedId: () => module.id));
  }
}
