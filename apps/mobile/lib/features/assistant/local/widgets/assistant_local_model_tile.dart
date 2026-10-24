import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/widgets/assistant_settings_info.dart';
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
    final status = [
      l10n.assistantLocalSize((model.bytes / (1024 * 1024)).ceil()),
      if (installed)
        l10n.assistantLocalVerified
      else
        l10n.assistantLocalNotDownloaded,
    ].join(' · ');
    final actionLabel = installed
        ? l10n.assistantLocalUse
        : model.requiresLicensedImport
        ? l10n.assistantLocalImport
        : l10n.assistantLocalDownload;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [AppListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(model.name),
      subtitle: Text(status),
      leading: const Icon(LucideIcons.cpu),
      selected: selected,
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (selected)
            Tooltip(
              message: l10n.assistantLocalSelected,
              child: Semantics(
                label: l10n.assistantLocalSelected,
                child: const SizedBox.square(
                  dimension: 44,
                  child: Icon(LucideIcons.circleCheck),
                ),
              ),
            ),
          if (!selected)
            AppIconButton(
              tooltip: actionLabel,
              onPressed: enabled ? (installed ? onSelect : onInstall) : null,
              icon: Icon(
                installed
                    ? LucideIcons.arrowRight
                    : model.requiresLicensedImport
                    ? LucideIcons.fileUp
                    : LucideIcons.download,
              ),
            ),
          AssistantSettingsInfo(
            title: model.name,
            description: status,
            actionsBuilder: (dialogContext) => [
              AppButton.ghost(
                onPressed: onLicense,
                child: Text(l10n.assistantLocalLicense),
              ),
              if (model.requiresLicensedImport)
                AppButton.ghost(
                  onPressed: onSource,
                  child: Text(l10n.assistantLocalDownloadSource),
                ),
            ],
          ),
        ],
      ),
    ),
    if (installed)
      Align(alignment: Alignment.centerRight,
        child: AppIconButton(
          tooltip: l10n.assistantLocalRemove,
          onPressed: canRemove ? onRemove : null,
          icon: const Icon(LucideIcons.trash2),
        ),
      ),
    ],
    );
  }
}
