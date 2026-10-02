part of 'shell_back_navigation_test.dart';

void _registerDockReselectionChecks(
  AppTabCubit Function() appTabCubit,
  AuthCubit Function() authCubit,
  WorkspaceCubit Function() workspaceCubit,
) {
  testWidgets('first Apps dock tap opens the Apps tab', (tester) async {
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
    await appTabCubit().select(timerModule);
    await appTabCubit().setShowAppsTab(value: true);

    await tester.pumpWidget(
      _buildTestApp(
        router: router,
        appTabCubit: appTabCubit(),
        authCubit: authCubit(),
        workspaceCubit: workspaceCubit(),
      ),
    );
    await _pumpForTransitions(tester);

    await tester.tap(find.byIcon(Icons.apps_outlined).first);
    await _pumpForTransitions(tester);

    _expectAppsScreen(tester, router);
  });

  for (final rapid in [false, true]) {
    testWidgets('dock scrolls then resets section (rapid: $rapid)', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      final actionsCubit = ShellChromeActionsCubit();
      addTearDown(actionsCubit.close);
      final controller = ScrollController();
      addTearDown(controller.dispose);
      var archived = true;
      final router = _buildRouter(
        initialLocation: Routes.home,
        taskPlanningBuilder: (context) => StatefulBuilder(
          builder: (context, update) => Stack(
            children: [
              ListView.builder(
                key: const ValueKey('dock-test-list'),
                controller: controller,
                itemCount: 60,
                itemBuilder: (context, index) => SizedBox(
                  height: 60,
                  child: Text('${archived ? 'Archive' : 'Inbox'} $index'),
                ),
              ),
              const ShellMiniNav(
                ownerId: 'test-feed',
                locations: {Routes.taskPlanning},
                items: [
                  ShellMiniNavItemSpec(
                    id: 'feed',
                    icon: Icons.list,
                    label: 'Feed',
                    selected: true,
                  ),
                ],
              ),
              ShellChromeActions(
                ownerId: 'test-notifications',
                locations: const {Routes.taskPlanning},
                actions: const [],
                onResetSection: archived
                    ? () => update(() => archived = false)
                    : null,
              ),
            ],
          ),
        ),
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        _buildTestApp(
          router: router,
          appTabCubit: appTabCubit(),
          authCubit: authCubit(),
          workspaceCubit: workspaceCubit(),
          shellChromeActionsCubit: actionsCubit,
        ),
      );
      await _pumpForTransitions(tester);
      final dock = find.byType(MorphingNavigationBar);
      Future<void> tapNotifications() async {
        final onSelected = tester
            .widget<MorphingNavigationBar>(dock)
            .onSelected;
        onSelected(const ValueKey('injected-mini-nav-test-feed-feed'));
        await tester.pump();
      }

      router.go(Routes.taskPlanning);
      await _pumpForTransitions(tester);
      expect(
        router.routeInformationProvider.value.uri.path,
        Routes.taskPlanning,
      );
      expect(archived, isTrue);
      await tester.drag(
        find.byKey(const ValueKey('dock-test-list')),
        const Offset(0, -500),
      );
      await _pumpForTransitions(tester);
      expect(controller.offset, greaterThan(0));
      await tapNotifications();
      expect(archived, isTrue);
      // A wheel gesture after dock scrolling must restart the sequence.
      if (!rapid) {
        await _pumpForTransitions(tester);
        final scrollable = tester.state<ScrollableState>(
          find
              .descendant(
                of: find.byKey(const ValueKey('dock-test-list')),
                matching: find.byType(Scrollable),
              )
              .first,
        );
        scrollable.position.pointerScroll(300);
        await tester.pump();
        await tapNotifications();
        expect(archived, isTrue);
      }
      if (!rapid) await _pumpForTransitions(tester);
      await tapNotifications();
      await _pumpForTransitions(tester);
      expect(archived, isFalse);
      expect(controller.offset, 0);
      expect(tester.takeException(), isNull);
      // Already at the top: skip scrolling and reset immediately.
      final chrome = tester
          .element(find.byType(ShellPage))
          .read<ShellChromeActionsCubit>();
      var resets = 0;
      chrome.register(
        registrationId: 'test-reset',
        ownerId: 'reset',
        locations: {Routes.taskPlanning},
        actions: const [],
        onResetSection: () => resets++,
      );
      await tapNotifications();
      expect(resets, 1);
      await tester.pump(const Duration(seconds: 2));
    });
  }
}
