import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Future<InventorySalesPeriod?> showCreateInventorySalesPeriod({
  required BuildContext context,
  required InventoryRepository repository,
  required String wsId,
}) => showInventorySalesPeriodEditor(
  context: context,
  repository: repository,
  wsId: wsId,
);

Future<InventorySalesPeriod?> showInventorySalesPeriodEditor({
  required BuildContext context,
  required InventoryRepository repository,
  required String wsId,
  InventorySalesPeriod? period,
}) => showAdaptiveSheet<InventorySalesPeriod>(
  context: context,
  maxDialogWidth: 460,
  builder: (_) => _SalesPeriodEditor(
    period: period,
    repository: repository,
    wsId: wsId,
  ),
);

class _SalesPeriodEditor extends StatefulWidget {
  const _SalesPeriodEditor({
    required this.repository,
    required this.wsId,
    this.period,
  });

  final InventorySalesPeriod? period;
  final InventoryRepository repository;
  final String wsId;

  @override
  State<_SalesPeriodEditor> createState() => _SalesPeriodEditorState();
}

class _SalesPeriodEditorState extends State<_SalesPeriodEditor> {
  late final TextEditingController _nameController;
  late final TextEditingController _notesController;
  DateTime? _startsAt;
  DateTime? _endsAt;
  bool _saving = false;

  bool get _isEditing => widget.period != null;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.period?.name ?? '');
    _notesController = TextEditingController(
      text: widget.period?.description ?? '',
    );
    _startsAt = widget.period?.startsAt;
    _endsAt = widget.period?.endsAt;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final action = _isEditing
        ? l10n.inventorySalesPeriodSave
        : l10n.inventorySalesPeriodCreate;
    return AppDialogScaffold(
      title: _isEditing
          ? l10n.inventorySalesPeriodEditTitle
          : l10n.inventorySalesPeriodCreateTitle,
      description: _isEditing
          ? l10n.inventorySalesPeriodEditDescription
          : l10n.inventorySalesPeriodCreateDescription,
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
              : Text(action),
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
          LayoutBuilder(
            builder: (context, constraints) {
              final fields = [
                _DateField(
                  label: l10n.inventorySalesPeriodStartsAt,
                  value: _startsAt,
                  onChanged: (value) => setState(() => _startsAt = value),
                ),
                _DateField(
                  firstDate: _startsAt,
                  label: l10n.inventorySalesPeriodEndsAt,
                  value: _endsAt,
                  onChanged: (value) => setState(() => _endsAt = value),
                ),
              ];
              if (constraints.maxWidth < 360) {
                return Column(
                  children: [fields.first, const shad.Gap(10), fields.last],
                );
              }
              return Row(
                children: [
                  Expanded(child: fields.first),
                  const shad.Gap(10),
                  Expanded(child: fields.last),
                ],
              );
            },
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
      final description = _notesController.text.trim();
      final period = _isEditing
          ? await widget.repository.updateSalesPeriod(
              wsId: widget.wsId,
              periodId: widget.period!.id,
              name: name,
              description: description.isEmpty ? null : description,
              startsAt: _startsAt,
              endsAt: _endsAt,
            )
          : await widget.repository.createSalesPeriod(
              wsId: widget.wsId,
              name: name,
              description: description.isEmpty ? null : description,
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
