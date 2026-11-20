import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/features/habits/habit_tracker_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

class HabitsLibrarySection extends StatelessWidget {
  const HabitsLibrarySection({
    required this.onUseTemplate,
    required this.onCustomize,
    super.key,
  });

  final Future<void> Function(HabitTrackerTemplate template) onUseTemplate;
  final Future<void> Function() onCustomize;

  @override
  Widget build(BuildContext context) {
    final categories = [
      HabitTrackerTemplateCategory.strength,
      HabitTrackerTemplateCategory.health,
      HabitTrackerTemplateCategory.recovery,
      HabitTrackerTemplateCategory.discipline,
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final category in categories) ...[
          AppSectionHeader(title: _title(context, category)),
          AppGroupedCard(
            children: [
              for (final template in habitTrackerTemplatesForCategory(category))
                AppGroupedRow(
                  leading: AppIconTile(
                    icon: habitTrackerIcon(template.icon),
                    tone: AppTone.primary,
                  ),
                  title: Text(template.name),
                  subtitle: Text(template.description),
                  onTap: () => onUseTemplate(template),
                  showChevron: true,
                ),
            ],
          ),
          const AppGap(AppSpacing.xl),
        ],
        AppGroupedCard(
          children: [
            AppGroupedRow(
              leading: const AppIconTile(
                icon: LucideIcons.plus,
                tone: AppTone.primary,
              ),
              title: Text(context.l10n.habitsLibraryCustomizeAction),
              onTap: onCustomize,
              showChevron: true,
            ),
          ],
        ),
      ],
    );
  }

  String _title(BuildContext context, HabitTrackerTemplateCategory category) {
    final l10n = context.l10n;
    return switch (category) {
      HabitTrackerTemplateCategory.strength => l10n.habitsLibraryStrengthTitle,
      HabitTrackerTemplateCategory.health => l10n.habitsLibraryHealthTitle,
      HabitTrackerTemplateCategory.recovery => l10n.habitsLibraryRecoveryTitle,
      HabitTrackerTemplateCategory.discipline =>
        l10n.habitsLibraryDisciplineTitle,
      HabitTrackerTemplateCategory.custom => l10n.habitsLibraryCustomizeTitle,
    };
  }
}
