part of 'settings_compact_navigation_test.dart';

void registerSettingsAppearanceInterfaceChecks() {
  Finder segment(String group, String label) => find.descendant(
    of: find.byKey(ValueKey(group)),
    matching: find.text(label),
  );

  Future<void> reveal(WidgetTester tester, Finder target) async {
    await tester.scrollUntilVisible(
      target,
      160,
      scrollable: _appearanceScrollable,
    );
    await _settle(tester);
  }

  // The harness pumps once, so this checks the choices and their stored
  // payload; the next test checks how a stored choice applies.
  testWidgets('interface choices persist instantly and reset', (tester) async {
    final h = await _pumpAppearance(tester, const AppearanceSettings());
    await _tapRow(tester, const ValueKey('settings-appearance-row'));
    final prefs = await SharedPreferences.getInstance();

    Future<void> pick(String group, String label) async {
      await reveal(tester, segment(group, label));
      await tester.tap(segment(group, label));
      await _settle(tester);
    }

    await pick('appearance-style', 'iOS-like');
    expect(h.theme.state.appearance.interfaceStyle.name, 'ios');
    await pick('appearance-density', 'Compact');
    expect(h.theme.state.appearance.density.name, 'compact');
    await pick('appearance-corners', 'Square');
    expect(h.theme.state.appearance.corners.name, 'square');

    final reduce = find.byKey(const ValueKey('appearance-reduce-motion'));
    await reveal(tester, reduce);
    await tester.tap(reduce);
    await _settle(tester);
    expect(h.theme.state.appearance.reduceMotion, isTrue);
    expect(
      AppearanceSettings.decode(prefs.getString('appearance-v1')),
      h.theme.state.appearance,
    );

    final reset = find.byKey(const ValueKey('appearance-reset'));
    await reveal(tester, reset);
    await tester.tap(reset);
    await _settle(tester);
    expect(h.theme.state.appearance, const AppearanceSettings());
    // Let the confirmation toast expire so no timer outlives the test.
    await tester.pump(const Duration(seconds: 10));
    await _settle(tester);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a stored interface choice applies through the shell theme', (
    tester,
  ) async {
    // A stored payload, as a previous session would have saved it.
    final h = await _pumpAppearance(
      tester,
      AppearanceSettings.decode('{"corners":"square","reduceMotion":true}'),
    );
    await _tapRow(tester, const ValueKey('settings-appearance-row'));
    final page = tester.element(find.byKey(const ValueKey('appearance-page')));

    expect(h.theme.state.appearance.corners.name, 'square');
    expect(AppTokens.of(page).radiusXl, 4);
    expect(MediaQuery.disableAnimationsOf(page), isTrue);
    // The Reduce motion row reflects the stored choice.
    final reduce = find.byKey(const ValueKey('appearance-reduce-motion'));
    await reveal(tester, reduce);
    final toggle = tester.widget<AppSwitch>(
      find.descendant(of: reduce, matching: find.byType(AppSwitch)),
    );
    expect(toggle.value, isTrue);
    expect(tester.takeException(), isNull);
  });
}
