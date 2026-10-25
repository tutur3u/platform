import 'dart:async';

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
            SizedBox(
              width: widget.diameter + 24,
              child: Text(
                widget.label,
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(
                  context,
                ).textTheme.labelMedium?.copyWith(color: colors.onSurface),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
