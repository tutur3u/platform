import 'package:flutter/material.dart';
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
  Widget build(BuildContext context) => IconButton(
    tooltip: context.l10n.assistantSettingInfo(title),
    icon: const Icon(Icons.info_outline_rounded),
    onPressed: () => showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(child: Text(description)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(context.l10n.commonDone),
          ),
        ],
      ),
    ),
  );
}
