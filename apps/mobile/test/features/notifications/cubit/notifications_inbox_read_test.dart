import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/notifications_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/data/notifications_unread_count.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements NotificationsRepository {}

AppNotification _item(String id, {bool unread = true}) => AppNotification(
  id: id,
  userId: 'synthetic-user',
  type: 'task_assigned',
  title: 'Synthetic $id',
  data: const {'board_id': 'synthetic-board'},
  entityType: 'task',
  entityId: 'task-$id',
  readAt: unread ? null : DateTime(2026, 11, 18),
  createdAt: DateTime(2026, 11, 19, 8),
);

NotificationsPage _page(List<AppNotification> items) => NotificationsPage(
  notifications: items,
  count: items.length,
  limit: 20,
  offset: 0,
);

void main() {
  const team = Workspace(id: 'synthetic-team', name: 'Demo Team');
  late _Repository repository;
  late NotificationsCubit cubit;

  void stubFeed(Future<NotificationsPage> Function() page) => when(
    () => repository.fetchNotifications(
      wsId: any(named: 'wsId'),
      unreadOnly: any(named: 'unreadOnly'),
      readOnly: any(named: 'readOnly'),
      limit: any(named: 'limit'),
      offset: any(named: 'offset'),
    ),
  ).thenAnswer((_) => page());

  setUp(() {
    NotificationsUnreadCount.instance.reset();
    repository = _Repository();
    cubit = NotificationsCubit(
      notificationsRepository: repository,
      currentUserId: () => 'synthetic-user',
    );
  });

  tearDown(() async {
    if (!cubit.isClosed) await cubit.close();
  });

  test('the All feed asks for read and unread rows together', () async {
    when(
      () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
    ).thenAnswer((_) async => 1);
    stubFeed(() async => _page([_item('a'), _item('b', unread: false)]));

    await cubit.setWorkspace(team);
    await cubit.loadTab(NotificationsTab.all);

    verify(
      () => repository.fetchNotifications(wsId: 'synthetic-team'),
    ).called(1);
    expect(cubit.state.all.items.map((item) => item.id), ['a', 'b']);
    expect(cubit.state.inbox.hasLoadedOnce, isFalse);
  });

  test(
    'a read shows on the row and badge before the server confirms',
    () async {
      final write = Completer<void>();
      var counts = [2, 1];
      when(
        () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
      ).thenAnswer((_) async {
        final next = counts.first;
        if (counts.length > 1) counts = counts.sublist(1);
        return next;
      });
      stubFeed(() async => _page([_item('a'), _item('b')]));
      when(
        () => repository.markRead(id: 'a', read: true),
      ).thenAnswer((_) => write.future);

      await cubit.setWorkspace(team);
      await cubit.loadTab(NotificationsTab.all);
      expect(NotificationsUnreadCount.instance.value, 2);

      final pending = cubit.toggleRead(cubit.state.all.items.first);
      await Future<void>.delayed(Duration.zero);
      expect(cubit.state.all.items.first.isUnread, isFalse);
      expect(cubit.state.unreadCount, 1);
      expect(NotificationsUnreadCount.instance.value, 1);

      write.complete();
      await pending;
      expect(NotificationsUnreadCount.instance.value, 1);
    },
  );

  test('a failed read restores the row and the badge', () async {
    when(
      () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
    ).thenAnswer((_) async => 1);
    stubFeed(() async => _page([_item('a')]));
    when(
      () => repository.markRead(id: 'a', read: true),
    ).thenThrow(Exception('synthetic-failure'));

    await cubit.setWorkspace(team);
    await cubit.loadTab(NotificationsTab.all);

    await expectLater(
      cubit.toggleRead(cubit.state.all.items.first),
      throwsException,
    );
    expect(cubit.state.all.items.first.isUnread, isTrue);
    expect(cubit.state.unreadCount, 1);
    expect(NotificationsUnreadCount.instance.value, 1);
    expect(cubit.state.pendingIds, isEmpty);
  });

  test('mark all read refreshes the feed and clears the badge', () async {
    var allRead = false;
    when(
      () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
    ).thenAnswer((_) async => allRead ? 0 : 2);
    stubFeed(
      () async => allRead
          ? _page([_item('a', unread: false), _item('b', unread: false)])
          : _page([_item('a'), _item('b')]),
    );
    when(
      () => repository.markAllRead(wsId: 'synthetic-team'),
    ).thenAnswer((_) async => allRead = true);

    await cubit.setWorkspace(team);
    await cubit.loadTab(NotificationsTab.all);
    expect(NotificationsUnreadCount.instance.value, 2);

    await cubit.markAllRead();

    verify(() => repository.markAllRead(wsId: 'synthetic-team')).called(1);
    expect(cubit.state.all.items.every((item) => !item.isUnread), isTrue);
    expect(cubit.state.unreadCount, 0);
    expect(NotificationsUnreadCount.instance.value, 0);
    expect(cubit.state.isArchivingAll, isFalse);
  });

  for (final (name, error, offline) in [
    (
      'transport',
      const ApiException.transport(message: 'synthetic-offline'),
      true,
    ),
    ('server', Exception('synthetic-server'), false),
  ]) {
    test('a $name failure marks the feed offline=$offline', () async {
      when(
        () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
      ).thenAnswer((_) async => 0);
      stubFeed(() async => throw error);

      await cubit.setWorkspace(team);
      await cubit.loadTab(NotificationsTab.all);

      expect(cubit.state.all.status, NotificationFeedStatus.error);
      expect(cubit.state.all.isOffline, offline);
    });
  }
}
