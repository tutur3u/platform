import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_activity_blob.dart';
import 'package:mobile/features/assistant/widgets/assistant_status_badge.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_section.dart';
import 'package:mobile/l10n/l10n.dart';

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
    final userBlobCaption = liveState.isMicrophoneActive
        ? context.l10n.assistantLiveStageYouListening
        : context.l10n.assistantLiveStageYouMuted;
    final assistantBlobCaption = liveState.isAssistantSpeaking
        ? context.l10n.assistantLiveStageAssistantSpeaking
        : context.l10n.assistantLiveStageAssistantReady;
    final showRetry = liveState.status == AssistantLiveConnectionStatus.error;

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            theme.colorScheme.surface,
            theme.colorScheme.surfaceContainerLowest,
          ],
        ),
      ),
      child: Column(
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(12, safeArea.top + 8, 12, 12),
            child: _LiveModeHeader(
              liveUiState: liveUiState,
              onClose: onClose,
              onRetry: onRetry,
              showRetry: showRetry,
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerLow,
                      borderRadius: BorderRadius.circular(28),
                      border: Border.all(
                        color: theme.colorScheme.outlineVariant.withValues(
                          alpha: 0.3,
                        ),
                      ),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
                      child: Stack(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: AssistantLiveActivityBlob(
                                  label: context.l10n.assistantYouLabel,
                                  caption: userBlobCaption,
                                  level: liveState.audioLevel,
                                  isActive: liveState.isMicrophoneActive,
                                  icon: liveState.isMicrophoneActive
                                      ? Icons.mic_rounded
                                      : Icons.mic_off_rounded,
                                  color: theme.colorScheme.primary,
                                ),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: AssistantLiveActivityBlob(
                                  label: assistantName,
                                  caption: assistantBlobCaption,
                                  level: liveState.assistantAudioLevel,
                                  isActive: liveState.isAssistantSpeaking,
                                  icon: liveState.isAssistantSpeaking
                                      ? Icons.graphic_eq_rounded
                                      : Icons.hearing_rounded,
                                  color: theme.colorScheme.tertiary,
                                ),
                              ),
                            ],
                          ),
                          if (_showCameraPreview)
                            Positioned(
                              right: 0,
                              top: 0,
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(18),
                                child: SizedBox(
                                  width: 92,
                                  height: 124,
                                  child: CameraPreview(cameraController!),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Expanded(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surface,
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(
                          color: theme.colorScheme.outlineVariant.withValues(
                            alpha: 0.22,
                          ),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(18, 16, 18, 10),
                            child: Text(
                              context.l10n.assistantLiveTranscriptTitle,
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          Expanded(
                            child:
                                chatState.messages.isEmpty &&
                                    !liveState.hasDraft
                                ? Padding(
                                    padding: const EdgeInsets.fromLTRB(
                                      18,
                                      0,
                                      18,
                                      18,
                                    ),
                                    child: Center(
                                      child: Text(
                                        context
                                            .l10n
                                            .assistantLiveTranscriptEmpty,
                                        textAlign: TextAlign.center,
                                        style: theme.textTheme.bodyMedium
                                            ?.copyWith(
                                              color: theme
                                                  .colorScheme
                                                  .onSurfaceVariant,
                                              height: 1.45,
                                            ),
                                      ),
                                    ),
                                  )
                                : SingleChildScrollView(
                                    controller: scrollController,
                                    padding: const EdgeInsets.fromLTRB(
                                      18,
                                      0,
                                      18,
                                      18,
                                    ),
                                    child: AssistantTranscriptSection(
                                      chatState: chatState,
                                      liveState: liveState,
                                      assistantName: assistantName,
                                    ),
                                  ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 16, safeArea.bottom + 16),
            child: _LiveControlRail(
              liveState: liveState,
              onToggleMicrophone: onToggleMicrophone,
              onToggleCamera: onToggleCamera,
              onDisconnect: onDisconnect,
              onOpenTextEntry: onOpenTextEntry,
            ),
          ),
        ],
      ),
    );
  }

  bool get _showCameraPreview =>
      liveState.isCameraActive &&
      cameraController != null &&
      cameraController!.value.isInitialized;
}

class _LiveModeHeader extends StatelessWidget {
  const _LiveModeHeader({
    required this.liveUiState,
    required this.onClose,
    required this.onRetry,
    required this.showRetry,
  });

