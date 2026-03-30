import 'dart:async';

import 'package:flutter/material.dart';

class StaggeredEntry extends StatefulWidget {
  const StaggeredEntry({
    required this.index,
    required this.child,
    this.stepDelay = const Duration(milliseconds: 42),
    this.duration = const Duration(milliseconds: 420),
    this.initialOffset = const Offset(0, 0.022),
    this.playOnceKey,
    super.key,
  });

  final int index;
  final Duration stepDelay;
  final Duration duration;
  final Offset initialOffset;
  final String? playOnceKey;
  final Widget child;

  @override
  State<StaggeredEntry> createState() => _StaggeredEntryState();
}

class _StaggeredEntryState extends State<StaggeredEntry> {
  static final Set<String> _playedKeys = <String>{};

  Timer? _timer;
  bool _isVisible = false;

  @override
  void initState() {
    super.initState();
    final playOnceKey = widget.playOnceKey;
    if (playOnceKey != null && _playedKeys.contains(playOnceKey)) {
      _isVisible = true;
      return;
    }
    _scheduleReveal();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _scheduleReveal() {
    final delayMs = widget.stepDelay.inMilliseconds * widget.index;
    _timer = Timer(Duration(milliseconds: delayMs), () {
      if (!mounted) {
        return;
      }
      setState(() => _isVisible = true);
      final playOnceKey = widget.playOnceKey;
      if (playOnceKey != null) {
        _playedKeys.add(playOnceKey);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSlide(
      duration: widget.duration,
      curve: Curves.easeOutQuart,
      offset: _isVisible ? Offset.zero : widget.initialOffset,
      child: AnimatedOpacity(
        duration: widget.duration,
        curve: Curves.easeOutQuart,
        opacity: _isVisible ? 1 : 0,
        child: widget.child,
      ),
    );
  }
}
