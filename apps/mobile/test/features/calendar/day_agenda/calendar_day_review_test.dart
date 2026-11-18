import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/widgets/calendar_mini_month.dart';
import 'package:mobile/features/calendar/widgets/current_time_indicator.dart';
import 'package:mobile/features/calendar/widgets/event_detail_sheet.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';
import '../../../helpers/pump_app.dart';
import 'calendar_day_scenes.dart';

void main() {
  testWidgets('a short, enlarged month picker opens, scrolls and collapses', (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(700, 360)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(
        sorbetTestApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: const TextScaler.linear(2.5)),
                child: CalendarWallClock(
                  now: day,
                  child: LayoutBuilder(
                    builder: (context, constraints) => Column(
                      children: [
                        ConstrainedBox(
                          constraints: BoxConstraints(
                            maxHeight: constraints.maxHeight * 0.52,
                          ),
                          child: CalendarMiniMonth(
                            selectedDate: day,
                            focusedMonth: day,
                            events: events,
                            onDateSelected: (_) {},
                            onMonthChanged: (_) {},
                          ),
                        ),
                        Expanded(
                          child: MultiDayScheduleView(
                            selectedDate: day,
                            events: events,
                            visibleDayCount: 1,
                            onEventTap: (_) {},
                            onCreateAtTime: (_) {},
                            onDaySelected: (_) {},
                            onSwipe: (_) {},
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('16').hitTestable(), findsOneWidget);
      expect(find.text('29'), findsNothing);
      final dayButton = find.bySemanticsLabel(
        RegExp('Monday, November 16, 2026.*Today.*Has events'),
      );
      expect(
        tester.getSemantics(dayButton),
        isSemantics(isButton: true, isSelected: true, hasTapAction: true),
      );

      await tester.tap(find.byTooltip('Expand month'));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Collapse month'), findsOneWidget);
      expect(find.text('29').hitTestable(), findsNothing);
      final scroll = find.descendant(
        of: find.byType(CalendarMiniMonth),
        matching: find.byType(SingleChildScrollView),
      );
      await tester.drag(scroll, const Offset(0, -280));
      await tester.pumpAndSettle();
      expect(find.text('29').hitTestable(), findsOneWidget);
      await tester.fling(find.text('November 2026'), const Offset(0, -80), 600);
      await tester.pumpAndSettle();
      expect(find.byTooltip('Expand month'), findsOneWidget);
      expect(find.text('29'), findsNothing);
      expect(tester.takeException(), isNull);
    } finally {
      semantics.dispose();
    }
  });

  testWidgets(
    'writable event stays open on cancel and returns delete on confirm',
    (tester) async {
      tester.view
        ..physicalSize = const Size(390, 844)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      var completed = false;
      String? action;
      await tester.pumpWidget(
        sorbetTestApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => unawaited(
                  showEventDetailSheet(context, event: events.first).then((
                    value,
                  ) {
                    completed = true;
                    action = value;
                  }),
                ),
                child: const Text('Show event'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Show event'));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Edit event'), findsOneWidget);
      expect(find.widgetWithText(TextButton, 'Delete event'), findsOneWidget);

      await tester.tap(find.widgetWithText(TextButton, 'Delete event'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(completed, isFalse);
      expect(find.byType(EventDetailContent), findsOneWidget);

      await tester.tap(find.widgetWithText(TextButton, 'Delete event'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();
      expect(completed, isTrue);
      expect(action, 'delete');
      expect(find.byType(EventDetailContent), findsNothing);
    },
  );

  for (final locale in ['en', 'vi']) {
    for (final use24Hours in [false, true]) {
      testWidgets('now line stays at its minute in $locale/$use24Hours', (
        tester,
      ) async {
        final now = day.add(const Duration(hours: 2, minutes: 15));
        const timeline = ValueKey('timeline');
        await tester.pumpWidget(
          sorbetTestApp(
            home: Scaffold(
              body: Builder(
                builder: (context) => Localizations.override(
                  context: context,
                  locale: Locale(locale),
                  child: MediaQuery(
                    data: MediaQuery.of(context).copyWith(
                      alwaysUse24HourFormat: use24Hours,
                      textScaler: const TextScaler.linear(2.5),
                    ),
                    child: CalendarWallClock(
                      now: now,
                      child: const SizedBox(
                        height: 300,
                        width: 320,
                        child: Stack(
                          key: timeline,
                          children: [
                            CurrentTimeIndicator(
                              hourHeight: 48,
                              showLabel: true,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );

        await tester.pumpAndSettle();
        final track = find.descendant(
          of: find.byType(CurrentTimeIndicator),
          matching: find.byType(Row),
        );
        final expectedY = tester.getTopLeft(find.byKey(timeline)).dy + 108;
        expect(tester.getCenter(track).dy, closeTo(expectedY, 0.01));
        final format = use24Hours
            ? DateFormat.Hm(locale)
            : DateFormat.jm(locale);
        final label = locale == 'vi' ? 'Bây giờ' : 'Now';
        expect(find.text('$label, ${format.format(now)}'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }

  testWidgets('day header counts visible all-day and open-ended timed events', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(
        sorbetTestApp(
          home: Scaffold(
            body: MultiDayScheduleView(
              selectedDate: day,
              events: [
                CalendarEvent(
                  id: 'all-day',
                  title: 'Out of office',
                  startAt: day,
                  isAllDayOverride: true,
                ),
                CalendarEvent(
                  id: 'timed',
                  title: 'Check-in',
                  startAt: day.add(const Duration(hours: 13, minutes: 15)),
                ),
                CalendarEvent(
                  id: 'yesterday',
                  title: 'Travel',
                  startAt: day.subtract(const Duration(days: 1)),
                  endAt: day,
                  isAllDayOverride: true,
                ),
              ],
              visibleDayCount: 1,
              onEventTap: (_) {},
              onCreateAtTime: (_) {},
              onDaySelected: (_) {},
              onSwipe: (_) {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('2 events').hitTestable(), findsOneWidget);
      expect(find.text('Out of office').hitTestable(), findsOneWidget);
      expect(find.text('Travel').hitTestable(), findsNothing);
      expect(
        tester.getSemantics(find.text('Monday 16').hitTestable()),
        isSemantics(isHeader: true),
      );
      final time = DateFormat.jm(
        'en',
      ).format(day.add(const Duration(hours: 13, minutes: 15)));
      expect(find.bySemanticsLabel('Check-in, $time'), findsOneWidget);
    } finally {
      semantics.dispose();
    }
  });
}
