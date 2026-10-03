import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';

/// One clock refreshes all visible calendar surfaces at minute boundaries.
class CalendarMinuteClock extends StatefulWidget {
  const CalendarMinuteClock({required this.child, super.key});
  final Widget child;
  @override
  State<CalendarMinuteClock> createState() => _CalendarMinuteClockState();
}

class _CalendarMinuteClockState extends State<CalendarMinuteClock> {
  late final Timer _timer;
  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<TimezoneSettingsCubit?>()?.state;
    return CalendarWallClock(
      now: calendarNow(settings?.resolved == true ? settings!.effective : null),
      child: widget.child,
    );
  }
}
