import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/components/app_icon_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
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
    final showAmounts = financeAmountsVisible(context);

    return ShellChromeActions(
      ownerId: ownerId,
      locations: locations,
      actions: [
        financeAmountVisibilityAction(context, showAmounts: showAmounts),
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
    icon: showAmounts ? LucideIcons.eye : LucideIcons.eyeOff,
    tooltip: showAmounts
        ? context.l10n.financeHideAmounts
        : context.l10n.financeShowAmounts,
    callbackToken: showAmounts,
    highlighted: !showAmounts,
    onPressed: () => _toggleFinanceAmounts(context),
  );
}

void _toggleFinanceAmounts(BuildContext context) {
  final preferences = context.read<FinancePreferencesCubit?>();
  if (preferences != null) unawaited(preferences.toggleShowAmounts());
}

class FinanceAmountVisibilityButton extends StatelessWidget {
  const FinanceAmountVisibilityButton({super.key});

  @override
  Widget build(BuildContext context) {
    final showAmounts = financeAmountsVisible(context);
    if (context.read<FinancePreferencesCubit?>() == null) {
      return const SizedBox.shrink();
    }
    final action = financeAmountVisibilityAction(
      context,
      showAmounts: showAmounts,
    );
    return AppIconButton(
      icon: Icon(action.icon),
      tooltip: action.tooltip!,
      onPressed: action.onPressed,
    );
  }
}
