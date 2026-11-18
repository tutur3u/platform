part of 'shell_page.dart';

/// Trailing top bar actions: the page's registered actions only. The
/// workspace lives on Home's chip and the More sheet; Notifications and You
/// live in the dock.
class _ShellTrailingActions extends StatelessWidget {
  const _ShellTrailingActions({required this.matchedLocation});

  final String matchedLocation;

  @override
  Widget build(BuildContext context) =>
      ShellInjectedActionsHost(matchedLocation: matchedLocation);
}
