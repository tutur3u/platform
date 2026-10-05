import 'dart:io';

import 'package:bloc/bloc.dart';
import 'package:mobile/features/assistant/local/assistant_local_capability.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_local_model_store.dart';
import 'package:mobile/features/assistant/local/assistant_local_preferences.dart';

enum LocalModelsOperation {
  idle,
  loading,
  downloading,
  importing,
  removing,
  selecting,
}

class AssistantLocalModelsState {
  const AssistantLocalModelsState({
    this.supported = false,
    this.loaded = false,
    this.installed = const {},
    this.selected,
    this.operation = LocalModelsOperation.idle,
    this.modelId,
    this.received = 0,
    this.total = 0,
    this.error,
  });
  final bool supported;
  final bool loaded;
  final Set<String> installed;
  final String? selected;
  final LocalModelsOperation operation;
  final String? modelId;
  final int received;
  final int total;
  final LocalModelFailure? error;
  bool get busy => operation != LocalModelsOperation.idle;
}

/// Settings only manage files/preferences. They never claim engine readiness.
class AssistantLocalModelsCubit extends Cubit<AssistantLocalModelsState> {
  AssistantLocalModelsCubit({
    required this.workspaceId,
    required bool Function() isScopeCurrent,
    AssistantLocalModelStore? store,
    AssistantLocalPreferences? preferences,
    Future<bool> Function()? supported,
  }) : _isScopeCurrent = isScopeCurrent,
       _store = store ?? AssistantLocalModelStore(),
       _preferences = preferences ?? AssistantLocalPreferences(),
       _supported = supported ?? supportsAssistantLocalInference,
       super(const AssistantLocalModelsState());

  final String workspaceId;
  final bool Function() _isScopeCurrent;
  final AssistantLocalModelStore _store;
  final AssistantLocalPreferences _preferences;
  final Future<bool> Function() _supported;
  bool get _current => !isClosed && _isScopeCurrent();

  Future<void> load() async {
    if (!_current || state.busy) return;
    await _operate(LocalModelsOperation.loading, null, () async {
      final supported = await _supported();
      final selected = await _preferences.load(
        workspaceId,
        isScopeCurrent: () => _current,
      );
      final installed = <String>{};
      for (final model in assistantLocalModels) {
        if (!_current) return;
        if (await _store.verifiedFile(model) != null) installed.add(model.id);
      }
      if (_current) {
        emit(
          AssistantLocalModelsState(
            supported: supported,
            loaded: true,
            operation: LocalModelsOperation.loading,
            installed: installed,
            selected: selected,
          ),
        );
      }
    });
  }

  Future<void> download(AssistantLocalModel model) =>
      _operate(LocalModelsOperation.downloading, model.id, () async {
        final clock = Stopwatch()..start();
        var publishedAt = 0;
        if (!state.supported) {
          throw const LocalModelException(LocalModelFailure.unavailable);
        }
        await _store.download(
          model,
          isScopeCurrent: () => _current,
          onProgress: (received, total) {
            if (!_current ||
                (received != total &&
                    clock.elapsedMilliseconds - publishedAt < 100)) {
              return;
            }
            publishedAt = clock.elapsedMilliseconds;
            emit(
              _state(
                operation: LocalModelsOperation.downloading,
                modelId: model.id,
                received: received,
                total: total,
              ),
            );
          },
        );
        if (_current) emit(_state(installed: {...state.installed, model.id}));
      });

  Future<void> import(AssistantLocalModel model, File source) =>
      _operate(LocalModelsOperation.importing, model.id, () async {
        if (!state.supported) {
          throw const LocalModelException(LocalModelFailure.unavailable);
        }
        await _store.importFile(
          model,
          source,
          isScopeCurrent: () => _current,
          onProgress: (_, _) {},
        );
        if (_current) emit(_state(installed: {...state.installed, model.id}));
      });

  Future<void> remove(AssistantLocalModel model) =>
      _operate(LocalModelsOperation.removing, model.id, () async {
        await _store.remove(model);
        if (!_current) return;
        // Removing weights leaves a selected local mode blocked. Switching to
        // remote is a separate explicit choice and never migrates a draft.
        if (_current) {
          emit(_state(installed: state.installed.difference({model.id})));
        }
      });

  Future<void> select(String? modelId) =>
      _operate(LocalModelsOperation.selecting, modelId, () async {
        if (modelId != null) {
          final model = assistantLocalModels.firstWhere(
            (row) => row.id == modelId,
          );
          if (!state.supported || await _store.verifiedFile(model) == null) {
            throw const LocalModelException(LocalModelFailure.unavailable);
          }
        }
        await _preferences.save(
          workspaceId,
          modelId,
          isScopeCurrent: () => _current,
        );
        if (_current) emit(_state(selected: modelId, replaceSelection: true));
      });

  void cancel() => _store.cancel();

  Future<void> _operate(
    LocalModelsOperation operation,
    String? modelId,
    Future<void> Function() action,
  ) async {
    if (!_current || state.busy) return;
    emit(_state(operation: operation, modelId: modelId));
    LocalModelFailure? error;
    try {
      await action();
    } on LocalModelException catch (failure) {
      error = failure.reason == LocalModelFailure.cancelled
          ? null
          : failure.reason;
    } on Object {
      error = LocalModelFailure.unavailable;
    } finally {
      if (_current) {
        emit(_state(operation: LocalModelsOperation.idle, error: error));
      }
    }
  }

  AssistantLocalModelsState _state({
    LocalModelsOperation? operation,
    String? modelId,
    Set<String>? installed,
    String? selected,
    bool replaceSelection = false,
    int received = 0,
    int total = 0,
    LocalModelFailure? error,
  }) => AssistantLocalModelsState(
    supported: state.supported,
    loaded: state.loaded,
    installed: installed ?? state.installed,
    selected: replaceSelection ? selected : state.selected,
    operation: operation ?? state.operation,
    modelId: operation == LocalModelsOperation.idle
        ? null
        : modelId ?? state.modelId,
    received: received,
    total: total,
    error: error,
  );

  @override
  Future<void> close() {
    _store.cancel();
    return super.close();
  }
}
