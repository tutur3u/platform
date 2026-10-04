import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_timeline_section.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Repository extends ProfileTimelineRepository {
  @override
  Future<ProfileTimelineSnapshot?> cached(String ws, String user) async => null;
  @override
  Future<ProfileTimelineSnapshot> refresh(String ws, String user) async => (
    items: [
      ProfileTimelineItem(
        id: 'record',
        type: 'task',
        title: 'Personal record',
        createdAt: DateTime(2026, 10),
        scope: 'personal',
      ),
    ],
    partial: false,
    limited: false,
  );
}

void main() {
  const personal = Workspace(id: 'personal', personal: true);
  const team = Workspace(id: 'team');
  const signedIn = AuthState.authenticated(
    supa.User(
      id: 'owner',
      appMetadata: {},
      userMetadata: {},
      aud: 'authenticated',
      createdAt: '',
    ),
  );
  for (final transition in ['none', 'account', 'membership']) {
    testWidgets('record navigation selects personal and fences $transition', (
      tester,
    ) async {
      final auth = _Auth();
      final workspaces = _Workspaces();
      var actor = signedIn;
      var state = const WorkspaceState(
        workspaces: [team, personal],
        currentWorkspace: team,
      );
      whenListen(auth, const Stream<AuthState>.empty(), initialState: signedIn);
      whenListen(
        workspaces,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );
      when(() => auth.state).thenAnswer((_) => actor);
      when(() => workspaces.state).thenAnswer((_) => state);
      when(() => workspaces.hasAuthenticatedActor).thenReturn(true);
      final selection = Completer<void>();
      when(() => workspaces.selectWorkspace(personal)).thenAnswer((_) async {
        await selection.future;
        state = state.copyWith(currentWorkspace: personal);
      });
      addTearDown(auth.close);
      addTearDown(workspaces.close);
      final router = GoRouter(
        initialLocation: Routes.profileRoot,
        routes: [
          GoRoute(
            path: Routes.profileRoot,
            builder: (_, _) => MultiBlocProvider(
              providers: [
                BlocProvider<AuthCubit>.value(value: auth),
                BlocProvider<WorkspaceCubit>.value(value: workspaces),
              ],
              child: ProfileTimelineSection(
                replayToken: 0,
                fullSurface: true,
                datesOpen: false,
                cacheUserId: () => actor.user?.id,
                repository: _Repository(),
              ),
            ),
          ),
          GoRoute(
            path: Routes.taskBoards,
            builder: (_, _) => const Text('Personal destination'),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        shad.ShadcnApp.router(
          theme: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
          localizationsDelegates: const [
            ...AppLocalizations.localizationsDelegates,
            shad.ShadcnLocalizations.delegate,
          ],
          supportedLocales: AppLocalizations.supportedLocales,
          builder: ShadcnMaterialBridge.appBuilder,
          routerConfig: router,
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Personal record'));
      await tester.pump();
      verify(() => workspaces.selectWorkspace(personal)).called(1);
      expect(find.text('Personal destination'), findsNothing);
      if (transition == 'account') {
        actor = const AuthState.unauthenticated();
      }
      if (transition == 'membership') {
        state = state.copyWith(workspaces: [team]);
      }
      selection.complete();
      await tester.pumpAndSettle();
      expect(
        find.text('Personal destination'),
        transition == 'none' ? findsOneWidget : findsNothing,
      );
      expect(tester.takeException(), isNull);
    });
  }
}
