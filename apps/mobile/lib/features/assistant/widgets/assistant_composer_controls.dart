import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// The model and response-mode controls under the Mira prompt, matching the
/// web composer toolbar. The mode toggles between Fast and Thinking; it is
/// absent where it does not apply (on-device models and subscription models
/// that use their provider's defaults). Local models show their label and
/// open the local model list.
class AssistantComposerControls extends StatelessWidget {
  const AssistantComposerControls({
    required this.shellState,
    required this.onOpenModels,
    this.onThinkingModeChanged,
    this.modeEnabled = true,
    this.localModelLabel,
    super.key,
  });

  final AssistantShellState shellState;

  /// Null while no model can be chosen.
  final Future<void> Function()? onOpenModels;

  /// Null hides the response-mode toggle.
  final Future<void> Function(AssistantThinkingMode)? onThinkingModeChanged;

  /// False while a reply is in flight or messages are queued; the toggle
  /// stays visible but waits for the reply to settle.
  final bool modeEnabled;

  /// The selected on-device model; set only in the local lane.
  final String? localModelLabel;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
    final modelLabel = localModelLabel ?? shellState.selectedModel.label;
    final openModels = onOpenModels;
    final changeMode = onThinkingModeChanged;
    final thinking = shellState.thinkingMode == AssistantThinkingMode.thinking;
    final modeLabel = thinking
        ? l10n.assistantModeThinking
        : l10n.assistantModeFast;
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
          if (changeMode != null) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xxs),
              child: SizedBox(
                width: 1,
                height: 16,
                child: ColoredBox(color: colors.border),
              ),
            ),
            Flexible(
              child: AppButton.ghost(
                key: const ValueKey('assistant-composer-mode'),
                size: AppButtonSize.small,
                density: AppButtonDensity.compact,
                semanticLabel: '${l10n.assistantResponseModeLabel}: $modeLabel',
                leading: Icon(
                  thinking ? LucideIcons.sparkles : LucideIcons.zap,
                  size: 16,
                  color: colors.mutedForeground,
                ),
                onPressed: modeEnabled
                    ? () => unawaited(
                        changeMode(
                          thinking
                              ? AssistantThinkingMode.fast
                              : AssistantThinkingMode.thinking,
                        ),
                      )
                    : null,
                child: Text(
                  modeLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
