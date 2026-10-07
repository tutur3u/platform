import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/notifications_repository.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/data/archive_opened_notification.dart';
import 'package:mobile/features/notifications/data/notification_read_cleanup.dart';
import 'package:mobile/features/notifications/push/delivered_inbox_notifications.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/notifications/widgets/notifications_sheet.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/helpers.dart';

class _Repository extends Mock implements NotificationsRepository {}

const actor = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel(DeliveredInboxNotifications.channelName);
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  late _Repository repository;
  late NotificationsCubit cubit;
  late List<MethodCall> nativeCalls;
  late String? currentActor;
  Future<Object?> Function(MethodCall)? platformOverride;
  AppNotification item({bool unread = true}) => AppNotification(
    id: id,
    userId: actor,
    type: 'system',
    title: 'Synthetic notification',
    data: const {},
    createdAt: DateTime(2026, 10, 7),
    readAt: unread ? null : DateTime(2026, 10, 7),
  );
  setUp(() async {
    nativeCalls = [];
    currentActor = actor;
    platformOverride = null;
    messenger.setMockMethodCallHandler(channel, (call) async {
      nativeCalls.add(call);
      final custom = platformOverride;
      if (custom != null) return await custom(call);
      return switch (call.method) {
        'bindSession' => true,
        'snapshot' => {'token': 'synthetic-deliveries', 'count': 27},
        'dismissSnapshot' => 27,
        'discardSnapshot' => true,
        _ => throw UnsupportedError(call.method),
      };
    });
    await DeliveredInboxNotifications.instance.bindSession(actor);
    nativeCalls.clear();
    repository = _Repository();
    when(
      () => repository.markRead(
        id: any(named: 'id'),
        read: any(named: 'read'),
      ),
    ).thenAnswer((_) async {});
    when(
      () => repository.markAllRead(wsId: any(named: 'wsId')),
    ).thenAnswer((_) async {});
    when(
      () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
    ).thenAnswer((_) async => 1);
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
        notifications: [item()],
        count: 1,
        limit: 20,
        offset: 0,
      ),
    );
    cubit = NotificationsCubit(
      notificationsRepository: repository,
      currentUserId: () => currentActor,
      initialState: NotificationsState(
        unreadCount: 1,
        inbox: NotificationFeedState(
          status: NotificationFeedStatus.loaded,
          items: [item()],
          totalCount: 1,
        ),
      ),
    );
  });
  tearDown(() async {
    if (!cubit.isClosed) await cubit.close();
    messenger.setMockMethodCallHandler(channel, null);
  });

  Future<void> mount(WidgetTester tester) => tester.pumpApp(
    BlocProvider.value(
      value: cubit,
      child: Scaffold(
        body: Builder(
          builder: (context) =>
              NotificationsView(parentContext: context, pageMode: false),
        ),
      ),
    ),
  );

  Future<void> mountReady(WidgetTester tester) async {
    await tester.runAsync(() async {
      await CacheStore.instance.init();
      await mount(tester);
      await cubit.refreshUnreadCount();
      await CacheStore.instance.remove(
        const CacheKey(namespace: 'synthetic.notification-test-barrier'),
      );
    });
    addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'actual inbox mark-read button snapshots and dismisses delivered ID',
    (tester) async {
      await mountReady(tester);
      await tester.runAsync(() async {
        final completed = cubit.stream.firstWhere(
          (state) => state.pendingIds.isEmpty,
        );
        await tester.tap(find.byTooltip('Mark as read'));
        await completed;
      });
      await tester.pumpAndSettle();
      verify(() => repository.markRead(id: id, read: true)).called(1);
      expect(nativeCalls.map((call) => call.method), [
        'snapshot',
        'dismissSnapshot',
      ]);
      final args = nativeCalls.first.arguments as Map<Object?, Object?>;
      expect(args['notificationId'], id);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'mounted actual Cubit mark-all targets delivered snapshot beyond feed page',
    (tester) async {
      await mountReady(tester);
      await tester.runAsync(cubit.markAllRead);
      await tester.pumpAndSettle();
      verify(() => repository.markAllRead()).called(1);
      expect(nativeCalls.map((call) => call.method), [
        'snapshot',
        'dismissSnapshot',
      ]);
      final args = nativeCalls.first.arguments as Map<Object?, Object?>;
      expect(args['scope'], 'allActor');
      expect(args['notificationId'], isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  test(
    'actual opened archive helper also removes captured delivered notification',
    () async {
      await archiveOpenedNotification(
        id,
        notificationsRepository: repository,
        currentUserId: () => currentActor,
      );
      verify(() => repository.markRead(id: id, read: true)).called(1);
      expect(nativeCalls.map((call) => call.method), [
        'snapshot',
        'dismissSnapshot',
      ]);
    },
  );

  test('unread transition never dismisses OS notification', () async {
    await cubit.toggleRead(item(unread: false));
    verify(() => repository.markRead(id: id, read: false)).called(1);
    expect(nativeCalls, isEmpty);
  });

  test('rejected actual read never dispatches OS removal', () async {
    when(
      () => repository.markRead(id: id, read: true),
    ).thenThrow(const FormatException('Synthetic rejected read'));
    await expectLater(cubit.toggleRead(item()), throwsFormatException);
    expect(
      nativeCalls.any((call) => call.method == 'dismissSnapshot'),
      isFalse,
    );
  });

  testWidgets('held read actor ABA cannot dismiss or refresh a new session', (
    tester,
  ) async {
    await mountReady(tester);
    clearInteractions(repository);
    late Completer<void> started;
    late Completer<void> held;
    when(() => repository.markAllRead(wsId: any(named: 'wsId'))).thenAnswer((
      _,
    ) {
      started.complete();
      return held.future;
    });
    await tester.runAsync(() async {
      started = Completer<void>();
      held = Completer<void>();
      final write = cubit.markAllRead();
      await started.future.timeout(const Duration(seconds: 2));
      expect(nativeCalls.last.method, 'snapshot');
      currentActor = '00000000-0000-4000-8000-000000000003';
      await DeliveredInboxNotifications.instance.bindSession(currentActor);
      currentActor = actor;
      await DeliveredInboxNotifications.instance.bindSession(actor);
      held.complete();
      expect(await write, NotificationReadResult.acceptedScopeChanged);
    });
    verifyNever(() => repository.fetchUnreadCount(wsId: any(named: 'wsId')));
    expect(nativeCalls.any((c) => c.method == 'dismissSnapshot'), isFalse);
    expect(cubit.state.isArchivingAll, isFalse);
  });

  testWidgets('held read workspace ABA preserves current scope and feed', (
    tester,
  ) async {
    await mountReady(tester);
    late Completer<void> started;
    late Completer<void> held;
    when(() => repository.markRead(id: id, read: true)).thenAnswer((_) {
      started.complete();
      return held.future;
    });
    await tester.runAsync(() async {
      started = Completer<void>();
      held = Completer<void>();
      final write = cubit.toggleRead(item());
      await started.future.timeout(const Duration(seconds: 2));
      await cubit.setWorkspace(
        const Workspace(
          id: '00000000-0000-4000-8000-000000000004',
          name: 'Synthetic team',
        ),
      );
      await tester.pump();
      await CacheStore.instance.remove(
        const CacheKey(namespace: 'synthetic.notification-test-barrier'),
      );
      await cubit.setWorkspace(null);
      await tester.pump();
      await CacheStore.instance.remove(
        const CacheKey(namespace: 'synthetic.notification-test-barrier'),
      );
      final currentState = cubit.state;
      clearInteractions(repository);
      held.complete();
      expect(await write, NotificationReadResult.acceptedScopeChanged);
      expect(cubit.state, currentState);
    });
    verifyNever(() => repository.fetchUnreadCount(wsId: any(named: 'wsId')));
    expect(nativeCalls.any((c) => c.method == 'dismissSnapshot'), isFalse);
  });

  testWidgets('closing actual Cubit during held read skips publication', (
    tester,
  ) async {
    await mountReady(tester);
    late Completer<void> started;
    late Completer<void> held;
    when(() => repository.markAllRead(wsId: any(named: 'wsId'))).thenAnswer((
      _,
    ) {
      started.complete();
      return held.future;
    });
    await tester.runAsync(() async {
      started = Completer<void>();
      held = Completer<void>();
      final write = cubit.markAllRead();
      await started.future.timeout(const Duration(seconds: 2));
      await cubit.close();
      held.complete();
      expect(await write, NotificationReadResult.acceptedScopeChanged);
    });
    expect(nativeCalls.any((c) => c.method == 'dismissSnapshot'), isFalse);
  });

  test('snapshot held across actor ABA refuses actual read dispatch', () async {
    final held = Completer<Object?>();
    final entered = Completer<void>();
    platformOverride = (call) async {
      if (call.method == 'snapshot') {
        entered.complete();
        return await held.future;
      }
      return true;
    };
    final write = cubit.markAllRead();
    await entered.future.timeout(const Duration(seconds: 2));
    currentActor = '00000000-0000-4000-8000-000000000003';
    await DeliveredInboxNotifications.instance.bindSession(currentActor);
    currentActor = actor;
    await DeliveredInboxNotifications.instance.bindSession(actor);
    held.complete({'token': 'old-captured', 'count': 1});
    final result = await write;
    verifyNever(() => repository.markAllRead(wsId: any(named: 'wsId')));
    expect(
      result,
      NotificationReadResult.notAdmitted,
      reason: nativeCalls.map((c) => c.method).join(','),
    );
    expect(nativeCalls.any((c) => c.method == 'dismissSnapshot'), isFalse);
  });

  for (final bulk in [false, true]) {
    for (final badgeFailure in [false, true]) {
      test('accepted read warns on normal refresh Exception '
          '$bulk/$badgeFailure', () async {
        if (badgeFailure) {
          when(
            () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
          ).thenThrow(Exception('Synthetic refresh unavailable'));
        } else {
          when(
            () => repository.fetchNotifications(
              wsId: any(named: 'wsId'),
              unreadOnly: any(named: 'unreadOnly'),
              readOnly: any(named: 'readOnly'),
              limit: any(named: 'limit'),
              offset: any(named: 'offset'),
            ),
          ).thenThrow(Exception('Synthetic feed unavailable'));
        }
        final result = bulk
            ? await cubit.markAllRead()
            : await cubit.toggleRead(item());
        expect(result, NotificationReadResult.acceptedRefreshUnavailable);
        expect(nativeCalls.map((call) => call.method), [
          'snapshot',
          'dismissSnapshot',
        ]);
        if (bulk) {
          verify(() => repository.markAllRead()).called(1);
        } else {
          verify(() => repository.markRead(id: id, read: true)).called(1);
        }
      });
    }
  }

  test(
    'public badge refresh remains nonthrowing on normal Exception',
    () async {
      when(
        () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
      ).thenThrow(Exception('Synthetic background refresh unavailable'));
      await cubit.refreshUnreadCount();
      expect(cubit.state.isUnreadCountLoading, isFalse);
    },
  );

  test(
    'rejected read discards captured token without removing OS items',
    () async {
      when(
        () => repository.markRead(id: id, read: true),
      ).thenThrow(const FormatException('Synthetic denied read'));
      await expectLater(cubit.toggleRead(item()), throwsFormatException);
      expect(nativeCalls.map((c) => c.method), ['snapshot', 'discardSnapshot']);
    },
  );

  test(
    'accepted read survives native cleanup failure without resubmission',
    () async {
      platformOverride = (call) async {
        if (call.method == 'snapshot') return {'token': 'captured', 'count': 1};
        throw PlatformException(code: 'synthetic-unavailable');
      };
      expect(
        await cubit.toggleRead(item()),
        NotificationReadResult.acceptedCleanupUnavailable,
      );
      verify(() => repository.markRead(id: id, read: true)).called(1);
    },
  );

  test(
    'unavailable native snapshot still accepts current-scope read once',
    () async {
      platformOverride = (_) async => throw MissingPluginException();
      expect(
        await cubit.markAllRead(),
        NotificationReadResult.acceptedCleanupUnavailable,
      );
      verify(() => repository.markAllRead()).called(1);
      expect(nativeCalls.map((c) => c.method), ['snapshot']);
    },
  );

  test(
    'opened archive held across logout does not remove or publish',
    () async {
      final started = Completer<void>();
      final held = Completer<void>();
      when(() => repository.markRead(id: id, read: true)).thenAnswer((_) {
        started.complete();
        return held.future;
      });
      final write = archiveOpenedNotification(
        id,
        notificationsRepository: repository,
        currentUserId: () => currentActor,
      );
      await started.future.timeout(const Duration(seconds: 2));
      currentActor = null;
      await DeliveredInboxNotifications.instance.bindSession(null);
      held.complete();
      await write;
      expect(nativeCalls.any((c) => c.method == 'dismissSnapshot'), isFalse);
    },
  );

  test(
    'all-read uses captured OS token, leaving later deliveries and reminders',
    () async {
      final delivered = <String, int>{'first': 1, 'same-tag': 1};
      final pendingReminders = {'future-reminder'};
      Map<String, int>? captured;
      platformOverride = (call) async {
        switch (call.method) {
          case 'snapshot':
            captured = Map.of(delivered);
            return {'token': 'captured-before-read', 'count': captured!.length};
          case 'dismissSnapshot':
            expect((call.arguments as Map)['token'], 'captured-before-read');
            var requested = 0;
            for (final entry in captured!.entries) {
              if (delivered[entry.key] == entry.value) {
                delivered.remove(entry.key);
                requested++;
              }
            }
            return requested;
          default:
            fail('No pending reminder API permitted: ${call.method}');
        }
      };
      when(() => repository.markAllRead(wsId: any(named: 'wsId'))).thenAnswer((
        _,
      ) async {
        expect(captured, isNotNull);
        delivered['later'] = 1;
        delivered['same-tag'] = 2;
      });
      expect(await cubit.markAllRead(), NotificationReadResult.accepted);
      expect(delivered, {'same-tag': 2, 'later': 1});
      expect(pendingReminders, {'future-reminder'});
      expect(nativeCalls.map((c) => c.method), ['snapshot', 'dismissSnapshot']);
    },
  );

  test(
    'workspace all-read captures exact selected workspace before dispatch',
    () async {
      const workspaceId = '00000000-0000-4000-8000-000000000004';
      await cubit.setWorkspace(const Workspace(id: workspaceId, name: 'Team'));
      nativeCalls.clear();
      when(() => repository.markAllRead(wsId: workspaceId)).thenAnswer((
        _,
      ) async {
        final args = nativeCalls.single.arguments as Map;
        expect(args['scope'], 'exactWorkspace');
        expect(args['workspaceId'], workspaceId);
      });
      expect(await cubit.markAllRead(), NotificationReadResult.accepted);
      verify(() => repository.markAllRead(wsId: workspaceId)).called(1);
    },
  );

  test(
    'foreign bound actor denies read before any API or native snapshot',
    () async {
      await DeliveredInboxNotifications.instance.bindSession(
        '00000000-0000-4000-8000-000000000003',
      );
      nativeCalls.clear();
      expect(await cubit.markAllRead(), NotificationReadResult.notAdmitted);
      verifyNever(() => repository.markAllRead(wsId: any(named: 'wsId')));
      expect(nativeCalls, isEmpty);
    },
  );

  for (final locale in [const Locale('en'), const Locale('vi')]) {
    testWidgets(
      'accepted cleanup failure shows safe feedback ${locale.languageCode}',
      (tester) async {
        tester.binding.platformDispatcher.localesTestValue = [locale];
        addTearDown(tester.binding.platformDispatcher.clearLocalesTestValue);
        await mountReady(tester);
        platformOverride = (call) async {
          if (call.method == 'snapshot') {
            return {'token': 'captured', 'count': 1};
          }
          throw PlatformException(code: 'synthetic-private-error');
        };
        await tester.runAsync(() async {
          final finished = cubit.stream.firstWhere((s) => s.pendingIds.isEmpty);
          await tester.tap(
            find.byTooltip(
              locale.languageCode == 'en' ? 'Mark as read' : 'Đánh dấu đã đọc',
            ),
          );
          await finished;
        });
        await tester.pumpAndSettle();
        expect(
          find.text(
            locale.languageCode == 'en'
                ? 'Read accepted. Some system notifications '
                      'could not be dismissed.'
                : 'Đã tiếp nhận thao tác đọc. '
                      'Không thể xóa một số thông báo hệ thống.',
          ),
          findsOneWidget,
        );
        expect(find.textContaining('synthetic-private-error'), findsNothing);
        verify(() => repository.markRead(id: id, read: true)).called(1);
        await tester.drainShadToastTimers();
      },
    );
  }

  test(
    'actual opened archive held across actor ABA cannot publish refresh',
    () async {
      final events = <PushNotificationEvent>[];
      final subscription = PushNotificationService.instance.events.listen(
        events.add,
      );
      addTearDown(subscription.cancel);
      final entered = Completer<void>();
      final held = Completer<void>();
      when(() => repository.markRead(id: id, read: true)).thenAnswer((_) {
        entered.complete();
        return held.future;
      });
      final write = archiveOpenedNotification(
        id,
        notificationsRepository: repository,
        currentUserId: () => currentActor,
      );
      await entered.future.timeout(const Duration(seconds: 2));
      currentActor = '00000000-0000-4000-8000-000000000003';
      await DeliveredInboxNotifications.instance.bindSession(currentActor);
      currentActor = actor;
      await DeliveredInboxNotifications.instance.bindSession(actor);
      held.complete();
      await write;
      await Future<void>.delayed(Duration.zero);
      verify(() => repository.markRead(id: id, read: true)).called(1);
      expect(events, isEmpty);
      expect(nativeCalls.any((c) => c.method == 'dismissSnapshot'), isFalse);
    },
  );
}
