import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_voice_capture_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_prompt_editor.dart';
import 'package:mobile/features/settings/view/settings_scoped_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/l10n/l10n.dart';

/// Changes the existing shell action without painting another dock surface.
class AssistantComposerPrimaryAction extends StatefulWidget
    implements PreferredSizeWidget {
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
    this.attachments = const [],
    this.onRemoveAttachment,
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

  static const double dockHeight = 96;
  @override
  Size get preferredSize => const Size(52, dockHeight);
  final List<AssistantAttachment> attachments;
  final Future<void> Function(String)? onRemoveAttachment;
  @override
  State<AssistantComposerPrimaryAction> createState() => _PrimaryActionState();
}

class _PrimaryActionState extends State<AssistantComposerPrimaryAction> {
  late final ValueNotifier<List<AssistantAttachment>> _attachments =
      ValueNotifier(widget.attachments);
  bool _editing = false;
  bool _syncScheduled = false;
  BuildContext? _editorContext;
  @override
  void didUpdateWidget(AssistantComposerPrimaryAction oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_editing && !_syncScheduled) {
      _syncScheduled = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _syncScheduled = false;
        if (mounted && _editing) _attachments.value = widget.attachments;
      });
    }
  }

  @override
  void dispose() {
    final editor = _editorContext;
    if (editor != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!editor.mounted) return;
        final route = ModalRoute.of(editor);
        if (route != null && route.isActive) {
          Navigator.of(editor).removeRoute(route);
        }
      });
    }
    if (!_editing) _attachments.dispose();
    super.dispose();
  }

  Future<void> _expand() async {
    if (_editing) return;
    _editing = true;
    _attachments.value = widget.attachments;
    final controller = widget.controller;
    final focus = widget.focusNode;
    final restoreFocus = focus.hasFocus;
    focus.unfocus();
    try {
      await pushScopedSettingsPage(
        context,
        asSheet: true,
        builder: (context, isCurrent) {
          _editorContext = context;
          return AssistantPromptEditor(
            controller: controller,
            attachments: _attachments,
            onRemoveAttachment: (id) async {
              if (mounted && isCurrent()) {
                await widget.onRemoveAttachment?.call(id);
              }
            },
          );
        },
      );
    } finally {
      _editorContext = null;
      _editing = false;
      if (mounted) {
        if (restoreFocus) focus.requestFocus();
      } else {
        _attachments.dispose();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final action = _action(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        TextFieldTapRegion(
          child: AppIconButton(
            key: const ValueKey('assistant-expand-prompt'),
            tooltip: context.l10n.assistantExpandPrompt,
            onPressed: () => unawaited(_expand()),
            icon: const Icon(LucideIcons.maximize2),
          ),
        ),
        action,
      ],
    );
  }

  Widget _action(BuildContext context) {
    final capture = widget.voiceCapture;
    if (capture == null) return _textAction(context, null);
    return BlocBuilder<AssistantVoiceCaptureCubit, AssistantVoiceCaptureState>(
      bloc: capture,
      builder: _textAction,
    );
  }

  Widget _textAction(BuildContext context, AssistantVoiceCaptureState? voice) =>
      ValueListenableBuilder<TextEditingValue>(
        valueListenable: widget.controller,
        builder: (context, value, _) {
          final l10n = context.l10n;
          final hasPrompt =
              value.text.trim().isNotEmpty || widget.hasAttachments;
          final voiceVisible = voice?.visible ?? false;
          final recording = voice?.recording ?? false;
          final paused = voice?.paused ?? false;
          final sends = hasPrompt || paused;
          final icon = widget.localGenerating
              ? LucideIcons.square
              : recording
              ? LucideIcons.pause
              : sends
              ? LucideIcons.arrowUp
              : LucideIcons.menu;
          final label = widget.localGenerating
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
              enabled: widget.localGenerating
                  ? widget.onStopLocal != null
                  : voiceVisible
                  ? !(voice?.busy ?? false) &&
                        (recording || (paused && widget.onSendVoice != null))
                  : !hasPrompt || !widget.blocked,
              onPressed: () {
                if (widget.localGenerating) {
                  unawaited(widget.onStopLocal?.call());
                } else if (recording) {
                  unawaited(widget.voiceCapture?.pause());
                } else if (paused) {
                  unawaited(widget.onSendVoice?.call());
                } else if (hasPrompt) {
                  unawaited(widget.onSend());
                } else {
                  widget.focusNode.unfocus();
                  widget.onToggleNavigation();
                }
              },
            ),
          );
        },
      );
}
