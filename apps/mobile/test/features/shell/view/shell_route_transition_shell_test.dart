import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/shell/view/shell_route_fade.dart';
import 'package:mobile/features/shell/view/shell_route_motion.dart';
import 'package:mobile/features/shell/view/shell_route_transition.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _MockShellProfileCubit extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

const String _timer = Routes.timerRequests;
const String _products = Routes.inventoryProducts;
final String _wallet = Routes.walletDetailPath('1');
final String _guarded = Routes.walletDetailPath('guarded');

/// Back presses the guarded wallet page handles itself.
var _guardedBacks = 0;

Widget _page(GoRouterState state) {
  final location = state.uri.path;
  final body = Center(child: Text('body $location'));
  if (location != _guarded) return body;
  return Stack(
    children: [
      body,
      ShellChromeActions(
        ownerId: 'guarded-wallet',
        locations: {location},
        onBack: () async => _guardedBacks++,
      ),
    ],
  );
}

/// Production-shaped shell routes: flat siblings, opened with go or push.
GoRouter _router(String initialLocation) => GoRouter(
  initialLocation: initialLocation,
  routes: [
    ShellRoute(
      // The shared app theme is created once per test isolate, so its
      // platform follows whichever test built it first; pin this test's.
      builder: (context, state, child) => Theme(
        data: Theme.of(context).copyWith(platform: defaultTargetPlatform),
        child: BlocProvider(
          create: (_) => AssistantChromeCubit(),
          child: ShellPage(
            matchedLocation: state.uri.path,
            routePattern: state.fullPath,
            enableDebugLogs: false,
            homePageBuilder: (_) => const SizedBox.shrink(),
            child: child,
          ),
        ),
      ),
      routes: shellTransitionRoutes([
        for (final path in [
          Routes.home,
          Routes.apps,
          Routes.tasks,
          Routes.taskBoards,
          _timer,
          _products,
          Routes.walletDetail,
        ])
          GoRoute(path: path, builder: (_, state) => _page(state)),
      ]),
    ),
  ],
);

ShellRouteTransitionController _transitions(WidgetTester tester) => tester
    .widget<ShellRouteTransitionScope>(find.byType(ShellRouteTransitionScope))
    .controller;

List<String> _history(WidgetTester tester) =>
    // The state class is private to the shell library.
    ((tester.state(find.byType(ShellPage)) as dynamic).routeHistoryForTesting
            as List<Object?>)
        .cast<String>();

/// The location the shell shows. A pushed location is not reported to
/// the platform route information, so the shell's own location is read.
String _location(WidgetTester tester) => tester
    .widget<ShellRouteTransitionScope>(find.byType(ShellRouteTransitionScope))
    .location;

Finder _title(String location) => find.byKey(ValueKey(location));

/// Opacity of the route fade layer (a fade wrapping the paint-offset layer)
/// holding [finder].
double _layerOpacity(WidgetTester tester, Finder finder) => tester
    .widgetList<FadeTransition>(
      find.ancestor(of: finder, matching: find.byType(FadeTransition)),
    )
    .firstWhere((fade) => fade.child.runtimeType.toString() == '_RouteShift')
    .opacity
    .value;

/// The dock contents' route layers, the retained one first.
List<double> _dockLayers(WidgetTester tester) => tester
    .widgetList<FadeTransition>(
      find.descendant(
        of: find.descendant(
          of: find.byKey(const ValueKey('persistent-shell-dock-material')),
          matching: find.byType(ShellRouteFade),
        ),
        matching: find.byType(FadeTransition),
      ),
    )
    .where((fade) => fade.child.runtimeType.toString() == '_RouteShift')
    .map((fade) => fade.opacity.value)
    .toList();

