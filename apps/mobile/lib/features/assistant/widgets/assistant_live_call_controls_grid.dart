import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_button.dart';
import 'package:mobile/l10n/l10n.dart';

/// Phone-style control grid: mute, camera and keyboard above; captions, the
/// red End button and minimize below. Unavailable controls stay in place but
/// disabled, so the layout does not shift as the call connects.
class AssistantLiveCallControlsGrid extends StatelessWidget {
  const AssistantLiveCallControlsGrid({
    required this.connected,
    required this.microphoneOn,
    required this.cameraOn,
    required this.captionsOpen,
    required this.onMicrophone,
    required this.onMinimize,
    required this.onCamera,
    required this.onKeyboard,
    required this.onCaptions,
    required this.onEnd,
    super.key,
  });

  final bool connected;
  final bool microphoneOn;
  final bool cameraOn;
  final bool captionsOpen;
  final Future<void> Function() onMicrophone;
  final Future<void> Function() onMinimize;
  final Future<void> Function() onCamera;
  final Future<void> Function() onKeyboard;
  final Future<void> Function() onCaptions;
  final Future<void> Function() onEnd;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    Future<void> Function()? whenConnected(Future<void> Function()? action) =>
        connected ? action : null;
    final rows = [
      [
        AssistantLiveCallButton(
          icon: microphoneOn ? LucideIcons.mic : LucideIcons.micOff,
          label: l10n.assistantLiveCallMute,
          // Muted is a call state; before connecting the mic is simply idle.
          toggled: connected && !microphoneOn,
          onPressed: whenConnected(onMicrophone),
        ),
        AssistantLiveCallButton(
          icon: cameraOn ? LucideIcons.video : LucideIcons.videoOff,
          label: l10n.assistantLiveCallCamera,
          toggled: cameraOn,
          onPressed: whenConnected(onCamera),
        ),
        AssistantLiveCallButton(
          icon: LucideIcons.keyboard,
          label: l10n.assistantLiveCallKeyboard,
          onPressed: whenConnected(onKeyboard),
        ),
      ],
      [
        AssistantLiveCallButton(
          icon: LucideIcons.captions,
          label: l10n.assistantLiveCallCaptions,
          toggled: captionsOpen,
          onPressed: onCaptions,
        ),
        AssistantLiveCallButton(
          key: const ValueKey('assistant-live-call-end'),
          icon: LucideIcons.phoneOff,
          label: l10n.assistantLiveCallEnd,
          tone: AssistantLiveCallButtonTone.end,
          diameter: 72,
          onPressed: onEnd,
        ),
        AssistantLiveCallButton(
          key: const ValueKey('assistant-live-call-minimize'),
          icon: LucideIcons.minimize2,
          label: l10n.assistantLiveCallMinimize,
          onPressed: onMinimize,
        ),
      ],
    ];
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 360),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final (index, row) in rows.indexed) ...[
            if (index > 0) const SizedBox(height: AppSpacing.xl),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final button in row)
                  Expanded(child: Center(child: button)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
