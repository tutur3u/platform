import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/notifications_repository.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/data/notification_read_cleanup.dart';
import 'package:mobile/features/notifications/push/delivered_inbox_notifications.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements NotificationsRepository {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const actor = '00000000-0000-4000-8000-000000000001';
  const notificationId = '00000000-0000-4000-8000-000000000002';
  const channel = MethodChannel(DeliveredInboxNotifications.channelName);
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  final item = AppNotification(
    id: notificationId,
    userId: actor,
    type: 'system',
    title: 'Synthetic notification',
    data: const {},
    createdAt: DateTime(2026, 10, 7),
  );
  late _Repository repository;
  late NotificationsCubit cubit;
  late String currentActor;

  NotificationsPage page(List<AppNotification> items) => NotificationsPage(
    notifications: items,
    count: items.length,
    limit: 20,
    offset: 0,
  );

  setUp(() async {
    currentActor = actor;
    messenger.setMockMethodCallHandler(channel, (call) async {
      return switch (call.method) {
        'bindSession' => true,
        'snapshot' => {'token': 'synthetic-snapshot', 'count': 1},
        'dismissSnapshot' => 1,
        'discardSnapshot' => true,
        _ => throw UnsupportedError(call.method),
      };
    });
    await DeliveredInboxNotifications.instance.bindSession(actor);
    repository = _Repository();
    when(
      () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
    ).thenAnswer((_) async => 0);
    when(
      () => repository.markRead(
        id: any(named: 'id'),
        read: any(named: 'read'),
      ),
    ).thenAnswer((_) async {});
    when(
      () => repository.markAllRead(wsId: any(named: 'wsId')),
    ).thenAnswer((_) async {});
    cubit = NotificationsCubit(
      notificationsRepository: repository,
      currentUserId: () => currentActor,
      initialState: NotificationsState(
        // Keep badge unchanged to isolate the feed flight from cache writes.
        inbox: NotificationFeedState(
          status: NotificationFeedStatus.loaded,
          items: [item],
          totalCount: 2,
        ),
      ),
    );
  });

  tearDown(() async {
    await cubit.close();
    messenger.setMockMethodCallHandler(channel, null);
  });

  void fetch(Future<NotificationsPage> Function() response) {
    when(
      () => repository.fetchNotifications(
        wsId: any(named: 'wsId'),
        unreadOnly: any(named: 'unreadOnly'),
        readOnly: any(named: 'readOnly'),
        limit: any(named: 'limit'),
        offset: any(named: 'offset'),
      ),
    ).thenAnswer((_) => response());
  }

  for (final bulk in [false, true]) {
    testWidgets('accepted read awaits fresh held feed bulk=$bulk', (
      tester,
    ) async {
      await tester.runAsync(() async {
        await CacheStore.instance.init();
        final held = Completer<NotificationsPage>();
        var fetches = 0;
        fetch(() => ++fetches == 1 ? held.future : Future.value(page([])));
        final loading = cubit.loadTab(NotificationsTab.inbox, refresh: true);
        var accepted = false;
        if (bulk) {
          when(
            () => repository.markAllRead(wsId: any(named: 'wsId')),
          ).thenAnswer((_) async => accepted = true);
        } else {
          when(
            () => repository.markRead(id: notificationId, read: true),
          ).thenAnswer((_) async => accepted = true);
        }
        final staleFrames = <NotificationsState>[];
        final observed = cubit.stream.listen((state) {
          if (accepted &&
              state.inbox.status == NotificationFeedStatus.loaded &&
              state.inbox.items.isNotEmpty) {
            staleFrames.add(state);
          }
        });
        var finished = false;
        final read = (bulk ? cubit.markAllRead() : cubit.toggleRead(item)).then(
          (result) {
            finished = true;
            return result;
          },
        );
        await Future<void>.delayed(Duration.zero);
        final completedBeforeRelease = finished;
        held.complete(page([item]));
        await loading;
        final result = await read;
        await observed.cancel();
        expect(staleFrames, isEmpty);
        expect(completedBeforeRelease, isFalse);
        expect(result, NotificationReadResult.accepted);
        expect(fetches, 2);
        expect(cubit.state.inbox.items, isEmpty);
        expect(cubit.state.inbox.status, NotificationFeedStatus.loaded);
      });
    });

    testWidgets('post-write feed failure is retryable bulk=$bulk', (
      tester,
    ) async {
      await tester.runAsync(() async {
        await CacheStore.instance.init();
        final held = Completer<NotificationsPage>();
        var fetches = 0;
        fetch(() {
          fetches++;
          if (fetches == 1) return held.future;
          if (fetches == 2) {
            return Future.error(Exception('Synthetic retryable'));
          }
          return Future.value(page([]));
        });
        final loading = cubit.loadTab(NotificationsTab.inbox, refresh: true);
        final read = bulk ? cubit.markAllRead() : cubit.toggleRead(item);
        await Future<void>.delayed(Duration.zero);
        held.completeError(Exception('Synthetic pre-write failure'));
        await loading;
        expect(await read, NotificationReadResult.acceptedRefreshUnavailable);
        expect(fetches, 2);
        await cubit.loadTab(NotificationsTab.inbox, refresh: true);
        expect(fetches, 3);
        expect(cubit.state.inbox.items, isEmpty);
        expect(cubit.state.inbox.status, NotificationFeedStatus.loaded);
        if (bulk) {
          verify(
            () => repository.markAllRead(wsId: any(named: 'wsId')),
          ).called(1);
        } else {
          verify(
            () => repository.markRead(id: notificationId, read: true),
          ).called(1);
        }
      });
    });

    for (final workspaceChange in [false, true]) {
      testWidgets('queued post-write refresh denies ABA bulk=$bulk '
          'workspace=$workspaceChange', (tester) async {
        await tester.runAsync(() async {
          await CacheStore.instance.init();
          final held = Completer<NotificationsPage>();
          var fetches = 0;
          fetch(() {
            fetches++;
            return held.future;
          });
          final loading = cubit.loadTab(NotificationsTab.inbox, refresh: true);
          final read = bulk ? cubit.markAllRead() : cubit.toggleRead(item);
          await Future<void>.delayed(Duration.zero);
          if (workspaceChange) {
            await cubit.setWorkspace(
              const Workspace(id: 'other', name: 'Other'),
            );
            await cubit.setWorkspace(null);
          } else {
            currentActor = '00000000-0000-4000-8000-000000000003';
            await cubit.setWorkspace(null);
            currentActor = actor;
            await cubit.setWorkspace(null);
          }
          held.complete(page([item]));
          await loading;
          expect(await read, NotificationReadResult.acceptedScopeChanged);
          expect(fetches, 1);
          expect(cubit.state.inbox.items, isEmpty);
        });
      });
    }

    testWidgets('current normal feed failure remains truthful bulk=$bulk', (
      tester,
    ) async {
      await tester.runAsync(() async {
        await CacheStore.instance.init();
        fetch(() async => throw Exception('Synthetic unavailable'));
        final result = await (bulk
            ? cubit.markAllRead()
            : cubit.toggleRead(item));
        expect(result, NotificationReadResult.acceptedRefreshUnavailable);
        expect(cubit.state.inbox.status, NotificationFeedStatus.error);
      });
    });
  }

  for (final bulk in [false, true]) {
    for (final fail in [false, true]) {
      testWidgets(
        'held pagination cannot restore read feed bulk=$bulk fail=$fail',
        (tester) async {
          await tester.runAsync(() async {
            await CacheStore.instance.init();
            final held = Completer<NotificationsPage>();
            when(
              () => repository.fetchNotifications(
                wsId: any(named: 'wsId'),
                unreadOnly: any(named: 'unreadOnly'),
                readOnly: any(named: 'readOnly'),
                limit: any(named: 'limit'),
                offset: any(named: 'offset'),
              ),
            ).thenAnswer(
              (call) => (call.namedArguments[#offset] as int? ?? 0) > 0
                  ? held.future
                  : Future.value(page([])),
            );
            final loading = cubit.loadMore(NotificationsTab.inbox);
            expect(cubit.state.inbox.isLoadingMore, isTrue);
            final result = await (bulk
                ? cubit.markAllRead()
                : cubit.toggleRead(item));
            expect(result, NotificationReadResult.accepted);
            expect(cubit.state.inbox.items, isEmpty);
            final staleFrames = <NotificationsState>[];
            final observed = cubit.stream.listen((state) {
              if (state.inbox.items.isNotEmpty ||
                  state.inbox.status == NotificationFeedStatus.error) {
                staleFrames.add(state);
              }
            });
            if (fail) {
              held.completeError(Exception('Synthetic old pagination failure'));
            } else {
              held.complete(page([item]));
            }
            await loading;
            await observed.cancel();
            expect(staleFrames, isEmpty);
            expect(cubit.state.inbox.items, isEmpty);
            expect(cubit.state.inbox.status, NotificationFeedStatus.loaded);
            expect(cubit.state.inbox.isLoadingMore, isFalse);
          });
        },
      );
    }
  }

  for (final workspaceChange in [false, true]) {
    testWidgets('held pagination departure ABA workspace=$workspaceChange', (
      tester,
    ) async {
      await tester.runAsync(() async {
        await CacheStore.instance.init();
        final held = Completer<NotificationsPage>();
        fetch(() => held.future);
        final loading = cubit.loadMore(NotificationsTab.inbox);
        expect(cubit.state.inbox.isLoadingMore, isTrue);
        if (workspaceChange) {
          await cubit.setWorkspace(const Workspace(id: 'other', name: 'Other'));
          await cubit.setWorkspace(null);
        } else {
          currentActor = '00000000-0000-4000-8000-000000000003';
          await cubit.setWorkspace(null);
          currentActor = actor;
          await cubit.setWorkspace(null);
        }
        held.complete(page([item]));
        await loading;
        expect(cubit.state.inbox.items, isEmpty);
        expect(cubit.state.inbox.isLoadingMore, isFalse);
      });
    });
  }

  for (final workspaceChange in [false, true]) {
    testWidgets('held read feed departure ABA workspace=$workspaceChange', (
      tester,
    ) async {
      await tester.runAsync(() async {
        await CacheStore.instance.init();
        final held = Completer<NotificationsPage>();
        final write = Completer<void>();
        var fetches = 0;
        fetch(() {
          fetches++;
          return held.future;
        });
        when(
          () => repository.markRead(id: notificationId, read: true),
        ).thenAnswer((_) => write.future);
        final loading = cubit.loadTab(NotificationsTab.inbox, refresh: true);
        final read = cubit.toggleRead(item);
        await Future<void>.delayed(Duration.zero);
        if (workspaceChange) {
          await cubit.setWorkspace(const Workspace(id: 'other', name: 'Other'));
          await cubit.setWorkspace(null);
        } else {
          currentActor = '00000000-0000-4000-8000-000000000003';
          await cubit.setWorkspace(null);
          currentActor = actor;
          await cubit.setWorkspace(null);
        }
        held.complete(page([item]));
        write.complete();
        await loading;
        expect(await read, NotificationReadResult.acceptedScopeChanged);
        expect(fetches, 1);
        expect(cubit.state.inbox.items, isEmpty);
      });
    });
  }
}
