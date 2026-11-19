import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_voice_capture_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_attachments.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_geometry.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_options.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_primary_action.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_size_reporter.dart';
import 'package:mobile/features/assistant/widgets/assistant_dock_surface.dart';
import 'package:mobile/features/assistant/widgets/assistant_inline_voice_controls.dart';
import 'package:mobile/features/assistant/widgets/assistant_reply_preview.dart';
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
    this.onRetryAttachment,
    this.repository,
    this.chatCubit,
    this.voiceCapture,
    this.onAttachVoice,
    this.onSendVoice,
    this.onHeightChanged,
    this.embedded = false,
    this.inPage = false,
    this.pagePrimaryAction,
    this.localOnly = false,
    this.localBlocked = false,
    this.localGenerating = false,
    this.localModelLabel,
    this.onOpenLocalModels,
    this.onStopLocal,
    this.onCancelReply,
    super.key,
  });

  final AssistantVoiceCaptureCubit? voiceCapture;
  final Future<void> Function()? onAttachVoice;
  final Future<void> Function()? onSendVoice;
  final AssistantChatState chatState;
  final AssistantChatCubit? chatCubit;
  final AssistantLiveState liveState;
  final AssistantLiveUiState liveUiState;
  final AssistantShellState shellState;
  final AssistantRepository? repository;
  final bool embedded;
  final bool inPage;
  final Widget? pagePrimaryAction;
  final ValueChanged<double>? onHeightChanged;
  final bool localOnly;
  final bool localBlocked;
  final bool localGenerating;
  final String? localModelLabel;
  final Future<void> Function()? onOpenLocalModels;
  final Future<void> Function()? onStopLocal;
  final VoidCallback? onCancelReply;
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
  final Future<void> Function(String attachmentId)? onRetryAttachment;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final theme = Theme.of(context);
    final inputStyle = theme.useMaterial3
        ? theme.textTheme.bodyLarge!
        : theme.textTheme.titleMedium!;
    final promptStyle = inPage
        ? inputStyle
              .merge(tokens.typography.body)
              .copyWith(color: tokens.colorScheme.foreground)
        : const TextStyle(fontSize: 16, height: 1.25);
    final rowHeight = assistantComposerHeight(context);
    final lineHeight = inPage
        ? _promptLineHeight(context, promptStyle)
        : AppComposerRow.lineHeightOf(context, promptStyle);
    final prompt = AppTextField(
      key: const ValueKey('assistant-composer-editor'),
      style: promptStyle,
      contentPadding:
          AppComposerRow.fieldPadding(
            minHeight: rowHeight,
            lineHeight: lineHeight,
          ).copyWith(
            left: inPage ? AppSpacing.xs : 0,
            right: inPage ? AppSpacing.xs : 0,
          ),
      textAlignVertical: inPage ? TextAlignVertical.center : null,
      controller: controller,
      focusNode: focusNode,
      minLines: 1,
      maxLines: 5,
      keyboardType: TextInputType.multiline,
      textInputAction: TextInputAction.newline,
      textCapitalization: inPage
          ? TextCapitalization.sentences
          : TextCapitalization.none,
      onTapOutside: (_) => focusNode.unfocus(),
      placeholder: inPage
          ? context.l10n.assistantAskName(shellState.soul.name)
          : context.l10n.assistantAskPlaceholder,
      hintMaxLines: 1,
      borderless: true,
    );
    final row = AppComposerRow(
      minHeight: rowHeight,
      leading: [
        if (inPage && !localOnly)
          AppIconButton(
            tooltip: context.l10n.assistantAttachFilesAction,
            onPressed: () {
              focusNode.unfocus();
              unawaited(onOpenAttachments());
            },
            icon: const Icon(LucideIcons.paperclip),
          ),
        AssistantComposerOptions(
          hasDirectAttachment: inPage,
          localOnly: localOnly,
          localModelLabel: localModelLabel,
          onOpenLocalModels: onOpenLocalModels,
          chatState: chatState,
          chatCubit: chatCubit,
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
      ],
      field: inPage
          ? Semantics(
              label: context.l10n.assistantComposerMessage,
              child: prompt,
            )
          : prompt,
      trailing: [
        if (inPage)
          ?pagePrimaryAction
        else
          ValueListenableBuilder<TextEditingValue>(
            valueListenable: controller,
            builder: (context, value, _) => Visibility(
              key: const ValueKey('assistant-composer-microphone-slot'),
              visible:
                  value.text.trim().isEmpty &&
                  chatState.composerAttachments.isEmpty &&
                  !localGenerating,
              maintainSize: true,
              maintainAnimation: true,
              maintainState: true,
              child: AppIconButton(
                tooltip: localOnly
                    ? context.l10n.assistantLocalTextOnly
                    : context.l10n.voiceRecord,
                onPressed:
                    localBlocked ||
                        localOnly ||
                        chatState.status == AssistantChatStatus.restoring
                    ? null
                    : () {
                        focusNode.unfocus();
                        unawaited(onMicrophoneTap());
                      },
                icon: const Icon(LucideIcons.mic),
              ),
            ),
          ),
      ],
    );
    final content = inPage ? TextFieldTapRegion(child: row) : row;
    final capture = localOnly ? null : voiceCapture;
    final composer = capture == null
        ? content
        : BlocBuilder<AssistantVoiceCaptureCubit, AssistantVoiceCaptureState>(
            bloc: capture,
            builder: (context, state) => AnimatedSwitcher(
              duration: MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : AppMotion.normal,
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
                      trailing: inPage ? pagePrimaryAction : null,
                    )
                  : KeyedSubtree(
                      key: const ValueKey('text-composer'),
                      child: content,
                    ),
            ),
          );
    final sizedComposer = ConstrainedBox(
      constraints: BoxConstraints(minHeight: assistantComposerHeight(context)),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.end,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (chatState.replyTarget case final reply? when !localOnly)
            AssistantReplyPreview(
              label: reply.role == 'user'
                  ? context.l10n.assistantYouLabel
                  : shellState.soul.name,
              text: reply.parts
                  .where((part) => part.type == 'text')
                  .map((part) => part.text ?? '')
                  .join('\n'),
              onCancel: onCancelReply,
            ),
          if (!localOnly && chatState.composerAttachments.isNotEmpty)
            AssistantComposerAttachments(
              attachments: chatState.composerAttachments,
              onRemove: onRemoveAttachment,
              onRetry: onRetryAttachment,
              horizontal: inPage,
            ),
          composer,
        ],
      ),
    );
    if (inPage) return sizedComposer;
    if (embedded) {
      return AssistantComposerSizeReporter(
        // Include the border and side controls in occupied clearance.
        onHeightChanged: onHeightChanged == null
            ? null
            : (height) => onHeightChanged!(
                math.max(height + 2, AssistantComposerPrimaryAction.dockHeight),
              ),
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

  double _promptLineHeight(BuildContext context, TextStyle style) {
    final painter = TextPainter(
      text: TextSpan(style: style),
      textDirection: Directionality.of(context),
      textScaler: MediaQuery.textScalerOf(context),
    );
    final height = painter.preferredLineHeight;
    painter.dispose();
    return height;
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
