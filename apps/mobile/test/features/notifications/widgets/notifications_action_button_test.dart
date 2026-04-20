import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/notifications_repository.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/widgets/notifications_action_button.dart';
import 'package:mobile/features/notifications/widgets/notifications_sheet.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _MockNotificationsRepository extends Mock
    implements NotificationsRepository {}

Widget _buildActionSlot({
  required String matchedLocation,
  required WorkspaceCubit workspaceCubit,
  required NotificationsRepository notificationsRepository,
}) {
  return BlocProvider<WorkspaceCubit>.value(
    value: workspaceCubit,
    child: Scaffold(
      body: Align(
        alignment: Alignment.topRight,
        child: ShellNotificationsActionSlot(
          matchedLocation: matchedLocation,
          notificationsRepository: notificationsRepository,
        ),
      ),
    ),
  );
}

Widget _buildRouterApp({
  required GoRouter router,
  required WorkspaceCubit workspaceCubit,
}) {
  return BlocProvider<WorkspaceCubit>.value(
    value: workspaceCubit,
    child: shad.ShadcnApp.router(
      theme: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
      darkTheme: const shad.ThemeData.dark(
        colorScheme: shad.ColorSchemes.darkZinc,
      ),
      localizationsDelegates: const [
        ...AppLocalizations.localizationsDelegates,
        shad.ShadcnLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
    ),
  );
}

class _NotificationsLauncher extends StatelessWidget {
  const _NotificationsLauncher({
    required this.cubit,
  });

  final NotificationsCubit cubit;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: FilledButton(
          onPressed: () => showNotificationsSheet(
            context: context,
            notificationsCubit: cubit,
          ),
          child: const Text('Open notifications'),
        ),
      ),
    );
  }
}

