import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
import 'package:mobile/features/habits/view/habits_page.dart';
import 'package:mobile/features/habits/widgets/habit_tracker_card.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../fixtures/habits_fixture.dart';
import '../fixtures/store_team.dart';
import '../store_screenshot_app.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

AuthCubit _auth() {
  final cubit = _Auth();
  whenListen(
    cubit,
    const Stream<AuthState>.empty(),
    initialState: AuthState.authenticated(
      User(
        id: StoreTeam.me.id,
        appMetadata: const {},
        userMetadata: {'display_name': StoreTeam.me.name},
        aud: 'authenticated',
        email: StoreTeam.me.email,
        createdAt: StoreTeam.at(9, 0, -90).toUtc().toIso8601String(),
      ),
    ),
  );
  return cubit;
}

/// Each capture runs in its own test zone, but the habits snapshot gate
/// memoizes its access check per actor and workspace for the whole process.
/// A capture-scoped workspace id keeps one capture from awaiting a future
/// owned by an earlier, finished test.
var _capture = 0;

WorkspaceCubit _workspace() {
  final workspace = Workspace(
    id: '${StoreTeam.workspaceId}-${_capture++}',
    name: StoreTeam.workspaceName,
  );
  final cubit = _Workspace();
  whenListen(
    cubit,
    const Stream<WorkspaceState>.empty(),
    initialState: WorkspaceState(
      status: WorkspaceStatus.loaded,
      workspaces: [workspace],
      currentWorkspace: workspace,
    ),
  );
  return cubit;
}

/// The real habits overview: Linh's trackers with today's progress, check-in
/// times and streaks.
final StoreScreen habitsStoreScreen = StoreScreen(
  id: 'habits',
  order: 6,
  shellLocation: Routes.habits,
  build: (locale) {
    FlutterSecureStorage.setMockInitialValues({});
    // Each capture loads fresh so no other locale's trackers leak in.
    HabitsCubit.clearCache();
    return MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>(create: (_) => _auth()),
        BlocProvider<WorkspaceCubit>(create: (_) => _workspace()),
        BlocProvider(create: (_) => ShellChromeActionsCubit()),
      ],
      child: HabitsPage(repository: StoreHabitRepository(locale)),
    );
  },
  prepare: _waitForTrackers,
);

/// The cubit checks its on-device snapshot store before it lists trackers;
/// give that real I/O time to finish so the frame shows the loaded list.
Future<void> _waitForTrackers(WidgetTester tester, StoreLocale locale) async {
  for (var i = 0; i < 100; i++) {
    if (find.byType(HabitTrackerCard).evaluate().isNotEmpty) break;
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 100)),
    );
    await tester.pump(const Duration(milliseconds: 50));
  }
}
