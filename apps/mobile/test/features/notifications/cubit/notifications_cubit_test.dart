import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/notifications_repository.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _MockNotificationsRepository extends Mock
    implements NotificationsRepository {}

void main() {
  setUpAll(() {
    registerFallbackValue(<String, dynamic>{});
  });

  group('NotificationsCubit', () {
    late _MockNotificationsRepository repository;
    late NotificationsCubit cubit;

    const personalWorkspace = Workspace(
      id: 'personal_ws',
      name: 'Personal',
      personal: true,
    );
    const teamWorkspace = Workspace(id: 'team_ws', name: 'Team');

    AppNotification buildNotification({
      required String id,
      bool unread = true,
      String type = 'task_assigned',
      Map<String, dynamic> data = const {},
    }) {
      return AppNotification(
        id: id,
        userId: 'user_1',
        type: type,
        title: 'Title $id',
        description: 'Description $id',
        data: data,
        entityType: type == 'workspace_invite' ? 'workspace_invite' : 'task',
        entityId: type == 'workspace_invite' ? null : 'task_$id',
        readAt: unread ? null : DateTime(2026, 3, 20),
        createdAt: DateTime(2026, 3, 25),
      );
    }

    setUp(() {
      repository = _MockNotificationsRepository();
      cubit = NotificationsCubit(notificationsRepository: repository);
    });

    tearDown(() async {
      if (!cubit.isClosed) {
        await cubit.close();
      }
    });

    test(
      'setWorkspace resets feeds and omits wsId for personal scope',
      () async {
        final teamNotification = buildNotification(id: 'notif_team');
        when(
          () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
        ).thenAnswer((invocation) async {
          final wsId = invocation.namedArguments[#wsId] as String?;
          return wsId == 'team_ws' ? 4 : 1;
        });
        when(
          () => repository.fetchNotifications(
            wsId: any(named: 'wsId'),
            unreadOnly: any(named: 'unreadOnly'),
            readOnly: any(named: 'readOnly'),
            limit: any(named: 'limit'),
            offset: any(named: 'offset'),
          ),
        ).thenAnswer(
          (_) async => NotificationsPage(
            notifications: [teamNotification],
            count: 1,
            limit: 20,
            offset: 0,
          ),
        );

        await cubit.setWorkspace(teamWorkspace);
        await cubit.loadTab(NotificationsTab.inbox);

        expect(cubit.state.scopeWorkspaceId, 'team_ws');
        expect(cubit.state.inbox.items, [teamNotification]);

        await cubit.setWorkspace(personalWorkspace);

        expect(cubit.state.scopeWorkspaceId, isNull);
        expect(cubit.state.unreadCount, 1);
        expect(cubit.state.inbox.items, isEmpty);
        expect(cubit.state.archive.items, isEmpty);
      },
    );

    test('loadTab keeps inbox and archive state separate', () async {
      final inboxNotification = buildNotification(id: 'notif_inbox');
      final archivedNotification = buildNotification(
        id: 'notif_archive',
        unread: false,
      );
      when(
        () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
      ).thenAnswer((_) async => 2);
      when(
        () => repository.fetchNotifications(
          wsId: any(named: 'wsId'),
          unreadOnly: any(named: 'unreadOnly'),
          readOnly: any(named: 'readOnly'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).thenAnswer((invocation) async {
        final readOnly = invocation.namedArguments[#readOnly] as bool? ?? false;
        return NotificationsPage(
          notifications: readOnly
              ? [archivedNotification]
              : [inboxNotification],
          count: 1,
          limit: 20,
          offset: 0,
        );
      });

      await cubit.setWorkspace(teamWorkspace);
      await cubit.loadTab(NotificationsTab.inbox);
      await cubit.loadTab(NotificationsTab.archive);

      expect(cubit.state.inbox.items, [inboxNotification]);
      expect(cubit.state.archive.items, [archivedNotification]);
    });

    test('toggleRead refreshes unread count and loaded tab data', () async {
      final notification = buildNotification(id: 'notif_1');
      var unreadCountCalls = 0;
      var notificationsCalls = 0;
      when(
        () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
      ).thenAnswer((_) async => unreadCountCalls++ == 0 ? 2 : 1);
      when(
        () => repository.fetchNotifications(
          wsId: any(named: 'wsId'),
          unreadOnly: any(named: 'unreadOnly'),
          readOnly: any(named: 'readOnly'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).thenAnswer((_) async {
        if (notificationsCalls++ == 0) {
          return NotificationsPage(
            notifications: [notification],
            count: 1,
            limit: 20,
            offset: 0,
          );
        }

        return const NotificationsPage(
          notifications: [],
          count: 0,
          limit: 20,
          offset: 0,
        );
      });
      when(
        () => repository.markRead(id: 'notif_1', read: true),
      ).thenAnswer((_) async {});

      await cubit.setWorkspace(teamWorkspace);
      await cubit.loadTab(NotificationsTab.inbox);
      await cubit.toggleRead(notification);

      expect(cubit.state.unreadCount, 1);
      expect(cubit.state.inbox.items, isEmpty);
      verify(() => repository.markRead(id: 'notif_1', read: true)).called(1);
    });

    test(
      'acceptInvite calls invite api, metadata patch, and refreshes state',
      () async {
        final inviteNotification = buildNotification(
          id: 'notif_invite',
          type: 'workspace_invite',
          data: const {'workspace_id': 'team_ws', 'workspace_name': 'Team'},
        );
        var unreadCountCalls = 0;
        var notificationCalls = 0;
        when(
          () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
        ).thenAnswer((_) async => unreadCountCalls++ == 0 ? 1 : 0);
        when(
          () => repository.fetchNotifications(
            wsId: any(named: 'wsId'),
            unreadOnly: any(named: 'unreadOnly'),
            readOnly: any(named: 'readOnly'),
            limit: any(named: 'limit'),
            offset: any(named: 'offset'),
          ),
        ).thenAnswer((_) async {
          if (notificationCalls++ == 0) {
            return NotificationsPage(
              notifications: [inviteNotification],
              count: 1,
              limit: 20,
              offset: 0,
            );
          }

          return const NotificationsPage(
            notifications: [],
            count: 0,
            limit: 20,
            offset: 0,
          );
        });
        when(
          () => repository.acceptWorkspaceInvite('team_ws'),
        ).thenAnswer((_) async {});
        when(
          () => repository.updateMetadata(
            id: 'notif_invite',
            metadata: any(named: 'metadata'),
          ),
        ).thenAnswer((_) async {});

        await cubit.setWorkspace(personalWorkspace);
        await cubit.loadTab(NotificationsTab.inbox);
        final workspaceId = await cubit.acceptInvite(inviteNotification);

        expect(workspaceId, 'team_ws');
        expect(cubit.state.unreadCount, 0);
        verify(() => repository.acceptWorkspaceInvite('team_ws')).called(1);
        verify(
          () => repository.updateMetadata(
            id: 'notif_invite',
            metadata: any(named: 'metadata'),
          ),
        ).called(1);
      },
    );

    test('concurrent badge refreshes share one awaitable request', () async {
      final response = Completer<int>();
      when(
        () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
      ).thenAnswer((_) => response.future);
      final first = cubit.refreshUnreadCount();
      final second = cubit.refreshUnreadCount();
      expect(identical(first, second), isTrue);
      verify(() => repository.fetchUnreadCount()).called(1);
      response.complete(3);
      await Future.wait([first, second]);
      expect(cubit.state.unreadCount, 3);
      expect(cubit.state.isUnreadCountLoading, isFalse);
      await cubit.refreshUnreadCount();
      verify(() => repository.fetchUnreadCount()).called(1);
    });
    test(
      'write refresh does not reuse a count requested before the write',
      () async {
        final beforeWrite = Completer<int>();
        var calls = 0;
        when(
          () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
        ).thenAnswer(
          (_) => ++calls == 1 ? beforeWrite.future : Future.value(0),
        );
        when(
          () => repository.markRead(id: 'read_me', read: true),
        ).thenAnswer((_) async {});
        when(
          () => repository.fetchNotifications(
            wsId: any(named: 'wsId'),
            unreadOnly: any(named: 'unreadOnly'),
            readOnly: any(named: 'readOnly'),
            limit: any(named: 'limit'),
            offset: any(named: 'offset'),
          ),
        ).thenAnswer(
          (_) async => const NotificationsPage(
            notifications: [],
            count: 0,
            limit: 20,
            offset: 0,
          ),
        );
        final refresh = cubit.refreshUnreadCount();
        final write = cubit.toggleRead(buildNotification(id: 'read_me'));
        beforeWrite.complete(1);
        await Future.wait([refresh, write]);
        expect(calls, 2);
        expect(cubit.state.unreadCount, 0);
      },
    );

    test('badge refresh failure releases the request for retry', () async {
      when(
        () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
      ).thenThrow(Exception('offline'));
      await cubit.refreshUnreadCount();
      expect(cubit.state.isUnreadCountLoading, isFalse);
      when(
        () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
      ).thenAnswer((_) async => 7);
      await cubit.refreshUnreadCount();
      expect(cubit.state.unreadCount, 7);
    });
    test('late old-scope badge and feed cannot replace new scope', () async {
      final oldCount = Completer<int>();
      final oldFeed = Completer<NotificationsPage>();
      when(
        () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
      ).thenAnswer(
        (invocation) => invocation.namedArguments[#wsId] == 'team_ws'
            ? oldCount.future
            : Future.value(2),
      );
      when(
        () => repository.fetchNotifications(
          wsId: any(named: 'wsId'),
          unreadOnly: any(named: 'unreadOnly'),
          readOnly: any(named: 'readOnly'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).thenAnswer((_) => oldFeed.future);
      final oldWorkspace = cubit.setWorkspace(teamWorkspace);
      final oldLoad = cubit.loadTab(NotificationsTab.inbox);
      await cubit.setWorkspace(personalWorkspace);
      oldCount.complete(99);
      oldFeed.complete(
        NotificationsPage(
          notifications: [buildNotification(id: 'private_team')],
          count: 1,
          limit: 20,
          offset: 0,
        ),
      );
      await Future.wait([oldWorkspace, oldLoad]);
      expect(cubit.state.scopeWorkspaceId, isNull);
      expect(cubit.state.unreadCount, 2);
      expect(cubit.state.inbox.items, isEmpty);
      expect(cubit.state.inbox.status, NotificationFeedStatus.initial);
    });

    test(
      'badge refresh replaces an old actor future and clears private feed',
      () async {
        await cubit.close();
        var actor = 'actor-a';
        cubit = NotificationsCubit(
          notificationsRepository: repository,
          currentUserId: () => actor,
          initialState: NotificationsState(
            scopeWorkspaceId: 'team_ws',
            unreadCount: 5,
            inbox: NotificationFeedState(
              items: [buildNotification(id: 'private')],
            ),
          ),
        );
        final oldCount = Completer<int>();
        final newCount = Completer<int>();
        when(() => repository.fetchUnreadCount(wsId: 'team_ws')).thenAnswer(
          (_) => actor == 'actor-a' ? oldCount.future : newCount.future,
        );
        final first = cubit.refreshUnreadCount();
        actor = 'actor-b';
        final second = cubit.refreshUnreadCount();
        expect(identical(first, second), isFalse);
        expect(cubit.state.unreadCount, 0);
        expect(cubit.state.inbox.items, isEmpty);
        expect(cubit.state.isUnreadCountLoading, isTrue);
        newCount.complete(2);
        await second;
        oldCount.complete(99);
        await first;
        expect(cubit.state.unreadCount, 2);
        expect(cubit.state.isUnreadCountLoading, isFalse);
      },
    );

    test(
      'same-workspace actor ABA cannot restore an old badge request',
      () async {
        await cubit.close();
        var actor = 'actor-a';
        cubit = NotificationsCubit(
          notificationsRepository: repository,
          currentUserId: () => actor,
        );
        final oldA = Completer<int>();
        final b = Completer<int>();
        final newA = Completer<int>();
        var request = 0;
        when(
          () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
        ).thenAnswer((_) => [oldA.future, b.future, newA.future][request++]);
        final first = cubit.refreshUnreadCount();
        actor = 'actor-b';
        final second = cubit.refreshUnreadCount();
        actor = 'actor-a';
        final third = cubit.refreshUnreadCount();
        oldA.complete(99);
        b.complete(88);
        await Future.wait([first, second]);
        expect(cubit.state.unreadCount, 0);
        expect(cubit.state.isUnreadCountLoading, isTrue);
        newA.complete(3);
        await third;
        expect(cubit.state.unreadCount, 3);
        expect(cubit.state.isUnreadCountLoading, isFalse);
        verify(
          () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
        ).called(3);
      },
    );

    test('refreshUnreadCount ignores completion after close', () async {
      final unreadCountCompleter = Completer<int>();
      when(
        () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
      ).thenAnswer((_) => unreadCountCompleter.future);

      final refresh = cubit.refreshUnreadCount();
      await Future<void>.delayed(Duration.zero);

      await cubit.close();
      unreadCountCompleter.complete(3);

      await expectLater(refresh, completes);
    });
  });
}
