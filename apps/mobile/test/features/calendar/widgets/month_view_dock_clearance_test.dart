import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/calendar/widgets/month_view.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets('the month grid stops above the dock clearance', (tester) async {
    const clearance = 96.0;
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);

    await tester.pumpApp(
      Builder(
        builder: (context) => MediaQuery(
          // The calendar page passes the dock clearance through to the
          // full-bleed canvas as MediaQuery bottom padding.
          data: MediaQuery.of(
            context,
          ).copyWith(padding: const EdgeInsets.only(bottom: clearance)),
          child: MonthView(
            selectedDate: DateTime.utc(2030, 1, 15),
            focusedMonth: DateTime.utc(2030),
            events: const [],
            onDaySelected: (_) {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final grid = tester.getRect(find.byType(GridView));
    expect(grid.bottom, closeTo(844 - clearance, 0.5));
    // Every one of the six rows is above the dock and inside the grid.
    expect(grid.height, greaterThan(6 * 40));
    expect(grid.left, 0);
    expect(grid.right, 390);
  });
}
