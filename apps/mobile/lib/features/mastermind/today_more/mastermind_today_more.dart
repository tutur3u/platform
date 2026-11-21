import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_action_sheet.dart';
import 'package:mobile/features/mastermind/today_more/mastermind_today_more_item.dart';
import 'package:mobile/features/mastermind/today_more/mastermind_today_more_items.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';

/// Today's navbar overflow. It registers one More action beside Today's other
/// navbar actions while at least one of [items] is visible, and opens them as
/// a sheet on the root navigator so the dock never covers it.
class MastermindTodayMoreMenu extends StatelessWidget {
  const MastermindTodayMoreMenu({
    this.items = mastermindTodayMoreItems,
    this.open,
    super.key,
  });

  final List<MastermindTodayMoreItem> items;

  /// Navigates to a chosen item's route; pushes it by default.
  final void Function(BuildContext context, String route)? open;

  Future<void> _show(
    BuildContext context,
    List<MastermindTodayMoreItem> shown,
  ) async {
    final l10n = context.l10n;
    final picked = await showAppActionSheet<MastermindTodayMoreItem>(
      context: context,
      title: l10n.navMore,
      useRootNavigator: true,
      actions: [
        for (final item in shown)
          AppSheetAction(
            key: ValueKey('mastermind-today-more-${item.id}'),
            label: item.label(l10n),
            icon: item.icon,
            value: item,
          ),
      ],
    );
    if (picked == null || !context.mounted) return;
    final navigate = open ?? (context, route) => unawaited(context.push(route));
    navigate(context, picked.route);
  }

  @override
  Widget build(BuildContext context) {
    final shown = [
      for (final item in items)
        if (item.visible?.call(context) ?? true) item,
    ];
    return ShellChromeActions(
      ownerId: 'mastermind-today-more',
      locations: const {Routes.mastermind},
      actions: [
        if (shown.isNotEmpty)
          ShellActionSpec(
            id: 'mastermind-today-more',
            icon: LucideIcons.ellipsis,
            tooltip: context.l10n.navMore,
            callbackToken: shown.map((item) => item.id).join(','),
            onPressed: () => unawaited(_show(context, shown)),
          ),
      ],
    );
  }
}
