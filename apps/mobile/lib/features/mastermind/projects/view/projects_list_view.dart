import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/projects/cubit/projects_cubit.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/projects_location.dart';
import 'package:mobile/features/mastermind/projects/view/project_accordion.dart';
import 'package:mobile/features/mastermind/projects/view/project_thread_row.dart';
import 'package:mobile/features/mastermind/projects/view/projects_labels.dart';
import 'package:mobile/features/mastermind/projects/view/projects_list_rows.dart';
import 'package:mobile/l10n/l10n.dart';

/// The card under the controls: one accordion per project, or the flat list.
class ProjectsListView extends StatelessWidget {
  const ProjectsListView({
    required this.state,
    required this.cubit,
    required this.now,
    super.key,
  });

  final ProjectsState state;
  final ProjectsCubit cubit;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final machine = state.machine;
    if (!state.hasContent) {
      final failure = state.failure;
      if (state.status == ProjectsStatus.failed && failure != null) {
        return AppStateMessage.inline(
          icon: LucideIcons.cloudOff,
          tone: AppTone.warning,
          title: failure.message(l10n),
          actionLabel: l10n.commonRetry,
          onAction: () => unawaited(cubit.load()),
        );
      }
      if (!state.flatMode || !state.flat.loading) {
        return const _Placeholder();
      }
    }
    if (machine == null) return const _Placeholder();

    Widget row(ProjectThread thread) => ProjectThreadRow(
      key: ValueKey('projects-thread-${thread.threadId}'),
      thread: thread,
      machineLabel: machine.display(l10n),
      showProject: state.flatMode,
      now: now,
      onTap: () => unawaited(
        context.push(
          projectThreadLocation(machine: machine, threadId: thread.threadId),
        ),
      ),
    );

    if (state.flatMode) {
      return AppGroupedCard(
        dividerInset: 38,
        children: [
          for (final thread in state.flat.threads) row(thread),
          ProjectsListFooter(
            slice: state.flat,
            linkedMachine: machine.linked ? machine.display(l10n) : null,
            onLoadMore: () => unawaited(cubit.loadMoreFlat()),
            onRetry: () => unawaited(cubit.refresh()),
          ),
        ],
      );
    }

    final filter = state.filter;
    final groups = (state.overview?.groups ?? const <ProjectGroup>[])
        .where((g) => filter == null || g.counts.of(filter) > 0)
        .toList();
    if (groups.isEmpty) {
      return AppStateMessage.inline(
        icon: LucideIcons.search,
        title: l10n.mastermindProjectsEmpty,
      );
    }
    return AppGroupedCard(
      dividerInset: 0,
      children: [
        for (final group in groups)
          ProjectAccordion(
            key: ValueKey('projects-group-${group.projectId}'),
            group: group,
            slice: state.groups[group.projectId],
            expanded: state.expanded.contains(group.projectId),
            onToggle: () => unawaited(cubit.toggle(group.projectId)),
            onLoadMore: () => unawaited(cubit.loadMore(group.projectId)),
            onRetry: () => unawaited(cubit.retryGroup(group.projectId)),
            rowBuilder: row,
          ),
      ],
    );
  }
}

/// Stable geometry while the first list is read.
class _Placeholder extends StatelessWidget {
  const _Placeholder();

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    Widget bar(double width) => Container(
      width: width,
      height: 12,
      decoration: BoxDecoration(
        color: colors.muted,
        borderRadius: BorderRadius.circular(6),
      ),
    );
    return AppGroupedCard(
      children: [
        for (var i = 0; i < 4; i++)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            child: Row(
              children: [
                bar(16),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: bar(140),
                  ),
                ),
                bar(32),
              ],
            ),
          ),
      ],
    );
  }
}