void main() {
  late AppTabCubit appTabCubit;
  late _MockAuthCubit authCubit;
  late _MockWorkspaceCubit workspaceCubit;
  late _MockShellProfileCubit profileCubit;

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    _guardedBacks = 0;
    appTabCubit = AppTabCubit(settingsRepository: SettingsRepository());
    authCubit = _MockAuthCubit();
    workspaceCubit = _MockWorkspaceCubit();
    profileCubit = _MockShellProfileCubit();
    whenListen(
      authCubit,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.unauthenticated(),
    );
    whenListen(
      workspaceCubit,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(),
    );
    whenListen(
      profileCubit,
      const Stream<ShellProfileState>.empty(),
      initialState: const ShellProfileState(),
    );
  });

  tearDown(() async {
    await appTabCubit.close();
    await authCubit.close();
    await workspaceCubit.close();
    await profileCubit.close();
  });

  Future<GoRouter> pumpShell(WidgetTester tester, String location) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    final router = _router(location);
    addTearDown(router.dispose);
    await tester.pumpAppRouter(
      router,
      wrap: (app) => MultiBlocProvider(
        providers: [
          BlocProvider.value(value: appTabCubit),
          BlocProvider<AuthCubit>.value(value: authCubit),
          BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
          BlocProvider<ShellProfileCubit>.value(value: profileCubit),
          BlocProvider(create: (_) => ShellMiniNavCubit()),
          BlocProvider(create: (_) => ShellTitleOverrideCubit()),
          BlocProvider(create: (_) => ShellChromeActionsCubit()),
        ],
        child: app,
      ),
    );
    await tester.pumpAndSettle();
    return router;
  }

  /// Pumps single frames until the location and its title have changed,
  /// noting whether a route transition ran on any of them.
  Future<bool> goAndWatch(
    WidgetTester tester,
    GoRouter router,
    String location,
  ) async {
    router.go(location);
    var animated = false;
    for (var i = 0; i < 4; i++) {
      await tester.pump();
      animated |= _transitions(tester).active;
    }
    return animated;
  }

  Future<void> swipeBack(WidgetTester tester) async {
    final gesture = await tester.startGesture(const Offset(4, 400));
    await gesture.moveBy(const Offset(40, 0));
    await tester.pump();
    await gesture.moveBy(const Offset(260, 0));
    await tester.pump();
    await gesture.up();
    await tester.pumpAndSettle();
  }

  testWidgets('a swipe-pop does not grow the Back history', (tester) async {
    final router = await pumpShell(tester, _timer);
    unawaited(router.push(_wallet));
    await tester.pumpAndSettle();
    final afterPush = _history(tester);
    expect(afterPush.last, _timer);

    await swipeBack(tester);
    expect(_location(tester), _timer);
    expect(_history(tester), afterPush);
    expect(tester.takeException(), isNull);
  }, variant: TargetPlatformVariant.only(TargetPlatform.iOS));

  testWidgets('no edge swipe over a page that registers its own Back', (
    tester,
  ) async {
    final router = await pumpShell(tester, _timer);
    unawaited(router.push(_guarded));
    await tester.pumpAndSettle();
    final scope = tester.widget<ShellRouteTransitionScope>(
      find.byType(ShellRouteTransitionScope),
    );
    expect(scope.interceptsBack(), isTrue);
    await swipeBack(tester);
    expect(_location(tester), _guarded);
    expect(find.text('body $_guarded'), findsOneWidget);
    expect(_guardedBacks, 0);
    expect(_transitions(tester).active, isFalse);
    expect(tester.takeException(), isNull);
  }, variant: TargetPlatformVariant.only(TargetPlatform.iOS));

  testWidgets('a navigation during a pop is a forward move', (tester) async {
    final router = await pumpShell(tester, _timer);
    unawaited(router.push(_wallet));
    await tester.pumpAndSettle();
    final afterPush = _history(tester);

    router.pop();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 40));
    expect(_location(tester), _timer);
    expect(_transitions(tester).active, isTrue);
    // The pop itself is Back.
    expect(_history(tester), afterPush);

    router.go(_products);
    await tester.pumpAndSettle();
    expect(_history(tester), [...afterPush, _timer]);
    expect(find.text('body $_products'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('root destinations swap without a transition', (tester) async {
    final router = await pumpShell(tester, Routes.home);
    expect(await goAndWatch(tester, router, Routes.apps), isFalse);
    expect(_title(Routes.home), findsNothing);
    expect(_title(Routes.apps), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('sibling mini-app destinations swap without a transition', (
    tester,
  ) async {
    final router = await pumpShell(tester, Routes.tasks);
    expect(await goAndWatch(tester, router, Routes.taskBoards), isFalse);
    expect(_title(Routes.tasks), findsNothing);
    expect(_title(Routes.taskBoards), findsOneWidget);
    expect(find.text('body ${Routes.taskBoards}'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('another location of the same route pattern swaps in place', (
    tester,
  ) async {
    final router = await pumpShell(tester, _wallet);
    final next = Routes.walletDetailPath('2');
    router.go(next);
    await tester.pump();
    // No held frame of the previous location's title.
    expect(_title(_wallet), findsNothing);
    expect(_title(next), findsOneWidget);
    await tester.pumpAndSettle();
    expect(_transitions(tester).active, isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a go between flat pages runs the chrome on the timeline', (
    tester,
  ) async {
    final router = await pumpShell(tester, _timer);
    router.go(_products);
    for (var i = 0; i < 4 && !_transitions(tester).active; i++) {
      await tester.pump();
    }
    expect(_transitions(tester).active, isTrue);
    await tester.pump(const Duration(milliseconds: 45));
    final v = _transitions(tester).animation.value;
    expect(v, closeTo(45 / 220, 2e-3));
    expect(
      _layerOpacity(tester, _title(_timer)),
      closeTo(ShellRouteMotion.titleExitOpacity(v), 1e-6),
    );
    expect(
      _layerOpacity(tester, _title(_products)),
      closeTo(ShellRouteMotion.titleEnterOpacity(v), 1e-6),
    );
    expect(_dockLayers(tester), [
      closeTo(ShellRouteMotion.contentExitOpacity(v), 1e-6),
      closeTo(ShellRouteMotion.contentEnterOpacity(v), 1e-6),
    ]);
    await tester.pump(const Duration(milliseconds: 105));
    final later = _transitions(tester).animation.value;
    expect(
      _layerOpacity(tester, _title(_products)),
      closeTo(ShellRouteMotion.titleEnterOpacity(later), 1e-6),
    );
    expect(
      _dockLayers(tester).last,
      closeTo(ShellRouteMotion.contentEnterOpacity(later), 1e-6),
    );
    await tester.pumpAndSettle();
    expect(_title(_timer), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a push between unrelated pages runs the transition', (
    tester,
  ) async {
    final router = await pumpShell(tester, _timer);
    expect(await goAndWatch(tester, router, _products), isTrue);
    await tester.pumpAndSettle();
    expect(find.text('body $_products'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
