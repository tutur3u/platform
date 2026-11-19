import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_voice_capture_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/l10n/l10n.dart';

/// Changes the existing shell action without painting another dock surface.
class AssistantComposerPrimaryAction extends StatelessWidget
    implements PreferredSizeWidget {
  const AssistantComposerPrimaryAction({
    required this.controller,
    required this.focusNode,
    required this.onToggleNavigation,
    required this.onSend,
    this.inPage = false,
    this.voiceCapture,
    this.onSendVoice,
    this.onMicrophoneTap,
    this.hasAttachments = false,
    this.blocked = false,
    this.localGenerating = false,
    this.onStopLocal,
    super.key,
  });

  final bool inPage;
  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onToggleNavigation;
  final Future<void> Function() onSend;
  final AssistantVoiceCaptureCubit? voiceCapture;
  final Future<void> Function()? onSendVoice;
  final Future<void> Function()? onMicrophoneTap;
  final bool hasAttachments;
  final bool blocked;
  final bool localGenerating;
  final Future<void> Function()? onStopLocal;

  static const double dockHeight = 52;
  @override
  Size get preferredSize => const Size(52, dockHeight);
  @override
  Widget build(BuildContext context) => _action(context);

  Widget _action(BuildContext context) {
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
          final microphone = inPage && !sends && !recording && !localGenerating;
          if (microphone && onMicrophoneTap == null) {
            return const SizedBox.shrink();
          }
          final icon = localGenerating
              ? LucideIcons.square
              : recording
              ? LucideIcons.pause
              : sends
              ? LucideIcons.arrowUp
              : microphone
              ? LucideIcons.mic
              : LucideIcons.menu;
          final label = localGenerating
              ? l10n.assistantLocalStop
              : recording
              ? l10n.voicePause
              : paused
              ? l10n.voiceSendNow
              : hasPrompt
              ? l10n.assistantSendAction
              : microphone
              ? l10n.voiceRecord
              : l10n.assistantExpandNavigation;
          final enabled = localGenerating
              ? onStopLocal != null
              : voiceVisible
              ? !(voice?.busy ?? false) &&
                    (recording || (paused && onSendVoice != null))
              : (!hasPrompt && !microphone) || !blocked;
          void invoke() {
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
              if (microphone) {
                unawaited(onMicrophoneTap?.call());
              } else {
                onToggleNavigation();
              }
            }
          }

          if (inPage) {
            return AppIconButton(
              key: ValueKey(
                microphone
                    ? 'assistant-composer-microphone-slot'
                    : 'assistant-send',
              ),
              shape: AppButtonShape.circle,
              variant: microphone
                  ? AppButtonVariant.secondary
                  : AppButtonVariant.primary,
              tooltip: label,
              onPressed: enabled ? invoke : null,
              icon: Icon(icon),
            );
          }
          return ShellDockActionButton(
            key: const ValueKey('assistant-navigation-toggle'),
            action: ShellActionSpec(
              id: 'assistant-composer-primary',
              icon: icon,
              tooltip: label,
              enabled: enabled,
              onPressed: invoke,
            ),
          );
        },
      );
}
