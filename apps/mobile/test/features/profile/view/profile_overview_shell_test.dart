import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/view/profile_overview_page.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

Future<void> _pump(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  late AppTabCubit apps;
  late ExperimentalAppsCubit experiments;
  late _Auth auth;
  late _Workspaces workspaces;
  late _Profile profile;
  late GoRouter router;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    apps = AppTabCubit(settingsRepository: SettingsRepository());
    experiments = ExperimentalAppsCubit(
      settingsRepository: SettingsRepository(),
    );
    await experiments.load();
    auth = _Auth();
    workspaces = _Workspaces();
    profile = _Profile();
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.unauthenticated().copyWith(
        activeAccountId: 'a',
        accounts: const [
          StoredAuthAccount(
            id: 'a',
            refreshToken: '',
            lastActiveAt: 1,
            addedAt: 1,
            displayName: 'Account A',
          ),
          StoredAuthAccount(
            id: 'b',
            refreshToken: '',
            lastActiveAt: 2,
            addedAt: 2,
            displayName: 'Account B',
          ),
        ],
      ),
    );
    whenListen(
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        currentWorkspace: Workspace(id: 'synthetic-personal', personal: true),
      ),
    );
    whenListen(
      profile,
      const Stream<ShellProfileState>.empty(),
      initialState: const ShellProfileState(error: 'Offline'),
    );
    when(() => auth.syncCurrentSessionToStore()).thenAnswer((_) async {});
    when(() => auth.switchAccount('b')).thenAnswer((_) async => true);
    router = GoRouter(
      initialLocation: Routes.profileRoot,
      routes: [
        ShellRoute(
          builder: (context, state, child) => ShellPage(
            matchedLocation: state.uri.path,
            enableDebugLogs: false,
            child: child,
          ),
          routes: [
            GoRoute(path: Routes.apps, builder: (_, _) => const SizedBox()),
            GoRoute(path: Routes.home, builder: (_, _) => const SizedBox()),
            GoRoute(
              path: Routes.profileRoot,
              builder: (_, _) => const ProfileOverviewPage(),
            ),
            GoRoute(
              path: Routes.profileEdit,
              builder: (_, _) => const Text('Identity editor'),
            ),
            GoRoute(
              path: Routes.settings,
              builder: (_, _) => const Text('Preferences page'),
            ),
          ],
        ),
      ],
    );
  });
  tearDown(() async {
    router.dispose();
    await apps.close();
    await experiments.close();
    await auth.close();
    await workspaces.close();
    await profile.close();
  });

  Future<void> mount(
    WidgetTester tester, {
    Size size = const Size(430, 844),
  }) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = size;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: apps),
          BlocProvider.value(value: experiments),
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspaces),
          BlocProvider<ShellProfileCubit>.value(value: profile),
          BlocProvider(create: (_) => AssistantChromeCubit()),
          BlocProvider(create: (_) => ShellMiniNavCubit()),
          BlocProvider(create: (_) => ShellTitleOverrideCubit()),
          BlocProvider(create: (_) => ShellChromeActionsCubit()),
        ],
        child: shad.ShadcnApp.router(
          theme: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
          localizationsDelegates: const [
            ...AppLocalizations.localizationsDelegates,
            shad.ShadcnLocalizations.delegate,
          ],
          supportedLocales: AppLocalizations.supportedLocales,
          builder: (context, child) => ShadcnMaterialBridge.appBuilder(
            context,
            MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: const TextScaler.linear(2)),
              child: child!,
            ),
          ),
          routerConfig: router,
        ),
      ),
    );
    await _pump(tester);
  }

  testWidgets(
    'Profile uses actual shell selector and navigates back at large text',
    (tester) async {
      await mount(tester);
      expect(find.byKey(const ValueKey('profile-views')), findsOneWidget);
      expect(find.byType(ProfileOverviewPage), findsOneWidget);
      await tester.tap(find.byTooltip('Activity timeline'));
      await _pump(tester);
      expect(find.text('Activity timeline'), findsOneWidget);
      await tester.tap(find.byTooltip('Overview'));
      await _pump(tester);
      expect(find.text('Overview'), findsOneWidget);
      await tester.tap(find.text('Identity'));
      await _pump(tester);
      expect(
        router.routeInformationProvider.value.uri.path,
        Routes.profileEdit,
      );
      await tester.binding.handlePopRoute();
      await _pump(tester);
      expect(
        router.routeInformationProvider.value.uri.path,
        Routes.profileRoot,
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('actual Profile account action selects stored account', (
    tester,
  ) async {
    await mount(tester);
    await tester.tap(find.byTooltip('Switch account'));
    await _pump(tester);
    expect(find.text('Account B'), findsOneWidget);
    await tester.tap(find.text('Account B'));
    await _pump(tester);
    verify(() => auth.syncCurrentSessionToStore()).called(1);
    verify(() => auth.switchAccount('b')).called(1);
    expect(tester.takeException(), isNull);
    await tester.pump(const Duration(seconds: 7));
  });
  for (final size in [const Size(320, 700), const Size(1032, 1376)]) {
    testWidgets('actual Profile selector fits $size at double text', (
      tester,
    ) async {
      await mount(tester, size: size);
      await tester.tap(find.byTooltip('Activity timeline'));
      await _pump(tester);
      expect(find.text('Activity timeline'), findsOneWidget);
      await tester.tap(find.byTooltip('Overview'));
      await _pump(tester);
      expect(find.text('Overview'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
