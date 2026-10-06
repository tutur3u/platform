import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/download_network_consent.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('cellular starts nothing before an explicit Continue choice', (
    tester,
  ) async {
    DownloadNetworkConsent? result;
    var resolved = false;
    await tester.pumpApp(
      Builder(
        builder: (context) => TextButton(
          onPressed: () async {
            result = await requestDownloadNetworkConsent(
              context,
              connectivity: () async => [ConnectivityResult.mobile],
            );
            resolved = true;
          },
          child: const Text('Start'),
        ),
      ),
    );
    await tester.tap(find.text('Start'));
    await tester.pumpAndSettle();
    expect(resolved, isFalse);
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(resolved, isTrue);
    expect(result, DownloadNetworkConsent.allowCellular);
  });
  testWidgets(
    'unknown network permits only an explicit Wi-Fi plan or cancellation',
    (tester) async {
      DownloadNetworkConsent? result;
      await tester.pumpApp(
        Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              result = await requestDownloadNetworkConsent(
                context,
                connectivity: () async =>
                    throw StateError('Unavailable interface'),
              );
            },
            child: const Text('Start'),
          ),
        ),
      );
      await tester.tap(find.text('Start'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Use Wi-Fi'));
      await tester.pumpAndSettle();
      expect(result, DownloadNetworkConsent.wifiOnly);
      await tester.tap(find.text('Start'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(result, isNull);
    },
  );
  testWidgets(
    'Wi-Fi defaults to a Wi-Fi-only transfer without a cellular grant',
    (tester) async {
      DownloadNetworkConsent? result;
      await tester.pumpApp(
        Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              result = await requestDownloadNetworkConsent(
                context,
                connectivity: () async => [ConnectivityResult.wifi],
              );
            },
            child: const Text('Start'),
          ),
        ),
      );
      await tester.tap(find.text('Start'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect(result, DownloadNetworkConsent.wifiOnly);
    },
  );
}
