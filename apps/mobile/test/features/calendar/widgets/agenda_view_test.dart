import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/widgets/agenda_view.dart';

import '../../../helpers/helpers.dart';

void main() {
  if (Platform.environment['CALENDAR_NATIVE_TZ_REGRESSION'] == '1') {
    test('native timezone regression job actually runs at UTC plus seven', () {
      expect(DateTime(2030).timeZoneOffset, const Duration(hours: 7));
    });
  }

  testWidgets('selected UTC agenda ignores a different native device zone', (
    tester,
  ) async {
    final event = calendarProjectEvent(
      CalendarEvent.fromJson(const {
        'id': 'utc',
        'title': 'Synthetic UTC appointment',
        'start_at': '2030-01-01T13:00:00+07:00',
        'end_at': '2030-01-01T06:30:00Z',
      }),
      'UTC',
    );
    await tester.pumpApp(
      Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(context).copyWith(alwaysUse24HourFormat: true),
          child: AgendaView(
            selectedDate: calendarDate(2030),
            events: [event],
            onEventTap: (_) {},
            onDaySelected: (_) {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('06:00 – 06:30'), findsOneWidget);
  });

  testWidgets(
    'projected agenda wall time is not converted into device zone again',
    (tester) async {
      final instant = CalendarEvent.fromJson(const {
        'id': 'offset',
        'title': 'Synthetic appointment',
        'start_at': '2030-01-01T13:00:00+07:00',
        'end_at': '2030-01-01T13:30:00+07:00',
      });
      final projected = calendarProjectEvent(instant, 'Asia/Ho_Chi_Minh');
      await tester.pumpApp(
        Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(context).copyWith(alwaysUse24HourFormat: true),
            child: AgendaView(
              selectedDate: calendarDate(2030),
              events: [projected],
              onEventTap: (_) {},
              onDaySelected: (_) {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('13:00 – 13:30'), findsOneWidget);
      expect(find.text('20:00 – 20:30'), findsNothing);
    },
  );

  for (final crossesMidnight in [false, true]) {
    testWidgets(
      'past titles retain contrast across ${crossesMidnight ? 2 : 1} dates',
      (tester) async {
        final now = DateTime.now();
        final start = DateTime(
          now.year,
          now.month,
          now.day - 2,
          crossesMidnight ? 23 : 12,
          crossesMidnight ? 30 : 0,
        );
        await tester.pumpApp(
          AgendaView(
            selectedDate: start,
            events: [
              CalendarEvent(
                id: 'past',
                title: 'Past timed',
                startAt: start,
                endAt: start.add(const Duration(hours: 1)),
                color: 'PINK',
                schedulingMetadata: const {
                  'google_color': {
                    'version': 1,
                    'inherited': false,
                    'background': '#00ff88',
                  },
                },
              ),
            ],
            onEventTap: (_) {},
            onDaySelected: (_) {},
          ),
        );
        await tester.pumpAndSettle();
        final titles = find.text('Past timed');
        expect(titles, findsNWidgets(crossesMidnight ? 2 : 1));
        for (final element in titles.evaluate()) {
          final title = element.widget as Text;
          expect(title.style?.decoration, TextDecoration.lineThrough);
          expect(title.style?.color, Colors.black);
          final card = tester.widget<Material>(
            find
                .ancestor(
                  of: find.byWidget(title),
                  matching: find.byType(Material),
                )
                .first,
          );
          expect(card.color, isNot(const Color(0xff00ff88)));
          expect(card.color!.computeLuminance(), greaterThan(0.5));
          expect(card.color!.a, 1);
        }
      },
    );
  }

  for (final size in [
    const Size(390, 844),
    const Size(844, 390),
    const Size(768, 1024),
    const Size(1376, 1032),
  ]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('agenda readable and clears dock at $size / $scale', (
        tester,
      ) async {
        tester.view
          ..devicePixelRatio = 1
          ..physicalSize = size;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });
        final date = DateTime(2030, 1, 1, 9);
        final events = List.generate(
          12,
          (i) => CalendarEvent(
            id: '$i',
            title: 'Planning meeting $i',
            description: 'A detailed discussion with the team',
            startAt: date.add(Duration(hours: i)),
            endAt: date.add(Duration(hours: i + 1)),
          ),
        );
        CalendarEvent? tapped;
        await tester.pumpApp(
          Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                padding: const EdgeInsets.only(bottom: 100),
                alwaysUse24HourFormat: true,
                textScaler: TextScaler.linear(scale),
              ),
              child: AgendaView(
                selectedDate: date,
                events: events,
                onEventTap: (event) => tapped = event,
                onDaySelected: (_) {},
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('09:00 – 10:00'), findsOneWidget);
        await tester.tap(find.text('Planning meeting 0'));
        expect(tapped?.id, '0');
        await tester.scrollUntilVisible(find.text('Planning meeting 11'), 500);
        await tester.drag(find.byType(ListView), const Offset(0, -1000));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(
          tester.getBottomLeft(find.text('Planning meeting 11')).dy,
          lessThan(size.height - 100),
        );
      });
    }
  }
}
