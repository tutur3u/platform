part of 'settings_compact_navigation_test.dart';

void registerSettingsDesignChecks() {
  testWidgets('settings row grid aligns headings icons text and actions', (
    tester,
  ) async {
    _viewport(tester, const Size(390, 844));
    final h = _SettingsHarness();
    when(() => h.auth.isClosed).thenReturn(false);
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      await h.dispose();
    });
    await h.pump(tester);
    final section = find.byWidgetPredicate(
      (widget) => widget.runtimeType.toString() == '_PreferencesSection',
    );
    final tiles = find.descendant(
      of: section,
      matching: find.byType(SettingsTile),
    );
    final first = tiles.first;
    final title = tester.widget<SettingsTile>(first).title;
    final icon = find.descendant(
      of: first,
      matching: find.byIcon(LucideIcons.palette),
    );
    // Captions sit just inside the rounded card; icons and titles keep a
    // fixed grid inside it.
    final heading = find.text('Appearance & language');
    final card = tester.getRect(
      find.descendant(of: section, matching: find.byType(SettingsGroup)).first,
    );
    expect(
      tester.getTopLeft(heading).dx,
      closeTo(card.left + SettingsRowLayout.captionInset, 0.1),
    );
    expect(
      tester.getTopLeft(icon).dx,
      closeTo(card.left + SettingsRowLayout.inset, 0.1),
    );
    final titleX = tester.getTopLeft(find.text(title)).dx;
    expect(titleX, closeTo(card.left + SettingsRowLayout.textColumn, 0.1));
    for (final row in tiles.evaluate()) {
      final tile = row.widget as SettingsTile;
      final finder = find.byWidget(tile);
      expect(
        tester
            .getTopLeft(
              find.descendant(of: finder, matching: find.text(tile.title)),
            )
            .dx,
        closeTo(titleX, 0.1),
      );
      expect(tester.getSize(finder).height, greaterThanOrEqualTo(56));
    }
    final chevron = find.descendant(
      of: first,
      matching: find.byIcon(LucideIcons.chevronRight),
    );
    h.accounts.add(
      const AuthState.authenticated(
        supa.User(
          id: 'user',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          email: 'settings-fixture@tuturuuu.com',
          emailConfirmedAt: '2026-01-01T00:00:00Z',
          createdAt: '2026-01-01T00:00:00Z',
        ),
      ),
    );
    h.zones.add(
      TimezoneSettingsState(
        loading: false,
        failed: true,
        errorMessage: 'Please wait before retrying.',
        diagnostics: SafeErrorDiagnostics.capture(
          StateError('fixture'),
          DiagnosticStage.timezoneRead,
        ),
      ),
    );
    await _settle(tester);
    final retry = find.byKey(const ValueKey('timezone-retry-personal'));
    expect(
      tester.getCenter(retry).dx,
      closeTo(tester.getCenter(chevron).dx, 0.1),
    );
    expect(tester.getSize(retry).width, greaterThanOrEqualTo(44));
    expect(tester.getSize(retry).height, greaterThanOrEqualTo(44));
    final copy = find.descendant(
      of: find.byType(TimezoneSettingsTile).first,
      matching: find.byIcon(Icons.copy_rounded),
    );
    expect(tester.getCenter(copy).dx, closeTo(tester.getCenter(retry).dx, 0.1));
    expect(tester.getCenter(copy).dy, greaterThan(tester.getCenter(retry).dy));
    expect(
      find.byTooltip(tester.element(retry).l10n.settingsTimezoneRetry),
      findsNWidgets(2),
    );
    final divider = tester.widget<Divider>(
      find.descendant(of: section, matching: find.byType(Divider)).first,
    );
    // Inset dividers align with the title column.
    expect(divider.indent, SettingsRowLayout.textColumn);
    expect(divider.endIndent, SettingsRowLayout.inset);
    expect(tester.takeException(), isNull);
  });

  testWidgets('settings final control scrolls above the floating dock', (
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
    final scrollable = find.byType(Scrollable).first;
    final position = tester.state<ScrollableState>(scrollable).position;
    position.jumpTo(position.maxScrollExtent);
    await tester.pump(const Duration(seconds: 2));
    await _settle(tester);
    final lastRow = find.byType(SettingsTile).last;
    final dock = find.byType(MorphingNavigationBar);
    expect(tester.getRect(lastRow).bottom, lessThan(tester.getRect(dock).top));
    expect(find.byType(AppBar), findsNothing);
    expect(tester.takeException(), isNull);
  });

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
        // The profile header precedes Preferences; scroll each row in.
        for (final key in ['settings-haptics-row', 'settings-finance-row']) {
          await tester.scrollUntilVisible(
            find.byKey(ValueKey(key)),
            160,
            scrollable: find.byType(Scrollable).first,
          );
          expect(find.byKey(ValueKey(key)), findsOneWidget);
        }
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
