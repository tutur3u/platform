import 'package:bloc_test/bloc_test.dart';
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
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

const _alphaRoute = '/alpha';
const _betaRoute = '/beta';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

Widget _buildTestApp({
  required GoRouter router,
  required AppTabCubit appTabCubit,
  required AuthCubit authCubit,
  required WorkspaceCubit workspaceCubit,
}) {
  return MultiBlocProvider(
    providers: [
      BlocProvider.value(value: appTabCubit),
      BlocProvider<AuthCubit>.value(value: authCubit),
      BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
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
            path: _alphaRoute,
            builder: (context, state) => const _RoutePage(label: 'alpha'),
          ),
          GoRoute(
            path: _betaRoute,
            builder: (context, state) => const _RoutePage(label: 'beta'),
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

    setUp(() {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      appTabCubit = AppTabCubit(settingsRepository: SettingsRepository());
      authCubit = _MockAuthCubit();
      workspaceCubit = _MockWorkspaceCubit();

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
    });

    tearDown(() async {
      await appTabCubit.close();
      await authCubit.close();
      await workspaceCubit.close();
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
        ),
      );
      await _pumpForTransitions(tester);

      router.go(_alphaRoute);
      await _pumpForTransitions(tester);
      router.go(_betaRoute);
      await _pumpForTransitions(tester);

      expect(router.routeInformationProvider.value.uri.path, _betaRoute);

      await tester.binding.handlePopRoute();
      await _pumpForTransitions(tester);
      expect(router.routeInformationProvider.value.uri.path, _alphaRoute);

      await tester.binding.handlePopRoute();
      await _pumpForTransitions(tester);
      expect(router.routeInformationProvider.value.uri.path, Routes.home);
    });

    testWidgets('system back falls back to home for deep-linked routes', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final router = _buildRouter(initialLocation: _alphaRoute);
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

      expect(router.routeInformationProvider.value.uri.path, _alphaRoute);

      await tester.binding.handlePopRoute();
      await _pumpForTransitions(tester);

      expect(router.routeInformationProvider.value.uri.path, Routes.home);
    });
  });
}
