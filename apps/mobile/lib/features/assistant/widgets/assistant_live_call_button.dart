import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';

enum AssistantLiveCallButtonTone { neutral, end }

/// Large circular call control with its label underneath, like a phone call.
///
/// [toggled] reports on/off state to assistive technology and fills the
/// circle; the end tone uses the theme's error colour with a contrast-safe
/// glyph. Re-entrant taps are ignored until [onPressed] settles.
class AssistantLiveCallButton extends StatefulWidget {
  const AssistantLiveCallButton({
    required this.icon,
    required this.label,
    required this.onPressed,
    this.toggled,
    this.tone = AssistantLiveCallButtonTone.neutral,
    this.diameter = 64,
    super.key,
  });

  final IconData icon;
  final String label;
  final Future<void> Function()? onPressed;
  final bool? toggled;
  final AssistantLiveCallButtonTone tone;
  final double diameter;

  @override
  State<AssistantLiveCallButton> createState() =>
      _AssistantLiveCallButtonState();
}

class _AssistantLiveCallButtonState extends State<AssistantLiveCallButton> {
  bool _running = false;

  Future<void> _invoke() async {
    final onPressed = widget.onPressed;
    if (_running || onPressed == null) return;
    setState(() => _running = true);
    try {
      await onPressed();
    } finally {
      if (mounted) setState(() => _running = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final enabled = widget.onPressed != null && !_running;
    final (fill, glyph) = switch (widget.tone) {
      AssistantLiveCallButtonTone.end => (
        colors.error,
        AppearanceTheme.labelOn(colors.error),
      ),
      _ when widget.toggled ?? false => (colors.onSurface, colors.surface),
      _ => (colors.onSurface.withValues(alpha: .1), colors.onSurface),
    };
    return Semantics(
      button: true,
      enabled: enabled,
      toggled: widget.toggled,
      label: widget.label,
      excludeSemantics: true,
      child: Opacity(
        opacity: enabled ? 1 : .5,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Material(
              color: fill,
              shape: const CircleBorder(),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: enabled ? () => unawaited(_invoke()) : null,
                child: SizedBox.square(
                  dimension: widget.diameter,
                  child: Icon(
                    widget.icon,
                    color: glyph,
                    size: widget.diameter * .4,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            _CallButtonLabel(
              text: widget.label,
              width: widget.diameter + 24,
              style: Theme.of(
                context,
              ).textTheme.labelMedium?.copyWith(color: colors.onSurface),
            ),
          ],
        ),
      ),
    );
  }
}

/// Wraps only between words: when the longest word would not fit [width] at
/// the current text scale, the label scales down instead of splitting it.
class _CallButtonLabel extends StatelessWidget {
  const _CallButtonLabel({
    required this.text,
    required this.width,
    required this.style,
  });

  final String text;
  final double width;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    // Measure with the exact style the Text renders (merged with defaults).
    final resolved = DefaultTextStyle.of(context).style.merge(style);
    final direction = Directionality.of(context);
    double widestAt(TextScaler scaler) {
      var widest = 0.0;
      for (final word in text.split(RegExp(r'\s+'))) {
        final painter = TextPainter(
          text: TextSpan(text: word, style: resolved),
          textScaler: scaler,
          textDirection: direction,
          maxLines: 1,
        )..layout();
        widest = math.max(widest, painter.width);
        painter.dispose();
      }
      return widest;
    }

    final available = width - 1;
    final fontSize = resolved.fontSize ?? 14;
    var scaler = MediaQuery.textScalerOf(context);
    // Letter spacing does not scale with text, so shrink toward the fit in a
    // few measured steps rather than by one ratio.
    for (var step = 0; step < 4; step++) {
      final widest = widestAt(scaler);
      if (widest <= available) break;
      final factor = scaler.scale(fontSize) / fontSize;
      scaler = TextScaler.linear(factor * available / widest * .98);
    }
    return SizedBox(
      width: width,
      child: Text(
        text,
        maxLines: 2,
        textAlign: TextAlign.center,
        overflow: TextOverflow.ellipsis,
        style: resolved,
        textScaler: scaler,
      ),
    );
  }
}
