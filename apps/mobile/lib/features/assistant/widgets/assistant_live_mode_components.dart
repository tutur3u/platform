part of 'assistant_live_mode_view.dart';

class _LiveModeHeader extends StatelessWidget {
  const _LiveModeHeader({
    required this.liveState,
    required this.liveUiState,
    required this.onClose,
    required this.onDisconnect,
    required this.onRetry,
    required this.showRetry,
  });

  final AssistantLiveState liveState;
  final AssistantLiveUiState liveUiState;
  final Future<void> Function() onClose;
  final Future<void> Function() onDisconnect;
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
              const SizedBox(height: 6),
              AssistantStatusBadge(
                label: liveUiState.statusLabel(context.l10n),
                color: _toneColor(theme, liveUiState.tone),
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
        IconButton(
          tooltip: context.l10n.assistantLiveDisconnect,
          onPressed: onDisconnect,
          icon: Icon(Icons.call_end_rounded, color: theme.colorScheme.error),
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
    final labels =
        MediaQuery.sizeOf(context).width >= 600 &&
        MediaQuery.textScalerOf(context).scale(14) < 24;
    return Material(
      color: theme.colorScheme.surfaceContainerLow,
      shape: StadiumBorder(
        side: BorderSide(
          color: theme.colorScheme.outlineVariant.withValues(alpha: .4),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _LiveControlButton(
              icon: liveState.isCameraActive
                  ? Icons.videocam_rounded
                  : Icons.videocam_off_rounded,
              label: liveState.isCameraActive
                  ? context.l10n.assistantLiveHideCamera
                  : context.l10n.assistantLiveShowCamera,
              showLabel: labels,
              onPressed: onToggleCamera,
              active: liveState.isCameraActive,
            ),
            const SizedBox(width: 6),
            _LiveControlButton(
              icon: liveState.isMicrophoneActive
                  ? Icons.mic_rounded
                  : Icons.mic_off_rounded,
              label: liveState.isMicrophoneActive
                  ? context.l10n.assistantLiveMute
                  : context.l10n.assistantLiveListen,
              showLabel: labels,
              onPressed: onToggleMicrophone,
              active: liveState.isMicrophoneActive,
            ),
            const SizedBox(width: 6),
            _LiveControlButton(
              icon: Icons.keyboard_rounded,
              label: context.l10n.assistantLiveTypeMessage,
              showLabel: labels,
              onPressed: onOpenTextEntry,
            ),
          ],
        ),
      ),
    );
  }
}

class _LiveControlButton extends StatelessWidget {
  const _LiveControlButton({
    required this.icon,
    required this.label,
    required this.showLabel,
    required this.onPressed,
    this.active = false,
  });
  final IconData icon;
  final String label;
  final bool showLabel;
  final bool active;
  final Future<void> Function() onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final style = IconButton.styleFrom(
      backgroundColor: active
          ? theme.colorScheme.primaryContainer
          : Colors.transparent,
      foregroundColor: active
          ? theme.colorScheme.onPrimaryContainer
          : theme.colorScheme.onSurface,
      minimumSize: const Size(48, 48),
    );
    return Tooltip(
      message: label,
      child: showLabel
          ? TextButton.icon(
              style: style,
              onPressed: onPressed,
              icon: Icon(icon),
              label: Text(label),
            )
          : IconButton(
              style: style,
              onPressed: onPressed,
              tooltip: label,
              icon: Icon(icon),
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
