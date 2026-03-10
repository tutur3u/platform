import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/task_estimate_board.dart';
import 'package:mobile/data/repositories/task_repository.dart';

part 'task_estimates_state.dart';

class TaskEstimatesCubit extends Cubit<TaskEstimatesState> {
  TaskEstimatesCubit({required TaskRepository taskRepository})
    : _taskRepository = taskRepository,
      super(const TaskEstimatesState());

  final TaskRepository _taskRepository;
  String? _lastLoadWsId;

  Future<void> loadBoards(String wsId) async {
    _lastLoadWsId = wsId;
    emit(state.copyWith(status: TaskEstimatesStatus.loading, error: null));

    try {
      final boards = await _taskRepository.getTaskEstimateBoards(wsId);
      if (_lastLoadWsId != wsId) {
        return;
      }

      emit(
        state.copyWith(
          status: TaskEstimatesStatus.loaded,
          boards: boards,
          error: null,
        ),
      );
    } on Exception catch (error) {
      if (_lastLoadWsId != wsId) {
        return;
      }

      emit(
        state.copyWith(
          status: TaskEstimatesStatus.error,
          error: error.toString(),
        ),
      );
    }
  }

  Future<void> updateBoardEstimation({
    required String wsId,
    required String boardId,
    required String? estimationType,
    required bool extendedEstimation,
    required bool allowZeroEstimates,
    required bool countUnestimatedIssues,
  }) async {
    emit(state.copyWith(status: TaskEstimatesStatus.updating, error: null));

    try {
      final updatedBoard = await _taskRepository.updateBoardEstimation(
        wsId: wsId,
        boardId: boardId,
        estimationType: estimationType,
        extendedEstimation: extendedEstimation,
        allowZeroEstimates: allowZeroEstimates,
        countUnestimatedIssues: countUnestimatedIssues,
      );

      final boards = state.boards
          .map(
            (board) => board.id == boardId
                ? board.copyWith(
                    estimationType: updatedBoard.estimationType,
                    extendedEstimation: updatedBoard.extendedEstimation,
                    allowZeroEstimates: updatedBoard.allowZeroEstimates,
                    countUnestimatedIssues: updatedBoard.countUnestimatedIssues,
                  )
                : board,
          )
          .toList(growable: false);

      emit(
        state.copyWith(
          status: TaskEstimatesStatus.loaded,
          boards: boards,
          error: null,
        ),
      );
    } on Exception catch (error) {
      emit(
        state.copyWith(
          status: TaskEstimatesStatus.error,
          error: error.toString(),
        ),
      );
      rethrow;
    }
  }
}
