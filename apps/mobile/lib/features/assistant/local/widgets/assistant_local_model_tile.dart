import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/l10n/l10n.dart';

/// One downloadable on-device model: its size and state, one primary
/// action on the trailing edge, and the rest (license, publisher, remove)
/// in a menu opened from the row.
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
    this.progress,
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

  /// Download or import progress shown under the row while it runs.
  final Widget? progress;

  Future<void> _showActions(BuildContext context) async {
    final l10n = context.l10n;
    final action = await showAppActionSheet<String>(
      context: context,
      title: model.name,
      actions: [
        if (installed && !selected)
          AppSheetAction(
            icon: LucideIcons.circleCheck,
            tone: AppTone.primary,
            label: l10n.assistantLocalUse,
            value: 'use',
            enabled: enabled,
          ),
        if (!installed)
          AppSheetAction(
            icon: model.requiresLicensedImport
                ? LucideIcons.fileUp
                : LucideIcons.download,
            tone: AppTone.primary,
            label: model.requiresLicensedImport
                ? l10n.assistantLocalImport
                : l10n.assistantLocalDownload,
            value: 'install',
            enabled: enabled,
          ),
        AppSheetAction(
          icon: LucideIcons.scale,
          label: l10n.assistantLocalLicense,
          value: 'license',
        ),
        if (model.requiresLicensedImport)
          AppSheetAction(
            icon: LucideIcons.externalLink,
            label: l10n.assistantLocalDownloadSource,
            value: 'source',
          ),
        if (installed)
          AppSheetAction(
            icon: LucideIcons.trash2,
            label: l10n.assistantLocalRemove,
            value: 'remove',
            destructive: true,
            enabled: canRemove,
          ),
      ],
    );
    switch (action) {
      case 'use':
        onSelect();
      case 'install':
        onInstall();
      case 'license':
        onLicense();
      case 'source':
        onSource();
      case 'remove':
        onRemove();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = AppTokens.of(context).colorScheme;
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
      children: [
        Semantics(
          selected: selected,
          child: AppGroupedRow(
            key: ValueKey('assistant-local-model-${model.id}'),
            leading: AppIconTile(
              icon: LucideIcons.cpu,
              tone: selected ? AppTone.primary : AppTone.neutral,
            ),
            title: Text(model.name),
            subtitle: Text(status),
            trailing: selected
                ? Tooltip(
                    message: l10n.assistantLocalSelected,
                    child: Semantics(
                      label: l10n.assistantLocalSelected,
                      child: SizedBox.square(
                        dimension: 44,
                        child: Icon(LucideIcons.check, color: c.primary),
                      ),
                    ),
                  )
                : AppIconButton(
                    tooltip: actionLabel,
                    onPressed: enabled
                        ? (installed ? onSelect : onInstall)
                        : null,
                    icon: Icon(
                      installed
                          ? LucideIcons.circleCheck
                          : model.requiresLicensedImport
                          ? LucideIcons.fileUp
                          : LucideIcons.download,
                    ),
                  ),
            onTap: () => _showActions(context),
          ),
        ),
        if (progress case final progress?)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppLayout.rowDividerInset,
              0,
              AppLayout.rowHorizontalPadding,
              AppSpacing.md,
            ),
            child: progress,
          ),
      ],
    );
  }
}
