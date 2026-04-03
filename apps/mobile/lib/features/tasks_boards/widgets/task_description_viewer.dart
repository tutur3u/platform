import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/features/tasks_boards/utils/task_description_tiptap_converter.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_embed_builders.dart';

/// A read-only viewer for task descriptions that uses the same Quill renderer
/// as the editor for full feature parity.
///
/// Supports: headings, lists, task lists, tables, mentions, images, videos,
/// code blocks, blockquotes, and all inline formatting.
class TaskDescriptionViewer extends StatefulWidget {
  const TaskDescriptionViewer({
    required this.descriptionJson,
    super.key,
  });

  /// The TipTap JSON description string.
  final String descriptionJson;

  @override
  State<TaskDescriptionViewer> createState() => _TaskDescriptionViewerState();
}

class _TaskDescriptionViewerState extends State<TaskDescriptionViewer> {
  QuillController? _controller;

  QuillController get _resolvedController {
    final existing = _controller;
    if (existing != null) {
      return existing;
    }

    final created = QuillController(
      document: tipTapJsonToQuillDocument(widget.descriptionJson),
      selection: const TextSelection.collapsed(offset: 0),
      readOnly: true,
    );
    _controller = created;
    return created;
  }

  @override
  void didUpdateWidget(covariant TaskDescriptionViewer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.descriptionJson != widget.descriptionJson) {
      _controller?.document = tipTapJsonToQuillDocument(widget.descriptionJson);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return QuillEditor.basic(
      controller: _resolvedController,
      config: const QuillEditorConfig(
        embedBuilders: [
          TaskDescriptionImageEmbedBuilder(),
          TaskDescriptionVideoEmbedBuilder(),
          TaskDescriptionMentionEmbedBuilder(),
          TaskDescriptionTableEmbedBuilder(),
        ],
      ),
    );
  }
}
