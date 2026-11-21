import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/projects/cubit/projects_state.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/view/projects_labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// Machine chips, search and state chips above the list, and the line that
/// says when an older list is on screen.
class ProjectsControls extends StatelessWidget {
  const ProjectsControls({
    required this.state,
    required this.search,
    required this.onSearch,
    required this.onFilter,
    required this.onMachine,
    super.key,
  });

  final ProjectsState state;
  final TextEditingController search;
  final ValueChanged<String> onSearch;
  final ValueChanged<ProjectThreadState?> onFilter;
  final ValueChanged<ProjectsMachine> onMachine;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final totals = state.flatMode ? null : state.overview?.totals;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (state.machines.length > 1) ...[
          _MachineChips(state: state, onMachine: onMachine),
          const SizedBox(height: AppSpacing.md),
        ],
        AppSearchField(
          controller: search,
          placeholder: l10n.mastermindProjectsSearch,
          onChanged: onSearch,
        ),
        const SizedBox(height: AppSpacing.md),
        AppFilterBar<ProjectThreadState?>(
          options: [
            AppFilterOption(value: null, label: l10n.commonAll),
            for (final s in ProjectThreadState.values)
              AppFilterOption(
                value: s,
                label: s.describe(l10n),
                count: totals?.of(s),
              ),
          ],
          selected: state.filter,
          onSelected: onFilter,
        ),
        if (state.busy)
          const Padding(
            padding: EdgeInsets.only(top: AppSpacing.sm),
            child: LinearProgressIndicator(minHeight: 2),
          ),
        _StatusLine(state: state),
        const SizedBox(height: AppSpacing.md),
      ],
    );
  }
}

class _MachineChips extends StatelessWidget {
  const _MachineChips({required this.state, required this.onMachine});

  final ProjectsState state;
  final ValueChanged<ProjectsMachine> onMachine;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final (index, machine) in state.machines.indexed) ...[
            if (index > 0) const SizedBox(width: AppSpacing.sm),
            Semantics(
              enabled: machine.reachable,
              label: machine.reachable
                  ? null
                  : l10n.mastermindProjectsMachineUnreachable(
                      machine.display(l10n),
                    ),
              child: Opacity(
                opacity: machine.reachable ? 1 : 0.45,
                child: AppChip(
                  key: ValueKey('projects-machine-${machine.key}'),
                  avatar: const Icon(LucideIcons.server, size: 14),
                  label: Text(machine.display(l10n)),
                  selected: machine == state.machine,
                  inMutuallyExclusiveGroup: true,
                  onSelected: machine.reachable
                      ? (_) => onMachine(machine)
                      : null,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// "Showing the list from 14:02" while an older list stands in for a read
/// that failed, or the failure itself when it is not about staleness.
class _StatusLine extends StatelessWidget {
  const _StatusLine({required this.state});

  final ProjectsState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
    final failure = state.failure;
    final String text;
    if (state.stale) {
      final at = TimeOfDay.fromDateTime(state.fetchedAt!.toLocal());
      text = l10n.mastermindProjectsStaleList(at.format(context));
    } else if (failure != null && state.hasContent) {
      text = failure.message(l10n);
    } else {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.md),
      child: Row(
        children: [
          Icon(LucideIcons.clock, size: 14, color: colors.warning),
          const SizedBox(width: AppSpacing.xs),
          Expanded(
            child: Text(
              text,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: colors.mutedForeground),
            ),
          ),
        ],
      ),
    );
  }
}
