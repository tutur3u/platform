import 'dart:async';

import 'package:flutter/material.dart';

/// A red horizontal line positioned at the current time on the day timeline.
///
/// Only visible when viewing today. Updates every minute.
class CurrentTimeIndicator extends StatefulWidget {
  const CurrentTimeIndicator({required this.hourHeight, super.key});

  /// Height in pixels per hour (used to calculate vertical offset).
  final double hourHeight;

  @override
  State<CurrentTimeIndicator> createState() => _CurrentTimeIndicatorState();
}

class _CurrentTimeIndicatorState extends State<CurrentTimeIndicator> {
  late Timer _timer;
  TimeOfDay _time = TimeOfDay.now();

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) {
      setState(() => _time = TimeOfDay.now());
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final minutes = _time.hour * 60 + _time.minute;
    final top = (minutes / 60) * widget.hourHeight;

    return Positioned(
      top: top,
      left: 0,
      right: 0,
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.red,
            ),
          ),
          Expanded(
            child: Container(height: 1.5, color: Colors.red),
          ),
        ],
      ),
    );
  }
}
