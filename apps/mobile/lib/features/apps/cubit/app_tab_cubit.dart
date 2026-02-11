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

  Future<void> clearSelection() async {
    if (!state.hasSelection && state.selectedId == null) return;
    emit(
      state.copyWith(
        selectedId: () => null,
        shouldAutoFocus: false,
      ),
    );
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
    final route = await _settings.getLastAppRoute();
    if (route == null) return;
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
    if (state.selectedId == module.id && state.hasSelection) return;
    emit(state.copyWith(selectedId: () => module.id));
    try {
      await _settings.setLastAppRoute(module.route);
      await _settings.setLastTabRoute(Routes.apps);
    } on Exception catch (e, st) {
      log('Failed to persist app selection', error: e, stackTrace: st);
    }
  }

  void syncFromLocation(String location) {
    final module = AppRegistry.moduleFromLocation(location);
    if (module == null || module.id == state.selectedId) return;
    emit(state.copyWith(selectedId: () => module.id));
  }
}
