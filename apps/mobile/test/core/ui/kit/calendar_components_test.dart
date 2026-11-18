import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/kit/app_event_block.dart';
import 'package:mobile/core/ui/kit/app_mini_calendar.dart';
import 'package:mobile/features/calendar/utils/event_tone.dart';
import 'package:mobile/features/calendar/widgets/event_detail_sheet.dart';

import '../../../features/calendar/day_agenda/calendar_day_scenes.dart';
import '../../../helpers/pump_app.dart';

void main() {
  testWidgets('event card opens and scales duration', (tester) async {
    var taps = 0;
    await tester.pumpWidget(
      sorbetTestApp(
        home: Scaffold(
          body: Center(
            child: AppEventBlock(
              title: 'Review',
              timeLabel: '11:00',
              minutes: 90,
              width: 164,
              onTap: () => taps++,
            ),
          ),
        ),
      ),
    );
    expect(tester.getSize(find.byType(AppEventBlock)).height, 70);
    await tester.tap(find.text('Review'));
    expect(taps, 1);
    expect(tester.takeException(), isNull);
  });
  testWidgets('mini month selects date and swipes month', (tester) async {
    DateTime? selected;
    DateTime? month;
    await tester.pumpWidget(
      sorbetTestApp(
        home: Scaffold(
          body: AppMiniCalendar(
            month: day,
            selected: day,
            today: day,
            onSelect: (value) => selected = value,
            onPageChanged: (value) => month = value,
          ),
        ),
      ),
    );
    await tester.tap(find.text('17'));
    expect(selected, DateTime.utc(2026, 11, 17));
    await tester.fling(
      find.byType(AppMiniCalendar),
      const Offset(-250, 0),
      1000,
    );
    expect(month, DateTime.utc(2026, 12));
    expect(tester.takeException(), isNull);
  });
  testWidgets('read only detail retains content and hides edit/delete', (
    tester,
  ) async {
    await tester.pumpWidget(
      sorbetTestApp(
        home: Scaffold(
          body: EventDetailContent(event: events.first, readOnly: true),
        ),
      ),
    );
    expect(find.text('Design review'), findsOneWidget);
    expect(find.byIcon(Icons.edit_outlined), findsNothing);
    expect(find.byIcon(Icons.delete_outline), findsNothing);
    expect(tester.takeException(), isNull);
  });
  test('provider tones map to semantic hues', () {
    expect(eventTone(events.first.copyWith(color: '#808080')), 'gray');
    expect(eventTone(events.first.copyWith(color: 'INDIGO')), 'purple');
    expect(eventTone(events.first.copyWith(color: '#ff0000')), 'red');
  });
}
