import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_settings.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/view/apps/app_settings_page.dart';
import 'package:mobile/features/settings/view/apps/timer_app_settings.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/time_tracker/widgets/pomodoro_settings_dialog.dart';
import 'package:mobile/features/time_tracker/widgets/threshold_settings_dialog.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Repository extends Mock implements ITimeTrackerRepository {}

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

class _Cache extends Mock implements CacheStore {}

const ValueKey<String> _thresholdRow = ValueKey(
  'settings-request-threshold-row',
);
Map<String, dynamic> _decodeFallback(Object? _) => {};

const ValueKey<String> _pomodoroRow = ValueKey('settings-pomodoro-row');

WorkspaceState _scope(String id, {required bool personal}) => WorkspaceState(
  status: WorkspaceStatus.loaded,
  currentWorkspace: Workspace(id: id, name: id, personal: personal),
);

void main() {
  setUpAll(() {
    registerFallbackValue(const PomodoroSettings());
    registerFallbackValue(<String>[]);
    registerFallbackValue(const CacheKey(namespace: 'fallback'));
    registerFallbackValue(CachePolicies.moduleData);
    registerFallbackValue(_decodeFallback);
  });

  late _Auth auth;
  late _Workspaces workspaces;
  late _Repository repository;
  late _Permissions permissions;
  late StreamController<WorkspaceState> scopes;
  late _Cache cache;
  var granted = <String>{};

  setUp(() {
    auth = _Auth();
    workspaces = _Workspaces();
    repository = _Repository();
    permissions = _Permissions();
    scopes = StreamController<WorkspaceState>.broadcast();
    cache = _Cache();
    when(
      () => cache.read<Map<String, dynamic>>(
        key: any(named: 'key'),
        decode: any(named: 'decode'),
      ),
    ).thenAnswer(
      (_) async => const CacheReadResult(state: CacheEntryState.missing),
    );
    when(
      () => cache.write(
        key: any(named: 'key'),
        policy: any(named: 'policy'),
        payload: any(named: 'payload'),
        tags: any(named: 'tags'),
      ),
    ).thenAnswer((_) async {});
    when(
      () => repository.updateMissedEntryDateThreshold(
        any(),
        any(),
        statusChangeGracePeriodMinutes: any(
          named: 'statusChangeGracePeriodMinutes',
        ),
      ),
    ).thenAnswer((_) async {});
    granted = {
      manageTimeTrackingRequestsPermission,
      manageWorkspaceSettingsPermission,
    };
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.authenticated(
        supa.User(
          id: 'user',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '2026-01-01T00:00:00Z',
        ),
      ),
    );
    when(
      repository.loadPomodoroSettings,
    ).thenAnswer((_) async => const PomodoroSettings(focusMinutes: 30));
    when(() => repository.savePomodoroSettings(any())).thenAnswer((_) async {});
    when(() => repository.getWorkspaceSettings(any())).thenAnswer(
      (_) async => const WorkspaceSettings(missedEntryDateThreshold: 3),
    );
    when(
      () => repository.getWorkspaceConfigValue(any(), any()),
    ).thenAnswer((_) async => '10');
    when(
      () => permissions.getPermissions(
        wsId: any(named: 'wsId'),
        userId: any(named: 'userId'),
      ),
    ).thenAnswer(
      (_) async => WorkspacePermissions(permissions: granted, isCreator: false),
    );
  });

  tearDown(() async {
    await scopes.close();
    await auth.close();
    await workspaces.close();
  });

  Future<void> pump(WidgetTester tester, WorkspaceState initial) async {
    whenListen(workspaces, scopes.stream, initialState: initial);
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspaces),
        ],
        child: AppSettingsPage(
          appId: 'timer',
          timeTrackerRepository: repository,
          permissionsRepository: permissions,
          cacheStore: cache,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('personal workspaces never request or show the threshold', (
    tester,
  ) async {
    await pump(tester, _scope('personal', personal: true));
    expect(
      tester.widget<SettingsTile>(find.byKey(_pomodoroRow)).value,
      '30 min focus · 5 min break',
    );
    expect(find.byKey(_thresholdRow), findsNothing);
    verifyNever(
      () => permissions.getPermissions(
        wsId: any(named: 'wsId'),
        userId: any(named: 'userId'),
      ),
    );
  });

  testWidgets('managers of a shared workspace see the threshold summary', (
    tester,
  ) async {
    await pump(tester, _scope('team', personal: false));
    expect(
      tester.widget<SettingsTile>(find.byKey(_thresholdRow)).value,
      'Entries older than 3 days need approval',
    );
    verify(
      () => repository.getWorkspaceConfigValue(
        'team',
        timerStatusChangeGracePeriodConfigId,
      ),
    ).called(1);

    // Switching to a personal workspace withdraws the managed row.
    scopes.add(_scope('personal', personal: true));
    await tester.pumpAndSettle();
    expect(find.byKey(_thresholdRow), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a saved threshold is published to the cached settings', (
    tester,
  ) async {
    await pump(tester, _scope('team', personal: false));
    await tester.tap(find.byKey(_thresholdRow));
    await tester.pumpAndSettle();
    expect(find.byType(ThresholdSettingsDialog), findsOneWidget);
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    verify(
      () => repository.updateMissedEntryDateThreshold(
        'team',
        3,
        statusChangeGracePeriodMinutes: 10,
      ),
    ).called(1);
    // A queued offline save still reports success; Requests and Timer then
    // reload through the cache and must read the saved value, not 3.
    final captured = verify(
      () => cache.write(
        key: captureAny(named: 'key'),
        policy: any(named: 'policy'),
        payload: captureAny(named: 'payload'),
        tags: any(named: 'tags'),
      ),
    ).captured;
    expect(
      (captured[0] as CacheKey).params['path'],
      '/api/v1/workspaces/team/settings',
    );
    expect(captured[1], {'missed_entry_date_threshold': 3});
    expect(captured[3], {'value': '10'});
    await tester.drainShadToastTimers();
  });

  testWidgets('focus=threshold opens the editor once it loads', (tester) async {
    whenListen(
      workspaces,
      scopes.stream,
      initialState: _scope('team', personal: false),
    );
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspaces),
        ],
        child: AppSettingsPage(
          appId: 'timer',
          focus: 'threshold',
          timeTrackerRepository: repository,
          permissionsRepository: permissions,
          cacheStore: cache,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(ThresholdSettingsDialog), findsOneWidget);
    expect(find.text('Approval threshold'), findsWidgets);
  });

  for (final missing in [
    manageTimeTrackingRequestsPermission,
    manageWorkspaceSettingsPermission,
  ]) {
    testWidgets('missing $missing keeps the threshold hidden', (tester) async {
      granted = {...granted}..remove(missing);
      await pump(tester, _scope('team', personal: false));
      expect(find.byKey(_thresholdRow), findsNothing);
      verifyNever(() => repository.getWorkspaceSettings(any()));
    });
  }

  testWidgets('Pomodoro edits persist through the shared repository', (
    tester,
  ) async {
    await pump(tester, _scope('personal', personal: true));
    await tester.tap(find.byKey(_pomodoroRow));
    await tester.pumpAndSettle();
    expect(find.byType(PomodoroSettingsDialog), findsOneWidget);
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    verify(
      () => repository.savePomodoroSettings(
        const PomodoroSettings(focusMinutes: 30),
      ),
    ).called(1);
    expect(find.byType(PomodoroSettingsDialog), findsNothing);
  });
}
