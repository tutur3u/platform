import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

/// Formats an elapsed call duration as `mm:ss`, or `h:mm:ss` from one hour.
String formatAssistantLiveCallDuration(Duration elapsed) {
  final safe = elapsed.isNegative ? Duration.zero : elapsed;
  final hours = safe.inHours;
  final minutes = safe.inMinutes.remainder(60).toString().padLeft(2, '0');
  final seconds = safe.inSeconds.remainder(60).toString().padLeft(2, '0');
  return hours > 0 ? '$hours:$minutes:$seconds' : '$minutes:$seconds';
}

/// Elapsed time since [startedAt]. Only this text rebuilds each second, so the
/// call surface around it stays static between voice-level updates.
class AssistantLiveCallTimer extends StatefulWidget {
  const AssistantLiveCallTimer({
    required this.startedAt,
    this.style,
    this.clock = DateTime.now,
    super.key,
  });

  final DateTime startedAt;
  final TextStyle? style;
  final DateTime Function() clock;

  @override
  State<AssistantLiveCallTimer> createState() => _AssistantLiveCallTimerState();
}

class _AssistantLiveCallTimerState extends State<AssistantLiveCallTimer> {
  Timer? _timer;

  Duration get _elapsed => widget.clock().difference(widget.startedAt);

  @override
  void initState() {
    super.initState();
    _schedule();
  }

  @override
  void didUpdateWidget(AssistantLiveCallTimer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.startedAt != widget.startedAt) _schedule();
  }

  // Align ticks to whole elapsed seconds so the display never skips a value.
  void _schedule() {
    _timer?.cancel();
    final remainder = 1000 - _elapsed.inMilliseconds.remainder(1000);
    _timer = Timer(Duration(milliseconds: remainder.clamp(1, 1000)), () {
      if (!mounted) return;
      setState(() {});
      _schedule();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final text = formatAssistantLiveCallDuration(_elapsed);
    return Semantics(
      label: context.l10n.assistantLiveCallDuration,
      value: text,
      child: ExcludeSemantics(
        child: Text(
          text,
          key: const ValueKey('assistant-live-call-timer'),
          style: (widget.style ?? DefaultTextStyle.of(context).style).copyWith(
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ),
    );
  }
}
