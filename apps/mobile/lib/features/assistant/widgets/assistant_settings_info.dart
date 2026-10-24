import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantSettingsInfo extends StatelessWidget {
  const AssistantSettingsInfo({
    required this.title,
    required this.description,
    super.key,
  });
  final String title;
  final String description;
  @override
  Widget build(BuildContext context) => AppIconButton(
    tooltip: context.l10n.assistantSettingInfo(title),
    icon: const Icon(LucideIcons.info),
    onPressed: () => showAppDialog<void>(
      context: context,
      builder: (context) => AppDialog(
        title: title,
        content: SingleChildScrollView(child: Text(description)),
        actions: [
          AppButton.ghost(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(context.l10n.commonDone),
          ),
        ],
      ),
    ),
  );
}
