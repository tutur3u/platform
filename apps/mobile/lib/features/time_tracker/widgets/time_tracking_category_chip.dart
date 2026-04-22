import 'package:flutter/material.dart';
import 'package:mobile/features/time_tracker/utils/category_color.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
    final theme = shad.Theme.of(context);
    final trimmedColor = rawColor?.trim();
    final hasColor = trimmedColor != null && trimmedColor.isNotEmpty;

    if (!hasColor) {
      return shad.OutlineBadge(
        child: Text(
          label,
          style: const TextStyle(fontSize: 10),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      );
    }

    final color = resolveTimeTrackingCategoryColor(
      context,
      trimmedColor,
      fallback: theme.colorScheme.mutedForeground,
    );

    return Container(
      constraints: const BoxConstraints(maxWidth: 200),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withAlpha(180)),
      ),
      child: Text(
        label,
        style: theme.typography.small.copyWith(
          fontSize: 10,
          color: color.withAlpha(240),
          fontWeight: FontWeight.w600,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }
}
