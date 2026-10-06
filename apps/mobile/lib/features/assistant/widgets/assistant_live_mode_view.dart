import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_screen_control.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_section.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/l10n/l10n.dart';

part 'assistant_live_mode_components.dart';

class AssistantLiveModeView extends StatelessWidget {
  const AssistantLiveModeView({
    required this.chatState,
    required this.liveState,
    required this.liveUiState,
    required this.assistantName,
    required this.scrollController,
    required this.onRetry,
    required this.onToggleMicrophone,
    required this.onToggleCamera,
    required this.onDisconnect,
    required this.onOpenTextEntry,
    this.cameraController,
    super.key,
  });

  final AssistantChatState chatState;
  final AssistantLiveState liveState;
  final AssistantLiveUiState liveUiState;
  final String assistantName;
  final ScrollController scrollController;
  final Future<void> Function() onRetry;
  final Future<void> Function() onToggleMicrophone;
  final Future<void> Function() onToggleCamera;
  final Future<void> Function() onDisconnect;
  final Future<void> Function() onOpenTextEntry;
  final CameraController? cameraController;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final shortViewport = MediaQuery.sizeOf(context).height < 500;
    final userBlobCaption = liveState.isMicrophoneActive
        ? context.l10n.assistantLiveStageYouListening
        : context.l10n.assistantLiveStageYouMuted;
    final assistantBlobCaption = liveState.isAssistantSpeaking
        ? context.l10n.assistantLiveStageAssistantSpeaking
        : context.l10n.assistantLiveStageAssistantReady;
    final hasTranscript = chatState.messages.isNotEmpty || liveState.hasDraft;
    final connected =
        liveState.status == AssistantLiveConnectionStatus.connected;
    final isIdle =
        liveState.status == AssistantLiveConnectionStatus.disconnected;

    final needsRecovery =
        liveUiState.kind == AssistantLiveUiKind.error ||
        liveUiState.kind == AssistantLiveUiKind.reconnecting ||
        liveUiState.kind == AssistantLiveUiKind.permissionDenied;

    return Column(
      children: [
        if (needsRecovery && !liveState.isBusy)
          Padding(
            padding: EdgeInsets.fromLTRB(
              12,
              floatingShellHeaderInset(context) + (shortViewport ? 0 : 8),
              12,
              shortViewport ? 0 : 12,
            ),
            child: _LiveModeHeader(
              liveState: liveState,
              liveUiState: liveUiState,
              onRetry: onRetry,
            ),
          )
        else
          SizedBox(height: floatingShellHeaderInset(context)),
        Expanded(
          child: isIdle
              ? const _LiveIdleState()
              : liveState.isBusy
              ? _LiveConnectingState(
                  assistantName: assistantName,
                  liveUiState: liveUiState,
                  liveState: liveState,
                )
              : LayoutBuilder(
                  builder: (context, constraints) {
                    final wide = constraints.maxWidth >= 840;
                    final stage = _LiveCallStage(
                      liveState: liveState,
                      liveUiState: liveUiState,
                      assistantName: assistantName,
                      userBlobCaption: userBlobCaption,
                      assistantBlobCaption: assistantBlobCaption,
                      cameraController: cameraController,
                    );
                    final transcript = _LiveTranscript(
                      chatState: chatState,
                      liveState: liveState,
                      assistantName: assistantName,
                      scrollController: scrollController,
                    );
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: wide
                          ? Row(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Expanded(
                                  flex: 4,
                                  child: SingleChildScrollView(child: stage),
                                ),
                                if (hasTranscript) ...[
                                  const SizedBox(width: 16),
                                  Expanded(flex: 5, child: transcript),
                                ],
                              ],
                            )
                          : ListView(
                              padding: EdgeInsets.only(
                                bottom:
                                    MediaQuery.paddingOf(context).bottom + 16,
                              ),
                              children: [
                                stage,
                                const SizedBox(height: 12),
                                if (hasTranscript)
                                  SizedBox(
                                    height: (constraints.maxHeight * .45).clamp(
                                      180.0,
                                      480.0,
                                    ),
                                    child: transcript,
                                  )
                                else
                                  Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                    ),
                                    child: Text(
                                      context.l10n.assistantLiveTranscriptEmpty,
                                      style: theme.textTheme.bodySmall
                                          ?.copyWith(
                                            color: theme
                                                .colorScheme
                                                .onSurfaceVariant,
                                          ),
                                    ),
                                  ),
                              ],
                            ),
                    );
                  },
                ),
        ),
        if (connected) AssistantLiveScreenControl(state: liveState),
      ],
    );
  }
}
