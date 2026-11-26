import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/collaboration/data/task_collaboration_repository.dart';
import 'package:mobile/features/tasks_boards/collaboration/data/task_sharing_repository.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_collaboration_models.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_sharing_models.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_snapshot.dart';
import 'package:mocktail/mocktail.dart';

import 'collab_fakes.dart';

const _task = '/api/v1/workspaces/ws-1/tasks/task-1';

void main() {
  late MockApiClient api;
  setUp(() {
    api = MockApiClient();
    when(() => api.postJson(any(), any())).thenAnswer((_) async => {});
    when(() => api.patchJson(any(), any())).thenAnswer((_) async => {});
    when(() => api.deleteJson(any())).thenAnswer((_) async => {});
  });

  group('TaskCollaborationRepository', () {
    late TaskCollaborationRepository repository;
    setUp(() => repository = TaskCollaborationRepository(apiClient: api));

    test('reads comments with their author and edit time', () async {
      when(() => api.getJson('$_task/comments?limit=100')).thenAnswer(
        (_) async => {
          'comments': [
            {
              'id': 'c1',
              'body': 'Looks **good**',
              'author': {'id': 'ada', 'display_name': 'Ada'},
              'created_at': '2026-11-20T09:30:00Z',
              'edited_at': '2026-11-20T10:00:00Z',
            },
            {
              'id': 'c2',
              'body': 'Imported',
              'author': null,
              'external_author': 'octocat',
            },
          ],
          'nextCursor': null,
        },
      );

      final comments = await repository.listComments('ws-1', 'task-1');

      expect(comments.first.author?.displayName, 'Ada');
      expect(comments.first.editedAt, isNotNull);
      expect(comments.last.author, isNull);
      expect(comments.last.externalAuthor, 'octocat');
    });

    test('writes go to the comment, link and revert routes', () async {
      when(() => api.postJson('$_task/comments', any())).thenAnswer(
        (_) async => {
          'comment': {'id': 'c3', 'body': 'Hi'},
        },
      );
      when(() => api.patchJson('$_task/comments/c3', any())).thenAnswer(
        (_) async => {
          'comment': {'id': 'c3', 'body': 'Hey'},
        },
      );
      when(() => api.postJson('$_task/links', any())).thenAnswer(
        (_) async => {
          'link': {
            'id': 'l1',
            'url': 'https://github.com/o/r/pull/7',
            'kind': 'pull_request',
            'external_id': '7',
            'state': 'merged',
          },
        },
      );

      await repository.addComment('ws-1', 'task-1', 'Hi');
      await repository.editComment('ws-1', 'task-1', 'c3', 'Hey');
      await repository.deleteComment('ws-1', 'task-1', 'c3');
      final link = await repository.addLink(
        'ws-1',
        'task-1',
        'https://github.com/o/r/pull/7',
      );
      await repository.removeLink('ws-1', 'task-1', 'l1');
      await repository.revert('ws-1', 'task-1', 'h1', const [
        TaskRevertField.name,
        TaskRevertField.assignees,
      ]);

      expect(link.kind, TaskLinkKind.pullRequest);
      expect(link.label, '#7');
      expect(link.state, TaskLinkState.merged);
      verify(() => api.postJson('$_task/comments', {'body': 'Hi'})).called(1);
      verify(
        () => api.patchJson('$_task/comments/c3', {'body': 'Hey'}),
      ).called(1);
      verify(() => api.deleteJson('$_task/comments/c3')).called(1);
      verify(() => api.deleteJson('$_task/links/l1')).called(1);
      verify(
        () => api.postJson('$_task/revert', {
          'historyId': 'h1',
          'fields': ['name', 'assignees'],
        }),
      ).called(1);
    });

    test('a missing body object is a format error, not a crash', () async {
      when(
        () => api.postJson('$_task/comments', any()),
      ).thenAnswer((_) async => {});
      expect(
        repository.addComment('ws-1', 'task-1', 'Hi'),
        throwsA(isA<FormatException>()),
      );
    });

    test('pages the timeline by cursor', () async {
      when(() => api.getJson('$_task/timeline?limit=50')).thenAnswer(
        (_) async => {
          'events': [
            {
              'id': 'e1',
              'type': 'comment_added',
              'at': '2026-11-20T09:30:00Z',
              'comment': {'id': 'c1', 'body': 'First'},
            },
          ],
          'nextCursor': 'next',
        },
      );
      when(
        () => api.getJson('$_task/timeline?cursor=next&limit=50'),
      ).thenAnswer((_) async => {'events': <Object>[], 'nextCursor': null});

      final first = await repository.listTimeline('ws-1', 'task-1');
      final second = await repository.listTimeline(
        'ws-1',
        'task-1',
        cursor: first.nextCursor,
      );

      expect(first.items.single.comment?.body, 'First');
      expect(first.items.single.restorable, isFalse);
      expect(second.nextCursor, isNull);
    });
  });

  group('TaskSharingRepository', () {
    late TaskSharingRepository repository;
    setUp(
      () => repository = TaskSharingRepository(
        apiClient: api,
        shareOrigin: 'https://tasks.test/',
      ),
    );

    test('share addresses match the ones web copies', () {
      expect(
        repository.taskShareUrl('abc'),
        'https://tasks.test/shared/task/abc',
      );
      expect(
        repository.boardPublicUrl('b7', locale: 'vi'),
        'https://tasks.test/vi/shared/task-boards/b7',
      );
    });

    test('task link and invites use the share routes', () async {
      when(() => api.getJson('$_task/share-links')).thenAnswer(
        (_) async => {
          'shareLink': {
            'id': 'sl1',
            'code': 'abc',
            'public_access': 'view',
            'requires_invite': false,
          },
        },
      );
      when(() => api.patchJson('$_task/share-links', any())).thenAnswer(
        (_) async => {
          'shareLink': {'id': 'sl1', 'code': 'abc', 'requires_invite': true},
        },
      );

      final link = await repository.taskShareLink('ws-1', 'task-1');
      await repository.updateTaskShareLink(
        'ws-1',
        'task-1',
        requiresInvite: true,
      );
      await repository.revokeTaskShareLink('ws-1', 'task-1', 'sl1');
      await repository.addTaskShare('ws-1', 'task-1', 'guest@example.com');
      await repository.updateTaskShare(
        'ws-1',
        'task-1',
        's1',
        SharePermission.edit,
      );
      await repository.removeTaskShare('ws-1', 'task-1', 's1');

      expect(link.publicAccess, isTrue);
      verify(
        () => api.patchJson('$_task/share-links', {'requiresInvite': true}),
      ).called(1);
      verify(() => api.deleteJson('$_task/share-links?id=sl1')).called(1);
      verify(
        () => api.postJson('$_task/shares', {
          'email': 'guest@example.com',
          'permission': 'view',
        }),
      ).called(1);
      verify(
        () =>
            api.patchJson('$_task/shares', {'id': 's1', 'permission': 'edit'}),
      ).called(1);
      verify(() => api.deleteJson('$_task/shares?id=s1')).called(1);
    });

    test('board shares read their nested user', () async {
      const board = '/api/v1/workspaces/ws-1/task-boards/board-1';
      when(() => api.getJson('$board/shares')).thenAnswer(
        (_) async => {
          'shares': [
            {
              'id': 'g1',
              'permission': 'edit',
              'email': 'guest@example.com',
              'user': {'display_name': 'Guest'},
            },
          ],
        },
      );
      when(
        () => api.getJson('$board/public-link'),
      ).thenAnswer((_) async => {'publicLink': null});

      final shares = await repository.boardShares('ws-1', 'board-1');
      final link = await repository.boardPublicLink('ws-1', 'board-1');
      await repository.removeBoardShare('ws-1', 'board-1', 'g1');

      expect(shares.single.label, 'Guest');
      expect(shares.single.permission, SharePermission.edit);
      expect(link, isNull);
      verify(() => api.deleteJson('$board/shares?shareId=g1')).called(1);
    });
  });

  group('TaskSnapshot', () {
    TaskBoardTask task({
      String name = 'Ship it',
      String? description,
      List<String> assignees = const ['ada'],
    }) => TaskBoardTask(
      id: 'task-1',
      listId: 'list-1',
      name: name,
      description: description,
      priority: 'high',
      assigneeIds: assignees,
    );

    test('lists the fields that differ from the task now', () {
      final snapshot = TaskSnapshot.fromJson(const {
        'name': 'Draft',
        'description': {'type': 'doc', 'content': <Object>[]},
        'priority': 'high',
        'list_id': 'list-1',
        'assignees': [
          {'user_id': 'ada', 'display_name': 'Ada'},
          {'user_id': 'linh', 'display_name': 'Linh'},
        ],
      });

      expect(
        snapshot.changedFrom(task(description: '{"type":"doc","content":[]}')),
        [TaskRevertField.name, TaskRevertField.assignees],
      );
    });

    test('a description in another form but equal content is unchanged', () {
      final snapshot = TaskSnapshot.fromJson(const {
        'name': 'Ship it',
        'description': '{"content":[],"type":"doc"}',
        'priority': 'high',
        'assignees': [
          {'id': 'ada'},
        ],
      });
      expect(
        snapshot.changedFrom(task(description: '{"type":"doc","content":[]}')),
        isEmpty,
      );
    });
  });
}
