import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/utils/finance_invoice_spreadsheet.dart';
import 'package:mobile/features/finance/widgets/finance_workspace_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:share_plus/share_plus.dart';

class FinanceInvoiceExportSheet extends StatefulWidget {
  const FinanceInvoiceExportSheet({
    required this.repository,
    required this.session,
    required this.pending,
    required this.query,
    super.key,
  });

  final FinanceRepository repository;
  final FinanceSheetSession session;
  final bool pending;
  final String query;

  @override
  State<FinanceInvoiceExportSheet> createState() =>
      _FinanceInvoiceExportSheetState();
}

class _FinanceInvoiceExportSheetState extends State<FinanceInvoiceExportSheet> {
  InvoiceSpreadsheetFormat _format = InvoiceSpreadsheetFormat.spreadsheet;
  bool _loading = false;
  bool _error = false;
  List<List<Object?>>? _rows;

  bool _authorized() =>
      mounted &&
      widget.session.allows('view_invoices') &&
      widget.session.allows('export_finance_data');

  Future<void> _export() async {
    if (_loading || !_authorized()) return;
    final format = _format;
    setState(() {
      _loading = true;
      _error = false;
    });
    try {
      final rows =
          _rows ??
          await widget.repository.getInvoiceExportRows(
            workspace: widget.session.workspaceId,
            query: widget.query,
            pending: widget.pending,
            active: _authorized,
          );
      if (!_authorized() || rows == null) return;
      _rows = rows;
      if (rows.length == 1) return;
      final bytes = await compute(encodeInvoiceSpreadsheet, (
        format: format,
        rows: rows,
      ));
      if (!mounted || !_authorized()) return;
      final box = context.findRenderObject();
      final position = box is RenderBox && box.hasSize
          ? box.localToGlobal(Offset.zero) & box.size
          : null;
      final name = widget.pending ? 'pending-invoices' : 'invoices';
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile.fromData(bytes, mimeType: format.mimeType)],
          fileNameOverrides: ['$name.${format.extension}'],
          sharePositionOrigin: position,
        ),
      );
    } on Object {
      if (mounted) setState(() => _error = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.financeExportInvoices,
      actions: [
        AppButton.primary(
          onPressed: _loading ? null : _export,
          child: Text(l10n.financeInvoiceShareFile),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.md,
        children: [
          AppSelect<InvoiceSpreadsheetFormat>(
            title: l10n.financeInvoiceExportFormat,
            options: const [
              AppSelectOption(
                value: InvoiceSpreadsheetFormat.spreadsheet,
                label: 'Excel (.xlsx)',
              ),
              AppSelectOption(
                value: InvoiceSpreadsheetFormat.csv,
                label: 'CSV',
              ),
            ],
            value: _format,
            onChanged: _loading
                ? null
                : (format) => setState(() => _format = format),
          ),
          if (_loading) const AppLoadingIndicator(),
          if (_error)
            AppStateMessage.inline(
              icon: LucideIcons.circleAlert,
              tone: AppTone.destructive,
              title: l10n.financeInvoiceExportError,
            )
          else if (_rows?.length == 1)
            AppStateMessage.inline(
              icon: LucideIcons.receipt,
              title: widget.pending
                  ? l10n.financeInvoiceNoPending
                  : l10n.financeInvoiceEmpty,
            ),
        ],
      ),
    );
  }
}
