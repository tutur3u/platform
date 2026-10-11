import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_voice_capture_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_geometry.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_options.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_primary_action.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_size_reporter.dart';
import 'package:mobile/features/assistant/widgets/assistant_dock_surface.dart';
import 'package:mobile/features/assistant/widgets/assistant_inline_voice_controls.dart';
import 'package:mobile/features/shell/view/floating_dock_rail.dart';
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
    this.voiceCapture,
    this.onAttachVoice,
    this.onSendVoice,
    this.onHeightChanged,
    this.embedded = false,
    this.localOnly = false,
    this.localBlocked = false,
    this.localGenerating = false,
    this.localModelLabel,
    this.onOpenLocalModels,
    this.onStopLocal,
    super.key,
  });

  final AssistantVoiceCaptureCubit? voiceCapture;
  final Future<void> Function()? onAttachVoice;
  final Future<void> Function()? onSendVoice;
  final AssistantChatState chatState;
  final AssistantLiveState liveState;
  final AssistantLiveUiState liveUiState;
  final AssistantShellState shellState;
  final AssistantRepository? repository;
  final bool embedded;
  final ValueChanged<double>? onHeightChanged;
  final bool localOnly;
  final bool localBlocked;
  final bool localGenerating;
  final String? localModelLabel;
  final Future<void> Function()? onOpenLocalModels;
  final Future<void> Function()? onStopLocal;
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
    final content = Row(
      children: [
        AssistantComposerOptions(
          localOnly: localOnly,
          localModelLabel: localModelLabel,
          onOpenLocalModels: onOpenLocalModels,
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
            maxLines: 5,
            keyboardType: TextInputType.multiline,
            textInputAction: TextInputAction.newline,
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
            if (hasPrompt || localGenerating) return const SizedBox.shrink();
            return IconButton(
              tooltip: localOnly
                  ? context.l10n.assistantLocalTextOnly
                  : context.l10n.voiceRecord,
              constraints: const BoxConstraints.tightFor(width: 44, height: 44),
              padding: EdgeInsets.zero,
              onPressed:
                  localBlocked ||
                      localOnly ||
                      chatState.status == AssistantChatStatus.restoring
                  ? null
                  : () {
                      focusNode.unfocus();
                      unawaited(onMicrophoneTap());
                    },
              icon: const Icon(Icons.mic_none_rounded),
            );
          },
        ),
      ],
    );
    final capture = localOnly ? null : voiceCapture;
    final composer = capture == null
        ? content
        : BlocBuilder<AssistantVoiceCaptureCubit, AssistantVoiceCaptureState>(
            bloc: capture,
            builder: (context, state) => AnimatedSwitcher(
              duration: MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : const Duration(milliseconds: 180),
              layoutBuilder: (current, previous) => Stack(
                alignment: Alignment.center,
                children: [
                  for (final outgoing in previous)
                    ExcludeSemantics(child: IgnorePointer(child: outgoing)),
                  if (current != null) current,
                ],
              ),
              child: state.visible
                  ? AssistantInlineVoiceControls(
                      key: const ValueKey('inline-voice-controls'),
                      capture: capture,
                      state: state,
                      onAttach: onAttachVoice ?? () async {},
                    )
                  : KeyedSubtree(
                      key: const ValueKey('text-composer'),
                      child: content,
                    ),
            ),
          );
    final sizedComposer = ConstrainedBox(
      constraints: BoxConstraints(minHeight: assistantComposerHeight(context)),
      child: composer,
    );
    if (embedded) {
      return AssistantComposerSizeReporter(
        // ShellDockSurface adds a one-pixel border above and below content.
        onHeightChanged: onHeightChanged == null
            ? null
            : (height) => onHeightChanged!(height + 2),
        child: sizedComposer,
      );
    }
    return AssistantComposerSizeReporter(
      onHeightChanged: onHeightChanged,
      child: Padding(
        padding: EdgeInsets.only(bottom: bottomInset),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            FloatingDockRail(
              navigation: AssistantDockSurface(child: sizedComposer),
              primary: navigationToggle(context),
            ),
          ],
        ),
      ),
    );
  }

  Widget navigationToggle(BuildContext context) =>
      AssistantComposerPrimaryAction(
        controller: controller,
        focusNode: focusNode,
        onToggleNavigation: onToggleNavigation,
        onSend: onSend,
        voiceCapture: localOnly ? null : voiceCapture,
        onSendVoice: onSendVoice,
        hasAttachments: chatState.composerAttachments.isNotEmpty,
        blocked:
            localBlocked || chatState.status == AssistantChatStatus.restoring,
        localGenerating: localGenerating,
        onStopLocal: onStopLocal,
      );
}
