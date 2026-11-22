import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_attachment_preview.dart';
import 'package:mobile/features/mail/view/mail_document_request.dart';
import 'package:mobile/features/mail/view/mail_html_body.dart';
import 'package:mobile/features/mail/view/mail_inline_images.dart';
import 'package:mobile/features/mail/view/mail_invitation_card.dart';
import 'package:mobile/features/mail/view/mail_rendered_documents.dart';

/// Inline attachments use the authenticated API, never WebView credentials.
class MailMessageContent extends StatefulWidget {
  const MailMessageContent({
    required this.repository,
    required this.workspaceId,
    required this.mailboxId,
    required this.message,
    required this.threadId,
    this.imagesVisible,
    this.onImagesChanged,
    this.showControls = true,
    this.renderedDocuments,
    super.key,
  });

  final MailRepository repository;
  final String workspaceId;
  final String mailboxId;
  final Map<String, dynamic> message;
  final String threadId;
  final bool? imagesVisible;
  final ValueChanged<bool>? onImagesChanged;
  final bool showControls;
  final MailRenderedDocuments? renderedDocuments;

  @override
  State<MailMessageContent> createState() => _MailMessageContentState();
}

class _MailMessageContentState extends State<MailMessageContent> {
  Map<String, String> _images = const {};
  Map<String, Map<String, dynamic>> _imageFiles = const {};
  int _generation = 0;
  String? _actorId;
  String get _html => mailMessageHtml(widget.message);

  @override
  void initState() {
    super.initState();
    _actorId = currentCacheUserId();
    unawaited(_loadImages());
  }

  String _body(Map<String, dynamic> message) =>
      message['bodyHtml'] as String? ??
      message['sanitizedHtml'] as String? ??
      '';

  List<(Object?, Object?, Object?, Object?, Object?)> _attachmentIdentity(
    Map<String, dynamic> message,
  ) => [
    for (final file in mailRows(message['attachments']))
      (
        file['id'],
        file['contentId'],
        file['contentType'],
        file['sizeBytes'],
        file['disposition'],
      ),
  ];

  @override
  void didUpdateWidget(covariant MailMessageContent oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_actorId != currentCacheUserId() ||
        oldWidget.message['id'] != widget.message['id'] ||
        _body(oldWidget.message) != _body(widget.message) ||
        !listEquals(
          _attachmentIdentity(oldWidget.message),
          _attachmentIdentity(widget.message),
        ) ||
        oldWidget.workspaceId != widget.workspaceId ||
        oldWidget.mailboxId != widget.mailboxId ||
        oldWidget.threadId != widget.threadId ||
        oldWidget.repository != widget.repository) {
      _actorId = currentCacheUserId();
      _images = const {};
      _imageFiles = const {};
      unawaited(_loadImages());
    }
  }

  Future<void> _loadImages() async {
    final generation = ++_generation;
    final message = widget.message;
    final workspaceId = widget.workspaceId;
    final mailboxId = widget.mailboxId;
    final repository = widget.repository;
    final images = <String, String>{};
    final sources = <String, Map<String, dynamic>>{};
    var totalBytes = 0;
    for (final inline in mailInlineImageFiles(
      _html,
      mailRows(message['attachments']),
    )) {
      final file = inline.file;
      final cid = inline.contentId;
      if (!mounted || generation != _generation) return;
      try {
        final bytes = await repository.attachment(
          workspaceId,
          mailboxId,
          message['id'] as String,
          file['id'] as String,
          threadId: widget.threadId,
          cacheInlineImage: true,
        );
        if (!mounted || generation != _generation) return;
        totalBytes += bytes.length;
        if (bytes.length > 4 * 1024 * 1024 || totalBytes > 8 * 1024 * 1024) {
          break;
        }
        images[cid] =
            'data:${inline.contentType};base64,${base64Encode(bytes)}';
        sources[cid] = file;
      } on Object {
        // The reader's download action remains available.
      }
    }
    if (mounted && generation == _generation && images.isNotEmpty) {
      setState(() {
        _images = images;
        _imageFiles = sources;
      });
    }
  }

  void _openInlineImage(String contentId) {
    final file = _imageFiles[normalizeMailContentId(contentId)];
    if (file == null) return;
    unawaited(
      Navigator.of(context, rootNavigator: true).push(
        MaterialPageRoute<void>(
          fullscreenDialog: true,
          builder: (_) => MailAttachmentPreview(
            repository: widget.repository,
            workspaceId: widget.workspaceId,
            mailboxId: widget.mailboxId,
            messageId: widget.message['id'] as String,
            file: file,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text =
        widget.message['bodyText'] as String? ??
        widget.message['snippet'] as String? ??
        '';
    final body = _html.isEmpty
        ? SelectableText(text)
        : MailHtmlBody(
            html: _html,
            inlineImages: _images,
            onInlineImageTap: _openInlineImage,
            fallbackText: text,
            imagesVisible: widget.imagesVisible,
            onImagesChanged: widget.onImagesChanged,
            showControls: widget.showControls,
            renderedDocuments: widget.renderedDocuments,
          );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.message['direction'] == 'inbound')
          MailInvitationCard(
            key: ValueKey(
              '${widget.workspaceId}:${widget.mailboxId}:'
              '${widget.message['id']}',
            ),
            repository: widget.repository,
            workspaceId: widget.workspaceId,
            mailboxId: widget.mailboxId,
            messageId: widget.message['id'] as String,
          ),
        body,
      ],
    );
  }
}
