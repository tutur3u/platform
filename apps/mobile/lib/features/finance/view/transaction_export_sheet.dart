import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/finance/cubit/transaction_list_cubit.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:share_plus/share_plus.dart';

Future<void> showTransactionExport(BuildContext context) async {
  final workspace = context.read<WorkspaceCubit>();
  final actor = context.read<AuthCubit?>();
  final wsId = workspace.state.currentWorkspace?.id;
  if (wsId == null) return;
  final actorId = actor?.state.user?.id;
  final repository = context.read<FinanceRepository>();
  final state = context.read<TransactionListCubit>().state;
  bool active() =>
      context.mounted &&
      workspace.state.currentWorkspace?.id == wsId &&
      actor?.state.user?.id == actorId &&
      canManageFinance(context, 'export_finance_data', listen: false);
  await showAppSheet<void>(
    context: context,
    builder: (_) => _TransactionExportSheet(
      load: (current) => repository.exportFinanceTransactions(
        workspace: wsId,
        filters: state.query,
        search: state.search,
        walletId: state.walletId,
        shouldContinue: () => active() && current(),
      ),
      active: active,
    ),
  );
}

class _TransactionExportSheet extends StatefulWidget {
  const _TransactionExportSheet({required this.load, required this.active});

  final Future<String?> Function(bool Function()) load;
  final bool Function() active;

  @override
  State<_TransactionExportSheet> createState() =>
      _TransactionExportSheetState();
}

class _TransactionExportSheetState extends State<_TransactionExportSheet> {
  Future<String?>? _download;
  bool _sharing = false;

  Future<void> _share(String csv) async {
    if (_sharing || !widget.active()) return;
    final box = context.findRenderObject();
    final origin = box is RenderBox && box.hasSize
        ? box.localToGlobal(Offset.zero) & box.size
        : null;
    setState(() => _sharing = true);
    try {
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile.fromData(utf8.encode(csv), mimeType: 'text/csv')],
          fileNameOverrides: ['transactions.csv'],
          sharePositionOrigin: origin,
        ),
      );
    } on Object {
      if (mounted) {
        showAppToast(context, message: context.l10n.commonSomethingWentWrong);
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return FutureBuilder<String?>(
      future: _download,
      builder: (context, snapshot) {
        final csv = snapshot.data;
        final pending = snapshot.connectionState == ConnectionState.waiting;
        final started = _download != null;
        return AppSheetScaffold(
          title: l10n.financeExportTransactions,
          actions: [
            if (!started || snapshot.hasError)
              AppButton.primary(
                onPressed: () => setState(() {
                  _download = widget.load(() => mounted);
                }),
                child: Text(
                  started ? l10n.commonRetry : l10n.financeExportTransactions,
                ),
              )
            else if (csv != null)
              AppButton.primary(
                onPressed: _sharing ? null : () => _share(csv),
                child: Text(l10n.financeShareCsv),
              ),
          ],
          child: switch ((started, pending, snapshot.hasError, csv)) {
            (false, _, _, _) => Text(l10n.financeExportTransactionsDescription),
            (_, true, _, _) => const AppLoadingIndicator(),
            (_, _, true, _) => AppStateMessage.inline(
              icon: LucideIcons.circleAlert,
              title: l10n.commonSomethingWentWrong,
              tone: AppTone.destructive,
            ),
            (_, _, _, null) => AppStateMessage.inline(
              icon: LucideIcons.receipt,
              title: l10n.financeNoTransactions,
            ),
            _ => Text(l10n.financeExportReady),
          },
        );
      },
    );
  }
}
