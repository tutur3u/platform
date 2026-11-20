import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/l10n/l10n.dart';

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
    final selected = categories
        .where((category) => category.id == selectedCategoryId)
        .firstOrNull;
    final name = selected?.name?.trim();
    final value = name == null || name.isEmpty ? l10n.timerNoCategory : name;
    return AppGroupedCard(
      children: [
        AppGroupedRow(
          title: Text(l10n.timerCategory),
          subtitle: Text(value),
          leading: const AppIconTile(
            icon: LucideIcons.tag,
            tone: AppTone.primary,
          ),
          onTap: onTap,
          showChevron: true,
        ),
      ],
    );
  }
}
