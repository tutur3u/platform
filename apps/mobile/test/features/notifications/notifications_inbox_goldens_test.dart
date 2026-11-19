@Tags(['golden'])
library;

import 'dart:io';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/widgets/notification_inbox_actions.dart';
import 'package:mobile/features/notifications/widgets/notifications_inbox.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/golden_tolerance.dart';
import '../../helpers/pump_app.dart';

class _Cubit extends MockCubit<NotificationsState>
    implements NotificationsCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

final _now = DateTime(2026, 11, 19, 10);

AppNotification _item(
  String id,
  String type,
  String title,
  Duration age, {
  String? description,
  bool read = false,
  String? entityType,
}) => AppNotification(
  id: id,
  userId: 'synthetic-user',
  type: type,
  title: title,
  description: description,
  data: const {'workspace_name': 'Demo Studio'},
  entityType: entityType,
  entityId: entityType == null ? null : '$id-entity',
  readAt: read ? _now : null,
  createdAt: _now.subtract(age),
);

final List<AppNotification> _items = [
  _item(
    'n1',
    'task_mention',
    'Alex Doe mentioned you in "Launch checklist"',
    const Duration(minutes: 12),
    description: 'Can you confirm the store screenshots by Friday?',
    entityType: 'task',
  ),
  _item(
    'n2',
    'workspace_invite',
    'Join Demo Studio',
    const Duration(hours: 2),
    description: 'Sam Lee invited you to collaborate.',
  ),
  _item(
    'n3',
    'task_assigned',
    'You were assigned "Draft release notes"',
    const Duration(hours: 22),
    read: true,
    entityType: 'task',
  ),
  _item(
    'n4',
    'security_alert',
    'New sign-in on a laptop',
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

NotificationFeedState _loaded(List<AppNotification> items) =>
    NotificationFeedState(
      status: NotificationFeedStatus.loaded,
      items: items,
      totalCount: items.length,
    );

/// The Alerts inbox with day groups, an open invite and read/unread rows,
/// and its all-caught-up state, in classic and Sorbet, light and dark.
void main() {
  final original = goldenFileComparator;
  setUpAll(() {
    goldenFileComparator = GoldenTolerance(
      File(
        'test/features/notifications/notifications_inbox_goldens_test.dart',
      ).absolute.uri,
    );
  });
  tearDownAll(() => goldenFileComparator = original);

  for (final (scene, state) in [
    ('data', NotificationsState(unreadCount: 2, all: _loaded(_items))),
    ('empty', NotificationsState(all: _loaded(const []))),
  ]) {
    for (final (design, sorbet) in [
      ('classic', null),
      ('sorbet', const SorbetTheme()),
    ]) {
      for (final brightness in Brightness.values) {
        final name = 'inbox_${scene}_${design}_${brightness.name}_phone';
        testWidgets(name, (tester) async {
          tester.view
            ..physicalSize = const Size(390, 844)
            ..devicePixelRatio = 1
            ..padding = const FakeViewPadding(top: 48, bottom: 34)
            ..viewPadding = const FakeViewPadding(top: 48, bottom: 34);
          addTearDown(tester.view.reset);
          final cubit = _Cubit();
          final workspaces = _Workspaces();
          whenListen(
            cubit,
            const Stream<NotificationsState>.empty(),
            initialState: state,
          );
          whenListen(
            workspaces,
            const Stream<WorkspaceState>.empty(),
            initialState: const WorkspaceState(),
          );
          when(cubit.refreshUnreadCount).thenAnswer((_) async {});
          when(
            () => cubit.loadTab(
              NotificationsTab.all,
              refresh: any(named: 'refresh'),
            ),
          ).thenAnswer((_) async {});
          await tester.pumpWidget(
            sorbetTestApp(
              sorbet: sorbet,
              brightness: brightness,
              boundaryKey: const ValueKey('golden'),
              home: Scaffold(
                body: NotificationsInbox(
                  actions: NotificationInboxActions(
                    cubit: cubit,
                    workspaceCubit: workspaces,
                    navigate: (_) {},
                  ),
                  tab: NotificationsTab.all,
                  now: _now,
                  onTabChanged: (_) {},
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          await expectLater(
            find.byKey(const ValueKey('golden')),
            matchesGoldenFile('goldens/$name.png'),
          );
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}
