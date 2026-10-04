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

Finder _limitedTooltip() => find.byWidgetPredicate(
  (widget) =>
      widget is Tooltip &&
      widget.message?.contains('Some sources reached the display limit') ==
          true,
);

void main() {
  late _Auth auth;
  late _Workspace workspace;
  late _Repository repository;
  late ValueNotifier<int> replay;
  late StreamController<WorkspaceState> scopes;
  late StreamController<AuthState> accounts;
  setUp(() {
    auth = _Auth();
    workspace = _Workspace();
    when(() => workspace.hasAuthenticatedActor).thenReturn(true);
    repository = _Repository();
    replay = ValueNotifier(0);
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
        workspaces: [Workspace(id: 'personal', personal: true)],
        currentWorkspace: Workspace(id: 'team', name: 'Team'),
      ),
    );
  });
  tearDown(() async {
    replay.dispose();
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
          child: ValueListenableBuilder<int>(
            valueListenable: replay,
            builder: (_, value, _) => ProfileTimelineSection(
              cacheUserId: () => auth.state.user?.id,
              replayToken: value,
              repository: repository,
            ),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('offline reopen retains rows and a bounded failure notice', (
    tester,
  ) async {
    repository.cache = snapshot('Cached task', partial: true, limited: true);
    await mount(tester);
    expect(find.textContaining('over the last 30 days'), findsNothing);
    expect(find.text('Cached task'), findsOneWidget);
    expect(find.text('Some activity is unavailable.'), findsNothing);
    expect(_limitedTooltip(), findsNothing);
    repository.requests.single.completeError(Exception('Offline'));
    await tester.pumpAndSettle();
    await tester.drainShadToastTimers();
    await tester.pumpAndSettle();
    expect(find.text('Cached task'), findsOneWidget);
    expect(find.text('Some activity is unavailable.'), findsNothing);
    expect(_limitedTooltip(), findsNothing);
    await tester.pump(const Duration(seconds: 6));
    expect(find.text('Some activity is unavailable.'), findsNothing);
    replay.value++;
    await tester.pump();
    expect(repository.requests.length, 2);
    repository.requests.last.complete(snapshot('Fresh task'));
    await tester.pumpAndSettle();
    await tester.drainShadToastTimers();
    await tester.pumpAndSettle();
    expect(find.text('Fresh task'), findsOneWidget);
    expect(find.text('Some activity is unavailable.'), findsNothing);
    expect(_limitedTooltip(), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('partial refresh retains unavailable cached source rows', (
    tester,
  ) async {
    repository.cache = snapshot('Retained task');
    await mount(tester);
    repository.requests.single.complete(snapshot('New task', partial: true));
    await tester.pumpAndSettle();
    await tester.drainShadToastTimers();
    await tester.pumpAndSettle();
    expect(find.text('Retained task'), findsOneWidget);
    expect(find.text('New task'), findsOneWidget);
    expect(find.text('Retry'), findsNothing);
  });

  testWidgets('workspace switch rejects a delayed old cache read', (
    tester,
  ) async {
    repository.delayCache = true;
    await mount(tester);
    expect(repository.cacheReads, hasLength(1));
    scopes.add(
      const WorkspaceState(
        workspaces: [Workspace(id: 'new-personal', personal: true)],
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
    expect(_limitedTooltip(), findsNothing);
    expect(repository.requests, isEmpty);
    repository.cacheReads.last.complete(snapshot('New cached task'));
    await tester.pump();
    await tester.pump();
    expect(find.text('New cached task'), findsOneWidget);
    expect(repository.requests, hasLength(1));
    repository.requests.single.complete(snapshot('New refreshed task'));
    await tester.pumpAndSettle();
    await tester.drainShadToastTimers();
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
        workspaces: [Workspace(id: 'new-personal', personal: true)],
        currentWorkspace: Workspace(id: 'new-team', name: 'New team'),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Old task'), findsNothing);
    expect(_limitedTooltip(), findsNothing);
    expect(repository.requests.length, 2);
    repository.requests.first.complete(snapshot('Stale task', partial: true));
    await tester.pump();
    expect(find.text('Stale task'), findsNothing);
    repository.requests.last.complete(snapshot('New task'));
    await tester.pumpAndSettle();
    await tester.drainShadToastTimers();
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
    expect(_limitedTooltip(), findsNothing);
    repository.requests.single.complete(snapshot('Late private task'));
    await tester.pumpAndSettle();
    await tester.drainShadToastTimers();
    await tester.pumpAndSettle();
    expect(find.text('Late private task'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'cold partial refresh shows a bounded notice and refresh retains rows',
    (tester) async {
      await mount(tester);
      expect(find.bySemanticsLabel('Loading'), findsOneWidget);
      repository.requests.single.complete(
        snapshot('Partial task', partial: true),
      );
      await tester.pumpAndSettle();
      await tester.drainShadToastTimers();
      await tester.pumpAndSettle();
      expect(find.textContaining('Some activity is unavailable'), findsNothing);
      replay.value++;
      await tester.pump();
      expect(repository.requests.length, 2);
      // A partial snapshot remains visible while the retry is in flight.
      expect(find.text('Partial task'), findsOneWidget);
      repository.requests.last.completeError(Exception('Offline'));
      await tester.pumpAndSettle();
      await tester.drainShadToastTimers();
      await tester.pumpAndSettle();
      expect(find.text('Partial task'), findsOneWidget);
      expect(find.text('Retry'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'failed cold fetch never claims empty activity; retry can confirm empty',
    (tester) async {
      await mount(tester);
      repository.requests.single.completeError(Exception('Offline'));
      await tester.pumpAndSettle();
      await tester.drainShadToastTimers();
      await tester.pumpAndSettle();
      expect(find.text('No recent activity in this workspace'), findsNothing);
      expect(find.text('Activity could not be refreshed.'), findsNothing);
      expect(find.text('Retry'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('timeline-date-toggle')));
      await tester.pumpAndSettle();
      await tester.drainShadToastTimers();
      await tester.pumpAndSettle();
      expect(find.text('No activity was returned for this day.'), findsNothing);
      expect(find.text('Activity could not be refreshed.'), findsNothing);
      replay.value++;
      await tester.pump();
      repository.requests.last.complete((
        items: <ProfileTimelineItem>[],
        partial: false,
        limited: false,
      ));
      await tester.pumpAndSettle();
      await tester.drainShadToastTimers();
      await tester.pumpAndSettle();
      expect(
        find.text('No activity was returned for this day.'),
        findsOneWidget,
      );
      expect(find.text('Activity could not be refreshed.'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  for (final explicitDate in [false, true]) {
    testWidgets(
      'cold load follows first activity unless date picked: $explicitDate',
      (tester) async {
        final now = DateTime.now();
        final today = DateTime(now.year, now.month, now.day);
        final older = DateTime(today.year, today.month, today.day - 8);
        await mount(tester);
        await tester.tap(find.byKey(const ValueKey('timeline-date-toggle')));
        await tester.pumpAndSettle();
        await tester.drainShadToastTimers();
        await tester.pumpAndSettle();
        if (explicitDate) {
          await tester.tap(
            find.byKey(ValueKey('timeline-date-${today.toIso8601String()}')),
          );
          await tester.pumpAndSettle();
          await tester.drainShadToastTimers();
          await tester.pumpAndSettle();
        }
        repository.requests.single.complete((
          items: [
            ProfileTimelineItem(
              id: 'cold-newest',
              type: 'task',
              title: 'First loaded activity',
              createdAt: older.add(const Duration(hours: 12)),
              scope: 'personal',
            ),
          ],
          partial: false,
          limited: false,
        ));
        await tester.pumpAndSettle();
        await tester.drainShadToastTimers();
        await tester.pumpAndSettle();
        if (explicitDate) {
          expect(find.text('First loaded activity'), findsOneWidget);
          expect(
            find.text('No activity was returned for this day.'),
            findsOneWidget,
          );
        } else {
          expect(find.text('First loaded activity'), findsOneWidget);
          expect(
            find.text('No activity was returned for this day.'),
            findsNothing,
          );
        }
        expect(tester.takeException(), isNull);
      },
    );
  }

  for (final freshEmpty in [false, true]) {
    testWidgets(
      'empty cache stays provisional during refresh: freshEmpty=$freshEmpty',
      (tester) async {
        repository.cache = (
          items: <ProfileTimelineItem>[],
          partial: false,
          limited: false,
        );
        await mount(tester);
        await tester.pumpAndSettle();
        await tester.drainShadToastTimers();
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('timeline-refreshing')),
          findsOneWidget,
        );
        expect(find.text('No recent activity in this workspace'), findsNothing);
        final before = tester.getRect(
          find.byKey(const ValueKey('timeline-browser')),
        );
        await tester.tap(find.byKey(const ValueKey('timeline-date-toggle')));
        await tester.pumpAndSettle();
        await tester.drainShadToastTimers();
        await tester.pumpAndSettle();
        expect(
          find.text('No activity was returned for this day.'),
          findsNothing,
        );
        repository.requests.single.complete(
          freshEmpty
              ? (items: <ProfileTimelineItem>[], partial: false, limited: false)
              : snapshot('Fresh response activity'),
        );
        await tester.pumpAndSettle();
        await tester.drainShadToastTimers();
        await tester.pumpAndSettle();
        expect(find.byKey(const ValueKey('timeline-refreshing')), findsNothing);
        expect(
          tester.getRect(find.byKey(const ValueKey('timeline-browser'))),
          before,
        );
        if (freshEmpty) {
          expect(
            find.text('No activity was returned for this day.'),
            findsOneWidget,
          );
        } else {
          expect(find.text('Fresh response activity'), findsOneWidget);
          expect(
            find.text('No activity was returned for this day.'),
            findsNothing,
          );
        }
        expect(tester.takeException(), isNull);
      },
    );
  }

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
        await tester.drainShadToastTimers();
        await tester.pumpAndSettle();
        expect(find.text('No recent activity in this workspace'), findsNothing);
        await tester.pump(const Duration(seconds: 6));
        expect(find.text('Some activity is unavailable.'), findsNothing);
        await tester.tap(find.byKey(const ValueKey('timeline-date-toggle')));
        await tester.pumpAndSettle();
        await tester.drainShadToastTimers();
        await tester.pumpAndSettle();
        expect(
          find.text('No activity was returned for this day.'),
          findsNothing,
        );
        await tester.pump(const Duration(seconds: 6));
        expect(find.text('Some activity is unavailable.'), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets('selected team switch keeps the same personal load', (
    tester,
  ) async {
    await mount(tester);
    expect(repository.requests, hasLength(1));
    scopes.add(
      const WorkspaceState(
        workspaces: [Workspace(id: 'personal', personal: true)],
        currentWorkspace: Workspace(id: 'another-team'),
      ),
    );
    await tester.pump();
    repository.requests.single.complete(snapshot('Personal task'));
    await tester.pumpAndSettle();
    await tester.drainShadToastTimers();
    await tester.pumpAndSettle();
    expect(repository.requests, hasLength(1));
    expect(find.text('Personal task'), findsOneWidget);
  });

  testWidgets('unverified account transition clears and fences old responses', (
    tester,
  ) async {
    repository.cache = snapshot('Previous private row');
    await mount(tester);
    expect(find.text('Previous private row'), findsOneWidget);
    when(() => workspace.hasAuthenticatedActor).thenReturn(false);
    accounts.add(
      const AuthState.authenticated(
        supa.User(
          id: 'next-account',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '',
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Previous private row'), findsNothing);
    expect(repository.requests, hasLength(1));
    repository.requests.single.complete(snapshot('Late previous-account row'));
    await tester.pumpAndSettle();
    await tester.drainShadToastTimers();
    await tester.pumpAndSettle();
    expect(find.text('Late previous-account row'), findsNothing);
    expect(find.text('Activity could not be refreshed.'), findsOneWidget);
  });

  testWidgets('replay and repeated retry cannot overlap one refresh', (
    tester,
  ) async {
    repository.cache = snapshot('Retained row', partial: true);
    await mount(tester);
    replay.value++;
    await tester.pump();
    expect(repository.requests, hasLength(1));
    repository.requests.single.completeError(Exception('Offline'));
    await tester.pumpAndSettle();
    await tester.drainShadToastTimers();
    await tester.pumpAndSettle();
    replay.value++;
    await tester.pump();
    replay.value++;
    await tester.pump();
    expect(repository.requests, hasLength(2));
    expect(find.text('Retained row'), findsOneWidget);
    repository.requests.last.complete(snapshot('Recovered row'));
    await tester.pumpAndSettle();
    await tester.drainShadToastTimers();
    await tester.pumpAndSettle();
    expect(find.text('Recovered row'), findsOneWidget);
    expect(find.text('Some activity is unavailable.'), findsNothing);
  });
}
