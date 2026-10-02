part of 'settings_compact_navigation_test.dart';

void registerHiddenRecoveryChecks() {
  const guest = Workspace(id: 'guest-hidden', name: 'Guest project');
  const team = Workspace(id: 'team-visible', name: 'Team');
  setUpAll(() => registerFallbackValue(guest));
  for (final sample in [
    ('guest without admin permission', guest, const ['guest-hidden'], 1.0),
    ('no active workspace', null, const ['guest-hidden'], 1.0),
    (
      'all Hidden at narrow large text',
      null,
      const ['guest-hidden', 'team-visible'],
      2.0,
    ),
  ]) {
    testWidgets('root Hidden recovery: ${sample.$1}', (tester) async {
      _viewport(
        tester,
        sample.$4 == 2 ? const Size(320, 568) : const Size(390, 844),
      );
      final h = _SettingsHarness();
      final state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: sample.$2,
        defaultWorkspace: guest,
        workspaces: const [guest, team],
        hiddenWorkspaceIds: sample.$3,
        visibilityResolved: true,
        visibilityStatus: WorkspaceStatus.loaded,
      );
      whenListen(h.workspaces, h.scopes.stream, initialState: state);
      when(() => h.workspaces.hasAuthenticatedActor).thenReturn(true);
      when(h.workspaces.refreshHiddenWorkspaces).thenAnswer((_) async {});
      when(
        () => h.workspaces.setWorkspaceHidden(
          any(),
          hidden: any(named: 'hidden'),
        ),
      ).thenAnswer((_) async {});
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await h.dispose();
      });
      await h.pump(tester, scale: sample.$4);
      expect(h.allowed, isFalse);
      expect(
        find.byKey(const ValueKey('mini-nav-settings-settings_app')),
        findsOneWidget,
      );
      expect(
        AppRegistry.moduleById(
          'settings',
        )!.miniAppNavItems.map((item) => item.route),
        [Routes.settings],
      );
      await _tapRow(tester, const ValueKey('settings-hidden-workspaces-row'));
      await _settle(tester);
      expect(find.byTooltip('Restore: Guest project'), findsOneWidget);
      await _capture(tester, 'hidden-root-${sample.$1.split(' ').first}');
      verifyNever(
        () => h.workspaces.setWorkspaceHidden(
          any(),
          hidden: any(named: 'hidden'),
        ),
      );
      await tester.tap(find.byIcon(Icons.search_rounded).last);
      await _settle(tester);
      await tester.enterText(find.byType(EditableText), 'Guest');
      await _settle(tester);
      expect(find.text('Team'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.binding.handlePopRoute();
      await _settle(tester);
      expect(find.byType(Dialog), findsNothing);
      expect(h.router.state.matchedLocation, Routes.settings);
      verifyNever(
        () => h.workspaces.setWorkspaceHidden(
          any(),
          hidden: any(named: 'hidden'),
        ),
      );
      await _tapRow(tester, const ValueKey('settings-hidden-workspaces-row'));
      await _settle(tester);
      await tester.ensureVisible(find.byTooltip('Restore: Guest project'));
      await _settle(tester);
      await _capture(tester, 'hidden-ready-${sample.$1.split(' ').first}');
      await tester.tap(find.byTooltip('Restore: Guest project'));
      await _settle(tester);
      verify(
        () => h.workspaces.setWorkspaceHidden(guest.id, hidden: false),
      ).called(1);
      verifyNever(() => h.workspaces.selectWorkspace(any()));
      verifyNever(() => h.workspaces.setDefaultWorkspace(any()));
      expect(h.workspaces.state.currentWorkspace, state.currentWorkspace);
      expect(h.workspaces.state.defaultWorkspace, state.defaultWorkspace);
      expect(tester.takeException(), isNull);
    });
  }
}
