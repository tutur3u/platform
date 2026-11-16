part of 'shell_page.dart';

/// Trailing top bar actions: the page's registered actions, plus the
/// workspace avatar on Home. Notifications and You live in the dock.
class _ShellTrailingActions extends StatelessWidget {
  const _ShellTrailingActions({required this.matchedLocation});

  final String matchedLocation;

  @override
  Widget build(BuildContext context) {
    final actions = ShellInjectedActionsHost(matchedLocation: matchedLocation);
    if (matchedLocation != Routes.home) return actions;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [actions, const ShellWorkspaceAvatarButton()],
    );
  }
}
