part of 'assistant_live_mode_view.dart';

class _LiveCallStage extends StatelessWidget {
  const _LiveCallStage({
    required this.liveState,
    required this.liveUiState,
    required this.assistantName,
    required this.cameraController,
    required this.onRetry,
    required this.onStart,
    required this.compact,
    super.key,
  });
  final AssistantLiveState liveState;
  final AssistantLiveUiState liveUiState;
  final String assistantName;
  final CameraController? cameraController;
  final Future<void> Function() onRetry;
  final Future<void> Function() onStart;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
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
    final canStart = idle && !recovery && liveUiState.isEligible;
    // One status line: what is happening now. The navbar already names the
    // assistant and the Start button says what to do, so idle needs none.
    final status = recovery
        ? liveUiState.statusLabel(l10n)
        : liveState.hasEnded && idle
        ? l10n.assistantLiveCallEnded
        : idle
        ? null
        : liveState.isBusy
        ? l10n.assistantLiveCallingAssistant(assistantName)
        : speaking
        ? l10n.assistantLiveStageAssistantSpeaking
        : liveState.isMicrophoneActive
        ? l10n.assistantLiveStageYouListening
        : l10n.assistantLiveStageYouMuted;
    final detail = recovery ? liveUiState.detailLabel(l10n, liveState) : null;
    final orb = SizedBox(
      height: compact ? 120 : 184,
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: AssistantLivePlaybackBlob(
          energy: liveState.assistantAudioLevel,
          bands: liveState.assistantSpectrum,
          active: speaking,
        ),
      ),
    );

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: double.infinity,
          child: Stack(
            alignment: Alignment.center,
            children: [
              if (canStart)
                Semantics(
                  button: true,
                  label: l10n.assistantLiveStartTalking,
                  excludeSemantics: true,
                  child: GestureDetector(
                    key: const ValueKey('live-stage-orb-start'),
                    behavior: HitTestBehavior.opaque,
                    onTap: () => unawaited(onStart()),
                    child: orb,
                  ),
                )
              else
                orb,
              if (connected &&
                  liveState.isCameraActive &&
                  cameraController?.value.isInitialized == true)
                PositionedDirectional(
                  end: 0,
                  top: 0,
                  child: Semantics(
                    label: l10n.assistantLiveCameraPreview,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadius.card),
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
        const SizedBox(height: AppSpacing.xl),
        if (status != null)
          Semantics(
            liveRegion: true,
            child: Text(
              status,
              key: const ValueKey('live-stage-status'),
              textAlign: TextAlign.center,
              style: tokens.typography.large.copyWith(
                fontWeight: FontWeight.w600,
                color: recovery
                    ? _toneColor(theme, liveUiState.tone)
                    : c.foreground,
              ),
            ),
          ),
        if (detail != null) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            detail,
            textAlign: TextAlign.center,
            style: tokens.typography.small.copyWith(
              color: c.mutedForeground,
              height: 1.45,
            ),
          ),
        ],
        if (recovery)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.lg),
            child: AppButton.outline(
              onPressed: onRetry,
              child: Text(l10n.assistantLiveRetryAction),
            ),
          ),
        if (canStart) ...[
          if (status != null) const SizedBox(height: AppSpacing.lg),
          AppButton.primary(
            key: const ValueKey('live-stage-start'),
            leading: const Icon(LucideIcons.mic),
            onPressed: () => unawaited(onStart()),
            child: Text(l10n.assistantLiveStartTalking),
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

  /// True when there is something to read; an empty transcript shows nothing.
  static bool hasContent(
    AssistantChatState chatState,
    AssistantLiveState liveState,
  ) =>
      (chatState.workspaceId == liveState.workspaceId &&
          (chatState.chat?.id ?? chatState.fallbackChatId) ==
              liveState.chatId &&
          chatState.messages.isNotEmpty) ||
      liveState.hasDraft ||
      liveState.completedTurns.isNotEmpty;

  @override
  Widget build(BuildContext context) => AssistantLiveTranscriptSection(
    chatState: chatState,
    liveState: liveState,
    assistantName: assistantName,
  );
}

Color _toneColor(ThemeData theme, AssistantLiveUiTone tone) => switch (tone) {
  AssistantLiveUiTone.neutral => theme.colorScheme.onSurfaceVariant,
  AssistantLiveUiTone.positive => theme.colorScheme.primary,
  AssistantLiveUiTone.warning => theme.colorScheme.tertiary,
  AssistantLiveUiTone.error => theme.colorScheme.error,
};
