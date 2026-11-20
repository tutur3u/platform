import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/models/app_notification.dart'
    hide NotificationsPage;
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/data/notification_read_cleanup.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/notifications/view/notifications_page.dart';
import 'package:mobile/features/notifications/widgets/notification_inbox_actions.dart';
import 'package:mobile/features/notifications/widgets/notifications_feed_list.dart';
import 'package:mobile/features/notifications/widgets/notifications_inbox.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Cubit extends MockCubit<NotificationsState>
    implements NotificationsCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

final _now = DateTime(2026, 11, 19, 10);

AppNotification _item(
  String id, {
  bool unread = true,
  String type = 'task_assigned',
  String? entityType = 'task',
  Map<String, dynamic> data = const {'board_id': 'synthetic-board'},
}) => AppNotification(
  id: id,
  userId: 'synthetic-user',
  type: type,
  title: 'Synthetic $id',
  data: data,
  entityType: entityType,
  entityId: entityType == null ? null : 'entity-$id',
  readAt: unread ? null : _now,
  createdAt: _now.subtract(const Duration(hours: 1)),
);

NotificationFeedState _loaded(List<AppNotification> items) =>
    NotificationFeedState(
      status: NotificationFeedStatus.loaded,
      items: items,
      totalCount: items.length,
    );

