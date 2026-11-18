import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// What every hidden amount shows in place of its figure.
const financeMaskedAmountPlaceholder = '••••••';

/// [value] when amounts are visible, otherwise the shared placeholder.
String maskFinanceValue(
  String value, {
  required bool showAmounts,
  String placeholder = financeMaskedAmountPlaceholder,
}) {
  return showAmounts ? value : placeholder;
}

/// Whether finance amounts are shown on this device. Amounts stay hidden
/// until the person turns them on with the eye toggle in the finance top bar,
/// and when no preference store is in scope.
bool financeAmountsVisible(BuildContext context) =>
    context.select<FinancePreferencesCubit?, bool>(
      (cubit) => cubit?.state.showAmounts ?? false,
    );

/// [amount] formatted in [currency]. [signed] prefixes `+` for money in and
/// the minus sign for money out; otherwise only negatives carry a sign.
String formatFinanceAmount(
  double amount,
  String currency, {
  bool signed = false,
  bool approximate = false,
}) {
  final sign = amount < 0 ? '−' : (signed && amount > 0 ? '+' : '');
  final prefix = approximate ? '≈ ' : '';
  final formatted = currency.toUpperCase() == 'VND'
      ? '${NumberFormat.decimalPattern('vi_VN').format(amount.abs().round())} ₫'
      : formatCurrency(amount.abs(), currency);
  return '$prefix$sign$formatted';
}

/// [formatFinanceAmount] behind the device's amount visibility.
String financeMoney(
  BuildContext context,
  double amount,
  String currency, {
  bool signed = false,
  bool approximate = false,
}) => maskFinanceValue(
  formatFinanceAmount(
    amount,
    currency,
    signed: signed,
    approximate: approximate,
  ),
  showAmounts: financeAmountsVisible(context),
);

/// A money figure in tabular mono type that follows the device's amount
/// visibility. Hidden amounts read as "Hidden amount" to screen readers.
class FinanceAmountText extends StatelessWidget {
  const FinanceAmountText(
    this.amount,
    this.currency, {
    this.signed = false,
    this.approximate = false,
    this.style,
    this.color,
    this.textAlign,
    super.key,
  });

  final double amount;
  final String currency;
  final bool signed;
  final bool approximate;
  final TextStyle? style;
  final Color? color;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    final visible = financeAmountsVisible(context);
    final text = formatFinanceAmount(
      amount,
      currency,
      signed: signed,
      approximate: approximate,
    );
    final base = style ?? context.tokens.typography.numeric;
    return Semantics(
      label: visible ? text : context.l10n.financeHiddenAmount,
      excludeSemantics: true,
      child: Text(
        visible ? text : financeMaskedAmountPlaceholder,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        textAlign: textAlign,
        style: base.copyWith(
          color: color,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}
