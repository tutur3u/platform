part of 'appearance_root_tabs_render_test.dart';

class _Repository extends Mock implements NotificationsRepository {}

model.AppNotification _item(
  String id,
  String type,
  String title,
  int daysAgo, {
  String? description,
  bool read = false,
  String? entityType,
  Map<String, dynamic> data = const {},
}) {
  final now = DateTime.now();
  return model.AppNotification(
    id: id,
    userId: 'synthetic-user',
    type: type,
    title: title,
    description: description,
    data: {'workspace_name': 'Northwind Studio', ...data},
    entityType: entityType,
    entityId: entityType == null ? null : '$id-entity',
    readAt: read ? now : null,
    createdAt: DateTime(now.year, now.month, now.day - daysAgo),
  );
}

/// Notifications under the real shell with fixture items in every recency
/// group, an open invite and read/unread rows. Captures are written only
/// when `SETTINGS_RENDER_DIR` is set; layout assertions always run.
void _notificationsRenderCases() {
  List<model.AppNotification> fixtureItems() => [
    _item(
      'n1',
      'task_mention',
      'Minh mentioned you in "Launch checklist"',
      0,
      description: 'Can you confirm the App Store screenshots by Friday?',
      entityType: 'task',
    ),
    _item(
      'n2',
      'workspace_invite',
      'Join Riverside Labs',
      0,
      description: 'An invite to collaborate on the Riverside workspace.',
    ),
    _item(
      'n3',
      'task_assigned',
      'You were assigned "Draft release notes"',
      1,
      read: true,
      entityType: 'task',
    ),
    _item(
      'n4',
      'security_alert',
      'New sign-in on a Mac',
      3,
      description: 'If this was not you, review your active sessions.',
      read: true,
    ),
    _item(
      'n5',
      'report_approved',
      'Your October report was approved',
      12,
      read: true,
    ),
  ];

  for (final size in renderSizes.entries) {
    for (final look in renderAppearances.entries) {
      testWidgets('Notifications render on ${size.key} in ${look.key}', (
        tester,
      ) async {
        final items = fixtureItems();
        final repository = _Repository();
        when(
          () => repository.fetchNotifications(
            wsId: any(named: 'wsId'),
            unreadOnly: any(named: 'unreadOnly'),
            readOnly: any(named: 'readOnly'),
            limit: any(named: 'limit'),
            offset: any(named: 'offset'),
          ),
        ).thenAnswer(
          (_) async => model.NotificationsPage(
            notifications: items,
            count: items.length,
            limit: 20,
            offset: 0,
          ),
        );
        when(
          () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
        ).thenAnswer((_) async => 2);

        await pumpShellRender(
          tester,
          location: Routes.notifications,
          size: size.value,
          appearance: look.value.$1,
          themeMode: look.value.$2,
          notificationsPageBuilder: (_) =>
              NotificationsPage(repository: repository),
        );
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 50)),
        );
        await settleShell(tester);

        for (final caption in ['Today', 'Yesterday', 'Earlier']) {
          expect(find.text(caption), findsOneWidget, reason: caption);
        }
        // The open invite offers both decisions inline.
        expect(find.text('Accept'), findsOneWidget);
        expect(find.text('Decline'), findsOneWidget);
        expect(
          find.byKey(const ValueKey('notification-unread-dot')),
          findsNWidgets(2),
        );
        final firstRow = find.byKey(const ValueKey('notification-row-n1'));
        expect(tester.getSize(firstRow).height, greaterThanOrEqualTo(44));
        final left = tester.getTopLeft(firstRow).dx;
        if (size.key == 'phone') {
          expect(left, AppLayout.gutter(DeviceClass.compact));
        } else {
          // Wider windows centre the feed at the detail page width.
          expect(tester.getSize(firstRow).width, lessThanOrEqualTo(720));
        }
        // Search belongs to screens that search their own content.
        expect(find.byIcon(AppIcons.search), findsNothing);
        final chrome = tester
            .element(find.byType(NotificationsPage))
            .read<ShellChromeActionsCubit>();
        List<String> ids() => chrome.state
            .resolveForLocation(Routes.notifications)
            .map((action) => action.id)
            .toList();
        // Unread notifications exist, so Mark all as read is offered.
        expect(ids(), contains('notifications-mark-all-read'));
        expect(ids(), contains('notifications-settings'));
        await _capture(tester, 'notifications-${size.key}-${look.key}');
        if (size.key == 'phone') {
          // The Unread filter asks the server for unread rows only.
          await tester.tap(
            find.byKey(const ValueKey('notifications-filter-inbox')),
          );
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 50)),
          );
          await settleShell(tester);
          verify(
            () => repository.fetchNotifications(
              wsId: any(named: 'wsId'),
              unreadOnly: true,
              limit: any(named: 'limit'),
              offset: any(named: 'offset'),
            ),
          ).called(greaterThanOrEqualTo(1));
        }
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final (state, failing) in [('empty', false), ('error', true)]) {
    testWidgets('Notifications $state state renders', (tester) async {
      final repository = _Repository();
      when(
        () => repository.fetchNotifications(
          wsId: any(named: 'wsId'),
          unreadOnly: any(named: 'unreadOnly'),
          readOnly: any(named: 'readOnly'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).thenAnswer((_) async {
        if (failing) throw Exception('synthetic-offline');
        return const model.NotificationsPage(
          notifications: [],
          count: 0,
          limit: 20,
          offset: 0,
        );
      });
      when(
        () => repository.fetchUnreadCount(wsId: any(named: 'wsId')),
      ).thenAnswer((_) async => 0);
      final appearance = renderAppearances['classic-light']!;
      await pumpShellRender(
        tester,
        location: Routes.notifications,
        size: renderSizes['phone']!,
        appearance: appearance.$1,
        themeMode: appearance.$2,
        notificationsPageBuilder: (_) =>
            NotificationsPage(repository: repository),
      );
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await settleShell(tester);

      expect(
        find.text(failing ? 'Retry' : "You're all caught up"),
        findsOneWidget,
      );
      expect(find.textContaining('synthetic-offline'), findsNothing);
      // Nothing unread: no Mark all as read, rather than a disabled control.
      expect(
        tester
            .element(find.byType(NotificationsPage))
            .read<ShellChromeActionsCubit>()
            .state
            .resolveForLocation(Routes.notifications)
            .map((action) => action.id),
        isNot(contains('notifications-mark-all-read')),
      );
      expect(find.byIcon(AppIcons.search), findsNothing);
      await _capture(tester, 'notifications-phone-$state');
      expect(tester.takeException(), isNull);
    });
  }
}
