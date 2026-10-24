import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_model_eligibility.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_preview.dart';
import 'package:mobile/features/assistant/widgets/assistant_model_picker_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

enum _ComposerOption { attach, model, local, source, close }

/// Secondary controls share a sheet so Back returns to the prompt.
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
    this.onDismissKeyboard,
    this.localOnly = false,
    this.localModelLabel,
    this.onOpenLocalModels,
    super.key,
  });
  final bool localOnly;
  final String? localModelLabel;
  final Future<void> Function()? onOpenLocalModels;
  final VoidCallback onCloseComposer;
  final VoidCallback? onDismissKeyboard;
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
      case _ComposerOption.local:
        await onOpenLocalModels?.call();
      case _ComposerOption.close:
        onCloseComposer();
      case _ComposerOption.attach:
        if (!localOnly) await onOpenAttachments();
      case _ComposerOption.source:
        if (!localOnly) await onOpenCreditSourceSheet();
      case _ComposerOption.model:
        final choice = await showAppSheet<AssistantGatewayModel>(
          context: context,
          builder: (_) => AssistantModelPickerSheet(
            selected: shellState.selectedModel,
            models: shellState.availableModels,
            isAllowed: (model) => isAssistantModelAllowed(
              model,
              shellState.activeCredits.allowedModels,
            ),
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
        '${localModelLabel ?? shellState.selectedModel.label}';
    return AppIconButton(
      key: const ValueKey('assistant-composer-options'),
      tooltip: context.l10n.assistantSettingsTitle,
      icon: chatState.composerAttachments.isEmpty
          ? const Icon(LucideIcons.plus)
          : AppBadge(
              leading: const Icon(LucideIcons.paperclip),
              child: Text(chatState.composerAttachments.length.toString()),
            ),
      onPressed: () {
        final chatCubit = context.read<AssistantChatCubit?>();
        onDismissKeyboard?.call();
        unawaited(
          showAppSheet<void>(
            context: context,
            builder: (sheetContext) {
              Widget option(
                _ComposerOption value,
                IconData icon,
                String title, {
                bool enabled = true,
              }) => AppOptionTile(
                title: title,
                leading: Icon(icon),
                onTap: enabled
                    ? () {
                        Navigator.of(sheetContext).pop();
                        unawaited(_select(context, value));
                      }
                    : null,
              );
              Widget body(AssistantChatState currentChat) => AppSheetScaffold(
                title: sheetContext.l10n.assistantSettingsTitle,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (!localOnly) ...[
                      for (final attachment in currentChat.composerAttachments)
                        AssistantAttachmentPreview(
                          attachment: attachment,
                          onRemove: () {
                            Navigator.of(sheetContext).pop();
                            unawaited(onRemoveAttachment(attachment.id));
                          },
                        ),
                      option(
                        _ComposerOption.attach,
                        LucideIcons.paperclip,
                        sheetContext.l10n.assistantAttachFilesAction,
                      ),
                    ],
                    option(
                      _ComposerOption.model,
                      LucideIcons.sparkles,
                      modelLabel,
                      enabled: shellState.availableModels.isNotEmpty,
                    ),
                    if (onOpenLocalModels != null)
                      option(
                        _ComposerOption.local,
                        LucideIcons.cpu,
                        l10n.assistantLocalModeAction,
                      ),
                    if (!localOnly)
                      option(
                        _ComposerOption.source,
                        LucideIcons.coins,
                        '${l10n.assistantSourceLabel}: $source',
                      ),
                    const AppDivider(),
                    option(
                      _ComposerOption.close,
                      LucideIcons.keyboardOff,
                      sheetContext.l10n.assistantCloseComposer,
                    ),
                  ],
                ),
              );
              return chatCubit == null
                  ? body(chatState)
                  : BlocBuilder<AssistantChatCubit, AssistantChatState>(
                      bloc: chatCubit,
                      buildWhen: (previous, next) =>
                          previous.composerAttachments !=
                          next.composerAttachments,
                      builder: (_, state) => body(state),
                    );
            },
          ),
        );
      },
    );
  }
}
