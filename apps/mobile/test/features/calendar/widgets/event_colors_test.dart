import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/utils/event_colors.dart';
import 'package:mobile/features/calendar/utils/event_layout.dart';
import 'package:mobile/features/calendar/widgets/all_day_event_bar.dart';
import 'package:mobile/features/calendar/widgets/event_card.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';

import '../../../helpers/helpers.dart';

CalendarEvent event({bool inherited = false, Object? background = '#00ff88'}) =>
    CalendarEvent(
      id: 'rgb',
      title: 'Provider RGB',
      color: 'PINK',
      sourceColor: '#ff80ab',
      startAt: DateTime(2030),
      endAt: DateTime(2030, 1, 1, 1),
      schedulingMetadata: {
        'google_color': {
          'version': 1,
          'inherited': inherited,
          'background': background,
        },
      },
    );

void main() {
  for (final brightness in Brightness.values) {
    testWidgets('multi-day timed and all-day accents contrast in $brightness', (
      tester,
    ) async {
      final timed = event().copyWith(
        title: 'Timed RGB',
        startAt: DateTime.utc(2030, 1, 1, 9),
        endAt: DateTime.utc(2030, 1, 1, 10),
      );
      final allDay = event().copyWith(
        id: 'all-day',
        title: 'All-day RGB',
        isAllDayOverride: true,
        startAt: DateTime.utc(2030),
        endAt: DateTime.utc(2030, 1, 2),
      );
      await tester.pumpApp(
        Theme(
          data: ThemeData(brightness: brightness),
          child: CalendarWallClock(
            now: DateTime.utc(2029),
            child: MultiDayScheduleView(
              selectedDate: DateTime(2030),
              events: [timed, allDay],
              onEventTap: (_) {},
              onCreateAtTime: (_) {},
              onDaySelected: (_) {},
              onSwipe: (_) {},
              visibleDayCount: 3,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Timed RGB'), findsOneWidget);
      expect(find.text('All-day RGB'), findsOneWidget);
      final palette = EventColors.inContext(
        timed,
        tester.element(find.text('Timed RGB')),
      );
      final boxes = tester
          .widgetList<Container>(find.byType(Container))
          .map((widget) => widget.decoration)
          .whereType<BoxDecoration>()
          .where((decoration) => decoration.color == palette.background)
          .toList();
      expect(boxes.length, 2);
      for (final decoration in boxes) {
        expect(decoration.color!.a, 1);
        final border = decoration.border! as Border;
        expect(border.left.color, palette.accent);
        expect(border.left.color.a, 1);
      }
      expect(tester.takeException(), isNull);
    });
  }

  test('legacy named colors retain their original identity', () {
    expect(EventColors.fromString('CYAN'), Colors.cyan);
    expect(
      EventColors.forEvent(const CalendarEvent(id: 'native', color: 'PINK')),
      Colors.pink,
    );
  });

  test('provider RGB and current source inheritance stay distinct', () {
    expect(EventColors.forEvent(event()), const Color(0xff00ff88));
    expect(
      EventColors.forEvent(event(inherited: true)),
      const Color(0xffff80ab),
    );
    expect(EventColors.forEvent(event(background: null)), Colors.pink);
    expect(EventColors.forEvent(event(background: '#00ff8880')), Colors.pink);
    expect(EventColors.foreground(event()), Colors.black);
    expect(
      EventColors.foreground(
        const CalendarEvent(id: 'dark', color: 'DEEP_PURPLE'),
      ),
      Colors.white,
    );
    final parsed = CalendarEvent.fromJson(event().toJson());
    expect(parsed.sourceColor, '#ff80ab');
    expect(parsed.copyWith(title: 'changed').sourceColor, '#ff80ab');
  });

  for (final brightness in Brightness.values) {
    testWidgets('timed and all-day fills are opaque in $brightness', (
      tester,
    ) async {
      final value = event();
      await tester.pumpApp(
        Theme(
          data: ThemeData(brightness: brightness),
          child: Column(
            children: [
              SizedBox(
                height: 100,
                child: Stack(
                  children: [
                    EventCard(
                      layoutInfo: EventLayoutInfo(
                        event: value,
                        column: 0,
                        totalColumns: 1,
                      ),
                      hourHeight: 60,
                      timelineLeft: 0,
                      timelineWidth: 300,
                      onTap: () {},
                    ),
                  ],
                ),
              ),
              AllDayEventBar(events: [value], onEventTap: (_) {}),
            ],
          ),
        ),
      );
      final palette = EventColors.inContext(
        value,
        tester.element(find.text('Provider RGB').first),
      );
      final boxes = tester
          .widgetList<Container>(find.byType(Container))
          .map((widget) => widget.decoration)
          .whereType<BoxDecoration>()
          .where((decoration) => decoration.color == palette.background);
      expect(boxes.length, greaterThanOrEqualTo(2));
      for (final decoration in boxes) {
        expect(decoration.color!.a, 1);
        if (decoration.border is Border) {
          final border = decoration.border! as Border;
          expect(border.left.color, palette.accent);
        }
      }
      final title = tester.widgetList<Text>(find.text('Provider RGB'));
      expect(
        title.every((widget) => widget.style?.color == palette.foreground),
        isTrue,
      );
      expect(tester.takeException(), isNull);
    });
  }
}
