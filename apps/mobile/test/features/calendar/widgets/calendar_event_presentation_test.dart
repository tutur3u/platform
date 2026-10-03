import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/utils/event_colors.dart';
import 'package:mobile/features/calendar/widgets/agenda_view.dart';
import 'package:mobile/features/calendar/widgets/day_schedule_view.dart';
import 'package:mobile/features/calendar/widgets/month_view.dart';
import 'package:mobile/features/calendar/widgets/week_view.dart';

import '../../../helpers/helpers.dart';

final DateTime now = calendarDate(2030, 1, 1, 12);
CalendarEvent appointment(String id, int hour, String color) => CalendarEvent(
  id: id,
  title: id,
  startAt: calendarDate(2030, 1, 1, hour),
  endAt: calendarDate(2030, 1, 1, hour + 1),
  color: color,
);
final CalendarEvent past = appointment('Completed appointment', 10, 'BLUE');
final CalendarEvent upcoming = appointment('Upcoming appointment', 13, 'BLUE');
double contrast(Color a, Color b) =>
    (math.max(a.computeLuminance(), b.computeLuminance()) + 0.05) /
    (math.min(a.computeLuminance(), b.computeLuminance()) + 0.05);

void main() {
  test(
    'missing timed end stays active through the rendered thirty minutes',
    () {
      final value = CalendarEvent(id: 'no-end', startAt: now);
      final scheme = ColorScheme.fromSeed(seedColor: Colors.blue);
      expect(
        EventColors.presentation(
          value,
          scheme,
          now: now.add(const Duration(minutes: 29)),
        ).isPast,
        false,
      );
      expect(
        EventColors.presentation(
          value,
          scheme,
          now: now.add(const Duration(minutes: 30)),
        ).isPast,
        true,
      );
    },
  );

  for (final brightness in Brightness.values) {
    test(
      'theme $brightness retains hue and full text contrast at end boundary',
      () {
        final scheme = ColorScheme.fromSeed(
          seedColor: Colors.blue,
          brightness: brightness,
        );
        for (final name in EventColors.allColors) {
          final value = upcoming.copyWith(color: name);
          final active = EventColors.presentation(value, scheme, now: now);
          final complete = EventColors.presentation(
            value,
            scheme,
            now: value.endAt!,
          );
          expect(active.isPast, false);
          expect(complete.isPast, true);
          expect(
            contrast(active.background, active.foreground),
            greaterThanOrEqualTo(4.5),
          );
          expect(
            contrast(complete.background, complete.foreground),
            greaterThanOrEqualTo(4.5),
          );
          expect(active.background, isNot(complete.background));
          expect(EventColors.forEvent(value), EventColors.fromString(name));
        }
        final allDay = CalendarEvent(
          id: 'day',
          startAt: calendarDate(2030),
          endAt: calendarDate(2030, 1, 2),
          isAllDayOverride: true,
        );
        expect(
          EventColors.presentation(
            allDay,
            scheme,
            now: calendarDate(2030, 1, 1, 23, 59),
          ).isPast,
          false,
        );
        expect(
          EventColors.presentation(
            allDay,
            scheme,
            now: calendarDate(2030, 1, 2),
          ).isPast,
          true,
        );
      },
    );

    for (final mode in ['agenda', 'day', 'week', 'month']) {
      testWidgets('$mode $brightness uses consistent past-end fill/accent', (
        tester,
      ) async {
        tester.view
          ..devicePixelRatio = 1
          ..physicalSize = const Size(1200, 900);
        addTearDown(() {
          tester.view.resetDevicePixelRatio();
          tester.view.resetPhysicalSize();
        });
        final theme = ThemeData(brightness: brightness);
        final events = [past, upcoming];
        final view = switch (mode) {
          'agenda' => AgendaView(
            selectedDate: now,
            events: events,
            onEventTap: (_) {},
            onDaySelected: (_) {},
          ),
          'day' => DayScheduleView(
            selectedDate: now,
            allDayEvents: const [],
            timedEvents: events,
            onEventTap: (_) {},
            onCreateAtTime: (_) {},
            onSwipe: (_) {},
          ),
          'week' => WeekView(
            selectedDate: now,
            events: events,
            onEventTap: (_) {},
            onCreateAtTime: (_) {},
            onDaySelected: (_) {},
            onSwipe: (_) {},
          ),
          _ => MonthView(
            selectedDate: now,
            focusedMonth: now,
            events: events,
            onDaySelected: (_) {},
          ),
        };
        await tester.pumpApp(
          Theme(
            data: theme,
            child: CalendarWallClock(now: now, child: view),
          ),
        );
        await tester.pumpAndSettle();
        final pastStyle = EventColors.presentation(
          past,
          theme.colorScheme,
          now: now,
        );
        final nextStyle = EventColors.presentation(
          upcoming,
          theme.colorScheme,
          now: now,
        );
        final colors = tester
            .widgetList<Container>(find.byType(Container))
            .map((widget) => widget.decoration)
            .whereType<BoxDecoration>()
            .map((decoration) => decoration.color)
            .toList();
        if (mode == 'agenda') {
          final materials = tester
              .widgetList<Material>(find.byType(Material))
              .map((m) => m.color);
          expect(
            materials,
            containsAll([pastStyle.background, nextStyle.background]),
          );
        } else {
          expect(
            colors,
            containsAll(
              mode == 'month'
                  ? [pastStyle.accent, nextStyle.accent]
                  : [pastStyle.background, nextStyle.background],
            ),
          );
        }
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('render synthetic Calendar $brightness for visual inspection', (
      tester,
    ) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(1200, 900);
      addTearDown(() {
        tester.view.resetDevicePixelRatio();
        tester.view.resetPhysicalSize();
      });
      final fonts = FontLoader('NotoSans')
        ..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'));
      await fonts.load();
      final key = GlobalKey();
      final events = [
        past,
        upcoming,
        appointment('Planning session', 15, 'PURPLE'),
        appointment('Review session', 16, 'GREEN'),
      ];
      await tester.pumpApp(
        Theme(
          data: ThemeData(brightness: brightness, fontFamily: 'NotoSans'),
          child: CalendarWallClock(
            now: now,
            child: RepaintBoundary(
              key: key,
              child: Scaffold(
                body: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        'Calendar · ${brightness.name} · '
                        'completed events use quieter fills',
                        style: const TextStyle(fontSize: 20),
                      ),
                    ),
                    Expanded(
                      child: Row(
                        children: [
                          Expanded(
                            child: MediaQuery(
                              data: const MediaQueryData(
                                size: Size(400, 900),
                                alwaysUse24HourFormat: true,
                              ),
                              child: AgendaView(
                                selectedDate: now,
                                events: events,
                                onEventTap: (_) {},
                                onDaySelected: (_) {},
                              ),
                            ),
                          ),
                          Expanded(
                            flex: 2,
                            child: DayScheduleView(
                              selectedDate: now,
                              allDayEvents: const [],
                              timedEvents: events,
                              onEventTap: (_) {},
                              onCreateAtTime: (_) {},
                              onSwipe: (_) {},
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final boundary =
          key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      await tester.runAsync(() async {
        final image = await boundary.toImage();
        try {
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          expect(bytes, isNotNull);
          final output = Platform.environment['CALENDAR_RENDER_ARTIFACT_DIR'];
          if (output != null) {
            await File(
              '$output/mobile-calendar-${brightness.name}.png',
            ).writeAsBytes(bytes!.buffer.asUint8List());
          }
        } finally {
          image.dispose();
        }
      });
      expect(tester.takeException(), isNull);
    });
  }
}
