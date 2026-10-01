import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';

class TimezoneSettingsState {
  const TimezoneSettingsState({
    this.personal = 'auto',
    this.workspace = 'auto',
    this.device = 'UTC',
    this.loading = true,
    this.saving = false,
    this.failed = false,
    this.resolved = false,
  });
  final String personal;
  final String workspace;
  final String device;
  final bool loading;
  final bool saving;
  final bool failed;
  final bool resolved;
  String get effective => personal != 'auto'
      ? personal
      : workspace != 'auto'
      ? workspace
      : device;
}

/// Each load invalidates earlier requests and clears the previous scope.
class TimezoneSettingsCubit extends Cubit<TimezoneSettingsState> {
  TimezoneSettingsCubit({
    required this.repository,
    required this.deviceLoader,
    this.loadTimeout = const Duration(seconds: 15),
  }) : super(const TimezoneSettingsState());
  final Duration loadTimeout;
  final TimezoneSettingsRepository repository;
  final Future<String> Function() deviceLoader;
  int _generation = 0;
  String? _userId;
  String? _workspaceId;
  Future<void> load({
    required String? userId,
    required String? workspaceId,
  }) async {
    final generation = ++_generation;
    final previous = state;
    final sameScope = _userId == userId && _workspaceId == workspaceId;
    _userId = userId;
    _workspaceId = workspaceId;
    emit(
      sameScope && previous.resolved
          ? TimezoneSettingsState(
              personal: previous.personal,
              workspace: previous.workspace,
              device: previous.device,
              resolved: true,
            )
          : const TimezoneSettingsState(),
    );
    if (userId == null) {
      emit(const TimezoneSettingsState(loading: false));
      return;
    }
    try {
      Future<List<String>> resolve() async {
        // A named preference does not depend on a working native plugin.
        // Attach error handling immediately, even if we never need the device.
        final device = Future<String>.sync(
          deviceLoader,
        ).then<String?>((zone) => zone, onError: (Object _) => null);
        final preferences = await Future.wait<String>([
          repository.loadPersonal(),
          if (workspaceId != null)
            repository.loadWorkspace(workspaceId)
          else
            Future.value('auto'),
        ], eagerError: true);
        if (preferences.any((zone) => zone != 'auto')) {
          return [...preferences, ''];
        }
        final zone = await device;
        if (zone == null || zone.trim().isEmpty) {
          throw Exception('Device timezone is unavailable.');
        }
        return [...preferences, zone];
      }

      final values = await resolve().timeout(loadTimeout);
      if (isClosed || generation != _generation) return;
      emit(
        TimezoneSettingsState(
          personal: values[0],
          workspace: values[1],
          device: values[2],
          loading: false,
          resolved: true,
        ),
      );
    } on Object {
      if (!isClosed && generation == _generation) {
        emit(
          sameScope && previous.resolved
              ? TimezoneSettingsState(
                  personal: previous.personal,
                  workspace: previous.workspace,
                  device: previous.device,
                  loading: false,
                  resolved: true,
                  failed: true,
                )
              : const TimezoneSettingsState(loading: false, failed: true),
        );
      }
    }
  }

  /// Retry the provider's current scope, never a stale tile's raw properties.
  Future<void> reload() => load(userId: _userId, workspaceId: _workspaceId);

  Future<void> save(
    String zone, {
    bool workspace = false,
    bool canManageWorkspace = false,
  }) async {
    if (_userId == null ||
        state.loading ||
        state.saving ||
        !state.resolved ||
        (workspace && (!canManageWorkspace || _workspaceId == null))) {
      return;
    }
    final generation = _generation;
    final previous = state;
    emit(
      TimezoneSettingsState(
        personal: previous.personal,
        workspace: previous.workspace,
        device: previous.device,
        loading: false,
        resolved: true,
        saving: true,
      ),
    );
    try {
      var device = previous.device;
      final needsDevice =
          zone == 'auto' &&
          (workspace ? previous.personal : previous.workspace) == 'auto';
      if (needsDevice && device.isEmpty) {
        device = await deviceLoader().timeout(loadTimeout);
        if (device.trim().isEmpty) {
          throw Exception('Device timezone is unavailable.');
        }
        if (isClosed || generation != _generation) return;
      }
      final saved = workspace
          ? await repository.saveWorkspace(_workspaceId!, zone)
          : await repository.savePersonal(zone);
      if (isClosed || generation != _generation) return;
      emit(
        TimezoneSettingsState(
          personal: workspace ? previous.personal : saved,
          workspace: workspace ? saved : previous.workspace,
          device: device,
          loading: false,
          resolved: true,
        ),
      );
    } on Exception {
      if (!isClosed && generation == _generation) {
        emit(
          TimezoneSettingsState(
            personal: previous.personal,
            workspace: previous.workspace,
            device: previous.device,
            loading: false,
            resolved: true,
            failed: true,
          ),
        );
      }
    }
  }
}
