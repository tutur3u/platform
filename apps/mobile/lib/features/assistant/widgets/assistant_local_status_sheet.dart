import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

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
      icon: LucideIcons.cpu,
      title: preparing
          ? l10n.assistantLocalLoading
          : l10n.assistantLocalMode(
              modelLabel ?? l10n.assistantLocalSelectionUnknown,
            ),
      description: l10n.assistantLocalHelp,
      actions: [
        AppButton.primary(
          key: const ValueKey('assistant-local-status-manage'),
          onPressed: onManage,
          child: Text(l10n.assistantLocalModeAction),
        ),
      ],
      child: switch (notice) {
        final text? => AppGroupedCard(
          children: [
            AppStateMessage.inline(
              icon: LucideIcons.triangleAlert,
              tone: AppTone.warning,
              title: text,
            ),
          ],
        ),
        null => const SizedBox.shrink(),
      },
    );
  }
}