void main() {
  group('ShellNotificationsActionSlot', () {
    late _MockWorkspaceCubit workspaceCubit;
    late _MockNotificationsRepository notificationsRepository;
    const teamWorkspace = Workspace(id: 'ws_1', name: 'Workspace');

    setUp(() {
      workspaceCubit = _MockWorkspaceCubit();
      notificationsRepository = _MockNotificationsRepository();

      const workspaceState = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: teamWorkspace,
        workspaces: [teamWorkspace],
      );
      when(() => workspaceCubit.state).thenReturn(workspaceState);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: workspaceState,
      );
      when(
        () =>
            notificationsRepository.fetchUnreadCount(wsId: any(named: 'wsId')),
      ).thenAnswer((_) async => 2);
      when(
        () => notificationsRepository.fetchNotifications(
          wsId: any(named: 'wsId'),
          unreadOnly: any(named: 'unreadOnly'),
          readOnly: any(named: 'readOnly'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).thenAnswer(
        (_) async => NotificationsPage(
          notifications: [
            AppNotification(
              id: 'notif_1',
              userId: 'user_1',
              type: 'task_assigned',
              title: 'Task assigned',
              description: 'A task is waiting for you',
              data: const {
                'workspace_id': 'ws_1',
                'workspace_name': 'Workspace',
                'board_id': 'board_1',
              },
              entityType: 'task',
              entityId: 'task_1',
              createdAt: DateTime(2026, 3, 25),
            ),
          ],
          count: 1,
          limit: 20,
          offset: 0,
        ),
      );
    });

    testWidgets('shows bell on shared shell root and module routes', (
      tester,
    ) async {
      await tester.pumpApp(
        _buildActionSlot(
          matchedLocation: Routes.home,
          workspaceCubit: workspaceCubit,
          notificationsRepository: notificationsRepository,
        ),
      );
      await tester.pump();

      expect(
        find.byKey(const ValueKey('notifications-action-button')),
        findsOneWidget,
      );

      await tester.pumpApp(
        _buildActionSlot(
          matchedLocation: Routes.profileRoot,
          workspaceCubit: workspaceCubit,
          notificationsRepository: notificationsRepository,
        ),
      );
      await tester.pump();

      expect(
        find.byKey(const ValueKey('notifications-action-button')),
        findsOneWidget,
      );

      await tester.pumpApp(
        _buildActionSlot(
          matchedLocation: Routes.settings,
          workspaceCubit: workspaceCubit,
          notificationsRepository: notificationsRepository,
        ),
      );
      await tester.pump();

      expect(
        find.byKey(const ValueKey('notifications-action-button')),
        findsOneWidget,
      );

      await tester.pumpApp(
        _buildActionSlot(
          matchedLocation: Routes.settingsWorkspace,
          workspaceCubit: workspaceCubit,
          notificationsRepository: notificationsRepository,
        ),
      );
      await tester.pump();

      expect(
        find.byKey(const ValueKey('notifications-action-button')),
        findsOneWidget,
      );

      await tester.pumpApp(
        _buildActionSlot(
          matchedLocation: Routes.tasks,
          workspaceCubit: workspaceCubit,
          notificationsRepository: notificationsRepository,
        ),
      );
      await tester.pump();

      expect(
        find.byKey(const ValueKey('notifications-action-button')),
        findsOneWidget,
      );

      await tester.pumpApp(
        _buildActionSlot(
          matchedLocation: Routes.taskBoardDetailPath('board_1'),
          workspaceCubit: workspaceCubit,
          notificationsRepository: notificationsRepository,
        ),
      );
      await tester.pump();

      expect(
        find.byKey(const ValueKey('notifications-action-button')),
        findsNothing,
      );
    });

    testWidgets('opens sheet and shows unread badge', (tester) async {
      final router = GoRouter(
        initialLocation: Routes.apps,
        routes: [
          GoRoute(
            path: Routes.apps,
            builder: (context, state) => _buildActionSlot(
              matchedLocation: Routes.apps,
              workspaceCubit: workspaceCubit,
              notificationsRepository: notificationsRepository,
            ),
          ),
          GoRoute(
            path: Routes.notifications,
            builder: (context, state) =>
                const Scaffold(body: Center(child: Text('Notifications'))),
          ),
        ],
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _buildRouterApp(
          router: router,
          workspaceCubit: workspaceCubit,
        ),
      );
      await tester.pump();
      await tester.pump();

      expect(
        find.byKey(const ValueKey('notifications-unread-badge')),
        findsOneWidget,
      );

      await tester.tap(
        find.byKey(const ValueKey('notifications-action-button')),
      );
      await tester.pumpAndSettle();

      expect(find.text('Notifications'), findsOneWidget);
    });
  });

  group('NotificationsSheet navigation', () {
    late _MockWorkspaceCubit workspaceCubit;
    late _MockNotificationsRepository notificationsRepository;
    late NotificationsCubit notificationsCubit;
    late GoRouter router;

    const personalWorkspace = Workspace(
      id: 'personal_ws',
      name: 'Personal',
      personal: true,
    );
    const teamWorkspace = Workspace(
      id: 'team_ws',
      name: 'Team Workspace',
    );

    setUp(() async {
      workspaceCubit = _MockWorkspaceCubit();
      notificationsRepository = _MockNotificationsRepository();
      notificationsCubit = NotificationsCubit(
        notificationsRepository: notificationsRepository,
      );

      const workspaceState = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: personalWorkspace,
        workspaces: [personalWorkspace, teamWorkspace],
      );
      when(() => workspaceCubit.state).thenReturn(workspaceState);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: workspaceState,
      );
      when(
        () => workspaceCubit.selectWorkspace(teamWorkspace),
      ).thenAnswer((_) async {});
      when(
        () =>
            notificationsRepository.fetchUnreadCount(wsId: any(named: 'wsId')),
      ).thenAnswer((_) async => 1);
      when(
        () => notificationsRepository.fetchNotifications(
          wsId: any(named: 'wsId'),
          unreadOnly: any(named: 'unreadOnly'),
          readOnly: any(named: 'readOnly'),
          limit: any(named: 'limit'),
          offset: any(named: 'offset'),
        ),
      ).thenAnswer(
        (_) async => NotificationsPage(
          notifications: [
            AppNotification(
              id: 'notif_task',
              userId: 'user_1',
              type: 'task_assigned',
              title: 'Cross-workspace task',
              description: 'Open the linked task',
              data: const {
                'workspace_id': 'team_ws',
                'workspace_name': 'Team Workspace',
                'board_id': 'board_2',
              },
              entityType: 'task',
              entityId: 'task_9',
              createdAt: DateTime(2026, 3, 25),
            ),
          ],
          count: 1,
          limit: 20,
          offset: 0,
        ),
      );

      await notificationsCubit.setWorkspace(personalWorkspace);
      await notificationsCubit.loadTab(NotificationsTab.inbox);

      router = GoRouter(
        initialLocation: '/test',
        routes: [
          GoRoute(
            path: '/test',
            builder: (context, state) =>
                _NotificationsLauncher(cubit: notificationsCubit),
          ),
          GoRoute(
            path: Routes.taskBoardDetail,
            builder: (context, state) => Scaffold(
              body: Text(
                'Board ${state.pathParameters['boardId']} '
                'Task ${state.uri.queryParameters['taskId']}',
              ),
            ),
          ),
          GoRoute(
            path: Routes.timerRequests,
            builder: (context, state) => Scaffold(
              body: Text(
                'Request ${state.uri.queryParameters['requestId']} '
                'Status ${state.uri.queryParameters['status']}',
              ),
            ),
          ),
        ],
      );
    });

    tearDown(() async {
      await notificationsCubit.close();
      router.dispose();
    });

    testWidgets('tapping task notification switches workspace and navigates', (
      tester,
    ) async {
      clearInteractions(workspaceCubit);
      await tester.pumpWidget(
        _buildRouterApp(
          router: router,
          workspaceCubit: workspaceCubit,
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Open notifications'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Cross-workspace task'));
      await tester.pumpAndSettle();

      verify(() => workspaceCubit.selectWorkspace(teamWorkspace)).called(1);
      expect(find.text('Board board_2 Task task_9'), findsOneWidget);
    });

    testWidgets(
      'tapping time tracking request notification switches workspace and '
      'deep links',
      (tester) async {
        when(
          () => notificationsRepository.fetchNotifications(
            wsId: any(named: 'wsId'),
            unreadOnly: any(named: 'unreadOnly'),
            readOnly: any(named: 'readOnly'),
            limit: any(named: 'limit'),
            offset: any(named: 'offset'),
          ),
        ).thenAnswer(
          (_) async => NotificationsPage(
            notifications: [
              AppNotification(
                id: 'notif_request',
                userId: 'user_1',
                type: 'time_tracking_request_submitted',
                title: 'Cross-workspace request',
                description: 'Open the linked request',
                data: const {
                  'workspace_id': 'team_ws',
                  'workspace_name': 'Team Workspace',
                },
                entityType: 'time_tracking_request',
                entityId: 'request_42',
                createdAt: DateTime(2026, 3, 25),
              ),
            ],
            count: 1,
            limit: 20,
            offset: 0,
          ),
        );

        await notificationsCubit.setWorkspace(personalWorkspace);
        await notificationsCubit.loadTab(NotificationsTab.inbox);
        clearInteractions(workspaceCubit);

        await tester.pumpWidget(
          _buildRouterApp(
            router: router,
            workspaceCubit: workspaceCubit,
          ),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.text('Open notifications'));
        await tester.pumpAndSettle();

        await tester.tap(find.text('Cross-workspace request'));
        await tester.pumpAndSettle();

        verify(() => workspaceCubit.selectWorkspace(teamWorkspace)).called(1);
        expect(find.text('Request request_42 Status all'), findsOneWidget);
      },
    );
  });
}
