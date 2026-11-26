import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/tasks_boards/collaboration/data/task_sharing_repository.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_sharing_models.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/board_share_sheet.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/task_share_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';

import '../../../helpers/pump_app.dart';
import 'collab_fakes.dart';

/// Pumps a phone window with a button that opens [open], and taps it.
Future<void> _open(
  WidgetTester tester,
  FakeSharingRepository repository,
  Future<void> Function(BuildContext context) open,
) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(390, 844);
  addTearDown(tester.view.reset);
  await tester.pumpApp(
    RepositoryProvider<TaskSharingRepository>.value(
      value: repository,
      child: Builder(
        builder: (context) => Center(
          child: TextButton(
            onPressed: () => open(context),
            child: const Text('open'),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
}

void main() {
  late FakeSharingRepository repository;
  setUp(() => repository = FakeSharingRepository());

  group('task sharing', () {
    Future<void> openTask(WidgetTester tester, {String wsId = 'ws-1'}) => _open(
      tester,
      repository,
      (context) => showTaskShareSheet(
        context,
        wsId: wsId,
        taskId: 'task-1',
        taskName: 'Ship it',
      ),
    );

    testWidgets('shows the link, invites people and changes access', (
      tester,
    ) async {
      repository.shares = const [
        ShareGrant(
          id: 's1',
          permission: SharePermission.view,
          displayName: 'Ada',
        ),
      ];
      await openTask(tester);

      expect(find.text('Share task'), findsOneWidget);
      expect(find.text('Only invited people'), findsOneWidget);
      expect(find.byKey(const ValueKey('share-link-native')), findsOneWidget);
      // Invite-only is for the internal workspace only, as on web.
      expect(
        find.byKey(const ValueKey('task-share-invite-only')),
        findsNothing,
      );

      await tester.enterText(
        find.byKey(const ValueKey('share-invite-email')),
        'nope',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('share-invite-add')));
      await tester.pumpAndSettle();
      expect(find.text('Please enter a valid email address'), findsOneWidget);
      await tester.drainShadToastTimers();

      await tester.enterText(
        find.byKey(const ValueKey('share-invite-email')),
        'guest@example.com',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('share-invite-add')));
      await tester.pumpAndSettle();
      expect(repository.calls, contains('share:guest@example.com'));
      expect(find.text('guest@example.com'), findsOneWidget);
      await tester.drainShadToastTimers();

      await tester.tap(find.byKey(const ValueKey('share-grant-permission-s1')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Editor').last);
      await tester.pumpAndSettle();
      expect(repository.calls, contains('permission:s1:edit'));
      await tester.drainShadToastTimers();
    });

    testWidgets('public access outside the internal workspace is explained', (
      tester,
    ) async {
      await openTask(tester);
      await tester.tap(find.byKey(const ValueKey('task-share-public')));
      await tester.pumpAndSettle();

      expect(
        find.text(
          'Public access for tasks is currently only available to internal '
          'teams.',
        ),
        findsOneWidget,
      );
      expect(repository.calls, isEmpty);
      await tester.drainShadToastTimers();
    });

    testWidgets('the internal workspace can set invite-only and revoke', (
      tester,
    ) async {
      await openTask(tester, wsId: rootWorkspaceId);
      await tester.ensureVisible(
        find.byKey(const ValueKey('task-share-invite-only')),
      );
      await tester.tap(find.byKey(const ValueKey('task-share-invite-only')));
      await tester.pumpAndSettle();
      expect(repository.calls, contains('link:null:true'));
      await tester.drainShadToastTimers();

      await tester.ensureVisible(
        find.byKey(const ValueKey('task-share-revoke')),
      );
      await tester.tap(find.byKey(const ValueKey('task-share-revoke')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Revoke link').last);
      await tester.pumpAndSettle();
      expect(repository.calls, contains('revoke:link-1'));
      await tester.drainShadToastTimers();
    });

    testWidgets('offline loading offers a retry', (tester) async {
      repository.failLoad = offline;
      await openTask(tester);
      expect(
        find.text("You're offline. Try again when you're connected."),
        findsOneWidget,
      );
      repository.failLoad = null;
      await tester.tap(find.byTooltip('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Only invited people'), findsOneWidget);
    });
  });

  group('board sharing', () {
    Future<void> openBoard(WidgetTester tester) => _open(
      tester,
      repository,
      (context) => showBoardShareSheet(
        context,
        wsId: 'ws-1',
        boardId: 'board-1',
        boardName: 'Roadmap',
      ),
    );

    testWidgets('enables the public link and invites a guest', (tester) async {
      await openBoard(tester);
      expect(find.text('Share Roadmap'), findsOneWidget);
      expect(
        find.text('This board has not been shared directly with anyone yet.'),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const ValueKey('board-share-public-enable')));
      await tester.pumpAndSettle();
      expect(repository.calls, contains('enable'));
      expect(find.byKey(const ValueKey('share-link-copy')), findsOneWidget);
      await tester.drainShadToastTimers();

      await tester.tap(
        find.byKey(const ValueKey('board-share-invite-permission')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Can edit').last);
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('share-invite-email')),
        'guest@example.com',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('share-invite-add')));
      await tester.pumpAndSettle();
      expect(repository.calls, contains('guest:guest@example.com:edit'));
      await tester.drainShadToastTimers();
    });

    testWidgets('a viewer without manage rights is told so', (tester) async {
      repository.failLoad = forbidden;
      await openBoard(tester);
      expect(
        find.text(
          "You don't have permission to view this. Ask a workspace admin for "
          'project management access.',
        ),
        findsOneWidget,
      );
      expect(find.byTooltip('Retry'), findsNothing);
    });
  });
}
