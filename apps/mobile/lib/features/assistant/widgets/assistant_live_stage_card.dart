import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantLiveStageCard extends StatelessWidget {
  const AssistantLiveStageCard({
    required this.liveState,
    required this.cameraController,
    required this.onRetry,
    required this.onDisconnect,
    required this.onCameraToggle,
    super.key,
  });

  final AssistantLiveState liveState;
  final CameraController? cameraController;
  final Future<void> Function() onRetry;
  final Future<void> Function() onDisconnect;
  final Future<void> Function() onCameraToggle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: _statusColor(theme, liveState.status).withValues(alpha: 0.18),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: _statusColor(theme, liveState.status).withValues(
                alpha: 0.14,
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              liveState.isMicrophoneActive
                  ? Icons.mic_rounded
                  : Icons.graphic_eq_rounded,
              size: 18,
              color: _statusColor(theme, liveState.status),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.l10n.assistantLiveTitle,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _stageSummary(context, liveState),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          if (_showCameraPreview)
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: SizedBox(
                  width: 38,
                  height: 48,
                  child: CameraPreview(cameraController!),
                ),
              ),
            ),
          if (liveState.status == AssistantLiveConnectionStatus.error)
            _CompactLiveAction(
              tooltip: context.l10n.assistantLiveConnect,
              icon: Icons.refresh_rounded,
              onPressed: onRetry,
            )
          else ...[
            _CompactLiveAction(
              tooltip: liveState.isCameraActive
                  ? context.l10n.assistantLiveHideCamera
                  : context.l10n.assistantLiveShowCamera,
              icon: liveState.isCameraActive
                  ? Icons.videocam_rounded
                  : Icons.videocam_off_rounded,
              onPressed: onCameraToggle,
            ),
            _CompactLiveAction(
              tooltip: context.l10n.assistantLiveDisconnect,
              icon: Icons.close_rounded,
              onPressed: onDisconnect,
            ),
          ],
        ],
      ),
    );
  }

  bool get _showCameraPreview =>
      liveState.isCameraActive &&
      cameraController != null &&
      cameraController!.value.isInitialized;
}

class _CompactLiveAction extends StatelessWidget {
  const _CompactLiveAction({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final Future<void> Function() onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: tooltip,
      visualDensity: VisualDensity.compact,
      constraints: const BoxConstraints.tightFor(width: 34, height: 34),
      padding: EdgeInsets.zero,
      onPressed: onPressed,
      icon: Icon(icon, size: 18),
    );
  }
}

Color _statusColor(ThemeData theme, AssistantLiveConnectionStatus status) {
  return switch (status) {
    AssistantLiveConnectionStatus.disconnected => theme.colorScheme.outline,
    AssistantLiveConnectionStatus.preparing => theme.colorScheme.secondary,
    AssistantLiveConnectionStatus.connecting => theme.colorScheme.primary,
    AssistantLiveConnectionStatus.connected => theme.colorScheme.primary,
    AssistantLiveConnectionStatus.reconnecting => theme.colorScheme.tertiary,
    AssistantLiveConnectionStatus.error => theme.colorScheme.error,
  };
}

String _stageSummary(BuildContext context, AssistantLiveState liveState) {
  if (liveState.error?.isNotEmpty == true) {
    return liveState.error!;
  }
  if (liveState.goAwayTimeLeft?.isNotEmpty == true) {
    return context.l10n.assistantLiveReconnectBanner(
      liveState.goAwayTimeLeft!,
    );
  }
  if (liveState.microphonePermission == AssistantLivePermissionState.denied ||
      liveState.cameraPermission == AssistantLivePermissionState.denied) {
    return context.l10n.assistantLivePermissionDenied;
  }

  final l10n = context.l10n;
  return switch (liveState.status) {
    AssistantLiveConnectionStatus.disconnected =>
      l10n.assistantLiveDescriptionIdle,
    AssistantLiveConnectionStatus.preparing =>
      l10n.assistantLiveDescriptionPreparing,
    AssistantLiveConnectionStatus.connecting =>
      l10n.assistantLiveDescriptionConnecting,
    AssistantLiveConnectionStatus.connected =>
      liveState.isMicrophoneActive
          ? l10n.assistantLiveDescriptionListening
          : l10n.assistantLiveDescriptionReady,
    AssistantLiveConnectionStatus.reconnecting =>
      l10n.assistantLiveDescriptionReconnecting,
    AssistantLiveConnectionStatus.error => l10n.assistantLiveDescriptionError,
  };
}
