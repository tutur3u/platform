import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/audience_mode/audience_mode.dart';
import 'package:mobile/features/audience_mode/audience_mode_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/classes/data/classes_today_repository.dart';
import 'package:mobile/features/classes/view/classes_today_scope.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../audience_mode/audience_mode_fakes.dart';
import 'classes_today_fakes.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

const _workspace = Workspace(id: 'ec', name: 'Easy Center');

/// A day boundary crossed while the device slept must not leave yesterday's
/// sessions on Home: the midnight timer is monotonic and never fires.
void main() {
  Future<void> pumpScope(
    WidgetTester tester, {
    required FakeClassesTodayRepository repository,
    required DateTime Function() clock,
  }) async {
    final auth = _Auth();
    final workspaces = _Workspaces();
    final mode = AudienceModeCubit(
      repository: FakeAudienceModeRepository()
        ..account = AudienceMode.education,
      store: MemoryAudienceModeStore(),
    );
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.authenticated(
        supa.User(
          id: 'u1',
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
        currentWorkspace: _workspace,
        workspaces: [_workspace],
      ),
    );
    await mode.bind(userId: 'u1', wsId: 'ec');
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      await auth.close();
      await workspaces.close();
      await mode.close();
    });
    await tester.pumpWidget(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspaces),
          BlocProvider<AudienceModeCubit>.value(value: mode),
        ],
        child: ClassesTodayScope(
          repository: repository,
          clock: clock,
          child: const SizedBox.shrink(),
        ),
      ),
    );
    await tester.pump();
  }

  void backgroundThenResume(WidgetTester tester) {
    tester.binding
      ..handleAppLifecycleStateChanged(AppLifecycleState.inactive)
      ..handleAppLifecycleStateChanged(AppLifecycleState.hidden)
      ..handleAppLifecycleStateChanged(AppLifecycleState.paused)
      ..handleAppLifecycleStateChanged(AppLifecycleState.hidden)
      ..handleAppLifecycleStateChanged(AppLifecycleState.inactive)
      ..handleAppLifecycleStateChanged(AppLifecycleState.resumed);
  }

  testWidgets('resuming on a new day refetches for that day', (tester) async {
    var clock = DateTime(2026, 10, 27, 22);
    final repository = FakeClassesTodayRepository(
      snapshot: ClassesTodaySnapshot(
        sessions: [session('old', start: DateTime(2026, 10, 27, 23))],
      ),
    );
    await pumpScope(tester, repository: repository, clock: () => clock);
    expect(repository.fetches, hasLength(1));

    clock = DateTime(2026, 10, 28, 7);
    backgroundThenResume(tester);
    await tester.pump();
    expect(repository.fetches, hasLength(2));
  });

  testWidgets('resuming on the same day does not refetch', (tester) async {
    var clock = DateTime(2026, 10, 27, 10);
    final repository = FakeClassesTodayRepository();
    await pumpScope(tester, repository: repository, clock: () => clock);
    clock = DateTime(2026, 10, 27, 10, 30);
    backgroundThenResume(tester);
    await tester.pump();
    expect(repository.fetches, hasLength(1));
  });

  testWidgets('a disposed scope ignores later resumes', (tester) async {
    var clock = DateTime(2026, 10, 27, 22);
    final repository = FakeClassesTodayRepository();
    await pumpScope(tester, repository: repository, clock: () => clock);
    await tester.pumpWidget(const SizedBox.shrink());
    clock = DateTime(2026, 10, 28, 7);
    backgroundThenResume(tester);
    await tester.pump();
    expect(repository.fetches, hasLength(1));
  });
}
