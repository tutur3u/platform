part of 'settings_compact_navigation_test.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Calendar extends MockCubit<CalendarSettingsState>
    implements CalendarSettingsCubit {}

class _Timezone extends MockCubit<TimezoneSettingsState>
    implements TimezoneSettingsCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

AuthState _account(String id) => AuthState.authenticated(
  supa.User(
    id: id,
    appMetadata: const {},
    userMetadata: const {},
    aud: 'authenticated',
    email: '$id@example.test',
    createdAt: '2026-01-01T00:00:00Z',
  ),
);

WorkspaceState _workspace(String id) => WorkspaceState(
  status: WorkspaceStatus.loaded,
  currentWorkspace: Workspace(id: id, name: 'Design workspace', personal: true),
);

class _SettingsHarness {
  _SettingsHarness({
    String initial = Routes.settings,
    GoRouterWidgetBuilder? settingsBuilder,
    GoRouterWidgetBuilder? workspaceSecretsBuilder,
  }) {
    whenListen(auth, accounts.stream, initialState: _account('user'));
    whenListen(workspaces, scopes.stream, initialState: _workspace('ws'));
    whenListen(
      timezone,
      zones.stream,
      initialState: const TimezoneSettingsState(
        personal: 'Asia/Ho_Chi_Minh',
        workspace: 'Europe/Paris',
        loading: false,
        resolved: true,
      ),
    );
    whenListen(
      calendar,
      const Stream<CalendarSettingsState>.empty(),
      initialState: const CalendarSettingsState(),
    );
    whenListen(
      profile,
      const Stream<ShellProfileState>.empty(),
      initialState: const ShellProfileState(),
    );
    when(
      () => calendar.loadWorkspacePreference(any()),
    ).thenAnswer((_) async {});
    when(timezone.reload).thenAnswer((_) async {});
    when(
      () => timezone.save(
        any(),
        workspace: any(named: 'workspace'),
        canManageWorkspace: any(named: 'canManageWorkspace'),
      ),
    ).thenAnswer((_) async {});
    when(
      () => permissions.getPermissions(
        wsId: any(named: 'wsId'),
        userId: any(named: 'userId'),
      ),
    ).thenAnswer(
      (_) async => WorkspacePermissions(
        permissions: allowed ? {manageWorkspaceSettingsPermission} : {},
        isCreator: false,
      ),
    );
    router = GoRouter(
      initialLocation: initial,
      routes: [
        ShellRoute(
          builder: (context, state, child) => ShellPage(
            matchedLocation: state.uri.path,
            enableDebugLogs: false,
            child: child,
          ),
          routes: [
            GoRoute(
              path: Routes.settings,
              builder:
                  settingsBuilder ??
                  (_, _) => SettingsPage(permissionsRepository: permissions),
            ),
            GoRoute(
              path: Routes.settingsPreferences,
              redirect: (_, _) => Routes.settings,
            ),
            ...settingsRoutes().where(
              (route) =>
                  !{
                    Routes.settingsPreferences,
                    Routes.settingsWorkspace,
                    Routes.settingsAbout,
                  }.contains((route as GoRoute).path) &&
                  (workspaceSecretsBuilder == null ||
                      route.path != Routes.settingsWorkspaceSecrets),
            ),
            if (workspaceSecretsBuilder != null)
              GoRoute(
                path: Routes.settingsWorkspaceSecrets,
                builder: workspaceSecretsBuilder,
              ),
            GoRoute(
              path: Routes.settingsWorkspace,
              builder: (_, _) => const SettingsWorkspacePage(),
            ),
            GoRoute(
              path: Routes.settingsAbout,
              builder: (_, _) =>
                  const SettingsPage(section: SettingsSectionDestination.about),
            ),
            GoRoute(
              path: Routes.apps,
              builder: (_, _) => const SizedBox.shrink(),
            ),
            GoRoute(
              path: Routes.home,
              builder: (_, _) => const SizedBox.shrink(),
            ),
            GoRoute(
              path: Routes.profileRoot,
              builder: (_, _) => const SizedBox.shrink(),
            ),
          ],
        ),
      ],
    );
  }
  bool allowed = false;
  final auth = _Auth();
  final workspaces = _Workspaces();
  final calendar = _Calendar();
  final timezone = _Timezone();
  final profile = _Profile();
  final permissions = _Permissions();
  final accounts = StreamController<AuthState>.broadcast();
  final scopes = StreamController<WorkspaceState>.broadcast();
  final zones = StreamController<TimezoneSettingsState>.broadcast();
  final settings = SettingsRepository();
  late final apps = AppTabCubit(settingsRepository: settings);
  late final finance = FinancePreferencesCubit(settingsRepository: settings);
  late final theme = ThemeCubit(settingsRepository: settings);
  late final locale = LocaleCubit(settingsRepository: settings);
  late final GoRouter router;

  Future<void> pump(WidgetTester tester, {double scale = 1}) async {
    await apps.recordAppOrigin(Routes.apps);
    await tester.pumpWidget(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspaces),
          BlocProvider<CalendarSettingsCubit>.value(value: calendar),
          BlocProvider<TimezoneSettingsCubit>.value(value: timezone),
          BlocProvider<ShellProfileCubit>.value(value: profile),
          BlocProvider.value(value: apps),
          BlocProvider.value(value: finance),
          BlocProvider.value(value: theme),
          BlocProvider.value(value: locale),
          BlocProvider(create: (_) => ShellMiniNavCubit()),
          BlocProvider(create: (_) => ShellTitleOverrideCubit()),
          BlocProvider(create: (_) => AssistantChromeCubit()),
        ],
        child: shad.ShadcnApp.router(
          theme: MobileShadTheme.light,
          darkTheme: MobileShadTheme.dark,
          themeMode: theme.state.themeMode,
          locale: locale.state.locale,
          localizationsDelegates: const [
            ...AppLocalizations.localizationsDelegates,
            AppShadcnLocalizationsDelegate(),
          ],
          supportedLocales: AppLocalizations.supportedLocales,
          routerConfig: router,
          builder: (context, child) => ShadcnMaterialBridge.appBuilder(
            context,
            MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(scale)),
              child: RepaintBoundary(
                key: const ValueKey('synthetic-settings-render'),
                child: child,
              ),
            ),
          ),
        ),
      ),
    );
    await _settle(tester);
  }

  Future<void> dispose() async {
    router.dispose();
    unawaited(accounts.close());
    unawaited(scopes.close());
    unawaited(zones.close());
    await auth.close();
    await workspaces.close();
    await calendar.close();
    await timezone.close();
    await profile.close();
    await apps.close();
    await finance.close();
    await theme.close();
    await locale.close();
  }
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

Future<void> _tapRow(WidgetTester tester, Key key) async {
  await tester.scrollUntilVisible(
    find.byKey(key),
    160,
    scrollable: find.byType(Scrollable).first,
  );
  await _settle(tester);
  await tester.tap(find.byKey(key));
  await _settle(tester);
}

void _viewport(WidgetTester tester, Size size) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

Future<void> _capture(WidgetTester tester, String name) async {
  final output = Platform.environment['SETTINGS_RENDER_DIR'];
  if (output == null) return;
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(const ValueKey('synthetic-settings-render')),
    );
    final image = await boundary.toImage();
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(output).create(recursive: true);
    await File('$output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}
