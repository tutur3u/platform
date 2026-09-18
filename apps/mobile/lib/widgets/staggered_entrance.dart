import 'package:flutter/widgets.dart';

/// Retains the call-site API without delaying or replaying page content.
/// Route transitions already provide motion; data should be visible at once.
class StaggeredEntrance extends StatelessWidget {
  const StaggeredEntrance({
    required this.child,
    this.replayKey,
    this.delay = Duration.zero,
    this.duration = const Duration(milliseconds: 180),
    this.offset = Offset.zero,
    this.curve = Curves.easeOutCubic,
    super.key,
  });
  final Widget child;
  final Object? replayKey;
  final Duration delay;
  final Duration duration;
  final Offset offset;
  final Curve curve;

  @override
  Widget build(BuildContext context) => child;
}
