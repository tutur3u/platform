part of 'shell_back_navigation_test.dart';

void registerShellPeerSectionChecks({
  required AppTabCubit Function() appTabCubit,
  required AuthCubit Function() authCubit,
  required WorkspaceCubit Function() workspaceCubit,
}) {
  testWidgets('workspace settings Back reaches Settings before exiting', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final router = _buildRouter(initialLocation: Routes.settingsWorkspace);
    addTearDown(router.dispose);
    await tester.pumpWidget(
      _buildTestApp(
        router: router,
        appTabCubit: appTabCubit(),
        authCubit: authCubit(),
        workspaceCubit: workspaceCubit(),
      ),
    );
    await _pumpForTransitions(tester);
    await tester.binding.handlePopRoute();
    await _pumpForTransitions(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.settings);
    await tester.binding.handlePopRoute();
    await _pumpForTransitions(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.home);
  });

  testWidgets('dock Back from Workspace reaches Settings before its origin', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final router = _buildRouter(initialLocation: Routes.profileRoot);
    addTearDown(router.dispose);
    await tester.pumpWidget(
      _buildTestApp(
        router: router,
        appTabCubit: appTabCubit(),
        authCubit: authCubit(),
        workspaceCubit: workspaceCubit(),
      ),
    );
    await _pumpForTransitions(tester);
    router.go(Routes.settings);
    await _pumpForTransitions(tester);
    router.go(Routes.settingsWorkspace);
    await _pumpForTransitions(tester);
    await tester.tap(find.bySemanticsLabel('Back'));
    await _pumpForTransitions(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.settings);
    await tester.tap(find.bySemanticsLabel('Back'));
    await _pumpForTransitions(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.profileRoot);
    await tester.binding.handlePopRoute();
    await _pumpForTransitions(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.home);
  });

  testWidgets('peer sections in Finance and Inventory do not stack', (
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
        appTabCubit: appTabCubit(),
        authCubit: authCubit(),
        workspaceCubit: workspaceCubit(),
      ),
    );
    await _pumpForTransitions(tester);

    router.go(Routes.apps);
    await _pumpForTransitions(tester);
    router.go(Routes.finance);
    await _pumpForTransitions(tester);
    router.go(Routes.transactions);
    await _pumpForTransitions(tester);
    router.go(Routes.wallets);
    await _pumpForTransitions(tester);
    await tester.binding.handlePopRoute();
    await _pumpForTransitions(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.apps);

    router.go(Routes.inventory);
    await _pumpForTransitions(tester);
    router.go(Routes.inventoryProducts);
    await _pumpForTransitions(tester);
    router.go(Routes.inventorySales);
    await _pumpForTransitions(tester);
    await tester.binding.handlePopRoute();
    await _pumpForTransitions(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.apps);
  });

  testWidgets('dock back leaves a peer section for the app origin', (
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
        appTabCubit: appTabCubit(),
        authCubit: authCubit(),
        workspaceCubit: workspaceCubit(),
      ),
    );
    await _pumpForTransitions(tester);
    router.go(Routes.finance);
    await _pumpForTransitions(tester);
    router.go(Routes.transactions);
    await _pumpForTransitions(tester);
    router.go(Routes.wallets);
    await _pumpForTransitions(tester);
    await tester.tap(find.bySemanticsLabel('Back'));
    await _pumpForTransitions(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.apps);
  });

  testWidgets('system Back from a lane keeps the filtered Work query', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    const filtered = '${Routes.mastermindWork}?state=failed&product=Mastermind';
    final router = _buildMastermindWorkRouter();
    addTearDown(router.dispose);
    await tester.pumpWidget(
      _buildTestApp(
        router: router,
        appTabCubit: appTabCubit(),
        authCubit: authCubit(),
        workspaceCubit: workspaceCubit(),
      ),
    );
    await _pumpForTransitions(tester);
    router.go(filtered);
    await _pumpForTransitions(tester);
    router.push<void>(Routes.mastermindWorkLanePath('item-1')).ignore();
    await _pumpForTransitions(tester);
    expect(find.text('lane item-1'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await _pumpForTransitions(tester);

    // The lane pops to the list that opened it, query and all, instead of
    // going to the bare tab root.
    expect(find.text('work state=failed&product=Mastermind'), findsOneWidget);
    expect(router.routerDelegate.currentConfiguration.uri.toString(), filtered);
  });

  testWidgets('system Back from a chart table returns to Insights', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final router = _buildMastermindWorkRouter();
    addTearDown(router.dispose);
    await tester.pumpWidget(
      _buildTestApp(
        router: router,
        appTabCubit: appTabCubit(),
        authCubit: authCubit(),
        workspaceCubit: workspaceCubit(),
      ),
    );
    await _pumpForTransitions(tester);
    router.go(Routes.mastermindInsights);
    await _pumpForTransitions(tester);
    router
        .push<void>(
          Routes.mastermindInsightsTablePath('usage', 'budget:Claude pool A'),
        )
        .ignore();
    await _pumpForTransitions(tester);
    expect(find.text('table usage budget:Claude pool A'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await _pumpForTransitions(tester);

    // The table pops to Insights instead of leaving the mini-app.
    expect(find.text('insights'), findsOneWidget);
    expect(
      router.routerDelegate.currentConfiguration.uri.path,
      Routes.mastermindInsights,
    );
  });
}

/// The shell with the Mastermind Work list and lane detail as stub pages.
GoRouter _buildMastermindWorkRouter() => GoRouter(
  initialLocation: Routes.mastermindWork,
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
          path: Routes.mastermindWork,
          builder: (context, state) =>
              _RoutePage(label: 'work ${state.uri.query}'),
        ),
        GoRoute(
          path: Routes.mastermindInsights,
          builder: (context, state) => const _RoutePage(label: 'insights'),
        ),
        GoRoute(
          path: Routes.mastermindInsightsTable,
          builder: (context, state) => _RoutePage(
            label:
                'table ${state.pathParameters['section']} '
                '${state.pathParameters['chartId']}',
          ),
        ),
        GoRoute(
          path: Routes.mastermindWorkLane,
          builder: (context, state) =>
              _RoutePage(label: 'lane ${state.pathParameters['laneId']}'),
        ),
      ],
    ),
  ],
);
