import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/task_board_summary.dart';

class TaskBoardsPage extends Equatable {
  const TaskBoardsPage({
    required this.boards,
    required this.totalCount,
    required this.page,
    required this.pageSize,
  });

  final List<TaskBoardSummary> boards;
  final int totalCount;
  final int page;
  final int pageSize;

  int get totalPages {
    if (totalCount <= 0) return 1;
    return (totalCount / pageSize).ceil();
  }

  @override
  List<Object?> get props => [boards, totalCount, page, pageSize];
}