void main() {
  setUpAll(() {
    registerFallbackValue(_item('fallback'));
    registerFallbackValue(NotificationsTab.all);
  });

  late _Cubit cubit;
  late _Workspaces workspaces;
  late List<String> navigated;
  late List<String> archived;

  setUp(() {
    cubit = _Cubit();
    workspaces = _Workspaces();
    navigated = [];
    archived = [];
    whenListen(
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        workspaces: [Workspace(id: 'synthetic-team', name: 'Demo Team')],
        currentWorkspace: Workspace(id: 'synthetic-team', name: 'Demo Team'),
      ),
    );
    when(cubit.refreshUnreadCount).thenAnswer((_) async {});
    when(
      () => cubit.loadTab(any(), refresh: any(named: 'refresh')),
    ).thenAnswer((_) async {});
    when(() => cubit.loadMore(any())).thenAnswer((_) async {});
    when(cubit.captureReadFeedbackGuard).thenReturn(() => true);
    when(
      () => cubit.toggleRead(any()),
    ).thenAnswer((_) async => NotificationReadResult.accepted);
  });

  Future<void> mount(
    WidgetTester tester,
    NotificationsState state, {
    NotificationsTab tab = NotificationsTab.all,
  }) async {
    whenListen(
      cubit,
      const Stream<NotificationsState>.empty(),
      initialState: state,
    );
    final actions = NotificationInboxActions(
      cubit: cubit,
      workspaceCubit: workspaces,
      navigate: navigated.add,
      archiveOpened: (id) async => archived.add(id),
    );
    var selected = tab;
    await tester.pumpApp(
      Scaffold(
        body: StatefulBuilder(
          builder: (context, setState) => NotificationsInbox(
            actions: actions,
            tab: selected,
            now: _now,
            onTabChanged: (next) => setState(() => selected = next),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('the visible feed reloads after offline replay', (tester) async {
    when(() => cubit.reconcileAfterSync(any())).thenAnswer((_) async {});
    await mount(tester, NotificationsState(all: _loaded([_item('cached')])));

    OfflineMutationQueue.instance.syncRevision.value++;
    await tester.pump();

    verify(() => cubit.reconcileAfterSync(NotificationsTab.all)).called(1);
  });

  testWidgets('filters switch feeds and revalidate previously loaded tabs', (
    tester,
  ) async {
    await mount(
      tester,
      NotificationsState(
        unreadCount: 1,
        all: _loaded([_item('a'), _item('b', unread: false)]),
        inbox: _loaded([_item('a')]),
      ),
    );
    expect(find.textContaining('Synthetic b'), findsOneWidget);
    expect(find.text('Unread 1'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('notifications-filter-inbox')));
    await tester.pumpAndSettle();

    verify(
      () => cubit.loadTab(NotificationsTab.inbox, refresh: true),
    ).called(1);
    expect(find.textContaining('Synthetic a'), findsOneWidget);
    expect(find.textContaining('Synthetic b'), findsNothing);
  });

  testWidgets('reselecting the current tab revalidates its snapshot', (
    tester,
  ) async {
    await mount(tester, NotificationsState(all: _loaded([_item('cached')])));
    clearInteractions(cubit);

    await tester.tap(find.byKey(const ValueKey('notifications-filter-all')));
    await tester.pumpAndSettle();

    verify(() => cubit.loadTab(NotificationsTab.all, refresh: true)).called(1);
    verify(cubit.refreshUnreadCount).called(1);
    expect(find.textContaining('Synthetic cached'), findsOneWidget);
  });

  testWidgets('Unread is the default filter and leads the bar', (tester) async {
    expect(const NotificationsPage().initialTab, NotificationsTab.inbox);
    await mount(
      tester,
      NotificationsState(unreadCount: 1, inbox: _loaded([_item('a')])),
      tab: const NotificationsPage().initialTab,
    );
    final unread = find.byKey(const ValueKey('notifications-filter-inbox'));
    final all = find.byKey(const ValueKey('notifications-filter-all'));
    expect(tester.getTopLeft(unread).dx, lessThan(tester.getTopLeft(all).dx));
    expect(find.textContaining('Synthetic a'), findsOneWidget);

    await tester.tap(all);
    await tester.pumpAndSettle();
    verify(() => cubit.loadTab(NotificationsTab.all, refresh: true)).called(1);
  });

  testWidgets('cards are spaced apart instead of divided', (tester) async {
    await mount(
      tester,
      NotificationsState(all: _loaded([_item('a'), _item('b'), _item('c')])),
    );
    expect(
      find.descendant(
        of: find.byType(NotificationsFeedList),
        matching: find.byType(Divider),
      ),
      findsNothing,
    );
    final a = tester.getRect(find.byKey(const ValueKey('notification-card-a')));
    final b = tester.getRect(find.byKey(const ValueKey('notification-card-b')));
    expect(b.top - a.bottom, notificationCardGap);
    expect(notificationCardGap, greaterThanOrEqualTo(8));
    final material = tester.widget<Material>(
      find.byKey(const ValueKey('notification-card-a')),
    );
    final shape = material.shape! as RoundedRectangleBorder;
    expect(shape.side.style, BorderStyle.solid);
    expect(shape.borderRadius, isNot(BorderRadius.zero));
  });

  testWidgets('tapping marks read and opens the task', (tester) async {
    await mount(tester, NotificationsState(all: _loaded([_item('a')])));

    await tester.tap(find.byKey(const ValueKey('notification-row-a')));
    await tester.pumpAndSettle();

    verify(() => cubit.applyLocalRead('a', read: true)).called(1);
    expect(archived, ['a']);
    expect(navigated, ['/tasks/boards/synthetic-board?taskId=entity-a']);
  });

  testWidgets('a target the app cannot open falls back to details', (
    tester,
  ) async {
    await mount(
      tester,
      NotificationsState(
        all: _loaded([_item('gone', unread: false, data: const {})]),
      ),
    );

    await tester.tap(find.byKey(const ValueKey('notification-row-gone')));
    await tester.pumpAndSettle();

    expect(navigated, isEmpty);
    expect(find.text('This item is no longer available.'), findsOneWidget);
  });

  testWidgets('swiping toggles read and Undo reverses it', (tester) async {
    final events = <PushNotificationEventType>[];
    final subscription = PushNotificationService.instance.events.listen(
      (event) => events.add(event.type),
    );
    addTearDown(subscription.cancel);
    final item = _item('a');
    await mount(tester, NotificationsState(all: _loaded([item])));

    await tester.drag(
      find.byKey(const ValueKey('notification-row-a')),
      const Offset(320, 0),
    );
    await tester.pumpAndSettle();

    verify(() => cubit.toggleRead(item)).called(1);
    expect(find.text('Marked as read'), findsOneWidget);
    // Other unread badges refresh after the write.
    expect(events, contains(PushNotificationEventType.archived));

    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    final undone = verify(() => cubit.toggleRead(captureAny())).captured;
    expect(undone.single, isA<AppNotification>());
    expect((undone.single as AppNotification).isUnread, isFalse);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('open invites offer Accept and Decline inline', (tester) async {
    await mount(
      tester,
      NotificationsState(
        all: _loaded([
          _item(
            'invite',
            type: 'workspace_invite',
            entityType: 'workspace_invite',
            data: const {'workspace_id': 'synthetic-other'},
          ),
        ]),
      ),
    );
    expect(find.text('Accept'), findsOneWidget);
    expect(find.text('Decline'), findsOneWidget);
  });

  for (final (name, state, text) in [
    (
      'empty',
      NotificationsState(all: _loaded(const [])),
      'No notifications yet',
    ),
    (
      'offline',
      const NotificationsState(
        all: NotificationFeedState(
          status: NotificationFeedStatus.error,
          isOffline: true,
        ),
      ),
      "You're offline",
    ),
    (
      'error',
      const NotificationsState(
        all: NotificationFeedState(status: NotificationFeedStatus.error),
      ),
      "Couldn't load notifications",
    ),
  ]) {
    testWidgets('$name feed shows its state', (tester) async {
      await mount(tester, state);
      expect(find.text(text), findsOneWidget);
    });
  }

  testWidgets('a failed refresh keeps cached rows with a retry banner', (
    tester,
  ) async {
    await mount(
      tester,
      NotificationsState(
        all: _loaded([
          _item('a'),
        ]).copyWith(status: NotificationFeedStatus.error, isOffline: true),
      ),
    );
    expect(find.textContaining('Synthetic a'), findsOneWidget);
    expect(find.text('Offline. Showing saved notifications.'), findsOneWidget);
  });
}
