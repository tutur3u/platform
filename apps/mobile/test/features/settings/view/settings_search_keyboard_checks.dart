part of 'settings_compact_navigation_test.dart';

void registerSettingsSearchKeyboardChecks() {
  testWidgets('Settings root clears keyboard and exposes its last action', (
    tester,
  ) async {
    const size = Size(390, 844);
    const keyboard = 280.0;
    _viewport(tester, size);
    final h = _SettingsHarness();
    addTearDown(() async {
      tester.view.resetViewInsets();
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      await h.dispose();
    });
    await h.pump(tester, shellChrome: true);
    h.actions.state
        .resolveForLocation(Routes.settings)
        .singleWhere((action) => action.id == '${Routes.settings}/search')
        .onPressed!();
    await _settle(tester);
    final input = find.byKey(const ValueKey('shell-search-query'));
    expect(input, findsOneWidget);
    final focus = tester
        .widget<TextField>(
          find.descendant(of: input, matching: find.byType(TextField)),
        )
        .focusNode!;
    expect(focus.hasFocus, isTrue);

    tester.view.viewInsets = const FakeViewPadding(bottom: keyboard);
    await _settle(tester);
    expect(_settingsDockBack().hitTestable(), findsNothing);
    final list = find
        .descendant(
          of: find.byType(SettingsPage),
          matching: find.byType(ListView),
        )
        .first;
    final l10n = tester.element(list).l10n;
    final finalAction = find.text(l10n.settingsDangerSectionTitle);
    final scroll = tester.state<ScrollableState>(
      find.descendant(of: list, matching: find.byType(Scrollable)).first,
    );
    scroll.position.jumpTo(scroll.position.maxScrollExtent);
    await _settle(tester);
    expect(focus.hasFocus, isTrue);
    expect(finalAction, findsOneWidget);
    final bounds = tester.getRect(finalAction);
    expect(bounds.bottom, lessThanOrEqualTo(size.height - keyboard));
    expect(bounds.top, greaterThanOrEqualTo(tester.getTopLeft(list).dy));
    expect(finalAction.hitTestable(), findsOneWidget);

    await tester.drag(list, const Offset(0, 100));
    await _settle(tester);
    expect(focus.hasFocus, isFalse);
    expect(h.router.state.matchedLocation, Routes.settings);
    expect(tester.takeException(), isNull);
  });
}
