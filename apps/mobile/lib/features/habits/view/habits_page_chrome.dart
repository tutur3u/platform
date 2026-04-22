import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/habits/habit_tracker_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class HabitsSummaryHeader extends StatelessWidget {
  const HabitsSummaryHeader({
    required this.summary,
    required this.subtitle,
    this.title,
    this.leadingIcon,
    super.key,
  });

  final HabitTrackerSummaryMetrics summary;
  final String? title;
  final String subtitle;
  final IconData? leadingIcon;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gradient = isDark
        ? const [
            Color(0xFF182332),
            Color(0xFF171B29),
            Color(0xFF143130),
          ]
        : [
            const Color(0xFFFFF2DF),
            colorScheme.surface,
            const Color(0xFFE6F4FF),
          ];
    final titleColor = isDark ? colorScheme.onSurface : colorScheme.primary;
    final bodyColor = isDark
        ? colorScheme.onSurfaceVariant
        : colorScheme.onSurface.withValues(alpha: 0.76);
    final borderColor = isDark
        ? colorScheme.outline.withValues(alpha: 0.4)
        : colorScheme.outline.withValues(alpha: 0.18);
    final metrics = [
      (
        context.l10n.habitsSummaryVolume,
        formatCompactNumber(summary.currentVolume),
      ),
      (context.l10n.habitsSummaryTargetsMet, '${summary.metTarget}'),
      (context.l10n.habitsSummaryTopStreak, '${summary.topStreak}'),
      (context.l10n.habitsSummaryTrackers, '${summary.totalTrackers}'),
    ];
    final hasTitle = title != null && title!.trim().isNotEmpty;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: LinearGradient(
          colors: gradient,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (hasTitle) ...[
            Row(
              children: [
                if (leadingIcon != null) ...[
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: colorScheme.surface.withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      leadingIcon,
                      size: 18,
                      color: titleColor,
                    ),
                  ),
                  const SizedBox(width: 10),
                ],
                Expanded(
                  child: Text(
                    title!,
                    style:
                        Theme.of(
                          context,
                        ).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: titleColor,
                        ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
          ],
          Text(
            subtitle,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: bodyColor),
          ),
          const SizedBox(height: 16),
          LayoutBuilder(
            builder: (context, constraints) {
              final columnCount = constraints.maxWidth < 680 ? 2 : 4;
              const spacing = 10.0;
              final itemWidth =
                  (constraints.maxWidth - spacing * (columnCount - 1)) /
                  columnCount;

              return Wrap(
                spacing: spacing,
                runSpacing: spacing,
                children: metrics
                    .map(
                      (metric) => SizedBox(
                        width: itemWidth,
                        child: _SummaryMetric(
                          label: metric.$1,
                          value: metric.$2,
                          highlighted: isDark,
                        ),
                      ),
                    )
                    .toList(growable: false),
              );
            },
          ),
        ],
      ),
    );
  }
}

class HabitsScopeControls extends StatelessWidget {
  const HabitsScopeControls({
    required this.selectedScope,
    required this.onScopeSelected,
    super.key,
  });

  final HabitTrackerScope selectedScope;
  final Future<void> Function(HabitTrackerScope scope) onScopeSelected;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      padding: const EdgeInsets.all(10),
      radius: 22,
      child: SegmentedButton<HabitTrackerScope>(
        segments: [
          ButtonSegment(
            value: HabitTrackerScope.self,
            label: Text(context.l10n.habitsScopeSelf),
          ),
          ButtonSegment(
            value: HabitTrackerScope.team,
            label: Text(context.l10n.habitsScopeTeam),
          ),
          ButtonSegment(
            value: HabitTrackerScope.member,
            label: Text(context.l10n.habitsScopeMember),
          ),
        ],
        selected: {selectedScope},
        onSelectionChanged: (selection) {
          final value = selection.firstOrNull;
          if (value != null) {
            unawaited(onScopeSelected(value));
          }
        },
      ),
    );
  }
}

class HabitsMemberPicker extends StatelessWidget {
  const HabitsMemberPicker({
    required this.members,
    required this.selectedMemberId,
    required this.onChanged,
    super.key,
  });

  final List<HabitTrackerMember> members;
  final String? selectedMemberId;
  final Future<void> Function(String? value) onChanged;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      padding: const EdgeInsets.all(14),
      radius: 22,
      child: DropdownButtonFormField<String>(
        initialValue: selectedMemberId,
        items: members
            .map(
              (member) => DropdownMenuItem<String>(
                value: member.userId,
                child: Text(member.label),
              ),
            )
            .toList(growable: false),
        onChanged: (value) => unawaited(onChanged(value)),
        decoration: InputDecoration(
          labelText: context.l10n.habitsMemberPickerLabel,
        ),
      ),
    );
  }
}

class HabitsSearchField extends StatelessWidget {
  const HabitsSearchField({
    required this.controller,
    required this.isVisible,
    required this.onChanged,
    super.key,
  });

  final TextEditingController controller;
  final bool isVisible;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 180),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      child: isVisible
          ? FinancePanel(
              key: const ValueKey('habits-search-visible'),
              padding: const EdgeInsets.all(12),
              radius: 22,
              child: shad.TextField(
                contextMenuBuilder: platformTextContextMenuBuilder(),
                controller: controller,
                hintText: context.l10n.habitsSearchHint,
                onChanged: onChanged,
              ),
            )
          : const SizedBox(
              key: ValueKey('habits-search-hidden'),
              height: 12,
            ),
    );
  }
}

class HabitsEmptyView extends StatelessWidget {
  const HabitsEmptyView({required this.onCreateTracker, super.key});

  final Future<void> Function() onCreateTracker;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      padding: const EdgeInsets.all(28),
      child: Column(
        children: [
          const Icon(Icons.repeat_rounded, size: 44),
          const SizedBox(height: 12),
          Text(
            context.l10n.habitsEmptyTitle,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Text(
            context.l10n.habitsEmptyDescription,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          shad.PrimaryButton(
            onPressed: onCreateTracker,
            child: Text(context.l10n.habitsCreateTrackerAction),
          ),
        ],
      ),
    );
  }
}

class HabitsErrorView extends StatelessWidget {
  const HabitsErrorView({this.error, super.key});

  final String? error;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 48),
          const SizedBox(height: 12),
          Text(error ?? context.l10n.habitsLoadError),
        ],
      ),
    );
  }
}

class _SummaryMetric extends StatelessWidget {
  const _SummaryMetric({
    required this.label,
    required this.value,
    this.highlighted = false,
  });

  final String label;
  final String value;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: highlighted
            ? colorScheme.surface.withValues(alpha: 0.24)
            : Colors.white.withValues(alpha: 0.82),
        border: Border.all(
          color: colorScheme.outlineVariant.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: colorScheme.onSurfaceVariant,
              height: 1.25,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            value,
            style:
                Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  fontSize: 26,
                  color: highlighted ? colorScheme.onSurface : null,
                ),
          ),
        ],
      ),
    );
  }
}
