part of 'crm_page.dart';

class _CrmAuditCard extends StatelessWidget {
  const _CrmAuditCard({required this.event});

  final CrmAuditEvent event;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final occurred = DateTime.tryParse(event.occurredAt)?.toLocal();
    final when = occurred == null
        ? event.occurredAt
        : DateFormat.yMMMd().add_Hm().format(occurred);
    final tone = event.eventKind == 'deleted'
        ? AppTone.destructive
        : event.eventKind == 'created'
        ? AppTone.success
        : AppTone.info;
    return AppDisclosure(
      leading: AppIconTile(icon: LucideIcons.history, tone: tone),
      title: Text(event.summary),
      children: [
        Text(
          '${event.affectedUser.label} · ${event.actor.label} · $when',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: tokens.typography.small.copyWith(
            color: tokens.colorScheme.mutedForeground,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        AppBadge(
          variant: tone == AppTone.destructive
              ? AppBadgeVariant.destructive
              : AppBadgeVariant.secondary,
          child: Text(event.eventKind),
        ),
        for (final change in event.fieldChanges)
          AppKeyValueRow(
            label: change.label,
            value: '${change.before ?? '-'} → ${change.after ?? '-'}',
          ),
      ],
    );
  }
}
