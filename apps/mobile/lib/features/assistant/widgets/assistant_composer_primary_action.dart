import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/assistant/cubit/assistant_voice_capture_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/l10n/l10n.dart';

/// Changes the existing shell action without painting another dock surface.
class AssistantComposerPrimaryAction extends StatelessWidget {
  const AssistantComposerPrimaryAction({
    required this.controller,
    required this.focusNode,
    required this.onToggleNavigation,
    required this.onSend,
    this.voiceCapture,
    this.onSendVoice,
    this.hasAttachments = false,
    this.blocked = false,
    this.localGenerating = false,
    this.onStopLocal,
    super.key,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onToggleNavigation;
  final Future<void> Function() onSend;
  final AssistantVoiceCaptureCubit? voiceCapture;
  final Future<void> Function()? onSendVoice;
  final bool hasAttachments;
  final bool blocked;
  final bool localGenerating;
  final Future<void> Function()? onStopLocal;

  @override
  Widget build(BuildContext context) {
    final capture = voiceCapture;
    if (capture == null) return _textAction(context, null);
    return BlocBuilder<AssistantVoiceCaptureCubit, AssistantVoiceCaptureState>(
      bloc: capture,
      builder: _textAction,
    );
  }

  Widget _textAction(BuildContext context, AssistantVoiceCaptureState? voice) =>
      ValueListenableBuilder<TextEditingValue>(
        valueListenable: controller,
        builder: (context, value, _) {
          final l10n = context.l10n;
          final hasPrompt = value.text.trim().isNotEmpty || hasAttachments;
          final voiceVisible = voice?.visible ?? false;
          final recording = voice?.recording ?? false;
          final paused = voice?.paused ?? false;
          final sends = hasPrompt || paused;
          final icon = localGenerating
              ? Icons.stop_rounded
              : recording
              ? Icons.pause_rounded
              : sends
              ? Icons.arrow_upward_rounded
              : Icons.menu_rounded;
          final label = localGenerating
              ? l10n.assistantLocalStop
              : recording
              ? l10n.voicePause
              : paused
              ? l10n.voiceSendNow
              : hasPrompt
              ? l10n.assistantSendAction
              : l10n.assistantExpandNavigation;
          return ShellDockActionButton(
            key: const ValueKey('assistant-navigation-toggle'),
            action: ShellActionSpec(
              id: 'assistant-composer-primary',
              icon: icon,
              tooltip: label,
              enabled: localGenerating
                  ? onStopLocal != null
                  : voiceVisible
                  ? !(voice?.busy ?? false) &&
                        (recording || (paused && onSendVoice != null))
                  : !hasPrompt || !blocked,
              onPressed: () {
                if (localGenerating) {
                  unawaited(onStopLocal?.call());
                } else if (recording) {
                  unawaited(voiceCapture?.pause());
                } else if (paused) {
                  unawaited(onSendVoice?.call());
                } else if (hasPrompt) {
                  unawaited(onSend());
                } else {
                  focusNode.unfocus();
                  onToggleNavigation();
                }
              },
            ),
          );
        },
      );
}
