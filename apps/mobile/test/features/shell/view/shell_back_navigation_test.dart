import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/notifications/widgets/notifications_action_button.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/avatar_dropdown.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _MockShellProfileCubit extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

class _FallbackShellProfileCubit extends Cubit<ShellProfileState>
    implements ShellProfileCubit {
  _FallbackShellProfileCubit() : super(const ShellProfileState());

  @override
  void primeFromAuthenticatedUser(dynamic user) {}

  @override
  Future<void> loadFromAuthenticatedUser(
    dynamic user, {
    bool forceRefresh = false,
  }) async {}

  @override
  Future<void> refreshIfStale(dynamic user) async {}

  @override
  Future<void> applyExternalProfile(
    dynamic profile, {
    DateTime? lastUpdatedAt,
    bool isFromCache = false,
  }) async {}

  @override
  Future<void> clear() async {}
}

Widget _buildTestApp({
  required GoRouter router,
  required AppTabCubit appTabCubit,
  required AuthCubit authCubit,
  required WorkspaceCubit workspaceCubit,
  ShellProfileCubit? shellProfileCubit,
}) {
  return MultiBlocProvider(
    providers: [
      BlocProvider.value(value: appTabCubit),
      BlocProvider<AuthCubit>.value(value: authCubit),
      BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
      BlocProvider(create: (_) => ShellMiniNavCubit()),
      BlocProvider(create: (_) => ShellTitleOverrideCubit()),
      if (shellProfileCubit != null)
        BlocProvider<ShellProfileCubit>.value(value: shellProfileCubit)
      else
        BlocProvider<ShellProfileCubit>(
          create: (_) => _FallbackShellProfileCubit(),
        ),
    ],
    child: shad.ShadcnApp.router(
      theme: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
      darkTheme: const shad.ThemeData.dark(
        colorScheme: shad.ColorSchemes.darkZinc,
      ),
      localizationsDelegates: const [
        ...AppLocalizations.localizationsDelegates,
        shad.ShadcnLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
    ),
  );
}

GoRouter _buildRouter({required String initialLocation}) {
  return GoRouter(
    initialLocation: initialLocation,
    routes: [
      ShellRoute(
        builder: (context, state, child) => BlocProvider(
          create: (_) => AssistantChromeCubit(),
          child: ShellPage(
            matchedLocation: state.uri.path,
            enableDebugLogs: false,
            child: child,
          ),
        ),
        routes: [
          GoRoute(
            path: Routes.home,
            builder: (context, state) => const _RoutePage(label: 'home'),
          ),
          GoRoute(
            path: Routes.apps,
            builder: (context, state) => const _RoutePage(label: 'apps'),
          ),
          GoRoute(
            path: Routes.assistant,
            builder: (context, state) => const _RoutePage(label: 'assistant'),
          ),
          GoRoute(
            path: Routes.tasks,
            builder: (context, state) => const _RoutePage(label: 'tasks'),
          ),
          GoRoute(
            path: Routes.taskBoards,
            builder: (context, state) => const _RoutePage(label: 'task-boards'),
          ),
          GoRoute(
            path: Routes.taskBoardDetail,
            builder: (context, state) => _TaskBoardDetailRoutePage(
              boardId: state.pathParameters['boardId'] ?? 'unknown',
            ),
          ),
          GoRoute(
            path: Routes.taskEstimates,
            builder: (context, state) => const _TaskEstimatesRoutePage(),
          ),
          GoRoute(
            path: Routes.taskPortfolio,
            builder: (context, state) => const _TaskPortfolioRoutePage(),
          ),
          GoRoute(
            path: Routes.finance,
            builder: (context, state) => const _RoutePage(label: 'finance'),
          ),
          GoRoute(
            path: Routes.wallets,
            builder: (context, state) => const _RoutePage(label: 'wallets'),
          ),
          GoRoute(
            path: Routes.walletDetail,
            builder: (context, state) => _RoutePage(
              label: 'wallet-${state.pathParameters['walletId']}',
            ),
          ),
          GoRoute(
            path: Routes.timer,
            builder: (context, state) => const _RoutePage(label: 'timer'),
          ),
          GoRoute(
            path: Routes.timerRequests,
            builder: (context, state) =>
                const _RoutePage(label: 'timer-requests'),
          ),
        ],
      ),
    ],
  );
}

class _RoutePage extends StatelessWidget {
  const _RoutePage({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(child: Text(label));
  }
}

class _TaskBoardDetailRoutePage extends StatelessWidget {
  const _TaskBoardDetailRoutePage({required this.boardId});

  final String boardId;

  @override
  Widget build(BuildContext context) {
    final location = Routes.taskBoardDetailPath(boardId);
    return Stack(
      children: [
        _RoutePage(label: 'task-board-$boardId'),
        ShellMiniNav(
          ownerId: 'task-board-$boardId',
          locations: {location},
          deepLinkBackRoute: Routes.taskBoards,
          items: [
            ShellMiniNavItemSpec(
              id: 'back',
              icon: Icons.chevron_left,
              label: context.l10n.navBack,
              callbackToken: boardId,
            ),
          ],
        ),
        ShellTitleOverride(
          ownerId: 'task-board-title-$boardId',
          locations: {location},
          title: 'Board $boardId',
        ),
      ],
    );
  }
}

class _TaskEstimatesRoutePage extends StatelessWidget {
  const _TaskEstimatesRoutePage();

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        const _RoutePage(label: 'task-estimates'),
        ShellMiniNav(
          ownerId: 'task-estimates-mini-nav',
          locations: const {Routes.taskEstimates},
          deepLinkBackRoute: Routes.tasks,
          items: [
            ShellMiniNavItemSpec(
              id: 'back',
              icon: Icons.chevron_left,
              label: context.l10n.navBack,
              callbackToken: 'back',
            ),
            ShellMiniNavItemSpec(
              id: 'estimates',
              icon: Icons.calculate_outlined,
              label: context.l10n.taskEstimatesTitle,
              selected: true,
              callbackToken: 'estimates',
            ),
            ShellMiniNavItemSpec(
              id: 'labels',
              icon: Icons.label_outline,
              label: context.l10n.taskLabelsTab,
              callbackToken: 'labels',
            ),
          ],
        ),
      ],
    );
  }
}

