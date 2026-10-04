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
    this.errorMessage,
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
  final String? errorMessage;
  String get effective => personal != 'auto'
      ? personal
      : workspace != 'auto'
      ? workspace
      : device;
}

/// Scope changes invalidate earlier requests; duplicate loads share one result.
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
  Future<void>? _pendingLoad;
  Future<void> load({required String? userId, required String? workspaceId}) {
    if (isClosed) return Future.value();
    final sameScope = _userId == userId && _workspaceId == workspaceId;
    if (sameScope && _pendingLoad != null) return _pendingLoad!;
    // A resume refresh must not invalidate a write for the current scope.
    if (sameScope && state.saving) return Future.value();
    late final Future<void> pending;
    pending = _load(userId: userId, workspaceId: workspaceId).whenComplete(() {
      if (identical(_pendingLoad, pending)) _pendingLoad = null;
    });
    _pendingLoad = pending;
    return pending;
  }

  Future<void> _load({
    required String? userId,
    required String? workspaceId,
  }) async {
    final generation = ++_generation;
    final previous = state;
    final sameUser = userId != null && _userId == userId;
    final sameScope = _userId == userId && _workspaceId == workspaceId;
    final failedSaveZone = sameScope ? previous.failedSaveZone : null;
    final failedSaveWorkspace = sameScope && previous.failedSaveWorkspace;
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
          errorMessage: sameScope ? previous.errorMessage : null,
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
        failed: failedSaveZone != null,
        errorMessage: failedSaveZone != null ? previous.errorMessage : null,
        failedSaveZone: failedSaveZone,
        failedSaveWorkspace: failedSaveWorkspace,
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
            (rateLimit == null ||
                TimezoneSettingsRepository.rateLimitDelay(error) >
                    TimezoneSettingsRepository.rateLimitDelay(rateLimit!))) {
          rateLimit = error;
        }
        rethrow;
      }
    }

    try {
      Future<List<String>> resolve() async {
        // A named preference does not depend on a working native plugin.
        // Attach error handling immediately, even if we never need the device.
        Object? deviceFailure;
        final device = Future<String>.sync(deviceLoader).then<String?>(
          (zone) => zone,
          onError: (Object error) {
            deviceFailure = error;
            return null;
          },
        );
        final preferences = await Future.wait<String>([
          readPreference(
            repository.readPersonal(userId, timeout: loadTimeout),
            personal: true,
          ),
          if (workspaceId != null)
            readPreference(
              repository.readWorkspace(
                userId,
                workspaceId,
                timeout: loadTimeout,
              ),
            )
          else
            Future.value(workspaceRead = 'auto'),
        ]);
        if (preferences.any((zone) => zone != 'auto')) {
          return [...preferences, ''];
        }
        final zone = await device;
        if (zone == null || zone.trim().isEmpty) {
          throw Exception(
            deviceFailure?.toString() ?? 'Device timezone is unavailable.',
          );
        }
        return [...preferences, zone];
      }

      final values = await ApiClient.runForUser(
        userId,
        () => resolve().timeout(loadTimeout),
      );
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
          failed: failedSaveZone != null,
          errorMessage: failedSaveZone != null ? previous.errorMessage : null,
          failedSaveZone: failedSaveZone,
          failedSaveWorkspace: failedSaveWorkspace,
        ),
      );
    } on Object catch (error) {
      if (!isClosed && generation == _generation) {
        final failure = rateLimit ?? error;
        if (failure is ApiException && failure.statusCode == 429) {
          _retryAt = _clock().add(
            TimezoneSettingsRepository.rateLimitDelay(failure),
          );
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
                  errorMessage: _failureMessage(failure),
                  retryAt: _retryAt,
                  failedSaveZone: failedSaveZone,
                  failedSaveWorkspace: failedSaveWorkspace,
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
                  errorMessage: _failureMessage(failure),
                  retryAt: _retryAt,
                  failedSaveZone: failedSaveZone,
                  failedSaveWorkspace: failedSaveWorkspace,
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
      Object? deviceError;
      final needsDevice =
          zone == 'auto' &&
          (workspace ? previous.personal : previous.workspace) == 'auto';
      if (needsDevice && device.isEmpty) {
        try {
          device = (await deviceLoader().timeout(loadTimeout)).trim();
          if (device.isEmpty) {
            throw Exception('Device timezone is unavailable.');
          }
        } on Object catch (error) {
          deviceError = error;
          device = '';
        }
        if (isClosed || generation != _generation) return;
      }
      final saved = await ApiClient.runForUser(
        _userId!,
        () => workspace
            ? repository.writeWorkspace(_userId!, _workspaceId!, zone)
            : repository.writePersonal(_userId!, zone),
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
          errorMessage: !resolved
              ? !personalKnown || !workspaceKnown
                    ? previous.errorMessage ??
                          'Timezone preferences are unavailable.'
                    : deviceError == null
                    ? 'Device timezone is unavailable.'
                    : _failureMessage(deviceError)
              : null,
          personalLoaded: !workspace || previous.personalLoaded,
          workspaceLoaded: workspace || previous.workspaceLoaded,
        ),
      );
    } on Exception catch (error) {
      if (!isClosed && generation == _generation) {
        if (error is ApiException && error.statusCode == 429) {
          _retryAt = _clock().add(
            TimezoneSettingsRepository.rateLimitDelay(error),
          );
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
            errorMessage: _failureMessage(error),
            failedSaveZone: zone,
            failedSaveWorkspace: workspace,
            retryAt: _retryAt,
          ),
        );
      }
    }
  }
}

String _failureMessage(Object error) => error is ApiException
    ? '${error.statusCode}: ${error.message}'
    : error.toString();
