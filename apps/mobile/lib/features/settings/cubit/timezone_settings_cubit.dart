import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';

class TimezoneSettingsState {
  const TimezoneSettingsState({
    this.personal = 'auto',
    this.workspace = 'auto',
    this.device = '',
    this.loading = true,
    this.saving = false,
    this.failed = false,
    this.resolved = false,
    this.retryAt,
    this.personalLoaded = false,
    this.workspaceLoaded = false,
    this.failedSaveZone,
    this.failedSaveWorkspace = false,
  });
  final String personal;
  final String workspace;
  final String device;
  final bool loading;
  final bool saving;
  final bool failed;
  final bool resolved;
  final DateTime? retryAt;
  final bool personalLoaded;
  final bool workspaceLoaded;
  final String? failedSaveZone;
  final bool failedSaveWorkspace;
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
    DateTime Function()? clock,
  }) : _clock = clock ?? DateTime.now,
       super(const TimezoneSettingsState());
  final DateTime Function() _clock;
  DateTime? _retryAt;
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
    final sameUser = userId != null && _userId == userId;
    final sameScope = _userId == userId && _workspaceId == workspaceId;
    if (_userId != userId) _retryAt = null;
    _userId = userId;
    _workspaceId = workspaceId;
    if (_retryAt?.isAfter(_clock()) ?? false) {
      emit(
        TimezoneSettingsState(
          personal: sameUser ? previous.personal : 'auto',
          workspace: sameScope ? previous.workspace : 'auto',
          device: sameScope ? previous.device : '',
          resolved: sameScope && previous.resolved,
          personalLoaded:
              sameUser && (previous.resolved || previous.personalLoaded),
          workspaceLoaded: sameScope && previous.workspaceLoaded,
          loading: false,
          failed: true,
          retryAt: _retryAt,
          failedSaveZone: sameScope ? previous.failedSaveZone : null,
          failedSaveWorkspace: sameScope && previous.failedSaveWorkspace,
        ),
      );
      return;
    }
    _retryAt = null;
    emit(
      TimezoneSettingsState(
        personal: sameUser ? previous.personal : 'auto',
        workspace: sameScope ? previous.workspace : 'auto',
        device: sameScope ? previous.device : '',
        resolved: sameScope && previous.resolved,
        personalLoaded:
            sameUser && (previous.resolved || previous.personalLoaded),
        workspaceLoaded: sameScope && previous.workspaceLoaded,
      ),
    );
    if (userId == null) {
      emit(const TimezoneSettingsState(loading: false));
      return;
    }
    String? personalRead;
    String? workspaceRead;
    ApiException? rateLimit;
    Future<String> readPreference(
      Future<String> read, {
      bool personal = false,
    }) async {
      try {
        final zone = await read;
        if (personal) {
          personalRead = zone;
        } else {
          workspaceRead = zone;
        }
        return zone;
      } on ApiException catch (error) {
        if (error.statusCode == 429 &&
            (error.retryAfter ?? 0) > (rateLimit?.retryAfter ?? 0)) {
          rateLimit = error;
        }
        rethrow;
      }
    }

    try {
      Future<List<String>> resolve() async {
        // A named preference does not depend on a working native plugin.
        // Attach error handling immediately, even if we never need the device.
        final device = Future<String>.sync(
          deviceLoader,
        ).then<String?>((zone) => zone, onError: (Object _) => null);
        final preferences = await Future.wait<String>([
          readPreference(repository.loadPersonal(), personal: true),
          if (workspaceId != null)
            readPreference(repository.loadWorkspace(workspaceId))
          else
            Future.value(workspaceRead = 'auto'),
        ]);
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
          personalLoaded: true,
          workspaceLoaded: workspaceId != null,
        ),
      );
    } on Object catch (error) {
      if (!isClosed && generation == _generation) {
        final failure = rateLimit ?? error;
        if (failure is ApiException && failure.statusCode == 429) {
          final seconds = failure.retryAfter;
          if (seconds != null && seconds > 0) {
            _retryAt = _clock().add(Duration(seconds: seconds));
          }
        }
        emit(
          sameScope && previous.resolved
              ? TimezoneSettingsState(
                  personal: previous.personal,
                  workspace: previous.workspace,
                  device: previous.device,
                  loading: false,
                  resolved: true,
                  personalLoaded: previous.personalLoaded,
                  workspaceLoaded: previous.workspaceLoaded,
                  failed: true,
                  retryAt: _retryAt,
                )
              : TimezoneSettingsState(
                  personal:
                      personalRead ??
                      (sameUser &&
                              (previous.resolved || previous.personalLoaded)
                          ? previous.personal
                          : 'auto'),
                  workspace:
                      workspaceRead ??
                      (sameScope && previous.workspaceLoaded
                          ? previous.workspace
                          : 'auto'),
                  personalLoaded:
                      personalRead != null ||
                      (sameUser &&
                          (previous.resolved || previous.personalLoaded)),
                  workspaceLoaded:
                      workspaceRead != null ||
                      (sameScope && previous.workspaceLoaded),
                  loading: false,
                  failed: true,
                  retryAt: _retryAt,
                ),
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
    if ((_retryAt?.isAfter(_clock()) ?? false) ||
        _userId == null ||
        state.loading ||
        state.saving ||
        !(workspace ? state.workspaceLoaded : state.personalLoaded) ||
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
        resolved: previous.resolved,
        personalLoaded: previous.personalLoaded,
        workspaceLoaded: previous.workspaceLoaded,
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
      final saved = await ApiClient.runForUser(
        _userId!,
        () => workspace
            ? repository.saveWorkspace(_workspaceId!, zone)
            : repository.savePersonal(zone),
      );
      if (isClosed || generation != _generation) return;
      final personal = workspace ? previous.personal : saved;
      final workspaceZone = workspace ? saved : previous.workspace;
      final personalKnown = !workspace || previous.personalLoaded;
      final workspaceKnown =
          _workspaceId == null || workspace || previous.workspaceLoaded;
      final resolved =
          personalKnown &&
          (personal != 'auto' ||
              (workspaceKnown &&
                  (workspaceZone != 'auto' || device.isNotEmpty)));
      emit(
        TimezoneSettingsState(
          personal: personal,
          workspace: workspaceZone,
          device: device,
          loading: false,
          resolved: resolved,
          failed: !resolved,
          personalLoaded: !workspace || previous.personalLoaded,
          workspaceLoaded: workspace || previous.workspaceLoaded,
        ),
      );
    } on Exception catch (error) {
      if (!isClosed && generation == _generation) {
        if (error is ApiException &&
            error.statusCode == 429 &&
            (error.retryAfter ?? 0) > 0) {
          _retryAt = _clock().add(Duration(seconds: error.retryAfter!));
        }
        emit(
          TimezoneSettingsState(
            personal: previous.personal,
            workspace: previous.workspace,
            device: previous.device,
            loading: false,
            resolved: previous.resolved,
            personalLoaded: previous.personalLoaded,
            workspaceLoaded: previous.workspaceLoaded,
            failed: true,
            failedSaveZone: zone,
            failedSaveWorkspace: workspace,
            retryAt: _retryAt,
          ),
        );
      }
    }
  }
}
