import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:mobile/l10n/l10n.dart';

/// Rebuilds [builder] every [period] with the current UTC time, so
/// countdowns and snoozes move between polls. [now] is the test clock.
class FleetClock extends StatefulWidget {
  const FleetClock({
    required this.builder,
    this.period = const Duration(seconds: 1),
    this.now,
    super.key,
  });

  final Widget Function(BuildContext context, DateTime now) builder;
  final Duration period;
  final DateTime Function()? now;

  @override
  State<FleetClock> createState() => _FleetClockState();
}

class _FleetClockState extends State<FleetClock> {
  late final Timer _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(
      widget.period,
      (_) => mounted ? setState(() {}) : null,
    );
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      widget.builder(context, (widget.now ?? DateTime.now)().toUtc());
}

/// "12:05" under an hour, "2 h 5 min" beyond it.
String fleetCountdown(AppLocalizations l10n, Duration left) {
  if (left.inHours >= 1) {
    return l10n.mastermindFleetCountdownHours(
      left.inHours,
      left.inMinutes.remainder(60),
    );
  }
  final minutes = left.inMinutes.toString().padLeft(2, '0');
  final seconds = left.inSeconds.remainder(60).toString().padLeft(2, '0');
  return '$minutes:$seconds';
}
