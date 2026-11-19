import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/finance/wallet_checkpoint.dart';
import 'package:mobile/features/finance/widgets/checkpoint_amounts.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

typedef WalletAdjustment = ({String? categoryId, String? description});

Future<WalletAdjustment?> showWalletAdjustment(
  BuildContext context, {
  required Wallet wallet,
  required WalletCheckpoint checkpoint,
  required Future<List<TransactionCategory>> categories,
  WalletCheckpointInterval? interval,
}) {
  final preferences = context.read<FinancePreferencesCubit?>();
  return showAppSheet<WalletAdjustment>(
    context: context,
    builder: (_) {
      final sheet = _WalletAdjustmentSheet(
        wallet: wallet,
        checkpoint: checkpoint,
        interval: interval,
        categories: categories,
      );
      return preferences == null
          ? sheet
          : BlocProvider.value(value: preferences, child: sheet);
    },
  );
}

class _WalletAdjustmentSheet extends StatefulWidget {
  const _WalletAdjustmentSheet({
    required this.wallet,
    required this.checkpoint,
    required this.interval,
    required this.categories,
  });

  final Wallet wallet;
  final WalletCheckpoint checkpoint;
  final WalletCheckpointInterval? interval;
  final Future<List<TransactionCategory>> categories;

  @override
  State<_WalletAdjustmentSheet> createState() => _WalletAdjustmentSheetState();
}

class _WalletAdjustmentSheetState extends State<_WalletAdjustmentSheet> {
  final _description = TextEditingController();
  String? _categoryId;

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final checkpoint = widget.checkpoint;
    final interval = widget.interval;
    final variance = interval?.intervalVariance ?? checkpoint.currentVariance;
    return AppSheetScaffold(
      title: interval == null
          ? l10n.financeCheckpointsReconcile
          : l10n.financeCheckpointsWindows,
      actions: [
        AppButton.primary(
          onPressed: () {
            final description = _description.text.trim();
            Navigator.of(context).pop<WalletAdjustment>((
              categoryId: _categoryId,
              description: description.isEmpty ? null : description,
            ));
          },
          child: Text(l10n.financeCheckpointsCreateAdjustment),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppLayout.itemGap,
        children: [
          if (interval == null)
            CheckpointAmounts(
              actual: checkpoint.actualBalance,
              ledger: checkpoint.currentLedgerBalance,
              variance: variance,
              currency: checkpoint.currency,
            )
          else
            CheckpointAmounts(
              actual: interval.actualDelta,
              ledger: interval.ledgerDelta,
              variance: variance,
              currency: checkpoint.currency,
              isInterval: true,
            ),
          FutureBuilder(
            future: widget.categories,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const AppSkeletonRows(count: 1);
              }
              return AppSelect<String>(
                options: [
                  AppSelectOption(
                    value: '',
                    label: l10n.financeCheckpointsNoCategory,
                  ),
                  for (final category
                      in snapshot.data ?? const <TransactionCategory>[])
                    if (category.isExpense == null ||
                        category.isExpense == (variance < 0))
                      AppSelectOption(
                        value: category.id,
                        label: category.name ?? category.id,
                      ),
                ],
                value: _categoryId,
                onChanged: (id) {
                  if (mounted) {
                    setState(() => _categoryId = id.isEmpty ? null : id);
                  }
                },
                title: l10n.financeCheckpointsCategory,
                placeholder: l10n.financeCheckpointsNoCategory,
              );
            },
          ),
          AppTextField(
            controller: _description,
            label: l10n.financeCheckpointsDescriptionLabel,
            placeholder: l10n.financeCheckpointsReconcileDefaultDescription(
              widget.wallet.name ?? l10n.financeWallet,
            ),
            maxLength: 500,
          ),
        ],
      ),
    );
  }
}
