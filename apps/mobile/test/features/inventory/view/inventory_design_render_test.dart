import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/design_render_harness.dart';
import 'inventory_items_fixture.dart';

/// Review renders of the items workspace at phone, tablet and desktop sizes.
/// PNGs are written only when `DESIGN_RENDER_DIR` is set.
void main() {
  setUpAll(DesignRender.loadFonts);

  const sizes = {
    'phone': Size(390, 844),
    'tablet': Size(834, 1194),
    'desktop': Size(1440, 900),
  };

  for (final size in sizes.entries) {
    for (final brightness in Brightness.values) {
      final name = 'inventory-items-${size.key}-${brightness.name}';
      testWidgets(name, (tester) async {
        await pumpItemsPage(tester, size: size.value, brightness: brightness);
        expect(tester.takeException(), isNull);
        await DesignRender.capture(tester, name);
      });

      final detail = 'inventory-detail-${size.key}-${brightness.name}';
      testWidgets(detail, (tester) async {
        // Phones open the item on its own route; wider layouts show it
        // beside the list. Managers see the edit actions.
        await pumpItemsPage(
          tester,
          size: size.value,
          brightness: brightness,
          initialProductId: 'beans',
          detailOnly: size.key == 'phone',
          permissions: size.key == 'phone'
              ? managerPermissions
              : const {'view_inventory_stock'},
        );
        expect(tester.takeException(), isNull);
        await DesignRender.capture(tester, detail);
      });
    }
  }
}
