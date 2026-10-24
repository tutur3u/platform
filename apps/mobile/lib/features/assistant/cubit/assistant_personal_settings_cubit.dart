import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/features/assistant/data/assistant_memory_edit.dart';
import 'package:mobile/features/assistant/data/assistant_personal_settings_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

class AssistantPersonalSettingsState {
  const AssistantPersonalSettingsState({
    this.snapshot,
    this.loading = true,
    this.busy = false,
    this.failed = false,
    this.error,
  });
  final AssistantPersonalSettingsSnapshot? snapshot;
  final bool loading;
  final bool busy;
  final bool failed;
  final Object? error;
}

class AssistantPersonalSettingsCubit
    extends Cubit<AssistantPersonalSettingsState> {
  AssistantPersonalSettingsCubit({
    required this.workspaceId,
    required this.repository,
    required this.isScopeCurrent,
    String? Function()? currentUserId,
  }) : _currentUserId = currentUserId ?? currentCacheUserId,
       super(const AssistantPersonalSettingsState());
  final String workspaceId;
  final AssistantPersonalSettingsRepository repository;
  final bool Function() isScopeCurrent;
  final String? Function() _currentUserId;
  int _generation = 0;
  bool _invalidated = false;
  bool get admitted {
    if (!isScopeCurrent() || _currentUserId() != repository.ownerId) {
      _invalidated = true;
    }
    return !isClosed && !_invalidated;
  }

  bool _current(int version) => admitted && version == _generation;

  Future<void> load() async {
    if (!admitted || state.busy) return;
    final version = ++_generation;
    emit(AssistantPersonalSettingsState(snapshot: state.snapshot));
    var acceptCache = true;
    Future<void> restoreCache() async {
      try {
        final soul = await repository.readCachedSoul();
        if (!_current(version) ||
            !acceptCache ||
            soul == null ||
            state.snapshot != null) {
          return;
        }
        emit(
          AssistantPersonalSettingsState(
            snapshot: AssistantPersonalSettingsSnapshot(
              soul: soul,
              memoryEnabled: null,
              memories: const [],
            ),
            loading: state.loading,
            failed: state.failed,
            error: state.error,
          ),
        );
      } on Object {
        // An unavailable cache cannot gate fresh settings or change their
        // error.
      }
    }

    try {
      final fresh = repository.load(workspaceId);
      unawaited(restoreCache());
      final snapshot = await fresh;
      acceptCache = false;
      if (!_current(version)) return;
      emit(AssistantPersonalSettingsState(snapshot: snapshot, loading: false));
    } on Object catch (error) {
      final denied = isAssistantSettingsDenial(error);
      if (denied) acceptCache = false;
      if (_current(version)) {
        emit(
          AssistantPersonalSettingsState(
            snapshot: denied ? null : state.snapshot,
            loading: false,
            failed: true,
            error: error,
          ),
        );
      }
    }
  }

  Future<bool> _write(
    Future<AssistantPersonalSettingsSnapshot> Function(
      AssistantPersonalSettingsSnapshot,
    )
    action,
  ) async {
    if (!admitted || state.busy || state.snapshot == null) return false;
    final version = ++_generation;
    final previous = state.snapshot!;
    emit(
      AssistantPersonalSettingsState(
        snapshot: previous,
        loading: false,
        busy: true,
      ),
    );
    try {
      final snapshot = await action(previous);
      if (!_current(version)) return false;
      emit(AssistantPersonalSettingsState(snapshot: snapshot, loading: false));
      return true;
    } on Object catch (error) {
      if (_current(version)) {
        emit(
          AssistantPersonalSettingsState(
            snapshot: isAssistantSettingsDenial(error) ? null : previous,
            loading: false,
            failed: true,
            error: error,
          ),
        );
      }
      return false;
    }
  }

  Future<bool> saveSoul(AssistantSoul soul) => _write(
    (previous) async => AssistantPersonalSettingsSnapshot(
      soul: await repository.saveSoul(soul),
      memoryEnabled: previous.memoryEnabled,
      memories: state.snapshot?.memories ?? previous.memories,
      products: previous.products,
    ),
  );

  Future<bool> setMemoryEnabled({required bool enabled}) {
    if (!admitted || state.snapshot?.memoryEnabled == null) {
      return Future.value(false);
    }
    return _write(
      (previous) async => AssistantPersonalSettingsSnapshot(
        soul: previous.soul,
        memoryEnabled: await repository.setMemoryEnabled(
          workspaceId,
          enabled: enabled,
          products: previous.products,
        ),
        memories: state.snapshot?.memories ?? previous.memories,
        products: previous.products,
      ),
    );
  }

  void applyConfirmedMemoryEdit(EditableAssistantMemory memory) {
    if (!admitted || state.snapshot == null) return;
    final previous = state.snapshot!;
    // Fence stale list refreshes without discarding an admitted settings write.
    if (!state.busy) ++_generation;
    emit(
      AssistantPersonalSettingsState(
        snapshot: AssistantPersonalSettingsSnapshot(
          soul: previous.soul,
          memoryEnabled: previous.memoryEnabled,
          products: previous.products,
          memories: previous.memories
              .map(
                (item) => item.id == memory.id
                    ? AssistantMemoryItem(id: item.id, text: memory.content)
                    : item,
              )
              .toList(),
        ),
        loading: false,
        busy: state.busy,
        failed: state.failed,
        error: state.error,
      ),
    );
  }

  Future<bool> deleteMemory(String id) => _write((previous) async {
    await repository.deleteMemory(workspaceId, id);
    return AssistantPersonalSettingsSnapshot(
      soul: previous.soul,
      memoryEnabled: previous.memoryEnabled,
      memories: previous.memories.where((item) => item.id != id).toList(),
      products: previous.products,
    );
  });

  Future<Map<String, dynamic>?> exportMemories() async {
    if (!admitted || state.busy || state.snapshot?.memoryEnabled == null) {
      return null;
    }
    Map<String, dynamic>? exported;
    await _write((previous) async {
      exported = await repository.exportMemories(workspaceId);
      return previous;
    });
    return admitted && !state.failed ? exported : null;
  }
}
