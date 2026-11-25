import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';

/// Three softly pulsing dots and a status line shown while Mira prepares a
/// reply, before any text or tool step arrives. Reduced motion keeps the dots
/// still.
class AssistantStreamingIndicator extends StatefulWidget {
  const AssistantStreamingIndicator({required this.label, super.key});

  final String label;

  @override
  State<AssistantStreamingIndicator> createState() =>
      _AssistantStreamingIndicatorState();
}

class _AssistantStreamingIndicatorState
    extends State<AssistantStreamingIndicator>
    with SingleTickerProviderStateMixin {
  static const _period = Duration(milliseconds: 1200);

  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: _period,
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller
        ..stop()
        ..value = 0;
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final still = MediaQuery.disableAnimationsOf(context);
    return Semantics(
      liveRegion: true,
      label: widget.label,
      excludeSemantics: true,
      child: Padding(
        key: const ValueKey('assistant-streaming-indicator'),
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.xs + 2,
              ),
              decoration: BoxDecoration(
                color: colors.muted.withValues(
                  alpha: colors.isDark ? 0.45 : 0.6,
                ),
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
              child: AnimatedBuilder(
                animation: _controller,
                builder: (context, _) => Row(
                  mainAxisSize: MainAxisSize.min,
                  spacing: 4,
                  children: [
                    for (var i = 0; i < 3; i++)
                      _Dot(
                        color: colors.primary,
                        // Each dot peaks a third of a period after the last.
                        strength: still
                            ? 0.7
                            : _pulse(_controller.value - i / 3),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Flexible(
              child: Text(
                widget.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: tokens.typography.uiSm.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 0.35 at rest rising to 1 once per period.
  static double _pulse(double phase) {
    final t = phase - phase.floorToDouble();
    final wave = (1 - math.cos(t * 2 * math.pi)) / 2;
    return 0.35 + 0.65 * wave;
  }
}

class _Dot extends StatelessWidget {
  const _Dot({required this.color, required this.strength});

  final Color color;
  final double strength;

  @override
  Widget build(BuildContext context) => Transform.scale(
    scale: 0.8 + 0.2 * strength,
    child: Container(
      width: 6,
      height: 6,
      decoration: BoxDecoration(
        color: color.withValues(alpha: strength),
        shape: BoxShape.circle,
      ),
    ),
  );
}
