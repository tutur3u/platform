import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_timeline_section.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

ProfileTimelineSnapshot _snapshot(String id) => (
  items: [
    ProfileTimelineItem(
      id: id,
      type: 'task',
      title: id,
      createdAt: DateTime(2026, 10, 4),
      scope: 'personal',
    ),
  ],
  partial: false,
  limited: false,
);

class _Repository extends ProfileTimelineRepository {
  final pages = <Completer<ProfileTimelineSnapshot>>[];
  int? continuation = 1;
  @override
  Future<ProfileTimelineSnapshot?> cached(String ws, String user) async => null;
  @override
  Future<ProfileTimelineSnapshot> refresh(String ws, String user) async =>
      _snapshot('first');
  @override
  int? nextPage(String ws, String user) => continuation;
  @override
  Future<ProfileTimelineSnapshot> loadMore(String ws, String user, int page) {
    expect(ws, 'personal');
    expect(user, 'owner');
    expect(page, 1);
    final pending = Completer<ProfileTimelineSnapshot>();
    pages.add(pending);
    return pending.future;
  }
}

void main() {
  testWidgets('short viewport serializes paging and pauses errors', (
    tester,
  ) async {
    final auth = _Auth();
    final workspace = _Workspace();
    final repository = _Repository();
    final replay = ValueNotifier(0);
    when(() => auth.state).thenReturn(
      const AuthState.authenticated(
        supa.User(
          id: 'owner',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '',
        ),
      ),
    );
    when(() => workspace.state).thenReturn(
      const WorkspaceState(
        workspaces: [Workspace(id: 'personal', personal: true)],
        currentWorkspace: Workspace(id: 'team'),
      ),
    );
    when(() => workspace.hasAuthenticatedActor).thenReturn(true);
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
        ],
        child: ValueListenableBuilder<int>(
          valueListenable: replay,
          builder: (_, token, _) => ProfileTimelineSection(
            fullSurface: true,
            datesOpen: false,
            replayToken: token,
            cacheUserId: () => 'owner',
            repository: repository,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(repository.pages, hasLength(1));
    await tester.pump();
    await tester.pump();
    expect(repository.pages, hasLength(1));
    repository.pages.single.completeError(
      const FormatException('Partial page'),
    );
    await tester.pumpAndSettle();
    await tester.drainShadToastTimers();
    await tester.pumpAndSettle();
    expect(find.text('first'), findsOneWidget);
    expect(find.text('Some activity is unavailable.'), findsNothing);
    expect(repository.pages, hasLength(1));
    replay.value++;
    await tester.pumpAndSettle();
    expect(repository.pages, hasLength(2));
    repository.continuation = null;
    repository.pages.last.complete(_snapshot('second'));
    await tester.pumpAndSettle();
    expect(find.text('first'), findsOneWidget);
    expect(find.text('second'), findsOneWidget);
    expect(find.text('All loaded activity shown'), findsNothing);
    expect(tester.takeException(), isNull);
    replay.dispose();
    repository.dispose();
    await auth.close();
    await workspace.close();
  });
}
