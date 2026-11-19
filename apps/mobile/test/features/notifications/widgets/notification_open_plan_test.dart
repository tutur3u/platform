import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/notifications/widgets/notification_open_plan.dart';

const _team = Workspace(id: 'synthetic-team', name: 'Demo Team');
const _other = Workspace(id: 'synthetic-other', name: 'Demo Other');

AppNotification _item({
  String type = 'system',
  String? entityType,
  String? entityId,
  Map<String, dynamic> data = const {},
}) => AppNotification(
  id: 'synthetic-notification',
  userId: 'synthetic-user',
  type: type,
  title: 'Synthetic',
  data: data,
  entityType: entityType,
  entityId: entityId,
  createdAt: DateTime(2026, 11, 19),
);

NotificationOpenPlan _plan(AppNotification item) => planNotificationOpen(
  item,
  workspaces: const [_team, _other],
  currentWorkspaceId: _team.id,
);

String _location(NotificationOpenPlan plan) =>
    (plan as NotificationNavigate).location;

void main() {
  test('routes each supported target to its screen', () {
    expect(
      _location(
        _plan(
          _item(
            type: 'task_assigned',
            entityType: 'task',
            entityId: 'task-1',
            data: const {'board_id': 'board-1'},
          ),
        ),
      ),
      '/tasks/boards/board-1?taskId=task-1',
    );
    expect(
      _location(_plan(_item(entityType: 'event', entityId: 'event-1'))),
      '/calendar/event-1',
    );
    expect(
      _location(
        _plan(
          _item(
            entityType: 'chat_conversation',
            entityId: 'message-1',
            data: const {'conversation_id': 'conversation-1'},
          ),
        ),
      ),
      '/chat?conversationId=conversation-1',
    );
    expect(
      _location(_plan(_item(entityType: 'transaction', entityId: 'tx-1'))),
      '/finance/transactions?transactionId=tx-1',
    );
    expect(
      _location(
        _plan(_item(entityType: 'time_tracking_request', entityId: 'req-1')),
      ),
      startsWith('/timer/requests'),
    );
  });

  test('switches workspace before opening a target elsewhere', () {
    final plan = _plan(
      _item(
        entityType: 'event',
        entityId: 'event-1',
        data: const {'workspace_id': 'synthetic-other'},
      ),
    );
    expect(plan, isA<NotificationNavigate>());
    expect((plan as NotificationNavigate).switchTo, _other);
  });

  test('a target in a workspace the user left falls back to details', () {
    final plan = _plan(
      _item(
        entityType: 'event',
        entityId: 'event-1',
        data: const {'workspace_id': 'synthetic-gone'},
      ),
    );
    expect(plan, isA<NotificationShowDetails>());
    expect((plan as NotificationShowDetails).targetUnavailable, isTrue);
  });

  test('a task without its board falls back to details', () {
    final plan = _plan(
      _item(type: 'task_assigned', entityType: 'task', entityId: 'task-1'),
    );
    expect((plan as NotificationShowDetails).targetUnavailable, isTrue);
  });

  test('announcements and invites open their own details', () {
    for (final item in [
      _item(type: 'system_announcement'),
      _item(type: 'workspace_invite', entityType: 'workspace_invite'),
    ]) {
      final plan = _plan(item);
      expect(plan, isA<NotificationShowDetails>(), reason: item.type);
      expect(
        (plan as NotificationShowDetails).targetUnavailable,
        isFalse,
        reason: item.type,
      );
    }
  });
}
