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
class ShellPage extends StatelessWidget {
  const ShellPage({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final selectedIndex = _calculateSelectedIndex(context);
    final theme = shad.Theme.of(context);

    return shad.Scaffold(
      footers: [
        BlocBuilder<AppTabCubit, AppTabState>(
          builder: (context, state) {
            final appsLabel = state.hasSelection
                ? AppRegistry.moduleById(state.selectedId)?.label(l10n) ??
                      l10n.navApps
                : l10n.navApps;
            return shad.NavigationBar(
              index: selectedIndex,
              onSelected: (index) => _onItemTapped(index, context),
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
                  child: const Icon(Icons.apps_outlined),
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
      child: child,
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

  void _onItemTapped(int index, BuildContext context) {
    final route = switch (index) {
      1 => Routes.apps,
      2 => Routes.profileRoot,
      _ => Routes.home,
    };
    context.go(route);
    unawaited(SettingsRepository().setLastTabRoute(route));
  }
}
