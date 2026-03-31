part of 'task_project_detail_page.dart';

class _ProjectDetailsCard extends StatelessWidget {
  const _ProjectDetailsCard({
    required this.project,
    required this.isMutating,
    required this.onEdit,
    required this.onDelete,
  });

  final TaskProjectSummary project;
  final bool isMutating;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final timeline = _timelineLabel(project.startDate, project.endDate);
    final editLabel = context.l10n.taskPortfolioEditProject;
    final deleteLabel = context.l10n.taskPortfolioDeleteProject;

    return TaskSurfacePane(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  project.name,
                  style: theme.typography.h4.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const shad.Gap(8),
              Semantics(
                button: true,
                label: editLabel,
                child: Tooltip(
                  message: editLabel,
                  child: shad.GhostButton(
                    density: shad.ButtonDensity.icon,
                    onPressed: isMutating ? null : onEdit,
                    child: const Icon(Icons.edit_outlined, size: 18),
                  ),
                ),
              ),
              Semantics(
                button: true,
                label: deleteLabel,
                child: Tooltip(
                  message: deleteLabel,
                  child: shad.GhostButton(
                    density: shad.ButtonDensity.icon,
                    onPressed: isMutating ? null : onDelete,
                    child: const Icon(Icons.delete_outline, size: 18),
                  ),
                ),
              ),
            ],
          ),
          const shad.Gap(8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              shad.OutlineBadge(
                child: Text(_projectStatusLabel(context, project.status)),
              ),
              if (project.priority != null)
                shad.OutlineBadge(
                  child: Text(_projectPriorityLabel(context, project.priority)),
                ),
              if (project.healthStatus != null)
                shad.OutlineBadge(
                  child: Text(
                    _projectHealthStatusLabel(context, project.healthStatus),
                  ),
                ),
            ],
          ),
          const shad.Gap(12),
          Text(
            (project.description?.trim().isNotEmpty ?? false)
                ? project.description!.trim()
                : context.l10n.taskPortfolioNoDescription,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(12),
          _ProjectLeadRow(project: project),
          if (timeline != null) ...[
            const shad.Gap(12),
            _DetailRow(
              icon: Icons.calendar_today_outlined,
              label: context.l10n.taskPortfolioProjectTimeline,
              value: timeline,
            ),
          ],
        ],
      ),
    );
  }
}

class _LinkedTasksCard extends StatelessWidget {
  const _LinkedTasksCard({
    required this.project,
    required this.isMutating,
    required this.onLinkTask,
    required this.onUnlinkTask,
  });

  final TaskProjectSummary project;
  final bool isMutating;
  final VoidCallback onLinkTask;
  final Future<void> Function(String taskId) onUnlinkTask;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final unlinkLabel = context.l10n.taskPortfolioUnlinkTask;

    return TaskSurfacePane(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  context.l10n.taskPortfolioLinkedTasks,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              shad.OutlineButton(
                onPressed: isMutating ? null : onLinkTask,
                child: Text(context.l10n.taskPortfolioLinkTask),
              ),
            ],
          ),
          const shad.Gap(10),
          if (project.linkedTasks.isEmpty)
            Text(
              context.l10n.taskPortfolioNoLinkedTasks,
              style: theme.typography.textMuted,
            )
          else
            ...project.linkedTasks.map(
              (task) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(10, 8, 8, 8),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: theme.colorScheme.border.withValues(alpha: 0.9),
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              task.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.typography.small.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            if (task.listName?.trim().isNotEmpty ?? false) ...[
                              const shad.Gap(4),
                              Text(
                                task.listName!.trim(),
                                style: theme.typography.xSmall.copyWith(
                                  color: theme.colorScheme.mutedForeground,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      Semantics(
                        button: true,
                        label: unlinkLabel,
                        child: Tooltip(
                          message: unlinkLabel,
                          child: shad.GhostButton(
                            density: shad.ButtonDensity.icon,
                            onPressed: isMutating
                                ? null
                                : () => unawaited(onUnlinkTask(task.id)),
                            child: const Icon(
                              Icons.link_off_outlined,
                              size: 18,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Row(
      children: [
        Icon(icon, size: 14, color: theme.colorScheme.mutedForeground),
        const shad.Gap(6),
        Expanded(
          child: Text(
            '$label: $value',
            style: theme.typography.xSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ),
      ],
    );
  }
}

class _ProjectLeadRow extends StatelessWidget {
  const _ProjectLeadRow({required this.project});

  final TaskProjectSummary project;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final leadName =
        project.lead?.label ?? context.l10n.taskPortfolioProjectNoLead;
    final avatarUrl = project.lead?.avatarUrl;

    return Row(
      children: [
        CircleAvatar(
          radius: 18,
          foregroundImage: avatarUrl != null && avatarUrl.isNotEmpty
              ? NetworkImage(avatarUrl)
              : null,
          child: avatarUrl == null || avatarUrl.isEmpty
              ? project.lead == null
                    ? const Icon(Icons.person_outline, size: 18)
                    : Text(_initialsForName(leadName))
              : null,
        ),
        const shad.Gap(10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                context.l10n.taskPortfolioProjectLead,
                style: theme.typography.xSmall.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
              const shad.Gap(2),
              Text(
                leadName,
                style: theme.typography.small.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ProjectStatChip extends StatelessWidget {
  const _ProjectStatChip({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      constraints: const BoxConstraints(minWidth: 120),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.colorScheme.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: theme.colorScheme.mutedForeground),
          const shad.Gap(8),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
                const shad.Gap(2),
                Text(
                  value,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProjectStatsCard extends StatelessWidget {
  const _ProjectStatsCard({required this.project});

  final TaskProjectSummary project;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final progressPercent = _projectProgressPercent(project);

    return shad.Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  context.l10n.taskPortfolioProjectStats,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const shad.Gap(10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _ProjectStatChip(
                label: context.l10n.taskPortfolioProjectCompletion,
                value: '$progressPercent%',
                icon: Icons.pie_chart_outline,
              ),
              _ProjectStatChip(
                label: context.l10n.taskPortfolioProjectTasks,
                value: context.l10n.taskPortfolioProjectTasksProgress(
                  project.completedTasksCount,
                  project.tasksCount,
                ),
                icon: Icons.task_alt_outlined,
              ),
              _ProjectStatChip(
                label: context.l10n.taskPortfolioLinkedTasks,
                value: '${project.linkedTasks.length}',
                icon: Icons.link_outlined,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
