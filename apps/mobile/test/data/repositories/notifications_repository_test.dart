import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/notifications_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  setUpAll(() {
    registerFallbackValue(<String, dynamic>{});
  });

  group('NotificationsRepository', () {
    late _MockApiClient apiClient;
    late NotificationsRepository repository;

    setUp(() {
      apiClient = _MockApiClient();
      repository = NotificationsRepository(apiClient: apiClient);
    });

    test(
      'fetchNotifications parses page and includes workspace scope',
      () async {
        when(
          () => apiClient.getJson(
            '/api/v1/notifications?limit=30&offset=10&unreadOnly=false&readOnly=true&wsId=ws_1',
          ),
        ).thenAnswer(
          (_) async => {
            'notifications': [
              {
                'id': 'notif_1',
                'user_id': 'user_1',
                'type': 'task_assigned',
                'title': 'Task assigned',
                'description': 'A task was assigned to you',
                'data': {
                  'workspace_id': 'ws_1',
                  'workspace_name': 'Product',
                  'board_id': 'board_1',
                },
                'entity_type': 'task',
                'entity_id': 'task_1',
                'created_at': '2026-03-25T10:00:00.000Z',
              },
            ],
            'count': 1,
            'limit': 30,
            'offset': 10,
          },
        );

        final page = await repository.fetchNotifications(
          wsId: 'ws_1',
          readOnly: true,
          limit: 30,
          offset: 10,
        );

        expect(page.count, 1);
        expect(page.limit, 30);
        expect(page.offset, 10);
        expect(page.notifications, hasLength(1));
        expect(page.notifications.first.workspaceId, 'ws_1');
        expect(page.notifications.first.workspaceName, 'Product');
        verify(
          () => apiClient.getJson(
            '/api/v1/notifications?limit=30&offset=10&unreadOnly=false&readOnly=true&wsId=ws_1',
          ),
        ).called(1);
      },
    );

    test('fetchNotifications omits wsId for personal scope', () async {
      when(
        () => apiClient.getJson(
          '/api/v1/notifications?limit=20&offset=0&unreadOnly=true&readOnly=false',
        ),
      ).thenAnswer(
        (_) async => {
          'notifications': const <Map<String, dynamic>>[],
          'count': 0,
          'limit': 20,
          'offset': 0,
        },
      );

      await repository.fetchNotifications(unreadOnly: true);

      verify(
        () => apiClient.getJson(
          '/api/v1/notifications?limit=20&offset=0&unreadOnly=true&readOnly=false',
        ),
      ).called(1);
    });

    test('fetchUnreadCount omits wsId for personal scope', () async {
      when(
        () => apiClient.getJson('/api/v1/notifications/unread-count'),
      ).thenAnswer((_) async => {'count': 7});

      final count = await repository.fetchUnreadCount();

      expect(count, 7);
      verify(
        () => apiClient.getJson('/api/v1/notifications/unread-count'),
      ).called(1);
    });

    test('markRead sends read payload to item endpoint', () async {
      when(
        () => apiClient.patchJson(any(), any()),
      ).thenAnswer((_) async => {'success': true});

      await repository.markRead(id: 'notif_1', read: true);

      verify(
        () => apiClient.patchJson(
          '/api/v1/notifications/notif_1',
          {'read': true},
        ),
      ).called(1);
    });

    test('markAllRead sends bulk action with workspace scope', () async {
      when(
        () => apiClient.patchJson(any(), any()),
      ).thenAnswer((_) async => {'success': true});

      await repository.markAllRead(wsId: 'ws_1');

      verify(
        () => apiClient.patchJson('/api/v1/notifications', {
          'action': 'mark_all_read',
          'wsId': 'ws_1',
        }),
      ).called(1);
    });

    test('invite actions and metadata updates hit web api endpoints', () async {
      when(
        () => apiClient.patchJson(any(), any()),
      ).thenAnswer((_) async => {'success': true});
      when(
        () => apiClient.postJson(any(), any()),
      ).thenAnswer((_) async => {'success': true});

      await repository.acceptWorkspaceInvite('ws_1');
      await repository.declineWorkspaceInvite('ws_1');
      await repository.updateMetadata(
        id: 'notif_1',
        metadata: const {
          'action_taken': 'accepted',
        },
      );

      verify(
        () => apiClient.postJson(
          '/api/workspaces/ws_1/accept-invite',
          const {},
        ),
      ).called(1);
      verify(
        () => apiClient.postJson(
          '/api/workspaces/ws_1/decline-invite',
          const {},
        ),
      ).called(1);
      verify(
        () => apiClient.patchJson(
          '/api/v1/notifications/notif_1/metadata',
          const {'action_taken': 'accepted'},
        ),
      ).called(1);
    });
  });
}