class _TaskPortfolioRoutePage extends StatelessWidget {
  const _TaskPortfolioRoutePage();

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        const _RoutePage(label: 'task-portfolio'),
        ShellMiniNav(
          ownerId: 'task-portfolio-mini-nav',
          locations: const {Routes.taskPortfolio},
          deepLinkBackRoute: Routes.tasks,
          items: [
            ShellMiniNavItemSpec(
              id: 'back',
              icon: Icons.chevron_left,
              label: context.l10n.navBack,
              callbackToken: 'back',
            ),
            ShellMiniNavItemSpec(
              id: 'projects',
              icon: Icons.folder_open_outlined,
              label: context.l10n.taskPortfolioProjectsTab,
              selected: true,
              callbackToken: 'projects',
            ),
            ShellMiniNavItemSpec(
              id: 'initiatives',
              icon: Icons.account_tree_outlined,
              label: context.l10n.taskPortfolioInitiativesTab,
              callbackToken: 'initiatives',
            ),
          ],
        ),
      ],
    );
  }
}

Future<void> _pumpForTransitions(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

void main() {
  group('Shell back navigation', () {
    late AppTabCubit appTabCubit;
    late _MockAuthCubit authCubit;
    late _MockWorkspaceCubit workspaceCubit;
    late _MockShellProfileCubit shellProfileCubit;

    setUp(() {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      appTabCubit = AppTabCubit(settingsRepository: SettingsRepository());
      authCubit = _MockAuthCubit();
      workspaceCubit = _MockWorkspaceCubit();
      shellProfileCubit = _MockShellProfileCubit();

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
        shellProfileCubit,
        const Stream<ShellProfileState>.empty(),
        initialState: const ShellProfileState(),
      );
    });

    tearDown(() async {
      await appTabCubit.close();
      await authCubit.close();
      await workspaceCubit.close();
      await shellProfileCubit.close();
    });

    testWidgets('system back navigates through in-session route history', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final router = _buildRouter(initialLocation: Routes.home);
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _buildTestApp(
          router: router,
          appTabCubit: appTabCubit,
          authCubit: authCubit,
          workspaceCubit: workspaceCubit,
          shellProfileCubit: shellProfileCubit,
        ),
      );
      await _pumpForTransitions(tester);

      router.go(Routes.tasks);
      await _pumpForTransitions(tester);
      router.go(Routes.taskBoards);
      await _pumpForTransitions(tester);

      expect(router.routeInformationProvider.value.uri.path, Routes.taskBoards);

      await tester.binding.handlePopRoute();
      await _pumpForTransitions(tester);
      expect(router.routeInformationProvider.value.uri.path, Routes.tasks);

      await tester.binding.handlePopRoute();
      await _pumpForTransitions(tester);
      expect(router.routeInformationProvider.value.uri.path, Routes.apps);
    });

    testWidgets(
      'shared shell header actions stay mounted between apps and module roots',
      (
        tester,
      ) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(390, 844);
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        final router = _buildRouter(initialLocation: Routes.apps);
        addTearDown(router.dispose);

        await tester.pumpWidget(
          _buildTestApp(
            router: router,
            appTabCubit: appTabCubit,
            authCubit: authCubit,
            workspaceCubit: workspaceCubit,
            shellProfileCubit: shellProfileCubit,
          ),
        );
        await _pumpForTransitions(tester);

        final avatarStateBefore = tester.state(find.byType(AvatarDropdown));
        final notificationsStateBefore = tester.state(
          find.byType(NotificationsActionButton),
        );

        router.go(Routes.tasks);
        await _pumpForTransitions(tester);

        expect(find.byType(AvatarDropdown), findsOneWidget);
        expect(find.byType(NotificationsActionButton), findsOneWidget);
        expect(
          identical(
            tester.state(find.byType(AvatarDropdown)),
            avatarStateBefore,
          ),
          isTrue,
        );
        expect(
          identical(
            tester.state(find.byType(NotificationsActionButton)),
            notificationsStateBefore,
          ),
          isTrue,
        );
      },
    );

    testWidgets('module routes show app-specific bottom navigation', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final router = _buildRouter(initialLocation: Routes.apps);
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _buildTestApp(
          router: router,
          appTabCubit: appTabCubit,
          authCubit: authCubit,
          workspaceCubit: workspaceCubit,
          shellProfileCubit: shellProfileCubit,
        ),
      );
      await _pumpForTransitions(tester);

      final shellContext = tester.element(find.byType(ShellPage));
      final l10n = AppLocalizations.of(shellContext);

      expect(find.text(l10n.navBack), findsNothing);
      expect(find.text(l10n.taskBoardsTitle), findsNothing);

      router.go(Routes.tasks);
      await _pumpForTransitions(tester);

      expect(find.text(l10n.navBack), findsOneWidget);
      expect(find.text(l10n.taskBoardsTitle), findsOneWidget);
      expect(find.text(l10n.taskPlanningTitle), findsOneWidget);
      expect(find.text(l10n.taskPortfolioTitle), findsOneWidget);
    });

    testWidgets('injected mini-nav takes precedence over module mini-nav', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final router = _buildRouter(initialLocation: Routes.taskPortfolio);
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _buildTestApp(
          router: router,
          appTabCubit: appTabCubit,
          authCubit: authCubit,
          workspaceCubit: workspaceCubit,
          shellProfileCubit: shellProfileCubit,
        ),
      );
      await _pumpForTransitions(tester);

      final shellContext = tester.element(find.byType(ShellPage));
      final l10n = AppLocalizations.of(shellContext);

      expect(find.text(l10n.navBack), findsOneWidget);
      expect(find.text(l10n.taskPortfolioProjectsTab), findsOneWidget);
      expect(find.text(l10n.taskPortfolioInitiativesTab), findsOneWidget);
      expect(find.text(l10n.taskBoardsTitle), findsNothing);
      expect(find.text(l10n.taskPlanningTitle), findsNothing);
    });

    testWidgets('system back from mini-app root goes to apps picker', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final router = _buildRouter(initialLocation: Routes.home);
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _buildTestApp(
          router: router,
          appTabCubit: appTabCubit,
          authCubit: authCubit,
          workspaceCubit: workspaceCubit,
        ),
      );
      await _pumpForTransitions(tester);

      router.go(Routes.apps);
      await _pumpForTransitions(tester);
      router.go(Routes.tasks);
      await _pumpForTransitions(tester);

      expect(router.routeInformationProvider.value.uri.path, Routes.tasks);

      await tester.binding.handlePopRoute();
      await _pumpForTransitions(tester);

      expect(router.routeInformationProvider.value.uri.path, Routes.apps);
    });

    testWidgets('apps root requires double back to exit', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      var systemPopCalls = 0;
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            ..setMockMethodCallHandler(SystemChannels.platform, (call) async {
              if (call.method == 'SystemNavigator.pop') {
                systemPopCalls += 1;
              }
              return null;
            });
      addTearDown(() {
        messenger.setMockMethodCallHandler(SystemChannels.platform, null);
      });

      final router = _buildRouter(initialLocation: Routes.apps);
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _buildTestApp(
          router: router,
          appTabCubit: appTabCubit,
          authCubit: authCubit,
          workspaceCubit: workspaceCubit,
        ),
      );
      await _pumpForTransitions(tester);

      final popScope = tester.widget<PopScope<dynamic>>(
        find.byWidgetPredicate((widget) => widget is PopScope).first,
      );
      final onPopInvoked = popScope.onPopInvokedWithResult;
      expect(
        onPopInvoked,
        isNotNull,
        reason: 'Shell PopScope callback should be wired for back handling.',
      );
      if (onPopInvoked == null) {
        fail('Shell PopScope callback should not be null.');
      }

      onPopInvoked(false, null);
      await _pumpForTransitions(tester);

      final context = tester.element(find.byType(ShellPage));
      final l10n = AppLocalizations.of(context);
      expect(router.routeInformationProvider.value.uri.path, Routes.apps);
      expect(systemPopCalls, 0);
      expect(find.text(l10n.commonPressBackAgainToExit), findsOneWidget);

      onPopInvoked(false, null);
      await _pumpForTransitions(tester);

      expect(systemPopCalls, 1);
      await tester.drainShadToastTimers();
    });

    testWidgets('PopScope ignores already-popped routes', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final router = _buildRouter(initialLocation: Routes.timerRequests);
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _buildTestApp(
          router: router,
          appTabCubit: appTabCubit,
          authCubit: authCubit,
          workspaceCubit: workspaceCubit,
        ),
      );
      await _pumpForTransitions(tester);

      final popScope = tester.widget<PopScope<dynamic>>(
        find.byWidgetPredicate((widget) => widget is PopScope).first,
      );
      final onPopInvoked = popScope.onPopInvokedWithResult;
      expect(
        onPopInvoked,
        isNotNull,
        reason: 'Shell PopScope callback should be wired for back handling.',
      );
      if (onPopInvoked == null) {
        fail('Shell PopScope callback should not be null.');
      }

      onPopInvoked(true, null);
      await _pumpForTransitions(tester);

      expect(
        router.routeInformationProvider.value.uri.path,
        Routes.timerRequests,
      );
    });

    testWidgets('home root requires double back to exit', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      var systemPopCalls = 0;
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            ..setMockMethodCallHandler(SystemChannels.platform, (call) async {
              if (call.method == 'SystemNavigator.pop') {
                systemPopCalls += 1;
              }
              return null;
            });
      addTearDown(() {
        messenger.setMockMethodCallHandler(SystemChannels.platform, null);
      });

      final router = _buildRouter(initialLocation: Routes.home);
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _buildTestApp(
          router: router,
          appTabCubit: appTabCubit,
          authCubit: authCubit,
          workspaceCubit: workspaceCubit,
        ),
      );
      await _pumpForTransitions(tester);

      final popScope = tester.widget<PopScope<dynamic>>(
        find.byWidgetPredicate((widget) => widget is PopScope).first,
      );
      final onPopInvoked = popScope.onPopInvokedWithResult;
      expect(
        onPopInvoked,
        isNotNull,
        reason: 'Shell PopScope callback should be wired for back handling.',
      );
      if (onPopInvoked == null) {
        fail('Shell PopScope callback should not be null.');
      }

      onPopInvoked(false, null);
      await _pumpForTransitions(tester);

      final context = tester.element(find.byType(ShellPage));
      final l10n = AppLocalizations.of(context);
      expect(router.routeInformationProvider.value.uri.path, Routes.home);
      expect(systemPopCalls, 0);
      expect(find.text(l10n.commonPressBackAgainToExit), findsOneWidget);

      onPopInvoked(false, null);
      await _pumpForTransitions(tester);

      expect(systemPopCalls, 1);
      await tester.drainShadToastTimers();
    });

    testWidgets('apps tab opens picker even when a mini-app is selected', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final router = _buildRouter(initialLocation: Routes.home);
      addTearDown(router.dispose);

      final timerModule = AppRegistry.moduleById('timer');
      expect(
        timerModule,
        isNotNull,
        reason: 'Timer module should be registered.',
      );
      if (timerModule == null) {
        fail('AppRegistry.moduleById("timer") returned null.');
      }
      await appTabCubit.select(timerModule);

      await tester.pumpWidget(
        _buildTestApp(
          router: router,
          appTabCubit: appTabCubit,
          authCubit: authCubit,
          workspaceCubit: workspaceCubit,
        ),
      );
      await _pumpForTransitions(tester);

      await tester.tap(find.byIcon(Icons.apps_outlined).first);
      await _pumpForTransitions(tester);

      expect(router.routeInformationProvider.value.uri.path, Routes.apps);
    });

    testWidgets(
      'back handling ignores duplicate PopScope callback at mini-app root',
      (
        tester,
      ) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(390, 844);
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        var systemPopCalls = 0;
        final messenger =
            TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
              ..setMockMethodCallHandler(SystemChannels.platform, (call) async {
                if (call.method == 'SystemNavigator.pop') {
                  systemPopCalls += 1;
                }
                return null;
              });
        addTearDown(() {
          messenger.setMockMethodCallHandler(SystemChannels.platform, null);
        });

        final router = _buildRouter(initialLocation: Routes.home);
        addTearDown(router.dispose);

        await tester.pumpWidget(
          _buildTestApp(
            router: router,
            appTabCubit: appTabCubit,
            authCubit: authCubit,
            workspaceCubit: workspaceCubit,
          ),
        );
        await _pumpForTransitions(tester);

        router.go(Routes.apps);
        await _pumpForTransitions(tester);
        router.go(Routes.tasks);
        await _pumpForTransitions(tester);

        final shellState = tester.state(find.byType(ShellPage));
        final shellFinder = find.byType(ShellPage);
        final popScope = tester.widget<PopScope<dynamic>>(
          find
              .descendant(
                of: shellFinder,
                matching: find.byWidgetPredicate(
                  (widget) => widget is PopScope,
                ),
              )
              .first,
        );

        await tester.binding.handlePopRoute();
        final onPopInvoked = popScope.onPopInvokedWithResult;
        expect(
          onPopInvoked,
          isNotNull,
          reason: 'Shell PopScope callback should be wired for back handling.',
        );
        if (onPopInvoked == null) {
          fail('Shell PopScope callback should not be null.');
        }
        onPopInvoked(false, null);
        await _pumpForTransitions(tester);

        final context = tester.element(shellFinder);
        final l10n = AppLocalizations.of(context);
        expect(router.routeInformationProvider.value.uri.path, Routes.apps);
        expect(systemPopCalls, 0);
        expect(find.text(l10n.commonPressBackAgainToExit), findsNothing);
        expect(shellState.mounted, isTrue);
      },
    );

    testWidgets('system back keeps in-mini-app history before root', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final router = _buildRouter(initialLocation: Routes.home);
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _buildTestApp(
          router: router,
          appTabCubit: appTabCubit,
          authCubit: authCubit,
          workspaceCubit: workspaceCubit,
        ),
      );
      await _pumpForTransitions(tester);

      router.go(Routes.tasks);
      await _pumpForTransitions(tester);
      router.go(Routes.taskBoards);
      await _pumpForTransitions(tester);
      router.go(Routes.taskBoardDetailPath('board-1'));
      await _pumpForTransitions(tester);

      expect(
        router.routeInformationProvider.value.uri.path,
        Routes.taskBoardDetailPath('board-1'),
      );

      await tester.binding.handlePopRoute();
      await _pumpForTransitions(tester);
      expect(router.routeInformationProvider.value.uri.path, Routes.taskBoards);

      await tester.binding.handlePopRoute();
      await _pumpForTransitions(tester);
      expect(router.routeInformationProvider.value.uri.path, Routes.tasks);
    });

    testWidgets('timer requests back returns to timer then apps', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final router = _buildRouter(initialLocation: Routes.home);
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _buildTestApp(
          router: router,
          appTabCubit: appTabCubit,
          authCubit: authCubit,
          workspaceCubit: workspaceCubit,
        ),
      );
      await _pumpForTransitions(tester);

      router.go(Routes.apps);
      await _pumpForTransitions(tester);
      router.go(Routes.timer);
      await _pumpForTransitions(tester);
      router.go(Routes.timerRequests);
      await _pumpForTransitions(tester);

      expect(
        router.routeInformationProvider.value.uri.path,
        Routes.timerRequests,
      );

      await tester.binding.handlePopRoute();
      await _pumpForTransitions(tester);
      expect(router.routeInformationProvider.value.uri.path, Routes.timer);

      await tester.binding.handlePopRoute();
      await _pumpForTransitions(tester);
      expect(router.routeInformationProvider.value.uri.path, Routes.apps);
    });

    testWidgets(
      'system back falls back to mini-app root for deep-linked routes',
      (
        tester,
      ) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(390, 844);
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        final router = _buildRouter(
          initialLocation: Routes.taskBoardDetailPath('board-1'),
        );
        addTearDown(router.dispose);

        await tester.pumpWidget(
          _buildTestApp(
            router: router,
            appTabCubit: appTabCubit,
            authCubit: authCubit,
            workspaceCubit: workspaceCubit,
          ),
        );
        await _pumpForTransitions(tester);

        expect(
          router.routeInformationProvider.value.uri.path,
          Routes.taskBoardDetailPath('board-1'),
        );

        await tester.binding.handlePopRoute();
        await _pumpForTransitions(tester);

        expect(
          router.routeInformationProvider.value.uri.path,
          Routes.taskBoards,
        );
      },
    );

    testWidgets('mini-app root takes precedence over global history fallback', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final router = _buildRouter(initialLocation: Routes.home);
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _buildTestApp(
          router: router,
          appTabCubit: appTabCubit,
          authCubit: authCubit,
          workspaceCubit: workspaceCubit,
        ),
      );
      await _pumpForTransitions(tester);

      router.go(Routes.taskBoardDetailPath('board-1'));
      await _pumpForTransitions(tester);

      expect(
        router.routeInformationProvider.value.uri.path,
        Routes.taskBoardDetailPath('board-1'),
      );

      await tester.binding.handlePopRoute();
      await _pumpForTransitions(tester);

      expect(router.routeInformationProvider.value.uri.path, Routes.taskBoards);
    });

    testWidgets(
      'system back falls back to finance root for deep-linked wallet detail',
      (
        tester,
      ) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(390, 844);
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        final router = _buildRouter(
          initialLocation: Routes.walletDetailPath('wallet-1'),
        );
        addTearDown(router.dispose);

        await tester.pumpWidget(
          _buildTestApp(
            router: router,
            appTabCubit: appTabCubit,
            authCubit: authCubit,
            workspaceCubit: workspaceCubit,
          ),
        );
        await _pumpForTransitions(tester);

        expect(
          router.routeInformationProvider.value.uri.path,
          Routes.walletDetailPath('wallet-1'),
        );

        await tester.binding.handlePopRoute();
        await _pumpForTransitions(tester);

        expect(router.routeInformationProvider.value.uri.path, Routes.finance);
      },
    );

    testWidgets(
      'persists /apps as last tab after returning from mini-app root',
      (
        tester,
      ) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(390, 844);
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        final router = _buildRouter(initialLocation: Routes.timer);
        addTearDown(router.dispose);

        await tester.pumpWidget(
          _buildTestApp(
            router: router,
            appTabCubit: appTabCubit,
            authCubit: authCubit,
            workspaceCubit: workspaceCubit,
          ),
        );
        await _pumpForTransitions(tester);

        router.go(Routes.apps);
        await _pumpForTransitions(tester);

        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getString('last-tab-route'), Routes.apps);
      },
    );

    testWidgets('persists / as last tab when navigating to home', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final router = _buildRouter(initialLocation: Routes.apps);
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _buildTestApp(
          router: router,
          appTabCubit: appTabCubit,
          authCubit: authCubit,
          workspaceCubit: workspaceCubit,
        ),
      );
      await _pumpForTransitions(tester);

      router.go(Routes.home);
      await _pumpForTransitions(tester);

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('last-tab-route'), Routes.home);
    });
  });
}
