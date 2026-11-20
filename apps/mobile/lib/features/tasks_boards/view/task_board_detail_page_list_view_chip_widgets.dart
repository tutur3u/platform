part of 'task_board_detail_page.dart';

class _RelationshipChip extends StatelessWidget {
  const _RelationshipChip({required this.indicator});

  final _TaskRelationshipIndicator indicator;

  @override
  Widget build(BuildContext context) {
    final (icon, variant) = switch (indicator.kind) {
      _TaskRelationshipKind.parent || _TaskRelationshipKind.child => (
        LucideIcons.workflow,
        AppBadgeVariant.outline,
      ),
      _TaskRelationshipKind.blockedBy => (
        LucideIcons.ban,
        AppBadgeVariant.destructive,
      ),
      _TaskRelationshipKind.blocking => (
        LucideIcons.triangleAlert,
        AppBadgeVariant.warning,
      ),
      _TaskRelationshipKind.related => (
        LucideIcons.link,
        AppBadgeVariant.outline,
      ),
    };
    return AppBadge(
      variant: variant,
      leading: indicator.count > 1 ? Icon(icon) : null,
      child: indicator.count > 1 ? Text('${indicator.count}') : Icon(icon),
    );
  }
}

class _DueDateDisplay extends StatelessWidget {
  const _DueDateDisplay({
    required this.day,
    required this.today,
    required this.isOverdue,
  });

  final DateTime day;
  final DateTime today;
  final bool isOverdue;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tomorrow = DateTime(today.year, today.month, today.day + 1);
    final yesterday = DateTime(today.year, today.month, today.day - 1);
    final label = switch (day) {
      _ when day == today => l10n.taskBoardDetailToday,
      _ when day == tomorrow => l10n.taskBoardDetailTomorrow,
      _ when day == yesterday => l10n.taskBoardDetailYesterday,
      _ => DateFormat.MMMd(l10n.localeName).format(day),
    };
    return AppBadge(
      variant: isOverdue
          ? AppBadgeVariant.destructive
          : AppBadgeVariant.secondary,
      leading: Icon(isOverdue ? LucideIcons.circleAlert : LucideIcons.calendar),
      child: Text(label),
    );
  }
}
