part of 'settings_compact_navigation_test.dart';

class _SecretsRepository extends Mock implements WorkspaceSecretsRepository {}

void registerSettingsSecretsShellChecks() {
  for (final language in ['en', 'vi']) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('Secrets shell has one title $language scale $scale', (
        tester,
      ) async {
        _viewport(tester, Size(scale == 1 ? 390 : 320, 568));
        late final _SettingsHarness h;
        h = _SettingsHarness(
          initial: Routes.settingsWorkspaceSecrets,
          workspaceSecretsBuilder: (_, _) => SettingsWorkspaceSecretsPage(
            repository: _SecretsRepository(),
            permissionsRepository: h.permissions,
          ),
        );
        addTearDown(() async {
          await tester.pumpWidget(const SizedBox.shrink());
          await h.dispose();
        });
        await h.locale.setLocale(Locale(language));
        await h.pump(tester, scale: scale);
        final l10n = AppLocalizations.of(
          tester.element(find.byType(SettingsWorkspaceSecretsPage)),
        );
        expect(find.byType(ShellPage), findsOneWidget);
        expect(_settingsDockBack(), findsOneWidget);
        expect(find.byType(AppBar), findsNothing);
        expect(find.text(l10n.settingsWorkspaceSecretsTitle), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      testWidgets('Secrets shell keeps denial and back reachable $language '
          'scale $scale', (tester) async {
        _viewport(tester, Size(scale == 1 ? 390 : 320, 568));
        late final _SettingsHarness h;
        h = _SettingsHarness(
          initial: Routes.settingsWorkspaceSecrets,
          workspaceSecretsBuilder: (_, _) => SettingsWorkspaceSecretsPage(
            repository: _SecretsRepository(),
            permissionsRepository: h.permissions,
          ),
        );
        addTearDown(() async {
          await tester.pumpWidget(const SizedBox.shrink());
          await h.dispose();
        });
        await h.locale.setLocale(Locale(language));
        await h.pump(tester, scale: scale);
        final page = find.byType(SettingsWorkspaceSecretsPage);
        final l10n = AppLocalizations.of(tester.element(page));
        final denial = find.text(
          l10n.settingsWorkspaceSecretsAccessDeniedTitle,
        );
        final list = find.descendant(of: page, matching: find.byType(ListView));
        await tester.scrollUntilVisible(
          denial,
          120,
          scrollable: find
              .descendant(of: list, matching: find.byType(Scrollable))
              .first,
        );
        await _settle(tester);
        await tester.pump(const Duration(seconds: 2));
        await _settle(tester);
        final header = find.byKey(
          const ValueKey('floating-shell-header-surface'),
        );
        final back = _settingsDockBack();
        expect(back.hitTestable(), findsOneWidget);
        expect(
          tester.getTopLeft(denial).dy,
          greaterThanOrEqualTo(tester.getBottomLeft(header).dy),
        );
        expect(
          tester.getBottomLeft(denial).dy,
          lessThanOrEqualTo(tester.getTopLeft(back).dy),
        );
        await tester.tap(back);
        await _settle(tester);
        expect(find.byType(SettingsWorkspaceSecretsPage), findsNothing);
        expect(find.byType(ShellPage), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }
}
