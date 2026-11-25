import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/command_palette/command_palette_host.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

class _AuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _WorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _AppLockCubit extends MockCubit<AppLockState> implements AppLockCubit {}

class _TaskRepository extends Mock implements TaskRepository {}

User paletteUser(String id) => User(
  id: id,
  appMetadata: const {},
  userMetadata: const {},
  aud: 'authenticated',
  createdAt: '',
);

Future<void> paletteChord(
  WidgetTester tester,
  LogicalKeyboardKey modifier,
  LogicalKeyboardKey key,
) async {
  await tester.sendKeyDownEvent(modifier);
  await tester.sendKeyEvent(key);
  await tester.sendKeyUpEvent(modifier);
  await tester.pumpAndSettle();
}

/// The palette host over mocked session cubits whose states the test drives.
class PaletteHarness {
  PaletteHarness._(
    this.router,
    this.chrome,
    this._auth,
    this._workspace,
    this._lock,
  );

  final GoRouter router;
  final ShellChromeActionsCubit chrome;
  final StreamController<AuthState> _auth;
  final StreamController<WorkspaceState> _workspace;
  final StreamController<AppLockState> _lock;

  String get path => router.routerDelegate.currentConfiguration.uri.path;

  void emitAuth(AuthState state) => _auth.add(state);
  void emitWorkspace(WorkspaceState state) => _workspace.add(state);
  void emitLock(AppLockState state) => _lock.add(state);
}

Future<PaletteHarness> pumpPaletteApp(
  WidgetTester tester, {
  required TargetPlatform platform,
  required Size size,
  WidgetBuilder? home,
  String? initialLocation,
  AuthState? auth,
  WorkspaceState? workspace,
  AppLockState? lock,
}) async {
  debugDefaultTargetPlatformOverride = platform;
  addTearDown(() => debugDefaultTargetPlatformOverride = null);
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  SharedPreferences.setMockInitialValues({});

  final authCubit = _AuthCubit();
  final workspaceCubit = _WorkspaceCubit();
  final lockCubit = _AppLockCubit();
  final authEvents = StreamController<AuthState>.broadcast();
  final workspaceEvents = StreamController<WorkspaceState>.broadcast();
  final lockEvents = StreamController<AppLockState>.broadcast();
  addTearDown(authEvents.close);
  addTearDown(workspaceEvents.close);
  addTearDown(lockEvents.close);
  final chrome = ShellChromeActionsCubit();
  addTearDown(chrome.close);
  chrome.register(
    registrationId: 'tasks',
    ownerId: 'tasks',
    locations: const {Routes.taskAssigned},
    actions: [
      ShellActionSpec(id: 'my-task-create', icon: Icons.add, onPressed: () {}),
    ],
  );
  whenListen(
    authCubit,
    authEvents.stream,
    initialState: auth ?? AuthState.authenticated(paletteUser('actor')),
  );
  whenListen(
    workspaceCubit,
    workspaceEvents.stream,
    initialState:
        workspace ??
        const WorkspaceState(currentWorkspace: Workspace(id: 'workspace')),
  );
  whenListen(
    lockCubit,
    lockEvents.stream,
    initialState: lock ?? const AppLockState(hasLoaded: true),
  );
  Widget page(String label) => Scaffold(body: Text(label));
  final router = GoRouter(
    initialLocation: initialLocation ?? Routes.home,
    routes: [
      GoRoute(
        path: Routes.home,
        builder: (context, _) =>
            home?.call(context) ??
            Scaffold(
              body: TextButton(
                autofocus: true,
                onPressed: () {},
                child: const Text('Page action'),
              ),
            ),
      ),
      GoRoute(path: Routes.apps, builder: (_, _) => page('Apps route')),
      GoRoute(
        path: Routes.taskAssigned,
        builder: (_, _) => const Scaffold(body: TextField(autofocus: true)),
      ),
      for (final route in [
        Routes.assistant,
        Routes.notifications,
        Routes.profileRoot,
        Routes.settings,
        Routes.workspaceSelect,
        Routes.onboarding,
        Routes.telemetryConsent,
        Routes.login,
      ])
        GoRoute(path: route, builder: (_, _) => page('Route $route')),
    ],
  );
  addTearDown(router.dispose);
  final tasks = _TaskRepository();
  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: authCubit),
        BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
        BlocProvider<AppLockCubit>.value(value: lockCubit),
        BlocProvider.value(value: chrome),
      ],
      child: MaterialApp.router(
        routerConfig: router,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        builder: (_, child) => PaletteHost(router, tasks, child!),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return PaletteHarness._(
    router,
    chrome,
    authEvents,
    workspaceEvents,
    lockEvents,
  );
}
