import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet_access/fleet_access_module.dart';
import 'package:mobile/features/mastermind/mastermind_module.dart';

import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/pump_app.dart';

// Product rule: apps/docs/platform/features/fleet-access.mdx#mastermind-mobile
void main() {
  test('both modules read Mastermind ownership from one predicate', () {
    expect(mastermindModule.isVisible, same(mastermindOwnerVisible));
    for (final item in fleetAccessModule.miniAppNavItems) {
      expect(item.isVisible, same(mastermindOwnerVisible), reason: item.id);
    }
  });

  for (final (mode, owner) in [
    (TestAccess.enabled, true),
    (TestAccess.disabled, false),
    (TestAccess.loading, false),
    (TestAccess.error, false),
  ]) {
    testWidgets(
      'the Fleet tab mirror agrees with Mastermind when ${mode.name}',
      (tester) async {
        final harness = MastermindViewHarness();
        addTearDown(harness.dispose);
        await harness.setAccess(mode);
        late bool mastermind;
        late List<bool> tabs;
        await tester.pumpApp(
          harness.wrap(
            Builder(
              builder: (context) {
                mastermind = mastermindModule.visibleIn(context);
                tabs = [
                  for (final item in fleetAccessModule.miniAppNavItems)
                    item.visibleIn(context),
                ];
                return const SizedBox.shrink();
              },
            ),
          ),
        );
        await tester.pump();
        expect(mastermind, owner);
        expect(tabs, List.filled(tabs.length, owner));
        expect(tabs, hasLength(mastermindModule.miniAppNavItems.length));
      },
    );
  }
}
