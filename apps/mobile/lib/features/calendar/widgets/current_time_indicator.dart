import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/app_event_block.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/l10n/l10n.dart';

/// A red horizontal line positioned at the current time on the day timeline.
///
/// Only visible when viewing today. Updates every minute.
class CurrentTimeIndicator extends StatefulWidget {
  const CurrentTimeIndicator({
    required this.hourHeight,
    this.showLabel = false,
    super.key,
  });

  /// Height in pixels per hour (used to calculate vertical offset).
  final double hourHeight;
  final bool showLabel;

  @override
  State<CurrentTimeIndicator> createState() => _CurrentTimeIndicatorState();
}

class _CurrentTimeIndicatorState extends State<CurrentTimeIndicator> {
  late Timer _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) {
      setState(() {});
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final time = TimeOfDay.fromDateTime(calendarNowInContext(context));
    final minutes = time.hour * 60 + time.minute;
    final top = (minutes / 60) * widget.hourHeight;

    final color = AppEventBlock.hueOf(context, 'red').ink;
    return Positioned(
      top: top,
      left: 0,
      right: 0,
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(shape: BoxShape.circle, color: color),
          ),
          Expanded(child: Container(height: 2, color: color)),
          if (widget.showLabel)
            Text(
              '${context.l10n.calendarS3Now}, '
              '${time.hour.toString().padLeft(2, '0')}:'
              '${time.minute.toString().padLeft(2, '0')}',
              style: AppTokens.of(
                context,
              ).typography.numeric.copyWith(color: color),
            ),
        ],
      ),
    );
  }
}
