import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/phone_surface.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _Repository extends TaskRepository {
  _Repository({this.extraActiveTasks = 0});

  /// Extra open tasks in `list-1`, served in pages, to exercise auto-load.
  final int extraActiveTasks;
  final List<int> requestedOffsets = <int>[];

  static const _detail = TaskBoardDetail(
    id: 'board-1',
    wsId: 'ws-1',
    name: 'Board A',
    lists: [
      TaskBoardList(
        id: 'list-1',
        boardId: 'board-1',
        name: 'Todo',
        status: 'active',
        color: 'BLUE',
      ),
      TaskBoardList(
        id: 'list-empty',
        boardId: 'board-1',
        name: 'Backlog',
        status: 'not_started',
        color: 'GRAY',
        taskCount: 0,
      ),
      TaskBoardList(
        id: 'list-review',
        boardId: 'board-1',
        name: 'Review',
        status: 'active',
        color: 'PURPLE',
      ),
      TaskBoardList(
        id: 'list-qa',
        boardId: 'board-1',
        name: 'QA',
        status: 'active',
        color: 'ORANGE',
      ),
      // Past the cubit's three-list prefetch window, so showing completed
      // work must load it on demand.
      TaskBoardList(
        id: 'list-done',
        boardId: 'board-1',
        name: 'Shipped',
        status: 'done',
        color: 'GREEN',
      ),
    ],
    tasks: [
      TaskBoardTask(id: 'task-1', listId: 'list-1', name: 'Alpha task'),
      TaskBoardTask(id: 'task-2', listId: 'list-1', name: 'Beta task'),
      TaskBoardTask(
        id: 'task-3',
        listId: 'list-1',
        name: 'Finished task',
        completed: true,
      ),
      TaskBoardTask(id: 'task-4', listId: 'list-done', name: 'Shipped task'),
      TaskBoardTask(id: 'task-5', listId: 'list-review', name: 'Review task'),
      TaskBoardTask(id: 'task-6', listId: 'list-qa', name: 'QA task'),
    ],
  );

  List<TaskBoardTask> _tasksFor(String listId) => [
    ..._detail.tasks.where((task) => task.listId == listId),
    if (listId == 'list-1')
      for (var i = 0; i < extraActiveTasks; i++)
        TaskBoardTask(id: 'extra-$i', listId: listId, name: 'Extra task $i'),
  ];

  @override
  Future<TaskBoardDetail> getTaskBoardDetail(String wsId, String boardId) =>
      Future.value(_detail);

  @override
  Future<List<TaskBoardTask>> getBoardTasksForList(
    String wsId, {
    required String listId,
    int limit = 50,
    int offset = 0,
    List<WorkspaceUserOption> members = const <WorkspaceUserOption>[],
    List<TaskLabel> labels = const <TaskLabel>[],
    List<TaskProjectSummary> projects = const <TaskProjectSummary>[],
  }) {
    if (listId == 'list-1') requestedOffsets.add(offset);
    final all = _tasksFor(listId);
    final end = (offset + limit).clamp(0, all.length);
    return Future.value(
      offset >= all.length ? <TaskBoardTask>[] : all.sublist(offset, end),
    );
  }
}

/// Minimal real shell: the floating dock and the header action host share the
/// chrome cubit with the routed board page, like `ShellPage`.
class _Shell extends StatelessWidget {
  const _Shell({required this.location, required this.child});
  final String location;
  final Widget child;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: FloatingShellDock(
      location: location,
      bottomInset: 80,
      navigationWidth: 104,
      header: Row(
        children: [
          const Expanded(child: Text('Header')),
          ShellInjectedActionsHost(matchedLocation: location),
        ],
      ),
      navigation: const SizedBox(width: 104, height: 48),
      child: child,
    ),
  );
}

Future<void> _pumpBoardInShell(
  WidgetTester tester, {
  _Repository? repository,
  TaskBoardDetailView? initialView,
}) async {
  SharedPreferences.setMockInitialValues(<String, Object>{});
  final workspaceCubit = _MockWorkspaceCubit();
  const workspace = Workspace(id: 'ws-1', name: 'Workspace');
  whenListen(
    workspaceCubit,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      status: WorkspaceStatus.loaded,
      currentWorkspace: workspace,
      workspaces: [workspace],
    ),
  );
  final chrome = ShellChromeActionsCubit();
  final titles = ShellTitleOverrideCubit();
  final nav = ShellMiniNavCubit();
  addTearDown(chrome.close);
  addTearDown(titles.close);
  addTearDown(nav.close);
  const location = '/tasks/boards/board-1';
  final router = GoRouter(
    initialLocation: location,
    routes: [
      ShellRoute(
        builder: (_, state, child) =>
            _Shell(location: state.uri.path, child: child),
        routes: [
          GoRoute(
            path: location,
            builder: (_, _) => TaskBoardDetailPage(
              boardId: 'board-1',
              taskRepository: repository ?? _Repository(),
              initialView: initialView,
            ),
          ),
        ],
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpAppRouter(
    router,
    wrap: (app) => MultiBlocProvider(
      providers: [
        BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
        BlocProvider.value(value: chrome),
        BlocProvider.value(value: titles),
        BlocProvider.value(value: nav),
      ],
      child: app,
    ),
  );
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 350));
  }
  await tester.pumpAndSettle();
}

