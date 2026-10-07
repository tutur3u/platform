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
        late final _SettingsHarness h;
        h = _SettingsHarness(
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
        await h.pump(tester);
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
            ListTile,
            l10n.assistantSettingsTitle,
          );
          // The nested sheet shares the bottom edge with the floating dock.
          // Tap the visible leading edge of the real menu row.
          await tester.tapAt(
            tester.getTopLeft(settingsAction) + const Offset(16, 24),
          );
        }
        await _settle(tester);
        final hub = find.byType(AssistantSettingsHub);
        expect(hub, findsOneWidget);
        expect(Navigator.of(tester.element(hub)), same(root));
        expect(find.byType(ShellPage), findsNothing);
        expect(find.text(l10n.assistantSettingsTitle), findsOneWidget);
        expect(find.bySemanticsLabel(l10n.navBack), findsOneWidget);
        expect(tester.element(hub).read<AuthCubit>(), same(h.auth));
        expect(tester.element(hub).read<WorkspaceCubit>(), same(h.workspaces));
        expect(tester.widget<AssistantSettingsHub>(hub).workspaceId, 'ws');
        await tester.tap(find.byType(ShellDockActionButton));
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
