import 'package:flutter/widgets.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/features/documents/view/document_format_actions.dart'
    show insertDocumentDivider;

/// The web editor's typing replacements (packages/ui text-editor
/// text-replacements.ts), longest trigger first.
const List<(String, String)> documentTextReplacements = [
  ('<--->', '⟷'),
  ('<-->', '⟷'),
  ('--->', '⟶'),
  ('-->', '⟶'),
  ('<->', '↔'),
  ('->', '→'),
  ('<---', '⟵'),
  ('=>', '⇒'),
  ('>=', '≥'),
  ('<=', '≤'),
  ('!=', '≠'),
  ('+-', '±'),
  ('...', '…'),
  ('(tm)', '™'),
  ('(c)', '©'),
  ('(r)', '®'),
];

/// Triggers that start longer ones, so the web only replaces them once a
/// space follows.
const List<(String, String)> documentBoundaryReplacements = [
  ('<-- ', '⟵ '),
  ('<- ', '← '),
  ('-- ', '– '),
];

const int _lookBehind = 6;

/// A line typed as one of these becomes a divider, as the web's
/// horizontal rule input rule does. `—-` is `---` after iOS smart dashes.
const Set<String> documentDividerTriggers = {'---', '—-', '___ ', '*** '};

/// Applies the web's input rules after the user types [typed] at
/// [offset]: text replacements, and `---` on an empty line becoming a
/// divider. Returns whether anything changed.
bool applyDocumentInputRules(
  QuillController editor, {
  required int offset,
  required String typed,
}) {
  if (typed.length != 1) return false;
  final caret = offset + 1;
  if (caret > editor.document.length - 1) return false;
  final style = editor.document.collectStyle(offset, 1).attributes;
  if (style.containsKey(Attribute.codeBlock.key) ||
      style.containsKey(Attribute.inlineCode.key)) {
    return false;
  }

  final start = caret - _lookBehind < 0 ? 0 : caret - _lookBehind;
  final before = editor.document.getPlainText(start, caret - start);

  final line = _lineText(editor, caret);
  if (line != null && documentDividerTriggers.contains(line)) {
    final lineStart = caret - line.length;
    editor.replaceText(
      lineStart,
      line.length,
      '',
      TextSelection.collapsed(offset: lineStart),
    );
    insertDocumentDivider(editor, replaceEmptyLine: false);
    return true;
  }

  for (final (trigger, replacement) in [
    ...documentTextReplacements,
    if (typed == ' ') ...documentBoundaryReplacements,
  ]) {
    if (!before.endsWith(trigger)) continue;
    final from = caret - trigger.length;
    editor.replaceText(
      from,
      trigger.length,
      replacement,
      TextSelection.collapsed(offset: from + replacement.length),
    );
    return true;
  }
  return false;
}

/// The text of the line that ends at [caret], when [caret] is at its end.
String? _lineText(QuillController editor, int caret) {
  final next = editor.document.getPlainText(caret, 1);
  if (next != '\n') return null;
  final start = caret - 5 < 0 ? 0 : caret - 5;
  final text = editor.document.getPlainText(start, caret - start);
  final newline = text.lastIndexOf('\n');
  if (newline < 0 && start > 0) return null;
  return newline < 0 ? text : text.substring(newline + 1);
}

/// The single character a local edit typed, and where, or null.
({int offset, String typed})? documentTypedCharacter(DocChange change) {
  if (change.source != ChangeSource.local) return null;
  var offset = 0;
  String? typed;
  for (final op in change.change.toList()) {
    if (op.isRetain) {
      if (typed != null) break;
      offset += op.length!;
    } else if (op.isInsert && typed == null && op.data is String) {
      typed = op.data! as String;
    } else {
      return null;
    }
  }
  if (typed == null || typed.length != 1) return null;
  return (offset: offset, typed: typed);
}
