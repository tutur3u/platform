import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';
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
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

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
  tearDown(() => GoRouter.optionURLReflectsImperativeAPIs = false);
  late AppTabCubit apps;
  late ExperimentalAppsCubit experiments;
  late _Auth auth;
  late _Workspaces workspaces;
  late _Profile profile;
  late GoRouter router;
  var textScale = 2.0;
  late Directory fixtureDirectory;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    await supa.Supabase.initialize(
      url: 'https://synthetic.supabase.test',
      publishableKey: 'synthetic-test-key',
      authOptions: const supa.FlutterAuthClientOptions(
        autoRefreshToken: false,
        detectSessionInUri: false,
        localStorage: supa.EmptyLocalStorage(),
      ),
    );
    FlutterSecureStorage.setMockInitialValues({});
    fixtureDirectory = await Directory.systemTemp.createTemp('profile-navbar-');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/path_provider'),
          (_) async => fixtureDirectory.path,
        );
    await CacheStore.instance.init();
    final materialFont = Platform.environment['PROFILE_MATERIAL_FONT'];
    if (materialFont != null) {
      final loader = FontLoader('Roboto')
        ..addFont(File(materialFont).readAsBytes().then(ByteData.sublistView));
      await loader.load();
    }
    final manifest =
        jsonDecode(await rootBundle.loadString('FontManifest.json'))
            as List<dynamic>;
    for (final entry in manifest.cast<Map<String, dynamic>>()) {
      final loader = FontLoader(entry['family'] as String);
      for (final font
          in (entry['fonts'] as List<dynamic>).cast<Map<String, dynamic>>()) {
        loader.addFont(rootBundle.load(font['asset'] as String));
      }
      await loader.load();
    }
  });

  tearDownAll(() async {
    await CacheStore.instance.closeForTesting();
    await fixtureDirectory.delete(recursive: true);
    await supa.Supabase.instance.dispose();
  });

  setUp(() async {
    GoRouter.optionURLReflectsImperativeAPIs = true;
    textScale = 2;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('mobile/shell_back'),
          (_) async => null,
        );
    SharedPreferences.setMockInitialValues({});
    apps = AppTabCubit(settingsRepository: SettingsRepository());
    experiments = ExperimentalAppsCubit(
      settingsRepository: SettingsRepository(),
    );
    await experiments.load();
    auth = _Auth();
    workspaces = _Workspaces();
    when(() => workspaces.hasAuthenticatedActor).thenReturn(true);
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
        workspaces: [Workspace(id: 'synthetic-personal', personal: true)],
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
              path: Routes.settingsProfile,
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
        child: RepaintBoundary(
          key: const ValueKey('synthetic-profile-render'),
          child: shad.ShadcnApp.router(
            theme: MobileShadTheme.light,
            darkTheme: MobileShadTheme.dark,
            themeMode: shad.ThemeMode.dark,
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
                ).copyWith(textScaler: TextScaler.linear(textScale)),
                child: child!,
              ),
            ),
            routerConfig: router,
          ),
        ),
      ),
    );
    await _pump(tester);
  }

  testWidgets('Overview omits activity panels without a signed-in user', (
    tester,
  ) async {
    await mount(tester);
    expect(find.byType(ProfileOverviewPage), findsOneWidget);
    expect(
      tester
          .widget<FloatingShellDock>(find.byType(FloatingShellDock))
          .reclaimNavigationClearanceWhenHidden,
      isTrue,
    );
    expect(find.byType(SettingsPanel), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('Overview omits activity panels without a workspace', (
    tester,
  ) async {
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
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
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(),
    );
    await mount(tester);
    expect(find.byType(ProfileOverviewPage), findsOneWidget);
    expect(find.byType(SettingsPanel), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('Profile shows identity, accounts, links and account exits', (
    tester,
  ) async {
    await mount(tester);
    expect(find.text('Profile'), findsWidgets);
    // The workspace picker sits in the top bar, not in the page body.
    final picker = find.byTooltip('Switch workspace');
    expect(picker, findsOneWidget);
    expect(
      find.descendant(of: find.byType(ProfileOverviewPage), matching: picker),
      findsNothing,
    );
    for (final key in [
      'profile-identity',
      'profile-switch-account',
      'profile-link-settings',
      'profile-link-appearance',
      'profile-link-notifications',
      'profile-link-security',
      'profile-link-help',
      'profile-link-about',
    ]) {
      expect(find.byKey(ValueKey(key)), findsOneWidget, reason: key);
    }
    final list = find.descendant(
      of: find.byType(ProfileOverviewPage),
      matching: find.byType(Scrollable),
    );
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('profile-delete-account')),
      200,
      scrollable: list.first,
    );
    expect(find.byKey(const ValueKey('profile-sign-out')), findsOneWidget);
    expect(
      find.byKey(const ValueKey('profile-delete-account')),
      findsOneWidget,
    );
    expect(find.text('Focus Time'), findsNothing);
    expect(router.state.matchedLocation, Routes.profileRoot);
    expect(tester.takeException(), isNull);
  });
  testWidgets('Edit profile opens the profile editor', (tester) async {
    await mount(tester);
    await tester.tap(find.byTooltip('Edit profile'));
    await _pump(tester);
    expect(find.text('Identity editor'), findsOneWidget);
  });
  testWidgets('actual Profile account action selects stored account', (
    tester,
  ) async {
    await mount(tester);
    expect(find.text('Account B'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('profile-switch-account')));
    await _pump(tester);
    await tester.tap(find.text('Account B').last);
    await _pump(tester);
    verify(() => auth.syncCurrentSessionToStore()).called(1);
    verify(() => auth.switchAccount('b')).called(1);
    expect(tester.takeException(), isNull);
    await tester.pump(const Duration(seconds: 7));
  });
  for (final size in [const Size(320, 700), const Size(1032, 1376)]) {
    testWidgets('Profile fits $size at double text', (tester) async {
      await mount(tester, size: size);
      expect(find.byKey(const ValueKey('profile-identity')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
