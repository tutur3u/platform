import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_playback_blob.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_screen_control.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_transcript_section.dart';
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
    this.onReturnToCall,
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

  /// Reopens the full-screen call while a call is connecting or connected.
  final Future<void> Function()? onReturnToCall;
  final CameraController? cameraController;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      // Gutters follow the body width, not the window.
      builder: (context, constraints) => SingleChildScrollView(
        key: const ValueKey('live-conversation-scroll'),
        controller: scrollController,
        padding:
            EdgeInsets.symmetric(
              horizontal: AppPageInsets.gutterOf(
                context,
                width: constraints.maxWidth,
              ),
            ).copyWith(
              top: floatingShellHeaderInset(context) + 16,
              bottom: MediaQuery.paddingOf(context).bottom + 24,
            ),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (onReturnToCall != null &&
                    (liveState.isBusy ||
                        liveState.status ==
                            AssistantLiveConnectionStatus.connected)) ...[
                  AppButton(
                    key: const ValueKey('live-return-to-call'),
                    onPressed: () => unawaited(onReturnToCall!()),
                    leading: const Icon(LucideIcons.phone),
                    child: Text(context.l10n.assistantLiveCallReturn),
                  ),
                  const SizedBox(height: 16),
                ],
                _LiveCallStage(
                  key: const ValueKey('live-call-stage'),
                  liveState: liveState,
                  liveUiState: liveUiState,
                  assistantName: assistantName,
                  cameraController: cameraController,
                  onRetry: onRetry,
                  compact: constraints.maxHeight < 500,
                ),
                if (liveState.status == AssistantLiveConnectionStatus.connected)
                  AssistantLiveScreenControl(state: liveState),
                const SizedBox(height: 24),
                _LiveTranscript(
                  key: const ValueKey('live-retained-transcript'),
                  chatState: chatState,
                  liveState: liveState,
                  assistantName: assistantName,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
