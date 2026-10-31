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
              status: state.status,
              label: state.isMicrophoneActive
                  ? l10n.assistantLiveMute
                  : l10n.assistantLiveListen,
              // A crossed-out mic means muted, so only show it in a call.
              icon: state.isMicrophoneActive || !connected
                  ? LucideIcons.mic
                  : LucideIcons.micOff,
              active: state.isMicrophoneActive,
              onPressed: state.isBusy && !state.isMicrophoneActive
                  ? null
                  : onMicrophone,
            ),
            _CallButton(
              key: const ValueKey('live-control-camera'),
              status: state.status,
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
              status: state.status,
              label: l10n.assistantLiveTypeMessage,
              icon: LucideIcons.keyboard,
              onPressed: onText,
            ),
            _CallButton(
              key: const ValueKey('live-control-exit'),
              status: state.status,
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
    required this.status,
    required this.label,
    required this.icon,
    required this.onPressed,
    required super.key,
    this.active,
    this.destructive = false,
  });
  final AssistantLiveConnectionStatus status;
  final String label;
  final IconData icon;
  final Future<void> Function()? onPressed;
  final bool? active;
  final bool destructive;
  @override
  State<_CallButton> createState() => _CallButtonState();
}

class _CallButtonState extends State<_CallButton> {
  Object? _startingMediaAttempt;
  Object? _actionAttempt;

  @override
  void didUpdateWidget(covariant _CallButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.status != widget.status &&
        (widget.status == AssistantLiveConnectionStatus.disconnected ||
            widget.status == AssistantLiveConnectionStatus.error)) {
      _startingMediaAttempt = null;
      _actionAttempt = null;
    }
  }

  bool get _canInvoke =>
      widget.onPressed != null &&
      _actionAttempt == null &&
      (_startingMediaAttempt == null || widget.active == true);

  Future<void> _invoke() async {
    if (!_canInvoke) return;
    final startingMedia = widget.active == false;
    final attempt = Object();
    setState(() {
      if (startingMedia) {
        _startingMediaAttempt = attempt;
      } else {
        _actionAttempt = attempt;
      }
    });
    unawaited(AppHaptics.selection());
    try {
      await widget.onPressed!();
    } finally {
      if (mounted) {
        setState(() {
          if (identical(_startingMediaAttempt, attempt)) {
            _startingMediaAttempt = null;
          }
          if (identical(_actionAttempt, attempt)) {
            _actionAttempt = null;
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
