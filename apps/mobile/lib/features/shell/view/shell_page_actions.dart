part of 'shell_page.dart';

/// Trailing top bar actions: the page's registered actions, plus the bell,
/// You and the workspace avatar on Home.
class _ShellTrailingActions extends StatelessWidget {
  const _ShellTrailingActions({required this.matchedLocation});

  final String matchedLocation;

  @override
  Widget build(BuildContext context) {
    final home = matchedLocation == Routes.home;
    final actions = ShellInjectedActionsHost(
      matchedLocation: matchedLocation,
      includeNotifications: home,
    );
    if (!home) return actions;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const ShellYouButton(),
        actions,
        const ShellWorkspaceAvatarButton(),
      ],
    );
  }
}
