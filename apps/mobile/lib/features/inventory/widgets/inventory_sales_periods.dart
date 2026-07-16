import 'package:flutter/material.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

export 'inventory_sales_period_editor.dart';

class InventorySalesPeriodBar extends StatelessWidget {
  const InventorySalesPeriodBar({
    required this.periods,
    required this.selectedPeriodId,
    required this.canManage,
    required this.onChanged,
    required this.onCreate,
    required this.onEdit,
    required this.onToggleArchive,
    super.key,
  });

  final List<InventorySalesPeriod> periods;
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
    final header = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: theme.colorScheme.primary.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Icon(
            Icons.calendar_view_month_rounded,
            color: theme.colorScheme.primary,
            size: 20,
          ),
        ),
        const shad.Gap(11),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.inventorySalesPeriodsTitle,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const shad.Gap(2),
              Text(
                l10n.inventorySalesPeriodsDescription,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  height: 1.35,
                ),
              ),
            ],
          ),
        ),
      ],
    );

    final actions = Wrap(
      alignment: WrapAlignment.end,
      spacing: 8,
      runSpacing: 8,
      children: [
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
        shad.PrimaryButton(
          onPressed: onCreate,
          size: shad.ButtonSize.small,
          leading: const Icon(Icons.add_rounded, size: 17),
          child: Text(l10n.inventorySalesPeriodCreate),
        ),
      ],
    );

    return FinancePanel(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final isCompact = constraints.maxWidth < 430;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (isCompact) ...[
                header,
                if (canManage) ...[const shad.Gap(12), actions],
              ] else
                Row(
                  children: [
                    Expanded(child: header),
                    if (canManage) ...[const shad.Gap(16), actions],
                  ],
                ),
              const shad.Gap(14),
              DropdownButtonFormField<String>(
                key: ValueKey(selectedPeriodId),
                initialValue: selectedPeriodId ?? '',
                selectedItemBuilder: (context) {
                  final labelWidth = (constraints.maxWidth - 96).clamp(
                    120.0,
                    double.infinity,
                  );
                  return [
                    SizedBox(
                      width: labelWidth,
                      child: Text(
                        l10n.inventorySalesPeriodsAll,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    ...periods.map(
                      (period) => SizedBox(
                        width: labelWidth,
                        child: Text(
                          '${period.name} · ${period.saleCount}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                  ];
                },
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
          );
        },
      ),
    );
  }
}
