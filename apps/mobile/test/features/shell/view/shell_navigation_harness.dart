part of 'shell_back_navigation_test.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _WsCubit extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

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
      builder: ShadcnMaterialBridge.appBuilder,
      routerConfig: router,
    ),
  );
}

GoRouter _buildRouter({
  required String initialLocation,
  WidgetBuilder? taskPlanningBuilder,
}) {
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
            path: Routes.profileRoot,
            builder: (context, state) => const _RoutePage(label: 'profile'),
          ),
          GoRoute(
            path: Routes.notifications,
            builder: (context, state) =>
                const _RoutePage(label: 'notifications'),
          ),
          GoRoute(
            path: Routes.settings,
            builder: (context, state) => const _RoutePage(label: 'settings'),
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
            path: Routes.taskPlanning,
            builder: (context, state) =>
                taskPlanningBuilder?.call(context) ??
                const _RoutePage(label: 'task-planning'),
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
            path: Routes.inventory,
            builder: (context, state) => const _RoutePage(label: 'inventory'),
          ),
          GoRoute(
            path: Routes.inventoryProducts,
            builder: (context, state) =>
                const _RoutePage(label: 'inventory-products'),
          ),
          GoRoute(
            path: Routes.inventorySales,
            builder: (context, state) =>
                const _RoutePage(label: 'inventory-sales'),
          ),
          GoRoute(
            path: Routes.inventoryManage,
            builder: (context, state) =>
                const _RoutePage(label: 'inventory-manage'),
          ),
          GoRoute(
            path: Routes.storefronts,
            builder: (context, state) => const _RoutePage(label: 'storefronts'),
          ),
          GoRoute(
            path: Routes.wallets,
            builder: (context, state) => const _RoutePage(label: 'wallets'),
          ),
          GoRoute(
            path: Routes.walletDetail,
            builder: (context, state) =>
                _RoutePage(label: 'wallet-${state.pathParameters['walletId']}'),
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

class _MutableMiniNavRoutePage extends StatelessWidget {
  const _MutableMiniNavRoutePage({required this.showAlternateItems});

  final ValueListenable<bool> showAlternateItems;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: showAlternateItems,
      builder: (context, showAlternate, child) {
        return Stack(
          children: [
            child!,
            ShellMiniNav(
              ownerId: 'mutable-mini-nav',
              locations: const {Routes.taskPlanning},
              deepLinkBackRoute: Routes.tasks,
              items: showAlternate
                  ? const [
                      ShellMiniNavItemSpec(
                        id: 'beta',
                        icon: Icons.bolt_outlined,
                        label: 'Beta nav',
                        selected: true,
                        callbackToken: 'beta',
                      ),
                      ShellMiniNavItemSpec(
                        id: 'gamma',
                        icon: Icons.insights_outlined,
                        label: 'Gamma nav',
                        callbackToken: 'gamma',
                      ),
                      ShellMiniNavItemSpec(
                        id: 'delta',
                        icon: Icons.layers_outlined,
                        label: 'Delta nav',
                        callbackToken: 'delta',
                      ),
                    ]
                  : const [
                      ShellMiniNavItemSpec(
                        id: 'alpha',
                        icon: Icons.auto_awesome_outlined,
                        label: 'Alpha nav',
                        selected: true,
                        callbackToken: 'alpha',
                      ),
                    ],
            ),
          ],
        );
      },
      child: const _RoutePage(label: 'mutable-mini-nav'),
    );
  }
}

Future<void> _pumpForTransitions(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

void _expectAppsScreen(WidgetTester tester, GoRouter router) {
  expect(router.routeInformationProvider.value.uri.path, Routes.apps);
  expect(find.byKey(const ValueKey('apps-screen')), findsOneWidget);
}

Future<void> _verifyInjectedPickerExit(
  WidgetTester tester,
  GoRouter router,
) async {
  final context = tester.element(find.byType(ShellPage));
  expect(find.text(AppLocalizations.of(context).taskBoardsTitle), findsNothing);
  var legacyBackCalled = false;
  context.read<ShellMiniNavCubit>().register(
    registrationId: 'picker-exit-test',
    ownerId: 'picker-exit-test',
    locations: {Routes.taskPortfolio},
    deepLinkBackRoute: Routes.apps,
    items: [
      ShellMiniNavItemSpec(
        id: 'back',
        icon: Icons.chevron_left,
        label: 'Back',
        onPressed: () => legacyBackCalled = true,
      ),
    ],
  );
  await _pumpForTransitions(tester);
  await tester.tap(find.byTooltip('Back'));
  await _pumpForTransitions(tester);
  expect(legacyBackCalled, isFalse);
  expect(router.routeInformationProvider.value.uri.path, Routes.home);
  expect(find.byKey(const ValueKey('apps-picker-fullscreen')), findsNothing);
}
