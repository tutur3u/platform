import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/features/profile/view/profile_activity_chart.dart';
import 'package:mobile/features/profile/view/shared_activity_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets('pull recovers shared activity after an initial load failure', (
    tester,
  ) async {
    var calls = 0;
    await tester.pumpApp(
      Scaffold(
        body: SharedActivitySheet(
          name: 'Shared activity',
          load: () async {
            calls++;
            if (calls == 1) throw Exception('offline');
            return const TimeTrackerStats(todayTime: 600);
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    final error = tester
        .element(find.byType(SharedActivitySheet))
        .l10n
        .profileSharedActivityUnavailable;
    expect(find.text(error), findsOneWidget);
    await tester.drag(find.byType(SingleChildScrollView), const Offset(0, 450));
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(find.text(error), findsNothing);
    expect(find.byType(ProfileActivityChart), findsOneWidget);
  });
}
