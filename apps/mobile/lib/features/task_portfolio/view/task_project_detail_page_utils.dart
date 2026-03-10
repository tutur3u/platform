part of 'task_project_detail_page.dart';

String? _timelineLabel(DateTime? startDate, DateTime? endDate) {
  if (startDate == null && endDate == null) return null;
  final formatter = DateFormat.yMd();
  if (startDate != null && endDate != null) {
    return '${formatter.format(startDate)} - ${formatter.format(endDate)}';
  }
  if (startDate != null) {
    return '${formatter.format(startDate)} -';
  }
  return '- ${formatter.format(endDate!)}';
}

int _projectProgressPercent(TaskProjectSummary project) {
  if (project.tasksCount <= 0) return 0;
  return ((project.completedTasksCount / project.tasksCount) * 100).round();
}

String _initialsForName(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .take(2)
      .toList(growable: false);
  if (parts.isEmpty) return '?';
  return parts.map((part) => part[0].toUpperCase()).join();
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

String _projectHealthStatusLabel(BuildContext context, String? healthStatus) {
  return switch (healthStatus) {
    'on_track' => context.l10n.taskPortfolioProjectHealthOnTrack,
    'at_risk' => context.l10n.taskPortfolioProjectHealthAtRisk,
    'off_track' => context.l10n.taskPortfolioProjectHealthOffTrack,
    _ => context.l10n.taskPortfolioProjectNoHealth,
  };
}
