import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/download_network_consent.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/apps/widgets/app_visibility_button.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  for (final consent in [false, true]) {
    testWidgets('Back dismisses ${consent ? 'network consent' : 'hide app'} '
        'before leaving its route', (tester) async {
      Object? result = 'unresolved';
      final router = GoRouter(
        initialLocation: '/detail',
        routes: [
          GoRoute(path: '/', builder: (_, _) => const Text('Home')),
          GoRoute(
            path: '/detail',
            builder: (context, _) => AppScaffold(
              child: AppButton(
                onPressed: () async {
                  result = consent
                      ? await requestDownloadNetworkConsent(
                          context,
                          connectivity: () async => [ConnectivityResult.mobile],
                        )
                      : await confirmHideApp(context);
                },
                child: const Text('Open'),
              ),
            ),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        MaterialApp.router(
          routerConfig: router,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(find.byType(AppDialog), findsOneWidget);
      expect(result, 'unresolved');
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.byType(AppDialog), findsNothing);
      expect(result, consent ? isNull : false);
      expect(router.state.matchedLocation, '/detail');
      expect(find.text('Open'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
