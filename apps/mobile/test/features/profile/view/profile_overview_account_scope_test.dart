import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/view/profile_overview_page.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

AuthState _signedIn(String id) => AuthState.authenticated(
  supa.User(
    id: id,
    appMetadata: const {},
    userMetadata: const {},
    aud: 'authenticated',
    createdAt: '',
  ),
);

void main() {
  testWidgets(
    'Overview rejects old account identity and delayed shell profiles',
    (tester) async {
      final auth = _Auth();
      final profile = _Profile();
      final workspaces = _Workspaces();
      final accounts = StreamController<AuthState>();
      final profiles = StreamController<ShellProfileState>();
      const old = ShellProfileState(
        userId: 'previous',
        profile: UserProfile(
          id: 'previous',
          displayName: 'Previous identity',
          email: 'previous@example.test',
        ),
        avatarUrl: 'https://synthetic.invalid/previous-avatar.png',
        error: 'Synthetic offline fixture',
      );
      whenListen(auth, accounts.stream, initialState: _signedIn('previous'));
      whenListen(profile, profiles.stream, initialState: old);
      whenListen(
        workspaces,
        const Stream<WorkspaceState>.empty(),
        initialState: const WorkspaceState(),
      );
      when(() => workspaces.hasAuthenticatedActor).thenReturn(false);
      addTearDown(auth.close);
      addTearDown(profile.close);
      addTearDown(workspaces.close);
      addTearDown(accounts.close);
      addTearDown(profiles.close);
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<ShellProfileCubit>.value(value: profile),
            BlocProvider<WorkspaceCubit>.value(value: workspaces),
          ],
          child: ProfileOverviewPage(cacheUserId: () => auth.state.user?.id),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Previous identity'), findsOneWidget);
      expect(find.byType(Image), findsOneWidget);
      accounts.add(_signedIn('next'));
      await tester.pump();
      await tester.pump();
      expect(find.text('Previous identity'), findsNothing);
      expect(find.text('previous@example.test'), findsNothing);
      expect(find.byType(Image), findsNothing);
      profiles.add(old.copyWith(isRefreshing: true));
      await tester.pump();
      expect(find.text('Previous identity'), findsNothing);
      profiles.add(
        const ShellProfileState(
          userId: 'next',
          profile: UserProfile(id: 'next', displayName: 'Current identity'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Current identity'), findsOneWidget);
      profiles.add(
        const ShellProfileState(
          userId: 'next',
          profile: UserProfile(
            id: 'previous',
            displayName: 'Mismatched profile',
          ),
          error: 'Synthetic offline fixture',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Mismatched profile'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
