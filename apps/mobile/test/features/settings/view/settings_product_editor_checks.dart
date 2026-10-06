part of 'settings_compact_navigation_test.dart';

void registerProductEditorChecks() {
  for (final product in ['calendar', 'finance']) {
    testWidgets('product $product opens its real editor and saves', (
      tester,
    ) async {
      final h = _SettingsHarness();
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        await h.dispose();
      });
      when(
        () => h.calendar.setFirstDayOfWeek(FirstDayOfWeek.monday),
      ).thenAnswer((_) async {});
      await h.pump(tester);
      await _tapRow(tester, ValueKey(product));
      if (product == 'calendar') {
        expect(find.text('Monday'), findsOneWidget);
        await tester.ensureVisible(find.text('Monday'));
        await _settle(tester);
        await tester.tap(find.text('Monday'));
        await _settle(tester);
        verify(
          () => h.calendar.setFirstDayOfWeek(FirstDayOfWeek.monday),
        ).called(1);
      } else {
        expect(find.text('Show amounts'), findsOneWidget);
        await tester.tap(find.text('Show amounts'));
        await _settle(tester);
        expect(h.finance.state.showAmounts, isTrue);
        expect(await h.settings.getFinanceAmountsVisible(), isTrue);
      }
      expect(h.router.state.matchedLocation, Routes.settings);
      expect(tester.takeException(), isNull);
    });
  }
  for (final product in ['calendar', 'finance']) {
    for (final transition in [
      'account',
      'account ABA',
      'logout',
      'workspace ABA',
    ]) {
      testWidgets('product $product cancels on $transition', (tester) async {
        final h = _SettingsHarness();
        addTearDown(() async {
          await tester.pumpWidget(const SizedBox.shrink());
          await h.dispose();
        });
        await h.pump(tester);
        await _tapRow(tester, ValueKey(product));
        final choice = product == 'calendar' ? 'Monday' : 'Show amounts';
        expect(find.text(choice), findsOneWidget);
        if (transition == 'workspace ABA') {
          h.scopes.add(_workspace('other-workspace'));
          h.scopes.add(_workspace('ws'));
        } else if (transition == 'logout') {
          h.accounts.add(const AuthState.unauthenticated());
        } else {
          h.accounts.add(_account('other-account'));
          if (transition == 'account ABA') h.accounts.add(_account('user'));
        }
        await _settle(tester);
        expect(find.text(choice), findsNothing);
        verifyNever(() => h.calendar.setFirstDayOfWeek(FirstDayOfWeek.monday));
        expect(h.finance.state.showAmounts, isFalse);
        expect(await h.settings.getFinanceAmountsVisible(), isFalse);
        expect(tester.takeException(), isNull);
      });
    }
  }
}
