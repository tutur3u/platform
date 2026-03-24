import 'package:flutter/material.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/features/time_tracker/utils/category_color.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Bordered picker row using the same shell as the timer task-link field.
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

    Color? dotColor;
    final sel = selected;
    if (sel != null && sel.color != null) {
      dotColor = resolveTimeTrackingCategoryColor(
        context,
        sel.color,
        fallback: colorScheme.mutedForeground,
      );
    }

    final hasCategory = selected != null;
    late final String categoryLabel;
    if (selected == null) {
      categoryLabel = l10n.timerNoCategory;
    } else {
      final n = selected.name?.trim();
      categoryLabel = (n != null && n.isNotEmpty) ? n : l10n.timerCategory;
    }

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: hasCategory
              ? colorScheme.primary.withValues(alpha: 0.6)
              : colorScheme.border,
        ),
        color: hasCategory
            ? colorScheme.primary.withValues(alpha: 0.05)
            : colorScheme.background,
      ),
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(8),
                bottomLeft: Radius.circular(8),
              ),
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                child: hasCategory
                    ? Row(
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
                          ],
                          Expanded(
                            child: Text(
                              categoryLabel,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.typography.small.copyWith(
                                color: colorScheme.foreground,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      )
                    : Text(
                        categoryLabel,
                        style: theme.typography.small.copyWith(
                          color: colorScheme.mutedForeground,
                        ),
                      ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 10),
            child: Icon(
              shad.LucideIcons.chevronsUpDown,
              size: 14,
              color: colorScheme.mutedForeground,
            ),
          ),
        ],
      ),
    );
  }
}
