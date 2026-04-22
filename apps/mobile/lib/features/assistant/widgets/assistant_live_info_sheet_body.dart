import 'package:flutter/material.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_config.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
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

    return SafeArea(
      top: false,
      child: Material(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 8, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _LiveInfoHeaderIcon(kind: liveUiState.kind),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l10n.assistantLiveTitle,
                          style: theme.textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 10),
                        AssistantStatusBadge(
                          label: liveUiState.statusLabel(l10n),
                          color: _toneColor(theme, liveUiState.tone),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    tooltip: MaterialLocalizations.of(
                      context,
                    ).closeButtonTooltip,
                    onPressed: onClose,
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              DecoratedBox(
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: theme.colorScheme.outlineVariant.withValues(
                      alpha: 0.55,
                    ),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Text(
                    liveUiState.detailLabel(l10n, liveState),
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                      height: 1.45,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text(
                l10n.assistantLiveInfoAccessHeading,
                style: theme.textTheme.labelLarge?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.2,
                ),
              ),
              const SizedBox(height: 10),
              _InfoTile(
                label: l10n.assistantLiveWorkspaceTierLabel(
                  normalizeWorkspaceTier(liveUiState.workspaceTier),
                ),
                trailing: WorkspaceTierBadge(tier: liveUiState.activeTier),
              ),
              const SizedBox(height: 8),
              _InfoTile(
                label: l10n.assistantSourceLabel,
                trailing: Text(
                  liveUiState.creditSource == AssistantCreditSource.personal
                      ? l10n.assistantSourcePersonal
                      : l10n.assistantSourceWorkspace,
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              _InfoTile(
                label: l10n.assistantModelLabel,
                trailing: Text(
                  assistantLiveModelLabel,
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (onPrimaryAction != null) ...[
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: () async => onPrimaryAction?.call(),
                  child: Text(l10n.assistantLiveConnect),
                ),
              ],
              if (onPrimaryAction == null) ...[
                const SizedBox(height: 22),
                FilledButton.tonal(
                  onPressed: onClose,
                  child: Text(l10n.assistantLiveInfoDismiss),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _LiveInfoHeaderIcon extends StatelessWidget {
  const _LiveInfoHeaderIcon({required this.kind});

  final AssistantLiveUiKind kind;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final icon = switch (kind) {
      AssistantLiveUiKind.unavailable => Icons.mic_off_outlined,
      AssistantLiveUiKind.permissionDenied => Icons.mic_none_outlined,
      AssistantLiveUiKind.error => Icons.error_outline_rounded,
      AssistantLiveUiKind.available => Icons.mic_none_outlined,
      AssistantLiveUiKind.preparing ||
      AssistantLiveUiKind.connecting ||
      AssistantLiveUiKind.reconnecting => Icons.more_horiz_rounded,
      AssistantLiveUiKind.live => Icons.graphic_eq_rounded,
    };
    final color = switch (kind) {
      AssistantLiveUiKind.error => theme.colorScheme.error,
      AssistantLiveUiKind.live => theme.colorScheme.primary,
      _ => theme.colorScheme.onSurfaceVariant,
    };

    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Icon(icon, color: color, size: 26),
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({
    required this.label,
    required this.trailing,
  });

  final String label;
  final Widget trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(
          alpha: 0.42,
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.35),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
            const SizedBox(width: 10),
            DefaultTextStyle.merge(
              textAlign: TextAlign.end,
              child: trailing,
            ),
          ],
        ),
      ),
    );
  }
}

Color _toneColor(ThemeData theme, AssistantLiveUiTone tone) {
  return switch (tone) {
    AssistantLiveUiTone.neutral => theme.colorScheme.onSurfaceVariant,
    AssistantLiveUiTone.positive => theme.colorScheme.primary,
    AssistantLiveUiTone.warning => theme.colorScheme.tertiary,
    AssistantLiveUiTone.error => theme.colorScheme.error,
  };
}
