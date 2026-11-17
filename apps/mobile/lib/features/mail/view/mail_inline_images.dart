import 'package:html/parser.dart' as html_parser;

/// Inline (`cid:`) image resolution, aligned with apps/mail's inline-images.ts.
///
/// Content-IDs match without angle brackets, case-insensitively and after
/// percent-decoding. Stored references may carry a Mail draft path prefix, and
/// sent mail may reference the message's own attachment URL instead of a CID.
/// Bytes are always fetched through the authenticated attachment API and
/// embedded as data URIs, so no attachment URL ever reaches the WebView.

/// The navigation scheme a tapped inline image uses to open the full viewer.
const mailInlineImageScheme = 'tuturuuu-mail-inline-image';

/// The attribute carrying a resolved image's normalized Content-ID.
const mailInlineImageAttribute = 'data-mail-cid';

String normalizeMailContentId(String value) =>
    value.trim().replaceAll(RegExp(r'^<|>$'), '').toLowerCase();

final _draftPrefix = RegExp(
  '^/(?:mail/)?api/v1/workspaces/[^/]+/mail/mailboxes/[^/]+/drafts/[^/]+?(?=cid:)',
  caseSensitive: false,
);

final _attachmentPath = RegExp(
  r'^/(?:mail/)?api/v1/workspaces/[^/]+/mail/mailboxes/[^/]+/(?:drafts|messages)/[^/]+/attachments/([^/?]+)(?:\?preview=1)?$',
);

final _origin = RegExp('^https?://[^/]+', caseSensitive: false);

/// The normalized Content-ID an image `src` refers to, or null.
///
/// [attachmentContentIds] maps this message's inline attachment ids to their
/// Content-IDs, so an attachment URL resolves only within the same message.
String? mailContentIdFromSource(
  String? source, {
  Map<String, String> attachmentContentIds = const {},
}) {
  if (source == null) return null;
  final value = source.trim();
  final path = value.replaceFirst(_origin, '');
  final attachmentId = _attachmentPath.firstMatch(path)?.group(1);
  if (attachmentId != null) {
    final contentId = attachmentContentIds[attachmentId];
    return contentId == null ? null : normalizeMailContentId(contentId);
  }
  final reference = path.replaceFirst(_draftPrefix, '');
  if (!reference.toLowerCase().startsWith('cid:')) return null;
  try {
    final contentId = normalizeMailContentId(
      Uri.decodeComponent(reference.substring(4)),
    );
    return contentId.isEmpty ? null : contentId;
  } on Object {
    return null;
  }
}

/// The base raster image type an inline image may embed, or null.
String? mailInlineImageType(String? contentType) {
  final type = (contentType ?? '').split(';').first.trim().toLowerCase();
  return RegExp(r'^image/(png|jpeg|gif|webp|avif|bmp)$').hasMatch(type)
      ? type
      : null;
}

/// Inline attachment ids mapped to their Content-IDs.
Map<String, String> mailAttachmentContentIds(
  Iterable<Map<String, dynamic>> files,
) => {
  for (final file in files)
    if (file['disposition'] == 'inline' &&
        file['id'] is String &&
        (file['contentId'] as String?)?.trim().isNotEmpty == true)
      file['id'] as String: file['contentId'] as String,
};

/// Every normalized Content-ID that [html] references from an image.
Set<String> referencedMailContentIds(
  String html, {
  Map<String, String> attachmentContentIds = const {},
}) {
  if (html.isEmpty) return const {};
  final document = html_parser.parse(html);
  return document
      .querySelectorAll('img')
      .map(
        (image) => mailContentIdFromSource(
          image.attributes['src'],
          attachmentContentIds: attachmentContentIds,
        ),
      )
      .whereType<String>()
      .toSet();
}

final _imageSource = RegExp(
  r"""(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']*)\2""",
  caseSensitive: false,
);

/// Rewrites image sources that point at this message's own inline attachment
/// URLs to `cid:` references, matching how the web reader displays sent mail.
String rewriteMailInlineAttachmentUrls(
  String html,
  Map<String, String> attachmentContentIds,
) {
  if (attachmentContentIds.isEmpty) return html;
  return html.replaceAllMapped(_imageSource, (match) {
    final source = match.group(3)!;
    final path = source.trim().replaceFirst(_origin, '');
    final id = _attachmentPath.firstMatch(path)?.group(1);
    final contentId = id == null ? null : attachmentContentIds[id];
    if (contentId == null) return match.group(0)!;
    final cid = Uri.encodeComponent(
      contentId.trim().replaceAll(RegExp(r'^<|>$'), ''),
    );
    return '${match.group(1)}${match.group(2)}cid:$cid${match.group(2)}';
  });
}

/// An inline image attachment the message body references.
class MailInlineImageFile {
  const MailInlineImageFile({
    required this.contentId,
    required this.contentType,
    required this.file,
  });

  /// The normalized Content-ID the body references.
  final String contentId;

  /// The base raster type used for the embedded data URI.
  final String contentType;

  final Map<String, dynamic> file;
}

/// The attachments to fetch for [html]'s inline images, in attachment order.
///
/// Each image is at most 4 MB and the message total at most 8 MB; larger
/// images stay downloadable from the attachment list.
List<MailInlineImageFile> mailInlineImageFiles(
  String html,
  List<Map<String, dynamic>> files,
) {
  final referenced = referencedMailContentIds(
    html,
    attachmentContentIds: mailAttachmentContentIds(files),
  );
  final selected = <MailInlineImageFile>[];
  final seen = <String>{};
  var totalBytes = 0;
  for (final file in files) {
    final raw = file['contentId'] as String?;
    final cid = raw == null ? '' : normalizeMailContentId(raw);
    final type = mailInlineImageType(file['contentType'] as String?);
    final size = file['sizeBytes'] as num?;
    if (cid.isEmpty ||
        seen.contains(cid) ||
        !referenced.contains(cid) ||
        type == null ||
        file['id'] is! String ||
        size == null ||
        size <= 0 ||
        size > 4 * 1024 * 1024 ||
        totalBytes + size > 8 * 1024 * 1024) {
      continue;
    }
    seen.add(cid);
    totalBytes += size.toInt();
    selected.add(
      MailInlineImageFile(contentId: cid, contentType: type, file: file),
    );
    if (selected.length >= 12) break;
  }
  return selected;
}
