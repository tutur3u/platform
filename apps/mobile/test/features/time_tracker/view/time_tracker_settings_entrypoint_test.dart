import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_settings.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_requests_page.dart';
import 'package:mobile/features/time_tracker/widgets/threshold_settings_dialog.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/pump_app.dart';

class _Repository extends Mock implements ITimeTrackerRepository {}

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

void main() {
  testWidgets('the requests gear opens central Timer settings and reloads', (
    tester,
  ) async {
    final repository = _Repository();
    final permissions = _Permissions();
    final auth = _Auth();
    final workspaces = _Workspaces();
    final actions = ShellChromeActionsCubit();
    addTearDown(actions.close);
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.authenticated(
        supa.User(
          id: 'user-1',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '2026-01-01T00:00:00Z',
        ),
      ),
    );
    whenListen(
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: Workspace(id: 'ws-1'),
      ),
    );
    when(
      () => repository.getRequests(
        any(),
        status: any(named: 'status'),
        userId: any(named: 'userId'),
      ),
    ).thenAnswer((_) async => const []);
    when(() => repository.getWorkspaceSettings('ws-1')).thenAnswer(
      (_) async => const WorkspaceSettings(missedEntryDateThreshold: 2),
    );
    when(
      () => repository.getWorkspaceConfigValue(any(), any()),
    ).thenAnswer((_) async => '0');
    when(
      () => repository.getRequestUsers(any()),
    ).thenAnswer((_) async => const []);
    when(
      () => repository.getCategories(any()),
    ).thenAnswer((_) async => const <TimeTrackingCategory>[]);
    when(
      () => permissions.getPermissions(wsId: 'ws-1', userId: 'user-1'),
    ).thenAnswer(
      (_) async => const WorkspacePermissions(
        permissions: {
          manageTimeTrackingRequestsPermission,
          manageWorkspaceSettingsPermission,
        },
        isCreator: false,
      ),
    );
    final router = GoRouter(
      initialLocation: Routes.timerRequests,
      routes: [
        GoRoute(
          path: Routes.timerRequests,
          builder: (_, _) => TimeTrackerRequestsPage(
            repository: repository,
            workspacePermissionsRepository: permissions,
          ),
        ),
        GoRoute(
          path: Routes.settingsAppDetail,
          builder: (_, _) => const SizedBox(key: ValueKey('central-timer')),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpAppRouter(
      router,
      wrap: (app) => MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspaces),
          BlocProvider.value(value: actions),
        ],
        child: app,
      ),
    );
    await tester.pumpAndSettle();

    final gear = actions.state
        .resolveForLocation(Routes.timerRequests)
        .singleWhere((action) => action.id == 'requests-settings');
    expect(gear.enabled, isTrue);
    gear.onPressed!();
    await tester.pumpAndSettle();
    // One editor: the gear deep-links instead of opening its own sheet.
    expect(router.state.matchedLocation, Routes.settingsAppPath('timer'));
    // The gear asks the central screen to open the threshold editor.
    expect(router.state.uri.queryParameters['focus'], 'threshold');
    expect(find.byKey(const ValueKey('central-timer')), findsOneWidget);
    expect(find.byType(ThresholdSettingsDialog), findsNothing);

    router.pop();
    await tester.pumpAndSettle();
    expect(router.state.matchedLocation, Routes.timerRequests);
    verify(() => repository.getWorkspaceSettings('ws-1')).called(2);
    expect(tester.takeException(), isNull);
  });
}
