import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/app_event_block.dart';
import 'package:mobile/core/ui/kit/app_mini_calendar.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/widgets/calendar_day_panel.dart';
import 'package:mobile/features/calendar/widgets/calendar_mini_month.dart';
import 'package:mobile/features/calendar/widgets/event_detail_sheet.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';

final day = DateTime.utc(2026, 11, 16);
final events = [
  CalendarEvent(
    id: 'one',
    title: 'Design review',
    color: 'BLUE',
    startAt: day.add(const Duration(hours: 11)),
    endAt: day.add(const Duration(hours: 12, minutes: 30)),
    description: 'Review the calendar experience and next steps.',
  ),
  CalendarEvent(
    id: 'two',
    title: 'Planning',
    color: 'PURPLE',
    startAt: day.add(const Duration(hours: 13)),
    endAt: day.add(const Duration(hours: 14, minutes: 30)),
  ),
];

Widget calendarScene(String scene) => scene == 'detail'
    ? const _DetailScene()
    : Scaffold(
        body: SafeArea(
          child: CalendarWallClock(
            now: day.add(const Duration(hours: 10, minutes: 15)),
            child: switch (scene) {
              'detail' => EventDetailContent(event: events.first),
              'block' => Center(
                child: AppEventBlock(
                  title: 'Design review',
                  timeLabel: '11:00 – 12:30',
                  width: 164,
                  minutes: 90,
                  onTap: () {},
                ),
              ),
              'mini' => Padding(
                padding: const EdgeInsets.all(16),
                child: AppMiniCalendar(
                  month: day,
                  selected: day,
                  today: day,
                  onSelect: (_) {},
                  onMonthChanged: (_) {},
                ),
              ),
              _ => Column(
                children: [
                  CalendarMiniMonth(
                    selectedDate: day,
                    focusedMonth: day,
                    events: events,
                    onDateSelected: (_) {},
                    onMonthChanged: (_) {},
                  ),
                  Expanded(
                    child: CalendarDayPanel(
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
                  ),
                ],
              ),
            },
          ),
        ),
      );

class _DetailScene extends StatefulWidget {
  const _DetailScene();
  @override
  State<_DetailScene> createState() => _DetailSceneState();
}

class _DetailSceneState extends State<_DetailScene> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        unawaited(showEventDetailSheet(context, event: events.first));
      }
    });
  }

  @override
  Widget build(BuildContext context) => calendarScene('day');
}
