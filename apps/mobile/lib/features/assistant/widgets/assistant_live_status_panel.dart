import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/widgets/assistant_status_badge.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantLiveStatusPanel extends StatelessWidget {
  const AssistantLiveStatusPanel({
    required this.liveUiState,
    required this.liveState,
    required this.onRetry,
    super.key,
  });

  final AssistantLiveUiState liveUiState;
  final AssistantLiveState liveState;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    if (!_shouldShowPanel) {
      return const SizedBox.shrink();
    }

    final theme = Theme.of(context);
    final toneColor = _toneColor(theme, liveUiState.tone);
    final l10n = context.l10n;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: toneColor.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: toneColor.withValues(alpha: 0.18)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: toneColor.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    _icon,
                    color: toneColor,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AssistantStatusBadge(
                        label: _statusLabel(l10n),
                        color: toneColor,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _detailLabel(l10n),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurface,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (liveState.isBusy) ...[
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  minHeight: 5,
                  color: toneColor,
                  backgroundColor: toneColor.withValues(alpha: 0.12),
                ),
              ),
            ],
            if (_showRetryAction) ...[
              const SizedBox(height: 14),
              Align(
                alignment: Alignment.centerLeft,
                child: FilledButton.tonalIcon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh_rounded),
                  label: Text(l10n.assistantLiveRetryAction),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  bool get _showRetryAction =>
      liveUiState.kind == AssistantLiveUiKind.error ||
      liveUiState.kind == AssistantLiveUiKind.reconnecting;

  bool get _shouldShowPanel =>
      liveState.isBusy ||
      liveUiState.kind == AssistantLiveUiKind.error ||
      liveUiState.kind == AssistantLiveUiKind.reconnecting ||
      liveUiState.kind == AssistantLiveUiKind.permissionDenied;

  IconData get _icon => switch (liveUiState.kind) {
    AssistantLiveUiKind.preparing => Icons.token_rounded,
    AssistantLiveUiKind.connecting => Icons.wifi_tethering_rounded,
    AssistantLiveUiKind.reconnecting => Icons.sync_problem_rounded,
    AssistantLiveUiKind.permissionDenied => Icons.no_photography_rounded,
    AssistantLiveUiKind.error => Icons.error_outline_rounded,
    _ => Icons.info_outline_rounded,
  };

  String _statusLabel(AppLocalizations l10n) {
    if (liveState.isPersisting) {
      return l10n.assistantLiveStatusSyncing;
    }
    return liveUiState.statusLabel(l10n);
  }

  String _detailLabel(AppLocalizations l10n) {
    if (liveState.isPersisting) {
      return l10n.assistantLiveDescriptionReady;
    }
    return liveUiState.detailLabel(l10n, liveState);
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
