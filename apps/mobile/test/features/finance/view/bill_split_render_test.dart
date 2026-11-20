import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/finance/view/bill_split_settlement_view.dart';

import '../../../helpers/design_render_harness.dart';

const sample = <String, dynamic>{
  'title': 'Weekend dinner',
  'currency': {'code': 'VND', 'minorDigits': 0},
  'participants': [
    {'id': 'a', 'displayName': 'Anh'},
    {'id': 'b', 'displayName': 'Linh'},
    {'id': 'c', 'displayName': 'Minh'},
  ],
  'ledger': {
    'balances': [
      {'participantId': 'a', 'amountMinor': 230000},
      {'participantId': 'b', 'amountMinor': -150000},
      {'participantId': 'c', 'amountMinor': -80000},
    ],
    'settlement': {
      'optimal': true,
      'transfers': [
        {'from': 'b', 'to': 'a', 'amountMinor': 150000},
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
                BillSplitSettlementView(split: sample, participantId: 'b'),
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
}
