part of 'appearance_root_tabs_render_test.dart';

// Real-shell render fixtures for root tabs with fixture data. Captures use
// `_capture` (`SETTINGS_RENDER_DIR`).

/// Window sizes reviewed for responsive layouts.
const renderSizes = <String, Size>{
  'phone': Size(390, 844),
  'tablet': Size(820, 1180),
  'desktop': Size(1440, 900),
};

/// Appearances reviewed for each screen: Classic light and dark plus one
/// gradient (ombre) and one blob theme.
final renderAppearances = <String, (AppearanceSettings, shad.ThemeMode)>{
  'classic-light': (const AppearanceSettings(), shad.ThemeMode.light),
  'classic-dark': (const AppearanceSettings(), shad.ThemeMode.dark),
  'sunset-gradient-light': (
    const AppearanceSettings(
      theme: AppearanceThemeId.sunset,
      backgroundStyle: AppearanceBackgroundStyle.gradient,
    ),
    shad.ThemeMode.light,
  ),
  'aurora-blobs-dark': (
    const AppearanceSettings(
      theme: AppearanceThemeId.aurora,
      backgroundStyle: AppearanceBackgroundStyle.blobs,
    ),
    shad.ThemeMode.dark,
  ),
};

const renderWorkspace = Workspace(id: 'synthetic-ws', name: 'Northwind Studio');

Future<void> settleShell(WidgetTester tester) async {
  for (var i = 0; i < 16; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

/// Pumps the real [ShellPage] at [location] under [appearance].
Future<GoRouter> pumpShellRender(
  WidgetTester tester, {
  required String location,
  required Size size,
  required AppearanceSettings appearance,
  required shad.ThemeMode themeMode,
  Widget Function(int replayToken)? homePageBuilder,
  WidgetBuilder? notificationsPageBuilder,
  Locale locale = const Locale('en'),
  Map<String, Object> preferences = const {},
  List<String> extraLocations = const [],
}) async {
  SharedPreferences.setMockInitialValues(preferences);
  final settings = SettingsRepository();
  final apps = AppTabCubit(settingsRepository: settings);
  final experiments = ExperimentalAppsCubit(settingsRepository: settings);
  await experiments.load();
  final auth = _Auth();
  final workspaces = _Workspaces();
  final profile = _Profile();
  whenListen(
    auth,
    const Stream<AuthState>.empty(),
    initialState: const AuthState.unauthenticated(),
  );
  whenListen(
    workspaces,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      status: WorkspaceStatus.loaded,
      currentWorkspace: renderWorkspace,
      workspaces: [renderWorkspace],
    ),
  );
  // The workspace picker reads these when it opens.
  when(workspaces.refreshHiddenWorkspaces).thenAnswer((_) async {});
  when(() => workspaces.hasAuthenticatedActor).thenReturn(false);
  whenListen(
    profile,
    const Stream<ShellProfileState>.empty(),
    initialState: const ShellProfileState(
      profile: UserProfile(id: 'synthetic-user', displayName: 'Linh'),
    ),
  );
  final router = GoRouter(
    initialLocation: location,
    routes: [
      ShellRoute(
        builder: (context, state, child) => ShellPage(
          matchedLocation: state.uri.path,
          enableDebugLogs: false,
          homePageBuilder: homePageBuilder,
          notificationsPageBuilder: notificationsPageBuilder,
          child: child,
        ),
        routes: [
          for (final path in {location, ...extraLocations})
            GoRoute(path: path, builder: (_, _) => const SizedBox()),
        ],
      ),
    ],
  );
  addTearDown(() async {
    await tester.pumpWidget(const SizedBox.shrink());
    router.dispose();
    await apps.close();
    await experiments.close();
    await auth.close();
    await workspaces.close();
    await profile.close();
  });
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.reset);
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
        theme: AppearanceTheme.shadTheme(appearance, Brightness.light),
        darkTheme: AppearanceTheme.shadTheme(appearance, Brightness.dark),
        themeMode: themeMode,
        locale: locale,
        localizationsDelegates: const [
          ...AppLocalizations.localizationsDelegates,
          shad.ShadcnLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        routerConfig: router,
        builder: (context, child) => RepaintBoundary(
          key: const ValueKey('root-render'),
          child: AppearanceBackdrop(
            settings: appearance,
            child: ShadcnMaterialBridge.appBuilder(context, child),
          ),
        ),
      ),
    ),
  );
  await settleShell(tester);
  return router;
}
