import 'package:flutter/material.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

export 'inventory_sales_period_editor.dart';

class InventorySalesPeriodBar extends StatelessWidget {
  const InventorySalesPeriodBar({
    required this.periods,
    required this.workspaceId,
    required this.selectedPeriodId,
    required this.canManage,
    required this.onChanged,
    required this.onCreate,
    required this.onEdit,
    required this.onToggleArchive,
    super.key,
  });

  final List<InventorySalesPeriod> periods;
  final String workspaceId;
  final String? selectedPeriodId;
  final bool canManage;
  final ValueChanged<String?> onChanged;
  final VoidCallback onCreate;
  final ValueChanged<InventorySalesPeriod> onEdit;
  final ValueChanged<InventorySalesPeriod> onToggleArchive;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final selected = periods
        .where((period) => period.id == selectedPeriodId)
        .firstOrNull;

    final theme = Theme.of(context);
    final header = Text(
      l10n.inventorySalesPeriodsTitle,
      style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
    );

    final actions = Wrap(
      spacing: 8,
      runSpacing: 8,
      children:
          [
                if (selected != null)
                  shad.OutlineButton(
                    onPressed: () => onEdit(selected),
                    size: shad.ButtonSize.small,
                    leading: const Icon(Icons.edit_outlined, size: 16),
                    child: Text(l10n.inventorySalesPeriodEdit),
                  ),
                if (selected != null)
                  shad.OutlineButton(
                    onPressed: () => onToggleArchive(selected),
                    size: shad.ButtonSize.small,
                    leading: Icon(
                      selected.isArchived
                          ? Icons.unarchive_outlined
                          : Icons.archive_outlined,
                      size: 16,
                    ),
                    child: Text(
                      selected.isArchived
                          ? l10n.inventorySalesPeriodRestore
                          : l10n.inventorySalesPeriodArchive,
                    ),
                  ),
                shad.OutlineButton(
                  onPressed: onCreate,
                  size: shad.ButtonSize.small,
                  leading: const Icon(Icons.add_rounded, size: 17),
                  child: Text(l10n.inventorySalesPeriodCreate),
                ),
              ]
              .map(
                (action) => ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 48),
                  child: action,
                ),
              )
              .toList(),
    );

    return PendingSyncFrame(
      workspaceId: workspaceId,
      entityId: selectedPeriodId ?? '',
      feature: 'inventory',
      child: FinancePanel(
        padding: const EdgeInsets.all(14),
        radius: 18,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            header,
            if (canManage) ...[const shad.Gap(12), actions],
            const shad.Gap(14),
            DropdownButtonFormField<String>(
              key: ValueKey(selectedPeriodId),
              initialValue: selectedPeriodId ?? '',
              isExpanded: true,
              items: [
                DropdownMenuItem<String>(
                  value: '',
                  child: Text(l10n.inventorySalesPeriodsAll),
                ),
                ...periods.map(
                  (period) => DropdownMenuItem<String>(
                    value: period.id,
                    child: Text(
                      '${period.name} · ${period.saleCount}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: period.isArchived
                          ? theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            )
                          : null,
                    ),
                  ),
                ),
              ],
              onChanged: (value) =>
                  onChanged(value == null || value.isEmpty ? null : value),
              decoration: InputDecoration(
                labelText: l10n.inventorySalesPeriodAssignmentLabel,
                prefixIcon: const Icon(Icons.event_note_outlined, size: 19),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
