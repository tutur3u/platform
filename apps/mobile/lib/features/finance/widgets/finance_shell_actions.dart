import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';

class FinanceAmountVisibilityShellAction extends StatelessWidget {
  const FinanceAmountVisibilityShellAction({
    required this.ownerId,
    required this.locations,
    super.key,
  });

  final String ownerId;
  final Set<String> locations;

  @override
  Widget build(BuildContext context) {
    final showAmounts = context.select<FinancePreferencesCubit, bool>(
      (cubit) => cubit.state.showAmounts,
    );

    return ShellChromeActions(
      ownerId: ownerId,
      locations: locations,
      actions: [
        financeAmountVisibilityAction(
          context,
          showAmounts: showAmounts,
        ),
      ],
    );
  }
}

ShellActionSpec financeAmountVisibilityAction(
  BuildContext context, {
  required bool showAmounts,
  String id = 'finance-amount-visibility',
}) {
  return ShellActionSpec(
    id: id,
    icon: showAmounts
        ? Icons.visibility_outlined
        : Icons.visibility_off_outlined,
    tooltip: showAmounts
        ? context.l10n.financeHideAmounts
        : context.l10n.financeShowAmounts,
    callbackToken: showAmounts,
    highlighted: showAmounts,
    onPressed: () => unawaited(
      context.read<FinancePreferencesCubit>().toggleShowAmounts(),
    ),
  );
}
