import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/repositories/task_repository.dart';

part 'task_labels_state.dart';

class TaskLabelsCubit extends Cubit<TaskLabelsState> {
  TaskLabelsCubit({required TaskRepository taskRepository})
    : _taskRepository = taskRepository,
      super(const TaskLabelsState());

  final TaskRepository _taskRepository;
  String? _lastLoadWsId;

  Future<void> loadLabels(String wsId) async {
    _lastLoadWsId = wsId;
    emit(state.copyWith(status: TaskLabelsStatus.loading, error: null));

    try {
      final labels = await _taskRepository.getTaskLabels(wsId);
      if (_lastLoadWsId != wsId) {
        return;
      }

      emit(
        state.copyWith(
          status: TaskLabelsStatus.loaded,
          labels: labels,
          error: null,
        ),
      );
    } on Exception catch (error) {
      if (_lastLoadWsId != wsId) {
        return;
      }
      emit(
        state.copyWith(
          status: TaskLabelsStatus.error,
          error: error.toString(),
        ),
      );
    }
  }

  Future<void> createLabel({
    required String wsId,
    required String name,
    required String color,
  }) async {
    emit(state.copyWith(status: TaskLabelsStatus.saving, error: null));
    try {
      await _taskRepository.createTaskLabel(
        wsId: wsId,
        name: name,
        color: color,
      );
      if (_lastLoadWsId != wsId) {
        return;
      }
      await loadLabels(wsId);
    } on Exception catch (error) {
      emit(
        state.copyWith(
          status: TaskLabelsStatus.error,
          error: error.toString(),
        ),
      );
      rethrow;
    }
  }

  Future<void> updateLabel({
    required String wsId,
    required String labelId,
    required String name,
    required String color,
  }) async {
    emit(state.copyWith(status: TaskLabelsStatus.saving, error: null));
    try {
      await _taskRepository.updateTaskLabel(
        wsId: wsId,
        labelId: labelId,
        name: name,
        color: color,
      );
      if (_lastLoadWsId != wsId) {
        return;
      }
      await loadLabels(wsId);
    } on Exception catch (error) {
      emit(
        state.copyWith(
          status: TaskLabelsStatus.error,
          error: error.toString(),
        ),
      );
      rethrow;
    }
  }

  Future<void> deleteLabel({
    required String wsId,
    required String labelId,
  }) async {
    emit(state.copyWith(status: TaskLabelsStatus.saving, error: null));
    try {
      await _taskRepository.deleteTaskLabel(wsId: wsId, labelId: labelId);
      if (_lastLoadWsId != wsId) {
        return;
      }
      final filtered = state.labels
          .where((label) => label.id != labelId)
          .toList(growable: false);
      emit(
        state.copyWith(
          status: TaskLabelsStatus.loaded,
          labels: filtered,
          error: null,
        ),
      );
    } on Exception catch (error) {
      emit(
        state.copyWith(
          status: TaskLabelsStatus.error,
          error: error.toString(),
        ),
      );
      rethrow;
    }
  }
}
