import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/kit/app_segmented_control.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/features/habits/view/habits_page_chrome.dart';

import '../../../helpers/pump_app.dart';

void main() {
  testWidgets('scope switch is the shared concentric segmented control', (
    tester,
  ) async {
    final picked = <HabitTrackerScope>[];
    await tester.pumpWidget(
      sorbetTestApp(
        home: Material(
          child: Center(
            child: SizedBox(
              width: 360,
              child: HabitsScopeControls(
                selectedScope: HabitTrackerScope.self,
                onScopeSelected: (scope) async => picked.add(scope),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(AppSegmentedControl<HabitTrackerScope>), findsOneWidget);
    expect(find.byType(SegmentedButton<HabitTrackerScope>), findsNothing);

    await tester.tap(find.text('Self'));
    await tester.tap(find.text('Team'));
    await tester.pump();
    expect(picked, [HabitTrackerScope.team]);
  });
}
