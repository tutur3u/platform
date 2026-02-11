import 'dart:async';

import 'package:flutter/material.dart'
    hide NavigationBar, NavigationBarTheme, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/cubit/app_tab_state.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Shell layout with bottom navigation bar.
///
/// Wraps all tab-level routes via GoRouter's [ShellRoute].
class ShellPage extends StatefulWidget {
  const ShellPage({required this.child, super.key});

  final Widget child;

  @override
  State<ShellPage> createState() => _ShellPageState();
}

class _ShellPageState extends State<ShellPage> {
  DateTime? _lastTapTime;
  int? _lastTabIndex;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final selectedIndex = _calculateSelectedIndex(context);
    final theme = shad.Theme.of(context);

    return shad.Scaffold(
      footers: [
        BlocBuilder<AppTabCubit, AppTabState>(
          builder: (context, state) {
            final selectedModule = state.hasSelection
                ? AppRegistry.moduleById(state.selectedId)
                : null;
            final appsLabel = selectedModule?.label(l10n) ?? l10n.navApps;
            final appsIcon = selectedModule?.icon ?? Icons.apps_outlined;

            return shad.NavigationBar(
              index: selectedIndex,
              onSelected: (index) => _onItemTapped(index, context, state),
              labelType: shad.NavigationLabelType.all,
              children: [
                shad.NavigationItem(
                  label: Text(
                    l10n.navHome,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.p.copyWith(
                      fontSize: 10,
                      fontWeight: FontWeight.normal,
                    ),
                  ),
                  child: const Icon(Icons.home_outlined),
                ),
                shad.NavigationItem(
                  label: Text(
                    appsLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.p.copyWith(
                      fontSize: 10,
                      fontWeight: FontWeight.normal,
                    ),
                  ),
                  child: Icon(appsIcon),
                ),
                shad.NavigationItem(
                  label: Text(
                    l10n.settingsProfile,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.p.copyWith(
                      fontSize: 10,
                      fontWeight: FontWeight.normal,
                    ),
                  ),
                  child: const Icon(Icons.person_outline),
                ),
              ],
            );
          },
        ),
      ],
      child: widget.child,
    );
  }

  static int _calculateSelectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;

    if (location.startsWith(Routes.apps)) return 1;
    if (location.startsWith(Routes.profileRoot)) return 2;
    if (location.startsWith(Routes.settings)) return 2;
    if (AppRegistry.moduleFromLocation(location) != null) return 1;
    return 0; // home
  }

  Future<void> _onItemTapped(
    int index,
    BuildContext context,
    AppTabState state,
  ) async {
    final now = DateTime.now();
    final isDoubleTap =
        _lastTabIndex == index &&
        _lastTapTime != null &&
        now.difference(_lastTapTime!) < const Duration(milliseconds: 300);

    _lastTapTime = now;
    _lastTabIndex = index;

    if (index == 1 && isDoubleTap) {
      await context.read<AppTabCubit>().clearSelection();
      if (context.mounted) context.go(Routes.apps);
      return;
    }

    final appRoute = state.hasSelection
        ? AppRegistry.moduleById(state.selectedId)?.route
        : null;
    final route = switch (index) {
      1 => appRoute ?? Routes.apps,
      2 => Routes.profileRoot,
      _ => Routes.home,
    };
    if (context.mounted) context.go(route);
    await SettingsRepository().setLastTabRoute(route);
  }
}
