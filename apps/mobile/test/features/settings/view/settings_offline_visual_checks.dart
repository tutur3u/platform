part of 'settings_compact_navigation_test.dart';

void registerSettingsOfflineVisualChecks() {
  for (final mode in [shad.ThemeMode.light, shad.ThemeMode.dark]) {
    testWidgets('Offline paused plan fits the shared shell ${mode.name}', (
      tester,
    ) async {
      _viewport(tester, const Size(390, 844));
      final coordinator = OfflinePreparationCoordinator.forTesting(
        load: (_, _) async => {},
        write: (_, _, _) async {},
      );
      for (final id in OfflinePreparationCoordinator.productIds) {
        coordinator.register(id, (_) async {
          throw const ApiException(
            message: 'Download protection is temporarily unavailable.',
            statusCode: 503,
            retryAfter: 30,
          );
        });
      }
      await coordinator.run(userId: 'user', workspaceId: 'ws');
      final h = _SettingsHarness(
        initial: Routes.settingsOffline,
        offlineBuilder: (_, _) =>
            OfflinePage(embedded: true, coordinator: coordinator),
      );
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        await h.dispose();
        coordinator.cancel();
        coordinator.state.dispose();
      });
      await h.theme.setThemeMode(mode);
      await h.pump(tester, shellChrome: true);
      expect(find.textContaining('Downloads paused.'), findsOneWidget);
      expect(find.textContaining('503:'), findsNothing);
      final first = tester.getRect(
        find.byKey(const ValueKey('offline-product-finance')),
      );
      expect(first.height, lessThan(120));
      expect(find.text('Offline'), findsOneWidget);
      await _capture(tester, 'offline-paused-${mode.name}');
      expect(tester.takeException(), isNull);
    });
  }
}
