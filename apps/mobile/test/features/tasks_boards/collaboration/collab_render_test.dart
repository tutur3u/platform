import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/sharing_cubits.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/task_activity_cubit.dart';
import 'package:mobile/features/tasks_boards/collaboration/data/task_collaboration_repository.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_collaboration_models.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_sharing_models.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_snapshot.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/board_share_sheet.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/task_activity_section.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/task_comments_section.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/task_links_section.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/task_revert_sheet.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/task_share_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';

import '../../../helpers/design_render_harness.dart';
import 'collab_fakes.dart';

const _task = TaskBoardTask(
  id: 'task-1',
  listId: 'list-1',
  name: 'Ship the onboarding flow',
  priority: 'high',
);

FakeCollabRepository _collab() => FakeCollabRepository()
  ..comments = [
    comment('c1', 'The copy on the **second step** still feels long.'),
    comment('c2', 'Trimmed it, see the linked PR.', author: me),
  ]
  ..links = const [
    TaskLink(
      id: 'p1',
      url: 'https://github.com/tutur3u/platform/pull/481',
      kind: TaskLinkKind.pullRequest,
      externalId: '481',
      title: 'Shorten onboarding copy',
      state: TaskLinkState.merged,
    ),
    TaskLink(
      id: 'd1',
      url: 'https://docs.example/onboarding-spec',
      kind: TaskLinkKind.doc,
      title: 'Onboarding spec',
    ),
  ]
  ..pages = [
    TaskPage(
      items: [
        TaskTimelineEvent(
          id: 'e1',
          type: 'comment_added',
          actor: me,
          at: fixedAt,
          comment: comment('c2', 'Trimmed it, see the linked PR.', author: me),
        ),
        TaskTimelineEvent(
          id: 'e2',
          type: 'field_updated',
          fieldName: 'priority',
          actor: ada,
          at: fixedAt,
        ),
        TaskTimelineEvent(
          id: 'e3',
          type: 'task_created',
          actor: ada,
          at: fixedAt,
        ),
      ],
    ),
  ]
  ..snapshotValue = const TaskSnapshot(
    name: 'Onboarding flow',
    priority: 'low',
    listId: 'list-1',
  );

FakeSharingRepository _sharing() => FakeSharingRepository()
  ..taskLink = const TaskShareLink(
    id: 'link-1',
    code: 'abc123',
    publicAccess: true,
  )
  ..boardLink = const BoardPublicLink(id: 'public-1', code: 'board7')
  ..shares = const [
    ShareGrant(
      id: 's1',
      permission: SharePermission.edit,
      displayName: 'Ada Lovelace',
    ),
    ShareGrant(
      id: 's2',
      permission: SharePermission.view,
      email: 'guest@example.com',
    ),
  ];

Future<void> _render(
  WidgetTester tester,
  String name,
  Brightness brightness,
  Widget child,
) async {
  DesignRender.setSize(tester, DesignRender.sizes['phone']!);
  await tester.pumpWidget(
    DesignRenderApp(
      settings: DesignRender.themes[brightness.name]!.$1,
      brightness: brightness,
      child: child,
    ),
  );
  await tester.pumpAndSettle();
  expect(tester.takeException(), isNull);
  await DesignRender.capture(tester, '$name-${brightness.name}');
}

/// Starts a sheet cubit's first load, as the sheet openers do.
extension on TaskSharingCubit {
  TaskSharingCubit unawaitedLoad() => this..load().ignore();
}

extension on BoardSharingCubit {
  BoardSharingCubit unawaitedLoad() => this..load().ignore();
}

extension on TaskRevertCubit {
  TaskRevertCubit unawaitedLoad() => this..load().ignore();
}

void main() {
  setUpAll(DesignRender.loadFonts);

  for (final brightness in [Brightness.light, Brightness.dark]) {
    testWidgets('task collaboration sections ${brightness.name}', (
      tester,
    ) async {
      await _render(
        tester,
        'task-collaboration',
        brightness,
        RepositoryProvider<TaskCollaborationRepository>.value(
          value: _collab(),
          child: const SingleChildScrollView(
            padding: EdgeInsets.all(AppSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: AppSpacing.xl,
              children: [
                TaskCommentsSection(
                  wsId: 'ws-1',
                  taskId: 'task-1',
                  currentUserId: 'me',
                ),
                TaskLinksSection(wsId: 'ws-1', taskId: 'task-1'),
                TaskActivitySection(wsId: 'ws-1', task: _task),
              ],
            ),
          ),
        ),
      );
      expect(find.text('Onboarding spec'), findsOneWidget);
    });

    testWidgets('task share sheet ${brightness.name}', (tester) async {
      await _render(
        tester,
        'task-share',
        brightness,
        BlocProvider(
          create: (_) => TaskSharingCubit(
            repository: _sharing(),
            wsId: rootWorkspaceId,
            taskId: 'task-1',
          )..unawaitedLoad(),
          child: const TaskShareSheet(
            wsId: rootWorkspaceId,
            taskName: 'Ship the onboarding flow',
          ),
        ),
      );
      expect(find.text('Anyone with the link can view'), findsOneWidget);
    });

    testWidgets('board share sheet ${brightness.name}', (tester) async {
      await _render(
        tester,
        'board-share',
        brightness,
        BlocProvider(
          create: (_) => BoardSharingCubit(
            repository: _sharing(),
            wsId: 'ws-1',
            boardId: 'board-1',
            locale: 'en',
          )..unawaitedLoad(),
          child: const BoardShareSheet(boardName: 'Roadmap'),
        ),
      );
      expect(find.text('Share Roadmap'), findsOneWidget);
    });

    testWidgets('task revert sheet ${brightness.name}', (tester) async {
      await _render(
        tester,
        'task-revert',
        brightness,
        BlocProvider(
          create: (_) => TaskRevertCubit(
            repository: _collab(),
            wsId: 'ws-1',
            task: _task,
            historyId: 'e2',
          )..unawaitedLoad(),
          child: const TaskRevertSheet(),
        ),
      );
      expect(find.text('2 fields different'), findsOneWidget);
    });
  }
}
