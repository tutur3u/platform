import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/view/profile_activity_section.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

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
  for (final size in [
    const Size(320, 700),
    const Size(390, 844),
    const Size(844, 390),
    const Size(1032, 1376),
    const Size(1376, 1032),
  ]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('private activity fits $size at text scale $scale', (
        tester,
      ) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final auth = _Auth();
        final workspace = _Workspace();
        whenListen(
          auth,
          const Stream<AuthState>.empty(),
          initialState: _signedIn('owner'),
        );
        whenListen(
          workspace,
          const Stream<WorkspaceState>.empty(),
          initialState: const WorkspaceState(
            currentWorkspace: Workspace(id: 'team', name: 'Team'),
          ),
        );
        addTearDown(auth.close);
        addTearDown(workspace.close);
        await tester.pumpApp(
          MultiBlocProvider(
            providers: [
              BlocProvider<AuthCubit>.value(value: auth),
              BlocProvider<WorkspaceCubit>.value(value: workspace),
            ],
            child: MediaQuery(
              data: MediaQueryData(
                size: size,
                textScaler: TextScaler.linear(scale),
              ),
              child: SingleChildScrollView(
                child: ProfileActivitySection(
                  timezoneLoader: () async => 'UTC',
                  statsLoader: (ws, user, tz, {required personal}) async =>
                      const TimeTrackerStats(
                        todayTime: 3600,
                        weekTime: 36000,
                        monthTime: 360000,
                      ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('60 min tracked'), findsOneWidget);
        expect(find.text('Last 12 weeks'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('account changes discard delayed private activity', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final auth = _Auth();
    final workspace = _Workspace();
    final authChanges = StreamController<AuthState>();
    whenListen(auth, authChanges.stream, initialState: _signedIn('first'));
    whenListen(
      workspace,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        currentWorkspace: Workspace(id: 'workspace', name: 'Team'),
      ),
    );
    final first = Completer<TimeTrackerStats>();
    final second = Completer<TimeTrackerStats>();
    final requestedUsers = <String>[];
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
          BlocProvider(create: (_) => CalendarSettingsCubit()),
        ],
        child: SingleChildScrollView(
          child: ProfileActivitySection(
            timezoneLoader: () async => 'Asia/Ho_Chi_Minh',
            statsLoader: (wsId, userId, timezone, {required personal}) {
              expect(wsId, 'workspace');
              expect(timezone, 'Asia/Ho_Chi_Minh');
              requestedUsers.add(userId);
              return userId == 'first' ? first.future : second.future;
            },
          ),
        ),
      ),
    );
    await tester.pump();
    authChanges.add(_signedIn('second'));
    await tester.pump();
    await tester.pump();
    second.complete(const TimeTrackerStats(todayTime: 120));
    await tester.pumpAndSettle();
    expect(find.text('2 min tracked'), findsOneWidget);
    first.complete(const TimeTrackerStats(todayTime: 3660));
    await tester.pumpAndSettle();
    expect(requestedUsers, ['first', 'second']);
    expect(find.text('61 min tracked'), findsNothing);
    expect(find.text('2 min tracked'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await authChanges.close();
    await auth.close();
    await workspace.close();
  });
}
