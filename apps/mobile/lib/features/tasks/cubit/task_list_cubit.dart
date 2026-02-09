import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/repositories/task_repository.dart';

part 'task_list_state.dart';

/// Priority sort order mirroring the web's `priorityOrder` map.
const _priorityOrder = <String, int>{
  'critical': 4,
  'high': 3,
  'normal': 2,
  'low': 1,
};

class TaskListCubit extends Cubit<TaskListState> {
  TaskListCubit({required TaskRepository taskRepository})
    : _repo = taskRepository,
      super(const TaskListState());

  final TaskRepository _repo;

  /// Loads and groups tasks exactly like the web data loader.
  Future<void> loadTasks({
    required String userId,
    required String wsId,
    required bool isPersonal,
  }) async {
    emit(state.copyWith(status: TaskListStatus.loading, clearError: true));

    try {
      final tasks = await _repo.getUserTasks(
        userId: userId,
        wsId: wsId,
        isPersonal: isPersonal,
      );

      final now = DateTime.now();
      final todayStart = DateTime(now.year, now.month, now.day);
      final todayEnd = todayStart
          .add(const Duration(days: 1))
          .subtract(const Duration(milliseconds: 1));
      final nextWeekEnd = DateTime(
        now.year,
        now.month,
        now.day + 7,
        23,
        59,
        59,
      );

      final activeTasks = tasks
          .where(
            (t) =>
                t.list?.status != null &&
                (t.list!.status == 'not_started' || t.list!.status == 'active'),
          )
          .toList();

      // Overdue: has end_date before now
      final overdue =
          activeTasks
              .where((t) => t.endDate != null && t.endDate!.isBefore(now))
              .toList()
            ..sort((a, b) => a.endDate!.compareTo(b.endDate!));

      // Due today: end_date between todayStart and todayEnd, not overdue
      final today =
          activeTasks
              .where(
                (t) =>
                    t.endDate != null &&
                    !t.endDate!.isBefore(todayStart) &&
                    !t.endDate!.isAfter(todayEnd) &&
                    !t.endDate!.isBefore(now),
              )
              .toList()
            ..sort((a, b) => a.endDate!.compareTo(b.endDate!));

      // Upcoming (within 7 days) + no-due-date tasks
      final upcomingWithDate =
          activeTasks
              .where(
                (t) =>
                    t.endDate != null &&
                    t.endDate!.isAfter(todayEnd) &&
                    !t.endDate!.isAfter(nextWeekEnd),
              )
              .toList()
            ..sort((a, b) => a.endDate!.compareTo(b.endDate!));

      final noDueDate = activeTasks.where((t) => t.endDate == null).toList()
        ..sort((a, b) {
          final pa = _priorityOrder[a.priority ?? 'normal'] ?? 0;
          final pb = _priorityOrder[b.priority ?? 'normal'] ?? 0;
          if (pa != pb) return pb.compareTo(pa);
          // Newer tasks first when priority is equal
          return (b.createdAt ?? DateTime(0)).compareTo(
            a.createdAt ?? DateTime(0),
          );
        });

      emit(
        state.copyWith(
          status: TaskListStatus.loaded,
          overdueTasks: overdue,
          todayTasks: today,
          upcomingTasks: [...upcomingWithDate, ...noDueDate],
          clearError: true,
        ),
      );
    } on Exception catch (e) {
      emit(
        state.copyWith(status: TaskListStatus.error, error: e.toString()),
      );
    }
  }
}
