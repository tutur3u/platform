part of 'settings_compact_navigation_test.dart';

void registerSettingsDetailShellChecks() {
  testWidgets(
    'Offline inherits one shell title, background and dock clearance',
    (tester) async {
      _viewport(tester, const Size(390, 844));
      final h = _SettingsHarness();
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await h.dispose();
      });
      await h.pump(tester);
      await _tapRow(tester, const ValueKey('settings-offline-row'));
      expect(h.router.state.matchedLocation, Routes.settingsOffline);
      expect(find.byType(OfflinePage), findsOneWidget);
      expect(find.text('Offline'), findsOneWidget);
      expect(find.text('Settings'), findsNothing);
      expect(find.byType(AppBar), findsNothing);
      expect(find.byKey(const ValueKey('shell-settings-back')), findsOneWidget);
      final list = find
          .descendant(
            of: find.byType(OfflinePage),
            matching: find.byType(ListView),
          )
          .first;
      final listContext = tester.element(list);
      final padding = tester.widget<ListView>(list).padding! as EdgeInsets;
      expect(padding.top, 16);
      expect(
        MediaQuery.paddingOf(listContext).bottom,
        greaterThanOrEqualTo(68),
      );
      expect(padding.bottom, 24 + MediaQuery.paddingOf(listContext).bottom);
      expect(MediaQuery.paddingOf(listContext).top, 0);
      expect(
        Theme.of(listContext).scaffoldBackgroundColor,
        shad.Theme.of(listContext).colorScheme.background,
      );
      final header = find.byKey(
        const ValueKey('floating-shell-header-surface'),
      );
      expect(
        tester.getTopLeft(list).dy,
        closeTo(tester.getBottomLeft(header).dy, 1),
      );
      await tester.tap(find.byKey(const ValueKey('shell-settings-back')));
      await _settle(tester);
      expect(h.router.state.matchedLocation, Routes.settings);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Offline module deep link uses shell title and system/dock back',
    (tester) async {
      _viewport(tester, const Size(390, 844));
      final h = _SettingsHarness(
        initial: Routes.settingsOfflineModulePath('finance'),
      );
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await h.dispose();
      });
      await h.pump(tester, scale: 2);
      expect(find.byType(OfflineModulePage), findsOneWidget);
      expect(find.byType(AppBar), findsNothing);
      expect(find.byKey(const ValueKey('shell-settings-back')), findsOneWidget);
      expect(find.text('Finance'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await _settle(tester);
      expect(
        h.router.routeInformationProvider.value.uri.path,
        Routes.settingsOffline,
      );
      final nav = tester.widget<MorphingNavigationBar>(
        find.byType(MorphingNavigationBar),
      );
      nav.onSelected(const ValueKey('back-to-root'));
      await _settle(tester);
      expect(h.router.routeInformationProvider.value.uri.path, Routes.settings);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('Unknown Offline modules redirect to the overview', (
    tester,
  ) async {
    final h = _SettingsHarness(
      initial: Routes.settingsOfflineModulePath('unknown'),
    );
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      await h.dispose();
    });
    await h.pump(tester);
    expect(
      h.router.routeInformationProvider.value.uri.path,
      Routes.settingsOffline,
    );
    expect(find.byType(OfflineModulePage), findsNothing);
  });
}
