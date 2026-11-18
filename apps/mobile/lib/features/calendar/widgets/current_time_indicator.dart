import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/app_event_block.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/utils/calendar_time_format.dart';
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
    final now = calendarNowInContext(context);
    final minutes = now.hour * 60 + now.minute;
    final lineY = (minutes / 60) * widget.hourHeight;
    const dotSize = 10.0;
    final color = AppEventBlock.hueOf(context, 'red').ink;
    final tokens = AppTokens.of(context);

    return Positioned(
      top: lineY - dotSize / 2,
      left: 0,
      right: 0,
      child: IgnorePointer(
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            SizedBox(
              height: dotSize,
              child: Row(
                children: [
                  Container(
                    width: dotSize,
                    height: dotSize,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: color,
                    ),
                  ),
                  Expanded(child: Container(height: 2, color: color)),
                ],
              ),
            ),
            if (widget.showLabel)
              Positioned(
                top: dotSize / 2,
                left: dotSize,
                right: 0,
                child: FractionalTranslation(
                  translation: const Offset(0, -0.5),
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: ColoredBox(
                      color: tokens.colorScheme.background,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Text(
                          '${context.l10n.calendarNowLabel}, '
                          '${calendarTimeFormat(context).format(now)}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: tokens.typography.numeric.copyWith(
                            color: color,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
