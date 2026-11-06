import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/features/audience_mode/audience_mode.dart';
import 'package:mobile/features/audience_mode/audience_mode_repository.dart';
import 'package:mobile/features/audience_mode/audience_mode_store.dart';

enum AudienceModeStatus { unbound, loading, ready }

class AudienceModeState extends Equatable {
  const AudienceModeState({
    this.userId,
    this.wsId,
    this.status = AudienceModeStatus.unbound,
    this.layers = const AudienceModeLayers(),
  });

  final String? userId;
  final String? wsId;
  final AudienceModeStatus status;
  final AudienceModeLayers layers;

  AudienceMode get mode => layers.resolved.mode;
  AudienceModeSource get source => layers.resolved.source;

  AudienceModeState copyWith({
    AudienceModeStatus? status,
    AudienceModeLayers? layers,
  }) => AudienceModeState(
    userId: userId,
    wsId: wsId,
    status: status ?? this.status,
    layers: layers ?? this.layers,
  );

  @override
  List<Object?> get props => [userId, wsId, status, layers];
}

/// Resolves the presentation mode for the signed-in account in the current
/// workspace. Cached layers render first; server layers revalidate them.
class AudienceModeCubit extends Cubit<AudienceModeState> {
  AudienceModeCubit({
    required AudienceModeRepository repository,
    AudienceModeSnapshotStore? store,
  }) : _repository = repository,
       _store = store ?? CacheAudienceModeSnapshotStore(),
       super(const AudienceModeState());

  final AudienceModeRepository _repository;
  final AudienceModeSnapshotStore _store;

  /// Advances on every scope change; late results for an old scope drop.
  int _generation = 0;

  /// Advances on every local write, per layer, so an in-flight refresh
  /// never replaces a newer local choice.
  final Map<AudienceModeSource, int> _writes = {};

  Future<void> bind({required String? userId, required String? wsId}) async {
    if (userId == null || userId.isEmpty || wsId == null || wsId.isEmpty) {
      _generation++;
      if (state.status != AudienceModeStatus.unbound) {
        emit(const AudienceModeState());
      }
      return;
    }
    if (userId != state.userId || wsId != state.wsId) {
      final generation = ++_generation;
      final peeked = _safePeek(userId, wsId);
      emit(
        AudienceModeState(
          userId: userId,
          wsId: wsId,
          status: peeked == null
              ? AudienceModeStatus.loading
              : AudienceModeStatus.ready,
          layers: peeked ?? const AudienceModeLayers(),
        ),
      );
      if (peeked == null) {
        final stored = await _safeRead(userId, wsId);
        if (isClosed || generation != _generation) return;
        if (stored != null && state.status == AudienceModeStatus.loading) {
          emit(
            state.copyWith(status: AudienceModeStatus.ready, layers: stored),
          );
        }
      }
    }
    await refresh();
  }

  /// Revalidates every layer. A failed layer keeps its last known value.
  Future<void> refresh() async {
    final userId = state.userId;
    final wsId = state.wsId;
    if (userId == null || wsId == null) return;
    final generation = _generation;
    final writes = Map.of(_writes);
    final results = await Future.wait([
      _attempt(() => _repository.loadOverride(wsId)),
      _attempt(() => _repository.loadWorkspaceDefault(wsId)),
      _attempt(_repository.loadAccount),
    ]);
    final pending = await _attemptPending(wsId);
    if (isClosed || generation != _generation) return;

    AudienceMode? pick(
      AudienceModeSource layer,
      ({bool ok, AudienceMode? value}) result,
      AudienceMode? current, [
      String? pendingPath,
    ]) {
      if (_writes[layer] != writes[layer]) return current;
      if (pendingPath != null && pending.containsKey(pendingPath)) {
        return pending[pendingPath];
      }
      return result.ok ? result.value : current;
    }

    final current = state.layers;
    final next = AudienceModeLayers(
      personal: pick(
        AudienceModeSource.override,
        results[0],
        current.personal,
        AudienceModeRepository.overridePath(wsId),
      ),
      workspaceDefault: pick(
        AudienceModeSource.workspaceDefault,
        results[1],
        current.workspaceDefault,
      ),
      account: pick(
        AudienceModeSource.account,
        results[2],
        current.account,
        AudienceModeRepository.accountPath,
      ),
    );
    emit(state.copyWith(status: AudienceModeStatus.ready, layers: next));
    if (results.any((result) => result.ok)) {
      await _safeWrite(userId, wsId, next);
    }
  }

