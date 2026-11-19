import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_summary.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_boards_page.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/task_relationships.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/models/user_tasks_page.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/tasks_boards/utils/task_due_dates.dart';

const demoActor = TaskBoardTaskAssignee(
  id: 'demo-actor',
  displayName: 'Alex Doe',
);
const demoSam = TaskBoardTaskAssignee(id: 'demo-sam', displayName: 'Sam Lee');
const demoCasey = TaskBoardTaskAssignee(
  id: 'demo-casey',
  displayName: 'Casey Tran',
);
const demoLabel = TaskBoardTaskLabel(
  id: 'demo-review',
  name: 'Review',
  color: 'ORANGE',
);
const demoDesign = TaskBoardTaskLabel(
  id: 'demo-design',
  name: 'Design',
  color: 'BLUE',
);
const demoBoard = TaskBoardInfo(
  id: 'demo-board',
  name: 'Studio launch',
  wsId: 'demo-workspace',
);
const demoOtherBoard = TaskBoardInfo(
  id: 'demo-other-board',
  name: 'Studio operations',
  wsId: 'demo-workspace',
);
const demoQueue = TaskBoardList(
  id: 'demo-queue',
  boardId: 'demo-board',
  name: 'To do',
  status: 'not_started',
  color: 'BLUE',
);
const demoActive = TaskBoardList(
  id: 'demo-active',
  boardId: 'demo-board',
  name: 'In progress',
  status: 'active',
  color: 'ORANGE',
);
const demoDone = TaskBoardList(
  id: 'demo-done',
  boardId: 'demo-board',
  name: 'Done',
  status: 'done',
  color: 'GREEN',
);
const demoOtherList = TaskBoardList(
  id: 'demo-other-list',
  boardId: 'demo-other-board',
  name: 'Ideas',
  status: 'active',
);

class TaskExperienceRepository extends TaskRepository {
  TaskExperienceRepository({
    required this.now,
    this.showCrossWorkspaceTask = false,
  }) {
    final today = taskDay(now, null);
    DateTime due(int offset) => taskEndOfDayIn(
      DateTime(today.year, today.month, today.day + offset),
      null,
    );
    _tasks = {
      'demo-overdue': TaskBoardTask(
        id: 'demo-overdue',
        listId: demoQueue.id,
        sortKey: 1000000,
        name: 'Review launch checklist',
        priority: 'critical',
        endDate: due(-1),
        assignees: const [demoActor, demoSam, demoCasey],
        labels: const [demoLabel],
        description:
            'Confirm launch readiness and send the checklist to the studio.',
      ),
      'demo-today': TaskBoardTask(
        id: 'demo-today',
        listId: demoQueue.id,
        sortKey: 2000000,
        name: 'Prepare the release notes',
        priority: 'high',
        endDate: due(0),
        assignees: const [demoActor, demoSam],
        labels: const [demoLabel, demoDesign],
      ),
      'demo-upcoming': TaskBoardTask(
        id: 'demo-upcoming',
        listId: demoQueue.id,
        sortKey: 3000000,
        name: 'Sketch onboarding ideas',
        priority: 'normal',
        endDate: due(2),
        assignees: const [demoActor],
        labels: const [demoDesign],
      ),
      'demo-undated': TaskBoardTask(
        id: 'demo-undated',
        listId: demoActive.id,
        sortKey: 1000000,
        name: 'Collect feedback topics',
        priority: 'low',
        assignees: const [demoActor, demoCasey],
      ),
      'demo-spare': TaskBoardTask(
        id: 'demo-spare',
        listId: demoOtherList.id,
        sortKey: 1000000,
        name: 'Organize studio supplies',
        assignees: const [demoActor],
      ),
    };
  }

  final DateTime now;
  final bool showCrossWorkspaceTask;
  late Map<String, TaskBoardTask> _tasks;
  final moves = <(String, String)>[];
  final placements = <(String, Map<String, dynamic>)>[];
  final creates = <TaskBoardTask>[];
  final openedBoards = <String>[];
  Future<void>? delayMine;

  static const List<TaskBoardList> _lists = [
    demoQueue,
    demoActive,
    demoDone,
    demoOtherList,
  ];
  static const List<TaskBoardInfo> _boards = [demoBoard, demoOtherBoard];

  @override
  Future<UserTasksPage> getMyTasks({
    required String wsId,
    required bool isPersonal,
    int completedPage = 0,
    int completedLimit = 20,
  }) async {
    await delayMine;
    final active = <UserTask>[];
    final completed = <UserTask>[];
    for (final task in _tasks.values) {
      final list = _lists.firstWhere((item) => item.id == task.listId);
      final original = _boards.firstWhere((item) => item.id == list.boardId);
      final board = showCrossWorkspaceTask && original == demoOtherBoard
          ? TaskBoardInfo(
              id: original.id,
              name: original.name,
              wsId: 'demo-team',
            )
          : original;
      final mine = UserTask(
        id: task.id,
        name: task.name,
        listId: list.id,
        priority: task.priority,
        endDate: task.endDate,
        assignees: task.assignees,
        labels: task.labels,
        list: TaskListInfo(
          id: list.id,
          name: list.name,
          status: list.status,
          board: board,
        ),
      );
      (list.isDone ? completed : active).add(mine);
    }
    return UserTasksPage(
      overdue: const [],
      today: const [],
      upcoming: active,
      completed: completed,
      totalActiveTasks: active.length,
      totalCompletedTasks: completed.length,
      hasMoreCompleted: false,
      completedPage: 0,
    );
  }

