import 'package:flutter/material.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/features/time_tracker/utils/category_color.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// A tappable button that displays the currently selected category (or a
/// "No category" placeholder) and calls [onTap] to open the picker sheet.
class CategorySelectorButton extends StatelessWidget {
  const CategorySelectorButton({
    required this.categories,
    required this.selectedCategoryId,
    required this.onTap,
    super.key,
  });

  final List<TimeTrackingCategory> categories;
  final String? selectedCategoryId;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    final selected = selectedCategoryId != null
        ? categories.where((c) => c.id == selectedCategoryId).firstOrNull
        : null;

    final dotColor = selected?.color != null
        ? resolveTimeTrackingCategoryColor(
            context,
            selected!.color,
            fallback: colorScheme.mutedForeground,
          )
        : null;

    return shad.OutlineButton(
      onPressed: onTap,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dotColor != null) ...[
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: dotColor,
              ),
            ),
            const shad.Gap(8),
          ] else ...[
            Icon(
              shad.LucideIcons.tag,
              size: 14,
              color: colorScheme.mutedForeground,
            ),
            const shad.Gap(8),
          ],
          Text(
            selected?.name ?? l10n.timerNoCategory,
            style: theme.typography.small.copyWith(
              color: selected != null
                  ? colorScheme.foreground
                  : colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(6),
          Icon(
            shad.LucideIcons.chevronsUpDown,
            size: 14,
            color: colorScheme.mutedForeground,
          ),
        ],
      ),
    );
  }
}
