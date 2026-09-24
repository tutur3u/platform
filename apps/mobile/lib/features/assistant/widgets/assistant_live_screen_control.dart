import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_screen_service.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantLiveScreenControl extends StatelessWidget {
  const AssistantLiveScreenControl({required this.state, super.key});
  final AssistantLiveState state;

  @override
  Widget build(BuildContext context) {
    if (!AssistantLiveScreenService().isSupported) {
      return const SizedBox.shrink();
    }
    final l10n = context.l10n;
    final sharing = state.isScreenSharing || state.isScreenSharingPending;
    final detail = switch (state.screenSharingError) {
      'microphone_required' => l10n.assistantLiveScreenMicrophoneRequired,
      'connection_required' => l10n.assistantLiveScreenConnectionRequired,
      null =>
        state.isScreenSharing
            ? l10n.assistantLiveScreenActive
            : state.isScreenSharingPending
            ? l10n.assistantLiveScreenPending
            : null,
      _ => l10n.assistantLiveScreenUnavailable,
    };
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (detail != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Semantics(
              liveRegion: true,
              child: Text(detail, textAlign: TextAlign.center),
            ),
          ),
        TextButton.icon(
          icon: Icon(
            sharing
                ? Icons.stop_screen_share_outlined
                : Icons.screen_share_outlined,
          ),
          label: Text(
            sharing
                ? l10n.assistantLiveStopScreen
                : l10n.assistantLiveShareScreen,
          ),
          onPressed: () async {
            final cubit = context.read<AssistantLiveCubit>();
            if (!sharing) {
              final accepted = await showDialog<bool>(
                context: context,
                builder: (dialogContext) => AlertDialog(
                  title: Text(l10n.assistantLiveShareScreen),
                  content: Text(l10n.assistantLiveScreenPrivacy),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogContext, false),
                      child: Text(
                        MaterialLocalizations.of(
                          dialogContext,
                        ).cancelButtonLabel,
                      ),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(dialogContext, true),
                      child: Text(l10n.assistantLiveShareScreen),
                    ),
                  ],
                ),
              );
              if (accepted != true || !context.mounted) return;
            }
            await cubit.toggleScreenSharing(
              notificationTitle: l10n.assistantLiveScreenActive,
              stopLabel: l10n.assistantLiveStopScreen,
              stopMessage: l10n.assistantLiveScreenStopped,
            );
          },
        ),
      ],
    );
  }
}
