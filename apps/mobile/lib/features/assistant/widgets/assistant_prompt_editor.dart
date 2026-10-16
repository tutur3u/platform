import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_attachments.dart';
import 'package:mobile/features/settings/view/settings_route_frame.dart';
import 'package:mobile/l10n/l10n.dart';

/// Edits the existing draft value, including selection, without sending a turn.
class AssistantPromptEditor extends StatefulWidget {
  const AssistantPromptEditor({
    required this.controller,
    required this.attachments,
    required this.onRemoveAttachment,
    super.key,
  });
  final TextEditingController controller;
  final ValueNotifier<List<AssistantAttachment>> attachments;
  final Future<void> Function(String) onRemoveAttachment;
  @override
  State<AssistantPromptEditor> createState() => _PromptEditorState();
}

class _PromptEditorState extends State<AssistantPromptEditor> {
  final _focus = FocusNode();
  @override
  void initState() {
    super.initState();
    _focus.requestFocus();
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    resizeToAvoidBottomInset: true,
    body: SettingsRouteFrame(
      title: context.l10n.assistantAskPlaceholder,
      customNavigation: true,
      backIcon: Icons.close_fullscreen_rounded,
      backLabel: context.l10n.assistantMinimizePrompt,
      child: Column(
        children: [
          ValueListenableBuilder<List<AssistantAttachment>>(
            valueListenable: widget.attachments,
            builder: (context, attachments, _) => AssistantComposerAttachments(
              attachments: attachments,
              onRemove: widget.onRemoveAttachment,
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: TextField(
                key: const ValueKey('assistant-fullscreen-prompt'),
                controller: widget.controller,
                focusNode: _focus,
                expands: true,
                maxLines: null,
                keyboardType: TextInputType.multiline,
                textInputAction: TextInputAction.newline,
                textAlignVertical: TextAlignVertical.top,
                decoration: InputDecoration(
                  hintText: context.l10n.assistantAskPlaceholder,
                  border: InputBorder.none,
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
