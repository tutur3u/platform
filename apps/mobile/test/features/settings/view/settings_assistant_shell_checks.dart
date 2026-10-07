part of 'settings_compact_navigation_test.dart';

class _AssistantPreferences extends Mock implements AssistantPreferences {}

void registerSettingsAssistantShellChecks() {
  for (final language in ['en', 'vi']) {
    for (final scale in [1.0, 2.0]) {
      for (final check in [
        'title',
        'back',
        'content',
        'account ABA',
        'workspace ABA',
        'account covered ABA',
        'workspace covered ABA',
      ]) {
        testWidgets(
          'real Assistant settings shell $check $language scale $scale',
          (tester) async {
            _viewport(tester, Size(scale == 1 ? 390 : 320, 568));
            final preferences = _AssistantPreferences();
            final held = Completer<bool>();
            final heldScope = check.endsWith('ABA');
            bool Function()? capturedCurrent;
            when(
              () => preferences.loadKeepLiveWhileBrowsing('ws'),
            ).thenAnswer((_) => heldScope ? held.future : Future.value(true));
            final models = AssistantLocalModelsCubit(
              workspaceId: 'ws',
              isScopeCurrent: () => true,
              store: LocalTestStore()..installed = false,
              preferences: AssistantLocalPreferences(
                currentUserId: () => 'user',
              ),
              supported: () async => false,
            );
            late final _SettingsHarness h;
            h = _SettingsHarness(
              settingsBuilder: (context, _) => Center(
                child: TextButton(
                  key: const ValueKey('open-real-assistant-settings'),
                  onPressed: () => unawaited(
                    pushScopedSettingsPage(
                      context,
                      rootNavigator: true,
                      builder: (routeContext, isCurrent) {
                        expect(routeContext.read<AuthCubit>(), same(h.auth));
                        expect(
                          routeContext.read<WorkspaceCubit>(),
                          same(h.workspaces),
                        );
                        capturedCurrent = isCurrent;
                        return AssistantSettingsHub(
                          workspaceId: 'ws',
                          locations: const {Routes.settings},
                          isScopeCurrent: isCurrent,
                          preferences: preferences,
                          localModels: models,
                        );
                      },
                    ),
                  ),
                  child: const Text('Open assistant editor'),
                ),
              ),
            );
            addTearDown(() async {
              await tester.pumpWidget(const SizedBox.shrink());
              await h.dispose();
              if (!models.isClosed) await models.close();
            });
            await h.locale.setLocale(Locale(language));
            await h.pump(tester, scale: scale);
            await tester.tap(
              find.byKey(const ValueKey('open-real-assistant-settings')),
            );
            await _settle(tester);
            final hub = find.byType(AssistantSettingsHub);
            expect(hub, findsOneWidget);
            if (heldScope) {
              expect(capturedCurrent!(), isTrue);
              final covered = check.contains('covered');
              NavigatorState? rootNavigator;
              if (covered) {
                rootNavigator = Navigator.of(
                  tester.element(hub),
                  rootNavigator: true,
                );
                unawaited(
                  rootNavigator.push<void>(
                    MaterialPageRoute<void>(
                      builder: (_) => const Scaffold(
                        body: Text('Unrelated covering route'),
                      ),
                    ),
                  ),
                );
                await _settle(tester);
                expect(
                  find.byType(AssistantSettingsHub, skipOffstage: false),
                  findsOneWidget,
                );
              }
              if (check.startsWith('account')) {
                h.accounts.add(_account('other'));
                h.accounts.add(_account('user'));
              } else {
                h.scopes.add(_workspace('other'));
                h.scopes.add(_workspace('ws'));
              }
              await _settle(tester);
              expect(capturedCurrent!(), isFalse);
              expect(
                find.byType(AssistantSettingsHub, skipOffstage: false),
                findsNothing,
              );
              if (covered) {
                expect(find.text('Unrelated covering route'), findsOneWidget);
              }
              held.complete(true);
              await _settle(tester);
              expect(
                find.byType(AssistantSettingsHub, skipOffstage: false),
                findsNothing,
              );
              if (covered) {
                expect(find.text('Unrelated covering route'), findsOneWidget);
                rootNavigator!.pop();
                await _settle(tester);
                expect(
                  find.byKey(const ValueKey('open-real-assistant-settings')),
                  findsOneWidget,
                );
              }
              expect(capturedCurrent!(), isFalse);
              verifyNever(
                () => preferences.saveKeepLiveWhileBrowsing(
                  'ws',
                  value: any(named: 'value'),
                  shouldWrite: any(named: 'shouldWrite'),
                ),
              );
              expect(tester.takeException(), isNull);
              return;
            }
            final l10n = AppLocalizations.of(tester.element(hub));
            if (check == 'title') {
              expect(find.text(l10n.assistantSettingsTitle), findsOneWidget);
            } else if (check == 'back') {
              expect(find.bySemanticsLabel(l10n.navBack), findsOneWidget);
              await tester.tap(find.byType(ShellDockActionButton));
              await _settle(tester);
              expect(hub, findsNothing);
              expect(
                find.byKey(const ValueKey('open-real-assistant-settings')),
                findsOneWidget,
              );
            } else {
              final scrollable = find
                  .descendant(of: hub, matching: find.byType(Scrollable))
                  .first;
              final back = find.byType(ShellDockActionButton);
              expect(
                tester.getBottomLeft(scrollable).dy,
                lessThanOrEqualTo(tester.getTopLeft(back).dy),
              );
              // At large text the whole tile can exceed the viewport. The
              // interactive switch itself must remain reachable and clear Back.
              final control = find.descendant(
                of: hub,
                matching: find.byType(Switch),
              );
              await tester.ensureVisible(control);
              await _settle(tester);
              expect(control.hitTestable(), findsOneWidget);
              expect(tester.widget<Switch>(control).onChanged, isNotNull);
              final controlRect = tester.getRect(control);
              final viewportRect = tester.getRect(scrollable);
              expect(controlRect.top, greaterThanOrEqualTo(viewportRect.top));
              expect(
                controlRect.bottom,
                lessThanOrEqualTo(viewportRect.bottom),
              );
              expect(controlRect.left, greaterThanOrEqualTo(0));
              expect(
                controlRect.right,
                lessThanOrEqualTo(scale == 1 ? 390 : 320),
              );
              await tester.drag(scrollable, const Offset(0, -1200));
              await _settle(tester);
              expect(
                tester
                    .getRect(back)
                    .overlaps(tester.getRect(find.byType(SettingsRouteFrame))),
                isTrue,
              );
            }
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }
}
