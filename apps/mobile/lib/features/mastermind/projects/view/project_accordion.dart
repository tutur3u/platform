import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/projects/cubit/projects_state.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/view/projects_labels.dart';
import 'package:mobile/features/mastermind/projects/view/projects_list_rows.dart';
import 'package:mobile/l10n/l10n.dart';

/// One project: a header with its state counts and, when open, its threads
/// paged in 50 at a time.
class ProjectAccordion extends StatelessWidget {
  const ProjectAccordion({
    required this.group,
    required this.slice,
    required this.expanded,
    required this.onToggle,
    required this.onLoadMore,
    required this.onRetry,
    required this.rowBuilder,
    super.key,
  });

  final ProjectGroup group;
  final ThreadListSlice? slice;
  final bool expanded;
  final VoidCallback onToggle;
  final VoidCallback onLoadMore;
  final VoidCallback onRetry;
  final Widget Function(ProjectThread thread) rowBuilder;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final slice = this.slice;
    final name = group.unassigned
        ? l10n.mastermindProjectsUnassigned
        : group.project;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Header(
          name: name,
          counts: group.counts,
          expanded: expanded,
          onTap: onToggle,
        ),
        if (expanded && slice != null) ...[
          for (final thread in slice.threads) rowBuilder(thread),
          ProjectsListFooter(
            slice: slice,
            onLoadMore: onLoadMore,
            onRetry: onRetry,
          ),
        ],
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.name,
    required this.counts,
    required this.expanded,
    required this.onTap,
  });

  final String name;
  final ProjectStateCounts counts;
  final bool expanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return Semantics(
      button: true,
      expanded: expanded,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              AnimatedRotation(
                turns: expanded ? 0 : -0.25,
                duration: const Duration(milliseconds: 150),
                child: Icon(
                  LucideIcons.chevronDown,
                  size: 16,
                  color: colors.mutedForeground,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
              ProjectCounts(counts: counts),
            ],
          ),
        ),
      ),
    );
  }
}

/// Running, waiting and failed as small tinted badges; idle as a plain bold
/// number. Zero counts are left out.
class ProjectCounts extends StatelessWidget {
  const ProjectCounts({required this.counts, super.key});

  final ProjectStateCounts counts;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
    final badges = [
      for (final state in const [
        ProjectThreadState.running,
        ProjectThreadState.waiting,
        ProjectThreadState.failed,
      ])
        if (counts.of(state) > 0)
          Semantics(
            label: '${state.describe(l10n)} ${counts.of(state)}',
            excludeSemantics: true,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: state.tone.fill(colors),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '${counts.of(state)}',
                style: TextStyle(
                  color: state.tone.foreground(colors),
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
      if (counts.idle > 0)
        Semantics(
          label: '${ProjectThreadState.idle.describe(l10n)} ${counts.idle}',
          excludeSemantics: true,
          child: Text(
            '${counts.idle}',
            style: TextStyle(
              color: colors.mutedForeground,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
    ];
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final (index, badge) in badges.indexed) ...[
          if (index > 0) const SizedBox(width: 4),
          badge,
        ],
      ],
    );
  }
}
