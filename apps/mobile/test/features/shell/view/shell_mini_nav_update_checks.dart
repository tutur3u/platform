part of 'shell_back_navigation_test.dart';

void _registerMiniNavUpdateChecks(
  AppTabCubit Function() appTabCubit,
  AuthCubit Function() authCubit,
  WorkspaceCubit Function() workspaceCubit,
) {
  testWidgets('updates same-owner mini nav items without staggered delays', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final showAlternateItems = ValueNotifier<bool>(false);
    addTearDown(showAlternateItems.dispose);
    final router = _buildRouter(
      initialLocation: Routes.taskPlanning,
      taskPlanningBuilder: (context) =>
          _MutableMiniNavRoutePage(showAlternateItems: showAlternateItems),
    );
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
    await tester.pumpAndSettle();

    // The selection is titled in the top bar and labelled in the dock.
    expect(_textDataCount(tester, 'Alpha nav'), greaterThanOrEqualTo(1));
    expect(_textDataCount(tester, 'Beta nav'), 0);

    showAlternateItems.value = true;
    await tester.pump();
    await tester.pump();

    // Every new slot is labelled at once; the old one is gone.
    final betaCount = _textDataCount(tester, 'Beta nav');
    expect(_textDataCount(tester, 'Alpha nav'), 0);
    expect(betaCount, greaterThanOrEqualTo(1));
    expect(_textDataCount(tester, 'Gamma nav'), 1);
    expect(_textDataCount(tester, 'Delta nav'), 1);
    await _pumpForTransitions(tester);

    expect(_textDataCount(tester, 'Alpha nav'), 0);
    expect(_textDataCount(tester, 'Beta nav'), betaCount);
    expect(_textDataCount(tester, 'Gamma nav'), 1);
    expect(_textDataCount(tester, 'Delta nav'), 1);
  });
}

int _textDataCount(WidgetTester tester, String value) {
  return tester
      .widgetList<Text>(find.byType(Text, skipOffstage: false))
      .where((widget) => widget.data == value)
      .length;
}
