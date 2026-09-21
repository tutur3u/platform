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

  static String _rootOrigin(String? route) =>
      const {
        Routes.home,
        Routes.apps,
        Routes.assistant,
        Routes.notifications,
        Routes.profileRoot,
      }.contains(route)
      ? route!
      : Routes.home;

  Future<void> recordAppOrigin(String route) async {
    final origin = _rootOrigin(route);
    emit(state.copyWith(appOrigin: origin));
    try {
      await _settings.setLastAppOrigin(origin);
    } on Exception catch (error, stack) {
      log('Failed to persist app origin', error: error, stackTrace: stack);
    }
  }

  Future<void> clearSelection() async {
    _bumpSelectionVersion();
    if (state.selectedId != null || state.shouldAutoFocus) {
      emit(state.copyWith(selectedId: () => null, shouldAutoFocus: false));
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

  Future<void> setShowAppsTab({required bool value}) async {
    await _settings.setShowAppsTab(value: value);
    if (!isClosed) emit(state.copyWith(showAppsTab: value));
  }

  Future<void> setAppOrder(List<String> ids) async {
    await _settings.setAppOrder(ids);
    if (!isClosed) emit(state.copyWith(appOrder: List.unmodifiable(ids)));
  }

  Future<void> togglePinnedApp(String id) async {
    final ids = [...state.pinnedApps];
    if (!ids.remove(id)) ids.add(id);
    await _settings.setPinnedApps(ids);
    if (!isClosed) emit(state.copyWith(pinnedApps: List.unmodifiable(ids)));
  }

  Future<void> loadLastApp() async {
    final requestVersion = ++_selectionRequestVersion;
    try {
      final visible = await _settings.getShowAppsTab();
      if (!isClosed) emit(state.copyWith(showAppsTab: visible));
    } on Object {
      // Keep the compact default if preference storage is unavailable.
    }
    try {
      final origin = await _settings.getLastAppOrigin();
      if (!isClosed && requestVersion == _selectionRequestVersion) {
        emit(state.copyWith(appOrigin: _rootOrigin(origin)));
      }
      final order = await _settings.getAppOrder();
      final pins = await _settings.getPinnedApps();
      if (!isClosed) emit(state.copyWith(appOrder: order, pinnedApps: pins));
    } on Object {
      // Preferences are optional; keep the default app order on read failure.
    }
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
    emit(state.copyWith(selectedId: () => null, shouldAutoFocus: true));
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
