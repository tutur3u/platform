import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/task_initiative_summary.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/repositories/task_repository.dart';

part 'task_portfolio_state.dart';

class TaskPortfolioCubit extends Cubit<TaskPortfolioState> {
  TaskPortfolioCubit({required TaskRepository taskRepository})
    : _taskRepository = taskRepository,
      super(const TaskPortfolioState());

  final TaskRepository _taskRepository;
  int _loadRequestToken = 0;

  Future<void> load(String wsId) async {
    final requestToken = ++_loadRequestToken;
    emit(
      state.copyWith(
        status: TaskPortfolioStatus.loading,
        workspaceId: wsId,
        clearError: true,
      ),
    );

    try {
      final results = await Future.wait([
        _taskRepository.getTaskProjects(wsId),
        _taskRepository.getTaskInitiatives(wsId),
      ]);

      if (requestToken != _loadRequestToken) return;

      emit(
        state.copyWith(
          status: TaskPortfolioStatus.loaded,
          workspaceId: wsId,
          projects: results[0] as List<TaskProjectSummary>,
          initiatives: results[1] as List<TaskInitiativeSummary>,
          clearError: true,
        ),
      );
    } on Exception catch (error) {
      if (requestToken != _loadRequestToken) return;

      emit(
        state.copyWith(
          status: TaskPortfolioStatus.error,
          workspaceId: wsId,
          error: error.toString(),
        ),
      );
    }
  }

  Future<void> createProject({
    required String wsId,
    required String name,
    String? description,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.createTaskProject(
        wsId: wsId,
        name: name,
        description: description,
      ),
    );
  }

  Future<void> updateProject({
    required String wsId,
    required String projectId,
    required String name,
    String? status,
    String? priority,
    String? description,
    String? leadId,
    DateTime? startDate,
    DateTime? endDate,
    bool? archived,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.updateTaskProject(
        wsId: wsId,
        projectId: projectId,
        name: name,
        description: description,
        status: status,
        priority: priority,
        leadId: leadId,
        startDate: startDate,
        endDate: endDate,
        archived: archived,
      ),
    );
  }

  Future<void> deleteProject({
    required String wsId,
    required String projectId,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.deleteTaskProject(wsId: wsId, projectId: projectId),
    );
  }

  Future<void> createInitiative({
    required String wsId,
    required String name,
    required String status,
    String? description,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.createTaskInitiative(
        wsId: wsId,
        name: name,
        description: description,
        status: status,
      ),
    );
  }

  Future<void> updateInitiative({
    required String wsId,
    required String initiativeId,
    required String name,
    required String status,
    String? description,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.updateTaskInitiative(
        wsId: wsId,
        initiativeId: initiativeId,
        name: name,
        description: description,
        status: status,
      ),
    );
  }

  Future<void> deleteInitiative({
    required String wsId,
    required String initiativeId,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.deleteTaskInitiative(
        wsId: wsId,
        initiativeId: initiativeId,
      ),
    );
  }

  Future<void> linkProjectToInitiative({
    required String wsId,
    required String initiativeId,
    required String projectId,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.linkProjectToInitiative(
        wsId: wsId,
        initiativeId: initiativeId,
        projectId: projectId,
      ),
    );
  }

  Future<void> unlinkProjectFromInitiative({
    required String wsId,
    required String initiativeId,
    required String projectId,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.unlinkProjectFromInitiative(
        wsId: wsId,
        initiativeId: initiativeId,
        projectId: projectId,
      ),
    );
  }

  Future<void> _runMutation(
    String wsId,
    Future<void> Function() action,
  ) async {
    emit(state.copyWith(isMutating: true, clearError: true));
    try {
      await action();
      emit(state.copyWith(isMutating: false, clearError: true));
      await load(wsId);
    } catch (_) {
      emit(state.copyWith(isMutating: false));
      rethrow;
    }
  }
}
