part of 'settings_compact_navigation_test.dart';

void registerSettingsAssistantEntrypointChecks() {
  for (final language in ['en', 'vi']) {
    for (final entrypoint in [
      'central tile',
      'live menu',
      'nested live menu',
    ]) {
      testWidgets('actual Assistant $entrypoint above shell $language', (
        tester,
      ) async {
        _viewport(tester, const Size(390, 844));
        final repository = ReplyRepository();
        final settingsRepository = personal.SettingsRepository(ownerId: 'user');
        late final _SettingsHarness h;
        h = _SettingsHarness(
          assistantSettingsRepository: settingsRepository,
          initial: entrypoint.endsWith('live menu')
              ? Routes.assistant
              : Routes.settings,
          settingsBuilder: (_, _) =>
              const SingleChildScrollView(child: ProductSettingsSection()),
          assistantPageBuilder: entrypoint.endsWith('live menu')
              ? (token) {
                  final page = AssistantPage(
                    replayToken: token,
                    repository: repository,
                    preferences: AssistantPreferences(
                      currentUserId: () => 'user',
                    ),
                    currentActor: () => h.auth.state.user?.id,
                  );
                  // The persistent production shell places Assistant above its
                  // detail navigator. Also exercise a nested page navigator so
                  // omitting the actual caller's root opt-in is observable.
                  return entrypoint == 'nested live menu'
                      ? Navigator(
                          onGenerateRoute: (_) =>
                              MaterialPageRoute<void>(builder: (_) => page),
                        )
                      : page;
                }
              : null,
        );
        addTearDown(() async {
          await tester.pumpWidget(const SizedBox.shrink());
          await _settle(tester);
          await h.dispose();
          unawaited(repository.stream.close());
          unawaited(repository.replacement.close());
        });
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          const MethodChannel('com.llfbandit.record/messages'),
          (_) async => null,
        );
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          const MethodChannel('flutter_timezone'),
          (_) async => 'UTC',
        );
        addTearDown(() {
          for (final channel in [
            'com.llfbandit.record/messages',
            'flutter_timezone',
          ]) {
            tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
              MethodChannel(channel),
              null,
            );
          }
        });
        await h.locale.setLocale(Locale(language));
        await h.pump(tester, shellChrome: true);
        final origin = entrypoint.endsWith('live menu')
            ? find.byType(AssistantPage)
            : find.byType(ProductSettingsSection);
        expect(origin, findsOneWidget);
        final root = Navigator.of(tester.element(origin), rootNavigator: true);
        final nested = Navigator.of(tester.element(origin));
        expect(
          nested,
          entrypoint == 'live menu' ? same(root) : isNot(same(root)),
        );
        final l10n = AppLocalizations.of(tester.element(origin));
        if (entrypoint == 'central tile') {
          await tester.tap(find.byKey(const ValueKey('assistant')));
        } else {
          tester.element(origin).read<AssistantChromeCubit>().enterLiveMode();
          await _settle(tester);
          expect(
            tester
                .element(origin)
                .read<AssistantChromeCubit>()
                .state
                .isLiveMode,
            isTrue,
          );
          await tester.tap(
            find.byKey(const ValueKey('shell-action-button-assistant-more')),
          );
          await _settle(tester);
          expect(find.text(l10n.assistantHistoryTitle), findsNothing);
          final settingsAction = find.widgetWithText(
            AppGroupedRow,
            l10n.assistantSettingsTitle,
          );
          // The nested sheet shares the bottom edge with the floating dock.
          // Tap a point of the real menu row that the dock leaves reachable.
          await tester.tapAt(_reachablePointOf(tester, settingsAction));
        }
        await _settle(tester);
        final hub = find.byType(AssistantSettingsHub);
        expect(hub, findsOneWidget);
        expect(Navigator.of(tester.element(hub)), isNot(same(root)));
        expect(find.byType(ShellPage), findsOneWidget);
        expect(find.text(l10n.assistantSettingsTitle), findsOneWidget);
        expect(
          h.router.state.matchedLocation,
          Routes.settingsAppPath('assistant'),
        );
        expect(find.byKey(const ValueKey('app-sheet-close')), findsNothing);
        expect(tester.element(hub).read<AuthCubit>(), same(h.auth));
        expect(tester.element(hub).read<WorkspaceCubit>(), same(h.workspaces));
        expect(tester.widget<AssistantSettingsHub>(hub).workspaceId, 'ws');
        // Continue through the actual caller and hub into both routed editors.
        final personality = find.byKey(
          const ValueKey('assistant-settings-personality'),
        );
        await tester.ensureVisible(personality);
        await tester.tap(personality);
        await _settle(tester);
        expect(find.byType(MobileSectionAppBar), findsNothing);
        expect(find.byType(AppSheetScaffold), findsNothing);
        expect(
          h.router.state.matchedLocation,
          Routes.settingsAppPath('assistant'),
        );
        expect(find.byKey(const ValueKey('app-sheet-close')), findsNothing);
        expect(find.byType(ShellPage), findsOneWidget);
        await tester.tap(
          find.byKey(const ValueKey('assistant-personality-name')),
        );
        await _settle(tester);
        expect(find.byType(AssistantPersonalityFieldEditor), findsOneWidget);
        expect(find.byType(MobileSectionAppBar), findsNothing);
        expect(find.byType(AppSheetScaffold), findsNothing);
        await tester.enterText(
          find.byType(AppTextFormField).last,
          'Routed Nova',
        );
        expect(find.byTooltip(l10n.commonSave).hitTestable(), findsOneWidget);
        await tester.tap(find.byTooltip(l10n.commonSave).hitTestable());
        await _settle(tester);
        expect(find.text('Routed Nova').hitTestable(), findsOneWidget);
        expect(settingsRepository.writes, 1);
        await tester.binding.handlePopRoute();
        await _settle(tester);
        final memoryRow = find.text('Synthetic preference');
        await tester.ensureVisible(memoryRow);
        await tester.tap(memoryRow);
        await _settle(tester);
        expect(find.byType(AssistantMemoryEditor), findsOneWidget);
        expect(find.byType(MobileSectionAppBar), findsNothing);
        expect(find.byType(AppSheetScaffold), findsNothing);
        expect(
          h.router.state.matchedLocation,
          Routes.settingsAppPath('assistant'),
        );
        expect(find.byKey(const ValueKey('app-sheet-close')), findsNothing);
        await tester.enterText(
          find.byType(AppTextFormField).last,
          'Routed memory',
        );
        await _settle(tester);
        final memorySave = find.byTooltip(l10n.commonSave).hitTestable();
        await tester.ensureVisible(memorySave);
        await tester.tap(memorySave);
        await _settle(tester);
        expect(find.text('Routed memory'), findsOneWidget);
        expect(settingsRepository.edits, 1);
        await tester.binding.handlePopRoute();
        await _settle(tester);
        expect(hub, findsNothing);
        expect(origin, findsOneWidget);
        expect(
          h.router.state.matchedLocation,
          entrypoint.endsWith('live menu') ? Routes.assistant : Routes.settings,
        );
        expect(tester.takeException(), isNull);
      });
    }
  }
}

/// Returns a point inside [finder] whose hit test reaches it, so taps follow
/// what a user can touch rather than a fixed edge the floating dock may cover.
Offset _reachablePointOf(WidgetTester tester, Finder finder) {
  final target = tester.renderObject(finder);
  final rect = tester.getRect(finder);
  for (var y = rect.top + 4; y < rect.bottom; y += 4) {
    for (var x = rect.left + 8; x < rect.right; x += 8) {
      final point = Offset(x, y);
      final result = HitTestResult();
      tester.binding.hitTestInView(result, point, tester.view.viewId);
      if (result.path.any((entry) => identical(entry.target, target))) {
        return point;
      }
    }
  }
  fail('No reachable point on the menu row; the floating dock covers it.');
}
