import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/features/mastermind/usage/usage_content.dart';
import 'package:mobile/l10n/l10n.dart';

import '../../../helpers/mastermind_fleet_usage_fixture.dart';
import '../../../helpers/mastermind_ship_pump.dart';

void main() {
  setUpAll(initializeDateFormatting);

  for (final (locale, scale) in [
    (const Locale('en'), 1.0),
    (const Locale('vi'), 2.0),
  ]) {
    testWidgets(
      '${locale.languageCode} at ${scale}x clears the dock on the last row',
      (tester) async {
        const size = Size(320, 700);
        const dockClearance = 84.0;
        await pumpInsights(
          tester,
          FakeFleetUsageSource(fleetUsageFixture()),
          size: size,
          dockClearance: dockClearance,
          locale: locale,
          textScale: scale,
        );
        final scroll = find.descendant(
          of: find.byType(UsageContent),
          matching: find.byType(CustomScrollView),
        );
        final vertical = find.descendant(
          of: scroll,
          matching: find.byWidgetPredicate(
            (widget) =>
                widget is Scrollable &&
                widget.axisDirection == AxisDirection.down,
          ),
        );
        final table = find.byType(DataTable);
        await tester.scrollUntilVisible(table, 300, scrollable: vertical);
        final position = tester.state<ScrollableState>(vertical).position;
        position.jumpTo(position.maxScrollExtent);
        await tester.pumpAndSettle();

        final l10n = tester.element(table).l10n;
        expect(find.text(l10n.mastermindUsageTokens), findsOneWidget);
        final row = find.descendant(
          of: table,
          matching: find.text(fleetUsageModel),
        );
        expect(row, findsOneWidget);
        expect(
          tester.getBottomLeft(row).dy,
          lessThan(size.height - dockClearance),
        );
        expect(tester.takeException(), isNull);
      },
    );
  }
}
