import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/view/assistant_settings_route_frame.dart';

class AssistantSettingsEditorPage extends StatelessWidget {
  const AssistantSettingsEditorPage({
    required this.title,
    required this.child,
    super.key,
  });
  final String title;
  final Widget child;
  @override
  Widget build(BuildContext context) =>
      AssistantSettingsRouteFrame(title: title, child: child);
}
