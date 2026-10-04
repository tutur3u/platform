import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_geometry.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_options.dart';
import 'package:mobile/features/assistant/widgets/assistant_dock_surface.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/floating_dock_rail.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantComposerDock extends StatelessWidget {
  const AssistantComposerDock({
    required this.chatState,
    required this.liveState,
    required this.liveUiState,
    required this.shellState,
    required this.navigationExpanded,
    required this.bottomInset,
    required this.isPersonalWorkspace,
    required this.onModelSelected,
    required this.onOpenCreditSourceSheet,
    required this.onThinkingModeChanged,
    required this.controller,
    required this.focusNode,
    required this.onOpenAttachments,
    required this.onToggleNavigation,
    required this.onCloseComposer,
    required this.onMicrophoneTap,
    required this.onSend,
    required this.onRemoveAttachment,
    this.repository,
    super.key,
  });

  final AssistantChatState chatState;
  final AssistantLiveState liveState;
  final AssistantLiveUiState liveUiState;
  final AssistantShellState shellState;
  final AssistantRepository? repository;
  final bool navigationExpanded;
  final double bottomInset;
  final bool isPersonalWorkspace;
  final Future<void> Function(AssistantGatewayModel) onModelSelected;
  final Future<void> Function() onOpenCreditSourceSheet;
  final Future<void> Function(AssistantThinkingMode mode) onThinkingModeChanged;
  final TextEditingController controller;
  final FocusNode focusNode;
  final Future<void> Function() onOpenAttachments;
  final VoidCallback onToggleNavigation;
  final VoidCallback onCloseComposer;
  final Future<void> Function() onMicrophoneTap;
  final Future<void> Function() onSend;
  final Future<void> Function(String attachmentId) onRemoveAttachment;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: assistantComposerHeight(context) + bottomInset,
      child: FloatingDockRail(
        navigation: AssistantDockSurface(
          key: const ValueKey('assistant-composer-surface'),
          child: Row(
            children: [
              AssistantComposerOptions(
                chatState: chatState,
                shellState: shellState,
                repository: repository,
                onOpenAttachments: onOpenAttachments,
                onModelSelected: onModelSelected,
                onOpenCreditSourceSheet: onOpenCreditSourceSheet,
                onThinkingModeChanged: onThinkingModeChanged,
                onRemoveAttachment: onRemoveAttachment,
                onCloseComposer: onCloseComposer,
                onDismissKeyboard: focusNode.unfocus,
              ),
              Expanded(
                child: TextField(
                  controller: controller,
                  focusNode: focusNode,
                  style: const TextStyle(fontSize: 16, height: 1.25),
                  minLines: 1,
                  textInputAction: TextInputAction.send,
                  onSubmitted: chatState.status == AssistantChatStatus.restoring
                      ? null
                      : (_) {
                          if (controller.text.trim().isNotEmpty ||
                              chatState.composerAttachments.isNotEmpty) {
                            unawaited(onSend());
                          }
                        },
                  onTapOutside: (_) => focusNode.unfocus(),
                  decoration: InputDecoration(
                    hintText: context.l10n.assistantAskPlaceholder,
                    border: InputBorder.none,
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
              ValueListenableBuilder<TextEditingValue>(
                valueListenable: controller,
                builder: (context, value, _) {
                  final hasPrompt =
                      value.text.trim().isNotEmpty ||
                      chatState.composerAttachments.isNotEmpty;
                  return IconButton(
                    tooltip: hasPrompt
                        ? context.l10n.assistantSendAction
                        : context.l10n.voiceRecord,
                    constraints: const BoxConstraints.tightFor(
                      width: 44,
                      height: 44,
                    ),
                    padding: EdgeInsets.zero,
                    onPressed: chatState.status == AssistantChatStatus.restoring
                        ? null
                        : hasPrompt
                        ? onSend
                        : () {
                            focusNode.unfocus();
                            unawaited(onMicrophoneTap());
                          },
                    icon: Icon(
                      hasPrompt
                          ? Icons.arrow_upward_rounded
                          : Icons.mic_none_rounded,
                    ),
                  );
                },
              ),
            ],
          ),
        ),
        primary: ShellDockActionButton(
          key: const ValueKey('assistant-navigation-toggle'),
          action: ShellActionSpec(
            id: 'assistant-navigation',
            tooltip: context.l10n.assistantExpandNavigation,
            icon: Icons.menu_rounded,
            onPressed: () {
              focusNode.unfocus();
              onToggleNavigation();
            },
          ),
        ),
      ),
    );
  }
}
