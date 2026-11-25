import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_quill/flutter_quill.dart';

/// A web editor command bound to a key on desktop.
enum DocumentShortcutCommand {
  heading1,
  heading2,
  heading3,
  paragraph,
  subscript,
  superscript,
  alignLeft,
  alignCenter,
  alignRight,
  bulletList,
  orderedList,
  taskList,
  redo,
  link,
}

class DocumentShortcutIntent extends Intent {
  const DocumentShortcutIntent(this.command);

  final DocumentShortcutCommand command;
}

bool get _mac =>
    defaultTargetPlatform == TargetPlatform.macOS ||
    defaultTargetPlatform == TargetPlatform.iOS;

SingleActivator _mod(
  LogicalKeyboardKey key, {
  bool shift = false,
  bool alt = false,
}) => SingleActivator(key, meta: _mac, control: !_mac, shift: shift, alt: alt);

/// The web editor's shortcuts that Quill binds differently or not at all.
/// Quill's own Mod+B/I/U, Mod+Shift+S, Mod+Z and Mod+Y already match.
Map<ShortcutActivator, Intent> documentShortcuts() {
  DocumentShortcutIntent to(DocumentShortcutCommand command) =>
      DocumentShortcutIntent(command);
  return {
    _mod(LogicalKeyboardKey.digit1, alt: true): to(
      DocumentShortcutCommand.heading1,
    ),
    _mod(LogicalKeyboardKey.digit2, alt: true): to(
      DocumentShortcutCommand.heading2,
    ),
    _mod(LogicalKeyboardKey.digit3, alt: true): to(
      DocumentShortcutCommand.heading3,
    ),
    _mod(LogicalKeyboardKey.digit0, alt: true): to(
      DocumentShortcutCommand.paragraph,
    ),
    _mod(LogicalKeyboardKey.comma): to(DocumentShortcutCommand.subscript),
    _mod(LogicalKeyboardKey.period): to(DocumentShortcutCommand.superscript),
    _mod(LogicalKeyboardKey.keyL, shift: true): to(
      DocumentShortcutCommand.alignLeft,
    ),
    _mod(LogicalKeyboardKey.keyE, shift: true): to(
      DocumentShortcutCommand.alignCenter,
    ),
    _mod(LogicalKeyboardKey.keyR, shift: true): to(
      DocumentShortcutCommand.alignRight,
    ),
    _mod(LogicalKeyboardKey.digit8, shift: true): to(
      DocumentShortcutCommand.bulletList,
    ),
    _mod(LogicalKeyboardKey.digit7, shift: true): to(
      DocumentShortcutCommand.orderedList,
    ),
    _mod(LogicalKeyboardKey.digit9, shift: true): to(
      DocumentShortcutCommand.taskList,
    ),
    _mod(LogicalKeyboardKey.keyZ, shift: true): to(
      DocumentShortcutCommand.redo,
    ),
    _mod(LogicalKeyboardKey.keyK): to(DocumentShortcutCommand.link),
  };
}

/// Runs [DocumentShortcutIntent]s against [editor].
Map<Type, Action<Intent>> documentShortcutActions({
  required QuillController editor,
  required VoidCallback onLink,
}) => {
  DocumentShortcutIntent: CallbackAction<DocumentShortcutIntent>(
    onInvoke: (intent) {
      runDocumentShortcut(editor, intent.command, onLink: onLink);
      return null;
    },
  ),
};

/// Applies [command] to [editor]'s selection.
void runDocumentShortcut(
  QuillController editor,
  DocumentShortcutCommand command, {
  required VoidCallback onLink,
}) {
  final style = editor.getSelectionStyle().attributes;
  void toggle(Attribute<dynamic> attribute) {
    final on = style[attribute.key]?.value == attribute.value;
    editor.formatSelection(on ? Attribute.clone(attribute, null) : attribute);
  }

  switch (command) {
    case DocumentShortcutCommand.heading1:
      toggle(Attribute.h1);
    case DocumentShortcutCommand.heading2:
      toggle(Attribute.h2);
    case DocumentShortcutCommand.heading3:
      toggle(Attribute.h3);
    case DocumentShortcutCommand.paragraph:
      editor.formatSelection(Attribute.clone(Attribute.header, null));
    case DocumentShortcutCommand.subscript:
      toggle(Attribute.subscript);
    case DocumentShortcutCommand.superscript:
      toggle(Attribute.superscript);
    case DocumentShortcutCommand.alignLeft:
      editor.formatSelection(Attribute.clone(Attribute.align, null));
    case DocumentShortcutCommand.alignCenter:
      editor.formatSelection(Attribute.centerAlignment);
    case DocumentShortcutCommand.alignRight:
      editor.formatSelection(Attribute.rightAlignment);
    case DocumentShortcutCommand.bulletList:
      toggle(Attribute.ul);
    case DocumentShortcutCommand.orderedList:
      toggle(Attribute.ol);
    case DocumentShortcutCommand.taskList:
      toggle(
        style[Attribute.list.key]?.value == Attribute.checked.value
            ? Attribute.checked
            : Attribute.unchecked,
      );
    case DocumentShortcutCommand.redo:
      if (editor.hasRedo) editor.redo();
    case DocumentShortcutCommand.link:
      onLink();
  }
}
