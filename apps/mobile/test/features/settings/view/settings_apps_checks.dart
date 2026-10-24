part of 'settings_compact_navigation_test.dart';

/// Settings > Apps rows, the routed app sub-screens and quick-jump search.
void registerSettingsAppsChecks() {
  testWidgets('Apps rows summarize values and open central sub-screens', (
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
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('tasks')),
      160,
      scrollable: find.byType(Scrollable).first,
    );
    await _settle(tester);
    String? summary(String id) =>
        tester.widget<SettingsTile>(find.byKey(ValueKey(id))).value;
    expect(find.text('Apps'), findsOneWidget);
    // Summaries state the value, not the setting's title again.
    expect(summary('tasks'), 'Board view');
    expect(summary('calendar'), 'First day: Auto');
    expect(summary('finance'), 'Amounts hidden');
    // Timer is opt-in; without the experiment its row stays hidden.
    expect(find.byKey(const ValueKey('timer')), findsNothing);
    // One source of truth: the root no longer repeats per-app editors.
    expect(find.byKey(const ValueKey('settings-finance-row')), findsNothing);
    expect(find.byKey(const ValueKey('settings-task-board-row')), findsNothing);
    expect(find.byKey(const ValueKey('settings-you-row')), findsNothing);
    // Manage accounts lives once, under Edit profile → Account.
    expect(
      find.byKey(const ValueKey('settings-accounts-row'), skipOffstage: false),
      findsNothing,
    );
    expect(find.text('General', skipOffstage: false), findsOneWidget);
    await _capture(tester, 'settings-root-apps');

    await _tapRow(tester, const ValueKey('tasks'));
    expect(h.router.state.matchedLocation, Routes.settingsAppPath('tasks'));
    expect(find.byKey(const ValueKey('settings-task-board-row')), findsOne);
    expect(
      find.byKey(const ValueKey('app-settings-tasks-offline')),
      findsOneWidget,
    );
    // The shell owns the single top title; the body adds no app bar.
    expect(find.text('Tasks'), findsOneWidget);
    expect(find.byType(AppBar), findsNothing);
    await _capture(tester, 'settings-app-tasks');
    await tester.tap(find.bySemanticsLabel('Back'));
    await _settle(tester);
    expect(h.router.state.matchedLocation, Routes.settings);
    expect(tester.takeException(), isNull);
  });

  for (final app in ['calendar', 'finance', 'timer']) {
    testWidgets('$app sub-screen renders its single editor', (tester) async {
      _viewport(tester, const Size(390, 844));
      final h = _SettingsHarness(initial: Routes.settingsAppPath(app));
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await h.dispose();
      });
      await h.pump(tester);
      final row = switch (app) {
        'calendar' => 'settings-first-day-row',
        'finance' => 'settings-finance-row',
        _ => 'settings-pomodoro-row',
      };
      expect(find.byKey(ValueKey(row)), findsOneWidget);
      // Timer keeps no offline module; the others link to theirs.
      expect(
        find.byKey(ValueKey('app-settings-$app-offline')),
        app == 'timer' ? findsNothing : findsOne,
      );
      await _capture(tester, 'settings-app-$app');
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('search opens app settings and jumps to inline rows', (
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
    final field = find.descendant(
      of: find.byKey(const ValueKey('settings-search-field')),
      matching: find.byType(EditableText),
    );
    await tester.enterText(field, 'amounts');
    await _settle(tester);
    final result = find.byKey(const ValueKey('settings-search-app-finance-0'));
    expect(tester.widget<SettingsTile>(result).title, 'Finance amounts');
    expect(tester.widget<SettingsTile>(result).value, 'Apps · Finance');
    await _capture(tester, 'settings-search-results');
    await tester.tap(result);
    await _settle(tester);
    expect(h.router.state.matchedLocation, Routes.settingsAppPath('finance'));
    await tester.tap(find.bySemanticsLabel('Back'));
    await _settle(tester);

    await tester.enterText(field, 'nothing matches this');
    await _settle(tester);
    expect(find.byKey(const ValueKey('settings-search-empty')), findsOne);

    await tester.enterText(field, 'personal time');
    await _settle(tester);
    await tester.tap(find.byKey(const ValueKey('settings-search-timezone')));
    await _settle(tester);
    expect(find.byKey(const ValueKey('settings-search-results')), findsNothing);
    final zone = tester.getRect(find.text('Personal timezone'));
    expect(zone.top, greaterThanOrEqualTo(0));
    expect(zone.bottom, lessThanOrEqualTo(844));
    expect(h.router.state.matchedLocation, Routes.settings);

    // Groups far below the fold are built, so their jumps land too.
    await tester.scrollUntilVisible(
      field,
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(field, 'licenses');
    await _settle(tester);
    await tester.tap(find.byKey(const ValueKey('settings-search-licenses')));
    await _settle(tester);
    final licenses = tester.getRect(find.text('Open-source licenses'));
    expect(licenses.top, greaterThanOrEqualTo(0));
    expect(licenses.bottom, lessThanOrEqualTo(844));
    expect(tester.takeException(), isNull);
  });

  for (final mode in [shad.ThemeMode.light, shad.ThemeMode.dark]) {
    testWidgets('search is the root primary dock action (${mode.name})', (
      tester,
    ) async {
      _viewport(tester, const Size(390, 844));
      final h = _SettingsHarness();
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await h.dispose();
      });
      await h.theme.setThemeMode(mode);
      await h.pump(tester, shellChrome: true);
      // No inline field: the dock owns Settings search.
      expect(find.byKey(const ValueKey('settings-search-field')), findsNothing);
      ShellActionSpec action() =>
          h.actions.state.resolveForLocation(Routes.settings).first;
      expect(action().inDock, isTrue);
      expect(action().tooltip, 'Search settings');
      expect(action().searchController, isNull);
      await _capture(tester, 'settings-root-dock-search-${mode.name}');

      action().onPressed!();
      await _settle(tester);
      final controller = action().searchController!..text = 'amounts';
      action().onSearchChanged!('amounts');
      await _settle(tester);
      final result = find.byKey(
        const ValueKey('settings-search-app-finance-0'),
      );
      expect(result, findsOneWidget);
      await _capture(tester, 'settings-root-dock-search-results-${mode.name}');

      // Jumping to an inline row closes the dock search.
      controller.text = 'personal time';
      action().onSearchChanged!('personal time');
      await _settle(tester);
      await tester.tap(find.byKey(const ValueKey('settings-search-timezone')));
      await _settle(tester);
      expect(action().searchController, isNull);
      expect(controller.text, isEmpty);
      expect(find.text('Personal timezone'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('Calendar reloads the workspace default and links time zones', (
    tester,
  ) async {
    _viewport(tester, const Size(390, 844));
    final h = _SettingsHarness(initial: Routes.settingsAppPath('calendar'));
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      await h.dispose();
    });
    await h.pump(tester);
    // Deep-linked without the Settings root: this screen loads the default.
    verify(() => h.calendar.loadWorkspacePreference('ws')).called(1);
    h.scopes.add(_workspace('other'));
    await _settle(tester);
    verify(() => h.calendar.loadWorkspacePreference('other')).called(1);
    await _tapRow(tester, const ValueKey('settings-calendar-timezone-row'));
    expect(h.router.state.matchedLocation, Routes.settings);
    final zone = tester.getRect(find.text('Personal timezone'));
    expect(zone.top, greaterThanOrEqualTo(0));
    expect(zone.bottom, lessThanOrEqualTo(844));
    expect(tester.takeException(), isNull);
  });
}
