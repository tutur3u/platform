import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_config.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_startup_diagnostics.dart';
import 'package:mobile/features/assistant/widgets/assistant_status_badge.dart';
import 'package:mobile/features/workspace/widgets/workspace_tier_badge.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantLiveInfoSheetBody extends StatelessWidget {
  const AssistantLiveInfoSheetBody({
    required this.liveUiState,
    required this.liveState,
    required this.onClose,
    this.onPrimaryAction,
    super.key,
  });

  final AssistantLiveUiState liveUiState;
  final AssistantLiveState liveState;
  final VoidCallback onClose;
  final Future<void> Function()? onPrimaryAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    return AppSheetScaffold(
      icon: _headerIcon(liveUiState.kind),
      title: l10n.assistantLiveTitle,
      actions: [
        if (onPrimaryAction case final onPrimaryAction?)
          AppButton.primary(
            onPressed: () async => await onPrimaryAction(),
            child: Text(l10n.assistantLiveConnect),
          )
        else
          AppButton.secondary(
            onPressed: onClose,
            child: Text(l10n.assistantLiveInfoDismiss),
          ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: AssistantStatusBadge(
              label: liveUiState.statusLabel(l10n),
              color: _toneColor(theme, liveUiState.tone),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            liveUiState.detailLabel(l10n, liveState),
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              height: 1.45,
            ),
          ),
          const SizedBox(height: AppLayout.sectionGap),
          AppGroupedSection(
            caption: l10n.assistantLiveInfoAccessHeading,
            dividerInset: AppLayout.rowHorizontalPadding,
            children: [
              AppGroupedRow(
                title: Text(
                  l10n.assistantLiveWorkspaceTierLabel(
                    normalizeWorkspaceTier(liveUiState.workspaceTier),
                  ),
                ),
                trailing: WorkspaceTierBadge(tier: liveUiState.workspaceTier),
              ),
              AppGroupedRow(
                title: Text(l10n.assistantSourceLabel),
                subtitle: Text(
                  liveUiState.creditSource == AssistantCreditSource.personal
                      ? l10n.assistantSourcePersonal
                      : l10n.assistantSourceWorkspace,
                ),
              ),
              AppGroupedRow(
                title: Text(l10n.assistantModelLabel),
                subtitle: const Text(assistantLiveModelLabel),
              ),
            ],
          ),
          AssistantLiveStartupDiagnostics(timings: liveState.startupTimings),
        ],
      ),
    );
  }
}

IconData _headerIcon(AssistantLiveUiKind kind) => switch (kind) {
  AssistantLiveUiKind.unavailable => LucideIcons.micOff,
  AssistantLiveUiKind.permissionDenied => LucideIcons.mic,
  AssistantLiveUiKind.error => LucideIcons.circleAlert,
  AssistantLiveUiKind.available => LucideIcons.mic,
  AssistantLiveUiKind.preparing ||
  AssistantLiveUiKind.connecting ||
  AssistantLiveUiKind.reconnecting => LucideIcons.ellipsis,
  AssistantLiveUiKind.live => LucideIcons.audioLines,
};

Color _toneColor(ThemeData theme, AssistantLiveUiTone tone) {
  return switch (tone) {
    AssistantLiveUiTone.neutral => theme.colorScheme.onSurfaceVariant,
    AssistantLiveUiTone.positive => theme.colorScheme.primary,
    AssistantLiveUiTone.warning => theme.colorScheme.tertiary,
    AssistantLiveUiTone.error => theme.colorScheme.error,
  };
}
