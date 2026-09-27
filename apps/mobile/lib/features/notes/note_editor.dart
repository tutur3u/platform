import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/features/notes/note_mention_embed_builder.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_table_embed_builder.dart';
import 'package:mobile/l10n/l10n.dart';

class NoteEditor extends StatelessWidget {
  const NoteEditor({
    required this.editor,
    required this.editing,
    required this.saving,
    required this.onInsertLink,
    required this.onOpenLink,
    required this.onOpenMention,
    required this.onConvertToTask,
    super.key,
  });

  final QuillController editor;
  final bool editing;
  final bool saving;
  final VoidCallback onInsertLink;
  final ValueChanged<String> onOpenLink;
  final ValueChanged<NoteMentionTarget> onOpenMention;
  final VoidCallback onConvertToTask;

  static Map<String, dynamic> _newTable() => {
    'type': 'table',
    'content': [
      for (var row = 0; row < 3; row++)
        {
          'type': 'tableRow',
          'content': [
            for (var column = 0; column < 3; column++)
              {
                'type': row == 0 ? 'tableHeader' : 'tableCell',
                'content': [
                  {'type': 'paragraph', 'content': <Object>[]},
                ],
              },
          ],
        },
    ],
  };

  void _insertTable() {
    final offset = editor.selection.baseOffset.clamp(
      0,
      editor.document.length - 1,
    );
    editor.replaceText(
      offset,
      0,
      BlockEmbed('table', jsonEncode(_newTable())),
      TextSelection.collapsed(offset: offset + 1),
    );
  }

  Future<void> _updateTable(EmbedContext context, String tableJson) async {
    final offset = context.node.documentOffset;
    if (offset < 0) return;
    editor.replaceText(offset, 1, BlockEmbed('table', tableJson), null);
  }

  void _toggleHighlight() {
    final selected = editor.getSelectionStyle().attributes['background'];
    editor.formatSelection(
      Attribute.fromKeyValue('background', selected == null ? '#FFF59D' : null),
    );
  }

  @override
  Widget build(BuildContext context) => Localizations.override(
    context: context,
    delegates: const [FlutterQuillLocalizations.delegate],
    child: Column(
      children: [
        if (editing)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final action in <(Attribute<dynamic>, IconData)>[
                  (Attribute.bold, Icons.format_bold),
                  (Attribute.italic, Icons.format_italic),
                  (Attribute.ul, Icons.format_list_bulleted),
                  (Attribute.ol, Icons.format_list_numbered),
                ])
                  IconButton(
                    icon: Icon(action.$2),
                    onPressed: () => editor.formatSelection(action.$1),
                  ),
                IconButton(
                  tooltip: context.l10n.notesHighlight,
                  icon: const Icon(Icons.highlight_rounded),
                  onPressed: _toggleHighlight,
                ),
                IconButton(
                  tooltip: context.l10n.notesChecklist,
                  icon: const Icon(Icons.check_box_outlined),
                  onPressed: () => editor.formatSelection(
                    Attribute.fromKeyValue('list', 'unchecked'),
                  ),
                ),
                IconButton(
                  tooltip: context.l10n.notesConvertToTask,
                  icon: const Icon(Icons.add_task_rounded),
                  onPressed: onConvertToTask,
                ),
                IconButton(
                  tooltip: context.l10n.notesInsertTable,
                  icon: const Icon(Icons.table_chart_outlined),
                  onPressed: _insertTable,
                ),
                IconButton(
                  tooltip: context.l10n.notesInsertLink,
                  icon: const Icon(Icons.link_rounded),
                  onPressed: onInsertLink,
                ),
                if (saving)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 8),
                    child: SizedBox.square(
                      dimension: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
              ],
            ),
          ),
        if (editing) const Divider(height: 1),
        Expanded(
          child: QuillEditor.basic(
            controller: editor,
            config: QuillEditorConfig(
              placeholder: context.l10n.notesStartWriting,
              padding: const EdgeInsets.symmetric(vertical: 12),
              onLaunchUrl: onOpenLink,
              embedBuilders: [
                NoteMentionEmbedBuilder(onOpen: onOpenMention),
                TaskDescriptionTableEmbedBuilder(
                  onTableUpdated: editing ? _updateTable : null,
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}
