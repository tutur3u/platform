import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_link_option.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/task_relationships.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _FakeTaskRepository extends TaskRepository {
  _FakeTaskRepository() {
    _taskById = {
      for (final task in _seedTasks) task.id: task,
    };
    _relationshipsByTaskId = {
      for (final task in _seedTasks) task.id: TaskRelationshipsResponse.empty,
    };
  }

  late final Map<String, TaskBoardTask> _taskById;
  late final Map<String, TaskRelationshipsResponse> _relationshipsByTaskId;

  int createRelationshipCalls = 0;

  static const _seedTasks = [
    TaskBoardTask(
      id: 'task-1',
      listId: 'list-1',
      displayNumber: 1,
      name: 'Alpha task',
      relationshipsLoaded: true,
    ),
    TaskBoardTask(
      id: 'task-2',
      listId: 'list-1',
      displayNumber: 2,
      name: 'Beta task',
      relationshipsLoaded: true,
    ),
  ];

  @override
  Future<TaskBoardDetail> getTaskBoardDetail(
    String wsId,
    String boardId,
  ) async {
    final tasks = _seedTasks
        .map(
          (task) => task.copyWith(
            relationships: _relationshipsByTaskId[task.id],
            relationshipsLoaded: true,
          ),
        )
        .toList(growable: false);

    return TaskBoardDetail(
      id: boardId,
      wsId: wsId,
      name: 'Board A',
      ticketPrefix: 'TASK',
      lists: const [
        TaskBoardList(
          id: 'list-1',
          boardId: 'board-1',
          name: 'Todo',
          status: 'active',
          color: 'BLUE',
        ),
      ],
      tasks: tasks,
    );
  }

  @override
  Future<List<TaskBoardTask>> getBoardTasksForList(
    String wsId, {
    required String listId,
    int limit = 50,
    int offset = 0,
    List<WorkspaceUserOption> members = const <WorkspaceUserOption>[],
    List<TaskLabel> labels = const <TaskLabel>[],
    List<TaskProjectSummary> projects = const <TaskProjectSummary>[],
  }) async {
    if (listId != 'list-1') {
      return const <TaskBoardTask>[];
    }
    if (offset > 0) {
      return const <TaskBoardTask>[];
    }

    return _seedTasks
        .map(
          (task) => task.copyWith(
            relationships: _relationshipsByTaskId[task.id],
            relationshipsLoaded: true,
          ),
        )
        .toList(growable: false);
  }

  @override
  Future<List<TaskLinkOption>> getWorkspaceTasksForProjectLinking(
    String wsId,
  ) async {
    return const [
      TaskLinkOption(
        id: 'task-1',
        name: 'Alpha task',
        listName: 'Todo',
        boardName: 'Board A',
      ),
      TaskLinkOption(
        id: 'task-2',
        name: 'Beta task',
        listName: 'Todo',
        boardName: 'Board A',
      ),
    ];
  }

  @override
  Future<TaskRelationshipsResponse> getTaskRelationships({
    required String wsId,
    required String taskId,
  }) async {
    return _relationshipsByTaskId[taskId] ?? TaskRelationshipsResponse.empty;
  }

  @override
  Future<void> createTaskRelationship({
    required String wsId,
    required String taskId,
    required String sourceTaskId,
    required String targetTaskId,
    required TaskRelationshipType type,
  }) async {
    createRelationshipCalls += 1;
    await Future<void>.delayed(const Duration(milliseconds: 300));

    final source = _toRelatedTaskInfo(sourceTaskId);
    final target = _toRelatedTaskInfo(targetTaskId);
    if (source == null || target == null) {
      return;
    }

    if (type == TaskRelationshipType.related) {
      _relationshipsByTaskId[sourceTaskId] = TaskRelationshipsResponse(
        parentTask: _relationshipsByTaskId[sourceTaskId]?.parentTask,
        childTasks:
            _relationshipsByTaskId[sourceTaskId]?.childTasks ?? const [],
        blockedBy: _relationshipsByTaskId[sourceTaskId]?.blockedBy ?? const [],
        blocking: _relationshipsByTaskId[sourceTaskId]?.blocking ?? const [],
        relatedTasks: [
          ...?_relationshipsByTaskId[sourceTaskId]?.relatedTasks,
          if (!(_relationshipsByTaskId[sourceTaskId]?.relatedTasks.any(
                (task) => task.id == target.id,
              ) ??
              false))
            target,
        ],
      );

      _relationshipsByTaskId[targetTaskId] = TaskRelationshipsResponse(
        parentTask: _relationshipsByTaskId[targetTaskId]?.parentTask,
        childTasks:
            _relationshipsByTaskId[targetTaskId]?.childTasks ?? const [],
        blockedBy: _relationshipsByTaskId[targetTaskId]?.blockedBy ?? const [],
        blocking: _relationshipsByTaskId[targetTaskId]?.blocking ?? const [],
        relatedTasks: [
          ...?_relationshipsByTaskId[targetTaskId]?.relatedTasks,
          if (!(_relationshipsByTaskId[targetTaskId]?.relatedTasks.any(
                (task) => task.id == source.id,
              ) ??
              false))
            source,
        ],
      );
    }
  }

  RelatedTaskInfo? _toRelatedTaskInfo(String taskId) {
    final task = _taskById[taskId];
    if (task == null) return null;
    return RelatedTaskInfo(
      id: task.id,
      name: task.name ?? '',
      displayNumber: task.displayNumber,
      completed: task.completed,
      priority: task.priority,
      boardId: 'board-1',
      boardName: 'Board A',
    );
  }
}

