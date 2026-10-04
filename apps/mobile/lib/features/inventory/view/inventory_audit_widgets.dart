part of 'inventory_audit_logs_page.dart';

class _AuditEntryCard extends StatelessWidget {
  const _AuditEntryCard({required this.entry, required this.onTap});

  final InventoryAuditLogEntry entry;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final changeCount = entry.fieldChanges.isNotEmpty
        ? entry.fieldChanges.length
        : entry.changedFields.length;

    return FinancePanel(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  _displaySummary(context, entry),
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const shad.Gap(12),
              Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: theme.colorScheme.mutedForeground,
              ),
            ],
          ),
          const shad.Gap(8),
          Text(
            [
              _labelForEntityKind(context, entry.entityKind),
              _labelForEventKind(context, entry.eventKind),
              if (entry.actorDisplayName?.trim().isNotEmpty ?? false)
                entry.actorDisplayName!.trim(),
            ].join(' • '),
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _AuditBadge(
                label: changeCount > 0
                    ? context.l10n.inventoryAuditChanges(changeCount)
                    : context.l10n.inventoryAuditNoChanges,
                color: palette.accent,
              ),
              ...entry.fieldChanges
                  .take(2)
                  .map(
                    (change) => _AuditBadge(
                      label: _prettyFieldLabel(change.label, change.field),
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
            ],
          ),
          const shad.Gap(10),
          Text(
            DateFormat.yMMMd().add_jm().format(entry.occurredAt.toLocal()),
            style: theme.typography.xSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ],
      ),
    );
  }
}

class _AuditEntryDetailDialog extends StatelessWidget {
  const _AuditEntryDetailDialog({required this.entry});

  final InventoryAuditLogEntry entry;

  @override
  Widget build(BuildContext context) {
    final fieldChanges = entry.fieldChanges;

    return AppDialogScaffold(
      title: _displaySummary(context, entry),
      icon: Icons.history_rounded,
      maxWidth: 680,
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(context.l10n.commonCancel),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _AuditBadge(
                label: _labelForEntityKind(context, entry.entityKind),
                color: FinancePalette.of(context).accent,
              ),
              _AuditBadge(
                label: _labelForEventKind(context, entry.eventKind),
                color: FinancePalette.of(context).positive,
              ),
            ],
          ),
          const shad.Gap(16),
          _AuditDetailRow(
            label: context.l10n.inventoryAuditActorLabel,
            value: entry.actorDisplayName?.trim().isNotEmpty == true
                ? entry.actorDisplayName!.trim()
                : '—',
          ),
          _AuditDetailRow(
            label: context.l10n.inventoryAuditOccurredAt,
            value: DateFormat.yMMMd().add_jm().format(
              entry.occurredAt.toLocal(),
            ),
          ),
          if (entry.entityLabel?.trim().isNotEmpty ?? false)
            _AuditDetailRow(
              label: context.l10n.inventoryAuditSubject,
              value: entry.entityLabel!.trim(),
            ),
          const shad.Gap(16),
          FinanceSectionHeader(title: context.l10n.inventoryAuditChangedFields),
          const shad.Gap(12),
          if (fieldChanges.isEmpty)
            Text(context.l10n.inventoryAuditNoChanges)
          else
            ...fieldChanges.map(
              (change) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: FinancePanel(
                  radius: 18,
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _prettyFieldLabel(change.label, change.field),
                        style: shad.Theme.of(context).typography.small.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const shad.Gap(10),
                      _AuditDiffRow(
                        label: context.l10n.inventoryAuditBefore,
                        value: change.before,
                      ),
                      const shad.Gap(6),
                      _AuditDiffRow(
                        label: context.l10n.inventoryAuditAfter,
                        value: change.after,
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

class _AuditDetailRow extends StatelessWidget {
  const _AuditDetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 112,
            child: Text(
              label,
              style: shad.Theme.of(context).typography.textSmall.copyWith(
                color: shad.Theme.of(context).colorScheme.mutedForeground,
              ),
            ),
          ),
          const shad.Gap(12),
          Expanded(
            child: Text(
              value,
              style: shad.Theme.of(
                context,
              ).typography.small.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

class _AuditDiffRow extends StatelessWidget {
  const _AuditDiffRow({required this.label, required this.value});

  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: shad.Theme.of(context).typography.xSmall.copyWith(
            color: shad.Theme.of(context).colorScheme.mutedForeground,
          ),
        ),
        const shad.Gap(4),
        Text(
          value?.trim().isNotEmpty == true ? value!.trim() : '—',
          style: shad.Theme.of(context).typography.textSmall,
        ),
      ],
    );
  }
}

class _AuditBadge extends StatelessWidget {
  const _AuditBadge({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Text(
        label,
        style: theme.typography.xSmall.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

String _labelForEntityKind(BuildContext context, String value) {
  return switch (value) {
    'owner' => context.l10n.inventoryManageOwners,
    'product' => context.l10n.inventoryProductsLabel,
    'stock' => context.l10n.inventoryProductInventory,
    'category' => context.l10n.inventoryManageCategories,
    'unit' => context.l10n.inventoryManageUnits,
    'warehouse' => context.l10n.inventoryManageWarehouses,
    'sale' => context.l10n.inventorySalesLabel,
    _ => _prettyFieldLabel('', value),
  };
}

String _labelForEventKind(BuildContext context, String value) {
  return switch (value) {
    'created' => context.l10n.inventoryAuditEventCreated,
    'updated' => context.l10n.inventoryAuditEventUpdated,
    'archived' => context.l10n.inventoryAuditEventArchived,
    'reactivated' => context.l10n.inventoryAuditEventReactivated,
    'deleted' => context.l10n.inventoryAuditEventDeleted,
    'sale_created' => context.l10n.inventoryAuditEventSaleCreated,
    _ => _prettyFieldLabel('', value),
  };
}

String _displaySummary(BuildContext context, InventoryAuditLogEntry entry) {
  final trimmed = entry.summary.trim();
  if (trimmed.isNotEmpty) {
    return trimmed;
  }

  if (entry.entityLabel?.trim().isNotEmpty ?? false) {
    return '${_labelForEventKind(context, entry.eventKind)} '
        '${entry.entityLabel!.trim()}';
  }

  return [
    _labelForEventKind(context, entry.eventKind),
    _labelForEntityKind(context, entry.entityKind),
  ].join(' ');
}

String _prettyFieldLabel(String label, String fallback) {
  final source = label.trim().isNotEmpty ? label : fallback;
  final normalized = source.replaceAll('_', ' ').trim();
  if (normalized.isEmpty) {
    return fallback;
  }

  return normalized[0].toUpperCase() + normalized.substring(1);
}
