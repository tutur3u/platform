import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/features/inventory/widgets/inventory_sales_periods.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets('sales period controls remain usable on compact phones', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(320, 700);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpApp(
      Material(
        child: InventorySalesPeriodBar(
          periods: const [
            InventorySalesPeriod(
              id: 'period-1',
              name: 'Coffee Festival July 2026',
              status: 'active',
              saleCount: 12,
            ),
            InventorySalesPeriod(
              id: 'period-2',
              name: 'Summer Convention Campaign',
              status: 'active',
              saleCount: 4,
            ),
          ],
          selectedPeriodId: 'period-1',
          canManage: true,
          onChanged: (_) {},
          onCreate: () {},
          onEdit: (_) {},
          onToggleArchive: (_) {},
        ),
      ),
    );
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('Sales periods'), findsOneWidget);
    expect(find.text('New period'), findsOneWidget);
    expect(find.textContaining('Coffee Festival July 2026'), findsOneWidget);
  });
}
