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
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.28),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Stack(
          children: [
            Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _LiveSignal(
                        label: context.l10n.assistantYouLabel,
                        caption: userBlobCaption,
                        isActive: liveState.isMicrophoneActive,
                        icon: liveState.isMicrophoneActive
                            ? Icons.mic_rounded
                            : Icons.mic_off_rounded,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _LiveSignal(
                        label: assistantName,
                        caption: assistantBlobCaption,
                        isActive: liveState.isAssistantSpeaking,
                        icon: liveState.isAssistantSpeaking
                            ? Icons.graphic_eq_rounded
                            : Icons.hearing_rounded,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            if (_showCameraPreview)
              Positioned(
                right: 0,
                bottom: 0,
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
      ),
    );
  }

  bool get _showCameraPreview =>
      liveState.isCameraActive &&
      cameraController != null &&
      cameraController!.value.isInitialized;
}

class _LiveSignal extends StatelessWidget {
  const _LiveSignal({
    required this.label,
    required this.caption,
    required this.isActive,
    required this.icon,
  });

  final String label;
  final String caption;
  final bool isActive;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        CircleAvatar(
          radius: 20,
          backgroundColor: isActive
              ? theme.colorScheme.primaryContainer
              : theme.colorScheme.surfaceContainerHigh,
          child: Icon(
            icon,
            size: 20,
            color: isActive
                ? theme.colorScheme.onPrimaryContainer
                : theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
              Text(
                caption,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
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
    required this.onDisconnect,
  });
  final AssistantLiveState liveState;
  final Future<void> Function() onToggleMicrophone;
  final Future<void> Function() onToggleCamera;
  final Future<void> Function() onOpenTextEntry;
  final Future<void> Function() onDisconnect;

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
            const SizedBox(width: 6),
            _LiveControlButton(
              icon: Icons.call_end_rounded,
              label: context.l10n.assistantLiveDisconnect,
              showLabel: false,
              onPressed: onDisconnect,
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
