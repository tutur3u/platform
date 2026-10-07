import 'package:flutter/material.dart';
import 'package:mobile/features/settings/view/settings_route_frame.dart';

/// Settings editors use the same title/back chrome as the hub. Keep the whole
/// frame above the keyboard so its floating back action remains reachable.
class AssistantSettingsEditorPage extends StatelessWidget {
  const AssistantSettingsEditorPage({
    required this.title,
    required this.child,
    super.key,
  });
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
    child: MediaQuery.removeViewInsets(
      context: context,
      removeBottom: true,
      child: SettingsRouteFrame(title: title, child: child),
    ),
  );
}
