import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/deep_links.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/finance/view/bill_split_settlement_view.dart';

import 'package:mobile/l10n/l10n.dart';

import '../../../helpers/design_render_harness.dart';

const splitId = '9abafaf3-e1ca-4fcf-8729-f3916b0c913b';
const participantId = 'b957a8f4-0a6a-4a27-a63a-8101089a1503';
const workspaceId = 'our-workspace';

const sample = <String, dynamic>{
  'title': 'Weekend dinner',
  'currency': {'code': 'VND', 'minorDigits': 0},
  'participants': [
    {'id': 'a', 'displayName': 'Anh'},
    {'id': participantId, 'displayName': 'Linh'},
    {'id': 'c', 'displayName': 'Minh'},
  ],
  'ledger': {
    'balances': [
      {'participantId': 'a', 'amountMinor': 230000},
      {'participantId': participantId, 'amountMinor': -150000},
      {'participantId': 'c', 'amountMinor': -80000},
    ],
    'settlement': {
      'optimal': true,
      'transfers': [
        {'from': participantId, 'to': 'a', 'amountMinor': 150000},
        {'from': 'c', 'to': 'a', 'amountMinor': 80000},
      ],
    },
  },
};

void main() {
  testWidgets('renders settlement and only the requested participant share', (
    tester,
  ) async {
    final variants = ['light', 'dark'];
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
    await tester.runAsync(DesignRender.loadFonts);

    for (final variant in variants) {
      final (settings, brightness) = DesignRender.themes[variant]!;
      await tester.pumpWidget(
        DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: const SafeArea(
            child: AppPageListView(
              children: [
                BillSplitSettlementView(
                  split: sample,
                  workspaceId: workspaceId,
                  splitId: splitId,
                  participantId: participantId,
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Weekend dinner'), findsOneWidget);
      expect(find.text('Linh pays Anh'), findsOneWidget);
      expect(find.text('Minh pays Anh'), findsNothing);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'bill-split-$variant');
    }
  });

  testWidgets(
    'copies the current view and routes to participant and settlement',
    (tester) async {
      final copied = <String>[];
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            ..setMockMethodCallHandler(SystemChannels.platform, (call) async {
              if (call.method == 'Clipboard.setData') {
                copied.add(
                  (call.arguments as Map<Object?, Object?>)['text']! as String,
                );
              }
              return null;
            });
      addTearDown(
        () => messenger.setMockMethodCallHandler(SystemChannels.platform, null),
      );

      final router = GoRouter(
        initialLocation: Routes.financeBillSplitLocation(splitId),
        routes: [
          GoRoute(
            path: Routes.financeBillSplits,
            builder: (_, state) => Scaffold(
              body: AppPageListView(
                children: [
                  BillSplitSettlementView(
                    split: sample,
                    workspaceId: workspaceId,
                    splitId: splitId,
                    participantId: state.uri.queryParameters['participant'],
                    settlement: state.uri.queryParameters['settlement'] == '1',
                  ),
                ],
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
      await tester.pumpAndSettle();

      const base =
          'https://tuturuuu.com/en/$workspaceId/finance/bill-splits/$splitId';
      final copyButton = find.text('Copy signed-in link');
      await tester.tap(copyButton);
      await tester.pumpAndSettle();
      expect(find.text('Link copied'), findsOneWidget);

      await tester.tap(find.text('Linh'));
      await tester.pumpAndSettle();
      expect(find.text('Linh pays Anh'), findsOneWidget);
      expect(find.text('Minh pays Anh'), findsNothing);
      await tester.tap(copyButton);
      await tester.pumpAndSettle();

      router.pop();
      await tester.pumpAndSettle();
      await tester.tap(find.text('View settlement'));
      await tester.pumpAndSettle();
      expect(find.text('View settlement'), findsNothing);
      await tester.tap(copyButton);
      await tester.pumpAndSettle();

      expect(copied, [
        base,
        '$base/participants/$participantId',
        '$base/settlement',
      ]);
      expect(
        copied.map((url) => resolveMobileDeepLink(Uri.parse(url))!.location),
        [
          Routes.financeBillSplitLocation(splitId),
          Routes.financeBillSplitLocation(
            splitId,
            participantId: participantId,
          ),
          Routes.financeBillSplitLocation(splitId, settlement: true),
        ],
      );

      router.go(
        Routes.financeBillSplitLocation(splitId, participantId: 'unknown'),
      );
      await tester.pumpAndSettle();
      expect(copyButton, findsNothing);
      expect(find.text('Bill splits are unavailable'), findsOneWidget);
      await tester.pump(const Duration(seconds: 4));
    },
  );
}
