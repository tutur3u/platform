part of 'shell_page.dart';

/// Registered page actions and the workspace trigger on root tabs.
class _ShellTrailingActions extends StatelessWidget {
  const _ShellTrailingActions({
    required this.matchedLocation,
    required this.showsWorkspacePicker,
  });

  final String matchedLocation;
  final bool showsWorkspacePicker;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      ShellInjectedActionsHost(matchedLocation: matchedLocation),
      if (showsWorkspacePicker) const ShellWorkspacePicker(),
    ],
  );
}
