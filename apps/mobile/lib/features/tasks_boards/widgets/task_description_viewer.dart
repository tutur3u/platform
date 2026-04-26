import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/features/tasks_boards/utils/task_description_tiptap_converter.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_embed_builders.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
    final theme = shad.Theme.of(context);
    final inlineCodeStyle = TextStyle(
      color: theme.colorScheme.foreground,
      fontFamily: 'monospace',
      fontSize: 15,
      fontWeight: FontWeight.w600,
      height: 1.18,
    );
    final bodyStyle = theme.typography.p.copyWith(
      height: 1.24,
      fontWeight: FontWeight.w400,
    );
    final paragraphStyle = DefaultTextBlockStyle(
      bodyStyle,
      HorizontalSpacing.zero,
      const VerticalSpacing(0, 12),
      VerticalSpacing.zero,
      null,
    );
    final listStyle = DefaultListBlockStyle(
      bodyStyle,
      HorizontalSpacing.zero,
      const VerticalSpacing(2, 10),
      VerticalSpacing.zero,
      null,
      null,
    );
    final h1Style = DefaultTextBlockStyle(
      bodyStyle.copyWith(
        fontSize: 26,
        fontWeight: FontWeight.w800,
        height: 1.16,
      ),
      HorizontalSpacing.zero,
      const VerticalSpacing(18, 10),
      VerticalSpacing.zero,
      null,
    );
    final h2Style = DefaultTextBlockStyle(
      bodyStyle.copyWith(
        fontSize: 23,
        fontWeight: FontWeight.w800,
        height: 1.18,
      ),
      HorizontalSpacing.zero,
      const VerticalSpacing(16, 8),
      VerticalSpacing.zero,
      null,
    );
    final h3Style = DefaultTextBlockStyle(
      bodyStyle.copyWith(
        fontSize: 20,
        fontWeight: FontWeight.w800,
        height: 1.2,
      ),
      HorizontalSpacing.zero,
      const VerticalSpacing(14, 8),
      VerticalSpacing.zero,
      null,
    );

    return QuillEditor.basic(
      controller: _resolvedController,
      config: QuillEditorConfig(
        customStyles: DefaultStyles(
          h1: h1Style,
          h2: h2Style,
          h3: h3Style,
          paragraph: paragraphStyle,
          lists: listStyle,
          sizeSmall: bodyStyle,
          sizeLarge: bodyStyle,
          sizeHuge: bodyStyle,
          inlineCode: InlineCodeStyle(
            backgroundColor: theme.colorScheme.muted.withValues(alpha: 0.42),
            radius: const Radius.circular(5),
            style: inlineCodeStyle,
            header1: inlineCodeStyle.copyWith(fontSize: 30),
            header2: inlineCodeStyle.copyWith(fontSize: 24),
            header3: inlineCodeStyle.copyWith(fontSize: 20),
          ),
        ),
        embedBuilders: const [
          TaskDescriptionImageEmbedBuilder(),
          TaskDescriptionVideoEmbedBuilder(),
          TaskDescriptionMentionEmbedBuilder(),
          TaskDescriptionTableEmbedBuilder(),
        ],
      ),
    );
  }
}
