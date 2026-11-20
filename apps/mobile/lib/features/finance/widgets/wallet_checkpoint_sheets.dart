import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/finance/wallet_checkpoint.dart';
import 'package:mobile/features/finance/utils/checkpoint_variance.dart';
import 'package:mobile/features/finance/widgets/checkpoint_timestamp.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

typedef WalletCheckpointBatchFormResult = ({
  DateTime checkedAt,
  List<WalletCheckpointBatchEntry> entries,
});

class WalletCheckpointBatchSheet extends StatefulWidget {
  const WalletCheckpointBatchSheet({required this.wallets, super.key});

  final List<Wallet> wallets;

  @override
  State<WalletCheckpointBatchSheet> createState() =>
      _WalletCheckpointBatchSheetState();
}

class _WalletCheckpointBatchSheetState
    extends State<WalletCheckpointBatchSheet> {
  late final Map<String, TextEditingController> _inputs = {
    for (final wallet in widget.wallets) wallet.id: TextEditingController(),
  };
  DateTime? _checkedAt;
  final _note = TextEditingController();

  @override
  void dispose() {
    for (final controller in _inputs.values) {
      controller.dispose();
    }
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final visible = financeAmountsVisible(context);
    final amounts = {
      for (final entry in _inputs.entries)
        if (entry.value.text.trim().isNotEmpty)
          entry.key: parseCheckpointBalance(entry.value.text),
    };
    final valid =
        amounts.isNotEmpty &&
        amounts.length <= 100 &&
        amounts.values.every((amount) => amount != null);
    return AppSheetScaffold(
      title: l10n.financeCheckpointsBatchRecord,
      description: l10n.financeCheckpointsBatchDescription,
      actions: [
        AppButton.primary(
          onPressed: valid ? () => _save(amounts) : null,
          child: Text(l10n.commonSave),
        ),
      ],
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.only(bottom: AppLayout.itemGap),
            child: CheckpointTimestamp(
              value: _checkedAt ?? DateTime.now(),
              onChanged: (value) => setState(() => _checkedAt = value),
            ),
          ),
        ),
        SliverList.builder(
          itemCount: widget.wallets.length,
          itemBuilder: (context, index) {
            final wallet = widget.wallets[index];
            return Padding(
              padding: const EdgeInsets.only(bottom: AppLayout.itemGap),
              child: AppTextField(
                key: ValueKey(wallet.id),
                label: [
                  wallet.name ?? l10n.financeWallet,
                  if (wallet.currency case final currency?) currency,
                ].join(' · '),
                placeholder: l10n.financeCheckpointsBalancePlaceholder,
                obscureText: !visible,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                  signed: true,
                ),
                controller: _inputs[wallet.id],
                helperText: _preview(context, wallet, amounts[wallet.id]),
                onChanged: (_) => setState(() {}),
                errorText:
                    amounts.containsKey(wallet.id) && amounts[wallet.id] == null
                    ? l10n.financeCheckpointsAmountRequired
                    : null,
              ),
            );
          },
        ),
        SliverToBoxAdapter(
          child: AppTextField(
            controller: _note,
            label: l10n.financeCheckpointsSharedNote,
            placeholder: l10n.financeCheckpointsNotePlaceholder,
            maxLength: 500,
            maxLines: 2,
          ),
        ),
      ],
    );
  }

  /// Ledger balance and the variance the entered [actual] would record.
  String? _preview(BuildContext context, Wallet wallet, double? actual) {
    final ledger = wallet.balance;
    final currency = wallet.currency;
    if (actual == null || ledger == null || currency == null) return null;
    return context.l10n.financeCheckpointsLedgerPreview(
      financeMoney(context, ledger, currency),
      financeMoney(
        context,
        checkpointVariance(actual, ledger),
        currency,
        signed: true,
      ),
    );
  }

  void _save(Map<String, double?> amounts) {
    final note = _note.text.trim();
    Navigator.of(context).pop<WalletCheckpointBatchFormResult>((
      checkedAt: _checkedAt ?? DateTime.now(),
      entries: [
        for (final entry in amounts.entries)
          WalletCheckpointBatchEntry(
            walletId: entry.key,
            actualBalance: entry.value!,
            note: note.isEmpty ? null : note,
          ),
      ],
    ));
  }
}
