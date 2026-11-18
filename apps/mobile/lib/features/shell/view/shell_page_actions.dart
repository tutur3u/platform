part of 'shell_page.dart';

/// Registered page actions and the workspace trigger on its two root tabs.
class _ShellTrailingActions extends StatelessWidget {
  const _ShellTrailingActions({required this.matchedLocation});

  final String matchedLocation;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      ShellInjectedActionsHost(matchedLocation: matchedLocation),
      if (matchedLocation == Routes.home ||
          matchedLocation == Routes.profileRoot)
        const ShellWorkspacePicker(),
    ],
  );
}