void main() {
  group('Task relationship editor', () {
    late _MockWorkspaceCubit workspaceCubit;
    late _FakeTaskRepository taskRepository;

    setUp(() {
      workspaceCubit = _MockWorkspaceCubit();
      taskRepository = _FakeTaskRepository();

      const workspace = Workspace(id: 'ws-1', name: 'Workspace');
      const workspaceState = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: workspace,
        workspaces: [workspace],
      );
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: workspaceState,
      );
    });

    testWidgets('optimistically updates relationship indicator and list', (
      tester,
    ) async {
      await tester.pumpApp(
        BlocProvider<WorkspaceCubit>.value(
          value: workspaceCubit,
          child: TaskBoardDetailPage(
            boardId: 'board-1',
            taskRepository: taskRepository,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Alpha task').first);
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.edit).first);
      await tester.pumpAndSettle();

      final relationshipsTab = find.text('Relationships').last;
      await tester.ensureVisible(relationshipsTab);
      await tester.tap(relationshipsTab, warnIfMissed: false);
      await tester.pumpAndSettle();

      final addRelatedTaskButton = find.text('Add related task').last;
      await tester.ensureVisible(addRelatedTaskButton);
      final betaTaskTextCountBefore = find.text('Beta task').evaluate().length;
      await tester.tap(addRelatedTaskButton, warnIfMissed: false);
      await tester.pumpAndSettle();

      final betaTaskOption = find.text('Beta task').last;
      await tester.ensureVisible(betaTaskOption);
      await tester.tap(betaTaskOption, warnIfMissed: false);
      await tester.pump();

      expect(taskRepository.createRelationshipCalls, 1);
      expect(
        find.text('Beta task').evaluate().length,
        greaterThan(betaTaskTextCountBefore),
      );
      expect(find.widgetWithText(shad.OutlineBadge, '1'), findsWidgets);

      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpAndSettle();

      expect(
        find.text('Beta task').evaluate().length,
        greaterThan(betaTaskTextCountBefore),
      );
      expect(find.widgetWithText(shad.OutlineBadge, '1'), findsWidgets);

      await tester.drainShadToastTimers();
    });
  });
}
