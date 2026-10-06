part of 'settings_compact_navigation_test.dart';

void registerSettingsDesignChecks() {
  testWidgets('preference groups do not leave redundant trailing whitespace', (
    tester,
  ) async {
    _viewport(tester, const Size(390, 844));
    final h = _SettingsHarness();
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      await h.dispose();
    });
    await h.pump(tester);
    final section = find.byWidgetPredicate(
      (widget) => widget.runtimeType.toString() == '_PreferencesSection',
    );
    final groups = find.descendant(
      of: section,
      matching: find.byType(SettingsGroup),
    );
    expect(groups, findsNWidgets(4));
    expect(
      tester.getRect(section).bottom - tester.getRect(groups.last).bottom,
      closeTo(0, 0.1),
    );
    expect(tester.takeException(), isNull);
  });

  for (final locale in ['en', 'vi']) {
    for (final mode in [shad.ThemeMode.light, shad.ThemeMode.dark]) {
      testWidgets('compact settings fit $locale $mode with enlarged text', (
        tester,
      ) async {
        _viewport(tester, const Size(320, 568));
        final h = _SettingsHarness();
        addTearDown(() async {
          // Dispose immediately after repeated scroll-end notifications. Every
          // dock return timer must be cancelled without advancing fake time.
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump();
          await h.dispose();
        });
        await h.locale.setLocale(Locale(locale));
        await h.theme.setThemeMode(mode);
        await h.pump(tester, scale: 2);
        final rows = find.byType(SettingsTile);
        expect(
          find.byKey(const ValueKey('settings-haptics-row')),
          findsOneWidget,
        );
        expect(
          find.byKey(const ValueKey('settings-finance-row')),
          findsOneWidget,
        );
        expect(
          Localizations.localeOf(tester.element(rows.first)).languageCode,
          locale,
        );
        for (final element in rows.evaluate()) {
          expect(
            tester.getSize(find.byWidget(element.widget)).height,
            greaterThanOrEqualTo(48),
          );
        }
        // Still reachable through the same shared shell with long translated
        // labels; the redesign does not add another interactive navbar.
        await _capture(tester, 'settings-$locale-${mode.name}-large-text');
        await _tapRow(tester, const ValueKey('settings-offline-row'));
        expect(find.byType(OfflinePage), findsOneWidget);
        expect(find.byType(MorphingNavigationBar), findsOneWidget);
        expect(tester.takeException(), isNull);
        // Dispose immediately after repeated scroll-end notifications. Every
        // dock return timer must be cancelled without advancing fake time.
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
      });
    }
  }
}
