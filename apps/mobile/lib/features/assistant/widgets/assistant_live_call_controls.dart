import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
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
    if (state.status != AssistantLiveConnectionStatus.connected) {
      return const SizedBox.shrink();
    }
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _CallButton(
          label: state.isMicrophoneActive
              ? context.l10n.assistantLiveMute
              : context.l10n.assistantLiveListen,
          icon: state.isMicrophoneActive
              ? Icons.mic_rounded
              : Icons.mic_off_rounded,
          active: state.isMicrophoneActive,
          onPressed: onMicrophone,
        ),
        _CallButton(
          label: state.isCameraActive
              ? context.l10n.assistantLiveHideCamera
              : context.l10n.assistantLiveShowCamera,
          icon: state.isCameraActive
              ? Icons.videocam_rounded
              : Icons.videocam_off_rounded,
          active: state.isCameraActive,
          onPressed: onCamera,
        ),
        _CallButton(
          label: context.l10n.assistantLiveTypeMessage,
          icon: Icons.keyboard_rounded,
          onPressed: onText,
        ),
        _CallButton(
          label: context.l10n.assistantLiveDisconnect,
          icon: Icons.call_end_rounded,
          onPressed: onDisconnect,
        ),
      ],
    );
  }
}

class _CallButton extends StatefulWidget {
  const _CallButton({
    required this.label,
    required this.icon,
    required this.onPressed,
    this.active,
  });
  final String label;
  final IconData icon;
  final Future<void> Function()? onPressed;
  final bool? active;
  @override
  State<_CallButton> createState() => _CallButtonState();
}

class _CallButtonState extends State<_CallButton> {
  bool _running = false;

  Future<void> _invoke() async {
    if (_running || widget.onPressed == null) return;
    setState(() => _running = true);
    try {
      await widget.onPressed!();
    } finally {
      if (mounted) setState(() => _running = false);
    }
  }

  @override
  Widget build(BuildContext context) => Semantics(
    toggled: widget.active,
    child: ShellDockActionButton(
      primary: widget.active ?? false,
      action: ShellActionSpec(
        id: 'live-control-${widget.icon.codePoint}',
        icon: widget.icon,
        tooltip: widget.label,
        enabled: !_running && widget.onPressed != null,
        onPressed: () => unawaited(_invoke()),
      ),
    ),
  );
}
