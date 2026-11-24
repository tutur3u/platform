import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/widgets/agenda_view.dart';
import 'package:mobile/features/calendar/widgets/month_view.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';
import 'package:mobile/features/calendar/widgets/year_view.dart';

import '../../../helpers/helpers.dart';

// 2030-01-15 is a Tuesday.
final _day = DateTime(2030, 1, 15);

Future<void> _pump(WidgetTester tester, Locale locale, Widget child) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(900, 1200);
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  await tester.pumpWidget(
    sorbetTestApp(
      locale: locale,
      home: Scaffold(body: child),
    ),
  );
  await tester.pumpAndSettle();
}

MultiDayScheduleView _multiDay() => MultiDayScheduleView(
  selectedDate: _day,
  events: const [],
  visibleDayCount: 3,
  onEventTap: (_) {},
  onCreateAtTime: (_) {},
  onDaySelected: (_) {},
  onSwipe: (_) {},
);

void main() {
  group('multi-day day strip', () {
    testWidgets('shows Vietnamese weekday and month labels in vi', (
      tester,
    ) async {
      await _pump(tester, const Locale('vi'), _multiDay());

      // Flutter's vi symbols: Tuesday is "Th 3", January is "Tháng 1".
      expect(find.text('TH 3'), findsWidgets);
      expect(find.text('THÁNG 1'), findsWidgets);
      expect(find.text('TUE'), findsNothing);
      expect(find.text('JAN'), findsNothing);
    });

    testWidgets('keeps English labels in en', (tester) async {
      await _pump(tester, const Locale('en'), _multiDay());

      expect(find.text('TUE'), findsWidgets);
      expect(find.text('JAN'), findsWidgets);
      expect(find.text('TH 3'), findsNothing);
    });
  });

  testWidgets('month view weekday initials follow the app locale', (
    tester,
  ) async {
    await _pump(
      tester,
      const Locale('vi'),
      MonthView(
        selectedDate: _day,
        focusedMonth: _day,
        events: const [],
        onDaySelected: (_) {},
      ),
    );

    // Sunday-first: Intl vi abbreviates Sunday as "CN", so the initial is "C".
    expect(find.text('C'), findsWidgets);
    expect(find.text('S'), findsNothing);
  });

  testWidgets('year view month title follows the app locale', (tester) async {
    await _pump(
      tester,
      const Locale('vi'),
      YearView(
        selectedDate: _day,
        focusedMonth: _day,
        events: const [],
        firstDayOfWeek: 0,
        onDaySelected: (_) {},
        onYearChanged: (_) {},
      ),
    );

    expect(find.text('Tháng 1'), findsOneWidget);
    expect(find.text('January'), findsNothing);
  });

  testWidgets('agenda date header uses localized today text', (tester) async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    CalendarEvent eventOn(String id, DateTime day) => CalendarEvent(
      id: id,
      title: 'Event $id',
      startAt: day.add(const Duration(hours: 12)),
      endAt: day.add(const Duration(hours: 13)),
    );
    await _pump(
      tester,
      const Locale('vi'),
      AgendaView(
        selectedDate: today,
        events: [
          eventOn('today', today),
          eventOn('tomorrow', DateTime(now.year, now.month, now.day + 1)),
        ],
        onEventTap: (_) {},
        onDaySelected: (_) {},
      ),
    );

    expect(find.text('Hôm nay'), findsOneWidget);
    expect(find.text('Ngày mai'), findsOneWidget);
    expect(find.text('Today'), findsNothing);
    expect(find.text('Tomorrow'), findsNothing);
  });
}
