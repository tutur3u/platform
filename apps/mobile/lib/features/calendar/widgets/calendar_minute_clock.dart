import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';

/// One clock refreshes all visible calendar surfaces at minute boundaries.
class CalendarMinuteClock extends StatefulWidget {
  const CalendarMinuteClock({required this.child, this.clock, super.key});
  final Widget child;
  final DateTime Function()? clock;
  @override
  State<CalendarMinuteClock> createState() => _CalendarMinuteClockState();
}

class _CalendarMinuteClockState extends State<CalendarMinuteClock> {
  late Timer _timer;
  @override
  void initState() {
    super.initState();
    _schedule();
  }

  DateTime _now() => widget.clock?.call() ?? DateTime.now();

  void _schedule() {
    final now = _now();
    final elapsed = Duration(
      seconds: now.second,
      milliseconds: now.millisecond,
      microseconds: now.microsecond,
    );
    _timer = Timer(const Duration(minutes: 1) - elapsed, () {
      if (!mounted) return;
      setState(() {});
      _schedule();
    });
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
      now: calendarWallDate(
        _now(),
        settings?.resolved == true ? settings!.effective : null,
      ),
      child: widget.child,
    );
  }
}
