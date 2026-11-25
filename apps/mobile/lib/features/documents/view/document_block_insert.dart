import 'package:flutter/widgets.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_quill_models.dart'
    show taskDescriptionDividerEmbedType;

/// Inserts a horizontal rule on its own line at the caret, as typing
/// `---` does on the web.
///
/// From the toolbar ([replaceEmptyLine]), a rule on an empty line takes
/// that line's place and the caret moves to the next line, as the web's
/// setHorizontalRule does. The `---` input rule keeps the empty line below,
/// as the web's input rule does.
void insertDocumentDivider(
  QuillController editor, {
  bool replaceEmptyLine = true,
}) => insertDocumentBlock(
  editor,
  const BlockEmbed(taskDescriptionDividerEmbedType, 'hr'),
  replaceEmptyLine: replaceEmptyLine,
);

/// Inserts a block [embed] (a rule, table, image or video) on its own line
/// at the caret and returns its offset.
///
/// A selection is replaced. Mid-line, the line splits around the block; at
/// the end of a line, the block goes on the line below. An empty line
/// takes the block's place when [replaceEmptyLine] is set, as the web's
/// insert commands do. The caret moves to the line after the block.
int insertDocumentBlock(
  QuillController editor,
  BlockEmbed embed, {
  bool replaceEmptyLine = true,
}) {
  final selection = editor.selection;
  final index = selection.start.clamp(0, editor.document.length - 1);
  final length = selection.end - selection.start;
  if (length > 0) {
    editor.replaceText(
      index,
      length,
      '',
      TextSelection.collapsed(offset: index),
    );
  }
  final plain = editor.document.toPlainText();
  var at = index;
  if (index > 0 && plain[index - 1] != '\n') {
    if (plain[index] == '\n' && index + 1 < plain.length) {
      // At the end of a line: the block goes on the line below.
      at = index + 1;
    } else {
      editor.replaceText(
        index,
        0,
        '\n',
        TextSelection.collapsed(offset: index + 1),
      );
      at = index + 1;
    }
  }
  final text = editor.document.toPlainText();
  final emptyLine =
      replaceEmptyLine &&
      at == index &&
      text[at] == '\n' &&
      (at == 0 || text[at - 1] == '\n');
  // The block gets a line of its own, without list, heading, quote or code
  // styling, and the caret moves to the line below it, as on the web.
  editor.replaceText(at, 0, embed, TextSelection.collapsed(offset: at + 1));
  // An empty line's own newline ends the block; a line is added below only
  // when there is none to move to.
  final addedLastLine = emptyLine && at + 2 >= editor.document.length;
  if (!emptyLine || addedLastLine) {
    editor.replaceText(
      at + 1,
      0,
      '\n',
      TextSelection.collapsed(offset: at + 2),
    );
  }
  // The block's line is plain. A line added below an empty styled last
  // line is plain too, as the web's new paragraph is.
  for (final attribute in <Attribute<dynamic>>[
    Attribute.header,
    Attribute.list,
    Attribute.blockQuote,
    Attribute.codeBlock,
    Attribute.indent,
    Attribute.align,
  ]) {
    editor.formatText(at, 1, Attribute.clone(attribute, null));
    if (addedLastLine) {
      editor.formatText(at + 2, 1, Attribute.clone(attribute, null));
    }
  }
  editor.updateSelection(
    TextSelection.collapsed(offset: at + 2),
    ChangeSource.local,
  );
  return at;
}

/// Replaces the block embed at [offset] with [embed], keeping the caret.
void replaceDocumentEmbed(
  QuillController editor,
  int offset,
  Embeddable embed,
) {
  final selection = editor.selection;
  editor.replaceText(offset, 1, embed, selection);
}

/// Removes the block embed at [offset] together with its line.
void deleteDocumentBlock(QuillController editor, int offset) {
  final length = editor.document.length;
  final count = offset + 1 < length - 1 ? 2 : 1;
  editor.replaceText(
    offset,
    count,
    '',
    TextSelection.collapsed(offset: offset),
  );
}

/// The data of the [type] embed at [offset], or null when the document no
/// longer holds one there (it changed while a sheet was open).
Object? documentEmbedAt(QuillController editor, int offset, String type) {
  if (offset < 0 || offset >= editor.document.length - 1) return null;
  final data = editor.document.toDelta().slice(offset, offset + 1).first.data;
  return data is Map ? data[type] : null;
}
