import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_html_body.dart';

/// Inline attachments use the authenticated API, never WebView credentials.
class MailMessageContent extends StatefulWidget {
  const MailMessageContent({
    required this.repository,
    required this.workspaceId,
    required this.mailboxId,
    required this.message,
    super.key,
  });

  final MailRepository repository;
  final String workspaceId;
  final String mailboxId;
  final Map<String, dynamic> message;

  @override
  State<MailMessageContent> createState() => _MailMessageContentState();
}

class _MailMessageContentState extends State<MailMessageContent> {
  Map<String, String> _images = const {};
  int _generation = 0;
  String get _html =>
      widget.message['bodyHtml'] as String? ??
      widget.message['sanitizedHtml'] as String? ??
      '';

  @override
  void initState() {
    super.initState();
    unawaited(_loadImages());
  }

  @override
  void didUpdateWidget(covariant MailMessageContent oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.message != widget.message ||
        oldWidget.workspaceId != widget.workspaceId ||
        oldWidget.mailboxId != widget.mailboxId ||
        oldWidget.repository != widget.repository) {
      _images = const {};
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
    var totalBytes = 0;
    var requests = 0;
    for (final file in mailRows(message['attachments'])) {
      final cid = (file['contentId'] as String?)?.replaceAll(
        RegExp(r'^<|>$'),
        '',
      );
      final type = (file['contentType'] as String? ?? '').toLowerCase();
      final size = file['sizeBytes'] as num?;
      if (cid == null ||
          !_html.contains('cid:$cid') ||
          !RegExp(r'^image/(png|jpeg|gif|webp|avif)$').hasMatch(type) ||
          size == null ||
          size <= 0 ||
          size > 4 * 1024 * 1024 ||
          totalBytes + size > 8 * 1024 * 1024) {
        continue;
      }
      if (!mounted || generation != _generation || requests >= 12) break;
      requests++;
      try {
        final bytes = await repository.attachment(
          workspaceId,
          mailboxId,
          message['id'] as String,
          file['id'] as String,
        );
        if (!mounted || generation != _generation) return;
        totalBytes += bytes.length;
        if (bytes.length > 4 * 1024 * 1024 || totalBytes > 8 * 1024 * 1024) {
          break;
        }
        images[cid] = 'data:$type;base64,${base64Encode(bytes)}';
      } on Object {
        // The reader's download action remains available.
      }
    }
    if (mounted && generation == _generation && images.isNotEmpty) {
      setState(() => _images = images);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text =
        widget.message['bodyText'] as String? ??
        widget.message['snippet'] as String? ??
        '';
    if (_html.isEmpty) return SelectableText(text);
    return MailHtmlBody(html: _html, inlineImages: _images, fallbackText: text);
  }
}
