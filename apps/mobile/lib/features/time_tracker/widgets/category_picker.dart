import 'package:flutter/material.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class CategoryPicker extends StatelessWidget {
  const CategoryPicker({
    required this.categories,
    required this.selectedCategoryId,
    required this.onSelected,
    required this.onAddCategory,
    super.key,
  });

  final List<TimeTrackingCategory> categories;
  final String? selectedCategoryId;
  final ValueChanged<String?> onSelected;
  final VoidCallback onAddCategory;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return SizedBox(
      height: 40,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          shad.Toggle(
            value: selectedCategoryId == null,
            onChanged: (v) => onSelected(null),
            child: Text(l10n.timerNoCategory),
          ),
          const shad.Gap(8),
          ...categories.map(
            (category) => Padding(
              padding: const EdgeInsets.only(right: 8),
              child: shad.Toggle(
                value: category.id == selectedCategoryId,
                onChanged: (v) => onSelected(category.id),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (category.color != null) ...[
                      Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: _parseColor(category.color!),
                        ),
                      ),
                      const shad.Gap(8),
                    ],
                    Text(category.name ?? ''),
                  ],
                ),
              ),
            ),
          ),
          shad.OutlineButton(
            onPressed: onAddCategory,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  shad.LucideIcons.plus,
                  size: 16,
                  color: theme.colorScheme.primary,
                ),
                const shad.Gap(4),
                Text(l10n.timerAddCategory),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Color _parseColor(String hex) {
    final cleaned = hex.replaceAll('#', '');
    try {
      if (cleaned.length == 6) {
        return Color(int.parse('FF$cleaned', radix: 16));
      }
      if (cleaned.length == 8) {
        return Color(int.parse(cleaned, radix: 16));
      }
    } on FormatException {
      // Color value is not valid hex (e.g. "FFYELLOW") — fall back
    }
    return Colors.grey;
  }
}
