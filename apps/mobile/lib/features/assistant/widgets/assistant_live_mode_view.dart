import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_activity_blob.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_status_panel.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_status_row.dart';
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
              liveState: liveState,
              liveUiState: liveUiState,
              onClose: onClose,
              onDisconnect: onDisconnect,
              onRetry: onRetry,
              showStatusDetail: !_showStatusPanel,
              showRetry: showRetry,
            ),
          ),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final compactHeight = constraints.maxHeight < 720;
                final hasTranscript =
                    chatState.messages.isNotEmpty || liveState.hasDraft;
                final showTranscriptPanel = hasTranscript || _showStatusPanel;
                final transcriptHeight = compactHeight ? 210.0 : 270.0;

                final body = Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _LiveStageCard(
                      liveState: liveState,
                      assistantName: assistantName,
                      userBlobCaption: userBlobCaption,
                      assistantBlobCaption: assistantBlobCaption,
                      cameraController: cameraController,
                    ),
                    if (_showStatusPanel) ...[
                      const SizedBox(height: 14),
                      AssistantLiveStatusPanel(
                        liveUiState: liveUiState,
                        liveState: liveState,
                        onRetry: onRetry,
                      ),
                    ],
                    if (showTranscriptPanel) ...[
                      const SizedBox(height: 14),
                      SizedBox(
                        height: transcriptHeight,
                        child: _LiveTranscriptCard(
                          chatState: chatState,
                          liveState: liveState,
                          assistantName: assistantName,
                          scrollController: scrollController,
                        ),
                      ),
                    ] else ...[
                      const SizedBox(height: 24),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Text(
                          context.l10n.assistantLiveTranscriptEmpty,
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                            height: 1.45,
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                    ],
                  ],
                );

                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: compactHeight
                      ? SingleChildScrollView(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: ConstrainedBox(
                            constraints: BoxConstraints(
                              minHeight: constraints.maxHeight,
                            ),
                            child: body,
                          ),
                        )
                      : body,
                );
              },
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 16, safeArea.bottom + 16),
            child: _LiveControlRail(
              liveState: liveState,
              onToggleMicrophone: onToggleMicrophone,
              onToggleCamera: onToggleCamera,
              onOpenTextEntry: onOpenTextEntry,
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

class _LiveModeHeader extends StatelessWidget {
  const _LiveModeHeader({
    required this.liveState,
    required this.liveUiState,
    required this.onClose,
    required this.onDisconnect,
    required this.onRetry,
    required this.showStatusDetail,
    required this.showRetry,
  });

  final AssistantLiveState liveState;
  final AssistantLiveUiState liveUiState;
  final Future<void> Function() onClose;
  final Future<void> Function() onDisconnect;
  final Future<void> Function() onRetry;
  final bool showStatusDetail;
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
              const SizedBox(height: 6),
              AssistantStatusBadge(
                label: liveUiState.statusLabel(context.l10n),
                color: _toneColor(theme, liveUiState.tone),
              ),
              if (showStatusDetail) ...[
                const SizedBox(height: 10),
                AssistantLiveStatusRow(
                  liveUiState: liveUiState,
                  liveState: liveState,
                ),
              ],
            ],
          ),
        ),
        if (showRetry)
          IconButton(
            tooltip: context.l10n.assistantLiveRetryAction,
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded),
          ),
        IconButton(
          tooltip: context.l10n.assistantLiveDisconnect,
          onPressed: onDisconnect,
          icon: Icon(
            Icons.call_end_rounded,
            color: theme.colorScheme.error,
          ),
        ),
      ],
    );
  }
}

class _LiveStageCard extends StatelessWidget {
  const _LiveStageCard({
    required this.liveState,
    required this.assistantName,
    required this.userBlobCaption,
    required this.assistantBlobCaption,
    required this.cameraController,
  });

