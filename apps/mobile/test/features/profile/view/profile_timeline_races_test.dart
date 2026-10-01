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
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

ProfileTimelineSnapshot snapshot(
  String title, {
  bool partial = false,
  bool limited = false,
}) => (
  items: [
    ProfileTimelineItem(
      id: title,
      type: 'task',
      title: title,
      createdAt: DateTime(2026, 9, 30),
      scope: 'personal',
    ),
  ],
  partial: partial,
  limited: limited,
);

class _Repository extends ProfileTimelineRepository {
  ProfileTimelineSnapshot? cache;
  bool delayCache = false;
  final cacheReads = <Completer<ProfileTimelineSnapshot?>>[];
  final requests = <Completer<ProfileTimelineSnapshot>>[];
  @override
  Future<ProfileTimelineSnapshot?> cached(String ws, String user) async {
    if (!delayCache) return cache;
    final read = Completer<ProfileTimelineSnapshot?>();
    cacheReads.add(read);
    return await read.future;
  }

  @override
  Future<ProfileTimelineSnapshot> refresh(String ws, String user) {
    final request = Completer<ProfileTimelineSnapshot>();
    requests.add(request);
    return request.future;
  }
}

void main() {
  late _Auth auth;
  late _Workspace workspace;
  late _Repository repository;
  late StreamController<WorkspaceState> scopes;
  late StreamController<AuthState> accounts;
  setUp(() {
    auth = _Auth();
    workspace = _Workspace();
    repository = _Repository();
    scopes = StreamController<WorkspaceState>();
    accounts = StreamController<AuthState>();
    whenListen(
      auth,
      accounts.stream,
      initialState: const AuthState.authenticated(
        supa.User(
          id: 'owner',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '',
        ),
      ),
    );
    whenListen(
      workspace,
      scopes.stream,
      initialState: const WorkspaceState(
        currentWorkspace: Workspace(id: 'team', name: 'Team'),
      ),
    );
  });
  tearDown(() async {
    await scopes.close();
    await accounts.close();
    await auth.close();
    await workspace.close();
  });
  Future<void> mount(WidgetTester tester) async {
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
        ],
        child: SingleChildScrollView(
          child: ProfileTimelineSection(replayToken: 0, repository: repository),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets(
    'offline reopen retains cap and partial warnings and retry rows',
    (tester) async {
      repository.cache = snapshot('Cached task', partial: true, limited: true);
      await mount(tester);
      expect(find.text('Cached task'), findsOneWidget);
      expect(find.text('Some activity is unavailable.'), findsOneWidget);
      expect(
        find.textContaining('Some sources reached the display limit'),
        findsOneWidget,
      );
      repository.requests.single.completeError(Exception('Offline'));
      await tester.pumpAndSettle();
      expect(find.text('Cached task'), findsOneWidget);
      expect(find.text('Some activity is unavailable.'), findsOneWidget);
      expect(
        find.textContaining('Some sources reached the display limit'),
        findsOneWidget,
      );
      await tester.tap(find.text('Retry'));
      await tester.pump();
      expect(repository.requests.length, 2);
      repository.requests.last.complete(snapshot('Fresh task'));
      await tester.pumpAndSettle();
      expect(find.text('Fresh task'), findsOneWidget);
      expect(find.text('Some activity is unavailable.'), findsNothing);
      expect(
        find.textContaining('Some sources reached the display limit'),
        findsNothing,
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('workspace switch rejects a delayed old cache read', (
    tester,
  ) async {
    repository.delayCache = true;
    await mount(tester);
    expect(repository.cacheReads, hasLength(1));
    scopes.add(
      const WorkspaceState(
        currentWorkspace: Workspace(id: 'new-team', name: 'New team'),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(repository.cacheReads, hasLength(2));
    repository.cacheReads.first.complete(
      snapshot('Old cached task', partial: true, limited: true),
    );
    await tester.pump();
    expect(find.text('Old cached task'), findsNothing);
    expect(find.text('Some activity is unavailable.'), findsNothing);
    expect(
      find.textContaining('Some sources reached the display limit'),
      findsNothing,
    );
    expect(repository.requests, isEmpty);
    repository.cacheReads.last.complete(snapshot('New cached task'));
    await tester.pump();
    await tester.pump();
    expect(find.text('New cached task'), findsOneWidget);
    expect(repository.requests, hasLength(1));
    repository.requests.single.complete(snapshot('New refreshed task'));
    await tester.pumpAndSettle();
    expect(find.text('New refreshed task'), findsOneWidget);
    expect(find.text('Old cached task'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('workspace switch clears rows and ignores stale refresh', (
    tester,
  ) async {
    repository.cache = snapshot('Old task', limited: true);
    await mount(tester);
    repository.cache = null;
    scopes.add(
      const WorkspaceState(
        currentWorkspace: Workspace(id: 'new-team', name: 'New team'),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Old task'), findsNothing);
    expect(
      find.textContaining('Some sources reached the display limit'),
      findsNothing,
    );
    expect(repository.requests.length, 2);
    repository.requests.first.complete(snapshot('Stale task', partial: true));
    await tester.pump();
    expect(find.text('Stale task'), findsNothing);
    repository.requests.last.complete(snapshot('New task'));
    await tester.pumpAndSettle();
    expect(find.text('New task'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('sign out clears scoped rows and rejects in-flight refresh', (
    tester,
  ) async {
    repository.cache = snapshot('Private task', partial: true, limited: true);
    await mount(tester);
    accounts.add(const AuthState.unauthenticated());
    await tester.pump();
    await tester.pump();
    expect(find.text('Private task'), findsNothing);
    expect(
      find.textContaining('Some sources reached the display limit'),
      findsNothing,
    );
    repository.requests.single.complete(snapshot('Late private task'));
    await tester.pumpAndSettle();
    expect(find.text('Late private task'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('cold partial refresh exposes retry only after completion', (
    tester,
  ) async {
    await mount(tester);
    expect(find.bySemanticsLabel('Loading profile...'), findsOneWidget);
    repository.requests.single.complete(
      snapshot('Partial task', partial: true),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Some activity is unavailable'), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pump();
    expect(repository.requests.length, 2);
    // A partial snapshot remains visible while the retry is in flight.
    expect(find.text('Partial task'), findsOneWidget);
    repository.requests.last.completeError(Exception('Offline'));
    await tester.pumpAndSettle();
    expect(find.text('Partial task'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'failed cold fetch never claims empty activity; retry can confirm empty',
    (tester) async {
      await mount(tester);
      repository.requests.single.completeError(Exception('Offline'));
      await tester.pumpAndSettle();
      expect(find.text('No recent activity in this workspace'), findsNothing);
      expect(find.text('Activity could not be refreshed.'), findsWidgets);
      await tester.tap(find.byKey(const ValueKey('timeline-date-toggle')));
      await tester.pumpAndSettle();
      expect(find.text('No activity was returned for this day.'), findsNothing);
      await tester.tap(find.text('Retry'));
      await tester.pump();
      repository.requests.last.complete((
        items: <ProfileTimelineItem>[],
        partial: false,
        limited: false,
      ));
      await tester.pumpAndSettle();
      expect(
        find.text('No activity was returned for this day.'),
        findsOneWidget,
      );
      expect(find.text('Activity could not be refreshed.'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  for (final capped in [false, true]) {
    testWidgets(
      'empty incomplete snapshot does not claim absence capped=$capped',
      (tester) async {
        await mount(tester);
        repository.requests.single.complete((
          items: <ProfileTimelineItem>[],
          partial: !capped,
          limited: capped,
        ));
        await tester.pumpAndSettle();
        expect(find.text('No recent activity in this workspace'), findsNothing);
        expect(find.text('Some activity is unavailable.'), findsWidgets);
        await tester.tap(find.byKey(const ValueKey('timeline-date-toggle')));
        await tester.pumpAndSettle();
        expect(
          find.text('No activity was returned for this day.'),
          findsNothing,
        );
        expect(find.text('Some activity is unavailable.'), findsWidgets);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
