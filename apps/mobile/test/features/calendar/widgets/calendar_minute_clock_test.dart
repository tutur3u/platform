import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/widgets/calendar_minute_clock.dart';

void main() {
  testWidgets(
    'refresh aligns to the next wall-clock minute and each boundary',
    (tester) async {
      var now = DateTime.utc(2030, 1, 1, 12, 0, 53);
      var builds = 0;
      await tester.pumpWidget(
        CalendarMinuteClock(
          clock: () => now,
          child: Directionality(
            textDirection: TextDirection.ltr,
            child: Builder(
              builder: (context) {
                builds++;
                return Text('${calendarNowInContext(context).second}');
              },
            ),
          ),
        ),
      );
      expect(find.text('53'), findsOneWidget);
      final initialBuilds = builds;
      await tester.pump(const Duration(seconds: 6));
      expect(builds, initialBuilds);
      now = now.add(const Duration(seconds: 7));
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('0'), findsOneWidget);
      expect(builds, initialBuilds + 1);
      now = now.add(const Duration(minutes: 1));
      await tester.pump(const Duration(minutes: 1));
      expect(builds, initialBuilds + 2);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(minutes: 2));
      expect(tester.takeException(), isNull);
    },
  );
}
