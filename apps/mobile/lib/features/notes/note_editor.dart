import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/l10n/l10n.dart';

class NoteEditor extends StatelessWidget {
  const NoteEditor({
    required this.title,
    required this.editor,
    required this.editing,
    required this.saving,
    required this.onInsertLink,
    required this.onOpenLink,
    super.key,
  });

  final TextEditingController title;
  final QuillController editor;
  final bool editing;
  final bool saving;
  final VoidCallback onInsertLink;
  final ValueChanged<String> onOpenLink;

  @override
  Widget build(BuildContext context) => Localizations.override(
    context: context,
    delegates: const [FlutterQuillLocalizations.delegate],
    child: Column(
      children: [
        if (editing)
          TextField(
            controller: title,
            style: Theme.of(context).textTheme.headlineSmall,
            decoration: InputDecoration(
              hintText: context.l10n.notesUntitled,
              border: InputBorder.none,
            ),
          ),
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
            ),
          ),
        ),
      ],
    ),
  );
}
