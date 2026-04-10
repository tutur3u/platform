import 'package:flutter/material.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/features/habits/habit_tracker_presentation.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
          FinanceSectionHeader(
            title: _title(context, category),
            subtitle: _subtitle(context, category),
          ),
          const SizedBox(height: 12),
          ...habitTrackerTemplatesForCategory(category)
              .map(
                (template) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _TemplateCard(
                    template: template,
                    onTap: () => onUseTemplate(template),
                  ),
                ),
              )
              .toList(growable: false),
          const SizedBox(height: 18),
        ],
        FinancePanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                context.l10n.habitsLibraryCustomizeTitle,
                style: shad.Theme.of(
                  context,
                ).typography.large.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              Text(
                context.l10n.habitsLibraryCustomizeDescription,
                style: shad.Theme.of(context).typography.textSmall.copyWith(
                  color: shad.Theme.of(context).colorScheme.mutedForeground,
                ),
              ),
              const SizedBox(height: 16),
              shad.SecondaryButton(
                onPressed: onCustomize,
                child: Text(context.l10n.habitsLibraryCustomizeAction),
              ),
            ],
          ),
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

  String _subtitle(
    BuildContext context,
    HabitTrackerTemplateCategory category,
  ) {
    final l10n = context.l10n;
    return switch (category) {
      HabitTrackerTemplateCategory.strength =>
        l10n.habitsLibraryStrengthSubtitle,
      HabitTrackerTemplateCategory.health => l10n.habitsLibraryHealthSubtitle,
      HabitTrackerTemplateCategory.recovery =>
        l10n.habitsLibraryRecoverySubtitle,
      HabitTrackerTemplateCategory.discipline =>
        l10n.habitsLibraryDisciplineSubtitle,
      HabitTrackerTemplateCategory.custom =>
        l10n.habitsLibraryCustomizeDescription,
    };
  }
}

class _TemplateCard extends StatelessWidget {
  const _TemplateCard({required this.template, required this.onTap});

  final HabitTrackerTemplate template;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final accent = habitTrackerColor(context, template.color);

    return FinancePanel(
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color: accent.withValues(alpha: 0.14),
            ),
            child: Icon(habitTrackerIcon(template.icon), color: accent),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  template.name,
                  style: shad.Theme.of(
                    context,
                  ).typography.large.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                Text(
                  template.description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: shad.Theme.of(context).typography.textSmall.copyWith(
                    color: shad.Theme.of(context).colorScheme.mutedForeground,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${context.l10n.habitsLibraryGoalChip}: ${template.targetValue.toInt()} • ${_composerLabel(context, template.composerMode)}',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          shad.PrimaryButton(
            onPressed: onTap,
            child: Text(context.l10n.appsHubOpenApp),
          ),
        ],
      ),
    );
  }

  String _composerLabel(BuildContext context, HabitTrackerComposerMode mode) {
    final l10n = context.l10n;
    return switch (mode) {
      HabitTrackerComposerMode.quickCheck => l10n.habitsComposerQuickCheck,
      HabitTrackerComposerMode.quickIncrement =>
        l10n.habitsComposerQuickIncrement,
      HabitTrackerComposerMode.measurement => l10n.habitsComposerMeasurement,
      HabitTrackerComposerMode.workoutSession =>
        l10n.habitsComposerWorkoutSession,
      HabitTrackerComposerMode.advancedCustom =>
        l10n.habitsComposerAdvancedCustom,
    };
  }
}
