import 'package:flutter/material.dart'
    hide Scaffold, NavigationBar, NavigationBarTheme;
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Shell layout with bottom navigation bar.
///
/// Wraps all tab-level routes via GoRouter's [ShellRoute].
class ShellPage extends StatelessWidget {
  const ShellPage({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final selectedIndex = _calculateSelectedIndex(context);

    return shad.Scaffold(
      footers: [
        shad.NavigationBar(
          index: selectedIndex,
          onSelected: (index) => _onItemTapped(index, context),
          labelType: shad.NavigationLabelType.all,
          children: [
            shad.NavigationItem(
              label: Text(l10n.navHome),
              child: const Icon(Icons.home_outlined),
            ),
            shad.NavigationItem(
              label: Text(l10n.navTasks),
              child: const Icon(Icons.check_box_outlined),
            ),
            shad.NavigationItem(
              label: Text(l10n.navCalendar),
              child: const Icon(Icons.calendar_today_outlined),
            ),
            shad.NavigationItem(
              label: Text(l10n.navFinance),
              child: const Icon(Icons.account_balance_wallet_outlined),
            ),
            shad.NavigationItem(
              label: Text(l10n.navTimer),
              child: const Icon(Icons.timer_outlined),
            ),
            shad.NavigationItem(
              label: Text(l10n.navSettings),
              child: const Icon(Icons.settings_outlined),
            ),
          ],
        ),
      ],
      child: child,
    );
  }

  static int _calculateSelectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;

    if (location.startsWith(Routes.tasks)) return 1;
    if (location.startsWith(Routes.calendar)) return 2;
    if (location.startsWith(Routes.finance)) return 3;
    if (location.startsWith(Routes.timer)) return 4;
    if (location.startsWith(Routes.settings)) return 5;
    return 0; // home
  }

  void _onItemTapped(int index, BuildContext context) {
    switch (index) {
      case 0:
        context.go(Routes.home);
        return;
      case 1:
        context.go(Routes.tasks);
        return;
      case 2:
        context.go(Routes.calendar);
        return;
      case 3:
        context.go(Routes.finance);
        return;
      case 4:
        context.go(Routes.timer);
        return;
      case 5:
        context.go(Routes.settings);
        return;
    }
  }
}
