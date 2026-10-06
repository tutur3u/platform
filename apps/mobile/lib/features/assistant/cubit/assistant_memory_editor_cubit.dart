import 'package:bloc/bloc.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/assistant/data/assistant_memory_edit.dart';
import 'package:mobile/features/assistant/data/assistant_personal_settings_repository.dart';

enum MemoryEditFailure { denied, missing, failed, conflict }

class AssistantMemoryEditorState {
  const AssistantMemoryEditorState({
    this.memory,
    this.draft = '',
    this.loading = true,
    this.saving = false,
    this.failure,
    this.latestContent,
    this.auditWarning = false,
    this.saved = false,
    this.reviewRequired = false,
  });
  final EditableAssistantMemory? memory;
  final String draft;
  final bool loading;
  final bool saving;
  final MemoryEditFailure? failure;
  final String? latestContent;
  final bool auditWarning;
  final bool saved;
  final bool reviewRequired;
  bool get canSave =>
      memory != null &&
      !loading &&
      !saving &&
      !reviewRequired &&
      failure != MemoryEditFailure.denied &&
      failure != MemoryEditFailure.missing &&
      draft.trim().isNotEmpty &&
      draft.length <= 20000 &&
      draft.trim() != memory!.content;
}

/// A modal-local lease, with no cache, offline replay or optimistic writes.
class AssistantMemoryEditorCubit extends Cubit<AssistantMemoryEditorState> {
  AssistantMemoryEditorCubit({
    required this.repository,
    required this.workspaceId,
    required this.memoryId,
    required this.isScopeCurrent,
    required this.onConfirmed,
  }) : super(const AssistantMemoryEditorState());
  final AssistantPersonalSettingsRepository repository;
  final String workspaceId;
  final String memoryId;
  final bool Function() isScopeCurrent;
  final void Function(EditableAssistantMemory) onConfirmed;
  int _generation = 0;
  bool _invalidated = false;
  bool get admitted {
    if (!isScopeCurrent()) _invalidated = true;
    return !isClosed && !_invalidated;
  }

  bool _current(int version) => admitted && version == _generation;
  MemoryEditFailure _failure(Object error) => switch (error) {
    ApiException(statusCode: 401 || 403) => MemoryEditFailure.denied,
    ApiException(statusCode: 404) => MemoryEditFailure.missing,
    ApiException(statusCode: 409) => MemoryEditFailure.conflict,
    _ => MemoryEditFailure.failed,
  };
  Future<void> load({bool reviewLatest = false}) async {
    if (!admitted || state.saving || state.loading && state.memory != null) {
      return;
    }
    final version = ++_generation;
    final previous = state;
    emit(
      AssistantMemoryEditorState(
        memory: previous.memory,
        draft: previous.draft,
        latestContent: previous.latestContent,
        failure: previous.failure,
        reviewRequired: previous.reviewRequired,
      ),
    );
    try {
      final memory = await repository.readMemoryForEdit(workspaceId, memoryId);
      if (!_current(version)) return;
      emit(
        AssistantMemoryEditorState(
          memory: memory,
          draft: reviewLatest || previous.memory != null
              ? state.draft
              : memory.content,
          loading: false,
          latestContent: reviewLatest ? memory.content : previous.latestContent,
        ),
      );
    } on Object catch (error) {
      if (!_current(version)) return;
      emit(
        AssistantMemoryEditorState(
          memory: previous.memory,
          draft: state.draft,
          loading: false,
          failure: _failure(error),
          reviewRequired:
              previous.reviewRequired ||
              _failure(error) == MemoryEditFailure.conflict,
          latestContent: previous.latestContent,
        ),
      );
    }
  }

  void changeDraft(String value) {
    if (!admitted) return;
    emit(
      AssistantMemoryEditorState(
        memory: state.memory,
        draft: value,
        loading: state.loading,
        saving: state.saving,
        failure: state.failure,
        latestContent: state.latestContent,
        auditWarning: state.auditWarning,
        reviewRequired: state.reviewRequired,
      ),
    );
  }

  Future<void> save() async {
    if (!admitted || !state.canSave) return;
    final version = ++_generation;
    final previous = state;
    final submitted = previous.draft;
    emit(
      AssistantMemoryEditorState(
        memory: previous.memory,
        draft: submitted,
        loading: false,
        saving: true,
        latestContent: previous.latestContent,
      ),
    );
    try {
      final receipt = await repository.editMemory(
        workspaceId,
        memoryId,
        value: submitted,
        revision: previous.memory!.revision,
      );
      if (!_current(version)) return;
      onConfirmed(receipt.memory);
      // A later edit made while the write was pending remains visible/dirty.
      final unchanged = state.draft == submitted;
      emit(
        AssistantMemoryEditorState(
          memory: receipt.memory,
          draft: unchanged ? receipt.memory.content : state.draft,
          loading: false,
          auditWarning: !receipt.auditRecorded,
          saved: unchanged,
        ),
      );
    } on Object catch (error) {
      if (!_current(version)) return;
      emit(
        AssistantMemoryEditorState(
          memory: previous.memory,
          draft: state.draft,
          loading: false,
          failure: _failure(error),
          reviewRequired:
              previous.reviewRequired ||
              _failure(error) == MemoryEditFailure.conflict,
          latestContent: previous.latestContent,
        ),
      );
    }
  }

  @override
  Future<void> close() {
    _invalidated = true;
    ++_generation;
    return super.close();
  }
}
