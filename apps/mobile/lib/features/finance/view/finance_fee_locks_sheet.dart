import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/finance_invoice.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/widgets/finance_directory_sheet.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_workspace_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

class FinanceFeeLocksSheet extends StatefulWidget {
  const FinanceFeeLocksSheet({
    required this.session,
    required this.repository,
    super.key,
  });

  final FinanceSheetSession session;
  final FinanceRepository repository;

  @override
  State<FinanceFeeLocksSheet> createState() => _FinanceFeeLocksSheetState();
}

class _FinanceFeeLocksSheetState extends State<FinanceFeeLocksSheet> {
  DateTime _date = DateTime.now();
  String get _month => DateFormat('yyyy-MM', 'en').format(_date);

  Future<void> _pickMonth() async {
    final date = await showAppDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2000),
      lastDate: DateTime(DateTime.now().year + 5, 12, 31),
    );
    if (mounted && date != null) setState(() => _date = date);
  }

  Future<void> _open(
    FinanceFeeLockRow row,
    Future<void> Function() reload,
  ) async {
    final updated = await widget.session.open<bool>(
      context,
      (_) => _FeeLockEditor(
        row: row,
        month: _month,
        session: widget.session,
        repository: widget.repository,
      ),
    );
    if (mounted && updated == true && widget.session.active) await reload();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final month = _month;
    return FinanceDirectorySheet<FinanceFeeLockRow>(
      key: ValueKey(month),
      title: l10n.financeFeeLocks,
      empty: l10n.financeFeeLocksEmpty,
      sections: AppRichRow(
        title: l10n.financeMonth,
        subtitle: DateFormat.yMMMM(l10n.localeName).format(_date),
        onTap: _pickMonth,
      ),
      fetch: (query, page) => widget.repository.getFeeLocks(
        widget.session.workspaceId,
        month: month,
        query: query,
        page: page,
      ),
      row: (context, row, reload) => AppRichRow(
        key: ValueKey(row.studentId),
        title: row.student,
        subtitle: _status(l10n, row.status),
        trailing: row.lockId == null
            ? FinanceAmountText(row.amount, row.currency)
            : null,
        onTap: () => _open(row, reload),
      ),
    );
  }
}

String _status(AppLocalizations l10n, String? status) => switch (status) {
  'draft' => l10n.financeFeeLockDraft,
  'locked' => l10n.financeFeeLockLocked,
  _ => l10n.financeFeeLockNone,
};

class _FeeLockEditor extends StatefulWidget {
  const _FeeLockEditor({
    required this.row,
    required this.month,
    required this.session,
    required this.repository,
  });

  final FinanceFeeLockRow row;
  final String month;
  final FinanceSheetSession session;
  final FinanceRepository repository;

  @override
  State<_FeeLockEditor> createState() => _FeeLockEditorState();
}

class _FeeLockEditorState extends State<_FeeLockEditor> {
  late Future<FinanceFeeLockDetail> _detail = _load();
  final _notes = TextEditingController();
  final _reason = TextEditingController();
  final _quantities = <int, double?>{};
  bool _busy = false;
  bool _failed = false;

  Future<FinanceFeeLockDetail> _load() async {
    final row = widget.row;
    final id = row.lockId;
    final detail = id == null
        ? (
            status: null,
            version: null,
            currency: row.currency,
            note: '',
            lines: row.baseline,
          )
        : await widget.repository.getFeeLock(widget.session.workspaceId, id);
    if (mounted) _notes.text = detail.note;
    return detail;
  }