  final AssistantLiveUiState liveUiState;
  final Future<void> Function() onClose;
  final Future<void> Function() onRetry;
  final bool showRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      children: [
        IconButton(
          tooltip: context.l10n.assistantLiveReturnToChat,
          onPressed: onClose,
          icon: const Icon(Icons.arrow_back_rounded),
        ),
        const SizedBox(width: 4),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                context.l10n.assistantLiveTitle,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  AssistantStatusBadge(
                    label: liveUiState.statusLabel(context.l10n),
                    color: _toneColor(theme, liveUiState.tone),
                  ),
                  _ModelBadge(label: context.l10n.assistantLiveModelBadge),
                ],
              ),
            ],
          ),
        ),
        if (showRetry)
          IconButton(
            tooltip: context.l10n.assistantLiveRetryAction,
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded),
          ),
      ],
    );
  }
}

class _ModelBadge extends StatelessWidget {
  const _ModelBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelLarge?.copyWith(
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _LiveControlRail extends StatelessWidget {
  const _LiveControlRail({
    required this.liveState,
    required this.onToggleMicrophone,
    required this.onToggleCamera,
    required this.onDisconnect,
    required this.onOpenTextEntry,
  });

  final AssistantLiveState liveState;
  final Future<void> Function() onToggleMicrophone;
  final Future<void> Function() onToggleCamera;
  final Future<void> Function() onDisconnect;
  final Future<void> Function() onOpenTextEntry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: Theme.of(
            context,
          ).colorScheme.outlineVariant.withValues(alpha: 0.22),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: _LiveControlButton(
              icon: liveState.isMicrophoneActive
                  ? Icons.mic_rounded
                  : Icons.mic_off_rounded,
              label: liveState.isMicrophoneActive
                  ? context.l10n.assistantLiveMute
                  : context.l10n.assistantLiveListen,
              onPressed: onToggleMicrophone,
              highlighted: liveState.isMicrophoneActive,
            ),
          ),
          Expanded(
            child: _LiveControlButton(
              icon: liveState.isCameraActive
                  ? Icons.videocam_rounded
                  : Icons.videocam_off_rounded,
              label: liveState.isCameraActive
                  ? context.l10n.assistantLiveHideCamera
                  : context.l10n.assistantLiveShowCamera,
              onPressed: onToggleCamera,
              highlighted: liveState.isCameraActive,
            ),
          ),
          Expanded(
            child: _LiveControlButton(
              icon: Icons.keyboard_rounded,
              label: context.l10n.assistantLiveTypeMessage,
              onPressed: onOpenTextEntry,
            ),
          ),
          Expanded(
            child: _LiveControlButton(
              icon: Icons.call_end_rounded,
              label: context.l10n.assistantLiveDisconnect,
              onPressed: onDisconnect,
              danger: true,
            ),
          ),
        ],
      ),
    );
  }
}

class _LiveControlButton extends StatelessWidget {
  const _LiveControlButton({
    required this.icon,
    required this.label,
    required this.onPressed,
    this.highlighted = false,
    this.danger = false,
  });

  final IconData icon;
  final String label;
  final Future<void> Function() onPressed;
  final bool highlighted;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final foreground = danger
        ? theme.colorScheme.error
        : highlighted
        ? theme.colorScheme.primary
        : theme.colorScheme.onSurfaceVariant;
    final background = danger
        ? theme.colorScheme.error.withValues(alpha: 0.1)
        : highlighted
        ? theme.colorScheme.primary.withValues(alpha: 0.12)
        : Colors.transparent;

    return Tooltip(
      message: label,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onPressed,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: background,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(icon, color: foreground, size: 22),
              ),
              const SizedBox(height: 8),
              Text(
                label,
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: foreground,
                  fontWeight: FontWeight.w700,
                  height: 1.2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Color _toneColor(ThemeData theme, AssistantLiveUiTone tone) {
  return switch (tone) {
    AssistantLiveUiTone.neutral => theme.colorScheme.onSurfaceVariant,
    AssistantLiveUiTone.positive => theme.colorScheme.primary,
    AssistantLiveUiTone.warning => theme.colorScheme.tertiary,
    AssistantLiveUiTone.error => theme.colorScheme.error,
  };
}
