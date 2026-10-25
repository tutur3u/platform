part of 'assistant_live_mode_view.dart';

class _LiveCallStage extends StatelessWidget {
  const _LiveCallStage({
    required this.liveState,
    required this.liveUiState,
    required this.assistantName,
    required this.cameraController,
    required this.onRetry,
    required this.compact,
    super.key,
  });
  final AssistantLiveState liveState;
  final AssistantLiveUiState liveUiState;
  final String assistantName;
  final CameraController? cameraController;
  final Future<void> Function() onRetry;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    final connected =
        liveState.status == AssistantLiveConnectionStatus.connected;
    final idle = liveState.status == AssistantLiveConnectionStatus.disconnected;
    final recovery = switch (liveUiState.kind) {
      AssistantLiveUiKind.error ||
      AssistantLiveUiKind.reconnecting ||
      AssistantLiveUiKind.permissionDenied => true,
      _ => false,
    };
    final speaking = connected && liveState.isAssistantSpeaking;
    final status = recovery
        ? liveUiState.statusLabel(l10n)
        : liveState.hasEnded && idle
        ? l10n.assistantLiveCallEnded
        : idle
        ? l10n.assistantLiveIdleHeading
        : connected
        ? speaking
              ? l10n.assistantLiveStageAssistantSpeaking
              : l10n.assistantLiveStageAssistantReady
        : liveUiState.statusLabel(l10n);
    final detail = recovery || liveState.isBusy
        ? liveUiState.detailLabel(l10n, liveState)
        : idle && !liveState.hasEnded
        ? l10n.assistantLiveDescriptionIdle
        : null;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: double.infinity,
          child: Stack(
            alignment: Alignment.center,
            children: [
              SizedBox(
                height: compact ? 120 : 184,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: AssistantLivePlaybackBlob(
                    energy: liveState.assistantAudioLevel,
                    bands: liveState.assistantSpectrum,
                    active: speaking,
                  ),
                ),
              ),
              if (connected &&
                  liveState.isCameraActive &&
                  cameraController?.value.isInitialized == true)
                PositionedDirectional(
                  end: 0,
                  top: 0,
                  child: Semantics(
                    label: l10n.assistantLiveCameraPreview,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: SizedBox(
                        width: 64,
                        height: 80,
                        child: CameraPreview(cameraController!),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text(
          liveState.isBusy
              ? l10n.assistantLiveCallingAssistant(assistantName)
              : assistantName,
          textAlign: TextAlign.center,
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        Semantics(
          liveRegion: true,
          child: Text(
            status,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyLarge?.copyWith(
              color: recovery
                  ? _toneColor(theme, liveUiState.tone)
                  : theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        if (detail != null) ...[
          const SizedBox(height: 12),
          Text(
            detail,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              height: 1.5,
            ),
          ),
        ],
        if (recovery)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: AppButton.outline(
              onPressed: onRetry,
              child: Text(l10n.assistantLiveRetryAction),
            ),
          ),
        if (connected && !recovery) ...[
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                liveState.isMicrophoneActive
                    ? LucideIcons.mic
                    : LucideIcons.micOff,
                size: 16,
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  liveState.isMicrophoneActive
                      ? l10n.assistantLiveStageYouListening
                      : l10n.assistantLiveStageYouMuted,
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _LiveTranscript extends StatelessWidget {
  const _LiveTranscript({
    required this.chatState,
    required this.liveState,
    required this.assistantName,
    super.key,
  });
  final AssistantChatState chatState;
  final AssistantLiveState liveState;
  final String assistantName;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasHistory =
        chatState.workspaceId == liveState.workspaceId &&
        (chatState.chat?.id ?? chatState.fallbackChatId) == liveState.chatId &&
        chatState.messages.isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 18),
          child: Text(
            context.l10n.assistantLiveTranscriptTitle,
            style: theme.textTheme.titleSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        AssistantLiveTranscriptSection(
          chatState: chatState,
          liveState: liveState,
          assistantName: assistantName,
        ),
        if (!hasHistory &&
            !liveState.hasDraft &&
            liveState.completedTurns.isEmpty)
          Text(
            context.l10n.assistantLiveTranscriptEmpty,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              height: 1.5,
            ),
          ),
      ],
    );
  }
}

Color _toneColor(ThemeData theme, AssistantLiveUiTone tone) => switch (tone) {
  AssistantLiveUiTone.neutral => theme.colorScheme.onSurfaceVariant,
  AssistantLiveUiTone.positive => theme.colorScheme.primary,
  AssistantLiveUiTone.warning => theme.colorScheme.tertiary,
  AssistantLiveUiTone.error => theme.colorScheme.error,
};
