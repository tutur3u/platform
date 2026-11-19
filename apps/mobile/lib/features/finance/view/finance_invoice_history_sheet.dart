import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/finance_invoice.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/widgets/finance_directory_sheet.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_workspace_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

class FinanceInvoiceHistorySheet extends StatefulWidget {
  const FinanceInvoiceHistorySheet({
    required this.session,
    required this.repository,
    required this.onRestore,
    super.key,
  });

  final FinanceSheetSession session;
  final FinanceRepository repository;
  final VoidCallback onRestore;

  @override
  State<FinanceInvoiceHistorySheet> createState() =>
      _FinanceInvoiceHistorySheetState();
}

class _FinanceInvoiceHistorySheetState
    extends State<FinanceInvoiceHistorySheet> {
  bool _deleted = false;
  bool _restoring = false;

  bool _canRestore() =>
      widget.session.allows('create_invoices') &&
      widget.session.allows('delete_invoices') &&
      widget.session.allows('view_invoices');

  Future<void> _restore(
    FinanceInvoiceEvent entry,
    Future<void> Function() reload,
  ) async {
    if (_restoring || !_canRestore()) return;
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: context.l10n.financeInvoiceRestore,
      message: context.l10n.financeInvoiceRestoreHelp,
      confirmLabel: context.l10n.financeInvoiceRestore,
      cancelLabel: context.l10n.commonCancel,
    );
    if (!confirmed || !mounted || !_canRestore()) return;
    setState(() => _restoring = true);
    try {
      await widget.repository.restoreInvoice(
        widget.session.workspaceId,
        entry.invoiceId,
      );
      if (!mounted || !widget.session.active) return;
      widget.onRestore();
      await reload();
    } on Object {
      if (mounted && widget.session.active) {
        showAppToast(context, message: context.l10n.financeInvoiceRestoreError);
        await reload();
      }
    } finally {
      if (mounted) setState(() => _restoring = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return FinanceDirectorySheet<FinanceInvoiceEvent>(
      key: ValueKey(_deleted),
      title: l10n.financeInvoiceHistory,
      empty: l10n.financeInvoiceNoHistory,
      sections: AppSegmentedControl<bool>(
        segments: [
          AppSegment(value: false, label: l10n.financeAll),
          AppSegment(value: true, label: l10n.financeInvoiceDeletedOnly),
        ],
        selected: _deleted,
        onChanged: (value) => setState(() => _deleted = value),
      ),
      fetch: (query, page) => widget.repository.getInvoiceHistory(
        widget.session.workspaceId,
        query: query,
        page: page,
        deleted: _deleted,
      ),
      row: (context, entry, reload) {
        final amount = entry.amount;
        final currency = entry.currency;
        return AppRichRow(
          key: ValueKey(entry.id),
          title: entry.customer ?? l10n.financeInvoice,
          subtitle: [
            switch (entry.action) {
              'INSERT' => l10n.financeInvoiceCreatedEvent,
              'UPDATE' => l10n.financeInvoiceUpdatedEvent,
              'DELETE' => l10n.financeInvoiceDeletedOnly,
              'RESTORE' => l10n.financeInvoiceRestoredEvent,
              _ => l10n.financeInvoiceHistory,
            },
            if (entry.at != null)
              DateFormat.yMMMd(
                l10n.localeName,
              ).add_jm().format(entry.at!.toLocal()),
            if (entry.actor != null) entry.actor!,
          ].join(' · '),
          trailing: amount != null && currency != null
              ? FinanceAmountText(amount, currency)
              : null,
          trailingCaption: entry.canRestore && _canRestore()
              ? l10n.financeInvoiceRestore
              : null,
          onTap: entry.canRestore && _canRestore() && !_restoring
              ? () => _restore(entry, reload)
              : null,
        );
      },
    );
  }
}
