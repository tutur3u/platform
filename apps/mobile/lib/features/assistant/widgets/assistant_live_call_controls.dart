import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_geometry.dart';
import 'package:mobile/features/shell/view/shell_dock_control_item.dart';
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
    final l10n = context.l10n;
    return SizedBox(
      height: assistantComposerHeight(context),
      child: Padding(
        padding: const EdgeInsets.all(2),
        child: Row(
          children: [
            _CallButton(
              key: const ValueKey('live-control-microphone'),
              label: state.isMicrophoneActive
                  ? l10n.assistantLiveMute
                  : l10n.assistantLiveListen,
              icon: state.isMicrophoneActive
                  ? LucideIcons.mic
                  : LucideIcons.micOff,
              active: state.isMicrophoneActive,
              onPressed: state.isBusy && !state.isMicrophoneActive
                  ? null
                  : onMicrophone,
            ),
            _CallButton(
              key: const ValueKey('live-control-camera'),
              label: state.isCameraActive
                  ? l10n.assistantLiveHideCamera
                  : l10n.assistantLiveShowCamera,
              icon: state.isCameraActive
                  ? LucideIcons.video
                  : LucideIcons.videoOff,
              active: state.isCameraActive,
              onPressed: connected || (state.isBusy && state.isCameraActive)
                  ? onCamera
                  : null,
            ),
            _CallButton(
              key: const ValueKey('live-control-keyboard'),
              label: l10n.assistantLiveTypeMessage,
              icon: LucideIcons.keyboard,
              onPressed: onText,
            ),
            _CallButton(
              key: const ValueKey('live-control-exit'),
              label: connected
                  ? l10n.assistantLiveDisconnect
                  : state.isBusy
                  ? l10n.assistantLiveCancelCall
                  : l10n.assistantLiveReturnToChat,
              icon: connected || state.isBusy
                  ? LucideIcons.phoneOff
                  : LucideIcons.x,
              destructive: connected || state.isBusy,
              onPressed: onDisconnect,
            ),
          ],
        ),
      ),
    );
  }
}

class _CallButton extends StatefulWidget {
  const _CallButton({
    required this.label,
    required this.icon,
    required this.onPressed,
    required super.key,
    this.active,
    this.destructive = false,
  });
  final String label;
  final IconData icon;
  final Future<void> Function()? onPressed;
  final bool? active;
  final bool destructive;
  @override
  State<_CallButton> createState() => _CallButtonState();
}

class _CallButtonState extends State<_CallButton> {
  bool _startingMedia = false;
  bool _running = false;

  bool get _canInvoke =>
      widget.onPressed != null &&
      !_running &&
      (!_startingMedia || widget.active == true);

  Future<void> _invoke() async {
    if (!_canInvoke) return;
    final startingMedia = widget.active == false;
    setState(() {
      if (startingMedia) {
        _startingMedia = true;
      } else {
        _running = true;
      }
    });
    unawaited(AppHaptics.selection());
    try {
      await widget.onPressed!();
    } finally {
      if (mounted) {
        setState(() {
          if (startingMedia) {
            _startingMedia = false;
          } else {
            _running = false;
          }
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Expanded(
    child: ShellDockControlItem(
      label: widget.label,
      icon: widget.icon,
      toggled: widget.active,
      destructive: widget.destructive,
      onPressed: _canInvoke ? () => unawaited(_invoke()) : null,
    ),
  );
}
