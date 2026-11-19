import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/finance/wallet_checkpoint.dart';
import 'package:mobile/features/finance/utils/checkpoint_variance.dart';
import 'package:mobile/features/finance/widgets/checkpoint_amounts.dart';
import 'package:mobile/features/finance/widgets/checkpoint_timestamp.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

typedef WalletBalanceReview = ({
  double amount,
  DateTime checkedAt,
  String? note,
});

Future<WalletBalanceReview?> showWalletBalanceReview(
  BuildContext context, {
  required Wallet wallet,
  required String currency,
  WalletCheckpoint? checkpoint,
}) {
  final preferences = context.read<FinancePreferencesCubit?>();
  return showAppSheet(
    context: context,
    builder: (_) {
      final form = _WalletBalanceForm(
        wallet: wallet,
        currency: currency,
        checkpoint: checkpoint,
      );
      return preferences == null
          ? form
          : BlocProvider.value(value: preferences, child: form);
    },
  );
}

class _WalletBalanceForm extends StatefulWidget {
  const _WalletBalanceForm({
    required this.wallet,
    required this.currency,
    required this.checkpoint,
  });

  final Wallet wallet;
  final String currency;
  final WalletCheckpoint? checkpoint;

  @override
  State<_WalletBalanceForm> createState() => _WalletBalanceFormState();
}

class _WalletBalanceFormState extends State<_WalletBalanceForm> {
  final _note = TextEditingController();
  double? _actual;
  DateTime? _checkedAt;

  @override
  void initState() {
    super.initState();
    _actual = widget.checkpoint?.actualBalance;
    _note.text = widget.checkpoint?.note ?? '';
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final checkpoint = widget.checkpoint;
    final actual = _actual;
    final checkedAt = _checkedAt ?? checkpoint?.checkedAt;
    final ledger = _checkedAt == null
        ? checkpoint?.currentLedgerBalance ?? widget.wallet.balance
        : null;
    return AppSheetScaffold(
      title: checkpoint == null
          ? l10n.financeCheckpointsReconcile
          : l10n.financeCheckpointsEdit,
      actions: [
        AppButton.primary(
          onPressed: actual == null
              ? null
              : () {
                  final note = _note.text.trim();
                  Navigator.of(context).pop<WalletBalanceReview>((
                    amount: actual,
                    checkedAt: checkedAt ?? DateTime.now(),
                    note: note.isEmpty ? null : note,
                  ));
                },
          child: Text(
            checkpoint == null
                ? l10n.financeCheckpointsSaveReview
                : l10n.commonSave,
          ),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppLayout.itemGap,
        children: [
          _BalanceInput(
            initial: checkpoint?.actualBalance,
            currency: widget.currency,
            onChanged: (value) => setState(() => _actual = value),
          ),
          if (actual != null && ledger != null)
            CheckpointAmounts(
              actual: actual,
              ledger: ledger,
              variance: checkpointVariance(actual, ledger),
              currency: widget.currency,
            ),
          CheckpointTimestamp(
            value: checkedAt ?? DateTime.now(),
            onChanged: (value) => setState(() => _checkedAt = value),
          ),
          AppTextField(
            controller: _note,
            label: l10n.financeCheckpointsNote,
            placeholder: l10n.financeCheckpointsNotePlaceholder,
            maxLength: 500,
            maxLines: 3,
          ),
        ],
      ),
    );
  }
}

class _BalanceInput extends StatefulWidget {
  const _BalanceInput({
    required this.initial,
    required this.currency,
    required this.onChanged,
  });

  final double? initial;
  final String currency;
  final ValueChanged<double?> onChanged;

  @override
  State<_BalanceInput> createState() => _BalanceInputState();
}

class _BalanceInputState extends State<_BalanceInput> {
  late final _controller = TextEditingController(
    text: widget.initial?.toString() ?? '',
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppTextField(
    controller: _controller,
    label: context.l10n.financeCheckpointsActualBalanceWithCurrency(
      widget.currency,
    ),
    placeholder: context.l10n.financeCheckpointsBalancePlaceholder,
    obscureText: !financeAmountsVisible(context),
    keyboardType: const TextInputType.numberWithOptions(
      decimal: true,
      signed: true,
    ),
    onChanged: (text) => widget.onChanged(parseCheckpointBalance(text)),
  );
}
