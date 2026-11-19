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

/// The screen's primary create action. It takes the dock's priority slot
/// beside navigation, and falls back to a filled top-bar button where the
/// dock has no room for it.
ShellActionSpec financeCreateAction({
  required String id,
  required String tooltip,
  required VoidCallback? onPressed,
  IconData icon = AppIcons.add,
}) => ShellActionSpec(
  id: id,
  icon: icon,
  tooltip: tooltip,
  onPressed: onPressed,
  enabled: onPressed != null,
  filled: true,
  inDock: true,
);

/// Search as a top-bar icon. While [active] the shell swaps its title for
/// the query field (with its own close control); a kept query stays
/// highlighted on the icon.
ShellActionSpec financeSearchAction({
  required String id,
  required bool active,
  required String hint,
  required TextEditingController controller,
  required VoidCallback onOpen,
  required VoidCallback onClose,
  ValueChanged<String>? onChanged,
  bool hasQuery = false,
}) => ShellActionSpec(
  id: id,
  icon: AppIcons.search,
  tooltip: hint,
  onPressed: active ? onClose : onOpen,
  callbackToken: (active, hasQuery),
  highlighted: active || hasQuery,
  searchController: active ? controller : null,
  searchHint: hint,
  onSearchChanged: onChanged,
  onCloseSearch: onClose,
);
