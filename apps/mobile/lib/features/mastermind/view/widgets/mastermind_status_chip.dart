import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// A status word on a soft theme-toned pill, with an optional glyph so the
/// state is never carried by colour alone. It has no border, so it sits on a
/// `MastermindSurface` without adding another box.
class MastermindStatusChip extends StatelessWidget {
  const MastermindStatusChip({
    required this.label,
    this.icon,
    this.tone = AppTone.neutral,
    super.key,
  });

  final String label;
  final IconData? icon;
  final AppTone tone;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final foreground = tone == AppTone.neutral
        ? c.foreground
        : tone.foreground(c);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tone == AppTone.neutral
            ? c.foreground.withValues(alpha: c.isDark ? 0.1 : 0.07)
            : tone.fill(c),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.xxs,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon case final icon?) ...[
              Icon(icon, size: 12, color: foreground),
              const SizedBox(width: AppSpacing.xs),
            ],
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: tokens.typography.label.copyWith(color: foreground),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
