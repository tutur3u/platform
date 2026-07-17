import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';

import '../../../helpers/helpers.dart';

void main() {
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
