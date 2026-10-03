import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_attachment_menu_entry.dart';
import 'package:mobile/features/assistant/widgets/assistant_model_picker_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

enum _ComposerOption { attach, model, fast, thinking, source, close }

/// Secondary controls stay in one anchored menu, leaving room for the prompt.
class AssistantComposerOptions extends StatelessWidget {
  const AssistantComposerOptions({
    required this.chatState,
    required this.shellState,
    required this.onOpenAttachments,
    required this.onModelSelected,
    required this.onOpenCreditSourceSheet,
    required this.onThinkingModeChanged,
    required this.onRemoveAttachment,
    required this.onCloseComposer,
    this.repository,
    super.key,
  });
  final VoidCallback onCloseComposer;
  final AssistantChatState chatState;
  final AssistantShellState shellState;
  final AssistantRepository? repository;
  final Future<void> Function() onOpenAttachments;
  final Future<void> Function(AssistantGatewayModel) onModelSelected;
  final Future<void> Function() onOpenCreditSourceSheet;
  final Future<void> Function(AssistantThinkingMode) onThinkingModeChanged;
  final Future<void> Function(String) onRemoveAttachment;

  Future<void> _select(BuildContext context, _ComposerOption option) async {
    switch (option) {
      case _ComposerOption.close:
        onCloseComposer();
      case _ComposerOption.attach:
        await onOpenAttachments();
      case _ComposerOption.source:
        await onOpenCreditSourceSheet();
      case _ComposerOption.fast:
        await onThinkingModeChanged(AssistantThinkingMode.fast);
      case _ComposerOption.thinking:
        await onThinkingModeChanged(AssistantThinkingMode.thinking);
      case _ComposerOption.model:
        final choice = await showAdaptiveSheet<AssistantGatewayModel>(
          context: context,
          builder: (_) => AssistantModelPickerSheet(
            selected: shellState.selectedModel,
            models: shellState.availableModels,
            isAllowed: (model) {
              final allowed = shellState.activeCredits.allowedModels;
              return !model.disabled &&
                  (allowed.isEmpty ||
                      allowed.contains(model.value) ||
                      allowed.contains(model.value.split('/').last));
            },
            repository: repository,
            workspaceId: shellState.workspace?.id,
          ),
        );
        if (choice != null) await onModelSelected(choice);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final source = shellState.creditSource == AssistantCreditSource.personal
        ? l10n.assistantSourcePersonal
        : l10n.assistantSourceWorkspace;
    final modelLabel =
        '${l10n.assistantModelLabel}: '
        '${shellState.selectedModel.label}';
    return PopupMenuButton<_ComposerOption>(
      key: const ValueKey('assistant-composer-options'),
      tooltip: context.l10n.assistantSettingsTitle,
      padding: EdgeInsets.zero,
      constraints: const BoxConstraints(minWidth: 220, maxWidth: 300),
      onSelected: (option) => unawaited(_select(context, option)),
      itemBuilder: (context) => [
        for (final attachment in chatState.composerAttachments)
          AssistantComposerAttachmentMenuEntry<_ComposerOption>(
            attachment: attachment,
            onRemove: onRemoveAttachment,
          ),
        _item(
          _ComposerOption.attach,
          Icons.attach_file,
          context.l10n.assistantAttachFilesAction,
        ),
        _item(
          _ComposerOption.model,
          Icons.auto_awesome_outlined,
          modelLabel,
          enabled: shellState.availableModels.isNotEmpty,
        ),
        CheckedPopupMenuItem(
          value: _ComposerOption.fast,
          checked: shellState.thinkingMode == AssistantThinkingMode.fast,
          child: Text(context.l10n.assistantModeFast),
        ),
        CheckedPopupMenuItem(
          value: _ComposerOption.thinking,
          checked: shellState.thinkingMode == AssistantThinkingMode.thinking,
          child: Text(context.l10n.assistantModeThinking),
        ),
        _item(
          _ComposerOption.source,
          Icons.toll_rounded,
          '${l10n.assistantSourceLabel}: $source',
        ),
        const PopupMenuDivider(),
        _item(
          _ComposerOption.close,
          Icons.keyboard_hide_rounded,
          context.l10n.assistantCloseComposer,
        ),
      ],
      child: SizedBox(
        width: 44,
        height: 44,
        child: Center(
          child: Badge(
            isLabelVisible: chatState.composerAttachments.isNotEmpty,
            label: Text('${chatState.composerAttachments.length}'),
            child: const Icon(Icons.add_rounded),
          ),
        ),
      ),
    );
  }

  PopupMenuItem<_ComposerOption> _item(
    _ComposerOption value,
    IconData icon,
    String label, {
    bool enabled = true,
  }) => PopupMenuItem(
    value: value,
    enabled: enabled,
    child: Row(
      children: [
        Icon(icon, size: 20),
        const SizedBox(width: 12),
        Expanded(child: Text(label)),
      ],
    ),
  );
}
