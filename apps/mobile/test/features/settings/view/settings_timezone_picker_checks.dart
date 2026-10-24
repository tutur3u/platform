part of 'settings_compact_navigation_test.dart';

/// Pilot of the design-system sheet host: the timezone picker inside the real
/// shell, with the chrome registry the app provides.
void registerTimezonePickerChecks() {
  const searchHint = 'Search city, region or GMT offset';
  final picker = find.byType(TimezonePickerSheet);
  final shellQuery = find.byKey(const ValueKey('shell-search-query'));

  Future<_SettingsHarness> open(
    WidgetTester tester, {
    shad.ThemeMode mode = shad.ThemeMode.light,
  }) async {
    _viewport(tester, const Size(390, 844));
    final h = _SettingsHarness();
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      await h.dispose();
    });
    await h.theme.setThemeMode(mode);
    await h.pump(tester, shellChrome: true);
    await tester.ensureVisible(find.text('Personal timezone'));
    await _settle(tester);
    await tester.tap(find.text('Personal timezone'));
    await _settle(tester);
    expect(picker, findsOneWidget);
    return h;
  }

  testWidgets('timezone picker pins the current zone and explains Automatic', (
    tester,
  ) async {
    final h = await open(tester);
    // Search lives in the shell chrome, not inline in the sheet.
    expect(
      find.descendant(of: picker, matching: find.byType(EditableText)),
      findsNothing,
    );
    expect(find.byTooltip(searchHint), findsOneWidget);
    final current = find.byKey(
      const ValueKey('timezone-option-Asia/Ho_Chi_Minh'),
    );
    expect(current, findsWidgets);
    expect(tester.widget<AppOptionTile>(current.first).selected, isTrue);
    expect(tester.widget<AppOptionTile>(current.first).detail, 'GMT+7');
    final auto = find.byKey(const ValueKey('timezone-option-auto'));
    expect(tester.widget<AppOptionTile>(auto).selected, isFalse);
    expect(
      tester.widget<AppOptionTile>(auto).subtitle,
      contains('Currently Paris'),
    );
    await _capture(tester, 'timezone-picker-light');
    await tester.tap(auto);
    await _settle(tester);
    expect(picker, findsNothing);
    verify(() => h.timezone.save('auto')).called(1);
    expect(h.actions.state.topmostModalOwner, isNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets('timezone picker renders in dark mode', (tester) async {
    await open(tester, mode: shad.ThemeMode.dark);
    await _capture(tester, 'timezone-picker-dark');
    expect(tester.takeException(), isNull);
  });

  testWidgets('dock search filters zones and system Back closes the sheet', (
    tester,
  ) async {
    final h = await open(tester);
    await tester.tap(find.byTooltip(searchHint));
    await _settle(tester);
    expect(shellQuery, findsOneWidget);
    final paris = find.byKey(const ValueKey('timezone-option-Europe/Paris'));
    final tokyo = find.byKey(const ValueKey('timezone-option-Asia/Tokyo'));
    await tester.enterText(shellQuery, 'paris');
    await _settle(tester);
    expect(paris, findsOneWidget);
    expect(tokyo, findsNothing);
    await _capture(tester, 'timezone-picker-search');

    tester.view.viewInsets = const FakeViewPadding(bottom: 336);
    addTearDown(tester.view.resetViewInsets);
    await _settle(tester);
    // The last result stays above the keyboard.
    expect(tester.getRect(paris).bottom, lessThanOrEqualTo(844 - 336));
    await _capture(tester, 'timezone-picker-keyboard');
    tester.view.resetViewInsets();
    await _settle(tester);

    // Back closes the sheet and its search, never the Settings page.
    await tester.binding.handlePopRoute();
    await _settle(tester);
    expect(picker, findsNothing);
    expect(shellQuery, findsNothing);
    expect(h.router.state.matchedLocation, Routes.settings);
    expect(h.actions.state.topmostModalOwner, isNull);
    verifyNever(() => h.timezone.save(any()));
    expect(tester.takeException(), isNull);
  });

  testWidgets('dock Back closes the sheet before leaving Settings', (
    tester,
  ) async {
    final h = await open(tester);
    final back = h.actions.state.backForLocation(Routes.settings);
    expect(back, isNotNull);
    await back!();
    await _settle(tester);
    expect(picker, findsNothing);
    expect(h.router.state.matchedLocation, Routes.settings);
    expect(h.actions.state.topmostModalOwner, isNull);
    expect(tester.takeException(), isNull);
  });
}
