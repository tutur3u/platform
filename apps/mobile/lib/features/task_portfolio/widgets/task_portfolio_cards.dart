import 'package:flutter/material.dart' hide Card;
import 'package:mobile/data/models/task_initiative_summary.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskProjectCard extends StatelessWidget {
  const TaskProjectCard({
    required this.project,
    required this.onEdit,
    required this.onDelete,
    super.key,
  });

  final TaskProjectSummary project;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return shad.Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      project.name,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const shad.Gap(6),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _MetaBadge(
                          label: _projectStatusLabel(context, project.status),
                        ),
                        if (project.priority != null)
                          _MetaBadge(
                            label: _projectPriorityLabel(
                              context,
                              project.priority,
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              shad.GhostButton(
                density: shad.ButtonDensity.icon,
                onPressed: onEdit,
                child: const Icon(Icons.edit_outlined, size: 18),
              ),
              shad.GhostButton(
                density: shad.ButtonDensity.icon,
                onPressed: onDelete,
                child: const Icon(Icons.delete_outline, size: 18),
              ),
            ],
          ),
          const shad.Gap(12),
          Text(
            (project.description?.trim().isNotEmpty ?? false)
                ? project.description!.trim()
                : context.l10n.taskPortfolioNoDescription,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _InfoPill(
                icon: Icons.task_alt_outlined,
                label:
                    '${project.tasksCount} '
                    '${context.l10n.taskPortfolioProjectTasksLinked}',
              ),
              _InfoPill(
                icon: Icons.check_circle_outline,
                label:
                    '${project.completedTasksCount} '
                    '${context.l10n.taskPortfolioProjectCompletedTasks}',
              ),
            ],
          ),
          if (project.linkedTasks.isNotEmpty) ...[
            const shad.Gap(12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: project.linkedTasks
                  .take(4)
                  .map(
                    (task) => shad.OutlineBadge(
                      child: Text(
                        task.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  )
                  .toList(growable: false),
            ),
          ],
        ],
      ),
    );
  }
}

class TaskInitiativeCard extends StatelessWidget {
  const TaskInitiativeCard({
    required this.initiative,
    required this.onEdit,
    required this.onDelete,
    required this.onManageProjects,
    super.key,
  });

  final TaskInitiativeSummary initiative;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback onManageProjects;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return shad.Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      initiative.name,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const shad.Gap(6),
                    _MetaBadge(
                      label: _initiativeStatusLabel(context, initiative.status),
                    ),
                  ],
                ),
              ),
              shad.GhostButton(
                density: shad.ButtonDensity.icon,
                onPressed: onEdit,
                child: const Icon(Icons.edit_outlined, size: 18),
              ),
              shad.GhostButton(
                density: shad.ButtonDensity.icon,
                onPressed: onDelete,
                child: const Icon(Icons.delete_outline, size: 18),
              ),
            ],
          ),
          const shad.Gap(12),
          Text(
            (initiative.description?.trim().isNotEmpty ?? false)
                ? initiative.description!.trim()
                : context.l10n.taskPortfolioNoDescription,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(12),
          _InfoPill(
            icon: Icons.account_tree_outlined,
            label:
                '${initiative.projectsCount} '
                '${context.l10n.taskPortfolioInitiativeProjectsLinked}',
          ),
          const shad.Gap(12),
          if (initiative.linkedProjects.isNotEmpty)
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: initiative.linkedProjects
                  .map(
                    (project) => shad.OutlineBadge(
                      child: Text(
                        project.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  )
                  .toList(growable: false),
            )
          else
            Text(
              context.l10n.taskPortfolioNoLinkedProjects,
              style: theme.typography.textSmall.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          const shad.Gap(12),
          shad.OutlineButton(
            onPressed: onManageProjects,
            child: Text(context.l10n.taskPortfolioManageProjects),
          ),
        ],
      ),
    );
  }
}

class _MetaBadge extends StatelessWidget {
  const _MetaBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return shad.OutlineBadge(child: Text(label));
  }
}

class _InfoPill extends StatelessWidget {
  const _InfoPill({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: theme.colorScheme.muted.withValues(alpha: 0.35),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: theme.colorScheme.mutedForeground),
          const shad.Gap(6),
          Text(
            label,
            style: theme.typography.xSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ],
      ),
    );
  }
}

String _projectStatusLabel(BuildContext context, String? status) {
  return switch (status) {
    'backlog' => context.l10n.taskPortfolioProjectStatusBacklog,
    'planned' => context.l10n.taskPortfolioProjectStatusPlanned,
    'in_progress' => context.l10n.taskPortfolioProjectStatusInProgress,
    'in_review' => context.l10n.taskPortfolioProjectStatusInReview,
    'in_testing' => context.l10n.taskPortfolioProjectStatusInTesting,
    'completed' => context.l10n.taskPortfolioProjectStatusCompleted,
    'cancelled' => context.l10n.taskPortfolioProjectStatusCancelled,
    'on_hold' => context.l10n.taskPortfolioProjectStatusOnHold,
    _ => context.l10n.taskPortfolioProjectStatusActive,
  };
}

String _projectPriorityLabel(BuildContext context, String? priority) {
  return switch (priority) {
    'critical' => context.l10n.taskPortfolioProjectPriorityCritical,
    'high' => context.l10n.taskPortfolioProjectPriorityHigh,
    'low' => context.l10n.taskPortfolioProjectPriorityLow,
    _ => context.l10n.taskPortfolioProjectPriorityNormal,
  };
}

String _initiativeStatusLabel(BuildContext context, String? status) {
  return switch (status) {
    'completed' => context.l10n.taskPortfolioInitiativeStatusCompleted,
    'on_hold' => context.l10n.taskPortfolioInitiativeStatusOnHold,
    'cancelled' => context.l10n.taskPortfolioInitiativeStatusCancelled,
    _ => context.l10n.taskPortfolioInitiativeStatusActive,
  };
}
