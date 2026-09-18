import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_quill_delta_from_html/flutter_quill_delta_from_html.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:vsc_quill_delta_to_html/vsc_quill_delta_to_html.dart';

/// Preserve untouched HTML and export edits through the email converter.
class MailBodyController extends ChangeNotifier {
  MailBodyController() {
    _snapshot = jsonEncode(quill.document.toDelta().toJson());
    quill.addListener(_changed);
  }
  final quill = QuillController.basic();
  String? _originalHtml;
  String _snapshot = '';
  bool _edited = false;

  String get text => quill.document.toPlainText();
  String? get html => !_edited && _originalHtml != null
      ? _originalHtml
      : QuillDeltaToHtmlConverter(
          quill.document.toDelta().toJson(),
          ConverterOptions.forEmail(),
        ).convert();

  void load(String text, {String? html}) {
    Document document;
    try {
      if (html != null && html.trim().isNotEmpty) {
        final operations = HtmlToDelta().convert(html).toJson();
        // Email images are displayed in the isolated reader. The editor never
        // fetches remote images or executes content embedded in a saved draft.
        final safe = operations
            .map(
              (operation) => {
                ...operation,
                if (operation['insert'] is! String) 'insert': '\n',
              },
            )
            .toList();
        document = Document.fromJson(safe);
      } else {
        document = Document()..insert(0, text);
      }
    } on Object {
      document = Document()..insert(0, text);
    }
    quill.document = document;
    _originalHtml = html;
    _snapshot = jsonEncode(document.toDelta().toJson());
    _edited = false;
  }

  set text(String value) {
    quill.document = Document()..insert(0, value);
    _edited = true;
    _changed();
  }

  void _changed() {
    final next = jsonEncode(quill.document.toDelta().toJson());
    if (next == _snapshot) return;
    _snapshot = next;
    _edited = true;
    notifyListeners();
  }

  @override
  void dispose() {
    quill.dispose();
    super.dispose();
  }
}

class MailBodyEditor extends StatelessWidget {
  const MailBodyEditor({required this.controller, super.key});
  final MailBodyController controller;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final actions = [
      (
        Attribute.bold,
        Icons.format_bold,
        l10n.taskBoardDetailTaskDescriptionToolbarBold,
      ),
      (
        Attribute.italic,
        Icons.format_italic,
        l10n.taskBoardDetailTaskDescriptionToolbarItalic,
      ),
      (
        Attribute.underline,
        Icons.format_underlined,
        l10n.taskBoardDetailTaskDescriptionToolbarUnderline,
      ),
      (
        Attribute.ul,
        Icons.format_list_bulleted,
        l10n.taskBoardDetailTaskDescriptionToolbarBulletList,
      ),
      (
        Attribute.ol,
        Icons.format_list_numbered,
        l10n.taskBoardDetailTaskDescriptionToolbarOrderedList,
      ),
      (
        Attribute.blockQuote,
        Icons.format_quote,
        l10n.taskBoardDetailTaskDescriptionToolbarBlockquote,
      ),
    ];
    return Localizations.override(
      context: context,
      delegates: const [FlutterQuillLocalizations.delegate],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            children: [
              for (final action in actions)
                IconButton(
                  tooltip: action.$3,
                  icon: Icon(action.$2),
                  onPressed: () {
                    final active = controller.quill
                        .getSelectionStyle()
                        .attributes[action.$1.key];
                    controller.quill.formatSelection(
                      active?.value == action.$1.value
                          ? Attribute.clone(action.$1, null)
                          : action.$1,
                    );
                  },
                ),
            ],
          ),
          QuillEditor.basic(
            controller: controller.quill,
            config: QuillEditorConfig(
              minHeight: 220,
              scrollable: false,
              placeholder: l10n.mailBody,
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
        ],
      ),
    );
  }
}
