part of 'crm_page.dart';

class _CrmAuditCard extends StatelessWidget {
  const _CrmAuditCard({required this.event});

  final CrmAuditEvent event;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    final occurred = DateTime.tryParse(event.occurredAt)?.toLocal();
    final when = occurred == null
        ? l10n.crmAuditUnknownTime
        : DateFormat.yMMMd(locale).add_jm().format(occurred);
    final tone = switch (event.eventKind) {
      'deleted' => AppTone.destructive,
      'created' || 'reactivated' => AppTone.success,
      _ => AppTone.info,
    };
    final actor =
        event.actor.name ??
        event.actor.email ??
        event.actor.id ??
        event.actor.workspaceUserId ??
        event.actor.authUid ??
        l10n.crmAuditSystem;
    final subject = event.affectedUser.label;
    final action = event.eventKind == 'archive_until_changed'
        ? l10n.crmArchivedUntil
        : _crmAuditEventLabel(context, event.eventKind);
    final tokens = AppTokens.of(context);
    final changes = event.fieldChanges.where(
      (change) =>
          (change.before ?? '') != (change.after ?? '') &&
          (event.changedFields.isEmpty ||
              event.changedFields.contains(change.field)),
    );

    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppIconTile(icon: LucideIcons.history, tone: tone),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.crmAuditActivity(action, subject),
                      style: tokens.typography.base.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      l10n.crmAuditBy(actor),
                      style: tokens.typography.small,
                    ),
                    Text(
                      when,
                      style: tokens.typography.small.copyWith(
                        color: tokens.colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          for (final change in changes) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              switch (change.field) {
                'full_name' => l10n.crmFullName,
                'display_name' => l10n.crmDisplayName,
                'phone' => l10n.crmPhone,
                'address' => l10n.crmAddress,
                'birthday' => l10n.crmBirthday,
                'note' => l10n.crmNote,
                'archived_until' => l10n.crmArchivedUntil,
                _ => change.label,
              },
              style: tokens.typography.small.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: _value(change.before, l10n.crmAuditEmptyValue),
                  ),
                  const WidgetSpan(
                    alignment: PlaceholderAlignment.middle,
                    child: Padding(
                      padding: EdgeInsets.symmetric(horizontal: AppSpacing.xs),
                      child: Icon(LucideIcons.arrowRight, size: 14),
                    ),
                  ),
                  TextSpan(text: _value(change.after, l10n.crmAuditEmptyValue)),
                ],
              ),
              semanticsLabel: l10n.crmAuditValueChange(
                _value(change.before, l10n.crmAuditEmptyValue),
                _value(change.after, l10n.crmAuditEmptyValue),
              ),
              style: tokens.typography.small,
            ),
          ],
        ],
      ),
    );
  }

  String _value(String? value, String empty) =>
      value == null || value.isEmpty ? empty : value;
}
