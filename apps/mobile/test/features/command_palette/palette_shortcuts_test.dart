import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/command_palette/command_palette_host.dart';
import 'package:mobile/features/command_palette/palette_view.dart';
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

Future<void> _chord(
  WidgetTester tester,
  LogicalKeyboardKey modifier,
  LogicalKeyboardKey key,
) async {
  await tester.sendKeyDownEvent(modifier);
  await tester.sendKeyEvent(key);
  await tester.sendKeyUpEvent(modifier);
  await tester.pumpAndSettle();
}

Future<GoRouter> _pumpApp(
  WidgetTester tester, {
  required TargetPlatform platform,
  required Size size,
}) async {
  debugDefaultTargetPlatformOverride = platform;
  addTearDown(() => debugDefaultTargetPlatformOverride = null);
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  SharedPreferences.setMockInitialValues({});

  final auth = _AuthCubit();
  final workspace = _WorkspaceCubit();
  final lock = _AppLockCubit();
  final chrome = ShellChromeActionsCubit();
  addTearDown(chrome.close);
  whenListen(
    auth,
    const Stream<AuthState>.empty(),
    initialState: const AuthState.authenticated(
      User(id: 'actor', appMetadata: {}, aud: 'authenticated', createdAt: ''),
    ),
  );
  whenListen(
    workspace,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      currentWorkspace: Workspace(id: 'workspace'),
    ),
  );
  whenListen(
    lock,
    const Stream<AppLockState>.empty(),
    initialState: const AppLockState(hasLoaded: true),
  );
  final router = GoRouter(
    routes: [
      GoRoute(
        path: Routes.home,
        builder: (_, _) => const Scaffold(
          body: AppTextField(placeholder: 'Page input', autofocus: true),
        ),
      ),
      GoRoute(
        path: Routes.apps,
        builder: (_, _) => const Scaffold(body: Text('Apps route')),
      ),
    ],
  );
  addTearDown(router.dispose);
  final tasks = _TaskRepository();
  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<WorkspaceCubit>.value(value: workspace),
        BlocProvider<AppLockCubit>.value(value: lock),
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
  return router;
}

void main() {
  testWidgets('Ctrl+K opens above routed content and arrows select a route', (
    tester,
  ) async {
    final router = await _pumpApp(
      tester,
      platform: TargetPlatform.linux,
      size: const Size(1200, 800),
    );

    await tester.sendKeyEvent(LogicalKeyboardKey.keyK);
    expect(find.byType(CommandPaletteView), findsNothing);
    await _chord(
      tester,
      LogicalKeyboardKey.controlLeft,
      LogicalKeyboardKey.keyK,
    );
    final palette = find.byType(CommandPaletteView);
    expect(palette, findsOneWidget);
    expect(tester.getSize(palette).width, lessThanOrEqualTo(640));
    expect(find.text('Search commands, tasks, and notes'), findsOneWidget);

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(palette, findsNothing);
    expect(router.routerDelegate.currentConfiguration.uri.path, '/apps');
    expect(find.text('Apps route'), findsOneWidget);
  });

  testWidgets('Cmd+K opens a compact sheet, toggles it, and respects Escape', (
    tester,
  ) async {
    final router = await _pumpApp(
      tester,
      platform: TargetPlatform.macOS,
      size: const Size(390, 700),
    );
    Future<void> toggle() =>
        _chord(tester, LogicalKeyboardKey.metaLeft, LogicalKeyboardKey.keyK);

    await toggle();
    expect(find.byType(BottomSheet), findsOneWidget);
    await toggle();
    expect(find.byType(CommandPaletteView), findsNothing);

    await toggle();
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    expect(find.byType(CommandPaletteView), findsNothing);
    expect(router.routerDelegate.currentConfiguration.uri.path, '/');
  });
}
