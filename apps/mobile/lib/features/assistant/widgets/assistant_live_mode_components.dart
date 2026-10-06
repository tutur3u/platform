part of 'assistant_live_mode_view.dart';

class _LiveIdleState extends StatelessWidget {
  const _LiveIdleState();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircleAvatar(
                radius: 30,
                backgroundColor: theme.colorScheme.surfaceContainerHigh,
                child: Icon(
                  Icons.graphic_eq_rounded,
                  size: 28,
                  color: theme.colorScheme.onSurface,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                context.l10n.assistantLiveIdleHeading,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                context.l10n.assistantLiveDescriptionIdle,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LiveConnectingState extends StatelessWidget {
  const _LiveConnectingState({
    required this.assistantName,
    required this.liveUiState,
    required this.liveState,
  });
  final AssistantLiveState liveState;
  final String assistantName;
  final AssistantLiveUiState liveUiState;
  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const NovaLoadingIndicator(size: 96),
          const SizedBox(height: 24),
          Text(
            context.l10n.assistantLiveCallingAssistant(assistantName),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 12),
          Semantics(
            liveRegion: true,
            child: Text(
              liveUiState.statusLabel(context.l10n),
              textAlign: TextAlign.center,
            ),
          ),
          if (liveUiState.kind == AssistantLiveUiKind.reconnecting) ...[
            const SizedBox(height: 8),
            Text(
              liveUiState.detailLabel(context.l10n, liveState),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    ),
  );
}

class _LiveModeHeader extends StatelessWidget {
  const _LiveModeHeader({
    required this.liveState,
    required this.liveUiState,
    required this.onRetry,
  });

  final AssistantLiveState liveState;
  final AssistantLiveUiState liveUiState;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final needsRecovery =
        liveUiState.kind == AssistantLiveUiKind.error ||
        liveUiState.kind == AssistantLiveUiKind.reconnecting;
    return Row(
      children: [
        Icon(
          liveState.isBusy ? Icons.sync_rounded : Icons.graphic_eq_rounded,
          size: 20,
          color: _toneColor(theme, liveUiState.tone),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                liveUiState.statusLabel(context.l10n),
                style: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              if (needsRecovery ||
                  liveUiState.kind == AssistantLiveUiKind.permissionDenied) ...[
                const SizedBox(height: 2),
                Text(
                  liveUiState.detailLabel(context.l10n, liveState),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ],
          ),
        ),
        if (needsRecovery)
          TextButton(
            onPressed: onRetry,
            child: Text(context.l10n.assistantLiveRetryAction),
          ),
      ],
    );
  }
}

class _LiveCallStage extends StatelessWidget {
  const _LiveCallStage({
    required this.liveState,
    required this.liveUiState,
    required this.assistantName,
    required this.userBlobCaption,
    required this.assistantBlobCaption,
    required this.cameraController,
  });
  final AssistantLiveState liveState;
  final AssistantLiveUiState liveUiState;
  final String assistantName;
  final String userBlobCaption;
  final String assistantBlobCaption;
  final CameraController? cameraController;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final speakingLevel = liveState.assistantAudioLevel.isFinite
        ? liveState.assistantAudioLevel.clamp(0.0, 1.0)
        : 0.0;
    final recovering =
        liveUiState.kind == AssistantLiveUiKind.error ||
        liveUiState.kind == AssistantLiveUiKind.reconnecting ||
        liveUiState.kind == AssistantLiveUiKind.permissionDenied;
    final caption = recovering
        ? null
        : liveUiState.kind == AssistantLiveUiKind.live
        ? assistantBlobCaption
        : liveUiState.statusLabel(context.l10n);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AssistantLivePlaybackBlob(
                energy: speakingLevel,
                bands: liveState.assistantSpectrum,
                active: liveState.isAssistantSpeaking,
              ),
              const SizedBox(height: 20),
              Text(
                assistantName,
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              if (caption != null)
                Semantics(
                  liveRegion: true,
                  child: Text(
                    caption,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              const SizedBox(height: 16),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    liveState.isMicrophoneActive
                        ? Icons.mic_rounded
                        : Icons.mic_off_rounded,
                    size: 16,
                  ),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(userBlobCaption, textAlign: TextAlign.center),
                  ),
                ],
              ),
            ],
          ),
          if (liveState.isCameraActive &&
              cameraController?.value.isInitialized == true)
            Positioned(
              right: 0,
              top: 0,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  width: 64,
                  height: 76,
                  child: CameraPreview(cameraController!),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _LiveTranscript extends StatelessWidget {
  const _LiveTranscript({
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

    return Column(
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
                  child: AssistantLiveTranscriptSection(
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
