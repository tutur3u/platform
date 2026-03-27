import 'dart:async';

import 'package:flutter/material.dart';

class StaggeredEntrance extends StatefulWidget {
  const StaggeredEntrance({
    required this.child,
    this.replayKey,
    this.delay = Duration.zero,
    this.duration = const Duration(milliseconds: 420),
    this.offset = const Offset(0, 0.045),
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
  State<StaggeredEntrance> createState() => _StaggeredEntranceState();
}

class _StaggeredEntranceState extends State<StaggeredEntrance>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: widget.duration,
  );
  late final Animation<double> _opacity = CurvedAnimation(
    parent: _controller,
    curve: widget.curve,
  );
  late final Animation<Offset> _slide =
      Tween<Offset>(
        begin: widget.offset,
        end: Offset.zero,
      ).animate(
        CurvedAnimation(
          parent: _controller,
          curve: widget.curve,
        ),
      );
  Timer? _delayTimer;

  @override
  void initState() {
    super.initState();
    _startAnimation();
  }

  @override
  void didUpdateWidget(covariant StaggeredEntrance oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.replayKey != widget.replayKey) {
      _controller.reset();
      _startAnimation();
    }
  }

  void _startAnimation() {
    _delayTimer?.cancel();
    if (widget.delay == Duration.zero) {
      unawaited(_controller.forward());
      return;
    }
    _delayTimer = Timer(widget.delay, () {
      if (!mounted) {
        return;
      }
      unawaited(_controller.forward());
    });
  }

  @override
  void dispose() {
    _delayTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _opacity,
      child: SlideTransition(
        position: _slide,
        child: widget.child,
      ),
    );
  }
}
