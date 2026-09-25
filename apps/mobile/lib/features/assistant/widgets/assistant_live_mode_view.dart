import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_activity_blob.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_screen_control.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_status_panel.dart';
import 'package:mobile/features/assistant/widgets/assistant_status_badge.dart';
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
    required this.onClose,
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
  final Future<void> Function() onClose;
  final Future<void> Function() onRetry;
  final Future<void> Function() onToggleMicrophone;
  final Future<void> Function() onToggleCamera;
  final Future<void> Function() onDisconnect;
  final Future<void> Function() onOpenTextEntry;
  final CameraController? cameraController;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final safeArea = MediaQuery.paddingOf(context);
    final shortViewport = MediaQuery.sizeOf(context).height < 500;
    final userBlobCaption = liveState.isMicrophoneActive
        ? context.l10n.assistantLiveStageYouListening
        : context.l10n.assistantLiveStageYouMuted;
    final assistantBlobCaption = liveState.isAssistantSpeaking
        ? context.l10n.assistantLiveStageAssistantSpeaking
        : context.l10n.assistantLiveStageAssistantReady;
    final showRetry = liveState.status == AssistantLiveConnectionStatus.error;

    return ColoredBox(
      color: theme.scaffoldBackgroundColor,
      child: Column(
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(
              12,
              floatingShellHeaderInset(context) + 8,
              12,
              12,
            ),
            child: _LiveModeHeader(
              liveState: liveState,
              liveUiState: liveUiState,
              onClose: onClose,
              onDisconnect: onDisconnect,
              onRetry: onRetry,
              showRetry: showRetry,
            ),
          ),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final wide = constraints.maxWidth >= 840;
                final stage = _LiveStageCard(
                  liveState: liveState,
                  assistantName: assistantName,
                  userBlobCaption: userBlobCaption,
                  assistantBlobCaption: assistantBlobCaption,
                  cameraController: cameraController,
                );
                final transcript = _LiveTranscriptCard(
                  chatState: chatState,
                  liveState: liveState,
                  assistantName: assistantName,
                  scrollController: scrollController,
                );
                final status = _showStatusPanel
                    ? Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: AssistantLiveStatusPanel(
                          liveUiState: liveUiState,
                          liveState: liveState,
                          onRetry: onRetry,
                        ),
                      )
                    : const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: wide
                      ? Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Expanded(
                              flex: 4,
                              child: SingleChildScrollView(
                                child: Column(children: [stage, status]),
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(flex: 5, child: transcript),
                          ],
                        )
                      : ListView(
                          children: [
                            stage,
                            status,
                            const SizedBox(height: 12),
                            SizedBox(
                              height: (constraints.maxHeight * .45).clamp(
                                180.0,
                                480.0,
                              ),
                              child: transcript,
                            ),
                          ],
                        ),
                );
              },
            ),
          ),
          AssistantLiveScreenControl(state: liveState),
          Padding(
            padding: EdgeInsets.fromLTRB(
              16,
              shortViewport ? 4 : 12,
              16,
              safeArea.bottom + (shortViewport ? 4 : 16),
            ),
            child: Center(
              child: _LiveControlRail(
                liveState: liveState,
                onToggleMicrophone: onToggleMicrophone,
                onToggleCamera: onToggleCamera,
                onOpenTextEntry: onOpenTextEntry,
              ),
            ),
          ),
        ],
      ),
    );
  }

  bool get _showStatusPanel =>
      liveState.isBusy ||
      liveUiState.kind == AssistantLiveUiKind.error ||
      liveUiState.kind == AssistantLiveUiKind.reconnecting ||
      liveUiState.kind == AssistantLiveUiKind.permissionDenied;
}
