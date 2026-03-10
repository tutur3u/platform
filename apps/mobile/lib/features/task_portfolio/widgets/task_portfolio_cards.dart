import 'package:flutter/material.dart' hide Card;
import 'package:intl/intl.dart';
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
                        if (project.healthStatus != null)
                          _HealthBadge(healthStatus: project.healthStatus!),
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
          // Timeline row (only when at least one date is set)
          if (project.startDate != null || project.endDate != null) ...[
            _TimelineRow(
              startDate: project.startDate,
              endDate: project.endDate,
            ),
            const shad.Gap(8),
          ],
          // Progress / task count row
          _TaskProgressRow(
            completed: project.completedTasksCount,
            total: project.tasksCount,
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

class _HealthBadge extends StatelessWidget {
  const _HealthBadge({required this.healthStatus});

  final String healthStatus;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (healthStatus) {
      'on_track' => (
        context.l10n.taskPortfolioProjectHealthOnTrack,
        Colors.green,
      ),
      'at_risk' => (
        context.l10n.taskPortfolioProjectHealthAtRisk,
        Colors.amber.shade700,
      ),
      'off_track' => (
        context.l10n.taskPortfolioProjectHealthOffTrack,
        Colors.red,
      ),
      _ => (healthStatus, Colors.grey),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.6)),
        color: color.withValues(alpha: 0.12),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          color: color,
        ),
      ),
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({this.startDate, this.endDate});

  final DateTime? startDate;
  final DateTime? endDate;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final fmt = DateFormat.yMd();
    final String label;
    if (startDate != null && endDate != null) {
      label = '${fmt.format(startDate!)} → ${fmt.format(endDate!)}';
    } else if (startDate != null) {
      label = '${fmt.format(startDate!)} →';
    } else {
      label = '→ ${fmt.format(endDate!)}';
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          Icons.calendar_today_outlined,
          size: 13,
          color: theme.colorScheme.mutedForeground,
        ),
        const shad.Gap(6),
        Text(
          label,
          style: theme.typography.xSmall.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
      ],
    );
  }
}

class _TaskProgressRow extends StatelessWidget {
  const _TaskProgressRow({required this.completed, required this.total});

  final int completed;
  final int total;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final progress = total > 0 ? completed / total : 0.0;
    final pct = (progress * 100).round();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Icon(
                  Icons.task_alt_outlined,
                  size: 13,
                  color: theme.colorScheme.mutedForeground,
                ),
                const shad.Gap(6),
                Text(
                  context.l10n.taskPortfolioProjectTasksProgress(
                    completed,
                    total,
                  ),
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ),
            Text(
              '$pct%',
              style: theme.typography.xSmall.copyWith(
                color: theme.colorScheme.mutedForeground,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        const shad.Gap(6),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: progress,
            minHeight: 4,
            backgroundColor: theme.colorScheme.muted.withValues(alpha: 0.4),
            valueColor: AlwaysStoppedAnimation<Color>(
              pct == 100 ? Colors.green : theme.colorScheme.primary,
            ),
          ),
        ),
      ],
    );
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
