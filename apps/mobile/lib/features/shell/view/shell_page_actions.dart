part of 'shell_page.dart';

/// Registered page actions and the workspace trigger on its two root tabs.
class _ShellTrailingActions extends StatelessWidget {
  const _ShellTrailingActions({
    required this.matchedLocation,
    required this.dockPageAction,
  });

  final String matchedLocation;
  final bool dockPageAction;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      ShellInjectedActionsHost(
        matchedLocation: matchedLocation,
        dockPageAction: dockPageAction,
      ),
      if (matchedLocation == Routes.home ||
          matchedLocation == Routes.profileRoot)
        const ShellWorkspacePicker(),
    ],
  );
}
