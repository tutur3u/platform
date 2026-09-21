part of 'shell_page.dart';

class _ShellTrailingActions extends StatelessWidget {
  const _ShellTrailingActions({required this.matchedLocation});

  final String matchedLocation;

  @override
  Widget build(BuildContext context) =>
      ShellInjectedActionsHost(matchedLocation: matchedLocation);
}
