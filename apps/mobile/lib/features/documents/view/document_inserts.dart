import 'dart:async';
import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/documents/document_media.dart';
import 'package:mobile/features/documents/document_media_upload.dart';
import 'package:mobile/features/documents/document_mentions.dart';
import 'package:mobile/features/documents/document_table.dart';
import 'package:mobile/features/documents/view/document_block_insert.dart';
import 'package:mobile/features/documents/view/document_mention_sheet.dart';
import 'package:mobile/features/documents/view/document_table_embed.dart';
import 'package:mobile/features/documents/view/document_table_insert_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

/// Whether this device has a camera the image picker can open.
bool get documentCameraAvailable =>
    !kIsWeb &&
    (defaultTargetPlatform == TargetPlatform.iOS ||
        defaultTargetPlatform == TargetPlatform.android);

/// Asks for a table size, inserts the table at the caret as the web's
/// table command does, then opens it for editing.
Future<void> insertDocumentTable(
  BuildContext context,
  QuillController editor,
) async {
  final size = await showAppSheet<DocumentTableSize>(
    context: context,
    builder: (_) => const DocumentTableInsertSheet(),
  );
  if (size == null || !context.mounted) return;
  final node = newDocumentTable(
    rows: size.rows,
    cols: size.cols,
    headerRow: size.headerRow,
  );
  final offset = insertDocumentBlock(
    editor,
    BlockEmbed(documentTableEmbedType, jsonEncode(node)),
  );
  await editDocumentTable(context, editor, offset, node);
}

/// The kinds of media the insert group uploads.
enum DocumentMediaKind { image, camera, video, file }

/// A picked file, ready to upload.
typedef _Picked = ({String name, Uint8List bytes, String? contentType});

Future<_Picked?> _pick(DocumentMediaKind kind) async {
  if (kind == DocumentMediaKind.file) {
    final file = await FilePicker.pickFile();
    if (file == null) return null;
    return (
      name: file.name,
      bytes: await file.readAsBytes(),
      contentType: null,
    );
  }
  final picker = ImagePicker();
  final picked = switch (kind) {
    DocumentMediaKind.video => await picker.pickVideo(
      source: ImageSource.gallery,
    ),
    DocumentMediaKind.camera => await picker.pickImage(
      source: ImageSource.camera,
    ),
    _ => await picker.pickImage(source: ImageSource.gallery),
  };
  if (picked == null) return null;
  return (
    name: picked.name,
    bytes: await picked.readAsBytes(),
    contentType: picked.mimeType,
  );
}

/// Picks media of [kind], uploads it to workspace [wsId] as the web does,
/// and inserts it at the caret: an image or video block, or a link named
/// after the file. Failures show a toast and leave the document alone.
Future<void> insertDocumentMedia(
  BuildContext context,
  QuillController editor, {
  required DocumentMediaKind kind,
  required String wsId,
  required DocumentMediaUploader uploader,
}) async {
  final l10n = context.l10n;
  final _Picked? picked;
  try {
    picked = await _pick(kind);
  } on Object {
    if (context.mounted) _toast(context, l10n.documentsUploadFailed);
    return;
  }
  if (picked == null || !context.mounted) return;
  _toast(context, l10n.documentsUploading, neutral: true);
  final String src;
  try {
    src = await uploader.upload(
      wsId,
      name: picked.name,
      bytes: picked.bytes,
      contentType: picked.contentType,
    );
  } on ApiException catch (error) {
    if (context.mounted) {
      _toast(
        context,
        error.message.isEmpty ? l10n.documentsUploadFailed : error.message,
      );
    }
    return;
  } on Object {
    if (context.mounted) _toast(context, l10n.documentsUploadFailed);
    return;
  }
  if (!context.mounted) return;
  switch (kind) {
    case DocumentMediaKind.image || DocumentMediaKind.camera:
      insertDocumentBlock(
        editor,
        BlockEmbed(
          documentImageEmbedType,
          documentImageEmbedValue(newDocumentImageNode(src)),
        ),
      );
    case DocumentMediaKind.video:
      insertDocumentBlock(editor, BlockEmbed.video(src));
    case DocumentMediaKind.file:
      insertDocumentFileLink(editor, name: picked.name, url: src);
  }
}

/// Inserts [name] linked to [url] at the caret, followed by a space.
void insertDocumentFileLink(
  QuillController editor, {
  required String name,
  required String url,
}) {
  final selection = editor.selection;
  final at = selection.start.clamp(0, editor.document.length - 1);
  editor
    ..replaceText(
      at,
      selection.end - selection.start,
      '$name ',
      TextSelection.collapsed(offset: at + name.length + 1),
    )
    ..formatText(at, name.length, LinkAttribute(url))
    ..formatText(at + name.length, 1, const LinkAttribute(null));
}

/// Opens the mention picker and inserts the chosen mention at the caret.
/// With [trigger], the `@` typed at that offset is replaced; dismissing
/// the picker leaves it as typed.
Future<void> insertDocumentMention(
  BuildContext context,
  QuillController editor, {
  required Future<List<DocumentMentionOption>> options,
  int? trigger,
}) async {
  var option = await showAppSheet<DocumentMentionOption>(
    context: context,
    size: AppSheetSize.large,
    builder: (_) => DocumentMentionSheet(options: options),
  );
  if (option == null || !context.mounted) return;
  if (identical(option, documentCustomDateOption)) {
    final now = DateTime.now();
    final date = await showAppDatePicker(
      context: context,
      initialDate: now,
      firstDate: DateTime(now.year - 10),
      lastDate: DateTime(now.year + 10),
    );
    if (date == null || !context.mounted) return;
    option = documentCustomDateMention(date);
  }
  final text = editor.document.toPlainText();
  final replace =
      trigger != null && trigger < text.length && text[trigger] == '@';
  final at = replace
      ? trigger
      : editor.selection.start.clamp(0, editor.document.length - 1);
  final length = replace ? 1 : editor.selection.end - editor.selection.start;
  editor
    ..replaceText(
      at,
      length,
      Embeddable('mention', documentMentionEmbedValue(option)),
      TextSelection.collapsed(offset: at + 1),
    )
    ..replaceText(at + 1, 0, ' ', TextSelection.collapsed(offset: at + 2));
}

void _toast(BuildContext context, String message, {bool neutral = false}) =>
    showAppToast(
      context,
      message: message,
      variant: neutral ? AppAlertVariant.neutral : AppAlertVariant.destructive,
    );
