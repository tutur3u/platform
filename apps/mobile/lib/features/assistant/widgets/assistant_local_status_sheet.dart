import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// On-device status: the active model, any notice, and the way to settings.
/// The privacy note stays in the scrolling body so large text never pushes
/// the header and action out of a small sheet.
class AssistantLocalStatusSheet extends StatelessWidget {
  const AssistantLocalStatusSheet({
    required this.preparing,
    required this.onManage,
    this.modelLabel,
    this.notice,
    super.key,
  });
  final String? modelLabel;
  final String? notice;
  final bool preparing;
  final VoidCallback onManage;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.assistantLocalHeaderReady,
      actions: [
        AppButton.primary(
          key: const ValueKey('assistant-local-status-manage'),
          onPressed: onManage,
          child: Text(l10n.assistantLocalModeAction),
        ),
      ],
      child: AppGroupedSection(
        footer: l10n.assistantLocalHelp,
        children: [
          AppGroupedRow(
            leading: const AppIconTile(
              icon: LucideIcons.cpu,
              tone: AppTone.primary,
            ),
            title: Text(
              preparing
                  ? l10n.assistantLocalLoading
                  : modelLabel ?? l10n.assistantLocalSelectionUnknown,
            ),
          ),
          if (notice case final text?)
            AppStateMessage.inline(
              icon: LucideIcons.triangleAlert,
              tone: AppTone.warning,
              title: text,
            ),
        ],
      ),
    );
  }
}
