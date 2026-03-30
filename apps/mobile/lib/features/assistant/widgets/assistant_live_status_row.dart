import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantLiveStatusRow extends StatelessWidget {
  const AssistantLiveStatusRow({
    required this.liveUiState,
    required this.liveState,
    super.key,
  });

  final AssistantLiveUiState liveUiState;
  final AssistantLiveState liveState;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final toneColor = _toneColor(theme, liveUiState.tone);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: toneColor.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            liveUiState.statusLabel(context.l10n),
            style: theme.textTheme.labelSmall?.copyWith(
              color: toneColor,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            liveUiState.detailLabel(context.l10n, liveState),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              height: 1.3,
            ),
          ),
        ),
      ],
    );
  }
}

Color _toneColor(ThemeData theme, AssistantLiveUiTone tone) {
  return switch (tone) {
    AssistantLiveUiTone.neutral => theme.colorScheme.onSurfaceVariant,
    AssistantLiveUiTone.positive => theme.colorScheme.primary,
    AssistantLiveUiTone.warning => theme.colorScheme.secondary,
    AssistantLiveUiTone.error => theme.colorScheme.error,
  };
}
