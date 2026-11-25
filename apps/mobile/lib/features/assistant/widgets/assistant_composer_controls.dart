import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// The model control under the Mira prompt, matching the web composer
/// toolbar. Native text sends always use Thinking, so there is no response
/// mode control. Local models show their label and open the local model
/// list.
class AssistantComposerControls extends StatelessWidget {
  const AssistantComposerControls({
    required this.shellState,
    required this.onOpenModels,
    this.localModelLabel,
    super.key,
  });

  final AssistantShellState shellState;

  /// Null while no model can be chosen.
  final Future<void> Function()? onOpenModels;

  /// The selected on-device model; set only in the local lane.
  final String? localModelLabel;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
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
        ],
      ),
    );
  }
}
