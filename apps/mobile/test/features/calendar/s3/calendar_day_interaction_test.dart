import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';
import '../../../helpers/pump_app.dart';

void main() {
  testWidgets('day opens events and creates only in empty slots', (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(390, 844)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final day = DateTime.utc(2030, 1, 15);
    final event = CalendarEvent(
      id: 'event',
      title: 'Review',
      startAt: day.add(const Duration(hours: 10)),
      endAt: day.add(const Duration(hours: 11, minutes: 30)),
    );
    CalendarEvent? opened;
    DateTime? created;
    await tester.pumpWidget(
      sorbetTestApp(
        home: Scaffold(
          body: MultiDayScheduleView(
            selectedDate: day,
            events: [event],
            visibleDayCount: 1,
            onEventTap: (value) => opened = value,
            onCreateAtTime: (value) => created = value,
            onDaySelected: (_) {},
            onSwipe: (_) {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final card = find.text('Review').hitTestable();
    await tester.tap(card);
    expect(opened, event);
    await tester.longPress(card);
    expect(created, isNull);
    await tester.longPressAt(const Offset(300, 350));
    expect(created, isNotNull);
    expect(created!.year, 2030);
    expect(created!.day, 15);
    expect(created!.minute % 15, 0);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
