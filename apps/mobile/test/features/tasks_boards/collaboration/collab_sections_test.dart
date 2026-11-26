import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/collaboration/data/task_collaboration_repository.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_collaboration_models.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_snapshot.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/task_activity_section.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/task_comments_section.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/task_links_section.dart';

import '../../../helpers/pump_app.dart';
import 'collab_fakes.dart';

const _task = TaskBoardTask(
  id: 'task-1',
  listId: 'list-1',
  name: 'Now',
  priority: 'high',
);

/// Pumps [child] in a phone window, where the floating dock owns Back.
Future<void> _pump(
  WidgetTester tester,
  FakeCollabRepository repository,
  Widget child,
) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(390, 844);
  addTearDown(tester.view.reset);
  await tester.pumpApp(
    RepositoryProvider<TaskCollaborationRepository>.value(
      value: repository,
      child: Scaffold(body: SingleChildScrollView(child: child)),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  late FakeCollabRepository repository;
  setUp(() => repository = FakeCollabRepository());

  group('comments', () {
    Widget section() => const TaskCommentsSection(
      wsId: 'ws-1',
      taskId: 'task-1',
      currentUserId: 'me',
    );

    testWidgets('own comments can be edited and deleted, others cannot', (
      tester,
    ) async {
      repository.comments = [
        comment('c1', 'From Ada'),
        comment('c2', 'Mine', author: me),
      ];
      await _pump(tester, repository, section());

      expect(find.text('From Ada'), findsOneWidget);
      expect(find.byKey(const ValueKey('task-comment-edit-c1')), findsNothing);
      expect(
        find.byKey(const ValueKey('task-comment-delete-c1')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('task-comment-edit-c2')),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const ValueKey('task-comment-delete-c2')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete').last);
      await tester.pumpAndSettle();

      expect(repository.calls, contains('delete:c2'));
      expect(find.text('Mine'), findsNothing);
      await tester.drainShadToastTimers();
    });

    testWidgets('posting a comment adds it and clears the draft', (
      tester,
    ) async {
      await _pump(tester, repository, section());
      expect(find.text('No comments yet'), findsOneWidget);

      await tester.enterText(find.byType(EditableText).last, 'Hello team');
      await tester.pump();
      await tester.tap(find.text('Comment').last);
      await tester.pumpAndSettle();

      expect(repository.calls, contains('add:Hello team'));
      expect(find.text('Hello team'), findsOneWidget);
      expect(
        tester
            .widget<EditableText>(find.byType(EditableText).last)
            .controller
            .text,
        isEmpty,
      );
    });

    testWidgets('a refused comment keeps the draft and says why', (
      tester,
    ) async {
      repository.failWrite = forbidden;
      await _pump(tester, repository, section());

      await tester.enterText(find.byType(EditableText).last, 'Hello');
      await tester.pump();
      await tester.tap(find.text('Comment').last);
      await tester.pumpAndSettle();

      expect(
        find.text("You don't have permission to do this."),
        findsOneWidget,
      );
      expect(
        tester
            .widget<EditableText>(find.byType(EditableText).last)
            .controller
            .text,
        'Hello',
      );
      await tester.drainShadToastTimers();
    });

    testWidgets('offline shows the offline state and retries', (tester) async {
      repository.failLoad = offline;
      await _pump(tester, repository, section());
      expect(
        find.text("You're offline. Try again when you're connected."),
        findsOneWidget,
      );

      repository
        ..failLoad = null
        ..comments = [comment('c1', 'Back online')];
      await tester.tap(find.byTooltip('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Back online'), findsOneWidget);
    });
  });

  group('links', () {
    testWidgets('adds an https link and rejects others inline', (tester) async {
      await _pump(
        tester,
        repository,
        const TaskLinksSection(wsId: 'ws-1', taskId: 'task-1'),
      );
      expect(find.text('No linked resources'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('task-link-add')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('task-link-url')),
        'http://insecure.example',
      );
      await tester.pump();
      expect(find.text('Enter a valid https link'), findsOneWidget);

      await tester.enterText(
        find.byKey(const ValueKey('task-link-url')),
        'https://docs.example/spec',
      );
      await tester.pump();
      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();

      expect(repository.calls, contains('addLink:https://docs.example/spec'));
      expect(find.text('docs.example/spec'), findsOneWidget);
    });

    testWidgets('groups by kind; legacy links cannot be removed here', (
      tester,
    ) async {
      repository.links = const [
        TaskLink(
          id: 'p1',
          url: 'https://github.com/o/r/pull/9',
          kind: TaskLinkKind.pullRequest,
          externalId: '9',
          state: TaskLinkState.merged,
        ),
        TaskLink(
          url: 'https://old.example',
          kind: TaskLinkKind.url,
          legacy: true,
        ),
      ];
      await _pump(
        tester,
        repository,
        const TaskLinksSection(wsId: 'ws-1', taskId: 'task-1'),
      );

      expect(find.text('Pull requests'), findsOneWidget);
      expect(find.text('#9'), findsOneWidget);
      expect(find.text('Merged'), findsOneWidget);
      expect(find.text('Edited through the task links field'), findsOneWidget);
      expect(find.byKey(const ValueKey('task-link-remove-p1')), findsOneWidget);
      expect(find.byTooltip('Remove link'), findsOneWidget);
    });
  });

  group('activity', () {
    testWidgets('describes events in web wording and loads more', (
      tester,
    ) async {
      repository.pages = [
        TaskPage(
          items: [
            TaskTimelineEvent(
              id: 'e1',
              type: 'comment_added',
              actor: ada,
              at: fixedAt,
              comment: comment('c1', 'Ready for review'),
            ),
            TaskTimelineEvent(
              id: 'e2',
              type: 'field_updated',
              fieldName: 'priority',
              actor: me,
              at: fixedAt,
            ),
          ],
          nextCursor: '1',
        ),
        TaskPage(
          items: [
            TaskTimelineEvent(
              id: 'e3',
              type: 'task_created',
              actor: me,
              at: fixedAt,
            ),
          ],
        ),
      ];
      await _pump(
        tester,
        repository,
        const TaskActivitySection(wsId: 'ws-1', task: _task),
      );

      expect(find.textContaining('commented'), findsOneWidget);
      expect(find.text('Ready for review'), findsOneWidget);
      expect(find.textContaining('changed priority'), findsOneWidget);
      // Comments have nothing to restore.
      expect(
        find.byKey(const ValueKey('task-activity-revert-e1')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('task-activity-revert-e2')),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const ValueKey('task-activity-more')));
      await tester.pumpAndSettle();
      expect(find.textContaining('created task'), findsOneWidget);
    });

    testWidgets('restoring a change reverts the chosen fields', (tester) async {
      var reverted = 0;
      repository
        ..pages = [
          TaskPage(
            items: [
              TaskTimelineEvent(
                id: 'h1',
                type: 'field_updated',
                fieldName: 'name',
                actor: me,
                at: fixedAt,
              ),
            ],
          ),
        ]
        ..snapshotValue = const TaskSnapshot(
          name: 'Before',
          priority: 'low',
          listId: 'list-1',
        );
      await _pump(
        tester,
        repository,
        TaskActivitySection(
          wsId: 'ws-1',
          task: _task,
          onReverted: () => reverted++,
        ),
      );

      await tester.tap(find.byKey(const ValueKey('task-activity-revert-h1')));
      await tester.pumpAndSettle();
      expect(find.text('2 fields different'), findsOneWidget);
      expect(find.text('Before'), findsOneWidget);

      await tester.tap(
        find.byKey(const ValueKey('task-revert-field-priority')),
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('task-revert-submit')));
      await tester.pumpAndSettle();

      expect(repository.revertedFields, [TaskRevertField.name]);
      expect(reverted, 1);
      expect(
        find.text('Successfully reverted selected fields'),
        findsOneWidget,
      );
      await tester.drainShadToastTimers();
    });

    testWidgets('a refused revert leaves the sheet open', (tester) async {
      repository
        ..pages = [
          TaskPage(
            items: [
              TaskTimelineEvent(
                id: 'h1',
                type: 'field_updated',
                fieldName: 'name',
                at: fixedAt,
              ),
            ],
          ),
        ]
        ..snapshotValue = const TaskSnapshot(name: 'Before', listId: 'list-1')
        ..failWrite = forbidden;
      await _pump(
        tester,
        repository,
        const TaskActivitySection(wsId: 'ws-1', task: _task),
      );

      await tester.tap(find.byKey(const ValueKey('task-activity-revert-h1')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('task-revert-submit')));
      await tester.pumpAndSettle();

      expect(
        find.text("You don't have permission to do this."),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('task-revert-submit')), findsOneWidget);
      await tester.drainShadToastTimers();
    });
  });
}
