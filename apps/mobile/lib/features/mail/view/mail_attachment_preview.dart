import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:share_plus/share_plus.dart';

bool canPreviewMailAttachment(Map<String, dynamic> file) =>
    [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/bmp',
      'text/plain',
    ].contains(file['contentType']) ||
    (file['contentType'] == 'application/octet-stream' &&
        (file['filename'] as String).toLowerCase().endsWith('.txt'));

class MailAttachmentPreview extends StatefulWidget {
  const MailAttachmentPreview({
    required this.repository,
    required this.workspaceId,
    required this.mailboxId,
    required this.messageId,
    required this.file,
    super.key,
  });
  final MailRepository repository;
  final String workspaceId;
  final String mailboxId;
  final String messageId;
  final Map<String, dynamic> file;
  @override
  State<MailAttachmentPreview> createState() => _MailAttachmentPreviewState();
}

class _MailAttachmentPreviewState extends State<MailAttachmentPreview> {
  Uint8List? _bytes;
  bool _failed = false;
  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    try {
      final bytes = await widget.repository.attachment(
        widget.workspaceId,
        widget.mailboxId,
        widget.messageId,
        widget.file['id'] as String,
      );
      if (mounted) setState(() => _bytes = bytes);
    } on Object {
      if (mounted) setState(() => _failed = true);
    }
  }

  Future<void> _share() async {
    final box = context.findRenderObject()! as RenderBox;
    try {
      await SharePlus.instance.share(
        ShareParams(
          files: [
            XFile.fromData(
              _bytes!,
              mimeType: widget.file['contentType'] as String,
            ),
          ],
          fileNameOverrides: [widget.file['filename'] as String],
          sharePositionOrigin: box.localToGlobal(Offset.zero) & box.size,
        ),
      );
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(context.l10n.mailActionFailed)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bytes = _bytes;
    final image = (widget.file['contentType'] as String).startsWith('image/');
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.file['filename'] as String),
        actions: [
          IconButton(
            tooltip: context.l10n.mailDownload,
            onPressed: bytes == null ? null : _share,
            icon: const Icon(Icons.download_outlined),
          ),
        ],
      ),
      body: _failed
          ? Center(
              child: TextButton(
                onPressed: _load,
                child: Text(context.l10n.commonRetry),
              ),
            )
          : bytes == null
          ? const Center(child: NovaLoadingIndicator(size: 20))
          : image
          ? Center(
              child: InteractiveViewer(
                child: Image.memory(
                  bytes,
                  errorBuilder: (_, _, _) =>
                      Text(context.l10n.mailActionFailed),
                ),
              ),
            )
          : bytes.length > 1024 * 1024
          ? Center(
              child: TextButton(
                onPressed: _share,
                child: Text(context.l10n.mailDownload),
              ),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: SelectableText(utf8.decode(bytes, allowMalformed: true)),
            ),
    );
  }
}
