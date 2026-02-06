import 'package:flutter/material.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/l10n/l10n.dart';

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
    final colorScheme = Theme.of(context).colorScheme;

    return SizedBox(
      height: 40,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          FilterChip(
            label: Text(l10n.timerNoCategory),
            selected: selectedCategoryId == null,
            onSelected: (_) => onSelected(null),
          ),
          const SizedBox(width: 8),
          ...categories.map(
            (category) => Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                avatar: category.color != null
                    ? CircleAvatar(
                        radius: 6,
                        backgroundColor: _parseColor(category.color!),
                      )
                    : null,
                label: Text(category.name ?? ''),
                selected: category.id == selectedCategoryId,
                onSelected: (_) => onSelected(category.id),
              ),
            ),
          ),
          ActionChip(
            avatar: Icon(Icons.add, size: 18, color: colorScheme.primary),
            label: Text(l10n.timerAddCategory),
            onPressed: onAddCategory,
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
