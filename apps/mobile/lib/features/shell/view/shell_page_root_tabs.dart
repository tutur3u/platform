part of 'shell_page.dart';

/// Root destinations, in dock and rail order.
enum ShellRootTab {
  home(Routes.home),
  apps(Routes.apps),
  assistant(Routes.assistant),
  notifications(Routes.notifications),
  profile(Routes.profileRoot);

  const ShellRootTab(this.route);

  final String route;
  ValueKey<String> get key => ValueKey(name);
}

/// The layered layout's Apps layer uses a [GlobalKey].
String _routeForRootKey(Key? key) =>
    ShellRootTab.values.where((tab) => tab.key == key).firstOrNull?.route ??
    (key is GlobalKey ? Routes.apps : Routes.home);

extension _ShellPageRootTabs on _ShellPageState {
  List<shad.NavigationItem> _rootNavItems(AppLocalizations l10n) => [
    for (final tab in ShellRootTab.values) _rootTabNavItem(tab, l10n),
  ];

  shad.NavigationItem _rootTabNavItem(
    ShellRootTab tab,
    AppLocalizations l10n,
  ) => shad.NavigationItem(
    key: tab.key,
    child: _buildCompactNavIcon(
      icon: switch (tab) {
        ShellRootTab.home => LucideIcons.house,
        ShellRootTab.apps => LucideIcons.layoutGrid,
        ShellRootTab.assistant => LucideIcons.sparkles,
        ShellRootTab.notifications => LucideIcons.bell,
        ShellRootTab.profile => LucideIcons.circleUserRound,
      },
      image: switch (tab) {
        ShellRootTab.assistant => NovaLoadingIndicator(
          key: ValueKey(_rootTabReplayTokens[Routes.assistant] ?? 0),
          size: 22,
          repeat: false,
          play: widget.matchedLocation == Routes.assistant,
        ),
        ShellRootTab.notifications when widget.badgeCount != null =>
          ValueListenableBuilder<int>(
            valueListenable: widget.badgeCount!,
            child: const Icon(LucideIcons.bell),
            builder: (context, count, icon) => Stack(
              clipBehavior: Clip.none,
              fit: StackFit.expand,
              children: [
                icon!,
                if (count > 0)
                  const PositionedDirectional(
                    top: -4,
                    end: -4,
                    child: ShellUnreadDot(),
                  ),
              ],
            ),
          ),
        ShellRootTab.profile
            when shellNavigationModeFor(MediaQuery.sizeOf(context)) ==
                ShellNavigationMode.rail =>
          const ProfileNavigationAvatar(),
        _ => null,
      },
      semanticLabel: switch (tab) {
        ShellRootTab.home => l10n.navHome,
        ShellRootTab.assistant => l10n.navMira,
        ShellRootTab.apps => l10n.navApps,
        ShellRootTab.notifications => l10n.navAlerts,
        ShellRootTab.profile => l10n.profileTitle,
      },
    ),
  );

  /// The root destination [location] shows, if it is one.
  ShellRootTab? _rootTabForLocation(String location) => switch (location) {
    Routes.home => ShellRootTab.home,
    Routes.assistant => ShellRootTab.assistant,
    Routes.apps => ShellRootTab.apps,
    Routes.notifications ||
    Routes.notificationsArchive => ShellRootTab.notifications,
    Routes.profileRoot => ShellRootTab.profile,
    _ => null,
  };
}