  /// Sets or clears (null) this account's mode for the current workspace.
  Future<void> setOverride(AudienceMode? mode) => _write(
    AudienceModeSource.override,
    (layers) => layers.withPersonal(mode),
    (wsId) => _repository.saveOverride(wsId, mode),
  );

  /// Sets or clears the workspace default. Requires
  /// `manage_workspace_settings`; the server enforces it.
  Future<void> setWorkspaceDefault(AudienceMode? mode) => _write(
    AudienceModeSource.workspaceDefault,
    (layers) => layers.withWorkspaceDefault(mode),
    (wsId) => _repository.saveWorkspaceDefault(wsId, mode),
  );

  /// Sets the account-wide preference chosen in onboarding.
  Future<void> setAccountMode(AudienceMode? mode) async {
    if (state.userId == null) {
      await _repository.saveAccount(null, mode);
      return;
    }
    await _write(
      AudienceModeSource.account,
      (layers) => layers.withAccount(mode),
      (wsId) => _repository.saveAccount(wsId, mode),
    );
  }

  Future<void> _write(
    AudienceModeSource layer,
    AudienceModeLayers Function(AudienceModeLayers) apply,
    Future<void> Function(String wsId) save,
  ) async {
    final userId = state.userId;
    final wsId = state.wsId;
    if (userId == null || wsId == null) {
      throw StateError('The mode needs a signed-in workspace.');
    }
    final generation = _generation;
    final version = (_writes[layer] ?? 0) + 1;
    _writes[layer] = version;
    final previous = state.layers;
    final next = apply(previous);
    emit(state.copyWith(status: AudienceModeStatus.ready, layers: next));
    try {
      await save(wsId);
    } on Object {
      if (!isClosed && generation == _generation && _writes[layer] == version) {
        emit(state.copyWith(layers: _restore(layer, state.layers, previous)));
      }
      rethrow;
    }
    if (!isClosed && generation == _generation) {
      await _safeWrite(userId, wsId, state.layers);
    }
  }

  static AudienceModeLayers _restore(
    AudienceModeSource layer,
    AudienceModeLayers current,
    AudienceModeLayers previous,
  ) => switch (layer) {
    AudienceModeSource.override => current.withPersonal(previous.personal),
    AudienceModeSource.workspaceDefault => current.withWorkspaceDefault(
      previous.workspaceDefault,
    ),
    AudienceModeSource.account => current.withAccount(previous.account),
    AudienceModeSource.fallback => current,
  };

  static Future<({bool ok, AudienceMode? value})> _attempt(
    Future<AudienceMode?> Function() load,
  ) async {
    try {
      return (ok: true, value: await load());
    } on Object {
      return (ok: false, value: null);
    }
  }

  Future<Map<String, AudienceMode?>> _attemptPending(String wsId) async {
    try {
      return await _repository.pendingWrites(wsId);
    } on Object {
      return const {};
    }
  }

  AudienceModeLayers? _safePeek(String userId, String wsId) {
    try {
      return _store.peek(userId, wsId);
    } on Object {
      return null;
    }
  }

  Future<AudienceModeLayers?> _safeRead(String userId, String wsId) async {
    try {
      return await _store.read(userId, wsId);
    } on Object {
      return null;
    }
  }

  Future<void> _safeWrite(
    String userId,
    String wsId,
    AudienceModeLayers layers,
  ) async {
    try {
      await _store.write(userId, wsId, layers);
    } on Object {
      // A cache failure never discards the resolved mode.
    }
  }
}
