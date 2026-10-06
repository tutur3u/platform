import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantLocalModelTile extends StatelessWidget {
  const AssistantLocalModelTile({
    required this.model,
    required this.installed,
    required this.selected,
    required this.enabled,
    required this.canRemove,
    required this.onInstall,
    required this.onSelect,
    required this.onRemove,
    required this.onLicense,
    required this.onSource,
    super.key,
  });
  final AssistantLocalModel model;
  final bool installed;
  final bool selected;
  final bool enabled;
  final bool canRemove;
  final VoidCallback onInstall;
  final VoidCallback onSelect;
  final VoidCallback onRemove;
  final VoidCallback onLicense;
  final VoidCallback onSource;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: Text(model.name),
            subtitle: Text(
              [
                l10n.assistantLocalSize((model.bytes / (1024 * 1024)).ceil()),
                if (installed)
                  l10n.assistantLocalVerified
                else
                  l10n.assistantLocalNotDownloaded,
                if (selected) l10n.assistantLocalSelected,
              ].join(' · '),
            ),
            leading: const Icon(Icons.memory_rounded),
            trailing: selected
                ? const Icon(Icons.check_circle_outline_rounded)
                : null,
            selected: selected,
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (installed) ...[
                FilledButton.tonal(
                  onPressed: enabled ? onSelect : null,
                  child: Text(l10n.assistantLocalUse),
                ),
                TextButton(
                  onPressed: canRemove ? onRemove : null,
                  child: Text(l10n.assistantLocalRemove),
                ),
              ] else
                FilledButton.tonal(
                  onPressed: enabled ? onInstall : null,
                  child: Text(
                    model.requiresLicensedImport
                        ? l10n.assistantLocalImport
                        : l10n.assistantLocalDownload,
                  ),
                ),
              TextButton(
                onPressed: onLicense,
                child: Text(l10n.assistantLocalLicense),
              ),
              if (model.requiresLicensedImport)
                TextButton(
                  onPressed: onSource,
                  child: Text(l10n.assistantLocalDownloadSource),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
