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
    const teamWorkspace = Workspace(
      id: 'team_ws',
      name: 'Team',
    );

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
      await cubit.close();
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
          data: const {
            'workspace_id': 'team_ws',
            'workspace_name': 'Team',
          },
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
  });
}
