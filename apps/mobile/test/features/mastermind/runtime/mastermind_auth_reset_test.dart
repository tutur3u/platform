import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_auth_reset.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/mastermind_view_harness.dart';

class _Repository extends Mock implements AuthRepository {}

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

// Not UUIDs on purpose: the sign-out cache sweep skips actors that are not.
supa.User _user(String id) => supa.User(
  id: id,
  appMetadata: const {},
  userMetadata: const {},
  aud: 'authenticated',
  createdAt: '2026-01-01',
);

supa.AuthState _event(supa.AuthChangeEvent event, [String? userId]) =>
    supa.AuthState(
      event,
      userId == null
          ? null
          : supa.Session(
              accessToken: 'token-$userId',
              tokenType: 'bearer',
              user: _user(userId),
            ),
    );

void main() {
  late StreamController<supa.AuthState> events;
  late AuthCubit auth;
  late MastermindViewHarness harness;

  setUp(() async {
    events = StreamController<supa.AuthState>(sync: true);
    final repo = _Repository();
    when(repo.getCurrentUserSync).thenReturn(_user('user-1'));
    when(repo.checkMfaRequired).thenReturn(false);
    when(repo.onAuthStateChange).thenAnswer((_) => events.stream);
    when(repo.getStoredAccounts).thenAnswer((_) async => <StoredAuthAccount>[]);
    when(repo.getActiveStoredAccountId).thenAnswer((_) async => null);
    when(repo.syncCurrentSessionToMultiAccountStore).thenAnswer((_) async {});
    when(repo.refreshSession).thenAnswer((_) async {});
    when(repo.dispose).thenReturn(null);
    auth = AuthCubit(authRepository: repo);
    addTearDown(() async {
      await auth.close();
      await events.close();
    });

    harness = MastermindViewHarness();
    addTearDown(harness.dispose);
    await harness.setAccess(TestAccess.enabled);
    await harness.snapshot.ensureLoaded();
  });

  Future<void> pumpListener(WidgetTester tester) async {
    final workspaces = _MockWorkspaceCubit();
    whenListen(
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        currentWorkspace: Workspace(id: rootWorkspaceId),
      ),
    );
    addTearDown(workspaces.close);
    await tester.pumpWidget(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspaces),
        ],
        child: MultiBlocListener(
          listeners: [mastermindAuthResetListener(harness.runtime)],
          child: const SizedBox.shrink(),
        ),
      ),
    );
  }

  // The reset runs real async work (cache erase, permission check) that the
  // fake clock cannot advance, so give it real time and then pump.
  Future<void> settle(WidgetTester tester) async {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump();
  }

  testWidgets('a token refresh for the same account keeps the cache', (
    tester,
  ) async {
    await pumpListener(tester);
    expect(harness.snapshot.state, isA<MastermindSnapshotReady>());

    events.add(_event(supa.AuthChangeEvent.tokenRefreshed, 'user-1'));
    await tester.pump();

    expect(auth.state.user?.id, 'user-1');
    expect(harness.snapshot.state, isA<MastermindSnapshotReady>());
    expect(await harness.store.read(), isNotNull);
  });

  testWidgets('switching account erases the cache and re-checks access', (
    tester,
  ) async {
    await pumpListener(tester);
    expect(await harness.store.read(), isNotNull);

    events.add(_event(supa.AuthChangeEvent.signedIn, 'user-2'));
    await settle(tester);

    expect(auth.state.user?.id, 'user-2');
    expect(harness.snapshot.state, isA<MastermindSnapshotInitial>());
    expect(await harness.store.read(), isNull);
    // Access was synced for the selected (root) workspace, not dropped.
    expect(harness.access.state.wsId, rootWorkspaceId);
    expect(harness.access.state.enabled, isTrue);
  });

  testWidgets('logging out erases the cache and switches access off', (
    tester,
  ) async {
    await pumpListener(tester);
    expect(await harness.store.read(), isNotNull);

    events.add(_event(supa.AuthChangeEvent.signedOut));
    await settle(tester);

    expect(auth.state.status, AuthStatus.unauthenticated);
    expect(harness.snapshot.state, isA<MastermindSnapshotInitial>());
    expect(await harness.store.read(), isNull);
    expect(harness.access.state.wsId, isNull);
    expect(harness.access.state.enabled, isFalse);
  });

  group('mastermindAuthNeedsReset', () {
    test('ignores loading flips and a first sign-in', () {
      final signedIn = AuthState.authenticated(_user('user-1'));
      expect(
        mastermindAuthNeedsReset(signedIn, signedIn.copyWith(isLoading: true)),
        isFalse,
      );
      expect(
        mastermindAuthNeedsReset(
          const AuthState.unknown(),
          AuthState.authenticated(_user('user-1')),
        ),
        isFalse,
      );
      expect(
        mastermindAuthNeedsReset(
          const AuthState.unauthenticated(),
          const AuthState.unauthenticated(error: 'again'),
        ),
        isFalse,
      );
    });
  });
}
