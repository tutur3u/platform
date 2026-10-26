import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/widgets/assistant_settings_action.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantSettingsInfo extends StatelessWidget {
  const AssistantSettingsInfo({
    required this.title,
    required this.description,
    this.actionsBuilder,
    super.key,
  });
  final String title;
  final String description;
  final List<Widget> Function(BuildContext)? actionsBuilder;
  @override
  Widget build(BuildContext context) => AppIconButton(
    tooltip: context.l10n.assistantSettingInfo(title),
    icon: const Icon(LucideIcons.info),
    onPressed: () => showAppDialog<void>(
      context: context,
      builder: (context) => AppDialog(
        title: title,
        content: Text(description),
        actions: [
          ...?actionsBuilder?.call(context),
          AssistantSettingsAction(
            label: context.l10n.commonDone,
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    ),
  );
}
