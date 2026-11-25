import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_quill_colors.dart'
    show
        quillColorOrNull,
        taskDescriptionThemeColorKey,
        tipTapColorMarksAttribute;
import 'package:mobile/features/tasks_boards/utils/tiptap_quill_models.dart'
    show taskDescriptionDividerEmbedType;
import 'package:mobile/l10n/l10n.dart';

/// The web editor's swatches, in its order. Each stores a theme variable
/// (`var(--red)`, `var(--calendar-bg-red)`), so it follows the theme on
/// every platform.
const List<String> documentSwatchHues = [
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'blue',
  'green',
  'gray',
];

/// Which colour channel a swatch sets.
enum DocumentColorChannel { highlight, text }

/// The editor's formatting controls, grouped as the web toolbar groups
/// them: history, headings, inline marks, colour, blocks, indent,
/// alignment and insert.
List<List<AppFormatAction>> documentFormatGroups({
  required BuildContext context,
  required QuillController editor,
  required VoidCallback onLink,
  required ValueChanged<DocumentColorChannel> onColor,
}) {
  final l10n = context.l10n;
  final style = editor.getSelectionStyle();
  bool has(Attribute<dynamic> attribute) {
    final current = style.attributes[attribute.key];
    if (current == null) return false;
    return attribute.value == null || current.value == attribute.value;
  }

  void toggle(Attribute<dynamic> attribute) => editor.formatSelection(
    has(attribute) ? Attribute.clone(attribute, null) : attribute,
  );

  AppFormatAction action(
    IconData icon,
    String tooltip,
    Attribute<dynamic> attribute,
  ) => AppFormatAction(
    icon: icon,
    tooltip: tooltip,
    selected: has(attribute),
    onPressed: () => toggle(attribute),
  );

  // The web nests list items (Tab and Shift+Tab); a paragraph has no
  // indent to store, so indenting applies to lists only.
  final inList = style.attributes.containsKey(Attribute.list.key);
  final align = style.attributes[Attribute.align.key]?.value;
  AppFormatAction alignment(IconData icon, String tooltip, Attribute<String?> a) =>
      AppFormatAction(
        icon: icon,
        tooltip: tooltip,
        selected: a == Attribute.leftAlignment
            ? align == null || align == 'left'
            : align == a.value,
        onPressed: () => editor.formatSelection(
          a == Attribute.leftAlignment ? Attribute.clone(Attribute.align, null) : a,
        ),
      );

  return [
    [
      AppFormatAction(
        icon: LucideIcons.undo2,
        tooltip: l10n.documentsFormatUndo,
        onPressed: editor.hasUndo ? editor.undo : null,
      ),
      AppFormatAction(
        icon: LucideIcons.redo2,
        tooltip: l10n.documentsFormatRedo,
        onPressed: editor.hasRedo ? editor.redo : null,
      ),
    ],
    [
      action(LucideIcons.heading1, l10n.documentsFormatHeading1, Attribute.h1),
      action(LucideIcons.heading2, l10n.documentsFormatHeading2, Attribute.h2),
      action(LucideIcons.heading3, l10n.documentsFormatHeading3, Attribute.h3),
    ],
    [
      action(LucideIcons.bold, l10n.documentsFormatBold, Attribute.bold),
      action(LucideIcons.italic, l10n.documentsFormatItalic, Attribute.italic),
      action(
        LucideIcons.underline,
        l10n.documentsFormatUnderline,
        Attribute.underline,
      ),
      action(
        LucideIcons.strikethrough,
        l10n.documentsFormatStrike,
        Attribute.strikeThrough,
      ),
      action(LucideIcons.code, l10n.documentsFormatCode, Attribute.inlineCode),
      action(
        LucideIcons.subscript,
        l10n.documentsFormatSubscript,
        Attribute.subscript,
      ),
      action(
        LucideIcons.superscript,
        l10n.documentsFormatSuperscript,
        Attribute.superscript,
      ),
    ],
    [
      AppFormatAction(
        icon: LucideIcons.highlighter,
        tooltip: l10n.documentsFormatHighlight,
        selected: style.attributes.containsKey(Attribute.background.key),
        onPressed: () => onColor(DocumentColorChannel.highlight),
      ),
      AppFormatAction(
        icon: LucideIcons.baseline,
        tooltip: l10n.documentsFormatTextColor,
        selected: style.attributes.containsKey(Attribute.color.key),
        onPressed: () => onColor(DocumentColorChannel.text),
      ),
    ],
    [
      action(LucideIcons.list, l10n.documentsFormatBullets, Attribute.ul),
      action(LucideIcons.listOrdered, l10n.documentsFormatNumbers, Attribute.ol),
      AppFormatAction(
        icon: LucideIcons.listChecks,
        tooltip: l10n.documentsFormatChecklist,
        selected: has(Attribute.unchecked) || has(Attribute.checked),
        onPressed: () => toggle(
          has(Attribute.checked) ? Attribute.checked : Attribute.unchecked,
        ),
      ),
      action(LucideIcons.textQuote, l10n.documentsFormatQuote, Attribute.blockQuote),
      action(
        LucideIcons.squareCode,
        l10n.documentsFormatCodeBlock,
        Attribute.codeBlock,
      ),
    ],
    [
      AppFormatAction(
        icon: LucideIcons.indentDecrease,
        tooltip: l10n.documentsFormatOutdent,
        onPressed: inList ? () => editor.indentSelection(false) : null,
      ),
      AppFormatAction(
        icon: LucideIcons.indentIncrease,
        tooltip: l10n.documentsFormatIndent,
        onPressed: inList ? () => editor.indentSelection(true) : null,
      ),
    ],
    [
      alignment(
        LucideIcons.alignLeft,
        l10n.documentsFormatAlignLeft,
        Attribute.leftAlignment,
      ),
      alignment(
        LucideIcons.alignCenter,
        l10n.documentsFormatAlignCenter,
        Attribute.centerAlignment,
      ),
      alignment(
        LucideIcons.alignRight,
        l10n.documentsFormatAlignRight,
        Attribute.rightAlignment,
      ),
    ],
    [
      AppFormatAction(
        icon: LucideIcons.link,
        tooltip: l10n.documentsFormatLink,
        selected: has(Attribute.link),
        onPressed: onLink,
      ),
      AppFormatAction(
        icon: LucideIcons.minus,
        tooltip: l10n.documentsFormatDivider,
        onPressed: () => insertDocumentDivider(editor),
      ),
    ],
  ];
}

