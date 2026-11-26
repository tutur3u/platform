import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/collab_failure.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/sharing_cubits.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/task_activity_cubit.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/task_comments_cubit.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/task_links_cubit.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_collaboration_models.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_sharing_models.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_snapshot.dart';

import 'collab_fakes.dart';

void main() {
  late FakeCollabRepository repository;
  setUp(() => repository = FakeCollabRepository());

  group('comments', () {
    TaskCommentsCubit cubit() => TaskCommentsCubit(
      repository: repository,
      wsId: 'ws-1',
      taskId: 'task-1',
    );

    test('adds, edits and deletes through the server', () async {
      repository.comments = [comment('c1', 'First')];
      final comments = cubit();
      await comments.load();

      expect(await comments.add('  Second  '), isNull);
      final added = comments.state.comments.last;
      expect(added.body, 'Second');
      expect(await comments.edit(added.id, 'Second, edited'), isNull);
      expect(comments.state.comments.last.body, 'Second, edited');
      expect(await comments.delete('c1'), isNull);

      expect(comments.state.comments.map((c) => c.id), [added.id]);
      expect(repository.calls, contains('add:Second'));
    });

    test('a refused write changes nothing and says why', () async {
      repository.comments = [comment('c1', 'First')];
      final comments = cubit();
      await comments.load();
      repository.failWrite = forbidden;

      expect(await comments.edit('c1', 'Mine now'), CollabFailure.forbidden);
      expect(await comments.add('Hello'), CollabFailure.forbidden);
      expect(comments.state.comments.single.body, 'First');
      expect(comments.state.posting, isFalse);
      expect(comments.state.busyCommentId, isNull);
    });

    test('an offline load fails as offline and can be retried', () async {
      repository.failLoad = offline;
      final comments = cubit();
      await comments.load();
      expect(comments.state.load, CollabLoad.failed);
      expect(comments.state.loadFailure, CollabFailure.offline);

      repository.failLoad = null;
      await comments.load();
      expect(comments.state.load, CollabLoad.loaded);
    });
  });

  group('links', () {
    TaskLinksCubit cubit() =>
        TaskLinksCubit(repository: repository, wsId: 'ws-1', taskId: 'task-1');

    test('only https addresses are sent', () async {
      final links = cubit();
      await links.load();

      expect(await links.add('http://example.com'), CollabFailure.invalid);
      expect(await links.add('not a link'), CollabFailure.invalid);
      expect(repository.calls.where((c) => c.startsWith('addLink')), isEmpty);

      expect(await links.add('https://example.com/a'), isNull);
      expect(links.state.links.single.url, 'https://example.com/a');
    });

    test('groups by kind in web order; legacy links stay', () async {
      repository.links = const [
        TaskLink(id: 'u', url: 'https://a.example', kind: TaskLinkKind.url),
        TaskLink(
          id: 'p',
          url: 'https://github.com/o/r/pull/1',
          kind: TaskLinkKind.pullRequest,
        ),
        TaskLink(
          url: 'https://legacy.example',
          kind: TaskLinkKind.url,
          legacy: true,
        ),
      ];
      final links = cubit();
      await links.load();

      expect(links.state.groups.map((group) => group.$1), [
        TaskLinkKind.pullRequest,
        TaskLinkKind.url,
      ]);
      expect(await links.remove(repository.links.last), isNull);
      expect(
        repository.calls.where((c) => c.startsWith('removeLink')),
        isEmpty,
      );
      expect(await links.remove(repository.links.first), isNull);
      expect(links.state.links.map((link) => link.id), ['p', null]);
    });
  });

  group('activity', () {
    TaskTimelineEvent event(String id, {String type = 'field_updated'}) =>
        TaskTimelineEvent(id: id, type: type, fieldName: 'name', at: fixedAt);

    test('loads more pages and drops repeats', () async {
      repository.pages = [
        TaskPage(items: [event('e1'), event('e2')], nextCursor: '1'),
        TaskPage(items: [event('e2'), event('e3')]),
      ];
      final activity = TaskActivityCubit(
        repository: repository,
        wsId: 'ws-1',
        taskId: 'task-1',
      );
      await activity.load();
      expect(activity.state.hasMore, isTrue);

      expect(await activity.loadMore(), isNull);
      expect(activity.state.events.map((e) => e.id), ['e1', 'e2', 'e3']);
      expect(activity.state.hasMore, isFalse);
    });

    test('only task changes can be restored', () {
      expect(event('e1').restorable, isTrue);
      expect(event('e2', type: 'comment_added').restorable, isFalse);
      expect(event('e3', type: 'link_removed').restorable, isFalse);
    });
  });

  group('revert', () {
    const task = TaskBoardTask(
      id: 'task-1',
      listId: 'list-1',
      name: 'Now',
      priority: 'high',
    );

    test('selects the changed fields and reverts the chosen ones', () async {
      repository.snapshotValue = const TaskSnapshot(
        name: 'Before',
        priority: 'low',
        listId: 'list-1',
      );
      final revert = TaskRevertCubit(
        repository: repository,
        wsId: 'ws-1',
        task: task,
        historyId: 'h1',
      );
      await revert.load();
      expect(revert.state.changed, [
        TaskRevertField.name,
        TaskRevertField.priority,
      ]);
      expect(revert.state.selected, revert.state.changed.toSet());

      revert.toggle(TaskRevertField.name);
      expect(await revert.revert(), isNull);
      expect(repository.revertedFields, [TaskRevertField.priority]);
    });

    test('a refused revert reports permission', () async {
      repository
        ..snapshotValue = const TaskSnapshot(name: 'Before', listId: 'list-1')
        ..failWrite = forbidden;
      final revert = TaskRevertCubit(
        repository: repository,
        wsId: 'ws-1',
        task: task,
        historyId: 'h1',
      );
      await revert.load();
      expect(await revert.revert(), CollabFailure.forbidden);
      expect(revert.state.reverting, isFalse);
    });
  });

  group('sharing', () {
    late FakeSharingRepository sharing;
    setUp(() => sharing = FakeSharingRepository());

    test('task invites check the email and reload after a change', () async {
      final cubit = TaskSharingCubit(
        repository: sharing,
        wsId: 'ws-1',
        taskId: 'task-1',
      );
      await cubit.load();
      expect(cubit.shareUrl, 'https://tasks.test/shared/task/abc123');

      expect(await cubit.addPerson('not-an-email'), CollabFailure.invalid);
      expect(sharing.calls, isEmpty);
      expect(await cubit.addPerson(' guest@example.com '), isNull);
      expect(cubit.state.shares.single.email, 'guest@example.com');

      expect(await cubit.revokeLink(), isNull);
      expect(cubit.shareUrl, 'https://tasks.test/shared/task/fresh9');
    });

    test('board public link turns on and off', () async {
      final cubit = BoardSharingCubit(
        repository: sharing,
        wsId: 'ws-1',
        boardId: 'board-1',
        locale: 'en',
      );
      await cubit.load();
      expect(cubit.publicUrl, isNull);

      expect(await cubit.enablePublicLink(), isNull);
      expect(
        cubit.publicUrl,
        'https://tasks.test/en/shared/task-boards/board7',
      );
      expect(await cubit.disablePublicLink(), isNull);
      expect(cubit.publicUrl, isNull);
    });

    test('a refused change leaves the sheet usable', () async {
      final cubit = BoardSharingCubit(
        repository: sharing,
        wsId: 'ws-1',
        boardId: 'board-1',
        locale: 'en',
      );
      await cubit.load();
      sharing.failWrite = forbidden;
      expect(
        await cubit.addGuest('guest@example.com', SharePermission.edit),
        CollabFailure.forbidden,
      );
      expect(cubit.state.busy, isFalse);
      expect(cubit.state.shares, isEmpty);
    });
  });
}
