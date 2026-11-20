import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/l10n/l10n.dart';

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
    return AppSegmentedControl<HabitTrackerScope>(
      segments: [
        AppSegment(
          value: HabitTrackerScope.self,
          label: context.l10n.habitsScopeSelf,
        ),
        AppSegment(
          value: HabitTrackerScope.team,
          label: context.l10n.habitsScopeTeam,
        ),
        AppSegment(
          value: HabitTrackerScope.member,
          label: context.l10n.habitsScopeMember,
        ),
      ],
      selected: selectedScope,
      onChanged: (scope) {
        if (scope != selectedScope) unawaited(onScopeSelected(scope));
      },
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
    final label = context.l10n.habitsMemberPickerLabel;
    return AppSelect<String>(
      value: selectedMemberId,
      title: label,
      placeholder: label,
      options: [
        for (final member in members)
          AppSelectOption(value: member.userId, label: member.label),
      ],
      onChanged: (value) => unawaited(onChanged(value)),
    );
  }
}

class HabitsEmptyView extends StatelessWidget {
  const HabitsEmptyView({required this.onCreateTracker, super.key});

  final Future<void> Function() onCreateTracker;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppStateMessage(
      icon: LucideIcons.repeat,
      title: l10n.habitsEmptyTitle,
      actionLabel: l10n.habitsCreateTrackerAction,
      onAction: onCreateTracker,
    );
  }
}

class HabitsErrorView extends StatelessWidget {
  const HabitsErrorView({this.error, super.key});

  final String? error;

  @override
  Widget build(BuildContext context) {
    return AppStateMessage(
      icon: LucideIcons.circleAlert,
      title: error ?? context.l10n.habitsLoadError,
    );
  }
}
