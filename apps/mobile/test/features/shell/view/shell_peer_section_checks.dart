part of 'shell_back_navigation_test.dart';

void registerShellPeerSectionChecks({
  required AppTabCubit Function() appTabCubit,
  required AuthCubit Function() authCubit,
  required WorkspaceCubit Function() workspaceCubit,
}) {
  testWidgets('workspace settings back returns to settings hub', (
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
    expect(router.routeInformationProvider.value.uri.path, Routes.finance);
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
    expect(router.routeInformationProvider.value.uri.path, Routes.inventory);
    await tester.binding.handlePopRoute();
    await _pumpForTransitions(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.apps);
  });
}