/// Every control, in toolbar order.
List<AppFormatAction> documentFormatActions({
  required BuildContext context,
  required QuillController editor,
  required VoidCallback onLink,
  ValueChanged<DocumentColorChannel>? onColor,
}) => [
  for (final group in documentFormatGroups(
    context: context,
    editor: editor,
    onLink: onLink,
    onColor: onColor ?? (_) {},
  ))
    ...group,
];

/// Inserts a horizontal rule on its own line at the caret, as typing
/// `---` does on the web.
void insertDocumentDivider(QuillController editor) {
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
    editor.replaceText(
      index,
      0,
      '\n',
      TextSelection.collapsed(offset: index + 1),
    );
    at = index + 1;
  }
  // The rule gets a line of its own, without list, heading, quote or code
  // styling, and the caret moves to the line below it, as on the web.
  editor
    ..replaceText(
      at,
      0,
      const BlockEmbed(taskDescriptionDividerEmbedType, 'hr'),
      TextSelection.collapsed(offset: at + 1),
    )
    ..replaceText(at + 1, 0, '\n', TextSelection.collapsed(offset: at + 2));
  for (final attribute in <Attribute<dynamic>>[
    Attribute.header,
    Attribute.list,
    Attribute.blockQuote,
    Attribute.codeBlock,
    Attribute.indent,
    Attribute.align,
  ]) {
    editor.formatText(at, 1, Attribute.clone(attribute, null));
  }
  editor.updateSelection(
    TextSelection.collapsed(offset: at + 2),
    ChangeSource.local,
  );
}

