part of 'appearance_root_tabs_render_test.dart';

class _Repository extends Mock implements NotificationsRepository {}

model.AppNotification _item(
  String id,
  String type,
  String title,
  Duration age, {
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
    createdAt: now.subtract(age),
  );
}

/// Notifications under the real shell with fixture items in every recency
/// group, an open invite and read/unread rows. Captures are written only
/// when `SETTINGS_RENDER_DIR` is set; layout assertions always run.
void _notificationsRenderCases() {
  final items = [
    _item(
      'n1',
      'task_mention',
      'Minh mentioned you in "Launch checklist"',
      const Duration(minutes: 12),
      description: 'Can you confirm the App Store screenshots by Friday?',
      entityType: 'task',
    ),
    _item(
      'n2',
      'workspace_invite',
      'Join Riverside Labs',
      const Duration(hours: 3),
      description: 'An invite to collaborate on the Riverside workspace.',
    ),
    _item(
      'n3',
      'task_assigned',
      'You were assigned "Draft release notes"',
      const Duration(days: 1, hours: 2),
      read: true,
      entityType: 'task',
    ),
    _item(
      'n4',
      'security_alert',
      'New sign-in on a Mac',
      const Duration(days: 3),
      description: 'If this was not you, review your active sessions.',
      read: true,
    ),
    _item(
      'n5',
      'report_approved',
      'Your October report was approved',
      const Duration(days: 12),
      read: true,
    ),
  ];

  for (final size in renderSizes.entries) {
    for (final look in renderAppearances.entries) {
      testWidgets('Notifications render on ${size.key} in ${look.key}', (
        tester,
      ) async {
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

        for (final caption in [
          'Today',
          'Yesterday',
          'Last 7 days',
          'Earlier',
        ]) {
          expect(find.text(caption), findsOneWidget, reason: caption);
        }
        // The open invite offers both decisions.
        expect(find.text('Accept'), findsOneWidget);
        expect(find.text('Decline'), findsOneWidget);
        final markRead = find.byTooltip('Mark as read');
        expect(markRead, findsNWidgets(2));
        expect(tester.getSize(markRead.first).height, greaterThanOrEqualTo(44));
        final firstCard = find.byType(AppGroupedCard).first;
        final left = tester.getTopLeft(firstCard).dx;
        if (size.key == 'phone') {
          expect(left, AppLayout.gutter(DeviceClass.compact));
        } else {
          // Wider windows centre the list at the detail page width.
          final width = tester.getSize(firstCard).width;
          expect(width, lessThanOrEqualTo(720));
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
        // Unread notifications exist, so Archive all is offered.
        expect(ids(), contains('notifications-archive-all'));
        await _capture(tester, 'notifications-${size.key}-${look.key}');
        if (size.key == 'phone') {
          // The Archive tab never offers it.
          chrome.state
              .resolveForLocation(Routes.notifications)
              .firstWhere((action) => action.id == 'notifications-tab-archive')
              .onPressed!();
          await settleShell(tester);
          expect(ids(), isNot(contains('notifications-archive-all')));
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
        find.text(failing ? 'Retry' : 'No unread notifications'),
        findsOneWidget,
      );
      expect(find.textContaining('synthetic-offline'), findsNothing);
      // Nothing unread: no Archive all, rather than a disabled control.
      expect(
        tester
            .element(find.byType(NotificationsPage))
            .read<ShellChromeActionsCubit>()
            .state
            .resolveForLocation(Routes.notifications)
            .map((action) => action.id),
        isNot(contains('notifications-archive-all')),
      );
      expect(find.byIcon(AppIcons.search), findsNothing);
      await _capture(tester, 'notifications-phone-$state');
      expect(tester.takeException(), isNull);
    });
  }
}
