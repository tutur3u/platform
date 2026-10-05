import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// Content for the existing shell dock, never a second floating surface.
class AssistantLiveCallControls extends StatelessWidget {
  const AssistantLiveCallControls({
    required this.state,
    required this.onMicrophone,
    required this.onCamera,
    required this.onText,
    required this.onDisconnect,
    super.key,
  });
  final AssistantLiveState state;
  final Future<void> Function() onMicrophone;
  final Future<void> Function() onCamera;
  final Future<void> Function() onText;
  final Future<void> Function() onDisconnect;

  @override
  Widget build(BuildContext context) {
    final connected = state.status == AssistantLiveConnectionStatus.connected;
    final idle = state.status == AssistantLiveConnectionStatus.disconnected;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _CallButton(
          label: idle
              ? context.l10n.assistantLiveConnect
              : state.isMicrophoneActive
              ? context.l10n.assistantLiveMute
              : context.l10n.assistantLiveListen,
          icon: state.isMicrophoneActive
              ? Icons.mic_rounded
              : Icons.mic_off_rounded,
          active: state.isMicrophoneActive,
          onPressed: state.isBusy ? null : onMicrophone,
        ),
        _CallButton(
          label: state.isCameraActive
              ? context.l10n.assistantLiveHideCamera
              : context.l10n.assistantLiveShowCamera,
          icon: state.isCameraActive
              ? Icons.videocam_rounded
              : Icons.videocam_off_rounded,
          active: state.isCameraActive,
          onPressed: connected ? onCamera : null,
        ),
        _CallButton(
          label: context.l10n.assistantLiveTypeMessage,
          icon: Icons.keyboard_rounded,
          onPressed: onText,
        ),
        _CallButton(
          label: context.l10n.assistantLiveDisconnect,
          icon: Icons.call_end_rounded,
          onPressed: idle ? null : onDisconnect,
        ),
      ],
    );
  }
}

class _CallButton extends StatelessWidget {
  const _CallButton({
    required this.label,
    required this.icon,
    required this.onPressed,
    this.active = false,
  });
  final String label;
  final IconData icon;
  final Future<void> Function()? onPressed;
  final bool active;
  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return IconButton(
      tooltip: label,
      onPressed: onPressed,
      icon: Icon(icon),
      style: IconButton.styleFrom(
        minimumSize: const Size(44, 48),
        backgroundColor: active ? colors.primaryContainer : Colors.transparent,
        foregroundColor: active ? colors.onPrimaryContainer : colors.onSurface,
      ),
    );
  }
}