/// Applies a web swatch ([hue] null clears it) to the selection.
///
/// A highlight stores the web's own mark, `{color: var(--calendar-bg-hue),
/// textColor: var(--hue)}`, so saving writes exactly what the web writes.
void applyDocumentSwatch(
  QuillController editor,
  DocumentColorChannel channel,
  String? hue,
) {
  const carried = Attribute<String?>(
    tipTapColorMarksAttribute,
    AttributeScope.inline,
    null,
  );
  switch (channel) {
    case DocumentColorChannel.highlight:
      if (hue == null) {
        _clearHighlight(editor);
        return;
      }
      final background = 'var(--calendar-bg-$hue)';
      final color = 'var(--$hue)';
      editor
        ..formatSelection(BackgroundAttribute(background))
        ..formatSelection(ColorAttribute(color))
        ..formatSelection(
          Attribute<String?>(
            tipTapColorMarksAttribute,
            AttributeScope.inline,
            jsonEncode({
              'marks': [
                {
                  'type': 'highlight',
                  'attrs': {'color': background, 'textColor': color},
                },
              ],
              'background': background,
              'color': color,
            }),
          ),
        );
    case DocumentColorChannel.text:
      // A recoloured run writes its marks from the display colours.
      editor
        ..formatSelection(ColorAttribute(hue == null ? null : 'var(--$hue)'))
        ..formatSelection(carried);
  }
}

/// Removes the highlight from each run in the selection, as the web's
/// unsetHighlight does: a run's own text colour (a `textStyle` mark, or a
/// colour that is not the highlight's paired text colour) stays.
void _clearHighlight(QuillController editor) {
  final start = editor.selection.start;
  final end = editor.selection.end;
  if (start == end) return;
  const carried = Attribute<String?>(
    tipTapColorMarksAttribute,
    AttributeScope.inline,
    null,
  );
  final runs = <(int, int, String?)>[];
  var offset = 0;
  for (final op in editor.document.toDelta().toList()) {
    final length = op.length ?? 0;
    final from = offset < start ? start : offset;
    final to = offset + length > end ? end : offset + length;
    offset += length;
    if (from >= to) continue;
    final attrs = op.attributes ?? const <String, dynamic>{};
    final carriedMarks = attrs[tipTapColorMarksAttribute];
    final highlighted =
        attrs.containsKey(Attribute.background.key) ||
        (carriedMarks is String && carriedMarks.contains('"highlight"'));
    if (!highlighted) continue;
    runs.add((from, to - from, _keptTextColor(attrs)));
  }
  for (final (index, length, color) in runs) {
    editor
      ..formatText(index, length, const BackgroundAttribute(null))
      ..formatText(index, length, ColorAttribute(color))
      ..formatText(index, length, carried);
  }
}

/// The text colour a run keeps once its highlight is removed, or null.
String? _keptTextColor(Map<String, dynamic> attrs) {
  final carried = attrs[tipTapColorMarksAttribute];
  if (carried is String) {
    try {
      final decoded = jsonDecode(carried);
      if (decoded is Map && decoded['marks'] is List) {
        for (final mark in decoded['marks'] as List) {
          if (mark is! Map || mark['type'] != 'textStyle') continue;
          final color = (mark['attrs'] as Map?)?['color'];
          return taskDescriptionThemeColorKey(color) ?? quillColorOrNull(color);
        }
        return null;
      }
    } on FormatException {
      // Fall back to the display colours below.
    }
  }
  final color = attrs[Attribute.color.key];
  final background = attrs[Attribute.background.key];
  if (color is! String) return null;
  // The swatch pairs `var(--calendar-bg-red)` with `var(--red)`.
  final paired = background is String
      ? background.replaceFirst('--calendar-bg-', '--')
      : null;
  return color == paired ? null : color;
}
