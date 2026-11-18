import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/notifications/widgets/notifications_action_button.dart';
import 'package:mobile/features/profile/view/profile_navigation_avatar.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/avatar_dropdown.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';
import 'shell_viewport_checks.dart';

part 'shell_dock_overflow_check.dart';
part 'shell_dock_reselection_checks.dart';
part 'shell_mini_nav_update_checks.dart';
part 'shell_navigation_harness.dart';
part 'shell_peer_section_checks.dart';
part 'shell_profile_navigation_checks.dart';

void main() {
  group('Shell back navigation', () {
    late AppTabCubit appTabCubit;
    late _MockAuthCubit authCubit;
    late _WsCubit workspaceCubit;
    late _MockShellProfileCubit shellProfileCubit;

    setUp(() {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      appTabCubit = AppTabCubit(settingsRepository: SettingsRepository());
      authCubit = _MockAuthCubit();
      workspaceCubit = _WsCubit();
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

    _registerDockReselectionChecks(
      () => appTabCubit,
      () => authCubit,
      () => workspaceCubit,
    );
    registerShellViewportChecks((tester) async {
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
    });
    testWidgets('system back leaves a peer section for its app origin', (
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
      expect(router.routeInformationProvider.value.uri.path, Routes.home);

      expect(
        find.byKey(const ValueKey('apps-picker-fullscreen')),
        findsNothing,
      );
    });

    _registerProfileNavigationChecks(
      () => appTabCubit,
      () => authCubit,
      () => workspaceCubit,
      () => shellProfileCubit,
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

      final compactNavItems = tester
          .widget<MorphingNavigationBar>(find.byType(MorphingNavigationBar))
          .children
          .whereType<shad.NavigationItem>();

      expect(compactNavItems, isNotEmpty);
      expect(compactNavItems.every((item) => item.label == null), isTrue);
      // Back is an unlabelled circle; the module's sections are labelled.
      expect(find.text(l10n.navBack), findsNothing);
      expect(
        find.descendant(
          of: find.byType(MorphingNavigationBar),
          matching: find.text(l10n.dashboardAssignedToMe),
        ),
        findsOneWidget,
      );
    });

    testWidgets(
      'six-section mini nav keeps 44dp slots and More in a narrow viewport',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(320, 720);
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        final router = _buildRouter(initialLocation: Routes.inventoryManage);
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

        // Back leads inside the pill, which shows as many sections as keep
        // a 44dp target, then More for the rest.
        final back = tester.getRect(find.byKey(const ValueKey('back-to-root')));
        final more = tester.getRect(
          find.byKey(const ValueKey('shell-dock-more')),
        );
        final first = tester.getRect(
          find.byKey(const ValueKey('mini-nav-inventory-inventory_home')),
        );
        for (final rect in [back, more, first]) {
          expect(rect.left >= 0 && rect.right <= 320, isTrue);
        }
        expect(back.width, lessThanOrEqualTo(ShellDockMetrics.slot));
        expect(
          first.width,
          greaterThanOrEqualTo(ShellDockMetrics.minSlotWidth),
        );
        expect(more.width, closeTo(first.width, 0.01));
        expect(
          find.byKey(const ValueKey('mini-nav-inventory-inventory_storefront')),
          findsNothing,
        );
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets('rapid nested navigation does not reuse outgoing nav keys', (
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

      router.go(Routes.tasks);
      await tester.pump(const Duration(milliseconds: 40));
      router.go(Routes.apps);
      await tester.pump(const Duration(milliseconds: 40));
      router.go(Routes.taskBoards);
      await tester.pump(const Duration(milliseconds: 40));

      expect(tester.takeException(), isNull);
      await _pumpForTransitions(tester);
      expect(tester.takeException(), isNull);
      expect(router.routeInformationProvider.value.uri.path, Routes.taskBoards);
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

      expect(find.text(l10n.navBack), findsNothing);
      expect(
        find.descendant(
          of: find.byType(MorphingNavigationBar),
          matching: find.text(l10n.taskPortfolioProjectsTab),
        ),
        findsOneWidget,
      );
      await _verifyInjectedPickerExit(tester, router);
    });

    _registerDockOverflowCheck(
      () => appTabCubit,
      () => authCubit,
      () => workspaceCubit,
      () => shellProfileCubit,
    );

    testWidgets('system back from mini-app root returns to its Apps origin', (
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
      final appsState = tester.state(find.byType(AppsHubPage));
      // The dock frame never moves or resizes between destinations.
      final dock = find.byKey(const ValueKey('persistent-shell-dock-material'));
      final initialRect = tester.getRect(dock);
      router.go(Routes.tasks);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 90));
      expect(tester.getRect(dock), initialRect);
      await _pumpForTransitions(tester);
      expect(tester.getRect(dock), initialRect);

      expect(router.routeInformationProvider.value.uri.path, Routes.tasks);

      await tester.binding.handlePopRoute();
      await _pumpForTransitions(tester);

      expect(router.routeInformationProvider.value.uri.path, Routes.apps);
      expect(tester.state(find.byType(AppsHubPage)), same(appsState));
      expect(
        find.byKey(const ValueKey('apps-picker-fullscreen')),
        findsNothing,
      );
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

    testWidgets(
      'back handling ignores duplicate PopScope callback at mini-app root',
      (tester) async {
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
        expect(
          find.byKey(const ValueKey('apps-picker-fullscreen')),
          findsNothing,
        );
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
      expect(router.routeInformationProvider.value.uri.path, Routes.home);
    });

    testWidgets('timer requests back exits its peer navigation level', (
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
      expect(router.routeInformationProvider.value.uri.path, Routes.apps);
      expect(
        find.byKey(const ValueKey('apps-picker-fullscreen')),
        findsNothing,
      );
    });

    registerShellPeerSectionChecks(
      appTabCubit: () => appTabCubit,
      authCubit: () => authCubit,
      workspaceCubit: () => workspaceCubit,
    );

    testWidgets(
      'system back falls back to mini-app root for deep-linked routes',
      (tester) async {
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
      'system back returns to wallets for deep-linked wallet detail',
      (tester) async {
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

        expect(router.routeInformationProvider.value.uri.path, Routes.wallets);
      },
    );

    testWidgets(
      'persists /apps as last tab after returning from mini-app root',
      (tester) async {
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

    _registerMiniNavUpdateChecks(
      () => appTabCubit,
      () => authCubit,
      () => workspaceCubit,
    );
  });
}