  @override
  Future<TaskBoardDetail> getTaskBoardDetail(
    String wsId,
    String boardId,
  ) async {
    openedBoards.add(boardId);
    final board = _boards.firstWhere((item) => item.id == boardId);
    final lists = await getBoardLists(wsId, boardId);
    return TaskBoardDetail(
      id: boardId,
      wsId: wsId,
      name: board.name,
      lists: lists,
      members: const [
        WorkspaceUserOption(id: 'demo-actor', displayName: 'Alex Doe'),
        WorkspaceUserOption(id: 'demo-sam', displayName: 'Sam Lee'),
      ],
      labels: const [
        TaskLabel(
          id: 'demo-review',
          name: 'Review',
          wsId: 'demo-workspace',
          color: 'ORANGE',
        ),
        TaskLabel(
          id: 'demo-design',
          name: 'Design',
          wsId: 'demo-workspace',
          color: 'BLUE',
        ),
      ],
    );
  }

  @override
  Future<List<TaskBoardList>> getBoardLists(
    String wsId,
    String boardId,
  ) async => _lists.where((list) => list.boardId == boardId).toList();

  @override
  Future<TaskBoardsPage> getTaskBoards(
    String wsId, {
    int page = 1,
    int pageSize = 20,
    String status = 'all',
  }) async => TaskBoardsPage(
    boards: [
      for (final board in _boards)
        TaskBoardSummary(
          id: board.id,
          wsId: wsId,
          name: board.name,
          createdAt: null,
        ),
    ],
    totalCount: _boards.length,
    page: page,
    pageSize: pageSize,
  );

  @override
  Future<List<TaskBoardTask>> getBoardTasksForList(
    String wsId, {
    required String listId,
    int limit = 50,
    int offset = 0,
    List<WorkspaceUserOption> members = const [],
    List<TaskLabel> labels = const [],
    List<TaskProjectSummary> projects = const [],
  }) async {
    final tasks = _tasks.values.where((item) => item.listId == listId).toList()
      ..sort((a, b) => a.sortKey!.compareTo(b.sortKey!));
    return tasks.skip(offset).take(limit).toList();
  }

  @override
  Future<TaskBoardTask> moveBoardTask({
    required String wsId,
    required String taskId,
    required String listId,
  }) async {
    moves.add((taskId, listId));
    return _tasks[taskId] = _tasks[taskId]!.copyWith(listId: listId);
  }

  @override
  Future<void> updateTask(
    String taskId,
    Map<String, dynamic> data, {
    required String wsId,
  }) async {
    placements.add((taskId, Map.of(data)));
    _tasks[taskId] = _tasks[taskId]!.copyWith(
      listId: data['list_id'] as String?,
      sortKey: data['sort_key'] as int?,
    );
  }

  @override
  Future<TaskBoardTask> updateBoardTask({
    required String wsId,
    required String taskId,
    String? name,
    String? description,
    String? priority,
    DateTime? startDate,
    DateTime? endDate,
    int? estimationPoints,
    List<String>? labelIds,
    List<String>? projectIds,
    List<String>? assigneeIds,
    bool? completed,
    bool clearDescription = false,
    bool clearPriority = false,
    bool clearStartDate = false,
    bool clearEndDate = false,
    bool clearEstimationPoints = false,
  }) async => _tasks[taskId] = _tasks[taskId]!.copyWith(
    name: name,
    priority: priority,
    startDate: startDate,
    endDate: endDate,
    completed: completed,
  );

  @override
  Future<TaskBoardTask> createBoardTask({
    required String wsId,
    required String listId,
    required String name,
    String? description,
    String? priority,
    DateTime? startDate,
    DateTime? endDate,
    int? estimationPoints,
    List<String>? labelIds,
    List<String>? projectIds,
    List<String>? assigneeIds,
  }) async {
    final task = TaskBoardTask(
      id: 'demo-created-${creates.length}',
      listId: listId,
      name: name,
      priority: priority,
      endDate: endDate,
      sortKey: 4000000,
      assigneeIds: assigneeIds ?? const [],
      assignees: (assigneeIds ?? const <String>[]).contains(demoActor.id)
          ? const [demoActor]
          : const [],
    );
    creates.add(task);
    _tasks[task.id] = task;
    return task;
  }

  @override
  Future<TaskRelationshipsResponse> getTaskRelationships({
    required String wsId,
    required String taskId,
  }) async => TaskRelationshipsResponse.empty;
}
