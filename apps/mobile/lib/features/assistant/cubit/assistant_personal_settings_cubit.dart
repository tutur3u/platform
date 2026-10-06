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
  });
  final AssistantPersonalSettingsSnapshot? snapshot;
  final bool loading;
  final bool busy;
  final bool failed;
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
    try {
      final snapshot = await repository.load(workspaceId);
      if (!_current(version)) return;
      emit(AssistantPersonalSettingsState(snapshot: snapshot, loading: false));
    } on Object {
      if (_current(version)) {
        emit(
          AssistantPersonalSettingsState(
            snapshot: state.snapshot,
            loading: false,
            failed: true,
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
    } on Object {
      if (_current(version)) {
        emit(
          AssistantPersonalSettingsState(
            snapshot: previous,
            loading: false,
            failed: true,
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

  Future<bool> setMemoryEnabled({required bool enabled}) => _write(
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