  final AssistantLiveState liveState;
  final String assistantName;
  final String userBlobCaption;
  final String assistantBlobCaption;
  final CameraController? cameraController;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(32),
        border: Border.all(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.28),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
        child: Stack(
          children: [
            Column(
              children: [
                Text(
                  context.l10n.assistantLiveModelBadge,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 18),
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
              ],
            ),
            if (_showCameraPreview)
              Positioned(
                right: 0,
                top: 0,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: SizedBox(
                    width: 88,
                    height: 116,
                    child: CameraPreview(cameraController!),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  bool get _showCameraPreview =>
      liveState.isCameraActive &&
      cameraController != null &&
      cameraController!.value.isInitialized;
}

class _LiveTranscriptCard extends StatelessWidget {
  const _LiveTranscriptCard({
    required this.chatState,
    required this.liveState,
    required this.assistantName,
    required this.scrollController,
  });

  final AssistantChatState chatState;
  final AssistantLiveState liveState;
  final String assistantName;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasTranscript = chatState.messages.isNotEmpty || liveState.hasDraft;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.22),
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
            child: hasTranscript
                ? SingleChildScrollView(
                    controller: scrollController,
                    padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
                    child: AssistantTranscriptSection(
                      chatState: chatState,
                      liveState: liveState,
                      assistantName: assistantName,
                    ),
                  )
                : Padding(
                    padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
                    child: Center(
                      child: Text(
                        context.l10n.assistantLiveTranscriptEmpty,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                          height: 1.45,
                        ),
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _LiveControlRail extends StatelessWidget {
  const _LiveControlRail({
    required this.liveState,
    required this.onToggleMicrophone,
    required this.onToggleCamera,
    required this.onOpenTextEntry,
  });

  final AssistantLiveState liveState;
  final Future<void> Function() onToggleMicrophone;
  final Future<void> Function() onToggleCamera;
  final Future<void> Function() onOpenTextEntry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.22),
        ),
      ),
      child: Row(
        children: [
          _LiveControlButton(
            icon: liveState.isCameraActive
                ? Icons.videocam_rounded
                : Icons.videocam_off_rounded,
            label: liveState.isCameraActive
                ? context.l10n.assistantLiveHideCamera
                : context.l10n.assistantLiveShowCamera,
            onPressed: onToggleCamera,
            highlighted: liveState.isCameraActive,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _PrimaryLiveControlButton(
              icon: liveState.isMicrophoneActive
                  ? Icons.mic_rounded
                  : Icons.mic_off_rounded,
              label: liveState.isMicrophoneActive
                  ? context.l10n.assistantLiveMute
                  : context.l10n.assistantLiveListen,
              onPressed: onToggleMicrophone,
              active: liveState.isMicrophoneActive,
            ),
          ),
          const SizedBox(width: 12),
          _LiveControlButton(
            icon: Icons.keyboard_rounded,
            label: context.l10n.assistantLiveTypeMessage,
            onPressed: onOpenTextEntry,
          ),
        ],
      ),
    );
  }
}

class _PrimaryLiveControlButton extends StatelessWidget {
  const _PrimaryLiveControlButton({
    required this.icon,
    required this.label,
    required this.onPressed,
    required this.active,
  });

  final IconData icon;
  final String label;
  final Future<void> Function() onPressed;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final foreground = active
        ? theme.colorScheme.onPrimary
        : theme.colorScheme.onSurface;
    final background = active
        ? theme.colorScheme.primary
        : theme.colorScheme.surfaceContainerHigh;

    return Tooltip(
      message: label,
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: onPressed,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          decoration: BoxDecoration(
            color: background,
            borderRadius: BorderRadius.circular(24),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: foreground, size: 24),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: foreground,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
        ),
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
  });

  final IconData icon;
  final String label;
  final Future<void> Function() onPressed;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final foreground = highlighted
        ? theme.colorScheme.primary
        : theme.colorScheme.onSurfaceVariant;
    final background = highlighted
        ? theme.colorScheme.primary.withValues(alpha: 0.12)
        : theme.colorScheme.surfaceContainerLow;

    return Tooltip(
      message: label,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onPressed,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: background,
                  borderRadius: BorderRadius.circular(18),
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