  @override
  void dispose() {
    _notes.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _write(String permission, Future<void> Function() run) async {
    if (_busy || !widget.session.allows(permission)) return;
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      await run();
      if (mounted && widget.session.active) Navigator.of(context).pop(true);
    } on Object {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _lock(FinanceFeeLockDetail detail) async {
    final l10n = context.l10n;
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: l10n.financeFeeLockConfirm,
      message: l10n.financeFeeLockConfirmHelp,
      confirmLabel: l10n.financeFeeLockConfirm,
      cancelLabel: l10n.commonCancel,
    );
    if (!mounted || !confirmed) return;
    await _write(
      'create_invoices',
      () => widget.repository.changeFeeLock(
        widget.session.workspaceId,
        widget.row.lockId!,
        version: detail.version!,
        reopenReason: null,
      ),
    );
  }

  Future<void> _save(FinanceFeeLockDetail detail) => _write(
    'create_invoices',
    () => widget.repository.saveFeeLockDraft(
      widget.session.workspaceId,
      student: widget.row.studentId,
      month: widget.month,
      version: detail.version,
      note: _notes.text.trim(),
      lines: [
        for (final (index, line) in detail.lines.indexed)
          line.toDraft(
            quantity: _quantities[index] ?? line.quantity,
            editedReason: _reason.text.trim(),
          ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) => FutureBuilder(
    future: _detail,
    builder: (context, snapshot) {
      final l10n = context.l10n;
      final detail = snapshot.data;
      if (snapshot.connectionState != ConnectionState.done || detail == null) {
        return AppSheetScaffold(
          title: widget.row.student,
          child: snapshot.connectionState != ConnectionState.done
              ? const AppSkeletonRows()
              : AppStateMessage.inline(
                  icon: LucideIcons.circleAlert,
                  title: l10n.commonSomethingWentWrong,
                  actionLabel: l10n.commonRetry,
                  onAction: () => setState(() => _detail = _load()),
                ),
        );
      }
      final locked = detail.status == 'locked';
      final canEdit = !locked && widget.session.allows('create_invoices');
      final canReopen = locked && widget.session.allows('update_invoices');
      final editsValid =
          _quantities.values.every(
            (value) =>
                value != null &&
                value.isFinite &&
                value > 0 &&
                value <= 100000 &&
                value == double.parse(value.toStringAsFixed(3)),
          ) &&
          (_quantities.isEmpty || _reason.text.trim().isNotEmpty);
      return AppSheetScaffold(
        title: widget.row.student,
        actions: [
          if (canEdit)
            AppButton.primary(
              onPressed: _busy || _failed || !editsValid || detail.lines.isEmpty
                  ? null
                  : () => _save(detail),
              child: Text(l10n.commonSave),
            ),
          if (canEdit && detail.status == 'draft')
            AppButton.secondary(
              onPressed:
                  _busy ||
                      _failed ||
                      _quantities.isNotEmpty ||
                      _notes.text.trim() != detail.note
                  ? null
                  : () => _lock(detail),
              child: Text(l10n.financeFeeLockConfirm),
            ),
          if (canReopen)
            AppButton.primary(
              onPressed: _busy || _failed || _reason.text.trim().isEmpty
                  ? null
                  : () => _write(
                      'update_invoices',
                      () => widget.repository.changeFeeLock(
                        widget.session.workspaceId,
                        widget.row.lockId!,
                        version: detail.version!,
                        reopenReason: _reason.text.trim(),
                      ),
                    ),
              child: Text(l10n.financeCheckpointReopen),
            ),
        ],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: AppSpacing.md,
          children: [
            AppRichRow(title: _status(l10n, detail.status)),
            if (_failed)
              AppStateMessage.inline(
                icon: LucideIcons.circleAlert,
                title: l10n.financeFeeLockChanged,
                actionLabel: l10n.commonRefresh,
                onAction: () async {
                  if (mounted) Navigator.of(context).pop(true);
                },
              ),
            if (detail.lines.isEmpty)
              AppStateMessage.inline(
                icon: LucideIcons.listChecks,
                title: l10n.financeFeeLockNoLines,
              ),
            for (final (i, line) in detail.lines.indexed)
              AppGroupedCard(
                children: [
                  AppRichRow(
                    title: line.label,
                    trailing: FinanceAmountText(line.amount, detail.currency),
                  ),
                  if (canEdit && line.kind == 'tuition')
                    AppTextField(
                      label: l10n.financeFeeLockSessions,
                      placeholder: NumberFormat.decimalPattern(
                        l10n.localeName,
                      ).format(line.quantity),
                      enabled: !_busy && !_failed,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      onChanged: (text) => setState(() {
                        if (text.trim().isEmpty) {
                          _quantities.remove(i);
                        } else {
                          _quantities[i] = double.tryParse(
                            text.trim().replaceAll(',', '.'),
                          );
                        }
                      }),
                    ),
                ],
              ),
            AppTextField(
              controller: _notes,
              label: l10n.financeInvoiceNotes,
              enabled: canEdit && !_busy && !_failed,
              maxLines: 3,
              maxLength: 2000,
              onChanged: (_) => setState(() {}),
            ),
            if (canReopen || (canEdit && _quantities.isNotEmpty))
              AppTextField(
                controller: _reason,
                label: l10n.financeFeeLockReason,
                enabled: !_busy && !_failed,
                maxLines: 2,
                maxLength: 500,
                onChanged: (_) => setState(() {}),
              ),
          ],
        ),
      );
    },
  );
}
