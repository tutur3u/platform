import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_attachments.dart';
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
  Widget build(BuildContext context) => AppSheetScaffold(
    title: context.l10n.assistantAskPlaceholder,
    slivers: [
      SliverFillRemaining(
        child: Column(
          children: [
            ValueListenableBuilder<List<AssistantAttachment>>(
              valueListenable: widget.attachments,
              builder: (context, attachments, _) =>
                  AssistantComposerAttachments(
                    attachments: attachments,
                    onRemove: widget.onRemoveAttachment,
                  ),
            ),
            Expanded(
              child: AppTextField(
                key: const ValueKey('assistant-fullscreen-prompt'),
                controller: widget.controller,
                focusNode: _focus,
                expands: true,
                maxLines: null,
                textAlignVertical: TextAlignVertical.top,
                keyboardType: TextInputType.multiline,
                textInputAction: TextInputAction.newline,
                placeholder: context.l10n.assistantAskPlaceholder,
                borderless: true,
              ),
            ),
          ],
        ),
      ),
    ],
  );
}
