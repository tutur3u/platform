part of 'settings_compact_navigation_test.dart';

class _SettingsMailRepository extends Mock implements MailRepository {}

void registerSettingsMailVisualChecks() {
  for (final mode in [shad.ThemeMode.light, shad.ThemeMode.dark]) {
    testWidgets('Mail settings shell and compact form ${mode.name}', (
      tester,
    ) async {
      _viewport(tester, const Size(390, 844));
      final repository = _SettingsMailRepository();
      const address = 'customer-experience-and-support-team@example.test';
      const accounts = {
        'mailboxes': [
          {'id': 'box', 'address': address, 'role': 'owner'},
        ],
      };
      const values = {
        'settings': {'senderName': 'Support team'},
      };
      when(
        () => repository.cachedSettingsAccounts('ws'),
      ).thenAnswer((_) async => accounts);
      when(
        () => repository.settingsBootstrap('ws'),
      ).thenAnswer((_) async => accounts);
      when(
        () => repository.cachedSettings('ws', 'box'),
      ).thenAnswer((_) async => values);
      when(
        () => repository.settings('ws', 'box'),
      ).thenAnswer((_) async => values);
      final h = _SettingsHarness(
        settingsBuilder: (_, _) => MailSettingsHub(
          repository: repository,
          workspaceId: 'ws',
          locations: const {Routes.settings},
          isScopeCurrent: () => true,
        ),
      );
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await h.dispose();
      });
      await h.theme.setThemeMode(mode);
      await h.pump(tester, shellChrome: true);
      expect(find.text(address), findsOneWidget);
      expect(find.byType(MailSettingsSkeleton), findsNothing);
      expect(find.byType(MobileSectionAppBar), findsNothing);
      await _capture(tester, 'mail-settings-accounts-${mode.name}');
      await tester.tap(find.text(address));
      await _settle(tester);
      expect(find.byType(MailSettingsPage), findsOneWidget);
      final save = h.actions.state
          .resolveForLocation(Routes.settings)
          .singleWhere((action) => action.id == 'mail-settings-save');
      expect(save.inDock, isTrue);
      expect(find.byType(AppBar), findsNothing);
      await _capture(tester, 'mail-settings-form-${mode.name}');
      expect(tester.takeException(), isNull);
    });
  }
}
