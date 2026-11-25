import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// The model and response-mode controls under the Mira prompt, matching the
/// web composer toolbar. Local models show their label and open the local
/// model list; they have no response mode.
class AssistantComposerControls extends StatelessWidget {
  const AssistantComposerControls({
    required this.shellState,
    required this.onOpenModels,
    required this.onThinkingModeChanged,
    this.localModelLabel,
    super.key,
  });

  final AssistantShellState shellState;

  /// Null while no model can be chosen.
  final Future<void> Function()? onOpenModels;
  final Future<void> Function(AssistantThinkingMode) onThinkingModeChanged;

  /// The selected on-device model; set only in the local lane.
  final String? localModelLabel;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
    final thinking = shellState.thinkingMode == AssistantThinkingMode.thinking;
    final modelLabel = localModelLabel ?? shellState.selectedModel.label;
    final openModels = onOpenModels;
    return Padding(
      key: const ValueKey('assistant-composer-controls'),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.xs,
        0,
        AppSpacing.xs,
        AppSpacing.xs,
      ),
      child: Row(
        children: [
          Flexible(
            child: AppButton.ghost(
              key: const ValueKey('assistant-composer-model'),
              size: AppButtonSize.small,
              density: AppButtonDensity.compact,
              semanticLabel: '${l10n.assistantModelLabel}: $modelLabel',
              leading: Icon(
                localModelLabel == null
                    ? LucideIcons.sparkles
                    : LucideIcons.cpu,
                size: 16,
                color: colors.mutedForeground,
              ),
              trailing: Icon(
                LucideIcons.chevronDown,
                size: 14,
                color: colors.mutedForeground,
              ),
              onPressed: openModels == null
                  ? null
                  : () => unawaited(openModels()),
              child: Text(
                modelLabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
          if (localModelLabel == null) ...[
            const SizedBox(width: AppSpacing.xxs),
            AppButton.ghost(
              key: const ValueKey('assistant-composer-mode'),
              size: AppButtonSize.small,
              density: AppButtonDensity.compact,
              selected: thinking,
              leading: Icon(
                thinking ? LucideIcons.brain : LucideIcons.zap,
                size: 16,
                color: thinking ? colors.primary : colors.mutedForeground,
              ),
              onPressed: () => unawaited(
                onThinkingModeChanged(
                  thinking
                      ? AssistantThinkingMode.fast
                      : AssistantThinkingMode.thinking,
                ),
              ),
              child: Text(
                thinking ? l10n.assistantModeThinking : l10n.assistantModeFast,
                maxLines: 1,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
