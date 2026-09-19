import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_attachment_preview.dart';
import 'package:mobile/features/mail/view/mail_composer.dart';
import 'package:mobile/features/mail/view/mail_message_content.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:share_plus/share_plus.dart';

class MailReader extends StatefulWidget {
  const MailReader({
    required this.repository,
    required this.workspaceId,
    required this.mailboxId,
    required this.detail,
    required this.thread,
    required this.canSend,
    required this.fromAddress,
    this.signatureText,
    this.signatureHtml,
    super.key,
  });
  final MailRepository repository;
  final String workspaceId;
  final String mailboxId;
  final String fromAddress;
  final String? signatureText;
  final String? signatureHtml;
  final Map<String, dynamic> detail;
  final bool thread;
  final bool canSend;

  @override
  State<MailReader> createState() => _MailReaderState();
}

class _MailReaderState extends State<MailReader> {
  bool _busy = false;
  late bool _starred;
  List<Map<String, dynamic>> get _messages =>
      widget.thread ? mailRows(widget.detail['messages']) : [widget.detail];
  String get _id => widget.thread
      ? (widget.detail['thread'] as Map<String, dynamic>)['id'] as String
      : widget.detail['id'] as String;

  @override
  void initState() {
    super.initState();
    _starred = _messages.any((m) => m['starred'] == true);
    if (_messages.any((message) => message['unread'] == true)) {
      unawaited(_action('mark_read'));
    }
  }

  Future<void> _action(String action, {bool close = false}) async {
    setState(() => _busy = true);
    try {
      await widget.repository.changeState(
        widget.workspaceId,
        widget.mailboxId,
        _id,
        action,
        thread: widget.thread,
      );
      if (!mounted) return;
      if (close) {
        Navigator.of(context).pop();
        return;
      }
      if (action == 'star' || action == 'unstar') {
        setState(() => _starred = action == 'star');
      }
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(context.l10n.mailActionFailed)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reply(
    Map<String, dynamic> message, {
    bool all = false,
    bool forward = false,
  }) => Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (_) => MailComposer(
        repository: widget.repository,
        workspaceId: widget.workspaceId,
        mailboxId: widget.mailboxId,
        fromAddress: widget.fromAddress,
        signatureText: widget.signatureText,
        signatureHtml: widget.signatureHtml,
        reply: message,
        replyAll: all,
        forward: forward,
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final actions = {
      'archive': l10n.mailArchive,
      'mark_unread': l10n.mailMarkUnread,
      'restore': l10n.mailRestore,
      'trash': l10n.mailTrash,
    };
    final subject = widget.thread
        ? (widget.detail['thread'] as Map<String, dynamic>)['subject']
              as String?
        : widget.detail['subject'] as String?;
    return Scaffold(
      appBar: AppBar(
        title: Text(subject ?? l10n.mailNoSubject),
        actions: [
          IconButton(
            tooltip: _starred ? l10n.mailUnstar : l10n.mailStar,
            onPressed: _busy
                ? null
                : () => _action(_starred ? 'unstar' : 'star'),
            icon: Icon(_starred ? Icons.star : Icons.star_border),
          ),
          PopupMenuButton<String>(
            enabled: !_busy,
            onSelected: (action) => _action(action, close: true),
            itemBuilder: (_) => actions.entries
                .map((a) => PopupMenuItem(value: a.key, child: Text(a.value)))
                .toList(),
          ),
        ],
      ),
      body: ListView(
        padding: EdgeInsets.only(
          bottom: 16 + MediaQuery.paddingOf(context).bottom,
        ),
        children: [
          if (_busy) const LinearProgressIndicator(),
          for (final message in _messages)
            Card(
              margin: const EdgeInsets.only(bottom: 12),
              elevation: 0,
              shape: const RoundedRectangleBorder(),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SelectableText(
                      message['fromName'] as String? ??
                          message['fromAddress'] as String,
                    ),
                    SelectableText(message['fromAddress'] as String),
                    Text(
                      (message['sentAt'] ??
                                  message['receivedAt'] ??
                                  message['createdAt'])
                              as String? ??
                          '',
                    ),
                    Text(
                      mailRows(message['recipients'])
                          .where((r) => r['kind'] == 'to' || r['kind'] == 'cc')
                          .map((r) => r['address'] as String)
                          .join(', '),
                    ),
                    const Divider(),
                    MailMessageContent(
                      key: ValueKey(message['id']),
                      repository: widget.repository,
                      workspaceId: widget.workspaceId,
                      mailboxId: widget.mailboxId,
                      message: message,
                    ),
                    for (final file in mailRows(message['attachments']))
                      ListTile(
                        leading: const Icon(Icons.attach_file),
                        title: Text(file['filename'] as String),
                        onTap: _busy || !canPreviewMailAttachment(file)
                            ? null
                            : () => Navigator.of(context).push<void>(
                                MaterialPageRoute(
                                  builder: (_) => MailAttachmentPreview(
                                    repository: widget.repository,
                                    workspaceId: widget.workspaceId,
                                    mailboxId: widget.mailboxId,
                                    messageId: message['id'] as String,
                                    file: file,
                                  ),
                                ),
                              ),
                        trailing: IconButton(
                          tooltip: l10n.mailDownload,
                          onPressed: _busy
                              ? null
                              : () => _download(message, file),
                          icon: const Icon(Icons.download_outlined),
                        ),
                      ),
                    if (widget.canSend)
                      Wrap(
                        spacing: 8,
                        children: [
                          TextButton(
                            onPressed: () => _reply(message),
                            child: Text(l10n.mailReply),
                          ),
                          TextButton(
                            onPressed: () => _reply(message, all: true),
                            child: Text(l10n.mailReplyAll),
                          ),
                          TextButton(
                            onPressed: () => _reply(message, forward: true),
                            child: Text(l10n.mailForward),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _download(
    Map<String, dynamic> message,
    Map<String, dynamic> file,
  ) async {
    setState(() => _busy = true);
    try {
      final bytes = await widget.repository.attachment(
        widget.workspaceId,
        widget.mailboxId,
        message['id'] as String,
        file['id'] as String,
      );
      if (!mounted) return;
      final box = context.findRenderObject()! as RenderBox;
      await SharePlus.instance.share(
        ShareParams(
          files: [
            XFile.fromData(bytes, mimeType: file['contentType'] as String?),
          ],
          fileNameOverrides: [file['filename'] as String],
          sharePositionOrigin: box.localToGlobal(Offset.zero) & box.size,
        ),
      );
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.commonSomethingWentWrong)),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
