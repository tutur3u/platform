import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/utils/money_lover_import.dart';
import 'package:mobile/features/finance/widgets/finance_workspace_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

Future<void> openFinanceImport(
  BuildContext context,
  Future<void> Function() refresh,
) async {
  final session = FinanceSheetSession(context);
  final repository = context.read<FinanceRepository>();
  await session.run(
    (_) => _TransactionImportSheet(session: session, repository: repository),
  );
  if (context.mounted) await refresh();
}

class _TransactionImportSheet extends StatefulWidget {
  const _TransactionImportSheet({
    required this.session,
    required this.repository,
  });

  final FinanceSheetSession session;
  final FinanceRepository repository;

  @override
  State<_TransactionImportSheet> createState() =>
      _TransactionImportSheetState();
}

class _TransactionImportSheetState extends State<_TransactionImportSheet> {
  String _delimiter = '\t';
  String? _fileName;
  List<Map<String, String>> _rows = [];
  FinanceImportResult? _result;
  bool _picking = false;
  bool _importing = false;
  bool _invalid = false;
  bool _uncertain = false;
  bool _walletMismatch = false;

  Future<void> _pick() async {
    if (_picking) return;
    setState(() {
      _picking = true;
      _invalid = false;
      _walletMismatch = false;
    });
    try {
      final file = await FilePicker.pickFile(
        type: FileType.custom,
        allowedExtensions: const ['csv', 'tsv', 'txt'],
      );
      if (file == null || !mounted || !widget.session.active) return;
      if (await file.length() > moneyLoverMaximumBytes) {
        throw const FormatException('File too large.');
      }
      final bytes = await file.readAsBytes();
      final rows = parseMoneyLoverFile(bytes, _delimiter);
      if (!mounted || !widget.session.active) return;
      setState(() {
        _fileName = file.name;
        _rows = rows;
      });
    } on Object {
      if (mounted) {
        setState(() {
          _fileName = null;
          _rows = [];
          _invalid = true;
        });
      }
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  Future<void> _import() async {
    if (_rows.isEmpty ||
        _importing ||
        !widget.session.allows('manage_finance')) {
      return;
    }
    setState(() => _importing = true);
    try {
      final result = await widget.repository.importMoneyLover(
        workspace: widget.session.workspaceId,
        rows: _rows,
        active: () => mounted && widget.session.allows('manage_finance'),
      );
      if (mounted && widget.session.active) setState(() => _result = result);
    } on FinanceImportWalletMismatch {
      if (mounted) setState(() => _walletMismatch = true);
    } on Object {
      if (mounted) setState(() => _uncertain = true);
    } finally {
      if (mounted) setState(() => _importing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final result = _result;
    final locked = _importing || result != null || _uncertain;
    return AppSheetScaffold(
      title: l10n.financeImportMoneyLover,
      actions: [
        AppButton.primary(
          onPressed: locked || _rows.isEmpty || _picking || _walletMismatch
              ? null
              : _import,
          child: Text(l10n.financeImportConfirm),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.md,
        children: [
          if (!locked) ...[
            Text(l10n.financeImportHelp),
            AppSelect<String>(
              title: l10n.financeImportDelimiter,
              options: [
                AppSelectOption(value: '\t', label: l10n.financeImportTab),
                AppSelectOption(value: ',', label: l10n.financeImportComma),
                AppSelectOption(value: ';', label: l10n.financeImportSemicolon),
              ],
              value: _delimiter,
              onChanged: _picking
                  ? null
                  : (value) {
                      if (!mounted) return;
                      setState(() {
                        _delimiter = value;
                        _rows = [];
                        _fileName = null;
                        _invalid = false;
                        _walletMismatch = false;
                      });
                    },
            ),
            AppButton.secondary(
              onPressed: _picking ? null : _pick,
              leading: const Icon(LucideIcons.fileUp),
              child: Text(_fileName ?? l10n.financeImportPickFile),
            ),
            if (_rows.isNotEmpty)
              AppRichRow(title: l10n.financeImportPreview(_rows.length)),
          ],
          if (_importing || _picking) const AppLoadingIndicator(),
          if (_invalid || _uncertain || _walletMismatch)
            AppStateMessage.inline(
              icon: LucideIcons.circleAlert,
              title: _uncertain
                  ? l10n.financeImportUnconfirmed
                  : _walletMismatch
                  ? l10n.financeImportWalletMismatch
                  : l10n.financeImportInvalid,
            ),
          if (result != null)
            AppStateMessage.inline(
              icon: result.errors == 0
                  ? LucideIcons.check
                  : LucideIcons.circleAlert,
              title: l10n.financeImportResult(result.imported, result.total),
              message: result.errors > 0 ? l10n.financeImportUnconfirmed : null,
            ),
        ],
      ),
    );
  }
}
