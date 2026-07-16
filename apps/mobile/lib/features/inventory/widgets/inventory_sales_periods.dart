import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class InventorySalesPeriodBar extends StatelessWidget {
  const InventorySalesPeriodBar({
    required this.periods,
    required this.selectedPeriodId,
    required this.canManage,
    required this.onChanged,
    required this.onCreate,
    required this.onToggleArchive,
    super.key,
  });

  final List<InventorySalesPeriod> periods;
  final String? selectedPeriodId;
  final bool canManage;
  final ValueChanged<String?> onChanged;
  final VoidCallback onCreate;
  final ValueChanged<InventorySalesPeriod> onToggleArchive;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final selected = periods
        .where((period) => period.id == selectedPeriodId)
        .firstOrNull;

    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: Theme.of(
                    context,
                  ).colorScheme.primary.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(
                  Icons.calendar_view_month_rounded,
                  color: Theme.of(context).colorScheme.primary,
                  size: 20,
                ),
              ),
              const shad.Gap(10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.inventorySalesPeriodsTitle,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      l10n.inventorySalesPeriodsDescription,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              if (canManage) ...[
                if (selected != null)
                  IconButton(
                    tooltip: selected.isArchived
                        ? l10n.inventorySalesPeriodRestore
                        : l10n.inventorySalesPeriodArchive,
                    onPressed: () => onToggleArchive(selected),
                    icon: Icon(
                      selected.isArchived
                          ? Icons.unarchive_outlined
                          : Icons.archive_outlined,
                      size: 20,
                    ),
                  ),
                shad.PrimaryButton(
                  onPressed: onCreate,
                  leading: const Icon(Icons.add_rounded, size: 17),
                  child: Text(l10n.inventorySalesPeriodCreate),
                ),
              ],
            ],
          ),
          const shad.Gap(12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                ChoiceChip(
                  selected: selectedPeriodId == null,
                  onSelected: (_) => onChanged(null),
                  label: Text(l10n.inventorySalesPeriodsAll),
                ),
                ...periods.map(
                  (period) => Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Opacity(
                      opacity: period.isArchived ? 0.65 : 1,
                      child: ChoiceChip(
                        selected: selectedPeriodId == period.id,
                        onSelected: (_) => onChanged(period.id),
                        avatar: period.isArchived
                            ? const Icon(Icons.archive_outlined, size: 15)
                            : null,
                        label: Text('${period.name} · ${period.saleCount}'),
                      ),
                    ),
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

Future<InventorySalesPeriod?> showCreateInventorySalesPeriod({
  required BuildContext context,
  required InventoryRepository repository,
  required String wsId,
}) => showAdaptiveSheet<InventorySalesPeriod>(
  context: context,
  maxDialogWidth: 460,
  builder: (_) => _CreateSalesPeriodDialog(
    repository: repository,
    wsId: wsId,
  ),
);

class _CreateSalesPeriodDialog extends StatefulWidget {
  const _CreateSalesPeriodDialog({
    required this.repository,
    required this.wsId,
  });

  final InventoryRepository repository;
  final String wsId;

  @override
  State<_CreateSalesPeriodDialog> createState() =>
      _CreateSalesPeriodDialogState();
}

class _CreateSalesPeriodDialogState extends State<_CreateSalesPeriodDialog> {
  final _nameController = TextEditingController();
  final _notesController = TextEditingController();
  DateTime? _startsAt;
  DateTime? _endsAt;
  bool _saving = false;

  @override
  void dispose() {
    _nameController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppDialogScaffold(
      title: l10n.inventorySalesPeriodCreateTitle,
      description: l10n.inventorySalesPeriodCreateDescription,
      icon: Icons.calendar_month_outlined,
      maxWidth: 460,
      actions: [
        shad.OutlineButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(),
          child: Text(l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: _saving ? null : () => unawaited(_save()),
          child: _saving
              ? const SizedBox.square(
                  dimension: 16,
                  child: shad.CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(l10n.inventorySalesPeriodCreate),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              labelText: l10n.inventorySalesPeriodName,
              hintText: l10n.inventorySalesPeriodNamePlaceholder,
            ),
            maxLength: 120,
          ),
          const shad.Gap(12),
          Row(
            children: [
              Expanded(
                child: _DateField(
                  label: l10n.inventorySalesPeriodStartsAt,
                  value: _startsAt,
                  onChanged: (value) => setState(() => _startsAt = value),
                ),
              ),
              const shad.Gap(10),
              Expanded(
                child: _DateField(
                  firstDate: _startsAt,
                  label: l10n.inventorySalesPeriodEndsAt,
                  value: _endsAt,
                  onChanged: (value) => setState(() => _endsAt = value),
                ),
              ),
            ],
          ),
          const shad.Gap(12),
          TextField(
            controller: _notesController,
            decoration: InputDecoration(
              labelText: l10n.inventorySalesPeriodNotes,
              hintText: l10n.inventorySalesPeriodNotesPlaceholder,
            ),
            maxLength: 500,
            maxLines: 3,
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      showInventoryToast(
        context,
        context.l10n.inventorySalesPeriodNameRequired,
        destructive: true,
      );
      return;
    }
    if (_startsAt != null && _endsAt != null && _startsAt!.isAfter(_endsAt!)) {
      showInventoryToast(
        context,
        context.l10n.inventorySalesPeriodDateInvalid,
        destructive: true,
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final period = await widget.repository.createSalesPeriod(
        wsId: widget.wsId,
        name: name,
        description: _notesController.text.trim().isEmpty
            ? null
            : _notesController.text.trim(),
        startsAt: _startsAt,
        endsAt: _endsAt,
      );
      if (mounted) Navigator.of(context).pop(period);
    } on Exception catch (error) {
      if (mounted) {
        showInventoryToast(context, error.toString(), destructive: true);
        setState(() => _saving = false);
      }
    }
  }
}

class _DateField extends StatelessWidget {
  const _DateField({
    required this.label,
    required this.value,
    required this.onChanged,
    this.firstDate,
  });

  final String label;
  final DateTime? value;
  final ValueChanged<DateTime?> onChanged;
  final DateTime? firstDate;

  @override
  Widget build(BuildContext context) => OutlinedButton(
    onPressed: () async {
      final now = DateTime.now();
      final picked = await showDatePicker(
        context: context,
        firstDate: firstDate ?? DateTime(now.year - 5),
        lastDate: DateTime(now.year + 15),
        initialDate: value ?? firstDate ?? now,
      );
      if (picked != null) onChanged(picked);
    },
    style: OutlinedButton.styleFrom(
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.labelSmall),
        const SizedBox(height: 2),
        Text(
          value == null
              ? context.l10n.inventorySalesPeriodNoDate
              : DateFormat.yMMMd(
                  Localizations.localeOf(context).toLanguageTag(),
                ).format(value!),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    ),
  );
}
