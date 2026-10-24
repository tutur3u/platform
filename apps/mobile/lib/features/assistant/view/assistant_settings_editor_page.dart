import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';

class AssistantSettingsEditorPage extends StatelessWidget {
  const AssistantSettingsEditorPage({
    required this.title,
    required this.child,
    super.key,
  });
  final String title;
  final Widget child;
  @override
  Widget build(BuildContext context) => AppSheetScaffold(
    title: title,
    slivers: [SliverFillRemaining(child: child)],
  );
}
