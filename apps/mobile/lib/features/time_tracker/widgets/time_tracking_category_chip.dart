import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/time_tracker/utils/category_color.dart';

/// Compact category pill styled like task label chips (tinted fill + border).
class TimeTrackingCategoryChip extends StatelessWidget {
  const TimeTrackingCategoryChip({
    required this.label,
    this.rawColor,
    super.key,
  });

  final String label;
  final String? rawColor;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final color = rawColor?.trim();
    return AppBadge.outline(
      leading: color == null || color.isEmpty
          ? null
          : Icon(
              LucideIcons.dot,
              color: resolveTimeTrackingCategoryColor(
                context,
                color,
                fallback: colors.mutedForeground,
              ),
            ),
      child: Text(label),
    );
  }
}
