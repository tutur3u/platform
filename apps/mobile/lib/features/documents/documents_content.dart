import 'dart:convert';

import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/features/tasks_boards/utils/quill_to_tiptap_converter.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_to_quill_converter.dart';

Document documentQuillFromContent(String content) =>
    tipTapJsonToQuillDocument(content);

/// TipTap JSON object for the documents API. An empty editor still sends an
/// empty document so a cleared body replaces the previous content.
Object documentContentPayload(Document document) {
  final encoded = quillDocumentToTipTapJson(document);
  if (encoded == null || encoded.trim().isEmpty) {
    return const <String, Object>{'type': 'doc', 'content': <Object>[]};
  }
  try {
    final decoded = jsonDecode(encoded);
    if (decoded is Map || decoded is List) return decoded as Object;
  } on Object {
    // Keep the converter's text when it is not a JSON document.
  }
  return encoded;
}