List<String> _texts() => find
    .byType(Text)
    .evaluate()
    .map((e) => (e.widget as Text).data)
    .whereType<String>()
    .toList();

void main() {
  usePhoneSurface();

  testWidgets(
    'Filtering for urgent tasks shows an empty list until filters clear',
    (tester) async {
      await _pumpBoardInShell(tester);
      final task = find.bySemanticsIdentifier('mobile.tasks.list-task.task-1');
      expect(task, findsOneWidget);
      // The board registers more actions than the header shows, so Filters
      // lives in the overflow menu.
      expect(
        find.byKey(
          const ValueKey<String>(
            'shell-action-button-task-board-detail-filter',
          ),
        ),
        findsNothing,
      );
      await tester.tap(
        find.byKey(const ValueKey<String>('shell-actions-overflow')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Filters').last);
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(
        find.text('Hidden by default').hitTestable(),
        findsOneWidget,
        reason: '${_texts()}',
      );
      expect(
        find.bySemanticsIdentifier('mobile.tasks.filters'),
        findsOneWidget,
      );
      final priority = find.text('Priority');
      final section = tester
          .element(priority)
          .findAncestorWidgetOfExactType<Column>()!;
      final picker = find.descendant(
        of: find.byWidget(section),
        matching: find.text('None'),
      );
      await tester.ensureVisible(picker);
      await tester.tap(picker);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Urgent'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Apply filters').last);
      await tester.pumpAndSettle();
      final apply = find.text('Apply filters');
      await tester.ensureVisible(apply);
      await tester.tap(apply);
      await tester.pumpAndSettle();
      expect(task, findsNothing);
      expect(
        find.bySemanticsIdentifier('mobile.tasks.list-empty'),
        findsOneWidget,
      );

      await tester.tap(find.text('Clear filters'));
      await tester.pumpAndSettle();
      expect(task, findsOneWidget);
      await tester.tap(task);
      await tester.pumpAndSettle();
      expect(find.bySemanticsIdentifier('mobile.tasks.detail'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('long-pressing a task opens its actions without a build error', (
    tester,
  ) async {
    await _pumpBoardInShell(tester);
    await tester.longPress(find.text('Alpha task').first);
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.byType(ErrorWidget), findsNothing);
    expect(find.text('Select task').hitTestable(), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'the list view shows active work only by default, with a toggle',
    (tester) async {
      await _pumpBoardInShell(tester);
      expect(find.text('Alpha task'), findsWidgets);
      expect(find.text('Finished task'), findsNothing);
      expect(find.text('Shipped task'), findsNothing);
      expect(find.text('Active tasks only'), findsOneWidget);
      expect(find.text('Load more'), findsNothing);

      await tester.tap(
        find.byKey(const ValueKey<String>('shell-actions-overflow')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Filters').last);
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('task-board-setting-show-completed')),
      );
      await tester.pumpAndSettle();
      final apply = find.text('Apply filters');
      await tester.ensureVisible(apply);
      await tester.pumpAndSettle();
      await tester.tap(apply);
      await tester.pumpAndSettle();
      for (var i = 0; i < 3; i++) {
        await tester.pump(const Duration(milliseconds: 350));
      }
      await tester.pumpAndSettle();

      expect(find.text('Finished task'), findsWidgets);
      expect(find.text('Shipped task'), findsWidgets);
      expect(find.text('Active tasks only'), findsNothing);
      final prefs = await SharedPreferences.getInstance();
      expect(
        prefs.getString('task_board_view_settings_v1_board-1'),
        contains('"showCompleted":true'),
      );
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('reaching the bottom loads the next page without a button', (
    tester,
  ) async {
    final repository = _Repository(extraActiveTasks: 120);
    await _pumpBoardInShell(tester, repository: repository);
    expect(repository.requestedOffsets, [0]);

    for (var i = 0; i < 12; i++) {
      await tester.drag(find.byType(Scrollable).first, const Offset(0, -1500));
      await tester.pumpAndSettle();
    }

    expect(repository.requestedOffsets.length, greaterThan(1));
    expect(
      repository.requestedOffsets.toSet().length,
      repository.requestedOffsets.length,
      reason: 'each page is requested once',
    );
    expect(find.text('Load more'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Kanban hides lists without tasks by default', (tester) async {
    await _pumpBoardInShell(tester, initialView: TaskBoardDetailView.kanban);
    expect(
      find
          .bySemanticsIdentifier(RegExp(r'^mobile\.tasks\.kanban-list\.'))
          .hitTestable()
          .first,
      findsOneWidget,
    );
    await tester.tap(
      find
          .bySemanticsIdentifier(RegExp(r'^mobile\.tasks\.kanban-create\.'))
          .hitTestable()
          .first,
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('task-editor-save')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('task-editor-cancel')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('task-editor-save')), findsNothing);
    expect(find.text('QA'), findsWidgets, reason: '${_texts()}');
    expect(find.text('Backlog'), findsNothing, reason: '${_texts()}');
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
