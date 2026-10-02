import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets('stock formatting preserves parsed fractional precision', (
    tester,
  ) async {
    final values = <double?, String>{
      null: 'Unlimited',
      0: '0',
      7: '7',
      2.5: '2.5',
      0.04: '0.04',
      0.004: '0.004',
      0.1: '0.1',
      1.23456789012345: '1.23456789012345',
      0.0000001: '1e-7',
      double.parse('1000000000000000100'): '1000000000000000100',
    };
    await tester.pumpApp(
      Builder(
        builder: (context) {
          expect(inventoryStockAmount(context, double.parse('-0.0')), '0');
          for (final entry in values.entries) {
            final rendered = inventoryStockAmount(context, entry.key);
            expect(rendered, entry.value);
            if (entry.key != null) {
              expect(double.parse(rendered), entry.key);
            }
          }
          return const SizedBox.shrink();
        },
      ),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('inventory hero actions stay compact on a narrow phone', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(320, 720);
    addTearDown(() {
      tester.view.resetDevicePixelRatio();
      tester.view.resetPhysicalSize();
    });

    await tester.pumpApp(
      InventoryHeroCard(
        title: 'Inventory',
        icon: Icons.inventory_2_outlined,
        metrics: const [
          InventoryMetricTile(
            label: 'Sales',
            value: '12',
            icon: Icons.point_of_sale_outlined,
          ),
        ],
        actions: [
          for (var index = 0; index < 5; index += 1)
            InventoryActionTile(
              label: 'Action $index',
              icon: Icons.inventory_2_outlined,
              onPressed: () {},
              primary: index == 0,
            ),
        ],
      ),
    );

    expect(find.byType(InventoryActionTile), findsNWidgets(5));
    expect(tester.takeException(), isNull);
  });
}
