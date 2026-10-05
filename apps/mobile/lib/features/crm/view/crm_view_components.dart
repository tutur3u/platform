part of 'crm_page.dart';

class _CrmPill extends StatelessWidget {
  const _CrmPill({required this.icon, required this.label, this.tint});

  final IconData icon;
  final String label;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final effectiveTint = tint ?? theme.colorScheme.primary;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: effectiveTint.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: effectiveTint.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: effectiveTint),
          const SizedBox(width: 8),
          Text(
            label,
            style: theme.typography.small.copyWith(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _CrmAuditCard extends StatelessWidget {
  const _CrmAuditCard({required this.event});

  final CrmAuditEvent event;

  @override
  Widget build(BuildContext context) {
    final occurredAt = DateFormat.yMMMd().add_Hm().format(
      DateTime.parse(event.occurredAt).toLocal(),
    );
    final theme = shad.Theme.of(context);
    final accent = event.eventKind == 'created'
        ? theme.colorScheme.primary
        : event.eventKind == 'deleted'
        ? theme.colorScheme.destructive
        : theme.colorScheme.primary;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FinancePanel(
        padding: EdgeInsets.zero,
        child: Theme(
          data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
          child: ExpansionTile(
            tilePadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 4,
            ),
            childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
            leading: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(Icons.history_rounded, size: 20, color: accent),
            ),
            title: Text(
              event.summary,
              style: theme.typography.large.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '${event.affectedUser.label}'
                ' • '
                '${event.actor.label}'
                ' • '
                '$occurredAt',
                style: theme.typography.textSmall.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
            ),
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _CrmPill(
                    icon: Icons.event_note_outlined,
                    label: event.eventKind,
                    tint: accent,
                  ),
                  _CrmPill(
                    icon: Icons.cloud_outlined,
                    label: event.source,
                    tint: accent,
                  ),
                ],
              ),
              if (event.fieldChanges.isNotEmpty) ...[
                const SizedBox(height: 12),
                ...event.fieldChanges.map(
                  (change) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 104,
                          child: Text(
                            change.label,
                            style: theme.typography.small.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            '${change.before ?? '-'} → ${change.after ?? '-'}',
                            style: theme.typography.textSmall.copyWith(
                              color: theme.colorScheme.mutedForeground,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
