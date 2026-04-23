import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/features/time_tracker/utils/category_color.dart';
import 'package:mobile/features/time_tracker/widgets/create_category_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Opens [CategorySheet] as an adaptive bottom sheet/dialog.
Future<void> showCategorySheet({
  required BuildContext context,
  required List<TimeTrackingCategory> categories,
  required String? selectedCategoryId,
  required ValueChanged<String?> onSelected,
  Future<void> Function({
    required String name,
    String? color,
    String? description,
  })?
  onCreateCategory,
  bool useRootNavigator = true,
}) {
  return showAdaptiveSheet<void>(
    context: context,
    useRootNavigator: useRootNavigator,
    builder: (_) => CategorySheet(
      hostContext: context,
      categories: categories,
      selectedCategoryId: selectedCategoryId,
      onSelected: onSelected,
      onCreateCategory: onCreateCategory,
      useRootNavigator: useRootNavigator,
    ),
  );
}

/// A bottom-sheet listing all categories plus an option to create a new one.
class CategorySheet extends StatelessWidget {
  const CategorySheet({
    required this.hostContext,
    required this.categories,
    required this.selectedCategoryId,
    required this.onSelected,
    this.onCreateCategory,
    this.useRootNavigator = true,
    super.key,
  });

  final BuildContext hostContext;
  final List<TimeTrackingCategory> categories;
  final String? selectedCategoryId;
  final ValueChanged<String?> onSelected;
  final Future<void> Function({
    required String name,
    String? color,
    String? description,
  })?
  onCreateCategory;
  final bool useRootNavigator;

  Future<void> _closeCurrentSheet(BuildContext context) async {
    await Navigator.maybePop(context);
  }

  Future<void> _selectCategory(BuildContext context, String? categoryId) async {
    onSelected(categoryId);
    await _closeCurrentSheet(context);
  }

  Future<void> _showCreateCategorySheet(BuildContext context) async {
    final create = onCreateCategory;
    if (create == null) return;
    await _closeCurrentSheet(context);
    if (!hostContext.mounted) {
      return;
    }

    await showAdaptiveSheet<void>(
      context: hostContext,
      useRootNavigator: useRootNavigator,
      builder: (_) => CreateCategorySheet(onSave: create),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    return SafeArea(
      child: ColoredBox(
        color: colorScheme.background,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Drag handle
            Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 4),
              child: Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: colorScheme.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      l10n.timerSelectCategory,
                      style: theme.typography.h4,
                    ),
                  ),
                  shad.IconButton.ghost(
                    icon: const Icon(shad.LucideIcons.x, size: 18),
                    onPressed: () => unawaited(_closeCurrentSheet(context)),
                  ),
                ],
              ),
            ),

            const shad.Divider(),

            // Category list
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(context).height * 0.5,
              ),
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(vertical: 4),
                children: [
                  // "No category" option
                  _CategoryTile(
                    label: l10n.timerNoCategory,
                    isSelected: selectedCategoryId == null,
                    onTap: () => unawaited(_selectCategory(context, null)),
                  ),
                  ...categories.map(
                    (cat) => _CategoryTile(
                      color: cat.color != null
                          ? resolveTimeTrackingCategoryColor(
                              context,
                              cat.color,
                              fallback: colorScheme.mutedForeground,
                            )
                          : null,
                      label: cat.name ?? '',
                      isSelected: cat.id == selectedCategoryId,
                      onTap: () => unawaited(_selectCategory(context, cat.id)),
                    ),
                  ),
                ],
              ),
            ),

            if (onCreateCategory != null) ...[
              const shad.Divider(),

              // "Create new category" button
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                child: shad.OutlineButton(
                  onPressed: () => unawaited(_showCreateCategorySheet(context)),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        shad.LucideIcons.plus,
                        size: 16,
                        color: colorScheme.primary,
                      ),
                      const shad.Gap(8),
                      Text(
                        l10n.timerCreateCategory,
                        style: theme.typography.small.copyWith(
                          color: colorScheme.primary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({
    required this.label,
    required this.isSelected,
    required this.onTap,
    this.color,
  });

  final Color? color;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Row(
          children: [
            // Color dot or placeholder
            Container(
              width: 14,
              height: 14,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: color ?? colorScheme.border,
                border: color == null
                    ? Border.all(color: colorScheme.mutedForeground)
                    : null,
              ),
            ),
            const shad.Gap(12),
            Expanded(
              child: Text(
                label,
                style: theme.typography.base.copyWith(
                  color: isSelected
                      ? colorScheme.foreground
                      : colorScheme.foreground.withValues(alpha: 0.85),
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                ),
              ),
            ),
            if (isSelected)
              Icon(
                shad.LucideIcons.check,
                size: 16,
                color: colorScheme.primary,
              ),
          ],
        ),
      ),
    );
  }
}
